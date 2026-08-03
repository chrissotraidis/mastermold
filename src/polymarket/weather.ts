import {
  safeWeatherResearchReport,
  weatherPayloadSha256,
  weatherResearchStore,
  type WeatherResearchReport,
  type WeatherRuleCapture,
} from "./weather-research";

export type PolymarketWeatherBucket = {
  market_id: string;
  label: string;
  market_yes_price: number | null;
  raw_model_probability: number | null;
  raw_probability_gap: number | null;
  resolved_yes: boolean | null;
};

export type PolymarketWeatherEvent = {
  event_id: string;
  title: string;
  slug: string;
  end_date: string;
  temperature_kind: "maximum" | "minimum";
  resolution_source: string;
  station_code: string | null;
  station_name: string | null;
  bucket_count: number;
  liquidity_usd: number;
  fees_enabled: boolean;
  rules_status: "auditable" | "unsupported";
  rules_detail: string;
  forecast_status: "raw-ensemble" | "unavailable" | "not-attempted";
  model: "ECMWF IFS 0.25 ensemble" | null;
  member_count: number;
  top_bucket: PolymarketWeatherBucket | null;
  buckets: PolymarketWeatherBucket[];
  warning: string;
};

export type PolymarketWeatherReport = {
  status: "live" | "cached" | "unavailable";
  authority: "shadow-only";
  fetched_at: string | null;
  event_tag_id: 103040;
  events: PolymarketWeatherEvent[];
  research: WeatherResearchReport;
  detail: string;
};

type RawEvent = Record<string, unknown>;
type RawMarket = Record<string, unknown>;
type Station = { icaoId?: unknown; site?: unknown; lat?: unknown; lon?: unknown; elev?: unknown };

const DAILY_TEMPERATURE_TAG_ID = 103040;
const WEATHER_CACHE_MS = 5 * 60_000;
const MAX_EVENTS = 4;
let cache: { report: PolymarketWeatherReport; cached_at: number } | null = null;
let lastResolutionBackfillAt = 0;
let resolutionBackfill: Promise<void> | null = null;

export async function fetchPolymarketWeatherReport(force = false): Promise<PolymarketWeatherReport> {
  const now = Date.now();
  if (!force && cache && now - cache.cached_at < WEATHER_CACHE_MS) {
    return { ...cache.report, status: "cached", research: safeWeatherResearchReport() };
  }

  try {
    const url = new URL("https://gamma-api.polymarket.com/events");
    url.searchParams.set("tag_id", String(DAILY_TEMPERATURE_TAG_ID));
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("limit", "20");
    url.searchParams.set("end_date_min", new Date(now).toISOString());
    url.searchParams.set("order", "endDate");
    url.searchParams.set("ascending", "true");
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "MasterMold/0.1 (weather shadow research)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Gamma weather discovery returned ${response.status}.`);
    const body = await response.json() as unknown;
    if (!Array.isArray(body)) throw new Error("Gamma weather discovery returned an unexpected payload.");

    const parsed = body.map(parseWeatherEvent).filter((event): event is PolymarketWeatherEvent => event !== null).slice(0, MAX_EVENTS);
    for (const event of parsed) captureRule(event);
    const events = await Promise.all(parsed.map(enrichWeatherEvent));
    await backfillWeatherResolutions();
    const report: PolymarketWeatherReport = {
      status: "live",
      authority: "shadow-only",
      fetched_at: new Date().toISOString(),
      event_tag_id: DAILY_TEMPERATURE_TAG_ID,
      events,
      research: safeWeatherResearchReport(),
      detail: events.length > 0
        ? "Upcoming daily-temperature events were audited against their stated resolution source. Raw ensemble probabilities are research observations, not calibrated fair values or trade signals."
        : "No upcoming daily-temperature event with usable bucket metadata was returned.",
    };
    cache = { report, cached_at: now };
    return report;
  } catch (error) {
    if (cache) {
      return {
        ...cache.report,
        status: "cached",
        research: safeWeatherResearchReport(),
        detail: `Weather refresh failed; showing the last saved in-memory read. ${error instanceof Error ? error.message : "Unknown error."}`,
      };
    }
    return {
      status: "unavailable",
      authority: "shadow-only",
      fetched_at: null,
      event_tag_id: DAILY_TEMPERATURE_TAG_ID,
      events: [],
      research: safeWeatherResearchReport(),
      detail: error instanceof Error ? error.message : "Weather shadow read is unavailable.",
    };
  }
}

export function parseWeatherEvent(value: unknown): PolymarketWeatherEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawEvent;
  const id = text(raw.id);
  const title = text(raw.title);
  const slug = text(raw.slug);
  const endDate = text(raw.endDate);
  const description = text(raw.description);
  const markets = Array.isArray(raw.markets) ? raw.markets.filter((market): market is RawMarket => Boolean(market && typeof market === "object")) : [];
  if (!id || !title || !slug || !endDate || markets.length < 2) return null;

  const lower = title.toLowerCase();
  const temperatureKind = lower.startsWith("highest temperature") ? "maximum" : lower.startsWith("lowest temperature") ? "minimum" : null;
  if (!temperatureKind) return null;
  const source = text(raw.resolutionSource) || extractUrl(description);
  const stationCode = extractStationCode(source);
  const wholeDegrees = /whole degrees celsius/i.test(description);
  const bucketRows = markets.map(parseBucket).filter((bucket): bucket is PolymarketWeatherBucket => bucket !== null);
  if (bucketRows.length < 2) return null;
  const feesEnabled = markets.some((market) => market.feesEnabled === true || numeric(market.takerBaseFee) > 0 || Boolean(market.feeSchedule));
  const auditable = Boolean(stationCode && /wunderground\.com/i.test(source) && wholeDegrees);

  return {
    event_id: id,
    title,
    slug,
    end_date: endDate,
    temperature_kind: temperatureKind,
    resolution_source: source,
    station_code: stationCode,
    station_name: null,
    bucket_count: bucketRows.length,
    liquidity_usd: markets.reduce((sum, market) => sum + finiteOrZero(market.liquidityNum ?? market.liquidity), 0),
    fees_enabled: feesEnabled,
    rules_status: auditable ? "auditable" : "unsupported",
    rules_detail: auditable
      ? `Whole-degree ${temperatureKind} at Wunderground station ${stationCode}; exact station coordinates still need to match the forecast grid.`
      : "The current parser cannot prove a Wunderground ICAO station and whole-degree resolution rule, so no model probability is produced.",
    forecast_status: auditable ? "not-attempted" : "not-attempted",
    model: null,
    member_count: 0,
    top_bucket: null,
    buckets: bucketRows,
    warning: "Shadow only: raw ensembles are uncalibrated and do not include fees, executable depth, station anomalies, source revisions, or settlement risk.",
  };
}

async function enrichWeatherEvent(event: PolymarketWeatherEvent): Promise<PolymarketWeatherEvent> {
  if (event.rules_status !== "auditable" || !event.station_code) return event;
  try {
    const stationUrl = new URL("https://aviationweather.gov/api/data/stationinfo");
    stationUrl.searchParams.set("ids", event.station_code);
    stationUrl.searchParams.set("format", "json");
    const stationResponse = await fetch(stationUrl, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "MasterMold/0.1 (weather station audit)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!stationResponse.ok) throw new Error(`station lookup ${stationResponse.status}`);
    const stationBody = await stationResponse.json() as unknown;
    const station = Array.isArray(stationBody) ? stationBody[0] as Station | undefined : undefined;
    const latitude = numeric(station?.lat);
    const longitude = numeric(station?.lon);
    if (!station || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
      throw new Error("station coordinates missing");
    }
    const stationName = text(station.site) || event.station_code;

    const forecastUrl = new URL("https://ensemble-api.open-meteo.com/v1/ensemble");
    forecastUrl.searchParams.set("latitude", String(latitude));
    forecastUrl.searchParams.set("longitude", String(longitude));
    forecastUrl.searchParams.set("daily", event.temperature_kind === "maximum" ? "temperature_2m_max" : "temperature_2m_min");
    forecastUrl.searchParams.set("models", "ecmwf_ifs025");
    forecastUrl.searchParams.set("timezone", "auto");
    const targetDate = event.end_date.slice(0, 10);
    forecastUrl.searchParams.set("start_date", targetDate);
    forecastUrl.searchParams.set("end_date", targetDate);
    const forecastResponse = await fetch(forecastUrl, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "MasterMold/0.1 (weather shadow ensemble)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!forecastResponse.ok) throw new Error(`ensemble lookup ${forecastResponse.status}`);
    const forecast = await forecastResponse.json() as Record<string, unknown>;
    const daily = forecast.daily && typeof forecast.daily === "object" ? forecast.daily as Record<string, unknown> : {};
    const prefix = event.temperature_kind === "maximum" ? "temperature_2m_max_member" : "temperature_2m_min_member";
    const members = Object.entries(daily)
      .filter(([key]) => key.startsWith(prefix))
      .flatMap(([, value]) => Array.isArray(value) && Number.isFinite(Number(value[0])) ? [Number(value[0])] : []);
    if (members.length < 10) throw new Error("too few ensemble members");

    const buckets = event.buckets.map((bucket) => {
      const hits = members.filter((member) => bucketContains(bucket.label, member)).length;
      const rawProbability = hits / members.length;
      return {
        ...bucket,
        raw_model_probability: rawProbability,
        raw_probability_gap: bucket.market_yes_price === null ? null : rawProbability - bucket.market_yes_price,
      };
    });
    const topBucket = [...buckets].sort((a, b) => (b.raw_model_probability ?? -1) - (a.raw_model_probability ?? -1))[0] ?? null;
    const timezone = text(forecast.timezone) || null;
    const elevation = Number.isFinite(numeric(forecast.elevation)) ? numeric(forecast.elevation) : Number.isFinite(numeric(station.elev)) ? numeric(station.elev) : null;
    const ruleFingerprint = captureRule(event, {
      station_name: stationName,
      latitude,
      longitude,
      elevation_m: elevation,
      timezone,
    });
    try {
      weatherResearchStore().recordForecast({
        event_id: event.event_id,
        rule_fingerprint: ruleFingerprint,
        retrieved_at: new Date().toISOString(),
        target_date: targetDate,
        temperature_kind: event.temperature_kind,
        station_code: event.station_code,
        latitude,
        longitude,
        elevation_m: elevation,
        timezone,
        provider: "Open-Meteo Ensemble API",
        model: "ecmwf_ifs025",
        model_run_at: null,
        provenance_status: "partial",
        member_values_celsius: members,
        buckets,
        source_payload_sha256: weatherPayloadSha256(forecast),
      });
    } catch (error) {
      console.error("[mastermold] weather forecast capture failed:", error instanceof Error ? error.message : error);
    }
    return {
      ...event,
      station_name: stationName,
      forecast_status: "raw-ensemble",
      model: "ECMWF IFS 0.25 ensemble",
      member_count: members.length,
      top_bucket: topBucket,
      buckets,
      warning: "Shadow only: this raw ensemble capture has no stable model-run identifier, so it is archived but excluded from calibration and cannot open a position.",
    };
  } catch (error) {
    return {
      ...event,
      forecast_status: "unavailable",
      rules_detail: `${event.rules_detail} Forecast enrichment failed: ${error instanceof Error ? error.message : "unknown error"}.`,
    };
  }
}

function parseBucket(value: RawMarket): PolymarketWeatherBucket | null {
  const marketId = text(value.id);
  const label = text(value.groupItemTitle);
  if (!marketId || !label || !/-?\d+/.test(label)) return null;
  const prices = numberArray(value.outcomePrices);
  const marketYesPrice = prices.length > 0 && prices[0] >= 0 && prices[0] <= 1 ? prices[0] : null;
  const resolvedYes = prices.length >= 2 && prices[0] >= 0.999 && prices[1] <= 0.001
    ? true
    : prices.length >= 2 && prices[0] <= 0.001 && prices[1] >= 0.999
      ? false
      : null;
  return { market_id: marketId, label, market_yes_price: marketYesPrice, raw_model_probability: null, raw_probability_gap: null, resolved_yes: resolvedYes };
}

function captureRule(
  event: PolymarketWeatherEvent,
  station: Partial<Pick<WeatherRuleCapture, "station_name" | "latitude" | "longitude" | "elevation_m" | "timezone">> = {},
) {
  try {
    return weatherResearchStore().recordRule({
      event_id: event.event_id,
      event_slug: event.slug,
      event_title: event.title,
      target_date: event.end_date.slice(0, 10),
      temperature_kind: event.temperature_kind,
      resolution_source: event.resolution_source,
      station_code: event.station_code,
      station_name: station.station_name ?? event.station_name,
      latitude: station.latitude,
      longitude: station.longitude,
      elevation_m: station.elevation_m,
      timezone: station.timezone,
      rules_status: event.rules_status,
      rules_detail: event.rules_detail,
      buckets: event.buckets,
    });
  } catch (error) {
    console.error("[mastermold] weather rule capture failed:", error instanceof Error ? error.message : error);
    return "unavailable";
  }
}

async function backfillWeatherResolutions() {
  const now = Date.now();
  if (now - lastResolutionBackfillAt < 6 * 60 * 60_000) return;
  if (resolutionBackfill) return resolutionBackfill;
  resolutionBackfill = (async () => {
    try {
      const url = new URL("https://gamma-api.polymarket.com/events");
      url.searchParams.set("tag_id", String(DAILY_TEMPERATURE_TAG_ID));
      url.searchParams.set("closed", "true");
      url.searchParams.set("limit", "100");
      url.searchParams.set("order", "endDate");
      url.searchParams.set("ascending", "false");
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": "MasterMold/0.1 (weather resolution archive)" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`Gamma weather resolution archive returned ${response.status}.`);
      const payload = await response.json() as unknown;
      if (!Array.isArray(payload)) throw new Error("Gamma weather resolution archive returned an unexpected payload.");
      const retrievedAt = new Date().toISOString();
      for (const value of payload) {
        const event = parseWeatherEvent(value);
        if (!event) continue;
        captureRule(event);
        const winners = event.buckets.filter((bucket) => bucket.resolved_yes === true);
        if (winners.length !== 1) continue;
        const winner = winners[0];
        weatherResearchStore().recordResolution({
          event_id: event.event_id,
          target_date: event.end_date.slice(0, 10),
          temperature_kind: event.temperature_kind,
          station_code: event.station_code,
          winning_market_id: winner.market_id,
          winning_label: winner.label,
          exact_value_celsius: exactBucketValue(winner.label),
          resolved_at: null,
          retrieved_at: retrievedAt,
          source: "Polymarket Gamma final outcome prices",
          source_payload_sha256: weatherPayloadSha256(value),
        });
      }
      lastResolutionBackfillAt = now;
    } catch (error) {
      console.error("[mastermold] weather resolution backfill failed:", error instanceof Error ? error.message : error);
    } finally {
      resolutionBackfill = null;
    }
  })();
  return resolutionBackfill;
}

function exactBucketValue(label: string) {
  if (/or below|or lower|or less|or above|or higher|or more/i.test(label)) return null;
  const match = label.match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function bucketContains(label: string, value: number): boolean {
  const match = label.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return false;
  const threshold = Number(match[1]);
  const rounded = Math.round(value);
  if (/or below|or lower|or less/i.test(label)) return rounded <= threshold;
  if (/or above|or higher|or more/i.test(label)) return rounded >= threshold;
  return rounded === threshold;
}

function extractStationCode(source: string) {
  try {
    const tail = new URL(source).pathname.split("/").filter(Boolean).at(-1) ?? "";
    return /^[A-Z0-9]{4}$/i.test(tail) ? tail.toUpperCase() : null;
  } catch {
    return null;
  }
}

function extractUrl(value: string) {
  return value.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,]+$/, "") ?? "";
}

function numberArray(value: unknown): number[] {
  const parsed = Array.isArray(value) ? value : typeof value === "string" ? safeJsonArray(value) : [];
  return parsed.map(numeric);
}

function safeJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function finiteOrZero(value: unknown): number {
  const parsed = numeric(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function __resetPolymarketWeatherCacheForTests() {
  cache = null;
  lastResolutionBackfillAt = 0;
  resolutionBackfill = null;
}

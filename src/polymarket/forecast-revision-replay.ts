/**
 * P7 historical replay. Rebuilds past ECMWF HRES / GFS runs from Open-Meteo's
 * Single Runs archive for settled daily-temperature markets, applies the same
 * signal and matched-control rules as the live lane at each run's availability
 * time, and prices entries from Polymarket's public price history.
 *
 * Honest limits: price-history points carry no order-book depth, so fills are
 * optimistic (thin books cannot skip a trade); availability times are the
 * live-measured median delay (or a default) rather than per-run truth. A replay
 * can falsify the idea cheaply; it can never pass the live gate.
 */
import { takerFeeUsd, type FeeSchedule } from "./fees";
import {
  P7_MODELS,
  P7_RULE,
  controlOrder,
  controlTarget,
  fetchModelRun,
  fetchWeatherEvents,
  forecastRevisionStore,
  isDayAhead,
  localExtreme,
  locateStations,
  parseP7Event,
  revisionTarget,
  runInitIso,
  settlePnl,
  summarizeP7Cases,
  type P7Bucket,
  type P7CaseRecord,
  type P7Event,
  type P7Fill,
  type P7ReplayParams,
  type P7ReplayRecord,
  type P7ReplayTiming,
  type RunLocation,
} from "./forecast-revision";

export type PricePoint = { t: number; p: number };

/** Minutes between Open-Meteo availability and a polling bot acting on it. */
export const REPLAY_DETECTION_LATENCY_MIN = 2;
/** -60 is "moved in the hour before entry"; the rest are moves after entry. */
export const REPLAY_OFFSETS_MIN = [-60, 5, 15, 60, 120, 180];
const PRICE_STALE_MIN = 180;
const RUN_MS = 6 * 3_600_000;
/** Stay under Open-Meteo's free 5,000 location-calls per hour, leaving room for live capture. */
const OPEN_METEO_CALLS_PER_HOUR = 4_000;
const OPEN_METEO_RETRY_WAITS_MS = [60_000, 120_000, 300_000, 600_000];

type ReplaySpec = { id: string; label: string; delayHours: (initMs: number) => number; delayNote: number | string };

/**
 * Raw timing (P8): when the producers publish, measured 2026-10-10/11. NOMADS
 * GFS posts tomorrow's hours by about 3 h 47 min after the run starts; ECMWF
 * open data releases whole runs at about 7 h 34 min (00/12Z) and 6 h 27 min
 * (06/18Z). Values come from Open-Meteo's archive of the closest product:
 * ecmwf_ifs025 is the same open-data grid; ncep_gfs013 stands in for GFS 0.25°.
 */
const RAW_SPECS: ReplaySpec[] = [
  { id: "ecmwf_ifs025", label: "ECMWF open data 0.25° (producer timing)", delayHours: (ms) => (new Date(ms).getUTCHours() % 12 === 0 ? 7.57 : 6.45), delayNote: "7.57 (00/12Z), 6.45 (06/18Z)" },
  { id: "ncep_gfs013", label: "GFS (NOMADS timing)", delayHours: () => 3.8, delayNote: 3.8 },
];

/** Last price at or before atMs (no look-ahead); null if missing or stale. */
export function priceAsOf(history: PricePoint[], atMs: number, staleMin = PRICE_STALE_MIN): number | null {
  let low = 0;
  let high = history.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (history[middle].t * 1000 <= atMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0 || atMs - history[found].t * 1000 > staleMin * 60_000) return null;
  return history[found].p;
}

/** Same band and fee rule as the live lane, filled at the historical price plus slippage. */
export function replayFill(price: number | null, fee: FeeSchedule, slippage: number): P7Fill | { status: "skipped"; reason: "no_price"; best_ask: null } {
  if (price === null) return { status: "skipped", reason: "no_price", best_ask: null };
  if (price < P7_RULE.min_price || price > P7_RULE.max_price) return { status: "skipped", reason: "out_of_band", best_ask: price };
  const fillPrice = Math.min(0.99, price + slippage);
  const shares = P7_RULE.stake_usd / fillPrice;
  return { status: "filled", best_ask: price, avg_price: fillPrice, shares, cost_usd: P7_RULE.stake_usd, fee_usd: takerFeeUsd(shares, fillPrice, fee) };
}

export function replayLag(history: PricePoint[], entryMs: number, entryPrice: number) {
  const lag: Record<number, number | null> = {};
  for (const offset of REPLAY_OFFSETS_MIN) {
    const price = priceAsOf(history, entryMs + offset * 60_000);
    if (price === null) continue;
    lag[offset] = offset < 0 ? entryPrice - price : price - entryPrice;
  }
  return lag;
}

export type ReplayOptions = {
  days?: number;
  maxEvents?: number;
  models?: string[];
  timing?: P7ReplayTiming;
  slippageCents?: number;
  now?: Date;
  log?: (line: string) => void;
};

export async function runForecastRevisionReplay(options: ReplayOptions = {}): Promise<P7ReplayRecord> {
  const days = Math.max(1, Math.min(60, options.days ?? 7));
  const timing = options.timing ?? "open-meteo";
  const store = forecastRevisionStore();
  const allSpecs: ReplaySpec[] = timing === "raw"
    ? RAW_SPECS
    : P7_MODELS.map((model) => {
        const delay = store.availabilityDelayHours(model.id) ?? model.default_delay_hours;
        return { id: model.id, label: model.label, delayHours: () => delay, delayNote: delay };
      });
  const specs = options.models?.length ? allSpecs.filter((spec) => options.models!.includes(spec.id)) : allSpecs;
  const models = specs.map((spec) => spec.id);
  const slippage = (options.slippageCents ?? 1) / 100;
  const now = options.now ?? new Date();
  const log = options.log ?? (() => {});

  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const raw = await fetchWeatherEvents({ closed: "true", order: "endDate", ascending: "false" }, Math.min(40, Math.ceil(days * 1.2) + 1));
  let events = raw
    .map(parseP7Event)
    .filter((event): event is P7Event => event !== null && event.target_date >= cutoff && event.target_date < today)
    .filter((event) => event.buckets.filter((bucket) => bucket.resolved_yes === true).length === 1);
  if (options.maxEvents) events = events.slice(0, options.maxEvents);
  log(`${events.length} settled station markets from ${cutoff} to ${today}.`);

  const stations = await locateStations(events.map((event) => event.station_code));
  events = events.filter((event) => stations.has(event.station_code));
  const codes = [...new Set(events.map((event) => event.station_code))];
  const points = codes.map((code) => stations.get(code)!);
  log(`${codes.length} stations located.`);

  const histories = new Map<string, Promise<PricePoint[]>>();
  const history = (token: string, targetDate: string) => {
    if (!histories.has(token)) histories.set(token, fetchPriceHistory(token, targetDate));
    return histories.get(token)!;
  };

  const cases: P7CaseRecord[] = [];
  const delayHours: Record<string, number | string> = {};
  const paceMs = Math.ceil((points.length / OPEN_METEO_CALLS_PER_HOUR) * 3_600_000);
  // Markets list a day or two ahead, so runs before that could never be traded.
  const dates = events.map((event) => Date.parse(`${event.target_date}T00:00:00Z`));
  const initTimes: number[] = [];
  for (let ms = Math.floor((Math.min(...dates) - 2 * 86_400_000) / RUN_MS) * RUN_MS; ms <= Math.max(...dates); ms += RUN_MS) initTimes.push(ms);
  const total = initTimes.length * models.length;
  log(`Rebuilding ${total} model runs, one every ${Math.round(paceMs / 1000)}s (~${Math.round((total * paceMs) / 60_000)} min), to respect Open-Meteo's free-tier limits.`);
  for (const spec of specs) {
    const model = spec.id;
    delayHours[model] = spec.delayNote;
    const runs = new Map<number, Array<RunLocation | null>>();
    for (const ms of initTimes) {
      const started = Date.now();
      try {
        runs.set(ms, await fetchModelRun(model, ms, points, OPEN_METEO_RETRY_WAITS_MS));
      } catch (error) {
        log(`${spec.label} ${runInitIso(ms)} unavailable: ${error instanceof Error ? error.message : error}`);
      }
      if (runs.size % 8 === 0) log(`${spec.label}: ${runs.size}/${initTimes.length} runs rebuilt.`);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, paceMs - (Date.now() - started))));
    }
    log(`${spec.label}: ${runs.size}/${initTimes.length} runs rebuilt (availability assumed ${spec.delayNote}h after start).`);

    const value = (ms: number, event: P7Event) => {
      const location = runs.get(ms)?.[codes.indexOf(event.station_code)];
      return location ? localExtreme(location.hourly, event.target_date, event.kind) : null;
    };

    for (const ms of initTimes) {
      if (!runs.has(ms) || !runs.has(ms - RUN_MS)) continue;
      const initTime = runInitIso(ms);
      const entryMs = ms + spec.delayHours(ms) * 3_600_000 + REPLAY_DETECTION_LATENCY_MIN * 60_000;
      const located = events.flatMap((event) => {
        const location = runs.get(ms)![codes.indexOf(event.station_code)];
        if (!location || !isDayAhead(event.target_date, entryMs, location.utc_offset_seconds)) return [];
        const previous = value(ms - RUN_MS, event);
        const current = value(ms, event);
        return previous === null || current === null ? [] : [{ event, previous, current }];
      });
      const pick = (arm: "signal" | "control") => located.flatMap((row) => {
        const index = arm === "signal"
          ? revisionTarget(row.event, row.previous, row.current)
          : controlTarget(row.event, row.previous, row.current, `${model}|${initTime}|${row.event.event_id}`);
        return index === null ? [] : [{ ...row, bucket: row.event.buckets[index] }];
      });
      const signals = pick("signal");
      const controls = pick("control");
      const used = new Set<string>();
      // Warm every history this run may touch, in parallel (fetches are capped).
      await Promise.all([...signals, ...controls].map((row) => row.bucket.yes_token_id ? history(row.bucket.yes_token_id, row.event.target_date) : null));

      for (const signal of signals) {
        const id = `signal:${model}:${initTime}:${signal.event.event_id}`;
        const priced = await pricedCase(signal.event, signal.bucket, entryMs, slippage, history);
        cases.push(record(id, "signal", signal.event, entryMs, priced));
        if (priced.fill.status !== "filled") continue;
        for (const candidate of controlOrder(id, controls.filter((row) => !used.has(row.event.event_id)))) {
          const control = await pricedCase(candidate.event, candidate.bucket, entryMs, slippage, history);
          if (control.fill.status !== "filled") continue;
          used.add(candidate.event.event_id);
          cases.push(record(`control:${model}:${initTime}:${candidate.event.event_id}`, "control", candidate.event, entryMs, control));
          break;
        }
      }
    }
    log(`${spec.label}: ${cases.filter((row) => row.id.includes(model)).length} cases.`);
  }

  const summary = summarizeP7Cases(cases);
  const params: P7ReplayParams = {
    timing,
    days,
    models,
    events: events.length,
    slippage_cents: slippage * 100,
    delay_hours: delayHours,
    note: "Entries use Polymarket price-history points plus slippage. There is no order-book depth, so thin books never skip a trade and results are optimistic.",
  };
  store.recordReplay(params, summary);
  return { created_at: new Date().toISOString(), params, summary };
}

async function pricedCase(
  event: P7Event,
  bucket: P7Bucket,
  entryMs: number,
  slippage: number,
  history: (token: string, targetDate: string) => Promise<PricePoint[]>,
) {
  const points = bucket.yes_token_id ? await history(bucket.yes_token_id, event.target_date) : [];
  const entry = priceAsOf(points, entryMs);
  const fill = replayFill(entry, bucket.fee, slippage);
  return { bucket, fill, lag: entry === null ? {} : replayLag(points, entryMs, entry) };
}

function record(
  id: string,
  arm: "signal" | "control",
  event: P7Event,
  entryMs: number,
  priced: Awaited<ReturnType<typeof pricedCase>>,
): P7CaseRecord {
  const { fill, bucket } = priced;
  const won = bucket.resolved_yes === true;
  return {
    id,
    arm,
    model: id.split(":")[1],
    station_code: event.station_code,
    detected_at: new Date(entryMs).toISOString(),
    status: fill.status,
    skip_reason: fill.status === "skipped" ? fill.reason : null,
    cost_usd: fill.status === "filled" ? fill.cost_usd : null,
    fee_known: fill.status === "filled" && fill.fee_usd !== null,
    outcome: fill.status === "filled" ? (won ? "won" : "lost") : "pending",
    pnl_usd: fill.status === "filled" ? settlePnl(won, fill.shares, fill.cost_usd, fill.fee_usd) : null,
    lag: priced.lag,
  };
}

const MAX_PARALLEL_FETCHES = 8;
let activeFetches = 0;
const waiting: Array<() => void> = [];

async function fetchPriceHistory(token: string, targetDate: string): Promise<PricePoint[]> {
  if (activeFetches >= MAX_PARALLEL_FETCHES) await new Promise<void>((resolve) => waiting.push(resolve));
  activeFetches += 1;
  try {
    return await fetchPriceHistoryOnce(token, targetDate);
  } finally {
    activeFetches -= 1;
    waiting.shift()?.();
  }
}

async function fetchPriceHistoryOnce(token: string, targetDate: string): Promise<PricePoint[]> {
  const end = Date.parse(`${targetDate}T00:00:00Z`) / 1000;
  const url = new URL("https://clob.polymarket.com/prices-history");
  url.searchParams.set("market", token);
  url.searchParams.set("startTs", String(end - 4 * 86_400));
  url.searchParams.set("endTs", String(end + 86_400));
  url.searchParams.set("fidelity", "1");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": "MasterMold/0.1 (P7 replay)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      if (!response.ok) return [];
      const body = await response.json() as { history?: Array<{ t?: unknown; p?: unknown }> };
      return (body.history ?? [])
        .map((point) => ({ t: Number(point.t), p: Number(point.p) }))
        .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p))
        .sort((a, b) => a.t - b.t);
    } catch {
      // Retry transient network failures.
    }
  }
  return [];
}


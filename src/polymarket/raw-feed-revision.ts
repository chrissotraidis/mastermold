/**
 * P8 — raw-feed head start (shadow only).
 *
 * P7 reads model runs from Open-Meteo, which republishes them minutes to hours
 * after the producers do. P8 reads the producers directly, as each forecast step
 * lands: NOAA NOMADS GFS 0.25° (hourly 2 m temperature, posted hour by hour) and
 * ECMWF open data 0.25° (3-hourly 2 m max/min, released a run at a time). When
 * every step covering a market's station-local day has landed, P8 applies P7's
 * frozen rule against the previous raw run: paper fill at the live ask, matched
 * control, 5/15/60-minute book snapshots, settlement grading.
 *
 * The comparison with P7: for every P8 case, the head start is how many minutes
 * earlier P8 had the revision than Open-Meteo published the same run, and the
 * target bucket's book is snapshotted again at that Open-Meteo moment. If the
 * market moves during the head start, a faster feed captures something P7
 * cannot. Nothing here can place an order. See docs/P8-RAW-FEED-HEAD-START.md.
 */
import type { SqliteDatabase } from "@/src/autopilot/sqlite";

import { decodeGrib2, sampleNearest } from "./grib2";
import {
  fetchBooks,
  fetchModelMeta,
  fetchWeatherEvents,
  forecastRevisionStore,
  isDayAhead,
  locateStations,
  median,
  parseP7Event,
  recordRevisionBatch,
  runInitIso,
  serviceP7Ledger,
  summarizeP7Cases,
  type ForecastRevisionStore,
  type P7CycleResult,
  type P7Event,
  type P7ReplayRecord,
  type P7Summary,
  type RevisionRow,
} from "./forecast-revision";
import { summarizePolymarketBook } from "./orderbook";

export const RAW_FEEDS = [
  {
    id: "gfs_nomads",
    label: "GFS 0.25° (NOMADS)",
    open_meteo_model: "ncep_gfs013",
    step_hours: 1,
    first_step: 0,
    max_step: 120,
    fields: { maximum: "TMP:2 m above ground", minimum: "TMP:2 m above ground" },
  },
  {
    id: "ecmwf_open_data",
    label: "ECMWF open data 0.25°",
    open_meteo_model: "ecmwf_ifs",
    step_hours: 3,
    first_step: 3,
    max_step: 144,
    fields: { maximum: "mx2t3", minimum: "mn2t3" },
  },
] as const;
export type RawFeed = (typeof RAW_FEEDS)[number];

const HOUR_MS = 3_600_000;
const RUN_MS = 6 * HOUR_MS;
const MAX_DOWNLOADS_PER_CYCLE = 40;
const EVENTS_CACHE_MS = 10 * 60_000;
const SAMPLE_RETENTION_MS = 3 * 86_400_000;
const USER_AGENT = "MasterMold/0.1 (P8 raw-feed shadow research)";

export function p8Enabled(env: NodeJS.ProcessEnv = process.env) {
  return env.POLYMARKET_P8 !== "0";
}

// ---------------------------------------------------------------------------
// Time

/** Seconds east of UTC for an IANA zone at an instant (DST-aware). */
export function utcOffsetSeconds(timeZone: string, atMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(atMs / 1000) * 1000) / 1000);
}

/** UTC instants of local midnight starting and ending a station-local date. */
export function localDayBounds(date: string, timeZone: string) {
  const midnight = (day: string) => {
    const guess = Date.parse(`${day}T00:00:00Z`);
    return guess - utcOffsetSeconds(timeZone, guess - utcOffsetSeconds(timeZone, guess) * 1000) * 1000;
  };
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { start: midnight(date), end: midnight(next) };
}

/**
 * Forecast steps covering a local day. Hourly instantaneous values (GFS): every
 * hour inside the day. Three-hour max/min windows (ECMWF, (s−3, s]): every
 * window overlapping the day. Null when the run does not reach the day.
 */
export function windowSteps(feed: Pick<RawFeed, "step_hours" | "first_step" | "max_step">, initMs: number, dayStart: number, dayEnd: number): number[] | null {
  const stepMs = feed.step_hours * HOUR_MS;
  const first = feed.step_hours === 1
    ? Math.ceil((dayStart - initMs) / HOUR_MS)
    : (Math.floor((dayStart - initMs) / stepMs) + 1) * feed.step_hours;
  const last = feed.step_hours === 1
    ? Math.floor((dayEnd - 1 - initMs) / HOUR_MS)
    : Math.ceil((dayEnd - initMs) / stepMs) * feed.step_hours;
  if (first < feed.first_step || last > feed.max_step || last < first) return null;
  const steps: number[] = [];
  for (let step = first; step <= last; step += feed.step_hours) steps.push(step);
  return steps;
}

// ---------------------------------------------------------------------------
// Producers

function ymd(ms: number) {
  return new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");
}
function hh(ms: number) {
  return new Date(ms).toISOString().slice(11, 13);
}

export function gribUrl(feed: RawFeed, initMs: number, step: number) {
  if (feed.id === "gfs_nomads") {
    return `https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.${ymd(initMs)}/${hh(initMs)}/atmos/gfs.t${hh(initMs)}z.pgrb2.0p25.f${String(step).padStart(3, "0")}`;
  }
  return `https://data.ecmwf.int/forecasts/${ymd(initMs)}/${hh(initMs)}z/ifs/0p25/oper/${ymd(initMs)}${hh(initMs)}0000-${step}h-oper-fc.grib2`;
}

function indexUrl(feed: RawFeed, initMs: number, step: number) {
  return feed.id === "gfs_nomads" ? `${gribUrl(feed, initMs, step)}.idx` : gribUrl(feed, initMs, step).replace(/\.grib2$/, ".index");
}

/** Byte ranges (inclusive) by field name, from a NOMADS .idx file. */
export function parseNomadsIndex(body: string): Map<string, [number, number | null]> {
  const lines = body.split("\n").filter(Boolean).map((line) => line.split(":"));
  const out = new Map<string, [number, number | null]>();
  lines.forEach((parts, index) => {
    const key = `${parts[3]}:${parts[4]}`;
    const next = lines[index + 1];
    if (!out.has(key)) out.set(key, [Number(parts[1]), next ? Number(next[1]) - 1 : null]);
  });
  return out;
}

/** Byte ranges (inclusive) by param, from an ECMWF open-data .index file (JSON lines). */
export function parseEcmwfIndex(body: string): Map<string, [number, number | null]> {
  const out = new Map<string, [number, number | null]>();
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { param?: string; levtype?: string; _offset?: number; _length?: number };
    if (row.param && row.levtype === "sfc" && typeof row._offset === "number" && typeof row._length === "number" && !out.has(row.param)) {
      out.set(row.param, [row._offset, row._offset + row._length - 1]);
    }
  }
  return out;
}

/** The step's index, or null while it has not been published. */
export async function fetchStepIndex(feed: RawFeed, initMs: number, step: number) {
  const response = await fetch(indexUrl(feed, initMs, step), {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new Error(`${feed.label} index +${step}h returned ${response.status}.`);
  const body = await response.text();
  return feed.id === "gfs_nomads" ? parseNomadsIndex(body) : parseEcmwfIndex(body);
}

async function fetchField(url: string, [start, end]: [number, number | null]) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT, Range: `bytes=${start}-${end ?? ""}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status !== 206 && response.status !== 200) throw new Error(`GRIB range request returned ${response.status}.`);
  return decodeGrib2(new Uint8Array(await response.arrayBuffer()));
}

// ---------------------------------------------------------------------------
// Storage (P8 tables live in the P7 ledger)

const prepared = new WeakSet<SqliteDatabase>();

function tables(store: ForecastRevisionStore) {
  const db = store.db;
  if (!prepared.has(db)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS p8_samples (
        feed TEXT NOT NULL, init_time TEXT NOT NULL, step INTEGER NOT NULL, field TEXT NOT NULL,
        station_code TEXT NOT NULL, value_c REAL NOT NULL, PRIMARY KEY (feed, init_time, step, field, station_code)
      );
      CREATE TABLE IF NOT EXISTS p8_steps (
        feed TEXT NOT NULL, init_time TEXT NOT NULL, step INTEGER NOT NULL, field TEXT NOT NULL,
        fetched_at TEXT NOT NULL, PRIMARY KEY (feed, init_time, step, field)
      );
      CREATE TABLE IF NOT EXISTS p8_zones (station_code TEXT PRIMARY KEY, timezone TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS p8_headstart (
        case_id TEXT PRIMARY KEY, status TEXT NOT NULL, open_meteo_available_at TEXT, head_start_min REAL,
        best_ask REAL, midpoint REAL, taken_at TEXT
      );
    `);
    prepared.add(db);
  }
  return db;
}

function runSource(db: SqliteDatabase, feed: string, initTime: string) {
  const row = db.prepare("SELECT source FROM p7_model_runs WHERE model = ? AND init_time = ?").get(feed, initTime) as { source?: string } | undefined;
  return row?.source ?? null;
}

function setRunSource(db: SqliteDatabase, feed: string, initTime: string, source: string, at: string) {
  db.prepare("UPDATE p7_model_runs SET source = ?, detected_at = ? WHERE model = ? AND init_time = ?").run(source, at, feed, initTime);
}

function hasStep(db: SqliteDatabase, feed: string, initTime: string, step: number, field: string) {
  return Boolean(db.prepare("SELECT 1 AS ok FROM p8_steps WHERE feed = ? AND init_time = ? AND step = ? AND field = ?").get(feed, initTime, step, field));
}

function sample(db: SqliteDatabase, feed: string, initTime: string, step: number, field: string, station: string): number | null {
  const row = db.prepare(
    "SELECT value_c FROM p8_samples WHERE feed = ? AND init_time = ? AND step = ? AND field = ? AND station_code = ?",
  ).get(feed, initTime, step, field, station) as { value_c?: number } | undefined;
  return typeof row?.value_c === "number" ? row.value_c : null;
}

// ---------------------------------------------------------------------------
// Station time zones (fetched once per station from Open-Meteo, then stored)

async function stationZones(store: ForecastRevisionStore, stations: Map<string, { latitude: number; longitude: number }>) {
  const db = tables(store);
  const zones = new Map<string, string>();
  for (const row of db.prepare("SELECT station_code, timezone FROM p8_zones").all() as Array<{ station_code: string; timezone: string }>) {
    zones.set(row.station_code, row.timezone);
  }
  const missing = [...stations.keys()].filter((code) => !zones.has(code));
  for (let start = 0; start < missing.length; start += 50) {
    const chunk = missing.slice(start, start + 50);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", chunk.map((code) => stations.get(code)!.latitude).join(","));
    url.searchParams.set("longitude", chunk.map((code) => stations.get(code)!.longitude).join(","));
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "1");
    url.searchParams.set("daily", "temperature_2m_max");
    const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Open-Meteo time-zone lookup returned ${response.status}.`);
    const body = await response.json() as unknown;
    const rows = (Array.isArray(body) ? body : [body]) as Array<{ timezone?: string }>;
    chunk.forEach((code, index) => {
      const timeZone = rows[index]?.timezone;
      if (!timeZone) return;
      db.prepare("INSERT OR REPLACE INTO p8_zones (station_code, timezone) VALUES (?, ?)").run(code, timeZone);
      zones.set(code, timeZone);
    });
  }
  return zones;
}

// ---------------------------------------------------------------------------
// Live cycle

let eventsCache: { at: number; events: P7Event[] } | null = null;

export async function runRawFeedCycle(now = new Date()): Promise<P7CycleResult> {
  if (!p8Enabled()) return { action: "idle", detail: "P8 is off (POLYMARKET_P8=0)." };
  try {
    const store = forecastRevisionStore();
    const db = tables(store);
    await serviceP7Ledger(store, now);
    if (!eventsCache || now.getTime() - eventsCache.at > EVENTS_CACHE_MS) {
      const events = (await fetchWeatherEvents({ active: "true", closed: "false", order: "endDate", ascending: "true" }))
        .map(parseP7Event)
        .filter((event): event is P7Event => event !== null);
      eventsCache = { at: now.getTime(), events };
    }
    const stations = await locateStations(eventsCache.events.map((event) => event.station_code));
    const zones = await stationZones(store, stations);
    const events = eventsCache.events.filter((event) => stations.has(event.station_code) && zones.has(event.station_code));

    const budget = { downloads: MAX_DOWNLOADS_PER_CYCLE };
    const details: string[] = [];
    const errors: string[] = [];
    const latest = Math.floor(now.getTime() / RUN_MS) * RUN_MS;
    for (const feed of RAW_FEEDS) {
      try {
        for (const initMs of [latest - RUN_MS, latest]) {
          const detail = await advanceRun(store, feed, initMs, events, stations, zones, now, budget);
          if (detail) details.push(detail);
        }
        await recordHeadStarts(store, feed, now);
      } catch (error) {
        // One producer's outage must not block the other.
        errors.push(`${feed.label}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    db.prepare("DELETE FROM p8_samples WHERE init_time < ?").run(runInitIso(now.getTime() - SAMPLE_RETENTION_MS));
    if (details.length) return { action: "captured", detail: [...details, ...errors].join(" ") };
    return errors.length ? { action: "error", detail: errors.join(" ") } : { action: "waiting", detail: "No new forecast steps yet." };
  } catch (error) {
    return { action: "error", detail: error instanceof Error ? error.message : "Unknown P8 error." };
  }
}

type Plan = { event: P7Event; steps: number[]; field: string };

async function advanceRun(
  store: ForecastRevisionStore,
  feed: RawFeed,
  initMs: number,
  events: P7Event[],
  stations: Map<string, { latitude: number; longitude: number }>,
  zones: Map<string, string>,
  now: Date,
  budget: { downloads: number },
): Promise<string | null> {
  const db = tables(store);
  const initTime = runInitIso(initMs);
  const previousTime = runInitIso(initMs - RUN_MS);
  const plans: Plan[] = events.flatMap((event) => {
    const zone = zones.get(event.station_code)!;
    if (!isDayAhead(event.target_date, now.getTime(), utcOffsetSeconds(zone, now.getTime()))) return [];
    if (store.forecast(feed.id, initTime, event.station_code, event.target_date, event.kind) !== null) return [];
    const { start, end } = localDayBounds(event.target_date, zone);
    const steps = windowSteps(feed, initMs, start, end);
    return steps ? [{ event, steps, field: feed.fields[event.kind] }] : [];
  });
  if (plans.length === 0) return null;

  const needed = [...new Map(plans.flatMap((plan) => plan.steps.map((step) => [`${step}|${plan.field}`, { step, field: plan.field }] as const))).values()]
    .sort((a, b) => a.step - b.step || a.field.localeCompare(b.field));
  const missing = needed.filter((pair) => !hasStep(db, feed.id, initTime, pair.step, pair.field));
  const indexes = new Map<number, Map<string, [number, number | null]> | null>();
  const index = async (step: number) => {
    if (!indexes.has(step)) indexes.set(step, await fetchStepIndex(feed, initMs, step));
    return indexes.get(step)!;
  };

  let source = runSource(db, feed.id, initTime);
  if (!source) {
    // First sight of this run: if its first step is already out we joined late,
    // so this run can only serve as the baseline for the next one.
    source = (await index((missing[0] ?? needed[0]).step)) ? "stale" : "tracking";
    store.recordRun(feed.id, initTime, null, source as "stale", now.toISOString());
  }

  const codes = [...stations.keys()];
  for (const pair of missing) {
    if (budget.downloads <= 0) break;
    const ranges = await index(pair.step);
    if (!ranges) break; // not landed yet; later steps will not be either
    const range = ranges.get(pair.field);
    if (!range) throw new Error(`${initTime}Z +${pair.step}h has no ${pair.field} record.`);
    const field = await fetchField(gribUrl(feed, initMs, pair.step), range);
    budget.downloads -= 1;
    const insert = db.prepare("INSERT OR REPLACE INTO p8_samples (feed, init_time, step, field, station_code, value_c) VALUES (?, ?, ?, ?, ?, ?)");
    for (const code of codes) {
      const station = stations.get(code)!;
      insert.run(feed.id, initTime, pair.step, pair.field, code, sampleNearest(field, station.latitude, station.longitude) - 273.15);
    }
    db.prepare("INSERT OR REPLACE INTO p8_steps (feed, init_time, step, field, fetched_at) VALUES (?, ?, ?, ?, ?)")
      .run(feed.id, initTime, pair.step, pair.field, now.toISOString());
  }

  const rows: RevisionRow[] = [];
  let completed = 0;
  for (const plan of plans) {
    const values = plan.steps.map((step) => sample(db, feed.id, initTime, step, plan.field, plan.event.station_code));
    if (values.some((value) => value === null)) continue;
    const current = plan.event.kind === "maximum" ? Math.max(...(values as number[])) : Math.min(...(values as number[]));
    store.recordForecast(feed.id, initTime, plan.event.station_code, plan.event.target_date, plan.event.kind, current);
    completed += 1;
    const previous = store.forecast(feed.id, previousTime, plan.event.station_code, plan.event.target_date, plan.event.kind);
    if (previous !== null) rows.push({ event: plan.event, previous, current });
  }
  if (completed === 0) return null;
  if (source !== "tracking" && source !== "live") {
    return `${feed.label} ${initTime}Z: ${completed} station forecasts stored as the baseline (joined after the run was published).`;
  }
  if (source === "tracking") setRunSource(db, feed.id, initTime, "live", now.toISOString());
  const result = await recordRevisionBatch(store, { model: feed.id, initTime, detectedAt: now.toISOString(), availableAt: null, rows });
  return `${feed.label} ${initTime}Z: ${completed} station forecasts complete, ${rows.length} comparable, ${result.signals} revisions, ${result.filled} paper fills, ${result.controls} matched controls.`;
}

/** Compares each P8 case's detection with the moment Open-Meteo published the same run. */
async function recordHeadStarts(store: ForecastRevisionStore, feed: RawFeed, now: Date) {
  const db = tables(store);
  const pending = db.prepare(`
    SELECT c.id, c.init_time, c.detected_at, c.target_token_id FROM p7_cases c
    LEFT JOIN p8_headstart h ON h.case_id = c.id
    WHERE c.model = ? AND h.case_id IS NULL
  `).all(feed.id) as Array<{ id: string; init_time: string; detected_at: string; target_token_id: string | null }>;
  if (pending.length === 0) return;
  const meta = await fetchModelMeta(feed.open_meteo_model);
  const write = db.prepare(
    "INSERT OR IGNORE INTO p8_headstart (case_id, status, open_meteo_available_at, head_start_min, best_ask, midpoint, taken_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const ready = pending.filter((row) => Date.parse(`${row.init_time}:00Z`) <= meta.init_ms);
  const books = await fetchBooks(ready.flatMap((row) => {
    const sameRun = Date.parse(`${row.init_time}:00Z`) === meta.init_ms;
    return sameRun && meta.available_ms !== null && meta.available_ms > Date.parse(row.detected_at) && row.target_token_id ? [row.target_token_id] : [];
  }));
  for (const row of ready) {
    const initMs = Date.parse(`${row.init_time}:00Z`);
    if (initMs < meta.init_ms || meta.available_ms === null) {
      // Open-Meteo moved past this run before we saw it publish: no comparison.
      if (initMs < meta.init_ms) write.run(row.id, "missed", null, null, null, null, null);
      continue;
    }
    const availableAt = new Date(meta.available_ms).toISOString();
    const headStart = Math.round(((meta.available_ms - Date.parse(row.detected_at)) / 60_000) * 10) / 10;
    if (headStart <= 0) {
      write.run(row.id, "open_meteo_first", availableAt, headStart, null, null, null);
      continue;
    }
    const book = row.target_token_id ? books.get(row.target_token_id) : undefined;
    const metrics = book ? summarizePolymarketBook(book) : null;
    write.run(row.id, "raw_first", availableAt, headStart, metrics?.best_ask ?? null, metrics?.midpoint ?? null, now.toISOString());
  }
}

// ---------------------------------------------------------------------------
// Report

export type RawFeedHeadStart = {
  compared: number;
  raw_first: number;
  open_meteo_first: number;
  missed: number;
  median_head_start_min: number | null;
  signal_move_cents: number | null;
  control_move_cents: number | null;
  n_signal: number;
  n_control: number;
};

export type RawFeedReport = {
  enabled: boolean;
  authority: "shadow-only";
  feeds: Array<{ feed: string; label: string; open_meteo_model: string; latest_init: string | null; live_runs: number; head_start: RawFeedHeadStart }>;
  summary: P7Summary;
  replay: P7ReplayRecord | null;
  error: string | null;
};

export function safeRawFeedReport(): RawFeedReport {
  try {
    const store = forecastRevisionStore();
    const db = tables(store);
    return {
      enabled: p8Enabled(),
      authority: "shadow-only",
      feeds: RAW_FEEDS.map((feed) => {
        const runs = db.prepare("SELECT MAX(init_time) AS latest, COUNT(*) AS runs FROM p7_model_runs WHERE model = ? AND source = 'live'").get(feed.id) as
          { latest: string | null; runs: number };
        return { feed: feed.id, label: feed.label, open_meteo_model: feed.open_meteo_model, latest_init: runs.latest, live_runs: runs.runs, head_start: headStartFor(db, feed.id) };
      }),
      summary: summarizeP7Cases(store.caseRecords(RAW_FEEDS.map((feed) => feed.id))),
      replay: store.latestReplay("raw"),
      error: null,
    };
  } catch (error) {
    return {
      enabled: p8Enabled(),
      authority: "shadow-only",
      feeds: [],
      summary: summarizeP7Cases([]),
      replay: null,
      error: error instanceof Error ? error.message : "P8 ledger unavailable.",
    };
  }
}

/** Head-start counts and the mean move of the target bucket between P8's entry and Open-Meteo's publication. */
export function headStartFor(db: SqliteDatabase, feed: string): RawFeedHeadStart {
  const rows = db.prepare(`
    SELECT c.arm, h.status, h.head_start_min, h.midpoint AS later, s.midpoint AS entry
    FROM p8_headstart h JOIN p7_cases c ON c.id = h.case_id
    LEFT JOIN p7_snapshots s ON s.case_id = c.id AND s.offset_min = 0 AND s.status = 'taken'
    WHERE c.model = ?
  `).all(feed) as Array<{ arm: string; status: string; head_start_min: number | null; later: number | null; entry: number | null }>;
  const compared = rows.filter((row) => row.head_start_min !== null);
  const moves = (arm: string) => rows
    .filter((row) => row.arm === arm && row.status === "raw_first" && row.later !== null && row.entry !== null)
    .map((row) => (row.later as number) - (row.entry as number));
  const signal = moves("signal");
  const control = moves("control");
  const mean = (values: number[]) => values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10_000) / 100 : null;
  return {
    compared: compared.length,
    raw_first: rows.filter((row) => row.status === "raw_first").length,
    open_meteo_first: rows.filter((row) => row.status === "open_meteo_first").length,
    missed: rows.filter((row) => row.status === "missed").length,
    median_head_start_min: compared.length ? Math.round(median(compared.map((row) => row.head_start_min as number)) * 10) / 10 : null,
    signal_move_cents: mean(signal),
    control_move_cents: mean(control),
    n_signal: signal.length,
    n_control: control.length,
  };
}

export function __resetRawFeedForTests() {
  eventsCache = null;
}


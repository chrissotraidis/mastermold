/**
 * P7 — forecast-revision lag (shadow only).
 *
 * Hypothesis under test: when a new ECMWF or GFS run moves tomorrow's station
 * high/low by at least 0.5 °C, the bucket one step toward the new forecast is
 * briefly underpriced. Each revision is recorded as a $25 paper fill at the
 * executable ask, paired with a control from the same model run (an event
 * whose forecast did NOT move, buying its adjacent bucket under the same band,
 * stake and fee rules), and followed by order-book snapshots that measure how
 * fast the price catches up.
 *
 * Nothing here can place, sign or route an order. Paper fills live only in this
 * research ledger and never touch the Polymarket paper account. See
 * docs/P7-FORECAST-REVISION.md for the pre-registered gate.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { SqliteDatabase } from "@/src/autopilot/sqlite";

import { parseFeeSchedule, takerFeeUsd, type FeeSchedule } from "./fees";
import { fetchPolymarketOrderBooks, quotePolymarketPaperBuy, summarizePolymarketBook, type PolymarketOrderBook } from "./orderbook";
import { openPolymarketSqlite } from "./sqlite";
import { lookupStation, weatherStationCode } from "./weather";

export const P7_MODELS = [
  { id: "ecmwf_ifs", label: "ECMWF IFS HRES", default_delay_hours: 6.9 },
  { id: "ncep_gfs013", label: "GFS 0.11°", default_delay_hours: 5.5 },
] as const;
export type P7ModelId = (typeof P7_MODELS)[number]["id"];

/** The trading rule from the source idea, frozen before any data is collected. */
export const P7_RULE = {
  min_shift_c: 0.5,
  stake_usd: 25,
  min_price: 0.05,
  max_price: 0.6,
  snapshot_offsets_min: [5, 15, 60],
} as const;

/** Pre-registered gate. Passing it earns a human conversation, nothing more. */
export const P7_GATE = { min_graded_signals: 150, min_stations: 20, min_days: 14 } as const;

const RUN_INTERVAL_HOURS = 6;
/** A run first seen later than this (cold start, outage) is a stale test of lag: baseline only. */
const MAX_DETECTION_DELAY_MIN = 30;
const SNAPSHOT_GRACE_MIN = 20;
const GRADE_EVERY_MS = 30 * 60_000;
const DAILY_TEMPERATURE_TAG_ID = 103040;
const USER_AGENT = "MasterMold/0.1 (P7 forecast-revision shadow research)";

// ---------------------------------------------------------------------------
// Market parsing

export type P7Unit = "C" | "F";
export type P7Bucket = {
  market_id: string;
  label: string;
  lo: number;
  hi: number;
  yes_token_id: string | null;
  fee: FeeSchedule;
  resolved_yes: boolean | null;
};
export type P7Event = {
  event_id: string;
  slug: string;
  title: string;
  target_date: string;
  kind: "maximum" | "minimum";
  unit: P7Unit;
  station_code: string;
  buckets: P7Bucket[];
};

/** "23°C" → [23,23]; "60-61°F" → [60,61]; "22°C or below" → (-∞,22]. */
export function parseBucketRange(label: string): { lo: number; hi: number; unit: P7Unit } | null {
  const unit = /°\s*F/i.test(label) ? "F" : /°\s*C/i.test(label) ? "C" : null;
  if (!unit) return null;
  const range = label.match(/(-?\d+)\s*(?:-|–|to)\s*(-?\d+)/);
  if (range) return { lo: Number(range[1]), hi: Number(range[2]), unit };
  const single = label.match(/-?\d+/);
  if (!single) return null;
  const value = Number(single[0]);
  if (/or (below|lower|less)/i.test(label)) return { lo: -Infinity, hi: value, unit };
  if (/or (above|higher|more)/i.test(label)) return { lo: value, hi: Infinity, unit };
  return { lo: value, hi: value, unit };
}

export function parseP7Event(value: unknown): P7Event | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = text(raw.title);
  const kind = /^highest temperature/i.test(title) ? "maximum" : /^lowest temperature/i.test(title) ? "minimum" : null;
  const endDate = text(raw.endDate);
  if (!kind || !text(raw.id) || !endDate) return null;
  const source = text(raw.resolutionSource) || (text(raw.description).match(/https?:\/\/[^\s)]+/i)?.[0] ?? "");
  if (!/wunderground\.com|weather\.gov/i.test(source)) return null;
  const stationCode = weatherStationCode(source);
  if (!stationCode) return null;

  const markets = Array.isArray(raw.markets) ? raw.markets as Array<Record<string, unknown>> : [];
  const buckets: P7Bucket[] = [];
  let unit: P7Unit | null = null;
  for (const market of markets) {
    const label = text(market.groupItemTitle);
    const range = parseBucketRange(label);
    if (!range || !text(market.id)) return null;
    if (unit && unit !== range.unit) return null;
    unit = range.unit;
    const tokens = stringArray(market.clobTokenIds);
    const prices = stringArray(market.outcomePrices).map(Number);
    buckets.push({
      market_id: text(market.id),
      label,
      lo: range.lo,
      hi: range.hi,
      yes_token_id: tokens[0] ?? null,
      fee: parseFeeSchedule(market),
      resolved_yes: prices.length >= 2 && prices[0] >= 0.999 ? true : prices.length >= 2 && prices[0] <= 0.001 && prices[1] >= 0.999 ? false : null,
    });
  }
  if (!unit || buckets.length < 2) return null;
  buckets.sort((a, b) => a.lo - b.lo);
  return {
    event_id: text(raw.id),
    slug: text(raw.slug),
    title,
    target_date: endDate.slice(0, 10),
    kind,
    unit,
    station_code: stationCode,
    buckets,
  };
}

export function toUnit(celsius: number, unit: P7Unit) {
  return unit === "F" ? celsius * 9 / 5 + 32 : celsius;
}

export function bucketIndex(event: Pick<P7Event, "buckets" | "unit">, celsius: number) {
  const value = Math.round(toUnit(celsius, event.unit));
  return event.buckets.findIndex((bucket) => value >= bucket.lo && value <= bucket.hi);
}

/** Signal: forecast moved ≥0.5 °C → the bucket one step toward the new value. */
export function revisionTarget(event: Pick<P7Event, "buckets" | "unit">, previousC: number, currentC: number): number | null {
  const delta = currentC - previousC;
  if (!(Math.abs(delta) >= P7_RULE.min_shift_c)) return null;
  const from = bucketIndex(event, previousC);
  const to = from + Math.sign(delta);
  return from >= 0 && to >= 0 && to < event.buckets.length ? to : null;
}

/** Control: no revision → the adjacent bucket on a deterministic, seed-chosen side. */
export function controlTarget(event: Pick<P7Event, "buckets" | "unit">, previousC: number, currentC: number, seed: string): number | null {
  if (Math.abs(currentC - previousC) >= P7_RULE.min_shift_c) return null;
  const from = bucketIndex(event, currentC);
  const to = from + (hashInt(seed) % 2 === 0 ? 1 : -1);
  return from >= 0 && to >= 0 && to < event.buckets.length ? to : null;
}

/** Orders control candidates deterministically for one signal. */
export function controlOrder<T extends { event: { event_id: string } }>(signalId: string, candidates: T[]): T[] {
  return [...candidates].sort((a, b) => hashInt(signalId + a.event.event_id) - hashInt(signalId + b.event.event_id));
}

// ---------------------------------------------------------------------------
// Forecasts

export type HourlySeries = { time: string[]; temperature_2m: Array<number | null> };
export type RunLocation = { utc_offset_seconds: number; hourly: HourlySeries };

/** Station-local daily extreme from hourly values (times are station-local). */
export function localExtreme(hourly: HourlySeries, date: string, kind: "maximum" | "minimum"): number | null {
  const values = hourly.time.flatMap((time, index) => {
    const value = hourly.temperature_2m[index];
    return time.startsWith(date) && typeof value === "number" && Number.isFinite(value) ? [value] : [];
  });
  if (values.length < 23) return null; // 23 allows a DST spring-forward day
  return kind === "maximum" ? Math.max(...values) : Math.min(...values);
}

/** True while the target date has not yet started at the station (day-ahead only). */
export function isDayAhead(targetDate: string, atMs: number, utcOffsetSeconds: number) {
  return new Date(atMs + utcOffsetSeconds * 1000).toISOString().slice(0, 10) < targetDate;
}

export function runInitIso(ms: number) {
  return new Date(ms).toISOString().slice(0, 16);
}

export async function fetchModelMeta(model: P7ModelId) {
  const response = await fetch(`https://api.open-meteo.com/data/${model}/static/meta.json`, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Open-Meteo ${model} metadata returned ${response.status}.`);
  const body = await response.json() as Record<string, unknown>;
  const init = Number(body.last_run_initialisation_time);
  const available = Number(body.last_run_availability_time);
  if (!Number.isFinite(init) || init <= 0) throw new Error(`Open-Meteo ${model} metadata has no run time.`);
  return {
    init_ms: init * 1000,
    available_ms: Number.isFinite(available) && available >= init ? available * 1000 : null,
  };
}

/**
 * One model run for many stations; times come back station-local. Open-Meteo's
 * free tier counts every location as a call (600/min, 5,000/h, 10,000/day), so
 * callers that fetch many runs pass waits to retry on 429.
 */
export async function fetchModelRun(
  model: P7ModelId,
  initMs: number,
  points: Array<{ latitude: number; longitude: number }>,
  retryWaitsMs: number[] = [],
): Promise<Array<RunLocation | null>> {
  const results: Array<RunLocation | null> = [];
  for (let start = 0; start < points.length; start += 50) {
    const chunk = points.slice(start, start + 50);
    const url = new URL("https://single-runs-api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", chunk.map((point) => point.latitude).join(","));
    url.searchParams.set("longitude", chunk.map((point) => point.longitude).join(","));
    url.searchParams.set("hourly", "temperature_2m");
    url.searchParams.set("models", model);
    url.searchParams.set("run", runInitIso(initMs));
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "4");
    let response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    for (const wait of retryWaitsMs) {
      if (response.status !== 429) break;
      await new Promise((resolve) => setTimeout(resolve, wait));
      response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
    }
    if (!response.ok) throw new Error(`Open-Meteo single run ${model} ${runInitIso(initMs)} returned ${response.status}.`);
    const body = await response.json() as unknown;
    const rows = Array.isArray(body) ? body : [body];
    for (let index = 0; index < chunk.length; index += 1) {
      const row = rows[index] as Record<string, unknown> | undefined;
      const hourly = row?.hourly as HourlySeries | undefined;
      results.push(row && hourly && Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m)
        ? { utc_offset_seconds: Number(row.utc_offset_seconds) || 0, hourly }
        : null);
    }
  }
  return results;
}

export async function fetchWeatherEvents(params: Record<string, string>, pages = 2): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let page = 0; page < pages; page += 1) {
    const url = new URL("https://gamma-api.polymarket.com/events");
    url.searchParams.set("tag_id", String(DAILY_TEMPERATURE_TAG_ID));
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(page * 100));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Gamma weather events returned ${response.status}.`);
    const body = await response.json() as unknown;
    if (!Array.isArray(body) || body.length === 0) break;
    out.push(...body);
    if (body.length < 100) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Paper fills

export type P7Fill =
  | { status: "filled"; best_ask: number; avg_price: number; shares: number; cost_usd: number; fee_usd: number | null }
  | { status: "skipped"; reason: "no_book" | "no_asks" | "out_of_band" | "thin_book"; best_ask: number | null };

/** $25 at the executable ask, only inside the 5–60¢ band, with the market's own taker fee. */
export function paperFill(book: PolymarketOrderBook | undefined, fee: FeeSchedule): P7Fill {
  if (!book) return { status: "skipped", reason: "no_book", best_ask: null };
  const bestAsk = book.asks[0]?.price ?? null;
  if (bestAsk === null) return { status: "skipped", reason: "no_asks", best_ask: null };
  if (bestAsk < P7_RULE.min_price || bestAsk > P7_RULE.max_price) return { status: "skipped", reason: "out_of_band", best_ask: bestAsk };
  const quote = quotePolymarketPaperBuy(book, P7_RULE.stake_usd);
  if (!quote) return { status: "skipped", reason: "thin_book", best_ask: bestAsk };
  if (quote.average_price > P7_RULE.max_price) return { status: "skipped", reason: "out_of_band", best_ask: bestAsk };
  return {
    status: "filled",
    best_ask: bestAsk,
    avg_price: quote.average_price,
    shares: quote.shares,
    cost_usd: quote.notional_usd,
    fee_usd: takerFeeUsd(quote.shares, quote.average_price, fee),
  };
}

export function settlePnl(won: boolean, shares: number, cost: number, fee: number | null) {
  return round((won ? shares : 0) - cost - (fee ?? 0), 4);
}

// ---------------------------------------------------------------------------
// Shared summary (live ledger and historical replay)

export type P7CaseRecord = {
  id: string;
  arm: "signal" | "control";
  station_code: string;
  detected_at: string;
  status: "filled" | "skipped";
  skip_reason: string | null;
  cost_usd: number | null;
  fee_known: boolean;
  outcome: "pending" | "won" | "lost";
  pnl_usd: number | null;
  /** Offset minutes → change in the target bucket's price since entry (dollars). */
  lag: Record<number, number | null>;
};

export type P7Summary = {
  signals: number;
  signals_filled: number;
  signal_skips: Record<string, number>;
  controls_filled: number;
  graded_signals: number;
  graded_controls: number;
  stations: number;
  days: number;
  /** Mean move of the target bucket's price, in cents (most minutes are flat, so medians read 0). */
  lag: Array<{ offset_min: number; signal_mean_cents: number | null; control_mean_cents: number | null; n_signal: number; n_control: number }>;
  pnl: {
    signal_per_dollar: number | null;
    control_per_dollar: number | null;
    diff_per_dollar: number | null;
    diff_lower_95: number | null;
    paired_days: number;
    signal_without_top2_per_dollar: number | null;
  };
  gate: { status: "measuring" | "pass" | "fail"; detail: string };
};

export function summarizeP7Cases(cases: P7CaseRecord[]): P7Summary {
  const signals = cases.filter((row) => row.arm === "signal");
  const filled = cases.filter((row) => row.status === "filled");
  const graded = filled.filter((row) => row.outcome !== "pending" && row.pnl_usd !== null && row.cost_usd && row.fee_known);
  const gradedSignals = graded.filter((row) => row.arm === "signal");
  const gradedControls = graded.filter((row) => row.arm === "control");
  const skips: Record<string, number> = {};
  for (const row of signals) if (row.status === "skipped") skips[row.skip_reason ?? "unknown"] = (skips[row.skip_reason ?? "unknown"] ?? 0) + 1;

  const offsets = [...new Set(cases.flatMap((row) => Object.keys(row.lag).map(Number)))].sort((a, b) => a - b);
  const lagFor = (arm: "signal" | "control", offset: number) =>
    cases.filter((row) => row.arm === arm).map((row) => row.lag[offset]).filter((value): value is number => typeof value === "number");
  const lag = offsets.map((offset) => {
    const signal = lagFor("signal", offset);
    const control = lagFor("control", offset);
    return {
      offset_min: offset,
      signal_mean_cents: signal.length ? round(mean(signal) * 100, 2) : null,
      control_mean_cents: control.length ? round(mean(control) * 100, 2) : null,
      n_signal: signal.length,
      n_control: control.length,
    };
  });

  const perDollar = (rows: P7CaseRecord[]) => {
    const cost = rows.reduce((sum, row) => sum + (row.cost_usd ?? 0), 0);
    return cost > 0 ? rows.reduce((sum, row) => sum + (row.pnl_usd ?? 0), 0) / cost : null;
  };
  const day = (row: P7CaseRecord) => row.detected_at.slice(0, 10);
  const dayDiffs = [...new Set(graded.map(day))].flatMap((date) => {
    const signal = perDollar(gradedSignals.filter((row) => day(row) === date));
    const control = perDollar(gradedControls.filter((row) => day(row) === date));
    return signal !== null && control !== null ? [signal - control] : [];
  });
  const meanDiff = dayDiffs.length ? dayDiffs.reduce((sum, value) => sum + value, 0) / dayDiffs.length : null;
  const sdDiff = dayDiffs.length >= 2 && meanDiff !== null
    ? Math.sqrt(dayDiffs.reduce((sum, value) => sum + (value - meanDiff) ** 2, 0) / (dayDiffs.length - 1))
    : null;
  const lower = meanDiff !== null && sdDiff !== null ? meanDiff - 1.96 * sdDiff / Math.sqrt(dayDiffs.length) : null;

  const byStation = new Map<string, number>();
  for (const row of gradedSignals) byStation.set(row.station_code, (byStation.get(row.station_code) ?? 0) + (row.pnl_usd ?? 0));
  const topTwo = new Set([...byStation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([station]) => station));
  const withoutTop = perDollar(gradedSignals.filter((row) => !topTwo.has(row.station_code)));

  const signalPerDollar = perDollar(gradedSignals);
  const controlPerDollar = perDollar(gradedControls);
  const stations = new Set(gradedSignals.map((row) => row.station_code)).size;
  const days = new Set(gradedSignals.map(day)).size;
  const enough = gradedSignals.length >= P7_GATE.min_graded_signals && stations >= P7_GATE.min_stations && days >= P7_GATE.min_days;
  const passes = enough && lower !== null && lower > 0 && (signalPerDollar ?? 0) > 0 && (withoutTop ?? 0) > 0;

  return {
    signals: signals.length,
    signals_filled: signals.filter((row) => row.status === "filled").length,
    signal_skips: skips,
    controls_filled: filled.filter((row) => row.arm === "control").length,
    graded_signals: gradedSignals.length,
    graded_controls: gradedControls.length,
    stations,
    days,
    lag,
    pnl: {
      signal_per_dollar: roundOrNull(signalPerDollar),
      control_per_dollar: roundOrNull(controlPerDollar),
      diff_per_dollar: signalPerDollar !== null && controlPerDollar !== null ? round(signalPerDollar - controlPerDollar, 4) : null,
      diff_lower_95: roundOrNull(lower),
      paired_days: dayDiffs.length,
      signal_without_top2_per_dollar: roundOrNull(withoutTop),
    },
    gate: {
      status: !enough ? "measuring" : passes ? "pass" : "fail",
      detail: !enough
        ? `${gradedSignals.length}/${P7_GATE.min_graded_signals} graded signal fills, ${stations}/${P7_GATE.min_stations} stations, ${days}/${P7_GATE.min_days} days.`
        : passes
          ? "Signal beat the matched control with a day-clustered lower bound above zero, after fees, without its two best stations. Not promoted."
          : "Sample is complete and the signal did not clear every condition.",
    },
  };
}

// ---------------------------------------------------------------------------
// Store

type CaseRow = {
  id: string; arm: "signal" | "control"; paired_with: string | null; model: string; init_time: string;
  event_id: string; event_slug: string; station_code: string; target_date: string; kind: string; unit: string;
  previous_c: number; current_c: number; target_market_id: string; target_label: string; target_token_id: string | null;
  detected_at: string; available_at: string | null; status: "filled" | "skipped"; skip_reason: string | null;
  best_ask: number | null; avg_price: number | null; shares: number | null; cost_usd: number | null;
  fee_usd: number | null; fee_known: number; outcome: "pending" | "won" | "lost"; pnl_usd: number | null; graded_at: string | null;
};

export type P7NewCase = Omit<CaseRow, "outcome" | "pnl_usd" | "graded_at">;

export class ForecastRevisionStore {
  readonly db: SqliteDatabase;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = openPolymarketSqlite(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS p7_model_runs (
        model TEXT NOT NULL, init_time TEXT NOT NULL, available_at TEXT, detected_at TEXT NOT NULL,
        source TEXT NOT NULL, PRIMARY KEY (model, init_time)
      );
      CREATE TABLE IF NOT EXISTS p7_forecasts (
        model TEXT NOT NULL, init_time TEXT NOT NULL, station_code TEXT NOT NULL, target_date TEXT NOT NULL,
        kind TEXT NOT NULL, value_c REAL NOT NULL, PRIMARY KEY (model, init_time, station_code, target_date, kind)
      );
      CREATE TABLE IF NOT EXISTS p7_cases (
        id TEXT PRIMARY KEY, arm TEXT NOT NULL, paired_with TEXT, model TEXT NOT NULL, init_time TEXT NOT NULL,
        event_id TEXT NOT NULL, event_slug TEXT NOT NULL, station_code TEXT NOT NULL, target_date TEXT NOT NULL,
        kind TEXT NOT NULL, unit TEXT NOT NULL, previous_c REAL NOT NULL, current_c REAL NOT NULL,
        target_market_id TEXT NOT NULL, target_label TEXT NOT NULL, target_token_id TEXT,
        detected_at TEXT NOT NULL, available_at TEXT, status TEXT NOT NULL, skip_reason TEXT,
        best_ask REAL, avg_price REAL, shares REAL, cost_usd REAL, fee_usd REAL, fee_known INTEGER NOT NULL,
        outcome TEXT NOT NULL DEFAULT 'pending', pnl_usd REAL, graded_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_p7_cases_pending ON p7_cases(outcome, target_date);
      CREATE TABLE IF NOT EXISTS p7_snapshots (
        case_id TEXT NOT NULL, offset_min INTEGER NOT NULL, token_id TEXT NOT NULL, due_at TEXT NOT NULL,
        taken_at TEXT, best_bid REAL, best_ask REAL, midpoint REAL, ask_depth_shares REAL,
        status TEXT NOT NULL, PRIMARY KEY (case_id, offset_min)
      );
      CREATE INDEX IF NOT EXISTS idx_p7_snapshots_due ON p7_snapshots(status, due_at);
      CREATE TABLE IF NOT EXISTS p7_replays (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, params_json TEXT NOT NULL, summary_json TEXT NOT NULL
      );
    `);
  }

  close() {
    this.db.close();
  }

  hasRun(model: string, initTime: string) {
    return Boolean(this.db.prepare("SELECT 1 AS ok FROM p7_model_runs WHERE model = ? AND init_time = ?").get(model, initTime));
  }

  recordRun(model: string, initTime: string, availableAt: string | null, source: "live" | "stale" | "backfill", detectedAt = new Date().toISOString()) {
    this.db.prepare(
      "INSERT OR IGNORE INTO p7_model_runs (model, init_time, available_at, detected_at, source) VALUES (?, ?, ?, ?, ?)",
    ).run(model, initTime, availableAt, detectedAt, source);
  }

  recordForecast(model: string, initTime: string, stationCode: string, targetDate: string, kind: string, valueC: number) {
    this.db.prepare(
      "INSERT OR IGNORE INTO p7_forecasts (model, init_time, station_code, target_date, kind, value_c) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(model, initTime, stationCode, targetDate, kind, valueC);
  }

  forecast(model: string, initTime: string, stationCode: string, targetDate: string, kind: string): number | null {
    const row = this.db.prepare(
      "SELECT value_c FROM p7_forecasts WHERE model = ? AND init_time = ? AND station_code = ? AND target_date = ? AND kind = ?",
    ).get(model, initTime, stationCode, targetDate, kind) as { value_c?: number } | undefined;
    return typeof row?.value_c === "number" ? row.value_c : null;
  }

  insertCase(row: P7NewCase, entryBook: PolymarketOrderBook | undefined) {
    this.db.prepare(`INSERT OR IGNORE INTO p7_cases (
      id, arm, paired_with, model, init_time, event_id, event_slug, station_code, target_date, kind, unit,
      previous_c, current_c, target_market_id, target_label, target_token_id, detected_at, available_at,
      status, skip_reason, best_ask, avg_price, shares, cost_usd, fee_usd, fee_known
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      row.id, row.arm, row.paired_with, row.model, row.init_time, row.event_id, row.event_slug, row.station_code,
      row.target_date, row.kind, row.unit, row.previous_c, row.current_c, row.target_market_id, row.target_label,
      row.target_token_id, row.detected_at, row.available_at, row.status, row.skip_reason, row.best_ask,
      row.avg_price, row.shares, row.cost_usd, row.fee_usd, row.fee_known,
    );
    if (!entryBook || !row.target_token_id) return;
    const detected = Date.parse(row.detected_at);
    this.writeSnapshot(row.id, 0, row.target_token_id, row.detected_at, entryBook, row.detected_at);
    for (const offset of P7_RULE.snapshot_offsets_min) {
      this.db.prepare(
        "INSERT OR IGNORE INTO p7_snapshots (case_id, offset_min, token_id, due_at, status) VALUES (?, ?, ?, ?, 'due')",
      ).run(row.id, offset, row.target_token_id, new Date(detected + offset * 60_000).toISOString());
    }
  }

  writeSnapshot(caseId: string, offset: number, tokenId: string, dueAt: string, book: PolymarketOrderBook | undefined, takenAt: string) {
    const metrics = book ? summarizePolymarketBook(book) : null;
    this.db.prepare(`INSERT INTO p7_snapshots (case_id, offset_min, token_id, due_at, taken_at, best_bid, best_ask, midpoint, ask_depth_shares, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(case_id, offset_min) DO UPDATE SET taken_at = excluded.taken_at, best_bid = excluded.best_bid,
        best_ask = excluded.best_ask, midpoint = excluded.midpoint, ask_depth_shares = excluded.ask_depth_shares,
        status = excluded.status`).run(
      caseId, offset, tokenId, dueAt, takenAt, metrics?.best_bid ?? null, metrics?.best_ask ?? null,
      metrics?.midpoint ?? null, metrics?.ask_depth_shares ?? null, metrics ? "taken" : "empty",
    );
  }

  dueSnapshots(nowIso: string) {
    return this.db.prepare(
      "SELECT case_id, offset_min, token_id, due_at FROM p7_snapshots WHERE status = 'due' AND due_at <= ? ORDER BY due_at LIMIT 400",
    ).all(nowIso) as Array<{ case_id: string; offset_min: number; token_id: string; due_at: string }>;
  }

  markSnapshotMissed(caseId: string, offset: number) {
    this.db.prepare("UPDATE p7_snapshots SET status = 'missed' WHERE case_id = ? AND offset_min = ?").run(caseId, offset);
  }

  pendingEventIds(beforeDate: string, limit = 40) {
    return (this.db.prepare(
      "SELECT DISTINCT event_id FROM p7_cases WHERE status = 'filled' AND outcome = 'pending' AND target_date < ? LIMIT ?",
    ).all(beforeDate, limit) as Array<{ event_id: string }>).map((row) => row.event_id);
  }

  gradeEvent(eventId: string, winningMarketId: string, gradedAt = new Date().toISOString()) {
    const rows = this.db.prepare(
      "SELECT id, target_market_id, shares, cost_usd, fee_usd FROM p7_cases WHERE event_id = ? AND status = 'filled' AND outcome = 'pending'",
    ).all(eventId) as Array<{ id: string; target_market_id: string; shares: number; cost_usd: number; fee_usd: number | null }>;
    for (const row of rows) {
      const won = row.target_market_id === winningMarketId;
      this.db.prepare("UPDATE p7_cases SET outcome = ?, pnl_usd = ?, graded_at = ? WHERE id = ?")
        .run(won ? "won" : "lost", settlePnl(won, row.shares, row.cost_usd, row.fee_usd), gradedAt, row.id);
    }
    return rows.length;
  }

  caseRecords(): P7CaseRecord[] {
    const rows = this.db.prepare("SELECT * FROM p7_cases ORDER BY detected_at").all() as CaseRow[];
    const snapshots = this.db.prepare(
      "SELECT case_id, offset_min, midpoint FROM p7_snapshots WHERE status = 'taken'",
    ).all() as Array<{ case_id: string; offset_min: number; midpoint: number | null }>;
    const mids = new Map<string, Map<number, number | null>>();
    for (const snapshot of snapshots) {
      const byOffset = mids.get(snapshot.case_id) ?? new Map<number, number | null>();
      byOffset.set(snapshot.offset_min, snapshot.midpoint);
      mids.set(snapshot.case_id, byOffset);
    }
    return rows.map((row) => {
      const byOffset = mids.get(row.id);
      const entry = byOffset?.get(0) ?? null;
      const lag: Record<number, number | null> = {};
      for (const offset of P7_RULE.snapshot_offsets_min) {
        const value = byOffset?.get(offset);
        if (typeof value === "number" && entry !== null) lag[offset] = value - entry;
      }
      return {
        id: row.id,
        arm: row.arm,
        station_code: row.station_code,
        detected_at: row.detected_at,
        status: row.status,
        skip_reason: row.skip_reason,
        cost_usd: row.cost_usd,
        fee_known: row.fee_known === 1,
        outcome: row.outcome,
        pnl_usd: row.pnl_usd,
        lag,
      };
    });
  }

  latestRuns() {
    return this.db.prepare(
      "SELECT model, MAX(init_time) AS init_time, COUNT(*) AS runs FROM p7_model_runs WHERE source = 'live' GROUP BY model",
    ).all() as Array<{ model: string; init_time: string; runs: number }>;
  }

  /** Median minutes between Open-Meteo availability and our detection, per model. */
  detectionLatencyMinutes(model: string): number | null {
    const rows = this.db.prepare(
      "SELECT available_at, detected_at FROM p7_model_runs WHERE model = ? AND source = 'live' AND available_at IS NOT NULL",
    ).all(model) as Array<{ available_at: string; detected_at: string }>;
    const values = rows.map((row) => (Date.parse(row.detected_at) - Date.parse(row.available_at)) / 60_000).filter(Number.isFinite);
    return values.length ? round(median(values), 1) : null;
  }

  /** Median hours from run start to Open-Meteo availability, measured live. */
  availabilityDelayHours(model: string): number | null {
    const rows = this.db.prepare(
      "SELECT init_time, available_at FROM p7_model_runs WHERE model = ? AND available_at IS NOT NULL",
    ).all(model) as Array<{ init_time: string; available_at: string }>;
    const values = rows.map((row) => (Date.parse(row.available_at) - Date.parse(`${row.init_time}:00Z`)) / 3_600_000).filter((value) => value > 0 && value < 24);
    return values.length >= 3 ? round(median(values), 2) : null;
  }

  recordReplay(params: unknown, summary: unknown) {
    const id = randomUUID();
    this.db.prepare("INSERT INTO p7_replays (id, created_at, params_json, summary_json) VALUES (?, ?, ?, ?)")
      .run(id, new Date().toISOString(), JSON.stringify(params), JSON.stringify(summary));
    return id;
  }

  latestReplay(): P7ReplayRecord | null {
    const row = this.db.prepare("SELECT created_at, params_json, summary_json FROM p7_replays ORDER BY created_at DESC LIMIT 1").get() as
      { created_at: string; params_json: string; summary_json: string } | undefined;
    if (!row) return null;
    try {
      return { created_at: row.created_at, params: JSON.parse(row.params_json), summary: JSON.parse(row.summary_json) };
    } catch {
      return null;
    }
  }
}

export type P7ReplayParams = { days: number; models: string[]; events: number; slippage_cents: number; delay_hours: Record<string, number>; note: string };
export type P7ReplayRecord = { created_at: string; params: P7ReplayParams; summary: P7Summary };

let singleton: ForecastRevisionStore | null = null;
let singletonPath = "";
const TEST_DB_PATH = join(tmpdir(), `mastermold-p7-${process.pid}-${randomUUID()}.db`);

export function forecastRevisionStore() {
  const path = process.env.POLYMARKET_P7_DB ?? (process.env.NODE_ENV === "test"
    ? TEST_DB_PATH
    : join(/* turbopackIgnore: true */ process.cwd(), ".data", "polymarket-forecast-revision.db"));
  if (!singleton || singletonPath !== path) {
    singleton?.close();
    singleton = new ForecastRevisionStore(path);
    singletonPath = path;
  }
  return singleton;
}

export function p7Enabled(env: NodeJS.ProcessEnv = process.env) {
  return env.POLYMARKET_P7 !== "0";
}

// ---------------------------------------------------------------------------
// Live cycle

let lastGradeAt = 0;

export type P7CycleResult = { action: "idle" | "waiting" | "captured" | "error"; detail: string };

export async function runForecastRevisionCycle(now = new Date()): Promise<P7CycleResult> {
  if (!p7Enabled()) return { action: "idle", detail: "P7 is off (POLYMARKET_P7=0)." };
  try {
    const store = forecastRevisionStore();
    await takeDueSnapshots(store, now);
    if (now.getTime() - lastGradeAt > GRADE_EVERY_MS) {
      await gradePending(store, now);
      lastGradeAt = now.getTime();
    }
    const details: string[] = [];
    const errors: string[] = [];
    let events: P7Event[] | null = null;
    for (const model of P7_MODELS) {
      try {
        const meta = await fetchModelMeta(model.id);
        const initTime = runInitIso(meta.init_ms);
        if (meta.available_ms === null || store.hasRun(model.id, initTime)) continue;
        events ??= (await fetchWeatherEvents({ active: "true", closed: "false", order: "endDate", ascending: "true" }))
          .map(parseP7Event)
          .filter((event): event is P7Event => event !== null);
        details.push(await processRun(store, model.id, meta.init_ms, meta.available_ms, events, now));
      } catch (error) {
        // One model's outage must not block the other; the run is retried next cycle.
        errors.push(`${model.label}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    if (details.length) return { action: "captured", detail: [...details, ...errors].join(" ") };
    return errors.length ? { action: "error", detail: errors.join(" ") } : { action: "waiting", detail: "No new model run yet." };
  } catch (error) {
    return { action: "error", detail: error instanceof Error ? error.message : "Unknown P7 error." };
  }
}

type Located = { event: P7Event; location: RunLocation; previous: number; current: number };

async function processRun(store: ForecastRevisionStore, model: P7ModelId, initMs: number, availableMs: number, events: P7Event[], now: Date) {
  const initTime = runInitIso(initMs);
  const previousMs = initMs - RUN_INTERVAL_HOURS * 3_600_000;
  const previousTime = runInitIso(previousMs);
  const stations = await locateStations(events.map((event) => event.station_code));
  const usable = events.filter((event) => stations.has(event.station_code));
  const codes = [...new Set(usable.map((event) => event.station_code))];
  const points = codes.map((code) => stations.get(code)!);

  // Without the immediately preceding run there is nothing to compare; fetch it.
  if (!store.hasRun(model, previousTime)) {
    const previousRun = await fetchModelRun(model, previousMs, points);
    storeForecasts(store, model, previousTime, usable, codes, previousRun);
    store.recordRun(model, previousTime, null, "backfill");
  }
  const run = await fetchModelRun(model, initMs, points);
  storeForecasts(store, model, initTime, usable, codes, run);
  const detectedAt = now.toISOString();
  const label = P7_MODELS.find((row) => row.id === model)?.label ?? model;
  const lateMin = Math.round((now.getTime() - availableMs) / 60_000);
  if (lateMin > MAX_DETECTION_DELAY_MIN) {
    store.recordRun(model, initTime, new Date(availableMs).toISOString(), "stale", detectedAt);
    return `${label} ${initTime}Z: first seen ${lateMin} min after it was published; stored as the baseline for the next run, no cases.`;
  }
  store.recordRun(model, initTime, new Date(availableMs).toISOString(), "live", detectedAt);

  const located: Located[] = usable.flatMap((event) => {
    const location = run[codes.indexOf(event.station_code)];
    if (!location || !isDayAhead(event.target_date, now.getTime(), location.utc_offset_seconds)) return [];
    const previous = store.forecast(model, previousTime, event.station_code, event.target_date, event.kind);
    const current = store.forecast(model, initTime, event.station_code, event.target_date, event.kind);
    return previous === null || current === null ? [] : [{ event, location, previous, current }];
  });
  const signals = located.flatMap((row) => {
    const index = revisionTarget(row.event, row.previous, row.current);
    return index === null ? [] : [{ ...row, bucket: row.event.buckets[index] }];
  });
  const controls = located.flatMap((row) => {
    const index = controlTarget(row.event, row.previous, row.current, `${model}|${initTime}|${row.event.event_id}`);
    return index === null ? [] : [{ ...row, bucket: row.event.buckets[index] }];
  });

  const tokens = [...signals, ...controls].map((row) => row.bucket.yes_token_id).filter((token): token is string => Boolean(token));
  const books = await fetchBooks(tokens);
  const usedControls = new Set<string>();
  const base = (row: Located & { bucket: P7Bucket }, arm: "signal" | "control", fill: P7Fill, pairedWith: string | null): P7NewCase => ({
    id: `${arm}:${model}:${initTime}:${row.event.event_id}`,
    arm,
    paired_with: pairedWith,
    model,
    init_time: initTime,
    event_id: row.event.event_id,
    event_slug: row.event.slug,
    station_code: row.event.station_code,
    target_date: row.event.target_date,
    kind: row.event.kind,
    unit: row.event.unit,
    previous_c: row.previous,
    current_c: row.current,
    target_market_id: row.bucket.market_id,
    target_label: row.bucket.label,
    target_token_id: row.bucket.yes_token_id,
    detected_at: detectedAt,
    available_at: new Date(availableMs).toISOString(),
    status: fill.status,
    skip_reason: fill.status === "skipped" ? fill.reason : null,
    best_ask: fill.best_ask,
    avg_price: fill.status === "filled" ? fill.avg_price : null,
    shares: fill.status === "filled" ? fill.shares : null,
    cost_usd: fill.status === "filled" ? fill.cost_usd : null,
    fee_usd: fill.status === "filled" ? fill.fee_usd : null,
    fee_known: fill.status === "filled" && fill.fee_usd !== null ? 1 : 0,
  });

  let filledSignals = 0;
  let pairedControls = 0;
  for (const signal of signals) {
    const book = signal.bucket.yes_token_id ? books.get(signal.bucket.yes_token_id) : undefined;
    const fill = paperFill(book, signal.bucket.fee);
    const signalCase = base(signal, "signal", fill, null);
    if (fill.status === "filled") filledSignals += 1;
    let controlId: string | null = null;
    if (fill.status === "filled") {
      for (const candidate of controlOrder(signalCase.id, controls.filter((row) => !usedControls.has(row.event.event_id)))) {
        const controlBook = candidate.bucket.yes_token_id ? books.get(candidate.bucket.yes_token_id) : undefined;
        const controlFill = paperFill(controlBook, candidate.bucket.fee);
        if (controlFill.status !== "filled") continue;
        usedControls.add(candidate.event.event_id);
        const controlCase = base(candidate, "control", controlFill, signalCase.id);
        store.insertCase(controlCase, controlBook);
        controlId = controlCase.id;
        pairedControls += 1;
        break;
      }
    }
    store.insertCase({ ...signalCase, paired_with: controlId }, book);
  }
  return `${label} ${initTime}Z: ${located.length} day-ahead events, ${signals.length} revisions, ${filledSignals} paper fills, ${pairedControls} matched controls.`;
}

function storeForecasts(store: ForecastRevisionStore, model: string, initTime: string, events: P7Event[], codes: string[], run: Array<RunLocation | null>) {
  for (const event of events) {
    const location = run[codes.indexOf(event.station_code)];
    if (!location) continue;
    const value = localExtreme(location.hourly, event.target_date, event.kind);
    if (value !== null) store.recordForecast(model, initTime, event.station_code, event.target_date, event.kind, value);
  }
}

export async function locateStations(codes: string[]) {
  const found = new Map<string, { latitude: number; longitude: number }>();
  const unique = [...new Set(codes)];
  for (let start = 0; start < unique.length; start += 8) {
    await Promise.all(unique.slice(start, start + 8).map(async (code) => {
      try {
        const station = await lookupStation(code);
        found.set(code, { latitude: station.latitude, longitude: station.longitude });
      } catch {
        // Unknown station: its events are skipped, never guessed.
      }
    }));
  }
  return found;
}

async function fetchBooks(tokens: string[]) {
  const books = new Map<string, PolymarketOrderBook>();
  const unique = [...new Set(tokens)];
  for (let start = 0; start < unique.length; start += 50) {
    for (const [token, book] of await fetchPolymarketOrderBooks(unique.slice(start, start + 50), true)) books.set(token, book);
  }
  return books;
}

async function takeDueSnapshots(store: ForecastRevisionStore, now: Date) {
  const due = store.dueSnapshots(now.toISOString());
  const fresh = due.filter((row) => now.getTime() - Date.parse(row.due_at) <= SNAPSHOT_GRACE_MIN * 60_000);
  for (const row of due) if (!fresh.includes(row)) store.markSnapshotMissed(row.case_id, row.offset_min);
  if (fresh.length === 0) return;
  const books = await fetchBooks(fresh.map((row) => row.token_id));
  const takenAt = now.toISOString();
  for (const row of fresh) store.writeSnapshot(row.case_id, row.offset_min, row.token_id, row.due_at, books.get(row.token_id), takenAt);
}

async function gradePending(store: ForecastRevisionStore, now: Date) {
  const today = now.toISOString().slice(0, 10);
  for (const eventId of store.pendingEventIds(today)) {
    try {
      const response = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`, {
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const event = parseP7Event(await response.json());
      const winners = event?.buckets.filter((bucket) => bucket.resolved_yes === true) ?? [];
      if (winners.length === 1) store.gradeEvent(eventId, winners[0].market_id);
    } catch {
      // Grading retries on the next pass.
    }
  }
}

// ---------------------------------------------------------------------------
// Report

export type ForecastRevisionReport = {
  enabled: boolean;
  authority: "shadow-only";
  runs: Array<{ model: string; label: string; latest_init: string | null; live_runs: number; detection_latency_min: number | null }>;
  summary: P7Summary;
  replay: P7ReplayRecord | null;
  error: string | null;
};

export function safeForecastRevisionReport(): ForecastRevisionReport {
  try {
    const store = forecastRevisionStore();
    const latest = store.latestRuns();
    return {
      enabled: p7Enabled(),
      authority: "shadow-only",
      runs: P7_MODELS.map((model) => {
        const row = latest.find((item) => item.model === model.id);
        return {
          model: model.id,
          label: model.label,
          latest_init: row?.init_time ?? null,
          live_runs: row?.runs ?? 0,
          detection_latency_min: store.detectionLatencyMinutes(model.id),
        };
      }),
      summary: summarizeP7Cases(store.caseRecords()),
      replay: store.latestReplay(),
      error: null,
    };
  } catch (error) {
    return {
      enabled: p7Enabled(),
      authority: "shadow-only",
      runs: [],
      summary: summarizeP7Cases([]),
      replay: null,
      error: error instanceof Error ? error.message : "P7 ledger unavailable.",
    };
  }
}

export function __resetForecastRevisionForTests() {
  singleton?.close();
  singleton = null;
  singletonPath = "";
  lastGradeAt = 0;
}

// ---------------------------------------------------------------------------
// Helpers

export function hashInt(value: string) {
  return parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
}

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundOrNull(value: number | null) {
  return value === null ? null : round(value, 4);
}

function text(value: unknown) {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}


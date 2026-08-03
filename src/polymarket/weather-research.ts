import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { SqliteDatabase } from "@/src/autopilot/sqlite";

import { openPolymarketSqlite } from "./sqlite";

const MIN_TRAINING_CASES = 20;
const MIN_INDEPENDENT_OUTCOMES = 365;
const MIN_CELL_OUTCOMES = 100;

export type WeatherBucketDefinition = {
  market_id: string;
  label: string;
  market_yes_price: number | null;
  raw_model_probability?: number | null;
};

export type WeatherResearchModelScore = {
  evaluated_cases: number;
  mean_brier_score: number | null;
  mean_crps_celsius: number | null;
};

export type WeatherResearchReport = {
  status: "insufficient" | "evaluated-not-promoted" | "unavailable";
  authority: "shadow-only";
  database: "sqlite";
  latest_capture_at: string | null;
  counts: {
    rule_snapshots: number;
    stations: number;
    forecast_runs: number;
    complete_forecast_runs: number;
    partial_forecast_runs: number;
    observations: number;
    resolutions: number;
    exact_resolutions: number;
    aligned_complete_cases: number;
    heldout_cases: number;
  };
  evidence_gate: {
    required_independent_outcomes: number;
    required_per_station_lead_kind_cell: number;
    smallest_cell: number;
    passed: boolean;
  };
  models: {
    climatology: WeatherResearchModelScore;
    raw_ensemble: WeatherResearchModelScore;
    simple_emos: WeatherResearchModelScore;
  };
  detail: string;
  warnings: string[];
  error: string | null;
};

export type WeatherRuleCapture = {
  event_id: string;
  event_slug: string;
  event_title: string;
  target_date: string;
  temperature_kind: "maximum" | "minimum";
  resolution_source: string;
  station_code: string | null;
  station_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  elevation_m?: number | null;
  timezone?: string | null;
  rules_status: "auditable" | "unsupported";
  rules_detail: string;
  buckets: WeatherBucketDefinition[];
  captured_at?: string;
};

export type WeatherForecastCapture = {
  event_id: string;
  rule_fingerprint: string;
  retrieved_at: string;
  target_date: string;
  temperature_kind: "maximum" | "minimum";
  station_code: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  timezone: string | null;
  provider: string;
  model: string;
  model_run_at: string | null;
  provenance_status: "complete" | "partial";
  member_values_celsius: number[];
  buckets: WeatherBucketDefinition[];
  source_payload_sha256: string;
};

export type WeatherObservationCapture = {
  station_code: string;
  local_date: string;
  temperature_kind: "maximum" | "minimum";
  value_celsius: number;
  source_url: string;
  source_status: "provisional" | "final";
  observed_at: string | null;
  retrieved_at: string;
  source_payload_sha256: string;
};

export type WeatherResolutionCapture = {
  event_id: string;
  target_date: string;
  temperature_kind: "maximum" | "minimum";
  station_code: string | null;
  winning_market_id: string;
  winning_label: string;
  exact_value_celsius: number | null;
  resolved_at: string | null;
  retrieved_at: string;
  source: string;
  source_payload_sha256: string;
};

type ForecastRow = {
  event_id: string;
  retrieved_at: string;
  target_date: string;
  temperature_kind: "maximum" | "minimum";
  station_code: string;
  member_values_json: string;
  buckets_json: string;
};

type ResolutionRow = {
  event_id: string;
  target_date: string;
  temperature_kind: "maximum" | "minimum";
  station_code: string | null;
  exact_value_celsius: number | null;
};

type EvaluationCase = {
  event_id: string;
  date: string;
  retrieved_at: string;
  station_code: string;
  temperature_kind: "maximum" | "minimum";
  members: number[];
  buckets: WeatherBucketDefinition[];
  outcome: number;
};

export class WeatherResearchStore {
  private readonly db: SqliteDatabase;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = openPolymarketSqlite(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  recordRule(input: WeatherRuleCapture) {
    const capturedAt = input.captured_at ?? new Date().toISOString();
    const normalizedBuckets = input.buckets.map((bucket) => ({
      market_id: bucket.market_id,
      label: bucket.label,
    }));
    const normalized = {
      event_id: input.event_id,
      event_slug: input.event_slug,
      event_title: input.event_title,
      target_date: input.target_date,
      temperature_kind: input.temperature_kind,
      resolution_source: input.resolution_source,
      station_code: input.station_code,
      station_name: input.station_name ?? null,
      latitude: finiteOrNull(input.latitude),
      longitude: finiteOrNull(input.longitude),
      elevation_m: finiteOrNull(input.elevation_m),
      timezone: input.timezone ?? null,
      rules_status: input.rules_status,
      rules_detail: input.rules_detail,
      buckets: normalizedBuckets,
    };
    const fingerprint = sha256(stableJson(normalized));
    this.db.prepare(`
      INSERT OR IGNORE INTO weather_rule_snapshots (
        fingerprint, event_id, event_slug, event_title, target_date,
        temperature_kind, resolution_source, station_code, station_name,
        latitude, longitude, elevation_m, timezone, rules_status, rules_detail,
        buckets_json, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fingerprint, input.event_id, input.event_slug, input.event_title, input.target_date,
      input.temperature_kind, input.resolution_source, input.station_code, input.station_name ?? null,
      finiteOrNull(input.latitude), finiteOrNull(input.longitude), finiteOrNull(input.elevation_m),
      input.timezone ?? null, input.rules_status, input.rules_detail, stableJson(input.buckets), capturedAt,
    );
    if (input.station_code) {
      const stationFingerprint = sha256(stableJson({
        station_code: input.station_code,
        station_name: input.station_name ?? null,
        latitude: finiteOrNull(input.latitude),
        longitude: finiteOrNull(input.longitude),
        elevation_m: finiteOrNull(input.elevation_m),
        timezone: input.timezone ?? null,
      }));
      this.db.prepare(`
        INSERT OR IGNORE INTO weather_station_snapshots (
          fingerprint, station_code, station_name, latitude, longitude,
          elevation_m, timezone, captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        stationFingerprint, input.station_code, input.station_name ?? null,
        finiteOrNull(input.latitude), finiteOrNull(input.longitude), finiteOrNull(input.elevation_m),
        input.timezone ?? null, capturedAt,
      );
    }
    return fingerprint;
  }

  recordForecast(input: WeatherForecastCapture) {
    const members = input.member_values_celsius.filter(Number.isFinite);
    if (members.length === 0) throw new Error("A weather forecast capture needs finite ensemble members.");
    const fingerprint = sha256(stableJson({
      event_id: input.event_id,
      rule_fingerprint: input.rule_fingerprint,
      target_date: input.target_date,
      provider: input.provider,
      model: input.model,
      model_run_at: input.model_run_at,
      member_values_celsius: members,
      bucket_labels: input.buckets.map((bucket) => bucket.label),
    }));
    this.db.prepare(`
      INSERT OR IGNORE INTO weather_forecast_runs (
        fingerprint, event_id, rule_fingerprint, retrieved_at, target_date,
        temperature_kind, station_code, latitude, longitude, elevation_m,
        timezone, provider, model, model_run_at, provenance_status,
        member_values_json, member_count, buckets_json, source_payload_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fingerprint, input.event_id, input.rule_fingerprint, input.retrieved_at, input.target_date,
      input.temperature_kind, input.station_code, input.latitude, input.longitude, input.elevation_m,
      input.timezone, input.provider, input.model, input.model_run_at, input.provenance_status,
      stableJson(members), members.length, stableJson(input.buckets), input.source_payload_sha256,
    );
    return fingerprint;
  }

  recordObservation(input: WeatherObservationCapture) {
    const fingerprint = sha256(stableJson({
      station_code: input.station_code,
      local_date: input.local_date,
      temperature_kind: input.temperature_kind,
      value_celsius: input.value_celsius,
      source_url: input.source_url,
      source_status: input.source_status,
      observed_at: input.observed_at,
      source_payload_sha256: input.source_payload_sha256,
    }));
    this.db.prepare(`
      INSERT OR IGNORE INTO weather_observations (
        fingerprint, station_code, local_date, temperature_kind, value_celsius,
        source_url, source_status, observed_at, retrieved_at, source_payload_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fingerprint, input.station_code, input.local_date, input.temperature_kind, input.value_celsius,
      input.source_url, input.source_status, input.observed_at, input.retrieved_at, input.source_payload_sha256,
    );
    return fingerprint;
  }

  recordResolution(input: WeatherResolutionCapture) {
    const fingerprint = sha256(stableJson({
      event_id: input.event_id,
      target_date: input.target_date,
      temperature_kind: input.temperature_kind,
      station_code: input.station_code,
      winning_market_id: input.winning_market_id,
      winning_label: input.winning_label,
      exact_value_celsius: input.exact_value_celsius,
      resolved_at: input.resolved_at,
      source: input.source,
    }));
    this.db.prepare(`
      INSERT OR IGNORE INTO weather_resolutions (
        fingerprint, event_id, target_date, temperature_kind, station_code,
        winning_market_id, winning_label, exact_value_celsius, resolved_at,
        retrieved_at, source, source_payload_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fingerprint, input.event_id, input.target_date, input.temperature_kind, input.station_code,
      input.winning_market_id, input.winning_label, input.exact_value_celsius, input.resolved_at,
      input.retrieved_at, input.source, input.source_payload_sha256,
    );
    return fingerprint;
  }

  report(): WeatherResearchReport {
    const counts = this.counts();
    const cases = this.evaluationCases();
    const evaluated = evaluateChronologically(cases);
    const cellCounts = new Map<string, number>();
    for (const item of cases) {
      const key = `${item.station_code}:${item.temperature_kind}:${leadBand(item.retrieved_at, item.date)}`;
      cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
    }
    const smallestCell = cellCounts.size ? Math.min(...cellCounts.values()) : 0;
    const gatePassed = cases.length >= MIN_INDEPENDENT_OUTCOMES && smallestCell >= MIN_CELL_OUTCOMES;
    const heldoutCases = evaluated.raw_ensemble.evaluated_cases;
    return {
      status: gatePassed && heldoutCases > 0 ? "evaluated-not-promoted" : "insufficient",
      authority: "shadow-only",
      database: "sqlite",
      latest_capture_at: scalarText(this.db, `
        SELECT MAX(ts) FROM (
          SELECT captured_at AS ts FROM weather_rule_snapshots
          UNION ALL SELECT retrieved_at AS ts FROM weather_forecast_runs
          UNION ALL SELECT retrieved_at AS ts FROM weather_observations
          UNION ALL SELECT retrieved_at AS ts FROM weather_resolutions
        )
      `),
      counts: {
        ...counts,
        aligned_complete_cases: cases.length,
        heldout_cases: heldoutCases,
      },
      evidence_gate: {
        required_independent_outcomes: MIN_INDEPENDENT_OUTCOMES,
        required_per_station_lead_kind_cell: MIN_CELL_OUTCOMES,
        smallest_cell: smallestCell,
        passed: gatePassed,
      },
      models: evaluated,
      detail: gatePassed
        ? "Chronological scores are available, but no execution authority is granted. Promotion still requires stability and dependency audits."
        : `Insufficient evidence: ${cases.length}/${MIN_INDEPENDENT_OUTCOMES} aligned forecasts with exact outcomes; the smallest station/kind cell has ${smallestCell}/${MIN_CELL_OUTCOMES}.`,
      warnings: [
        "Current Open-Meteo ensemble responses do not identify a stable issuance time, so captures without that provenance are retained but excluded from calibration.",
        "Historical Polymarket resolutions are not substitutes for historical forecast runs; no forecast backfill is synthesized.",
        "Market settlement labels are separate from source-station observations and may be revised; both are append-only records.",
        "Research status never enables paper or live trading.",
      ],
      error: null,
    };
  }

  private counts() {
    return {
      rule_snapshots: scalarNumber(this.db, "SELECT COUNT(*) FROM weather_rule_snapshots"),
      stations: scalarNumber(this.db, "SELECT COUNT(DISTINCT station_code) FROM weather_station_snapshots"),
      forecast_runs: scalarNumber(this.db, "SELECT COUNT(*) FROM weather_forecast_runs"),
      complete_forecast_runs: scalarNumber(this.db, "SELECT COUNT(*) FROM weather_forecast_runs WHERE provenance_status = 'complete'"),
      partial_forecast_runs: scalarNumber(this.db, "SELECT COUNT(*) FROM weather_forecast_runs WHERE provenance_status = 'partial'"),
      observations: scalarNumber(this.db, "SELECT COUNT(*) FROM weather_observations"),
      resolutions: scalarNumber(this.db, "SELECT COUNT(DISTINCT event_id) FROM weather_resolutions"),
      exact_resolutions: scalarNumber(this.db, "SELECT COUNT(DISTINCT event_id) FROM weather_resolutions WHERE exact_value_celsius IS NOT NULL"),
    };
  }

  private evaluationCases(): EvaluationCase[] {
    const forecasts = this.db.prepare(`
      SELECT event_id, retrieved_at, target_date, temperature_kind, station_code,
             member_values_json, buckets_json
      FROM weather_forecast_runs
      WHERE provenance_status = 'complete'
      ORDER BY target_date ASC, retrieved_at ASC
    `).all() as unknown as ForecastRow[];
    const resolutions = this.db.prepare(`
      SELECT event_id, target_date, temperature_kind, station_code, exact_value_celsius
      FROM weather_resolutions
      WHERE exact_value_celsius IS NOT NULL
      ORDER BY retrieved_at DESC
    `).all() as unknown as ResolutionRow[];
    const latestResolution = new Map<string, ResolutionRow>();
    for (const row of resolutions) if (!latestResolution.has(row.event_id)) latestResolution.set(row.event_id, row);
    const firstForecast = new Map<string, ForecastRow>();
    for (const row of forecasts) if (!firstForecast.has(row.event_id)) firstForecast.set(row.event_id, row);
    const cases: EvaluationCase[] = [];
    for (const row of firstForecast.values()) {
      const resolution = latestResolution.get(row.event_id);
      if (!resolution || resolution.exact_value_celsius === null) continue;
      const members = jsonNumbers(row.member_values_json);
      const buckets = jsonBuckets(row.buckets_json);
      if (!members.length || buckets.length < 2) continue;
      cases.push({
        event_id: row.event_id,
        date: row.target_date,
        retrieved_at: row.retrieved_at,
        station_code: row.station_code,
        temperature_kind: row.temperature_kind,
        members,
        buckets,
        outcome: resolution.exact_value_celsius,
      });
    }
    return cases.sort((a, b) => a.date.localeCompare(b.date) || a.event_id.localeCompare(b.event_id));
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS weather_rule_snapshots (
        fingerprint TEXT PRIMARY KEY, event_id TEXT NOT NULL, event_slug TEXT NOT NULL,
        event_title TEXT NOT NULL, target_date TEXT NOT NULL, temperature_kind TEXT NOT NULL,
        resolution_source TEXT NOT NULL, station_code TEXT, station_name TEXT,
        latitude REAL, longitude REAL, elevation_m REAL, timezone TEXT,
        rules_status TEXT NOT NULL, rules_detail TEXT NOT NULL, buckets_json TEXT NOT NULL,
        captured_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_weather_rules_event ON weather_rule_snapshots(event_id, captured_at DESC);
      CREATE TABLE IF NOT EXISTS weather_station_snapshots (
        fingerprint TEXT PRIMARY KEY, station_code TEXT NOT NULL, station_name TEXT,
        latitude REAL, longitude REAL, elevation_m REAL, timezone TEXT, captured_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS weather_forecast_runs (
        fingerprint TEXT PRIMARY KEY, event_id TEXT NOT NULL, rule_fingerprint TEXT NOT NULL,
        retrieved_at TEXT NOT NULL, target_date TEXT NOT NULL, temperature_kind TEXT NOT NULL,
        station_code TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
        elevation_m REAL, timezone TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
        model_run_at TEXT, provenance_status TEXT NOT NULL, member_values_json TEXT NOT NULL,
        member_count INTEGER NOT NULL, buckets_json TEXT NOT NULL, source_payload_sha256 TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_weather_forecasts_event ON weather_forecast_runs(event_id, retrieved_at ASC);
      CREATE TABLE IF NOT EXISTS weather_observations (
        fingerprint TEXT PRIMARY KEY, station_code TEXT NOT NULL, local_date TEXT NOT NULL,
        temperature_kind TEXT NOT NULL, value_celsius REAL NOT NULL, source_url TEXT NOT NULL,
        source_status TEXT NOT NULL, observed_at TEXT, retrieved_at TEXT NOT NULL,
        source_payload_sha256 TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_weather_observations_cell ON weather_observations(station_code, local_date, temperature_kind);
      CREATE TABLE IF NOT EXISTS weather_resolutions (
        fingerprint TEXT PRIMARY KEY, event_id TEXT NOT NULL, target_date TEXT NOT NULL,
        temperature_kind TEXT NOT NULL, station_code TEXT, winning_market_id TEXT NOT NULL,
        winning_label TEXT NOT NULL, exact_value_celsius REAL, resolved_at TEXT,
        retrieved_at TEXT NOT NULL, source TEXT NOT NULL, source_payload_sha256 TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_weather_resolutions_event ON weather_resolutions(event_id, retrieved_at DESC);
    `);
  }
}

let singleton: WeatherResearchStore | null = null;
let singletonPath = "";
const TEST_DB_PATH = join(tmpdir(), `mastermold-weather-research-${process.pid}-${randomUUID()}.db`);

export function weatherResearchStore() {
  const path = process.env.POLYMARKET_WEATHER_DB ?? (process.env.NODE_ENV === "test"
    ? TEST_DB_PATH
    : join(/* turbopackIgnore: true */ process.cwd(), ".data", "polymarket-weather-research.db"));
  if (!singleton || singletonPath !== path) {
    singleton?.close();
    singleton = new WeatherResearchStore(path);
    singletonPath = path;
  }
  return singleton;
}

export function safeWeatherResearchReport(): WeatherResearchReport {
  try {
    return weatherResearchStore().report();
  } catch (error) {
    return emptyReport(error instanceof Error ? error.message : "Unknown local SQLite error.");
  }
}

export function __resetWeatherResearchForTests() {
  singleton?.close();
  singleton = null;
  singletonPath = "";
}

export function weatherPayloadSha256(value: unknown) {
  return sha256(stableJson(value));
}

function evaluateChronologically(cases: EvaluationCase[]): WeatherResearchReport["models"] {
  const scores = {
    climatology: [] as Array<{ brier: number; crps: number }>,
    raw_ensemble: [] as Array<{ brier: number; crps: number }>,
    simple_emos: [] as Array<{ brier: number; crps: number }>,
  };
  for (let index = 0; index < cases.length; index += 1) {
    const current = cases[index];
    const training = cases.slice(0, index).filter((item) =>
      item.date < current.date
      && item.station_code === current.station_code && item.temperature_kind === current.temperature_kind,
    );
    if (training.length < MIN_TRAINING_CASES) continue;
    const climatology = training.map((item) => item.outcome);
    scores.climatology.push({
      brier: categoricalBrier(current.buckets, current.outcome, (bucket) => empiricalBucketProbability(bucket.label, climatology)),
      crps: empiricalCrps(climatology, current.outcome),
    });
    scores.raw_ensemble.push({
      brier: categoricalBrier(current.buckets, current.outcome, (bucket) => empiricalBucketProbability(bucket.label, current.members)),
      crps: empiricalCrps(current.members, current.outcome),
    });
    const fit = fitSimpleEmos(training);
    const mean = fit.a + fit.b * average(current.members);
    const variance = Math.max(0.25, fit.c + fit.d * varianceOf(current.members));
    const sigma = Math.sqrt(variance);
    scores.simple_emos.push({
      brier: categoricalBrier(current.buckets, current.outcome, (bucket) => gaussianBucketProbability(bucket.label, mean, sigma)),
      crps: gaussianCrps(mean, sigma, current.outcome),
    });
  }
  return {
    climatology: aggregate(scores.climatology),
    raw_ensemble: aggregate(scores.raw_ensemble),
    simple_emos: aggregate(scores.simple_emos),
  };
}

function fitSimpleEmos(training: EvaluationCase[]) {
  const means = training.map((item) => average(item.members));
  const outcomes = training.map((item) => item.outcome);
  const meanX = average(means);
  const meanY = average(outcomes);
  const denominator = means.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  const b = denominator > 1e-9
    ? means.reduce((sum, value, index) => sum + (value - meanX) * (outcomes[index] - meanY), 0) / denominator
    : 1;
  const a = meanY - b * meanX;
  const spreads = training.map((item) => varianceOf(item.members));
  const residualSquares = training.map((item, index) => (outcomes[index] - (a + b * means[index])) ** 2);
  const meanSpread = average(spreads);
  const meanResidual = average(residualSquares);
  const spreadDenominator = spreads.reduce((sum, value) => sum + (value - meanSpread) ** 2, 0);
  const d = Math.max(0, spreadDenominator > 1e-9
    ? spreads.reduce((sum, value, index) => sum + (value - meanSpread) * (residualSquares[index] - meanResidual), 0) / spreadDenominator
    : 0);
  const c = Math.max(0.25, meanResidual - d * meanSpread);
  return { a, b, c, d };
}

function categoricalBrier(
  buckets: WeatherBucketDefinition[],
  outcome: number,
  probability: (bucket: WeatherBucketDefinition) => number,
) {
  return buckets.reduce((sum, bucket) => {
    const observed = bucketContains(bucket.label, outcome) ? 1 : 0;
    return sum + (probability(bucket) - observed) ** 2;
  }, 0) / buckets.length;
}

function empiricalBucketProbability(label: string, values: number[]) {
  return values.filter((value) => bucketContains(label, value)).length / values.length;
}

function gaussianBucketProbability(label: string, mean: number, sigma: number) {
  const match = label.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const threshold = Number(match[1]);
  if (/or below|or lower|or less/i.test(label)) return normalCdf((threshold + 0.5 - mean) / sigma);
  if (/or above|or higher|or more/i.test(label)) return 1 - normalCdf((threshold - 0.5 - mean) / sigma);
  return normalCdf((threshold + 0.5 - mean) / sigma) - normalCdf((threshold - 0.5 - mean) / sigma);
}

function bucketContains(label: string, value: number) {
  const match = label.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return false;
  const threshold = Number(match[1]);
  const rounded = Math.round(value);
  if (/or below|or lower|or less/i.test(label)) return rounded <= threshold;
  if (/or above|or higher|or more/i.test(label)) return rounded >= threshold;
  return rounded === threshold;
}

function empiricalCrps(values: number[], outcome: number) {
  const first = average(values.map((value) => Math.abs(value - outcome)));
  let pairwise = 0;
  for (const left of values) for (const right of values) pairwise += Math.abs(left - right);
  return first - pairwise / (2 * values.length * values.length);
}

function gaussianCrps(mean: number, sigma: number, outcome: number) {
  const z = (outcome - mean) / sigma;
  const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  return sigma * (z * (2 * normalCdf(z) - 1) + 2 * phi - 1 / Math.sqrt(Math.PI));
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

function aggregate(values: Array<{ brier: number; crps: number }>): WeatherResearchModelScore {
  return {
    evaluated_cases: values.length,
    mean_brier_score: values.length ? round(average(values.map((item) => item.brier)), 4) : null,
    mean_crps_celsius: values.length ? round(average(values.map((item) => item.crps)), 3) : null,
  };
}

function emptyReport(error: string): WeatherResearchReport {
  const emptyScore = { evaluated_cases: 0, mean_brier_score: null, mean_crps_celsius: null };
  return {
    status: "unavailable", authority: "shadow-only", database: "sqlite", latest_capture_at: null,
    counts: { rule_snapshots: 0, stations: 0, forecast_runs: 0, complete_forecast_runs: 0, partial_forecast_runs: 0, observations: 0, resolutions: 0, exact_resolutions: 0, aligned_complete_cases: 0, heldout_cases: 0 },
    evidence_gate: { required_independent_outcomes: MIN_INDEPENDENT_OUTCOMES, required_per_station_lead_kind_cell: MIN_CELL_OUTCOMES, smallest_cell: 0, passed: false },
    models: { climatology: { ...emptyScore }, raw_ensemble: { ...emptyScore }, simple_emos: { ...emptyScore } },
    detail: "The local weather research database is unavailable; no trading authority was granted.", warnings: [], error,
  };
}

function scalarNumber(db: SqliteDatabase, sql: string) {
  const row = db.prepare(sql).get() as Record<string, unknown> | null | undefined;
  const value = row ? Object.values(row)[0] : 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function scalarText(db: SqliteDatabase, sql: string) {
  const row = db.prepare(sql).get() as Record<string, unknown> | null | undefined;
  const value = row ? Object.values(row)[0] : null;
  return typeof value === "string" ? value : null;
}

function jsonNumbers(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch { return []; }
}

function jsonBuckets(value: string): WeatherBucketDefinition[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WeatherBucketDefinition => Boolean(item && typeof item === "object" && "label" in item && "market_id" in item));
  } catch { return []; }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function finiteOrNull(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function varianceOf(values: number[]) { const mean = average(values); return average(values.map((value) => (value - mean) ** 2)); }
function round(value: number, decimals: number) { const factor = 10 ** decimals; return Math.round(value * factor) / factor; }
function leadBand(retrievedAt: string, targetDate: string) {
  const retrieved = Date.parse(retrievedAt);
  const target = Date.parse(`${targetDate}T12:00:00Z`);
  const hours = Number.isFinite(retrieved) && Number.isFinite(target) ? Math.max(0, (target - retrieved) / 3_600_000) : 0;
  if (hours <= 24) return "0-24h";
  if (hours <= 48) return "24-48h";
  if (hours <= 72) return "48-72h";
  return "72h+";
}

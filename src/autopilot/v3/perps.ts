/**
 * Drift perps data adapter (V3 plan §P4) — the data source behind the
 * funding_basis module. Venue choice: Drift, for its public keyless data API.
 *
 * Endpoint (shape verified live 2026-07-05):
 *   GET {DRIFT_DATA_API_URL|https://data.api.drift.trade}/market/{SOL-PERP}/fundingRates
 *   → { success, records: [{ ts (unix sec), symbol, fundingRate ("-0.001024958",
 *      dollars per base per HOUR), oraclePriceTwap, markPriceTwap, ... }] }
 * Hourly funding fraction = fundingRate / oraclePriceTwap.
 *
 * HARD FRESHNESS RULE: the public mirror has been observed serving a stale
 * window. Records older than MAX_FRESH_AGE_MS produce `fresh: false` and the
 * funding module generates NO candidates — a market-neutral strategy fed stale
 * funding is not market-neutral, it's a guess. Fail closed, always.
 */

export type DriftFundingRecord = {
  ts_ms: number;
  funding_rate_hourly_frac: number; // fundingRate / oracleTwap
  oracle_twap: number;
  mark_twap: number;
};

export type FundingSnapshot = {
  market: string;
  fresh: boolean;
  latest_ts_ms: number | null;
  /** Funding per 8h as a percent (positive = longs pay shorts). */
  funding_rate_8h_pct: number | null;
  /** Consecutive recent 8h windows with the same sign as the latest rate. */
  persistence_windows: number;
  /** Mark vs oracle TWAP divergence, percent — the basis. */
  basis_pct: number | null;
};

export const MAX_FRESH_AGE_MS = 3 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 30 * 60_000;

/** Universe mint ↔ Drift market mapping (majors with liquid perps). */
export const PERP_MARKET_BY_MINT: Record<string, string> = {
  So11111111111111111111111111111111111111112: "SOL-PERP",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH-PERP",
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": "BTC-PERP",
};

function asNum(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Pure parser over the verified endpoint body. Newest first in, newest first out. */
export function parseFundingRecords(body: unknown): DriftFundingRecord[] {
  if (!body || typeof body !== "object") return [];
  const records = (body as { records?: unknown }).records;
  if (!Array.isArray(records)) return [];
  const out: DriftFundingRecord[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const ts = asNum(row.ts);
    const rate = asNum(row.fundingRate);
    const oracle = asNum(row.oraclePriceTwap);
    const mark = asNum(row.markPriceTwap);
    if (ts === null || rate === null || oracle === null || oracle <= 0) continue;
    out.push({
      ts_ms: ts * 1000,
      funding_rate_hourly_frac: rate / oracle,
      oracle_twap: oracle,
      mark_twap: mark ?? oracle,
    });
  }
  return out.sort((a, b) => b.ts_ms - a.ts_ms);
}

/**
 * Pure: summarize parsed records into the funding module's input. Freshness is
 * enforced HERE — stale records yield fresh:false and null rates.
 */
export function fundingSnapshotFromRecords(market: string, records: DriftFundingRecord[], nowMs: number): FundingSnapshot {
  const empty: FundingSnapshot = { market, fresh: false, latest_ts_ms: null, funding_rate_8h_pct: null, persistence_windows: 0, basis_pct: null };
  if (records.length === 0) return empty;
  const latest = records[0];
  if (nowMs - latest.ts_ms > MAX_FRESH_AGE_MS) return { ...empty, latest_ts_ms: latest.ts_ms };

  // 8h rate from the mean of the last up-to-8 hourly records (same-sign runs).
  const recent = records.slice(0, 8);
  const meanHourly = recent.reduce((a, r) => a + r.funding_rate_hourly_frac, 0) / recent.length;
  const rate8hPct = meanHourly * 8 * 100;

  // Persistence: count consecutive 8-record windows whose mean keeps the sign.
  const sign = Math.sign(rate8hPct);
  let persistence = 0;
  for (let start = 0; start + 8 <= records.length && persistence < 6; start += 8) {
    const window = records.slice(start, start + 8);
    const mean = window.reduce((a, r) => a + r.funding_rate_hourly_frac, 0) / window.length;
    if (Math.sign(mean) === sign && sign !== 0) persistence += 1;
    else break;
  }

  const basisPct = latest.oracle_twap > 0 ? ((latest.mark_twap - latest.oracle_twap) / latest.oracle_twap) * 100 : null;
  return { market, fresh: true, latest_ts_ms: latest.ts_ms, funding_rate_8h_pct: rate8hPct, persistence_windows: persistence, basis_pct: basisPct };
}

// --- fetch shell (cached, never throws) ----------------------------------------

const cache = new Map<string, { snapshot: FundingSnapshot; fetchedAtMs: number }>();

/** Test seam. */
export function __resetPerpsCacheForTests(): void {
  cache.clear();
}

export async function fetchDriftFunding(market: string, nowMs: number = Date.now()): Promise<FundingSnapshot> {
  const cached = cache.get(market);
  if (cached && nowMs - cached.fetchedAtMs < CACHE_TTL_MS) return cached.snapshot;
  const base = process.env.DRIFT_DATA_API_URL ?? "https://data.api.drift.trade";
  let snapshot: FundingSnapshot;
  try {
    const response = await fetch(`${base}/market/${market}/fundingRates`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    snapshot = response.ok
      ? fundingSnapshotFromRecords(market, parseFundingRecords(await response.json()), nowMs)
      : { market, fresh: false, latest_ts_ms: null, funding_rate_8h_pct: null, persistence_windows: 0, basis_pct: null };
  } catch {
    snapshot = { market, fresh: false, latest_ts_ms: null, funding_rate_8h_pct: null, persistence_windows: 0, basis_pct: null };
  }
  cache.set(market, { snapshot, fetchedAtMs: nowMs });
  return snapshot;
}

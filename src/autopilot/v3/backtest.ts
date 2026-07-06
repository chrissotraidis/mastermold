/**
 * V3 walk-forward validation harness (V3 plan §P5 + the go-live gate; report
 * discipline: "naive strategies collapsed once transaction costs were imposed").
 *
 * This module decides whether ANY scoring rule — today's deterministic xsec
 * hand-score, tomorrow's trained model — has positive NET expectancy on the
 * accumulated candidate dataset, with zero look-ahead:
 *
 * - Labeled snapshots are sorted chronologically and split into `folds`
 *   contiguous, non-overlapping time slices.
 * - For each fold k ≥ 1, everything strictly BEFORE slice k is "train" and is
 *   the only data the entry-floor calibration may see (mimicking real usage,
 *   where a threshold is tuned on the past). Slice k alone is "test".
 * - Fold 0 has no past, so it is never tested — it only ever serves as train.
 * - A "trade" is a test snapshot whose score clears the train-calibrated floor;
 *   its outcome is the stored forward return at the horizon MINUS the round-trip
 *   execution cost (fixed via config, or each row's own modeled cost).
 *
 * Pure: no IO, no store access, no clocks. The runner lives in
 * `scripts/v3-backtest.ts`; tests fabricate synthetic labeled snapshots.
 */

import type { CandidateSnapshotRow } from "./candidate-store";

/** A scoring rule under validation: features at decision time → score. */
export type ScoringFn = (features: Record<string, number | string | boolean>) => number;

export type BacktestHorizon = "30m" | "2h" | "6h";

export type BacktestConfig = {
  /** Fallback/base entry floor — always a member of the calibration grid. */
  entry_score_floor: number;
  /** Fixed round-trip cost in bps; null = charge each row its own cost_total_bps. */
  cost_total_bps: number | null;
  /** Which stored forward label the outcome is read from. */
  horizon: BacktestHorizon;
  /** Number of contiguous time slices (fold 0 is train-only, never tested). */
  folds: number;
};

export type FoldResult = {
  fold: number;
  train_n: number;
  test_n: number;
  trades: number;
  mean_net_bps: number;
  hit_rate: number;
  profit_factor: number;
  total_net_bps: number;
};

export type BacktestReport = {
  folds: FoldResult[];
  overall: { trades: number; mean_net_bps: number; hit_rate: number; profit_factor: number };
  verdict: string;
};

/** Go-live-gate thresholds the verdict is judged against (plan §"new go-live gate"). */
export const MIN_TRADES_FOR_VERDICT = 20;
export const MIN_PROFIT_FACTOR = 1.25;
export const POSITIVE_VERDICT = "POSITIVE out-of-sample expectancy";

const RETURN_KEY: Record<BacktestHorizon, "return_30m_bps" | "return_2h_bps" | "return_6h_bps"> = {
  "30m": "return_30m_bps",
  "2h": "return_2h_bps",
  "6h": "return_6h_bps",
};

/** Calibration grid: these train-score quantiles are tried as entry floors. */
const FLOOR_QUANTILES = [0.5, 0.6, 0.7, 0.8, 0.9];

const round2 = (x: number): number => Math.round(x * 100) / 100;
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * The dataset stores the score AT DECISION TIME (shadow writes it into
 * `features.score` for entered and skipped candidates alike). Re-deriving a
 * score after the fact would be a silent chance to leak hindsight, so when the
 * stored score is absent the row is unscorable: -Infinity (never trades).
 */
export function scoreFromSnapshotFeatures(row: Pick<CandidateSnapshotRow, "features">): number {
  const raw = row.features["score"];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : -Infinity;
}

/** `scoreFromSnapshotFeatures` packaged as a ScoringFn for walkForward. */
export const storedScore: ScoringFn = (features) => scoreFromSnapshotFeatures({ features });

/**
 * Contiguous [start, end) index ranges splitting `n` chronological rows into
 * `folds` slices, sized as evenly as possible (earlier slices absorb the
 * remainder). Exported so tests can prove non-overlap directly.
 */
export function foldSlices(n: number, folds: number): Array<[number, number]> {
  const k = Math.max(2, Math.floor(folds));
  const base = Math.floor(n / k);
  const remainder = n % k;
  const slices: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i < k; i++) {
    const size = base + (i < remainder ? 1 : 0);
    slices.push([start, start + size]);
    start += size;
  }
  return slices;
}

type ScoredRow = { score: number; net: number };

/**
 * Threshold-calibration step, TRAIN DATA ONLY. For the hand score there is
 * nothing to fit, so the "fit" is the one knob real usage has: the entry
 * floor. Candidate floors are train-score quantiles plus the configured base
 * floor; the floor maximizing TOTAL train net-bps wins (ties → the higher,
 * more selective floor). Empty/unscorable train falls back to the base floor.
 */
export function calibrateEntryFloor(train: ScoredRow[], baseFloor: number): number {
  const scores = train
    .map((t) => t.score)
    .filter((s) => Number.isFinite(s))
    .sort((a, b) => a - b);
  const grid = new Set<number>([baseFloor]);
  for (const q of FLOOR_QUANTILES) {
    if (scores.length > 0) grid.add(scores[Math.min(scores.length - 1, Math.floor(q * scores.length))]);
  }
  let bestFloor = baseFloor;
  let bestTotal = -Infinity;
  for (const floor of [...grid].sort((a, b) => a - b)) {
    let total = 0;
    let trades = 0;
    for (const t of train) {
      if (Number.isFinite(t.score) && t.score >= floor) {
        total += t.net;
        trades += 1;
      }
    }
    if (trades === 0) continue; // a floor nothing clears teaches nothing
    if (total > bestTotal || (total === bestTotal && floor > bestFloor)) {
      bestTotal = total;
      bestFloor = floor;
    }
  }
  return bestFloor;
}

function aggregate(nets: number[]): { trades: number; mean_net_bps: number; hit_rate: number; profit_factor: number; total_net_bps: number } {
  const trades = nets.length;
  if (trades === 0) return { trades: 0, mean_net_bps: 0, hit_rate: 0, profit_factor: 0, total_net_bps: 0 };
  const total = nets.reduce((sum, n) => sum + n, 0);
  const wins = nets.filter((n) => n > 0);
  const grossWins = wins.reduce((sum, n) => sum + n, 0);
  const grossLosses = nets.filter((n) => n < 0).reduce((sum, n) => sum - n, 0);
  const profitFactor = grossLosses > 0 ? round2(grossWins / grossLosses) : grossWins > 0 ? Infinity : 0;
  return {
    trades,
    mean_net_bps: round2(total / trades),
    hit_rate: round3(wins.length / trades),
    profit_factor: profitFactor,
    total_net_bps: round2(total),
  };
}

function verdictFor(overall: { trades: number; mean_net_bps: number; profit_factor: number }): string {
  const failures: string[] = [];
  if (overall.trades < MIN_TRADES_FOR_VERDICT) {
    failures.push(`too few trades (${overall.trades} < ${MIN_TRADES_FOR_VERDICT})`);
  }
  if (overall.trades > 0 && overall.mean_net_bps <= 0) {
    failures.push(`negative expectancy (${overall.mean_net_bps} net bps/trade after costs)`);
  }
  if (overall.trades > 0 && overall.profit_factor < MIN_PROFIT_FACTOR) {
    failures.push(`weak profit factor (${overall.profit_factor} < ${MIN_PROFIT_FACTOR})`);
  }
  return failures.length === 0 ? POSITIVE_VERDICT : `NOT VALIDATED: ${failures.join("; ")}`;
}

/**
 * Walk-forward validation of `score` over labeled candidate snapshots.
 * Leakage guarantees: rows are used exactly once as test; calibration for fold
 * k reads only rows chronologically before slice k; fold 0 is skipped.
 */
export function walkForward(
  snapshots: CandidateSnapshotRow[],
  score: ScoringFn,
  config: BacktestConfig,
): BacktestReport {
  const key = RETURN_KEY[config.horizon];
  const scored: ScoredRow[] = snapshots
    .filter((row) => row.labeled && row[key] !== null && Number.isFinite(row[key] as number))
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .map((row) => ({
      score: score(row.features),
      net: (row[key] as number) - (config.cost_total_bps ?? row.cost_total_bps),
    }));

  const slices = foldSlices(scored.length, config.folds);
  const folds: FoldResult[] = [];
  const pooled: number[] = [];
  for (let k = 1; k < slices.length; k++) {
    const [start, end] = slices[k];
    const train = scored.slice(0, start); // strictly before slice k — no future data
    const test = scored.slice(start, end);
    const floor = calibrateEntryFloor(train, config.entry_score_floor);
    const nets = test.filter((t) => Number.isFinite(t.score) && t.score >= floor).map((t) => t.net);
    pooled.push(...nets);
    folds.push({ fold: k, train_n: train.length, test_n: test.length, ...aggregate(nets) });
  }

  const pooledAgg = aggregate(pooled);
  const overall = {
    trades: pooledAgg.trades,
    mean_net_bps: pooledAgg.mean_net_bps,
    hit_rate: pooledAgg.hit_rate,
    profit_factor: pooledAgg.profit_factor,
  };
  return { folds, overall, verdict: verdictFor(overall) };
}

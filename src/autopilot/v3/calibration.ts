/**
 * V3 calibration — the "learn from your own record" evaluator. Pure summary
 * over LABELED candidate snapshots: did high xsec scores actually precede
 * gains? What was the realized 2h outcome of would-enters vs skips, net of the
 * modeled cost? This is what the nightly Analyst reads to critique the
 * strategy with evidence instead of vibes, and later what validates the
 * trained model against the hand score.
 */

import type { CandidateSnapshotRow } from "./candidate-store";

export type CalibrationSummary = {
  total_snapshots: number;
  labeled_snapshots: number;
  /** Mean realized 2h return (bps) for enter vs skip decisions. */
  enter_mean_2h_bps: number | null;
  skip_mean_2h_bps: number | null;
  /** Of labeled enters, the fraction whose 2h return beat their modeled cost. */
  enter_hit_rate: number | null;
  /** Number and net expectancy of labeled would-enters after modeled cost. */
  enter_count: number;
  enter_net_mean_bps: number | null;
  /** OLS slope: predicted net EV at decision time → realized net return. */
  ev_realized_slope: number | null;
  /** Realized mean 2h return by score bucket (low/mid/high thirds). */
  score_buckets: Array<{ bucket: "low" | "mid" | "high"; n: number; mean_2h_bps: number | null }>;
  /** One-line verdict for the Analyst prompt / terminal. */
  verdict: string;
};

function mean(values: number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

function scoreOf(row: CandidateSnapshotRow): number | null {
  const s = row.features.score;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (row.strategy_id === "cusum_tb") {
    const magnitude = row.features.magnitude;
    const hPct = row.features.h_pct;
    if (
      typeof magnitude === "number" && Number.isFinite(magnitude) &&
      typeof hPct === "number" && Number.isFinite(hPct) && hPct > 0
    ) return magnitude / (hPct / 100);
  }
  return null;
}

export function directionalReturn2h(row: CandidateSnapshotRow): number {
  const value = row.return_2h_bps as number;
  if (row.strategy_id === "cusum_tb" && row.features.direction === "down") return -value;
  if (row.strategy_id === "bar_portion" && row.features.direction === "sell") return -value;
  return value;
}

export function realizedNetBps(row: CandidateSnapshotRow): number {
  return directionalReturn2h(row) - row.cost_total_bps;
}

function regressionSlope(rows: CandidateSnapshotRow[]): number | null {
  if (rows.length < 10) return null;
  const xMean = rows.reduce((sum, row) => sum + row.expected_value_bps, 0) / rows.length;
  const yMean = rows.reduce((sum, row) => sum + realizedNetBps(row), 0) / rows.length;
  let covariance = 0; let variance = 0;
  for (const row of rows) {
    const x = row.expected_value_bps - xMean;
    covariance += x * (realizedNetBps(row) - yMean); variance += x * x;
  }
  return variance > 0 ? Math.round((covariance / variance) * 1_000) / 1_000 : null;
}

export function calibrate(snapshots: CandidateSnapshotRow[]): CalibrationSummary {
  const labeled = snapshots.filter((row) => row.labeled && row.return_2h_bps !== null);
  const enters = labeled.filter((row) => row.decision === "enter");
  const skips = labeled.filter((row) => row.decision === "skip");

  const enterReturns = enters.map(directionalReturn2h);
  const skipReturns = skips.map(directionalReturn2h);
  const hits = enters.filter((row) => directionalReturn2h(row) > row.cost_total_bps).length;

  // Score buckets across all labeled rows with a score feature.
  const scored = labeled
    .map((row) => ({ score: scoreOf(row), ret: directionalReturn2h(row) }))
    .filter((x): x is { score: number; ret: number } => x.score !== null)
    .sort((a, b) => a.score - b.score);
  const third = Math.floor(scored.length / 3);
  const buckets: CalibrationSummary["score_buckets"] =
    scored.length >= 6
      ? [
          { bucket: "low", n: third, mean_2h_bps: mean(scored.slice(0, third).map((x) => x.ret)) },
          { bucket: "mid", n: scored.length - 2 * third, mean_2h_bps: mean(scored.slice(third, scored.length - third).map((x) => x.ret)) },
          { bucket: "high", n: third, mean_2h_bps: mean(scored.slice(scored.length - third).map((x) => x.ret)) },
        ]
      : [];

  const enterMean = mean(enterReturns);
  const skipMean = mean(skipReturns);
  const hitRate = enters.length > 0 ? Math.round((hits / enters.length) * 100) / 100 : null;
  const enterNetMean = mean(enters.map(realizedNetBps));
  const slope = regressionSlope(enters);

  let verdict: string;
  if (labeled.length < 10) {
    verdict = `Too few labeled snapshots (${labeled.length}) to judge the signal — keep collecting.`;
  } else if (buckets.length === 3 && buckets[2].mean_2h_bps !== null && buckets[0].mean_2h_bps !== null) {
    const spread = (buckets[2].mean_2h_bps ?? 0) - (buckets[0].mean_2h_bps ?? 0);
    verdict =
      spread > 10
        ? `Score is predictive: high-score bucket beats low by ${spread.toFixed(0)}bp over 2h.`
        : spread < -10
          ? `Score is INVERTED: high-score bucket UNDERPERFORMS low by ${Math.abs(spread).toFixed(0)}bp — the signal is wrong, do not trade it.`
          : `Score shows no separation (${spread.toFixed(0)}bp high-vs-low) — no evidence of edge yet.`;
  } else {
    verdict = `Insufficient scored coverage for bucket analysis (${labeled.length} labeled).`;
  }

  return {
    total_snapshots: snapshots.length,
    labeled_snapshots: labeled.length,
    enter_mean_2h_bps: enterMean,
    skip_mean_2h_bps: skipMean,
    enter_hit_rate: hitRate,
    enter_count: enters.length,
    enter_net_mean_bps: enterNetMean,
    ev_realized_slope: slope,
    score_buckets: buckets,
    verdict,
  };
}

export function calibrateStrategy(snapshots: CandidateSnapshotRow[], strategyId: string): CalibrationSummary {
  return calibrate(snapshots.filter((row) => row.strategy_id === strategyId));
}

export type CusumEdgeCalibration = {
  value: number;
  sample_count: number;
  updated: boolean;
};

/** Weekly CUSUM expectancy calibration; callers pass only cusum_tb rows. */
export function calibrateCusumEdgeRatio(
  snapshots: CandidateSnapshotRow[],
  prior = 0.15,
  minSamples = 40,
): CusumEdgeCalibration {
  const enters = snapshots.filter((row) =>
    row.strategy_id === "cusum_tb" &&
    row.decision === "enter" &&
    row.labeled &&
    row.return_2h_bps !== null &&
    row.features.venue !== "drift_perp" &&
    typeof row.features.barrier_bps === "number" &&
    Number.isFinite(row.features.barrier_bps) &&
    row.features.barrier_bps > 0,
  );
  if (enters.length < minSamples) return { value: prior, sample_count: enters.length, updated: false };
  const realizedMean = enters.reduce((sum, row) => sum + directionalReturn2h(row), 0) / enters.length;
  const barrierMean = enters.reduce((sum, row) => sum + (row.features.barrier_bps as number), 0) / enters.length;
  const value = Math.min(0.3, Math.max(0.05, realizedMean / barrierMean));
  return { value: Math.round(value * 10_000) / 10_000, sample_count: enters.length, updated: true };
}

export function calibrateBarPortionEdgeRatio(
  snapshots: CandidateSnapshotRow[],
  prior = 0.25,
  minSamples = 40,
): CusumEdgeCalibration {
  const enters = snapshots.filter((row) =>
    row.strategy_id === "bar_portion" && row.decision === "enter" && row.labeled &&
    row.return_30m_bps !== null && typeof row.features.bp === "number" &&
    typeof row.features.atr_bps === "number" && row.features.atr_bps > 0,
  );
  if (enters.length < minSamples) return { value: prior, sample_count: enters.length, updated: false };
  const realizedMean = enters.reduce((sum, row) => {
    const directional = row.features.direction === "sell" ? -(row.return_30m_bps as number) : row.return_30m_bps as number;
    return sum + directional;
  }, 0) / enters.length;
  const moveMean = enters.reduce(
    (sum, row) => sum + Math.abs(row.features.bp as number) * (row.features.atr_bps as number),
    0,
  ) / enters.length;
  const value = Math.min(0.5, Math.max(0.05, realizedMean / moveMean));
  return { value: Math.round(value * 10_000) / 10_000, sample_count: enters.length, updated: true };
}

/** Compact block for the Analyst's nightly prompt. */
export function describeCalibration(summary: CalibrationSummary): string {
  const parts = [
    `V3 SHADOW CALIBRATION (labeled ${summary.labeled_snapshots}/${summary.total_snapshots}):`,
    summary.enter_mean_2h_bps !== null ? `would-enter mean 2h: ${summary.enter_mean_2h_bps}bp` : "no labeled enters yet",
    summary.skip_mean_2h_bps !== null ? `skip mean 2h: ${summary.skip_mean_2h_bps}bp` : "no labeled skips yet",
    summary.enter_hit_rate !== null ? `enter hit rate vs cost: ${(summary.enter_hit_rate * 100).toFixed(0)}%` : "",
    summary.enter_net_mean_bps !== null ? `would-enter net mean: ${summary.enter_net_mean_bps}bp (${summary.enter_count} enters)` : "",
    summary.ev_realized_slope !== null ? `EV calibration slope: ${summary.ev_realized_slope}` : "",
    ...summary.score_buckets.map((b) => `${b.bucket}-score bucket (${b.n}): ${b.mean_2h_bps ?? "?"}bp`),
    `VERDICT: ${summary.verdict}`,
  ].filter(Boolean);
  return parts.join("\n");
}

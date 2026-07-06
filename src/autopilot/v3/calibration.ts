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
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

export function calibrate(snapshots: CandidateSnapshotRow[]): CalibrationSummary {
  const labeled = snapshots.filter((row) => row.labeled && row.return_2h_bps !== null);
  const enters = labeled.filter((row) => row.decision === "enter");
  const skips = labeled.filter((row) => row.decision === "skip");

  const enterReturns = enters.map((row) => row.return_2h_bps as number);
  const skipReturns = skips.map((row) => row.return_2h_bps as number);
  const hits = enters.filter((row) => (row.return_2h_bps as number) > row.cost_total_bps).length;

  // Score buckets across all labeled rows with a score feature.
  const scored = labeled
    .map((row) => ({ score: scoreOf(row), ret: row.return_2h_bps as number }))
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
    score_buckets: buckets,
    verdict,
  };
}

/** Compact block for the Analyst's nightly prompt. */
export function describeCalibration(summary: CalibrationSummary): string {
  const parts = [
    `V3 SHADOW CALIBRATION (labeled ${summary.labeled_snapshots}/${summary.total_snapshots}):`,
    summary.enter_mean_2h_bps !== null ? `would-enter mean 2h: ${summary.enter_mean_2h_bps}bp` : "no labeled enters yet",
    summary.skip_mean_2h_bps !== null ? `skip mean 2h: ${summary.skip_mean_2h_bps}bp` : "no labeled skips yet",
    summary.enter_hit_rate !== null ? `enter hit rate vs cost: ${(summary.enter_hit_rate * 100).toFixed(0)}%` : "",
    ...summary.score_buckets.map((b) => `${b.bucket}-score bucket (${b.n}): ${b.mean_2h_bps ?? "?"}bp`),
    `VERDICT: ${summary.verdict}`,
  ].filter(Boolean);
  return parts.join("\n");
}

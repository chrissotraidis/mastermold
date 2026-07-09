/**
 * V3 paper-promotion gate (2026-07-09): the evidence bar a shadow module must
 * clear before its candidates co-pilot the PAPER book alongside v2. Same
 * philosophy as the go-live gate — pure derivation, "not yet" by default, and
 * the promotion is to paper only: live routing keeps its own, stricter gate.
 *
 * The V3 shadow has been recording would-enter/skip snapshots and forward
 * labels since 2026-07-05; this converts that accumulating calibration record
 * into a yes/no with visible checks, so "the bot learns as it makes more good
 * trades than bad" is an auditable mechanism instead of a hope.
 */

import type { CalibrationSummary } from "./calibration";

export const PROMOTION_MIN_LABELED = 150;
export const PROMOTION_MIN_HIT_RATE = 0.5;

export type PromotionCheck = {
  key: "dataset" | "edge" | "hit_rate" | "not_inverted";
  label: string;
  pass: boolean;
  detail: string;
};

export type V3Promotion = {
  ready: boolean;
  checks: PromotionCheck[];
};

export function evaluateV3Promotion(calibration: CalibrationSummary): V3Promotion {
  const dataset: PromotionCheck = {
    key: "dataset",
    label: `≥${PROMOTION_MIN_LABELED} forward-labeled snapshots`,
    pass: calibration.labeled_snapshots >= PROMOTION_MIN_LABELED,
    detail: `${calibration.labeled_snapshots} labeled so far`,
  };

  const enterMean = calibration.enter_mean_2h_bps;
  const skipMean = calibration.skip_mean_2h_bps;
  const edge: PromotionCheck = {
    key: "edge",
    label: "would-enters realized a positive 2h mean, ahead of skips",
    pass: enterMean !== null && enterMean > 0 && (skipMean === null || enterMean > skipMean),
    detail:
      enterMean === null
        ? "no labeled would-enters yet"
        : `enters ${enterMean}bp vs skips ${skipMean ?? "n/a"}bp over 2h`,
  };

  const hitRate: PromotionCheck = {
    key: "hit_rate",
    label: `≥${PROMOTION_MIN_HIT_RATE * 100}% of would-enters beat their modeled cost`,
    pass: calibration.enter_hit_rate !== null && calibration.enter_hit_rate >= PROMOTION_MIN_HIT_RATE,
    detail: calibration.enter_hit_rate !== null ? `${Math.round(calibration.enter_hit_rate * 100)}% hit rate` : "no labeled enters yet",
  };

  // An inverted score (high-score bucket underperforming low) means the signal
  // is anti-predictive — the one outcome that must hard-block promotion.
  const buckets = calibration.score_buckets;
  const spread =
    buckets.length === 3 && buckets[2].mean_2h_bps !== null && buckets[0].mean_2h_bps !== null
      ? (buckets[2].mean_2h_bps ?? 0) - (buckets[0].mean_2h_bps ?? 0)
      : null;
  const notInverted: PromotionCheck = {
    key: "not_inverted",
    label: "high-score bucket does not underperform low",
    pass: spread === null ? false : spread > -10,
    detail: spread === null ? "insufficient scored coverage for buckets" : `high-vs-low spread ${spread.toFixed(0)}bp`,
  };

  const checks = [dataset, edge, hitRate, notInverted];
  return { ready: checks.every((check) => check.pass), checks };
}

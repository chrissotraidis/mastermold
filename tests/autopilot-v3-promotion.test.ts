/// <reference types="bun" />

/**
 * V3 paper-promotion gate: pure over the calibration summary — "not yet" by
 * default, open only on a real labeled dataset with realized edge, and
 * hard-blocked by an inverted score. No store, no network.
 */

import { describe, expect, test } from "bun:test";

import type { CalibrationSummary } from "../src/autopilot/v3/calibration";
import { evaluateV3Promotion, PROMOTION_MIN_LABELED } from "../src/autopilot/v3/promotion";

function calibration(over: Partial<CalibrationSummary> = {}): CalibrationSummary {
  return {
    total_snapshots: 400,
    labeled_snapshots: PROMOTION_MIN_LABELED + 10,
    enter_mean_2h_bps: 22,
    skip_mean_2h_bps: -4,
    enter_hit_rate: 0.58,
    score_buckets: [
      { bucket: "low", n: 50, mean_2h_bps: -6 },
      { bucket: "mid", n: 60, mean_2h_bps: 4 },
      { bucket: "high", n: 50, mean_2h_bps: 18 },
    ],
    verdict: "Score is predictive.",
    ...over,
  };
}

describe("evaluateV3Promotion", () => {
  test("GIVEN a labeled dataset with realized edge THEN the gate opens", () => {
    const promotion = evaluateV3Promotion(calibration());
    expect(promotion.ready).toBe(true);
    expect(promotion.checks.every((check) => check.pass)).toBe(true);
  });

  test("GIVEN a fresh empty record THEN every check says not yet", () => {
    const promotion = evaluateV3Promotion(
      calibration({
        labeled_snapshots: 0,
        enter_mean_2h_bps: null,
        skip_mean_2h_bps: null,
        enter_hit_rate: null,
        score_buckets: [],
      }),
    );
    expect(promotion.ready).toBe(false);
    expect(promotion.checks.some((check) => check.pass)).toBe(false);
  });

  test("GIVEN too few labels THEN the dataset check blocks alone", () => {
    const promotion = evaluateV3Promotion(calibration({ labeled_snapshots: PROMOTION_MIN_LABELED - 1 }));
    expect(promotion.ready).toBe(false);
    expect(promotion.checks.find((check) => check.key === "dataset")?.pass).toBe(false);
  });

  test("GIVEN enters that lose or trail skips THEN the edge check blocks", () => {
    expect(evaluateV3Promotion(calibration({ enter_mean_2h_bps: -3 })).ready).toBe(false);
    expect(evaluateV3Promotion(calibration({ enter_mean_2h_bps: 5, skip_mean_2h_bps: 9 })).ready).toBe(false);
  });

  test("GIVEN an inverted score THEN promotion is hard-blocked", () => {
    const promotion = evaluateV3Promotion(
      calibration({
        score_buckets: [
          { bucket: "low", n: 50, mean_2h_bps: 20 },
          { bucket: "mid", n: 60, mean_2h_bps: 2 },
          { bucket: "high", n: 50, mean_2h_bps: -15 },
        ],
      }),
    );
    expect(promotion.ready).toBe(false);
    expect(promotion.checks.find((check) => check.key === "not_inverted")?.pass).toBe(false);
  });
});

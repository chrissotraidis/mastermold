/// <reference types="bun" />

/**
 * V3 paper-promotion gate: pure over the calibration summary — "not yet" by
 * default, open only on a real labeled dataset with realized edge, and
 * hard-blocked by an inverted score. No store, no network.
 */

import { describe, expect, test } from "bun:test";

import type { CalibrationSummary } from "../src/autopilot/v3/calibration";
import { evaluateModuleLiveCandidate, evaluateV3Promotion, isPaperCopilotCandidate, paperPromotionSnapshots, PROMOTION_MIN_LABELED } from "../src/autopilot/v3/promotion";
import type { ReplayPromotionEvidence } from "../src/autopilot/v3/replay/types";

const replay: ReplayPromotionEvidence = {
  config_hash: "golden", report_path: "docs/private/replay-reports/golden.md", data_months: 12,
  positive_walk_forward_quarters: 3, doubled_cost_positive: true, base_mean_net_bps: 30,
  ts: "2026-07-12T00:00:00.000Z",
};

function calibration(over: Partial<CalibrationSummary> = {}): CalibrationSummary {
  return {
    total_snapshots: 400,
    labeled_snapshots: PROMOTION_MIN_LABELED + 10,
    enter_mean_2h_bps: 22,
    skip_mean_2h_bps: -4,
    enter_hit_rate: 0.58,
    enter_count: 50,
    enter_net_mean_bps: 22,
    ev_realized_slope: 0.9,
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
    const promotion = evaluateV3Promotion(calibration(), replay);
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
        enter_count: 0,
        enter_net_mean_bps: null,
        ev_realized_slope: null,
        score_buckets: [],
      }),
    );
    expect(promotion.ready).toBe(false);
    expect(promotion.checks.some((check) => check.pass)).toBe(false);
  });

  test("GIVEN too few labels THEN the dataset check blocks alone", () => {
    const promotion = evaluateV3Promotion(calibration({ labeled_snapshots: PROMOTION_MIN_LABELED - 1 }), replay);
    expect(promotion.ready).toBe(false);
    expect(promotion.checks.find((check) => check.key === "dataset")?.pass).toBe(false);
  });

  test("GIVEN enters that lose or trail skips THEN the edge check blocks", () => {
    expect(evaluateV3Promotion(calibration({ enter_mean_2h_bps: -3 }), replay).ready).toBe(false);
    expect(evaluateV3Promotion(calibration({ enter_mean_2h_bps: 5, skip_mean_2h_bps: 9 }), replay).ready).toBe(false);
  });

  test("GIVEN an inverted score THEN promotion is hard-blocked", () => {
    const promotion = evaluateV3Promotion(
      calibration({
        score_buckets: [
          { bucket: "low", n: 50, mean_2h_bps: 20 },
          { bucket: "mid", n: 60, mean_2h_bps: 2 },
          { bucket: "high", n: 50, mean_2h_bps: -15 },
        ],
      }), replay,
    );
    expect(promotion.ready).toBe(false);
    expect(promotion.checks.find((check) => check.key === "not_inverted")?.pass).toBe(false);
  });

  test("GIVEN no replay confirmation THEN promotion remains operator-blocked", () => {
    const promotion = evaluateV3Promotion(calibration());
    expect(promotion.ready).toBe(false);
    expect(promotion.checks.find((check) => check.key === "replay")?.pass).toBe(false);
  });

  test("Drift-perp observations never count toward or enter the paper co-pilot", () => {
    expect(isPaperCopilotCandidate({ features: { venue: "drift_perp" } })).toBe(false);
    expect(paperPromotionSnapshots([{ strategy_id: "cusum_tb", features: { venue: "drift_perp" } } as never], "cusum_tb")).toEqual([]);
  });
});

describe("V3 live-routing candidacy", () => {
  test("requires the untouched global gate, four paper weeks, non-negative module net, and zero module halts", () => {
    const now = Date.parse("2026-07-12T00:00:00.000Z");
    const trades = [
      { ts: "2026-06-01T00:00:00.000Z", side: "buy" as const, mint: "m", value_usd: 100, fee_usd: 1, strategy_id: "cusum_tb", mode: "paper" as const },
      { ts: "2026-06-02T00:00:00.000Z", side: "sell" as const, mint: "m", value_usd: 105, fee_usd: 1, strategy_id: "cusum_tb", mode: "paper" as const },
    ];
    expect(evaluateModuleLiveCandidate({ trades, strategy_id: "cusum_tb", now_ms: now, existing_go_live_gate_passes: true, module_risk_halts: 0 })).toMatchObject({ ready: true, paper_round_trips: 1, paper_net_bps: 300 });
    expect(evaluateModuleLiveCandidate({ trades, strategy_id: "cusum_tb", now_ms: now, existing_go_live_gate_passes: true, module_risk_halts: 1 }).ready).toBe(false);
    expect(evaluateModuleLiveCandidate({ trades, strategy_id: "cusum_tb", now_ms: now, existing_go_live_gate_passes: false, module_risk_halts: 0 }).ready).toBe(false);
  });
});

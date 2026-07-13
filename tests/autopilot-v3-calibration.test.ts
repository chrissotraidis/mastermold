/// <reference types="bun" />

/**
 * V3 calibration — the learn-from-your-own-record evaluator. Pure.
 */

import { describe, expect, test } from "bun:test";

import { calibrate, calibrateCusumEdgeRatio, calibrateStrategy, describeCalibration } from "../src/autopilot/v3/calibration";
import type { CandidateSnapshotRow } from "../src/autopilot/v3/candidate-store";

function snap(over: Partial<CandidateSnapshotRow>): CandidateSnapshotRow {
  return {
    id: `c-${Math.random()}`, ts: "2026-07-05T00:00:00.000Z", strategy_id: "xsec",
    token_mint: "m", symbol: "SOL", decision: "skip", features: { score: 1 },
    cost_total_bps: 60, expected_value_bps: 0, confidence: 0.5, price_usd_at_snapshot: 100,
    return_30m_bps: null, return_2h_bps: null, return_6h_bps: null,
    max_adverse_2h_bps: null, max_favorable_2h_bps: null, labeled: false,
    ...over,
  };
}

describe("calibrate", () => {
  test("GIVEN too few labeled rows THEN the verdict says keep collecting", () => {
    const summary = calibrate([snap({}), snap({ labeled: true, return_2h_bps: 10 })]);
    expect(summary.labeled_snapshots).toBe(1);
    expect(summary.verdict).toContain("keep collecting");
  });

  test("GIVEN a predictive score THEN high bucket beats low and the verdict says so", () => {
    const rows: CandidateSnapshotRow[] = [];
    for (let i = 0; i < 12; i += 1) {
      const score = i / 4; // 0 .. 2.75 ascending
      rows.push(snap({ labeled: true, return_2h_bps: score * 20 - 10, features: { score } }));
    }
    const summary = calibrate(rows);
    expect(summary.score_buckets).toHaveLength(3);
    expect(summary.verdict).toContain("predictive");
  });

  test("GIVEN an inverted score THEN the verdict warns not to trade it", () => {
    const rows: CandidateSnapshotRow[] = [];
    for (let i = 0; i < 12; i += 1) {
      const score = i / 4;
      rows.push(snap({ labeled: true, return_2h_bps: -score * 20 + 10, features: { score } }));
    }
    expect(calibrate(rows).verdict).toContain("INVERTED");
  });

  test("GIVEN enters and skips THEN means and hit rate compute; describe renders", () => {
    const rows = [
      snap({ labeled: true, decision: "enter", return_2h_bps: 100, cost_total_bps: 60 }),
      snap({ labeled: true, decision: "enter", return_2h_bps: 20, cost_total_bps: 60 }),
      snap({ labeled: true, decision: "skip", return_2h_bps: -30 }),
    ];
    const summary = calibrate(rows);
    expect(summary.enter_mean_2h_bps).toBe(60);
    expect(summary.skip_mean_2h_bps).toBe(-30);
    expect(summary.enter_hit_rate).toBe(0.5); // 100bp beat 60bp cost; 20bp did not
    const text = describeCalibration(summary);
    expect(text).toContain("V3 SHADOW CALIBRATION");
    expect(text).toContain("VERDICT:");
  });

  test("CUSUM edge ratio requires 40 labeled enters and clamps realized expectancy", () => {
    const rows = Array.from({ length: 40 }, (_, index) => snap({
      id: `cusum-${index}`, strategy_id: "cusum_tb", decision: "enter", labeled: true,
      return_2h_bps: 88, features: { barrier_bps: 440, score: 1 },
    }));
    expect(calibrateCusumEdgeRatio(rows.slice(0, 39), 0.15)).toEqual({ value: 0.15, sample_count: 39, updated: false });
    expect(calibrateCusumEdgeRatio(rows, 0.15)).toEqual({ value: 0.2, sample_count: 40, updated: true });
    expect(calibrateCusumEdgeRatio(rows.map((row) => ({ ...row, return_2h_bps: 1_000 })), 0.15).value).toBe(0.3);
    expect(calibrateCusumEdgeRatio(rows.map((row) => ({ ...row, return_2h_bps: -100 })), 0.15).value).toBe(0.05);
  });

  test("CUSUM edge calibration sign-adjusts spot down events and excludes Drift perps", () => {
    const spotDown = Array.from({ length: 40 }, (_, index) => snap({
      id: `spot-down-${index}`, strategy_id: "cusum_tb", decision: "enter", labeled: true,
      return_2h_bps: -88, features: { barrier_bps: 440, direction: "down", venue: "spot" },
    }));
    const drift = Array.from({ length: 40 }, (_, index) => snap({
      id: `drift-${index}`, strategy_id: "cusum_tb", decision: "enter", labeled: true,
      return_2h_bps: 2_000, features: { barrier_bps: 440, direction: "up", venue: "drift_perp" },
    }));
    expect(calibrateCusumEdgeRatio([...spotDown, ...drift], 0.15)).toEqual({
      value: 0.2, sample_count: 40, updated: true,
    });
  });

  test("per-strategy calibration cannot inherit another module's labeled evidence", () => {
    const pooled = Array.from({ length: 150 }, (_, index) => snap({
      id: `x-${index}`, strategy_id: "xsec", decision: "enter", labeled: true,
      return_2h_bps: 100, features: { score: index },
    }));
    pooled.push(snap({ id: "cusum-only", strategy_id: "cusum_tb", labeled: false }));
    expect(calibrateStrategy(pooled, "xsec").labeled_snapshots).toBe(150);
    expect(calibrateStrategy(pooled, "cusum_tb").labeled_snapshots).toBe(0);
  });

  test("CUSUM calibration derives score buckets from breach magnitude over threshold", () => {
    const rows = Array.from({ length: 12 }, (_, index) => snap({
      id: `c-score-${index}`, strategy_id: "cusum_tb", decision: "enter", labeled: true,
      return_2h_bps: index * 10, features: { magnitude: 0.02 + index * 0.001, h_pct: 2, barrier_bps: 440 },
    }));
    const summary = calibrateStrategy(rows, "cusum_tb");
    expect(summary.score_buckets).toHaveLength(3);
    expect(summary.verdict).toContain("predictive");
  });
});

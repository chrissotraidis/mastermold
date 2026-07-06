/// <reference types="bun" />

/**
 * V3 calibration — the learn-from-your-own-record evaluator. Pure.
 */

import { describe, expect, test } from "bun:test";

import { calibrate, describeCalibration } from "../src/autopilot/v3/calibration";
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
});

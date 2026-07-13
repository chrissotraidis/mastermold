/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { calibrate, type CalibrationSummary } from "../src/autopilot/v3/calibration";
import type { CandidateSnapshotRow } from "../src/autopilot/v3/candidate-store";
import { evaluateV3Demotion } from "../src/autopilot/v3/promotion";

function rows(returnBps: number): CandidateSnapshotRow[] {
  return Array.from({ length: 40 }, (_, index) => ({
    id: String(index), ts: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
    strategy_id: "cusum_tb", token_mint: "mint", symbol: "SOL", decision: "enter" as const,
    features: { direction: "up", score: index }, cost_total_bps: 20, expected_value_bps: 10 + index,
    confidence: 0.7, price_usd_at_snapshot: 100, return_30m_bps: returnBps,
    return_2h_bps: returnBps, return_6h_bps: returnBps, max_adverse_2h_bps: -10,
    max_favorable_2h_bps: 10, labeled: true,
  }));
}

describe("V3 downside-only demotion circuit", () => {
  test("losing rolling-40 fixture demotes an active module", () => {
    const fixture = rows(-1);
    const paper = Array.from({ length: 40 }, (_, index) => [
      { ts: new Date(Date.UTC(2026, 1, 1) + index * 120_000).toISOString(), side: "buy" as const, mint: `m${index}`, value_usd: 100, fee_usd: 0.1, strategy_id: "cusum_tb", mode: "paper" as const },
      { ts: new Date(Date.UTC(2026, 1, 1) + index * 120_000 + 60_000).toISOString(), side: "sell" as const, mint: `m${index}`, value_usd: 99.9, fee_usd: 0.1, strategy_id: "cusum_tb", mode: "paper" as const },
    ]).flat();
    const result = evaluateV3Demotion(fixture, calibrate(fixture), paper);
    expect(result.demote).toBe(true);
    expect(result.rolling_40_net_bps).toBeCloseTo(-30, 8);
  });

  test("exact -15bp boundary does not demote", () => {
    const fixture = rows(5);
    const calibration = { ...calibrate(fixture), ev_realized_slope: 1 } as CalibrationSummary;
    expect(evaluateV3Demotion(fixture, calibration).demote).toBe(false);
  });
});

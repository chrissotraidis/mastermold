/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import type { CandidateSnapshotRow } from "../src/autopilot/v3/candidate-store";
import { barrierOutcomeBps, evaluateCusumGate } from "../src/autopilot/v3/cusum-barrier";

const HOUR = 3_600_000;

describe("cusum_tb 24h barrier outcome (W1)", () => {
  test("GIVEN a long that rises through +barrier first THEN it scores +barrier", () => {
    const series = [{ ts: 1 * HOUR, price: 102 }, { ts: 2 * HOUR, price: 106 }, { ts: 3 * HOUR, price: 90 }];
    expect(barrierOutcomeBps(100, series, 0, 500, "up")).toBe(500);
  });

  test("GIVEN a short and a falling price THEN the short wins the barrier", () => {
    const series = [{ ts: 1 * HOUR, price: 97 }, { ts: 5 * HOUR, price: 94 }];
    expect(barrierOutcomeBps(100, series, 0, 500, "down")).toBe(500);
  });

  test("GIVEN no touch within 24h THEN the 24h return counts; GIVEN an unfinished window THEN null", () => {
    const finished = [{ ts: 10 * HOUR, price: 101 }, { ts: 23 * HOUR, price: 102 }, { ts: 25 * HOUR, price: 130 }];
    expect(barrierOutcomeBps(100, finished, 0, 500, "up")).toBe(200);
    expect(barrierOutcomeBps(100, [{ ts: 3 * HOUR, price: 101 }], 0, 500, "up")).toBeNull();
  });
});

describe("cusum_tb gate", () => {
  const row = (index: number, outcome: number, cost = 40): CandidateSnapshotRow => ({
    id: String(index),
    ts: new Date(Date.UTC(2026, 8, 1 + (index % 20))).toISOString(),
    strategy_id: "cusum_tb",
    token_mint: `mint${index % 7}`,
    symbol: "X",
    decision: "enter",
    features: { venue: "spot", direction: "up", barrier_bps: 500 },
    cost_total_bps: cost,
    expected_value_bps: 10,
    confidence: 0.6,
    price_usd_at_snapshot: 1,
    return_30m_bps: null,
    return_2h_bps: 61,
    return_6h_bps: null,
    max_adverse_2h_bps: null,
    max_favorable_2h_bps: null,
    labeled: true,
    barrier_24h_bps: outcome,
  });

  test("GIVEN fewer than 150 scored events THEN insufficient", () => {
    expect(evaluateCusumGate(Array.from({ length: 63 }, (_, i) => row(i, 500))).status).toBe("insufficient");
  });

  test("GIVEN a strong 2h number but a coin-flip barrier outcome THEN the net gate fails", () => {
    const rows = Array.from({ length: 200 }, (_, i) => row(i, i % 2 === 0 ? 500 : -500));
    const result = evaluateCusumGate(rows, 300);
    expect(result.status).toBe("fail");
    expect(result.net_mean_bps).toBeLessThan(0);
  });

  test("GIVEN a real edge after cost THEN it passes", () => {
    const rows = Array.from({ length: 200 }, (_, i) => row(i, i % 3 === 0 ? -500 : 500));
    expect(evaluateCusumGate(rows, 300).status).toBe("pass");
  });
});

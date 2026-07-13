/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import { describeBpTimingEvidence, summarizeBpTimingEvidence } from "../src/autopilot/bp-evidence";
import { bpCandidate } from "../src/autopilot/v3/bar-portion";
import { calibrateBarPortionEdgeRatio, calibrateStrategy } from "../src/autopilot/v3/calibration";
import type { CandidateSnapshotRow } from "../src/autopilot/v3/candidate-store";
import type { ExecutionCost } from "../src/autopilot/v3/signal";

const COST: ExecutionCost = {
  dex_fee_bps: 5, price_impact_bps: 2, spread_bps: 2, slippage_bps: 4,
  priority_fee_bps: 3, failed_tx_bps: 4, total_bps: 20,
};

const base = {
  symbol: "DYN", mint: "mint", price_usd: 100, bp: -0.8,
  atr_bps: 400, ema_close: 100, held: false, h1_pct: 1, h24_pct: 5,
  liquidity_usd: 1_000_000, edge_ratio: 0.25,
};

describe("standalone Bar Portion candidate", () => {
  test("down-bar fade has exact EV math, horizon, confidence, and risk", () => {
    expect(bpCandidate(base, COST)).toMatchObject({
      strategy_id: "bar_portion", side: "buy", horizon_sec: 900,
      expected_return_bps: 80, expected_value_bps: 60, confidence: 0.62,
      max_loss_bps: 800,
      features: { bp: -0.8, atr_bps: 400, edge_ratio: 0.25, direction: "buy" },
    });
  });

  test("up bars sell held spot only; non-extreme and knife-catch fixtures are null", () => {
    expect(bpCandidate({ ...base, bp: 0.8 }, COST)).toBeNull();
    expect(bpCandidate({ ...base, bp: 0.8, held: true }, COST)).toMatchObject({ side: "sell" });
    expect(bpCandidate({ ...base, bp: -0.59 }, COST)).toBeNull();
    expect(bpCandidate({ ...base, h24_pct: -8 }, COST)).toBeNull();
    expect(bpCandidate({ ...base, h1_pct: -1.51 }, COST)).toBeNull();
    expect(bpCandidate({ ...base, price_usd: 107 }, COST)).toBeNull();
  });

  test("admissible events without guard margin remain labelable at confidence 0.55", () => {
    expect(bpCandidate({ ...base, h1_pct: -1 }, COST)?.confidence).toBe(0.55);
  });
});

function snapshot(index: number, return30: number, direction: "buy" | "sell" = "buy"): CandidateSnapshotRow {
  return {
    id: `bp-${index}`, ts: "2026-07-12T00:00:00.000Z", strategy_id: "bar_portion",
    token_mint: "m", symbol: "M", decision: "enter",
    features: { bp: direction === "buy" ? -0.8 : 0.8, atr_bps: 400, direction, score: 320 },
    cost_total_bps: 20, expected_value_bps: 60, confidence: 0.62, price_usd_at_snapshot: 100,
    return_30m_bps: return30, return_2h_bps: return30, return_6h_bps: null,
    max_adverse_2h_bps: null, max_favorable_2h_bps: null, labeled: true,
  };
}

test("Bar Portion edge calibration requires 40 and direction-adjusts sell outcomes", () => {
  const buys = Array.from({ length: 20 }, (_, index) => snapshot(index, 80));
  const sells = Array.from({ length: 20 }, (_, index) => snapshot(index + 20, -80, "sell"));
  expect(calibrateBarPortionEdgeRatio([...buys, ...sells].slice(0, 39), 0.25).updated).toBe(false);
  expect(calibrateBarPortionEdgeRatio([...buys, ...sells], 0.25)).toEqual({ value: 0.25, sample_count: 40, updated: true });
  expect(calibrateStrategy(sells, "bar_portion").enter_mean_2h_bps).toBe(80);
});

test("after 40 marked vetoes the Analyst evidence compares vetoed moments with taken buys", () => {
  const vetoes = Array.from({ length: 40 }, (_, index) => ({
    id: `v-${index}`, ts: new Date(index * 60_000).toISOString(), mint: "m", symbol: "M",
    price_at_veto_usd: 100, bp: 0.8, mark_30m_usd: 99, done: true,
  }));
  const trades = [{
    id: "t", ts: new Date(0).toISOString(), side: "buy" as const, mint: "m", symbol: "M", qty: 1,
    price_usd: 100, value_usd: 100, fee_usd: 0, mode: "paper" as const, reason: "taken",
  }];
  const evidence = summarizeBpTimingEvidence(vetoes, trades, new Map([["m", [{ ts: 30 * 60_000, price: 101 }]]]));
  expect(evidence).toEqual({ veto_samples: 40, veto_mean_30m_bps: -100, taken_samples: 1, taken_mean_30m_bps: 100, ready: true });
  expect(describeBpTimingEvidence(evidence)).toContain("vetoed moments mean -100bp");
});

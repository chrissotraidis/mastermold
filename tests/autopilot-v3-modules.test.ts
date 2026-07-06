/// <reference types="bun" />

/**
 * V3 feature builder + funding-basis module (plan §6.2, §9). Pure — no network.
 */

import { describe, expect, test } from "bun:test";

import { conservativeCost, costFromImpact } from "../src/autopilot/v3/execution-cost";
import { buildRegimeInput, buildTokenFeatures, realizedVolPct, windowReturnOverMinutes } from "../src/autopilot/v3/features";
import { classifyRegime } from "../src/autopilot/v3/regime";
import { expectedCarryBps, fundingCandidate, fundingEnabledIn, MIN_FUNDING_PERSISTENCE } from "../src/autopilot/v3/funding-basis";
import type { MarketFeedRow } from "../src/autopilot/feed";

function feed(symbol: string, o: Partial<MarketFeedRow> = {}): MarketFeedRow {
  return { symbol, price_usd: 100, change_h1_pct: 0.5, change_h24_pct: 3, volume_h24_usd: 5_000_000, liquidity_usd: 2_000_000, ...o };
}

describe("feature builder", () => {
  test("GIVEN a price window THEN short returns and vol derive from it", () => {
    // 40 samples rising 100 -> 101 (~+1% over the window).
    const window = Array.from({ length: 40 }, (_, i) => 100 + i * (1 / 39));
    expect(windowReturnOverMinutes(window, 13)).toBeGreaterThan(0.9);
    expect(windowReturnOverMinutes(window, 5)).toBeGreaterThan(0);
    expect(windowReturnOverMinutes([100], 5)).toBeNull();
    expect(realizedVolPct(window)).not.toBeNull();
  });

  test("GIVEN a window + feed THEN TokenFeatures maps 1h/24h/liquidity from the feed", () => {
    const window = Array.from({ length: 40 }, (_, i) => 100 + i * 0.02);
    const f = buildTokenFeatures({ symbol: "SOL", mint: "m", window, feed: feed("SOL", { change_h1_pct: 1.2, change_h24_pct: 4, liquidity_usd: 9_000_000 }), volume_baseline_usd: 4_000_000 });
    expect(f.r_1h_pct).toBe(1.2);
    expect(f.r_24h_pct).toBe(4);
    expect(f.liquidity_usd).toBe(9_000_000);
    expect(f.volume_z_1h).toBeCloseTo(0.25, 5); // (5M-4M)/4M
  });

  test("GIVEN universe feed rows THEN regime input aggregates breadth + vol", () => {
    const rows = [feed("SOL", { change_h1_pct: 1 }), feed("A", { change_h1_pct: 0.5 }), feed("B", { change_h1_pct: -1 }), feed("C", { change_h1_pct: -0.5 })];
    const input = buildRegimeInput({ sol: rows[0], btc: undefined, all: rows });
    expect(input.breadth_up_frac).toBeCloseTo(0.5, 5); // 2 of 4 up
    expect(input.realized_vol_1h_pct).toBeCloseTo(0.75, 5); // mean abs
    // And it feeds the classifier sensibly.
    expect(["risk_on", "chop", "risk_off"]).toContain(classifyRegime(input));
  });
});

describe("funding-basis module", () => {
  // Realistic profitable carry: funding must clear a ~50bp round-trip cost, so
  // it needs elevated funding AND a multi-day hold — a genuine design insight.
  const base = {
    symbol: "SOL", mint: "sol", funding_rate_8h_pct: 0.1, hold_hours: 96,
    basis_pct: 0.05, cost: costFromImpact(0.0005), liquidity_usd: 5_000_000,
    funding_persistence_windows: 3,
  };

  test("GIVEN market-neutral THEN it is enabled in every regime", () => {
    expect(fundingEnabledIn("risk_on")).toBe(true);
    expect(fundingEnabledIn("risk_off")).toBe(true);
    expect(fundingEnabledIn("chop")).toBe(true);
  });

  test("GIVEN positive persistent funding clearing cost THEN a delta-neutral candidate", () => {
    const c = fundingCandidate(base);
    expect(c).not.toBeNull();
    expect(c!.side).toBe("long_spot_short_perp");
    expect(c!.strategy_id).toBe("funding_basis");
    // carry = 0.1% × 100 × (96/8=12) windows − basis giveback.
    expect(expectedCarryBps(base)).toBeCloseTo(0.1 * 100 * 12 - 0.05 * 100 * 0.5, 2);
  });

  test("GIVEN negative, fresh, or cost-losing funding THEN no candidate", () => {
    expect(fundingCandidate({ ...base, funding_rate_8h_pct: -0.02 })).toBeNull(); // negative
    expect(fundingCandidate({ ...base, funding_persistence_windows: MIN_FUNDING_PERSISTENCE - 1 })).toBeNull(); // too fresh
    expect(fundingCandidate({ ...base, funding_rate_8h_pct: 0.001, cost: conservativeCost() })).toBeNull(); // carry < cost
  });
});

describe("pair-rv module", () => {
  const base = {
    symbol_a: "WIF", mint_a: "wif", symbol_b: "BONK", mint_b: "bonk",
    spread: 0.05, spread_mean: 0.0, spread_std: 0.02, half_life_hours: 4,
    cost: costFromImpact(0.0003), liquidity_usd: 3_000_000,
  };

  test("GIVEN mean reversion THEN it runs in chop/risk-off, not risk-on", () => {
    const { pairEnabledIn } = require("../src/autopilot/v3/pair-rv");
    expect(pairEnabledIn("chop")).toBe(true);
    expect(pairEnabledIn("risk_off")).toBe(true);
    expect(pairEnabledIn("risk_on")).toBe(false);
  });

  test("GIVEN a stretched spread inside the stop band THEN a market-neutral candidate", () => {
    const { pairCandidate, spreadZ } = require("../src/autopilot/v3/pair-rv");
    expect(spreadZ(base)).toBeCloseTo(2.5, 5); // (0.05-0)/0.02
    const c = pairCandidate(base);
    expect(c).not.toBeNull();
    expect(c.strategy_id).toBe("pair_rv");
    // z>0: A(WIF) rich vs B(BONK) → short A, long B → short_spot_long_perp.
    expect(c.side).toBe("short_spot_long_perp");
  });

  test("GIVEN inside the band, past the stop, or slow reversion THEN no candidate", () => {
    const { pairCandidate } = require("../src/autopilot/v3/pair-rv");
    expect(pairCandidate({ ...base, spread: 0.01 })).toBeNull(); // z=0.5 inside band
    expect(pairCandidate({ ...base, spread: 0.09 })).toBeNull(); // z=4.5 past stop
    expect(pairCandidate({ ...base, half_life_hours: 30 })).toBeNull(); // too slow
  });
});

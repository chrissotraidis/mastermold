/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import {
  cusumEventRatePerDay,
  cusumMintRates,
  cusumStep,
  cusumThresholdPct,
  ewmaDailySigmaPct,
  initialCusumState,
} from "../src/autopilot/v3/cusum";
import { cusumTbCandidate } from "../src/autopilot/v3/cusum-tb";
import { conservativeCost } from "../src/autopilot/v3/execution-cost";
import { cusumEventQuoteRequest } from "../src/autopilot/daemon";

describe("CUSUM filter", () => {
  test("cumulative drift breaches even when no range-bar shortcut is used, then resets both sums", () => {
    const state = initialCusumState(100);
    expect(cusumStep(state, 101, 2, 1)).toBeNull();
    const event = cusumStep(state, 98.98, 2, 2);
    expect(event?.direction).toBe("down");
    expect(event?.magnitude).toBeGreaterThanOrEqual(0.02);
    expect(state).toMatchObject({ s_pos: 0, s_neg: 0, last_price: 98.98, events: 1 });
  });

  test("positive returns accumulate across closes and emit exactly once at the threshold", () => {
    const state = initialCusumState(100);
    expect(cusumStep(state, 100.8, 2, 1)).toBeNull();
    expect(cusumStep(state, 101.6, 2, 2)).toBeNull();
    expect(cusumStep(state, 102.1, 2, 3)?.direction).toBe("up");
    expect(cusumStep(state, 102.1, 2, 4)).toBeNull();
    expect(state.events).toBe(1);
  });

  test("invalid samples recover on the next valid close and thresholds clamp", () => {
    const state = initialCusumState(100);
    expect(cusumStep(state, Number.NaN, 2, 1)).toBeNull();
    expect(cusumStep(state, 101, 2, 2)).toBeNull();
    expect(state.last_price).toBe(101);
    expect(cusumThresholdPct(null)).toBe(2.5);
    expect(cusumThresholdPct(1)).toBe(1.5);
    expect(cusumThresholdPct(8)).toBe(4);
    expect(cusumThresholdPct(20)).toBe(5);
  });

  test("seven-day deterministic replay lands inside the 0.5-5 events/day target", () => {
    const prices = [100];
    for (let index = 1; index <= 7 * 288; index += 1) {
      const withinDay = index % 288;
      const step = withinDay === 72 ? 1.03 : withinDay === 216 ? 1 / 1.03 : 1;
      prices.push(prices.at(-1)! * step);
    }
    const sigma = ewmaDailySigmaPct(prices);
    const h = cusumThresholdPct(sigma);
    const state = initialCusumState(prices[0]);
    for (let index = 1; index < prices.length; index += 1) cusumStep(state, prices[index], h, index * 300_000);
    const rate = cusumEventRatePerDay(state.events, 7 * 86_400_000);
    expect(rate).toBeGreaterThanOrEqual(0.5);
    expect(rate).toBeLessThanOrEqual(5);
  });

  test("durable live-rate evidence waits six hours and exposes an out-of-band mint", () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      ts: new Date(1_000 + index * 60_000).toISOString(),
      ts_ms: 1_000 + index * 60_000,
      mint: "mint",
      symbol: "SOL",
      direction: "up" as const,
      magnitude: .02,
      h_pct: 2,
      sigma_daily_pct: 4,
    }));
    expect(cusumMintRates(rows, 0, 5 * 60 * 60_000)).toEqual([]);
    expect(cusumMintRates(rows, 0, 12 * 60 * 60_000)).toMatchObject([
      { mint: "mint", symbol: "SOL", event_count: 4, events_per_day: 8 },
    ]);
  });
});

describe("CUSUM triple-barrier candidate", () => {
  test("event bypass requests a real quote for spot exposure and exact held exits", () => {
    const asset = { symbol: "SOL", mint: "mint", tier: "A" as const };
    const up = { direction: "up" as const, magnitude: 0.03, ts_ms: 1 };
    const down = { direction: "down" as const, magnitude: 0.03, ts_ms: 2 };
    expect(cusumEventQuoteRequest({ asset, event: up, position: null, price: 100, max_trade_usd: 25 })).toEqual({
      mint: "mint", side: "buy", notional_usd: 25, price: 100, tier: "A",
    });
    expect(cusumEventQuoteRequest({
      asset, event: down,
      position: { mint: "mint", symbol: "SOL", qty: 0.25, avg_cost_usd: 100, stop_pct: 2,
        opened_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      price: 98, max_trade_usd: 25,
    })).toMatchObject({ mint: "mint", side: "sell", qty: 0.25, notional_usd: 24.5 });
    expect(cusumEventQuoteRequest({ asset, event: down, position: null, price: 98, max_trade_usd: 25 })).toBeNull();
  });
  const base = {
    symbol: "SOL", mint: "mint", price_usd: 100,
    event: { direction: "up" as const, magnitude: 0.021, ts_ms: 1 },
    h_pct: 2, held: false, h1_pct: 1, h24_pct: 5,
    liquidity_usd: 2_000_000, volume_h24_usd: 10_000_000,
    sigma_daily_pct: 4, edge_ratio: 0.15,
  };

  test("up breach builds exact EV/barrier math and complete features", () => {
    const cost = conservativeCost();
    const candidate = cusumTbCandidate(base, cost);
    expect(candidate).not.toBeNull();
    expect(candidate).toMatchObject({
      strategy_id: "cusum_tb", side: "buy", horizon_sec: 86_400,
      expected_return_bps: 66, expected_value_bps: 66 - cost.total_bps,
      confidence: 0.62, max_loss_bps: 440,
    });
    expect(candidate?.features).toMatchObject({
      h_pct: 2, magnitude: 0.021, direction: "up", h1_pct: 1, h24_pct: 5,
      sigma_daily_pct: 4, edge_ratio: 0.15, barrier_bps: 440,
    });
  });

  test("up regime guards and down-held spot semantics are exact", () => {
    const cost = conservativeCost();
    expect(cusumTbCandidate({ ...base, h1_pct: -1.01 }, cost)).toBeNull();
    expect(cusumTbCandidate({ ...base, h24_pct: -5.01 }, cost)).toBeNull();
    expect(cusumTbCandidate({ ...base, h24_pct: 40.01 }, cost)).toBeNull();
    const down = { ...base, event: { direction: "down" as const, magnitude: 0.02, ts_ms: 2 } };
    expect(cusumTbCandidate(down, cost)).toBeNull();
    expect(cusumTbCandidate({ ...down, held: true }, cost)).toMatchObject({ side: "sell", reason: "CUSUM down-breach exit" });
  });

  test("misaligned but admissible up events remain candidates at 0.55 for router labeling", () => {
    expect(cusumTbCandidate({ ...base, h1_pct: -0.5 }, conservativeCost())?.confidence).toBe(0.55);
  });

  test("unheld down breach on a listed perp emits a funding-adjusted Drift short", () => {
    const down = { ...base, event: { direction: "down" as const, magnitude: 0.02, ts_ms: 2 }, perp: { market: "SOL-PERP", funding_rate_8h_pct: -0.01 } };
    const candidate = cusumTbCandidate(down, conservativeCost());
    expect(candidate).toMatchObject({ side: "sell", expected_return_bps: 66, expected_value_bps: 56, cost: { dex_fee_bps: 7, total_bps: 10 } });
    expect(candidate?.features).toMatchObject({ venue: "drift_perp", perp_market: "SOL-PERP", funding_rate_8h_pct: -0.01, funding_horizon_bps: -3 });
  });
});

/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import {
  COOLDOWN_MS,
  decide,
  derivePaperCash,
  ENTRY_MIN_H24_PCT,
  LOSS_STREAK_LIMIT,
  lossStreak,
  markEquity,
  MAX_TRADES_PER_DAY,
  PAPER_STARTING_CASH_USD,
  realizedRoundTrips,
  stopPctFromRange,
  TAKE_PROFIT_R,
  UNIVERSE,
  windowRangePct,
  type DecisionInput,
} from "../src/autopilot/daemon";
import type { MarketFeedRow } from "../src/autopilot/feed";
import { DEFAULT_STRATEGY_PARAMS } from "../src/autopilot/params";
import { DEFAULT_AUTOPILOT_CAPS, type BotPositionRow, type BotStateRow, type BotTradeRow } from "../src/autopilot/store";

const SOL = UNIVERSE[0];
const NOW = Date.parse("2026-07-03T12:00:00Z");

function paperState(overrides: Partial<BotStateRow> = {}): BotStateRow {
  return {
    mode: "paper",
    kill_switch: false,
    started_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    caps: { ...DEFAULT_AUTOPILOT_CAPS },
    wallet_label: null,
    last_tick_at: null,
    daemon_pid: null,
    ...overrides,
  };
}

/** A full 40-sample window moving linearly from start to end. */
function window(start: number, end: number): number[] {
  return Array.from({ length: 40 }, (_, index) => start + ((end - start) * index) / 39);
}

function feedRow(symbol: string, overrides: Partial<MarketFeedRow> = {}): [string, MarketFeedRow] {
  return [
    symbol,
    {
      symbol,
      price_usd: 100,
      change_h1_pct: 1.0,
      change_h24_pct: 5.0,
      volume_h24_usd: 5_000_000,
      liquidity_usd: 2_000_000,
      ...overrides,
    },
  ];
}

function solPosition(avgCost: number, overrides: Partial<BotPositionRow> = {}): BotPositionRow {
  return {
    mint: SOL.mint,
    symbol: SOL.symbol,
    qty: 25 / avgCost,
    avg_cost_usd: avgCost,
    stop_pct: 1.5,
    peak_usd: avgCost,
    opened_at: new Date(NOW - 30 * 60_000).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function input(overrides: Partial<DecisionInput>): DecisionInput {
  return {
    windows: new Map(),
    positions: [],
    state: paperState(),
    cash_usd: PAPER_STARTING_CASH_USD,
    feed: new Map([feedRow("SOL")]),
    now_ms: NOW,
    trades_today: 0,
    cooldown_until_ms: new Map(),
    loss_streak: 0,
    last_loss_ms: null,
    params: DEFAULT_STRATEGY_PARAMS,
    ...overrides,
  };
}

describe("autopilot v2 trend-pullback strategy", () => {
  test("GIVEN kill switch or non-paper mode WHEN deciding THEN nothing happens", () => {
    const windows = new Map([[SOL.mint, window(100, 100.2)]]);
    expect(decide(input({ windows, state: paperState({ kill_switch: true, mode: "halted" }) })).decisions).toEqual([]);
    expect(decide(input({ windows, state: paperState({ mode: "off" }) })).decisions).toEqual([]);
  });

  test("GIVEN an established uptrend with a flat 13m pullback THEN it enters with stop and 2R target in the reason", () => {
    const windows = new Map([[SOL.mint, window(100.4, 100)]]); // -0.4% dip
    const { decisions, skipped } = decide(input({ windows }));
    expect(skipped).toBeNull();
    expect(decisions).toHaveLength(1);
    const buy = decisions[0];
    if (buy.action !== "buy") throw new Error("expected a buy");
    expect(buy.symbol).toBe("SOL");
    expect(buy.stop_pct).toBeGreaterThanOrEqual(1.2);
    expect(buy.reason).toContain("Trend pullback");
    expect(buy.reason).toContain("target");
    expect(buy.signals.h24_pct).toBe(5.0);
  });

  test("GIVEN a completed 13m spike THEN it refuses to chase and logs why", () => {
    const windows = new Map([[SOL.mint, window(100, 102.6)]]); // +2.6% spike — v1's losing entry
    const { decisions, skipped } = decide(input({ windows }));
    expect(decisions).toEqual([]);
    expect(skipped?.symbol).toBe("SOL");
    expect(skipped?.reason).toContain("no chasing");
  });

  test("GIVEN no 24h uptrend THEN no entry even on a nice dip", () => {
    const windows = new Map([[SOL.mint, window(100.4, 100)]]);
    const feed = new Map([feedRow("SOL", { change_h24_pct: ENTRY_MIN_H24_PCT - 1 })]);
    const { decisions, skipped } = decide(input({ windows, feed }));
    expect(decisions).toEqual([]);
    expect(skipped?.reason).toContain("24h trend");
  });

  test("GIVEN thin volume or liquidity THEN the candidate is rejected", () => {
    const windows = new Map([[SOL.mint, window(100.4, 100)]]);
    const thin = new Map([feedRow("SOL", { volume_h24_usd: 10_000 })]);
    expect(decide(input({ windows, feed: thin })).skipped?.reason).toContain("volume");
    const illiquid = new Map([feedRow("SOL", { liquidity_usd: 5_000 })]);
    expect(decide(input({ windows, feed: illiquid })).skipped?.reason).toContain("liquidity");
  });

  test("GIVEN a cooldown, the daily cap, or a loss streak THEN entries are blocked with the reason", () => {
    const windows = new Map([[SOL.mint, window(100.4, 100)]]);
    const cooled = decide(input({ windows, cooldown_until_ms: new Map([[SOL.mint, NOW + COOLDOWN_MS]]) }));
    expect(cooled.decisions).toEqual([]);
    expect(cooled.skipped?.reason).toContain("cooling down");

    const capped = decide(input({ windows, trades_today: MAX_TRADES_PER_DAY }));
    expect(capped.decisions).toEqual([]);
    expect(capped.skipped?.reason).toContain("daily limit");

    const paused = decide(input({ windows, loss_streak: LOSS_STREAK_LIMIT, last_loss_ms: NOW - 60_000 }));
    expect(paused.decisions).toEqual([]);
    expect(paused.skipped?.reason).toContain("consecutive losses");
  });

  test("GIVEN price at the hard stop THEN it sells regardless of window noise", () => {
    const windows = new Map([[SOL.mint, window(98.6, 98.4)]]); // below 100*(1-1.5%)
    const { decisions } = decide(input({ positions: [solPosition(100)], windows }));
    expect(decisions[0]?.action).toBe("sell");
    expect(decisions[0]?.reason).toContain("Hard stop");
  });

  test("GIVEN price at the 2R target THEN it takes profit", () => {
    const target = 100 * (1 + (1.5 * TAKE_PROFIT_R) / 100); // 103
    const windows = new Map([[SOL.mint, window(target - 0.2, target + 0.1)]]);
    const { decisions } = decide(input({ positions: [solPosition(100)], windows }));
    expect(decisions[0]?.action).toBe("sell");
    expect(decisions[0]?.reason).toContain("Take profit");
  });

  test("GIVEN +1R was reached THEN the trail arms and a stop-sized retrace exits", () => {
    // Peak 102 (>= 101.5 arm level); price 100.4 is >1.5% off the peak.
    const windows = new Map([[SOL.mint, window(101, 100.4)]]);
    const { decisions } = decide(input({ positions: [solPosition(100, { peak_usd: 102 })], windows }));
    expect(decisions[0]?.action).toBe("sell");
    expect(decisions[0]?.reason).toContain("Armed trail");
  });

  test("GIVEN a 20-second-old winner NOT at 1R yet THEN a small retrace does NOT exit (the v1 bug)", () => {
    // v1's trailing stop fired here; v2 holds: peak 100.9 (< arm level 101.5),
    // price 100.2 still above the 98.5 hard stop.
    const windows = new Map([[SOL.mint, window(100.9, 100.2)]]);
    const { decisions } = decide(input({ positions: [solPosition(100, { peak_usd: 100.9 })], windows }));
    expect(decisions).toEqual([]);
  });

  test("GIVEN a stale position and the hourly trend flips down THEN the time stop closes it", () => {
    const windows = new Map([[SOL.mint, window(100.1, 100)]]);
    const feed = new Map([feedRow("SOL", { change_h1_pct: -0.5 })]);
    const oldPosition = solPosition(100, { opened_at: new Date(NOW - 5 * 60 * 60_000).toISOString() });
    const { decisions } = decide(input({ positions: [oldPosition], windows, feed }));
    expect(decisions[0]?.action).toBe("sell");
    expect(decisions[0]?.reason).toContain("Time stop");
  });

  test("GIVEN window ranges THEN stops scale with volatility inside the clamp", () => {
    expect(stopPctFromRange(null)).toBe(1.2);
    expect(stopPctFromRange(0.3)).toBe(1.2); // clamped at the floor
    expect(stopPctFromRange(1.0)).toBe(2.0); // 2x range
    expect(stopPctFromRange(5.0)).toBe(3.0); // clamped at the cap
    const range = windowRangePct(window(100, 101));
    expect(range).toBeCloseTo(1.0, 1);
  });

  test("GIVEN ledger history WHEN pairing round trips THEN streaks and cash derive correctly", () => {
    const trades = [
      { side: "buy", mint: "m1", symbol: "A", value_usd: 25, fee_usd: 0.075, ts: "2026-07-03T01:00:00Z" },
      { side: "sell", mint: "m1", symbol: "A", value_usd: 24, fee_usd: 0.072, ts: "2026-07-03T02:00:00Z" },
      { side: "buy", mint: "m2", symbol: "B", value_usd: 25, fee_usd: 0.075, ts: "2026-07-03T03:00:00Z" },
      { side: "sell", mint: "m2", symbol: "B", value_usd: 24.5, fee_usd: 0.073, ts: "2026-07-03T04:00:00Z" },
    ] as unknown as BotTradeRow[];
    const trips = realizedRoundTrips(trades);
    expect(trips).toHaveLength(2);
    expect(trips[0].net_usd).toBeLessThan(0);
    const streak = lossStreak(trips);
    expect(streak.streak).toBe(2);
    expect(streak.last_loss_ms).toBe(Date.parse("2026-07-03T04:00:00Z"));
    expect(derivePaperCash(trades)).toBeCloseTo(PAPER_STARTING_CASH_USD - 1.5 - 0.295, 3);
  });

  test("GIVEN open positions WHEN marking equity THEN cash plus positions at market", () => {
    const windows = new Map([[SOL.mint, window(100, 110)]]);
    const equity = markEquity([solPosition(100)], windows, 975);
    expect(equity).toBeCloseTo(975 + (25 / 100) * 110, 1);
  });
});

describe("live mode wiring (Day 3)", () => {
  test("GIVEN live mode THEN decide() runs, and the canary week pins entry size to $10", () => {
    const windows = new Map([[SOL.mint, window(100.4, 100)]]);
    const liveState = paperState({ mode: "live" });
    const result = decide(input({ windows, state: liveState, live_canary: true }));
    expect(result.decisions).toHaveLength(1);
    const buy = result.decisions[0];
    if (buy.action !== "buy") throw new Error("expected a buy");
    expect(buy.value_usd).toBe(10); // CANARY_TRADE_USD, not the $25 cap

    // Off-canary live sizing returns to the normal cap.
    const normal = decide(input({ windows, state: liveState }));
    if (normal.decisions[0]?.action !== "buy") throw new Error("expected a buy");
    expect(normal.decisions[0].value_usd).toBe(25);
  });
});

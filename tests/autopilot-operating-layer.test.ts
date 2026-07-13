/// <reference types="bun" />

/**
 * Operating-layer slice: typed intents, the non-LLM policy engine, and the
 * paper executor (docs/roadmap/2026-07-03-autonomy-architecture.md D2/D3).
 * All pure — the daemon's write path is exercised by the existing daemon
 * tests; here every hard rule must fail independently of the strategy core.
 */

import { describe, expect, test } from "bun:test";

import { MAX_TRADES_PER_DAY, UNIVERSE } from "../src/autopilot/daemon";
import { MEMECOIN_PAPER_FEE_RATE, PAPER_FEE_RATE, paperExecutor } from "../src/autopilot/executor";
import { intentFromDecision, type TradeIntent } from "../src/autopilot/intent";
import { MAX_TIER_B_POSITIONS, MIN_NOTIONAL_USD, validateIntent, type PolicyContext } from "../src/autopilot/policy";
import { DEFAULT_AUTOPILOT_CAPS, type BotPositionRow, type BotStateRow, type DecisionSignals } from "../src/autopilot/store";

const SOL = UNIVERSE[0];
const NOW = new Date("2026-07-03T12:00:00Z").toISOString();

const SIGNALS: DecisionSignals = {
  price_usd: 100,
  short_pct: -0.4,
  range_pct: 0.8,
  h1_pct: 1.0,
  h24_pct: 5.0,
  volume_h24_usd: 5_000_000,
  liquidity_usd: 2_000_000,
};

function paperState(overrides: Partial<BotStateRow> = {}): BotStateRow {
  return {
    mode: "paper",
    kill_switch: false,
    started_at: NOW,
    updated_at: NOW,
    caps: { ...DEFAULT_AUTOPILOT_CAPS },
    wallet_label: null,
    last_tick_at: null,
    daemon_pid: null,
    ...overrides,
  };
}

function solPosition(overrides: Partial<BotPositionRow> = {}): BotPositionRow {
  return {
    mint: SOL.mint,
    symbol: SOL.symbol,
    qty: 0.25,
    avg_cost_usd: 100,
    stop_pct: 1.5,
    peak_usd: 100,
    opened_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function buyIntent(overrides: Partial<TradeIntent> = {}): TradeIntent {
  return {
    id: "int_test",
    ts: NOW,
    mode: "paper",
    action: "buy",
    mint: SOL.mint,
    symbol: SOL.symbol,
    price_usd: 100,
    notional_usd: 25,
    qty: null,
    stop_pct: 1.5,
    reason: "test entry",
    strategy: "v2-trend-pullback",
    signals: SIGNALS,
    ...overrides,
  };
}

function sellIntent(overrides: Partial<TradeIntent> = {}): TradeIntent {
  return buyIntent({ action: "sell", notional_usd: 25, qty: 0.25, stop_pct: null, reason: "test exit", ...overrides });
}

function context(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    state: paperState(),
    positions: [],
    cash_usd: 1_000,
    trades_today: 0,
    spend_today_usd: 0,
    max_trades_per_day: MAX_TRADES_PER_DAY,
    fee_rate: PAPER_FEE_RATE,
    tier_b_mints: new Set(),
    max_tier_b_positions: MAX_TIER_B_POSITIONS,
    ...overrides,
  };
}

function reasonOf(verdict: ReturnType<typeof validateIntent>): string {
  if (verdict.allowed) throw new Error("expected a rejection");
  return verdict.reason;
}

describe("intentFromDecision", () => {
  test("GIVEN a buy decision THEN it lifts into a typed paper intent", () => {
    const intent = intentFromDecision(
      { action: "buy", mint: SOL.mint, symbol: SOL.symbol, price: 100, value_usd: 25, stop_pct: 1.5, reason: "r", signals: SIGNALS },
      [],
    );
    expect(intent?.action).toBe("buy");
    expect(intent?.mode).toBe("paper");
    expect(intent?.notional_usd).toBe(25);
    expect(intent?.qty).toBeNull();
    expect(intent?.stop_pct).toBe(1.5);
    expect(intent?.tp_pct).toBeNull();
    expect(intent?.deadline_ts).toBeNull();
    expect(intent?.strategy).toBe("v2-trend-pullback");
  });

  test("GIVEN CUSUM barriers THEN intent construction preserves TP and deadline", () => {
    const deadline = "2026-07-04T12:00:00.000Z";
    const intent = intentFromDecision(
      { action: "buy", mint: SOL.mint, symbol: SOL.symbol, price: 100, value_usd: 15, stop_pct: 4.4, tp_pct: 4.4, deadline_ts: deadline, reason: "cusum", signals: SIGNALS },
      [], "paper", "v3-alpha-router",
    );
    expect(intent).toMatchObject({ stop_pct: 4.4, tp_pct: 4.4, deadline_ts: deadline });
  });

  test("GIVEN a sell decision THEN the quantity resolves from the open position", () => {
    const intent = intentFromDecision(
      { action: "sell", mint: SOL.mint, symbol: SOL.symbol, price: 102, reason: "r", signals: SIGNALS },
      [solPosition()],
    );
    expect(intent?.action).toBe("sell");
    expect(intent?.qty).toBe(0.25);
    expect(intent?.notional_usd).toBeCloseTo(0.25 * 102, 6);
  });

  test("GIVEN a sell with no matching position THEN there is no intent", () => {
    const intent = intentFromDecision(
      { action: "sell", mint: SOL.mint, symbol: SOL.symbol, price: 102, reason: "r", signals: SIGNALS },
      [],
    );
    expect(intent).toBeNull();
  });
});

describe("policy engine — buys", () => {
  test("GIVEN a clean context THEN a capped buy passes", () => {
    expect(validateIntent(buyIntent(), context())).toEqual({ allowed: true });
  });

  test("GIVEN the kill switch THEN everything is rejected", () => {
    const verdict = validateIntent(buyIntent(), context({ state: paperState({ kill_switch: true, mode: "halted" }) }));
    expect(reasonOf(verdict)).toContain("kill switch");
  });

  test("GIVEN a mode mismatch THEN the intent is rejected", () => {
    expect(reasonOf(validateIntent(buyIntent(), context({ state: paperState({ mode: "off" }) })))).toContain('mode is "off"');
  });

  test("GIVEN a notional above the per-trade cap THEN it is rejected", () => {
    const verdict = validateIntent(buyIntent({ notional_usd: DEFAULT_AUTOPILOT_CAPS.max_trade_usd + 1 }), context());
    expect(reasonOf(verdict)).toContain("per-trade cap");
  });

  test("GIVEN dust THEN it is rejected", () => {
    expect(reasonOf(validateIntent(buyIntent({ notional_usd: MIN_NOTIONAL_USD - 1 }), context()))).toContain("minimum");
  });

  test("GIVEN insufficient cash for notional plus fee THEN it is rejected", () => {
    expect(reasonOf(validateIntent(buyIntent({ notional_usd: 25 }), context({ cash_usd: 25 })))).toContain("cash");
    // Exactly enough including the fee passes.
    expect(validateIntent(buyIntent({ notional_usd: 25 }), context({ cash_usd: 25 * (1 + PAPER_FEE_RATE) }))).toEqual({ allowed: true });
  });

  test("GIVEN the position cap is full THEN a new entry is rejected", () => {
    const others = UNIVERSE.slice(1, 1 + DEFAULT_AUTOPILOT_CAPS.max_positions).map((asset) =>
      solPosition({ mint: asset.mint, symbol: asset.symbol }),
    );
    expect(reasonOf(validateIntent(buyIntent(), context({ positions: others })))).toContain("position cap");
  });

  test("GIVEN the mint is already held THEN averaging in is rejected", () => {
    expect(reasonOf(validateIntent(buyIntent(), context({ positions: [solPosition()] })))).toContain("already holding");
  });

  test("GIVEN the daily entry count is spent THEN it is rejected", () => {
    expect(reasonOf(validateIntent(buyIntent(), context({ trades_today: MAX_TRADES_PER_DAY })))).toContain("daily cap");
  });

  test("GIVEN the buy would breach the daily spend limit THEN it is rejected", () => {
    const spent = DEFAULT_AUTOPILOT_CAPS.daily_spend_limit_usd - 10;
    expect(reasonOf(validateIntent(buyIntent({ notional_usd: 25 }), context({ spend_today_usd: spent })))).toContain("daily limit");
    // Under the line it still passes.
    expect(validateIntent(buyIntent({ notional_usd: 10 }), context({ spend_today_usd: spent }))).toEqual({ allowed: true });
  });

  test("GIVEN two Tier B positions THEN a third Tier B buy is rejected without changing the global cap", () => {
    const tierB = new Set(["tier-b-1", "tier-b-2", "tier-b-3"]);
    const positions = [
      solPosition({ mint: "tier-b-1", symbol: "B1" }),
      solPosition({ mint: "tier-b-2", symbol: "B2" }),
    ];
    const verdict = validateIntent(
      buyIntent({ mint: "tier-b-3", symbol: "B3", notional_usd: 15 }),
      context({ positions, tier_b_mints: tierB }),
    );
    expect(reasonOf(verdict)).toContain("2-position Tier B cap");
    expect(positions).toHaveLength(2);
    expect(DEFAULT_AUTOPILOT_CAPS.max_positions).toBe(5);
  });
});

describe("policy engine — sells", () => {
  test("GIVEN an open position THEN a protective exit passes even at caps", () => {
    const verdict = validateIntent(
      sellIntent(),
      context({ positions: [solPosition()], trades_today: MAX_TRADES_PER_DAY, spend_today_usd: 10_000 }),
    );
    expect(verdict).toEqual({ allowed: true });
  });

  test("GIVEN no position or an oversized quantity THEN the sell is rejected", () => {
    expect(reasonOf(validateIntent(sellIntent(), context()))).toContain("no open");
    expect(reasonOf(validateIntent(sellIntent({ qty: 0.5 }), context({ positions: [solPosition()] })))).toContain("exceeds");
  });
});

describe("paper executor", () => {
  test("GIVEN a buy intent THEN the fill derives qty and fee from the reference price", async () => {
    const result = await paperExecutor().execute(buyIntent({ notional_usd: 25, price_usd: 100 }));
    if (!result.ok) throw new Error(result.error);
    expect(result.fill.qty).toBeCloseTo(0.25, 9);
    expect(result.fill.value_usd).toBe(25);
    expect(result.fill.fee_usd).toBeCloseTo(25 * PAPER_FEE_RATE, 9);
  });

  test("GIVEN a sell intent THEN the fill values the exact position quantity", async () => {
    const result = await paperExecutor().execute(sellIntent({ qty: 0.25, price_usd: 102 }));
    if (!result.ok) throw new Error(result.error);
    expect(result.fill.value_usd).toBeCloseTo(25.5, 9);
    expect(result.fill.fee_usd).toBeCloseTo(25.5 * PAPER_FEE_RATE, 9);
  });

  test("GIVEN a fee classifier THEN off-universe mints pay the memecoin tier", async () => {
    const executor = paperExecutor({
      feeRateForMint: (mint) => (mint === "major-mint" ? PAPER_FEE_RATE : MEMECOIN_PAPER_FEE_RATE),
    });
    const memecoin = await executor.execute(buyIntent({ notional_usd: 25, price_usd: 100 }));
    if (!memecoin.ok) throw new Error(memecoin.error);
    expect(memecoin.fill.fee_usd).toBeCloseTo(25 * MEMECOIN_PAPER_FEE_RATE, 9);
    expect(memecoin.fill.fee_usd).toBeGreaterThan(25 * PAPER_FEE_RATE * 3);
  });

  test("GIVEN a modeled fill THEN quoted price and fee replace the flat model", async () => {
    const result = await paperExecutor({ fillFor: () => ({ price_usd: 101, fee_usd: 0.012 }) })
      .execute(buyIntent({ notional_usd: 25, price_usd: 100 }));
    if (!result.ok) throw new Error(result.error);
    expect(result.fill.price_usd).toBe(101);
    expect(result.fill.qty).toBeCloseTo(25 / 101, 9);
    expect(result.fill.fee_usd).toBe(0.012);
    expect(result.fill.fill_basis).toBe("quoted");
  });

  test("GIVEN no modeled fill THEN the exact legacy flat fallback remains", async () => {
    const result = await paperExecutor({ fillFor: () => null }).execute(buyIntent({ notional_usd: 25, price_usd: 100 }));
    if (!result.ok) throw new Error(result.error);
    expect(result.fill.price_usd).toBe(100);
    expect(result.fill.fee_usd).toBeCloseTo(25 * PAPER_FEE_RATE, 9);
    expect(result.fill.fill_basis).toBe("flat_fallback");
  });
});

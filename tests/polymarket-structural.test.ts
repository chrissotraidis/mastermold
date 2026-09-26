/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { parseFeeSchedule } from "../src/polymarket/fees";
import type { PolymarketMarket } from "../src/polymarket/markets";
import type { PolymarketOrderBook } from "../src/polymarket/orderbook";
import { buildPolymarketBrainCandidates } from "../src/polymarket/strategies";
import { evaluateNegRiskBasket, parseNegRiskEvent } from "../src/polymarket/structural";

const future = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

function market(overrides: Partial<PolymarketMarket> = {}): PolymarketMarket {
  return {
    id: "m1",
    condition_id: "c1",
    question: "Will the fixture resolve Yes?",
    slug: "fixture",
    end_date: future(),
    outcomes: ["Yes", "No"],
    outcome_prices: [0.5, 0.5],
    token_ids: ["yes", "no"],
    liquidity_usd: 50_000,
    volume_24h_usd: 20_000,
    price_change_24h: 0,
    accepting_orders: true,
    order_book_enabled: true,
    neg_risk: false,
    fees_enabled: false,
    minimum_order_size: 5,
    fee_schedule: parseFeeSchedule({ feesEnabled: false }),
    rewards: null,
    ...overrides,
  };
}

function book(token: string, bids: Array<[number, number]>, asks: Array<[number, number]>): PolymarketOrderBook {
  return {
    token_id: token,
    condition_id: "c1",
    timestamp_ms: 1,
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    tick_size: 0.01,
    minimum_order_size: 5,
    neg_risk: false,
  } as PolymarketOrderBook;
}

describe("binary parity is fee-inclusive", () => {
  test("GIVEN asks summing to 98¢ WHEN the market is fee-free THEN parity records; WHEN sports fees apply THEN fees erase it", () => {
    const books = new Map([
      ["yes", book("yes", [[0.47, 500]], [[0.49, 500]])],
      ["no", book("no", [[0.47, 500]], [[0.49, 500]])],
    ]);
    const free = buildPolymarketBrainCandidates([market()], books);
    expect(free.some((row) => row.strategy_id === "binary_parity")).toBe(true);

    const sports = market({ fees_enabled: true, fee_schedule: parseFeeSchedule({ feesEnabled: true, feeSchedule: { rate: 0.05, exponent: 1 } }) });
    // 1 − 0.98 − 2 × 0.05 × 0.49 × 0.51 ≈ −0.005: no edge after fees.
    expect(buildPolymarketBrainCandidates([sports], books).some((row) => row.strategy_id === "binary_parity")).toBe(false);

    const unknown = market({ fees_enabled: true, fee_schedule: parseFeeSchedule({ feesEnabled: true }) });
    expect(buildPolymarketBrainCandidates([unknown], books).some((row) => row.strategy_id === "binary_parity")).toBe(false);
  });
});

describe("reward maker shadow", () => {
  test("GIVEN a funded reward market WHEN displayed competition grows THEN our estimated share shrinks", () => {
    const rewards = { min_size: 50, max_spread_cents: 4, daily_rate_usd: 400 };
    const thin = new Map([["yes", book("yes", [[0.49, 50]], [[0.51, 50]])], ["no", book("no", [[0.49, 50]], [[0.51, 50]])]]);
    const crowded = new Map([["yes", book("yes", [[0.49, 5_000]], [[0.51, 5_000]])], ["no", book("no", [[0.49, 50]], [[0.51, 50]])]]);
    const a = buildPolymarketBrainCandidates([market({ rewards })], thin).find((row) => row.strategy_id === "reward_maker");
    const b = buildPolymarketBrainCandidates([market({ rewards })], crowded).find((row) => row.strategy_id === "reward_maker");
    expect(a && b).toBeTruthy();
    const share = (row: typeof a) => Number(/at most ([0-9.]+)%/.exec(row!.thesis)?.[1]);
    expect(share(a)).toBeGreaterThan(share(b));
    expect(a!.paper_eligible).toBe(false);
    // Unfunded or extreme-priced markets are not reward candidates.
    expect(buildPolymarketBrainCandidates([market({ rewards: { ...rewards, daily_rate_usd: 10 } })], thin).some((row) => row.strategy_id === "reward_maker")).toBe(false);
  });
});

describe("neg-risk basket monitor", () => {
  const event = (legs: Array<{ id: string; other?: boolean }>) =>
    parseNegRiskEvent({
      id: "e1",
      title: "Who wins?",
      negRisk: true,
      markets: legs.map((leg) => ({
        id: leg.id,
        question: leg.id,
        groupItemTitle: leg.id,
        clobTokenIds: JSON.stringify([`${leg.id}-yes`, `${leg.id}-no`]),
        acceptingOrders: true,
        active: true,
        closed: false,
        negRiskOther: leg.other === true,
        feesEnabled: false,
      })),
    })!;

  test("GIVEN every named leg priced under $1 after fees WHEN depth is enough THEN it is an edge episode", () => {
    const e = event([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const books = new Map([
      ["a-yes", book("a-yes", [], [[0.3, 100]])],
      ["b-yes", book("b-yes", [], [[0.3, 100]])],
      ["c-yes", book("c-yes", [], [[0.35, 40]])],
    ]);
    const result = evaluateNegRiskBasket(e, books);
    expect(result.status).toBe("edge");
    expect(result.net_edge).toBeCloseTo(0.05, 4);
    expect(result.min_depth_shares).toBe(40);
  });

  test("GIVEN an augmented Other leg or a missing book THEN no edge is claimed", () => {
    const withOther = event([{ id: "a" }, { id: "other", other: true }]);
    expect(evaluateNegRiskBasket(withOther, new Map()).status).toBe("has_other");
    const e = event([{ id: "a" }, { id: "b" }]);
    expect(evaluateNegRiskBasket(e, new Map([["a-yes", book("a-yes", [], [[0.2, 100]])]])).status).toBe("incomplete");
  });
});

import { describe, expect, test } from "bun:test";

import {
  brierScore,
  buildAnalystForecastPrompt,
  decideAnalystBet,
  parseAnalystForecast,
  selectAnalystCandidates,
  POLYMARKET_ANALYST_EDGE_MIN,
} from "@/src/polymarket/analyst";
import type { PolymarketMarket } from "@/src/polymarket/markets";

function market(overrides: Partial<PolymarketMarket> = {}): PolymarketMarket {
  return {
    id: "101",
    condition_id: "0xabc",
    question: "Will the thing happen by the deadline?",
    slug: "will-the-thing-happen",
    end_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1_000).toISOString(),
    outcomes: ["Yes", "No"],
    outcome_prices: [0.4, 0.6],
    token_ids: ["tok-yes", "tok-no"],
    liquidity_usd: 50_000,
    volume_24h_usd: 40_000,
    price_change_24h: 0.01,
    accepting_orders: true,
    order_book_enabled: true,
    neg_risk: false,
    fees_enabled: false,
    minimum_order_size: 5,
    ...overrides,
  };
}

describe("parseAnalystForecast", () => {
  test("parses strict JSON and clamps the probability", () => {
    const parsed = parseAnalystForecast('{"probability": 0.999, "confidence": "high", "rationale": "Named evidence."}');
    expect(parsed).toEqual({ probability: 0.99, confidence: "high", rationale: "Named evidence." });
  });

  test("tolerates fenced or prose-wrapped JSON", () => {
    const parsed = parseAnalystForecast('Sure — here is the answer:\n```json\n{"probability": 0.35, "confidence": "medium", "rationale": "Prior minus one concrete update."}\n```');
    expect(parsed?.probability).toBe(0.35);
    expect(parsed?.confidence).toBe("medium");
  });

  test("unknown confidence degrades to low, missing rationale rejects", () => {
    expect(parseAnalystForecast('{"probability": 0.5, "confidence": "certain", "rationale": "x"}')?.confidence).toBe("low");
    expect(parseAnalystForecast('{"probability": 0.5, "confidence": "high"}')).toBeNull();
    expect(parseAnalystForecast("no json here")).toBeNull();
    expect(parseAnalystForecast('{"probability": 1.4, "confidence": "high", "rationale": "x"}')).toBeNull();
  });
});

describe("decideAnalystBet", () => {
  test("bets YES when the model beats the yes ask by the threshold", () => {
    const decision = decideAnalystBet({ probability: 0.55, confidence: "medium", yesAsk: 0.42, noAsk: 0.6 });
    expect(decision).toEqual({ side: "YES", outcome_index: 0, edge: 0.55 - 0.42 });
  });

  test("bets NO when the complement beats the no ask", () => {
    const decision = decideAnalystBet({ probability: 0.2, confidence: "high", yesAsk: 0.35, noAsk: 0.68 });
    expect(decision?.side).toBe("NO");
    expect(decision?.outcome_index).toBe(1);
    expect(decision?.edge).toBeCloseTo(0.12, 10);
  });

  test("stands down below the edge threshold, at low confidence, or without books", () => {
    expect(decideAnalystBet({ probability: 0.5, confidence: "medium", yesAsk: 0.45, noAsk: 0.56 })).toBeNull();
    expect(decideAnalystBet({ probability: 0.9, confidence: "low", yesAsk: 0.4, noAsk: 0.62 })).toBeNull();
    expect(decideAnalystBet({ probability: 0.9, confidence: "high", yesAsk: null, noAsk: null })).toBeNull();
    expect(POLYMARKET_ANALYST_EDGE_MIN).toBe(0.1);
  });
});

describe("brierScore", () => {
  test("scores against the realized outcome", () => {
    expect(brierScore(0.8, true)).toBeCloseTo(0.04, 10);
    expect(brierScore(0.8, false)).toBeCloseTo(0.64, 10);
  });
});

describe("selectAnalystCandidates", () => {
  test("filters horizon, liquidity, extremes, repeats, and open positions", () => {
    const now = Date.now();
    const tooSoon = market({ id: "1", end_date: new Date(now + 2 * 60 * 60 * 1_000).toISOString() });
    const tooFar = market({ id: "2", end_date: new Date(now + 40 * 24 * 60 * 60 * 1_000).toISOString() });
    const thin = market({ id: "3", liquidity_usd: 5_000 });
    const extreme = market({ id: "4", outcome_prices: [0.97, 0.03] });
    const repeat = market({ id: "5" });
    const positioned = market({ id: "6" });
    const good = market({ id: "7", volume_24h_usd: 90_000 });
    const negRisk = market({ id: "8", neg_risk: true });

    const picked = selectAnalystCandidates(
      [tooSoon, tooFar, thin, extreme, repeat, positioned, good, negRisk],
      { recentlyForecastedMarketIds: new Set(["5"]), openPositionMarketIds: new Set(["6"]), nowMs: now },
    );
    expect(picked.map((m) => m.id)).toEqual(["7"]);
  });

  test("caps the batch at five, ordered by 24h volume", () => {
    const markets = Array.from({ length: 8 }, (_, index) =>
      market({ id: String(index + 1), volume_24h_usd: (index + 1) * 1_000 }));
    const picked = selectAnalystCandidates(markets, {
      recentlyForecastedMarketIds: new Set(),
      openPositionMarketIds: new Set(),
    });
    expect(picked).toHaveLength(5);
    expect(picked[0].volume_24h_usd).toBe(8_000);
  });
});

describe("buildAnalystForecastPrompt", () => {
  test("names the prior, criteria, and horizon", () => {
    const prompt = buildAnalystForecastPrompt({
      question: "Will X happen?",
      description: "Resolves YES if X is officially announced.",
      endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000).toISOString(),
      yesPrice: 0.42,
      nowIso: new Date().toISOString(),
    });
    expect(prompt).toContain("Current market price for YES: 0.420 (this is your prior).");
    expect(prompt).toContain("Resolves YES if X is officially announced.");
    expect(prompt).toContain("days away");
  });
});

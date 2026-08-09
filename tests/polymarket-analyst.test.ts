import { describe, expect, test } from "bun:test";

import {
  brierScore,
  buildAnalystForecastPrompt,
  classifyAnalystMarket,
  computeAnalystEdgeBuckets,
  decideAnalystBet,
  formatAnalystTrackRecord,
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

describe("classifyAnalystMarket", () => {
  test("sports, esports, handicaps, and daily crypto are heartbeat", () => {
    expect(classifyAnalystMarket("Counter-Strike: Liquid vs Metizport (BO3)", "cs2-tl1-mzp-2026-08-08")).toBe("heartbeat");
    expect(classifyAnalystMarket("Atlanta Braves vs. New York Yankees", "mlb-atl-nyy-2026-08-08")).toBe("heartbeat");
    expect(classifyAnalystMarket("National Bank Open: Marta Kostyuk vs Iga Swiatek", "wta-kostyuk-swiatek-2026-08-09")).toBe("heartbeat");
    expect(classifyAnalystMarket("Game Handicap: BLG (-1.5) vs EDward Gaming (+1.5)", "some-odd-slug")).toBe("heartbeat");
    expect(classifyAnalystMarket("Toronto Blue Jays vs. Philadelphia Phillies: O/U 9.5", "mlb-tor-phi-total")).toBe("heartbeat");
    expect(classifyAnalystMarket("Bitcoin Up or Down on August 8?", "bitcoin-up-or-down-on-august-8-2026")).toBe("heartbeat");
  });

  test("geopolitics, policy, and one-off events are news", () => {
    expect(classifyAnalystMarket("US x Iran Effective Ceasefire by August 14?", "us-x-iran-effective-ceasfire-by-august-14")).toBe("news");
    expect(classifyAnalystMarket("Will Kai and Speed beat the Minecraft challenge by August 17?", "will-kai-and-speed-beat")).toBe("news");
    expect(classifyAnalystMarket("Will the Fed cut rates in September?", "fed-cut-september-2026")).toBe("news");
  });
});

describe("computeAnalystEdgeBuckets", () => {
  test("groups hypothetical $1 bets by divergence and category", () => {
    const buckets = computeAnalystEdgeBuckets([
      // news, 15pt YES divergence, ask 0.40, YES won → +1.5
      { category: "news", probability: 0.55, yes_ask: 0.4, no_ask: 0.62, winning_outcome_index: 0 },
      // news, 15pt YES divergence, ask 0.40, NO won → -1
      { category: "news", probability: 0.55, yes_ask: 0.4, no_ask: 0.62, winning_outcome_index: 1 },
      // heartbeat, ~1pt divergence (agreement), NO side, NO won → +1/0.55-1
      { category: "heartbeat", probability: 0.44, yes_ask: 0.45, no_ask: 0.55, winning_outcome_index: 1 },
      // unresolvable rows are skipped
      { category: "news", probability: 0.5, yes_ask: null, no_ask: null, winning_outcome_index: 0 },
      { category: "news", probability: 0.5, yes_ask: 0.5, no_ask: 0.5, winning_outcome_index: null },
    ]);
    expect(buckets).toEqual([
      { category: "news", bucket: ">=10pt", n: 2, hits: 1, avg_pnl_per_dollar: 0.25 },
      { category: "heartbeat", bucket: "<2pt", n: 1, hits: 1, avg_pnl_per_dollar: Math.round((1 - 0.55) / 0.55 * 10_000) / 10_000 },
    ]);
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
    const feeMarket = market({ id: "9", fees_enabled: true, volume_24h_usd: 10_000 });

    const picked = selectAnalystCandidates(
      [tooSoon, tooFar, thin, extreme, repeat, positioned, good, negRisk, feeMarket],
      { recentlyForecastedMarketIds: new Set(["5"]), openPositionMarketIds: new Set(["6"]), nowMs: now },
    );
    expect(picked.map((m) => m.id)).toEqual(["7", "9"]);
  });

  test("news markets take a 10k liquidity floor; heartbeat keeps 20k", () => {
    const thinNews = market({ id: "thin-news", liquidity_usd: 12_000 });
    const thinHeartbeat = market({
      id: "thin-hb",
      question: "Liquid vs Metizport",
      slug: "cs2-tl1-mzp-2026-08-08",
      liquidity_usd: 12_000,
      end_date: new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString(),
    });
    const picked = selectAnalystCandidates([thinNews, thinHeartbeat], {
      recentlyForecastedMarketIds: new Set(),
      openPositionMarketIds: new Set(),
    });
    expect(picked.map((m) => m.id)).toEqual(["thin-news"]);
  });

  test("caps the batch at ten, news soonest-first", () => {
    const now = Date.now();
    const days = (n: number) => new Date(now + n * 24 * 60 * 60 * 1_000).toISOString();
    const markets = Array.from({ length: 12 }, (_, index) =>
      market({ id: String(index + 1), end_date: days(13 - index) }));
    const picked = selectAnalystCandidates(markets, {
      recentlyForecastedMarketIds: new Set(),
      openPositionMarketIds: new Set(),
      nowMs: now,
    });
    expect(picked).toHaveLength(10);
    expect(picked[0].id).toBe("12");
  });

  test("news fills seven priority slots soonest-first; heartbeat fills the rest", () => {
    const now = Date.now();
    const hours = (n: number) => new Date(now + n * 60 * 60 * 1_000).toISOString();
    const news = Array.from({ length: 9 }, (_, index) =>
      market({ id: `news-${index + 1}`, end_date: hours(24 + index * 12) }));
    const heartbeat = Array.from({ length: 4 }, (_, index) =>
      market({
        id: `hb-${index + 1}`,
        question: `Team A vs Team B match ${index + 1}`,
        slug: `cs2-a-b-${index + 1}`,
        end_date: hours(4 + index),
      }));
    const picked = selectAnalystCandidates([...heartbeat, ...news], {
      recentlyForecastedMarketIds: new Set(),
      openPositionMarketIds: new Set(),
      nowMs: now,
    });
    expect(picked).toHaveLength(10);
    expect(picked.slice(0, 7).map((m) => m.id)).toEqual(
      ["news-1", "news-2", "news-3", "news-4", "news-5", "news-6", "news-7"],
    );
    expect(picked.slice(7).map((m) => m.id)).toEqual(["hb-1", "hb-2", "hb-3"]);
  });

  test("with no heartbeat supply, remaining news markets spill into the batch", () => {
    const now = Date.now();
    const days = (n: number) => new Date(now + n * 24 * 60 * 60 * 1_000).toISOString();
    const news = Array.from({ length: 9 }, (_, index) =>
      market({ id: `news-${index + 1}`, end_date: days(1 + index) }));
    const picked = selectAnalystCandidates(news, {
      recentlyForecastedMarketIds: new Set(),
      openPositionMarketIds: new Set(),
      nowMs: now,
    });
    expect(picked.map((m) => m.id)).toEqual(
      ["news-1", "news-2", "news-3", "news-4", "news-5", "news-6", "news-7", "news-8", "news-9"],
    );
  });

  test("a market three hours out is eligible; two hours out is not", () => {
    const now = Date.now();
    const eligible = market({ id: "soon", end_date: new Date(now + 3.5 * 60 * 60 * 1_000).toISOString() });
    const tooSoon = market({ id: "too-soon", end_date: new Date(now + 2 * 60 * 60 * 1_000).toISOString() });
    const picked = selectAnalystCandidates([eligible, tooSoon], {
      recentlyForecastedMarketIds: new Set(),
      openPositionMarketIds: new Set(),
      nowMs: now,
    });
    expect(picked.map((m) => m.id)).toEqual(["soon"]);
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
    expect(prompt).not.toContain("track record");
  });

  test("includes the graded track record when provided", () => {
    const trackRecord = formatAnalystTrackRecord({
      resolved_count: 12,
      mean_brier_model: 0.181,
      mean_brier_market: 0.2045,
      recent: [{ question: "Did Y happen?", probability: 0.7, yes_price: 0.55, winning_outcome_index: 0, brier_model: 0.09 }],
    });
    expect(trackRecord).toContain("12 resolved forecasts. Mean Brier: you 0.181 vs market 0.204");
    expect(trackRecord).toContain('"Did Y happen?" you 0.70, market 0.55, resolved YES (your Brier 0.090)');
    const prompt = buildAnalystForecastPrompt({
      question: "Will X happen?",
      description: "",
      endDate: null,
      yesPrice: 0.5,
      nowIso: new Date().toISOString(),
      trackRecord,
    });
    expect(prompt).toContain("Your recent track record on this venue:");
    expect(formatAnalystTrackRecord({ resolved_count: 0, mean_brier_model: null, mean_brier_market: null, recent: [] })).toBeUndefined();
  });
});

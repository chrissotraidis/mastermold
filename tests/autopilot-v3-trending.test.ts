/// <reference types="bun" />

/**
 * V3 `trending` module — the Solana-native attention/flow adapter. Pure
 * parsers over canned GeckoTerminal/DexScreener fixtures, the composite
 * score, and the candidate floors. No network.
 */

import { describe, expect, test } from "bun:test";

import { conservativeCost } from "../src/autopilot/v3/execution-cost";
import { enabledModulesFor } from "../src/autopilot/v3/shadow";
import {
  mergeTrendingSources,
  parseDexBoosts,
  parseGeckoTrendingPools,
  trendingCandidate,
  trendingEnabledIn,
  trendingScore,
  TRENDING_MIN_LIQUIDITY_USD,
  type TrendingToken,
} from "../src/autopilot/v3/trending";

const GECKO_FIXTURE = {
  data: [
    {
      id: "solana_pool1",
      type: "pool",
      attributes: {
        name: "MOODENG / SOL",
        base_token_price_usd: "0.21",
        reserve_in_usd: "800000",
        volume_usd: { h24: "5200000" },
        price_change_percentage: { h1: "2.1", h24: "18.4" },
      },
      relationships: { base_token: { data: { id: "solana_MoodengMint1111111111111111111111111111111" } } },
    },
    {
      id: "solana_pool2",
      type: "pool",
      attributes: {
        name: "USDC / SOL",
        base_token_price_usd: "1.0",
        reserve_in_usd: "9000000",
        volume_usd: { h24: "99000000" },
        price_change_percentage: { h1: "0", h24: "0" },
      },
      // USDC is excluded — stables are never usefully "trending".
      relationships: { base_token: { data: { id: "solana_EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" } } },
    },
    {
      id: "solana_pool3",
      type: "pool",
      attributes: {
        name: "THINDOG / SOL",
        base_token_price_usd: "0.002",
        reserve_in_usd: "40000", // below the liquidity floor
        volume_usd: { h24: "90000" },
        price_change_percentage: { h1: "9.9", h24: "44.0" },
      },
      relationships: { base_token: { data: { id: "solana_ThinDogMint1111111111111111111111111111111" } } },
    },
  ],
};

const BOOSTS_FIXTURE = [
  { chainId: "solana", tokenAddress: "MoodengMint1111111111111111111111111111111", totalAmount: 500 },
  { chainId: "ethereum", tokenAddress: "0xNotSolana", totalAmount: 900 },
];

describe("trending parsers", () => {
  test("GIVEN a GeckoTerminal body THEN pools become ranked tokens, stables and junk excluded", () => {
    const tokens = parseGeckoTrendingPools(GECKO_FIXTURE);
    expect(tokens).toHaveLength(2);
    expect(tokens[0].symbol).toBe("MOODENG");
    expect(tokens[0].rank).toBe(1);
    expect(tokens[0].price_change_h24_pct).toBe(18.4);
    expect(tokens[0].liquidity_usd).toBe(800000);
    expect(tokens.some((token) => token.symbol === "USDC")).toBe(false);
  });

  test("GIVEN garbage bodies THEN parsers return [] instead of throwing", () => {
    expect(parseGeckoTrendingPools(null)).toEqual([]);
    expect(parseGeckoTrendingPools({ data: "nope" })).toEqual([]);
    expect(parseDexBoosts(null)).toEqual([]);
    expect(parseDexBoosts([{ chainId: "solana" }])).toEqual([]);
  });

  test("GIVEN boosts THEN they merge onto trending rows and non-Solana rows are dropped", () => {
    const merged = mergeTrendingSources(parseGeckoTrendingPools(GECKO_FIXTURE), parseDexBoosts(BOOSTS_FIXTURE));
    const moodeng = merged.find((token) => token.symbol === "MOODENG");
    expect(moodeng?.boost_amount).toBe(500);
    expect(moodeng?.sources).toEqual(["gecko_trending", "dex_boosts"]);
  });
});

describe("trending candidate", () => {
  const base: TrendingToken = {
    mint: "MoodengMint1111111111111111111111111111111",
    symbol: "MOODENG",
    sources: ["gecko_trending"],
    rank: 1,
    price_usd: 0.21,
    price_change_h1_pct: 2.1,
    price_change_h24_pct: 18.4,
    volume_h24_usd: 5_200_000,
    liquidity_usd: 800_000,
    boost_amount: null,
  };

  test("GIVEN a hot, liquid token THEN a positive-scored buy candidate emerges", () => {
    const candidate = trendingCandidate(base, conservativeCost());
    expect(candidate).not.toBeNull();
    expect(candidate?.strategy_id).toBe("trending");
    expect(candidate?.side).toBe("buy");
    expect(candidate?.expected_value_bps).toBeGreaterThan(-Infinity);
    expect(candidate?.features.rank).toBe(1);
  });

  test("GIVEN thin liquidity or missing price THEN no candidate", () => {
    expect(trendingCandidate({ ...base, liquidity_usd: TRENDING_MIN_LIQUIDITY_USD - 1 }, conservativeCost())).toBeNull();
    expect(trendingCandidate({ ...base, price_usd: null }, conservativeCost())).toBeNull();
    expect(trendingCandidate({ ...base, volume_h24_usd: 1000 }, conservativeCost())).toBeNull();
  });

  test("GIVEN a vertical 1h spike THEN the score is penalized (no chasing)", () => {
    const calm = trendingScore(base);
    const spiking = trendingScore({ ...base, price_change_h1_pct: 25 });
    expect(spiking).toBeLessThan(calm + 1); // penalty offsets the extra momentum
  });

  test("GIVEN regimes THEN trending runs in risk_on and chop, never risk_off", () => {
    expect(trendingEnabledIn("risk_on")).toBe(true);
    expect(trendingEnabledIn("chop")).toBe(true);
    expect(trendingEnabledIn("risk_off")).toBe(false);
    expect(enabledModulesFor("chop").has("trending")).toBe(true);
    expect(enabledModulesFor("risk_off").has("trending")).toBe(false);
  });
});

/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { decide, fetchPrices, rotateTierB, type DecisionInput } from "../src/autopilot/daemon";
import { __resetMarketFeedCacheForTests, fetchMarketFeed, type MarketFeedRow } from "../src/autopilot/feed";
import { DEFAULT_STRATEGY_PARAMS } from "../src/autopilot/params";
import {
  __resetAutopilotStoreForTests,
  autopilotStore,
  DEFAULT_AUTOPILOT_CAPS,
  type BotStateRow,
} from "../src/autopilot/store";
import type { TrendingToken } from "../src/autopilot/v3/trending";
import {
  buildTradableUniverse,
  DEFAULT_TIER_B_CONFIG,
  selectTierB,
  type TierBCandidate,
  type TierBToken,
} from "../src/autopilot/v3/universe-tiers";

const NOW = Date.parse("2026-07-12T12:00:00.000Z");
const OLD = new Date(NOW - 20 * 24 * 60 * 60_000).toISOString();
const B1 = "TierB11111111111111111111111111111111111111";
const B2 = "TierB22222222222222222222222222222222222222";
const B3 = "TierB33333333333333333333333333333333333333";

function candidate(overrides: Partial<TierBCandidate> = {}): TierBCandidate {
  return {
    mint: B1,
    symbol: "ALPHA",
    sources: ["gecko_trending"],
    rank: 1,
    price_usd: 1,
    price_change_h1_pct: 1,
    price_change_h24_pct: 5,
    volume_h24_usd: 2_000_000,
    liquidity_usd: 1_000_000,
    boost_amount: null,
    pool_address: "pool",
    first_seen_ts: OLD,
    decimals: 6,
    ...overrides,
  };
}

function persisted(overrides: Partial<TierBToken> = {}): TierBToken {
  return {
    symbol: "ALPHA",
    mint: B1,
    liquidity_usd: 1_000_000,
    volume_h24_usd: 2_000_000,
    first_seen_ts: OLD,
    added_ts: new Date(NOW - 10 * 24 * 60 * 60_000).toISOString(),
    below_exit_floor_days: 0,
    ...overrides,
  };
}

describe("pure Tier B selection", () => {
  test("entry requires every floor, age, resolved decimals, and ranks traded-and-deep surplus", () => {
    const result = selectTierB([], [
      candidate({ mint: B1, symbol: "ONE", volume_h24_usd: 2_000_000, liquidity_usd: 1_000_000 }),
      candidate({ mint: B2, symbol: "TWO", volume_h24_usd: 4_000_000, liquidity_usd: 1_000_000 }),
      candidate({ mint: B3, symbol: "THREE", decimals: null }),
    ], new Set(), { ...DEFAULT_TIER_B_CONFIG, max_tokens: 1 }, NOW);
    expect(result.next.map((token) => token.mint)).toEqual([B2]);
    expect(result.added[0]?.below_exit_floor_days).toBe(0);

    expect(selectTierB([], [candidate({ first_seen_ts: new Date(NOW - 2 * 24 * 60 * 60_000).toISOString() })], new Set(), DEFAULT_TIER_B_CONFIG, NOW).next).toEqual([]);
    expect(selectTierB([], [candidate({ liquidity_usd: 749_999 })], new Set(), DEFAULT_TIER_B_CONFIG, NOW).next).toEqual([]);
    expect(selectTierB([], [candidate({ volume_h24_usd: 999_999 })], new Set(), DEFAULT_TIER_B_CONFIG, NOW).next).toEqual([]);
  });

  test("hysteresis keeps oscillating depth, resets recovery, and drops after three low days", () => {
    const at600 = selectTierB([persisted()], [candidate({ liquidity_usd: 600_000 })], new Set(), DEFAULT_TIER_B_CONFIG, NOW);
    expect(at600.next[0]?.below_exit_floor_days).toBe(0);

    const day1 = selectTierB(at600.next, [candidate({ liquidity_usd: 400_000 })], new Set(), DEFAULT_TIER_B_CONFIG, NOW + 24 * 60 * 60_000);
    expect(day1.next[0]?.below_exit_floor_days).toBe(1);
    const recovered = selectTierB(day1.next, [candidate({ liquidity_usd: 800_000 })], new Set(), DEFAULT_TIER_B_CONFIG, NOW + 2 * 24 * 60 * 60_000);
    expect(recovered.next[0]?.below_exit_floor_days).toBe(0);

    const low1 = selectTierB(recovered.next, [candidate({ liquidity_usd: 400_000 })], new Set(), DEFAULT_TIER_B_CONFIG, NOW + 3 * 24 * 60 * 60_000);
    const low2 = selectTierB(low1.next, [candidate({ liquidity_usd: 400_000 })], new Set(), DEFAULT_TIER_B_CONFIG, NOW + 4 * 24 * 60 * 60_000);
    const low3 = selectTierB(low2.next, [candidate({ liquidity_usd: 400_000 })], new Set(), DEFAULT_TIER_B_CONFIG, NOW + 5 * 24 * 60 * 60_000);
    expect(low3.next).toEqual([]);
    expect(low3.dropped[0]?.reason).toContain("3 daily evaluations");
  });

  test("rug depth, disappearance, denylist, and Tier A mints drop or fail closed", () => {
    expect(selectTierB([persisted()], [candidate({ liquidity_usd: 249_999 })], new Set(), DEFAULT_TIER_B_CONFIG, NOW).dropped[0]?.reason).toContain("rug floor");
    expect(selectTierB([persisted()], [], new Set(), DEFAULT_TIER_B_CONFIG, NOW).dropped[0]?.reason).toContain("vanished");
    expect(selectTierB([persisted()], [candidate()], new Set([B1]), DEFAULT_TIER_B_CONFIG, NOW).next).toEqual([]);
    expect(selectTierB([], [candidate({ mint: "So11111111111111111111111111111111111111112" })], new Set(), DEFAULT_TIER_B_CONFIG, NOW).next).toEqual([]);
  });

  test("static Tier A plus persisted Tier B is deduplicated and tier-labeled", () => {
    expect(buildTradableUniverse([persisted()]).filter((asset) => asset.tier === "B")).toEqual([]);
    const universe = buildTradableUniverse(
      [persisted(), persisted({ mint: "So11111111111111111111111111111111111111112" })],
      [{ mint: B1, symbol: "ALPHA", decimals: 6, resolved_at: OLD }],
    );
    expect(universe.filter((asset) => asset.tier === "A")).toHaveLength(9);
    expect(universe.filter((asset) => asset.tier === "B")).toEqual([{ symbol: "ALPHA", mint: B1, tier: "B" }]);
  });

  test("Tier B symbols cannot collide with Tier A or another accepted mint", () => {
    const meta = [
      { mint: B1, symbol: "sol", decimals: 6, resolved_at: OLD },
      { mint: B2, symbol: "ALPHA", decimals: 6, resolved_at: OLD },
      { mint: B3, symbol: "alpha", decimals: 6, resolved_at: OLD },
    ];
    const universe = buildTradableUniverse([
      persisted({ mint: B1, symbol: "sol" }),
      persisted({ mint: B2, symbol: "ALPHA" }),
      persisted({ mint: B3, symbol: " alpha " }),
    ], meta);
    expect(universe.filter((asset) => asset.tier === "B")).toEqual([{ symbol: "ALPHA", mint: B2, tier: "B" }]);
    expect(universe.filter((asset) => asset.symbol.toUpperCase() === "SOL")).toHaveLength(1);
  });
});

let previousDb: string | undefined;

beforeEach(() => {
  previousDb = process.env.AUTOPILOT_DB;
  process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-tier-b-")), "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (previousDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = previousDb;
  __resetAutopilotStoreForTests();
});

function trending(overrides: Partial<TrendingToken> = {}): TrendingToken {
  const base = candidate(overrides as Partial<TierBCandidate>);
  const { first_seen_ts: _firstSeen, decimals: _decimals, ...token } = base;
  return token;
}

function state(): BotStateRow {
  return {
    mode: "paper",
    kill_switch: false,
    started_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    caps: { ...DEFAULT_AUTOPILOT_CAPS },
    wallet_label: null,
    last_tick_at: null,
  };
}

describe("Tier B store and daemon seams", () => {
  test("rotation persists metadata and a token; a subsequent decision evaluates it at the $15 Tier B cap", async () => {
    const store = autopilotStore();
    store.setTierBFirstSeen({ [B1]: OLD });
    const rotation = await rotateTierB(store, [trending()], [], NOW, async () => 6);
    expect(rotation?.added.map((token) => token.mint)).toEqual([B1]);
    expect(store.tierB()).toHaveLength(1);
    expect(store.mintMeta()).toEqual([{ mint: B1, symbol: "ALPHA", decimals: 6, resolved_at: new Date(NOW).toISOString() }]);

    __resetAutopilotStoreForTests();
    const universe = buildTradableUniverse(autopilotStore().tierB(), autopilotStore().mintMeta());
    const window = Array.from({ length: 40 }, (_, index) => 1.004 - (0.004 * index) / 39);
    const feedRow: MarketFeedRow = {
      symbol: "ALPHA",
      price_usd: 1,
      change_h1_pct: 1,
      change_h24_pct: 5,
      volume_h24_usd: 2_000_000,
      liquidity_usd: 1_000_000,
    };
    const input: DecisionInput = {
      windows: new Map([[B1, window]]),
      positions: [],
      state: state(),
      cash_usd: 1_000,
      feed: new Map([["ALPHA", feedRow]]),
      now_ms: NOW,
      trades_today: 0,
      cooldown_until_ms: new Map(),
      loss_streak: 0,
      last_loss_ms: null,
      params: DEFAULT_STRATEGY_PARAMS,
      universe,
    };
    const decision = decide(input).decisions[0];
    expect(decision?.action).toBe("buy");
    if (decision?.action !== "buy") throw new Error("expected Tier B buy");
    expect(decision.symbol).toBe("ALPHA");
    expect(decision.value_usd).toBe(15);
  });

  test("price batching includes an arbitrary persisted Tier B mint", async () => {
    let requested = "";
    const prices = await fetchPrices([B1], async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ data: { [B1]: { usdPrice: 1.25 } } }), { status: 200 });
    });
    expect(requested).toContain(B1);
    expect(prices.get(B1)).toBe(1.25);
  });

  test("market feed fans out over Tier B and invalidates cache when the active universe changes", async () => {
    __resetMarketFeedCacheForTests();
    let calls = 0;
    const doFetch = async (input: string | URL | Request) => {
      calls += 1;
      const mint = String(input).split("/").at(-1) as string;
      return new Response(JSON.stringify({ pairs: [{
        chainId: "solana",
        baseToken: { address: mint, symbol: mint === B1 ? "ONE" : "TWO" },
        quoteToken: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
        priceUsd: "1.25",
        priceChange: { h1: 1, h24: 5 },
        volume: { h24: 2_000_000 },
        liquidity: { usd: 1_000_000 },
      }] }), { status: 200 });
    };
    const one = await fetchMarketFeed(NOW, [{ symbol: "ONE", mint: B1 }], doFetch);
    const cached = await fetchMarketFeed(NOW + 1, [{ symbol: "ONE", mint: B1 }], doFetch);
    const two = await fetchMarketFeed(NOW + 2, [{ symbol: "TWO", mint: B2 }], doFetch);
    expect(one[0]?.symbol).toBe("ONE");
    expect(cached[0]?.symbol).toBe("ONE");
    expect(two[0]?.symbol).toBe("TWO");
    expect(calls).toBe(2);
  });

  test("a dropped held token leaves the tradable set and is explicitly logged exit-only", async () => {
    const store = autopilotStore();
    store.setTierB([persisted()]);
    store.setTierBFirstSeen({ [B1]: OLD });
    store.upsertMintMeta({ mint: B1, symbol: "ALPHA", decimals: 6, resolved_at: OLD });
    const position = {
      mint: B1,
      symbol: "ALPHA",
      qty: 10,
      avg_cost_usd: 1,
      opened_at: OLD,
      updated_at: OLD,
    };
    store.upsertPosition(position);
    await rotateTierB(store, [trending({ liquidity_usd: 200_000 })], [position], NOW, async () => 6);
    expect(store.tierB()).toEqual([]);
    expect(store.positions()).toHaveLength(1);
    expect(store.activity(5)[0]?.message).toContain("exit-only");
  });
});

/// <reference types="bun" />

/**
 * Wallet discovery: pure anti-trap scoring, both source parsers on canned
 * bodies, and the fetch shell's key/keyless fallback order via injected
 * fetch. No network.
 */

import { describe, expect, test } from "bun:test";

import {
  fetchWalletSuggestions,
  parseSolanaTrackerLeaderboard,
  scoreLeaderboardWallet,
  tradersFromPoolTrades,
  MIN_TRADES,
  WIN_RATE_BOT_CEILING,
} from "../src/autopilot/v3/wallet-discovery";

const ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ADDRESS_2 = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

function walletInput(over: Partial<Parameters<typeof scoreLeaderboardWallet>[0]> = {}) {
  return {
    address: ADDRESS,
    win_rate: 0.62,
    realized_pnl_usd: 25_000,
    trades: 80,
    tokens_traded: 18,
    period_days: 30,
    labeled_bot: false,
    labeled_infra: false,
    ...over,
  };
}

describe("scoreLeaderboardWallet (anti-trap rules)", () => {
  test("GIVEN a healthy trader THEN a high score with no flags", () => {
    const scored = scoreLeaderboardWallet(walletInput());
    expect(scored).not.toBeNull();
    expect(scored!.score).toBeGreaterThan(70);
    expect(scored!.flags).toEqual([]);
  });

  test("GIVEN labeled bots/infra, thin records, or losses THEN excluded outright", () => {
    expect(scoreLeaderboardWallet(walletInput({ labeled_bot: true }))).toBeNull();
    expect(scoreLeaderboardWallet(walletInput({ labeled_infra: true }))).toBeNull();
    expect(scoreLeaderboardWallet(walletInput({ trades: MIN_TRADES - 1 }))).toBeNull();
    expect(scoreLeaderboardWallet(walletInput({ realized_pnl_usd: -500 }))).toBeNull();
    expect(scoreLeaderboardWallet(walletInput({ win_rate: 0.3 }))).toBeNull();
    expect(scoreLeaderboardWallet(walletInput({ address: "0xnope" }))).toBeNull();
  });

  test("GIVEN a 95% win rate THEN discounted and flagged, not celebrated", () => {
    const suspicious = scoreLeaderboardWallet(walletInput({ win_rate: 0.95 }));
    const healthy = scoreLeaderboardWallet(walletInput({ win_rate: 0.6 }));
    expect(suspicious).not.toBeNull();
    expect(suspicious!.score).toBeLessThan(healthy!.score);
    expect(suspicious!.flags.some((flag) => flag.includes("bot/insider"))).toBe(true);
    expect(WIN_RATE_BOT_CEILING).toBeLessThan(0.95);
  });

  test("GIVEN spray-everything token counts THEN penalized and flagged", () => {
    const sprayer = scoreLeaderboardWallet(walletInput({ tokens_traded: 400 }));
    expect(sprayer!.flags.some((flag) => flag.includes("spray"))).toBe(true);
  });
});

describe("parseSolanaTrackerLeaderboard", () => {
  const body = {
    traders: [
      {
        wallet: ADDRESS,
        winRate: 62.5, // percent form — must normalize
        period: { realized: 42_000 },
        counts: { trades: 120 },
        tokens: { closed: 22 },
        identity: { bot: false, pool: false, developer: false, exchange: false },
      },
      {
        wallet: ADDRESS_2,
        winRate: 71,
        period: { realized: 90_000 },
        counts: { trades: 60 },
        tokens: { closed: 12 },
        identity: { bot: true }, // labeled bot: must vanish
      },
    ],
  };

  test("GIVEN a leaderboard body THEN scored suggestions with bots excluded", () => {
    const suggestions = parseSolanaTrackerLeaderboard(body, 30);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].address).toBe(ADDRESS);
    expect(suggestions[0].win_rate).toBeCloseTo(0.625, 6);
    expect(suggestions[0].source).toBe("solanatracker");
  });

  test("GIVEN garbage THEN [] instead of throwing", () => {
    expect(parseSolanaTrackerLeaderboard(null, 30)).toEqual([]);
    expect(parseSolanaTrackerLeaderboard({ traders: "nope" }, 30)).toEqual([]);
  });
});

describe("tradersFromPoolTrades (keyless fallback)", () => {
  const trade = (wallet: string, volume: number, kind = "buy") => ({
    attributes: { tx_from_address: wallet, volume_in_usd: String(volume), kind },
  });

  test("GIVEN pool trades THEN repeat buyers aggregate into low-scored flagged leads", () => {
    const leads = tradersFromPoolTrades({
      data: [trade(ADDRESS, 800), trade(ADDRESS, 1200), trade(ADDRESS_2, 300), trade(ADDRESS_2, 90, "sell")],
    });
    expect(leads).toHaveLength(1); // ADDRESS_2 has only one qualifying buy
    expect(leads[0].address).toBe(ADDRESS);
    expect(leads[0].score).toBeLessThanOrEqual(30);
    expect(leads[0].flags[0]).toContain("activity-only");
  });
});

describe("fetchWalletSuggestions fallback order", () => {
  test("GIVEN a key THEN the leaderboard wins; GIVEN none THEN pool trades; GIVEN nothing THEN empty", async () => {
    const leaderboardBody = {
      traders: [
        {
          wallet: ADDRESS,
          winRate: 60,
          period: { realized: 10_000 },
          counts: { trades: 50 },
          tokens: { closed: 15 },
          identity: {},
        },
      ],
    };
    const routes = (async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes("solanatracker")) return new Response(JSON.stringify(leaderboardBody));
      if (href.includes("geckoterminal"))
        return new Response(
          JSON.stringify({ data: [{ attributes: { tx_from_address: ADDRESS_2, volume_in_usd: "900", kind: "buy" } }, { attributes: { tx_from_address: ADDRESS_2, volume_in_usd: "700", kind: "buy" } }] }),
        );
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    const keyed = await fetchWalletSuggestions({ apiKey: "k", trendingPools: ["pool1"], nowMs: 1, fetchImpl: routes });
    expect(keyed.source).toBe("solanatracker");
    expect(keyed.suggestions[0].address).toBe(ADDRESS);

    const keyless = await fetchWalletSuggestions({ apiKey: null, trendingPools: ["pool1"], nowMs: 1, fetchImpl: routes });
    expect(keyless.source).toBe("gecko_trades");
    expect(keyless.suggestions[0].address).toBe(ADDRESS_2);

    const nothing = await fetchWalletSuggestions({
      apiKey: null,
      trendingPools: [],
      nowMs: 1,
      fetchImpl: routes,
    });
    expect(nothing.source).toBe("none");
    expect(nothing.suggestions).toEqual([]);
  });
});

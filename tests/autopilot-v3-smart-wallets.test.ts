/// <reference types="bun" />

/**
 * V3 `copy_wallets` module — smart-money following. Pure parsers over canned
 * RPC bodies, the budgeted scan shell against an injected fetch, and the
 * candidate floors. No network.
 */

import { describe, expect, test } from "bun:test";

import { memecoinConservativeCost } from "../src/autopilot/v3/execution-cost";
import { enabledModulesFor } from "../src/autopilot/v3/shadow";
import {
  buysFromTransaction,
  copyWalletCandidate,
  copyWalletsEnabledIn,
  isPlausibleSolanaAddress,
  scanWatchedWallets,
  walletReportCards,
  COPY_MIN_LIQUIDITY_USD,
  WALLET_GRADE_HORIZON_MS,
  type WalletBuyEvent,
} from "../src/autopilot/v3/smart-wallets";
import type { PriceObservation } from "../src/autopilot/v3/candidate-store";

const WALLET = "SmartWa11etAddressAAAAAAAAAAAAAAAAAAAAAAA";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MEME = "MemeMintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** A jsonParsed getTransaction body: wallet swaps 500 USDC for 1000 MEME. */
function swapTransaction(over: { usdcSpent?: number; memeGained?: number; err?: unknown } = {}) {
  const usdcSpent = over.usdcSpent ?? 500;
  const memeGained = over.memeGained ?? 1000;
  return {
    result: {
      blockTime: 1_780_000_000,
      meta: {
        err: over.err ?? null,
        preTokenBalances: [
          { mint: USDC, owner: WALLET, uiTokenAmount: { uiAmount: 1_000 } },
          { mint: MEME, owner: WALLET, uiTokenAmount: { uiAmount: 0 } },
        ],
        postTokenBalances: [
          { mint: USDC, owner: WALLET, uiTokenAmount: { uiAmount: 1_000 - usdcSpent } },
          { mint: MEME, owner: WALLET, uiTokenAmount: { uiAmount: memeGained } },
        ],
        preBalances: [10_000_000_000],
        postBalances: [9_995_000_000],
      },
      transaction: {
        signatures: ["sig-swap-1"],
        message: { accountKeys: [{ pubkey: WALLET }] },
      },
    },
  };
}

describe("buysFromTransaction", () => {
  test("GIVEN a USDC-for-token swap THEN one buy event with USD spent", () => {
    const events = buysFromTransaction(swapTransaction(), WALLET);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ wallet: WALLET, mint: MEME, ui_amount: 1000, quote_spent_usd: 500 });
    expect(events[0].signature).toBe("sig-swap-1");
  });

  test("GIVEN a failed tx, dust, or someone else's balances THEN no events", () => {
    expect(buysFromTransaction(swapTransaction({ err: { InstructionError: [0, "Custom"] } }), WALLET)).toEqual([]);
    expect(buysFromTransaction(swapTransaction({ usdcSpent: 5 }), WALLET)).toEqual([]); // dust
    expect(buysFromTransaction(swapTransaction(), "OtherWa11etBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")).toEqual([]);
    expect(buysFromTransaction(null, WALLET)).toEqual([]);
  });
});

describe("scanWatchedWallets", () => {
  function rpcFetch(responses: Record<string, unknown>) {
    return (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      return new Response(JSON.stringify(responses[body.method] ?? {}));
    }) as unknown as typeof fetch;
  }

  test("GIVEN a first sighting THEN the cursor is set without replaying history", async () => {
    const result = await scanWatchedWallets([WALLET], {}, "http://rpc.test", rpcFetch({
      getSignaturesForAddress: { result: [{ signature: "sig-new", err: null }] },
    }));
    expect(result.cursors[WALLET]).toBe("sig-new");
    expect(result.events).toEqual([]);
  });

  test("GIVEN a cursor and a fresh swap THEN the buy is detected and the cursor advances", async () => {
    const result = await scanWatchedWallets([WALLET], { [WALLET]: "sig-old" }, "http://rpc.test", rpcFetch({
      getSignaturesForAddress: { result: [{ signature: "sig-swap-1", err: null }] },
      getTransaction: swapTransaction(),
    }));
    expect(result.events).toHaveLength(1);
    expect(result.events[0].mint).toBe(MEME);
    expect(result.cursors[WALLET]).toBe("sig-swap-1");
  });

  test("GIVEN an RPC failure THEN the scan degrades to no events, never throws", async () => {
    const failing = (async () => {
      throw new Error("rate limited");
    }) as unknown as typeof fetch;
    const result = await scanWatchedWallets([WALLET], { [WALLET]: "sig-old" }, "http://rpc.test", failing);
    expect(result.events).toEqual([]);
    expect(result.cursors[WALLET]).toBe("sig-old");
  });

  test("GIVEN a mid-loop transaction failure THEN the watermark stays at the last processed tx so nothing is lost", async () => {
    // Listing is newest-first: [sig-3, sig-2, sig-1]; processing is
    // oldest-first. sig-1 succeeds, sig-2 blows up — the cursor must end at
    // sig-1 so sig-2 and sig-3 are re-listed (until=sig-1) next cycle.
    let txCalls = 0;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (body.method === "getSignaturesForAddress") {
        return new Response(
          JSON.stringify({ result: [{ signature: "sig-3", err: null }, { signature: "sig-2", err: null }, { signature: "sig-1", err: null }] }),
        );
      }
      txCalls += 1;
      if (txCalls >= 2) throw new Error("rate limited");
      return new Response(JSON.stringify(swapTransaction()));
    }) as unknown as typeof fetch;

    const result = await scanWatchedWallets([WALLET], { [WALLET]: "sig-0" }, "http://rpc.test", fetchImpl);
    expect(result.events).toHaveLength(1); // sig-1's buy landed before the failure
    expect(result.cursors[WALLET]).toBe("sig-1"); // NOT sig-3 — sig-2/sig-3 retry next cycle
  });

  test("GIVEN more fresh txs than the per-cycle cap THEN the oldest are processed and the watermark leaves the rest for next cycle", async () => {
    const signatures = ["sig-9", "sig-8", "sig-7", "sig-6", "sig-5"]; // newest-first
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      if (body.method === "getSignaturesForAddress") {
        return new Response(JSON.stringify({ result: signatures.map((signature) => ({ signature, err: null })) }));
      }
      return new Response(JSON.stringify(swapTransaction()));
    }) as unknown as typeof fetch;

    const result = await scanWatchedWallets([WALLET], { [WALLET]: "sig-4" }, "http://rpc.test", fetchImpl);
    // Cap is 3: oldest three (sig-5, sig-6, sig-7) processed; watermark at
    // sig-7 so sig-8/sig-9 are re-listed next cycle instead of skipped.
    expect(result.events).toHaveLength(3);
    expect(result.cursors[WALLET]).toBe("sig-7");
  });
});

describe("copyWalletCandidate", () => {
  const event: WalletBuyEvent = {
    wallet: WALLET,
    mint: MEME,
    ui_amount: 1000,
    quote_spent_usd: 500,
    ts: "2026-07-09T00:00:00Z",
    signature: "sig-swap-1",
  };

  test("GIVEN a liquid buy THEN a slow-horizon candidate with conviction-scaled confidence", () => {
    const candidate = copyWalletCandidate({
      mint: MEME,
      symbol: "MEME",
      events: [event, { ...event, wallet: "SecondWa11etCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC" }],
      price_usd: 0.5,
      liquidity_usd: 400_000,
      cost: memecoinConservativeCost(),
    });
    expect(candidate).not.toBeNull();
    expect(candidate?.strategy_id).toBe("copy_wallets");
    expect(candidate?.horizon_sec).toBe(24 * 60 * 60);
    expect(candidate?.features.wallets).toBe(2);
    expect(candidate?.expected_return_bps).toBe(180);
  });

  test("GIVEN thin liquidity or no price THEN no candidate", () => {
    const base = { mint: MEME, symbol: "MEME", events: [event], cost: memecoinConservativeCost() };
    expect(copyWalletCandidate({ ...base, price_usd: 0.5, liquidity_usd: COPY_MIN_LIQUIDITY_USD - 1 })).toBeNull();
    expect(copyWalletCandidate({ ...base, price_usd: null, liquidity_usd: 400_000 })).toBeNull();
  });

  test("GIVEN regimes THEN copy_wallets runs outside risk_off and joins the module set", () => {
    expect(copyWalletsEnabledIn("risk_on")).toBe(true);
    expect(copyWalletsEnabledIn("chop")).toBe(true);
    expect(copyWalletsEnabledIn("risk_off")).toBe(false);
    expect(enabledModulesFor("risk_on").has("copy_wallets")).toBe(true);
    expect(enabledModulesFor("risk_off").has("copy_wallets")).toBe(false);
  });

  test("GIVEN address shapes THEN base58 sanity holds", () => {
    expect(isPlausibleSolanaAddress("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(true);
    expect(isPlausibleSolanaAddress("0xdeadbeef")).toBe(false);
    expect(isPlausibleSolanaAddress("short")).toBe(false);
  });
});

describe("walletReportCards", () => {
  const NOW = Date.parse("2026-07-10T12:00:00Z");
  const buy = (wallet: string, mint: string, msAgo: number): WalletBuyEvent => ({
    wallet,
    mint,
    ui_amount: 100,
    quote_spent_usd: 500,
    ts: new Date(NOW - msAgo).toISOString(),
    signature: `sig-${wallet.slice(0, 4)}-${msAgo}`,
  });
  /** Minute-bar-ish series: price at the buy moment and at the 6h horizon. */
  const series = (mint: string, atBuy: number, atHorizon: number, buyMsAgo: number): [string, PriceObservation[]] => [
    mint,
    [
      { ts: NOW - buyMsAgo, price: atBuy },
      { ts: NOW - buyMsAgo + WALLET_GRADE_HORIZON_MS, price: atHorizon },
    ],
  ];

  test("GIVEN priced buys past the horizon THEN per-wallet averages and hit rates come out of OUR record", () => {
    const eightHours = 8 * 60 * 60_000;
    const cards = walletReportCards(
      [buy(WALLET, MEME, eightHours), buy(WALLET, "OtherMintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", eightHours)],
      new Map([
        series(MEME, 100, 105, eightHours), // +5%
        series("OtherMintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", 200, 194, eightHours), // -3%
      ]),
      NOW,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ wallet: WALLET, buys: 2, graded: 2, hit_rate: 0.5, avg_return_pct: 1 });
  });

  test("GIVEN young buys or unpriced mints THEN they stay ungraded rather than guessed", () => {
    const cards = walletReportCards(
      [
        buy(WALLET, MEME, 60_000), // 1 minute old — inside the horizon
        buy(WALLET, "NeverTrackedMintCCCCCCCCCCCCCCCCCCCCCCCCCCC", 8 * 60 * 60_000),
      ],
      new Map([series(MEME, 100, 120, 60_000)]),
      NOW,
    );
    expect(cards[0].buys).toBe(2);
    expect(cards[0].graded).toBe(0);
    expect(cards[0].hit_rate).toBeNull();
  });
});

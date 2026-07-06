/// <reference types="bun" />

/**
 * Helius Credit Firewall (docs/research/2026-07-04-helius-decision-memo.md §7.3):
 * fail-closed policy, classification, budgets, and the RPC fallback. Pure —
 * no network; the fetch choke point is tested only for its blocking behavior.
 */

import { describe, expect, test } from "bun:test";

import {
  classifyHeliusCall,
  evaluateHeliusCall,
  guardedHeliusFetch,
  HeliusBlockedError,
  isHeliusHost,
  PUBLIC_RPC_URL,
  resolveGuardedRpcUrl,
  type FirewallEnv,
} from "../src/helius/firewall";

const HELIUS_URL = "https://mainnet.helius-rpc.com/?api-key=test";
const ENABLED: FirewallEnv = { HELIUS_ENABLED: "true" };

function call(method: string | null, env: FirewallEnv, url = HELIUS_URL, spent = 0) {
  return evaluateHeliusCall({ url, method, spent_today: spent }, env);
}

describe("host + classification", () => {
  test("GIVEN Helius and non-Helius hosts THEN only Helius is firewalled", () => {
    expect(isHeliusHost(HELIUS_URL)).toBe(true);
    expect(isHeliusHost("https://api.helius.xyz/v0/addresses/x/transactions")).toBe(true);
    expect(isHeliusHost(PUBLIC_RPC_URL)).toBe(false);
    expect(isHeliusHost("https://lite-api.jup.ag/swap/v1/quote")).toBe(false);
    expect(isHeliusHost("not a url")).toBe(false);
  });

  test("GIVEN methods and paths THEN categories match the memo's cost table", () => {
    expect(classifyHeliusCall(HELIUS_URL, "getBalance")).toBe("rpc");
    expect(classifyHeliusCall(HELIUS_URL, "sendRawTransaction")).toBe("rpc");
    expect(classifyHeliusCall(HELIUS_URL, "getAssetsByOwner")).toBe("das");
    expect(classifyHeliusCall(HELIUS_URL, "searchAssets")).toBe("das");
    expect(classifyHeliusCall(HELIUS_URL, "getTransactionsForAddress")).toBe("enhanced");
    expect(classifyHeliusCall("https://mainnet.helius-rpc.com/v0/addresses/x/transactions", null)).toBe("enhanced");
    expect(classifyHeliusCall(HELIUS_URL, "someNewMethod")).toBe("unknown");
    expect(classifyHeliusCall(HELIUS_URL, null)).toBe("unknown");
  });
});

describe("fail-closed policy (memo §7.2)", () => {
  test("GIVEN HELIUS_ENABLED unset THEN everything is blocked — the master switch", () => {
    const verdict = call("getBalance", {});
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toContain("HELIUS_ENABLED");
  });

  test("GIVEN enabled THEN standard RPC passes but DAS/Enhanced/unknown stay blocked", () => {
    expect(call("getBalance", ENABLED).allowed).toBe(true);
    expect(call("getTokenAccountsByOwner", ENABLED).allowed).toBe(true);

    const das = call("getAssetsByOwner", ENABLED);
    expect(das.allowed).toBe(false);
    if (!das.allowed) expect(das.reason).toContain("HELIUS_ALLOW_DAS");

    const enhanced = call(null, ENABLED, "https://mainnet.helius-rpc.com/v0/addresses/x/transactions");
    expect(enhanced.allowed).toBe(false);
    if (!enhanced.allowed) expect(enhanced.reason).toContain("HELIUS_ALLOW_ENHANCED");

    const unknown = call("brandNewExpensiveThing", ENABLED);
    expect(unknown.allowed).toBe(false);
    if (!unknown.allowed) expect(unknown.reason).toContain("fail closed");
  });

  test("GIVEN explicit opt-in flags THEN DAS/Enhanced open individually", () => {
    expect(call("getAssetsByOwner", { ...ENABLED, HELIUS_ALLOW_DAS: "true" }).allowed).toBe(true);
    expect(call("getAssetsByOwner", { ...ENABLED, HELIUS_ALLOW_ENHANCED: "true" }).allowed).toBe(false); // wrong flag
    expect(
      call(null, { ...ENABLED, HELIUS_ALLOW_ENHANCED: "true" }, "https://mainnet.helius-rpc.com/v0/addresses/x/transactions")
        .allowed,
    ).toBe(true);
  });

  test("GIVEN the daily budget is spent THEN even allowed categories block", () => {
    const env = { ...ENABLED, HELIUS_MAX_CREDITS_PER_DAY: "100" };
    expect(call("getBalance", env, HELIUS_URL, 99).allowed).toBe(true);
    const over = call("getBalance", env, HELIUS_URL, 100);
    expect(over.allowed).toBe(false);
    if (!over.allowed) expect(over.reason).toContain("budget");
    // Costs are category-scaled: one enhanced call = 100 credits.
    expect(call(null, { ...ENABLED, HELIUS_ALLOW_ENHANCED: "true", HELIUS_MAX_CREDITS_PER_DAY: "100" },
      "https://mainnet.helius-rpc.com/v0/addresses/x/transactions", 1).allowed).toBe(false);
  });
});

describe("choke point + RPC fallback", () => {
  test("GIVEN Helius disabled WHEN the guarded fetch sees a Helius URL THEN it throws HeliusBlockedError without any network call", async () => {
    const prev = process.env.HELIUS_ENABLED;
    delete process.env.HELIUS_ENABLED;
    try {
      await expect(
        guardedHeliusFetch(HELIUS_URL, { method: "POST", body: JSON.stringify({ method: "getBalance" }) }, { feature: "test" }),
      ).rejects.toThrow(HeliusBlockedError);
    } finally {
      if (prev !== undefined) process.env.HELIUS_ENABLED = prev;
    }
  });

  test("GIVEN a Helius SOLANA_RPC_URL while disabled THEN execution falls back to the public RPC (zero credits)", () => {
    expect(resolveGuardedRpcUrl({ SOLANA_RPC_URL: HELIUS_URL })).toBe(PUBLIC_RPC_URL);
    expect(resolveGuardedRpcUrl({ SOLANA_RPC_URL: HELIUS_URL, HELIUS_ENABLED: "true" })).toBe(HELIUS_URL);
    // A non-Helius custom RPC is untouched either way.
    expect(resolveGuardedRpcUrl({ SOLANA_RPC_URL: "https://my-node.example" })).toBe("https://my-node.example");
    expect(resolveGuardedRpcUrl({})).toBe(PUBLIC_RPC_URL);
  });
});

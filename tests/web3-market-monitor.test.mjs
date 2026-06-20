import { afterEach, describe, expect, test } from "bun:test";
import { runWeb3MarketMonitor } from "../scripts/web3-market-monitor.mjs";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Web3 market monitor CLI", () => {
  test("GIVEN stale live DEX candle resolution WHEN monitor runs THEN it retries one read-only discovery refresh", async () => {
    const calls = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });

      if (url.includes("/api/web3-dex-discovery")) {
        return jsonResponse({
          mode: "web3-dex-discovery-receipt",
          status: calls.filter((call) => call.url.includes("/api/web3-dex-discovery")).length === 1 ? "fallback" : "live-watch",
          source_summary: {
            scanner_status: "refresh-first",
            top_symbols: ["POPCAT"],
          },
          live_execution_permission: "blocked",
          wallet_mutation_permission: "blocked",
          transaction_submission_permission: "blocked",
          secret_echo_permission: "blocked",
        });
      }

      if (url.includes("/api/web3-ohlcv")) {
        const ohlcvCallCount = calls.filter((call) => call.url.includes("/api/web3-ohlcv")).length;
        if (ohlcvCallCount === 1) {
          return jsonResponse({
            error: "No current live DEX candidate pool is available for auto OHLCV resolution; market source is fallback.",
          }, 422);
        }
        return jsonResponse({
          provider: "geckoterminal",
          status: "ok",
          source: "geckoterminal-public",
          resolution: {
            mode: "auto-dex-candidate",
            source: "live-dex",
            source_status: "live",
            scenario: "breakout",
            account: "persistent",
            cycles: 0,
            symbol: "POPCAT",
            token_id: "solana-popcat",
            token_address: "popcatMint",
            pair_address: "popcatPool",
            attempt_count: 1,
            scanner_status: "refresh-first",
            summary: "Auto-selected POPCAT from live DEX scanner evidence.",
          },
          network: "solana",
          pool: "popcatPool",
          timeframe: "minute",
          aggregate: 1,
          limit: 6,
          token: "base",
          fetched_at: "2026-06-20T20:20:00.000Z",
          candles: [{ close: 0.12 }],
          signal: {
            action: "hold",
            confidence: 61,
            momentum_score: 50,
            volume_score: 45,
            risk_score: 20,
            review_after_seconds: 30,
            summary: "Hold/watch.",
            blockers: [],
          },
          paper_decision: {
            action: "paper-hold",
            side: "hold",
            notional_usd: 0,
            reason: "Hold in paper.",
            blockers: [],
          },
          live_execution_permission: "blocked",
          wallet_mutation_permission: "blocked",
          transaction_submission_permission: "blocked",
          secret_echo_permission: "blocked",
        });
      }

      throw new Error(`Unexpected request ${url}`);
    };

    const receipt = await runWeb3MarketMonitor({
      baseUrl: "http://localhost:4010",
      scenario: "breakout",
      source: "live-dex",
      account: "persistent",
      cycles: 0,
      timeframe: "minute",
      aggregate: 1,
      limit: 6,
      cashUsd: 2500,
      positionUsd: 0,
      equityUsd: 10_000,
      maxTradeUsd: 500,
      record: false,
    });

    expect(calls.filter((call) => call.url.includes("/api/web3-dex-discovery")).length).toBe(2);
    expect(calls.filter((call) => call.url.includes("/api/web3-ohlcv")).length).toBe(2);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(receipt).toMatchObject({
      mode: "web3-market-monitor",
      status: "observed",
      source: "live-dex",
      selected_symbol: "POPCAT",
      selected_pair: "popcatPool",
      discovery_refresh_attempted: true,
      candle_count: 1,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      secret_echo_permission: "blocked",
    });
  });
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

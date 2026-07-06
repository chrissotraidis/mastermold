/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { POST as chatPost } from "@/app/api/chat/route";
import { getBrainState, initializeMarketBrain } from "@/src/db/brain";
import { syncMonarchMcpPortfolio, testMonarchMcpConnection } from "@/src/db/monarch-mcp";
import { getChatContext } from "@/src/db/chat";
import { getPortfolioBrainChangeSummary, getPortfolioBrainScanContext, getPortfolioBrainState, getPortfolioBrainSnapshotHistory } from "@/src/db/portfolio-brain";
import { addManualHolding, getPortfolio } from "@/src/db/portfolio";
import { getPortfolioRecommendations } from "@/src/db/portfolio-recommendations";
import { __resetStoreForTests } from "@/src/db/store";

let previousDb: string | undefined;
let previousFixture: string | undefined;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "mm-monarch-brain-"));
  previousDb = process.env.MASTERMOLD_DB;
  previousFixture = process.env.MONARCH_MCP_FIXTURE_PATH;
  process.env.MASTERMOLD_DB = join(dir, "mastermold.db");
  process.env.MONARCH_MCP_FIXTURE_PATH = join(dir, "monarch.json");
  writeFileSync(process.env.MONARCH_MCP_FIXTURE_PATH, JSON.stringify(monarchFixture(), null, 2));
  __resetStoreForTests();
});

afterEach(() => {
  if (previousDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = previousDb;
  if (previousFixture === undefined) delete process.env.MONARCH_MCP_FIXTURE_PATH;
  else process.env.MONARCH_MCP_FIXTURE_PATH = previousFixture;
  __resetStoreForTests();
});

describe("Monarch MCP portfolio brain", () => {
  test("GIVEN a Monarch MCP fixture WHEN connection is tested THEN the connector reports sync readiness", async () => {
    const result = await testMonarchMcpConnection();

    expect(result.ok).toBe(true);
    expect(result.status).toBe("connected");
    expect(result.config.transport).toBe("fixture");
    expect(result.config.requested_scope).toBe("read");
    expect(result.config.permission_scope).toBe("read_only_snapshot");
    expect(result.required_tools).toEqual(["get_accounts", "get_holdings"]);
    expect(result.required_tools_ready).toBe(true);
    expect(result.message).toContain("holding rows");
  });

  test("GIVEN a Monarch MCP payload WHEN sync runs THEN Master Mold persists a portfolio brain snapshot with facts", async () => {
    const result = await syncMonarchMcpPortfolio();
    const state = getPortfolioBrainState(new Date("2026-06-25T17:00:00.000Z"));

    expect(result.ok).toBe(true);
    expect(result.snapshot?.accounts.length).toBe(2);
    expect(result.snapshot?.holdings.length).toBe(4);
    expect(result.snapshot?.skipped_rows.length).toBe(1);
    expect(result.error_code).toBe("partial_snapshot");
    expect(state.latest_snapshot?.facts.map((fact) => fact.id)).toContain("largest-holding");
    expect(state.latest_snapshot?.facts.map((fact) => fact.id)).toContain("crypto-exposure");
    expect(getPortfolioBrainSnapshotHistory(5)).toHaveLength(1);
  });

  test("GIVEN a saved Monarch brain snapshot WHEN Portfolio loads THEN sample holdings are replaced by Monarch holdings", async () => {
    await syncMonarchMcpPortfolio();

    const portfolio = getPortfolio();

    expect(portfolio.provenance.label).toBe("Imported portfolio");
    expect(portfolio.provenance.source).toContain("Monarch MCP");
    expect(portfolio.holdings.map((holding) => holding.symbol)).toEqual(["NVDA", "BTC", "COIN", "USD"]);
    expect(portfolio.holdings.every((holding) => holding.source === "connected")).toBe(true);
    expect(portfolio.import_snapshot.note).toContain("Monarch MCP holdings");
  });

  test("GIVEN a saved Monarch brain snapshot WHEN market brain saves context THEN the run scope is portfolio snapshot", async () => {
    await syncMonarchMcpPortfolio();
    await initializeMarketBrain();

    const state = getBrainState();
    const portfolioSource = state.source_ledger.find((item) => item.id === "visible-portfolio");

    expect(state.latest_run?.scope).toBe("portfolio_snapshot");
    expect(state.latest_run?.symbols).toContain("NVDA");
    expect(state.latest_run?.symbols).toContain("BTC");
    expect(portfolioSource?.detail).toContain("Monarch MCP snapshot");
    expect(state.facts.find((fact) => fact.id === "brain_fact_top_holding")?.source_count).toBe(4);
  });

  test("GIVEN a saved Monarch brain snapshot WHEN scan context is built THEN daily scan classes stay advisory-only", async () => {
    await syncMonarchMcpPortfolio();

    const context = getPortfolioBrainScanContext(new Date("2026-06-25T17:00:00.000Z"));

    expect(context.status).toBe("partial");
    expect(context.holdings_count).toBe(4);
    expect(context.top_symbols).toEqual(["NVDA", "BTC", "COIN", "USD"]);
    expect(context.suggestion_classes).toEqual(["Review", "Watch", "Trim candidate", "Add candidate", "Paper test first"]);
    expect(context.data_boundary).toContain("read-only portfolio context");
    expect(context.data_boundary).toContain("cannot place brokerage trades");
    expect(context.change_summary.status).toBe("no_previous");
  });

  test("GIVEN manual holdings but no Monarch snapshot WHEN scan context is built THEN manual entries are the active source", () => {
    addManualHolding({
      symbol: "AAPL",
      asset_name: "Apple",
      asset_class: "equity",
      venue: "NASDAQ",
      quantity: 3,
      price: 200,
      daily_change_pct: 1.5,
    });

    const context = getPortfolioBrainScanContext(new Date("2026-06-25T17:00:00.000Z"));

    expect(context.source_label).toBe("Manual holdings");
    expect(context.status).toBe("manual");
    expect(context.holdings_count).toBe(1);
    expect(context.total_value).toBe(600);
    expect(context.top_symbols).toEqual(["AAPL"]);
    expect(context.data_boundary).toContain("Manual rows are not broker-connected");
    expect(context.data_boundary).toContain("cannot place brokerage trades");
    expect(context.change_summary.status).toBe("no_snapshot");
  });

  test("GIVEN a saved Monarch brain snapshot WHEN portfolio recommendations are built THEN Today prompts match imported holdings", async () => {
    await syncMonarchMcpPortfolio();

    const recommendations = getPortfolioRecommendations(null, 6);

    expect(recommendations.map((recommendation) => recommendation.symbol)).toContain("NVDA");
    expect(recommendations.map((recommendation) => recommendation.symbol)).toContain("BTC");
    expect(recommendations.map((recommendation) => recommendation.classification)).toContain("Trim candidate");
    expect(recommendations.every((recommendation) => recommendation.data_boundary.includes("cannot place brokerage trades"))).toBe(true);
    expect(recommendations.every((recommendation) => recommendation.href.startsWith("/briefing/") || recommendation.href.startsWith("/paper?") || recommendation.href === "/portfolio")).toBe(true);
  });

  test("GIVEN two Monarch snapshots WHEN history is compared THEN Portfolio Brain reports what changed since last sync", async () => {
    await syncMonarchMcpPortfolio();
    writeFileSync(process.env.MONARCH_MCP_FIXTURE_PATH!, JSON.stringify(changedMonarchFixture(), null, 2));
    await syncMonarchMcpPortfolio();

    const history = getPortfolioBrainSnapshotHistory(5);
    const summary = getPortfolioBrainChangeSummary();
    const scanContext = getPortfolioBrainScanContext(new Date("2026-06-25T18:00:00.000Z"));

    expect(history).toHaveLength(2);
    expect(summary.status).toBe("changed");
    expect(summary.latest_synced_at).toBe("2026-06-25T17:05:00.000Z");
    expect(summary.previous_synced_at).toBe("2026-06-25T16:35:00.000Z");
    expect(summary.total_value_delta).toBe(2000);
    expect(summary.added_symbols).toEqual(["TSLA"]);
    expect(summary.removed_symbols).toEqual(["COIN"]);
    expect(summary.increased_symbols).toEqual(["NVDA", "USD"]);
    expect(summary.decreased_symbols).toEqual(["BTC"]);
    expect(summary.top_changes.map((change) => change.symbol)).toEqual(["NVDA", "TSLA", "BTC", "COIN", "USD"]);
    expect(summary.detail).toContain("Since last Monarch sync");
    expect(scanContext.change_summary.detail).toBe(summary.detail);
  });

  test("GIVEN a saved Monarch brain snapshot WHEN it gets stale THEN the state tells the user to sync again", async () => {
    const result = await syncMonarchMcpPortfolio();
    const staleNow = new Date(Date.parse(result.snapshot!.synced_at) + 49 * 3_600_000);

    const state = getPortfolioBrainState(staleNow);
    const scanContext = getPortfolioBrainScanContext(staleNow);

    expect(state.freshness.is_stale).toBe(true);
    expect(state.freshness.label).toContain("Older than");
    expect(scanContext.status).toBe("stale");
    expect(scanContext.data_boundary).toContain("sync again");
  });

  test("GIVEN a saved Monarch brain snapshot WHEN chat asks what I own THEN the local answer cites the Monarch snapshot", async () => {
    await syncMonarchMcpPortfolio();

    const response = await chatPost(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "what do I own?" }),
    }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("Monarch MCP snapshot");
    expect(text).toContain("NVDA");
    expect(text).toContain("BTC");
    expect(text).toContain("Risk:");
    expect(text).toContain("NVDA concentration");
    expect(text).toContain("Chat cannot trade");
    expect(text).not.toMatch(/\b(can|could|will)\s+place (a )?(Robinhood|Monarch|brokerage) trade/i);
  });

  test("GIVEN manual holdings and no Monarch snapshot WHEN chat asks what changed since sync THEN the answer names local manual data", async () => {
    addManualHolding({
      symbol: "AAPL",
      asset_name: "Apple",
      asset_class: "equity",
      venue: "NASDAQ",
      quantity: 3,
      price: 200,
      daily_change_pct: 1.5,
    });

    const response = await chatPost(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "what changed since the last portfolio sync?" }),
    }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("Portfolio check:");
    expect(text).toContain("Source: Manual entries; not account-synced.");
    expect(text).toContain("Risk:");
    expect(text).toContain("Chat cannot trade");
    expect(text).not.toMatch(/\b(can|could|will)\s+place (a )?(Robinhood|Monarch|brokerage) trade/i);
  });

  test("GIVEN a saved Monarch brain snapshot WHEN chat asks which holding drives risk THEN the local answer names the risk driver", async () => {
    await syncMonarchMcpPortfolio();

    const response = await chatPost(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "which holding is driving risk?" }),
    }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("Risk:");
    expect(text).toContain("NVDA concentration");
    expect(text).toContain("Review concentration");
    expect(text).toContain("Chat cannot trade");
    expect(text).not.toMatch(/\b(can|could|will)\s+place (a )?(Robinhood|Monarch|brokerage) trade/i);
  });

  test("GIVEN two Monarch snapshots WHEN chat asks what changed THEN the local answer cites snapshot changes without trade authority", async () => {
    await syncMonarchMcpPortfolio();
    writeFileSync(process.env.MONARCH_MCP_FIXTURE_PATH!, JSON.stringify(changedMonarchFixture(), null, 2));
    await syncMonarchMcpPortfolio();

    const response = await chatPost(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "what changed since the last portfolio sync?" }),
    }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("Since last Monarch sync");
    expect(text).toContain("NVDA");
    expect(text).toContain("TSLA");
    expect(text).toContain("Chat cannot trade");
    expect(text).not.toMatch(/\b(can|could|will)\s+place (a )?(Robinhood|Monarch|brokerage) trade/i);
  });

  test("GIVEN Monarch context enters live chat context WHEN prompt rules are built THEN brokerage execution stays unavailable", async () => {
    await syncMonarchMcpPortfolio();

    const context = getChatContext();

    expect(context.llm_context).toContain("Monarch MCP snapshots are read-only portfolio context");
    expect(context.llm_context).toContain("brokerage order placement");
    expect(context.llm_context).toContain("no automatic refresh, brokerage trading, or money movement");
  });
});

function monarchFixture() {
  return {
    synced_at: "2026-06-25T16:35:00.000Z",
    as_of: "2026-06-25T16:30:00.000Z",
    accounts: [
      {
        id: "rh-1",
        name: "Individual",
        institution: "Robinhood",
        type: "brokerage",
        balance: 22000,
        updated_at: "2026-06-25T16:30:00.000Z",
      },
      {
        id: "cb-1",
        name: "Main",
        institution: "Coinbase",
        type: "crypto",
        balance: 12500,
        updated_at: "2026-06-25T16:29:00.000Z",
      },
    ],
    holdings: [
      {
        id: "nvda",
        account_id: "rh-1",
        symbol: "NVDA",
        name: "NVIDIA",
        asset_class: "equity",
        quantity: 20,
        price: 900,
        market_value: 18000,
      },
      {
        id: "coin",
        account_id: "rh-1",
        symbol: "COIN",
        name: "Coinbase Global",
        asset_class: "equity",
        quantity: 8,
        price: 250,
        market_value: 2000,
      },
      {
        id: "usd",
        account_id: "rh-1",
        symbol: "USD",
        name: "Cash",
        asset_class: "cash",
        quantity: 2000,
        price: 1,
        market_value: 2000,
      },
      {
        id: "btc",
        account_id: "cb-1",
        symbol: "BTC",
        name: "Bitcoin",
        asset_class: "crypto",
        quantity: 0.1,
        price: 125000,
        market_value: 12500,
      },
      {
        id: "bad",
        account_id: "cb-1",
        name: "Missing symbol",
        quantity: 1,
        market_value: 42,
      },
    ],
  };
}

function changedMonarchFixture() {
  return {
    synced_at: "2026-06-25T17:05:00.000Z",
    as_of: "2026-06-25T17:00:00.000Z",
    accounts: [
      {
        id: "rh-1",
        name: "Individual",
        institution: "Robinhood",
        type: "brokerage",
        balance: 26500,
        updated_at: "2026-06-25T17:00:00.000Z",
      },
      {
        id: "cb-1",
        name: "Main",
        institution: "Coinbase",
        type: "crypto",
        balance: 10000,
        updated_at: "2026-06-25T16:59:00.000Z",
      },
    ],
    holdings: [
      {
        id: "nvda",
        account_id: "rh-1",
        symbol: "NVDA",
        name: "NVIDIA",
        asset_class: "equity",
        quantity: 20,
        price: 1050,
        market_value: 21000,
      },
      {
        id: "tsla",
        account_id: "rh-1",
        symbol: "TSLA",
        name: "Tesla",
        asset_class: "equity",
        quantity: 10,
        price: 300,
        market_value: 3000,
      },
      {
        id: "usd",
        account_id: "rh-1",
        symbol: "USD",
        name: "Cash",
        asset_class: "cash",
        quantity: 2500,
        price: 1,
        market_value: 2500,
      },
      {
        id: "btc",
        account_id: "cb-1",
        symbol: "BTC",
        name: "Bitcoin",
        asset_class: "crypto",
        quantity: 0.08,
        price: 125000,
        market_value: 10000,
      },
    ],
  };
}

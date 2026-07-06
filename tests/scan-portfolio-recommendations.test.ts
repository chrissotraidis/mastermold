/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recordProductMetric } from "@/src/db/metrics";
import { addManualHolding, replaceImportedHoldings } from "@/src/db/portfolio";
import { getScanAttempts, runMarketScan } from "@/src/db/scan";
import { __resetStoreForTests } from "@/src/db/store";

let previousDb: string | undefined;
let previousPython: string | undefined;
let previousWrapper: string | undefined;
let previousFixture: string | undefined;
let previousMonarchCommand: string | undefined;
let previousMonarchUrl: string | undefined;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "mm-scan-recs-"));
  previousDb = process.env.MASTERMOLD_DB;
  previousPython = process.env.MASTERMOLD_ENGINE_PYTHON;
  previousWrapper = process.env.MASTERMOLD_ENGINE_WRAPPER;
  previousFixture = process.env.MONARCH_MCP_FIXTURE_PATH;
  previousMonarchCommand = process.env.MONARCH_MCP_COMMAND;
  previousMonarchUrl = process.env.MONARCH_MCP_URL;
  process.env.MASTERMOLD_DB = join(dir, "mastermold.db");
  delete process.env.MONARCH_MCP_FIXTURE_PATH;
  delete process.env.MONARCH_MCP_COMMAND;
  delete process.env.MONARCH_MCP_URL;
  __resetStoreForTests();
});

afterEach(() => {
  if (previousDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = previousDb;
  if (previousPython === undefined) delete process.env.MASTERMOLD_ENGINE_PYTHON;
  else process.env.MASTERMOLD_ENGINE_PYTHON = previousPython;
  if (previousWrapper === undefined) delete process.env.MASTERMOLD_ENGINE_WRAPPER;
  else process.env.MASTERMOLD_ENGINE_WRAPPER = previousWrapper;
  if (previousFixture === undefined) delete process.env.MONARCH_MCP_FIXTURE_PATH;
  else process.env.MONARCH_MCP_FIXTURE_PATH = previousFixture;
  if (previousMonarchCommand === undefined) delete process.env.MONARCH_MCP_COMMAND;
  else process.env.MONARCH_MCP_COMMAND = previousMonarchCommand;
  if (previousMonarchUrl === undefined) delete process.env.MONARCH_MCP_URL;
  else process.env.MONARCH_MCP_URL = previousMonarchUrl;
  __resetStoreForTests();
});

describe("scan portfolio recommendation payloads", () => {
  test("GIVEN a recorded scan attempt WHEN attempts are read THEN portfolio review prompts round-trip", () => {
    recordProductMetric({
      event: "scan_attempt",
      surface: "today",
      entity_id: "scan_test",
      value: 1,
      metadata: {
        id: "scan_test",
        trigger: "test",
        started_at: "2026-06-30T10:00:00.000Z",
        finished_at: "2026-06-30T10:01:00.000Z",
        status: "ok",
        detail: "Scan finished.",
        run_date: "2026-06-30",
        usd: 0,
        portfolio_context: {
          source_label: "Monarch MCP",
          status: "fresh",
          data_boundary: "Read-only portfolio context.",
          synced_at: "2026-06-30T09:00:00.000Z",
          as_of: "2026-06-30T09:00:00.000Z",
          accounts_count: 1,
          holdings_count: 1,
          total_value: 1000,
          top_symbols: ["NVDA"],
          change_summary: {
            status: "no_previous",
            detail: "No previous Monarch snapshot is saved yet.",
            top_changes: [],
          },
          suggestion_classes: ["Review", "Watch", "Trim candidate", "Add candidate", "Paper test first"],
        },
        portfolio_recommendations: [
          {
            symbol: "NVDA",
            classification: "Review",
            title: "Review NVDA",
            detail: "NVDA is visible in the portfolio.",
            href: "/briefing/brief_ai_supply",
            source_label: "Saved read",
            data_boundary: "Review prompt only. This cannot place brokerage trades, sign transactions, or move funds.",
          },
        ],
      },
    });

    const attempt = getScanAttempts(1)[0];

    expect(attempt.portfolio_recommendations).toHaveLength(1);
    expect(attempt.portfolio_recommendations[0]).toMatchObject({
      symbol: "NVDA",
      classification: "Review",
      source_label: "Saved read",
    });
    expect(attempt.portfolio_sync.status).toBe("not_configured");
    expect(attempt.portfolio_sync.message).toContain("No portfolio sync preflight was recorded");
    expect(attempt.portfolio_recommendations[0].data_boundary).toContain("cannot place brokerage trades");
  });

  test("GIVEN the engine cannot run WHEN scan fails THEN no fresh portfolio recommendation is invented", async () => {
    process.env.MASTERMOLD_ENGINE_PYTHON = "missing/python";
    process.env.MASTERMOLD_ENGINE_WRAPPER = "missing/engine-wrapper";

    const result = await runMarketScan({ trigger: "test" });
    const attempt = getScanAttempts(1)[0];

    expect(result.ok).toBe(false);
    expect(result.portfolio_sync.status).toBe("not_configured");
    expect(result.portfolio_sync.data_boundary).toContain("cannot place brokerage trades");
    expect(result.portfolio_recommendations).toEqual([]);
    expect(attempt.status).toBe("failed");
    expect(attempt.detail).toContain("Engine is not set up");
    expect(attempt.portfolio_sync.status).toBe("not_configured");
    expect(attempt.portfolio_recommendations).toEqual([]);
    expect(attempt.portfolio_context.suggestion_classes).toEqual(["Review", "Watch", "Paper test first"]);
  });

  test("GIVEN manual holdings and no Monarch MCP WHEN a scan starts THEN the receipt names manual holdings as context", async () => {
    process.env.MASTERMOLD_ENGINE_PYTHON = "missing/python";
    process.env.MASTERMOLD_ENGINE_WRAPPER = "missing/engine-wrapper";
    addManualHolding({
      symbol: "AAPL",
      asset_name: "Apple",
      asset_class: "equity",
      venue: "NASDAQ",
      quantity: 5,
      price: 210,
    });

    const result = await runMarketScan({ trigger: "test" });
    const attempt = getScanAttempts(1)[0];

    expect(result.ok).toBe(false);
    expect(result.portfolio_sync.status).toBe("not_configured");
    expect(result.portfolio_context.source_label).toBe("Manual holdings");
    expect(result.portfolio_context.status).toBe("manual");
    expect(result.portfolio_context.top_symbols).toEqual(["AAPL"]);
    expect(result.portfolio_context.data_boundary).toContain("Manual rows are not broker-connected");
    expect(result.portfolio_context.data_boundary).toContain("cannot place brokerage trades");
    expect(attempt.detail).toContain("manual holdings");
    expect(attempt.portfolio_context.source_label).toBe("Manual holdings");
  });

  test("GIVEN imported holdings and no Monarch MCP WHEN a scan starts THEN the receipt names imported snapshots as context", async () => {
    process.env.MASTERMOLD_ENGINE_PYTHON = "missing/python";
    process.env.MASTERMOLD_ENGINE_WRAPPER = "missing/engine-wrapper";
    const now = new Date().toISOString();
    replaceImportedHoldings("coinbase", [
      {
        id: "imported_btc",
        service: "coinbase",
        account_id: "coinbase-main",
        account_label: "Coinbase Main",
        symbol: "BTC",
        asset_name: "Bitcoin",
        asset_class: "crypto",
        venue: "Coinbase",
        quantity: 0.5,
        price: 100000,
        cost_basis: 45000,
        daily_change_pct: 2,
        imported_at: now,
        as_of: now,
      },
    ]);

    const result = await runMarketScan({ trigger: "test" });
    const attempt = getScanAttempts(1)[0];

    expect(result.ok).toBe(false);
    expect(result.portfolio_sync.status).toBe("not_configured");
    expect(result.portfolio_context.source_label).toBe("Imported holdings");
    expect(result.portfolio_context.status).toBe("imported");
    expect(result.portfolio_context.holdings_count).toBe(1);
    expect(result.portfolio_context.total_value).toBe(50000);
    expect(result.portfolio_context.top_symbols).toEqual(["BTC"]);
    expect(result.portfolio_context.data_boundary).toContain("read-only portfolio context");
    expect(result.portfolio_context.data_boundary).toContain("cannot place brokerage trades");
    expect(attempt.detail).toContain("imported holdings snapshot");
    expect(attempt.portfolio_context.source_label).toBe("Imported holdings");
  });

  test("GIVEN Monarch MCP is configured WHEN a scan starts THEN it saves a read-only portfolio snapshot before the engine runs", async () => {
    const fixturePath = join(process.env.MASTERMOLD_DB!.replace(/mastermold\.db$/, ""), "monarch.json");
    const syncedAt = new Date().toISOString();
    process.env.MONARCH_MCP_FIXTURE_PATH = fixturePath;
    process.env.MASTERMOLD_ENGINE_PYTHON = "missing/python";
    process.env.MASTERMOLD_ENGINE_WRAPPER = "missing/engine-wrapper";
    writeFileSync(fixturePath, JSON.stringify(scanMonarchFixture(syncedAt), null, 2));

    const result = await runMarketScan({ trigger: "test" });
    const attempt = getScanAttempts(1)[0];

    expect(result.ok).toBe(false);
    expect(result.portfolio_sync.status).toBe("synced");
    expect(result.portfolio_sync.synced_at).toBe(syncedAt);
    expect(result.portfolio_sync.data_boundary).toContain("Read-only portfolio preflight");
    expect(result.portfolio_context.status).toBe("fresh");
    expect(result.portfolio_context.top_symbols).toContain("NVDA");
    expect(attempt.portfolio_sync.status).toBe("synced");
    expect(attempt.portfolio_sync.message).toContain("Saved 2 Monarch holdings");
    expect(attempt.portfolio_context.holdings_count).toBe(2);
  });
});

function scanMonarchFixture(syncedAt: string) {
  return {
    synced_at: syncedAt,
    as_of: syncedAt,
    accounts: [
      {
        id: "rh-1",
        name: "Individual",
        institution: "Robinhood",
        type: "brokerage",
        balance: 15000,
        updated_at: "2026-06-30T08:59:00.000Z",
      },
    ],
    holdings: [
      {
        id: "nvda",
        account_id: "rh-1",
        symbol: "NVDA",
        name: "NVIDIA",
        asset_class: "equity",
        quantity: 10,
        price: 900,
        market_value: 9000,
      },
      {
        id: "usd",
        account_id: "rh-1",
        symbol: "USD",
        name: "Cash",
        asset_class: "cash",
        quantity: 6000,
        price: 1,
        market_value: 6000,
      },
    ],
  };
}

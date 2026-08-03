/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getForwardProofStatus } from "@/src/db/forward-proof";
import type { DecisionJournalEntry } from "@/src/db/schema";
import { __resetStoreForTests, store, type DailyReportRow } from "@/src/db/store";

let previousDb: string | undefined;
let previousEngine: string | undefined;

beforeEach(() => {
  previousDb = process.env.MASTERMOLD_DB;
  previousEngine = process.env.ENGINE_OUT_DIR;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-proof-")), "db.sqlite");
  process.env.ENGINE_OUT_DIR = join(tmpdir(), "mm-no-engine-output");
  __resetStoreForTests();
});

afterEach(() => {
  if (previousDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = previousDb;
  if (previousEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = previousEngine;
  __resetStoreForTests();
});

describe("forward-proof automatic outcomes", () => {
  test("counts a directional Today call once a later saved report reaches its horizon", () => {
    store().addJournalEntry(decision());
    store().upsertDailyReport(report("report-entry", "2026-08-01T12:00:00.000Z", 100, 100));
    store().upsertDailyReport(report("report-grade", "2026-08-04T12:00:00.000Z", 110, 102));

    const proof = getForwardProofStatus();

    expect(proof.counts).toMatchObject({
      logged_calls: 1,
      resolved_calls: 1,
      manual_outcomes: 0,
      automatic_price_outcomes: 1,
      saved_scans: 2,
    });
    expect(proof.gates.find((gate) => gate.id === "resolve_results")?.status).toBe("Working locally");
  });
});

function decision(): DecisionJournalEntry {
  return {
    id: "decision-add-aapl",
    briefing_card_id: null,
    thesis: "Add AAPL",
    signals: [],
    conviction: 6,
    horizon: "3-5 days",
    falsification_condition: "The relative move fails.",
    logged_at: "2026-08-01T12:00:00.000Z",
    event_time: "2026-08-01T12:00:00.000Z",
    knowledge_time: "2026-08-01T12:00:00.000Z",
    decision_source: {
      kind: "today",
      report_id: "report-entry",
      play_id: "play-aapl",
      symbol: "AAPL",
      action: "add",
      market_as_of: "2026-08-01T12:00:00.000Z",
      entry_close: 100,
    },
  };
}

function report(id: string, createdAt: string, aapl: number, msft: number): DailyReportRow {
  const marketRows = [
    { symbol: "AAPL", latest_close: aapl },
    { symbol: "MSFT", latest_close: msft },
  ].map(({ symbol, latest_close }) => ({
    symbol,
    yf_symbol: symbol,
    asset_class: "equity",
    status: "refreshed",
    source: "fixture",
    latest_close,
    previous_close: latest_close,
    daily_move_pct: 0,
    volume: 1,
    average_volume: 1,
    volume_ratio: 1,
    fetched_at: createdAt,
    detail: "fixture",
  }));
  return {
    id,
    run_date: createdAt.slice(0, 10),
    created_at: createdAt,
    data: {
      id,
      run_date: createdAt.slice(0, 10),
      created_at: createdAt,
      portfolio_source: "Manual holdings",
      market_source: "fixture",
      holdings_scanned: ["AAPL", "MSFT"],
      watchlist_scanned: [],
      focus: { symbol: "AAPL", summary: "fixture", why: [] },
      risk: "fixture",
      plays: [],
      ideas: [],
      ignored_symbols: [],
      source_notes: [],
      freshness: {
        portfolio_as_of: createdAt,
        market_as_of: createdAt,
        portfolio_stale: false,
        market_partial: false,
        stale: false,
        skipped_symbols: [],
      },
      market_rows: marketRows,
    },
  };
}

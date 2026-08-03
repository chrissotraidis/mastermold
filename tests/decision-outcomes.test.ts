/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { deriveAutomaticDecisionOutcomes } from "@/src/db/decision-outcomes";
import type { DecisionJournalEntry } from "@/src/db/schema";
import type { DailyReportRow } from "@/src/db/store";

describe("automatic Today outcome derivation", () => {
  test("grades a directional call once against the first eligible equal-weight hold baseline", () => {
    const entry = decision("add");
    const outcomes = deriveAutomaticDecisionOutcomes([entry], [
      report("report-entry", "2026-08-01T12:00:00.000Z", { AAPL: 100, MSFT: 100 }),
      report("report-too-soon", "2026-08-02T12:00:00.000Z", { AAPL: 130, MSFT: 100 }),
      report("report-grade", "2026-08-04T12:00:00.000Z", { AAPL: 110, MSFT: 102 }),
      report("report-later", "2026-08-05T12:00:00.000Z", { AAPL: 80, MSFT: 105 }),
    ]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      journal_entry_id: entry.id,
      evaluation_close: 110,
      asset_return_pct: 10,
      equal_weight_hold_return_pct: 6,
      edge_vs_hold_pct: 4,
      verdict: "right",
    });
  });

  test("does not auto-grade non-directional calls or calls without a comparable baseline", () => {
    const hold = decision("hold");
    const add = decision("add");
    expect(deriveAutomaticDecisionOutcomes([hold], [
      report("report-entry", "2026-08-01T12:00:00.000Z", { AAPL: 100 }),
      report("report-grade", "2026-08-04T12:00:00.000Z", { AAPL: 110 }),
    ])).toEqual([]);
    expect(deriveAutomaticDecisionOutcomes([add], [
      report("report-grade", "2026-08-04T12:00:00.000Z", { AAPL: 110 }),
    ])).toEqual([]);
  });
});

function decision(action: "add" | "trim" | "hold"): DecisionJournalEntry {
  return {
    id: `decision-${action}`,
    briefing_card_id: null,
    thesis: `${action} AAPL`,
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
      action,
      market_as_of: "2026-08-01T12:00:00.000Z",
      entry_close: 100,
    },
  };
}

function report(id: string, createdAt: string, closes: Record<string, number>): DailyReportRow {
  const rows = Object.entries(closes).map(([symbol, latest_close]) => ({
    symbol,
    yf_symbol: symbol,
    asset_class: "equity",
    status: "refreshed",
    source: "yahoo-chart",
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
      market_rows: rows,
    },
  };
}

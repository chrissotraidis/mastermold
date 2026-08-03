/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DailyReport } from "../src/db/daily-report";
import { getJournal } from "../src/db/journal";
import { __resetStoreForTests, store } from "../src/db/store";
import {
  getTodayDecisionResponses,
  playCanCreateJournalCall,
  recordTodayDecisionResponse,
  reportCanCreateJournalCall,
  todayDecisionInbox,
} from "../src/db/today-decisions";

let previousDb: string | undefined;
let previousEngine: string | undefined;

beforeEach(() => {
  previousDb = process.env.MASTERMOLD_DB;
  previousEngine = process.env.ENGINE_OUT_DIR;
  const directory = mkdtempSync(join(tmpdir(), "mm-today-decision-"));
  process.env.MASTERMOLD_DB = join(directory, "mastermold.db");
  process.env.ENGINE_OUT_DIR = mkdtempSync(join(tmpdir(), "mm-today-engine-"));
  __resetStoreForTests();
});

afterEach(() => {
  if (previousDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = previousDb;
  if (previousEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = previousEngine;
  __resetStoreForTests();
});

describe("durable Today decision loop", () => {
  test("caps the inbox at three plays and persists watch/pass responses across restart", () => {
    const report = fixtureReport("Manual portfolio");
    expect(todayDecisionInbox(report)).toHaveLength(3);

    recordTodayDecisionResponse({ report, play: report.plays[0], response: "watch" });
    recordTodayDecisionResponse({ report, play: report.plays[1], response: "pass" });
    __resetStoreForTests();

    const responses = getTodayDecisionResponses(report.id);
    expect(responses.get(report.plays[0].id)?.response).toBe("watch");
    expect(responses.get(report.plays[1].id)?.response).toBe("pass");
  });

  test("a save response creates one provenance-linked journal call", () => {
    const report = fixtureReport("Manual portfolio");
    const response = recordTodayDecisionResponse({ report, play: report.plays[0], response: "save" });

    expect(response.journal_entry_id).toStartWith("journal_logged_");
    const entry = getJournal().entries.find((candidate) => candidate.id === response.journal_entry_id);
    expect(entry?.signals).toContain("Portfolio source: Manual portfolio");
    expect(entry?.signals).toContain("Market source: yahoo-chart partial");
    expect(entry?.horizon).toBe("1-5 days");
  });

  test("repeated responses are idempotent, watch/pass stay editable, and saved calls are final", () => {
    const report = fixtureReport("Manual portfolio");
    const watched = recordTodayDecisionResponse({ report, play: report.plays[0], response: "watch" });
    const watchedAgain = recordTodayDecisionResponse({ report, play: report.plays[0], response: "watch" });
    expect(watchedAgain.id).toBe(watched.id);

    const passed = recordTodayDecisionResponse({ report, play: report.plays[0], response: "pass" });
    expect(passed.response).toBe("pass");
    const saved = recordTodayDecisionResponse({ report, play: report.plays[0], response: "save" });
    const savedAgain = recordTodayDecisionResponse({ report, play: report.plays[0], response: "save" });
    expect(savedAgain.id).toBe(saved.id);
    expect(store().loggedJournalEntries().filter((entry) => entry.id === saved.journal_entry_id)).toHaveLength(1);
    expect(() => recordTodayDecisionResponse({ report, play: report.plays[0], response: "watch" }))
      .toThrow("saved scored call is immutable");
  });

  test("partial market coverage does not block a fresh unrelated play", () => {
    const report = fixtureReport("Manual portfolio");
    report.freshness.market_partial = true;
    report.freshness.skipped_symbols = ["aUSDC"];
    report.market_rows.push({
      symbol: "aUSDC",
      yf_symbol: null,
      asset_class: "defi",
      status: "unsupported",
      source: "unsupported",
      latest_close: null,
      previous_close: null,
      daily_move_pct: null,
      volume: null,
      average_volume: null,
      volume_ratio: null,
      fetched_at: report.created_at,
      detail: "No public quote mapping.",
    });
    expect(reportCanCreateJournalCall(report)).toBe(true);
    expect(playCanCreateJournalCall(report, report.plays[0])).toBe(true);
  });

  test("an unchanged passed idea stays out of the next report but changed evidence restores it", () => {
    const first = fixtureReport("Manual portfolio");
    recordTodayDecisionResponse({ report: first, play: first.plays[0], response: "pass" });

    const next = fixtureReport("Manual portfolio");
    next.id = "daily-report-next";
    next.created_at = "2026-08-04T12:00:00.000Z";
    expect(todayDecisionInbox(next).some((play) => play.id === first.plays[0].id)).toBe(false);

    const changed = fixtureReport("Manual portfolio");
    changed.id = "daily-report-changed";
    changed.created_at = "2026-08-04T12:00:00.000Z";
    changed.plays[0] = { ...changed.plays[0], headline: "Hold AAPL after materially changed evidence" };
    expect(todayDecisionInbox(changed).some((play) => play.id === first.plays[0].id)).toBe(true);
  });

  test("sample or stale context can be watched but cannot become scored evidence", () => {
    const report = fixtureReport("Sample fallback");
    expect(reportCanCreateJournalCall(report)).toBe(false);
    expect(() => recordTodayDecisionResponse({ report, play: report.plays[0], response: "save" }))
      .toThrow("Refresh this symbol and a personal portfolio");
    expect(recordTodayDecisionResponse({ report, play: report.plays[0], response: "watch" }).response)
      .toBe("watch");
  });
});

function fixtureReport(portfolioSource: string): DailyReport {
  const plays = Array.from({ length: 4 }, (_, index) => ({
    id: `play-${index + 1}`,
    symbol: index === 0 ? "AAPL" : `ASSET${index}`,
    action: index === 0 ? "hold" as const : "watch" as const,
    headline: index === 0 ? "Hold AAPL while the current reason remains intact" : `Watch asset ${index}`,
    why: ["Position weight is visible.", "The latest saved move is modest."],
    horizon: "days" as const,
    confidence: "medium" as const,
    source: "rules" as const,
  }));
  return {
    id: "daily-report-test",
    run_date: "2026-08-03",
    created_at: "2026-08-03T12:00:00.000Z",
    portfolio_source: portfolioSource,
    market_source: "yahoo-chart partial",
    holdings_scanned: ["AAPL"],
    watchlist_scanned: [],
    focus: { symbol: "AAPL", summary: "Review AAPL", why: ["Largest visible holding."] },
    risk: "No urgent risk flag.",
    plays,
    ideas: [],
    ignored_symbols: [],
    source_notes: [],
    freshness: {
      portfolio_as_of: "2026-08-03T12:00:00.000Z",
      market_as_of: "2026-08-03T12:00:00.000Z",
      portfolio_stale: false,
      market_partial: false,
      stale: false,
      skipped_symbols: [],
    },
    market_rows: [{
      symbol: "AAPL",
      yf_symbol: "AAPL",
      asset_class: "equity",
      status: "refreshed",
      source: "yahoo-chart",
      latest_close: 200,
      previous_close: 198,
      daily_move_pct: 1,
      volume: 1_000_000,
      average_volume: 1_000_000,
      volume_ratio: 1,
      fetched_at: "2026-08-03T12:00:00.000Z",
      detail: "Fresh quote.",
    }],
  };
}

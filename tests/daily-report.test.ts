/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureDailyReportAutoRefresh,
  getDailyReportAutoRefreshStatus,
  getLatestDailyReport,
  runDailyReportRefresh,
  type MarketQuoteFetcher,
} from "@/src/db/daily-report";
import { getChatContext } from "@/src/db/chat";
import { recordProductMetric } from "@/src/db/metrics";
import { addManualHolding } from "@/src/db/portfolio";
import { __resetStoreForTests, store } from "@/src/db/store";

let previousDb: string | undefined;
let previousTimeout: string | undefined;
let previousFetch: typeof globalThis.fetch;
let previousOpenRouterKey: string | undefined;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "mm-daily-report-"));
  previousDb = process.env.MASTERMOLD_DB;
  previousTimeout = process.env.MASTERMOLD_DAILY_REPORT_FETCH_TIMEOUT_MS;
  previousFetch = globalThis.fetch;
  // The default plays writer keys off OPENROUTER_API_KEY; tests must never
  // reach the network, so the key is cleared and LLM paths inject a fake.
  previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  process.env.MASTERMOLD_DB = join(dir, "mastermold.db");
  __resetStoreForTests();
});

afterEach(() => {
  if (previousDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = previousDb;
  if (previousTimeout === undefined) delete process.env.MASTERMOLD_DAILY_REPORT_FETCH_TIMEOUT_MS;
  else process.env.MASTERMOLD_DAILY_REPORT_FETCH_TIMEOUT_MS = previousTimeout;
  if (previousOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
  globalThis.fetch = previousFetch;
  __resetStoreForTests();
});

describe("manual daily report refresh", () => {
  test("GIVEN manual holdings WHEN daily report refresh runs THEN a canonical saved report names portfolio and market sources", async () => {
    addManualHolding({
      symbol: "AAPL",
      asset_name: "Apple",
      asset_class: "equity",
      venue: "NASDAQ",
      quantity: 5,
      price: 200,
    });
    const result = await runDailyReportRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        AAPL: quote(212, 200, 2_000_000, 1_000_000),
        NVDA: quote(910, 900, 3_000_000, 2_000_000),
        HOOD: quote(70, 69, 800_000, 900_000),
        BTC: quote(110_000, 108_000, 40_000, 35_000),
        ETH: quote(4_000, 3_950, 30_000, 31_000),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.report.portfolio_source).toBe("Manual holdings");
    expect(result.report.market_source).toBe("yahoo-chart partial");
    expect(result.report.holdings_scanned).toContain("AAPL");
    // Manual entries replace the demo seed: sample symbols are market
    // watchlist context now, not portfolio holdings.
    expect(result.report.holdings_scanned).not.toContain("NVDA");
    expect(result.report.watchlist_scanned).toContain("NVDA");
    expect(result.report.watchlist_scanned).toContain("ETH");
    expect(result.report.market_rows.find((row) => row.symbol === "AAPL")?.status).toBe("refreshed");
    expect(result.report.market_rows.find((row) => row.symbol === "aUSDC")?.status).toBe("unsupported");
    expect(result.report.focus.summary).toContain("AAPL");
    expect(result.report.ideas.some((idea) => idea.action === "paper-test")).toBe(true);
    expect(getLatestDailyReport()?.id).toBe(result.report.id);

    const context = getChatContext();
    const parsed = JSON.parse(context.llm_context) as {
      data_state: {
        daily_report: {
          portfolio_source: string;
        } | null;
        portfolio_state: string;
      };
    };

    expect(parsed.data_state.portfolio_state).toBe("Manual portfolio");
    expect(parsed.data_state.daily_report?.portfolio_source).toBe("Manual holdings");
  });

  test("GIVEN more than 100 newer telemetry events WHEN the latest report is read THEN the durable report remains canonical", async () => {
    const result = await runDailyReportRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        NVDA: quote(910, 900, 3_000_000, 2_000_000),
        HOOD: quote(70, 69, 800_000, 900_000),
        BTC: quote(110_000, 108_000, 40_000, 35_000),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);

    for (let i = 0; i < 120; i += 1) {
      recordProductMetric({
        event: "today_read_time",
        surface: "today",
        value: i,
        metadata: { test_event: i },
      });
    }

    expect(getLatestDailyReport()?.id).toBe(result.report.id);
  });

  test("GIVEN no market source succeeds WHEN refresh fails THEN the previous good report remains canonical", async () => {
    const good = await runDailyReportRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        NVDA: quote(910, 900, 3_000_000, 2_000_000),
        HOOD: quote(70, 69, 800_000, 900_000),
        BTC: quote(110_000, 108_000, 40_000, 35_000),
      }),
    });
    expect(good.ok).toBe(true);
    if (!good.ok) throw new Error(good.detail);

    const failed = await runDailyReportRefresh({
      now: new Date("2026-07-01T15:00:00.000Z"),
      quoteFetcher: async () => {
        throw new Error("offline");
      },
    });

    expect(failed.ok).toBe(false);
    expect(failed.detail).toContain("not updated");
    expect(failed.report?.id).toBe(good.report.id);
    expect(getLatestDailyReport()?.id).toBe(good.report.id);
  });

  test("GIVEN a saved report WHEN chat context is built THEN chat receives the same compact report", async () => {
    const result = await runDailyReportRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        NVDA: quote(910, 900, 3_000_000, 2_000_000),
        HOOD: quote(70, 69, 800_000, 900_000),
        BTC: quote(110_000, 108_000, 40_000, 35_000),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);

    const context = getChatContext();
    const parsed = JSON.parse(context.llm_context) as {
      data_state: {
        daily_report: {
          run_date: string;
          portfolio_source: string;
          focus: string;
          skipped_symbols: string[];
        } | null;
      };
    };

    expect(parsed.data_state.daily_report?.run_date).toBe("2026-07-01");
    expect(parsed.data_state.daily_report?.portfolio_source).toBe(result.report.portfolio_source);
    expect(parsed.data_state.daily_report?.focus).toBe(result.report.focus.summary);
    expect(parsed.data_state.daily_report?.skipped_symbols).toContain("aUSDC");
  });
});

describe("today's plays", () => {
  function seedPortfolio() {
    // TCAI dominates the visible portfolio; AAPL is a small position.
    addManualHolding({
      symbol: "TCAI",
      asset_name: "Tortoise AI Infrastructure ETF",
      asset_class: "equity",
      venue: "NASDAQ",
      quantity: 100,
      price: 90,
    });
    addManualHolding({
      symbol: "AAPL",
      asset_name: "Apple",
      asset_class: "equity",
      venue: "NASDAQ",
      quantity: 4,
      price: 200,
    });
  }

  const playQuotes = () =>
    quoteFetcher({
      TCAI: quote(95.4, 90, 3_000_000, 1_500_000), // +6.0% on 2x volume — concentrated winner
      AAPL: quote(192, 200, 2_400_000, 1_200_000), // -4.0% dip on a small position
      NVDA: quote(945, 900, 4_000_000, 2_000_000), // +5.0% watchlist mover, not held
      HOOD: quote(70, 69.9, 800_000, 900_000),
      BTC: quote(110_000, 109_800, 40_000, 39_000),
      ETH: quote(4_000, 3_995, 30_000, 31_000),
    });

  test("GIVEN real holdings and moves WHEN the report runs without an LLM key THEN 2-4 rules plays cite weights, moves, and memory", async () => {
    seedPortfolio();
    store().upsertMarketMemoryFact({
      id: "fact_2026-06-30_TCAI_signal",
      symbol: "TCAI",
      topic: "market",
      summary: "TCAI 1-day return +4.1% (z=+2.1); deterministic screener trigger.",
      confidence: 0.7,
      source_count: 1,
      evidence_urls: [],
      created_at: "2026-06-30T20:00:00.000Z",
      updated_at: "2026-06-30T20:00:00.000Z",
      event_time: "2026-06-30T13:30:00.000Z",
      knowledge_time: "2026-06-30T20:00:00.000Z",
    });

    const result = await runDailyReportRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: playQuotes(),
      playsCompletion: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);

    const plays = result.report.plays;
    expect(plays.length).toBeGreaterThanOrEqual(2);
    expect(plays.length).toBeLessThanOrEqual(4);
    expect(plays.every((play) => play.source === "rules")).toBe(true);
    expect(plays.every((play) => ["trim", "add", "hold", "watch"].includes(play.action))).toBe(true);
    expect(plays.every((play) => ["days", "weeks", "months"].includes(play.horizon))).toBe(true);
    expect(plays.every((play) => ["low", "medium", "high"].includes(play.confidence))).toBe(true);
    expect(plays.every((play) => play.why.length > 0)).toBe(true);

    // Concentration: the oversized TCAI position leads with a trim suggestion
    // that cites its actual weight, and the memory fact is threaded in dated.
    const trim = plays.find((play) => play.symbol === "TCAI");
    expect(trim?.action).toBe("trim");
    expect(trim?.why.join(" ")).toMatch(/\d+\.\d% of the visible portfolio/);
    expect(trim?.why.join(" ")).toContain("Memory 2026-06-30");

    // The small AAPL dip reads as a slow add; the unheld NVDA pop is a watch.
    const add = plays.find((play) => play.symbol === "AAPL");
    expect(add?.action).toBe("add");
    expect(add?.why.join(" ")).toContain("-4.0%");
    const watch = plays.find((play) => play.symbol === "NVDA");
    expect(watch?.action).toBe("watch");

    // Advisory-only language: suggestions, never execution instructions.
    const allCopy = plays.map((play) => `${play.headline} ${play.why.join(" ")}`).join(" ");
    expect(allCopy).not.toMatch(/guaranteed|will profit|execute now|placing (the )?order/i);
    expect(getLatestDailyReport()?.plays.length).toBe(plays.length);
  });

  test("GIVEN a quiet tape WHEN no symbol moves past the threshold THEN the backfill still suggests at least two plays", async () => {
    seedPortfolio();
    const result = await runDailyReportRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        TCAI: quote(90.1, 90, 1_000_000, 1_500_000),
        AAPL: quote(200.2, 200, 1_000_000, 1_200_000),
        NVDA: quote(901, 900, 2_000_000, 2_000_000),
        HOOD: quote(70, 69.9, 800_000, 900_000),
        BTC: quote(110_000, 109_800, 40_000, 39_000),
        ETH: quote(4_000, 3_995, 30_000, 31_000),
      }),
      playsCompletion: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.report.plays.length).toBeGreaterThanOrEqual(2);
    // TCAI is still >25% of the portfolio, so the concentration trim stays.
    expect(result.report.plays.some((play) => play.symbol === "TCAI" && play.action === "trim")).toBe(true);
    expect(result.report.plays.some((play) => play.action === "hold")).toBe(true);
  });

  test("GIVEN an LLM key WHEN the plays writer returns valid strict JSON THEN validated LLM plays replace the rules plays", async () => {
    seedPortfolio();
    const result = await runDailyReportRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: playQuotes(),
      playsCompletion: async () =>
        JSON.stringify({
          plays: [
            {
              symbol: "TCAI",
              action: "trim",
              headline: "Consider trimming TCAI into today's +6.0% pop; it dominates the portfolio.",
              why: ["TCAI moved +6.0% on 2.0x average volume.", "TCAI is 90% of the visible portfolio."],
              horizon: "weeks",
              confidence: "medium",
            },
            {
              symbol: "NVDA",
              action: "watch",
              headline: "Worth watching NVDA for an entry after the +5.0% move.",
              why: ["NVDA moved +5.0% today and is not a visible holding."],
              horizon: "days",
              confidence: "low",
            },
          ],
        }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.report.plays).toHaveLength(2);
    expect(result.report.plays.every((play) => play.source === "llm")).toBe(true);
    expect(result.report.plays[0].symbol).toBe("TCAI");
    expect(getLatestDailyReport()?.plays.every((play) => play.source === "llm")).toBe(true);
  });

  test("GIVEN the LLM returns garbage or invented symbols WHEN plays are validated THEN the rules plays stay canonical", async () => {
    seedPortfolio();
    for (const badOutput of [
      "not json at all",
      JSON.stringify({ plays: [{ symbol: "GME", action: "add", headline: "yolo", why: ["moon"], horizon: "days", confidence: "high" }] }),
      JSON.stringify({ plays: [] }),
    ]) {
      const result = await runDailyReportRefresh({
        now: new Date("2026-07-01T14:00:00.000Z"),
        quoteFetcher: playQuotes(),
        playsCompletion: async () => badOutput,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.detail);
      expect(result.report.plays.length).toBeGreaterThanOrEqual(2);
      expect(result.report.plays.every((play) => play.source === "rules")).toBe(true);
    }
  });

  test("GIVEN a report saved before plays existed WHEN it is read back THEN plays defaults to an empty list", () => {
    store().upsertDailyReport({
      id: "daily_report_legacy",
      run_date: "2026-06-20",
      created_at: "2026-06-20T14:00:00.000Z",
      data: {
        id: "daily_report_legacy",
        run_date: "2026-06-20",
        created_at: "2026-06-20T14:00:00.000Z",
        focus: { symbol: null, summary: "legacy", why: [] },
        ideas: [],
        market_rows: [],
      },
    });
    expect(getLatestDailyReport()?.plays).toEqual([]);
  });

  test("GIVEN Today renders the briefing WHEN source copy is checked THEN Today's plays is the centerpiece and stays advisory", () => {
    const todayPage = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
    expect(todayPage).toContain("Today&apos;s plays");
    expect(todayPage).toContain('data-testid="today-play"');
    expect(todayPage).toContain("Master Mold never places trades");
    expect(todayPage).toContain("horizon: {play.horizon} · confidence: {play.confidence}");
    // The plays section renders above the prose brief.
    expect(todayPage.indexOf('aria-labelledby="today-plays-title"')).toBeLessThan(
      todayPage.indexOf('aria-labelledby="today-brief-title"'),
    );
  });
});

describe("simple daily auto-refresh", () => {
  test("GIVEN no report exists WHEN Today or Review asks for a report THEN auto-refresh saves one market-data-only report", async () => {
    const result = await ensureDailyReportAutoRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        NVDA: quote(910, 900, 3_000_000, 2_000_000),
        HOOD: quote(70, 69, 800_000, 900_000),
        BTC: quote(110_000, 108_000, 40_000, 35_000),
        ETH: quote(4_000, 3_950, 30_000, 31_000),
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.refreshed).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.report.run_date).toBe("2026-07-01");
    expect(result.status.last_result).toBe("refreshed");
    expect(result.status.market_scope).toBe("market data only");
    expect(result.status.missing_research).toContain("fresh news");
    expect(getLatestDailyReport()?.id).toBe(result.report.id);
  });

  test("GIVEN today's report is fresh WHEN auto-refresh checks again THEN it skips without calling the market source", async () => {
    const good = await ensureDailyReportAutoRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        NVDA: quote(910, 900, 3_000_000, 2_000_000),
        HOOD: quote(70, 69, 800_000, 900_000),
        BTC: quote(110_000, 108_000, 40_000, 35_000),
      }),
    });
    expect(good.ok).toBe(true);
    if (!good.ok) throw new Error(good.detail);

    let calls = 0;
    const skipped = await ensureDailyReportAutoRefresh({
      now: new Date("2026-07-01T18:00:00.000Z"),
      quoteFetcher: async () => {
        calls += 1;
        throw new Error("should not run");
      },
    });

    expect(skipped.ok).toBe(true);
    if (!skipped.ok) throw new Error(skipped.detail);
    expect(skipped.refreshed).toBe(false);
    expect(skipped.skipped).toBe(true);
    expect(calls).toBe(0);
    expect(skipped.report.id).toBe(good.report.id);
  });

  test("GIVEN yesterday's report exists WHEN auto-refresh checks today THEN it refreshes a new daily report", async () => {
    const yesterday = await ensureDailyReportAutoRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        NVDA: quote(910, 900, 3_000_000, 2_000_000),
        HOOD: quote(70, 69, 800_000, 900_000),
        BTC: quote(110_000, 108_000, 40_000, 35_000),
      }),
    });
    expect(yesterday.ok).toBe(true);
    if (!yesterday.ok) throw new Error(yesterday.detail);

    const today = await ensureDailyReportAutoRefresh({
      now: new Date("2026-07-02T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        NVDA: quote(920, 910, 3_200_000, 2_100_000),
        HOOD: quote(71, 70, 850_000, 900_000),
        BTC: quote(111_000, 110_000, 41_000, 35_000),
      }),
    });

    expect(today.ok).toBe(true);
    if (!today.ok) throw new Error(today.detail);
    expect(today.refreshed).toBe(true);
    expect(today.report.run_date).toBe("2026-07-02");
    expect(today.report.id).not.toBe(yesterday.report.id);
    expect(getLatestDailyReport()?.id).toBe(today.report.id);
  });

  test("GIVEN yesterday's report exists WHEN stale auto-refresh fails THEN the previous good report remains saved", async () => {
    const good = await ensureDailyReportAutoRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        NVDA: quote(910, 900, 3_000_000, 2_000_000),
        HOOD: quote(70, 69, 800_000, 900_000),
        BTC: quote(110_000, 108_000, 40_000, 35_000),
      }),
    });
    expect(good.ok).toBe(true);
    if (!good.ok) throw new Error(good.detail);

    const failed = await ensureDailyReportAutoRefresh({
      now: new Date("2026-07-02T14:00:00.000Z"),
      quoteFetcher: async () => {
        throw new Error("offline");
      },
    });

    expect(failed.ok).toBe(false);
    expect(failed.report?.id).toBe(good.report.id);
    expect(getLatestDailyReport()?.id).toBe(good.report.id);
    const status = getDailyReportAutoRefreshStatus(new Date("2026-07-02T14:01:00.000Z"));
    expect(status.due).toBe(true);
    expect(status.last_result).toBe("failed");
    expect(status.last_detail).toContain("not updated");
  });

  test("GIVEN concurrent stale checks WHEN auto-refresh runs THEN they share one market refresh", async () => {
    let calls = 0;
    const fetcher: MarketQuoteFetcher = async () => {
      calls += 1;
      await Promise.resolve();
      return quote(100, 95, 1_000, 900);
    };

    const [first, second] = await Promise.all([
      ensureDailyReportAutoRefresh({
        now: new Date("2026-07-01T14:00:00.000Z"),
        quoteFetcher: fetcher,
      }),
      ensureDailyReportAutoRefresh({
        now: new Date("2026-07-01T14:00:00.000Z"),
        quoteFetcher: fetcher,
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("auto-refresh should succeed");
    expect(first.report.id).toBe(second.report.id);
    expect(calls).toBe(first.report.market_rows.filter((row) => row.yf_symbol !== null).length);
  });

  test("GIVEN the default market fetch times out WHEN refresh fails THEN the previous good report remains canonical", async () => {
    const good = await runDailyReportRefresh({
      now: new Date("2026-07-01T14:00:00.000Z"),
      quoteFetcher: quoteFetcher({
        NVDA: quote(910, 900, 3_000_000, 2_000_000),
        HOOD: quote(70, 69, 800_000, 900_000),
        BTC: quote(110_000, 108_000, 40_000, 35_000),
      }),
    });
    expect(good.ok).toBe(true);
    if (!good.ok) throw new Error(good.detail);

    process.env.MASTERMOLD_DAILY_REPORT_FETCH_TIMEOUT_MS = "5";
    globalThis.fetch = ((_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        if (signal?.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal?.addEventListener("abort", () => reject(new Error("timeout abort")), { once: true });
      })) as typeof fetch;

    const failed = await runDailyReportRefresh({
      now: new Date("2026-07-02T14:00:00.000Z"),
    });

    expect(failed.ok).toBe(false);
    expect(failed.report?.id).toBe(good.report.id);
    expect(getLatestDailyReport()?.id).toBe(good.report.id);
  });

  test("GIVEN Review explains readiness WHEN source copy is checked THEN auto-refresh is simple and research boundaries stay visible", () => {
    const reviewPage = readFileSync(join(process.cwd(), "app/review/page.tsx"), "utf8");
    const settingsPage = readFileSync(join(process.cwd(), "app/settings/page.tsx"), "utf8");
    const dailyReport = readFileSync(join(process.cwd(), "src/db/daily-report.ts"), "utf8");

    expect(reviewPage).toContain("Build truth and review readiness");
    expect(reviewPage).toContain("Capability truth");
    // The simple app-load check: Settings itself triggers the auto-refresh.
    expect(settingsPage).toContain("ensureDailyReportAutoRefresh");
    expect(settingsPage).toContain("getDailyReportAutoRefreshStatus");
    expect(settingsPage).toContain("getPortfolioBrainScanContext");
    expect(settingsPage).toContain('label="Portfolio source"');
    expect(settingsPage).toContain('label="Daily report"');
    expect(settingsPage).toContain('auto-refresh ${autoRefreshStatus.due ? "due" : "on"}');
    expect(dailyReport).toContain('market_scope: "market data only"');
    expect(dailyReport).toContain('missing_research: ["fresh news", "social feeds", "on-chain data"]');
  });
});

function quote(
  latest_close: number,
  previous_close: number,
  volume: number,
  average_volume: number,
) {
  return {
    latest_close,
    previous_close,
    volume,
    average_volume,
    fetched_at: "2026-07-01T13:30:00.000Z",
  };
}

function quoteFetcher(rows: Record<string, ReturnType<typeof quote>>): MarketQuoteFetcher {
  return async (yfSymbol) => {
    const symbol = yfSymbol.replace(/-USD$/, "");
    const row = rows[symbol];
    if (!row) throw new Error(`missing ${yfSymbol}`);
    return row;
  };
}

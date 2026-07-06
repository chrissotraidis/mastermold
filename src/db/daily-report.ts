import { demoDatabase } from "./seed-data";
import { getPortfolio, type AssetClass, type PortfolioHoldingJson } from "./portfolio";
import { getPortfolioBrainScanContext } from "./portfolio-brain";
import { recordProductMetric } from "./metrics";
import type { MarketMemoryFact } from "./schema";
import { store } from "./store";

export type DailyReportSymbolStatus =
  | "refreshed"
  | "fallback"
  | "unsupported"
  | "failed";

export type DailyReportMarketRow = {
  symbol: string;
  yf_symbol: string | null;
  asset_class: AssetClass;
  status: DailyReportSymbolStatus;
  source: "yahoo-chart" | "portfolio-snapshot" | "unsupported";
  latest_close: number | null;
  previous_close: number | null;
  daily_move_pct: number | null;
  volume: number | null;
  average_volume: number | null;
  volume_ratio: number | null;
  fetched_at: string;
  detail: string;
};

export type DailyReportIdea = {
  id: string;
  symbol: string;
  action: "review" | "paper-test" | "watch" | "ignore";
  title: string;
  reason: string;
  evidence: string[];
};

export type DailyReportPlayAction = "trim" | "add" | "hold" | "watch";
export type DailyReportPlayHorizon = "days" | "weeks" | "months";
export type DailyReportPlayConfidence = "low" | "medium" | "high";

/**
 * One concrete, advisory-only suggestion for today: what to consider doing
 * with a specific symbol, why (citing real local data — move size, position
 * weight, dated memory facts), over what horizon, and how confident the
 * suggestion honestly is. The app never executes any of these.
 */
export type DailyReportPlay = {
  id: string;
  symbol: string;
  action: DailyReportPlayAction;
  headline: string;
  why: string[];
  horizon: DailyReportPlayHorizon;
  confidence: DailyReportPlayConfidence;
  source: "rules" | "llm";
};

export type DailyReport = {
  id: string;
  run_date: string;
  created_at: string;
  portfolio_source: string;
  market_source: string;
  holdings_scanned: string[];
  watchlist_scanned: string[];
  focus: {
    symbol: string | null;
    summary: string;
    why: string[];
  };
  risk: string;
  plays: DailyReportPlay[];
  ideas: DailyReportIdea[];
  ignored_symbols: string[];
  source_notes: string[];
  freshness: {
    portfolio_as_of: string;
    market_as_of: string;
    stale: boolean;
    skipped_symbols: string[];
  };
  market_rows: DailyReportMarketRow[];
};

export type DailyReportRunResult =
  | { ok: true; report: DailyReport; detail: string }
  | { ok: false; detail: string; report: DailyReport | null };

export type MarketQuoteFetcher = (yfSymbol: string) => Promise<MarketQuoteResult>;

/**
 * One-shot completion for the optional LLM plays writer — injected so tests
 * never touch the network. `null` means "no key, use the rules plays".
 */
export type PlaysCompletionFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

export type MarketQuoteResult = {
  latest_close: number;
  previous_close: number;
  volume: number;
  average_volume: number;
  fetched_at?: string;
};

const DAILY_REPORT_EVENT = "daily_report_saved";
const DAILY_REPORT_AUTO_EVENT = "daily_report_auto_refresh";
const DEFAULT_YAHOO_FETCH_TIMEOUT_MS = 5_000;
const REPORT_BOUNDARY =
  "Manual daily report refresh. This reads public market data and portfolio snapshots only; it cannot place brokerage trades, sign transactions, or move funds.";

export type DailyReportAutoRefreshResult =
  | "never"
  | "refreshed"
  | "skipped_fresh"
  | "failed";

export type DailyReportAutoRefreshStatus = {
  enabled: true;
  mode: "simple app-load check";
  market_scope: "market data only";
  due: boolean;
  latest_report_date: string | null;
  last_checked_at: string | null;
  last_result: DailyReportAutoRefreshResult;
  last_detail: string;
  next_refresh_after: string;
  missing_research: string[];
};

export type DailyReportAutoRefreshRunResult =
  | {
      ok: true;
      refreshed: true;
      skipped: false;
      report: DailyReport;
      status: DailyReportAutoRefreshStatus;
      detail: string;
    }
  | {
      ok: true;
      refreshed: false;
      skipped: true;
      report: DailyReport;
      status: DailyReportAutoRefreshStatus;
      detail: string;
    }
  | {
      ok: false;
      refreshed: false;
      skipped: false;
      report: DailyReport | null;
      status: DailyReportAutoRefreshStatus;
      detail: string;
    };

type DailyReportAutoRefreshEvent = {
  result: Exclude<DailyReportAutoRefreshResult, "never">;
  checked_at: string;
  run_date: string;
  report_id: string | null;
  detail: string;
};

let dailyReportAutoRefreshInFlight: Promise<DailyReportAutoRefreshRunResult> | null = null;

export async function runDailyReportRefresh(input: {
  now?: Date;
  quoteFetcher?: MarketQuoteFetcher;
  /** Omit for the env-driven default; pass null to force rules-only plays. */
  playsCompletion?: PlaysCompletionFn | null;
} = {}): Promise<DailyReportRunResult> {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const portfolio = getPortfolio();
  const symbols = reportSymbols(portfolio.holdings);
  const fetcher = input.quoteFetcher ?? fetchYahooChartQuote;
  const rows = await Promise.all(
    symbols.map((symbol) => refreshSymbol(symbol, portfolio.holdings, createdAt, fetcher)),
  );

  const report = buildDailyReport({
    createdAt,
    portfolio,
    rows,
  });

  const refreshedCount = rows.filter((row) => row.status === "refreshed").length;
  if (refreshedCount === 0 && rows.length > 0) {
    return {
      ok: false,
      detail: "Daily report was not updated because no symbol refreshed from the market source.",
      report: getLatestDailyReport(),
    };
  }

  // Optional single LLM pass to write sharper plays from the same structured
  // context; anything off-shape degrades silently to the rules plays already
  // on the report, so Today's plays always renders without a key.
  const playsCompletion =
    input.playsCompletion === undefined ? defaultPlaysCompletion() : input.playsCompletion;
  if (playsCompletion) {
    const llmPlays = await tryLlmPlays(report, portfolio.holdings, playsCompletion);
    if (llmPlays) report.plays = llmPlays;
  }

  store().upsertDailyReport({
    id: report.id,
    run_date: report.run_date,
    created_at: report.created_at,
    data: report,
  });

  recordProductMetric({
    event: DAILY_REPORT_EVENT,
    surface: "today",
    entity_id: report.id,
    value: refreshedCount,
    metadata: {
      daily_report: report,
      data_boundary: REPORT_BOUNDARY,
    },
  });

  return {
    ok: true,
    report,
    detail: `Daily report saved: ${refreshedCount} refreshed, ${report.freshness.skipped_symbols.length} skipped.`,
  };
}

export async function ensureDailyReportAutoRefresh(input: {
  now?: Date;
  quoteFetcher?: MarketQuoteFetcher;
  playsCompletion?: PlaysCompletionFn | null;
} = {}): Promise<DailyReportAutoRefreshRunResult> {
  const now = input.now ?? new Date();
  const currentReport = getLatestDailyReport();

  if (currentReport && isDailyReportFresh(currentReport, now)) {
    return {
      ok: true,
      refreshed: false,
      skipped: true,
      report: currentReport,
      status: getDailyReportAutoRefreshStatus(now),
      detail: "Today's daily report is fresh; auto-refresh skipped.",
    };
  }

  if (dailyReportAutoRefreshInFlight) {
    return dailyReportAutoRefreshInFlight;
  }

  dailyReportAutoRefreshInFlight = runDailyReportAutoRefresh({
    now,
    quoteFetcher: input.quoteFetcher,
    playsCompletion: input.playsCompletion,
  }).finally(() => {
    dailyReportAutoRefreshInFlight = null;
  });

  return dailyReportAutoRefreshInFlight;
}

async function runDailyReportAutoRefresh(input: {
  now: Date;
  quoteFetcher?: MarketQuoteFetcher;
  playsCompletion?: PlaysCompletionFn | null;
}): Promise<DailyReportAutoRefreshRunResult> {
  const now = input.now;
  const result = await runDailyReportRefresh({
    now,
    quoteFetcher: input.quoteFetcher,
    playsCompletion: input.playsCompletion,
  });
  recordDailyReportAutoRefresh({
    result: result.ok ? "refreshed" : "failed",
    checked_at: now.toISOString(),
    run_date: isoRunDate(now),
    report_id: result.report?.id ?? null,
    detail: result.detail,
  });

  if (result.ok) {
    return {
      ok: true,
      refreshed: true,
      skipped: false,
      report: result.report,
      status: getDailyReportAutoRefreshStatus(now),
      detail: "Auto-refresh saved today's daily report.",
    };
  }

  return {
    ok: false,
    refreshed: false,
    skipped: false,
    report: result.report,
    status: getDailyReportAutoRefreshStatus(now),
    detail: result.detail,
  };
}

export function getLatestDailyReport(): DailyReport | null {
  const storedReport = normalizeDailyReport(store().dailyReports(1)[0]?.data);
  if (storedReport) return storedReport;

  for (const event of store().productEvents(100)) {
    if (event.event !== DAILY_REPORT_EVENT) continue;
    const report = normalizeDailyReport((event.metadata as { daily_report?: unknown } | null)?.daily_report);
    if (report) return report;
  }
  return null;
}

export function getDailyReportAutoRefreshStatus(now: Date = new Date()): DailyReportAutoRefreshStatus {
  const report = getLatestDailyReport();
  const event = getLatestDailyReportAutoRefreshEvent();
  const due = !isDailyReportFresh(report, now);
  const fallbackDetail = due
    ? "Auto-refresh will try a market-data-only report when Today or Review loads."
    : "Today's market-data-only report is fresh.";

  return {
    enabled: true,
    mode: "simple app-load check",
    market_scope: "market data only",
    due,
    latest_report_date: report?.run_date ?? null,
    last_checked_at: event?.checked_at ?? null,
    last_result: event?.result ?? "never",
    last_detail: event?.detail ?? fallbackDetail,
    next_refresh_after: due ? now.toISOString() : nextRefreshAfter(now),
    missing_research: ["fresh news", "social feeds", "on-chain data"],
  };
}

export function buildDailyReport(input: {
  createdAt: string;
  portfolio: ReturnType<typeof getPortfolio>;
  rows: DailyReportMarketRow[];
}): DailyReport {
  const { createdAt, portfolio, rows } = input;
  const portfolioContext = getPortfolioBrainScanContext(new Date(createdAt));
  const holdingSymbols = new Set(portfolio.holdings.map((holding) => holding.symbol));
  const refreshedRows = rows.filter((row) => row.status === "refreshed");
  const skipped = rows
    .filter((row) => row.status !== "refreshed")
    .map((row) => row.symbol);
  const focusHolding = pickFocusHolding(portfolio.holdings, rows);
  const focusRow = focusHolding ? rows.find((row) => row.symbol === focusHolding.symbol) ?? null : refreshedRows[0] ?? null;
  const focusWhy = focusReasons(focusHolding, focusRow);
  const ideas = buildReportIdeas(portfolio.holdings, rows, focusHolding);
  const plays = buildTodaysPlays({
    holdings: portfolio.holdings,
    rows,
    facts: recentMemoryFacts(createdAt),
  });
  const ignoredSymbols = rows
    .filter((row) =>
      row.status === "refreshed" &&
      Math.abs(row.daily_move_pct ?? 0) < 1 &&
      (row.volume_ratio ?? 1) < 1.2,
    )
    .map((row) => row.symbol)
    .slice(0, 4);

  return {
    id: `daily_report_${createdAt.slice(0, 10)}_${Date.parse(createdAt).toString(36)}`,
    run_date: createdAt.slice(0, 10),
    created_at: createdAt,
    portfolio_source: portfolioContext.source_label,
    market_source: refreshedRows.length > 0
      ? skipped.length > 0
        ? "yahoo-chart partial"
        : "yahoo-chart"
      : "portfolio snapshot fallback",
    holdings_scanned: rows.filter((row) => holdingSymbols.has(row.symbol)).map((row) => row.symbol),
    watchlist_scanned: rows.filter((row) => !holdingSymbols.has(row.symbol)).map((row) => row.symbol),
    focus: {
      symbol: focusHolding?.symbol ?? focusRow?.symbol ?? null,
      summary: focusSummary(focusHolding, focusRow),
      why: focusWhy,
    },
    risk: reportRiskLine(portfolio, skipped),
    plays,
    ideas,
    ignored_symbols: ignoredSymbols,
    source_notes: [
      REPORT_BOUNDARY,
      "Fresh news, social, on-chain, and scheduled automation are not part of this report yet.",
      skipped.length > 0
        ? `${skipped.join(", ")} did not refresh from the market source.`
        : "All report symbols refreshed from the market source.",
    ],
    freshness: {
      portfolio_as_of: portfolio.provenance.as_of,
      market_as_of: latestMarketTime(rows) ?? createdAt,
      stale: skipped.length > 0 || portfolio.import_snapshot.is_stale,
      skipped_symbols: skipped,
    },
    market_rows: rows,
  };
}

async function refreshSymbol(
  symbol: string,
  holdings: PortfolioHoldingJson[],
  fetchedAt: string,
  quoteFetcher: MarketQuoteFetcher,
): Promise<DailyReportMarketRow> {
  const holding = holdings.find((item) => item.symbol === symbol);
  const assetClass = holding?.asset_class ?? assetClassForSymbol(symbol);
  const yfSymbol = yfSymbolFor(symbol, assetClass);
  if (!yfSymbol) {
    return fallbackRow({
      symbol,
      assetClass,
      holding,
      fetchedAt,
      status: "unsupported",
      detail: `${symbol} is ${assetClass}; this slice only refreshes equities and major crypto through Yahoo-style price/volume data.`,
    });
  }

  try {
    const quote = await quoteFetcher(yfSymbol);
    return {
      symbol,
      yf_symbol: yfSymbol,
      asset_class: assetClass,
      status: "refreshed",
      source: "yahoo-chart",
      latest_close: roundMoney(quote.latest_close),
      previous_close: roundMoney(quote.previous_close),
      daily_move_pct: pctChange(quote.latest_close, quote.previous_close),
      volume: Math.round(quote.volume),
      average_volume: Math.round(quote.average_volume),
      volume_ratio: quote.average_volume > 0 ? roundPct(quote.volume / quote.average_volume) : null,
      fetched_at: quote.fetched_at ?? fetchedAt,
      detail: `${symbol} refreshed from public price/volume data.`,
    };
  } catch (error) {
    return fallbackRow({
      symbol,
      assetClass,
      holding,
      fetchedAt,
      status: "fallback",
      detail: `${symbol} could not refresh (${error instanceof Error ? error.message : "unknown error"}); using visible portfolio snapshot only.`,
      yfSymbol,
    });
  }
}

async function fetchYahooChartQuote(yfSymbol: string): Promise<MarketQuoteResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?range=45d&interval=1d`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(dailyReportFetchTimeoutMs()),
  });
  if (!response.ok) throw new Error(`Yahoo chart returned ${response.status}`);
  const body = await response.json() as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }>;
        };
      }>;
    };
  };
  const result = body.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const closes = (quote?.close ?? []).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const volumes = (quote?.volume ?? []).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (closes.length < 2) throw new Error("not enough daily closes");
  const latestClose = closes[closes.length - 1];
  const previousClose = closes[closes.length - 2];
  const latestVolume = volumes[volumes.length - 1] ?? 0;
  const volumeWindow = volumes.slice(Math.max(0, volumes.length - 21), Math.max(0, volumes.length - 1));
  const averageVolume = volumeWindow.length > 0
    ? volumeWindow.reduce((sum, value) => sum + value, 0) / volumeWindow.length
    : latestVolume;
  const lastTimestamp = result?.timestamp?.[result.timestamp.length - 1];

  return {
    latest_close: latestClose,
    previous_close: previousClose,
    volume: latestVolume,
    average_volume: averageVolume,
    fetched_at: typeof lastTimestamp === "number" ? new Date(lastTimestamp * 1000).toISOString() : undefined,
  };
}

function dailyReportFetchTimeoutMs() {
  const configured = Number(process.env.MASTERMOLD_DAILY_REPORT_FETCH_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 1) return configured;
  return DEFAULT_YAHOO_FETCH_TIMEOUT_MS;
}

function fallbackRow(input: {
  symbol: string;
  assetClass: AssetClass;
  holding: PortfolioHoldingJson | undefined;
  fetchedAt: string;
  status: "fallback" | "unsupported";
  detail: string;
  yfSymbol?: string | null;
}): DailyReportMarketRow {
  const snapshotPrice = input.holding && input.holding.quantity > 0
    ? input.holding.market_value / input.holding.quantity
    : null;
  return {
    symbol: input.symbol,
    yf_symbol: input.yfSymbol ?? null,
    asset_class: input.assetClass,
    status: input.status,
    source: input.status === "unsupported" ? "unsupported" : "portfolio-snapshot",
    latest_close: snapshotPrice ? roundMoney(snapshotPrice) : null,
    previous_close: null,
    daily_move_pct: input.holding?.daily_change_pct ?? null,
    volume: null,
    average_volume: null,
    volume_ratio: null,
    fetched_at: input.fetchedAt,
    detail: input.detail,
  };
}

function reportSymbols(holdings: PortfolioHoldingJson[]) {
  const symbols = new Set<string>();
  for (const holding of holdings) symbols.add(holding.symbol);
  for (const asset of demoDatabase.assets) symbols.add(asset.symbol);
  return [...symbols].filter((symbol) => symbol !== "USD").slice(0, 12);
}

function yfSymbolFor(symbol: string, assetClass: AssetClass): string | null {
  const normalized = symbol.toUpperCase();
  if (assetClass === "equity") return normalized;
  if (assetClass === "crypto") return `${normalized}-USD`;
  return null;
}

function assetClassForSymbol(symbol: string): AssetClass {
  const asset = demoDatabase.assets.find((item) => item.symbol === symbol);
  return asset?.asset_class ?? "equity";
}

function pickFocusHolding(holdings: PortfolioHoldingJson[], rows: DailyReportMarketRow[]) {
  const rowBySymbol = new Map(rows.map((row) => [row.symbol, row]));
  const ranked = [...holdings].sort((a, b) => {
    const aRow = rowBySymbol.get(a.symbol);
    const bRow = rowBySymbol.get(b.symbol);
    const aVolume = aRow?.volume_ratio ?? 0;
    const bVolume = bRow?.volume_ratio ?? 0;
    const aMove = Math.abs(aRow?.daily_move_pct ?? a.daily_change_pct);
    const bMove = Math.abs(bRow?.daily_move_pct ?? b.daily_change_pct);
    return (bVolume * 12 + bMove + b.weight_pct / 4) - (aVolume * 12 + aMove + a.weight_pct / 4);
  });
  return ranked[0] ?? null;
}

function focusSummary(holding: PortfolioHoldingJson | null | undefined, row: DailyReportMarketRow | null | undefined) {
  if (holding && row?.status === "refreshed") {
    return `${holding.symbol} needs review because it is ${holding.weight_pct.toFixed(0)}% of the visible portfolio and just refreshed with ${volumeRatioLabel(row)} volume.`;
  }
  if (holding) {
    return `${holding.symbol} needs review because it is ${holding.weight_pct.toFixed(0)}% of the visible portfolio, but its market refresh is incomplete.`;
  }
  if (row) return `${row.symbol} refreshed, but no personal holding is loaded for it yet.`;
  return "No daily report focus is ready yet.";
}

function focusReasons(holding: PortfolioHoldingJson | null | undefined, row: DailyReportMarketRow | null | undefined) {
  const reasons: string[] = [];
  if (holding) reasons.push(`${holding.symbol} is ${holding.weight_pct.toFixed(1)}% of the visible portfolio.`);
  if (row?.status === "refreshed") {
    reasons.push(`${row.symbol} moved ${signedPct(row.daily_move_pct)} with ${volumeRatioLabel(row)} volume.`);
  } else if (row) {
    reasons.push(row.detail);
  }
  if (reasons.length === 0) reasons.push("Add holdings or refresh the market read to generate a sharper focus.");
  return reasons.slice(0, 2);
}

function buildReportIdeas(
  holdings: PortfolioHoldingJson[],
  rows: DailyReportMarketRow[],
  focusHolding: PortfolioHoldingJson | null | undefined,
): DailyReportIdea[] {
  const ideas: DailyReportIdea[] = [];
  const rowBySymbol = new Map(rows.map((row) => [row.symbol, row]));
  if (focusHolding) {
    const row = rowBySymbol.get(focusHolding.symbol);
    ideas.push({
      id: `review_${focusHolding.symbol.toLowerCase()}`,
      symbol: focusHolding.symbol,
      action: "review",
      title: `Review ${focusHolding.symbol}`,
      reason: row?.status === "refreshed"
        ? `${focusHolding.symbol} combines visible exposure with a fresh price/volume read.`
        : `${focusHolding.symbol} is visible exposure, but the market refresh needs attention.`,
      evidence: focusReasons(focusHolding, row),
    });
  }

  const topHolding = [...holdings].sort((a, b) => b.weight_pct - a.weight_pct)[0];
  if (topHolding && topHolding.weight_pct >= 25 && ideas.every((idea) => idea.symbol !== topHolding.symbol || idea.action !== "paper-test")) {
    ideas.push({
      id: `paper_${topHolding.symbol.toLowerCase()}`,
      symbol: topHolding.symbol,
      action: "paper-test",
      title: `Paper test ${topHolding.symbol}`,
      reason: `${topHolding.symbol} is ${topHolding.weight_pct.toFixed(0)}% of visible value; test a trim or hold scenario before touching real money.`,
      evidence: [`Portfolio weight: ${topHolding.weight_pct.toFixed(1)}%.`, "Paper only; no brokerage orders."],
    });
  }

  const unsupported = rows.find((row) => row.status === "unsupported");
  if (unsupported) {
    ideas.push({
      id: `watch_${unsupported.symbol.toLowerCase()}`,
      symbol: unsupported.symbol,
      action: "watch",
      title: `Watch ${unsupported.symbol} source`,
      reason: `${unsupported.symbol} is not covered by the simple price/volume refresh yet.`,
      evidence: [unsupported.detail],
    });
  }

  return ideas.slice(0, 3);
}

function reportRiskLine(portfolio: ReturnType<typeof getPortfolio>, skipped: string[]) {
  const top = portfolio.holdings[0];
  const topLine = top ? `${top.symbol} is ${top.weight_pct.toFixed(0)}% of visible value` : "no holding source is loaded";
  const skippedLine = skipped.length > 0 ? ` ${skipped.length} symbol${skipped.length === 1 ? "" : "s"} did not refresh.` : "";
  return `Review prompt only, not a trade instruction: ${topLine}.${skippedLine}`;
}

function latestMarketTime(rows: DailyReportMarketRow[]) {
  const sorted = rows
    .map((row) => row.fetched_at)
    .filter((value) => !Number.isNaN(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return sorted[0] ?? null;
}

function recordDailyReportAutoRefresh(event: DailyReportAutoRefreshEvent) {
  recordProductMetric({
    event: DAILY_REPORT_AUTO_EVENT,
    surface: "today",
    entity_id: event.report_id,
    value: event.result === "refreshed" ? 1 : 0,
    metadata: {
      auto_refresh: event,
      data_boundary: "Simple daily auto-refresh. Market data only; no news, social, on-chain, brokerage, signing, or fund movement.",
    },
  });
}

function getLatestDailyReportAutoRefreshEvent(): DailyReportAutoRefreshEvent | null {
  for (const event of store().productEvents(100)) {
    if (event.event !== DAILY_REPORT_AUTO_EVENT) continue;
    const autoRefresh = normalizeDailyReportAutoRefreshEvent(
      (event.metadata as { auto_refresh?: unknown } | null)?.auto_refresh,
    );
    if (autoRefresh) return autoRefresh;
  }
  return null;
}

function normalizeDailyReportAutoRefreshEvent(value: unknown): DailyReportAutoRefreshEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as DailyReportAutoRefreshEvent;
  if (
    (event.result !== "refreshed" && event.result !== "skipped_fresh" && event.result !== "failed") ||
    typeof event.checked_at !== "string" ||
    typeof event.run_date !== "string" ||
    typeof event.detail !== "string"
  ) {
    return null;
  }
  return {
    result: event.result,
    checked_at: event.checked_at,
    run_date: event.run_date,
    report_id: typeof event.report_id === "string" ? event.report_id : null,
    detail: event.detail,
  };
}

function isDailyReportFresh(report: DailyReport | null, now: Date) {
  return report?.run_date === isoRunDate(now);
}

function isoRunDate(now: Date) {
  return now.toISOString().slice(0, 10);
}

function nextRefreshAfter(now: Date) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString();
}

function volumeRatioLabel(row: DailyReportMarketRow) {
  return row.volume_ratio === null ? "unknown" : `${row.volume_ratio.toFixed(1)}x recent`;
}

function signedPct(value: number | null) {
  if (value === null) return "unknown";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function pctChange(latest: number, previous: number) {
  if (previous === 0) return null;
  return roundPct(((latest - previous) / previous) * 100);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeDailyReport(value: unknown): DailyReport | null {
  if (!value || typeof value !== "object") return null;
  const report = value as DailyReport;
  if (
    typeof report.id !== "string" ||
    typeof report.run_date !== "string" ||
    typeof report.created_at !== "string" ||
    !report.focus ||
    !Array.isArray(report.ideas) ||
    !Array.isArray(report.market_rows)
  ) {
    return null;
  }
  // Reports saved before Today's plays existed stay readable with an empty list.
  if (!Array.isArray(report.plays)) report.plays = [];
  return report;
}

// --- Today's plays -----------------------------------------------------------
//
// The centerpiece of the briefing: 2-4 concrete, advisory-only suggestions
// built from real local data — the operator's holdings, the day's refreshed
// price/volume rows, and dated market_memory facts. A deterministic rules
// pass always produces plays; when OPENROUTER_API_KEY is present one LLM call
// may rewrite them from the same structured context, validated strictly and
// degrading to the rules output on any failure.

const PLAY_ACTIONS: DailyReportPlayAction[] = ["trim", "add", "hold", "watch"];
const PLAY_HORIZONS: DailyReportPlayHorizon[] = ["days", "weeks", "months"];
const PLAY_CONFIDENCES: DailyReportPlayConfidence[] = ["low", "medium", "high"];
const CONCENTRATION_TRIM_PCT = 25;
const MOVER_THRESHOLD_PCT = 2.5;

/** Recent dated facts from market_memory (engine-written), newest per symbol. */
function recentMemoryFacts(createdAt: string): MarketMemoryFact[] {
  const cutoff = Date.parse(createdAt) - 14 * 24 * 60 * 60_000;
  return store()
    .marketMemoryFacts(100)
    .filter((fact) => fact.symbol && Date.parse(fact.updated_at) >= cutoff && fact.summary.trim().length > 0);
}

function memoryWhy(facts: MarketMemoryFact[], symbol: string): string | null {
  const fact = facts.find((item) => item.symbol?.toUpperCase() === symbol.toUpperCase());
  if (!fact) return null;
  const summary = fact.summary.replace(/\s+/g, " ").trim();
  return `Memory ${fact.updated_at.slice(0, 10)}: ${summary.length > 140 ? `${summary.slice(0, 137)}...` : summary}`;
}

function moveWhy(row: DailyReportMarketRow): string {
  const volume = row.volume_ratio !== null ? ` on ${row.volume_ratio.toFixed(1)}x average volume` : "";
  return `${row.symbol} moved ${signedPct(row.daily_move_pct)} today${volume}.`;
}

function weightWhy(holding: PortfolioHoldingJson): string {
  return `Position is ${holding.weight_pct.toFixed(1)}% of the visible portfolio (${formatUsd(holding.market_value)}).`;
}

export function buildTodaysPlays(input: {
  holdings: PortfolioHoldingJson[];
  rows: DailyReportMarketRow[];
  facts: MarketMemoryFact[];
}): DailyReportPlay[] {
  const { holdings, rows, facts } = input;
  const rowBySymbol = new Map(rows.map((row) => [row.symbol.toUpperCase(), row]));
  const holdingBySymbol = new Map(holdings.map((holding) => [holding.symbol.toUpperCase(), holding]));
  const plays: DailyReportPlay[] = [];
  const used = new Set<string>();

  const push = (play: Omit<DailyReportPlay, "id" | "source">) => {
    const key = play.symbol.toUpperCase();
    if (used.has(key) || plays.length >= 4) return;
    used.add(key);
    plays.push({
      ...play,
      id: `play_${play.action}_${key.toLowerCase()}`,
      why: play.why.filter(Boolean).slice(0, 3),
      source: "rules",
    });
  };

  // 1. Concentration check: the single biggest position, when oversized, is
  //    the highest-value suggestion regardless of today's tape.
  const byWeight = [...holdings].sort((a, b) => b.weight_pct - a.weight_pct);
  const top = byWeight[0];
  if (top && top.weight_pct >= CONCENTRATION_TRIM_PCT) {
    const row = rowBySymbol.get(top.symbol.toUpperCase());
    push({
      symbol: top.symbol,
      action: "trim",
      headline: `Consider trimming ${top.symbol} back toward a smaller share of the portfolio.`,
      why: [
        `${top.symbol} is ${top.weight_pct.toFixed(1)}% of the visible portfolio — a single-name hit there outweighs everything else.`,
        row?.status === "refreshed" ? moveWhy(row) : weightWhy(top),
        memoryWhy(facts, top.symbol) ?? "",
      ],
      horizon: "weeks",
      confidence: "medium",
    });
  }

  // 2. Held movers: today's biggest real moves inside the portfolio.
  const heldMovers = holdings
    .map((holding) => ({ holding, row: rowBySymbol.get(holding.symbol.toUpperCase()) }))
    .filter(
      (entry): entry is { holding: PortfolioHoldingJson; row: DailyReportMarketRow } =>
        entry.row?.status === "refreshed" &&
        entry.row.daily_move_pct !== null &&
        Math.abs(entry.row.daily_move_pct) >= MOVER_THRESHOLD_PCT,
    )
    .sort((a, b) => Math.abs(b.row.daily_move_pct ?? 0) - Math.abs(a.row.daily_move_pct ?? 0));

  for (const { holding, row } of heldMovers) {
    const move = row.daily_move_pct ?? 0;
    const heavyVolume = (row.volume_ratio ?? 0) >= 1.3;
    if (move > 0 && holding.weight_pct >= 15) {
      push({
        symbol: holding.symbol,
        action: "trim",
        headline: `Consider trimming a slice of ${holding.symbol} into today's strength.`,
        why: [moveWhy(row), weightWhy(holding), memoryWhy(facts, holding.symbol) ?? ""],
        horizon: "days",
        confidence: heavyVolume ? "medium" : "low",
      });
    } else if (move < 0 && holding.weight_pct < 10) {
      push({
        symbol: holding.symbol,
        action: "add",
        headline: `If the ${holding.symbol} thesis is intact, today's dip is a spot to add slowly.`,
        why: [moveWhy(row), weightWhy(holding), memoryWhy(facts, holding.symbol) ?? ""],
        horizon: "weeks",
        confidence: "low",
      });
    } else {
      push({
        symbol: holding.symbol,
        action: "hold",
        headline: `Hold ${holding.symbol} through today's move; nothing in the data forces a change.`,
        why: [moveWhy(row), weightWhy(holding), memoryWhy(facts, holding.symbol) ?? ""],
        horizon: "days",
        confidence: heavyVolume ? "medium" : "low",
      });
    }
  }

  // 3. Watchlist movers the operator does not hold: possible entries to watch.
  const watchMovers = rows
    .filter(
      (row) =>
        row.status === "refreshed" &&
        row.daily_move_pct !== null &&
        Math.abs(row.daily_move_pct) >= 3 &&
        !holdingBySymbol.has(row.symbol.toUpperCase()),
    )
    .sort((a, b) => Math.abs(b.daily_move_pct ?? 0) - Math.abs(a.daily_move_pct ?? 0));
  for (const row of watchMovers) {
    push({
      symbol: row.symbol,
      action: "watch",
      headline: `Watch ${row.symbol} for an entry — it moved without you holding any.`,
      why: [moveWhy(row), `No visible position; a paper test is the zero-risk way to check the idea.`, memoryWhy(facts, row.symbol) ?? ""],
      horizon: "days",
      confidence: "low",
    });
  }

  // 4. Quiet-day backfill: always give the operator at least two plays with a
  //    plain reason, even when nothing moved.
  if (plays.length < 2) {
    for (const holding of byWeight) {
      if (plays.length >= 2) break;
      if (used.has(holding.symbol.toUpperCase())) continue;
      const row = rowBySymbol.get(holding.symbol.toUpperCase());
      push({
        symbol: holding.symbol,
        action: "hold",
        headline: `Hold ${holding.symbol}; today's read shows no unusual move to act on.`,
        why: [
          weightWhy(holding),
          row?.status === "refreshed" ? moveWhy(row) : `${holding.symbol} did not refresh from the market source today.`,
          memoryWhy(facts, holding.symbol) ?? "",
        ],
        horizon: "months",
        confidence: "medium",
      });
    }
  }

  return plays;
}

const PLAYS_SYSTEM_PROMPT = [
  "You write the daily 'Today's plays' section for a personal advisory-only financial copilot.",
  "The app can never place trades; every play is a suggestion the operator may act on themselves.",
  "Rules you must follow exactly:",
  "- Use ONLY the data provided (holdings, today's moves/volume, dated memory facts). Never invent prices, news, or facts.",
  "- Suggest, never instruct: 'consider trimming', 'worth watching' — no imperatives to execute, no guarantees of profit.",
  "- Every 'why' line must cite concrete provided data (a move %, a portfolio weight, a dated memory fact).",
  "- Be honest about confidence; one day of price data rarely deserves 'high'.",
  "- Only use symbols that appear in the provided data.",
  "- Output STRICT JSON only, no markdown fences, matching:",
  '{"plays": [{"symbol": "AAPL", "action": "trim|add|hold|watch", "headline": "one advisory sentence",',
  ' "why": ["cites a provided number or dated fact"], "horizon": "days|weeks|months", "confidence": "low|medium|high"}]}',
  "Return 2 to 4 plays.",
].join("\n");

/** Compact structured context: the LLM sees exactly what the rules pass saw. */
export function buildPlaysPrompt(report: DailyReport, holdings: PortfolioHoldingJson[], facts: MarketMemoryFact[]): string {
  const holdingLines = [...holdings]
    .sort((a, b) => b.weight_pct - a.weight_pct)
    .slice(0, 15)
    .map((holding) => `${holding.symbol}: ${holding.weight_pct.toFixed(1)}% of portfolio, ${formatUsd(holding.market_value)}`);
  const rowLines = report.market_rows
    .filter((row) => row.status === "refreshed")
    .map((row) => `${row.symbol}: ${signedPct(row.daily_move_pct)} today, volume ${row.volume_ratio !== null ? `${row.volume_ratio.toFixed(1)}x avg` : "unknown"}`);
  const factLines = facts.slice(0, 10).map((fact) => `${fact.updated_at.slice(0, 10)} ${fact.symbol}: ${fact.summary.replace(/\s+/g, " ").slice(0, 160)}`);
  const rulesPlays = report.plays.map((play) => `${play.action} ${play.symbol} (${play.horizon}, ${play.confidence}): ${play.headline}`);

  return [
    `RUN DATE: ${report.run_date}`,
    `HOLDINGS (weight of visible portfolio):\n${holdingLines.join("\n") || "none"}`,
    `TODAY'S REFRESHED MOVES:\n${rowLines.join("\n") || "none"}`,
    `DATED MEMORY FACTS:\n${factLines.join("\n") || "none"}`,
    `RULES-PASS PLAYS (context, improve on these):\n${rulesPlays.join("\n") || "none"}`,
  ].join("\n\n");
}

/** Strict validation: symbols must exist in the report data, enums must match. */
export function parsePlaysOutput(text: string, allowedSymbols: Set<string>): DailyReportPlay[] | null {
  const candidates = [text.trim()];
  const embedded = text.match(/\{[\s\S]*\}/);
  if (embedded) candidates.push(embedded[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { plays?: unknown };
      if (!Array.isArray(parsed.plays)) continue;
      const plays: DailyReportPlay[] = [];
      for (const raw of parsed.plays) {
        if (!raw || typeof raw !== "object") return null;
        const play = raw as Record<string, unknown>;
        const symbol = typeof play.symbol === "string" ? play.symbol.trim().toUpperCase() : "";
        if (
          !allowedSymbols.has(symbol) ||
          !PLAY_ACTIONS.includes(play.action as DailyReportPlayAction) ||
          !PLAY_HORIZONS.includes(play.horizon as DailyReportPlayHorizon) ||
          !PLAY_CONFIDENCES.includes(play.confidence as DailyReportPlayConfidence) ||
          typeof play.headline !== "string" ||
          play.headline.trim().length === 0 ||
          play.headline.length > 240 ||
          !Array.isArray(play.why) ||
          play.why.length === 0 ||
          !play.why.every((line) => typeof line === "string" && line.trim().length > 0)
        ) {
          return null;
        }
        plays.push({
          id: `play_${play.action}_${symbol.toLowerCase()}`,
          symbol,
          action: play.action as DailyReportPlayAction,
          headline: play.headline.trim(),
          why: (play.why as string[]).map((line) => line.trim()).slice(0, 3),
          horizon: play.horizon as DailyReportPlayHorizon,
          confidence: play.confidence as DailyReportPlayConfidence,
          source: "llm",
        });
      }
      if (plays.length < 2 || plays.length > 4) return null;
      return plays;
    } catch {
      continue;
    }
  }
  return null;
}

async function tryLlmPlays(
  report: DailyReport,
  holdings: PortfolioHoldingJson[],
  complete: PlaysCompletionFn,
): Promise<DailyReportPlay[] | null> {
  try {
    const facts = recentMemoryFacts(report.created_at);
    const allowed = new Set<string>([
      ...report.market_rows.map((row) => row.symbol.toUpperCase()),
      ...holdings.map((holding) => holding.symbol.toUpperCase()),
    ]);
    const text = await complete(PLAYS_SYSTEM_PROMPT, buildPlaysPrompt(report, holdings, facts));
    return parsePlaysOutput(text, allowed);
  } catch {
    return null;
  }
}

/** Env-driven default: one OpenRouter call when a key exists, otherwise none. */
function defaultPlaysCompletion(): PlaysCompletionFn | null {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  return async (systemPrompt, userPrompt) => {
    const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4002",
        "X-OpenRouter-Title": "Master Mold",
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`plays completion ${response.status}`);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("plays completion returned no content");
    return content;
  };
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

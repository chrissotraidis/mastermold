/// <reference types="node" />

/**
 * The daily heartbeat: run the Python engine's staged funnel from the app.
 *
 * `POST /api/scan` (or a scheduler hitting the same path — a Zo Automation, cron,
 * or launchd job can also just run `bin/engine-briefing`) spawns the engine,
 * which fetches market data, screens the watchlist, runs paid agent analysis
 * only for triggered tickers, and writes a dated JSON bundle. The app then
 * ingests the bundle, settles due paper rounds, and refreshes the chat-context
 * snapshot. Every attempt — including failures — is recorded and visible, so a
 * scan that did not happen never silently leaves stale advice on screen.
 *
 * Advisory-only invariant: the engine reads market data and writes JSON. There
 * is no brokerage, wallet, or order path anywhere in this flow.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ageLabel, engineOutDir, getEngineStatus, ingestNewestEngineRun } from "./engine-data";
import { initializeMarketBrain } from "./brain";
import { getMonarchMcpPublicConfig, syncMonarchMcpPortfolio } from "./monarch-mcp";
import { getPortfolio } from "./portfolio";
import { getPortfolioBrainScanContext, type PortfolioBrainScanContext } from "./portfolio-brain";
import { getPortfolioRecommendations, type PortfolioRecommendation } from "./portfolio-recommendations";
import { resolveDueRounds } from "./paper-lifecycle";
import { recordProductMetric } from "./metrics";
import { store } from "./store";

const SCAN_TIMEOUT_MS = 6 * 60 * 1000;

export type ScanAttempt = {
  id: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "failed";
  detail: string;
  run_date: string | null;
  usd: number | null;
  portfolio_sync: ScanPortfolioSync;
  portfolio_context: PortfolioBrainScanContext;
  portfolio_recommendations: ScanPortfolioRecommendation[];
};

export type ScanPortfolioRecommendation = Pick<
  PortfolioRecommendation,
  "symbol" | "classification" | "title" | "detail" | "href" | "source_label" | "data_boundary"
>;

export type ScanPortfolioSync = {
  status: "not_configured" | "synced" | "partial" | "failed";
  source_label: "Monarch MCP";
  attempted_at: string;
  synced_at: string | null;
  message: string;
  data_boundary: string;
};

export type ScanRunResult =
  | {
      ok: true;
      run_date: string;
      usd: number;
      triggered: number;
      cards: number;
      alerts: number;
      detail: string;
      portfolio_sync: ScanPortfolioSync;
      portfolio_context: PortfolioBrainScanContext;
      portfolio_recommendations: ScanPortfolioRecommendation[];
    }
  | {
      ok: false;
      detail: string;
      portfolio_sync: ScanPortfolioSync;
      portfolio_context: PortfolioBrainScanContext;
      portfolio_recommendations: ScanPortfolioRecommendation[];
    };

let inFlight: Promise<ScanRunResult> | null = null;

// Paths are resolved through env-overridable strings (split at runtime) so the
// bundler's static tracer never follows the venv symlink tree at build time.
function enginePythonPath(): string {
  const rel = process.env.MASTERMOLD_ENGINE_PYTHON ?? "engine/.venv/bin/python";
  return join(/* turbopackIgnore: true */ process.cwd(), ...rel.split("/"));
}

function engineWrapperPath(): string {
  const rel = process.env.MASTERMOLD_ENGINE_WRAPPER ?? "bin/engine-briefing";
  return join(/* turbopackIgnore: true */ process.cwd(), ...rel.split("/"));
}

/** True when this machine can run the engine at all (venv or uv present). */
export function scanRunnerAvailable(): boolean {
  return existsSync(enginePythonPath()) || existsSync(engineWrapperPath());
}

export function isScanRunning(): boolean {
  return inFlight !== null;
}

/** Run today's market scan. Concurrent calls share the same run. */
export function runMarketScan(input: { trigger?: string } = {}): Promise<ScanRunResult> {
  if (inFlight) return inFlight;
  inFlight = executeScan(input.trigger ?? "manual").finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function executeScan(trigger: string): Promise<ScanRunResult> {
  const startedAt = new Date().toISOString();
  const runDate = startedAt.slice(0, 10);
  const attemptId = `scan_${Date.now().toString(36)}`;
  const portfolioSync = await syncPortfolioContextForScan(startedAt);
  const portfolioContext = getPortfolioBrainScanContext(new Date());

  recordAttempt({
    id: attemptId,
    trigger,
    started_at: startedAt,
    status: "running",
    detail: `Scan started after portfolio preflight: ${portfolioSync.message} Using ${scanPortfolioContextLine(portfolioContext)}.`,
    run_date: runDate,
    usd: null,
    finished_at: null,
    portfolio_sync: portfolioSync,
    portfolio_context: portfolioContext,
    portfolio_recommendations: [],
  });

  const engine = await spawnEngine(runDate);
  const finishedAt = new Date().toISOString();

  if (!engine.ok) {
    const failureDetail = `${engine.detail} Portfolio context: ${scanPortfolioContextLine(portfolioContext)}.`;
    recordAttempt({
      id: attemptId,
      trigger,
      started_at: startedAt,
      finished_at: finishedAt,
      status: "failed",
      detail: failureDetail,
      run_date: runDate,
      usd: null,
      portfolio_sync: portfolioSync,
      portfolio_context: portfolioContext,
      portfolio_recommendations: [],
    });
    return {
      ok: false,
      detail: failureDetail,
      portfolio_sync: portfolioSync,
      portfolio_context: portfolioContext,
      portfolio_recommendations: [],
    };
  }

  // Ingest the fresh bundle and settle everything that depends on it.
  ingestNewestEngineRun();
  resolveDueRounds();
  try {
    await initializeMarketBrain();
  } catch {
    // Chat-context refresh is best-effort; the scan itself succeeded.
  }

  const status = getEngineStatus();
  const bundle = status.state === "live" ? status.bundle : null;
  const portfolioRecommendations = bundle ? scanPortfolioRecommendations() : [];
  const usd = bundle?.run.cost.usd ?? 0;
  const detail = bundle
    ? `Scan finished: ${bundle.briefing_cards.length} idea(s), ${bundle.alerts.length} alert(s), ${bundle.run.triggered_tickers.length} ticker(s) analyzed, $${usd.toFixed(usd > 0 && usd < 0.01 ? 4 : 2)}.`
    : "Scan finished but no bundle was readable.";

  recordAttempt({
    id: attemptId,
    trigger,
    started_at: startedAt,
    finished_at: finishedAt,
    status: bundle ? "ok" : "failed",
    detail,
    run_date: bundle?.run.run_date ?? runDate,
    usd: bundle ? usd : null,
    portfolio_sync: portfolioSync,
    portfolio_context: portfolioContext,
    portfolio_recommendations: portfolioRecommendations,
  });

  if (!bundle) {
    return {
      ok: false,
      detail,
      portfolio_sync: portfolioSync,
      portfolio_context: portfolioContext,
      portfolio_recommendations: [],
    };
  }
  return {
    ok: true,
    run_date: bundle.run.run_date,
    usd,
    triggered: bundle.run.triggered_tickers.length,
    cards: bundle.briefing_cards.length,
    alerts: bundle.alerts.length,
    detail,
    portfolio_sync: portfolioSync,
    portfolio_context: portfolioContext,
    portfolio_recommendations: portfolioRecommendations,
  };
}

async function syncPortfolioContextForScan(startedAt: string): Promise<ScanPortfolioSync> {
  const config = getMonarchMcpPublicConfig();
  const boundary = "Read-only portfolio preflight. This cannot place brokerage trades, sign transactions, or move funds.";
  if (config.transport === "missing") {
    return {
      status: "not_configured",
      source_label: "Monarch MCP",
      attempted_at: startedAt,
      synced_at: null,
      message: "Monarch MCP is not configured; using the latest saved, manual, or sample portfolio context.",
      data_boundary: boundary,
    };
  }

  const result = await syncMonarchMcpPortfolio();
  if (result.ok && result.snapshot) {
    return {
      status: result.snapshot.status === "partial" ? "partial" : "synced",
      source_label: "Monarch MCP",
      attempted_at: startedAt,
      synced_at: result.snapshot.synced_at,
      message: result.message,
      data_boundary: boundary,
    };
  }

  return {
    status: "failed",
    source_label: "Monarch MCP",
    attempted_at: startedAt,
    synced_at: null,
    message: `${result.message} Continuing with the latest saved, manual, or sample portfolio context.`,
    data_boundary: boundary,
  };
}

const WATCHLIST_MAX_SYMBOLS = 20;
const WATCHLIST_MIN_VALUE_USD = 50;

/**
 * Write the operator's live portfolio as the engine watchlist so the scan
 * screens what is actually held instead of the demo config list. Returns the
 * file path, or null when only sample holdings are visible (new installs keep
 * the seeded demo experience). Cash is excluded (nothing to screen) and dust
 * is skipped to keep the free screener stage focused.
 */
function writePortfolioWatchlist(): string | null {
  try {
    const holdings = getPortfolio().holdings.filter(
      (holding) =>
        holding.source !== "demo" &&
        (holding.asset_class === "equity" || holding.asset_class === "crypto") &&
        holding.market_value >= WATCHLIST_MIN_VALUE_USD,
    );
    if (holdings.length === 0) return null;

    const entries = holdings
      .sort((a, b) => b.market_value - a.market_value)
      .slice(0, WATCHLIST_MAX_SYMBOLS)
      .map((holding) => ({
        symbol: holding.symbol.toUpperCase(),
        asset_id: `asset_${holding.symbol.toLowerCase()}`,
        asset_class: holding.asset_class,
      }));

    const path = join(engineOutDir(), "portfolio-watchlist.json");
    mkdirSync(engineOutDir(), { recursive: true });
    writeFileSync(path, JSON.stringify(entries, null, 2));
    return path;
  } catch {
    return null;
  }
}

function spawnEngine(runDate: string): Promise<{ ok: true } | { ok: false; detail: string }> {
  const root = /* turbopackIgnore: true */ process.cwd();
  const venvPython = enginePythonPath();
  const useVenv = existsSync(venvPython);
  const command = useVenv ? venvPython : engineWrapperPath();
  const args = useVenv
    ? ["-m", "mastermold_engine.run_briefing", "--date", runDate]
    : ["--date", runDate];

  if (!existsSync(command)) {
    return Promise.resolve({
      ok: false,
      detail:
        "Engine is not set up on this machine (engine/.venv missing). See engine/README.md — the app keeps working on the last saved read.",
    });
  }

  const watchlistPath = writePortfolioWatchlist();

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: join(root, "engine"),
      env: {
        ...process.env,
        ...(watchlistPath ? { ENGINE_WATCHLIST_PATH: watchlistPath } : {}),
        ENGINE_OUT_DIR: engineOutDir(),
        // Default to the direct synthesis path for interactive scans: the full
        // TradingAgents graph can stall on un-timeboxed data fetches. Set
        // MASTERMOLD_ENGINE_ADAPTER=auto in the environment to re-enable it.
        MASTERMOLD_ENGINE_ADAPTER: process.env.MASTERMOLD_ENGINE_ADAPTER ?? "direct",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrTail = "";
    let stdoutTail = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-600);
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutTail = (stdoutTail + chunk.toString()).slice(-600);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, detail: "Scan timed out after 6 minutes and was stopped." });
    }, SCAN_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: `Scan could not start: ${error.message}` });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else
        resolve({
          ok: false,
          detail: `Scan exited with code ${code}. ${lastLine(stderrTail) || lastLine(stdoutTail) || "No output captured."}`,
        });
    });
  });
}

function lastLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .pop() ?? ""
  );
}

function recordAttempt(attempt: ScanAttempt) {
  recordProductMetric({
    event: "scan_attempt",
    surface: "today",
    entity_id: attempt.id,
    value: attempt.status === "ok" ? 1 : 0,
    metadata: { ...attempt },
  });
}

/** Recent scan attempts (newest first), including failures, for honest run history. */
export function getScanAttempts(limit = 10): ScanAttempt[] {
  const seen = new Map<string, ScanAttempt>();
  for (const event of store().productEvents(200)) {
    if (event.event !== "scan_attempt") continue;
    const meta = event.metadata as Partial<ScanAttempt> | null;
    if (!meta || typeof meta !== "object" || typeof meta.id !== "string") continue;
    // productEvents is newest-first; keep the latest record per attempt id.
    if (!seen.has(meta.id)) {
      seen.set(meta.id, {
        id: meta.id,
        trigger: meta.trigger ?? "manual",
        started_at: meta.started_at ?? event.created_at,
        finished_at: meta.finished_at ?? null,
        status: meta.status === "ok" || meta.status === "failed" ? meta.status : "running",
        detail: meta.detail ?? "",
        run_date: meta.run_date ?? null,
        usd: typeof meta.usd === "number" ? meta.usd : null,
        portfolio_sync: normalizeScanPortfolioSync(meta.portfolio_sync),
        portfolio_context: normalizePortfolioScanContext(meta.portfolio_context),
        portfolio_recommendations: normalizeScanPortfolioRecommendations(meta.portfolio_recommendations),
      });
    }
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

function scanPortfolioRecommendations(): ScanPortfolioRecommendation[] {
  return getPortfolioRecommendations(null, 6).map((recommendation) => ({
    symbol: recommendation.symbol,
    classification: recommendation.classification,
    title: recommendation.title,
    detail: recommendation.detail,
    href: recommendation.href,
    source_label: recommendation.source_label,
    data_boundary: recommendation.data_boundary,
  }));
}

function scanPortfolioContextLine(context: PortfolioBrainScanContext) {
  if (context.status === "not_synced") return "no portfolio source";
  if (context.status === "manual") {
    return `manual holdings, ${context.holdings_count} holding${context.holdings_count === 1 ? "" : "s"}`;
  }
  if (context.status === "imported") {
    return `imported holdings snapshot, ${context.holdings_count} holding${context.holdings_count === 1 ? "" : "s"}, ${context.accounts_count} account${context.accounts_count === 1 ? "" : "s"}`;
  }
  if (context.status === "sample") {
    return `sample fallback holdings, ${context.holdings_count} holding${context.holdings_count === 1 ? "" : "s"}`;
  }
  const freshness = context.status === "stale" ? "stale" : context.status === "partial" ? "partial" : "fresh";
  return `${freshness} ${context.source_label === "Monarch MCP" ? "Monarch snapshot" : context.source_label.toLowerCase()}, ${context.holdings_count} holding${context.holdings_count === 1 ? "" : "s"}, ${context.accounts_count} account${context.accounts_count === 1 ? "" : "s"}`;
}

function normalizeScanPortfolioSync(value: unknown): ScanPortfolioSync {
  const object = value && typeof value === "object" ? value as Partial<ScanPortfolioSync> : {};
  const status = object.status === "not_configured" ||
    object.status === "synced" ||
    object.status === "partial" ||
    object.status === "failed"
    ? object.status
    : "not_configured";
  return {
    status,
    source_label: "Monarch MCP",
    attempted_at: typeof object.attempted_at === "string" ? object.attempted_at : new Date(0).toISOString(),
    synced_at: typeof object.synced_at === "string" ? object.synced_at : null,
    message: typeof object.message === "string"
      ? object.message
      : "No portfolio sync preflight was recorded for this older scan attempt.",
    data_boundary: typeof object.data_boundary === "string"
      ? object.data_boundary
      : "Read-only portfolio preflight. This cannot place brokerage trades, sign transactions, or move funds.",
  };
}

function normalizePortfolioScanContext(value: unknown): PortfolioBrainScanContext {
  const object = value && typeof value === "object" ? value as Partial<PortfolioBrainScanContext> : {};
  const status = object.status === "fresh" ||
    object.status === "stale" ||
    object.status === "partial" ||
    object.status === "not_synced" ||
    object.status === "manual" ||
    object.status === "imported" ||
    object.status === "sample"
    ? object.status
    : "not_synced";
  return {
    source_label: isPortfolioScanSourceLabel(object.source_label) ? object.source_label : "Monarch MCP",
    status,
    data_boundary: typeof object.data_boundary === "string" ? object.data_boundary : "No portfolio scan context was recorded.",
    synced_at: typeof object.synced_at === "string" ? object.synced_at : null,
    as_of: typeof object.as_of === "string" ? object.as_of : null,
    accounts_count: typeof object.accounts_count === "number" ? object.accounts_count : 0,
    holdings_count: typeof object.holdings_count === "number" ? object.holdings_count : 0,
    total_value: typeof object.total_value === "number" ? object.total_value : 0,
    top_symbols: Array.isArray(object.top_symbols) ? object.top_symbols.filter((item): item is string => typeof item === "string") : [],
    change_summary: {
      status: object.change_summary?.status === "no_snapshot" ||
        object.change_summary?.status === "no_previous" ||
        object.change_summary?.status === "unchanged" ||
        object.change_summary?.status === "changed"
        ? object.change_summary.status
        : "no_snapshot",
      detail: typeof object.change_summary?.detail === "string"
        ? object.change_summary.detail
        : "No portfolio change summary was recorded.",
      top_changes: Array.isArray(object.change_summary?.top_changes)
        ? object.change_summary.top_changes.filter((item): item is PortfolioBrainScanContext["change_summary"]["top_changes"][number] =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as { symbol?: unknown }).symbol === "string" &&
            typeof (item as { value_delta?: unknown }).value_delta === "number" &&
            ["added", "removed", "increased", "decreased"].includes(String((item as { direction?: unknown }).direction)) &&
            typeof (item as { detail?: unknown }).detail === "string",
          )
        : [],
    },
    suggestion_classes: normalizeSuggestionClasses(object.suggestion_classes),
  };
}

function isPortfolioScanSourceLabel(value: unknown): value is PortfolioBrainScanContext["source_label"] {
  return value === "Monarch MCP" ||
    value === "Manual holdings" ||
    value === "Imported holdings" ||
    value === "Sample fallback";
}

function normalizeSuggestionClasses(value: unknown): PortfolioBrainScanContext["suggestion_classes"] {
  if (!Array.isArray(value)) return ["Review", "Watch", "Trim candidate", "Add candidate", "Paper test first"];
  const classes = value.filter((item): item is PortfolioBrainScanContext["suggestion_classes"][number] =>
    item === "Review" ||
    item === "Watch" ||
    item === "Trim candidate" ||
    item === "Add candidate" ||
    item === "Paper test first",
  );
  return classes.length > 0 ? classes : ["Review", "Watch", "Trim candidate", "Add candidate", "Paper test first"];
}

function normalizeScanPortfolioRecommendations(value: unknown): ScanPortfolioRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const object = item as Partial<ScanPortfolioRecommendation>;
      if (
        typeof object.symbol !== "string" ||
        typeof object.title !== "string" ||
        typeof object.detail !== "string" ||
        typeof object.href !== "string" ||
        typeof object.data_boundary !== "string" ||
        !isScanRecommendationClass(object.classification) ||
        !isScanRecommendationSource(object.source_label)
      ) {
        return null;
      }
      return {
        symbol: object.symbol,
        classification: object.classification,
        title: object.title,
        detail: object.detail,
        href: object.href,
        source_label: object.source_label,
        data_boundary: object.data_boundary,
      };
    })
    .filter((item): item is ScanPortfolioRecommendation => item !== null);
}

function isScanRecommendationClass(value: unknown): value is ScanPortfolioRecommendation["classification"] {
  return value === "Review" ||
    value === "Watch" ||
    value === "Trim candidate" ||
    value === "Add candidate" ||
    value === "Paper test first";
}

function isScanRecommendationSource(value: unknown): value is ScanPortfolioRecommendation["source_label"] {
  return value === "Saved read" || value === "Sample market context" || value === "Portfolio";
}

/** One-line scan status for headers: last attempt + read age. */
export function getScanStatusLine(): string {
  const status = getEngineStatus();
  const lastAttempt = getScanAttempts(1)[0] ?? null;
  if (status.state === "live") {
    const age = ageLabel(status.ageHours);
    if (lastAttempt?.status === "failed") {
      return `Last scan attempt failed; showing the read from ${age}.`;
    }
    return `Market read from ${age}.`;
  }
  if (lastAttempt?.status === "failed") return "Last scan attempt failed; showing sample data.";
  return "No market scan saved yet.";
}

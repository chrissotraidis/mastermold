import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type Web3MarketMonitorHistoryStatus = "absent" | "active" | "degraded" | "blocked";

export type Web3MarketMonitorHistoryEntry = {
  mode: "web3-market-monitor-history-entry";
  paper_only: true;
  status: "recorded" | "observed" | "blocked" | "error";
  finished_at: string;
  scenario: "base" | "breakout" | "rug-risk";
  source: "sample" | "live-dex";
  account: "ephemeral" | "persistent";
  discovery_status: string;
  scanner_status: string;
  selected_symbol: string;
  selected_pair: string | null;
  discovery_refresh_attempted: boolean;
  candle_count: number;
  candle_action: string;
  candle_confidence: number;
  paper_action: string;
  paper_notional_usd: number;
  recorded_candle_status: string;
  recorded_conviction_status: string;
  provider_degraded: boolean;
  provider_error: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  summary: string;
  next_action: string;
};

export type Web3MarketMonitorHistory = {
  mode: "web3-market-monitor-history";
  paper_only: true;
  status: Web3MarketMonitorHistoryStatus;
  updated_at: string | null;
  run_count: number;
  recent_runs: Web3MarketMonitorHistoryEntry[];
  latest_symbol: string | null;
  latest_action: string;
  latest_confidence: number;
  degraded_count: number;
  recorded_count: number;
  summary: string;
  next_action: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

const STATUSES: Web3MarketMonitorHistoryEntry["status"][] = ["recorded", "observed", "blocked", "error"];
const SCENARIOS: Web3MarketMonitorHistoryEntry["scenario"][] = ["base", "breakout", "rug-risk"];
const SOURCES: Web3MarketMonitorHistoryEntry["source"][] = ["sample", "live-dex"];
const ACCOUNTS: Web3MarketMonitorHistoryEntry["account"][] = ["ephemeral", "persistent"];

export function web3MarketMonitorHistoryPath() {
  return process.env.WEB3_MARKET_MONITOR_HISTORY_PATH || join(process.cwd(), "data", "web3-market-monitor-history.json");
}

export function getWeb3MarketMonitorHistory(path?: string): Web3MarketMonitorHistory {
  const recentRuns = readWeb3MarketMonitorHistory(path).slice(-24);
  const latest = recentRuns[recentRuns.length - 1] ?? null;
  const degradedCount = recentRuns.filter((run) => run.provider_degraded || run.status === "error").length;
  const recordedCount = recentRuns.filter((run) => run.status === "recorded").length;
  const status = monitorHistoryStatus(recentRuns, latest);

  return {
    mode: "web3-market-monitor-history",
    paper_only: true,
    status,
    updated_at: latest?.finished_at ?? null,
    run_count: recentRuns.length,
    recent_runs: recentRuns.slice(-8),
    latest_symbol: latest?.selected_symbol ?? null,
    latest_action: latest?.paper_action ?? "none",
    latest_confidence: latest?.candle_confidence ?? 0,
    degraded_count: degradedCount,
    recorded_count: recordedCount,
    summary: monitorHistorySummary(status, latest, recentRuns.length, degradedCount),
    next_action: latest?.next_action ?? "Run npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json to collect read-only market proof.",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

export function writeWeb3MarketMonitorHistoryEntry(value: unknown, path = web3MarketMonitorHistoryPath()) {
  const entry = sanitizeWeb3MarketMonitorHistoryEntry(value);
  if (!entry) return null;
  const current = readWeb3MarketMonitorHistory(path);
  const deduped = current.filter((item) => !(item.finished_at === entry.finished_at && item.selected_symbol === entry.selected_symbol));
  const next = [...deduped, entry].slice(-24);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({
    mode: "web3-market-monitor-history",
    paper_only: true,
    updated_at: entry.finished_at,
    runs: next,
  }, null, 2)}\n`);
  return entry;
}

function readWeb3MarketMonitorHistory(path?: string): Web3MarketMonitorHistoryEntry[] {
  const candidates = path ? [path] : web3MarketMonitorHistoryCandidatePaths();
  const entries = candidates
    .flatMap((candidate) => readHistoryFile(candidate))
    .sort((a, b) => Date.parse(a.finished_at) - Date.parse(b.finished_at));
  return dedupeHistory(entries).slice(-24);
}

function web3MarketMonitorHistoryCandidatePaths() {
  if (process.env.WEB3_MARKET_MONITOR_HISTORY_PATH) return [process.env.WEB3_MARKET_MONITOR_HISTORY_PATH];
  const cwdPath = web3MarketMonitorHistoryPath();
  const parentWorkspacePath = resolve(process.cwd(), "..", "..", "data", "web3-market-monitor-history.json");
  const repoPath = join(dirname(process.cwd()), "data", "web3-market-monitor-history.json");
  return [...new Set([cwdPath, parentWorkspacePath, repoPath])];
}

function readHistoryFile(path: string) {
  try {
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const parsedRecord = parsed && typeof parsed === "object" ? parsed as { runs?: unknown } : null;
    const rows: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsedRecord?.runs) ? parsedRecord.runs : [];
    return rows
      .map(sanitizeWeb3MarketMonitorHistoryEntry)
      .filter((item): item is Web3MarketMonitorHistoryEntry => Boolean(item));
  } catch {
    return [];
  }
}

function sanitizeWeb3MarketMonitorHistoryEntry(value: unknown): Web3MarketMonitorHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Web3MarketMonitorHistoryEntry>;
  const status = STATUSES.includes(row.status as Web3MarketMonitorHistoryEntry["status"])
    ? row.status as Web3MarketMonitorHistoryEntry["status"]
    : null;
  if (!status) return null;
  if (row.live_execution_permission !== "blocked" || row.wallet_mutation_permission !== "blocked") return null;
  if (row.transaction_submission_permission !== "blocked" || row.secret_echo_permission !== "blocked") return null;
  if ("private_key_storage" in row && row.private_key_storage !== "blocked") return null;
  if ("seed_phrase_storage" in row && row.seed_phrase_storage !== "blocked") return null;

  return {
    mode: "web3-market-monitor-history-entry",
    paper_only: true,
    status,
    finished_at: cleanIso(row.finished_at),
    scenario: SCENARIOS.includes(row.scenario as Web3MarketMonitorHistoryEntry["scenario"])
      ? row.scenario as Web3MarketMonitorHistoryEntry["scenario"]
      : "breakout",
    source: SOURCES.includes(row.source as Web3MarketMonitorHistoryEntry["source"])
      ? row.source as Web3MarketMonitorHistoryEntry["source"]
      : "live-dex",
    account: ACCOUNTS.includes(row.account as Web3MarketMonitorHistoryEntry["account"])
      ? row.account as Web3MarketMonitorHistoryEntry["account"]
      : "persistent",
    discovery_status: cleanText(row.discovery_status, "unknown", 80),
    scanner_status: cleanText(row.scanner_status, "unknown", 80),
    selected_symbol: cleanSymbol(row.selected_symbol),
    selected_pair: cleanText(row.selected_pair, "", 96) || null,
    discovery_refresh_attempted: row.discovery_refresh_attempted === true,
    candle_count: cleanCount(row.candle_count),
    candle_action: cleanText(row.candle_action, "unknown", 80),
    candle_confidence: cleanScore(row.candle_confidence),
    paper_action: cleanText(row.paper_action, "unknown", 80),
    paper_notional_usd: cleanMoney(row.paper_notional_usd),
    recorded_candle_status: cleanText(row.recorded_candle_status, "not-recorded", 80),
    recorded_conviction_status: cleanText(row.recorded_conviction_status, "not-recorded", 80),
    provider_degraded: row.provider_degraded === true,
    provider_error: redactSecretText(row.provider_error, 180),
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    summary: redactSecretText(row.summary, 260) || "Read-only market monitor receipt is available.",
    next_action: redactSecretText(row.next_action, 260) || "Review market monitor history before extending the paper loop.",
  };
}

function monitorHistoryStatus(
  runs: Web3MarketMonitorHistoryEntry[],
  latest: Web3MarketMonitorHistoryEntry | null,
): Web3MarketMonitorHistoryStatus {
  if (!latest || runs.length === 0) return "absent";
  if (latest.status === "blocked" || latest.live_execution_permission !== "blocked") return "blocked";
  if (latest.provider_degraded || latest.status === "error") return "degraded";
  return "active";
}

function monitorHistorySummary(
  status: Web3MarketMonitorHistoryStatus,
  latest: Web3MarketMonitorHistoryEntry | null,
  runCount: number,
  degradedCount: number,
) {
  if (!latest) return "No read-only Web3 market monitor history has been written yet.";
  if (status === "degraded") return `${latest.selected_symbol} monitor evidence is degraded; ${degradedCount}/${runCount} recent run${runCount === 1 ? "" : "s"} need provider recovery.`;
  if (status === "blocked") return "Market monitor history found a blocked receipt; keep live trading locked and review the latest run.";
  return `${latest.selected_symbol} monitor history is active with ${runCount} recent read-only run${runCount === 1 ? "" : "s"}.`;
}

function dedupeHistory(entries: Web3MarketMonitorHistoryEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.finished_at}:${entry.selected_symbol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanIso(value: unknown) {
  const date = new Date(typeof value === "string" ? value : "");
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function cleanText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return (text || fallback).replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanSymbol(value: unknown) {
  return cleanText(value, "UNKNOWN", 32).replace(/[^A-Za-z0-9_$.-]/g, "").slice(0, 32) || "UNKNOWN";
}

function cleanCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100_000, Math.round(parsed))) : 0;
}

function cleanScore(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}

function cleanMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function redactSecretText(value: unknown, maxLength: number) {
  return cleanText(value, "", maxLength)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[redacted-id]")
    .replace(/api[-_ ]?key=[^&\s]+/gi, "api-key=[redacted]")
    .replace(/(HELIUS_API_KEY|JUPITER_API_KEY)=\S+/gi, "$1=[redacted]");
}

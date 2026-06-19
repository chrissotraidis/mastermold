import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  Web3JupiterRehearsalReceipt,
  Web3JupiterRehearsalReceiptStatus,
} from "./web3-jupiter-rehearsal";

export type Web3JupiterRehearsalHistoryStatus = "absent" | "order-ready" | "gated" | "blocked";

export type Web3JupiterRehearsalHistoryEntry = {
  mode: "web3-jupiter-rehearsal-history-entry";
  paper_only: true;
  status: Web3JupiterRehearsalReceiptStatus;
  generated_at: string;
  key_source: "one-shot" | "server-env" | "missing";
  one_shot_key_used: boolean;
  server_key_configured: boolean;
  wallet_public_key_preview: string | null;
  wallet_valid: boolean;
  jupiter_quote_ready: boolean;
  jupiter_order_ready: boolean;
  order_request_hash: string | null;
  transaction_body_detected: boolean;
  max_slippage_bps: number;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  transaction_body_storage: "blocked";
  unsigned_transaction_return: "withheld";
  secret_echo_permission: "blocked";
  narrative: string;
  next_action: string;
};

export type Web3JupiterRehearsalHistory = {
  mode: "web3-jupiter-rehearsal-history";
  paper_only: true;
  status: Web3JupiterRehearsalHistoryStatus;
  updated_at: string | null;
  run_count: number;
  recent_runs: Web3JupiterRehearsalHistoryEntry[];
  latest_status: Web3JupiterRehearsalReceiptStatus | null;
  latest_wallet_preview: string | null;
  latest_order_ready: boolean;
  latest_quote_ready: boolean;
  transaction_body_detected_count: number;
  summary: string;
  next_action: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  transaction_body_storage: "blocked";
  unsigned_transaction_return: "withheld";
  secret_echo_permission: "blocked";
};

const STATUSES: Web3JupiterRehearsalReceiptStatus[] = [
  "order-ready",
  "quote-ready",
  "key-gated",
  "wallet-gated",
  "order-gated",
  "blocked",
];

export function web3JupiterRehearsalHistoryPath() {
  return process.env.WEB3_JUPITER_REHEARSAL_HISTORY_PATH || join(process.cwd(), "data", "web3-jupiter-rehearsal-history.json");
}

export function getWeb3JupiterRehearsalHistory(path?: string): Web3JupiterRehearsalHistory {
  const recentRuns = readWeb3JupiterRehearsalHistory(path).slice(-24);
  const latest = recentRuns[recentRuns.length - 1] ?? null;
  const bodyDetectedCount = recentRuns.filter((run) => run.transaction_body_detected).length;
  const status = jupiterHistoryStatus(latest);
  return {
    mode: "web3-jupiter-rehearsal-history",
    paper_only: true,
    status,
    updated_at: latest?.generated_at ?? null,
    run_count: recentRuns.length,
    recent_runs: recentRuns.slice(-8),
    latest_status: latest?.status ?? null,
    latest_wallet_preview: latest?.wallet_public_key_preview ?? null,
    latest_order_ready: latest?.jupiter_order_ready ?? false,
    latest_quote_ready: latest?.jupiter_quote_ready ?? false,
    transaction_body_detected_count: bodyDetectedCount,
    summary: jupiterHistorySummary(status, latest, recentRuns.length),
    next_action: latest?.next_action ?? "Run a redacted Jupiter rehearsal after adding JUPITER_API_KEY and a dedicated public wallet.",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    private_key_storage: "blocked",
    transaction_body_storage: "blocked",
    unsigned_transaction_return: "withheld",
    secret_echo_permission: "blocked",
  };
}

export function writeWeb3JupiterRehearsalHistoryEntry(
  receipt: Web3JupiterRehearsalReceipt,
  path = web3JupiterRehearsalHistoryPath(),
) {
  const entry = receiptToHistoryEntry(receipt);
  if (!entry) return null;
  const current = readWeb3JupiterRehearsalHistory(path);
  const deduped = current.filter((item) => !(item.generated_at === entry.generated_at && item.status === entry.status));
  const next = [...deduped, entry].slice(-24);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({
    mode: "web3-jupiter-rehearsal-history",
    paper_only: true,
    updated_at: entry.generated_at,
    runs: next,
  }, null, 2)}\n`);
  return entry;
}

function readWeb3JupiterRehearsalHistory(path?: string): Web3JupiterRehearsalHistoryEntry[] {
  const candidates = path ? [path] : web3JupiterRehearsalHistoryCandidatePaths();
  const entries = candidates
    .flatMap((candidate) => readHistoryFile(candidate))
    .sort((a, b) => Date.parse(a.generated_at) - Date.parse(b.generated_at));
  return dedupeHistory(entries).slice(-24);
}

function web3JupiterRehearsalHistoryCandidatePaths() {
  if (process.env.WEB3_JUPITER_REHEARSAL_HISTORY_PATH) return [process.env.WEB3_JUPITER_REHEARSAL_HISTORY_PATH];
  const cwdPath = web3JupiterRehearsalHistoryPath();
  const parentWorkspacePath = resolve(process.cwd(), "..", "..", "data", "web3-jupiter-rehearsal-history.json");
  const repoPath = join(dirname(process.cwd()), "data", "web3-jupiter-rehearsal-history.json");
  return [...new Set([cwdPath, parentWorkspacePath, repoPath])];
}

function readHistoryFile(path: string) {
  try {
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const parsedRecord = parsed && typeof parsed === "object" ? parsed as { runs?: unknown } : null;
    const rows: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsedRecord?.runs) ? parsedRecord.runs : [];
    return rows
      .map(sanitizeHistoryEntry)
      .filter((item): item is Web3JupiterRehearsalHistoryEntry => Boolean(item));
  } catch {
    return [];
  }
}

function receiptToHistoryEntry(receipt: Web3JupiterRehearsalReceipt): Web3JupiterRehearsalHistoryEntry | null {
  if (receipt.live_execution_permission !== "blocked" || receipt.wallet_mutation_permission !== "blocked") return null;
  if (receipt.secret_echo_permission !== "blocked" || receipt.private_key_storage !== "blocked") return null;
  if (receipt.transaction_body_storage !== "blocked" || receipt.unsigned_transaction_return !== "withheld") return null;
  return sanitizeHistoryEntry({
    mode: "web3-jupiter-rehearsal-history-entry",
    paper_only: true,
    status: receipt.status,
    generated_at: receipt.generated_at,
    key_source: receipt.key_source,
    one_shot_key_used: receipt.one_shot_key_used,
    server_key_configured: receipt.server_key_configured,
    wallet_public_key_preview: receipt.wallet_public_key_preview,
    wallet_valid: receipt.summary.wallet_valid,
    jupiter_quote_ready: receipt.summary.jupiter_quote_ready,
    jupiter_order_ready: receipt.summary.jupiter_order_ready,
    order_request_hash: receipt.summary.order_request_hash,
    transaction_body_detected: receipt.summary.transaction_body_detected,
    max_slippage_bps: receipt.summary.max_slippage_bps,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    private_key_storage: "blocked",
    transaction_body_storage: "blocked",
    unsigned_transaction_return: "withheld",
    secret_echo_permission: "blocked",
    narrative: receipt.narrative,
    next_action: receipt.next_action,
  });
}

function sanitizeHistoryEntry(value: unknown): Web3JupiterRehearsalHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Web3JupiterRehearsalHistoryEntry>;
  const status = STATUSES.includes(row.status as Web3JupiterRehearsalReceiptStatus)
    ? row.status as Web3JupiterRehearsalReceiptStatus
    : null;
  if (!status) return null;
  if (row.live_execution_permission !== "blocked" || row.wallet_mutation_permission !== "blocked") return null;
  if (row.transaction_submission_permission !== "blocked" || row.secret_echo_permission !== "blocked") return null;
  if (row.private_key_storage !== "blocked" || row.transaction_body_storage !== "blocked") return null;
  if (row.unsigned_transaction_return !== "withheld") return null;
  return {
    mode: "web3-jupiter-rehearsal-history-entry",
    paper_only: true,
    status,
    generated_at: cleanIso(row.generated_at),
    key_source: row.key_source === "one-shot" || row.key_source === "server-env" ? row.key_source : "missing",
    one_shot_key_used: row.one_shot_key_used === true,
    server_key_configured: row.server_key_configured === true,
    wallet_public_key_preview: cleanText(row.wallet_public_key_preview, "", 80) || null,
    wallet_valid: row.wallet_valid === true,
    jupiter_quote_ready: row.jupiter_quote_ready === true,
    jupiter_order_ready: row.jupiter_order_ready === true,
    order_request_hash: cleanHash(row.order_request_hash),
    transaction_body_detected: row.transaction_body_detected === true,
    max_slippage_bps: cleanBoundedCount(row.max_slippage_bps, 1, 250),
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    private_key_storage: "blocked",
    transaction_body_storage: "blocked",
    unsigned_transaction_return: "withheld",
    secret_echo_permission: "blocked",
    narrative: cleanText(row.narrative, "Jupiter rehearsal history is available.", 260),
    next_action: cleanText(row.next_action, "Review Jupiter rehearsal history before signer work.", 260),
  };
}

function jupiterHistoryStatus(latest: Web3JupiterRehearsalHistoryEntry | null): Web3JupiterRehearsalHistoryStatus {
  if (!latest) return "absent";
  if (latest.status === "order-ready") return "order-ready";
  if (latest.status === "blocked") return "blocked";
  return "gated";
}

function jupiterHistorySummary(
  status: Web3JupiterRehearsalHistoryStatus,
  latest: Web3JupiterRehearsalHistoryEntry | null,
  runCount: number,
) {
  if (!latest) return "No redacted Jupiter rehearsal history has been written yet.";
  if (status === "order-ready") return `Latest Jupiter rehearsal is order-ready with transaction bytes withheld across ${runCount} recent run${runCount === 1 ? "" : "s"}.`;
  if (status === "blocked") return "Latest Jupiter rehearsal is blocked before order proof; keep live execution locked.";
  return `Latest Jupiter rehearsal is ${latest.status.replaceAll("-", " ")}; quote/order proof still needs the missing credential or wallet lane.`;
}

function dedupeHistory(entries: Web3JupiterRehearsalHistoryEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.generated_at}:${entry.status}:${entry.wallet_public_key_preview ?? "no-wallet"}`;
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
  return redactSecretText(text || fallback).replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanHash(value: unknown) {
  const text = cleanText(value, "", 128);
  return /^[a-f0-9]{32,128}$/i.test(text) ? text : null;
}

function cleanBoundedCount(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : min;
}

function redactSecretText(value: string) {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[redacted-id]")
    .replace(/api[-_ ]?key=[^&\s]+/gi, "api-key=[redacted]")
    .replace(/(HELIUS_API_KEY|JUPITER_API_KEY)=\S+/gi, "$1=[redacted]");
}

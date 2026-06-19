import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Web3DaemonSupervisorStatus =
  | "absent"
  | "running"
  | "idle"
  | "completed"
  | "circuit-open"
  | "error";

export type Web3DaemonSupervisorReceipt = {
  mode: "web3-daemon-supervisor";
  status: Exclude<Web3DaemonSupervisorStatus, "absent">;
  runner_id: string;
  base_url: string;
  scenario: "base" | "breakout" | "rug-risk";
  source: "sample" | "live-dex";
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  paper_only: true;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  round: number;
  requested_rounds: number;
  ticks_per_round: number;
  posted_ticks: number;
  blocked_ticks: number;
  dry_run_ticks: number;
  route_refresh_requests: number;
  consecutive_blocked_rounds: number;
  consecutive_error_rounds: number;
  max_consecutive_blocked_rounds: number;
  max_consecutive_error_rounds: number;
  last_event_status: string;
  last_event_action: string;
  last_equity_usd: number | null;
  stop_reason: string | null;
  next_action: string;
  controls: string[];
};

export type Web3DaemonSupervisorHealth = {
  status: Web3DaemonSupervisorStatus;
  updated_at: string | null;
  runner_id: string | null;
  summary: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
};

const STATUSES: Web3DaemonSupervisorReceipt["status"][] = [
  "running",
  "idle",
  "completed",
  "circuit-open",
  "error",
];

const SCENARIOS: Web3DaemonSupervisorReceipt["scenario"][] = ["base", "breakout", "rug-risk"];
const SOURCES: Web3DaemonSupervisorReceipt["source"][] = ["sample", "live-dex"];

export function web3DaemonSupervisorReceiptPath() {
  return process.env.WEB3_DAEMON_SUPERVISOR_STATUS_PATH || join(process.cwd(), "data", "web3-daemon-supervisor.json");
}

export function getWeb3DaemonSupervisorReceipt(path = web3DaemonSupervisorReceiptPath()): Web3DaemonSupervisorReceipt | null {
  try {
    if (!existsSync(path)) return null;
    return sanitizeWeb3DaemonSupervisorReceipt(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function getWeb3DaemonSupervisorHealth(path = web3DaemonSupervisorReceiptPath()): Web3DaemonSupervisorHealth {
  const receipt = getWeb3DaemonSupervisorReceipt(path);
  if (!receipt) {
    return {
      status: "absent",
      updated_at: null,
      runner_id: null,
      summary: "No local Web3 daemon supervisor receipt has been written yet.",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    };
  }

  return {
    status: receipt.status,
    updated_at: receipt.updated_at,
    runner_id: receipt.runner_id,
    summary: web3DaemonSupervisorSummary(receipt),
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
  };
}

function sanitizeWeb3DaemonSupervisorReceipt(value: unknown): Web3DaemonSupervisorReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Web3DaemonSupervisorReceipt>;
  if (row.mode !== "web3-daemon-supervisor") return null;
  if (!STATUSES.includes(row.status as Web3DaemonSupervisorReceipt["status"])) return null;

  return {
    mode: "web3-daemon-supervisor",
    status: row.status as Web3DaemonSupervisorReceipt["status"],
    runner_id: cleanText(row.runner_id, "web3-supervisor", 80),
    base_url: cleanText(row.base_url, "http://localhost:4010", 200),
    scenario: SCENARIOS.includes(row.scenario as Web3DaemonSupervisorReceipt["scenario"])
      ? row.scenario as Web3DaemonSupervisorReceipt["scenario"]
      : "breakout",
    source: SOURCES.includes(row.source as Web3DaemonSupervisorReceipt["source"])
      ? row.source as Web3DaemonSupervisorReceipt["source"]
      : "sample",
    started_at: cleanIso(row.started_at),
    updated_at: cleanIso(row.updated_at),
    finished_at: row.finished_at && typeof row.finished_at === "string" && !Number.isNaN(Date.parse(row.finished_at))
      ? new Date(row.finished_at).toISOString()
      : null,
    paper_only: true,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    round: cleanCount(row.round),
    requested_rounds: cleanCount(row.requested_rounds),
    ticks_per_round: cleanCount(row.ticks_per_round),
    posted_ticks: cleanCount(row.posted_ticks),
    blocked_ticks: cleanCount(row.blocked_ticks),
    dry_run_ticks: cleanCount(row.dry_run_ticks),
    route_refresh_requests: cleanCount(row.route_refresh_requests),
    consecutive_blocked_rounds: cleanCount(row.consecutive_blocked_rounds),
    consecutive_error_rounds: cleanCount(row.consecutive_error_rounds),
    max_consecutive_blocked_rounds: cleanCount(row.max_consecutive_blocked_rounds),
    max_consecutive_error_rounds: cleanCount(row.max_consecutive_error_rounds),
    last_event_status: cleanText(row.last_event_status, "unknown", 80),
    last_event_action: cleanText(row.last_event_action, "none", 240),
    last_equity_usd: typeof row.last_equity_usd === "number" && Number.isFinite(row.last_equity_usd)
      ? row.last_equity_usd
      : null,
    stop_reason: row.stop_reason ? cleanText(row.stop_reason, "stopped", 240) : null,
    next_action: cleanText(row.next_action, "Start the supervisor to record autonomous paper daemon health.", 320),
    controls: Array.isArray(row.controls)
      ? row.controls.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, "", 260)).filter(Boolean).slice(0, 6)
      : supervisorControls(),
  };
}

function web3DaemonSupervisorSummary(receipt: Web3DaemonSupervisorReceipt) {
  if (receipt.status === "circuit-open") {
    return `Supervisor circuit is open after ${receipt.consecutive_blocked_rounds} blocked and ${receipt.consecutive_error_rounds} error round${receipt.consecutive_error_rounds === 1 ? "" : "s"}.`;
  }
  if (receipt.status === "error") return receipt.stop_reason ?? "Supervisor stopped after an error.";
  if (receipt.status === "completed") return `Supervisor completed ${receipt.round}/${receipt.requested_rounds} round${receipt.requested_rounds === 1 ? "" : "s"} with ${receipt.posted_ticks} posted paper tick${receipt.posted_ticks === 1 ? "" : "s"}.`;
  if (receipt.status === "running") return `Supervisor is running ${receipt.source} ${receipt.scenario}, ${receipt.posted_ticks} posted paper tick${receipt.posted_ticks === 1 ? "" : "s"} so far.`;
  return `Supervisor is idle after ${receipt.round} round${receipt.round === 1 ? "" : "s"}; ${receipt.next_action}`;
}

function cleanText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return normalized || fallback;
}

function cleanIso(value: unknown) {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function cleanCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

export function supervisorControls() {
  return [
    "Runs only the existing paper daemon endpoint and read-only market refresh requests.",
    "Refuses wallet mutation, live execution, private keys, raw signed payload storage, and autonomous real-capital authority.",
    "Stops itself with a circuit-open receipt after repeated blocked or error rounds.",
  ];
}

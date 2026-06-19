import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Web3PromotedPaperAutopilotStatus =
  | "absent"
  | "blocked"
  | "target-hit"
  | "completed"
  | "running"
  | "paper-guarded"
  | "not-started";

export type Web3PromotedPaperAutopilotReceipt = {
  mode: "web3-promoted-paper-autopilot";
  paper_only: true;
  status: Exclude<Web3PromotedPaperAutopilotStatus, "absent">;
  runner_id: string;
  scenario: "base" | "breakout" | "rug-risk";
  promotion_scenario: "base" | "breakout" | "rug-risk" | "all";
  source: "sample" | "live-dex";
  started_at: string;
  finished_at: string;
  promotion_status: string;
  promotion_permission: string;
  supervisor_status: string;
  applied_supervisor_rounds: number;
  applied_ticks_per_round: number;
  posted_ticks: number;
  blocked_ticks: number;
  net_pnl_usd: number;
  profit_target_hit: boolean;
  loss_brake_tripped: boolean;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  summary: string;
  next_action: string;
  blockers: string[];
};

export type Web3PromotedPaperAutopilotHealth = {
  status: Web3PromotedPaperAutopilotStatus;
  updated_at: string | null;
  runner_id: string | null;
  summary: string;
  promotion_permission: string;
  supervisor_status: string;
  net_pnl_usd: number;
  posted_ticks: number;
  blocked_ticks: number;
  profit_target_hit: boolean;
  loss_brake_tripped: boolean;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
};

const STATUSES: Web3PromotedPaperAutopilotReceipt["status"][] = [
  "blocked",
  "target-hit",
  "completed",
  "running",
  "paper-guarded",
  "not-started",
];
const SCENARIOS: Web3PromotedPaperAutopilotReceipt["scenario"][] = ["base", "breakout", "rug-risk"];
const PROMOTION_SCENARIOS: Web3PromotedPaperAutopilotReceipt["promotion_scenario"][] = ["base", "breakout", "rug-risk", "all"];
const SOURCES: Web3PromotedPaperAutopilotReceipt["source"][] = ["sample", "live-dex"];

export function web3PromotedPaperAutopilotReceiptPath() {
  return process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_STATUS_PATH || join(process.cwd(), "data", "web3-promoted-paper-autopilot.json");
}

export function getWeb3PromotedPaperAutopilotReceipt(path = web3PromotedPaperAutopilotReceiptPath()): Web3PromotedPaperAutopilotReceipt | null {
  try {
    if (!existsSync(path)) return null;
    return sanitizeWeb3PromotedPaperAutopilotReceipt(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function writeWeb3PromotedPaperAutopilotReceipt(value: unknown, path = web3PromotedPaperAutopilotReceiptPath()) {
  const receipt = sanitizeWeb3PromotedPaperAutopilotReceipt(value);
  if (!receipt) return null;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export function getWeb3PromotedPaperAutopilotHealth(path = web3PromotedPaperAutopilotReceiptPath()): Web3PromotedPaperAutopilotHealth {
  const receipt = getWeb3PromotedPaperAutopilotReceipt(path);
  if (!receipt) {
    return {
      status: "absent",
      updated_at: null,
      runner_id: null,
      summary: "No promoted Web3 paper autopilot receipt has been written yet.",
      promotion_permission: "missing",
      supervisor_status: "not-run",
      net_pnl_usd: 0,
      posted_ticks: 0,
      blocked_ticks: 0,
      profit_target_hit: false,
      loss_brake_tripped: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    };
  }

  return {
    status: receipt.status,
    updated_at: receipt.finished_at,
    runner_id: receipt.runner_id,
    summary: web3PromotedPaperAutopilotSummary(receipt),
    promotion_permission: receipt.promotion_permission,
    supervisor_status: receipt.supervisor_status,
    net_pnl_usd: receipt.net_pnl_usd,
    posted_ticks: receipt.posted_ticks,
    blocked_ticks: receipt.blocked_ticks,
    profit_target_hit: receipt.profit_target_hit,
    loss_brake_tripped: receipt.loss_brake_tripped,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
  };
}

function sanitizeWeb3PromotedPaperAutopilotReceipt(value: unknown): Web3PromotedPaperAutopilotReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Web3PromotedPaperAutopilotReceipt>;
  if (row.mode !== "web3-promoted-paper-autopilot") return null;
  if (!STATUSES.includes(row.status as Web3PromotedPaperAutopilotReceipt["status"])) return null;

  return {
    mode: "web3-promoted-paper-autopilot",
    paper_only: true,
    status: row.status as Web3PromotedPaperAutopilotReceipt["status"],
    runner_id: cleanText(row.runner_id, "browser-promoted-paper-autopilot", 80),
    scenario: SCENARIOS.includes(row.scenario as Web3PromotedPaperAutopilotReceipt["scenario"])
      ? row.scenario as Web3PromotedPaperAutopilotReceipt["scenario"]
      : "breakout",
    promotion_scenario: PROMOTION_SCENARIOS.includes(row.promotion_scenario as Web3PromotedPaperAutopilotReceipt["promotion_scenario"])
      ? row.promotion_scenario as Web3PromotedPaperAutopilotReceipt["promotion_scenario"]
      : "all",
    source: SOURCES.includes(row.source as Web3PromotedPaperAutopilotReceipt["source"])
      ? row.source as Web3PromotedPaperAutopilotReceipt["source"]
      : "sample",
    started_at: cleanIso(row.started_at),
    finished_at: cleanIso(row.finished_at),
    promotion_status: cleanText(row.promotion_status, "missing", 80),
    promotion_permission: cleanText(row.promotion_permission, "missing", 80),
    supervisor_status: cleanText(row.supervisor_status, "not-run", 80),
    applied_supervisor_rounds: cleanCount(row.applied_supervisor_rounds),
    applied_ticks_per_round: cleanCount(row.applied_ticks_per_round),
    posted_ticks: cleanCount(row.posted_ticks),
    blocked_ticks: cleanCount(row.blocked_ticks),
    net_pnl_usd: cleanMoney(row.net_pnl_usd),
    profit_target_hit: row.profit_target_hit === true,
    loss_brake_tripped: row.loss_brake_tripped === true,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    summary: cleanText(row.summary, "Promoted paper autopilot receipt is available.", 320),
    next_action: cleanText(row.next_action, "Review the promoted paper autopilot receipt before extending runtime.", 320),
    blockers: Array.isArray(row.blockers)
      ? row.blockers.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, "", 240)).filter(Boolean).slice(0, 8)
      : [],
  };
}

function web3PromotedPaperAutopilotSummary(receipt: Web3PromotedPaperAutopilotReceipt) {
  if (receipt.status === "blocked") return receipt.blockers[0] ?? receipt.summary;
  if (receipt.profit_target_hit) return `Promoted paper autopilot hit target with ${formatSignedCompactValue(receipt.net_pnl_usd)} after ${receipt.posted_ticks} posted tick${receipt.posted_ticks === 1 ? "" : "s"}.`;
  if (receipt.status === "completed") return `Promoted paper autopilot completed with ${formatSignedCompactValue(receipt.net_pnl_usd)} after ${receipt.posted_ticks} posted tick${receipt.posted_ticks === 1 ? "" : "s"}.`;
  return receipt.summary;
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

function cleanMoney(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function formatCompactValue(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 1 : 0,
  }).format(value);
}

function formatSignedCompactValue(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatCompactValue(Math.abs(value))}`;
}

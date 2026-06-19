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
  promotion_repair_items: Web3PromotedPaperAutopilotRepairItem[];
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
  run_count: number;
  total_net_pnl_usd: number;
  average_net_pnl_usd: number;
  target_hit_rate_pct: number;
  recent_runs: Web3PromotedPaperAutopilotHistoryEntry[];
  run_memory_status: "learning" | "extend-paper" | "continue-paper" | "tighten-paper" | "protect-paper" | "stand-down";
  run_memory_score: number;
  recommended_supervisor_round_cap: number;
  memory_next_action: string;
  promotion_repair_items: Web3PromotedPaperAutopilotRepairItem[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
};

export type Web3PromotedPaperAutopilotRepairItem = {
  id: string;
  label: string;
  status: "pass" | "watch" | "fail";
  value: string;
  detail: string;
};

export type Web3PromotedPaperAutopilotHistoryEntry = {
  finished_at: string;
  status: Exclude<Web3PromotedPaperAutopilotStatus, "absent">;
  promotion_permission: string;
  supervisor_status: string;
  net_pnl_usd: number;
  posted_ticks: number;
  blocked_ticks: number;
  profit_target_hit: boolean;
  loss_brake_tripped: boolean;
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

export function web3PromotedPaperAutopilotHistoryPath() {
  return process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_HISTORY_PATH || join(process.cwd(), "data", "web3-promoted-paper-autopilot-history.json");
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
  if (isPromotedPaperEvidenceReceipt(receipt)) {
    appendWeb3PromotedPaperAutopilotHistory(receipt);
  }
  return receipt;
}

export function getWeb3PromotedPaperAutopilotHistory(path = web3PromotedPaperAutopilotHistoryPath()): Web3PromotedPaperAutopilotHistoryEntry[] {
  try {
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return sanitizeHistory(parsed);
  } catch {
    return [];
  }
}

export function getWeb3PromotedPaperAutopilotHealth(path = web3PromotedPaperAutopilotReceiptPath()): Web3PromotedPaperAutopilotHealth {
  const receipt = getWeb3PromotedPaperAutopilotReceipt(path);
  const history = getWeb3PromotedPaperAutopilotHistory();
  const runCount = history.length;
  const totalPnl = cleanMoney(history.reduce((sum, item) => sum + item.net_pnl_usd, 0));
  const targetHits = history.filter((item) => item.profit_target_hit).length;
  const recentRuns = history.slice(-8);
  const memory = buildRunMemoryGovernor(history);
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
      run_count: runCount,
      total_net_pnl_usd: totalPnl,
      average_net_pnl_usd: runCount > 0 ? cleanMoney(totalPnl / runCount) : 0,
      target_hit_rate_pct: runCount > 0 ? cleanMoney(targetHits / runCount * 100) : 0,
      recent_runs: recentRuns,
      run_memory_status: memory.status,
      run_memory_score: memory.score,
      recommended_supervisor_round_cap: memory.recommendedSupervisorRoundCap,
      memory_next_action: memory.nextAction,
      promotion_repair_items: [],
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
    run_count: runCount,
    total_net_pnl_usd: totalPnl,
    average_net_pnl_usd: runCount > 0 ? cleanMoney(totalPnl / runCount) : 0,
    target_hit_rate_pct: runCount > 0 ? cleanMoney(targetHits / runCount * 100) : 0,
    recent_runs: recentRuns,
    run_memory_status: memory.status,
    run_memory_score: memory.score,
    recommended_supervisor_round_cap: memory.recommendedSupervisorRoundCap,
    memory_next_action: memory.nextAction,
    promotion_repair_items: receipt.promotion_repair_items,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
  };
}

function appendWeb3PromotedPaperAutopilotHistory(receipt: Web3PromotedPaperAutopilotReceipt, path = web3PromotedPaperAutopilotHistoryPath()) {
  const current = getWeb3PromotedPaperAutopilotHistory(path);
  const entry = receiptToHistoryEntry(receipt);
  const deduped = current.filter((item) => !(item.finished_at === entry.finished_at && item.supervisor_status === entry.supervisor_status));
  const next = [...deduped, entry].slice(-24);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
}

function sanitizeWeb3PromotedPaperAutopilotReceipt(value: unknown): Web3PromotedPaperAutopilotReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Web3PromotedPaperAutopilotReceipt>;
  if (row.mode !== "web3-promoted-paper-autopilot") return null;
  if (!STATUSES.includes(row.status as Web3PromotedPaperAutopilotReceipt["status"])) return null;
  const rawPromotion = "promotion" in row && row.promotion && typeof row.promotion === "object"
    ? row.promotion as { items?: unknown }
    : null;

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
    promotion_repair_items: sanitizeRepairItems(row.promotion_repair_items ?? rawPromotion?.items),
  };
}

function web3PromotedPaperAutopilotSummary(receipt: Web3PromotedPaperAutopilotReceipt) {
  if (receipt.status === "blocked") return receipt.blockers[0] ?? receipt.summary;
  if (receipt.profit_target_hit) return `Promoted paper autopilot hit target with ${formatSignedCompactValue(receipt.net_pnl_usd)} after ${receipt.posted_ticks} posted tick${receipt.posted_ticks === 1 ? "" : "s"}.`;
  if (receipt.status === "completed") return `Promoted paper autopilot completed with ${formatSignedCompactValue(receipt.net_pnl_usd)} after ${receipt.posted_ticks} posted tick${receipt.posted_ticks === 1 ? "" : "s"}.`;
  return receipt.summary;
}

function receiptToHistoryEntry(receipt: Web3PromotedPaperAutopilotReceipt): Web3PromotedPaperAutopilotHistoryEntry {
  return {
    finished_at: receipt.finished_at,
    status: receipt.status,
    promotion_permission: receipt.promotion_permission,
    supervisor_status: receipt.supervisor_status,
    net_pnl_usd: receipt.net_pnl_usd,
    posted_ticks: receipt.posted_ticks,
    blocked_ticks: receipt.blocked_ticks,
    profit_target_hit: receipt.profit_target_hit,
    loss_brake_tripped: receipt.loss_brake_tripped,
  };
}

function sanitizeHistory(values: unknown[]) {
  return values
    .map((value) => {
      if (!value || typeof value !== "object") return null;
      const row = value as Partial<Web3PromotedPaperAutopilotHistoryEntry>;
      if (!STATUSES.includes(row.status as Web3PromotedPaperAutopilotReceipt["status"])) return null;
      return {
        finished_at: cleanIso(row.finished_at),
        status: row.status as Web3PromotedPaperAutopilotReceipt["status"],
        promotion_permission: cleanText(row.promotion_permission, "missing", 80),
        supervisor_status: cleanText(row.supervisor_status, "not-run", 80),
        net_pnl_usd: cleanMoney(row.net_pnl_usd),
        posted_ticks: cleanCount(row.posted_ticks),
        blocked_ticks: cleanCount(row.blocked_ticks),
        profit_target_hit: row.profit_target_hit === true,
        loss_brake_tripped: row.loss_brake_tripped === true,
      };
    })
    .filter((item): item is Web3PromotedPaperAutopilotHistoryEntry => item !== null)
    .filter(isPromotedPaperEvidenceEntry)
    .slice(-24);
}

function sanitizeRepairItems(value: unknown): Web3PromotedPaperAutopilotRepairItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Partial<Web3PromotedPaperAutopilotRepairItem>;
      const status = row.status === "pass" || row.status === "watch" || row.status === "fail" ? row.status : null;
      const id = cleanText(row.id, "", 60);
      const label = cleanText(row.label, "", 80);
      if (!status || !id || !label) return null;
      return {
        id,
        label,
        status,
        value: cleanText(row.value, "unknown", 80),
        detail: cleanText(row.detail, "Promotion repair evidence is unavailable.", 240),
      };
    })
    .filter((item): item is Web3PromotedPaperAutopilotRepairItem => item !== null)
    .slice(0, 8);
}

function isPromotedPaperEvidenceReceipt(receipt: Web3PromotedPaperAutopilotReceipt) {
  return isPromotedPaperEvidenceEntry(receiptToHistoryEntry(receipt));
}

function isPromotedPaperEvidenceEntry(entry: Web3PromotedPaperAutopilotHistoryEntry) {
  return entry.supervisor_status !== "not-run" ||
    entry.posted_ticks > 0 ||
    entry.blocked_ticks > 0 ||
    entry.net_pnl_usd !== 0 ||
    entry.profit_target_hit ||
    entry.loss_brake_tripped;
}

function buildRunMemoryGovernor(history: Web3PromotedPaperAutopilotHistoryEntry[]) {
  const runCount = history.length;
  if (runCount === 0) {
    return {
      status: "learning" as const,
      score: 50,
      recommendedSupervisorRoundCap: 2,
      nextAction: "Collect at least one promoted paper run before expanding supervised runtime.",
    };
  }

  const recent = history.slice(-6);
  const recentPnl = cleanMoney(recent.reduce((sum, item) => sum + item.net_pnl_usd, 0));
  const recentHitRate = cleanMoney(recent.filter((item) => item.profit_target_hit).length / recent.length * 100);
  const latest = history[history.length - 1];
  let lossStreak = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].net_pnl_usd >= 0 && history[index].profit_target_hit) break;
    lossStreak += 1;
  }

  if (latest.loss_brake_tripped || lossStreak >= 3 || recentPnl < -25) {
    return {
      status: "stand-down" as const,
      score: 18,
      recommendedSupervisorRoundCap: 0,
      nextAction: "Stop promoted paper expansion until a fresh repeat proof repairs the run-memory drawdown.",
    };
  }
  if (lossStreak >= 2 || recentHitRate < 50 || recentPnl < 0) {
    return {
      status: "protect-paper" as const,
      score: 34,
      recommendedSupervisorRoundCap: 0,
      nextAction: "Protect paper capital; run proof-only or one manual review cycle before more supervised ticks.",
    };
  }
  if (recentHitRate < 80 || recentPnl < 40) {
    return {
      status: "tighten-paper" as const,
      score: 58,
      recommendedSupervisorRoundCap: 1,
      nextAction: "Keep promoted paper autonomy tight: one supervised round, then review the wallet curve.",
    };
  }
  if (runCount >= 2 && recentHitRate >= 80 && recentPnl >= 100) {
    return {
      status: "extend-paper" as const,
      score: 88,
      recommendedSupervisorRoundCap: 4,
      nextAction: "Run-memory is profitable; allow a larger bounded promoted paper window while keeping live execution locked.",
    };
  }
  return {
    status: "continue-paper" as const,
    score: 74,
    recommendedSupervisorRoundCap: 2,
    nextAction: "Continue bounded promoted paper runs and keep collecting target-hit evidence.",
  };
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

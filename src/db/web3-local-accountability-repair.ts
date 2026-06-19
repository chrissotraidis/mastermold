import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type Web3LocalAccountabilityRepairStatus =
  | "absent"
  | "complete"
  | "blocked"
  | "improved"
  | "no-progress"
  | "not-run";

export type Web3LocalAccountabilityRepairReceipt = {
  mode: "web3-local-accountability-repair";
  paper_only: true;
  status: Exclude<Web3LocalAccountabilityRepairStatus, "absent">;
  updated_at: string;
  target_score: number;
  attempts_requested: number;
  attempts_posted: number;
  initial_accountability_score: number;
  final_accountability_score: number;
  score_delta: number;
  initial_making_money: boolean;
  final_making_money: boolean;
  final_repair_status: string;
  final_repair_action: string | null;
  final_blocking_reason: string | null;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  blockers: string[];
  summary: string;
  next_action: string;
  controls: string[];
};

export type Web3LocalAccountabilityRepairHealth = Omit<Web3LocalAccountabilityRepairReceipt, "status" | "updated_at"> & {
  status: Web3LocalAccountabilityRepairStatus;
  updated_at: string | null;
  receipt_fresh: boolean;
  receipt_age_seconds: number | null;
  can_satisfy_local_accountability: boolean;
  repair_plateaued: boolean;
};

const STATUSES: Web3LocalAccountabilityRepairReceipt["status"][] = [
  "complete",
  "blocked",
  "improved",
  "no-progress",
  "not-run",
];

const DEFAULT_FRESHNESS_SECONDS = 30 * 60;

export function web3LocalAccountabilityRepairReceiptPath() {
  return process.env.WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH || join(process.cwd(), "data", "web3-local-accountability-repair.json");
}

export function getWeb3LocalAccountabilityRepairReceipt(path?: string): Web3LocalAccountabilityRepairReceipt | null {
  if (path) return readWeb3LocalAccountabilityRepairReceipt(path);
  const receipts = web3LocalAccountabilityRepairReceiptCandidatePaths()
    .map((candidate) => readWeb3LocalAccountabilityRepairReceipt(candidate))
    .filter((receipt): receipt is Web3LocalAccountabilityRepairReceipt => Boolean(receipt));
  return receipts.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0] ?? null;
}

function readWeb3LocalAccountabilityRepairReceipt(path: string): Web3LocalAccountabilityRepairReceipt | null {
  try {
    if (!existsSync(path)) return null;
    return sanitizeWeb3LocalAccountabilityRepairReceipt(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function web3LocalAccountabilityRepairReceiptCandidatePaths() {
  if (process.env.WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH) {
    return [process.env.WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH];
  }
  const cwdPath = web3LocalAccountabilityRepairReceiptPath();
  const parentWorkspacePath = resolve(process.cwd(), "..", "..", "data", "web3-local-accountability-repair.json");
  const repoPath = join(dirname(process.cwd()), "data", "web3-local-accountability-repair.json");
  return [...new Set([cwdPath, parentWorkspacePath, repoPath])];
}

export function getWeb3LocalAccountabilityRepairHealth(
  path?: string,
): Web3LocalAccountabilityRepairHealth {
  const receipt = getWeb3LocalAccountabilityRepairReceipt(path);
  if (!receipt) {
    return {
      mode: "web3-local-accountability-repair",
      paper_only: true,
      status: "absent",
      updated_at: null,
      receipt_fresh: false,
      receipt_age_seconds: null,
      target_score: 70,
      attempts_requested: 0,
      attempts_posted: 0,
      initial_accountability_score: 0,
      final_accountability_score: 0,
      score_delta: 0,
      initial_making_money: false,
      final_making_money: false,
      final_repair_status: "missing",
      final_repair_action: null,
      final_blocking_reason: null,
      can_satisfy_local_accountability: false,
      repair_plateaued: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      blockers: [],
      summary: "No local paper accountability repair receipt has been written yet.",
      next_action: "Run npm run repair-accountability:web3 when the launch checklist asks for local paper accountability repair.",
      controls: [
        "Local accountability repair health is paper-only receipt evidence; it cannot authorize live trading.",
        "No local receipt paths, provider secrets, private keys, raw transactions, signed payloads, or wallet authority are exposed.",
      ],
    };
  }

  const receiptAgeSeconds = ageSeconds(receipt.updated_at);
  const receiptFresh = receiptAgeSeconds !== null && receiptAgeSeconds <= DEFAULT_FRESHNESS_SECONDS;
  const canSatisfyLocalAccountability = receipt.status === "complete" &&
    receipt.final_making_money &&
    receipt.final_accountability_score >= receipt.target_score;
  const repairPlateaued = receiptFresh && (receipt.status === "no-progress" || receipt.status === "blocked");

  return {
    ...receipt,
    receipt_fresh: receiptFresh,
    receipt_age_seconds: receiptAgeSeconds,
    can_satisfy_local_accountability: canSatisfyLocalAccountability,
    repair_plateaued: repairPlateaued,
  };
}

function sanitizeWeb3LocalAccountabilityRepairReceipt(value: unknown): Web3LocalAccountabilityRepairReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Web3LocalAccountabilityRepairReceipt>;
  if (row.mode !== "web3-local-accountability-repair") return null;
  if (row.paper_only !== true) return null;
  const status = STATUSES.includes(row.status as Web3LocalAccountabilityRepairReceipt["status"])
    ? row.status as Web3LocalAccountabilityRepairReceipt["status"]
    : null;
  if (!status) return null;
  if (row.live_execution_permission !== "blocked" || row.wallet_mutation_permission !== "blocked") return null;

  return {
    mode: "web3-local-accountability-repair",
    paper_only: true,
    status,
    updated_at: safeIso(row.updated_at),
    target_score: clampScore(row.target_score, 70),
    attempts_requested: cleanCount(row.attempts_requested),
    attempts_posted: cleanCount(row.attempts_posted),
    initial_accountability_score: clampScore(row.initial_accountability_score, 0),
    final_accountability_score: clampScore(row.final_accountability_score, 0),
    score_delta: cleanNumber(row.score_delta),
    initial_making_money: row.initial_making_money === true,
    final_making_money: row.final_making_money === true,
    final_repair_status: safeText(row.final_repair_status, "missing", 80),
    final_repair_action: row.final_repair_action ? safeText(row.final_repair_action, "", 260) : null,
    final_blocking_reason: row.final_blocking_reason ? safeText(row.final_blocking_reason, "", 260) : null,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    blockers: Array.isArray(row.blockers) ? row.blockers.map((item) => safeText(item, "", 260)).filter(Boolean).slice(0, 8) : [],
    summary: safeText(row.summary, "Local paper accountability repair receipt was sanitized.", 260),
    next_action: safeText(row.next_action, "Inspect the local paper repair plan before another repair attempt.", 260),
    controls: Array.isArray(row.controls) ? row.controls.map((item) => safeText(item, "", 260)).filter(Boolean).slice(0, 8) : [],
  };
}

function ageSeconds(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 1000));
}

function safeIso(value: unknown) {
  if (typeof value !== "string") return new Date(0).toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

function safeText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function cleanCount(value: unknown) {
  return Math.max(0, Math.trunc(cleanNumber(value)));
}

function clampScore(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

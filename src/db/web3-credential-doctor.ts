import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type Web3CredentialDoctorStatus =
  | "absent"
  | "needs-jupiter"
  | "needs-wallet"
  | "blocked"
  | "ready-for-strict-verification"
  | "ready-for-live-review-packet";

export type Web3CredentialDoctorCheck = {
  id: string;
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
  next_action: string;
  storage: string;
};

export type Web3CredentialDoctorReceipt = {
  mode: "web3-credential-doctor";
  paper_only: true;
  status: Exclude<Web3CredentialDoctorStatus, "absent">;
  exit_code: number;
  base_url: string;
  scenario: "base" | "breakout" | "rug-risk";
  source: "sample" | "live-dex";
  account: "ephemeral" | "persistent";
  generated_at: string;
  ready_count: number;
  watch_count: number;
  blocked_count: number;
  checks: Web3CredentialDoctorCheck[];
  blockers: string[];
  safe_commands: string[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  account_creation_permission: "operator-external-only";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  summary: string;
  next_action: string;
  controls: string[];
  receipt_hash: string;
};

export type Web3CredentialDoctorHealth = Omit<Web3CredentialDoctorReceipt, "status" | "generated_at"> & {
  status: Web3CredentialDoctorStatus;
  generated_at: string | null;
  receipt_fresh: boolean;
  receipt_age_seconds: number | null;
};

const STATUSES: Web3CredentialDoctorReceipt["status"][] = [
  "needs-jupiter",
  "needs-wallet",
  "blocked",
  "ready-for-strict-verification",
  "ready-for-live-review-packet",
];
const SCENARIOS: Web3CredentialDoctorReceipt["scenario"][] = ["base", "breakout", "rug-risk"];
const SOURCES: Web3CredentialDoctorReceipt["source"][] = ["sample", "live-dex"];
const ACCOUNTS: Web3CredentialDoctorReceipt["account"][] = ["ephemeral", "persistent"];
const DEFAULT_FRESHNESS_SECONDS = 30 * 60;

export function web3CredentialDoctorReceiptPath() {
  return process.env.WEB3_CREDENTIAL_DOCTOR_STATUS_PATH || join(process.cwd(), "data", "web3-credential-doctor.json");
}

export function getWeb3CredentialDoctorReceipt(path?: string): Web3CredentialDoctorReceipt | null {
  if (path) return readWeb3CredentialDoctorReceipt(path);
  const receipts = web3CredentialDoctorReceiptCandidatePaths()
    .map((candidate) => readWeb3CredentialDoctorReceipt(candidate))
    .filter((receipt): receipt is Web3CredentialDoctorReceipt => Boolean(receipt));
  return receipts.sort((a, b) => Date.parse(b.generated_at) - Date.parse(a.generated_at))[0] ?? null;
}

export function web3CredentialDoctorReceiptCandidatePaths() {
  if (process.env.WEB3_CREDENTIAL_DOCTOR_STATUS_PATH) return [process.env.WEB3_CREDENTIAL_DOCTOR_STATUS_PATH];
  const cwdPath = web3CredentialDoctorReceiptPath();
  const parentWorkspacePath = resolve(process.cwd(), "..", "..", "data", "web3-credential-doctor.json");
  const repoPath = join(dirname(process.cwd()), "data", "web3-credential-doctor.json");
  return [...new Set([cwdPath, parentWorkspacePath, repoPath])];
}

export function getWeb3CredentialDoctorHealth(path?: string): Web3CredentialDoctorHealth {
  const receipt = getWeb3CredentialDoctorReceipt(path);
  if (!receipt) {
    return {
      mode: "web3-credential-doctor",
      paper_only: true,
      status: "absent",
      exit_code: 1,
      base_url: "http://localhost:4010",
      scenario: "breakout",
      source: "live-dex",
      account: "persistent",
      generated_at: null,
      receipt_fresh: false,
      receipt_age_seconds: null,
      ready_count: 0,
      watch_count: 0,
      blocked_count: 0,
      checks: [],
      blockers: ["No local Web3 credential doctor receipt has been written yet."],
      safe_commands: ["npm run doctor:web3 -- --json"],
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      account_creation_permission: "operator-external-only",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
      summary: "No local Web3 credential doctor receipt has been written yet.",
      next_action: "Run npm run doctor:web3 -- --json against the local app to refresh credential readiness.",
      controls: [
        "Credential doctor receipts expose configured/missing status only; secrets are never returned.",
        "Private keys, seed phrases, signing, submission, custody, and wallet mutation remain blocked.",
      ],
      receipt_hash: "",
    };
  }

  const age = ageSeconds(receipt.generated_at);
  return {
    ...receipt,
    receipt_fresh: age !== null && age <= DEFAULT_FRESHNESS_SECONDS,
    receipt_age_seconds: age,
  };
}

function readWeb3CredentialDoctorReceipt(path: string): Web3CredentialDoctorReceipt | null {
  try {
    if (!existsSync(path)) return null;
    return sanitizeWeb3CredentialDoctorReceipt(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

function sanitizeWeb3CredentialDoctorReceipt(value: unknown): Web3CredentialDoctorReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Web3CredentialDoctorReceipt>;
  if (row.mode !== "web3-credential-doctor" || row.paper_only !== true) return null;
  if (row.live_execution_permission !== "blocked" || row.wallet_mutation_permission !== "blocked") return null;
  if (row.transaction_submission_permission !== "blocked") return null;
  if (row.private_key_storage !== "blocked" || row.seed_phrase_storage !== "blocked" || row.secret_echo_permission !== "blocked") return null;
  const status = STATUSES.includes(row.status as Web3CredentialDoctorReceipt["status"])
    ? row.status as Web3CredentialDoctorReceipt["status"]
    : null;
  if (!status) return null;

  return {
    mode: "web3-credential-doctor",
    paper_only: true,
    status,
    exit_code: cleanCount(row.exit_code),
    base_url: safeText(row.base_url, "http://localhost:4010", 200),
    scenario: SCENARIOS.includes(row.scenario as Web3CredentialDoctorReceipt["scenario"]) ? row.scenario as Web3CredentialDoctorReceipt["scenario"] : "breakout",
    source: SOURCES.includes(row.source as Web3CredentialDoctorReceipt["source"]) ? row.source as Web3CredentialDoctorReceipt["source"] : "live-dex",
    account: ACCOUNTS.includes(row.account as Web3CredentialDoctorReceipt["account"]) ? row.account as Web3CredentialDoctorReceipt["account"] : "persistent",
    generated_at: safeIso(row.generated_at),
    ready_count: cleanCount(row.ready_count),
    watch_count: cleanCount(row.watch_count),
    blocked_count: cleanCount(row.blocked_count),
    checks: Array.isArray(row.checks) ? row.checks.map(sanitizeCheck).filter((item): item is Web3CredentialDoctorCheck => Boolean(item)).slice(0, 12) : [],
    blockers: Array.isArray(row.blockers) ? row.blockers.map((item) => safeText(item, "", 260)).filter(Boolean).slice(0, 10) : [],
    safe_commands: Array.isArray(row.safe_commands) ? row.safe_commands.map((item) => safeText(item, "", 260)).filter(Boolean).slice(0, 8) : [],
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    account_creation_permission: "operator-external-only",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    summary: safeText(row.summary, "Web3 credential doctor receipt was sanitized.", 320),
    next_action: safeText(row.next_action, "Refresh credential doctor before review.", 320),
    controls: Array.isArray(row.controls) ? row.controls.map((item) => safeText(item, "", 260)).filter(Boolean).slice(0, 8) : [],
    receipt_hash: safeText(row.receipt_hash, "", 128),
  };
}

function sanitizeCheck(value: unknown): Web3CredentialDoctorCheck | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Web3CredentialDoctorCheck>;
  const status = row.status === "pass" || row.status === "watch" || row.status === "fail" ? row.status : null;
  if (!status) return null;
  return {
    id: safeText(row.id, "check", 80),
    label: safeText(row.label, "Credential check", 120),
    status,
    detail: safeText(row.detail, "No detail returned.", 280),
    next_action: safeText(row.next_action, "Inspect this credential check.", 280),
    storage: safeText(row.storage, "review-only", 80),
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
  const text = redactSensitiveText(String(typeof value === "string" ? value : fallback))
    .replace(/[^\w\s.,:/?=&%+<>|()[\]{}'"`!*@#$^-]/g, "")
    .trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function redactSensitiveText(value: string) {
  return value
    .replace(/([?&](?:api[-_]?key|token|secret|signature)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<redacted-secret>")
    .replace(/\b(?:sk|pk|jup|helius)_[A-Za-z0-9_-]{16,}\b/g, "<redacted-secret>");
}

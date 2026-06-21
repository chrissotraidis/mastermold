import { createHash } from "node:crypto";
import { isLikelySolanaPublicKey } from "./web3-credentials";
import type { Web3LiveActivationPlan, Web3LiveActivationMilestone } from "./web3-live-activation-plan";

export type Web3LiveActivationIntakeMilestone = {
  id: Web3LiveActivationMilestone["id"];
  label: string;
  owner: Web3LiveActivationMilestone["owner"];
  status: "provided" | "missing" | "external-review" | "unsafe";
  evidence: string;
  next_action: string;
  blocks_live_capital: boolean;
};

export type Web3LiveActivationIntakeReceipt = {
  mode: "web3-live-activation-intake";
  status: "accepted" | "missing-required" | "unsafe-rejected";
  generated_at: string;
  receipt_hash: string;
  profile_hash: string;
  activation_plan_hash: string;
  activation_plan_status: Web3LiveActivationPlan["status"];
  activation_permitted: false;
  can_trade_real_capital: false;
  live_execution_permitted: false;
  operator_acknowledged: boolean;
  safe_profile: {
    wallet_public_key_preview: string | null;
    wallet_public_key_valid: boolean;
    wallet_ownership_proof: "not-started" | "planned" | "completed";
    read_provider_rail: "missing" | "configured" | "verified";
    jupiter_order_rail: "missing" | "configured" | "rehearsed";
    signer_provider: "external-wallet" | "privy" | "turnkey" | "session-key" | "missing";
    signer_policy_reviewed: boolean;
    ops_targets_configured: boolean;
    emergency_stop_drill_completed: boolean;
    accounting_ready: boolean;
    risk_caps_present: boolean;
    kill_switch_tested: boolean;
    manual_live_review_requested: boolean;
    manual_live_review_approved: boolean;
  };
  accepted_milestone_count: number;
  missing_milestone_count: number;
  unsafe_field_count: number;
  unsafe_fields: string[];
  next_missing: Web3LiveActivationIntakeMilestone | null;
  milestones: Web3LiveActivationIntakeMilestone[];
  summary: string;
  next_action: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3LiveActivationIntakeSchema = {
  mode: "web3-live-activation-intake-schema";
  status: "available";
  endpoint: "/api/web3-live-activation-intake";
  method: "POST";
  required_ack: "operator_ack";
  accepted_fields: string[];
  example_body: {
    operator_ack: true;
    wallet_public_key: "<public-solana-address>";
    wallet_ownership_proof: "planned";
    read_provider_rail: "configured";
    jupiter_order_rail: "configured";
    signer_policy: {
      provider: "external-wallet";
      policy_reviewed: false;
    };
    ops_emergency_stop: {
      contact_configured: true;
      drill_completed: false;
      production_worker_targets: true;
    };
    accounting_ledger: {
      export_target_configured: true;
      settlement_reconciliation_ready: false;
    };
    risk_policy: {
      max_trade_usd: 250;
      daily_spend_cap_usd: 1000;
      max_slippage_bps: 150;
      kill_switch_tested: true;
    };
    manual_live_review: {
      requested: false;
      approved: false;
    };
  };
  never_provide: string[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

type IntakeRequest = Record<string, unknown>;
type SafeProfile = Web3LiveActivationIntakeReceipt["safe_profile"];

const unsafeKeyPatterns = [
  /private/i,
  /seed/i,
  /mnemonic/i,
  /keypair/i,
  /secret/i,
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /raw[_-]?transaction/i,
  /signed[_-]?payload/i,
  /unsigned[_-]?transaction/i,
  /transaction[_-]?bytes/i,
];
const SAMPLE_SOLANA_SYSTEM_WALLET = "11111111111111111111111111111111";

export function buildWeb3LiveActivationIntakeSchema(): Web3LiveActivationIntakeSchema {
  return {
    mode: "web3-live-activation-intake-schema",
    status: "available",
    endpoint: "/api/web3-live-activation-intake",
    method: "POST",
    required_ack: "operator_ack",
    accepted_fields: [
      "operator_ack",
      "wallet_public_key",
      "wallet_ownership_proof",
      "read_provider_rail",
      "jupiter_order_rail",
      "signer_policy.provider",
      "signer_policy.policy_reviewed",
      "ops_emergency_stop.contact_configured",
      "ops_emergency_stop.drill_completed",
      "ops_emergency_stop.production_worker_targets",
      "accounting_ledger.export_target_configured",
      "accounting_ledger.settlement_reconciliation_ready",
      "risk_policy.max_trade_usd",
      "risk_policy.daily_spend_cap_usd",
      "risk_policy.max_slippage_bps",
      "risk_policy.kill_switch_tested",
      "manual_live_review.requested",
      "manual_live_review.approved",
    ],
    example_body: {
      operator_ack: true,
      wallet_public_key: "<public-solana-address>",
      wallet_ownership_proof: "planned",
      read_provider_rail: "configured",
      jupiter_order_rail: "configured",
      signer_policy: {
        provider: "external-wallet",
        policy_reviewed: false,
      },
      ops_emergency_stop: {
        contact_configured: true,
        drill_completed: false,
        production_worker_targets: true,
      },
      accounting_ledger: {
        export_target_configured: true,
        settlement_reconciliation_ready: false,
      },
      risk_policy: {
        max_trade_usd: 250,
        daily_spend_cap_usd: 1000,
        max_slippage_bps: 150,
        kill_switch_tested: true,
      },
      manual_live_review: {
        requested: false,
        approved: false,
      },
    },
    never_provide: [
      "Wallet private key",
      "Seed phrase or mnemonic",
      "Raw keypair JSON",
      "Session private key",
      "Raw transaction bytes",
      "Signed payloads",
      "Provider API keys or bearer tokens",
    ],
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

export function buildWeb3LiveActivationIntakeReceipt(input: {
  body: unknown;
  activationPlan: Web3LiveActivationPlan;
  now?: Date;
}): Web3LiveActivationIntakeReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const body = isPlainObject(input.body) ? input.body : {};
  const unsafeFields = findUnsafeFields(body);
  const operatorAcknowledged = body.operator_ack === true;
  const safeProfile = sanitizeProfile(body);
  const milestones = buildIntakeMilestones(input.activationPlan, safeProfile, operatorAcknowledged, unsafeFields.length > 0);
  const acceptedMilestoneCount = milestones.filter((item) => item.status === "provided").length;
  const missingMilestoneCount = milestones.filter((item) => item.status === "missing" || item.status === "external-review").length;
  const status: Web3LiveActivationIntakeReceipt["status"] = unsafeFields.length > 0
    ? "unsafe-rejected"
    : acceptedMilestoneCount === milestones.length
      ? "accepted"
      : "missing-required";
  const nextMissing = milestones.find((item) => item.status === "missing") ??
    milestones.find((item) => item.status === "external-review") ??
    null;
  const receiptBase = {
    mode: "web3-live-activation-intake" as const,
    status,
    generated_at: generatedAt,
    profile_hash: hashJson(safeProfile),
    activation_plan_hash: input.activationPlan.receipt_hash,
    activation_plan_status: input.activationPlan.status,
    activation_permitted: false as const,
    can_trade_real_capital: false as const,
    live_execution_permitted: false as const,
    operator_acknowledged: operatorAcknowledged,
    safe_profile: safeProfile,
    accepted_milestone_count: acceptedMilestoneCount,
    missing_milestone_count: missingMilestoneCount,
    unsafe_field_count: unsafeFields.length,
    unsafe_fields: unsafeFields,
    next_missing: nextMissing,
    milestones,
    summary: intakeSummary(status, acceptedMilestoneCount, milestones.length, nextMissing, unsafeFields.length),
    next_action: unsafeFields.length > 0
      ? "Remove unsafe fields and submit only the safe activation profile shape."
      : nextMissing?.next_action ?? "Run strict verification and external review; this intake still cannot unlock live execution.",
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This intake validates safe activation profile shape only; it does not persist credentials.",
      "Raw provider API keys, wallet private keys, seed phrases, transaction bytes, signed payloads, bearer tokens, and unrestricted signer authority are rejected.",
      "Only public wallet scope, boolean readiness facts, numeric caps, provider mode, target status, and manual review status are summarized.",
      "Live execution, signing, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function sanitizeProfile(body: IntakeRequest): SafeProfile {
  const wallet = stringValue(body.wallet_public_key);
  const walletValid = Boolean(wallet && wallet !== SAMPLE_SOLANA_SYSTEM_WALLET && isLikelySolanaPublicKey(wallet));
  const signerPolicy = objectValue(body.signer_policy);
  const ops = objectValue(body.ops_emergency_stop);
  const accounting = objectValue(body.accounting_ledger);
  const risk = objectValue(body.risk_policy);
  const manualReview = objectValue(body.manual_live_review);

  return {
    wallet_public_key_preview: walletValid ? previewValue(wallet) : null,
    wallet_public_key_valid: walletValid,
    wallet_ownership_proof: enumValue(body.wallet_ownership_proof, ["not-started", "planned", "completed"], "not-started"),
    read_provider_rail: enumValue(body.read_provider_rail, ["missing", "configured", "verified"], "missing"),
    jupiter_order_rail: enumValue(body.jupiter_order_rail, ["missing", "configured", "rehearsed"], "missing"),
    signer_provider: enumValue(signerPolicy.provider, ["external-wallet", "privy", "turnkey", "session-key"], "missing"),
    signer_policy_reviewed: signerPolicy.policy_reviewed === true,
    ops_targets_configured: ops.contact_configured === true && ops.production_worker_targets === true,
    emergency_stop_drill_completed: ops.drill_completed === true,
    accounting_ready: accounting.export_target_configured === true && accounting.settlement_reconciliation_ready === true,
    risk_caps_present: positiveNumber(risk.max_trade_usd) && positiveNumber(risk.daily_spend_cap_usd) && positiveNumber(risk.max_slippage_bps),
    kill_switch_tested: risk.kill_switch_tested === true,
    manual_live_review_requested: manualReview.requested === true,
    manual_live_review_approved: manualReview.approved === true,
  };
}

function buildIntakeMilestones(
  plan: Web3LiveActivationPlan,
  profile: SafeProfile,
  operatorAcknowledged: boolean,
  unsafe: boolean,
): Web3LiveActivationIntakeMilestone[] {
  const statusFor = (milestone: Web3LiveActivationMilestone): Web3LiveActivationIntakeMilestone["status"] => {
    if (unsafe) return "unsafe";
    if (!operatorAcknowledged) return "missing";
    if (milestone.id === "dedicated-public-wallet") return profile.wallet_public_key_valid ? "provided" : "missing";
    if (milestone.id === "wallet-ownership-proof") return profile.wallet_ownership_proof === "completed" ? "provided" : "missing";
    if (milestone.id === "read-provider-rail") return profile.read_provider_rail === "verified" || profile.read_provider_rail === "configured" ? "provided" : "missing";
    if (milestone.id === "jupiter-order-rail") return profile.jupiter_order_rail === "rehearsed" || profile.jupiter_order_rail === "configured" ? "provided" : "missing";
    if (milestone.id === "signer-policy") return profile.signer_provider !== "missing" && profile.signer_policy_reviewed ? "provided" : "missing";
    if (milestone.id === "ops-emergency-stop") return profile.ops_targets_configured && profile.emergency_stop_drill_completed ? "provided" : "missing";
    if (milestone.id === "accounting-ledger") return profile.accounting_ready ? "provided" : "missing";
    if (milestone.id === "risk-policy") return profile.risk_caps_present && profile.kill_switch_tested ? "provided" : "missing";
    if (milestone.id === "manual-live-review") return profile.manual_live_review_approved ? "external-review" : "missing";
    if (milestone.id === "live-autonomy-final-gate") return "external-review";
    return "missing";
  };

  return plan.milestones.map((milestone) => {
    const status = statusFor(milestone);
    return {
      id: milestone.id,
      label: milestone.label,
      owner: milestone.owner,
      status,
      evidence: evidenceForMilestone(milestone.id, profile, operatorAcknowledged),
      next_action: status === "provided"
        ? "Keep this evidence current while running strict verification."
        : milestone.next_action,
      blocks_live_capital: true,
    };
  });
}

function evidenceForMilestone(id: string, profile: SafeProfile, operatorAcknowledged: boolean) {
  if (!operatorAcknowledged) return "Operator acknowledgement is missing.";
  if (id === "dedicated-public-wallet") return profile.wallet_public_key_valid ? `Public wallet ${profile.wallet_public_key_preview} supplied.` : "Dedicated public wallet is missing or invalid.";
  if (id === "wallet-ownership-proof") return `Wallet ownership proof is ${profile.wallet_ownership_proof}.`;
  if (id === "read-provider-rail") return `Read provider rail is ${profile.read_provider_rail}.`;
  if (id === "jupiter-order-rail") return `Jupiter order rail is ${profile.jupiter_order_rail}.`;
  if (id === "signer-policy") return `Signer provider ${profile.signer_provider}; policy reviewed ${profile.signer_policy_reviewed ? "yes" : "no"}.`;
  if (id === "ops-emergency-stop") return `Ops targets ${profile.ops_targets_configured ? "configured" : "missing"}; stop drill ${profile.emergency_stop_drill_completed ? "completed" : "missing"}.`;
  if (id === "accounting-ledger") return profile.accounting_ready ? "Accounting export and settlement reconciliation are marked ready." : "Accounting export or settlement reconciliation is missing.";
  if (id === "risk-policy") return `Risk caps ${profile.risk_caps_present ? "present" : "missing"}; kill switch ${profile.kill_switch_tested ? "tested" : "not tested"}.`;
  if (id === "manual-live-review") return `Manual live review requested ${profile.manual_live_review_requested ? "yes" : "no"}; approved ${profile.manual_live_review_approved ? "yes" : "no"}.`;
  return "Final autonomy gate still depends on strict verification and external executor review.";
}

function findUnsafeFields(value: unknown, path = ""): string[] {
  if (!isPlainObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    const unsafeKey = unsafeKeyPatterns.some((pattern) => pattern.test(key));
    const unsafeValue = typeof child === "string" && looksSecretLike(child);
    const nested = isPlainObject(child) ? findUnsafeFields(child, childPath) : [];
    return [
      unsafeKey || unsafeValue ? childPath : null,
      ...nested,
    ].filter((item): item is string => Boolean(item));
  });
}

function looksSecretLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/api-key=|bearer\s+[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9_-]{16,}/i.test(trimmed)) return true;
  if (/private[_\s-]?key|seed\s+phrase|mnemonic|keypair/i.test(trimmed)) return true;
  if (trimmed.split(/\s+/).length >= 12 && /^[a-z\s]+$/i.test(trimmed)) return true;
  if (trimmed.length > 80 && /^[A-Za-z0-9+/=_-]+$/.test(trimmed)) return true;
  return false;
}

function intakeSummary(
  status: Web3LiveActivationIntakeReceipt["status"],
  accepted: number,
  total: number,
  nextMissing: Web3LiveActivationIntakeMilestone | null,
  unsafeCount: number,
) {
  if (status === "unsafe-rejected") return `${unsafeCount} unsafe activation field${unsafeCount === 1 ? "" : "s"} were rejected before any activation review.`;
  return `${accepted}/${total} activation milestones have safe intake evidence. ${nextMissing ? `Next missing: ${nextMissing.label}.` : "Strict verification and external review still gate live execution."}`;
}

function isPlainObject(value: unknown): value is IntakeRequest {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function objectValue(value: unknown): IntakeRequest {
  return isPlainObject(value) ? value : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

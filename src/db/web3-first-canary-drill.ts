import { createHash } from "node:crypto";
import type { Web3JupiterOrderPacket } from "./web3-jupiter-order-packet";
import type { Web3LiveTradeCanaryReceipt } from "./web3-live-trade-canary";
import type { Web3LiveUnsignedOrderPreflightReceipt } from "./web3-live-unsigned-order-handoff";
import type { Web3LiveUsabilityBlockersReceipt } from "./web3-live-usability-blockers";
import type {
  Web3SupervisedCanaryReadinessLane,
  Web3SupervisedCanaryReadinessReceipt,
} from "./web3-supervised-canary-readiness";
import type { Web3TradingState } from "./web3-trading";

export type Web3FirstCanaryDrillLane = {
  id:
    | Web3SupervisedCanaryReadinessLane["id"]
    | "post-signing-proof"
    | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
  next_action: string;
  evidence_endpoint: string;
};

export type Web3FirstCanaryDrillReceipt = {
  mode: "web3-first-canary-drill";
  status:
    | "blocked"
    | "ready-to-request-unsigned-order"
    | "ready-to-relay-signed-payload"
    | "canary-proven"
    | "unsafe-permission-drift";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  wallet_public_key_present: boolean;
  wallet_public_key_preview: string | null;
  amount_lamports: number;
  current_input_label: string | null;
  next_blocker_label: string | null;
  next_credential_label: string | null;
  supervised_canary_status: Web3SupervisedCanaryReadinessReceipt["status"];
  can_request_unsigned_order_now: boolean;
  unsigned_preflight_status: Web3LiveUnsignedOrderPreflightReceipt["status"];
  unsigned_order_handoff_ready: boolean;
  jupiter_order_status: Web3JupiterOrderPacket["status"];
  signed_relay_status: Web3LiveTradeCanaryReceipt["signed_relay_status"];
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  post_signing_evidence_status: Web3LiveTradeCanaryReceipt["post_signing_evidence_status"];
  proof_pass_count: number;
  proof_required_count: 4;
  hard_fail_count: number;
  watch_count: number;
  next_action: string;
  blockers: string[];
  safe_commands: string[];
  safe_surfaces: string[];
  source_endpoint: string;
  live_review_source_endpoint: string;
  strict_ready_command: string;
  strict_proof_command: string;
  live_execution_permission: "blocked";
  transaction_submission_permission: "blocked";
  wallet_mutation_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  signed_payload_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
  lanes: Web3FirstCanaryDrillLane[];
};

export type Web3FirstCanaryDrillHealth = {
  mode: "web3-first-canary-drill-health";
  status: Web3FirstCanaryDrillReceipt["status"];
  receipt_hash: string;
  source_endpoint: string;
  live_review_source_endpoint: string;
  can_request_unsigned_order_now: boolean;
  unsigned_order_handoff_ready: boolean;
  signed_relay_status: Web3FirstCanaryDrillReceipt["signed_relay_status"];
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  proof_pass_count: number;
  proof_required_count: 4;
  hard_fail_count: number;
  next_blocker_label: string | null;
  next_credential_label: string | null;
  next_action: string;
  live_execution_permission: "blocked";
  transaction_submission_permission: "blocked";
  wallet_mutation_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  signed_payload_storage: "blocked";
  secret_echo_permission: "blocked";
};

export function buildWeb3FirstCanaryDrillReceipt(input: {
  state: Web3TradingState;
  liveUsability: Web3LiveUsabilityBlockersReceipt;
  readiness: Web3SupervisedCanaryReadinessReceipt;
  jupiter: Web3JupiterOrderPacket;
  unsignedPreflight: Web3LiveUnsignedOrderPreflightReceipt;
  canary: Web3LiveTradeCanaryReceipt;
  amountLamports?: number;
  now?: Date;
}): Web3FirstCanaryDrillReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const walletPublicKey = input.state.execution_readiness.config.wallet_public_key;
  const amountLamports = input.amountLamports ?? input.unsignedPreflight.amount_lamports;
  const proofPassCount = input.canary.post_signing_evidence.filter((item) => item.status === "pass").length;
  const permissionDrift = [
    hasUnexpectedPermission(input.canary.live_execution_permission),
    hasUnexpectedPermission(input.canary.wallet_mutation_permission),
    hasUnexpectedPermission(input.canary.transaction_submission_permission),
    hasUnexpectedPermission(input.unsignedPreflight.private_key_storage),
    hasUnexpectedPermission(input.unsignedPreflight.seed_phrase_storage),
  ].some(Boolean);
  const status: Web3FirstCanaryDrillReceipt["status"] = input.canary.actual_live_trade_tested && input.canary.real_funds_moved_by_this_app
    ? "canary-proven"
    : input.readiness.can_relay_signed_payload_now
      ? "ready-to-relay-signed-payload"
      : input.readiness.can_request_unsigned_order_now && input.unsignedPreflight.can_request_one_shot_unsigned_order
        ? "ready-to-request-unsigned-order"
        : permissionDrift
          ? "unsafe-permission-drift"
          : "blocked";
  const lanes = buildFirstCanaryDrillLanes(input, proofPassCount);
  const failed = lanes.filter((lane) => lane.status === "fail");
  const watched = lanes.filter((lane) => lane.status === "watch");
  const nextLane = lanes.find((lane) => lane.status === "fail") ?? lanes.find((lane) => lane.status === "watch") ?? null;
  const endpointParams = `source=${input.state.market_source.mode}&account=${input.state.paper_account.mode}&scenario=${input.state.scenario}&cycles=0`;
  const base = {
    mode: "web3-first-canary-drill" as const,
    status,
    generated_at: generatedAt,
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    scenario: input.state.scenario,
    wallet_public_key_present: Boolean(walletPublicKey),
    wallet_public_key_preview: previewValue(walletPublicKey),
    amount_lamports: amountLamports,
    current_input_label: input.liveUsability.current_input?.label ?? null,
    next_blocker_label: input.liveUsability.next_blocker?.label ?? null,
    next_credential_label: input.liveUsability.next_credential_request?.label ?? null,
    supervised_canary_status: input.readiness.status,
    can_request_unsigned_order_now: input.readiness.can_request_unsigned_order_now,
    unsigned_preflight_status: input.unsignedPreflight.status,
    unsigned_order_handoff_ready: input.unsignedPreflight.can_request_one_shot_unsigned_order,
    jupiter_order_status: input.jupiter.status,
    signed_relay_status: input.canary.signed_relay_status,
    actual_live_trade_tested: input.canary.actual_live_trade_tested,
    real_funds_moved_by_this_app: input.canary.real_funds_moved_by_this_app,
    post_signing_evidence_status: input.canary.post_signing_evidence_status,
    proof_pass_count: proofPassCount,
    proof_required_count: 4 as const,
    hard_fail_count: failed.length,
    watch_count: watched.length,
    next_action: firstCanaryDrillNextAction(status, nextLane, input),
    blockers: uniqueText([
      permissionDrift ? "Unexpected live execution, transaction submission, wallet mutation, or secret-storage permission appeared in a canary receipt." : null,
      ...input.liveUsability.missing_for_live_usability.slice(0, 6).map((item) => item.next_action),
      ...input.readiness.blockers.slice(0, 6),
      ...input.canary.blockers.slice(0, 6),
    ]),
    safe_commands: uniqueText([
      "npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json --require-ready",
      "npm run verify:web3 -- --base-url=http://localhost:4010",
      input.liveUsability.next_credential_request?.verifier_command,
      input.readiness.strict_verifier_command,
      "npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json",
    ]),
    safe_surfaces: uniqueText([
      input.liveUsability.next_credential_request?.fix_href,
      input.liveUsability.next_blocker?.href,
      `/api/web3-first-canary-drill?${endpointParams}`,
      "/trading?source=live-dex&account=persistent",
      "/settings/integrations#settings-web3-credentials-runway",
    ]),
    source_endpoint: `/api/web3-first-canary-drill?${endpointParams}`,
    live_review_source_endpoint: "/api/web3-first-canary-drill?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    strict_ready_command: "npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json --require-ready",
    strict_proof_command: "npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json",
    live_execution_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    signed_payload_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This drill is read-only; it uses local receipts and cannot sign, submit, broadcast, store transaction bytes, or move funds.",
      "It consolidates live usability blockers, the supervised canary ladder, Jupiter order proof, unsigned-order preflight, and live canary proof into one receipt.",
      "A ready-to-request-unsigned-order result still requires an external browser-wallet signature and guarded signed-payload relay.",
      "Paper, synthetic signatures, read-only DEX evidence, and Jupiter rehearsals never count as an actual live trade.",
    ],
    lanes,
  };

  return {
    ...base,
    receipt_hash: hashJson(base),
  };
}

export function buildWeb3FirstCanaryDrillHealth(receipt: Web3FirstCanaryDrillReceipt): Web3FirstCanaryDrillHealth {
  return {
    mode: "web3-first-canary-drill-health",
    status: receipt.status,
    receipt_hash: receipt.receipt_hash,
    source_endpoint: receipt.source_endpoint,
    live_review_source_endpoint: receipt.live_review_source_endpoint,
    can_request_unsigned_order_now: receipt.can_request_unsigned_order_now,
    unsigned_order_handoff_ready: receipt.unsigned_order_handoff_ready,
    signed_relay_status: receipt.signed_relay_status,
    actual_live_trade_tested: receipt.actual_live_trade_tested,
    real_funds_moved_by_this_app: receipt.real_funds_moved_by_this_app,
    proof_pass_count: receipt.proof_pass_count,
    proof_required_count: receipt.proof_required_count,
    hard_fail_count: receipt.hard_fail_count,
    next_blocker_label: receipt.next_blocker_label,
    next_credential_label: receipt.next_credential_label,
    next_action: receipt.next_action,
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    wallet_mutation_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    signed_payload_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

function buildFirstCanaryDrillLanes(
  input: {
    state: Web3TradingState;
    readiness: Web3SupervisedCanaryReadinessReceipt;
    jupiter: Web3JupiterOrderPacket;
    unsignedPreflight: Web3LiveUnsignedOrderPreflightReceipt;
    canary: Web3LiveTradeCanaryReceipt;
  },
  proofPassCount: number,
): Web3FirstCanaryDrillLane[] {
  return [
    ...input.readiness.lanes.map((lane) => ({
      id: lane.id,
      label: lane.label,
      status: lane.status,
      detail: lane.detail,
      next_action: lane.next_action,
      evidence_endpoint: lane.evidence_endpoint,
    })),
    {
      id: "post-signing-proof" as const,
      label: "Post-signing proof",
      status: input.canary.actual_live_trade_tested && proofPassCount === 4 ? "pass" as const : input.canary.latest_signature_preview ? "watch" as const : "fail" as const,
      detail: `${proofPassCount}/4 proof stages pass; status ${input.canary.post_signing_evidence_status}.`,
      next_action: input.canary.post_signing_next_action,
      evidence_endpoint: `/api/web3-live-trade-canary?source=${input.state.market_source.mode}&account=${input.state.paper_account.mode}&scenario=${input.state.scenario}&cycles=0`,
    },
    {
      id: "live-boundary" as const,
      label: "Live boundary",
      status: input.canary.live_execution_permission === "blocked" && input.canary.wallet_mutation_permission === "blocked" ? "pass" as const : "fail" as const,
      detail: "Live execution, transaction submission, wallet mutation, signing, private-key storage, and seed phrase storage stay blocked in this drill receipt.",
      next_action: "Do not treat this drill as permission to trade; use it to clear the next safe blocker.",
      evidence_endpoint: `/api/web3-first-canary-drill?source=${input.state.market_source.mode}&account=${input.state.paper_account.mode}&scenario=${input.state.scenario}&cycles=0`,
    },
  ];
}

function firstCanaryDrillNextAction(
  status: Web3FirstCanaryDrillReceipt["status"],
  nextLane: Web3FirstCanaryDrillLane | null,
  input: {
    liveUsability: Web3LiveUsabilityBlockersReceipt;
    readiness: Web3SupervisedCanaryReadinessReceipt;
    canary: Web3LiveTradeCanaryReceipt;
  },
) {
  if (status === "canary-proven") return "Run the strict live-canary verifier, then review risk caps before another canary.";
  if (status === "ready-to-relay-signed-payload") return "Relay only the matching externally signed tiny canary payload, then run proof watcher until settlement is accounted.";
  if (status === "ready-to-request-unsigned-order") return "Request one tiny unsigned order, sign it in the browser wallet, relay the signed payload, then stop for proof.";
  return nextLane?.next_action ?? input.liveUsability.next_action ?? input.readiness.next_action ?? input.canary.next_action;
}

function hasUnexpectedPermission(value: string | undefined) {
  return typeof value === "string" && value !== "blocked";
}

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function uniqueText(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

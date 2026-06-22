import { createHash } from "node:crypto";
import type { Web3DedicatedWalletPacket } from "./web3-dedicated-wallet-packet";
import type { Web3JupiterOrderPacket } from "./web3-jupiter-order-packet";
import type { Web3LiveCapitalPreflightReceipt } from "./web3-live-capital-preflight";
import type { Web3LiveIgnitionReceipt } from "./web3-live-ignition";
import type { Web3LiveTradeCanaryReceipt } from "./web3-live-trade-canary";
import type { Web3LiveUnsignedOrderPreflightReceipt } from "./web3-live-unsigned-order-handoff";
import type { Web3SignerCredentialPacket } from "./web3-signer-credential-packet";
import type { Web3TradingState } from "./web3-trading";
import { store } from "./store";

export type Web3SupervisedCanaryReadinessLane = {
  id:
    | "live-scope"
    | "dedicated-wallet"
    | "wallet-ownership"
    | "jupiter-order"
    | "live-flags"
    | "unsigned-order-preflight"
    | "signer-relay"
    | "manual-live-review"
    | "funded-canary-proof";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
  next_action: string;
  evidence_endpoint: string;
  blocks_first_canary: boolean;
};

export type Web3SupervisedCanaryAttemptContract = {
  mode: "web3-first-live-canary-attempt-contract";
  stage:
    | "credential-intake"
    | "unsigned-order-request"
    | "browser-wallet-signature"
    | "signed-payload-relay"
    | "proof-watch"
    | "canary-proven";
  runnable_now: boolean;
  operator_action_label: string;
  primary_endpoint: string;
  exact_next_command: string;
  missing_inputs: string[];
  required_acknowledgements: string[];
  safety_boundary: string[];
};

export type Web3SupervisedCanaryAttemptReceipt = {
  mode: "web3-first-live-canary-attempt-receipt";
  status: "blocked" | "unsigned-order-ready" | "signed-relay-ready" | "proof-watch" | "canary-proven";
  generated_at: string;
  receipt_hash: string;
  readiness_hash: string;
  operator_acknowledged: boolean;
  requested_action: "record-live-canary-gate-check";
  stage: Web3SupervisedCanaryAttemptContract["stage"];
  runnable_now: boolean;
  funded_action_attempted: boolean;
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  can_request_unsigned_order_now: boolean;
  can_relay_signed_payload_now: boolean;
  first_blocker: string | null;
  missing_inputs: string[];
  next_action: string;
  primary_endpoint: string;
  exact_next_command: string;
  operator_note_preview: string | null;
  live_execution_permission: Web3SupervisedCanaryReadinessReceipt["live_execution_permission"];
  transaction_submission_permission: Web3SupervisedCanaryReadinessReceipt["transaction_submission_permission"];
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  signed_payload_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3SupervisedCanaryAttemptSnapshot = {
  mode: Web3SupervisedCanaryAttemptReceipt["mode"];
  status: Web3SupervisedCanaryAttemptReceipt["status"];
  generated_at: string;
  receipt_hash: string;
  stage: Web3SupervisedCanaryAttemptContract["stage"];
  runnable_now: boolean;
  funded_action_attempted: boolean;
  actual_live_trade_tested: boolean;
  first_blocker: string | null;
  next_action: string;
};

export type Web3SupervisedCanaryAttemptHealth = {
  mode: "web3-first-live-canary-attempt-health";
  readiness_status: Web3SupervisedCanaryReadinessReceipt["status"];
  stage: Web3SupervisedCanaryAttemptContract["stage"];
  runnable_now: boolean;
  operator_action_label: string;
  primary_endpoint: string;
  exact_next_command: string;
  missing_input_count: number;
  required_acknowledgement_count: number;
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  live_execution_permission: Web3SupervisedCanaryReadinessReceipt["live_execution_permission"];
  transaction_submission_permission: Web3SupervisedCanaryReadinessReceipt["transaction_submission_permission"];
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  signed_payload_storage: "blocked";
  secret_echo_permission: "blocked";
};

export type Web3SupervisedCanaryReadinessReceipt = {
  mode: "web3-supervised-canary-readiness";
  status: "blocked" | "unsigned-order-ready" | "signed-relay-ready" | "canary-tested";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  wallet_public_key_preview: string | null;
  can_request_unsigned_order_now: boolean;
  can_relay_signed_payload_now: boolean;
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  first_unsigned_order_path: "blocked" | "browser-wallet-one-shot";
  first_signed_payload_path: "blocked" | "external-signed-payload-relay";
  passed_lane_count: number;
  watch_lane_count: number;
  failed_lane_count: number;
  blocker_count: number;
  lanes: Web3SupervisedCanaryReadinessLane[];
  blockers: string[];
  next_lane_id: Web3SupervisedCanaryReadinessLane["id"] | null;
  next_action: string;
  canary_attempt_contract: Web3SupervisedCanaryAttemptContract;
  latest_attempt_receipt: Web3SupervisedCanaryAttemptSnapshot | null;
  ignition_endpoint: string;
  unsigned_handoff_endpoint: string;
  canary_endpoint: string;
  settings_fix_href: string;
  strict_verifier_command: string;
  transaction_submission_permission: "blocked" | "external-signed-payload-only";
  live_execution_permission: "blocked" | "external-signed-payload-only";
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  signed_payload_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export function buildWeb3SupervisedCanaryReadinessReceipt(input: {
  state: Web3TradingState;
  wallet: Web3DedicatedWalletPacket;
  jupiter: Web3JupiterOrderPacket;
  signer: Web3SignerCredentialPacket;
  livePreflight: Web3LiveCapitalPreflightReceipt;
  ignition: Web3LiveIgnitionReceipt;
  unsignedPreflight: Web3LiveUnsignedOrderPreflightReceipt;
  canary: Web3LiveTradeCanaryReceipt;
  now?: Date;
}): Web3SupervisedCanaryReadinessReceipt {
  const lanes = buildSupervisedCanaryReadinessLanes(input);
  const failed = lanes.filter((lane) => lane.status === "fail");
  const watch = lanes.filter((lane) => lane.status === "watch");
  const blockers = lanes
    .filter((lane) => lane.blocks_first_canary && lane.status !== "pass")
    .map((lane) => `${lane.label}: ${lane.next_action}`);
  const nextLane = lanes.find((lane) => lane.blocks_first_canary && lane.status !== "pass") ?? null;
  const canRequestUnsignedOrder = input.unsignedPreflight.can_request_one_shot_unsigned_order;
  const canRelaySignedPayload = input.canary.can_submit_from_app_now;
  const actualLiveTradeTested = input.canary.actual_live_trade_tested;
  const status: Web3SupervisedCanaryReadinessReceipt["status"] = actualLiveTradeTested
    ? "canary-tested"
    : canRelaySignedPayload
      ? "signed-relay-ready"
      : canRequestUnsignedOrder
        ? "unsigned-order-ready"
        : "blocked";
  const endpointParams = `source=${input.state.market_source.mode}&account=${input.state.paper_account.mode}&scenario=${input.state.scenario}&cycles=0`;
  const unsignedHandoffEndpoint = `/api/web3-live-unsigned-order-handoff?${endpointParams}`;
  const canaryEndpoint = `/api/web3-live-trade-canary?${endpointParams}`;
  const proofCommand = "npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json";
  const canaryAttemptContract = buildCanaryAttemptContract({
    status,
    lanes,
    blockers,
    endpointParams,
    unsignedHandoffEndpoint,
    canaryEndpoint,
    proofCommand,
    unsignedPreflight: input.unsignedPreflight,
    canary: input.canary,
  });
  const base = {
    mode: "web3-supervised-canary-readiness" as const,
    status,
    generated_at: (input.now ?? new Date()).toISOString(),
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    scenario: input.state.scenario,
    wallet_public_key_preview: input.wallet.wallet_public_key_preview,
    can_request_unsigned_order_now: canRequestUnsignedOrder,
    can_relay_signed_payload_now: canRelaySignedPayload,
    actual_live_trade_tested: actualLiveTradeTested,
    real_funds_moved_by_this_app: input.canary.real_funds_moved_by_this_app,
    first_unsigned_order_path: canRequestUnsignedOrder ? "browser-wallet-one-shot" as const : "blocked" as const,
    first_signed_payload_path: canRelaySignedPayload ? "external-signed-payload-relay" as const : "blocked" as const,
    passed_lane_count: lanes.filter((lane) => lane.status === "pass").length,
    watch_lane_count: watch.length,
    failed_lane_count: failed.length,
    blocker_count: blockers.length,
    lanes,
    blockers: [...new Set(blockers)].slice(0, 12),
    next_lane_id: nextLane?.id ?? null,
    next_action: supervisedCanaryNextAction(status, nextLane, input),
    canary_attempt_contract: canaryAttemptContract,
    latest_attempt_receipt: getLatestWeb3SupervisedCanaryAttemptSnapshot(),
    ignition_endpoint: `/api/web3-live-ignition?${endpointParams}`,
    unsigned_handoff_endpoint: unsignedHandoffEndpoint,
    canary_endpoint: canaryEndpoint,
    settings_fix_href: "/settings/integrations#settings-web3-credentials-runway",
    strict_verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-operator-wallet --require-jupiter-order",
    transaction_submission_permission: canRelaySignedPayload || actualLiveTradeTested ? "external-signed-payload-only" as const : "blocked" as const,
    live_execution_permission: canRelaySignedPayload || actualLiveTradeTested ? "external-signed-payload-only" as const : "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    signed_payload_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This receipt is the first funded canary readiness ladder; it does not sign, submit, or custody funds.",
      "The first allowed live-money path is a tiny one-shot unsigned order, external browser-wallet signing, and guarded signed-payload relay.",
      "Autonomous live trading remains blocked until a funded canary is relayed, confirmed, reconciled, mirrored, and externally reviewed.",
      "Private keys, seed phrases, keypair JSON, raw transaction bytes, signed payload storage, provider secret echo, and wallet mutation remain blocked.",
    ],
  };

  return {
    ...base,
    receipt_hash: hashJson(base),
  };
}

export function buildWeb3SupervisedCanaryAttemptReceipt(input: {
  readiness: Web3SupervisedCanaryReadinessReceipt;
  operatorAcknowledged: boolean;
  operatorNote?: string | null;
  now?: Date;
}): Web3SupervisedCanaryAttemptReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const contract = input.readiness.canary_attempt_contract;
  const missingInputs = [...new Set(contract.missing_inputs)].slice(0, 8);
  const status = supervisedCanaryAttemptReceiptStatus(input.readiness, contract);
  const fundedActionAttempted = input.operatorAcknowledged && contract.runnable_now && (
    contract.stage === "unsigned-order-request" ||
    contract.stage === "signed-payload-relay" ||
    contract.stage === "proof-watch" ||
    contract.stage === "canary-proven"
  );
  const base = {
    mode: "web3-first-live-canary-attempt-receipt" as const,
    status,
    generated_at: generatedAt,
    readiness_hash: input.readiness.receipt_hash,
    operator_acknowledged: input.operatorAcknowledged,
    requested_action: "record-live-canary-gate-check" as const,
    stage: contract.stage,
    runnable_now: contract.runnable_now,
    funded_action_attempted: fundedActionAttempted,
    actual_live_trade_tested: input.readiness.actual_live_trade_tested,
    real_funds_moved_by_this_app: input.readiness.real_funds_moved_by_this_app,
    can_request_unsigned_order_now: input.readiness.can_request_unsigned_order_now,
    can_relay_signed_payload_now: input.readiness.can_relay_signed_payload_now,
    first_blocker: missingInputs[0] ?? null,
    missing_inputs: missingInputs,
    next_action: input.readiness.next_action,
    primary_endpoint: contract.primary_endpoint,
    exact_next_command: contract.exact_next_command,
    operator_note_preview: previewOperatorNote(input.operatorNote ?? null),
    live_execution_permission: input.readiness.live_execution_permission,
    transaction_submission_permission: input.readiness.transaction_submission_permission,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    signed_payload_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This receipt records a live-canary gate check; it does not create, sign, submit, or store a transaction.",
      "It stores only stage, blockers, endpoints, hashes, and redacted operator note preview.",
      "Private keys, seed phrases, API keys, raw transactions, signed payloads, and wallet authority are never accepted by this attempt snapshot.",
      "A funded action counts only after the separate unsigned handoff, browser wallet signature, signed relay, confirmation, settlement, and portfolio mirror proof chain is real.",
    ],
  };

  return {
    ...base,
    receipt_hash: hashJson(base),
  };
}

export function persistWeb3SupervisedCanaryAttemptReceipt(receipt: Web3SupervisedCanaryAttemptReceipt): void {
  store().appendWeb3ExecutionAudit({
    id: `first-live-canary-attempt-${receipt.receipt_hash.slice(0, 24)}`,
    created_at: receipt.generated_at,
    data: receipt,
  });
}

export function getLatestWeb3SupervisedCanaryAttemptSnapshot(): Web3SupervisedCanaryAttemptSnapshot | null {
  const receipt = store().web3ExecutionAudits(100)
    .map((row) => row.data)
    .find(isWeb3SupervisedCanaryAttemptReceipt);
  return receipt ? toWeb3SupervisedCanaryAttemptSnapshot(receipt) : null;
}

export function buildWeb3SupervisedCanaryAttemptHealth(
  receipt: Web3SupervisedCanaryReadinessReceipt,
): Web3SupervisedCanaryAttemptHealth {
  const contract = receipt.canary_attempt_contract;
  return {
    mode: "web3-first-live-canary-attempt-health",
    readiness_status: receipt.status,
    stage: contract.stage,
    runnable_now: contract.runnable_now,
    operator_action_label: contract.operator_action_label,
    primary_endpoint: contract.primary_endpoint,
    exact_next_command: contract.exact_next_command,
    missing_input_count: contract.missing_inputs.length,
    required_acknowledgement_count: contract.required_acknowledgements.length,
    actual_live_trade_tested: receipt.actual_live_trade_tested,
    real_funds_moved_by_this_app: receipt.real_funds_moved_by_this_app,
    live_execution_permission: receipt.live_execution_permission,
    transaction_submission_permission: receipt.transaction_submission_permission,
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    signed_payload_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

function supervisedCanaryAttemptReceiptStatus(
  readiness: Web3SupervisedCanaryReadinessReceipt,
  contract: Web3SupervisedCanaryAttemptContract,
): Web3SupervisedCanaryAttemptReceipt["status"] {
  if (readiness.actual_live_trade_tested && contract.stage === "canary-proven") return "canary-proven";
  if (contract.stage === "proof-watch") return "proof-watch";
  if (readiness.can_relay_signed_payload_now || contract.stage === "signed-payload-relay") return "signed-relay-ready";
  if (readiness.can_request_unsigned_order_now || contract.stage === "unsigned-order-request" || contract.stage === "browser-wallet-signature") return "unsigned-order-ready";
  return "blocked";
}

function isWeb3SupervisedCanaryAttemptReceipt(value: unknown): value is Web3SupervisedCanaryAttemptReceipt {
  const row = value as Partial<Web3SupervisedCanaryAttemptReceipt>;
  return Boolean(
    row &&
    row.mode === "web3-first-live-canary-attempt-receipt" &&
    typeof row.receipt_hash === "string" &&
    typeof row.generated_at === "string" &&
    typeof row.stage === "string",
  );
}

function toWeb3SupervisedCanaryAttemptSnapshot(receipt: Web3SupervisedCanaryAttemptReceipt): Web3SupervisedCanaryAttemptSnapshot {
  return {
    mode: receipt.mode,
    status: receipt.status,
    generated_at: receipt.generated_at,
    receipt_hash: receipt.receipt_hash,
    stage: receipt.stage,
    runnable_now: receipt.runnable_now,
    funded_action_attempted: receipt.funded_action_attempted,
    actual_live_trade_tested: receipt.actual_live_trade_tested,
    first_blocker: receipt.first_blocker,
    next_action: receipt.next_action,
  };
}

function previewOperatorNote(value: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function buildCanaryAttemptContract(input: {
  status: Web3SupervisedCanaryReadinessReceipt["status"];
  lanes: Web3SupervisedCanaryReadinessLane[];
  blockers: string[];
  endpointParams: string;
  unsignedHandoffEndpoint: string;
  canaryEndpoint: string;
  proofCommand: string;
  unsignedPreflight: Web3LiveUnsignedOrderPreflightReceipt;
  canary: Web3LiveTradeCanaryReceipt;
}): Web3SupervisedCanaryAttemptContract {
  const missingInputs = input.lanes
    .filter((lane) => lane.blocks_first_canary && lane.status !== "pass")
    .map((lane) => `${lane.label}: ${lane.next_action}`);
  const hasSignature = Boolean(input.canary.latest_signature_preview);
  const proofComplete = input.canary.post_signing_evidence_status === "settlement-accounted" &&
    input.canary.post_signing_evidence.every((item) => item.status === "pass");
  const stage: Web3SupervisedCanaryAttemptContract["stage"] = input.status === "canary-tested" && proofComplete
    ? "canary-proven"
    : hasSignature
      ? "proof-watch"
      : input.canary.can_submit_from_app_now
        ? "signed-payload-relay"
        : input.status === "unsigned-order-ready"
          ? "unsigned-order-request"
          : input.unsignedPreflight.status === "ready"
            ? "browser-wallet-signature"
            : "credential-intake";
  const runnableNow = stage === "canary-proven" ||
    stage === "proof-watch" ||
    stage === "signed-payload-relay" ||
    stage === "unsigned-order-request";

  return {
    mode: "web3-first-live-canary-attempt-contract",
    stage,
    runnable_now: runnableNow,
    operator_action_label: canaryAttemptOperatorAction(stage, input.lanes),
    primary_endpoint: canaryAttemptEndpoint(stage, input),
    exact_next_command: canaryAttemptCommand(stage, input),
    missing_inputs: [...new Set(missingInputs.length > 0 ? missingInputs : input.blockers)].slice(0, 8),
    required_acknowledgements: canaryAttemptAcknowledgements(stage),
    safety_boundary: [
      "Only the dedicated public wallet and tiny first-canary caps are in scope.",
      "Private keys, seed phrases, keypair JSON, raw transaction storage, signed payload storage, and wallet authority are blocked.",
      "The app cannot call autonomous real-money trading complete until signed relay, chain confirmation, settlement reconciliation, and portfolio mirror proof pass.",
      "Any failed, stale, mismatched, or oversized request stops at the current canary stage.",
    ],
  };
}

function canaryAttemptOperatorAction(
  stage: Web3SupervisedCanaryAttemptContract["stage"],
  lanes: Web3SupervisedCanaryReadinessLane[],
) {
  if (stage === "canary-proven") return "Run strict live-canary verification";
  if (stage === "proof-watch") return "Watch confirmation, settlement, and mirror proof";
  if (stage === "signed-payload-relay") return "Relay the matching externally signed payload";
  if (stage === "browser-wallet-signature") return "Open browser wallet signing for the one-shot canary";
  if (stage === "unsigned-order-request") return "Request one tiny unsigned canary order";
  const lane = firstBlockingCanaryLane(lanes);
  if (lane?.id === "live-scope") return "Open live DEX trading scope";
  if (lane?.id === "dedicated-wallet") return "Save the dedicated public wallet";
  if (lane?.id === "wallet-ownership") return "Prove wallet ownership";
  if (lane?.id === "jupiter-order") return "Configure Jupiter and rehearse the order";
  if (lane?.id === "live-flags") return "Arm exact live canary flags";
  if (lane?.id === "unsigned-order-preflight") return "Clear unsigned order preflight";
  if (lane?.id === "signer-relay") return "Prepare the signed-payload relay";
  if (lane?.id === "manual-live-review") return "Complete manual live review";
  return "Clear credential and wallet gates";
}

function canaryAttemptEndpoint(stage: Web3SupervisedCanaryAttemptContract["stage"], input: {
  endpointParams: string;
  unsignedHandoffEndpoint: string;
  canaryEndpoint: string;
  lanes: Web3SupervisedCanaryReadinessLane[];
}) {
  if (stage === "unsigned-order-request" || stage === "browser-wallet-signature") return input.unsignedHandoffEndpoint;
  if (stage === "signed-payload-relay" || stage === "proof-watch" || stage === "canary-proven") return input.canaryEndpoint;
  const lane = firstBlockingCanaryLane(input.lanes);
  if (lane?.id === "live-scope" || lane?.id === "wallet-ownership") {
    return `/trading?${input.endpointParams}#web3-live-canary-console`;
  }
  if (lane?.id === "dedicated-wallet" || lane?.id === "jupiter-order" || lane?.id === "live-flags" || lane?.id === "signer-relay" || lane?.id === "manual-live-review") {
    return "/settings/integrations#settings-web3-credentials-runway";
  }
  if (lane?.id === "unsigned-order-preflight") return input.unsignedHandoffEndpoint;
  return `/api/web3-supervised-canary-readiness?${input.endpointParams}`;
}

function canaryAttemptCommand(stage: Web3SupervisedCanaryAttemptContract["stage"], input: {
  proofCommand: string;
  unsignedHandoffEndpoint: string;
  canaryEndpoint: string;
  lanes: Web3SupervisedCanaryReadinessLane[];
}) {
  if (stage === "canary-proven") return "npm run verify:web3 -- --base-url=http://localhost:4010 --require-live-canary";
  if (stage === "proof-watch") return input.proofCommand;
  if (stage === "signed-payload-relay") return `POST ${input.canaryEndpoint} with operator_ack=true, canary_ack, request_id, route, and signed_transaction.`;
  if (stage === "browser-wallet-signature") return "Use the Trading or Settings Sign tiny canary button; review the wallet prompt before signing.";
  if (stage === "unsigned-order-request") return `POST ${input.unsignedHandoffEndpoint} with operator_ack=true, canary_ack, return_unsigned_transaction_ack=true, wallet_public_key, amount_lamports<=1000000.`;
  const lane = firstBlockingCanaryLane(input.lanes);
  if (lane?.id === "live-scope") return "Open /trading?source=live-dex&account=persistent and refresh the first-canary readiness receipt.";
  if (lane?.id === "dedicated-wallet") return "Save only the dedicated public Solana wallet address in Settings, then run npm run verify:web3 -- --base-url=http://localhost:4010 --require-operator-wallet.";
  if (lane?.id === "wallet-ownership") return "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet";
  if (lane?.id === "jupiter-order") return "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order";
  if (lane?.id === "live-flags") return "Set the exact live canary env flags, then rerun npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json --require-ready.";
  if (lane?.id === "unsigned-order-preflight") return `GET ${input.unsignedHandoffEndpoint} to confirm the one-shot unsigned order preflight is ready before any wallet prompt.`;
  if (lane?.id === "signer-relay") return "Choose the browser-wallet signed-payload relay path and keep private keys, seed phrases, and signed payload storage blocked.";
  if (lane?.id === "manual-live-review") return "Complete manual live review with tiny canary caps, emergency stop, and accounting mirror evidence.";
  return "npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json --require-ready";
}

function firstBlockingCanaryLane(lanes: Web3SupervisedCanaryReadinessLane[]) {
  return lanes.find((lane) => lane.blocks_first_canary && lane.status !== "pass") ?? null;
}

function canaryAttemptAcknowledgements(stage: Web3SupervisedCanaryAttemptContract["stage"]) {
  if (stage === "unsigned-order-request" || stage === "browser-wallet-signature") {
    return [
      "operator_ack=true",
      "canary_ack=I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
      "return_unsigned_transaction_ack=true",
    ];
  }
  if (stage === "signed-payload-relay") {
    return [
      "operator_ack=true",
      "canary_ack=I_UNDERSTAND_THIS_CAN_MOVE_REAL_FUNDS",
      "request_id must match the current audited canary request",
    ];
  }
  return [];
}

function buildSupervisedCanaryReadinessLanes(input: {
  state: Web3TradingState;
  wallet: Web3DedicatedWalletPacket;
  jupiter: Web3JupiterOrderPacket;
  signer: Web3SignerCredentialPacket;
  livePreflight: Web3LiveCapitalPreflightReceipt;
  ignition: Web3LiveIgnitionReceipt;
  unsignedPreflight: Web3LiveUnsignedOrderPreflightReceipt;
  canary: Web3LiveTradeCanaryReceipt;
}): Web3SupervisedCanaryReadinessLane[] {
  const liveScopeReady = input.state.market_source.mode === "live-dex" && input.state.paper_account.mode === "persistent";
  const jupiterReady = input.jupiter.jupiter_configured && input.jupiter.swap_v2_order_ready;
  const signerRelayReady = input.canary.can_submit_from_app_now;
  return [
    {
      id: "live-scope",
      label: "Live DEX persistent scope",
      status: liveScopeReady ? "pass" : "fail",
      detail: liveScopeReady ? "The canary runner is scoped to live DEX reads and the persistent paper/accounting rail." : "The first canary must use source=live-dex and account=persistent.",
      next_action: liveScopeReady ? "Keep the live canary scoped to this source/account pair." : "Open /trading?source=live-dex&account=persistent before requesting canary evidence.",
      evidence_endpoint: `/api/web3-live-ignition?source=${input.state.market_source.mode}&account=${input.state.paper_account.mode}&scenario=${input.state.scenario}&cycles=0`,
      blocks_first_canary: true,
    },
    {
      id: "dedicated-wallet",
      label: "Dedicated public wallet",
      status: input.wallet.dedicated_wallet_scoped ? "pass" : "fail",
      detail: input.wallet.dedicated_wallet_scoped ? "A non-sample public Solana wallet is scoped." : input.wallet.next_action,
      next_action: input.wallet.dedicated_wallet_scoped ? "Use the scoped public wallet for ownership proof and the tiny canary." : "Save only a dedicated public Solana wallet address in Settings.",
      evidence_endpoint: "/api/web3-dedicated-wallet-packet?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      blocks_first_canary: true,
    },
    {
      id: "wallet-ownership",
      label: "Wallet ownership proof",
      status: input.unsignedPreflight.wallet_ownership_current_for_canary ? "pass" : input.wallet.dedicated_wallet_scoped ? "fail" : "watch",
      detail: input.unsignedPreflight.wallet_ownership_current_for_canary
        ? "A current hash-only text-message ownership receipt is present for the first canary."
        : input.wallet.wallet_ownership_proved
          ? "Wallet ownership proof exists, but it is too old for the first funded canary."
          : "The dedicated wallet still needs a browser-wallet text signature proof.",
      next_action: input.unsignedPreflight.wallet_ownership_current_for_canary
        ? "Use the current hash-only receipt as first-canary review evidence."
        : input.wallet.wallet_ownership_proved
          ? "Re-run Prove ownership; this signs text only and cannot move funds."
          : "Run Prove ownership; this signs text only and cannot move funds.",
      evidence_endpoint: "/api/web3-wallet-ownership",
      blocks_first_canary: true,
    },
    {
      id: "jupiter-order",
      label: "Jupiter route/order proof",
      status: jupiterReady ? "pass" : input.jupiter.jupiter_configured ? "watch" : "fail",
      detail: jupiterReady ? "Jupiter key and Swap V2 order evidence are ready." : input.jupiter.summary,
      next_action: jupiterReady ? "Keep the current route/order proof fresh before requesting a canary order." : input.jupiter.next_action,
      evidence_endpoint: "/api/web3-jupiter-order-packet?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      blocks_first_canary: true,
    },
    {
      id: "live-flags",
      label: "Live canary env flags",
      status: input.unsignedPreflight.live_flags_ready ? "pass" : "fail",
      detail: input.unsignedPreflight.live_flags_ready ? "Live canary env flags are armed for the one-shot unsigned handoff." : "The live unsigned canary flags are not fully armed.",
      next_action: input.unsignedPreflight.live_flags_ready ? "Keep live flags scoped to the tiny canary review." : "Set MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true, MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS, and MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true in ignored server env.",
      evidence_endpoint: "/api/web3-live-unsigned-order-handoff?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      blocks_first_canary: true,
    },
    {
      id: "unsigned-order-preflight",
      label: "Unsigned order preflight",
      status: input.unsignedPreflight.status === "ready" ? "pass" : "fail",
      detail: input.unsignedPreflight.status === "ready" ? "The tiny canary can request one unsigned order through the browser-wallet handoff." : input.unsignedPreflight.next_action,
      next_action: input.unsignedPreflight.status === "ready" ? "Request the one-shot unsigned order, sign it in the browser wallet, then relay the signed payload." : input.unsignedPreflight.next_action,
      evidence_endpoint: "/api/web3-live-unsigned-order-handoff?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      blocks_first_canary: true,
    },
    {
      id: "signer-relay",
      label: "Signed payload relay",
      status: signerRelayReady ? "pass" : input.signer.status === "review-ready" ? "watch" : "fail",
      detail: signerRelayReady ? "The canary relay can accept an external signed payload for the current request id." : input.canary.next_action,
      next_action: signerRelayReady
        ? "Relay only the matching externally signed canary payload, then stop for confirmation/accounting."
        : "Wait for wallet proof, Jupiter order proof, live flags, unsigned preflight, and a current request id before opening the external wallet transaction prompt.",
      evidence_endpoint: "/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      blocks_first_canary: true,
    },
    {
      id: "manual-live-review",
      label: "Manual live review",
      status: input.livePreflight.live_review_permitted ? "pass" : "fail",
      detail: input.livePreflight.live_review_permitted ? "Manual live executor review can begin." : input.livePreflight.summary,
      next_action: input.livePreflight.live_review_permitted
        ? "Keep review attached through the canary and settlement proof."
        : "Complete manual live review for the tiny cap, emergency stop, settlement/accounting owner, and operator signoff before treating the canary as reviewed.",
      evidence_endpoint: "/api/web3-live-capital-preflight?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      blocks_first_canary: true,
    },
    {
      id: "funded-canary-proof",
      label: "Funded canary proof",
      status: input.canary.actual_live_trade_tested ? "pass" : "fail",
      detail: input.canary.actual_live_trade_tested ? "A live signed transaction has been recorded by this app." : "No funded live trade has been tested by this app yet.",
      next_action: input.canary.actual_live_trade_tested ? input.canary.post_signing_next_action : "After the first signed relay, confirm on-chain settlement and mirror the portfolio before autonomy review.",
      evidence_endpoint: "/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      blocks_first_canary: false,
    },
  ];
}

function supervisedCanaryNextAction(
  status: Web3SupervisedCanaryReadinessReceipt["status"],
  nextLane: Web3SupervisedCanaryReadinessLane | null,
  input: {
    ignition: Web3LiveIgnitionReceipt;
    unsignedPreflight: Web3LiveUnsignedOrderPreflightReceipt;
    canary: Web3LiveTradeCanaryReceipt;
  },
) {
  if (status === "canary-tested") return input.canary.post_signing_next_action;
  if (status === "signed-relay-ready") return "Relay only the matching externally signed tiny canary payload, then run confirmation, settlement, and mirror checks.";
  if (status === "unsigned-order-ready") return "Request one tiny unsigned SOL-to-USDC order, sign it in the browser wallet, relay the signed payload, then stop for proof.";
  return nextLane?.next_action ?? input.unsignedPreflight.next_action ?? input.ignition.next_action;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

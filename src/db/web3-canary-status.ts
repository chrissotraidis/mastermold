import { createHash } from "node:crypto";
import type { Web3LiveIgnitionReceipt } from "./web3-live-ignition";
import type { Web3LiveTradeCanaryReceipt, Web3LiveTradeCanaryRequiredInput } from "./web3-live-trade-canary";
import type { Web3LocalCredentialInstallReceipt } from "./web3-local-credential-install";

export type Web3CanaryStatusReceipt = {
  mode: "web3-canary-status";
  status: "blocked" | "ready-for-supervised-canary" | "canary-proven" | "can-autonomously-trade";
  generated_at: string;
  receipt_hash: string;
  source: Web3LiveIgnitionReceipt["source"];
  account: Web3LiveIgnitionReceipt["account"];
  scenario: Web3LiveIgnitionReceipt["scenario"];
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  can_start_supervised_canary_now: boolean;
  can_autonomously_trade_real_money_now: boolean;
  next_gate_id: Web3LiveIgnitionReceipt["next_gate_id"];
  next_gate_label: Web3LiveIgnitionReceipt["next_gate_label"];
  next_required_input_id: Web3LiveTradeCanaryRequiredInput["id"] | null;
  next_required_input_label: string | null;
  next_action: string;
  blocker_count: number;
  signed_relay_status: Web3LiveTradeCanaryReceipt["signed_relay_status"];
  current_request_id: string | null;
  latest_signature_preview: string | null;
  local_credentials: {
    status: Web3LocalCredentialInstallReceipt["status"];
    configured_count: number;
    missing_count: number;
    configured_keys: string[];
    missing_keys: string[];
    runtime_effective: boolean;
    next_action: string;
  };
  alignment: {
    status: "pass";
    detail: string;
  };
  http_status: {
    canary: number;
    ignition: number;
    local: number;
  };
  canary_endpoint: string;
  ignition_endpoint: string;
  local_credentials_endpoint: "/api/web3-local-credentials";
  transaction_submission_permission: Web3LiveTradeCanaryReceipt["transaction_submission_permission"];
  live_execution_permission: Web3LiveIgnitionReceipt["live_execution_permission"];
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

const strictGateMap: Partial<Record<Web3LiveTradeCanaryRequiredInput["id"], NonNullable<Web3LiveIgnitionReceipt["next_gate_id"]>>> = {
  "dedicated-public-wallet": "wallet-scope",
  "wallet-ownership-proof": "wallet-ownership",
  "jupiter-order-rail": "route-order",
};

export function buildWeb3CanaryStatusReceipt(input: {
  canary: Web3LiveTradeCanaryReceipt;
  ignition: Web3LiveIgnitionReceipt;
  localCredentials: Web3LocalCredentialInstallReceipt;
  httpStatus?: {
    canary?: number;
    ignition?: number;
    local?: number;
  };
  now?: Date;
}): Web3CanaryStatusReceipt {
  assertWeb3CanaryStatusSources(input);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const nextRequiredInput = input.canary.next_required_input;
  const expectedIgnitionGate = nextRequiredInput ? strictGateMap[nextRequiredInput.id] ?? null : null;
  const alignmentDetail = expectedIgnitionGate
    ? `Canary next input ${nextRequiredInput?.id} maps to ignition gate ${input.ignition.next_gate_id}.`
    : `Canary next input ${nextRequiredInput?.id ?? "none"} has no strict ignition mapping.`;
  const canStartSupervisedCanary = input.ignition.can_start_supervised_canary_now;
  const canAutonomouslyTrade = input.ignition.can_autonomously_trade_real_money_now;
  const actualLiveTradeTested = input.canary.actual_live_trade_tested || input.ignition.actual_live_trade_tested;
  const realFundsMoved = input.canary.real_funds_moved_by_this_app || input.ignition.real_funds_moved_by_this_app;
  const status: Web3CanaryStatusReceipt["status"] = canAutonomouslyTrade
    ? "can-autonomously-trade"
    : actualLiveTradeTested && realFundsMoved
      ? "canary-proven"
      : canStartSupervisedCanary
        ? "ready-for-supervised-canary"
        : "blocked";
  const endpointParams = `source=${input.ignition.source}&account=${input.ignition.account}&scenario=${input.ignition.scenario}&cycles=0`;
  const receiptBase = {
    mode: "web3-canary-status" as const,
    status,
    generated_at: generatedAt,
    source: input.ignition.source,
    account: input.ignition.account,
    scenario: input.ignition.scenario,
    actual_live_trade_tested: actualLiveTradeTested,
    real_funds_moved_by_this_app: realFundsMoved,
    can_start_supervised_canary_now: canStartSupervisedCanary,
    can_autonomously_trade_real_money_now: canAutonomouslyTrade,
    next_gate_id: input.ignition.next_gate_id,
    next_gate_label: input.ignition.next_gate_label,
    next_required_input_id: nextRequiredInput?.id ?? null,
    next_required_input_label: nextRequiredInput?.label ?? null,
    next_action: input.ignition.next_action || input.canary.next_action,
    blocker_count: Math.max(input.ignition.blocker_count, input.canary.blockers.length),
    signed_relay_status: input.canary.signed_relay_status,
    current_request_id: input.canary.current_request_id,
    latest_signature_preview: input.canary.latest_signature_preview,
    local_credentials: {
      status: input.localCredentials.status,
      configured_count: input.localCredentials.configured_keys.length,
      missing_count: input.localCredentials.missing_keys.length,
      configured_keys: input.localCredentials.configured_keys,
      missing_keys: input.localCredentials.missing_keys,
      runtime_effective: input.localCredentials.runtime_effective,
      next_action: input.localCredentials.runtime_effective_next_action || input.localCredentials.next_action,
    },
    alignment: {
      status: "pass" as const,
      detail: alignmentDetail,
    },
    http_status: {
      canary: input.httpStatus?.canary ?? 200,
      ignition: input.httpStatus?.ignition ?? 200,
      local: input.httpStatus?.local ?? 200,
    },
    canary_endpoint: `/api/web3-live-trade-canary?${endpointParams}`,
    ignition_endpoint: `/api/web3-live-ignition?${endpointParams}`,
    local_credentials_endpoint: "/api/web3-local-credentials" as const,
    transaction_submission_permission: input.canary.transaction_submission_permission,
    live_execution_permission: input.ignition.live_execution_permission,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This receipt reconciles live-canary truth, bot ignition, and local credential status from the running app.",
      "A running app can be tested without executing a funded trade; actual_live_trade_tested stays false until the signed canary proof chain is real.",
      "Private keys, seed phrases, API key values, raw transactions, signed payload storage, wallet mutation, and secret echo remain blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function assertWeb3CanaryStatusSources(input: {
  canary: Web3LiveTradeCanaryReceipt;
  ignition: Web3LiveIgnitionReceipt;
  localCredentials: Web3LocalCredentialInstallReceipt;
  httpStatus?: {
    canary?: number;
    ignition?: number;
    local?: number;
  };
}) {
  assert(input.canary.mode === "web3-live-trade-canary", "Live canary should expose the expected mode.");
  assert(input.ignition.mode === "web3-live-ignition", "Live ignition should expose the expected mode.");
  assert(input.localCredentials.mode === "web3-local-credential-install", "Local credentials should expose the expected mode.");
  assert(isKnownStatus(input.httpStatus?.canary ?? 200), "Live canary should use a known HTTP status.");
  assert(isKnownStatus(input.httpStatus?.ignition ?? 200), "Live ignition should use a known HTTP status.");
  assert(isKnownStatus(input.httpStatus?.local ?? 200), "Local credentials should use a known HTTP status.");
  assert(input.canary.actual_live_trade_tested === input.ignition.actual_live_trade_tested, "Canary and ignition disagree on actual live trade proof.");
  assert(input.canary.real_funds_moved_by_this_app === input.ignition.real_funds_moved_by_this_app, "Canary and ignition disagree on real fund movement.");
  if (!input.canary.actual_live_trade_tested) {
    assert(input.ignition.can_autonomously_trade_real_money_now === false, "Ignition cannot claim autonomy before a funded live canary is proven.");
  }
  const nextRequiredInput = input.canary.next_required_input;
  const expectedIgnitionGate = nextRequiredInput ? strictGateMap[nextRequiredInput.id] ?? null : null;
  if (expectedIgnitionGate) {
    assert(input.ignition.next_gate_id === expectedIgnitionGate, "Live canary and ignition disagree on the next gate.");
  }
  assert(input.localCredentials.live_execution_permission === "blocked", "Local credentials must keep live execution blocked.");
  assert(input.localCredentials.wallet_mutation_permission === "blocked", "Local credentials must keep wallet mutation blocked.");
  assert(input.localCredentials.secret_echo_permission === "blocked", "Local credentials must keep secret echo blocked.");
  assert(input.canary.wallet_mutation_permission === "blocked", "Live canary must keep wallet mutation blocked.");
  assert(input.canary.private_key_storage === "blocked", "Live canary must keep private key storage blocked.");
  assert(input.canary.seed_phrase_storage === "blocked", "Live canary must keep seed phrase storage blocked.");
  assert(input.canary.secret_echo_permission === "blocked", "Live canary must keep secret echo blocked.");
  assert(input.ignition.wallet_mutation_permission === "blocked", "Live ignition must keep wallet mutation blocked.");
  assert(input.ignition.private_key_storage === "blocked", "Live ignition must keep private key storage blocked.");
  assert(input.ignition.seed_phrase_storage === "blocked", "Live ignition must keep seed phrase storage blocked.");
  assert(input.ignition.secret_echo_permission === "blocked", "Live ignition must keep secret echo blocked.");
  assert(input.ignition.next_action.length > 0, "Ignition should include a next action.");
}

function isKnownStatus(status: number) {
  return [200, 403, 409, 422].includes(status);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

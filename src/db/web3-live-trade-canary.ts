import { createHash } from "node:crypto";
import type { Web3TradingState } from "./web3-trading";

export type Web3LiveTradeCanaryReceipt = {
  mode: "web3-live-trade-canary";
  status: "blocked" | "ready-for-external-signed-payload" | "live-relay-evidence-recorded";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  can_submit_from_app_now: boolean;
  browser_wallet_signature_flow: false;
  unsigned_transaction_return: "withheld";
  live_execution_gate_enabled: boolean;
  live_execution_arming_status: Web3TradingState["live_execution_arming"]["status"];
  live_autonomy_status: Web3TradingState["autonomous_live_autonomy_readiness"]["status"];
  signed_relay_status: Web3TradingState["signed_transaction_relay"]["status"];
  signed_relay_accepts_payload: boolean;
  order_handoff_status: Web3TradingState["autonomous_order_handoff"]["status"];
  signer_status: Web3TradingState["autonomous_signer_ops"]["status"];
  current_request_id: string | null;
  latest_signature_preview: string | null;
  latest_confirmation_status: string | null;
  blockers: string[];
  required_for_real_canary: string[];
  next_action: string;
  transaction_submission_permission: "blocked" | "external-signed-payload-only";
  live_execution_permission: "blocked" | "external-signed-payload-only";
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export function buildWeb3LiveTradeCanaryReceipt(
  state: Web3TradingState,
  now = new Date(),
): Web3LiveTradeCanaryReceipt {
  const latest = state.execution_audit.latest;
  const signature = state.signed_transaction_relay.latest_signature ?? latest?.relay_signature ?? null;
  const actualLiveTradeTested = Boolean(
    signature &&
    (state.signed_transaction_relay.status === "confirmed" || state.signed_transaction_relay.status === "relayed"),
  );
  const readyForExternalSignedPayload = state.live_execution_arming.submit_ready &&
    state.signed_transaction_relay.can_accept_signed_payload &&
    Boolean(state.signed_transaction_relay.request_id);
  const status: Web3LiveTradeCanaryReceipt["status"] = actualLiveTradeTested
    ? "live-relay-evidence-recorded"
    : readyForExternalSignedPayload
      ? "ready-for-external-signed-payload"
      : "blocked";
  const blockers = liveTradeCanaryBlockers(state, readyForExternalSignedPayload, actualLiveTradeTested);
  const receiptBase = {
    mode: "web3-live-trade-canary" as const,
    status,
    generated_at: now.toISOString(),
    source: state.market_source.mode,
    account: state.paper_account.mode,
    scenario: state.scenario,
    actual_live_trade_tested: actualLiveTradeTested,
    real_funds_moved_by_this_app: actualLiveTradeTested,
    can_submit_from_app_now: readyForExternalSignedPayload,
    browser_wallet_signature_flow: false as const,
    unsigned_transaction_return: "withheld" as const,
    live_execution_gate_enabled: state.execution_gate.live_execution_enabled,
    live_execution_arming_status: state.live_execution_arming.status,
    live_autonomy_status: state.autonomous_live_autonomy_readiness.status,
    signed_relay_status: state.signed_transaction_relay.status,
    signed_relay_accepts_payload: state.signed_transaction_relay.can_accept_signed_payload,
    order_handoff_status: state.autonomous_order_handoff.status,
    signer_status: state.autonomous_signer_ops.status,
    current_request_id: state.signed_transaction_relay.request_id,
    latest_signature_preview: previewSignature(signature),
    latest_confirmation_status: state.signed_transaction_relay.confirmation_status ?? latest?.confirmation_status ?? null,
    blockers,
    required_for_real_canary: [
      "Dedicated non-sample public wallet with explicit spend caps and kill switch cleared.",
      "Jupiter Swap V2 key and Solana RPC or Helius read/status rail configured in ignored server env.",
      "Explicit live env flags: MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true and MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS.",
      "A reviewed signer path that can produce or manage a signed payload without storing private keys, seed phrases, raw keypairs, or signed payloads in Mastermind.",
      "A current request id and payload hash that match the signed transaction or provider-managed submit status.",
      "Manual live review, accounting/export target, stop drill, and loss-limit signoff.",
    ],
    next_action: liveTradeCanaryNextAction(status, blockers),
    transaction_submission_permission: readyForExternalSignedPayload || actualLiveTradeTested ? "external-signed-payload-only" as const : "blocked" as const,
    live_execution_permission: readyForExternalSignedPayload || actualLiveTradeTested ? "external-signed-payload-only" as const : "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This canary receipt answers whether a real live trade has actually been tested through Mastermind.",
      "Mastermind currently does not expose unsigned transaction bytes to the browser wallet flow.",
      "The only live-submit shape represented here is an external signed payload or provider-managed submit status for a matching request id.",
      "Private keys, seed phrases, keypair JSON, raw transaction bytes, signed payload storage, browser key storage, and secret echo remain blocked.",
      "Paper and read-only DEX tests do not count as actual live trades.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function liveTradeCanaryBlockers(
  state: Web3TradingState,
  readyForExternalSignedPayload: boolean,
  actualLiveTradeTested: boolean,
) {
  const failChecks = state.live_execution_arming.checks
    .filter((check) => check.status === "fail")
    .map((check) => `${check.label}: ${check.detail}`);
  const blockers = [
    !actualLiveTradeTested ? "No confirmed live transaction signature has been recorded by this app." : null,
    "Mastermind currently withholds unsigned transaction bytes, so a browser-wallet live trade cannot be signed from the UI yet.",
    !state.signed_transaction_relay.request_id ? "No active signed-relay request id is ready for a canary trade." : null,
    !readyForExternalSignedPayload ? "Signed relay is not currently ready to accept an external signed payload." : null,
    ...state.execution_gate.live_blockers,
    ...failChecks,
    ...state.signed_transaction_relay.blockers,
  ].filter((item): item is string => Boolean(item));

  return [...new Set(blockers)].slice(0, 12);
}

function liveTradeCanaryNextAction(status: Web3LiveTradeCanaryReceipt["status"], blockers: string[]) {
  if (status === "live-relay-evidence-recorded") {
    return "Review the recorded signature, confirmation metadata, settlement reconciliation, and portfolio mirror before allowing further live canaries.";
  }
  if (status === "ready-for-external-signed-payload") {
    return "Run one operator-approved external signed-payload canary with tiny caps, then record confirmation and settlement evidence.";
  }
  return blockers[0] ?? "Clear live canary blockers before claiming a real live trade has been tested.";
}

function previewSignature(signature: string | null) {
  if (!signature) return null;
  if (signature.length <= 14) return signature;
  return `${signature.slice(0, 6)}...${signature.slice(-6)}`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

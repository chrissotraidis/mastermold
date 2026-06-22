import { createHash } from "node:crypto";
import type { Web3TradingState } from "./web3-trading";
import { getWeb3WalletOwnershipCanaryStatus } from "./web3-wallet-ownership";

export type Web3LiveTradeCanaryEvidenceItem = {
  id: "signed-relay" | "chain-confirmation" | "settlement-reconciliation" | "portfolio-mirror";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
  next_action: string;
};

export type Web3LiveTradeCanaryRequiredInput = {
  id: "dedicated-public-wallet" | "wallet-ownership-proof" | "jupiter-order-rail" | "first-canary-live-flags" | "unsigned-order-preflight" | "signed-payload-relay" | "post-signing-proof";
  label: string;
  status: "done" | "needed-now" | "blocked" | "external-signature" | "proof-watch";
  owner: "operator" | "external-wallet" | "system";
  safe_value_type: string;
  safe_surface: string;
  target_names: string[];
  verifier_command: string | null;
  completion_signal: string;
  live_execution_permission: "blocked";
  transaction_submission_permission: "blocked";
  wallet_mutation_permission: "blocked";
  secret_echo_permission: "blocked";
};

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
  wallet_ownership_proved: boolean;
  wallet_ownership_current_for_canary: boolean;
  wallet_ownership_age_seconds: number | null;
  wallet_ownership_expires_at: string | null;
  wallet_ownership_max_age_seconds: number;
  browser_wallet_signature_flow: "gated-unsigned-handoff";
  unsigned_transaction_return: "withheld";
  live_execution_gate_enabled: boolean;
  live_execution_arming_status: Web3TradingState["live_execution_arming"]["status"];
  live_autonomy_status: Web3TradingState["autonomous_live_autonomy_readiness"]["status"];
  signed_relay_status: Web3TradingState["signed_transaction_relay"]["status"];
  signed_relay_submit_path: Web3TradingState["signed_transaction_relay"]["submit_path"];
  signed_relay_accepts_payload: boolean;
  order_handoff_status: Web3TradingState["autonomous_order_handoff"]["status"];
  signer_status: Web3TradingState["autonomous_signer_ops"]["status"];
  current_request_id: string | null;
  latest_signature_preview: string | null;
  latest_confirmation_status: string | null;
  confirmation_poll_status: NonNullable<Web3TradingState["signature_confirmation_poll"]>["status"] | "not-run";
  settlement_reconciliation_status: NonNullable<Web3TradingState["settlement_fill_reconciliation"]>["status"] | "not-run";
  settlement_watchdog_status: NonNullable<Web3TradingState["autonomous_settlement_watchdog"]>["status"] | "not-run";
  portfolio_mirror_status: NonNullable<Web3TradingState["portfolio_mirror_apply"]>["status"] | "not-run";
  post_signing_evidence_status: "needs-signed-relay" | "needs-confirmation" | "needs-settlement" | "needs-mirror-review" | "settlement-accounted" | "review-required";
  post_signing_evidence: Web3LiveTradeCanaryEvidenceItem[];
  post_signing_next_action: string;
  blockers: string[];
  next_required_input: Web3LiveTradeCanaryRequiredInput | null;
  required_inputs: Web3LiveTradeCanaryRequiredInput[];
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

export type Web3LiveTradeCanaryHealth = {
  mode: "web3-live-canary-proof-health";
  status: Web3LiveTradeCanaryReceipt["status"];
  receipt_hash: string;
  source_endpoint: string;
  live_review_source_endpoint: string;
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  can_submit_from_app_now: boolean;
  signed_relay_status: Web3LiveTradeCanaryReceipt["signed_relay_status"];
  latest_signature_preview: string | null;
  latest_confirmation_status: string | null;
  confirmation_poll_status: Web3LiveTradeCanaryReceipt["confirmation_poll_status"];
  settlement_reconciliation_status: Web3LiveTradeCanaryReceipt["settlement_reconciliation_status"];
  settlement_watchdog_status: Web3LiveTradeCanaryReceipt["settlement_watchdog_status"];
  portfolio_mirror_status: Web3LiveTradeCanaryReceipt["portfolio_mirror_status"];
  post_signing_evidence_status: Web3LiveTradeCanaryReceipt["post_signing_evidence_status"];
  proof_pass_count: number;
  proof_required_count: 4;
  next_proof_id: Web3LiveTradeCanaryEvidenceItem["id"] | null;
  next_proof_label: string | null;
  next_proof_status: Web3LiveTradeCanaryEvidenceItem["status"] | null;
  next_proof_action: string;
  next_action: string;
  live_execution_permission: Web3LiveTradeCanaryReceipt["live_execution_permission"];
  transaction_submission_permission: Web3LiveTradeCanaryReceipt["transaction_submission_permission"];
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

export type Web3LiveTradeCanaryActionReceipt = {
  mode: "web3-live-trade-canary-action";
  status: "blocked" | "unsafe-rejected" | "relay-attempted" | "live-relay-evidence-recorded";
  generated_at: string;
  receipt_hash: string;
  action: "external-signed-payload-canary";
  operator_acknowledged: boolean;
  canary_acknowledged: boolean;
  relay_attempted: boolean;
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  request_id: string | null;
  expected_request_id: string | null;
  expected_route: "jupiter-swap-v2" | "solana-rpc" | null;
  request_continuity_status: "matched" | "missing-current-request" | "mismatch" | "route-mismatch" | "relay-not-ready" | "not-checked";
  current_relay_ready: boolean;
  route: "jupiter-swap-v2" | "solana-rpc" | null;
  signed_payload_received: boolean;
  signed_payload_echoed: false;
  signed_payload_hash: string | null;
  signed_payload_byte_count: number;
  unsafe_field_count: number;
  unsafe_fields: string[];
  before_canary_status: Web3LiveTradeCanaryReceipt["status"];
  after_canary_status: Web3LiveTradeCanaryReceipt["status"];
  after_signature_preview: string | null;
  blockers: string[];
  next_action: string;
  transaction_submission_permission: "blocked" | "external-signed-payload-only";
  live_execution_permission: "blocked" | "external-signed-payload-only";
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export function buildWeb3LiveTradeCanaryActionReceipt(input: {
  before: Web3LiveTradeCanaryReceipt;
  after?: Web3LiveTradeCanaryReceipt;
  operatorAcknowledged: boolean;
  canaryAcknowledged: boolean;
  relayAttempted: boolean;
  requestId: string | null;
  route: "jupiter-swap-v2" | "solana-rpc" | null;
  signedPayloadHash: string | null;
  signedPayloadByteCount: number;
  unsafeFields?: string[];
  blockers?: string[];
  now?: Date;
}): Web3LiveTradeCanaryActionReceipt {
  const after = input.after ?? input.before;
  const unsafeFields = input.unsafeFields ?? [];
  const blockers = [
    ...unsafeFields.map((field) => `Unsafe field rejected: ${field}.`),
    ...(input.blockers ?? []),
    ...after.blockers,
  ];
  const dedupedBlockers = [...new Set(blockers)].slice(0, 12);
  const actualLiveTradeTested = after.actual_live_trade_tested;
  const status: Web3LiveTradeCanaryActionReceipt["status"] = unsafeFields.length > 0
    ? "unsafe-rejected"
    : actualLiveTradeTested
      ? "live-relay-evidence-recorded"
      : input.relayAttempted
        ? "relay-attempted"
        : "blocked";
  const generatedAt = (input.now ?? new Date()).toISOString();
  const receiptBase = {
    mode: "web3-live-trade-canary-action" as const,
    status,
    generated_at: generatedAt,
    action: "external-signed-payload-canary" as const,
    operator_acknowledged: input.operatorAcknowledged,
    canary_acknowledged: input.canaryAcknowledged,
    relay_attempted: input.relayAttempted,
    actual_live_trade_tested: actualLiveTradeTested,
    real_funds_moved_by_this_app: after.real_funds_moved_by_this_app,
    request_id: input.requestId,
    expected_request_id: input.before.current_request_id,
    expected_route: liveCanaryExpectedRoute(input.before),
    request_continuity_status: liveCanaryRequestContinuityStatus(input.before, input.requestId, input.route),
    current_relay_ready: input.before.can_submit_from_app_now,
    route: input.route,
    signed_payload_received: Boolean(input.signedPayloadHash),
    signed_payload_echoed: false as const,
    signed_payload_hash: input.signedPayloadHash,
    signed_payload_byte_count: input.signedPayloadByteCount,
    unsafe_field_count: unsafeFields.length,
    unsafe_fields: unsafeFields,
    before_canary_status: input.before.status,
    after_canary_status: after.status,
    after_signature_preview: after.latest_signature_preview,
    blockers: dedupedBlockers,
    next_action: liveTradeCanaryActionNextAction(status, dedupedBlockers),
    transaction_submission_permission: input.relayAttempted || actualLiveTradeTested ? "external-signed-payload-only" as const : "blocked" as const,
    live_execution_permission: input.relayAttempted || actualLiveTradeTested ? "external-signed-payload-only" as const : "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This action receipt can attempt only the external-signed-payload relay path; it cannot create, sign, or store a transaction.",
      "A signed payload must already match the current request id and live routing context.",
      "Signed payload bytes are hashed for this receipt and never echoed in the response.",
      "Private keys, seed phrases, keypair JSON, provider API keys, raw transactions, and browser wallet authority are rejected.",
      "If live env flags, Jupiter/RPC credentials, wallet scope, caps, signer review, or request continuity are missing, the action remains blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function liveCanaryRequestContinuityBlockers(
  before: Web3LiveTradeCanaryReceipt,
  requestId: string,
  route?: "jupiter-swap-v2" | "solana-rpc" | null,
): string[] {
  if (!before.current_request_id) {
    return ["No active canary request id is ready; request a fresh one-shot unsigned order before relaying a signed payload."];
  }
  if (requestId !== before.current_request_id) {
    return [`request_id must match the current canary request ${before.current_request_id}.`];
  }
  if (route && before.signed_relay_submit_path !== "not-configured" && route !== before.signed_relay_submit_path) {
    return [`route must match the current canary submit path ${before.signed_relay_submit_path}.`];
  }
  if (!before.can_submit_from_app_now) {
    return ["Current canary relay is not ready to accept a signed payload; clear the signed-relay readiness gate first."];
  }
  return [];
}

function liveCanaryRequestContinuityStatus(
  before: Web3LiveTradeCanaryReceipt,
  requestId: string | null,
  route?: "jupiter-swap-v2" | "solana-rpc" | null,
): Web3LiveTradeCanaryActionReceipt["request_continuity_status"] {
  if (!requestId) return "not-checked";
  if (!before.current_request_id) return "missing-current-request";
  if (requestId !== before.current_request_id) return "mismatch";
  if (route && before.signed_relay_submit_path !== "not-configured" && route !== before.signed_relay_submit_path) return "route-mismatch";
  if (!before.can_submit_from_app_now) return "relay-not-ready";
  return "matched";
}

function liveCanaryExpectedRoute(before: Web3LiveTradeCanaryReceipt) {
  return before.signed_relay_submit_path === "jupiter-swap-v2" || before.signed_relay_submit_path === "solana-rpc"
    ? before.signed_relay_submit_path
    : null;
}

export function buildWeb3LiveTradeCanaryReceipt(
  state: Web3TradingState,
  now = new Date(),
): Web3LiveTradeCanaryReceipt {
  const latest = state.execution_audit.latest;
  const signature = state.signed_transaction_relay.latest_signature ?? latest?.relay_signature ?? null;
  const relayConfirmed = isConfirmedLiveRelay(state, latest);
  const actualLiveTradeTested = Boolean(signature && relayConfirmed);
  const walletOwnership = liveTradeCanaryWalletOwnershipStatus(state, now);
  const readyForExternalSignedPayload = walletOwnership.current_for_canary &&
    state.live_execution_arming.submit_ready &&
    state.signed_transaction_relay.can_accept_signed_payload &&
    Boolean(state.signed_transaction_relay.request_id);
  const status: Web3LiveTradeCanaryReceipt["status"] = actualLiveTradeTested
    ? "live-relay-evidence-recorded"
    : readyForExternalSignedPayload
      ? "ready-for-external-signed-payload"
      : "blocked";
  const blockers = liveTradeCanaryBlockers(state, readyForExternalSignedPayload, actualLiveTradeTested, walletOwnership);
  const postSigningEvidence = buildPostSigningEvidence(state, signature);
  const postSigningEvidenceStatus = postSigningEvidenceStatusFrom(postSigningEvidence, signature);
  const postSigningNextAction = postSigningEvidence.find((item) => item.status !== "pass")?.next_action ??
    "Settlement is accounted for in the local mirror; review caps, PnL, and stop conditions before another canary.";
  const requiredInputs = buildLiveTradeCanaryRequiredInputs({
    state,
    walletOwnership,
    readyForExternalSignedPayload,
    actualLiveTradeTested,
    signature,
    postSigningEvidenceStatus,
  });
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
    wallet_ownership_proved: walletOwnership.proved,
    wallet_ownership_current_for_canary: walletOwnership.current_for_canary,
    wallet_ownership_age_seconds: walletOwnership.age_seconds,
    wallet_ownership_expires_at: walletOwnership.expires_at,
    wallet_ownership_max_age_seconds: walletOwnership.max_age_seconds,
    browser_wallet_signature_flow: "gated-unsigned-handoff" as const,
    unsigned_transaction_return: "withheld" as const,
    live_execution_gate_enabled: state.execution_gate.live_execution_enabled,
    live_execution_arming_status: state.live_execution_arming.status,
    live_autonomy_status: state.autonomous_live_autonomy_readiness.status,
    signed_relay_status: state.signed_transaction_relay.status,
    signed_relay_submit_path: state.signed_transaction_relay.submit_path,
    signed_relay_accepts_payload: state.signed_transaction_relay.can_accept_signed_payload,
    order_handoff_status: state.autonomous_order_handoff.status,
    signer_status: state.autonomous_signer_ops.status,
    current_request_id: state.signed_transaction_relay.request_id,
    latest_signature_preview: previewSignature(signature),
    latest_confirmation_status: state.signed_transaction_relay.confirmation_status ?? latest?.confirmation_status ?? null,
    confirmation_poll_status: state.signature_confirmation_poll?.status ?? "not-run" as const,
    settlement_reconciliation_status: state.settlement_fill_reconciliation?.status ?? "not-run" as const,
    settlement_watchdog_status: state.autonomous_settlement_watchdog?.status ?? "not-run" as const,
    portfolio_mirror_status: state.portfolio_mirror_apply?.status ?? "not-run" as const,
    post_signing_evidence_status: postSigningEvidenceStatus,
    post_signing_evidence: postSigningEvidence,
    post_signing_next_action: postSigningNextAction,
    blockers,
    next_required_input: nextLiveTradeCanaryRequiredInput(requiredInputs),
    required_inputs: requiredInputs,
    required_for_real_canary: [
      "Dedicated non-sample public wallet with explicit spend caps and kill switch cleared.",
      "Jupiter Swap V2 key and Solana RPC or Helius read/status rail configured in ignored server env.",
      "Explicit live env flags: MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true and MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS.",
      "A reviewed signer path or gated /api/web3-live-unsigned-order-handoff browser-wallet path that can produce a signed payload without storing private keys, seed phrases, raw keypairs, or signed payloads in Mastermind.",
      "A current request id and payload hash that match the signed transaction or provider-managed submit status.",
      "A current hash-only wallet ownership proof recorded shortly before the first funded canary.",
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
      "Browser-wallet signing is wired only through the gated one-shot /api/web3-live-unsigned-order-handoff bridge and the guarded signed-payload canary relay.",
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

export function buildWeb3LiveTradeCanaryHealth(receipt: Web3LiveTradeCanaryReceipt): Web3LiveTradeCanaryHealth {
  const nextProof = receipt.post_signing_evidence.find((item) => item.status !== "pass") ?? null;
  return {
    mode: "web3-live-canary-proof-health",
    status: receipt.status,
    receipt_hash: receipt.receipt_hash,
    source_endpoint: `/api/web3-live-trade-canary?source=${receipt.source}&account=${receipt.account}&scenario=${receipt.scenario}&cycles=0`,
    live_review_source_endpoint: "/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    actual_live_trade_tested: receipt.actual_live_trade_tested,
    real_funds_moved_by_this_app: receipt.real_funds_moved_by_this_app,
    can_submit_from_app_now: receipt.can_submit_from_app_now,
    signed_relay_status: receipt.signed_relay_status,
    latest_signature_preview: receipt.latest_signature_preview,
    latest_confirmation_status: receipt.latest_confirmation_status,
    confirmation_poll_status: receipt.confirmation_poll_status,
    settlement_reconciliation_status: receipt.settlement_reconciliation_status,
    settlement_watchdog_status: receipt.settlement_watchdog_status,
    portfolio_mirror_status: receipt.portfolio_mirror_status,
    post_signing_evidence_status: receipt.post_signing_evidence_status,
    proof_pass_count: receipt.post_signing_evidence.filter((item) => item.status === "pass").length,
    proof_required_count: 4,
    next_proof_id: nextProof?.id ?? null,
    next_proof_label: nextProof?.label ?? null,
    next_proof_status: nextProof?.status ?? null,
    next_proof_action: nextProof?.next_action ?? receipt.post_signing_next_action,
    next_action: receipt.post_signing_next_action,
    live_execution_permission: receipt.live_execution_permission,
    transaction_submission_permission: receipt.transaction_submission_permission,
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

function liveTradeCanaryBlockers(
  state: Web3TradingState,
  readyForExternalSignedPayload: boolean,
  actualLiveTradeTested: boolean,
  walletOwnership: ReturnType<typeof liveTradeCanaryWalletOwnershipStatus>,
) {
  const walletPublicKey = state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const walletScoped = Boolean(walletPublicKey);
  const walletLooksLikePublicKey = typeof walletPublicKey === "string" && isLikelySolanaPublicKey(walletPublicKey);
  const walletIsSample = walletPublicKey === SAMPLE_SYSTEM_WALLET;
  const dedicatedWalletScoped = walletScoped && walletLooksLikePublicKey && !walletIsSample;
  const walletOwnershipProved = dedicatedWalletScoped && walletOwnership.proved;
  const walletOwnershipCurrentForCanary = dedicatedWalletScoped && walletOwnership.current_for_canary;
  const liveScopeReady = state.market_source.mode === "live-dex" && state.paper_account.mode === "persistent";
  const jupiterConfigured = Boolean(process.env.JUPITER_API_KEY);
  const liveFlagsReady = process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION === "true" &&
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL === "I_UNDERSTAND_REAL_FUNDS" &&
    process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF === "true";
  const blockers = [
    !liveScopeReady ? "Open the live DEX trading cockpit with source=live-dex and account=persistent before requesting canary evidence." : null,
    !walletScoped ? "Add a dedicated public Solana trading wallet address in Settings; never paste a private key or seed phrase." : null,
    walletScoped && !walletLooksLikePublicKey ? "Replace the scoped wallet with a valid public Solana address." : null,
    walletIsSample ? "Replace the sample all-ones wallet with a dedicated public Solana address before canary review." : null,
    dedicatedWalletScoped && !walletOwnershipProved ? "Run Prove ownership with the connected browser wallet; this signs text only and cannot move funds." : null,
    dedicatedWalletScoped && walletOwnershipProved && !walletOwnershipCurrentForCanary ? "Re-run Prove ownership with the connected browser wallet; the hash-only wallet proof is too old for the first funded canary." : null,
    !jupiterConfigured ? "Install JUPITER_API_KEY in ignored server env for the funded canary; one-shot Settings rehearsals are evidence only and cannot arm the unsigned handoff." : null,
    !liveFlagsReady ? "Set the exact live canary flags in ignored server env before requesting the one-shot unsigned order." : null,
    !state.signed_transaction_relay.request_id ? "No active signed-relay request id is ready for a canary trade." : null,
    !readyForExternalSignedPayload ? "Signed relay is not currently ready to accept an external signed payload." : null,
    "This canary receipt does not return unsigned transaction bytes; use the gated /api/web3-live-unsigned-order-handoff route before browser-wallet signing.",
    !actualLiveTradeTested ? "No confirmed live transaction signature has been recorded by this app." : null,
  ].filter((item): item is string => Boolean(item));

  return [...new Set(blockers)].slice(0, 12);
}

function buildLiveTradeCanaryRequiredInputs(input: {
  state: Web3TradingState;
  walletOwnership: ReturnType<typeof liveTradeCanaryWalletOwnershipStatus>;
  readyForExternalSignedPayload: boolean;
  actualLiveTradeTested: boolean;
  signature: string | null;
  postSigningEvidenceStatus: Web3LiveTradeCanaryReceipt["post_signing_evidence_status"];
}): Web3LiveTradeCanaryRequiredInput[] {
  const { state, walletOwnership, readyForExternalSignedPayload, actualLiveTradeTested, signature, postSigningEvidenceStatus } = input;
  const walletPublicKey = state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const walletScoped = Boolean(walletPublicKey);
  const dedicatedWalletScoped = typeof walletPublicKey === "string" &&
    isLikelySolanaPublicKey(walletPublicKey) &&
    walletPublicKey !== SAMPLE_SYSTEM_WALLET;
  const verifierWalletPublicKey = dedicatedWalletScoped ? walletPublicKey : null;
  const liveScopeReady = state.market_source.mode === "live-dex" && state.paper_account.mode === "persistent";
  const jupiterConfigured = Boolean(process.env.JUPITER_API_KEY);
  const liveFlagsReady = process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION === "true" &&
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL === "I_UNDERSTAND_REAL_FUNDS" &&
    process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF === "true";
  const canRequestUnsignedOrder = liveScopeReady && dedicatedWalletScoped && walletOwnership.current_for_canary && jupiterConfigured && liveFlagsReady;
  const hasRequestId = Boolean(state.signed_transaction_relay.request_id);
  const hasSignature = Boolean(signature);

  return [
    requiredInput({
      id: "dedicated-public-wallet",
      label: "Dedicated public wallet",
      status: dedicatedWalletScoped ? "done" : "needed-now",
      owner: "operator",
      safe_value_type: "Dedicated public Solana wallet address only; never a private key, seed phrase, keypair JSON, transaction bytes, or signed payload.",
      safe_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      target_names: ["wallet_public_key"],
      verifier_command: verifierWalletPublicKey
        ? `npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${verifierWalletPublicKey} --require-operator-wallet`
        : "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet",
      completion_signal: "A non-sample public Solana wallet is saved from the Trading live canary console; the sample all-ones wallet is rejected.",
    }),
    requiredInput({
      id: "wallet-ownership-proof",
      label: "Wallet ownership proof",
      status: dedicatedWalletScoped
        ? walletOwnership.current_for_canary ? "done" : "needed-now"
        : "blocked",
      owner: "external-wallet",
      safe_value_type: walletScoped
        ? "Hash-only browser-wallet text signature for the scoped public Solana wallet."
        : "Dedicated public Solana wallet address, then a hash-only browser-wallet text signature.",
      safe_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      target_names: ["wallet_public_key", "web3-wallet-ownership challenge hash"],
      verifier_command: dedicatedWalletScoped
        ? `npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${walletPublicKey} --require-operator-wallet`
        : null,
      completion_signal: "wallet_ownership_current_for_canary=true on /api/web3-live-trade-canary.",
    }),
    requiredInput({
      id: "jupiter-order-rail",
      label: "Jupiter order rail",
      status: jupiterConfigured ? "done" : "needed-now",
      owner: "operator",
      safe_value_type: "Jupiter API key installed only in ignored local server env; never paste it into chat or a client payload.",
      safe_surface: "/settings/integrations#web3-credential-action-console",
      target_names: ["JUPITER_API_KEY"],
      verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
      completion_signal: "Jupiter rehearsal and live unsigned-order preflight no longer report missing JUPITER_API_KEY.",
    }),
    requiredInput({
      id: "first-canary-live-flags",
      label: "First canary live flags",
      status: liveFlagsReady ? "done" : "needed-now",
      owner: "operator",
      safe_value_type: "Exact reviewed local env flag values for the one-shot tiny canary handoff.",
      safe_surface: "/settings/integrations#settings-web3-first-canary-live-flags",
      target_names: [
        "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
        "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
        "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
      ],
      verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-live-canary-flags",
      completion_signal: "live_execution_gate_enabled=true and unsigned-order handoff no longer reports missing live canary flags.",
    }),
    requiredInput({
      id: "unsigned-order-preflight",
      label: "Unsigned order preflight",
      status: hasRequestId ? "done" : canRequestUnsignedOrder ? "needed-now" : "blocked",
      owner: "operator",
      safe_value_type: "No-transaction preflight, then one-shot unsigned SOL-to-USDC canary order bytes returned only to the browser wallet flow.",
      safe_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      target_names: ["request_id", "route", "payload_hash", "amount_lamports", "slippage_bps"],
      verifier_command: "npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json",
      completion_signal: "current_request_id is present and signed_relay_accepts_payload=true.",
    }),
    requiredInput({
      id: "signed-payload-relay",
      label: "Signed payload relay",
      status: actualLiveTradeTested || hasSignature ? "done" : readyForExternalSignedPayload ? "external-signature" : "blocked",
      owner: "external-wallet",
      safe_value_type: "Externally signed browser-wallet transaction payload for the current one-shot request id only.",
      safe_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      target_names: ["request_id", "route", "signed_transaction"],
      verifier_command: null,
      completion_signal: "latest_signature_preview is present and signed_relay_status is relayed or confirmed.",
    }),
    requiredInput({
      id: "post-signing-proof",
      label: "Post-signing proof",
      status: postSigningEvidenceStatus === "settlement-accounted"
        ? "done"
        : hasSignature
          ? "proof-watch"
          : "blocked",
      owner: "system",
      safe_value_type: "Chain confirmation, settlement reconciliation, and local portfolio mirror proof for the tiny canary.",
      safe_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      target_names: ["signature_confirmation_poll", "settlement_fill_reconciliation", "portfolio_mirror_apply"],
      verifier_command: "npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json",
      completion_signal: "post_signing_evidence_status=settlement-accounted and actual_live_trade_tested=true.",
    }),
  ];
}

function requiredInput(
  input: Omit<Web3LiveTradeCanaryRequiredInput, "live_execution_permission" | "transaction_submission_permission" | "wallet_mutation_permission" | "secret_echo_permission">,
): Web3LiveTradeCanaryRequiredInput {
  return {
    ...input,
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
  };
}

function nextLiveTradeCanaryRequiredInput(inputs: Web3LiveTradeCanaryRequiredInput[]) {
  return inputs.find((item) => item.status === "needed-now") ??
    inputs.find((item) => item.status === "external-signature") ??
    inputs.find((item) => item.status === "proof-watch") ??
    inputs.find((item) => item.status === "blocked") ??
    null;
}

function liveTradeCanaryWalletOwnershipStatus(state: Web3TradingState, now: Date) {
  const walletPublicKey = state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  return getWeb3WalletOwnershipCanaryStatus(walletPublicKey, now);
}

function buildPostSigningEvidence(
  state: Web3TradingState,
  signature: string | null,
): Web3LiveTradeCanaryEvidenceItem[] {
  const relay = state.signed_transaction_relay;
  const confirmation = state.signature_confirmation_poll;
  const settlement = state.settlement_fill_reconciliation;
  const watchdog = state.autonomous_settlement_watchdog;
  const mirror = state.portfolio_mirror_apply;
  const relaySubmitted = Boolean(signature);
  const relayConfirmed = relay.status === "confirmed" ||
    confirmation?.status === "confirmed" ||
    isConfirmedStatus(relay.confirmation_status) ||
    isConfirmedStatus(confirmation?.confirmation_status);
  const settlementReconciled = settlement?.status === "reconciled" || watchdog?.status === "reconciled" || watchdog?.status === "mirrored";
  const mirrorAccounted = mirror?.status === "applied" || mirror?.status === "duplicate" || watchdog?.status === "mirrored" || watchdog?.status === "duplicate";

  return [
    {
      id: "signed-relay",
      label: "Signed relay",
      status: relaySubmitted ? "pass" : relay.can_accept_signed_payload ? "watch" : "fail",
      detail: relaySubmitted
        ? `Signature ${previewSignature(signature) ?? "recorded"} was relayed by the guarded canary path.`
        : relay.can_accept_signed_payload
          ? "The relay can accept one external signed payload for the current request."
          : "No live signed transaction has been relayed by this app.",
      next_action: relaySubmitted
        ? "Poll chain confirmation for the relayed signature before claiming a live trade test."
        : relay.can_accept_signed_payload
          ? "Use the browser wallet canary button with tiny caps, then inspect the relay receipt."
        : "Clear live DEX, wallet, signer, cap, and request-id gates before attempting a canary.",
    },
    {
      id: "chain-confirmation",
      label: "Chain confirmation",
      status: relayConfirmed ? "pass" : relaySubmitted || confirmation?.status === "pending" ? "watch" : "fail",
      detail: relayConfirmed
        ? `Confirmation status is ${relay.confirmation_status ?? confirmation?.confirmation_status ?? "recorded"}.`
        : relaySubmitted || confirmation?.status === "pending"
          ? "Confirmation polling is waiting on the signature."
          : "No confirmed chain status has been recorded for the signed payload.",
      next_action: relaySubmitted
        ? "Run the signature confirmation poll until the signature is confirmed or failed."
        : "Relay a signed canary transaction before polling confirmation.",
    },
    {
      id: "settlement-reconciliation",
      label: "Settlement reconciliation",
      status: settlementReconciled ? "pass" : settlement?.status === "pending" ? "watch" : relayConfirmed ? "watch" : "fail",
      detail: settlementReconciled
        ? `Settlement fill was reconciled${settlement?.fill_amount ? ` for ${settlement.fill_amount}` : ""}.`
        : settlement?.status === "ambiguous"
          ? "Settlement evidence is ambiguous and needs operator review."
          : "No provider/RPC fill reconciliation is attached to this live signature yet.",
      next_action: relayConfirmed
        ? "Run settlement reconciliation with wallet owner, mint, and max-fill cap evidence."
        : "Confirm the transaction before reconciling fills.",
    },
    {
      id: "portfolio-mirror",
      label: "Portfolio mirror",
      status: mirrorAccounted ? "pass" : settlementReconciled ? "watch" : "fail",
      detail: mirrorAccounted
        ? `Local portfolio mirror status is ${mirror?.status ?? watchdog?.status ?? "accounted"}.`
        : "The confirmed fill has not been applied or marked duplicate in the local portfolio mirror.",
      next_action: settlementReconciled
        ? "Apply or review the portfolio mirror patch before another canary."
        : "Reconcile settlement before updating the portfolio mirror.",
    },
  ];
}

function postSigningEvidenceStatusFrom(
  evidence: Web3LiveTradeCanaryEvidenceItem[],
  signature: string | null,
): Web3LiveTradeCanaryReceipt["post_signing_evidence_status"] {
  if (evidence.every((item) => item.status === "pass")) return "settlement-accounted";
  const firstOpen = evidence.find((item) => item.status !== "pass");
  if (firstOpen?.status === "fail" && firstOpen.id !== "signed-relay" && signature) return "review-required";
  if (!firstOpen || firstOpen.id === "signed-relay") return "needs-signed-relay";
  if (firstOpen.id === "chain-confirmation") return "needs-confirmation";
  if (firstOpen.id === "settlement-reconciliation") return "needs-settlement";
  return "needs-mirror-review";
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

function liveTradeCanaryActionNextAction(status: Web3LiveTradeCanaryActionReceipt["status"], blockers: string[]) {
  if (status === "live-relay-evidence-recorded") {
    return "Review confirmation, settlement, accounting, and position mirror evidence before allowing another canary.";
  }
  if (status === "relay-attempted") {
    return "Relay was attempted but no confirmed live trade is proven yet; poll confirmation and reconcile settlement before continuing.";
  }
  if (status === "unsafe-rejected") return "Remove unsafe fields and submit only the signed-payload canary contract.";
  return blockers[0] ?? "Submit operator acknowledgement, canary acknowledgement, request id, and external signed payload only after all live gates are ready.";
}

function previewSignature(signature: string | null) {
  if (!signature) return null;
  if (signature.length <= 14) return signature;
  return `${signature.slice(0, 6)}...${signature.slice(-6)}`;
}

function isConfirmedLiveRelay(
  state: Web3TradingState,
  latest: Web3TradingState["execution_audit"]["latest"],
) {
  return state.signed_transaction_relay.status === "confirmed" ||
    state.signature_confirmation_poll?.status === "confirmed" ||
    isConfirmedStatus(state.signed_transaction_relay.confirmation_status) ||
    isConfirmedStatus(state.signature_confirmation_poll?.confirmation_status) ||
    isConfirmedStatus(latest?.confirmation_status);
}

function isConfirmedStatus(status: "processed" | "confirmed" | "finalized" | null | undefined) {
  return status === "confirmed" || status === "finalized";
}

function isLikelySolanaPublicKey(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const SAMPLE_SYSTEM_WALLET = "11111111111111111111111111111111";

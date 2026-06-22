import { createHash } from "node:crypto";
import type { Web3LiveTradeCanaryReceipt } from "./web3-live-trade-canary";
import type { Web3LiveUsabilityBlockersReceipt } from "./web3-live-usability-blockers";
import type { Web3TradingState } from "./web3-trading";

export type Web3LiveIgnitionCheck = {
  id:
    | "live-scope"
    | "wallet-scope"
    | "wallet-ownership"
    | "route-order"
    | "signer-relay"
    | "autonomy-gate"
    | "canary-proof"
    | "safety-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
  next_action: string;
  evidence_endpoint: string;
};

export type Web3LiveIgnitionReceipt = {
  mode: "web3-live-ignition";
  status: "blocked" | "supervised-canary-ready" | "canary-proven" | "autonomy-ready";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  can_autonomously_trade_real_money_now: boolean;
  can_start_supervised_canary_now: boolean;
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  first_trade_path: "blocked" | "supervised-browser-wallet-canary" | "post-canary-autonomy-review" | "autonomous-policy-wallet";
  next_gate_id: Web3LiveIgnitionCheck["id"] | null;
  next_gate_label: string | null;
  next_action: string;
  blocker_count: number;
  blockers: string[];
  checks: Web3LiveIgnitionCheck[];
  verifier_command: string;
  canary_endpoint: string;
  unsigned_handoff_endpoint: string;
  live_usability_endpoint: string;
  transaction_submission_permission: "blocked" | "external-signed-payload-only" | "autonomous-policy-wallet";
  live_execution_permission: "blocked" | "supervised-canary-only" | "autonomous-policy-wallet";
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3LiveIgnitionHealth = {
  mode: "web3-live-ignition-health";
  status: Web3LiveIgnitionReceipt["status"];
  source_endpoint: string;
  live_review_source_endpoint: string;
  can_autonomously_trade_real_money_now: boolean;
  can_start_supervised_canary_now: boolean;
  actual_live_trade_tested: boolean;
  next_gate_label: string | null;
  blocker_count: number;
};

export type Web3LiveIgnitionActionMode = "prepare-supervised-canary" | "prepare-autonomous-live";

export type Web3LiveIgnitionLaunchEnvelope = {
  kind: "none" | "supervised-browser-wallet-canary" | "autonomous-policy-wallet-daemon";
  summary: string;
  preflight_endpoint: string | null;
  unsigned_handoff_endpoint: string | null;
  canary_endpoint: string | null;
  ignition_endpoint: string;
  daemon_command: string | null;
  required_acknowledgements: string[];
  body_contract: string[];
  forbidden_fields: string[];
  transaction_bytes_return: "blocked" | "one-shot-unsigned-only-after-separate-handoff";
  signed_payload_storage: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
};

export type Web3LiveIgnitionActionReceipt = {
  mode: "web3-live-ignition-action";
  status: "blocked" | "unsafe-rejected" | "canary-envelope-ready" | "autonomy-launch-envelope-ready";
  generated_at: string;
  receipt_hash: string;
  action: Web3LiveIgnitionActionMode;
  operator_acknowledged: boolean;
  live_capital_acknowledged: boolean;
  source: Web3LiveIgnitionReceipt["source"];
  account: Web3LiveIgnitionReceipt["account"];
  scenario: Web3LiveIgnitionReceipt["scenario"];
  ignition_status: Web3LiveIgnitionReceipt["status"];
  can_autonomously_trade_real_money_now: boolean;
  can_start_supervised_canary_now: boolean;
  actual_live_trade_tested: boolean;
  real_funds_moved_by_this_app: boolean;
  unsafe_field_count: number;
  unsafe_fields: string[];
  launch_envelope: Web3LiveIgnitionLaunchEnvelope;
  blockers: string[];
  next_action: string;
  transaction_submission_permission: Web3LiveIgnitionReceipt["transaction_submission_permission"];
  live_execution_permission: Web3LiveIgnitionReceipt["live_execution_permission"];
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export function buildWeb3LiveIgnitionReceipt(input: {
  state: Web3TradingState;
  liveUsability: Web3LiveUsabilityBlockersReceipt;
  canary: Web3LiveTradeCanaryReceipt;
  now?: Date;
}): Web3LiveIgnitionReceipt {
  const { state, liveUsability, canary } = input;
  const checks = buildLiveIgnitionChecks(state, liveUsability, canary);
  const firstOpen = checks.find((check) => check.status !== "pass") ?? null;
  const canStartSupervisedCanary = canary.status === "ready-for-external-signed-payload" &&
    state.market_source.mode === "live-dex" &&
    state.paper_account.mode === "persistent";
  const canAutonomouslyTrade = state.autonomous_live_autonomy_readiness.can_trade_real_capital &&
    state.autonomous_live_autonomy_readiness.can_run_unattended &&
    canary.actual_live_trade_tested &&
    canary.post_signing_evidence_status === "settlement-accounted" &&
    liveUsability.real_capital_blocker_count === 0;
  const status: Web3LiveIgnitionReceipt["status"] = canAutonomouslyTrade
    ? "autonomy-ready"
    : canary.actual_live_trade_tested
      ? "canary-proven"
      : canStartSupervisedCanary
        ? "supervised-canary-ready"
        : "blocked";
  const blockers = [
    ...checks.filter((check) => check.status === "fail").map((check) => `${check.label}: ${check.detail}`),
    ...liveUsability.missing_for_live_usability.slice(0, 6).map((item) => `${item.label}: ${item.next_action}`),
  ];
  const dedupedBlockers = [...new Set(blockers)].slice(0, 12);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const receiptBase = {
    mode: "web3-live-ignition" as const,
    status,
    generated_at: generatedAt,
    source: state.market_source.mode,
    account: state.paper_account.mode,
    scenario: state.scenario,
    can_autonomously_trade_real_money_now: canAutonomouslyTrade,
    can_start_supervised_canary_now: canStartSupervisedCanary,
    actual_live_trade_tested: canary.actual_live_trade_tested,
    real_funds_moved_by_this_app: canary.real_funds_moved_by_this_app,
    first_trade_path: firstTradePath(status),
    next_gate_id: firstOpen?.id ?? null,
    next_gate_label: firstOpen?.label ?? null,
    next_action: liveIgnitionNextAction(status, firstOpen, canary, liveUsability),
    blocker_count: dedupedBlockers.length,
    blockers: dedupedBlockers,
    checks,
    verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-operator-wallet --require-jupiter-order --require-dex-live --require-live-canary",
    canary_endpoint: "/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    unsigned_handoff_endpoint: "/api/web3-live-unsigned-order-handoff?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    live_usability_endpoint: "/api/web3-live-usability-blockers?source=live-dex&account=persistent&scenario=breakout&cycles=0&rows=all",
    transaction_submission_permission: canAutonomouslyTrade
      ? "autonomous-policy-wallet" as const
      : canStartSupervisedCanary || canary.actual_live_trade_tested
        ? "external-signed-payload-only" as const
        : "blocked" as const,
    live_execution_permission: canAutonomouslyTrade
      ? "autonomous-policy-wallet" as const
      : canStartSupervisedCanary || canary.actual_live_trade_tested
        ? "supervised-canary-only" as const
        : "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This receipt is the bot-facing go/no-go for the first real-money Web3 ignition attempt.",
      "It does not sign, submit, request transaction bytes, custody funds, mutate wallets, or store wallet authority.",
      "Autonomous real-money trading remains false until a supervised canary is relayed, confirmed, reconciled, and mirrored.",
      "The only pre-canary live path is the supervised browser-wallet handoff with tiny caps and explicit operator acknowledgement.",
      "Private keys, seed phrases, keypair JSON, API key values, raw transactions, signed payload storage, and secret echo remain blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function buildWeb3LiveIgnitionActionReceipt(input: {
  ignition: Web3LiveIgnitionReceipt;
  action: Web3LiveIgnitionActionMode;
  operatorAcknowledged: boolean;
  liveCapitalAcknowledged: boolean;
  unsafeFields?: string[];
  now?: Date;
}): Web3LiveIgnitionActionReceipt {
  const unsafeFields = input.unsafeFields ?? [];
  const blockers = [
    ...unsafeFields.map((field) => `Unsafe field rejected: ${field}.`),
    !input.operatorAcknowledged ? "operator_ack must be true before a live ignition envelope can be prepared." : null,
    !input.liveCapitalAcknowledged ? "live_capital_ack must equal I_UNDERSTAND_REAL_FUNDS." : null,
    input.action === "prepare-supervised-canary" && !input.ignition.can_start_supervised_canary_now
      ? "Supervised canary envelope is blocked until ignition says can_start_supervised_canary_now=true."
      : null,
    input.action === "prepare-autonomous-live" && !input.ignition.can_autonomously_trade_real_money_now
      ? "Autonomous live launch envelope is blocked until ignition says can_autonomously_trade_real_money_now=true."
      : null,
    input.action === "prepare-autonomous-live" && !input.ignition.actual_live_trade_tested
      ? "Autonomous live launch requires a funded canary proof before any daemon envelope is emitted."
      : null,
    ...input.ignition.blockers,
  ].filter((item): item is string => Boolean(item));
  const status: Web3LiveIgnitionActionReceipt["status"] = unsafeFields.length > 0
    ? "unsafe-rejected"
    : input.action === "prepare-autonomous-live" &&
        input.operatorAcknowledged &&
        input.liveCapitalAcknowledged &&
        input.ignition.can_autonomously_trade_real_money_now
      ? "autonomy-launch-envelope-ready"
      : input.action === "prepare-supervised-canary" &&
          input.operatorAcknowledged &&
          input.liveCapitalAcknowledged &&
          input.ignition.can_start_supervised_canary_now
        ? "canary-envelope-ready"
        : "blocked";
  const generatedAt = (input.now ?? new Date()).toISOString();
  const dedupedBlockers = [...new Set(blockers)].slice(0, 12);
  const receiptBase = {
    mode: "web3-live-ignition-action" as const,
    status,
    generated_at: generatedAt,
    action: input.action,
    operator_acknowledged: input.operatorAcknowledged,
    live_capital_acknowledged: input.liveCapitalAcknowledged,
    source: input.ignition.source,
    account: input.ignition.account,
    scenario: input.ignition.scenario,
    ignition_status: input.ignition.status,
    can_autonomously_trade_real_money_now: input.ignition.can_autonomously_trade_real_money_now,
    can_start_supervised_canary_now: input.ignition.can_start_supervised_canary_now,
    actual_live_trade_tested: input.ignition.actual_live_trade_tested,
    real_funds_moved_by_this_app: input.ignition.real_funds_moved_by_this_app,
    unsafe_field_count: unsafeFields.length,
    unsafe_fields: unsafeFields,
    launch_envelope: liveIgnitionLaunchEnvelope(input.ignition, input.action, status),
    blockers: dedupedBlockers,
    next_action: liveIgnitionActionNextAction(status, input.action, dedupedBlockers, input.ignition),
    transaction_submission_permission: status === "autonomy-launch-envelope-ready"
      ? input.ignition.transaction_submission_permission
      : status === "canary-envelope-ready"
        ? "external-signed-payload-only" as const
        : "blocked" as const,
    live_execution_permission: status === "autonomy-launch-envelope-ready"
      ? input.ignition.live_execution_permission
      : status === "canary-envelope-ready"
        ? "supervised-canary-only" as const
        : "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This action receipt prepares a launch envelope only; it does not sign, submit, custody funds, mutate wallets, or store transaction bytes.",
      "Supervised canary envelopes still require the separate browser-wallet unsigned handoff and guarded canary relay.",
      "Autonomous live envelopes are emitted only after ignition proves a funded canary, settlement reconciliation, and portfolio mirror accounting.",
      "Private keys, seed phrases, keypair JSON, API key values, raw transactions, signed payload storage, and secret echo remain blocked.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function buildWeb3LiveIgnitionHealth(receipt: Web3LiveIgnitionReceipt): Web3LiveIgnitionHealth {
  return {
    mode: "web3-live-ignition-health",
    status: receipt.status,
    source_endpoint: `/api/web3-live-ignition?source=${receipt.source}&account=${receipt.account}&scenario=${receipt.scenario}&cycles=0`,
    live_review_source_endpoint: "/api/web3-live-ignition?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    can_autonomously_trade_real_money_now: receipt.can_autonomously_trade_real_money_now,
    can_start_supervised_canary_now: receipt.can_start_supervised_canary_now,
    actual_live_trade_tested: receipt.actual_live_trade_tested,
    next_gate_label: receipt.next_gate_label,
    blocker_count: receipt.blocker_count,
  };
}

function liveIgnitionLaunchEnvelope(
  ignition: Web3LiveIgnitionReceipt,
  action: Web3LiveIgnitionActionMode,
  status: Web3LiveIgnitionActionReceipt["status"],
): Web3LiveIgnitionLaunchEnvelope {
  if (status === "canary-envelope-ready") {
    return {
      kind: "supervised-browser-wallet-canary",
      summary: "Prepare exactly one tiny browser-wallet canary; the next route still must return through the unsigned handoff and signed canary relay.",
      preflight_endpoint: ignition.unsigned_handoff_endpoint,
      unsigned_handoff_endpoint: ignition.unsigned_handoff_endpoint,
      canary_endpoint: ignition.canary_endpoint,
      ignition_endpoint: `/api/web3-live-ignition?source=${ignition.source}&account=${ignition.account}&scenario=${ignition.scenario}&cycles=0`,
      daemon_command: null,
      required_acknowledgements: [
        "operator_ack=true",
        "live_capital_ack=I_UNDERSTAND_REAL_FUNDS",
        "canary_ack=I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
        "return_unsigned_transaction_ack=true",
      ],
      body_contract: [
        "wallet_public_key: public Solana address only",
        "amount_lamports: tiny first canary, max 1000000",
        "max_slippage_bps: max 100",
        "signed_transaction: accepted only by /api/web3-live-trade-canary after external wallet signing",
        "request_id: must match the one-shot unsigned handoff",
      ],
      forbidden_fields: neverProvideFields(),
      transaction_bytes_return: "one-shot-unsigned-only-after-separate-handoff",
      signed_payload_storage: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
    };
  }

  if (status === "autonomy-launch-envelope-ready") {
    return {
      kind: "autonomous-policy-wallet-daemon",
      summary: "Autonomous live daemon launch envelope is ready for external review; hard caps, kill switch, and accounting monitors must stay attached.",
      preflight_endpoint: "/api/web3-live-autonomy-readiness?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      unsigned_handoff_endpoint: null,
      canary_endpoint: ignition.canary_endpoint,
      ignition_endpoint: `/api/web3-live-ignition?source=${ignition.source}&account=${ignition.account}&scenario=${ignition.scenario}&cycles=0`,
      daemon_command: "npm run daemon:web3 -- --base-url=http://localhost:4010 --source=live-dex --scenario=breakout --ticks=1 --heartbeat-when-gated --json",
      required_acknowledgements: [
        "operator_ack=true",
        "live_capital_ack=I_UNDERSTAND_REAL_FUNDS",
        "funded canary proof chain: relay, confirmation, settlement, mirror",
      ],
      body_contract: [
        "policy signer provider must already be reviewed",
        "live trade caps and daily loss caps must already be active",
        "emergency stop and accounting export targets must already be checked",
        "daemon runner must keep one-tick bounded launch until post-launch review passes",
      ],
      forbidden_fields: neverProvideFields(),
      transaction_bytes_return: "blocked",
      signed_payload_storage: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
    };
  }

  return {
    kind: "none",
    summary: action === "prepare-autonomous-live"
      ? "Autonomous launch envelope is blocked until ignition proves real-money autonomy readiness."
      : "Supervised canary envelope is blocked until ignition proves the tiny canary handoff can start.",
    preflight_endpoint: null,
    unsigned_handoff_endpoint: null,
    canary_endpoint: ignition.canary_endpoint,
    ignition_endpoint: `/api/web3-live-ignition?source=${ignition.source}&account=${ignition.account}&scenario=${ignition.scenario}&cycles=0`,
    daemon_command: null,
    required_acknowledgements: [
      "operator_ack=true",
      "live_capital_ack=I_UNDERSTAND_REAL_FUNDS",
    ],
    body_contract: [],
    forbidden_fields: neverProvideFields(),
    transaction_bytes_return: "blocked",
    signed_payload_storage: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
  };
}

function liveIgnitionActionNextAction(
  status: Web3LiveIgnitionActionReceipt["status"],
  action: Web3LiveIgnitionActionMode,
  blockers: string[],
  ignition: Web3LiveIgnitionReceipt,
) {
  if (status === "canary-envelope-ready") {
    return "Run the unsigned handoff preflight, sign the tiny one-shot transaction in the browser wallet, relay it through the canary endpoint, then watch confirmation and settlement.";
  }
  if (status === "autonomy-launch-envelope-ready") {
    return "Launch only one bounded live daemon tick under external review, then stop for settlement, accounting, and kill-switch review.";
  }
  if (status === "unsafe-rejected") return "Remove unsafe fields and request only the ignition action envelope contract.";
  return blockers[0] ?? (action === "prepare-autonomous-live"
    ? ignition.next_action
    : "Clear supervised canary blockers before requesting a live canary envelope.");
}

function neverProvideFields() {
  return [
    "private_key",
    "seed_phrase",
    "mnemonic",
    "keypair_json",
    "api_key_value",
    "raw_transaction",
    "unsigned_transaction",
    "signed_payload",
    "transaction_bytes",
  ];
}

function buildLiveIgnitionChecks(
  state: Web3TradingState,
  liveUsability: Web3LiveUsabilityBlockersReceipt,
  canary: Web3LiveTradeCanaryReceipt,
): Web3LiveIgnitionCheck[] {
  const walletCheck = state.execution_readiness.checks.find((check) => check.id === "wallet");
  const jupiterCheck = state.execution_readiness.checks.find((check) => check.id === "jupiter");
  const liveFlagsReady = state.live_execution_arming.checks.every((check) => check.status === "pass");
  const sourceReady = state.market_source.mode === "live-dex" && state.paper_account.mode === "persistent";
  const canaryWalletInput = canary.required_inputs.find((item) => item.id === "dedicated-public-wallet");
  const walletReady = canaryWalletInput?.status === "done";
  const walletScopeNextAction = "Save a dedicated public Solana trading wallet address in the Trading live canary console; do not paste private keys or seed phrases.";
  const walletOwnershipReady = isWalletOwnershipReady(liveUsability);
  const routeReady = jupiterCheck?.status === "pass" && state.autonomous_order_handoff.status !== "blocked";
  const signerReady = state.signed_transaction_relay.can_accept_signed_payload || state.autonomous_signer_ops.can_request_signature;
  const autonomyReady = state.autonomous_live_autonomy_readiness.can_trade_real_capital &&
    state.autonomous_live_autonomy_readiness.can_run_unattended;
  const canaryProofReady = canary.actual_live_trade_tested && canary.post_signing_evidence_status === "settlement-accounted";

  return [
    {
      id: "live-scope",
      label: "Live scope",
      status: sourceReady ? "pass" : "fail",
      detail: sourceReady
        ? "The ignition receipt is scoped to live DEX data and a persistent account."
        : "Open source=live-dex with account=persistent before any live canary can be considered.",
      next_action: sourceReady ? "Keep live source/account scope pinned for the canary." : "Open the live DEX trading cockpit.",
      evidence_endpoint: "/trading?source=live-dex&account=persistent",
    },
    {
      id: "wallet-scope",
      label: "Wallet scope",
      status: walletReady ? "pass" : "fail",
      detail: walletReady
        ? walletCheck?.detail ?? "A non-sample public wallet is present in canary readiness."
        : "The canary receipt still needs a dedicated non-sample public Solana wallet.",
      next_action: walletReady
        ? "Prove wallet ownership before the canary if not already recorded."
        : walletScopeNextAction,
      evidence_endpoint: canaryWalletInput?.safe_surface ?? "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
    },
    {
      id: "wallet-ownership",
      label: "Wallet ownership proof",
      status: !walletReady ? "watch" : walletOwnershipReady ? "pass" : "fail",
      detail: !walletReady
        ? "A dedicated public wallet must be scoped before ownership can be proven."
        : walletOwnershipReady
          ? "A hash-only browser-wallet text signature proof is recorded for the dedicated wallet."
          : "The dedicated wallet still needs a browser-wallet text signature proof before any unsigned canary order.",
      next_action: !walletReady
        ? walletScopeNextAction
        : walletOwnershipReady
          ? "Keep the hash-only ownership receipt attached to the first canary review."
          : "Run Prove ownership with the connected browser wallet; this signs text only and cannot move funds.",
      evidence_endpoint: "/trading?source=live-dex&account=persistent",
    },
    {
      id: "route-order",
      label: "Route and order",
      status: routeReady ? "pass" : jupiterCheck?.status === "pass" ? "watch" : "fail",
      detail: routeReady
        ? "Jupiter/order handoff evidence is available for the canary route."
        : jupiterCheck?.detail ?? "Jupiter route/order proof is still missing.",
      next_action: routeReady ? "Keep order TTL and slippage caps inside the canary limits." : "Configure Jupiter in ignored server env and run the order rehearsal.",
      evidence_endpoint: "/api/web3-jupiter-order-packet?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    },
    {
      id: "signer-relay",
      label: "Signer relay",
      status: signerReady ? "pass" : canary.status === "ready-for-external-signed-payload" ? "watch" : "fail",
      detail: signerReady
        ? "A signed-payload relay or reviewed signer request path is available."
        : "No external signed-payload relay or policy signer path is currently ready.",
      next_action: signerReady ? "Use only the guarded tiny-canary relay until proof is recorded." : "Choose browser wallet, Privy, Turnkey, or another policy signer path without storing private keys.",
      evidence_endpoint: "/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    },
    {
      id: "autonomy-gate",
      label: "Autonomy gate",
      status: autonomyReady ? "pass" : liveFlagsReady ? "watch" : "fail",
      detail: autonomyReady
        ? state.autonomous_live_autonomy_readiness.summary
        : state.autonomous_live_autonomy_readiness.next_action,
      next_action: autonomyReady ? "Hold autonomy until canary proof and accounting are complete." : liveUsability.next_action,
      evidence_endpoint: "/api/web3-live-autonomy-readiness?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    },
    {
      id: "canary-proof",
      label: "Canary proof",
      status: canaryProofReady ? "pass" : canary.actual_live_trade_tested ? "watch" : "fail",
      detail: canaryProofReady
        ? "A funded canary has been relayed, confirmed, reconciled, and mirrored."
        : canary.actual_live_trade_tested
          ? "A signed relay exists, but confirmation, settlement, or mirror evidence still needs review."
          : "No funded live trade has been tested by this app yet.",
      next_action: canary.post_signing_next_action,
      evidence_endpoint: "/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    },
    {
      id: "safety-boundary",
      label: "Safety boundary",
      status: "pass",
      detail: "Ignition receipts are read-only; private keys, seed phrases, raw transactions, signed payload storage, wallet mutation, and secret echo stay blocked.",
      next_action: "Use the receipt as a go/no-go contract, not as a signer or executor.",
      evidence_endpoint: "/api/web3-live-ignition?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    },
  ];
}

function isWalletOwnershipReady(liveUsability: Web3LiveUsabilityBlockersReceipt) {
  if (liveUsability.current_input?.id === "wallet-ownership-proof") return false;
  if (liveUsability.next_blocker?.id.includes("wallet-ownership")) return false;
  return !liveUsability.missing_for_live_usability.some((item) =>
    item.id.includes("wallet-ownership") ||
    (item.id === "runway:wallet" && item.next_action.toLowerCase().includes("prove ownership"))
  );
}

function firstTradePath(status: Web3LiveIgnitionReceipt["status"]): Web3LiveIgnitionReceipt["first_trade_path"] {
  if (status === "autonomy-ready") return "autonomous-policy-wallet";
  if (status === "canary-proven") return "post-canary-autonomy-review";
  if (status === "supervised-canary-ready") return "supervised-browser-wallet-canary";
  return "blocked";
}

function liveIgnitionNextAction(
  status: Web3LiveIgnitionReceipt["status"],
  firstOpen: Web3LiveIgnitionCheck | null,
  canary: Web3LiveTradeCanaryReceipt,
  liveUsability: Web3LiveUsabilityBlockersReceipt,
) {
  if (status === "autonomy-ready") return "Autonomous policy-wallet trading can be reviewed for activation; keep hard caps and kill-switch monitoring enabled.";
  if (status === "canary-proven") return canary.post_signing_next_action;
  if (status === "supervised-canary-ready") return "Run exactly one operator-approved tiny browser-wallet canary, then wait for confirmation, settlement reconciliation, and portfolio mirror evidence.";
  return firstOpen?.next_action ?? liveUsability.next_action;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

import { createHash } from "node:crypto";
import type { Web3LiveTradeCanaryReceipt } from "./web3-live-trade-canary";
import type { Web3LiveUsabilityBlockersReceipt } from "./web3-live-usability-blockers";
import type { Web3TradingState } from "./web3-trading";

export type Web3LiveIgnitionCheck = {
  id:
    | "live-scope"
    | "wallet-scope"
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
    verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-operator-wallet --require-jupiter-order --require-dex-live",
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

function buildLiveIgnitionChecks(
  state: Web3TradingState,
  liveUsability: Web3LiveUsabilityBlockersReceipt,
  canary: Web3LiveTradeCanaryReceipt,
): Web3LiveIgnitionCheck[] {
  const walletCheck = state.execution_readiness.checks.find((check) => check.id === "wallet");
  const jupiterCheck = state.execution_readiness.checks.find((check) => check.id === "jupiter");
  const liveFlagsReady = state.live_execution_arming.checks.every((check) => check.status === "pass");
  const sourceReady = state.market_source.mode === "live-dex" && state.paper_account.mode === "persistent";
  const walletReady = walletCheck?.status === "pass";
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
        ? walletCheck?.detail ?? "A non-sample public wallet is present in execution readiness."
        : walletCheck?.detail ?? "A dedicated non-sample public wallet is still missing.",
      next_action: walletReady ? "Prove wallet ownership before the canary if not already recorded." : "Add only the public Solana wallet address in Settings.",
      evidence_endpoint: "/settings/integrations#settings-web3-wallet-public-key",
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

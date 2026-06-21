import { createHash } from "node:crypto";
import type { Web3DedicatedWalletPacket } from "./web3-dedicated-wallet-packet";
import type { Web3JupiterOrderPacket } from "./web3-jupiter-order-packet";
import type { Web3LiveCapitalPreflightReceipt } from "./web3-live-capital-preflight";
import type { Web3LiveIgnitionReceipt } from "./web3-live-ignition";
import type { Web3LiveTradeCanaryReceipt } from "./web3-live-trade-canary";
import type { Web3LiveUnsignedOrderPreflightReceipt } from "./web3-live-unsigned-order-handoff";
import type { Web3SignerCredentialPacket } from "./web3-signer-credential-packet";
import type { Web3TradingState } from "./web3-trading";

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
    ignition_endpoint: `/api/web3-live-ignition?${endpointParams}`,
    unsigned_handoff_endpoint: `/api/web3-live-unsigned-order-handoff?${endpointParams}`,
    canary_endpoint: `/api/web3-live-trade-canary?${endpointParams}`,
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
      status: input.wallet.wallet_ownership_proved ? "pass" : input.wallet.dedicated_wallet_scoped ? "fail" : "watch",
      detail: input.wallet.wallet_ownership_proved ? "A hash-only text-message ownership receipt is present." : "The dedicated wallet still needs a browser-wallet text signature proof.",
      next_action: input.wallet.wallet_ownership_proved ? "Use the hash-only receipt as first-canary review evidence." : "Run Prove ownership; this signs text only and cannot move funds.",
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
      next_action: signerRelayReady ? "Relay only the matching externally signed canary payload, then stop for confirmation/accounting." : input.signer.next_action,
      evidence_endpoint: "/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      blocks_first_canary: true,
    },
    {
      id: "manual-live-review",
      label: "Manual live review",
      status: input.livePreflight.live_review_permitted ? "pass" : "fail",
      detail: input.livePreflight.live_review_permitted ? "Manual live executor review can begin." : input.livePreflight.summary,
      next_action: input.livePreflight.live_review_permitted ? "Keep review attached through the canary and settlement proof." : input.livePreflight.next_action,
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

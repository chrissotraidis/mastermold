import { createHash } from "node:crypto";
import type { Web3DedicatedWalletPacket } from "./web3-dedicated-wallet-packet";
import type { Web3JupiterOrderPacket } from "./web3-jupiter-order-packet";
import type { Web3LiveOpsPacket } from "./web3-live-ops-packet";
import type { Web3SignerCredentialPacket } from "./web3-signer-credential-packet";
import type { Web3TradingState } from "./web3-trading";

export type Web3SupervisedLiveRunwayStatus =
  | "missing-wallet"
  | "missing-jupiter"
  | "missing-signer"
  | "missing-ops"
  | "manual-review-needed"
  | "blocked";

export type Web3SupervisedLiveRunwayLane = {
  id: "wallet" | "jupiter" | "signer" | "ops" | "accounting" | "manual-review";
  label: string;
  status: "ready" | "needed" | "blocked" | "review";
  detail: string;
  next_action: string;
  evidence: string[];
};

export type Web3SupervisedLiveRunway = {
  mode: "web3-supervised-live-runway";
  status: Web3SupervisedLiveRunwayStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  launch_model: "supervised-external-wallet-first";
  can_request_live_review: boolean;
  ready_lane_count: number;
  total_lane_count: number;
  missing_required: string[];
  next_action: string;
  lanes: Web3SupervisedLiveRunwayLane[];
  safe_commands: string[];
  wallet_packet_status: Web3DedicatedWalletPacket["status"];
  jupiter_packet_status: Web3JupiterOrderPacket["status"];
  signer_packet_status: Web3SignerCredentialPacket["status"];
  live_ops_packet_status: Web3LiveOpsPacket["status"];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "external-wallet-prompt-only";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
  summary: string;
};

export function buildWeb3SupervisedLiveRunway(input: {
  state: Web3TradingState;
  wallet: Web3DedicatedWalletPacket;
  jupiter: Web3JupiterOrderPacket;
  signer: Web3SignerCredentialPacket;
  liveOps: Web3LiveOpsPacket;
  now?: Date;
}): Web3SupervisedLiveRunway {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const lanes = buildRunwayLanes(input);
  const missingRequired = lanes
    .filter((lane) => lane.status === "needed" || lane.status === "blocked")
    .map((lane) => lane.next_action)
    .filter(Boolean)
    .slice(0, 10);
  const readyLaneCount = lanes.filter((lane) => lane.status === "ready" || lane.status === "review").length;
  const status = supervisedLiveRunwayStatus(input, lanes);
  const canRequestLiveReview = status === "manual-review-needed";
  const receiptBase = {
    mode: "web3-supervised-live-runway" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: input.state.market_source.fetched_at,
    launch_model: "supervised-external-wallet-first" as const,
    can_request_live_review: canRequestLiveReview,
    ready_lane_count: readyLaneCount,
    total_lane_count: lanes.length,
    missing_required: missingRequired,
    next_action: supervisedLiveNextAction(status, lanes),
    lanes,
    safe_commands: [
      "npm run verify:web3 -- --base-url=http://localhost:4010",
      "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet",
      "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
      "npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json",
    ],
    wallet_packet_status: input.wallet.status,
    jupiter_packet_status: input.jupiter.status,
    signer_packet_status: input.signer.status,
    live_ops_packet_status: input.liveOps.status,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "external-wallet-prompt-only" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This runway is a review checklist only; it cannot sign, submit, custody funds, mutate wallets, or grant live execution.",
      "The first live posture is supervised external-wallet approval, so every real signature still requires a wallet prompt outside Mastermind.",
      "Secrets are represented as configured/missing target names only; raw Helius, Jupiter, webhook, signer, and accounting values are never returned.",
      "Manual live review remains an external decision after wallet, Jupiter, signer, ops, accounting, settlement, and paper-supervisor evidence are ready.",
    ],
    summary: supervisedLiveSummary(status, readyLaneCount, lanes.length),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function buildRunwayLanes(input: {
  wallet: Web3DedicatedWalletPacket;
  jupiter: Web3JupiterOrderPacket;
  signer: Web3SignerCredentialPacket;
  liveOps: Web3LiveOpsPacket;
}): Web3SupervisedLiveRunwayLane[] {
  const walletReady = input.wallet.status === "strict-verifier-ready" || input.wallet.status === "review-ready";
  const jupiterReady = input.jupiter.status === "review-ready";
  const signerReady = input.signer.status === "review-ready";
  const opsReady = input.liveOps.status === "manual-review-needed";
  const accountingReady = input.liveOps.accounting_export_configured;

  return [
    {
      id: "wallet",
      label: "Dedicated wallet",
      status: walletReady ? "ready" : input.wallet.status === "sample-wallet" ? "blocked" : "needed",
      detail: input.wallet.summary,
      next_action: walletReady ? "Run strict operator-wallet verification before live review." : input.wallet.next_action,
      evidence: [
        input.wallet.wallet_public_key_preview ? `Wallet ${input.wallet.wallet_public_key_preview}` : "Wallet missing",
        input.wallet.wallet_ownership_proved ? "Ownership proof hash present" : "Ownership proof missing",
      ],
    },
    {
      id: "jupiter",
      label: "Jupiter order rail",
      status: jupiterReady ? "ready" : "needed",
      detail: input.jupiter.summary,
      next_action: jupiterReady ? "Run strict Jupiter order verifier and keep transaction bytes withheld." : input.jupiter.next_action,
      evidence: [
        input.jupiter.jupiter_configured ? "Jupiter key configured" : "Jupiter key missing",
        input.jupiter.swap_v2_order_ready ? "Order rehearsal ready" : "Order rehearsal missing",
      ],
    },
    {
      id: "signer",
      label: "Signer posture",
      status: signerReady ? "ready" : input.signer.status === "blocked" ? "blocked" : "needed",
      detail: input.signer.summary,
      next_action: signerReady ? "Keep manual external wallet approval for the first supervised-live review." : input.signer.next_action,
      evidence: [
        `Selected ${input.signer.selected_path.label}`,
        input.signer.wallet_ownership_proved ? "Wallet proof present" : "Wallet proof missing",
      ],
    },
    {
      id: "ops",
      label: "Live operations",
      status: opsReady ? "review" : input.liveOps.status === "blocked" ? "blocked" : "needed",
      detail: input.liveOps.summary,
      next_action: opsReady ? "Prepare external process-manager and alerting review materials." : input.liveOps.next_action,
      evidence: [
        input.liveOps.production_supervisor_fresh ? "Supervisor receipt fresh" : "Supervisor receipt stale/missing",
        input.liveOps.emergency_stop_configured ? "Emergency stop target configured" : "Emergency stop target missing",
      ],
    },
    {
      id: "accounting",
      label: "Accounting export",
      status: accountingReady ? "review" : "needed",
      detail: `Accounting boundary is ${input.liveOps.accounting_boundary}; settlement is ${input.liveOps.settlement_status}.`,
      next_action: accountingReady
        ? "Keep export paper-only until settlement/fill reconciliation and CPA review pass."
        : "Set MASTERMOLD_TAX_LEDGER_EXPORT_PATH or choose an external accounting workflow.",
      evidence: [
        accountingReady ? "Export target configured" : "Export target missing",
        `Mirror ${input.liveOps.portfolio_mirror_status}`,
      ],
    },
    {
      id: "manual-review",
      label: "Manual live review",
      status: walletReady && jupiterReady && signerReady && opsReady && accountingReady ? "review" : "blocked",
      detail: "A human operator must approve the final supervised-live executor boundary after every packet is ready.",
      next_action: "Keep live flags unset until external review approves process, signer, settlement, and emergency-stop controls.",
      evidence: [
        "Live flags must remain unset",
        "Execution remains blocked inside Mastermind",
      ],
    },
  ];
}

function supervisedLiveRunwayStatus(
  input: {
    wallet: Web3DedicatedWalletPacket;
    jupiter: Web3JupiterOrderPacket;
    signer: Web3SignerCredentialPacket;
    liveOps: Web3LiveOpsPacket;
  },
  lanes: Web3SupervisedLiveRunwayLane[],
): Web3SupervisedLiveRunwayStatus {
  if (input.liveOps.status === "blocked" || input.signer.status === "blocked") return "blocked";
  if (!isLaneReady(lanes, "wallet")) return "missing-wallet";
  if (!isLaneReady(lanes, "jupiter")) return "missing-jupiter";
  if (!isLaneReady(lanes, "signer")) return "missing-signer";
  if (!isLaneReady(lanes, "ops") || !isLaneReady(lanes, "accounting")) return "missing-ops";
  return "manual-review-needed";
}

function isLaneReady(lanes: Web3SupervisedLiveRunwayLane[], id: Web3SupervisedLiveRunwayLane["id"]) {
  const lane = lanes.find((item) => item.id === id);
  return lane?.status === "ready" || lane?.status === "review";
}

function supervisedLiveNextAction(status: Web3SupervisedLiveRunwayStatus, lanes: Web3SupervisedLiveRunwayLane[]) {
  if (status === "manual-review-needed") return "Prepare the external supervised-live review packet; Mastermind still keeps execution blocked.";
  const lane = lanes.find((item) => item.status === "needed" || item.status === "blocked");
  return lane?.next_action ?? "Keep live execution blocked while refreshing supervised-live evidence.";
}

function supervisedLiveSummary(status: Web3SupervisedLiveRunwayStatus, ready: number, total: number) {
  if (status === "manual-review-needed") return "All supervised-live lanes are ready for external review; execution remains blocked in Mastermind.";
  if (status === "blocked") return `Supervised-live review is blocked; ${ready}/${total} lanes are reviewable.`;
  return `${ready}/${total} supervised-live lanes are ready; the next missing lane is ${status.replace("missing-", "")}.`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

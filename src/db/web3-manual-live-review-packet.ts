import { createHash } from "node:crypto";
import type { Web3AutonomyLaunchChecklist } from "./web3-launch-checklist";
import type {
  Web3LiveCapitalPreflightGate,
  Web3LiveCapitalPreflightReceipt,
} from "./web3-live-capital-preflight";
import type { Web3LiveOpsPacket } from "./web3-live-ops-packet";
import type { Web3SupervisedLiveRunway } from "./web3-supervised-live-runway";
import type { Web3TradingState } from "./web3-trading";

export type Web3ManualLiveReviewPacketStatus =
  | "blocked"
  | "waiting-for-operator-input"
  | "ready-for-external-review";

export type Web3ManualLiveReviewSignoff = {
  id: Web3LiveCapitalPreflightGate["id"] | "supervised-runway" | "live-ops";
  label: string;
  reviewer: "operator" | "security" | "ops" | "accounting" | "strategy";
  status: "pass" | "watch" | "fail";
  evidence: string;
  next_action: string;
  blocks_live_capital: boolean;
};

export type Web3ManualLiveReviewPacket = {
  mode: "web3-manual-live-review-packet";
  status: Web3ManualLiveReviewPacketStatus;
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  launch_status: Web3AutonomyLaunchChecklist["status"];
  launch_readiness_score: number;
  preflight_status: Web3LiveCapitalPreflightReceipt["status"];
  supervised_runway_status: Web3SupervisedLiveRunway["status"];
  live_ops_status: Web3LiveOpsPacket["status"];
  live_review_permitted: boolean;
  can_request_external_review: boolean;
  external_review_only: true;
  required_signoff_count: number;
  passed_signoff_count: number;
  watch_signoff_count: number;
  failed_signoff_count: number;
  blockers: string[];
  signoffs: Web3ManualLiveReviewSignoff[];
  evidence_links: string[];
  safe_commands: string[];
  next_action: string;
  summary: string;
  live_execution_permission: "blocked" | "manual-live-executor-review";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export function buildWeb3ManualLiveReviewPacket(input: {
  state: Web3TradingState;
  checklist: Web3AutonomyLaunchChecklist;
  preflight: Web3LiveCapitalPreflightReceipt;
  liveOps: Web3LiveOpsPacket;
  runway: Web3SupervisedLiveRunway;
  now?: Date;
}): Web3ManualLiveReviewPacket {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const signoffs = buildSignoffs(input.preflight, input.liveOps, input.runway);
  const failed = signoffs.filter((item) => item.status === "fail");
  const watch = signoffs.filter((item) => item.status === "watch");
  const blockers = [
    ...failed.map((item) => item.next_action),
    ...watch.filter((item) => item.blocks_live_capital).map((item) => item.next_action),
    ...input.checklist.hard_blockers,
  ].filter((value, index, all) => value.trim().length > 0 && all.indexOf(value) === index).slice(0, 12);
  const liveReviewPermitted = input.checklist.live_review_permitted &&
    input.preflight.live_review_permitted &&
    failed.length === 0 &&
    watch.length === 0;
  const status: Web3ManualLiveReviewPacketStatus = liveReviewPermitted
    ? "ready-for-external-review"
    : input.checklist.next_operator_action
      ? "waiting-for-operator-input"
      : "blocked";
  const base = {
    mode: "web3-manual-live-review-packet" as const,
    status,
    generated_at: generatedAt,
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    launch_status: input.checklist.status,
    launch_readiness_score: input.checklist.readiness_score,
    preflight_status: input.preflight.status,
    supervised_runway_status: input.runway.status,
    live_ops_status: input.liveOps.status,
    live_review_permitted: liveReviewPermitted,
    can_request_external_review: liveReviewPermitted,
    external_review_only: true as const,
    required_signoff_count: signoffs.length,
    passed_signoff_count: signoffs.filter((item) => item.status === "pass").length,
    watch_signoff_count: watch.length,
    failed_signoff_count: failed.length,
    blockers,
    signoffs,
    evidence_links: [
      "GET /api/web3-launch-checklist",
      "GET /api/web3-live-capital-preflight",
      "GET /api/web3-supervised-live-runway",
      "GET /api/web3-live-ops-packet",
      "GET /api/web3-operator-credential-handoff",
    ],
    safe_commands: [
      "npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live",
      "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet --require-jupiter-order --require-dex-live --require-live-canary",
      "npm run landing-drill:web3",
      "npm run doctor:web3 -- --json",
    ],
    next_action: manualLiveReviewNextAction(status, blockers, input.checklist.next_operator_action?.next_action),
    summary: manualLiveReviewSummary(status, input.checklist, signoffs),
    live_execution_permission: liveReviewPermitted ? "manual-live-executor-review" as const : "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This packet is a human review checklist, not an execution endpoint.",
      "It can only request external manual review after the launch checklist, supervised runway, live ops, and live-capital preflight all pass.",
      "It never returns provider secrets, private keys, seed phrases, raw transactions, unsigned transactions, signed payloads, live submit authority, or wallet mutation authority.",
      "Even when ready, signing and submission must happen through a separate reviewed executor with explicit operator approval.",
    ],
  };

  return {
    ...base,
    receipt_hash: hashJson(base),
  };
}

function buildSignoffs(
  preflight: Web3LiveCapitalPreflightReceipt,
  liveOps: Web3LiveOpsPacket,
  runway: Web3SupervisedLiveRunway,
): Web3ManualLiveReviewSignoff[] {
  return [
    ...preflight.gates.map((gate): Web3ManualLiveReviewSignoff => ({
      id: gate.id,
      label: gate.label,
      reviewer: reviewerForGate(gate.id),
      status: gate.status,
      evidence: gate.evidence,
      next_action: gate.next_action,
      blocks_live_capital: gate.blocks_live_capital,
    })),
    {
      id: "supervised-runway",
      label: "Supervised live runway",
      reviewer: "operator",
      status: runway.can_request_live_review ? "pass" : runway.ready_lane_count > 0 ? "watch" : "fail",
      evidence: `${runway.ready_lane_count}/${runway.total_lane_count} runway lanes ready; launch model ${runway.launch_model}.`,
      next_action: runway.next_action,
      blocks_live_capital: true,
    },
    {
      id: "live-ops",
      label: "Live operations packet",
      reviewer: "ops",
      status: liveOps.status === "manual-review-needed" ? "watch" : "fail",
      evidence: `${liveOps.production_supervisor_status} supervisor; emergency stop ${liveOps.emergency_stop_configured ? "configured" : "missing"}; accounting ${liveOps.accounting_export_configured ? "configured" : "missing"}.`,
      next_action: liveOps.next_action,
      blocks_live_capital: true,
    },
  ];
}

function reviewerForGate(id: Web3LiveCapitalPreflightGate["id"]): Web3ManualLiveReviewSignoff["reviewer"] {
  if (id === "operator-wallet" || id === "manual-live-review") return "operator";
  if (id === "signer-custody" || id === "kill-switch" || id === "risk-policy") return "security";
  if (id === "settlement") return "accounting";
  if (id === "profit-proof") return "strategy";
  return "ops";
}

function manualLiveReviewSummary(
  status: Web3ManualLiveReviewPacketStatus,
  checklist: Web3AutonomyLaunchChecklist,
  signoffs: Web3ManualLiveReviewSignoff[],
) {
  const failed = signoffs.filter((item) => item.status === "fail").length;
  const watch = signoffs.filter((item) => item.status === "watch").length;
  if (status === "ready-for-external-review") {
    return `Manual live-review packet is ready with ${checklist.readiness_score}/100 launch readiness; this app still cannot sign or submit.`;
  }
  if (status === "waiting-for-operator-input") {
    return `Manual live-review packet is waiting on operator inputs with ${failed} failed and ${watch} review signoff${watch === 1 ? "" : "s"}.`;
  }
  return `Manual live-review packet is blocked with ${failed} failed and ${watch} review signoff${watch === 1 ? "" : "s"}.`;
}

function manualLiveReviewNextAction(
  status: Web3ManualLiveReviewPacketStatus,
  blockers: string[],
  operatorAction?: string,
) {
  if (status === "ready-for-external-review") {
    return "Export this packet to an external human live-executor review; keep in-app signing and submission blocked.";
  }
  return operatorAction ?? blockers[0] ?? "Clear live-capital preflight gates before requesting manual live review.";
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

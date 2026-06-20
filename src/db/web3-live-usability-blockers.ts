import { createHash } from "node:crypto";
import type { Web3CutoverBlockerBoard } from "./web3-cutover-blocker-board";
import type { Web3LiveCapitalPreflightReceipt } from "./web3-live-capital-preflight";
import type { Web3ManualLiveReviewPacket } from "./web3-manual-live-review-packet";
import type { Web3OperatorRunbookReceipt } from "./web3-operator-runbook";
import type { Web3SupervisedLiveRunway } from "./web3-supervised-live-runway";
import type { Web3TradingState } from "./web3-trading";
import type { Web3UsabilityStatusReceipt } from "./web3-usability-status";

export type Web3LiveUsabilityBlockerOwner = "operator" | "security" | "ops" | "accounting" | "strategy" | "manual-review";

export type Web3LiveUsabilityMissingItem = {
  id: string;
  label: string;
  owner: Web3LiveUsabilityBlockerOwner;
  source: "cutover" | "preflight" | "manual-review" | "runway";
  status: "needed" | "blocked" | "review" | "watch" | "fail";
  next_action: string;
  blocks_live_capital: boolean;
};

export type Web3LiveUsabilityBlockersReceipt = {
  mode: "web3-live-usability-blockers";
  status:
    | "operator-input-needed"
    | "external-review-needed"
    | "live-review-ready"
    | "autonomous-live-locked";
  generated_at: string;
  receipt_hash: string;
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  current_mode: Web3UsabilityStatusReceipt["current_mode"];
  usability_status: Web3UsabilityStatusReceipt["status"];
  manual_review_status: Web3ManualLiveReviewPacket["status"];
  live_review_permitted: boolean;
  can_request_external_review: boolean;
  paper_usable: boolean;
  dry_run_usable: boolean;
  supervised_review_ready: boolean;
  autonomous_live_locked: true;
  open_operator_input_count: number;
  open_cutover_blocker_count: number;
  real_capital_blocker_count: number;
  required_signoff_count: number;
  passed_signoff_count: number;
  failed_or_watch_signoff_count: number;
  ready_live_lane_count: number;
  total_live_lane_count: number;
  safe_action_count: number;
  gated_action_count: number;
  next_operator_input: {
    label: string;
    next_action: string;
    safe_collection_surface: string;
    storage: string;
  } | null;
  next_action: string;
  summary: string;
  missing_for_live_usability: Web3LiveUsabilityMissingItem[];
  safe_next_actions: Array<{
    id: Web3OperatorRunbookReceipt["run_now"][number]["id"];
    label: string;
    status: Web3OperatorRunbookReceipt["run_now"][number]["status"];
    surface: Web3OperatorRunbookReceipt["run_now"][number]["surface"];
    href: string | null;
    command: string | null;
    next_action: string;
  }>;
  verifier_commands: string[];
  evidence_endpoints: string[];
  safe_to_provide: string[];
  never_provide: string[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export type Web3LiveUsabilityBlockersHealth = {
  mode: "web3-live-usability-health";
  status: Web3LiveUsabilityBlockersReceipt["status"];
  receipt_hash: string;
  current_mode: Web3LiveUsabilityBlockersReceipt["current_mode"];
  usability_status: Web3LiveUsabilityBlockersReceipt["usability_status"];
  manual_review_status: Web3LiveUsabilityBlockersReceipt["manual_review_status"];
  open_operator_input_count: number;
  open_cutover_blocker_count: number;
  real_capital_blocker_count: number;
  failed_or_watch_signoff_count: number;
  ready_live_lane_count: number;
  total_live_lane_count: number;
  safe_action_count: number;
  next_operator_input_label: string | null;
  next_action: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

export function buildWeb3LiveUsabilityBlockersReceipt(input: {
  state: Web3TradingState;
  usability: Web3UsabilityStatusReceipt;
  cutover: Web3CutoverBlockerBoard;
  runbook: Web3OperatorRunbookReceipt;
  preflight: Web3LiveCapitalPreflightReceipt;
  manualLiveReview: Web3ManualLiveReviewPacket;
  runway: Web3SupervisedLiveRunway;
  now?: Date;
}): Web3LiveUsabilityBlockersReceipt {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const missing = buildMissingItems(input);
  const paper = input.usability.capabilities.find((item) => item.id === "paper-autonomy");
  const dryRun = input.usability.capabilities.find((item) => item.id === "jupiter-dry-run");
  const autonomousLive = input.usability.capabilities.find((item) => item.id === "autonomous-live");
  const openOperatorInputCount = input.cutover.rows.filter((row) =>
    row.owner === "operator" && row.status !== "ready"
  ).length;
  const realCapitalBlockerCount = missing.filter((item) => item.blocks_live_capital).length;
  const failedOrWatchSignoffCount = input.manualLiveReview.failed_signoff_count + input.manualLiveReview.watch_signoff_count;
  const status = blockersStatus(input, openOperatorInputCount, failedOrWatchSignoffCount);
  const safeNextActions = input.runbook.run_now
    .filter((action) => action.status !== "blocked")
    .map((action) => ({
      id: action.id,
      label: action.label,
      status: action.status,
      surface: action.surface,
      href: action.href,
      command: action.command,
      next_action: action.next_action,
    }))
    .slice(0, 6);
  const verifierCommands = Array.from(new Set([
    ...input.runbook.verifier_commands,
    ...input.manualLiveReview.safe_commands,
    ...input.cutover.verifier_commands,
  ])).slice(0, 8);
  const receiptBase = {
    mode: "web3-live-usability-blockers" as const,
    status,
    generated_at: generatedAt,
    source: input.state.market_source.mode,
    account: input.state.paper_account.mode,
    scenario: input.state.scenario,
    current_mode: input.usability.current_mode,
    usability_status: input.usability.status,
    manual_review_status: input.manualLiveReview.status,
    live_review_permitted: input.manualLiveReview.live_review_permitted,
    can_request_external_review: input.manualLiveReview.can_request_external_review,
    paper_usable: paper?.status === "usable" || paper?.status === "watch",
    dry_run_usable: dryRun?.status === "usable",
    supervised_review_ready: input.runway.can_request_live_review && input.manualLiveReview.can_request_external_review,
    autonomous_live_locked: true as const,
    open_operator_input_count: openOperatorInputCount,
    open_cutover_blocker_count: input.cutover.open_blocker_count,
    real_capital_blocker_count: realCapitalBlockerCount,
    required_signoff_count: input.manualLiveReview.required_signoff_count,
    passed_signoff_count: input.manualLiveReview.passed_signoff_count,
    failed_or_watch_signoff_count: failedOrWatchSignoffCount,
    ready_live_lane_count: input.runway.ready_lane_count,
    total_live_lane_count: input.runway.total_lane_count,
    safe_action_count: input.runbook.allowed_now_count,
    gated_action_count: input.runbook.gated_count,
    next_operator_input: input.cutover.next_safe_input
      ? {
        label: input.cutover.next_safe_input.label,
        next_action: input.cutover.next_safe_input.next_action,
        safe_collection_surface: input.cutover.next_safe_input.safe_collection_surface,
        storage: input.cutover.next_safe_input.storage,
      }
      : null,
    next_action: liveUsabilityNextAction(status, input, missing),
    summary: liveUsabilitySummary(status, input, missing, autonomousLive?.detail),
    missing_for_live_usability: missing.slice(0, 14),
    safe_next_actions: safeNextActions,
    verifier_commands: verifierCommands,
    evidence_endpoints: [
      "GET /api/web3-usability-status",
      "GET /api/web3-cutover-blocker-board",
      "GET /api/web3-live-capital-preflight",
      "GET /api/web3-supervised-live-runway",
      "GET /api/web3-manual-live-review-packet",
      "GET /api/web3-operator-runbook",
    ],
    safe_to_provide: input.cutover.safe_to_provide,
    never_provide: input.cutover.never_provide,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    seed_phrase_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    controls: [
      "This receipt answers what is left before real-money Web3 usability; it is not an execution endpoint.",
      "Safe actions are limited to cockpit review, paper autonomy, read-only market refresh, credential setup, verifier commands, and external review packets.",
      "It summarizes target names, labels, next actions, and blocker counts only; provider secrets, wallet secrets, transaction bodies, signatures, and webhook values are never returned.",
      "Autonomous live trading remains locked in-app even when supervised live review becomes externally requestable.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

export function buildWeb3LiveUsabilityBlockersHealth(
  receipt: Web3LiveUsabilityBlockersReceipt,
): Web3LiveUsabilityBlockersHealth {
  return {
    mode: "web3-live-usability-health",
    status: receipt.status,
    receipt_hash: receipt.receipt_hash,
    current_mode: receipt.current_mode,
    usability_status: receipt.usability_status,
    manual_review_status: receipt.manual_review_status,
    open_operator_input_count: receipt.open_operator_input_count,
    open_cutover_blocker_count: receipt.open_cutover_blocker_count,
    real_capital_blocker_count: receipt.real_capital_blocker_count,
    failed_or_watch_signoff_count: receipt.failed_or_watch_signoff_count,
    ready_live_lane_count: receipt.ready_live_lane_count,
    total_live_lane_count: receipt.total_live_lane_count,
    safe_action_count: receipt.safe_action_count,
    next_operator_input_label: receipt.next_operator_input?.label ?? null,
    next_action: receipt.next_action,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

function blockersStatus(
  input: {
    manualLiveReview: Web3ManualLiveReviewPacket;
    runway: Web3SupervisedLiveRunway;
  },
  openOperatorInputCount: number,
  failedOrWatchSignoffCount: number,
): Web3LiveUsabilityBlockersReceipt["status"] {
  if (openOperatorInputCount > 0 || input.manualLiveReview.status === "waiting-for-operator-input") {
    return "operator-input-needed";
  }
  if (input.manualLiveReview.can_request_external_review || input.runway.can_request_live_review) {
    return "live-review-ready";
  }
  if (failedOrWatchSignoffCount > 0 || input.manualLiveReview.status === "blocked") {
    return "external-review-needed";
  }
  return "autonomous-live-locked";
}

function buildMissingItems(input: {
  cutover: Web3CutoverBlockerBoard;
  preflight: Web3LiveCapitalPreflightReceipt;
  manualLiveReview: Web3ManualLiveReviewPacket;
  runway: Web3SupervisedLiveRunway;
}): Web3LiveUsabilityMissingItem[] {
  const items = [
    ...input.cutover.rows
      .filter((row) => row.status !== "ready")
      .map((row): Web3LiveUsabilityMissingItem => ({
        id: `cutover:${row.id}`,
        label: row.label,
        owner: row.owner,
        source: "cutover",
        status: row.status === "ready" ? "review" : row.status,
        next_action: row.next_action,
        blocks_live_capital: true,
      })),
    ...input.preflight.gates
      .filter((gate) => gate.status !== "pass")
      .map((gate): Web3LiveUsabilityMissingItem => ({
        id: `preflight:${gate.id}`,
        label: gate.label,
        owner: ownerForGate(gate.id),
        source: "preflight",
        status: gate.status === "fail" ? "fail" : "watch",
        next_action: gate.next_action,
        blocks_live_capital: gate.blocks_live_capital,
      })),
    ...input.manualLiveReview.signoffs
      .filter((signoff) => signoff.status !== "pass")
      .map((signoff): Web3LiveUsabilityMissingItem => ({
        id: `manual:${signoff.id}`,
        label: signoff.label,
        owner: signoff.reviewer,
        source: "manual-review",
        status: signoff.status === "fail" ? "fail" : "watch",
        next_action: signoff.next_action,
        blocks_live_capital: signoff.blocks_live_capital,
      })),
    ...input.runway.lanes
      .filter((lane) => lane.status !== "ready" && lane.status !== "review")
      .map((lane): Web3LiveUsabilityMissingItem => ({
        id: `runway:${lane.id}`,
        label: lane.label,
        owner: lane.id === "accounting" ? "accounting" : lane.id === "ops" ? "ops" : lane.id === "signer" ? "security" : lane.id === "manual-review" ? "manual-review" : "operator",
        source: "runway",
        status: lane.status === "ready" ? "review" : lane.status,
        next_action: lane.next_action,
        blocks_live_capital: true,
      })),
  ];

  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.label}:${item.next_action}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => missingItemRank(a) - missingItemRank(b));
}

function ownerForGate(id: Web3LiveCapitalPreflightReceipt["gates"][number]["id"]): Web3LiveUsabilityBlockerOwner {
  if (id === "operator-wallet" || id === "manual-live-review") return "operator";
  if (id === "signer-custody" || id === "kill-switch" || id === "risk-policy") return "security";
  if (id === "settlement") return "accounting";
  if (id === "profit-proof") return "strategy";
  return "ops";
}

function missingItemRank(item: Web3LiveUsabilityMissingItem) {
  const statusRank = item.status === "blocked" || item.status === "fail" ? 0 : item.status === "needed" ? 1 : 2;
  const sourceRank = item.source === "cutover" ? 0 : item.source === "preflight" ? 5 : item.source === "manual-review" ? 10 : 15;
  return statusRank + sourceRank;
}

function liveUsabilityNextAction(
  status: Web3LiveUsabilityBlockersReceipt["status"],
  input: {
    cutover: Web3CutoverBlockerBoard;
    manualLiveReview: Web3ManualLiveReviewPacket;
    runbook: Web3OperatorRunbookReceipt;
  },
  missing: Web3LiveUsabilityMissingItem[],
) {
  if (status === "live-review-ready") {
    return "Export the manual live-review packet to an external reviewer; keep Mastermind signing and submission blocked.";
  }
  if (status === "operator-input-needed") {
    return input.cutover.next_safe_input?.next_action ?? missing[0]?.next_action ?? "Provide the next safe public/env-target input in Settings.";
  }
  if (status === "external-review-needed") {
    return input.manualLiveReview.next_action ?? missing[0]?.next_action ?? "Clear manual-review signoffs before requesting supervised live review.";
  }
  return input.runbook.run_now.find((action) => action.id === "autonomous-live-trading")?.next_action ??
    "Keep autonomous live trading locked until an external executor, custody, risk, settlement, and legal review exist.";
}

function liveUsabilitySummary(
  status: Web3LiveUsabilityBlockersReceipt["status"],
  input: {
    cutover: Web3CutoverBlockerBoard;
    manualLiveReview: Web3ManualLiveReviewPacket;
    runway: Web3SupervisedLiveRunway;
  },
  missing: Web3LiveUsabilityMissingItem[],
  autonomousLiveDetail?: string,
) {
  if (status === "live-review-ready") {
    return "Supervised live review can be requested externally; Mastermind still blocks signing, submission, wallet mutation, and autonomous live trading.";
  }
  if (status === "operator-input-needed") {
    return `${input.cutover.open_blocker_count} setup blocker${input.cutover.open_blocker_count === 1 ? "" : "s"} remain before real-money usability can be reviewed.`;
  }
  if (status === "external-review-needed") {
    return `${input.manualLiveReview.failed_signoff_count + input.manualLiveReview.watch_signoff_count} live-review signoff${input.manualLiveReview.failed_signoff_count + input.manualLiveReview.watch_signoff_count === 1 ? "" : "s"} still need review; ${input.runway.ready_lane_count}/${input.runway.total_lane_count} supervised lanes are ready.`;
  }
  return autonomousLiveDetail ?? `${missing.length} blockers remain and autonomous live trading is locked inside the app.`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

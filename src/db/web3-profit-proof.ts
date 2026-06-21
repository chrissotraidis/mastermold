import type { Web3PromotedPaperAutopilotHealth } from "./web3-promoted-paper-autopilot";
import type { AutonomousProfitAccountability } from "./web3-trading";

export type Web3ProfitProofReadinessStatus =
  | "missing"
  | "learning"
  | "profitable-paper"
  | "repeatable-paper"
  | "drawdown-gated"
  | "blocked";

export type Web3ProfitProofReadinessCheck = {
  id: "local-paper" | "promoted-memory" | "sample-size" | "target-hit-rate" | "drawdown" | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export type Web3ProfitProofThreshold = {
  id:
    | "local-accountability"
    | "promoted-run-count"
    | "promoted-total-pnl"
    | "target-hit-rate"
    | "recent-positive-runs"
    | "loss-brake"
    | "memory-posture"
    | "live-boundary";
  label: string;
  required: string;
  observed: string;
  status: "pass" | "watch" | "fail";
  next_action: string;
};

export type Web3ProfitProofRunPlan = {
  mode: "promoted-paper-proof-plan";
  status: "complete" | "needs-runs" | "needs-hit-rate" | "needs-local-accountability" | "drawdown-gated" | "blocked";
  required_promoted_runs: number;
  remaining_promoted_runs: number;
  required_target_hit_rate_pct: number;
  required_positive_total_pnl: true;
  required_recent_positive_runs: number;
  observed_promoted_runs: number;
  observed_target_hit_rate_pct: number;
  observed_total_net_pnl_usd: number;
  observed_recent_positive_runs: number;
  suggested_next_runs: number;
  safe_command: "npm run autopilot-paper:web3";
  local_accountability_repair_command: "npm run repair-accountability:web3";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  summary: string;
  next_action: string;
};

export type Web3ProfitProofReadiness = {
  mode: "web3-profit-proof-readiness";
  status: Web3ProfitProofReadinessStatus;
  readiness_score: number;
  local_paper_net_pnl_usd: number;
  local_paper_accountability_score: number;
  local_paper_making_money: boolean;
  promoted_run_count: number;
  promoted_total_net_pnl_usd: number;
  promoted_average_net_pnl_usd: number;
  promoted_target_hit_rate_pct: number;
  promoted_recent_positive_count: number;
  promoted_recent_loss_count: number;
  promoted_memory_status: Web3PromotedPaperAutopilotHealth["run_memory_status"];
  recommended_supervisor_round_cap: number;
  can_support_paper_scale: boolean;
  can_satisfy_profit_gate: boolean;
  threshold_matrix: Web3ProfitProofThreshold[];
  proof_plan: Web3ProfitProofRunPlan;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  summary: string;
  next_action: string;
  blockers: string[];
  checks: Web3ProfitProofReadinessCheck[];
  controls: string[];
};

export function buildWeb3ProfitProofReadiness({
  paperProfit,
  promotedHealth,
}: {
  paperProfit?: AutonomousProfitAccountability;
  promotedHealth?: Web3PromotedPaperAutopilotHealth;
}): Web3ProfitProofReadiness {
  const localNet = roundMoney(paperProfit?.net_pnl_usd ?? 0);
  const localScore = clampScore(paperProfit?.accountability_score ?? 0);
  const localMakingMoney = paperProfit?.making_money === true && localNet >= 0 && localScore >= 70;
  const memoryStatus = promotedHealth?.run_memory_status ?? "learning";
  const runCount = promotedHealth?.run_count ?? 0;
  const totalPnl = roundMoney(promotedHealth?.total_net_pnl_usd ?? 0);
  const averagePnl = roundMoney(promotedHealth?.average_net_pnl_usd ?? 0);
  const hitRate = roundMoney(promotedHealth?.target_hit_rate_pct ?? 0);
  const recent = promotedHealth?.recent_runs ?? [];
  const recentPositiveCount = recent.filter((run) => run.net_pnl_usd > 0 && run.profit_target_hit && !run.loss_brake_tripped).length;
  const recentLossCount = recent.filter((run) => run.net_pnl_usd < 0 || run.loss_brake_tripped || !run.profit_target_hit).length;
  const lossBrakeTripped = promotedHealth?.loss_brake_tripped === true || recent.some((run) => run.loss_brake_tripped);
  const memoryProtecting = memoryStatus === "protect-paper" || memoryStatus === "stand-down";
  const promotionRepairAction = promotedHealth ? promotionRepairNextAction(promotedHealth) : null;
  const enoughSample = runCount >= 3;
  const requiredRecentPositiveRuns = Math.min(3, recent.length || 3);
  const repeatable = localMakingMoney &&
    enoughSample &&
    totalPnl > 0 &&
    averagePnl > 0 &&
    hitRate >= 70 &&
    recentPositiveCount >= requiredRecentPositiveRuns &&
    !lossBrakeTripped &&
    !memoryProtecting;
  const thresholdMatrix = buildProfitProofThresholdMatrix({
    localMakingMoney,
    localScore,
    localNet,
    runCount,
    totalPnl,
    hitRate,
    recentPositiveCount,
    requiredRecentPositiveRuns,
    lossBrakeTripped,
    memoryStatus,
    memoryProtecting,
  });
  const canSupportPaperScale = localMakingMoney && !lossBrakeTripped && memoryStatus !== "stand-down";
  const checks = profitProofChecks({
    localMakingMoney,
    localNet,
    localScore,
    memoryStatus,
    runCount,
    enoughSample,
    totalPnl,
    hitRate,
    lossBrakeTripped,
    memoryProtecting,
  });
  const proofPlan = buildProfitProofRunPlan({
    repeatable,
    runCount,
    hitRate,
    totalPnl,
    recentPositiveCount,
    requiredRecentPositiveRuns,
    localMakingMoney,
    lossBrakeTripped,
    memoryProtecting,
    recommendedSupervisorRoundCap: promotedHealth?.recommended_supervisor_round_cap ?? 0,
    promotionRepairAction,
  });
  const blockers = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.detail)
    .slice(0, 6);
  const readinessScore = Math.round(checks.reduce((sum, check) => sum + checkScore(check.status), 0) / checks.length);
  const status: Web3ProfitProofReadinessStatus = lossBrakeTripped || memoryStatus === "stand-down"
    ? "drawdown-gated"
    : memoryProtecting
      ? "blocked"
      : repeatable
        ? "repeatable-paper"
        : localMakingMoney || totalPnl > 0
          ? "profitable-paper"
          : runCount > 0 || localScore > 0
            ? "learning"
            : "missing";

  return {
    mode: "web3-profit-proof-readiness",
    status,
    readiness_score: readinessScore,
    local_paper_net_pnl_usd: localNet,
    local_paper_accountability_score: localScore,
    local_paper_making_money: localMakingMoney,
    promoted_run_count: runCount,
    promoted_total_net_pnl_usd: totalPnl,
    promoted_average_net_pnl_usd: averagePnl,
    promoted_target_hit_rate_pct: hitRate,
    promoted_recent_positive_count: recentPositiveCount,
    promoted_recent_loss_count: recentLossCount,
    promoted_memory_status: memoryStatus,
    recommended_supervisor_round_cap: promotedHealth?.recommended_supervisor_round_cap ?? 0,
    can_support_paper_scale: canSupportPaperScale,
    can_satisfy_profit_gate: repeatable,
    threshold_matrix: thresholdMatrix,
    proof_plan: proofPlan,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    summary: profitProofSummary(status, readinessScore, localNet, runCount, hitRate, totalPnl),
    next_action: blockers[0] ?? proofPlan.next_action ?? promotionRepairAction ?? profitProofNextAction(status),
    blockers,
    checks,
    controls: [
      "Profit proof is paper and receipt evidence only; it does not guarantee future profit or authorize real-capital trading.",
      "Live review requires repeatable positive promoted runs, target-hit consistency, no loss brake, and a profitable local paper accountability score.",
      "This gate never signs, submits, custodies funds, changes wallet balances, or enables autonomous real-money execution.",
    ],
  };
}

function buildProfitProofRunPlan(evidence: {
  repeatable: boolean;
  runCount: number;
  hitRate: number;
  totalPnl: number;
  recentPositiveCount: number;
  requiredRecentPositiveRuns: number;
  localMakingMoney: boolean;
  lossBrakeTripped: boolean;
  memoryProtecting: boolean;
  recommendedSupervisorRoundCap: number;
  promotionRepairAction: string | null;
}): Web3ProfitProofRunPlan {
  const requiredPromotedRuns = 3;
  const requiredHitRate = 70;
  const remainingRuns = Math.max(0, requiredPromotedRuns - evidence.runCount);
  const promotedEvidenceReady = evidence.runCount >= requiredPromotedRuns &&
    evidence.hitRate >= requiredHitRate &&
    evidence.totalPnl > 0 &&
    evidence.recentPositiveCount >= evidence.requiredRecentPositiveRuns;
  const suggestedNextRuns = evidence.repeatable
    ? 0
    : promotedEvidenceReady && !evidence.localMakingMoney
      ? 0
    : Math.max(1, Math.min(Math.max(remainingRuns, 1), Math.max(1, evidence.recommendedSupervisorRoundCap || 2)));
  const status: Web3ProfitProofRunPlan["status"] = evidence.repeatable
    ? "complete"
    : evidence.lossBrakeTripped
      ? "drawdown-gated"
      : evidence.memoryProtecting
        ? "blocked"
        : remainingRuns > 0
          ? "needs-runs"
          : promotedEvidenceReady && !evidence.localMakingMoney
            ? "needs-local-accountability"
            : "needs-hit-rate";
  const nextAction = evidence.promotionRepairAction ?? profitProofRunPlanNextAction(status, suggestedNextRuns, remainingRuns);

  return {
    mode: "promoted-paper-proof-plan",
    status,
    required_promoted_runs: requiredPromotedRuns,
    remaining_promoted_runs: remainingRuns,
    required_target_hit_rate_pct: requiredHitRate,
    required_positive_total_pnl: true,
    required_recent_positive_runs: evidence.requiredRecentPositiveRuns,
    observed_promoted_runs: evidence.runCount,
    observed_target_hit_rate_pct: evidence.hitRate,
    observed_total_net_pnl_usd: evidence.totalPnl,
    observed_recent_positive_runs: evidence.recentPositiveCount,
    suggested_next_runs: suggestedNextRuns,
    safe_command: "npm run autopilot-paper:web3",
    local_accountability_repair_command: "npm run repair-accountability:web3",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    summary: profitProofRunPlanSummary(status, evidence.runCount, remainingRuns, evidence.hitRate, evidence.totalPnl),
    next_action: nextAction,
  };
}

function promotionRepairNextAction(promotedHealth: Web3PromotedPaperAutopilotHealth) {
  if (promotedHealth.status !== "blocked" || promotedHealth.supervisor_status !== "not-run") return null;
  const failed = promotedHealth.promotion_repair_items.find((item) => item.status === "fail");
  const watched = promotedHealth.promotion_repair_items.find((item) => item.status === "watch");
  const item = failed ?? watched;
  if (!item) return null;
  return `Repair promotion guard first: ${item.label} is ${item.value}. ${item.detail}`;
}

function profitProofChecks(evidence: {
  localMakingMoney: boolean;
  localNet: number;
  localScore: number;
  memoryStatus: Web3PromotedPaperAutopilotHealth["run_memory_status"];
  runCount: number;
  enoughSample: boolean;
  totalPnl: number;
  hitRate: number;
  lossBrakeTripped: boolean;
  memoryProtecting: boolean;
}): Web3ProfitProofReadinessCheck[] {
  return [
    {
      id: "local-paper",
      label: "Local paper PnL",
      status: evidence.localMakingMoney ? "pass" : evidence.localScore > 0 || evidence.localNet >= 0 ? "watch" : "fail",
      detail: `${formatSignedCompactValue(evidence.localNet)} local paper net with ${evidence.localScore}/100 accountability.`,
    },
    {
      id: "promoted-memory",
      label: "Promoted memory",
      status: evidence.memoryProtecting ? "fail" : evidence.memoryStatus === "extend-paper" || evidence.memoryStatus === "continue-paper" ? "pass" : "watch",
      detail: `Promoted memory is ${evidence.memoryStatus.replaceAll("-", " ")} across ${evidence.runCount} run${evidence.runCount === 1 ? "" : "s"}.`,
    },
    {
      id: "sample-size",
      label: "Sample size",
      status: evidence.enoughSample ? "pass" : evidence.runCount > 0 ? "watch" : "fail",
      detail: `${evidence.runCount} promoted run${evidence.runCount === 1 ? "" : "s"} recorded; live review requires at least 3.`,
    },
    {
      id: "target-hit-rate",
      label: "Target hit rate",
      status: evidence.hitRate >= 70 && evidence.totalPnl > 0 ? "pass" : evidence.hitRate > 0 || evidence.totalPnl >= 0 ? "watch" : "fail",
      detail: `${evidence.hitRate.toFixed(0)}% target hit rate with ${formatSignedCompactValue(evidence.totalPnl)} promoted total PnL.`,
    },
    {
      id: "drawdown",
      label: "Drawdown brake",
      status: evidence.lossBrakeTripped ? "fail" : "pass",
      detail: evidence.lossBrakeTripped ? "A promoted paper loss brake is tripped." : "No promoted paper loss brake is tripped.",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: "pass",
      detail: "Profit proof remains paper evidence and cannot unlock live-capital execution.",
    },
  ];
}

function buildProfitProofThresholdMatrix(evidence: {
  localMakingMoney: boolean;
  localScore: number;
  localNet: number;
  runCount: number;
  totalPnl: number;
  hitRate: number;
  recentPositiveCount: number;
  requiredRecentPositiveRuns: number;
  lossBrakeTripped: boolean;
  memoryStatus: Web3PromotedPaperAutopilotHealth["run_memory_status"];
  memoryProtecting: boolean;
}): Web3ProfitProofThreshold[] {
  return [
    {
      id: "local-accountability",
      label: "Local accountability",
      required: "Making money with accountability at 70/100 or better",
      observed: `${formatSignedCompactValue(evidence.localNet)} local net, ${evidence.localScore}/100 accountability`,
      status: evidence.localMakingMoney ? "pass" : evidence.localScore > 0 || evidence.localNet >= 0 ? "watch" : "fail",
      next_action: evidence.localMakingMoney
        ? "Keep local paper accountability above 70/100 while collecting promoted proof."
        : "Run or repair local paper accountability before claiming the profit gate.",
    },
    {
      id: "promoted-run-count",
      label: "Promoted run count",
      required: "At least 3 promoted paper runs",
      observed: `${evidence.runCount} promoted run${evidence.runCount === 1 ? "" : "s"}`,
      status: evidence.runCount >= 3 ? "pass" : evidence.runCount > 0 ? "watch" : "fail",
      next_action: evidence.runCount >= 3
        ? "Sample size is high enough for the current paper gate; keep collecting more runs for confidence."
        : `Run ${Math.max(1, 3 - evidence.runCount)} more promoted paper proof ${3 - evidence.runCount === 1 ? "window" : "windows"}.`,
    },
    {
      id: "promoted-total-pnl",
      label: "Promoted total PnL",
      required: "Positive promoted paper total PnL",
      observed: `${formatSignedCompactValue(evidence.totalPnl)} promoted total PnL`,
      status: evidence.totalPnl > 0 ? "pass" : evidence.runCount > 0 && evidence.totalPnl === 0 ? "watch" : "fail",
      next_action: evidence.totalPnl > 0
        ? "Promoted total PnL is positive; keep it positive through the remaining proof windows."
        : "Do not advance live review until promoted paper total PnL is positive.",
    },
    {
      id: "target-hit-rate",
      label: "Target hit rate",
      required: "70% or better target-hit rate",
      observed: `${evidence.hitRate.toFixed(0)}% target-hit rate`,
      status: evidence.hitRate >= 70 ? "pass" : evidence.hitRate > 0 ? "watch" : "fail",
      next_action: evidence.hitRate >= 70
        ? "Target-hit rate clears the current paper gate; keep it above 70%."
        : "Run smaller promoted proof windows until target-hit rate recovers above 70%.",
    },
    {
      id: "recent-positive-runs",
      label: "Recent positives",
      required: `${evidence.requiredRecentPositiveRuns} recent positive target-hit run${evidence.requiredRecentPositiveRuns === 1 ? "" : "s"}`,
      observed: `${evidence.recentPositiveCount} recent positive target-hit run${evidence.recentPositiveCount === 1 ? "" : "s"}`,
      status: evidence.recentPositiveCount >= evidence.requiredRecentPositiveRuns ? "pass" : evidence.recentPositiveCount > 0 ? "watch" : "fail",
      next_action: evidence.recentPositiveCount >= evidence.requiredRecentPositiveRuns
        ? "Recent promoted runs are positive enough for the current proof gate."
        : "Collect more recent positive target-hit runs before live review.",
    },
    {
      id: "loss-brake",
      label: "Loss brake",
      required: "No promoted paper loss brake tripped",
      observed: evidence.lossBrakeTripped ? "Loss brake tripped" : "No loss brake tripped",
      status: evidence.lossBrakeTripped ? "fail" : "pass",
      next_action: evidence.lossBrakeTripped
        ? "Stop expansion and repair drawdown before more proof runs."
        : "Loss brake is clear; keep the brake active during proof collection.",
    },
    {
      id: "memory-posture",
      label: "Memory posture",
      required: "Promoted memory is not protect-paper or stand-down",
      observed: evidence.memoryStatus.replaceAll("-", " "),
      status: evidence.memoryProtecting ? "fail" : evidence.memoryStatus === "extend-paper" || evidence.memoryStatus === "continue-paper" ? "pass" : "watch",
      next_action: evidence.memoryProtecting
        ? "Stay in protect/review mode until promoted memory stops protecting the desk."
        : "Use promoted memory posture to cap the next proof window.",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      required: "Profit proof cannot unlock live trading by itself",
      observed: "Live execution and wallet mutation blocked",
      status: "pass",
      next_action: "Treat profit proof as paper evidence only; manual live review and all other live gates remain required.",
    },
  ];
}

function profitProofSummary(
  status: Web3ProfitProofReadinessStatus,
  score: number,
  localNet: number,
  runCount: number,
  hitRate: number,
  totalPnl: number,
) {
  if (status === "repeatable-paper") return `Profit proof is repeatable-paper at ${score}/100: ${runCount} promoted runs, ${hitRate.toFixed(0)}% target hits, ${formatSignedCompactValue(totalPnl)} promoted total.`;
  if (status === "profitable-paper") return `Profit proof is profitable but not long-horizon yet at ${score}/100: ${formatSignedCompactValue(localNet)} local paper net.`;
  if (status === "drawdown-gated") return `Profit proof is drawdown-gated at ${score}/100; paper loss protection is active.`;
  if (status === "blocked") return `Profit proof is blocked at ${score}/100 because promoted memory is protecting the desk.`;
  if (status === "learning") return `Profit proof is still learning at ${score}/100; promoted history is not strong enough for live review.`;
  return `Profit proof is missing at ${score}/100; no promoted paper run evidence is ready.`;
}

function profitProofNextAction(status: Web3ProfitProofReadinessStatus) {
  if (status === "repeatable-paper") return "Keep collecting promoted paper proof; live-capital review still requires the other launch gates.";
  if (status === "profitable-paper") return "Run more promoted paper windows until the sample reaches at least 3 runs with 70%+ target hits and positive total PnL.";
  if (status === "drawdown-gated" || status === "blocked") return "Stop expansion and repair promoted paper drawdown before any stronger autonomy claim.";
  return "Run promoted paper autopilot proof and collect repeatable target-hit evidence before live-capital review.";
}

function profitProofRunPlanSummary(
  status: Web3ProfitProofRunPlan["status"],
  runCount: number,
  remainingRuns: number,
  hitRate: number,
  totalPnl: number,
) {
  if (status === "complete") return `Proof plan is complete: ${runCount} promoted runs, ${hitRate.toFixed(0)}% target hits, ${formatSignedCompactValue(totalPnl)} total.`;
  if (status === "drawdown-gated") return "Proof plan is drawdown-gated; stop expansion until paper loss protection clears.";
  if (status === "blocked") return "Proof plan is blocked because promoted memory is protecting the desk.";
  if (status === "needs-local-accountability") return `Proof plan has enough promoted evidence at ${hitRate.toFixed(0)}% target hits and ${formatSignedCompactValue(totalPnl)} total, but local paper accountability is not strong enough yet.`;
  if (status === "needs-hit-rate") return `Proof plan has enough runs but needs 70%+ target hits and positive total PnL; current hit rate is ${hitRate.toFixed(0)}%.`;
  return `Proof plan needs ${remainingRuns} more promoted paper run${remainingRuns === 1 ? "" : "s"} before live review can trust the sample.`;
}

function profitProofRunPlanNextAction(status: Web3ProfitProofRunPlan["status"], suggestedNextRuns: number, remainingRuns: number) {
  if (status === "complete") return "Keep collecting promoted paper proof while the other live-capital gates are cleared.";
  if (status === "drawdown-gated" || status === "blocked") return "Run proof-only review or stand down until promoted memory no longer protects the desk.";
  if (status === "needs-local-accountability") return "Run local paper accountability cycles until the paper wallet has profitable 70/100+ accountability before claiming the profit gate.";
  if (status === "needs-hit-rate") return "Run a smaller promoted paper proof window and require target-hit recovery before scaling.";
  return `Run ${suggestedNextRuns} promoted paper proof ${suggestedNextRuns === 1 ? "window" : "windows"} now; ${remainingRuns} total promoted run${remainingRuns === 1 ? "" : "s"} remain.`;
}

function checkScore(status: Web3ProfitProofReadinessCheck["status"]) {
  if (status === "pass") return 100;
  if (status === "watch") return 55;
  return 10;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function formatCompactValue(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatSignedCompactValue(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatCompactValue(Math.abs(value))}`;
}

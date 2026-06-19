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
  const recentPositiveCount = recent.filter((run) => run.net_pnl_usd >= 0 && !run.loss_brake_tripped).length;
  const recentLossCount = recent.filter((run) => run.net_pnl_usd < 0 || run.loss_brake_tripped).length;
  const lossBrakeTripped = promotedHealth?.loss_brake_tripped === true || recent.some((run) => run.loss_brake_tripped);
  const memoryProtecting = memoryStatus === "protect-paper" || memoryStatus === "stand-down";
  const enoughSample = runCount >= 3;
  const repeatable = localMakingMoney &&
    enoughSample &&
    totalPnl > 0 &&
    averagePnl > 0 &&
    hitRate >= 70 &&
    recentPositiveCount >= Math.min(3, recent.length || 3) &&
    !lossBrakeTripped &&
    !memoryProtecting;
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
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    summary: profitProofSummary(status, readinessScore, localNet, runCount, hitRate, totalPnl),
    next_action: blockers[0] ?? profitProofNextAction(status),
    blockers,
    checks,
    controls: [
      "Profit proof is paper and receipt evidence only; it does not guarantee future profit or authorize real-capital trading.",
      "Live review requires repeatable positive promoted runs, target-hit consistency, no loss brake, and a profitable local paper accountability score.",
      "This gate never signs, submits, custodies funds, changes wallet balances, or enables autonomous real-money execution.",
    ],
  };
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

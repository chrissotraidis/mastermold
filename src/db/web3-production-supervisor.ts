import type { Web3DaemonSupervisorHealth } from "./web3-daemon-supervisor";

export type Web3ProductionSupervisorReadinessStatus =
  | "missing"
  | "paper-supervised"
  | "production-gated"
  | "stale"
  | "blocked";

export type Web3ProductionSupervisorReadinessCheck = {
  id: "receipt" | "freshness" | "circuit" | "profit-brake" | "drawdown-brake" | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export type Web3ProductionSupervisorReadiness = {
  mode: "web3-production-supervisor-readiness";
  status: Web3ProductionSupervisorReadinessStatus;
  readiness_score: number;
  runner_id: string | null;
  receipt_fresh: boolean;
  receipt_age_seconds: number | null;
  process_manager: "missing" | "local-supervisor-receipt" | "production-review-required";
  paper_supervision_evidence: boolean;
  can_satisfy_process_gate: false;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  summary: string;
  next_action: string;
  blockers: string[];
  checks: Web3ProductionSupervisorReadinessCheck[];
  controls: string[];
};

export function buildWeb3ProductionSupervisorReadiness(
  health: Web3DaemonSupervisorHealth | undefined,
  now = new Date(),
): Web3ProductionSupervisorReadiness {
  const ageSeconds = receiptAgeSeconds(health?.updated_at, now);
  const receiptFresh = ageSeconds !== null && ageSeconds <= 15 * 60;
  const hasReceipt = Boolean(health && health.status !== "absent" && health.updated_at);
  const healthyReceipt = Boolean(
    health &&
      (health.status === "running" || health.status === "completed" || health.status === "idle") &&
      !health.loss_brake_tripped,
  );
  const hardenedPaperRun = Boolean(
    health &&
      health.target_net_pnl_usd > 0 &&
      health.max_drawdown_limit_usd > 0 &&
      health.max_drawdown_usd <= health.max_drawdown_limit_usd,
  );
  const status: Web3ProductionSupervisorReadinessStatus = !hasReceipt
    ? "missing"
    : !healthyReceipt
      ? "blocked"
      : !receiptFresh
        ? "stale"
        : hardenedPaperRun
          ? "production-gated"
          : "paper-supervised";
  const checks = productionSupervisorChecks(health, {
    hasReceipt,
    receiptFresh,
    healthyReceipt,
    hardenedPaperRun,
    ageSeconds,
  });
  const blockers = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.detail)
    .slice(0, 6);
  const readinessScore = Math.round(checks.reduce((sum, check) => sum + checkScore(check.status), 0) / Math.max(1, checks.length));

  return {
    mode: "web3-production-supervisor-readiness",
    status,
    readiness_score: readinessScore,
    runner_id: health?.runner_id ?? null,
    receipt_fresh: receiptFresh,
    receipt_age_seconds: ageSeconds,
    process_manager: !hasReceipt ? "missing" : status === "production-gated" ? "production-review-required" : "local-supervisor-receipt",
    paper_supervision_evidence: hasReceipt && healthyReceipt,
    can_satisfy_process_gate: false,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    summary: productionSupervisorSummary(status, health, readinessScore, ageSeconds),
    next_action: productionSupervisorNextAction(status, health, blockers),
    blockers,
    checks,
    controls: [
      "This report converts sanitized paper-supervisor health into a production cutover gate; it does not start a worker.",
      "A recent paper supervisor receipt can move the gate to review/watch, but cannot unlock real-capital execution.",
      "Production cutover still needs an external process manager, crash restart policy, alerting, secrets management, and explicit live-executor review.",
      "No receipt paths, private keys, API secrets, raw transactions, signed payloads, or wallet mutation authority are exposed.",
    ],
  };
}

function productionSupervisorChecks(
  health: Web3DaemonSupervisorHealth | undefined,
  evidence: {
    hasReceipt: boolean;
    receiptFresh: boolean;
    healthyReceipt: boolean;
    hardenedPaperRun: boolean;
    ageSeconds: number | null;
  },
): Web3ProductionSupervisorReadinessCheck[] {
  return [
    {
      id: "receipt",
      label: "Supervisor receipt",
      status: evidence.hasReceipt ? "pass" : "fail",
      detail: evidence.hasReceipt
        ? `Supervisor receipt is ${health?.status ?? "unknown"} for ${health?.runner_id ?? "unknown runner"}.`
        : "No sanitized daemon supervisor receipt is available.",
    },
    {
      id: "freshness",
      label: "Receipt freshness",
      status: evidence.receiptFresh ? "pass" : evidence.hasReceipt ? "fail" : "watch",
      detail: evidence.ageSeconds === null
        ? "Supervisor receipt age is unknown."
        : `Supervisor receipt age is ${evidence.ageSeconds}s; production review requires 900s or less.`,
    },
    {
      id: "circuit",
      label: "Circuit state",
      status: evidence.healthyReceipt ? "pass" : "fail",
      detail: evidence.healthyReceipt
        ? "Supervisor status is not in error or circuit-open state."
        : `Supervisor status is ${health?.status ?? "absent"}.`,
    },
    {
      id: "profit-brake",
      label: "Profit target",
      status: health && health.target_net_pnl_usd > 0 ? "pass" : "watch",
      detail: health && health.target_net_pnl_usd > 0
        ? `Paper target ${formatCompactValue(health.target_net_pnl_usd)} with ${formatSignedCompactValue(health.net_pnl_usd)} current supervisor PnL.`
        : "Supervisor has no configured paper profit target.",
    },
    {
      id: "drawdown-brake",
      label: "Drawdown brake",
      status: health?.loss_brake_tripped ? "fail" : health && health.max_drawdown_limit_usd > 0 ? "pass" : "watch",
      detail: health?.loss_brake_tripped
        ? "Supervisor loss brake is tripped."
        : health && health.max_drawdown_limit_usd > 0
          ? `Drawdown ${formatCompactValue(health.max_drawdown_usd)} against ${formatCompactValue(health.max_drawdown_limit_usd)} limit.`
          : "Supervisor has no configured paper drawdown brake.",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: "fail",
      detail: "Production supervisor readiness cannot grant real-capital authority from this app; external live-executor review is still required.",
    },
  ];
}

function receiptAgeSeconds(updatedAt: string | null | undefined, now: Date) {
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return null;
  return Math.max(0, Math.round((now.getTime() - Date.parse(updatedAt)) / 1_000));
}

function checkScore(status: Web3ProductionSupervisorReadinessCheck["status"]) {
  if (status === "pass") return 100;
  if (status === "watch") return 55;
  return 10;
}

function productionSupervisorSummary(
  status: Web3ProductionSupervisorReadinessStatus,
  health: Web3DaemonSupervisorHealth | undefined,
  score: number,
  ageSeconds: number | null,
) {
  if (status === "production-gated") return `Supervisor evidence is production-gated at ${score}/100 with a fresh hardened paper receipt; live authority still needs external review.`;
  if (status === "paper-supervised") return `Supervisor evidence is paper-supervised at ${score}/100; add profit and drawdown brakes before production review.`;
  if (status === "stale") return `Supervisor evidence is stale at ${score}/100; last receipt age is ${ageSeconds ?? "unknown"}s.`;
  if (status === "blocked") return `Supervisor evidence is blocked at ${score}/100: ${health?.summary ?? "receipt is unhealthy"}`;
  return `Supervisor evidence is missing at ${score}/100; no production process can be reviewed yet.`;
}

function productionSupervisorNextAction(
  status: Web3ProductionSupervisorReadinessStatus,
  health: Web3DaemonSupervisorHealth | undefined,
  blockers: string[],
) {
  if (status === "production-gated") return "Move this to external production-worker review with process manager, restart policy, alerts, and secret scope documented.";
  if (status === "paper-supervised") return "Run the supervisor with explicit paper profit target and drawdown brake, then keep the receipt fresh.";
  if (status === "stale") return "Restart or refresh the supervised paper daemon run so the production review has a fresh receipt.";
  if (status === "blocked") return blockers[0] ?? health?.summary ?? "Fix supervisor circuit/error state before production review.";
  return "Run npm script supervise:web3 to create a sanitized paper-supervisor receipt before production cutover review.";
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

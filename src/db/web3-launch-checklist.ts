import type { Web3PromotedPaperAutopilotHealth } from "./web3-promoted-paper-autopilot";
import type { Web3DaemonSupervisorHealth } from "./web3-daemon-supervisor";
import { buildWeb3ProductionSupervisorReadiness, type Web3ProductionSupervisorReadiness } from "./web3-production-supervisor";
import type { Web3TradingState } from "./web3-trading";

export type Web3AutonomyLaunchChecklistStatus =
  | "paper-operational"
  | "paper-scale-ready"
  | "paper-memory-gated"
  | "live-gated"
  | "manual-live-review"
  | "blocked";

export type Web3AutonomyLaunchChecklistItem = {
  id:
    | "paper-profit"
    | "promoted-memory"
    | "market-feed"
    | "route-proof"
    | "execution-quality"
    | "custody-policy"
    | "signer"
    | "relay"
    | "settlement"
    | "kill-switch"
    | "process-supervision"
    | "provider-credentials"
    | "wallet-accounting"
    | "profit-proof"
    | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  score: number;
  detail: string;
  blocker: string | null;
};

export type Web3AutonomyLaunchRemainingWorkItem = {
  id: Web3AutonomyLaunchChecklistItem["id"];
  label: string;
  status: "watch" | "fail";
  priority: "required" | "review";
  detail: string;
  next_action: string;
};

export type Web3AutonomyLaunchChecklist = {
  mode: "web3-autonomy-launch-checklist";
  status: Web3AutonomyLaunchChecklistStatus;
  summary: string;
  readiness_score: number;
  completed_proof_count: number;
  remaining_work_count: number;
  paper_scale_permitted: boolean;
  live_review_permitted: boolean;
  real_capital_blocked: boolean;
  next_action: string;
  hard_blocker_count: number;
  watch_count: number;
  hard_blockers: string[];
  production_supervisor_readiness: Web3ProductionSupervisorReadiness;
  controls: string[];
  items: Web3AutonomyLaunchChecklistItem[];
  remaining_work: Web3AutonomyLaunchRemainingWorkItem[];
};

export function buildWeb3AutonomyLaunchChecklist(
  state: Web3TradingState,
  promotedHealth?: Web3PromotedPaperAutopilotHealth,
  supervisorHealth?: Web3DaemonSupervisorHealth,
): Web3AutonomyLaunchChecklist {
  const paperProfit = state.autonomous_profit_accountability;
  const liveReadiness = state.autonomous_live_autonomy_readiness;
  const adapter = state.autonomous_execution_adapter_readiness;
  const dataFreshness = state.autonomous_data_freshness_gate;
  const quality = state.autonomous_execution_quality_arbiter;
  const relay = state.signed_transaction_relay;
  const lifecycle = state.transaction_lifecycle;
  const custody = state.autonomous_custody_mandate;
  const signer = state.autonomous_signer_ops;
  const routeRefresh = state.autonomous_route_refresh_execution;
  const daemon = state.autonomous_daemon_handoff;
  const walletAccounting = state.live_wallet_accounting_readiness;
  const productionSupervisor = buildWeb3ProductionSupervisorReadiness(supervisorHealth);
  const killSwitchFail = state.execution_readiness.checks.some((check) => check.id === "kill-switch" && check.status === "fail");
  const memoryStatus = promotedHealth?.run_memory_status ?? "learning";
  const promotedRunCount = promotedHealth?.run_count ?? 0;
  const promotedHitRate = promotedHealth?.target_hit_rate_pct ?? 0;
  const promotedPnl = promotedHealth?.total_net_pnl_usd ?? 0;

  const promotedMemoryPass = ["continue-paper", "extend-paper"].includes(memoryStatus) && promotedRunCount > 0 && promotedPnl >= 0;
  const promotedMemoryFail = ["protect-paper", "stand-down"].includes(memoryStatus) || promotedHealth?.loss_brake_tripped === true;
  const marketPass = dataFreshness.status === "clear" || dataFreshness.status === "tradeable";
  const routeProofRefreshable = routeRefresh.can_request_readonly_quote || adapter.quote_request_ready;
  const routePass = adapter.quote_request_ready && !routeRefresh.route_refresh_required && routeRefresh.status === "ready";
  const routeScore = Math.max(adapter.readiness_score, routeRefresh.route_confidence_score);
  const executionQualityPass = ["route", "clear", "ready", "execute"].includes(String(quality.status)) || quality.selected_score >= 70;
  const signerPass = signer.can_request_signature && signer.status !== "blocked" && custody.status === "armed";
  const relayPass = relay.status === "ready" || relay.status === "relayed" || relay.status === "confirmed";
  const settlementPass = lifecycle.status === "confirming" || lifecycle.items.some((item) => item.stage === "landed");
  const processSupervisionPass = productionSupervisor.can_satisfy_process_gate;
  const processSupervisionWatch = productionSupervisor.status === "production-gated" || productionSupervisor.status === "paper-supervised";
  const providerCredentialsPass = custody.status === "armed" && signer.can_request_signature && signer.provider_adapter.credential_configured;
  const providerCredentialsWatch = custody.status === "bounded-ready" || signer.ready_count > 0 || signer.can_request_signature;
  const walletAccountingPass = walletAccounting.can_trust_live_pnl;
  const walletAccountingWatch = walletAccounting.status !== "missing-wallet" && walletAccounting.status !== "rpc-gated" && walletAccounting.status !== "blocked";
  const profitProofPass = promotedMemoryPass && paperProfit.making_money && paperProfit.accountability_score >= 70;
  const profitProofWatch = paperProfit.net_pnl_usd >= 0 || promotedRunCount > 0;
  const liveBoundaryPass = !liveReadiness.can_trade_real_capital && !state.execution_gate.live_execution_enabled;

  const items: Web3AutonomyLaunchChecklistItem[] = [
    {
      id: "paper-profit",
      label: "Paper profit",
      status: paperProfit.making_money && paperProfit.accountability_score >= 70 ? "pass" : paperProfit.net_pnl_usd >= 0 ? "watch" : "fail",
      score: paperProfit.accountability_score,
      detail: `${formatSignedCompactValue(paperProfit.net_pnl_usd)} net, ${paperProfit.win_rate_pct.toFixed(0)}% win rate, ${paperProfit.fill_count} paper fills.`,
      blocker: paperProfit.net_pnl_usd < 0 ? paperProfit.next_action : null,
    },
    {
      id: "promoted-memory",
      label: "Promoted memory",
      status: promotedMemoryPass ? "pass" : promotedMemoryFail ? "fail" : "watch",
      score: promotedHealth?.run_memory_score ?? 50,
      detail: `${memoryStatus.replaceAll("-", " ")} across ${promotedRunCount} promoted run${promotedRunCount === 1 ? "" : "s"} with ${promotedHitRate.toFixed(0)}% target hit rate.`,
      blocker: promotedMemoryFail ? promotedHealth?.memory_next_action ?? "Promoted paper memory is protecting the desk." : null,
    },
    {
      id: "market-feed",
      label: "Market feed",
      status: marketPass ? "pass" : dataFreshness.status === "blocked" ? "fail" : "watch",
      score: dataFreshness.data_score,
      detail: `${dataFreshness.status.replaceAll("-", " ")} via ${dataFreshness.next_refresh_lane.replaceAll("-", " ")}; max ${dataFreshness.max_next_fills} next fill${dataFreshness.max_next_fills === 1 ? "" : "s"}.`,
      blocker: marketPass ? null : dataFreshness.next_action,
    },
    {
      id: "route-proof",
      label: "Route proof",
      status: routePass ? "pass" : routeProofRefreshable ? "watch" : "fail",
      score: routeScore,
      detail: `${routeRefresh.selected_lane?.replaceAll("-", " ") ?? adapter.quote_provider.replaceAll("-", " ")} route ${routeRefresh.status.replaceAll("-", " ")}; ${adapter.fastest_ttl_seconds}s TTL.`,
      blocker: routePass ? null : routeProofRefreshable ? routeRefresh.next_action : adapter.next_action,
    },
    {
      id: "execution-quality",
      label: "Execution quality",
      status: executionQualityPass ? "pass" : quality.status === "blocked" ? "fail" : "watch",
      score: quality.selected_score,
      detail: `${quality.status.replaceAll("-", " ")} path ${quality.selected_path.replaceAll("-", " ")}; ${quality.average_execution_score}/100 average quality.`,
      blocker: executionQualityPass ? null : quality.next_action,
    },
    {
      id: "custody-policy",
      label: "Custody policy",
      status: custody.status === "armed" ? "pass" : custody.status === "bounded-ready" || custody.status === "setup-required" ? "watch" : "fail",
      score: custody.status === "armed" ? 90 : custody.status === "bounded-ready" ? 68 : custody.status === "setup-required" ? 42 : 12,
      detail: `${custody.provider.replaceAll("-", " ")} cap ${formatCompactValue(custody.per_trade_limit_usd)} per trade, ${formatCompactValue(custody.remaining_cap_usd)} remaining.`,
      blocker: custody.status === "armed" ? null : custody.next_action,
    },
    {
      id: "signer",
      label: "Signer",
      status: signerPass ? "pass" : signer.status === "blocked" ? "fail" : "watch",
      score: signer.items.find((item) => item.provider === signer.active_provider)?.readiness_score ?? 0,
      detail: `${signer.active_provider.replaceAll("-", " ")} ${signer.can_auto_sign ? "auto-sign" : signer.can_request_signature ? "signature-request" : "locked"}.`,
      blocker: signerPass ? null : signer.next_action,
    },
    {
      id: "relay",
      label: "Relay",
      status: relayPass ? "pass" : relay.status === "failed" ? "fail" : "watch",
      score: relayPass ? 86 : relay.can_accept_signed_payload ? 58 : 24,
      detail: `${relay.submit_path.replaceAll("-", " ")} relay ${relay.status.replaceAll("-", " ")}; confirmation ${relay.confirmation_status ?? "none"}.`,
      blocker: relayPass ? null : relay.next_action,
    },
    {
      id: "settlement",
      label: "Settlement",
      status: settlementPass ? "pass" : lifecycle.status === "blocked" || lifecycle.status === "expired" ? "fail" : "watch",
      score: settlementPass ? 86 : lifecycle.status === "blocked" ? 28 : 48,
      detail: `${lifecycle.status.replaceAll("-", " ")} lifecycle with ${lifecycle.submitted_count} submitted and ${lifecycle.items.filter((item) => item.stage === "landed").length} landed item${lifecycle.items.filter((item) => item.stage === "landed").length === 1 ? "" : "s"}.`,
      blocker: settlementPass ? null : lifecycle.summary,
    },
    {
      id: "kill-switch",
      label: "Kill switch",
      status: killSwitchFail ? "fail" : "pass",
      score: killSwitchFail ? 0 : 100,
      detail: killSwitchFail ? "Operator kill switch is on." : "Kill switch is clear in the current execution config.",
      blocker: killSwitchFail ? "Turn the kill switch off only after the live-capital path has been audited." : null,
    },
    {
      id: "process-supervision",
      label: "Process supervision",
      status: processSupervisionPass ? "pass" : processSupervisionWatch ? "watch" : "fail",
      score: processSupervisionPass ? 92 : productionSupervisor.readiness_score,
      detail: `${productionSupervisor.status.replaceAll("-", " ")}; ${daemon.runner_role.replaceAll("-", " ")} lease ${daemon.lease_status.replaceAll("-", " ")}; ${productionSupervisor.summary}`,
      blocker: processSupervisionPass ? null : productionSupervisor.next_action,
    },
    {
      id: "provider-credentials",
      label: "Provider credentials",
      status: providerCredentialsPass ? "pass" : providerCredentialsWatch ? "watch" : "fail",
      score: providerCredentialsPass ? 90 : providerCredentialsWatch ? 56 : 16,
      detail: `${signer.active_provider.replaceAll("-", " ")} credentials ${signer.provider_adapter.credential_configured ? "configured" : "missing"}; custody ${custody.status.replaceAll("-", " ")}; signature ${signer.can_request_signature ? "requestable" : "locked"}.`,
      blocker: providerCredentialsPass ? null : "Configure reviewed custody/provider credentials, policy ids, wallet scope, and request signing before live-capital review.",
    },
    {
      id: "wallet-accounting",
      label: "Wallet accounting",
      status: walletAccountingPass ? "pass" : walletAccountingWatch ? "watch" : "fail",
      score: walletAccountingPass ? 88 : walletAccountingWatch ? Math.max(42, walletAccounting.readiness_score) : Math.min(28, walletAccounting.readiness_score),
      detail: `${walletAccounting.status.replaceAll("-", " ")}; ${walletAccounting.matched_position_count} matched positions, ${walletAccounting.unpriced_token_account_count} unpriced accounts, settlement ${walletAccounting.settlement_status.replaceAll("-", " ")}.`,
      blocker: walletAccountingPass ? null : walletAccounting.next_action,
    },
    {
      id: "profit-proof",
      label: "Profit proof",
      status: profitProofPass ? "pass" : profitProofWatch ? "watch" : "fail",
      score: profitProofPass ? 92 : profitProofWatch ? 54 : 22,
      detail: `${formatSignedCompactValue(paperProfit.net_pnl_usd)} paper net; promoted memory ${memoryStatus.replaceAll("-", " ")} across ${promotedRunCount} run${promotedRunCount === 1 ? "" : "s"}.`,
      blocker: profitProofPass ? null : "Run long-horizon promoted paper proof with positive net PnL, stable drawdown, and repeatable target-hit evidence before live-capital review.",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: liveBoundaryPass ? "pass" : liveReadiness.can_trade_real_capital ? "watch" : "fail",
      score: liveBoundaryPass ? 100 : liveReadiness.readiness_score,
      detail: liveReadiness.can_trade_real_capital ? "Live readiness reports real-capital permission and requires manual executor review." : liveReadiness.summary,
      blocker: liveBoundaryPass ? null : liveReadiness.next_action,
    },
  ];

  const hardBlockers = items
    .filter((item) => item.status === "fail")
    .map((item) => item.blocker ?? item.detail)
    .filter(Boolean)
    .slice(0, 8);
  const watchCount = items.filter((item) => item.status === "watch").length;
  const completedProofCount = items.filter((item) => item.status === "pass").length;
  const remainingWork = items
    .filter((item): item is Web3AutonomyLaunchChecklistItem & { status: "watch" | "fail" } => item.status !== "pass")
    .map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      priority: item.status === "fail" ? "required" as const : "review" as const,
      detail: item.detail,
      next_action: item.blocker ?? item.detail,
    }))
    .sort((a, b) => launchRemainingWorkRank(b) - launchRemainingWorkRank(a));
  const remainingWorkCount = remainingWork.length;
  const readinessScore = Math.round(items.reduce((sum, item) => sum + item.score, 0) / Math.max(1, items.length));
  const paperScalePermitted = paperProfit.making_money && marketPass && !promotedMemoryFail && !killSwitchFail && paperProfit.accountability_score >= 70;
  const liveReviewPermitted = liveReadiness.can_trade_real_capital &&
    hardBlockers.length === 0 &&
    promotedMemoryPass &&
    settlementPass &&
    relayPass &&
    processSupervisionPass &&
    providerCredentialsPass &&
    walletAccountingPass &&
    profitProofPass;
  const realCapitalBlocked = !liveReviewPermitted;
  const status: Web3AutonomyLaunchChecklistStatus = killSwitchFail || hardBlockers.length >= 3
    ? "blocked"
    : liveReviewPermitted
      ? "manual-live-review"
      : promotedMemoryFail
        ? "paper-memory-gated"
        : !liveReadiness.can_trade_real_capital
          ? paperScalePermitted ? "paper-scale-ready" : "live-gated"
          : "paper-operational";

  return {
    mode: "web3-autonomy-launch-checklist",
    status,
    summary: launchChecklistSummary(status, readinessScore, paperScalePermitted, liveReviewPermitted, hardBlockers),
    readiness_score: readinessScore,
    completed_proof_count: completedProofCount,
    remaining_work_count: remainingWorkCount,
    paper_scale_permitted: paperScalePermitted,
    live_review_permitted: liveReviewPermitted,
    real_capital_blocked: realCapitalBlocked,
    next_action: launchChecklistNextAction(status, items, state),
    hard_blocker_count: hardBlockers.length,
    watch_count: watchCount,
    hard_blockers: hardBlockers,
    production_supervisor_readiness: productionSupervisor,
    controls: [
      "This checklist is a launch-readiness contract; it does not sign, submit, custody funds, or unlock real-capital trading.",
      "Paper scale requires current paper profit proof, market freshness, promoted-run memory that is not protecting, and a clear kill switch.",
      "Live review requires every signer, relay, settlement, custody, route, process-supervision, provider-credential, wallet-accounting, profit-proof, and live-boundary proof to pass before a separate executor review.",
      "Real-capital autonomy stays blocked unless this checklist reaches manual live review and an external reviewed executor is deliberately enabled.",
    ],
    items,
    remaining_work: remainingWork,
  };
}

function launchRemainingWorkRank(item: Web3AutonomyLaunchRemainingWorkItem) {
  const priority = item.priority === "required" ? 20 : 8;
  const liveCapitalGate = ["signer", "relay", "settlement", "custody-policy", "kill-switch", "process-supervision", "provider-credentials", "wallet-accounting", "profit-proof"].includes(item.id) ? 8 : 0;
  const routeOrMarketGate = item.id === "route-proof" || item.id === "market-feed" ? 6 : 0;
  return priority + liveCapitalGate + routeOrMarketGate;
}

function launchChecklistSummary(
  status: Web3AutonomyLaunchChecklistStatus,
  readinessScore: number,
  paperScalePermitted: boolean,
  liveReviewPermitted: boolean,
  blockers: string[],
) {
  if (liveReviewPermitted) return `Launch checklist is at manual live review with ${readinessScore}/100 readiness; no autonomous live executor is unlocked here.`;
  if (status === "blocked") return `Launch checklist is blocked at ${readinessScore}/100: ${blockers[0] ?? "hard blockers remain"}.`;
  if (status === "paper-memory-gated") return `Launch checklist is memory-gated at ${readinessScore}/100; promoted paper history is protecting the desk.`;
  if (paperScalePermitted) return `Launch checklist clears larger paper scaling at ${readinessScore}/100 while real-capital trading remains blocked.`;
  if (status === "live-gated") return `Launch checklist is live-gated at ${readinessScore}/100; paper automation can continue but live-capital proof is incomplete.`;
  return `Launch checklist is operational for bounded paper trading at ${readinessScore}/100.`;
}

function launchChecklistNextAction(
  status: Web3AutonomyLaunchChecklistStatus,
  items: Web3AutonomyLaunchChecklistItem[],
  state: Web3TradingState,
) {
  const failed = items.find((item) => item.status === "fail");
  const watched = items.find((item) => item.status === "watch");
  if (status === "manual-live-review") return "Keep autonomous execution behind manual live-executor review; do not let the app self-enable real-capital trading.";
  if (status === "paper-scale-ready") return state.autonomous_now_decision.next_action;
  if (status === "paper-memory-gated") return items.find((item) => item.id === "promoted-memory")?.blocker ?? "Run only protective or tiny paper loops until promoted memory improves.";
  if (failed) return failed.blocker ?? failed.detail;
  return watched?.blocker ?? watched?.detail ?? state.autonomous_now_decision.next_action;
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

import type { Web3PromotedPaperAutopilotHealth } from "./web3-promoted-paper-autopilot";
import type { Web3DaemonSupervisorHealth } from "./web3-daemon-supervisor";
import { buildWeb3ProductionSupervisorReadiness, type Web3ProductionSupervisorReadiness } from "./web3-production-supervisor";
import { buildWeb3ProfitProofReadiness, type Web3ProfitProofReadiness } from "./web3-profit-proof";
import { buildWeb3ProviderCredentialsReadiness, type Web3ProviderCredentialsReadiness } from "./web3-provider-credentials";
import { getWeb3LocalAccountabilityRepairHealth, type Web3LocalAccountabilityRepairHealth } from "./web3-local-accountability-repair";
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

export type Web3AutonomyCutoverRunwayStep = {
  id:
    | "profit-proof"
    | "production-supervision"
    | "wallet-provider-scope"
    | "route-order-rehearsal"
    | "manual-live-review";
  label: string;
  status: "done" | "active" | "blocked" | "review";
  command: string | null;
  evidence: string;
  next_action: string;
  blocks_live_capital: boolean;
};

export type Web3AutonomyLaunchResearchDecision = {
  id:
    | "provider-stack"
    | "market-discovery"
    | "execution-stack"
    | "signer-custody"
    | "risk-policy"
    | "live-cutover";
  label: string;
  status: "chosen" | "needs-credential" | "needs-review" | "blocked";
  decision: string;
  evidence: string;
  next_action: string;
  needs_user_input: string[];
};

export type Web3AutonomyLaunchOperatorInput = {
  id:
    | "helius-solana-read-rail"
    | "dedicated-trading-wallet"
    | "wallet-ownership-proof"
    | "jupiter-route-order-key"
    | "signer-custody-choice"
    | "signer-provider-credentials"
    | "settlement-accounting-review"
    | "manual-live-approval";
  label: string;
  status: "needed" | "ready" | "review" | "blocked";
  storage:
    | "server-env"
    | "browser-public-scope"
    | "hash-only-local-receipt"
    | "external-operator-review"
    | "future-signer-vault"
    | "never-store";
  detail: string;
  next_action: string;
  secret_handling: string;
};

export type Web3AutonomyLaunchRepairAction = {
  id:
    | "repair-execution-quality"
    | "repair-paper-accountability"
    | "refresh-supervisor-proof"
    | "rehearse-route-order"
    | "scope-operator-inputs"
    | "run-web3-verifier";
  label: string;
  status: "ready" | "active" | "blocked" | "review";
  surface: "trading-cockpit" | "settings" | "terminal";
  command: string | null;
  detail: string;
  next_action: string;
  blocks_live_capital: boolean;
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
  next_cutover_step: Web3AutonomyCutoverRunwayStep;
  cutover_runway: Web3AutonomyCutoverRunwayStep[];
  production_supervisor_readiness: Web3ProductionSupervisorReadiness;
  profit_proof_readiness: Web3ProfitProofReadiness;
  local_accountability_repair_health: Web3LocalAccountabilityRepairHealth;
  provider_credentials_readiness: Web3ProviderCredentialsReadiness;
  research_decisions: Web3AutonomyLaunchResearchDecision[];
  operator_inputs_needed: Web3AutonomyLaunchOperatorInput[];
  next_operator_action: Web3AutonomyLaunchOperatorInput | null;
  repair_actions: Web3AutonomyLaunchRepairAction[];
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
  const profitProof = buildWeb3ProfitProofReadiness({ paperProfit, promotedHealth });
  const localAccountabilityRepairHealth = getWeb3LocalAccountabilityRepairHealth();
  const providerCredentials = buildWeb3ProviderCredentialsReadiness({ custody, signer });
  const killSwitchFail = state.execution_readiness.checks.some((check) => check.id === "kill-switch" && check.status === "fail");
  const memoryStatus = promotedHealth?.run_memory_status ?? "learning";
  const promotedRunCount = promotedHealth?.run_count ?? 0;
  const promotedHitRate = promotedHealth?.target_hit_rate_pct ?? 0;
  const promotedPnl = promotedHealth?.total_net_pnl_usd ?? 0;

  const promotedMemoryPass = ["continue-paper", "extend-paper"].includes(memoryStatus) && promotedRunCount > 0 && promotedPnl >= 0;
  const promotedMemoryFail = ["protect-paper", "stand-down"].includes(memoryStatus) || promotedHealth?.loss_brake_tripped === true;
  const marketPass = dataFreshness.status === "clear" || dataFreshness.status === "tradeable";
  const routePaperRehearsalReady = routeRefresh.local_rehearsal_ready === true;
  const routeProofRefreshable = routeRefresh.can_request_readonly_quote || adapter.quote_request_ready || routePaperRehearsalReady;
  const routePass = adapter.quote_request_ready && !routeRefresh.route_refresh_required && routeRefresh.status === "ready";
  const routeScore = Math.max(adapter.readiness_score, routeRefresh.route_confidence_score);
  const executionQualityPass = ["route", "clear", "ready", "execute"].includes(String(quality.status)) || quality.selected_score >= 70;
  const signerPass = signer.can_request_signature && signer.status !== "blocked" && custody.status === "armed";
  const relayPass = relay.status === "ready" || relay.status === "relayed" || relay.status === "confirmed";
  const settlementPass = lifecycle.status === "confirming" || lifecycle.items.some((item) => item.stage === "landed");
  const processSupervisionPass = productionSupervisor.can_satisfy_process_gate;
  const processSupervisionWatch = productionSupervisor.status === "production-gated" || productionSupervisor.status === "paper-supervised";
  const providerCredentialsPass = providerCredentials.can_satisfy_provider_gate;
  const providerCredentialsWatch = providerCredentials.status === "policy-gated" ||
    providerCredentials.status === "request-gated" ||
    providerCredentials.status === "provider-ready";
  const walletAccountingPass = walletAccounting.can_trust_live_pnl;
  const walletAccountingWatch = walletAccounting.status !== "missing-wallet" && walletAccounting.status !== "rpc-gated" && walletAccounting.status !== "blocked";
  const profitProofPass = profitProof.can_satisfy_profit_gate;
  const profitProofWatch = profitProof.status === "profitable-paper" || (profitProof.status === "learning" && profitProof.promoted_run_count > 0);
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
      detail: routePaperRehearsalReady && !routePass && !routeRefresh.can_request_readonly_quote
        ? `local paper route rehearsal accepted at ${routeRefresh.route_confidence_score}/100; live route still needs read-only quote/order proof.`
        : `${routeRefresh.selected_lane?.replaceAll("-", " ") ?? adapter.quote_provider.replaceAll("-", " ")} route ${routeRefresh.status.replaceAll("-", " ")}; ${adapter.fastest_ttl_seconds}s TTL.`,
      blocker: routePass
        ? null
        : routePaperRehearsalReady && !routeRefresh.can_request_readonly_quote
          ? "Use the order rehearsal action to turn local paper route evidence into read-only quote and dry-run order proof before live review."
          : routeProofRefreshable
            ? routeRefresh.next_action
            : adapter.next_action,
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
      score: providerCredentialsPass ? 90 : providerCredentialsWatch ? Math.max(48, providerCredentials.readiness_score) : Math.min(30, providerCredentials.readiness_score),
      detail: `${providerCredentials.status.replaceAll("-", " ")}; read rail ${providerCredentials.read_provider_status}, ${providerCredentials.provider.replaceAll("-", " ")} via ${providerCredentials.request_transport.replaceAll("-", " ")}, packet ${providerCredentials.adapter_status.replaceAll("-", " ")}.`,
      blocker: providerCredentialsPass ? null : providerCredentials.next_action,
    },
    {
      id: "wallet-accounting",
      label: "Wallet accounting",
      status: walletAccountingPass ? "pass" : walletAccountingWatch ? "watch" : "fail",
      score: walletAccountingPass ? 88 : walletAccountingWatch ? Math.max(42, walletAccounting.readiness_score) : Math.min(28, walletAccounting.readiness_score),
      detail: `${walletAccounting.status.replaceAll("-", " ")}; ${walletAccounting.matched_position_count} matched positions, ${walletAccounting.unpriced_token_account_count} unpriced accounts, asset index ${walletAccounting.asset_index_status.replaceAll("-", " ")}, settlement ${walletAccounting.settlement_status.replaceAll("-", " ")}.`,
      blocker: walletAccountingPass ? null : walletAccounting.next_action,
    },
    {
      id: "profit-proof",
      label: "Profit proof",
      status: profitProofPass ? "pass" : profitProofWatch ? "watch" : "fail",
      score: profitProofPass ? 92 : profitProofWatch ? Math.max(48, profitProof.readiness_score) : Math.min(32, profitProof.readiness_score),
      detail: `${profitProof.status.replaceAll("-", " ")}; ${formatSignedCompactValue(profitProof.promoted_total_net_pnl_usd)} promoted total, ${profitProof.promoted_target_hit_rate_pct.toFixed(0)}% target hits across ${profitProof.promoted_run_count} run${profitProof.promoted_run_count === 1 ? "" : "s"}.`,
      blocker: profitProofPass ? null : profitProof.next_action,
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
  const paperScalePermitted = profitProof.can_support_paper_scale && marketPass && !promotedMemoryFail && !killSwitchFail;
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
  const cutoverRunway = buildCutoverRunway({
    profitProof,
    localAccountabilityRepairHealth,
    marketSourceMode: state.market_source.mode,
    productionSupervisor,
    providerCredentials,
    walletAccounting,
    routePass,
    routeProofRefreshable,
    routePaperRehearsalReady,
    adapterOrderReady: adapter.swap_v2_order_ready,
    liveReviewPermitted,
  });
  const nextCutoverStep = cutoverRunway.find((step) => step.status !== "done") ?? cutoverRunway[cutoverRunway.length - 1];
  const researchDecisions = buildResearchDecisions({
    state,
    providerCredentials,
    walletAccounting,
    productionSupervisor,
    profitProof,
    routePass,
    adapterOrderReady: adapter.swap_v2_order_ready,
    killSwitchFail,
    liveReviewPermitted,
  });
  const operatorInputsNeeded = buildOperatorInputsNeeded({
    state,
    providerCredentials,
    walletAccounting,
    productionSupervisor,
    profitProof,
    routePass,
    adapterOrderReady: adapter.swap_v2_order_ready,
    settlementPass,
    liveReviewPermitted,
  });
  const nextOperatorAction = selectNextOperatorAction(operatorInputsNeeded);
  const repairActions = buildRepairActions({
    items,
    operatorInputsNeeded,
    productionSupervisor,
    profitProof,
    localAccountabilityRepairHealth,
    marketSourceMode: state.market_source.mode,
    routePass,
    routeProofRefreshable,
    adapterOrderReady: adapter.swap_v2_order_ready,
    liveReviewPermitted,
  });

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
    next_cutover_step: nextCutoverStep,
    cutover_runway: cutoverRunway,
    production_supervisor_readiness: productionSupervisor,
    profit_proof_readiness: profitProof,
    local_accountability_repair_health: localAccountabilityRepairHealth,
    provider_credentials_readiness: providerCredentials,
    research_decisions: researchDecisions,
    operator_inputs_needed: operatorInputsNeeded,
    next_operator_action: nextOperatorAction,
    repair_actions: repairActions,
    controls: [
      "This checklist is a launch-readiness contract; it does not sign, submit, custody funds, or unlock real-capital trading.",
      "The operator input packet names only public wallet scope, server-env targets, hash-only receipts, or external review decisions; private keys and seed phrases stay out of this app.",
      "The launch repair queue turns raw blockers into safe cockpit, Settings, or terminal actions; it can refresh evidence and paper proof, but it cannot create external accounts or authorize live capital.",
      "Local accountability repair health is read from a sanitized paper-only receipt when available; stalled repair loops are shown as review blockers instead of hidden terminal churn.",
      "Paper scale requires current paper profit proof, market freshness, promoted-run memory that is not protecting, and a clear kill switch.",
      "Live review requires every signer, relay, settlement, custody, route, process-supervision, provider-credential, wallet-accounting, profit-proof, and live-boundary proof to pass before a separate executor review.",
      "Real-capital autonomy stays blocked unless this checklist reaches manual live review and an external reviewed executor is deliberately enabled.",
    ],
    items,
    remaining_work: remainingWork,
  };
}

function selectNextOperatorAction(operatorInputs: Web3AutonomyLaunchOperatorInput[]) {
  const priority: Web3AutonomyLaunchOperatorInput["id"][] = [
    "helius-solana-read-rail",
    "jupiter-route-order-key",
    "dedicated-trading-wallet",
    "wallet-ownership-proof",
    "signer-custody-choice",
    "signer-provider-credentials",
    "settlement-accounting-review",
    "manual-live-approval",
  ];
  const byId = new Map(operatorInputs.map((item) => [item.id, item]));
  const statuses: Web3AutonomyLaunchOperatorInput["status"][] = ["needed", "blocked", "review"];
  for (const status of statuses) {
    for (const id of priority) {
      const item = byId.get(id);
      if (item?.status === status) return item;
    }
  }
  return null;
}

function buildOperatorInputsNeeded({
  state,
  providerCredentials,
  walletAccounting,
  productionSupervisor,
  profitProof,
  routePass,
  adapterOrderReady,
  settlementPass,
  liveReviewPermitted,
}: {
  state: Web3TradingState;
  providerCredentials: Web3ProviderCredentialsReadiness;
  walletAccounting: Web3TradingState["live_wallet_accounting_readiness"];
  productionSupervisor: Web3ProductionSupervisorReadiness;
  profitProof: Web3ProfitProofReadiness;
  routePass: boolean;
  adapterOrderReady: boolean;
  settlementPass: boolean;
  liveReviewPermitted: boolean;
}): Web3AutonomyLaunchOperatorInput[] {
  const walletPublicKey = state.execution_readiness.config.wallet_public_key;
  const heliusOrRpcConfigured = providerCredentials.helius_rpc_configured || Boolean(process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
  const jupiterConfigured = providerCredentials.jupiter_configured || Boolean(process.env.JUPITER_API_KEY);
  const signerProviderSelected = providerCredentials.provider_configured || providerCredentials.credential_configured;
  const signerReady = providerCredentials.can_request_signature || providerCredentials.can_request_provider_signature;
  const custodyReviewable = providerCredentials.policy_hash_valid && providerCredentials.custody_status !== "blocked";
  const settlementReviewable = settlementPass && walletAccounting.can_trust_live_pnl;

  return [
    {
      id: "helius-solana-read-rail",
      label: "Helius / Solana read rail",
      status: heliusOrRpcConfigured ? "ready" : "needed",
      storage: "server-env",
      detail: heliusOrRpcConfigured
        ? "Read-only chain and wallet provider scope is visible to the launch checklist."
        : "Read-only chain and wallet evidence needs HELIUS_API_KEY or SOLANA_RPC_URL.",
      next_action: heliusOrRpcConfigured
        ? "Run provider health against the dedicated wallet before live review."
        : "Add HELIUS_API_KEY or SOLANA_RPC_URL to ignored server environment only.",
      secret_handling: "Provider keys stay server-side or one-shot test only; they are never saved to browser storage or returned by receipts.",
    },
    {
      id: "dedicated-trading-wallet",
      label: "Dedicated trading wallet",
      status: providerCredentials.dedicated_wallet_scoped ? "ready" : "needed",
      storage: "browser-public-scope",
      detail: providerCredentials.dedicated_wallet_scoped
        ? `A non-sample public trading wallet is scoped${walletPublicKey ? ` (${walletPublicKey.slice(0, 4)}...${walletPublicKey.slice(-4)})` : ""}.`
        : providerCredentials.wallet_is_sample
          ? "The sample all-ones wallet is demo-only and cannot satisfy live operator scope."
          : "A dedicated non-sample public Solana trading wallet has not been scoped.",
      next_action: providerCredentials.dedicated_wallet_scoped
        ? "Keep this wallet isolated for Mastermind trading and continue ownership/accounting proof."
        : "Save a dedicated public Solana trading wallet address in Settings; do not paste private keys or seed phrases.",
      secret_handling: "Only the public address belongs here; private keys and seed phrases are never accepted.",
    },
    {
      id: "wallet-ownership-proof",
      label: "Wallet ownership proof",
      status: providerCredentials.wallet_ownership_proved
        ? "ready"
        : providerCredentials.dedicated_wallet_scoped
          ? "needed"
          : "blocked",
      storage: "hash-only-local-receipt",
      detail: providerCredentials.wallet_ownership_proved
        ? "A hash-only local receipt proves public-wallet control."
        : providerCredentials.dedicated_wallet_scoped
          ? "The dedicated wallet still needs a text-only ownership signature receipt."
          : "Ownership proof waits for a dedicated public wallet.",
      next_action: providerCredentials.wallet_ownership_proved
        ? "Keep the receipt for review and rotate it if the wallet changes."
        : providerCredentials.dedicated_wallet_scoped
          ? "Use Prove ownership with the browser wallet; this signs text only and cannot move funds."
          : "Scope the dedicated wallet first, then prove ownership.",
      secret_handling: "The app stores challenge/signature hashes only; it never stores raw signatures, transaction signatures, or wallet authority.",
    },
    {
      id: "jupiter-route-order-key",
      label: "Jupiter route/order key",
      status: jupiterConfigured && routePass && adapterOrderReady
        ? "ready"
        : jupiterConfigured
          ? "review"
          : "needed",
      storage: "server-env",
      detail: jupiterConfigured
        ? `Jupiter credential scope is present; route proof ${routePass ? "passes" : "still needs refresh"} and order readiness is ${adapterOrderReady ? "ready" : "gated"}.`
        : "Jupiter route/order rehearsal needs JUPITER_API_KEY before Swap V2 order evidence can pass.",
      next_action: jupiterConfigured
        ? "Run Jupiter rehearsal and landing drill until quote and unsigned order proof pass with transaction bytes withheld."
        : "Add JUPITER_API_KEY to ignored server environment or use a one-shot session test; never save it in browser storage.",
      secret_handling: "Jupiter keys stay in server env or a one-shot request; receipts show configured/missing status only.",
    },
    {
      id: "signer-custody-choice",
      label: "Signer/custody choice",
      status: custodyReviewable ? "review" : signerProviderSelected ? "review" : "needed",
      storage: "external-operator-review",
      detail: signerProviderSelected
        ? `${providerCredentials.provider} is selected with ${providerCredentials.custody_status} custody and ${providerCredentials.signer_status} signer state.`
        : "The first live path needs an explicit signer/custody posture before any signature request can be reviewed.",
      next_action: signerProviderSelected
        ? "Keep manual external wallet approval for the first live path unless a reviewed policy signer is configured."
        : "Choose manual external wallet, Privy, Turnkey, session-key policy, or another reviewed signer outside this app.",
      secret_handling: "The app records the choice and policy evidence only; signer secrets and wallet authority stay outside the app.",
    },
    {
      id: "signer-provider-credentials",
      label: "Signer provider credentials",
      status: signerReady ? "review" : "blocked",
      storage: "future-signer-vault",
      detail: signerReady
        ? "A hash-only signer request can be reviewed, but provider dispatch remains blocked here."
        : "No signer-bound request or managed signer credential is active.",
      next_action: signerReady
        ? "Review request id, payload hash, policy hash, and user-presence rules outside the live executor."
        : "Do not configure private keys here; add only reviewed provider identifiers after signer/custody is chosen.",
      secret_handling: "Future signer credentials must live in a dedicated signer vault or provider console, never in this app or browser storage.",
    },
    {
      id: "settlement-accounting-review",
      label: "Settlement and accounting review",
      status: settlementReviewable ? "review" : "needed",
      storage: "external-operator-review",
      detail: settlementReviewable
        ? "Settlement evidence and wallet PnL are reviewable, but still require external live-executor signoff."
        : `${walletAccounting.status.replaceAll("-", " ")} wallet accounting; settlement lifecycle is ${settlementPass ? "partially proven" : "not proven"}.`,
      next_action: settlementReviewable
        ? "Review reconciliation evidence against live executor receipts before allowing any real-capital mirror."
        : "Price/review wallet token accounts and prove submitted-to-landed fill reconciliation before live review.",
      secret_handling: "Accounting receipts may store aggregate balances, hashes, and reviewed fill evidence, never private keys or raw transaction authority.",
    },
    {
      id: "manual-live-approval",
      label: "Manual live approval",
      status: liveReviewPermitted
        ? "review"
        : productionSupervisor.status === "blocked" || profitProof.status === "blocked"
          ? "blocked"
          : "needed",
      storage: "external-operator-review",
      detail: liveReviewPermitted
        ? "All app-side gates are ready for a separate manual live-executor review."
        : "Manual live approval is unavailable until wallet, provider, signer, settlement, supervision, accounting, and profit gates pass.",
      next_action: liveReviewPermitted
        ? "Perform a separate external live-executor review; this app still cannot self-enable real-capital trading."
        : "Clear the operator input packet and cutover runway before requesting live review.",
      secret_handling: "Approval is an external decision record; it must not include private keys, seed phrases, or raw transaction payloads.",
    },
  ];
}

function buildRepairActions({
  items,
  operatorInputsNeeded,
  productionSupervisor,
  profitProof,
  localAccountabilityRepairHealth,
  marketSourceMode,
  routePass,
  routeProofRefreshable,
  adapterOrderReady,
  liveReviewPermitted,
}: {
  items: Web3AutonomyLaunchChecklistItem[];
  operatorInputsNeeded: Web3AutonomyLaunchOperatorInput[];
  productionSupervisor: Web3ProductionSupervisorReadiness;
  profitProof: Web3ProfitProofReadiness;
  localAccountabilityRepairHealth: Web3LocalAccountabilityRepairHealth;
  marketSourceMode: Web3TradingState["market_source"]["mode"];
  routePass: boolean;
  routeProofRefreshable: boolean;
  adapterOrderReady: boolean;
  liveReviewPermitted: boolean;
}): Web3AutonomyLaunchRepairAction[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const executionQuality = itemById.get("execution-quality");
  const routeProof = itemById.get("route-proof");
  const openOperatorInputs = operatorInputsNeeded.filter((item) => item.status !== "ready");
  const supervisorFreshEnough = productionSupervisor.status === "production-gated" && productionSupervisor.receipt_fresh;
  const proofPlan = profitProof.proof_plan;
  const needsProfitRepair = !profitProof.can_satisfy_profit_gate || proofPlan.status !== "complete";
  const repairReceiptVisible = localAccountabilityRepairHealth.status !== "absent";
  const repairReceiptStale = repairReceiptVisible && !localAccountabilityRepairHealth.receipt_fresh;
  const repairPlateaued = localAccountabilityRepairHealth.repair_plateaued;

  const actions: Web3AutonomyLaunchRepairAction[] = [];

  if (executionQuality && executionQuality.status !== "pass") {
    actions.push({
      id: "repair-execution-quality",
      label: "Repair fill quality",
      status: executionQuality.status === "fail" ? "active" : "review",
      surface: "trading-cockpit",
      command: null,
      detail: executionQuality.detail,
      next_action: "Use the cockpit Auto Watch or protected paper tick controls to collect cleaner paper fills; keep fresh buys blocked until fill quality clears.",
      blocks_live_capital: true,
    });
  }

  if (needsProfitRepair) {
    actions.push({
      id: "repair-paper-accountability",
      label: "Repair paper accountability",
      status: repairPlateaued || proofPlan.status === "blocked" || proofPlan.status === "drawdown-gated" ? "blocked" : "active",
      surface: "terminal",
      command: proofPlan.status === "needs-local-accountability"
        ? localAccountabilityRepairCommand(marketSourceMode)
        : proofPlan.safe_command,
      detail: repairReceiptVisible
        ? `${profitProof.status.replaceAll("-", " ")} profit proof with ${formatSignedCompactValue(profitProof.local_paper_net_pnl_usd)} local paper net and ${profitProof.local_paper_accountability_score}/100 accountability. Last repair ${localAccountabilityRepairHealth.status.replaceAll("-", " ")}${repairReceiptStale ? " (stale)" : ""}: ${localAccountabilityRepairHealth.summary}`
        : `${profitProof.status.replaceAll("-", " ")} profit proof with ${formatSignedCompactValue(profitProof.local_paper_net_pnl_usd)} local paper net and ${profitProof.local_paper_accountability_score}/100 accountability.`,
      next_action: repairReceiptVisible ? localAccountabilityRepairHealth.next_action : proofPlan.next_action,
      blocks_live_capital: true,
    });
  }

  if (!supervisorFreshEnough || !productionSupervisor.can_satisfy_process_gate) {
    actions.push({
      id: "refresh-supervisor-proof",
      label: "Refresh supervisor proof",
      status: productionSupervisor.status === "blocked" ? "blocked" : "active",
      surface: "terminal",
      command: "npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json",
      detail: productionSupervisor.summary,
      next_action: productionSupervisor.next_action,
      blocks_live_capital: true,
    });
  }

  if (!(routePass && adapterOrderReady)) {
    actions.push({
      id: "rehearse-route-order",
      label: "Rehearse route/order",
      status: routeProofRefreshable ? "active" : "blocked",
      surface: "terminal",
      command: "npm run landing-drill:web3",
      detail: routeProof?.detail ?? "Route/order proof is missing from the launch checklist.",
      next_action: routeProof?.blocker ?? "Run the read-only landing drill after provider and route evidence are available.",
      blocks_live_capital: true,
    });
  }

  if (openOperatorInputs.length > 0) {
    actions.push({
      id: "scope-operator-inputs",
      label: "Scope operator inputs",
      status: openOperatorInputs.some((item) => item.status === "blocked") ? "blocked" : "active",
      surface: "settings",
      command: null,
      detail: `${openOperatorInputs.length} operator input${openOperatorInputs.length === 1 ? "" : "s"} remain: ${openOperatorInputs.slice(0, 4).map((item) => item.label).join(", ")}.`,
      next_action: "Open Settings or the cockpit operator packet, then provide only public wallet scope, server-env credentials, hash-only proof, or external review decisions.",
      blocks_live_capital: true,
    });
  }

  actions.push({
    id: "run-web3-verifier",
    label: "Run Web3 verifier",
    status: liveReviewPermitted ? "review" : "ready",
    surface: "terminal",
    command: "npm run verify:web3 -- --base-url=http://localhost:4010",
    detail: liveReviewPermitted
      ? "Verifier should still pass before external live-executor review."
      : "Non-strict verifier checks redaction, public-wallet restore, provider health, DEX receipt, Jupiter rehearsal boundary, and live locks.",
    next_action: liveReviewPermitted
      ? "Run strict and non-strict verification before any external live review."
      : "Run this after each credential, wallet, signer, route, or launch-readiness change.",
    blocks_live_capital: true,
  });

  return actions.slice(0, 6);
}

function localAccountabilityRepairCommand(marketSourceMode: Web3TradingState["market_source"]["mode"]) {
  return marketSourceMode === "live-dex"
    ? "npm run repair-accountability:web3 -- --source=live-dex"
    : "npm run repair-accountability:web3";
}

function buildResearchDecisions({
  state,
  providerCredentials,
  walletAccounting,
  productionSupervisor,
  profitProof,
  routePass,
  adapterOrderReady,
  killSwitchFail,
  liveReviewPermitted,
}: {
  state: Web3TradingState;
  providerCredentials: Web3ProviderCredentialsReadiness;
  walletAccounting: Web3TradingState["live_wallet_accounting_readiness"];
  productionSupervisor: Web3ProductionSupervisorReadiness;
  profitProof: Web3ProfitProofReadiness;
  routePass: boolean;
  adapterOrderReady: boolean;
  killSwitchFail: boolean;
  liveReviewPermitted: boolean;
}): Web3AutonomyLaunchResearchDecision[] {
  const rpcConfigured = Boolean(process.env.HELIUS_API_KEY || process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
  const walletScoped = Boolean(state.execution_readiness.config.wallet_public_key);
  const jupiterConfigured = Boolean(process.env.JUPITER_API_KEY);
  const signerChosen = providerCredentials.provider_configured || providerCredentials.credential_configured;
  const capsReady = state.execution_readiness.config.daily_spend_cap_usd >= state.execution_readiness.config.max_trade_usd &&
    state.execution_readiness.config.max_slippage_bps <= 250 &&
    !killSwitchFail;

  return [
    {
      id: "provider-stack",
      label: "Provider stack",
      status: rpcConfigured ? "chosen" : "needs-credential",
      decision: "Use Helius/Solana RPC as the first read-only wallet and chain data rail; keep provider keys server-side or one-shot test-only.",
      evidence: rpcConfigured
        ? "A Solana RPC credential is present in server scope; responses still redact endpoints and secrets."
        : "No server-scoped Helius or Solana RPC credential is visible to the launch contract.",
      next_action: rpcConfigured
        ? "Use the Wiring credential test to prove RPC health against the target trading wallet."
        : "Add HELIUS_API_KEY or SOLANA_RPC_URL to the ignored local environment, then test credentials.",
      needs_user_input: rpcConfigured ? [] : ["Helius API key or Solana RPC URL"],
    },
    {
      id: "market-discovery",
      label: "Market discovery",
      status: state.market_source.status === "live" || state.autonomous_market_intake_plan.can_feed_trade_loop ? "chosen" : "needs-review",
      decision: "Start with the app's live DEX/read-only market intake plus chart and route proof before adding paid discovery feeds.",
      evidence: `${state.autonomous_market_intake_plan.next_provider} ${state.autonomous_market_intake_plan.next_lane.replaceAll("-", " ")} intake; market source is ${state.market_source.status}.`,
      next_action: state.market_source.status === "live"
        ? "Keep live DEX reads read-only and route-gated until wallet/provider scope passes."
        : "Use Live DEX read from the cockpit to refresh trending memecoin evidence before order rehearsal.",
      needs_user_input: [],
    },
    {
      id: "execution-stack",
      label: "Execution stack",
      status: routePass && adapterOrderReady ? "chosen" : jupiterConfigured ? "needs-review" : "needs-credential",
      decision: "Use Jupiter quote/order rehearsal as the first execution path, with no signing or submit until manual live review.",
      evidence: `Route proof ${routePass ? "passes" : "is gated"}; Swap V2 order ${adapterOrderReady ? "ready" : "not ready"}.`,
      next_action: routePass && adapterOrderReady
        ? "Continue read-only order rehearsal and landing drills before any live executor review."
        : jupiterConfigured
          ? "Run Order rehearsal and npm run landing-drill:web3 to prove the unsigned order path."
          : "Add JUPITER_API_KEY if Swap V2 order rehearsal is required for the chosen execution lane.",
      needs_user_input: jupiterConfigured ? [] : ["Jupiter API key"],
    },
    {
      id: "signer-custody",
      label: "Signer custody",
      status: providerCredentials.can_satisfy_provider_gate && walletAccounting.can_trust_live_pnl
        ? "chosen"
        : signerChosen || walletScoped
          ? "needs-review"
          : "needs-credential",
      decision: "Use a dedicated trading wallet with manual external approval first; never collect private keys in this app.",
      evidence: `${providerCredentials.status.replaceAll("-", " ")} provider scope; ${walletAccounting.status.replaceAll("-", " ")} wallet accounting.`,
      next_action: walletScoped
        ? "Test credentials, then keep signer/custody behind manual review until settlement and accounting pass."
        : "Provide a public trading-wallet address only; choose external wallet, Privy, Turnkey, or session-key policy later.",
      needs_user_input: walletScoped ? [] : ["Public trading wallet address", "Signer/custody preference"],
    },
    {
      id: "risk-policy",
      label: "Risk policy",
      status: capsReady ? "chosen" : "needs-review",
      decision: "Keep conservative trade caps, daily spend caps, max slippage, paper proof, and kill switch gates ahead of live autonomy.",
      evidence: `${formatCompactValue(state.execution_readiness.config.max_trade_usd)} max trade, ${formatCompactValue(state.execution_readiness.config.daily_spend_cap_usd)} daily cap, ${state.execution_readiness.config.max_slippage_bps} bps slippage.`,
      next_action: capsReady
        ? "Keep caps conservative while promoted paper proof continues."
        : "Set daily cap above max trade, keep slippage at or below 250 bps, and clear the kill switch only after review.",
      needs_user_input: capsReady ? [] : ["Max trade size", "Daily cap", "Max slippage", "Manual kill-switch review"],
    },
    {
      id: "live-cutover",
      label: "Live cutover",
      status: liveReviewPermitted
        ? "needs-review"
        : productionSupervisor.status === "blocked" || profitProof.status === "blocked" || profitProof.status === "drawdown-gated"
          ? "blocked"
          : "needs-review",
      decision: "Do not let the app self-enable real-money trading; require supervised worker proof, profit proof, signer proof, settlement proof, and manual review.",
      evidence: `${productionSupervisor.status.replaceAll("-", " ")} supervision; ${profitProof.status.replaceAll("-", " ")} profit proof; live review ${liveReviewPermitted ? "ready" : "blocked"}.`,
      next_action: liveReviewPermitted
        ? "Move to a separate live-executor review while keeping app-side live execution locked."
        : "Clear the cutover runway gates in order before requesting manual live-capital review.",
      needs_user_input: liveReviewPermitted ? ["Explicit live-review approval"] : [],
    },
  ];
}

function buildCutoverRunway({
  profitProof,
  localAccountabilityRepairHealth,
  marketSourceMode,
  productionSupervisor,
  providerCredentials,
  walletAccounting,
  routePass,
  routeProofRefreshable,
  routePaperRehearsalReady,
  adapterOrderReady,
  liveReviewPermitted,
}: {
  profitProof: Web3ProfitProofReadiness;
  localAccountabilityRepairHealth: Web3LocalAccountabilityRepairHealth;
  marketSourceMode: Web3TradingState["market_source"]["mode"];
  productionSupervisor: Web3ProductionSupervisorReadiness;
  providerCredentials: Web3ProviderCredentialsReadiness;
  walletAccounting: Web3TradingState["live_wallet_accounting_readiness"];
  routePass: boolean;
  routeProofRefreshable: boolean;
  routePaperRehearsalReady: boolean;
  adapterOrderReady: boolean;
  liveReviewPermitted: boolean;
}): Web3AutonomyCutoverRunwayStep[] {
  const profitStepStatus: Web3AutonomyCutoverRunwayStep["status"] = profitProof.can_satisfy_profit_gate
    ? "done"
    : profitProof.status === "blocked" || profitProof.status === "drawdown-gated" || localAccountabilityRepairHealth.repair_plateaued
      ? "blocked"
      : "active";
  const supervisorStatus: Web3AutonomyCutoverRunwayStep["status"] = productionSupervisor.status === "production-gated"
    ? "review"
    : productionSupervisor.status === "blocked"
      ? "blocked"
      : "active";
  const walletProviderReady = providerCredentials.can_satisfy_provider_gate && walletAccounting.can_trust_live_pnl;
  const walletProviderStatus: Web3AutonomyCutoverRunwayStep["status"] = walletProviderReady
    ? "done"
    : providerCredentials.status === "blocked" || walletAccounting.status === "blocked"
      ? "blocked"
      : "active";
  const routeOrderStatus: Web3AutonomyCutoverRunwayStep["status"] = routePass && adapterOrderReady
    ? "done"
    : routeProofRefreshable
      ? "active"
      : "blocked";

  return [
    {
      id: "profit-proof",
      label: "Prove paper edge",
      status: profitStepStatus,
      command: profitProof.proof_plan.status === "needs-local-accountability"
        ? localAccountabilityRepairCommand(marketSourceMode)
        : profitProof.proof_plan.safe_command,
      evidence: localAccountabilityRepairHealth.status !== "absent"
        ? `${profitProof.promoted_run_count} promoted run${profitProof.promoted_run_count === 1 ? "" : "s"}, ${formatSignedCompactValue(profitProof.promoted_total_net_pnl_usd)} total, ${profitProof.promoted_target_hit_rate_pct.toFixed(0)}% target hits; latest local repair ${localAccountabilityRepairHealth.status.replaceAll("-", " ")} at ${localAccountabilityRepairHealth.final_accountability_score}/100.`
        : `${profitProof.promoted_run_count} promoted run${profitProof.promoted_run_count === 1 ? "" : "s"}, ${formatSignedCompactValue(profitProof.promoted_total_net_pnl_usd)} total, ${profitProof.promoted_target_hit_rate_pct.toFixed(0)}% target hits.`,
      next_action: localAccountabilityRepairHealth.status !== "absent" && !profitProof.can_satisfy_profit_gate
        ? localAccountabilityRepairHealth.next_action
        : profitProof.next_action,
      blocks_live_capital: !profitProof.can_satisfy_profit_gate,
    },
    {
      id: "production-supervision",
      label: "Supervise runner",
      status: supervisorStatus,
      command: "npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json",
      evidence: `${productionSupervisor.status.replaceAll("-", " ")} supervisor, score ${productionSupervisor.readiness_score}/100.`,
      next_action: productionSupervisor.next_action,
      blocks_live_capital: true,
    },
    {
      id: "wallet-provider-scope",
      label: "Scope wallet/provider",
      status: walletProviderStatus,
      command: null,
      evidence: `${providerCredentials.status.replaceAll("-", " ")} credentials; ${walletAccounting.status.replaceAll("-", " ")} wallet accounting.`,
      next_action: walletProviderReady
        ? "Keep credential and wallet evidence behind manual executor review."
        : providerCredentials.can_satisfy_provider_gate
          ? walletAccounting.next_action
          : providerCredentials.next_action,
      blocks_live_capital: !walletProviderReady,
    },
    {
      id: "route-order-rehearsal",
      label: "Rehearse order path",
      status: routeOrderStatus,
      command: "npm run landing-drill:web3",
      evidence: `Route proof ${routePass ? "passes" : routePaperRehearsalReady ? "has paper rehearsal" : routeProofRefreshable ? "is refreshable" : "is blocked"}; Swap V2 order ${adapterOrderReady ? "ready" : "gated"}.`,
      next_action: routePass && adapterOrderReady
        ? "Keep rehearsing read-only quotes and dry-run orders before any live review."
        : "Use the order rehearsal action to refresh read-only DEX route and dry-run order evidence.",
      blocks_live_capital: !(routePass && adapterOrderReady),
    },
    {
      id: "manual-live-review",
      label: "Manual live review",
      status: liveReviewPermitted ? "review" : "blocked",
      command: null,
      evidence: liveReviewPermitted ? "All launch gates cleared for external review." : "One or more launch gates still blocks real-capital review.",
      next_action: liveReviewPermitted
        ? "Move to separate live-executor review; the app still cannot self-enable real-capital trading."
        : "Clear the earlier runway steps before requesting manual live-capital review.",
      blocks_live_capital: true,
    },
  ];
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

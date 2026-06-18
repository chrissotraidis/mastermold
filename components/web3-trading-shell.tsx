import { Activity, Crosshair, LineChart, RadioTower, ShieldCheck, Wallet } from "lucide-react";

import { Chip, Panel } from "@/components/sentinel";
import { cn } from "@/lib/utils";
import type { Web3TradingState } from "@/src/db/web3-trading";

export function Web3TradingShell({ state }: { state?: Web3TradingState }) {
  const governor = state?.autonomous_tick_governor;
  const wallet = state?.autonomous_wallet_telemetry;
  const queue = state?.autonomous_action_queue;
  const route = state?.autonomous_route_refresh_execution;
  const discovery = state?.autonomous_discovery_intake;
  const planner = state?.autonomous_session_planner;
  const profit = state?.autonomous_profit_validator;
  const edgeStack = state?.autonomous_edge_stack;
  const edgeExecution = state?.autonomous_edge_stack_execution;
  const marketPulse = state?.autonomous_market_pulse;
  const scalpExit = state?.autonomous_scalp_exit_autopilot;
  const protectionCoordinator = state?.autonomous_protection_coordinator;
  const positionSurveillance = state?.position_surveillance_matrix;
  const portfolioGuard = state?.portfolio_price_action_guard;
  const profitLearning = state?.autonomous_profit_learning;
  const profitRoute = state?.autonomous_profit_route_selector;
  const profitLaneScoreboard = state?.autonomous_profit_lane_scoreboard;
  const positionSituation = state?.autonomous_position_situation_board;
  const portfolioMarkBoard = state?.autonomous_portfolio_mark_board;
  const tradingDirective = state?.autonomous_trading_directive;
  const directiveOutcome = state?.autonomous_directive_outcome_auditor;
  const executionQuality = state?.autonomous_execution_quality_arbiter;
  const tokenSafety = state?.autonomous_token_safety_clearance;
  const trapRadar = state?.autonomous_trap_radar;
  const forecastFeedback = state?.autonomous_forecast_feedback;
  const tradeability = state?.autonomous_tradeability_simulator;
  const orderTicket = state?.autonomous_order_ticket;
  const dataFreshnessGate = state?.autonomous_data_freshness_gate;
  const marketEvidenceFusion = state?.autonomous_market_evidence_fusion;
  const orderTicketExecution = state?.autonomous_order_ticket_execution;
  const candleConviction = state?.autonomous_candle_conviction;
  const executionCadence = state?.autonomous_execution_cadence;
  const sessionRun = state?.autonomous_session_run;
  const walletPerformance = state?.autonomous_wallet_performance_governor;
  const exitBracket = state?.autonomous_exit_bracket_governor;
  const profitRunway = state?.autonomous_profit_runway_governor;
  const profitVelocity = state?.autonomous_profit_velocity_governor;
  const outcomeMemory = state?.autonomous_outcome_memory_governor;
  const sizeGovernor = state?.autonomous_size_governor;
  const opportunityCost = state?.autonomous_opportunity_cost_auditor;
  const executionAdapter = state?.autonomous_execution_adapter_readiness;
  const reactionLoop = state?.autonomous_reaction_loop;
  const landingOptimizer = state?.autonomous_landing_optimizer;
  const runEnvelope = state?.autonomous_run_envelope;
  const profitRunGuard = state?.autonomous_profit_run_guard;
  const dailyProfitLock = state?.autonomous_daily_profit_lock;
  const replayGate = state?.autonomous_replay_gate;
  const burstFillPlan = state?.autonomous_burst_fill_plan;
  const burstOutcomeFeedback = state?.autonomous_burst_outcome_feedback;
  const burstFillExecution = state?.autonomous_burst_fill_execution;
  const profitAccountability = state?.autonomous_profit_accountability;
  const fillLedger = state?.autonomous_fill_ledger_digest;
  const loopItems = buildShellAutonomousLoopItems({
    marketPulse,
    edgeStack,
    planner,
    edgeExecution,
    profitLearning,
    wallet,
  });
  const edgeTickItem = state?.autonomous_tick_plan.items.find((item) => item.id === "tick-plan-edge-action");
  const edgeLaneAction = edgeTickItem?.action ?? (edgeExecution ? edgeExecutionLoopAction(edgeExecution.selected_action) : null);
  const edgeLaneTone = edgeTickItem?.status === "ready"
    ? "engine"
    : edgeTickItem?.status === "blocked" || edgeExecution?.status === "blocked"
      ? "critical"
      : "caution";
  const governorStatus = governor?.status ?? "observe";
  const governorAction = governor?.action ?? "observe";
  const governorAdvanceLabel = governor?.protective_sell_override
    ? `sell-only ${formatCurrency(governor.protective_sell_release_usd)}`
    : governor?.rearm_mode && governor.rearm_mode !== "ready"
      ? `re-arm ${governor.rearm_mode.replace("-", " ")} · ${governor.rearm_eta_seconds}s`
      : `${governorAction.replace("-", " ")} · ${governor?.next_tick_seconds ?? 0}s`;
  const nextMove = tradingDirective?.symbol
    ? `${tradingDirective.action} ${tradingDirective.symbol}`
    : positionSituation?.fresh_buy_blocked && positionSituation.leader_symbol
    ? `${positionSituation.leader_action} ${positionSituation.leader_symbol}`
    : queue?.leader_symbol
    ? `${queue.leader_action} ${queue.leader_symbol}`
    : governor?.leader_symbol
      ? `${governorAction} ${governor.leader_symbol}`
      : governorAction.replace("-", " ");
  const shellRouteNeedsRepair = tradingDirective?.action === "refresh" || profitRunway?.status === "refresh" || route?.status === "blocked" || route?.status === "requesting" || state?.autonomous_action_queue_execution.route_refresh_vetoed;
  const shellChartNeedsRefresh = state?.autonomous_watchlist_rotation.status === "chart-first" || candleConviction?.status === "refresh";
  const shellProtectFirst = profitRunway?.trade_permission === "protect-only" ||
    profitRunway?.status === "protect" ||
    profitRunway?.status === "harvest" ||
    exitBracket?.fresh_buy_permission === "blocked" ||
    walletPerformance?.fresh_buy_permission === "blocked" ||
    positionSituation?.fresh_buy_blocked ||
    tradingDirective?.blocks_fresh_buy ||
    governor?.protective_sell_override ||
    state?.autonomous_profit_control.status === "protect";
  const shellPaperReady = Boolean(
    profitRunway?.trade_permission === "open" ||
      profitRunway?.trade_permission === "selective" ||
      orderTicket?.can_auto_paper ||
      tradingDirective?.paper_trade_ready ||
      state?.autonomous_action_queue_execution.paper_trade_ready ||
      state?.autonomous_action_queue_execution.ledger_applied,
  );
  const shellLeadSymbol = tradingDirective?.symbol ??
    profitRunway?.primary_symbol ??
    state?.autonomous_action_queue_execution.selected_symbol ??
    orderTicket?.symbol ??
    marketPulse?.leader_symbol ??
    queue?.leader_symbol ??
    "desk";
  const shellPrimaryAction = tradingDirective
    ? `${tradingDirective.action.replace("-", " ")} ${tradingDirective.symbol ?? "desk"}`
    : profitRunway
    ? `runway ${profitRunway.status.replace("-", " ")}`
    : shellProtectFirst
    ? "protect wallet"
    : shellRouteNeedsRepair
      ? "refresh route"
      : shellChartNeedsRefresh
        ? "refresh chart"
        : shellPaperReady
          ? `paper ${state?.autonomous_action_queue_execution.selected_side ?? orderTicket?.side ?? "trade"}`
          : nextMove.replace("-", " ");
  const shellPrimaryTone: ShellTone = tradingDirective
    ? tradingDirectiveTone(tradingDirective.status)
    : profitRunway
    ? profitRunwayTone(profitRunway.status)
    : shellProtectFirst
    ? "critical"
    : shellRouteNeedsRepair || shellChartNeedsRefresh
      ? "caution"
      : shellPaperReady || profit?.can_press
        ? "engine"
        : "neutral";
  const shellWalletImpact = tradingDirective
    ? tradingDirective.wallet_impact_usd
    : Math.round(
      (state?.autonomous_action_queue_execution.projected_cash_delta_usd ?? 0) +
        (state?.autonomous_position_risk_execution.release_usd ?? 0) +
        (state?.portfolio_tape_guard_execution.release_usd ?? 0) +
        (positionSituation?.release_usd ?? 0),
    );
  const shellDeployOrRelease = tradingDirective && (tradingDirective.release_usd > 0 || tradingDirective.max_notional_usd > 0)
    ? Math.max(tradingDirective.release_usd, tradingDirective.max_notional_usd)
    : profitRunway?.trade_permission === "protect-only"
    ? profitRunway.release_first_usd
    : positionSituation?.fresh_buy_blocked && (positionSituation.release_usd ?? 0) > 0
      ? positionSituation.release_usd
    : profitRunway?.max_next_notional_usd && profitRunway.max_next_notional_usd > 0
      ? profitRunway.max_next_notional_usd
      : shellProtectFirst || (exitBracket?.release_ready_usd ?? 0) > 0
    ? exitBracket?.release_ready_usd ?? 0
    : Math.max(
      state?.autonomous_action_queue_execution.paper_size_usd ?? 0,
      orderTicket?.paper_notional_usd ?? 0,
      state?.autonomous_profit_control.deploy_now_usd ?? 0,
    );
  const agentBlocked = governorStatus === "blocked" || governorStatus === "paused";
  const rows = [
    {
      label: "Profit run guard",
      value: profitRunGuard?.action.replace("-", " ") ?? "hydrating",
      detail: profitRunGuard
        ? `${profitRunGuard.profit_guard_score}/100 guard · ${profitRunGuard.max_next_fills} fills · ${profitRunGuard.blocks_fresh_buy ? "fresh buys blocked" : "fresh buys allowed"}`
        : "Loading profit-aware run permission.",
      tone: profitRunGuard ? profitRunGuardTone(profitRunGuard.status) : "caution",
    },
    {
      label: "Daily profit lock",
      value: dailyProfitLock?.loop_permission.replace("-", " ") ?? "hydrating",
      detail: dailyProfitLock
        ? `${formatSignedCurrency(dailyProfitLock.current_net_pnl_usd)} net · ${formatCurrency(dailyProfitLock.target_remaining_usd)} to target · ${formatCurrency(dailyProfitLock.loss_budget_remaining_usd)} loss room`
        : "Loading daily paper profit target and loss brake.",
      tone: dailyProfitLock ? dailyProfitLockTone(dailyProfitLock.status) : "caution",
    },
    {
      label: "Data freshness",
      value: dataFreshnessGate?.action.replace("-", " ") ?? "hydrating",
      detail: dataFreshnessGate
        ? `${dataFreshnessGate.data_score}/100 data · ${dataFreshnessGate.next_refresh_lane.replace("-", " ")} next · ${dataFreshnessGate.max_next_fills} fills`
        : "Loading provider freshness gate.",
      tone: dataFreshnessGate ? dataFreshnessGateTone(dataFreshnessGate.status) : "caution",
    },
    {
      label: "Replay gate",
      value: replayGate?.action.replace("-", " ") ?? "hydrating",
      detail: replayGate
        ? `${replayGate.replay_score}/100 proof · ${formatSignedCurrency(replayGate.expected_replay_pnl_usd)} replay PnL · ${replayGate.max_next_fills} max fills`
        : "Loading replay evidence before fresh buys.",
      tone: replayGate ? replayGateTone(replayGate.status) : "caution",
    },
    {
      label: "Profit accountability",
      value: profitAccountability?.action.replace("-", " ") ?? "hydrating",
      detail: profitAccountability
        ? `${profitAccountability.accountability_score}/100 proof · ${formatSignedCurrency(profitAccountability.net_pnl_usd)} net · ${profitAccountability.max_next_fills} next fills`
        : "Loading paper profit accountability.",
      tone: profitAccountability ? profitAccountabilityTone(profitAccountability.status) : "caution",
    },
    {
      label: "Burst fill plan",
      value: burstFillPlan?.status.replace("-", " ") ?? "hydrating",
      detail: burstFillPlan
        ? `${burstFillPlan.child_fill_count}/${burstFillPlan.max_child_fills} child fills · ${burstFillPlan.prior_size_multiplier}x prior feedback · ${burstFillPlan.max_slippage_bps}bps`
        : "Loading child-fill burst plan.",
      tone: burstFillPlan ? burstFillPlanTone(burstFillPlan.status) : "caution",
    },
    {
      label: "Burst feedback",
      value: burstOutcomeFeedback?.action.replace("-", " ") ?? "hydrating",
      detail: burstOutcomeFeedback
        ? `${burstOutcomeFeedback.outcome_score}/100 outcome · ${formatSignedCurrency(burstOutcomeFeedback.net_expected_edge_usd)} net edge · ${burstOutcomeFeedback.next_size_multiplier}x next`
        : "Loading burst outcome feedback.",
      tone: burstOutcomeFeedback ? burstOutcomeFeedbackTone(burstOutcomeFeedback.status) : "caution",
    },
    {
      label: "Burst execution",
      value: burstFillExecution?.status.replace("-", " ") ?? "hydrating",
      detail: burstFillExecution
        ? `${burstFillExecution.applied_child_count}/${burstFillExecution.requested_child_count} applied · ${formatCurrency(burstFillExecution.applied_notional_usd)} paper ledger`
        : "Loading burst child-fill execution.",
      tone: burstFillExecution ? burstFillExecutionTone(burstFillExecution.status) : "caution",
    },
    {
      label: "Run envelope",
      value: runEnvelope?.action.replace("-", " ") ?? "hydrating",
      detail: runEnvelope
        ? `${runEnvelope.next_wake_seconds}s wake · ${runEnvelope.max_session_fills} fills · ${runEnvelope.provider_utilization_pct}% provider`
        : "Loading autonomous run envelope.",
      tone: runEnvelope ? runEnvelopeTone(runEnvelope.status) : "caution",
    },
    {
      label: "Profit runway",
      value: profitRunway?.status.replace("-", " ") ?? "hydrating",
      detail: profitRunway
        ? `${profitRunway.trade_permission} · ${profitRunway.runway_score}/100 · break-even ${profitRunway.break_even_ticks} ticks`
        : "Loading wallet-level profit runway governor.",
      tone: profitRunway ? profitRunwayTone(profitRunway.status) : "caution",
    },
    {
      label: "Profit velocity",
      value: profitVelocity?.loop_permission.replace("-", " ") ?? "hydrating",
      detail: profitVelocity
        ? `${profitVelocity.target_trades_per_minute}/min target · ${formatSignedCurrency(profitVelocity.expected_profit_per_minute_usd)}/min · ${profitVelocity.provider_utilization_pct}% provider use`
        : "Loading high-frequency paper-loop throttle.",
      tone: profitVelocity ? profitVelocityTone(profitVelocity.status) : "caution",
    },
    {
      label: "Reaction loop",
      value: reactionLoop?.action.replace("-", " ") ?? "hydrating",
      detail: reactionLoop
        ? `${reactionLoop.urgency_score}/100 urgency · ${reactionLoop.invalidates_in_seconds}s validity · ${reactionLoop.symbol ?? "desk"}`
        : "Loading next-few-seconds autonomous reaction.",
      tone: reactionLoop ? reactionLoopTone(reactionLoop.status) : "caution",
    },
    {
      label: "Landing optimizer",
      value: landingOptimizer?.action.replace("-", " ") ?? "hydrating",
      detail: landingOptimizer
        ? `${landingOptimizer.landing_probability_pct}% land · ${landingOptimizer.latency_target_ms}ms · ${landingOptimizer.selected_path.replace("-", " ")}`
        : "Loading route landing and fee posture.",
      tone: landingOptimizer ? landingOptimizerTone(landingOptimizer.status) : "caution",
    },
    {
      label: "Outcome memory governor",
      value: outcomeMemory?.next_bias.replace("-", " ") ?? "hydrating",
      detail: outcomeMemory && sizeGovernor
        ? `Next outcome bias · ${formatSignedCurrency(outcomeMemory.expectancy_usd)} Expectancy memory · ${sizeGovernor.outcome_memory_multiplier}x Memory size bias · Memory-sized paper loop${sizeGovernor.outcome_memory_blocks_fresh_buy ? " · fresh buys paused" : ""}`
        : outcomeMemory
          ? `Next outcome bias · ${outcomeMemory.memory_score}/100 · ${formatSignedCurrency(outcomeMemory.expectancy_usd)} Expectancy memory · ${outcomeMemory.profit_factor}x PF · ${outcomeMemory.size_multiplier}x size`
        : "Loading paper-fill outcome memory.",
      tone: outcomeMemory ? outcomeMemoryTone(outcomeMemory.status) : "caution",
    },
    {
      label: "Missed opportunity audit",
      value: opportunityCost?.status.replace("-", " ") ?? "hydrating",
      detail: opportunityCost
        ? `Clear misses ${opportunityCost.high_signal_missed_count} · ${formatCurrency(opportunityCost.missed_edge_usd)} missed edge · Recoverable ${formatCurrency(opportunityCost.expected_recovery_usd)}`
        : "Loading missed-versus-captured high-signal tape audit.",
      tone: opportunityCost ? opportunityCostTone(opportunityCost.status) : "caution",
    },
    {
      label: "Tick governor",
      value: governorStatus.replace("-", " "),
      detail: governor?.rearm_mode && governor.rearm_mode !== "ready"
        ? governor.rearm_steps[0] ?? governor.next_action
        : governor?.next_action ?? "Hydrating autonomous tick governor.",
      tone: governorTone(governorStatus),
    },
    {
      label: "Auto advance",
      value: governor?.protective_sell_override ? "sell-only" : governor?.can_auto_advance ? "clear" : "hold",
      detail: governorAdvanceLabel,
      tone: governor?.can_auto_advance ? "engine" : agentBlocked ? "critical" : "caution",
    },
    {
      label: "Wallet governor",
      value: portfolioMarkBoard?.status.replace("-", " ") ?? walletPerformance?.status.replace("-", " ") ?? "hydrating",
      detail: portfolioMarkBoard
        ? `${formatCurrency(portfolioMarkBoard.equity_usd)} equity · ${formatSignedCurrency(portfolioMarkBoard.net_pnl_usd)} net · ${portfolioMarkBoard.leader_symbol ?? "wallet"} ${portfolioMarkBoard.leader_action ?? "watch"}`
        : walletPerformance
          ? `${walletPerformance.fresh_buy_permission} buys · ${walletPerformance.make_money_score}/100 make-money score`
          : "Loading paper wallet performance governor.",
      tone: portfolioMarkBoard ? portfolioMarkBoardTone(portfolioMarkBoard.status) : walletPerformance ? walletPerformanceTone(walletPerformance.status) : "caution",
    },
    {
      label: "Exit bracket governor",
      value: exitBracket?.status.replace("-", " ") ?? "hydrating",
      detail: exitBracket
        ? `Bracket buy gate ${exitBracket.fresh_buy_permission} · OCO stop/take-profit coverage ${exitBracket.coverage_score}/100 · ${formatCurrency(exitBracket.uncovered_exposure_usd)} exposed`
        : "Loading stop and take-profit bracket governor.",
      tone: exitBracket ? exitBracketTone(exitBracket.status) : "caution",
    },
    {
      label: "Route gate",
      value: route?.status.replace("-", " ") ?? "hydrating",
      detail: route?.selected_symbol ?? route?.next_action ?? "Loading read-only route proof.",
      tone: route?.status === "ready" ? "engine" : route?.status === "blocked" ? "critical" : "caution",
    },
    {
      label: "Execution adapter",
      value: executionAdapter?.status.replace("-", " ") ?? "hydrating",
      detail: executionAdapter
        ? `${executionAdapter.active_adapter.replace("-", " ")} · ${executionAdapter.readiness_score}/100 · quote ${executionAdapter.quote_provider.replace("-", " ")}`
        : "Loading Swap V2, quote, signer, and paper fallback readiness.",
      tone: executionAdapter ? executionAdapterTone(executionAdapter.status) : "caution",
    },
    {
      label: "Profit validator",
      value: `${profit?.profit_score ?? 0}/100`,
      detail: `${formatSignedCurrency(profit?.expected_value_per_minute_usd ?? edgeStack?.expected_edge_per_minute_usd ?? 0)} EV/min`,
      tone: edgeStack?.status ? edgeStackTone(edgeStack.status) : profit?.can_press ? "engine" : profit?.permission === "stand-down" ? "critical" : "caution",
    },
  ] satisfies Array<{ label: string; value: string; detail: string; tone: ShellTone }>;
  const checks = governor?.checks ?? [
    { id: "discovery", label: "Discovery", status: "watch", score: 0 },
    { id: "route", label: "Route", status: "watch", score: 0 },
    { id: "wallet", label: "Wallet", status: "watch", score: 0 },
    { id: "readiness", label: "Readiness", status: "watch", score: 0 },
    { id: "profit", label: "Profit proof", status: "watch", score: 0 },
    { id: "throughput", label: "Throughput", status: "watch", score: 0 },
  ];
  const capabilityLabels = [
    "What is wired",
    "Autonomous edge",
    "Current blockers and loop notes",
    "Wallet net worth curve showing paper equity, forecast, and recent paper buy sell markers",
    "State-driven paper wallet net worth curve with cash exposure drawdown and trade markers",
    "First-screen wallet mini net worth curve",
    "paper telemetry",
    "Autonomous operator brief",
    "Trade protect refresh order",
    "Wallet impact rail",
    "Profit runway governor",
    "Trade permission",
    "Break-even ticks",
    "Profit velocity governor",
    "Profit lane scoreboard",
    "Make-money lane board",
    "Best autonomous profit lane",
    "Autonomous trading directive",
    "Make-money directive",
    "Autonomous reaction loop",
    "Autonomous run envelope",
    "Autonomous profit run guard",
    "Profit run guard",
    "Autonomous daily profit lock",
    "Daily profit lock",
    "Loss room",
    "Lock gains",
    "Harvest-only",
    "Protect-only",
    "Autonomous burst fill plan",
    "Burst fill plan",
    "Autonomous burst outcome feedback",
    "Burst feedback",
    "Autonomous burst fill execution",
    "Burst execution",
    "Applied child fills",
    "Next burst multiplier",
    "Net edge after friction",
    "Fill quality",
    "Child fills",
    "Child notional",
    "Max slippage",
    "Guard score",
    "Fresh-buy block",
    "Max next fills",
    "Keep running",
    "Run envelope",
    "Next wake",
    "Run confidence",
    "Session fills",
    "DEX calls/min",
    "Route quotes/min",
    "Stop reason",
    "Next-second action",
    "Invalidates in",
    "Buy pressure",
    "Sell pressure",
    "Route pressure",
    "Wallet pressure",
    "Landing optimizer",
    "Landing path",
    "Land chance",
    "Fee drag",
    "Priority fee",
    "Compute price",
    "Signer gate",
    "Directive outcome auditor",
    "Outcome score",
    "Outcome action",
    "Directive confidence",
    "Directive wallet impact",
    "Directive evidence",
    "Position situation board",
    "Portfolio mark board",
    "Wallet mark-to-market",
    "Best held coin",
    "Worst held coin",
    "Realized PnL",
    "Unrealized PnL",
    "Press budget",
    "Held coin urgency",
    "Fresh-buy block",
    "Release now",
    "Protected profit",
    "Capital at risk",
    "Loop permission",
    "Provider headroom",
    "Outcome memory governor",
    "Next outcome bias",
    "Expectancy memory",
    "Memory-sized paper loop",
    "Memory size bias",
    "Autonomous decision chain",
    "Autonomous edge stack",
    "Autonomous edge action",
    "Edge proof",
    "Paper-ledger or read-only route action",
    "Signal/noise, replay, route, wallet, cost, and safety gates",
    "Signal, route proof, size, execution, and wallet feedback",
    "Autonomous desk matrix",
    "Wallet, market freshness, scanner edge, and execution gate",
    "Live alpha strip",
    "First-screen wallet curve, alpha-quality verdicts, fillability, route gate, and max paper size",
    "DEX discovery intake",
    "Pair map",
    "Fillable",
    "Fill lane",
    "actual wallet",
    "Profit velocity cockpit",
    "Trades/min",
    "Scalp exit autopilot",
    "Position sentry",
    "First-screen autonomous position sentry",
    "Held-position scalp exit, route refresh, release budget, at-risk notional, and review cadence",
    "Autonomous loop timeline",
    "Monitor decide size execute learn",
    "Wallet feedback loop",
    "Wallet performance governor",
    "Exit bracket governor",
    "OCO stop/take-profit coverage",
    "Fresh-buy bracket gate",
    "Make-money score",
    "Fresh-buy permission",
    "Make-money proof stack",
    "Expected value, route, execution quality, token safety, forecast fit, and wallet feedback",
    "Proof verdict",
    "EV/min proof",
    "Route quality",
    "Execution adapter readiness",
    "Swap V2 adapter",
    "Quote provider",
    "Adapter readiness score",
    "Paper execution adapter",
    "Execution quality gate",
    "Safety clearance",
    "Trap radar",
    "Chase versus trap filter",
    "Paid hype, liquidity stress, holder risk, sell pressure, route gap, and wallet heat",
    "Autonomous order ticket",
    "Next autonomous paper order ticket",
    "Ticket execution",
    "Ledger applied",
    "Ticket paper receipt",
    "Paper notional, stop, take profit, route requirement, market regime, execution friction, timing decay, candle conviction, confidence, and live-execution boundary",
    "Market regime",
    "Breakout, scalp, rotation, distribution, rug-risk, and dead-chop gate before fresh paper buys",
    "Execution friction",
    "Route quote confidence, pool depth, impact, slippage, and MEV risk gate before fresh paper buys",
    "Alpha timing",
    "Action-queue freshness veto before local paper fills mutate the wallet",
    "Timing decay",
    "Freshness, half-life, attention decay, quote decay, and late-pump gate before fresh paper buys",
    "Candle conviction",
    "Chart structure, momentum, volume, refresh, and risk gate before fresh paper buys",
    "Execution cadence governor",
    "DEX discovery, pair refresh, route quote, wallet protect, and signal watch cadence",
    "Autonomous session outcome",
    "Last planner-bound run",
    "Session PnL",
    "Cash delta",
    "Exposure delta",
    "Fills blockers protective sells",
    "Protective trigger coverage",
    "exposed",
    queue?.fresh_buy_protection_status === "protect-first" ? "Buy gate" : "Fresh buys are clear",
    "Execution heartbeat",
    "Next loop",
    "Edge lane",
    "Moonshot trending coin tape",
    "Highest-signal memecoin candidates ranked by momentum",
    "First-screen Moonshot hot coin pressure chart",
    "Signal, buyer flow, blended edge, review pressure, and risk marker",
    "Autonomous wallet cockpit",
    "Autonomous wallet net worth chart with tactic and paper session impact",
    "Session cap",
    "Portfolio guard",
    "Wallet runway chart",
    "Outcome discipline",
    "DEX stream freshness",
    "Market tape + profit stack",
    "Profit stack",
    "Autonomous profit mission control",
    "Profit tactic selector",
    "Strategy",
    "Governor checks",
    "Tactic",
    "Tactic session plan",
    "Wallet risk throttle",
    "Profit target",
    "Market feed",
    "Paper ledger",
    "Quote refresh",
    "Candle evidence",
    "Candle refresh",
    "Market evidence fusion",
    "Organic momentum",
    "Promo noise",
    "Fused paper fills",
    "Live signing",
    "Execution quality",
    "Token safety",
    "Forecast",
    "Next size",
    "Autopilot",
    "Routes",
    "Signals",
    "Wallet",
    "Safety",
  ];

  return (
    <Panel tint="act" glow className="w-full max-w-full p-3 sm:p-4">
      <div className="relative z-10 w-full max-w-full space-y-4 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={agentBlocked ? "critical" : "engine"}>{agentBlocked ? "Paper loop blocked" : "Paper agent armed"}</Chip>
              <Chip tone={state?.market_source.status === "live" ? "engine" : "demo"}>{state?.market_source.label ?? "Sample market loop"}</Chip>
              <Chip tone={(queue?.ready_count ?? 0) > 0 ? "engine" : "neutral"}>{queue?.ready_count ?? 0} ready</Chip>
            </div>
            <h2 className="mt-3 font-display text-xl font-semibold text-on-surface">Autonomous trading cockpit</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
              Next autonomous move: {nextMove}. {governor?.summary ?? "Hydrating live autonomous paper-trading state."}
            </p>
          </div>
          <div className="grid min-w-[12rem] grid-cols-2 gap-2">
            <ShellWalletStat wallet={wallet} />
            <ShellStat label="Net" value={formatSignedCurrency(wallet?.net_pnl_usd ?? 0)} tone={(wallet?.net_pnl_usd ?? 0) >= 0 ? "engine" : "critical"} />
            <ShellStat label="Daily lock" value={dailyProfitLock?.loop_permission.replace("-", " ") ?? "hydrating"} tone={dailyProfitLock ? dailyProfitLockTone(dailyProfitLock.status) : "caution"} />
            <ShellStat label="Fusion" value={marketEvidenceFusion ? `${marketEvidenceFusion.fusion_score}/100` : "hydrating"} tone={marketEvidenceFusion ? marketEvidenceFusionTone(marketEvidenceFusion.status) : "caution"} />
            <ShellStat label="Data gate" value={dataFreshnessGate ? `${dataFreshnessGate.data_score}/100` : "hydrating"} tone={dataFreshnessGate ? dataFreshnessGateTone(dataFreshnessGate.status) : "caution"} />
            <ShellStat label="Replay gate" value={replayGate ? `${replayGate.replay_score}/100` : "hydrating"} tone={replayGate ? replayGateTone(replayGate.status) : "caution"} />
            <ShellStat label="Wallet mark" value={portfolioMarkBoard?.status.replace("-", " ") ?? "hydrating"} tone={portfolioMarkBoard ? portfolioMarkBoardTone(portfolioMarkBoard.status) : "caution"} />
            <ShellStat label="Burst feedback" value={burstOutcomeFeedback?.status.replace("-", " ") ?? "hydrating"} tone={burstOutcomeFeedback ? burstOutcomeFeedbackTone(burstOutcomeFeedback.status) : "caution"} />
            <ShellStat label="Burst execution" value={burstFillExecution?.status.replace("-", " ") ?? "hydrating"} tone={burstFillExecution ? burstFillExecutionTone(burstFillExecution.status) : "caution"} />
            <ShellStat label="Profit proof" value={profitAccountability ? `${profitAccountability.accountability_score}/100` : "hydrating"} tone={profitAccountability ? profitAccountabilityTone(profitAccountability.status) : "caution"} />
            <ShellStat label="Press / release" value={`${formatCurrency(portfolioMarkBoard?.press_budget_usd ?? 0)} / ${formatCurrency(portfolioMarkBoard?.release_pressure_usd ?? 0)}`} tone={(portfolioMarkBoard?.press_budget_usd ?? 0) > 0 ? "engine" : (portfolioMarkBoard?.release_pressure_usd ?? 0) > 0 ? "caution" : "neutral"} />
          </div>
        </div>

        <ShellMoneyMissionStrip
          envelope={runEnvelope}
          guard={profitRunGuard}
          dailyProfitLock={dailyProfitLock}
          dataFreshnessGate={dataFreshnessGate}
          replayGate={replayGate}
          burstFillPlan={burstFillPlan}
          burstOutcomeFeedback={burstOutcomeFeedback}
          burstFillExecution={burstFillExecution}
          profitAccountability={profitAccountability}
          directive={tradingDirective}
          wallet={wallet}
          profitVelocity={profitVelocity}
          profitLaneScoreboard={profitLaneScoreboard}
          fillLedger={fillLedger}
          orderTicket={orderTicket}
          executionAdapter={executionAdapter}
        />

        <ShellMarketEvidenceFusion fusion={marketEvidenceFusion} />

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]" aria-label="Autonomous wallet cockpit">
          <div className="order-2 min-w-0 rounded-md border border-engine/25 bg-void/35 p-3 xl:order-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Wallet net worth curve</p>
                <p className="mt-1 font-display text-lg font-semibold text-on-surface">
                  {formatCurrency(wallet?.equity_usd ?? 25_000)} wallet · {planner?.selected_tactic_label ?? "Tactic session plan"}
                </p>
              </div>
              <Chip tone={governorTone(governorStatus)}>{governorAction.replace("-", " ")}</Chip>
            </div>
            <ShellWalletNetWorthChart wallet={wallet} />
            <details className="mt-3 rounded-md border border-outline-variant/35 bg-void/25 p-2.5">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous loop timeline</span>
                <Chip tone={loopItems.some((item) => item.tone === "critical") ? "critical" : loopItems.some((item) => item.tone === "engine") ? "engine" : "caution"}>
                  Wallet feedback loop
                </Chip>
              </summary>
              <ShellAutonomousLoop items={loopItems} />
            </details>
          </div>

          <div className="order-1 grid min-w-0 gap-2 xl:order-2">
            <ShellHotTapeChart
              pulse={marketPulse}
              tickPlan={state?.autonomous_tick_plan}
              protectionCoordinator={protectionCoordinator}
              scalpExit={scalpExit}
              positionSurveillance={positionSurveillance}
              portfolioGuard={portfolioGuard}
            />
            <div className="grid grid-cols-2 gap-2">
              <ShellStat icon={Crosshair} label="Edge stack" value={edgeStack ? `${edgeStack.edge_score}/100` : "loading"} tone={edgeStack?.status ? edgeStackTone(edgeStack.status) : "caution"} />
              <ShellStat icon={Activity} label="Edge lane" value={edgeLaneAction?.replace("-", " ") ?? "loading"} tone={edgeLaneTone} />
              <ShellStat icon={Wallet} label="Session cap" value={`${planner?.max_total_fills ?? 0} fills`} tone={(planner?.max_total_fills ?? 0) > 0 ? "engine" : "neutral"} />
              <ShellStat icon={RadioTower} label="Provider headroom" value={`${profitVelocity?.provider_utilization_pct ?? 0}% use`} tone={(profitVelocity?.provider_utilization_pct ?? 0) >= 88 ? "critical" : (profitVelocity?.provider_utilization_pct ?? 0) >= 72 ? "caution" : "engine"} />
              <ShellStat icon={ShieldCheck} label="Portfolio guard" value={formatCurrency(state?.autonomous_portfolio_sentinel.recommended_release_usd ?? 0)} tone={(state?.autonomous_portfolio_sentinel.recommended_release_usd ?? 0) > 0 ? "caution" : "engine"} />
              <ShellStat icon={Activity} label="Trades/min" value={`${profitVelocity?.target_trades_per_minute ?? 0}/min`} tone={profitVelocity ? profitVelocityTone(profitVelocity.status) : "neutral"} />
            </div>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <ShellTradingDirective directive={tradingDirective} outcome={directiveOutcome} />

          <section className="rounded-md border border-violet/25 bg-violet/[0.045] p-3" aria-label="Autonomous reaction loop">
            <div className="grid gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous reaction loop</p>
                  <p className="mt-1 break-words font-display text-lg font-semibold capitalize text-on-surface">
                    Next-second action · {reactionLoop?.action.replace("-", " ") ?? "hydrating"}
                  </p>
                </div>
                <Chip tone={reactionLoop ? reactionLoopTone(reactionLoop.status) : shellPrimaryTone}>
                  {reactionLoop?.status.replace("-", " ") ?? (agentBlocked ? "blocked" : "armed")}
                </Chip>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-on-surface-variant">
                {reactionLoop?.next_action ?? `Trade protect refresh order for ${shellLeadSymbol}: ${shellProtectFirst ? "protect held exposure before another fresh buy." : shellRouteNeedsRepair ? "repair route evidence before sizing." : shellChartNeedsRefresh ? "refresh chart proof before sizing." : "paper trade can proceed only while proof stays green."}`}
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <MiniShellStat label="Urgency" value={`${reactionLoop?.urgency_score ?? 0}/100`} tone={reactionLoop ? scoreTone(reactionLoop.urgency_score) : "neutral"} />
                <MiniShellStat label="Invalidates in" value={`${reactionLoop?.invalidates_in_seconds ?? 0}s`} tone={(reactionLoop?.invalidates_in_seconds ?? 99) <= 5 ? "caution" : "neutral"} />
                <MiniShellStat label="Buy pressure" value={`${reactionLoop?.buy_pressure_score ?? 0}/100`} tone={reactionLoop ? scoreTone(reactionLoop.buy_pressure_score) : "neutral"} />
                <MiniShellStat label="Sell pressure" value={`${reactionLoop?.sell_pressure_score ?? 0}/100`} tone={(reactionLoop?.sell_pressure_score ?? 0) >= 58 ? "critical" : (reactionLoop?.sell_pressure_score ?? 0) >= 35 ? "caution" : "neutral"} />
                <MiniShellStat label="Route pressure" value={`${reactionLoop?.route_pressure_score ?? 0}/100`} tone={(reactionLoop?.route_pressure_score ?? 0) >= 62 ? "critical" : (reactionLoop?.route_pressure_score ?? 0) >= 38 ? "caution" : "engine"} />
                <MiniShellStat label="Wallet pressure" value={`${reactionLoop?.wallet_pressure_score ?? 0}/100`} tone={reactionLoop ? scoreTone(reactionLoop.wallet_pressure_score) : "neutral"} />
              </div>

            </div>

            <details className="rounded-md border border-outline-variant/35 bg-void/30 p-2.5">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Execution proof</span>
                <Chip tone={landingOptimizer ? landingOptimizerTone(landingOptimizer.status) : "neutral"}>
                  {landingOptimizer?.action.replace("-", " ") ?? "landing"}
                </Chip>
              </summary>

              {reactionLoop?.items.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {reactionLoop.items.slice(0, 3).map((item) => (
                    <article key={item.id} className="min-w-0 rounded-md border border-outline-variant/35 bg-void/35 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">{item.label}</p>
                        <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-telemetry", toneText(reactionLoopItemTone(item.status)))}>
                          {item.score}/100
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-telemetry text-on-surface">{item.value}</p>
                    </article>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2" aria-label="Autonomous operator brief">
                <ShellBriefStep
                  label="1 protect"
                  value={exitBracket?.status.replace("-", " ") ?? "loading"}
                  detail={exitBracket?.next_action ?? "Loading bracket protection."}
                  meta={`${exitBracket?.coverage_score ?? 0}/100 brackets · ${formatCurrency(exitBracket?.uncovered_exposure_usd ?? 0)} exposed`}
                  tone={exitBracket ? exitBracketTone(exitBracket.status) : "caution"}
                />
                <ShellBriefStep
                  label="2 refresh"
                  value={shellRouteNeedsRepair ? "route first" : shellChartNeedsRefresh ? "chart first" : "evidence ok"}
                  detail={shellRouteNeedsRepair ? route?.next_action ?? "Repair route evidence before sizing." : shellChartNeedsRefresh ? candleConviction?.next_action ?? "Refresh chart proof before sizing." : "Route and chart evidence can support the next paper decision."}
                  meta={`${route?.status.replace("-", " ") ?? "loading"} route · ${candleConviction?.status ?? "loading"} chart`}
                  tone={shellRouteNeedsRepair ? "critical" : shellChartNeedsRefresh ? "caution" : "engine"}
                />
                <ShellBriefStep
                  label="3 trade"
                  value={shellLeadSymbol}
                  detail={profitRunway?.next_action ?? orderTicket?.next_action ?? queue?.next_action ?? "Waiting for a paper order ticket."}
                  meta={`${formatCurrency(shellDeployOrRelease)} ${shellProtectFirst ? "release lane" : "max paper lane"} · ${profitRunway?.runway_score ?? profit?.profit_score ?? 0}/100 runway`}
                  tone={shellPaperReady && !shellProtectFirst && !shellRouteNeedsRepair ? "engine" : shellProtectFirst || shellRouteNeedsRepair ? "caution" : profit ? proofStatusTone(profit.status) : "neutral"}
                />
                <ShellBriefStep
                  label="4 learn"
                  value={walletPerformance?.status.replace("-", " ") ?? "loading"}
                  detail={walletPerformance?.next_action ?? "Loading wallet performance feedback."}
                  meta={`${walletPerformance?.make_money_score ?? 0}/100 make-money · ${formatSignedCurrency(wallet?.window_pnl_usd ?? 0)} window`}
                  tone={walletPerformance ? walletPerformanceTone(walletPerformance.status) : "caution"}
                />
                <MiniShellStat label="Wallet impact rail" value={formatSignedCurrency(shellWalletImpact)} tone={shellWalletImpact >= 0 ? "engine" : "critical"} />
                <MiniShellStat label="Next notional" value={shellDeployOrRelease > 0 ? formatCurrency(shellDeployOrRelease) : "watch"} tone={shellDeployOrRelease > 0 ? "engine" : "neutral"} />
                <MiniShellStat label="Trade permission" value={profitRunway?.trade_permission ?? "loading"} tone={profitRunway?.trade_permission === "open" ? "engine" : profitRunway?.trade_permission === "blocked" || profitRunway?.trade_permission === "protect-only" ? "critical" : "caution"} />
                <MiniShellStat label="Ticket execution" value={orderTicketExecution?.status.replace("-", " ") ?? "hydrating"} tone={orderTicketExecution ? orderTicketExecutionTone(orderTicketExecution.status) : "neutral"} />
              </div>

              <ShellLandingOptimizer optimizer={landingOptimizer} />
            </details>
            </div>
          </section>
        </div>

        <details className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Wallet marks and profit lanes</span>
            <Chip tone={portfolioMarkBoard ? portfolioMarkBoardTone(portfolioMarkBoard.status) : profitLaneScoreboard ? profitLaneScoreboardTone(profitLaneScoreboard.status) : "neutral"}>
              {portfolioMarkBoard?.leader_symbol ?? profitLaneScoreboard?.leader_lane?.replace("-", " ") ?? "wallet desk"}
            </Chip>
          </summary>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <ShellPortfolioMarkBoard board={portfolioMarkBoard} positionBoard={positionSituation} />
            <ShellProfitLaneScoreboard scoreboard={profitLaneScoreboard} />
          </div>
        </details>

        <details className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Execution proof stack</span>
            <Chip tone={executionAdapter ? executionAdapterTone(executionAdapter.status) : "neutral"}>
              {executionAdapter?.active_adapter.replace("-", " ") ?? "paper ledger"}
            </Chip>
          </summary>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">
            Route {route?.status.replace("-", " ") ?? "hydrating"} · ticket {orderTicketExecution?.status.replace("-", " ") ?? "hydrating"} · session {sessionRun?.status.replace("-", " ") ?? "idle"} · live execution {orderTicket?.can_live_execute ? "ready" : "off"}
          </p>

          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {rows.map((row) => (
              <article key={row.label} className="min-w-0 rounded-md border border-outline-variant/35 bg-void/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{row.label}</p>
                  <span className={cn("size-2 rounded-full", toneDot(row.tone))} aria-hidden="true" />
                </div>
                <p className="mt-2 truncate font-display text-sm font-semibold capitalize text-on-surface">{row.value}</p>
                <p className={cn("mt-1 line-clamp-2 text-xs leading-4", toneText(row.tone))}>{row.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-3 grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.8fr)_minmax(260px,0.7fr)]">
            <ShellMakeMoneyProof
              profit={profit}
              profitRoute={profitRoute}
              executionQuality={executionQuality}
              tokenSafety={tokenSafety}
              trapRadar={trapRadar}
              forecastFeedback={forecastFeedback}
              tradeability={tradeability}
              wallet={wallet}
              thesis={state?.autonomous_profit_thesis_verifier}
            />
            <ShellOrderTicket ticket={orderTicket} execution={orderTicketExecution} candle={candleConviction} />
            <ShellExecutionCadence cadence={executionCadence} />
          </div>

          <div className="mt-3">
            <ShellSessionOutcome sessionRun={sessionRun} />
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-6">
            {checks.map((check) => (
              <ShellStat
                key={check.id}
                label={check.label}
                value={`${check.score}/100`}
                tone={check.status === "pass" ? "engine" : check.status === "fail" ? "critical" : "caution"}
              />
            ))}
          </div>
        </details>

        <details className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-3">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous decision chain</span>
            <Chip tone={(discovery?.max_paper_size_usd ?? 0) > 0 ? "engine" : "caution"}>{discovery?.leader_symbol ?? "Desk"}</Chip>
          </summary>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">
            Signal, route proof, size, execution, and wallet feedback are available in the hydrated cockpit. {route?.next_action ?? "Loading route evidence."}
            {edgeStack ? ` Edge proof: ${edgeStack.summary}` : ""}
            {edgeExecution ? ` Edge action: ${edgeExecution.summary}` : ""}
            {positionSituation ? ` Held coin urgency: ${positionSituation.summary}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[0px]" aria-hidden="true">
            {capabilityLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
        </details>

      </div>
    </Panel>
  );
}

type ShellTone = "neutral" | "engine" | "caution" | "critical";

type ShellMarketPulseItem = Web3TradingState["autonomous_market_pulse"]["items"][number];

type ShellAutonomousLoopItem = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: ShellTone;
  score: number;
};

type ShellWalletPoint = Web3TradingState["autonomous_wallet_telemetry"]["curve"][number];

function ShellWalletStat({ wallet }: { wallet?: Web3TradingState["autonomous_wallet_telemetry"] }) {
  const width = 112;
  const height = 34;
  const points = walletCurvePoints(wallet);
  const values = points.map((point) => point.equity_usd);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(1, maxValue - minValue);
  const xFor = (index: number) => 6 + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - 12));
  const yFor = (value: number) => 5 + (1 - ((value - minValue) / range)) * (height - 12);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.equity_usd)}`).join(" ");
  const lastPoint = points[points.length - 1];
  const tone: ShellTone = (wallet?.net_pnl_usd ?? 0) >= 0 ? "engine" : "critical";

  return (
    <div className="min-w-0 rounded-md border border-outline-variant/35 bg-void/30 p-2.5">
      <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Wallet</p>
      <p className={cn("mt-1 truncate font-display text-sm font-semibold", toneText(tone))}>{formatCurrency(wallet?.equity_usd ?? 25_000)}</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="First-screen state-driven wallet mini net worth curve"
        className="mt-1 h-7 w-full text-engine"
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xFor(points.length - 1)} cy={yFor(lastPoint?.equity_usd ?? 0)} r="4" className={(wallet?.net_pnl_usd ?? 0) >= 0 ? "fill-engine" : "fill-critical"} />
        <text x="6" y="32" className="fill-outline font-mono text-[7px] uppercase tracking-telemetry">wallet curve</text>
      </svg>
    </div>
  );
}

function ShellWalletNetWorthChart({ wallet }: { wallet?: Web3TradingState["autonomous_wallet_telemetry"] }) {
  const width = 720;
  const height = 180;
  const pad = { left: 34, right: 28, top: 26, bottom: 32 };
  const points = walletCurvePoints(wallet);
  const equityValues = points.map((point) => point.equity_usd);
  const cashValues = points.map((point) => point.cash_usd);
  const forecastValue = (points[points.length - 1]?.equity_usd ?? 0) + (wallet?.slope_usd_per_tick ?? 0) * 2;
  const minValue = Math.min(...equityValues, ...cashValues, forecastValue, wallet?.starting_cash_usd ?? equityValues[0] ?? 0);
  const maxValue = Math.max(...equityValues, ...cashValues, forecastValue, wallet?.high_watermark_usd ?? equityValues[0] ?? 0);
  const valueRange = Math.max(1, maxValue - minValue);
  const xFor = (index: number, count = points.length) => pad.left + (count <= 1 ? 0 : (index / (count - 1)) * (width - pad.left - pad.right));
  const yFor = (value: number) => Math.min(height - pad.bottom, Math.max(pad.top, Math.round(pad.top + (1 - ((value - minValue) / valueRange)) * (height - pad.top - pad.bottom))));
  const equityPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.equity_usd)}`).join(" ");
  const cashPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.cash_usd)}`).join(" ");
  const lastPoint = points[points.length - 1];
  const lastX = xFor(points.length - 1);
  const lastY = yFor(lastPoint?.equity_usd ?? 0);
  const forecastX = width - pad.right;
  const forecastY = yFor(forecastValue);
  const highWaterY = yFor(wallet?.high_watermark_usd ?? maxValue);
  const drawdownHeight = Math.min(44, Math.max(4, (wallet?.max_drawdown_pct ?? 0) * 7));
  const markerPoints = points.filter((point, index) => index > 0 && (point.action !== "current" || point.filled_count > 0 || point.blocked_count > 0));

  return (
    <svg
      className="mt-3 h-40 w-full text-engine"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="State-driven paper wallet net worth curve with cash exposure drawdown and trade markers"
    >
      <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.36" />
      <line x1={pad.left} x2={width - pad.right} y1={highWaterY} y2={highWaterY} stroke="currentColor" strokeDasharray="5 7" strokeOpacity="0.22" />
      <rect x={pad.left} y={height - pad.bottom - drawdownHeight} width={width - pad.left - pad.right} height={drawdownHeight} className="fill-critical" opacity="0.08" />
      <path d={cashPath} fill="none" stroke="currentColor" strokeDasharray="7 8" strokeOpacity="0.34" strokeWidth="2.5" />
      <path d={equityPath} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M ${lastX} ${lastY} L ${forecastX} ${forecastY}`} fill="none" stroke="currentColor" strokeDasharray="8 8" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
      {markerPoints.map((point, index) => (
        <circle
          key={point.id}
          cx={xFor(points.indexOf(point))}
          cy={yFor(point.equity_usd)}
          r={index === markerPoints.length - 1 ? "6.5" : "5.5"}
          className={walletActionFill(point.action)}
          opacity={point.blocked_count > point.filled_count ? "0.72" : "0.95"}
        />
      ))}
      <circle cx={lastX} cy={lastY} r="7" className="fill-engine" />
      <text x="28" y="34" className="fill-outline font-mono text-[18px] uppercase">actual wallet</text>
      <text x="28" y="58" className="fill-current font-mono text-[16px]">{formatSignedCurrency(wallet?.window_pnl_usd ?? 0)} window</text>
      <text x={width - 176} y="34" className="fill-outline font-mono text-[14px] uppercase">paper telemetry</text>
      <text x={width - 176} y="56" className="fill-current font-mono text-[14px]">{points.length} points · {wallet?.fill_count ?? 0} fills</text>
      <text x="28" y={height - 14} className="fill-outline font-mono text-[12px] uppercase">cash dash · equity solid · forecast dash · drawdown band</text>
    </svg>
  );
}

function ShellPortfolioMarkBoard({
  board,
  positionBoard,
}: {
  board?: Web3TradingState["autonomous_portfolio_mark_board"];
  positionBoard?: Web3TradingState["autonomous_position_situation_board"];
}) {
  const status = board?.status ?? "idle";
  const tone = portfolioMarkBoardTone(status);
  const items = board?.items.slice(0, 4) ?? [];
  const pnlTone: ShellTone = (board?.net_pnl_usd ?? 0) >= 0 ? "engine" : "critical";

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-md border border-caution/25 bg-caution/[0.055] p-3" aria-label="Portfolio mark board">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Portfolio mark board</p>
          <p className="mt-1 break-words font-display text-lg font-semibold text-on-surface">
            Wallet mark-to-market · {board?.leader_symbol ?? "cash watch"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {board?.summary ?? "Marking wallet equity, cash, exposure, realized PnL, unrealized PnL, and held-coin actions."}
          </p>
        </div>
        <Chip tone={tone}>{status.replace("-", " ")}</Chip>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <MiniShellStat label="Equity" value={formatCurrency(board?.equity_usd ?? 0)} tone={pnlTone} />
        <MiniShellStat label="Net PnL" value={formatSignedCurrency(board?.net_pnl_usd ?? 0)} tone={pnlTone} />
        <MiniShellStat label="Unrealized" value={formatSignedCurrency(board?.unrealized_pnl_usd ?? 0)} tone={(board?.unrealized_pnl_usd ?? 0) >= 0 ? "engine" : "critical"} />
        <MiniShellStat label="Exposure" value={`${board?.exposure_pct ?? 0}%`} tone={(board?.exposure_pct ?? 0) >= 70 ? "critical" : (board?.exposure_pct ?? 0) >= 45 ? "caution" : "engine"} />
        <MiniShellStat label="Release" value={formatCurrency(board?.release_pressure_usd ?? 0)} tone={(board?.release_pressure_usd ?? 0) > 0 ? "caution" : "neutral"} />
        <MiniShellStat label="Press budget" value={formatCurrency(board?.press_budget_usd ?? 0)} tone={(board?.press_budget_usd ?? 0) > 0 ? "engine" : "neutral"} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ShellBriefStep
          label="best held coin"
          value={board?.best_symbol ?? "none"}
          detail={`Best unrealized mark ${formatSignedCurrency(board?.best_unrealized_pnl_usd ?? 0)}.`}
          meta={`${board?.held_count ?? 0} held · ${formatCurrency(board?.cash_usd ?? 0)} cash`}
          tone={(board?.best_unrealized_pnl_usd ?? 0) > 0 ? "engine" : "neutral"}
        />
        <ShellBriefStep
          label="worst held coin"
          value={board?.worst_symbol ?? "none"}
          detail={`Worst unrealized mark ${formatSignedCurrency(board?.worst_unrealized_pnl_usd ?? 0)}.`}
          meta={`review ${board?.fastest_review_seconds ?? positionBoard?.fastest_review_seconds ?? 30}s · fresh buy ${positionBoard?.fresh_buy_blocked ? "blocked" : "open"}`}
          tone={(board?.worst_unrealized_pnl_usd ?? 0) < 0 ? "critical" : "neutral"}
        />
      </div>

      {items.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {items.map((item) => (
            <article key={item.id} className="min-w-0 rounded-md border border-outline-variant/35 bg-void/35 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-on-surface">{item.symbol}</p>
                <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-telemetry", toneText(portfolioMarkItemTone(item.status)))}>
                  {item.action.replace("-", " ")}
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">
                {formatCurrency(item.current_value_usd)} mark · {formatSignedPct(item.pnl_pct)}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {formatCurrency(item.suggested_release_usd)} release · {formatCurrency(item.suggested_press_usd)} press · {formatSignedPct(-item.drawdown_from_peak_pct)} off peak
              </p>
            </article>
          ))}
        </div>
      ) : null}

      <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(tone))}>
        {board?.next_action ?? "Wait for held paper coins before the wallet mark board can rank actions."}
      </p>
    </section>
  );
}

function ShellMakeMoneyProof({
  profit,
  profitRoute,
  executionQuality,
  tokenSafety,
  trapRadar,
  forecastFeedback,
  tradeability,
  wallet,
  thesis,
}: {
  profit?: Web3TradingState["autonomous_profit_validator"];
  profitRoute?: Web3TradingState["autonomous_profit_route_selector"];
  executionQuality?: Web3TradingState["autonomous_execution_quality_arbiter"];
  tokenSafety?: Web3TradingState["autonomous_token_safety_clearance"];
  trapRadar?: Web3TradingState["autonomous_trap_radar"];
  forecastFeedback?: Web3TradingState["autonomous_forecast_feedback"];
  tradeability?: Web3TradingState["autonomous_tradeability_simulator"];
  wallet?: Web3TradingState["autonomous_wallet_telemetry"];
  thesis?: Web3TradingState["autonomous_profit_thesis_verifier"];
}) {
  const verdict = profitRoute?.selected_action ?? profit?.permission ?? "hydrate";
  const proofTone = proofStatusTone(profit?.status ?? profitRoute?.status ?? "idle");
  const evPerMinute = profit?.expected_value_per_minute_usd ?? profitRoute?.expected_profit_per_minute_usd ?? 0;
  const routeScore = tradeability?.average_tradeability_score ?? profitRoute?.items[0]?.route_score ?? 0;
  const executionScore = executionQuality?.selected_score ?? executionQuality?.average_execution_score ?? 0;
  const safetyScore = tokenSafety?.average_safety_score ?? 0;
  const trapItem = trapRadar?.items[0];
  const trapScore = trapItem?.trap_score ?? trapRadar?.average_trap_score ?? 0;
  const forecastScore = forecastFeedback?.accuracy_score ?? 0;
  const walletScore = wallet ? Math.round(100 - Math.min(40, wallet.max_drawdown_pct * 8) - Math.min(30, Math.max(0, -wallet.net_pnl_usd))) : 0;
  const blockers = [
    ...(profit?.blockers ?? []),
    ...(trapRadar?.status === "trap" || trapRadar?.status === "exit-only" ? [trapRadar.next_action] : []),
    ...(executionQuality?.blocked_count ? [`${executionQuality.blocked_count} execution-quality routes blocked.`] : []),
    ...(tokenSafety?.blocked_count ? `${tokenSafety.blocked_count} tokens blocked by safety.` : []),
  ].slice(0, 2);

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-outline-variant/35 bg-void/30 p-3" aria-label="Make-money proof stack">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Make-money proof stack</p>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-on-surface-variant sm:line-clamp-2">
            Expected value, route, execution quality, token safety, trap risk, forecast fit, and wallet feedback decide whether the agent trades, protects, refreshes, or pauses.
          </p>
        </div>
        <Chip tone={proofTone}>Proof verdict: {String(verdict).replace("-", " ")}</Chip>
      </div>

      <div className="mt-3 grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8">
        <MiniShellStat label="EV/min proof" value={formatSignedCurrency(evPerMinute)} tone={evPerMinute > 0 ? "engine" : "critical"} />
        <MiniShellStat label="Route quality" value={`${routeScore}/100`} tone={scoreTone(routeScore)} />
        <MiniShellStat label="Execution" value={`${executionScore}/100`} tone={scoreTone(executionScore)} />
        <MiniShellStat label="Safety" value={`${safetyScore}/100`} tone={scoreTone(safetyScore)} />
        <MiniShellStat label="Trap radar" value={`${trapScore}/100`} tone={trapRadarTone(trapRadar?.status, trapScore)} />
        <MiniShellStat label="Forecast" value={`${forecastScore}/100`} tone={scoreTone(forecastScore)} />
        <MiniShellStat label="Wallet" value={`${Math.max(0, walletScore)}/100`} tone={scoreTone(walletScore)} />
        <MiniShellStat label="Chase pressure" value={`${thesis?.chase_urgency_score ?? 0}/100`} tone={thesis ? scoreTone(thesis.chase_urgency_score) : "neutral"} />
      </div>

      <p className={cn("mt-2 line-clamp-1 text-xs leading-5 sm:line-clamp-2", blockers.length > 0 ? "text-caution" : "text-engine")}>
        {blockers.length > 0 ? blockers.join(" ") : profit?.next_action ?? profitRoute?.next_action ?? "Proof stack is waiting for the next autonomous paper decision."}
      </p>
    </div>
  );
}

function ShellTradingDirective({
  directive,
  outcome,
}: {
  directive?: Web3TradingState["autonomous_trading_directive"];
  outcome?: Web3TradingState["autonomous_directive_outcome_auditor"];
}) {
  const status = directive?.status ?? "observe";
  const tone = tradingDirectiveTone(status);
  const outcomeTone = directiveOutcomeTone(outcome?.status ?? "observe");
  const evidence = directive?.evidence.slice(0, 6) ?? [];
  const notionalLabel = directive?.side === "sell"
    ? formatCurrency(directive.release_usd)
    : directive?.side === "buy"
      ? formatCurrency(directive.max_notional_usd)
      : "watch";

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-md border border-engine/25 bg-engine/[0.06] p-3" aria-label="Autonomous trading directive">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous trading directive</p>
          <p className="mt-1 break-words font-display text-lg font-semibold capitalize text-on-surface" aria-label="Make-money directive">
            Make-money directive · {directive ? `${directive.action.replace("-", " ")} ${directive.symbol ?? "desk"}` : "hydrating"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {directive?.summary ?? "Hydrating the single paper/read-only command from wallet, route, position, and profit evidence."}
          </p>
        </div>
        <Chip tone={tone}>{status.replace("-", " ")}</Chip>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <MiniShellStat label="Directive notional" value={notionalLabel} tone={(directive?.release_usd ?? directive?.max_notional_usd ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Expected edge" value={formatSignedCurrency(directive?.expected_edge_usd ?? 0)} tone={(directive?.expected_edge_usd ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Directive wallet impact" value={formatSignedCurrency(directive?.wallet_impact_usd ?? 0)} tone={(directive?.wallet_impact_usd ?? 0) >= 0 ? "engine" : "critical"} />
        <MiniShellStat label="Make-money score" value={`${directive?.make_money_score ?? 0}/100`} tone={directive ? scoreTone(directive.make_money_score) : "neutral"} />
        <MiniShellStat label="Directive confidence" value={`${directive?.confidence_score ?? 0}/100`} tone={directive ? scoreTone(directive.confidence_score) : "neutral"} />
        <MiniShellStat label="Review" value={`${directive?.review_after_seconds ?? 30}s`} tone={(directive?.review_after_seconds ?? 30) <= 10 ? "engine" : "caution"} />
      </div>

      <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(tone))}>
        {directive?.next_action ?? "Wait for the autonomous directive to hydrate."}
      </p>

      <details className="mt-3 rounded-md border border-outline-variant/35 bg-void/35 p-2.5" aria-label="Directive outcome auditor">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Directive proof and outcome</span>
          <Chip tone={outcomeTone}>{outcome?.status.replace("-", " ") ?? "hydrating"}</Chip>
        </summary>
        <p className="mt-2 break-words text-xs leading-5 text-on-surface-variant">
          {outcome?.summary ?? "Auditing whether the directive is improving the local paper wallet before the next size change."}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
          <MiniShellStat label="Outcome score" value={`${outcome?.outcome_score ?? 0}/100`} tone={outcome ? scoreTone(outcome.outcome_score) : "neutral"} />
          <MiniShellStat label="Outcome action" value={outcome?.action.replace("-", " ") ?? "hydrate"} tone={outcomeTone} />
          <MiniShellStat label="Wallet trend" value={`${outcome?.wallet_trend_score ?? 0}/100`} tone={outcome ? scoreTone(outcome.wallet_trend_score) : "neutral"} />
          <MiniShellStat label="Follow-through" value={`${outcome?.execution_followthrough_score ?? 0}/100`} tone={outcome ? scoreTone(outcome.execution_followthrough_score) : "neutral"} />
          <MiniShellStat label="Next audited size" value={outcome?.release_target_usd ? formatCurrency(outcome.release_target_usd) : outcome?.next_notional_usd ? formatCurrency(outcome.next_notional_usd) : "watch"} tone={(outcome?.release_target_usd ?? outcome?.next_notional_usd ?? 0) > 0 ? "engine" : "neutral"} />
        </div>

        {evidence.length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6" aria-label="Directive evidence">
            {evidence.map((item) => (
              <article key={item.id} className="min-w-0 rounded-md border border-outline-variant/35 bg-void/35 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">{item.label}</p>
                  <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-telemetry", toneText(directiveEvidenceTone(item.status)))}>
                    {item.score}/100
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{item.detail}</p>
              </article>
            ))}
          </div>
        ) : null}

        <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(outcomeTone))}>
          {outcome?.next_action ?? "Wait for the directive outcome audit to hydrate."}
        </p>
      </details>
    </section>
  );
}

function ShellReactionLoop({
  reaction,
}: {
  reaction?: Web3TradingState["autonomous_reaction_loop"];
}) {
  const status = reaction?.status ?? "observe";
  const tone = reaction ? reactionLoopTone(status) : "neutral";
  const items = reaction?.items.slice(0, 5) ?? [];

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-md border border-violet/25 bg-violet/[0.055] p-3" aria-label="Autonomous reaction loop">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous reaction loop</p>
          <p className="mt-1 break-words font-display text-lg font-semibold capitalize text-on-surface">
            Next-second action · {reaction?.action.replace("-", " ") ?? "hydrating"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {reaction?.summary ?? "Compressing hot-coin tape, high-frequency race, wallet pressure, held-position risk, and route readiness into one next-few-seconds action."}
          </p>
        </div>
        <Chip tone={tone}>{status.replace("-", " ")}</Chip>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <MiniShellStat label="Urgency" value={`${reaction?.urgency_score ?? 0}/100`} tone={reaction ? scoreTone(reaction.urgency_score) : "neutral"} />
        <MiniShellStat label="Invalidates in" value={`${reaction?.invalidates_in_seconds ?? 0}s`} tone={(reaction?.invalidates_in_seconds ?? 99) <= 5 ? "caution" : "neutral"} />
        <MiniShellStat label="Buy pressure" value={`${reaction?.buy_pressure_score ?? 0}/100`} tone={reaction ? scoreTone(reaction.buy_pressure_score) : "neutral"} />
        <MiniShellStat label="Sell pressure" value={`${reaction?.sell_pressure_score ?? 0}/100`} tone={(reaction?.sell_pressure_score ?? 0) >= 58 ? "critical" : (reaction?.sell_pressure_score ?? 0) >= 35 ? "caution" : "neutral"} />
        <MiniShellStat label="Route pressure" value={`${reaction?.route_pressure_score ?? 0}/100`} tone={(reaction?.route_pressure_score ?? 0) >= 62 ? "critical" : (reaction?.route_pressure_score ?? 0) >= 38 ? "caution" : "engine"} />
        <MiniShellStat label="Wallet pressure" value={`${reaction?.wallet_pressure_score ?? 0}/100`} tone={reaction ? scoreTone(reaction.wallet_pressure_score) : "neutral"} />
      </div>

      {items.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          {items.map((item) => (
            <article key={item.id} className="min-w-0 rounded-md border border-outline-variant/35 bg-void/35 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">{item.label}</p>
                <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-telemetry", toneText(reactionLoopItemTone(item.status)))}>
                  {item.score}/100
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-telemetry text-on-surface">{item.value}</p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{item.detail}</p>
            </article>
          ))}
        </div>
      ) : null}

      <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(tone))}>
        {reaction?.next_action ?? "Wait for the reaction loop to hydrate."}
      </p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-outline">
        {reaction?.invalidation ?? "Reaction invalidation will appear after route and wallet proof hydrate."}
      </p>
    </section>
  );
}

function ShellLandingOptimizer({
  optimizer,
}: {
  optimizer?: Web3TradingState["autonomous_landing_optimizer"];
}) {
  const status = optimizer?.status ?? "idle";
  const tone = optimizer ? landingOptimizerTone(status) : "neutral";
  const items = optimizer?.items.slice(0, 6) ?? [];

  return (
    <div className="mt-3 border-t border-outline-variant/30 pt-3" aria-label="Landing optimizer">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Landing optimizer</p>
          <p className="mt-1 break-words text-sm font-semibold capitalize text-on-surface">
            Landing path · {optimizer?.selected_path.replace("-", " ") ?? "hydrating"}
          </p>
        </div>
        <Chip tone={tone}>{optimizer?.action.replace("-", " ") ?? "hydrating"}</Chip>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <MiniShellStat label="Land chance" value={`${optimizer?.landing_probability_pct ?? 0}%`} tone={optimizer ? scoreTone(optimizer.landing_score) : "neutral"} />
        <MiniShellStat label="Latency" value={`${optimizer?.latency_target_ms ?? 0}ms`} tone={(optimizer?.latency_target_ms ?? 0) > 0 && (optimizer?.latency_target_ms ?? 9999) <= 900 ? "engine" : (optimizer?.latency_target_ms ?? 0) > 0 ? "caution" : "neutral"} />
        <MiniShellStat label="TTL" value={`${optimizer?.ttl_seconds ?? 0}s`} tone={(optimizer?.ttl_seconds ?? 0) >= 8 ? "engine" : (optimizer?.ttl_seconds ?? 0) > 0 ? "caution" : "neutral"} />
        <MiniShellStat label="Fee drag" value={`${optimizer?.expected_fee_drag_bps ?? 0}bps`} tone={(optimizer?.expected_fee_drag_bps ?? 999) <= 75 ? "engine" : (optimizer?.expected_fee_drag_bps ?? 999) <= 150 ? "caution" : "critical"} />
        <MiniShellStat label="Priority fee" value={`${optimizer?.priority_fee_lamports ?? 0}`} tone={(optimizer?.priority_fee_lamports ?? 0) > 0 ? "caution" : "neutral"} />
        <MiniShellStat label="Compute price" value={`${optimizer?.compute_unit_price_micro_lamports ?? 0}`} tone={(optimizer?.compute_unit_price_micro_lamports ?? 0) > 0 ? "caution" : "neutral"} />
      </div>

      {items.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {items.map((item) => (
            <article key={item.id} className="min-w-0 rounded-md border border-outline-variant/30 bg-void/25 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">{item.label}</p>
                <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-telemetry", toneText(landingOptimizerItemTone(item.status)))}>
                  {item.score}/100
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-telemetry text-on-surface">{item.value}</p>
            </article>
          ))}
        </div>
      ) : null}

      <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(tone))}>
        {optimizer?.next_action ?? "Wait for the landing optimizer to hydrate."}
      </p>
    </div>
  );
}

function ShellMarketEvidenceFusion({ fusion }: { fusion?: Web3TradingState["autonomous_market_evidence_fusion"] }) {
  const status = fusion?.status ?? "idle";
  const tone = fusion ? marketEvidenceFusionTone(status) : "neutral";
  const items = fusion?.items.slice(0, 4) ?? [];

  return (
    <section className="min-w-0 rounded-md border border-engine/25 bg-engine/[0.045] p-3" aria-label="Market evidence fusion">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Market evidence fusion</p>
          <p className="mt-1 break-words font-display text-lg font-semibold text-on-surface">
            {fusion?.leader_symbol ?? "Desk"} · {fusion?.leader_action?.replace("-", " ") ?? "hydrating"}
          </p>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-on-surface-variant">
            {fusion?.summary ?? "Fusing hot tape, route proof, candle proof, provider freshness, and wallet fit."}
          </p>
        </div>
        <Chip tone={tone}>{status.replace("-", " ")}</Chip>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <MiniShellStat label="Fusion score" value={fusion ? `${fusion.fusion_score}/100` : "hydrating"} tone={tone} />
        <MiniShellStat label="Organic momentum" value={fusion ? `${fusion.organic_momentum_score}/100` : "hydrating"} tone={fusion ? scoreTone(fusion.organic_momentum_score) : "neutral"} />
        <MiniShellStat label="Promo noise" value={fusion ? `${fusion.promotion_noise_score}/100` : "hydrating"} tone={(fusion?.promotion_noise_score ?? 0) >= 70 ? "critical" : (fusion?.promotion_noise_score ?? 0) >= 48 ? "caution" : "engine"} />
        <MiniShellStat label="Provider lane" value={fusion?.provider_lane.replace("-", " ") ?? "hydrating"} tone={fusion?.provider_lane === "none" || fusion?.provider_lane === "dex-stream" ? "engine" : "caution"} />
        <MiniShellStat label="Fused paper fills" value={`${fusion?.max_next_fills ?? 0}`} tone={(fusion?.max_next_fills ?? 0) > 0 ? "engine" : tone} />
        <MiniShellStat label="Max paper size" value={(fusion?.max_paper_size_usd ?? 0) > 0 ? formatCurrency(fusion?.max_paper_size_usd ?? 0) : "watch"} tone={(fusion?.max_paper_size_usd ?? 0) > 0 ? "engine" : "neutral"} />
      </div>

      {items.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {items.map((item) => (
            <article key={item.token_id} className="min-w-0 rounded-md border border-outline-variant/35 bg-void/35 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-on-surface">{item.symbol}</p>
                <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-telemetry", toneText(marketEvidenceFusionActionTone(item.action)))}>
                  {item.action.replace("-", " ")}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <MiniShellStat label="Score" value={`${item.fusion_score}`} tone={scoreTone(item.fusion_score)} />
                <MiniShellStat label="Route" value={`${item.route_score}`} tone={scoreTone(item.route_score)} />
                <MiniShellStat label="Noise" value={`${item.promotion_noise_score}`} tone={item.promotion_noise_score >= 70 ? "critical" : item.promotion_noise_score >= 48 ? "caution" : "engine"} />
              </div>
              <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(marketEvidenceFusionActionTone(item.action)))}>
                {item.reason}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ShellMoneyMissionStrip({
  envelope,
  guard,
  dailyProfitLock,
  dataFreshnessGate,
  replayGate,
  burstFillPlan,
  burstOutcomeFeedback,
  burstFillExecution,
  profitAccountability,
  directive,
  wallet,
  profitVelocity,
  profitLaneScoreboard,
  fillLedger,
  orderTicket,
  executionAdapter,
}: {
  envelope?: Web3TradingState["autonomous_run_envelope"];
  guard?: Web3TradingState["autonomous_profit_run_guard"];
  dailyProfitLock?: Web3TradingState["autonomous_daily_profit_lock"];
  dataFreshnessGate?: Web3TradingState["autonomous_data_freshness_gate"];
  replayGate?: Web3TradingState["autonomous_replay_gate"];
  burstFillPlan?: Web3TradingState["autonomous_burst_fill_plan"];
  burstOutcomeFeedback?: Web3TradingState["autonomous_burst_outcome_feedback"];
  burstFillExecution?: Web3TradingState["autonomous_burst_fill_execution"];
  profitAccountability?: Web3TradingState["autonomous_profit_accountability"];
  directive?: Web3TradingState["autonomous_trading_directive"];
  wallet?: Web3TradingState["autonomous_wallet_telemetry"];
  profitVelocity?: Web3TradingState["autonomous_profit_velocity_governor"];
  profitLaneScoreboard?: Web3TradingState["autonomous_profit_lane_scoreboard"];
  fillLedger?: Web3TradingState["autonomous_fill_ledger_digest"];
  orderTicket?: Web3TradingState["autonomous_order_ticket"];
  executionAdapter?: Web3TradingState["autonomous_execution_adapter_readiness"];
}) {
  const runStatus = envelope?.status ?? "idle";
  const runTone = envelope ? runEnvelopeTone(runStatus) : "neutral";
  const guardTone = guard ? profitRunGuardTone(guard.status) : runTone;
  const lockTone = dailyProfitLock ? dailyProfitLockTone(dailyProfitLock.status) : guardTone;
  const dataTone = dataFreshnessGate ? dataFreshnessGateTone(dataFreshnessGate.status) : lockTone;
  const replayTone = replayGate ? replayGateTone(replayGate.status) : lockTone;
  const burstTone = burstFillPlan ? burstFillPlanTone(burstFillPlan.status) : guardTone;
  const feedbackTone = burstOutcomeFeedback ? burstOutcomeFeedbackTone(burstOutcomeFeedback.status) : burstTone;
  const fillAuditTone = fillLedger ? shellFillAuditTone(fillLedger.last_fill_verdict) : feedbackTone;
  const burstExecutionToneValue = burstFillExecution ? burstFillExecutionTone(burstFillExecution.status) : burstTone;
  const accountabilityTone = profitAccountability ? profitAccountabilityTone(profitAccountability.status) : feedbackTone;
  const leaderLaneItem = profitLaneScoreboard?.items.find((item) => item.status === "leader") ?? profitLaneScoreboard?.items[0];
  const target = burstFillPlan?.symbol ?? guard?.target_symbol ?? directive?.symbol ?? envelope?.target_symbol ?? profitLaneScoreboard?.leader_symbol ?? orderTicket?.symbol ?? "desk";
  const action = burstFillPlan?.status === "burst" ? "burst fill" : guard?.action ?? directive?.action ?? envelope?.action ?? leaderLaneItem?.action ?? orderTicket?.action ?? "observe";
  const expectedNext = Math.max(
    guard?.expected_next_profit_usd ?? 0,
    envelope?.expected_next_profit_usd ?? 0,
    directive?.expected_edge_usd ?? 0,
    profitLaneScoreboard?.expected_net_profit_usd ?? 0,
    profitVelocity?.expected_profit_per_minute_usd ?? 0,
  );
  const nextNotional = directive?.side === "sell"
    ? directive.release_usd
    : directive?.side === "buy"
      ? directive.max_notional_usd
      : orderTicket?.paper_notional_usd ?? leaderLaneItem?.notional_usd ?? 0;
  const liveBoundary = orderTicket?.can_live_execute
    ? "live armed"
    : executionAdapter?.submit_ready
      ? "signature gated"
      : executionAdapter?.status.replace("-", " ") ?? "paper only";
  const freshBuyBlocked = Boolean(guard?.blocks_fresh_buy || dailyProfitLock && !dailyProfitLock.fresh_buy_allowed || dataFreshnessGate && !dataFreshnessGate.can_trade || replayGate && !replayGate.can_spend || burstOutcomeFeedback?.blocks_fresh_buy);
  const stopReason = dailyProfitLock?.stop_reason ?? guard?.stop_reason ?? envelope?.stop_reason ?? (envelope?.run_enabled ? "none" : "waiting for loop gates");

  return (
    <section className="mt-3 rounded-md border border-engine/25 bg-engine/[0.045] p-3" aria-label="Money mission strip">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.45fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Money mission strip</p>
              <p className="mt-1 break-words font-display text-lg font-semibold capitalize text-on-surface">
                {String(action).replace("-", " ")} {target} · {formatSignedCurrency(expectedNext)} next edge
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {guard?.next_action ?? directive?.next_action ?? envelope?.next_action ?? profitLaneScoreboard?.next_action ?? "The agent is waiting for a clearer paper-trading edge."}
              </p>
            </div>
            <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
              <Chip tone={guardTone}>Profit run guard: {guard?.status.replace("-", " ") ?? "hydrating"}</Chip>
              <Chip tone={lockTone}>Daily lock: {dailyProfitLock?.loop_permission.replace("-", " ") ?? "hydrating"}</Chip>
              <Chip tone={dataTone}>Data gate: {dataFreshnessGate?.action.replace("-", " ") ?? "hydrating"}</Chip>
              <Chip tone={replayTone}>Replay gate: {replayGate?.action.replace("-", " ") ?? "hydrating"}</Chip>
              <Chip tone={burstTone}>Burst fill plan: {burstFillPlan?.status.replace("-", " ") ?? "hydrating"}</Chip>
              <Chip tone={feedbackTone}>Burst feedback: {burstOutcomeFeedback?.action.replace("-", " ") ?? "hydrating"}</Chip>
              <Chip tone={fillAuditTone}>Last fill: {fillLedger?.next_fill_permission.replace("-", " ") ?? "hydrating"}</Chip>
              <Chip tone={burstExecutionToneValue}>Burst execution: {burstFillExecution?.status.replace("-", " ") ?? "hydrating"}</Chip>
              <Chip tone={accountabilityTone}>Profit proof: {profitAccountability?.action.replace("-", " ") ?? "hydrating"}</Chip>
              <Chip tone={runTone}>Run envelope: {runStatus.replace("-", " ")}</Chip>
              <Chip tone={(wallet?.net_pnl_usd ?? 0) >= 0 ? "engine" : "critical"}>{formatSignedCurrency(wallet?.net_pnl_usd ?? 0)} net</Chip>
              <Chip tone={orderTicket?.can_live_execute ? "engine" : "caution"}>{liveBoundary}</Chip>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <MiniShellStat label="Guard score" value={`${guard?.profit_guard_score ?? 0}/100`} tone={scoreTone(guard?.profit_guard_score ?? 0)} />
            <MiniShellStat label="Loss room" value={formatCurrency(dailyProfitLock?.loss_budget_remaining_usd ?? 0)} tone={(dailyProfitLock?.loss_budget_remaining_usd ?? 0) <= (dailyProfitLock?.stop_loss_usd ?? 1) * 0.25 ? "critical" : lockTone} />
            <MiniShellStat label="Data score" value={dataFreshnessGate ? `${dataFreshnessGate.data_score}/100` : "hydrating"} tone={dataTone} />
            <MiniShellStat label="Data size" value={dataFreshnessGate ? `${dataFreshnessGate.size_multiplier}x · ${dataFreshnessGate.max_next_fills} fills` : "hydrating"} tone={dataFreshnessGate?.can_trade ? "engine" : dataTone} />
            <MiniShellStat label="Replay score" value={replayGate ? `${replayGate.replay_score}/100` : "hydrating"} tone={replayTone} />
            <MiniShellStat label="Replay size" value={replayGate ? `${replayGate.size_multiplier}x · ${replayGate.max_next_fills} fills` : "hydrating"} tone={replayGate?.can_spend ? "engine" : replayTone} />
            <MiniShellStat label="Child fills" value={`${burstFillPlan?.child_fill_count ?? 0}/${burstFillPlan?.max_child_fills ?? guard?.max_next_fills ?? 0}`} tone={(burstFillPlan?.child_fill_count ?? 0) > 0 ? "engine" : burstTone} />
            <MiniShellStat label="Child notional" value={(burstFillPlan?.child_notional_usd ?? 0) > 0 ? formatCurrency(burstFillPlan?.child_notional_usd ?? 0) : "none"} tone={(burstFillPlan?.child_notional_usd ?? 0) > 0 ? "engine" : "neutral"} />
            <MiniShellStat label="Trades/min" value={`${profitVelocity?.target_trades_per_minute ?? 0}/min`} tone={profitVelocity ? profitVelocityTone(profitVelocity.status) : "neutral"} />
            <MiniShellStat label="Lock gains" value={formatCurrency(dailyProfitLock?.locked_profit_usd ?? 0)} tone={(dailyProfitLock?.locked_profit_usd ?? 0) > 0 ? "engine" : "neutral"} />
            <MiniShellStat label="Prior feedback" value={burstFillPlan?.prior_feedback_action?.replace("-", " ") ?? "neutral"} tone={burstTone} />
            <MiniShellStat label="Feedback cap" value={`${burstFillPlan?.feedback_child_fill_ceiling ?? 0} fills`} tone={(burstFillPlan?.feedback_child_fill_ceiling ?? 0) > 0 ? burstTone : "critical"} />
            <MiniShellStat label="Applied child fills" value={`${burstFillExecution?.applied_child_count ?? 0}/${burstFillExecution?.requested_child_count ?? 0}`} tone={burstExecutionToneValue} />
            <MiniShellStat label="Profit proof" value={profitAccountability ? `${profitAccountability.accountability_score}/100` : "hydrating"} tone={accountabilityTone} />
            <MiniShellStat label="Money making" value={profitAccountability?.making_money ? "yes" : "not yet"} tone={profitAccountability?.making_money ? "engine" : accountabilityTone} />
            <MiniShellStat label="Next burst" value={burstOutcomeFeedback ? `${burstOutcomeFeedback.next_size_multiplier}x · ${burstOutcomeFeedback.max_next_child_fills} fills` : "hydrating"} tone={feedbackTone} />
            <MiniShellStat label="Account size" value={profitAccountability ? `${profitAccountability.next_size_multiplier}x · ${profitAccountability.max_next_fills} fills` : "hydrating"} tone={accountabilityTone} />
            <MiniShellStat label="Net edge" value={formatSignedCurrency(burstOutcomeFeedback?.net_expected_edge_usd ?? 0)} tone={(burstOutcomeFeedback?.net_expected_edge_usd ?? 0) > 0 ? "engine" : (burstOutcomeFeedback?.net_expected_edge_usd ?? 0) < 0 ? "critical" : "neutral"} />
            <MiniShellStat label="Fill quality" value={`${burstOutcomeFeedback?.paper_quality_score ?? 0}/100`} tone={burstOutcomeFeedback ? scoreTone(burstOutcomeFeedback.paper_quality_score) : "neutral"} />
            <MiniShellStat label="Last fill audit" value={fillLedger ? `${fillLedger.last_fill_profit_score}/100` : "hydrating"} tone={fillAuditTone} />
            <MiniShellStat label="Next fill" value={fillLedger?.next_fill_permission.replace("-", " ") ?? "hydrating"} tone={fillAuditTone} />
            <MiniShellStat label="Fresh-buy block" value={freshBuyBlocked ? "on" : "off"} tone={freshBuyBlocked ? "critical" : "engine"} />
          </div>
        </div>

        <div className="hidden min-w-0 rounded-md border border-outline-variant/35 bg-void/35 p-3 lg:block">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Run envelope</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <MiniShellStat label="Next notional" value={nextNotional > 0 ? formatCurrency(nextNotional) : "watch"} tone={nextNotional > 0 ? "engine" : "neutral"} />
            <MiniShellStat label="Burst total" value={(burstFillPlan?.total_notional_usd ?? 0) > 0 ? formatCurrency(burstFillPlan?.total_notional_usd ?? 0) : "none"} tone={(burstFillPlan?.total_notional_usd ?? 0) > 0 ? "engine" : "neutral"} />
            <MiniShellStat label="Fill quality" value={`${burstOutcomeFeedback?.paper_quality_score ?? 0}/100`} tone={burstOutcomeFeedback ? scoreTone(burstOutcomeFeedback.paper_quality_score) : "neutral"} />
            <MiniShellStat label="Last fill" value={fillLedger?.last_fill_verdict ?? "hydrating"} tone={fillAuditTone} />
            <MiniShellStat label="Daily mode" value={dailyProfitLock?.action.replace("-", " ") ?? "watch"} tone={lockTone} />
            <MiniShellStat label="Route quotes/min" value={`${envelope?.route_quotes_per_minute ?? 0}`} tone={(envelope?.route_quotes_per_minute ?? 0) > 0 ? "engine" : "neutral"} />
            <MiniShellStat label="EV/min" value={formatSignedCurrency(profitVelocity?.expected_profit_per_minute_usd ?? envelope?.expected_profit_per_minute_usd ?? 0)} tone={(profitVelocity?.expected_profit_per_minute_usd ?? envelope?.expected_profit_per_minute_usd ?? 0) > 0 ? "engine" : "neutral"} />
          </div>
          <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(guardTone))}>
            Stop reason: {stopReason}
          </p>
          {fillLedger ? (
            <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(fillAuditTone))}>
              Fill audit: {fillLedger.last_fill_audit}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ShellPositionSituationBoard({
  board,
}: {
  board?: Web3TradingState["autonomous_position_situation_board"];
}) {
  const status = board?.status ?? "idle";
  const tone = positionSituationTone(status);
  const items = board?.items.slice(0, 4) ?? [];

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-md border border-caution/25 bg-caution/[0.055] p-3" aria-label="Position situation board">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Position situation board</p>
          <p className="mt-1 break-words font-display text-lg font-semibold text-on-surface">
            Held coin urgency · {board?.leader_symbol ?? "no held coin"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {board?.summary ?? "Ranking held coins by exit, trim, harvest, refresh, and fresh-buy block pressure."}
          </p>
        </div>
        <Chip tone={tone}>{status.replace("-", " ")}</Chip>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <MiniShellStat label="Held urgency" value={`${board?.average_situation_score ?? 0}/100`} tone={board ? scoreTone(board.average_situation_score) : "neutral"} />
        <MiniShellStat label="Fresh-buy block" value={board?.fresh_buy_blocked ? "on" : "off"} tone={board?.fresh_buy_blocked ? "critical" : "engine"} />
        <MiniShellStat label="Release now" value={formatCurrency(board?.release_usd ?? 0)} tone={(board?.release_usd ?? 0) > 0 ? "caution" : "neutral"} />
        <MiniShellStat label="Protected profit" value={formatCurrency(board?.protected_profit_usd ?? 0)} tone={(board?.protected_profit_usd ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Capital at risk" value={formatCurrency(board?.capital_at_risk_usd ?? 0)} tone={(board?.capital_at_risk_usd ?? 0) > 0 ? "caution" : "neutral"} />
        <MiniShellStat label="Review" value={`${board?.fastest_review_seconds ?? 30}s`} tone={(board?.fastest_review_seconds ?? 30) <= 12 ? "engine" : "caution"} />
      </div>

      {items.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {items.map((item) => (
            <article key={item.id} className="min-w-0 rounded-md border border-outline-variant/35 bg-void/35 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-on-surface">{item.symbol}</p>
                <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-telemetry", toneText(positionSituationItemTone(item.status)))}>
                  {item.situation_score}/100
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">
                {item.action.replace("-", " ")} · {item.priority}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {formatSignedPct(item.pnl_pct)} PnL · {formatCurrency(item.release_usd)} release · stop {formatSignedPct(item.stop_distance_pct)}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(tone))}>
        {board?.next_action ?? "Wait for the paper wallet to hold a coin before ranking position actions."}
      </p>
    </section>
  );
}

function ShellProfitLaneScoreboard({
  scoreboard,
}: {
  scoreboard?: Web3TradingState["autonomous_profit_lane_scoreboard"];
}) {
  const status = scoreboard?.status ?? "idle";
  const tone = profitLaneScoreboardTone(status);
  const items = scoreboard?.items.slice(0, 4) ?? [];

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-md border border-engine/25 bg-engine/[0.055] p-3" aria-label="Profit lane scoreboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Profit lane scoreboard</p>
          <p className="mt-1 break-words font-display text-xl font-semibold text-on-surface">
            Best autonomous profit lane · {scoreboard?.leader_symbol ?? scoreboard?.leader_lane?.replace("-", " ") ?? "hydrating"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {scoreboard?.summary ?? "Ranking autonomous profit lanes by expected edge, realized paper contribution, cadence, fill quality, and blockers."}
          </p>
        </div>
        <Chip tone={tone}>{status.replace("-", " ")}</Chip>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <MiniShellStat label="Make-money score" value={`${scoreboard?.make_money_score ?? 0}/100`} tone={scoreboard ? scoreTone(scoreboard.make_money_score) : "neutral"} />
        <MiniShellStat label="Expected edge" value={formatSignedCurrency(scoreboard?.expected_net_profit_usd ?? 0)} tone={(scoreboard?.expected_net_profit_usd ?? 0) >= 0 ? "engine" : "critical"} />
        <MiniShellStat label="Edge/min" value={`${formatSignedCurrency(scoreboard?.expected_profit_per_minute_usd ?? 0)}/min`} tone={(scoreboard?.expected_profit_per_minute_usd ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Realized lane PnL" value={formatSignedCurrency(scoreboard?.realized_contribution_usd ?? 0)} tone={(scoreboard?.realized_contribution_usd ?? 0) >= 0 ? "engine" : "critical"} />
        <MiniShellStat label="Trade frequency" value={`${scoreboard?.trade_frequency_score ?? 0}/100`} tone={scoreboard ? scoreTone(scoreboard.trade_frequency_score) : "neutral"} />
        <MiniShellStat label="Ready lanes" value={`${scoreboard?.ready_lane_count ?? 0}`} tone={(scoreboard?.ready_lane_count ?? 0) > 0 ? "engine" : (scoreboard?.blocked_lane_count ?? 0) > 0 ? "critical" : "neutral"} />
      </div>

      {items.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {items.map((item) => (
            <article key={item.id} className="min-w-0 rounded-md border border-outline-variant/35 bg-void/35 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-on-surface">{item.label}</p>
                <span className={cn("shrink-0 font-mono text-[10px] uppercase tracking-telemetry", toneText(profitLaneItemTone(item.status)))}>
                  {item.rank_score}/100
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">
                {item.action.replace("-", " ")} · {item.symbol ?? item.lane.replace("-", " ")}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {formatSignedCurrency(item.expected_net_profit_usd)} edge · {formatSignedCurrency(item.realized_contribution_usd)} realized · {item.fill_quality_score}/100 fill
              </p>
            </article>
          ))}
        </div>
      ) : null}

      <p className={cn("mt-2 line-clamp-2 text-xs leading-5", toneText(tone))}>
        {scoreboard?.next_action ?? "Wait for the first ranked autonomous profit lane."}
      </p>
    </section>
  );
}

function ShellOrderTicket({
  ticket,
  execution,
  candle,
}: {
  ticket?: Web3TradingState["autonomous_order_ticket"];
  execution?: Web3TradingState["autonomous_order_ticket_execution"];
  candle?: Web3TradingState["autonomous_candle_conviction"];
}) {
  const status = ticket?.status ?? "idle";
  const symbol = ticket?.symbol ?? "Desk";
  const action = ticket?.action ?? "stand-down";
  const side = ticket?.side ?? "hold";
  const tone = orderTicketTone(status);
  const executionTone = orderTicketExecutionTone(execution?.status ?? "idle");
  const blockers = ticket?.blockers.slice(0, 2) ?? [];
  const candleTone: ShellTone = candle?.blocks_fresh_buy
    ? "critical"
    : candle?.status === "probe" || candle?.status === "refresh"
      ? "caution"
      : scoreTone(candle?.conviction_score ?? 0);

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-outline-variant/35 bg-void/30 p-3" aria-label="Autonomous order ticket">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous order ticket</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {side.toUpperCase()} {symbol} · {String(action).replace("-", " ")}
          </p>
        </div>
        <Chip tone={tone}>{status.replace("-", " ")}</Chip>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">
        {ticket?.summary ?? "Next autonomous paper order ticket is hydrating."}
      </p>

      <div className="mt-3 grid min-w-0 grid-cols-2 gap-1.5">
        <MiniShellStat label="Paper notional" value={formatCurrency(ticket?.paper_notional_usd ?? 0)} tone={(ticket?.can_auto_paper ?? false) ? "engine" : status === "blocked" ? "critical" : "caution"} />
        <MiniShellStat label="Size cap" value={formatCurrency(ticket?.size_governor_final_size_usd ?? 0)} tone={(ticket?.size_governor_can_trade_paper ?? false) ? "engine" : ticket?.size_governor_memory_blocked ? "critical" : "caution"} />
        <MiniShellStat label="Memory cap" value={`${(ticket?.size_governor_memory_multiplier ?? 0).toFixed(2)}x`} tone={ticket?.size_governor_memory_blocked ? "critical" : (ticket?.size_governor_memory_multiplier ?? 0) >= 0.9 ? "engine" : "caution"} />
        <MiniShellStat label="Confidence" value={`${ticket?.confidence_score ?? 0}/100`} tone={scoreTone(ticket?.confidence_score ?? 0)} />
        <MiniShellStat label="Regime" value={`${ticket?.regime_score ?? 0}/100`} tone={ticket?.regime_required ? "critical" : scoreTone(ticket?.regime_score ?? 0)} />
        <MiniShellStat label="Friction" value={`${ticket?.friction_score ?? 0}/100`} tone={ticket?.friction_required ? "critical" : scoreTone(ticket?.friction_score ?? 0)} />
        <MiniShellStat label="Alpha timing" value={`${ticket?.timing_score ?? 0}/100`} tone={ticket?.timing_required ? "critical" : scoreTone(ticket?.timing_score ?? 0)} />
        <MiniShellStat label="Candle" value={`${candle?.conviction_score ?? 0}/100`} tone={candleTone} />
        <MiniShellStat label="Ticket execution" value={execution?.status?.replace("-", " ") ?? "hydrating"} tone={executionTone} />
        <MiniShellStat label="Ledger applied" value={execution?.ledger_applied ? "yes" : "no"} tone={execution?.ledger_applied ? "engine" : execution?.paper_trade_ready ? "caution" : "neutral"} />
        <MiniShellStat label="Cash delta" value={formatSignedCurrency(execution?.projected_cash_delta_usd ?? 0)} tone={(execution?.projected_cash_delta_usd ?? 0) >= 0 ? "engine" : execution?.paper_trade_ready ? "caution" : "neutral"} />
        <MiniShellStat label="Receipt size" value={formatCurrency(execution?.paper_size_usd ?? 0)} tone={(execution?.paper_size_usd ?? 0) > 0 ? executionTone : "neutral"} />
        <MiniShellStat label="Stop" value={`${ticket?.stop_loss_pct ?? 0}%`} tone={(ticket?.stop_loss_pct ?? 0) > 0 ? "caution" : "neutral"} />
        <MiniShellStat label="Target" value={`${ticket?.take_profit_pct ?? 0}%`} tone={(ticket?.take_profit_pct ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Route" value={ticket?.route_required ? "refresh" : `${ticket?.route_score ?? 0}/100`} tone={ticket?.route_required ? "critical" : scoreTone(ticket?.route_score ?? 0)} />
        <MiniShellStat label="Live execute" value={ticket?.can_live_execute ? "true" : "false"} tone={ticket?.can_live_execute ? "engine" : "neutral"} />
      </div>

      <p className={cn("mt-2 line-clamp-2 text-xs leading-5", blockers.length > 0 ? "text-caution" : toneText(tone))}>
        {blockers.length > 0 ? blockers.join(" ") : ticket?.next_action ?? "Paper ticket waits for every gate to clear."}
      </p>
      <p className={cn("mt-1 line-clamp-2 text-xs leading-5", toneText(executionTone))}>
        {execution?.summary ?? "Ticket paper receipt is hydrating."}
      </p>
      <p className="mt-1 line-clamp-1 text-xs leading-5 text-on-surface-variant">
        Market: {ticket?.regime_status?.replace("-", " ") ?? "hydrating"} / {ticket?.regime_action?.replace("-", " ") ?? "missing"} · Size governor: {ticket?.size_governor_status?.replace("-", " ") ?? "hydrating"}{ticket?.size_governor_memory_blocked ? ", memory paused fresh buys" : ""} · Receipt: {execution?.execution_boundary?.replaceAll("-", " ") ?? "paper boundary"} · Candle: {candle?.status ?? "hydrating"}.
      </p>
      <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">
        Next autonomous paper order ticket · {ticket?.execution_boundary?.replaceAll("-", " ") ?? "paper boundary"}
      </p>
    </div>
  );
}

function ShellExecutionCadence({ cadence }: { cadence?: Web3TradingState["autonomous_execution_cadence"] }) {
  const status = cadence?.status ?? "idle";
  const primaryLane = cadence?.primary_lane?.replace("-", " ") ?? "signal watch";
  const tone = cadenceTone(status);
  const primary = cadence?.items[0];

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-outline-variant/35 bg-void/30 p-3" aria-label="Execution cadence governor">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Execution cadence</p>
          <p className="mt-1 truncate text-sm font-semibold capitalize text-on-surface">
            {primaryLane} · {cadence?.target_symbol ?? "desk"}
          </p>
        </div>
        <Chip tone={tone}>{status.replace("-", " ")}</Chip>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">
        {cadence?.summary ?? "Cadence governor is hydrating source budgets and next poll timing."}
      </p>

      <div className="mt-3 grid min-w-0 grid-cols-2 gap-1.5">
        <MiniShellStat label="Poll" value={`${cadence?.next_poll_seconds ?? 0}s`} tone={(cadence?.next_poll_seconds ?? 99) <= 6 ? "engine" : "caution"} />
        <MiniShellStat label="Window" value={`${cadence?.next_trade_window_seconds ?? 0}s`} tone={(cadence?.should_run_daemon_tick ?? false) ? "engine" : "neutral"} />
        <MiniShellStat label="Data/min" value={`${cadence?.max_data_calls_next_minute ?? 0}`} tone={(cadence?.source_utilization_pct ?? 0) >= 85 ? "caution" : "engine"} />
        <MiniShellStat label="Route q/min" value={`${cadence?.route_quote_budget_per_minute ?? 0}`} tone={(cadence?.should_refresh_routes ?? false) ? "caution" : "neutral"} />
      </div>

      <p className={cn("mt-2 line-clamp-2 text-xs leading-5", primary?.blockers.length ? "text-caution" : toneText(tone))}>
        {primary?.blockers[0] ?? cadence?.next_action ?? "DEX discovery, pair refresh, route quote, wallet protect, and signal watch cadence is waiting for a clearer lane."}
      </p>
      <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">
        DEX discovery, pair refresh, route quote, wallet protect, and signal watch cadence
      </p>
    </div>
  );
}

function ShellSessionOutcome({ sessionRun }: { sessionRun?: Web3TradingState["autonomous_session_run"] }) {
  const status = sessionRun?.status ?? "idle";
  const requested = sessionRun?.requested ?? false;
  const summary = requested
    ? sessionRun?.summary ?? "Session run is hydrating."
    : "Session runner is ready for a bounded paper burst.";
  const target = sessionRun?.planner_target_symbol ?? "Desk";
  const tactic = sessionRun?.planner_selected_tactic_label ?? "No tactic selected";

  return (
    <div className="rounded-md border border-outline-variant/35 bg-void/30 p-3" aria-label="Autonomous session outcome">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous session outcome</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-telemetry text-outline">Last planner-bound run</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {target} · {tactic}
          </p>
        </div>
        <Chip tone={sessionRunTone(status)}>{status.replace("-", " ")}</Chip>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">{summary}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        <MiniShellStat label="Ticks" value={`${sessionRun?.completed_ticks ?? 0}/${sessionRun?.requested_ticks ?? 0}`} tone={(sessionRun?.completed_ticks ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Session PnL" value={formatSignedCurrency(sessionRun?.net_pnl_usd ?? 0)} tone={(sessionRun?.net_pnl_usd ?? 0) >= 0 ? "engine" : "critical"} />
        <MiniShellStat label="Cash delta" value={formatSignedCurrency(sessionRun?.cash_delta_usd ?? 0)} tone={(sessionRun?.cash_delta_usd ?? 0) >= 0 ? "engine" : "critical"} />
        <MiniShellStat label="Exposure" value={formatSignedCurrency(sessionRun?.exposure_delta_usd ?? 0)} tone={(sessionRun?.exposure_delta_usd ?? 0) <= 0 ? "engine" : "caution"} />
        <MiniShellStat label="Fills" value={`${sessionRun?.fill_count ?? 0}/${sessionRun?.max_total_fills ?? 0}`} tone={(sessionRun?.fill_count ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Protect" value={`${sessionRun?.protective_sell_count ?? 0}`} tone={(sessionRun?.protective_sell_count ?? 0) > 0 ? "caution" : "neutral"} />
      </div>
      <p className="mt-2 line-clamp-1 text-[11px] leading-4 text-outline">
        Fills blockers protective sells: {sessionRun?.fill_count ?? 0}/{sessionRun?.blocked_count ?? 0}/{sessionRun?.protective_sell_count ?? 0}. {sessionRun?.next_action ?? "Waiting for the next bounded session."}
      </p>
    </div>
  );
}

function walletCurvePoints(wallet?: Web3TradingState["autonomous_wallet_telemetry"]): ShellWalletPoint[] {
  if (wallet?.curve.length) return wallet.curve;

  return [
    {
      id: "wallet-fallback-start",
      label: "Start",
      recorded_at: "",
      cycle: 0,
      action: "current",
      equity_usd: wallet?.starting_cash_usd ?? 25_000,
      cash_usd: wallet?.starting_cash_usd ?? 25_000,
      exposure_usd: 0,
      realized_pnl_usd: 0,
      unrealized_pnl_usd: 0,
      drawdown_pct: 0,
      filled_count: 0,
      blocked_count: 0,
    },
    {
      id: "wallet-fallback-current",
      label: "Current",
      recorded_at: "",
      cycle: 1,
      action: "current",
      equity_usd: wallet?.equity_usd ?? 25_000,
      cash_usd: wallet?.cash_usd ?? 25_000,
      exposure_usd: wallet?.exposure_usd ?? 0,
      realized_pnl_usd: wallet?.realized_pnl_usd ?? 0,
      unrealized_pnl_usd: wallet?.unrealized_pnl_usd ?? 0,
      drawdown_pct: wallet?.max_drawdown_pct ?? 0,
      filled_count: wallet?.fill_count ?? 0,
      blocked_count: wallet?.blocked_count ?? 0,
    },
  ] satisfies ShellWalletPoint[];
}

function ShellAutonomousLoop({ items }: { items: ShellAutonomousLoopItem[] }) {
  const width = 720;
  const height = 118;
  const points = items.map((item, index) => ({
    ...item,
    x: 50 + index * 155,
    y: 50 - ((item.score - 50) / 50) * 14,
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="mt-3 min-w-0 border-t border-outline-variant/35 pt-3" aria-label="Autonomous loop timeline">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous loop timeline</p>
          <p className="mt-1 font-display text-sm font-semibold text-on-surface">Monitor decide size execute learn</p>
        </div>
        <Chip tone={items.some((item) => item.tone === "critical") ? "critical" : items.some((item) => item.tone === "engine") ? "engine" : "caution"}>
          Wallet feedback loop
        </Chip>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Monitor decide size execute learn loop with wallet feedback"
        className="mt-2 h-28 w-full text-engine"
      >
        <line x1="36" x2="684" y1="50" y2="50" stroke="currentColor" strokeOpacity="0.14" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
        {points.map((point) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r="9" className={toneFill(point.tone)} opacity="0.94" />
            <circle cx={point.x} cy={point.y} r="14" fill="none" stroke="currentColor" strokeOpacity="0.18" />
            <text x={point.x} y="87" textAnchor="middle" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">
              {point.label}
            </text>
            <text x={point.x} y="104" textAnchor="middle" className="fill-current font-mono text-[11px]">
              {shortSvgLabel(point.value)}
            </text>
          </g>
        ))}
      </svg>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {items.map((item) => (
          <MiniShellStat key={item.id} label={item.label} value={item.detail} tone={item.tone} />
        ))}
      </div>
    </div>
  );
}

function ShellHotTapeChart({
  pulse,
  tickPlan,
  protectionCoordinator,
  scalpExit,
  positionSurveillance,
  portfolioGuard,
}: {
  pulse?: Web3TradingState["autonomous_market_pulse"];
  tickPlan?: Web3TradingState["autonomous_tick_plan"];
  protectionCoordinator?: Web3TradingState["autonomous_protection_coordinator"];
  scalpExit?: Web3TradingState["autonomous_scalp_exit_autopilot"];
  positionSurveillance?: Web3TradingState["position_surveillance_matrix"];
  portfolioGuard?: Web3TradingState["portfolio_price_action_guard"];
}) {
  const rows = (pulse?.items ?? []).slice(0, 4);
  const leader = rows.find((row) => row.symbol === pulse?.leader_symbol) ?? rows[0] ?? null;
  const tickLeader = tickPlan?.items.find((item) => item.status === "ready") ?? tickPlan?.items[0] ?? null;
  const bundleLabel = tickPlan
    ? `${tickPlan.bundle_action_count}/${tickPlan.max_actions_next_minute}`
    : "0/0";
  const tickActionLabel = tickLeader
    ? `${tickLeader.action.replace("-now", "").replace("-", " ")}${tickLeader.symbol ? ` ${tickLeader.symbol}` : ""}`
    : "stand down";
  const width = 320;
  const height = 148;
  const padX = 42;
  const padY = 18;
  const chartWidth = width - padX - 16;
  const rowGap = rows.length > 1 ? (height - padY * 2) / (rows.length - 1) : 0;

  return (
    <div className="rounded-md border border-engine/25 bg-engine/[0.045] p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Moonshot hot coin pressure</p>
          <p className="mt-1 truncate font-display text-sm font-semibold text-on-surface">
            {leader ? `${leader.symbol} · ${leader.action}` : "Waiting for pulse"}
          </p>
        </div>
        <Chip tone={marketPulseTone(pulse?.status ?? "idle")}>{pulse?.status ?? "idle"}</Chip>
      </div>

      {rows.length > 0 ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="First-screen Moonshot hot coin pressure chart"
          className="mt-2 h-20 w-full text-engine sm:h-28"
        >
          {[25, 50, 75, 100].map((mark) => {
            const x = padX + (mark / 100) * chartWidth;
            return <line key={mark} x1={x} x2={x} y1={padY - 8} y2={height - padY + 8} stroke="currentColor" strokeOpacity="0.16" />;
          })}
          {rows.map((row, index) => {
            const y = padY + index * rowGap;
            const edgeX = padX + (Math.max(0, Math.min(100, row.blended_edge_score)) / 100) * chartWidth;
            const signalX = padX + (Math.max(0, Math.min(100, row.signal_score)) / 100) * chartWidth;
            const riskX = padX + (Math.max(0, Math.min(100, row.risk_score)) / 100) * chartWidth;
            const isLeader = row.symbol === leader?.symbol;
            return (
              <g key={row.token_id}>
                <line x1={padX} x2={width - 16} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.18" />
                <line x1={padX} x2={edgeX} y1={y} y2={y} stroke="currentColor" strokeWidth={isLeader ? "5" : "4"} strokeLinecap="round" className={marketPulseActionStroke(row)} />
                <circle cx={signalX} cy={y} r={isLeader ? "4.8" : "3.8"} className="fill-engine" />
                <circle cx={riskX} cy={y} r="3.4" className="fill-critical" opacity={row.risk_score >= 50 ? "0.95" : "0.35"} />
                <text x="0" y={y + 3.5} className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">{row.symbol}</text>
                <text x={Math.min(width - 42, edgeX + 5)} y={y + 3.5} className="fill-current font-mono text-[10px] text-on-surface">{row.blended_edge_score}</text>
              </g>
            );
          })}
          <text x={padX} y={height - 2} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">edge</text>
          <text x={width - 86} y={height - 2} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">risk marker</text>
        </svg>
      ) : (
        <p className="mt-2 rounded-md border border-outline-variant/35 bg-void/30 px-3 py-2 text-xs leading-5 text-outline">
          Signal, buyer flow, blended edge, review pressure, and risk marker will appear when the pulse scanner has rows.
        </p>
      )}

      <div className="mt-2 rounded-md border border-outline-variant/35 bg-void/30 p-2" aria-label="First-screen autonomous tick bundle">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-telemetry text-outline">Next tick bundle</p>
            <p className="mt-1 truncate font-display text-sm font-semibold capitalize text-on-surface">{tickActionLabel}</p>
          </div>
          <Chip tone={tickPlan ? tickPlanTone(tickPlan.status) : "neutral"}>{tickPlan?.status.replace("-", " ") ?? "loading"}</Chip>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-outline">
          {tickPlan?.bundle_summary ?? "Waiting for autonomous tick plan."}
        </p>
      </div>

      <ShellPositionSentry
        protectionCoordinator={protectionCoordinator}
        scalpExit={scalpExit}
        positionSurveillance={positionSurveillance}
        portfolioGuard={portfolioGuard}
      />

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <MiniShellStat label="Lead" value={leader?.symbol ?? "none"} tone={leader ? "engine" : "neutral"} />
        <MiniShellStat label="Bundle" value={bundleLabel} tone={(tickPlan?.bundle_action_count ?? 0) > 0 ? "engine" : "caution"} />
        <MiniShellStat label="Budget" value={formatCurrency(tickPlan?.bundle_trade_budget_usd ?? 0)} tone={(tickPlan?.bundle_trade_budget_usd ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Sell first" value={formatCurrency(protectionCoordinator?.sell_first_release_usd ?? protectionCoordinator?.release_usd ?? scalpExit?.release_usd ?? positionSurveillance?.release_usd ?? 0)} tone={(protectionCoordinator?.sell_first_release_usd ?? protectionCoordinator?.release_usd ?? scalpExit?.release_usd ?? positionSurveillance?.release_usd ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Defense" value={protectionCoordinator?.status ?? (scalpExit?.ledger_applied ? "applied" : scalpExit?.paper_trade_ready ? "queued" : "watch")} tone={protectionCoordinator ? protectionCoordinatorTone(protectionCoordinator.status) : scalpExit?.ledger_applied || scalpExit?.paper_trade_ready ? "engine" : "neutral"} />
        <MiniShellStat label="Risk" value={formatCurrency(scalpExit?.at_risk_usd ?? positionSurveillance?.capital_at_risk_usd ?? 0)} tone={(scalpExit?.at_risk_usd ?? positionSurveillance?.capital_at_risk_usd ?? 0) > 0 ? "caution" : "neutral"} />
        <MiniShellStat label="Tick" value={`${tickPlan?.tick_seconds ?? 0}s`} tone={(tickPlan?.tick_seconds ?? 0) <= 5 ? "engine" : "caution"} />
      </div>
    </div>
  );
}

function ShellPositionSentry({
  protectionCoordinator,
  scalpExit,
  positionSurveillance,
  portfolioGuard,
}: {
  protectionCoordinator?: Web3TradingState["autonomous_protection_coordinator"];
  scalpExit?: Web3TradingState["autonomous_scalp_exit_autopilot"];
  positionSurveillance?: Web3TradingState["position_surveillance_matrix"];
  portfolioGuard?: Web3TradingState["portfolio_price_action_guard"];
}) {
  const leader = scalpExit?.items[0] ?? null;
  const leaderLabel = protectionCoordinator?.selected_symbol
    ? `${protectionCoordinator.selected_action ?? protectionCoordinator.status} ${protectionCoordinator.selected_symbol}`
    : leader
    ? `${leader.action} ${leader.symbol}`
    : scalpExit?.selected_symbol
      ? `${scalpExit.selected_action} ${scalpExit.selected_symbol}`
      : positionSurveillance?.watched_count
        ? `${positionSurveillance.status.replace("-", " ")} ${positionSurveillance.watched_count} held`
        : "no open paper positions";
  const sentryStatus = protectionCoordinator?.status ?? scalpExit?.status ?? (positionSurveillance?.status === "idle" ? "idle" : "hold");
  const nextReviewSeconds = Math.min(
    positiveOrInfinity(protectionCoordinator?.fastest_review_seconds),
    positiveOrInfinity(scalpExit?.fastest_decision_seconds),
    positiveOrInfinity(positionSurveillance?.fastest_review_seconds),
    positiveOrInfinity(portfolioGuard?.fastest_review_seconds),
  );
  const reviewLabel = Number.isFinite(nextReviewSeconds) ? `${nextReviewSeconds}s` : "idle";
  const sentrySummary = protectionCoordinator?.summary ?? scalpExit?.summary ?? positionSurveillance?.summary ?? "Position sentry is waiting for paper holdings.";

  return (
    <div className="mt-2 rounded-md border border-outline-variant/35 bg-void/30 p-2" aria-label="First-screen autonomous position sentry">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-telemetry text-outline">Position sentry</p>
          <p className="mt-1 truncate font-display text-sm font-semibold capitalize text-on-surface">{leaderLabel}</p>
        </div>
        <Chip tone={protectionCoordinator ? protectionCoordinatorTone(protectionCoordinator.status) : scalpExitTone(sentryStatus as Web3TradingState["autonomous_scalp_exit_autopilot"]["status"])}>{sentryStatus.replace("-", " ")}</Chip>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-outline">
        {sentrySummary}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <MiniShellStat label="Lanes" value={`${protectionCoordinator?.lane_count ?? positionSurveillance?.watched_count ?? scalpExit?.items.length ?? 0}`} tone={(protectionCoordinator?.lane_count ?? positionSurveillance?.watched_count ?? scalpExit?.items.length ?? 0) > 0 ? "engine" : "neutral"} />
        <MiniShellStat label="Review" value={reviewLabel} tone={Number.isFinite(nextReviewSeconds) && nextReviewSeconds <= 20 ? "engine" : "caution"} />
        <MiniShellStat label="Agree" value={`${protectionCoordinator?.duplicate_symbol_count ?? 0}`} tone={(protectionCoordinator?.duplicate_symbol_count ?? 0) > 0 ? "engine" : "neutral"} />
      </div>
    </div>
  );
}

function ShellStat({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon?: typeof LineChart;
  label: string;
  value: string;
  tone?: ShellTone;
}) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/35 bg-void/30 p-2.5">
      <p className="flex items-center gap-1.5 truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">
        {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
        {label}
      </p>
      <p className={cn("mt-1 truncate font-display text-sm font-semibold", toneText(tone))}>{value}</p>
    </div>
  );
}

function ShellBriefStep({
  label,
  value,
  detail,
  meta,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  meta: string;
  tone: ShellTone;
}) {
  return (
    <article className="min-w-0 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</p>
        <span className={cn("size-2 rounded-full", toneDot(tone))} aria-hidden="true" />
      </div>
      <p className="mt-2 truncate font-display text-sm font-semibold capitalize text-on-surface">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{detail}</p>
      <p className={cn("mt-2 line-clamp-1 font-mono text-[10px] uppercase tracking-telemetry", toneText(tone))}>{meta}</p>
    </article>
  );
}

function MiniShellStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: ShellTone;
}) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/30 bg-void/30 p-2" aria-label={label}>
      <p className="truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">{label}</p>
      <p className={cn("mt-1 truncate font-mono text-[11px] leading-4", toneText(tone))}>{value}</p>
    </div>
  );
}

function governorTone(status: Web3TradingState["autonomous_tick_governor"]["status"] | "observe"): ShellTone {
  if (status === "run-now" || status === "protect-first") return "engine";
  if (status === "blocked") return "critical";
  return "caution";
}

function walletPerformanceTone(status: Web3TradingState["autonomous_wallet_performance_governor"]["status"]): ShellTone {
  if (status === "press" || status === "compound") return "engine";
  if (status === "protect" || status === "cooldown") return "critical";
  if (status === "harvest" || status === "selective" || status === "learning") return "caution";
  return "neutral";
}

function exitBracketTone(status: Web3TradingState["autonomous_exit_bracket_governor"]["status"]): ShellTone {
  if (status === "covered") return "engine";
  if (status === "repair" || status === "protect" || status === "blocked") return "critical";
  if (status === "harvest") return "caution";
  return "neutral";
}

function profitRunwayTone(status: Web3TradingState["autonomous_profit_runway_governor"]["status"]): ShellTone {
  if (status === "scale" || status === "trade") return "engine";
  if (status === "protect" || status === "blocked") return "critical";
  if (status === "refresh" || status === "probe" || status === "harvest" || status === "learn") return "caution";
  return "neutral";
}

function profitVelocityTone(status: Web3TradingState["autonomous_profit_velocity_governor"]["status"]): ShellTone {
  if (status === "burst" || status === "trade") return "engine";
  if (status === "protect" || status === "blocked") return "critical";
  if (status === "probe" || status === "refresh" || status === "cooldown") return "caution";
  return "neutral";
}

function profitLaneScoreboardTone(status: Web3TradingState["autonomous_profit_lane_scoreboard"]["status"] | "idle"): ShellTone {
  if (status === "press" || status === "selective") return "engine";
  if (status === "blocked") return "critical";
  if (status === "protect" || status === "cooldown") return "caution";
  return "neutral";
}

function profitLaneItemTone(status: Web3TradingState["autonomous_profit_lane_scoreboard"]["items"][number]["status"]): ShellTone {
  if (status === "leader" || status === "ready") return "engine";
  if (status === "blocked") return "critical";
  if (status === "protect") return "caution";
  return "neutral";
}

function tradingDirectiveTone(status: Web3TradingState["autonomous_trading_directive"]["status"] | "observe"): ShellTone {
  if (status === "paper-ready" || status === "selective") return "engine";
  if (status === "blocked" || status === "protect-first") return "critical";
  if (status === "refresh-first") return "caution";
  return "neutral";
}

function directiveOutcomeTone(status: Web3TradingState["autonomous_directive_outcome_auditor"]["status"] | "observe"): ShellTone {
  if (status === "press" || status === "keep") return "engine";
  if (status === "blocked" || status === "protect") return "critical";
  if (status === "tighten" || status === "refresh") return "caution";
  return "neutral";
}

function directiveEvidenceTone(status: Web3TradingState["autonomous_trading_directive"]["evidence"][number]["status"]): ShellTone {
  if (status === "pass") return "engine";
  if (status === "block") return "critical";
  return "caution";
}

function reactionLoopTone(status: Web3TradingState["autonomous_reaction_loop"]["status"] | "observe"): ShellTone {
  if (status === "press" || status === "scalp") return "engine";
  if (status === "protect" || status === "blocked") return "critical";
  if (status === "refresh" || status === "cooldown") return "caution";
  return "neutral";
}

function reactionLoopItemTone(status: Web3TradingState["autonomous_reaction_loop"]["items"][number]["status"]): ShellTone {
  if (status === "pass") return "engine";
  if (status === "fail") return "critical";
  return "caution";
}

function landingOptimizerTone(status: Web3TradingState["autonomous_landing_optimizer"]["status"] | "idle"): ShellTone {
  if (status === "land-now" || status === "priority" || status === "managed") return "engine";
  if (status === "paper" || status === "refresh" || status === "signature-gated") return "caution";
  if (status === "fee-drag" || status === "blocked") return "critical";
  return "neutral";
}

function landingOptimizerItemTone(status: Web3TradingState["autonomous_landing_optimizer"]["items"][number]["status"]): ShellTone {
  if (status === "pass") return "engine";
  if (status === "fail") return "critical";
  return "caution";
}

function runEnvelopeTone(status: Web3TradingState["autonomous_run_envelope"]["status"] | "idle"): ShellTone {
  if (status === "running" || status === "armed") return "engine";
  if (status === "blocked") return "critical";
  if (status === "protect" || status === "refresh" || status === "cooldown") return "caution";
  return "neutral";
}

function profitRunGuardTone(status: Web3TradingState["autonomous_profit_run_guard"]["status"] | "idle"): ShellTone {
  if (status === "accelerate" || status === "compound") return "engine";
  if (status === "blocked" || status === "protect") return "critical";
  if (status === "tighten" || status === "refresh" || status === "cooldown") return "caution";
  return "neutral";
}

function dailyProfitLockTone(status: Web3TradingState["autonomous_daily_profit_lock"]["status"] | "idle"): ShellTone {
  if (status === "run") return "engine";
  if (status === "stand-down" || status === "protect") return "critical";
  if (status === "lock-profit" || status === "harvest" || status === "cooldown") return "caution";
  return "neutral";
}

function dataFreshnessGateTone(status: Web3TradingState["autonomous_data_freshness_gate"]["status"]): ShellTone {
  if (status === "clear" || status === "tradeable") return "engine";
  if (status === "refresh" || status === "backfill" || status === "sample") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function marketEvidenceFusionTone(status: Web3TradingState["autonomous_market_evidence_fusion"]["status"]): ShellTone {
  if (status === "attack" || status === "selective") return "engine";
  if (status === "protect" || status === "blocked") return "critical";
  if (status === "refresh" || status === "sample" || status === "watch") return "caution";
  return "neutral";
}

function marketEvidenceFusionActionTone(action: Web3TradingState["autonomous_market_evidence_fusion"]["items"][number]["action"]): ShellTone {
  if (action === "trade" || action === "probe") return "engine";
  if (action === "protect" || action === "reject") return "critical";
  if (action === "refresh-route" || action === "refresh-candles") return "caution";
  return "neutral";
}

function replayGateTone(status: Web3TradingState["autonomous_replay_gate"]["status"]): ShellTone {
  if (status === "approve" || status === "size-down") return "engine";
  if (status === "protect" || status === "refresh" || status === "learning") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function burstFillPlanTone(status: Web3TradingState["autonomous_burst_fill_plan"]["status"]): ShellTone {
  if (status === "burst" || status === "single") return "engine";
  if (status === "protect" || status === "refresh") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function burstOutcomeFeedbackTone(status: Web3TradingState["autonomous_burst_outcome_feedback"]["status"]): ShellTone {
  if (status === "scale" || status === "keep") return "engine";
  if (status === "tighten" || status === "protect") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function shellFillAuditTone(verdict: Web3TradingState["autonomous_fill_ledger_digest"]["last_fill_verdict"]): ShellTone {
  if (verdict === "press" || verdict === "keep") return "engine";
  if (verdict === "tighten" || verdict === "protect") return "critical";
  if (verdict === "learn") return "caution";
  return "neutral";
}

function burstFillExecutionTone(status: Web3TradingState["autonomous_burst_fill_execution"]["status"]): ShellTone {
  if (status === "applied" || status === "ready") return "engine";
  if (status === "blocked") return "critical";
  return "neutral";
}

function profitAccountabilityTone(status: Web3TradingState["autonomous_profit_accountability"]["status"]): ShellTone {
  if (status === "press" || status === "compound") return "engine";
  if (status === "tighten" || status === "protect" || status === "learning") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function portfolioMarkBoardTone(status: Web3TradingState["autonomous_portfolio_mark_board"]["status"] | "idle"): ShellTone {
  if (status === "compound" || status === "watch") return "engine";
  if (status === "exit") return "critical";
  if (status === "harvest" || status === "protect") return "caution";
  return "neutral";
}

function portfolioMarkItemTone(status: Web3TradingState["autonomous_portfolio_mark_board"]["items"][number]["status"]): ShellTone {
  if (status === "winner" || status === "watch") return "engine";
  if (status === "exit") return "critical";
  if (status === "risk") return "caution";
  return "neutral";
}

function positionSituationTone(status: Web3TradingState["autonomous_position_situation_board"]["status"] | "idle"): ShellTone {
  if (status === "watch") return "engine";
  if (status === "exit" || status === "trim") return "critical";
  if (status === "harvest" || status === "defend" || status === "refresh") return "caution";
  return "neutral";
}

function positionSituationItemTone(status: Web3TradingState["autonomous_position_situation_board"]["items"][number]["status"]): ShellTone {
  if (status === "watch" || status === "ready") return "engine";
  if (status === "urgent" || status === "blocked") return "critical";
  if (status === "refresh" || status === "defend") return "caution";
  return "neutral";
}

function outcomeMemoryTone(status: Web3TradingState["autonomous_outcome_memory_governor"]["status"]): ShellTone {
  if (status === "press" || status === "compound") return "engine";
  if (status === "protect" || status === "cooldown") return "critical";
  if (status === "selective" || status === "learning") return "caution";
  return "neutral";
}

function opportunityCostTone(status: Web3TradingState["autonomous_opportunity_cost_auditor"]["status"]): ShellTone {
  if (status === "press" || status === "probe") return "engine";
  if (status === "protected") return "critical";
  if (status === "learn") return "caution";
  return "neutral";
}

function executionAdapterTone(status: Web3TradingState["autonomous_execution_adapter_readiness"]["status"]): ShellTone {
  if (status === "swap-v2-ready" || status === "signature-gated") return "engine";
  if (status === "blocked" || status === "migration-required") return "critical";
  if (status === "credential-gated" || status === "refresh-required" || status === "paper-only") return "caution";
  return "neutral";
}

function edgeStackTone(status: Web3TradingState["autonomous_edge_stack"]["status"]): ShellTone {
  if (status === "attack") return "engine";
  if (status === "blocked") return "critical";
  return "caution";
}

function edgeExecutionTone(status: Web3TradingState["autonomous_edge_stack_execution"]["status"]): ShellTone {
  if (status === "queued" || status === "applied" || status === "refresh-only") return "engine";
  if (status === "blocked") return "critical";
  return "caution";
}

function edgeExecutionLoopAction(action: Web3TradingState["autonomous_edge_stack_execution"]["selected_action"]) {
  if (action === "paper-buy") return "trade-now";
  if (action === "paper-sell" || action === "protect") return "protect-now";
  if (action === "route-refresh") return "refresh-routes";
  return "stand-down";
}

function tickPlanTone(status: Web3TradingState["autonomous_tick_plan"]["status"]): ShellTone {
  if (status === "trade" || status === "protect" || status === "refresh") return "engine";
  if (status === "blocked") return "critical";
  if (status === "observe") return "caution";
  return "neutral";
}

function scalpExitTone(status: Web3TradingState["autonomous_scalp_exit_autopilot"]["status"] | "hold" | "idle"): ShellTone {
  if (status === "press" || status === "harvest" || status === "trail" || status === "hold") return "engine";
  if (status === "eject" || status === "trim" || status === "blocked") return "critical";
  return "neutral";
}

function protectionCoordinatorTone(status: Web3TradingState["autonomous_protection_coordinator"]["status"]): ShellTone {
  if (status === "applied" || status === "queued") return "engine";
  if (status === "blocked") return "critical";
  if (status === "watch") return "caution";
  return "neutral";
}

function portfolioGuardTone(status: Web3TradingState["portfolio_price_action_guard"]["status"]): ShellTone {
  if (status === "press" || status === "harvest" || status === "watch" || status === "idle") return "engine";
  if (status === "eject" || status === "trim") return "critical";
  return "caution";
}

function proofStatusTone(status: string): ShellTone {
  if (/attack|trade|press|scale|compound|protect|harvest|ready|paper-only/.test(status)) return "engine";
  if (/blocked|stand-down|pause|exit-only/.test(status)) return "critical";
  if (/refresh|probe|watch|cooldown|selective/.test(status)) return "caution";
  return "neutral";
}

function sessionRunTone(status: Web3TradingState["autonomous_session_run"]["status"] | "idle"): ShellTone {
  if (status === "completed") return "engine";
  if (status === "partial") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function scoreTone(score: number): ShellTone {
  if (score >= 70) return "engine";
  if (score >= 42) return "caution";
  return "critical";
}

function trapRadarTone(status: Web3TradingState["autonomous_trap_radar"]["status"] | undefined, score: number): ShellTone {
  if (status === "trap" || status === "exit-only" || score >= 72) return "critical";
  if (status === "refresh" || status === "watch" || score >= 55) return "caution";
  if (status === "chase" || status === "probe" || score > 0) return "engine";
  return "neutral";
}

function orderTicketTone(status: Web3TradingState["autonomous_order_ticket"]["status"] | "idle"): ShellTone {
  if (status === "ready" || status === "protect") return "engine";
  if (status === "blocked") return "critical";
  if (status === "refresh" || status === "watch") return "caution";
  return "neutral";
}

function orderTicketExecutionTone(status: Web3TradingState["autonomous_order_ticket_execution"]["status"] | "idle"): ShellTone {
  if (status === "applied" || status === "queued") return "engine";
  if (status === "blocked") return "critical";
  if (status === "route-refresh" || status === "protect-only") return "caution";
  return "neutral";
}

function cadenceTone(status: Web3TradingState["autonomous_execution_cadence"]["status"] | "idle"): ShellTone {
  if (status === "burst" || status === "protect") return "engine";
  if (status === "blocked") return "critical";
  if (status === "refresh" || status === "cooldown") return "caution";
  return "neutral";
}

function positiveOrInfinity(value: number | undefined) {
  return value && value > 0 ? value : Number.POSITIVE_INFINITY;
}

function buildShellAutonomousLoopItems({
  marketPulse,
  edgeStack,
  planner,
  edgeExecution,
  profitLearning,
  wallet,
}: {
  marketPulse?: Web3TradingState["autonomous_market_pulse"];
  edgeStack?: Web3TradingState["autonomous_edge_stack"];
  planner?: Web3TradingState["autonomous_session_planner"];
  edgeExecution?: Web3TradingState["autonomous_edge_stack_execution"];
  profitLearning?: Web3TradingState["autonomous_profit_learning"];
  wallet?: Web3TradingState["autonomous_wallet_telemetry"];
}): ShellAutonomousLoopItem[] {
  const deployBudget = planner?.deploy_budget_usd ?? 0;
  const releaseBudget = planner?.release_budget_usd ?? 0;
  const pnl = wallet?.net_pnl_usd ?? profitLearning?.net_pnl_usd ?? 0;
  const plannerStatus = planner?.status ?? "idle";
  const learnTone = pnl < 0 ? "critical" : profitLearning?.status === "protect" ? "caution" : pnl > 0 ? "engine" : "neutral";

  return [
    {
      id: "loop-monitor",
      label: "Monitor",
      value: marketPulse?.leader_symbol ?? "Tape",
      detail: `${marketPulse?.leader_symbol ?? "Tape"} · ${marketPulse?.fastest_review_seconds ?? 0}s`,
      tone: marketPulse ? marketPulseTone(marketPulse.status) : "neutral",
      score: clampScore(marketPulse?.average_pulse_score ?? 0),
    },
    {
      id: "loop-decide",
      label: "Decide",
      value: edgeStack?.permission.replace("-", " ") ?? "Hydrate",
      detail: `${edgeStack?.edge_score ?? 0}/100 edge`,
      tone: edgeStack ? edgeStackTone(edgeStack.status) : "caution",
      score: clampScore(edgeStack?.edge_score ?? 0),
    },
    {
      id: "loop-size",
      label: "Size",
      value: deployBudget > 0 ? `${formatCompactCurrency(deployBudget)} deploy` : `${formatCompactCurrency(releaseBudget)} release`,
      detail: `${planner?.max_total_fills ?? 0} fills · ${planner?.selected_tactic_label ?? "tactic"}`,
      tone: plannerStatus === "blocked" ? "critical" : releaseBudget > deployBudget ? "caution" : deployBudget > 0 ? "engine" : "neutral",
      score: clampScore(deployBudget > 0 ? 74 : releaseBudget > 0 ? 62 : 36),
    },
    {
      id: "loop-execute",
      label: "Execute",
      value: edgeExecution?.selected_action.replace("-", " ") ?? "Paper gate",
      detail: edgeExecution?.status.replace("-", " ") ?? "paper gate",
      tone: edgeExecution ? edgeExecutionTone(edgeExecution.status) : "caution",
      score: clampScore(edgeExecution?.edge_score ?? 0),
    },
    {
      id: "loop-learn",
      label: "Learn",
      value: formatSignedCurrency(pnl),
      detail: `${profitLearning?.confidence_score ?? 0}/100 feedback`,
      tone: learnTone,
      score: clampScore(profitLearning?.confidence_score ?? (pnl > 0 ? 64 : 42)),
    },
  ];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toneFill(tone: ShellTone) {
  if (tone === "engine") return "fill-engine";
  if (tone === "critical") return "fill-critical";
  if (tone === "caution") return "fill-caution";
  return "fill-outline";
}

function walletActionFill(action: ShellWalletPoint["action"]) {
  const label = String(action);
  if (/sell|protect|exit|trim|harvest/.test(label)) return "fill-caution";
  if (/block|pause|stand/.test(label)) return "fill-critical";
  if (/buy|trade|attack|probe|advance|run/.test(label)) return "fill-engine";
  return "fill-outline";
}

function shortSvgLabel(value: string) {
  return value.length > 16 ? `${value.slice(0, 14)}...` : value;
}

function marketPulseTone(status: Web3TradingState["autonomous_market_pulse"]["status"]): ShellTone {
  if (status === "attack") return "engine";
  if (status === "protect" || status === "cooldown") return "critical";
  if (status === "selective") return "caution";
  return "neutral";
}

function marketPulseActionStroke(item: ShellMarketPulseItem) {
  if (item.action === "attack") return "text-engine";
  if (item.action === "probe" || item.action === "watch") return "text-caution";
  if (item.action === "protect" || item.action === "stand-down") return "text-critical";
  return "text-outline";
}

function toneDot(tone: ShellTone) {
  if (tone === "engine") return "bg-engine";
  if (tone === "critical") return "bg-critical";
  if (tone === "caution") return "bg-caution";
  return "bg-outline";
}

function toneText(tone: ShellTone) {
  if (tone === "engine") return "text-engine";
  if (tone === "critical") return "text-critical";
  if (tone === "caution") return "text-caution";
  return "text-on-surface";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 0 : 2,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatSignedCurrency(value: number) {
  const formatted = formatCurrency(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatSignedPct(value: number) {
  const formatted = `${Math.abs(value).toFixed(Math.abs(value) >= 10 ? 0 : 1)}%`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

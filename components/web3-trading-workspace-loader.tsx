"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Activity, CandlestickChart, LineChart, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, Zap } from "lucide-react";

import { Chip } from "@/components/sentinel";
import type { AutonomousCandleRefreshRecordRequest, TradingMarketSource, Web3TradingState } from "@/src/db/web3-trading";

type OperatorFocusMode = "cockpit" | "market" | "portfolio" | "wiring";
type QuickBusyState = "refresh" | "route" | "route-repair" | "chart" | "loop" | "session" | "minute" | "source" | "reset";
type QuickAgentActionKind = QuickBusyState | "stand-down";
type QuickWiringPath = {
  label: string;
  value: string;
  tone: string;
};
type QuickAgentActionOutcome = {
  id: string;
  kind: QuickAgentActionKind;
  label: string;
  summary: string;
  nextAction: string;
  beforeDecision: string;
  afterDecision: string;
  walletDeltaUsd: number;
  windowPnlDeltaUsd: number;
  exposureDeltaUsd: number;
  tradeDelta: number;
  cycleDelta: number;
  fillDelta: number;
  blockDelta: number;
  routeStatus: string;
  chartStatus: string;
  loopStatus: string;
  sessionStatus: string;
  boundary: string;
  tone: QuickChipTone;
};

export function Web3TradingWorkspaceLoader({ initialState }: { initialState?: Web3TradingState }) {
  const [state, setState] = useState<Web3TradingState | undefined>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [loadingControls, setLoadingControls] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [autoWatch, setAutoWatch] = useState(false);
  const [autoWatchPrimed, setAutoWatchPrimed] = useState(false);
  const [quickBusy, setQuickBusy] = useState<QuickBusyState | null>(null);
  const [quickNotice, setQuickNotice] = useState("Quick agent controls are armed for bounded paper sessions.");
  const [lastActionOutcome, setLastActionOutcome] = useState<QuickAgentActionOutcome | null>(null);
  const [focusMode, setFocusMode] = useState<OperatorFocusMode>("cockpit");
  const [WorkspaceComponent, setWorkspaceComponent] = useState<ComponentType<{ initialState: Web3TradingState }> | null>(null);
  const [DiagnosticsComponent, setDiagnosticsComponent] = useState<ComponentType<{ state?: Web3TradingState }> | null>(null);

  useEffect(() => {
    if (state) return;
    const controller = new AbortController();
    fetch("/api/web3-trading?account=persistent&source=sample", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as Web3TradingState | { error: string };
        if (!response.ok || "error" in payload) {
          throw new Error("The autonomous trading state could not be loaded.");
        }
        setState(payload);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "The autonomous trading state could not be loaded.");
      });
    return () => controller.abort();
  }, [state]);

  async function openControls() {
    setControlsOpen(true);
    if (WorkspaceComponent || loadingControls) return;
    setLoadingControls(true);
    try {
      const mod = await import("@/components/web3-trading-workspace");
      setWorkspaceComponent(() => mod.Web3TradingWorkspace);
    } catch {
      setError("The autonomous trading controls could not be loaded.");
    } finally {
      setLoadingControls(false);
    }
  }

  async function openDiagnostics() {
    setDiagnosticsOpen(true);
    if (DiagnosticsComponent || loadingDiagnostics) return;
    setLoadingDiagnostics(true);
    try {
      const mod = await import("@/components/web3-trading-shell");
      setDiagnosticsComponent(() => mod.Web3TradingShell);
    } catch {
      setError("The expert diagnostics view could not be loaded.");
    } finally {
      setLoadingDiagnostics(false);
    }
  }

  async function submitTradingRequest(
    busy: QuickBusyState,
    body: Record<string, unknown>,
    fallbackError: string,
  ) {
    if (!state || quickBusy) return;
    const previousState = state;
    setQuickBusy(busy);
    setQuickNotice(busy === "loop" ? "Asking the backend loop throttle for the next autonomous paper step." : busy === "session" ? "Running a bounded autonomous paper cycle." : busy === "minute" ? "Running the next-minute high-frequency paper plan." : busy === "source" ? "Switching the read-only market feed." : busy === "reset" ? "Resetting the local paper account." : busy === "chart" ? "Recording fresh chart proof for the autonomous candle gate." : busy === "route" ? "Refreshing read-only route proof for the selected paper action." : busy === "route-repair" ? "Route quote is blocked; repairing the read-only market and route evidence first." : "Refreshing the autonomous market read.");
    try {
      const response = await fetch("/api/web3-trading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as Web3TradingState | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : fallbackError);
      }
      setState(payload);
      setLastActionOutcome(buildQuickAgentActionOutcome(busy, previousState, payload));
      if (busy === "loop") {
        setQuickNotice(payload.autonomous_loop_tick.summary);
      } else if (busy === "session" || busy === "minute") {
        setQuickNotice(payload.autonomous_session_run.summary);
      } else if (busy === "source") {
        setQuickNotice(payload.market_source.status === "live" ? "Live DEX read is loaded in read-only mode." : payload.market_source.detail);
      } else if (busy === "reset") {
        setQuickNotice("Paper account reset; the agent is ready to rehearse again.");
      } else if (busy === "chart") {
        setQuickNotice(payload.autonomous_candle_refresh.summary);
      } else if (busy === "route" || busy === "route-repair") {
        setQuickNotice(payload.autonomous_route_refresh_execution.next_action);
      } else {
        setQuickNotice(payload.autonomous_market_evidence_fusion.next_action);
      }
    } catch (reason: unknown) {
      setQuickNotice(reason instanceof Error ? reason.message : fallbackError);
    } finally {
      setQuickBusy(null);
    }
  }

  function refreshRead() {
    if (!state) return;
    void submitTradingRequest("refresh", {
      scenario: state.scenario,
      cycles: state.paper_account.cycle,
      source: state.market_source.mode,
      account: state.paper_account.mode,
      advance: false,
    }, "The autonomous market read could not be refreshed.");
  }

  function switchSource(nextSource: TradingMarketSource) {
    if (!state) return;
    void submitTradingRequest("source", {
      scenario: state.scenario,
      cycles: state.paper_account.cycle,
      source: nextSource,
      account: state.paper_account.mode,
      advance: false,
    }, "The read-only market feed could not be switched.");
  }

  async function runAutonomousLoopTick() {
    if (!state || quickBusy) return;
    const previousState = state;
    const chartProofRequired = shouldRecordChartProof(state);
    setQuickBusy("loop");
    setQuickNotice(chartProofRequired
      ? "Refreshing chart proof, then asking the backend loop to decide the next local paper action."
      : "Asking the backend loop throttle for the next autonomous paper step.");
    try {
      const candleRefresh = chartProofRequired ? await buildChartProofRecord(state) : undefined;
      const response = await fetch("/api/web3-trading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenario: state.scenario,
          cycles: state.paper_account.cycle,
          source: state.market_source.mode,
          account: state.paper_account.mode,
          autonomous_loop: {
            action: "tick",
          },
          ...(candleRefresh ? { candle_refresh: candleRefresh } : {}),
        }),
      });
      const payload = (await response.json()) as Web3TradingState | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "The autonomous loop tick could not run.");
      }
      setState(payload);
      setLastActionOutcome(buildQuickAgentActionOutcome("loop", previousState, payload));
      setQuickNotice(chartProofRequired
        ? `Chart proof refreshed; ${payload.autonomous_loop_tick.summary}`
        : payload.autonomous_loop_tick.summary);
    } catch (reason: unknown) {
      setQuickNotice(reason instanceof Error ? reason.message : "The autonomous loop tick could not run.");
    } finally {
      setQuickBusy(null);
    }
  }

  async function recordChartProof() {
    if (!state || quickBusy) return;
    const previousState = state;
    setQuickBusy("chart");
    setQuickNotice("Refreshing chart proof for the current autonomous target.");
    try {
      const candleRefresh = await buildChartProofRecord(state);
      const response = await fetch("/api/web3-trading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenario: state.scenario,
          cycles: state.paper_account.cycle,
          source: state.market_source.mode,
          account: state.paper_account.mode,
          advance: false,
          candle_refresh: candleRefresh,
        }),
      });
      const payload = (await response.json()) as Web3TradingState | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "The chart proof could not be recorded.");
      }
      setState(payload);
      setLastActionOutcome(buildQuickAgentActionOutcome("chart", previousState, payload));
      setQuickNotice(payload.autonomous_candle_refresh.next_action);
    } catch (reason: unknown) {
      setQuickNotice(reason instanceof Error ? reason.message : "The chart proof could not be recorded.");
    } finally {
      setQuickBusy(null);
    }
  }

  function runQuickSession(mode: "cycle" | "minute" = "cycle") {
    if (!state) return;
    const planner = state.autonomous_session_planner;
    const throttle = state.autonomous_loop_throttle;
    const policy = state.autonomous_policy_optimizer;
    const tickGovernor = state.autonomous_tick_governor;
    const profitVelocity = state.autonomous_profit_velocity_governor;
    const tickPlan = state.autonomous_tick_plan;
    const baseTicks = throttle.ticks || planner.planned_ticks || policy.recommended_session_ticks || 1;
    const minuteTicks = Math.max(
      baseTicks,
      profitVelocity.max_trades_next_minute,
      tickPlan.max_actions_next_minute,
      tickPlan.bundle_action_count,
      Math.ceil(60 / Math.max(1, tickGovernor.next_tick_seconds)),
    );
    const ticks = mode === "minute"
      ? Math.max(4, Math.min(12, minuteTicks))
      : Math.max(1, Math.min(12, baseTicks));
    const baseFillCap = throttle.max_total_fills || planner.max_total_fills || policy.max_trades_next_session || tickGovernor.max_paper_trades || 1;
    const minuteFillCap = profitVelocity.loop_permission === "multi-fill"
      ? Math.max(2, Math.max(baseFillCap, profitVelocity.max_trades_next_minute, tickPlan.bundle_trade_count, tickGovernor.max_paper_trades))
      : profitVelocity.loop_permission === "single-fill" || profitVelocity.loop_permission === "protect-only"
        ? Math.max(1, Math.min(
          profitVelocity.max_trades_next_minute || 1,
          tickPlan.bundle_trade_count || profitVelocity.max_trades_next_minute || 1,
          tickGovernor.max_paper_trades || profitVelocity.max_trades_next_minute || 1,
        ))
        : Math.max(1, baseFillCap);
    const maxTotalFills = mode === "minute"
      ? Math.max(1, Math.min(24, minuteFillCap))
      : Math.max(1, Math.min(24, baseFillCap));
    const maxProtectiveSells = mode === "minute"
      ? Math.max(2, Math.min(6, throttle.max_protective_sells || planner.max_protective_sells || 4))
      : Math.max(1, Math.min(6, throttle.max_protective_sells || planner.max_protective_sells || 3));
    const minReleaseUsd = mode === "minute"
      ? Math.max(25, Math.min(10_000, throttle.release_budget_usd || planner.release_budget_usd || 50))
      : Math.max(10, Math.min(10_000, throttle.release_budget_usd || planner.release_budget_usd || 25));
    void submitTradingRequest(mode === "minute" ? "minute" : "session", {
      scenario: state.scenario,
      cycles: state.paper_account.cycle,
      source: state.market_source.mode,
      account: state.paper_account.mode,
      advance: true,
      daemon: true,
      autonomous_session: {
        action: "run",
        policy_mode: "auto",
        ticks,
        protect_book: profitVelocity.loop_permission === "protect-only" || throttle.action === "protect-book" || tickGovernor.should_protect_first || planner.session_kind === "protect" || policy.protect_book,
        max_protective_sells: maxProtectiveSells,
        min_release_usd: minReleaseUsd,
        max_total_fills: maxTotalFills,
      },
    }, mode === "minute" ? "The next-minute autonomous paper loop could not run." : "The autonomous paper cycle could not run.");
  }

  function runNowDecision() {
    if (!state || quickBusy) return;
    const decision = state.autonomous_now_decision;
    const routeRefresh = state.autonomous_route_refresh_execution;
    if (decision.action === "stand-down") {
      setQuickNotice(decision.next_action);
      setLastActionOutcome(buildQuickAgentActionOutcome("stand-down", state, state, decision.next_action));
      return;
    }
    if (decision.action === "refresh-route" || decision.route_refresh_required) {
      const routeRepairSource: TradingMarketSource = state.market_source.mode === "sample" ? "live-dex" : state.market_source.mode;
      if (routeRefresh.can_request_readonly_quote) {
        void submitTradingRequest("route", {
          scenario: state.scenario,
          cycles: state.paper_account.cycle,
          source: state.market_source.mode,
          account: state.paper_account.mode,
          advance: false,
          route_refresh: {
            action: "request-quote",
          },
        }, "The read-only route proof could not be refreshed.");
        return;
      }
      if (routeRefresh.status === "idle" && !routeRefresh.route_refresh_required && !routeRefresh.selected_lane && state.market_source.mode !== "sample") {
        refreshRead();
        return;
      }
      void submitTradingRequest("route-repair", {
        scenario: state.scenario,
        cycles: state.paper_account.cycle,
        source: routeRepairSource,
        account: state.paper_account.mode,
        advance: false,
      }, "The read-only route repair could not run.");
      return;
    }
    if (decision.chart_proof_required || decision.action === "refresh-candles") {
      void runAutonomousLoopTick();
      return;
    }
    if (decision.button_label === "Run minute") {
      runQuickSession("minute");
      return;
    }
    if (decision.action === "watch" && !decision.can_auto_watch_run) {
      refreshRead();
      return;
    }
    void runAutonomousLoopTick();
  }

  function toggleAutoWatch() {
    setAutoWatch((enabled) => {
      const next = !enabled;
      const autoPlan = state ? chooseAutoWatchPlan(state) : null;
      setAutoWatchPrimed(false);
      setQuickNotice(next ? `Auto watch is scheduling ${autoPlan?.label ?? "bounded local paper cycles"} through smart backend ticks while this page stays open.` : "Auto watch is paused.");
      return next;
    });
  }

  function resetPaper() {
    if (!state) return;
    void submitTradingRequest("reset", {
      scenario: state.scenario,
      cycles: 0,
      source: state.market_source.mode,
      account: state.paper_account.mode,
      reset: state.paper_account.mode === "persistent",
      advance: false,
    }, "The local paper account could not be reset.");
  }

  useEffect(() => {
    if (!autoWatch || !state || quickBusy) return;
    if (state.paper_account.cycle >= 24) {
      setAutoWatch(false);
      setAutoWatchPrimed(false);
      setQuickNotice("Auto watch paused at the 24-cycle review cap. Reset paper to rehearse another local run.");
      return;
    }
    const autoPlan = chooseAutoWatchPlan(state);
    if (autoWatchPrimed && autoPlan.mode !== "minute" && autoPlan.mode !== "refresh" && !state.autonomous_loop_throttle.can_run && state.autonomous_loop_throttle.status !== "refresh") {
      setAutoWatch(false);
      setAutoWatchPrimed(false);
      setQuickNotice(`Auto watch paused: ${state.autonomous_loop_throttle.next_action}`);
      return;
    }
    const timer = window.setTimeout(() => {
      if (!autoWatchPrimed) setAutoWatchPrimed(true);
      if (autoPlan.mode === "refresh" && shouldRecordChartProof(state)) {
        runAutonomousLoopTick();
      } else if (autoPlan.mode === "refresh") {
        refreshRead();
      } else {
        runAutonomousLoopTick();
      }
    }, autoWatchPrimed ? autoPlan.delayMs : 1_000);
    return () => window.clearTimeout(timer);
  }, [autoWatch, autoWatchPrimed, quickBusy, state]);

  if (error) {
    return (
      <div className="rounded-md border border-critical/40 bg-critical/10 p-4 text-sm leading-6 text-critical">
        {error}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm leading-6 text-on-surface-variant">
        Loading autonomous trading state...
      </div>
    );
  }

  const nextSource: TradingMarketSource = state.market_source.mode === "live-dex" ? "sample" : "live-dex";
  const tradeBlocked = state.autonomous_market_evidence_fusion.status === "blocked" ||
    state.autonomous_profit_run_guard.status === "blocked" ||
    state.autonomous_session_planner.status === "blocked";
  const quickDisabled = Boolean(quickBusy);
  const sessionRun = state.autonomous_session_run;
  const wallet = state.autonomous_wallet_telemetry;
  const loopThrottle = state.autonomous_loop_throttle;
  const loopFeedback = state.autonomous_loop_feedback;
  const loopTick = state.autonomous_loop_tick;
  const candleRefresh = state.autonomous_candle_refresh;
  const nowDecision = state.autonomous_now_decision;
  const executionRunway = state.autonomous_execution_runway;
  const profitObjective = state.autonomous_profit_objective;
  const profitControl = state.autonomous_profit_control;
  const profitAllocation = state.autonomous_profit_allocation_plan;
  const dailyProfitLock = state.autonomous_daily_profit_lock;
  const sizeGovernor = state.autonomous_size_governor;
  const commandCenter = state.autonomous_command_center;
  const commandExecution = state.autonomous_command_center_execution;
  const tradeMission = state.autonomous_trade_mission;
  const tradeReadinessGate = state.autonomous_trade_readiness_gate;
  const capitalAllocator = state.autonomous_capital_allocator;
  const tradeBatch = state.autonomous_trade_batch;
  const profitForecast = state.autonomous_profit_forecast;
  const profitVelocity = state.autonomous_profit_velocity_governor;
  const profitCaptureAutopilot = state.autonomous_profit_capture_autopilot;
  const profitRedeployAutopilot = state.autonomous_profit_redeploy_autopilot;
  const profitRedeployExecution = state.autonomous_profit_redeploy_execution;
  const tickPlan = state.autonomous_tick_plan;
  const tickGovernor = state.autonomous_tick_governor;
  const actionQueue = state.autonomous_action_queue;
  const actionQueueExecution = state.autonomous_action_queue_execution;
  const wakePlan = state.autonomous_wake_plan;
  const loopImpact = state.autonomous_loop_impact_auditor;
  const scalpExit = state.autonomous_scalp_exit_autopilot;
  const exitLadder = state.position_exit_ladder;
  const trapRadar = state.autonomous_trap_radar;
  const tokenSafety = state.autonomous_token_safety_clearance;
  const tradeability = state.autonomous_tradeability_simulator;
  const executionAdapter = state.autonomous_execution_adapter_readiness;
  const marketIngestion = state.market_ingestion_plan;
  const marketIntake = state.autonomous_market_intake_plan;
  const sprintTapeItems = state.autonomous_market_evidence_fusion.items.slice(0, 2);
  const holdingSentryItems = state.autonomous_portfolio_mark_board.items.slice(0, 2);
  const priceActionItems = buildQuickPriceActionTape(state);
  const autoWatchPlan = chooseAutoWatchPlan(state);
  const nextMoves = buildAutonomousNextMoves(state);
  const focusModes: Array<{ id: OperatorFocusMode; label: string; stat: string; tone: string }> = [
    { id: "cockpit", label: "Copilot", stat: formatCompactCurrency(wallet.equity_usd), tone: wallet.window_pnl_usd >= 0 ? "text-engine" : "text-critical" },
    { id: "market", label: "Market", stat: `${state.autonomous_market_evidence_fusion.max_next_fills} fills`, tone: state.autonomous_market_evidence_fusion.can_trade ? "text-engine" : "text-caution" },
    { id: "portfolio", label: "Portfolio", stat: `${state.autonomous_portfolio_mark_board.held_count} held`, tone: state.autonomous_portfolio_mark_board.release_pressure_usd > 0 ? "text-caution" : "text-engine" },
    { id: "wiring", label: "Wiring", stat: state.execution_gate.live_execution_enabled ? "live" : "paper", tone: state.execution_gate.live_execution_enabled ? "text-engine" : "text-outline" },
  ];
  const compactWiredPaths = [
    {
      label: "Paper wallet",
      value: `${state.paper_account.trade_count} fills`,
      tone: state.paper_account.trade_count > 0 ? "text-engine" : "text-outline",
    },
    {
      label: "DEX read",
      value: state.market_source.status === "live" ? "live" : "sample",
      tone: state.market_source.status === "live" ? "text-engine" : "text-demo",
    },
    {
      label: "Route proof",
      value: state.autonomous_route_refresh_execution.status.replace("-", " "),
      tone: state.autonomous_route_refresh_execution.status === "ready" ? "text-engine" : state.autonomous_route_refresh_execution.status === "blocked" ? "text-critical" : "text-caution",
    },
    {
      label: "Candle proof",
      value: candleRefresh.requested ? candleRefresh.status : "waiting",
      tone: candleRefresh.status === "ready" ? "text-engine" : candleRefresh.status === "blocked" ? "text-critical" : "text-caution",
    },
    {
      label: "Live swaps",
      value: state.execution_gate.live_execution_enabled ? "armed" : "locked",
      tone: state.execution_gate.live_execution_enabled ? "text-engine" : "text-outline",
    },
  ];
  const compactAuthorityPath = [
    {
      label: "Scheduler",
      value: autoWatch ? "watch on" : autoWatchPlan.label,
      tone: autoWatch ? "text-engine" : "text-outline",
    },
    {
      label: "Impact",
      value: loopImpact.status.replace("-", " "),
      tone: loopImpact.status === "compound" || loopImpact.status === "continue"
        ? "text-engine"
        : loopImpact.status === "blocked" || loopImpact.status === "cooldown"
          ? "text-critical"
          : loopImpact.status === "idle"
            ? "text-outline"
            : "text-caution",
    },
    {
      label: "Capture",
      value: profitCaptureAutopilot.status.replace("-", " "),
      tone: profitCaptureAutopilot.status === "race" || profitCaptureAutopilot.status === "trim" || profitCaptureAutopilot.status === "harvest"
        ? "text-caution"
        : profitCaptureAutopilot.status === "press"
          ? "text-engine"
          : profitCaptureAutopilot.status === "blocked"
            ? "text-critical"
            : "text-outline",
    },
    {
      label: "Redeploy",
      value: profitRedeployAutopilot.status.replace("-", " "),
      tone: profitRedeployAutopilot.status === "redeploy" || profitRedeployAutopilot.status === "probe"
        ? "text-engine"
        : profitRedeployAutopilot.status === "wait-proof" || profitRedeployAutopilot.status === "protect-first"
          ? "text-caution"
          : profitRedeployAutopilot.status === "blocked" || profitRedeployAutopilot.status === "cooldown"
            ? "text-critical"
            : "text-outline",
    },
    {
      label: "Redeploy exec",
      value: profitRedeployExecution.status.replace("-", " "),
      tone: profitRedeployExecution.status === "queued" || profitRedeployExecution.status === "applied"
        ? "text-engine"
        : profitRedeployExecution.status === "wait-proof" || profitRedeployExecution.status === "protect-first"
          ? "text-caution"
          : profitRedeployExecution.status === "blocked" || profitRedeployExecution.status === "cooldown"
            ? "text-critical"
            : "text-outline",
    },
    {
      label: "Refresh",
      value: wakePlan.should_refresh_first || autoWatchPlan.mode === "refresh" ? "first" : "current",
      tone: wakePlan.should_refresh_first || autoWatchPlan.mode === "refresh" ? "text-caution" : "text-engine",
    },
    {
      label: "Backend tick",
      value: loopTick.status.replace("-", " "),
      tone: loopTick.status === "session-run" ? "text-engine" : loopTick.status === "stand-down" ? "text-caution" : "text-outline",
    },
    {
      label: "Paper ledger",
      value: sessionRun.requested ? `${sessionRun.fill_count} fills` : `${state.paper_account.trade_count} fills`,
      tone: sessionRun.requested || state.paper_account.trade_count > 0 ? "text-engine" : "text-outline",
    },
    {
      label: "Live boundary",
      value: state.execution_gate.live_execution_enabled ? "armed" : "locked",
      tone: state.execution_gate.live_execution_enabled ? "text-critical" : "text-demo",
    },
  ];

  return (
    <div className="w-full max-w-full overflow-hidden rounded-md border border-outline-variant/35 bg-void/30 p-2 sm:p-3">
      <div className="rounded-md border border-engine/25 bg-engine/[0.045] p-2 sm:p-3" aria-label="Quick autonomous controls">
        <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Quick autonomous controls</p>
            <h2 className="mt-1 break-words text-sm font-semibold text-on-surface">
              Copilot + Autonomous trading cockpit
            </h2>
            <p className="mt-1 break-words text-sm font-semibold text-on-surface">
              {state.autonomous_market_evidence_fusion.leader_symbol ?? "Desk"} · {state.autonomous_market_evidence_fusion.leader_action?.replace("-", " ") ?? state.autonomous_market_evidence_fusion.status}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
              {quickNotice}
            </p>
          </div>
          <div className="hidden flex-wrap gap-2 sm:flex">
            <Chip tone={state.market_source.status === "live" ? "engine" : "demo"}>{state.market_source.label}</Chip>
            <Chip tone={state.autonomous_market_evidence_fusion.can_trade ? "engine" : tradeBlocked ? "critical" : "caution"}>
              {state.autonomous_market_evidence_fusion.can_trade ? "fused trade ok" : tradeBlocked ? "trade blocked · cycle can run" : "refresh first"}
            </Chip>
            <Chip tone={autoWatch ? "engine" : "neutral"}>{autoWatch ? "auto watch on" : "auto watch off"}</Chip>
            <Chip tone={!autoWatchPrimed && autoWatch ? "caution" : autoWatchPlan.mode === "sprint" || autoWatchPlan.mode === "minute" ? "engine" : "caution"}>
              {!autoWatchPrimed && autoWatch ? "auto refresh" : autoWatchPlan.label}
            </Chip>
            <Chip tone={loopImpactTone(loopImpact.status)}>
              impact {loopImpact.status.replace("-", " ")}
            </Chip>
            <Chip tone={profitCaptureAutopilotTone(profitCaptureAutopilot.status)}>
              capture {profitCaptureAutopilot.status.replace("-", " ")}
            </Chip>
            <Chip tone={profitRedeployAutopilotTone(profitRedeployAutopilot.status)}>
              redeploy {profitRedeployAutopilot.status.replace("-", " ")}
            </Chip>
            <Chip tone={wakePlan.can_auto_watch_run ? wakePlan.status === "minute" || wakePlan.status === "sprint" ? "engine" : "caution" : "critical"}>
              {wakePlan.auto_watch_label}
            </Chip>
            <Chip tone={marketIntake.can_feed_trade_loop ? "engine" : marketIntake.status === "blocked" ? "critical" : "caution"}>
              intake {marketIntake.status}
            </Chip>
            <Chip tone={profitAllocation.can_deploy ? "engine" : profitAllocation.should_release_first ? "caution" : profitAllocation.status === "cooldown" ? "critical" : "neutral"}>
              allocator {profitAllocation.status}
            </Chip>
            <Chip tone={loopThrottle.can_run ? "engine" : loopThrottle.status === "blocked" ? "critical" : "caution"}>
              {loopThrottle.status.replace("-", " ")}
            </Chip>
          </div>
        </div>
        <p className="mt-2 truncate font-mono text-[10px] uppercase tracking-telemetry text-outline sm:hidden">
          {state.market_source.label} · {state.autonomous_market_evidence_fusion.can_trade ? "trade ok" : tradeBlocked ? "trade blocked" : "refresh"} · {autoWatch ? "watch on" : "watch off"} · {wakePlan.auto_watch_label} · intake {marketIntake.status} · allocator {profitAllocation.status}
        </p>

        <QuickTradingCommandDeck
          state={state}
          autoWatch={autoWatch}
          autoWatchPlan={autoWatchPlan}
          decision={nowDecision}
          lastActionOutcome={lastActionOutcome}
          busy={quickBusy}
          onPrimaryAction={runNowDecision}
        />

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          <button
            type="button"
            onClick={refreshRead}
            disabled={quickDisabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-outline-variant/50 bg-void/25 px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-on-surface transition hover:border-engine/50 hover:text-engine disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {quickBusy === "refresh" ? "Refreshing" : "Refresh read"}
          </button>
          <button
            type="button"
            onClick={() => void recordChartProof()}
            disabled={quickDisabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-outline-variant/50 bg-void/25 px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-on-surface transition hover:border-caution/50 hover:text-caution disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CandlestickChart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {quickBusy === "chart" ? "Checking" : "Chart proof"}
          </button>
          <button
            type="button"
            onClick={() => switchSource(nextSource)}
            disabled={quickDisabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-outline-variant/50 bg-void/25 px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-on-surface transition hover:border-engine/50 hover:text-engine disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {quickBusy === "source" ? "Switching" : nextSource === "live-dex" ? "Live DEX read" : "Sample read"}
          </button>
          <button
            type="button"
            onClick={runAutonomousLoopTick}
            disabled={quickDisabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-engine/45 bg-engine/10 px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-engine transition hover:bg-engine/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {quickBusy === "loop" ? "Running" : shouldRecordChartProof(state) ? "Proof + tick" : "Run tick"}
          </button>
          <button
            type="button"
            onClick={() => runQuickSession("minute")}
            disabled={quickDisabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-engine/45 bg-engine/15 px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-engine transition hover:bg-engine/20 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <LineChart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {quickBusy === "minute" ? "Running" : "Run minute"}
          </button>
          <button
            type="button"
            onClick={toggleAutoWatch}
            disabled={quickDisabled && !autoWatch}
            aria-pressed={autoWatch}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-engine/35 bg-engine/[0.07] px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-engine transition hover:bg-engine/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            {autoWatch ? <Pause className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {autoWatch ? "Pause watch" : "Auto watch"}
          </button>
          <button
            type="button"
            onClick={resetPaper}
            disabled={quickDisabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-caution/40 bg-caution/10 px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-caution transition hover:bg-caution/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {quickBusy === "reset" ? "Resetting" : "Reset paper"}
          </button>
        </div>

        {sessionRun.requested ? (
          <p className="mt-3 line-clamp-2 border-t border-outline-variant/25 pt-3 text-xs leading-5 text-on-surface-variant">
            Last bounded cycle: {sessionRun.summary} Next: {sessionRun.next_action}
          </p>
        ) : null}

        <p className="mt-2 text-xs leading-5 text-outline">
          Auto decision: {!autoWatchPrimed && autoWatch ? `Refresh ${state.market_source.label} before the backend loop tick chooses the next local paper action.` : autoWatchPlan.reason}
        </p>
        <p className="mt-1 text-xs leading-5 text-outline">
          Impact gate: {loopImpact.summary} Source refresh: {state.market_source.label} read refreshes first; smart ticks can attach chart proof before the backend loop owns trade and protect actions.
        </p>
        <span className="sr-only" aria-label="Autonomous chart proof action receipt">
          Chart proof records read-only OHLCV or sample price-action evidence into the autonomous candle memory. Auto watch and Proof plus tick can use it when the freshness gate asks for candle evidence; it cannot sign, submit, custody funds, or guarantee profit.
        </span>
        <span className="sr-only" aria-label="Autonomous smart tick receipt">
          Proof plus tick refreshes the chart gate when needed, sends that receipt with the backend autonomous loop tick, then lets the server choose refresh, paper fill, protect, cooldown, or stand down. Live signing remains locked.
        </span>
        <span className="sr-only" aria-label="Auto watch smart tick receipt">
          Auto watch uses the same Proof plus tick path for candle-gate refresh wakes, then lets loop impact choose whether to continue, tighten, protect, harvest, refresh, cool down, or block the next backend tick. Current impact status {loopImpact.status}; impact action {loopImpact.action}; impact score {loopImpact.impact_score}; next cadence {loopImpact.next_cadence_seconds} seconds.
        </span>

        <section className="mt-2 rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:mt-3 sm:p-3" aria-label="Web3 operator focus deck">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" role="tablist" aria-label="Trading cockpit view">
            {focusModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={focusMode === mode.id}
                onClick={() => setFocusMode(mode.id)}
                className={cn(
                  "min-w-0 rounded-md border px-2 py-2 text-left transition",
                  focusMode === mode.id
                    ? "border-engine/45 bg-engine/10"
                    : "border-outline-variant/25 bg-surface-dim/15 hover:border-engine/35",
                )}
              >
                <span className="block truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{mode.label}</span>
                <span className={cn("mt-1 block truncate text-sm font-semibold", mode.tone)}>{mode.stat}</span>
              </button>
            ))}
          </div>

          {focusMode === "cockpit" ? (
            <QuickAutopilotMissionPanel
              state={state}
              autoWatch={autoWatch}
              autoWatchPlan={autoWatchPlan}
            />
          ) : null}

          {focusMode === "portfolio" ? (
            <div className="mt-2 grid gap-2" aria-label="Autonomous portfolio focus">
              <section className="min-w-0 rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:p-3" aria-label="Holding sentry">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Holding sentry</p>
                    <p className="mt-1 truncate text-sm font-semibold text-on-surface">Portfolio pressure</p>
                  </div>
                  <Chip tone={state.autonomous_portfolio_mark_board.release_pressure_usd > 0 ? "caution" : "engine"}>
                    {formatCurrency(state.autonomous_portfolio_mark_board.release_pressure_usd)} release
                  </Chip>
                </div>
                <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <QuickSmartExitPressureChart markBoard={state.autonomous_portfolio_mark_board} scalpExit={scalpExit} exitLadder={exitLadder} />
                  <div className="space-y-2">
                    {holdingSentryItems.length > 0 ? holdingSentryItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-on-surface">{item.symbol}</p>
                          <p className={cn("mt-0.5 truncate font-mono text-[10px] uppercase tracking-telemetry", markActionToneClass(item.action))}>
                            {item.action.replace("-", " ")} · {item.status}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-mono text-xs font-semibold", item.unrealized_pnl_usd >= 0 ? "text-engine" : "text-critical")}>{formatSignedCurrency(item.unrealized_pnl_usd)}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-outline">{formatPercent(item.pnl_pct)}</p>
                        </div>
                      </div>
                    )) : (
                      <p className="rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2 text-xs leading-5 text-on-surface-variant">
                        No open paper positions; the agent is waiting for a qualified entry.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {focusMode === "portfolio" ? (
            <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]" aria-label="Autonomous profit focus">
              <div className="xl:col-span-2">
                <QuickFillLearningLedger
                  digest={state.autonomous_fill_ledger_digest}
                  attribution={state.autonomous_strategy_attribution}
                  outcomeMemory={state.autonomous_outcome_memory_governor}
                />
              </div>
              <QuickProfitObjectiveDashboard
                objective={profitObjective}
                control={profitControl}
                dailyLock={dailyProfitLock}
                wallet={wallet}
                sessionRun={sessionRun}
              />
              <QuickProfitAllocationPlan plan={profitAllocation} />
              <QuickAutonomousNextMoves items={nextMoves} state={state} />
              <div className="xl:col-span-2">
                <QuickExecutionRunway runway={executionRunway} />
              </div>
            </div>
          ) : null}

          {focusMode === "market" ? (
              <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Autonomous market focus">
                <div className="xl:col-span-2">
                  <QuickSituationChangeTape memory={state.tape_memory} situation={state.situation_monitor} />
                </div>
                <QuickMarketIntakePlanner plan={marketIntake} />
                <QuickPriceActionTapeChart items={priceActionItems} />
                <div className="xl:col-span-2">
                  <QuickTrapClearanceBoard
                    trapRadar={trapRadar}
                    tokenSafety={tokenSafety}
                    tradeability={tradeability}
                  />
                </div>
                <section className="min-w-0 rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:p-3" aria-label="Autonomous sprint tape">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous sprint tape</p>
                    <p className="mt-1 truncate text-sm font-semibold text-on-surface">Hot candidates</p>
                  </div>
                  <Chip tone={state.autonomous_market_evidence_fusion.can_trade ? "engine" : "caution"}>
                    {state.autonomous_market_evidence_fusion.max_next_fills} fills
                  </Chip>
                </div>
                <div className="mt-2 space-y-2">
                  {sprintTapeItems.length > 0 ? sprintTapeItems.map((item) => (
                    <div key={item.token_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-on-surface">{item.symbol}</p>
                        <p className={cn("mt-0.5 truncate font-mono text-[10px] uppercase tracking-telemetry", actionToneClass(item.action))}>
                          {item.action.replace("-", " ")} · {item.lane.replace("-", " ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xs font-semibold text-on-surface">{item.fusion_score}/100</p>
                        <p className="mt-0.5 font-mono text-[10px] text-outline">{formatCurrency(item.max_paper_size_usd)}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2 text-xs leading-5 text-on-surface-variant">
                      No fused candidates are ready; refresh the market read.
                    </p>
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {focusMode === "wiring" ? (
            <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Autonomous wiring focus">
              <QuickExecutionReadinessBridge
                adapter={executionAdapter}
                ingestion={marketIngestion}
                liveExecutionEnabled={state.execution_gate.live_execution_enabled}
              />
              <QuickExecutionRunway runway={executionRunway} />
              <div className="xl:col-span-2">
                <QuickActionQueueCockpit queue={actionQueue} execution={actionQueueExecution} />
              </div>
            </div>
          ) : null}

          <span className="sr-only" aria-label="Web3 operator focus deck receipt">
            Focus deck active {focusMode}; wallet equity {formatCurrency(wallet.equity_usd)}, command readiness {tradeReadinessGate.status}, launch timing {tradeReadinessGate.launch_timing_status}, market leader {state.autonomous_market_evidence_fusion.leader_symbol ?? "none"}, action queue leader {actionQueue.leader_symbol ?? "none"}.
          </span>
          <span className="sr-only" aria-label="Auto watch backend authority receipt">
            Auto watch schedules refreshes or backend autonomous loop ticks only. Manual Run minute can still rehearse a bounded next-minute paper session, but browser Auto watch does not rebuild trade sizing locally.
          </span>
          <span className="sr-only" aria-label="Autonomous market intake plan receipt">
            Market intake plan {marketIntake.status}; next lane {marketIntake.next_lane}; provider {marketIntake.next_provider}; endpoint {marketIntake.next_endpoint}; next request {marketIntake.next_request_seconds} seconds; budget {marketIntake.provider_budget_status} at {marketIntake.provider_budget_utilization_pct} percent; can feed loop {marketIntake.can_feed_trade_loop ? "yes" : "no"}; route refresh first {marketIntake.route_refresh_first ? "yes" : "no"}; wallet mark required {marketIntake.wallet_mark_required ? "yes" : "no"}.
          </span>
          <span className="sr-only" aria-label="Autonomous profit allocation receipt">
            Profit allocator {profitAllocation.status}; selected lane {profitAllocation.selected_lane ?? "none"}; suppressed lane {profitAllocation.suppressed_lane ?? "none"}; deploy {formatCurrency(profitAllocation.deploy_budget_usd)}; release {formatCurrency(profitAllocation.release_budget_usd)}; max trade {formatCurrency(profitAllocation.max_trade_usd)}; multiplier {profitAllocation.size_multiplier}x; cadence {profitAllocation.cadence_seconds} seconds; expected edge {formatSignedCurrency(profitAllocation.expected_edge_usd)}; can deploy {profitAllocation.can_deploy ? "yes" : "no"}; release first {profitAllocation.should_release_first ? "yes" : "no"}.
          </span>
        </section>

      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/15 p-2 sm:p-3" aria-label="Advanced workbench drawer">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Advanced workbench</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface" aria-label="Advanced workbench status">
            Optional deep controls stay collapsed · {state.autonomous_order_ticket.symbol ?? state.autonomous_action_queue.leader_symbol ?? "Desk"} {state.autonomous_order_ticket.status.replace("-", " ")}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-outline">
            Copilot is the primary trading surface. Open this only for the long-form paper ticket, legacy controls, or expert receipt audit.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={state.autonomous_order_ticket.can_auto_paper ? "engine" : state.autonomous_order_ticket.status === "blocked" ? "critical" : "caution"}>
            {state.autonomous_order_ticket.execution_boundary.replaceAll("-", " ")}
          </Chip>
          <button
            type="button"
            onClick={openControls}
            className="inline-flex min-h-11 items-center rounded-md border border-outline-variant/50 px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-on-surface transition hover:border-engine/50 hover:text-engine"
          >
            {controlsOpen ? "Workbench open" : "Open workbench"}
          </button>
          <button
            type="button"
            onClick={openDiagnostics}
            className="inline-flex min-h-11 items-center rounded-md border border-outline-variant/50 px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-on-surface transition hover:border-caution/50 hover:text-caution"
          >
            {diagnosticsOpen ? "Receipts open" : "Expert receipts"}
          </button>
        </div>
      </div>
        <span className="sr-only" aria-label="Advanced workbench collapsed receipt">
          The compact Copilot, Market, Portfolio, and Wiring focus deck is the primary Web3 trading flow. The legacy long controls and expert diagnostics are lazy-loaded only after the operator opens the advanced workbench or expert receipts.
        </span>
      </div>

      {controlsOpen && loadingControls ? (
        <div className="mt-3 rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm leading-6 text-on-surface-variant">
          Loading advanced workbench...
        </div>
      ) : null}

      {controlsOpen && WorkspaceComponent ? (
        <div className="mt-3">
          <WorkspaceComponent initialState={state} />
        </div>
      ) : null}

      {diagnosticsOpen && loadingDiagnostics ? (
        <div className="mt-3 rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 text-sm leading-6 text-on-surface-variant">
          Loading expert receipts...
        </div>
      ) : null}

      {diagnosticsOpen && DiagnosticsComponent ? (
        <div className="mt-3" aria-label="Expert diagnostics panel">
          <DiagnosticsComponent state={state} />
        </div>
      ) : null}
    </div>
  );
}

type AutoWatchPlan = ReturnType<typeof chooseAutoWatchPlan>;

function QuickTradingCommandDeck({
  state,
  autoWatch,
  autoWatchPlan,
  decision,
  lastActionOutcome,
  busy,
  onPrimaryAction,
}: {
  state: Web3TradingState;
  autoWatch: boolean;
  autoWatchPlan: AutoWatchPlan;
  decision: Web3TradingState["autonomous_now_decision"];
  lastActionOutcome: QuickAgentActionOutcome | null;
  busy: QuickBusyState | null;
  onPrimaryAction: () => void;
}) {
  const wallet = state.autonomous_wallet_telemetry;
  const sessionRun = state.autonomous_session_run;
  const fusion = state.autonomous_market_evidence_fusion;
  const sourceQuality = state.autonomous_source_quality_oracle;
  const thesis = state.autonomous_profit_thesis_verifier;
  const capitalCommand = state.autonomous_capital_command;
  const fillLedger = state.autonomous_fill_ledger_digest;
  const forwardPermission = state.autonomous_forward_loop_permission;
  const loopImpact = state.autonomous_loop_impact_auditor;
  const minuteDiscipline = state.autonomous_minute_profit_discipline;
  const profitCaptureAutopilot = state.autonomous_profit_capture_autopilot;
  const profitRedeployAutopilot = state.autonomous_profit_redeploy_autopilot;
  const discoveryDelta = state.live_discovery_delta_tape;
  const ranker = state.autonomous_opportunity_ranker;
  const positionBoard = state.autonomous_portfolio_mark_board;
  const situation = state.autonomous_position_situation_board;
  const execution = state.autonomous_execution_runway;
  const route = state.autonomous_route_refresh_execution;
  const outcome = lastActionOutcome ?? buildQuickAgentWaitingOutcome(state);
  const leaderSymbol = decision.target_symbol ??
    fusion.leader_symbol ??
    ranker.leader_symbol ??
    state.autonomous_action_queue.leader_symbol ??
    "Desk";
  const activeTapeItems = buildQuickPriceActionTape(state);
  const activeTape = activeTapeItems.find((item) => item.symbol === leaderSymbol) ?? activeTapeItems[0] ?? null;
  const leaderAction = decision.action.replaceAll("-", " ");
  const primaryTone: QuickChipTone = decision.status === "attack" || decision.status === "probe" || decision.status === "loop"
    ? "engine"
    : decision.status === "blocked"
      ? "critical"
      : decision.status === "protect" || decision.route_refresh_required || decision.chart_proof_required
        ? "caution"
        : "neutral";
  const rankItems = ranker.items.slice(0, 4);
  const routeTone: QuickChipTone = route.status === "ready"
    ? "engine"
    : route.status === "blocked"
      ? "critical"
      : "caution";
  const executionTone: QuickChipTone = execution.status === "attack" || execution.status === "probe"
    ? "engine"
    : execution.status === "blocked"
      ? "critical"
      : "caution";
  const candleTone: QuickChipTone = state.autonomous_candle_conviction.status === "confirm" || state.autonomous_candle_conviction.status === "probe"
    ? "engine"
    : state.autonomous_candle_conviction.status === "reject" || state.autonomous_candle_conviction.status === "protect"
      ? "critical"
      : "caution";
  const liveTone: QuickChipTone = state.execution_gate.live_execution_enabled ? "critical" : "demo";
  const sourceTone = sourceQualityTone(sourceQuality.status, sourceQuality.can_chase);
  const fillAuditToneValue = fillAuditTone(fillLedger.last_fill_verdict);
  const forwardTone = forwardPermissionTone(forwardPermission.status);
  const loopImpactToneValue = loopImpactTone(loopImpact.status);
  const minuteDisciplineToneValue = minuteProfitDisciplineTone(minuteDiscipline.status);
  const profitCaptureToneValue = profitCaptureAutopilotTone(profitCaptureAutopilot.status);
  const profitRedeployToneValue = profitRedeployAutopilotTone(profitRedeployAutopilot.status);
  const profitRedeployExecution = state.autonomous_profit_redeploy_execution;
  const profitRedeployExecutionToneValue = profitRedeployExecutionTone(profitRedeployExecution.status);

  return (
    <section className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(21rem,0.8fr)]" aria-label="Autonomous trading command deck">
      <div className="min-w-0 rounded-md border border-engine/25 bg-void/25 p-2 sm:p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous command</p>
            <h3 className="mt-1 break-words text-lg font-semibold text-on-surface">
              {leaderAction} {leaderSymbol}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
              {decision.next_action}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Chip tone={primaryTone}>{decision.status.replaceAll("-", " ")}</Chip>
            <Chip tone={sourceTone}>source {sourceQuality.status.replaceAll("-", " ")}</Chip>
            <Chip tone={fillAuditToneValue}>last fill {fillLedger.next_fill_permission.replaceAll("-", " ")}</Chip>
            <Chip tone={forwardTone}>forward {forwardPermission.permission.replaceAll("-", " ")}</Chip>
            <Chip tone={loopImpactToneValue}>impact {loopImpact.status.replaceAll("-", " ")}</Chip>
            <Chip tone={minuteDisciplineToneValue}>minute {minuteDiscipline.status.replaceAll("-", " ")}</Chip>
            <Chip tone={profitCaptureToneValue}>capture {profitCaptureAutopilot.status.replaceAll("-", " ")}</Chip>
            <Chip tone={profitRedeployToneValue}>redeploy {profitRedeployAutopilot.status.replaceAll("-", " ")}</Chip>
            <Chip tone={profitRedeployExecutionToneValue}>exec {profitRedeployExecution.status.replaceAll("-", " ")}</Chip>
            <Chip tone={autoWatch ? "engine" : "neutral"}>{autoWatch ? "watching" : autoWatchPlan.label}</Chip>
            <Chip tone={liveTone}>{state.execution_gate.live_execution_enabled ? "live armed" : "paper only"}</Chip>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-engine/25 bg-engine/[0.06] p-2 md:hidden" aria-label="Compact autonomous primary action">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Now action</p>
              <p className="mt-1 truncate text-sm font-semibold text-on-surface">{decision.button_label}</p>
            </div>
            <Chip tone={primaryTone}>{decision.review_after_seconds}s</Chip>
          </div>
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={busy !== null}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-engine/45 bg-engine/15 px-3 py-2 font-mono text-[10px] uppercase tracking-telemetry text-engine transition hover:bg-engine/20 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {busy ? "Running" : decision.button_label}
          </button>
          <p className="sr-only">{decision.next_action}</p>
        </div>

        <QuickAutonomousNextTickRail
          state={state}
          autoWatch={autoWatch}
          autoWatchPlan={autoWatchPlan}
        />
        <QuickProfitCaptureAutopilotStrip state={state} />
        <QuickProfitRedeployAutopilotStrip state={state} />

        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="grid min-w-0 content-start gap-2">
            <QuickWalletNetWorthChart
              wallet={wallet}
              sessionRun={sessionRun}
              loopFeedback={state.autonomous_loop_feedback}
            />
            <QuickPaperExecutionPriorityTape state={state} />
            <QuickMinuteProfitDisciplineRail state={state} />
          </div>

          <div className="grid gap-2">
            <QuickAutonomousDecisionOwner state={state} compact />
            <QuickPositionReactionTape state={state} compact />
            <QuickCapitalCommandTile command={capitalCommand} />
            <div className="hidden lg:block">
              <QuickProfitLoopTile
                state={state}
                decision={decision}
              />
            </div>
            <div className="hidden lg:block">
              <QuickActivePriceActionPanel
                item={activeTape}
                state={state}
                decision={decision}
              />
            </div>
            <ProfitMetric
              label="Wallet trend"
              value={formatCompactSignedCurrency(wallet.window_pnl_usd)}
              detail={`${wallet.max_drawdown_pct.toFixed(1)}% drawdown · ${formatCompactCurrency(wallet.exposure_usd)} exposed`}
              tone={wallet.window_pnl_usd >= 0 ? "engine" : "critical"}
            />
            <ProfitMetric
              label="Last action"
              value={outcome.kind === "stand-down" ? "stand down" : outcome.label}
              detail={`${formatCompactSignedCurrency(outcome.walletDeltaUsd)} wallet · ${outcome.fillDelta} fills`}
              tone={outcome.tone}
            />
            <ProfitMetric
              label="Next dollar"
              value={capitalCommand.action.replaceAll("-", " ")}
              detail={`${formatCompactCurrency(capitalCommand.spend_budget_usd)} spend · ${formatCompactCurrency(capitalCommand.release_budget_usd)} release`}
              tone={capitalCommandTone(capitalCommand.status)}
            />
            <ProfitMetric
              label="Last fill audit"
              value={`${fillLedger.last_fill_profit_score}/100`}
              detail={`${fillLedger.last_fill_verdict} · ${formatCompactSignedCurrency(fillLedger.last_fill_edge_usd)} edge`}
              tone={fillAuditToneValue}
            />
            <ProfitMetric
              label="Forward permission"
              value={`${forwardPermission.permission_score}/100`}
              detail={`${forwardPermission.action.replaceAll("-", " ")} · ${forwardPermission.max_next_fills} fills`}
              tone={forwardTone}
            />
            <ProfitMetric
              label="Loop impact"
              value={`${loopImpact.impact_score}/100`}
              detail={`${loopImpact.action.replaceAll("-", " ")} · ${formatCompactSignedCurrency(loopImpact.equity_delta_usd)} equity`}
              tone={loopImpactToneValue}
            />
            <ProfitMetric
              label="Minute discipline"
              value={`${minuteDiscipline.discipline_score}/100`}
              detail={`${minuteDiscipline.action.replaceAll("-", " ")} · ${minuteDiscipline.max_trades_next_minute}/m`}
              tone={minuteDisciplineToneValue}
            />
            <ProfitMetric
              label="Profit capture"
              value={`${profitCaptureAutopilot.autopilot_score}/100`}
              detail={`${profitCaptureAutopilot.action.replaceAll("-", " ")} · ${formatCompactCurrency(profitCaptureAutopilot.release_usd)} release`}
              tone={profitCaptureToneValue}
            />
            <ProfitMetric
              label="Redeploy exec"
              value={`${profitRedeployExecution.execution_score}/100`}
              detail={`${profitRedeployExecution.status.replaceAll("-", " ")} · ${formatCompactCurrency(profitRedeployExecution.capped_size_usd || profitRedeployExecution.redeploy_budget_usd)} cap`}
              tone={profitRedeployExecutionToneValue}
            />
            <ProfitMetric
              label="Source quality"
              value={`${sourceQuality.quality_score}/100`}
              detail={`${sourceQuality.leader_symbol ?? "desk"} · ${sourceQuality.leader_action?.replaceAll("-", " ") ?? sourceQuality.status.replaceAll("-", " ")}`}
              tone={sourceTone}
            />
            <ProfitMetric
              label="Chase pressure"
              value={`${thesis.chase_urgency_score}/100`}
              detail={`${formatCompactCurrency(thesis.chase_budget_usd)} · ${thesis.chase_size_multiplier}x`}
              tone={thesis.chase_urgency_score >= 68 ? "engine" : thesis.chase_urgency_score >= 42 ? "caution" : "neutral"}
            />
            <ProfitMetric
              label="Discovery delta"
              value={discoveryDelta.leader_symbol ?? discoveryDelta.status}
              detail={`${discoveryDelta.urgency_score}/100 · ${discoveryDelta.leader_event?.replaceAll("-", " ") ?? "watch"}`}
              tone={discoveryDelta.status === "hot" || discoveryDelta.status === "ready" ? "engine" : discoveryDelta.status === "blocked" ? "critical" : discoveryDelta.status === "refresh" ? "caution" : "neutral"}
            />
          </div>
        </div>

        <QuickRotationDirectorPanel state={state} />

        <div className="mt-3 lg:hidden">
          <div className="grid gap-2">
            <QuickAutonomousDecisionOwner state={state} compact />
            <QuickPositionReactionTape state={state} compact />
            <QuickAutonomousProofQueue
              state={state}
              decision={decision}
              compact
            />
            <QuickProfitLoopTile
              state={state}
              decision={decision}
            />
            <QuickActivePriceActionPanel
              item={activeTape}
              state={state}
              decision={decision}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
          <QuickHftReactionChart state={state} />
          <QuickProfitAccountabilityChart state={state} />
        </div>

        <div className="mt-3 grid gap-2">
          <QuickSignalNoiseChart fusion={fusion} decision={state.autonomous_signal_noise_trade_decision} />
          <div className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/20 p-2" aria-label="Ranked high-signal coins">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">High-signal coin race</p>
              <Chip tone={fusion.can_trade ? "engine" : fusion.status === "blocked" ? "critical" : "caution"}>{fusion.max_next_fills} fills</Chip>
            </div>
            <div className="mt-2 grid gap-1.5">
              {rankItems.length > 0 ? rankItems.map((item, index) => (
                <div key={item.token_id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-outline-variant/20 bg-void/20 px-2 py-1.5">
                  <span className="font-mono text-[10px] text-outline">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-on-surface">{item.symbol}</p>
                    <p className={cn("truncate font-mono text-[10px] uppercase tracking-telemetry", profitAuthorityTextClass(opportunityRankItemTone(item.action)))}>
                      {item.action.replaceAll("-", " ")} · {item.status.replaceAll("-", " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs font-semibold text-on-surface">{item.opportunity_score}/100</p>
                    <p className="font-mono text-[10px] text-outline">{formatCompactSignedCurrency(item.expected_edge_usd)}</p>
                  </div>
                </div>
              )) : (
                <p className="rounded-md border border-outline-variant/20 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant">No ranked opportunity has cleared the scanner yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className="grid min-w-0 content-start gap-2" aria-label="Autonomous proof and action rail">
        <QuickExecutionQualityGate state={state} />
        <QuickAutonomousSessionTicket state={state} />
        <div className="hidden lg:block">
          <QuickAutonomousProofQueue state={state} decision={decision} />
        </div>
        <div className="hidden md:block">
          <QuickNowDecisionPanel
            decision={decision}
            routeRefresh={route}
            marketSource={state.market_source}
            busy={busy !== null}
            onPrimaryAction={onPrimaryAction}
          />
        </div>
      </aside>

      <span className="sr-only" aria-label="Autonomous command deck receipt">
        Command deck target {leaderSymbol}; decision {decision.status}; action {decision.action}; expected edge {formatSignedCurrency(decision.expected_edge_usd)}; forward permission {forwardPermission.permission}; forward action {forwardPermission.action}; forward score {forwardPermission.permission_score}; forward can fire next tick {forwardPermission.can_fire_next_tick ? "yes" : "no"}; forward max fills {forwardPermission.max_next_fills}; forward fresh buys {forwardPermission.max_fresh_buys}; loop impact status {loopImpact.status}; loop impact action {loopImpact.action}; loop impact score {loopImpact.impact_score}; loop impact paper only {loopImpact.paper_only ? "yes" : "no"}; loop impact max fills {loopImpact.max_next_fills}; loop impact reduce frequency {loopImpact.must_reduce_frequency ? "yes" : "no"}; loop impact refresh proof {loopImpact.must_refresh_proof ? "yes" : "no"}; profit capture status {profitCaptureAutopilot.status}; profit capture action {profitCaptureAutopilot.action}; profit capture score {profitCaptureAutopilot.autopilot_score}; profit capture release {formatCurrency(profitCaptureAutopilot.release_usd)}; profit capture boundary {profitCaptureAutopilot.execution_boundary}; profit capture ready {profitCaptureAutopilot.paper_trade_ready ? "yes" : "no"}; next dollar {capitalCommand.action}; next dollar status {capitalCommand.status}; next dollar score {capitalCommand.command_score}; paper spend {formatCurrency(capitalCommand.spend_budget_usd)}; paper release {formatCurrency(capitalCommand.release_budget_usd)}; command boundary {capitalCommand.execution_boundary}; command can execute paper {capitalCommand.can_execute_paper ? "yes" : "no"}; source quality {sourceQuality.status}; source quality score {sourceQuality.quality_score}; source leader {sourceQuality.leader_symbol ?? "none"}; source action {sourceQuality.leader_action ?? "none"}; source can chase {sourceQuality.can_chase ? "yes" : "no"}; chase urgency {thesis.chase_urgency_score}; chase budget {formatCurrency(thesis.chase_budget_usd)}; chase size {thesis.chase_size_multiplier}x; wallet equity {formatCurrency(wallet.equity_usd)}; wallet PnL {formatSignedCurrency(wallet.window_pnl_usd)}; route {route.status}; execution {execution.status}; paper boundary {decision.execution_boundary}; blockers {decision.blockers.join("; ") || "none"}.
      </span>
    </section>
  );
}

function QuickAutonomousNextTickRail({
  state,
  autoWatch,
  autoWatchPlan,
}: {
  state: Web3TradingState;
  autoWatch: boolean;
  autoWatchPlan: AutoWatchPlan;
}) {
  const loopImpact = state.autonomous_loop_impact_auditor;
  const route = state.autonomous_route_refresh_execution;
  const actionQueue = state.autonomous_action_queue;
  const actionQueueExecution = state.autonomous_action_queue_execution;
  const forwardPermission = state.autonomous_forward_loop_permission;
  const sessionRun = state.autonomous_session_run;
  const loopTick = state.autonomous_loop_tick;
  const capture = state.autonomous_profit_capture_autopilot;
  const redeploy = state.autonomous_profit_redeploy_autopilot;
  const redeployExecution = state.autonomous_profit_redeploy_execution;
  const ledgerFills = sessionRun.requested ? sessionRun.fill_count : state.paper_account.trade_count;
  const stages: Array<{
    id: string;
    label: string;
    value: string;
    detail: string;
    score: number;
    tone: QuickChipTone;
  }> = [
    {
      id: "proof",
      label: "Proof",
      value: route.status.replaceAll("-", " "),
      detail: route.selected_symbol ? `${route.selected_symbol} route` : state.market_source.label,
      score: route.status === "ready" ? 92 : route.status === "blocked" ? 24 : 58,
      tone: routeRefreshTone(route.status),
    },
    {
      id: "impact",
      label: "Impact",
      value: loopImpact.status.replaceAll("-", " "),
      detail: `${loopImpact.action.replaceAll("-", " ")} · ${loopImpact.next_cadence_seconds}s`,
      score: loopImpact.impact_score,
      tone: loopImpactTone(loopImpact.status),
    },
    {
      id: "queue",
      label: "Queue",
      value: actionQueue.status.replaceAll("-", " "),
      detail: `${actionQueue.items.length} actions · ${formatCompactCurrency(actionQueue.deploy_usd + actionQueue.release_usd)}`,
      score: actionQueueExecution.queue_score,
      tone: actionQueueStatusTone(actionQueue.status),
    },
    {
      id: "redeploy",
      label: "Redeploy",
      value: `${redeploy.status.replaceAll("-", " ")} / ${redeployExecution.status.replaceAll("-", " ")}`,
      detail: `${redeployExecution.symbol ?? redeploy.symbol ?? "no target"} · ${formatCompactCurrency(redeployExecution.capped_size_usd || redeploy.redeploy_budget_usd)}`,
      score: Math.max(redeploy.redeploy_score, redeployExecution.execution_score),
      tone: profitRedeployExecutionTone(redeployExecution.status),
    },
    {
      id: "ledger",
      label: "Ledger",
      value: `${ledgerFills} fills`,
      detail: `${loopTick.status.replaceAll("-", " ")} · ${formatCompactSignedCurrency(sessionRun.requested ? sessionRun.net_pnl_usd : state.autonomous_wallet_telemetry.window_pnl_usd)}`,
      score: forwardPermission.permission_score,
      tone: forwardPermissionTone(forwardPermission.status),
    },
    {
      id: "boundary",
      label: "Boundary",
      value: state.execution_gate.live_execution_enabled ? "live armed" : "paper only",
      detail: state.execution_gate.live_execution_enabled ? "signer gate required" : "no custody or signing",
      score: state.execution_gate.live_execution_enabled ? 38 : 100,
      tone: state.execution_gate.live_execution_enabled ? "critical" : "demo",
    },
  ];
  const activeStage = loopImpact.must_refresh_proof || autoWatchPlan.mode === "refresh"
    ? "proof"
    : loopImpact.status === "protect" || loopImpact.status === "harvest" || loopImpact.status === "tighten" || loopImpact.status === "cooldown" || loopImpact.status === "blocked"
      ? "impact"
      : redeploy.status === "redeploy" || redeploy.status === "probe" || redeploy.status === "wait-proof" || redeploy.status === "protect-first" || redeployExecution.status === "queued" || redeployExecution.status === "applied"
        ? "redeploy"
        : actionQueue.items.length > 0
        ? "queue"
        : ledgerFills > 0
          ? "ledger"
          : "proof";
  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.id === activeStage));
  const loopModeLabel = autoWatch ? `Auto watch ${autoWatchPlan.label}` : autoWatchPlan.label;

  return (
    <section className="mt-3 min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/20 p-2" aria-label="Autonomous next tick flow">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Next tick flow</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {loopModeLabel} · {loopImpact.action.replaceAll("-", " ")}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={loopImpactTone(loopImpact.status)}>{loopImpact.impact_score}/100 impact</Chip>
          <Chip tone={profitCaptureAutopilotTone(capture.status)}>
            capture {capture.action.replaceAll("-", " ")}
          </Chip>
          <Chip tone={profitRedeployAutopilotTone(redeploy.status)}>
            redeploy {redeploy.action.replaceAll("-", " ")}
          </Chip>
          <Chip tone={profitRedeployExecutionTone(redeployExecution.status)}>
            exec {redeployExecution.execution_boundary.replaceAll("-", " ")}
          </Chip>
          <Chip tone={autoWatchPlan.mode === "minute" || autoWatchPlan.mode === "sprint" ? "engine" : autoWatchPlan.mode === "refresh" ? "caution" : "neutral"}>
            {Math.round(autoWatchPlan.delayMs / 1000)}s cadence
          </Chip>
          <Chip tone={state.execution_gate.live_execution_enabled ? "critical" : "demo"}>
            {state.execution_gate.live_execution_enabled ? "live boundary armed" : "paper boundary"}
          </Chip>
        </div>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage, index) => {
          const isActive = index === activeIndex;
          const isDone = index < activeIndex;
          return (
            <div
              key={stage.id}
              className={cn(
                "min-w-0 rounded-md border p-2",
                isActive ? permissionToneClass(stage.tone) : isDone ? "border-engine/20 bg-engine/[0.045] text-engine" : "border-outline-variant/20 bg-void/20 text-on-surface",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{stage.label}</p>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", isActive ? profitAuthorityBarClass(stage.tone) : isDone ? "bg-engine" : "bg-outline/60")} aria-hidden="true" />
              </div>
              <p className="mt-1 truncate text-xs font-semibold">{stage.value}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-void/60" aria-hidden="true">
                <div className={cn("h-full rounded-full", profitAuthorityBarClass(stage.tone))} style={{ width: `${clampNumber(stage.score)}%` }} />
              </div>
              <p className="mt-1 truncate text-[11px] leading-4 text-outline">{stage.detail}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-outline">
        {loopImpact.next_action} Profit capture: {capture.next_action} Redeploy: {redeploy.next_action} The server owns fills; the UI only schedules read-only proof, bounded local-paper ticks, and visible safety gates.
      </p>
      <span className="sr-only" aria-label="Autonomous next tick flow receipt">
        Next tick flow active stage {activeStage}; auto watch {autoWatch ? "on" : "off"}; plan {autoWatchPlan.label}; cadence {Math.round(autoWatchPlan.delayMs / 1000)} seconds; proof {route.status}; impact {loopImpact.status}; profit capture {capture.status} {capture.action}; capture release {formatCurrency(capture.release_usd)}; capture boundary {capture.execution_boundary}; redeploy {redeploy.status} {redeploy.action}; redeploy budget {formatCurrency(redeploy.redeploy_budget_usd)}; redeploy boundary {redeploy.execution_boundary}; queue {actionQueue.status}; ledger fills {ledgerFills}; live boundary {state.execution_gate.live_execution_enabled ? "armed" : "locked"}.
      </span>
    </section>
  );
}

function QuickProfitCaptureAutopilotStrip({ state }: { state: Web3TradingState }) {
  const capture = state.autonomous_profit_capture_autopilot;
  const tone = profitCaptureAutopilotTone(capture.status);
  const visibleItems = capture.items.slice(0, 4);

  return (
    <section className={cn("mt-2 min-w-0 rounded-md border p-2", permissionToneClass(tone))} aria-label="Autonomous profit capture autopilot">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Profit capture autopilot</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {capture.symbol ?? "Wallet"} · {capture.action.replaceAll("-", " ")}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-outline">{capture.next_action}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={tone}>{capture.autopilot_score}/100</Chip>
          <Chip tone={capture.must_refresh_route ? "caution" : "engine"}>{capture.must_refresh_route ? "refresh proof" : "proof ok"}</Chip>
          <Chip tone={capture.must_apply_protective_sell ? "caution" : capture.can_press_fresh_buy ? "engine" : "neutral"}>
            {capture.must_apply_protective_sell ? "sell first" : capture.can_press_fresh_buy ? "press ok" : capture.execution_boundary.replaceAll("-", " ")}
          </Chip>
        </div>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-4">
        {visibleItems.map((item) => {
          const itemTone: QuickChipTone = item.status === "pass" ? "engine" : item.status === "block" ? "critical" : "caution";
          return (
            <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{item.label}</p>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", profitAuthorityBarClass(itemTone))} aria-hidden="true" />
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-on-surface">{item.value}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-dim/60" aria-hidden="true">
                <div className={cn("h-full rounded-full", profitAuthorityBarClass(itemTone))} style={{ width: `${clampNumber(item.score)}%` }} />
              </div>
              <p className="mt-1 truncate text-[11px] leading-4 text-outline">{item.detail}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-outline">
        {capture.summary}
      </p>
      <span className="sr-only" aria-label="Autonomous profit capture autopilot receipt">
        Profit capture autopilot status {capture.status}; action {capture.action}; symbol {capture.symbol ?? "none"}; score {capture.autopilot_score}; release {formatCurrency(capture.release_usd)}; keep {formatCurrency(capture.keep_usd)}; protected profit {formatCurrency(capture.protected_profit_usd)}; cadence {capture.next_cadence_seconds} seconds; protective sell {capture.must_apply_protective_sell ? "yes" : "no"}; refresh route {capture.must_refresh_route ? "yes" : "no"}; can press fresh buy {capture.can_press_fresh_buy ? "yes" : "no"}; paper ready {capture.paper_trade_ready ? "yes" : "no"}; boundary {capture.execution_boundary}; blockers {capture.blockers.join("; ") || "none"}.
      </span>
    </section>
  );
}

function QuickProfitRedeployAutopilotStrip({ state }: { state: Web3TradingState }) {
  const redeploy = state.autonomous_profit_redeploy_autopilot;
  const execution = state.autonomous_profit_redeploy_execution;
  const tone = profitRedeployAutopilotTone(redeploy.status);
  const executionTone = profitRedeployExecutionTone(execution.status);
  const visibleItems = redeploy.items.slice(0, 4);
  const executionItems = execution.items.slice(0, 3);

  return (
    <section className={cn("mt-2 min-w-0 rounded-md border p-2", permissionToneClass(tone))} aria-label="Autonomous profit redeploy autopilot">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Profit redeploy autopilot</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {(redeploy.from_symbol ?? "Profit")} {"->"} {redeploy.symbol ?? "wait"} · {redeploy.action.replaceAll("-", " ")}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-outline">{redeploy.next_action}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={tone}>{redeploy.redeploy_score}/100</Chip>
          <Chip tone={redeploy.can_redeploy_paper ? "engine" : redeploy.must_refresh_proof ? "caution" : "neutral"}>
            {redeploy.can_redeploy_paper ? formatCompactCurrency(redeploy.redeploy_budget_usd) : redeploy.must_refresh_proof ? "refresh proof" : redeploy.execution_boundary.replaceAll("-", " ")}
          </Chip>
          <Chip tone={redeploy.must_protect_first ? "caution" : "demo"}>
            {redeploy.must_protect_first ? "protect first" : formatCompactCurrency(redeploy.reserve_usd)}
          </Chip>
          <Chip tone={executionTone}>
            exec {execution.status.replaceAll("-", " ")}
          </Chip>
          <Chip tone={execution.execution_boundary === "paper-ledger-only" ? "demo" : executionTone}>
            {execution.execution_boundary.replaceAll("-", " ")}
          </Chip>
        </div>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-4">
        {visibleItems.map((item) => {
          const itemTone: QuickChipTone = item.status === "pass" ? "engine" : item.status === "block" ? "critical" : "caution";
          return (
            <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{item.label}</p>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", profitAuthorityBarClass(itemTone))} aria-hidden="true" />
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-on-surface">{item.value}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-dim/60" aria-hidden="true">
                <div className={cn("h-full rounded-full", profitAuthorityBarClass(itemTone))} style={{ width: `${clampNumber(item.score)}%` }} />
              </div>
              <p className="mt-1 truncate text-[11px] leading-4 text-outline">{item.detail}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-2 rounded-md border border-outline-variant/20 bg-void/20 p-2" aria-label="Autonomous profit redeploy execution receipt">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Redeploy execution</p>
            <p className="mt-1 truncate text-xs font-semibold text-on-surface">
              {execution.execution_lane?.replaceAll("-", " ") ?? execution.source.replaceAll("-", " ")} · {execution.symbol ?? "no target"}
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-outline">
              {execution.paper_trade_id ? `${execution.paper_trade_id} · ` : ""}{execution.next_action}
            </p>
          </div>
          <Chip tone={executionTone}>{execution.execution_score}/100</Chip>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {executionItems.map((item) => {
            const itemTone: QuickChipTone = item.status === "pass" ? "engine" : item.status === "block" ? "critical" : "caution";
            return (
              <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <p className="truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">{item.label}</p>
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", profitAuthorityBarClass(itemTone))} aria-hidden="true" />
                </div>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-on-surface">{item.value}</p>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-outline">
        {redeploy.summary} {execution.summary}
      </p>
      <span className="sr-only" aria-label="Autonomous profit redeploy autopilot receipt">
        Profit redeploy autopilot status {redeploy.status}; action {redeploy.action}; from {redeploy.from_symbol ?? "none"}; target {redeploy.symbol ?? "none"}; score {redeploy.redeploy_score}; redeploy budget {formatCurrency(redeploy.redeploy_budget_usd)}; released cash {formatCurrency(redeploy.released_cash_usd)}; reserve {formatCurrency(redeploy.reserve_usd)}; expected edge {formatCurrency(redeploy.expected_edge_usd)}; cadence {redeploy.next_cadence_seconds} seconds; can redeploy paper {redeploy.can_redeploy_paper ? "yes" : "no"}; refresh proof {redeploy.must_refresh_proof ? "yes" : "no"}; protect first {redeploy.must_protect_first ? "yes" : "no"}; boundary {redeploy.execution_boundary}; execution status {execution.status}; execution source {execution.source}; execution lane {execution.execution_lane ?? "none"}; execution paper trade id {execution.paper_trade_id ?? "none"}; execution symbol {execution.symbol ?? "none"}; capped size {formatCurrency(execution.capped_size_usd)}; ledger applied {execution.ledger_applied ? "yes" : "no"}; execution boundary {execution.execution_boundary}; blockers {[...redeploy.blockers, ...execution.blockers].join("; ") || "none"}.
      </span>
    </section>
  );
}

function QuickCapitalCommandTile({
  command,
}: {
  command: Web3TradingState["autonomous_capital_command"];
}) {
  const tone = capitalCommandTone(command.status);
  const proofItems = command.items.slice(0, 6);

  return (
    <div className={cn("min-w-0 rounded-md border p-2", permissionToneClass(tone))} aria-label="Next dollar capital command">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Next dollar</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {command.action.replaceAll("-", " ")} {command.target_symbol ?? "desk"}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{command.next_action}</p>
        </div>
        <Chip tone={tone}>{command.command_score}/100</Chip>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <MiniProofStat label="Spend" value={formatCompactCurrency(command.spend_budget_usd)} />
        <MiniProofStat label="Release" value={formatCompactCurrency(command.release_budget_usd)} />
        <MiniProofStat label="Edge" value={formatCompactSignedCurrency(command.expected_edge_usd)} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {proofItems.map((item) => (
          <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 px-2 py-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <p className="truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">{item.label}</p>
              <span className={cn("font-mono text-[9px] font-semibold", item.status === "pass" ? "text-engine" : item.status === "fail" ? "text-critical" : "text-caution")}>
                {item.score}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-on-surface">{item.value}</p>
          </div>
        ))}
      </div>
      <p className="sr-only">
        Capital command {command.status}, boundary {command.execution_boundary}, can execute paper {command.can_execute_paper ? "yes" : "no"}, blockers {command.blockers.join("; ") || "none"}.
      </p>
    </div>
  );
}

function MiniProofStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 px-2 py-1.5">
      <p className="truncate font-mono text-[9px] uppercase tracking-telemetry text-outline">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[11px] font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function QuickAutopilotMissionPanel({
  state,
  autoWatch,
  autoWatchPlan,
}: {
  state: Web3TradingState;
  autoWatch: boolean;
  autoWatchPlan: AutoWatchPlan;
}) {
  const command = state.autonomous_command_center;
  const commandExecution = state.autonomous_command_center_execution;
  const wallet = state.autonomous_wallet_telemetry;
  const profitControl = state.autonomous_profit_control;
  const profitObjective = state.autonomous_profit_objective;
  const profitVelocity = state.autonomous_profit_velocity_governor;
  const allocation = state.autonomous_profit_allocation_plan;
  const route = state.autonomous_route_refresh_execution;
  const candle = state.autonomous_candle_refresh;
  const queue = state.autonomous_action_queue;
  const queueExecution = state.autonomous_action_queue_execution;
  const mission = state.autonomous_trade_mission;
  const readiness = state.autonomous_trade_readiness_gate;
  const leaderSymbol = commandExecution.selected_symbol ??
    command.primary_symbol ??
    queueExecution.selected_symbol ??
    state.autonomous_market_evidence_fusion.leader_symbol ??
    mission.target_symbol ??
    "Desk";
  const leaderAction = commandExecution.selected_action ??
    command.primary_action ??
    queue.leader_action ??
    state.autonomous_market_evidence_fusion.leader_action ??
    "watch";
  const flow = [
    {
      id: "market",
      label: "Market read",
      value: state.market_source.status === "live" ? "live" : state.market_source.status,
      tone: state.market_source.status === "live" ? "engine" : "demo",
      detail: state.market_source.label,
    },
    {
      id: "signal",
      label: "Signal/noise",
      value: state.autonomous_market_evidence_fusion.leader_action?.replaceAll("-", " ") ?? state.autonomous_market_evidence_fusion.status,
      tone: state.autonomous_market_evidence_fusion.can_trade ? "engine" : state.autonomous_market_evidence_fusion.status === "blocked" ? "critical" : "caution",
      detail: `${state.autonomous_market_evidence_fusion.fusion_score}/100`,
    },
    {
      id: "proof",
      label: "Route + candle",
      value: route.status === "ready" && candle.status === "ready" ? "ready" : route.status === "blocked" || candle.status === "blocked" ? "blocked" : "refresh",
      tone: route.status === "ready" && candle.status === "ready" ? "engine" : route.status === "blocked" || candle.status === "blocked" ? "critical" : "caution",
      detail: `${route.status.replaceAll("-", " ")} / ${candle.status}`,
    },
    {
      id: "size",
      label: "Size",
      value: allocation.can_deploy ? formatCompactCurrency(allocation.max_trade_usd) : allocation.should_release_first ? "release" : allocation.status,
      tone: allocation.can_deploy ? "engine" : allocation.should_release_first ? "caution" : allocation.status === "cooldown" ? "critical" : "neutral",
      detail: `${allocation.size_multiplier}x`,
    },
    {
      id: "ledger",
      label: "Paper ledger",
      value: queueExecution.ledger_applied ? "applied" : queueExecution.paper_trade_ready ? "queued" : state.paper_account.trade_count > 0 ? `${state.paper_account.trade_count} fills` : "waiting",
      tone: queueExecution.ledger_applied || queueExecution.paper_trade_ready || state.paper_account.trade_count > 0 ? "engine" : "neutral",
      detail: queueExecution.execution_boundary.replaceAll("-", " "),
    },
    {
      id: "wallet",
      label: "Wallet feedback",
      value: formatCompactSignedCurrency(wallet.window_pnl_usd),
      tone: wallet.window_pnl_usd >= 0 ? "engine" : "critical",
      detail: `${wallet.max_drawdown_pct.toFixed(1)}% dd`,
    },
  ] satisfies Array<{
    id: string;
    label: string;
    value: string;
    tone: QuickChipTone;
    detail: string;
  }>;
  const targetPct = clampNumber(Math.round(profitObjective.progress_pct));
  const pnlPct = clampNumber(Math.round(((wallet.equity_usd - wallet.starting_cash_usd) / Math.max(1, wallet.starting_cash_usd)) * 100), -100, 100);
  const deployReleaseTotal = Math.max(1, profitControl.deploy_now_usd + profitControl.release_now_usd + profitControl.reserve_usd + allocation.deploy_budget_usd + allocation.release_budget_usd);
  const deployWidth = Math.max(4, (profitControl.deploy_now_usd + allocation.deploy_budget_usd) / deployReleaseTotal * 210);
  const releaseWidth = Math.max(4, (profitControl.release_now_usd + allocation.release_budget_usd) / deployReleaseTotal * 210);
  const reserveWidth = Math.max(4, (profitControl.reserve_usd) / deployReleaseTotal * 210);
  const missionTone = command.status === "attack" || command.status === "harvest"
    ? "engine"
    : command.status === "blocked"
      ? "critical"
      : command.status === "protect"
        ? "caution"
        : "neutral";
  const liveTone = state.execution_gate.live_execution_enabled ? "critical" : "demo";

  return (
    <section className="mt-3 rounded-md border border-engine/25 bg-surface-dim/20 p-2 sm:p-3" aria-label="Autopilot mission control">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.12fr)_minmax(19rem,0.88fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autopilot mission</p>
              <p className="mt-1 break-words text-base font-semibold text-on-surface">
                {leaderAction.replaceAll("-", " ")} {leaderSymbol}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {commandExecution.next_action || command.next_action || mission.next_action}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={missionTone}>{command.status.replaceAll("-", " ")}</Chip>
              <Chip tone={liveTone}>{state.execution_gate.live_execution_enabled ? "live armed" : "paper only"}</Chip>
              <Chip tone={autoWatch ? "engine" : "neutral"}>{autoWatch ? "watch running" : autoWatchPlan.label}</Chip>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6" aria-label="Autonomous market-to-wallet wiring path">
            {flow.map((step, index) => (
              <div key={step.id} className={cn("relative min-w-0 rounded-md border px-2 py-2", missionStepToneClass(step.tone))}>
                <p className="truncate font-mono text-[10px] uppercase tracking-telemetry">{step.label}</p>
                <p className="mt-1 truncate text-xs font-semibold capitalize">{step.value}</p>
                <p className="mt-0.5 hidden truncate font-mono text-[10px] opacity-75 sm:block">{step.detail}</p>
                {index < flow.length - 1 ? (
                  <span className="pointer-events-none absolute -right-1 top-1/2 hidden h-px w-2 bg-current/35 sm:block" aria-hidden="true" />
                ) : null}
              </div>
            ))}
          </div>

          <svg
            viewBox="0 0 560 128"
            role="img"
            aria-label="Wallet profit runway and autonomous capital path chart"
            className="mt-3 h-32 w-full text-engine"
          >
            <rect width="560" height="128" rx="8" className="fill-void" opacity="0.25" />
            <text x="18" y="18" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">profit runway</text>
            <text x="340" y="18" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">capital path</text>
            <rect x="24" y="36" width="250" height="13" rx="6.5" className="fill-outline" opacity="0.14" />
            <rect x="24" y="36" width={Math.max(8, targetPct / 100 * 250)} height="13" rx="6.5" className={profitObjective.progress_pct >= 100 || wallet.window_pnl_usd >= 0 ? "fill-engine" : "fill-critical"} opacity="0.9" />
            <line x1={24 + Math.max(0, Math.min(250, (pnlPct + 100) / 200 * 250))} x2={24 + Math.max(0, Math.min(250, (pnlPct + 100) / 200 * 250))} y1="28" y2="59" stroke="currentColor" strokeWidth="2" strokeOpacity="0.42" />
            <text x="24" y="72" className="fill-on-surface font-mono text-[12px] font-semibold">{formatCompactSignedCurrency(wallet.net_pnl_usd)}</text>
            <text x="116" y="72" className="fill-outline font-mono text-[10px]">{targetPct}% target</text>
            <text x="202" y="72" className="fill-outline font-mono text-[10px]">{formatCompactSignedCurrency(profitVelocity.expected_profit_per_minute_usd)}/min</text>
            <rect x="334" y="36" width="210" height="13" rx="6.5" className="fill-outline" opacity="0.14" />
            <rect x="334" y="36" width={deployWidth} height="13" rx="6.5" className="fill-engine" opacity="0.82" />
            <rect x={334 + deployWidth} y="36" width={releaseWidth} height="13" rx="6.5" className="fill-caution" opacity="0.76" />
            <rect x={334 + deployWidth + releaseWidth} y="36" width={reserveWidth} height="13" rx="6.5" className="fill-outline" opacity="0.38" />
            <text x="334" y="72" className="fill-engine font-mono text-[10px]">deploy {formatCompactCurrency(profitControl.deploy_now_usd + allocation.deploy_budget_usd)}</text>
            <text x="334" y="90" className="fill-caution font-mono text-[10px]">release {formatCompactCurrency(profitControl.release_now_usd + allocation.release_budget_usd)}</text>
            <text x="334" y="108" className="fill-outline font-mono text-[10px]">reserve {formatCompactCurrency(profitControl.reserve_usd)}</text>
            <text x="24" y="108" className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">backend tick chooses paper trade / protect - wallet curve grades result</text>
          </svg>
        </div>

        <div className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2" aria-label="Autopilot mission readout">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">One-minute loop</p>
              <p className="mt-1 truncate text-sm font-semibold text-on-surface">
                {profitVelocity.loop_permission.replaceAll("-", " ")} · {profitVelocity.max_trades_next_minute}/m
              </p>
            </div>
            <Chip tone={profitVelocityTone(profitVelocity.status, profitVelocity.loop_permission)}>
              {profitVelocity.velocity_score}/100
            </Chip>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-1" aria-label="Autopilot mission metrics">
            <ProfitMetric label="Target" value={`${targetPct}%`} detail={formatCompactCurrency(profitObjective.target_net_pnl_usd)} tone={profitObjective.progress_pct >= 100 ? "engine" : "caution"} />
            <ProfitMetric label="Edge" value={formatCompactSignedCurrency(command.expected_edge_per_minute_usd)} detail={`${command.command_score}/100 command`} tone={command.expected_edge_per_minute_usd > 0 ? "engine" : "neutral"} />
            <ProfitMetric label="Batch" value={`${state.autonomous_trade_batch.ready_count}/${state.autonomous_trade_batch.planned_count}`} detail={`${readiness.max_batch_trades} max`} tone={state.autonomous_trade_batch.ready_count > 0 ? "engine" : "neutral"} />
            <ProfitMetric label="Route" value={route.status.replaceAll("-", " ")} detail={route.selected_symbol ?? "proof"} tone={route.status === "ready" ? "engine" : route.status === "blocked" ? "critical" : "caution"} />
            <ProfitMetric label="Candle" value={candle.status} detail={candle.symbol ?? state.autonomous_candle_conviction.target_symbol ?? "target"} tone={candle.status === "ready" ? "engine" : candle.status === "blocked" ? "critical" : "caution"} />
            <ProfitMetric label="Wallet" value={formatCompactCurrency(wallet.equity_usd)} detail={`${formatCompactCurrency(wallet.exposure_usd)} exposure`} tone={wallet.window_pnl_usd >= 0 ? "engine" : "critical"} />
          </dl>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {autoWatch ? `Auto watch is handing refresh or tick authority to the backend every ${autoWatchPlan.delayMs / 1000}s.` : autoWatchPlan.reason}
          </p>
          <span className="sr-only" aria-label="Autopilot mission receipt">
            Autopilot mission control: selected {leaderAction} {leaderSymbol}; command {command.status}; command score {command.command_score}; expected edge per minute {formatSignedCurrency(command.expected_edge_per_minute_usd)}; profit target {formatCurrency(profitObjective.target_net_pnl_usd)} at {profitObjective.progress_pct} percent; profit velocity {profitVelocity.status} with {profitVelocity.max_trades_next_minute} max trades next minute; route proof {route.status}; candle proof {candle.status}; queue execution {queueExecution.status}; paper ledger trades {state.paper_account.trade_count}; wallet equity {formatCurrency(wallet.equity_usd)}; wallet window PnL {formatSignedCurrency(wallet.window_pnl_usd)}; live execution {state.execution_gate.live_execution_enabled ? "armed" : "locked"}.
          </span>
        </div>
      </div>
    </section>
  );
}

function QuickNowDecisionPanel({
  decision,
  routeRefresh,
  marketSource,
  busy,
  onPrimaryAction,
}: {
  decision: Web3TradingState["autonomous_now_decision"];
  routeRefresh: Web3TradingState["autonomous_route_refresh_execution"];
  marketSource: Web3TradingState["market_source"];
  busy: boolean;
  onPrimaryAction: () => void;
}) {
  const statusTone: QuickChipTone = decision.status === "attack" || decision.status === "probe" || decision.status === "loop"
    ? "engine"
    : decision.status === "protect" || decision.status === "refresh" || decision.status === "watch"
      ? "caution"
      : decision.status === "blocked"
        ? "critical"
        : "neutral";
  const boundaryTone: QuickChipTone = decision.execution_boundary === "paper-ledger-only"
    ? "engine"
    : decision.execution_boundary === "blocked-paper-only"
      ? "critical"
      : "caution";
  const proofTone = (status: Web3TradingState["autonomous_now_decision"]["proof"][number]["status"]): QuickChipTone => (
    status === "pass" ? "engine" : status === "fail" ? "critical" : "caution"
  );
  const proofClass = (status: Web3TradingState["autonomous_now_decision"]["proof"][number]["status"]) => missionStepToneClass(proofTone(status));
  const routeRepairRequired = (decision.action === "refresh-route" || decision.route_refresh_required) &&
    !routeRefresh.can_request_readonly_quote &&
    (marketSource.mode === "sample" || routeRefresh.route_refresh_required || routeRefresh.status !== "idle" || Boolean(routeRefresh.selected_lane));
  const liveRouteRepair = routeRepairRequired && marketSource.mode === "sample";
  const primaryLabel = liveRouteRepair ? "Live route repair" : routeRepairRequired ? "Repair route read" : decision.button_label;
  const primaryPath = describeNowDecisionClientPath(decision, routeRefresh, marketSource);
  const primaryTone = decision.status === "blocked"
    ? "border-critical/45 bg-critical/10 text-critical hover:bg-critical/15"
    : decision.status === "refresh" || decision.status === "protect"
      ? "border-caution/45 bg-caution/10 text-caution hover:bg-caution/15"
      : "border-engine/45 bg-engine/15 text-engine hover:bg-engine/20";

  return (
    <section className="mt-3 rounded-md border border-engine/25 bg-void/25 p-2 sm:p-3" aria-label="Autonomous now decision">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Now decision</p>
              <p className="mt-1 break-words text-base font-semibold text-on-surface">
                {decision.action.replaceAll("-", " ")} {decision.target_symbol ?? "desk"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {decision.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={statusTone}>{decision.decision_score}/100</Chip>
              <Chip tone={boundaryTone}>{decision.execution_boundary.replaceAll("-", " ")}</Chip>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Autonomous now decision money and permission">
            <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
              <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Edge</dt>
              <dd className={cn("mt-1 truncate text-xs font-semibold", decision.expected_edge_usd >= 0 ? "text-engine" : "text-critical")}>{formatCompactSignedCurrency(decision.expected_edge_usd)}</dd>
            </div>
            <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
              <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Per min</dt>
              <dd className={cn("mt-1 truncate text-xs font-semibold", decision.expected_profit_per_minute_usd >= 0 ? "text-engine" : "text-critical")}>{formatCompactSignedCurrency(decision.expected_profit_per_minute_usd)}</dd>
            </div>
            <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
              <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Paper size</dt>
              <dd className="mt-1 truncate text-xs font-semibold text-on-surface">{formatCompactCurrency(decision.paper_size_usd)}</dd>
            </div>
            <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
              <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Button</dt>
              <dd className="mt-1 truncate text-xs font-semibold text-on-surface">{decision.button_label}</dd>
            </div>
          </dl>

          <p className="mt-2 line-clamp-2 text-xs leading-5 text-outline">
            {decision.next_action}
          </p>
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={busy}
            aria-label="Run autonomous now decision"
            className={cn(
              "mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline",
              primaryTone,
            )}
          >
            <span className="min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-telemetry opacity-80">Recommended</span>
              <span className="mt-0.5 block break-words text-sm font-semibold">
                {busy ? "Working" : primaryLabel}
              </span>
            </span>
            <span className="shrink-0 rounded-md border border-current/25 px-2 py-1 font-mono text-[10px] uppercase tracking-telemetry">
              {decision.review_after_seconds}s
            </span>
          </button>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-outline">
            {primaryPath}
          </p>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3" aria-label="Autonomous now decision proof stack">
            {decision.proof.map((item) => (
              <div key={item.id} className={cn("min-w-0 rounded-md border px-2 py-2", proofClass(item.status))}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-[10px] uppercase tracking-telemetry">{item.label}</p>
                  <span className="shrink-0 font-mono text-[10px]">{item.score}/100</span>
                </div>
                <p className="mt-1 truncate text-xs font-semibold capitalize">{item.value}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 opacity-80">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3" aria-label="Autonomous now decision guardrails">
            <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
              <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Route proof</p>
              <p className={cn("mt-1 truncate text-xs font-semibold", routeRefresh.can_request_readonly_quote || routeRefresh.status === "ready" ? "text-engine" : routeRefresh.status === "blocked" ? "text-critical" : "text-caution")}>
                {routeRefresh.can_request_readonly_quote ? "quote ready" : routeRefresh.status.replaceAll("-", " ")}
              </p>
            </div>
            <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
              <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Chart</p>
              <p className={cn("mt-1 truncate text-xs font-semibold", decision.chart_proof_required ? "text-caution" : "text-engine")}>
                {decision.chart_proof_required ? "proof first" : decision.chart_proof_status}
              </p>
            </div>
            <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
              <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Wallet</p>
              <p className={cn("mt-1 truncate text-xs font-semibold", decision.wallet_window_pnl_usd >= 0 ? "text-engine" : "text-critical")}>
                {formatCompactSignedCurrency(decision.wallet_window_pnl_usd)} · {decision.wallet_drawdown_pct.toFixed(1)}% dd
              </p>
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-label="Autonomous now decision receipt">
        Now decision {decision.status}; action {decision.action}; target {decision.target_symbol ?? "none"}; lane {decision.target_lane ?? "none"}; score {decision.decision_score}; button {decision.button_label}; expected edge {formatSignedCurrency(decision.expected_edge_usd)}; expected profit per minute {formatSignedCurrency(decision.expected_profit_per_minute_usd)}; paper size {formatCurrency(decision.paper_size_usd)}; fills {decision.max_next_fills}; review {decision.review_after_seconds} seconds; wallet equity {formatCurrency(decision.wallet_equity_usd)}; wallet window PnL {formatSignedCurrency(decision.wallet_window_pnl_usd)}; drawdown {decision.wallet_drawdown_pct} percent; auto paper {decision.can_auto_paper ? "yes" : "no"}; auto watch {decision.can_auto_watch_run ? "yes" : "no"}; chart proof required {decision.chart_proof_required ? "yes" : "no"}; chart proof status {decision.chart_proof_status}; route refresh required {decision.route_refresh_required ? "yes" : "no"}; live execution {decision.live_execution_enabled ? "armed" : "locked"}; boundary {decision.execution_boundary}; blockers {decision.blockers.join("; ") || "none"}.
      </span>
      <span className="sr-only" aria-label="Autonomous primary action receipt">
        Run autonomous now decision maps the server-authored button {decision.button_label} and action {decision.action} to {primaryPath}. It preserves the {decision.execution_boundary} boundary and does not sign, submit, custody funds, move live wallet funds, or guarantee profit.
      </span>
      <span className="sr-only" aria-label="Autonomous route repair receipt">
        Route repair required {routeRepairRequired ? "yes" : "no"}; live route repair {liveRouteRepair ? "yes" : "no"}; market source {marketSource.mode}; route refresh status {routeRefresh.status}; selected route symbol {routeRefresh.selected_symbol ?? "none"}; selected route lane {routeRefresh.selected_lane ?? "none"}; can request read-only quote {routeRefresh.can_request_readonly_quote ? "yes" : "no"}; selected quote request {routeRefresh.selected_quote_request ? "present" : "missing"}; route blocker {routeRefresh.blockers[0] ?? "none"}; route next action {routeRefresh.next_action}.
      </span>
    </section>
  );
}

function QuickProfitAuthorityLane({
  scoreboard,
  routeSelector,
  walletPerformance,
  wallet,
}: {
  scoreboard: Web3TradingState["autonomous_profit_lane_scoreboard"];
  routeSelector: Web3TradingState["autonomous_profit_route_selector"];
  walletPerformance: Web3TradingState["autonomous_wallet_performance_governor"];
  wallet: Web3TradingState["autonomous_wallet_telemetry"];
}) {
  const tone = profitAuthorityTone(scoreboard.status, routeSelector.status, walletPerformance.status);
  const leader = scoreboard.items[0] ?? null;
  const laneRows = scoreboard.items.slice(0, 4);
  const scoreWidth = Math.max(4, Math.min(100, scoreboard.make_money_score));
  const frequencyWidth = Math.max(4, Math.min(100, scoreboard.trade_frequency_score));
  const capitalWidth = Math.max(4, Math.min(100, scoreboard.capital_efficiency_score));
  const walletWidth = Math.max(4, Math.min(100, walletPerformance.make_money_score));
  const authorityLabel = scoreboard.status === "press"
    ? "Press"
    : scoreboard.status === "selective"
      ? "Probe"
      : scoreboard.status === "protect"
        ? "Protect"
        : scoreboard.status === "blocked"
          ? "Blocked"
          : scoreboard.status === "cooldown"
            ? "Cooldown"
            : "Observe";

  return (
    <section className="mt-3 rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:p-3" aria-label="Autonomous profit authority lane">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.74fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Profit authority</p>
              <p className="mt-1 break-words text-base font-semibold text-on-surface">
                {authorityLabel} {scoreboard.leader_symbol ?? leader?.label ?? "desk"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {scoreboard.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={tone}>{scoreboard.make_money_score}/100</Chip>
              <Chip tone={routeSelector.status === "execute" || routeSelector.status === "selective" ? "engine" : routeSelector.status === "blocked" ? "critical" : "caution"}>
                {routeSelector.status}
              </Chip>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Autonomous profit authority metrics">
            <ProfitMetric label="Edge" value={formatCompactSignedCurrency(scoreboard.expected_net_profit_usd)} detail={`${formatCompactSignedCurrency(scoreboard.expected_profit_per_minute_usd)}/min`} tone={scoreboard.expected_net_profit_usd > 0 ? "engine" : "neutral"} />
            <ProfitMetric label="Lanes" value={`${scoreboard.ready_lane_count}/${scoreboard.items.length}`} detail={`${scoreboard.blocked_lane_count} blocked`} tone={scoreboard.ready_lane_count > 0 ? "engine" : scoreboard.blocked_lane_count > 0 ? "critical" : "neutral"} />
            <ProfitMetric label="Wallet" value={walletPerformance.fresh_buy_permission.replaceAll("-", " ")} detail={`${wallet.max_drawdown_pct.toFixed(1)}% dd`} tone={walletPerformance.protective_sell_only || walletPerformance.fresh_buy_permission === "blocked" ? "critical" : walletPerformance.fresh_buy_permission === "open" ? "engine" : "caution"} />
            <ProfitMetric label="Cap" value={formatCompactCurrency(Math.max(routeSelector.max_buy_usd, leader?.notional_usd ?? 0))} detail={`${scoreboard.review_after_seconds}s review`} tone={scoreboard.status === "press" || scoreboard.status === "selective" ? "engine" : "caution"} />
          </dl>

          <p className="mt-2 line-clamp-2 text-xs leading-5 text-outline">
            {scoreboard.next_action}
          </p>
        </div>

        <div className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/15 p-2" aria-label="Autonomous profit authority chart">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Make-money pressure</p>
            <span className={cn("font-mono text-[10px] uppercase tracking-telemetry", profitAuthorityTextClass(tone))}>{authorityLabel}</span>
          </div>
          <div className="mt-2 space-y-1.5">
            <ProfitAuthorityBar label="Make money" value={scoreboard.make_money_score} width={scoreWidth} tone={tone} />
            <ProfitAuthorityBar label="Frequency" value={scoreboard.trade_frequency_score} width={frequencyWidth} tone={scoreboard.trade_frequency_score >= 66 ? "engine" : scoreboard.trade_frequency_score >= 42 ? "caution" : "critical"} />
            <ProfitAuthorityBar label="Capital" value={scoreboard.capital_efficiency_score} width={capitalWidth} tone={scoreboard.capital_efficiency_score >= 66 ? "engine" : scoreboard.capital_efficiency_score >= 42 ? "caution" : "critical"} />
            <ProfitAuthorityBar label="Wallet" value={walletPerformance.make_money_score} width={walletWidth} tone={walletPerformance.make_money_score >= 66 ? "engine" : walletPerformance.make_money_score >= 42 ? "caution" : "critical"} />
          </div>
          <div className="mt-2 grid gap-1" aria-label="Autonomous profit authority ranked lanes">
            {laneRows.length > 0 ? laneRows.map((item) => (
              <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-outline-variant/20 bg-void/20 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-on-surface">{item.symbol ?? item.label}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{item.action.replaceAll("-", " ")} · {item.status}</p>
                </div>
                <div className="text-right">
                  <p className={cn("font-mono text-xs font-semibold", profitAuthorityTextClass(profitLaneItemTone(item)))}>{item.rank_score}/100</p>
                  <p className="font-mono text-[10px] text-outline">{formatCompactSignedCurrency(item.expected_profit_per_minute_usd)}/m</p>
                </div>
              </div>
            )) : (
              <p className="rounded-md border border-outline-variant/20 bg-void/20 px-2 py-1.5 text-xs leading-5 text-on-surface-variant">
                No profit lane is ranked yet; keep the agent in observe mode.
              </p>
            )}
          </div>
        </div>
      </div>
      <span className="sr-only" aria-label="Autonomous profit authority receipt">
        Profit authority {scoreboard.status}; leader lane {scoreboard.leader_lane ?? "none"}; leader symbol {scoreboard.leader_symbol ?? "none"}; make-money score {scoreboard.make_money_score}; expected net edge {formatSignedCurrency(scoreboard.expected_net_profit_usd)}; expected profit per minute {formatSignedCurrency(scoreboard.expected_profit_per_minute_usd)}; realized contribution {formatSignedCurrency(scoreboard.realized_contribution_usd)}; ready lanes {scoreboard.ready_lane_count}; blocked lanes {scoreboard.blocked_lane_count}; trade frequency {scoreboard.trade_frequency_score}; capital efficiency {scoreboard.capital_efficiency_score}; route selector {routeSelector.status}; wallet permission {walletPerformance.fresh_buy_permission}; protective sell only {walletPerformance.protective_sell_only ? "yes" : "no"}; next action {scoreboard.next_action}.
      </span>
    </section>
  );
}

function ProfitAuthorityBar({
  label,
  value,
  width,
  tone,
}: {
  label: string;
  value: number;
  width: number;
  tone: QuickChipTone;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-2">
      <span className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-outline-variant/20">
        <span className={cn("block h-full rounded-full", profitAuthorityBarClass(tone))} style={{ width: `${width}%` }} />
      </span>
      <span className="text-right font-mono text-[10px] text-outline">{Math.round(value)}</span>
    </div>
  );
}

function QuickWalletAutopilotStrip({
  wallet,
  sessionRun,
  loopFeedback,
  pressureTape,
  decision,
  pulse,
  benchmark,
  alphaFeedback,
  thesis,
  positionSituation,
  protectionCoordinator,
  triggerCoverage,
  markBoard,
}: {
  wallet: Web3TradingState["autonomous_wallet_telemetry"];
  sessionRun: Web3TradingState["autonomous_session_run"];
  loopFeedback: Web3TradingState["autonomous_loop_feedback"];
  pressureTape: Web3TradingState["autonomous_pressure_tape"];
  decision: Web3TradingState["autonomous_now_decision"];
  pulse: Web3TradingState["autonomous_make_money_pulse"];
  benchmark: Web3TradingState["autonomous_profit_benchmark"];
  alphaFeedback: Web3TradingState["autonomous_alpha_feedback_loop"];
  thesis: Web3TradingState["autonomous_profit_thesis_verifier"];
  positionSituation: Web3TradingState["autonomous_position_situation_board"];
  protectionCoordinator: Web3TradingState["autonomous_protection_coordinator"];
  triggerCoverage: Web3TradingState["protective_trigger_coverage"];
  markBoard: Web3TradingState["autonomous_portfolio_mark_board"];
}) {
  const width = 720;
  const height = 128;
  const pad = { left: 24, right: 18, top: 14, bottom: 24 };
  const points = wallet.curve.length > 0
    ? wallet.curve
    : [{
      id: "current",
      label: "now",
      recorded_at: "",
      cycle: 0,
      action: "current" as const,
      equity_usd: wallet.equity_usd,
      cash_usd: wallet.cash_usd,
      exposure_usd: wallet.exposure_usd,
      realized_pnl_usd: wallet.realized_pnl_usd,
      unrealized_pnl_usd: wallet.unrealized_pnl_usd,
      drawdown_pct: wallet.max_drawdown_pct,
      filled_count: wallet.fill_count,
      blocked_count: wallet.blocked_count,
    }];
  const forecastEquity = points[points.length - 1].equity_usd + wallet.slope_usd_per_tick * 2;
  const values = points.flatMap((point) => [point.equity_usd, point.cash_usd, point.exposure_usd]);
  const minValue = Math.min(...values, forecastEquity, wallet.starting_cash_usd);
  const maxValue = Math.max(...values, forecastEquity, wallet.high_watermark_usd);
  const range = Math.max(1, maxValue - minValue);
  const xFor = (index: number, count = points.length) => pad.left + (count <= 1 ? 0 : (index / (count - 1)) * (width - pad.left - pad.right));
  const yFor = (value: number) => Math.round(pad.top + (1 - ((value - minValue) / range)) * (height - pad.top - pad.bottom));
  const equityPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.equity_usd)}`).join(" ");
  const cashPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.cash_usd)}`).join(" ");
  const exposurePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.exposure_usd)}`).join(" ");
  const lastPoint = points[points.length - 1];
  const lastX = xFor(points.length - 1);
  const lastY = yFor(lastPoint.equity_usd);
  const forecastX = width - pad.right;
  const forecastY = yFor(forecastEquity);
  const highWaterY = yFor(wallet.high_watermark_usd);
  const markers = points.filter((point, index) => index > 0 && (point.filled_count > 0 || point.blocked_count > 0 || point.action !== "current")).slice(-8);
  const chartTone = wallet.window_pnl_usd >= 0 ? "text-engine" : "text-critical";
  const tapeTone: QuickChipTone = pressureTape.urgent_change_count > 0 || pressureTape.status === "protect"
    ? "critical"
    : pressureTape.tape_change_score >= 46
      ? "caution"
      : "engine";
  const pulseTone: QuickChipTone = pulse.status === "attack" || pulse.status === "probe"
    ? "engine"
    : pulse.status === "harvest" || pulse.status === "protect" || pulse.status === "refresh" || pulse.status === "cooldown"
      ? "caution"
      : pulse.status === "blocked"
        ? "critical"
        : "neutral";
  const benchmarkTone: QuickChipTone = benchmark.cash_alpha_usd >= 0 && benchmark.risk_adjusted_alpha_usd >= 0
    ? "engine"
    : benchmark.status === "protecting-capital" || benchmark.status === "learning" || benchmark.status === "lagging-selected"
      ? "caution"
      : "critical";
  const feedbackTone: QuickChipTone = alphaFeedback.status === "press"
    ? "engine"
    : alphaFeedback.status === "protect" || alphaFeedback.status === "tighten" || alphaFeedback.status === "retarget"
      ? "caution"
      : alphaFeedback.status === "idle"
        ? "critical"
        : "neutral";
  const thesisTone: QuickChipTone = thesis.status === "validated" || thesis.status === "probing"
    ? "engine"
    : thesis.status === "protect" || thesis.status === "tighten" || thesis.status === "retarget" || thesis.status === "learning"
      ? "caution"
      : "critical";
  const defenseTone: QuickChipTone = positionSituation.fresh_buy_blocked ||
    positionSituation.status === "exit" ||
    positionSituation.status === "trim" ||
    protectionCoordinator.status === "queued" ||
    protectionCoordinator.status === "blocked"
    ? "critical"
    : positionSituation.status === "harvest" || positionSituation.status === "defend" || positionSituation.status === "refresh"
      ? "caution"
      : "engine";
  const triggerTone: QuickChipTone = triggerCoverage.should_pause_fresh_buys || triggerCoverage.status === "uncovered" || triggerCoverage.status === "repair"
    ? "critical"
    : triggerCoverage.status === "covered" || triggerCoverage.status === "plan-ready"
      ? "engine"
      : "caution";

  return (
    <section className="mt-2 grid min-w-0 gap-2 border-y border-outline-variant/25 py-2 sm:mt-3 sm:py-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]" aria-label="Autonomous wallet net worth and tape reaction">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Net worth curve</p>
            <p className="mt-1 truncate text-lg font-semibold text-on-surface">{formatCurrency(wallet.equity_usd)}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Chip tone={pulseTone}>
              Make-money pulse {pulse.status}
            </Chip>
            <Chip tone={benchmarkTone}>
              Agent alpha {formatCompactSignedCurrency(benchmark.cash_alpha_usd)}
            </Chip>
            <Chip tone={feedbackTone}>
              Alpha feedback {alphaFeedback.status}
            </Chip>
            <Chip tone={thesisTone}>
              Profit thesis {thesis.status}
            </Chip>
            <Chip tone={wallet.window_pnl_usd >= 0 ? "engine" : "critical"}>
              {formatCompactSignedCurrency(wallet.window_pnl_usd)} window
            </Chip>
            <Chip tone={tapeTone}>
              Tape reaction {pressureTape.reaction_window_seconds}s
            </Chip>
            <Chip tone={defenseTone}>
              Held defense {positionSituation.status}
            </Chip>
          </div>
        </div>
        <div
          className={cn(
            "mt-2 grid min-w-0 gap-1 border-l-2 py-1.5 pl-3",
            thesisTone === "engine"
              ? "border-engine text-engine"
              : thesisTone === "critical"
                ? "border-critical text-critical"
                : "border-caution text-caution",
          )}
          aria-label="Autonomous profit thesis command"
        >
          <p className="min-w-0 truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">
            Profit thesis command
          </p>
          <p className="min-w-0 truncate text-sm font-semibold text-on-surface">
            {thesis.status.replace("-", " ")} {thesis.target_symbol ?? "desk"} · {formatCompactSignedCurrency(thesis.expected_net_edge_usd)} edge · {thesis.sizing_multiplier}x size
          </p>
          <p className="line-clamp-2 min-w-0 text-xs leading-snug text-outline">
            {thesis.next_action}
          </p>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Autonomous wallet net worth chart"
          className={cn("mt-2 h-32 w-full", chartTone)}
        >
          <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.32" />
          <line x1={pad.left} x2={width - pad.right} y1={highWaterY} y2={highWaterY} stroke="currentColor" strokeDasharray="5 8" strokeOpacity="0.22" />
          <path d={exposurePath} fill="none" stroke="currentColor" strokeDasharray="2 7" strokeOpacity="0.22" strokeWidth="2" />
          <path d={cashPath} fill="none" stroke="currentColor" strokeDasharray="7 7" strokeOpacity="0.34" strokeWidth="2" />
          <path d={equityPath} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${lastX} ${lastY} L ${forecastX} ${forecastY}`} fill="none" stroke="currentColor" strokeDasharray="8 8" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
          {markers.map((point) => (
            <circle
              key={point.id}
              cx={xFor(points.indexOf(point))}
              cy={yFor(point.equity_usd)}
              r={point.blocked_count > point.filled_count ? "4" : "5"}
              className={point.blocked_count > point.filled_count ? "fill-caution" : point.action === "stand-down" ? "fill-critical" : "fill-engine"}
              opacity="0.88"
            />
          ))}
          <circle cx={lastX} cy={lastY} r="6.5" className={wallet.window_pnl_usd >= 0 ? "fill-engine" : "fill-critical"} />
          <text x="24" y="28" className="fill-outline font-mono text-[12px] uppercase tracking-telemetry">equity solid · cash dash · exposure dots</text>
          <text x="24" y={height - 9} className="fill-outline font-mono text-[11px] uppercase tracking-telemetry">{points.length} ticks · forecast dash · fill markers</text>
        </svg>
      </div>
      <dl className="grid min-w-0 grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-2" aria-label="Autonomous wallet and pressure metrics">
        <ProfitMetric label="Make-money pulse" value={`${pulse.pulse_score}/100`} detail={`${pulse.action.replace("-", " ")} · ${pulse.target_symbol ?? "desk"}`} tone={pulseTone} />
        <ProfitMetric label="Agent alpha" value={formatCompactSignedCurrency(benchmark.cash_alpha_usd)} detail={`${benchmark.benchmark_score}/100 vs cash`} tone={benchmarkTone} />
        <ProfitMetric label="Alpha feedback" value={`${alphaFeedback.size_bias}x`} detail={`${alphaFeedback.action.replace("-", " ")} · ${alphaFeedback.feedback_score}/100`} tone={feedbackTone} />
        <ProfitMetric label="Profit thesis" value={`${thesis.thesis_score}/100`} detail={`${thesis.action.replace("-", " ")} · ${thesis.target_symbol ?? "desk"}`} tone={thesisTone} />
        <ProfitMetric label="Chase pressure" value={`${thesis.chase_urgency_score}/100`} detail={`${formatCompactCurrency(thesis.chase_budget_usd)} · ${thesis.chase_size_multiplier}x`} tone={thesis.chase_urgency_score >= 68 ? "engine" : thesis.chase_urgency_score >= 42 ? "caution" : "neutral"} />
        <ProfitMetric label="Window PnL" value={formatCompactSignedCurrency(wallet.window_pnl_usd)} detail={`${wallet.max_drawdown_pct.toFixed(1)}% drawdown`} tone={wallet.window_pnl_usd >= 0 ? "engine" : "critical"} />
        <ProfitMetric label="Exposure" value={formatCompactCurrency(wallet.exposure_usd)} detail={`${wallet.open_position_count} positions`} tone={wallet.exposure_pct > 70 ? "caution" : "engine"} />
        <ProfitMetric label="Pulse money" value={formatCompactSignedCurrency(pulse.expected_profit_per_minute_usd)} detail={`${pulse.reaction_seconds}s reaction`} tone={pulse.expected_profit_per_minute_usd > 0 ? "engine" : pulse.status === "blocked" ? "critical" : "caution"} />
        <ProfitMetric label="Last cycle" value={sessionRun.requested ? `${sessionRun.completed_ticks}/${sessionRun.requested_ticks}` : "idle"} detail={sessionRun.requested ? formatCompactSignedCurrency(sessionRun.net_pnl_usd) : loopFeedback.status} tone={sessionRun.requested && sessionRun.net_pnl_usd < 0 ? "critical" : loopFeedback.should_pause_fresh_buys ? "caution" : "engine"} />
        <ProfitMetric label="Held defense" value={positionSituation.status} detail={`${formatCompactCurrency(positionSituation.release_usd)} release`} tone={defenseTone} />
        <ProfitMetric label="Trigger cover" value={`${Math.round(triggerCoverage.coverage_pct)}%`} detail={`${formatCompactCurrency(triggerCoverage.exposed_notional_usd)} exposed`} tone={triggerTone} />
      </dl>
      <span className="sr-only" aria-label="Autonomous wallet net worth receipt">
        Wallet net worth {formatCurrency(wallet.equity_usd)}, window PnL {formatSignedCurrency(wallet.window_pnl_usd)}, exposure {formatCurrency(wallet.exposure_usd)}, drawdown {wallet.max_drawdown_pct} percent, slope {formatSignedCurrency(wallet.slope_usd_per_tick)} per tick, agent alpha {formatSignedCurrency(benchmark.cash_alpha_usd)} versus cash, risk-adjusted alpha {formatSignedCurrency(benchmark.risk_adjusted_alpha_usd)}, hot coin alpha {formatSignedCurrency(benchmark.hot_coin_alpha_usd)} against {benchmark.hot_coin_symbol ?? "none"}, benchmark score {benchmark.benchmark_score}, alpha feedback {alphaFeedback.status}, alpha feedback action {alphaFeedback.action}, size bias {alphaFeedback.size_bias}x, missed alpha {formatCurrency(alphaFeedback.missed_alpha_usd)}, learning symbol {alphaFeedback.learning_symbol ?? "none"}, profit thesis {thesis.status}, profit thesis score {thesis.thesis_score}, thesis action {thesis.action}, thesis target {thesis.target_symbol ?? "none"}, thesis expected net edge {formatSignedCurrency(thesis.expected_net_edge_usd)}, thesis sizing {thesis.sizing_multiplier}x, chase urgency {thesis.chase_urgency_score}, chase budget {formatCurrency(thesis.chase_budget_usd)}, chase size {thesis.chase_size_multiplier}x, thesis blockers {thesis.blockers.join("; ") || "none"}, make-money pulse {pulse.status}, pulse score {pulse.pulse_score}, pulse action {pulse.action}, expected pulse profit per minute {formatSignedCurrency(pulse.expected_profit_per_minute_usd)}, deploy now {formatCurrency(pulse.deploy_now_usd)}, release now {formatCurrency(pulse.release_now_usd)}, fresh buy allowed {pulse.fresh_buy_allowed ? "yes" : "no"}, protective sell required {pulse.protective_sell_required ? "yes" : "no"}, pulse blockers {pulse.blockers.join("; ") || "none"}, tape reaction {pressureTape.reaction_window_seconds} seconds, tape change score {pressureTape.tape_change_score}, urgent changes {pressureTape.urgent_change_count}, held defense {positionSituation.status}, release {formatCurrency(positionSituation.release_usd)}, protection coordinator {protectionCoordinator.status}, trigger coverage {triggerCoverage.coverage_pct} percent, exposed trigger notional {formatCurrency(triggerCoverage.exposed_notional_usd)}, portfolio leader {markBoard.leader_symbol ?? "none"} {markBoard.leader_action ?? "none"}, last cycle {sessionRun.requested ? `${sessionRun.completed_ticks}/${sessionRun.requested_ticks} ${formatSignedCurrency(sessionRun.net_pnl_usd)}` : loopFeedback.status}, next autonomous action {decision.action} on {decision.target_symbol ?? "desk"}.
      </span>
    </section>
  );
}

function QuickOpportunityRankerBoard({
  ranker,
  execution,
  scanner,
  dataGate,
  dexStream,
  feedIntegrity,
}: {
  ranker: Web3TradingState["autonomous_opportunity_ranker"];
  execution: Web3TradingState["autonomous_opportunity_rank_execution"];
  scanner: Web3TradingState["live_scanner_readiness"];
  dataGate: Web3TradingState["autonomous_data_freshness_gate"];
  dexStream: Web3TradingState["dex_stream_freshness"];
  feedIntegrity: Web3TradingState["market_feed_integrity"];
}) {
  const items = ranker.items.slice(0, 2);
  const leader = items[0] ?? null;
  const maxScore = Math.max(1, ...items.map((item) => item.opportunity_score));
  const tone = opportunityRankTone(ranker.status);
  const scannerLeader = scanner.items.find((item) => item.symbol === ranker.leader_symbol) ?? scanner.items[0] ?? null;

  return (
    <section className="mt-2 min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2 sm:mt-3 sm:p-3" aria-label="Autonomous opportunity ranker">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Opportunity rank</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {leader ? `${leader.symbol} · ${leader.action.replaceAll("-", " ")}` : "Waiting for ranked candidates"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {ranker.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <Chip tone={tone}>{ranker.status.replaceAll("-", " ")}</Chip>
              <Chip tone={execution.status === "queued" || execution.status === "applied" ? "engine" : execution.status === "blocked" ? "critical" : "neutral"}>
                rank exec {execution.status}
              </Chip>
              <Chip tone={ranker.expected_edge_usd >= 0 ? "engine" : "critical"}>{formatCompactSignedCurrency(ranker.expected_edge_usd)} edge</Chip>
              <Chip tone={ranker.recommended_size_usd > 0 ? "engine" : "neutral"}>{formatCompactCurrency(ranker.recommended_size_usd)} cap</Chip>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1 sm:hidden" aria-label="Mobile opportunity rank summary">
            <ProfitMetric label="Best rank" value={`${ranker.best_score}/100`} detail={`${ranker.ranked_count} candidates`} tone={tone} />
            <ProfitMetric label="Source trust" value={dataGate.status} detail={`${dataGate.max_next_fills} fills`} tone={dataFreshnessTone(dataGate.status, dataGate.can_trade)} />
          </div>

          <div className="hidden sm:block">
            <QuickSourceTimingStrip
              scanner={scanner}
              scannerLeader={scannerLeader}
              dataGate={dataGate}
              dexStream={dexStream}
              feedIntegrity={feedIntegrity}
            />
          </div>

          {items.length > 0 ? (
            <div className="mt-2 hidden gap-1 sm:grid sm:grid-cols-2" aria-label="Ranked autonomous memecoin candidates">
              {items.map((item) => (
                <div key={item.token_id} className={cn("grid min-w-0 gap-2 rounded-md border px-2 py-2", opportunityRankItemClass(item.action))}>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-sm font-semibold">{item.symbol}</p>
                      <span className="font-mono text-[10px] uppercase tracking-telemetry opacity-80">{item.status}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 opacity-80">{item.decision}</p>
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-current/15">
                        <div className="h-1.5 rounded-full bg-current/70" style={{ width: `${Math.max(8, Math.min(100, item.opportunity_score / maxScore * 100))}%` }} />
                      </div>
                      <p className="truncate text-right font-mono text-[10px] opacity-80">{item.opportunity_score}/100</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-right">
                    <p className="font-mono text-xs font-semibold">{formatCompactCurrency(item.max_paper_size_usd)}</p>
                    <p className={cn("font-mono text-[10px]", item.expected_edge_usd >= 0 ? "text-engine" : "text-critical")}>{formatCompactSignedCurrency(item.expected_edge_usd)}</p>
                    <p className="font-mono text-[10px] opacity-80">{item.review_after_seconds}s</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2 text-xs leading-5 text-on-surface-variant">
              Opportunity ranker is waiting for scanner, alpha, trap, and tradeability evidence.
            </p>
          )}
        </div>

        <div className="hidden min-w-0 gap-1 sm:grid sm:grid-cols-2 xl:grid-cols-2" aria-label="Opportunity rank score stack">
          <ProfitMetric label="Best rank" value={`${ranker.best_score}/100`} detail={`${ranker.ranked_count} candidates`} tone={tone} />
          <ProfitMetric label="Rank exec" value={execution.status} detail={`${formatCompactCurrency(execution.paper_size_usd)} paper`} tone={execution.status === "queued" || execution.status === "applied" ? "engine" : execution.status === "blocked" ? "critical" : "neutral"} />
          <ProfitMetric label="Attack / probe" value={`${ranker.attack_count}/${ranker.probe_count}`} detail={`${ranker.fastest_review_seconds}s fastest`} tone={ranker.attack_count > 0 ? "engine" : ranker.probe_count > 0 ? "caution" : "neutral"} />
          {leader ? (
            <>
              <ProfitMetric label="Signal" value={`${leader.scanner_score}/100`} detail={`${leader.thesis_fit_score}/100 thesis`} tone={leader.scanner_score >= 64 ? "engine" : leader.scanner_score >= 42 ? "caution" : "critical"} />
              <ProfitMetric label="Trap clear" value={`${leader.trap_clearance_score}/100`} detail={`${leader.noise_score}/100 noise`} tone={leader.trap_clearance_score >= 64 && leader.noise_score < 70 ? "engine" : leader.noise_score >= 82 ? "critical" : "caution"} />
              <ProfitMetric label="Alpha" value={`${leader.alpha_quality_score}/100`} detail={`${leader.tradeability_score}/100 fill`} tone={leader.alpha_quality_score >= 64 && leader.tradeability_score >= 52 ? "engine" : leader.alpha_quality_score < 36 ? "critical" : "caution"} />
              <ProfitMetric label="Action" value={leader.action.replaceAll("-", " ")} detail={leader.symbol} tone={opportunityRankItemTone(leader.action)} />
            </>
          ) : null}
        </div>
      </div>
      <span className="sr-only" aria-label="Autonomous opportunity ranker receipt">
        Opportunity ranker {ranker.status}; leader {ranker.leader_symbol ?? "none"}; action {ranker.leader_action ?? "none"}; best score {ranker.best_score}; expected edge {formatSignedCurrency(ranker.expected_edge_usd)}; recommended size {formatCurrency(ranker.recommended_size_usd)}; ranked candidates {ranker.ranked_count}; attack {ranker.attack_count}; probe {ranker.probe_count}; refresh {ranker.refresh_count}; blocked {ranker.blocked_count}; source trust scanner {scanner.status}; source mode {scanner.source_mode}; data gate {dataGate.status}; data action {dataGate.action}; data score {dataGate.data_score}; next refresh lane {dataGate.next_refresh_lane}; DEX stream {dexStream.status}; websocket ready {dexStream.websocket_ready ? "yes" : "no"}; feed integrity {feedIntegrity.status}; feed confidence {feedIntegrity.confidence}; rank execution {execution.status}; rank execution symbol {execution.selected_symbol ?? "none"}; rank execution action {execution.selected_action ?? "none"}; rank execution paper ready {execution.paper_trade_ready ? "yes" : "no"}; rank execution ledger applied {execution.ledger_applied ? "yes" : "no"}; rank execution size {formatCurrency(execution.paper_size_usd)}; rank execution edge {formatSignedCurrency(execution.expected_edge_usd)}; rank execution blockers {execution.blockers.join("; ") || "none"}; next action {ranker.next_action}; controls {ranker.controls.join(" ")} {execution.controls.join(" ")}
      </span>
    </section>
  );
}

function QuickProfitFeedbackRibbon({
  learning,
  digest,
  attribution,
  outcomeMemory,
  daemonMemory,
}: {
  learning: Web3TradingState["autonomous_profit_learning"];
  digest: Web3TradingState["autonomous_fill_ledger_digest"];
  attribution: Web3TradingState["autonomous_strategy_attribution"];
  outcomeMemory: Web3TradingState["autonomous_outcome_memory_governor"];
  daemonMemory: Web3TradingState["paper_daemon_memory"];
}) {
  const width = 640;
  const height = 150;
  const items = learning.items.slice(0, 6);
  const maxContribution = Math.max(1, ...items.map((item) => Math.abs(item.contribution_usd)));
  const statusTone = profitLearningTone(learning.status);
  const digestTone = fillLedgerStatusTone(digest.status);
  const lastFillTone = fillAuditTone(digest.last_fill_verdict);
  const memoryTone: QuickChipTone = outcomeMemory.status === "press" || outcomeMemory.status === "compound"
    ? "engine"
    : outcomeMemory.status === "protect" || outcomeMemory.status === "cooldown"
      ? "critical"
      : outcomeMemory.status === "selective" || outcomeMemory.status === "learning"
        ? "caution"
        : "neutral";
  const bestLane = attribution.best_lane ? shortLaneLabel(attribution.best_lane) : "none";
  const worstLane = attribution.worst_lane ? shortLaneLabel(attribution.worst_lane) : "none";

  return (
    <section className="mt-2 rounded-md border border-engine/20 bg-surface-dim/15 p-2 sm:mt-3 sm:p-3" aria-label="Autonomous profit feedback monitor">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Profit feedback</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {learning.status.replaceAll("-", " ")} · {learning.size_multiplier}x next size · {learning.cadence_seconds}s cadence
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {learning.next_action}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={statusTone}>{learning.confidence_score}/100 learn</Chip>
              <Chip tone={digestTone}>{digest.recommended_discipline.replaceAll("-", " ")}</Chip>
              <Chip tone={lastFillTone}>{digest.next_fill_permission.replaceAll("-", " ")}</Chip>
              <Chip tone={memoryTone}>{outcomeMemory.next_bias.replaceAll("-", " ")}</Chip>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Autonomous profit feedback contribution chart"
            className="mt-2 h-36 w-full max-w-full min-w-0 text-engine"
          >
            <rect width={width} height={height} rx="8" className="fill-void" opacity="0.32" />
            <line x1="318" x2="318" y1="22" y2="106" stroke="currentColor" strokeOpacity="0.24" strokeWidth="2" />
            <text x="14" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">paper contribution by feedback lane</text>
            <text x="438" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">confidence / cadence</text>
            {items.map((item, index) => {
              const y = 30 + index * 18;
              const contributionWidth = Math.max(4, Math.abs(item.contribution_usd) / maxContribution * 150);
              const contributionX = item.contribution_usd >= 0 ? 318 : 318 - contributionWidth;
              const confidenceWidth = Math.max(4, item.confidence_score / 100 * 96);
              return (
                <g key={item.id}>
                  <text x="14" y={y + 9} className="fill-on-surface font-mono text-[10px] font-semibold">{item.label}</text>
                  <rect x={contributionX} y={y + 2} width={contributionWidth} height="8" rx="4" className={item.contribution_usd >= 0 ? "fill-engine" : "fill-critical"} opacity="0.78" />
                  <text x="334" y={y + 9} className={cn("font-mono text-[10px] font-semibold", item.contribution_usd >= 0 ? "fill-engine" : "fill-critical")}>{formatCompactSignedCurrency(item.contribution_usd)}</text>
                  <rect x="450" y={y + 2} width="96" height="8" rx="4" className="fill-outline" opacity="0.13" />
                  <rect x="450" y={y + 2} width={confidenceWidth} height="8" rx="4" className={profitLearningItemSvgClass(item.status)} opacity="0.8" />
                  <text x="556" y={y + 9} className="fill-outline font-mono text-[9px]">{item.confidence_score}/100 · {item.cadence_seconds}s</text>
                </g>
              );
            })}
            <text x="14" y={height - 9} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">green contributes · red drags · right bars decide next loop pressure</text>
          </svg>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-1 xl:grid-cols-1" aria-label="Autonomous profit feedback metrics">
          <ProfitMetric label="Paper PnL" value={formatCompactSignedCurrency(learning.net_pnl_usd)} detail={`${formatCompactSignedCurrency(learning.realized_pnl_usd)} realized`} tone={learning.net_pnl_usd >= 0 ? "engine" : "critical"} />
          <ProfitMetric label="Last fill audit" value={`${digest.last_fill_profit_score}/100`} detail={`${digest.last_fill_verdict} · ${formatCompactSignedCurrency(digest.last_fill_edge_usd)}`} tone={lastFillTone} />
          <ProfitMetric label="Expectancy" value={formatCompactSignedCurrency(learning.expectancy_usd)} detail={`${digest.recent_fill_count} fills`} tone={learning.expectancy_usd >= 0 ? "engine" : "critical"} />
          <ProfitMetric label="Best lane" value={bestLane} detail={formatCompactSignedCurrency(attribution.net_contribution_usd)} tone={attribution.net_contribution_usd >= 0 ? "engine" : "critical"} />
          <ProfitMetric label="Worst drag" value={learning.worst_drag ?? worstLane} detail={`${attribution.recommended_size_bias}x bias`} tone={learning.worst_drag || attribution.worst_lane ? "caution" : "engine"} />
          <ProfitMetric label="Loop memory" value={daemonMemory.status} detail={`${formatCompactSignedCurrency(daemonMemory.window_pnl_usd)} window`} tone={daemonMemory.window_pnl_usd >= 0 ? "engine" : daemonMemory.pause_new_entries ? "critical" : "caution"} />
          <ProfitMetric label="Outcome" value={`${outcomeMemory.memory_score}/100`} detail={`${outcomeMemory.size_multiplier}x · ${Math.round(outcomeMemory.win_rate_pct)}% win`} tone={memoryTone} />
        </div>
      </div>
      <span className="sr-only" aria-label="Autonomous profit feedback receipt">
        Profit feedback {learning.status}; confidence {learning.confidence_score}; net paper PnL {formatSignedCurrency(learning.net_pnl_usd)}; realized {formatSignedCurrency(learning.realized_pnl_usd)}; open {formatSignedCurrency(learning.open_pnl_usd)}; expectancy {formatSignedCurrency(learning.expectancy_usd)}; next size {learning.size_multiplier}x; cadence {learning.cadence_seconds} seconds; deploy bias {formatCurrency(learning.deploy_bias_usd)}; release bias {formatCurrency(learning.release_bias_usd)}; best signal {learning.best_signal ?? "none"}; worst drag {learning.worst_drag ?? "none"}; fill digest {digest.status}; recent fills {digest.recent_fill_count}; last fill verdict {digest.last_fill_verdict}; last fill profit score {digest.last_fill_profit_score}; last fill edge {formatSignedCurrency(digest.last_fill_edge_usd)}; last fill quality {digest.last_fill_quality_score}; last fill shortfall {formatCurrency(digest.last_fill_shortfall_usd)}; next fill permission {digest.next_fill_permission}; strategy attribution {attribution.status}; best lane {attribution.best_lane ?? "none"}; worst lane {attribution.worst_lane ?? "none"}; outcome memory {outcomeMemory.status}; next bias {outcomeMemory.next_bias}; daemon memory {daemonMemory.status}; daemon window PnL {formatSignedCurrency(daemonMemory.window_pnl_usd)}.
      </span>
    </section>
  );
}

function QuickPositionWatchStrip({
  situation,
  markBoard,
  protection,
  scalpExit,
  exitLadder,
}: {
  situation: Web3TradingState["autonomous_position_situation_board"];
  markBoard: Web3TradingState["autonomous_portfolio_mark_board"];
  protection: Web3TradingState["autonomous_protection_coordinator"];
  scalpExit: Web3TradingState["autonomous_scalp_exit_autopilot"];
  exitLadder: Web3TradingState["position_exit_ladder"];
}) {
  const width = 640;
  const height = 128;
  const situationByPosition = new Map(situation.items.map((item) => [item.position_id, item]));
  const markByPosition = new Map(markBoard.items.map((item) => [item.position_id, item]));
  const rows = situation.items.length > 0
    ? situation.items.slice(0, 4).map((item) => {
        const mark = markByPosition.get(item.position_id);
        return {
          id: item.id,
          symbol: item.symbol,
          action: item.action,
          status: item.status,
          score: item.situation_score,
          releaseUsd: Math.max(item.release_usd, mark?.suggested_release_usd ?? 0),
          keepUsd: item.keep_usd,
          pnlUsd: item.pnl_usd,
          pnlPct: item.pnl_pct,
          riskUsd: item.capital_at_risk_usd,
          reviewSeconds: item.review_after_seconds,
          blocksFreshBuy: item.blocks_fresh_buy,
          nextAction: item.next_action,
        };
      })
    : markBoard.items.slice(0, 4).map((item) => ({
        id: item.id,
        symbol: item.symbol,
        action: item.action,
        status: item.status,
        score: item.action === "exit" ? 90 : item.action === "trim" || item.action === "protect" ? 70 : item.action === "harvest" ? 58 : 34,
        releaseUsd: item.suggested_release_usd,
        keepUsd: Math.max(0, item.current_value_usd - item.suggested_release_usd),
        pnlUsd: item.unrealized_pnl_usd,
        pnlPct: item.pnl_pct,
        riskUsd: Math.max(0, item.current_value_usd * Math.max(0, item.drawdown_from_peak_pct) / 100),
        reviewSeconds: item.review_after_seconds,
        blocksFreshBuy: item.action === "exit" || item.action === "trim" || item.action === "protect",
        nextAction: item.reason,
      }));
  const leader = rows[0] ?? null;
  const maxRelease = Math.max(1, ...rows.map((row) => row.releaseUsd));
  const maxRisk = Math.max(1, ...rows.map((row) => row.riskUsd));
  const boardTone = positionWatchTone(situation.status, situation.fresh_buy_blocked, protection.status);
  const releaseTotal = Math.max(situation.release_usd, markBoard.release_pressure_usd, protection.release_usd, scalpExit.release_usd);
  const protectedProfit = Math.max(situation.protected_profit_usd, protection.ready_release_usd, scalpExit.protected_profit_usd, exitLadder.protected_profit_usd);

  return (
    <section className="mt-2 rounded-md border border-outline-variant/25 bg-void/20 p-2 sm:mt-3 sm:p-3" aria-label="Autonomous position watch">
      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Position watch</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {leader ? `${leader.symbol} · ${String(leader.action).replaceAll("-", " ")}` : "No open paper positions"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {situation.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={boardTone}>{situation.status}</Chip>
              <Chip tone={situation.fresh_buy_blocked ? "critical" : "engine"}>{situation.fresh_buy_blocked ? "buys paused" : "buys allowed"}</Chip>
              <Chip tone={releaseTotal > 0 ? "caution" : "neutral"}>{formatCompactCurrency(releaseTotal)} release</Chip>
            </div>
          </div>
          {rows.length > 0 ? (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="Autonomous held position pressure chart"
              className="mt-2 h-32 w-full max-w-full min-w-0 text-engine"
            >
              <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.28" />
              <text x="14" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">held coin pressure</text>
              <text x="330" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">release / risk</text>
              {rows.map((row, index) => {
                const y = 30 + index * 22;
                const scoreWidth = Math.max(5, row.score / 100 * 220);
                const releaseWidth = Math.max(4, row.releaseUsd / maxRelease * 92);
                const riskWidth = Math.max(4, row.riskUsd / maxRisk * 92);
                const actionTone = positionWatchActionSvgClass(String(row.action));
                return (
                  <g key={row.id}>
                    <text x="14" y={y + 9} className="fill-on-surface font-mono text-[11px] font-semibold">{row.symbol}</text>
                    <text x="14" y={y + 20} className="fill-outline font-mono text-[9px]">{String(row.action)} · {row.reviewSeconds}s</text>
                    <rect x="92" y={y + 2} width="220" height="8" rx="4" className="fill-outline" opacity="0.12" />
                    <rect x="92" y={y + 2} width={scoreWidth} height="8" rx="4" className={actionTone} opacity="0.8" />
                    <text x="330" y={y + 9} className={cn("font-mono text-[10px] font-semibold", row.pnlUsd >= 0 ? "fill-engine" : "fill-critical")}>{formatCompactSignedCurrency(row.pnlUsd)}</text>
                    <rect x="430" y={y + 1} width="92" height="7" rx="3.5" className="fill-outline" opacity="0.12" />
                    <rect x="430" y={y + 1} width={releaseWidth} height="7" rx="3.5" className="fill-caution" opacity="0.78" />
                    <rect x="430" y={y + 12} width="92" height="5" rx="2.5" className="fill-outline" opacity="0.12" />
                    <rect x="430" y={y + 12} width={riskWidth} height="5" rx="2.5" className="fill-critical" opacity="0.64" />
                    <text x="534" y={y + 9} className="fill-outline font-mono text-[9px]">{formatCompactCurrency(row.releaseUsd)}</text>
                    <text x="534" y={y + 20} className="fill-outline font-mono text-[9px]">{formatCompactCurrency(row.riskUsd)} risk</text>
                  </g>
                );
              })}
              <text x="92" y={height - 8} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">score bar = action pressure - top right = paper PnL - bars = release and risk</text>
            </svg>
          ) : (
            <p className="mt-3 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2 text-xs leading-5 text-on-surface-variant">
              No open paper positions; the agent is waiting for a qualified entry before portfolio defense can activate.
            </p>
          )}
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-1 2xl:grid-cols-1" aria-label="Autonomous position watch metrics">
          <ProfitMetric label="Held" value={`${situation.held_count}`} detail={`${situation.urgent_count} urgent`} tone={situation.urgent_count > 0 ? "critical" : situation.held_count > 0 ? "engine" : "neutral"} />
          <ProfitMetric label="Release" value={formatCompactCurrency(releaseTotal)} detail={`${formatCompactCurrency(situation.keep_usd)} keep`} tone={releaseTotal > 0 ? "caution" : "engine"} />
          <ProfitMetric label="Protected" value={formatCompactCurrency(protectedProfit)} detail={`${formatCompactCurrency(situation.capital_at_risk_usd)} at risk`} tone={protectedProfit >= situation.capital_at_risk_usd ? "engine" : situation.capital_at_risk_usd > 0 ? "caution" : "neutral"} />
          <ProfitMetric label="Coordinator" value={protection.status} detail={protection.selected_symbol ?? protection.selected_source ?? "none"} tone={protection.status === "applied" || protection.status === "queued" ? "engine" : protection.status === "blocked" ? "critical" : "neutral"} />
          <ProfitMetric label="Scalp exit" value={scalpExit.selected_action.replaceAll("-", " ")} detail={`${scalpExit.scalp_score}/100 · ${scalpExit.fastest_decision_seconds}s`} tone={scalpExit.status === "eject" || scalpExit.status === "blocked" ? "critical" : scalpExit.release_usd > 0 ? "caution" : "engine"} />
          <ProfitMetric label="Next review" value={`${situation.fastest_review_seconds}s`} detail={leader?.nextAction ?? situation.next_action} tone={boardTone} />
        </div>
      </div>
      <span className="sr-only" aria-label="Autonomous position watch receipt">
        Position watch {situation.status}; held {situation.held_count}; leader {situation.leader_symbol ?? "none"} action {situation.leader_action ?? "none"}; fresh buys blocked {situation.fresh_buy_blocked ? "yes" : "no"}; release {formatCurrency(releaseTotal)}; keep {formatCurrency(situation.keep_usd)}; protected profit {formatCurrency(protectedProfit)}; capital at risk {formatCurrency(situation.capital_at_risk_usd)}; protection coordinator {protection.status}; selected protection {protection.selected_symbol ?? "none"}; scalp exit {scalpExit.status}; scalp action {scalpExit.selected_action}; scalp paper ready {scalpExit.paper_trade_ready ? "yes" : "no"}; exit ladder protected profit {formatCurrency(exitLadder.protected_profit_usd)}; next action {situation.next_action}.
      </span>
    </section>
  );
}

function QuickSourceTimingStrip({
  scanner,
  scannerLeader,
  dataGate,
  dexStream,
  feedIntegrity,
}: {
  scanner: Web3TradingState["live_scanner_readiness"];
  scannerLeader: Web3TradingState["live_scanner_readiness"]["items"][number] | null;
  dataGate: Web3TradingState["autonomous_data_freshness_gate"];
  dexStream: Web3TradingState["dex_stream_freshness"];
  feedIntegrity: Web3TradingState["market_feed_integrity"];
}) {
  const lanes = [
    {
      id: "stream",
      label: "Stream",
      value: dexStream.websocket_ready ? "socket ready" : dexStream.status.replaceAll("-", " "),
      detail: `${dexStream.stream_count} stream · ${dexStream.rest_fallback_count} REST`,
      score: dexStream.source_coverage_pct,
      tone: dexStreamTone(dexStream.status, dexStream.websocket_ready),
    },
    {
      id: "scanner",
      label: "Scanner",
      value: scanner.status.replaceAll("-", " "),
      detail: scannerLeader ? `${scannerLeader.symbol} · ${scannerLeader.signal_to_noise_ratio}/100 S/N` : `${scanner.source_coverage_pct}% source`,
      score: scannerLeader?.scanner_score ?? Math.round((scanner.source_coverage_pct + scanner.mapped_coverage_pct) / 2),
      tone: liveScannerTone(scanner.status),
    },
    {
      id: "proof",
      label: "Proof",
      value: dataGate.action.replaceAll("-", " "),
      detail: dataGate.next_refresh_lane === "none" ? `${dataGate.max_next_fills} fills allowed` : dataGate.next_refresh_lane.replaceAll("-", " "),
      score: dataGate.data_score,
      tone: dataFreshnessTone(dataGate.status, dataGate.can_trade),
    },
    {
      id: "feed",
      label: "Feed",
      value: feedIntegrity.status,
      detail: `${feedIntegrity.freshness_seconds}s / ${feedIntegrity.max_allowed_staleness_seconds}s`,
      score: feedIntegrity.confidence,
      tone: feedIntegrityTone(feedIntegrity.status),
    },
  ];
  const nextAction = dataGate.can_trade
    ? `Source trust allows ${dataGate.max_next_fills} bounded local paper fill${dataGate.max_next_fills === 1 ? "" : "s"}.`
    : dataGate.next_action;

  return (
    <div className="mt-3 rounded-md border border-outline-variant/20 bg-surface-dim/15 p-2" aria-label="Autonomous source timing strip">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Source trust</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{nextAction}</p>
        </div>
        <Chip tone={dataGate.can_trade ? "engine" : dataGate.status === "blocked" ? "critical" : "caution"}>
          {dataGate.can_trade ? "trade evidence ok" : dataGate.next_refresh_lane.replaceAll("-", " ")}
        </Chip>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {lanes.map((lane) => (
          <div key={lane.id} className="min-w-0 rounded-md border border-outline-variant/15 bg-void/20 p-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{lane.label}</p>
              <p className={cn("shrink-0 font-mono text-[10px] font-semibold", sourceTimingTextClass(lane.tone))}>{Math.round(lane.score)}/100</p>
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-on-surface">{lane.value}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{lane.detail}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-outline-variant/20">
              <div className={cn("h-1.5 rounded-full", sourceTimingBarClass(lane.tone))} style={{ width: `${Math.max(5, Math.min(100, lane.score))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">
        Source trust strip: DEX stream {dexStream.status}, websocket {dexStream.websocket_ready ? "ready" : "not ready"}, scanner {scanner.status}, data gate {dataGate.status}, next refresh lane {dataGate.next_refresh_lane}, feed integrity {feedIntegrity.status}, feed confidence {feedIntegrity.confidence}.
      </span>
    </div>
  );
}

function opportunityRankTone(status: Web3TradingState["autonomous_opportunity_ranker"]["status"]): QuickChipTone {
  if (status === "attack-ready" || status === "probe-ready") return "engine";
  if (status === "protect" || status === "blocked") return "critical";
  if (status === "retarget" || status === "refresh" || status === "learning") return "caution";
  return "neutral";
}

function opportunityRankItemTone(action: Web3TradingState["autonomous_opportunity_ranker"]["items"][number]["action"]): QuickChipTone {
  if (action === "paper-attack" || action === "paper-probe") return "engine";
  if (action === "protect-capital" || action === "block") return "critical";
  if (action === "refresh-proof") return "caution";
  return "neutral";
}

function profitLearningTone(status: Web3TradingState["autonomous_profit_learning"]["status"]): QuickChipTone {
  if (status === "press" || status === "selective") return "engine";
  if (status === "protect") return "critical";
  if (status === "tighten" || status === "learning") return "caution";
  return "neutral";
}

function profitLearningItemSvgClass(status: Web3TradingState["autonomous_profit_learning"]["items"][number]["status"]) {
  if (status === "pass") return "fill-engine";
  if (status === "fail") return "fill-critical";
  return "fill-caution";
}

function positionWatchTone(
  status: Web3TradingState["autonomous_position_situation_board"]["status"],
  freshBuyBlocked: boolean,
  protectionStatus: Web3TradingState["autonomous_protection_coordinator"]["status"],
): QuickChipTone {
  if (freshBuyBlocked || status === "exit" || protectionStatus === "blocked") return "critical";
  if (status === "harvest" || status === "trim" || status === "defend" || status === "refresh" || protectionStatus === "queued") return "caution";
  if (status === "watch" || status === "idle") return "neutral";
  return "engine";
}

function positionWatchActionSvgClass(action: string) {
  if (action === "exit") return "fill-critical";
  if (action === "trim" || action === "harvest" || action === "defend" || action === "protect" || action === "refresh") return "fill-caution";
  if (action === "press") return "fill-engine";
  return "fill-outline";
}

function dexStreamTone(
  status: Web3TradingState["dex_stream_freshness"]["status"],
  websocketReady: boolean,
): QuickChipTone {
  if (websocketReady || status === "hot" || status === "ready") return "engine";
  if (status === "blocked") return "critical";
  if (status === "backfill" || status === "watch") return "caution";
  return "demo";
}

function liveScannerTone(status: Web3TradingState["live_scanner_readiness"]["status"]): QuickChipTone {
  if (status === "attack-ready" || status === "probe-ready") return "engine";
  if (status === "blocked") return "critical";
  if (status === "refresh-first") return "caution";
  if (status === "sample") return "demo";
  return "neutral";
}

function feedIntegrityTone(status: Web3TradingState["market_feed_integrity"]["status"]): QuickChipTone {
  if (status === "healthy") return "engine";
  if (status === "fallback") return "critical";
  if (status === "degraded" || status === "stale") return "caution";
  return "demo";
}

function sourceTimingTextClass(tone: QuickChipTone) {
  if (tone === "engine") return "text-engine";
  if (tone === "critical") return "text-critical";
  if (tone === "caution") return "text-caution";
  if (tone === "violet") return "text-violet";
  if (tone === "demo") return "text-demo";
  return "text-outline";
}

function sourceTimingBarClass(tone: QuickChipTone) {
  if (tone === "engine") return "bg-engine";
  if (tone === "critical") return "bg-critical";
  if (tone === "caution") return "bg-caution";
  if (tone === "violet") return "bg-violet";
  if (tone === "demo") return "bg-demo";
  return "bg-outline";
}

function opportunityRankItemClass(action: Web3TradingState["autonomous_opportunity_ranker"]["items"][number]["action"]) {
  return nextMoveToneClass(opportunityRankItemTone(action));
}

function QuickAutonomousWiringMap({
  state,
  wiredPaths,
  authorityPath,
}: {
  state: Web3TradingState;
  wiredPaths: QuickWiringPath[];
  authorityPath: QuickWiringPath[];
}) {
  const market = state.autonomous_market_evidence_fusion;
  const candle = state.autonomous_candle_conviction;
  const route = state.autonomous_route_refresh_execution;
  const queueExecution = state.autonomous_action_queue_execution;
  const adapter = state.autonomous_execution_adapter_readiness;
  const wallet = state.autonomous_wallet_telemetry;
  const stages = [
    {
      id: "signal",
      label: "Signal",
      value: market.leader_symbol ? `${market.leader_symbol} ${market.leader_action?.replaceAll("-", " ") ?? market.status}` : market.status,
      detail: `${market.fusion_score}/100 edge · ${market.provider_lane.replaceAll("-", " ")}`,
      tone: market.can_trade ? "engine" : market.status === "blocked" || market.status === "protect" ? "critical" : "caution",
    },
    {
      id: "chart",
      label: "Chart",
      value: `${candle.status} ${candle.target_symbol ?? "target"}`,
      detail: `${candle.conviction_score}/100 conviction · ${candle.refresh_required ? "refresh" : "fresh"}`,
      tone: candle.status === "confirm" || candle.status === "probe" ? "engine" : candle.status === "reject" || candle.status === "protect" ? "critical" : "caution",
    },
    {
      id: "route",
      label: "Route",
      value: route.selected_symbol ? `${route.status} ${route.selected_symbol}` : route.status,
      detail: `${route.selected_lane?.replaceAll("-", " ") ?? "no lane"} · ${route.can_request_readonly_quote ? "read ready" : route.route_refresh_required ? "repair" : "idle"}`,
      tone: route.status === "ready" || route.status === "requesting" ? "engine" : route.status === "blocked" ? "critical" : route.route_refresh_required ? "caution" : "neutral",
    },
    {
      id: "paper",
      label: "Paper",
      value: queueExecution.selected_symbol ? `${queueExecution.selected_action.replaceAll("-", " ")} ${queueExecution.selected_symbol}` : queueExecution.status,
      detail: `${formatCompactCurrency(queueExecution.paper_size_usd)} size · ${queueExecution.paper_trade_ready ? "ready" : queueExecution.status}`,
      tone: queueExecution.paper_trade_ready || queueExecution.status === "applied" ? "engine" : queueExecution.status === "blocked" ? "critical" : "caution",
    },
    {
      id: "wallet",
      label: "Wallet",
      value: `${wallet.status} ${formatCompactCurrency(wallet.equity_usd)}`,
      detail: `${formatCompactSignedCurrency(wallet.window_pnl_usd)} window · ${wallet.open_position_count} held`,
      tone: wallet.status === "compounding" || wallet.status === "harvest" ? "engine" : wallet.status === "protect" || wallet.status === "cooldown" ? "critical" : "caution",
    },
    {
      id: "live",
      label: "Live",
      value: adapter.status.replaceAll("-", " "),
      detail: `${adapter.active_adapter.replaceAll("-", " ")} · ${adapter.submit_ready ? "submit" : adapter.paper_fallback_active ? "paper fallback" : "gated"}`,
      tone: adapter.submit_ready || adapter.status === "swap-v2-ready" ? "engine" : adapter.status === "blocked" ? "critical" : adapter.paper_fallback_active ? "demo" : "caution",
    },
  ] satisfies Array<{
    id: string;
    label: string;
    value: string;
    detail: string;
    tone: QuickChipTone;
  }>;
  const laneWidth = stages.length > 1 ? 100 / (stages.length - 1) : 100;

  return (
    <section className="mt-3 rounded-md border border-outline-variant/30 bg-surface-dim/15 p-2 sm:p-3" aria-label="Autonomous wiring map">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Wiring map</p>
          <p className="mt-1 break-words text-sm font-semibold text-on-surface">
            {market.leader_symbol ?? queueExecution.selected_symbol ?? "Desk"} · {state.autonomous_now_decision.action.replaceAll("-", " ")}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={state.market_source.status === "live" ? "engine" : "demo"}>{state.market_source.label}</Chip>
          <Chip tone={state.execution_gate.live_execution_enabled ? "critical" : "demo"}>
            {state.execution_gate.live_execution_enabled ? "live armed" : "paper locked"}
          </Chip>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-outline-variant/20 bg-void/20 p-2" aria-label="Autonomous signal to wallet pipeline">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6">
          {stages.map((stage, index) => (
            <div key={stage.id} className={cn("min-w-0 rounded-md border px-2 py-1.5", missionStepToneClass(stage.tone))}>
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/35 font-mono text-[10px]">
                  {index + 1}
                </span>
                <p className="truncate font-mono text-[10px] uppercase tracking-telemetry">{stage.label}</p>
              </div>
              <p className="mt-1 truncate text-xs font-semibold capitalize">{stage.value}</p>
              <p className="mt-0.5 hidden truncate text-[11px] leading-4 opacity-80 sm:block">{stage.detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 hidden h-8 items-center px-2 sm:flex" aria-hidden="true">
          {stages.map((stage, index) => (
            <div key={`${stage.id}-rail`} className="relative flex h-full min-w-0 flex-1 items-center">
              <span className={cn("h-2 w-2 rounded-full", wiringDotClass(stage.tone))} />
              {index < stages.length - 1 ? (
                <span
                  className={cn("ml-1 h-px flex-1", stage.tone === "critical" ? "bg-critical/45" : stage.tone === "engine" ? "bg-engine/45" : "bg-outline-variant/45")}
                  style={{ minWidth: `${Math.max(12, laneWidth / 2)}px` }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 hidden gap-2 sm:grid xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2" aria-label="Visible wired trading paths">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Wired paths</p>
            <span className="font-mono text-[10px] uppercase tracking-telemetry text-outline">visible</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-5 xl:grid-cols-2">
            {wiredPaths.map((path) => (
              <div key={path.label} className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
                <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{path.label}</p>
                <p className={cn("mt-1 truncate text-xs font-semibold capitalize", path.tone)}>{path.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2" aria-label="Autonomous authority path">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Authority path</p>
            <span className="font-mono text-[10px] uppercase tracking-telemetry text-outline">backend decides</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-5">
            {authorityPath.map((step) => (
              <div key={step.label} className="min-w-0 border-l border-outline-variant/25 pl-2">
                <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{step.label}</p>
                <p className={cn("mt-1 truncate text-xs font-semibold capitalize", step.tone)}>{step.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only" aria-label="Autonomous wiring map receipt">
        Signal to wallet pipeline: market evidence {market.status} on {market.provider_lane}; candle conviction {candle.status}; route proof {route.status} with lane {route.selected_lane ?? "none"}; paper queue {queueExecution.status}; wallet {wallet.status}; execution adapter {adapter.status}. Auto watch schedules browser wakes, read-only market and route evidence can refresh first, backend autonomous loop ticks own local paper trade and protect decisions, and live swaps remain credential gated unless explicit live gates are armed.
      </span>
      <span className="sr-only" aria-label="Autonomous authority path receipt">
        Auto watch schedules the browser wake, source refresh can run first, backend autonomous loop tick owns trade and protect decisions, the local paper ledger records bounded fills, and live swaps remain locked unless explicit credentials and gates are configured.
      </span>
      <span className="sr-only" aria-label="What is wired">
        Wired paths: Paper ledger, DEX read, route proof, candle evidence, wallet feedback, strategy selector, throttle, command spine, readiness gate, batch rehearsal, browser auto-watch, and execution adapter readiness are visible here; live signing stays credential-gated.
      </span>
    </section>
  );
}

function wiringDotClass(tone: QuickChipTone) {
  if (tone === "engine") return "bg-engine";
  if (tone === "critical") return "bg-critical";
  if (tone === "caution") return "bg-caution";
  if (tone === "demo") return "bg-demo";
  if (tone === "violet") return "bg-violet";
  return "bg-outline";
}

function describeNowDecisionClientPath(
  decision: Web3TradingState["autonomous_now_decision"],
  routeRefresh: Web3TradingState["autonomous_route_refresh_execution"],
  marketSource: Web3TradingState["market_source"],
) {
  if (decision.action === "stand-down") return "Shows the blocker stack and leaves the paper ledger unchanged.";
  if ((decision.action === "refresh-route" || decision.route_refresh_required) && !routeRefresh.can_request_readonly_quote && marketSource.mode === "sample") return `Switches to read-only Live DEX evidence because ${routeRefresh.blockers[0] ?? "sample mode cannot request a route quote"}.`;
  if ((decision.action === "refresh-route" || decision.route_refresh_required) &&
    !routeRefresh.can_request_readonly_quote &&
    routeRefresh.status === "idle" &&
    !routeRefresh.route_refresh_required) return "Refreshes the current read until a routed intent, quote sample, or position review creates route work.";
  if ((decision.action === "refresh-route" || decision.route_refresh_required) && !routeRefresh.can_request_readonly_quote) return `Repairs market and route evidence because ${routeRefresh.blockers[0] ?? "the quote request is not available"}.`;
  if (decision.action === "refresh-route" || decision.route_refresh_required) return "Requests one read-only route quote refresh, then rebuilds the paper runway.";
  if (decision.action === "refresh-candles" || decision.chart_proof_required) return "Records chart proof when needed, then hands the backend the next paper-loop tick.";
  if (decision.button_label === "Run minute") return "Runs the bounded next-minute paper plan with server caps.";
  if (decision.action === "paper-buy" || decision.action === "paper-probe" || decision.action === "paper-sell" || decision.action === "protect" || decision.action === "run-loop") return "Hands the backend one bounded paper-loop tick for the next fill, protect, cooldown, or pause decision.";
  return "Refreshes the read and waits for a higher-confidence paper opportunity.";
}

function QuickAgentActionOutcomePanel({
  outcome,
  state,
  busy,
}: {
  outcome: QuickAgentActionOutcome | null;
  state: Web3TradingState;
  busy: QuickBusyState | null;
}) {
  const current = outcome ?? buildQuickAgentWaitingOutcome(state);
  const loopImpact = state.autonomous_loop_impact_auditor;
  const actionTone = busy ? "caution" : current.tone;
  const impactTone = loopImpactTone(loopImpact.status);
  const statusText = busy
    ? `${busy.replaceAll("-", " ")} running`
    : outcome
      ? current.label
      : "waiting";
  return (
    <section className="mt-3 rounded-md border border-outline-variant/30 bg-surface-dim/15 p-2 sm:p-3" aria-label="Agent action outcome">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Agent action outcome</p>
          <p className="mt-1 break-words text-sm font-semibold text-on-surface">
            {statusText}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {busy ? "The agent is waiting for the backend to return the next audited state." : current.summary}
          </p>
        </div>
        <Chip tone={actionTone}>{current.afterDecision}</Chip>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-5" aria-label="Agent action outcome metrics">
        <ProfitMetric label="Wallet delta" value={formatCompactSignedCurrency(current.walletDeltaUsd)} detail={`${formatCompactSignedCurrency(current.windowPnlDeltaUsd)} window`} tone={current.walletDeltaUsd >= 0 ? "engine" : "critical"} />
        <ProfitMetric label="Exposure" value={formatCompactSignedCurrency(current.exposureDeltaUsd)} detail={`${current.tradeDelta >= 0 ? "+" : ""}${current.tradeDelta} trades`} tone={current.exposureDeltaUsd <= 0 ? "engine" : "caution"} />
        <ProfitMetric label="Loop result" value={current.loopStatus} detail={`${current.fillDelta >= 0 ? "+" : ""}${current.fillDelta} fills · ${current.blockDelta >= 0 ? "+" : ""}${current.blockDelta} blocks`} tone={current.fillDelta > 0 ? "engine" : current.blockDelta > 0 ? "critical" : "neutral"} />
        <ProfitMetric label="Impact audit" value={`${loopImpact.impact_score}/100`} detail={loopImpact.action.replaceAll("-", " ")} tone={impactTone} />
        <ProfitMetric label="Proof state" value={current.routeStatus} detail={`chart ${current.chartStatus}`} tone={current.routeStatus === "ready" || current.chartStatus === "ready" ? "engine" : current.routeStatus === "blocked" || current.chartStatus === "blocked" ? "critical" : "caution"} />
      </dl>

      <div className="mt-2 grid gap-1 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-label="Agent action before and after">
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 px-2 py-1.5">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Decision path</p>
          <p className="mt-1 truncate text-xs font-semibold text-on-surface">{current.beforeDecision} / {current.afterDecision}</p>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 px-2 py-1.5">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Next</p>
          <p className="mt-1 truncate text-xs font-semibold text-on-surface">{current.nextAction}</p>
        </div>
      </div>

      <span className="sr-only" aria-label="Agent action outcome receipt">
        Agent action outcome {outcome ? "recorded" : "waiting"}; label {current.label}; kind {current.kind}; before decision {current.beforeDecision}; after decision {current.afterDecision}; wallet delta {formatSignedCurrency(current.walletDeltaUsd)}; window PnL delta {formatSignedCurrency(current.windowPnlDeltaUsd)}; exposure delta {formatSignedCurrency(current.exposureDeltaUsd)}; trade delta {current.tradeDelta}; cycle delta {current.cycleDelta}; fill delta {current.fillDelta}; block delta {current.blockDelta}; impact status {loopImpact.status}; impact action {loopImpact.action}; impact score {loopImpact.impact_score}; impact reduce frequency {loopImpact.must_reduce_frequency ? "yes" : "no"}; route status {current.routeStatus}; chart status {current.chartStatus}; loop status {current.loopStatus}; session status {current.sessionStatus}; boundary {current.boundary}; next action {current.nextAction}.
      </span>
    </section>
  );
}

function buildQuickAgentWaitingOutcome(state: Web3TradingState): QuickAgentActionOutcome {
  return {
    id: "waiting",
    kind: "refresh",
    label: "Waiting for first action",
    summary: "Press the recommended Now action or start Auto watch to record the next audited agent outcome.",
    nextAction: state.autonomous_now_decision.next_action,
    beforeDecision: state.autonomous_now_decision.action.replaceAll("-", " "),
    afterDecision: state.autonomous_now_decision.action.replaceAll("-", " "),
    walletDeltaUsd: 0,
    windowPnlDeltaUsd: 0,
    exposureDeltaUsd: 0,
    tradeDelta: 0,
    cycleDelta: 0,
    fillDelta: 0,
    blockDelta: 0,
    routeStatus: state.autonomous_route_refresh_execution.status,
    chartStatus: state.autonomous_candle_refresh.requested ? state.autonomous_candle_refresh.status : state.autonomous_candle_conviction.status,
    loopStatus: state.autonomous_loop_tick.status,
    sessionStatus: state.autonomous_session_run.requested ? state.autonomous_session_run.status : "waiting",
    boundary: state.autonomous_now_decision.execution_boundary,
    tone: state.autonomous_now_decision.status === "blocked" ? "critical" : state.autonomous_now_decision.status === "attack" || state.autonomous_now_decision.status === "probe" || state.autonomous_now_decision.status === "loop" ? "engine" : "caution",
  };
}

function buildQuickAgentActionOutcome(
  kind: QuickAgentActionKind,
  before: Web3TradingState,
  after: Web3TradingState,
  overrideSummary?: string,
): QuickAgentActionOutcome {
  const fillDelta = after.autonomous_session_run.fill_count - before.autonomous_session_run.fill_count;
  const blockDelta = after.autonomous_session_run.blocked_count - before.autonomous_session_run.blocked_count;
  const walletDeltaUsd = roundOutcomeDelta(after.autonomous_wallet_telemetry.equity_usd - before.autonomous_wallet_telemetry.equity_usd);
  const windowPnlDeltaUsd = roundOutcomeDelta(after.autonomous_wallet_telemetry.window_pnl_usd - before.autonomous_wallet_telemetry.window_pnl_usd);
  const exposureDeltaUsd = roundOutcomeDelta(after.autonomous_wallet_telemetry.exposure_usd - before.autonomous_wallet_telemetry.exposure_usd);
  const tradeDelta = after.paper_account.trade_count - before.paper_account.trade_count;
  const cycleDelta = after.paper_account.cycle - before.paper_account.cycle;
  const tone: QuickChipTone = walletDeltaUsd > 0 || fillDelta > 0 && blockDelta === 0
    ? "engine"
    : walletDeltaUsd < 0 || blockDelta > fillDelta
      ? "critical"
      : after.autonomous_now_decision.status === "blocked"
        ? "critical"
        : kind === "route" || kind === "route-repair" || kind === "chart" || kind === "stand-down"
          ? "caution"
          : "neutral";
  return {
    id: `${kind}-${after.paper_account.cycle}-${after.paper_account.trade_count}-${after.autonomous_now_decision.action}`,
    kind,
    label: quickAgentActionLabel(kind, after),
    summary: overrideSummary ?? quickAgentActionSummary(kind, after),
    nextAction: quickAgentActionNextAction(kind, after),
    beforeDecision: before.autonomous_now_decision.action.replaceAll("-", " "),
    afterDecision: after.autonomous_now_decision.action.replaceAll("-", " "),
    walletDeltaUsd,
    windowPnlDeltaUsd,
    exposureDeltaUsd,
    tradeDelta,
    cycleDelta,
    fillDelta,
    blockDelta,
    routeStatus: after.autonomous_route_refresh_execution.status,
    chartStatus: after.autonomous_candle_refresh.requested ? after.autonomous_candle_refresh.status : after.autonomous_candle_conviction.status,
    loopStatus: after.autonomous_loop_tick.status,
    sessionStatus: after.autonomous_session_run.requested ? after.autonomous_session_run.status : "waiting",
    boundary: after.autonomous_now_decision.execution_boundary,
    tone,
  };
}

function quickAgentActionLabel(kind: QuickAgentActionKind, state?: Web3TradingState) {
  if (kind === "route") return "Route proof refreshed";
  if (kind === "route-repair") return state?.market_source.mode === "live-dex" ? "Live route repair" : "Route proof repair";
  if (kind === "chart") return "Chart proof recorded";
  if (kind === "loop") return "Backend tick returned";
  if (kind === "session") return "Paper cycle returned";
  if (kind === "minute") return "Minute loop returned";
  if (kind === "source") return "Market source switched";
  if (kind === "reset") return "Paper account reset";
  if (kind === "stand-down") return "Stand-down respected";
  return "Market read refreshed";
}

function quickAgentActionSummary(kind: QuickAgentActionKind, state: Web3TradingState) {
  if (kind === "route" || kind === "route-repair") return state.autonomous_route_refresh_execution.summary;
  if (kind === "chart") return state.autonomous_candle_refresh.summary;
  if (kind === "loop") return state.autonomous_loop_tick.summary;
  if (kind === "session" || kind === "minute") return state.autonomous_session_run.summary;
  if (kind === "source") return state.market_source.detail;
  if (kind === "reset") return "Paper account reset; the autonomous learner is ready for a fresh rehearsal.";
  if (kind === "stand-down") return state.autonomous_now_decision.next_action;
  return state.autonomous_market_evidence_fusion.next_action;
}

function quickAgentActionNextAction(kind: QuickAgentActionKind, state: Web3TradingState) {
  if (kind === "route" || kind === "route-repair") return state.autonomous_route_refresh_execution.next_action;
  if (kind === "chart") return state.autonomous_candle_refresh.next_action;
  if (kind === "loop") return state.autonomous_loop_tick.next_action;
  if (kind === "session" || kind === "minute") return state.autonomous_session_run.next_action;
  return state.autonomous_now_decision.next_action;
}

function roundOutcomeDelta(value: number) {
  return Math.round(value * 100) / 100;
}

function QuickAutonomousCommandSpine({
  commandCenter,
  commandExecution,
  tradeMission,
  tradeReadinessGate,
  capitalAllocator,
  tradeBatch,
  profitForecast,
  profitVelocity,
  tickPlan,
  tickGovernor,
  queue,
  queueExecution,
  allocationPlan,
}: {
  commandCenter: Web3TradingState["autonomous_command_center"];
  commandExecution: Web3TradingState["autonomous_command_center_execution"];
  tradeMission: Web3TradingState["autonomous_trade_mission"];
  tradeReadinessGate: Web3TradingState["autonomous_trade_readiness_gate"];
  capitalAllocator: Web3TradingState["autonomous_capital_allocator"];
  tradeBatch: Web3TradingState["autonomous_trade_batch"];
  profitForecast: Web3TradingState["autonomous_profit_forecast"];
  profitVelocity: Web3TradingState["autonomous_profit_velocity_governor"];
  tickPlan: Web3TradingState["autonomous_tick_plan"];
  tickGovernor: Web3TradingState["autonomous_tick_governor"];
  queue: Web3TradingState["autonomous_action_queue"];
  queueExecution: Web3TradingState["autonomous_action_queue_execution"];
  allocationPlan: Web3TradingState["autonomous_profit_allocation_plan"];
}) {
  const width = 640;
  const height = 188;
  const pad = { left: 38, right: 24, top: 24, bottom: 30 };
  const points = profitForecast.points.length > 0
    ? profitForecast.points
    : [{
      id: "now",
      label: "now",
      tick: 0,
      action: "hold" as const,
      equity_usd: profitForecast.starting_equity_usd,
      projected_pnl_usd: 0,
      drawdown_pct: 0,
    }];
  const commandItems = commandCenter.items.slice(0, 4);
  const missionSteps = tradeMission.steps.slice(0, 4);
  const equityValues = points.map((point) => point.equity_usd);
  const minEquity = Math.min(...equityValues, profitForecast.starting_equity_usd);
  const maxEquity = Math.max(...equityValues, profitForecast.projected_equity_usd, profitForecast.starting_equity_usd + 1);
  const range = Math.max(1, maxEquity - minEquity);
  const xFor = (index: number) => pad.left + (points.length <= 1 ? 0 : index / (points.length - 1) * (width - pad.left - pad.right));
  const yFor = (value: number) => Math.round(pad.top + (1 - ((value - minEquity) / range)) * 72);
  const forecastPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.equity_usd)}`).join(" ");
  const baselineY = yFor(profitForecast.starting_equity_usd);
  const maxCommandScore = Math.max(1, ...commandItems.map((item) => item.command_score));
  const maxCommandEdge = Math.max(1, ...commandItems.map((item) => Math.max(0, item.expected_edge_per_minute_usd)));
  const statusTone = commandSpineStatusTone(commandCenter.status, tradeMission.status);
  const readinessTone = readinessGateTone(tradeReadinessGate.status);
  const selectedAction = commandExecution.selected_action ?? commandCenter.primary_action;
  const selectedSymbol = commandExecution.selected_symbol ?? commandCenter.primary_symbol ?? tradeMission.target_symbol ?? "Desk";

  return (
    <section className="mt-2 max-w-full overflow-hidden rounded-md border border-engine/25 bg-engine/[0.035] p-2 sm:mt-3 sm:p-3" aria-label="Autonomous command spine">
      <div className="grid min-w-0 max-w-full gap-2 xl:grid-cols-[minmax(0,1.22fr)_minmax(19rem,0.78fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Command spine</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {tradeMission.mission_label} - {selectedAction.replaceAll("-", " ")}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {commandCenter.next_action || tradeMission.next_action}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={statusTone}>{commandCenter.command_score}/100</Chip>
              <Chip tone={readinessTone}>{tradeReadinessGate.status.replaceAll("-", " ")}</Chip>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Autonomous command spine chart"
            className="mt-2 block h-44 w-full max-w-full min-w-0 text-engine"
          >
            <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.3" />
            <text x="14" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">forecast</text>
            <text x="362" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">ranked commands</text>
            <line x1={pad.left} x2="324" y1={baselineY} y2={baselineY} stroke="currentColor" strokeDasharray="5 7" strokeOpacity="0.22" />
            <path d={forecastPath} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={profitForecast.projected_pnl_usd >= 0 ? "text-engine" : "text-critical"} />
            {points.map((point, index) => (
              <circle
                key={point.id}
                cx={xFor(index)}
                cy={yFor(point.equity_usd)}
                r={point.action === "protect" ? "5" : point.action === "sell" ? "4.5" : point.action === "buy" ? "5.5" : "4"}
                className={point.action === "protect" || point.action === "sell" ? "fill-caution" : point.action === "buy" ? "fill-engine" : "fill-outline"}
                opacity="0.88"
              />
            ))}
            <text x={pad.left} y="116" className="fill-on-surface font-mono text-[12px] font-semibold">{formatCompactCurrency(profitForecast.projected_equity_usd)}</text>
            <text x="146" y="116" className={cn("font-mono text-[12px] font-semibold", profitForecast.projected_pnl_usd >= 0 ? "fill-engine" : "fill-critical")}>{formatCompactSignedCurrency(profitForecast.projected_pnl_usd)}</text>
            <text x="238" y="116" className="fill-outline font-mono text-[10px]">{profitForecast.confidence_score}/100</text>
            {commandItems.map((item, index) => {
              const y = 32 + index * 24;
              const scoreWidth = Math.max(6, item.command_score / maxCommandScore * 188);
              const edgeX = 362 + Math.max(0, item.expected_edge_per_minute_usd) / maxCommandEdge * 188;
              return (
                <g key={item.id}>
                  <text x="338" y={y + 9} className="fill-on-surface font-mono text-[10px] font-semibold">{item.symbol ?? item.lane}</text>
                  <rect x="430" y={y + 2} width="188" height="8" rx="4" className="fill-outline" opacity="0.12" />
                  <rect x="430" y={y + 2} width={scoreWidth} height="8" rx="4" className={commandActionSvgClass(item.action, item.status)} opacity="0.82" />
                  <line x1={edgeX} x2={edgeX} y1={y} y2={y + 13} stroke="currentColor" strokeOpacity="0.54" strokeWidth="2" />
                  <text x="430" y={y + 21} className="fill-outline font-mono text-[9px]">{item.action} - {formatCompactSignedCurrency(item.expected_edge_usd)}</text>
                </g>
              );
            })}
            <text x={pad.left} y={height - 9} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">left = projected wallet path - right = command score and edge/min marker</text>
          </svg>
          <div className="mt-2 grid min-w-0 max-w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7" aria-label="Autonomous mission spine health">
            {missionSteps.map((step) => (
              <div key={step.id} className={cn("min-w-0 rounded-md border px-2 py-1.5", missionStepClass(step.status))}>
                <p className="truncate font-mono text-[10px] uppercase tracking-telemetry">{step.lane}</p>
                <p className="mt-1 truncate text-xs font-semibold">{step.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2" aria-label="Autonomous command spine metrics">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Selected command</p>
              <p className="mt-1 truncate text-sm font-semibold text-on-surface">
                {selectedSymbol} - {commandCenter.primary_side}
              </p>
            </div>
            <Chip tone={commandExecutionTone(commandExecution.status)}>{commandExecution.status}</Chip>
          </div>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">
            {commandExecution.summary || tradeMission.summary}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-1">
            <ProfitMetric label="Edge/min" value={formatCompactSignedCurrency(commandCenter.expected_edge_per_minute_usd)} detail={`${commandCenter.fastest_review_seconds}s review`} tone={commandCenter.expected_edge_per_minute_usd > 0 ? "engine" : "neutral"} />
            <ProfitMetric label="Loop" value={profitVelocity.loop_permission.replaceAll("-", " ")} detail={`${profitVelocity.max_trades_next_minute}/m max`} tone={profitVelocityTone(profitVelocity.status, profitVelocity.loop_permission)} />
            <ProfitMetric label="Queue" value={`${queue.ready_count}/${queue.items.length}`} detail={`${queue.leader_action.replaceAll("-", " ")} lane`} tone={queue.ready_count > 0 ? "engine" : queue.blocked_count > 0 ? "caution" : "neutral"} />
            <ProfitMetric label="Batch" value={`${tradeBatch.ready_count}/${tradeBatch.planned_count}`} detail={`${tradeReadinessGate.max_batch_trades} max fills`} tone={tradeBatch.ready_count > 0 && tradeReadinessGate.can_apply_batch ? "engine" : tradeBatch.blocked_count > 0 ? "caution" : "neutral"} />
            <ProfitMetric label="Allocator" value={allocationPlan.status} detail={`${allocationPlan.size_multiplier}x · ${formatCompactCurrency(allocationPlan.max_trade_usd)} cap`} tone={allocationPlan.can_deploy ? "engine" : allocationPlan.should_release_first ? "caution" : allocationPlan.status === "cooldown" ? "critical" : "neutral"} />
            <ProfitMetric label="Provider" value={`${profitVelocity.provider_utilization_pct}%`} detail={`${profitVelocity.route_quotes_per_minute} quotes/m`} tone={profitVelocity.provider_utilization_pct >= 85 ? "caution" : "engine"} />
            <ProfitMetric label="Tick" value={`${tickGovernor.next_tick_seconds}s`} detail={`${tickPlan.bundle_action_count} actions queued`} tone={tickGovernor.can_auto_advance ? "engine" : tickGovernor.status === "blocked" ? "critical" : "caution"} />
          </dl>
          <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-outline" aria-label="High-frequency minute loop">
            Minute loop: {profitVelocity.next_action} {formatCompactCurrency(tickPlan.next_minute_trade_budget_usd)} paper budget, {formatCompactSignedCurrency(profitVelocity.expected_profit_per_minute_usd)}/min modeled edge.
          </p>
          <span className="sr-only" aria-label="Autonomous command spine receipt">
            Command spine status {commandCenter.status}, mission {tradeMission.status}, target {selectedSymbol}, action {selectedAction}, expected edge {formatSignedCurrency(commandCenter.expected_edge_usd)}, expected edge per minute {formatSignedCurrency(commandCenter.expected_edge_per_minute_usd)}, risk {formatCurrency(commandCenter.risk_usd)}, projected equity {formatCurrency(profitForecast.projected_equity_usd)}, projected PnL {formatSignedCurrency(profitForecast.projected_pnl_usd)}, readiness {tradeReadinessGate.status}, readiness launch timing {tradeReadinessGate.launch_timing_status}, readiness launch blocks buys {tradeReadinessGate.launch_timing_blocks_fresh_buys ? "yes" : "no"}, batch ready {tradeBatch.ready_count} of {tradeBatch.planned_count}, live blockers {commandCenter.live_blocker_count}.
          </span>
          <span className="sr-only" aria-label="Command spine allocator receipt">
            Allocator status {allocationPlan.status}, selected lane {allocationPlan.selected_lane ?? "none"}, deploy {formatCurrency(allocationPlan.deploy_budget_usd)}, release {formatCurrency(allocationPlan.release_budget_usd)}, max trade {formatCurrency(allocationPlan.max_trade_usd)}, cadence {allocationPlan.cadence_seconds} seconds.
          </span>
          <span className="sr-only" aria-label="High-frequency minute loop receipt">
            Profit velocity status {profitVelocity.status}, permission {profitVelocity.loop_permission}, velocity score {profitVelocity.velocity_score}, max next minute trades {profitVelocity.max_trades_next_minute}, target trades per minute {profitVelocity.target_trades_per_minute}, expected profit per minute {formatSignedCurrency(profitVelocity.expected_profit_per_minute_usd)}, churn cap {formatCurrency(profitVelocity.max_churn_notional_usd)}, data calls per minute {profitVelocity.data_calls_per_minute}, route quotes per minute {profitVelocity.route_quotes_per_minute}, provider utilization {profitVelocity.provider_utilization_pct} percent, tick plan {tickPlan.status}, tick governor {tickGovernor.status}.
          </span>
          <span className="sr-only" aria-label="Autonomous action queue receipt">
            Action queue is folded into the command spine. Leader {queue.leader_symbol ?? "desk"} {queue.leader_action}; deploy {formatCurrency(queue.deploy_usd)}, release {formatCurrency(queue.release_usd)}, expected edge {formatSignedCurrency(queue.expected_edge_usd)}, expected per minute {formatSignedCurrency(queue.expected_profit_per_minute_usd)}, risk {formatCurrency(queue.risk_usd)}, selected lane {queueExecution.selected_lane ?? "none"}, paper ready {queueExecution.paper_trade_ready ? "yes" : "no"}, launch timing {queue.launch_timing_status}, launch-blocked buys {queue.launch_timing_blocked_count}, blockers {queueExecution.blockers.join("; ") || queue.launch_timing_blocker || queue.fresh_buy_blocker || "none"}.
          </span>
          <span className="sr-only" aria-label="What is wired">
            Wired paths: Paper ledger, DEX read, route proof, candle evidence, wallet feedback, strategy selector, throttle, command spine, readiness gate, batch rehearsal, and browser auto-watch are wired here; live signing stays credential-gated.
          </span>
          <span className="sr-only" aria-label="Wired paths">
            Paper ledger, DEX read, route proof, candle evidence, wallet feedback, command center, trade mission, capital allocator, and paper batch rehearsal are visible in the compact cockpit without loading expert diagnostics.
          </span>
        </div>
      </div>
    </section>
  );
}

function QuickMakeMoneyGovernor({
  objective,
  control,
  sizeGovernor,
  accountability,
  allocationPlan,
}: {
  objective: Web3TradingState["autonomous_profit_objective"];
  control: Web3TradingState["autonomous_profit_control"];
  sizeGovernor: Web3TradingState["autonomous_size_governor"];
  accountability: Web3TradingState["autonomous_profit_accountability"];
  allocationPlan: Web3TradingState["autonomous_profit_allocation_plan"];
}) {
  const targetTone: QuickChipTone = objective.progress_pct >= 100 ? "engine" : objective.status === "cooldown" ? "critical" : "caution";
  const controlTone: QuickChipTone = control.status === "press" || control.status === "compound"
    ? "engine"
    : control.status === "harvest" || control.status === "redeploy" || control.status === "protect"
      ? "caution"
      : "critical";
  const sizeTone: QuickChipTone = sizeGovernor.can_trade_paper ? "engine" : sizeGovernor.status === "pause" || sizeGovernor.status === "protect" ? "caution" : "neutral";
  const accountabilityTone: QuickChipTone = accountability.making_money ? "engine" : accountability.status === "blocked" ? "critical" : "caution";
  const releaseOrDeploy = Math.max(control.release_now_usd, allocationPlan.release_budget_usd) > 0
    ? `${formatCompactCurrency(Math.max(control.release_now_usd, allocationPlan.release_budget_usd))} release`
    : `${formatCompactCurrency(Math.max(control.deploy_now_usd, allocationPlan.deploy_budget_usd))} deploy`;

  return (
    <section className="rounded-md border border-engine/20 bg-surface-dim/20 p-2 sm:p-3" aria-label="Make-money governor">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Make-money governor</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {control.status.replace("-", " ")} · {sizeGovernor.selected_side} {sizeGovernor.selected_symbol ?? "desk"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {control.next_action}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={controlTone}>{control.loop_intensity}</Chip>
          <Chip tone={accountabilityTone}>{accountability.making_money ? "making money" : accountability.status}</Chip>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Make-money governor metrics">
        <ProfitMetric label="Target" value={`${Math.round(objective.progress_pct)}%`} detail={formatCompactSignedCurrency(accountability.net_pnl_usd)} tone={targetTone} />
        <ProfitMetric label="Action" value={control.status} detail={releaseOrDeploy} tone={controlTone} />
        <ProfitMetric label="Final size" value={formatCompactCurrency(sizeGovernor.final_size_usd)} detail={`${sizeGovernor.size_multiplier}x · ${sizeGovernor.confidence_score}/100`} tone={sizeTone} />
        <ProfitMetric label="Memory" value={sizeGovernor.outcome_memory_status} detail={`${sizeGovernor.outcome_memory_multiplier}x · ${sizeGovernor.outcome_memory_score}/100`} tone={sizeGovernor.outcome_memory_blocks_fresh_buy ? "critical" : sizeGovernor.outcome_memory_status === "press" || sizeGovernor.outcome_memory_status === "compound" ? "engine" : "caution"} />
      </div>
      <span className="sr-only" aria-label="Make-money governor receipt">
        Make-money governor status {control.status}, loop intensity {control.loop_intensity}, target progress {objective.progress_pct} percent, accountability {accountability.status}, making money {accountability.making_money ? "yes" : "no"}, net paper PnL {formatSignedCurrency(accountability.net_pnl_usd)}, deploy {formatCurrency(control.deploy_now_usd)}, release {formatCurrency(control.release_now_usd)}, size governor {sizeGovernor.status}, final size {formatCurrency(sizeGovernor.final_size_usd)}, can trade paper {sizeGovernor.can_trade_paper ? "yes" : "no"}, outcome memory {sizeGovernor.outcome_memory_status}, next action {control.next_action}.
      </span>
    </section>
  );
}

function QuickLoopPermissionMatrix({ state }: { state: Web3TradingState }) {
  const throttle = state.autonomous_loop_throttle;
  const wakePlan = state.autonomous_wake_plan;
  const dataGate = state.autonomous_data_freshness_gate;
  const runGuard = state.autonomous_profit_run_guard;
  const dailyLock = state.autonomous_daily_profit_lock;
  const replayGate = state.autonomous_replay_gate;
  const burstFeedback = state.autonomous_burst_outcome_feedback;
  const accountability = state.autonomous_profit_accountability;
  const pressureTape = state.autonomous_pressure_tape;
  const rows = [
    {
      id: "wake",
      label: "Wake",
      value: wakePlan.next_client_action.replace("-", " "),
      detail: `${wakePlan.next_wake_seconds}s · ${wakePlan.trigger.replace("-", " ")}`,
      score: wakePlan.can_auto_watch_run ? Math.max(62, Math.min(100, wakePlan.max_trades_next_minute * 18 + wakePlan.queued_action_count * 8)) : 24,
      tone: wakePlanTone(wakePlan.status, wakePlan.can_auto_watch_run),
    },
    {
      id: "throttle",
      label: "Throttle",
      value: throttle.action.replace("-", " "),
      detail: `${throttle.ticks}t/${throttle.max_total_fills}f · ${throttle.cadence_seconds}s`,
      score: throttle.throttle_score,
      tone: throttleStatusTone(throttle.status, throttle.can_run),
    },
    {
      id: "freshness",
      label: "Data",
      value: dataGate.action.replace("-", " "),
      detail: `${dataGate.next_refresh_lane.replace("-", " ")} · ${dataGate.max_next_fills} fills`,
      score: dataGate.data_score,
      tone: dataFreshnessTone(dataGate.status, dataGate.can_trade),
    },
    {
      id: "profit",
      label: "Profit",
      value: runGuard.action.replace("-", " "),
      detail: `${formatCompactSignedCurrency(runGuard.expected_profit_per_minute_usd)}/m · ${runGuard.max_next_fills} fills`,
      score: runGuard.profit_guard_score,
      tone: profitRunGuardTone(runGuard.status, runGuard.blocks_fresh_buy),
    },
    {
      id: "lock",
      label: "Lock",
      value: dailyLock.loop_permission.replace("-", " "),
      detail: `${formatCompactCurrency(dailyLock.deploy_allowed_usd)} deploy · ${formatCompactCurrency(dailyLock.release_required_usd)} release`,
      score: dailyLock.loop_permission === "open" ? 92 : dailyLock.loop_permission === "harvest-only" || dailyLock.loop_permission === "protect-only" ? 58 : 18,
      tone: dailyLockTone(dailyLock.loop_permission),
    },
    {
      id: "learning",
      label: "Learning",
      value: replayGate.action.replace("-", " "),
      detail: `${burstFeedback.action.replace("-", " ")} · ${accountability.max_next_fills} fills`,
      score: Math.round((replayGate.replay_score + burstFeedback.outcome_score + accountability.accountability_score) / 3),
      tone: replayGate.can_spend && !burstFeedback.blocks_fresh_buy && accountability.making_money ? "engine" : replayGate.status === "blocked" || burstFeedback.status === "blocked" ? "critical" : "caution",
    },
    {
      id: "situation",
      label: "Tape",
      value: pressureTape.situation_regime.replace("-", " "),
      detail: `${pressureTape.reaction_window_seconds}s react · ${pressureTape.urgent_change_count} urgent`,
      score: pressureTape.tape_change_score,
      tone: pressureTape.urgent_change_count > 0 || pressureTape.situation_regime === "rug-watch" || pressureTape.situation_regime === "stand-down" ? "critical" : pressureTape.tape_change_score >= 46 ? "caution" : "engine",
    },
  ] satisfies Array<{
    id: string;
    label: string;
    value: string;
    detail: string;
    score: number;
    tone: QuickChipTone;
  }>;
  const canRunFast = wakePlan.can_auto_watch_run && throttle.can_run && dataGate.can_trade && runGuard.can_keep_running && dailyLock.fresh_buy_allowed && replayGate.can_spend && !burstFeedback.blocks_fresh_buy;
  const primaryTone: QuickChipTone = canRunFast ? "engine" : wakePlan.should_refresh_first || throttle.should_refresh_first || dataGate.status === "refresh" || dataGate.status === "backfill" ? "caution" : throttle.status === "blocked" || dailyLock.loop_permission === "stand-down" ? "critical" : "neutral";
  const totalFillCap = Math.min(
    throttle.max_total_fills,
    Math.max(0, dataGate.max_next_fills),
    Math.max(0, runGuard.max_next_fills),
    Math.max(0, dailyLock.max_next_fills),
    Math.max(0, replayGate.max_next_fills),
    Math.max(0, burstFeedback.max_next_child_fills),
  );

  return (
    <section className="rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:p-3" aria-label="Autonomous loop permission matrix">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Loop permission matrix</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {canRunFast ? "Fast paper loop is cleared" : wakePlan.next_action}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {throttle.summary}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={primaryTone}>{canRunFast ? "sprint ready" : wakePlan.status.replace("-", " ")}</Chip>
          <Chip tone={totalFillCap > 0 ? "engine" : "critical"}>{totalFillCap} fills max</Chip>
        </div>
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-7" aria-label="Autonomous loop permission matrix chart">
        {rows.map((row) => (
          <div key={row.id} className={cn("min-w-0 rounded-md border px-2 py-1.5", permissionToneClass(row.tone))}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-mono text-[10px] uppercase tracking-telemetry">{row.label}</p>
              <p className="font-mono text-[10px]">{clampNumber(row.score)}/100</p>
            </div>
            <p className="mt-1 truncate text-xs font-semibold capitalize">{row.value}</p>
            <p className="mt-0.5 truncate text-[11px] leading-4 opacity-80">{row.detail}</p>
            <div className="mt-2 h-1.5 rounded-full bg-current/15">
              <div className="h-1.5 rounded-full bg-current/70" style={{ width: `${Math.max(6, clampNumber(row.score))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Autonomous high-frequency run caps">
        <ProfitMetric label="Fresh buys" value={`${throttle.max_fresh_buys}`} detail={dailyLock.fresh_buy_allowed ? "allowed" : "blocked"} tone={dailyLock.fresh_buy_allowed ? "engine" : "critical"} />
        <ProfitMetric label="Protect sells" value={`${throttle.max_protective_sells}`} detail={dailyLock.protect_sell_allowed ? "armed" : "blocked"} tone={dailyLock.protect_sell_allowed ? "caution" : "critical"} />
        <ProfitMetric label="Size" value={`${throttle.size_multiplier}x`} detail={formatCompactCurrency(throttle.deploy_budget_usd)} tone={throttle.size_multiplier > 0 ? "engine" : "neutral"} />
        <ProfitMetric label="Burst result" value={burstFeedback.status} detail={formatCompactSignedCurrency(burstFeedback.net_expected_edge_usd)} tone={burstFeedbackTone(burstFeedback.status, burstFeedback.blocks_fresh_buy)} />
        <ProfitMetric label="Tape reaction" value={`${pressureTape.reaction_window_seconds}s`} detail={`${pressureTape.tape_change_score}/100 change`} tone={pressureTape.urgent_change_count > 0 ? "critical" : pressureTape.tape_change_score >= 46 ? "caution" : "engine"} />
      </div>
      <span className="sr-only" aria-label="Autonomous loop permission receipt">
        Loop permission matrix says can run fast {canRunFast ? "yes" : "no"}; wake {wakePlan.status} via {wakePlan.trigger}; throttle {throttle.status} {throttle.action}; data gate {dataGate.status} {dataGate.action}; profit guard {runGuard.status} {runGuard.action}; daily lock {dailyLock.loop_permission}; replay gate {replayGate.status}; burst feedback {burstFeedback.status}; pressure tape {pressureTape.status}; situation regime {pressureTape.situation_regime}; tape change score {pressureTape.tape_change_score}; urgent changes {pressureTape.urgent_change_count}; reaction window {pressureTape.reaction_window_seconds} seconds; total fill cap {totalFillCap}; live signing remains credential-gated.
      </span>
    </section>
  );
}

function QuickAutonomousFillTape({
  digest,
  feedback,
  wallet,
}: {
  digest: Web3TradingState["autonomous_fill_ledger_digest"];
  feedback: Web3TradingState["autonomous_loop_feedback"];
  wallet: Web3TradingState["autonomous_wallet_telemetry"];
}) {
  const items = digest.items.slice(0, 4);
  const maxSize = Math.max(1, ...items.map((item) => Math.max(item.size_usd, Math.abs(item.estimated_contribution_usd))));
  const statusTone = fillLedgerStatusTone(digest.status);
  const feedbackTone: QuickChipTone = feedback.should_pause_fresh_buys
    ? "critical"
    : feedback.status === "press" || feedback.status === "keep"
      ? "engine"
      : feedback.status === "protect" || feedback.status === "tighten"
        ? "caution"
        : "neutral";

  return (
    <section className="rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:p-3" aria-label="Autonomous fill tape">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Autonomous fill tape</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {digest.recent_fill_count > 0 ? `${digest.last_fill_symbol ?? "Paper"} ${digest.last_fill_side ?? "fill"} · ${digest.recommended_discipline.replaceAll("-", " ")}` : "Waiting for paper fills"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {digest.summary}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={statusTone}>{digest.status}</Chip>
          <Chip tone={feedbackTone}>{feedback.status}</Chip>
        </div>
      </div>

      <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <div className="grid gap-1" aria-label="Autonomous recent paper fill tape">
          {items.length > 0 ? items.map((item) => {
            const contributionPct = Math.max(6, Math.min(100, Math.abs(item.estimated_contribution_usd) / maxSize * 100));
            const sizePct = Math.max(6, Math.min(100, item.size_usd / maxSize * 100));
            return (
              <div key={item.id} className={cn("grid min-w-0 gap-2 rounded-md border px-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,0.44fr)_minmax(5.75rem,0.35fr)]", fillTapeItemClass(item.status, item.side))}>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-sm font-semibold">{item.symbol}</p>
                    <span className="font-mono text-[10px] uppercase tracking-telemetry opacity-80">{item.side} · {shortLaneLabel(item.lane_label)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 opacity-80">{item.reason}</p>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-telemetry opacity-80">Size</p>
                    <p className="font-mono text-[10px] font-semibold">{formatCompactCurrency(item.size_usd)}</p>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-current/15">
                    <div className="h-1.5 rounded-full bg-current/70" style={{ width: `${sizePct}%` }} />
                  </div>
                </div>
                <div className="min-w-0 text-right sm:text-left">
                  <p className="font-mono text-[10px] uppercase tracking-telemetry opacity-80">{item.discipline}</p>
                  <p className="mt-0.5 font-mono text-xs font-semibold">{formatCompactSignedCurrency(item.estimated_contribution_usd)}</p>
                  <div className="mt-1 h-1.5 rounded-full bg-current/15">
                    <div className="h-1.5 rounded-full bg-current/70" style={{ width: `${contributionPct}%` }} />
                  </div>
                </div>
              </div>
            );
          }) : (
            <p className="rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2 text-xs leading-5 text-on-surface-variant">
              No local autonomous paper fills have landed yet. Run a chart proof, tick, minute, or bounded paper cycle to start the fill tape.
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-2" aria-label="Autonomous fill tape wallet impact">
          <ProfitMetric label="Fill PnL" value={formatCompactSignedCurrency(digest.net_pnl_usd)} detail={`${digest.buy_count}/${digest.sell_count} buy/sell`} tone={digest.net_pnl_usd >= 0 ? "engine" : "critical"} />
          <ProfitMetric label="Volume" value={formatCompactCurrency(digest.paper_volume_usd)} detail={`${formatCompactCurrency(digest.average_fill_usd)} avg`} tone={digest.paper_volume_usd > 0 ? "engine" : "neutral"} />
          <ProfitMetric label="Wallet" value={formatCompactCurrency(wallet.equity_usd)} detail={`${formatCompactSignedCurrency(wallet.window_pnl_usd)} window`} tone={wallet.window_pnl_usd >= 0 ? "engine" : "critical"} />
          <ProfitMetric label="Feedback" value={`${feedback.feedback_score}/100`} detail={`${feedback.size_multiplier}x · ${feedback.cadence_seconds}s`} tone={feedbackTone} />
        </dl>
      </div>
      <span className="sr-only" aria-label="Autonomous fill tape receipt">
        Autonomous fill tape shows local paper-ledger fills only. Status {digest.status}; recent fills {digest.recent_fill_count}; buys {digest.buy_count}; sells {digest.sell_count}; paper volume {formatCurrency(digest.paper_volume_usd)}; net paper PnL {formatSignedCurrency(digest.net_pnl_usd)}; last fill {digest.last_fill_symbol ?? "none"} {digest.last_fill_side ?? "none"}; loop feedback {feedback.status}; wallet equity {formatCurrency(wallet.equity_usd)}; live execution remains credential gated and cannot be inferred from this paper tape.
      </span>
    </section>
  );
}

function QuickWalletNetWorthChart({
  wallet,
  sessionRun,
  loopFeedback,
}: {
  wallet: Web3TradingState["autonomous_wallet_telemetry"];
  sessionRun: Web3TradingState["autonomous_session_run"];
  loopFeedback: Web3TradingState["autonomous_loop_feedback"];
}) {
  const width = 640;
  const height = 176;
  const pad = { left: 28, right: 20, top: 18, bottom: 30 };
  const points = wallet.curve.length > 0
    ? wallet.curve
    : [{
      id: "current",
      label: "now",
      recorded_at: "",
      cycle: 0,
      action: "current" as const,
      equity_usd: wallet.equity_usd,
      cash_usd: wallet.cash_usd,
      exposure_usd: wallet.exposure_usd,
      realized_pnl_usd: wallet.realized_pnl_usd,
      unrealized_pnl_usd: wallet.unrealized_pnl_usd,
      drawdown_pct: wallet.max_drawdown_pct,
      filled_count: wallet.fill_count,
      blocked_count: wallet.blocked_count,
    }];
  const forecastEquity = points[points.length - 1].equity_usd + wallet.slope_usd_per_tick * 2;
  const values = points.flatMap((point) => [point.equity_usd, point.cash_usd, point.exposure_usd]);
  const minValue = Math.min(...values, forecastEquity, wallet.starting_cash_usd);
  const maxValue = Math.max(...values, forecastEquity, wallet.high_watermark_usd);
  const range = Math.max(1, maxValue - minValue);
  const xFor = (index: number, count = points.length) => pad.left + (count <= 1 ? 0 : (index / (count - 1)) * (width - pad.left - pad.right));
  const yFor = (value: number) => Math.round(pad.top + (1 - ((value - minValue) / range)) * (height - pad.top - pad.bottom));
  const equityPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.equity_usd)}`).join(" ");
  const cashPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.cash_usd)}`).join(" ");
  const exposurePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.exposure_usd)}`).join(" ");
  const lastPoint = points[points.length - 1];
  const lastX = xFor(points.length - 1);
  const lastY = yFor(lastPoint.equity_usd);
  const forecastX = width - pad.right;
  const forecastY = yFor(forecastEquity);
  const highWaterY = yFor(wallet.high_watermark_usd);
  const drawdownHeight = Math.max(4, Math.min(44, wallet.max_drawdown_pct * 7));
  const markerPoints = points.filter((point, index) => index > 0 && (point.filled_count > 0 || point.blocked_count > 0 || point.action !== "current"));
  const chartTone = wallet.window_pnl_usd >= 0 ? "text-engine" : "text-critical";

  return (
    <div className="min-w-0 self-start rounded-md border border-engine/25 bg-void/20 p-2 sm:p-3" aria-label="Wallet net worth curve">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Wallet net worth curve</p>
          <p className="mt-1 truncate text-lg font-semibold text-on-surface">{formatCurrency(wallet.equity_usd)}</p>
        </div>
        <div className="text-right">
          <p className={cn("font-mono text-sm font-semibold", wallet.window_pnl_usd >= 0 ? "text-engine" : "text-critical")}>{formatSignedCurrency(wallet.window_pnl_usd)}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-telemetry text-outline">{points.length} ticks</p>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous wallet net worth chart with paper fills and forecast"
        className={cn("mt-2 h-28 w-full sm:h-40", chartTone)}
      >
        <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.34" />
        <line x1={pad.left} x2={width - pad.right} y1={highWaterY} y2={highWaterY} stroke="currentColor" strokeDasharray="5 7" strokeOpacity="0.22" />
        <rect x={pad.left} y={height - pad.bottom - drawdownHeight} width={width - pad.left - pad.right} height={drawdownHeight} className="fill-critical" opacity="0.08" />
        <path d={exposurePath} fill="none" stroke="currentColor" strokeDasharray="2 8" strokeOpacity="0.24" strokeWidth="2" />
        <path d={cashPath} fill="none" stroke="currentColor" strokeDasharray="7 7" strokeOpacity="0.35" strokeWidth="2.5" />
        <path d={equityPath} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={`M ${lastX} ${lastY} L ${forecastX} ${forecastY}`} fill="none" stroke="currentColor" strokeDasharray="8 8" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
        {markerPoints.map((point) => (
          <circle
            key={point.id}
            cx={xFor(points.indexOf(point))}
            cy={yFor(point.equity_usd)}
            r={point.blocked_count > point.filled_count ? "4.5" : "5.5"}
            className={point.blocked_count > point.filled_count ? "fill-caution" : point.action === "stand-down" ? "fill-critical" : "fill-engine"}
            opacity="0.9"
          />
        ))}
        <circle cx={lastX} cy={lastY} r="7" className={wallet.window_pnl_usd >= 0 ? "fill-engine" : "fill-critical"} />
        <text x="28" y="34" className="fill-outline font-mono text-[14px] uppercase tracking-telemetry">cash dash · exposure dots · equity solid</text>
        <text x="28" y={height - 12} className="fill-outline font-mono text-[12px] uppercase tracking-telemetry">forecast dash · drawdown band · paper fill markers</text>
      </svg>
      <dl className="mt-2 hidden grid-cols-3 gap-1 sm:grid" aria-label="Wallet curve telemetry">
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
          <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Slope</dt>
          <dd className={cn("mt-1 truncate text-xs font-semibold", wallet.slope_usd_per_tick >= 0 ? "text-engine" : "text-critical")}>{formatCompactSignedCurrency(wallet.slope_usd_per_tick)}/t</dd>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
          <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Drawdown</dt>
          <dd className={cn("mt-1 truncate text-xs font-semibold", wallet.max_drawdown_pct >= 4 ? "text-critical" : wallet.max_drawdown_pct >= 2 ? "text-caution" : "text-engine")}>{wallet.max_drawdown_pct.toFixed(1)}%</dd>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
          <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Feedback</dt>
          <dd className={cn("mt-1 truncate text-xs font-semibold", loopFeedback.should_pause_fresh_buys ? "text-critical" : loopFeedback.status === "press" ? "text-engine" : "text-caution")}>
            {loopFeedback.status} · {sessionRun.requested ? formatCompactSignedCurrency(sessionRun.net_pnl_usd) : "idle"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

type QuickPaperExecutionPriorityItem = {
  id: string;
  label: string;
  symbol: string;
  side: Web3TradingState["trade_tape"][number]["side"];
  sizeUsd: number;
  detail: string;
  priority: "redeploy-protect" | "portfolio-protect" | "fresh-entry" | "observe";
  tone: QuickChipTone;
};

function QuickPaperExecutionPriorityTape({ state }: { state: Web3TradingState }) {
  const trades = state.trade_tape.slice(0, 5);
  const items = trades.map(classifyQuickPaperExecutionPriority);
  const redeployProtectUsd = items
    .filter((item) => item.priority === "redeploy-protect")
    .reduce((sum, item) => sum + item.sizeUsd, 0);
  const protectUsd = items
    .filter((item) => item.priority === "redeploy-protect" || item.priority === "portfolio-protect")
    .reduce((sum, item) => sum + item.sizeUsd, 0);
  const freshRiskUsd = items
    .filter((item) => item.priority === "fresh-entry")
    .reduce((sum, item) => sum + item.sizeUsd, 0);
  const visibleItems = items.slice(0, 3);
  const hiddenItemCount = Math.max(0, items.length - visibleItems.length);
  const lastItem = items[0] ?? null;
  const wallet = state.autonomous_wallet_telemetry;
  const netRiskBias = freshRiskUsd - protectUsd;

  return (
    <section className="min-w-0 self-start rounded-md border border-outline-variant/25 bg-void/20 p-2 sm:p-3" aria-label="Paper execution priority tape">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Paper execution priority</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {lastItem ? `${lastItem.label} · ${lastItem.symbol}` : "Waiting for fills"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            Recent durable fills are classified as protect/redeploy, portfolio release, or fresh-entry risk before the wallet curve is judged.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={redeployProtectUsd > 0 ? "caution" : "neutral"}>redeploy {formatCompactCurrency(redeployProtectUsd)}</Chip>
          <Chip tone={protectUsd >= freshRiskUsd && protectUsd > 0 ? "engine" : freshRiskUsd > 0 ? "caution" : "neutral"}>
            net {formatCompactSignedCurrency(-netRiskBias)}
          </Chip>
          <Chip tone={state.execution_gate.live_execution_enabled ? "critical" : "demo"}>
            {state.execution_gate.live_execution_enabled ? "live boundary" : "paper only"}
          </Chip>
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {visibleItems.map((item) => (
            <div key={item.id} className={cn("grid min-w-0 gap-1 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_auto]", permissionToneClass(item.tone))}>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", profitAuthorityBarClass(item.tone))} aria-hidden="true" />
                  <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{item.label}</p>
                  <p className="truncate text-xs font-semibold text-on-surface">
                    {item.side} {item.symbol}
                  </p>
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-on-surface-variant">{item.detail}</p>
              </div>
              <p className="font-mono text-[11px] text-outline sm:text-right">{formatCompactCurrency(item.sizeUsd)}</p>
            </div>
          ))}
          {hiddenItemCount > 0 ? (
            <p className="rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1 text-[11px] leading-4 text-on-surface-variant">
              +{hiddenItemCount} older paper fills retained in the tape receipt.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2 text-xs leading-5 text-on-surface-variant">
          No paper-ledger fills yet. Run a bounded tick or minute session to build the execution tape.
        </p>
      )}

      <dl className="mt-2 grid grid-cols-3 gap-1" aria-label="Execution priority wallet effect">
        <MiniProofStat label="Protect" value={formatCompactCurrency(protectUsd)} />
        <MiniProofStat label="Fresh risk" value={formatCompactCurrency(freshRiskUsd)} />
        <MiniProofStat label="Wallet" value={formatCompactSignedCurrency(wallet.window_pnl_usd)} />
      </dl>
      <span className="sr-only" aria-label="Paper execution priority receipt">
        Paper execution priority tape: {items.length} recent fills; redeploy protect {formatCurrency(redeployProtectUsd)}; portfolio protect {formatCurrency(protectUsd)}; fresh-entry risk {formatCurrency(freshRiskUsd)}; latest {lastItem ? `${lastItem.label} ${lastItem.side} ${lastItem.symbol}` : "none"}; wallet equity {formatCurrency(wallet.equity_usd)}; wallet window PnL {formatSignedCurrency(wallet.window_pnl_usd)}; live execution {state.execution_gate.live_execution_enabled ? "armed" : "locked"}.
      </span>
    </section>
  );
}

function classifyQuickPaperExecutionPriority(trade: Web3TradingState["trade_tape"][number]): QuickPaperExecutionPriorityItem {
  const id = trade.id.toLowerCase();
  const reason = trade.reason.toLowerCase();
  if (id.startsWith("paper-profit-redeploy-protect") || reason.includes("profit redeploy protect-first")) {
    return {
      id: trade.id,
      label: "Redeploy protect",
      symbol: trade.symbol,
      side: trade.side,
      sizeUsd: trade.size_usd,
      detail: "Protect-first redeploy sell applied before released cash can chase again.",
      priority: "redeploy-protect",
      tone: "caution",
    };
  }
  if (
    trade.side === "sell" ||
    id.includes("position-risk") ||
    id.includes("watchlist-rotation-sell") ||
    id.includes("command-sell")
  ) {
    return {
      id: trade.id,
      label: "Portfolio release",
      symbol: trade.symbol,
      side: trade.side,
      sizeUsd: trade.size_usd,
      detail: "Paper sell reduces exposure before the next fresh-entry decision.",
      priority: "portfolio-protect",
      tone: "engine",
    };
  }
  if (
    id.includes("launch") ||
    id.includes("buy") ||
    id.includes("opportunity") ||
    trade.side === "buy"
  ) {
    return {
      id: trade.id,
      label: "Fresh entry",
      symbol: trade.symbol,
      side: trade.side,
      sizeUsd: trade.size_usd,
      detail: "Paper buy adds risk and must earn it back through wallet feedback.",
      priority: "fresh-entry",
      tone: "caution",
    };
  }
  return {
    id: trade.id,
    label: "Observed fill",
    symbol: trade.symbol,
    side: trade.side,
    sizeUsd: trade.size_usd,
    detail: "Paper fill is tracked for attribution before the next action.",
    priority: "observe",
    tone: "neutral",
  };
}

function QuickMinuteProfitDisciplineRail({ state }: { state: Web3TradingState }) {
  const discipline = state.autonomous_minute_profit_discipline;
  const tone = minuteProfitDisciplineTone(discipline.status);
  const visibleItems = discipline.items.slice(0, 3);

  return (
    <section className="min-w-0 self-start rounded-md border border-outline-variant/25 bg-surface-dim/20 p-2 sm:p-3" aria-label="Minute profit discipline">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Minute profit discipline</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {discipline.action.replaceAll("-", " ")} · {discipline.target_symbol ?? "desk"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {discipline.summary}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={tone}>{discipline.discipline_score}/100</Chip>
          <Chip tone={discipline.high_frequency_allowed ? "engine" : discipline.should_protect_first ? "caution" : "neutral"}>
            {discipline.max_trades_next_minute}/m
          </Chip>
          <Chip tone={discipline.fresh_buy_allowed ? "engine" : discipline.should_refresh_first ? "caution" : "critical"}>
            {discipline.fresh_buy_allowed ? "fresh ok" : discipline.should_refresh_first ? "refresh first" : "no fresh"}
          </Chip>
        </div>
      </div>

      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {visibleItems.map((item) => (
          <div key={item.id} className={cn("min-w-0 rounded-md border p-2", permissionToneClass(minuteProofItemTone(item.status)))}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{item.label}</p>
              <span className={cn("h-2 w-2 shrink-0 rounded-full", profitAuthorityBarClass(minuteProofItemTone(item.status)))} aria-hidden="true" />
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-on-surface">{item.value}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{item.detail}</p>
          </div>
        ))}
      </div>

      {discipline.blockers.length > 0 ? (
        <p className="mt-2 line-clamp-2 rounded-md border border-caution/25 bg-caution/10 p-2 text-[11px] leading-4 text-on-surface-variant">
          {discipline.blockers[0]}
        </p>
      ) : null}

      <dl className="mt-2 grid grid-cols-3 gap-1" aria-label="Minute profit discipline metrics">
        <MiniProofStat label="Realized" value={formatCompactSignedCurrency(discipline.realized_minute_edge_usd)} />
        <MiniProofStat label="Expected" value={`${formatCompactSignedCurrency(discipline.expected_profit_per_minute_usd)}/m`} />
        <MiniProofStat label="Drag" value={formatCompactCurrency(discipline.churn_drag_usd + discipline.execution_drag_usd)} />
      </dl>
      <span className="sr-only" aria-label="Minute profit discipline receipt">
        Minute profit discipline status {discipline.status}; action {discipline.action}; target {discipline.target_symbol ?? "desk"}; discipline score {discipline.discipline_score}; high-frequency allowed {discipline.high_frequency_allowed ? "yes" : "no"}; fresh buy allowed {discipline.fresh_buy_allowed ? "yes" : "no"}; protect first {discipline.should_protect_first ? "yes" : "no"}; refresh first {discipline.should_refresh_first ? "yes" : "no"}; realized minute edge {formatSignedCurrency(discipline.realized_minute_edge_usd)}; expected profit per minute {formatSignedCurrency(discipline.expected_profit_per_minute_usd)}; max trades next minute {discipline.max_trades_next_minute}; max fresh buys {discipline.max_fresh_buys}; max protective sells {discipline.max_protective_sells}; cadence {discipline.next_cadence_seconds} seconds; blockers {discipline.blockers.join("; ") || "none"}.
      </span>
    </section>
  );
}

function QuickRotationDirectorPanel({ state }: { state: Web3TradingState }) {
  const director = state.autonomous_rotation_director;
  const tone: QuickChipTone = director.status === "rotate-now" || director.status === "retarget"
    ? "engine"
    : director.status === "protect" || director.status === "harvest" || director.status === "hold"
      ? "caution"
      : director.status === "blocked"
        ? "critical"
        : "neutral";

  return (
    <div className="mt-3 min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/20 p-2" aria-label="Autonomous rotation director">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Rotation director</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {director.action.replaceAll("-", " ")} · {director.from_symbol ?? "cash"}{" -> "}{director.to_symbol ?? "desk"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{director.next_action}</p>
        </div>
        <Chip tone={tone}>{director.rotation_score}/100</Chip>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-5" aria-label="Autonomous rotation evidence rows">
        {director.items.map((item) => (
          <div key={item.id} className={cn("min-w-0 rounded-md border px-2 py-1.5", missionStepToneClass(item.status === "pass" ? "engine" : item.status === "fail" ? "critical" : "caution"))}>
            <p className="truncate font-mono text-[10px] uppercase tracking-telemetry">{item.label}</p>
            <p className="mt-1 truncate text-xs font-semibold">{item.value}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] opacity-75">{item.score}/100</p>
          </div>
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-1" aria-label="Autonomous rotation budgets">
        <ProfitMetric label="Deploy" value={formatCompactCurrency(director.deploy_usd)} detail={`${formatCompactCurrency(director.max_paper_size_usd)} max`} tone={director.deploy_usd > 0 ? "engine" : "neutral"} />
        <ProfitMetric label="Release" value={formatCompactCurrency(director.release_usd)} detail={director.from_symbol ?? "held book"} tone={director.release_usd > 0 ? "caution" : "neutral"} />
        <ProfitMetric label="Edge" value={formatCompactSignedCurrency(director.expected_edge_usd)} detail={`${director.review_after_seconds}s review`} tone={director.expected_edge_usd >= 0 ? "engine" : "critical"} />
      </dl>
      <span className="sr-only" aria-label="Autonomous rotation director receipt">
        Rotation director {director.status}; action {director.action}; from {director.from_symbol ?? "none"} to {director.to_symbol ?? "none"}; score {director.rotation_score}; opportunity {director.opportunity_score}; release score {director.release_score}; integrity {director.integrity_score}; expected edge {formatSignedCurrency(director.expected_edge_usd)}; deploy {formatCurrency(director.deploy_usd)}; release {formatCurrency(director.release_usd)}; max paper size {formatCurrency(director.max_paper_size_usd)}; review {director.review_after_seconds} seconds; blockers {director.blockers.join("; ") || "none"}; controls {director.controls.join(" ")}.
      </span>
    </div>
  );
}

function QuickActivePriceActionPanel({
  item,
  state,
  decision,
}: {
  item: QuickPriceActionTapeItem | null;
  state: Web3TradingState;
  decision: Web3TradingState["autonomous_now_decision"];
}) {
  const candle = state.autonomous_candle_refresh;
  const conviction = state.autonomous_candle_conviction;
  const route = state.autonomous_route_refresh_execution;
  const path = item?.path ?? [0, 0, 0, 0];
  const width = 220;
  const height = 86;
  const pad = { left: 12, right: 12, top: 12, bottom: 18 };
  const chartWidth = width - pad.left - pad.right;
  const minPath = Math.min(-12, ...path);
  const maxPath = Math.max(12, ...path);
  const range = Math.max(1, maxPath - minPath);
  const xFor = (index: number) => pad.left + index / Math.max(1, path.length - 1) * chartWidth;
  const yFor = (value: number) => pad.top + (1 - ((value - minPath) / range)) * (height - pad.top - pad.bottom);
  const zeroY = yFor(0);
  const pathD = path.map((value, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(value)}`).join(" ");
  const chartTone: QuickChipTone = !item
    ? "neutral"
    : item.risk_score >= 68 || decision.status === "blocked"
      ? "critical"
      : item.score >= 66 && item.buy_pressure_pct >= 54 && !decision.chart_proof_required
        ? "engine"
        : "caution";
  const proofTone: QuickChipTone = candle.status === "ready" && conviction.proof_target_matched
    ? "engine"
    : candle.status === "blocked" || conviction.blocks_fresh_buy
      ? "critical"
      : "caution";
  const routeTone: QuickChipTone = route.status === "ready"
    ? "engine"
    : route.status === "blocked"
      ? "critical"
      : "caution";

  if (!item) {
    return (
      <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5 text-xs leading-5 text-on-surface-variant" aria-label="Active price action cockpit">
        Active tape waiting.
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5" aria-label="Active price action cockpit">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Active tape</p>
          <p className={cn("mt-1 truncate text-xs font-semibold sm:text-sm", chartTone === "critical" ? "text-critical" : chartTone === "engine" ? "text-engine" : "text-caution")}>
            {item.symbol} {formatPercent(item.price_change_5m_pct)}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[10px] font-semibold text-outline">{item.score}/100</p>
      </div>
      <div className="mt-1.5">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Active target price action chart with momentum support resistance stop and take profit"
          className={cn("h-16 w-full", chartTone === "critical" ? "text-critical" : chartTone === "engine" ? "text-engine" : "text-caution")}
        >
          <rect width={width} height={height} rx="6" className="fill-void" opacity="0.2" />
          <line x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.16" strokeDasharray="5 6" />
          <path d={pathD} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {path.map((value, index) => (
            <circle key={`${item.token_id}-${index}`} cx={xFor(index)} cy={yFor(value)} r={index === path.length - 1 ? "4.5" : "3"} className={value >= 0 ? "fill-engine" : "fill-critical"} opacity="0.9" />
          ))}
          <rect x={pad.left} y={height - 13} width={chartWidth} height="4" rx="2" className="fill-outline" opacity="0.12" />
          <rect x={pad.left} y={height - 13} width={Math.max(5, item.buy_pressure_pct / 100 * chartWidth)} height="4" rx="2" className="fill-engine" opacity="0.78" />
          <rect x={pad.left} y={height - 7} width={chartWidth} height="3" rx="1.5" className="fill-outline" opacity="0.12" />
          <rect x={pad.left} y={height - 7} width={Math.max(5, item.risk_score / 100 * chartWidth)} height="3" rx="1.5" className="fill-critical" opacity="0.58" />
        </svg>
      </div>
      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">
        {formatTokenPrice(item.price_usd)} · {Math.round(item.buy_pressure_pct)}% buys · risk {item.risk_score}
      </p>
      <p className={cn("mt-0.5 truncate font-mono text-[10px] uppercase tracking-telemetry", decision.chart_proof_required ? "text-caution" : proofTone === "engine" && routeTone === "engine" ? "text-engine" : "text-outline")}>
        {decision.chart_proof_required ? "chart proof first" : `${candle.status} candle`} · {route.status.replaceAll("-", " ")}
      </p>
      <span className="sr-only" aria-label="Active price action cockpit receipt">
        Active price action cockpit for {item.symbol}: price {formatTokenPrice(item.price_usd)}, 5 minute momentum {formatPercent(item.price_change_5m_pct)}, one hour momentum {formatPercent(item.price_change_1h_pct)}, six hour momentum {formatPercent(item.price_change_6h_pct)}, buy pressure {Math.round(item.buy_pressure_pct)} percent, risk {item.risk_score}, chart proof {conviction.status}, candle refresh {candle.status}, route proof {route.status}, paper size {formatCurrency(decision.paper_size_usd)}.
      </span>
    </div>
  );
}

function QuickProfitLoopTile({
  state,
  decision,
}: {
  state: Web3TradingState;
  decision: Web3TradingState["autonomous_now_decision"];
}) {
  const velocity = state.autonomous_profit_velocity_governor;
  const throttle = state.autonomous_loop_throttle;
  const guard = state.autonomous_profit_run_guard;
  const dailyLock = state.autonomous_daily_profit_lock;
  const planner = state.autonomous_session_planner;
  const queue = state.autonomous_action_queue;
  const digest = state.autonomous_fill_ledger_digest;
  const velocityTone = profitVelocityTone(velocity.status, velocity.loop_permission);
  const throttleTone = throttleStatusTone(throttle.status, throttle.can_run);
  const guardTone = profitRunGuardTone(guard.status, guard.blocks_fresh_buy);
  const lockTone = dailyLockTone(dailyLock.loop_permission);
  const symbol = velocity.primary_symbol ??
    throttle.target_symbol ??
    guard.target_symbol ??
    planner.target_symbol ??
    decision.target_symbol ??
    "Desk";
  const maxFills = Math.max(
    velocity.max_trades_next_minute,
    throttle.max_total_fills,
    guard.max_next_fills,
    dailyLock.max_next_fills,
    decision.max_next_fills,
  );
  const budgetUsd = Math.max(
    throttle.deploy_budget_usd,
    planner.deploy_budget_usd,
    dailyLock.deploy_allowed_usd,
    decision.paper_size_usd,
  );
  const queueReady = queue.ready_count;
  const queueTotal = Math.max(1, queue.items.length);
  const loopBars = [
    { label: "vel", value: velocity.velocity_score, tone: velocityTone },
    { label: "fill", value: Math.min(100, maxFills / Math.max(1, velocity.target_trades_per_minute) * 100), tone: maxFills > 0 ? velocityTone : "neutral" as QuickChipTone },
    { label: "run", value: throttle.throttle_score, tone: throttleTone },
    { label: "guard", value: guard.profit_guard_score, tone: guardTone },
    { label: "q", value: Math.min(100, queueReady / queueTotal * 100), tone: queueReady > 0 ? "engine" as QuickChipTone : "neutral" as QuickChipTone },
  ];
  const width = 220;
  const height = 76;
  const barWidth = 24;
  const barGap = 14;
  const baseY = 54;
  const maxBarHeight = 38;
  const toneFillClass: Record<QuickChipTone, string> = {
    neutral: "fill-outline",
    violet: "fill-violet",
    engine: "fill-engine",
    demo: "fill-demo",
    caution: "fill-caution",
    critical: "fill-critical",
  };
  const textToneClass: Record<QuickChipTone, string> = {
    neutral: "text-outline",
    violet: "text-violet",
    engine: "text-engine",
    demo: "text-demo",
    caution: "text-caution",
    critical: "text-critical",
  };
  const loopToneClass = textToneClass[velocityTone];

  return (
    <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5" aria-label="High frequency profit loop">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Profit loop</p>
          <p className={cn("mt-1 truncate text-xs font-semibold sm:text-sm", loopToneClass)}>
            {formatCompactSignedCurrency(velocity.expected_profit_per_minute_usd)}/min
          </p>
        </div>
        <Chip tone={velocityTone}>{velocity.loop_permission.replaceAll("-", " ")}</Chip>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="High frequency profit loop chart for profit velocity fill capacity throttle guard and queue readiness"
        className="mt-1 h-10 w-full"
      >
        <rect width={width} height={height} rx="6" className="fill-void" opacity="0.2" />
        <line x1="12" x2={width - 12} y1={baseY} y2={baseY} stroke="currentColor" strokeOpacity="0.14" strokeDasharray="4 6" />
        {loopBars.map((bar, index) => {
          const barHeight = Math.max(4, Math.min(100, bar.value) / 100 * maxBarHeight);
          const x = 24 + index * (barWidth + barGap);
          return (
            <g key={bar.label}>
              <rect x={x} y={baseY - barHeight} width={barWidth} height={barHeight} rx="4" className={toneFillClass[bar.tone]} opacity="0.82" />
              <text x={x + barWidth / 2} y={baseY + 12} textAnchor="middle" className="fill-outline font-mono text-[8px] uppercase">
                {bar.label}
              </text>
            </g>
          );
        })}
        <text x="180" y="18" textAnchor="middle" className="fill-outline font-mono text-[9px]">
          {maxFills}/m
        </text>
      </svg>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-outline-variant/15 pt-1">
        <div className="min-w-0">
          <dt className="truncate font-mono text-[8px] uppercase tracking-telemetry text-outline">Cadence</dt>
          <dd className={cn("truncate text-[10px] font-semibold", textToneClass[throttleTone])}>
            {throttle.cadence_seconds}s · {velocity.max_trades_next_minute} trades/min cap
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate font-mono text-[8px] uppercase tracking-telemetry text-outline">Budget</dt>
          <dd className={cn("truncate text-[10px] font-semibold", textToneClass[budgetUsd > 0 && maxFills > 0 ? velocityTone : "neutral"])}>
            {formatCompactCurrency(budgetUsd)} · {maxFills} fills
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate font-mono text-[8px] uppercase tracking-telemetry text-outline">Guard</dt>
          <dd className={cn("truncate text-[10px] font-semibold", textToneClass[guardTone])}>
            {guard.blocks_fresh_buy ? "fresh buy blocked" : `${guard.fill_efficiency_pct}% fill efficiency`}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate font-mono text-[8px] uppercase tracking-telemetry text-outline">Daily lock</dt>
          <dd className={cn("truncate text-[10px] font-semibold", textToneClass[lockTone])}>
            {dailyLock.loop_permission.replaceAll("-", " ")} · {formatCompactSignedCurrency(dailyLock.current_net_pnl_usd)}
          </dd>
        </div>
      </dl>
      <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-on-surface-variant">
        {symbol}: {throttle.action.replaceAll("-", " ")} · {planner.session_kind} · {digest.recent_fill_count} recent paper fills.
      </p>
      <span className="sr-only" aria-label="High frequency profit loop receipt">
        High frequency profit loop for {symbol}: permission {velocity.loop_permission}, status {velocity.status}, modeled profit per minute {formatSignedCurrency(velocity.expected_profit_per_minute_usd)}, max trades next minute {velocity.max_trades_next_minute}, target trades per minute {velocity.target_trades_per_minute}, throttle {throttle.status}, cadence {throttle.cadence_seconds} seconds, max fills {maxFills}, deploy budget {formatCurrency(budgetUsd)}, guard {guard.status}, daily lock {dailyLock.loop_permission}, queue ready {queueReady}, local paper fills {digest.recent_fill_count}, execution boundary {decision.execution_boundary}.
      </span>
    </div>
  );
}

function QuickAutonomousProofQueue({
  state,
  decision,
  compact = false,
}: {
  state: Web3TradingState;
  decision: Web3TradingState["autonomous_now_decision"];
  compact?: boolean;
}) {
  const intake = state.autonomous_market_intake_plan;
  const freshness = state.autonomous_data_freshness_gate;
  const candle = state.autonomous_candle_conviction;
  const chartTarget = state.autonomous_chart_proof_target;
  const route = state.autonomous_route_refresh_execution;
  const wallet = state.autonomous_wallet_telemetry;
  const adapter = state.autonomous_execution_adapter_readiness;
  const execution = state.autonomous_execution_runway;
  const routeTone: QuickChipTone = route.status === "ready" || route.status === "requesting"
    ? "engine"
    : route.status === "blocked"
      ? "critical"
      : route.route_refresh_required
        ? "caution"
        : "neutral";
  const candleTone: QuickChipTone = candle.status === "confirm" || candle.status === "probe"
    ? "engine"
    : candle.status === "reject" || candle.status === "protect"
      ? "critical"
      : "caution";
  const walletTone: QuickChipTone = wallet.status === "compounding" || wallet.status === "harvest"
    ? "engine"
    : wallet.status === "protect" || wallet.status === "cooldown"
      ? "critical"
      : wallet.window_pnl_usd < 0
        ? "caution"
        : "neutral";
  const liveTone: QuickChipTone = state.execution_gate.live_execution_enabled || adapter.submit_ready
    ? "critical"
    : adapter.paper_fallback_active
      ? "demo"
      : adapter.status === "blocked"
        ? "critical"
        : "caution";
  const proofItems = [
    {
      id: "source",
      label: "Source",
      value: intake.next_provider === "none" ? "no lane" : intake.next_provider,
      detail: `${intake.next_lane.replaceAll("-", " ")} · ${intake.next_request_seconds}s`,
      score: intake.data_score,
      tone: marketIntakeTone(intake.status, intake.can_feed_trade_loop),
    },
    {
      id: "fresh",
      label: "Fresh",
      value: freshness.status,
      detail: freshness.next_refresh_lane.replaceAll("-", " "),
      score: freshness.data_score,
      tone: dataFreshnessTone(freshness.status, freshness.can_trade),
    },
    {
      id: "candle",
      label: "Candle",
      value: candle.status,
      detail: `${chartTarget.provider} · ${chartTarget.should_fetch ? "fetch" : "held"}`,
      score: candle.conviction_score,
      tone: candleTone,
    },
    {
      id: "route",
      label: "Route",
      value: route.status,
      detail: route.selected_lane?.replaceAll("-", " ") ?? route.selected_quote_request?.provider ?? "quote wait",
      score: route.route_confidence_score,
      tone: routeTone,
    },
    {
      id: "wallet",
      label: "Wallet",
      value: wallet.status,
      detail: `${formatCompactSignedCurrency(wallet.window_pnl_usd)} · ${wallet.open_position_count} held`,
      score: Math.max(0, Math.min(100, Math.round(100 - wallet.max_drawdown_pct * 3))),
      tone: walletTone,
    },
    {
      id: "live",
      label: "Live",
      value: state.execution_gate.live_execution_enabled ? "armed" : "locked",
      detail: adapter.submit_ready ? "submit ready" : adapter.paper_fallback_active ? "paper fallback" : adapter.status.replaceAll("-", " "),
      score: state.execution_gate.live_execution_enabled ? adapter.readiness_score : Math.min(adapter.readiness_score, 55),
      tone: liveTone,
    },
  ] satisfies Array<{
    id: string;
    label: string;
    value: string;
    detail: string;
    score: number;
    tone: QuickChipTone;
  }>;
  const width = 260;
  const height = 104;
  const barWidth = 24;
  const gap = 14;
  const baseY = 66;
  const maxBarHeight = 42;
  const fillClass: Record<QuickChipTone, string> = {
    neutral: "fill-outline",
    violet: "fill-violet",
    engine: "fill-engine",
    demo: "fill-demo",
    caution: "fill-caution",
    critical: "fill-critical",
  };
  const nextLaneLabel = freshness.next_refresh_lane === "none"
    ? decision.action.replaceAll("-", " ")
    : freshness.next_refresh_lane.replaceAll("-", " ");
  const blockers = [
    ...decision.blockers,
    ...route.blockers,
    ...candle.blockers,
    ...chartTarget.blockers,
  ].filter((blocker, index, list) => blocker && list.indexOf(blocker) === index);

  return (
    <section className={cn("overflow-hidden rounded-md border border-outline-variant/30 bg-void/20 p-2", compact ? "sm:p-2" : "sm:p-3")} aria-label="Autonomous proof queue">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Proof queue</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {nextLaneLabel}
          </p>
        </div>
        <Chip tone={freshness.can_trade && !decision.chart_proof_required && !decision.route_refresh_required ? "engine" : blockers.length > 0 ? "caution" : "demo"}>
          {freshness.max_next_fills} fills
        </Chip>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous proof queue chart for source freshness candle route wallet and live gate readiness"
        className={cn("mt-2 w-full", compact ? "h-10" : "h-16")}
      >
        <rect width={width} height={height} rx="7" className="fill-surface-dim" opacity="0.22" />
        <line x1="12" x2={width - 12} y1={baseY} y2={baseY} stroke="currentColor" strokeOpacity="0.14" strokeDasharray="4 6" />
        {proofItems.map((item, index) => {
          const clamped = Math.max(0, Math.min(100, item.score));
          const barHeight = Math.max(4, clamped / 100 * maxBarHeight);
          const x = 18 + index * (barWidth + gap);
          return (
            <g key={item.id}>
              <rect x={x} y={baseY - barHeight} width={barWidth} height={barHeight} rx="4" className={fillClass[item.tone]} opacity="0.82" />
              <text x={x + barWidth / 2} y={baseY + 13} textAnchor="middle" className="fill-outline font-mono text-[8px] uppercase">
                {item.label.slice(0, 3)}
              </text>
            </g>
          );
        })}
        <text x={width - 20} y="18" textAnchor="end" className="fill-outline font-mono text-[9px]">
          {execution.next_tick_seconds}s
        </text>
      </svg>
      <div className={cn("mt-2 grid gap-1", compact ? "grid-cols-3" : "grid-cols-2")}>
        {(compact ? proofItems.slice(0, 3) : proofItems).map((item) => (
          <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-mono text-[8px] uppercase tracking-telemetry text-outline">{item.label}</p>
              <p className={cn("shrink-0 font-mono text-[9px] font-semibold", profitAuthorityTextClass(item.tone))}>{item.score}</p>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-on-surface">{item.value.replaceAll("-", " ")}</p>
          </div>
        ))}
      </div>
      <p className={cn("mt-2 truncate text-xs text-on-surface-variant", compact ? "leading-4" : "leading-5")}>
        {freshness.next_action}
      </p>
      {!compact && blockers.length > 0 ? (
        <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-telemetry text-caution">
          Blocker: {blockers[0]}
        </p>
      ) : null}
      <span className="sr-only" aria-label="Autonomous proof queue receipt">
        Autonomous proof queue next lane {nextLaneLabel}; market intake {intake.status} through {intake.next_provider} {intake.next_endpoint}; data freshness {freshness.status} action {freshness.action} next refresh {freshness.next_refresh_lane}; candle {candle.status} target {candle.target_symbol ?? "none"} provider {chartTarget.provider} should fetch {chartTarget.should_fetch ? "yes" : "no"}; route {route.status} lane {route.selected_lane ?? "none"} confidence {route.route_confidence_score}; wallet {wallet.status} equity {formatCurrency(wallet.equity_usd)} window {formatSignedCurrency(wallet.window_pnl_usd)}; execution runway {execution.status} action {execution.action}; live gate {state.execution_gate.live_execution_enabled ? "armed" : "locked"} with adapter {adapter.status}; blockers {blockers.join("; ") || "none"}.
      </span>
    </section>
  );
}

function QuickAutonomousSessionTicket({ state }: { state: Web3TradingState }) {
  const planner = state.autonomous_session_planner;
  const wake = state.autonomous_wake_plan;
  const ticket = state.autonomous_order_ticket;
  const execution = state.autonomous_order_ticket_execution;
  const throttle = state.autonomous_loop_throttle;
  const tickGovernor = state.autonomous_tick_governor;
  const rows: Array<{
    id: string;
    label: string;
    score: number;
    value: string;
    detail: string;
    tone: QuickChipTone;
  }> = [
    {
      id: "session",
      label: "Session",
      score: clampNumber(Math.round(planner.planned_ticks * 8 + planner.max_total_fills * 10 + Math.max(0, planner.expected_profit_usd) * 0.18)),
      value: `${planner.planned_ticks}t/${planner.max_total_fills}f`,
      detail: `${planner.max_fresh_buys} fresh · ${planner.max_protective_sells} protect`,
      tone: planner.status === "run-now" || planner.status === "probe" ? "engine" : planner.status === "blocked" ? "critical" : "caution",
    },
    {
      id: "wake",
      label: "Wake",
      score: wake.can_auto_watch_run ? clampNumber(Math.round(100 - wake.next_wake_seconds * 1.5 + wake.queued_action_count * 8)) : 18,
      value: wake.next_client_action.replaceAll("-", " "),
      detail: `${wake.next_wake_seconds}s · ${wake.trigger.replaceAll("-", " ")}`,
      tone: wakePlanTone(wake.status, wake.can_auto_watch_run),
    },
    {
      id: "order",
      label: "Order",
      score: ticket.confidence_score,
      value: ticket.symbol ? `${ticket.symbol} ${ticket.side}` : ticket.action.replaceAll("-", " "),
      detail: `${ticket.action.replaceAll("-", " ")} · ${formatCompactCurrency(ticket.paper_notional_usd)}`,
      tone: ticket.status === "ready" ? "engine" : ticket.status === "blocked" ? "critical" : ticket.status === "protect" || ticket.status === "refresh" ? "caution" : "neutral",
    },
    {
      id: "route",
      label: "Route",
      score: ticket.route_score,
      value: ticket.route_required ? "refresh" : ticket.execution_boundary.replaceAll("-", " "),
      detail: `${ticket.friction_cost_bps}bps · ${ticket.friction_status}`,
      tone: ticket.route_required || ticket.friction_required ? "caution" : ticket.route_score >= 58 ? "engine" : ticket.status === "blocked" ? "critical" : "neutral",
    },
    {
      id: "apply",
      label: "Apply",
      score: execution.ledger_applied ? 100 : execution.paper_trade_ready ? 82 : execution.status === "blocked" ? 18 : Math.max(28, execution.confidence_score),
      value: execution.status.replaceAll("-", " "),
      detail: `${formatCompactCurrency(execution.paper_size_usd)} · ${execution.execution_boundary.replaceAll("-", " ")}`,
      tone: execution.ledger_applied || execution.paper_trade_ready || execution.status === "queued" ? "engine" : execution.status === "blocked" ? "critical" : execution.status === "route-refresh" || execution.status === "protect-only" ? "caution" : "neutral",
    },
  ];
  const width = 760;
  const height = 112;
  const maxScore = Math.max(100, ...rows.map((row) => row.score));
  const statusTone: QuickChipTone = planner.status === "run-now" || planner.status === "probe"
    ? "engine"
    : planner.status === "blocked"
      ? "critical"
      : planner.status === "protect" || planner.status === "refresh-first" || planner.status === "cooldown"
        ? "caution"
        : "neutral";
  const ticketTone: QuickChipTone = ticket.can_auto_paper
    ? "engine"
    : ticket.status === "blocked"
      ? "critical"
      : ticket.status === "refresh" || ticket.status === "protect"
        ? "caution"
        : "neutral";

  return (
    <div className="mt-3 rounded-md border border-engine/20 bg-void/20 p-2" aria-label="Autonomous session ticket">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Session ticket</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {planner.target_symbol ?? ticket.symbol ?? "Desk"} · {planner.session_kind.replaceAll("-", " ")}
          </p>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-on-surface-variant">
            {planner.next_action}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={statusTone}>{planner.status.replaceAll("-", " ")}</Chip>
          <Chip tone={wake.can_auto_watch_run ? "engine" : "critical"}>{wake.next_client_action.replaceAll("-", " ")}</Chip>
          <Chip tone={ticketTone}>{ticket.execution_boundary.replaceAll("-", " ")}</Chip>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous session ticket chart"
        className="mt-2 h-24 w-full text-engine"
      >
        <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.22" />
        <text x="14" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">session plan / ticket / apply</text>
        <text x={width - 14} y="17" textAnchor="end" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">
          tick {tickGovernor.next_tick_seconds}s · throttle {throttle.cadence_seconds}s
        </text>
        {rows.map((row, index) => {
          const x = 18 + index * 148;
          const barWidth = 96;
          const barHeight = Math.max(7, row.score / maxScore * 42);
          const y = 71 - barHeight;
          return (
            <g key={row.id}>
              <text x={x} y="34" className="fill-on-surface font-mono text-[10px] font-semibold">{row.label}</text>
              <text x={x + barWidth} y="34" textAnchor="end" className={cn("font-mono text-[10px] font-semibold", decisionOwnerFillTextClass(row.tone))}>{Math.round(row.score)}</text>
              <rect x={x} y="42" width={barWidth} height="42" rx="6" className="fill-outline" opacity="0.1" />
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="6" className={decisionOwnerSvgClass(row.tone)} opacity="0.84" />
              <text x={x} y="99" className="fill-on-surface font-mono text-[9px] font-semibold">{shortReactionValue(row.value)}</text>
              <text x={x + barWidth} y="99" textAnchor="end" className="fill-outline font-mono text-[8px]">{shortReactionValue(row.detail)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 hidden grid-cols-2 gap-1 2xl:grid">
        <ProfitMetric label="Deploy" value={formatCompactCurrency(planner.deploy_budget_usd || throttle.deploy_budget_usd)} detail={`${formatCompactCurrency(planner.release_budget_usd || throttle.release_budget_usd)} release`} tone={(planner.deploy_budget_usd || throttle.deploy_budget_usd) > 0 ? "engine" : (planner.release_budget_usd || throttle.release_budget_usd) > 0 ? "caution" : "neutral"} />
        <ProfitMetric label="Expected" value={formatCompactSignedCurrency(planner.expected_profit_usd)} detail={`${formatCompactSignedCurrency(planner.expected_profit_per_minute_usd)}/min`} tone={planner.expected_profit_usd > 0 ? "engine" : "neutral"} />
        <ProfitMetric label="Size cap" value={formatCompactCurrency(ticket.size_governor_final_size_usd)} detail={`${ticket.size_governor_memory_multiplier}x memory`} tone={ticket.size_governor_memory_blocked ? "critical" : ticket.size_governor_can_trade_paper ? "engine" : "caution"} />
        <ProfitMetric label="Stop/target" value={`${ticket.stop_loss_pct.toFixed(1)}%`} detail={`${ticket.take_profit_pct.toFixed(1)}% target`} tone={ticket.side === "sell" || ticket.status === "protect" ? "caution" : "neutral"} />
      </div>
      <span className="sr-only" aria-label="Autonomous session ticket receipt">
        Autonomous session ticket status {planner.status}; session kind {planner.session_kind}; tactic {planner.selected_tactic_label}; target {planner.target_symbol ?? ticket.symbol ?? "none"}; planned ticks {planner.planned_ticks}; max total fills {planner.max_total_fills}; max fresh buys {planner.max_fresh_buys}; max protective sells {planner.max_protective_sells}; deploy {formatCurrency(planner.deploy_budget_usd)}; release {formatCurrency(planner.release_budget_usd)}; expected profit {formatSignedCurrency(planner.expected_profit_usd)}; wake plan {wake.status} next client action {wake.next_client_action}; order ticket {ticket.status} action {ticket.action} side {ticket.side}; can auto paper {ticket.can_auto_paper ? "yes" : "no"}; execution {execution.status}; paper ready {execution.paper_trade_ready ? "yes" : "no"}; ledger applied {execution.ledger_applied ? "yes" : "no"}; live execution {state.execution_gate.live_execution_enabled ? "armed" : "locked"}.
      </span>
    </div>
  );
}

function QuickHftReactionChart({ state }: { state: Web3TradingState }) {
  const reaction = state.autonomous_reaction_loop;
  const landing = state.autonomous_landing_optimizer;
  const envelope = state.autonomous_run_envelope;
  const guard = state.autonomous_profit_run_guard;
  const rows: Array<{
    id: string;
    label: string;
    score: number;
    value: string;
    tone: QuickChipTone;
  }> = [
    {
      id: "buy",
      label: "Buy",
      score: reaction.buy_pressure_score,
      value: reaction.action.replaceAll("-", " "),
      tone: reaction.side === "buy" && (reaction.status === "press" || reaction.status === "scalp") ? "engine" : reaction.buy_pressure_score >= 58 ? "caution" : "neutral",
    },
    {
      id: "sell",
      label: "Sell",
      score: reaction.sell_pressure_score,
      value: formatCompactCurrency(reaction.release_usd),
      tone: reaction.side === "sell" || reaction.status === "protect" ? "caution" : reaction.sell_pressure_score >= 58 ? "critical" : "neutral",
    },
    {
      id: "route",
      label: "Route",
      score: reaction.route_pressure_score,
      value: landing.selected_path.replaceAll("-", " "),
      tone: reaction.status === "refresh" || landing.status === "refresh" ? "caution" : landing.status === "blocked" ? "critical" : landing.status === "paper" || landing.status === "managed" || landing.status === "land-now" ? "engine" : "neutral",
    },
    {
      id: "wallet",
      label: "Wallet",
      score: reaction.wallet_pressure_score,
      value: guard.action.replaceAll("-", " "),
      tone: guard.status === "blocked" || guard.status === "protect" ? "critical" : guard.can_keep_running || guard.can_increase_cadence ? "engine" : guard.status === "tighten" || guard.status === "refresh" ? "caution" : "neutral",
    },
    {
      id: "run",
      label: "Run",
      score: envelope.run_confidence_score,
      value: `${envelope.next_wake_seconds}s wake`,
      tone: envelope.run_enabled || envelope.keep_running ? "engine" : envelope.status === "blocked" ? "critical" : envelope.status === "protect" || envelope.status === "refresh" || envelope.status === "cooldown" ? "caution" : "neutral",
    },
  ];
  const width = 720;
  const height = 142;
  const maxScore = Math.max(100, ...rows.map((row) => row.score));
  const reactionTone = reaction.status === "press" || reaction.status === "scalp"
    ? "engine"
    : reaction.status === "blocked"
      ? "critical"
      : reaction.status === "protect" || reaction.status === "refresh" || reaction.status === "cooldown"
        ? "caution"
        : "neutral";
  const landingTone = landing.status === "land-now" || landing.status === "priority" || landing.status === "managed" || landing.status === "paper"
    ? "engine"
    : landing.status === "blocked" || landing.status === "fee-drag"
      ? "critical"
      : landing.status === "refresh" || landing.status === "signature-gated"
        ? "caution"
        : "neutral";
  const runTone = envelope.run_enabled || envelope.keep_running
    ? "engine"
    : envelope.status === "blocked"
      ? "critical"
      : envelope.status === "protect" || envelope.status === "refresh" || envelope.status === "cooldown"
        ? "caution"
        : "neutral";

  return (
    <div className="rounded-md border border-engine/20 bg-surface-dim/20 p-2" aria-label="HFT reaction loop">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">HFT reaction</p>
          <p className="mt-1 break-words text-sm font-semibold text-on-surface">
            {reaction.symbol ? `${reaction.symbol} · ${reaction.action.replaceAll("-", " ")}` : reaction.action.replaceAll("-", " ")}
          </p>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-on-surface-variant">
            {reaction.next_action}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={reactionTone}>{reaction.status.replaceAll("-", " ")}</Chip>
          <Chip tone={landingTone}>{landing.status.replaceAll("-", " ")}</Chip>
          <Chip tone={runTone}>{envelope.action.replaceAll("-", " ")}</Chip>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous HFT reaction pressure chart"
        className="mt-2 h-24 w-full text-engine"
      >
        <rect width={width} height={height} rx="8" className="fill-void" opacity="0.22" />
        <text x="14" y="18" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">pressure / landing / run envelope</text>
        <text x={width - 14} y="18" textAnchor="end" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">
          invalidates {reaction.invalidates_in_seconds}s
        </text>
        {rows.map((row, index) => {
          const x = 20 + index * 112;
          const barWidth = 72;
          const barHeight = Math.max(8, row.score / maxScore * 72);
          const y = 104 - barHeight;
          return (
            <g key={row.id}>
              <rect x={x} y="32" width={barWidth} height="72" rx="8" className="fill-outline" opacity="0.1" />
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="8" className={decisionOwnerSvgClass(row.tone)} opacity="0.84" />
              <text x={x} y="119" className="fill-on-surface font-mono text-[10px] font-semibold">{row.label}</text>
              <text x={x + barWidth} y="119" textAnchor="end" className={cn("font-mono text-[10px] font-semibold", decisionOwnerFillTextClass(row.tone))}>{Math.round(row.score)}</text>
              <text x={x} y="132" className="fill-outline font-mono text-[8px]">{shortReactionValue(row.value)}</text>
            </g>
          );
        })}
        <path
          d={`M610 45 L650 45 L650 ${45 + Math.max(0, 48 - landing.landing_probability_pct / 100 * 48)} L692 ${45 + Math.max(0, 48 - landing.landing_probability_pct / 100 * 48)}`}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.68"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text x="610" y="103" className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">land {landing.landing_probability_pct}%</text>
        <text x="610" y="117" className="fill-outline font-mono text-[9px]">ttl {landing.ttl_seconds}s · {landing.max_slippage_bps}bps</text>
        <text x="610" y="131" className="fill-outline font-mono text-[9px]">{formatCompactSignedCurrency(reaction.expected_edge_usd)} edge</text>
      </svg>
      <div className="mt-1 hidden grid-cols-2 gap-1 2xl:grid 2xl:grid-cols-4">
        <ProfitMetric label="Cadence" value={`${reaction.hft_cadence_seconds}s`} detail={`${reaction.urgency_score}/100 urgency`} tone={reactionTone} />
        <ProfitMetric label="Notional" value={reaction.side === "buy" ? formatCompactCurrency(reaction.max_notional_usd) : formatCompactCurrency(reaction.release_usd)} detail={reaction.side} tone={reaction.side === "sell" ? "caution" : reaction.side === "buy" ? "engine" : "neutral"} />
        <ProfitMetric label="Landing" value={`${landing.landing_probability_pct}%`} detail={landing.selected_path.replaceAll("-", " ")} tone={landingTone} />
        <ProfitMetric label="Loop" value={`${envelope.max_trades_next_minute}/min`} detail={`${formatCompactSignedCurrency(envelope.expected_profit_per_minute_usd)}/min`} tone={runTone} />
      </div>
      <span className="sr-only" aria-label="HFT reaction loop receipt">
        HFT reaction loop status {reaction.status}; action {reaction.action}; symbol {reaction.symbol ?? "none"}; side {reaction.side}; urgency {reaction.urgency_score}; buy pressure {reaction.buy_pressure_score}; sell pressure {reaction.sell_pressure_score}; route pressure {reaction.route_pressure_score}; wallet pressure {reaction.wallet_pressure_score}; cadence {reaction.hft_cadence_seconds} seconds; invalidates in {reaction.invalidates_in_seconds} seconds; max notional {formatCurrency(reaction.max_notional_usd)}; release {formatCurrency(reaction.release_usd)}; landing optimizer {landing.status} action {landing.action} path {landing.selected_path} probability {landing.landing_probability_pct} percent; run envelope {envelope.status} action {envelope.action} run enabled {envelope.run_enabled ? "yes" : "no"} keep running {envelope.keep_running ? "yes" : "no"}; live execution {state.execution_gate.live_execution_enabled ? "armed" : "locked"}.
      </span>
    </div>
  );
}

function QuickExecutionQualityGate({ state }: { state: Web3TradingState }) {
  const quality = state.autonomous_execution_quality_arbiter;
  const safety = state.autonomous_token_safety_clearance;
  const routeGate = state.route_profit_gate;
  const mev = state.execution_mev_guard;
  const selected = quality.items.find((item) => item.symbol === quality.selected_symbol && item.lane === quality.selected_lane) ?? quality.items[0] ?? null;
  const safetyItem = selected
    ? safety.items.find((item) => item.symbol === selected.symbol) ?? safety.items[0] ?? null
    : safety.items[0] ?? null;
  const routeItem = selected
    ? routeGate.items.find((item) => item.symbol === selected.symbol && item.side === selected.side) ?? routeGate.items[0] ?? null
    : routeGate.items[0] ?? null;
  const mevItem = selected
    ? mev.items.find((item) => item.symbol === selected.symbol && item.side === selected.side) ?? mev.items[0] ?? null
    : mev.items[0] ?? null;
  const rows: Array<{
    id: string;
    label: string;
    score: number;
    value: string;
    tone: QuickChipTone;
  }> = [
    {
      id: "exec",
      label: "Exec",
      score: selected?.execution_score ?? quality.selected_score,
      value: selected?.action.replaceAll("-", " ") ?? quality.status,
      tone: executionQualityTone(quality.status, selected?.status),
    },
    {
      id: "route",
      label: "Route",
      score: selected?.route_score ?? routeGate.average_score,
      value: routeItem ? `${routeItem.total_cost_bps}bps` : `${routeGate.average_route_net_edge_pct}%`,
      tone: routeGate.status === "execute" || routeGate.status === "queue" ? "engine" : routeGate.status === "blocked" ? "critical" : routeGate.status === "resize" || routeGate.status === "protect" ? "caution" : "neutral",
    },
    {
      id: "land",
      label: "Land",
      score: selected?.landing_score ?? 0,
      value: selected?.landing_path.replaceAll("-", " ") ?? quality.selected_path.replaceAll("-", " "),
      tone: selected?.landing_path === "blocked" || quality.selected_path === "blocked" ? "critical" : selected?.landing_path === "paper-ledger" || quality.selected_path === "paper-ledger" ? "demo" : "engine",
    },
    {
      id: "mev",
      label: "MEV",
      score: clampNumber(100 - (selected?.mev_risk_score ?? mev.average_sandwich_risk_score)),
      value: mevItem ? `${mevItem.recommended_slippage_bps}bps` : `${mev.max_slippage_bps}bps`,
      tone: mev.status === "blocked" ? "critical" : mev.status === "protect" || mev.status === "watch" ? "caution" : mev.status === "clear" || mev.status === "paper" ? "engine" : "neutral",
    },
    {
      id: "safe",
      label: "Safe",
      score: safetyItem?.safety_score ?? safety.average_safety_score,
      value: safetyItem?.clearance.replaceAll("-", " ") ?? safety.status,
      tone: tokenSafetyTone(safety.status),
    },
  ];
  const width = 430;
  const height = 116;
  const maxScore = Math.max(100, ...rows.map((row) => row.score));
  const qualityTone = executionQualityTone(quality.status, selected?.status);
  const primarySymbol = quality.selected_symbol ?? selected?.symbol ?? safety.leader_symbol ?? "Desk";
  const netEdge = selected?.expected_net_profit_usd ?? routeGate.expected_net_profit_usd;

  return (
    <div className="rounded-md border border-outline-variant/25 bg-surface-dim/20 p-2" aria-label="Execution quality gate">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Execution quality</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {primarySymbol} · {quality.status.replaceAll("-", " ")}
          </p>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-on-surface-variant">
            {quality.next_action}
          </p>
        </div>
        <Chip tone={qualityTone}>{quality.selected_score}/100</Chip>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous execution quality gate chart"
        className="mt-2 h-24 w-full text-engine"
      >
        <rect width={width} height={height} rx="8" className="fill-void" opacity="0.22" />
        <text x="12" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">cost / landing / safety</text>
        <text x={width - 12} y="16" textAnchor="end" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">{formatCompactSignedCurrency(netEdge)}</text>
        {rows.map((row, index) => {
          const x = 16 + index * 80;
          const barHeight = Math.max(7, row.score / maxScore * 58);
          const y = 82 - barHeight;
          return (
            <g key={row.id}>
              <rect x={x} y="24" width="48" height="58" rx="6" className="fill-outline" opacity="0.1" />
              <rect x={x} y={y} width="48" height={barHeight} rx="6" className={decisionOwnerSvgClass(row.tone)} opacity="0.82" />
              <text x={x} y="97" className="fill-on-surface font-mono text-[9px] font-semibold">{row.label}</text>
              <text x={x + 48} y="97" textAnchor="end" className={cn("font-mono text-[9px] font-semibold", decisionOwnerFillTextClass(row.tone))}>{Math.round(row.score)}</text>
              <text x={x} y="110" className="fill-outline font-mono text-[8px]">{shortReactionValue(row.value)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 hidden grid-cols-2 gap-1 2xl:grid">
        <ProfitMetric label="Route cost" value={routeItem ? `${routeItem.total_cost_bps}bps` : "n/a"} detail={routeItem ? formatCompactSignedCurrency(routeItem.expected_net_profit_usd) : routeGate.status} tone={routeGate.status === "blocked" ? "critical" : routeGate.status === "resize" ? "caution" : "engine"} />
        <ProfitMetric label="MEV" value={mev.status} detail={`${mev.blocked_count} blocked`} tone={mev.status === "blocked" ? "critical" : mev.status === "watch" || mev.status === "protect" ? "caution" : "engine"} />
        <ProfitMetric label="Safety" value={safety.status} detail={`${safety.cleared_count}/${safety.items.length} clear`} tone={tokenSafetyTone(safety.status)} />
        <ProfitMetric label="Review" value={`${quality.fastest_review_seconds}s`} detail={`${quality.ready_count}/${quality.blocked_count} ready/blocked`} tone={qualityTone} />
      </div>
      <span className="sr-only" aria-label="Execution quality gate receipt">
        Execution quality gate status {quality.status}; selected {primarySymbol}; score {quality.selected_score}; selected path {quality.selected_path}; max buy {formatCurrency(quality.max_buy_usd)}; release {formatCurrency(quality.release_usd)}; average execution score {quality.average_execution_score}; route status {routeGate.status}; route expected net profit {formatSignedCurrency(routeGate.expected_net_profit_usd)}; MEV guard {mev.status}; max slippage {mev.max_slippage_bps} bps; token safety {safety.status}; average safety {safety.average_safety_score}; live execution {state.execution_gate.live_execution_enabled ? "armed" : "locked"}.
      </span>
    </div>
  );
}

function executionQualityTone(
  status: Web3TradingState["autonomous_execution_quality_arbiter"]["status"],
  itemStatus?: Web3TradingState["autonomous_execution_quality_arbiter"]["items"][number]["status"],
): QuickChipTone {
  if (status === "execute" || itemStatus === "ready") return "engine";
  if (status === "blocked" || itemStatus === "blocked") return "critical";
  if (status === "selective" || status === "repair" || status === "paper-only" || itemStatus === "watch") return "caution";
  return "neutral";
}

function QuickProfitAccountabilityChart({ state }: { state: Web3TradingState }) {
  const accountability = state.autonomous_profit_accountability;
  const integrity = state.autonomous_profit_integrity_circuit;
  const feedback = state.autonomous_loop_feedback;
  const memory = state.autonomous_outcome_memory_governor;
  const sessionRun = state.autonomous_session_run;
  const wallet = state.autonomous_wallet_telemetry;
  const rows: Array<{
    id: string;
    label: string;
    score: number;
    value: string;
    tone: QuickChipTone;
  }> = [
    {
      id: "pnl",
      label: "PnL",
      score: accountability.accountability_score,
      value: formatCompactSignedCurrency(accountability.net_pnl_usd),
      tone: accountability.making_money ? "engine" : accountability.status === "blocked" ? "critical" : "caution",
    },
    {
      id: "win",
      label: "Win",
      score: Math.round(accountability.win_rate_pct),
      value: `${accountability.profit_factor.toFixed(2)}x pf`,
      tone: accountability.win_rate_pct >= 55 || accountability.profit_factor >= 1.1 ? "engine" : accountability.win_rate_pct < 35 ? "critical" : "caution",
    },
    {
      id: "fills",
      label: "Fills",
      score: clampNumber(Math.round(accountability.fill_count / Math.max(1, accountability.fill_count + accountability.blocked_count) * 100)),
      value: `${accountability.fill_count}/${accountability.blocked_count}`,
      tone: accountability.fill_count > accountability.blocked_count ? "engine" : accountability.blocked_count > accountability.fill_count + 1 ? "critical" : "caution",
    },
    {
      id: "integrity",
      label: "Gate",
      score: integrity.integrity_score,
      value: integrity.permission.replaceAll("-", " "),
      tone: integrity.status === "press" || integrity.status === "continue" ? "engine" : integrity.status === "blocked" || integrity.should_pause_fresh_buys ? "critical" : integrity.status === "protect" || integrity.status === "probe" || integrity.status === "cooldown" ? "caution" : "neutral",
    },
    {
      id: "loop",
      label: "Loop",
      score: feedback.feedback_score,
      value: `${feedback.size_multiplier}x`,
      tone: feedback.should_pause_fresh_buys ? "critical" : feedback.status === "press" || feedback.status === "keep" ? "engine" : feedback.status === "tighten" || feedback.status === "protect" ? "caution" : "neutral",
    },
    {
      id: "memory",
      label: "Memory",
      score: memory.memory_score,
      value: memory.next_bias.replaceAll("-", " "),
      tone: memory.status === "press" || memory.status === "compound" ? "engine" : memory.status === "protect" || memory.status === "cooldown" ? "critical" : memory.status === "selective" || memory.status === "learning" ? "caution" : "neutral",
    },
  ];
  const width = 360;
  const height = 128;
  const maxScore = Math.max(100, ...rows.map((row) => row.score));
  const accountabilityTone: QuickChipTone = accountability.making_money
    ? "engine"
    : accountability.status === "blocked" || accountability.status === "protect"
      ? "critical"
      : "caution";
  const sessionTone: QuickChipTone = !sessionRun.requested
    ? "neutral"
    : sessionRun.net_pnl_usd >= 0
      ? "engine"
      : "critical";

  return (
    <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2" aria-label="Profit accountability loop">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Profit proof</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {integrity.permission.replaceAll("-", " ")} · {accountability.making_money ? "making money" : accountability.action.replaceAll("-", " ")}
          </p>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-on-surface-variant">
            {integrity.next_action}
          </p>
        </div>
        <Chip tone={accountabilityTone}>{integrity.integrity_score}/100</Chip>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous profit accountability chart and integrity circuit"
        className="mt-2 h-24 w-full text-engine"
      >
        <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.22" />
        <text x="12" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">money integrity loop</text>
        <text x={width - 12} y="16" textAnchor="end" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">{integrity.max_next_fills} fills max</text>
        {rows.map((row, index) => {
          const x = 16 + index * 56;
          const barHeight = Math.max(6, row.score / maxScore * 62);
          const y = 91 - barHeight;
          return (
            <g key={row.id}>
              <rect x={x} y="29" width="36" height="62" rx="6" className="fill-outline" opacity="0.1" />
              <rect x={x} y={y} width="36" height={barHeight} rx="6" className={decisionOwnerSvgClass(row.tone)} opacity="0.82" />
              <text x={x} y="106" className="fill-on-surface font-mono text-[9px] font-semibold">{row.label}</text>
              <text x={x + 36} y="106" textAnchor="end" className={cn("font-mono text-[9px] font-semibold", decisionOwnerFillTextClass(row.tone))}>{Math.round(row.score)}</text>
              <text x={x} y="119" className="fill-outline font-mono text-[8px]">{shortReactionValue(row.value)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 hidden grid-cols-2 gap-1 2xl:grid">
        <ProfitMetric label="Paper PnL" value={formatCompactSignedCurrency(accountability.net_pnl_usd)} detail={`${formatCompactSignedCurrency(accountability.window_pnl_usd)} window`} tone={accountability.net_pnl_usd >= 0 ? "engine" : "critical"} />
        <ProfitMetric label="Integrity" value={integrity.permission.replaceAll("-", " ")} detail={`${integrity.size_multiplier}x · ${integrity.cadence_seconds}s`} tone={integrity.status === "press" || integrity.status === "continue" ? "engine" : integrity.status === "blocked" ? "critical" : "caution"} />
        <ProfitMetric label="Session" value={sessionRun.requested ? formatCompactSignedCurrency(sessionRun.net_pnl_usd) : "waiting"} detail={sessionRun.requested ? `${sessionRun.fill_count}/${sessionRun.blocked_count} fills/blocks` : `${feedback.cadence_seconds}s cadence`} tone={sessionTone} />
        <ProfitMetric label="Wallet" value={formatCompactCurrency(wallet.equity_usd)} detail={`${wallet.max_drawdown_pct.toFixed(1)}% drawdown`} tone={wallet.window_pnl_usd >= 0 ? "engine" : "critical"} />
      </div>
      <span className="sr-only" aria-label="Profit accountability loop receipt">
        Profit accountability status {accountability.status}; action {accountability.action}; making money {accountability.making_money ? "yes" : "no"}; Profit integrity circuit {integrity.status}; permission {integrity.permission}; action {integrity.action}; score {integrity.integrity_score}; expected value {formatSignedCurrency(integrity.expected_value_usd)}; realized window {formatSignedCurrency(integrity.realized_window_pnl_usd)}; size multiplier {integrity.size_multiplier}x; cadence {integrity.cadence_seconds} seconds; max fills {integrity.max_next_fills}; pause fresh buys {integrity.should_pause_fresh_buys ? "yes" : "no"}; protect first {integrity.should_protect_first ? "yes" : "no"}; net paper PnL {formatSignedCurrency(accountability.net_pnl_usd)}; window PnL {formatSignedCurrency(accountability.window_pnl_usd)}; win rate {accountability.win_rate_pct} percent; profit factor {accountability.profit_factor}; loop feedback {feedback.status} {feedback.size_multiplier}x; outcome memory {memory.status} bias {memory.next_bias}; session {sessionRun.requested ? formatSignedCurrency(sessionRun.net_pnl_usd) : "not run"}; live execution {state.execution_gate.live_execution_enabled ? "armed" : "locked"}.
      </span>
    </div>
  );
}

function shortReactionValue(value: string) {
  return value.length > 16 ? `${value.slice(0, 15)}...` : value;
}

type QuickAutonomousDecisionOwnerRow = {
  id: string;
  label: string;
  value: string;
  detail: string;
  score: number;
  paperReady: boolean;
  ledgerApplied: boolean;
  budgetUsd: number;
  tone: QuickChipTone;
};

function QuickAutonomousDecisionOwner({
  state,
  compact = false,
}: {
  state: Web3TradingState;
  compact?: boolean;
}) {
  const directive = state.autonomous_trading_directive;
  const queueExecution = state.autonomous_action_queue_execution;
  const pressureExecution = state.autonomous_pressure_execution;
  const orderExecution = state.autonomous_order_ticket_execution;
  const scalpExit = state.autonomous_scalp_exit_autopilot;
  const route = state.autonomous_route_refresh_execution;
  const candle = state.autonomous_candle_conviction;
  const freshness = state.autonomous_data_freshness_gate;
  const wallet = state.autonomous_wallet_telemetry;
  const proofScore = clampNumber(Math.round(averageNumbers([
    candle.conviction_score,
    route.route_confidence_score,
    freshness.data_score,
    wallet.status === "compounding" || wallet.status === "harvest" ? 82 : wallet.status === "protect" || wallet.status === "cooldown" ? 28 : 58,
  ])));
  const rows: QuickAutonomousDecisionOwnerRow[] = [
    {
      id: "directive",
      label: "Directive",
      value: directive.symbol ? `${directive.symbol} ${directive.action}` : directive.action,
      detail: directive.next_action,
      score: directive.make_money_score,
      paperReady: directive.paper_trade_ready,
      ledgerApplied: false,
      budgetUsd: Math.max(directive.max_notional_usd, directive.release_usd),
      tone: directive.status === "paper-ready" ? "engine" : directive.status === "protect-first" || directive.status === "refresh-first" || directive.status === "selective" ? "caution" : directive.status === "blocked" ? "critical" : "neutral",
    },
    {
      id: "queue",
      label: "Queue",
      value: queueExecution.selected_symbol ? `${queueExecution.selected_symbol} ${queueExecution.selected_action}` : queueExecution.status,
      detail: queueExecution.next_action,
      score: queueExecution.queue_score,
      paperReady: queueExecution.paper_trade_ready,
      ledgerApplied: queueExecution.ledger_applied,
      budgetUsd: queueExecution.paper_size_usd,
      tone: executionOwnerTone(queueExecution.status, queueExecution.paper_trade_ready, queueExecution.ledger_applied),
    },
    {
      id: "pressure",
      label: "Pressure",
      value: pressureExecution.selected_symbol ? `${pressureExecution.selected_symbol} ${pressureExecution.selected_posture}` : pressureExecution.status,
      detail: pressureExecution.next_action,
      score: pressureExecution.pressure_score,
      paperReady: pressureExecution.paper_trade_ready,
      ledgerApplied: pressureExecution.ledger_applied,
      budgetUsd: pressureExecution.paper_size_usd,
      tone: executionOwnerTone(pressureExecution.status, pressureExecution.paper_trade_ready, pressureExecution.ledger_applied),
    },
    {
      id: "ticket",
      label: "Ticket",
      value: orderExecution.symbol ? `${orderExecution.symbol} ${orderExecution.action}` : orderExecution.status,
      detail: orderExecution.next_action,
      score: orderExecution.confidence_score,
      paperReady: orderExecution.paper_trade_ready,
      ledgerApplied: orderExecution.ledger_applied,
      budgetUsd: orderExecution.paper_size_usd,
      tone: orderExecution.status === "protect-only" || orderExecution.status === "route-refresh" ? "caution" : executionOwnerTone(orderExecution.status, orderExecution.paper_trade_ready, orderExecution.ledger_applied),
    },
    {
      id: "exit",
      label: "Exit",
      value: scalpExit.selected_symbol ? `${scalpExit.selected_symbol} ${scalpExit.selected_action}` : scalpExit.status,
      detail: scalpExit.next_action,
      score: scalpExit.scalp_score,
      paperReady: scalpExit.paper_trade_ready,
      ledgerApplied: scalpExit.ledger_applied,
      budgetUsd: scalpExit.release_usd,
      tone: scalpExit.ledger_applied || scalpExit.paper_trade_ready ? "caution" : scalpExit.status === "eject" || scalpExit.status === "blocked" ? "critical" : scalpExit.status === "trim" || scalpExit.status === "harvest" ? "caution" : "neutral",
    },
    {
      id: "proof",
      label: "Proof",
      value: `${route.status} / ${candle.status}`,
      detail: freshness.next_action,
      score: proofScore,
      paperReady: freshness.can_trade && route.status !== "blocked" && candle.status !== "reject",
      ledgerApplied: false,
      budgetUsd: 0,
      tone: !freshness.can_trade || route.status === "blocked" || candle.status === "reject" ? "critical" : route.status === "ready" && (candle.status === "confirm" || candle.status === "probe") ? "engine" : "caution",
    },
  ];
  const owner = [...rows].sort((a, b) => decisionOwnerRank(b) - decisionOwnerRank(a))[0] ?? rows[0];
  const maxScore = Math.max(100, ...rows.map((row) => row.score));
  const maxBudget = Math.max(1, ...rows.map((row) => row.budgetUsd));
  const width = 360;
  const height = compact ? 104 : 128;
  const rowStep = compact ? 14 : 16;

  return (
    <div className="min-w-0 rounded-md border border-engine/25 bg-engine/[0.045] p-2" aria-label="Autonomous decision owner">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Decision owner</p>
          <p className="mt-1 truncate text-xs font-semibold text-on-surface">
            {owner.label} · {owner.value.replaceAll("-", " ")}
          </p>
        </div>
        <Chip tone={owner.tone}>{owner.ledgerApplied ? "applied" : owner.paperReady ? "paper ready" : directive.status.replaceAll("-", " ")}</Chip>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous decision owner chart"
        className={cn("mt-2 w-full", compact ? "h-20" : "h-28")}
      >
        <rect width={width} height={height} rx="7" className="fill-void" opacity="0.22" />
        {rows.map((row, index) => {
          const y = 13 + index * rowStep;
          const scoreWidth = Math.max(6, row.score / maxScore * 116);
          const budgetWidth = row.budgetUsd > 0 ? Math.max(4, row.budgetUsd / maxBudget * 60) : 4;
          return (
            <g key={row.id}>
              <text x="10" y={y + 5} className="fill-on-surface font-mono text-[9px] font-semibold">{row.label}</text>
              <rect x="74" y={y - 2} width="116" height="7" rx="3.5" className="fill-outline" opacity="0.12" />
              <rect x="74" y={y - 2} width={scoreWidth} height="7" rx="3.5" className={decisionOwnerSvgClass(row.tone)} opacity="0.86" />
              <rect x="205" y={y - 2} width="60" height="7" rx="3.5" className="fill-outline" opacity="0.12" />
              <rect x="205" y={y - 2} width={budgetWidth} height="7" rx="3.5" className={row.budgetUsd > 0 ? "fill-engine" : "fill-outline"} opacity={row.budgetUsd > 0 ? "0.7" : "0.28"} />
              <text x="276" y={y + 5} className={cn("fill-outline font-mono text-[8px]", row.paperReady || row.ledgerApplied ? decisionOwnerFillTextClass(row.tone) : "")}>
                {row.ledgerApplied ? "applied" : row.paperReady ? "ready" : `${Math.round(row.score)}`}
              </text>
            </g>
          );
        })}
        <text x="10" y={height - 8} className="fill-outline font-mono text-[8px] uppercase tracking-telemetry">score / size / owner</text>
        <text x={width - 10} y={height - 8} textAnchor="end" className="fill-outline font-mono text-[8px] uppercase tracking-telemetry">{state.execution_gate.live_execution_enabled ? "live armed" : "paper boundary"}</text>
      </svg>
      <p className={cn("mt-2 text-xs text-on-surface-variant", compact ? "truncate leading-4" : "line-clamp-2 leading-5")}>{owner.detail}</p>
      <span className="sr-only" aria-label="Autonomous decision owner receipt">
        Autonomous decision owner is {owner.label} with value {owner.value}; paper ready {owner.paperReady ? "yes" : "no"}; ledger applied {owner.ledgerApplied ? "yes" : "no"}; directive {directive.status} {directive.action}; action queue {queueExecution.status} boundary {queueExecution.execution_boundary}; pressure execution {pressureExecution.status}; order ticket {orderExecution.status}; scalp exit {scalpExit.status}; proof score {proofScore}; live execution {state.execution_gate.live_execution_enabled ? "armed" : "locked"}.
      </span>
    </div>
  );
}

function executionOwnerTone(
  status: string,
  paperReady: boolean,
  ledgerApplied: boolean,
): QuickChipTone {
  if (ledgerApplied || paperReady || status === "queued" || status === "applied") return "engine";
  if (status === "blocked") return "critical";
  if (status === "route-refresh" || status === "protect-only") return "caution";
  return "neutral";
}

function decisionOwnerRank(row: QuickAutonomousDecisionOwnerRow) {
  return row.score + (row.ledgerApplied ? 42 : 0) + (row.paperReady ? 34 : 0) + Math.min(16, row.budgetUsd / 250) + (row.tone === "critical" ? -14 : row.tone === "caution" ? 4 : 0);
}

function decisionOwnerSvgClass(tone: QuickChipTone) {
  if (tone === "engine") return "fill-engine";
  if (tone === "critical") return "fill-critical";
  if (tone === "caution") return "fill-caution";
  if (tone === "demo") return "fill-demo";
  if (tone === "violet") return "fill-violet";
  return "fill-outline";
}

function decisionOwnerFillTextClass(tone: QuickChipTone) {
  if (tone === "engine") return "fill-engine";
  if (tone === "critical") return "fill-critical";
  if (tone === "caution") return "fill-caution";
  if (tone === "demo") return "fill-demo";
  if (tone === "violet") return "fill-violet";
  return "fill-outline";
}

function QuickPositionReactionTape({
  state,
  compact = false,
}: {
  state: Web3TradingState;
  compact?: boolean;
}) {
  const situation = state.autonomous_position_situation_board;
  const markBoard = state.autonomous_portfolio_mark_board;
  const scalpExit = state.autonomous_scalp_exit_autopilot;
  const protection = state.autonomous_protection_coordinator;
  const markByPosition = new Map(markBoard.items.map((item) => [item.position_id, item]));
  const scalpByPosition = new Map(scalpExit.items.map((item) => [item.position_id, item]));
  const rows = situation.items.slice(0, 3).map((item) => {
    const mark = markByPosition.get(item.position_id);
    const scalp = scalpByPosition.get(item.position_id);
    return {
      id: item.id,
      symbol: item.symbol,
      action: item.action,
      status: item.status,
      score: Math.max(item.situation_score, mark ? Math.round(Math.min(100, Math.max(0, Math.abs(mark.pnl_pct) * 1.8 + 44))) : 0, scalp?.scalp_score ?? 0),
      pnlUsd: mark?.unrealized_pnl_usd ?? item.pnl_usd,
      pnlPct: mark?.pnl_pct ?? item.pnl_pct,
      releaseUsd: Math.max(item.release_usd, mark?.suggested_release_usd ?? 0, scalp?.release_usd ?? 0),
      riskUsd: Math.max(item.capital_at_risk_usd, scalp ? Math.max(0, scalp.position_usd - scalp.release_usd - scalp.protected_profit_usd) : 0),
      reviewAfterSeconds: Math.min(item.review_after_seconds, mark?.review_after_seconds ?? item.review_after_seconds, scalp?.decision_seconds ?? item.review_after_seconds),
    };
  });
  const boardTone = positionWatchTone(situation.status, situation.fresh_buy_blocked, protection.status);
  const releaseTotal = Math.max(situation.release_usd, markBoard.release_pressure_usd, scalpExit.release_usd, protection.release_usd);
  const maxScore = Math.max(100, ...rows.map((row) => row.score));
  const maxRelease = Math.max(1, ...rows.map((row) => row.releaseUsd));
  const maxRisk = Math.max(1, ...rows.map((row) => row.riskUsd));
  const width = 320;
  const height = 98;

  return (
    <div className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/20 p-2" aria-label="Position reaction tape">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Position reaction</p>
          <p className="mt-1 truncate text-xs font-semibold text-on-surface">
            {situation.leader_symbol ? `${situation.leader_symbol} · ${String(situation.leader_action).replaceAll("-", " ")}` : "No held paper coins"}
          </p>
        </div>
        <Chip tone={boardTone}>{situation.fresh_buy_blocked ? "buys gated" : `${formatCompactCurrency(releaseTotal)} release`}</Chip>
      </div>
      {rows.length > 0 ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Autonomous held position reaction chart"
          className={cn("mt-2 w-full", compact ? "h-10" : "h-24")}
        >
          <rect width={width} height={height} rx="7" className="fill-void" opacity="0.22" />
          {rows.map((row, index) => {
            const y = 14 + index * 27;
            const scoreWidth = Math.max(5, row.score / maxScore * 118);
            const releaseWidth = Math.max(3, row.releaseUsd / maxRelease * 58);
            const riskWidth = Math.max(3, row.riskUsd / maxRisk * 58);
            return (
              <g key={row.id}>
                <text x="10" y={y + 8} className="fill-on-surface font-mono text-[10px] font-semibold">{row.symbol}</text>
                <text x="10" y={y + 20} className="fill-outline font-mono text-[8px]">{String(row.action)} · {row.reviewAfterSeconds}s</text>
                <rect x="72" y={y + 2} width="118" height="8" rx="4" className="fill-outline" opacity="0.12" />
                <rect x="72" y={y + 2} width={scoreWidth} height="8" rx="4" className={positionWatchActionSvgClass(String(row.action))} opacity="0.82" />
                <text x="200" y={y + 8} className={cn("font-mono text-[9px] font-semibold", row.pnlUsd >= 0 ? "fill-engine" : "fill-critical")}>{formatCompactSignedCurrency(row.pnlUsd)}</text>
                <rect x="248" y={y + 1} width="58" height="6" rx="3" className="fill-outline" opacity="0.12" />
                <rect x="248" y={y + 1} width={releaseWidth} height="6" rx="3" className="fill-caution" opacity="0.78" />
                <rect x="248" y={y + 11} width="58" height="5" rx="2.5" className="fill-outline" opacity="0.12" />
                <rect x="248" y={y + 11} width={riskWidth} height="5" rx="2.5" className="fill-critical" opacity="0.6" />
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="mt-2 rounded-md border border-outline-variant/20 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant">No open paper positions. The agent is waiting for a high-signal entry.</p>
      )}
      {!compact ? (
        <div className="mt-2 grid grid-cols-3 gap-1">
          <ProfitMetric label="Scalp" value={scalpExit.selected_action.replaceAll("-", " ")} detail={`${scalpExit.scalp_score}/100`} tone={scalpExit.status === "eject" || scalpExit.status === "blocked" ? "critical" : scalpExit.release_usd > 0 ? "caution" : "engine"} />
          <ProfitMetric label="Release" value={formatCompactCurrency(releaseTotal)} detail={`${formatCompactCurrency(situation.keep_usd)} keep`} tone={releaseTotal > 0 ? "caution" : "neutral"} />
          <ProfitMetric label="Review" value={`${situation.fastest_review_seconds}s`} detail={`${situation.urgent_count} urgent`} tone={boardTone} />
        </div>
      ) : null}
      <p className={cn("mt-2 text-xs text-on-surface-variant", compact ? "truncate leading-4" : "line-clamp-2 leading-5")}>{situation.next_action}</p>
      <span className="sr-only" aria-label="Position reaction tape receipt">
        Position reaction tape status {situation.status}; held {situation.held_count}; leader {situation.leader_symbol ?? "none"} action {situation.leader_action ?? "none"}; fresh buys {situation.fresh_buy_blocked ? "gated" : "allowed"}; release {formatCurrency(releaseTotal)}; capital at risk {formatCurrency(situation.capital_at_risk_usd)}; scalp exit {scalpExit.status}; scalp paper ready {scalpExit.paper_trade_ready ? "yes" : "no"}; protection coordinator {protection.status}; next action {situation.next_action}.
      </span>
    </div>
  );
}

function QuickSignalNoiseChart({
  fusion,
  decision,
}: {
  fusion: Web3TradingState["autonomous_market_evidence_fusion"];
  decision: Web3TradingState["autonomous_signal_noise_trade_decision"];
}) {
  const width = 560;
  const height = 178;
  const pad = { left: 54, right: 18, top: 18, bottom: 26 };
  const items = fusion.items.slice(0, 4);
  const rowHeight = 27;
  const barWidth = width - pad.left - pad.right;
  const leader = items[0] ?? null;

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2 text-xs leading-5 text-on-surface-variant">
        Signal/noise chart is waiting for a market read.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2" aria-label="Moonshot signal noise chart">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Signal / noise</p>
          <p className="mt-1 truncate text-xs leading-5 text-on-surface-variant">
            {leader ? `${leader.symbol} ${leader.action.replace("-", " ")} · edge ${formatCompactSignedCurrency(leader.expected_edge_usd)}` : "Waiting for ranked candidates"}
          </p>
        </div>
        <Chip tone={fusion.can_trade ? "engine" : fusion.status === "blocked" || fusion.status === "protect" ? "critical" : "caution"}>
          {fusion.fusion_score}/100
        </Chip>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-y border-outline-variant/20 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" aria-label="Autonomous signal/noise trade decision">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <p className={cn("truncate font-mono text-[10px] uppercase tracking-telemetry", signalNoiseDecisionToneClass(decision.action))}>
            {decision.symbol ?? "Desk"} · {decision.action.replace("-", " ")}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">
            {decision.summary}
          </p>
        </div>
        <div className="min-w-0 sm:text-right">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Paper size</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-on-surface">{formatCompactCurrency(decision.recommended_size_usd)}</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Decision</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-on-surface">{decision.decision_score}/100 · {decision.max_next_fills}f</p>
        </div>
        <span className="sr-only" aria-label="Autonomous signal/noise trade decision receipt">
          {decision.next_action} Signal score {decision.signal_score}, noise score {decision.noise_score}, ratio {decision.signal_to_noise_ratio}, blockers {decision.blockers.join("; ") || "none"}, controls {decision.controls.join("; ")}.
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Moonshot-style hot coin signal versus noise chart"
        className="mt-2 h-36 w-full text-engine"
      >
        <rect width={width} height={height} rx="8" className="fill-void" opacity="0.24" />
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="currentColor" strokeOpacity="0.16" />
        <text x={pad.left} y="14" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">signal</text>
        <text x={width - 90} y="14" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">noise</text>
        {items.map((item, index) => {
          const y = pad.top + index * rowHeight + 8;
          const signal = Math.max(0, Math.min(100, Math.round(
            item.fusion_score * 0.34 +
              item.organic_momentum_score * 0.24 +
              item.chart_score * 0.2 +
              item.route_score * 0.16 +
              item.wallet_fit_score * 0.06,
          )));
          const noise = Math.max(0, Math.min(100, Math.round(item.promotion_noise_score)));
          const signalWidth = Math.max(4, (signal / 100) * barWidth);
          const noiseWidth = Math.max(4, (noise / 100) * barWidth);
          const isBlocked = item.action === "reject" || item.action === "protect";
          const signalClass = isBlocked ? "fill-caution" : item.action === "trade" || item.action === "probe" ? "fill-engine" : "fill-outline";
          return (
            <g key={item.token_id}>
              <text x="10" y={y + 10} className="fill-on-surface font-mono text-[12px] font-semibold">{item.symbol}</text>
              <rect x={pad.left} y={y} width={barWidth} height="8" rx="4" className="fill-outline" opacity="0.12" />
              <rect x={pad.left} y={y} width={signalWidth} height="8" rx="4" className={signalClass} opacity="0.92" />
              <rect x={pad.left} y={y + 12} width={barWidth} height="5" rx="2.5" className="fill-outline" opacity="0.1" />
              <rect x={pad.left} y={y + 12} width={noiseWidth} height="5" rx="2.5" className="fill-critical" opacity="0.58" />
              <text x={width - 92} y={y + 10} className="fill-outline font-mono text-[10px]">{signal}/100</text>
              <text x={width - 92} y={y + 22} className="fill-critical font-mono text-[9px]">{noise}/100 hype</text>
            </g>
          );
        })}
        <text x={pad.left} y={height - 8} className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">fused momentum, route, chart, wallet fit vs promo noise</text>
      </svg>
    </div>
  );
}

function QuickSmartExitPressureChart({
  markBoard,
  scalpExit,
  exitLadder,
}: {
  markBoard: Web3TradingState["autonomous_portfolio_mark_board"];
  scalpExit: Web3TradingState["autonomous_scalp_exit_autopilot"];
  exitLadder: Web3TradingState["position_exit_ladder"];
}) {
  const scalpByPosition = new Map(scalpExit.items.map((item) => [item.position_id, item]));
  const ladderByPosition = new Map(exitLadder.items.map((item) => [item.position_id, item]));
  const items = markBoard.items.slice(0, 4).map((item) => {
    const scalp = scalpByPosition.get(item.position_id);
    const ladder = ladderByPosition.get(item.position_id);
    return {
      ...item,
      scalp,
      ladder,
      exitPressure: scalp?.exit_pressure_score ?? (item.action === "exit" ? 88 : item.action === "protect" || item.action === "trim" ? 68 : Math.max(18, Math.round(item.drawdown_from_peak_pct * 2.2))),
      holdEdge: scalp?.hold_edge_score ?? Math.max(0, Math.min(100, item.pnl_pct + 50 - item.drawdown_from_peak_pct)),
      releaseUsd: Math.max(item.suggested_release_usd, scalp?.release_usd ?? 0, ladder?.release_usd ?? 0),
      keepUsd: scalp?.keep_usd ?? Math.max(0, item.current_value_usd - item.suggested_release_usd),
      protectedProfitUsd: Math.max(scalp?.protected_profit_usd ?? 0, ladder?.protected_profit_usd ?? 0),
      decisionSeconds: scalp?.decision_seconds ?? item.review_after_seconds,
    };
  });
  const width = 520;
  const height = 148;
  const pad = { left: 74, right: 20, top: 18, bottom: 24 };
  const rowHeight = 24;
  const maxRelease = Math.max(1, ...items.map((item) => item.releaseUsd));
  const leader = items[0] ?? null;

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2 text-xs leading-5 text-on-surface-variant" aria-label="Smart exit pressure chart">
        Smart exits are waiting for open paper positions.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2" aria-label="Smart exit pressure chart">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Smart exit pressure</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {scalpExit.summary}
          </p>
        </div>
        <Chip tone={scalpExit.status === "eject" || scalpExit.status === "blocked" ? "critical" : scalpExit.release_usd > 0 ? "caution" : "engine"}>
          {formatCompactCurrency(scalpExit.release_usd)} release
        </Chip>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous smart exit pressure chart"
        className="mt-2 h-32 w-full text-engine"
      >
        <rect width={width} height={height} rx="8" className="fill-void" opacity="0.22" />
        <text x="10" y="14" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">position</text>
        <text x={pad.left} y="14" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">exit pressure / hold edge</text>
        <text x={width - 96} y="14" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">release</text>
        {items.map((item, index) => {
          const y = pad.top + index * rowHeight + 7;
          const exitWidth = Math.max(4, item.exitPressure / 100 * 250);
          const holdWidth = Math.max(4, item.holdEdge / 100 * 250);
          const releaseWidth = Math.max(4, item.releaseUsd / maxRelease * 76);
          const actionTone = item.action === "exit" ? "fill-critical" : item.action === "trim" || item.action === "protect" || item.action === "harvest" ? "fill-caution" : "fill-engine";
          return (
            <g key={item.id}>
              <text x="10" y={y + 7} className="fill-on-surface font-mono text-[11px] font-semibold">{item.symbol}</text>
              <text x="10" y={y + 18} className="fill-outline font-mono text-[9px]">{item.action}</text>
              <rect x={pad.left} y={y} width="250" height="7" rx="3.5" className="fill-outline" opacity="0.12" />
              <rect x={pad.left} y={y} width={exitWidth} height="7" rx="3.5" className={actionTone} opacity="0.78" />
              <rect x={pad.left} y={y + 11} width="250" height="5" rx="2.5" className="fill-outline" opacity="0.1" />
              <rect x={pad.left} y={y + 11} width={holdWidth} height="5" rx="2.5" className="fill-engine" opacity="0.54" />
              <rect x={width - 96} y={y + 3} width="76" height="8" rx="4" className="fill-outline" opacity="0.12" />
              <rect x={width - 96} y={y + 3} width={releaseWidth} height="8" rx="4" className="fill-caution" opacity="0.74" />
              <text x={width - 96} y={y + 22} className="fill-outline font-mono text-[9px]">{formatCompactCurrency(item.releaseUsd)}</text>
            </g>
          );
        })}
        <text x={pad.left} y={height - 8} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">top bar = exit pressure - lower bar = hold edge - right = paper release</text>
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-1" aria-label="Smart exit pressure metrics">
        <ProfitMetric label="Keep" value={formatCompactCurrency(scalpExit.keep_usd)} detail={`${formatCompactCurrency(scalpExit.at_risk_usd)} at risk`} tone={scalpExit.keep_usd >= scalpExit.release_usd ? "engine" : "caution"} />
        <ProfitMetric label="Lock" value={formatCompactCurrency(Math.max(scalpExit.protected_profit_usd, exitLadder.protected_profit_usd))} detail={`${scalpExit.fastest_decision_seconds}s review`} tone="engine" />
      </div>
      <span className="sr-only" aria-label="Autonomous smart exit pressure receipt">
        Smart exit pressure monitors {markBoard.held_count} held paper positions. Leader {leader?.symbol ?? markBoard.leader_symbol ?? "none"} action {leader?.action ?? markBoard.leader_action ?? "none"}, release {formatCurrency(scalpExit.release_usd)}, keep {formatCurrency(scalpExit.keep_usd)}, protected profit {formatCurrency(Math.max(scalpExit.protected_profit_usd, exitLadder.protected_profit_usd))}, risk at stop {formatCurrency(exitLadder.risk_at_stop_usd)}, selected action {scalpExit.selected_action}, paper ready {scalpExit.paper_trade_ready ? "yes" : "no"}.
      </span>
    </div>
  );
}

type QuickChipTone = "neutral" | "violet" | "engine" | "demo" | "caution" | "critical";

function QuickProfitObjectiveDashboard({
  objective,
  control,
  dailyLock,
  wallet,
  sessionRun,
}: {
  objective: Web3TradingState["autonomous_profit_objective"];
  control: Web3TradingState["autonomous_profit_control"];
  dailyLock: Web3TradingState["autonomous_daily_profit_lock"];
  wallet: Web3TradingState["autonomous_wallet_telemetry"];
  sessionRun: Web3TradingState["autonomous_session_run"];
}) {
  const progressPct = clampNumber(Math.round(objective.progress_pct));
  const lockPct = clampNumber(Math.round(Math.max(0, dailyLock.locked_profit_usd) / Math.max(1, objective.target_net_pnl_usd) * 100));
  const lossRoomPct = clampNumber(Math.round(dailyLock.loss_budget_remaining_usd / Math.max(1, dailyLock.stop_loss_usd) * 100));
  const deployPct = clampNumber(Math.round(control.deploy_now_usd / Math.max(1, control.deploy_now_usd + control.reserve_usd + control.release_now_usd) * 100));
  const releaseNowUsd = Math.max(control.release_now_usd, dailyLock.release_required_usd);
  const currentPnlUsd = dailyLock.current_net_pnl_usd;
  const targetRemainingUsd = Math.max(0, dailyLock.target_remaining_usd);
  const statusTone = profitStatusTone(control.status, dailyLock.loop_permission);
  const targetX = 36 + progressPct / 100 * 448;
  const lockX = 36 + lockPct / 100 * 448;
  const lossRoomWidth = Math.max(6, lossRoomPct / 100 * 142);
  const deployWidth = Math.max(6, deployPct / 100 * 142);

  return (
    <section className="mt-2 rounded-md border border-engine/20 bg-engine/[0.045] p-2 sm:mt-3 sm:p-3" aria-label="Autonomous profit objective dashboard">
      <div className="grid gap-2 2xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Profit objective</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {control.next_action}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {objective.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={statusTone}>{control.status.replace("-", " ")}</Chip>
              <Chip tone={dailyLock.loop_permission === "open" ? "engine" : dailyLock.loop_permission === "paused" || dailyLock.loop_permission === "stand-down" ? "critical" : "caution"}>
                {dailyLock.loop_permission.replace("-", " ")}
              </Chip>
            </div>
          </div>
          <svg
            viewBox="0 0 520 96"
            role="img"
            aria-label="Autonomous profit target progress chart"
            className="mt-2 h-24 w-full text-engine"
          >
            <rect width="520" height="96" rx="8" className="fill-void" opacity="0.24" />
            <text x="18" y="18" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">paper profit target</text>
            <text x="352" y="18" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">lock / room</text>
            <rect x="36" y="34" width="448" height="12" rx="6" className="fill-outline" opacity="0.14" />
            <rect x="36" y="34" width={Math.max(8, progressPct / 100 * 448)} height="12" rx="6" className={currentPnlUsd >= 0 ? "fill-engine" : "fill-critical"} opacity="0.9" />
            <line x1={targetX} x2={targetX} y1="28" y2="55" stroke="currentColor" strokeOpacity="0.56" strokeWidth="2" />
            <line x1={lockX} x2={lockX} y1="55" y2="70" stroke="currentColor" strokeOpacity="0.34" strokeWidth="2" />
            <text x="36" y="64" className="fill-on-surface font-mono text-[12px] font-semibold">{formatCompactSignedCurrency(currentPnlUsd)}</text>
            <text x="188" y="64" className="fill-outline font-mono text-[10px]">remaining {formatCompactCurrency(targetRemainingUsd)}</text>
            <text x="354" y="64" className="fill-outline font-mono text-[10px]">locked {formatCompactCurrency(dailyLock.locked_profit_usd)}</text>
            <rect x="36" y="76" width="142" height="6" rx="3" className="fill-outline" opacity="0.12" />
            <rect x="36" y="76" width={lossRoomWidth} height="6" rx="3" className={lossRoomPct > 40 ? "fill-engine" : "fill-caution"} opacity="0.72" />
            <rect x="220" y="76" width="142" height="6" rx="3" className="fill-outline" opacity="0.12" />
            <rect x="220" y="76" width={deployWidth} height="6" rx="3" className="fill-engine" opacity="0.72" />
            <text x="36" y="92" className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">loss room</text>
            <text x="220" y="92" className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">deploy pressure</text>
          </svg>
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 2xl:grid-cols-2" aria-label="Autonomous profit objective controls">
          <ProfitMetric label="Target" value={formatCompactCurrency(objective.target_net_pnl_usd)} detail={`${progressPct}% done`} tone={currentPnlUsd >= 0 ? "engine" : "critical"} />
          <ProfitMetric label="Deploy" value={formatCompactCurrency(control.deploy_now_usd)} detail={`${control.loop_intensity} loop`} tone={control.deploy_now_usd > 0 ? "engine" : "neutral"} />
          <ProfitMetric label="Release" value={formatCompactCurrency(releaseNowUsd)} detail={`${dailyLock.max_next_fills} fills max`} tone={releaseNowUsd > 0 ? "caution" : "engine"} />
          <ProfitMetric label="Edge" value={formatCompactSignedCurrency(control.required_edge_usd)} detail={`${control.confidence_score}/100 confidence`} tone={control.required_edge_usd > 0 ? "engine" : "neutral"} />
          <ProfitMetric label="Cadence" value={`${control.cadence_seconds}s`} detail={`${formatCompactCurrency(control.max_trade_usd)} max`} tone={control.cadence_seconds <= 12 ? "engine" : "caution"} />
          <ProfitMetric label="Wallet" value={formatCompactCurrency(wallet.equity_usd)} detail={sessionRun.requested ? `${formatCompactSignedCurrency(sessionRun.net_pnl_usd)} last` : "waiting"} tone={sessionRun.requested && sessionRun.net_pnl_usd < 0 ? "critical" : "engine"} />
        </div>
      </div>
      <span className="sr-only" aria-label="Autonomous profit objective receipt">
        Target {formatCurrency(objective.target_net_pnl_usd)}, current {formatSignedCurrency(currentPnlUsd)}, remaining {formatCurrency(targetRemainingUsd)}, deploy {formatCurrency(control.deploy_now_usd)}, release {formatCurrency(releaseNowUsd)}, locked {formatCurrency(dailyLock.locked_profit_usd)}, reserve {formatCurrency(control.reserve_usd)}, cadence {control.cadence_seconds} seconds, live signing credential gated.
      </span>
    </section>
  );
}

function QuickProfitAllocationPlan({
  plan,
}: {
  plan: Web3TradingState["autonomous_profit_allocation_plan"];
}) {
  const width = 520;
  const height = 150;
  const items = plan.items.slice(0, 5);
  const maxBudget = Math.max(1, ...items.map((item) => Math.max(item.budget_usd, item.max_trade_usd)));
  const statusTone = profitAllocationTone(plan.status, plan.should_release_first, plan.can_deploy);

  return (
    <section className="rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:p-3" aria-label="Autonomous profit allocation plan">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Profit allocator</p>
          <p className="mt-1 break-words text-sm font-semibold text-on-surface">{plan.next_action}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{plan.summary}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={statusTone}>{plan.status}</Chip>
          <Chip tone={plan.should_release_first ? "caution" : plan.can_deploy ? "engine" : "neutral"}>
            {plan.selected_lane ? plan.selected_lane.replaceAll("-", " ") : "no lane"}
          </Chip>
        </div>
      </div>
      {items.length > 0 ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Closed-loop paper allocator lane weights"
          className="mt-2 h-36 w-full text-engine"
        >
          <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.24" />
          <text x="14" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">closed-loop lane sizing</text>
          <text x="382" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">budget / cap</text>
          {items.map((item, index) => {
            const y = 30 + index * 22;
            const weightWidth = Math.max(4, item.allocation_weight_pct / 100 * 252);
            const capWidth = Math.max(4, Math.max(item.budget_usd, item.max_trade_usd) / maxBudget * 92);
            return (
              <g key={item.id}>
                <text x="14" y={y + 8} className="fill-on-surface font-mono text-[10px] font-semibold">{shortLaneLabel(item.label)}</text>
                <rect x="132" y={y} width="252" height="8" rx="4" className="fill-outline" opacity="0.12" />
                <rect x="132" y={y} width={weightWidth} height="8" rx="4" className={profitAllocationSvgClass(item.action, item.status)} opacity="0.86" />
                <rect x="402" y={y} width="92" height="8" rx="4" className="fill-outline" opacity="0.12" />
                <rect x="402" y={y} width={capWidth} height="8" rx="4" className={item.action === "release" ? "fill-caution" : "fill-engine"} opacity="0.72" />
                <text x="132" y={y + 19} className="fill-outline font-mono text-[9px]">{item.action} · {item.allocation_weight_pct}% · {formatCompactSignedCurrency(item.expectancy_usd)}</text>
                <text x="402" y={y + 19} className="fill-outline font-mono text-[9px]">{formatCompactCurrency(item.budget_usd)} / {formatCompactCurrency(item.max_trade_usd)}</text>
              </g>
            );
          })}
          <text x="132" y={height - 8} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">fresh-buy lanes get weight - cooled lanes get zero - release can sell first</text>
        </svg>
      ) : (
        <p className="mt-2 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2 text-xs leading-5 text-on-surface-variant">
          The allocator is waiting for enough paper evidence to rank lanes.
        </p>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Allocator next-cycle caps">
        <ProfitMetric label="Deploy" value={formatCompactCurrency(plan.deploy_budget_usd)} detail={`${plan.allocation_score}/100 score`} tone={plan.can_deploy ? "engine" : "neutral"} />
        <ProfitMetric label="Release" value={formatCompactCurrency(plan.release_budget_usd)} detail={plan.should_release_first ? "first" : "not forced"} tone={plan.release_budget_usd > 0 ? "caution" : "engine"} />
        <ProfitMetric label="Max trade" value={formatCompactCurrency(plan.max_trade_usd)} detail={`${plan.size_multiplier}x size`} tone={plan.max_trade_usd > 0 ? "engine" : "neutral"} />
        <ProfitMetric label="Cadence" value={`${plan.cadence_seconds}s`} detail={formatCompactSignedCurrency(plan.expected_edge_usd)} tone={plan.expected_edge_usd >= 0 ? "engine" : "critical"} />
      </dl>
      <span className="sr-only" aria-label="Autonomous profit allocation controls">
        {plan.controls.join(" ")}
      </span>
    </section>
  );
}

export type AutonomousNextMove = {
  id: string;
  label: string;
  action: string;
  detail: string;
  etaSeconds: number;
  score: number;
  budgetUsd: number;
  tone: QuickChipTone;
};

function QuickAutonomousNextMoves({ items, state }: { items: AutonomousNextMove[]; state: Web3TradingState }) {
  const leader = items[0] ?? null;
  const maxScore = Math.max(1, ...items.map((item) => item.score));
  const maxBudget = Math.max(1, ...items.map((item) => item.budgetUsd));

  return (
    <section className="mt-2 rounded-md border border-engine/20 bg-void/20 p-2 sm:mt-3 sm:p-3" aria-label="Autonomous next moves timeline">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Next moves</p>
          <p className="mt-1 break-words text-sm font-semibold text-on-surface">
            {leader ? `${leader.label} - ${leader.action}` : "Waiting for autonomous plan"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {leader?.detail ?? "Refresh the market read to build a current paper plan."}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={state.autonomous_action_queue.paper_ready_count > 0 ? "engine" : state.autonomous_data_freshness_gate.status === "refresh" ? "caution" : "neutral"}>
            {state.autonomous_action_queue.paper_ready_count} paper ready
          </Chip>
          <Chip tone={state.autonomous_launch_timing.status === "snipe" || state.autonomous_launch_timing.status === "probe" ? "engine" : state.autonomous_launch_timing.status === "confirm" || state.autonomous_launch_timing.status === "late-chase" ? "caution" : state.autonomous_launch_timing.status === "blocked" ? "critical" : "neutral"}>
            launch {state.autonomous_launch_timing.status.replaceAll("-", " ")}
          </Chip>
          <Chip tone={state.autonomous_trigger_opportunity.status === "protect" || state.autonomous_trigger_opportunity.status === "pre-arm" ? "engine" : state.autonomous_trigger_opportunity.status === "repair" || state.autonomous_trigger_opportunity.status === "auth-required" ? "caution" : state.autonomous_trigger_opportunity.status === "blocked" ? "critical" : "neutral"}>
            trigger {state.autonomous_trigger_opportunity.status.replaceAll("-", " ")}
          </Chip>
          <Chip tone={state.autonomous_execution_runway.can_auto_paper ? "engine" : state.autonomous_execution_runway.status === "blocked" ? "critical" : "caution"}>
            {state.autonomous_execution_runway.status.replaceAll("-", " ")}
          </Chip>
        </div>
      </div>

      <div className="mt-3 grid gap-1" aria-label="Autonomous operator next six moves">
        {items.map((item, index) => (
          <div key={item.id} className={cn("grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-2", nextMoveToneClass(item.tone))}>
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-current/25 bg-void/25 font-mono text-[10px] font-semibold">
              {index + 1}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate text-sm font-semibold">{item.label}</p>
                <span className="font-mono text-[10px] uppercase tracking-telemetry opacity-80">{item.action}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 opacity-80">{item.detail}</p>
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_4.75rem] items-center gap-2">
                <div className="h-1.5 rounded-full bg-current/15">
                  <div className="h-1.5 rounded-full bg-current/70" style={{ width: `${Math.max(8, Math.min(100, item.score / maxScore * 100))}%` }} />
                </div>
                <p className="truncate text-right font-mono text-[10px] opacity-80">{item.score}/100</p>
              </div>
            </div>
            <div className="min-w-[4.5rem] text-right">
              <p className="font-mono text-xs font-semibold">{item.etaSeconds}s</p>
              <p className="mt-0.5 font-mono text-[10px] opacity-80">{item.budgetUsd > 0 ? formatCompactCurrency(item.budgetUsd) : "read"}</p>
              <div className="mt-1 h-1.5 rounded-full bg-current/15">
                <div className="h-1.5 rounded-full bg-current/70" style={{ width: `${item.budgetUsd > 0 ? Math.max(8, Math.min(100, item.budgetUsd / maxBudget * 100)) : 8}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only" aria-label="Autonomous next moves receipt">
        Next moves are built from the read-only freshness gate, command execution, action queue, execution runway, autonomous launch timing, protective trigger opportunity, loop throttle, and wallet feedback. Leader {leader?.label ?? "none"} action {leader?.action ?? "none"}; launch timing {state.autonomous_launch_timing.status}; trigger opportunity {state.autonomous_trigger_opportunity.status}; live execution stays {state.execution_gate.live_execution_enabled ? "armed by credentials" : "locked"}.
      </span>
    </section>
  );
}

function nextMoveToneClass(tone: QuickChipTone) {
  if (tone === "engine") return "border-engine/30 bg-engine/[0.07] text-engine";
  if (tone === "critical") return "border-critical/35 bg-critical/[0.08] text-critical";
  if (tone === "caution") return "border-caution/35 bg-caution/[0.08] text-caution";
  if (tone === "demo") return "border-demo/35 bg-demo/[0.08] text-demo";
  if (tone === "violet") return "border-violet/35 bg-violet/[0.08] text-violet";
  return "border-outline-variant/30 bg-surface-dim/25 text-on-surface";
}

function QuickFillLearningLedger({
  digest,
  attribution,
  outcomeMemory,
}: {
  digest: Web3TradingState["autonomous_fill_ledger_digest"];
  attribution: Web3TradingState["autonomous_strategy_attribution"];
  outcomeMemory: Web3TradingState["autonomous_outcome_memory_governor"];
}) {
  const width = 640;
  const height = 188;
  const fillItems = digest.items.slice(0, 5);
  const laneItems = attribution.items.slice(0, 5);
  const maxFill = Math.max(1, ...fillItems.map((item) => Math.max(item.size_usd, Math.abs(item.estimated_contribution_usd))));
  const maxLane = Math.max(1, ...laneItems.map((item) => Math.max(Math.abs(item.net_contribution_usd), Math.abs(item.expectancy_usd), item.trade_count * 10)));
  const statusTone = fillLedgerStatusTone(digest.status);
  const memoryTone = outcomeMemory.status === "press" || outcomeMemory.status === "compound"
    ? "engine"
    : outcomeMemory.status === "protect" || outcomeMemory.status === "cooldown"
      ? "critical"
      : outcomeMemory.status === "selective" || outcomeMemory.status === "learning"
        ? "caution"
        : "neutral";
  const auditTone = fillAuditTone(digest.last_fill_verdict);

  return (
    <section className="rounded-md border border-engine/20 bg-void/20 p-2 sm:p-3" aria-label="Autonomous fill learning ledger">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Fill learning ledger</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {digest.recommended_discipline.replaceAll("-", " ")} · {digest.recent_fill_count} recent fills
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {digest.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={statusTone}>{digest.status}</Chip>
              <Chip tone={auditTone}>{digest.next_fill_permission.replaceAll("-", " ")}</Chip>
              <Chip tone={memoryTone}>{outcomeMemory.next_bias.replaceAll("-", " ")}</Chip>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Autonomous recent fill contribution and lane attribution chart"
            className="mt-2 h-44 w-full text-engine"
          >
            <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.28" />
            <text x="14" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">recent fills</text>
            <text x="360" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">strategy lanes</text>
            {fillItems.length > 0 ? fillItems.map((item, index) => {
              const y = 34 + index * 25;
              const sizeWidth = Math.max(4, item.size_usd / maxFill * 168);
              const contributionWidth = Math.max(4, Math.abs(item.estimated_contribution_usd) / maxFill * 88);
              const contributionX = item.estimated_contribution_usd >= 0 ? 254 : 254 - contributionWidth;
              return (
                <g key={item.id}>
                  <text x="14" y={y + 9} className="fill-on-surface font-mono text-[11px] font-semibold">{item.symbol}</text>
                  <text x="14" y={y + 20} className="fill-outline font-mono text-[9px]">{item.side} · {item.discipline}</text>
                  <rect x="88" y={y + 2} width="168" height="8" rx="4" className="fill-outline" opacity="0.12" />
                  <rect x="88" y={y + 2} width={sizeWidth} height="8" rx="4" className={item.side === "sell" ? "fill-caution" : "fill-engine"} opacity="0.75" />
                  <line x1="254" x2="254" y1={y - 1} y2={y + 15} stroke="currentColor" strokeOpacity="0.25" />
                  <rect x={contributionX} y={y + 14} width={contributionWidth} height="6" rx="3" className={item.estimated_contribution_usd >= 0 ? "fill-engine" : "fill-critical"} opacity="0.78" />
                  <text x="280" y={y + 20} className="fill-outline font-mono text-[9px]">{formatCompactSignedCurrency(item.estimated_contribution_usd)}</text>
                </g>
              );
            }) : (
              <text x="14" y="56" className="fill-outline font-mono text-[12px]">waiting for paper fills</text>
            )}
            {laneItems.length > 0 ? laneItems.map((item, index) => {
              const y = 34 + index * 25;
              const laneWidth = Math.max(5, Math.abs(item.net_contribution_usd) / maxLane * 190);
              const expectancyX = 394 + Math.max(0, Math.min(190, (item.expectancy_usd + maxLane) / (maxLane * 2) * 190));
              return (
                <g key={item.id}>
                  <text x="360" y={y + 9} className="fill-on-surface font-mono text-[10px] font-semibold">{shortLaneLabel(item.label)}</text>
                  <rect x="444" y={y + 2} width="138" height="8" rx="4" className="fill-outline" opacity="0.12" />
                  <rect x="444" y={y + 2} width={Math.min(138, laneWidth)} height="8" rx="4" className={strategyAttributionSvgClass(item.status, item.net_contribution_usd)} opacity="0.78" />
                  <line x1={expectancyX} x2={expectancyX} y1={y - 1} y2={y + 15} stroke="currentColor" strokeOpacity="0.52" strokeWidth="2" />
                  <text x="444" y={y + 20} className="fill-outline font-mono text-[9px]">{item.trade_count} fills · {formatCompactSignedCurrency(item.expectancy_usd)} exp</text>
                </g>
              );
            }) : (
              <text x="360" y="56" className="fill-outline font-mono text-[12px]">waiting for lane attribution</text>
            )}
            <text x="88" y={height - 10} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">left = size and contribution - right = lane contribution with expectancy marker</text>
          </svg>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/20 p-2" aria-label="Fill learning discipline">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Learning discipline</p>
              <p className="mt-1 truncate text-sm font-semibold text-on-surface">
                {attribution.status.replaceAll("-", " ")} · {attribution.active_lane_count} active lanes
              </p>
            </div>
            <Chip tone={strategyAttributionTone(attribution.status)}>{attribution.recommended_size_bias}x</Chip>
          </div>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">
            {digest.next_action}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-1" aria-label="Fill learning metrics">
            <ProfitMetric label="Net fills" value={formatCompactSignedCurrency(digest.net_pnl_usd)} detail={`${digest.buy_count}/${digest.sell_count} buy/sell`} tone={digest.net_pnl_usd >= 0 ? "engine" : "critical"} />
            <ProfitMetric label="Last audit" value={`${digest.last_fill_profit_score}/100`} detail={digest.next_fill_permission.replaceAll("-", " ")} tone={auditTone} />
            <ProfitMetric label="Volume" value={formatCompactCurrency(digest.paper_volume_usd)} detail={`${formatCompactCurrency(digest.average_fill_usd)} avg`} tone={digest.paper_volume_usd > 0 ? "engine" : "neutral"} />
            <ProfitMetric label="Fill quality" value={`${digest.last_fill_quality_score}/100`} detail={`${formatCompactCurrency(digest.last_fill_shortfall_usd)} shortfall`} tone={auditTone} />
            <ProfitMetric label="Best lane" value={digest.best_lane ? shortLaneLabel(digest.best_lane) : "none"} detail={formatCompactSignedCurrency(attribution.net_contribution_usd)} tone={attribution.net_contribution_usd >= 0 ? "engine" : "critical"} />
            <ProfitMetric label="Outcome" value={`${outcomeMemory.memory_score}/100`} detail={`${outcomeMemory.size_multiplier}x size`} tone={memoryTone} />
            <ProfitMetric label="Win rate" value={`${Math.round(outcomeMemory.win_rate_pct)}%`} detail={`${outcomeMemory.profit_factor}x factor`} tone={outcomeMemory.win_rate_pct >= 50 ? "engine" : outcomeMemory.win_rate_pct > 0 ? "caution" : "neutral"} />
            <ProfitMetric label="Last fill" value={digest.last_fill_symbol ?? "none"} detail={digest.last_fill_side ?? "waiting"} tone={digest.last_fill_side === "sell" ? "caution" : digest.last_fill_side === "buy" ? "engine" : "neutral"} />
          </dl>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">{digest.last_fill_audit}</p>
          <span className="sr-only" aria-label="Autonomous fill learning receipt">
            Fill learning ledger status {digest.status}; discipline {digest.recommended_discipline}; recent fills {digest.recent_fill_count}; buys {digest.buy_count}; sells {digest.sell_count}; paper volume {formatCurrency(digest.paper_volume_usd)}; net paper PnL {formatSignedCurrency(digest.net_pnl_usd)}; last fill verdict {digest.last_fill_verdict}; last fill score {digest.last_fill_profit_score}; last fill edge {formatSignedCurrency(digest.last_fill_edge_usd)}; last fill quality {digest.last_fill_quality_score}; last fill shortfall {formatCurrency(digest.last_fill_shortfall_usd)}; next fill permission {digest.next_fill_permission}; best lane {digest.best_lane ?? "none"}; worst lane {digest.worst_lane ?? "none"}; strategy attribution {attribution.status}; active lanes {attribution.active_lane_count}; outcome memory {outcomeMemory.status}; next bias {outcomeMemory.next_bias}; controls {digest.controls.join(" ")}
          </span>
        </div>
      </div>
    </section>
  );
}

function QuickActionQueueCockpit({
  queue,
  execution,
}: {
  queue: Web3TradingState["autonomous_action_queue"];
  execution: Web3TradingState["autonomous_action_queue_execution"];
}) {
  const items = queue.items.slice(0, 5);
  const maxEdgePerMinute = Math.max(1, ...items.map((item) => Math.max(0, item.expected_profit_per_minute_usd)));
  const maxRisk = Math.max(1, ...items.map((item) => item.risk_usd));
  const maxNotional = Math.max(1, ...items.map((item) => item.notional_usd));
  const rowHeight = 24;
  const width = 640;
  const height = 168;
  const barLeft = 132;
  const barWidth = 328;
  const leader = items[0] ?? null;
  const executionTone = execution.status === "queued" || execution.status === "applied"
    ? "engine"
    : execution.status === "blocked"
      ? "critical"
      : "neutral";

  return (
    <section className="mt-2 rounded-md border border-engine/20 bg-void/20 p-2 sm:mt-3 sm:p-3" aria-label="Autonomous action queue cockpit">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.28fr)_minmax(19rem,0.72fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Next action queue</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {queue.leader_symbol ?? leader?.label ?? "Desk"} - {queue.leader_action.replace("-", " ")}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {queue.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={actionQueueStatusTone(queue.status)}>{queue.status.replace("-", " ")}</Chip>
              <Chip tone={queue.fresh_buy_protection_status === "clear" ? "engine" : "caution"}>
                {queue.fresh_buy_protection_status.replace("-", " ")}
              </Chip>
              <Chip tone={queue.launch_timing_allows_fresh_buys ? queue.launch_timing_status === "snipe" || queue.launch_timing_status === "probe" ? "engine" : "neutral" : "critical"}>
                timing {queue.launch_timing_status.replace("-", " ")}
              </Chip>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Autonomous ranked action queue chart"
            className="mt-2 h-40 w-full text-engine"
          >
            <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.3" />
            <text x="12" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">lane</text>
            <text x={barLeft} y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">score / edge / risk</text>
            <text x="518" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">size</text>
            {items.map((item, index) => {
              const y = 32 + index * rowHeight;
              const scoreWidth = Math.max(6, item.score / 100 * barWidth);
              const edgeX = barLeft + Math.max(0, item.expected_profit_per_minute_usd) / maxEdgePerMinute * barWidth;
              const riskX = barLeft + Math.max(0, item.risk_usd) / maxRisk * barWidth;
              const notionalWidth = Math.max(4, item.notional_usd / maxNotional * 78);
              const itemTone = actionQueueItemSvgClass(item.action, item.status);
              return (
                <g key={item.id}>
                  <text x="12" y={y + 9} className="fill-on-surface font-mono text-[11px] font-semibold">{item.label}</text>
                  <text x="12" y={y + 20} className="fill-outline font-mono text-[9px]">{item.symbol ?? "desk"} - {item.action}</text>
                  <rect x={barLeft} y={y + 2} width={barWidth} height="9" rx="4.5" className="fill-outline" opacity="0.13" />
                  <rect x={barLeft} y={y + 2} width={scoreWidth} height="9" rx="4.5" className={itemTone} opacity="0.82" />
                  <line x1={edgeX} x2={edgeX} y1={y} y2={y + 14} stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
                  <circle cx={riskX} cy={y + 17} r="4" className={item.risk_usd > item.expected_edge_usd ? "fill-critical" : "fill-caution"} opacity="0.78" />
                  <rect x="512" y={y + 4} width="78" height="7" rx="3.5" className="fill-outline" opacity="0.12" />
                  <rect x="512" y={y + 4} width={notionalWidth} height="7" rx="3.5" className={item.side === "sell" ? "fill-caution" : item.side === "buy" ? "fill-engine" : "fill-outline"} opacity="0.76" />
                  <text x="512" y={y + 22} className="fill-outline font-mono text-[9px]">{formatCompactSignedCurrency(item.expected_edge_usd)} edge</text>
                </g>
              );
            })}
            <text x={barLeft} y={height - 8} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">bar = queue score - line = edge/min - dot = risk - right = paper size</text>
          </svg>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/20 p-2" aria-label="Action queue execution receipt">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Selected paper action</p>
              <p className="mt-1 truncate text-sm font-semibold text-on-surface">
                {execution.selected_symbol ?? "Desk"} - {execution.selected_action.replace("-", " ")}
              </p>
            </div>
            <Chip tone={executionTone}>{execution.status}</Chip>
          </div>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">
            {execution.summary}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-1" aria-label="Action queue execution metrics">
            <ProfitMetric label="Paper size" value={formatCompactCurrency(execution.paper_size_usd)} detail={execution.execution_boundary.replaceAll("-", " ")} tone={execution.paper_trade_ready || execution.ledger_applied ? "engine" : "neutral"} />
            <ProfitMetric label="$/min" value={formatCompactSignedCurrency(execution.expected_profit_per_minute_usd)} detail={`${execution.review_after_seconds}s review`} tone={execution.expected_profit_per_minute_usd > 0 ? "engine" : "neutral"} />
            <ProfitMetric label="Deploy" value={formatCompactCurrency(queue.deploy_usd)} detail={`${queue.ready_count} ready lanes`} tone={queue.deploy_usd > 0 ? "engine" : "neutral"} />
            <ProfitMetric label="Release" value={formatCompactCurrency(queue.release_usd)} detail={`${queue.blocked_count} blocked`} tone={queue.release_usd > 0 ? "caution" : "neutral"} />
          </dl>
          <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-outline">
            Next: {execution.next_action}
          </p>
          <span className="sr-only" aria-label="Autonomous action queue receipt">
            Leader {queue.leader_symbol ?? "desk"} {queue.leader_action}; deploy {formatCurrency(queue.deploy_usd)}, release {formatCurrency(queue.release_usd)}, expected edge {formatSignedCurrency(queue.expected_edge_usd)}, expected per minute {formatSignedCurrency(queue.expected_profit_per_minute_usd)}, risk {formatCurrency(queue.risk_usd)}, selected lane {execution.selected_lane ?? "none"}, paper ready {execution.paper_trade_ready ? "yes" : "no"}, launch timing {queue.launch_timing_status}, launch-blocked buys {queue.launch_timing_blocked_count}, blockers {execution.blockers.join("; ") || queue.launch_timing_blocker || queue.fresh_buy_blocker || "none"}.
          </span>
        </div>
      </div>
    </section>
  );
}

function QuickTrapClearanceBoard({
  trapRadar,
  tokenSafety,
  tradeability,
}: {
  trapRadar: Web3TradingState["autonomous_trap_radar"];
  tokenSafety: Web3TradingState["autonomous_token_safety_clearance"];
  tradeability: Web3TradingState["autonomous_tradeability_simulator"];
}) {
  const width = 640;
  const height = 178;
  const items = trapRadar.items.slice(0, 5);
  const safetyByToken = new Map(tokenSafety.items.map((item) => [item.token_id, item]));
  const fillByToken = new Map(tradeability.items.map((item) => [item.token_id, item]));
  const maxChase = Math.max(1, ...items.map((item) => item.chase_score));
  const maxTrap = Math.max(1, ...items.map((item) => item.trap_score));
  const leader = items[0] ?? null;

  return (
    <section className="mt-2 rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:mt-3 sm:p-3" aria-label="Autonomous trap clearance board">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Trap clearance</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {leader ? `${leader.symbol} · ${leader.verdict.replaceAll("-", " ")}` : "Waiting for trap radar"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {trapRadar.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={trapRadarTone(trapRadar.status, trapRadar.average_trap_score)}>{trapRadar.status.replaceAll("-", " ")}</Chip>
              <Chip tone={tokenSafetyTone(tokenSafety.status)}>{tokenSafety.average_safety_score}/100 safety</Chip>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Autonomous trap risk versus chase clearance chart"
            className="mt-2 h-40 w-full text-engine"
          >
            <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.28" />
            <text x="14" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">candidate</text>
            <text x="140" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">chase / trap</text>
            <text x="474" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">safety / fill</text>
            {items.length > 0 ? items.map((item, index) => {
              const safety = safetyByToken.get(item.token_id);
              const fill = fillByToken.get(item.token_id);
              const y = 34 + index * 25;
              const chaseWidth = Math.max(5, item.chase_score / maxChase * 214);
              const trapWidth = Math.max(5, item.trap_score / maxTrap * 214);
              const safetyX = 474 + (safety?.safety_score ?? 0) / 100 * 110;
              const fillX = 474 + (fill?.tradeability_score ?? 0) / 100 * 110;
              return (
                <g key={item.token_id}>
                  <text x="14" y={y + 9} className="fill-on-surface font-mono text-[11px] font-semibold">{item.symbol}</text>
                  <text x="14" y={y + 20} className="fill-outline font-mono text-[9px]">{item.verdict}</text>
                  <rect x="140" y={y + 1} width="214" height="7" rx="3.5" className="fill-outline" opacity="0.12" />
                  <rect x="140" y={y + 1} width={chaseWidth} height="7" rx="3.5" className={trapVerdictSvgClass(item.verdict)} opacity="0.78" />
                  <rect x="140" y={y + 12} width="214" height="6" rx="3" className="fill-outline" opacity="0.1" />
                  <rect x="140" y={y + 12} width={trapWidth} height="6" rx="3" className={item.trap_score >= 68 ? "fill-critical" : item.trap_score >= 45 ? "fill-caution" : "fill-outline"} opacity="0.7" />
                  <text x="366" y={y + 9} className="fill-outline font-mono text-[9px]">{item.chase_score}/100</text>
                  <text x="366" y={y + 20} className="fill-critical font-mono text-[9px]">{item.trap_score}/100</text>
                  <rect x="474" y={y + 3} width="110" height="8" rx="4" className="fill-outline" opacity="0.12" />
                  <line x1={safetyX} x2={safetyX} y1={y} y2={y + 14} stroke="currentColor" strokeOpacity="0.54" strokeWidth="2" />
                  <circle cx={fillX} cy={y + 16} r="4" className={fill && fill.tradeability_score >= 56 ? "fill-engine" : "fill-caution"} opacity="0.82" />
                  <text x="474" y={y + 25} className="fill-outline font-mono text-[8px]">{safety?.clearance ?? "safety"} · {fill?.status ?? "fill"}</text>
                </g>
              );
            }) : (
              <text x="18" y="58" className="fill-outline font-mono text-[12px]">waiting for trap radar rows</text>
            )}
            <text x="140" y={height - 9} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">top bar = chase clearance - lower bar = trap risk - right line/dot = safety and fillability</text>
          </svg>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/20 p-2" aria-label="Trap clearance decision">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Buy filter</p>
              <p className="mt-1 truncate text-sm font-semibold text-on-surface">
                {trapRadar.chase_count} chase · {trapRadar.trap_count} traps
              </p>
            </div>
            <Chip tone={tradeabilityTone(tradeability.status)}>{tradeability.status.replaceAll("-", " ")}</Chip>
          </div>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">
            {trapRadar.next_action}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-1" aria-label="Trap clearance metrics">
            <ProfitMetric label="Trap avg" value={`${trapRadar.average_trap_score}/100`} detail={`${trapRadar.max_trap_score}/100 max`} tone={trapRadar.average_trap_score >= 65 ? "critical" : trapRadar.average_trap_score >= 42 ? "caution" : "engine"} />
            <ProfitMetric label="Max chase" value={formatCompactCurrency(trapRadar.max_chase_usd)} detail={`${trapRadar.fastest_review_seconds}s review`} tone={trapRadar.max_chase_usd > 0 ? "engine" : "neutral"} />
            <ProfitMetric label="Safety" value={`${tokenSafety.cleared_count}/${tokenSafety.items.length}`} detail={`${tokenSafety.blocked_count} blocked`} tone={tokenSafety.blocked_count > tokenSafety.cleared_count ? "critical" : tokenSafety.cleared_count > 0 ? "engine" : "caution"} />
            <ProfitMetric label="Fillability" value={`${tradeability.average_tradeability_score}/100`} detail={`${Math.round(tradeability.average_slippage_bps)}bps slip`} tone={tradeability.average_tradeability_score >= 58 ? "engine" : tradeability.average_tradeability_score >= 38 ? "caution" : "critical"} />
            <ProfitMetric label="Exit-only" value={trapRadar.exit_only_count.toString()} detail={tokenSafety.exit_only_count > 0 ? `${tokenSafety.exit_only_count} safety` : "none"} tone={trapRadar.exit_only_count > 0 || tokenSafety.exit_only_count > 0 ? "critical" : "engine"} />
            <ProfitMetric label="Shortfall" value={formatCompactCurrency(tradeability.expected_shortfall_usd)} detail={formatCompactCurrency(tradeability.recommended_max_paper_size_usd)} tone={tradeability.expected_shortfall_usd > 20 ? "caution" : "engine"} />
          </dl>
          <span className="sr-only" aria-label="Autonomous trap clearance receipt">
            Trap clearance status {trapRadar.status}; leader {trapRadar.leader_symbol ?? "none"}; chase {trapRadar.chase_count}; probe {trapRadar.probe_count}; traps {trapRadar.trap_count}; exit-only {trapRadar.exit_only_count}; average trap {trapRadar.average_trap_score}; max trap {trapRadar.max_trap_score}; max chase {formatCurrency(trapRadar.max_chase_usd)}; token safety {tokenSafety.status}; cleared {tokenSafety.cleared_count}; probe-only {tokenSafety.probe_only_count}; blocked {tokenSafety.blocked_count}; tradeability {tradeability.status}; average tradeability {tradeability.average_tradeability_score}; expected shortfall {formatCurrency(tradeability.expected_shortfall_usd)}; controls {trapRadar.controls.join(" ")}
          </span>
        </div>
      </div>
    </section>
  );
}

function QuickExecutionReadinessBridge({
  adapter,
  ingestion,
  liveExecutionEnabled,
}: {
  adapter: Web3TradingState["autonomous_execution_adapter_readiness"];
  ingestion: Web3TradingState["market_ingestion_plan"];
  liveExecutionEnabled: boolean;
}) {
  const width = 640;
  const height = 150;
  const pad = { left: 74, right: 24, top: 24, bottom: 24 };
  const rowHeight = 18;
  const lanes = ingestion.provider_budget_lanes.slice(0, 3);
  const budgetMax = Math.max(1, ...lanes.map((lane) => lane.limit_per_minute));
  const statusTone = executionAdapterStatusTone(adapter.status, liveExecutionEnabled);

  return (
    <section className="mt-2 rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:mt-3 sm:p-3" aria-label="Autonomous execution readiness bridge">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Execution bridge</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {adapter.active_adapter.replaceAll("-", " ")} - {adapter.status.replaceAll("-", " ")}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {adapter.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={statusTone}>{adapter.readiness_score}/100</Chip>
              <Chip tone={liveExecutionEnabled ? "critical" : "demo"}>{liveExecutionEnabled ? "live armed" : "paper locked"}</Chip>
            </div>
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Autonomous execution adapter readiness chart"
            className="mt-2 h-36 w-full text-engine"
          >
            <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.3" />
            <text x="12" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">adapter gate</text>
            <text x={pad.left} y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">readiness checks</text>
            <text x="456" y="16" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">provider budget</text>
            {adapter.items.map((item, index) => {
              const y = pad.top + index * rowHeight;
              const barWidth = Math.max(5, item.score / 100 * 320);
              return (
                <g key={item.id}>
                  <text x="12" y={y + 8} className="fill-on-surface font-mono text-[10px] font-semibold">{item.label}</text>
                  <rect x={pad.left} y={y + 1} width="320" height="8" rx="4" className="fill-outline" opacity="0.12" />
                  <rect x={pad.left} y={y + 1} width={barWidth} height="8" rx="4" className={executionAdapterItemSvgClass(item.status)} opacity="0.82" />
                  <text x="406" y={y + 8} className="fill-outline font-mono text-[9px]">{item.score}/100</text>
                </g>
              );
            })}
            {lanes.map((lane, index) => {
              const y = pad.top + index * 24;
              const x = 456;
              const limitWidth = Math.max(30, lane.limit_per_minute / budgetMax * 150);
              const usedWidth = Math.max(3, lane.used_per_minute / Math.max(1, lane.limit_per_minute) * limitWidth);
              return (
                <g key={lane.id}>
                  <text x={x} y={y + 8} className="fill-on-surface font-mono text-[10px] font-semibold">{lane.label}</text>
                  <rect x={x} y={y + 12} width={limitWidth} height="7" rx="3.5" className="fill-outline" opacity="0.12" />
                  <rect x={x} y={y + 12} width={usedWidth} height="7" rx="3.5" className={providerBudgetSvgClass(lane.status)} opacity="0.74" />
                </g>
              );
            })}
            <text x={pad.left} y={height - 8} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">quote - order - landing - signature - relay - boundary</text>
          </svg>
        </div>
        <div className="grid grid-cols-2 gap-1" aria-label="Execution readiness metrics">
          <ProfitMetric label="Quote" value={adapter.quote_provider.replaceAll("-", " ")} detail={adapter.quote_request_ready ? "ready" : "refresh"} tone={adapter.quote_request_ready ? "engine" : "caution"} />
          <ProfitMetric label="Swap V2" value={adapter.swap_v2_order_ready ? "ready" : "gated"} detail={`${adapter.credential_block_count} credential blocks`} tone={adapter.swap_v2_order_ready ? "engine" : "caution"} />
          <ProfitMetric label="Signer" value={adapter.signer_ready ? "ready" : "locked"} detail={adapter.submit_ready ? "submit ready" : "submit locked"} tone={adapter.signer_ready && adapter.submit_ready ? "engine" : "demo"} />
          <ProfitMetric label="Budget" value={`${ingestion.provider_budget_utilization_pct}%`} detail={ingestion.provider_budget_status.replaceAll("-", " ")} tone={providerBudgetTone(ingestion.provider_budget_status)} />
          <ProfitMetric label="TTL" value={`${adapter.fastest_ttl_seconds}s`} detail={`${adapter.migration_block_count} migration blocks`} tone={adapter.fastest_ttl_seconds > 0 ? "engine" : "neutral"} />
          <ProfitMetric label="Fallback" value={adapter.paper_fallback_active ? "paper" : "none"} detail={adapter.next_action} tone={adapter.paper_fallback_active ? "demo" : statusTone} />
        </div>
      </div>
      <span className="sr-only" aria-label="Autonomous execution readiness receipt">
        Execution bridge status {adapter.status}, active adapter {adapter.active_adapter}, quote provider {adapter.quote_provider}, readiness score {adapter.readiness_score}, quote ready {adapter.quote_request_ready ? "yes" : "no"}, Swap V2 order ready {adapter.swap_v2_order_ready ? "yes" : "no"}, signer ready {adapter.signer_ready ? "yes" : "no"}, submit ready {adapter.submit_ready ? "yes" : "no"}, paper fallback {adapter.paper_fallback_active ? "active" : "inactive"}, provider budget {ingestion.provider_budget_status} at {ingestion.provider_budget_utilization_pct} percent, live execution {liveExecutionEnabled ? "enabled" : "locked"}.
      </span>
    </section>
  );
}

function QuickMarketIntakePlanner({
  plan,
}: {
  plan: Web3TradingState["autonomous_market_intake_plan"];
}) {
  const width = 640;
  const height = 172;
  const topItems = plan.items.slice(0, 6);
  const maxLimit = Math.max(1, ...topItems.map((item) => item.limit_per_minute));

  return (
    <section className="min-w-0 rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:p-3" aria-label="Autonomous market intake planner">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Market intake planner</p>
          <p className="mt-1 truncate text-sm font-semibold text-on-surface">
            {plan.next_provider} - {plan.next_lane.replaceAll("-", " ")}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {plan.summary}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={marketIntakeTone(plan.status, plan.can_feed_trade_loop)}>
            {plan.can_feed_trade_loop ? "loop feed" : plan.status}
          </Chip>
          <Chip tone={providerBudgetTone(plan.provider_budget_status)}>
            {plan.provider_budget_utilization_pct}% budget
          </Chip>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous market intake provider ranking chart"
        className="mt-2 h-40 w-full text-engine"
      >
        <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.28" />
        <text x="12" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">provider lane</text>
        <text x="238" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">priority</text>
        <text x="418" y="17" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">calls/min</text>
        {topItems.map((item, index) => {
          const y = 30 + index * 21;
          const priorityWidth = Math.max(4, item.priority_score / 100 * 150);
          const limitWidth = Math.max(24, item.limit_per_minute / maxLimit * 158);
          const usedWidth = Math.max(2, item.calls_per_minute / Math.max(1, item.limit_per_minute) * limitWidth);
          return (
            <g key={item.id}>
              <text x="12" y={y + 9} className="fill-on-surface font-mono text-[10px] font-semibold">{item.label}</text>
              <text x="130" y={y + 9} className="fill-outline font-mono text-[9px]">{item.provider}</text>
              <rect x="238" y={y + 2} width="150" height="8" rx="4" className="fill-outline" opacity="0.12" />
              <rect x="238" y={y + 2} width={priorityWidth} height="8" rx="4" className={marketIntakeSvgClass(item.status)} opacity="0.82" />
              <text x="394" y={y + 9} className="fill-outline font-mono text-[9px]">{item.priority_score}</text>
              <rect x="418" y={y + 2} width={limitWidth} height="8" rx="4" className="fill-outline" opacity="0.12" />
              <rect x="418" y={y + 2} width={usedWidth} height="8" rx="4" className={providerBudgetSvgClass(item.status === "throttled" ? "throttled" : item.status === "refresh" ? "hot" : "active")} opacity="0.78" />
              <text x="584" y={y + 9} className="fill-outline font-mono text-[9px]">{item.calls_per_minute}/{item.limit_per_minute}</text>
            </g>
          );
        })}
        <text x="12" y={height - 9} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">discovery - pair proof - paid hype - candles - route quote - wallet mark</text>
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-1" aria-label="Autonomous market intake metrics">
        <ProfitMetric label="Next" value={`${plan.next_request_seconds}s`} detail={plan.next_action} tone={marketIntakeTone(plan.status, plan.can_feed_trade_loop)} />
        <ProfitMetric label="Data" value={`${plan.data_score}/100`} detail={plan.route_refresh_first ? "route first" : "fresh enough"} tone={plan.data_score >= 70 ? "engine" : plan.data_score >= 45 ? "caution" : "critical"} />
        <ProfitMetric label="Symbols" value={`${plan.watched_symbol_count}`} detail={`${plan.max_candidate_refreshes} refresh slots`} tone={plan.watched_symbol_count > 0 ? "engine" : "neutral"} />
        <ProfitMetric label="Wallet" value={plan.wallet_mark_required ? "mark" : "clean"} detail={`${plan.expected_trade_window_seconds}s trade window`} tone={plan.wallet_mark_required ? "caution" : "engine"} />
      </div>
      <span className="sr-only" aria-label="Autonomous market intake provider details">
        {plan.items.map((item) => `${item.label} via ${item.provider}: ${item.status}, ${item.action}, ${item.calls_per_minute}/${item.limit_per_minute} calls per minute, endpoint ${item.endpoint}, symbols ${item.symbols.join(", ") || "none"}.`).join(" ")}
      </span>
    </section>
  );
}

function ProfitMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: QuickChipTone;
}) {
  const toneClass: Record<QuickChipTone, string> = {
    neutral: "text-outline",
    violet: "text-violet",
    engine: "text-engine",
    demo: "text-demo",
    caution: "text-caution",
    critical: "text-critical",
  };
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
      <p className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</p>
      <p className={cn("mt-1 truncate text-xs font-semibold sm:text-sm", toneClass[tone])}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] leading-4 text-outline">{detail}</p>
    </div>
  );
}

function commandSpineStatusTone(
  status: Web3TradingState["autonomous_command_center"]["status"],
  missionStatus: Web3TradingState["autonomous_trade_mission"]["status"],
): QuickChipTone {
  if (status === "attack" || missionStatus === "attack") return "engine";
  if (status === "protect" || status === "harvest" || missionStatus === "protect" || missionStatus === "harvest") return "caution";
  if (status === "blocked" || missionStatus === "blocked") return "critical";
  if (status === "prepare" || status === "watch" || missionStatus === "probe") return "caution";
  return "neutral";
}

function commandExecutionTone(status: Web3TradingState["autonomous_command_center_execution"]["status"]): QuickChipTone {
  if (status === "queued" || status === "applied") return "engine";
  if (status === "blocked") return "critical";
  return "neutral";
}

function readinessGateTone(status: Web3TradingState["autonomous_trade_readiness_gate"]["status"]): QuickChipTone {
  if (status === "ready") return "engine";
  if (status === "paper-only" || status === "repair-first" || status === "exit-only") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function profitVelocityTone(
  status: Web3TradingState["autonomous_profit_velocity_governor"]["status"],
  permission: Web3TradingState["autonomous_profit_velocity_governor"]["loop_permission"],
): QuickChipTone {
  if (permission === "multi-fill" || status === "burst" || status === "trade") return "engine";
  if (permission === "single-fill" || permission === "protect-only" || permission === "refresh-only" || status === "probe" || status === "protect" || status === "refresh") return "caution";
  if (permission === "blocked" || status === "blocked") return "critical";
  return "neutral";
}

function profitAllocationTone(
  status: Web3TradingState["autonomous_profit_allocation_plan"]["status"],
  shouldReleaseFirst: boolean,
  canDeploy: boolean,
): QuickChipTone {
  if (shouldReleaseFirst || status === "protect" || status === "rotate") return "caution";
  if (canDeploy || status === "press") return "engine";
  if (status === "cooldown") return "critical";
  if (status === "learning") return "neutral";
  return "neutral";
}

function profitAllocationSvgClass(
  action: Web3TradingState["autonomous_profit_allocation_plan"]["items"][number]["action"],
  status: Web3TradingState["autonomous_profit_allocation_plan"]["items"][number]["status"],
) {
  if (status === "fail" || action === "stop") return "fill-critical";
  if (action === "release" || action === "cooldown") return "fill-caution";
  if (action === "press" || action === "fund") return "fill-engine";
  return "fill-outline";
}

function shortLaneLabel(label: string) {
  return label.length > 18 ? `${label.slice(0, 17)}.` : label;
}

function commandActionSvgClass(
  action: Web3TradingState["autonomous_command_center"]["items"][number]["action"],
  status: Web3TradingState["autonomous_command_center"]["items"][number]["status"],
) {
  if (status === "blocked" || action === "blocked") return "fill-critical";
  if (action === "sell" || action === "harvest" || action === "protect" || status === "watch") return "fill-caution";
  if (action === "buy" || status === "ready" || status === "queued" || status === "applied") return "fill-engine";
  return "fill-outline";
}

function missionStepClass(status: Web3TradingState["autonomous_trade_mission"]["steps"][number]["status"]) {
  if (status === "pass") return "border-engine/25 bg-engine/[0.07] text-engine";
  if (status === "watch") return "border-caution/30 bg-caution/[0.08] text-caution";
  return "border-critical/30 bg-critical/[0.08] text-critical";
}

function missionStepToneClass(tone: QuickChipTone) {
  if (tone === "engine") return "border-engine/25 bg-engine/[0.07] text-engine";
  if (tone === "critical") return "border-critical/30 bg-critical/[0.08] text-critical";
  if (tone === "caution") return "border-caution/30 bg-caution/[0.08] text-caution";
  if (tone === "demo") return "border-demo/30 bg-demo/[0.08] text-demo";
  if (tone === "violet") return "border-violet/30 bg-violet/[0.08] text-violet";
  return "border-outline-variant/25 bg-void/20 text-on-surface";
}

function profitAuthorityTone(
  scoreboardStatus: Web3TradingState["autonomous_profit_lane_scoreboard"]["status"],
  routeStatus: Web3TradingState["autonomous_profit_route_selector"]["status"],
  walletStatus: Web3TradingState["autonomous_wallet_performance_governor"]["status"],
): QuickChipTone {
  if (scoreboardStatus === "press" || routeStatus === "execute") return "engine";
  if (scoreboardStatus === "blocked" || routeStatus === "blocked") return "critical";
  if (scoreboardStatus === "protect" || walletStatus === "protect" || scoreboardStatus === "cooldown") return "caution";
  if (scoreboardStatus === "selective" || routeStatus === "selective") return "caution";
  return "neutral";
}

function profitLaneItemTone(item: Web3TradingState["autonomous_profit_lane_scoreboard"]["items"][number]): QuickChipTone {
  if (item.status === "leader" || item.status === "ready") return item.action === "protect" ? "caution" : "engine";
  if (item.status === "blocked") return "critical";
  if (item.status === "protect" || item.action === "protect" || item.action === "refresh") return "caution";
  return "neutral";
}

function profitAuthorityTextClass(tone: QuickChipTone) {
  if (tone === "engine") return "text-engine";
  if (tone === "critical") return "text-critical";
  if (tone === "caution") return "text-caution";
  if (tone === "demo") return "text-demo";
  if (tone === "violet") return "text-violet";
  return "text-outline";
}

function profitAuthorityBarClass(tone: QuickChipTone) {
  if (tone === "engine") return "bg-engine";
  if (tone === "critical") return "bg-critical";
  if (tone === "caution") return "bg-caution";
  if (tone === "demo") return "bg-demo";
  if (tone === "violet") return "bg-violet";
  return "bg-outline";
}

function profitStatusTone(
  status: Web3TradingState["autonomous_profit_control"]["status"],
  permission: Web3TradingState["autonomous_daily_profit_lock"]["loop_permission"],
): QuickChipTone {
  if (permission === "paused" || permission === "stand-down" || status === "cooldown") return "critical";
  if (status === "protect") return "critical";
  if (status === "harvest" || status === "redeploy") return "caution";
  if (status === "press" || status === "compound") return "engine";
  return "neutral";
}

function wakePlanTone(
  status: Web3TradingState["autonomous_wake_plan"]["status"],
  canRun: boolean,
): QuickChipTone {
  if (canRun && (status === "minute" || status === "sprint" || status === "cycle")) return "engine";
  if (status === "blocked") return "critical";
  if (status === "protect" || status === "refresh" || status === "cooldown") return "caution";
  return canRun ? "engine" : "neutral";
}

function throttleStatusTone(
  status: Web3TradingState["autonomous_loop_throttle"]["status"],
  canRun: boolean,
): QuickChipTone {
  if (canRun && (status === "sprint" || status === "cycle")) return "engine";
  if (status === "blocked") return "critical";
  if (status === "protect" || status === "refresh" || status === "cooldown") return "caution";
  return "neutral";
}

function dataFreshnessTone(
  status: Web3TradingState["autonomous_data_freshness_gate"]["status"],
  canTrade: boolean,
): QuickChipTone {
  if (canTrade && (status === "clear" || status === "tradeable")) return "engine";
  if (status === "blocked") return "critical";
  if (status === "refresh" || status === "backfill") return "caution";
  return "demo";
}

function sourceQualityTone(
  status: Web3TradingState["autonomous_source_quality_oracle"]["status"],
  canChase: boolean,
): QuickChipTone {
  if (canChase || status === "organic" || status === "boosted-confirmed") return "engine";
  if (status === "paid-hype" || status === "blocked") return "critical";
  if (status === "refresh-first") return "caution";
  if (status === "sample") return "demo";
  return "neutral";
}

function routeRefreshTone(status: Web3TradingState["autonomous_route_refresh_execution"]["status"]): QuickChipTone {
  if (status === "ready") return "engine";
  if (status === "blocked") return "critical";
  return "caution";
}

function profitRunGuardTone(
  status: Web3TradingState["autonomous_profit_run_guard"]["status"],
  blocksFreshBuy: boolean,
): QuickChipTone {
  if (!blocksFreshBuy && (status === "accelerate" || status === "compound")) return "engine";
  if (status === "blocked" || status === "protect") return "critical";
  if (status === "tighten" || status === "refresh" || status === "cooldown") return "caution";
  return "neutral";
}

function dailyLockTone(permission: Web3TradingState["autonomous_daily_profit_lock"]["loop_permission"]): QuickChipTone {
  if (permission === "open") return "engine";
  if (permission === "paused" || permission === "stand-down") return "critical";
  if (permission === "harvest-only" || permission === "protect-only") return "caution";
  return "neutral";
}

function burstFeedbackTone(
  status: Web3TradingState["autonomous_burst_outcome_feedback"]["status"],
  blocksFreshBuy: boolean,
): QuickChipTone {
  if (!blocksFreshBuy && (status === "scale" || status === "keep")) return "engine";
  if (status === "blocked" || status === "protect") return "critical";
  if (status === "tighten") return "caution";
  return "neutral";
}

function capitalCommandTone(status: Web3TradingState["autonomous_capital_command"]["status"]): QuickChipTone {
  if (status === "deploy") return "engine";
  if (status === "protect" || status === "blocked") return "critical";
  if (status === "harvest" || status === "refresh") return "caution";
  return "neutral";
}

function permissionToneClass(tone: QuickChipTone) {
  if (tone === "engine") return "border-engine/25 bg-engine/[0.07] text-engine";
  if (tone === "critical") return "border-critical/30 bg-critical/[0.08] text-critical";
  if (tone === "caution") return "border-caution/30 bg-caution/[0.08] text-caution";
  if (tone === "demo") return "border-demo/30 bg-demo/[0.08] text-demo";
  if (tone === "violet") return "border-violet/30 bg-violet/[0.08] text-violet";
  return "border-outline-variant/25 bg-surface-dim/20 text-outline";
}

function actionQueueStatusTone(status: Web3TradingState["autonomous_action_queue"]["status"]): QuickChipTone {
  if (status === "attack" || status === "scalp" || status === "executing") return "engine";
  if (status === "protect" || status === "prepare" || status === "watch") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function fillLedgerStatusTone(status: Web3TradingState["autonomous_fill_ledger_digest"]["status"]): QuickChipTone {
  if (status === "pressing" || status === "profitable") return "engine";
  if (status === "protecting" || status === "cooldown") return "critical";
  if (status === "learning") return "caution";
  return "neutral";
}

function fillAuditTone(verdict: Web3TradingState["autonomous_fill_ledger_digest"]["last_fill_verdict"]): QuickChipTone {
  if (verdict === "press" || verdict === "keep") return "engine";
  if (verdict === "tighten" || verdict === "protect") return "critical";
  if (verdict === "learn") return "caution";
  return "neutral";
}

function forwardPermissionTone(status: Web3TradingState["autonomous_forward_loop_permission"]["status"]): QuickChipTone {
  if (status === "press" || status === "probe") return "engine";
  if (status === "harvest" || status === "protect" || status === "refresh") return "caution";
  if (status === "cooldown" || status === "blocked") return "critical";
  return "neutral";
}

function loopImpactTone(status: Web3TradingState["autonomous_loop_impact_auditor"]["status"]): QuickChipTone {
  if (status === "compound" || status === "continue") return "engine";
  if (status === "tighten" || status === "harvest" || status === "protect" || status === "refresh") return "caution";
  if (status === "cooldown" || status === "blocked") return "critical";
  return "neutral";
}

function minuteProfitDisciplineTone(status: Web3TradingState["autonomous_minute_profit_discipline"]["status"]): QuickChipTone {
  if (status === "scale" || status === "run") return "engine";
  if (status === "tighten" || status === "protect" || status === "refresh") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function minuteProofItemTone(status: Web3TradingState["autonomous_minute_profit_discipline"]["items"][number]["status"]): QuickChipTone {
  if (status === "pass") return "engine";
  if (status === "fail") return "critical";
  return "caution";
}

function profitCaptureAutopilotTone(status: Web3TradingState["autonomous_profit_capture_autopilot"]["status"]): QuickChipTone {
  if (status === "press") return "engine";
  if (status === "race" || status === "trim" || status === "harvest" || status === "trail" || status === "refresh") return "caution";
  if (status === "blocked") return "critical";
  return "neutral";
}

function profitRedeployAutopilotTone(status: Web3TradingState["autonomous_profit_redeploy_autopilot"]["status"]): QuickChipTone {
  if (status === "redeploy" || status === "probe") return "engine";
  if (status === "wait-proof" || status === "protect-first") return "caution";
  if (status === "blocked" || status === "cooldown") return "critical";
  return "neutral";
}

function profitRedeployExecutionTone(status: Web3TradingState["autonomous_profit_redeploy_execution"]["status"]): QuickChipTone {
  if (status === "queued" || status === "applied") return "engine";
  if (status === "wait-proof" || status === "protect-first") return "caution";
  if (status === "blocked" || status === "cooldown") return "critical";
  return "neutral";
}

function fillTapeItemClass(
  status: Web3TradingState["autonomous_fill_ledger_digest"]["items"][number]["status"],
  side: Web3TradingState["autonomous_fill_ledger_digest"]["items"][number]["side"],
) {
  if (status === "profitable") return "border-engine/25 bg-engine/[0.07] text-engine";
  if (status === "dragging") return "border-critical/30 bg-critical/[0.08] text-critical";
  if (status === "protective" || side === "sell") return "border-caution/30 bg-caution/[0.08] text-caution";
  return "border-outline-variant/25 bg-surface-dim/20 text-on-surface";
}

function strategyAttributionTone(status: Web3TradingState["autonomous_strategy_attribution"]["status"]): QuickChipTone {
  if (status === "scale") return "engine";
  if (status === "protect" || status === "tighten") return "critical";
  if (status === "selective" || status === "learning") return "caution";
  return "neutral";
}

function strategyAttributionSvgClass(
  status: Web3TradingState["autonomous_strategy_attribution"]["items"][number]["status"],
  contributionUsd: number,
) {
  if (status === "protect" || contributionUsd < 0) return "fill-critical";
  if (status === "tighten" || status === "learning") return "fill-caution";
  if (status === "scale" || contributionUsd > 0) return "fill-engine";
  return "fill-outline";
}

function trapRadarTone(
  status: Web3TradingState["autonomous_trap_radar"]["status"],
  score: number,
): QuickChipTone {
  if (status === "chase" || status === "probe") return "engine";
  if (status === "trap" || status === "exit-only" || score >= 72) return "critical";
  if (status === "refresh" || score >= 45) return "caution";
  return "neutral";
}

function trapVerdictSvgClass(verdict: Web3TradingState["autonomous_trap_radar"]["items"][number]["verdict"]) {
  if (verdict === "chase" || verdict === "probe") return "fill-engine";
  if (verdict === "trap" || verdict === "exit-only") return "fill-critical";
  if (verdict === "refresh") return "fill-caution";
  return "fill-outline";
}

function tokenSafetyTone(status: Web3TradingState["autonomous_token_safety_clearance"]["status"]): QuickChipTone {
  if (status === "cleared") return "engine";
  if (status === "blocked" || status === "exit-only") return "critical";
  if (status === "selective") return "caution";
  return "neutral";
}

function tradeabilityTone(status: Web3TradingState["autonomous_tradeability_simulator"]["status"]): QuickChipTone {
  if (status === "fillable" || status === "probe") return "engine";
  if (status === "blocked" || status === "protect") return "critical";
  if (status === "resize" || status === "requote") return "caution";
  return "neutral";
}

function actionQueueItemSvgClass(
  action: Web3TradingState["autonomous_action_queue"]["items"][number]["action"],
  status: Web3TradingState["autonomous_action_queue"]["items"][number]["status"],
) {
  if (status === "blocked" || action === "blocked") return "fill-critical";
  if (action === "protect" || action === "harvest" || action === "sell" || status === "watch") return "fill-caution";
  if (action === "buy" || action === "scalp" || status === "queued" || status === "applied" || status === "ready") return "fill-engine";
  return "fill-outline";
}

function executionAdapterStatusTone(
  status: Web3TradingState["autonomous_execution_adapter_readiness"]["status"],
  liveExecutionEnabled: boolean,
): QuickChipTone {
  if (liveExecutionEnabled) return "critical";
  if (status === "swap-v2-ready") return "engine";
  if (status === "signature-gated" || status === "credential-gated" || status === "refresh-required" || status === "migration-required") return "caution";
  if (status === "blocked") return "critical";
  if (status === "paper-only") return "demo";
  return "neutral";
}

function executionAdapterItemSvgClass(status: Web3TradingState["autonomous_execution_adapter_readiness"]["items"][number]["status"]) {
  if (status === "pass") return "fill-engine";
  if (status === "watch") return "fill-caution";
  return "fill-critical";
}

function providerBudgetTone(status: Web3TradingState["market_ingestion_plan"]["provider_budget_status"]): QuickChipTone {
  if (status === "within-budget") return "engine";
  if (status === "hot" || status === "throttled") return "caution";
  return "critical";
}

function providerBudgetSvgClass(status: Web3TradingState["market_ingestion_plan"]["provider_budget_lanes"][number]["status"]) {
  if (status === "active" || status === "reserved") return "fill-engine";
  if (status === "hot" || status === "throttled") return "fill-caution";
  return "fill-critical";
}

function marketIntakeTone(
  status: Web3TradingState["autonomous_market_intake_plan"]["status"],
  canFeedLoop: boolean,
): QuickChipTone {
  if (canFeedLoop || status === "attack") return "engine";
  if (status === "blocked") return "critical";
  if (status === "sample") return "demo";
  if (status === "refresh") return "caution";
  return "neutral";
}

function marketIntakeSvgClass(status: Web3TradingState["autonomous_market_intake_plan"]["items"][number]["status"]) {
  if (status === "ready" || status === "poll") return "fill-engine";
  if (status === "refresh" || status === "throttled") return "fill-caution";
  if (status === "sample") return "fill-demo";
  return "fill-critical";
}

function QuickSituationChangeTape({
  memory,
  situation,
}: {
  memory: Web3TradingState["tape_memory"];
  situation: Web3TradingState["situation_monitor"];
}) {
  const events = memory.events.slice(0, 4);
  const playbook = situation.playbook.slice(0, 3);
  const alerts = situation.alerts.slice(0, 3);
  const pressurePct = clampNumber(memory.pressure_score);
  const tapePct = clampNumber(situation.tape_score);
  const riskPct = clampNumber(situation.risk_score);
  const flowPct = clampNumber(situation.flow_score);
  const maxCount = Math.max(1, memory.acceleration_count, memory.deterioration_count, memory.urgent_count);
  const eventTone: QuickChipTone = memory.urgent_count > 0 || situation.regime === "rug-watch" || situation.regime === "stand-down"
    ? "critical"
    : memory.acceleration_count > memory.deterioration_count && situation.flow_score >= situation.risk_score
      ? "engine"
      : "caution";

  return (
    <section className="rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:p-3" aria-label="Autonomous situation change tape">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Situation change tape</p>
              <p className="mt-1 break-words text-sm font-semibold text-on-surface">
                {situation.regime.replace("-", " ")} · {memory.window_label}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {memory.summary}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Chip tone={eventTone}>{memory.pressure_score}/100 pressure</Chip>
              <Chip tone={situation.regime === "risk-on" || situation.regime === "selective-momentum" ? "engine" : situation.regime === "rug-watch" || situation.regime === "stand-down" ? "critical" : "caution"}>
                {situation.confidence}/100
              </Chip>
            </div>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]" aria-label="Situation pressure chart">
            <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Pressure</p>
                <p className={cn("font-mono text-xs font-semibold", pressurePct >= 70 ? "text-critical" : pressurePct >= 40 ? "text-caution" : "text-engine")}>{pressurePct}/100</p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-outline-variant/20">
                <div className={cn("h-2 rounded-full", pressurePct >= 70 ? "bg-critical" : pressurePct >= 40 ? "bg-caution" : "bg-engine")} style={{ width: `${Math.max(8, pressurePct)}%` }} />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {[
                  { label: "Accel", value: memory.acceleration_count, className: "bg-engine" },
                  { label: "Deter", value: memory.deterioration_count, className: "bg-caution" },
                  { label: "Urgent", value: memory.urgent_count, className: "bg-critical" },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <div className="flex h-14 items-end rounded-md bg-outline-variant/10 px-1 py-1">
                      <div className={cn("w-full rounded-sm", item.className)} style={{ height: `${Math.max(8, item.value / maxCount * 100)}%` }} />
                    </div>
                    <p className="mt-1 truncate text-center font-mono text-[10px] uppercase tracking-telemetry text-outline">{item.label} {item.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-1 sm:grid-cols-1" aria-label="Situation regime scores">
              <SituationMetric label="Tape" value={tapePct} />
              <SituationMetric label="Risk" value={riskPct} invert />
              <SituationMetric label="Flow" value={flowPct} />
            </dl>
          </div>
        </div>

        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2" aria-label="Tape memory events">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Live changes</p>
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{memory.tokens_tracked} tracked</p>
            </div>
            <div className="mt-2 space-y-1.5">
              {events.length > 0 ? events.map((event) => (
                <div key={event.id} className={cn("rounded-md border px-2 py-1.5", tapeEventClass(event.severity, event.action))}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-on-surface">{event.symbol}</p>
                    <p className="shrink-0 font-mono text-[10px] uppercase tracking-telemetry">{event.action}</p>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{event.summary}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-outline">
                    {formatPercent(event.price_velocity_delta_pct)} vel · {formatPercent(event.buy_pressure_delta_pct)} buys · {event.confidence}/100
                  </p>
                </div>
              )) : (
                <p className="rounded-md border border-outline-variant/20 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant">
                  No tape change crossed the action threshold this cycle.
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2" aria-label="Situation playbook">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Playbook</p>
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{alerts.length} alerts</p>
            </div>
            <div className="mt-2 space-y-1.5">
              {playbook.map((action) => (
                <div key={action.id} className="rounded-md border border-outline-variant/20 bg-void/20 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-on-surface">{action.label}</p>
                    <p className={cn("shrink-0 font-mono text-[10px] uppercase tracking-telemetry", action.priority === "now" ? "text-critical" : action.priority === "next" ? "text-caution" : "text-outline")}>{action.priority}</p>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{action.detail}</p>
                </div>
              ))}
            </div>
            {alerts.length > 0 ? (
              <p className={cn("mt-2 line-clamp-2 text-[11px] leading-4", alerts.some((alert) => alert.severity === "urgent") ? "text-critical" : "text-caution")}>
                {alerts.map((alert) => alert.message).join(" ")}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <span className="sr-only" aria-label="Autonomous situation change tape receipt">
        Situation change tape: regime {situation.regime}, pressure {memory.pressure_score}, acceleration {memory.acceleration_count}, deterioration {memory.deterioration_count}, urgent {memory.urgent_count}, events {events.map((event) => `${event.symbol} ${event.action}`).join(", ") || "none"}, next playbook {playbook[0]?.label ?? "none"}. It monitors tape changes for local paper decisions and cannot sign or submit trades.
      </span>
    </section>
  );
}

function SituationMetric({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const strong = invert ? value <= 35 : value >= 62;
  const warning = invert ? value <= 58 : value >= 42;
  const color = strong ? "text-engine" : warning ? "text-caution" : "text-critical";
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
      <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</dt>
      <dd className={cn("mt-1 truncate text-xs font-semibold", color)}>{value}/100</dd>
    </div>
  );
}

function QuickExecutionRunway({ runway }: { runway: Web3TradingState["autonomous_execution_runway"] }) {
  const activeIndex = Math.max(0, runway.steps.findIndex((step) => step.id === runway.next_step_id));
  const progressPct = runway.steps.length <= 1 ? 0 : Math.round((activeIndex / (runway.steps.length - 1)) * 100);

  return (
    <section className="mt-2 rounded-md border border-engine/20 bg-void/20 p-2 sm:mt-3 sm:p-3" aria-label="Autonomous execution runway">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Execution runway</p>
          <p className="mt-1 break-words text-sm font-semibold text-on-surface">
            {runway.target_symbol ?? "Desk"} · {runway.action.replace("-", " ")}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {runway.summary}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={runway.can_auto_paper ? "engine" : runway.status === "blocked" ? "critical" : runway.status === "refresh" ? "caution" : "neutral"}>
            {runway.runway_score}/100
          </Chip>
          <Chip tone={runway.execution_boundary === "paper-ledger-only" ? "demo" : runway.execution_boundary === "blocked-paper-only" ? "critical" : "caution"}>
            {runway.execution_boundary.replaceAll("-", " ")}
          </Chip>
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-outline-variant/20" aria-label="Execution runway progress">
        <div className={cn("h-2 rounded-full", runway.can_auto_paper ? "bg-engine" : runway.status === "blocked" ? "bg-critical" : "bg-caution")} style={{ width: `${Math.max(12, progressPct)}%` }} />
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-5" aria-label="Autonomous execution runway steps">
        {runway.steps.map((step) => (
          <div key={step.id} className={cn("min-w-0 rounded-md border px-2 py-1.5", stepStatusClass(step.status))}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-mono text-[10px] uppercase tracking-telemetry">{step.label}</p>
              <p className="font-mono text-[10px]">{step.score}/100</p>
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-on-surface">
              {step.action.replace("-", " ")}
            </p>
            <p className="mt-0.5 truncate text-[11px] leading-4 text-outline">
              {formatCompactCurrency(step.notional_usd)} · {step.eta_seconds}s
            </p>
            <span className="sr-only">
              {step.detail} {step.blocker ?? ""}
            </span>
          </div>
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Execution runway telemetry">
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
          <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Next tick</dt>
          <dd className="mt-1 truncate text-xs font-semibold text-on-surface">{runway.next_tick_seconds}s · {runway.ticks_per_minute}/m</dd>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
          <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Paper size</dt>
          <dd className="mt-1 truncate text-xs font-semibold text-on-surface">{formatCompactCurrency(runway.paper_size_usd)} · {runway.max_next_fills}f</dd>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
          <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Edge</dt>
          <dd className={cn("mt-1 truncate text-xs font-semibold", runway.expected_edge_usd >= 0 ? "text-engine" : "text-critical")}>{formatCompactSignedCurrency(runway.expected_edge_usd)}</dd>
        </div>
        <div className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
          <dt className="truncate font-mono text-[10px] uppercase tracking-telemetry text-outline">Lane</dt>
          <dd className="mt-1 truncate text-xs font-semibold text-on-surface">{runway.target_lane?.replace("-", " ") ?? "watch"}</dd>
        </div>
      </dl>
      <span className="sr-only" aria-label="Autonomous execution runway receipt">
        {runway.next_action} Route refresh {runway.should_refresh_route ? "needed" : "not needed"}; chart refresh {runway.should_refresh_chart ? "needed" : "not needed"}; protect first {runway.should_protect_first ? "yes" : "no"}; blockers {runway.blockers.join("; ") || "none"}.
      </span>
    </section>
  );
}

type QuickPriceActionTapeItem = {
  token_id: string;
  symbol: string;
  action: string;
  score: number;
  price_usd: number;
  price_change_5m_pct: number;
  price_change_1h_pct: number;
  price_change_6h_pct: number;
  volume_5m_usd: number;
  volume_1h_usd: number;
  liquidity_usd: number;
  buy_pressure_pct: number;
  risk_score: number;
  max_paper_size_usd: number;
  path: number[];
};

function QuickPriceActionTapeChart({ items }: { items: QuickPriceActionTapeItem[] }) {
  const width = 640;
  const height = 192;
  const pad = { left: 54, right: 22, top: 18, bottom: 28 };
  const chartWidth = width - pad.left - pad.right;
  const rowHeight = 34;
  const maxVolume = Math.max(1, ...items.map((item) => item.volume_1h_usd));
  const maxLiquidity = Math.max(1, ...items.map((item) => item.liquidity_usd));

  if (items.length === 0) {
    return (
      <section className="mt-2 rounded-md border border-outline-variant/30 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant sm:mt-3 sm:p-3" aria-label="Moonshot-style price action tape chart">
        Price action tape is waiting for market rows.
      </section>
    );
  }

  return (
    <section className="mt-2 rounded-md border border-outline-variant/30 bg-void/20 p-2 sm:mt-3 sm:p-3" aria-label="Moonshot-style price action tape chart">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Price action tape</p>
          <p className="mt-1 break-words text-sm font-semibold text-on-surface">
            Momentum, flow, liquidity, and exit risk
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {items[0].symbol} leads this chart at {items[0].score}/100 with {formatPercent(items[0].price_change_5m_pct)} over 5m and {Math.round(items[0].buy_pressure_pct)}% buy pressure.
          </p>
        </div>
        <Chip tone={items[0].risk_score >= 68 ? "critical" : items[0].score >= 66 ? "engine" : "caution"}>
          {items[0].action.replace("-", " ")}
        </Chip>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Moonshot-style memecoin price action chart with momentum volume liquidity and risk"
        className="mt-2 h-44 w-full text-engine"
      >
        <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.32" />
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="currentColor" strokeOpacity="0.12" />
        <text x={pad.left} y="14" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">5m / 1h / 6h momentum path</text>
        <text x={width - 126} y="14" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">risk / flow</text>
        {items.map((item, index) => {
          const y = pad.top + index * rowHeight + 9;
          const pathValues = item.path;
          const minPath = Math.min(-12, ...pathValues);
          const maxPath = Math.max(12, ...pathValues);
          const range = Math.max(1, maxPath - minPath);
          const xFor = (pointIndex: number) => pad.left + pointIndex / Math.max(1, pathValues.length - 1) * (chartWidth * 0.58);
          const yFor = (value: number) => y + 18 - ((value - minPath) / range) * 26;
          const linePath = pathValues.map((value, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${xFor(pointIndex)} ${yFor(value)}`).join(" ");
          const volumeWidth = Math.max(4, item.volume_1h_usd / maxVolume * 86);
          const liquidityWidth = Math.max(4, item.liquidity_usd / maxLiquidity * 86);
          const riskX = width - 88 + item.risk_score / 100 * 58;
          return (
            <g key={item.token_id}>
              <text x="10" y={y + 8} className="fill-on-surface font-mono text-[12px] font-semibold">{item.symbol}</text>
              <line x1={pad.left} x2={pad.left + chartWidth * 0.58} y1={y + 18} y2={y + 18} stroke="currentColor" strokeOpacity="0.1" />
              <path d={linePath} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={item.price_change_5m_pct >= 0 ? "text-engine" : "text-critical"} />
              <circle cx={xFor(pathValues.length - 1)} cy={yFor(pathValues[pathValues.length - 1])} r="4" className={item.price_change_5m_pct >= 0 ? "fill-engine" : "fill-critical"} />
              <rect x={pad.left + chartWidth * 0.62} y={y + 3} width="86" height="7" rx="3.5" className="fill-outline" opacity="0.12" />
              <rect x={pad.left + chartWidth * 0.62} y={y + 3} width={volumeWidth} height="7" rx="3.5" className="fill-engine" opacity="0.7" />
              <rect x={pad.left + chartWidth * 0.62} y={y + 15} width="86" height="5" rx="2.5" className="fill-outline" opacity="0.12" />
              <rect x={pad.left + chartWidth * 0.62} y={y + 15} width={liquidityWidth} height="5" rx="2.5" className="fill-caution" opacity="0.62" />
              <line x1={width - 88} x2={width - 30} y1={y + 13} y2={y + 13} stroke="currentColor" strokeOpacity="0.18" />
              <circle cx={riskX} cy={y + 13} r="5" className={item.risk_score >= 68 ? "fill-critical" : item.buy_pressure_pct >= 56 ? "fill-engine" : "fill-caution"} opacity="0.88" />
              <text x={width - 124} y={y + 28} className="fill-outline font-mono text-[9px]">{formatPercent(item.price_change_5m_pct)} 5m · {Math.round(item.buy_pressure_pct)}% buys</text>
            </g>
          );
        })}
        <text x={pad.left} y={height - 9} className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">line = price path · green = volume · amber = liquidity · dot = risk/flow</text>
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Price action tape leaders">
        {items.map((item) => (
          <div key={item.token_id} className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 px-2 py-1.5">
            <p className="truncate text-xs font-semibold text-on-surface">{item.symbol}</p>
            <p className={cn("mt-0.5 truncate font-mono text-[10px] uppercase tracking-telemetry", item.risk_score >= 68 ? "text-critical" : item.score >= 66 ? "text-engine" : "text-caution")}>
              {item.score}/100 · {formatCompactCurrency(item.max_paper_size_usd)}
            </p>
          </div>
        ))}
      </div>
      <QuickOpportunityRiskMap items={items} />
      <span className="sr-only" aria-label="Autonomous price action tape receipt">
        Price action tape ranks visible memecoins by 5 minute, 1 hour, and 6 hour momentum, buy pressure, volume, liquidity, risk, signal score, and fused paper action. It is chart evidence only and cannot sign or submit a trade.
      </span>
    </section>
  );
}

function QuickOpportunityRiskMap({ items }: { items: QuickPriceActionTapeItem[] }) {
  const width = 640;
  const height = 166;
  const pad = { left: 42, right: 30, top: 24, bottom: 32 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const leader = items[0];

  return (
    <div className="mt-2 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2" aria-label="Autonomous opportunity versus risk map">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Opportunity map</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {leader.symbol} is the current leader; this map separates chaseable edge from exit-liquidity danger.
          </p>
        </div>
        <Chip tone={leader.risk_score >= 68 ? "critical" : leader.score >= 66 ? "engine" : "caution"}>
          {leader.score}/100 edge
        </Chip>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Autonomous opportunity risk chart for memecoin candidates"
        className="mt-2 h-36 w-full text-engine"
      >
        <rect width={width} height={height} rx="8" className="fill-void" opacity="0.2" />
        <line x1={pad.left} x2={width - pad.right} y1={pad.top + plotHeight / 2} y2={pad.top + plotHeight / 2} stroke="currentColor" strokeOpacity="0.14" />
        <line x1={pad.left + plotWidth / 2} x2={pad.left + plotWidth / 2} y1={pad.top} y2={height - pad.bottom} stroke="currentColor" strokeOpacity="0.14" />
        <text x={pad.left} y="15" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">higher opportunity</text>
        <text x={width - 142} y="15" className="fill-outline font-mono text-[10px] uppercase tracking-telemetry">higher risk</text>
        <text x={pad.left + 8} y={height - 10} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">watch</text>
        <text x={pad.left + plotWidth - 142} y={height - 10} className="fill-outline font-mono text-[9px] uppercase tracking-telemetry">protect / trim</text>
        {items.map((item, index) => {
          const x = pad.left + item.risk_score / 100 * plotWidth;
          const y = pad.top + (1 - item.score / 100) * plotHeight;
          const radius = Math.max(6, Math.min(14, 5 + item.buy_pressure_pct / 12));
          const tone = item.risk_score >= 68 ? "fill-critical" : item.score >= 66 && item.buy_pressure_pct >= 54 ? "fill-engine" : "fill-caution";
          const ring = item.max_paper_size_usd > 0 ? 1 : 0.45;
          return (
            <g key={item.token_id}>
              <circle cx={x} cy={y} r={radius + 4} className="fill-outline" opacity={0.08 + index * 0.01} />
              <circle cx={x} cy={y} r={radius} className={tone} opacity={0.72 + ring * 0.12} />
              <text x={Math.min(width - 86, x + radius + 6)} y={Math.max(28, y + 4)} className="fill-on-surface font-mono text-[10px] font-semibold">{item.symbol}</text>
            </g>
          );
        })}
      </svg>
      <span className="sr-only" aria-label="Autonomous opportunity risk map receipt">
        Opportunity risk map plots each visible memecoin by fused opportunity score against exit and liquidity risk. Bubble size follows buy pressure, and paper size remains capped by the autonomous agent.
      </span>
    </div>
  );
}

function stepStatusClass(status: Web3TradingState["autonomous_execution_runway"]["steps"][number]["status"]) {
  if (status === "ready" || status === "done") return "border-engine/30 bg-engine/[0.07] text-engine";
  if (status === "running") return "border-caution/35 bg-caution/[0.08] text-caution";
  if (status === "blocked") return "border-critical/35 bg-critical/[0.08] text-critical";
  return "border-outline-variant/20 bg-surface-dim/20 text-outline";
}

function signalNoiseDecisionToneClass(action: Web3TradingState["autonomous_signal_noise_trade_decision"]["action"]) {
  if (action === "paper-buy" || action === "paper-probe") return "text-engine";
  if (action === "protect" || action === "stand-down") return "text-critical";
  if (action === "refresh-route" || action === "refresh-candles") return "text-caution";
  return "text-outline";
}

function tapeEventClass(
  severity: Web3TradingState["tape_memory"]["events"][number]["severity"],
  action: Web3TradingState["tape_memory"]["events"][number]["action"],
) {
  if (severity === "urgent" || action === "exit" || action === "block") return "border-critical/35 bg-critical/[0.08] text-critical";
  if (severity === "watch" || action === "trim") return "border-caution/35 bg-caution/[0.08] text-caution";
  if (action === "press" || action === "probe") return "border-engine/30 bg-engine/[0.07] text-engine";
  return "border-outline-variant/20 bg-surface-dim/20 text-outline";
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
  }).format(value);
}

function formatTokenPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1) return formatCurrency(value);
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value >= 0.000001) return `$${value.toFixed(8)}`;
  return `$${value.toExponential(2)}`;
}

function formatSignedCurrency(value: number) {
  const formatted = formatCurrency(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 1_000 ? 1 : 0,
  }).format(value);
}

function formatCompactSignedCurrency(value: number) {
  const sign = value >= 0 ? "+" : "-";
  const absValue = Math.abs(value);
  if (absValue < 1_000) {
    return `${sign}$${Math.round(absValue).toLocaleString("en-US")}`;
  }
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(absValue);
  return `${sign}${formatted}`;
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function actionToneClass(action: Web3TradingState["autonomous_market_evidence_fusion"]["items"][number]["action"]) {
  if (action === "trade" || action === "probe") return "text-engine";
  if (action === "protect" || action === "reject") return "text-critical";
  if (action === "refresh-route" || action === "refresh-candles") return "text-caution";
  return "text-outline";
}

function markActionToneClass(action: Web3TradingState["autonomous_portfolio_mark_board"]["items"][number]["action"]) {
  if (action === "press" || action === "harvest") return "text-engine";
  if (action === "trim" || action === "protect" || action === "refresh") return "text-caution";
  if (action === "exit") return "text-critical";
  return "text-outline";
}

function buildQuickPriceActionTape(state: Web3TradingState): QuickPriceActionTapeItem[] {
  const fusionBySymbol = new Map(state.autonomous_market_evidence_fusion.items.map((item) => [item.symbol, item]));
  const signalBySymbol = new Map(state.autonomous_signal_noise.items.map((item) => [item.symbol, item]));
  const velocityBySymbol = new Map(state.trend_velocity_scanner.items.map((item) => [item.symbol, item]));
  const pulseBySymbol = new Map(state.autonomous_market_pulse.items.map((item) => [item.symbol, item]));
  const trapBySymbol = new Map(state.autonomous_trap_radar.items.map((item) => [item.symbol, item]));

  return state.market
    .map((market): QuickPriceActionTapeItem => {
      const fusion = fusionBySymbol.get(market.symbol);
      const signal = signalBySymbol.get(market.symbol);
      const velocity = velocityBySymbol.get(market.symbol);
      const pulse = pulseBySymbol.get(market.symbol);
      const trap = trapBySymbol.get(market.symbol);
      const buyTotal = Math.max(1, market.buys_5m + market.sells_5m);
      const buyPressurePct = market.buys_5m / buyTotal * 100;
      const liquidityScore = clampNumber(Math.round(Math.min(100, market.liquidity_usd / 10_000)));
      const volumeScore = clampNumber(Math.round(Math.min(100, market.volume_1h_usd / 12_000)));
      const momentumScore = clampNumber(Math.round(
        50 +
          market.price_change_5m_pct * 2.8 +
          market.price_change_1h_pct * 1.2 +
          market.price_change_6h_pct * 0.42,
      ));
      const riskScore = clampNumber(Math.round(
        (trap?.trap_score ?? 28) * 0.45 +
          Math.max(0, market.risk_flags.length * 12) +
          Math.max(0, 48 - liquidityScore) * 0.5 +
          Math.max(0, 50 - buyPressurePct) * 0.35,
      ));
      const score = clampNumber(Math.round(
        (fusion?.fusion_score ?? 50) * 0.24 +
          (signal?.signal_score ?? 50) * 0.18 +
          (velocity?.trend_score ?? momentumScore) * 0.18 +
          (pulse?.pulse_score ?? momentumScore) * 0.16 +
          momentumScore * 0.12 +
          volumeScore * 0.07 +
          liquidityScore * 0.05 -
          riskScore * 0.16,
      ));
      const action = fusion?.action ?? pulse?.action ?? signal?.action ?? "watch";
      const maxPaperSizeUsd = fusion?.max_paper_size_usd ?? Math.round((signal?.recommended_size_multiplier ?? 0.2) * 1_000);
      return {
        token_id: market.id,
        symbol: market.symbol,
        action,
        score,
        price_usd: market.price_usd,
        price_change_5m_pct: market.price_change_5m_pct,
        price_change_1h_pct: market.price_change_1h_pct,
        price_change_6h_pct: market.price_change_6h_pct,
        volume_5m_usd: market.volume_5m_usd,
        volume_1h_usd: market.volume_1h_usd,
        liquidity_usd: market.liquidity_usd,
        buy_pressure_pct: buyPressurePct,
        risk_score: riskScore,
        max_paper_size_usd: maxPaperSizeUsd,
        path: [
          -market.price_change_6h_pct * 0.36,
          market.price_change_6h_pct * 0.28,
          market.price_change_1h_pct * 0.72,
          market.price_change_5m_pct,
        ],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function clampNumber(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function averageNumbers(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildAutonomousNextMoves(state: Web3TradingState): AutonomousNextMove[] {
  const dataGate = state.autonomous_data_freshness_gate;
  const sourceQuality = state.autonomous_source_quality_oracle;
  const tickGovernor = state.autonomous_tick_governor;
  const commandCenter = state.autonomous_command_center;
  const commandExecution = state.autonomous_command_center_execution;
  const queue = state.autonomous_action_queue;
  const queueExecution = state.autonomous_action_queue_execution;
  const runway = state.autonomous_execution_runway;
  const activeRunwayStep = runway.steps.find((step) => step.id === runway.next_step_id) ?? runway.steps[0] ?? null;
  const throttle = state.autonomous_loop_throttle;
  const walletFeedback = state.autonomous_loop_feedback;
  const moves: AutonomousNextMove[] = [];

  if (
    tickGovernor.should_refresh_market_data ||
    dataGate.status === "refresh" ||
    dataGate.status === "backfill" ||
    dataGate.action === "fetch-candles" ||
    dataGate.action === "refresh-stream" ||
    dataGate.action === "refresh-quote"
  ) {
    moves.push({
      id: "refresh-evidence",
      label: "Refresh evidence",
      action: dataGate.next_refresh_lane.replaceAll("-", " "),
      detail: `${dataGate.next_action} Source: ${state.market_source.label}.`,
      etaSeconds: boundedSeconds(tickGovernor.next_tick_seconds),
      score: dataGate.data_score,
      budgetUsd: 0,
      tone: dataGate.status === "blocked" ? "critical" : dataGate.status === "sample" ? "demo" : "caution",
    });
  }

  if (sourceQuality.status === "refresh-first" || sourceQuality.status === "paid-hype" || sourceQuality.status === "blocked") {
    moves.push({
      id: "source-quality",
      label: sourceQuality.leader_symbol ? `Source ${sourceQuality.leader_symbol}` : "Source quality",
      action: sourceQuality.leader_action?.replaceAll("-", " ") ?? sourceQuality.status.replaceAll("-", " "),
      detail: sourceQuality.next_action,
      etaSeconds: boundedSeconds(sourceQuality.fastest_review_seconds),
      score: sourceQuality.quality_score,
      budgetUsd: 0,
      tone: sourceQuality.status === "paid-hype" || sourceQuality.status === "blocked" ? "critical" : "caution",
    });
  }

  moves.push({
    id: "command",
    label: commandExecution.selected_symbol ?? commandCenter.primary_symbol ?? "Command",
    action: (commandExecution.selected_action ?? commandCenter.primary_action).replaceAll("-", " "),
    detail: commandExecution.summary || commandCenter.next_action,
    etaSeconds: boundedSeconds(commandCenter.fastest_review_seconds),
    score: commandCenter.command_score,
    budgetUsd: Math.max(0, commandCenter.risk_usd),
    tone: commandExecutionTone(commandExecution.status),
  });

  if (queue.items.length > 0 || queueExecution.selected_queue_id) {
    const queueAction = queueExecution.selected_side === "sell" &&
      (queueExecution.selected_action === "protect" || queueExecution.selected_action === "harvest")
      ? "sell"
      : queueExecution.selected_action.replaceAll("-", " ");
    moves.push({
      id: "queue",
      label: queueExecution.selected_symbol ?? queue.leader_symbol ?? "Action queue",
      action: queueAction,
      detail: queueExecution.summary || queue.next_action,
      etaSeconds: boundedSeconds(queueExecution.review_after_seconds || queue.fastest_review_seconds),
      score: queueExecution.queue_score || Math.max(1, queue.ready_count * 18),
      budgetUsd: Math.max(queueExecution.paper_size_usd, queue.deploy_usd, queue.release_usd),
      tone: queueExecution.paper_trade_ready || queueExecution.ledger_applied
        ? "engine"
        : queueExecution.status === "blocked" || queue.status === "blocked"
          ? "critical"
          : queueExecution.selected_side === "sell" || queue.leader_action === "protect"
            ? "caution"
            : "neutral",
    });
  }

  if (activeRunwayStep) {
    moves.push({
      id: "runway",
      label: `Runway ${activeRunwayStep.label}`,
      action: activeRunwayStep.action.replaceAll("-", " "),
      detail: activeRunwayStep.blocker ? `${activeRunwayStep.detail} Blocker: ${activeRunwayStep.blocker}.` : activeRunwayStep.detail || runway.next_action,
      etaSeconds: boundedSeconds(activeRunwayStep.eta_seconds || runway.next_tick_seconds),
      score: activeRunwayStep.score || runway.runway_score,
      budgetUsd: Math.max(activeRunwayStep.notional_usd, runway.paper_size_usd),
      tone: activeRunwayStep.status === "ready" || activeRunwayStep.status === "done" || runway.can_auto_paper
        ? "engine"
        : activeRunwayStep.status === "blocked" || runway.status === "blocked"
          ? "critical"
          : runway.execution_boundary === "paper-ledger-only"
            ? "demo"
            : "caution",
    });
  }

  const launchTiming = state.autonomous_launch_timing;
  moves.push({
    id: "launch-timing",
    label: launchTiming.selected_symbol ? `Launch ${launchTiming.selected_symbol}` : "Launch timing",
    action: launchTiming.selected_action.replaceAll("-", " "),
    detail: launchTiming.next_action,
    etaSeconds: boundedSeconds(launchTiming.fastest_review_seconds),
    score: launchTiming.timing_score,
    budgetUsd: launchTiming.recommended_entry_usd,
    tone: launchTiming.status === "snipe" || launchTiming.status === "probe"
      ? "engine"
      : launchTiming.status === "confirm" || launchTiming.status === "late-chase" || launchTiming.status === "fade"
        ? "caution"
        : launchTiming.status === "blocked"
          ? "critical"
          : "neutral",
  });

  const trigger = state.autonomous_trigger_opportunity;
  moves.push({
    id: "trigger-opportunity",
    label: trigger.selected_symbol ? `Trigger ${trigger.selected_symbol}` : "Trigger opportunity",
    action: trigger.selected_action.replaceAll("-", " "),
    detail: trigger.next_action,
    etaSeconds: boundedSeconds(trigger.fastest_review_seconds),
    score: trigger.opportunity_score,
    budgetUsd: Math.max(trigger.exposed_usd, trigger.expected_profit_lock_usd),
    tone: trigger.status === "protect" || trigger.status === "pre-arm"
      ? "engine"
      : trigger.status === "repair" || trigger.status === "auth-required"
        ? "caution"
        : trigger.status === "blocked"
          ? "critical"
          : "neutral",
  });

  moves.push({
    id: "loop-throttle",
    label: "Loop throttle",
    action: throttle.action.replaceAll("-", " "),
    detail: throttle.next_action,
    etaSeconds: boundedSeconds(throttle.cadence_seconds),
    score: throttle.throttle_score,
    budgetUsd: Math.max(throttle.deploy_budget_usd, throttle.release_budget_usd),
    tone: throttle.can_run
      ? throttle.status === "sprint" || throttle.status === "cycle" ? "engine" : "caution"
      : throttle.status === "blocked" ? "critical" : "caution",
  });

  moves.push({
    id: "wallet-feedback",
    label: "Wallet feedback",
    action: walletFeedback.status,
    detail: walletFeedback.next_action,
    etaSeconds: boundedSeconds(walletFeedback.cadence_seconds),
    score: walletFeedback.feedback_score,
    budgetUsd: Math.max(0, state.autonomous_profit_control.deploy_now_usd, state.autonomous_profit_control.release_now_usd),
    tone: walletFeedback.should_pause_fresh_buys
      ? "critical"
      : walletFeedback.status === "press" || walletFeedback.status === "keep"
        ? "engine"
        : walletFeedback.status === "learning"
          ? "violet"
          : "caution",
  });

  const deduped = new Map<string, AutonomousNextMove>();
  for (const move of moves) {
    if (!deduped.has(move.id)) deduped.set(move.id, move);
  }

  return Array.from(deduped.values()).slice(0, 6);
}

function boundedSeconds(value: number) {
  return Math.max(1, Math.min(600, Math.round(value || 1)));
}

type ChartProofTarget = {
  market: Web3TradingState["market"][number];
  position: Web3TradingState["portfolio"]["open_positions"][number] | null;
};

type OhlcvEndpointResponse = {
  provider: "geckoterminal";
  source: "geckoterminal-public";
  network: string;
  pool: string;
  timeframe: "minute" | "hour" | "day";
  limit: number;
  fetched_at: string;
  candles: Array<{ close: number }>;
  signal: {
    action: AutonomousCandleRefreshRecordRequest["signal"]["action"];
    confidence: number;
    momentum_score: number;
    volume_score: number;
    risk_score: number;
    review_after_seconds: number;
    summary: string;
    blockers?: string[];
  };
  paper_decision: NonNullable<AutonomousCandleRefreshRecordRequest["paper_decision"]>;
};

function shouldRecordChartProof(state: Web3TradingState) {
  return state.autonomous_data_freshness_gate.next_refresh_lane === "gecko-ohlcv" ||
    state.autonomous_data_freshness_gate.action === "fetch-candles" ||
    state.autonomous_execution_runway.should_refresh_chart ||
    state.autonomous_signal_noise_trade_decision.should_refresh_chart ||
    state.autonomous_candle_conviction.refresh_required;
}

async function buildChartProofRecord(state: Web3TradingState): Promise<AutonomousCandleRefreshRecordRequest> {
  const target = selectChartProofTarget(state);
  if (!target) {
    throw new Error("No chart-proof target is available from the current market tape.");
  }
  const liveRecord = await tryBuildLiveOhlcvRecord(state, target);
  return liveRecord ?? buildSampleChartProofRecord(state, target);
}

function selectChartProofTarget(state: Web3TradingState): ChartProofTarget | null {
  const serverTarget = state.autonomous_chart_proof_target;
  if (serverTarget.target_symbol || serverTarget.token_id) {
    const targetMarket = state.market.find((item) =>
      item.id === serverTarget.token_id ||
      item.symbol === serverTarget.target_symbol ||
      item.pair_address === serverTarget.pair_address
    );
    if (targetMarket) {
      const position = state.portfolio.open_positions.find((item) => item.token_id === targetMarket.id || item.symbol === targetMarket.symbol) ?? null;
      return { market: targetMarket, position };
    }
  }
  const symbols = [
    state.autonomous_candle_conviction.target_symbol,
    state.autonomous_signal_noise_trade_decision.symbol,
    state.autonomous_command_center_execution.selected_symbol,
    state.autonomous_command_center.primary_symbol,
    state.autonomous_market_evidence_fusion.leader_symbol,
    state.autonomous_order_ticket.symbol,
  ].filter((symbol): symbol is string => Boolean(symbol));
  const market = symbols
    .map((symbol) => state.market.find((item) => item.symbol === symbol))
    .find((item): item is Web3TradingState["market"][number] => Boolean(item)) ?? state.market[0] ?? null;
  if (!market) return null;
  const position = state.portfolio.open_positions.find((item) => item.token_id === market.id || item.symbol === market.symbol) ?? null;
  return { market, position };
}

async function tryBuildLiveOhlcvRecord(
  state: Web3TradingState,
  target: ChartProofTarget,
): Promise<AutonomousCandleRefreshRecordRequest | null> {
  const { market, position } = target;
  if (state.market_source.status !== "live" || market.pair_address.includes("sample")) return null;
  const params = new URLSearchParams({
    provider: "geckoterminal",
    network: market.chain === "ethereum" ? "eth" : market.chain,
    pool: market.pair_address,
    timeframe: "minute",
    aggregate: "1",
    limit: "48",
    token: "base",
    paper: "true",
    cash_usd: state.portfolio.cash_usd.toString(),
    position_usd: Math.max(0, position?.value_usd ?? 0).toString(),
    equity_usd: Math.max(state.portfolio.equity_usd, state.portfolio.cash_usd + state.portfolio.exposure_usd).toString(),
    max_trade_usd: chartProofMaxTradeUsd(state).toString(),
  });

  try {
    const response = await fetch(`/api/web3-ohlcv?${params.toString()}`);
    const payload = (await response.json()) as OhlcvEndpointResponse | { error: string };
    if (!response.ok || "error" in payload) return null;
    const lastPrice = payload.candles[payload.candles.length - 1]?.close ?? market.price_usd;
    return {
      action: "record",
      provider: "geckoterminal",
      source: payload.source,
      symbol: market.symbol,
      pool: market.pair_address,
      network: payload.network,
      timeframe: payload.timeframe,
      candle_count: payload.candles.length,
      last_price_usd: lastPrice,
      fetched_at: payload.fetched_at,
      signal: payload.signal,
      paper_decision: payload.paper_decision,
    };
  } catch {
    return null;
  }
}

function buildSampleChartProofRecord(
  state: Web3TradingState,
  { market, position }: ChartProofTarget,
): AutonomousCandleRefreshRecordRequest {
  const buyTotal = Math.max(1, market.buys_5m + market.sells_5m);
  const buyPressurePct = market.buys_5m / buyTotal * 100;
  const momentumScore = clampNumber(Math.round(50 + market.price_change_5m_pct * 2.5 + market.price_change_1h_pct * 1.1 + market.price_change_6h_pct * 0.35));
  const volumeScore = clampNumber(Math.round(42 + Math.log10(Math.max(1, market.volume_5m_usd)) * 4 + (buyPressurePct - 50) * 0.42));
  const riskScore = clampNumber(Math.round(
    market.risk_flags.length * 17 +
      Math.max(0, -market.price_change_5m_pct) * 4.5 +
      Math.max(0, 55 - buyPressurePct) * 0.75 +
      (market.age_minutes < 60 ? 24 : 0) +
      (market.liquidity_usd < 100_000 ? 24 : 0),
  ));
  const confidence = clampNumber(Math.round(momentumScore * 0.42 + volumeScore * 0.28 + (100 - riskScore) * 0.3));
  const signalAction = sampleChartSignalAction(confidence, momentumScore, riskScore, market.price_change_5m_pct, buyPressurePct, Boolean(position));
  const paperDecision = sampleChartPaperDecision(state, market, position, signalAction, confidence);
  const blockers = [
    ...(riskScore >= 70 ? [`Chart risk is ${riskScore}/100 from local tape volatility, age, liquidity, or flag pressure.`] : []),
    ...(buyPressurePct < 45 ? [`Buy pressure is only ${Math.round(buyPressurePct)}%.`] : []),
    ...(market.risk_flags.length > 0 ? [`Risk flags: ${market.risk_flags.join(", ")}.`] : []),
  ];

  return {
    action: "record",
    provider: "sample",
    source: "local-price-action-tape",
    symbol: market.symbol,
    pool: market.pair_address,
    network: market.chain,
    timeframe: "minute",
    candle_count: 24,
    last_price_usd: market.price_usd,
    fetched_at: new Date().toISOString(),
    signal: {
      action: signalAction,
      confidence,
      momentum_score: momentumScore,
      volume_score: volumeScore,
      risk_score: riskScore,
      review_after_seconds: signalAction === "press" || signalAction === "exit" ? 10 : signalAction === "probe" || signalAction === "trim" ? 15 : 30,
      summary: sampleChartSummary(market.symbol, signalAction, confidence, market.price_change_5m_pct, buyPressurePct, riskScore),
      blockers,
    },
    paper_decision: paperDecision,
  };
}

function sampleChartSignalAction(
  confidence: number,
  momentumScore: number,
  riskScore: number,
  change5mPct: number,
  buyPressurePct: number,
  hasPosition: boolean,
): AutonomousCandleRefreshRecordRequest["signal"]["action"] {
  if (riskScore >= 84 || change5mPct <= -8) return hasPosition ? "exit" : "avoid";
  if (hasPosition && (riskScore >= 68 || change5mPct <= -3.5)) return "trim";
  if (confidence >= 72 && momentumScore >= 68 && change5mPct >= 2.4 && buyPressurePct >= 54) return "press";
  if (confidence >= 58 && momentumScore >= 56 && change5mPct >= 0.7 && buyPressurePct >= 48) return "probe";
  return "hold";
}

function sampleChartPaperDecision(
  state: Web3TradingState,
  market: Web3TradingState["market"][number],
  position: Web3TradingState["portfolio"]["open_positions"][number] | null,
  signalAction: AutonomousCandleRefreshRecordRequest["signal"]["action"],
  confidence: number,
): NonNullable<AutonomousCandleRefreshRecordRequest["paper_decision"]> {
  if (signalAction === "press" || signalAction === "probe") {
    const notional = Math.max(0, Math.min(state.portfolio.cash_usd, chartProofMaxTradeUsd(state), signalAction === "probe" ? 350 : 850));
    return {
      action: notional >= 10 ? "paper-buy" : "paper-block",
      side: notional >= 10 ? "buy" : "hold",
      notional_usd: notional >= 10 ? Math.round(notional) : 0,
      reason: notional >= 10
        ? `${market.symbol} chart proof allows a ${signalAction} paper entry at ${confidence}/100 confidence.`
        : "Paper cash or max-trade cap is too low for a fresh chart-confirmed entry.",
      blockers: notional >= 10 ? [] : ["No paper cash available for chart-confirmed entry."],
    };
  }

  if ((signalAction === "trim" || signalAction === "exit") && position) {
    const notional = Math.max(0, Math.min(position.value_usd, signalAction === "exit" ? position.value_usd : position.value_usd * 0.35));
    return {
      action: notional >= 10 ? "paper-sell" : "paper-hold",
      side: notional >= 10 ? "sell" : "hold",
      notional_usd: Math.round(notional),
      reason: `${market.symbol} chart proof is ${signalAction}; protect the paper wallet before redeploying.`,
      blockers: [],
    };
  }

  return {
    action: signalAction === "avoid" ? "paper-block" : "paper-hold",
    side: "hold",
    notional_usd: 0,
    reason: signalAction === "avoid"
      ? `${market.symbol} chart proof blocks fresh paper buys until the candle setup repairs.`
      : `${market.symbol} chart proof is hold-only; keep watching before spending paper capital.`,
    blockers: signalAction === "avoid" ? ["Chart proof rejected fresh exposure."] : [],
  };
}

function chartProofMaxTradeUsd(state: Web3TradingState) {
  return Math.max(10, Math.min(
    10_000,
    state.autonomous_size_governor.final_size_usd || 0,
    state.autonomous_signal_noise_trade_decision.recommended_size_usd || 0,
    state.autonomous_market_evidence_fusion.max_paper_size_usd || 0,
    state.autonomous_profit_control.max_trade_usd || 0,
    850,
  ));
}

function sampleChartSummary(
  symbol: string,
  action: AutonomousCandleRefreshRecordRequest["signal"]["action"],
  confidence: number,
  change5mPct: number,
  buyPressurePct: number,
  riskScore: number,
) {
  if (action === "press") return `${symbol} chart proof is press-ready: ${confidence}/100 confidence, ${formatPercent(change5mPct)} 5m momentum, and ${Math.round(buyPressurePct)}% buy pressure.`;
  if (action === "probe") return `${symbol} chart proof supports a probe only: ${confidence}/100 confidence with improving short-window flow.`;
  if (action === "trim") return `${symbol} chart proof says trim: risk is ${riskScore}/100 or short-window momentum is fading.`;
  if (action === "exit") return `${symbol} chart proof says exit/protect from fast adverse price action.`;
  if (action === "avoid") return `${symbol} chart proof rejects fresh buys because risk is ${riskScore}/100.`;
  return `${symbol} chart proof is hold-only at ${confidence}/100 confidence.`;
}

export function chooseAutoWatchPlan(state: Web3TradingState): { mode: "cycle" | "sprint" | "minute" | "refresh"; delayMs: number; label: string; reason: string } {
  const throttle = state.autonomous_loop_throttle;
  const throttleDelay = Math.max(3_000, Math.min(45_000, throttle.cadence_seconds * 1_000));
  const loopImpact = state.autonomous_loop_impact_auditor;
  const impactDelay = Math.max(2_000, Math.min(60_000, loopImpact.next_cadence_seconds * 1_000));
  const profitVelocity = state.autonomous_profit_velocity_governor;
  const tickPlan = state.autonomous_tick_plan;
  const tickGovernor = state.autonomous_tick_governor;
  const actionQueueExecution = state.autonomous_action_queue_execution;
  const hasReadyProtectLane = tickPlan.items.some((item) => item.action === "protect-now" && item.status === "ready");
  const hasReadyQueueSell = actionQueueExecution.selected_side === "sell" && actionQueueExecution.paper_trade_ready;
  const hasProtectMinuteLane = hasReadyProtectLane || hasReadyQueueSell;
  const queuedActionCount = Math.max(tickPlan.bundle_action_count, hasReadyQueueSell ? 1 : 0);
  const queuedActionLabel = `${queuedActionCount} queued action${queuedActionCount === 1 ? "" : "s"}`;
  const nextMinuteBudget = Math.max(tickPlan.next_minute_trade_budget_usd, hasReadyQueueSell ? actionQueueExecution.paper_size_usd : 0);
  const canRunMinuteLoop = (
    (profitVelocity.loop_permission === "multi-fill" || profitVelocity.loop_permission === "single-fill" || profitVelocity.loop_permission === "protect-only") &&
    profitVelocity.max_trades_next_minute > 0 &&
    (tickPlan.max_actions_next_minute > 0 || (profitVelocity.loop_permission === "protect-only" && hasProtectMinuteLane)) &&
    tickGovernor.action !== "pause" &&
    (
      (throttle.status !== "blocked" && throttle.status !== "cooldown") ||
      (profitVelocity.loop_permission === "protect-only" && hasProtectMinuteLane)
    )
  );
  if (canRunMinuteLoop && profitVelocity.loop_permission === "protect-only" && hasProtectMinuteLane) {
    return {
      mode: "minute",
      delayMs: Math.max(2_000, Math.min(20_000, tickGovernor.next_tick_seconds * 1_000 || impactDelay)),
      label: "auto protect minute",
      reason: `${profitVelocity.loop_permission.replace("-", " ")} overrides ${loopImpact.status} impact for ready protection: ${profitVelocity.max_trades_next_minute} trades/min max, ${queuedActionLabel}, ${formatCompactCurrency(nextMinuteBudget)} paper budget, ${formatCompactSignedCurrency(profitVelocity.expected_profit_per_minute_usd)}/min modeled edge. Backend loop tick owns the protective action.`,
    };
  }
  if (loopImpact.must_refresh_proof || loopImpact.status === "refresh") {
    return {
      mode: "refresh",
      delayMs: Math.max(2_000, Math.min(18_000, impactDelay)),
      label: "impact refresh",
      reason: `${loopImpact.next_action} Auto watch refreshes route/chart proof before another paper action because loop impact is ${loopImpact.status}.`,
    };
  }
  if (loopImpact.status === "blocked") {
    return {
      mode: "cycle",
      delayMs: Math.max(30_000, Math.min(60_000, impactDelay)),
      label: "impact blocked",
      reason: `${loopImpact.next_action} Auto watch will not increase frequency while loop impact blocks the next paper action.`,
    };
  }
  if (loopImpact.status === "cooldown") {
    return {
      mode: "cycle",
      delayMs: Math.max(20_000, Math.min(60_000, impactDelay)),
      label: "impact cooldown",
      reason: `${loopImpact.next_action} Auto watch slows the backend loop until the last paper impact repairs.`,
    };
  }
  if (loopImpact.status === "protect" || loopImpact.status === "harvest") {
    return {
      mode: "cycle",
      delayMs: Math.max(3_000, Math.min(18_000, impactDelay || throttleDelay)),
      label: loopImpact.status === "harvest" ? "impact harvest" : "impact protect",
      reason: `${loopImpact.next_action} Auto watch routes the next backend tick through ${loopImpact.action.replace("-", " ")} before fresh exposure.`,
    };
  }
  if (loopImpact.must_reduce_frequency || loopImpact.status === "tighten") {
    return {
      mode: "cycle",
      delayMs: Math.max(10_000, Math.min(30_000, impactDelay || throttleDelay)),
      label: "impact tighten",
      reason: `${loopImpact.next_action} Auto watch cuts cadence because the latest paper loop impact is ${loopImpact.impact_score}/100.`,
    };
  }
  if (canRunMinuteLoop) {
    return {
      mode: "minute",
      delayMs: loopImpact.status === "compound" || loopImpact.status === "continue"
        ? Math.max(2_000, Math.min(12_000, impactDelay, tickGovernor.next_tick_seconds * 1_000 || impactDelay))
        : Math.max(2_000, Math.min(20_000, tickGovernor.next_tick_seconds * 1_000)),
      label: profitVelocity.loop_permission === "multi-fill" ? "auto minute" : profitVelocity.loop_permission === "protect-only" ? "auto protect minute" : "auto single minute",
      reason: `${profitVelocity.loop_permission.replace("-", " ")} from profit velocity with ${loopImpact.status} impact: ${profitVelocity.max_trades_next_minute} trades/min max, ${queuedActionLabel}, ${formatCompactCurrency(nextMinuteBudget)} paper budget, ${formatCompactSignedCurrency(profitVelocity.expected_profit_per_minute_usd)}/min modeled edge. Backend loop tick owns the trade/protect action.`,
    };
  }
  if (tickGovernor.should_refresh_market_data || state.autonomous_data_freshness_gate.status === "refresh" || state.autonomous_data_freshness_gate.action === "fetch-candles") {
    return {
      mode: "refresh",
      delayMs: Math.max(2_000, Math.min(15_000, tickGovernor.next_tick_seconds * 1_000 || throttleDelay)),
      label: "auto refresh",
      reason: `${state.autonomous_data_freshness_gate.next_action} Auto watch will refresh read-only ${state.market_source.label} evidence before another paper action.`,
    };
  }
  if (throttle.status === "sprint") {
    return {
      mode: "sprint",
      delayMs: loopImpact.status === "compound" || loopImpact.status === "continue"
        ? Math.max(2_000, Math.min(throttleDelay, impactDelay))
        : throttleDelay,
      label: "auto sprint",
      reason: `${throttle.action.replace("-", " ")} from loop throttle with ${loopImpact.status} impact: ${throttle.ticks} ticks, ${throttle.max_total_fills} fills, ${throttle.size_multiplier}x size; backend loop tick owns the trade/protect action; next check in ${Math.round(Math.max(2_000, Math.min(throttleDelay, impactDelay)) / 1_000)}s.`,
    };
  }
  if (throttle.status === "cycle" || throttle.status === "protect") {
    return {
      mode: "cycle",
      delayMs: throttleDelay,
      label: throttle.status === "protect" ? "auto protect" : "auto cycle",
      reason: `${throttle.action.replace("-", " ")} from loop throttle: ${throttle.ticks} ticks, ${throttle.max_total_fills} fills, ${throttle.size_multiplier}x size; backend loop tick owns the trade/protect action; next check in ${throttle.cadence_seconds}s.`,
    };
  }
  if (throttle.status === "refresh") {
    return {
      mode: "refresh",
      delayMs: throttleDelay,
      label: "auto refresh",
      reason: `${throttle.summary} Auto watch will refresh source evidence before another local paper action.`,
    };
  }
  if (throttle.status === "cooldown" || throttle.status === "blocked") {
    return {
      mode: "cycle",
      delayMs: throttleDelay,
      label: throttle.status === "blocked" ? "auto blocked" : "auto cooldown",
      reason: throttle.next_action,
    };
  }

  const envelope = state.autonomous_run_envelope;
  const guard = state.autonomous_profit_run_guard;
  const fusion = state.autonomous_market_evidence_fusion;
  const policy = state.autonomous_policy_optimizer;
  const cadenceSeconds = Math.max(3, Math.min(20, Math.round(Math.min(envelope.cadence_seconds, guard.cadence_seconds || envelope.cadence_seconds))));
  const canSprint = (
    (envelope.keep_running || guard.can_keep_running || guard.can_increase_cadence) &&
    (fusion.can_trade || guard.can_increase_cadence || policy.status === "attack") &&
    guard.status !== "blocked" &&
    envelope.status !== "blocked" &&
    envelope.max_session_fills >= 2
  );

  if (canSprint) {
    return {
      mode: "sprint",
      delayMs: cadenceSeconds * 1_000,
      label: "auto sprint",
      reason: `${envelope.action.replace("-", " ")} with ${guard.action.replace("-", " ")}; backend loop tick owns the trade/protect action; next check in ${cadenceSeconds}s.`,
    };
  }

  return {
    mode: "cycle",
    delayMs: Math.max(5_000, cadenceSeconds * 1_000),
    label: "auto cycle",
    reason: `${envelope.action.replace("-", " ")} / ${guard.action.replace("-", " ")} keeps the loop in bounded cycle mode; backend loop tick owns the trade/protect action.`,
  };
}

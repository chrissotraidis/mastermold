import { NextResponse } from "next/server";
import {
  getWeb3TradingStateAsync,
  isExecutionMode,
  isSignerSimulationNetwork,
  isTradingAccountMode,
  isTradingMarketSource,
  isTradingScenario,
  type AutonomousBurstRunRequest,
  type AutonomousCandleRefreshRecordRequest,
  type AutonomousDaemonLeaseRequest,
  type AutonomousLoopTickRequest,
  type AutonomousSessionRunRequest,
  type ExecutionUpdate,
  type OnchainEventIngestRequest,
  type PortfolioSweepRequest,
  type RouteRefreshRequest,
  type SignedTransactionRelayRequest,
  type TriggerOrderHistoryFilter,
  type TriggerOrderRequest,
  type TriggerReconciliationPatchRequest,
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
  type Web3TradingState,
} from "@/src/db/web3-trading";

type TradingRequest = {
  scenario?: TradingScenario;
  cycles?: number;
  source?: TradingMarketSource;
  account?: TradingAccountMode;
  reset?: boolean;
  advance?: boolean;
  daemon?: boolean;
  drill?: boolean;
  execution?: ExecutionUpdate;
  relay?: SignedTransactionRelayRequest;
  trigger_order?: TriggerOrderRequest;
  trigger_history?: TriggerOrderHistoryFilter;
  trigger_reconcile?: TriggerReconciliationPatchRequest;
  route_refresh?: RouteRefreshRequest;
  onchain_events?: OnchainEventIngestRequest;
  portfolio_sweep?: PortfolioSweepRequest;
  autonomous_burst?: AutonomousBurstRunRequest;
  autonomous_session?: AutonomousSessionRunRequest;
  autonomous_loop?: AutonomousLoopTickRequest;
  daemon_lease?: AutonomousDaemonLeaseRequest;
  candle_refresh?: AutonomousCandleRefreshRecordRequest;
};

export async function GET(request: Request): Promise<NextResponse<Web3TradingState | { error: string }>> {
  const search = new URL(request.url).searchParams;
  const scenarioParam = search.get("scenario") ?? "base";
  const cyclesParam = search.get("cycles") ?? "0";
  const sourceParam = search.get("source") ?? "sample";
  const accountParam = search.get("account") ?? "persistent";
  const resetParam = search.get("reset") === "true";
  const parsed = parseTradingRequest({
    scenario: scenarioParam,
    cycles: Number(cyclesParam),
    source: sourceParam,
    account: accountParam,
    reset: resetParam,
  }, false);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(await getWeb3TradingStateAsync(parsed.value));
}

export async function POST(request: Request): Promise<NextResponse<Web3TradingState | { error: string }>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 422 });
  }

  const parsed = parseTradingRequest(body, true);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(await getWeb3TradingStateAsync(parsed.value));
}

function parseTradingRequest(value: unknown, defaultAdvance: boolean):
  | { ok: true; value: TradingRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Request must be an object." };
  }

  const record = value as Record<string, unknown>;
  const scenario = typeof record.scenario === "string" ? record.scenario : "base";
  const cycles = record.cycles === undefined ? 0 : Number(record.cycles);
  const source = typeof record.source === "string" ? record.source : "sample";
  const account = typeof record.account === "string" ? record.account : "persistent";
  const reset = record.reset === true;
  const advance = record.advance === undefined ? defaultAdvance : record.advance === true;
  const daemon = record.daemon === true;
  const drill = record.drill === true;
  const execution = record.execution === undefined ? undefined : parseExecutionUpdate(record.execution);
  const relay = record.relay === undefined ? undefined : parseSignedRelayRequest(record.relay);
  const triggerOrder = record.trigger_order === undefined ? undefined : parseTriggerOrderRequest(record.trigger_order);
  const triggerHistory = record.trigger_history === undefined ? undefined : parseTriggerHistoryFilter(record.trigger_history);
  const triggerReconcile = record.trigger_reconcile === undefined ? undefined : parseTriggerReconcileRequest(record.trigger_reconcile);
  const routeRefresh = record.route_refresh === undefined ? undefined : parseRouteRefreshRequest(record.route_refresh);
  const onchainEvents = record.onchain_events === undefined ? undefined : parseOnchainEventIngestRequest(record.onchain_events);
  const portfolioSweep = record.portfolio_sweep === undefined ? undefined : parsePortfolioSweepRequest(record.portfolio_sweep);
  const autonomousBurst = record.autonomous_burst === undefined ? undefined : parseAutonomousBurstRunRequest(record.autonomous_burst);
  const autonomousSession = record.autonomous_session === undefined ? undefined : parseAutonomousSessionRunRequest(record.autonomous_session);
  const autonomousLoop = record.autonomous_loop === undefined ? undefined : parseAutonomousLoopTickRequest(record.autonomous_loop);
  const daemonLease = record.daemon_lease === undefined ? undefined : parseAutonomousDaemonLeaseRequest(record.daemon_lease);
  const candleRefresh = record.candle_refresh === undefined ? undefined : parseCandleRefreshRecordRequest(record.candle_refresh);

  if (!isTradingScenario(scenario)) {
    return { ok: false, error: "scenario must be base, breakout, or rug-risk." };
  }

  if (!isTradingMarketSource(source)) {
    return { ok: false, error: "source must be sample or live-dex." };
  }

  if (!isTradingAccountMode(account)) {
    return { ok: false, error: "account must be ephemeral or persistent." };
  }

  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 24) {
    return { ok: false, error: "cycles must be an integer from 0 to 24." };
  }

  if (record.advance !== undefined && typeof record.advance !== "boolean") {
    return { ok: false, error: "advance must be a boolean." };
  }

  if (record.daemon !== undefined && typeof record.daemon !== "boolean") {
    return { ok: false, error: "daemon must be a boolean." };
  }

  if (record.drill !== undefined && typeof record.drill !== "boolean") {
    return { ok: false, error: "drill must be a boolean." };
  }

  if (execution && !execution.ok) {
    return { ok: false, error: execution.error };
  }

  if (relay && !relay.ok) {
    return { ok: false, error: relay.error };
  }

  if (triggerOrder && !triggerOrder.ok) {
    return { ok: false, error: triggerOrder.error };
  }

  if (triggerHistory && !triggerHistory.ok) {
    return { ok: false, error: triggerHistory.error };
  }

  if (triggerReconcile && !triggerReconcile.ok) {
    return { ok: false, error: triggerReconcile.error };
  }

  if (routeRefresh && !routeRefresh.ok) {
    return { ok: false, error: routeRefresh.error };
  }

  if (onchainEvents && !onchainEvents.ok) {
    return { ok: false, error: onchainEvents.error };
  }

  if (portfolioSweep && !portfolioSweep.ok) {
    return { ok: false, error: portfolioSweep.error };
  }

  if (autonomousBurst && !autonomousBurst.ok) {
    return { ok: false, error: autonomousBurst.error };
  }

  if (autonomousSession && !autonomousSession.ok) {
    return { ok: false, error: autonomousSession.error };
  }

  if (autonomousLoop && !autonomousLoop.ok) {
    return { ok: false, error: autonomousLoop.error };
  }

  if (daemonLease && !daemonLease.ok) {
    return { ok: false, error: daemonLease.error };
  }

  if (candleRefresh && !candleRefresh.ok) {
    return { ok: false, error: candleRefresh.error };
  }

  return {
    ok: true,
    value: {
      scenario,
      cycles,
      source,
      account,
      reset,
      advance,
      daemon,
      drill,
      execution: execution?.value,
      relay: relay?.value,
      trigger_order: triggerOrder?.value,
      trigger_history: triggerHistory?.value,
      trigger_reconcile: triggerReconcile?.value,
      route_refresh: routeRefresh?.value,
      onchain_events: onchainEvents?.value,
      portfolio_sweep: portfolioSweep?.value,
      autonomous_burst: autonomousBurst?.value,
      autonomous_session: autonomousSession?.value,
      autonomous_loop: autonomousLoop?.value,
      daemon_lease: daemonLease?.value,
      candle_refresh: candleRefresh?.value,
    },
  };
}

function parseCandleRefreshRecordRequest(value: unknown):
  | { ok: true; value: AutonomousCandleRefreshRecordRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "candle_refresh must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (record.action !== "record") return { ok: false, error: "candle_refresh.action must be record." };
  if (record.provider !== undefined && record.provider !== "geckoterminal" && record.provider !== "sample" && record.provider !== "unknown") {
    return { ok: false, error: "candle_refresh.provider must be geckoterminal, sample, or unknown." };
  }
  if (record.timeframe !== undefined && record.timeframe !== "minute" && record.timeframe !== "hour" && record.timeframe !== "day") {
    return { ok: false, error: "candle_refresh.timeframe must be minute, hour, or day." };
  }
  const symbol = typeof record.symbol === "string" ? record.symbol.trim() : "";
  if (symbol.length < 1 || symbol.length > 24) return { ok: false, error: "candle_refresh.symbol must be 1 to 24 characters." };
  const candleCount = Number(record.candle_count);
  if (!Number.isInteger(candleCount) || candleCount < 0 || candleCount > 500) {
    return { ok: false, error: "candle_refresh.candle_count must be an integer from 0 to 500." };
  }
  const signal = parseCandleRefreshSignal(record.signal);
  if (!signal.ok) return signal;
  const paperDecision = record.paper_decision === undefined ? undefined : parseCandleRefreshPaperDecision(record.paper_decision);
  if (paperDecision && !paperDecision.ok) return paperDecision;
  const lastPrice = record.last_price_usd === undefined ? undefined : Number(record.last_price_usd);
  if (lastPrice !== undefined && (!Number.isFinite(lastPrice) || lastPrice < 0 || lastPrice > 1_000_000)) {
    return { ok: false, error: "candle_refresh.last_price_usd must be from 0 to 1000000 when provided." };
  }

  return {
    ok: true,
    value: {
      action: "record",
      provider: record.provider === "geckoterminal" || record.provider === "sample" || record.provider === "unknown" ? record.provider : undefined,
      source: typeof record.source === "string" ? record.source.slice(0, 120) : undefined,
      symbol,
      pool: typeof record.pool === "string" ? record.pool.slice(0, 180) : undefined,
      network: typeof record.network === "string" ? record.network.slice(0, 40) : undefined,
      timeframe: record.timeframe === "minute" || record.timeframe === "hour" || record.timeframe === "day" ? record.timeframe : undefined,
      candle_count: candleCount,
      last_price_usd: lastPrice,
      fetched_at: typeof record.fetched_at === "string" ? record.fetched_at : undefined,
      signal: signal.value,
      paper_decision: paperDecision?.value,
    },
  };
}

function parseCandleRefreshSignal(value: unknown):
  | { ok: true; value: AutonomousCandleRefreshRecordRequest["signal"] }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "candle_refresh.signal must be an object." };
  const record = value as Record<string, unknown>;
  const actions = ["press", "probe", "hold", "trim", "exit", "avoid", "none"];
  if (!actions.includes(String(record.action))) return { ok: false, error: "candle_refresh.signal.action is invalid." };
  const confidence = boundedScore(record.confidence, "candle_refresh.signal.confidence");
  if (!confidence.ok) return confidence;
  const momentum = boundedScore(record.momentum_score, "candle_refresh.signal.momentum_score");
  if (!momentum.ok) return momentum;
  const volume = boundedScore(record.volume_score, "candle_refresh.signal.volume_score");
  if (!volume.ok) return volume;
  const risk = boundedScore(record.risk_score, "candle_refresh.signal.risk_score");
  if (!risk.ok) return risk;
  const reviewAfterSeconds = Number(record.review_after_seconds);
  if (!Number.isFinite(reviewAfterSeconds) || reviewAfterSeconds < 1 || reviewAfterSeconds > 3600) {
    return { ok: false, error: "candle_refresh.signal.review_after_seconds must be from 1 to 3600." };
  }
  if (typeof record.summary !== "string" || record.summary.trim().length < 1) {
    return { ok: false, error: "candle_refresh.signal.summary must be a non-empty string." };
  }
  const blockers = Array.isArray(record.blockers)
    ? record.blockers.filter((item): item is string => typeof item === "string").slice(0, 8)
    : undefined;
  return {
    ok: true,
    value: {
      action: record.action as AutonomousCandleRefreshRecordRequest["signal"]["action"],
      confidence: confidence.value,
      momentum_score: momentum.value,
      volume_score: volume.value,
      risk_score: risk.value,
      review_after_seconds: reviewAfterSeconds,
      summary: record.summary.trim().slice(0, 300),
      blockers,
    },
  };
}

function parseCandleRefreshPaperDecision(value: unknown):
  | { ok: true; value: NonNullable<AutonomousCandleRefreshRecordRequest["paper_decision"]> }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "candle_refresh.paper_decision must be an object." };
  const record = value as Record<string, unknown>;
  if (record.action !== "paper-buy" && record.action !== "paper-sell" && record.action !== "paper-hold" && record.action !== "paper-block" && record.action !== "none") {
    return { ok: false, error: "candle_refresh.paper_decision.action is invalid." };
  }
  if (record.side !== "buy" && record.side !== "sell" && record.side !== "hold") {
    return { ok: false, error: "candle_refresh.paper_decision.side must be buy, sell, or hold." };
  }
  const notional = Number(record.notional_usd);
  if (!Number.isFinite(notional) || notional < 0 || notional > 100_000) {
    return { ok: false, error: "candle_refresh.paper_decision.notional_usd must be from 0 to 100000." };
  }
  if (typeof record.reason !== "string" || record.reason.trim().length < 1) {
    return { ok: false, error: "candle_refresh.paper_decision.reason must be a non-empty string." };
  }
  const blockers = Array.isArray(record.blockers)
    ? record.blockers.filter((item): item is string => typeof item === "string").slice(0, 8)
    : undefined;
  return {
    ok: true,
    value: {
      action: record.action,
      side: record.side,
      notional_usd: notional,
      reason: record.reason.trim().slice(0, 300),
      blockers,
    },
  };
}

function boundedScore(value: unknown, label: string):
  | { ok: true; value: number }
  | { ok: false; error: string } {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return { ok: false, error: `${label} must be from 0 to 100.` };
  }
  return { ok: true, value: score };
}

function parseAutonomousLoopTickRequest(value: unknown):
  | { ok: true; value: AutonomousLoopTickRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "autonomous_loop must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (record.action !== "tick") {
    return { ok: false, error: "autonomous_loop.action must be tick." };
  }

  return { ok: true, value: { action: "tick" } };
}

function parseAutonomousDaemonLeaseRequest(value: unknown):
  | { ok: true; value: AutonomousDaemonLeaseRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "daemon_lease must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (typeof record.lease_id !== "string" || record.lease_id.trim().length < 8 || record.lease_id.trim().length > 160) {
    return { ok: false, error: "daemon_lease.lease_id must be a string from 8 to 160 characters." };
  }

  if (typeof record.runner_id !== "string" || record.runner_id.trim().length < 3 || record.runner_id.trim().length > 80) {
    return { ok: false, error: "daemon_lease.runner_id must be a string from 3 to 80 characters." };
  }

  if (record.request_id !== undefined && (typeof record.request_id !== "string" || record.request_id.trim().length < 8 || record.request_id.trim().length > 180)) {
    return { ok: false, error: "daemon_lease.request_id must be a string from 8 to 180 characters." };
  }

  if (record.issued_at !== undefined && (typeof record.issued_at !== "string" || !Number.isFinite(Date.parse(record.issued_at)))) {
    return { ok: false, error: "daemon_lease.issued_at must be a valid ISO timestamp." };
  }

  return {
    ok: true,
    value: {
      lease_id: record.lease_id.trim(),
      runner_id: record.runner_id.trim(),
      ...(record.request_id === undefined ? {} : { request_id: record.request_id.trim() }),
      ...(record.issued_at === undefined ? {} : { issued_at: record.issued_at }),
    },
  };
}

function parseRouteRefreshRequest(value: unknown):
  | { ok: true; value: RouteRefreshRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "route_refresh must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (record.action !== "request-quote") {
    return { ok: false, error: "route_refresh.action must be request-quote." };
  }

  return { ok: true, value: { action: "request-quote" } };
}

function parseAutonomousSessionRunRequest(value: unknown):
  | { ok: true; value: AutonomousSessionRunRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "autonomous_session must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (record.action !== "run") {
    return { ok: false, error: "autonomous_session.action must be run." };
  }
  if (record.protect_book !== undefined && typeof record.protect_book !== "boolean") {
    return { ok: false, error: "autonomous_session.protect_book must be a boolean." };
  }
  if (record.policy_mode !== undefined && record.policy_mode !== "auto" && record.policy_mode !== "manual") {
    return { ok: false, error: "autonomous_session.policy_mode must be auto or manual." };
  }

  const ticks = record.ticks === undefined ? undefined : Number(record.ticks);
  const maxProtectiveSells = record.max_protective_sells === undefined ? undefined : Number(record.max_protective_sells);
  const minReleaseUsd = record.min_release_usd === undefined ? undefined : Number(record.min_release_usd);
  const maxTotalFills = record.max_total_fills === undefined ? undefined : Number(record.max_total_fills);
  if (ticks !== undefined && (!Number.isInteger(ticks) || ticks < 1 || ticks > 12)) {
    return { ok: false, error: "autonomous_session.ticks must be an integer from 1 to 12." };
  }
  if (maxProtectiveSells !== undefined && (!Number.isInteger(maxProtectiveSells) || maxProtectiveSells < 1 || maxProtectiveSells > 6)) {
    return { ok: false, error: "autonomous_session.max_protective_sells must be an integer from 1 to 6." };
  }
  if (minReleaseUsd !== undefined && (!Number.isFinite(minReleaseUsd) || minReleaseUsd < 10 || minReleaseUsd > 10_000)) {
    return { ok: false, error: "autonomous_session.min_release_usd must be from 10 to 10000." };
  }
  if (maxTotalFills !== undefined && (!Number.isInteger(maxTotalFills) || maxTotalFills < 1 || maxTotalFills > 24)) {
    return { ok: false, error: "autonomous_session.max_total_fills must be an integer from 1 to 24." };
  }

  return {
    ok: true,
    value: {
      action: "run",
      policy_mode: record.policy_mode === undefined ? undefined : record.policy_mode,
      ticks,
      protect_book: record.protect_book === undefined ? undefined : record.protect_book,
      max_protective_sells: maxProtectiveSells,
      min_release_usd: minReleaseUsd,
      max_total_fills: maxTotalFills,
    },
  };
}

function parseAutonomousBurstRunRequest(value: unknown):
  | { ok: true; value: AutonomousBurstRunRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "autonomous_burst must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (record.action !== "run") {
    return { ok: false, error: "autonomous_burst.action must be run." };
  }
  if (record.protect_book !== undefined && typeof record.protect_book !== "boolean") {
    return { ok: false, error: "autonomous_burst.protect_book must be a boolean." };
  }
  if (record.advance_paper !== undefined && typeof record.advance_paper !== "boolean") {
    return { ok: false, error: "autonomous_burst.advance_paper must be a boolean." };
  }

  const maxProtectiveSells = record.max_protective_sells === undefined ? undefined : Number(record.max_protective_sells);
  const minReleaseUsd = record.min_release_usd === undefined ? undefined : Number(record.min_release_usd);
  const maxChildFills = record.max_child_fills === undefined ? undefined : Number(record.max_child_fills);
  if (maxProtectiveSells !== undefined && (!Number.isInteger(maxProtectiveSells) || maxProtectiveSells < 1 || maxProtectiveSells > 6)) {
    return { ok: false, error: "autonomous_burst.max_protective_sells must be an integer from 1 to 6." };
  }
  if (minReleaseUsd !== undefined && (!Number.isFinite(minReleaseUsd) || minReleaseUsd < 10 || minReleaseUsd > 10_000)) {
    return { ok: false, error: "autonomous_burst.min_release_usd must be from 10 to 10000." };
  }
  if (maxChildFills !== undefined && (!Number.isInteger(maxChildFills) || maxChildFills < 0 || maxChildFills > 6)) {
    return { ok: false, error: "autonomous_burst.max_child_fills must be an integer from 0 to 6." };
  }

  return {
    ok: true,
    value: {
      action: "run",
      protect_book: record.protect_book === undefined ? undefined : record.protect_book,
      advance_paper: record.advance_paper === undefined ? undefined : record.advance_paper,
      max_protective_sells: maxProtectiveSells,
      min_release_usd: minReleaseUsd,
      max_child_fills: maxChildFills,
    },
  };
}

function parsePortfolioSweepRequest(value: unknown):
  | { ok: true; value: PortfolioSweepRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "portfolio_sweep must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (record.action !== "apply") {
    return { ok: false, error: "portfolio_sweep.action must be apply." };
  }

  const maxTrades = record.max_trades === undefined ? undefined : Number(record.max_trades);
  const minReleaseUsd = record.min_release_usd === undefined ? undefined : Number(record.min_release_usd);
  if (maxTrades !== undefined && (!Number.isInteger(maxTrades) || maxTrades < 1 || maxTrades > 6)) {
    return { ok: false, error: "portfolio_sweep.max_trades must be an integer from 1 to 6." };
  }
  if (minReleaseUsd !== undefined && (!Number.isFinite(minReleaseUsd) || minReleaseUsd < 10 || minReleaseUsd > 10_000)) {
    return { ok: false, error: "portfolio_sweep.min_release_usd must be from 10 to 10000." };
  }

  return {
    ok: true,
    value: {
      action: "apply",
      max_trades: maxTrades,
      min_release_usd: minReleaseUsd,
    },
  };
}

function parseOnchainEventIngestRequest(value: unknown):
  | { ok: true; value: OnchainEventIngestRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "onchain_events must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (
    record.source !== undefined &&
    record.source !== "helius-webhook" &&
    record.source !== "helius-history" &&
    record.source !== "manual"
  ) {
    return { ok: false, error: "onchain_events.source must be helius-webhook, helius-history, or manual." };
  }

  if (!Array.isArray(record.events)) {
    return { ok: false, error: "onchain_events.events must be an array." };
  }

  if (record.events.length < 1 || record.events.length > 25) {
    return { ok: false, error: "onchain_events.events must contain 1 to 25 events." };
  }

  if (record.events.some((event) => !event || typeof event !== "object")) {
    return { ok: false, error: "onchain_events.events entries must be objects." };
  }

  return {
    ok: true,
    value: {
      source: record.source === "helius-webhook" || record.source === "helius-history" || record.source === "manual"
        ? record.source
        : undefined,
      events: record.events,
    },
  };
}

function parseExecutionUpdate(value: unknown):
  | { ok: true; value: ExecutionUpdate }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "execution must be an object." };
  }

  const record = value as Record<string, unknown>;
  const update: ExecutionUpdate = {};

  if (record.mode !== undefined) {
    if (typeof record.mode !== "string" || !isExecutionMode(record.mode)) {
      return { ok: false, error: "execution.mode must be paper or dry-run." };
    }
    update.mode = record.mode;
  }

  if (record.kill_switch !== undefined) {
    if (typeof record.kill_switch !== "boolean") {
      return { ok: false, error: "execution.kill_switch must be a boolean." };
    }
    update.kill_switch = record.kill_switch;
  }

  if (record.wallet_public_key !== undefined) {
    if (record.wallet_public_key !== null && typeof record.wallet_public_key !== "string") {
      return { ok: false, error: "execution.wallet_public_key must be a string or null." };
    }
    update.wallet_public_key = record.wallet_public_key;
  }

  if (record.signer_simulation_enabled !== undefined) {
    if (typeof record.signer_simulation_enabled !== "boolean") {
      return { ok: false, error: "execution.signer_simulation_enabled must be a boolean." };
    }
    update.signer_simulation_enabled = record.signer_simulation_enabled;
  }

  if (record.signer_session_label !== undefined) {
    if (typeof record.signer_session_label !== "string" || record.signer_session_label.trim().length === 0) {
      return { ok: false, error: "execution.signer_session_label must be a non-empty string." };
    }
    update.signer_session_label = record.signer_session_label;
  }

  if (record.signer_network !== undefined) {
    if (!isSignerSimulationNetwork(record.signer_network)) {
      return { ok: false, error: "execution.signer_network must be devnet or localnet." };
    }
    update.signer_network = record.signer_network;
  }

  for (const key of ["max_trade_usd", "daily_spend_cap_usd", "max_slippage_bps"] as const) {
    if (record[key] === undefined) continue;
    const number = Number(record[key]);
    if (!Number.isFinite(number) || number <= 0) {
      return { ok: false, error: `execution.${key} must be greater than 0.` };
    }
    if (key === "max_slippage_bps" && (!Number.isInteger(number) || number > 2_000)) {
      return { ok: false, error: "execution.max_slippage_bps must be an integer from 1 to 2000." };
    }
    update[key] = number;
  }

  if (
    typeof update.max_trade_usd === "number" &&
    typeof update.daily_spend_cap_usd === "number" &&
    update.max_trade_usd > update.daily_spend_cap_usd
  ) {
    return { ok: false, error: "execution.max_trade_usd cannot exceed execution.daily_spend_cap_usd." };
  }

  return { ok: true, value: update };
}

function parseSignedRelayRequest(value: unknown):
  | { ok: true; value: SignedTransactionRelayRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "relay must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (typeof record.signed_transaction !== "string" || record.signed_transaction.trim().length === 0) {
    return { ok: false, error: "relay.signed_transaction must be a non-empty base64 string." };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(record.signed_transaction.trim())) {
    return { ok: false, error: "relay.signed_transaction must be base64 encoded." };
  }
  if (record.plan_id !== undefined && typeof record.plan_id !== "string") {
    return { ok: false, error: "relay.plan_id must be a string when provided." };
  }
  if (record.request_id !== undefined && typeof record.request_id !== "string") {
    return { ok: false, error: "relay.request_id must be a string when provided." };
  }
  if (record.last_valid_block_height !== undefined && typeof record.last_valid_block_height !== "string") {
    return { ok: false, error: "relay.last_valid_block_height must be a string when provided." };
  }
  if (
    record.route !== undefined &&
    record.route !== "jupiter-swap-v2" &&
    record.route !== "solana-rpc"
  ) {
    return { ok: false, error: "relay.route must be jupiter-swap-v2 or solana-rpc." };
  }

  return {
    ok: true,
    value: {
      signed_transaction: record.signed_transaction.trim(),
      plan_id: typeof record.plan_id === "string" ? record.plan_id : undefined,
      request_id: typeof record.request_id === "string" ? record.request_id : undefined,
      last_valid_block_height: typeof record.last_valid_block_height === "string" ? record.last_valid_block_height : undefined,
      route: record.route === "jupiter-swap-v2" || record.route === "solana-rpc" ? record.route : undefined,
    },
  };
}

function parseTriggerOrderRequest(value: unknown):
  | { ok: true; value: TriggerOrderRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "trigger_order must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (record.action !== "craft-deposit" && record.action !== "create-order") {
    return { ok: false, error: "trigger_order.action must be craft-deposit or create-order." };
  }
  if (record.plan_id !== undefined && typeof record.plan_id !== "string") {
    return { ok: false, error: "trigger_order.plan_id must be a string when provided." };
  }
  if (record.deposit_request_id !== undefined && typeof record.deposit_request_id !== "string") {
    return { ok: false, error: "trigger_order.deposit_request_id must be a string when provided." };
  }
  if (record.deposit_signed_tx !== undefined) {
    if (typeof record.deposit_signed_tx !== "string" || record.deposit_signed_tx.trim().length === 0) {
      return { ok: false, error: "trigger_order.deposit_signed_tx must be a non-empty base64 string." };
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(record.deposit_signed_tx.trim())) {
      return { ok: false, error: "trigger_order.deposit_signed_tx must be base64 encoded." };
    }
  }
  if (record.action === "create-order" && typeof record.deposit_request_id !== "string") {
    return { ok: false, error: "trigger_order.deposit_request_id is required for create-order." };
  }
  if (record.action === "create-order" && typeof record.deposit_signed_tx !== "string") {
    return { ok: false, error: "trigger_order.deposit_signed_tx is required for create-order." };
  }

  return {
    ok: true,
    value: {
      action: record.action,
      plan_id: typeof record.plan_id === "string" ? record.plan_id : undefined,
      deposit_request_id: typeof record.deposit_request_id === "string" ? record.deposit_request_id : undefined,
      deposit_signed_tx: typeof record.deposit_signed_tx === "string" ? record.deposit_signed_tx.trim() : undefined,
    },
  };
}

function parseTriggerHistoryFilter(value: unknown):
  | { ok: true; value: TriggerOrderHistoryFilter }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "trigger_history must be an object." };
  }

  const record = value as Record<string, unknown>;
  const filter: TriggerOrderHistoryFilter = {};

  if (record.state !== undefined) {
    if (record.state !== "active" && record.state !== "past") {
      return { ok: false, error: "trigger_history.state must be active or past." };
    }
    filter.state = record.state;
  }
  if (record.mint !== undefined) {
    if (typeof record.mint !== "string" || record.mint.trim().length === 0) {
      return { ok: false, error: "trigger_history.mint must be a non-empty string when provided." };
    }
    filter.mint = record.mint.trim();
  }
  if (record.limit !== undefined) {
    const limit = Number(record.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return { ok: false, error: "trigger_history.limit must be an integer from 1 to 100." };
    }
    filter.limit = limit;
  }
  if (record.offset !== undefined) {
    const offset = Number(record.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      return { ok: false, error: "trigger_history.offset must be a non-negative integer." };
    }
    filter.offset = offset;
  }
  if (record.sort !== undefined) {
    if (record.sort !== "updated_at" && record.sort !== "created_at" && record.sort !== "expires_at") {
      return { ok: false, error: "trigger_history.sort must be updated_at, created_at, or expires_at." };
    }
    filter.sort = record.sort;
  }
  if (record.dir !== undefined) {
    if (record.dir !== "asc" && record.dir !== "desc") {
      return { ok: false, error: "trigger_history.dir must be asc or desc." };
    }
    filter.dir = record.dir;
  }

  return { ok: true, value: filter };
}

function parseTriggerReconcileRequest(value: unknown):
  | { ok: true; value: TriggerReconciliationPatchRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "trigger_reconcile must be an object." };
  }
  const record = value as Record<string, unknown>;
  if (record.action !== "apply") {
    return { ok: false, error: "trigger_reconcile.action must be apply." };
  }
  if (record.order_ids !== undefined) {
    if (!Array.isArray(record.order_ids) || record.order_ids.some((item) => typeof item !== "string" || item.trim().length === 0)) {
      return { ok: false, error: "trigger_reconcile.order_ids must be an array of non-empty strings when provided." };
    }
  }
  return {
    ok: true,
    value: {
      action: "apply",
      order_ids: Array.isArray(record.order_ids) ? record.order_ids.map((item) => item.trim()) : undefined,
    },
  };
}

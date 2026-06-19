#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runWeb3AutonomousDaemon } from "./web3-autonomous-daemon.mjs";

const DEFAULT_BASE_URL = "http://localhost:4010";
const FORWARD_SCENARIOS = ["base", "breakout", "rug-risk"];

export function parseForwardRunArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_FORWARD_SCENARIO ?? "breakout", [...FORWARD_SCENARIOS, "all"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_FORWARD_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(flags.get("runner-id") ?? env.WEB3_FORWARD_RUNNER_ID ?? "forward-run-daemon", "forward-run-daemon", 80),
    runs: boundedInteger(flags.get("runs") ?? env.WEB3_FORWARD_RUNS, 1, 1, 30),
    ticks: boundedInteger(flags.get("ticks") ?? env.WEB3_FORWARD_TICKS, 6, 1, 120),
    intervalMs: boundedInteger(flags.get("interval-ms") ?? env.WEB3_FORWARD_INTERVAL_MS, 0, 0, 120_000),
    minNetPnlUsd: boundedNumber(flags.get("min-net-pnl") ?? env.WEB3_FORWARD_MIN_NET_PNL_USD, 0, -1_000_000, 1_000_000),
    minHitRatePct: boundedNumber(flags.get("min-hit-rate-pct") ?? env.WEB3_FORWARD_MIN_HIT_RATE_PCT, 100, 0, 100),
    minDeployedAlphaUsd: boundedNumber(flags.get("min-deployed-alpha") ?? env.WEB3_FORWARD_MIN_DEPLOYED_ALPHA_USD, 0, -1_000_000, 1_000_000),
    maxDrawdownUsd: boundedNumber(flags.get("max-drawdown") ?? env.WEB3_FORWARD_MAX_DRAWDOWN_USD, 1_000, 0, 1_000_000),
    minConsistencyScore: boundedNumber(flags.get("min-consistency-score") ?? env.WEB3_FORWARD_MIN_CONSISTENCY_SCORE, 80, 0, 100),
    heartbeatWhenGated: booleanFlag(flags.get("heartbeat-when-gated") ?? env.WEB3_FORWARD_HEARTBEAT_WHEN_GATED, true),
    failUnderTarget: booleanFlag(flags.get("fail-under-target") ?? env.WEB3_FORWARD_FAIL_UNDER_TARGET, false),
    json: booleanFlag(flags.get("json") ?? env.WEB3_FORWARD_JSON, false),
  };
}

export async function runWeb3AutonomousForwardRun(input = {}) {
  const config = {
    ...parseForwardRunArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", [...FORWARD_SCENARIOS, "all"], "breakout"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(input.runnerId ?? "forward-run-daemon", "forward-run-daemon", 80),
    runs: boundedInteger(input.runs, 1, 1, 30),
    ticks: boundedInteger(input.ticks, 6, 1, 120),
    intervalMs: boundedInteger(input.intervalMs, 0, 0, 120_000),
    minNetPnlUsd: boundedNumber(input.minNetPnlUsd, 0, -1_000_000, 1_000_000),
    minHitRatePct: boundedNumber(input.minHitRatePct, 100, 0, 100),
    minDeployedAlphaUsd: boundedNumber(input.minDeployedAlphaUsd, 0, -1_000_000, 1_000_000),
    maxDrawdownUsd: boundedNumber(input.maxDrawdownUsd, 1_000, 0, 1_000_000),
    minConsistencyScore: boundedNumber(input.minConsistencyScore, 80, 0, 100),
    heartbeatWhenGated: input.heartbeatWhenGated !== false,
    failUnderTarget: Boolean(input.failUnderTarget),
  };

  if (config.runs > 1) {
    const report = await runWeb3AutonomousForwardRepeat(config);
    if (config.failUnderTarget && !report.target_met) {
      const error = new Error(repeatProofFailureMessage(report));
      error.report = report;
      throw error;
    }
    return report;
  }

  if (config.scenario === "all") {
    const report = await runWeb3AutonomousForwardSuite(config);
    if (config.failUnderTarget && !report.target_met) {
      const error = new Error(`Autonomous forward suite missed target by ${formatCurrency(report.target_gap_usd)}.`);
      error.report = report;
      throw error;
    }
    return report;
  }

  const startedAt = new Date().toISOString();
  const baseline = await postTrading(config, {
    scenario: config.scenario,
    source: config.source,
    account: "persistent",
    reset: true,
    advance: false,
  });
  const daemonRun = await runWeb3AutonomousDaemon({
    baseUrl: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    runnerId: config.runnerId,
    maxTicks: config.ticks,
    intervalMs: config.intervalMs,
    heartbeatWhenGated: config.heartbeatWhenGated,
    exitOnBlocked: false,
  });
  const final = await fetchTradingState(config, latestPaperCycle(daemonRun));
  const report = buildForwardRunReport({
    config,
    startedAt,
    baseline,
    final,
    daemonRun,
  });
  if (config.failUnderTarget && !report.target_met) {
    const error = new Error(`Autonomous forward run missed target by ${formatCurrency(report.target_gap_usd)}.`);
    error.report = report;
    throw error;
  }
  return report;
}

export async function runWeb3AutonomousForwardRepeat(input = {}) {
  const config = {
    ...parseForwardRunArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "all", [...FORWARD_SCENARIOS, "all"], "all"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(input.runnerId ?? "forward-repeat-daemon", "forward-repeat-daemon", 80),
    runs: boundedInteger(input.runs, 3, 2, 30),
    ticks: boundedInteger(input.ticks, 6, 1, 120),
    intervalMs: boundedInteger(input.intervalMs, 0, 0, 120_000),
    minNetPnlUsd: boundedNumber(input.minNetPnlUsd, 0, -1_000_000, 1_000_000),
    minHitRatePct: boundedNumber(input.minHitRatePct, 100, 0, 100),
    minDeployedAlphaUsd: boundedNumber(input.minDeployedAlphaUsd, 0, -1_000_000, 1_000_000),
    maxDrawdownUsd: boundedNumber(input.maxDrawdownUsd, 1_000, 0, 1_000_000),
    minConsistencyScore: boundedNumber(input.minConsistencyScore, 80, 0, 100),
    heartbeatWhenGated: input.heartbeatWhenGated !== false,
    failUnderTarget: Boolean(input.failUnderTarget),
  };
  const startedAt = new Date().toISOString();
  const runs = [];

  for (let index = 0; index < config.runs; index += 1) {
    runs.push(await runWeb3AutonomousForwardRun({
      ...config,
      runs: 1,
      runnerId: normalizeLeaseText(`${config.runnerId}-r${index + 1}`, `${config.runnerId}-r${index + 1}`, 80),
      failUnderTarget: false,
    }));
  }

  const report = buildForwardRepeatReport({
    config,
    startedAt,
    runs,
  });
  if (config.failUnderTarget && !report.target_met) {
    const error = new Error(repeatProofFailureMessage(report));
    error.report = report;
    throw error;
  }
  return report;
}

export async function runWeb3AutonomousForwardSuite(input = {}) {
  const config = {
    ...parseForwardRunArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(input.runnerId ?? "forward-suite-daemon", "forward-suite-daemon", 80),
    runs: 1,
    ticks: boundedInteger(input.ticks, 6, 1, 120),
    intervalMs: boundedInteger(input.intervalMs, 0, 0, 120_000),
    minNetPnlUsd: boundedNumber(input.minNetPnlUsd, 0, -1_000_000, 1_000_000),
    heartbeatWhenGated: input.heartbeatWhenGated !== false,
    failUnderTarget: Boolean(input.failUnderTarget),
  };
  const startedAt = new Date().toISOString();
  const scenarioReports = [];

  for (const scenario of FORWARD_SCENARIOS) {
    scenarioReports.push(await runWeb3AutonomousForwardRun({
      ...config,
      scenario,
      runnerId: normalizeLeaseText(`${config.runnerId}-${scenario}`, `${config.runnerId}-${scenario}`, 80),
      failUnderTarget: false,
    }));
  }

  const report = buildForwardSuiteReport({
    config,
    startedAt,
    scenarios: scenarioReports,
  });
  if (config.failUnderTarget && !report.target_met) {
    const error = new Error(`Autonomous forward suite missed target by ${formatCurrency(report.target_gap_usd)}.`);
    error.report = report;
    throw error;
  }
  return report;
}

export function buildForwardRepeatReport({
  config,
  startedAt,
  runs,
}) {
  const netPnl = roundMoney(runs.reduce((sum, report) => sum + Number(report.net_pnl_usd ?? 0), 0));
  const hotCoinAlpha = roundMoney(runs.reduce((sum, report) => sum + Number(report.hot_coin_alpha_usd ?? 0), 0));
  const deployedHotCoinAlpha = roundMoney(runs.reduce((sum, report) => sum + Number(report.deployed_hot_coin_alpha_usd ?? 0), 0));
  const hotCoinBaselinePnl = roundMoney(runs.reduce((sum, report) => sum + Number(report.hot_coin_baseline_pnl_usd ?? 0), 0));
  const deployedHotCoinBaselinePnl = roundMoney(runs.reduce((sum, report) => sum + Number(report.deployed_hot_coin_baseline_pnl_usd ?? 0), 0));
  const deployedNotional = roundMoney(runs.reduce((sum, report) => sum + Number(report.deployed_notional_usd ?? 0), 0));
  const postedTicks = runs.reduce((sum, report) => sum + Number(report.posted_ticks ?? 0), 0);
  const requestedTicks = runs.reduce((sum, report) => sum + Number(report.requested_ticks_total ?? report.requested_ticks ?? 0), 0);
  const advancedTicks = runs.reduce((sum, report) => sum + Number(report.advanced_ticks ?? 0), 0);
  const tradeCountDelta = runs.reduce((sum, report) => sum + Number(report.trade_count_delta ?? 0), 0);
  const profitableRunCount = runs.filter((report) => Number(report.net_pnl_usd ?? 0) > 0).length;
  const targetMetCount = runs.filter((report) => report.target_met).length;
  const pnlValues = runs.map((report) => Number(report.net_pnl_usd ?? 0));
  const bestRun = [...runs].sort((a, b) => Number(b.net_pnl_usd ?? 0) - Number(a.net_pnl_usd ?? 0))[0] ?? null;
  const worstRun = [...runs].sort((a, b) => Number(a.net_pnl_usd ?? 0) - Number(b.net_pnl_usd ?? 0))[0] ?? null;
  const targetGap = roundMoney(netPnl - (Number(config.minNetPnlUsd ?? 0) * runs.length));
  const maxDrawdown = maxCumulativeDrawdown(pnlValues);
  const hitRatePct = roundMoney((profitableRunCount / Math.max(1, runs.length)) * 100);
  const targetHitRatePct = roundMoney((targetMetCount / Math.max(1, runs.length)) * 100);
  const consistencyScore = roundMoney(
    (profitableRunCount / Math.max(1, runs.length)) * 55
    + (targetMetCount / Math.max(1, runs.length)) * 25
    + (deployedHotCoinAlpha >= 0 ? 15 : 0)
    + (maxDrawdown <= Math.max(25, Math.abs(netPnl) * 0.25) ? 5 : 0),
  );
  const netTargetMet = targetGap >= 0 && targetMetCount === runs.length;
  const hitRateMet = hitRatePct >= Number(config.minHitRatePct ?? 100);
  const drawdownMet = maxDrawdown <= Number(config.maxDrawdownUsd ?? 1_000);
  const deployedAlphaMet = deployedHotCoinAlpha >= Number(config.minDeployedAlphaUsd ?? 0);
  const consistencyMet = consistencyScore >= Number(config.minConsistencyScore ?? 80);
  const proofGateBlockers = [
    netTargetMet ? null : `net target gap is ${formatCurrency(targetGap)}`,
    hitRateMet ? null : `hit rate ${hitRatePct}% is below ${roundMoney(config.minHitRatePct)}%`,
    drawdownMet ? null : `drawdown ${formatCurrency(-maxDrawdown)} exceeds ${formatCurrency(-Number(config.maxDrawdownUsd ?? 1_000))}`,
    deployedAlphaMet ? null : `deployed alpha ${formatCurrency(deployedHotCoinAlpha)} is below ${formatCurrency(config.minDeployedAlphaUsd ?? 0)}`,
    consistencyMet ? null : `consistency score ${consistencyScore}/100 is below ${roundMoney(config.minConsistencyScore)}/100`,
  ].filter(Boolean);
  const targetMet = proofGateBlockers.length === 0;
  const verdict = targetMet && profitableRunCount === runs.length && deployedHotCoinAlpha >= 0
    ? "repeat-profitable-deployed-alpha"
    : netPnl > 0 && deployedHotCoinAlpha >= 0
      ? "repeat-positive-deployed-alpha"
      : netPnl > 0
        ? "repeat-positive-alpha-lag"
        : "repeat-failed";

  return {
    mode: "web3-autonomous-forward-repeat",
    paper_only: true,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    runner_id: config.runnerId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    run_count: runs.length,
    requested_runs: config.runs,
    requested_ticks_per_run: config.ticks,
    requested_ticks_total: requestedTicks,
    posted_ticks: postedTicks,
    advanced_ticks: advancedTicks,
    trade_count_delta: tradeCountDelta,
    net_pnl_usd: netPnl,
    average_net_pnl_usd: roundMoney(netPnl / Math.max(1, runs.length)),
    best_run_pnl_usd: bestRun ? roundMoney(bestRun.net_pnl_usd) : 0,
    worst_run_pnl_usd: worstRun ? roundMoney(worstRun.net_pnl_usd) : 0,
    max_cumulative_drawdown_usd: maxDrawdown,
    profitable_run_count: profitableRunCount,
    hit_rate_pct: hitRatePct,
    min_net_pnl_usd: roundMoney(config.minNetPnlUsd),
    target_gap_usd: targetGap,
    target_met: targetMet,
    net_target_met: netTargetMet,
    target_met_count: targetMetCount,
    target_hit_rate_pct: targetHitRatePct,
    minimum_hit_rate_pct: roundMoney(config.minHitRatePct),
    hit_rate_met: hitRateMet,
    maximum_drawdown_usd: roundMoney(config.maxDrawdownUsd),
    drawdown_met: drawdownMet,
    minimum_deployed_hot_coin_alpha_usd: roundMoney(config.minDeployedAlphaUsd),
    deployed_alpha_met: deployedAlphaMet,
    minimum_consistency_score: roundMoney(config.minConsistencyScore),
    consistency_score: consistencyScore,
    consistency_met: consistencyMet,
    proof_gate_status: targetMet ? "passed" : "blocked",
    proof_gate_blockers: proofGateBlockers,
    promotion_permission: targetMet ? "paper-promote" : "blocked",
    verdict,
    hot_coin_baseline_pnl_usd: hotCoinBaselinePnl,
    hot_coin_alpha_usd: hotCoinAlpha,
    hot_coin_baseline_verdict: hotCoinAlpha >= 0 ? "beat-hot-coin-repeat" : "lagged-hot-coin-repeat",
    deployed_notional_usd: deployedNotional,
    deployed_hot_coin_baseline_pnl_usd: deployedHotCoinBaselinePnl,
    deployed_hot_coin_alpha_usd: deployedHotCoinAlpha,
    deployed_hot_coin_baseline_verdict: deployedHotCoinAlpha >= 0 ? "beat-deployed-hot-coin-repeat" : "lagged-deployed-hot-coin-repeat",
    runs,
    controls: [
      "Repeat proof reruns the same bounded paper-only forward harness and resets the local persistent paper ledger inside each run.",
      "This is consistency evidence, not live or long-horizon proof; sample mode remains deterministic and live-dex mode remains read-only market discovery.",
      "No wallet signer, transaction relay, custody provider, or real-capital approval is invoked.",
    ],
  };
}

export function buildForwardRunReport({
  config,
  startedAt,
  baseline,
  final,
  daemonRun,
}) {
  const startEquity = Number(baseline.portfolio?.equity_usd ?? 0);
  const endEquity = Number(final.portfolio?.equity_usd ?? startEquity);
  const netPnl = roundMoney(endEquity - startEquity);
  const startTrades = Number(baseline.paper_account?.trade_count ?? 0);
  const endTrades = Number(final.paper_account?.trade_count ?? startTrades);
  const deployedNotional = forwardDeployedNotional({ baseline, final });
  const visibleBaseline = buildVisibleMarketBaseline({ baseline, final, startEquity, netPnl, deployedNotional });
  const postedEvents = daemonRun.events.filter((event) => event.status === "posted");
  const advancedEvents = postedEvents.filter((event) => event.paper_advanced);
  const blockedEvents = daemonRun.events.filter((event) => event.status === "blocked");
  const targetGap = roundMoney(netPnl - config.minNetPnlUsd);
  const targetMet = targetGap >= 0;
  const verdict = targetMet && netPnl > 0
    ? "profitable"
    : targetMet
      ? "flat-target-met"
      : netPnl > 0
        ? "profitable-below-target"
        : "not-profitable";
  const latestEvent = daemonRun.events[daemonRun.events.length - 1] ?? null;

  return {
    mode: "web3-autonomous-forward-run",
    paper_only: true,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    runner_id: config.runnerId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    requested_ticks: config.ticks,
    posted_ticks: postedEvents.length,
    advanced_ticks: advancedEvents.length,
    blocked_ticks: blockedEvents.length,
    start_equity_usd: roundMoney(startEquity),
    end_equity_usd: roundMoney(endEquity),
    net_pnl_usd: netPnl,
    min_net_pnl_usd: roundMoney(config.minNetPnlUsd),
    target_gap_usd: targetGap,
    target_met: targetMet,
    verdict,
    agent_return_pct: visibleBaseline.agent_return_pct,
    idle_cash_pnl_usd: 0,
    cash_alpha_usd: visibleBaseline.cash_alpha_usd,
    hot_coin_baseline_symbol: visibleBaseline.best_symbol,
    hot_coin_baseline_return_pct: visibleBaseline.best_return_pct,
    hot_coin_baseline_pnl_usd: visibleBaseline.best_wallet_pnl_usd,
    hot_coin_alpha_usd: visibleBaseline.best_coin_alpha_usd,
    deployed_notional_usd: visibleBaseline.deployed_notional_usd,
    deployed_hot_coin_baseline_pnl_usd: visibleBaseline.best_deployed_pnl_usd,
    deployed_hot_coin_alpha_usd: visibleBaseline.best_deployed_alpha_usd,
    deployed_hot_coin_baseline_verdict: visibleBaseline.deployed_verdict,
    cold_coin_baseline_symbol: visibleBaseline.worst_symbol,
    cold_coin_baseline_return_pct: visibleBaseline.worst_return_pct,
    cold_coin_baseline_pnl_usd: visibleBaseline.worst_wallet_pnl_usd,
    visible_baseline_verdict: visibleBaseline.verdict,
    trade_count_delta: Math.max(0, endTrades - startTrades),
    final_cycle: final.paper_account?.cycle ?? null,
    final_lease_status: final.autonomous_daemon_handoff?.lease_status ?? "missing",
    final_loop_status: final.autonomous_loop_tick?.status ?? "unknown",
    final_loop_action: final.autonomous_loop_tick?.action ?? "unknown",
    final_profit_benchmark: final.autonomous_profit_benchmark?.status ?? "unknown",
    final_make_money_pulse: final.autonomous_make_money_pulse?.status ?? "unknown",
    final_next_action: final.autonomous_loop_tick?.next_action ?? final.autonomous_daemon_handoff?.summary ?? "No final action returned.",
    latest_event: latestEvent,
    events: daemonRun.events,
    controls: [
      "Forward run resets only the local persistent paper ledger.",
      "No wallet signer, transaction relay, custody provider, or real-capital approval is invoked.",
      "Use --fail-under-target when this report should gate deployment on positive paper PnL.",
    ],
  };
}

function forwardDeployedNotional({ baseline, final }) {
  const baselineTradeIds = new Set((baseline.trade_tape ?? []).map((trade) => trade.id).filter(Boolean));
  return roundMoney((final.trade_tape ?? [])
    .filter((trade) => !baselineTradeIds.has(trade.id))
    .filter((trade) => trade.side === "buy" && trade.status === "paper-filled")
    .reduce((sum, trade) => sum + Number(trade.size_usd ?? 0), 0));
}

function buildVisibleMarketBaseline({ baseline, final, startEquity, netPnl, deployedNotional }) {
  const endById = new Map((final.market ?? []).map((token) => [token.id, token]));
  const rows = (baseline.market ?? [])
    .flatMap((startToken) => {
      const endToken = endById.get(startToken.id);
      const startPrice = Number(startToken.price_usd ?? 0);
      const endPrice = Number(endToken?.price_usd ?? startToken.price_usd ?? 0);
      if (!startToken.id || !startToken.symbol || startPrice <= 0 || endPrice <= 0) return [];
      const returnPct = ((endPrice - startPrice) / startPrice) * 100;
      return [{
        symbol: startToken.symbol,
        token_id: startToken.id,
        return_pct: roundMoney(returnPct),
        wallet_pnl_usd: roundMoney(startEquity * (returnPct / 100)),
        deployed_pnl_usd: roundMoney(deployedNotional * (returnPct / 100)),
      }];
    })
    .sort((a, b) => b.return_pct - a.return_pct);
  const best = rows[0] ?? null;
  const worst = rows[rows.length - 1] ?? null;
  const bestCoinAlpha = roundMoney(netPnl - (best?.wallet_pnl_usd ?? 0));
  const bestDeployedAlpha = roundMoney(netPnl - (best?.deployed_pnl_usd ?? 0));
  const agentReturnPct = startEquity > 0 ? roundMoney((netPnl / startEquity) * 100) : 0;
  const verdict = best
    ? bestCoinAlpha >= 0
      ? "beat-hot-coin"
      : netPnl > 0
        ? "profitable-but-lagged-hot-coin"
        : "lagged-hot-coin"
    : netPnl > 0
      ? "beat-cash"
      : netPnl === 0
        ? "flat-vs-cash"
        : "lost-vs-cash";
  const deployedVerdict = best
    ? bestDeployedAlpha >= 0
      ? "beat-deployed-hot-coin"
      : netPnl > 0
        ? "profitable-but-lagged-deployed-hot-coin"
        : "lagged-deployed-hot-coin"
    : verdict;

  return {
    agent_return_pct: agentReturnPct,
    cash_alpha_usd: roundMoney(netPnl),
    deployed_notional_usd: roundMoney(deployedNotional),
    best_symbol: best?.symbol ?? null,
    best_return_pct: best?.return_pct ?? 0,
    best_wallet_pnl_usd: best?.wallet_pnl_usd ?? 0,
    best_coin_alpha_usd: bestCoinAlpha,
    best_deployed_pnl_usd: best?.deployed_pnl_usd ?? 0,
    best_deployed_alpha_usd: bestDeployedAlpha,
    worst_symbol: worst?.symbol ?? null,
    worst_return_pct: worst?.return_pct ?? 0,
    worst_wallet_pnl_usd: worst?.wallet_pnl_usd ?? 0,
    verdict,
    deployed_verdict: deployedVerdict,
  };
}

export function buildForwardSuiteReport({
  config,
  startedAt,
  scenarios,
}) {
  const netPnl = roundMoney(scenarios.reduce((sum, report) => sum + Number(report.net_pnl_usd ?? 0), 0));
  const postedTicks = scenarios.reduce((sum, report) => sum + Number(report.posted_ticks ?? 0), 0);
  const advancedTicks = scenarios.reduce((sum, report) => sum + Number(report.advanced_ticks ?? 0), 0);
  const blockedTicks = scenarios.reduce((sum, report) => sum + Number(report.blocked_ticks ?? 0), 0);
  const tradeCountDelta = scenarios.reduce((sum, report) => sum + Number(report.trade_count_delta ?? 0), 0);
  const profitableCount = scenarios.filter((report) => report.net_pnl_usd > 0).length;
  const hotCoinBaselinePnl = roundMoney(scenarios.reduce((sum, report) => sum + Number(report.hot_coin_baseline_pnl_usd ?? 0), 0));
  const hotCoinAlpha = roundMoney(netPnl - hotCoinBaselinePnl);
  const deployedNotional = roundMoney(scenarios.reduce((sum, report) => sum + Number(report.deployed_notional_usd ?? 0), 0));
  const deployedHotCoinBaselinePnl = roundMoney(scenarios.reduce((sum, report) => sum + Number(report.deployed_hot_coin_baseline_pnl_usd ?? 0), 0));
  const deployedHotCoinAlpha = roundMoney(netPnl - deployedHotCoinBaselinePnl);
  const targetGap = roundMoney(netPnl - config.minNetPnlUsd);
  const targetMet = targetGap >= 0;
  const worstScenario = [...scenarios].sort((a, b) => a.net_pnl_usd - b.net_pnl_usd)[0] ?? null;
  const bestScenario = [...scenarios].sort((a, b) => b.net_pnl_usd - a.net_pnl_usd)[0] ?? null;
  const verdict = targetMet && profitableCount === scenarios.length
    ? "all-profitable"
    : targetMet && profitableCount > 0
      ? "mixed-target-met"
      : targetMet
        ? "flat-target-met"
        : netPnl > 0
          ? "profitable-below-target"
          : "not-profitable";

  return {
    mode: "web3-autonomous-forward-suite",
    paper_only: true,
    base_url: config.baseUrl,
    source: config.source,
    runner_id: config.runnerId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    scenario_count: scenarios.length,
    requested_ticks_per_scenario: config.ticks,
    requested_ticks_total: scenarios.reduce((sum, report) => sum + Number(report.requested_ticks ?? 0), 0),
    posted_ticks: postedTicks,
    advanced_ticks: advancedTicks,
    blocked_ticks: blockedTicks,
    trade_count_delta: tradeCountDelta,
    net_pnl_usd: netPnl,
    min_net_pnl_usd: roundMoney(config.minNetPnlUsd),
    target_gap_usd: targetGap,
    target_met: targetMet,
    verdict,
    hot_coin_baseline_pnl_usd: hotCoinBaselinePnl,
    hot_coin_alpha_usd: hotCoinAlpha,
    hot_coin_baseline_verdict: hotCoinAlpha >= 0 ? "beat-hot-coin-suite" : "lagged-hot-coin-suite",
    deployed_notional_usd: deployedNotional,
    deployed_hot_coin_baseline_pnl_usd: deployedHotCoinBaselinePnl,
    deployed_hot_coin_alpha_usd: deployedHotCoinAlpha,
    deployed_hot_coin_baseline_verdict: deployedHotCoinAlpha >= 0 ? "beat-deployed-hot-coin-suite" : "lagged-deployed-hot-coin-suite",
    profitable_scenario_count: profitableCount,
    advanced_scenario_count: scenarios.filter((report) => report.advanced_ticks > 0).length,
    traded_scenario_count: scenarios.filter((report) => report.trade_count_delta > 0).length,
    best_scenario: bestScenario?.scenario ?? null,
    best_scenario_pnl_usd: bestScenario ? roundMoney(bestScenario.net_pnl_usd) : 0,
    worst_scenario: worstScenario?.scenario ?? null,
    worst_scenario_pnl_usd: worstScenario ? roundMoney(worstScenario.net_pnl_usd) : 0,
    scenarios,
    controls: [
      "Forward suite resets the local persistent paper ledger separately for each regime.",
      "No wallet signer, transaction relay, custody provider, or real-capital approval is invoked.",
      "Aggregate verdicts can catch overfitting to a single breakout tape.",
    ],
  };
}

function latestPaperCycle(daemonRun) {
  const cycles = daemonRun.events
    .map((event) => Number(event.paper_cycle))
    .filter((cycle) => Number.isFinite(cycle) && cycle >= 0);
  return cycles.length > 0 ? Math.max(...cycles) : 0;
}

function maxCumulativeDrawdown(values) {
  let cumulative = 0;
  let peak = 0;
  let drawdown = 0;
  for (const value of values) {
    cumulative = roundMoney(cumulative + Number(value || 0));
    peak = Math.max(peak, cumulative);
    drawdown = Math.max(drawdown, roundMoney(peak - cumulative));
  }
  return roundMoney(drawdown);
}

async function fetchTradingState(config, cycles = 0) {
  const url = new URL("/api/web3-trading", config.baseUrl);
  url.searchParams.set("scenario", config.scenario);
  url.searchParams.set("cycles", String(Math.max(0, Math.trunc(cycles))));
  url.searchParams.set("source", config.source);
  url.searchParams.set("account", "persistent");
  url.searchParams.set("advance", "false");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  return readJson(response, "fetch final trading state");
}

async function postTrading(config, body) {
  const response = await fetch(new URL("/api/web3-trading", config.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  return readJson(response, "reset paper ledger");
}

async function readJson(response, label) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Could not ${label}: expected JSON, got ${text.slice(0, 220)}`);
  }
  if (!response.ok || payload?.error) {
    throw new Error(`Could not ${label}: ${payload?.error ?? response.status}`);
  }
  return payload;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeLeaseText(value, fallback, maxLength) {
  const normalized = String(value || fallback).trim().replace(/[^a-zA-Z0-9_.:-]/g, "-").replace(/-+/g, "-").slice(0, maxLength);
  return normalized || fallback.slice(0, maxLength);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function booleanFlag(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatCurrency(value) {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function repeatProofFailureMessage(report) {
  const blockers = Array.isArray(report?.proof_gate_blockers) ? report.proof_gate_blockers : [];
  if (blockers.length > 0) {
    return `Autonomous repeat forward proof failed promotion gate: ${blockers.join("; ")}.`;
  }
  return `Autonomous repeat forward proof missed target by ${formatCurrency(report?.target_gap_usd ?? 0)}.`;
}

async function main() {
  const config = parseForwardRunArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3AutonomousForwardRun(config);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (report.mode === "web3-autonomous-forward-repeat") {
      console.log(`${report.verdict}: ${formatCurrency(report.net_pnl_usd)} across ${report.run_count} repeated ${report.scenario} run(s), ${report.hit_rate_pct}% hit rate.`);
      console.log(`Gate: ${report.proof_gate_status}; deployed-alpha: ${formatCurrency(report.deployed_hot_coin_alpha_usd)}; drawdown: ${formatCurrency(-report.max_cumulative_drawdown_usd)}; consistency: ${report.consistency_score}/100.`);
      return;
    }
    if (report.mode === "web3-autonomous-forward-suite") {
      console.log(`${report.verdict}: ${formatCurrency(report.net_pnl_usd)} across ${report.scenario_count} regimes, ${report.posted_ticks}/${report.requested_ticks_total} posted daemon ticks.`);
      console.log(`Best: ${report.best_scenario ?? "n/a"} ${formatCurrency(report.best_scenario_pnl_usd)}; worst: ${report.worst_scenario ?? "n/a"} ${formatCurrency(report.worst_scenario_pnl_usd)}.`);
      return;
    }
    console.log(`${report.verdict}: ${formatCurrency(report.net_pnl_usd)} over ${report.posted_ticks}/${report.requested_ticks} posted daemon ticks.`);
    console.log(`Next: ${report.final_next_action}`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

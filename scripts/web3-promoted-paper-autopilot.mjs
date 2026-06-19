#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runWeb3DaemonSupervisor } from "./web3-daemon-supervisor.mjs";
import { runWeb3PaperPromotionGuard } from "./web3-paper-promotion-guard.mjs";

const DEFAULT_BASE_URL = "http://localhost:4010";

export function parsePromotedPaperAutopilotArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_AUTOPILOT_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    promotionScenario: normalizeChoice(flags.get("promotion-scenario") ?? env.WEB3_AUTOPILOT_PROMOTION_SCENARIO ?? "all", ["base", "breakout", "rug-risk", "all"], "all"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_AUTOPILOT_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(flags.get("runner-id") ?? env.WEB3_AUTOPILOT_RUNNER_ID ?? "promoted-paper-autopilot", "promoted-paper-autopilot", 80),
    promotionRuns: boundedInteger(flags.get("promotion-runs") ?? env.WEB3_AUTOPILOT_PROMOTION_RUNS, 2, 1, 30),
    promotionTicks: boundedInteger(flags.get("promotion-ticks") ?? env.WEB3_AUTOPILOT_PROMOTION_TICKS, 2, 1, 120),
    intervalMs: boundedInteger(flags.get("interval-ms") ?? env.WEB3_AUTOPILOT_INTERVAL_MS, 0, 0, 120_000),
    roundDelayMs: boundedInteger(flags.get("round-delay-ms") ?? env.WEB3_AUTOPILOT_ROUND_DELAY_MS, 0, 0, 300_000),
    maxSupervisorRounds: boundedInteger(flags.get("max-supervisor-rounds") ?? env.WEB3_AUTOPILOT_MAX_SUPERVISOR_ROUNDS, 3, 0, 10_000),
    maxTicksPerRound: boundedInteger(flags.get("max-ticks-per-round") ?? env.WEB3_AUTOPILOT_MAX_TICKS_PER_ROUND, 2, 1, 24),
    minNetPnlUsd: boundedNumber(flags.get("min-net-pnl") ?? env.WEB3_AUTOPILOT_MIN_NET_PNL_USD, 0, -1_000_000, 1_000_000),
    minHitRatePct: boundedNumber(flags.get("min-hit-rate-pct") ?? env.WEB3_AUTOPILOT_MIN_HIT_RATE_PCT, 100, 0, 100),
    minDeployedAlphaUsd: boundedNumber(flags.get("min-deployed-alpha") ?? env.WEB3_AUTOPILOT_MIN_DEPLOYED_ALPHA_USD, 0, -1_000_000, 1_000_000),
    maxDrawdownUsd: boundedNumber(flags.get("max-drawdown") ?? env.WEB3_AUTOPILOT_MAX_DRAWDOWN_USD, 1_000, 0, 1_000_000),
    minConsistencyScore: boundedNumber(flags.get("min-consistency-score") ?? env.WEB3_AUTOPILOT_MIN_CONSISTENCY_SCORE, 80, 0, 100),
    resetBeforeSupervisor: booleanFlag(flags.get("reset-before-supervisor") ?? env.WEB3_AUTOPILOT_RESET_BEFORE_SUPERVISOR, true),
    failOnBlocked: booleanFlag(flags.get("fail-on-blocked") ?? env.WEB3_AUTOPILOT_FAIL_ON_BLOCKED, false),
    json: booleanFlag(flags.get("json") ?? env.WEB3_AUTOPILOT_JSON, false),
  };
}

export async function runWeb3PromotedPaperAutopilot(input = {}) {
  const config = {
    ...parsePromotedPaperAutopilotArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    promotionScenario: normalizeChoice(input.promotionScenario ?? "all", ["base", "breakout", "rug-risk", "all"], "all"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(input.runnerId ?? "promoted-paper-autopilot", "promoted-paper-autopilot", 80),
    promotionRuns: boundedInteger(input.promotionRuns, 2, 1, 30),
    promotionTicks: boundedInteger(input.promotionTicks, 2, 1, 120),
    intervalMs: boundedInteger(input.intervalMs, 0, 0, 120_000),
    roundDelayMs: boundedInteger(input.roundDelayMs, 0, 0, 300_000),
    maxSupervisorRounds: boundedInteger(input.maxSupervisorRounds, 3, 0, 10_000),
    maxTicksPerRound: boundedInteger(input.maxTicksPerRound, 2, 1, 24),
    minNetPnlUsd: boundedNumber(input.minNetPnlUsd, 0, -1_000_000, 1_000_000),
    minHitRatePct: boundedNumber(input.minHitRatePct, 100, 0, 100),
    minDeployedAlphaUsd: boundedNumber(input.minDeployedAlphaUsd, 0, -1_000_000, 1_000_000),
    maxDrawdownUsd: boundedNumber(input.maxDrawdownUsd, 1_000, 0, 1_000_000),
    minConsistencyScore: boundedNumber(input.minConsistencyScore, 80, 0, 100),
    resetBeforeSupervisor: input.resetBeforeSupervisor !== false,
    failOnBlocked: Boolean(input.failOnBlocked),
  };
  const startedAt = new Date().toISOString();
  const promotion = input.promotion ?? await runWeb3PaperPromotionGuard({
    baseUrl: config.baseUrl,
    scenario: config.promotionScenario,
    source: config.source,
    runnerId: `${config.runnerId}-promotion`,
    runs: config.promotionRuns,
    ticks: config.promotionTicks,
    intervalMs: config.intervalMs,
    minNetPnlUsd: config.minNetPnlUsd,
    minHitRatePct: config.minHitRatePct,
    minDeployedAlphaUsd: config.minDeployedAlphaUsd,
    maxDrawdownUsd: config.maxDrawdownUsd,
    minConsistencyScore: config.minConsistencyScore,
    failOnBlocked: false,
  });

  let resetReceipt = null;
  let supervisor = null;
  if (promotion.can_start_supervised_paper && config.maxSupervisorRounds > 0) {
    if (config.resetBeforeSupervisor) {
      resetReceipt = await resetTradingState(config);
    }
    supervisor = await runWeb3DaemonSupervisor({
      baseUrl: config.baseUrl,
      scenario: config.scenario,
      source: config.source,
      runnerId: `${config.runnerId}-supervisor`,
      rounds: Math.min(config.maxSupervisorRounds, Math.max(1, Number(promotion.recommended_supervisor_rounds ?? 1))),
      ticksPerRound: Math.min(config.maxTicksPerRound, Math.max(1, Number(promotion.recommended_ticks_per_round ?? 1))),
      intervalMs: config.intervalMs,
      roundDelayMs: config.roundDelayMs,
      targetNetPnlUsd: Math.max(0, Number(promotion.recommended_target_net_pnl_usd ?? 0)),
      maxDrawdownUsd: Math.max(0, Number(promotion.recommended_max_drawdown_usd ?? 0)),
      heartbeatWhenGated: true,
      dryRun: false,
    });
  }

  const report = buildPromotedPaperAutopilotReport({ config, startedAt, promotion, supervisor, resetReceipt });
  if (config.failOnBlocked && report.exit_code !== 0) {
    const error = new Error(report.blockers[0] ?? "Promoted paper autopilot did not start.");
    error.report = report;
    throw error;
  }
  return report;
}

export function buildPromotedPaperAutopilotReport({ config, startedAt, promotion, supervisor, resetReceipt }) {
  const blockers = uniqueText([
    promotion?.can_start_supervised_paper ? null : promotion?.blockers?.[0] ?? "Paper promotion guard did not allow supervised autonomy.",
    config.maxSupervisorRounds <= 0 ? "Supervisor round cap is zero." : null,
    supervisor?.status === "circuit-open" ? supervisor.stop_reason ?? "Supervisor circuit opened." : null,
    supervisor?.status === "error" ? supervisor.stop_reason ?? "Supervisor errored." : null,
  ]);
  const status = blockers.length > 0
    ? "blocked"
    : supervisor
      ? supervisor.status === "completed" && supervisor.profit_target_hit
        ? "target-hit"
        : supervisor.status === "completed"
          ? "completed"
          : supervisor.status === "running"
            ? "running"
            : "paper-guarded"
      : "not-started";
  const permission = status === "blocked" ? "blocked" : promotion.promotion_permission;

  return {
    mode: "web3-promoted-paper-autopilot",
    paper_only: true,
    status,
    exit_code: status === "blocked" ? 1 : 0,
    base_url: config.baseUrl,
    scenario: config.scenario,
    promotion_scenario: config.promotionScenario,
    source: config.source,
    runner_id: config.runnerId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    promotion_status: promotion.status,
    promotion_permission: permission,
    recommended_paper_size_multiplier: promotion.recommended_paper_size_multiplier,
    recommended_supervisor_rounds: promotion.recommended_supervisor_rounds,
    applied_supervisor_rounds: supervisor?.requested_rounds ?? 0,
    applied_ticks_per_round: supervisor?.ticks_per_round ?? 0,
    applied_target_net_pnl_usd: supervisor?.target_net_pnl_usd ?? 0,
    applied_max_drawdown_usd: supervisor?.max_drawdown_limit_usd ?? 0,
    reset_before_supervisor: Boolean(resetReceipt),
    supervisor_status: supervisor?.status ?? "not-run",
    posted_ticks: supervisor?.posted_ticks ?? 0,
    blocked_ticks: supervisor?.blocked_ticks ?? 0,
    net_pnl_usd: supervisor?.net_pnl_usd ?? 0,
    profit_target_hit: supervisor?.profit_target_hit ?? false,
    loss_brake_tripped: supervisor?.loss_brake_tripped ?? false,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    blockers,
    summary: autopilotSummary(status, promotion, supervisor),
    next_action: autopilotNextAction(status, promotion, supervisor, blockers),
    promotion,
    supervisor,
    controls: [
      "Runs repeat proof, promotion guard, optional paper reset, and the supervised paper daemon as one local paper-only autopilot chain.",
      "Promotion output controls supervised paper rounds, tick count, paper profit target, and loss brake; blocked promotion stops the supervisor.",
      "The chain never signs swaps, submits transactions, stores private keys, mutates a wallet, or grants real-capital authority.",
    ],
  };
}

async function resetTradingState(config) {
  const response = await fetch(new URL("/api/web3-trading", config.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenario: config.scenario,
      source: config.source,
      account: "persistent",
      reset: true,
      advance: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Could not reset paper state: expected JSON, got ${text.slice(0, 220)}`);
  }
  if (!response.ok || payload?.error) {
    throw new Error(`Could not reset paper state: ${payload?.error ?? response.status}`);
  }
  return payload;
}

function autopilotSummary(status, promotion, supervisor) {
  if (status === "blocked") return `Promoted paper autopilot is blocked by ${promotion.status} promotion posture.`;
  if (status === "target-hit") return `Promoted paper autopilot hit the paper target with ${formatCurrency(supervisor.net_pnl_usd)} PnL after ${supervisor.posted_ticks} tick${supervisor.posted_ticks === 1 ? "" : "s"}.`;
  if (status === "completed") return `Promoted paper autopilot completed ${supervisor.round}/${supervisor.requested_rounds} supervised round${supervisor.requested_rounds === 1 ? "" : "s"} with ${formatCurrency(supervisor.net_pnl_usd)} paper PnL.`;
  if (status === "running") return "Promoted paper autopilot is still running supervised paper rounds.";
  return "Promotion passed, but no supervised paper round was started.";
}

function autopilotNextAction(status, promotion, supervisor, blockers) {
  if (status === "blocked") return blockers[0] ?? promotion.next_action;
  if (supervisor?.next_action) return supervisor.next_action;
  return promotion.next_action;
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

function formatCurrency(value) {
  const safe = Math.round(Number(value || 0) * 100) / 100;
  return `${safe >= 0 ? "+" : "-"}$${Math.abs(safe).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function uniqueText(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

async function main() {
  const config = parsePromotedPaperAutopilotArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3PromotedPaperAutopilot(config);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`${report.status}: ${report.summary}`);
    console.log(`Promotion: ${report.promotion_status}; supervisor: ${report.supervisor_status}; PnL: ${formatCurrency(report.net_pnl_usd)}.`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.report?.exit_code ?? 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

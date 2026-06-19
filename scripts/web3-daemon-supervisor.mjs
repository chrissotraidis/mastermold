#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { runWeb3AutonomousDaemon } from "./web3-autonomous-daemon.mjs";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_RUNNER_ID = `web3-supervisor-${hostname().replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 32) || "runner"}`;
const DEFAULT_STATUS_PATH = join(process.cwd(), "data", "web3-daemon-supervisor.json");

let stopRequested = false;
process.once("SIGINT", () => {
  stopRequested = true;
});
process.once("SIGTERM", () => {
  stopRequested = true;
});

export function parseSupervisorArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_SUPERVISOR_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_SUPERVISOR_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(flags.get("runner-id") ?? env.WEB3_SUPERVISOR_RUNNER_ID ?? DEFAULT_RUNNER_ID, DEFAULT_RUNNER_ID, 80),
    rounds: boundedInteger(flags.get("rounds") ?? env.WEB3_SUPERVISOR_ROUNDS, 24, 1, 10_000),
    ticksPerRound: boundedInteger(flags.get("ticks-per-round") ?? env.WEB3_SUPERVISOR_TICKS_PER_ROUND, 1, 1, 24),
    intervalMs: boundedInteger(flags.get("interval-ms") ?? env.WEB3_SUPERVISOR_INTERVAL_MS, 5_000, 0, 300_000),
    roundDelayMs: boundedInteger(flags.get("round-delay-ms") ?? env.WEB3_SUPERVISOR_ROUND_DELAY_MS, 0, 0, 300_000),
    targetNetPnlUsd: boundedNumber(flags.get("target-net-pnl") ?? env.WEB3_SUPERVISOR_TARGET_NET_PNL_USD, 0, 0, 1_000_000),
    maxDrawdownUsd: boundedNumber(flags.get("max-drawdown") ?? env.WEB3_SUPERVISOR_MAX_DRAWDOWN_USD, 250, 0, 1_000_000),
    maxConsecutiveBlockedRounds: boundedInteger(flags.get("max-blocked-rounds") ?? env.WEB3_SUPERVISOR_MAX_BLOCKED_ROUNDS, 5, 1, 100),
    maxConsecutiveErrorRounds: boundedInteger(flags.get("max-error-rounds") ?? env.WEB3_SUPERVISOR_MAX_ERROR_ROUNDS, 3, 1, 100),
    heartbeatWhenGated: booleanFlag(flags.get("heartbeat-when-gated") ?? env.WEB3_SUPERVISOR_HEARTBEAT_WHEN_GATED, true),
    dryRun: booleanFlag(flags.get("dry-run") ?? env.WEB3_SUPERVISOR_DRY_RUN, false),
    json: booleanFlag(flags.get("json") ?? env.WEB3_SUPERVISOR_JSON, false),
    statusPath: String(flags.get("status-path") ?? env.WEB3_DAEMON_SUPERVISOR_STATUS_PATH ?? DEFAULT_STATUS_PATH),
  };
}

export async function runWeb3DaemonSupervisor(input = {}) {
  const config = {
    ...parseSupervisorArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(input.runnerId ?? DEFAULT_RUNNER_ID, DEFAULT_RUNNER_ID, 80),
    rounds: boundedInteger(input.rounds, 24, 1, 10_000),
    ticksPerRound: boundedInteger(input.ticksPerRound, 1, 1, 24),
    intervalMs: boundedInteger(input.intervalMs, 5_000, 0, 300_000),
    roundDelayMs: boundedInteger(input.roundDelayMs, 0, 0, 300_000),
    targetNetPnlUsd: boundedNumber(input.targetNetPnlUsd, 0, 0, 1_000_000),
    maxDrawdownUsd: boundedNumber(input.maxDrawdownUsd, 250, 0, 1_000_000),
    maxConsecutiveBlockedRounds: boundedInteger(input.maxConsecutiveBlockedRounds, 5, 1, 100),
    maxConsecutiveErrorRounds: boundedInteger(input.maxConsecutiveErrorRounds, 3, 1, 100),
    heartbeatWhenGated: input.heartbeatWhenGated !== false,
    dryRun: Boolean(input.dryRun),
    statusPath: String(input.statusPath ?? DEFAULT_STATUS_PATH),
  };
  const startedAt = new Date().toISOString();
  const aggregate = {
    postedTicks: 0,
    blockedTicks: 0,
    dryRunTicks: 0,
    routeRefreshRequests: 0,
    consecutiveBlockedRounds: 0,
    consecutiveErrorRounds: 0,
    startEquityUsd: null,
    lastEquityUsd: null,
    peakEquityUsd: null,
    maxObservedDrawdownUsd: 0,
    lastEvent: null,
    lastError: null,
  };
  let receipt = writeSupervisorReceipt({
    config,
    startedAt,
    aggregate,
    round: 0,
    status: "running",
    stopReason: null,
  });

  for (let round = 1; round <= config.rounds; round += 1) {
    if (stopRequested) {
      receipt = writeSupervisorReceipt({
        config,
        startedAt,
        aggregate,
        round: round - 1,
        status: "idle",
        stopReason: "Stop signal received before the next round.",
      });
      break;
    }

    try {
      const run = await runWeb3AutonomousDaemon({
        baseUrl: config.baseUrl,
        scenario: config.scenario,
        source: config.source,
        runnerId: `${config.runnerId}-r${round}`,
        maxTicks: config.ticksPerRound,
        intervalMs: config.intervalMs,
        heartbeatWhenGated: config.heartbeatWhenGated,
        exitOnBlocked: false,
        dryRun: config.dryRun,
      });
      applyRunToAggregate(aggregate, run);
      receipt = writeSupervisorReceipt({
        config,
        startedAt,
        aggregate,
        round,
        status: "running",
        stopReason: null,
      });
    } catch (error) {
      aggregate.lastError = error instanceof Error ? error.message : String(error);
      aggregate.consecutiveErrorRounds += 1;
      receipt = writeSupervisorReceipt({
        config,
        startedAt,
        aggregate,
        round,
        status: "error",
        stopReason: aggregate.lastError,
      });
    }

    if (aggregate.consecutiveBlockedRounds >= config.maxConsecutiveBlockedRounds) {
      receipt = writeSupervisorReceipt({
        config,
        startedAt,
        aggregate,
        round,
        status: "circuit-open",
        stopReason: `Circuit opened after ${aggregate.consecutiveBlockedRounds} consecutive blocked round${aggregate.consecutiveBlockedRounds === 1 ? "" : "s"}.`,
      });
      break;
    }
    if (aggregate.consecutiveErrorRounds >= config.maxConsecutiveErrorRounds) {
      receipt = writeSupervisorReceipt({
        config,
        startedAt,
        aggregate,
        round,
        status: "circuit-open",
        stopReason: `Circuit opened after ${aggregate.consecutiveErrorRounds} consecutive error round${aggregate.consecutiveErrorRounds === 1 ? "" : "s"}.`,
      });
      break;
    }
    if (supervisorDrawdownBreached(config, aggregate)) {
      receipt = writeSupervisorReceipt({
        config,
        startedAt,
        aggregate,
        round,
        status: "circuit-open",
        stopReason: `Loss brake opened after ${formatCurrency(supervisorNetPnl(aggregate))} paper PnL and ${formatCurrency(aggregate.maxObservedDrawdownUsd)} max drawdown.`,
      });
      break;
    }
    if (supervisorTargetHit(config, aggregate)) {
      receipt = writeSupervisorReceipt({
        config,
        startedAt,
        aggregate,
        round,
        status: "completed",
        stopReason: `Paper profit target hit at ${formatCurrency(supervisorNetPnl(aggregate))}.`,
      });
      break;
    }
    if (round === config.rounds) {
      receipt = writeSupervisorReceipt({
        config,
        startedAt,
        aggregate,
        round,
        status: "completed",
        stopReason: `Completed ${config.rounds} supervised round${config.rounds === 1 ? "" : "s"}.`,
      });
      break;
    }
    if (config.roundDelayMs > 0) await delay(config.roundDelayMs);
  }

  return receipt;
}

export function applyRunToAggregate(aggregate, run) {
  const events = Array.isArray(run.events) ? run.events : [];
  const posted = events.filter((event) => event.status === "posted").length;
  const blocked = events.filter((event) => event.status === "blocked").length;
  const dryRun = events.filter((event) => event.status === "dry-run").length;
  aggregate.postedTicks += posted;
  aggregate.blockedTicks += blocked;
  aggregate.dryRunTicks += dryRun;
  aggregate.routeRefreshRequests += events.filter((event) => event.market_worker_route_refresh_requested === true).length;
  aggregate.lastEvent = events[events.length - 1] ?? aggregate.lastEvent;
  for (const event of events) {
    if (typeof event.equity_usd !== "number" || !Number.isFinite(event.equity_usd)) continue;
    if (aggregate.startEquityUsd === null) aggregate.startEquityUsd = event.equity_usd;
    aggregate.lastEquityUsd = event.equity_usd;
    aggregate.peakEquityUsd = Math.max(aggregate.peakEquityUsd ?? event.equity_usd, event.equity_usd);
    aggregate.maxObservedDrawdownUsd = Math.max(aggregate.maxObservedDrawdownUsd, Math.max(0, (aggregate.peakEquityUsd ?? event.equity_usd) - event.equity_usd));
  }
  aggregate.consecutiveErrorRounds = 0;
  if (events.length > 0 && blocked === events.length) {
    aggregate.consecutiveBlockedRounds += 1;
  } else {
    aggregate.consecutiveBlockedRounds = 0;
  }
}

export function buildSupervisorReceipt({
  config,
  startedAt,
  aggregate,
  round,
  status,
  stopReason,
}) {
  const lastEvent = aggregate.lastEvent ?? {};
  const lastAction = lastEvent.next_action ?? lastEvent.reason ?? "No daemon event has completed yet.";
  return {
    mode: "web3-daemon-supervisor",
    status,
    runner_id: config.runnerId,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    started_at: startedAt,
    updated_at: new Date().toISOString(),
    finished_at: status === "running" ? null : new Date().toISOString(),
    paper_only: true,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    round,
    requested_rounds: config.rounds,
    ticks_per_round: config.ticksPerRound,
    posted_ticks: aggregate.postedTicks,
    blocked_ticks: aggregate.blockedTicks,
    dry_run_ticks: aggregate.dryRunTicks,
    route_refresh_requests: aggregate.routeRefreshRequests,
    consecutive_blocked_rounds: aggregate.consecutiveBlockedRounds,
    consecutive_error_rounds: aggregate.consecutiveErrorRounds,
    max_consecutive_blocked_rounds: config.maxConsecutiveBlockedRounds,
    max_consecutive_error_rounds: config.maxConsecutiveErrorRounds,
    target_net_pnl_usd: roundMoney(config.targetNetPnlUsd),
    max_drawdown_limit_usd: roundMoney(config.maxDrawdownUsd),
    start_equity_usd: aggregate.startEquityUsd === null ? null : roundMoney(aggregate.startEquityUsd),
    last_equity_usd: aggregate.lastEquityUsd === null ? null : roundMoney(aggregate.lastEquityUsd),
    net_pnl_usd: roundMoney(supervisorNetPnl(aggregate)),
    peak_equity_usd: aggregate.peakEquityUsd === null ? null : roundMoney(aggregate.peakEquityUsd),
    max_drawdown_usd: roundMoney(aggregate.maxObservedDrawdownUsd),
    profit_target_hit: supervisorTargetHit(config, aggregate),
    loss_brake_tripped: supervisorDrawdownBreached(config, aggregate),
    last_event_status: lastEvent.status ?? "none",
    last_event_action: lastAction,
    stop_reason: stopReason,
    next_action: supervisorNextAction(status, stopReason, lastAction),
    controls: [
      "Runs only the existing paper daemon endpoint and read-only market refresh requests.",
      "Refuses wallet mutation, live execution, private keys, raw signed payload storage, and autonomous real-capital authority.",
      "Stops itself with a circuit-open receipt after repeated blocked/error rounds or configured paper drawdown.",
      "Can stop after a configured paper profit target so unattended runs preserve simulated gains for review.",
    ],
  };
}

function writeSupervisorReceipt(input) {
  const receipt = buildSupervisorReceipt(input);
  const dir = dirname(input.config.statusPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(input.config.statusPath, JSON.stringify(receipt, null, 2));
  return receipt;
}

function supervisorNextAction(status, stopReason, lastAction) {
  if (status === "circuit-open") return stopReason ?? "Inspect repeated blocked/error daemon rounds before restarting the supervisor.";
  if (status === "error") return stopReason ?? "Fix the latest supervisor error before the next autonomous run.";
  if (status === "completed") return "Review the receipt, forward proof, and paper wallet curve before extending unattended runtime.";
  if (status === "idle") return stopReason ?? "Restart the supervisor when another watched paper window should run.";
  return lastAction;
}

function supervisorNetPnl(aggregate) {
  if (aggregate.startEquityUsd === null || aggregate.lastEquityUsd === null) return 0;
  return aggregate.lastEquityUsd - aggregate.startEquityUsd;
}

function supervisorTargetHit(config, aggregate) {
  return config.targetNetPnlUsd > 0 && supervisorNetPnl(aggregate) >= config.targetNetPnlUsd;
}

function supervisorDrawdownBreached(config, aggregate) {
  return config.maxDrawdownUsd > 0 && aggregate.maxObservedDrawdownUsd >= config.maxDrawdownUsd;
}

function roundMoney(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function formatCurrency(value) {
  const absValue = Math.abs(roundMoney(value));
  return `${value < 0 ? "-" : ""}$${absValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
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

function normalizeLeaseText(value, fallback, maxLength) {
  const normalized = String(value || fallback).trim().replace(/[^a-zA-Z0-9_.:-]/g, "-").replace(/-+/g, "-").slice(0, maxLength);
  return normalized || fallback.slice(0, maxLength);
}

async function main() {
  const config = parseSupervisorArgs(process.argv.slice(2), process.env);
  const receipt = await runWeb3DaemonSupervisor(config);
  if (config.json) {
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  console.log(`[${receipt.runner_id}] ${receipt.status}: ${receipt.next_action}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

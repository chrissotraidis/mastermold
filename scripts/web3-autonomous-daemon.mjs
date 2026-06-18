#!/usr/bin/env node
import { hostname } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_RUNNER_ID = `local-paper-daemon-${hostname().replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 32) || "runner"}`;

export function parseDaemonArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_DAEMON_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_DAEMON_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(flags.get("runner-id") ?? env.WEB3_DAEMON_RUNNER_ID ?? DEFAULT_RUNNER_ID, DEFAULT_RUNNER_ID, 80),
    maxTicks: boundedInteger(flags.get("ticks") ?? env.WEB3_DAEMON_TICKS, 1, 1, 240),
    intervalMs: boundedInteger(flags.get("interval-ms") ?? env.WEB3_DAEMON_INTERVAL_MS, 0, 0, 120_000),
    heartbeatWhenGated: booleanFlag(flags.get("heartbeat-when-gated") ?? env.WEB3_DAEMON_HEARTBEAT_WHEN_GATED, false),
    exitOnBlocked: booleanFlag(flags.get("exit-on-blocked") ?? env.WEB3_DAEMON_EXIT_ON_BLOCKED, true),
    dryRun: booleanFlag(flags.get("dry-run") ?? env.WEB3_DAEMON_DRY_RUN, false),
    json: booleanFlag(flags.get("json") ?? env.WEB3_DAEMON_JSON, false),
  };
}

export async function runWeb3AutonomousDaemon(input = {}) {
  const config = {
    ...parseDaemonArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    runnerId: normalizeLeaseText(input.runnerId ?? DEFAULT_RUNNER_ID, DEFAULT_RUNNER_ID, 80),
    maxTicks: boundedInteger(input.maxTicks, 1, 1, 240),
    intervalMs: boundedInteger(input.intervalMs, 0, 0, 120_000),
    heartbeatWhenGated: Boolean(input.heartbeatWhenGated),
    exitOnBlocked: input.exitOnBlocked !== false,
    dryRun: Boolean(input.dryRun),
  };
  const startedAt = new Date().toISOString();
  const events = [];

  for (let index = 0; index < config.maxTicks; index += 1) {
    const state = await fetchTradingState(config);
    const handoff = state.autonomous_daemon_handoff;
    const safety = daemonSafetyCheck(state, handoff, config);
    if (!safety.ok) {
      events.push({
        tick: index + 1,
        status: "blocked",
        reason: safety.reason,
        lease_status: handoff?.lease_status ?? "missing",
        active_runner_id: handoff?.active_runner_id ?? null,
        can_issue_tick: Boolean(handoff?.can_issue_tick),
      });
      if (config.exitOnBlocked) break;
      if (index < config.maxTicks - 1) await waitForNextTick(config, handoff);
      continue;
    }

    const requestId = `${config.runnerId}:${Date.now()}:${index + 1}`;
    const body = buildDaemonTickBody(state, config, requestId);
    if (config.dryRun) {
      events.push({
        tick: index + 1,
        status: "dry-run",
        request_id: requestId,
        lease_id: body.daemon_lease.lease_id,
        next_wake_seconds: handoff.next_wake_seconds,
      });
      if (index < config.maxTicks - 1) await waitForNextTick(config, handoff);
      continue;
    }

    const payload = await postTradingState(config, body);
    const nextHandoff = payload.autonomous_daemon_handoff;
    events.push({
      tick: index + 1,
      status: "posted",
      request_id: requestId,
      lease_status: nextHandoff?.lease_status ?? "missing",
      active_runner_id: nextHandoff?.active_runner_id ?? null,
      can_issue_tick: Boolean(nextHandoff?.can_issue_tick),
      paper_advanced: Boolean(payload.paper_daemon?.advanced),
      loop_status: payload.autonomous_loop_tick?.status ?? "unknown",
      loop_action: payload.autonomous_loop_tick?.action ?? "unknown",
      paper_cycle: payload.paper_account?.cycle ?? null,
      equity_usd: payload.portfolio?.equity_usd ?? null,
      next_action: payload.autonomous_loop_tick?.next_action ?? nextHandoff?.summary ?? "No next action returned.",
    });

    if (nextHandoff?.lease_status === "conflict" || nextHandoff?.lease_status === "blocked") break;
    if (index < config.maxTicks - 1) await waitForNextTick(config, nextHandoff);
  }

  return {
    mode: "web3-autonomous-daemon-run",
    runner_id: config.runnerId,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    paper_only: true,
    dry_run: config.dryRun,
    heartbeat_when_gated: config.heartbeatWhenGated,
    events,
  };
}

export function buildDaemonTickBody(state, config, requestId) {
  const handoff = state.autonomous_daemon_handoff;
  return {
    scenario: state.scenario ?? config.scenario,
    cycles: state.paper_account?.cycle ?? 0,
    source: state.market_source?.mode ?? config.source,
    account: "persistent",
    daemon: true,
    advance: false,
    autonomous_loop: { action: "tick" },
    daemon_lease: {
      lease_id: handoff.lease_id,
      runner_id: config.runnerId,
      request_id: requestId,
      issued_at: new Date().toISOString(),
    },
  };
}

export function daemonSafetyCheck(state, handoff, config) {
  if (!handoff || handoff.mode !== "autonomous-daemon-handoff") {
    return { ok: false, reason: "Trading state did not return an autonomous daemon handoff." };
  }
  if (handoff.can_trade_real_capital || state.autonomous_live_autonomy_readiness?.can_trade_real_capital) {
    return { ok: false, reason: "Refusing daemon run because real-capital autonomy is armed." };
  }
  if (handoff.lease_status === "conflict" && handoff.active_runner_id !== config.runnerId) {
    return { ok: false, reason: `Another runner owns the active lease: ${handoff.active_runner_id}.` };
  }
  if (handoff.status === "blocked" || handoff.status === "paused") {
    if (!config.heartbeatWhenGated) return { ok: false, reason: `Daemon handoff is ${handoff.status}; heartbeat_when_gated is off.` };
  }
  return { ok: true, reason: "Paper-only daemon tick is allowed." };
}

async function fetchTradingState(config) {
  const url = new URL("/api/web3-trading", config.baseUrl);
  url.searchParams.set("scenario", config.scenario);
  url.searchParams.set("source", config.source);
  url.searchParams.set("account", "persistent");
  url.searchParams.set("reset", "false");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  return readDaemonJson(response, "fetch trading state");
}

async function postTradingState(config, body) {
  const response = await fetch(new URL("/api/web3-trading", config.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  return readDaemonJson(response, "post daemon tick");
}

async function readDaemonJson(response, label) {
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

async function waitForNextTick(config, handoff) {
  const waitMs = config.intervalMs || Math.max(0, Math.min(120_000, (handoff?.next_wake_seconds ?? 0) * 1000));
  if (waitMs > 0) await delay(waitMs);
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
  const config = parseDaemonArgs(process.argv.slice(2), process.env);
  const result = await runWeb3AutonomousDaemon(config);
  if (config.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const event of result.events) {
    console.log(`[${result.runner_id}] tick ${event.tick}: ${event.status} ${event.lease_status ?? ""} ${event.next_action ?? event.reason ?? ""}`.trim());
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

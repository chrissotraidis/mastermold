#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runWeb3AutonomousForwardRun } from "./web3-autonomous-forward-run.mjs";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_REPEAT_PROOF_TIMEOUT_MS = 45_000;

export function parseLiveCapitalPreflightArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_PREFLIGHT_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_PREFLIGHT_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(flags.get("runner-id") ?? env.WEB3_PREFLIGHT_RUNNER_ID ?? "live-preflight-daemon", "live-preflight-daemon", 80),
    runs: boundedInteger(flags.get("runs") ?? env.WEB3_PREFLIGHT_RUNS, 2, 1, 30),
    ticks: boundedInteger(flags.get("ticks") ?? env.WEB3_PREFLIGHT_TICKS, 2, 1, 120),
    intervalMs: boundedInteger(flags.get("interval-ms") ?? env.WEB3_PREFLIGHT_INTERVAL_MS, 0, 0, 120_000),
    minNetPnlUsd: boundedNumber(flags.get("min-net-pnl") ?? env.WEB3_PREFLIGHT_MIN_NET_PNL_USD, 0, -1_000_000, 1_000_000),
    minHitRatePct: boundedNumber(flags.get("min-hit-rate-pct") ?? env.WEB3_PREFLIGHT_MIN_HIT_RATE_PCT, 100, 0, 100),
    minDeployedAlphaUsd: boundedNumber(flags.get("min-deployed-alpha") ?? env.WEB3_PREFLIGHT_MIN_DEPLOYED_ALPHA_USD, 0, -1_000_000, 1_000_000),
    maxDrawdownUsd: boundedNumber(flags.get("max-drawdown") ?? env.WEB3_PREFLIGHT_MAX_DRAWDOWN_USD, 1_000, 0, 1_000_000),
    minConsistencyScore: boundedNumber(flags.get("min-consistency-score") ?? env.WEB3_PREFLIGHT_MIN_CONSISTENCY_SCORE, 80, 0, 100),
    allowLiveReady: booleanFlag(flags.get("allow-live-ready") ?? env.WEB3_PREFLIGHT_ALLOW_LIVE_READY, false),
    requireLiveReady: booleanFlag(flags.get("require-live-ready") ?? env.WEB3_PREFLIGHT_REQUIRE_LIVE_READY, false),
    requireRepeatProof: booleanFlag(flags.get("require-repeat-proof") ?? env.WEB3_PREFLIGHT_REQUIRE_REPEAT_PROOF, true),
    skipRepeatWhenLiveBlocked: !booleanFlag(flags.get("always-run-repeat-proof") ?? env.WEB3_PREFLIGHT_ALWAYS_RUN_REPEAT_PROOF, false),
    repeatProofTimeoutMs: boundedInteger(flags.get("repeat-proof-timeout-ms") ?? env.WEB3_PREFLIGHT_REPEAT_PROOF_TIMEOUT_MS, DEFAULT_REPEAT_PROOF_TIMEOUT_MS, 1_000, 600_000),
    failOnUnsafe: booleanFlag(flags.get("fail-on-unsafe") ?? env.WEB3_PREFLIGHT_FAIL_ON_UNSAFE, true),
    json: booleanFlag(flags.get("json") ?? env.WEB3_PREFLIGHT_JSON, false),
  };
}

export async function runWeb3LiveCapitalPreflight(input = {}) {
  const config = {
    ...parseLiveCapitalPreflightArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(input.runnerId ?? "live-preflight-daemon", "live-preflight-daemon", 80),
    runs: boundedInteger(input.runs, 2, 1, 30),
    ticks: boundedInteger(input.ticks, 2, 1, 120),
    intervalMs: boundedInteger(input.intervalMs, 0, 0, 120_000),
    minNetPnlUsd: boundedNumber(input.minNetPnlUsd, 0, -1_000_000, 1_000_000),
    minHitRatePct: boundedNumber(input.minHitRatePct, 100, 0, 100),
    minDeployedAlphaUsd: boundedNumber(input.minDeployedAlphaUsd, 0, -1_000_000, 1_000_000),
    maxDrawdownUsd: boundedNumber(input.maxDrawdownUsd, 1_000, 0, 1_000_000),
    minConsistencyScore: boundedNumber(input.minConsistencyScore, 80, 0, 100),
    allowLiveReady: Boolean(input.allowLiveReady),
    requireLiveReady: Boolean(input.requireLiveReady),
    requireRepeatProof: input.requireRepeatProof !== false,
    skipRepeatWhenLiveBlocked: input.skipRepeatWhenLiveBlocked !== false,
    repeatProofTimeoutMs: boundedInteger(input.repeatProofTimeoutMs, DEFAULT_REPEAT_PROOF_TIMEOUT_MS, 1_000, 600_000),
    failOnUnsafe: input.failOnUnsafe !== false,
  };
  const state = input.state ?? await fetchTradingState(config);
  const repeatProof = input.repeatProof ?? await resolveRepeatProof(config, state);

  const report = buildLiveCapitalPreflightReport({ config, state, repeatProof });
  if (config.failOnUnsafe && report.exit_code !== 0) {
    const error = new Error(report.blockers[0] ?? "Live-capital preflight failed.");
    error.report = report;
    throw error;
  }
  return report;
}

async function resolveRepeatProof(config, state) {
  if (!config.requireRepeatProof) return null;
  if (shouldSkipLiveCapitalRepeatProof(config, state)) {
    return buildSkippedRepeatProof(state);
  }

  return runRepeatProofWithTimeout(config);
}

async function runRepeatProofWithTimeout(config) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("repeat proof timeout")), config.repeatProofTimeoutMs);
  try {
    return await runWeb3AutonomousForwardRun({
      baseUrl: config.baseUrl,
      scenario: "all",
      source: config.source,
      runnerId: config.runnerId,
      runs: Math.max(2, config.runs),
      ticks: config.ticks,
      intervalMs: config.intervalMs,
      minNetPnlUsd: config.minNetPnlUsd,
      minHitRatePct: config.minHitRatePct,
      minDeployedAlphaUsd: config.minDeployedAlphaUsd,
      maxDrawdownUsd: config.maxDrawdownUsd,
      minConsistencyScore: config.minConsistencyScore,
      heartbeatWhenGated: true,
      failUnderTarget: false,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      return buildTimedOutRepeatProof(config.repeatProofTimeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function shouldSkipLiveCapitalRepeatProof(config, state) {
  const liveReadiness = state?.autonomous_live_autonomy_readiness ?? null;
  const daemonHandoff = state?.autonomous_daemon_handoff ?? null;
  if (!config.requireRepeatProof || !config.skipRepeatWhenLiveBlocked) return false;
  if (config.requireLiveReady) return false;
  if (liveReadiness?.can_trade_real_capital === true) return false;
  if (daemonHandoff?.can_trade_real_capital === true) return false;
  return Boolean(liveReadiness);
}

export function buildLiveCapitalPreflightReport({ config, state, repeatProof }) {
  const liveReadiness = state?.autonomous_live_autonomy_readiness ?? null;
  const daemonHandoff = state?.autonomous_daemon_handoff ?? null;
  const executionReadiness = state?.execution_readiness ?? null;
  const readinessItems = Array.isArray(liveReadiness?.items) ? liveReadiness.items : [];
  const readinessFailures = readinessItems
    .filter((item) => item.status === "fail")
    .map((item) => item.blocker ?? item.detail)
    .filter(Boolean);
  const repeatProofStatus = repeatProof?.proof_gate_status ?? (config.requireRepeatProof ? "missing" : "not-required");
  const repeatProofSkipped = repeatProofStatus === "skipped-live-blocked";
  const repeatGatePassed = !config.requireRepeatProof || repeatProof?.proof_gate_status === "passed" || repeatProofSkipped;
  const liveReady = liveReadiness?.can_trade_real_capital === true;
  const daemonRealCapital = daemonHandoff?.can_trade_real_capital === true;
  const repeatBlockers = config.requireRepeatProof && !repeatGatePassed
    ? repeatProof?.proof_gate_blockers ?? ["Repeat forward proof has not passed the paper-promotion gate."]
    : [];
  const blockers = [
    !liveReadiness ? "Trading state did not include autonomous live-readiness." : null,
    !executionReadiness ? "Trading state did not include execution readiness." : null,
    daemonRealCapital ? "Daemon handoff must never grant real-capital trading authority." : null,
    liveReady && !config.allowLiveReady ? "Live readiness reports real-capital permission, but --allow-live-ready was not set." : null,
    config.requireLiveReady && !liveReady ? liveReadiness?.next_action ?? "Live readiness is not ready for real capital." : null,
    ...repeatBlockers,
  ].filter(Boolean);
  const safeBlocked = !liveReady && !daemonRealCapital && blockers.length === 0;
  const liveManualReview = liveReady && config.allowLiveReady && repeatGatePassed && !daemonRealCapital && blockers.length === 0;
  const status = blockers.length > 0
    ? "blocked"
    : liveManualReview
      ? "manual-live-review"
      : safeBlocked
        ? "blocked-as-expected"
        : "paper-only";
  const exitCode = blockers.length > 0 ? 1 : 0;

  return {
    mode: "web3-live-capital-preflight",
    paper_only: true,
    status,
    exit_code: exitCode,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    live_readiness_status: liveReadiness?.status ?? "missing",
    live_readiness_score: liveReadiness?.readiness_score ?? 0,
    live_can_trade_real_capital: liveReady,
    daemon_can_trade_real_capital: daemonRealCapital,
    execution_mode: executionReadiness?.config?.mode ?? "missing",
    kill_switch: executionReadiness?.config?.kill_switch ?? null,
    repeat_proof_required: Boolean(config.requireRepeatProof),
    repeat_proof_status: repeatProofStatus,
    repeat_proof_skipped: repeatProofSkipped,
    repeat_proof_timeout_ms: config.repeatProofTimeoutMs ?? DEFAULT_REPEAT_PROOF_TIMEOUT_MS,
    repeat_promotion_permission: repeatProof?.promotion_permission ?? (config.requireRepeatProof ? "missing" : "not-required"),
    repeat_hit_rate_pct: repeatProof?.hit_rate_pct ?? null,
    repeat_deployed_alpha_usd: repeatProof?.deployed_hot_coin_alpha_usd ?? null,
    repeat_drawdown_usd: repeatProof?.max_cumulative_drawdown_usd ?? null,
    repeat_consistency_score: repeatProof?.consistency_score ?? null,
    live_execution_permission: liveManualReview ? "manual-live-executor-review" : "blocked",
    signer_boundary: readinessItems.find((item) => item.id === "signer")?.status ?? "missing",
    relay_boundary: readinessItems.find((item) => item.id === "relay")?.status ?? "missing",
    custody_policy_boundary: readinessItems.find((item) => item.id === "policy")?.status ?? "missing",
    hard_fail_count: readinessFailures.length,
    readiness_failures: readinessFailures,
    blockers,
    summary: liveCapitalPreflightSummary({ status, liveReadiness, repeatProof, blockers }),
    controls: [
      "This preflight never signs, submits, broadcasts, or moves funds.",
      "Default mode succeeds only when real-capital autonomy is blocked or paper-only; use --allow-live-ready for an explicit manual review of a future live-ready state.",
      "Daemon handoff real-capital authority is always treated as unsafe in this drill.",
      "Repeat proof must pass promotion gates before any live-ready state can move to manual executor review; when live gates are already blocked, the command skips that slow proof by default.",
      "Use --always-run-repeat-proof to force the paper repeat proof even when the live-capital gate is already blocked.",
    ],
  };
}

async function fetchTradingState(config) {
  const url = new URL("/api/web3-trading", config.baseUrl);
  url.searchParams.set("scenario", config.scenario);
  url.searchParams.set("source", config.source);
  url.searchParams.set("account", "persistent");
  url.searchParams.set("advance", "false");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Could not fetch trading state: expected JSON, got ${text.slice(0, 220)}`);
  }
  if (!response.ok || payload?.error) {
    throw new Error(`Could not fetch trading state: ${payload?.error ?? response.status}`);
  }
  return payload;
}

function liveCapitalPreflightSummary({ status, liveReadiness, repeatProof, blockers }) {
  if (blockers.length > 0) return `Live-capital preflight is blocked: ${blockers[0]}`;
  if (status === "manual-live-review") return "Live-readiness and repeat proof passed, but real execution still requires a separate manual live executor review.";
  if (status === "blocked-as-expected") return `Real-capital autonomy is blocked as expected; live-readiness is ${liveReadiness?.status ?? "missing"} and repeat proof is ${repeatProof?.proof_gate_status ?? "not-required"}.`;
  return "Preflight remains paper-only; no live-capital permission is granted.";
}

function buildSkippedRepeatProof(state) {
  return {
    mode: "web3-autonomous-forward-repeat",
    paper_only: true,
    proof_gate_status: "skipped-live-blocked",
    promotion_permission: "blocked",
    proof_gate_blockers: [],
    hit_rate_pct: null,
    deployed_hot_coin_alpha_usd: null,
    max_cumulative_drawdown_usd: null,
    consistency_score: null,
    next_action: state?.autonomous_live_autonomy_readiness?.next_action ?? "Clear live-capital blockers before rerunning repeat paper proof.",
    controls: [
      "Repeat proof was skipped because live-capital readiness is already blocked.",
      "No live execution, signing, transaction relay, or wallet mutation was attempted.",
    ],
  };
}

function buildTimedOutRepeatProof(timeoutMs) {
  return {
    mode: "web3-autonomous-forward-repeat",
    paper_only: true,
    proof_gate_status: "timeout",
    promotion_permission: "blocked",
    proof_gate_blockers: [`Repeat forward proof did not finish within ${timeoutMs}ms; rerun with --repeat-proof-timeout-ms=<ms> or --require-repeat-proof=false for a live-blocker-only check.`],
    hit_rate_pct: null,
    deployed_hot_coin_alpha_usd: null,
    max_cumulative_drawdown_usd: null,
    consistency_score: null,
    controls: [
      "Repeat proof timed out without granting live-capital authority.",
      "No live execution, signing, transaction relay, or wallet mutation was attempted.",
    ],
  };
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

async function main() {
  const config = parseLiveCapitalPreflightArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3LiveCapitalPreflight(config);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`${report.status}: ${report.summary}`);
    console.log(`Live: ${report.live_readiness_status}; repeat: ${report.repeat_proof_status}; permission: ${report.live_execution_permission}.`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.report?.exit_code ?? 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

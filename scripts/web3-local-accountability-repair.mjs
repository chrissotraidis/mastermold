#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_RUNNER_ID = "local-accountability-repair";
const DEFAULT_STATUS_PATH = join(process.cwd(), "data", "web3-local-accountability-repair.json");

export function parseLocalAccountabilityRepairArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_ACCOUNTABILITY_REPAIR_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_ACCOUNTABILITY_REPAIR_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(flags.get("runner-id") ?? env.WEB3_ACCOUNTABILITY_REPAIR_RUNNER_ID ?? DEFAULT_RUNNER_ID, DEFAULT_RUNNER_ID, 80),
    maxAttempts: boundedInteger(flags.get("attempts") ?? env.WEB3_ACCOUNTABILITY_REPAIR_ATTEMPTS, 3, 1, 10),
    targetScore: boundedInteger(flags.get("target-score") ?? env.WEB3_ACCOUNTABILITY_REPAIR_TARGET_SCORE, 70, 1, 100),
    statusPath: String(flags.get("status-path") ?? env.WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH ?? DEFAULT_STATUS_PATH),
    failOnBlocked: booleanFlag(flags.get("fail-on-blocked") ?? env.WEB3_ACCOUNTABILITY_REPAIR_FAIL_ON_BLOCKED, false),
    json: booleanFlag(flags.get("json") ?? env.WEB3_ACCOUNTABILITY_REPAIR_JSON, false),
  };
}

export async function runWeb3LocalAccountabilityRepair(input = {}) {
  const config = {
    ...parseLocalAccountabilityRepairArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(input.runnerId ?? DEFAULT_RUNNER_ID, DEFAULT_RUNNER_ID, 80),
    maxAttempts: boundedInteger(input.maxAttempts, 3, 1, 10),
    targetScore: boundedInteger(input.targetScore, 70, 1, 100),
    statusPath: String(input.statusPath ?? DEFAULT_STATUS_PATH),
    failOnBlocked: Boolean(input.failOnBlocked),
  };
  const startedAt = new Date().toISOString();
  const initialState = input.initialState ?? await fetchTradingState(config);
  assertPaperOnlyState(initialState, "initial");
  const events = [];
  let currentState = initialState;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const account = currentState.autonomous_profit_accountability;
    const plan = account?.repair_plan;
    const beforeScore = account?.accountability_score ?? 0;
    if (!plan) {
      events.push(buildRepairEvent({ attempt, status: "blocked", reason: "No local paper repair plan was returned.", beforeScore }));
      break;
    }
    assertPaperOnlyPlan(plan, attempt);
    if (account.making_money && beforeScore >= config.targetScore) {
      events.push(buildRepairEvent({ attempt, status: "complete", reason: "Local paper accountability already meets the target.", beforeScore, plan }));
      break;
    }
    if (!plan.request) {
      events.push(buildRepairEvent({ attempt, status: plan.status === "complete" ? "complete" : "blocked", reason: plan.blocking_reason ?? plan.next_action, beforeScore, plan }));
      break;
    }

    const body = buildRepairRequestBody(plan, config);
    const requestKind = repairRequestKind(body);
    const nextState = await postTradingState(config, body);
    assertPaperOnlyState(nextState, `attempt ${attempt}`);
    const nextAccount = nextState.autonomous_profit_accountability;
    events.push(buildRepairEvent({
      attempt,
      status: "posted",
      reason: nextAccount?.repair_plan?.next_action ?? plan.next_action,
      beforeScore,
      afterScore: nextAccount?.accountability_score ?? beforeScore,
      beforePlan: plan,
      plan: nextAccount?.repair_plan ?? plan,
      requestKind,
    }));
    currentState = nextState;

    if (nextAccount?.making_money && (nextAccount.accountability_score ?? 0) >= config.targetScore) break;
    if (requestKind === "preflight-repair" && (nextAccount?.accountability_score ?? beforeScore) <= beforeScore) break;
    if (nextAccount?.repair_plan?.status === "blocked" || !nextAccount?.repair_plan?.request) break;
  }

  const report = buildLocalAccountabilityRepairReport({ config, startedAt, initialState, finalState: currentState, events });
  if (config.failOnBlocked && report.exit_code !== 0) {
    const error = new Error(report.blockers[0] ?? "Local accountability repair did not clear.");
    error.report = report;
    throw error;
  }
  return report;
}

export function buildLocalAccountabilityRepairReport({ config, startedAt, initialState, finalState, events }) {
  const initialAccount = initialState?.autonomous_profit_accountability ?? {};
  const finalAccount = finalState?.autonomous_profit_accountability ?? initialAccount;
  const initialScore = Number(initialAccount.accountability_score ?? 0);
  const finalScore = Number(finalAccount.accountability_score ?? initialScore);
  const scoreDelta = finalScore - initialScore;
  const targetScore = Number(config.targetScore ?? 70);
  const finalPlan = finalAccount.repair_plan ?? null;
  const postedCount = events.filter((event) => event.status === "posted").length;
  const complete = finalAccount.making_money === true && finalScore >= targetScore;
  const blocked = finalPlan?.status === "blocked" || events.some((event) => event.status === "blocked");
  const noProgress = postedCount > 0 && scoreDelta <= 0 && !complete;
  const status = complete
    ? "complete"
    : blocked
      ? "blocked"
      : scoreDelta > 0
        ? "improved"
        : noProgress
          ? "no-progress"
          : "not-run";
  const blockers = uniqueText([
    finalPlan?.blocking_reason,
    status === "blocked" ? finalPlan?.next_action : null,
    status === "no-progress" ? "Local accountability score did not improve after posted paper repair attempts." : null,
    finalPlan?.live_execution_permission !== "blocked" || finalPlan?.wallet_mutation_permission !== "blocked"
      ? "Repair plan exposed non-blocked live or wallet permissions."
      : null,
  ]);

  return {
    mode: "web3-local-accountability-repair",
    paper_only: true,
    status,
    exit_code: status === "blocked" || status === "no-progress" ? 1 : 0,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    runner_id: config.runnerId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    target_score: targetScore,
    attempts_requested: Number(config.maxAttempts ?? 0),
    attempts_posted: postedCount,
    initial_accountability_score: initialScore,
    final_accountability_score: finalScore,
    score_delta: scoreDelta,
    initial_making_money: initialAccount.making_money === true,
    final_making_money: finalAccount.making_money === true,
    final_repair_status: finalPlan?.status ?? "missing",
    final_repair_action: finalPlan?.next_action ?? null,
    final_blocking_reason: finalPlan?.blocking_reason ?? null,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    events,
    blockers,
    summary: localAccountabilityRepairSummary(status, finalScore, scoreDelta, targetScore, postedCount),
    next_action: localAccountabilityRepairNextAction(status, finalPlan, blockers, targetScore),
    controls: [
      "Consumes only the backend-authored local paper accountability repair plan from /api/web3-trading.",
      "Allows read-only route refresh for sample or live-dex, and bounded autonomous_session paper requests only in local sample mode; it does not build trade bodies locally.",
      "Stops after one preflight diagnostic tick if accountability does not improve, instead of repeating low-signal churn.",
      "Refuses live-dex autonomous sessions, live execution permission, wallet mutation permission, private keys, signed transactions, and real-capital authority.",
    ],
  };
}

function buildRepairRequestBody(plan, config) {
  const body = plan.request?.body;
  if (!body || typeof body !== "object") throw new Error("Repair plan did not include a request body.");
  if (body.account !== "persistent") {
    throw new Error("Refusing local accountability repair outside persistent paper mode.");
  }
  const requestedSource = normalizeChoice(config.source ?? body.source ?? "sample", ["sample", "live-dex"], "sample");
  if (requestedSource === "live-dex" && (!body.route_refresh || body.autonomous_session)) {
    throw new Error("Refusing live-dex accountability repair unless the backend repair plan is read-only route refresh.");
  }
  if (body.source !== "sample" && body.source !== "live-dex") {
    throw new Error("Refusing local accountability repair outside sample or read-only live-dex mode.");
  }
  return {
    ...body,
    scenario: body.scenario ?? config.scenario,
    source: requestedSource,
    account: "persistent",
  };
}

function repairRequestKind(body) {
  if (body.route_refresh) return "route-refresh";
  if (body.autonomous_session?.policy_mode === "manual" && body.autonomous_session?.protect_book === true) return "preflight-repair";
  if (body.autonomous_session) return "paper-session";
  return "unknown";
}

function assertPaperOnlyState(state, label) {
  const plan = state?.autonomous_profit_accountability?.repair_plan;
  const liveGate = state?.execution_gate?.live_execution_enabled === true;
  if (liveGate) throw new Error(`Refusing ${label} repair because live execution is enabled.`);
  if (plan) assertPaperOnlyPlan(plan, label);
}

function assertPaperOnlyPlan(plan, label) {
  if (plan.live_execution_permission !== "blocked" || plan.wallet_mutation_permission !== "blocked") {
    throw new Error(`Refusing ${label} repair because live or wallet mutation permission is not blocked.`);
  }
}

function buildRepairEvent({ attempt, status, reason, beforeScore, afterScore, beforePlan, plan, requestKind }) {
  return {
    attempt,
    status,
    request_kind: requestKind ?? "none",
    before_score: Number(beforeScore ?? 0),
    after_score: Number(afterScore ?? beforeScore ?? 0),
    score_delta: Number(afterScore ?? beforeScore ?? 0) - Number(beforeScore ?? 0),
    before_repair_status: beforePlan?.status ?? plan?.status ?? "missing",
    after_repair_status: plan?.status ?? "missing",
    weakest_item_id: plan?.weakest_item_id ?? beforePlan?.weakest_item_id ?? null,
    recommended_ticks: plan?.recommended_ticks ?? beforePlan?.recommended_ticks ?? 0,
    recommended_max_total_fills: plan?.recommended_max_total_fills ?? beforePlan?.recommended_max_total_fills ?? 0,
    live_execution_permission: plan?.live_execution_permission ?? "blocked",
    wallet_mutation_permission: plan?.wallet_mutation_permission ?? "blocked",
    reason: reason ?? "No next action returned.",
  };
}

function localAccountabilityRepairSummary(status, finalScore, scoreDelta, targetScore, postedCount) {
  if (status === "complete") return `Local paper accountability cleared ${finalScore}/100 after ${postedCount} posted repair attempt${postedCount === 1 ? "" : "s"}.`;
  if (status === "improved") return `Local paper accountability improved by ${scoreDelta} points to ${finalScore}/100; target is ${targetScore}/100.`;
  if (status === "blocked") return `Local paper accountability repair is blocked at ${finalScore}/100.`;
  if (status === "no-progress") return `Local paper accountability stayed at ${finalScore}/100 after ${postedCount} posted repair attempt${postedCount === 1 ? "" : "s"}.`;
  return `Local paper accountability repair did not need to post a request; current score is ${finalScore}/100.`;
}

function localAccountabilityRepairNextAction(status, finalPlan, blockers, targetScore) {
  if (status === "complete") return "Review the local paper wallet curve, promoted proof, and launch checklist before any stronger autonomy claim.";
  if (status === "improved") return `Run another bounded local paper repair only if the next repair plan still targets less than ${targetScore}/100.`;
  if (blockers.length > 0) return blockers[0];
  return finalPlan?.next_action ?? "Refresh the Web3 trading state and inspect the local paper repair plan.";
}

async function fetchTradingState(config) {
  const url = new URL("/api/web3-trading", config.baseUrl);
  url.searchParams.set("scenario", config.scenario);
  url.searchParams.set("source", config.source);
  url.searchParams.set("account", "persistent");
  url.searchParams.set("reset", "false");
  url.searchParams.set("advance", "false");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  return readJson(response, "fetch trading state");
}

async function postTradingState(config, body) {
  const response = await fetch(new URL("/api/web3-trading", config.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  return readJson(response, "post repair request");
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

function uniqueText(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

export function sanitizeLocalAccountabilityRepairReceipt(report) {
  if (!report || typeof report !== "object") return null;
  if (report.mode !== "web3-local-accountability-repair" || report.paper_only !== true) return null;
  if (report.live_execution_permission !== "blocked" || report.wallet_mutation_permission !== "blocked") return null;
  const allowedStatuses = new Set(["complete", "blocked", "improved", "no-progress", "not-run"]);
  const status = allowedStatuses.has(report.status) ? report.status : "blocked";
  const controls = Array.isArray(report.controls) ? report.controls : [];
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  return {
    mode: "web3-local-accountability-repair",
    paper_only: true,
    status,
    updated_at: safeIso(report.finished_at ?? report.updated_at),
    target_score: boundedInteger(report.target_score, 70, 1, 100),
    attempts_requested: boundedInteger(report.attempts_requested, 0, 0, 100),
    attempts_posted: boundedInteger(report.attempts_posted, 0, 0, 100),
    initial_accountability_score: boundedInteger(report.initial_accountability_score, 0, 0, 100),
    final_accountability_score: boundedInteger(report.final_accountability_score, 0, 0, 100),
    score_delta: cleanNumber(report.score_delta),
    initial_making_money: report.initial_making_money === true,
    final_making_money: report.final_making_money === true,
    final_repair_status: safeText(report.final_repair_status, "missing", 80),
    final_repair_action: report.final_repair_action ? safeText(report.final_repair_action, "", 260) : null,
    final_blocking_reason: report.final_blocking_reason ? safeText(report.final_blocking_reason, "", 260) : null,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    blockers: blockers.map((item) => safeText(item, "", 260)).filter(Boolean).slice(0, 8),
    summary: safeText(report.summary, "Local paper accountability repair receipt was written.", 260),
    next_action: safeText(report.next_action, "Inspect the local paper repair plan before another repair attempt.", 260),
    controls: [
      ...controls.map((item) => safeText(item, "", 260)).filter(Boolean),
      "This persisted receipt is sanitized paper-only evidence; it contains no provider keys, private keys, raw transactions, signed payloads, or wallet authority.",
    ].slice(0, 8),
  };
}

export function writeLocalAccountabilityRepairReceipt(report, statusPath = DEFAULT_STATUS_PATH) {
  const receipt = sanitizeLocalAccountabilityRepairReceipt(report);
  if (!receipt) return null;
  const dir = dirname(statusPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(statusPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function safeIso(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function safeText(value, fallback, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function cleanNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

async function main() {
  const config = parseLocalAccountabilityRepairArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3LocalAccountabilityRepair(config);
    writeLocalAccountabilityRepairReceipt(report, config.statusPath);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`${report.status}: ${report.summary}`);
    console.log(`Score: ${report.initial_accountability_score}/100 -> ${report.final_accountability_score}/100; posted ${report.attempts_posted}/${report.attempts_requested}.`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.report?.exit_code ?? 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

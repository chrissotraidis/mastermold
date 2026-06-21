#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";

export function parseLiveCanaryProofArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_LIVE_CANARY_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_LIVE_CANARY_SOURCE ?? "live-dex", ["sample", "live-dex"], "live-dex"),
    account: normalizeChoice(flags.get("account") ?? env.WEB3_LIVE_CANARY_ACCOUNT ?? "persistent", ["ephemeral", "persistent"], "persistent"),
    attempts: positiveInteger(flags.get("attempts") ?? env.WEB3_LIVE_CANARY_PROOF_ATTEMPTS, 1, 1, 20),
    intervalMs: positiveInteger(flags.get("interval-ms") ?? env.WEB3_LIVE_CANARY_PROOF_INTERVAL_MS, 5_000, 0, 300_000),
    maxFillUsd: positiveNumber(flags.get("max-fill-usd") ?? env.WEB3_LIVE_CANARY_MAX_FILL_USD, null, 10, 10_000),
    runWatchdog: booleanFlag(flags.get("run-watchdog") ?? env.WEB3_LIVE_CANARY_RUN_WATCHDOG, false),
    applyMirror: booleanFlag(flags.get("apply-mirror") ?? env.WEB3_LIVE_CANARY_APPLY_MIRROR, true),
    searchTransactionHistory: booleanFlag(flags.get("search-transaction-history") ?? env.WEB3_LIVE_CANARY_SEARCH_HISTORY, true),
    commitment: normalizeChoice(flags.get("commitment") ?? env.WEB3_LIVE_CANARY_COMMITMENT ?? "confirmed", ["confirmed", "finalized"], "confirmed"),
    failOnIncomplete: booleanFlag(flags.get("fail-on-incomplete") ?? env.WEB3_LIVE_CANARY_FAIL_ON_INCOMPLETE, true),
    json: booleanFlag(flags.get("json") ?? env.WEB3_LIVE_CANARY_JSON, false),
  };
}

export async function runWeb3LiveCanaryProof(input = {}) {
  const config = {
    ...parseLiveCanaryProofArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(input.source ?? "live-dex", ["sample", "live-dex"], "live-dex"),
    account: normalizeChoice(input.account ?? "persistent", ["ephemeral", "persistent"], "persistent"),
    attempts: positiveInteger(input.attempts, 1, 1, 20),
    intervalMs: positiveInteger(input.intervalMs, 5_000, 0, 300_000),
    maxFillUsd: positiveNumber(input.maxFillUsd, null, 10, 10_000),
    runWatchdog: Boolean(input.runWatchdog),
    applyMirror: input.applyMirror !== false,
    searchTransactionHistory: input.searchTransactionHistory !== false,
    commitment: normalizeChoice(input.commitment ?? "confirmed", ["confirmed", "finalized"], "confirmed"),
    failOnIncomplete: input.failOnIncomplete !== false,
  };
  const fetchImpl = input.fetchImpl ?? fetch;
  let receipt = input.receipt ?? null;
  let lastReceipt = receipt;
  let watchdog = null;
  let watchdogRunCount = 0;
  const attempts = [];

  for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
    receipt = receipt ?? await fetchCanaryReceipt(config, fetchImpl);
    lastReceipt = receipt;
    const snapshot = summarizeReceipt(receipt);
    attempts.push({ attempt, ...snapshot });
    if (snapshot.complete) break;

    if (config.runWatchdog && receipt.latest_signature_preview) {
      watchdog = await runSettlementWatchdog(config, fetchImpl);
      watchdogRunCount += 1;
      receipt = await fetchCanaryReceipt(config, fetchImpl);
      lastReceipt = receipt;
      const refreshed = summarizeReceipt(receipt);
      attempts.push({ attempt, after_watchdog: true, ...refreshed });
      if (refreshed.complete) break;
    } else {
      receipt = null;
    }

    if (attempt < config.attempts && config.intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
    }
  }

  const report = buildLiveCanaryProofReport({ config, receipt: lastReceipt, watchdog, watchdogRunCount, attempts });
  if (config.failOnIncomplete && report.exit_code !== 0) {
    const error = new Error(report.blockers[0] ?? "Live canary proof is incomplete.");
    error.report = report;
    throw error;
  }
  return report;
}

export function buildLiveCanaryProofReport({ config, receipt, watchdog = null, watchdogRunCount = 0, attempts = [] }) {
  const evidence = Array.isArray(receipt?.post_signing_evidence) ? receipt.post_signing_evidence : [];
  const passedProofCount = evidence.filter((item) => item.status === "pass").length;
  const complete = Boolean(
    receipt?.actual_live_trade_tested === true &&
      receipt?.real_funds_moved_by_this_app === true &&
      receipt?.post_signing_evidence_status === "settlement-accounted" &&
      evidence.length === 4 &&
      evidence.every((item) => item.status === "pass"),
  );
  const blockers = [
    !receipt ? "No live canary receipt could be loaded." : null,
    receipt && receipt.source !== "live-dex" ? "Live canary proof must use source=live-dex." : null,
    receipt && receipt.account !== "persistent" ? "Live canary proof must use account=persistent." : null,
    receipt && receipt.actual_live_trade_tested !== true ? "No confirmed funded live canary has been tested by this app yet." : null,
    receipt && receipt.latest_signature_preview === null ? "No signed live canary relay signature is recorded yet." : null,
    receipt && !["confirmed", "finalized"].includes(receipt.latest_confirmation_status) ? "No confirmed or finalized chain status is recorded for the canary signature." : null,
    receipt && receipt.post_signing_evidence_status !== "settlement-accounted" ? `Post-signing proof is ${receipt.post_signing_evidence_status}; settlement-accounted is required.` : null,
    evidence.length > 0 && evidence.some((item) => item.status !== "pass") ? "Signed relay, chain confirmation, settlement reconciliation, and portfolio mirror proof must all pass." : null,
  ].filter(Boolean);
  const status = complete
    ? "settlement-accounted"
    : receipt?.post_signing_evidence_status ?? "missing-receipt";

  return {
    mode: "web3-live-canary-proof",
    status,
    complete,
    exit_code: complete ? 0 : 1,
    base_url: config.baseUrl,
    source: config.source,
    account: config.account,
    scenario: config.scenario,
    attempts_requested: config.attempts,
    attempts_observed: attempts.length,
    watchdog_requested: config.runWatchdog,
    watchdog_run_count: watchdogRunCount,
    watchdog_status: watchdog?.autonomous_settlement_watchdog?.status ?? "not-run",
    watchdog_action: watchdog?.autonomous_settlement_watchdog?.action ?? "none",
    actual_live_trade_tested: receipt?.actual_live_trade_tested === true,
    real_funds_moved_by_this_app: receipt?.real_funds_moved_by_this_app === true,
    canary_status: receipt?.status ?? "missing",
    signed_relay_status: receipt?.signed_relay_status ?? "missing",
    latest_signature_preview: receipt?.latest_signature_preview ?? null,
    latest_confirmation_status: receipt?.latest_confirmation_status ?? null,
    confirmation_poll_status: receipt?.confirmation_poll_status ?? "not-run",
    settlement_reconciliation_status: receipt?.settlement_reconciliation_status ?? "not-run",
    settlement_watchdog_status: receipt?.settlement_watchdog_status ?? "not-run",
    portfolio_mirror_status: receipt?.portfolio_mirror_status ?? "not-run",
    post_signing_evidence_status: receipt?.post_signing_evidence_status ?? "missing-receipt",
    passed_proof_count: passedProofCount,
    required_proof_count: 4,
    post_signing_next_action: receipt?.post_signing_next_action ?? "Load the live canary receipt before proof watching.",
    blockers: [...new Set(blockers)],
    attempts,
    next_action: complete
      ? "Run the strict live-canary verifier, then review risk caps before allowing another canary."
      : receipt?.post_signing_next_action ?? blockers[0] ?? "Request and sign a tiny funded canary before proof watching.",
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    controls: [
      "This command watches canary proof only; it cannot create, sign, submit, or store transactions.",
      "With --run-watchdog it can call the existing guarded settlement watchdog for the latest stored signature.",
      "It exits nonzero until signed relay, chain confirmation, settlement reconciliation, and portfolio mirror proof all pass.",
      "Private keys, seed phrases, raw transactions, signed payloads, wallet authority, and live execution remain blocked.",
    ],
  };
}

async function fetchCanaryReceipt(config, fetchImpl) {
  const url = new URL("/api/web3-live-trade-canary", config.baseUrl);
  url.searchParams.set("source", config.source);
  url.searchParams.set("account", config.account);
  url.searchParams.set("scenario", config.scenario);
  url.searchParams.set("cycles", "0");
  return await requestJson(url, { method: "GET" }, fetchImpl);
}

async function runSettlementWatchdog(config, fetchImpl) {
  const body = {
    scenario: config.scenario,
    source: "live-dex",
    account: "persistent",
    cycles: 0,
    advance: false,
    settlement_watchdog: {
      action: "run",
      apply_mirror: config.applyMirror,
      commitment: config.commitment,
      search_transaction_history: config.searchTransactionHistory,
      ...(config.maxFillUsd ? { max_fill_usd: config.maxFillUsd } : {}),
    },
  };
  return await requestJson(new URL("/api/web3-trading", config.baseUrl), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }, fetchImpl);
}

async function requestJson(url, init, fetchImpl) {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON from ${url.pathname}, got ${text.slice(0, 220)}`);
  }
  if (!response.ok || json?.error) {
    throw new Error(`${url.pathname} failed: ${json?.error ?? response.status}`);
  }
  return json;
}

function summarizeReceipt(receipt) {
  const evidence = Array.isArray(receipt?.post_signing_evidence) ? receipt.post_signing_evidence : [];
  return {
    status: receipt?.status ?? "missing",
    actual_live_trade_tested: receipt?.actual_live_trade_tested === true,
    post_signing_evidence_status: receipt?.post_signing_evidence_status ?? "missing",
    latest_signature_preview: receipt?.latest_signature_preview ?? null,
    latest_confirmation_status: receipt?.latest_confirmation_status ?? null,
    passed_proof_count: evidence.filter((item) => item.status === "pass").length,
    complete: Boolean(
      receipt?.actual_live_trade_tested === true &&
        receipt?.real_funds_moved_by_this_app === true &&
        receipt?.post_signing_evidence_status === "settlement-accounted" &&
        evidence.length === 4 &&
        evidence.every((item) => item.status === "pass"),
    ),
  };
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function booleanFlag(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function positiveInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function positiveNumber(value, fallback, min, max) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function main() {
  const config = parseLiveCanaryProofArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3LiveCanaryProof(config);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`${report.status}: ${report.complete ? "funded canary proof accounted" : report.blockers[0]}`);
    console.log(`Proof: ${report.passed_proof_count}/${report.required_proof_count}; next: ${report.next_action}`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.report?.exit_code ?? 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

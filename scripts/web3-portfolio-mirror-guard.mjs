#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { buildSettlementReconciliationReport } from "./web3-settlement-reconciliation.mjs";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_MAX_MIRROR_FILL_USD = 1_000;

export function parsePortfolioMirrorGuardArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_MIRROR_GUARD_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_MIRROR_GUARD_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    maxMirrorFillUsd: positiveNumber(flags.get("max-mirror-fill-usd") ?? env.WEB3_MIRROR_GUARD_MAX_FILL_USD, DEFAULT_MAX_MIRROR_FILL_USD),
    requireReconciledFill: booleanFlag(flags.get("require-reconciled-fill") ?? env.WEB3_MIRROR_GUARD_REQUIRE_RECONCILED_FILL, false),
    failOnUnsafe: booleanFlag(flags.get("fail-on-unsafe") ?? env.WEB3_MIRROR_GUARD_FAIL_ON_UNSAFE, true),
    json: booleanFlag(flags.get("json") ?? env.WEB3_MIRROR_GUARD_JSON, false),
  };
}

export async function runWeb3PortfolioMirrorGuard(input = {}) {
  const config = {
    ...parsePortfolioMirrorGuardArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    maxMirrorFillUsd: positiveNumber(input.maxMirrorFillUsd, DEFAULT_MAX_MIRROR_FILL_USD),
    requireReconciledFill: Boolean(input.requireReconciledFill),
    failOnUnsafe: input.failOnUnsafe !== false,
  };
  const state = input.state ?? await fetchTradingState(config);
  const report = buildPortfolioMirrorGuardReport({ config, state });
  if (config.failOnUnsafe && report.exit_code !== 0) {
    const error = new Error(report.blockers[0] ?? "Portfolio mirror guard failed.");
    error.report = report;
    throw error;
  }
  return report;
}

export function buildPortfolioMirrorGuardReport({ config, state }) {
  const settlement = buildSettlementReconciliationReport({
    config: {
      baseUrl: config.baseUrl,
      scenario: config.scenario,
      source: config.source,
      requireReconciledRelay: config.requireReconciledFill,
    },
    state,
  });
  const relay = state?.signed_transaction_relay ?? null;
  const audit = state?.execution_audit ?? null;
  const latest = audit?.latest ?? null;
  const lifecycleItems = Array.isArray(state?.transaction_lifecycle?.items) ? state.transaction_lifecycle.items : [];
  const handoffItems = Array.isArray(state?.autonomous_order_handoff?.items) ? state.autonomous_order_handoff.items : [];
  const relaySignature = stringValue(relay?.latest_signature) ?? stringValue(latest?.relay_signature);
  const requestId = stringValue(relay?.request_id) ?? stringValue(latest?.request_id);
  const payloadHash = stringValue(relay?.payload_hash) ?? stringValue(latest?.payload_hash);
  const planId = stringValue(relay?.latest_plan_id) ?? stringValue(latest?.plan_id);
  const landed = lifecycleItems.find((item) => item?.stage === "landed" && evidenceMatches({ item, requestId, payloadHash, planId })) ?? null;
  const handoff = handoffItems.find((item) => evidenceMatches({ item, requestId, payloadHash, planId })) ?? null;
  const fillNotionalUsd = numberValue(handoff?.notional_usd);
  const idempotencyKey = relaySignature && requestId && payloadHash
    ? `mirror:${relaySignature}:${requestId}:${payloadHash}`
    : null;
  const expectedBlockers = [];
  const unsafeBlockers = [];

  if (settlement.status === "blocked-as-expected") {
    expectedBlockers.push("No confirmed signed relay exists, so the portfolio mirror remains blocked as expected.");
  }
  if (settlement.status === "polling-required") {
    expectedBlockers.push("Relay exists but confirmation polling is still required before any mirror update.");
  }
  if (settlement.status === "blocked") {
    unsafeBlockers.push(...settlement.blockers);
  }
  if (config.requireReconciledFill && settlement.status !== "reconciled") {
    unsafeBlockers.push("A reconciled landed fill is required for this portfolio mirror guard.");
  }

  if (settlement.status === "reconciled") {
    if (!relaySignature) unsafeBlockers.push("Confirmed mirror update requires the relay signature.");
    if (!requestId) unsafeBlockers.push("Confirmed mirror update requires the original request id.");
    if (!payloadHash) unsafeBlockers.push("Confirmed mirror update requires the payload hash.");
    if (!idempotencyKey) unsafeBlockers.push("Confirmed mirror update requires a deterministic idempotency key.");
    if (!landed) unsafeBlockers.push("Confirmed mirror update must match a landed lifecycle item.");
    if (!handoff) unsafeBlockers.push("Confirmed mirror update must match an autonomous order handoff item.");
    if (fillNotionalUsd === null || fillNotionalUsd <= 0) unsafeBlockers.push("Confirmed mirror update requires positive bounded fill notional evidence.");
    if (fillNotionalUsd !== null && fillNotionalUsd > config.maxMirrorFillUsd) {
      unsafeBlockers.push(`Confirmed mirror fill notional $${round(fillNotionalUsd)} exceeds the $${round(config.maxMirrorFillUsd)} guard cap.`);
    }
  }

  const status = unsafeBlockers.length > 0
    ? "blocked"
    : settlement.status === "reconciled"
      ? "mirror-ready"
      : settlement.status === "polling-required"
        ? "polling-required"
        : "blocked-as-expected";

  return {
    mode: "web3-portfolio-mirror-guard",
    paper_only: true,
    status,
    exit_code: unsafeBlockers.length > 0 ? 1 : 0,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    settlement_status: settlement.status,
    relay_status: settlement.relay_status,
    lifecycle_status: settlement.lifecycle_status,
    relay_signature_present: Boolean(relaySignature),
    request_id_present: Boolean(requestId),
    payload_hash_present: Boolean(payloadHash),
    landed_lifecycle_present: Boolean(landed),
    order_handoff_present: Boolean(handoff),
    order_handoff_id: handoff?.id ?? null,
    fill_symbol: handoff?.symbol ?? latest?.symbol ?? relay?.latest_symbol ?? null,
    fill_side: handoff?.side ?? latest?.side ?? relay?.latest_side ?? null,
    fill_notional_usd: fillNotionalUsd,
    max_mirror_fill_usd: config.maxMirrorFillUsd,
    idempotency_key: idempotencyKey,
    portfolio_mirror_permission: status === "mirror-ready" ? "audit-ready" : "blocked",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    next_action: portfolioMirrorNextAction(status, unsafeBlockers, expectedBlockers, settlement),
    blockers: [...new Set(unsafeBlockers)],
    expected_blockers: expectedBlockers,
    summary: portfolioMirrorSummary(status, unsafeBlockers, expectedBlockers, fillNotionalUsd),
    controls: [
      "This drill never writes the portfolio, signs a transaction, submits a swap, polls chain state, or moves wallet funds.",
      "A mirror-ready fill must have confirmed settlement, landed lifecycle evidence, relay signature, request id, payload hash, idempotency key, and bounded handoff notional.",
      "Default local review remains blocked-as-expected because no real signed relay and landed fill exist.",
      "Live execution stays blocked even when the local mirror evidence is audit-ready; a future live executor must apply the fill through an explicit reviewed path.",
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

function evidenceMatches({ item, requestId, payloadHash, planId }) {
  if (!item || typeof item !== "object") return false;
  return Boolean(
    (requestId && item.request_id === requestId) ||
    (payloadHash && item.payload_hash === payloadHash) ||
    (planId && item.plan_id === planId),
  );
}

function portfolioMirrorSummary(status, blockers, expectedBlockers, fillNotionalUsd) {
  if (status === "blocked") return `Portfolio mirror guard is blocked: ${blockers[0]}`;
  if (status === "mirror-ready") return `Confirmed fill evidence is audit-ready for a bounded $${round(fillNotionalUsd ?? 0)} portfolio mirror update.`;
  if (status === "polling-required") return expectedBlockers[0] ?? "Confirmation polling must finish before the portfolio mirror can update.";
  return expectedBlockers[0] ?? "Portfolio mirror is blocked as expected until confirmed settlement evidence exists.";
}

function portfolioMirrorNextAction(status, blockers, expectedBlockers, settlement) {
  if (status === "blocked") return blockers[0] ?? "Resolve portfolio mirror evidence blockers before applying a fill.";
  if (status === "mirror-ready") return "Apply the fill only through a reviewed idempotent portfolio-mirror writer; keep live execution blocked.";
  if (status === "polling-required") return settlement.next_action ?? "Poll confirmation before portfolio mirror reconciliation.";
  return expectedBlockers[0] ?? settlement.next_action ?? "Keep the portfolio mirror blocked until signed settlement evidence exists.";
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

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

async function main() {
  const config = parsePortfolioMirrorGuardArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3PortfolioMirrorGuard(config);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`${report.status}: ${report.summary}`);
    console.log(`Settlement: ${report.settlement_status}; mirror: ${report.portfolio_mirror_permission}; next: ${report.next_action}`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.report?.exit_code ?? 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

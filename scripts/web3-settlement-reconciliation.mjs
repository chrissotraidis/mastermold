#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";

export function parseSettlementReconciliationArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_SETTLEMENT_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_SETTLEMENT_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    requireReconciledRelay: booleanFlag(flags.get("require-reconciled-relay") ?? env.WEB3_SETTLEMENT_REQUIRE_RECONCILED_RELAY, false),
    failOnUnsafe: booleanFlag(flags.get("fail-on-unsafe") ?? env.WEB3_SETTLEMENT_FAIL_ON_UNSAFE, true),
    json: booleanFlag(flags.get("json") ?? env.WEB3_SETTLEMENT_JSON, false),
  };
}

export async function runWeb3SettlementReconciliation(input = {}) {
  const config = {
    ...parseSettlementReconciliationArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    requireReconciledRelay: Boolean(input.requireReconciledRelay),
    failOnUnsafe: input.failOnUnsafe !== false,
  };
  const state = input.state ?? await fetchTradingState(config);
  const report = buildSettlementReconciliationReport({ config, state });
  if (config.failOnUnsafe && report.exit_code !== 0) {
    const error = new Error(report.blockers[0] ?? "Settlement reconciliation failed.");
    error.report = report;
    throw error;
  }
  return report;
}

export function buildSettlementReconciliationReport({ config, state }) {
  const relay = state?.signed_transaction_relay ?? null;
  const lifecycle = state?.transaction_lifecycle ?? null;
  const audit = state?.execution_audit ?? null;
  const latest = audit?.latest ?? null;
  const lifecycleItems = Array.isArray(lifecycle?.items) ? lifecycle.items : [];
  const lifecycleStages = lifecycleItems.map((item) => item.stage).filter(Boolean);
  const hasRelayedStatus = relay?.status === "relayed" || latest?.status === "relayed";
  const hasConfirmedStatus = relay?.status === "confirmed" || latest?.status === "confirmed";
  const hasRelaySignature = Boolean(relay?.latest_signature || latest?.relay_signature);
  const hasRequestId = Boolean(relay?.request_id || latest?.request_id);
  const hasPayloadHash = Boolean(relay?.payload_hash || latest?.payload_hash);
  const hasConfirmationStatus = Boolean(relay?.confirmation_status || latest?.confirmation_status);
  const hasConfirmingLifecycle = lifecycleStages.some((stage) => stage === "submitted" || stage === "confirming" || stage === "landed");
  const hasLandedLifecycle = lifecycleStages.includes("landed");
  const requiresPolling = hasRelayedStatus && !hasConfirmedStatus;
  const unsafeBlockers = [
    !relay ? "Trading state did not include signed transaction relay status." : null,
    !lifecycle ? "Trading state did not include transaction lifecycle status." : null,
    hasRelayedStatus && !hasRelaySignature ? "Relayed status requires a stored relay signature for polling." : null,
    hasRelayedStatus && !hasRequestId ? "Relayed status requires the original request id." : null,
    hasRelayedStatus && !hasPayloadHash ? "Relayed status requires the payload hash for audit matching." : null,
    hasRelayedStatus && !hasConfirmingLifecycle ? "Relayed status requires a submitted or confirming lifecycle item." : null,
    hasConfirmedStatus && !hasConfirmationStatus ? "Confirmed relay requires an explicit confirmation status." : null,
    hasConfirmedStatus && !hasLandedLifecycle ? "Confirmed relay requires a landed lifecycle item before portfolio reconciliation." : null,
    config.requireReconciledRelay && !hasConfirmedStatus ? "A confirmed relay is required for this reconciliation gate." : null,
  ].filter(Boolean);
  const status = unsafeBlockers.length > 0
    ? "blocked"
    : hasConfirmedStatus
      ? "reconciled"
      : hasRelayedStatus
        ? "polling-required"
        : "blocked-as-expected";

  return {
    mode: "web3-settlement-reconciliation",
    paper_only: true,
    status,
    exit_code: unsafeBlockers.length > 0 ? 1 : 0,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    relay_status: relay?.status ?? "missing",
    lifecycle_status: lifecycle?.status ?? "missing",
    latest_audit_status: latest?.status ?? "missing",
    latest_signature_present: hasRelaySignature,
    request_id_present: hasRequestId,
    payload_hash_present: hasPayloadHash,
    confirmation_status: relay?.confirmation_status ?? latest?.confirmation_status ?? null,
    requires_confirmation_polling: requiresPolling,
    landed_lifecycle_present: hasLandedLifecycle,
    submitted_or_confirming_lifecycle_present: hasConfirmingLifecycle,
    lifecycle_stages: lifecycleStages,
    live_execution_permission: "blocked",
    next_action: settlementNextAction(status, relay, lifecycle, unsafeBlockers),
    blockers: unsafeBlockers,
    summary: settlementSummary(status, relay, lifecycle, unsafeBlockers),
    controls: [
      "This drill reconciles local relay, lifecycle, and audit metadata only; it never submits, polls a chain, signs, or mutates wallet funds.",
      "Relayed status must retain signature, request id, payload hash, and a confirming lifecycle before another autonomous action can continue.",
      "Confirmed status must map to a landed lifecycle before portfolio reconciliation is treated as complete.",
      "Default local state should be blocked-as-expected until a future live executor records real signed relay evidence.",
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

function settlementSummary(status, relay, lifecycle, blockers) {
  if (status === "blocked") return `Settlement reconciliation is blocked: ${blockers[0]}`;
  if (status === "reconciled") return "Signed relay is confirmed and mapped to a landed lifecycle item.";
  if (status === "polling-required") return "Signed relay exists and must keep polling confirmation before portfolio reconciliation.";
  return `No live signed relay exists; settlement reconciliation is blocked as expected while relay is ${relay?.status ?? "missing"} and lifecycle is ${lifecycle?.status ?? "missing"}.`;
}

function settlementNextAction(status, relay, lifecycle, blockers) {
  if (status === "blocked") return blockers[0] ?? "Resolve settlement blockers before accepting another live action.";
  if (status === "reconciled") return "Record fill details through the audited live portfolio mirror before allowing another autonomous order.";
  if (status === "polling-required") return relay?.next_action ?? "Poll signature status until confirmed or finalized.";
  return lifecycle?.summary ?? "Keep live execution blocked until a signed relay exists.";
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

async function main() {
  const config = parseSettlementReconciliationArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3SettlementReconciliation(config);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`${report.status}: ${report.summary}`);
    console.log(`Relay: ${report.relay_status}; lifecycle: ${report.lifecycle_status}; next: ${report.next_action}`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.report?.exit_code ?? 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

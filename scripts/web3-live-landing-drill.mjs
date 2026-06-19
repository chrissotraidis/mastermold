#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";

export function parseLiveLandingDrillArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_LANDING_DRILL_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_LANDING_DRILL_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    allowLiveReady: booleanFlag(flags.get("allow-live-ready") ?? env.WEB3_LANDING_DRILL_ALLOW_LIVE_READY, false),
    failOnUnsafe: booleanFlag(flags.get("fail-on-unsafe") ?? env.WEB3_LANDING_DRILL_FAIL_ON_UNSAFE, true),
    json: booleanFlag(flags.get("json") ?? env.WEB3_LANDING_DRILL_JSON, false),
  };
}

export async function runWeb3LiveLandingDrill(input = {}) {
  const config = {
    ...parseLiveLandingDrillArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    allowLiveReady: Boolean(input.allowLiveReady),
    failOnUnsafe: input.failOnUnsafe !== false,
  };
  const state = input.state ?? await fetchTradingState(config);
  const report = buildLiveLandingDrillReport({ config, state });
  if (config.failOnUnsafe && report.exit_code !== 0) {
    const error = new Error(report.blockers[0] ?? "Live landing drill failed.");
    error.report = report;
    throw error;
  }
  return report;
}

export function buildLiveLandingDrillReport({ config, state }) {
  const liveReadiness = state?.autonomous_live_autonomy_readiness ?? null;
  const landing = state?.autonomous_landing_optimizer ?? null;
  const preSubmit = state?.pre_submit_rehearsal ?? null;
  const adapter = state?.autonomous_execution_adapter_readiness ?? null;
  const lifecycle = state?.transaction_lifecycle ?? null;
  const executionReadiness = state?.execution_readiness ?? null;
  const cost = state?.execution_cost_monitor ?? state?.execution_cost ?? null;
  const mev = state?.execution_mev_guard ?? null;
  const signedRelay = state?.signed_transaction_relay ?? null;

  const liveReady = liveReadiness?.can_trade_real_capital === true;
  const permissionWithoutOperatorConsent = liveReady && !config.allowLiveReady;
  const items = landingDrillItems({ liveReadiness, landing, preSubmit, adapter, lifecycle, executionReadiness, cost, mev, signedRelay });
  const failed = items.filter((item) => item.status === "fail");
  const watched = items.filter((item) => item.status === "watch");
  const hardEvidenceReady = failed.length === 0 && items.every((item) => item.status === "pass");
  const blockers = uniqueText([
    !liveReadiness ? "Trading state did not include autonomous live-readiness." : null,
    !landing ? "Trading state did not include autonomous landing optimizer evidence." : null,
    !preSubmit ? "Trading state did not include pre-submit rehearsal evidence." : null,
    !adapter ? "Trading state did not include execution adapter readiness evidence." : null,
    permissionWithoutOperatorConsent ? "Live readiness reports real-capital permission, but --allow-live-ready was not set." : null,
    ...failed.map((item) => item.blocker ?? item.detail),
  ]);

  const status = permissionWithoutOperatorConsent || blockers.length > 0 && liveReady
    ? "blocked"
    : liveReady && hardEvidenceReady && config.allowLiveReady
      ? "manual-live-review"
      : !liveReady
        ? "blocked-as-expected"
        : watched.length > 0
          ? "manual-review-required"
          : "paper-only";

  return {
    mode: "web3-live-landing-drill",
    paper_only: true,
    status,
    exit_code: status === "blocked" ? 1 : 0,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    live_readiness_status: liveReadiness?.status ?? "missing",
    live_can_trade_real_capital: liveReady,
    live_execution_permission: status === "manual-live-review" ? "manual-live-executor-review" : "blocked",
    landing_status: landing?.status ?? "missing",
    landing_path: landing?.selected_path ?? "missing",
    adapter_status: adapter?.status ?? "missing",
    active_adapter: adapter?.active_adapter ?? "missing",
    pre_submit_status: preSubmit?.status ?? "missing",
    transaction_lifecycle_status: lifecycle?.status ?? "missing",
    route_evidence_ready: itemPass(items, "route"),
    swap_order_ready: itemPass(items, "order"),
    blockhash_lifetime_ready: itemPass(items, "blockhash"),
    priority_fee_ready: itemPass(items, "fees"),
    slippage_guard_ready: itemPass(items, "slippage"),
    signer_ready: itemPass(items, "signer"),
    relay_ready: itemPass(items, "relay"),
    confirmation_ready: itemPass(items, "confirmation"),
    hard_fail_count: failed.length,
    watch_count: watched.length,
    blockers,
    summary: liveLandingDrillSummary(status, liveReadiness, landing, adapter, failed, watched),
    next_action: liveLandingDrillNextAction(status, liveReadiness, landing, adapter, failed, watched),
    controls: [
      "This drill never signs, submits, broadcasts, stores raw transactions, or moves funds.",
      "A future live path must prove fresh route evidence, Swap V2 order readiness, blockhash lifetime, priority-fee budget, slippage guard, signer policy, relay lock, and confirmation polling.",
      "Blocked-as-expected is a safe result while live execution remains disabled; it means the landing drill found the boundary closed.",
      "Manual live review is required even if every landing item passes, because autonomous real-capital trading is outside this paper runner.",
    ],
    items,
  };
}

function landingDrillItems({ liveReadiness, landing, preSubmit, adapter, lifecycle, executionReadiness, cost, mev, signedRelay }) {
  const lifecycleItems = Array.isArray(lifecycle?.items) ? lifecycle.items : [];
  const preSubmitItems = Array.isArray(preSubmit?.items) ? preSubmit.items : [];
  const liveItems = Array.isArray(liveReadiness?.items) ? liveReadiness.items : [];
  const routeItem = liveItems.find((item) => item.id === "route");
  const feeItem = liveItems.find((item) => item.id === "fees");
  const signerItem = liveItems.find((item) => item.id === "signer");
  const relayItem = liveItems.find((item) => item.id === "relay");
  const nonPaperPreSubmit = preSubmitItems.filter((item) => item.path !== "paper-ledger" && item.action !== "paper-only");
  const hasBlockhashLifetime = lifecycleItems.some((item) =>
    Number(item.last_valid_block_height) > 0 &&
    Number(item.expires_in_seconds) > 0 &&
    item.request_id &&
    item.payload_hash
  );
  const activeLifecycle = lifecycleItems.some((item) =>
    ["awaiting-signature", "signed-simulated", "submitted", "confirming", "landed"].includes(item.stage)
  );
  const feeReady = (landing?.priority_fee_lamports ?? 0) > 0 &&
    (landing?.compute_unit_limit ?? 0) > 0 &&
    (landing?.compute_unit_price_micro_lamports ?? 0) >= 0 &&
    preSubmitItems.every((item) => item.path === "paper-ledger" || item.checks?.some((check) => check.id === "fees" && check.status !== "fail"));
  const maxSlippage = executionReadiness?.config?.max_slippage_bps ?? landing?.max_slippage_bps ?? 0;
  const slippageReady = (landing?.max_slippage_bps ?? 0) > 0 &&
    (landing?.max_slippage_bps ?? 0) <= maxSlippage &&
    (mev?.status ? !["blocked"].includes(mev.status) : true);
  const confirmationReady = lifecycleItems.some((item) => ["submitted", "confirming", "landed"].includes(item.stage)) ||
    signedRelay?.confirmation_status === "confirmed" ||
    signedRelay?.confirmation_status === "finalized";

  return [
    {
      id: "route",
      label: "Route evidence",
      status: adapter?.quote_request_ready && routeItem?.status !== "fail" ? "pass" : routeItem?.status === "fail" ? "fail" : "watch",
      score: adapter?.readiness_score ?? routeItem?.score ?? 0,
      detail: routeItem?.detail ?? adapter?.summary ?? "No route readiness item is available.",
      blocker: routeItem?.blocker ?? (!adapter?.quote_request_ready ? adapter?.next_action : null) ?? null,
    },
    {
      id: "order",
      label: "Swap order",
      status: adapter?.swap_v2_order_ready ? "pass" : adapter?.status === "blocked" ? "fail" : "watch",
      score: adapter?.swap_v2_order_ready ? 86 : adapter?.status === "blocked" ? 24 : 48,
      detail: adapter?.swap_v2_order_ready ? "Swap V2 request id or payload hash is present." : adapter?.next_action ?? "No Swap V2 order evidence is available.",
      blocker: adapter?.swap_v2_order_ready ? null : adapter?.next_action ?? "Build a Swap V2 order before signer review.",
    },
    {
      id: "blockhash",
      label: "Blockhash lifetime",
      status: hasBlockhashLifetime ? "pass" : nonPaperPreSubmit.length > 0 ? "fail" : "watch",
      score: hasBlockhashLifetime ? 90 : activeLifecycle ? 52 : 34,
      detail: hasBlockhashLifetime ? "A request id, payload hash, last valid block height, and positive expiry window are attached." : "No live blockhash lifetime evidence is attached to the current landing path.",
      blocker: hasBlockhashLifetime ? null : "Fetch a fresh blockhash/order expiry immediately before any signature request.",
    },
    {
      id: "fees",
      label: "Priority fees",
      status: feeReady ? "pass" : feeItem?.status === "fail" ? "fail" : "watch",
      score: feeReady ? 84 : feeItem?.score ?? 40,
      detail: `${formatLamports(landing?.priority_fee_lamports ?? 0)} priority fee, ${(landing?.compute_unit_limit ?? 0).toLocaleString("en-US")} CU limit, ${(landing?.compute_unit_price_micro_lamports ?? 0).toLocaleString("en-US")} micro-lamports/CU.`,
      blocker: feeReady ? null : feeItem?.blocker ?? "Estimate priority fee and compute unit budget before live landing.",
    },
    {
      id: "slippage",
      label: "Slippage guard",
      status: slippageReady ? "pass" : (landing?.max_slippage_bps ?? 0) > maxSlippage ? "fail" : "watch",
      score: slippageReady ? 82 : 42,
      detail: `${landing?.max_slippage_bps ?? 0} bps landing cap against ${maxSlippage} bps execution cap; cost status ${cost?.status ?? "missing"}.`,
      blocker: slippageReady ? null : "Tighten slippage and MEV guard before any live route can be trusted.",
    },
    {
      id: "signer",
      label: "Signer policy",
      status: adapter?.signer_ready && signerItem?.status === "pass" ? "pass" : signerItem?.status === "fail" ? "fail" : "watch",
      score: signerItem?.score ?? (adapter?.signer_ready ? 72 : 28),
      detail: signerItem?.detail ?? "Signer readiness is not attached.",
      blocker: signerItem?.blocker ?? (!adapter?.signer_ready ? "Signer policy and custody scope must pass before requesting signatures." : null),
    },
    {
      id: "relay",
      label: "Relay lock",
      status: adapter?.submit_ready && relayItem?.status === "pass" ? "pass" : relayItem?.status === "fail" ? "fail" : "watch",
      score: relayItem?.score ?? (adapter?.submit_ready ? 78 : 26),
      detail: relayItem?.detail ?? signedRelay?.summary ?? "Relay readiness is not attached.",
      blocker: relayItem?.blocker ?? (!adapter?.submit_ready ? "Signed relay and submit lock must pass before broadcasting." : null),
    },
    {
      id: "confirmation",
      label: "Confirmation polling",
      status: confirmationReady ? "pass" : activeLifecycle ? "watch" : "watch",
      score: confirmationReady ? 86 : activeLifecycle ? 58 : 36,
      detail: confirmationReady ? "A submitted lifecycle or confirmed relay record is present." : "No live signature is submitted; confirmation polling remains a rehearsal boundary.",
      blocker: confirmationReady ? null : "Poll signature status and reconcile fills before another autonomous action after any future submission.",
    },
    {
      id: "boundary",
      label: "Live boundary",
      status: liveReadiness?.can_trade_real_capital === true ? "watch" : "pass",
      score: liveReadiness?.can_trade_real_capital === true ? 58 : 100,
      detail: liveReadiness?.can_trade_real_capital === true ? "Live readiness reports permission; require manual executor review." : "Real-capital trading remains blocked, so the drill is safely paper-only.",
      blocker: liveReadiness?.can_trade_real_capital === true ? "Manual live executor review required before any real-capital run." : null,
    },
  ];
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

function itemPass(items, id) {
  return items.find((item) => item.id === id)?.status === "pass";
}

function liveLandingDrillSummary(status, liveReadiness, landing, adapter, failed, watched) {
  if (status === "blocked") return `Live landing drill is blocked: ${failed[0]?.blocker ?? failed[0]?.detail ?? "unsafe live permission"}`;
  if (status === "manual-live-review") return "Live landing evidence passes locally, but a separate manual live executor review is still required.";
  if (status === "manual-review-required") return `${watched.length} landing item${watched.length === 1 ? "" : "s"} still need manual review before real-capital automation.`;
  if (status === "blocked-as-expected") return `Landing drill is safely blocked because live readiness is ${liveReadiness?.status ?? "missing"}; adapter is ${adapter?.status ?? "missing"} and landing path is ${landing?.selected_path ?? "missing"}.`;
  return "Landing drill remains paper-only; no live-capital permission is granted.";
}

function liveLandingDrillNextAction(status, liveReadiness, landing, adapter, failed, watched) {
  if (status === "blocked") return failed[0]?.blocker ?? liveReadiness?.next_action ?? "Keep live landing blocked.";
  if (status === "manual-live-review") return "Review custody, blockhash, priority fee, slippage, relay, and confirmation evidence outside the paper runner before any live executor is armed.";
  const firstFail = failed.find((item) => item.id !== "boundary");
  if (firstFail) return firstFail.blocker ?? firstFail.detail;
  const firstWatch = watched.find((item) => item.id !== "boundary");
  if (firstWatch) return firstWatch.blocker ?? firstWatch.detail;
  return adapter?.next_action ?? landing?.next_action ?? liveReadiness?.next_action ?? "Keep collecting landing evidence in paper mode.";
}

function uniqueText(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function boundedBooleanText(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function booleanFlag(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return boundedBooleanText(value);
}

function formatLamports(value) {
  const safe = Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  return `${safe.toLocaleString("en-US")} lamports`;
}

async function main() {
  const config = parseLiveLandingDrillArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3LiveLandingDrill(config);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`${report.status}: ${report.summary}`);
    console.log(`Landing: ${report.landing_status}; adapter: ${report.adapter_status}; permission: ${report.live_execution_permission}.`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.report?.exit_code ?? 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

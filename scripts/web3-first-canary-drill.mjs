#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";
const CANARY_ACK = "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED";

export function parseFirstCanaryDrillArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_FIRST_CANARY_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_FIRST_CANARY_SOURCE ?? "live-dex", ["sample", "live-dex"], "live-dex"),
    account: normalizeChoice(flags.get("account") ?? env.WEB3_FIRST_CANARY_ACCOUNT ?? "persistent", ["ephemeral", "persistent"], "persistent"),
    walletPublicKey: normalizeOptionalText(flags.get("wallet") ?? env.WEB3_FIRST_CANARY_WALLET_PUBLIC_KEY),
    amountLamports: positiveInteger(flags.get("amount-lamports") ?? env.WEB3_FIRST_CANARY_AMOUNT_LAMPORTS, 100_000, 1, 1_000_000_000),
    requireReady: booleanFlag(flags.get("require-ready") ?? env.WEB3_FIRST_CANARY_REQUIRE_READY, false),
    json: booleanFlag(flags.get("json") ?? env.WEB3_FIRST_CANARY_JSON, false),
  };
}

export async function runWeb3FirstCanaryDrill(input = {}) {
  const config = {
    ...parseFirstCanaryDrillArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(input.source ?? "live-dex", ["sample", "live-dex"], "live-dex"),
    account: normalizeChoice(input.account ?? "persistent", ["ephemeral", "persistent"], "persistent"),
    walletPublicKey: normalizeOptionalText(input.walletPublicKey),
    amountLamports: positiveInteger(input.amountLamports, 100_000, 1, 1_000_000_000),
    requireReady: Boolean(input.requireReady),
  };
  const fetchImpl = input.fetchImpl ?? fetch;
  const tradingState = input.tradingState ?? await fetchTradingState(config, fetchImpl);
  const walletPublicKey = config.walletPublicKey ?? tradingState?.execution_readiness?.config?.wallet_public_key ?? null;
  const [
    blockers,
    readiness,
    jupiter,
    unsignedPreflight,
    canary,
  ] = await Promise.all([
    input.blockers ?? fetchLiveUsabilityBlockers(config, fetchImpl),
    input.readiness ?? fetchCanaryReadiness(config, fetchImpl),
    input.jupiter ?? fetchJupiterOrderPacket(config, fetchImpl),
    input.unsignedPreflight ?? fetchUnsignedPreflight({ ...config, walletPublicKey }, fetchImpl),
    input.canary ?? fetchLiveCanary(config, fetchImpl),
  ]);
  const report = buildFirstCanaryDrillReport({
    config,
    tradingState,
    walletPublicKey,
    blockers,
    readiness,
    jupiter,
    unsignedPreflight,
    canary,
  });
  if (config.requireReady && report.status !== "ready-to-request-unsigned-order" && report.status !== "ready-to-relay-signed-payload" && report.status !== "canary-proven") {
    const error = new Error(report.next_action);
    error.report = { ...report, exit_code: 1 };
    throw error;
  }
  return report;
}

export function buildFirstCanaryDrillReport({
  config,
  tradingState,
  walletPublicKey,
  blockers,
  readiness,
  jupiter,
  unsignedPreflight,
  canary,
}) {
  const proofPassCount = Array.isArray(canary?.post_signing_evidence)
    ? canary.post_signing_evidence.filter((item) => item.status === "pass").length
    : 0;
  const permissionBreach = [
    hasUnexpectedPermission(canary?.live_execution_permission),
    hasUnexpectedPermission(canary?.wallet_mutation_permission),
    hasUnexpectedPermission(canary?.transaction_submission_permission),
    hasUnexpectedPermission(unsignedPreflight?.private_key_storage),
    hasUnexpectedPermission(unsignedPreflight?.seed_phrase_storage),
  ].some(Boolean);
  const status = canary?.actual_live_trade_tested && canary?.real_funds_moved_by_this_app
    ? "canary-proven"
    : readiness?.can_relay_signed_payload_now
      ? "ready-to-relay-signed-payload"
      : readiness?.can_request_unsigned_order_now && unsignedPreflight?.can_request_one_shot_unsigned_order
        ? "ready-to-request-unsigned-order"
        : permissionBreach
          ? "unsafe-permission-drift"
          : "blocked";
  const lanes = buildCanaryDrillLanes({
    tradingState,
    walletPublicKey,
    blockers,
    readiness,
    jupiter,
    unsignedPreflight,
    canary,
    proofPassCount,
  });
  const failed = lanes.filter((lane) => lane.status === "fail");
  const watched = lanes.filter((lane) => lane.status === "watch");
  const nextLane = lanes.find((lane) => lane.status === "fail") ?? lanes.find((lane) => lane.status === "watch") ?? null;
  const operatorUnblockPlan = buildFirstCanaryUnblockPlan({ blockers, readiness, jupiter, unsignedPreflight, canary }, lanes);
  const nextUnblockStep = operatorUnblockPlan.find((step) => step.status === "next") ??
    operatorUnblockPlan.find((step) => step.status === "watch") ??
    null;
  const blockersText = uniqueText([
    permissionBreach ? "A canary receipt exposed unexpected live execution, transaction submission, wallet mutation, or secret-storage permission." : null,
    nextLane?.next_action,
    ...(Array.isArray(blockers?.missing_for_live_usability)
      ? blockers.missing_for_live_usability
        .filter(isFirstCanaryScopedLiveUsabilityBlocker)
        .slice(0, 6)
        .map((item) => item.next_action)
      : []),
    ...(Array.isArray(readiness?.blockers) ? readiness.blockers.slice(0, 6) : []),
    ...(Array.isArray(canary?.blockers) ? canary.blockers.slice(0, 6) : []),
  ]);
  const nextAction = status === "canary-proven"
    ? "Run the strict live-canary verifier, then review risk caps before another canary."
    : status === "ready-to-relay-signed-payload"
      ? "Relay only the matching externally signed tiny canary payload, then run proof watcher until settlement is accounted."
      : status === "ready-to-request-unsigned-order"
        ? "Request one tiny unsigned order, sign it in the browser wallet, relay the signed payload, then stop for proof."
    : nextLane?.next_action ?? blockers?.next_action ?? readiness?.next_action ?? canary?.next_action ?? "Complete the next first-canary blocker.";

  return {
    mode: "web3-first-canary-drill",
    status,
    exit_code: status === "unsafe-permission-drift" ? 1 : 0,
    base_url: config.baseUrl,
    source: config.source,
    account: config.account,
    scenario: config.scenario,
    wallet_public_key_present: typeof walletPublicKey === "string" && walletPublicKey.length > 0,
    wallet_public_key_preview: previewValue(walletPublicKey),
    amount_lamports: config.amountLamports,
    current_input_label: blockers?.current_input?.label ?? null,
    next_blocker_label: blockers?.next_blocker?.label ?? null,
    next_credential_label: blockers?.next_credential_request?.label ?? null,
    supervised_canary_status: readiness?.status ?? "missing",
    can_request_unsigned_order_now: readiness?.can_request_unsigned_order_now === true,
    unsigned_preflight_status: unsignedPreflight?.status ?? "missing",
    unsigned_order_handoff_ready: unsignedPreflight?.can_request_one_shot_unsigned_order === true,
    jupiter_order_status: jupiter?.status ?? "missing",
    signed_relay_status: canary?.signed_relay_status ?? "missing",
    actual_live_trade_tested: canary?.actual_live_trade_tested === true,
    real_funds_moved_by_this_app: canary?.real_funds_moved_by_this_app === true,
    post_signing_evidence_status: canary?.post_signing_evidence_status ?? "missing",
    proof_pass_count: proofPassCount,
    proof_required_count: 4,
    hard_fail_count: failed.length,
    watch_count: watched.length,
    next_lane_id: nextLane?.id ?? null,
    next_lane_label: nextLane?.label ?? null,
    next_lane_status: nextLane?.status ?? null,
    next_lane_action: nextLane?.next_action ?? null,
    next_action: nextAction,
    next_unblock_step: nextUnblockStep,
    operator_unblock_plan: operatorUnblockPlan,
    blockers: blockersText,
    safe_commands: uniqueText([
      "npm run verify:web3 -- --base-url=http://localhost:4010",
      blockers?.next_credential_request?.verifier_command,
      readiness?.strict_verifier_command,
      "npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json",
    ]),
    safe_surfaces: uniqueText([
      blockers?.next_credential_request?.fix_href,
      blockers?.next_blocker?.href,
      "/trading?source=live-dex&account=persistent",
      "/settings/integrations#settings-web3-credentials-runway",
    ]),
    controls: [
      "This drill is read-only; it uses GET receipts and cannot sign, submit, broadcast, store transaction bytes, or move funds.",
      "It checks the live usability blocker, first-funded-canary ladder, Jupiter order packet, unsigned-order preflight, and live canary proof receipt together.",
      "A ready-to-request-unsigned-order result still requires an external browser-wallet signature and guarded signed-payload relay.",
      "Paper and read-only DEX evidence never count as an actual live trade.",
    ],
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    lanes,
  };
}

function buildFirstCanaryUnblockPlan(input, lanes) {
  const steps = lanes
    .filter((lane) => lane.id !== "live-boundary")
    .map((lane) => buildFirstCanaryUnblockStep(lane, input));
  let nextAssigned = false;

  return steps.map((step) => {
    if (step.status === "done") return step;
    if (!nextAssigned) {
      nextAssigned = true;
      return { ...step, status: step.status === "watch" ? "watch" : "next" };
    }
    return { ...step, status: "blocked" };
  });
}

function buildFirstCanaryUnblockStep(lane, input) {
  return {
    id: lane.id,
    phase: firstCanaryUnblockPhase(lane.id),
    label: lane.label,
    status: lane.status === "pass" ? "done" : lane.status === "watch" ? "watch" : "blocked",
    action: lane.next_action,
    safe_surface: firstCanarySafeSurface(lane, input),
    command: firstCanaryUnblockCommand(lane, input),
    completion_signal: firstCanaryCompletionSignal(lane.id),
    blocks_funded_canary: lane.status !== "pass" && lane.id !== "post-signing-proof",
  };
}

function buildCanaryDrillLanes({ tradingState, walletPublicKey, blockers, readiness, jupiter, unsignedPreflight, canary, proofPassCount }) {
  const readinessLanes = Array.isArray(readiness?.lanes) ? readiness.lanes : [];
  const laneById = new Map(readinessLanes.map((lane) => [lane.id, lane]));
  const walletConfigured = typeof walletPublicKey === "string" && walletPublicKey.length > 0;
  const liveScopeReady = canary?.source === "live-dex" && canary?.account === "persistent";
  const configuredMode = tradingState?.execution_readiness?.config?.mode ?? "missing";
  const killSwitch = tradingState?.execution_readiness?.config?.kill_switch === true;
  return [
    drillLaneFromReadiness("live-scope", laneById, {
      fallbackStatus: liveScopeReady ? "pass" : "fail",
      label: "Live DEX scope",
      detail: liveScopeReady ? "The drill is reading live-dex/persistent canary receipts." : "Open the live DEX persistent canary scope.",
      next_action: liveScopeReady ? "Keep live canary scope on live-dex/persistent." : "Open /trading?source=live-dex&account=persistent before canary work.",
    }),
    drillLaneFromReadiness("dedicated-wallet", laneById, {
      fallbackStatus: walletConfigured ? "watch" : "fail",
      label: "Dedicated wallet",
      detail: walletConfigured ? `A public wallet value is scoped in ${configuredMode} mode; kill switch ${killSwitch ? "on" : "off"}.` : "No public wallet is scoped for the drill.",
      next_action: walletConfigured ? "Reject sample scope and prove wallet ownership before live review." : "Save only a dedicated public Solana wallet address.",
    }),
    drillLaneFromReadiness("wallet-ownership", laneById, {
      fallbackStatus: blockers?.current_input?.id === "wallet-ownership-proof" ? "fail" : "watch",
      label: "Wallet ownership proof",
      detail: blockers?.current_input?.label ?? "Wallet ownership proof is not confirmed in this drill.",
      next_action: blockers?.current_input?.next_action ?? "Use browser-wallet text signing to create a hash-only ownership receipt.",
    }),
    drillLaneFromReadiness("jupiter-order", laneById, {
      fallbackStatus: jupiter?.status === "ready" ? "pass" : "fail",
      label: "Jupiter order rail",
      detail: jupiter?.next_action ?? jupiter?.summary ?? "Jupiter order packet is missing.",
      next_action: jupiter?.next_action ?? "Configure Jupiter order proof before requesting an unsigned canary.",
    }),
    drillLaneFromReadiness("unsigned-order-preflight", laneById, {
      fallbackStatus: unsignedPreflight?.can_request_one_shot_unsigned_order ? "pass" : "fail",
      label: "Unsigned canary preflight",
      detail: unsignedPreflight?.next_action ?? "Unsigned-order preflight is missing.",
      next_action: unsignedPreflight?.next_action ?? "Run the unsigned handoff preflight after wallet, Jupiter, flags, and caps are ready.",
    }),
    drillLaneFromReadiness("signer-relay", laneById, {
      fallbackStatus: canary?.can_submit_from_app_now ? "watch" : "fail",
      label: "Signed relay",
      detail: canary?.signed_relay_status ?? "Signed relay status is missing.",
      next_action: canary?.post_signing_next_action ?? "Relay only a matching externally signed canary payload after preflight.",
    }),
    {
      id: "post-signing-proof",
      label: "Post-signing proof",
      status: canary?.actual_live_trade_tested && proofPassCount === 4 ? "pass" : canary?.latest_signature_preview ? "watch" : "fail",
      detail: `${proofPassCount}/4 proof stages pass; status ${canary?.post_signing_evidence_status ?? "missing"}.`,
      next_action: canary?.post_signing_next_action ?? "Relay a signed canary before confirmation and settlement proof.",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: canary?.live_execution_permission === "blocked" && canary?.wallet_mutation_permission === "blocked" ? "pass" : "fail",
      detail: "Live execution, transaction submission, wallet mutation, private-key storage, and seed phrase storage must remain blocked in this drill.",
      next_action: "Do not treat this drill as permission to trade; use it to clear the next safe blocker.",
    },
  ];
}

function firstCanaryUnblockPhase(id) {
  if (id === "live-scope" || id === "dedicated-wallet" || id === "wallet-ownership") return "credential-intake";
  if (id === "jupiter-order" || id === "live-flags") return "route-readiness";
  if (id === "unsigned-order-preflight") return "canary-request";
  if (id === "signer-relay" || id === "manual-live-review") return "external-signature";
  if (id === "post-signing-proof" || id === "funded-canary-proof") return "proof-watch";
  return "safety-boundary";
}

function firstCanarySafeSurface(lane, input) {
  if (lane.id === "dedicated-wallet") return "/settings/integrations#settings-web3-wallet-public-key";
  if (lane.id === "wallet-ownership") return "/trading?source=live-dex&account=persistent";
  if (lane.id === "jupiter-order") return "/settings/integrations#web3-credential-action-console";
  if (lane.id === "live-flags") return "/settings/integrations#web3-credential-action-console";
  if (lane.id === "unsigned-order-preflight") return "/trading?source=live-dex&account=persistent";
  if (lane.id === "signer-relay") return input.readiness?.canary_endpoint ?? "/api/web3-live-trade-canary?source=live-dex&account=persistent";
  if (lane.id === "manual-live-review") return "/api/web3-manual-live-review-packet?source=live-dex&account=persistent";
  if (lane.id === "funded-canary-proof" || lane.id === "post-signing-proof") return "/trading?source=live-dex&account=persistent";
  if (lane.id === "live-scope") return "/trading?source=live-dex&account=persistent";
  return input.blockers?.next_blocker?.href ?? "/api/web3-first-canary-drill?source=live-dex&account=persistent&scenario=breakout&cycles=0";
}

function firstCanaryUnblockCommand(lane, input) {
  if (lane.id === "dedicated-wallet" || lane.id === "wallet-ownership") {
    return input.blockers?.next_credential_request?.verifier_command ??
      "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet";
  }
  if (lane.id === "jupiter-order") return input.jupiter?.strict_verifier_command ?? "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order";
  if (lane.id === "live-flags" || lane.id === "unsigned-order-preflight") return input.readiness?.strict_verifier_command ?? "npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json --require-ready";
  if (lane.id === "signer-relay" || lane.id === "manual-live-review") return "npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json --require-ready";
  if (lane.id === "funded-canary-proof" || lane.id === "post-signing-proof") return "npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json";
  return input.unsignedPreflight?.status === "ready" ? input.readiness?.strict_verifier_command ?? null : null;
}

function firstCanaryCompletionSignal(id) {
  if (id === "live-scope") return "The drill receipt is scoped to source=live-dex and account=persistent.";
  if (id === "dedicated-wallet") return "A non-sample public Solana wallet is saved; no private key, seed phrase, or keypair JSON was accepted.";
  if (id === "wallet-ownership") return "A browser wallet signs the text-only ownership challenge and the app stores hash-only proof.";
  if (id === "jupiter-order") return "Jupiter Swap V2 order proof is ready without exposing transaction bytes or API-key values.";
  if (id === "live-flags") return "The reviewed live canary env flags are set exactly in ignored server env.";
  if (id === "unsigned-order-preflight") return "The tiny canary unsigned-order preflight returns ready while transaction bytes remain gated to the one-shot handoff.";
  if (id === "signer-relay") return "Only the matching externally signed tiny canary payload can be relayed; signed bytes are not stored.";
  if (id === "manual-live-review") return "Manual live review, caps, kill switch, accounting, and operator signoffs are recorded as passing.";
  if (id === "funded-canary-proof") return "A real canary signature is relayed, confirmed, settlement-reconciled, and mirrored into the local portfolio.";
  if (id === "post-signing-proof") return "Signed relay, chain confirmation, settlement reconciliation, and portfolio mirror proof all pass.";
  return "The safety boundary still blocks app-side private-key storage, seed phrases, signing, submission, wallet mutation, and secret echo.";
}

function drillLaneFromReadiness(id, laneById, fallback) {
  const lane = laneById.get(id);
  return {
    id,
    label: lane?.label ?? fallback.label,
    status: lane?.status ?? fallback.fallbackStatus,
    detail: lane?.detail ?? fallback.detail,
    next_action: lane?.next_action ?? fallback.next_action,
  };
}

async function fetchTradingState(config, fetchImpl) {
  const url = new URL("/api/web3-trading", config.baseUrl);
  url.searchParams.set("source", config.source);
  url.searchParams.set("account", config.account);
  url.searchParams.set("scenario", config.scenario);
  url.searchParams.set("cycles", "0");
  url.searchParams.set("advance", "false");
  return await requestJson(url, fetchImpl);
}

async function fetchLiveUsabilityBlockers(config, fetchImpl) {
  const url = new URL("/api/web3-live-usability-blockers", config.baseUrl);
  addCommonParams(url, config);
  url.searchParams.set("rows", "all");
  return await requestJson(url, fetchImpl);
}

async function fetchCanaryReadiness(config, fetchImpl) {
  const url = new URL("/api/web3-supervised-canary-readiness", config.baseUrl);
  addCommonParams(url, config);
  return await requestJson(url, fetchImpl);
}

async function fetchJupiterOrderPacket(config, fetchImpl) {
  const url = new URL("/api/web3-jupiter-order-packet", config.baseUrl);
  addCommonParams(url, config);
  return await requestJson(url, fetchImpl);
}

async function fetchUnsignedPreflight(config, fetchImpl) {
  const url = new URL("/api/web3-live-unsigned-order-handoff", config.baseUrl);
  addCommonParams(url, config);
  url.searchParams.set("operator_ack", "true");
  url.searchParams.set("canary_ack", CANARY_ACK);
  url.searchParams.set("amount_lamports", String(config.amountLamports));
  if (config.walletPublicKey) url.searchParams.set("wallet_public_key", config.walletPublicKey);
  return await requestJson(url, fetchImpl);
}

async function fetchLiveCanary(config, fetchImpl) {
  const url = new URL("/api/web3-live-trade-canary", config.baseUrl);
  addCommonParams(url, config);
  return await requestJson(url, fetchImpl);
}

function addCommonParams(url, config) {
  url.searchParams.set("source", config.source);
  url.searchParams.set("account", config.account);
  url.searchParams.set("scenario", config.scenario);
  url.searchParams.set("cycles", "0");
}

async function requestJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
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

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeOptionalText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
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

function previewValue(value) {
  if (!value) return null;
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function uniqueText(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function hasUnexpectedPermission(value) {
  return typeof value === "string" && value !== "blocked";
}

function isFirstCanaryScopedLiveUsabilityBlocker(item) {
  if (item?.source === "preflight") return false;
  return !/(paper sizing|dry-run|backfill|profit gate|paper wallet)/i.test(item?.next_action ?? "");
}

async function main() {
  const config = parseFirstCanaryDrillArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3FirstCanaryDrill(config);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`${report.status}: ${report.next_action}`);
    console.log(`Proof: ${report.proof_pass_count}/${report.proof_required_count}; blockers: ${report.hard_fail_count}; safe command: ${report.safe_commands[0]}`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.report?.exit_code ?? 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

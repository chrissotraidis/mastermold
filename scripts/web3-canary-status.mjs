#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_SOURCE = "live-dex";
const DEFAULT_ACCOUNT = "persistent";
const DEFAULT_SCENARIO = "breakout";
const DEFAULT_CYCLES = "0";
const UNSAFE_FLAG_KEYS = [
  "privatekey",
  "seedphrase",
  "mnemonic",
  "keypair",
  "walletsecret",
  "rawtransaction",
  "unsignedtransaction",
  "signedtransaction",
  "signedpayload",
  "apikey",
  "secret",
  "seed",
  "recoveryphrase",
];

const STRICT_GATE_MAP = new Map([
  ["dedicated-public-wallet", "wallet-scope"],
  ["wallet-ownership-proof", "wallet-ownership"],
  ["jupiter-order-rail", "route-order"],
]);

export function parseCanaryStatusArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_CANARY_STATUS_BASE_URL ?? DEFAULT_BASE_URL),
    source: String(flags.get("source") ?? env.WEB3_CANARY_STATUS_SOURCE ?? DEFAULT_SOURCE),
    account: String(flags.get("account") ?? env.WEB3_CANARY_STATUS_ACCOUNT ?? DEFAULT_ACCOUNT),
    scenario: String(flags.get("scenario") ?? env.WEB3_CANARY_STATUS_SCENARIO ?? DEFAULT_SCENARIO),
    cycles: String(flags.get("cycles") ?? env.WEB3_CANARY_STATUS_CYCLES ?? DEFAULT_CYCLES),
    json: booleanFlag(flags.get("json") ?? env.WEB3_CANARY_STATUS_JSON, false),
    help: flags.has("help") || flags.has("h"),
    unsafeFlags: unsafeFlagNames(flags),
  };
}

export async function runWeb3CanaryStatus(input = {}) {
  const config = {
    ...parseCanaryStatusArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    source: input.source ?? DEFAULT_SOURCE,
    account: input.account ?? DEFAULT_ACCOUNT,
    scenario: input.scenario ?? DEFAULT_SCENARIO,
    cycles: String(input.cycles ?? DEFAULT_CYCLES),
    unsafeFlags: input.unsafeFlags ?? [],
    fetchImpl: input.fetchImpl ?? fetch,
  };

  assert(config.unsafeFlags.length === 0, `Unsafe canary status flags are not accepted: ${config.unsafeFlags.join(", ")}.`);

  const query = new URLSearchParams({
    source: config.source,
    account: config.account,
    scenario: config.scenario,
    cycles: config.cycles,
  }).toString();
  const [canaryResult, ignitionResult, localResult] = await Promise.all([
    requestJson(config, `/api/web3-live-trade-canary?${query}`, "live canary"),
    requestJson(config, `/api/web3-live-ignition?${query}`, "live ignition"),
    requestJson(config, "/api/web3-local-credentials", "local credentials"),
  ]);

  const packet = buildCanaryStatusPacket({
    canary: canaryResult.receipt,
    ignition: ignitionResult.receipt,
    local: localResult.receipt,
    http: {
      canary: canaryResult.status,
      ignition: ignitionResult.status,
      local: localResult.status,
    },
  });
  verifyCanaryStatusPacket(packet);
  return packet;
}

function usage() {
  return [
    "Usage: npm run --silent status-canary:web3 -- [--base-url=http://localhost:4010] [--json]",
    "",
    "Reads the running app's live canary, ignition, and local credential receipts together.",
    "This command only performs GET requests. Do not pass API keys, private keys, seed phrases, signed payloads, or transaction bodies.",
  ].join("\n");
}

async function requestJson(config, path, label) {
  const response = await config.fetchImpl(`${config.baseUrl}${path}`, {
    method: "GET",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  assertNoUnsafeLeak(`${label} response`, text);
  let receipt;
  try {
    receipt = text ? JSON.parse(text) : null;
  } catch {
    fail(`${label} should return JSON.`, text);
  }
  return { status: response.status, text, receipt };
}

export function buildCanaryStatusPacket({ canary, ignition, local, http = {} }) {
  verifySourceReceipts(canary, ignition, local, http);
  const nextInputId = canary.next_required_input?.id ?? null;
  const expectedIgnitionGate = nextInputId ? STRICT_GATE_MAP.get(nextInputId) ?? null : null;
  const aligned = expectedIgnitionGate ? ignition.next_gate_id === expectedIgnitionGate : true;
  const alignmentDetail = expectedIgnitionGate
    ? `Canary next input ${nextInputId} maps to ignition gate ${ignition.next_gate_id}.`
    : `Canary next input ${nextInputId ?? "none"} has no strict ignition mapping.`;

  assert(aligned, "Live canary and ignition disagree on the next gate.", {
    canary_next_required_input: nextInputId,
    expected_ignition_gate: expectedIgnitionGate,
    actual_ignition_gate: ignition.next_gate_id,
    canary_next_action: canary.next_action,
    ignition_next_action: ignition.next_action,
  });

  const canStartSupervisedCanary = Boolean(ignition.can_start_supervised_canary_now);
  const canAutonomouslyTrade = Boolean(ignition.can_autonomously_trade_real_money_now);
  const actualLiveTradeTested = Boolean(canary.actual_live_trade_tested || ignition.actual_live_trade_tested);
  const realFundsMoved = Boolean(canary.real_funds_moved_by_this_app || ignition.real_funds_moved_by_this_app);
  const status = canAutonomouslyTrade
    ? "can-autonomously-trade"
    : actualLiveTradeTested && realFundsMoved
      ? "canary-proven"
      : canStartSupervisedCanary
      ? "ready-for-supervised-canary"
      : "blocked";
  const endpointParams = `source=${ignition.source}&account=${ignition.account}&scenario=${ignition.scenario}&cycles=0`;
  const safeNextCommands = buildSafeNextCommands(canary, endpointParams);

  return {
    mode: "web3-canary-status",
    status,
    source: ignition.source,
    account: ignition.account,
    scenario: ignition.scenario,
    actual_live_trade_tested: actualLiveTradeTested,
    real_funds_moved_by_this_app: realFundsMoved,
    can_start_supervised_canary_now: canStartSupervisedCanary,
    can_autonomously_trade_real_money_now: canAutonomouslyTrade,
    next_gate_id: ignition.next_gate_id,
    next_gate_label: ignition.next_gate_label,
    next_required_input_id: nextInputId,
    next_required_input_label: canary.next_required_input?.label ?? null,
    next_action: ignition.next_action || canary.next_action,
    safe_next_commands: safeNextCommands,
    blocker_count: Math.max(Number(ignition.blocker_count ?? 0), Array.isArray(canary.blockers) ? canary.blockers.length : 0),
    signed_relay_status: canary.signed_relay_status,
    current_request_id: canary.current_request_id ?? null,
    latest_signature_preview: canary.latest_signature_preview ?? null,
    local_credentials: {
      status: local.status,
      configured_count: Array.isArray(local.configured_keys) ? local.configured_keys.length : 0,
      missing_count: Array.isArray(local.missing_keys) ? local.missing_keys.length : 0,
      configured_keys: local.configured_keys ?? [],
      missing_keys: local.missing_keys ?? [],
      next_action: local.runtime_effective_next_action ?? local.next_action,
    },
    alignment: {
      status: "pass",
      detail: alignmentDetail,
    },
    http_status: http,
    canary_endpoint: `/api/web3-live-trade-canary?${endpointParams}`,
    ignition_endpoint: `/api/web3-live-ignition?${endpointParams}`,
    local_credentials_endpoint: "/api/web3-local-credentials",
    transaction_submission_permission: canary.transaction_submission_permission,
    live_execution_permission: ignition.live_execution_permission,
    wallet_mutation_permission: ignition.wallet_mutation_permission,
    private_key_storage: ignition.private_key_storage,
    seed_phrase_storage: ignition.seed_phrase_storage,
    secret_echo_permission: ignition.secret_echo_permission,
    controls: [
      "This command reconciles live-canary truth, bot ignition, and local credential status from the running app.",
      "A running app can be tested without executing a funded trade; actual_live_trade_tested stays false until the signed canary proof chain is real.",
      "Private keys, seed phrases, API key values, raw transactions, signed payload storage, wallet mutation, and secret echo remain blocked.",
    ],
  };
}

function buildSafeNextCommands(canary, endpointParams) {
  const nextInput = canary.next_required_input;
  const common = {
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
  };
  const commands = [];

  if (nextInput?.id === "dedicated-public-wallet") {
    commands.push(
      {
        id: "validate-public-wallet",
        label: "Validate public wallet",
        command: "npm run validate-wallet:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --json",
        purpose: "Checks the public wallet and proof runway without saving state.",
        safe_surface: "/api/web3-dedicated-wallet-intake-contract",
        completion_signal: "The validation receipt reports valid-public-wallet and can_save_public_scope=true.",
        uses_placeholder: true,
        ...common,
      },
      {
        id: "save-public-wallet-scope",
        label: "Save public wallet scope",
        command: "npm run scope-wallet:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --save --json",
        purpose: "Saves only the dedicated public wallet and dry-run caps, then refreshes canary status.",
        safe_surface: nextInput.safe_surface,
        completion_signal: "The canary status next gate advances to wallet-ownership.",
        uses_placeholder: true,
        ...common,
      },
      {
        id: "fetch-wallet-ownership-challenge",
        label: "Fetch ownership challenge after scope",
        command: "npm run prove-wallet:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --json",
        purpose: "Fetches public text for browser-wallet ownership proof after the public wallet is scoped.",
        safe_surface: "/api/web3-wallet-ownership",
        completion_signal: "The command returns status=challenge-ready and message_base64 for external message signing.",
        uses_placeholder: true,
        ...common,
      },
    );
  } else if (nextInput?.id === "wallet-ownership-proof") {
    const scopedWallet = extractPublicWalletFromVerifierCommand(nextInput.verifier_command);
    const walletArg = scopedWallet ?? "<scoped-public-solana-address>";
    commands.push(
      {
        id: "fetch-wallet-ownership-challenge",
        label: "Fetch ownership challenge",
        command: `npm run prove-wallet:web3 -- --base-url=http://localhost:4010 --wallet=${walletArg} --json`,
        purpose: "Fetches the text-only challenge for the already scoped public wallet.",
        safe_surface: "/api/web3-wallet-ownership",
        completion_signal: "The command returns status=challenge-ready and message_base64 for external message signing.",
        uses_placeholder: scopedWallet === null,
        ...common,
      },
      {
        id: "submit-wallet-ownership-proof",
        label: "Submit ownership signature",
        command: `npm run prove-wallet:web3 -- --base-url=http://localhost:4010 --wallet=${walletArg} --message-base64=<challenge-text-base64> --signature-base64=<wallet-message-signature> --json`,
        purpose: "Submits an external browser-wallet message signature and stores hash-only proof.",
        safe_surface: "/api/web3-wallet-ownership",
        completion_signal: "The proof receipt reports proof-verified and the live canary sees wallet_ownership_current_for_canary=true.",
        uses_placeholder: true,
        ...common,
      },
    );
  }

  if (nextInput?.verifier_command) {
    commands.push({
      id: `${nextInput.id}-strict-verifier`,
      label: `${nextInput.label} verifier`,
      command: nextInput.verifier_command,
      purpose: "Runs the strict verifier for the current required input without granting live authority.",
      safe_surface: nextInput.safe_surface,
      completion_signal: nextInput.completion_signal,
      uses_placeholder: nextInput.verifier_command.includes("<"),
      ...common,
    });
  }

  commands.push({
    id: "rerun-canary-status",
    label: "Rerun canary status",
    command: "npm run status-canary:web3 -- --base-url=http://localhost:4010 --json",
    purpose: "Confirms the running app's next gate after the safe input is handled.",
    safe_surface: `/api/web3-canary-status?${endpointParams}`,
    completion_signal: "The status receipt shows the next gate changed, or still names the active blocker.",
    uses_placeholder: false,
    ...common,
  });

  const seen = new Set();
  return commands.filter((command) => {
    if (seen.has(command.command)) return false;
    seen.add(command.command);
    return true;
  }).slice(0, 5);
}

function extractPublicWalletFromVerifierCommand(command) {
  const match = command?.match(/--wallet=([1-9A-HJ-NP-Za-km-z]{32,44})(?:\s|$)/);
  return match?.[1] ?? null;
}

function verifySourceReceipts(canary, ignition, local, http) {
  assert(canary?.mode === "web3-live-trade-canary", "Live canary should expose the expected mode.", canary);
  assert(ignition?.mode === "web3-live-ignition", "Live ignition should expose the expected mode.", ignition);
  assert(local?.mode === "web3-local-credential-install", "Local credentials should expose the expected mode.", local);
  assert([200, 403, 422].includes(http.canary), "Live canary should use a known HTTP status.", http);
  assert([200, 403, 422].includes(http.ignition), "Live ignition should use a known HTTP status.", http);
  assert([200, 403, 422].includes(http.local), "Local credentials should use a known HTTP status.", http);
  assert(canary.actual_live_trade_tested === ignition.actual_live_trade_tested, "Canary and ignition disagree on actual live trade proof.", {
    canary_actual_live_trade_tested: canary.actual_live_trade_tested,
    ignition_actual_live_trade_tested: ignition.actual_live_trade_tested,
  });
  assert(canary.real_funds_moved_by_this_app === ignition.real_funds_moved_by_this_app, "Canary and ignition disagree on real fund movement.", {
    canary_real_funds_moved_by_this_app: canary.real_funds_moved_by_this_app,
    ignition_real_funds_moved_by_this_app: ignition.real_funds_moved_by_this_app,
  });
  if (!canary.actual_live_trade_tested) {
    assert(ignition.can_autonomously_trade_real_money_now === false, "Ignition cannot claim autonomy before a funded live canary is proven.", ignition);
  }
  assert(local.live_execution_permission === "blocked", "Local credentials must keep live execution blocked.", local);
  assert(local.wallet_mutation_permission === "blocked", "Local credentials must keep wallet mutation blocked.", local);
  assert(local.secret_echo_permission === "blocked", "Local credentials must keep secret echo blocked.", local);
  assert(canary.wallet_mutation_permission === "blocked", "Live canary must keep wallet mutation blocked.", canary);
  assert(canary.private_key_storage === "blocked", "Live canary must keep private key storage blocked.", canary);
  assert(canary.seed_phrase_storage === "blocked", "Live canary must keep seed phrase storage blocked.", canary);
  assert(canary.secret_echo_permission === "blocked", "Live canary must keep secret echo blocked.", canary);
  assert(ignition.wallet_mutation_permission === "blocked", "Live ignition must keep wallet mutation blocked.", ignition);
  assert(ignition.private_key_storage === "blocked", "Live ignition must keep private key storage blocked.", ignition);
  assert(ignition.seed_phrase_storage === "blocked", "Live ignition must keep seed phrase storage blocked.", ignition);
  assert(ignition.secret_echo_permission === "blocked", "Live ignition must keep secret echo blocked.", ignition);
  assert(typeof ignition.next_action === "string" && ignition.next_action.length > 0, "Ignition should include a next action.", ignition);
}

export function verifyCanaryStatusPacket(packet) {
  assert(packet.mode === "web3-canary-status", "Canary status packet should expose the expected mode.", packet);
  assert(["blocked", "ready-for-supervised-canary", "canary-proven", "can-autonomously-trade"].includes(packet.status), "Canary status should use a known status.", packet);
  assert(packet.alignment?.status === "pass", "Canary status should report receipt alignment.", packet);
  assert(Array.isArray(packet.safe_next_commands) && packet.safe_next_commands.length > 0, "Canary status should expose safe next commands.", packet);
  assert(packet.safe_next_commands.every((command) => command.live_execution_permission === "blocked" && command.transaction_submission_permission === "blocked" && command.wallet_mutation_permission === "blocked" && command.secret_echo_permission === "blocked"), "Safe next commands must keep live authority blocked.", packet.safe_next_commands);
  assert(packet.live_execution_permission === "blocked", "Canary status should keep live execution blocked until a separate launch gate changes it.", packet);
  assert(packet.wallet_mutation_permission === "blocked", "Canary status should keep wallet mutation blocked.", packet);
  assert(packet.private_key_storage === "blocked", "Canary status should keep private key storage blocked.", packet);
  assert(packet.seed_phrase_storage === "blocked", "Canary status should keep seed phrase storage blocked.", packet);
  assert(packet.secret_echo_permission === "blocked", "Canary status should keep secret echo blocked.", packet);
  assertNoUnsafeLeak("canary status packet", JSON.stringify(packet));
}

function markdown(packet) {
  const configured = summarizeKeys(packet.local_credentials.configured_keys);
  const missing = summarizeKeys(packet.local_credentials.missing_keys);
  return [
    "# Mastermind Web3 Canary Status",
    "",
    `Status: ${packet.status}`,
    `Actual funded trade tested: ${packet.actual_live_trade_tested ? "yes" : "no"}`,
    `Real funds moved by this app: ${packet.real_funds_moved_by_this_app ? "yes" : "no"}`,
    `Can autonomously trade real money now: ${packet.can_autonomously_trade_real_money_now ? "yes" : "no"}`,
    `Can start supervised canary now: ${packet.can_start_supervised_canary_now ? "yes" : "no"}`,
    `Next gate: ${packet.next_gate_id ?? "unknown"}${packet.next_gate_label ? ` (${packet.next_gate_label})` : ""}`,
    `Next required input: ${packet.next_required_input_id ?? "unknown"}${packet.next_required_input_label ? ` (${packet.next_required_input_label})` : ""}`,
    `Signed relay: ${packet.signed_relay_status ?? "unknown"}`,
    `Local credentials: ${packet.local_credentials.configured_count} configured, ${packet.local_credentials.missing_count} missing`,
    `Configured: ${configured}`,
    `Missing: ${missing}`,
    "",
    "## Next Action",
    packet.next_action,
    "",
    "## Safe Commands",
    ...packet.safe_next_commands.map((command) => `- ${command.label}: ${command.command}`),
    "",
    "## Alignment",
    packet.alignment.detail,
    "",
    "## Boundary",
    "- Live execution: blocked",
    "- Wallet mutation: blocked",
    "- Secret echo: blocked",
    "- This command does not POST, sign, submit, store wallet secrets, or move funds.",
  ].join("\n");
}

function summarizeKeys(keys, limit = 8) {
  if (!Array.isArray(keys) || keys.length === 0) return "none";
  const head = keys.slice(0, limit).join(", ");
  const remaining = keys.length - limit;
  return remaining > 0 ? `${head}, +${remaining} more` : head;
}

function unsafeFlagNames(flags) {
  return [...flags.keys()].filter((key) => {
    if (["base-url", "source", "account", "scenario", "cycles", "json", "help", "h"].includes(key)) return false;
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return UNSAFE_FLAG_KEYS.some((needle) => normalized.includes(needle));
  });
}

function assertNoUnsafeLeak(label, value) {
  assert(!/(private[_-]?key|seed[_-]?phrase|mnemonic|keypair|wallet[_-]?secret|recovery[_-]?phrase)["=:]\s*[A-Za-z0-9+/=_-]{8,}/i.test(value), `${label} leaked unsafe credential-shaped data.`);
  assert(!/(signed[_-]?payload|signed[_-]?transaction|raw[_-]?transaction|unsigned[_-]?transaction)["=:]\s*[A-Za-z0-9+/=_-]{8,}/i.test(value), `${label} leaked transaction-shaped data.`);
  assert(!/(api[_-]?key|helius[_-]?api[_-]?key|jupiter[_-]?api[_-]?key|privy[_-]?app[_-]?secret|turnkey[_-]?api[_-]?private[_-]?key)["=:]\s*[A-Za-z0-9_-]{16,}/i.test(value), `${label} leaked API-key-shaped data.`);
  assert(!/[A-Z0-9_]*(?:API_KEY|SECRET|PRIVATE_KEY|SEED|MNEMONIC)[A-Z0-9_]*\s*=\s*[A-Za-z0-9+/=_-]{8,}/.test(value), `${label} leaked env assignment-shaped secret data.`);
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function booleanFlag(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2).slice(0, 4000)}`;
  throw new Error(`${message}${suffix}`);
}

async function main() {
  const config = parseCanaryStatusArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(usage());
    return;
  }
  const packet = await runWeb3CanaryStatus(config);
  if (config.json) console.log(JSON.stringify(packet, null, 2));
  else console.log(markdown(packet));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

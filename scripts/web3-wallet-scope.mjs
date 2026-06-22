#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_SOURCE = "live-dex";
const DEFAULT_ACCOUNT = "persistent";
const DEFAULT_SCENARIO = "breakout";
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

export function parseWalletScopeArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_WALLET_SCOPE_BASE_URL ?? DEFAULT_BASE_URL),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_WALLET_SCOPE_SOURCE ?? DEFAULT_SOURCE, ["sample", "live-dex"], DEFAULT_SOURCE),
    account: normalizeChoice(flags.get("account") ?? env.WEB3_WALLET_SCOPE_ACCOUNT ?? DEFAULT_ACCOUNT, ["ephemeral", "persistent"], DEFAULT_ACCOUNT),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_WALLET_SCOPE_SCENARIO ?? DEFAULT_SCENARIO, ["base", "breakout", "rug-risk"], DEFAULT_SCENARIO),
    cycles: boundedInteger(flags.get("cycles") ?? env.WEB3_WALLET_SCOPE_CYCLES, 0, 0, 24),
    walletPublicKey: normalizeWallet(flags.get("wallet") ?? env.WEB3_WALLET_SCOPE_PUBLIC_KEY ?? env.WEB3_VERIFY_WALLET_PUBLIC_KEY ?? ""),
    maxTradeUsd: optionalPositiveNumber(flags.get("max-trade-usd") ?? env.WEB3_WALLET_SCOPE_MAX_TRADE_USD),
    dailySpendCapUsd: optionalPositiveNumber(flags.get("daily-spend-cap-usd") ?? env.WEB3_WALLET_SCOPE_DAILY_SPEND_CAP_USD),
    maxSlippageBps: optionalInteger(flags.get("max-slippage-bps") ?? env.WEB3_WALLET_SCOPE_MAX_SLIPPAGE_BPS),
    save: booleanFlag(flags.get("save") ?? env.WEB3_WALLET_SCOPE_SAVE, false),
    json: booleanFlag(flags.get("json") ?? env.WEB3_WALLET_SCOPE_JSON, false),
    help: flags.has("help") || flags.has("h"),
    unsafeFlags: unsafeFlagNames(flags),
  };
}

export async function runWeb3WalletScope(input = {}) {
  const config = {
    ...parseWalletScopeArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    source: normalizeChoice(input.source ?? DEFAULT_SOURCE, ["sample", "live-dex"], DEFAULT_SOURCE),
    account: normalizeChoice(input.account ?? DEFAULT_ACCOUNT, ["ephemeral", "persistent"], DEFAULT_ACCOUNT),
    scenario: normalizeChoice(input.scenario ?? DEFAULT_SCENARIO, ["base", "breakout", "rug-risk"], DEFAULT_SCENARIO),
    cycles: boundedInteger(input.cycles, 0, 0, 24),
    walletPublicKey: normalizeWallet(input.walletPublicKey ?? ""),
    maxTradeUsd: input.maxTradeUsd ?? null,
    dailySpendCapUsd: input.dailySpendCapUsd ?? null,
    maxSlippageBps: input.maxSlippageBps ?? null,
    save: Boolean(input.save),
    unsafeFlags: input.unsafeFlags ?? [],
    fetchImpl: input.fetchImpl ?? fetch,
  };

  assert(config.unsafeFlags.length === 0, `Unsafe wallet-scope flags are not accepted: ${config.unsafeFlags.join(", ")}.`);
  assert(config.walletPublicKey.length > 0, "Provide --wallet=<public-solana-address> or WEB3_WALLET_SCOPE_PUBLIC_KEY. Never provide a private key or seed phrase.");

  const validationResult = await requestValidation(config);
  verifyValidationReceipt(validationResult.receipt, {
    status: validationResult.status,
    text: validationResult.text,
    walletPublicKey: config.walletPublicKey,
  });

  if (!config.save) {
    const packet = buildScopePacket({
      status: "validated-not-saved",
      validation: validationResult.receipt,
      saveAttempted: false,
      canaryStatus: null,
    });
    verifyScopePacket(packet, config.walletPublicKey);
    return packet;
  }

  const saveResult = await requestSave(config, validationResult.receipt);
  verifySaveReceipt(saveResult.receipt, {
    status: saveResult.status,
    text: saveResult.text,
    walletPublicKey: config.walletPublicKey,
  });
  const canaryStatus = await requestCanaryStatus(config);
  verifyCanaryStatus(canaryStatus.receipt);

  const packet = buildScopePacket({
    status: "saved-public-scope",
    validation: validationResult.receipt,
    saveAttempted: true,
    canaryStatus: canaryStatus.receipt,
  });
  verifyScopePacket(packet, config.walletPublicKey);
  return packet;
}

function usage() {
  return [
    "Usage: npm run --silent scope-wallet:web3 -- --wallet=<public-solana-address> [--save] [--base-url=http://localhost:4010] [--json]",
    "",
    "Validates a dedicated public Solana wallet, then saves public wallet scope only when --save is present.",
    "Only pass a public wallet address. Private keys, seed phrases, keypairs, transaction bodies, signed payloads, and API keys are refused.",
  ].join("\n");
}

async function requestValidation(config) {
  const params = scopedQuery(config);
  const execution = {
    wallet_public_key: config.walletPublicKey,
    ...(config.maxTradeUsd !== null ? { max_trade_usd: config.maxTradeUsd } : {}),
    ...(config.dailySpendCapUsd !== null ? { daily_spend_cap_usd: config.dailySpendCapUsd } : {}),
    ...(config.maxSlippageBps !== null ? { max_slippage_bps: config.maxSlippageBps } : {}),
  };
  const response = await config.fetchImpl(`${config.baseUrl}/api/web3-dedicated-wallet-intake-contract?${params.toString()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ execution }),
    signal: AbortSignal.timeout(25_000),
  });
  return responseJson(response, "Wallet scope validation");
}

async function requestSave(config, validation) {
  const saveTemplate = validation.save_body_template?.execution ?? {};
  const execution = {
    ...saveTemplate,
    mode: "dry-run",
    wallet_public_key: config.walletPublicKey,
    kill_switch: false,
    signer_simulation_enabled: true,
    signer_session_label: "local-wallet-scope",
    signer_network: "devnet",
  };
  const response = await config.fetchImpl(`${config.baseUrl}/api/web3-trading`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: config.source,
      account: config.account,
      scenario: config.scenario,
      cycles: config.cycles,
      advance: false,
      execution,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  return responseJson(response, "Wallet scope save");
}

async function requestCanaryStatus(config) {
  const params = scopedQuery(config);
  const response = await config.fetchImpl(`${config.baseUrl}/api/web3-canary-status?${params.toString()}`, {
    method: "GET",
    signal: AbortSignal.timeout(25_000),
  });
  return responseJson(response, "Canary status after wallet scope");
}

function scopedQuery(config) {
  return new URLSearchParams({
    source: config.source,
    account: config.account,
    scenario: config.scenario,
    cycles: String(config.cycles),
  });
}

async function responseJson(response, label) {
  const text = await response.text();
  let receipt;
  try {
    receipt = text ? JSON.parse(text) : null;
  } catch {
    fail(`${label} should return JSON.`, text);
  }
  return { status: response.status, text, receipt };
}

function buildScopePacket({ status, validation, saveAttempted, canaryStatus }) {
  const nextAction = status === "saved-public-scope"
    ? canaryStatus?.next_action ?? "Public wallet scope saved. Prove wallet ownership with the browser wallet text-signature flow."
    : "Wallet looks valid. Rerun with --save to scope this public wallet for the live canary path.";
  return {
    mode: "web3-wallet-scope",
    status,
    save_attempted: saveAttempted,
    saved_public_scope: status === "saved-public-scope",
    wallet_public_key_preview: validation.wallet_public_key_preview,
    validation_receipt_hash: validation.receipt_hash,
    canary_status: canaryStatus
      ? {
        status: canaryStatus.status,
        actual_live_trade_tested: canaryStatus.actual_live_trade_tested,
        can_autonomously_trade_real_money_now: canaryStatus.can_autonomously_trade_real_money_now,
        next_gate_id: canaryStatus.next_gate_id,
        next_required_input_id: canaryStatus.next_required_input_id,
        next_action: canaryStatus.next_action,
      }
      : null,
    next_action: nextAction,
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    controls: [
      "This command accepts only a public Solana wallet address.",
      "Validation is read-only unless --save is present.",
      "Saving public scope does not prove ownership, sign, submit, custody funds, mutate wallets, or count as a funded trade.",
    ],
  };
}

function verifyValidationReceipt(receipt, { status, text, walletPublicKey }) {
  assert(status === 200, "Wallet scope validation should return 200 for a saveable public wallet.", receipt);
  assert(receipt?.mode === "web3-dedicated-wallet-intake-validation", "Wallet scope validation should expose the expected mode.", receipt);
  assert(receipt.status === "valid-public-wallet", "Wallet scope validation should accept only a valid public wallet.", receipt);
  assert(receipt.can_save_public_scope === true, "Wallet scope validation should be saveable before scope save.", receipt);
  assert(!text.includes(walletPublicKey), "Wallet scope validation response must not echo the full wallet public key.");
  assert(receipt.wallet_public_key_preview && !receipt.wallet_public_key_preview.includes(walletPublicKey), "Wallet scope validation should use a wallet preview.", receipt);
  assert(receipt.live_execution_permission === "blocked", "Wallet scope validation must keep live execution blocked.", receipt);
  assert(receipt.wallet_mutation_permission === "blocked", "Wallet scope validation must keep wallet mutation blocked.", receipt);
  assert(receipt.transaction_submission_permission === "blocked", "Wallet scope validation must keep transaction submission blocked.", receipt);
  assert(receipt.private_key_storage === "blocked", "Wallet scope validation must block private-key storage.", receipt);
  assert(receipt.seed_phrase_storage === "blocked", "Wallet scope validation must block seed-phrase storage.", receipt);
  assertNoUnsafeLeak("wallet scope validation response", text);
}

function verifySaveReceipt(receipt, { status, walletPublicKey }) {
  assert(status === 200, "Wallet scope save should return 200.", receipt);
  assert(receipt?.execution_readiness?.config?.wallet_public_key === walletPublicKey, "Wallet scope save should persist the public wallet in execution readiness.", receipt.execution_readiness);
  assert(receipt.execution_readiness?.config?.mode === "dry-run", "Wallet scope save should keep execution mode dry-run.", receipt.execution_readiness);
  assert(receipt.execution_gate?.live_execution_enabled === false, "Wallet scope save must not enable live execution.", receipt.execution_gate);
  assert(receipt.execution_gate?.wallet_mutation_enabled !== true, "Wallet scope save must not enable wallet mutation.", receipt.execution_gate);
  assert(receipt.autonomous_live_autonomy_readiness?.can_trade_real_capital === false, "Wallet scope save must not permit real-capital trading.", receipt.autonomous_live_autonomy_readiness);
}

function verifyCanaryStatus(receipt) {
  assert(receipt?.mode === "web3-canary-status", "Canary status should expose the expected mode after wallet scope.", receipt);
  assert(receipt.actual_live_trade_tested === false, "Canary status must not claim a funded trade after wallet scope.", receipt);
  assert(receipt.can_autonomously_trade_real_money_now === false, "Canary status must not grant autonomy after wallet scope.", receipt);
  assert(receipt.live_execution_permission === "blocked", "Canary status must keep live execution blocked after wallet scope.", receipt);
  assert(receipt.wallet_mutation_permission === "blocked", "Canary status must keep wallet mutation blocked after wallet scope.", receipt);
  assert(receipt.secret_echo_permission === "blocked", "Canary status must keep secret echo blocked after wallet scope.", receipt);
}

export function verifyScopePacket(packet, walletPublicKey) {
  assert(packet.mode === "web3-wallet-scope", "Wallet scope packet should expose the expected mode.", packet);
  assert(["validated-not-saved", "saved-public-scope"].includes(packet.status), "Wallet scope packet should use a known status.", packet);
  assert(!JSON.stringify(packet).includes(walletPublicKey), "Wallet scope packet should not echo the full public wallet.");
  assert(packet.live_execution_permission === "blocked", "Wallet scope packet must keep live execution blocked.", packet);
  assert(packet.transaction_submission_permission === "blocked", "Wallet scope packet must keep transaction submission blocked.", packet);
  assert(packet.wallet_mutation_permission === "blocked", "Wallet scope packet must keep wallet mutation blocked.", packet);
  assert(packet.private_key_storage === "blocked", "Wallet scope packet must keep private key storage blocked.", packet);
  assert(packet.seed_phrase_storage === "blocked", "Wallet scope packet must keep seed phrase storage blocked.", packet);
  assert(packet.secret_echo_permission === "blocked", "Wallet scope packet must keep secret echo blocked.", packet);
}

function markdown(packet) {
  const lines = [
    "# Mastermind Wallet Scope",
    "",
    `Status: ${packet.status}`,
    `Saved public scope: ${packet.saved_public_scope ? "yes" : "no"}`,
    `Wallet: ${packet.wallet_public_key_preview ?? "none"}`,
    "",
    "## Next Action",
    packet.next_action,
  ];
  if (packet.canary_status) {
    lines.push(
      "",
      "## Canary Status",
      `Actual funded trade tested: ${packet.canary_status.actual_live_trade_tested ? "yes" : "no"}`,
      `Autonomous real-money trading now: ${packet.canary_status.can_autonomously_trade_real_money_now ? "yes" : "no"}`,
      `Next gate: ${packet.canary_status.next_gate_id ?? "unknown"}`,
      `Next input: ${packet.canary_status.next_required_input_id ?? "unknown"}`,
    );
  }
  lines.push(
    "",
    "## Boundary",
    "- Live execution: blocked",
    "- Transaction submission: blocked",
    "- Wallet mutation: blocked",
    "- Private keys and seed phrases: blocked",
  );
  return lines.join("\n");
}

function unsafeFlagNames(flags) {
  return [...flags.keys()].filter((key) => {
    if (["base-url", "source", "account", "scenario", "cycles", "wallet", "max-trade-usd", "daily-spend-cap-usd", "max-slippage-bps", "save", "json", "help", "h"].includes(key)) return false;
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return UNSAFE_FLAG_KEYS.some((needle) => normalized.includes(needle));
  });
}

function assertNoUnsafeLeak(label, value) {
  assert(!/(private[_-]?key|seed[_-]?phrase|mnemonic|keypair|wallet[_-]?secret|recovery[_-]?phrase)["=:]\s*[A-Za-z0-9+/=_-]{8,}/i.test(value), `${label} leaked unsafe credential-shaped data.`);
  assert(!/(signed[_-]?payload|signed[_-]?transaction|raw[_-]?transaction|unsigned[_-]?transaction)["=:]\s*[A-Za-z0-9+/=_-]{8,}/i.test(value), `${label} leaked transaction-shaped data.`);
  assert(!/(api[_-]?key|helius[_-]?api[_-]?key|jupiter[_-]?api[_-]?key)["=:]\s*[A-Za-z0-9_-]{16,}/i.test(value), `${label} leaked API-key-shaped data.`);
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeWallet(value) {
  return String(value || "").trim();
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function optionalPositiveNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function optionalInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
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
  const config = parseWalletScopeArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(usage());
    return;
  }
  const packet = await runWeb3WalletScope(config);
  if (config.json) console.log(JSON.stringify(packet, null, 2));
  else console.log(markdown(packet));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

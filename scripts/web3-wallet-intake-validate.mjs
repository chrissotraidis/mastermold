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
];

export function parseWalletIntakeValidateArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_WALLET_INTAKE_BASE_URL ?? DEFAULT_BASE_URL),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_WALLET_INTAKE_SOURCE ?? DEFAULT_SOURCE, ["sample", "live-dex"], DEFAULT_SOURCE),
    account: normalizeChoice(flags.get("account") ?? env.WEB3_WALLET_INTAKE_ACCOUNT ?? DEFAULT_ACCOUNT, ["ephemeral", "persistent"], DEFAULT_ACCOUNT),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_WALLET_INTAKE_SCENARIO ?? DEFAULT_SCENARIO, ["base", "breakout", "rug-risk"], DEFAULT_SCENARIO),
    cycles: boundedInteger(flags.get("cycles") ?? env.WEB3_WALLET_INTAKE_CYCLES, 0, 0, 24),
    walletPublicKey: normalizeWallet(flags.get("wallet") ?? env.WEB3_WALLET_INTAKE_PUBLIC_KEY ?? env.WEB3_VERIFY_WALLET_PUBLIC_KEY ?? ""),
    maxTradeUsd: optionalPositiveNumber(flags.get("max-trade-usd") ?? env.WEB3_WALLET_INTAKE_MAX_TRADE_USD),
    dailySpendCapUsd: optionalPositiveNumber(flags.get("daily-spend-cap-usd") ?? env.WEB3_WALLET_INTAKE_DAILY_SPEND_CAP_USD),
    maxSlippageBps: optionalInteger(flags.get("max-slippage-bps") ?? env.WEB3_WALLET_INTAKE_MAX_SLIPPAGE_BPS),
    json: booleanFlag(flags.get("json") ?? env.WEB3_WALLET_INTAKE_JSON, false),
    allowInvalid: booleanFlag(flags.get("allow-invalid") ?? env.WEB3_WALLET_INTAKE_ALLOW_INVALID, false),
    help: flags.has("help") || flags.has("h"),
    unsafeFlags: unsafeFlagNames(flags),
  };
}

export async function runWeb3WalletIntakeValidate(input = {}) {
  const config = {
    ...parseWalletIntakeValidateArgs([], {}),
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
    allowInvalid: Boolean(input.allowInvalid),
    unsafeFlags: input.unsafeFlags ?? [],
    fetchImpl: input.fetchImpl ?? fetch,
  };

  assert(config.unsafeFlags.length === 0, `Unsafe wallet-intake flags are not accepted: ${config.unsafeFlags.join(", ")}.`);
  assert(config.walletPublicKey.length > 0, "Provide --wallet=<public-solana-address> or WEB3_WALLET_INTAKE_PUBLIC_KEY. Never provide a private key or seed phrase.");

  const response = await requestValidation(config);
  verifyValidationReceipt(response.receipt, {
    status: response.status,
    text: response.text,
    walletPublicKey: config.walletPublicKey,
    allowInvalid: config.allowInvalid,
  });
  return response.receipt;
}

function usage() {
  return [
    "Usage: npm run --silent validate-wallet:web3 -- --wallet=<public-solana-address> [--base-url=http://localhost:4010] [--source=live-dex] [--account=persistent] [--scenario=breakout] [--cycles=0] [--json]",
    "",
    "Validates a dedicated public Solana wallet against the running app without saving state.",
    "Only pass a public wallet address. Private keys, seed phrases, keypairs, transaction bodies, signed payloads, and API keys are refused.",
  ].join("\n");
}

async function requestValidation(config) {
  const params = new URLSearchParams({
    source: config.source,
    account: config.account,
    scenario: config.scenario,
    cycles: String(config.cycles),
  });
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
  const text = await response.text();
  let receipt;
  try {
    receipt = text ? JSON.parse(text) : null;
  } catch {
    fail("Wallet intake validation should return JSON.", text);
  }
  return { status: response.status, text, receipt };
}

export function verifyValidationReceipt(receipt, { status, text, walletPublicKey, allowInvalid = false }) {
  assert(receipt?.mode === "web3-dedicated-wallet-intake-validation", "Wallet validation should expose the expected mode.", receipt);
  assert(typeof receipt.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(receipt.receipt_hash), "Wallet validation should include a receipt hash.", receipt);
  assert(!text.includes(walletPublicKey), "Wallet validation response must not echo the full wallet public key.");
  assert(receipt.wallet_public_key_preview && !receipt.wallet_public_key_preview.includes(walletPublicKey), "Wallet validation should use a preview, not the full wallet.", receipt);
  assert(Array.isArray(receipt.next_proof_runway) && receipt.next_proof_runway.length >= 8, "Wallet validation should include the next proof runway.", receipt);
  assert(receipt.next_proof_runway.some((step) => step.id === "prove-wallet-ownership"), "Proof runway should include wallet ownership proof.", receipt.next_proof_runway);
  assert(receipt.next_proof_runway.some((step) => step.id === "run-unsigned-order-preflight"), "Proof runway should include unsigned order preflight.", receipt.next_proof_runway);
  assert(receipt.next_proof_runway.every((step) =>
    step.live_execution_permission === "blocked" &&
    step.wallet_mutation_permission === "blocked" &&
    step.transaction_submission_permission === "blocked"
  ), "Proof runway must keep live execution, wallet mutation, and submission blocked.", receipt.next_proof_runway);
  assert(receipt.live_execution_permission === "blocked", "Wallet validation must keep live execution blocked.", receipt);
  assert(receipt.wallet_mutation_permission === "blocked", "Wallet validation must keep wallet mutation blocked.", receipt);
  assert(receipt.transaction_submission_permission === "blocked", "Wallet validation must keep transaction submission blocked.", receipt);
  assert(receipt.signing_permission === "blocked", "Wallet validation must keep signing blocked.", receipt);
  assert(receipt.private_key_storage === "blocked", "Wallet validation must block private-key storage.", receipt);
  assert(receipt.seed_phrase_storage === "blocked", "Wallet validation must block seed-phrase storage.", receipt);
  assert(receipt.secret_echo_permission === "blocked", "Wallet validation must block secret echo.", receipt);
  assertNoUnsafeLeak("wallet validation response", text);
  if (!allowInvalid) {
    assert(status === 200 && receipt.status === "valid-public-wallet" && receipt.can_save_public_scope === true, "Wallet validation did not accept this public wallet.", receipt);
  }
}

function markdown(receipt) {
  const runway = receipt.next_proof_runway
    .map((step, index) => `${index + 1}. ${step.label} - ${step.status}\n   ${step.next_action}`)
    .join("\n");
  return [
    "# Mastermind Wallet Intake Validation",
    "",
    `Status: ${receipt.status}`,
    `Wallet: ${receipt.wallet_public_key_preview ?? "none"}`,
    `Can save public scope: ${receipt.can_save_public_scope ? "yes" : "no"}`,
    `Receipt: ${receipt.receipt_hash}`,
    "",
    "## Next Proof Runway",
    runway,
    "",
    "## Boundary",
    "- Live execution: blocked",
    "- Wallet mutation: blocked",
    "- Transaction submission: blocked",
    "- Private keys and seed phrases: blocked",
  ].join("\n");
}

function unsafeFlagNames(flags) {
  return [...flags.keys()].filter((key) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return UNSAFE_FLAG_KEYS.some((needle) => normalized.includes(needle));
  });
}

function assertNoUnsafeLeak(label, value) {
  assert(!/(private[_-]?key|seed[_-]?phrase|mnemonic|keypair|wallet[_-]?secret)["=:]\s*[A-Za-z0-9+/=_-]{8,}/i.test(value), `${label} leaked unsafe credential-shaped data.`);
  assert(!/(signed[_-]?payload|signed[_-]?transaction|raw[_-]?transaction|unsigned[_-]?transaction)["=:]\s*[A-Za-z0-9+/=_-]{8,}/i.test(value), `${label} leaked transaction-shaped data.`);
  assert(!/api[_-]?key["=:]\s*[A-Za-z0-9_-]{16,}/i.test(value), `${label} leaked API-key-shaped data.`);
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
  const config = parseWalletIntakeValidateArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(usage());
    return;
  }
  const receipt = await runWeb3WalletIntakeValidate(config);
  if (config.json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(markdown(receipt));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

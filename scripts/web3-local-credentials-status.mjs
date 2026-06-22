#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";
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

export function parseLocalCredentialsStatusArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_LOCAL_CREDENTIALS_BASE_URL ?? DEFAULT_BASE_URL),
    json: booleanFlag(flags.get("json") ?? env.WEB3_LOCAL_CREDENTIALS_JSON, false),
    failOnBlocked: booleanFlag(flags.get("fail-on-blocked") ?? env.WEB3_LOCAL_CREDENTIALS_FAIL_ON_BLOCKED, false),
    help: flags.has("help") || flags.has("h"),
    unsafeFlags: unsafeFlagNames(flags),
  };
}

export async function runWeb3LocalCredentialsStatus(input = {}) {
  const config = {
    ...parseLocalCredentialsStatusArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    failOnBlocked: Boolean(input.failOnBlocked),
    unsafeFlags: input.unsafeFlags ?? [],
    fetchImpl: input.fetchImpl ?? fetch,
  };

  assert(config.unsafeFlags.length === 0, `Unsafe local-credential status flags are not accepted: ${config.unsafeFlags.join(", ")}.`);

  const response = await requestStatus(config);
  verifyLocalCredentialStatusReceipt(response.receipt, {
    status: response.status,
    text: response.text,
    failOnBlocked: config.failOnBlocked,
  });
  return response.receipt;
}

function usage() {
  return [
    "Usage: npm run --silent credentials-local:web3 -- [--base-url=http://localhost:4010] [--json] [--fail-on-blocked]",
    "",
    "Reads the redacted localhost Web3 credential status receipt.",
    "This command only performs GET /api/web3-local-credentials. Do not pass API keys, private keys, seed phrases, signed payloads, or transaction bodies.",
  ].join("\n");
}

async function requestStatus(config) {
  const response = await config.fetchImpl(`${config.baseUrl}/api/web3-local-credentials`, {
    method: "GET",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let receipt;
  try {
    receipt = text ? JSON.parse(text) : null;
  } catch {
    fail("Local credential status should return JSON.", text);
  }
  return { status: response.status, text, receipt };
}

export function verifyLocalCredentialStatusReceipt(receipt, { status, text, failOnBlocked = false } = {}) {
  assert(receipt?.mode === "web3-local-credential-install", "Local credential status should expose the expected mode.", receipt);
  assert([200, 403, 422].includes(status), "Local credential status should use a known HTTP status.", { status, receipt });
  assert(["unchanged", "blocked", "installed", "invalid"].includes(receipt.status), "Local credential status should use a known receipt status.", receipt);
  assert(receipt.storage === "ignored-local-env", "Local credential status should describe ignored local env storage.", receipt);
  assert(typeof receipt.local_install_allowed === "boolean", "Local credential status should expose whether local install is allowed.", receipt);
  assert(Array.isArray(receipt.configured_keys), "Local credential status should list configured key names.", receipt);
  assert(Array.isArray(receipt.missing_keys), "Local credential status should list missing key names.", receipt);
  assert(Array.isArray(receipt.installed_keys), "Local credential status should list installed key names.", receipt);
  assert(Array.isArray(receipt.runtime_applied_keys), "Local credential status should list runtime-applied key names.", receipt);
  assert(Array.isArray(receipt.runtime_restart_required_keys), "Local credential status should list restart-required key names.", receipt);
  assert(Array.isArray(receipt.rejected_fields), "Local credential status should list rejected field names.", receipt);
  assert(typeof receipt.next_action === "string" && receipt.next_action.length > 0, "Local credential status should include a next action.", receipt);
  assert(typeof receipt.summary === "string" && receipt.summary.length > 0, "Local credential status should include a summary.", receipt);
  assert(receipt.live_execution_permission === "blocked", "Local credential status must keep live execution blocked.", receipt);
  assert(receipt.wallet_mutation_permission === "blocked", "Local credential status must keep wallet mutation blocked.", receipt);
  assert(receipt.secret_echo_permission === "blocked", "Local credential status must keep secret echo blocked.", receipt);
  assertNoUnsafeLeak("local credential status response", text ?? JSON.stringify(receipt));

  if (failOnBlocked) {
    assert(receipt.status !== "blocked" && status !== 403, "Local credential status is blocked for this base URL.", receipt);
  }
}

function markdown(receipt) {
  const configured = summarizeKeys(receipt.configured_keys);
  const missing = summarizeKeys(receipt.missing_keys);
  const runtime = summarizeKeys(receipt.runtime_applied_keys);
  const restart = summarizeKeys(receipt.runtime_restart_required_keys);
  return [
    "# Mastermind Local Web3 Credential Status",
    "",
    `Status: ${receipt.status}`,
    `Local install allowed: ${receipt.local_install_allowed ? "yes" : "no"}`,
    `Storage: ${receipt.storage}`,
    `Configured: ${receipt.configured_keys.length} (${configured})`,
    `Missing: ${receipt.missing_keys.length} (${missing})`,
    `Runtime applied: ${receipt.runtime_applied_keys.length} (${runtime})`,
    `Restart required: ${receipt.runtime_restart_required_keys.length} (${restart})`,
    "",
    "## Next Action",
    receipt.next_action,
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
    if (["base-url", "json", "fail-on-blocked", "help", "h"].includes(key)) return false;
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
  const config = parseLocalCredentialsStatusArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(usage());
    return;
  }
  const receipt = await runWeb3LocalCredentialsStatus(config);
  if (config.json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(markdown(receipt));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

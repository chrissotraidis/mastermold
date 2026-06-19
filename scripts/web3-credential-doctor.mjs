#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_STATUS_PATH = join(process.cwd(), "data", "web3-credential-doctor.json");

export function parseWeb3CredentialDoctorArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_CREDENTIAL_DOCTOR_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_CREDENTIAL_DOCTOR_SOURCE ?? "live-dex", ["sample", "live-dex"], "live-dex"),
    account: normalizeChoice(flags.get("account") ?? env.WEB3_CREDENTIAL_DOCTOR_ACCOUNT ?? "persistent", ["ephemeral", "persistent"], "persistent"),
    statusPath: String(flags.get("status-path") ?? env.WEB3_CREDENTIAL_DOCTOR_STATUS_PATH ?? DEFAULT_STATUS_PATH),
    failOnBlocked: booleanFlag(flags.get("fail-on-blocked") ?? env.WEB3_CREDENTIAL_DOCTOR_FAIL_ON_BLOCKED, false),
    json: booleanFlag(flags.get("json") ?? env.WEB3_CREDENTIAL_DOCTOR_JSON, false),
  };
}

export async function runWeb3CredentialDoctor(input = {}) {
  const config = {
    ...parseWeb3CredentialDoctorArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: normalizeChoice(input.source ?? "live-dex", ["sample", "live-dex"], "live-dex"),
    account: normalizeChoice(input.account ?? "persistent", ["ephemeral", "persistent"], "persistent"),
    statusPath: String(input.statusPath ?? DEFAULT_STATUS_PATH),
    failOnBlocked: Boolean(input.failOnBlocked),
  };
  const [accountSetup, providerHealth, launchChecklist, livePreflight] = await Promise.all([
    fetchReceipt(config, "/api/web3-account-setup"),
    fetchReceipt(config, "/api/web3-provider-health"),
    fetchReceipt(config, "/api/web3-launch-checklist"),
    fetchReceipt(config, "/api/web3-live-capital-preflight"),
  ]);
  const receipt = buildWeb3CredentialDoctorReceipt({
    config,
    accountSetup,
    providerHealth,
    launchChecklist,
    livePreflight,
  });
  writeWeb3CredentialDoctorReceipt(config.statusPath, receipt);
  if (config.failOnBlocked && receipt.exit_code !== 0) {
    const error = new Error(receipt.blockers[0] ?? "Web3 credential doctor is blocked.");
    error.receipt = receipt;
    throw error;
  }
  return receipt;
}

export function buildWeb3CredentialDoctorReceipt({
  config,
  accountSetup,
  providerHealth,
  launchChecklist,
  livePreflight,
}) {
  const checks = buildCredentialDoctorChecks({ accountSetup, providerHealth, launchChecklist, livePreflight })
    .map(redactCredentialDoctorCheck);
  const blockers = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.next_action)
    .filter(Boolean);
  const watchCount = checks.filter((check) => check.status === "watch").length;
  const status = blockers.length > 0
    ? accountSetup?.environment_summary?.jupiter_configured === false
      ? "needs-jupiter"
      : accountSetup?.wallet_summary?.dedicated_wallet_scoped === false
        ? "needs-wallet"
        : "blocked"
    : watchCount > 0
      ? "ready-for-strict-verification"
      : "ready-for-live-review-packet";
  const receiptBase = {
    mode: "web3-credential-doctor",
    paper_only: true,
    status,
    exit_code: blockers.length > 0 ? 1 : 0,
    base_url: redactSensitiveText(config.baseUrl),
    scenario: config.scenario,
    source: config.source,
    account: config.account,
    generated_at: new Date().toISOString(),
    ready_count: checks.filter((check) => check.status === "pass").length,
    watch_count: watchCount,
    blocked_count: blockers.length,
    checks,
    blockers: blockers.map(redactSensitiveText),
    safe_commands: buildSafeCommands(accountSetup, launchChecklist).map(redactSensitiveText),
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    account_creation_permission: "operator-external-only",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    summary: redactSensitiveText(credentialDoctorSummary(status, checks, blockers)),
    next_action: redactSensitiveText(blockers[0] ?? "Run strict wallet, Jupiter, and live DEX verification before any external supervised live review."),
    controls: [
      "Credential doctor reads only local sanitized API receipts from the running app.",
      "It writes configured/missing status and safe commands only; it does not echo provider keys or wallet secrets.",
      "External account creation, private keys, seed phrases, signing, submission, custody, and wallet mutation remain blocked.",
      "Strict verifier commands are review gates only and cannot unlock live capital by themselves.",
    ],
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function buildCredentialDoctorChecks({ accountSetup, providerHealth, launchChecklist, livePreflight }) {
  const env = accountSetup?.environment_summary ?? {};
  const wallet = accountSetup?.wallet_summary ?? {};
  return [
    {
      id: "helius-read-rail",
      label: "Helius / Solana read rail",
      status: env.helius_read_rail_configured && providerHealth?.provider_summary?.rpc_healthy === true ? "pass" : "fail",
      detail: providerHealth?.status
        ? `Provider health is ${providerHealth.status}; RPC ${providerHealth.provider_summary?.rpc_healthy ? "healthy" : "not ready"}, quote ${providerHealth.provider_summary?.jupiter_quote_ready ? "ready" : "not ready"}.`
        : "Provider health receipt is missing.",
      next_action: env.helius_read_rail_configured
        ? "Keep Helius/Solana values in ignored server env and rerun provider health after key changes."
        : "Add HELIUS_API_KEY or SOLANA_RPC_URL in ignored server env.",
      storage: "server-env-secret",
    },
    {
      id: "jupiter-order-rail",
      label: "Jupiter order rail",
      status: env.jupiter_configured ? providerHealth?.provider_summary?.jupiter_order_ready === true ? "pass" : "watch" : "fail",
      detail: env.jupiter_configured
        ? `Jupiter key is configured; order readiness is ${providerHealth?.provider_summary?.jupiter_order_ready ? "ready" : "not ready"}.`
        : "JUPITER_API_KEY is not configured, so unsigned order rehearsal remains gated.",
      next_action: env.jupiter_configured
        ? "Run Rehearse Jupiter order and strict order verifier after wallet scope is ready."
        : "Add JUPITER_API_KEY in ignored server env or use one-shot session testing.",
      storage: "server-env-or-session-only",
    },
    {
      id: "dedicated-wallet",
      label: "Dedicated public wallet",
      status: wallet.dedicated_wallet_scoped ? "pass" : "fail",
      detail: wallet.dedicated_wallet_scoped
        ? `Dedicated wallet scope exists as ${wallet.wallet_public_key_preview ?? "public key preview"}.`
        : wallet.wallet_is_sample
          ? "Sample all-ones wallet is still scoped for demo only."
          : "No dedicated public Solana trading wallet is scoped.",
      next_action: wallet.dedicated_wallet_scoped
        ? "Keep private key and seed phrase outside the app; prove ownership with text signature."
        : "Scope only a dedicated public Solana wallet address; never paste private keys or seed phrases.",
      storage: "browser-safe-public-address",
    },
    {
      id: "wallet-ownership",
      label: "Wallet ownership proof",
      status: wallet.wallet_ownership_proved ? "pass" : wallet.dedicated_wallet_scoped ? "watch" : "fail",
      detail: wallet.wallet_ownership_proved
        ? "Hash-only wallet ownership proof is recorded."
        : "Wallet ownership is not yet proven by a text-only browser-wallet signature.",
      next_action: wallet.wallet_ownership_proved
        ? "Use ownership receipt as review evidence; it grants no signing authority."
        : "Connect the browser wallet and sign only the Mastermind text challenge.",
      storage: "hash-only-local-receipt",
    },
    {
      id: "live-dex",
      label: "Live DEX scanner",
      status: launchChecklist?.market_source_status === "live" || launchChecklist?.source_status === "live"
        ? "pass"
        : launchChecklist?.status ? "watch" : "fail",
      detail: launchChecklist?.status
        ? `Launch checklist is ${launchChecklist.status}; score ${launchChecklist.readiness_score ?? launchChecklist.score ?? 0}/100.`
        : "Launch checklist receipt is missing.",
      next_action: "Run live DEX scanner and require mapped live pairs with no failed sources before fresh-entry review.",
      storage: "public-read-only-market-data",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: livePreflight?.real_capital_blocked === true || livePreflight?.live_execution_permission === "blocked" ? "pass" : "fail",
      detail: livePreflight?.status
        ? `Live preflight is ${livePreflight.status}; real capital blocked ${livePreflight.real_capital_blocked === false ? "no" : "yes"}.`
        : "Live-capital preflight receipt is missing.",
      next_action: "Keep live execution, transaction submission, and wallet mutation blocked until separate supervised live review.",
      storage: "external-review-only",
    },
  ];
}

function redactCredentialDoctorCheck(check) {
  return {
    ...check,
    label: redactSensitiveText(check.label),
    detail: redactSensitiveText(check.detail),
    next_action: redactSensitiveText(check.next_action),
    storage: redactSensitiveText(check.storage),
  };
}

function buildSafeCommands(accountSetup, launchChecklist) {
  const walletPreview = accountSetup?.wallet_summary?.wallet_public_key_preview;
  const commands = [
    "npm run verify:web3 -- --base-url=http://localhost:4010",
    "npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live",
  ];
  if (walletPreview && !accountSetup?.wallet_summary?.wallet_is_sample) {
    commands.push("npm run verify:web3 -- --base-url=http://localhost:4010 --require-operator-wallet --wallet=<public-solana-address>");
  }
  if (accountSetup?.environment_summary?.jupiter_configured) {
    commands.push("npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order");
  }
  const repairCommand = launchChecklist?.next_cutover_step?.command;
  if (typeof repairCommand === "string" && repairCommand.length > 0) commands.push(repairCommand);
  return Array.from(new Set(commands)).slice(0, 6);
}

async function fetchReceipt(config, path) {
  const url = new URL(path, config.baseUrl);
  url.searchParams.set("scenario", config.scenario);
  url.searchParams.set("source", config.source);
  url.searchParams.set("account", config.account);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${path}; got ${text.slice(0, 240)}`);
  }
  if (!response.ok || payload?.error) throw new Error(`${path} failed: ${payload?.error ?? response.status}`);
  return payload;
}

function writeWeb3CredentialDoctorReceipt(path, receipt) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

function credentialDoctorSummary(status, checks, blockers) {
  const passCount = checks.filter((check) => check.status === "pass").length;
  if (blockers.length > 0) return `Credential doctor has ${passCount}/${checks.length} checks passing; next blocker: ${blockers[0]}`;
  if (status === "ready-for-live-review-packet") return "Credential doctor checks are passing for the visible packet; manual live review is still external.";
  return `Credential doctor has ${passCount}/${checks.length} checks passing; run strict verifier commands before live review.`;
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

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/([?&](?:api[-_]?key|token|secret|signature)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<redacted-secret>")
    .replace(/\b(?:sk|pk|jup|helius)_[A-Za-z0-9_-]{16,}\b/g, "<redacted-secret>");
}

async function main() {
  const config = parseWeb3CredentialDoctorArgs(process.argv.slice(2), process.env);
  try {
    const receipt = await runWeb3CredentialDoctor(config);
    if (config.json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log(`${receipt.status}: ${redactSensitiveText(receipt.summary)}`);
      console.log(`wrote ${redactSensitiveText(config.statusPath)}`);
    }
    process.exitCode = config.failOnBlocked ? receipt.exit_code : 0;
  } catch (error) {
    const receipt = error?.receipt;
    if (config.json && receipt) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

#!/usr/bin/env node

import { webcrypto } from "node:crypto";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_WALLET = "11111111111111111111111111111111";
const CANARY_JUPITER_KEY = "codex-jupiter-canary-never-echo";
const CANARY_SECRET = "codex-private-key-canary-never-echo";

const config = parseArgs(process.argv.slice(2));
const baseUrl = (config.baseUrl || process.env.WEB3_VERIFY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const walletPublicKey = config.wallet || process.env.WEB3_VERIFY_WALLET_PUBLIC_KEY || DEFAULT_WALLET;
const requireJupiterOrder = config.requireJupiterOrder || process.env.WEB3_VERIFY_REQUIRE_JUPITER_ORDER === "1";
const requireOperatorWallet = config.requireOperatorWallet || process.env.WEB3_VERIFY_REQUIRE_OPERATOR_WALLET === "1";
const requireDexLive = config.requireDexLive || process.env.WEB3_VERIFY_REQUIRE_DEX_LIVE === "1";
const strictJupiterKey = process.env.WEB3_VERIFY_JUPITER_API_KEY || process.env.JUPITER_API_KEY || "";
const secretValues = [
  { label: "jupiter canary", value: CANARY_JUPITER_KEY },
  { label: "private-field canary", value: CANARY_SECRET },
  { label: "helius env", value: process.env.HELIUS_API_KEY },
  { label: "jupiter env", value: process.env.JUPITER_API_KEY },
  { label: "verify jupiter env", value: process.env.WEB3_VERIFY_JUPITER_API_KEY },
].filter((item) => typeof item.value === "string" && item.value.length > 0);

const results = [];
let originalExecutionConfig = null;
let shouldRestoreExecutionConfig = false;

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    if (arg.startsWith("--base-url=")) parsed.baseUrl = arg.slice("--base-url=".length);
    if (arg.startsWith("--wallet=")) parsed.wallet = arg.slice("--wallet=".length);
    if (arg === "--require-jupiter-order") parsed.requireJupiterOrder = true;
    if (arg === "--require-operator-wallet") parsed.requireOperatorWallet = true;
    if (arg === "--require-dex-live") parsed.requireDexLive = true;
    if (arg === "--json") parsed.json = true;
  }
  return parsed;
}

function redacted(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  for (const secret of secretValues) {
    text = text.split(secret.value).join(`[redacted:${secret.label}]`);
  }
  return text;
}

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${redacted(detail).slice(0, 4000)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function assertNoLeak(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of secretValues) {
    assert(!text.includes(secret.value), `${label} leaked ${secret.label}.`);
  }
  assert(!/api-key=[A-Za-z0-9_-]{16,}/i.test(text), `${label} leaked an API-key query value.`);
}

function record(name, status, detail = "") {
  results.push({ name, status, detail });
}

function isLikelySolanaPublicKey(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  assertNoLeak(`${path} response`, text);
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    fail(`${path} should return JSON.`, text);
  }
  return { response, json, text };
}

async function postJson(path, body) {
  return requestJson(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function snapshotExecutionConfig() {
  const { response, json } = await requestJson("/api/web3-trading?source=sample&account=persistent");
  assert(response.status === 200, "Execution config snapshot should return 200 before verifier mutation.", {
    status: response.status,
    json,
  });
  originalExecutionConfig = sanitizeExecutionConfig(json.execution_readiness?.config);
  assert(originalExecutionConfig, "Execution config snapshot should include execution readiness config.", json.execution_readiness);
  shouldRestoreExecutionConfig = true;
  record("execution-config-snapshot", "pass", "captured original public wallet/risk scope for restore");
}

async function restoreExecutionConfig() {
  if (!shouldRestoreExecutionConfig || !originalExecutionConfig) return;
  const { response, json } = await postJson("/api/web3-trading", {
    source: "sample",
    account: "persistent",
    advance: false,
    execution: originalExecutionConfig,
  });
  assert(response.status === 200, "Execution config restore should return 200.", {
    status: response.status,
    json,
  });
  const restored = json.execution_readiness?.config ?? {};
  assert(restored.wallet_public_key === originalExecutionConfig.wallet_public_key, "Execution config restore should preserve the original wallet scope.", restored);
  assert(restored.mode === originalExecutionConfig.mode, "Execution config restore should preserve the original execution mode.", restored);
  assert(restored.kill_switch === originalExecutionConfig.kill_switch, "Execution config restore should preserve the original kill switch.", restored);
  record("execution-config-restore", "pass", "restored original public wallet/risk scope after verifier canaries");
  shouldRestoreExecutionConfig = false;
}

function sanitizeExecutionConfig(config) {
  if (!config || typeof config !== "object") return null;
  return {
    mode: config.mode === "dry-run" ? "dry-run" : "paper",
    kill_switch: config.kill_switch === true,
    wallet_public_key: typeof config.wallet_public_key === "string" && config.wallet_public_key.length > 0
      ? config.wallet_public_key
      : null,
    max_trade_usd: positiveNumber(config.max_trade_usd, 1_000),
    daily_spend_cap_usd: positiveNumber(config.daily_spend_cap_usd, 2_500),
    max_slippage_bps: positiveInteger(config.max_slippage_bps, 250),
    signer_simulation_enabled: config.signer_simulation_enabled === true,
    signer_session_label: typeof config.signer_session_label === "string" && config.signer_session_label.trim().length > 0
      ? config.signer_session_label.trim()
      : "dry-run-session",
    signer_network: config.signer_network === "localnet" ? "localnet" : "devnet",
  };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

async function verifyHealth() {
  const { response, json } = await requestJson("/api/health");
  assert(response.status === 200, "Health endpoint should return 200.", { status: response.status, json });
  assert(json.status === "ok", "Health endpoint should report ok.", json);
  assert(json.web3_daemon_supervisor?.live_execution_permission === "blocked", "Daemon health should keep live execution blocked.", json.web3_daemon_supervisor);
  assert(json.web3_daemon_supervisor?.wallet_mutation_permission === "blocked", "Daemon health should keep wallet mutation blocked.", json.web3_daemon_supervisor);
  assert(json.web3_production_supervisor?.live_execution_permission === "blocked", "Production supervisor should keep live execution blocked.", json.web3_production_supervisor);
  assert(json.web3_production_supervisor?.wallet_mutation_permission === "blocked", "Production supervisor should keep wallet mutation blocked.", json.web3_production_supervisor);
  record("health", "pass", "live and wallet mutation locks are blocked");
}

async function verifyOperatorWalletScope() {
  const walletProvided = Boolean(config.wallet || process.env.WEB3_VERIFY_WALLET_PUBLIC_KEY);
  const sampleWallet = walletPublicKey === DEFAULT_WALLET;
  if (!requireOperatorWallet) {
    record(
      "operator-wallet-strict",
      "skipped",
      sampleWallet ? "sample system wallet is allowed in non-strict verification" : "operator public wallet supplied",
    );
    return;
  }

  assert(walletProvided, "Strict operator-wallet verification requires --wallet=<public-solana-address> or WEB3_VERIFY_WALLET_PUBLIC_KEY.");
  assert(!sampleWallet, "Strict operator-wallet verification refuses the sample all-ones system wallet.");
  assert(isLikelySolanaPublicKey(walletPublicKey), "Strict operator-wallet verification requires a valid public Solana wallet address.");
  record("operator-wallet-strict", "pass", "dedicated operator public wallet supplied");
}

async function verifyRejectedExecutionInputs() {
  const invalidWallet = await postJson("/api/web3-trading", {
    source: "sample",
    account: "persistent",
    execution: {
      mode: "dry-run",
      wallet_public_key: "not-a-wallet",
    },
  });
  assert(invalidWallet.response.status === 422, "Malformed public wallet scope should be rejected.", {
    status: invalidWallet.response.status,
    json: invalidWallet.json,
  });
  assert(/public Solana address/i.test(invalidWallet.json?.error ?? ""), "Malformed wallet rejection should name public address validation.", invalidWallet.json);

  const privateField = await postJson("/api/web3-trading", {
    source: "sample",
    account: "persistent",
    execution: {
      mode: "dry-run",
      private_key: CANARY_SECRET,
    },
  });
  assert(privateField.response.status === 422, "Private-key-shaped execution fields should be rejected.", {
    status: privateField.response.status,
    json: privateField.json,
  });
  assert(/private keys|seed phrases|secret/i.test(privateField.json?.error ?? ""), "Private-field rejection should explain the secret boundary.", privateField.json);
  record("execution-input-validation", "pass", "malformed wallet and private-field requests are rejected");
}

async function verifyPublicScopeSave() {
  const { response, json } = await postJson("/api/web3-trading", {
    source: "sample",
    account: "persistent",
    execution: {
      mode: "dry-run",
      wallet_public_key: walletPublicKey,
      max_trade_usd: 250,
      daily_spend_cap_usd: 1000,
      max_slippage_bps: 150,
      kill_switch: false,
      signer_simulation_enabled: true,
      signer_session_label: "Readiness verifier",
      signer_network: "devnet",
    },
  });
  assert(response.status === 200, "Public wallet scope save should return 200.", { status: response.status, json });
  assert(json.execution_readiness?.config?.wallet_public_key === walletPublicKey, "Public wallet scope should persist into execution readiness.", json.execution_readiness);
  assert(json.execution_readiness?.config?.mode === "dry-run", "Execution readiness should remain dry-run.", json.execution_readiness);
  assert(json.execution_gate?.live_execution_enabled === false, "Public scope save must not enable live execution.", json.execution_gate);
  assert(json.autonomous_live_autonomy_readiness?.can_trade_real_capital === false, "Public scope save must not permit real-capital trading.", json.autonomous_live_autonomy_readiness);
  record("public-scope-save", "pass", "public wallet and dry-run caps saved without live authority");
}

async function verifyAccountSetupReceipt() {
  const { response, json } = await requestJson("/api/web3-account-setup?source=sample&account=persistent");
  assert(response.status === 200, "Account setup receipt should return 200.", { status: response.status, json });
  assert(json.mode === "web3-account-setup-receipt", "Account setup receipt should expose the expected mode.", json);
  assert(json.wallet_summary?.wallet_scoped === true, "Account setup receipt should see the saved public wallet scope.", json.wallet_summary);
  if (walletPublicKey === DEFAULT_WALLET) {
    assert(json.wallet_summary?.wallet_is_sample === true, "Account setup should flag the default all-ones wallet as sample-only.", json.wallet_summary);
    assert(json.wallet_summary?.dedicated_wallet_scoped === false, "Sample wallet must not satisfy dedicated wallet scope.", json.wallet_summary);
    assert(
      json.environment_summary?.missing_required?.includes("Dedicated public trading wallet"),
      "Sample wallet should leave the dedicated public wallet requirement missing.",
      json.environment_summary,
    );
  } else {
    assert(json.wallet_summary?.wallet_is_sample === false, "Operator wallet should not be flagged as the sample system wallet.", json.wallet_summary);
    assert(json.wallet_summary?.dedicated_wallet_scoped === true, "Operator wallet should satisfy dedicated public wallet scope.", json.wallet_summary);
  }
  assert(json.live_execution_permission === "blocked", "Account setup receipt should block live execution.", json);
  assert(json.wallet_mutation_permission === "blocked", "Account setup receipt should block wallet mutation.", json);
  assert(json.private_key_storage === "blocked", "Account setup receipt should block private key storage.", json);
  assert(json.secret_echo_permission === "blocked", "Account setup receipt should block secret echo.", json);
  record("account-setup-receipt", "pass", `status ${json.status}`);
}

async function verifyWalletOwnershipReceipt() {
  const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle;
  const keyPair = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const rawPublicKey = await subtle.exportKey("raw", keyPair.publicKey);
  const proofWalletPublicKey = base58Encode(new Uint8Array(rawPublicKey));
  const message = [
    "Mastermind Web3 wallet ownership challenge",
    `Wallet: ${proofWalletPublicKey}`,
    "Purpose: prove public wallet control only",
    "No transaction signing or wallet mutation is authorized.",
    "Issued: 2026-06-19T00:00:00.000Z",
  ].join("\n");
  const signature = await subtle.sign({ name: "Ed25519" }, keyPair.privateKey, new TextEncoder().encode(message));
  const signatureBase64 = Buffer.from(signature).toString("base64");

  const { response, json, text } = await postJson("/api/web3-wallet-ownership", {
    wallet_public_key: proofWalletPublicKey,
    message,
    signature_base64: signatureBase64,
    provider: "readiness-local-ed25519",
  });
  assert(response.status === 200, "Wallet ownership proof should return a receipt.", { status: response.status, json });
  assert(json.mode === "web3-wallet-ownership-receipt", "Wallet ownership proof should expose the expected receipt mode.", json);
  assert(json.status === "verified", "Wallet ownership proof should verify the generated Ed25519 challenge.", json);
  assert(json.signature_verified === true, "Wallet ownership proof should mark the signature verified.", json);
  assert(json.live_execution_permission === "blocked", "Wallet ownership proof must keep live execution blocked.", json);
  assert(json.wallet_mutation_permission === "blocked", "Wallet ownership proof must keep wallet mutation blocked.", json);
  assert(json.transaction_submission_permission === "blocked", "Wallet ownership proof must keep transaction submission blocked.", json);
  assert(json.transaction_signing_permission === "blocked", "Wallet ownership proof must keep transaction signing blocked.", json);
  assert(json.private_key_storage === "blocked", "Wallet ownership proof must block private-key storage.", json);
  assert(json.message_storage === "hash-only", "Wallet ownership proof should store only message hash evidence.", json);
  assert(typeof json.receipt_hash === "string" && json.receipt_hash.length === 64, "Wallet ownership proof should include a receipt hash.", json);
  assert(!text.includes(message), "Wallet ownership proof response should not return the raw challenge message.", json);
  assert(!text.includes(signatureBase64), "Wallet ownership proof response should not return the raw signature.", json);

  const scoped = await postJson("/api/web3-trading", {
    source: "sample",
    account: "persistent",
    execution: {
      mode: "dry-run",
      wallet_public_key: proofWalletPublicKey,
      max_trade_usd: 250,
      daily_spend_cap_usd: 1000,
      max_slippage_bps: 150,
      kill_switch: false,
      signer_simulation_enabled: true,
      signer_session_label: "Readiness ownership verifier",
      signer_network: "devnet",
    },
  });
  assert(scoped.response.status === 200, "Ownership proof wallet scope should save as dry-run public scope.", scoped.json);

  const setup = await requestJson("/api/web3-account-setup?source=sample&account=persistent");
  assert(setup.response.status === 200, "Account setup should return after wallet ownership proof.", setup.json);
  assert(setup.json.wallet_summary?.wallet_is_sample === false, "Generated ownership wallet should not be marked as sample.", setup.json.wallet_summary);
  assert(setup.json.wallet_summary?.dedicated_wallet_scoped === true, "Generated ownership wallet should satisfy dedicated wallet scope.", setup.json.wallet_summary);
  assert(setup.json.wallet_summary?.wallet_ownership_proved === true, "Account setup should see the durable wallet ownership proof.", setup.json.wallet_summary);
  assert(setup.json.wallet_summary?.wallet_ownership_receipt_hash === json.receipt_hash, "Account setup should link to the wallet ownership receipt hash.", setup.json.wallet_summary);

  const invalid = await postJson("/api/web3-wallet-ownership", {
    wallet_public_key: proofWalletPublicKey,
    message,
    signature_base64: Buffer.from(new Uint8Array(64).fill(5)).toString("base64"),
    provider: "readiness-local-ed25519",
  });
  assert(invalid.response.status === 200, "Invalid wallet ownership signature should return an invalid receipt, not authority.", invalid.json);
  assert(invalid.json.status === "invalid", "Invalid wallet ownership signature should be marked invalid.", invalid.json);
  assert(invalid.json.signature_verified === false, "Invalid wallet ownership signature should not verify.", invalid.json);
  assert(invalid.json.live_execution_permission === "blocked", "Invalid ownership receipt must keep live execution blocked.", invalid.json);
  assert(invalid.json.wallet_mutation_permission === "blocked", "Invalid ownership receipt must keep wallet mutation blocked.", invalid.json);
  record("wallet-ownership-receipt", "pass", "text-only Ed25519 proof verifies with hash-only output");
}

async function verifyCredentialValidateOnly() {
  const { response, json } = await postJson("/api/web3-credentials/test", {
    provider: "helius",
    wallet_public_key: walletPublicKey,
    max_trade_usd: 250,
    daily_spend_cap_usd: 1000,
    max_slippage_bps: 150,
    require_manual_confirmation: true,
    test_mode: "validate-only",
  });
  assert(response.status === 200, "Validate-only credential test should return 200.", { status: response.status, json });
  assert(json.mode === "web3-credentials-setup-readiness", "Credential test should expose the readiness contract.", json);
  assert(json.network_tested === false, "Validate-only credential test should not call external providers.", json);
  assert(json.live_execution_permission === "blocked", "Credential test should block live execution.", json);
  assert(json.wallet_mutation_permission === "blocked", "Credential test should block wallet mutation.", json);
  assert(json.credential_plan?.levels?.some((level) => level.id === "autonomous-live" && level.status === "blocked"), "Credential plan should keep autonomous-live blocked.", json.credential_plan);
  assert(json.credential_plan?.items?.some((item) => item.id === "private-key" && item.storage === "never-store" && item.status === "blocked"), "Credential plan should keep private keys never-store.", json.credential_plan);
  record("credential-validate-only", "pass", `plan ${json.credential_plan?.status ?? "unknown"}`);
}

async function verifyProviderHealthReceipt() {
  const { response, json } = await requestJson("/api/web3-provider-health?source=sample&account=persistent");
  assert(response.status === 200, "Provider health receipt should return 200.", { status: response.status, json });
  assert(json.mode === "web3-provider-health-receipt", "Provider health should expose the expected receipt mode.", json);
  assert(json.live_execution_permission === "blocked", "Provider health must keep live execution blocked.", json);
  assert(json.wallet_mutation_permission === "blocked", "Provider health must keep wallet mutation blocked.", json);
  assert(json.secret_echo_permission === "blocked", "Provider health must block secret echo.", json);
  assert(json.private_key_storage === "blocked", "Provider health must block private key storage.", json);
  assert(json.transaction_body_storage === "blocked", "Provider health must block transaction body storage.", json);
  assert(json.rpc_endpoint === null || !String(json.rpc_endpoint).includes("?"), "Provider health should redact RPC query strings.", json);

  const summary = json.provider_summary ?? {};
  const readRailConfigured = summary.helius_configured === true || summary.solana_rpc_configured === true;
  if (readRailConfigured) {
    assert(summary.rpc_healthy === true, "Configured Solana read rail should pass RPC health.", json);
    assert(summary.latest_blockhash_ready === true, "Configured Solana read rail should return latest blockhash evidence.", json);
    assert(typeof summary.confirmed_slot === "number", "Configured Solana read rail should return a confirmed slot.", json);
    assert(summary.wallet_scoped === true, "Provider health should see the saved public wallet scope.", summary);
    assert(summary.wallet_valid === true, "Provider health should validate the saved public wallet scope.", summary);
    record(
      "provider-health-read-rail",
      "pass",
      `${json.rpc_provider ?? "provider"} ${json.status}; quote ${summary.jupiter_quote_ready ? "ready" : "not-ready"}`,
    );
    return;
  }

  record("provider-health-read-rail", "warn", "read rail not configured on the running app");
}

function assertDexDiscoveryBoundary(json, label) {
  assert(json.mode === "web3-dex-discovery-receipt", `${label} should expose the expected receipt mode.`, json);
  assert(json.provider === "DEX Screener", `${label} should identify the DEX Screener provider.`, json);
  assert(json.live_execution_permission === "blocked", `${label} must keep live execution blocked.`, json);
  assert(json.wallet_mutation_permission === "blocked", `${label} must keep wallet mutation blocked.`, json);
  assert(json.secret_echo_permission === "blocked", `${label} must block secret echo.`, json);
  assert(json.private_key_storage === "blocked", `${label} must block private key storage.`, json);
  assert(json.transaction_submission_permission === "blocked", `${label} must block transaction submission.`, json);
  assert(typeof json.receipt_hash === "string" && json.receipt_hash.length >= 16, `${label} should include a receipt hash.`, json);
  assert(Array.isArray(json.source_checks), `${label} should include source checks.`, json);
  assert(Array.isArray(json.top_candidates), `${label} should include top candidates.`, json);
}

function base58Encode(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  for (const byte of bytes) {
    if (byte === 0) digits.push(0);
    else break;
  }
  return digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("");
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

async function verifyDexDiscoveryReceipt() {
  const { response, json } = await requestJson("/api/web3-dex-discovery?source=sample&account=persistent");
  assert(response.status === 200, "Sample DEX discovery receipt should return 200.", { status: response.status, json });
  assertDexDiscoveryBoundary(json, "Sample DEX discovery receipt");
  assert(json.status === "sample-only", "Sample DEX discovery receipt should remain sample-only.", json);
  assert(json.source_summary?.market_source_mode === "sample", "Sample DEX discovery should report sample market-source mode.", json.source_summary);
  assert(json.source_summary?.tokens_considered > 0, "Sample DEX discovery should include deterministic candidates.", json.source_summary);
  assert(json.source_summary?.pairs_mapped > 0, "Sample DEX discovery should include deterministic pair mapping.", json.source_summary);
  record("dex-discovery-receipt", "pass", `sample receipt ${json.status}; ${json.source_summary?.pairs_mapped ?? 0} pairs mapped`);
}

async function verifyStrictDexLiveReadiness() {
  if (!requireDexLive) {
    record("dex-live-strict", "skipped", "run with --require-dex-live after local network access is ready");
    return;
  }

  let discoveryFailure = "";
  try {
    const { response, json } = await requestJson("/api/web3-dex-discovery?source=live-dex&account=persistent");
    assert(response.status === 200, "Strict live DEX discovery should return a receipt.", { status: response.status, json });
    assertDexDiscoveryBoundary(json, "Strict live DEX discovery");
    assert(["live-ready", "live-watch"].includes(json.status), "Strict live DEX discovery must use current live scanner evidence, not sample or fallback.", json);
    assert(json.source_summary?.market_source_status === "live", "Strict live DEX discovery should report live market-source status.", json.source_summary);
    assert(json.source_summary?.tokens_considered > 0, "Strict live DEX discovery should consider live candidates.", json.source_summary);
    assert(json.source_summary?.pairs_mapped > 0, "Strict live DEX discovery should map live token pairs.", json.source_summary);
    assert(json.source_summary?.failed_source_count === 0, "Strict live DEX discovery should have no failed discovery sources.", json.source_summary);
    assert(json.source_summary?.live_candidate_count > 0, "Strict live DEX discovery should include live candidates.", json.source_summary);
    record("dex-live-strict", "pass", `${json.status}; ${json.source_summary.pairs_mapped} live pairs mapped`);
    return;
  } catch (error) {
    discoveryFailure = error instanceof Error ? error.message : "strict live DEX discovery failed";
  }

  let ohlcvFailure = "";
  try {
    const { response, json } = await requestJson("/api/web3-ohlcv?auto=true&source=live-dex&scenario=breakout&account=persistent&cycles=0&timeframe=minute&aggregate=1&limit=12&token=base&paper=true&cash_usd=1200&position_usd=0&equity_usd=5000&max_trade_usd=250");
    assert(response.status === 200, "Strict live DEX candle proof should return 200 when discovery is throttled.", {
      status: response.status,
      json,
      discoveryFailure,
    });
    assert(json.provider === "geckoterminal", "Strict live DEX candle proof should use GeckoTerminal.", json);
    assert(json.source === "geckoterminal-public", "Strict live DEX candle proof should use public candle data.", json);
    assert(json.resolution?.mode === "auto-dex-candidate", "Strict live DEX candle proof should auto-resolve a scanner candidate.", json.resolution);
    assert(json.resolution?.source === "live-dex", "Strict live DEX candle proof should be requested from live-dex mode.", json.resolution);
    assert(json.network === "solana", "Strict live DEX candle proof should resolve a Solana pool.", json);
    assert(typeof json.pool === "string" && json.pool.length > 16, "Strict live DEX candle proof should include a pool id.", json);
    assert(Array.isArray(json.candles) && json.candles.length >= 6, "Strict live DEX candle proof should include enough candles.", json);
    assert(json.live_execution_permission === "blocked", "Strict live DEX candle proof must keep live execution blocked.", json);
    assert(json.wallet_mutation_permission === "blocked", "Strict live DEX candle proof must keep wallet mutation blocked.", json);
    assert(json.transaction_submission_permission === "blocked", "Strict live DEX candle proof must keep transaction submission blocked.", json);
    assert(json.private_key_storage === "blocked", "Strict live DEX candle proof must block private-key storage.", json);
    assert(json.secret_echo_permission === "blocked", "Strict live DEX candle proof must block secret echo.", json);
    record(
      "dex-live-strict",
      "pass",
      `candle fallback ${json.resolution?.symbol ?? "unknown"}; ${json.candles.length} GeckoTerminal candles after discovery throttle`,
    );
    return;
  } catch (error) {
    ohlcvFailure = error instanceof Error ? error.message : "strict live DEX candle proof failed";
  }

  const { response, json } = await requestJson("/api/web3-trading?source=live-dex&scenario=breakout&account=persistent&cycles=0");
  assert(response.status === 200, "Strict live DEX recorded candle proof should return trading state when providers are throttled.", {
    status: response.status,
    json,
    discoveryFailure,
    ohlcvFailure,
  });
  const candle = json.autonomous_candle_refresh;
  assert(candle?.requested === true, "Strict live DEX recorded candle proof should have been requested.", candle);
  assert(candle.status === "ready", "Strict live DEX recorded candle proof should be ready.", candle);
  assert(candle.source === "live-dex", "Strict live DEX recorded candle proof should come from live-dex mode.", candle);
  assert(candle.provider === "geckoterminal", "Strict live DEX recorded candle proof should come from GeckoTerminal.", candle);
  assert(candle.network === "solana", "Strict live DEX recorded candle proof should resolve a Solana pool.", candle);
  assert(typeof candle.pool === "string" && candle.pool.length > 16, "Strict live DEX recorded candle proof should include a pool id.", candle);
  assert(Number(candle.candle_count) >= 6, "Strict live DEX recorded candle proof should include enough candles.", candle);
  assert(isFreshIsoTimestamp(candle.fetched_at, 15 * 60 * 1000), "Strict live DEX recorded candle proof should be fresh within 15 minutes.", candle);
  assert(json.execution_gate?.live_execution_enabled === false, "Strict live DEX recorded candle proof must keep live execution blocked.", json.execution_gate);
  assert(json.execution_gate?.wallet_mutation_enabled !== true, "Strict live DEX recorded candle proof must keep wallet mutation blocked.", json.execution_gate);
  record(
    "dex-live-strict",
    "pass",
    `recorded candle fallback ${candle.symbol ?? "unknown"}; ${candle.candle_count} candles after provider throttle`,
  );
}

function isFreshIsoTimestamp(value, maxAgeMs) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp <= maxAgeMs;
}

async function verifyJupiterRehearsalBoundary() {
  const { response, json } = await postJson("/api/web3-jupiter-rehearsal?source=sample&account=persistent", {
    jupiter_api_key: CANARY_JUPITER_KEY,
    wallet_public_key: walletPublicKey,
    max_slippage_bps: 150,
  });
  assert(response.status === 200, "Jupiter rehearsal should return a redacted receipt even when order access is gated.", { status: response.status, json });
  assert(json.mode === "web3-jupiter-rehearsal-receipt", "Jupiter rehearsal should expose the expected receipt mode.", json);
  assert(json.key_source === "one-shot", "Jupiter rehearsal should mark the canary key as one-shot.", json);
  assert(json.one_shot_key_used === true, "Jupiter rehearsal should record one-shot key use without echoing the key.", json);
  assert(json.secret_echo_permission === "blocked", "Jupiter rehearsal should block secret echo.", json);
  assert(json.unsigned_transaction_return === "withheld", "Jupiter rehearsal should withhold unsigned transaction bytes.", json);
  assert(json.transaction_body_storage === "blocked", "Jupiter rehearsal should block transaction body storage.", json);
  assert(json.execute_permission === "blocked", "Jupiter rehearsal should block execute permission.", json);
  assert(json.live_execution_permission === "blocked", "Jupiter rehearsal should block live execution.", json);
  assert(json.wallet_mutation_permission === "blocked", "Jupiter rehearsal should block wallet mutation.", json);
  record("jupiter-rehearsal-boundary", "pass", `status ${json.status}`);
}

async function verifyJupiterPrivateFieldRejection() {
  const { response, json } = await postJson("/api/web3-jupiter-rehearsal?source=sample&account=persistent", {
    jupiter_api_key: CANARY_JUPITER_KEY,
    wallet_public_key: walletPublicKey,
    seed_phrase: CANARY_SECRET,
    max_slippage_bps: 150,
  });
  assert(response.status === 422, "Jupiter rehearsal should reject seed/private fields before testing.", { status: response.status, json });
  assert(/Private keys|seed phrases|secret/i.test(json?.error ?? ""), "Jupiter rehearsal rejection should explain the secret boundary.", json);
  record("jupiter-private-field-rejection", "pass", "seed/private fields are rejected");
}

async function verifyStrictJupiterOrderReadiness() {
  if (!requireJupiterOrder) {
    record("jupiter-order-strict", "skipped", "run with --require-jupiter-order after adding a Jupiter key");
    return;
  }

  assert(
    strictJupiterKey.length > 0,
    "Strict Jupiter order verification requires JUPITER_API_KEY or WEB3_VERIFY_JUPITER_API_KEY in local environment.",
  );

  const { response, json } = await postJson("/api/web3-jupiter-rehearsal?source=sample&account=persistent", {
    jupiter_api_key: strictJupiterKey,
    wallet_public_key: walletPublicKey,
    max_slippage_bps: 150,
  });
  assert(response.status === 200, "Strict Jupiter order rehearsal should return a redacted receipt.", { status: response.status, json });
  assert(json.mode === "web3-jupiter-rehearsal-receipt", "Strict Jupiter order rehearsal should expose the expected receipt mode.", json);
  assert(json.status === "order-ready", "Strict Jupiter order rehearsal should prove order-ready status.", json);
  assert(json.summary?.jupiter_key_configured === true, "Strict Jupiter order rehearsal should see a Jupiter key.", json.summary);
  assert(json.summary?.wallet_valid === true, "Strict Jupiter order rehearsal should use a valid public wallet.", json.summary);
  assert(json.summary?.jupiter_quote_ready === true, "Strict Jupiter order rehearsal should prove quote readiness.", json.summary);
  assert(json.summary?.jupiter_order_ready === true, "Strict Jupiter order rehearsal should prove unsigned order readiness.", json.summary);
  assert(typeof json.summary?.order_request_hash === "string" && json.summary.order_request_hash.length > 0, "Strict Jupiter order rehearsal should return a hashed order request id.", json.summary);
  assert(json.unsigned_transaction_return === "withheld", "Strict Jupiter order rehearsal should still withhold unsigned transaction bytes.", json);
  assert(json.transaction_body_storage === "blocked", "Strict Jupiter order rehearsal should still block transaction body storage.", json);
  assert(json.execute_permission === "blocked", "Strict Jupiter order rehearsal should still block execute permission.", json);
  assert(json.live_execution_permission === "blocked", "Strict Jupiter order rehearsal should still block live execution.", json);
  assert(json.wallet_mutation_permission === "blocked", "Strict Jupiter order rehearsal should still block wallet mutation.", json);
  record("jupiter-order-strict", "pass", "Jupiter quote and unsigned order readiness proved with transaction bytes withheld");
}

async function main() {
  await snapshotExecutionConfig();
  await verifyHealth();
  await verifyOperatorWalletScope();
  await verifyRejectedExecutionInputs();
  await verifyPublicScopeSave();
  await verifyAccountSetupReceipt();
  await verifyWalletOwnershipReceipt();
  await verifyCredentialValidateOnly();
  await verifyProviderHealthReceipt();
  await verifyDexDiscoveryReceipt();
  await verifyStrictDexLiveReadiness();
  await verifyJupiterRehearsalBoundary();
  await verifyJupiterPrivateFieldRejection();
  await verifyStrictJupiterOrderReadiness();
  await restoreExecutionConfig();

  const report = {
    mode: "web3-readiness-verify",
    base_url: baseUrl,
    wallet_scope: walletPublicKey === DEFAULT_WALLET ? "sample-system-wallet" : "operator-public-wallet",
    strict_operator_wallet_required: requireOperatorWallet,
    strict_jupiter_order_required: requireJupiterOrder,
    strict_dex_live_required: requireDexLive,
    checked_at: new Date().toISOString(),
    result: "pass",
    checks: results,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
  };
  assertNoLeak("final report", report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  try {
    await restoreExecutionConfig();
  } catch (restoreError) {
    console.error(redacted(`Restore after verifier failure also failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`));
  }
  console.error(redacted(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

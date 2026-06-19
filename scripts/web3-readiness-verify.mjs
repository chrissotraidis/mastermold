#!/usr/bin/env node

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
  assert(json.live_execution_permission === "blocked", "Account setup receipt should block live execution.", json);
  assert(json.wallet_mutation_permission === "blocked", "Account setup receipt should block wallet mutation.", json);
  assert(json.private_key_storage === "blocked", "Account setup receipt should block private key storage.", json);
  assert(json.secret_echo_permission === "blocked", "Account setup receipt should block secret echo.", json);
  record("account-setup-receipt", "pass", `status ${json.status}`);
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
  await verifyHealth();
  await verifyOperatorWalletScope();
  await verifyRejectedExecutionInputs();
  await verifyPublicScopeSave();
  await verifyAccountSetupReceipt();
  await verifyCredentialValidateOnly();
  await verifyProviderHealthReceipt();
  await verifyDexDiscoveryReceipt();
  await verifyStrictDexLiveReadiness();
  await verifyJupiterRehearsalBoundary();
  await verifyJupiterPrivateFieldRejection();
  await verifyStrictJupiterOrderReadiness();

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

main().catch((error) => {
  console.error(redacted(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

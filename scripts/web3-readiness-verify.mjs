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
  assert(json.web3_operator_runbook?.mode === "web3-operator-runbook-health", "Health endpoint should expose Web3 operator runbook health.", json.web3_operator_runbook);
  assert(["setup-needed", "paper-operable", "supervised-review-ready"].includes(json.web3_operator_runbook.status), "Operator runbook health should expose a known status.", json.web3_operator_runbook);
  assertReceiptHash("Health operator runbook", json.web3_operator_runbook.receipt_hash);
  assert(["sample", "live-dex"].includes(json.web3_operator_runbook.source), "Operator runbook health should expose the summarized source.", json.web3_operator_runbook);
  assert(["ephemeral", "persistent"].includes(json.web3_operator_runbook.account), "Operator runbook health should expose the summarized account.", json.web3_operator_runbook);
  assert(["base", "breakout", "rug-risk"].includes(json.web3_operator_runbook.scenario), "Operator runbook health should expose the summarized scenario.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.live_review_source_endpoint === "/api/web3-operator-runbook?source=live-dex&account=persistent&scenario=breakout&cycles=0", "Operator runbook health should expose the live-review runbook packet separately.", json.web3_operator_runbook);
  assert(typeof json.web3_operator_runbook.allowed_now_count === "number", "Operator runbook health should expose allowed action count.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.allowed_now_count + json.web3_operator_runbook.gated_count + json.web3_operator_runbook.blocked_count >= 1, "Operator runbook health action counts should be present.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.primary_safe_action_status === null || ["allowed", "gated", "blocked"].includes(json.web3_operator_runbook.primary_safe_action_status), "Operator runbook health should expose a valid primary safe action status.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.current_input?.live_execution_permission === "blocked", "Operator runbook health should expose a locked current input contract.", json.web3_operator_runbook);
  assert(Array.isArray(json.web3_operator_runbook.current_input.target_names), "Operator runbook health current input should expose safe target names.", json.web3_operator_runbook.current_input);
  assert(json.web3_operator_runbook.live_execution_permission === "blocked", "Operator runbook health should keep live execution blocked.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.transaction_submission_permission === "blocked", "Operator runbook health should keep transaction submission blocked.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.wallet_mutation_permission === "blocked", "Operator runbook health should keep wallet mutation blocked.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.signing_permission === "blocked", "Operator runbook health should keep signing blocked.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.private_key_storage === "blocked", "Operator runbook health should keep private-key storage blocked.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.seed_phrase_storage === "blocked", "Operator runbook health should keep seed-phrase storage blocked.", json.web3_operator_runbook);
  assert(json.web3_operator_runbook.secret_echo_permission === "blocked", "Operator runbook health should keep secret echo blocked.", json.web3_operator_runbook);
  assert(json.web3_research_handoff?.mode === "web3-research-handoff-health", "Health endpoint should expose Web3 research handoff health.", json.web3_research_handoff);
  assert(json.web3_research_handoff.question_count >= 10, "Research handoff health should expose unresolved question count.", json.web3_research_handoff);
  assert(["sample", "live-dex"].includes(json.web3_research_handoff.source), "Research handoff health should expose the summarized source.", json.web3_research_handoff);
  assert(["ephemeral", "persistent"].includes(json.web3_research_handoff.account), "Research handoff health should expose the summarized account.", json.web3_research_handoff);
  assert(["base", "breakout", "rug-risk"].includes(json.web3_research_handoff.scenario), "Research handoff health should expose the summarized scenario.", json.web3_research_handoff);
  assert(
    json.web3_research_handoff.source_endpoint.includes(`source=${json.web3_research_handoff.source}`) &&
      json.web3_research_handoff.source_endpoint.includes(`account=${json.web3_research_handoff.account}`) &&
      json.web3_research_handoff.source_endpoint.includes(`scenario=${json.web3_research_handoff.scenario}`),
    "Research handoff health source endpoint should match the summarized packet.",
    json.web3_research_handoff,
  );
  assert(
    json.web3_research_handoff.live_review_source_endpoint === "/api/web3-research-handoff-packet?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    "Research handoff health should expose the live-review handoff packet separately.",
    json.web3_research_handoff,
  );
  assert(typeof json.web3_research_handoff.next_unlock_step_label === "string" && json.web3_research_handoff.next_unlock_step_label.length > 0, "Research handoff health should expose the next unlock step.", json.web3_research_handoff);
  assert(typeof json.web3_research_handoff.next_unlock_step_action === "string" && json.web3_research_handoff.next_unlock_step_action.length > 0, "Research handoff health should expose the next unlock action.", json.web3_research_handoff);
  assert(json.web3_research_handoff.current_input?.live_execution_permission === "blocked", "Research handoff health should expose a locked current input contract.", json.web3_research_handoff);
  assert(Array.isArray(json.web3_research_handoff.current_input.target_names), "Research handoff health current input should expose safe target names.", json.web3_research_handoff.current_input);
  assert(json.web3_research_handoff.live_execution_permission === "blocked", "Research handoff health should keep live execution blocked.", json.web3_research_handoff);
  assert(json.web3_research_handoff.wallet_mutation_permission === "blocked", "Research handoff health should keep wallet mutation blocked.", json.web3_research_handoff);
  assert(json.web3_research_handoff.secret_echo_permission === "blocked", "Research handoff health should keep secret echo blocked.", json.web3_research_handoff);
  assert(json.web3_credential_requirements?.mode === "web3-credential-requirements-health", "Health endpoint should expose Web3 credential requirements health.", json.web3_credential_requirements);
  assertReceiptHash("Health credential requirements", json.web3_credential_requirements.receipt_hash);
  assertReceiptHash("Health credential requirements source", json.web3_credential_requirements.research_handoff_hash);
  assert(json.web3_credential_requirements.requirement_count >= 8, "Credential requirements health should expose safe requirement count.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.needed_now_count >= 1, "Credential requirements health should expose needed-now asks.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.blocker_count === json.web3_credential_requirements.requirement_count, "Credential requirements health should keep each requirement blocking live capital.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.next_requirement?.id === "dedicated-public-wallet", "Credential requirements health should expose the next wallet requirement.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.next_requirement?.target_names?.includes("wallet_public_key"), "Credential requirements health should point to the public wallet target.", json.web3_credential_requirements.next_requirement);
  assert(json.web3_credential_requirements.source_endpoint.includes("/api/web3-credential-requirements"), "Credential requirements health should link its standalone endpoint.", json.web3_credential_requirements);
  assert(
    json.web3_credential_requirements.live_review_source_endpoint === "/api/web3-credential-requirements?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    "Credential requirements health should expose the live-review requirements packet separately.",
    json.web3_credential_requirements,
  );
  assert(json.web3_credential_requirements.live_execution_permission === "blocked", "Credential requirements health should keep live execution blocked.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.wallet_mutation_permission === "blocked", "Credential requirements health should keep wallet mutation blocked.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.transaction_submission_permission === "blocked", "Credential requirements health should keep transaction submission blocked.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.signing_permission === "blocked", "Credential requirements health should keep signing blocked.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.private_key_storage === "blocked", "Credential requirements health should keep private-key storage blocked.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.seed_phrase_storage === "blocked", "Credential requirements health should keep seed-phrase storage blocked.", json.web3_credential_requirements);
  assert(json.web3_credential_requirements.secret_echo_permission === "blocked", "Credential requirements health should keep secret echo blocked.", json.web3_credential_requirements);
  assert(json.web3_live_usability?.mode === "web3-live-usability-health", "Health endpoint should expose compact Web3 live-usability health.", json.web3_live_usability);
  assert(
    ["operator-input-needed", "external-review-needed", "live-review-ready", "autonomous-live-locked"].includes(json.web3_live_usability.status),
    "Live-usability health should expose a known status.",
    json.web3_live_usability,
  );
  assertReceiptHash("Health live usability", json.web3_live_usability.receipt_hash);
  assert(typeof json.web3_live_usability.open_operator_input_count === "number", "Live-usability health should expose operator input count.", json.web3_live_usability);
  assert(typeof json.web3_live_usability.real_capital_blocker_count === "number", "Live-usability health should expose real-capital blocker count.", json.web3_live_usability);
  assert(typeof json.web3_live_usability.total_live_usability_row_count === "number", "Live-usability health should expose total live-usability row count.", json.web3_live_usability);
  assert(typeof json.web3_live_usability.listed_live_usability_row_count === "number", "Live-usability health should expose listed live-usability row count.", json.web3_live_usability);
  assert(json.web3_live_usability.total_live_usability_row_count >= json.web3_live_usability.listed_live_usability_row_count, "Live-usability health listed rows should not exceed total rows.", json.web3_live_usability);
  assert(
    ["absent", "needs-jupiter", "needs-wallet", "blocked", "ready-for-strict-verification", "ready-for-live-review-packet"].includes(json.web3_live_usability.credential_doctor_status),
    "Live-usability health should expose credential doctor status.",
    json.web3_live_usability,
  );
  assert(typeof json.web3_live_usability.credential_doctor_receipt_fresh === "boolean", "Live-usability health should expose credential doctor freshness.", json.web3_live_usability);
  assert(typeof json.web3_live_usability.credential_doctor_next_action === "string" && json.web3_live_usability.credential_doctor_next_action.length > 0, "Live-usability health should expose credential doctor next action.", json.web3_live_usability);
  assert(typeof json.web3_live_usability.next_unlock_step_label === "string" && json.web3_live_usability.next_unlock_step_label.length > 0, "Live-usability health should expose the next operator unlock step.", json.web3_live_usability);
  assert(typeof json.web3_live_usability.next_unlock_step_action === "string" && json.web3_live_usability.next_unlock_step_action.length > 0, "Live-usability health should expose the next unlock action.", json.web3_live_usability);
  assert(json.web3_live_usability.next_blocker?.id === "cutover:dedicated-trading-wallet", "Live-usability health should expose the next dependency-ranked blocker.", json.web3_live_usability);
  assert(json.web3_live_usability.next_blocker?.owner === "operator" && json.web3_live_usability.next_blocker?.source === "cutover", "Live-usability health next blocker should expose owner/source routing.", json.web3_live_usability.next_blocker);
  assert(json.web3_live_usability.next_blocker?.href === "/settings/integrations#settings-web3-wallet-public-key", "Live-usability health next blocker should expose the safe fix surface.", json.web3_live_usability.next_blocker);
  assert(String(json.web3_live_usability.next_blocker?.safe_command ?? "").includes("--require-operator-wallet"), "Live-usability health next blocker should expose the strict safe verifier command.", json.web3_live_usability.next_blocker);
  assert(json.web3_live_usability.next_blocker?.blocks_live_capital === true, "Live-usability health next blocker should preserve live-capital blocking status.", json.web3_live_usability.next_blocker);
  assert(json.web3_live_usability.next_credential_request?.fix_href === "/settings/integrations#settings-web3-wallet-public-key", "Live-usability health should expose the next credential request fix surface.", json.web3_live_usability.next_credential_request);
  assert(String(json.web3_live_usability.next_credential_request?.safe_value_description ?? "").includes("public Solana trading wallet address"), "Live-usability health should describe the safe next credential value.", json.web3_live_usability.next_credential_request);
  assert(String(json.web3_live_usability.next_credential_request?.verifier_command ?? "").includes("--require-operator-wallet"), "Live-usability health should expose the next credential verifier command.", json.web3_live_usability.next_credential_request);
  assert(Array.isArray(json.web3_live_usability.next_credential_request?.completion_criteria) && json.web3_live_usability.next_credential_request.completion_criteria.join(" ").includes("strict operator-wallet verifier"), "Live-usability health should expose the next credential completion criteria.", json.web3_live_usability.next_credential_request);
  assert(json.web3_live_usability.next_credential_request.completion_criteria.join(" ").includes("live execution"), "Live-usability health completion criteria should preserve the live-execution lock.", json.web3_live_usability.next_credential_request);
  assert(Array.isArray(json.web3_live_usability.next_credential_request?.verification_runway) && json.web3_live_usability.next_credential_request.verification_runway.length >= 3, "Live-usability health should expose the next credential verification runway.", json.web3_live_usability.next_credential_request);
  assert(json.web3_live_usability.next_credential_request.verification_runway.some((step) => String(step.command ?? "").includes("--require-operator-wallet")), "Live-usability health verification runway should carry the strict wallet verifier.", json.web3_live_usability.next_credential_request);
  assert(json.web3_live_usability.next_credential_request.verification_runway.every((step) => step.live_execution_permission === "blocked" && step.wallet_mutation_permission === "blocked" && step.secret_echo_permission === "blocked"), "Live-usability health verification runway should keep live, wallet, and secret permissions blocked.", json.web3_live_usability.next_credential_request);
  assert(json.web3_live_usability.next_credential_request?.live_execution_permission === "blocked", "Live-usability health next credential request should keep live execution blocked.", json.web3_live_usability.next_credential_request);
  assert(json.web3_live_usability.next_credential_request?.secret_echo_permission === "blocked", "Live-usability health next credential request should keep secret echo blocked.", json.web3_live_usability.next_credential_request);
  assert(json.web3_live_usability.current_input?.live_execution_permission === "blocked", "Live-usability health should expose a locked current input contract.", json.web3_live_usability);
  assert(Array.isArray(json.web3_live_usability.current_input.target_names), "Live-usability health current input should expose safe target names.", json.web3_live_usability.current_input);
  assert(json.web3_live_usability.live_execution_permission === "blocked", "Live-usability health should keep live execution blocked.", json.web3_live_usability);
  assert(json.web3_live_usability.wallet_mutation_permission === "blocked", "Live-usability health should keep wallet mutation blocked.", json.web3_live_usability);
  assert(json.web3_live_usability.transaction_submission_permission === "blocked", "Live-usability health should keep transaction submission blocked.", json.web3_live_usability);
  assert(json.web3_live_usability.signing_permission === "blocked", "Live-usability health should keep signing blocked.", json.web3_live_usability);
  assert(json.web3_live_usability.private_key_storage === "blocked", "Live-usability health should keep private-key storage blocked.", json.web3_live_usability);
  assert(json.web3_live_usability.seed_phrase_storage === "blocked", "Live-usability health should keep seed-phrase storage blocked.", json.web3_live_usability);
  assert(json.web3_live_usability.secret_echo_permission === "blocked", "Live-usability health should keep secret echo blocked.", json.web3_live_usability);
  record("health", "pass", "live, wallet mutation, runbook, research handoff, and live-usability locks are blocked");
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

async function verifyUsabilityStatusReceipt() {
  const { response, json } = await requestJson("/api/web3-usability-status?source=live-dex&account=persistent");
  assert(response.status === 200, "Web3 usability status should return 200.", { status: response.status, json });
  assert(json.mode === "web3-usability-status", "Web3 usability status should expose the expected mode.", json);
  assert(["paper-usable", "dry-run-gated", "supervised-live-gated", "autonomous-live-locked"].includes(json.status), "Web3 usability status should use a known status.", json);
  assert(["copilot", "paper-autonomy", "dry-run-rehearsal", "supervised-live-review", "autonomous-live"].includes(json.current_mode), "Web3 usability status should name the current mode.", json);
  assert(Array.isArray(json.capabilities) && json.capabilities.length >= 7, "Web3 usability status should include capability lanes.", json);
  assert(json.capabilities.some((item) => item.id === "copilot" && item.status === "usable"), "Web3 usability status should mark copilot usable.", json.capabilities);
  assert(json.capabilities.some((item) => item.id === "paper-autonomy" && ["usable", "watch", "gated"].includes(item.status)), "Web3 usability status should report paper autonomy.", json.capabilities);
  assert(json.capabilities.some((item) => item.id === "jupiter-dry-run"), "Web3 usability status should report the Jupiter dry-run lane.", json.capabilities);
  assert(json.capabilities.some((item) => item.id === "supervised-live"), "Web3 usability status should report the supervised live lane.", json.capabilities);
  assert(json.capabilities.some((item) => item.id === "autonomous-live" && item.status === "locked"), "Web3 usability status should keep autonomous live locked.", json.capabilities);
  assert(Array.isArray(json.operator_unlock_sequence) && json.operator_unlock_sequence.length === 6, "Web3 usability status should expose the operator unlock sequence.", json);
  assert(json.operator_unlock_sequence.map((item) => item.id).join(",") === "scope-wallet,prove-wallet,rehearse-jupiter,choose-signer,ops-accounting,external-review", "Web3 usability status should keep the operator unlock sequence ordered.", json.operator_unlock_sequence);
  assert(json.operator_unlock_sequence.some((item) => item.id === "external-review" && String(item.evidence).includes("live execution remains blocked")), "Web3 usability status should keep external review behind the live boundary.", json.operator_unlock_sequence);
  assert(typeof json.next_gate_label === "string" && json.next_gate_label.length > 0, "Web3 usability status should name the next gate.", json);
  assert(typeof json.next_gate_action === "string" && json.next_gate_action.length > 0, "Web3 usability status should name the next action.", json);
  assert(json.live_execution_permission === "blocked", "Web3 usability status must keep live execution blocked.", json);
  assert(json.wallet_mutation_permission === "blocked", "Web3 usability status must keep wallet mutation blocked.", json);
  assert(json.transaction_submission_permission === "blocked", "Web3 usability status must keep transaction submission blocked.", json);
  assert(json.private_key_storage === "blocked", "Web3 usability status must keep private key storage blocked.", json);
  assert(json.seed_phrase_storage === "blocked", "Web3 usability status must keep seed phrase storage blocked.", json);
  assert(json.secret_echo_permission === "blocked", "Web3 usability status must keep secret echo blocked.", json);
  assert(Array.isArray(json.safe_commands) && json.safe_commands.includes("npm run doctor:web3 -- --json"), "Web3 usability status should include safe verifier/doctor commands.", json.safe_commands);
  record("usability-status-receipt", "pass", `${json.current_mode}; next gate ${json.next_gate_label}`);
}

async function verifyLiveUsabilityBlockersReceipt() {
  const { response, json } = await requestJson("/api/web3-live-usability-blockers?source=live-dex&account=persistent&scenario=breakout&cycles=0");
  assert(response.status === 200, "Live usability blockers receipt should return 200.", { status: response.status, json });
  assert(json.mode === "web3-live-usability-blockers", "Live usability blockers should expose the expected mode.", json);
  assert(
    ["operator-input-needed", "external-review-needed", "live-review-ready", "autonomous-live-locked"].includes(json.status),
    "Live usability blockers should use a known status.",
    json,
  );
  assertReceiptHash("Live usability blockers", json.receipt_hash);
  assert(["copilot", "paper-autonomy", "dry-run-rehearsal", "supervised-live-review", "autonomous-live"].includes(json.current_mode), "Live usability blockers should include current mode.", json);
  assert(typeof json.paper_usable === "boolean", "Live usability blockers should state whether paper is usable.", json);
  assert(typeof json.dry_run_usable === "boolean", "Live usability blockers should state whether dry-run is usable.", json);
  assert(json.autonomous_live_locked === true, "Live usability blockers should explicitly lock autonomous live trading.", json);
  assert(typeof json.open_operator_input_count === "number", "Live usability blockers should count open operator inputs.", json);
  assert(typeof json.real_capital_blocker_count === "number", "Live usability blockers should count real-capital blockers.", json);
  assert(typeof json.total_live_usability_row_count === "number", "Live usability blockers should count total live-usability rows.", json);
  assert(typeof json.listed_live_usability_row_count === "number", "Live usability blockers should count listed live-usability rows.", json);
  assert(json.total_live_usability_row_count >= json.listed_live_usability_row_count, "Live usability blockers listed rows should not exceed total rows.", json);
  assert(json.live_usability_row_scope === "compact", "Live usability blockers should default to compact row scope.", json);
  assert(json.ready_live_lane_count <= json.total_live_lane_count, "Live usability blockers live-lane counts should reconcile.", json);
  assert(
    json.passed_signoff_count + json.failed_or_watch_signoff_count === json.required_signoff_count,
    "Live usability blockers signoff counts should reconcile.",
    json,
  );
  assert(Array.isArray(json.missing_for_live_usability), "Live usability blockers should include missing-for-usability rows.", json);
  assert(Array.isArray(json.missing_owner_summary) && json.missing_owner_summary.length > 0, "Live usability blockers should include owner summary rows.", json.missing_owner_summary);
  assert(Array.isArray(json.missing_source_summary) && json.missing_source_summary.length > 0, "Live usability blockers should include source summary rows.", json.missing_source_summary);
  assert(json.credential_doctor && typeof json.credential_doctor === "object", "Live usability blockers should include the credential doctor summary.", json.credential_doctor);
  assert(
    ["absent", "needs-jupiter", "needs-wallet", "blocked", "ready-for-strict-verification", "ready-for-live-review-packet"].includes(json.credential_doctor.status),
    "Live usability credential doctor summary should use a known status.",
    json.credential_doctor,
  );
  assert(typeof json.credential_doctor.receipt_fresh === "boolean", "Live usability credential doctor summary should state freshness.", json.credential_doctor);
  assert(typeof json.credential_doctor.next_action === "string" && json.credential_doctor.next_action.length > 0, "Live usability credential doctor summary should include a next action.", json.credential_doctor);
  assert(String(json.credential_doctor.safe_command ?? "").includes("doctor:web3"), "Live usability credential doctor summary should include the safe doctor command.", json.credential_doctor);
  assert(
    json.missing_owner_summary.reduce((sum, item) => sum + item.missing_count, 0) === json.total_live_usability_row_count,
    "Live usability blocker owner summary should reconcile to total rows.",
    json.missing_owner_summary,
  );
  assert(
    json.missing_source_summary.reduce((sum, item) => sum + item.missing_count, 0) === json.total_live_usability_row_count,
    "Live usability blocker source summary should reconcile to total rows.",
    json.missing_source_summary,
  );
  assert(
    typeof json.summary === "string" && json.summary.includes("cutover setup blocker") && json.summary.includes("total live-usability row") && json.summary.includes("dependency-ranked row"),
    "Live usability blockers summary should distinguish cutover blockers from dependency-ranked usability rows.",
    json.summary,
  );
  assert(Array.isArray(json.operator_unlock_sequence) && json.operator_unlock_sequence.map((item) => item.id).join(",") === "scope-wallet,prove-wallet,rehearse-jupiter,choose-signer,ops-accounting,external-review", "Live usability blockers should carry the ordered unlock sequence.", json.operator_unlock_sequence);
  assert(json.operator_unlock_sequence.some((item) => item.id === json.next_unlock_step?.id), "Live usability blockers should expose the next ordered unlock step before downstream proof work.", json.next_unlock_step);
  if (json.next_unlock_step?.id === "scope-wallet") {
    assert(json.missing_for_live_usability[0]?.id === "cutover:dedicated-trading-wallet", "Live usability blockers should list dedicated wallet scope before wallet proof.", json.missing_for_live_usability);
  }
  if (json.next_unlock_step?.id === "prove-wallet") {
    assert(json.missing_for_live_usability[0]?.id === "cutover:wallet-ownership-proof", "Live usability blockers should advance to wallet proof after public wallet scope is present.", json.missing_for_live_usability);
  }
  assert(json.missing_for_live_usability.every((item) => typeof item.next_action === "string" && item.next_action.length > 0), "Live usability blocker rows should name next actions.", json.missing_for_live_usability);
  assert(Array.isArray(json.safe_next_actions) && json.safe_next_actions.length > 0, "Live usability blockers should include safe next actions.", json.safe_next_actions);
  assert(Array.isArray(json.verifier_commands) && json.verifier_commands.some((command) => command.includes("verify:web3")), "Live usability blockers should include verifier commands.", json.verifier_commands);
  assert(Array.isArray(json.evidence_endpoints) && json.evidence_endpoints.includes("GET /api/web3-manual-live-review-packet"), "Live usability blockers should link manual live review evidence.", json.evidence_endpoints);
  assert(Array.isArray(json.safe_to_provide) && json.safe_to_provide.includes("Dedicated Solana public wallet address"), "Live usability blockers should list safe operator inputs.", json.safe_to_provide);
  assert(Array.isArray(json.never_provide) && json.never_provide.includes("Seed phrase or mnemonic"), "Live usability blockers should keep seed phrases in never-provide list.", json.never_provide);
  assertBlockedAuthority("Live usability blockers", json);
  const allRows = await requestJson("/api/web3-live-usability-blockers?source=live-dex&account=persistent&scenario=breakout&cycles=0&rows=all");
  assert(allRows.response.status === 200, "Live usability blockers all-row receipt should return 200.", { status: allRows.response.status, json: allRows.json });
  assert(allRows.json.live_usability_row_scope === "all", "Live usability blockers all-row receipt should expose all row scope.", allRows.json);
  assert(allRows.json.listed_live_usability_row_count === allRows.json.total_live_usability_row_count, "Live usability blockers rows=all should list every safe missing row.", allRows.json);
  assert(allRows.json.missing_for_live_usability.length === allRows.json.total_live_usability_row_count, "Live usability blockers rows=all rows should match total count.", allRows.json.missing_for_live_usability);
  assert(
    allRows.json.missing_owner_summary.reduce((sum, item) => sum + item.missing_count, 0) === allRows.json.total_live_usability_row_count,
    "Live usability blockers rows=all owner summary should reconcile to total rows.",
    allRows.json.missing_owner_summary,
  );
  assert(
    allRows.json.missing_source_summary.reduce((sum, item) => sum + item.missing_count, 0) === allRows.json.total_live_usability_row_count,
    "Live usability blockers rows=all source summary should reconcile to total rows.",
    allRows.json.missing_source_summary,
  );
  assert(allRows.json.credential_doctor?.status === json.credential_doctor.status, "Live usability blockers rows=all should keep the same credential doctor status.", allRows.json.credential_doctor);
  assert(
    typeof allRows.json.summary === "string" && allRows.json.summary.includes("all dependency-ranked rows are listed"),
    "Live usability blockers rows=all summary should say all rows are listed.",
    allRows.json.summary,
  );
  assertBlockedAuthority("Live usability blockers all-row receipt", allRows.json);
  record(
    "live-usability-blockers",
    "pass",
    `${json.status}; ${json.missing_for_live_usability.length}/${allRows.json.missing_for_live_usability.length} missing rows; ${json.safe_action_count} safe actions`,
  );
}

async function verifyCredentialDoctorRefreshPreview() {
  const { response, json } = await postJson("/api/web3-credential-doctor", {
    operator_ack: true,
    preview_only: true,
    refresh_supervisor: true,
    scenario: "breakout",
    source: "live-dex",
    account: "persistent",
  });
  assert(response.status === 200, "Credential doctor refresh preview should return 200.", { status: response.status, json });
  assert(json.mode === "web3-credential-doctor-refresh", "Credential doctor refresh preview should expose the expected mode.", json);
  assert(json.status === "preview", "Credential doctor refresh preview should not rewrite the local doctor receipt.", json);
  assert(json.refreshed === false, "Credential doctor refresh preview should report refreshed=false.", json);
  assert(json.refresh_supervisor_requested === true, "Credential doctor refresh preview should carry supervisor refresh intent.", json);
  assert(json.api_boundary === "local-sanitized-doctor", "Credential doctor refresh should stay inside the local sanitized doctor boundary.", json);
  assert(json.local_refresh_allowed === true, "Credential doctor refresh preview should be allowed only for the local verifier host.", json);
  assert(json.doctor && json.doctor.mode === "web3-credential-doctor", "Credential doctor refresh preview should include the current sanitized doctor health.", json.doctor);
  assert(Array.isArray(json.controls) && json.controls.some((control) => control.includes("trusted localhost")), "Credential doctor refresh preview should document the localhost boundary.", json.controls);
  assert(Array.isArray(json.controls) && json.controls.some((control) => control.includes("Private keys")), "Credential doctor refresh preview should document secret boundaries.", json.controls);
  assertBlockedAuthority("Credential doctor refresh preview", json);
  assertBlockedWhenPresent("Credential doctor refresh preview doctor", json.doctor, [
    "live_execution_permission",
    "wallet_mutation_permission",
    "private_key_storage",
    "seed_phrase_storage",
    "secret_echo_permission",
  ]);
  record("credential-doctor-refresh-preview", "pass", `${json.doctor.status}; preview did not rewrite local receipt`);
}

function assertReceiptHash(label, value) {
  assert(typeof value === "string" && /^[0-9a-f]{64}$/.test(value), `${label} should include a 64-character receipt hash.`, value);
}

function assertBlockedWhenPresent(label, json, fields) {
  for (const field of fields) {
    if (field in json) {
      assert(json[field] === "blocked", `${label} must keep ${field.replaceAll("_", " ")} blocked.`, json);
    }
  }
}

async function verifyLiveReadinessPackets() {
  const wallet = await requestJson("/api/web3-dedicated-wallet-packet?source=sample&account=persistent&scenario=breakout&cycles=0");
  assert(wallet.response.status === 200, "Dedicated wallet packet should return 200.", {
    status: wallet.response.status,
    json: wallet.json,
  });
  assert(wallet.json.mode === "web3-dedicated-wallet-packet", "Dedicated wallet packet should expose the expected mode.", wallet.json);
  assert(["missing-wallet", "sample-wallet", "ownership-needed", "strict-verifier-ready", "review-ready"].includes(wallet.json.status), "Dedicated wallet packet should use a known status.", wallet.json);
  assertReceiptHash("Dedicated wallet packet", wallet.json.receipt_hash);
  assert(wallet.json.strict_verifier_command?.includes("--require-operator-wallet"), "Dedicated wallet packet should expose the strict operator-wallet verifier.", wallet.json);
  assert(Array.isArray(wallet.json.steps) && wallet.json.steps.some((step) => step.id === "keep-secrets-out"), "Dedicated wallet packet should include the keep-secrets-out step.", wallet.json.steps);
  assert(Array.isArray(wallet.json.setup_links) && wallet.json.setup_links.some((link) => String(link.url).includes("solana.com/wallets")), "Dedicated wallet packet should link external wallet setup docs.", wallet.json.setup_links);
  assertBlockedAuthority("Dedicated wallet packet", wallet.json);

  const jupiter = await requestJson("/api/web3-jupiter-order-packet?source=sample&account=persistent&scenario=breakout&cycles=0");
  assert(jupiter.response.status === 200, "Jupiter order packet should return 200.", {
    status: jupiter.response.status,
    json: jupiter.json,
  });
  assert(jupiter.json.mode === "web3-jupiter-order-packet", "Jupiter order packet should expose the expected mode.", jupiter.json);
  assert(["missing-key", "wallet-needed", "rehearsal-needed", "review-ready"].includes(jupiter.json.status), "Jupiter order packet should use a known status.", jupiter.json);
  assertReceiptHash("Jupiter order packet", jupiter.json.receipt_hash);
  assert(Array.isArray(jupiter.json.env_targets) && jupiter.json.env_targets.includes("JUPITER_API_KEY"), "Jupiter order packet should name the server env target.", jupiter.json.env_targets);
  assert(jupiter.json.strict_verifier_command?.includes("--require-jupiter-order"), "Jupiter order packet should expose the strict Jupiter verifier.", jupiter.json);
  assert(jupiter.json.rehearsal_endpoint === "POST /api/web3-jupiter-rehearsal", "Jupiter order packet should point to the rehearsal endpoint.", jupiter.json);
  assert(jupiter.json.unsigned_transaction_return === "withheld", "Jupiter order packet should withhold unsigned transaction bytes.", jupiter.json);
  assert(jupiter.json.transaction_body_storage === "blocked", "Jupiter order packet should block transaction body storage.", jupiter.json);
  assert(jupiter.json.execute_permission === "blocked", "Jupiter order packet should block execute permission.", jupiter.json);
  assertBlockedAuthority("Jupiter order packet", jupiter.json);

  const signer = await requestJson("/api/web3-signer-credential-packet?source=sample&account=persistent&scenario=breakout&cycles=0");
  assert(signer.response.status === 200, "Signer credential packet should return 200.", {
    status: signer.response.status,
    json: signer.json,
  });
  assert(signer.json.mode === "web3-signer-credential-packet", "Signer credential packet should expose the expected mode.", signer.json);
  assert(
    ["missing-wallet", "needs-provider-choice", "needs-provider-credentials", "needs-policy", "needs-signer-request", "review-ready", "blocked"].includes(signer.json.status),
    "Signer credential packet should use a known status.",
    signer.json,
  );
  assertReceiptHash("Signer credential packet", signer.json.receipt_hash);
  assert(signer.json.recommended_provider === "external-wallet", "Signer credential packet should recommend external wallet first.", signer.json);
  assert(Array.isArray(signer.json.paths) && signer.json.paths.some((path) => path.id === "external-wallet" && path.requires_user_presence === true), "Signer credential packet should include a user-present external wallet path.", signer.json.paths);
  assert(Array.isArray(signer.json.required_evidence) && signer.json.required_evidence.some((item) => item.includes("Manual live-executor review")), "Signer credential packet should require manual live-executor review.", signer.json.required_evidence);
  assert(signer.json.external_account_permission === "operator-external-only", "Signer credential packet should keep provider accounts external.", signer.json);
  assert(signer.json.in_app_provider_signup_permission === "blocked", "Signer credential packet should block in-app provider signup.", signer.json);
  assert(signer.json.raw_transaction_storage === "blocked", "Signer credential packet should block raw transaction storage.", signer.json);
  assert(signer.json.signed_payload_storage === "blocked", "Signer credential packet should block signed payload storage.", signer.json);
  assertBlockedWhenPresent("Signer credential packet", signer.json, [
    "live_execution_permission",
    "wallet_mutation_permission",
    "private_key_storage",
    "seed_phrase_storage",
    "secret_echo_permission",
  ]);

  const liveOps = await requestJson("/api/web3-live-ops-packet?source=sample&account=persistent&scenario=breakout&cycles=0");
  assert(liveOps.response.status === 200, "Live ops packet should return 200.", {
    status: liveOps.response.status,
    json: liveOps.json,
  });
  assert(liveOps.json.mode === "web3-live-ops-packet", "Live ops packet should expose the expected mode.", liveOps.json);
  assert(
    ["missing-supervisor", "stale-supervisor", "missing-emergency-stop", "accounting-needed", "process-review-needed", "manual-review-needed", "blocked"].includes(liveOps.json.status),
    "Live ops packet should use a known status.",
    liveOps.json,
  );
  assertReceiptHash("Live ops packet", liveOps.json.receipt_hash);
  assert(liveOps.json.can_satisfy_process_gate === false, "Live ops packet must not satisfy the production process gate from inside the app.", liveOps.json);
  assert(liveOps.json.manual_live_review_required === true, "Live ops packet should require manual live review.", liveOps.json);
  assert(Array.isArray(liveOps.json.safe_commands) && liveOps.json.safe_commands.some((command) => command.includes("verify:web3")), "Live ops packet should include safe verifier commands.", liveOps.json.safe_commands);
  assert(liveOps.json.external_dispatch_permission === "blocked", "Live ops packet should block external dispatch.", liveOps.json);
  assertBlockedAuthority("Live ops packet", liveOps.json);

  const preflight = await requestJson("/api/web3-live-capital-preflight?source=sample&account=persistent&scenario=breakout&cycles=0");
  assert(preflight.response.status === 200, "Live-capital preflight should return 200.", {
    status: preflight.response.status,
    json: preflight.json,
  });
  assert(preflight.json.mode === "web3-live-capital-preflight-receipt", "Live-capital preflight should expose the expected mode.", preflight.json);
  assert(["blocked", "blocked-as-expected", "manual-live-review"].includes(preflight.json.status), "Live-capital preflight should use a known status.", preflight.json);
  assertReceiptHash("Live-capital preflight", preflight.json.receipt_hash);
  assert(Array.isArray(preflight.json.gates) && preflight.json.gates.length >= 10, "Live-capital preflight should include gate rows.", preflight.json.gates);
  assert(
    ["operator-wallet", "provider-read-rail", "live-dex", "jupiter-order", "risk-policy", "kill-switch", "signer-custody", "settlement", "profit-proof", "manual-live-review"].every((id) =>
      preflight.json.gates.some((gate) => gate.id === id),
    ),
    "Live-capital preflight should cover every real-capital gate.",
    preflight.json.gates,
  );
  assert(preflight.json.passed_gate_count + preflight.json.watch_gate_count + preflight.json.failed_gate_count === preflight.json.gates.length, "Live-capital preflight gate totals should reconcile.", preflight.json);
  assert(preflight.json.wallet_mutation_permission === "blocked", "Live-capital preflight must keep wallet mutation blocked.", preflight.json);
  assert(preflight.json.transaction_submission_permission === "blocked", "Live-capital preflight must keep transaction submission blocked.", preflight.json);
  assert(preflight.json.private_key_storage === "blocked", "Live-capital preflight must block private-key storage.", preflight.json);
  assert(preflight.json.secret_echo_permission === "blocked", "Live-capital preflight must block secret echo.", preflight.json);
  assert(preflight.json.real_capital_blocked === true || preflight.json.live_execution_permission === "manual-live-executor-review", "Live-capital preflight should never grant direct real-capital authority.", preflight.json);

  const accounting = await requestJson("/api/web3-accounting-ledger?source=sample&account=persistent&scenario=breakout&cycles=0");
  assert(accounting.response.status === 200, "Accounting ledger receipt should return 200.", {
    status: accounting.response.status,
    json: accounting.json,
  });
  assert(accounting.json.mode === "web3-accounting-ledger-receipt", "Accounting ledger receipt should expose the expected mode.", accounting.json);
  assert(["paper-ledger-ready", "missing-paper-fills", "live-accounting-gated", "settlement-review", "blocked"].includes(accounting.json.status), "Accounting ledger receipt should use a known status.", accounting.json);
  assertReceiptHash("Accounting ledger receipt", accounting.json.receipt_hash);
  assert(accounting.json.export_scope === "paper-ledger-and-redacted-readiness", "Accounting ledger receipt should use the redacted export scope.", accounting.json);
  assert(accounting.json.accounting_boundary === "paper-only", "Accounting ledger receipt should keep accounting paper-only.", accounting.json);
  assert(Array.isArray(accounting.json.export_columns) && accounting.json.export_columns.includes("source_id_hash"), "Accounting ledger receipt should export hashed source ids.", accounting.json.export_columns);
  assert(Array.isArray(accounting.json.checks) && accounting.json.checks.some((check) => check.id === "live-boundary"), "Accounting ledger receipt should include live-boundary checks.", accounting.json.checks);
  assert(accounting.json.live_execution_permission === "blocked", "Accounting ledger receipt must keep live execution blocked.", accounting.json);
  assert(accounting.json.wallet_mutation_permission === "blocked", "Accounting ledger receipt must keep wallet mutation blocked.", accounting.json);
  assert(["paper-only", "blocked"].includes(accounting.json.tax_export_permission), "Accounting ledger receipt should keep tax export paper-only or blocked.", accounting.json);

  record(
    "live-readiness-packets",
    "pass",
    `wallet ${wallet.json.status}; jupiter ${jupiter.json.status}; signer ${signer.json.status}; ops ${liveOps.json.status}; preflight ${preflight.json.blocker_count} blockers; accounting ${accounting.json.status}`,
  );
}

async function verifyOperatorSetupPackets() {
  const handoff = await requestJson("/api/web3-operator-credential-handoff?source=live-dex&account=persistent&scenario=breakout&cycles=0");
  assert(handoff.response.status === 200, "Operator credential handoff should return 200.", {
    status: handoff.response.status,
    json: handoff.json,
  });
  assert(handoff.json.mode === "web3-operator-credential-handoff", "Operator credential handoff should expose the expected mode.", handoff.json);
  assert(["needs-operator-input", "ready-for-dry-run-rehearsal", "ready-for-manual-live-review"].includes(handoff.json.status), "Operator credential handoff should use a known status.", handoff.json);
  assert(typeof handoff.json.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(handoff.json.receipt_hash), "Operator credential handoff should include a receipt hash.", handoff.json);
  assert(handoff.json.live_usability?.mode === "web3-operator-credential-live-usability-summary", "Operator credential handoff should expose a compact live-usability summary.", handoff.json.live_usability);
  assert(typeof handoff.json.live_usability.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(handoff.json.live_usability.receipt_hash), "Handoff live-usability summary should include the blocker receipt hash.", handoff.json.live_usability);
  assert(typeof handoff.json.live_usability.real_capital_blocker_count === "number", "Handoff live-usability summary should expose real-capital blockers.", handoff.json.live_usability);
  assert(typeof handoff.json.live_usability.total_live_usability_row_count === "number", "Handoff live-usability summary should expose total live-usability rows.", handoff.json.live_usability);
  assert(typeof handoff.json.live_usability.listed_live_usability_row_count === "number", "Handoff live-usability summary should expose listed live-usability rows.", handoff.json.live_usability);
  assert(handoff.json.live_usability.total_live_usability_row_count >= handoff.json.live_usability.listed_live_usability_row_count, "Handoff live-usability listed rows should not exceed total rows.", handoff.json.live_usability);
  assert(typeof handoff.json.live_usability.next_unlock_step_label === "string" && handoff.json.live_usability.next_unlock_step_label.length > 0, "Handoff live-usability summary should expose the next unlock step.", handoff.json.live_usability);
  assert(handoff.json.live_usability.evidence_endpoint === "GET /api/web3-live-usability-blockers", "Handoff live-usability summary should point at the full blocker packet.", handoff.json.live_usability);
  assertBlockedAuthority("Operator credential handoff", handoff.json);

  const requestPacket = await requestJson("/api/web3-operator-request-packet?source=live-dex&account=persistent&scenario=breakout&cycles=0");
  assert(requestPacket.response.status === 200, "Operator request packet should return 200.", {
    status: requestPacket.response.status,
    json: requestPacket.json,
  });
  assert(requestPacket.json.mode === "web3-operator-request-packet", "Operator request packet should expose the expected mode.", requestPacket.json);
  assert(["needs-input", "ready-for-review"].includes(requestPacket.json.status), "Operator request packet should use a known status.", requestPacket.json);
  assert(typeof requestPacket.json.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(requestPacket.json.receipt_hash), "Operator request packet should include a receipt hash.", requestPacket.json);
  assert(Array.isArray(requestPacket.json.required_inputs), "Operator request packet should include required inputs.", requestPacket.json);
  assert(Array.isArray(requestPacket.json.review_inputs), "Operator request packet should include review inputs.", requestPacket.json);
  assert(Array.isArray(requestPacket.json.safe_to_provide) && requestPacket.json.safe_to_provide.includes("Dedicated Solana public wallet address"), "Operator request packet should list safe operator inputs.", requestPacket.json.safe_to_provide);
  assert(Array.isArray(requestPacket.json.never_provide) && requestPacket.json.never_provide.includes("Seed phrase or mnemonic"), "Operator request packet should keep seed phrases in never-provide list.", requestPacket.json.never_provide);
  assert(Array.isArray(requestPacket.json.verifier_commands) && requestPacket.json.verifier_commands.some((command) => command.includes("verify:web3")), "Operator request packet should include verifier commands.", requestPacket.json.verifier_commands);
  assert(typeof requestPacket.json.text_packet === "string" && requestPacket.json.text_packet.includes("# Mastermind Web3 Operator Request Packet"), "Operator request packet should include pasteable text.", requestPacket.json.text_packet);
  assert(Array.isArray(requestPacket.json.operator_unlock_sequence) && requestPacket.json.operator_unlock_sequence.map((item) => item.id).join(",") === "scope-wallet,prove-wallet,rehearse-jupiter,choose-signer,ops-accounting,external-review", "Operator request packet should carry the ordered unlock sequence.", requestPacket.json.operator_unlock_sequence);
  assert(requestPacket.json.operator_unlock_sequence.some((item) => item.id === requestPacket.json.next_unlock_step?.id), "Operator request packet should expose the next ordered unlock step.", requestPacket.json.next_unlock_step);
  assert(requestPacket.json.live_usability?.mode === "web3-operator-credential-live-usability-summary", "Operator request packet should carry a compact live-usability summary.", requestPacket.json.live_usability);
  assert(typeof requestPacket.json.live_usability.real_capital_blocker_count === "number", "Operator request packet live-usability summary should expose real-money blocker count.", requestPacket.json.live_usability);
  assert(requestPacket.json.live_usability.total_live_usability_row_count >= requestPacket.json.live_usability.listed_live_usability_row_count, "Operator request packet live-usability summary listed rows should not exceed total rows.", requestPacket.json.live_usability);
  assert(requestPacket.json.live_usability.evidence_endpoint === "GET /api/web3-live-usability-blockers", "Operator request packet live-usability summary should point to the full blocker endpoint.", requestPacket.json.live_usability);
  assert(requestPacket.json.text_packet.includes("Next Ordered Unlock Step"), "Operator request text should name the next ordered unlock step.", requestPacket.json.text_packet);
  assert(requestPacket.json.text_packet.includes("Operator Unlock Sequence"), "Operator request text should include the ordered unlock sequence.", requestPacket.json.text_packet);
  assert(requestPacket.json.text_packet.includes("Live Usability Summary"), "Operator request text should include the live-usability summary.", requestPacket.json.text_packet);
  assert(requestPacket.json.text_packet.includes("Rows listed:"), "Operator request text should include listed-versus-total live-usability rows.", requestPacket.json.text_packet);
  assert(requestPacket.json.text_packet.includes("Never Provide"), "Operator request text should include the never-provide boundary.", requestPacket.json.text_packet);
  assertBlockedAuthority("Operator request packet", requestPacket.json);

  const cutover = await requestJson("/api/web3-cutover-blocker-board?source=live-dex&account=persistent&scenario=breakout&cycles=0");
  assert(cutover.response.status === 200, "Cutover blocker board should return 200.", {
    status: cutover.response.status,
    json: cutover.json,
  });
  assert(cutover.json.mode === "web3-cutover-blocker-board", "Cutover blocker board should expose the expected mode.", cutover.json);
  assert(["needs-input", "ready-for-review"].includes(cutover.json.status), "Cutover blocker board should use a known status.", cutover.json);
  assert(typeof cutover.json.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(cutover.json.receipt_hash), "Cutover blocker board should include a receipt hash.", cutover.json);
  assert(typeof cutover.json.request_packet_hash === "string" && /^[0-9a-f]{64}$/.test(cutover.json.request_packet_hash), "Cutover board should include a request packet hash.", cutover.json);
  assert(typeof cutover.json.runway_hash === "string" && /^[0-9a-f]{64}$/.test(cutover.json.runway_hash), "Cutover board should include a runway hash.", cutover.json);
  assert(typeof cutover.json.usability_hash === "string" && /^[0-9a-f]{64}$/.test(cutover.json.usability_hash), "Cutover board should include a usability hash.", cutover.json);
  assert(Array.isArray(cutover.json.rows) && cutover.json.rows.length >= requestPacket.json.required_inputs.length, "Cutover blocker board should include setup rows.", cutover.json.rows);
  assert(typeof cutover.json.open_blocker_count === "number", "Cutover blocker board should expose open blocker count.", cutover.json);
  assert(cutover.json.now_count + cutover.json.before_live_count + cutover.json.review_count === cutover.json.open_blocker_count, "Cutover blocker phase counts should reconcile.", cutover.json);
  assert(cutover.json.owner_counts && typeof cutover.json.owner_counts.operator === "number", "Cutover blocker board should expose owner counts.", cutover.json.owner_counts);
  assert(Array.isArray(cutover.json.verifier_commands) && cutover.json.verifier_commands.some((command) => command.includes("verify:web3")), "Cutover blocker board should include verifier commands.", cutover.json.verifier_commands);
  assert(cutover.json.rows.every((row) => typeof row.next_action === "string" && row.next_action.length > 0), "Cutover rows should name next actions.", cutover.json.rows);
  assert(cutover.json.rows.every((row) => row.secret_handling && !/private key|seed phrase/i.test(row.safe_collection_surface ?? "")), "Cutover rows should include secret-handling guidance without unsafe collection surfaces.", cutover.json.rows);
  assertBlockedAuthority("Cutover blocker board", cutover.json);

  const runway = await requestJson("/api/web3-supervised-live-runway?source=live-dex&account=persistent&scenario=breakout&cycles=0");
  assert(runway.response.status === 200, "Supervised live runway should return 200.", {
    status: runway.response.status,
    json: runway.json,
  });
  assert(runway.json.mode === "web3-supervised-live-runway", "Supervised live runway should expose the expected mode.", runway.json);
  assert(runway.json.launch_model === "supervised-external-wallet-first", "Supervised live runway should use the external-wallet-first launch model.", runway.json);
  assert(typeof runway.json.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(runway.json.receipt_hash), "Supervised live runway should include a receipt hash.", runway.json);
  assert(Array.isArray(runway.json.lanes) && runway.json.lanes.length === runway.json.total_lane_count, "Supervised live runway should include all lane rows.", runway.json);
  assert(
    ["wallet", "jupiter", "signer", "ops", "accounting", "manual-review"].every((id) => runway.json.lanes.some((lane) => lane.id === id)),
    "Supervised live runway should cover wallet, Jupiter, signer, ops, accounting, and manual review lanes.",
    runway.json.lanes,
  );
  assert(runway.json.ready_lane_count <= runway.json.total_lane_count, "Supervised live runway ready count should not exceed total lanes.", runway.json);
  assert(Array.isArray(runway.json.safe_commands) && runway.json.safe_commands.some((command) => command.includes("verify:web3")), "Supervised live runway should include safe verifier commands.", runway.json.safe_commands);
  assert(runway.json.signing_permission === "external-wallet-prompt-only", "Supervised live runway should limit signing to future external wallet prompts.", runway.json);
  assertBlockedAuthority("Supervised live runway", runway.json, { signingField: false });

  const runbook = await requestJson("/api/web3-operator-runbook?source=live-dex&account=persistent&scenario=breakout&cycles=0");
  assert(runbook.response.status === 200, "Operator runbook should return 200.", {
    status: runbook.response.status,
    json: runbook.json,
  });
  assert(runbook.json.mode === "web3-operator-runbook", "Operator runbook should expose the expected mode.", runbook.json);
  assert(["setup-needed", "paper-operable", "supervised-review-ready"].includes(runbook.json.status), "Operator runbook should use a known status.", runbook.json);
  assert(typeof runbook.json.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(runbook.json.receipt_hash), "Operator runbook should include a receipt hash.", runbook.json);
  assert(Array.isArray(runbook.json.run_now) && runbook.json.run_now.length >= 6, "Operator runbook should expose the run-now action map.", runbook.json.run_now);
  assert(runbook.json.run_now.some((action) => action.id === "autonomous-live-trading" && action.status === "blocked"), "Operator runbook should keep autonomous live trading blocked.", runbook.json.run_now);
  assert(runbook.json.allowed_now_count + runbook.json.gated_count + runbook.json.blocked_count === runbook.json.run_now.length, "Operator runbook action counts should reconcile.", runbook.json);
  assert(Array.isArray(runbook.json.real_capital_blockers), "Operator runbook should include real-capital blockers.", runbook.json.real_capital_blockers);
  assert(Array.isArray(runbook.json.verifier_commands) && runbook.json.verifier_commands.some((command) => command.includes("verify:web3")), "Operator runbook should include verifier commands.", runbook.json.verifier_commands);
  assert(runbook.json.primary_safe_action === null || ["allowed", "gated", "blocked"].includes(runbook.json.primary_safe_action.status), "Operator runbook should expose a valid primary safe action.", runbook.json.primary_safe_action);
  assert(runbook.json.current_input?.live_execution_permission === "blocked", "Operator runbook should expose a locked current input contract.", runbook.json.current_input);
  assert(Array.isArray(runbook.json.current_input.target_names), "Operator runbook current input should expose safe target names.", runbook.json.current_input);
  assertBlockedAuthority("Operator runbook", runbook.json);

  record(
    "operator-setup-packets",
    "pass",
    `${requestPacket.json.status}; ${cutover.json.open_blocker_count} blockers; runway ${runway.json.ready_lane_count}/${runway.json.total_lane_count}; ${runbook.json.allowed_now_count} safe actions`,
  );
}

function assertBlockedAuthority(label, json, options = {}) {
  assert(json.live_execution_permission === "blocked", `${label} must keep live execution blocked.`, json);
  assert(json.wallet_mutation_permission === "blocked", `${label} must keep wallet mutation blocked.`, json);
  assert(json.transaction_submission_permission === "blocked", `${label} must keep transaction submission blocked.`, json);
  if (options.signingField !== false && "signing_permission" in json) {
    assert(json.signing_permission === "blocked", `${label} must keep signing blocked.`, json);
  }
  assert(json.private_key_storage === "blocked", `${label} must block private-key storage.`, json);
  assert(json.seed_phrase_storage === "blocked", `${label} must block seed-phrase storage.`, json);
  assert(json.secret_echo_permission === "blocked", `${label} must block secret echo.`, json);
}

async function verifyManualLiveReviewPacket() {
  const { response, json } = await requestJson("/api/web3-manual-live-review-packet?source=sample&account=persistent&scenario=breakout&cycles=0");
  assert(response.status === 200, "Manual live-review packet should return 200.", { status: response.status, json });
  assert(json.mode === "web3-manual-live-review-packet", "Manual live-review packet should expose the expected mode.", json);
  assert(["blocked", "waiting-for-operator-input", "ready-for-external-review"].includes(json.status), "Manual live-review packet should use a known status.", json);
  assert(typeof json.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(json.receipt_hash), "Manual live-review packet should include a receipt hash.", json);
  assert(json.external_review_only === true, "Manual live-review packet should be external-review-only.", json);
  assert(Array.isArray(json.signoffs) && json.signoffs.length >= 12, "Manual live-review packet should include consolidated signoff rows.", json.signoffs);
  assert(json.required_signoff_count === json.signoffs.length, "Manual live-review packet signoff count should match rows.", json);
  assert(
    json.passed_signoff_count + json.watch_signoff_count + json.failed_signoff_count === json.signoffs.length,
    "Manual live-review packet signoff totals should reconcile.",
    json,
  );
  assert(
    ["operator-wallet", "jupiter-order", "manual-live-review", "supervised-runway", "live-ops"].every((id) => json.signoffs.some((item) => item.id === id)),
    "Manual live-review packet should cover wallet, route, manual-review, runway, and ops signoffs.",
    json.signoffs,
  );
  assert(json.signoffs.every((item) => typeof item.next_action === "string" && item.next_action.length > 0), "Manual live-review packet signoffs should name next actions.", json.signoffs);
  assert(Array.isArray(json.evidence_links) && json.evidence_links.includes("GET /api/web3-live-capital-preflight"), "Manual live-review packet should link live-capital preflight evidence.", json.evidence_links);
  assert(Array.isArray(json.evidence_links) && json.evidence_links.includes("GET /api/web3-supervised-live-runway"), "Manual live-review packet should link supervised runway evidence.", json.evidence_links);
  assert(
    json.live_execution_permission === "blocked" || json.live_execution_permission === "manual-live-executor-review",
    "Manual live-review packet should never grant direct live execution authority.",
    json,
  );
  assert(json.wallet_mutation_permission === "blocked", "Manual live-review packet must keep wallet mutation blocked.", json);
  assert(json.transaction_submission_permission === "blocked", "Manual live-review packet must keep transaction submission blocked.", json);
  assert(json.private_key_storage === "blocked", "Manual live-review packet must block private-key storage.", json);
  assert(json.seed_phrase_storage === "blocked", "Manual live-review packet must block seed-phrase storage.", json);
  assert(json.secret_echo_permission === "blocked", "Manual live-review packet must block secret echo.", json);
  assert(Array.isArray(json.controls) && json.controls.some((control) => control.includes("human review checklist")), "Manual live-review packet should describe itself as a human review checklist.", json.controls);
  record("manual-live-review-packet", "pass", `${json.status}; ${json.passed_signoff_count}/${json.required_signoff_count} signoffs passing`);
}

async function verifyResearchHandoffPacket() {
  const { response, json } = await requestJson("/api/web3-research-handoff-packet?source=sample&account=persistent&scenario=breakout&cycles=0");
  assert(response.status === 200, "Research handoff packet should return 200.", { status: response.status, json });
  assert(json.mode === "web3-research-handoff-packet", "Research handoff packet should expose the expected mode.", json);
  assert(["research-needed", "ready-for-operator-input", "ready-for-external-review"].includes(json.status), "Research handoff packet should use a known status.", json);
  assert(typeof json.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(json.receipt_hash), "Research handoff packet should include a receipt hash.", json);
  assert(json.app_state && typeof json.app_state === "object", "Research handoff packet should include app state.", json);
  assert(Array.isArray(json.current_capabilities) && json.current_capabilities.length >= 4, "Research handoff packet should summarize current capabilities.", json.current_capabilities);
  assert(Array.isArray(json.operator_unlock_sequence) && json.operator_unlock_sequence.map((item) => item.id).join(",") === "scope-wallet,prove-wallet,rehearse-jupiter,choose-signer,ops-accounting,external-review", "Research handoff packet should carry the ordered unlock sequence.", json.operator_unlock_sequence);
  assert(json.operator_unlock_sequence.some((item) => item.id === json.next_unlock_step?.id), "Research handoff packet should expose the next ordered unlock step.", json.next_unlock_step);
  assert(json.live_usability?.mode === "web3-operator-credential-live-usability-summary", "Research handoff packet should carry the live-usability summary.", json.live_usability);
  assert(typeof json.live_usability.real_capital_blocker_count === "number", "Research handoff live-usability summary should expose real-money blocker count.", json.live_usability);
  assert(json.live_usability.total_live_usability_row_count >= json.live_usability.listed_live_usability_row_count, "Research handoff live-usability listed rows should not exceed total rows.", json.live_usability);
  assert(json.live_usability.evidence_endpoint === "GET /api/web3-live-usability-blockers", "Research handoff live-usability summary should point to the full blocker endpoint.", json.live_usability);
  assert(Array.isArray(json.open_operator_inputs), "Research handoff packet should include open operator inputs.", json.open_operator_inputs);
  assert(Array.isArray(json.live_capital_blockers), "Research handoff packet should include live-capital blockers.", json.live_capital_blockers);
  assert(Array.isArray(json.credential_requirements) && json.credential_requirements.length >= 8, "Research handoff packet should include credential requirements.", json.credential_requirements);
  assert(
    ["dedicated-public-wallet", "wallet-ownership-proof", "read-provider-rail", "jupiter-order-rail", "signer-policy", "ops-emergency-stop", "accounting-ledger", "risk-policy", "manual-live-review"].every((id) =>
      json.credential_requirements.some((item) =>
        item.id === id &&
        item.live_execution_permission === "blocked" &&
        item.wallet_mutation_permission === "blocked" &&
        item.secret_echo_permission === "blocked"
      ),
    ),
    "Research handoff credential requirements should cover wallet, provider, Jupiter, signer, ops, accounting, risk, and review gates while keeping live locks blocked.",
    json.credential_requirements,
  );
  assert(json.credential_requirements.some((item) => item.id === "dedicated-public-wallet" && item.target_names?.includes("wallet_public_key")), "Research handoff credential requirements should point to the public wallet target.", json.credential_requirements);
  assert(json.credential_requirements.some((item) => item.id === "jupiter-order-rail" && item.target_names?.includes("JUPITER_API_KEY")), "Research handoff credential requirements should point to the Jupiter env target.", json.credential_requirements);
  assert(Array.isArray(json.research_questions) && json.research_questions.length >= 10, "Research handoff packet should include the research question set.", json.research_questions);
  assert(
    ["custody-architecture", "provider-stack", "moonshot-data-sources", "risk-gates", "credential-storage", "profit-proof"].every((id) =>
      json.research_questions.some((item) => item.id === id && typeof item.question === "string" && item.question.length > 0),
    ),
    "Research handoff packet should cover custody, provider, market-data, risk, credential, and profit-proof questions.",
    json.research_questions,
  );
  assert(Array.isArray(json.safe_to_share) && json.safe_to_share.includes("Dedicated Solana public wallet address"), "Research handoff packet should list safe-to-share operator inputs.", json.safe_to_share);
  assert(Array.isArray(json.never_provide) && json.never_provide.includes("Seed phrase or mnemonic"), "Research handoff packet should keep seed phrases in never-provide list.", json.never_provide);
  assert(Array.isArray(json.source_endpoints) && json.source_endpoints.includes("/api/web3-operator-runbook?source=live-dex&account=persistent"), "Research handoff packet should link source endpoints.", json.source_endpoints);
  assert(json.source_endpoints.includes("/api/web3-credential-requirements?source=live-dex&account=persistent"), "Research handoff packet should link the standalone credential requirements endpoint.", json.source_endpoints);
  assert(Array.isArray(json.safe_export_commands) && json.safe_export_commands.some((command) => command.includes("requirements:web3")), "Research handoff packet should link the credential-only export command.", json.safe_export_commands);
  assert(Array.isArray(json.verifier_commands) && json.verifier_commands.some((command) => command.includes("--require-operator-wallet")), "Research handoff packet should include strict verifier commands.", json.verifier_commands);
  assert(typeof json.text_packet === "string" && json.text_packet.includes("# Mastermind Web3 Research Handoff Packet"), "Research handoff packet should include pasteable text.", json.text_packet);
  assert(json.text_packet.includes("Next Ordered Unlock Step") && json.text_packet.includes("Operator Unlock Sequence"), "Research handoff text should include the ordered unlock sequence.", json.text_packet);
  assert(json.text_packet.includes("Live Usability Summary") && json.text_packet.includes("Rows listed:"), "Research handoff text should include the live-usability summary.", json.text_packet);
  assert(json.text_packet.includes("Credential Requirements") && json.text_packet.includes("Dedicated public wallet") && json.text_packet.includes("Done when:"), "Research handoff text should include the credential requirements packet.", json.text_packet);
  assert(json.text_packet.includes("Never Provide"), "Research handoff text should include never-provide boundary.", json.text_packet);
  assert(json.live_execution_permission === "blocked", "Research handoff packet must keep live execution blocked.", json);
  assert(json.wallet_mutation_permission === "blocked", "Research handoff packet must keep wallet mutation blocked.", json);
  assert(json.transaction_submission_permission === "blocked", "Research handoff packet must keep transaction submission blocked.", json);
  assert(json.private_key_storage === "blocked", "Research handoff packet must block private-key storage.", json);
  assert(json.seed_phrase_storage === "blocked", "Research handoff packet must block seed-phrase storage.", json);
  assert(json.secret_echo_permission === "blocked", "Research handoff packet must block secret echo.", json);
  assert(Array.isArray(json.controls) && json.controls.some((control) => control.includes("safe to share")), "Research handoff packet should describe safe sharing controls.", json.controls);
  record("research-handoff-packet", "pass", `${json.status}; ${json.research_questions.length} questions; ${json.live_capital_blockers.length} live blockers`);
}

async function verifyCredentialRequirementsPacket() {
  const { response, json } = await requestJson("/api/web3-credential-requirements?source=sample&account=persistent&scenario=breakout&cycles=0");
  assert(response.status === 200, "Credential requirements packet should return 200.", { status: response.status, json });
  assert(json.mode === "web3-credential-requirements", "Credential requirements packet should expose the expected mode.", json);
  assert(json.status === "operator-input-needed", "Credential requirements packet should show operator input is still needed.", json);
  assertReceiptHash("Credential requirements packet", json.receipt_hash);
  assertReceiptHash("Credential requirements source handoff", json.research_handoff_hash);
  assert(json.requirement_count >= 8, "Credential requirements packet should expose the full safe ask count.", json);
  assert(json.needed_now_count >= 1, "Credential requirements packet should expose needed-now asks.", json);
  assert(json.before_live_count >= 1, "Credential requirements packet should expose before-live asks.", json);
  assert(json.external_review_count === 1, "Credential requirements packet should expose the external review gate.", json);
  assert(json.blocker_count === json.requirement_count, "Credential requirements packet should keep every ask blocking live capital.", json);
  assert(json.next_requirement?.id === "dedicated-public-wallet", "Credential requirements packet should show the public wallet as the next ask.", json.next_requirement);
  assert(json.next_requirement?.target_names?.includes("wallet_public_key"), "Credential requirements packet should point to the public wallet target.", json.next_requirement);
  assert(
    ["dedicated-public-wallet", "wallet-ownership-proof", "read-provider-rail", "jupiter-order-rail", "signer-policy", "ops-emergency-stop", "accounting-ledger", "risk-policy", "manual-live-review"].every((id) =>
      json.requirements.some((item) =>
        item.id === id &&
        item.blocks_live_capital === true &&
        item.live_execution_permission === "blocked" &&
        item.wallet_mutation_permission === "blocked" &&
        item.secret_echo_permission === "blocked"
      ),
    ),
    "Credential requirements packet should cover all safe asks while keeping live locks blocked.",
    json.requirements,
  );
  assert(json.requirements.some((item) => item.id === "jupiter-order-rail" && item.target_names?.includes("JUPITER_API_KEY")), "Credential requirements packet should name the Jupiter target.", json.requirements);
  assert(json.requirements.some((item) => item.id === "signer-policy" && item.research_question_ids?.includes("custody-architecture") && item.research_question_ids?.includes("risk-gates")), "Credential requirements packet should link signer asks to custody and risk research.", json.requirements);
  assert(Array.isArray(json.safe_to_share) && json.safe_to_share.includes("Dedicated Solana public wallet address"), "Credential requirements packet should list safe-to-share values.", json.safe_to_share);
  assert(Array.isArray(json.never_provide) && json.never_provide.includes("Seed phrase or mnemonic"), "Credential requirements packet should keep seed phrase in never-provide list.", json.never_provide);
  assert(Array.isArray(json.safe_export_commands) && json.safe_export_commands.some((command) => command.includes("requirements:web3")), "Credential requirements packet should expose its safe export command.", json.safe_export_commands);
  assert(typeof json.text_packet === "string" && json.text_packet.includes("# Mastermind Web3 Credential Requirements Packet"), "Credential requirements packet should include paste-ready markdown.", json.text_packet);
  assert(json.text_packet.includes("## Next Requirement") && json.text_packet.includes("wallet_public_key"), "Credential requirements text should include the next public wallet ask.", json.text_packet);
  assert(json.text_packet.includes("## Requirements") && json.text_packet.includes("Jupiter order rail"), "Credential requirements text should include the full requirements list.", json.text_packet);
  assert(json.text_packet.includes("## Never Provide") && json.text_packet.includes("Seed phrase or mnemonic"), "Credential requirements text should include never-provide boundaries.", json.text_packet);
  assert(json.text_packet.includes("requirements:web3"), "Credential requirements text should include the local export command.", json.text_packet);
  assert(json.source_endpoint.includes("/api/web3-credential-requirements"), "Credential requirements packet should link itself.", json);
  assert(
    json.live_review_source_endpoint === "/api/web3-credential-requirements?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    "Credential requirements packet should expose the live-review source endpoint.",
    json,
  );
  assert(Array.isArray(json.controls) && json.controls.some((control) => control.includes("credential collection checklist")), "Credential requirements packet should describe itself as a collection checklist.", json.controls);
  assert(json.live_execution_permission === "blocked", "Credential requirements packet must keep live execution blocked.", json);
  assert(json.wallet_mutation_permission === "blocked", "Credential requirements packet must keep wallet mutation blocked.", json);
  assert(json.transaction_submission_permission === "blocked", "Credential requirements packet must keep transaction submission blocked.", json);
  assert(json.signing_permission === "blocked", "Credential requirements packet must keep signing blocked.", json);
  assert(json.private_key_storage === "blocked", "Credential requirements packet must block private-key storage.", json);
  assert(json.seed_phrase_storage === "blocked", "Credential requirements packet must block seed-phrase storage.", json);
  assert(json.secret_echo_permission === "blocked", "Credential requirements packet must block secret echo.", json);
  assertNoLeak("credential requirements packet", json);
  record("credential-requirements-packet", "pass", `${json.status}; ${json.requirement_count} safe asks`);
}

async function verifyResearchAnswerIntake() {
  const answer = [
    "Custody: compare Turnkey, Privy, manual external wallet, policy wallet, session key, caps, private key never-store, and seed phrase never-store.",
    "Provider stack: use Helius, Jupiter, Birdeye, DEX Screener, GeckoTerminal, Yellowstone gRPC, Pump.fun, Raydium, and Meteora by role.",
    "Moonshot data sources should cover trending launches, holder concentration, liquidity, promotion boosts, creator risk, whale flow, and rug flags.",
    "Latency budget should set milliseconds or seconds limits for stale discovery, quote age, refresh, confirmation, expiry, and priority fee.",
    "First live mode should be manual supervised approval with caps, rollback, and external review before policy wallet autonomy.",
    "Compliance boundaries need disclosure, risk, jurisdiction, tax, not financial advice, terms, and prohibited profit claims.",
    "Risk gates should include slippage, daily cap, drawdown, liquidity, holder concentration, token age, authority, MEV, kill switch, and trade size.",
    "Settlement accounting should use getTransaction, confirmation, token balance deltas, fees, tax lots, PnL export, idempotency, and reconciliation.",
    "Credential storage should classify server env, browser public fields, never store, redaction, verifier, one-shot API key, and target name handling.",
    "Go-live checklist needs operator, security, ops, accounting, strategy, pass fail evidence, owner, and rollback.",
    "Cockpit dashboard should show chart, dashboard, PnL, drawdown, position, first screen alerts, timeline, diagnostics, and mobile layout.",
    "Profit proof needs run count, hit rate, drawdown, profit factor, out-of-sample baseline, slippage, regime, promotion threshold.",
  ].join("\n");

  const { response, json } = await postJson("/api/web3-research-answer-intake?source=sample&account=persistent&scenario=breakout&cycles=0", {
    answers_text: answer,
  });
  assert(response.status === 200, "Research answer intake should return a receipt for redacted answers.", { status: response.status, json });
  assert(json.mode === "web3-research-answer-intake", "Research answer intake should expose the expected mode.", json);
  assert(json.status === "decision-ready", "Research answer intake should mark complete answers decision-ready.", json);
  assert(typeof json.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(json.receipt_hash), "Research answer intake should include a receipt hash.", json);
  assert(json.answered_count >= 12 && json.missing_count === 0, "Research answer intake should score every tracked lane as answered.", json);
  assert(Array.isArray(json.implementation_decisions) && json.implementation_decisions.length >= 12, "Research answer intake should return the implementation decision queue.", json.implementation_decisions);
  assert(json.ready_decision_count >= 12, "Research answer intake should mark complete implementation decisions ready-to-spec.", json);
  assert(json.blocked_decision_count === 0, "Research answer intake should not block complete redacted implementation decisions.", json);
  assert(
    ["custody-signer-path", "provider-stack", "risk-gate-thresholds", "settlement-accounting-proof", "operator-cockpit-dashboard", "profit-proof-threshold"].every((id) =>
      json.implementation_decisions.some((item) => item.id === id && item.live_authority === "blocked"),
    ),
    "Research answer intake should cover critical implementation decisions while keeping live authority blocked.",
    json.implementation_decisions,
  );
  assert(json.implementation_decisions.every((item) => item.live_authority === "blocked"), "Every research implementation decision should keep live authority blocked.", json.implementation_decisions);
  assert(json.safe_next_actions.some((action) => action.includes("signer policy envelope")), "Research answer intake should turn complete answers into implementation next actions.", json.safe_next_actions);
  assert(json.live_execution_permission === "blocked", "Research answer intake must keep live execution blocked.", json);
  assert(json.wallet_mutation_permission === "blocked", "Research answer intake must keep wallet mutation blocked.", json);
  assert(json.transaction_submission_permission === "blocked", "Research answer intake must keep transaction submission blocked.", json);
  assert(json.signing_permission === "blocked", "Research answer intake must keep signing blocked.", json);
  assert(json.private_key_storage === "blocked", "Research answer intake must block private-key storage.", json);
  assert(json.seed_phrase_storage === "blocked", "Research answer intake must block seed-phrase storage.", json);
  assert(json.secret_echo_permission === "blocked", "Research answer intake must block secret echo.", json);

  const rejected = await postJson("/api/web3-research-answer-intake?source=sample&account=persistent&scenario=breakout&cycles=0", {
    answers_text: `api key: ${CANARY_JUPITER_KEY}`,
  });
  assert(rejected.response.status === 422, "Research answer intake should reject secret-looking pasted answers.", {
    status: rejected.response.status,
    json: rejected.json,
  });
  assert(/secret-looking API key/i.test(rejected.json?.error ?? ""), "Research answer intake rejection should name the secret-looking API key.", rejected.json);
  record("research-answer-intake", "pass", `${json.ready_decision_count} implementation decisions; secret-looking answers rejected`);
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
  await verifyUsabilityStatusReceipt();
  await verifyLiveUsabilityBlockersReceipt();
  await verifyCredentialDoctorRefreshPreview();
  await verifyLiveReadinessPackets();
  await verifyOperatorSetupPackets();
  await verifyManualLiveReviewPacket();
  await verifyResearchHandoffPacket();
  await verifyCredentialRequirementsPacket();
  await verifyResearchAnswerIntake();
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

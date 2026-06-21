#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_SOURCE = "live-dex";
const DEFAULT_ACCOUNT = "persistent";
const DEFAULT_SCENARIO = "breakout";

const config = parseArgs(process.argv.slice(2));
const baseUrl = (config.baseUrl || process.env.WEB3_FIRST_CANARY_HANDOFF_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const source = config.source || process.env.WEB3_FIRST_CANARY_HANDOFF_SOURCE || DEFAULT_SOURCE;
const account = config.account || process.env.WEB3_FIRST_CANARY_HANDOFF_ACCOUNT || DEFAULT_ACCOUNT;
const scenario = config.scenario || process.env.WEB3_FIRST_CANARY_HANDOFF_SCENARIO || DEFAULT_SCENARIO;
const cycles = config.cycles ?? process.env.WEB3_FIRST_CANARY_HANDOFF_CYCLES ?? "0";
const secretValues = [
  process.env.HELIUS_API_KEY,
  process.env.JUPITER_API_KEY,
  process.env.WEB3_VERIFY_JUPITER_API_KEY,
  process.env.PRIVY_APP_SECRET,
  process.env.TURNKEY_API_PRIVATE_KEY,
].filter((value) => typeof value === "string" && value.length > 0);

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    if (arg.startsWith("--base-url=")) parsed.baseUrl = arg.slice("--base-url=".length);
    else if (arg.startsWith("--source=")) parsed.source = arg.slice("--source=".length);
    else if (arg.startsWith("--account=")) parsed.account = arg.slice("--account=".length);
    else if (arg.startsWith("--scenario=")) parsed.scenario = arg.slice("--scenario=".length);
    else if (arg.startsWith("--cycles=")) parsed.cycles = arg.slice("--cycles=".length);
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
  }
  return parsed;
}

function usage() {
  return [
    "Usage: npm run --silent handoff-canary:web3 -- [--base-url=http://localhost:4010] [--source=live-dex] [--account=persistent] [--scenario=breakout] [--cycles=0] [--json]",
    "",
    "Prints the redacted first-funded-canary handoff packet for an operator or helper.",
    "Default output is paste-ready markdown text. Use --json for the full redacted receipt.",
  ].join("\n");
}

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${redact(detail).slice(0, 4000)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function redact(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  for (const secret of secretValues) {
    text = text.split(secret).join("[redacted]");
  }
  return text;
}

function assertNoLeak(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of secretValues) {
    assert(!text.includes(secret), `${label} leaked a configured secret.`);
  }
  assert(!/api-key=[A-Za-z0-9_-]{16,}/i.test(text), `${label} leaked an API-key query value.`);
  assert(!/(private_key|seed_phrase|mnemonic|keypair)=\S+/i.test(text), `${label} leaked an unsafe credential query value.`);
}

async function requestPacket() {
  const params = new URLSearchParams({
    source,
    account,
    scenario,
    cycles: String(cycles),
  });
  const response = await fetch(`${baseUrl}/api/web3-first-canary-handoff?${params.toString()}`, {
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  assertNoLeak("first canary handoff response", text);
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    fail("First canary handoff route should return JSON.", text);
  }
  assert(response.status === 200, "First canary handoff route should return 200.", { status: response.status, json });
  return json;
}

function verifyPacket(packet) {
  assert(packet?.mode === "web3-first-canary-handoff", "First canary handoff should expose the expected mode.", packet);
  assert(typeof packet.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(packet.receipt_hash), "First canary handoff should include a receipt hash.", packet);
  assert(typeof packet.first_canary_drill_hash === "string" && /^[0-9a-f]{64}$/.test(packet.first_canary_drill_hash), "First canary handoff should link the source drill hash.", packet);
  assert(typeof packet.credential_requirements_hash === "string" && /^[0-9a-f]{64}$/.test(packet.credential_requirements_hash), "First canary handoff should link credential requirements hash.", packet);
  assert(packet.actual_live_trade_tested === false || packet.status === "canary-proven", "First canary handoff should not imply live proof without canary-proven status.", packet);
  assert(packet.real_funds_moved_by_this_app === false || packet.status === "canary-proven", "First canary handoff should not imply real funds moved without canary-proven status.", packet);
  assert(packet.next_operator_step === null || typeof packet.next_operator_step.action === "string", "First canary handoff should include the next operator step.", packet);
  assert(Array.isArray(packet.open_steps) && packet.open_steps.length > 0, "First canary handoff should include open canary steps before proof.", packet);
  assert(Array.isArray(packet.safe_to_provide_now) && packet.safe_to_provide_now.length > 0, "First canary handoff should include safe-to-provide values.", packet);
  assert(Array.isArray(packet.never_provide) && packet.never_provide.length > 0, "First canary handoff should include never-provide values.", packet);
  assert(Array.isArray(packet.proof_completion_criteria) && packet.proof_completion_criteria.length === 4, "First canary handoff should include proof criteria.", packet);
  assert(typeof packet.text_packet === "string" && packet.text_packet.includes("# Mastermind First Funded Canary Handoff"), "First canary handoff should include paste-ready markdown text.", packet);
  assert(packet.text_packet.includes("## Next Operator Step"), "First canary handoff text should include the next step.", packet.text_packet);
  assert(packet.text_packet.includes("Actual live trade tested: false") || packet.status === "canary-proven", "First canary handoff text should state whether live proof exists.", packet.text_packet);
  assert(packet.live_execution_permission === "blocked", "First canary handoff must keep live execution blocked.", packet);
  assert(packet.wallet_mutation_permission === "blocked", "First canary handoff must keep wallet mutation blocked.", packet);
  assert(packet.transaction_submission_permission === "blocked", "First canary handoff must keep transaction submission blocked.", packet);
  assert(packet.signing_permission === "blocked", "First canary handoff must keep signing blocked.", packet);
  assert(packet.private_key_storage === "blocked", "First canary handoff must block private-key storage.", packet);
  assert(packet.seed_phrase_storage === "blocked", "First canary handoff must block seed-phrase storage.", packet);
  assert(packet.signed_payload_storage === "blocked", "First canary handoff must block signed-payload storage.", packet);
  assert(packet.secret_echo_permission === "blocked", "First canary handoff must block secret echo.", packet);
  assertNoLeak("first canary handoff packet", packet);
}

async function main() {
  if (config.help) {
    console.log(usage());
    return;
  }
  const packet = await requestPacket();
  verifyPacket(packet);
  if (config.json) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }
  console.log(packet.text_packet);
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

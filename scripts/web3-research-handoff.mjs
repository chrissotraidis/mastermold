#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_SOURCE = "live-dex";
const DEFAULT_ACCOUNT = "persistent";
const DEFAULT_SCENARIO = "breakout";

const config = parseArgs(process.argv.slice(2));
const baseUrl = (config.baseUrl || process.env.WEB3_RESEARCH_HANDOFF_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
const source = config.source || process.env.WEB3_RESEARCH_HANDOFF_SOURCE || DEFAULT_SOURCE;
const account = config.account || process.env.WEB3_RESEARCH_HANDOFF_ACCOUNT || DEFAULT_ACCOUNT;
const scenario = config.scenario || process.env.WEB3_RESEARCH_HANDOFF_SCENARIO || DEFAULT_SCENARIO;
const cycles = config.cycles ?? process.env.WEB3_RESEARCH_HANDOFF_CYCLES ?? "0";
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
    "Usage: npm run --silent research:web3 -- [--base-url=http://localhost:4010] [--source=live-dex] [--account=persistent] [--scenario=breakout] [--cycles=0] [--json]",
    "",
    "Prints the redacted Web3 research handoff packet for another helper.",
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
}

async function requestPacket() {
  const params = new URLSearchParams({
    source,
    account,
    scenario,
    cycles: String(cycles),
  });
  const response = await fetch(`${baseUrl}/api/web3-research-handoff-packet?${params.toString()}`, {
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  assertNoLeak("research handoff response", text);
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    fail("Research handoff route should return JSON.", text);
  }
  assert(response.status === 200, "Research handoff route should return 200.", { status: response.status, json });
  return json;
}

function verifyPacket(packet) {
  assert(packet?.mode === "web3-research-handoff-packet", "Research handoff packet should expose the expected mode.", packet);
  assert(typeof packet.receipt_hash === "string" && /^[0-9a-f]{64}$/.test(packet.receipt_hash), "Research handoff packet should include a receipt hash.", packet);
  assert(Array.isArray(packet.research_questions) && packet.research_questions.length >= 10, "Research handoff packet should include research questions.", packet);
  assert(Array.isArray(packet.operator_unlock_sequence) && packet.operator_unlock_sequence.length === 6, "Research handoff packet should include the ordered unlock sequence.", packet);
  assert(packet.operator_unlock_sequence.some((item) => item.id === packet.next_unlock_step?.id), "Research handoff packet should expose the next ordered unlock step.", packet);
  assert(Array.isArray(packet.open_operator_inputs), "Research handoff packet should include operator input rows.", packet);
  assert(Array.isArray(packet.live_capital_blockers), "Research handoff packet should include live-capital blockers.", packet);
  assert(typeof packet.text_packet === "string" && packet.text_packet.includes("# Mastermind Web3 Research Handoff Packet"), "Research handoff packet should include paste-ready markdown text.", packet);
  assert(packet.text_packet.includes("## Next Ordered Unlock Step"), "Research handoff text should include the next ordered unlock step.", packet.text_packet);
  assert(packet.text_packet.includes("## Operator Unlock Sequence"), "Research handoff text should include the operator unlock sequence.", packet.text_packet);
  assert(packet.text_packet.includes("## Never Provide"), "Research handoff text should include the never-provide boundary.", packet.text_packet);
  assert(packet.live_execution_permission === "blocked", "Research handoff packet must keep live execution blocked.", packet);
  assert(packet.wallet_mutation_permission === "blocked", "Research handoff packet must keep wallet mutation blocked.", packet);
  assert(packet.transaction_submission_permission === "blocked", "Research handoff packet must keep transaction submission blocked.", packet);
  assert(packet.private_key_storage === "blocked", "Research handoff packet must block private-key storage.", packet);
  assert(packet.seed_phrase_storage === "blocked", "Research handoff packet must block seed-phrase storage.", packet);
  assert(packet.secret_echo_permission === "blocked", "Research handoff packet must block secret echo.", packet);
  assertNoLeak("research handoff packet", packet);
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

#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";
const DEFAULT_PROVIDER = "browser-wallet";
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

export function parseWalletOwnershipArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_WALLET_OWNERSHIP_BASE_URL ?? DEFAULT_BASE_URL),
    walletPublicKey: normalizeWallet(flags.get("wallet") ?? env.WEB3_WALLET_OWNERSHIP_PUBLIC_KEY ?? env.WEB3_VERIFY_WALLET_PUBLIC_KEY ?? ""),
    messageBase64: String(flags.get("message-base64") ?? env.WEB3_WALLET_OWNERSHIP_MESSAGE_BASE64 ?? ""),
    signatureBase64: String(flags.get("signature-base64") ?? env.WEB3_WALLET_OWNERSHIP_SIGNATURE_BASE64 ?? ""),
    provider: normalizeProvider(flags.get("provider") ?? env.WEB3_WALLET_OWNERSHIP_PROVIDER ?? DEFAULT_PROVIDER),
    json: booleanFlag(flags.get("json") ?? env.WEB3_WALLET_OWNERSHIP_JSON, false),
    help: flags.has("help") || flags.has("h"),
    unsafeFlags: unsafeFlagNames(flags),
  };
}

export async function runWeb3WalletOwnership(input = {}) {
  const config = {
    ...parseWalletOwnershipArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    walletPublicKey: normalizeWallet(input.walletPublicKey ?? ""),
    messageBase64: input.messageBase64 ?? "",
    signatureBase64: input.signatureBase64 ?? "",
    provider: normalizeProvider(input.provider ?? DEFAULT_PROVIDER),
    unsafeFlags: input.unsafeFlags ?? [],
    fetchImpl: input.fetchImpl ?? fetch,
  };

  assert(config.unsafeFlags.length === 0, `Unsafe wallet-ownership flags are not accepted: ${config.unsafeFlags.join(", ")}.`);
  assert(config.walletPublicKey.length > 0, "Provide --wallet=<public-solana-address> or WEB3_WALLET_OWNERSHIP_PUBLIC_KEY. Never provide a private key or seed phrase.");

  if (config.signatureBase64) {
    assert(config.messageBase64.length > 0, "Provide --message-base64=<base64 challenge text> with --signature-base64. The message is public challenge text, not a private key.");
    const message = decodeBase64Text(config.messageBase64);
    const proofResult = await requestProof(config, message);
    verifyProofReceipt(proofResult.receipt, {
      status: proofResult.status,
      text: proofResult.text,
      message,
      signatureBase64: config.signatureBase64,
    });
    const packet = buildProofPacket(proofResult.receipt);
    verifyOwnershipPacket(packet);
    return packet;
  }

  const challengeResult = await requestChallenge(config);
  verifyChallengeReceipt(challengeResult.receipt, {
    status: challengeResult.status,
    walletPublicKey: config.walletPublicKey,
  });
  const packet = buildChallengePacket(challengeResult.receipt);
  verifyOwnershipPacket(packet);
  return packet;
}

function usage() {
  return [
    "Usage: npm run --silent prove-wallet:web3 -- --wallet=<public-solana-address> [--json]",
    "       npm run --silent prove-wallet:web3 -- --wallet=<public-solana-address> --message-base64=<challenge-text-base64> --signature-base64=<signature> [--json]",
    "",
    "Fetches a text-only public wallet ownership challenge, or submits an external wallet signature for hash-only proof.",
    "Only pass a public wallet, public challenge text, and external message signature. Private keys, seed phrases, transaction bodies, signed transactions, and API keys are refused.",
  ].join("\n");
}

async function requestChallenge(config) {
  const params = new URLSearchParams({ wallet_public_key: config.walletPublicKey });
  const response = await config.fetchImpl(`${config.baseUrl}/api/web3-wallet-ownership?${params.toString()}`, {
    method: "GET",
    signal: AbortSignal.timeout(25_000),
  });
  return responseJson(response, "Wallet ownership challenge");
}

async function requestProof(config, message) {
  const response = await config.fetchImpl(`${config.baseUrl}/api/web3-wallet-ownership`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      wallet_public_key: config.walletPublicKey,
      message,
      signature_base64: config.signatureBase64,
      provider: config.provider,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  return responseJson(response, "Wallet ownership proof");
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

function buildChallengePacket(receipt) {
  const messageBase64 = Buffer.from(receipt.message, "utf8").toString("base64");
  return {
    mode: "web3-wallet-ownership-command",
    status: "challenge-ready",
    wallet_public_key_preview: receipt.wallet_public_key_preview,
    challenge_receipt_hash: receipt.receipt_hash,
    challenge_expires_at: receipt.challenge_expires_at,
    challenge_max_age_seconds: receipt.challenge_max_age_seconds,
    message: receipt.message,
    message_base64: messageBase64,
    message_storage: receipt.message_storage,
    next_action: "Sign this exact text-only challenge in the external wallet, then rerun with --message-base64 and --signature-base64.",
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    transaction_signing_permission: "blocked",
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    controls: [
      "This command returns public challenge text only.",
      "The wallet signs a message, not a transaction.",
      "Do not pass private keys, seed phrases, transaction bytes, signed transactions, or API keys.",
    ],
  };
}

function buildProofPacket(receipt) {
  return {
    mode: "web3-wallet-ownership-command",
    status: receipt.status === "verified" ? "proof-verified" : "proof-not-verified",
    wallet_public_key_preview: receipt.wallet_public_key_preview,
    ownership_receipt_hash: receipt.receipt_hash,
    challenge_hash: receipt.challenge_hash,
    signature_hash: receipt.signature_hash,
    signature_verified: receipt.signature_verified,
    challenge_fresh: receipt.challenge_fresh,
    challenge_age_seconds: receipt.challenge_age_seconds,
    challenge_expires_at: receipt.challenge_expires_at,
    message_storage: receipt.message_storage,
    next_action: receipt.next_action,
    live_execution_permission: receipt.live_execution_permission,
    transaction_submission_permission: receipt.transaction_submission_permission,
    transaction_signing_permission: receipt.transaction_signing_permission,
    wallet_mutation_permission: receipt.wallet_mutation_permission,
    private_key_storage: receipt.private_key_storage,
    seed_phrase_storage: "blocked",
    secret_echo_permission: receipt.secret_echo_permission,
    controls: [
      "Proof receipts store challenge and signature hashes only.",
      "Wallet ownership proof does not authorize transaction signing, submission, custody, live execution, or wallet mutation.",
    ],
  };
}

function verifyChallengeReceipt(receipt, { status, walletPublicKey }) {
  assert(status === 200, "Wallet ownership challenge should return 200 for a valid public wallet.", receipt);
  assert(receipt?.mode === "web3-wallet-ownership-challenge", "Wallet ownership challenge should expose the expected mode.", receipt);
  assert(receipt.status === "ready", "Wallet ownership challenge should be ready.", receipt);
  assert(typeof receipt.message === "string" && receipt.message.includes(walletPublicKey), "Wallet ownership challenge should include the public wallet in the text.", receipt);
  assert(receipt.message_return === "returned-for-signing", "Wallet ownership challenge should return text for signing.", receipt);
  assert(receipt.message_storage === "not-stored", "Wallet ownership challenge should not store the raw message.", receipt);
  assert(receipt.transaction_signing_permission === "blocked", "Wallet ownership challenge must block transaction signing.", receipt);
  assert(receipt.transaction_submission_permission === "blocked", "Wallet ownership challenge must block transaction submission.", receipt);
  assert(receipt.live_execution_permission === "blocked", "Wallet ownership challenge must block live execution.", receipt);
  assert(receipt.wallet_mutation_permission === "blocked", "Wallet ownership challenge must block wallet mutation.", receipt);
  assert(receipt.private_key_storage === "blocked", "Wallet ownership challenge must block private-key storage.", receipt);
  assert(receipt.seed_phrase_storage === "blocked", "Wallet ownership challenge must block seed-phrase storage.", receipt);
  assert(receipt.secret_echo_permission === "blocked", "Wallet ownership challenge must block secret echo.", receipt);
}

function verifyProofReceipt(receipt, { status, text, message, signatureBase64 }) {
  assert(status === 200, "Wallet ownership proof should return 200 for valid proof submissions.", receipt);
  assert(receipt?.mode === "web3-wallet-ownership-receipt", "Wallet ownership proof should expose the expected mode.", receipt);
  assert(["verified", "invalid", "blocked"].includes(receipt.status), "Wallet ownership proof should use a known status.", receipt);
  assert(!text.includes(message), "Wallet ownership proof response should not return the raw challenge message.");
  assert(!text.includes(signatureBase64), "Wallet ownership proof response should not return the raw signature.");
  assert(receipt.message_storage === "hash-only", "Wallet ownership proof should store hash evidence only.", receipt);
  assert(receipt.live_execution_permission === "blocked", "Wallet ownership proof must block live execution.", receipt);
  assert(receipt.wallet_mutation_permission === "blocked", "Wallet ownership proof must block wallet mutation.", receipt);
  assert(receipt.transaction_submission_permission === "blocked", "Wallet ownership proof must block transaction submission.", receipt);
  assert(receipt.transaction_signing_permission === "blocked", "Wallet ownership proof must block transaction signing.", receipt);
  assert(receipt.private_key_storage === "blocked", "Wallet ownership proof must block private-key storage.", receipt);
  assert(receipt.secret_echo_permission === "blocked", "Wallet ownership proof must block secret echo.", receipt);
  assertNoUnsafeLeak("wallet ownership proof response", text);
}

export function verifyOwnershipPacket(packet) {
  assert(packet.mode === "web3-wallet-ownership-command", "Wallet ownership command should expose the expected mode.", packet);
  assert(["challenge-ready", "proof-verified", "proof-not-verified"].includes(packet.status), "Wallet ownership command should use a known status.", packet);
  assert(packet.live_execution_permission === "blocked", "Wallet ownership command must keep live execution blocked.", packet);
  assert(packet.transaction_submission_permission === "blocked", "Wallet ownership command must keep transaction submission blocked.", packet);
  assert(packet.transaction_signing_permission === "blocked", "Wallet ownership command must keep transaction signing blocked.", packet);
  assert(packet.wallet_mutation_permission === "blocked", "Wallet ownership command must keep wallet mutation blocked.", packet);
  assert(packet.private_key_storage === "blocked", "Wallet ownership command must keep private-key storage blocked.", packet);
  assert(packet.seed_phrase_storage === "blocked", "Wallet ownership command must keep seed-phrase storage blocked.", packet);
  assert(packet.secret_echo_permission === "blocked", "Wallet ownership command must keep secret echo blocked.", packet);
}

function markdown(packet) {
  const lines = [
    "# Mastermind Wallet Ownership",
    "",
    `Status: ${packet.status}`,
    `Wallet: ${packet.wallet_public_key_preview ?? "none"}`,
    "",
    "## Next Action",
    packet.next_action,
  ];
  if (packet.status === "challenge-ready") {
    lines.push(
      "",
      "## Challenge",
      packet.message,
      "",
      "## Challenge Base64",
      packet.message_base64,
    );
  } else {
    lines.push(
      "",
      "## Proof",
      `Signature verified: ${packet.signature_verified ? "yes" : "no"}`,
      `Challenge fresh: ${packet.challenge_fresh ? "yes" : "no"}`,
      `Receipt: ${packet.ownership_receipt_hash}`,
    );
  }
  lines.push(
    "",
    "## Boundary",
    "- Live execution: blocked",
    "- Transaction signing: blocked",
    "- Transaction submission: blocked",
    "- Wallet mutation: blocked",
    "- Private keys and seed phrases: blocked",
  );
  return lines.join("\n");
}

function decodeBase64Text(value) {
  assert(/^[A-Za-z0-9+/]+={0,2}$/.test(value), "message-base64 must be base64 encoded challenge text.");
  return Buffer.from(value, "base64").toString("utf8");
}

function unsafeFlagNames(flags) {
  return [...flags.keys()].filter((key) => {
    if (["base-url", "wallet", "message-base64", "signature-base64", "provider", "json", "help", "h"].includes(key)) return false;
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return UNSAFE_FLAG_KEYS.some((needle) => normalized.includes(needle));
  });
}

function assertNoUnsafeLeak(label, value) {
  assert(!/(private[_-]?key|seed[_-]?phrase|mnemonic|keypair|wallet[_-]?secret|recovery[_-]?phrase)["=:]\s*[A-Za-z0-9+/=_-]{8,}/i.test(value), `${label} leaked unsafe credential-shaped data.`);
  assert(!/(signed[_-]?transaction|raw[_-]?transaction|unsigned[_-]?transaction)["=:]\s*[A-Za-z0-9+/=_-]{8,}/i.test(value), `${label} leaked transaction-shaped data.`);
  assert(!/(api[_-]?key|helius[_-]?api[_-]?key|jupiter[_-]?api[_-]?key)["=:]\s*[A-Za-z0-9_-]{16,}/i.test(value), `${label} leaked API-key-shaped data.`);
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeWallet(value) {
  return String(value || "").trim();
}

function normalizeProvider(value) {
  return String(value || DEFAULT_PROVIDER).replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 48) || DEFAULT_PROVIDER;
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
  const config = parseWalletOwnershipArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(usage());
    return;
  }
  const packet = await runWeb3WalletOwnership(config);
  if (config.json) console.log(JSON.stringify(packet, null, 2));
  else console.log(markdown(packet));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

import { createHash, webcrypto } from "node:crypto";
import { store } from "./store";

export type Web3WalletOwnershipReceipt = {
  mode: "web3-wallet-ownership-receipt";
  status: "verified" | "invalid" | "blocked";
  generated_at: string;
  receipt_hash: string;
  wallet_public_key_preview: string;
  provider: string;
  challenge_hash: string;
  signature_hash: string;
  signature_verified: boolean;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  transaction_signing_permission: "blocked";
  private_key_storage: "blocked";
  secret_echo_permission: "blocked";
  message_storage: "hash-only";
  summary: string;
  next_action: string;
  controls: string[];
};

export async function buildWeb3WalletOwnershipReceipt({
  walletPublicKey,
  message,
  signatureBase64,
  provider,
}: {
  walletPublicKey: string;
  message: string;
  signatureBase64: string;
  provider: string;
}): Promise<Web3WalletOwnershipReceipt> {
  const generatedAt = new Date().toISOString();
  const normalizedProvider = normalizeLabel(provider, "browser-wallet", 48);
  const validChallenge = validateOwnershipChallenge(message, walletPublicKey);
  const signatureVerified = validChallenge ? await verifyEd25519Signature({ walletPublicKey, message, signatureBase64 }) : false;
  const status: Web3WalletOwnershipReceipt["status"] = signatureVerified ? "verified" : validChallenge ? "invalid" : "blocked";
  const base = {
    mode: "web3-wallet-ownership-receipt" as const,
    status,
    generated_at: generatedAt,
    wallet_public_key_preview: previewValue(walletPublicKey),
    provider: normalizedProvider,
    challenge_hash: sha256Hex(message),
    signature_hash: sha256Hex(signatureBase64),
    signature_verified: signatureVerified,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    transaction_signing_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    message_storage: "hash-only" as const,
    summary: walletOwnershipSummary(status),
    next_action: walletOwnershipNextAction(status),
    controls: [
      "Verifies ownership of the public wallet address with a text-only Ed25519 message signature.",
      "Does not request, accept, store, or return private keys, seed phrases, transaction bodies, signed transactions, or wallet authority.",
      "A verified wallet ownership receipt can support manual live review, but it never authorizes transaction signing, submission, execution, custody, or wallet mutation.",
      "Challenge and signature are represented by hashes in the receipt.",
    ],
  };
  return {
    ...base,
    receipt_hash: sha256Hex(JSON.stringify(base)),
  };
}

export function persistWeb3WalletOwnershipReceipt(receipt: Web3WalletOwnershipReceipt): void {
  store().appendWeb3ExecutionAudit({
    id: `wallet-ownership-${receipt.receipt_hash.slice(0, 24)}`,
    created_at: receipt.generated_at,
    data: receipt,
  });
}

export function getLatestWeb3WalletOwnershipReceipt(walletPublicKey?: string | null): Web3WalletOwnershipReceipt | null {
  const expectedPreview = walletPublicKey ? previewValue(walletPublicKey) : null;
  const receipts = store().web3ExecutionAudits(100)
    .map((row) => row.data)
    .filter(isWeb3WalletOwnershipReceipt);
  return receipts.find((receipt) =>
    receipt.signature_verified &&
    (!expectedPreview || receipt.wallet_public_key_preview === expectedPreview)
  ) ?? null;
}

export function validateWalletOwnershipInput(input: unknown):
  | { ok: true; value: { walletPublicKey: string; message: string; signatureBase64: string; provider: string } }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "request body must be an object." };
  const body = input as Record<string, unknown>;
  const walletPublicKey = typeof body.wallet_public_key === "string" ? body.wallet_public_key.trim() : "";
  const message = typeof body.message === "string" ? body.message : "";
  const signatureBase64 = typeof body.signature_base64 === "string" ? body.signature_base64.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider : "browser-wallet";

  if (!isLikelySolanaPublicKey(walletPublicKey)) return { ok: false, error: "wallet_public_key must be a valid public Solana address." };
  if (!message || message.length > 1_200) return { ok: false, error: "message must be a non-empty ownership challenge under 1200 characters." };
  if (!validateOwnershipChallenge(message, walletPublicKey)) return { ok: false, error: "message must be a Mastermind wallet ownership challenge for the supplied public wallet." };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureBase64) || signatureBase64.length < 80 || signatureBase64.length > 120) {
    return { ok: false, error: "signature_base64 must be a base64 encoded Ed25519 signature." };
  }

  return {
    ok: true,
    value: {
      walletPublicKey,
      message,
      signatureBase64,
      provider: normalizeLabel(provider, "browser-wallet", 48),
    },
  };
}

function validateOwnershipChallenge(message: string, walletPublicKey: string) {
  return message.startsWith("Mastermind Web3 wallet ownership challenge") &&
    message.includes(`Wallet: ${walletPublicKey}`) &&
    message.includes("Purpose: prove public wallet control only") &&
    message.includes("No transaction signing or wallet mutation is authorized.");
}

async function verifyEd25519Signature({
  walletPublicKey,
  message,
  signatureBase64,
}: {
  walletPublicKey: string;
  message: string;
  signatureBase64: string;
}) {
  try {
    const publicKeyBytes = decodeBase58(walletPublicKey);
    const signatureBytes = Uint8Array.from(Buffer.from(signatureBase64, "base64"));
    if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) return false;
    const key = await webcrypto.subtle.importKey("raw", publicKeyBytes, { name: "Ed25519" }, false, ["verify"]);
    return await webcrypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

function decodeBase58(value: string) {
  const bytes = [0];
  for (const char of value) {
    const charValue = BASE58_ALPHABET.indexOf(char);
    if (charValue < 0) throw new Error("invalid base58");
    let carry = charValue;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char === "1") bytes.push(0);
    else break;
  }
  return Uint8Array.from(bytes.reverse());
}

function walletOwnershipSummary(status: Web3WalletOwnershipReceipt["status"]) {
  if (status === "verified") return "Wallet ownership proof verified from a text-only browser wallet signature.";
  if (status === "invalid") return "Wallet ownership proof did not verify for the supplied public wallet.";
  return "Wallet ownership proof was blocked because the challenge was not a valid Mastermind ownership challenge.";
}

function walletOwnershipNextAction(status: Web3WalletOwnershipReceipt["status"]) {
  if (status === "verified") return "Save public scope and rerun live-capital preflight; transaction signing remains blocked until manual executor review.";
  if (status === "invalid") return "Reconnect the external wallet and sign the generated ownership challenge again.";
  return "Use the Settings ownership challenge button so the app generates the exact safe message.";
}

function normalizeLabel(value: string, fallback: string, maxLength: number) {
  const normalized = String(value || fallback).trim().replace(/[^\w .:-]/g, "").slice(0, maxLength);
  return normalized || fallback;
}

function isLikelySolanaPublicKey(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function previewValue(value: string | null | undefined) {
  if (!value) return "missing";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isWeb3WalletOwnershipReceipt(value: unknown): value is Web3WalletOwnershipReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<Web3WalletOwnershipReceipt>;
  return receipt.mode === "web3-wallet-ownership-receipt" &&
    typeof receipt.generated_at === "string" &&
    typeof receipt.receipt_hash === "string" &&
    typeof receipt.wallet_public_key_preview === "string" &&
    receipt.live_execution_permission === "blocked" &&
    receipt.wallet_mutation_permission === "blocked" &&
    receipt.transaction_submission_permission === "blocked" &&
    receipt.transaction_signing_permission === "blocked" &&
    receipt.private_key_storage === "blocked" &&
    receipt.message_storage === "hash-only";
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

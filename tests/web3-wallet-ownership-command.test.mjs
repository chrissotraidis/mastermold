import { describe, expect, test } from "bun:test";
import {
  parseWalletOwnershipArgs,
  runWeb3WalletOwnership,
  verifyOwnershipPacket,
} from "../scripts/web3-wallet-ownership.mjs";

const walletPublicKey = "So11111111111111111111111111111111111111112";
const challengeMessage = [
  "Mastermind Web3 wallet ownership challenge",
  `Wallet: ${walletPublicKey}`,
  "Purpose: prove public wallet control only",
  "No transaction signing or wallet mutation is authorized.",
  "Issued: 2026-06-22T00:00:00.000Z",
].join("\n");
const messageBase64 = Buffer.from(challengeMessage).toString("base64");
const signatureBase64 = Buffer.from(new Uint8Array(64).fill(7)).toString("base64");

function challengeReceipt(overrides = {}) {
  return {
    mode: "web3-wallet-ownership-challenge",
    status: "ready",
    receipt_hash: "a".repeat(64),
    wallet_public_key_preview: "So11...1112",
    message: challengeMessage,
    message_return: "returned-for-signing",
    message_storage: "not-stored",
    challenge_expires_at: "2026-06-22T00:10:00.000Z",
    challenge_max_age_seconds: 600,
    transaction_signing_permission: "blocked",
    transaction_submission_permission: "blocked",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    ...overrides,
  };
}

function proofReceipt(overrides = {}) {
  return {
    mode: "web3-wallet-ownership-receipt",
    status: "verified",
    receipt_hash: "b".repeat(64),
    wallet_public_key_preview: "So11...1112",
    provider: "browser-wallet",
    challenge_hash: "c".repeat(64),
    challenge_issued_at: "2026-06-22T00:00:00.000Z",
    challenge_expires_at: "2026-06-22T00:10:00.000Z",
    challenge_age_seconds: 2,
    challenge_fresh: true,
    challenge_max_age_seconds: 600,
    signature_hash: "d".repeat(64),
    signature_verified: true,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    transaction_signing_permission: "blocked",
    private_key_storage: "blocked",
    secret_echo_permission: "blocked",
    message_storage: "hash-only",
    next_action: "Wallet ownership proof verified from a text-only browser wallet signature.",
    ...overrides,
  };
}

describe("web3 wallet ownership command", () => {
  test("GIVEN a public wallet WHEN command runs without signature THEN it fetches a text-only challenge", async () => {
    const requested = [];
    const packet = await runWeb3WalletOwnership({
      baseUrl: "http://localhost:4010",
      walletPublicKey,
      fetchImpl: async (url, init) => {
        requested.push({ url: String(url), init });
        expect(String(url)).toContain("/api/web3-wallet-ownership");
        expect(String(url)).toContain(`wallet_public_key=${encodeURIComponent(walletPublicKey)}`);
        return Response.json(challengeReceipt());
      },
    });

    expect(packet.status).toBe("challenge-ready");
    expect(packet.message).toBe(challengeMessage);
    expect(packet.message_base64).toBe(messageBase64);
    expect(packet.transaction_signing_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(requested).toHaveLength(1);
    expect(requested[0].init.method).toBe("GET");
    verifyOwnershipPacket(packet);
  });

  test("GIVEN signed challenge text WHEN command runs with signature THEN it submits proof and returns hashes only", async () => {
    const requested = [];
    const packet = await runWeb3WalletOwnership({
      baseUrl: "http://localhost:4010",
      walletPublicKey,
      messageBase64,
      signatureBase64,
      provider: "browser-wallet",
      fetchImpl: async (url, init) => {
        requested.push({ url: String(url), init });
        expect(String(url)).toBe("http://localhost:4010/api/web3-wallet-ownership");
        const body = JSON.parse(init.body);
        expect(body.wallet_public_key).toBe(walletPublicKey);
        expect(body.message).toBe(challengeMessage);
        expect(body.signature_base64).toBe(signatureBase64);
        expect(body.provider).toBe("browser-wallet");
        return Response.json(proofReceipt());
      },
    });

    const packetText = JSON.stringify(packet);
    expect(packet.status).toBe("proof-verified");
    expect(packet.signature_hash).toBe("d".repeat(64));
    expect(packet.message_storage).toBe("hash-only");
    expect(packetText).not.toContain(challengeMessage);
    expect(packetText).not.toContain(signatureBase64);
    expect(packet.transaction_submission_permission).toBe("blocked");
    expect(packet.transaction_signing_permission).toBe("blocked");
    expect(requested).toHaveLength(1);
    expect(requested[0].init.method).toBe("POST");
    verifyOwnershipPacket(packet);
  });

  test("GIVEN unsafe flags WHEN args are parsed THEN the command refuses them before fetch", async () => {
    const config = parseWalletOwnershipArgs(["--wallet=So11111111111111111111111111111111111111112", "--private-key=never"], {});

    expect(config.unsafeFlags).toContain("private-key");
    await expect(runWeb3WalletOwnership({
      ...config,
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    })).rejects.toThrow("Unsafe wallet-ownership flags");
  });

  test("GIVEN a signature without message text WHEN command runs THEN it rejects before fetch", async () => {
    await expect(runWeb3WalletOwnership({
      baseUrl: "http://localhost:4010",
      walletPublicKey,
      signatureBase64,
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    })).rejects.toThrow("Provide --message-base64");
  });
});

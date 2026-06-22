import { describe, expect, test } from "bun:test";
import {
  parseWalletIntakeValidateArgs,
  runWeb3WalletIntakeValidate,
  verifyValidationReceipt,
} from "../scripts/web3-wallet-intake-validate.mjs";

const safeWallet = "7YWHmMjUwvQJwHqZzsYvg59WKAVAHwiUL1b5LrsULv2C";

function validReceipt(overrides = {}) {
  return {
    mode: "web3-dedicated-wallet-intake-validation",
    status: "valid-public-wallet",
    receipt_hash: "a".repeat(64),
    wallet_public_key_preview: "7YWHmMjU...Lv2C",
    can_save_public_scope: true,
    next_proof_runway: [
      proofStep("validate-public-wallet"),
      proofStep("save-public-scope"),
      proofStep("request-ownership-challenge"),
      proofStep("prove-wallet-ownership"),
      proofStep("run-strict-wallet-verifier"),
      proofStep("prepare-jupiter-order"),
      proofStep("arm-live-canary-flags"),
      proofStep("run-unsigned-order-preflight"),
      proofStep("relay-signed-canary"),
      proofStep("watch-funded-proof"),
    ],
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    ...overrides,
  };
}

function proofStep(id) {
  return {
    id,
    label: id,
    status: id === "validate-public-wallet" ? "done" : "after-input",
    surface: "settings",
    command_or_href: null,
    next_action: `${id} next action`,
    completion_signal: `${id} done`,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    secret_echo_permission: "blocked",
  };
}

describe("web3 wallet intake validator command", () => {
  test("GIVEN a public wallet WHEN the validator runs THEN it posts only public scope and accepts the redacted runway", async () => {
    let requestedUrl = "";
    let requestedBody = {};
    const receipt = await runWeb3WalletIntakeValidate({
      baseUrl: "http://localhost:4010",
      source: "live-dex",
      account: "persistent",
      scenario: "breakout",
      walletPublicKey: safeWallet,
      maxTradeUsd: 25,
      dailySpendCapUsd: 100,
      maxSlippageBps: 150,
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        requestedBody = JSON.parse(String(init.body));
        return Response.json(validReceipt());
      },
    });

    expect(receipt.status).toBe("valid-public-wallet");
    expect(requestedUrl).toContain("/api/web3-dedicated-wallet-intake-contract?");
    expect(requestedUrl).toContain("source=live-dex");
    expect(requestedBody).toEqual({
      execution: {
        wallet_public_key: safeWallet,
        max_trade_usd: 25,
        daily_spend_cap_usd: 100,
        max_slippage_bps: 150,
      },
    });
  });

  test("GIVEN unsafe flags WHEN args are parsed THEN the validator refuses them before posting", async () => {
    const config = parseWalletIntakeValidateArgs(["--wallet=abc", "--private-key=never"], {});

    expect(config.unsafeFlags).toContain("private-key");
    await expect(runWeb3WalletIntakeValidate({
      ...config,
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    })).rejects.toThrow("Unsafe wallet-intake flags");
  });

  test("GIVEN a response echoes the full wallet WHEN verified THEN the command fails closed", () => {
    const receipt = validReceipt({ wallet_public_key_preview: safeWallet });

    expect(() => verifyValidationReceipt(receipt, {
      status: 200,
      text: JSON.stringify(receipt),
      walletPublicKey: safeWallet,
    })).toThrow("must not echo the full wallet");
  });

  test("GIVEN the route rejects the wallet WHEN allow-invalid is off THEN the command exits nonzero", async () => {
    await expect(runWeb3WalletIntakeValidate({
      baseUrl: "http://localhost:4010",
      walletPublicKey: safeWallet,
      fetchImpl: async () => Response.json(validReceipt({
        status: "sample-wallet-rejected",
        can_save_public_scope: false,
      }), { status: 200 }),
    })).rejects.toThrow("did not accept this public wallet");
  });
});

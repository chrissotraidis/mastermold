import { describe, expect, test } from "bun:test";
import {
  parseWalletScopeArgs,
  runWeb3WalletScope,
  verifyScopePacket,
} from "../scripts/web3-wallet-scope.mjs";

const walletPublicKey = "So11111111111111111111111111111111111111112";

function validationReceipt(overrides = {}) {
  return {
    mode: "web3-dedicated-wallet-intake-validation",
    status: "valid-public-wallet",
    generated_at: "2026-06-22T00:00:00.000Z",
    receipt_hash: "a".repeat(64),
    source: "live-dex",
    account: "persistent",
    scenario: "breakout",
    wallet_public_key_preview: "So11...1112",
    wallet_public_key_valid: true,
    sample_wallet_rejected: false,
    can_save_public_scope: true,
    accepted_field_paths: ["execution.wallet_public_key"],
    rejected_field_paths: [],
    unsafe_field_paths: [],
    risk_caps: {
      max_trade_usd: 25,
      daily_spend_cap_usd: 100,
      max_slippage_bps: 150,
      valid: true,
      blockers: [],
    },
    next_proof_runway: [],
    existing_save_endpoint: "/api/web3-trading",
    existing_save_method: "POST",
    save_body_template: {
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "<public-solana-address>",
        signer_simulation_enabled: true,
        signer_session_label: "settings-external-wallet",
        signer_network: "devnet",
        max_trade_usd: 25,
        daily_spend_cap_usd: 100,
        max_slippage_bps: 150,
      },
    },
    verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet",
    next_action: "Save this public wallet scope before proving ownership.",
    summary: "Valid public wallet.",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    controls: [],
    ...overrides,
  };
}

function saveReceipt() {
  return {
    execution_readiness: {
      config: {
        mode: "dry-run",
        wallet_public_key: walletPublicKey,
      },
    },
    execution_gate: {
      live_execution_enabled: false,
      wallet_mutation_enabled: false,
    },
    autonomous_live_autonomy_readiness: {
      can_trade_real_capital: false,
    },
  };
}

function canaryStatusReceipt(overrides = {}) {
  return {
    mode: "web3-canary-status",
    status: "blocked",
    actual_live_trade_tested: false,
    real_funds_moved_by_this_app: false,
    can_autonomously_trade_real_money_now: false,
    next_gate_id: "wallet-ownership",
    next_required_input_id: "wallet-ownership-proof",
    next_action: "Prove wallet ownership with the browser wallet text-signature flow.",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
    ...overrides,
  };
}

describe("web3 wallet scope command", () => {
  test("GIVEN a public wallet WHEN command runs without --save THEN it validates only and does not mutate state", async () => {
    const requested = [];
    const packet = await runWeb3WalletScope({
      baseUrl: "http://localhost:4010",
      walletPublicKey,
      fetchImpl: async (url, init) => {
        requested.push({ url: String(url), init });
        if (String(url).includes("/api/web3-dedicated-wallet-intake-contract")) {
          return Response.json(validationReceipt());
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    expect(packet.status).toBe("validated-not-saved");
    expect(packet.save_attempted).toBe(false);
    expect(packet.saved_public_scope).toBe(false);
    expect(JSON.stringify(packet)).not.toContain(walletPublicKey);
    expect(requested).toHaveLength(1);
    expect(requested[0].init.method).toBe("POST");
    expect(requested[0].url).toContain("/api/web3-dedicated-wallet-intake-contract");
    verifyScopePacket(packet, walletPublicKey);
  });

  test("GIVEN --save WHEN validation succeeds THEN it saves public scope and reads canary status", async () => {
    const requested = [];
    const packet = await runWeb3WalletScope({
      baseUrl: "http://localhost:4010",
      walletPublicKey,
      save: true,
      fetchImpl: async (url, init) => {
        requested.push({ url: String(url), init });
        if (String(url).includes("/api/web3-dedicated-wallet-intake-contract")) {
          return Response.json(validationReceipt());
        }
        if (String(url).endsWith("/api/web3-trading")) {
          const body = JSON.parse(init.body);
          expect(body.execution.wallet_public_key).toBe(walletPublicKey);
          expect(body.execution.mode).toBe("dry-run");
          return Response.json(saveReceipt());
        }
        if (String(url).includes("/api/web3-canary-status")) {
          return Response.json(canaryStatusReceipt());
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    expect(packet.status).toBe("saved-public-scope");
    expect(packet.save_attempted).toBe(true);
    expect(packet.saved_public_scope).toBe(true);
    expect(packet.canary_status.next_required_input_id).toBe("wallet-ownership-proof");
    expect(packet.canary_status.actual_live_trade_tested).toBe(false);
    expect(packet.canary_status.can_autonomously_trade_real_money_now).toBe(false);
    expect(JSON.stringify(packet)).not.toContain(walletPublicKey);
    expect(requested.map((entry) => entry.init.method)).toEqual(["POST", "POST", "GET"]);
  });

  test("GIVEN unsafe flags WHEN args are parsed THEN the command refuses them before fetch", async () => {
    const config = parseWalletScopeArgs(["--wallet=So11111111111111111111111111111111111111112", "--private-key=never"], {});

    expect(config.unsafeFlags).toContain("private-key");
    await expect(runWeb3WalletScope({
      ...config,
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    })).rejects.toThrow("Unsafe wallet-scope flags");
  });

  test("GIVEN validation rejects the wallet WHEN command runs THEN it does not save", async () => {
    await expect(runWeb3WalletScope({
      baseUrl: "http://localhost:4010",
      walletPublicKey,
      save: true,
      fetchImpl: async (url) => {
        if (String(url).includes("/api/web3-dedicated-wallet-intake-contract")) {
          return Response.json(validationReceipt({
            status: "sample-wallet-rejected",
            can_save_public_scope: false,
          }));
        }
        throw new Error("save should not be called");
      },
    })).rejects.toThrow("accept only a valid public wallet");
  });
});

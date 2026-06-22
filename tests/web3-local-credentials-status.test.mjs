import { describe, expect, test } from "bun:test";
import {
  parseLocalCredentialsStatusArgs,
  runWeb3LocalCredentialsStatus,
  verifyLocalCredentialStatusReceipt,
} from "../scripts/web3-local-credentials-status.mjs";

function validReceipt(overrides = {}) {
  return {
    mode: "web3-local-credential-install",
    status: "unchanged",
    installed_keys: [],
    configured_keys: ["HELIUS_API_KEY", "SOLANA_RPC_URL"],
    missing_keys: ["JUPITER_API_KEY", "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION"],
    runtime_applied_keys: [],
    runtime_restart_required_keys: [],
    rejected_fields: [],
    local_install_allowed: true,
    storage: "ignored-local-env",
    generated_at: "2026-06-22T00:00:00.000Z",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
    next_action: "Add JUPITER_API_KEY, then run Jupiter rehearsal and strict order verification.",
    summary: "2/4 local Web3 credential and ops targets are configured.",
    ...overrides,
  };
}

describe("web3 local credential status command", () => {
  test("GIVEN localhost credential health WHEN command runs THEN it performs GET only and summarizes redacted status", async () => {
    let requestedUrl = "";
    let requestedInit = {};
    const receipt = await runWeb3LocalCredentialsStatus({
      baseUrl: "http://localhost:4010",
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        requestedInit = init;
        return Response.json(validReceipt());
      },
    });

    expect(requestedUrl).toBe("http://localhost:4010/api/web3-local-credentials");
    expect(requestedInit.method).toBe("GET");
    expect(requestedInit.body).toBeUndefined();
    expect(receipt.configured_keys).toContain("HELIUS_API_KEY");
    expect(receipt.missing_keys).toContain("JUPITER_API_KEY");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
  });

  test("GIVEN unsafe flags WHEN args are parsed THEN the command refuses them before fetch", async () => {
    const config = parseLocalCredentialsStatusArgs(["--jupiter-api-key=never", "--private-key=never"], {});

    expect(config.unsafeFlags).toContain("jupiter-api-key");
    expect(config.unsafeFlags).toContain("private-key");
    await expect(runWeb3LocalCredentialsStatus({
      ...config,
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    })).rejects.toThrow("Unsafe local-credential status flags");
  });

  test("GIVEN response leaks an env assignment WHEN verified THEN the command fails closed", () => {
    const receipt = validReceipt({
      summary: "JUPITER_API_KEY=secretvalue1234567890",
    });

    expect(() => verifyLocalCredentialStatusReceipt(receipt, {
      status: 200,
      text: JSON.stringify(receipt),
    })).toThrow("leaked");
  });

  test("GIVEN blocked remote receipt WHEN fail-on-blocked is enabled THEN the command rejects", async () => {
    await expect(runWeb3LocalCredentialsStatus({
      baseUrl: "https://example.com",
      failOnBlocked: true,
      fetchImpl: async () => Response.json(validReceipt({
        status: "blocked",
        local_install_allowed: false,
        summary: "Local credential install is blocked.",
      }), { status: 403 }),
    })).rejects.toThrow("blocked for this base URL");
  });
});

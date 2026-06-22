import { describe, expect, test } from "bun:test";
import { GET as CANARY_STATUS_GET } from "@/app/api/web3-canary-status/route";

describe("web3 canary status API", () => {
  test("GIVEN the local app asks for canary status WHEN the route runs THEN it reconciles live proof and keeps money movement blocked", async () => {
    const response = await CANARY_STATUS_GET(new Request("http://localhost/api/web3-canary-status?source=live-dex&account=persistent&scenario=breakout&cycles=0", {
      headers: {
        host: "localhost",
      },
    }));
    const receipt = await response.json();

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-canary-status");
    expect(receipt.status).toBe("blocked");
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.can_autonomously_trade_real_money_now).toBe(false);
    expect(receipt.alignment.status).toBe("pass");
    expect(receipt.local_credentials.configured_count + receipt.local_credentials.missing_count).toBeGreaterThan(0);
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.canary_endpoint).toContain("/api/web3-live-trade-canary");
    expect(receipt.ignition_endpoint).toContain("/api/web3-live-ignition");
    expect(receipt.local_credentials_endpoint).toBe("/api/web3-local-credentials");
    expect(receipt.safe_next_commands.length).toBeGreaterThan(0);
    expect(receipt.safe_next_commands.some((command: { command: string }) => command.command.includes("status-canary:web3"))).toBe(true);
    expect(receipt.safe_next_commands.every((command: { live_execution_permission: string; wallet_mutation_permission: string; secret_echo_permission: string }) =>
      command.live_execution_permission === "blocked" &&
      command.wallet_mutation_permission === "blocked" &&
      command.secret_echo_permission === "blocked"
    )).toBe(true);
  });
});

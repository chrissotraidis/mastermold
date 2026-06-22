import { describe, expect, test } from "bun:test";
import {
  buildCanaryStatusPacket,
  parseCanaryStatusArgs,
  runWeb3CanaryStatus,
} from "../scripts/web3-canary-status.mjs";

function requiredInput(overrides = {}) {
  return {
    id: "dedicated-public-wallet",
    label: "Dedicated public wallet",
    status: "needed-now",
    owner: "operator",
    safe_value_type: "Dedicated public Solana wallet address only.",
    safe_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
    target_names: ["wallet_public_key"],
    verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet",
    completion_signal: "A non-sample public Solana wallet is saved from the Trading live canary console.",
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
    ...overrides,
  };
}

function canaryReceipt(overrides = {}) {
  const nextRequiredInput = overrides.next_required_input ?? requiredInput();
  return {
    mode: "web3-live-trade-canary",
    status: "blocked",
    source: "live-dex",
    account: "persistent",
    scenario: "breakout",
    actual_live_trade_tested: false,
    real_funds_moved_by_this_app: false,
    can_submit_from_app_now: false,
    signed_relay_status: "locked",
    current_request_id: null,
    latest_signature_preview: null,
    blockers: ["Replace the sample wallet."],
    next_required_input: nextRequiredInput,
    required_inputs: overrides.required_inputs ?? [
      nextRequiredInput,
      requiredInput({
        id: "wallet-ownership-proof",
        label: "Wallet ownership proof",
        status: "blocked",
        owner: "external-wallet",
        target_names: ["wallet_public_key", "web3-wallet-ownership challenge hash"],
        verifier_command: null,
        completion_signal: "wallet_ownership_current_for_canary=true on /api/web3-live-trade-canary.",
      }),
      requiredInput({
        id: "jupiter-order-rail",
        label: "Jupiter order rail",
        status: "blocked",
        target_names: ["JUPITER_API_KEY"],
        verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
        completion_signal: "Jupiter rehearsal and live unsigned-order preflight no longer report missing JUPITER_API_KEY.",
      }),
      requiredInput({
        id: "first-canary-live-flags",
        label: "First canary live flags",
        status: "blocked",
        target_names: ["MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION", "MASTERMOLD_LIVE_OPERATOR_APPROVAL", "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF"],
        verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-live-canary-flags",
        completion_signal: "live_execution_gate_enabled=true and unsigned-order handoff no longer reports missing live canary flags.",
      }),
    ],
    next_action: "Replace the sample all-ones wallet with a dedicated public Solana address before canary review.",
    transaction_submission_permission: "blocked",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    ...overrides,
  };
}

function ignitionReceipt(overrides = {}) {
  return {
    mode: "web3-live-ignition",
    status: "blocked",
    source: "live-dex",
    account: "persistent",
    scenario: "breakout",
    can_autonomously_trade_real_money_now: false,
    can_start_supervised_canary_now: false,
    actual_live_trade_tested: false,
    real_funds_moved_by_this_app: false,
    next_gate_id: "wallet-scope",
    next_gate_label: "Wallet scope",
    next_action: "Save a dedicated public Solana trading wallet address in the Trading live canary console; do not paste private keys or seed phrases.",
    blocker_count: 3,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    ...overrides,
  };
}

function localReceipt(overrides = {}) {
  return {
    mode: "web3-local-credential-install",
    status: "unchanged",
    configured_keys: ["HELIUS_API_KEY", "SOLANA_RPC_URL"],
    missing_keys: ["JUPITER_API_KEY", "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION"],
    runtime_effective_next_action: "Install Jupiter and first-canary live flags in ignored local env.",
    next_action: "Install Jupiter and first-canary live flags in ignored local env.",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
    ...overrides,
  };
}

const scopedWalletPublicKey = "So11111111111111111111111111111111111111112";

describe("web3 canary status command", () => {
  test("GIVEN running-app receipts WHEN command runs THEN it performs GET only and returns the real funded-trade status", async () => {
    const requested = [];
    const packet = await runWeb3CanaryStatus({
      baseUrl: "http://localhost:4010",
      fetchImpl: async (url, init) => {
        requested.push({ url: String(url), init });
        if (String(url).includes("/api/web3-live-trade-canary")) return Response.json(canaryReceipt());
        if (String(url).includes("/api/web3-live-ignition")) return Response.json(ignitionReceipt());
        if (String(url).includes("/api/web3-local-credentials")) return Response.json(localReceipt());
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    expect(requested.map((entry) => entry.init.method)).toEqual(["GET", "GET", "GET"]);
    expect(requested.every((entry) => entry.init.body === undefined)).toBe(true);
    expect(requested.map((entry) => entry.url).sort()).toEqual([
      "http://localhost:4010/api/web3-live-ignition?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      "http://localhost:4010/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      "http://localhost:4010/api/web3-local-credentials",
    ].sort());
    expect(packet.status).toBe("blocked");
    expect(packet.actual_live_trade_tested).toBe(false);
    expect(packet.can_autonomously_trade_real_money_now).toBe(false);
    expect(packet.next_gate_id).toBe("wallet-scope");
    expect(packet.next_required_input_id).toBe("dedicated-public-wallet");
    expect(packet.alignment.status).toBe("pass");
    expect(packet.gate_progression.map((step) => step.id)).toEqual([
      "dedicated-public-wallet",
      "wallet-ownership-proof",
      "jupiter-order-rail",
      "first-canary-live-flags",
    ]);
    expect(packet.gate_progression.find((step) => step.id === "dedicated-public-wallet")?.is_current).toBe(true);
    expect(packet.gate_progression.every((step) => step.live_execution_permission === "blocked")).toBe(true);
    expect(packet.safe_next_commands.map((command) => command.id)).toEqual([
      "validate-public-wallet",
      "save-public-wallet-scope",
      "fetch-wallet-ownership-challenge",
      "dedicated-public-wallet-strict-verifier",
      "rerun-canary-status",
    ]);
    expect(packet.safe_next_commands.every((command) => command.live_execution_permission === "blocked")).toBe(true);
    expect(packet.safe_next_commands.every((command) => command.transaction_submission_permission === "blocked")).toBe(true);
    expect(packet.safe_next_commands.find((command) => command.id === "save-public-wallet-scope")?.command).toContain("scope-wallet:web3");
    expect(packet.safe_next_commands.find((command) => command.id === "fetch-wallet-ownership-challenge")?.command).toContain("prove-wallet:web3");
  });

  test("GIVEN unsafe flags WHEN args are parsed THEN the command refuses them before fetch", async () => {
    const config = parseCanaryStatusArgs(["--jupiter-api-key=never", "--signed-transaction=never"], {});

    expect(config.unsafeFlags).toContain("jupiter-api-key");
    expect(config.unsafeFlags).toContain("signed-transaction");
    await expect(runWeb3CanaryStatus({
      ...config,
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    })).rejects.toThrow("Unsafe canary status flags");
  });

  test("GIVEN public wallet scope is saved WHEN ownership proof is next THEN safe commands use the scoped public wallet", async () => {
    const packet = buildCanaryStatusPacket({
      canary: canaryReceipt({
        blockers: ["Prove wallet ownership."],
        next_required_input: {
          id: "wallet-ownership-proof",
          label: "Wallet ownership proof",
          status: "needed-now",
          owner: "external-wallet",
          safe_value_type: "Hash-only browser-wallet text signature for the scoped public Solana wallet.",
          safe_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
          target_names: ["wallet_public_key", "web3-wallet-ownership challenge hash"],
          verifier_command: `npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${scopedWalletPublicKey} --require-operator-wallet`,
          completion_signal: "wallet_ownership_current_for_canary=true on /api/web3-live-trade-canary.",
          live_execution_permission: "blocked",
          transaction_submission_permission: "blocked",
          wallet_mutation_permission: "blocked",
          secret_echo_permission: "blocked",
        },
      }),
      ignition: ignitionReceipt({
        next_gate_id: "wallet-ownership",
        next_gate_label: "Wallet ownership",
        next_action: "Prove wallet ownership before the canary.",
      }),
      local: localReceipt(),
      http: { canary: 200, ignition: 200, local: 200 },
    });

    const challengeCommand = packet.safe_next_commands.find((command) => command.id === "fetch-wallet-ownership-challenge");
    const proofCommand = packet.safe_next_commands.find((command) => command.id === "submit-wallet-ownership-proof");
    expect(challengeCommand?.command).toContain(`--wallet=${scopedWalletPublicKey}`);
    expect(challengeCommand?.uses_placeholder).toBe(false);
    expect(proofCommand?.command).toContain(`--wallet=${scopedWalletPublicKey}`);
    expect(proofCommand?.command).toContain("--message-base64=<challenge-text-base64>");
    expect(proofCommand?.uses_placeholder).toBe(true);
    expect(packet.safe_next_commands.every((command) => command.live_execution_permission === "blocked")).toBe(true);
    expect(JSON.stringify(packet)).not.toContain("private-key");
  });

  test("GIVEN Jupiter order rail is next WHEN packet is built THEN safe commands print requirements before strict verification", () => {
    const packet = buildCanaryStatusPacket({
      canary: canaryReceipt({
        blockers: ["Install JUPITER_API_KEY in ignored server env."],
        next_required_input: {
          id: "jupiter-order-rail",
          label: "Jupiter order rail",
          status: "needed-now",
          owner: "operator",
          safe_value_type: "Jupiter API key installed only in ignored local server env.",
          safe_surface: "/settings/integrations#web3-credential-action-console",
          target_names: ["JUPITER_API_KEY"],
          verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
          completion_signal: "Jupiter rehearsal and live unsigned-order preflight no longer report missing JUPITER_API_KEY.",
          live_execution_permission: "blocked",
          transaction_submission_permission: "blocked",
          wallet_mutation_permission: "blocked",
          secret_echo_permission: "blocked",
        },
      }),
      ignition: ignitionReceipt({
        next_gate_id: "route-order",
        next_gate_label: "Route/order",
        next_action: "Install Jupiter order rail evidence.",
      }),
      local: localReceipt(),
      http: { canary: 200, ignition: 200, local: 200 },
    });

    expect(packet.safe_next_commands.map((command) => command.id)).toEqual([
      "print-jupiter-requirements",
      "jupiter-order-rail-strict-verifier",
      "rerun-canary-status",
    ]);
    expect(packet.safe_next_commands[0].command).toContain("requirements:web3");
    expect(packet.safe_next_commands[0].purpose).toContain("JUPITER_API_KEY");
    expect(packet.safe_next_commands[1].command).toContain("--require-jupiter-order");
    expect(packet.safe_next_commands.every((command) => command.live_execution_permission === "blocked")).toBe(true);
  });

  test("GIVEN first canary live flags are next WHEN packet is built THEN safe commands print exact flag requirements", () => {
    const packet = buildCanaryStatusPacket({
      canary: canaryReceipt({
        blockers: ["Set first canary live flags in ignored local env."],
        next_required_input: {
          id: "first-canary-live-flags",
          label: "First canary live flags",
          status: "needed-now",
          owner: "operator",
          safe_value_type: "Exact reviewed local env flag values for the one-shot tiny canary handoff.",
          safe_surface: "/settings/integrations#settings-web3-first-canary-live-flags",
          target_names: [
            "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
            "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
            "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
          ],
          verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --require-live-canary-flags",
          completion_signal: "live_execution_gate_enabled=true and unsigned-order handoff no longer reports missing live canary flags.",
          live_execution_permission: "blocked",
          transaction_submission_permission: "blocked",
          wallet_mutation_permission: "blocked",
          secret_echo_permission: "blocked",
        },
      }),
      ignition: ignitionReceipt({
        next_gate_id: "route-order",
        next_gate_label: "Route/order",
        next_action: "Set first canary live flags.",
      }),
      local: localReceipt(),
      http: { canary: 200, ignition: 200, local: 200 },
    });

    expect(packet.safe_next_commands.map((command) => command.id)).toEqual([
      "print-live-flag-requirements",
      "first-canary-live-flags-strict-verifier",
      "rerun-canary-status",
    ]);
    expect(packet.safe_next_commands[0].command).toContain("requirements:web3");
    expect(packet.safe_next_commands[0].purpose).toContain("first-canary live flag");
    expect(packet.safe_next_commands[1].command).toContain("--require-live-canary-flags");
    expect(packet.safe_next_commands.every((command) => command.wallet_mutation_permission === "blocked")).toBe(true);
  });

  test("GIVEN canary and ignition disagree on the active gate WHEN packet is built THEN it fails closed", () => {
    expect(() => buildCanaryStatusPacket({
      canary: canaryReceipt(),
      ignition: ignitionReceipt({ next_gate_id: "wallet-ownership" }),
      local: localReceipt(),
      http: { canary: 200, ignition: 200, local: 200 },
    })).toThrow("disagree on the next gate");
  });

  test("GIVEN canary says no funded trade happened WHEN ignition claims autonomy THEN it fails closed", () => {
    expect(() => buildCanaryStatusPacket({
      canary: canaryReceipt({ actual_live_trade_tested: false }),
      ignition: ignitionReceipt({
        actual_live_trade_tested: false,
        can_autonomously_trade_real_money_now: true,
      }),
      local: localReceipt(),
      http: { canary: 200, ignition: 200, local: 200 },
    })).toThrow("cannot claim autonomy");
  });

  test("GIVEN a response leaks an env assignment WHEN command runs THEN it fails closed", async () => {
    await expect(runWeb3CanaryStatus({
      baseUrl: "http://localhost:4010",
      fetchImpl: async (url) => {
        if (String(url).includes("/api/web3-live-trade-canary")) {
          return new Response(JSON.stringify({
            ...canaryReceipt(),
            next_action: "JUPITER_API_KEY=secretvalue1234567890",
          }));
        }
        if (String(url).includes("/api/web3-live-ignition")) return Response.json(ignitionReceipt());
        if (String(url).includes("/api/web3-local-credentials")) return Response.json(localReceipt());
        throw new Error(`Unexpected URL ${url}`);
      },
    })).rejects.toThrow("leaked");
  });
});

import { describe, expect, test } from "bun:test";
import {
  buildFirstCanaryDrillReport,
  runWeb3FirstCanaryDrill,
} from "../scripts/web3-first-canary-drill.mjs";

const config = {
  baseUrl: "http://localhost:4010",
  source: "live-dex",
  account: "persistent",
  scenario: "breakout",
  amountLamports: 100_000,
};

const blockedReceipts = {
  tradingState: {
    execution_readiness: {
      config: {
        mode: "persistent",
        wallet_public_key: null,
        kill_switch: true,
      },
    },
  },
  blockers: {
    next_action: "Save a dedicated public trading wallet.",
    current_input: {
      id: "dedicated-trading-wallet",
      label: "Dedicated trading wallet",
      next_action: "Save only a public Solana wallet address.",
    },
    next_blocker: {
      label: "Dedicated wallet",
      href: "/settings/integrations#settings-web3-wallet-public-key",
    },
    next_credential_request: {
      label: "Public wallet address",
      fix_href: "/settings/integrations#settings-web3-wallet-public-key",
      verifier_command: "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet",
    },
    missing_for_live_usability: [
      { next_action: "Save a dedicated public trading wallet." },
      { next_action: "Prove wallet ownership with a text-only signature." },
    ],
  },
  readiness: {
    status: "blocked",
    can_request_unsigned_order_now: false,
    can_relay_signed_payload_now: false,
    next_action: "Clear dedicated wallet before canary work.",
    blockers: ["Dedicated public wallet is missing."],
    lanes: [
      {
        id: "live-scope",
        label: "Live DEX scope",
        status: "pass",
        detail: "Live scope is active.",
        next_action: "Keep live scope active.",
      },
    ],
  },
  jupiter: {
    status: "blocked",
    next_action: "Configure Jupiter order proof.",
  },
  unsignedPreflight: {
    status: "blocked",
    can_request_one_shot_unsigned_order: false,
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    next_action: "Clear wallet and Jupiter gates first.",
  },
  canary: {
    source: "live-dex",
    account: "persistent",
    status: "blocked",
    signed_relay_status: "locked",
    actual_live_trade_tested: false,
    real_funds_moved_by_this_app: false,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    post_signing_evidence_status: "needs-signed-relay",
    post_signing_next_action: "Relay a signed canary before proof.",
    post_signing_evidence: [
      { id: "signed-relay", status: "fail" },
      { id: "chain-confirmation", status: "fail" },
      { id: "settlement-reconciliation", status: "fail" },
      { id: "portfolio-mirror", status: "fail" },
    ],
    blockers: ["No funded live canary has been proven."],
  },
};

describe("Web3 first canary drill command", () => {
  test("GIVEN blocked receipts WHEN the report is built THEN it stays read-only and points at the next canary blocker", () => {
    const report = buildFirstCanaryDrillReport({
      config,
      walletPublicKey: null,
      ...blockedReceipts,
    });

    expect(report.mode).toBe("web3-first-canary-drill");
    expect(report.status).toBe("blocked");
    expect(report.exit_code).toBe(0);
    expect(report.actual_live_trade_tested).toBe(false);
    expect(report.real_funds_moved_by_this_app).toBe(false);
    expect(report.live_execution_permission).toBe("blocked");
    expect(report.transaction_submission_permission).toBe("blocked");
    expect(report.wallet_mutation_permission).toBe("blocked");
    expect(report.private_key_storage).toBe("blocked");
    expect(report.seed_phrase_storage).toBe("blocked");
    expect(report.secret_echo_permission).toBe("blocked");
    expect(report.lanes.map((lane) => lane.id)).toContain("unsigned-order-preflight");
    expect(report.lanes.map((lane) => lane.id)).toContain("post-signing-proof");
    expect(report.safe_commands).toContain("npm run verify:web3 -- --base-url=http://localhost:4010");
    expect(report.safe_commands).toContain("npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json");
    expect(report.controls.join(" ")).toContain("read-only");
  });

  test("GIVEN readiness and unsigned preflight are clear WHEN the report is built THEN it only reaches unsigned-order request readiness", () => {
    const report = buildFirstCanaryDrillReport({
      config,
      walletPublicKey: "8M2zdYjJw4Z3p5HJ4Pbdt2YAz6zLx4hX8KdDEdicated111",
      ...blockedReceipts,
      readiness: {
        ...blockedReceipts.readiness,
        status: "ready-to-request-unsigned-order",
        can_request_unsigned_order_now: true,
      },
      unsignedPreflight: {
        ...blockedReceipts.unsignedPreflight,
        status: "ready",
        can_request_one_shot_unsigned_order: true,
      },
    });

    expect(report.status).toBe("ready-to-request-unsigned-order");
    expect(report.exit_code).toBe(0);
    expect(report.wallet_public_key_present).toBe(true);
    expect(report.unsigned_order_handoff_ready).toBe(true);
    expect(report.actual_live_trade_tested).toBe(false);
    expect(report.live_execution_permission).toBe("blocked");
    expect(report.transaction_submission_permission).toBe("blocked");
  });

  test("GIVEN a fully proven canary WHEN the report is built THEN it marks proof complete without granting wallet authority", () => {
    const report = buildFirstCanaryDrillReport({
      config,
      walletPublicKey: "8M2zdYjJw4Z3p5HJ4Pbdt2YAz6zLx4hX8KdDEdicated111",
      ...blockedReceipts,
      readiness: {
        ...blockedReceipts.readiness,
        status: "canary-proven",
        can_request_unsigned_order_now: true,
        can_relay_signed_payload_now: true,
      },
      unsignedPreflight: {
        ...blockedReceipts.unsignedPreflight,
        status: "ready",
        can_request_one_shot_unsigned_order: true,
      },
      canary: {
        ...blockedReceipts.canary,
        status: "live-relay-evidence-recorded",
        signed_relay_status: "confirmed",
        actual_live_trade_tested: true,
        real_funds_moved_by_this_app: true,
        post_signing_evidence_status: "settlement-accounted",
        post_signing_evidence: [
          { id: "signed-relay", status: "pass" },
          { id: "chain-confirmation", status: "pass" },
          { id: "settlement-reconciliation", status: "pass" },
          { id: "portfolio-mirror", status: "pass" },
        ],
      },
    });

    expect(report.status).toBe("canary-proven");
    expect(report.proof_pass_count).toBe(4);
    expect(report.live_execution_permission).toBe("blocked");
    expect(report.wallet_mutation_permission).toBe("blocked");
  });

  test("GIVEN require-ready and blocked app receipts WHEN the drill runs THEN it throws with a machine-readable report", async () => {
    const fetchImpl = async (url) => {
      const pathname = new URL(String(url)).pathname;
      const payloads = {
        "/api/web3-trading": blockedReceipts.tradingState,
        "/api/web3-live-usability-blockers": blockedReceipts.blockers,
        "/api/web3-supervised-canary-readiness": blockedReceipts.readiness,
        "/api/web3-jupiter-order-packet": blockedReceipts.jupiter,
        "/api/web3-live-unsigned-order-handoff": blockedReceipts.unsignedPreflight,
        "/api/web3-live-trade-canary": blockedReceipts.canary,
      };
      return {
        ok: true,
        text: async () => JSON.stringify(payloads[pathname]),
      };
    };

    let report;
    try {
      await runWeb3FirstCanaryDrill({
        ...config,
        requireReady: true,
        fetchImpl,
      });
    } catch (error) {
      report = error.report;
    }

    expect(report.mode).toBe("web3-first-canary-drill");
    expect(report.status).toBe("blocked");
    expect(report.exit_code).toBe(1);
    expect(report.next_action).toContain("dedicated");
  });
});

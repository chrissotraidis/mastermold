import { describe, expect, test } from "bun:test";
import {
  buildLiveCanaryProofReport,
  runWeb3LiveCanaryProof,
} from "../scripts/web3-live-canary-proof.mjs";

const config = {
  baseUrl: "http://localhost:4010",
  source: "live-dex",
  account: "persistent",
  scenario: "breakout",
  attempts: 1,
  runWatchdog: false,
};

describe("Web3 live canary proof command", () => {
  test("GIVEN no signed canary proof WHEN the report is built THEN it fails closed with the next proof action", () => {
    const receipt = {
      mode: "web3-live-trade-canary",
      status: "blocked",
      source: "live-dex",
      account: "persistent",
      scenario: "breakout",
      actual_live_trade_tested: false,
      real_funds_moved_by_this_app: false,
      signed_relay_status: "locked",
      latest_signature_preview: null,
      latest_confirmation_status: null,
      confirmation_poll_status: "not-run",
      settlement_reconciliation_status: "not-run",
      settlement_watchdog_status: "not-run",
      portfolio_mirror_status: "not-run",
      post_signing_evidence_status: "needs-signed-relay",
      post_signing_next_action: "Relay a signed canary transaction before polling confirmation.",
      post_signing_evidence: [
        { id: "signed-relay", status: "fail" },
        { id: "chain-confirmation", status: "fail" },
        { id: "settlement-reconciliation", status: "fail" },
        { id: "portfolio-mirror", status: "fail" },
      ],
    };

    const report = buildLiveCanaryProofReport({
      config,
      receipt,
      attempts: [{ attempt: 1, status: "blocked", complete: false }],
    });

    expect(report.mode).toBe("web3-live-canary-proof");
    expect(report.complete).toBe(false);
    expect(report.exit_code).toBe(1);
    expect(report.status).toBe("needs-signed-relay");
    expect(report.passed_proof_count).toBe(0);
    expect(report.blockers.join(" ")).toContain("No confirmed funded live canary");
    expect(report.blockers.join(" ")).toContain("No signed live canary relay signature");
    expect(report.next_action).toContain("Relay a signed canary");
    expect(report.live_execution_permission).toBe("blocked");
    expect(report.wallet_mutation_permission).toBe("blocked");
    expect(report.secret_echo_permission).toBe("blocked");
  });

  test("GIVEN the canary endpoint is blocked WHEN the proof command runs THEN the loaded receipt remains visible", async () => {
    const receipt = {
      mode: "web3-live-trade-canary",
      status: "blocked",
      source: "live-dex",
      account: "persistent",
      scenario: "breakout",
      actual_live_trade_tested: false,
      real_funds_moved_by_this_app: false,
      signed_relay_status: "awaiting-signature",
      latest_signature_preview: null,
      latest_confirmation_status: null,
      post_signing_evidence_status: "needs-signed-relay",
      post_signing_next_action: "Clear live gates before attempting a canary.",
      post_signing_evidence: [
        { id: "signed-relay", status: "fail" },
        { id: "chain-confirmation", status: "fail" },
        { id: "settlement-reconciliation", status: "fail" },
        { id: "portfolio-mirror", status: "fail" },
      ],
    };

    const fetchImpl = async () => ({
      ok: true,
      text: async () => JSON.stringify(receipt),
    });

    let report;
    try {
      await runWeb3LiveCanaryProof({
        baseUrl: "http://localhost:4010",
        fetchImpl,
      });
    } catch (error) {
      report = error.report;
    }

    expect(report.status).toBe("needs-signed-relay");
    expect(report.canary_status).toBe("blocked");
    expect(report.signed_relay_status).toBe("awaiting-signature");
    expect(report.blockers.join(" ")).toContain("No confirmed funded live canary");
    expect(report.next_action).toContain("Clear live gates");
  });

  test("GIVEN relay confirmation settlement and mirror proof pass WHEN the report is built THEN it grants only proof completion", () => {
    const receipt = {
      mode: "web3-live-trade-canary",
      status: "live-relay-evidence-recorded",
      source: "live-dex",
      account: "persistent",
      scenario: "breakout",
      actual_live_trade_tested: true,
      real_funds_moved_by_this_app: true,
      signed_relay_status: "confirmed",
      latest_signature_preview: "5NfRel...111111",
      latest_confirmation_status: "confirmed",
      confirmation_poll_status: "confirmed",
      settlement_reconciliation_status: "reconciled",
      settlement_watchdog_status: "mirrored",
      portfolio_mirror_status: "applied",
      post_signing_evidence_status: "settlement-accounted",
      post_signing_next_action: "Review caps before another canary.",
      post_signing_evidence: [
        { id: "signed-relay", status: "pass" },
        { id: "chain-confirmation", status: "pass" },
        { id: "settlement-reconciliation", status: "pass" },
        { id: "portfolio-mirror", status: "pass" },
      ],
    };

    const report = buildLiveCanaryProofReport({
      config,
      receipt,
      watchdog: { autonomous_settlement_watchdog: { status: "mirrored", action: "complete" } },
      watchdogRunCount: 1,
      attempts: [{ attempt: 1, status: "live-relay-evidence-recorded", complete: true }],
    });

    expect(report.complete).toBe(true);
    expect(report.exit_code).toBe(0);
    expect(report.status).toBe("settlement-accounted");
    expect(report.passed_proof_count).toBe(4);
    expect(report.watchdog_status).toBe("mirrored");
    expect(report.blockers).toEqual([]);
    expect(report.live_execution_permission).toBe("blocked");
    expect(report.transaction_submission_permission).toBe("blocked");
    expect(report.wallet_mutation_permission).toBe("blocked");
  });
});

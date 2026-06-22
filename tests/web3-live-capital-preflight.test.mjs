import { describe, expect, test } from "bun:test";
import {
  buildLiveCapitalPreflightReport,
  parseLiveCapitalPreflightArgs,
  runWeb3LiveCapitalPreflight,
  shouldSkipLiveCapitalRepeatProof,
} from "../scripts/web3-live-capital-preflight.mjs";

const blockedState = {
  autonomous_live_autonomy_readiness: {
    status: "operator-input-needed",
    readiness_score: 58,
    can_trade_real_capital: false,
    next_action: "Save a dedicated public Solana trading wallet address.",
    items: [
      { id: "signer", status: "fail", blocker: "External signer is not connected." },
      { id: "relay", status: "fail", blocker: "Signed relay is locked." },
      { id: "policy", status: "fail", blocker: "Custody policy is missing." },
    ],
  },
  autonomous_daemon_handoff: {
    can_trade_real_capital: false,
  },
  execution_readiness: {
    config: {
      mode: "dry-run",
      kill_switch: false,
    },
  },
};

describe("web3 live-capital preflight command", () => {
  test("GIVEN live capital is already wallet-blocked WHEN preflight runs THEN it returns immediately with repeat proof skipped", async () => {
    const report = await runWeb3LiveCapitalPreflight({
      baseUrl: "http://localhost:4010",
      scenario: "breakout",
      source: "live-dex",
      state: blockedState,
      requireRepeatProof: true,
      failOnUnsafe: false,
    });

    expect(report.mode).toBe("web3-live-capital-preflight");
    expect(report.status).toBe("blocked-as-expected");
    expect(report.exit_code).toBe(0);
    expect(report.repeat_proof_required).toBe(true);
    expect(report.repeat_proof_skipped).toBe(true);
    expect(report.repeat_proof_status).toBe("skipped-live-blocked");
    expect(report.live_execution_permission).toBe("blocked");
    expect(report.blockers).toEqual([]);
    expect(report.controls.join(" ")).toContain("--always-run-repeat-proof");
  });

  test("GIVEN the operator asks for forced repeat proof WHEN live is blocked THEN the skip helper declines the fast path", () => {
    const config = parseLiveCapitalPreflightArgs(["--always-run-repeat-proof"], {});

    expect(config.skipRepeatWhenLiveBlocked).toBe(false);
    expect(shouldSkipLiveCapitalRepeatProof(config, blockedState)).toBe(false);
  });

  test("GIVEN repeat proof times out WHEN report is built THEN live execution stays blocked and the timeout is actionable", () => {
    const report = buildLiveCapitalPreflightReport({
      config: {
        baseUrl: "http://localhost:4010",
        scenario: "breakout",
        source: "live-dex",
        requireRepeatProof: true,
        allowLiveReady: false,
        requireLiveReady: false,
        repeatProofTimeoutMs: 1_000,
      },
      state: {
        ...blockedState,
        autonomous_live_autonomy_readiness: {
          ...blockedState.autonomous_live_autonomy_readiness,
          can_trade_real_capital: true,
          status: "live-ready",
        },
      },
      repeatProof: {
        proof_gate_status: "timeout",
        promotion_permission: "blocked",
        proof_gate_blockers: ["Repeat forward proof did not finish within 1000ms."],
      },
    });

    expect(report.status).toBe("blocked");
    expect(report.exit_code).toBe(1);
    expect(report.repeat_proof_status).toBe("timeout");
    expect(report.live_execution_permission).toBe("blocked");
    expect(report.blockers.join(" ")).toContain("Repeat forward proof did not finish");
  });
});

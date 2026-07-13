import { describe, expect, test } from "bun:test";

import type { AutopilotStateView } from "../src/autopilot/control";
import { evaluatePaperEvidence, type PaperEvidenceInput } from "../src/autopilot/paper-evidence";
import { DEFAULT_AUTOPILOT_CAPS } from "../src/autopilot/store";

const NOW = Date.parse("2026-07-12T23:30:00Z");

function input(overrides: Partial<PaperEvidenceInput> = {}): PaperEvidenceInput {
  const recent = new Date(NOW - 60_000).toISOString();
  const state: AutopilotStateView = {
    mode: "paper", kill_switch: false, started_at: new Date(NOW - 60 * 60_000).toISOString(),
    updated_at: recent, caps: { ...DEFAULT_AUTOPILOT_CAPS }, wallet_label: null,
    last_tick_at: recent, daemon_pid: 42, last_analyst_run_at: null,
    open_positions: 0, equity_usd: 1_000, last_activity: null, daemon: "live",
  };
  return {
    now_ms: NOW,
    app_health_ok: true,
    state,
    counts: {
      price_history: 10, candidate_snapshots: 10, labeled_snapshots: 0,
      cex_gap_observations: 100, veto_watches: 0, rehearsals: 0, trades: 0, open_positions: 0,
    },
    latest: { price_history: recent, candidate_snapshot: recent, cex_gap_observation: recent },
    recent_error_count: 0,
    recent_halt_count: 0,
    ...overrides,
  };
}

describe("paper evidence monitor", () => {
  test("a healthy, quiet paper lane passes without requiring a fill", () => {
    expect(evaluatePaperEvidence(input())).toEqual({
      status: "ok", caps_match_defaults: true, failures: [], warnings: [],
    });
  });

  test("unexpected live authority, cap drift, and a stale daemon fail closed", () => {
    const base = input();
    const result = evaluatePaperEvidence(input({
      state: {
        ...base.state,
        mode: "live",
        daemon: "stale",
        caps: { ...base.state.caps, max_trade_usd: 26 },
      },
    }));
    expect(result.status).toBe("fail");
    expect(result.failures.join(" ")).toContain("unexpected live mode");
    expect(result.failures.join(" ")).toContain("caps differ");
    expect(result.failures.join(" ")).toContain("heartbeat is stale");
  });

  test("stalled evidence and recent runtime errors fail", () => {
    const stale = new Date(NOW - 8 * 60_000).toISOString();
    const result = evaluatePaperEvidence(input({
      latest: { price_history: stale, candidate_snapshot: stale, cex_gap_observation: stale },
      recent_error_count: 2,
    }));
    expect(result.status).toBe("fail");
    expect(result.failures).toHaveLength(4);
  });

  test("a deliberate kill switch is a warning and never an auto-resume instruction", () => {
    const base = input();
    const result = evaluatePaperEvidence(input({
      state: { ...base.state, mode: "halted", kill_switch: true },
    }));
    expect(result.status).toBe("warning");
    expect(result.failures).toEqual([]);
    expect(result.warnings.join(" ")).toContain("never auto-resume");
  });
});

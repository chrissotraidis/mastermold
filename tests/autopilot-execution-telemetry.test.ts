/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import { formatLatencySummary, modelDriftAlerts, summarizeDecisionToFill } from "../src/autopilot/execution-telemetry";
import type { BotTradeRow, RehearsalRow } from "../src/autopilot/store";

function trade(id: string, decision: number | undefined, fill: number | undefined): BotTradeRow {
  return {
    id, ts: "2026-07-12T12:00:00.000Z", side: "buy", mint: "m", symbol: "M", qty: 1,
    price_usd: 1, value_usd: 1, fee_usd: 0, mode: "paper", reason: "test",
    t_decision_ms: decision, t_fill_ms: fill,
  };
}

describe("execution telemetry", () => {
  test("daily latency summary uses valid decision-to-fill samples and nearest-rank percentiles", () => {
    const summary = summarizeDecisionToFill([
      trade("a", 0, 10), trade("b", 0, 20), trade("c", 0, 30), trade("d", 0, 100), trade("legacy", undefined, undefined),
    ], "2026-07-12");
    expect(summary).toEqual({
      day: "2026-07-12", sample_count: 4, p50_decision_to_fill_ms: 20, p95_decision_to_fill_ms: 100,
    });
    expect(formatLatencySummary(summary)).toContain("p50 20ms, p95 100ms");
  });

  test("model drift alerts only after ten quoted rows and beyond 25bp", () => {
    const rows: RehearsalRow[] = Array.from({ length: 10 }, (_, index) => ({
      id: `r${index}`, ts: new Date(2026, 0, index + 1).toISOString(), mint: "m", symbol: "M", side: "buy",
      notional_usd: 25, live_cost_vs_paper_pct: 0.3, reference_basis: "flat_fallback", price_impact_pct: 0, status: "quoted",
    }));
    expect(modelDriftAlerts(rows.slice(0, 9), [{ mint: "m", symbol: "M" }])).toEqual([]);
    expect(modelDriftAlerts(rows, [{ mint: "m", symbol: "M" }])).toEqual([{ mint: "m", symbol: "M", median_gap_bps: 30 }]);
  });
});

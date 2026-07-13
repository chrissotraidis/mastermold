import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runExperimentTick } from "../src/autopilot/experiments/runner";
import { ExperimentStore } from "../src/autopilot/experiments/store";
import { experimentWeekStart, renderExperimentReport } from "../src/autopilot/experiments/report";
import type { CandidateSignal, StrategyId } from "../src/autopilot/v3/signal";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function store(): ExperimentStore {
  const root = mkdtempSync(join(tmpdir(), "mastermold-experiments-"));
  roots.push(root);
  return new ExperimentStore(join(root, "experiments.sqlite"));
}

function candidate(strategy: StrategyId, mint: string, symbol: string): CandidateSignal {
  return {
    strategy_id: strategy,
    token_mint: mint,
    symbol,
    side: "buy",
    horizon_sec: 3_600,
    expected_return_bps: 200,
    cost: {
      dex_fee_bps: 5,
      price_impact_bps: 3,
      spread_bps: 2,
      slippage_bps: 4,
      priority_fee_bps: 1,
      failed_tx_bps: 1,
      total_bps: 16,
    },
    expected_value_bps: 184,
    confidence: 0.65,
    max_loss_bps: 100,
    liquidity_usd: 1_000_000,
    features: { score: 1 },
    reason: `${strategy} fixture signal`,
  };
}

describe("parallel paper experiments", () => {
  test("renders a private weekly comparison against the V2 control", () => {
    const db = store();
    const report = renderExperimentReport(db.summaries(), new Date("2026-07-15T12:00:00.000Z"));
    expect(experimentWeekStart(new Date("2026-07-15T12:00:00.000Z"))).toBe("2026-07-13");
    expect(report).toContain("Week of 2026-07-13");
    expect(report).toContain("V2 control");
    expect(report).toContain("vs control");
    expect(report).toContain("Synthetic paper evidence only");
    db.close();
  });

  test("keeps five books isolated and applies the Bar Portion treatment only to its arm", () => {
    const db = store();
    const now = Date.parse("2026-07-13T18:00:00.000Z");
    const prices = new Map([
      ["v2-mint", 10],
      ["cusum-mint", 20],
      ["xsec-mint", 30],
      ["trend-mint", 40],
    ]);
    runExperimentTick({
      now_ms: now,
      prices,
      candidates: [
        candidate("cusum_tb", "cusum-mint", "CUSUM"),
        candidate("xsec", "xsec-mint", "XSEC"),
        candidate("trending", "trend-mint", "TREND"),
      ],
      one_way_cost_bps_by_mint: new Map([...prices.keys()].map((mint) => [mint, 10])),
      last_closed_bp_by_mint: new Map([["v2-mint", 0.82]]),
      v2_orders: () => [{
        action: "buy",
        mint: "v2-mint",
        symbol: "V2",
        price: 10,
        value_usd: 25,
        stop_pct: 1,
        tp_pct: 2,
        reason: "V2 fixture signal",
        strategy_id: "v2-trend-pullback",
      }],
    }, db);

    const runs = new Map(db.runs().map((run) => [run.experiment_id, run]));
    expect(db.positions(runs.get("v2-control")!.id)).toHaveLength(1);
    expect(db.positions(runs.get("v2-bp-veto")!.id)).toHaveLength(0);
    expect(db.positions(runs.get("cusum-tb")!.id)[0]?.mint).toBe("cusum-mint");
    expect(db.positions(runs.get("xsec")!.id)[0]?.mint).toBe("xsec-mint");
    expect(db.positions(runs.get("trending")!.id)[0]?.mint).toBe("trend-mint");
    expect(db.cash(runs.get("v2-control")!)).toBeCloseTo(974.975, 6);
    expect(db.cash(runs.get("v2-bp-veto")!)).toBe(1_000);
    expect(db.summaries().every((summary) => summary.paper_only)).toBe(true);
    db.close();
  });

  test("records exits, fees, P&L, confidence, and an independent pause", () => {
    const db = store();
    const start = Date.parse("2026-07-13T18:00:00.000Z");
    const base = {
      candidates: [candidate("xsec", "xsec-mint", "XSEC")],
      one_way_cost_bps_by_mint: new Map([["xsec-mint", 10]]),
      last_closed_bp_by_mint: new Map<string, number | null>(),
      v2_orders: () => [],
    };
    runExperimentTick({ ...base, now_ms: start, prices: new Map([["xsec-mint", 100]]) }, db);
    db.setPaused("xsec", true);
    runExperimentTick({ ...base, now_ms: start + 5 * 60_000, prices: new Map([["xsec-mint", 102]]) }, db);

    const summary = db.summaries(new Map([["xsec-mint", 102]])).find((item) => item.experiment_id === "xsec")!;
    expect(summary.paused).toBe(true);
    expect(summary.open_positions).toBe(0);
    expect(summary.round_trips).toBe(1);
    expect(summary.wins).toBe(1);
    expect(summary.net_pnl_usd).toBeGreaterThan(0);
    expect(summary.fees_usd).toBeCloseTo(0.0505, 4);
    expect(summary.confidence).toBe("provisional");
    db.close();
  });
});

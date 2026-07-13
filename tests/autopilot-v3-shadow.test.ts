/// <reference types="bun" />

/**
 * V3 shadow evaluation (plan §P1–P3): the pure eval that runs alongside v2 and
 * the store-writing recorder. Proves regime→module enablement, that xsec
 * candidates flow through the router, and that recordV3Shadow snapshots an
 * enter or a skip into the candidate store. Temp DB, no network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MarketFeedRow } from "../src/autopilot/feed";
import { __resetAutopilotStoreForTests, autopilotStore } from "../src/autopilot/store";
import { costFromImpact } from "../src/autopilot/v3/execution-cost";
import { enabledModulesFor, evaluateV3Shadow, recordV3Shadow, type ShadowInput, type ShadowResult } from "../src/autopilot/v3/shadow";
import type { CandidateSignal } from "../src/autopilot/v3/signal";

let prevDb: string | undefined;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-v3-shadow-")), "autopilot.db.json");
  __resetAutopilotStoreForTests();
});
afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  __resetAutopilotStoreForTests();
});

const SOL = { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" };
const JUP = { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" };

function feed(symbol: string, o: Partial<MarketFeedRow> = {}): [string, MarketFeedRow] {
  return [symbol, { symbol, price_usd: 100, change_h1_pct: 1, change_h24_pct: 5, volume_h24_usd: 5_000_000, liquidity_usd: 3_000_000, ...o }];
}

/** A rising window that yields a strong xsec score. */
function risingWindow(): number[] {
  return Array.from({ length: 40 }, (_, i) => 100 + i * 0.03);
}

describe("regime → module enablement", () => {
  test("GIVEN regimes THEN inverted xsec never ranks, funding always, pair in chop/risk-off, attention modules outside risk-off", () => {
    expect([...enabledModulesFor("risk_on")].sort()).toEqual(["bar_portion", "copy_wallets", "cusum_tb", "funding_basis", "trending"]);
    expect([...enabledModulesFor("chop")].sort()).toEqual(["bar_portion", "copy_wallets", "cusum_tb", "funding_basis", "pair_rv", "trending"]);
    expect([...enabledModulesFor("risk_off")].sort()).toEqual(["funding_basis", "pair_rv"]);
    for (const regime of ["risk_on", "chop", "risk_off"] as const) {
      expect(enabledModulesFor(regime).has("xsec")).toBe(false);
    }
  });
});

describe("evaluateV3Shadow", () => {
  function input(over: Partial<ShadowInput> = {}): ShadowInput {
    return {
      universe: [SOL, JUP],
      windows: new Map([[SOL.mint, risingWindow()], [JUP.mint, risingWindow()]]),
      feed: new Map([feed("SOL", { change_h1_pct: 2.5, change_h24_pct: 8 }), feed("JUP", { change_h1_pct: 1.5, change_h24_pct: 4 })]),
      costByMint: new Map([[SOL.mint, costFromImpact(0.0003)], [JUP.mint, costFromImpact(0.0003)]]),
      ...over,
    };
  }

  test("GIVEN a broad uptrend (risk-on) THEN the pipeline runs and any ranked candidates are EV-sorted", () => {
    const result = evaluateV3Shadow(input());
    expect(result.regime).toBe("risk_on");
    expect(Array.isArray(result.candidates)).toBe(true);
    // Ranked list is EV-sorted. (With only r_1h available today, xsec often
    // records skips rather than enters — feature enrichment is a P3 follow-up.)
    const evs = result.route.ranked.map((c) => c.expected_value_bps);
    expect([...evs]).toEqual([...evs].sort((a, b) => b - a));
    expect(result.candidates.filter((candidate) => candidate.strategy_id === "xsec")).toHaveLength(0);
  });

  test("GIVEN risk-off THEN xsec is disabled so it produces no xsec candidates", () => {
    // Downtrend + thin breadth → risk_off; xsec not in the enabled set.
    const down = evaluateV3Shadow(input({
      feed: new Map([feed("SOL", { change_h1_pct: -1.5, change_h24_pct: -4 }), feed("JUP", { change_h1_pct: -1, change_h24_pct: -3 })]),
    }));
    expect(down.regime).toBe("risk_off");
    expect(down.candidates.filter((c) => c.strategy_id === "xsec")).toHaveLength(0);
  });

  test("GIVEN a Tier B universe candidate THEN its stored feature snapshot carries tier B", () => {
    const copy: CandidateSignal = {
      strategy_id: "copy_wallets",
      token_mint: JUP.mint,
      symbol: "JUP",
      side: "buy",
      horizon_sec: 21_600,
      expected_return_bps: 400,
      cost: costFromImpact(0.0002),
      expected_value_bps: 300,
      confidence: 0.8,
      max_loss_bps: 200,
      liquidity_usd: 3_000_000,
      features: { source: "fixture" },
      reason: "fixture",
    };
    const result = evaluateV3Shadow(input({
      universe: [{ ...SOL, tier: "A" }, { ...JUP, tier: "B" }],
      copyCandidates: [copy],
    }));
    expect(result.candidates.find((candidate) => candidate.strategy_id === "copy_wallets")?.features.tier).toBe("B");
  });

  test("GIVEN one synthetic CUSUM drift event THEN exactly one cusum_tb candidate is snapshotted", () => {
    const store = autopilotStore();
    const result = evaluateV3Shadow(input({
      cusumEvents: new Map([[SOL.mint, { direction: "up", magnitude: 0.025, ts_ms: 1, h_pct: 2.5, sigma_daily_pct: 5 }]]),
      heldMints: new Set(),
      cusumEdgeRatio: 0.15,
    }));
    expect(result.candidates.filter((row) => row.strategy_id === "cusum_tb")).toHaveLength(1);
    recordV3Shadow(store, result, new Map([[SOL.mint, 100], [JUP.mint, 100]]));
    const rows = store.candidateSnapshots().filter((row) => row.strategy_id === "cusum_tb");
    expect(rows).toHaveLength(1);
    expect(rows[0].features).toMatchObject({ direction: "up", h_pct: 2.5, sigma_daily_pct: 5, barrier_bps: 550 });
  });

  test("GIVEN an unheld SOL down breach THEN a Drift short lands in snapshots but never the paper book", () => {
    const store = autopilotStore();
    const result = evaluateV3Shadow(input({
      cusumEvents: new Map([[SOL.mint, { direction: "down", magnitude: 0.03, ts_ms: 1, h_pct: 2.5, sigma_daily_pct: 5 }]]),
      heldMints: new Set(),
      fundingByMint: new Map([[SOL.mint, { symbol: "SOL", mint: SOL.mint, funding_rate_8h_pct: 0.01, hold_hours: 72, basis_pct: 0, cost: costFromImpact(0), liquidity_usd: 3_000_000, funding_persistence_windows: 2 }]]),
    }));
    const short = result.candidates.find((row) => row.strategy_id === "cusum_tb" && row.features.venue === "drift_perp");
    expect(short).toMatchObject({ side: "sell", features: { perp_market: "SOL-PERP" } });
    recordV3Shadow(store, result, new Map([[SOL.mint, 100], [JUP.mint, 100]]));
    expect(store.candidateSnapshots().find((row) => row.features.venue === "drift_perp")).toBeDefined();
    expect(store.trades()).toHaveLength(0);
  });

  test("GIVEN an extreme down bar THEN one standalone bar_portion snapshot carries exact bar features", () => {
    const store = autopilotStore();
    const result = evaluateV3Shadow(input({
      barMetricsByMint: new Map([[SOL.mint, { bp: -0.8, atr_bps: 800, ema_close: risingWindow().at(-1)! }]]),
      heldMints: new Set(),
      barPortionEdgeRatio: 0.25,
    }));
    expect(result.candidates.filter((row) => row.strategy_id === "bar_portion")).toHaveLength(1);
    recordV3Shadow(store, result, new Map([[SOL.mint, risingWindow().at(-1)!], [JUP.mint, 100]]));
    const rows = store.candidateSnapshots().filter((row) => row.strategy_id === "bar_portion");
    expect(rows).toHaveLength(1);
    expect(rows[0].features).toMatchObject({ bp: -0.8, atr_bps: 800, edge_ratio: 0.25, direction: "buy" });
  });
});

describe("recordV3Shadow (recorder tested in isolation)", () => {
  const passingSignal: CandidateSignal = {
    strategy_id: "xsec", token_mint: SOL.mint, symbol: "SOL", side: "buy", horizon_sec: 7200,
    expected_return_bps: 200, cost: costFromImpact(0.0002), expected_value_bps: 140,
    confidence: 0.72, max_loss_bps: 120, liquidity_usd: 3_000_000, features: { score: 1.6 }, reason: "strong",
  };
  const shadowWith = (route: ShadowResult["route"]): ShadowResult => ({ regime: "risk_on", regime_note: "n", route, candidates: [], best_observation: null });

  test("GIVEN a passing top candidate THEN an 'enter' snapshot lands; nothing trades", () => {
    const store = autopilotStore();
    const note = recordV3Shadow(store, shadowWith({ ranked: [passingSignal], evaluated: [{ signal: passingSignal, verdict: { pass: true } }], best_rejected: null }), new Map([[SOL.mint, 101.2]]));
    const snaps = store.candidateSnapshots(10);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].decision).toBe("enter");
    expect(snaps[0].strategy_id).toBe("xsec");
    expect(snaps[0].price_usd_at_snapshot).toBe(101.2);
    expect(note).toContain("ENTER");
    expect(store.trades(10)).toHaveLength(0); // shadow never trades
  });

  test("GIVEN only a rejected candidate THEN a 'skip' snapshot with the gate reason", () => {
    const store = autopilotStore();
    const rejected = { signal: { ...passingSignal, expected_value_bps: 10 }, verdict: { pass: false as const, reason: "net EV 10bp under the 25bp floor" } };
    recordV3Shadow(store, shadowWith({ ranked: [], evaluated: [rejected], best_rejected: rejected }), new Map([[SOL.mint, 99.5]]));
    const snaps = store.candidateSnapshots(10);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].decision).toBe("skip");
    expect(snaps[0].skip_reason).toContain("under the 25bp floor");
  });

  test("GIVEN another strategy ranks first THEN the outranked module still gets a skip substrate", () => {
    const store = autopilotStore();
    const bp = { ...passingSignal, strategy_id: "bar_portion" as const, token_mint: JUP.mint, symbol: "JUP", expected_value_bps: 100 };
    recordV3Shadow(store, shadowWith({
      ranked: [passingSignal, bp],
      evaluated: [
        { signal: passingSignal, verdict: { pass: true } },
        { signal: bp, verdict: { pass: true } },
      ],
      best_rejected: null,
    }), new Map([[SOL.mint, 100], [JUP.mint, 1]]));
    const rows = store.candidateSnapshots();
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.strategy_id === "bar_portion")).toMatchObject({
      decision: "skip", skip_reason: "passed EV gate but ranked below SOL",
    });
  });
});

describe("shadow always records coverage", () => {
  test("GIVEN risk-off (xsec disabled) THEN it still snapshots the best observation as a skip", () => {
    const store = autopilotStore();
    // Downtrend → risk_off → xsec disabled; but a best observation is still recorded.
    const result = evaluateV3Shadow({
      universe: [SOL, JUP],
      windows: new Map([[SOL.mint, risingWindow()], [JUP.mint, risingWindow()]]),
      feed: new Map([feed("SOL", { change_h1_pct: -1.5, change_h24_pct: -4 }), feed("JUP", { change_h1_pct: -1, change_h24_pct: -3 })]),
      costByMint: new Map([[SOL.mint, costFromImpact(0.0003)], [JUP.mint, costFromImpact(0.0003)]]),
    });
    expect(result.regime).toBe("risk_off");
    expect(result.best_observation).not.toBeNull();
    const note = recordV3Shadow(store, result, new Map([[SOL.mint, 100], [JUP.mint, 100]]));
    const snaps = store.candidateSnapshots(10);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].decision).toBe("skip");
    // A downtrend scores below the entry floor, so that (more specific) reason
    // wins over the regime note — either way a coverage snapshot is recorded.
    expect(snaps[0].skip_reason).toBeTruthy();
    expect(note).toContain("observed");
  });
});

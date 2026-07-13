/// <reference types="bun" />

/**
 * V3 alpha router core (docs/roadmap/2026-07-05-v3-alpha-router-plan.md):
 * execution-cost model, EV gate, regime classifier, router ranking, and the
 * deterministic xsec module. All pure — no network.
 */

import { describe, expect, test } from "bun:test";

import {
  __resetExecutionQuoteCacheForTests,
  conservativeCost,
  costFromRoundTripQuotes,
  costFromImpact,
  fetchExecutionQuote,
  impactFromQuoteBody,
  memecoinConservativeCost,
  fetchExecutionCost,
  quoteNeedsRefresh,
  routeFeeBps,
  slippageP95Bps,
  CONSERVATIVE_TOTAL_BPS,
  MEMECOIN_CONSERVATIVE_TOTAL_BPS,
} from "../src/autopilot/v3/execution-cost";
import { passesEvGate, requiredEvBps } from "../src/autopilot/v3/ev-gate";
import { classifyRegime, EXTREME_VOL_PCT } from "../src/autopilot/v3/regime";
import { routeCandidates } from "../src/autopilot/v3/router";
import type { CandidateSignal, StrategyId } from "../src/autopilot/v3/signal";
import { xsecCandidate, xsecScore, XSEC_SCORE_FLOOR, type TokenFeatures } from "../src/autopilot/v3/xsec";

describe("execution-cost model", () => {
  test("GIVEN a quote impact THEN cost includes round-trip impact + modeled terms", () => {
    const cost = costFromImpact(0.001); // 0.1% one-side impact
    expect(cost.price_impact_bps).toBeCloseTo(20, 5); // doubled for round trip
    expect(cost.total_bps).toBeGreaterThan(cost.price_impact_bps);
    expect(cost.dex_fee_bps).toBe(25);
  });

  test("GIVEN no/invalid impact THEN the conservative cost keeps the gate strict", () => {
    expect(costFromImpact(null).total_bps).toBe(CONSERVATIVE_TOTAL_BPS);
    expect(conservativeCost().total_bps).toBe(CONSERVATIVE_TOTAL_BPS);
    expect(impactFromQuoteBody({ priceImpactPct: "0.0005" })).toBeCloseTo(0.0005, 6);
    expect(impactFromQuoteBody({})).toBeNull();
    expect(impactFromQuoteBody(null)).toBeNull();
  });

  test("GIVEN the memecoin tier THEN the EV bar sits ~2x above the majors default and components add up", () => {
    const cost = memecoinConservativeCost();
    expect(cost.total_bps).toBe(MEMECOIN_CONSERVATIVE_TOTAL_BPS);
    expect(cost.total_bps).toBeGreaterThanOrEqual(conservativeCost().total_bps * 2);
    const sum =
      cost.dex_fee_bps + cost.price_impact_bps + cost.spread_bps + cost.slippage_bps + cost.priority_fee_bps + cost.failed_tx_bps;
    expect(sum).toBeCloseTo(cost.total_bps, 5);
  });

  test("GIVEN cached Tier B decimals THEN quote-derived execution cost no longer fails closed", async () => {
    __resetExecutionQuoteCacheForTests();
    const mint = "DynamicMint111111111111111111111111111111111";
    const bodies = [
      { inputMint: "usdc", outputMint: mint, inAmount: "15000000", outAmount: "30000000", priceImpactPct: "0.0005" },
      { inputMint: mint, outputMint: "usdc", inAmount: "30000000", outAmount: "14850000", priceImpactPct: "0.0005" },
    ];
    const cost = await fetchExecutionCost(
      mint,
      15,
      async () => new Response(JSON.stringify(bodies.shift()), { status: 200 }),
      [{ mint, symbol: "DYN", decimals: 6, resolved_at: "2026-07-12T00:00:00Z" }],
    );
    expect(cost.total_bps).not.toBe(CONSERVATIVE_TOTAL_BPS);
    expect(cost.price_impact_bps).toBeCloseTo(10, 6);
  });

  test("GIVEN forward and reverse quotes THEN components exactly partition the embedded round-trip loss", () => {
    // Jupiter documents outAmount as fee-inclusive. A live verification against
    // SOL/JUP/RAY therefore treats route fees as attribution, never an add-on.
    const forward = {
      inputMint: "usdc", outputMint: "token", inAmount: "10000000", outAmount: "20000000", priceImpactPct: "0.001",
      routePlan: [{ swapInfo: { feeMint: "usdc", feeAmount: "10000" } }],
    };
    const reverse = {
      inputMint: "token", outputMint: "usdc", inAmount: "20000000", outAmount: "9900000", priceImpactPct: "0.001",
      routePlan: [{ swapInfo: { feeMint: "token", feeAmount: "20000" } }],
    };
    const cost = costFromRoundTripQuotes(forward, reverse, 20);
    expect(routeFeeBps(forward)).toBeCloseTo(10, 8);
    expect(cost).toMatchObject({ price_impact_bps: 20, dex_fee_bps: 20, spread_bps: 60, slippage_bps: 20, total_bps: 127 });
    if (!cost) throw new Error("expected cost");
    expect(cost.dex_fee_bps + cost.price_impact_bps + cost.spread_bps + cost.slippage_bps + cost.priority_fee_bps + cost.failed_tx_bps)
      .toBeCloseTo(cost.total_bps, 8);
  });

  test("GIVEN rehearsal evidence THEN p95 replaces the tier fallback only at ten samples", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: `r${index}`, ts: new Date(2026, 0, index + 1).toISOString(), mint: "m", symbol: "M", side: "buy" as const,
      notional_usd: 25, live_cost_vs_paper_pct: index / 100, reference_basis: "flat_fallback" as const, price_impact_pct: 0, status: "quoted" as const,
    }));
    expect(slippageP95Bps(rows.slice(0, 9), "m", "B")).toBe(60);
    expect(slippageP95Bps(rows, "m", "B")).toBe(9);
  });

  test("GIVEN a fresh quote THEN its paper price is the executable amount ratio and route cost is not double-charged", async () => {
    __resetExecutionQuoteCacheForTests();
    const mint = "DynamicMint222222222222222222222222222222222";
    const bodies = [
      { inputMint: "usdc", outputMint: mint, inAmount: "15000000", outAmount: "30000000", priceImpactPct: "0" },
      { inputMint: mint, outputMint: "usdc", inAmount: "30000000", outAmount: "14900000", priceImpactPct: "0" },
    ];
    const quote = await fetchExecutionQuote({
      mint, side: "buy", notional_usd: 15, now_ms: 1_000,
      mint_meta: [{ mint, symbol: "DYN", decimals: 6, resolved_at: "2026-07-12T00:00:00Z" }],
    }, async () => new Response(JSON.stringify(bodies.shift()), { status: 200 }));
    expect(quote).toMatchObject({ price_usd: 0.5, fee_usd: 0, qty: 30, value_usd: 15, quote_ts_ms: 1_000 });
  });

  test("requote boundaries are strictly over 5bp or older than 20 seconds", () => {
    expect(quoteNeedsRefresh(100, 1_000, 100.05, 21_000)).toBe(false);
    expect(quoteNeedsRefresh(100, 1_000, 100.05001, 21_000)).toBe(true);
    expect(quoteNeedsRefresh(100, 1_000, 100, 21_001)).toBe(true);
  });
});

describe("EV gate", () => {
  const base: CandidateSignal = {
    strategy_id: "xsec",
    token_mint: "mint",
    symbol: "SOL",
    side: "buy",
    horizon_sec: 7200,
    expected_return_bps: 200,
    cost: costFromImpact(0.0005),
    expected_value_bps: 120,
    confidence: 0.7,
    max_loss_bps: 120,
    liquidity_usd: 2_000_000,
    features: {},
    reason: "t",
  };

  test("GIVEN EV over the required floor, good confidence, liquidity THEN it passes", () => {
    expect(passesEvGate(base, { min_liquidity_usd: 250_000 })).toEqual({ pass: true });
  });

  test("GIVEN EV floor rule THEN it is the larger of 2x cost or 25bp", () => {
    expect(requiredEvBps(5)).toBe(25); // 2*5 < 25 → floor 25
    expect(requiredEvBps(40)).toBe(80); // 2*40 > 25
  });

  test("GIVEN thin EV, weak confidence, thin liquidity, or high impact THEN reject with reason", () => {
    expect(passesEvGate({ ...base, expected_value_bps: 10 }, { min_liquidity_usd: 250_000 })).toMatchObject({ pass: false });
    expect(passesEvGate({ ...base, confidence: 0.4 }, { min_liquidity_usd: 250_000 })).toMatchObject({ pass: false });
    expect(passesEvGate({ ...base, liquidity_usd: 1_000 }, { min_liquidity_usd: 250_000 })).toMatchObject({ pass: false });
    const highImpact = { ...base, cost: { ...base.cost, price_impact_bps: 40 } };
    expect(passesEvGate(highImpact, { min_liquidity_usd: 250_000 })).toMatchObject({ pass: false });
  });
});

describe("regime classifier", () => {
  test("GIVEN uptrend + broad breadth THEN risk-on", () => {
    expect(classifyRegime({ sol_return_1h_pct: 0.5, sol_return_24h_pct: 4, btc_return_24h_pct: 1, breadth_up_frac: 0.7, realized_vol_1h_pct: 1.5 })).toBe("risk_on");
  });
  test("GIVEN downtrend or thin breadth THEN risk-off", () => {
    expect(classifyRegime({ sol_return_1h_pct: -1, sol_return_24h_pct: -3, btc_return_24h_pct: -2, breadth_up_frac: 0.3, realized_vol_1h_pct: 2 })).toBe("risk_off");
  });
  test("GIVEN extreme vol THEN risk-off regardless of trend", () => {
    expect(classifyRegime({ sol_return_1h_pct: 1, sol_return_24h_pct: 5, btc_return_24h_pct: 3, breadth_up_frac: 0.8, realized_vol_1h_pct: EXTREME_VOL_PCT + 1 })).toBe("risk_off");
  });
  test("GIVEN mixed signals THEN chop", () => {
    expect(classifyRegime({ sol_return_1h_pct: 0.2, sol_return_24h_pct: 1, btc_return_24h_pct: 0, breadth_up_frac: 0.45, realized_vol_1h_pct: 2 })).toBe("chop");
  });
});

describe("xsec module", () => {
  const strong: TokenFeatures = {
    symbol: "SOL", mint: "sol-mint",
    r_5m_pct: 0.1, r_1h_pct: 2.5, r_4h_pct: 5.0, r_24h_pct: 8.0,
    volume_z_1h: 2.5, buy_sell_imbalance_5m: 0.5, realized_vol_15m_pct: 0.5,
    liquidity_usd: 5_000_000,
  };

  test("GIVEN a strong trend with no spike THEN a positive-score candidate", () => {
    expect(xsecScore(strong)).toBeGreaterThan(XSEC_SCORE_FLOOR);
    const c = xsecCandidate(strong, costFromImpact(0.0003));
    expect(c).not.toBeNull();
    expect(c!.strategy_id).toBe("xsec");
    expect(c!.expected_return_bps).toBeGreaterThan(0);
    expect(c!.expected_value_bps).toBe(c!.expected_return_bps - c!.cost.total_bps);
  });

  test("GIVEN an immediate spike THEN the anti-chase penalty lowers the score", () => {
    const spiking = { ...strong, r_5m_pct: 2.5 };
    expect(xsecScore(spiking)).toBeLessThan(xsecScore(strong));
  });

  test("GIVEN a weak/flat token THEN no candidate", () => {
    const flat: TokenFeatures = { ...strong, r_1h_pct: 0, r_4h_pct: 0, volume_z_1h: 0, buy_sell_imbalance_5m: 0 };
    expect(xsecCandidate(flat, conservativeCost())).toBeNull();
  });
});

describe("router", () => {
  function candidate(id: StrategyId, mint: string, ev: number, pass = true): CandidateSignal {
    return {
      strategy_id: id, token_mint: mint, symbol: mint, side: "buy", horizon_sec: 7200,
      expected_return_bps: ev + 60, cost: { ...costFromImpact(0.0003) },
      expected_value_bps: ev, confidence: 0.7, max_loss_bps: 120,
      liquidity_usd: pass ? 3_000_000 : 1_000, features: {}, reason: "t",
    };
  }

  test("GIVEN candidates THEN passing ones rank by EV, disabled modules are rejected, mints dedupe", () => {
    const result = routeCandidates({
      candidates: [
        candidate("xsec", "A", 90),
        candidate("xsec", "B", 150),
        candidate("funding_basis", "C", 200), // module disabled below
        candidate("xsec", "A", 120), // same mint as first A — higher EV wins
      ],
      regime: "risk_on",
      enabledModules: new Set<StrategyId>(["xsec"]),
      min_liquidity_usd: 250_000,
    });
    expect(result.ranked.map((s) => `${s.token_mint}:${s.expected_value_bps}`)).toEqual(["B:150", "A:120"]);
    expect(result.evaluated.find((r) => r.signal.strategy_id === "funding_basis")?.verdict.pass).toBe(false);
  });

  test("GIVEN all-rejected candidates THEN best_rejected is the highest-EV reject", () => {
    const result = routeCandidates({
      candidates: [candidate("xsec", "A", 10), candidate("xsec", "B", 20)],
      regime: "risk_on",
      enabledModules: new Set<StrategyId>(["xsec"]),
      min_liquidity_usd: 250_000,
    });
    expect(result.ranked).toHaveLength(0);
    expect(result.best_rejected?.signal.token_mint).toBe("B");
  });
});

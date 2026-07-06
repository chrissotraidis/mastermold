/// <reference types="bun" />

/**
 * Drift perps adapter (V3 plan §P4): parser against the LIVE-verified endpoint
 * shape, freshness enforcement (stale mirror → no candidates, fail closed),
 * and the funding flow through the shadow core. No network.
 */

import { describe, expect, test } from "bun:test";

import { conservativeCost } from "../src/autopilot/v3/execution-cost";
import {
  fundingSnapshotFromRecords,
  MAX_FRESH_AGE_MS,
  parseFundingRecords,
  PERP_MARKET_BY_MINT,
} from "../src/autopilot/v3/perps";
import { evaluateV3Shadow } from "../src/autopilot/v3/shadow";
import type { FundingInput } from "../src/autopilot/v3/funding-basis";
import type { MarketFeedRow } from "../src/autopilot/feed";

const NOW = Date.parse("2026-07-05T12:00:00Z");

/** The exact record shape observed live from data.api.drift.trade 2026-07-05. */
function record(hoursAgo: number, fundingRate: string, oracle = "84.693889", mark = "84.652352") {
  return {
    ts: Math.floor((NOW - hoursAgo * 3_600_000) / 1000),
    txSig: "sig",
    marketIndex: 0,
    symbol: "SOL-PERP",
    fundingRate,
    fundingRateLong: fundingRate,
    fundingRateShort: fundingRate,
    oraclePriceTwap: oracle,
    markPriceTwap: mark,
  };
}

describe("parseFundingRecords", () => {
  test("GIVEN the live-verified body shape THEN records parse newest-first with hourly fractions", () => {
    const parsed = parseFundingRecords({ success: true, records: [record(2, "-0.001024958"), record(1, "0.002")] });
    expect(parsed).toHaveLength(2);
    expect(parsed[0].ts_ms).toBeGreaterThan(parsed[1].ts_ms); // newest first
    expect(parsed[0].funding_rate_hourly_frac).toBeCloseTo(0.002 / 84.693889, 9);
  });

  test("GIVEN garbage THEN [] without throwing", () => {
    expect(parseFundingRecords(null)).toEqual([]);
    expect(parseFundingRecords({ records: "nope" })).toEqual([]);
    expect(parseFundingRecords({ records: [{ ts: "x" }] })).toEqual([]);
  });
});

describe("fundingSnapshotFromRecords — freshness is a hard rule", () => {
  test("GIVEN fresh hourly records THEN 8h rate, sign persistence, and basis derive", () => {
    // 16 hourly records, all positive funding ≈ +0.0012%/h → ~+0.0095%/8h.
    const records = parseFundingRecords({
      records: Array.from({ length: 16 }, (_, i) => record(i + 0.5, "0.001")),
    });
    const snapshot = fundingSnapshotFromRecords("SOL-PERP", records, NOW);
    expect(snapshot.fresh).toBe(true);
    expect(snapshot.funding_rate_8h_pct).toBeCloseTo((0.001 / 84.693889) * 8 * 100, 6);
    expect(snapshot.persistence_windows).toBe(2); // two full same-sign 8h windows
    expect(snapshot.basis_pct).toBeCloseTo(((84.652352 - 84.693889) / 84.693889) * 100, 6);
  });

  test("GIVEN records older than the freshness ceiling THEN fresh:false and null rate (the stale-mirror case)", () => {
    const stale = parseFundingRecords({ records: [record(MAX_FRESH_AGE_MS / 3_600_000 + 1, "0.001")] });
    const snapshot = fundingSnapshotFromRecords("SOL-PERP", stale, NOW);
    expect(snapshot.fresh).toBe(false);
    expect(snapshot.funding_rate_8h_pct).toBeNull();
  });

  test("GIVEN no records THEN the empty snapshot", () => {
    expect(fundingSnapshotFromRecords("SOL-PERP", [], NOW).fresh).toBe(false);
  });
});

describe("funding flows through the shadow core", () => {
  test("GIVEN a rich fresh funding input THEN a funding candidate routes even in risk-off", () => {
    const SOL_MINT = Object.keys(PERP_MARKET_BY_MINT)[0];
    const funding: FundingInput = {
      symbol: "SOL", mint: SOL_MINT,
      funding_rate_8h_pct: 0.12, hold_hours: 96, basis_pct: 0.03,
      cost: conservativeCost(), liquidity_usd: 5_000_000, funding_persistence_windows: 3,
    };
    const feedRow: MarketFeedRow = { symbol: "SOL", price_usd: 82, change_h1_pct: -1.2, change_h24_pct: -4, volume_h24_usd: 5e6, liquidity_usd: 5e6 };
    const result = evaluateV3Shadow({
      universe: [{ symbol: "SOL", mint: SOL_MINT }],
      windows: new Map([[SOL_MINT, Array.from({ length: 40 }, (_, i) => 82 - i * 0.01)]]),
      feed: new Map([["SOL", feedRow]]),
      costByMint: new Map([[SOL_MINT, conservativeCost()]]),
      fundingByMint: new Map([[SOL_MINT, funding]]),
    });
    expect(result.regime).toBe("risk_off"); // downtrend
    const fundingCandidates = result.candidates.filter((c) => c.strategy_id === "funding_basis");
    expect(fundingCandidates).toHaveLength(1); // market-neutral survives risk-off
    expect(fundingCandidates[0].side).toBe("long_spot_short_perp");
  });
});

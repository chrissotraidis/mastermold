import { describe, expect, test } from "bun:test";

import {
  fundingCandidate,
  stressAdjustedCarryBps,
  type FundingInput,
} from "@/src/autopilot/v3/funding-basis";
import { fundingSnapshotFromRecords, type DriftFundingRecord } from "@/src/autopilot/v3/perps";
import { costFromImpact } from "@/src/autopilot/v3/execution-cost";

describe("research-backed funding stress gates", () => {
  const base: FundingInput = {
    symbol: "SOL",
    mint: "sol",
    funding_rate_8h_pct: 0.12,
    funding_rate_8h_stdev_pct: 0.02,
    hold_hours: 72,
    basis_pct: 0.05,
    basis_stress_pct: 0.2,
    cost: costFromImpact(0.0005),
    liquidity_usd: 5_000_000,
    funding_persistence_windows: 3,
  };

  test("discounts carry by funding dispersion and full observed basis stress", () => {
    // (0.12%-0.02%) * 9 windows = 90bp, less 20bp stressed basis.
    expect(stressAdjustedCarryBps(base)).toBeCloseTo(70, 6);
    expect(fundingCandidate(base)).not.toBeNull();
  });

  test("rejects a volatile rate or a recent basis blowout", () => {
    expect(fundingCandidate({ ...base, funding_rate_8h_stdev_pct: 0.2 })).toBeNull();
    expect(fundingCandidate({ ...base, basis_stress_pct: 1.51 })).toBeNull();
  });

  test("derives non-overlapping funding dispersion and recent basis stress", () => {
    const now = Date.parse("2026-08-02T12:00:00Z");
    const records: DriftFundingRecord[] = Array.from({ length: 16 }, (_, index) => {
      const firstWindow = index < 8;
      const oracle = 100;
      return {
        ts_ms: now - index * 60 * 60_000,
        funding_rate_hourly_frac: firstWindow ? 0.0001 : 0.0002,
        oracle_twap: oracle,
        mark_twap: index === 4 ? 101 : 100.1,
      };
    });
    const snapshot = fundingSnapshotFromRecords("SOL-PERP", records, now);
    expect(snapshot.funding_rate_8h_stdev_pct).toBeGreaterThan(0);
    expect(snapshot.basis_stress_pct).toBeCloseTo(1, 6);
    expect(snapshot.persistence_windows).toBe(2);
  });
});

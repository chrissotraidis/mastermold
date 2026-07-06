/// <reference types="bun" />

/**
 * V3 walk-forward validation harness (plan §P5, go-live-gate discipline).
 * Pure-engine tests over synthetic labeled snapshots with controllable
 * score→outcome relationships. Proves: a predictive dataset validates and
 * calibration never sees future data (poisoning ONLY the last slice degrades
 * only that fold), an anti-predictive dataset is rejected for negative
 * expectancy, a too-young dataset gets the honest "too few trades" verdict,
 * per-row and fixed cost modes both compute, and fold boundaries are
 * chronological, non-overlapping, and skip fold 0.
 */

import { describe, expect, test } from "bun:test";

import type { CandidateSnapshotRow } from "../src/autopilot/v3/candidate-store";
import {
  POSITIVE_VERDICT,
  foldSlices,
  scoreFromSnapshotFeatures,
  storedScore,
  walkForward,
  type BacktestConfig,
} from "../src/autopilot/v3/backtest";

const T0 = Date.parse("2026-07-05T00:00:00Z");

/** Fabricate one labeled snapshot: stored decision-time score + forward return. */
function labeledRow(over: {
  i: number; // chronological index → ts (1 minute apart)
  score: number;
  return_bps: number;
  cost_total_bps?: number;
  labeled?: boolean;
}): CandidateSnapshotRow {
  const ret = over.labeled === false ? null : over.return_bps;
  return {
    id: `cnd_${over.i}`,
    ts: new Date(T0 + over.i * 60_000).toISOString(),
    strategy_id: "xsec",
    token_mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    decision: "skip",
    skip_reason: "shadow",
    features: { score: over.score, r_1h_pct: 1.0 },
    cost_total_bps: over.cost_total_bps ?? 30,
    expected_value_bps: over.score * 45 - (over.cost_total_bps ?? 30),
    confidence: 0.5,
    price_usd_at_snapshot: 100,
    return_30m_bps: ret,
    return_2h_bps: ret,
    return_6h_bps: ret,
    max_adverse_2h_bps: ret === null ? null : Math.min(0, ret),
    max_favorable_2h_bps: ret === null ? null : Math.max(0, ret),
    labeled: over.labeled ?? true,
  };
}

/**
 * Synthetic dataset with a controllable score→outcome link. Scores cycle
 * deterministically over 0..4.5; `outcome(score, i)` sets the forward return.
 */
function dataset(n: number, outcome: (score: number, i: number) => number): CandidateSnapshotRow[] {
  const rows: CandidateSnapshotRow[] = [];
  for (let i = 0; i < n; i++) {
    const score = (i % 10) / 2; // 0, 0.5, ..., 4.5
    rows.push(labeledRow({ i, score, return_bps: outcome(score, i) }));
  }
  return rows;
}

/** High score → high forward return; net-positive above ~score 3 at 30bp cost. */
const predictive = (score: number) => (score - 2) * 40;
/** Same magnitude, inverted: the score anti-predicts. */
const antiPredictive = (score: number) => -(score - 2) * 40;

const config = (over: Partial<BacktestConfig> = {}): BacktestConfig => ({
  entry_score_floor: 1.2,
  cost_total_bps: null, // per-row cost by default
  horizon: "2h",
  folds: 5,
  ...over,
});

describe("walk-forward backtest engine", () => {
  test("GIVEN a predictive dataset THEN verdict is POSITIVE with sensible fold accounting", () => {
    const report = walkForward(dataset(200, predictive), storedScore, config());

    expect(report.verdict).toBe(POSITIVE_VERDICT);
    expect(report.folds.length).toBe(4); // 5 slices, fold 0 skipped
    expect(report.folds.map((f) => f.fold)).toEqual([1, 2, 3, 4]);
    expect(report.folds.map((f) => f.test_n)).toEqual([40, 40, 40, 40]);
    expect(report.folds.map((f) => f.train_n)).toEqual([40, 80, 120, 160]);
    expect(report.overall.trades).toBeGreaterThanOrEqual(20);
    expect(report.overall.mean_net_bps).toBeGreaterThan(0);
    expect(report.overall.profit_factor).toBeGreaterThanOrEqual(1.25);
    for (const fold of report.folds) {
      expect(fold.trades).toBeGreaterThan(0);
      expect(fold.trades).toBeLessThanOrEqual(fold.test_n);
      expect(fold.mean_net_bps).toBeGreaterThan(0);
    }
  });

  test("GIVEN an inverted relationship confined to the LAST slice THEN only the last fold degrades (no future data in calibration)", () => {
    const clean = dataset(200, predictive);
    // Poison ONLY rows 160..199 (slice 4, the final test slice). If any fold's
    // calibration or evaluation peeked forward, folds 1–3 would change too.
    const poisoned = dataset(200, (score, i) => (i >= 160 ? antiPredictive(score) : predictive(score)));

    const cleanReport = walkForward(clean, storedScore, config());
    const poisonedReport = walkForward(poisoned, storedScore, config());

    expect(poisonedReport.folds.slice(0, 3)).toEqual(cleanReport.folds.slice(0, 3));
    const lastClean = cleanReport.folds[3];
    const lastPoisoned = poisonedReport.folds[3];
    expect(lastPoisoned.mean_net_bps).toBeLessThan(lastClean.mean_net_bps);
    expect(lastPoisoned.mean_net_bps).toBeLessThan(0);
  });

  test("GIVEN an anti-predictive dataset THEN the verdict rejects it for negative expectancy", () => {
    const report = walkForward(dataset(500, antiPredictive), storedScore, config());

    expect(report.verdict).not.toBe(POSITIVE_VERDICT);
    expect(report.verdict).toContain("NOT VALIDATED");
    expect(report.verdict).toContain("negative expectancy");
    expect(report.overall.mean_net_bps).toBeLessThanOrEqual(0);
  });

  test("GIVEN too few labeled snapshots THEN the verdict honestly says too few trades", () => {
    const report = walkForward(dataset(10, predictive), storedScore, config({ folds: 3 }));

    expect(report.verdict).not.toBe(POSITIVE_VERDICT);
    expect(report.verdict).toContain("too few trades");
  });

  test("GIVEN unlabeled or null-horizon rows THEN they are excluded from every fold", () => {
    const rows = dataset(100, predictive);
    const withNoise = [
      ...rows,
      labeledRow({ i: 200, score: 4.5, return_bps: 9999, labeled: false }), // unlabeled: ignored
    ];
    const report = walkForward(withNoise, storedScore, config());
    const total = report.folds.reduce((sum, f) => sum + f.test_n, 0) + report.folds[0].train_n;
    expect(total).toBe(100); // only the labeled rows were sliced
  });

  test("GIVEN per-row cost mode vs fixed cost mode THEN both compute and agree when costs match", () => {
    const rows = dataset(200, predictive); // every row carries cost_total_bps = 30
    const perRow = walkForward(rows, storedScore, config({ cost_total_bps: null }));
    const fixedSame = walkForward(rows, storedScore, config({ cost_total_bps: 30 }));
    const fixedHeavy = walkForward(rows, storedScore, config({ cost_total_bps: 90 }));

    expect(perRow.overall).toEqual(fixedSame.overall);
    expect(perRow.folds).toEqual(fixedSame.folds);
    // Imposing heavier transaction costs must strictly reduce net expectancy.
    expect(fixedHeavy.overall.mean_net_bps).toBeLessThan(perRow.overall.mean_net_bps);
  });

  test("GIVEN varying per-row costs THEN each trade is charged its own cost", () => {
    // Two rows per minute-slot pattern: identical scores/returns, but the
    // second half carries a much heavier modeled cost.
    const rows = dataset(200, predictive).map((row, i) =>
      i >= 100 ? { ...row, cost_total_bps: 500 } : row,
    );
    const report = walkForward(rows, storedScore, config({ cost_total_bps: null }));
    // Folds 3 and 4 test the expensive half: gross +bps collapse to negative net.
    expect(report.folds[2].mean_net_bps).toBeLessThan(0);
    expect(report.folds[3].mean_net_bps).toBeLessThan(0);
    // Fold 1 tests the cheap half and stays positive.
    expect(report.folds[0].mean_net_bps).toBeGreaterThan(0);
  });

  test("GIVEN shuffled input THEN folds are chronological (sorting is the engine's job)", () => {
    const rows = dataset(200, predictive);
    const shuffled = [...rows].reverse();
    const sortedReport = walkForward(rows, storedScore, config());
    const shuffledReport = walkForward(shuffled, storedScore, config());
    expect(shuffledReport).toEqual(sortedReport);
  });

  test("GIVEN foldSlices THEN slices are contiguous, non-overlapping, and cover every row", () => {
    for (const [n, folds] of [
      [200, 5],
      [103, 5],
      [7, 3],
      [2, 2],
    ] as Array<[number, number]>) {
      const slices = foldSlices(n, folds);
      expect(slices.length).toBe(folds);
      expect(slices[0][0]).toBe(0);
      expect(slices[slices.length - 1][1]).toBe(n);
      for (let i = 1; i < slices.length; i++) {
        expect(slices[i][0]).toBe(slices[i - 1][1]); // contiguous, no overlap, no gap
      }
    }
  });

  test("GIVEN a row without a stored score THEN it never trades (score is -Infinity, not re-derived)", () => {
    expect(scoreFromSnapshotFeatures({ features: { r_1h_pct: 3.2 } })).toBe(-Infinity);
    expect(scoreFromSnapshotFeatures({ features: { score: 1.7 } })).toBe(1.7);
    expect(scoreFromSnapshotFeatures({ features: { score: "high" } })).toBe(-Infinity);

    const rows = dataset(200, predictive).map((row, i) =>
      i % 2 === 0 ? { ...row, features: { r_1h_pct: 1.0 } } : row, // strip stored score from half
    );
    const report = walkForward(rows, storedScore, config());
    const maxPossible = report.folds.reduce((sum, f) => sum + f.test_n, 0) / 2;
    expect(report.overall.trades).toBeLessThanOrEqual(maxPossible);
  });

  test("GIVEN an all-winning fold THEN profit factor is Infinity-safe and still satisfies the gate", () => {
    // Every trade wins: gross losses are 0 → profit factor must be Infinity,
    // and the verdict logic must treat that as passing, not NaN.
    const rows = dataset(200, (score) => 200 + score); // always >> cost
    const report = walkForward(rows, storedScore, config());
    expect(report.overall.profit_factor).toBe(Infinity);
    expect(report.verdict).toBe(POSITIVE_VERDICT);
  });

  test("GIVEN an empty dataset THEN the report is empty-safe with a too-few verdict", () => {
    const report = walkForward([], storedScore, config());
    expect(report.overall.trades).toBe(0);
    expect(report.verdict).toContain("too few trades");
    for (const fold of report.folds) expect(fold.test_n).toBe(0);
  });
});

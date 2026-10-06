/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { historyRange, totalGain } from "../lib/performance";

const history = [
  { date: "2025-09-01", value: 100 },
  { date: "2026-01-02", value: 120 },
  { date: "2026-07-15", value: 150 },
  { date: "2026-08-30", value: 160 },
  { date: "2026-09-27", value: 176 },
];

describe("performance", () => {
  test("GIVEN a range THEN change runs from the first point inside it to today", () => {
    expect(historyRange(history, "1M", "2026-09-27").change).toEqual({ value: 16, pct: 10 });
    expect(historyRange(history, "YTD", "2026-09-27").change).toEqual({ value: 56, pct: 46.7 });
    expect(historyRange(history, "ALL", "2026-09-27").points).toHaveLength(5);
  });

  test("GIVEN fewer than two points in range THEN there is no change to report", () => {
    expect(historyRange([{ date: "2026-09-27", value: 5 }], "1M", "2026-09-27").change).toBeNull();
  });

  test("GIVEN holdings without a cost basis THEN they are counted as unknown, never guessed", () => {
    const result = totalGain([
      { gain_value: 50, cost_basis: 100, cost_basis_known: true },
      { gain_value: -10, cost_basis: 100, cost_basis_known: true },
      { gain_value: null, cost_basis: 30, cost_basis_known: false },
    ]);
    expect(result).toEqual({ gain: 40, basis: 200, pct: 20, known: 2, unknown: 1 });
  });
});

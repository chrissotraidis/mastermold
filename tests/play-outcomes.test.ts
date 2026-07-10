/// <reference types="bun" />

/**
 * Tradfi play accountability: pure grading of directional daily-report plays
 * against later reports' closes. Synthetic report rows, no store, no network.
 */

import { describe, expect, test } from "bun:test";

import {
  describeTrackRecord,
  gradePlayHistory,
  playTrackRecord,
  GRADE_FLAT_BAND_PCT,
  GRADE_MIN_HORIZON_DAYS,
} from "../src/db/play-outcomes";
import type { DailyReportRow } from "../src/db/store";

function report(
  runDate: string,
  plays: Array<{ id: string; symbol: string; action: string }>,
  closes: Record<string, number>,
): DailyReportRow {
  return {
    id: `report_${runDate}`,
    run_date: runDate,
    created_at: `${runDate}T13:30:00.000Z`,
    data: {
      plays,
      market_rows: Object.entries(closes).map(([symbol, latest_close]) => ({ symbol, latest_close })),
    },
  };
}

describe("gradePlayHistory", () => {
  test("GIVEN a trim call and the price fell past the band THEN the call grades right; risen grades wrong", () => {
    const reports = [
      report("2026-07-01", [{ id: "p1", symbol: "VOO", action: "trim" }], { VOO: 100 }),
      report("2026-07-05", [], { VOO: 97 }),
    ];
    const { graded } = gradePlayHistory(reports);
    expect(graded).toHaveLength(1);
    expect(graded[0]).toMatchObject({ symbol: "VOO", verdict: "right", return_pct: -3 });

    const risen = gradePlayHistory([
      report("2026-07-01", [{ id: "p1", symbol: "VOO", action: "trim" }], { VOO: 100 }),
      report("2026-07-05", [], { VOO: 103 }),
    ]);
    expect(risen.graded[0].verdict).toBe("wrong");
  });

  test("GIVEN a buy call THEN direction inverts; inside the flat band grades flat", () => {
    const reports = [
      report("2026-07-01", [{ id: "p1", symbol: "NVDA", action: "buy" }], { NVDA: 200 }),
      report("2026-07-05", [], { NVDA: 210 }),
    ];
    expect(gradePlayHistory(reports).graded[0].verdict).toBe("right");

    const flat = gradePlayHistory([
      report("2026-07-01", [{ id: "p1", symbol: "NVDA", action: "buy" }], { NVDA: 200 }),
      report("2026-07-05", [], { NVDA: 200 + (200 * (GRADE_FLAT_BAND_PCT - 0.1)) / 100 }),
    ]);
    expect(flat.graded[0].verdict).toBe("flat");
  });

  test("GIVEN hold/watch calls THEN they are never graded (no directional claim)", () => {
    const reports = [
      report(
        "2026-07-01",
        [
          { id: "p1", symbol: "AAPL", action: "hold" },
          { id: "p2", symbol: "HOOD", action: "watch" },
        ],
        { AAPL: 210, HOOD: 60 },
      ),
      report("2026-07-05", [], { AAPL: 250, HOOD: 40 }),
    ];
    const { graded, pending } = gradePlayHistory(reports);
    expect(graded).toEqual([]);
    expect(pending).toBe(0);
  });

  test("GIVEN a too-young call or missing closes THEN it counts as pending, never mis-graded", () => {
    const young = gradePlayHistory([
      report("2026-07-08", [{ id: "p1", symbol: "VOO", action: "trim" }], { VOO: 100 }),
      report("2026-07-09", [], { VOO: 90 }), // only 1 day out — inside the horizon
    ]);
    expect(young.graded).toEqual([]);
    expect(young.pending).toBe(1);
    expect(GRADE_MIN_HORIZON_DAYS).toBeGreaterThan(1);

    const missingClose = gradePlayHistory([
      report("2026-07-01", [{ id: "p1", symbol: "TLT", action: "trim" }], { TLT: 92 }),
      report("2026-07-05", [], { VOO: 100 }), // no TLT close in the later report
    ]);
    expect(missingClose.graded).toEqual([]);
    expect(missingClose.pending).toBe(1);
  });

  test("GIVEN more history arriving later THEN the earliest qualifying evaluation keeps the grade stable", () => {
    const base = [
      report("2026-07-01", [{ id: "p1", symbol: "VOO", action: "trim" }], { VOO: 100 }),
      report("2026-07-05", [], { VOO: 97 }),
    ];
    const withMore = [...base, report("2026-07-20", [], { VOO: 130 })];
    expect(gradePlayHistory(base).graded[0].eval_date).toBe("2026-07-05");
    expect(gradePlayHistory(withMore).graded[0].eval_date).toBe("2026-07-05");
    expect(gradePlayHistory(withMore).graded[0].verdict).toBe("right");
  });
});

describe("playTrackRecord + describeTrackRecord", () => {
  test("GIVEN graded calls THEN hit rate excludes flats and the sentence reads honestly", () => {
    const reports = [
      report(
        "2026-07-01",
        [
          { id: "p1", symbol: "VOO", action: "trim" },
          { id: "p2", symbol: "NVDA", action: "buy" },
          { id: "p3", symbol: "TLT", action: "sell" },
        ],
        { VOO: 100, NVDA: 200, TLT: 92 },
      ),
      report("2026-07-05", [{ id: "p4", symbol: "MSFT", action: "buy" }], { VOO: 97, NVDA: 195, TLT: 92.1, MSFT: 430 }),
    ];
    const record = playTrackRecord(gradePlayHistory(reports));
    expect(record.graded).toBe(3);
    expect(record.right).toBe(1); // VOO trim
    expect(record.wrong).toBe(1); // NVDA buy fell
    expect(record.flat).toBe(1); // TLT ~unchanged
    expect(record.hit_rate).toBe(0.5);
    expect(record.pending).toBe(1); // MSFT too young
    const line = describeTrackRecord(record);
    expect(line).toContain("1/2 directional calls right");
    expect(line).toContain("1 flat");
    expect(line).toContain("1 awaiting grade");
  });

  test("GIVEN nothing gradable and nothing pending THEN silence, not noise", () => {
    expect(describeTrackRecord(playTrackRecord({ graded: [], pending: 0 }))).toBeNull();
  });
});

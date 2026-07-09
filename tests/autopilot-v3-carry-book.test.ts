/// <reference types="bun" />

/**
 * Synthetic carry book: pure open/accrue/close math for the funding_basis
 * strategy's shadow P&L. No store, no network.
 */

import { describe, expect, test } from "bun:test";

import {
  markCarryBook,
  summarizeCarryBook,
  CARRY_NOTIONAL_USD,
  CARRY_ROUND_TRIP_BPS,
  CARRY_STALE_CYCLES_TO_CLOSE,
  EMPTY_CARRY_BOOK,
} from "../src/autopilot/v3/carry-book";
import { conservativeCost } from "../src/autopilot/v3/execution-cost";
import { MIN_FUNDING_PERSISTENCE, type FundingInput } from "../src/autopilot/v3/funding-basis";

const NOW = Date.parse("2026-07-09T00:00:00Z");
const HOUR = 3_600_000;

function funding(over: Partial<FundingInput> = {}): FundingInput {
  return {
    symbol: "SOL",
    mint: "So11111111111111111111111111111111111111112",
    funding_rate_8h_pct: 0.05, // 5bp/8h ≈ 55%/yr annualized — a hot but real funding read
    hold_hours: 72,
    basis_pct: 0.01,
    cost: conservativeCost(),
    liquidity_usd: 5_000_000,
    funding_persistence_windows: MIN_FUNDING_PERSISTENCE,
    ...over,
  };
}

describe("markCarryBook", () => {
  test("GIVEN persistent positive funding THEN a position opens charged its round-trip cost", () => {
    const { state, notes } = markCarryBook(EMPTY_CARRY_BOOK, new Map([["SOL-PERP", funding()]]), NOW);
    const position = state.positions["SOL-PERP"];
    expect(position).toBeDefined();
    expect(position.accrued_usd).toBeCloseTo(-CARRY_NOTIONAL_USD * (CARRY_ROUND_TRIP_BPS / 10_000), 6);
    expect(notes[0]).toContain("Carry shadow opened SOL-PERP");
  });

  test("GIVEN fresh-but-unpersistent or negative funding THEN nothing opens", () => {
    const young = markCarryBook(EMPTY_CARRY_BOOK, new Map([["SOL-PERP", funding({ funding_persistence_windows: 0 })]]), NOW);
    expect(Object.keys(young.state.positions)).toHaveLength(0);
    const negative = markCarryBook(EMPTY_CARRY_BOOK, new Map([["SOL-PERP", funding({ funding_rate_8h_pct: -0.01 })]]), NOW);
    expect(Object.keys(negative.state.positions)).toHaveLength(0);
  });

  test("GIVEN 8 hours at the in-force rate THEN accrual matches notional x rate", () => {
    const opened = markCarryBook(EMPTY_CARRY_BOOK, new Map([["SOL-PERP", funding()]]), NOW).state;
    const marked = markCarryBook(opened, new Map([["SOL-PERP", funding()]]), NOW + 8 * HOUR).state;
    const expected = -CARRY_NOTIONAL_USD * (CARRY_ROUND_TRIP_BPS / 10_000) + CARRY_NOTIONAL_USD * (0.05 / 100);
    expect(marked.positions["SOL-PERP"].accrued_usd).toBeCloseTo(Math.round(expected * 100) / 100, 6);
  });

  test("GIVEN funding flips negative THEN the position closes and realizes", () => {
    const opened = markCarryBook(EMPTY_CARRY_BOOK, new Map([["SOL-PERP", funding()]]), NOW).state;
    const closed = markCarryBook(opened, new Map([["SOL-PERP", funding({ funding_rate_8h_pct: -0.005 })]]), NOW + 8 * HOUR);
    expect(closed.state.positions["SOL-PERP"]).toBeUndefined();
    expect(closed.state.round_trips).toBe(1);
    expect(closed.notes.some((note) => note.includes("funding flipped"))).toBe(true);
  });

  test("GIVEN prolonged missing data THEN staleness closes the book honestly", () => {
    let state = markCarryBook(EMPTY_CARRY_BOOK, new Map([["SOL-PERP", funding()]]), NOW).state;
    for (let cycle = 1; cycle <= CARRY_STALE_CYCLES_TO_CLOSE; cycle += 1) {
      state = markCarryBook(state, new Map(), NOW + cycle * HOUR).state;
    }
    expect(state.positions["SOL-PERP"]).toBeUndefined();
    expect(state.round_trips).toBe(1);
  });
});

describe("summarizeCarryBook", () => {
  test("GIVEN a young book THEN APR abstains; after a day it annualizes", () => {
    const opened = markCarryBook(EMPTY_CARRY_BOOK, new Map([["SOL-PERP", funding()]]), NOW).state;
    expect(summarizeCarryBook(opened, NOW + HOUR).apr_pct).toBeNull();
    const later = markCarryBook(opened, new Map([["SOL-PERP", funding()]]), NOW + 30 * HOUR).state;
    const summary = summarizeCarryBook(later, NOW + 30 * HOUR);
    expect(summary.open_markets).toBe(1);
    expect(summary.apr_pct).not.toBeNull();
  });
});

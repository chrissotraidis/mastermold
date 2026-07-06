/// <reference types="bun" />

/**
 * Go-live gate + live-route rehearsal slice
 * (docs/roadmap/2026-07-03-autonomy-architecture.md, D3/D6). Both pure: the
 * gate derives from store rows, the rehearsal parser from a canned Jupiter
 * quote body. No network in tests.
 */

import { describe, expect, test } from "bun:test";

import {
  evaluateGoLiveGate,
  GATE_MIN_ROUND_TRIPS,
  GATE_WINDOW_DAYS,
  type GateInput,
} from "../src/autopilot/gate";
import { describeRehearsal, parseQuoteRehearsal } from "../src/autopilot/rehearsal";
import type { BotDecisionRow, BotTradeRow, EquityPointRow } from "../src/autopilot/store";

const NOW = Date.parse("2026-07-10T12:00:00Z");
const DAY_MS = 24 * 60 * 60_000;

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

const SIGNALS = {
  price_usd: 100,
  short_pct: -0.4,
  range_pct: 0.8,
  h1_pct: 1,
  h24_pct: 5,
  volume_h24_usd: 5_000_000,
  liquidity_usd: 2_000_000,
};

function trade(side: "buy" | "sell", msAgo: number, symbol = "SOL"): BotTradeRow {
  return {
    id: `t-${side}-${msAgo}`,
    ts: iso(msAgo),
    side,
    mint: `mint-${symbol}`,
    symbol,
    qty: 0.25,
    price_usd: 100,
    value_usd: 25,
    fee_usd: 0.075,
    mode: "paper",
    reason: "test",
  };
}

/** A traced round trip: buy+sell fills with enter/exit rows 5s after each. */
function tracedRoundTrip(msAgo: number, symbol = "SOL"): { trades: BotTradeRow[]; decisions: BotDecisionRow[] } {
  const buy = trade("buy", msAgo + 60 * 60_000, symbol);
  const sell = trade("sell", msAgo, symbol);
  const decision = (verdict: "enter" | "exit", ts: string): BotDecisionRow => ({
    id: `d-${verdict}-${ts}`,
    ts: new Date(Date.parse(ts) + 5_000).toISOString(),
    symbol,
    verdict,
    reason: "test",
    signals: SIGNALS,
  });
  return { trades: [buy, sell], decisions: [decision("enter", buy.ts), decision("exit", sell.ts)] };
}

function passingInput(): GateInput {
  const trips = Array.from({ length: GATE_MIN_ROUND_TRIPS }, (_, index) => tracedRoundTrip((index + 1) * 8 * 60 * 60_000));
  const equity: EquityPointRow[] = Array.from({ length: 20 }, (_, index) => ({
    ts: iso((GATE_WINDOW_DAYS + 2) * DAY_MS - index * 8 * 60 * 60_000),
    equity_usd: 1_000 + index * 2, // steadily up, no drawdown
  }));
  return {
    trades: trips.flatMap((trip) => trip.trades),
    decisions: trips.flatMap((trip) => trip.decisions),
    equity_series: equity,
    wallet_provisioned: true,
    now_ms: NOW,
  };
}

describe("go-live gate", () => {
  test("GIVEN a traced, profitable window and a provisioned wallet THEN the gate opens", () => {
    const gate = evaluateGoLiveGate(passingInput());
    expect(gate.checks.map((check) => `${check.key}:${check.pass}`)).toEqual([
      "window:true",
      "traced:true",
      "performance:true",
      "drawdown:true",
      "wallet:true",
    ]);
    expect(gate.ready).toBe(true);
  });

  test("GIVEN no wallet THEN the gate stays shut even with perfect trading", () => {
    const gate = evaluateGoLiveGate({ ...passingInput(), wallet_provisioned: false });
    expect(gate.ready).toBe(false);
    expect(gate.checks.find((check) => check.key === "wallet")?.pass).toBe(false);
    expect(gate.checks.find((check) => check.key === "wallet")?.detail).toContain("not provisioned");
  });

  test("GIVEN an untraced fill THEN the traced check fails with the count", () => {
    const input = passingInput();
    input.decisions = input.decisions.slice(1); // orphan one buy
    const gate = evaluateGoLiveGate(input);
    const traced = gate.checks.find((check) => check.key === "traced");
    expect(traced?.pass).toBe(false);
    expect(traced?.detail).toContain(`${input.trades.length - 1}/${input.trades.length}`);
  });

  test("GIVEN a losing window THEN performance fails", () => {
    const input = passingInput();
    input.equity_series = input.equity_series.map((point, index) => ({ ...point, equity_usd: 1_000 - index }));
    const gate = evaluateGoLiveGate(input);
    expect(gate.checks.find((check) => check.key === "performance")?.pass).toBe(false);
    expect(gate.ready).toBe(false);
  });

  test("GIVEN a deep drawdown mid-window THEN the drawdown check fails even if the end is green", () => {
    const input = passingInput();
    const mid = Math.floor(input.equity_series.length / 2);
    input.equity_series[mid] = { ...input.equity_series[mid], equity_usd: 850 }; // ~16% off the running peak
    const gate = evaluateGoLiveGate(input);
    expect(gate.checks.find((check) => check.key === "drawdown")?.pass).toBe(false);
  });

  test("GIVEN the seeded $0 origin point THEN it never anchors the performance read", () => {
    const input = passingInput();
    // The store seeds a zero-equity chart origin; with it as the window start,
    // any live book would trivially "beat" $0. It must be ignored.
    input.equity_series = [{ ts: input.equity_series[0].ts, equity_usd: 0 }, ...input.equity_series.slice(1).map((point, index) => ({ ...point, equity_usd: 1_000 - index }))];
    const gate = evaluateGoLiveGate(input);
    const performance = gate.checks.find((check) => check.key === "performance");
    expect(performance?.pass).toBe(false);
    expect(performance?.detail).not.toContain("$0.00");
  });

  test("GIVEN a fresh book THEN every check reports an honest empty-state detail", () => {
    const gate = evaluateGoLiveGate({ trades: [], decisions: [], equity_series: [], wallet_provisioned: false, now_ms: NOW });
    expect(gate.ready).toBe(false);
    expect(gate.checks.find((check) => check.key === "traced")?.detail).toContain("no fills");
    expect(gate.checks.find((check) => check.key === "performance")?.detail).toContain("no equity marks");
  });
});

describe("live-route rehearsal parser", () => {
  const args = { symbol: "SOL", side: "buy" as const, notional_usd: 25, paper_price_usd: 100, token_decimals: 9 };

  test("GIVEN a Jupiter quote for a buy THEN the effective price and gap derive correctly", () => {
    // Spend 25 USDC (25e6 raw), receive 0.2475 SOL (raw 9dp): effective $101.0101/SOL.
    const rehearsal = parseQuoteRehearsal(
      {
        inAmount: "25000000",
        outAmount: "247500000",
        priceImpactPct: "0.0012",
        routePlan: [{ swapInfo: { label: "Orca" } }, { swapInfo: { label: "Raydium" } }],
      },
      args,
    );
    expect(rehearsal.status).toBe("quoted");
    expect(rehearsal.quoted_price_usd).toBeCloseTo(101.0101, 3);
    // Buying at $101.01 vs a $100 paper fill = live is ~1.01% WORSE (positive).
    expect(rehearsal.live_cost_vs_paper_pct).toBeCloseTo(1.0101, 3);
    expect(rehearsal.price_impact_pct).toBeCloseTo(0.12, 6);
    expect(rehearsal.route_labels).toEqual(["Orca", "Raydium"]);
    expect(describeRehearsal(rehearsal)).toContain("+1.01% vs paper");
  });

  test("GIVEN a sell quote below paper THEN the gap is positive (worse) too", () => {
    // Sell 0.25 SOL, receive 24.75 USDC: effective $99/SOL, 1% below paper.
    const rehearsal = parseQuoteRehearsal(
      { inAmount: "250000000", outAmount: "24750000", priceImpactPct: "0.001" },
      { ...args, side: "sell" },
    );
    expect(rehearsal.quoted_price_usd).toBeCloseTo(99, 6);
    expect(rehearsal.live_cost_vs_paper_pct).toBeCloseTo(1.0, 6);
  });

  test("GIVEN garbage bodies THEN the parser degrades to no-route/error without throwing", () => {
    expect(parseQuoteRehearsal(null, args).status).toBe("error");
    expect(parseQuoteRehearsal({}, args).status).toBe("no-route");
    expect(parseQuoteRehearsal({ inAmount: "0", outAmount: "5" }, args).status).toBe("no-route");
    expect(describeRehearsal(parseQuoteRehearsal({}, args))).toContain("no usable route");
  });
});

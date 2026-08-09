import { describe, expect, test } from "bun:test";

import {
  computeWalletExpectancy,
  formatSmartMoneyContext,
  gradeSignalPnl,
  scoreWalletPositions,
  selectNewSignalTrades,
  WALLET_MIN_SETTLED,
  type DataApiClosedPosition,
  type DataApiTrade,
  type WalletSignalRow,
} from "@/src/polymarket/wallets";

const BASE_TS = Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1_000);

function closed(overrides: Partial<DataApiClosedPosition> = {}): DataApiClosedPosition {
  return {
    conditionId: "0xabc",
    title: "Will the ceasefire hold through September?",
    slug: "ceasefire-september",
    avgPrice: 0.5,
    totalBought: 20,
    realizedPnl: 10,
    curPrice: 1,
    endDate: "2026-08-01T00:00:00Z",
    timestamp: BASE_TS,
    ...overrides,
  };
}

/** n settled positions with uniform per-dollar return, ordered in time. */
function settledHistory(n: number, returnPerDollar: number): DataApiClosedPosition[] {
  return Array.from({ length: n }, (_, index) => {
    const cost = 10;
    return closed({
      conditionId: `0x${index}`,
      timestamp: BASE_TS + index * 86_400,
      avgPrice: 0.5,
      totalBought: 20,
      realizedPnl: cost * returnPerDollar,
      curPrice: returnPerDollar >= 0 ? 1 : 0,
    });
  });
}

describe("scoreWalletPositions", () => {
  test("follows a persistent profitable wallet", () => {
    const score = scoreWalletPositions(settledHistory(30, 0.2));
    expect(score.follow).toBe(true);
    expect(score.settled_n).toBe(30);
    expect(score.return_per_dollar).toBeCloseTo(0.2, 4);
    expect(score.early_return).toBeGreaterThan(0);
    expect(score.late_return).toBeGreaterThan(0);
  });

  test("rejects a thin sample", () => {
    const score = scoreWalletPositions(settledHistory(WALLET_MIN_SETTLED - 1, 0.5));
    expect(score.follow).toBe(false);
    expect(score.reason).toContain("settled positions");
  });

  test("rejects a streak without persistence: profitable early, losing late", () => {
    const early = settledHistory(15, 0.6);
    const late = settledHistory(15, -0.3).map((entry, index) => ({
      ...entry,
      conditionId: `0xlate${index}`,
      timestamp: BASE_TS + (60 + index) * 86_400,
    }));
    const score = scoreWalletPositions([...early, ...late]);
    expect(score.follow).toBe(false);
    expect(score.reason).toContain("persistence");
  });

  test("rejects an overall-negative wallet", () => {
    const score = scoreWalletPositions(settledHistory(40, -0.2));
    expect(score.follow).toBe(false);
  });

  test("rejects a whale outside the copyable stake band", () => {
    const whale = settledHistory(30, 0.2).map((entry) => ({
      ...entry,
      totalBought: 40_000,
      avgPrice: 0.5,
      realizedPnl: 4_000,
    }));
    const score = scoreWalletPositions(whale);
    expect(score.follow).toBe(false);
    expect(score.reason).toContain("stake");
  });

  test("zero-cost rows are excluded rather than dividing by zero", () => {
    const score = scoreWalletPositions([
      ...settledHistory(30, 0.2),
      closed({ conditionId: "0xzero", totalBought: 0, avgPrice: 0, realizedPnl: 5 }),
    ]);
    expect(score.follow).toBe(true);
    expect(score.settled_n).toBe(30);
  });

  test("classifies the news share of settled history", () => {
    const sports = settledHistory(30, 0.2).map((entry, index) => ({
      ...entry,
      title: "Team A vs. Team B",
      slug: `nba-a-b-2026-0${(index % 9) + 1}`,
    }));
    const score = scoreWalletPositions(sports);
    expect(score.news_share).toBe(0);
  });
});

function trade(overrides: Partial<DataApiTrade> = {}): DataApiTrade {
  return {
    proxyWallet: "0xwallet",
    side: "BUY",
    asset: "token-yes",
    conditionId: "0xcond",
    size: 100,
    price: 0.4,
    timestamp: 1_000,
    title: "Will the ceasefire hold?",
    slug: "ceasefire",
    outcome: "Yes",
    ...overrides,
  };
}

describe("selectNewSignalTrades", () => {
  test("keeps only fresh, meaningful buys and dedupes to the earliest per outcome", () => {
    const trades = [
      trade({ timestamp: 900 }),
      trade({ timestamp: 1_500, size: 10, price: 0.5 }),
      trade({ timestamp: 1_400 }),
      trade({ timestamp: 1_600 }),
      trade({ timestamp: 1_450, side: "SELL" }),
      trade({ timestamp: 1_700, conditionId: "0xother" }),
    ];
    const selected = selectNewSignalTrades(trades, 1_000);
    expect(selected.map((entry) => entry.timestamp)).toEqual([1_400, 1_700]);
  });

  test("ignores sub-threshold sizes", () => {
    expect(selectNewSignalTrades([trade({ timestamp: 2_000, size: 10, price: 0.5 })], 1_000)).toHaveLength(0);
  });
});

describe("gradeSignalPnl", () => {
  test("win pays the odds implied by the entry price", () => {
    expect(gradeSignalPnl(0.25, true)).toBeCloseTo(3, 4);
    expect(gradeSignalPnl(0.25, false)).toBe(-1);
  });

  test("unusable entry prices grade to null", () => {
    expect(gradeSignalPnl(null, true)).toBeNull();
    expect(gradeSignalPnl(0, true)).toBeNull();
    expect(gradeSignalPnl(1, false)).toBeNull();
  });
});

function signal(overrides: Partial<WalletSignalRow> = {}): WalletSignalRow {
  return {
    id: "sig-1",
    detected_at: "2026-08-09T10:00:00Z",
    trade_ts: 1_754_700_000,
    wallet: "0xwallet",
    market_id: "3338689",
    condition_id: "0xcond",
    question: "Will the ceasefire hold?",
    slug: "ceasefire",
    category: "news",
    outcome_index: 1,
    outcome: "No",
    their_price: 0.3,
    their_usd: 150,
    our_ask: 0.32,
    lag_seconds: 900,
    status: "pending",
    winning_outcome_index: null,
    resolved_at: null,
    won: null,
    pnl_our_per_dollar: null,
    pnl_their_per_dollar: null,
    ...overrides,
  };
}

describe("computeWalletExpectancy", () => {
  test("averages our-price and their-price P&L over resolved signals only", () => {
    const rows = [
      signal({ status: "resolved", won: 1, pnl_our_per_dollar: 2, pnl_their_per_dollar: 2.33, lag_seconds: 600 }),
      signal({ id: "sig-2", status: "resolved", won: 0, pnl_our_per_dollar: -1, pnl_their_per_dollar: -1, lag_seconds: 1_200 }),
      signal({ id: "sig-3", status: "pending" }),
    ];
    const expectancy = computeWalletExpectancy(rows);
    expect(expectancy.resolved_n).toBe(2);
    expect(expectancy.wins).toBe(1);
    expect(expectancy.avg_pnl_our_per_dollar).toBeCloseTo(0.5, 4);
    expect(expectancy.avg_pnl_their_per_dollar).toBeCloseTo(0.665, 4);
    expect(expectancy.avg_lag_seconds).toBe(900);
  });

  test("empty input yields nulls, not zeros pretending to be evidence", () => {
    const expectancy = computeWalletExpectancy([]);
    expect(expectancy.resolved_n).toBe(0);
    expect(expectancy.avg_pnl_our_per_dollar).toBeNull();
  });
});

describe("formatSmartMoneyContext", () => {
  test("aggregates pending signals per outcome with wallet counts and sizing", () => {
    const context = formatSmartMoneyContext([
      signal(),
      signal({ id: "sig-2", wallet: "0xother", their_usd: 250, their_price: 0.34 }),
      signal({ id: "sig-3", outcome: "Yes", outcome_index: 0, their_usd: 40, their_price: 0.62 }),
      signal({ id: "sig-4", status: "resolved" }),
    ]);
    expect(context).toContain("2 wallets bought No");
    expect(context).toContain("$400");
    expect(context).toContain("1 wallet bought Yes");
  });

  test("no pending signals means no context line at all", () => {
    expect(formatSmartMoneyContext([signal({ status: "resolved" })])).toBeUndefined();
    expect(formatSmartMoneyContext([])).toBeUndefined();
  });
});

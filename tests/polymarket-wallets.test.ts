import { describe, expect, test } from "bun:test";

import {
  computeWalletEvidence,
  computeWalletExpectancy,
  formatSmartMoneyContext,
  gradeSignalPnl,
  scoreWalletPositions,
  selectNewSignalTrades,
  walletFollowDecision,
  walletFollowFeeUsd,
  walletFollowVerdict,
  pickWalletControl,
  type WalletFollowRow,
  walletFollowPnlUsd,
  walletPriceBand,
  walletSignalKind,
  WALLET_FOLLOW_MAX_OPEN,
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

describe("walletSignalKind and walletPriceBand", () => {
  test("match winners and spreads are identified from question shape", () => {
    expect(walletSignalKind("Will CF América win on 2026-08-09?", "heartbeat")).toBe("match_winner");
    expect(walletSignalKind("Will CF América win on 2026-08-09?", "news")).toBe("match_winner");
    expect(walletSignalKind("Spread: IK Sirius (-1.5)", "heartbeat")).toBe("spread");
    expect(walletSignalKind("Counter-Strike: Liquid vs Metizport", "heartbeat")).toBe("esports_crypto");
    expect(walletSignalKind("US x Iran Effective Ceasefire by August 14?", "news")).toBe("news");
  });

  test("bands split at 35, 55, and 75 cents", () => {
    expect(walletPriceBand(0.2)).toBe("<35c");
    expect(walletPriceBand(0.45)).toBe("35-55c");
    expect(walletPriceBand(0.6)).toBe("55-75c");
    expect(walletPriceBand(0.9)).toBe(">=75c");
  });
});

describe("computeWalletEvidence", () => {
  test("market-level EV weights each market once, defeating DCA clustering", () => {
    // One bot-wallet accumulates the same winning market three times (+2/$
    // each) while a different market loses once: signal-level EV is skewed
    // positive (+1.25), market-level is the honest (2 + -1) / 2 = +0.5.
    const rows = [
      signal({ id: "a1", market_id: "m1", question: "Will CF América win on 2026-08-09?", status: "resolved", won: 1, pnl_our_per_dollar: 2, our_ask: 0.4 }),
      signal({ id: "a2", market_id: "m1", question: "Will CF América win on 2026-08-09?", status: "resolved", won: 1, pnl_our_per_dollar: 2, our_ask: 0.4 }),
      signal({ id: "a3", market_id: "m1", question: "Will CF América win on 2026-08-09?", status: "resolved", won: 1, pnl_our_per_dollar: 2, our_ask: 0.4 }),
      signal({ id: "b1", market_id: "m2", question: "Will Rangers FC win on 2026-08-09?", status: "resolved", won: 0, pnl_our_per_dollar: -1, our_ask: 0.5 }),
    ];
    const evidence = computeWalletEvidence(rows);
    const all = evidence.find((cell) => cell.kind === "match_winner" && cell.band === "all");
    expect(all?.signals).toBe(4);
    expect(all?.markets).toBe(2);
    expect(all?.signal_ev_our).toBeCloseTo(1.25, 4);
    expect(all?.market_ev_our).toBeCloseTo(0.5, 4);
    const band = evidence.find((cell) => cell.kind === "match_winner" && cell.band === "35-55c");
    expect(band?.signals).toBe(4);
  });
});

describe("wallet follow arm", () => {
  test("fee model: rate × min(p, 1−p) × shares", () => {
    // $5 at 45¢ = 11.11 shares; 1000bps × 0.45 × 11.11 ≈ $0.50
    // Documented formula: shares × rate × p × (1 − p). $5 at 50¢ = 10 shares;
    // sports rate 0.05 (stored as 500 bps of the rate) → $0.125.
    expect(walletFollowFeeUsd(5, 0.5, 500)).toBeCloseTo(0.13, 2);
    expect(walletFollowFeeUsd(5, 0.45, 0)).toBe(0);
    // Unknown schedule is charged at the highest category rate, never zero.
    expect(walletFollowFeeUsd(5, 0.5, null)).toBeCloseTo(0.18, 2);
  });

  test("net P&L subtracts the fee on wins and adds it to losses", () => {
    const row = { stake_usd: 5, entry_ask: 0.5, fee_usd: 0.5 };
    expect(walletFollowPnlUsd(row, true)).toBeCloseTo(4.5, 2);
    expect(walletFollowPnlUsd(row, false)).toBeCloseTo(-5.5, 2);
  });

  test("decision enforces kind, band, dedupe, and the open cap", () => {
    const base = {
      kind: "match_winner" as const,
      ourAsk: 0.5,
      openFollowMarketIds: new Set<string>(),
      marketId: "m1",
      openCount: 0,
      enabled: true,
    };
    expect(walletFollowDecision(base)).toEqual({ follow: true });
    expect(walletFollowDecision({ ...base, enabled: false }).follow).toBe(false);
    expect(walletFollowDecision({ ...base, kind: "news" }).follow).toBe(false);
    expect(walletFollowDecision({ ...base, ourAsk: 0.2 }).follow).toBe(false);
    expect(walletFollowDecision({ ...base, ourAsk: 0.8 }).follow).toBe(false);
    expect(walletFollowDecision({ ...base, ourAsk: null }).follow).toBe(false);
    expect(walletFollowDecision({ ...base, openFollowMarketIds: new Set(["m1"]) }).follow).toBe(false);
    expect(walletFollowDecision({ ...base, openCount: WALLET_FOLLOW_MAX_OPEN }).follow).toBe(false);
  });
});

describe("wallet follow-arm v2 verdict and control", () => {
  const row = (over: Partial<WalletFollowRow>): WalletFollowRow => ({
    id: Math.random().toString(36),
    opened_at: "2026-09-05T12:00:00Z",
    signal_id: "s",
    wallet: "w1",
    market_id: "m",
    condition_id: "c",
    question: "Will Team A win on 2026-09-06?",
    slug: "team-a",
    kind: "match_winner",
    outcome_index: 0,
    outcome: "Yes",
    entry_ask: 0.5,
    stake_usd: 5,
    taker_fee_bps: 500,
    status: "resolved",
    winning_outcome_index: 0,
    resolved_at: "2026-09-06T20:00:00Z",
    won: 1,
    fee_usd: 0.13,
    pnl_usd: 4.87,
    arm: "follow",
    ...over,
  });

  function book(pairs: number, weekends: number, followWin: (index: number) => boolean, controlWin: (index: number) => boolean, walletOf = (index: number) => `w${index % 25}`) {
    const rows: WalletFollowRow[] = [];
    for (let index = 0; index < pairs; index += 1) {
      const day = new Date(Date.UTC(2026, 6, 4 + (index % weekends) * 7)).toISOString();
      const fw = followWin(index);
      const cw = controlWin(index);
      rows.push(row({ signal_id: `s${index}`, market_id: `m${index}`, wallet: walletOf(index), resolved_at: day, won: fw ? 1 : 0, pnl_usd: fw ? 4.87 : -5.13 }));
      rows.push(row({ signal_id: `s${index}`, market_id: `c${index}`, wallet: "control", arm: "control", resolved_at: day, won: cw ? 1 : 0, pnl_usd: cw ? 4.87 : -5.13 }));
    }
    return rows;
  }

  test("GIVEN fewer than 300 markets or 6 weekends THEN the verdict is insufficient, however good it looks", () => {
    const verdict = walletFollowVerdict(book(120, 8, () => true, () => false), 200);
    expect(verdict.status).toBe("insufficient");
    expect(verdict.diff_per_dollar).toBeGreaterThan(1.5);
  });

  test("GIVEN follows that only match the no-signal control THEN the verdict fails", () => {
    const verdict = walletFollowVerdict(book(320, 7, (i) => i % 2 === 0, (i) => i % 2 === 0), 200);
    expect(verdict.status).toBe("fail");
    expect(verdict.diff_per_dollar).toBeCloseTo(0, 3);
  });

  test("GIVEN follows that beat the control across many wallets THEN it passes; GIVEN the edge lives in two wallets THEN it fails", () => {
    expect(walletFollowVerdict(book(320, 7, (i) => i % 5 !== 0, (i) => i % 2 === 0), 200).status).toBe("pass");
    const concentrated = book(320, 7, (i) => (i % 25 < 2 ? true : i % 2 === 0), (i) => i % 2 === 0, (i) => (i % 25 < 2 ? `star${i % 2}` : `w${i % 25}`));
    const verdict = walletFollowVerdict(concentrated, 200);
    expect(verdict.diff_without_top_wallets).toBeLessThanOrEqual(0.01);
    expect(verdict.status).toBe("fail");
  });

  test("GIVEN candidate markets THEN the control is same-kind, in band, and never a signaled or held market", () => {
    const market = (id: string, question: string, prices: [number, number]) => ({
      id, condition_id: id, question, slug: id, end_date: null, outcomes: ["Yes", "No"], outcome_prices: prices,
      token_ids: [`${id}-y`, `${id}-n`], liquidity_usd: 50_000, volume_24h_usd: 1_000, price_change_24h: 0,
      accepting_orders: true, order_book_enabled: true, neg_risk: false, fees_enabled: false, minimum_order_size: 5,
    });
    const candidates = [
      market("signaled", "Will Team B win on 2026-09-06?", [0.52, 0.48]),
      market("news", "Will the Fed cut rates in October?", [0.5, 0.5]),
      market("far", "Will Team C win on 2026-09-06?", [0.2, 0.8]),
      market("good", "Will Team D win on 2026-09-06?", [0.61, 0.39]),
    ];
    const choice = pickWalletControl(candidates, { kind: "match_winner", targetAsk: 0.55, excludeMarketIds: new Set(["signaled"]) });
    expect(choice?.market.id).toBe("good");
    expect(choice?.outcome_index).toBe(0);
  });
});

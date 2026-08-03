import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetPolymarketBrainForTests, polymarketBrain } from "@/src/polymarket/brain";
import { parsePolymarketOrderBook, summarizePolymarketBook, type PolymarketOrderBook } from "@/src/polymarket/orderbook";
import { buildPolymarketBrainCandidates, type PolymarketBrainCandidate } from "@/src/polymarket/strategies";
import { parsePolymarketResolution, type PolymarketMarket } from "@/src/polymarket/markets";
import { parsePolymarketStreamMessage, selectPolymarketMicrostructureEvents } from "@/src/polymarket/stream";

let scratch: string | null = null;

afterEach(() => {
  __resetPolymarketBrainForTests();
  delete process.env.POLYMARKET_BRAIN_DB;
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

describe("Polymarket research brain", () => {
  test("normalizes unordered public CLOB levels into executable book metrics", () => {
    const book = parsePolymarketOrderBook({
      asset_id: "yes-token",
      market: "condition",
      timestamp: "1000",
      bids: [{ price: "0.40", size: "100" }, { price: "0.44", size: "250" }],
      asks: [{ price: "0.48", size: "80" }, { price: "0.45", size: "50" }],
      min_order_size: "5",
      tick_size: "0.01",
      neg_risk: false,
      last_trade_price: "0.44",
    });
    expect(book).not.toBeNull();
    const metrics = summarizePolymarketBook(book as PolymarketOrderBook);
    expect(metrics.best_bid).toBe(0.44);
    expect(metrics.best_ask).toBe(0.45);
    expect(metrics.midpoint).toBeCloseTo(0.445);
    expect(metrics.executable_size_usd).toBeCloseTo(22.5);
    expect(metrics.depth_imbalance).toBeGreaterThan(0);
  });

  test("accepts only decisive closed Gamma outcomes for calibration", () => {
    expect(parsePolymarketResolution({
      id: "123",
      closed: true,
      closedTime: "2026-08-02 13:13:56+00",
      outcomePrices: '["0", "1"]',
    })).toEqual({
      market_id: "123",
      status: "resolved",
      closed_at: "2026-08-02 13:13:56+00",
      winning_outcome_index: 1,
      outcome_prices: [0, 1],
    });
    expect(parsePolymarketResolution({ id: "124", closed: true, umaResolutionStatus: "resolved", outcomePrices: '["0.5", "0.5"]' })?.status).toBe("invalid");
    expect(parsePolymarketResolution({ id: "124", closed: true, umaResolutionStatus: "proposed", outcomePrices: '["0.5", "0.5"]' })).toBeNull();
    expect(parsePolymarketResolution({ id: "125", closed: false, outcomePrices: '["0", "1"]' })).toBeNull();
    expect(parsePolymarketResolution({ id: "126", closed: true, umaResolutionStatus: "resolved", outcomePrices: '["0.99", "0.01"]' })?.status).toBe("invalid");
  });

  test("normalizes public stream snapshots, changes, and heartbeats", () => {
    const snapshot = parsePolymarketStreamMessage(JSON.stringify([
      {
        event_type: "book",
        asset_id: "yes-token",
        market: "condition",
        timestamp: "1785686400000",
        bids: [{ price: "0.40", size: "25" }, { price: "0.44", size: "100" }],
        asks: [{ price: "0.50", size: "50" }, { price: "0.46", size: "30" }],
        min_order_size: "5",
        tick_size: "0.01",
        hash: "snapshot-hash",
      },
      {
        event_type: "book",
        asset_id: "no-token",
        market: "condition",
        timestamp: "1785686400000",
        bids: [{ price: "0.53", size: "20" }],
        asks: [{ price: "0.55", size: "15" }],
      },
    ]));
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.events[0]).toMatchObject({
      event_type: "book",
      token_id: "yes-token",
      best_bid: 0.44,
      best_ask: 0.46,
    });
    expect(snapshot.events[0].spread).toBeCloseTo(0.02);

    const changes = parsePolymarketStreamMessage(JSON.stringify({
      event_type: "price_change",
      market: "condition",
      timestamp: "1785686400100",
      price_changes: [
        { asset_id: "yes-token", price: "0.45", size: "0", side: "BUY", best_bid: "0.44", best_ask: "0.46" },
        { asset_id: "no-token", price: "0.54", size: "10", side: "SELL", best_bid: "0.53", best_ask: "0.55" },
      ],
    }));
    expect(changes.events).toHaveLength(2);
    expect(changes.events[0]).toMatchObject({ token_id: "yes-token", size: 0, side: "BUY" });
    const observed = new Map([["yes-token", "0.44:0.46"]]);
    expect(selectPolymarketMicrostructureEvents(changes.events, observed).map((event) => event.token_id)).toEqual(["no-token"]);
    const atTop = { ...changes.events[0], price: 0.44 };
    expect(selectPolymarketMicrostructureEvents([atTop], observed)).toHaveLength(0);
    expect(parsePolymarketStreamMessage("PONG")).toEqual({ heartbeat: true, events: [] });
  });

  test("persists bounded microstructure events and one-minute reported-side labels", () => {
    scratch = mkdtempSync(join(tmpdir(), "mastermold-poly-stream-"));
    process.env.POLYMARKET_BRAIN_DB = join(scratch, "brain.db");
    const brain = polymarketBrain();
    const tradeAt = Date.now() - 61_000;
    const trade = parsePolymarketStreamMessage(JSON.stringify({
      event_type: "last_trade_price",
      asset_id: "yes-token",
      market: "condition",
      timestamp: String(tradeAt),
      price: "0.50",
      size: "25",
      side: "BUY",
      fee_rate_bps: "0",
      transaction_hash: "trade-hash",
    }), tradeAt).events;
    expect(brain.recordStreamEvents(trade, tradeAt)).toEqual({ inserted: 1, labeled_trades: 0 });

    const quoteAt = tradeAt + 61_000;
    const quote = parsePolymarketStreamMessage(JSON.stringify({
      event_type: "best_bid_ask",
      asset_id: "yes-token",
      market: "condition",
      timestamp: String(quoteAt),
      best_bid: "0.54",
      best_ask: "0.56",
    }), quoteAt).events;
    expect(brain.recordStreamEvents(quote, quoteAt)).toEqual({ inserted: 1, labeled_trades: 1 });

    const report = brain.report();
    expect(report.stream.status).toBe("live");
    expect(report.stream.event_count_24h).toBe(2);
    expect(report.stream.trade_events_24h).toBe(1);
    expect(report.stream.labeled_trades_1m).toBe(1);
    expect(report.stream.mean_reported_side_markout_1m_bps).toBeCloseTo(1_000);
  });

  test("emits separately attributed pressure, parity, maker, and momentum hypotheses without paper authority", () => {
    const market = fixtureMarket();
    const books = new Map<string, PolymarketOrderBook>([
      ["yes-token", fixtureBook("yes-token", 0.47, 600, 0.48, 80)],
      ["no-token", fixtureBook("no-token", 0.49, 500, 0.50, 100)],
    ]);
    const candidates = buildPolymarketBrainCandidates([market], books);
    expect(candidates.some((row) => row.strategy_id === "momentum")).toBe(true);
    expect(candidates.some((row) => row.strategy_id === "book_pressure")).toBe(true);
    expect(candidates.some((row) => row.strategy_id === "binary_parity")).toBe(true);
    expect(candidates.every((row) => row.paper_eligible === false)).toBe(true);

    const makerBooks = new Map<string, PolymarketOrderBook>([
      ["yes-token", fixtureBook("yes-token", 0.40, 500, 0.43, 500)],
      ["no-token", fixtureBook("no-token", 0.55, 500, 0.58, 500)],
    ]);
    expect(buildPolymarketBrainCandidates([market], makerBooks).some((row) => row.strategy_id === "maker_spread")).toBe(true);
  });

  test("persists deduplicated observations and labels later executable bids", () => {
    scratch = mkdtempSync(join(tmpdir(), "mastermold-poly-brain-"));
    process.env.POLYMARKET_BRAIN_DB = join(scratch, "brain.db");
    const brain = polymarketBrain();
    const candidate = fixtureCandidate();
    const now = Date.UTC(2026, 7, 2, 12, 0, 0);
    brain.recordCycle({ source: "test", markets: [fixtureMarket()], candidates: [candidate], now_ms: now });
    brain.recordCycle({ source: "test", markets: [fixtureMarket()], candidates: [candidate], now_ms: now + 30_000 });
    expect(brain.report().observations).toBe(1);

    const future = new Map([["yes-token", fixtureBook("yes-token", 0.55, 100, 0.56, 100)]]);
    expect(brain.labelDue(future, now + 61 * 60_000)).toBe(1);
    const report = brain.report();
    expect(report.labeled_1h).toBe(1);
    expect(report.strategies[0].mean_1h_bps).toBeGreaterThan(0);
    expect(report.strategies[0].paper_candidate).toBe(false);
  });

  test("grades selected probabilities against final outcomes without treating invalid markets as evidence", () => {
    scratch = mkdtempSync(join(tmpdir(), "mastermold-poly-resolution-"));
    process.env.POLYMARKET_BRAIN_DB = join(scratch, "brain.db");
    const brain = polymarketBrain();
    const now = Date.UTC(2026, 7, 2, 12, 0, 0);
    brain.recordCycle({ source: "test", markets: [fixtureMarket()], candidates: [fixtureCandidate()], now_ms: now });

    const summary = brain.applyResolutionChecks(["market-1"], new Map([["market-1", {
      market_id: "market-1",
      status: "resolved" as const,
      closed_at: "2026-09-01T01:00:00Z",
      winning_outcome_index: 0,
      outcome_prices: [1, 0],
    }]]), now + 30 * 86_400_000);
    expect(summary).toEqual({ resolved_markets: 1, invalid_markets: 0, graded_observations: 1 });
    const report = brain.report();
    expect(report.calibration.resolved_observations).toBe(1);
    expect(report.calibration.resolved_markets).toBe(1);
    expect(report.calibration.mean_brier_score).toBeCloseTo((0.47 - 1) ** 2);
    expect(report.strategies[0].resolved_labels).toBe(1);
    expect(report.strategies[0].mean_brier_score).toBeCloseTo((0.47 - 1) ** 2);

    brain.recordCycle({
      source: "test",
      markets: [{ ...fixtureMarket(), id: "invalid-market" }],
      candidates: [{ ...fixtureCandidate(), id: "momentum:invalid-market:0", market_id: "invalid-market" }],
      now_ms: now + 1,
    });
    brain.applyResolutionChecks(["invalid-market"], new Map([["invalid-market", {
      market_id: "invalid-market",
      status: "invalid" as const,
      closed_at: "2026-09-01T01:00:00Z",
      winning_outcome_index: null,
      outcome_prices: [0.5, 0.5],
    }]]), now + 30 * 86_400_000);
    expect(brain.report().calibration.invalid_markets).toBe(1);
    expect(brain.report().calibration.resolved_observations).toBe(1);
  });
});

function fixtureMarket(): PolymarketMarket {
  return {
    id: "market-1",
    condition_id: "condition",
    question: "Will the research fixture resolve Yes?",
    slug: "research-fixture",
    end_date: "2026-09-01T00:00:00Z",
    outcomes: ["Yes", "No"],
    outcome_prices: [0.48, 0.52],
    token_ids: ["yes-token", "no-token"],
    liquidity_usd: 100_000,
    volume_24h_usd: 50_000,
    price_change_24h: 0.05,
    accepting_orders: true,
    order_book_enabled: true,
    neg_risk: false,
    fees_enabled: false,
    minimum_order_size: 5,
  };
}

function fixtureBook(token_id: string, bid: number, bidSize: number, ask: number, askSize: number): PolymarketOrderBook {
  return {
    token_id,
    condition_id: "condition",
    timestamp_ms: 1,
    bids: [{ price: bid, size: bidSize }],
    asks: [{ price: ask, size: askSize }],
    tick_size: 0.01,
    minimum_order_size: 5,
    neg_risk: false,
    last_trade_price: bid,
  };
}

function fixtureCandidate(): PolymarketBrainCandidate {
  return {
    id: "momentum:market-1:0",
    strategy_id: "momentum",
    label_kind: "markout",
    market_id: "market-1",
    token_id: "yes-token",
    outcome_index: 0,
    question: "Will the research fixture resolve Yes?",
    slug: "research-fixture",
    outcome: "Yes",
    market_price: 0.47,
    executable_entry_price: 0.48,
    best_bid: 0.47,
    best_ask: 0.48,
    midpoint: 0.475,
    spread_bps: 210.53,
    bid_depth_shares: 600,
    ask_depth_shares: 80,
    depth_imbalance: 0.76,
    executable_size_usd: 38.4,
    move_24h: 0.05,
    score: 80,
    paper_eligible: false,
    thesis: "fixture",
  };
}

/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { polymarketControlAccess, POST } from "@/app/api/polymarket/route";
import { buildPolymarketWatchSignals, MIN_POLYMARKET_ENTRY_HORIZON_MS, type PolymarketMarket } from "@/src/polymarket/markets";
import { settleResolvedPolymarketPaperPositions } from "@/src/polymarket/engine";
import { validatePolymarketPaperEntry } from "@/src/polymarket/policy";
import { __resetPolymarketStoreForTests, polymarketStore } from "@/src/polymarket/store";

function market(overrides: Partial<PolymarketMarket> = {}): PolymarketMarket {
  return {
    id: "market-1",
    condition_id: "condition-1",
    question: "Will the test event happen?",
    slug: "will-the-test-event-happen",
    end_date: "2026-12-31T00:00:00Z",
    outcomes: ["Yes", "No"],
    outcome_prices: [0.6, 0.4],
    token_ids: ["yes-token", "no-token"],
    liquidity_usd: 100_000,
    volume_24h_usd: 50_000,
    price_change_24h: 0.05,
    accepting_orders: true,
    order_book_enabled: true,
    neg_risk: false,
    fees_enabled: false,
    minimum_order_size: 5,
    ...overrides,
  };
}

let previousDb: string | undefined;

beforeEach(() => {
  previousDb = process.env.POLYMARKET_DB;
  process.env.POLYMARKET_DB = join(mkdtempSync(join(tmpdir(), "mm-polymarket-")), "polymarket.db.json");
  __resetPolymarketStoreForTests();
});

afterEach(() => {
  if (previousDb === undefined) delete process.env.POLYMARKET_DB;
  else process.env.POLYMARKET_DB = previousDb;
  __resetPolymarketStoreForTests();
});

describe("Polymarket watch and risk lane", () => {
  test("ranks only liquid fee-free binary momentum setups", () => {
    const signals = buildPolymarketWatchSignals([
      market(),
      market({ id: "fee-market", fees_enabled: true }),
      market({ id: "quiet-market", price_change_24h: 0.01 }),
      market({ id: "thin-market", liquidity_usd: 1_000 }),
    ]);

    expect(signals).toHaveLength(1);
    expect(signals[0].market_id).toBe("market-1");
    expect(signals[0].outcome).toBe("Yes");
    expect(signals[0].thesis).toContain("not a fair-value estimate");
  });

  test("excludes expired, undated, and near-resolution markets from new entries", () => {
    const now = Date.parse("2026-08-02T12:00:00Z");
    const signals = buildPolymarketWatchSignals([
      market({ id: "expired", end_date: new Date(now - 1).toISOString() }),
      market({ id: "undated", end_date: null }),
      market({ id: "too-close", end_date: new Date(now + MIN_POLYMARKET_ENTRY_HORIZON_MS - 1).toISOString() }),
      market({ id: "eligible", end_date: new Date(now + MIN_POLYMARKET_ENTRY_HORIZON_MS).toISOString() }),
    ], now);

    expect(signals.map((signal) => signal.market_id)).toEqual(["eligible"]);
  });

  test("paper policy enforces mode, caps, loss stop, and duplicate positions", () => {
    const store = polymarketStore();
    const state = store.state();
    const base = {
      state,
      positions: [],
      market_id: "market-1",
      outcome_index: 0,
      stake_usd: 5,
      entry_price: 0.6,
      available_cash_usd: 500,
      realized_today_usd: 0,
    };

    expect(validatePolymarketPaperEntry(base).ok).toBe(false);
    store.setMode("paper");
    expect(validatePolymarketPaperEntry({ ...base, state: store.state() }).ok).toBe(true);
    expect(validatePolymarketPaperEntry({ ...base, state: store.state(), stake_usd: 21 }).ok).toBe(false);
    expect(validatePolymarketPaperEntry({ ...base, state: store.state(), realized_today_usd: -50 }).ok).toBe(false);
  });

  test("kill switch persists and release returns to off", () => {
    const store = polymarketStore();
    store.setMode("paper");
    store.setKillSwitch(true);
    expect(store.state().mode).toBe("halted");
    expect(store.state().kill_switch).toBe(true);

    __resetPolymarketStoreForTests();
    expect(polymarketStore().state().mode).toBe("halted");
    polymarketStore().setKillSwitch(false);
    expect(polymarketStore().state().mode).toBe("off");
  });

  test("settles resolved paper positions even after their order books disappear", () => {
    const store = polymarketStore();
    for (const outcomeIndex of [0, 1]) {
      store.openPosition({
        market_id: "resolved-market",
        token_id: outcomeIndex === 0 ? "yes-token" : "no-token",
        question: "Did the event resolve?",
        slug: "did-the-event-resolve",
        outcome_index: outcomeIndex,
        outcome: outcomeIndex === 0 ? "Yes" : "No",
        stake_usd: 5,
        entry_price: 0.5,
        thesis: "Resolution settlement test",
      });
    }

    const settled = settleResolvedPolymarketPaperPositions([{
      market_id: "resolved-market",
      status: "resolved",
      closed_at: "2026-08-02T12:00:00Z",
      winning_outcome_index: 0,
      outcome_prices: [1, 0],
    }]);

    expect(settled).toBe(2);
    expect(store.positions()).toHaveLength(0);
    const closes = store.trades().filter((trade) => trade.action === "close");
    expect(closes).toHaveLength(2);
    expect(closes.find((trade) => trade.outcome === "Yes")?.price).toBe(1);
    expect(closes.find((trade) => trade.outcome === "No")?.price).toBe(0);
  });

  test("local controls reject remote origins and live mode", async () => {
    expect(polymarketControlAccess(new Request("http://localhost:4002/api/polymarket", {
      headers: { host: "localhost:4002" },
    }))).toBe(true);
    expect(polymarketControlAccess(new Request("http://100.64.0.20:4002/api/polymarket", {
      headers: { host: "100.64.0.20:4002" },
    }))).toBe(false);
    expect(polymarketControlAccess(new Request("http://localhost:4002/api/polymarket", {
      headers: { host: "100.64.0.20:4002" },
    }))).toBe(false);

    const remote = await POST(new Request("http://localhost/api/polymarket", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ action: "set_mode", mode: "paper" }),
    }));
    expect(remote.status).toBe(403);

    const unpromotedPaper = await POST(new Request("http://localhost/api/polymarket", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ action: "set_mode", mode: "paper" }),
    }));
    expect(unpromotedPaper.status).toBe(409);

    const live = await POST(new Request("http://localhost/api/polymarket", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ action: "set_mode", mode: "live" }),
    }));
    expect(live.status).toBe(409);
  });
});

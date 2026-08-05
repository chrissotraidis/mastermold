/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import { evaluatePolymarketPaperAuthority } from "@/src/polymarket/authority";
import type { PolymarketBrainReport } from "@/src/polymarket/brain";
import { POLYMARKET_PAPER_CONTRACT, POLYMARKET_STRATEGY_CATALOG } from "@/src/polymarket/catalog";
import { quotePolymarketPaperBuy, quotePolymarketPaperSell, type PolymarketOrderBook } from "@/src/polymarket/orderbook";
import { bucketContains, parseWeatherEvent } from "@/src/polymarket/weather";

describe("Polymarket hardening contracts", () => {
  test("walks displayed depth for paper buys and sells and fails closed on insufficient depth", () => {
    const book = fixtureBook();
    const buy = quotePolymarketPaperBuy(book, 5);
    expect(buy).not.toBeNull();
    expect(buy?.levels_used).toBe(2);
    expect(buy?.shares).toBeCloseTo(5 + 2.5 / 0.55);
    expect(buy?.average_price).toBeCloseTo(5 / (5 + 2.5 / 0.55));

    const sell = quotePolymarketPaperSell(book, 8);
    expect(sell?.levels_used).toBe(2);
    expect(sell?.notional_usd).toBeCloseTo(5 * 0.48 + 3 * 0.46);
    expect(quotePolymarketPaperBuy(book, 500)).toBeNull();
    expect(quotePolymarketPaperSell(book, 500)).toBeNull();
    expect(quotePolymarketPaperBuy(undefined, 5)).toBeNull();
  });

  test("keeps momentum shadow-only until its evidence gate passes", () => {
    expect(POLYMARKET_PAPER_CONTRACT.strategy_id).toBe("momentum");
    expect(POLYMARKET_PAPER_CONTRACT.live_authority).toBe(false);
    expect(POLYMARKET_STRATEGY_CATALOG.filter((strategy) => strategy.authority === "paper")).toEqual([]);
    expect(POLYMARKET_STRATEGY_CATALOG.find((strategy) => strategy.id === "weather")?.authority).toBe("observe");
    expect(POLYMARKET_STRATEGY_CATALOG.find((strategy) => strategy.id === "copy_trading")?.authority).toBe("missing");

    const report = {
      strategies: [{
        strategy_id: "momentum",
        observations: 200,
        labels_15m: 180,
        labels_1h: 150,
        labels_4h: 100,
        mean_1h_bps: -330,
        hit_rate_1h: 0.03,
        resolved_labels: 0,
        mean_brier_score: null,
        paper_candidate: false,
        promotion_detail: "150/100 labels; mean -330bp; hit 3%.",
      }],
    } as unknown as PolymarketBrainReport;
    expect(evaluatePolymarketPaperAuthority(report, {}).available).toBe(false);
    const passing = {
      ...report,
      strategies: [{ ...report.strategies[0], mean_1h_bps: 25, hit_rate_1h: 0.56, paper_candidate: true }],
    };
    expect(evaluatePolymarketPaperAuthority(passing, {}).available).toBe(true);
  });

  test("audits only station-specific whole-degree temperature events", () => {
    const event = parseWeatherEvent({
      id: "weather-1",
      title: "Highest temperature in Munich on August 3?",
      slug: "highest-temperature-in-munich-on-august-3",
      endDate: "2026-08-03T12:00:00Z",
      resolutionSource: "https://www.wunderground.com/history/daily/de/munich/EDDM",
      description: "This resolves from the station and measures temperatures to whole degrees Celsius.",
      markets: [
        { id: "low", groupItemTitle: "30°C or below", outcomePrices: '["0.25","0.75"]', liquidityNum: 100, feesEnabled: true },
        { id: "exact", groupItemTitle: "31°C", outcomePrices: '["0.50","0.50"]', liquidityNum: 200, feesEnabled: true },
        { id: "high", groupItemTitle: "32°C or higher", outcomePrices: '["0.25","0.75"]', liquidityNum: 300, feesEnabled: true },
      ],
    });
    expect(event).not.toBeNull();
    expect(event?.station_code).toBe("EDDM");
    expect(event?.rules_status).toBe("auditable");
    expect(event?.fees_enabled).toBe(true);
    expect(event?.liquidity_usd).toBe(600);
    expect(event?.forecast_status).toBe("not-attempted");

    expect(bucketContains("30°C or below", 30.4)).toBe(true);
    expect(bucketContains("31°C", 30.6)).toBe(true);
    expect(bucketContains("32°C or higher", 31.6)).toBe(true);
    expect(parseWeatherEvent({ ...event, id: "bad" })).toBeNull();
  });
});

function fixtureBook(): PolymarketOrderBook {
  return {
    token_id: "yes-token",
    condition_id: "condition",
    timestamp_ms: Date.now(),
    bids: [{ price: 0.48, size: 5 }, { price: 0.46, size: 10 }],
    asks: [{ price: 0.50, size: 5 }, { price: 0.55, size: 10 }],
    tick_size: 0.01,
    minimum_order_size: 5,
    neg_risk: false,
    last_trade_price: 0.49,
  };
}

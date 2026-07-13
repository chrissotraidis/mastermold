/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { coinbaseChunks, fetchCoinbaseSeries, parseCoinbaseCandles, parseGeckoTerminalCandles, parseKrakenCandles } from "../src/autopilot/v3/replay/data";
import { runReplay } from "../src/autopilot/v3/replay/engine";
import { replayReportMarkdown } from "../src/autopilot/v3/replay/report";
import { runQuarterlyWalkForward, validateParameterSchedule } from "../src/autopilot/v3/replay/walk-forward";
import type { ReplayBar, ReplayConfig, ReplaySeries } from "../src/autopilot/v3/replay/types";

const zeroCost = { dex_fee_bps: 0, price_impact_bps: 0, spread_bps: 0, slippage_bps: 0, priority_fee_bps: 0, failed_tx_bps: 0, total_bps: 0 };
const config: ReplayConfig = { module: "cusum_tb", cost: zeroCost, liquidity_usd: 10_000_000, cusum_edge_ratio: 0.15, bar_portion_edge_ratio: 0.25, bp_overlay: true };

function goldenSeries(): ReplaySeries {
  const start = Date.UTC(2025, 0, 1);
  const bars: ReplayBar[] = Array.from({ length: 300 }, (_, index) => ({ ts_ms: start + index * 300_000, o: 100, h: 100.1, l: 99.9, c: 100, volume: 1_000 }));
  bars.push({ ts_ms: start + 300 * 300_000, o: 100, h: 106, l: 100, c: 106, volume: 2_000 });
  bars.push({ ts_ms: start + 301 * 300_000, o: 106, h: 119, l: 105, c: 118, volume: 2_000 });
  // The close creates the second CUSUM event. Its next bar touches both
  // symmetric barriers, so the golden outcome must take the stop.
  bars.push({ ts_ms: start + 302 * 300_000, o: 118, h: 132, l: 104, c: 106, volume: 2_000 });
  return { symbol: "SOL-USD", source: "fixture", granularity_sec: 300, bars };
}

describe("production replay engine", () => {
  test("golden fixture has exact trade and P&L", () => {
    const result = runReplay([goldenSeries()], config);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0].entry_price).toBe(106);
    expect(result.trades[0].exit_reason).toBe("take_profit");
    expect(result.trades[0].net_bps).toBe(1100);
    expect(result.trades[1].entry_price).toBe(118);
    expect(result.trades[1].exit_reason).toBe("stop_same_bar_tie");
    expect(result.trades[1].net_bps).toBe(-1100);
    expect(result.metrics.mean_net_bps).toBe(0);
  });

  test("same-bar target/stop ambiguity always loses pessimistically", () => {
    const result = runReplay([goldenSeries()], config);
    expect(result.trades[1].exit_reason).toBe("stop_same_bar_tie");
    expect(result.trades[1].net_bps).toBe(-1100);
  });

  test("same inputs and explicit report date are byte-identical and always include 2x cost", () => {
    const first = runReplay([goldenSeries()], config);
    const second = runReplay([goldenSeries()], config);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const reportA = replayReportMarkdown(first, second, "2026-07-12");
    const reportB = replayReportMarkdown(first, second, "2026-07-12");
    expect(reportA).toBe(reportB);
    expect(reportA).toContain("2× cost");
  });

  test("future-referencing configuration throws before evaluation", () => {
    const effective = Date.UTC(2025, 0, 1);
    expect(() => validateParameterSchedule([{ effective_from_ms: effective, trained_through_ms: effective, params: {} }])).toThrow("Future-referencing");
    expect(() => runQuarterlyWalkForward([goldenSeries()], config, [{ effective_from_ms: effective, trained_through_ms: effective - 1, params: {} }])).not.toThrow();
  });
});

describe("replay source parsers", () => {
  test("normalizes Coinbase's reverse [time,low,high,open,close,volume] rows", () => {
    expect(parseCoinbaseCandles([[2, 9, 12, 10, 11, 5], [1, 8, 11, 9, 10, 4]])).toEqual([
      { ts_ms: 1000, o: 9, h: 11, l: 8, c: 10, volume: 4 },
      { ts_ms: 2000, o: 10, h: 12, l: 9, c: 11, volume: 5 },
    ]);
  });

  test("parses Kraken and GeckoTerminal shapes", () => {
    expect(parseKrakenCandles({ result: { XXBTZUSD: [[1, "10", "12", "9", "11", "10.5", "5", 2]], last: 2 } })[0].c).toBe(11);
    expect(parseGeckoTerminalCandles({ data: { attributes: { ohlcv_list: [[1, 10, 12, 9, 11, 5]] } } })[0].c).toBe(11);
  });

  test("fixture-backed Coinbase fetch stays keyless and respects the 300-bucket ceiling", async () => {
    const seen: URL[] = [];
    const series = await fetchCoinbaseSeries("SOL-USD", 0, 600_000, 300, async (input) => {
      seen.push(new URL(String(input)));
      return new Response(JSON.stringify([[300, 9, 12, 10, 11, 5], [0, 8, 11, 9, 10, 4]]));
    });
    expect(series.bars).toHaveLength(2);
    expect(seen[0].hostname).toBe("api.exchange.coinbase.com");
    expect(seen[0].searchParams.get("granularity")).toBe("300");
    const chunks = coinbaseChunks(0, 300 * 1_000 * 600, 300);
    expect(Math.max(...chunks.map((chunk) => (chunk.to_ms - chunk.from_ms) / 300_000 + 1))).toBeLessThanOrEqual(300);
  });
});

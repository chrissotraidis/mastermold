/// <reference types="bun" />
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCexGapScout } from "../src/autopilot/daemon";
import { __resetAutopilotStoreForTests, autopilotStore } from "../src/autopilot/store";
import type { ExecutionQuote } from "../src/autopilot/v3/execution-cost";

let previous: string | undefined;
beforeEach(() => { previous = process.env.AUTOPILOT_DB; process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-cex-scout-")), "autopilot.db.json"); __resetAutopilotStoreForTests(); });
afterEach(() => { if (previous === undefined) delete process.env.AUTOPILOT_DB; else process.env.AUTOPILOT_DB = previous; __resetAutopilotStoreForTests(); });

test("fire-and-forget scout shell persists both directions for listed venues", async () => {
  const store = autopilotStore(); const mint = "So11111111111111111111111111111111111111112";
  const cost = { dex_fee_bps: 5, price_impact_bps: 5, spread_bps: 5, slippage_bps: 5, priority_fee_bps: 0, failed_tx_bps: 0, total_bps: 20 };
  const quote = async (_mint: string, side: "buy" | "sell"): Promise<ExecutionQuote> => ({ mint, side, price_usd: side === "buy" ? 100 : 100.5, fee_usd: 0, qty: 2, value_usd: 200, quote_ts_ms: 1, cost });
  const written = await runCexGapScout({
    store, universe: [{ symbol: "SOL", mint, tier: "A" }], prices: new Map([[mint, 100]]), now_ms: Date.parse("2026-07-12T00:00:00Z"), quote,
    probe: async (symbol, venue) => ({ pair: venue === "coinbase" ? `${symbol}-USD` : `${symbol}USD`, listed: true }),
    coinbaseTicker: async () => ({ listed: true, book: { bid: 101, ask: 101.2 } }),
    krakenTickers: async (pairs) => new Map(pairs.map((pair) => [pair, { bid: 101, ask: 101.2 }])),
  });
  expect(written).toBe(4); expect(store.cexGapObservations()).toHaveLength(4); expect(Object.keys(store.cexListings())).toHaveLength(2);
  __resetAutopilotStoreForTests(); expect(autopilotStore().cexGapObservations()).toHaveLength(4);
});

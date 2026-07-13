/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { aggregateCexGapWeeks, CEX_FEE_CONFIG, cexGapObservations, describeCexGapSummary, summarizeCexGaps, type CexGapObservation } from "../src/autopilot/v3/cex-gap";

describe("CEX gap scout pure evidence", () => {
  test("both directions and the full fee stack are exact", () => {
    const rows = cexGapObservations({ ts: "2026-07-12T00:00:00Z", symbol: "SOL", venue: "coinbase", pair: "SOL-USD", book: { bid: 102, ask: 103 }, jup_buy_eff: 100, jup_sell_eff: 105, jup_buy_cost_bps: 20, jup_sell_cost_bps: 20 });
    expect(rows.map((row) => [row.direction, row.gap_bps, row.net_bps])).toEqual([
      ["buy_dex_sell_cex", 200, 110], ["buy_cex_sell_dex", 194.17, 104.17],
    ]);
    expect(CEX_FEE_CONFIG.coinbase).toMatchObject({ taker_fee_bps: 60, verified_on: "2026-07-12" });
  });
  test("invalid/crossed books fail closed", () => expect(cexGapObservations({ ts: "x", symbol: "S", venue: "kraken", pair: "SUSD", book: { bid: 2, ask: 1 }, jup_buy_eff: 1, jup_sell_eff: 1, jup_buy_cost_bps: 1, jup_sell_cost_bps: 1 })).toEqual([]));
  test("graduation is strict >25bp in 2% across three consecutive weeks", () => {
    const rows: CexGapObservation[] = [];
    for (let week = 0; week < 3; week += 1) for (let index = 0; index < 50; index += 1) rows.push({
      ts: new Date(Date.UTC(2026, 0, 5 + week * 7, 0, index)).toISOString(), symbol: "SOL", venue: "kraken", pair: "SOLUSD",
      direction: "buy_dex_sell_cex", gap_bps: 120, net_bps: index === 0 ? 25.01 : -2, jup_cost_bps: 20, cex_mid: 100, jup_eff: 99,
      cex_taker_fee_bps: 80, fee_verified_on: "2026-07-12",
    });
    const summary = summarizeCexGaps(rows);
    expect(summary).toMatchObject({ graduated: true, cadence: "graduated" });
    expect(describeCexGapSummary(summary)).toContain("SOL/kraken: n=150");
    rows[0].net_bps = 25;
    expect(summarizeCexGaps(rows).graduated).toBe(false);
  });

  test("durable completed-week aggregates preserve graduation after raw rows rotate", () => {
    const historical: CexGapObservation[] = [];
    for (let week = 0; week < 3; week += 1) for (let index = 0; index < 50; index += 1) historical.push({
      ts: new Date(Date.UTC(2026, 0, 5 + week * 7, 0, index)).toISOString(), symbol: "SOL", venue: "coinbase", pair: "SOL-USD",
      direction: "buy_dex_sell_cex", gap_bps: 100, net_bps: index === 0 ? 26 : -2, jup_cost_bps: 20,
      cex_mid: 100, jup_eff: 99, cex_taker_fee_bps: 60, fee_verified_on: "2026-07-12",
    });
    const durable = aggregateCexGapWeeks(historical);
    const recentRaw = historical.slice(-5);
    const summary = summarizeCexGaps(recentRaw, durable, Date.parse("2026-02-01T00:00:00Z"));
    expect(summary).toMatchObject({ graduated: true, cadence: "graduated" });
    expect(summary.groups[0]).toMatchObject({ observations: 150, weeks_observed: 3 });
  });
});

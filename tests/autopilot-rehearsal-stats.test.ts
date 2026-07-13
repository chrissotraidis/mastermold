/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { medianRoundTripCostPct, p95CostPct } from "../src/autopilot/rehearsal-stats";
import { rehearsalRowFromSwap } from "../src/autopilot/rehearsal";
import {
  __resetAutopilotStoreForTests,
  autopilotStore,
  type RehearsalRow,
} from "../src/autopilot/store";

const SOL = "So11111111111111111111111111111111111111112";
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

let previousDb: string | undefined;

beforeEach(() => {
  previousDb = process.env.AUTOPILOT_DB;
  process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-rehearsals-")), "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (previousDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = previousDb;
  __resetAutopilotStoreForTests();
});

function row(
  id: string,
  mint: string,
  cost: number | null,
  minute: number,
  status: RehearsalRow["status"] = "quoted",
): RehearsalRow {
  return {
    id,
    ts: new Date(Date.UTC(2026, 6, 12, 0, minute)).toISOString(),
    mint,
    symbol: mint === SOL ? "SOL" : "JUP",
    side: "buy",
    notional_usd: 25,
    live_cost_vs_paper_pct: cost,
    reference_basis: "flat_fallback",
    price_impact_pct: cost,
    status,
  };
}

describe("structured rehearsal store", () => {
  test("GIVEN a parsed swap rehearsal THEN every structured numeric field maps without free text", () => {
    expect(rehearsalRowFromSwap(SOL, {
      symbol: "SOL",
      side: "buy",
      notional_usd: 25,
      paper_price_usd: 150,
      quoted_price_usd: 150.3,
      live_cost_vs_paper_pct: 0.2,
      price_impact_pct: 0.04,
      route_labels: ["Orca"],
      status: "quoted",
      detail: "route quoted via Orca",
    })).toEqual({
      mint: SOL,
      symbol: "SOL",
      side: "buy",
      notional_usd: 25,
      live_cost_vs_paper_pct: 0.2,
      reference_basis: "flat_fallback",
      price_impact_pct: 0.04,
      status: "quoted",
    });
  });

  test("GIVEN quoted-fill self-comparisons THEN they cannot collapse measured slippage to zero", () => {
    const selfComparisons = Array.from({ length: 12 }, (_, index) => ({
      ...row(`self-${index}`, SOL, 0, index),
      reference_basis: "quoted_fill" as const,
    }));
    const legacyUnknown = Array.from({ length: 12 }, (_, index) => {
      const { reference_basis: _basis, ...legacy } = row(`legacy-${index}`, SOL, 0, index + 20);
      return legacy as RehearsalRow;
    });
    expect(medianRoundTripCostPct(selfComparisons, SOL)).toBeNull();
    expect(p95CostPct(selfComparisons, SOL)).toBeNull();
    expect(p95CostPct(legacyUnknown, SOL)).toBeNull();
  });

  test("GIVEN rows WHEN appended THEN newest-first reads survive a restart", () => {
    const store = autopilotStore();
    store.appendRehearsal({
      ts: "2026-07-12T00:00:00.000Z",
      mint: SOL,
      symbol: "SOL",
      side: "buy",
      notional_usd: 25,
      live_cost_vs_paper_pct: 0.18,
      price_impact_pct: 0.04,
      status: "quoted",
    });
    store.appendRehearsal({
      ts: "2026-07-12T00:01:00.000Z",
      mint: SOL,
      symbol: "SOL",
      side: "sell",
      notional_usd: 24.5,
      live_cost_vs_paper_pct: null,
      price_impact_pct: null,
      status: "no-route",
    });

    __resetAutopilotStoreForTests();
    const rows = autopilotStore().rehearsals();
    expect(rows).toHaveLength(2);
    expect(rows.map((item) => item.status)).toEqual(["no-route", "quoted"]);
    expect(rows[1].live_cost_vs_paper_pct).toBe(0.18);
  });

  test("GIVEN more than 2000 rows THEN the rolling cap keeps the newest evidence", () => {
    const store = autopilotStore();
    for (let index = 0; index < 2_001; index += 1) {
      store.appendRehearsal({
        ts: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        mint: SOL,
        symbol: "SOL",
        side: "buy",
        notional_usd: 25,
        live_cost_vs_paper_pct: index,
        price_impact_pct: 0,
        status: "quoted",
      });
    }
    const rows = store.rehearsals(3_000);
    expect(rows).toHaveLength(2_000);
    expect(rows[0].live_cost_vs_paper_pct).toBe(2_000);
    expect(rows.at(-1)?.live_cost_vs_paper_pct).toBe(1);
  });
});

describe("rehearsal cost statistics", () => {
  test("median is per-mint, quoted-only, finite-only, and requires the sample floor", () => {
    const rows = [
      row("a", SOL, 0.1, 1),
      row("b", SOL, 0.3, 2),
      row("c", SOL, 99, 3, "error"),
      row("d", SOL, null, 4),
      row("e", JUP, 88, 5),
    ];
    expect(medianRoundTripCostPct(rows, SOL)).toBeNull();
    expect(medianRoundTripCostPct(rows, SOL, 2)).toBeCloseTo(0.2, 8);
  });

  test("statistics use only the latest 50 rows and nearest-rank p95", () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      row(`r${index}`, SOL, index === 0 ? 999 : index, index),
    ).reverse();
    expect(medianRoundTripCostPct(rows, SOL, 1)).toBe(25.5);
    expect(p95CostPct(rows, SOL, 1)).toBe(48);
  });
});

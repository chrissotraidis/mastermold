/// <reference types="bun" />

/**
 * V3 candidate/feature store (V3 plan §P1): the training substrate that records
 * EVERY evaluated candidate — entered and skipped — with features, cost, and
 * (later) forward-outcome labels. Proves append/read round-trips a restart, the
 * unlabeled work-queue filters by age + labeled, labeling persists, the rolling
 * cap holds, and the pure forward-label math (incl. excursions) is right.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetAutopilotStoreForTests, autopilotStore } from "../src/autopilot/store";
import {
  computeForwardLabels,
  type CandidateSnapshotInput,
  type PriceObservation,
} from "../src/autopilot/v3/candidate-store";

const NOW = Date.parse("2026-07-05T12:00:00Z");

let prevDb: string | undefined;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  process.env.AUTOPILOT_DB = join(mkdtempSync(join(tmpdir(), "mm-v3-candidate-")), "autopilot.db.json");
  __resetAutopilotStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  __resetAutopilotStoreForTests();
});

function enterInput(over: Partial<CandidateSnapshotInput> = {}): CandidateSnapshotInput {
  return {
    strategy_id: "xsec",
    token_mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    decision: "enter",
    features: { score: 1.6, r_1h_pct: 2.4, volume_z_1h: 1.1 },
    cost_total_bps: 90,
    expected_value_bps: 30,
    confidence: 0.62,
    price_usd_at_snapshot: 100,
    ...over,
  };
}

describe("candidate snapshot store", () => {
  test("GIVEN entered + skipped candidates THEN append/read round-trips through a restart", () => {
    const store = autopilotStore();
    const entered = store.appendCandidateSnapshot(enterInput({ ts: new Date(NOW).toISOString() }));
    store.appendCandidateSnapshot(
      enterInput({
        ts: new Date(NOW + 1000).toISOString(),
        symbol: "JUP",
        token_mint: "m2",
        decision: "skip",
        skip_reason: "EV below floor after cost",
        expected_value_bps: -12,
      }),
    );

    expect(entered.id.startsWith("cnd_")).toBe(true);
    expect(entered.labeled).toBe(false);
    expect(entered.return_2h_bps).toBeNull();

    // Reopen the db file (simulate a process restart).
    __resetAutopilotStoreForTests();
    const rows = autopilotStore().candidateSnapshots();
    expect(rows).toHaveLength(2);
    // Newest first.
    expect(rows[0].symbol).toBe("JUP");
    expect(rows[0].decision).toBe("skip");
    expect(rows[0].skip_reason).toBe("EV below floor after cost");
    const solRow = rows.find((r) => r.symbol === "SOL")!;
    expect(solRow.features).toEqual({ score: 1.6, r_1h_pct: 2.4, volume_z_1h: 1.1 });
    expect(solRow.decision).toBe("enter");
    expect(solRow.skip_reason).toBeUndefined();
  });

  test("GIVEN a mix of ages and labeled flags THEN unlabeledSnapshotsOlderThan filters correctly", () => {
    const store = autopilotStore();
    // Old + unlabeled → in queue.
    const old = store.appendCandidateSnapshot(enterInput({ ts: new Date(NOW - 3 * 60 * 60_000).toISOString() }));
    // Old but already labeled → excluded.
    const oldLabeled = store.appendCandidateSnapshot(
      enterInput({ symbol: "BONK", token_mint: "m3", ts: new Date(NOW - 4 * 60 * 60_000).toISOString() }),
    );
    store.labelCandidateSnapshot(oldLabeled.id, {
      return_30m_bps: 10,
      return_2h_bps: 20,
      return_6h_bps: 30,
      max_adverse_2h_bps: -5,
      max_favorable_2h_bps: 25,
    });
    // Recent + unlabeled → too new, excluded.
    store.appendCandidateSnapshot(enterInput({ symbol: "JUP", token_mint: "m2", ts: new Date(NOW - 10 * 60_000).toISOString() }));

    const queue = store.unlabeledSnapshotsOlderThan(2 * 60 * 60_000, NOW);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(old.id);
  });

  test("GIVEN a snapshot WHEN labeled THEN the labels persist across a restart", () => {
    const store = autopilotStore();
    const row = store.appendCandidateSnapshot(enterInput({ ts: new Date(NOW).toISOString() }));
    store.labelCandidateSnapshot(row.id, {
      return_30m_bps: 42,
      return_2h_bps: 88,
      return_6h_bps: 120,
      max_adverse_2h_bps: -33,
      max_favorable_2h_bps: 95,
    });

    __resetAutopilotStoreForTests();
    const persisted = autopilotStore().candidateSnapshots()[0];
    expect(persisted.labeled).toBe(true);
    expect(persisted.return_2h_bps).toBe(88);
    expect(persisted.max_adverse_2h_bps).toBe(-33);
    expect(persisted.max_favorable_2h_bps).toBe(95);
    // Once labeled, it drops out of the work queue.
    expect(autopilotStore().unlabeledSnapshotsOlderThan(0, NOW + 1)).toHaveLength(0);
  });

  test("GIVEN more than the rolling cap THEN only the newest ~2000 rows survive", () => {
    const store = autopilotStore();
    for (let i = 0; i < 2050; i++) {
      store.appendCandidateSnapshot(enterInput({ ts: new Date(NOW + i * 1000).toISOString(), symbol: `T${i}` }));
    }
    const all = store.candidateSnapshots(5000);
    expect(all).toHaveLength(2000);
    // The oldest 50 aged out; the very newest is retained.
    expect(all.some((r) => r.symbol === "T0")).toBe(false);
    expect(all[0].symbol).toBe("T2049");
  }, 30_000);
});

describe("computeForwardLabels", () => {
  test("GIVEN a rising then dipping series THEN returns and excursions are correct", () => {
    // Snapshot price 100 at t=0. Series in ms from snapshot.
    const series: PriceObservation[] = [
      { ts: 10 * 60_000, price: 101 }, // +100bp, within 30m
      { ts: 30 * 60_000, price: 102 }, // +200bp at exactly 30m
      { ts: 60 * 60_000, price: 97 }, // -300bp (adverse) within 2h
      { ts: 120 * 60_000, price: 105 }, // +500bp (favorable) at exactly 2h
      { ts: 6 * 60 * 60_000, price: 110 }, // +1000bp at 6h
    ];
    const labels = computeForwardLabels(100, series, 0);

    expect(labels.return_30m_bps).toBe(200); // last obs at or before 30m → 102
    expect(labels.return_2h_bps).toBe(500); // last obs at or before 2h → 105
    expect(labels.return_6h_bps).toBe(1000); // last obs at or before 6h → 110
    // Excursions scan only the (0, 2h] window: dip to 97 and peak to 105.
    expect(labels.max_adverse_2h_bps).toBe(-300);
    expect(labels.max_favorable_2h_bps).toBe(500);
  });

  test("GIVEN observations at or before the snapshot THEN they are ignored", () => {
    const series: PriceObservation[] = [
      { ts: -60_000, price: 90 }, // before snapshot
      { ts: 0, price: 95 }, // at snapshot
      { ts: 40 * 60_000, price: 103 }, // forward only this counts
    ];
    const labels = computeForwardLabels(100, series, 0);
    expect(labels.return_30m_bps).toBeNull(); // nothing landed within 30m
    expect(labels.return_2h_bps).toBe(300);
    expect(labels.max_adverse_2h_bps).toBe(300); // only the +300bp obs is in-window
    expect(labels.max_favorable_2h_bps).toBe(300);
  });

  test("GIVEN no forward observations THEN every label is null", () => {
    expect(computeForwardLabels(100, [], 0)).toEqual({
      return_30m_bps: null,
      return_2h_bps: null,
      return_6h_bps: null,
      max_adverse_2h_bps: null,
      max_favorable_2h_bps: null,
    });
  });

  test("GIVEN a non-positive snapshot price THEN every label is null", () => {
    const series: PriceObservation[] = [{ ts: 60 * 60_000, price: 105 }];
    expect(computeForwardLabels(0, series, 0).return_2h_bps).toBeNull();
  });

  test("GIVEN a purely adverse move THEN max_favorable is the least-bad in-window point", () => {
    const series: PriceObservation[] = [
      { ts: 20 * 60_000, price: 99 }, // -100bp
      { ts: 90 * 60_000, price: 96 }, // -400bp
    ];
    const labels = computeForwardLabels(100, series, 0);
    expect(labels.max_adverse_2h_bps).toBe(-400);
    expect(labels.max_favorable_2h_bps).toBe(-100); // both negative; -100 is the max
    expect(labels.return_30m_bps).toBe(-100);
  });
});

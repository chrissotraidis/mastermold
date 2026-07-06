/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetStoreForTests } from "../src/db/store";
import { getJournal } from "../src/db/journal";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");

let prevEngine: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  process.env.ENGINE_OUT_DIR = FIXTURES;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-journal-")), "db.sqlite");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

describe("journal computed from engine output (Phase 2)", () => {
  test("track record by tier is computed from resolved engine decisions", () => {
    const journal = getJournal();
    expect(journal.provenance.label).toBe("Engine output");

    // 6 resolved engine decisions feed the outcome scores.
    expect(journal.outcome_scores.length).toBe(6);

    // Engine decisions (logged on earlier runs) are present alongside today's pending one.
    expect(journal.entries.some((e) => e.id === "engine_journal_2026-05-12_NVDA")).toBe(true);

    // Track record has resolved decisions in the high-conviction tier and computes a win rate.
    const high = journal.track_record.find((t) => t.key === "7-10");
    expect(high).toBeTruthy();
    expect(high!.resolved_count).toBeGreaterThan(0);
    expect(high!.win_rate).not.toBeNull();
    // Resolved counts across all tiers should sum to the number of resolved outcomes
    // among entries (the 6 engine decisions; the pending NVDA card has no outcome).
    const resolved = journal.track_record.reduce((sum, t) => sum + t.resolved_count, 0);
    expect(resolved).toBe(6);
  });

  test("the reflection significance gate is live: a belief moves only on a consistent streak", () => {
    const journal = getJournal();
    const ai = journal.strategy_beliefs.find((b) => b.id === "belief_ai_momentum");
    const crypto = journal.strategy_beliefs.find((b) => b.id === "belief_crypto_meanrevert");
    expect(ai).toBeTruthy();
    expect(crypto).toBeTruthy();

    // Belief A cleared the gate (5 consistent positive outcomes) -> confidence nudged up.
    expect(ai!.confidence).toBeGreaterThan(0.55);
    expect(ai!.reflection_updates.some((r) => r.significance_passed)).toBe(true);

    // Belief B saw mixed outcomes -> the gate blocked any move (one outcome can't flip it).
    expect(crypto!.confidence).toBe(0.5);
    expect(crypto!.reflection_updates.every((r) => !r.significance_passed)).toBe(true);
  });

  test("calibration curve is computed from resolved engine outcomes (conviction vs hit rate)", () => {
    const journal = getJournal();
    expect(journal.calibration.length).toBeGreaterThan(0);
    const totalResolved = journal.calibration.reduce((sum, b) => sum + b.resolved_count, 0);
    expect(totalResolved).toBe(6);
    for (const bucket of journal.calibration) {
      expect(bucket.conviction).toBeGreaterThanOrEqual(1);
      expect(bucket.conviction).toBeLessThanOrEqual(10);
      expect(bucket.wins).toBeLessThanOrEqual(bucket.resolved_count);
      expect(bucket.hit_rate).not.toBeNull();
    }
  });

  test("as-of replay before the run falls back to the seeded journal", () => {
    const asOf = { iso: "2026-06-01T00:00:00.000Z", time: Date.parse("2026-06-01T00:00:00.000Z") };
    const journal = getJournal(asOf);
    expect(journal.provenance.label).toBe("Demo data");
  });
});

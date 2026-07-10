/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetStoreForTests, store } from "@/src/db/store";
import {
  getDataMode,
  getEngineRunHistory,
  getEngineStatus,
  ingestNewestEngineRun,
} from "@/src/db/engine-data";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");

let prevEngine: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-edge-")), "db.sqlite");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

describe("engine-data helpers (edge cases)", () => {
  test("getDataMode reports Engine output with a run summary when live", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    const mode = getDataMode();
    expect(mode.label).toBe("Engine output");
    expect(mode.source).toContain("TradingAgents run");
    // The fixture run is dated 2026-06-05, so for any real "now" it reads as a
    // stale saved scan: freshness metadata and a re-run notice are expected.
    expect(mode.freshness).toBe("stale");
    expect(mode.age_label).toBeTruthy();
    expect(mode.notice).toContain("Run a new scan");
  });

  test("getDataMode surfaces a notice when an engine bundle is present but unusable", () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-bad-"));
    writeFileSync(join(dir, "engine-run-bad.json"), "{ not valid json");
    process.env.ENGINE_OUT_DIR = dir;
    const mode = getDataMode();
    expect(mode.label).toBe("Demo data");
    expect(mode.notice).toBeTruthy();
    expect(getEngineStatus().state).toBe("invalid");
  });

  test("getDataMode is Demo data with no notice when no engine output exists", () => {
    const empty = mkdtempSync(join(tmpdir(), "mm-empty-"));
    process.env.ENGINE_OUT_DIR = empty;
    const mode = getDataMode();
    expect(mode.label).toBe("Demo data");
    expect(mode.notice).toBeUndefined();
  });

  test("ingestNewestEngineRun records the run once and is idempotent", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    expect(ingestNewestEngineRun()).toBe(true); // first ingest
    expect(ingestNewestEngineRun()).toBe(false); // already ingested
    // active fixture is the newest by run_date
    expect(store().ingestedRunDates()).toEqual(["2026-06-05"]);
  });

  test("ingestNewestEngineRun is a no-op when there is nothing to ingest", () => {
    const empty = mkdtempSync(join(tmpdir(), "mm-empty2-"));
    process.env.ENGINE_OUT_DIR = empty;
    expect(ingestNewestEngineRun()).toBe(false);
    expect(store().ingestedRunDates()).toEqual([]);
  });

  test("getEngineRunHistory ingests-then-projects per-run cost, idempotently", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    const first = getEngineRunHistory();
    expect(first.length).toBe(1);
    expect(first[0].run_date).toBe("2026-06-05");
    expect(first[0].triggered).toBe(3);
    expect(first[0].usd).toBeGreaterThan(0);
    // calling again does not duplicate the run
    expect(getEngineRunHistory().length).toBe(1);
  });

  test("getEngineRunHistory is empty when no run has been ingested", () => {
    const empty = mkdtempSync(join(tmpdir(), "mm-empty3-"));
    process.env.ENGINE_OUT_DIR = empty;
    expect(getEngineRunHistory()).toEqual([]);
  });

  test("engine bundles repair no-lookahead violations: rows clamp knowledge forward, run header pulls event back", () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-clamp-"));
    const bundle = JSON.parse(readFileSync(join(FIXTURES, "engine-run-active.json"), "utf8"));
    bundle.run.run_date = "2026-06-08";
    bundle.run.event_time = "2026-06-08T13:30:00.000Z";
    bundle.run.knowledge_time = "2026-06-08T13:29:28.513Z";
    bundle.briefing_cards[0].event_time = bundle.run.event_time;
    bundle.briefing_cards[0].knowledge_time = bundle.run.knowledge_time;
    bundle.briefing_cards[0].drivers[0].event_time = bundle.run.event_time;
    bundle.briefing_cards[0].drivers[0].knowledge_time = bundle.run.knowledge_time;
    writeFileSync(join(dir, "engine-run-2026-06-08.json"), JSON.stringify(bundle));
    process.env.ENGINE_OUT_DIR = dir;

    const status = getEngineStatus(null, {
      now: Date.parse("2026-06-08T13:31:00.000Z"),
    });

    expect(status.state).toBe("live");
    if (status.state !== "live") return;
    // The header keeps its honest write moment — pushing it forward would
    // future-stamp the run — and its event time is pulled back to match.
    expect(status.bundle.run.knowledge_time).toBe("2026-06-08T13:29:28.513Z");
    expect(status.bundle.run.event_time).toBe("2026-06-08T13:29:28.513Z");
    // Row-level facts still clamp knowledge forward to their event time.
    expect(status.bundle.briefing_cards[0].knowledge_time).toBe("2026-06-08T13:30:00.000Z");
    expect(status.bundle.briefing_cards[0].drivers[0].knowledge_time).toBe("2026-06-08T13:30:00.000Z");
  });

  test("a pre-open morning run is live immediately, not hidden as look-ahead until 13:30Z", () => {
    // The real-world case: engine ran at 00:15Z stamping event_time as the
    // upcoming open. The bundle must be visible all day, starting right away.
    const dir = mkdtempSync(join(tmpdir(), "mm-preopen-"));
    const bundle = JSON.parse(readFileSync(join(FIXTURES, "engine-run-active.json"), "utf8"));
    bundle.run.run_date = "2026-06-08";
    bundle.run.event_time = "2026-06-08T13:30:00.000Z";
    bundle.run.knowledge_time = "2026-06-08T00:15:10.953Z";
    writeFileSync(join(dir, "engine-run-2026-06-08.json"), JSON.stringify(bundle));
    process.env.ENGINE_OUT_DIR = dir;

    const status = getEngineStatus(null, {
      now: Date.parse("2026-06-08T06:00:00.000Z"),
    });

    expect(status.state).toBe("live");
    if (status.state !== "live") return;
    expect(status.bundle.run.knowledge_time).toBe("2026-06-08T00:15:10.953Z");
  });
});

/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetStoreForTests } from "../src/db/store";
import { getAlerts, saveAlertFeedback } from "../src/db/alerts";
import { getScreenerFeedback } from "../src/db/screener-feedback";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");

let prevEngine: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-feedback-")), "db.sqlite");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

function returnZAlertIds(): string[] {
  return getAlerts()
    .filter((a) => a.signal === "return_z")
    .map((a) => a.id);
}

describe("alert-feedback → screener tuning loop (Phase 3)", () => {
  test("engine alerts carry a signal and group by it", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    const feedback = getScreenerFeedback();
    expect(feedback.provenance.label).toBe("Engine output");
    const signals = feedback.signals.map((s) => s.signal).sort();
    expect(signals).toContain("return_z");
    expect(signals).toContain("volume_z");
  });

  test("a signal consistently marked not-useful is suggested for demotion", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    const ids = returnZAlertIds();
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) saveAlertFeedback(id, false);

    const returnZ = getScreenerFeedback().signals.find((s) => s.signal === "return_z");
    expect(returnZ?.not_useful).toBe(ids.length);
    expect(returnZ?.suggestion).toBe("demote");
  });

  test("a signal consistently marked useful is suggested to loosen", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    for (const id of returnZAlertIds()) saveAlertFeedback(id, true);

    const returnZ = getScreenerFeedback().signals.find((s) => s.signal === "return_z");
    expect(returnZ?.suggestion).toBe("loosen");
  });

  test("a single rated alert is insufficient evidence to tune", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    // volume_z has one alert (HOOD); rating it once is below the threshold.
    const volId = getAlerts().find((a) => a.signal === "volume_z")?.id;
    expect(volId).toBeTruthy();
    saveAlertFeedback(volId!, false);
    const volume = getScreenerFeedback().signals.find((s) => s.signal === "volume_z");
    expect(volume?.suggestion).toBe("insufficient");
  });

  test("with no engine run there are no signal-tagged alerts to tune", () => {
    const empty = mkdtempSync(join(tmpdir(), "engine-empty-"));
    process.env.ENGINE_OUT_DIR = empty;
    const feedback = getScreenerFeedback();
    expect(feedback.signals.length).toBe(0);
    expect(feedback.total_rated).toBe(0);
  });
});

/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetStoreForTests, store } from "../src/db/store";
import { createDecisionJournalEntry, getJournal } from "../src/db/journal";
import { createPaperPrediction, getPaperPageData } from "../src/db/paper";
import { acknowledgeAlert, getAlerts } from "../src/db/alerts";
import { ingestEngineRun, type EngineBundle } from "../src/db/engine-data";

let prevDb: string | undefined;

beforeEach(() => {
  prevDb = process.env.MASTERMOLD_DB;
  // Unique temp db file per test so cases don't bleed into each other.
  const dir = mkdtempSync(join(tmpdir(), "mm-db-"));
  process.env.MASTERMOLD_DB = join(dir, "mastermold.db");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

/** Simulate a server restart: drop the singleton so store() reopens the same db file. */
function restart() {
  __resetStoreForTests();
}

describe("durable persistence (Phase 1.5)", () => {
  test("uses the bun:sqlite backend under Bun", () => {
    expect(store().backend).toBe("sqlite");
  });

  test("GIVEN a logged journal entry WHEN the server restarts THEN the entry survives", () => {
    const created = createDecisionJournalEntry({
      thesis: "Persistence smoke thesis",
      signals: ["signal-a", "signal-b"],
      conviction: 7,
      horizon: "2 weeks",
      falsification_condition: "Closes below the prior low for two sessions.",
    });

    restart();

    const journal = getJournal();
    const found = journal.entries.find((e) => e.id === created.id);
    expect(found).toBeTruthy();
    expect(found?.thesis).toBe("Persistence smoke thesis");
    expect(found?.signals).toEqual(["signal-a", "signal-b"]);
  });

  test("GIVEN a submitted paper prediction WHEN the server restarts THEN the prediction survives", () => {
    const active = getPaperPageData().activeRound;
    expect(active).toBeTruthy();
    const prediction = createPaperPrediction({
      round_id: active!.id,
      asset_id: "asset_btc",
      direction: "long",
      conviction: 6,
      rationale: "Persistence smoke prediction",
    });

    restart();

    const data = getPaperPageData();
    const found = data.predictions.find((p) => p.id === prediction.id);
    expect(found).toBeTruthy();
    expect(found?.rationale).toBe("Persistence smoke prediction");
  });

  test("GIVEN an acknowledged alert WHEN the server restarts THEN the ack survives", () => {
    const first = getAlerts()[0];
    expect(first).toBeTruthy();
    expect(first.acknowledged).toBe(false);

    acknowledgeAlert(first.id);
    restart();

    const after = getAlerts().find((a) => a.id === first.id);
    expect(after?.acknowledged).toBe(true);
  });

  test("GIVEN an engine run WHEN imported twice for the same date THEN ingestion is idempotent", () => {
    const bundle: EngineBundle = JSON.parse(
      require("node:fs").readFileSync(
        join(process.cwd(), "tests", "fixtures", "engine", "engine-run-active.json"),
        "utf8",
      ),
    );

    expect(ingestEngineRun(bundle)).toBe(true); // first import records the run
    expect(ingestEngineRun(bundle)).toBe(false); // re-import is a no-op
    expect(store().ingestedRunDates()).toEqual([bundle.run.run_date]);
  });
});

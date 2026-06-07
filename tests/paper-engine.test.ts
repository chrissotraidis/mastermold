/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetStoreForTests } from "../src/db/store";
import { getPaperPageData } from "../src/db/paper";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");

let prevEngine: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-paper-")), "db.sqlite");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

describe("paper-vs-engine arena (Phase 3)", () => {
  test("GIVEN a live engine run THEN the engine auto-enters a prediction per actionable card", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    const paper = getPaperPageData();
    expect(paper.provenance.label).toBe("Engine output");
    // active fixture has 3 actionable cards -> 3 engine predictions
    expect(paper.enginePredictions.length).toBe(3);
    expect(paper.enginePredictions.every((p) => p.submitter === "engine")).toBe(true);

    // direction follows the card's net driver sign: HOOD (bearish-led) is short, NVDA long.
    const hood = paper.enginePredictions.find((p) => p.asset.symbol === "HOOD");
    const nvda = paper.enginePredictions.find((p) => p.asset.symbol === "NVDA");
    expect(hood?.direction).toBe("short");
    expect(nvda?.direction).toBe("long");

    // engine predictions are scoped to the open round and kept distinct from operator's.
    expect(paper.enginePredictions.every((p) => p.round_id === paper.activeRound?.id)).toBe(true);
    expect(paper.predictions.every((p) => p.submitter === "operator")).toBe(true);
  });

  test("GIVEN no engine run THEN there are no engine predictions and provenance is Demo data", () => {
    const empty = mkdtempSync(join(tmpdir(), "engine-empty-"));
    process.env.ENGINE_OUT_DIR = empty;
    const paper = getPaperPageData();
    expect(paper.provenance.label).toBe("Demo data");
    expect(paper.enginePredictions.length).toBe(0);
  });
});

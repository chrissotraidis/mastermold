/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetStoreForTests } from "../src/db/store";
import { getChatContext } from "../src/db/chat";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");

let prevEngine: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-chat-")), "db.sqlite");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

describe("chat context injection (Phase 3)", () => {
  test("GIVEN a live engine run THEN the chat context carries engine cards + an Engine output data source", () => {
    process.env.ENGINE_OUT_DIR = FIXTURES;
    const ctx = getChatContext();
    const parsed = JSON.parse(ctx.llm_context);
    expect(parsed.data_source.label).toBe("Engine output");
    expect(parsed.briefing_cards[0].provenance).toBe("Engine output");
    // the top engine card headline is surfaced for "interrogate today's briefing"
    expect(ctx.facts.briefing_headline).toContain("NVIDIA");
  });

  test("GIVEN no engine run THEN the chat context falls back to seeded demo data honestly", () => {
    const empty = mkdtempSync(join(tmpdir(), "engine-empty-"));
    process.env.ENGINE_OUT_DIR = empty;
    const ctx = getChatContext();
    const parsed = JSON.parse(ctx.llm_context);
    expect(parsed.data_source.label).toBe("Demo data");
    expect(parsed.advisory_boundary).toContain("No trading");
  });
});

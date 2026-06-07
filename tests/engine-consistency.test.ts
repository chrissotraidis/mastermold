/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetStoreForTests } from "@/src/db/store";
import { getBriefingCardById, getBriefingCards } from "@/src/db/briefing";
import { getChatContext } from "@/src/db/chat";
import { getJournal } from "@/src/db/journal";
import { getPaperPageData } from "@/src/db/paper";
import { getScreenerFeedback } from "@/src/db/screener-feedback";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");

let prevEngine: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  process.env.ENGINE_OUT_DIR = FIXTURES;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-consistency-")), "db.sqlite");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

describe("engine output is consistent across every surface", () => {
  test("the same engine run drives briefing, chat, journal, paper, and screener-tuning together", () => {
    const cards = getBriefingCards();
    expect(cards.length).toBe(3);
    const top = cards[0];

    // Home/briefing and chat agree on the lead headline.
    const chat = getChatContext();
    expect(chat.facts.briefing_headline).toBe(top.headline);
    expect(JSON.parse(chat.llm_context).data_source.label).toBe("Engine output");

    // Briefing detail's linked journal entry carries the PM falsification condition,
    // and that same condition is what the journal surface shows for the entry.
    const detail = getBriefingCardById(top.id);
    const fals = detail?.decision_journal_entry?.falsification_condition;
    expect(fals).toBeTruthy();
    const journal = getJournal();
    expect(journal.provenance.label).toBe("Engine output");
    const linked = journal.entries.find((e) => e.id === detail?.decision_journal_entry?.id);
    if (linked && fals) expect(linked.falsification_condition).toBe(fals);

    // Paper arena enters one engine prediction per actionable card, same assets.
    const paper = getPaperPageData();
    const cardAssets = new Set(cards.flatMap((c) => c.asset_ids));
    expect(paper.enginePredictions.length).toBe(cards.length);
    expect(paper.enginePredictions.every((p) => cardAssets.has(p.asset_id))).toBe(true);

    // Screener tuning reflects the same run's alerts (every signal seen is real).
    const feedback = getScreenerFeedback();
    expect(feedback.provenance.label).toBe("Engine output");
    expect(feedback.signals.length).toBeGreaterThan(0);

    // Every surface speaks with one provenance voice for this run.
    expect(top.provenance.label).toBe("Engine output");
    expect(detail?.provenance.label).toBe("Engine output");
    expect(paper.provenance.label).toBe("Engine output");
  });
});

/// <reference types="bun" />

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getEngineStatus,
  engineOutDir,
  type EngineBundle,
} from "../src/db/engine-data";
import { getBriefingCardById, getBriefingCards } from "../src/db/briefing";
import { getAlerts } from "../src/db/alerts";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");
const ACTIVE = join(FIXTURES, "engine-run-active.json");
const QUIET = join(FIXTURES, "engine-run-quiet.json");

function withEngineDir(dir: string | null, fn: () => void) {
  const prev = process.env.ENGINE_OUT_DIR;
  if (dir === null) {
    delete process.env.ENGINE_OUT_DIR;
  } else {
    process.env.ENGINE_OUT_DIR = dir;
  }
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.ENGINE_OUT_DIR;
    else process.env.ENGINE_OUT_DIR = prev;
  }
}

function tmpDirWith(files: Array<{ name: string; from?: string; content?: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), "engine-test-"));
  for (const f of files) {
    const target = join(dir, f.name);
    if (f.from) cpSync(f.from, target);
    else writeFileSync(target, f.content ?? "");
  }
  return dir;
}

afterEach(() => {
  delete process.env.ENGINE_OUT_DIR;
});

describe("engine ingestion", () => {
  test("GIVEN no engine output dir WHEN loading THEN status is absent and surfaces fall back to seeds with Demo data", () => {
    const empty = mkdtempSync(join(tmpdir(), "engine-empty-"));
    withEngineDir(empty, () => {
      expect(getEngineStatus().state).toBe("absent");
      const cards = getBriefingCards();
      expect(cards.length).toBeGreaterThan(0);
      expect(cards.every((c) => c.provenance.label === "Demo data")).toBe(true);
      const alerts = getAlerts();
      expect(alerts.every((a) => a.provenance.label === "Demo data")).toBe(true);
    });
  });

  test("GIVEN a valid active bundle WHEN loading THEN briefing + alerts render from engine with Engine output provenance", () => {
    withEngineDir(FIXTURES, () => {
      const status = getEngineStatus();
      expect(status.state).toBe("live");

      const cards = getBriefingCards();
      expect(cards.length).toBe(3);
      expect(cards.every((c) => c.provenance.label === "Engine output")).toBe(true);
      expect(cards[0].rank).toBe(1);
      // ranked by conviction desc
      expect(cards[0].conviction).toBeGreaterThanOrEqual(cards[1].conviction);
      // every artifact carries bitemporal stamps
      expect(cards.every((c) => c.event_time && c.knowledge_time)).toBe(true);

      const alerts = getAlerts();
      expect(alerts.length).toBe(3);
      expect(alerts.every((a) => a.provenance.label === "Engine output")).toBe(true);
      expect(alerts.every((a) => ["T0", "T1", "T2"].includes(a.tier))).toBe(true);
    });
  });

  test("GIVEN an active bundle WHEN opening a card detail THEN drivers and the pending journal entry come from the engine", () => {
    withEngineDir(FIXTURES, () => {
      const cards = getBriefingCards();
      const top = cards[0];
      const detail = getBriefingCardById(top.id);
      expect(detail).not.toBeNull();
      expect(detail!.provenance.label).toBe("Engine output");
      expect(detail!.drivers.length).toBeGreaterThanOrEqual(2);
      // drivers sorted by weight desc and coloured by direction
      expect(detail!.drivers[0].weight).toBeGreaterThanOrEqual(detail!.drivers[1].weight);
      const colours = new Set(detail!.drivers.map((d) => d.color));
      expect(colours.size).toBeGreaterThan(0);
      // NVDA top card has a PM-generated falsification condition mirrored to the journal
      expect(detail!.decision_journal_entry?.falsification_condition).toBeTruthy();
    });
  });

  test("GIVEN a quiet-day bundle WHEN loading THEN one nothing_actionable card, no alerts, zero LLM cost", () => {
    const dir = tmpDirWith([{ name: "engine-run-quiet.json", from: QUIET }]);
    withEngineDir(dir, () => {
      const status = getEngineStatus();
      expect(status.state).toBe("live");
      if (status.state === "live") {
        expect(status.bundle.run.cost.usd).toBe(0);
        expect(status.bundle.run.triggered_tickers.length).toBe(0);
      }
      const cards = getBriefingCards();
      expect(cards.length).toBe(1);
      expect(cards[0].status).toBe("nothing_actionable");
      expect(getAlerts().length).toBe(0);
    });
  });

  test("GIVEN an invalid bundle present WHEN loading THEN status is invalid and surfaces fall back to seeds with a notice", () => {
    const dir = tmpDirWith([{ name: "engine-run-bad.json", content: "{ not valid json" }]);
    withEngineDir(dir, () => {
      const status = getEngineStatus();
      expect(status.state).toBe("invalid");
      const cards = getBriefingCards();
      expect(cards.every((c) => c.provenance.label === "Demo data")).toBe(true);
      expect(cards[0].provenance.notice).toBeTruthy();
    });
  });

  test("GIVEN a schema-violating bundle WHEN loading THEN it is rejected (invalid)", () => {
    const broken = { schema_version: 1, run: { run_date: "2020-01-01" } };
    const dir = tmpDirWith([{ name: "engine-run-broken.json", content: JSON.stringify(broken) }]);
    withEngineDir(dir, () => {
      expect(getEngineStatus().state).toBe("invalid");
    });
  });

  test("GIVEN a future-stamped bundle WHEN loading THEN it is rejected as a look-ahead violation", () => {
    const future: EngineBundle = JSON.parse(readFileSync(ACTIVE, "utf8"));
    future.run.run_date = "2099-01-01";
    future.run.knowledge_time = "2099-01-01T13:42:11.000Z";
    const dir = tmpDirWith([
      { name: "engine-run-2099-01-01.json", content: JSON.stringify(future) },
    ]);
    withEngineDir(dir, () => {
      const status = getEngineStatus();
      expect(status.state).toBe("invalid");
      if (status.state === "invalid") {
        expect(status.reason).toContain("future");
      }
    });
  });

  test("GIVEN an as-of replay before the run WHEN loading THEN the engine bundle is not yet known and seeds are used", () => {
    withEngineDir(FIXTURES, () => {
      // active bundle knowledge_time is 2026-06-05; ask as-of 2026-06-01.
      const asOf = { iso: "2026-06-01T00:00:00.000Z", time: Date.parse("2026-06-01T00:00:00.000Z") };
      const status = getEngineStatus(asOf);
      expect(status.state).toBe("absent");
    });
  });

  test("default engineOutDir points at engine/out under the project root", () => {
    expect(engineOutDir().replace(/\\/g, "/")).toContain("engine/out");
  });
});

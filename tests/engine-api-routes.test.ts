/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GET as getBriefingRoute } from "@/app/api/briefing/route";
import { GET as getBriefingDetailRoute } from "@/app/api/briefing/[id]/route";
import { GET as getAlertsRoute } from "@/app/api/alerts/route";
import { PATCH as patchAlertFeedbackRoute } from "@/app/api/alerts/[id]/feedback/route";
import { GET as getJournalRoute } from "@/app/api/journal/route";
import { GET as getPaperRoute } from "@/app/api/paper/route";
import { GET as getPortfolioRoute } from "@/app/api/portfolio/route";
import { POST as postChatRoute } from "@/app/api/chat/route";
import { __resetStoreForTests } from "@/src/db/store";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");

let prevEngine: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  process.env.ENGINE_OUT_DIR = FIXTURES;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-api-")), "db.sqlite");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

async function json<T>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

const req = (path: string) => new Request(`http://localhost${path}`);

describe("API routes serve engine output end to end", () => {
  test("GET /api/briefing returns engine cards with Engine output provenance", async () => {
    const cards = await json<Array<{ provenance: { label: string }; conviction: number }>>(
      getBriefingRoute(),
    );
    expect(cards.length).toBe(3);
    expect(cards.every((c) => c.provenance.label === "Engine output")).toBe(true);
  });

  test("GET /api/briefing/[id] returns the engine card detail with drivers + falsification", async () => {
    const cards = await json<Array<{ id: string }>>(getBriefingRoute());
    const topId = cards[0].id;
    const res = await getBriefingDetailRoute(req(`/api/briefing/${topId}`), {
      params: Promise.resolve({ id: topId }),
    });
    const detail = await json<{
      provenance: { label: string };
      drivers: unknown[];
      decision_journal_entry: { falsification_condition: string } | null;
    }>(res);
    expect(detail.provenance.label).toBe("Engine output");
    expect(detail.drivers.length).toBeGreaterThanOrEqual(2);
    expect(detail.decision_journal_entry?.falsification_condition).toBeTruthy();
  });

  test("GET /api/alerts returns engine alerts carrying a screener signal", async () => {
    const alerts = await json<Array<{ provenance: { label: string }; signal?: string }>>(
      getAlertsRoute(),
    );
    expect(alerts.length).toBe(3);
    expect(alerts.every((a) => a.provenance.label === "Engine output")).toBe(true);
    expect(alerts.every((a) => typeof a.signal === "string")).toBe(true);
  });

  test("PATCH /api/alerts/[id]/feedback persists feedback on an engine alert", async () => {
    const alerts = await json<Array<{ id: string; acknowledged: boolean }>>(getAlertsRoute());
    const target = alerts[0];
    const res = await patchAlertFeedbackRoute(
      new Request(`http://localhost/api/alerts/${target.id}/feedback`, {
        method: "PATCH",
        body: JSON.stringify({ useful_feedback: false }),
      }),
      { params: Promise.resolve({ id: target.id }) },
    );
    const updated = await json<{ useful_feedback: boolean | null; acknowledged: boolean }>(res);
    expect(updated.useful_feedback).toBe(false);
    expect(updated.acknowledged).toBe(target.acknowledged); // unchanged
  });

  test("GET /api/journal returns an engine-computed track record", async () => {
    const journal = await json<{
      provenance: { label: string };
      track_record: Array<{ resolved_count: number }>;
      calibration: unknown[];
    }>(getJournalRoute(req("/api/journal")));
    expect(journal.provenance.label).toBe("Engine output");
    const resolved = journal.track_record.reduce((s, t) => s + t.resolved_count, 0);
    expect(resolved).toBe(6);
    expect(journal.calibration.length).toBeGreaterThan(0);
  });

  test("GET /api/journal?as_of before the run falls back to seeds (no look-ahead)", async () => {
    const journal = await json<{ provenance: { label: string } }>(
      getJournalRoute(req("/api/journal?as_of=2026-06-01T00:00:00.000Z")),
    );
    expect(journal.provenance.label).toBe("Demo data");
  });

  test("GET /api/portfolio stays seeded — the engine never touches holdings", async () => {
    const portfolio = await json<{ provenance: { label: string }; holdings: unknown[] }>(
      getPortfolioRoute(req("/api/portfolio")),
    );
    expect(portfolio.provenance.label).toBe("Demo data");
    expect(portfolio.holdings.length).toBeGreaterThan(0);
  });

  test("GET /api/paper still serves a valid payload with the engine present", async () => {
    const paper = await json<{ rounds: unknown[]; predictions: unknown[] }>(
      getPaperRoute(req("/api/paper")),
    );
    expect(Array.isArray(paper.rounds)).toBe(true);
    expect(Array.isArray(paper.predictions)).toBe(true);
  });

  test("POST /api/chat returns a canned advisory stream with no key set", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const res = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: "What is the top briefing thesis?" }),
        }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Chat-Mode")).toBe("canned");
      const text = await res.text();
      expect(text).toContain("Advisory only");
    } finally {
      if (prevA !== undefined) process.env.ANTHROPIC_API_KEY = prevA;
      if (prevO !== undefined) process.env.OPENAI_API_KEY = prevO;
    }
  });
});

/// <reference types="bun" />

/**
 * Regression: an engine alert for a real-watchlist ticker (asset_aapl) has no
 * demo-asset row, and the detail copy used to read "No action needed unless
 * you plan to add Unknown... Unknown is not in the visible holdings". The
 * alert's actual symbol must thread through getAlerts and every copy builder.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getAlerts } from "@/src/db/alerts";
import { addManualHolding } from "@/src/db/portfolio";
import { __resetStoreForTests } from "@/src/db/store";
import {
  buildAlertChatPrompt,
  buildAlertSuggestedResponse,
  explainAlertRelevance,
} from "@/lib/alert-loop";

const FIXTURE = join(process.cwd(), "tests", "fixtures", "engine", "engine-run-active.json");

let prevEngine: string | undefined;
let prevDb: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-alert-symbol-")), "db.sqlite");
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  __resetStoreForTests();
});

/** The active fixture with its alerts swapped for a real-watchlist AAPL alert. */
function writeAaplEngineBundle(): string {
  const bundle = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    alerts: Array<Record<string, unknown>>;
  };
  bundle.alerts = [
    {
      ...bundle.alerts[0],
      id: "engine_alert_2026-06-05_AAPL_return_z",
      asset_id: "asset_aapl",
      message: "AAPL 1-day return +4.8% (z=+2.6)",
      rationale: "1-day return is 2.6σ above its trailing mean; deterministic screener trigger, no model involved.",
      signal: "return_z",
    },
  ];
  const dir = mkdtempSync(join(tmpdir(), "mm-aapl-engine-"));
  writeFileSync(join(dir, "engine-run-2026-06-05.json"), JSON.stringify(bundle));
  return dir;
}

describe("alert symbol resolution for real-watchlist tickers", () => {
  test("GIVEN an engine AAPL alert with no demo asset WHEN alerts are read THEN the symbol resolves to AAPL, never Unknown", () => {
    process.env.ENGINE_OUT_DIR = writeAaplEngineBundle();

    const alert = getAlerts().find((item) => item.id.includes("AAPL"));
    expect(alert).toBeDefined();
    expect(alert?.asset_symbol).toBe("AAPL");
    expect(alert?.asset_name).not.toContain("Unknown");
  });

  test("GIVEN the operator holds AAPL WHEN the AAPL alert detail copy is built THEN it names AAPL as visible exposure", () => {
    process.env.ENGINE_OUT_DIR = writeAaplEngineBundle();
    addManualHolding({
      symbol: "AAPL",
      asset_name: "Apple",
      asset_class: "equity",
      venue: "NASDAQ",
      quantity: 10,
      price: 210,
    });

    const alert = getAlerts().find((item) => item.asset_symbol === "AAPL");
    expect(alert).toBeDefined();
    if (!alert) throw new Error("AAPL alert missing");
    expect(alert.portfolio_weight_pct).toBeGreaterThan(0);

    const relevance = explainAlertRelevance(alert);
    const suggested = buildAlertSuggestedResponse(alert);
    const prompt = buildAlertChatPrompt(alert);
    expect(relevance).toContain("AAPL");
    expect(relevance).toContain("of the visible portfolio");
    for (const copy of [relevance, suggested, prompt]) {
      expect(copy).not.toContain("Unknown");
    }
  });

  test("GIVEN a stale payload that serialized the literal Unknown placeholder WHEN copy is built THEN the ticker comes from the message instead", () => {
    const suggested = buildAlertSuggestedResponse({
      asset_symbol: "Unknown",
      message: "AAPL 1-day return +4.8% (z=+2.6)",
      rationale: "screener trigger",
      signal: "return_z",
      tier: "T1",
      portfolio_weight_pct: 0,
    });
    expect(suggested).toContain("AAPL");
    expect(suggested).not.toContain("Unknown");

    const relevance = explainAlertRelevance({
      asset_symbol: "Unknown",
      message: "AAPL 1-day return +4.8% (z=+2.6)",
      rationale: "screener trigger",
      signal: "return_z",
      tier: "T1",
      portfolio_weight_pct: 0,
    });
    expect(relevance).not.toContain("Unknown");
  });
});

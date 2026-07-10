/// <reference types="bun" />

/**
 * Monthly API request budget: pure month-rollover, check/record, and alert-
 * threshold-crossing logic, plus the wallet-discovery fetch shell's gating.
 * No store, no network.
 */

import { describe, expect, test } from "bun:test";

import {
  checkBudget,
  crossedAlertThreshold,
  currentMonthKey,
  recordUsage,
  resetIfNewMonth,
  solanaTrackerBudget,
  EMPTY_BUDGET_STATE,
  SOLANATRACKER_BUDGET,
} from "../src/autopilot/v3/api-budget";
import { fetchWalletSuggestions } from "../src/autopilot/v3/wallet-discovery";

const JULY_10 = Date.parse("2026-07-10T00:00:00Z");
const AUGUST_1 = Date.parse("2026-08-01T00:00:00Z");

describe("month rollover", () => {
  test("GIVEN the same month THEN state is unchanged; GIVEN a new month THEN it resets to zero", () => {
    const july = { month_key: currentMonthKey(JULY_10), used: 400 };
    expect(resetIfNewMonth(july, JULY_10 + 60_000)).toEqual(july);
    expect(resetIfNewMonth(july, AUGUST_1)).toEqual({ month_key: currentMonthKey(AUGUST_1), used: 0 });
  });
});

describe("checkBudget / recordUsage", () => {
  test("GIVEN a fresh budget THEN allowed with full headroom", () => {
    const check = checkBudget(EMPTY_BUDGET_STATE, SOLANATRACKER_BUDGET, JULY_10);
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBe(SOLANATRACKER_BUDGET.monthly_limit);
    expect(check.fraction_used).toBe(0);
  });

  test("GIVEN usage below the soft stop THEN still allowed", () => {
    const used = recordUsage(EMPTY_BUDGET_STATE, JULY_10, 2_000); // 80% of 2,500
    const check = checkBudget(used, SOLANATRACKER_BUDGET, JULY_10);
    expect(check.allowed).toBe(true);
    expect(check.used).toBe(2_000);
  });

  test("GIVEN usage at or past the soft stop (90%) THEN blocked with an honest reason", () => {
    const used = recordUsage(EMPTY_BUDGET_STATE, JULY_10, 2_250); // exactly 90%
    const check = checkBudget(used, SOLANATRACKER_BUDGET, JULY_10);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("2250/2500");
    expect(check.reason).toContain("keyless path");
  });

  test("GIVEN a new month THEN a previously-blocked budget is allowed again", () => {
    const exhausted = recordUsage(EMPTY_BUDGET_STATE, JULY_10, 2_500);
    expect(checkBudget(exhausted, SOLANATRACKER_BUDGET, JULY_10).allowed).toBe(false);
    expect(checkBudget(exhausted, SOLANATRACKER_BUDGET, AUGUST_1).allowed).toBe(true);
  });

  test("GIVEN sequential recordUsage calls THEN usage accumulates within the month", () => {
    let state = EMPTY_BUDGET_STATE;
    state = recordUsage(state, JULY_10);
    state = recordUsage(state, JULY_10 + 1000);
    state = recordUsage(state, JULY_10 + 2000);
    expect(state.used).toBe(3);
  });
});

describe("solanaTrackerBudget env override", () => {
  test("GIVEN no override THEN the stated free tier; GIVEN a valid override THEN it wins; garbage is ignored", () => {
    expect(solanaTrackerBudget({}).monthly_limit).toBe(SOLANATRACKER_BUDGET.monthly_limit);
    expect(solanaTrackerBudget({ SOLANATRACKER_MONTHLY_LIMIT: "10000" }).monthly_limit).toBe(10_000);
    expect(solanaTrackerBudget({ SOLANATRACKER_MONTHLY_LIMIT: "not-a-number" }).monthly_limit).toBe(
      SOLANATRACKER_BUDGET.monthly_limit,
    );
    expect(solanaTrackerBudget({ SOLANATRACKER_MONTHLY_LIMIT: "-5" }).monthly_limit).toBe(
      SOLANATRACKER_BUDGET.monthly_limit,
    );
  });
});

describe("crossedAlertThreshold", () => {
  test("GIVEN a step that crosses 50%, 80%, or 100% THEN that threshold is reported once", () => {
    expect(crossedAlertThreshold(0.4, 0.55)).toBe(0.5);
    expect(crossedAlertThreshold(0.75, 0.82)).toBe(0.8);
    expect(crossedAlertThreshold(0.95, 1.0)).toBe(1.0);
  });

  test("GIVEN no threshold crossed or already past it THEN null", () => {
    expect(crossedAlertThreshold(0.2, 0.3)).toBeNull();
    expect(crossedAlertThreshold(0.6, 0.65)).toBeNull(); // already past 0.5, not newly crossing 0.8
    expect(crossedAlertThreshold(0.9, 0.95)).toBeNull(); // already past 0.8, not newly crossing 1.0
  });
});

describe("fetchWalletSuggestions budget gating", () => {
  test("GIVEN budgetAllows=false THEN the leaderboard is never called even with a key", async () => {
    let leaderboardCalled = false;
    const fetchImpl = (async (url: RequestInfo | URL) => {
      leaderboardCalled = leaderboardCalled || String(url).includes("solanatracker");
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await fetchWalletSuggestions({
      apiKey: "test-key",
      budgetAllows: false,
      trendingPools: [],
      nowMs: 1,
      fetchImpl,
    });
    expect(leaderboardCalled).toBe(false);
    expect(result.source).toBe("none");
  });

  test("GIVEN budgetAllows=true and a successful call THEN onLeaderboardCall fires exactly once", async () => {
    let calls = 0;
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ traders: [{ wallet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", winRate: 60, period: { realized: 5000 }, counts: { trades: 30 }, tokens: { closed: 10 }, identity: {} }] }),
      )) as unknown as typeof fetch;

    const result = await fetchWalletSuggestions({
      apiKey: "test-key",
      budgetAllows: true,
      nowMs: 1,
      fetchImpl,
      onLeaderboardCall: () => {
        calls += 1;
      },
    });
    expect(calls).toBe(1);
    expect(result.source).toBe("solanatracker");
  });

  test("GIVEN a failed leaderboard response THEN onLeaderboardCall still fires (the request landed) but no leaderboard result is used", async () => {
    let calls = 0;
    const fetchImpl = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const result = await fetchWalletSuggestions({
      apiKey: "test-key",
      budgetAllows: true,
      trendingPools: [],
      nowMs: 1,
      fetchImpl,
      onLeaderboardCall: () => {
        calls += 1;
      },
    });
    expect(calls).toBe(1);
    expect(result.source).toBe("none");
  });
});

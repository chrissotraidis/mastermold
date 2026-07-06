/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { GET } from "@/app/api/investment-sync/status/route";

describe("investment sync status API", () => {
  test("GIVEN Settings needs machine-readable readiness WHEN status is requested THEN it returns awareness, realtime, and live boundary", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.awareness.sources.map((source: { id: string }) => source.id)).toContain("robinhood");
    expect(body.integration_plan.headline).toContain("read-only account connection");
    expect(body.integration_plan.lanes.map((lane: { id: string }) => lane.id)).toContain("plaid_investments");
    expect(body.integration_plan.lanes.map((lane: { id: string }) => lane.id)).toContain("coinbase_oauth");
    expect(body.realtime.sources.map((source: { id: string }) => source.id)).toContain("snaptrade");
    expect(body.realtime.summary).toContain("read-only sync loop");
    expect(body.live_trading_boundary.status).toBe("locked");
    expect(body.live_trading_boundary.detail).toContain("private-key storage");
    expect(body.live_trading_boundary.detail).toContain("seed-phrase storage");
  });
});

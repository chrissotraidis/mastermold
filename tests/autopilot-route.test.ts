/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GET, POST } from "@/app/api/autopilot/route";
import { __resetMarketFeedCacheForTests } from "@/src/autopilot/feed";
import { __resetAutopilotStoreForTests } from "@/src/autopilot/store";

let prevDb: string | undefined;
let dir: string;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  dir = mkdtempSync(join(tmpdir(), "mm-autopilot-route-"));
  process.env.AUTOPILOT_DB = join(dir, "autopilot.db.json");
  __resetAutopilotStoreForTests();
  __resetMarketFeedCacheForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  __resetAutopilotStoreForTests();
  __resetMarketFeedCacheForTests();
});

describe("/api/autopilot release safety", () => {
  test("GIVEN the local bot store is unreadable WHEN status is requested THEN the endpoint returns a locked generic payload", async () => {
    writeFileSync(process.env.AUTOPILOT_DB as string, "{ torn");
    __resetAutopilotStoreForTests();

    const response = await GET();
    const body = await response.json() as {
      state: { kill_switch: boolean; runtime_unavailable?: string };
      positions: unknown[];
      recent_trades: unknown[];
    };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.state.kill_switch).toBe(true);
    expect(body.state.runtime_unavailable).toBe("Autopilot store is unavailable; bot controls are locked.");
    expect(body.positions).toEqual([]);
    expect(body.recent_trades).toEqual([]);
    expect(serialized).not.toContain(dir);
    expect(serialized).not.toContain("autopilot.db");
  });

  test("GIVEN the local bot store is unreadable WHEN a control action is posted THEN the endpoint refuses without leaking paths", async () => {
    writeFileSync(process.env.AUTOPILOT_DB as string, "{ torn");
    __resetAutopilotStoreForTests();

    const response = await POST(new Request("http://localhost/api/autopilot", {
      method: "POST",
      body: JSON.stringify({ action: "set_mode", mode: "paper" }),
      headers: { "content-type": "application/json" },
    }));
    const body = await response.json() as { error: string };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.error).toBe("Autopilot store is unavailable; bot controls are locked.");
    expect(serialized).not.toContain(dir);
    expect(serialized).not.toContain("autopilot.db");
  });
});

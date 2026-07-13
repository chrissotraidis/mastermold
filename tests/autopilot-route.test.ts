/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GET, POST } from "@/app/api/autopilot/route";
import { __resetMarketFeedCacheForTests } from "@/src/autopilot/feed";
import { __resetAutopilotStoreForTests } from "@/src/autopilot/store";
import { autopilotStore } from "@/src/autopilot/store";

function localPost(body: Record<string, unknown>, origin = "http://localhost"): Request {
  return new Request("http://localhost/api/autopilot", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin },
  });
}

let prevDb: string | undefined;
let prevFetch: typeof fetch;
let dir: string;

beforeEach(() => {
  prevDb = process.env.AUTOPILOT_DB;
  prevFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [], pairs: [] }), { status: 200 })) as unknown as typeof fetch;
  dir = mkdtempSync(join(tmpdir(), "mm-autopilot-route-"));
  process.env.AUTOPILOT_DB = join(dir, "autopilot.db.json");
  __resetAutopilotStoreForTests();
  __resetMarketFeedCacheForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.AUTOPILOT_DB;
  else process.env.AUTOPILOT_DB = prevDb;
  globalThis.fetch = prevFetch;
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

    const response = await POST(localPost({ action: "set_mode", mode: "paper" }));
    const body = await response.json() as { error: string };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.error).toBe("Autopilot store is unavailable; bot controls are locked.");
    expect(serialized).not.toContain(dir);
    expect(serialized).not.toContain("autopilot.db");
  });

  test("GIVEN valid mint addresses WHEN the Tier B denylist is saved THEN the dashboard payload round-trips it", async () => {
    const mint = "So11111111111111111111111111111111111111112";
    const response = await POST(localPost({ action: "set_tier_b_denylist", denylist: [mint, mint] }));
    const body = await response.json() as { tier_b: { denylist: string[] } };
    expect(response.status).toBe(200);
    expect(body.tier_b.denylist).toEqual([mint]);

    const invalid = await POST(localPost({ action: "set_tier_b_denylist", denylist: ["not-a-mint"] }));
    expect(invalid.status).toBe(422);
  });

  test("paper promotion requires full evidence and an explicit operator POST", async () => {
    const store = autopilotStore();
    store.setReplayConfirmation("cusum_tb", {
      config_hash: "replay-ok", report_path: "docs/private/replay-reports/test.md", data_months: 12,
      positive_walk_forward_quarters: 3, doubled_cost_positive: true, base_mean_net_bps: 35,
      ts: "2026-07-12T00:00:00.000Z",
    });
    for (let index = 0; index < 150; index += 1) {
      const expected = 25 + index / 10;
      const row = store.appendCandidateSnapshot({
        ts: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(), strategy_id: "cusum_tb",
        token_mint: "mint", symbol: "SOL", decision: "enter", features: { direction: "up", score: index },
        cost_total_bps: 20, expected_value_bps: expected, confidence: 0.7, price_usd_at_snapshot: 100,
      });
      store.labelCandidateSnapshot(row.id, {
        return_30m_bps: expected + 20, return_2h_bps: expected + 20, return_6h_bps: expected + 20,
        max_adverse_2h_bps: -5, max_favorable_2h_bps: expected + 20,
      });
    }
    expect(store.v3Promotion("cusum_tb")).toBeNull();
    const response = await POST(localPost({ action: "confirm_v3_promotion", strategy: "cusum_tb" }));
    const body = await response.json() as { v3: { by_strategy: Record<string, { stored_ready: boolean; operator_confirmed_at: string | null }> } };
    expect(response.status).toBe(200);
    expect(body.v3.by_strategy.cusum_tb.stored_ready).toBe(true);
    expect(body.v3.by_strategy.cusum_tb.operator_confirmed_at).not.toBeNull();
  });

  test("control POSTs require an exact loopback origin and target", async () => {
    expect((await POST(localPost({ action: "set_mode", mode: "paper" }, "https://evil.example"))).status).toBe(403);
    expect((await POST(new Request("http://localhost/api/autopilot", {
      method: "POST", body: JSON.stringify({ action: "set_mode", mode: "paper" }),
      headers: { "content-type": "application/json" },
    }))).status).toBe(403);
    expect((await POST(new Request("http://192.0.2.10/api/autopilot", {
      method: "POST", body: JSON.stringify({ action: "set_mode", mode: "paper" }),
      headers: { "content-type": "application/json", origin: "http://192.0.2.10" },
    }))).status).toBe(403);
  });
});

/// <reference types="bun" />

/**
 * Operator notifications: pure gating (enablement, dedupe, formatting) plus
 * the Telegram sender against an injected fetch. Never touches the network,
 * never depends on platform notification UI.
 */

import { afterEach, describe, expect, test } from "bun:test";

import {
  __resetNotifyDedupeForTests,
  formatNotification,
  notifyConfigFromEnv,
  notifyEnabled,
  notifyOperator,
  shouldSend,
  NOTIFY_DEDUPE_MS,
} from "../src/autopilot/notify";

afterEach(() => {
  __resetNotifyDedupeForTests();
});

describe("notify config + gating", () => {
  test("GIVEN no env config THEN notifications are disabled and notifyOperator is a no-op", () => {
    const config = notifyConfigFromEnv({} as unknown as NodeJS.ProcessEnv);
    expect(notifyEnabled(config)).toBe(false);
    let called = 0;
    notifyOperator("halt", "should not send", {
      config,
      fetchImpl: (async () => {
        called += 1;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    expect(called).toBe(0);
  });

  test("GIVEN telegram credentials THEN enabled; desktop-only also enables", () => {
    expect(
      notifyEnabled(notifyConfigFromEnv({ NOTIFY_TELEGRAM_BOT_TOKEN: "t", NOTIFY_TELEGRAM_CHAT_ID: "1" } as unknown as NodeJS.ProcessEnv)),
    ).toBe(true);
    expect(notifyEnabled(notifyConfigFromEnv({ NOTIFY_DESKTOP: "true" } as unknown as NodeJS.ProcessEnv))).toBe(true);
  });

  test("GIVEN only a webhook URL THEN notifications are enabled", () => {
    expect(
      notifyEnabled(notifyConfigFromEnv({ NOTIFY_WEBHOOK_URL: "http://127.0.0.1:4011/notify" } as unknown as NodeJS.ProcessEnv)),
    ).toBe(true);
  });

  test("GIVEN identical messages inside the window THEN dedupe suppresses repeats", () => {
    expect(shouldSend(undefined, 0)).toBe(true);
    expect(shouldSend(0, NOTIFY_DEDUPE_MS - 1)).toBe(false);
    expect(shouldSend(0, NOTIFY_DEDUPE_MS)).toBe(true);
  });

  test("GIVEN a halt THEN the formatted text is short and tagged", () => {
    const text = formatNotification("halt", "Drawdown halt: equity $900 is 10% below peak.");
    expect(text).toContain("Master Mold halt");
    expect(text.length).toBeLessThanOrEqual(500);
  });
});

describe("telegram sender via notifyOperator", () => {
  const config = {
    telegram_token: "test-token",
    telegram_chat_id: "42",
    desktop: false,
    webhook_url: null,
  };

  test("GIVEN a configured channel THEN one send fires and the repeat dedupes", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response("{}");
    }) as unknown as typeof fetch;

    notifyOperator("entry", "Paper buy SOL: $25.00", { nowMs: 1_000, config, fetchImpl });
    notifyOperator("entry", "Paper buy SOL: $25.00", { nowMs: 2_000, config, fetchImpl });
    await Bun.sleep(1);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.telegram.org/bottest-token/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: "42" });
  });

  test("GIVEN a sender that throws THEN notifyOperator still never throws", () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(() => notifyOperator("halt", "boom", { nowMs: 5, config, fetchImpl })).not.toThrow();
  });
});

describe("webhook sender via notifyOperator", () => {
  test("GIVEN a webhook-only config THEN one real POST lands with the formatted text", async () => {
    const received: Array<{ path: string; body: unknown }> = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        received.push({ path: new URL(req.url).pathname, body: await req.json() });
        return new Response(null, { status: 202 });
      },
    });
    const config = {
      telegram_token: null,
      telegram_chat_id: null,
      desktop: false,
      webhook_url: `http://127.0.0.1:${server.port}/notify`,
    };

    notifyOperator("exit", "Paper sell WETH: trailing stop", { nowMs: 1_000, config });
    for (let i = 0; i < 100 && received.length === 0; i++) await Bun.sleep(10);
    server.stop(true);

    expect(received).toHaveLength(1);
    expect(received[0].path).toBe("/notify");
    expect(received[0].body).toMatchObject({ text: expect.stringContaining("Master Mold exit") });
  });
});

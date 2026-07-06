/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import {
  extractLastUserMessage,
  parseChatAsOf,
  parseChatRequest,
  parsePageContext,
} from "@/src/chat/request";

function chatRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("chat request parsing", () => {
  test("GIVEN a simple message body WHEN parsed THEN it returns the trimmed message", async () => {
    const parsed = await parseChatRequest(chatRequest({ message: "  What should I check today?  " }));

    expect(parsed).toEqual({ ok: true, message: "What should I check today?", asOf: null });
  });

  test("GIVEN OpenAI-style messages WHEN parsed THEN it uses the latest user text", async () => {
    const parsed = await parseChatRequest(
      chatRequest({
        messages: [
          { role: "user", content: "older question" },
          { role: "assistant", content: "older answer" },
          {
            role: "user",
            content: [
              { type: "text", text: "What should I" },
              { type: "text", text: "check first today?" },
            ],
          },
        ],
      }),
    );

    expect(parsed).toEqual({ ok: true, message: "What should I check first today?", asOf: null });
  });

  test("GIVEN page context with extra whitespace WHEN parsed THEN it returns cleaned context fields", async () => {
    const parsed = await parseChatRequest(
      chatRequest({
        message: "Replay this view.",
        page_context: {
          surface: "  Today  ",
          route: " /?as_of=2026-05-01T00%3A00%3A00.000Z ",
          summary: " The user is viewing a replay. ",
          selected: " Top idea ",
        },
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pageContext).toEqual({
      surface: "Today",
      route: "/?as_of=2026-05-01T00%3A00%3A00.000Z",
      summary: "The user is viewing a replay.",
      selected: "Top idea",
    });
    expect(parsed.asOf?.iso).toBe("2026-05-01T00:00:00.000Z");
  });

  test("GIVEN invalid page context WHEN parsed THEN it preserves validation messages", () => {
    expect(parsePageContext("today")).toEqual({ ok: false, error: "page_context must be an object" });
    expect(parsePageContext({ surface: "Today", route: "/" })).toEqual({
      ok: false,
      error: "page_context must include surface, route, and summary",
    });
  });

  test("GIVEN malformed messages WHEN parsed THEN it returns message validation errors", () => {
    expect(extractLastUserMessage("hello")).toEqual({ ok: false, error: "messages must be an array" });
    expect(extractLastUserMessage([{ role: "assistant", content: "hello" }])).toEqual({
      ok: false,
      error: "messages must include a user message",
    });
    expect(extractLastUserMessage([{ role: "user", content: { text: "hello" } }])).toEqual({
      ok: false,
      error: "messages user content must be text",
    });
  });

  test("GIVEN explicit as_of WHEN parsed THEN it wins over route replay context", async () => {
    const parsed = await parseChatRequest(
      chatRequest({
        message: "Replay this view.",
        as_of: "2026-06-01T00:00:00.000Z",
        page_context: {
          surface: "Today",
          route: "/?as_of=2026-05-01T00%3A00%3A00.000Z",
          summary: "The user is viewing a replay.",
        },
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.asOf?.iso).toBe("2026-06-01T00:00:00.000Z");
  });

  test("GIVEN a non-string as_of WHEN parsed THEN it preserves validation text", () => {
    expect(parseChatAsOf(123)).toEqual({ ok: false, error: "as_of must be a string" });
  });
});

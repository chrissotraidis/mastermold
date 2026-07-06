/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import {
  buildSystemPrompt,
  chatBudget,
  contextWithInferenceBudget,
  contextWithPageContext,
  defaultMaxResponseTokens,
  defaultMaxTotalTokens,
} from "@/src/chat/context";
import {
  classifyProviderError,
  cleanProviderChatText,
  parseProviderLine,
} from "@/src/chat/streaming";

describe("chat context and streaming helpers", () => {
  test("GIVEN page context WHEN building live context THEN it is inserted without losing the base payload", () => {
    const context = contextWithPageContext(
      JSON.stringify({ app_context: "saved local state" }),
      {
        surface: "Portfolio",
        route: "/portfolio",
        summary: "Visible holdings and import status.",
      },
    );

    expect(JSON.parse(context)).toEqual({
      app_context: "saved local state",
      current_surface: {
        surface: "Portfolio",
        route: "/portfolio",
        summary: "Visible holdings and import status.",
      },
    });
  });

  test("GIVEN an inference budget WHEN building context THEN the user-facing budget boundary is present", () => {
    const withBudget = contextWithInferenceBudget(JSON.stringify({ app_context: "saved" }), {
      ok: true,
      estimatedPromptTokens: 123,
      estimatedTotalTokens: 823,
      maxTotalTokens: 30000,
      maxResponseTokens: 700,
    });

    expect(JSON.parse(withBudget).inference_budget).toMatchObject({
      status: "within local cap",
      estimated_prompt_tokens: 123,
      max_response_tokens: 700,
      user_facing_summary:
        "Live chat has a local size limit. Short questions can use a saved chat key; oversized questions stop before any live chat request.",
    });
  });

  test("GIVEN chat token env caps WHEN budgeting THEN caps are clamped to the allowed range", () => {
    const previousTotal = process.env.MASTERMOLD_CHAT_MAX_TOTAL_TOKENS;
    const previousResponse = process.env.MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS;
    process.env.MASTERMOLD_CHAT_MAX_TOTAL_TOKENS = "20";
    process.env.MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS = "99999";

    try {
      expect(defaultMaxTotalTokens()).toBe(1000);
      expect(defaultMaxResponseTokens()).toBe(1600);
      const budget = chatBudget("hello", JSON.stringify({ app_context: "saved" }));
      expect(budget.maxTotalTokens).toBe(1000);
      expect(budget.maxResponseTokens).toBe(1600);
      expect(budget.ok).toBe(false);
    } finally {
      if (previousTotal === undefined) delete process.env.MASTERMOLD_CHAT_MAX_TOTAL_TOKENS;
      else process.env.MASTERMOLD_CHAT_MAX_TOTAL_TOKENS = previousTotal;
      if (previousResponse === undefined) delete process.env.MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS;
      else process.env.MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS = previousResponse;
    }
  });

  test("GIVEN provider SSE lines WHEN parsed THEN OpenRouter/OpenAI and Anthropic deltas are extracted", () => {
    expect(parseProviderLine('data: {"choices":[{"delta":{"content":"hello"}}]}', "openrouter")).toBe("hello");
    expect(parseProviderLine('data: {"choices":[{"delta":{"content":"hi"}}]}', "openai")).toBe("hi");
    expect(parseProviderLine('data: {"type":"content_block_delta","delta":{"text":"there"}}', "anthropic")).toBe("there");
    expect(parseProviderLine("data: [DONE]", "openai")).toBe("");
    expect(parseProviderLine("event: ping", "openai")).toBe("");
  });

  test("GIVEN provider wording drift WHEN cleaned THEN chat keeps product-readable boundaries", () => {
    expect(cleanProviderChatText("No outside AI calls are made. Today's a mixed picture.")).toContain(
      "Short questions may use live chat when a key is saved. today's read.",
    );
    expect(cleanProviderChatText("1. mixed reasons to watch: BTC.")).toContain("1. Mixed picture: BTC.");
  });

  test("GIVEN provider failures WHEN classified THEN user-safe error codes are stable", () => {
    expect(classifyProviderError(401, "bad key")).toBe("auth");
    expect(classifyProviderError(402, "quota exceeded")).toBe("quota");
    expect(classifyProviderError(429, "rate limit")).toBe("rate_limit");
    expect(classifyProviderError(404, "model not found")).toBe("model");
    expect(classifyProviderError(503, "offline")).toBe("provider_down");
    expect(classifyProviderError(400, "bad request")).toBe("provider_error");
  });

  test("GIVEN the system prompt WHEN built THEN live-money and credential boundaries remain explicit", () => {
    const prompt = buildSystemPrompt(JSON.stringify({ app_context: "saved" }));

    expect(prompt).toContain("You cannot buy or sell assets, sign transactions, move funds");
    expect(prompt).toContain("Do not say live chat requests never happen");
    expect(prompt).toContain("The Today Save context for chat action only saves or refreshes local app context");
    expect(prompt).toContain("Never ask for or reveal account IDs, raw quantities, private keys, tokens, or credentials.");
  });
});

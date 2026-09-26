import { describe, expect, test } from "bun:test";

import {
  llmCompletion,
  llmFallback,
  llmPrimary,
  llmProvider,
  llmProviderChain,
  llmProviderDisplayName,
  llmReasoningPayload,
  llmRequestHeaders,
} from "@/src/llm/completion";

const GO = "https://opencode.ai/zen/go/v1";
const OR = "https://openrouter.ai/api/v1";

describe("shared LLM provider chain", () => {
  test("prefers OpenCode Go over OpenRouter when both keys exist", () => {
    const env = { OPENCODE_GO_API_KEY: "go-key", OPENROUTER_API_KEY: "or-key" };
    const chain = llmProviderChain(env);
    expect(chain.map((e) => e.label)).toEqual(["opencode-go", "openrouter"]);
    expect(llmProvider(env)?.baseUrl).toBe(GO);
    expect(llmProvider(env)?.model).toBe("deepseek-v4-flash");
  });

  test("falls back to OpenRouter as primary when no OpenCode key is set", () => {
    const env = { OPENROUTER_API_KEY: "or-key" };
    expect(llmPrimary(env)).toBeNull();
    expect(llmProvider(env)?.label).toBe("openrouter");
    expect(llmProviderChain(env)).toHaveLength(1);
  });

  test("no keys at all means no provider", () => {
    expect(llmProviderChain({})).toHaveLength(0);
    expect(llmProvider({})).toBeNull();
  });

  test("honors OPENROUTER_MODEL so pre-existing deployments keep their model", () => {
    // Every call site before 2026-08-24 read this var directly. Ignoring it
    // would silently swap the model out from under an existing deployment.
    const env = { OPENROUTER_API_KEY: "or-key", OPENROUTER_MODEL: "some/other-model" };
    expect(llmFallback(env)?.model).toBe("some/other-model");
  });

  test("LLM_FALLBACK_MODEL wins over OPENROUTER_MODEL", () => {
    const env = {
      OPENROUTER_API_KEY: "or-key",
      OPENROUTER_MODEL: "legacy/model",
      LLM_FALLBACK_MODEL: "explicit/model",
    };
    expect(llmFallback(env)?.model).toBe("explicit/model");
  });

  test("a single endpoint is never listed twice", () => {
    // Same base URL on both slots: the chain must not try it, fail, and retry.
    const env = {
      OPENCODE_GO_API_KEY: "k",
      LLM_COMPAT_BASE_URL: OR,
      OPENROUTER_API_KEY: "k2",
    };
    expect(llmProviderChain(env)).toHaveLength(1);
  });

  test("attribution headers are sent to OpenRouter and only to OpenRouter", () => {
    const or = llmFallback({ OPENROUTER_API_KEY: "or-key" })!;
    const orHeaders = llmRequestHeaders(or, "Master Mold Analyst", {});
    // "X-Title" is the header OpenRouter actually reads; the old
    // "X-OpenRouter-Title" was ignored and hid this app's spend.
    expect(orHeaders["X-Title"]).toBe("Master Mold Analyst");
    expect(orHeaders["X-OpenRouter-Title"]).toBeUndefined();
    expect(orHeaders.Authorization).toBe("Bearer or-key");

    const go = llmPrimary({ OPENCODE_GO_API_KEY: "go-key" })!;
    const goHeaders = llmRequestHeaders(go, "Master Mold Analyst", {});
    expect(goHeaders["X-Title"]).toBeUndefined();
    expect(goHeaders["HTTP-Referer"]).toBeUndefined();
  });

  test("thinking is disabled per provider so tokens are not spent on hidden reasoning", () => {
    const go = llmPrimary({ OPENCODE_GO_API_KEY: "k" })!;
    expect(llmReasoningPayload(go)).toEqual({ thinking: { type: "disabled" } });

    const or = llmFallback({ OPENROUTER_API_KEY: "k" })!;
    expect(llmReasoningPayload(or)).toEqual({ reasoning: { effort: "none", exclude: true } });
  });

  test("display names are human-facing, labels are not", () => {
    expect(llmProviderDisplayName("opencode-go")).toBe("OpenCode Go");
    expect(llmProviderDisplayName("openrouter")).toBe("OpenRouter");
  });
});

describe("llmCompletion failover", () => {
  const env = { OPENCODE_GO_API_KEY: "go-key", OPENROUTER_API_KEY: "or-key" };

  function mockFetch(handler: (url: string) => Response | Promise<Response>) {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: unknown) => {
      seen.push(String(url));
      return handler(String(url));
    }) as typeof fetch;
    return { seen, restore: () => { globalThis.fetch = original; } };
  }

  const ok = (content: string) =>
    Response.json({ choices: [{ message: { content } }] }, { status: 200 });

  test("uses the primary and never touches the metered fallback when it works", async () => {
    const m = mockFetch(() => ok("primary answer"));
    try {
      const res = await llmCompletion({ system: "s", user: "u", maxTokens: 10 }, env);
      expect(res.provider).toBe("opencode-go");
      expect(res.content).toBe("primary answer");
      expect(m.seen).toEqual([`${GO}/chat/completions`]);
    } finally { m.restore(); }
  });

  test("falls through to OpenRouter when the primary errors", async () => {
    const m = mockFetch((url) =>
      url.startsWith(GO) ? new Response("upstream stall", { status: 503 }) : ok("fallback answer"));
    try {
      const res = await llmCompletion({ system: "s", user: "u", maxTokens: 10 }, env);
      expect(res.provider).toBe("openrouter");
      expect(res.content).toBe("fallback answer");
      expect(m.seen).toHaveLength(2);
    } finally { m.restore(); }
  });

  test("an empty completion counts as a failure, not a silent empty string", async () => {
    const m = mockFetch((url) =>
      url.startsWith(GO)
        ? Response.json({ choices: [{ message: { content: "   " } }] }, { status: 200 })
        : ok("fallback answer"));
    try {
      const res = await llmCompletion({ system: "s", user: "u", maxTokens: 10 }, env);
      expect(res.provider).toBe("openrouter");
    } finally { m.restore(); }
  });

  test("when every provider fails the error names each one", async () => {
    const m = mockFetch(() => new Response("nope", { status: 402 }));
    try {
      await expect(llmCompletion({ system: "s", user: "u", maxTokens: 10 }, env)).rejects.toThrow(
        /opencode-go.*openrouter/s,
      );
    } finally { m.restore(); }
  });

  test("with no provider configured the error says which key to set", async () => {
    await expect(llmCompletion({ system: "s", user: "u", maxTokens: 10 }, {})).rejects.toThrow(
      /OPENCODE_GO_API_KEY/,
    );
  });
});

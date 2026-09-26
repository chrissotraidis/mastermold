/**
 * One place that decides which LLM endpoint Master Mold talks to.
 *
 * Primary is OpenCode Go (OpenAI-compatible, flat-rate, same key ApplyPilot
 * uses). OpenRouter stays configured as the fallback and is only reached when
 * the primary fails, so a metered provider can never be the default path.
 *
 * Every non-streaming call site (Polymarket analyst, autopilot analyst, brain,
 * daily report) routes through `llmCompletion`. Chat streaming has its own
 * provider modules but resolves its endpoint from `llmProvider()` here.
 */

/** Narrow so the label can be handed straight to the chat streamer's provider
 * union without a cast. Every one of these is OpenAI-compatible on the wire. */
export type LlmProviderLabel = "opencode-go" | "openrouter" | "compat";

export type LlmEndpoint = {
  label: LlmProviderLabel;
  baseUrl: string;
  model: string;
  apiKey: string;
};

const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_MODEL = "deepseek-v4-flash";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "deepseek/deepseek-v4-flash";

type Env = Record<string, string | undefined>;

function endpointLabel(baseUrl: string): LlmProviderLabel {
  if (baseUrl.includes("opencode.ai")) return "opencode-go";
  if (baseUrl.includes("openrouter.ai")) return "openrouter";
  return "compat";
}

/** The provider Master Mold prefers. Null when no key is configured at all. */
export function llmPrimary(env: Env = process.env): LlmEndpoint | null {
  const apiKey = (env.LLM_API_KEY || env.OPENCODE_GO_API_KEY || "").trim();
  if (!apiKey) return null;
  const baseUrl = (env.LLM_COMPAT_BASE_URL || OPENCODE_GO_BASE_URL).trim().replace(/\/+$/, "");
  return {
    label: endpointLabel(baseUrl),
    baseUrl,
    model: (env.LLM_MODEL || OPENCODE_GO_MODEL).trim(),
    apiKey,
  };
}

/**
 * The metered backstop. Only used when the primary fails.
 *
 * OPENROUTER_MODEL is still honored: every pre-2026-08-24 call site read it
 * directly, so a deployment that sets it must keep getting that model rather
 * than silently switching to this module's default.
 */
export function llmFallback(env: Env = process.env): LlmEndpoint | null {
  const apiKey = (env.LLM_FALLBACK_API_KEY || env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) return null;
  const baseUrl = (env.LLM_FALLBACK_BASE_URL || OPENROUTER_BASE_URL).trim().replace(/\/+$/, "");
  return {
    label: endpointLabel(baseUrl),
    baseUrl,
    model: (env.LLM_FALLBACK_MODEL || env.OPENROUTER_MODEL || OPENROUTER_MODEL).trim(),
    apiKey,
  };
}

/** Human-facing provider name used in error payloads shown to the operator. */
export function llmProviderDisplayName(label: LlmProviderLabel): string {
  if (label === "opencode-go") return "OpenCode Go";
  if (label === "openrouter") return "OpenRouter";
  return "LLM provider";
}

/**
 * Ordered provider chain. When only OpenRouter is configured it becomes the
 * primary, so a deployment that never sets an OpenCode key keeps working
 * exactly as it did before.
 */
export function llmProviderChain(env: Env = process.env): LlmEndpoint[] {
  const primary = llmPrimary(env);
  const fallback = llmFallback(env);
  const chain: LlmEndpoint[] = [];
  if (primary) chain.push(primary);
  if (fallback && fallback.baseUrl !== primary?.baseUrl) chain.push(fallback);
  return chain;
}

/** The endpoint that will actually serve the next request. */
export function llmProvider(env: Env = process.env): LlmEndpoint | null {
  return llmProviderChain(env)[0] ?? null;
}

export function llmRequestHeaders(
  endpoint: LlmEndpoint,
  title: string,
  env: Env = process.env,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${endpoint.apiKey}`,
    "Content-Type": "application/json",
  };
  if (endpoint.baseUrl.includes("openrouter.ai")) {
    // OpenRouter attributes spend by these two headers. The app was sending
    // "X-OpenRouter-Title", which does not exist, so its usage was invisible
    // in the dashboard (fixed 2026-08-24).
    headers["HTTP-Referer"] = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4002";
    headers["X-Title"] = title;
  }
  return headers;
}

/**
 * Provider-specific knobs that keep a reasoning model from spending tokens on
 * hidden chain-of-thought. Every Master Mold call wants a short, parseable
 * answer, never a transcript.
 */
export function llmReasoningPayload(endpoint: LlmEndpoint): Record<string, unknown> {
  if (endpoint.baseUrl.includes("openrouter.ai")) {
    return { reasoning: { effort: "none", exclude: true } };
  }
  if (endpoint.baseUrl.includes("opencode.ai") && endpoint.model.toLowerCase().includes("deepseek")) {
    // OpenCode Go/Zen serve DeepSeek with thinking on by default; this is the
    // only param their proxy honors for disabling it (verified 2026-08-08).
    return { thinking: { type: "disabled" } };
  }
  return {};
}

export type LlmCompletionRequest = {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  /** Attribution string sent to OpenRouter as X-Title. */
  title?: string;
};

export type LlmCompletionResult = {
  content: string;
  model: string;
  provider: string;
};

async function callEndpoint(
  endpoint: LlmEndpoint,
  request: LlmCompletionRequest,
  env: Env,
): Promise<string> {
  const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: "POST",
    headers: llmRequestHeaders(endpoint, request.title ?? "Master Mold", env),
    signal: AbortSignal.timeout(request.timeoutMs ?? 90_000),
    body: JSON.stringify({
      model: endpoint.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.1,
      ...llmReasoningPayload(endpoint),
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${endpoint.label} HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`${endpoint.label} returned an empty completion.`);
  return content;
}

/**
 * Run a single-turn completion against the provider chain. Tries each endpoint
 * once, in order, and reports which one answered so callers can record the
 * model that actually produced the output rather than the one they intended.
 */
export async function llmCompletion(
  request: LlmCompletionRequest,
  env: Env = process.env,
): Promise<LlmCompletionResult> {
  const chain = llmProviderChain(env);
  if (chain.length === 0) {
    throw new Error(
      "No LLM provider configured. Set OPENCODE_GO_API_KEY (preferred) or OPENROUTER_API_KEY.",
    );
  }

  const failures: string[] = [];
  for (const endpoint of chain) {
    try {
      const content = await callEndpoint(endpoint, request, env);
      return { content, model: endpoint.model, provider: endpoint.label };
    } catch (error) {
      failures.push(`${endpoint.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`All LLM providers failed. ${failures.join(" | ")}`);
}

/** Convenience wrapper for call sites that only want the text. */
export async function llmCompletionText(
  request: LlmCompletionRequest,
  env: Env = process.env,
): Promise<string> {
  return (await llmCompletion(request, env)).content;
}

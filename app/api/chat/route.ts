import { getChatContext, type ChatPageContext } from "@/src/db/chat";
import { parseAsOf, type AsOfFilter } from "@/src/db/bitemporal";
import {
  buildUserPromptForRequest,
  cleanChatText,
  inferResponseCleanupMode,
  type ChatTextCleanupMode,
} from "@/lib/chat-copy";

type ChatRequest = {
  message?: unknown;
  messages?: unknown;
  page_context?: unknown;
  as_of?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseChatRequest(request);

  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 422 });
  }

  const context = getChatContext(parsed.asOf);
  const message = parsed.message || "Summarize the advisory context.";
  const userMessage = buildUserPromptForRequest(message);
  const responseMode = inferResponseCleanupMode(message);
  const baseLlmContext = contextWithPageContext(context.llm_context, parsed.pageContext);
  const budget = chatBudget(userMessage, baseLlmContext);
  const llmContext = contextWithInferenceBudget(baseLlmContext, budget);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!budget.ok) {
    return Response.json(
      {
        error: "This question is too large to send to live chat. Ask a shorter question or narrow the page context.",
        code: "budget",
        provider: "Master Mold",
      },
      {
        status: 413,
        headers: {
          ...chatHeaders(context, "canned", "budget-guard", budget),
          "X-Chat-Error-Code": "budget",
        },
      },
    );
  }

  if (anthropicKey) {
    const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
    return streamAnthropicResponse(
      anthropicKey,
      model,
      userMessage,
      llmContext,
      chatHeaders(context, "anthropic", model, budget),
      responseMode,
      budget,
    );
  }

  if (openrouterKey) {
    const model = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-chat";
    return streamOpenRouterResponse(
      openrouterKey,
      model,
      userMessage,
      llmContext,
      chatHeaders(context, "openrouter", model, budget),
      responseMode,
      budget,
    );
  }

  if (openaiKey) {
    const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    return streamOpenAIResponse(
      openaiKey,
      model,
      userMessage,
      llmContext,
      chatHeaders(context, "openai", model, budget),
      responseMode,
      budget,
    );
  }

  return textStream(context.fallback_response, {
    ...chatHeaders(context, "canned", "local-fallback", budget),
  });
}

async function parseChatRequest(request: Request): Promise<
  | {
      ok: true;
      message: string;
      pageContext?: ChatPageContext;
      asOf: AsOfFilter | null;
    }
  | {
      ok: false;
      error: string;
    }
> {
  let text = "";

  try {
    text = await request.text();
  } catch {
    return { ok: false, error: "Unable to read request body" };
  }

  if (!text.trim()) {
    return { ok: true, message: "", asOf: null };
  }

  let body: ChatRequest;

  try {
    body = JSON.parse(text) as ChatRequest;
  } catch {
    return { ok: false, error: "Expected JSON body with a message field" };
  }

  if (body.message === undefined || body.message === null) {
    if (body.messages !== undefined && body.messages !== null) {
      const extracted = extractLastUserMessage(body.messages);
      if (!extracted.ok) return extracted;

      const message = extracted.message.trim();

      if (message.length > 2000) {
        return { ok: false, error: "message must be 2000 characters or fewer" };
      }

      const parsedContext = parsePageContext(body.page_context);
      if (!parsedContext.ok) return parsedContext;
      const parsedAsOf = parseChatAsOf(body.as_of, parsedContext.pageContext);
      if (!parsedAsOf.ok) return parsedAsOf;

      return { ok: true, message, pageContext: parsedContext.pageContext, asOf: parsedAsOf.asOf };
    }

    const parsedContext = parsePageContext(body.page_context);
    if (!parsedContext.ok) return parsedContext;
    const parsedAsOf = parseChatAsOf(body.as_of, parsedContext.pageContext);
    if (!parsedAsOf.ok) return parsedAsOf;
    return { ok: true, message: "", pageContext: parsedContext.pageContext, asOf: parsedAsOf.asOf };
  }

  if (typeof body.message !== "string") {
    return { ok: false, error: "message must be a string" };
  }

  const message = body.message.trim();

  if (message.length > 2000) {
    return { ok: false, error: "message must be 2000 characters or fewer" };
  }

  const parsedContext = parsePageContext(body.page_context);
  if (!parsedContext.ok) return parsedContext;
  const parsedAsOf = parseChatAsOf(body.as_of, parsedContext.pageContext);
  if (!parsedAsOf.ok) return parsedAsOf;

  return { ok: true, message, pageContext: parsedContext.pageContext, asOf: parsedAsOf.asOf };
}

function extractLastUserMessage(value: unknown):
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      error: string;
    } {
  if (!Array.isArray(value)) {
    return { ok: false, error: "messages must be an array" };
  }

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const record = item as Record<string, unknown>;
    if (record.role !== "user") continue;

    if (typeof record.content === "string") {
      return { ok: true, message: record.content };
    }

    if (Array.isArray(record.content)) {
      const text = record.content
        .map((part) => {
          if (!part || typeof part !== "object" || Array.isArray(part)) return "";
          const partRecord = part as Record<string, unknown>;
          return typeof partRecord.text === "string" ? partRecord.text : "";
        })
        .filter(Boolean)
        .join(" ");
      if (text.trim()) return { ok: true, message: text };
    }

    return { ok: false, error: "messages user content must be text" };
  }

  return { ok: false, error: "messages must include a user message" };
}

function parsePageContext(value: unknown):
  | {
      ok: true;
      pageContext?: ChatPageContext;
    }
  | {
      ok: false;
      error: string;
    } {
  if (value === undefined || value === null) {
    return { ok: true };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "page_context must be an object" };
  }

  const record = value as Record<string, unknown>;
  const surface = cleanContextField(record.surface, 60);
  const route = cleanContextField(record.route, 140);
  const summary = cleanContextField(record.summary, 500);
  const selected = cleanContextField(record.selected, 240);

  if (!surface || !route || !summary) {
    return { ok: false, error: "page_context must include surface, route, and summary" };
  }

  return {
    ok: true,
    pageContext: selected
      ? { surface, route, summary, selected }
      : { surface, route, summary },
  };
}

function cleanContextField(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseChatAsOf(
  bodyAsOf: unknown,
  pageContext?: ChatPageContext,
):
  | {
      ok: true;
      asOf: AsOfFilter | null;
    }
  | {
      ok: false;
      error: string;
    } {
  if (bodyAsOf !== undefined && bodyAsOf !== null) {
    if (typeof bodyAsOf !== "string") {
      return { ok: false, error: "as_of must be a string" };
    }

    const parsed = parseAsOf(bodyAsOf);
    return parsed.ok ? { ok: true, asOf: parsed.asOf } : parsed;
  }

  const routeAsOf = asOfFromRoute(pageContext?.route);
  if (!routeAsOf) {
    return { ok: true, asOf: null };
  }

  const parsed = parseAsOf(routeAsOf);
  return parsed.ok ? { ok: true, asOf: parsed.asOf } : parsed;
}

function asOfFromRoute(route?: string) {
  if (!route) return null;

  try {
    return new URL(route, "http://localhost").searchParams.get("as_of");
  } catch {
    return null;
  }
}

function contextWithPageContext(llmContext: string, pageContext?: ChatPageContext) {
  if (!pageContext) return llmContext;

  try {
    const parsed = JSON.parse(llmContext) as Record<string, unknown>;
    return JSON.stringify({
      ...parsed,
      current_surface: pageContext,
    });
  } catch {
    return JSON.stringify({
      app_context: llmContext,
      current_surface: pageContext,
    });
  }
}

function contextWithInferenceBudget(llmContext: string, budget: ChatBudget) {
  const inferenceBudget = {
    status: budget.ok ? "within local cap" : "stopped before live chat request",
    estimated_prompt_tokens: budget.estimatedPromptTokens,
    max_response_tokens: budget.maxResponseTokens,
    max_total_tokens: budget.maxTotalTokens,
    user_facing_summary:
      "Live chat has a local size limit. Short questions can use a saved chat key; oversized questions stop before any live chat request.",
  };

  try {
    const parsed = JSON.parse(llmContext) as Record<string, unknown>;
    return JSON.stringify({
      ...parsed,
      inference_budget: inferenceBudget,
    });
  } catch {
    return JSON.stringify({
      app_context: llmContext,
      inference_budget: inferenceBudget,
    });
  }
}

async function streamOpenAIResponse(
  apiKey: string,
  model: string,
  message: string,
  llmContext: string,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
  budget?: ChatBudget,
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: budget?.maxResponseTokens ?? defaultMaxResponseTokens(),
      stream: true,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(llmContext),
        },
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    return providerErrorResponse(response, "OpenAI", headers);
  }

  return streamServerSentEvents(response.body, "openai", headers, responseMode);
}

async function streamOpenRouterResponse(
  apiKey: string,
  model: string,
  message: string,
  llmContext: string,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
  budget?: ChatBudget,
) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4002",
      "X-OpenRouter-Title": "Master Mold",
    },
    body: JSON.stringify({
      model,
      max_tokens: budget?.maxResponseTokens ?? defaultMaxResponseTokens(),
      stream: true,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(llmContext),
        },
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    return providerErrorResponse(response, "OpenRouter", headers);
  }

  return streamServerSentEvents(response.body, "openrouter", headers, responseMode);
}

async function streamAnthropicResponse(
  apiKey: string,
  model: string,
  message: string,
  llmContext: string,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
  budget?: ChatBudget,
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: budget?.maxResponseTokens ?? defaultMaxResponseTokens(),
      stream: true,
      system: buildSystemPrompt(llmContext),
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    return providerErrorResponse(response, "Anthropic", headers);
  }

  return streamServerSentEvents(response.body, "anthropic", headers, responseMode);
}

function buildSystemPrompt(llmContext: string) {
  return [
    "You are an advisory-only financial copilot for Master Mold.",
    "You cannot buy or sell assets, sign transactions, move funds, or imply market-action authority.",
    "The app can create paper trades on the Paper page using simulator dollars. When asked about paper trading an alert or idea, explain that it is simulated only, not real execution.",
    "Use only the supplied context. Holdings are intentionally abstracted as portfolio-weight ratios and percentages.",
    "When current_surface is present, answer from that page's point of view, but do not claim to see unsent UI details.",
    "Answer the user's exact question first. Do not open with a broad context summary unless they explicitly ask for a summary.",
    "For daily-focus questions such as what to check first, give one top focus, why it matters in plain language, and the next no-trading step.",
    "Answer in plain prose. Do not quote JSON keys, raw context field names, or implementation labels.",
    "Do not call portfolio values live, real-time, connected, synced, or imported unless the plain context summary says imported portfolio.",
    "Avoid toy-sounding paper-trading language plus the phrases live engine output, engine output, actionable, signals, insights, conviction, high-conviction, high-confidence, higher-confidence, higher confidence, highest-confidence, hypothesis, picks, and practice. Say saved market read, things to check, reasons to watch, stronger evidence, confidence, paper trade, review, and strongly scored calls.",
    "When discussing recent calls, group them as strongly scored, middle-scored, or early watchlist calls.",
    "When the portfolio state is Demo data, call it a sample portfolio. When it is Manual portfolio, call it local manual entries plus sample data. When it is Imported portfolio, say imported holdings snapshot plus local/sample data.",
    "Connection checks do not import holdings by themselves. Imported holdings appear only after the explicit Settings import action.",
    "Imported portfolio holdings are read-only snapshots. If the context says fresh, aging, stale, or no automatic refresh, repeat that plainly.",
    "The Today Save context for chat action only saves or refreshes local app context for chat. It does not check the internet, news, connected accounts, or full market research. Do not suggest those checks can be enabled or manually triggered in this app unless context explicitly says they exist.",
    "When discussing Chat context, do not say the user can run checks, load fresh market data, trigger a scan, or manually trigger a scan to fetch fresh market data. Say it saves local app context only.",
    "Do not describe Save context for chat as a way to get live updates. It only saves local context for future chat answers.",
    "If asked whether Master Mold has evidence it can beat the market or a simple baseline, use forward_measurement status. A running measurement window only starts the clock; it needs enough later results before the baseline comparison means anything.",
    "If asked about inference budgets, cost controls, or runaway inference, use inference_budget status. Say live chat has a size limit and oversized questions stop before any live chat request.",
    "Do not say live chat requests never happen. If a live key is saved and the prompt is within budget, chat can use live chat.",
    "For real-vs-sample questions, say saved reads are local saved app data, not live market coverage. Do not call saved-read market moves actual or live; say they were marked as worth checking in the saved read.",
    "Never ask for or reveal account IDs, raw quantities, private keys, tokens, or credentials.",
    "When explaining alerts, start with why the user should care. Do not mention z-scores, z= values, sigma, standard deviations, or raw signal names unless the user asks for raw math.",
    "When explaining borrow-payment or funding alerts, do not quote raw rates or open-interest figures unless the user asks for raw math. Say borrow-payment conditions changed and explain whether that matters to the visible portfolio.",
    "Do not tell the user that Master Mold cannot simulate or paper trade. Say it can test paper trades in Paper while still being unable to place real trades.",
    "Keep answers concise and cite the supplied app context by name.",
    `Context JSON: ${llmContext}`,
  ].join("\n");
}

async function providerErrorResponse(response: Response, provider: string, headers: Record<string, string>) {
  const detail = await response.text().catch(() => "");
  const code = classifyProviderError(response.status, detail);
  return Response.json(
    {
      error: `${provider} chat request failed`,
      provider,
      code,
      detail: detail.slice(0, 300),
    },
    {
      status: 502,
      headers: {
        ...headers,
        "X-Chat-Error-Code": code,
      },
    },
  );
}

function streamServerSentEvents(
  body: ReadableStream<Uint8Array>,
  provider: "openai" | "openrouter" | "anthropic",
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let output = "";
  // Tokens are relayed as they arrive so the answer reads progressively instead
  // of landing as one blob after the full model latency. Copy cleanup runs over
  // the accumulated text each flush; the trailing holdback keeps phrase-level
  // replacements stable across chunk boundaries before their region is emitted.
  const CLEANUP_HOLDBACK = 160;
  let sentLength = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let grew = false;
          for (const line of lines) {
            const text = parseProviderLine(line, provider);

            if (text) {
              output += text;
              grew = true;
            }
          }

          if (grew) {
            const cleaned = cleanProviderChatText(output, responseMode);
            const safeLength = Math.max(0, cleaned.length - CLEANUP_HOLDBACK);
            if (safeLength > sentLength) {
              controller.enqueue(encoder.encode(cleaned.slice(sentLength, safeLength)));
              sentLength = safeLength;
            }
          }
        }
      } catch (error) {
        controller.error(error);
        return;
      }

      const cleaned = cleanProviderChatText(output, responseMode);
      if (cleaned.length > sentLength) {
        controller.enqueue(encoder.encode(cleaned.slice(sentLength)));
      }
      controller.close();
    },
  });

  return textStream(stream, {
    ...headers,
    "X-Chat-Mode": provider,
    "X-Chat-Cleanup-Mode": responseMode ?? "general",
  });
}

function cleanProviderChatText(output: string, responseMode?: ChatTextCleanupMode) {
  return cleanChatText(output, { responseMode })
    .replace(/\bmixed reasons to watch\b/gi, "a mixed picture")
    .replace(/\bmixed reason to watch\b/gi, "a mixed picture")
    .replace(
      /\bNo real-money execution or outside AI calls are made\b/gi,
      "No real-money execution happens. Short questions may use live chat when a key is saved",
    )
    .replace(
      /\bNo outside AI calls are made\b/gi,
      "Short questions may use live chat when a key is saved",
    )
    .replace(/\bToday's a mixed picture\b/gi, "today's read")
    .replace(/\bToday’s a mixed picture\b/gi, "today's read")
    .replace(/\ba on-chain\b/gi, "an on-chain")
    .replace(/(^|\n)(\s*\d+\.\s*)a mixed picture\b/gi, "$1$2Mixed picture");
}

function parseProviderLine(line: string, provider: "openai" | "openrouter" | "anthropic") {
  const trimmed = line.trim();

  if (!trimmed.startsWith("data:")) {
    return "";
  }

  const payload = trimmed.slice(5).trim();

  if (!payload || payload === "[DONE]") {
    return "";
  }

  try {
    const json = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string } }>;
      type?: string;
      delta?: { text?: string };
    };

    if (provider === "openai" || provider === "openrouter") {
      return json.choices?.[0]?.delta?.content ?? "";
    }

    return json.type === "content_block_delta" ? json.delta?.text ?? "" : "";
  } catch {
    return "";
  }
}

function textStream(
  body: string | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
) {
  return new Response(typeof body === "string" ? body : body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function chatHeaders(
  context: ReturnType<typeof getChatContext>,
  provider: "canned" | "openai" | "openrouter" | "anthropic",
  model: string,
  budget?: ChatBudget,
) {
  const sources = [
    context.facts.top_holding_context,
    `Top alert: ${context.facts.top_alert_tier} ${context.facts.top_alert}`,
    `Daily read: ${context.facts.briefing_headline}`,
    `Performance history: ${context.facts.decision_accuracy}`,
  ];
  const followups = context.prompts.slice(0, 3).map((prompt) => prompt.prompt);

  return {
    "X-Chat-Mode": provider,
    "X-Chat-Model": model,
    "X-Chat-Sources": encodeHeaderJson(sources),
    "X-Chat-Followups": encodeHeaderJson(followups),
    "X-Chat-Estimated-Prompt-Tokens": String(budget?.estimatedPromptTokens ?? 0),
    "X-Chat-Max-Total-Tokens": String(budget?.maxTotalTokens ?? defaultMaxTotalTokens()),
    "X-Chat-Max-Response-Tokens": String(budget?.maxResponseTokens ?? defaultMaxResponseTokens()),
  };
}

type ChatBudget = {
  ok: boolean;
  estimatedPromptTokens: number;
  estimatedTotalTokens: number;
  maxTotalTokens: number;
  maxResponseTokens: number;
};

function chatBudget(message: string, llmContext: string): ChatBudget {
  const maxResponseTokens = defaultMaxResponseTokens();
  const maxTotalTokens = defaultMaxTotalTokens();
  const estimatedPromptTokens = estimateTokens(`${buildSystemPrompt(llmContext)}\n${message}`);
  const estimatedTotalTokens = estimatedPromptTokens + maxResponseTokens;
  return {
    ok: estimatedTotalTokens <= maxTotalTokens,
    estimatedPromptTokens,
    estimatedTotalTokens,
    maxTotalTokens,
    maxResponseTokens,
  };
}

function defaultMaxResponseTokens() {
  return envInt("MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS", 700, 80, 1600);
}

function defaultMaxTotalTokens() {
  return envInt("MASTERMOLD_CHAT_MAX_TOTAL_TOKENS", 30000, 1000, 200000);
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function envInt(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function encodeHeaderJson(value: unknown) {
  return encodeURIComponent(JSON.stringify(value));
}

function classifyProviderError(status: number, detail: string) {
  const lower = detail.toLowerCase();
  if (status === 401 || status === 403 || lower.includes("auth") || lower.includes("key")) {
    return "auth";
  }
  if (status === 402 || lower.includes("quota") || lower.includes("credit") || lower.includes("balance")) {
    return "quota";
  }
  if (status === 429 || lower.includes("rate limit")) {
    return "rate_limit";
  }
  if (
    status === 404 ||
    lower.includes("model") ||
    lower.includes("not found") ||
    lower.includes("not available")
  ) {
    return "model";
  }
  if (status >= 500) {
    return "provider_down";
  }
  return "provider_error";
}

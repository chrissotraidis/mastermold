import { getChatContext, type ChatPageContext } from "@/src/db/chat";

export type ChatBudget = {
  ok: boolean;
  estimatedPromptTokens: number;
  estimatedTotalTokens: number;
  maxTotalTokens: number;
  maxResponseTokens: number;
};

export function contextWithPageContext(llmContext: string, pageContext?: ChatPageContext) {
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

export function contextWithInferenceBudget(llmContext: string, budget: ChatBudget) {
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

export function buildSystemPrompt(llmContext: string) {
  return [
    "You are an advisory-only financial copilot for Master Mold.",
    "You cannot buy or sell assets, sign transactions, move funds, or imply market-action authority.",
    "The app can create paper trades on the Paper page using simulator dollars. When asked about paper trading an activity item or idea, explain that it is simulated only, not real execution.",
    "Use only the supplied context. Holdings are intentionally abstracted as portfolio-weight ratios and percentages.",
    "When current_surface is present, answer from that page's point of view, but do not claim to see unsent UI details.",
    "Answer the user's exact question first. Do not open with a broad context summary unless they explicitly ask for a summary.",
    "For daily-focus questions such as what to check first, give one top focus, why it matters in plain language, and the next no-trading step.",
    "Answer in plain prose. Do not quote JSON keys, raw context field names, or implementation labels.",
    "Do not call portfolio values live, real-time, connected, synced, or imported unless the plain context summary says imported portfolio.",
    "Avoid toy-sounding paper-trading language plus the phrases live engine output, engine output, actionable, signals, insights, conviction, high-conviction, high-confidence, higher-confidence, higher confidence, highest-confidence, hypothesis, picks, and practice. Say saved market read, things to check, reasons to watch, stronger evidence, confidence, paper trade, review, and strongly scored calls.",
    "When discussing recent calls, group them as strongly scored, middle-scored, or early watchlist calls.",
    "When the portfolio state is Demo data, call it a sample portfolio. When it is Manual portfolio, call it local manual entries; sample holdings are hidden once manual entries exist. When it is Imported portfolio, say imported holdings snapshot plus local manual entries.",
    "Connection checks do not import holdings by themselves. Imported holdings appear only after the explicit Settings import action or Monarch Sync now action.",
    "Imported portfolio holdings are read-only snapshots. If the context says Monarch MCP, fresh, aging, stale, or no automatic refresh, repeat that plainly.",
    "Monarch MCP is portfolio context only. Never imply Robinhood, Monarch, or brokerage order placement is available.",
    "The Today Save context for chat action only saves or refreshes local app context for chat. It does not check the internet, news, connected accounts, or full market research. Do not suggest those checks can be enabled or manually triggered in this app unless context explicitly says they exist.",
    "When discussing Chat context, do not say the user can run checks, load fresh market data, trigger a scan, or manually trigger a scan to fetch fresh market data. Say it saves local app context only.",
    "Do not describe Save context for chat as a way to get live updates. It only saves local context for future chat answers.",
    "If asked whether Master Mold has evidence it can beat the market or a simple baseline, use forward_measurement status. A running measurement window only starts the clock; it needs enough later results before the baseline comparison means anything.",
    "If asked about inference budgets, cost controls, or runaway inference, use inference_budget status. Say live chat has a size limit and oversized questions stop before any live chat request.",
    "Do not say live chat requests never happen. If a live key is saved and the prompt is within budget, chat can use live chat.",
    "For real-vs-sample questions, say saved reads are local saved app data, not live market coverage. Do not call saved-read market moves actual or live; say they were marked as worth checking in the saved read.",
    "Never ask for or reveal account IDs, raw quantities, private keys, tokens, or credentials.",
    "When explaining activity items, start with why the user should care. Do not mention z-scores, z= values, sigma, standard deviations, or raw signal names unless the user asks for raw math.",
    "When explaining borrow-payment or funding activity, do not quote raw rates or open-interest figures unless the user asks for raw math. Say borrow-payment conditions changed and explain whether that matters to the visible portfolio.",
    "Do not tell the user that Master Mold cannot simulate or paper trade. Say it can test paper trades in Paper while still being unable to place real trades.",
    "Keep answers concise and cite the supplied app context by name.",
    `Context JSON: ${llmContext}`,
  ].join("\n");
}

export function chatHeaders(
  context: ReturnType<typeof getChatContext>,
  provider: "canned" | "openai" | "openrouter" | "anthropic",
  model: string,
  budget?: ChatBudget,
) {
  const sources = [
    context.facts.top_holding_context,
    `Top activity item: ${context.facts.top_alert_tier} ${context.facts.top_alert}`,
    `Daily read: ${context.facts.briefing_headline}`,
    `Decision history: ${context.facts.decision_accuracy}`,
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

export function chatBudget(message: string, llmContext: string): ChatBudget {
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

export function defaultMaxResponseTokens() {
  return envInt("MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS", 700, 80, 1600);
}

export function defaultMaxTotalTokens() {
  return envInt("MASTERMOLD_CHAT_MAX_TOTAL_TOKENS", 30000, 1000, 200000);
}

export function encodeHeaderJson(value: unknown) {
  return encodeURIComponent(JSON.stringify(value));
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function envInt(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

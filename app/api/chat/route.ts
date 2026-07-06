import { getChatContext } from "@/src/db/chat";
import {
  chatBudget,
  chatHeaders,
  contextWithInferenceBudget,
  contextWithPageContext,
} from "@/src/chat/context";
import { buildLocalCommandAnswer, localCommandHeaders } from "@/src/chat/local-commands";
import { streamAnthropicResponse } from "@/src/chat/providers/anthropic";
import { streamOpenAIResponse } from "@/src/chat/providers/openai";
import { streamOpenRouterResponse } from "@/src/chat/providers/openrouter";
import { parseChatRequest } from "@/src/chat/request";
import { textStream } from "@/src/chat/streaming";
import {
  buildUserPromptForRequest,
  inferResponseCleanupMode,
} from "@/lib/chat-copy";

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseChatRequest(request);

  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 422 });
  }

  const message = parsed.message || "Summarize the advisory context.";
  const localCommandAnswer = await buildLocalCommandAnswer(message, parsed.pageContext, parsed.asOf);

  if (localCommandAnswer) {
    return textStream(localCommandAnswer.body, localCommandHeaders(parsed.pageContext, localCommandAnswer.actions));
  }

  const context = getChatContext(parsed.asOf);
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

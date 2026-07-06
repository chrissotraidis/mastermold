import { type ChatTextCleanupMode } from "@/lib/chat-copy";
import {
  buildSystemPrompt,
  defaultMaxResponseTokens,
  type ChatBudget,
} from "@/src/chat/context";
import {
  providerErrorResponse,
  streamServerSentEvents,
} from "@/src/chat/streaming";

export async function streamOpenRouterResponse(
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

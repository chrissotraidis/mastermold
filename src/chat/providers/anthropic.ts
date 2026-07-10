import { type ChatTextCleanupMode } from "@/lib/chat-copy";
import {
  buildSystemPrompt,
  defaultMaxResponseTokens,
  type ChatBudget,
} from "@/src/chat/context";
import {
  connectToProvider,
  providerErrorResponse,
  streamServerSentEvents,
} from "@/src/chat/streaming";

export async function streamAnthropicResponse(
  apiKey: string,
  model: string,
  message: string,
  llmContext: string,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
  budget?: ChatBudget,
) {
  const { upstream: response, error } = await connectToProvider(
    "https://api.anthropic.com/v1/messages",
    {
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
    },
    "Anthropic",
    headers,
  );
  if (error) return error;

  if (!response.ok || !response.body) {
    return providerErrorResponse(response, "Anthropic", headers);
  }

  return streamServerSentEvents(response.body, "anthropic", headers, responseMode);
}

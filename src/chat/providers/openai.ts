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

export async function streamOpenAIResponse(
  apiKey: string,
  model: string,
  message: string,
  llmContext: string,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
  budget?: ChatBudget,
) {
  const { upstream: response, error } = await connectToProvider(
    "https://api.openai.com/v1/chat/completions",
    {
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
    },
    "OpenAI",
    headers,
  );
  if (error) return error;

  if (!response.ok || !response.body) {
    return providerErrorResponse(response, "OpenAI", headers);
  }

  return streamServerSentEvents(response.body, "openai", headers, responseMode);
}

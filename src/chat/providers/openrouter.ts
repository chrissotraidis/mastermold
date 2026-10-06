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
import {
  llmProviderDisplayName,
  llmReasoningPayload,
  llmRequestHeaders,
  type LlmEndpoint,
} from "@/src/llm/completion";

/**
 * Streams from any OpenAI-compatible chat endpoint. OpenCode Go and OpenRouter
 * speak the same wire format, so one streamer serves both; the endpoint decides
 * the URL, model, key, and which attribution headers apply.
 */
export async function streamCompatResponse(
  endpoint: LlmEndpoint,
  message: string,
  llmContext: string,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
  budget?: ChatBudget,
) {
  const { upstream: response, error } = await connectToProvider(
    `${endpoint.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: llmRequestHeaders(endpoint, "Master Mold"),
      body: JSON.stringify({
        model: endpoint.model,
        max_tokens: budget?.maxResponseTokens ?? defaultMaxResponseTokens(),
        stream: true,
        temperature: 0.2,
        ...llmReasoningPayload(endpoint),
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
    llmProviderDisplayName(endpoint.label),
    headers,
  );
  if (error) return error;

  if (!response.ok || !response.body) {
    return providerErrorResponse(response, llmProviderDisplayName(endpoint.label), headers);
  }

  return streamServerSentEvents(response.body, endpoint.label, headers, responseMode);
}

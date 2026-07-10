import {
  cleanChatText,
  type ChatTextCleanupMode,
} from "@/lib/chat-copy";

export type ChatProvider = "openai" | "openrouter" | "anthropic";

export async function providerErrorResponse(response: Response, provider: string, headers: Record<string, string>) {
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

// Bounds only the connect phase of a streaming provider call: a provider that
// never answers must not hang the chat panel forever, but once headers arrive
// the streamed reply may take as long as it needs. Also converts plain network
// failures — previously an unhandled 500 — into the same 502 error shape the
// chat client already renders.
const PROVIDER_CONNECT_TIMEOUT_MS = 30_000;

export async function connectToProvider(
  url: string,
  init: RequestInit,
  provider: string,
  headers: Record<string, string>,
): Promise<{ upstream: Response; error?: undefined } | { upstream?: undefined; error: Response }> {
  const connect = new AbortController();
  const timer = setTimeout(() => connect.abort(), PROVIDER_CONNECT_TIMEOUT_MS);
  try {
    return { upstream: await fetch(url, { ...init, signal: connect.signal }) };
  } catch (cause) {
    const timedOut = connect.signal.aborted;
    const code = timedOut ? "provider_down" : "network";
    return {
      error: Response.json(
        {
          error: `${provider} chat request failed`,
          provider,
          code,
          detail: timedOut
            ? `No response from ${provider} within ${PROVIDER_CONNECT_TIMEOUT_MS / 1000}s.`
            : cause instanceof Error
              ? cause.message.slice(0, 300)
              : "Network error reaching the provider.",
        },
        { status: 502, headers: { ...headers, "X-Chat-Error-Code": code } },
      ),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function streamServerSentEvents(
  body: ReadableStream<Uint8Array>,
  provider: ChatProvider,
  headers: Record<string, string>,
  responseMode?: ChatTextCleanupMode,
) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let output = "";
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

export function cleanProviderChatText(output: string, responseMode?: ChatTextCleanupMode) {
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

export function parseProviderLine(line: string, provider: ChatProvider) {
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

export function textStream(
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

export function classifyProviderError(status: number, detail: string) {
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

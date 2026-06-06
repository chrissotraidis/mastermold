import { getChatContext } from "@/src/db/chat";

type ChatRequest = {
  message?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseChatRequest(request);

  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 422 });
  }

  const context = getChatContext();
  const message = parsed.message || "Summarize the seeded advisory context.";
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    return streamAnthropicResponse(anthropicKey, message, context.llm_context);
  }

  if (openaiKey) {
    return streamOpenAIResponse(openaiKey, message, context.llm_context);
  }

  return textStream(context.fallback_response, {
    "X-Chat-Mode": "canned",
  });
}

async function parseChatRequest(request: Request): Promise<
  | {
      ok: true;
      message: string;
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
    return { ok: true, message: "" };
  }

  let body: ChatRequest;

  try {
    body = JSON.parse(text) as ChatRequest;
  } catch {
    return { ok: false, error: "Expected JSON body with a message field" };
  }

  if (body.message === undefined || body.message === null) {
    return { ok: true, message: "" };
  }

  if (typeof body.message !== "string") {
    return { ok: false, error: "message must be a string" };
  }

  const message = body.message.trim();

  if (message.length > 2000) {
    return { ok: false, error: "message must be 2000 characters or fewer" };
  }

  return { ok: true, message };
}

async function streamOpenAIResponse(apiKey: string, message: string, llmContext: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
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
    return providerErrorResponse(response, "OpenAI");
  }

  return streamServerSentEvents(response.body, "openai");
}

async function streamAnthropicResponse(apiKey: string, message: string, llmContext: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
      max_tokens: 700,
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
    return providerErrorResponse(response, "Anthropic");
  }

  return streamServerSentEvents(response.body, "anthropic");
}

function buildSystemPrompt(llmContext: string) {
  return [
    "You are an advisory-only financial copilot for a seeded demo dashboard.",
    "You cannot buy or sell assets, sign transactions, move funds, or imply market-action authority.",
    "Use only the supplied context. Holdings are intentionally abstracted as portfolio-weight ratios and percentages.",
    "Never ask for or reveal account IDs, raw quantities, private keys, tokens, or credentials.",
    "Keep answers concise and cite seeded dashboard elements by name.",
    `Context JSON: ${llmContext}`,
  ].join("\n");
}

async function providerErrorResponse(response: Response, provider: string) {
  const detail = await response.text().catch(() => "");
  return Response.json(
    {
      error: `${provider} chat request failed`,
      detail: detail.slice(0, 300),
    },
    { status: 502 },
  );
}

function streamServerSentEvents(body: ReadableStream<Uint8Array>, provider: "openai" | "anthropic") {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

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

          for (const line of lines) {
            const text = parseProviderLine(line, provider);

            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        }
      } catch (error) {
        controller.error(error);
        return;
      }

      controller.close();
    },
  });

  return textStream(stream, {
    "X-Chat-Mode": provider,
  });
}

function parseProviderLine(line: string, provider: "openai" | "anthropic") {
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

    if (provider === "openai") {
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

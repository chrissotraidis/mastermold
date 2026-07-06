import { parseAsOf, type AsOfFilter } from "@/src/db/bitemporal";
import type { ChatPageContext } from "@/src/db/chat";

export type ChatRequest = {
  message?: unknown;
  messages?: unknown;
  page_context?: unknown;
  as_of?: unknown;
};

export type ParsedChatRequest =
  | {
      ok: true;
      message: string;
      pageContext?: ChatPageContext;
      asOf: AsOfFilter | null;
    }
  | {
      ok: false;
      error: string;
    };

export async function parseChatRequest(request: Request): Promise<ParsedChatRequest> {
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

export function extractLastUserMessage(value: unknown):
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

export function parsePageContext(value: unknown):
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

export function cleanContextField(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function parseChatAsOf(
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

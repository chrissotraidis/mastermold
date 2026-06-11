"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { Bot, SendHorizonal, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SentinelFace } from "@/components/sentinel-face";
import { useFaceActivity } from "@/components/face-activity";
import { cn } from "@/lib/utils";
import { recordProductEvent } from "@/lib/product-metrics";
import type { ChatPageContext, ChatPrompt } from "@/src/db/chat";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: ChatMeta;
};

type ChatMeta = {
  provider: string;
  model: string;
  sources: string[];
  followups: string[];
  status: "ready" | "failed";
  errorCode?: string;
};

let sessionMessages: ChatMessage[] = [];

const defaultPrompts: ChatPrompt[] = [
  {
    id: "today-focus",
    label: "Today focus",
    prompt: "What should I focus on today, using the visible portfolio and market context?",
    reference: "Daily focus",
  },
  {
    id: "portfolio-risk",
    label: "Top risk",
    prompt: "What is the biggest risk in the visible portfolio right now?",
    reference: "Portfolio concentration",
  },
  {
    id: "explain-alert",
    label: "Top alert",
    prompt: "Why does the most important alert matter, and what should I check?",
    reference: "Alert inbox",
  },
  {
    id: "paper-trade",
    label: "Paper test",
    prompt: "If I wanted to test this idea as a paper trade, what setup would make sense?",
    reference: "Paper trading",
  },
];

export function ChatWorkspace({
  prompts = defaultPrompts,
  initialQuery,
  pageContext,
  compact = false,
}: {
  prompts?: ChatPrompt[];
  initialQuery?: string;
  pageContext?: ChatPageContext;
  compact?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(sessionMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const { setSpeaking } = useFaceActivity();
  const threadRef = useRef<HTMLDivElement>(null);
  const sentInitialRef = useRef(false);
  const stopSpeakingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Stop "speaking" when the component unmounts.
  useEffect(() => () => {
    if (stopSpeakingTimer.current) clearTimeout(stopSpeakingTimer.current);
    setSpeaking(false);
  }, [setSpeaking]);

  useEffect(() => {
    sessionMessages = messages;
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Auto-send a query handed in from a route or global drawer action, once.
  useEffect(() => {
    if (initialQuery && !sentInitialRef.current) {
      sentInitialRef.current = true;
      sendMessage(initialQuery, "command");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  function sendMessage(message: string, source: "manual" | "prompt" | "command" | "followup" = "manual") {
    const trimmed = message.trim();

    if (!trimmed || isPending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: makeMessageId("user"),
      role: "user",
      content: trimmed,
    };
    const assistantId = makeMessageId("assistant");

    setDraft("");
    setError("");
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
      },
    ]);

    recordProductEvent({
      event: "chat_sent",
      surface: "chat",
      value: trimmed.length,
      metadata: { source },
    });

    startTransition(async () => {
      if (stopSpeakingTimer.current) clearTimeout(stopSpeakingTimer.current);
      setSpeaking(true);
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: trimmed, page_context: pageContext }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string; code?: string; provider?: string }
            | null;
          const failure = chatFailure(body);
          setError(failure.recovery);
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: failure.message,
                    meta: chatMetaFromHeaders(response, "failed", body?.code),
                  }
                : item,
            ),
          );
          return;
        }

        const meta = chatMetaFromHeaders(response, "ready");
        setMessages((current) =>
          current.map((item) => (item.id === assistantId ? { ...item, meta } : item)),
        );

        await readResponseText(response, (chunk) => {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId ? { ...item, content: item.content + chunk } : item,
            ),
          );
        });
      } catch (caught) {
        const messageText = caught instanceof Error ? caught.message : "Chat request failed.";
        setError(messageText);
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  content: "Couldn't reach the model. No account action happened.",
                  meta: {
                    provider: "network",
                    model: "unavailable",
                    sources: [],
                    followups: [],
                    status: "failed",
                    errorCode: "network",
                  },
                }
              : item,
          ),
        );
      } finally {
        // Keep him visibly mouthing for a beat so even instant replies read as "spoken".
        stopSpeakingTimer.current = setTimeout(() => setSpeaking(false), 700);
      }
    });
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(draft);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className={cn("space-y-4", compact && "h-full")}>
      <div
        ref={threadRef}
        className={cn(
          "overflow-y-auto rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 sm:p-5",
          compact ? "max-h-[min(58vh,32rem)] min-h-[18rem]" : "max-h-[34rem] min-h-[24rem]",
        )}
        aria-live="polite"
        aria-label="Conversation"
      >
        {isEmpty ? (
          <div className={cn("flex flex-col items-center justify-center gap-5 text-center", compact ? "min-h-[16rem]" : "min-h-[20rem]")}>
            <div className={compact ? "size-16" : "size-20"}>
              <SentinelFace state="idle" speaking={isPending} />
            </div>
            <p className="max-w-sm text-sm leading-6 text-on-surface-variant">
              Ask about the page you are on. I answer; I do not trade.
            </p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {prompts.slice(0, 4).map((prompt) => (
                <PromptChip
                  key={prompt.id}
                  label={prompt.label}
                  prompt={prompt.prompt}
                  disabled={isPending}
                  onClick={() => sendMessage(prompt.prompt, "prompt")}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                loading={isPending}
                onFollowup={(followup) => {
                  recordProductEvent({
                    event: "chat_followup_clicked",
                    surface: "chat",
                    metadata: { prompt: followup },
                  });
                  sendMessage(followup, "followup");
                }}
              />
            ))}
          </div>
        )}
      </div>

      {error ? (
        <p className="rounded-md border border-critical/40 bg-critical/10 p-3 text-sm text-critical">
          {error}
        </p>
      ) : null}

      <form className="space-y-3" onSubmit={submitMessage}>
        {!isEmpty ? (
          <div className="flex flex-wrap gap-2">
            {prompts.slice(0, 3).map((prompt) => (
              <PromptChip
                key={prompt.id}
                label={prompt.label}
                prompt={prompt.prompt}
                disabled={isPending}
                onClick={() => sendMessage(prompt.prompt, "prompt")}
              />
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            id="chat-message"
            aria-label="Ask Master Mold"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage(draft);
              }
            }}
            className="min-h-12 w-full resize-y rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
            placeholder="Ask Master Mold anything…"
            rows={1}
            maxLength={2000}
          />
          <Button
            type="submit"
            disabled={isPending || !draft.trim()}
            className="h-12 shrink-0 bg-violet text-void hover:bg-violet"
            aria-label="Send"
          >
            <SendHorizonal aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function PromptChip({
  label,
  prompt,
  disabled,
  onClick,
}: {
  label: string;
  prompt: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Ask: ${prompt}`}
      title={prompt}
      className="min-h-11 rounded-full border border-outline-variant/40 bg-surface-dim/60 px-4 py-2 text-left text-xs text-on-surface-variant transition hover:border-violet/40 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function MessageBubble({
  message,
  loading,
  onFollowup,
}: {
  message: ChatMessage;
  loading: boolean;
  onFollowup: (followup: string) => void;
}) {
  const isUser = message.role === "user";
  const meta = !isUser ? message.meta : undefined;

  return (
    <article className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? <BubbleIcon icon="assistant" /> : null}
      <div
        className={cn(
          "max-w-[min(42rem,88%)] rounded-md border px-4 py-3 text-sm leading-6",
          isUser
            ? "border-violet/30 bg-violet/15 text-on-surface"
            : "border-outline-variant/40 bg-violet/10 text-on-surface-variant",
        )}
      >
        {message.content ? (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap">{message.content}</p>
            {meta ? <ChatContextMeta meta={meta} /> : null}
            {meta && !loading && meta.followups.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-t border-outline-variant/30 pt-3">
                {meta.followups.map((followup) => (
                  <button
                    key={followup}
                    type="button"
                    onClick={() => onFollowup(followup)}
                    className="min-h-11 rounded-full border border-outline-variant/40 bg-surface-dim/60 px-4 py-2 text-left text-xs text-on-surface-variant transition hover:border-violet/40 hover:bg-violet/10 hover:text-on-surface"
                  >
                    {followup}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-outline">{loading ? "Thinking…" : ""}</p>
        )}
      </div>
      {isUser ? <BubbleIcon icon="user" /> : null}
    </article>
  );
}

function ChatContextMeta({ meta }: { meta: ChatMeta }) {
  return (
    <div className="space-y-2 border-t border-outline-variant/30 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-telemetry",
            meta.status === "failed"
              ? "border-critical/40 bg-critical/10 text-critical"
              : "border-violet/35 bg-violet/10 text-violet",
          )}
        >
          {labelProvider(meta.provider)}
        </span>
        <span className="rounded-full border border-outline-variant/35 bg-surface-dim/50 px-2 py-0.5 font-mono text-[10px] text-outline">
          {labelModel(meta.model)}
        </span>
        {meta.status === "failed" ? (
          <span className="rounded-full border border-critical/35 bg-critical/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-telemetry text-critical">
            {labelErrorCode(meta.errorCode)}
          </span>
        ) : null}
      </div>
      {meta.sources.length > 0 ? (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-telemetry text-outline">
            Used this context
          </p>
          <div className="flex flex-wrap gap-1.5">
            {meta.sources.slice(0, 4).map((source) => (
              <span
                key={source}
                className="rounded-full border border-outline-variant/35 bg-surface-dim/45 px-2 py-0.5 text-[11px] text-outline"
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BubbleIcon({ icon }: { icon: "assistant" | "user" }) {
  const Icon = icon === "assistant" ? Bot : UserRound;

  return (
    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-outline-variant/40 bg-surface-low text-on-surface-variant">
      <Icon aria-hidden="true" className="size-4" />
    </div>
  );
}

async function readResponseText(response: Response, onChunk: (chunk: string) => void) {
  if (!response.body) {
    onChunk(await response.text());
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    onChunk(decoder.decode(value, { stream: true }));
  }
}

function makeMessageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function chatMetaFromHeaders(
  response: Response,
  status: ChatMeta["status"],
  errorCode?: string,
): ChatMeta {
  return {
    provider: response.headers.get("X-Chat-Mode") ?? "canned",
    model: response.headers.get("X-Chat-Model") ?? "local-fallback",
    sources: decodeHeaderJson(response.headers.get("X-Chat-Sources"), []),
    followups: decodeHeaderJson(response.headers.get("X-Chat-Followups"), []),
    status,
    errorCode: errorCode ?? response.headers.get("X-Chat-Error-Code") ?? undefined,
  };
}

function decodeHeaderJson(value: string | null, fallback: string[]): string[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : fallback;
  } catch {
    return fallback;
  }
}

function labelProvider(provider: string) {
  if (provider === "openrouter" || provider === "openai" || provider === "anthropic") return "Live chat";
  if (provider === "network") return "Connection issue";
  return "Local answer";
}

function labelModel(model: string) {
  if (model === "local-fallback") return "No key used";
  if (model === "unavailable") return "Unavailable";
  return "Kept short";
}

function labelErrorCode(code?: string) {
  if (code === "budget") return "Budget";
  if (code === "auth") return "Key rejected";
  if (code === "quota") return "Quota";
  if (code === "rate_limit") return "Rate limit";
  if (code === "model") return "Chat model";
  if (code === "provider_down") return "Live chat paused";
  if (code === "network") return "Network";
  return "Chat error";
}

function chatFailure(body: { error?: string; code?: string; provider?: string } | null) {
  if (body?.code === "budget") {
    return {
      message: body.error ?? "This question is too large to send to live chat.",
      recovery: "Ask a shorter question or narrow the page context.",
    };
  }
  if (body?.code === "auth") {
    return {
      message: "The saved chat key was rejected. No account action happened.",
      recovery: "Check the local chat key before trusting live chat.",
    };
  }
  if (body?.code === "quota") {
    return {
      message: "The saved chat key has no available credits or quota. The app context is still visible, but live chat paused.",
      recovery: "Add credits or choose another saved chat key to resume live analysis.",
    };
  }
  if (body?.code === "rate_limit") {
    return {
      message: "Live chat is slowing requests right now. No account action happened.",
      recovery: "Wait a moment, then ask again.",
    };
  }
  if (body?.code === "model") {
    return {
      message: "The selected chat model is unavailable. The app kept the decision flow read-only.",
      recovery: "Pick an available chat model in the local environment.",
    };
  }
  if (body?.code === "provider_down") {
    return {
      message: "Live chat is unavailable right now. No account action happened.",
      recovery: "Try again after the service recovers.",
    };
  }
  return {
    message: body?.error ? friendlyChatError(body.error) : "Chat response failed.",
    recovery: "The live chat request failed. No account action happened.",
  };
}

function friendlyChatError(message: string) {
  return message
    .replace(/\bOpenRouter|OpenAI|Anthropic\b/g, "Live chat")
    .replace(/\bmodel provider\b/gi, "chat service")
    .replace(/\bprovider\b/gi, "service")
    .replace(/\bconfigured model\b/gi, "selected chat model");
}

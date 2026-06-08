"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { Bot, SendHorizonal, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatPrompt } from "@/src/db/chat";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

let sessionMessages: ChatMessage[] = [];

export function ChatWorkspace({
  prompts,
  initialQuery,
}: {
  prompts: ChatPrompt[];
  initialQuery?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(sessionMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const threadRef = useRef<HTMLDivElement>(null);
  const sentInitialRef = useRef(false);

  useEffect(() => {
    sessionMessages = messages;
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Auto-send a query handed in from the command bar (/chat?q=…), once.
  useEffect(() => {
    if (initialQuery && !sentInitialRef.current) {
      sentInitialRef.current = true;
      sendMessage(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  function sendMessage(message: string) {
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

    startTransition(async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: trimmed }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Chat response failed.");
        }

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
                  content:
                    "Couldn't reach my reasoning engine. Nothing was traded or moved. Try again in a moment.",
                }
              : item,
          ),
        );
      }
    });
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(draft);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="space-y-4">
      <div
        ref={threadRef}
        className="max-h-[34rem] min-h-[24rem] overflow-y-auto rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 sm:p-5"
        aria-live="polite"
        aria-label="Conversation"
      >
        {isEmpty ? (
          <div className="flex min-h-[20rem] flex-col items-center justify-center gap-5 text-center">
            <div className="flex size-12 items-center justify-center rounded-md border border-violet/30 bg-violet/10 text-violet">
              <Bot aria-hidden="true" className="size-6" />
            </div>
            <p className="max-w-sm text-sm leading-6 text-on-surface-variant">
              Ask anything about today. The thread holds for this session.
            </p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {prompts.slice(0, 4).map((prompt) => (
                <PromptChip
                  key={prompt.id}
                  label={prompt.prompt}
                  disabled={isPending}
                  onClick={() => sendMessage(prompt.prompt)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} loading={isPending} />
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
                label={prompt.prompt}
                disabled={isPending}
                onClick={() => sendMessage(prompt.prompt)}
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
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Ask: ${label}`}
      className="rounded-full border border-outline-variant/40 bg-surface-dim/60 px-3 py-1.5 text-left text-xs text-on-surface-variant transition hover:border-violet/40 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function MessageBubble({ message, loading }: { message: ChatMessage; loading: boolean }) {
  const isUser = message.role === "user";

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
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <p className="text-outline">{loading ? "Thinking…" : ""}</p>
        )}
      </div>
      {isUser ? <BubbleIcon icon="user" /> : null}
    </article>
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

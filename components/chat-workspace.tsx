"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Bot, SendHorizonal, Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  const [status, setStatus] = useState("Open chat and select a scaffolded prompt or type a message.");
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
    setStatus("Sending message to the advisory chat.");
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
        setStatus("View advisory response. Advisory only - no trade authority.");
      } catch (caught) {
        const messageText = caught instanceof Error ? caught.message : "Chat request failed.";
        setError(messageText);
        setStatus("Chat request failed.");
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  content:
                    "Advisory response unavailable. The app did not place a trade or move funds.",
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

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <section className="min-w-0 space-y-4" aria-labelledby="chat-thread-title">
        <div className="sticky top-0 z-10 rounded-md border border-caution/40 bg-caution px-4 py-3 text-sm font-semibold text-void shadow-lg shadow-void/40">
          <div className="flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            <span>Advisory only - no trade authority</span>
          </div>
        </div>

        <Card className="border-outline-variant/40 bg-surface-high/30">
          <CardHeader className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle id="chat-thread-title" className="text-xl text-on-surface">
                  Agent chat
                </CardTitle>
                <p className="mt-1 text-sm leading-6 text-outline">
                  Select scaffolded prompt chips or send message text to view advisory response
                  from /api/chat.
                </p>
              </div>
              <Badge variant="outline" className="border-violet/40 text-violet">
                Session memory
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <div
              ref={threadRef}
              className="max-h-[32rem] min-h-[22rem] overflow-y-auto rounded-md border border-outline-variant/40 bg-surface-dim/55 p-3 sm:p-4"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className="flex min-h-[18rem] items-center justify-center text-center">
                  <div className="max-w-sm space-y-3">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-md border border-violet/30 bg-violet/10 text-violet">
                      <Bot aria-hidden="true" className="size-6" />
                    </div>
                    <p className="text-sm leading-6 text-on-surface-variant">
                      Open chat with a seeded dashboard question. History persists during this
                      browser session and resets on hard reload.
                    </p>
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

            <p className="sr-only" aria-live="polite">
              {isPending ? "Waiting for advisory response." : status}
            </p>
            <p className="text-sm text-outline">{status}</p>

            <form className="space-y-3" onSubmit={submitMessage}>
              <Label htmlFor="chat-message" className="text-sm font-semibold text-on-surface">
                Message
              </Label>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <textarea
                  id="chat-message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-h-24 w-full resize-y rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                  placeholder="Ask about an alert, holding, briefing card, or decision track record."
                  maxLength={2000}
                />
                <Button
                  type="submit"
                  disabled={isPending || !draft.trim()}
                  className="h-11 bg-violet text-void hover:bg-violet sm:self-end"
                >
                  <SendHorizonal aria-hidden="true" />
                  Send message
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-5">
        <Card className="border-outline-variant/40 bg-surface-high/40">
          <CardHeader className="p-5">
            <div className="flex items-center gap-2">
              <Sparkles aria-hidden="true" className="size-5 text-violet" />
              <CardTitle className="text-lg text-on-surface">Suggested prompts</CardTitle>
            </div>
            <p className="text-sm leading-6 text-outline">
              Select scaffolded prompt type chips tied to seeded dashboard entities.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 pt-0">
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => sendMessage(prompt.prompt)}
                disabled={isPending}
                aria-label={`Select scaffolded prompt: ${prompt.prompt}`}
                className="rounded-md border border-outline-variant/40 bg-surface-dim/60 p-3 text-left transition hover:border-violet/40 hover:bg-violet/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="block text-sm font-semibold text-on-surface">{prompt.prompt}</span>
                <span className="mt-2 block text-xs leading-5 text-outline">
                  {prompt.reference}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </aside>
    </div>
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
          <p className="text-outline">{loading ? "Composing advisory response..." : ""}</p>
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

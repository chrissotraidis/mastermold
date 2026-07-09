"use client";

import { FormEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, CheckCircle2, Loader2, RotateCcw, SendHorizonal, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFaceActivity } from "@/components/face-activity";
import { cn } from "@/lib/utils";
import { recordProductEvent } from "@/lib/product-metrics";
import { commandRoutesForChatDraft, directRouteForChatDraft, routeHintsForChatDraft, submittableCommandRoutesForChatDraft } from "@/lib/chat-route-hints";
import { openMasterMoldCommandRoute } from "@/lib/master-mold-command-routing";
import {
  hrefWithMasterMoldCommandHandoff,
  rememberMasterMoldCommandHandoff,
} from "@/lib/master-mold-command-handoff";
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
  actions: ChatAction[];
  status: "ready" | "failed";
  errorCode?: string;
};

type ChatAction = {
  label: string;
  href: string;
};

type ChatCommandStatus = {
  tone: "ready" | "running";
  label: string;
  detail: string;
};

type ChatEmptyHint = {
  eyebrow?: string;
  title: string;
  detail?: string;
  facts?: Array<{
    label: string;
    value: string;
  }>;
};

const CHAT_HISTORY_LIMIT = 24;
const EMPTY_CHAT_ACTIONS: ChatAction[] = [];
const STREAM_REVEAL_DELAY_MS = 18;
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
    label: "Top activity",
    prompt: "Why does the most important activity item matter, and what should I check?",
    reference: "Activity",
  },
  {
    id: "paper-trade",
    label: "Paper test",
    prompt: "If I wanted to test this idea as a paper trade, what setup would make sense?",
    reference: "Paper trading",
  },
];

const commandPrompts: ChatPrompt[] = [
  {
    id: "command-run-scan",
    label: "Run scan",
    prompt: "Run today's scan.",
    reference: "Today",
  },
  {
    id: "command-add-holding",
    label: "Add holding",
    prompt: "Add holding.",
    reference: "Portfolio",
  },
  {
    id: "command-test-trade",
    label: "Test trade",
    prompt: "Run paper test.",
    reference: "Trade",
  },
  {
    id: "command-import-holdings",
    label: "Import holdings",
    prompt: "Import holdings.",
    reference: "Settings",
  },
  {
    id: "command-save-context",
    label: "Save context",
    prompt: "Save context for chat.",
    reference: "Today",
  },
  {
    id: "command-today",
    label: "Today",
    prompt: "Open Today.",
    reference: "Today",
  },
  {
    id: "command-portfolio",
    label: "Portfolio",
    prompt: "Check portfolio risk.",
    reference: "Portfolio",
  },
  {
    id: "command-activity",
    label: "Activity",
    prompt: "Show urgent activity.",
    reference: "Activity",
  },
  {
    id: "command-trade",
    label: "Trade",
    prompt: "Check Trade.",
    reference: "Trade",
  },
  {
    id: "command-paper",
    label: "Paper",
    prompt: "Prepare paper trade.",
    reference: "Paper trading",
  },
  {
    id: "command-journal",
    label: "Journal",
    prompt: "Open journal.",
    reference: "Decision journal",
  },
  {
    id: "command-settings",
    label: "Setup",
    prompt: "Check setup.",
    reference: "Settings",
  },
];

export function ChatWorkspace({
  prompts = defaultPrompts,
  initialQuery,
  pageContext,
  compact = false,
  compactHeight = "fill",
  emptyStateMode = "standard",
  showCommandShelf = true,
  showComposer = true,
  composerPlacement = "top",
  showThreadControls = false,
  showEmptyPrompts = true,
  emptyStateHint,
  suppressFollowups = false,
  suppressActions = false,
  suppressAnswerDetails = false,
  externalPromptEventName,
  placeholder = "Ask Master Mold...",
  onActionNavigate,
  onConversationStateChange,
}: {
  prompts?: ChatPrompt[];
  initialQuery?: string;
  pageContext?: ChatPageContext;
  compact?: boolean;
  compactHeight?: "fill" | "content";
  emptyStateMode?: "standard" | "quiet" | "none";
  showCommandShelf?: boolean;
  showComposer?: boolean;
  composerPlacement?: "top" | "bottom";
  showThreadControls?: boolean;
  showEmptyPrompts?: boolean;
  emptyStateHint?: ChatEmptyHint;
  suppressFollowups?: boolean;
  suppressActions?: boolean;
  suppressAnswerDetails?: boolean;
  externalPromptEventName?: string;
  placeholder?: string;
  onActionNavigate?: () => void;
  onConversationStateChange?: (hasMessages: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => trimChatMessages(sessionMessages));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [commandStatus, setCommandStatus] = useState<ChatCommandStatus | undefined>();
  const { setSpeaking } = useFaceActivity();
  const router = useRouter();
  const threadRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const sentInitialRef = useRef(false);
  const stopSpeakingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Stop "speaking" when the component unmounts.
  useEffect(
    () => () => {
      if (stopSpeakingTimer.current) clearTimeout(stopSpeakingTimer.current);
      if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
      setSpeaking(false);
    },
    [setSpeaking],
  );

  useEffect(() => {
    sessionMessages = trimChatMessages(messages);
    const node = threadRef.current;

    if (!node) return;

    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
      scrollFrameRef.current = null;
    });
  }, [messages]);

  useEffect(() => {
    onConversationStateChange?.(messages.length > 0);
  }, [messages.length, onConversationStateChange]);

  // Auto-send a query handed in from a route or global drawer action, once.
  useEffect(() => {
    if (initialQuery && !sentInitialRef.current) {
      sentInitialRef.current = true;
      sendMessage(initialQuery, "prompt");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  useEffect(() => {
    if (!externalPromptEventName) return;

    function onExternalPrompt(event: Event) {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      sendMessage(detail?.prompt ?? "", "prompt");
    }

    window.addEventListener(externalPromptEventName, onExternalPrompt);
    return () => window.removeEventListener(externalPromptEventName, onExternalPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPromptEventName, isSending]);

  function sendMessage(message: string, source: "manual" | "prompt" | "command" | "followup" = "manual") {
    const trimmed = message.trim();

    if (!trimmed || isSending) {
      return;
    }

    const shouldUseCommandRouting = source === "manual" || source === "command";
    const directRoute = shouldUseCommandRouting ? directRouteForChatDraft(trimmed, pageContext) : null;
    if (directRoute) {
      setDraft("");
      setError("");
      showRunningCommand(directRoute);
      onActionNavigate?.();
      openMasterMoldCommandRoute(router, directRoute);
      return;
    }

    const userMessage: ChatMessage = {
      id: makeMessageId("user"),
      role: "user",
      content: trimmed,
    };
    const assistantId = makeMessageId("assistant");
    const optimisticMeta = optimisticCommandMeta(trimmed, pageContext);

    setDraft("");
    setError("");
    setCommandStatus(undefined);
    setMessages((current) =>
      trimChatMessages([
        ...current,
        userMessage,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          meta: optimisticMeta,
        },
      ]),
    );

    recordProductEvent({
      event: "chat_sent",
      surface: "chat",
      value: trimmed.length,
      metadata: { source },
    });

    setIsSending(true);
    void (async () => {
      if (stopSpeakingTimer.current) clearTimeout(stopSpeakingTimer.current);
      setSpeaking(true);
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...browserChatKeyHeaders(),
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
            trimChatMessages(
              current.map((item) =>
                item.id === assistantId
                  ? {
                      ...item,
                      content: failure.message,
                      meta: chatMetaFromHeaders(response, "failed", body?.code),
                    }
                  : item,
              ),
            ),
          );
          return;
        }

        const meta = chatMetaFromHeaders(response, "ready");
        setMessages((current) =>
          trimChatMessages(current.map((item) => (item.id === assistantId ? { ...item, meta } : item))),
        );

        await readResponseText(response, (chunk) => {
          setMessages((current) =>
            trimChatMessages(
              current.map((item) =>
                item.id === assistantId ? { ...item, content: item.content + chunk } : item,
              ),
            ),
          );
        });
      } catch (caught) {
        const messageText = caught instanceof Error ? caught.message : "Chat request failed.";
        setError(messageText);
        setMessages((current) =>
          trimChatMessages(
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
                      actions: [],
                      status: "failed",
                      errorCode: "network",
                    },
                  }
                : item,
            ),
          ),
        );
      } finally {
        setIsSending(false);
        // Keep him visibly mouthing for a beat so even instant replies read as "spoken".
        stopSpeakingTimer.current = setTimeout(() => setSpeaking(false), 700);
      }
    })();
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(draft);
  }

  function resetConversation() {
    sessionMessages = [];
    setMessages([]);
    setDraft("");
    setError("");
    recordProductEvent({
      event: "chat_followup_clicked",
      surface: "chat",
      metadata: { prompt: "New chat" },
    });
  }

  const isEmpty = messages.length === 0;
  const latestAssistantId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === "assistant") return messages[index].id;
    }
    return undefined;
  }, [messages]);
  const quickCommands = useMemo(
    () => commandPrompts.filter(
      (command) => !prompts.some((prompt) => prompt.id === command.id || prompt.label === command.label),
    ),
    [prompts],
  );
  const trimmedDraft = draft.trim();
  const composerRouteMeta = useMemo(
    () => optimisticCommandMeta(trimmedDraft, pageContext),
    [pageContext, trimmedDraft],
  );
  const composerActions = composerRouteMeta?.actions ?? EMPTY_CHAT_ACTIONS;
  const readyComposerAction = useMemo(
    () => (trimmedDraft ? submittableCommandRoutesForChatDraft(trimmedDraft, pageContext)[0] : undefined),
    [pageContext, trimmedDraft],
  );
  const visibleComposerStatus = commandStatus ?? (readyComposerAction
    ? {
        tone: "ready" as const,
        label: readyComposerAction.label,
        detail: "Ready. Press Enter or choose a route.",
      }
    : undefined);
  const promptPrefetchRoutes = useMemo(
    () => prefetchablePromptRoutes([...prompts, ...quickCommands], pageContext),
    [pageContext, prompts, quickCommands],
  );
  const actionPrefetchKey = useMemo(
    () => [
      ...prefetchableChatActionRoutes(messages, composerActions),
      ...promptPrefetchRoutes,
    ].join("|"),
    [composerActions, messages, promptPrefetchRoutes],
  );

  useEffect(() => {
    if (!actionPrefetchKey) return;

    for (const href of actionPrefetchKey.split("|")) {
      router.prefetch(href);
    }
  }, [actionPrefetchKey, router]);

  function showRunningCommand(action: ChatAction) {
    setCommandStatus({
      tone: "running",
      label: action.label,
      detail: "Master Mold is opening it now.",
    });
  }

  function prepareCommandNavigation(action: ChatAction) {
    setDraft("");
    setError("");
    showRunningCommand(action);
    rememberMasterMoldCommandHandoff(action);
    onActionNavigate?.();
  }

  return (
    <div
      className={cn(
        "space-y-4",
        compact && "space-y-2.5",
        compact && compactHeight === "fill" && "flex h-full min-h-0 flex-1 flex-col",
        composerPlacement === "bottom" && (compact ? "flex flex-col gap-1.5 space-y-0" : "flex flex-col gap-2.5 space-y-0"),
      )}
      data-testid="chat-workspace"
    >
      {showComposer ? (
        <form
          className={cn(
            "z-20 rounded-md border border-outline-variant/30 bg-surface-low/80 p-2 shadow-[0_8px_22px_rgba(15,9,11,0.10)] backdrop-blur-xl",
            compact && "p-1.5",
            composerPlacement === "bottom" ? "relative order-3" : "sticky",
            composerPlacement === "bottom" && compactHeight === "fill" && "mt-auto",
            composerPlacement !== "bottom" && (compact ? "top-0" : "top-20"),
          )}
          onSubmit={submitMessage}
          data-testid="chat-composer"
        >
          {isEmpty && showEmptyPrompts ? (
            <PromptRail
              prompts={prompts}
              compact={compact && composerPlacement === "bottom"}
              disabled={isSending}
              onPrompt={(prompt) => sendMessage(prompt.prompt, "prompt")}
            />
          ) : null}
          <div className="flex items-end gap-1.5">
            <textarea
              id="chat-message"
              aria-label="Ask Master Mold"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setCommandStatus(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (readyComposerAction) {
                    prepareCommandNavigation(readyComposerAction);
                    openMasterMoldCommandRoute(router, readyComposerAction);
                    return;
                  }
                  sendMessage(draft);
                }
              }}
              className="min-h-11 max-h-32 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-md border border-transparent bg-void/25 px-3 py-2.5 text-sm leading-5 text-on-surface placeholder:text-outline focus-visible:border-violet/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              placeholder={placeholder}
              rows={1}
              maxLength={2000}
            />
            {readyComposerAction && !isSending ? (
              <Link
                href={hrefWithMasterMoldCommandHandoff(readyComposerAction)}
                onClick={() => prepareCommandNavigation(readyComposerAction)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-violet text-sm font-semibold text-void transition hover:bg-violet/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                aria-label="Send"
              >
                <SendHorizonal aria-hidden="true" />
              </Link>
            ) : (
              <Button
                type="submit"
                disabled={isSending || !draft.trim()}
                className="size-11 shrink-0 rounded-md bg-violet p-0 text-void hover:bg-violet"
                aria-label="Send"
              >
                <SendHorizonal aria-hidden="true" />
              </Button>
            )}
          </div>
          {visibleComposerStatus ? <ChatComposerStatusLine status={visibleComposerStatus} /> : null}
          {composerActions.length > 0 ? (
            <ComposerActionButtons
              actions={composerActions}
              onActionStart={showRunningCommand}
              onNavigate={onActionNavigate}
            />
          ) : null}
        </form>
      ) : null}

      {showCommandShelf ? (
        <div className={cn("rounded-lg border border-outline-variant/35 bg-surface-high/25 p-3", compact && "p-2.5")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-telemetry text-outline">Ask Master Mold</p>
            {!isEmpty ? (
              <button
                type="button"
                onClick={resetConversation}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface-variant transition hover:border-violet/40 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              >
                <RotateCcw aria-hidden="true" className="size-3.5" />
                New chat
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(compact ? quickCommands.slice(0, 4) : quickCommands).map((prompt) => (
              <CommandButton
                key={prompt.id}
                label={prompt.label}
                prompt={prompt.prompt}
                action={directRouteForChatDraft(prompt.prompt, pageContext)}
                disabled={isSending}
                onActionStart={showRunningCommand}
                onNavigate={onActionNavigate}
                onClick={() => sendMessage(prompt.prompt, "command")}
              />
            ))}
          </div>
        </div>
      ) : null}

      {showThreadControls && !isEmpty ? (
        <ChatThreadControls
          compact={compact}
          messageCount={messages.length}
          disabled={isSending}
          onReset={resetConversation}
        />
      ) : null}

      <div
        ref={threadRef}
        className={cn(
          "overflow-x-hidden overflow-y-auto rounded-lg border border-outline-variant/30 bg-void/15 p-3 shadow-inner shadow-void/15 sm:p-4",
          composerPlacement === "bottom" && "order-2",
          isEmpty && emptyStateMode === "none" && "hidden",
          compact
            ? cn(
                "rounded-none border-0 bg-transparent p-0 shadow-none",
                compactHeight === "fill"
                  ? "max-h-full flex-1"
                  : "max-h-[min(20rem,calc(100vh-16rem))]",
                emptyStateMode === "quiet"
                  ? compactHeight === "fill" ? "min-h-[8rem]" : "min-h-[2.5rem]"
                  : "min-h-[8.5rem]",
              )
            : "max-h-[32rem] min-h-[14rem]",
        )}
        aria-live="polite"
        aria-label="Conversation"
      >
        {isEmpty ? (
          emptyStateMode === "none" && compact ? null :
          emptyStateMode === "quiet" && compact ? (
            <QuietEmptyState hint={emptyStateHint} />
          ) : (
            <div
              className={cn(
                "flex text-on-surface-variant",
                compact
                  ? "h-full min-h-[8rem] flex-col items-center justify-center gap-1 px-4 text-center"
                  : "min-h-[12rem] flex-col items-center justify-center gap-4 text-center",
              )}
            >
              {/* Text-only empty state: the face already lives in the drawer/top
                  chrome, and repeating it read as clutter. */}
              <div className="flex flex-col items-center gap-1 text-center">
                <p className={cn("max-w-sm leading-6 text-on-surface", compact ? "text-sm leading-5" : "text-sm")}>
                  Ask about any holding, alert, or what to do next.
                </p>
                <p className={cn("text-outline", compact ? "text-[11px] leading-4" : "text-xs")}>
                  I explain and summarize; I do not trade.
                </p>
              </div>
              {/* Starter chips render once. With a bottom composer they live in
                  the composer's PromptRail, so the greeting stays text-only. */}
              {showEmptyPrompts && composerPlacement !== "bottom" ? (
                <div className={cn("flex max-w-lg flex-wrap justify-center gap-2", compact && "mt-2")}>
                  {prompts.slice(0, compact ? 3 : 4).map((prompt) => (
                    <PromptChip
                      key={prompt.id}
                      label={prompt.label}
                      prompt={prompt.prompt}
                      disabled={isSending}
                      onClick={() => sendMessage(prompt.prompt, "prompt")}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )
        ) : (
          <div className={cn("space-y-2.5", compact && "space-y-2 pb-0")}>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                compact={compact}
                loading={isSending && message.role === "assistant" && message.id === messages[messages.length - 1]?.id}
                showControls={message.role === "assistant" && message.id === latestAssistantId}
                suppressFollowups={suppressFollowups || Boolean(trimmedDraft)}
                suppressActions={suppressActions}
                suppressAnswerDetails={suppressAnswerDetails}
                onActionNavigate={onActionNavigate}
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
        <p className="rounded-lg border border-critical/40 bg-critical/10 p-3 text-sm text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChatThreadControls({
  compact,
  messageCount,
  disabled,
  onReset,
}: {
  compact: boolean;
  messageCount: number;
  disabled: boolean;
  onReset: () => void;
}) {
  const turnCount = Math.max(1, Math.ceil(messageCount / 2));
  const turnLabel = `${turnCount} ${turnCount === 1 ? "turn" : "turns"}`;

  return (
    <div
      className={cn(
        "order-1 flex min-h-11 items-center justify-between gap-2 rounded-md border border-outline-variant/20 bg-surface-high/15 px-2 py-1 text-[11px] leading-4 text-outline",
        !compact && "min-h-11 rounded-lg px-3 text-xs",
      )}
      data-testid="chat-thread-controls"
    >
      <div className="min-w-0">
        <span className="font-semibold text-on-surface">Thread </span>
        <span className="text-outline">{turnLabel}</span>
      </div>
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-md border border-outline-variant/25 bg-void/15 px-2 text-[11px] font-semibold text-on-surface-variant transition hover:border-violet/35 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Start a new chat"
      >
        <RotateCcw aria-hidden="true" className="size-3" />
        New
      </button>
    </div>
  );
}

function QuietEmptyState({ hint }: { hint?: ChatEmptyHint }) {
  if (!hint) {
    return (
      <div className="grid min-h-full content-center rounded-md border border-outline-variant/20 bg-surface-high/15 px-3 py-2 text-[11px] leading-4 text-outline">
        <span className="font-semibold text-on-surface">Ready.</span>
        {" "}
        <span>Ask for the move, the risk, or the next check.</span>
      </div>
    );
  }

  return (
    <section
      className="grid min-h-full content-start gap-2 px-1 py-1 text-left"
      aria-label={hint.eyebrow ?? "Chat starting point"}
      data-testid="chat-empty-hint"
    >
      <div className="min-w-0">
        {hint.eyebrow ? (
          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-outline">{hint.eyebrow}</p>
        ) : null}
        <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-on-surface">{hint.title}</p>
        {hint.detail ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{hint.detail}</p>
        ) : null}
      </div>
      {hint.facts?.length ? (
        <dl className="grid grid-cols-2 gap-1">
          {hint.facts.slice(0, 2).map((fact) => (
            <div
              key={`${fact.label}-${fact.value}`}
              className="min-w-0 rounded-md border border-outline-variant/15 bg-void/15 px-2 py-1"
            >
              <dt className="truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-outline">{fact.label}</dt>
              <dd className="mt-0.5 truncate text-[11px] font-semibold text-on-surface-variant">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function PromptRail({
  prompts,
  compact,
  disabled,
  onPrompt,
}: {
  prompts: ChatPrompt[];
  compact: boolean;
  disabled: boolean;
  onPrompt: (prompt: ChatPrompt) => void;
}) {
  const visiblePrompts = prompts.slice(0, 3);

  if (!compact) {
    return (
      <div className="mb-1.5 flex flex-wrap gap-1.5" data-testid="chat-prompt-rail">
        {visiblePrompts.map((prompt) => (
          <PromptChip
            key={prompt.id}
            label={prompt.label}
            prompt={prompt.prompt}
            disabled={disabled}
            onClick={() => onPrompt(prompt)}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="mb-1 flex min-w-0 gap-1"
      data-testid="chat-prompt-rail"
      data-chat-prompt-rail="compact"
    >
      {visiblePrompts.map((prompt) => (
        <button
          key={prompt.id}
          type="button"
          onClick={() => onPrompt(prompt)}
          disabled={disabled}
          aria-label={`Ask: ${prompt.prompt}`}
          title={prompt.prompt}
          className="min-h-11 min-w-0 flex-1 truncate rounded-md bg-surface-high/[0.06] px-2 text-center text-[11px] font-semibold leading-4 text-on-surface-variant transition hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-50"
        >
          {prompt.label}
        </button>
      ))}
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
      className="min-h-11 rounded-md border border-outline-variant/22 bg-surface-dim/28 px-3 py-1.5 text-left text-xs text-on-surface-variant transition hover:border-violet/35 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function CommandButton({
  label,
  prompt,
  action,
  disabled,
  onActionStart,
  onNavigate,
  onClick,
}: {
  label: string;
  prompt: string;
  action?: ChatAction | null;
  disabled: boolean;
  onActionStart?: (action: ChatAction) => void;
  onNavigate?: () => void;
  onClick: () => void;
}) {
  const className =
    "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-outline-variant/35 bg-surface-dim/50 px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:border-violet/40 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-50";

  if (action && !disabled) {
    return (
      <Link
        href={hrefWithMasterMoldCommandHandoff(action)}
        onClick={() => {
          onActionStart?.(action);
          rememberMasterMoldCommandHandoff(action);
          onNavigate?.();
        }}
        title={prompt}
        aria-label={`Ask Master Mold: ${prompt}`}
        className={className}
      >
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={prompt}
      aria-label={`Ask Master Mold: ${prompt}`}
      className={className}
    >
      {label}
    </button>
  );
}

const MessageBubble = memo(function MessageBubble({
  message,
  compact,
  loading,
  showControls,
  suppressFollowups,
  suppressActions,
  suppressAnswerDetails,
  onActionNavigate,
  onFollowup,
}: {
  message: ChatMessage;
  compact: boolean;
  loading: boolean;
  showControls: boolean;
  suppressFollowups: boolean;
  suppressActions: boolean;
  suppressAnswerDetails: boolean;
  onActionNavigate?: () => void;
  onFollowup: (followup: string) => void;
}) {
  const isUser = message.role === "user";
  const meta = !isUser ? message.meta : undefined;
  const showCompletedMeta = Boolean(meta && !loading && message.content && (!compact || meta.status === "failed"));
  const showActionStrip = Boolean(showControls && !suppressActions && meta && meta.actions.length > 0);
  const showFollowups = Boolean(showControls && !suppressFollowups && meta && meta.actions.length === 0 && meta.followups.length > 0);

  if (compact && isUser) {
    // Compact user turn: a real right-aligned bubble, so the thread reads as a
    // conversation instead of a receipt strip bolted above each answer.
    return (
      <article className="flex justify-end pt-1 first:pt-0" data-testid="compact-user-receipt">
        <p className="min-w-0 max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm border border-violet/20 bg-violet/10 px-2.5 py-1.5 text-sm leading-5 text-on-surface">
          {message.content}
        </p>
      </article>
    );
  }

  return (
    <article className={cn("flex gap-2.5", compact && "gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && !compact ? <BubbleIcon icon="assistant" compact={compact} /> : null}
      <div
        className={cn(
          "text-sm leading-6",
          compact
            ? isUser
              ? "max-w-[86%] rounded-md border border-violet/20 bg-violet/10 px-2.5 py-1.5 text-sm leading-5 text-on-surface shadow-none"
              : // Assistant turn: quiet left accent instead of a floating block,
                // so answers stay visually anchored without a boxy bubble.
                "min-w-0 max-w-full border-l-2 border-violet/30 bg-transparent py-0.5 pl-2.5 pr-0 text-sm leading-5 text-on-surface shadow-none"
            : cn(
                "max-w-[min(42rem,90%)] rounded-lg border px-3.5 py-2.5 shadow-sm shadow-void/5",
                isUser
                  ? "border-violet/25 bg-violet/10 text-on-surface"
                  : "border-outline-variant/20 bg-surface-high/20 text-on-surface-variant",
              ),
        )}
      >
        {message.content ? (
          <div className={cn("space-y-3", compact && "space-y-1.5")}>
            <MessageContent
              content={message.content}
              isUser={isUser}
              compact={compact}
              suppressAnswerDetails={suppressAnswerDetails}
            />
            {meta && showCompletedMeta ? <ChatContextMeta meta={meta} /> : null}
            {meta && !loading && message.content && showActionStrip ? (
              <MessageActionStrip actions={meta.actions} compact={compact} onNavigate={onActionNavigate} />
            ) : null}
            {meta && showCompletedMeta && showFollowups ? (
              <FollowupChips followups={meta.followups} onFollowup={onFollowup} />
            ) : null}
          </div>
        ) : (
          <div className={cn("space-y-3", compact && "space-y-1.5")}>
            <p className={cn("text-outline", loading && "animate-pulse")}>{loading ? "Thinking..." : ""}</p>
            {meta && showActionStrip ? (
              <MessageActionStrip actions={meta.actions} compact={compact} onNavigate={onActionNavigate} />
            ) : null}
          </div>
        )}
      </div>
      {isUser ? <BubbleIcon icon="user" compact={compact} /> : null}
    </article>
  );
}, areChatMessagePropsEqual);

function MessageContent({
  content,
  isUser,
  compact,
  suppressAnswerDetails,
}: {
  content: string;
  isUser: boolean;
  compact: boolean;
  suppressAnswerDetails: boolean;
}) {
  // Model-proposed action (docs/chat-actions.md): a trailing ```action fenced
  // block becomes a confirm chip; the raw JSON never renders.
  const action = !isUser ? extractChatActionBlock(content) : null;
  const visible = action
    ? content.replace(action.blockText, "").replace(/\n{3,}/g, "\n\n").trim()
    : content;

  const structuredAnswer = !isUser ? parseStructuredAnswer(visible) : null;

  const body = structuredAnswer ? (
    <StructuredAnswer answer={structuredAnswer} compact={compact} suppressDetails={suppressAnswerDetails} />
  ) : (
    <p className="whitespace-pre-wrap">{visible}</p>
  );
  if (!action) return body;
  return (
    <>
      {body}
      <ActionConfirmChip intent={action.intent} />
    </>
  );
}

type ChatActionIntentLike = { kind: string; [key: string]: unknown };

/** Client-side mirror of src/chat/actions.ts extractActionBlock — parse only,
 * no validation (the server endpoint re-validates before executing). */
function extractChatActionBlock(text: string): { intent: ChatActionIntentLike; blockText: string } | null {
  const match = text.match(/```action\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as ChatActionIntentLike;
    return parsed && typeof parsed.kind === "string" ? { intent: parsed, blockText: match[0] } : null;
  } catch {
    return null;
  }
}

function describeChatActionIntent(intent: ChatActionIntentLike): string {
  if (intent.kind === "halt") return "Engage the kill switch (halts the bot)";
  if (intent.kind === "stop") return "Stop the bot";
  if (intent.kind === "arm_paper") return "Arm paper trading";
  if (intent.kind === "ack_alert") return `Acknowledge alert`;
  if (intent.kind === "set_param" && intent.changes && typeof intent.changes === "object") {
    return `Change: ${Object.entries(intent.changes as Record<string, unknown>)
      .map(([key, value]) => `${key} → ${String(value)}`)
      .join(", ")}`;
  }
  return intent.kind;
}

function ActionConfirmChip({ intent }: { intent: ChatActionIntentLike }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [result, setResult] = useState("");

  async function run() {
    setState("busy");
    try {
      const response = await fetch("/api/chat/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      setResult(payload?.message ?? (response.ok ? "Done." : "The action did not apply."));
      setState(payload?.ok ? "done" : "failed");
    } catch {
      setResult("The action could not reach the server.");
      setState("failed");
    }
  }

  if (state === "done" || state === "failed") {
    return (
      <p className={cn("mt-2 text-xs", state === "done" ? "text-engine" : "text-caution")}>
        {state === "done" ? "✓ " : "✗ "}
        {result}
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={run}
      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-violet/40 bg-violet/10 px-3 text-xs font-semibold text-violet transition-colors hover:bg-violet/20 disabled:opacity-60"
    >
      {state === "busy" ? "Applying…" : `Confirm: ${describeChatActionIntent(intent)}`}
    </button>
  );
}

type StructuredAnswer = {
  title: string;
  rows: Array<{
    label: string;
    body: string;
  }>;
};

function parseStructuredAnswer(content: string): StructuredAnswer | null {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0]?.replace(/:$/u, "") ?? "";

  if (!["Today check", "Portfolio check", "Activity check"].includes(title)) return null;

  const rows = lines.slice(1).flatMap((line) => {
    const match = /^(Focus|Reason|Why|Value|Exposure|Source|Status|Top|Risk|Next):\s*(.+)$/u.exec(line);
    return match ? [{ label: match[1], body: match[2] }] : [];
  });

  return rows.length >= 2 ? { title, rows } : null;
}

function StructuredAnswer({
  answer,
  compact,
  suppressDetails,
}: {
  answer: StructuredAnswer;
  compact: boolean;
  suppressDetails: boolean;
}) {
  const primaryRow = answer.rows.find((row) => ["Focus", "Top", "Status", "Value", "Exposure"].includes(row.label)) ?? answer.rows[0];
  const supportingRows = answer.rows.filter((row) => row !== primaryRow);
  const nextRow = answer.rows.find((row) => row.label === "Next");
  const detailRows = supportingRows.filter((row) => row !== nextRow);
  const visibleReasonRow =
    detailRows.find((row) => ["Reason", "Why", "Risk"].includes(row.label)) ?? detailRows[0] ?? null;

  if (compact) {
    return (
      <section
        aria-label={answer.title}
        className="rounded-md border border-outline-variant/10 bg-transparent px-0.5 py-0 text-xs leading-4 shadow-none"
        data-testid="structured-chat-answer"
      >
        <span className="sr-only" data-testid="structured-chat-answer-primary">
          {answer.title} · {primaryRow.label}
        </span>
        <p className="line-clamp-2 text-sm font-semibold leading-5 text-on-surface" data-testid="structured-chat-answer-row">
          {primaryRow.body}
        </p>
        {suppressDetails && visibleReasonRow ? (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-on-surface-variant" data-testid="structured-chat-answer-row">
            <span className="font-semibold text-outline">{visibleReasonRow.label}: </span>
            <span>{visibleReasonRow.body}</span>
          </p>
        ) : null}
        {nextRow ? (
          <p className="mt-1 rounded-md bg-violet/10 px-2 py-1 text-[12px] leading-4 text-on-surface" data-testid="structured-chat-answer-row">
            <span className="font-semibold text-violet">Next: </span>
            <span>{nextRow.body}</span>
          </p>
        ) : null}
        {!suppressDetails && detailRows.length > 0 ? (
          <details className="group mt-0.5" data-testid="structured-chat-answer-details">
            <summary className="flex min-h-7 cursor-pointer list-none items-center text-[11px] font-semibold text-outline transition hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet [&::-webkit-details-marker]:hidden">
              Proof
            </summary>
            <dl className="grid gap-0.5 pb-1">
              {detailRows.map((row) => (
                <div
                  key={`${row.label}-${row.body}`}
                  className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-1.5 px-1 py-0.5"
                  data-testid="structured-chat-answer-row"
                >
                  <dt className="pt-px text-[9px] font-semibold uppercase tracking-normal text-violet">{row.label}</dt>
                  <dd className="min-w-0 line-clamp-2 text-on-surface-variant">
                    {row.body}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-label={answer.title}
      className={cn(
        "rounded-lg border border-outline-variant/15 bg-surface-high/10 p-2.5 shadow-inner shadow-void/10",
        compact ? "rounded-md border-outline-variant/10 bg-surface-high/10 p-2 text-xs leading-4 shadow-none" : "text-sm leading-5",
      )}
      data-testid="structured-chat-answer"
    >
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-normal text-outline">
        <span>{answer.title}</span>
        <span className={cn("rounded-full border border-violet/25 bg-violet/10 px-2 py-0.5 text-violet", compact && "border-0 bg-transparent px-0")} data-testid="structured-chat-answer-primary">
          {primaryRow.label} first
        </span>
      </div>
      <dl className={cn("mt-2 grid", compact ? "gap-1" : "gap-1.5")}>
        <div
          className={cn("rounded-md bg-violet/10 px-2.5 py-2", compact && "px-2 py-1.5")}
          data-testid="structured-chat-answer-row"
        >
          <dt className="text-[9px] font-semibold uppercase tracking-normal text-violet">{primaryRow.label}</dt>
          <dd className="mt-0.5 min-w-0 line-clamp-2 text-on-surface">
            {primaryRow.body}
          </dd>
        </div>
        {supportingRows.map((row) => (
          <div
            key={`${row.label}-${row.body}`}
            className={cn(
              "grid grid-cols-[3.75rem_minmax(0,1fr)] gap-2 rounded-md bg-surface-dim/15 px-2 py-1.5",
              compact && "grid-cols-[3.25rem_minmax(0,1fr)] gap-1.5 bg-transparent px-1 py-1",
            )}
            data-testid="structured-chat-answer-row"
          >
            <dt className="pt-px text-[9px] font-semibold uppercase tracking-normal text-violet">{row.label}</dt>
            <dd className="min-w-0 line-clamp-2 text-on-surface-variant">
              {row.body}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function areChatMessagePropsEqual(
  prev: {
    message: ChatMessage;
    compact: boolean;
    loading: boolean;
    showControls: boolean;
    suppressFollowups: boolean;
    suppressActions: boolean;
    suppressAnswerDetails: boolean;
    onActionNavigate?: () => void;
    onFollowup: (followup: string) => void;
  },
  next: {
    message: ChatMessage;
    compact: boolean;
    loading: boolean;
    showControls: boolean;
    suppressFollowups: boolean;
    suppressActions: boolean;
    suppressAnswerDetails: boolean;
    onActionNavigate?: () => void;
    onFollowup: (followup: string) => void;
  },
) {
  return (
    prev.message === next.message &&
    prev.loading === next.loading &&
    prev.compact === next.compact &&
    prev.showControls === next.showControls &&
    prev.suppressFollowups === next.suppressFollowups &&
    prev.suppressActions === next.suppressActions &&
    prev.suppressAnswerDetails === next.suppressAnswerDetails
  );
}

function MessageActionStrip({
  actions,
  compact = false,
  onNavigate,
}: {
  actions: ChatAction[];
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const [primaryAction, ...secondaryActions] = actions.slice(0, 4);
  const visibleSecondaryActions = compact ? [] : secondaryActions;
  if (!primaryAction) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", compact ? "pt-0" : "pt-1")} data-testid="message-action-strip">
      <Link
        href={hrefWithMasterMoldCommandHandoff(primaryAction)}
        onClick={() => {
          rememberMasterMoldCommandHandoff(primaryAction);
          onNavigate?.();
        }}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 border border-violet/25 bg-violet/10 text-xs font-semibold text-violet transition hover:border-violet/45 hover:bg-violet/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
          compact
            ? "min-h-7 rounded-md border-outline-variant/20 bg-surface-high/15 px-2 py-0 text-[12px] hover:bg-violet/10 hover:text-on-surface"
            : "min-h-11 rounded-full px-3 py-1.5",
        )}
      >
        {primaryAction.label}
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
      {visibleSecondaryActions.length > 0 ? (
        <details className="group w-full min-w-0 sm:w-auto sm:min-w-40">
          <summary className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-outline-variant/25 bg-surface-dim/20 px-3 py-1.5 text-xs font-semibold text-outline transition hover:border-violet/35 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:w-auto">
            More actions
            <ArrowRight aria-hidden="true" className="size-3.5 rotate-90" />
          </summary>
          <div
            className="mt-1 grid w-full gap-1 rounded-md border border-outline-variant/30 bg-surface-dim/25 p-1.5 sm:min-w-40"
            data-testid="message-secondary-actions"
          >
            {visibleSecondaryActions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={hrefWithMasterMoldCommandHandoff(action)}
                onClick={() => {
                  rememberMasterMoldCommandHandoff(action);
                  onNavigate?.();
                }}
                className="inline-flex min-h-11 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              >
                {action.label}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function FollowupChips({
  followups,
  onFollowup,
}: {
  followups: string[];
  onFollowup: (followup: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1" data-testid="message-followup-chips">
      {followups.slice(0, 3).map((followup) => (
        <button
          key={followup}
          type="button"
          onClick={() => onFollowup(followup)}
          className="min-h-11 rounded-full border border-outline-variant/25 bg-transparent px-3 py-1 text-left text-xs text-outline transition hover:border-violet/35 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
        >
          {followup}
        </button>
      ))}
    </div>
  );
}

function ComposerActionButtons({
  actions,
  onActionStart,
  onNavigate,
}: {
  actions: ChatAction[];
  onActionStart?: (action: ChatAction) => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Ready Master Mold routes" data-testid="composer-ready-routes">
      {actions.slice(0, 3).map((action) => (
        <Link
          key={`${action.href}-${action.label}`}
          href={hrefWithMasterMoldCommandHandoff(action)}
          onClick={() => {
            onActionStart?.(action);
            rememberMasterMoldCommandHandoff(action);
            onNavigate?.();
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/35 bg-surface-dim/50 px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:border-violet/40 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

function ChatComposerStatusLine({ status }: { status: ChatCommandStatus }) {
  const Icon = status.tone === "running" ? Loader2 : CheckCircle2;

  return (
    <div
      className={cn(
        "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5",
        status.tone === "running"
          ? "border-violet/35 bg-violet/10 text-on-surface"
          : "border-outline-variant/40 bg-surface-dim/70 text-on-surface-variant",
      )}
      data-testid="chat-composer-status"
      aria-live="polite"
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-3.5 shrink-0 text-violet", status.tone === "running" && "animate-spin")}
      />
      <span className="min-w-0">
        <span className="font-semibold text-on-surface">{status.label}</span>
        {" "}
        <span className="block" aria-label={status.detail}>
          {status.detail}
        </span>
      </span>
    </div>
  );
}

function ChatContextMeta({ meta }: { meta: ChatMeta }) {
  const statusLabel = meta.status === "failed" ? "Failed" : shortProviderLabel(meta.provider);
  const sourceLabel = meta.sources.length > 0 ? meta.sources.slice(0, 2).join(" + ") : "This view";
  const modelLabel = meta.status === "failed" ? labelErrorCode(meta.errorCode) : labelModel(meta.model);

  return (
    <details className="group" data-testid="chat-context-meta">
      <summary
        className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border border-outline-variant/20 bg-surface-dim/15 px-2.5 text-[10px] font-semibold uppercase tracking-normal text-outline/80 transition hover:border-violet/30 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
        title="Answer source and context"
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            meta.status === "failed" ? "bg-critical" : "bg-violet",
          )}
          aria-hidden="true"
        />
        <span>{statusLabel}</span>
        <span aria-hidden="true" className="text-outline/45">/</span>
        <span className="max-w-28 truncate normal-case">{sourceLabel}</span>
        <span className="sr-only">answer source details</span>
      </summary>
      <dl className="mt-1.5 grid gap-1 rounded-md border border-outline-variant/20 bg-surface-dim/15 p-2 text-[11px] leading-4 text-outline">
        <ChatReceiptLine label="Status" value={labelProvider(meta.provider)} />
        <ChatReceiptLine label="Source" value={sourceLabel} />
        <ChatReceiptLine label={meta.status === "failed" ? "Error" : "Mode"} value={modelLabel} />
      </dl>
    </details>
  );
}

function ChatReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2">
      <dt className="font-semibold uppercase tracking-normal text-outline/75">{label}</dt>
      <dd className="min-w-0 truncate text-on-surface-variant">{value}</dd>
    </div>
  );
}

function BubbleIcon({ icon, compact }: { icon: "assistant" | "user"; compact: boolean }) {
  const Icon = icon === "assistant" ? Bot : UserRound;

  return (
    <div
      className={cn(
        "mt-0.5 flex shrink-0 items-center justify-center rounded-md text-on-surface-variant",
        compact
          ? icon === "assistant"
            ? "size-6 border-0 bg-transparent text-violet/80"
            : "size-7 border border-violet/20 bg-violet/10"
          : "size-8 border border-outline-variant/30 bg-surface-low/80",
      )}
    >
      <Icon aria-hidden="true" className={compact ? "size-3.5" : "size-4"} />
    </div>
  );
}

async function readResponseText(response: Response, onChunk: (chunk: string) => void) {
  if (!response.body) {
    await revealTextProgressively(await response.text(), onChunk);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    await revealTextProgressively(decoder.decode(value, { stream: true }), onChunk);
  }

  const finalChunk = decoder.decode();
  if (finalChunk) await revealTextProgressively(finalChunk, onChunk);
}

async function revealTextProgressively(text: string, onChunk: (chunk: string) => void) {
  let cursor = 0;

  while (cursor < text.length) {
    const nextCursor = nextRevealCursor(text, cursor);
    onChunk(text.slice(cursor, nextCursor));
    cursor = nextCursor;

    if (cursor < text.length) {
      await sleep(STREAM_REVEAL_DELAY_MS);
    }
  }
}

function nextRevealCursor(text: string, cursor: number) {
  const target = Math.min(text.length, cursor + (text.length > 600 ? 14 : 8));
  if (target >= text.length) return text.length;

  const nextWordBreak = text.slice(target, target + 8).search(/\s/);
  return nextWordBreak >= 0 ? target + nextWordBreak + 1 : target;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function makeMessageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function trimChatMessages(messages: ChatMessage[]) {
  return messages.length > CHAT_HISTORY_LIMIT ? messages.slice(-CHAT_HISTORY_LIMIT) : messages;
}

function prefetchableChatActionRoutes(messages: ChatMessage[], composerActions: ChatAction[]) {
  const routes = new Set<string>();

  for (const action of composerActions) {
    const route = prefetchableAppRoute(action.href);
    if (route) routes.add(route);
  }

  for (const message of messages) {
    if (message.role === "user") continue;

    for (const action of message.meta?.actions ?? []) {
      const route = prefetchableAppRoute(action.href);
      if (route) routes.add(route);
    }
  }

  return Array.from(routes).slice(0, 8);
}

function prefetchablePromptRoutes(prompts: ChatPrompt[], pageContext?: ChatPageContext) {
  const routes = new Set<string>();

  for (const prompt of prompts.slice(0, 8)) {
    const directRoute = directRouteForChatDraft(prompt.prompt, pageContext);
    const actions = directRoute ? [directRoute] : routeHintsForChatDraft(prompt.prompt, pageContext);

    for (const action of actions) {
      const route = prefetchableAppRoute(action.href);
      if (route) routes.add(route);
    }
  }

  return Array.from(routes).slice(0, 8);
}

function prefetchableAppRoute(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return null;

  const [withoutHash] = href.split("#");
  return withoutHash || "/";
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
    actions: decodeActionHeader(response.headers.get("X-Chat-Actions")),
    status,
    errorCode: errorCode ?? response.headers.get("X-Chat-Error-Code") ?? undefined,
  };
}

function optimisticCommandMeta(message: string, pageContext?: ChatPageContext): ChatMeta | undefined {
  if (!message.trim()) return undefined;

  const surface = pageContext?.surface ?? "Current page";
  const actions = commandRoutesForChatDraft(message, pageContext);

  return actions.length > 0 ? optimisticMeta(actions, surface) : undefined;
}

function optimisticMeta(actions: ChatAction[], surface: string): ChatMeta {
  return {
    provider: "local",
    model: "routing",
    sources: [`${surface} page`, "Safe app routes"],
    followups: [],
    actions,
    status: "ready",
  };
}

function decodeActionHeader(value: string | null): ChatAction[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item) => ({
        label: typeof item.label === "string" ? item.label.replace(/\s+/g, " ").trim().slice(0, 40) : "",
        href: typeof item.href === "string" ? item.href.trim() : "",
      }))
      .filter((item) => item.label && isSafeAppHref(item.href))
      .slice(0, 4);
  } catch {
    return [];
  }
}

/** The Settings → Chat key, saved per-browser, rides along on chat requests so
 * the key that "tested green" is the key that answers. Server env keys still
 * win on the other side; this only upgrades the no-env-key case. */
function browserChatKeyHeaders(): Record<string, string> {
  try {
    const saved = window.localStorage.getItem("financial-copilot.integration-fields.live_chat");
    const fields = saved ? (JSON.parse(saved) as Record<string, unknown>) : null;
    const apiKey = typeof fields?.api_key === "string" ? fields.api_key.trim() : "";
    if (!apiKey || !/^[\x21-\x7e]+$/.test(apiKey)) return {};
    const headers: Record<string, string> = { "x-chat-api-key": apiKey };
    if (typeof fields?.provider === "string" && fields.provider) headers["x-chat-provider"] = fields.provider;
    if (typeof fields?.model === "string" && fields.model) headers["x-chat-model"] = fields.model;
    return headers;
  } catch {
    return {};
  }
}

function isSafeAppHref(value: string) {
  return value.startsWith("/") && !value.startsWith("//");
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

function shortProviderLabel(provider: string) {
  if (provider === "openrouter") return "Live";
  if (provider === "fallback") return "Fallback";
  if (provider === "local-command" || provider === "local") return "Local";
  return "Local";
}

function labelModel(model: string) {
  if (model === "local-fallback") return "No key used";
  if (model === "unavailable") return "Unavailable";
  if (model === "routing") return "Routing";
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

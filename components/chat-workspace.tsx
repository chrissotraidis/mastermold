"use client";

import { FormEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, CheckCircle2, Loader2, RotateCcw, SendHorizonal, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SentinelFace } from "@/components/sentinel-face";
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

const CHAT_HISTORY_LIMIT = 24;
const EMPTY_CHAT_ACTIONS: ChatAction[] = [];
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
    prompt: "Import holdings snapshot.",
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
  showCommandShelf = true,
  showComposer = true,
  showEmptyPrompts = true,
  onActionNavigate,
}: {
  prompts?: ChatPrompt[];
  initialQuery?: string;
  pageContext?: ChatPageContext;
  compact?: boolean;
  showCommandShelf?: boolean;
  showComposer?: boolean;
  showEmptyPrompts?: boolean;
  onActionNavigate?: () => void;
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

    if (!trimmed || isSending) {
      return;
    }

    const directRoute = directRouteForChatDraft(trimmed, pageContext);
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
    <div className={cn("space-y-4", compact && "h-full")}>
      {showComposer ? (
        <form
          className={cn(
            "sticky z-20 rounded-md border border-violet/35 bg-surface-low/95 p-2.5 shadow-sm shadow-void/15 backdrop-blur-xl",
            compact ? "top-0" : "top-20",
          )}
          onSubmit={submitMessage}
          data-testid="chat-composer"
        >
          {!isEmpty ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {prompts.slice(0, 3).map((prompt) => (
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
          <div className="flex items-end gap-2">
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
              className="min-h-11 max-h-32 w-full resize-none overflow-x-hidden overflow-y-hidden rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              placeholder="Ask Master Mold..."
              rows={1}
              maxLength={2000}
            />
            {readyComposerAction && !isSending ? (
              <Link
                href={hrefWithMasterMoldCommandHandoff(readyComposerAction)}
                onClick={() => prepareCommandNavigation(readyComposerAction)}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-violet px-4 text-sm font-semibold text-void transition hover:bg-violet/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                aria-label="Send"
              >
                <SendHorizonal aria-hidden="true" />
              </Link>
            ) : (
              <Button
                type="submit"
                disabled={isSending || !draft.trim()}
                className="h-11 shrink-0 bg-violet text-void hover:bg-violet"
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
        <div className={cn("rounded-md border border-outline-variant/35 bg-surface-high/25 p-3", compact && "p-2.5")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-telemetry text-outline">Ask Master Mold</p>
            {!isEmpty ? (
              <button
                type="button"
                onClick={resetConversation}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface-variant transition hover:border-violet/40 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
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

      <div
        ref={threadRef}
        className={cn(
          "overflow-x-hidden overflow-y-auto rounded-md border border-outline-variant/40 bg-surface-dim/40 p-4 sm:p-5",
          compact ? "max-h-[min(48vh,28rem)] min-h-[12rem]" : "max-h-[32rem] min-h-[14rem]",
        )}
        aria-live="polite"
        aria-label="Conversation"
      >
        {isEmpty ? (
          <div className={cn("flex flex-col items-center justify-center gap-4 text-center", compact ? "min-h-[10rem]" : "min-h-[12rem]")}>
            <div className={compact ? "size-16" : "size-20"}>
              <SentinelFace state="idle" speaking={isSending} />
            </div>
            <p className="max-w-sm text-sm leading-6 text-on-surface-variant">
              Ask me to check, pull together, open the right place, or route the next step. I answer; I do not trade.
            </p>
            {showEmptyPrompts ? (
              <div className="hidden max-w-lg flex-wrap justify-center gap-2 sm:flex">
                {prompts.slice(0, 4).map((prompt) => (
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
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                loading={isSending}
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
        <p className="rounded-md border border-critical/40 bg-critical/10 p-3 text-sm text-critical">
          {error}
        </p>
      ) : null}
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
    "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-outline-variant/35 bg-surface-dim/55 px-3 text-xs font-semibold text-on-surface-variant transition hover:border-violet/40 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:cursor-not-allowed disabled:opacity-50";

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
  loading,
  onActionNavigate,
  onFollowup,
}: {
  message: ChatMessage;
  loading: boolean;
  onActionNavigate?: () => void;
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
            {meta && meta.actions.length > 0 ? (
              <ChatActionButtons actions={meta.actions} onNavigate={onActionNavigate} />
            ) : null}
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
          <div className="space-y-3">
            <p className="text-outline">{loading ? "Checking this page…" : ""}</p>
            {meta && meta.actions.length > 0 ? (
              <ChatActionButtons actions={meta.actions} onNavigate={onActionNavigate} />
            ) : null}
          </div>
        )}
      </div>
      {isUser ? <BubbleIcon icon="user" /> : null}
    </article>
  );
}, areChatMessagePropsEqual);

function areChatMessagePropsEqual(
  prev: {
    message: ChatMessage;
    loading: boolean;
    onActionNavigate?: () => void;
    onFollowup: (followup: string) => void;
  },
  next: {
    message: ChatMessage;
    loading: boolean;
    onActionNavigate?: () => void;
    onFollowup: (followup: string) => void;
  },
) {
  return prev.message === next.message && prev.loading === next.loading;
}

function ChatActionButtons({
  actions,
  onNavigate,
}: {
  actions: ChatAction[];
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-outline-variant/30 pt-3">
      {actions.slice(0, 4).map((action) => (
        <Link
          key={`${action.href}-${action.label}`}
          href={hrefWithMasterMoldCommandHandoff(action)}
          onClick={() => {
            rememberMasterMoldCommandHandoff(action);
            onNavigate?.();
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-violet/35 bg-violet/10 px-3 py-2 text-xs font-semibold text-violet transition hover:bg-violet/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
        >
          {action.label}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
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
    <div className="mt-2 flex flex-wrap gap-2" aria-label="Ready Master Mold routes" data-testid="composer-ready-routes">
      {actions.slice(0, 3).map((action) => (
        <Link
          key={`${action.href}-${action.label}`}
          href={hrefWithMasterMoldCommandHandoff(action)}
          onClick={() => {
            onActionStart?.(action);
            rememberMasterMoldCommandHandoff(action);
            onNavigate?.();
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/35 bg-surface-dim/60 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-violet/40 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
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
  return (
    <details className="group border-t border-outline-variant/30 pt-2">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-outline transition hover:text-on-surface">
        <span>Status</span>
        <span className="rounded-full border border-outline-variant/35 bg-surface-dim/45 px-2 py-0.5 text-[10px]">
          {labelProvider(meta.provider)}
        </span>
        <span className="text-[10px] uppercase tracking-telemetry text-outline group-open:hidden">Show details</span>
      </summary>
      <div className="mt-2 space-y-2">
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
    </details>
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
  let pendingChunk = "";
  let pendingFrame: number | null = null;

  const flushBufferedChatChunk = () => {
    pendingFrame = null;
    if (!pendingChunk) return;

    const chunk = pendingChunk;
    pendingChunk = "";
    onChunk(chunk);
  };

  const enqueueChunk = (chunk: string) => {
    pendingChunk += chunk;
    if (pendingFrame === null) {
      pendingFrame = window.requestAnimationFrame(flushBufferedChatChunk);
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    enqueueChunk(decoder.decode(value, { stream: true }));
  }

  const finalChunk = decoder.decode();
  if (finalChunk) enqueueChunk(finalChunk);

  if (pendingFrame !== null) {
    window.cancelAnimationFrame(pendingFrame);
  }
  flushBufferedChatChunk();
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

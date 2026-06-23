"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Maximize2, MessageCircle, Minimize2, SendHorizonal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  MASTER_MOLD_CHAT_EVENT,
  type MasterMoldChatEventDetail,
} from "@/components/master-mold-actions";
import { ChatWorkspace } from "@/components/chat-workspace";
import { SentinelFace } from "@/components/sentinel-face";
import { directRouteForChatDraft, routeHintsForChatDraft, submittableCommandRoutesForChatDraft } from "@/lib/chat-route-hints";
import { openMasterMoldCommandRoute } from "@/lib/master-mold-command-routing";
import {
  hrefWithMasterMoldCommandHandoff,
  rememberMasterMoldCommandHandoff,
} from "@/lib/master-mold-command-handoff";
import { cn } from "@/lib/utils";
import type { ChatPageContext, ChatPrompt } from "@/src/db/chat";

type ChatAction = {
  label: string;
  href: string;
};

type AssistantCommandStatus = {
  tone: "ready" | "running";
  label: string;
  detail: string;
};

export function GlobalAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | undefined>();
  const [eventPageContext, setEventPageContext] = useState<ChatPageContext | undefined>();
  const [drawerDraft, setDrawerDraft] = useState("");
  const [queryKey, setQueryKey] = useState(0);
  const [commandStatus, setCommandStatus] = useState<AssistantCommandStatus | undefined>();
  const currentPath = pathname ?? "/";
  const isChatPage = currentPath.startsWith("/chat");

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<MasterMoldChatEventDetail>).detail;
      setInitialQuery(detail?.prompt);
      setEventPageContext(detail?.pageContext);
      setCommandStatus(undefined);
      setQueryKey((current) => current + 1);
      setOpen(true);
    }

    window.addEventListener(MASTER_MOLD_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(MASTER_MOLD_CHAT_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!isChatPage) return;

    setOpen(false);
    setExpanded(false);
    setInitialQuery(undefined);
    setEventPageContext(undefined);
    setDrawerDraft("");
    setCommandStatus(undefined);
  }, [isChatPage]);

  const title = useMemo(
    () => (initialQuery ? "Asking Master Mold" : "Ask Master Mold"),
    [initialQuery],
  );
  const pagePrompts = useMemo(() => promptsForPath(currentPath), [currentPath]);
  const routePageContext = useMemo(
    () => pageContextForPath(currentPath),
    [currentPath],
  );
  const pageContext = eventPageContext ?? routePageContext;
  const primaryPrompt = pagePrompts[0];
  const trimmedDrawerDraft = drawerDraft.trim();
  const drawerActions = useMemo(
    () => (trimmedDrawerDraft ? routeHintsForChatDraft(trimmedDrawerDraft, pageContext) : []),
    [pageContext, trimmedDrawerDraft],
  );
  const drawerActionPrefetchKey = useMemo(
    () => drawerActions.map((action) => prefetchableAppRoute(action.href)).filter(Boolean).join("|"),
    [drawerActions],
  );
  const promptActionPrefetchKey = useMemo(
    () => promptPrefetchKey(pagePrompts, pageContext),
    [pageContext, pagePrompts],
  );
  const assistantPrefetchKey = [drawerActionPrefetchKey, promptActionPrefetchKey].filter(Boolean).join("|");
  const hideFloatingLauncherOnMobile = true;
  const assistantHint = currentPath.startsWith("/trading")
    ? "Check Trade"
    : currentPath.startsWith("/settings")
      ? "Check setup"
      : primaryPrompt?.label ?? "Ask";

  function askFromDrawer(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    const readyRoute = submittableCommandRoutesForChatDraft(trimmed, pageContext)[0] ?? null;

    if (readyRoute) {
      setDrawerDraft("");
      setCommandStatus({
        tone: "running",
        label: readyRoute.label,
        detail: "Master Mold is opening it now.",
      });
      openMasterMoldCommandRoute(router, readyRoute);
      closeDrawerAfterCommand();
      return;
    }

    setInitialQuery(trimmed);
    setEventPageContext(pageContext);
    setQueryKey((current) => current + 1);
    setDrawerDraft("");
    setCommandStatus(undefined);
    setOpen(true);
  }

  function closeDrawerAfterCommand() {
    setOpen(false);
    setExpanded(false);
    setCommandStatus(undefined);
  }

  function openCommandAction(action: ChatAction) {
    setCommandStatus({
      tone: "running",
      label: action.label,
      detail: "Master Mold is opening it now.",
    });
    rememberMasterMoldCommandHandoff(action);
    closeDrawerAfterCommand();
  }

  useEffect(() => {
    if (!assistantPrefetchKey) return;

    for (const href of assistantPrefetchKey.split("|")) {
      router.prefetch(href);
    }
  }, [assistantPrefetchKey, router]);

  return (
    <>
      {!isChatPage ? (
        <button
          type="button"
          onClick={() => {
            setInitialQuery(undefined);
            setEventPageContext(undefined);
            setCommandStatus(undefined);
            setOpen(true);
          }}
          className={cn(
            "fixed bottom-[4.85rem] right-3 z-[70] size-12 items-center justify-center rounded-full border border-violet/40 bg-surface-high/95 p-1.5 shadow-xl shadow-void/25 ring-1 ring-violet/20 transition hover:border-violet hover:bg-surface-highest active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet md:bottom-6 md:right-6 md:size-auto md:min-h-14 md:max-w-[calc(100vw-3rem)] md:justify-start md:gap-3 md:py-1.5 md:pl-1.5 md:pr-4",
            hideFloatingLauncherOnMobile ? "hidden md:flex" : "flex",
          )}
          aria-label="Open Master Mold chat"
          data-testid="global-assistant-open"
        >
          <span className="size-9 shrink-0 md:size-11">
            <SentinelFace state="idle" />
          </span>
          <span className="hidden min-w-0 text-left md:block">
            <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-on-surface">
              <MessageCircle aria-hidden="true" className="size-3.5 text-violet" />
              Ask Master Mold
            </span>
            <span className="block truncate text-[11px] leading-tight text-outline">{assistantHint}</span>
          </span>
        </button>
      ) : null}

      {open ? (
        <div
          className={cn(
            "fixed inset-0 z-[95] flex bg-void/65 backdrop-blur-sm md:items-center md:justify-end",
            expanded ? "items-stretch" : "items-end",
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby="global-assistant-title"
          data-testid="global-assistant-drawer"
        >
          <div
            className={cn(
              "flex w-full flex-col border border-outline-variant/50 bg-surface-low p-4 shadow-2xl md:mr-5 md:rounded-lg md:p-5",
              expanded
                ? "h-dvh max-h-dvh rounded-none md:h-[88vh] md:max-h-[88vh] md:w-[42rem]"
                : "max-h-[92vh] rounded-t-2xl md:max-h-[88vh] md:w-[29rem]",
            )}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="size-10 shrink-0">
                <SentinelFace state="idle" />
              </div>
              <div className="min-w-0">
                <h2 id="global-assistant-title" className="text-lg font-semibold text-on-surface">
                  {title}
                </h2>
                <p className="truncate text-xs text-outline">About this page · no trading</p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="ml-auto flex size-11 items-center justify-center rounded-md border border-outline-variant/40 text-outline transition hover:text-on-surface"
                aria-label={expanded ? "Make chat smaller" : "Expand chat"}
              >
                {expanded ? <Minimize2 aria-hidden="true" className="size-5" /> : <Maximize2 aria-hidden="true" className="size-5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setExpanded(false);
                  setCommandStatus(undefined);
                }}
                className="flex size-11 items-center justify-center rounded-md border border-outline-variant/40 text-outline transition hover:text-on-surface"
                aria-label="Close chat"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <InstantAssistantCommand
              draft={drawerDraft}
              onDraftChange={(nextDraft) => {
                setDrawerDraft(nextDraft);
                setCommandStatus(undefined);
              }}
              pageContext={pageContext}
              prompts={pagePrompts}
              status={commandStatus}
              onAsk={askFromDrawer}
              onNavigate={openCommandAction}
            />
            <div className={cn("min-h-0 flex-1", open && "block")}>
              <ChatWorkspace
                key={`${currentPath}-${queryKey}`}
                prompts={pagePrompts}
                pageContext={pageContext}
                initialQuery={initialQuery}
                compact
                showCommandShelf={false}
                showComposer={false}
                showEmptyPrompts={false}
                onActionNavigate={() => {
                  setOpen(false);
                  setExpanded(false);
                  setCommandStatus(undefined);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function InstantAssistantCommand({
  draft,
  onDraftChange,
  onAsk,
  onNavigate,
  pageContext,
  prompts,
  status,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onAsk: (query: string) => void;
  onNavigate: (action: ChatAction) => void;
  pageContext: ChatPageContext;
  prompts: ChatPrompt[];
  status?: AssistantCommandStatus;
}) {
  const trimmedDraft = draft.trim();
  const quickActions = useMemo(
    () => quickActionsForDraft(trimmedDraft, pageContext),
    [pageContext, trimmedDraft],
  );
  const readyAction = useMemo(
    () => readyActionForDraft(trimmedDraft, pageContext),
    [pageContext, trimmedDraft],
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAsk(draft);
  }

  return (
    <div
      className="mb-3 rounded-md border border-violet/30 bg-surface-dim/70 p-2.5 shadow-sm shadow-void/10"
      data-testid="assistant-instant-command"
    >
      <form onSubmit={submit} className="flex items-end gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAsk(draft);
            }
          }}
          placeholder={`Ask about ${pageContext.surface}...`}
          aria-label="Ask Master Mold"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-outline-variant/45 bg-void/35 px-3 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-violet text-void transition hover:bg-violet/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
        >
          <SendHorizonal aria-hidden="true" className="size-4" />
        </button>
      </form>
      {status ? (
        <AssistantCommandStatusLine status={status} />
      ) : readyAction ? (
        <AssistantCommandStatusLine
          status={{
            tone: "ready",
            label: readyAction.label,
            detail: "Ready. Press Enter or choose a route.",
          }}
        />
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {quickActions.length > 0 ? (
          quickActions.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={hrefWithMasterMoldCommandHandoff(item)}
              onClick={() => onNavigate(item)}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-violet/35 bg-violet/10 px-3 text-xs font-semibold text-violet transition hover:bg-violet/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
            >
              {item.label}
            </Link>
          ))
        ) : (
          prompts.slice(0, 3).map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => onAsk(prompt.prompt)}
              title={prompt.prompt}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-outline-variant/35 bg-surface-low/70 px-3 text-xs font-semibold text-on-surface-variant transition hover:border-violet/45 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
            >
              {prompt.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function AssistantCommandStatusLine({ status }: { status: AssistantCommandStatus }) {
  const Icon = status.tone === "running" ? Loader2 : CheckCircle2;

  return (
    <div
      className={cn(
        "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5",
        status.tone === "running"
          ? "border-violet/35 bg-violet/10 text-on-surface"
          : "border-outline-variant/40 bg-surface-low/70 text-on-surface-variant",
      )}
      data-testid="assistant-command-status"
      aria-live="polite"
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-3.5 shrink-0 text-violet", status.tone === "running" && "animate-spin")}
      />
      <span className="min-w-0">
        <span className="font-semibold text-on-surface">{status.label}</span>
        <span className="block">{status.detail}</span>
      </span>
    </div>
  );
}

function quickActionsForDraft(draft: string, pageContext: ChatPageContext): ChatAction[] {
  if (!draft.trim()) return [];

  return routeHintsForChatDraft(draft, pageContext);
}

function readyActionForDraft(draft: string, pageContext: ChatPageContext): ChatAction | undefined {
  if (!draft.trim()) return undefined;

  return submittableCommandRoutesForChatDraft(draft, pageContext)[0];
}

function prefetchableAppRoute(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return null;

  const [withoutHash] = href.split("#");
  return withoutHash || "/";
}

function promptPrefetchKey(prompts: ChatPrompt[], pageContext: ChatPageContext) {
  const routes = new Set<string>();

  for (const prompt of prompts.slice(0, 4)) {
    const directRoute = directRouteForChatDraft(prompt.prompt, pageContext);
    const actions = directRoute ? [directRoute] : routeHintsForChatDraft(prompt.prompt, pageContext);

    for (const action of actions) {
      const route = prefetchableAppRoute(action.href);
      if (route) routes.add(route);
    }
  }

  return Array.from(routes).join("|");
}

function promptsForPath(pathname: string): ChatPrompt[] {
  if (pathname.startsWith("/portfolio")) {
    return [
      {
        id: "portfolio-next-check",
        label: "Next check",
        prompt: "Looking at this portfolio page, what should I check first today?",
        reference: "Portfolio",
      },
      {
        id: "portfolio-largest-holding",
        label: "Largest holding",
        prompt: "Open largest visible holding.",
        reference: "Portfolio",
      },
      {
        id: "portfolio-real-sample",
        label: "Real or sample?",
        prompt: "Which portfolio numbers are real, manual, or sample on this page?",
        reference: "Portfolio",
      },
      {
        id: "portfolio-net-worth",
        label: "Net worth",
        prompt: "What should I notice about net worth here, and does it change today's decision?",
        reference: "Portfolio",
      },
    ];
  }

  if (pathname.startsWith("/paper")) {
    return [
      {
        id: "paper-next-test",
        label: "Next paper trade",
        prompt: "Prepare paper trade.",
        reference: "Paper",
      },
      {
        id: "paper-why-test",
        label: "Why test it?",
        prompt: "Why would this paper idea teach me something before risking real money?",
        reference: "Paper",
      },
      {
        id: "paper-account",
        label: "Paper account",
        prompt: "Explain the paper account on this page in plain English.",
        reference: "Paper",
      },
      {
        id: "paper-result",
        label: "What happened?",
        prompt: "What did the latest paper result show, and how should it shape the next paper trade?",
        reference: "Paper",
      },
    ];
  }

  if (pathname.startsWith("/activity") || pathname.startsWith("/alerts")) {
    return [
      {
        id: "activity-top",
        label: "Top activity",
        prompt: "Show activity list.",
        reference: "Activity",
      },
      {
        id: "activity-response",
        label: "Suggested response",
        prompt: "What is the suggested response for the most important activity item?",
        reference: "Activity",
      },
      {
        id: "activity-useful",
        label: "Useful or not?",
        prompt: "Which activity items are worth checking, and which should I ignore?",
        reference: "Activity",
      },
      {
        id: "activity-portfolio",
        label: "Portfolio link",
        prompt: "How do these activity items matter for the visible portfolio?",
        reference: "Activity",
      },
    ];
  }

  if (pathname.startsWith("/briefing")) {
    return [
      {
        id: "briefing-why-matters",
        label: "Why it matters",
        prompt: "Why does this idea matter today?",
        reference: "Idea",
      },
      {
        id: "briefing-bear-case",
        label: "Bear case",
        prompt: "What is the strongest reason this idea could be wrong?",
        reference: "Idea",
      },
      {
        id: "briefing-portfolio",
        label: "Portfolio impact",
        prompt: "How should this idea affect the visible portfolio decisions?",
        reference: "Idea",
      },
      {
        id: "briefing-paper-test",
        label: "Paper test",
        prompt: "How could I test this idea as a paper trade first?",
        reference: "Idea",
      },
    ];
  }

  if (pathname.startsWith("/journal")) {
    return [
      {
        id: "journal-recent-calls",
        label: "Recent calls",
        prompt: "What do my recent saved calls say about my decision quality?",
        reference: "Decision journal",
      },
      {
        id: "journal-wrong",
        label: "What was wrong?",
        prompt: "Which recent calls were wrong or unclear, and what should I change?",
        reference: "Decision journal",
      },
      {
        id: "journal-pattern",
        label: "Pattern",
        prompt: "What pattern do you see in my saved decisions?",
        reference: "Decision journal",
      },
      {
        id: "journal-next-review",
        label: "Next review",
        prompt: "Open journal.",
        reference: "Decision journal",
      },
    ];
  }

  if (pathname.startsWith("/review")) {
    return [
      {
        id: "review-real",
        label: "What is real?",
        prompt: "What parts of this app are working with live chat or real saved data?",
        reference: "Review",
      },
      {
        id: "review-sample",
        label: "What is sample?",
        prompt: "Which parts are sample, saved locally, or not built yet?",
        reference: "Review",
      },
      {
        id: "review-trust",
        label: "Can I trust it?",
        prompt: "What can I trust in this build, and what should I not trust yet?",
        reference: "Review",
      },
      {
        id: "review-missing",
        label: "What is missing?",
        prompt: "What is still missing before this can guide real money decisions?",
        reference: "Review",
      },
    ];
  }

  if (pathname.startsWith("/settings")) {
    return [
      {
        id: "settings-provider-tests",
        label: "Connection checks",
        prompt: "Which connection checks on this page actually verify a live connection?",
        reference: "Settings",
      },
      {
        id: "settings-portfolio-import",
        label: "Portfolio import",
        prompt: "Do these settings import portfolio balances into the app yet?",
        reference: "Settings",
      },
      {
        id: "settings-chat-context",
        label: "Chat context",
        prompt: "What does Chat context save here, and what is still not built?",
        reference: "Settings",
      },
      {
        id: "settings-privacy",
        label: "Privacy",
        prompt: "What sensitive information should I be careful with on this page?",
        reference: "Settings",
      },
    ];
  }

  if (pathname.startsWith("/trading") || pathname.startsWith("/executor")) {
    return [
      {
        id: "trade-can-do",
        label: "What can it do?",
        prompt: "What can this Trade page do right now?",
        reference: "Trade",
      },
      {
        id: "trade-next-step",
        label: "Next action",
        prompt: "Show next action.",
        reference: "Trade",
      },
      {
        id: "trade-test-trade",
        label: "Test trade",
        prompt: "Open test trade.",
        reference: "Trade",
      },
      {
        id: "trade-technical-details",
        label: "Technical details",
        prompt: "What technical details are hidden here, and which ones matter before live trading?",
        reference: "Trade",
      },
    ];
  }

  if (pathname.startsWith("/chat")) {
    return [
      {
        id: "chat-today",
        label: "Today focus",
        prompt: "What should I focus on today, using the visible portfolio and saved market context?",
        reference: "Chat",
      },
      {
        id: "chat-data-source",
        label: "Data source",
        prompt: "What data are you using right now, and what is still sample?",
        reference: "Chat",
      },
      {
        id: "chat-first-check",
        label: "First check",
        prompt: "What should I check first before making any money decision?",
        reference: "Chat",
      },
      {
        id: "chat-recent-calls",
        label: "Recent calls",
        prompt: "What can I learn from the recent saved calls?",
        reference: "Chat",
      },
    ];
  }

  return [
    {
      id: "today-focus",
      label: "Today focus",
      prompt: "What should I focus on today, using the visible portfolio and saved market context?",
      reference: "Today",
    },
    {
      id: "today-attention",
      label: "Needs attention",
      prompt: "What needs attention first on today's page?",
      reference: "Today",
    },
    {
      id: "today-top-alert",
      label: "Top activity",
      prompt: "Why does the most important activity item matter, and what should I check?",
      reference: "Today",
    },
    {
      id: "today-paper-test",
      label: "Paper test",
      prompt: "What paper trade would make sense before risking real money?",
      reference: "Today",
    },
  ];
}

function pageContextForPath(pathname: string, route = pathname): ChatPageContext {
  if (pathname.startsWith("/portfolio")) {
    return {
      surface: "Portfolio",
      route,
      summary:
        "The user is looking at net worth, holdings, allocation, concentration, and whether portfolio data is sample, manual, or imported.",
    };
  }

  if (pathname.startsWith("/paper")) {
    return {
      surface: "Paper",
      route,
      summary:
        "The user is looking at paper trades, the paper account, open ideas, and what recent paper results taught them. No real money moves here.",
    };
  }

  if (pathname.startsWith("/activity") || pathname.startsWith("/alerts")) {
    return {
      surface: "Activity",
      route,
      summary:
        "The user is looking at recent activity and changes: why each item matters, suggested responses, feedback, dismissals, and paper-trade or journal actions.",
    };
  }

  if (pathname.startsWith("/briefing")) {
    return {
      surface: "Idea detail",
      route,
      summary:
        "The user is looking at one saved market idea with why it matters, bull and bear cases, time horizon, confidence, journal draft, and paper-trade options.",
    };
  }

  if (pathname.startsWith("/journal")) {
    return {
      surface: "Decision journal",
      route,
      summary:
        "The user is looking at saved calls, review quality, results, confidence errors, and what Master Mold should learn from past decisions.",
    };
  }

  if (pathname.startsWith("/review")) {
    return {
      surface: "System status",
      route,
      summary:
        "The user is checking what works, what is sample, what is credential-gated, what is missing, and how the seeded review account works.",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      surface: "Settings",
      route,
      summary:
        "The user is looking at connection checks, manual holdings, holdings snapshot imports, preferences, local profile backup, and privacy. Imports happen only after the user presses the import button.",
    };
  }

  if (pathname.startsWith("/trading") || pathname.startsWith("/executor")) {
    return {
      surface: "Trade",
      route,
      summary:
        "The user is looking at wallet status, the next required trade action, portfolio/net-worth movement, active positions, test trades, and technical setup details. The current app signs nothing.",
    };
  }

  if (pathname.startsWith("/chat")) {
    return {
      surface: "Chat",
      route,
      summary:
        "The user is in the dedicated conversation view with today's saved market context, visible portfolio context, activity, and recent calls available.",
    };
  }

  return {
    surface: "Today",
    route,
    summary:
      "The user is looking at today's short rundown, the few items worth checking, the top activity response, portfolio context, and paper-trade options.",
  };
}

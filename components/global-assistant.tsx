"use client";

import { useEffect, useMemo, useState } from "react";
import { Maximize2, MessageCircle, Minimize2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  MASTER_MOLD_CHAT_EVENT,
  type MasterMoldChatEventDetail,
} from "@/components/master-mold-actions";
import { ChatWorkspace } from "@/components/chat-workspace";
import { SentinelFace } from "@/components/sentinel-face";
import { directRouteForChatDraft, routeHintsForChatDraft } from "@/lib/chat-route-hints";
import { cn } from "@/lib/utils";
import type { ChatPageContext, ChatPrompt } from "@/src/db/chat";

export function GlobalAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [launcherHovered, setLauncherHovered] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | undefined>();
  const [eventPageContext, setEventPageContext] = useState<ChatPageContext | undefined>();
  const [drawerHasMessages, setDrawerHasMessages] = useState(false);
  const [queryKey, setQueryKey] = useState(0);
  const currentPath = pathname ?? "/";
  const isChatPage = currentPath.startsWith("/chat");

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<MasterMoldChatEventDetail>).detail;
      setInitialQuery(detail?.prompt);
      setEventPageContext(detail?.pageContext);
      setDrawerHasMessages(Boolean(detail?.prompt));
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
    setDrawerHasMessages(false);
  }, [isChatPage]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (open && !isChatPage) {
      document.body.dataset.masterMoldAssistant = expanded ? "expanded" : "open";
    } else {
      delete document.body.dataset.masterMoldAssistant;
    }

    return () => {
      delete document.body.dataset.masterMoldAssistant;
    };
  }, [expanded, isChatPage, open]);

  const title = useMemo(
    () => (initialQuery ? "Master Mold" : "Ask Master Mold"),
    [initialQuery],
  );
  const pagePrompts = useMemo(() => promptsForPath(currentPath), [currentPath]);
  const routePageContext = useMemo(
    () => pageContextForPath(currentPath),
    [currentPath],
  );
  const pageContext = eventPageContext ?? routePageContext;
  const promptActionPrefetchKey = useMemo(
    () => promptPrefetchKey(pagePrompts, pageContext),
    [pageContext, pagePrompts],
  );
  // The launcher is the one always-visible way to talk to Master Mold; it hides
  // only while the drawer is open or on the dedicated /chat page.
  const showFloatingLauncher = !open && !isChatPage;

  function closeDrawer() {
    setOpen(false);
    setExpanded(false);
    setDrawerHasMessages(false);
  }

  useEffect(() => {
    if (!promptActionPrefetchKey) return;

    for (const href of promptActionPrefetchKey.split("|")) {
      router.prefetch(href);
    }
  }, [promptActionPrefetchKey, router]);

  return (
    <>
      {showFloatingLauncher ? (
        <button
          type="button"
          onClick={() => {
            setInitialQuery(undefined);
            setEventPageContext(undefined);
            setDrawerHasMessages(false);
            setLauncherHovered(false);
            setOpen(true);
          }}
          onPointerEnter={() => setLauncherHovered(true)}
          onPointerLeave={() => setLauncherHovered(false)}
          className={cn(
            "fixed bottom-4 right-4 z-[70] hidden min-h-12 max-w-[calc(100vw-2rem)] items-center justify-start gap-2 rounded-full border border-violet/35 bg-surface-high/95 py-1 pl-1 pr-3 shadow-xl shadow-void/25 ring-1 ring-violet/15 transition hover:border-violet hover:bg-surface-highest active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet xl:flex",
          )}
          aria-label="Open Master Mold chat"
          data-testid="global-assistant-open"
        >
          <span className="size-12 shrink-0">
            <SentinelFace state="idle" hovered={launcherHovered} />
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-left text-sm font-semibold leading-tight text-on-surface">
            <MessageCircle aria-hidden="true" className="size-3.5 text-violet" />
            Ask Master Mold
          </span>
        </button>
      ) : null}

      {open && !isChatPage ? (
        <div
          className="fixed inset-0 z-[1000] flex flex-col bg-void/60 backdrop-blur-sm md:inset-auto md:bottom-4 md:right-4 md:bg-transparent md:backdrop-blur-0"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <div
            className={cn(
              // Overlay panel — fixed size, never reflows the page. Mobile: a
              // bottom sheet. Desktop: a floating card, larger when expanded.
              "pointer-events-auto mt-auto flex w-full flex-col overflow-hidden rounded-t-2xl border-t border-outline-variant/35 bg-surface-low shadow-2xl shadow-void/50 ring-1 ring-violet/10",
              "h-[85dvh] md:mt-0 md:rounded-xl md:border",
              expanded
                ? "md:h-[80vh] md:w-[40rem] md:max-w-[calc(100vw-2rem)]"
                : "md:h-[34rem] md:w-[24rem] md:max-w-[calc(100vw-2rem)]",
            )}
            role="dialog"
            aria-modal={false}
            aria-labelledby="global-assistant-title"
            data-testid="global-assistant-drawer"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-outline-variant/18 bg-surface-high/40 px-3 py-2.5">
              <div className="size-12 shrink-0 rounded-md border border-violet/20 bg-void/30 p-1">
                <SentinelFace state="idle" />
              </div>
              <h2 id="global-assistant-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
                {title}
              </h2>
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="hidden size-9 items-center justify-center rounded-md text-outline transition hover:bg-surface-high/60 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet md:flex"
                aria-label={expanded ? "Make chat smaller" : "Expand chat"}
              >
                {expanded ? <Minimize2 aria-hidden="true" className="size-4" /> : <Maximize2 aria-hidden="true" className="size-4" />}
              </button>
              <button
                type="button"
                onClick={closeDrawer}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-outline transition hover:bg-surface-high/60 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet md:size-9"
                aria-label="Close chat"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 px-3 pb-3 pt-2">
              <ChatWorkspace
                key={`${currentPath}-${queryKey}`}
                prompts={pagePrompts}
                pageContext={pageContext}
                initialQuery={initialQuery}
                compact
                compactHeight="fill"
                showCommandShelf={false}
                showComposer
                composerPlacement="bottom"
                showEmptyPrompts
                placeholder={`Ask about ${pageContext.surface}...`}
                onConversationStateChange={setDrawerHasMessages}
                onActionNavigate={closeDrawer}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
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
        "The user is looking at connection checks, manual holdings, one-time holdings imports, preferences, local profile backup, and privacy. Imports happen only after the user presses the import button.",
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

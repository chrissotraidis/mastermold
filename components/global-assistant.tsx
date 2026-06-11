"use client";

import { useEffect, useMemo, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChatWorkspace } from "@/components/chat-workspace";
import {
  MASTER_MOLD_CHAT_EVENT,
  type MasterMoldChatEventDetail,
} from "@/components/master-mold-actions";
import { SentinelFace } from "@/components/sentinel-face";
import { cn } from "@/lib/utils";
import type { ChatPageContext, ChatPrompt } from "@/src/db/chat";

export function GlobalAssistant() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | undefined>();
  const [eventPageContext, setEventPageContext] = useState<ChatPageContext | undefined>();
  const [queryKey, setQueryKey] = useState(0);

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<MasterMoldChatEventDetail>).detail;
      setInitialQuery(detail?.prompt);
      setEventPageContext(detail?.pageContext);
      setQueryKey((current) => current + 1);
      setOpen(true);
    }

    window.addEventListener(MASTER_MOLD_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(MASTER_MOLD_CHAT_EVENT, onOpen);
  }, []);

  const title = useMemo(
    () => (initialQuery ? "Asking Master Mold" : "Ask Master Mold"),
    [initialQuery],
  );
  const currentPath = pathname ?? "/";
  const currentQuery = searchParams.toString();
  const currentRoute = currentQuery ? `${currentPath}?${currentQuery}` : currentPath;
  const isChatPage = currentPath.startsWith("/chat");
  const pagePrompts = useMemo(() => promptsForPath(currentPath), [currentPath]);
  const routePageContext = useMemo(
    () => pageContextForPath(currentPath, currentRoute),
    [currentPath, currentRoute],
  );
  const pageContext = eventPageContext ?? routePageContext;

  return (
    <>
      {!isChatPage ? (
        <button
          type="button"
          onClick={() => {
            setInitialQuery(undefined);
            setEventPageContext(undefined);
            setOpen(true);
          }}
          className="fixed bottom-20 right-4 z-[70] flex size-14 items-center justify-center rounded-full border border-violet/40 bg-surface-high/95 p-2 shadow-2xl shadow-void/50 ring-1 ring-violet/20 transition hover:border-violet hover:bg-surface-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet md:bottom-6 md:right-6 md:size-16"
          aria-label="Open Master Mold chat"
          data-testid="global-assistant-open"
        >
          <SentinelFace state="idle" />
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
                }}
                className="flex size-11 items-center justify-center rounded-md border border-outline-variant/40 text-outline transition hover:text-on-surface"
                aria-label="Close chat"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <div className={cn("min-h-0 flex-1", open && "block")}>
              <ChatWorkspace
                key={`${currentRoute}-${queryKey}`}
                prompts={pagePrompts}
                pageContext={pageContext}
                initialQuery={initialQuery}
                compact
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
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
        prompt: "What does the largest visible holding mean for today's risk?",
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
        prompt: "What paper trade would be useful to test from this page?",
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

  if (pathname.startsWith("/alerts")) {
    return [
      {
        id: "alerts-top",
        label: "Top alert",
        prompt: "Which alert matters most on this page, and why?",
        reference: "Alerts",
      },
      {
        id: "alerts-response",
        label: "Suggested response",
        prompt: "What is the suggested response for the most important alert?",
        reference: "Alerts",
      },
      {
        id: "alerts-useful",
        label: "Useful or not?",
        prompt: "Which alerts are worth checking, and which should I ignore?",
        reference: "Alerts",
      },
      {
        id: "alerts-portfolio",
        label: "Portfolio link",
        prompt: "How do these alerts matter for the visible portfolio?",
        reference: "Alerts",
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
        prompt: "What decision should I review next?",
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

  if (pathname.startsWith("/executor")) {
    return [
      {
        id: "executor-can-do",
        label: "What can it do?",
        prompt: "What can this execution page do right now?",
        reference: "Executor",
      },
      {
        id: "executor-preview-only",
        label: "Preview only?",
        prompt: "Why is this execution page preview-only in the current build?",
        reference: "Executor",
      },
      {
        id: "executor-safety",
        label: "Safety setup",
        prompt: "What safety checks would be required before any real trading?",
        reference: "Executor",
      },
      {
        id: "executor-drill",
        label: "Kill switch",
        prompt: "What does the kill-switch drill prove, and what does it not prove?",
        reference: "Executor",
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
      label: "Top alert",
      prompt: "Why does the most important alert matter, and what should I check?",
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

  if (pathname.startsWith("/alerts")) {
    return {
      surface: "Alerts",
      route,
      summary:
        "The user is looking at the alert inbox: why each item matters, the suggested response, feedback, dismissals, and paper-trade or journal actions.",
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
      surface: "Performance & Trust",
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

  if (pathname.startsWith("/executor")) {
    return {
      surface: "Executor preview",
      route,
      summary:
        "The user is looking at future execution controls, safety setup, and a kill-switch drill. The current app is preview-only and signs nothing.",
    };
  }

  if (pathname.startsWith("/chat")) {
    return {
      surface: "Chat",
      route,
      summary:
        "The user is in the dedicated conversation view with today's saved market context, visible portfolio context, alerts, and recent calls available.",
    };
  }

  return {
    surface: "Today",
    route,
    summary:
      "The user is looking at today's short rundown, the few items worth checking, the top alert response, portfolio context, and paper-trade options.",
  };
}

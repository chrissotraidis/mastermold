"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { openMasterMoldChat } from "@/components/master-mold-actions";
import { directRouteForChatDraft, routeHintsForChatDraft, submittableCommandRoutesForChatDraft } from "@/lib/chat-route-hints";
import { openMasterMoldCommandRoute } from "@/lib/master-mold-command-routing";
import {
  hrefWithMasterMoldCommandHandoff,
  MASTER_MOLD_COMMAND_HANDOFF_EVENT,
  rememberMasterMoldCommandHandoff,
} from "@/lib/master-mold-command-handoff";
import { cn } from "@/lib/utils";
import type { ChatPageContext } from "@/src/db/chat";

export type CommandSuggestion = {
  label: string;
  prompt: string;
};

type CommandStatus = {
  tone: "ready" | "running";
  label: string;
  detail: string;
};

const SUGGESTED: CommandSuggestion[] = [
  { label: "Today", prompt: "Open Today." },
  { label: "Save context", prompt: "Save context for chat." },
  { label: "Run scan", prompt: "Run today's scan." },
  { label: "Check Trade", prompt: "Check Trade." },
];
const VISIBLE_SUGGESTION_LIMIT = 3;
const PREFETCH_SUGGESTION_LIMIT = 5;

/**
 * The way you talk to Master Mold. Submitting opens the global chat with your
 * question; Master Mold answers grounded in today's read, activity, and decision history.
 */
export function CommandConsole({
  suggestions = SUGGESTED,
  pageContext,
  className,
  placeholder = "Ask Master Mold to check, pull, or route…",
}: {
  suggestions?: CommandSuggestion[];
  pageContext?: ChatPageContext;
  className?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CommandStatus | undefined>();
  const trimmedQuery = q.trim();
  const typedActions = useMemo(
    () => (trimmedQuery ? routeHintsForChatDraft(trimmedQuery, pageContext) : []),
    [pageContext, trimmedQuery],
  );
  const readySubmitAction = useMemo(
    () => (trimmedQuery ? submittableCommandRoutesForChatDraft(trimmedQuery, pageContext)[0] : undefined),
    [pageContext, trimmedQuery],
  );
  const visibleStatus = status ?? (readySubmitAction
    ? {
        tone: "ready" as const,
        label: readySubmitAction.label,
        detail: "Ready. Press Enter or choose a route.",
      }
    : undefined);
  const suggestionActionPrefetchKey = useMemo(
    () => commandSuggestionPrefetchKey(suggestions, pageContext),
    [pageContext, suggestions],
  );
  const actionPrefetchKey = useMemo(
    () => [
      ...typedActions.map((action) => prefetchableAppRoute(action.href)).filter(Boolean),
      ...suggestionActionPrefetchKey.split("|").filter(Boolean),
    ].join("|"),
    [suggestionActionPrefetchKey, typedActions],
  );

  useEffect(() => setStatus(undefined), [pathname]);

  useEffect(() => {
    function clearCommandStatus() {
      setStatus(undefined);
    }

    window.addEventListener(MASTER_MOLD_COMMAND_HANDOFF_EVENT, clearCommandStatus);
    return () => window.removeEventListener(MASTER_MOLD_COMMAND_HANDOFF_EVENT, clearCommandStatus);
  }, []);

  useEffect(() => {
    if (!actionPrefetchKey) return;

    for (const href of actionPrefetchKey.split("|")) {
      router.prefetch(href);
    }
  }, [actionPrefetchKey, router]);

  function go(query: string) {
    const trimmed = query.trim();
    const readyRoute = submittableCommandRoutesForChatDraft(trimmed, pageContext)[0] ?? null;

    if (readyRoute) {
      setStatus({
        tone: "running",
        label: readyRoute.label,
        detail: "Master Mold is opening it now.",
      });
      openMasterMoldCommandRoute(router, readyRoute);
      setQ("");
      return;
    }

    openMasterMoldChat(trimmed || undefined, pageContext);
    setQ("");
    setStatus(undefined);
  }

  return (
    <div className={cn("relative z-20 w-full", className)} data-testid="command-console">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex items-center gap-2 rounded-md border border-violet/35 bg-surface-dim/90 px-3 py-2 shadow-sm shadow-void/15 transition-colors focus-within:border-violet focus-within:ring-1 focus-within:ring-violet/35"
      >
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setStatus(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go(q);
            }
          }}
          placeholder={placeholder}
          aria-label="Ask Master Mold"
          className="min-h-11 w-full bg-transparent text-sm text-on-surface placeholder:text-outline focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-violet text-void transition hover:bg-violet/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
        >
          <Send className="size-4" />
        </button>
      </form>
      {visibleStatus ? <CommandStatusLine status={visibleStatus} /> : null}

      <div className="mt-2 grid gap-2">
        {typedActions.length > 0 ? (
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:flex-wrap" aria-label="Ready Master Mold routes" data-testid="command-ready-routes">
            {typedActions.slice(0, 3).map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={hrefWithMasterMoldCommandHandoff(action)}
                onClick={() => {
                  rememberMasterMoldCommandHandoff(action);
                  setStatus({
                    tone: "running",
                    label: action.label,
                    detail: "Master Mold is opening it now.",
                  });
                  setQ("");
                }}
                className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-md border border-violet/35 bg-violet/10 px-2 py-2 text-center text-xs font-semibold text-violet transition hover:bg-violet/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:px-3"
              >
                <span className="line-clamp-2 leading-4">{action.label}</span>
              </Link>
            ))}
          </div>
        ) : null}
        {typedActions.length === 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            {suggestions.slice(0, VISIBLE_SUGGESTION_LIMIT).map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                onClick={() => go(suggestion.prompt)}
                title={suggestion.prompt}
                className="min-h-11 min-w-0 rounded-md border border-outline-variant/40 bg-surface-dim/55 px-2 py-2 text-center text-xs font-semibold text-on-surface-variant transition hover:border-violet/45 hover:bg-violet/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:px-3"
              >
                <span className="line-clamp-2 leading-4">{suggestion.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CommandStatusLine({ status }: { status: CommandStatus }) {
  const Icon = status.tone === "running" ? Loader2 : CheckCircle2;

  return (
    <div
      className={cn(
        "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5",
        status.tone === "running"
          ? "border-violet/35 bg-violet/10 text-on-surface"
          : "border-outline-variant/40 bg-surface-low/70 text-on-surface-variant",
      )}
      data-testid="command-console-status"
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

function prefetchableAppRoute(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return null;

  const [withoutHash] = href.split("#");
  return withoutHash || "/";
}

function commandSuggestionPrefetchKey(suggestions: CommandSuggestion[], pageContext?: ChatPageContext) {
  const routes = new Set<string>();

  for (const suggestion of suggestions.slice(0, PREFETCH_SUGGESTION_LIMIT)) {
    const directRoute = directRouteForChatDraft(suggestion.prompt, pageContext);
    const actions = directRoute ? [directRoute] : routeHintsForChatDraft(suggestion.prompt, pageContext);

    for (const action of actions) {
      const route = prefetchableAppRoute(action.href);
      if (route) routes.add(route);
    }
  }

  return Array.from(routes).join("|");
}

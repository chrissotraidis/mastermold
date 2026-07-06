"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CommandConsole, type CommandSuggestion } from "@/components/command-console";
import { Button } from "@/components/ui/button";
import type { ChatPageContext } from "@/src/db/chat";

export function RouteLoadingSkeleton() {
  const pathname = usePathname() || "/";
  const loadingContext = loadingContextForPath(pathname);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5">
        <section
          className="grid min-h-[calc(100svh-10rem)] gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:content-start"
          aria-labelledby="route-loading-title"
        >
          <div className="border border-outline-variant/40 bg-panel/60 p-4 chamfer-sm sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-telemetry text-outline">Opening</p>
            <h1 id="route-loading-title" className="mt-2 font-display text-2xl font-semibold leading-tight text-on-surface sm:text-3xl">
              {loadingContext.surface}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
              Loading the page controls. Master Mold stays ready for a quick check while this opens.
            </p>
            <CommandConsole
              className="mt-4 max-w-2xl"
              pageContext={loadingContext}
              suggestions={loadingSuggestions(loadingContext.surface)}
              placeholder={`Ask Master Mold while ${loadingContext.surface} opens...`}
            />
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <SkeletonBlock className="h-20 rounded-md" />
              <SkeletonBlock className="h-20 rounded-md" />
              <SkeletonBlock className="h-20 rounded-md" />
            </div>
          </div>
          <div className="border border-outline-variant/40 bg-surface-high/30 p-4 chamfer-sm">
            <p className="text-xs font-semibold uppercase tracking-telemetry text-outline">Next action</p>
            <p className="mt-2 text-lg font-semibold leading-6 text-on-surface">
              Ask Master Mold what to check first.
            </p>
            <SkeletonBlock className="mt-4 h-11 w-full rounded" />
            <SkeletonBlock className="mt-4 h-4 w-full rounded" />
            <SkeletonBlock className="mt-2 h-4 w-10/12 rounded" />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export function RouteErrorFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppShell>
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-10 sm:px-5">
        <section
          aria-labelledby="route-error-title"
          className="w-full rounded-lg border border-critical/30 bg-critical/10 p-5 sm:p-6"
        >
          <p className="sr-only">This view did not load.</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-rose-200/25 bg-surface-dim/60 text-critical">
              <TriangleAlert aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-critical">
                Page problem
              </p>
              <h2 id="route-error-title" className="mt-2 text-2xl font-semibold text-on-surface">
                This page did not load
              </h2>
              <p className="mt-3 text-sm leading-6 text-on-surface-variant">
                Retry this page, or switch sections from the main navigation while the app keeps running.
              </p>
              <p className="mt-3 break-words rounded-md border border-outline-variant/40 bg-surface-dim/50 p-3 text-xs text-outline">
                {error.message || "Unknown route error"}
              </p>
              <Button
                type="button"
                onClick={reset}
                className="mt-5 bg-violet text-void hover:bg-violet"
              >
                <RefreshCw aria-hidden="true" />
                Retry
              </Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-surface-high/80 ${className}`} />;
}

function loadingContextForPath(pathname: string): ChatPageContext {
  if (pathname.startsWith("/portfolio")) {
    return {
      surface: "Portfolio",
      route: pathname,
      summary: "The Portfolio page is loading. The user may want risk, holdings, allocation, or setup status.",
    };
  }
  if (pathname.startsWith("/trading")) {
    return {
      surface: "Trade",
      route: pathname,
      summary: "The Trade page is loading. The user may want wallet status, next action, active orders, or Web3 setup.",
    };
  }
  if (pathname.startsWith("/activity") || pathname.startsWith("/alerts")) {
    return {
      surface: "Activity",
      route: pathname,
      summary: "The Activity page is loading. The user may want the top item, what needs attention, or a paper-trade check.",
    };
  }
  if (pathname.startsWith("/settings")) {
    return {
      surface: "Settings",
      route: pathname,
      summary: "The Settings page is loading. The user may want profile, portfolio connections, AI/chat keys, Web3 setup, or safety limits.",
    };
  }
  if (pathname.startsWith("/paper")) {
    return {
      surface: "Paper",
      route: pathname,
      summary: "The Paper page is loading. The user may want the next paper trade, paper account status, or journal follow-up.",
    };
  }
  if (pathname.startsWith("/journal")) {
    return {
      surface: "Decision journal",
      route: pathname,
      summary: "The Decision journal is loading. The user may want recent calls, review quality, or a decision to revisit.",
    };
  }
  if (pathname.startsWith("/chat")) {
    return {
      surface: "Chat",
      route: pathname,
      summary: "The Master Mold chat view is loading. The user may want today's focus, activity, portfolio risk, Trade status, or setup routes.",
    };
  }
  return {
    surface: "Today",
    route: pathname,
    summary: "The Today page is loading. The user may want the daily focus, top activity, portfolio context, or next action.",
  };
}

function loadingSuggestions(surface: string): CommandSuggestion[] {
  if (surface === "Trade") {
    return [
      { label: "Next action", prompt: "Show next action." },
      { label: "Wallet", prompt: "Show wallet status." },
      { label: "Activity", prompt: "Show urgent activity." },
    ];
  }
  if (surface === "Settings") {
    return [
      { label: "Check setup", prompt: "Check setup." },
      { label: "Web3 setup", prompt: "Open Web3 setup." },
      { label: "AI keys", prompt: "Open AI/chat keys." },
    ];
  }
  if (surface === "Paper") {
    return [
      { label: "Paper trade", prompt: "Prepare paper trade." },
      { label: "Journal", prompt: "Open journal." },
      { label: "Save context", prompt: "Save context for chat." },
    ];
  }
  return [
    { label: "Check page", prompt: `Check ${surface}.` },
    { label: "Activity", prompt: "Show urgent activity." },
    { label: "Save context", prompt: "Save context for chat." },
  ];
}

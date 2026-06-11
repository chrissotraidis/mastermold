"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export function RouteLoadingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-deck px-margin-mobile pb-24 pt-20 md:pl-24 md:pr-margin-desktop md:pb-12">
      <div className="mx-auto max-w-6xl space-y-5">
        <p className="sr-only">Loading Master Mold.</p>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="border border-outline-variant/40 bg-panel/60 p-4 chamfer-sm sm:p-5">
            <SkeletonBlock className="h-5 w-44 rounded-full" />
            <SkeletonBlock className="mt-4 h-8 w-full max-w-lg rounded-md" />
            <SkeletonBlock className="mt-3 h-4 w-11/12 max-w-2xl rounded" />
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <SkeletonBlock className="h-24 rounded-md" />
              <SkeletonBlock className="h-24 rounded-md" />
              <SkeletonBlock className="h-24 rounded-md" />
            </div>
          </div>
          <div className="border border-outline-variant/40 bg-surface-high/30 p-4 chamfer-sm">
            <SkeletonBlock className="h-5 w-36 rounded" />
            <SkeletonBlock className="mt-4 h-14 w-full rounded" />
            <SkeletonBlock className="mt-4 h-4 w-full rounded" />
            <SkeletonBlock className="mt-2 h-4 w-10/12 rounded" />
          </div>
        </div>
        <SkeletonBlock className="h-16 rounded-md" />
      </div>
    </div>
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

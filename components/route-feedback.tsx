"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { AppShell, FirstRunBanner } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export function RouteLoadingSkeleton() {
  return (
    <AppShell>
      <FirstRunBanner />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-5 sm:py-8">
        <p className="sr-only">View loading skeleton while seeded route data loads.</p>
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-6 w-28 rounded-full" />
          <SkeletonBlock className="h-6 w-24 rounded-full" />
          <SkeletonBlock className="h-6 w-20 rounded-full" />
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div className="space-y-4">
            <SkeletonBlock className="h-10 w-full max-w-3xl rounded-md sm:h-12" />
            <SkeletonBlock className="h-10 w-11/12 max-w-2xl rounded-md" />
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-full max-w-3xl rounded" />
              <SkeletonBlock className="h-4 w-10/12 max-w-2xl rounded" />
            </div>
          </div>
          <div className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-5">
            <SkeletonBlock className="h-4 w-32 rounded" />
            <SkeletonBlock className="mt-4 h-10 w-24 rounded" />
            <SkeletonBlock className="mt-4 h-4 w-full rounded" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="rounded-lg border border-outline-variant/40 bg-surface-high/30 p-5">
              <SkeletonBlock className="h-5 w-32 rounded" />
              <SkeletonBlock className="mt-4 h-16 w-full rounded" />
              <SkeletonBlock className="mt-4 h-4 w-10/12 rounded" />
              <SkeletonBlock className="mt-2 h-4 w-8/12 rounded" />
            </div>
          ))}
        </div>
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
          <p className="sr-only">View error boundary fallback with retry option.</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-rose-200/25 bg-surface-dim/60 text-critical">
              <TriangleAlert aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-critical">
                Error boundary
              </p>
              <h2 id="route-error-title" className="mt-2 text-2xl font-semibold text-on-surface">
                This surface did not load
              </h2>
              <p className="mt-3 text-sm leading-6 text-on-surface-variant">
                The app caught the route failure without crashing. Retry the server data fetch,
                or use the persistent nav to switch sections.
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

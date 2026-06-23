"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { cachedGetJson } from "@/lib/client-fetch-cache";
import type { TradingAccountMode, TradingMarketSource, TradingScenario, Web3TradingState } from "@/src/db/web3-trading";

type LoadStatus = "idle" | "loading" | "ready" | "failed";

const WalletSetup = lazy(() =>
  import("@/components/wallet-setup").then((module) => ({ default: module.WalletSetup })),
);
const TestTradeFlow = lazy(() =>
  import("@/components/test-trade-flow").then((module) => ({ default: module.TestTradeFlow })),
);
const TradingMonitor = lazy(() =>
  import("@/components/trading-monitor").then((module) => ({ default: module.TradingMonitor })),
);
const TechnicalStatusDrawer = lazy(() =>
  import("@/components/technical-status-drawer").then((module) => ({ default: module.TechnicalStatusDrawer })),
);

export function TradeDeferredDetails({
  source,
  account,
  scenario,
  technicalDetailsOpen,
  commandAction,
}: {
  source: TradingMarketSource;
  account: TradingAccountMode;
  scenario: TradingScenario;
  technicalDetailsOpen: boolean;
  commandAction?: "run-paper-test";
}) {
  const [state, setState] = useState<Web3TradingState | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState("");
  const [hashTarget, setHashTarget] = useState("");
  const loadRef = useRef<HTMLDivElement>(null);
  const query = useMemo(
    () => `source=${encodeURIComponent(source)}&account=${encodeURIComponent(account)}&scenario=${encodeURIComponent(scenario)}&cycles=0`,
    [account, scenario, source],
  );

  useEffect(() => {
    const updateHashTarget = () => setHashTarget(window.location.hash);
    updateHashTarget();
    window.addEventListener("hashchange", updateHashTarget);
    return () => window.removeEventListener("hashchange", updateHashTarget);
  }, []);

  useEffect(() => {
    if (hashTarget !== "#technical-status") return;
    const frame = window.requestAnimationFrame(() => {
      const details = document.getElementById("technical-status")?.closest("details");
      details?.setAttribute("open", "");
      details?.scrollIntoView({ block: "start", inline: "nearest" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hashTarget, state]);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    let idleId: number | undefined;
    let timerId: number | undefined;
    const browserWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    async function loadDetails() {
      if (started) return;
      started = true;
      setStatus("loading");
      setError("");
      try {
        const nextState = await cachedGetJson<Web3TradingState>(`/api/web3-trading?${query}`, 8_000);
        if (!cancelled) {
          setState(nextState);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setStatus("failed");
          setError("Trade details could not refresh. The overview above is still safe to use.");
        }
      }
    }

    const shouldLoadNow = ["#wallet-setup", "#test-trade-flow", "#trading-monitor", "#technical-status"].includes(window.location.hash);
    if (technicalDetailsOpen || shouldLoadNow || commandAction) {
      void loadDetails();
      return () => {
        cancelled = true;
      };
    }

    let observer: IntersectionObserver | null = null;
    observer = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          void loadDetails();
        }
      }, { rootMargin: "360px 0px" })
      : null;

    if (observer && loadRef.current) observer.observe(loadRef.current);

    if (typeof browserWindow.requestIdleCallback === "function" && typeof browserWindow.cancelIdleCallback === "function") {
      idleId = browserWindow.requestIdleCallback(() => void loadDetails(), { timeout: 1_800 });
    } else {
      timerId = window.setTimeout(() => void loadDetails(), 1_200);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (idleId !== undefined) browserWindow.cancelIdleCallback?.(idleId);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [commandAction, query, technicalDetailsOpen]);

  if (state) {
    return (
      <div className="space-y-4" data-testid="trade-deferred-details">
        <Suspense fallback={<DeferredSectionSkeleton />}>
          <WalletSetup state={state} />
          <TestTradeFlow
            state={state}
            source={source}
            account={account}
            cacheKey={`/api/web3-trading?${query}`}
            commandAction={commandAction}
            onStateChange={setState}
          />
          <TradingMonitor state={state} />
          <TechnicalStatusDrawer
            state={state}
            source={source}
            account={account}
            defaultOpen={technicalDetailsOpen || hashTarget === "#technical-status"}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <section
      ref={loadRef}
      className="rounded-md border border-outline-variant/40 bg-surface-high/20 p-4 sm:p-5"
      aria-labelledby="trade-details-loading-title"
      data-testid="trade-deferred-placeholder"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Trade details</p>
          <h2 id="trade-details-loading-title" className="mt-1 text-lg font-semibold text-on-surface">
            {status === "failed" ? "Details paused." : "Details are loading after the overview."}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
            {error || "Wallet setup, test trade flow, monitor, and technical details load here without blocking the first Trade action."}
          </p>
        </div>
        <span className="rounded-md border border-outline-variant/35 bg-surface-dim/50 px-3 py-2 text-xs text-outline">
          {status === "loading" ? "Refreshing" : status === "failed" ? "Retry on refresh" : "Queued"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
    </section>
  );
}

function DeferredSectionSkeleton() {
  return (
    <section className="rounded-md border border-outline-variant/40 bg-surface-high/20 p-4 sm:p-5" aria-label="Loading Trade tools">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Trade tools</p>
          <h2 className="mt-1 text-lg font-semibold text-on-surface">Opening the wallet and test trade tools.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
            The first Trade action stays available while these controls finish loading.
          </p>
        </div>
        <span className="rounded-md border border-outline-variant/35 bg-surface-dim/50 px-3 py-2 text-xs text-outline">
          Opening
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
    </section>
  );
}

function SkeletonBlock() {
  return (
    <div className="rounded-md border border-outline-variant/30 bg-surface-dim/35 p-3">
      <div className="h-4 w-28 animate-pulse rounded bg-surface-highest/60" />
      <div className="mt-3 h-5 w-36 animate-pulse rounded bg-surface-highest/50" />
      <div className="mt-2 h-3 w-full animate-pulse rounded bg-surface-highest/35" />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleDollarSign, ShieldAlert } from "lucide-react";

import { setCachedJson } from "@/lib/client-fetch-cache";
import { cn } from "@/lib/utils";
import type { TradingAccountMode, TradingMarketSource, Web3TradingState } from "@/src/db/web3-trading";

export function TestTradeFlow({
  state,
  source,
  account,
  cacheKey,
  commandAction,
  onStateChange,
}: {
  state: Web3TradingState;
  source: TradingMarketSource;
  account: TradingAccountMode;
  cacheKey: string;
  commandAction?: "run-paper-test";
  onStateChange: (state: Web3TradingState) => void;
}) {
  const ticket = state.autonomous_order_ticket;
  const execution = state.autonomous_order_ticket_execution;
  const ready = ticket.can_auto_paper || execution.paper_trade_ready;
  const symbol = ticket.symbol ?? execution.symbol ?? state.autonomous_trading_directive.symbol ?? "portfolio";
  const amount = Math.max(ticket.paper_notional_usd, execution.paper_size_usd, state.autonomous_action_queue.deploy_usd);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Paper mode only; no signed transaction is submitted here.",
  );
  const ranCommandRef = useRef(false);

  async function runPaperTest(trigger: "button" | "master-mold-command") {
    if (busy) return;
    if (!ready) {
      setMessage("This test needs review before it can run.");
      clearTradeCommandAction();
      return;
    }

    setBusy(true);
    setMessage(trigger === "master-mold-command" ? "Master Mold is running the paper test." : "Running paper test.");
    try {
      const response = await fetch("/api/web3-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: state.scenario,
          source,
          account,
          cycles: state.paper_account.cycle + 1,
          advance: true,
        }),
      });
      const payload = (await response.json()) as Web3TradingState | { error?: string };

      if (!response.ok || !isWeb3TradingState(payload)) {
        setMessage("error" in payload && payload.error ? payload.error : "Paper test could not run. Review the test trade setup.");
        return;
      }

      setCachedJson(cacheKey, payload);
      onStateChange(payload);
      setMessage(`Paper test updated ${payload.paper_account.trade_count} simulator trade${payload.paper_account.trade_count === 1 ? "" : "s"}. No real money moved.`);
    } catch {
      setMessage("Paper test could not run. Try again.");
    } finally {
      setBusy(false);
      clearTradeCommandAction();
    }
  }

  useEffect(() => {
    if (commandAction !== "run-paper-test" || ranCommandRef.current) return;
    ranCommandRef.current = true;
    void runPaperTest("master-mold-command");
  });

  return (
    <section id="test-trade-flow" className="rounded-md border border-outline-variant/40 bg-surface-high/25 p-4 sm:p-5" aria-labelledby="test-trade-title">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Test trade flow</p>
          <h2 id="test-trade-title" className="mt-1 text-xl font-semibold text-on-surface">
            {ready ? `Ready to test ${ticket.side} ${symbol}.` : `Trade needs review before testing ${symbol}.`}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
            {plainCopy(ticket.summary || execution.summary || state.autonomous_trading_directive.summary)}
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign aria-hidden="true" className={cn("size-5", ready ? "text-engine" : "text-caution")} />
            <p className="text-sm font-semibold text-on-surface">Next paper amount</p>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-on-surface">{formatCurrency(amount)}</p>
          <p className="mt-1 text-xs text-outline">Max live trade limit {formatCurrency(ticket.max_trade_usd)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <FlowStep label="1. Read" value={state.market_source.label} ready={state.market_source.status !== "fallback"} />
        <FlowStep label="2. Size" value={`${ticket.confidence_score}/100 confidence`} ready={ticket.confidence_score >= 60} />
        <FlowStep label="3. Test" value={ready ? "Paper trade allowed" : "Needs review"} ready={ready} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void runPaperTest("button")}
          disabled={busy || !ready}
          data-testid="run-paper-test-trade"
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
            ready
              ? "bg-engine text-void hover:bg-engine/90 disabled:cursor-not-allowed disabled:opacity-60"
              : "border border-outline-variant/50 text-on-surface-variant hover:border-violet/50 hover:text-violet",
          )}
        >
          {busy ? "Running..." : ready ? "Run paper test" : "Needs review"}
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
        <a
          href="/trading?details=technical#technical-status"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/45 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:border-violet/45 hover:text-violet"
        >
          See what it needs
        </a>
        <p data-testid="paper-test-status" className="flex items-center gap-2 text-xs leading-5 text-outline">
          <ShieldAlert aria-hidden="true" className="size-4" />
          {message}
        </p>
      </div>
    </section>
  );
}

function clearTradeCommandAction() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("action") !== "run-paper-test") return;
  url.searchParams.delete("action");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function isWeb3TradingState(value: Web3TradingState | { error?: string }): value is Web3TradingState {
  return Boolean(
    value &&
      "as_of" in value &&
      "paper_account" in value &&
      "market_source" in value,
  );
}

function FlowStep({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3">
      <p className="text-xs font-medium uppercase tracking-telemetry text-outline">{label}</p>
          <p className={cn("mt-1 break-words text-sm font-semibold", ready ? "text-on-surface" : "text-caution")}>{value}</p>
    </div>
  );
}

function plainCopy(value: string) {
  return value
    .replaceAll("canary", "test trade")
    .replaceAll("receipt", "status")
    .replaceAll("packet", "status")
    .replaceAll("blocker", "need")
    .replaceAll("blockers", "needs")
    .replaceAll("relay", "confirmation")
    .replaceAll("proof chain", "confirmation");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

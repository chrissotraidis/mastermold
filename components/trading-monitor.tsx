import { Activity, Clock, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Web3TradingState } from "@/src/db/web3-trading";

export function TradingMonitor({ state }: { state: Web3TradingState }) {
  const rows = [
    {
      label: "Market read",
      value: state.market_source.status === "live" ? "Live" : state.market_source.status,
      detail: state.market_source.detail,
      tone: state.market_source.status === "live" ? "good" : "watch",
    },
    {
      label: "Trade monitor",
      value: state.autonomous_monitor.heartbeat_status.replaceAll("-", " "),
      detail: `Checks every ${state.cadence_seconds}s while paper trading is active.`,
      tone: state.autonomous_monitor.heartbeat_status === "stale" ? "watch" : "good",
    },
    {
      label: "Safety limits",
      value: `${formatCurrency(state.execution_readiness.config.max_trade_usd)} max trade`,
      detail: `${formatCurrency(state.execution_readiness.config.daily_spend_cap_usd)} daily cap and ${state.execution_readiness.config.max_slippage_bps} bps max slippage.`,
      tone: "good",
    },
  ] as const;

  return (
    <section id="trading-monitor" className="rounded-md border border-outline-variant/40 bg-surface-high/25 p-4 sm:p-5" aria-labelledby="trading-monitor-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Trading monitor</p>
          <h2 id="trading-monitor-title" className="mt-1 text-xl font-semibold text-on-surface">
            Watch the desk without opening technical details.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
            The monitor shows market freshness, paper-trade cadence, and active safety limits in one compact view.
          </p>
        </div>
        <p className="inline-flex items-center gap-2 rounded-md border border-outline-variant/40 bg-surface-dim/35 px-3 py-2 text-xs text-outline">
          <Clock aria-hidden="true" className="size-4" />
          Updated {formatTime(state.as_of)}
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-on-surface">{row.label}</p>
              {row.label === "Market read" ? <ActivityIcon tone={row.tone} /> : <RefreshIcon tone={row.tone} />}
            </div>
            <p className={cn("mt-2 text-base font-semibold capitalize", row.tone === "good" ? "text-engine" : "text-caution")}>{row.value}</p>
            <p className="mt-1 text-xs leading-5 text-outline">{row.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivityIcon({ tone }: { tone: "good" | "watch" }) {
  return <Activity aria-hidden="true" className={cn("size-4", tone === "good" ? "text-engine" : "text-caution")} />;
}

function RefreshIcon({ tone }: { tone: "good" | "watch" }) {
  return <RefreshCw aria-hidden="true" className={cn("size-4", tone === "good" ? "text-engine" : "text-caution")} />;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

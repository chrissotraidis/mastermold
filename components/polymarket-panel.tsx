"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ExternalLink, LockKeyhole, OctagonAlert, Play, RefreshCw, ShieldCheck, Square } from "lucide-react";

import { PolySniperCoverage, TradeContractCard } from "@/components/polymarket-strategy-panel";
import { PolymarketWeatherSection } from "@/components/polymarket-weather-panel";
import type { PolymarketApiPayload } from "@/app/api/polymarket/route";
import { PolymarketBrainPanel } from "@/components/polymarket-brain-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ControlBody = Record<string, string | number>;

export function PolymarketPanel() {
  const [data, setData] = useState<PolymarketApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/polymarket", { cache: "no-store" });
      const body = await response.json() as PolymarketApiPayload | { error: string };
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : "Polymarket status failed.");
      setData(body);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Polymarket status failed.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const control = useCallback((body: ControlBody) => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/polymarket", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const next = await response.json() as PolymarketApiPayload | { error: string };
        if (!response.ok || "error" in next) throw new Error("error" in next ? next.error : "Polymarket control failed.");
        setData(next);
        setError(null);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Polymarket control failed.");
      }
    });
  }, []);

  if (!data) {
    return (
      <Card className="border-outline-variant/30 bg-surface-low/70">
        <CardContent className="p-6 text-sm text-on-surface-variant">
          {error ?? "Loading the public Polymarket market board…"}
        </CardContent>
      </Card>
    );
  }

  const armed = data.state.mode === "paper";
  const halted = data.state.kill_switch || data.state.mode === "halted";
  const canControl = data.control_access.available;
  const paperAuthority = data.paper_authority.available;
  const topSignalScore = data.signals.length > 0 ? Math.max(...data.signals.map((signal) => signal.score)) : null;
  const lastActivityAt = data.activity.length > 0 ? data.activity[0].ts : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      {error ? (
        <div role="alert" className="rounded-md border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-critical">
          {error}
        </div>
      ) : null}

      {!canControl ? (
        <p className="rounded-md border border-caution/35 bg-caution/5 px-4 py-2 text-xs leading-5 text-caution">
          <LockKeyhole className="mr-2 inline size-3.5" /> {data.control_access.detail}
        </p>
      ) : null}

      <Card className="border-outline-variant/30 bg-surface-low/75">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", halted ? "bg-critical" : armed ? "bg-engine animate-pulse" : "bg-outline")} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-semibold text-on-surface">Polymarket paper lane</h2>
                <Badge variant="outline" className={cn(halted ? "border-critical/40 text-critical" : armed ? "border-engine/35 text-engine" : "text-outline")}>
                  {halted ? "Halted" : armed ? "Paper armed" : "Off"}
                </Badge>
                <Badge variant="outline" className="border-violet/30 text-violet">
                  {data.market_read.source === "live" ? "Live public read" : "Cached read"}
                </Badge>
                {data.paper_authority.tier === "exploration" ? (
                  <Badge variant="outline" className="border-violet/30 text-violet">Exploration entries</Badge>
                ) : null}
              </div>
              <p className={cn("mt-1 text-[11px] leading-4", data.paper_authority.available ? "text-on-surface-variant" : "text-caution")}>{data.paper_authority.detail}</p>
              <p className="mt-1 text-[11px] text-outline">
                Market read {formatRelative(data.market_read.fetched_at)} · Last cycle {data.state.last_cycle_at ? formatRelative(data.state.last_cycle_at) : "not run"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {halted ? (
              <Button variant="outline" disabled={pending || !canControl} onClick={() => control({ action: "release" })}>
                <ShieldCheck /> Release to off
              </Button>
            ) : (
              <Button
                variant={armed ? "outline" : "default"}
                disabled={pending || !canControl || (!armed && !paperAuthority)}
                onClick={() => control({ action: "set_mode", mode: armed ? "off" : "paper" })}
              >
                {armed ? <Square /> : <Play />}
                {armed ? "Stop paper bot" : paperAuthority ? "Arm promoted paper bot" : "No strategy promoted"}
              </Button>
            )}
            <Button variant="outline" disabled={pending || !armed || !canControl} onClick={() => control({ action: "run_cycle" })}>
              <RefreshCw className={cn(pending && "animate-spin")} /> Run cycle
            </Button>
            <Button variant="destructive" disabled={pending || halted || !canControl} onClick={() => control({ action: "kill" })}>
              <OctagonAlert /> Halt lane
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Paper equity" value={money(data.account.equity_usd)} detail={`${signedMoney(data.account.unrealized_pnl_usd)} open P&L`} />
        <Metric label="Available cash" value={money(data.account.cash_usd)} detail={`${money(data.account.deployed_usd)} deployed`} />
        <Metric label="Open positions" value={`${data.positions.length} / ${data.state.caps.max_positions}`} detail={`${money(data.state.caps.max_trade_usd)} max per paper entry`} />
        <Metric label="Realized P&L" value={signedMoney(data.account.realized_pnl_usd)} detail={`${signedMoney(data.account.realized_today_usd)} today`} />
      </div>

      <EquityCurve curve={data.equity_curve} />

      <PolymarketBrainPanel brain={data.brain} pending={pending} controlAvailable={canControl} onResearch={() => control({ action: "run_brain_cycle" })} />

      <TradeContractCard contract={data.paper_contract} authority={data.paper_authority} />

      {data.positions.length > 0 ? (
        <Card className="border-outline-variant/30 bg-surface-low/70">
          <CardContent className="space-y-2 p-4">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Open paper positions</p>
            {data.positions.map((position) => (
              <div key={position.id} className="flex flex-col gap-3 rounded-md border border-outline-variant/25 bg-void/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-violet">{position.outcome}</Badge>
                    <span className="font-mono text-outline">Entry {(position.entry_price * 100).toFixed(1)}¢</span>
                    <span className="font-mono text-outline">Indicative {(position.current_price * 100).toFixed(1)}¢</span>
                    <span className={cn("font-mono", position.pnl_usd >= 0 ? "text-engine" : "text-critical")}>{signedMoney(position.pnl_usd)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-on-surface">{position.question}</p>
                  <p className="mt-1 text-[11px] text-outline">Opened {formatRelative(position.opened_at)} · {money(position.stake_usd)} stake</p>
                </div>
                <Button variant="outline" size="sm" disabled={pending || !canControl} onClick={() => control({ action: "close_position", position_id: position.id })}>
                  Close paper position
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Watch lists, observation labs, activity, and reference prose live in
          collapsed rows: the lab reads in one screen and detail is one click away. */}
      <Card className="border-outline-variant/30 bg-surface-low/70 py-1">
        <details className="px-3">
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 text-xs font-semibold text-on-surface">
            Sniper watch
            <span className="font-normal text-outline">
              {data.signals.length === 0
                ? "no market clears the filters right now"
                : `${data.signals.length} shadow setup${data.signals.length === 1 ? "" : "s"}${topSignalScore !== null ? ` · top score ${topSignalScore}` : ""} · indicative prices`}
            </span>
          </summary>
          <div className="space-y-2 pb-3">
            {data.signals.length === 0 ? (
              <EmptyState>No market currently clears the fee, liquidity, volume, move, and price filters.</EmptyState>
            ) : data.signals.slice(0, 8).map((signal) => (
              <article key={signal.id} className="rounded-md border border-outline-variant/25 bg-void/20 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-engine/30 text-engine">Score {signal.score}</Badge>
                      <span className="font-mono text-xs text-violet">{signal.outcome} {(signal.price * 100).toFixed(1)}¢</span>
                      <span className="font-mono text-xs text-engine">+{(signal.move_24h * 100).toFixed(1)}% / 24h</span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold leading-5 text-on-surface">{signal.question}</h3>
                    <p className="mt-1 text-xs leading-5 text-outline">{signal.thesis}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={`https://polymarket.com/event/${signal.slug}`} target="_blank" rel="noreferrer">
                        Market <ExternalLink />
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending || !armed || !canControl || !paperAuthority}
                      onClick={() => control({ action: "paper_buy", market_id: signal.market_id, outcome_index: signal.outcome_index, stake_usd: 5 })}
                    >
                      Paper $5
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </details>

        <PolymarketWeatherSection weather={data.weather} />

        <details className="border-t border-outline-variant/20 px-3">
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 text-xs font-semibold text-on-surface">
            Recent lane activity
            <span className="font-normal text-outline">
              {lastActivityAt ? `last event ${formatRelative(lastActivityAt)}` : "no paper controls or trades recorded"}
            </span>
          </summary>
          <div className="space-y-1 pb-3">
            {data.activity.length === 0 ? <EmptyState>No paper controls or trades have been recorded.</EmptyState> : data.activity.slice(0, 10).map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 border-b border-outline-variant/20 py-2 last:border-0">
                <p className="text-xs leading-5 text-on-surface-variant">{row.message}</p>
                <time className="shrink-0 font-mono text-[10px] text-outline">{formatRelative(row.ts)}</time>
              </div>
            ))}
          </div>
        </details>

        <details className="border-t border-outline-variant/20 px-3">
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 text-xs font-semibold text-on-surface">
            Reference
            <span className="font-normal text-outline">strategy coverage · live-execution lock · lane boundary</span>
          </summary>
          <div className="space-y-3 pb-3">
            <PolySniperCoverage catalog={data.strategy_catalog} />
            <div className="rounded-md border border-caution/30 bg-caution/5 p-3 text-xs leading-5 text-on-surface-variant">
              <p className="mb-1 flex items-center gap-2 font-semibold text-on-surface">
                <LockKeyhole className="size-3.5 text-caution" /> Live execution locked
              </p>
              <p>{data.live_execution.detail}</p>
              <p className="mt-2">
                The PolySniper reference informed the research plan, but its strategy labels overstate the completeness of several execution paths and its legacy order client was not copied.
                A future live pass must use Polymarket CLOB V2, an isolated Polygon signer/deposit wallet, local-only credentials, allowance checks, and an evidence gate.
              </p>
            </div>
            <div className="rounded-md border border-outline-variant/25 bg-void/20 p-3 text-xs leading-5 text-on-surface-variant">
              <p className="mb-1 font-semibold text-on-surface">Lane boundary</p>
              {data.data_boundary} The Solana autopilot, portfolio store, and Polymarket simulator remain separate.
            </div>
          </div>
        </details>
      </Card>
    </div>
  );
}

function EquityCurve({ curve }: { curve: Array<{ ts: string; realized_pnl_usd: number; action: "open" | "close" }> }) {
  const closes = curve.filter((point) => point.action === "close");
  if (closes.length < 2) {
    return (
      <Card className="border-outline-variant/30 bg-surface-low/70">
        <CardContent className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Realized P&L curve</p>
          <p className="mt-1 text-xs text-outline">
            {curve.length === 0 ? "No paper trades yet — the curve draws itself once the bot starts closing positions." : "Waiting for at least two closed trades to draw the curve."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const width = 720;
  const height = 72;
  const pad = 4;
  const values = closes.map((point) => point.realized_pnl_usd);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const x = (index: number) => pad + (index / (closes.length - 1)) * (width - pad * 2);
  const y = (value: number) => pad + (1 - (value - min) / range) * (height - pad * 2);
  const path = closes.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.realized_pnl_usd).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const zeroY = y(0);

  return (
    <Card className="border-outline-variant/30 bg-surface-low/70">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Realized P&L curve · {closes.length} closes</p>
          <p className={cn("font-mono text-xs", last >= 0 ? "text-engine" : "text-critical")}>{last >= 0 ? "+" : ""}${last.toFixed(2)}</p>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-[72px] w-full" preserveAspectRatio="none" role="img" aria-label="Cumulative realized paper P&L over closed trades">
          <line x1={pad} x2={width - pad} y1={zeroY} y2={zeroY} className="stroke-outline-variant/40" strokeDasharray="3 4" strokeWidth="1" />
          <path d={path} fill="none" strokeWidth="1.5" className={last >= 0 ? "stroke-engine" : "stroke-critical"} />
          {closes.map((point, index) => (
            <circle key={`${point.ts}-${index}`} cx={x(index)} cy={y(point.realized_pnl_usd)} r="2" className={point.realized_pnl_usd >= (index > 0 ? closes[index - 1].realized_pnl_usd : 0) ? "fill-engine" : "fill-critical"} />
          ))}
        </svg>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="border-outline-variant/30 bg-surface-low/70">
      <CardContent className="p-4">
        <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</p>
        <p className="mt-1 font-display text-xl font-semibold text-on-surface">{value}</p>
        <p className="mt-1 text-xs text-on-surface-variant">{detail}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-outline-variant/35 px-4 py-6 text-center text-xs leading-5 text-outline">{children}</div>;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : ""}${money(value)}`;
}

function formatRelative(value: string) {
  const delta = Date.now() - Date.parse(value);
  if (!Number.isFinite(delta)) return "unknown";
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

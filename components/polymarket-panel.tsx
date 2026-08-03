"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ExternalLink, LockKeyhole, OctagonAlert, Play, RefreshCw, ShieldCheck, Square } from "lucide-react";

import { PolymarketStrategyPanel } from "@/components/polymarket-strategy-panel";
import { PolymarketWeatherPanel } from "@/components/polymarket-weather-panel";
import type { PolymarketApiPayload } from "@/app/api/polymarket/route";
import { PolymarketBrainPanel } from "@/components/polymarket-brain-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="space-y-3 sm:space-y-4">
      {error ? (
        <div role="alert" className="rounded-md border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-critical">
          {error}
        </div>
      ) : null}

      {!canControl ? (
        <div className="rounded-md border border-caution/35 bg-caution/5 px-4 py-3 text-sm text-caution">
          <LockKeyhole className="mr-2 inline size-4" /> {data.control_access.detail}
        </div>
      ) : null}

      <Card className="border-outline-variant/30 bg-surface-low/75">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", halted ? "bg-critical" : armed ? "bg-engine animate-pulse" : "bg-outline")} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-semibold text-on-surface">Promotion-gated Polymarket research</h2>
                <Badge variant="outline" className={cn(halted ? "border-critical/40 text-critical" : armed ? "border-engine/35 text-engine" : "text-outline")}>
                  {halted ? "Halted" : armed ? "Paper armed" : "Off"}
                </Badge>
                <Badge variant="outline" className="border-violet/30 text-violet">
                  {data.market_read.source === "live" ? "Live public read" : "Cached read"}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-on-surface-variant">
                Momentum remains a shadow baseline and cannot open new simulator positions unless its forward-label promotion gate passes.
                Research, resolution scoring, weather observation, and protective exits continue without entry authority.
              </p>
              <p className="mt-1 text-[11px] text-caution">{data.paper_authority.detail}</p>
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

      <PolymarketStrategyPanel contract={data.paper_contract} catalog={data.strategy_catalog} />

      <PolymarketWeatherPanel weather={data.weather} />

      <PolymarketBrainPanel brain={data.brain} pending={pending} controlAvailable={canControl} onResearch={() => control({ action: "run_brain_cycle" })} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(19rem,0.8fr)]">
        <Card className="border-outline-variant/30 bg-surface-low/70">
          <CardHeader className="flex-row items-start justify-between gap-3 p-4 pb-2">
            <div>
              <CardTitle as="h2" className="text-base">Sniper watch</CardTitle>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">Shadow momentum setups for measurement. They become paper-eligible only after the evidence gate passes; displayed prices remain indicative.</p>
            </div>
            <Badge variant="outline">{data.signals.length} setups</Badge>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2">
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
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card className="border-caution/30 bg-caution/5">
            <CardHeader className="p-4 pb-2">
              <CardTitle as="h2" className="flex items-center gap-2 text-base"><LockKeyhole className="size-4 text-caution" /> Live execution locked</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-1 text-xs leading-5 text-on-surface-variant">
              <p>{data.live_execution.detail}</p>
              <p>
                The PolySniper reference informed the research plan, but its strategy labels overstate the completeness of several execution paths and its legacy order client was not copied.
                A future live pass must use Polymarket CLOB V2, an isolated Polygon signer/deposit wallet, local-only credentials, allowance checks, and an evidence gate.
              </p>
            </CardContent>
          </Card>

          <Card className="border-outline-variant/30 bg-surface-low/70">
            <CardHeader className="p-4 pb-2"><CardTitle as="h2" className="text-base">Lane boundary</CardTitle></CardHeader>
            <CardContent className="p-4 pt-1 text-xs leading-5 text-on-surface-variant">
              {data.data_boundary} The Solana autopilot, portfolio store, and Polymarket simulator remain separate.
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-outline-variant/30 bg-surface-low/70">
        <CardHeader className="p-4 pb-2"><CardTitle as="h2" className="text-base">Open paper positions</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-4 pt-2">
          {data.positions.length === 0 ? <EmptyState>No Polymarket paper positions are open.</EmptyState> : data.positions.map((position) => (
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

      <Card className="border-outline-variant/30 bg-surface-low/70">
        <CardHeader className="p-4 pb-2"><CardTitle as="h2" className="text-base">Recent lane activity</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-4 pt-2">
          {data.activity.length === 0 ? <EmptyState>No paper controls or trades have been recorded.</EmptyState> : data.activity.slice(0, 10).map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 border-b border-outline-variant/20 py-2 last:border-0">
              <p className="text-xs leading-5 text-on-surface-variant">{row.message}</p>
              <time className="shrink-0 font-mono text-[10px] text-outline">{formatRelative(row.ts)}</time>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
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

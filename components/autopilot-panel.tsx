"use client";

import { FormEvent, useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";

import { AutopilotTerminal } from "./autopilot-terminal";

type AutopilotCaps = {
  max_trade_usd: number;
  daily_loss_limit_usd: number;
  max_positions: number;
  drawdown_halt_pct: number;
};

type AutopilotStateView = {
  mode: "off" | "paper" | "live" | "halted";
  kill_switch: boolean;
  started_at: string | null;
  updated_at: string;
  caps: AutopilotCaps;
  wallet_label: string | null;
  last_tick_at: string | null;
  daemon: "live" | "stale" | "offline";
  open_positions: number;
  equity_usd: number;
  last_activity: { id: string; ts: string; kind: string; message: string } | null;
  runtime_unavailable?: string;
};

type MarketFeedRow = {
  symbol: string;
  price_usd: number;
  change_h1_pct: number | null;
  change_h24_pct: number | null;
  volume_h24_usd: number | null;
  liquidity_usd: number | null;
};

type AutopilotApiPayload = {
  state: AutopilotStateView;
  positions: Array<{
    mint: string;
    symbol: string;
    qty: number;
    avg_cost_usd: number;
    opened_at: string;
    updated_at: string;
  }>;
  equity: Array<{ ts: string; equity_usd: number }>;
  recent_trades: Array<{
    id: string;
    ts: string;
    side: "buy" | "sell";
    symbol: string;
    qty: number;
    price_usd: number;
    value_usd: number;
    reason: string;
  }>;
  recent_activity: Array<{ id: string; ts: string; kind: string; message: string }>;
  recent_decisions?: Array<{ id: string; ts: string; symbol: string; verdict: string; reason: string }>;
  go_live_gate?: { ready: boolean; checks: Array<{ key: string; label: string; pass: boolean; detail: string }> };
  live_wallet?: { provisioned: boolean; pubkey: string | null };
  market_feed?: MarketFeedRow[];
  analyst?: { ts: string; memo: string } | null;
  /** V3 shadow telemetry: candidate dataset size + the calibration verdict. */
  v3?: {
    snapshot_count: number;
    labeled_count: number;
    latest_note: string | null;
    calibration: { verdict: string; labeled_snapshots: number };
  };
  data_boundary: string;
};

const modeDotClass: Record<AutopilotStateView["mode"], string> = {
  off: "bg-outline",
  paper: "bg-engine",
  live: "bg-primary",
  halted: "bg-critical",
};

const modeLabel: Record<AutopilotStateView["mode"], string> = {
  off: "Off",
  paper: "Paper",
  live: "LIVE",
  halted: "HALTED",
};

export function AutopilotPanel() {
  const [data, setData] = useState<AutopilotApiPayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmingKill, setConfirmingKill] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/autopilot", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the bot status.");
      setData((await response.json()) as AutopilotApiPayload);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the bot status.");
    }
  }, []);

  useEffect(() => {
    void load();
    // Keep the heartbeat + live feed fresh; the server caches the feed 60s so
    // this polling never hammers DexScreener.
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  function post(body: Record<string, unknown>, successMessage: string) {
    if (data?.state.runtime_unavailable) {
      setMessage("");
      setError(data.state.runtime_unavailable);
      return;
    }
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/autopilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => null)) as
          | AutopilotApiPayload
          | { error?: string }
          | null;
        if (!response.ok || !payload || !("state" in payload)) {
          throw new Error((payload as { error?: string } | null)?.error || "The control change did not save.");
        }
        setData(payload);
        setMessage(successMessage);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The control change did not save.");
      }
    });
  }

  function handleKillClick(engaged: boolean) {
    if (data?.state.runtime_unavailable) {
      setConfirmingKill(false);
      setMessage("");
      setError(data.state.runtime_unavailable);
      return;
    }
    if (!confirmingKill) {
      setConfirmingKill(true);
      // The confirm window closes itself: a stray first click never leaves a
      // primed kill switch waiting for an accidental second one.
      window.setTimeout(() => setConfirmingKill(false), 4_000);
      return;
    }
    setConfirmingKill(false);
    if (engaged) {
      post({ action: "release" }, "Kill switch released. Arm paper trading to resume.");
    } else {
      post({ action: "kill" }, "Kill switch engaged. The bot is halted.");
    }
  }

  function handleModeClick(mode: "paper" | "off") {
    post(
      { action: "set_mode", mode },
      mode === "paper" ? "Paper trading armed. The daemon picks it up on its next tick." : "Bot set to off.",
    );
  }

  function submitCaps(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data?.state.runtime_unavailable) {
      setMessage("");
      setError(data.state.runtime_unavailable);
      return;
    }
    const entries = Object.fromEntries(new FormData(event.currentTarget).entries());
    const caps: Record<string, number> = {};
    for (const key of ["max_trade_usd", "daily_loss_limit_usd", "max_positions", "drawdown_halt_pct"]) {
      const raw = String(entries[key] ?? "").trim();
      if (raw !== "") caps[key] = Number(raw);
    }
    post({ action: "set_caps", caps }, "Caps saved. The paper daemon reads them on its next tick.");
  }

  if (error && !data) {
    return <p className="text-sm text-critical">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-outline">Checking the bot status.</p>;
  }

  const { state, positions, equity, recent_trades: recentTrades, recent_activity: recentActivity } = data;
  const killEngaged = state.kill_switch;
  const runtimeUnavailable = Boolean(state.runtime_unavailable);

  return (
    <div className="rounded-md border border-outline-variant/25">
      {/* Terminal tape first, right under the page title: the bot's current
          activity (ticks, entries, exits, skips, blocks, analyst notes). */}
      <div className="px-3 pt-2">
        <AutopilotTerminal
          activity={recentActivity}
          decisions={data.recent_decisions ?? []}
          gate={data.go_live_gate ?? null}
        />
      </div>
      {/* Cockpit row: mode, wallet, heartbeat, equity, kill switch. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${modeDotClass[state.mode]}`} />
          <span
            className={`text-sm font-semibold ${state.mode === "halted" ? "text-critical" : "text-on-surface"}`}
          >
            {modeLabel[state.mode]}
          </span>
        </span>
        {data.live_wallet?.provisioned && data.live_wallet.pubkey ? (
          <span className="text-xs text-outline">
            wallet {data.live_wallet.pubkey.slice(0, 4)}…{data.live_wallet.pubkey.slice(-4)}
          </span>
        ) : (
          <Link href="/settings#autopilot" className="text-xs font-semibold text-violet hover:text-tertiary">
            Wallet setup notes
          </Link>
        )}
        <DaemonHeartbeat daemon={state.daemon} lastTickAt={state.last_tick_at} />
        <span className="ml-auto flex items-center gap-3">
          <span className="inline-flex items-baseline gap-1 text-sm tabular-nums text-on-surface">
            <span>{formatCurrency(state.equity_usd)}</span>
            <span className="text-xs text-on-surface-variant">paper equity</span>
          </span>
          {!runtimeUnavailable && !killEngaged && state.mode === "off" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleModeClick("paper")}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-engine/15 px-3 text-xs font-semibold text-engine transition-colors hover:bg-engine/25 disabled:opacity-50 sm:min-h-8"
            >
              Arm paper trading
            </button>
          ) : null}
          {!runtimeUnavailable && !killEngaged && (state.mode === "paper" || state.mode === "live") ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleModeClick("off")}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/40 px-3 text-xs text-on-surface-variant transition-colors hover:bg-surface-dim/40 disabled:opacity-50 sm:min-h-8"
            >
              Stop
            </button>
          ) : null}
          <button
            type="button"
            disabled={isPending || runtimeUnavailable}
            onClick={() => handleKillClick(killEngaged)}
            onBlur={() => setConfirmingKill(false)}
            className={`inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-colors disabled:opacity-50 sm:min-h-8 ${
              confirmingKill && !killEngaged
                ? "border-critical bg-critical text-white hover:bg-critical/90"
                : killEngaged
                  ? "border-outline-variant/40 text-on-surface hover:bg-surface-dim/40"
                  : "border-critical/40 text-critical hover:bg-critical/10"
            }`}
          >
            {confirmingKill
              ? killEngaged
                ? "Click again to release"
                : "CONFIRM: halt the bot"
              : runtimeUnavailable
                ? "Controls locked"
              : killEngaged
                ? "Release kill switch"
                : "Kill switch"}
          </button>
        </span>
      </div>
      {runtimeUnavailable || killEngaged || message || error ? (
        <p aria-live="polite" className="px-3 pb-1.5 text-xs text-outline">
          {runtimeUnavailable ? (
            <span className="font-semibold text-outline">
              RUNTIME UNAVAILABLE — {state.runtime_unavailable}{" "}
            </span>
          ) : killEngaged ? (
            <span className="font-semibold text-critical">HALTED — release the kill switch, then Arm paper trading. </span>
          ) : null}
          {message || error}
        </p>
      ) : (
        <span aria-live="polite" className="sr-only">
          {message || error}
        </span>
      )}

      {data.go_live_gate ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-outline-variant/20 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-outline">
            Go-live gate {data.go_live_gate.ready ? "OPEN" : "locked"}
          </span>
          {data.go_live_gate.checks.map((check) => (
            <span key={check.key} className="flex items-center gap-1.5 text-[11px] text-on-surface-variant" title={check.detail}>
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${check.pass ? "bg-engine" : "bg-outline/60"}`}
              />
              {check.key}
              <span className={check.pass ? "text-engine" : "text-outline"}>{check.pass ? "✓" : "✗"}</span>
            </span>
          ))}
        </div>
      ) : null}

      {data.v3 ? (
        <p
          className="border-t border-outline-variant/20 px-3 py-1.5 text-[11px] text-outline"
          title={data.v3.latest_note ?? undefined}
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest">V3 shadow</span>
          {" · "}
          {data.v3.snapshot_count} observations · {data.v3.labeled_count} labeled ·{" "}
          {data.v3.calibration.verdict}
        </p>
      ) : null}

      <div className="border-t border-outline-variant/20 px-3 py-1.5">
        <EquitySparkline points={equity} />
      </div>

      <div className="border-t border-outline-variant/20 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-telemetry text-outline">Live market feed</h3>
        {(data.market_feed ?? []).length === 0 ? (
          <p className="mt-1 text-xs leading-5 text-outline">
            Feed unavailable right now — it retries on the next refresh.
          </p>
        ) : (
          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-outline">
                  <th scope="col" className="py-1 pr-2 font-medium">Symbol</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">Price</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">1h</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">24h</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">Vol 24h</th>
                  <th scope="col" className="py-1 text-right font-medium">Liquidity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {(data.market_feed ?? []).map((row) => (
                  <tr key={row.symbol}>
                    <td className="py-1 pr-2 font-semibold text-on-surface">{row.symbol}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-on-surface-variant">
                      {formatFeedPrice(row.price_usd)}
                    </td>
                    <td className={`py-1 pr-2 text-right tabular-nums ${pctToneClass(row.change_h1_pct)}`}>
                      {formatPct(row.change_h1_pct)}
                    </td>
                    <td className={`py-1 pr-2 text-right tabular-nums ${pctToneClass(row.change_h24_pct)}`}>
                      {formatPct(row.change_h24_pct)}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-outline">
                      {formatCompactUsd(row.volume_h24_usd)}
                    </td>
                    <td className="py-1 text-right tabular-nums text-outline">
                      {formatCompactUsd(row.liquidity_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-x-4 gap-y-2 border-t border-outline-variant/20 px-3 py-2 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-telemetry text-outline">
            Positions ({state.open_positions})
          </h3>
          {positions.length === 0 ? (
            <p className="mt-1 text-xs leading-5 text-outline">
              No positions. Entries fire when window momentum clears the gate.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-outline-variant/15">
              {positions.map((position) => (
                <li key={position.mint} className="flex items-baseline gap-2 py-1 text-xs">
                  <span className="font-semibold text-on-surface">{position.symbol}</span>
                  <span className="tabular-nums text-on-surface-variant">{formatQuantity(position.qty)}</span>
                  <span className="ml-auto tabular-nums text-outline">
                    avg {formatCurrency(position.avg_cost_usd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-telemetry text-outline">Paper ledger</h3>
          {recentTrades.length === 0 ? (
            <p className="mt-1 text-xs leading-5 text-outline">No entries yet. Fills append here, never edit.</p>
          ) : (
            <ul className="mt-1 divide-y divide-outline-variant/15">
              {recentTrades.slice(0, 5).map((trade) => (
                <li key={trade.id} className="flex items-baseline gap-2 py-1 text-xs">
                  <span className={trade.side === "buy" ? "text-engine" : "text-critical"}>
                    {trade.side === "buy" ? "Buy" : "Sell"}
                  </span>
                  <span className="font-semibold text-on-surface">{trade.symbol}</span>
                  <span className="ml-auto tabular-nums text-on-surface-variant">
                    {formatCurrency(trade.value_usd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {recentActivity.length > 0 ? (
        <div className="border-t border-outline-variant/20 px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-telemetry text-outline">Recent decisions</h3>
          <ul className="mt-1 divide-y divide-outline-variant/15">
            {recentActivity.slice(0, 5).map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-2 py-1 text-xs">
                <span className="shrink-0 tabular-nums text-outline">{formatAgo(entry.ts)}</span>
                <span className="min-w-0 truncate text-on-surface-variant" title={entry.message}>
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.analyst ? (
        <div className="border-t border-outline-variant/20 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-outline">
            Analyst review · {new Date(data.analyst.ts).toLocaleDateString()}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{data.analyst.memo}</p>
        </div>
      ) : null}

      <details className="border-t border-outline-variant/20 px-3">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-on-surface">
          Caps
          <span className="font-normal text-outline">
            {formatCurrency(state.caps.max_trade_usd)}/entry · {formatCurrency(state.caps.daily_loss_limit_usd)}
            /day loss · {state.caps.max_positions} positions · {state.caps.drawdown_halt_pct}% drawdown halt
          </span>
        </summary>
        <form className="grid gap-3 pb-3 sm:grid-cols-4" onSubmit={submitCaps}>
          <fieldset disabled={runtimeUnavailable || isPending} className="contents">
            <CapField
              id="autopilot-cap-trade"
              name="max_trade_usd"
              label="Max per entry ($)"
              defaultValue={state.caps.max_trade_usd}
              max={1000}
            />
            <CapField
              id="autopilot-cap-daily-loss"
              name="daily_loss_limit_usd"
              label="Daily loss limit ($)"
              defaultValue={state.caps.daily_loss_limit_usd}
            />
            <CapField
              id="autopilot-cap-positions"
              name="max_positions"
              label="Max positions"
              defaultValue={state.caps.max_positions}
              step={1}
            />
            <CapField
              id="autopilot-cap-drawdown"
              name="drawdown_halt_pct"
              label="Drawdown halt (%)"
              defaultValue={state.caps.drawdown_halt_pct}
            />
            <button
              type="submit"
              disabled={runtimeUnavailable || isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-dim/40 disabled:opacity-50 sm:col-span-4 sm:min-h-8 sm:justify-self-start"
            >
              Save caps
            </button>
          </fieldset>
        </form>
      </details>

      <p className="border-t border-outline-variant/20 px-3 py-2 text-xs leading-5 text-outline">
        {data.data_boundary}
      </p>
    </div>
  );
}

const daemonDotClass: Record<AutopilotStateView["daemon"], string> = {
  live: "bg-engine",
  stale: "bg-caution",
  offline: "bg-critical",
};

const daemonTextClass: Record<AutopilotStateView["daemon"], string> = {
  live: "text-engine",
  stale: "text-caution",
  offline: "text-critical",
};

/** Heartbeat readout: is the paper daemon process actually ticking? */
function DaemonHeartbeat({
  daemon,
  lastTickAt,
}: {
  daemon: AutopilotStateView["daemon"];
  lastTickAt: string | null;
}) {
  const label =
    daemon === "offline"
      ? "daemon offline — run npm run autopilot"
      : `${daemon} · ticked ${formatAgo(lastTickAt)}`;
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${daemonDotClass[daemon]}`} />
      <span className={`text-xs font-medium ${daemonTextClass[daemon]}`}>{label}</span>
    </span>
  );
}

function formatAgo(iso: string | null): string {
  const ms = iso ? Date.now() - Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function pctToneClass(value: number | null): string {
  if (value === null || value === 0) return "text-outline";
  return value > 0 ? "text-engine" : "text-critical";
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatFeedPrice(value: number): string {
  if (value >= 1) return formatCurrency(value);
  return `$${value.toLocaleString("en-US", { maximumSignificantDigits: 3 })}`;
}

function formatCompactUsd(value: number | null): string {
  if (value === null) return "—";
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

function EquitySparkline({ points }: { points: Array<{ ts: string; equity_usd: number }> }) {
  const width = 240;
  const height = 36;
  const values = points.map((point) => point.equity_usd);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const coords =
    points.length === 1
      ? `0,${scaleY(values[0], min, span, height)} ${width},${scaleY(values[0], min, span, height)}`
      : points
          .map((point, index) => {
            const x = (index / (points.length - 1)) * width;
            return `${x.toFixed(1)},${scaleY(point.equity_usd, min, span, height)}`;
          })
          .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Paper equity, ${points.length} recorded points`}
      className="h-9 w-full max-w-xs text-violet"
      preserveAspectRatio="none"
    >
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function scaleY(value: number, min: number, span: number, height: number): string {
  const padded = height - 4;
  return (height - 2 - ((value - min) / span) * padded).toFixed(1);
}

function CapField({
  id,
  name,
  label,
  defaultValue,
  max,
  step = 0.01,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: number;
  max?: number;
  step?: number;
}) {
  return (
    <label htmlFor={id} className="grid gap-1 text-xs font-medium text-on-surface-variant">
      {label}
      <input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        min={step === 1 ? 1 : 0.01}
        max={max}
        step={step}
        defaultValue={defaultValue}
        className="h-11 w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:h-8"
      />
    </label>
  );
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  });
}

function formatQuantity(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";
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
  /** The strategy made legible: name, rule sentences from live params, and the
   * daemon's latest per-symbol verdicts. */
  strategy?: {
    name: string;
    summary: string;
    rules: string[];
    evaluations: {
      ts: string;
      mode: string;
      evaluations: Array<{ symbol: string; status: SymbolStatus; reason: string }>;
    } | null;
  };
  attribution?: {
    round_trips: number;
    wins: number;
    losses: number;
    win_rate: number | null;
    expectancy_usd: number | null;
    premature_stops: number;
  };
  go_live_gate?: { ready: boolean; checks: Array<{ key: string; label: string; pass: boolean; detail: string }> };
  live_wallet?: { provisioned: boolean; pubkey: string | null };
  market_feed?: MarketFeedRow[];
  /** Solana trending radar: where attention is flowing right now. */
  trending?: Array<{
    mint: string;
    symbol: string;
    sources: string[];
    rank: number | null;
    price_usd: number | null;
    price_change_h1_pct: number | null;
    price_change_h24_pct: number | null;
    volume_h24_usd: number | null;
    liquidity_usd: number | null;
    boost_amount: number | null;
  }>;
  /** Operator-curated smart-money list the copy_wallets module follows,
   * plus the system's own scored discovery suggestions. */
  smart_wallets?: {
    watched: string[];
    suggestions?: {
      ts: string;
      source: "solanatracker" | "gecko_trades" | "none";
      suggestions: Array<{
        address: string;
        source: string;
        score: number;
        win_rate: number | null;
        realized_pnl_usd: number | null;
        trades: number | null;
        flags: string[];
      }>;
    } | null;
    /** Followed wallets judged by our own price record of their buys. */
    report_cards?: Array<{
      wallet: string;
      buys: number;
      graded: number;
      hit_rate: number | null;
      avg_return_pct: number | null;
    }>;
    /** SolanaTracker's metered monthly request budget. */
    api_budget?: { used: number; limit: number; remaining: number; fraction_used: number; allowed: boolean };
  };
  tier_b?: {
    active: Array<{
      symbol: string;
      mint: string;
      liquidity_usd: number;
      volume_h24_usd: number;
      below_exit_floor_days: number;
    }>;
    denylist: string[];
    last_rotation_at: string | null;
  };
  analyst?: { ts: string; memo: string } | null;
  /** V3 shadow telemetry: candidate dataset size, calibration verdict, and
   * the paper-promotion gate. */
  v3?: {
    snapshot_count: number;
    labeled_count: number;
    latest_note: string | null;
    calibration: { verdict: string; labeled_snapshots: number };
    promotion?: { ready: boolean; checks: Array<{ key: string; label: string; pass: boolean; detail: string }> };
    by_strategy?: Record<string, {
      calibration: { verdict: string; labeled_snapshots: number; enter_count: number; enter_net_mean_bps: number | null; ev_realized_slope: number | null };
      promotion: { ready: boolean; checks: Array<{ key: string; label: string; pass: boolean; detail: string }> };
      stored_ready: boolean;
      stored_eligible: boolean;
      operator_confirmed_at: string | null;
      live_candidate: { ready: boolean; reasons: string[]; paper_observation_days: number; paper_round_trips: number; paper_net_bps: number | null; module_risk_halts: number };
    }>;
    carry?: {
      open_markets: number;
      realized_usd: number;
      round_trips: number;
      total_usd: number;
      apr_pct: number | null;
    };
  };
  data_boundary: string;
};

type SymbolStatus = "warming" | "held" | "exiting" | "blocked" | "rejected" | "entering";

const statusChipClass: Record<SymbolStatus, string> = {
  entering: "bg-engine/15 text-engine",
  held: "bg-violet/15 text-violet",
  exiting: "bg-caution/15 text-caution",
  warming: "bg-surface-dim/70 text-outline",
  rejected: "bg-surface-dim/70 text-on-surface-variant",
  blocked: "bg-critical/10 text-critical",
};

const statusChipLabel: Record<SymbolStatus, string> = {
  entering: "entering",
  held: "held",
  exiting: "exiting",
  warming: "warming up",
  rejected: "waiting",
  blocked: "blocked",
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
  const killConfirmTimer = useRef<number | null>(null);
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
      // primed kill switch waiting for an accidental second one. Tracked in a
      // ref and cleared so a re-primed confirm gets a full fresh 4s.
      if (killConfirmTimer.current) clearTimeout(killConfirmTimer.current);
      killConfirmTimer.current = window.setTimeout(() => setConfirmingKill(false), 4_000);
      return;
    }
    if (killConfirmTimer.current) clearTimeout(killConfirmTimer.current);
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

      {data.strategy ? <StrategyCard strategy={data.strategy} /> : null}

      {/* Autonomy status: gate, shadow learning, and carry evidence as ONE
          block — three separate bordered rows read as clutter. */}
      {data.go_live_gate || data.v3 ? (
        <div className="border-t border-outline-variant/20 px-3 py-1.5">
          {data.go_live_gate ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
            <p className="mt-1 text-[11px] text-outline" title={data.v3.latest_note ?? undefined}>
              <span className="text-[10px] font-semibold uppercase tracking-widest">V3 shadow</span>
              {" · "}
              {data.v3.snapshot_count} observations · {data.v3.labeled_count} labeled ·{" "}
              {data.v3.calibration.verdict}
              {data.v3.promotion ? (
                <span
                  className={data.v3.promotion.ready ? "text-engine" : undefined}
                  title={data.v3.promotion.checks.map((check) => `${check.pass ? "✓" : "✗"} ${check.label} — ${check.detail}`).join("\n")}
                >
                  {" · "}
                  {data.v3.promotion.ready
                    ? "eligible for operator review"
                    : `paper promotion ${data.v3.promotion.checks.filter((check) => check.pass).length}/${data.v3.promotion.checks.length} checks`}
                </span>
              ) : null}
              {data.v3.carry ? (
                <span title="Synthetic $100-per-market delta-neutral funding carry, marked from live Drift funding — the strategy's evidence, never a live position.">
                  {" · "}
                  carry shadow{" "}
                  <span className={data.v3.carry.total_usd >= 0 ? "text-engine" : "text-critical"}>
                    {data.v3.carry.total_usd >= 0 ? "+" : ""}${data.v3.carry.total_usd.toFixed(2)}
                  </span>
                  {` (${data.v3.carry.open_markets} open${data.v3.carry.apr_pct !== null ? `, ~${data.v3.carry.apr_pct.toFixed(1)}% APR` : ""})`}
                </span>
              ) : null}
            </p>
          ) : null}
          {data.v3?.by_strategy && Object.keys(data.v3.by_strategy).length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(data.v3.by_strategy).map(([strategyId, row]) => (
                <span key={strategyId} className="inline-flex items-center gap-2 rounded-md bg-surface-dim/35 px-2 py-1 text-[11px] text-on-surface-variant">
                  <span title={[...row.promotion.checks.map((check) => `${check.pass ? "✓" : "✗"} ${check.label} — ${check.detail}`), `Live candidate: ${row.live_candidate.ready ? "ready" : row.live_candidate.reasons.join("; ")}`].join("\n")}>
                    {strategyId} · {row.stored_ready ? "PAPER active" : row.promotion.ready ? "eligible" : `${row.promotion.checks.filter((check) => check.pass).length}/${row.promotion.checks.length}`}
                  </span>
                  {row.promotion.ready && !row.stored_ready ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => post({ action: "confirm_v3_promotion", strategy: strategyId }, `${strategyId} confirmed for the PAPER co-pilot.`)}
                      className="rounded bg-engine/15 px-2 py-0.5 font-semibold text-engine hover:bg-engine/25 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  ) : null}
                  {row.stored_ready ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => post({ action: "demote_v3_strategy", strategy: strategyId }, `${strategyId} removed from the PAPER co-pilot.`)}
                      className="rounded bg-critical/10 px-2 py-0.5 font-semibold text-critical hover:bg-critical/20 disabled:opacity-50"
                    >
                      Demote
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-1">
            <EquitySparkline points={equity} />
          </div>
        </div>
      ) : null}

      {/* Reference tables live in collapsed sections: the cockpit stays one
          screen tall and the data is one click away when wanted. */}
      <details className="border-t border-outline-variant/20 px-3">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-on-surface">
          Live market feed
          <span className="font-normal text-outline">{feedSummaryLine(data.market_feed ?? [])}</span>
        </summary>
        {(data.market_feed ?? []).length === 0 ? (
          <p className="pb-2 text-xs leading-5 text-outline">
            Feed unavailable right now — it retries on the next refresh.
          </p>
        ) : (
          <div className="pb-2">
            <div className="grid gap-1.5 sm:hidden">
              {(data.market_feed ?? []).map((row) => (
                <div key={row.symbol} className="rounded-md border border-outline-variant/20 bg-void/20 p-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-on-surface">{row.symbol}</span>
                    <span className="tabular-nums text-on-surface-variant">{formatFeedPrice(row.price_usd)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className={`flex justify-between gap-2 ${pctToneClass(row.change_h1_pct)}`}><span className="text-outline">1h</span>{formatPct(row.change_h1_pct)}</span>
                    <span className={`flex justify-between gap-2 ${pctToneClass(row.change_h24_pct)}`}><span className="text-outline">24h</span>{formatPct(row.change_h24_pct)}</span>
                    <span className="flex justify-between gap-2 text-outline"><span>Volume</span>{formatCompactUsd(row.volume_h24_usd)}</span>
                    <span className="flex justify-between gap-2 text-outline"><span>Liquidity</span>{formatCompactUsd(row.liquidity_usd)}</span>
                  </div>
                </div>
              ))}
            </div>
            <table className="hidden w-full text-xs sm:table">
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
      </details>

      {(data.trending ?? []).length > 0 ? (
        <details className="border-t border-outline-variant/20 px-3">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-on-surface">
            Solana radar
            <span className="font-normal text-outline">
              {(data.trending ?? []).length} trending on-chain · feeds the V3 shadow, never trades directly
            </span>
          </summary>
          <div className="pb-2">
            <div className="grid gap-1.5 sm:hidden">
              {(data.trending ?? []).map((row) => (
                <div key={row.mint} className="rounded-md border border-outline-variant/20 bg-void/20 p-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-on-surface">{row.rank ?? "—"}. {row.symbol}</span>
                    <span className="text-outline">{row.boost_amount !== null ? `boosted ${Math.round(row.boost_amount)}` : "trending"}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className={`flex justify-between gap-2 ${pctToneClass(row.price_change_h1_pct)}`}><span className="text-outline">1h</span>{formatPct(row.price_change_h1_pct)}</span>
                    <span className={`flex justify-between gap-2 ${pctToneClass(row.price_change_h24_pct)}`}><span className="text-outline">24h</span>{formatPct(row.price_change_h24_pct)}</span>
                    <span className="flex justify-between gap-2 text-outline"><span>Volume</span>{formatCompactUsd(row.volume_h24_usd)}</span>
                    <span className="flex justify-between gap-2 text-outline"><span>Liquidity</span>{formatCompactUsd(row.liquidity_usd)}</span>
                  </div>
                </div>
              ))}
            </div>
            <table className="hidden w-full text-xs sm:table">
              <thead>
                <tr className="text-left text-outline">
                  <th scope="col" className="py-1 pr-2 font-medium">#</th>
                  <th scope="col" className="py-1 pr-2 font-medium">Token</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">1h</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">24h</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">Vol 24h</th>
                  <th scope="col" className="py-1 pr-2 text-right font-medium">Liquidity</th>
                  <th scope="col" className="py-1 text-right font-medium">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {(data.trending ?? []).map((row) => (
                  <tr key={row.mint}>
                    <td className="py-1 pr-2 tabular-nums text-outline">{row.rank ?? "—"}</td>
                    <td className="py-1 pr-2 font-semibold text-on-surface">{row.symbol}</td>
                    <td className={`py-1 pr-2 text-right tabular-nums ${pctToneClass(row.price_change_h1_pct)}`}>
                      {formatPct(row.price_change_h1_pct)}
                    </td>
                    <td className={`py-1 pr-2 text-right tabular-nums ${pctToneClass(row.price_change_h24_pct)}`}>
                      {formatPct(row.price_change_h24_pct)}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-outline">
                      {formatCompactUsd(row.volume_h24_usd)}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-outline">
                      {formatCompactUsd(row.liquidity_usd)}
                    </td>
                    <td className="py-1 text-right text-outline">
                      {row.boost_amount !== null ? `boosted ${Math.round(row.boost_amount)}` : "trending"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      {/* The book: a single quiet line until something is actually held or
          filled — two columns of empty states earned no space. */}
      {positions.length === 0 && recentTrades.length === 0 ? (
        <p className="border-t border-outline-variant/20 px-3 py-2 text-xs leading-5 text-outline">
          No positions, no fills yet — entries land here when a setup clears the gate.
        </p>
      ) : (
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
      )}

      {/* "Recent decisions" was the tape's activity stream rendered a second
          time on the same page — pure duplication, removed. */}

      {data.attribution || data.analyst ? (
        <div className="border-t border-outline-variant/20 px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-telemetry text-outline">Learning</h3>
          {data.attribution ? (
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              {data.attribution.round_trips === 0 ? (
                "No completed round trips yet — win rate and expectancy appear after the first exits."
              ) : (
                <>
                  <span className="font-semibold text-on-surface">{data.attribution.round_trips}</span> round trips ·{" "}
                  <span className={data.attribution.win_rate !== null && data.attribution.win_rate >= 0.5 ? "text-engine" : "text-on-surface-variant"}>
                    {data.attribution.win_rate !== null ? `${Math.round(data.attribution.win_rate * 100)}% wins` : "win rate n/a"}
                  </span>
                  {" · "}
                  <span className={data.attribution.expectancy_usd !== null && data.attribution.expectancy_usd >= 0 ? "text-engine" : "text-critical"}>
                    {data.attribution.expectancy_usd !== null
                      ? `${data.attribution.expectancy_usd >= 0 ? "+" : ""}$${data.attribution.expectancy_usd.toFixed(2)}/trade expectancy`
                      : "expectancy n/a"}
                  </span>
                  {data.attribution.premature_stops > 0 ? ` · ${data.attribution.premature_stops} premature stops` : null}
                </>
              )}
            </p>
          ) : null}
          {data.analyst ? (
            <>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-outline">
                Analyst review · {new Date(data.analyst.ts).toLocaleDateString()}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{data.analyst.memo}</p>
            </>
          ) : null}
        </div>
      ) : null}

      <details className="border-t border-outline-variant/20 px-3">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-on-surface">
          Dynamic Tier B
          <span className="font-normal text-outline">
            {(data.tier_b?.active ?? []).length} liquid token{(data.tier_b?.active ?? []).length === 1 ? "" : "s"} active
          </span>
        </summary>
        <div className="pb-3">
          <p className="text-xs leading-5 text-outline">
            Rotates daily from the keyless Solana radar after age, liquidity, volume, and mint-metadata checks.
            Tier B entries are capped at $15 and two open positions; dropped holdings become exit-only.
          </p>
          {(data.tier_b?.active ?? []).length > 0 ? (
            <ul className="mt-2 divide-y divide-outline-variant/15">
              {(data.tier_b?.active ?? []).map((token) => (
                <li key={token.mint} className="flex items-center justify-between gap-2 py-1 text-xs">
                  <span className="font-semibold text-on-surface">{token.symbol}</span>
                  <span className="text-outline">
                    ${(token.liquidity_usd / 1_000_000).toFixed(1)}m liquidity · ${(token.volume_h24_usd / 1_000_000).toFixed(1)}m volume
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="mt-3 grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const raw = String(new FormData(event.currentTarget).get("tier_b_denylist") ?? "");
              const denylist = raw.split(/[\s,]+/).filter(Boolean);
              post({ action: "set_tier_b_denylist", denylist }, "Tier B denylist saved.");
            }}
          >
            <label htmlFor="tier-b-denylist" className="text-[11px] font-semibold uppercase tracking-wide text-outline">
              Operator denylist
            </label>
            <textarea
              id="tier-b-denylist"
              name="tier_b_denylist"
              rows={3}
              key={(data.tier_b?.denylist ?? []).join(",")}
              defaultValue={(data.tier_b?.denylist ?? []).join("\n")}
              placeholder="One Solana mint per line"
              className="w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 font-mono text-xs text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
            />
            <button
              type="submit"
              disabled={runtimeUnavailable || isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-dim/40 disabled:opacity-50 sm:min-h-8 sm:justify-self-start"
            >
              Save denylist
            </button>
          </form>
        </div>
      </details>

      <details className="border-t border-outline-variant/20 px-3">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-on-surface">
          Smart wallets
          <span className="font-normal text-outline">
            {(data.smart_wallets?.watched ?? []).length === 0
              ? "none watched — paste addresses to follow smart money"
              : `following ${(data.smart_wallets?.watched ?? []).length} wallet${(data.smart_wallets?.watched ?? []).length === 1 ? "" : "s"}`}
          </span>
        </summary>
        <div className="pb-3">
          <p className="text-xs leading-5 text-outline">
            Read-only: the bot polls these addresses for fresh buys and scores them as slow-horizon copy
            candidates in the V3 shadow. It never mirrors trades directly and holds no wallet authority.
          </p>
          <form
            className="mt-2 grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const raw = String(new FormData(event.currentTarget).get("wallets") ?? "");
              const wallets = raw.split(/[\s,]+/).filter(Boolean);
              post({ action: "set_watched_wallets", wallets }, "Watched wallet list saved.");
            }}
          >
            <textarea
              name="wallets"
              rows={3}
              // Keyed on the watched list so a "Follow" click (which posts a
              // new list and updates data) remounts the field with the fresh
              // set instead of showing the stale mounted value.
              key={(data.smart_wallets?.watched ?? []).join(",")}
              defaultValue={(data.smart_wallets?.watched ?? []).join("\n")}
              placeholder={"One Solana address per line (max 8).\nFind candidates on GMGN/Birdeye PnL leaderboards."}
              className="w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2 font-mono text-xs text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
            />
            <button
              type="submit"
              disabled={runtimeUnavailable || isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/40 px-3 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-dim/40 disabled:opacity-50 sm:min-h-8 sm:justify-self-start"
            >
              Save watched wallets
            </button>
          </form>

          {(data.smart_wallets?.report_cards ?? []).length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-outline">
                Report cards · graded by our own record of what happened 6h after each buy
              </p>
              <ul className="mt-1 divide-y divide-outline-variant/15">
                {(data.smart_wallets?.report_cards ?? []).map((card) => (
                  <li key={card.wallet} className="flex items-baseline gap-2 py-1 text-xs">
                    <span className="min-w-0 truncate font-mono text-on-surface-variant" title={card.wallet}>
                      {card.wallet.slice(0, 4)}…{card.wallet.slice(-4)}
                    </span>
                    <span className="text-outline">
                      {card.buys} buy{card.buys === 1 ? "" : "s"}
                      {card.graded > 0 ? (
                        <>
                          {" · "}
                          <span className={card.avg_return_pct !== null && card.avg_return_pct >= 0 ? "text-engine" : "text-critical"}>
                            {card.avg_return_pct !== null ? `${card.avg_return_pct >= 0 ? "+" : ""}${card.avg_return_pct.toFixed(1)}% avg` : ""}
                          </span>
                          {card.hit_rate !== null ? ` · ${Math.round(card.hit_rate * 100)}% up at 6h (${card.graded} graded)` : ""}
                        </>
                      ) : (
                        " · awaiting the 6h grade"
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.smart_wallets?.api_budget ? (
            <p className="mt-2 text-[11px] text-outline">
              SolanaTracker budget:{" "}
              <span className={data.smart_wallets.api_budget.allowed ? undefined : "font-semibold text-caution"}>
                {data.smart_wallets.api_budget.used}/{data.smart_wallets.api_budget.limit} requests this month
              </span>
              {!data.smart_wallets.api_budget.allowed
                ? " — soft stop reached, discovery is using the keyless fallback until next month"
                : null}
            </p>
          ) : null}

          {data.smart_wallets?.suggestions && data.smart_wallets.suggestions.suggestions.length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-outline">
                Discovered candidates ·{" "}
                {data.smart_wallets.suggestions.source === "solanatracker"
                  ? "PnL leaderboard, trap-filtered"
                  : "trending-pool activity — no PnL history, vet before following"}
              </p>
              <ul className="mt-1 divide-y divide-outline-variant/15">
                {data.smart_wallets.suggestions.suggestions.map((suggestion) => {
                  const followed = (data.smart_wallets?.watched ?? []).includes(suggestion.address);
                  return (
                    <li key={suggestion.address} className="flex items-center gap-2 py-1 text-xs">
                      <span className="w-10 shrink-0 tabular-nums font-semibold text-on-surface" title="Anti-trap score (0-100)">
                        {suggestion.score}
                      </span>
                      <span className="min-w-0 truncate font-mono text-on-surface-variant" title={suggestion.address}>
                        {suggestion.address.slice(0, 4)}…{suggestion.address.slice(-4)}
                      </span>
                      <span className="min-w-0 truncate text-outline" title={suggestion.flags.join("; ")}>
                        {suggestion.win_rate !== null ? `${Math.round(suggestion.win_rate * 100)}% wins` : "wins n/a"}
                        {suggestion.realized_pnl_usd !== null
                          ? ` · +$${Math.round(suggestion.realized_pnl_usd).toLocaleString("en-US")} realized`
                          : ""}
                        {suggestion.trades !== null ? ` · ${suggestion.trades} trades` : ""}
                        {suggestion.flags.length > 0 ? " · ⚠" : ""}
                      </span>
                      <button
                        type="button"
                        disabled={runtimeUnavailable || isPending || followed}
                        onClick={() =>
                          post(
                            {
                              action: "set_watched_wallets",
                              wallets: [...(data.smart_wallets?.watched ?? []), suggestion.address],
                            },
                            `Now following ${suggestion.address.slice(0, 4)}…${suggestion.address.slice(-4)}.`,
                          )
                        }
                        className="ml-auto inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-outline-variant/40 px-2 text-[11px] font-semibold text-on-surface transition-colors hover:bg-surface-dim/40 disabled:opacity-50 sm:min-h-7"
                      >
                        {followed ? "Following" : "Follow"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </details>

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

/** The strategy, visible: what it is, the rules it runs, and the live verdict
 * on every universe token — the answer to "what is this bot actually doing?" */
function StrategyCard({ strategy }: { strategy: NonNullable<AutopilotApiPayload["strategy"]> }) {
  const snapshot = strategy.evaluations;
  return (
    <div className="border-t border-outline-variant/20 px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-xs font-semibold uppercase tracking-telemetry text-outline">Strategy</h3>
        <span className="text-xs font-semibold text-on-surface">{strategy.name}</span>
        {snapshot ? (
          <span className="text-[11px] text-outline">verdicts from {formatAgo(snapshot.ts)}</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">{strategy.summary}</p>

      {snapshot && snapshot.evaluations.length > 0 ? (
        <ul className="mt-1.5 divide-y divide-outline-variant/15">
          {snapshot.evaluations.map((row) => (
            <li key={row.symbol} className="flex items-baseline gap-2 py-1 text-xs">
              <span className="w-12 shrink-0 font-semibold text-on-surface">{row.symbol}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChipClass[row.status] ?? statusChipClass.rejected}`}
              >
                {statusChipLabel[row.status] ?? row.status}
              </span>
              <span className="min-w-0 truncate text-on-surface-variant" title={row.reason}>
                {row.reason}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs leading-5 text-outline">
          No per-symbol verdicts yet — they appear once the daemon completes a tick in paper mode.
        </p>
      )}

      <details className="mt-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-on-surface sm:min-h-8">
          Entry and exit rules (live values)
        </summary>
        <ul className="list-disc space-y-1 pb-2 pl-5 text-xs leading-5 text-on-surface-variant">
          {strategy.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </details>
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

/** Collapsed-state one-liner: enough signal to decide whether to expand. */
function feedSummaryLine(rows: MarketFeedRow[]): string {
  if (rows.length === 0) return "unavailable — retrying";
  const sol = rows.find((row) => row.symbol === "SOL");
  const solNote = sol
    ? ` · SOL ${formatFeedPrice(sol.price_usd)}${sol.change_h24_pct !== null ? ` (${sol.change_h24_pct > 0 ? "+" : ""}${sol.change_h24_pct.toFixed(1)}% 24h)` : ""}`
    : "";
  return `${rows.length} symbols${solNote}`;
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

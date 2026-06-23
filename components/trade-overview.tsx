import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Web3TradingState } from "@/src/db/web3-trading";

export function TradeOverview({
  state,
  overviewMode = "cached",
  requestedSource = state?.market_source.mode ?? "live-dex",
}: {
  state: Web3TradingState | null;
  overviewMode?: "cached" | "fast-preview";
  requestedSource?: "sample" | "live-dex";
}) {
  const wallet = state?.autonomous_wallet_telemetry ?? null;
  const markBoard = state?.autonomous_portfolio_mark_board ?? null;
  const action = state ? buildNextAction(state) : buildPreviewNextAction(requestedSource);
  const isFastPreview = overviewMode === "fast-preview";
  const walletKey =
    state?.autonomous_custody_mandate.wallet_public_key ??
    state?.live_wallet_accounting_readiness.wallet_public_key ??
    state?.execution_readiness.config.wallet_public_key ??
    null;

  return (
    <>
    <span id="active-positions-orders" className="block scroll-mt-28" aria-hidden="true" />
    <section
      aria-labelledby="trade-overview-title"
      className="grid min-h-[calc(100svh-10rem)] gap-4 pb-6 lg:grid-cols-[minmax(0,0.74fr)_minmax(21rem,0.36fr)] lg:content-start"
    >
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <WalletStatusCard
            wallet={wallet}
            walletKey={walletKey}
            status={state?.wallet_holdings_adapter.status ?? "blocked"}
            cashUsd={wallet?.cash_usd ?? null}
            exposureUsd={wallet?.exposure_usd ?? null}
            openPositionCount={wallet?.open_position_count ?? null}
            isFastPreview={isFastPreview}
            requestedSource={requestedSource}
          />
          <NextActionCard action={action} isFastPreview={isFastPreview} requestedSource={requestedSource} />
        </div>
        <div className="lg:hidden">
          <PositionsOrdersPanel state={state} titleId="positions-orders-title-mobile" isFastPreview={isFastPreview} />
        </div>
        <div className="hidden sm:block">
          <NetWorthChart wallet={wallet} isFastPreview={isFastPreview} />
        </div>
      </div>

      <div className="hidden min-w-0 lg:block">
        <PositionsOrdersPanel state={state} titleId="positions-orders-title-desktop" isFastPreview={isFastPreview} />
      </div>

      <h2 id="trade-overview-title" className="sr-only">
        Trade overview
      </h2>
      <span className="sr-only">
        {markBoard
          ? `Net worth ${formatCurrency(markBoard.equity_usd)} with ${markBoard.held_count} active positions.`
          : "Trade overview is showing a fast preview while active positions refresh."}
      </span>
    </section>
    </>
  );
}

function WalletStatusCard({
  wallet,
  walletKey,
  status,
  cashUsd,
  exposureUsd,
  openPositionCount,
  isFastPreview,
  requestedSource,
}: {
  wallet: Web3TradingState["autonomous_wallet_telemetry"] | null;
  walletKey: string | null;
  status: Web3TradingState["wallet_holdings_adapter"]["status"];
  cashUsd: number | null;
  exposureUsd: number | null;
  openPositionCount: number | null;
  isFastPreview: boolean;
  requestedSource: "sample" | "live-dex";
}) {
  const connected = Boolean(walletKey) && status !== "blocked";
  const statusLabel = isFastPreview && requestedSource === "live-dex"
    ? "Refreshing"
    : connected ? "Connected" : "Needs setup";

  return (
    <section
      id="wallet-status"
      className="scroll-mt-28 rounded-md border border-outline-variant/40 bg-surface-high/35 p-3 sm:p-4 md:col-span-1"
      aria-labelledby="wallet-status-title"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet aria-hidden="true" className={cn("size-5", connected ? "text-engine" : "text-caution")} />
          <h3 id="wallet-status-title" className="text-sm font-semibold text-on-surface">
            Wallet status
          </h3>
        </div>
        <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", connected ? "bg-engine/10 text-engine" : "bg-caution/10 text-caution")}>
          {statusLabel}
        </span>
      </div>
      <p className="mt-3 truncate font-mono text-xs text-outline">
        {walletKey ? shortWallet(walletKey) : "No wallet selected"}
      </p>
      {isFastPreview ? (
        <p className="mt-2 text-xs leading-5 text-outline">
          Showing a fast preview while the {requestedSource === "live-dex" ? "live DEX read" : "sample read"} refreshes.
        </p>
      ) : null}
      <div className="mt-3 grid gap-2 text-xs min-[360px]:grid-cols-3">
        <Metric label="Cash" value={cashUsd === null ? "Checking" : formatCurrency(cashUsd)} />
        <Metric label="In trades" value={exposureUsd === null ? "Checking" : formatCurrency(exposureUsd)} />
        <Metric label="Open" value={openPositionCount === null ? "Checking" : `${openPositionCount}`} />
      </div>
      <MiniNetWorthStrip wallet={wallet} isFastPreview={isFastPreview} />
    </section>
  );
}

function NextActionCard({
  action,
  isFastPreview,
  requestedSource,
}: {
  action: TradeNextAction;
  isFastPreview: boolean;
  requestedSource: "sample" | "live-dex";
}) {
  return (
    <section
      id="next-action"
      className="scroll-mt-28 rounded-md border border-violet/30 bg-violet/[0.045] p-3 sm:p-4 md:col-span-2"
      aria-labelledby="next-action-title"
    >
      <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Next required action</p>
      {" "}
      <h3 id="next-action-title" className="mt-1 text-lg font-semibold leading-tight text-on-surface sm:text-xl">
        {action.title}
      </h3>
      {" "}
      <div className="mt-3 flex flex-col sm:mt-2">
        <p className="sr-only order-2 mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant sm:not-sr-only sm:order-1 sm:mt-0">
          {isFastPreview
            ? `${action.detail} Full ${requestedSource === "live-dex" ? "live DEX" : "sample"} details are refreshing below.`
            : action.detail}
        </p>
        <Link
          href={action.href}
          className="order-1 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-violet px-4 py-2 text-sm font-semibold text-void transition hover:bg-violet/90 sm:order-2 sm:mt-4 sm:w-auto"
        >
          {action.cta}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function NetWorthChart({
  wallet,
  isFastPreview,
}: {
  wallet: Web3TradingState["autonomous_wallet_telemetry"] | null;
  isFastPreview: boolean;
}) {
  const previewEquity = 0;
  const points = wallet && wallet.curve.length > 0
    ? wallet.curve
    : [{
      id: "current",
      label: "Current",
      recorded_at: wallet?.last_tick_at ?? new Date(0).toISOString(),
      cycle: 0,
      action: "current" as const,
      equity_usd: wallet?.equity_usd ?? previewEquity,
      cash_usd: wallet?.cash_usd ?? previewEquity,
      exposure_usd: wallet?.exposure_usd ?? previewEquity,
      realized_pnl_usd: wallet?.realized_pnl_usd ?? 0,
      unrealized_pnl_usd: wallet?.unrealized_pnl_usd ?? 0,
      drawdown_pct: wallet?.max_drawdown_pct ?? 0,
      filled_count: wallet?.fill_count ?? 0,
      blocked_count: wallet?.blocked_count ?? 0,
    }];
  const values = points.map((point) => point.equity_usd);
  const min = Math.min(...values);
  const max = Math.max(...values, 1);
  const span = Math.max(max - min, max * 0.02, 1);
  const lo = min - span * 0.18;
  const hi = max + span * 0.18;
  const width = 320;
  const height = 110;
  const coords = points.map((point, index) => {
    const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * width;
    const y = height - ((point.equity_usd - lo) / (hi - lo)) * height;
    return [x, y] as const;
  });
  const path = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const latest = points.at(-1);
  const first = points[0];
  const change = latest && first ? latest.equity_usd - first.equity_usd : 0;
  const last = coords.at(-1);

  return (
    <section className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3 sm:p-5" aria-labelledby="net-worth-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="net-worth-title" className="text-lg font-semibold text-on-surface">
            Portfolio and net worth chart
          </h3>
          <p className="mt-1 hidden text-sm leading-6 text-outline sm:block">Paper wallet value, cash, and open trade exposure.</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-display text-2xl font-semibold tabular-nums text-on-surface">
            {wallet ? formatCurrency(wallet.equity_usd) : "Checking"}
          </p>
          <p className={cn("text-xs tabular-nums", change >= 0 ? "text-engine" : "text-critical")}>
            {isFastPreview && !wallet ? "Live details are refreshing" : `${change >= 0 ? "+" : ""}${formatCurrency(change)} recent change`}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-outline-variant/40 bg-surface-dim/50 p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Net worth line chart"
          className="h-24 w-full sm:h-44"
        >
          <defs>
            <linearGradient id="trade-net-worth-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1="0"
              x2={width}
              y1={height * fraction}
              y2={height * fraction}
              stroke="rgba(148, 163, 184, 0.16)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polygon points={`0,${height} ${path} ${width},${height}`} fill="url(#trade-net-worth-fill)" />
          <polyline
            points={path}
            fill="none"
            stroke="rgb(16 185 129)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {last ? <circle cx={last[0]} cy={last[1]} r="3.4" fill="rgb(16 185 129)" stroke="rgb(9 12 20)" strokeWidth="1.5" /> : null}
        </svg>
        <div className="mt-2 hidden justify-between text-xs tabular-nums text-outline sm:flex">
          {points.map((point, index) => (
            <span key={point.id} className={index === 0 || index === points.length - 1 ? "" : "hidden sm:inline"}>
              {point.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function MiniNetWorthStrip({
  wallet,
  isFastPreview,
}: {
  wallet: Web3TradingState["autonomous_wallet_telemetry"] | null;
  isFastPreview: boolean;
}) {
  const points = wallet && wallet.curve.length > 0 ? wallet.curve : [];
  const values = points.map((point) => point.equity_usd);
  const currentEquity = wallet?.equity_usd ?? 0;
  const min = values.length > 0 ? Math.min(...values) : currentEquity;
  const max = values.length > 0 ? Math.max(...values, 1) : Math.max(currentEquity, 1);
  const span = Math.max(max - min, max * 0.02, 1);
  const width = 180;
  const height = 38;
  const coords = (points.length > 0 ? points : [{ id: "current", equity_usd: currentEquity }]).map((point, index, all) => {
    const x = all.length <= 1 ? width : (index / (all.length - 1)) * width;
    const y = height - ((point.equity_usd - (min - span * 0.1)) / (span * 1.2)) * height;
    return [x, y] as const;
  });
  const path = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

  return (
    <div className="mt-3 rounded-md border border-outline-variant/30 bg-surface-dim/35 p-2 sm:hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-outline">Portfolio and net worth chart</p>
        <p className="text-xs font-semibold tabular-nums text-on-surface">
          {wallet ? formatCurrency(wallet.equity_usd) : isFastPreview ? "Refreshing" : "Checking"}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Compact net worth chart"
        className="mt-1 h-10 w-full"
      >
        <polyline
          points={path}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function PositionsOrdersPanel({
  state,
  titleId,
  isFastPreview,
}: {
  state: Web3TradingState | null;
  titleId: string;
  isFastPreview: boolean;
}) {
  const positions = state?.autonomous_portfolio_mark_board.items.slice(0, 4) ?? [];
  const orders = state?.autonomous_action_queue.items
    .filter((item) => item.priority === "now" || item.priority === "next" || item.status === "ready")
    .slice(0, 4) ?? [];

  return (
    <section className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3 sm:p-4" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id={titleId} className="text-lg font-semibold text-on-surface">
            Active positions and orders
          </h3>
          <p className="mt-1 hidden text-sm text-outline sm:block">What is already open, plus the next queued paper moves.</p>
        </div>
        <span className="text-xs tabular-nums text-outline">
          {positions.length} positions · {orders.length} orders
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:hidden">
        <div className="grid gap-2 min-[360px]:grid-cols-2">
          <Metric label="Positions" value={`${positions.length}`} />
          <Metric label="Orders" value={`${orders.length}`} />
        </div>
        {(orders.length > 0 ? orders.slice(0, 2) : positions.slice(0, 2)).map((item) => {
          const label = "notional_usd" in item
            ? `${item.symbol ?? "Portfolio"} · ${item.action.replaceAll("-", " ")}`
            : `${item.symbol} · ${item.action.replaceAll("-", " ")}`;
          const value = "notional_usd" in item ? item.notional_usd : item.current_value_usd;

          return (
            <div key={item.id} className="grid gap-2 rounded-md border border-outline-variant/30 bg-surface-dim/35 p-2.5 min-[360px]:grid-cols-[minmax(0,1fr)_minmax(5rem,max-content)]">
              <p className="truncate text-sm font-semibold text-on-surface">{label}</p>
              <p className="min-w-0 break-words text-sm font-semibold tabular-nums text-on-surface-variant min-[360px]:text-right">{formatCurrency(value)}</p>
            </div>
          );
        })}
        {orders.length === 0 && positions.length === 0 ? (
          <p className="text-sm text-outline">{isFastPreview ? "Refreshing active positions and orders." : "No active positions or orders."}</p>
        ) : null}
      </div>

      <div className="mt-4 hidden sm:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-outline-variant/40 text-xs uppercase tracking-telemetry text-outline">
            <tr>
              <th scope="col" className="w-[24%] py-2 pr-3 font-semibold">Asset</th>
              <th scope="col" className="w-[30%] px-3 py-2 font-semibold">Action</th>
              <th scope="col" className="w-[23%] px-3 py-2 font-semibold">Value</th>
              <th scope="col" className="w-[23%] py-2 pl-3 font-semibold">P/L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {positions.map((position) => (
              <tr key={position.id}>
                <th scope="row" className="truncate py-2.5 pr-3 font-semibold text-on-surface">{position.symbol}</th>
                <td className="truncate px-3 py-2.5 capitalize text-on-surface-variant">{position.action.replaceAll("-", " ")}</td>
                <td className="px-3 py-2.5 tabular-nums text-on-surface-variant">{formatCurrency(position.current_value_usd)}</td>
                <td className={cn("py-2.5 pl-3 tabular-nums", position.unrealized_pnl_usd >= 0 ? "text-engine" : "text-critical")}>
                  {position.unrealized_pnl_usd >= 0 ? "+" : ""}
                  {formatCurrency(position.unrealized_pnl_usd)}
                </td>
              </tr>
            ))}
            {positions.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-sm text-outline">
                  {isFastPreview ? "Refreshing active positions." : "No open positions yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 hidden space-y-2 sm:block">
        {orders.map((order) => (
          <div key={order.id} className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,max-content)] gap-3 rounded-md border border-outline-variant/30 bg-surface-dim/35 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-on-surface">
                {order.symbol ?? "Portfolio"} · {order.action.replaceAll("-", " ")}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-outline">{plainNeeds(order.reason)}</p>
            </div>
            <div className="min-w-0 break-words text-right text-xs tabular-nums">
              <p className="font-semibold text-on-surface">{formatCurrency(order.notional_usd)}</p>
              <p className={order.status === "blocked" ? "text-caution" : "text-engine"}>{plainOrderStatus(order.status)}</p>
            </div>
          </div>
        ))}
        {orders.length === 0 ? (
          <p className="rounded-md border border-outline-variant/30 bg-surface-dim/35 p-3 text-sm text-outline">
            {isFastPreview ? "Refreshing queued paper orders." : "No paper orders queued."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

type TradeNextAction = {
  title: string;
  detail: string;
  cta: string;
  href: string;
};

function buildNextAction(state: Web3TradingState): TradeNextAction {
  const walletKey =
    state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const walletNeedsSetup = !walletKey || state.wallet_holdings_adapter.status === "blocked";

  if (walletNeedsSetup) {
    return {
      title: "Connect a wallet before live trading setup.",
      detail: "Use a dedicated wallet and keep keys out of the browser. The desk stays in paper mode until setup is reviewed.",
      cta: "Set up wallet",
      href: "#wallet-setup",
    };
  }

  const directive = state.autonomous_trading_directive;
  const symbol = directive.symbol ? ` ${directive.symbol}` : "";
  const action = directive.action.replaceAll("-", " ");

  if (directive.paper_trade_ready || state.autonomous_order_ticket.can_auto_paper) {
    return {
      title: `Review the next test trade${symbol}.`,
      detail: plainNeeds(directive.summary || state.autonomous_order_ticket.summary),
      cta: "Review test trade",
      href: "#test-trade-flow",
    };
  }

  return {
    title: `${capitalize(action)}${symbol}.`,
    detail: plainNeeds(directive.next_action || state.autonomous_action_queue.next_action || "Review the trade monitor before taking the next step."),
    cta: "Open trade monitor",
    href: "#trading-monitor",
  };
}

function buildPreviewNextAction(requestedSource: "sample" | "live-dex"): TradeNextAction {
  return {
    title: "Review the next test trade when the desk finishes refreshing.",
    detail: "Master Mold can open setup, test trade, or monitor views now.",
    cta: "Review test trade",
    href: "#test-trade-flow",
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/30 bg-surface-dim/35 p-2">
      <p className="text-[11px] text-outline">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold tabular-nums text-on-surface">{value}</p>
    </div>
  );
}

function shortWallet(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function plainNeeds(value: string) {
  return value
    .replaceAll("canary", "test trade")
    .replaceAll("Canary", "Test trade")
    .replaceAll("receipt", "status")
    .replaceAll("Receipt", "Status")
    .replaceAll("packet", "status")
    .replaceAll("Packet", "Status")
    .replaceAll("blocker", "need")
    .replaceAll("Blocker", "Need")
    .replaceAll("blockers", "needs")
    .replaceAll("Blockers", "Needs")
    .replaceAll("relay", "confirmation")
    .replaceAll("Relay", "Confirmation")
    .replaceAll("proof chain", "confirmation")
    .replaceAll("Proof chain", "Confirmation");
}

function plainOrderStatus(value: string) {
  if (value === "blocked") return "Needs review";
  return value.replaceAll("-", " ");
}

function capitalize(value: string) {
  return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

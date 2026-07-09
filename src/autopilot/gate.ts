/**
 * Go-live gate (docs/roadmap/2026-07-03-autonomy-architecture.md, D6): the
 * paper → live flip is allowed only when the decision trace proves it, per
 * the Paper-Agents maturity criteria — verifiable execution, sustained
 * performance, explicit operator alignment. Pure derivation over store rows;
 * nothing here mutates state, and the gate can only ever say "not yet" until
 * a live wallet exists.
 */

import type { BotDecisionRow, BotTradeRow, EquityPointRow } from "./store";

export const GATE_WINDOW_DAYS = 5;
export const GATE_MIN_ROUND_TRIPS = 5;
export const GATE_MAX_DRAWDOWN_PCT = 10;

export type GateCheck = {
  key: "window" | "traced" | "performance" | "drawdown" | "wallet";
  label: string;
  pass: boolean;
  detail: string;
};

export type GoLiveGate = {
  ready: boolean;
  window_days: number;
  checks: GateCheck[];
};

export type GateInput = {
  trades: BotTradeRow[]; // any order
  decisions: BotDecisionRow[]; // any order
  equity_series: EquityPointRow[]; // chronological
  /** True once a spare live wallet is provisioned AND the operator has
   * acknowledged the live caps. No code path sets this yet — by design. */
  wallet_provisioned: boolean;
  now_ms: number;
  /** Persisted minute bars (oldest → newest). When present, the performance
   * check demands alpha over SOL buy-and-hold, not just an absolute gain. */
  price_history?: Array<{ ts: string; prices: Record<string, number> }>;
};

const SOL_MINT = "So11111111111111111111111111111111111111112";

/** SOL buy-and-hold return (%) across the window, from persisted minute bars.
 * Null when the history doesn't span enough of the window to be meaningful. */
export function solBenchmarkReturnPct(
  history: Array<{ ts: string; prices: Record<string, number> }>,
  windowStartMs: number,
  nowMs: number,
): number | null {
  const inWindow = history.filter((row) => {
    const ms = Date.parse(row.ts);
    return ms >= windowStartMs && ms <= nowMs && Number.isFinite(row.prices[SOL_MINT]) && row.prices[SOL_MINT] > 0;
  });
  if (inWindow.length < 2) return null;
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  // Demand real coverage: a benchmark from a sliver of the window would let a
  // lucky hour stand in for five days.
  const spanMs = Date.parse(last.ts) - Date.parse(first.ts);
  if (spanMs < (nowMs - windowStartMs) * 0.5) return null;
  return ((last.prices[SOL_MINT] - first.prices[SOL_MINT]) / first.prices[SOL_MINT]) * 100;
}

/** Every trade must have a matching trace row: same symbol, enter/exit
 * verdict matching the side, stamped within a minute of the fill. */
function tracedCount(trades: BotTradeRow[], decisions: BotDecisionRow[]): number {
  return trades.filter((trade) =>
    decisions.some(
      (decision) =>
        decision.symbol === trade.symbol &&
        decision.verdict === (trade.side === "buy" ? "enter" : "exit") &&
        Math.abs(Date.parse(decision.ts) - Date.parse(trade.ts)) < 60_000,
    ),
  ).length;
}

export function evaluateGoLiveGate(input: GateInput): GoLiveGate {
  const windowStartMs = input.now_ms - GATE_WINDOW_DAYS * 24 * 60 * 60_000;
  const trades = input.trades.filter((trade) => Date.parse(trade.ts) >= windowStartMs);
  const decisions = input.decisions.filter((decision) => Date.parse(decision.ts) >= windowStartMs);
  // The store seeds a zero-equity origin point so charts always draw; a mark
  // of $0 is that placeholder, never a real book, and must not anchor the
  // performance or drawdown reads.
  const equity = input.equity_series.filter(
    (point) => Date.parse(point.ts) >= windowStartMs && point.equity_usd > 0,
  );

  const sells = trades.filter((trade) => trade.side === "sell").length;
  const firstEquityMs = input.equity_series.length > 0 ? Date.parse(input.equity_series[0].ts) : input.now_ms;
  const historyDays = (input.now_ms - firstEquityMs) / (24 * 60 * 60_000);
  const window: GateCheck = {
    key: "window",
    label: `${GATE_WINDOW_DAYS} trading days with ≥${GATE_MIN_ROUND_TRIPS} round trips`,
    pass: historyDays >= GATE_WINDOW_DAYS && sells >= GATE_MIN_ROUND_TRIPS,
    detail: `${Math.max(0, historyDays).toFixed(1)} days of history, ${sells} round trips in the window`,
  };

  const traced = tracedCount(trades, decisions);
  const tracedCheck: GateCheck = {
    key: "traced",
    label: "every fill has a trace row (signals → intent → verdict)",
    pass: trades.length > 0 && traced === trades.length,
    detail: trades.length === 0 ? "no fills in the window yet" : `${traced}/${trades.length} fills traced`,
  };

  const startEquity = equity[0]?.equity_usd ?? null;
  const endEquity = equity.length > 0 ? equity[equity.length - 1].equity_usd : null;
  // Alpha, not beta: with persisted minute bars the bot must beat SOL
  // buy-and-hold over the window — a bot that underperforms holding SOL has no
  // business going live. Without enough history the check stays absolute.
  const solReturnPct = solBenchmarkReturnPct(input.price_history ?? [], windowStartMs, input.now_ms);
  const equityReturnPct =
    startEquity !== null && endEquity !== null && startEquity > 0
      ? ((endEquity - startEquity) / startEquity) * 100
      : null;
  const beatsBenchmark = solReturnPct === null || (equityReturnPct !== null && equityReturnPct >= solReturnPct);
  const performance: GateCheck = {
    key: "performance",
    label: "equity above the window start and ahead of SOL buy-and-hold",
    pass: startEquity !== null && endEquity !== null && endEquity > startEquity && beatsBenchmark,
    detail:
      startEquity === null || endEquity === null
        ? "no equity marks in the window yet"
        : `$${startEquity.toFixed(2)} → $${endEquity.toFixed(2)}${
            solReturnPct !== null && equityReturnPct !== null
              ? ` (${equityReturnPct >= 0 ? "+" : ""}${equityReturnPct.toFixed(1)}% vs SOL ${solReturnPct >= 0 ? "+" : ""}${solReturnPct.toFixed(1)}%)`
              : " (SOL benchmark pending price history)"
          }`,
  };

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const point of equity) {
    peak = Math.max(peak, point.equity_usd);
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - point.equity_usd) / peak) * 100);
  }
  const drawdown: GateCheck = {
    key: "drawdown",
    label: `max drawdown inside ${GATE_MAX_DRAWDOWN_PCT}%`,
    pass: equity.length > 0 && maxDrawdownPct <= GATE_MAX_DRAWDOWN_PCT,
    detail: equity.length === 0 ? "no equity marks yet" : `worst ${maxDrawdownPct.toFixed(1)}% peak-to-trough`,
  };

  const wallet: GateCheck = {
    key: "wallet",
    label: "spare live wallet provisioned and caps acknowledged",
    pass: input.wallet_provisioned,
    detail: input.wallet_provisioned
      ? "wallet provisioned"
      : "not provisioned — fund a spare wallet and acknowledge the live caps to unlock",
  };

  const checks = [window, tracedCheck, performance, drawdown, wallet];
  return { ready: checks.every((check) => check.pass), window_days: GATE_WINDOW_DAYS, checks };
}

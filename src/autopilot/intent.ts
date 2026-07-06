/**
 * Typed trade intents — the only shape in which the strategy layer may ask
 * for money to move (docs/roadmap/2026-07-03-autonomy-architecture.md, D2).
 *
 * The DX operating-layer result (docs/research/2026-07-03-autonomy-research-digest.md)
 * is that reliability comes from a typed action surface validated OUTSIDE the
 * decider: strategy (today the deterministic v2 core, later an LLM proposer)
 * emits a TradeIntent, `policy.ts` passes verdict, `executor.ts` fills. Free-form
 * actions never reach execution. Every intent — approved or rejected — lands in
 * the decision trace.
 */

import { randomUUID } from "node:crypto";

import type { BotPositionRow, DecisionSignals } from "./store";

export type TradeIntent = {
  id: string;
  ts: string;
  /** Live intents exist only when bot mode is "live" (gate-locked, ADR D6). */
  mode: "paper" | "live";
  action: "buy" | "sell";
  mint: string;
  symbol: string;
  /** Decision-time reference price (the executor may fill differently live). */
  price_usd: number;
  /** Buy: cash to spend. Sell: estimated proceeds at the reference price. */
  notional_usd: number;
  /** Sell: exact position quantity to close. Buy: derived at fill time. */
  qty: number | null;
  /** Buy only: volatility-scaled stop distance chosen at entry (percent). */
  stop_pct: number | null;
  reason: string;
  strategy: "v2-trend-pullback";
  signals: DecisionSignals;
};

/** Structural mirror of the daemon's Decision union (kept structural so the
 * daemon can import this module without a cycle). */
export type DecisionLike =
  | { action: "buy"; mint: string; symbol: string; price: number; value_usd: number; stop_pct: number; reason: string; signals: DecisionSignals }
  | { action: "sell"; mint: string; symbol: string; price: number; reason: string; signals: DecisionSignals };

/**
 * Lift a strategy decision into a typed intent. Sells resolve their quantity
 * from the open position; a sell with no matching position returns null (the
 * position was already closed — nothing to intend).
 */
export function intentFromDecision(
  decision: DecisionLike,
  positions: BotPositionRow[],
  mode: "paper" | "live" = "paper",
): TradeIntent | null {
  const base = {
    id: `int_${randomUUID()}`,
    ts: new Date().toISOString(),
    mode,
    mint: decision.mint,
    symbol: decision.symbol,
    price_usd: decision.price,
    reason: decision.reason,
    strategy: "v2-trend-pullback" as const,
    signals: decision.signals,
  };
  if (decision.action === "buy") {
    return { ...base, action: "buy", notional_usd: decision.value_usd, qty: null, stop_pct: decision.stop_pct };
  }
  const position = positions.find((row) => row.mint === decision.mint);
  if (!position || position.qty <= 0) return null;
  return {
    ...base,
    action: "sell",
    notional_usd: position.qty * decision.price,
    qty: position.qty,
    stop_pct: null,
  };
}

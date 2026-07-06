/**
 * Policy engine — the non-LLM validator every TradeIntent must pass before an
 * executor may fill it (docs/roadmap/2026-07-03-autonomy-architecture.md, D2).
 *
 * Deliberately re-checks rules the v2 strategy core already respects
 * (defense-in-depth, per the DX operating-layer paper): the strategy is the
 * decider, this module is the guard, and the two must fail independently
 * before money moves. Pure and synchronous so every rule is unit-testable
 * against a canned context. Exact numbers live HERE, never in prompts.
 */

import type { TradeIntent } from "./intent";
import type { BotPositionRow, BotStateRow } from "./store";

/** Below this a paper fill is noise: fees round to zero and the ledger fills with dust. */
export const MIN_NOTIONAL_USD = 5;

export type PolicyContext = {
  state: BotStateRow;
  positions: BotPositionRow[];
  cash_usd: number;
  /** Buys already executed this UTC day (count). */
  trades_today: number;
  /** Gross buy notional already spent this UTC day (USD). */
  spend_today_usd: number;
  /** Strategy-level daily entry cap (the daemon's MAX_TRADES_PER_DAY). */
  max_trades_per_day: number;
  fee_rate: number;
};

export type PolicyVerdict = { allowed: true } | { allowed: false; reason: string };

function reject(reason: string): PolicyVerdict {
  return { allowed: false, reason };
}

/**
 * Validate one intent against hard execution rules. First failure wins; the
 * reason string is written verbatim to the decision trace as a "blocked" row.
 */
export function validateIntent(intent: TradeIntent, context: PolicyContext): PolicyVerdict {
  const { state, positions, cash_usd } = context;

  if (state.kill_switch) return reject("kill switch is engaged");
  if (state.mode !== intent.mode) return reject(`bot mode is "${state.mode}", intent is "${intent.mode}"`);
  if (!Number.isFinite(intent.price_usd) || intent.price_usd <= 0) return reject("reference price is not a positive number");
  if (!Number.isFinite(intent.notional_usd) || intent.notional_usd <= 0) return reject("notional is not a positive number");

  if (intent.action === "buy") {
    if (positions.some((position) => position.mint === intent.mint)) {
      return reject(`already holding ${intent.symbol} — no averaging in`);
    }
    if (intent.notional_usd < MIN_NOTIONAL_USD) {
      return reject(`notional $${intent.notional_usd.toFixed(2)} under the $${MIN_NOTIONAL_USD} minimum`);
    }
    if (intent.notional_usd > state.caps.max_trade_usd) {
      return reject(`notional $${intent.notional_usd.toFixed(2)} over the $${state.caps.max_trade_usd} per-trade cap`);
    }
    const costWithFee = intent.notional_usd * (1 + context.fee_rate);
    if (costWithFee > cash_usd) {
      return reject(`costs $${costWithFee.toFixed(2)} with fees but only $${cash_usd.toFixed(2)} cash is free`);
    }
    if (positions.length >= state.caps.max_positions) {
      return reject(`already at the ${state.caps.max_positions}-position cap`);
    }
    if (context.trades_today >= context.max_trades_per_day) {
      return reject(`already at the ${context.max_trades_per_day}-entry daily cap`);
    }
    if (context.spend_today_usd + intent.notional_usd > state.caps.daily_spend_limit_usd) {
      return reject(
        `would push today's spend to $${(context.spend_today_usd + intent.notional_usd).toFixed(2)}, over the $${state.caps.daily_spend_limit_usd} daily limit`,
      );
    }
    return { allowed: true };
  }

  // Sells only ever close what the book actually holds — protective exits are
  // otherwise unrestricted (a cap must never trap the bot in a position).
  const position = positions.find((row) => row.mint === intent.mint);
  if (!position || position.qty <= 0) return reject(`no open ${intent.symbol} position to sell`);
  if (intent.qty === null || !Number.isFinite(intent.qty) || intent.qty <= 0) {
    return reject("sell intent has no positive quantity");
  }
  if (intent.qty > position.qty * 1.000001) {
    return reject(`sell quantity ${intent.qty} exceeds the held ${position.qty}`);
  }
  return { allowed: true };
}

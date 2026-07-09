/**
 * Strategy legibility (2026-07-09): the cockpit must SHOW the strategy, not
 * just its outputs. The bot looked strategyless from the UI — the rules lived
 * only in decide() and the params never rendered. This module turns the
 * current StrategyParams into plain-English rule sentences, and defines the
 * per-symbol evaluation record decide() emits every tick so the panel can say
 * exactly why each universe token is or isn't being traded right now.
 * Pure: no IO, no store access.
 */

import type { StrategyParams } from "./params";
import type { DecisionSignals } from "./store";

export const STRATEGY_NAME = "v2 trend-pullback";

export const STRATEGY_SUMMARY =
  "Buys an established uptrend during a short pullback — never into a spike — with volatility-scaled stops and a hard cost gate.";

/** One universe symbol's live verdict this tick. `status` drives the chip. */
export type SymbolEvaluation = {
  symbol: string;
  status: "warming" | "held" | "exiting" | "blocked" | "rejected" | "entering";
  reason: string;
  signals: DecisionSignals | null;
};

/** Snapshot persisted by the daemon each tick (singleton `last_evaluations`). */
export type EvaluationSnapshot = {
  ts: string;
  mode: string;
  evaluations: SymbolEvaluation[];
};

/** The entry/exit rules as human sentences, from the LIVE param values — the
 * same numbers decide() will use on its next tick, not the launch defaults. */
export function describeStrategyRules(params: StrategyParams): string[] {
  return [
    `Enter only when the 24h trend is between +${params.entry_min_h24_pct}% and +${params.entry_max_h24_pct}% (above that reads as a blow-off).`,
    `The 1h trend must be at or above ${params.entry_min_h1_pct >= 0 ? `+${params.entry_min_h1_pct}` : params.entry_min_h1_pct}% — enter with the trend, never against it.`,
    `The last ~13 minutes must sit inside the pullback band (${params.entry_pullback_min_pct}% to +${params.entry_pullback_max_pct}%): no chasing spikes, no catching breakdowns.`,
    `Only tokens with ≥$${Math.round(params.min_volume_h24_usd / 1000)}k 24h volume and ≥$${Math.round(params.min_liquidity_usd / 1000)}k pool liquidity qualify.`,
    `Stops are volatility-scaled between ${params.min_stop_pct}% and ${params.max_stop_pct}%; take profit at ${params.take_profit_r}R; a trailing stop arms after +1R.`,
    `Target profit must clear ${params.min_edge_over_cost}× the round-trip cost or the trade is refused.`,
    `Anti-churn: at most ${params.max_trades_per_day} entries/day, ${Math.round(params.cooldown_ms / 60_000)}m per-symbol cooldown after an exit, and a ${Math.round(params.loss_streak_pause_ms / 3_600_000)}h pause after ${params.loss_streak_limit} straight losses.`,
    `Exits: hard stop, ${params.take_profit_r}R take profit, armed trail, or a ${Math.round(params.time_stop_ms / 3_600_000)}h time stop once the hourly trend turns down.`,
  ];
}

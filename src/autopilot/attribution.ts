/**
 * Attribution — the learning dataset (learning-loop plan, layer 2).
 *
 * Pure joins over store rows: each realized round trip is linked to the entry
 * decision's signal snapshot, the parameter values active at entry
 * (reconstructed from the changelog), the exit reason, and the post-exit
 * counterfactual marks. The aggregates at the bottom are what the Analyst
 * (Day 2) reasons over — win rate, expectancy, and the premature-stop count
 * that decides whether stops are systematically too tight.
 */

import { paramsAtTime, type ParamChangelogEntry, type StrategyParams } from "./params";
import type { BotDecisionRow, BotTradeRow, DecisionSignals, ExitWatchRow } from "./store";

export type AttributedRoundTrip = {
  symbol: string;
  mint: string;
  entry_ts: string;
  exit_ts: string;
  entry_price_usd: number;
  exit_price_usd: number;
  /** Net of both fees. */
  net_usd: number;
  win: boolean;
  exit_reason: string;
  entry_signals: DecisionSignals | null;
  params_at_entry: StrategyParams;
  post_exit: Pick<ExitWatchRow, "mark_30m_usd" | "mark_2h_usd" | "mark_4h_usd"> | null;
  /** Loss exits whose 2h mark recovered ≥1% above the exit — a premature stop. */
  premature_stop: boolean;
};

export type AttributionSummary = {
  round_trips: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  avg_win_usd: number | null;
  avg_loss_usd: number | null;
  /** Mean net per round trip — the expectancy the gate and Analyst care about. */
  expectancy_usd: number | null;
  premature_stops: number;
  by_symbol: Array<{ symbol: string; round_trips: number; net_usd: number }>;
};

export type AttributionInput = {
  trades: BotTradeRow[]; // any order
  decisions: BotDecisionRow[]; // any order
  exit_watches: ExitWatchRow[];
  param_changelog: ParamChangelogEntry[];
  /** Only round trips whose EXIT is at/after this instant are attributed.
   * The Analyst passes the v2-era / rolling window here so it never learns
   * from the retired v1 strategy's trades as if v2 made them. */
  since_ms?: number;
};

/** Match a fill to its trace row: same symbol, matching verdict, within 60s. */
function decisionFor(trade: BotTradeRow, decisions: BotDecisionRow[], verdict: "enter" | "exit"): BotDecisionRow | null {
  const tradeMs = Date.parse(trade.ts);
  return (
    decisions.find(
      (decision) =>
        decision.symbol === trade.symbol &&
        decision.verdict === verdict &&
        Math.abs(Date.parse(decision.ts) - tradeMs) < 60_000,
    ) ?? null
  );
}

export function buildAttribution(input: AttributionInput): { trips: AttributedRoundTrip[]; summary: AttributionSummary } {
  const chronological = [...input.trades].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const openBuys = new Map<string, BotTradeRow>();
  const trips: AttributedRoundTrip[] = [];

  for (const trade of chronological) {
    if (trade.side === "buy") {
      openBuys.set(trade.mint, trade);
      continue;
    }
    const buy = openBuys.get(trade.mint);
    if (!buy) continue;
    openBuys.delete(trade.mint);
    if (input.since_ms !== undefined && Date.parse(trade.ts) < input.since_ms) continue;

    const netUsd = trade.value_usd - buy.value_usd - trade.fee_usd - buy.fee_usd;
    const watch = input.exit_watches.find((row) => row.trade_id === trade.id) ?? null;
    const prematureStop =
      watch !== null &&
      watch.was_loss &&
      watch.mark_2h_usd !== null &&
      watch.mark_2h_usd >= watch.exit_price_usd * 1.01;

    trips.push({
      symbol: trade.symbol,
      mint: trade.mint,
      entry_ts: buy.ts,
      exit_ts: trade.ts,
      entry_price_usd: buy.price_usd,
      exit_price_usd: trade.price_usd,
      net_usd: netUsd,
      win: netUsd >= 0,
      exit_reason: trade.reason,
      entry_signals: decisionFor(buy, input.decisions, "enter")?.signals ?? null,
      params_at_entry: paramsAtTime(input.param_changelog, Date.parse(buy.ts)),
      post_exit: watch ? { mark_30m_usd: watch.mark_30m_usd, mark_2h_usd: watch.mark_2h_usd, mark_4h_usd: watch.mark_4h_usd } : null,
      premature_stop: prematureStop,
    });
  }

  const wins = trips.filter((trip) => trip.win);
  const losses = trips.filter((trip) => !trip.win);
  const mean = (values: number[]): number | null =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const bySymbol = new Map<string, { round_trips: number; net_usd: number }>();
  for (const trip of trips) {
    const row = bySymbol.get(trip.symbol) ?? { round_trips: 0, net_usd: 0 };
    row.round_trips += 1;
    row.net_usd += trip.net_usd;
    bySymbol.set(trip.symbol, row);
  }

  return {
    trips,
    summary: {
      round_trips: trips.length,
      wins: wins.length,
      losses: losses.length,
      win_rate: trips.length > 0 ? wins.length / trips.length : null,
      avg_win_usd: mean(wins.map((trip) => trip.net_usd)),
      avg_loss_usd: mean(losses.map((trip) => trip.net_usd)),
      expectancy_usd: mean(trips.map((trip) => trip.net_usd)),
      premature_stops: trips.filter((trip) => trip.premature_stop).length,
      by_symbol: [...bySymbol.entries()]
        .map(([symbol, row]) => ({ symbol, ...row }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    },
  };
}

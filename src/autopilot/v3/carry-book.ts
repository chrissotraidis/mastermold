/**
 * Synthetic carry book (2026-07-09): the funding_basis module has the best
 * risk-adjusted evidence of any signal we run (delta-neutral carry on Solana
 * perps, ~8–20% APY documented), but the shadow's forward PRICE labels can't
 * measure it — carry earns the funding stream, not price movement. This book
 * tracks what a $100-per-market delta-neutral position would have earned from
 * the actual funding snapshots the daemon already fetches, so the strategy's
 * evidence becomes a visible, cumulative P&L series instead of a hope.
 *
 * Pure math over (bookState, fundingInputs, now); the daemon persists the
 * returned state each V3 cycle. Synthetic only — nothing here touches Drift.
 */

import { expectedCarryBps, MIN_FUNDING_PERSISTENCE, type FundingInput } from "./funding-basis";

/** Fixed synthetic notional per market — comparability over cleverness. */
export const CARRY_NOTIONAL_USD = 100;
/** Round-trip cost to open+close both legs, charged at open (bps). */
export const CARRY_ROUND_TRIP_BPS = 20;
/** Close after this many consecutive cycles without a fresh positive read. */
export const CARRY_STALE_CYCLES_TO_CLOSE = 6;

export type CarryPosition = {
  market: string; // e.g. "SOL-PERP"
  symbol: string;
  opened_at: string;
  notional_usd: number;
  /** Funding accrued minus the open-cost charge, USD. */
  accrued_usd: number;
  last_mark_ms: number;
  last_funding_rate_8h_pct: number;
  stale_cycles: number;
};

export type CarryBookState = {
  positions: Record<string, CarryPosition>;
  realized_usd: number;
  round_trips: number;
  /** Rolling equity marks: accrued + realized over time (capped). */
  history: Array<{ ts: string; total_usd: number }>;
};

export const EMPTY_CARRY_BOOK: CarryBookState = { positions: {}, realized_usd: 0, round_trips: 0, history: [] };

const HISTORY_CAP = 2_000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Open when funding is persistent-positive and the modeled carry clears cost. */
function shouldOpen(input: FundingInput): boolean {
  if (input.funding_rate_8h_pct === null || input.funding_rate_8h_pct <= 0) return false;
  if (input.funding_persistence_windows < MIN_FUNDING_PERSISTENCE) return false;
  const carry = expectedCarryBps(input);
  return carry !== null && carry > CARRY_ROUND_TRIP_BPS;
}

/**
 * One marking cycle: accrue funding on open positions, open new ones where
 * the module would, close on flipped funding or staleness. Returns the next
 * state plus close notes for the activity tape.
 */
export function markCarryBook(
  state: CarryBookState,
  fundingByMarket: Map<string, FundingInput>,
  nowMs: number,
): { state: CarryBookState; notes: string[] } {
  const notes: string[] = [];
  const positions: Record<string, CarryPosition> = {};
  let realized = state.realized_usd;
  let roundTrips = state.round_trips;

  // Accrue + close existing positions.
  for (const [market, position] of Object.entries(state.positions)) {
    const fresh = fundingByMarket.get(market);
    const next: CarryPosition = { ...position };

    if (fresh && fresh.funding_rate_8h_pct !== null) {
      const hours = Math.max(0, (nowMs - position.last_mark_ms) / 3_600_000);
      // Funding accrues on the rate that WAS in force since the last mark.
      next.accrued_usd = round2(
        next.accrued_usd + position.notional_usd * (position.last_funding_rate_8h_pct / 100) * (hours / 8),
      );
      next.last_mark_ms = nowMs;
      next.last_funding_rate_8h_pct = fresh.funding_rate_8h_pct;
      next.stale_cycles = 0;

      if (fresh.funding_rate_8h_pct <= 0) {
        realized = round2(realized + next.accrued_usd);
        roundTrips += 1;
        notes.push(
          `Carry shadow closed ${market}: funding flipped ${fresh.funding_rate_8h_pct.toFixed(4)}%/8h, ${next.accrued_usd >= 0 ? "+" : ""}$${next.accrued_usd.toFixed(2)} realized.`,
        );
        continue;
      }
    } else {
      next.stale_cycles += 1;
      if (next.stale_cycles >= CARRY_STALE_CYCLES_TO_CLOSE) {
        realized = round2(realized + next.accrued_usd);
        roundTrips += 1;
        notes.push(
          `Carry shadow closed ${market}: no fresh funding data for ${next.stale_cycles} cycles, ${next.accrued_usd >= 0 ? "+" : ""}$${next.accrued_usd.toFixed(2)} realized.`,
        );
        continue;
      }
    }
    positions[market] = next;
  }

  // Open where the module would and no position exists yet.
  for (const [market, input] of fundingByMarket) {
    if (positions[market] || !shouldOpen(input)) continue;
    positions[market] = {
      market,
      symbol: input.symbol,
      opened_at: new Date(nowMs).toISOString(),
      notional_usd: CARRY_NOTIONAL_USD,
      // Open cost charged up front: honest books start slightly negative.
      accrued_usd: round2(-CARRY_NOTIONAL_USD * (CARRY_ROUND_TRIP_BPS / 10_000)),
      last_mark_ms: nowMs,
      last_funding_rate_8h_pct: input.funding_rate_8h_pct ?? 0,
      stale_cycles: 0,
    };
    notes.push(
      `Carry shadow opened ${market}: funding ${input.funding_rate_8h_pct?.toFixed(4)}%/8h held ${input.funding_persistence_windows} windows ($${CARRY_NOTIONAL_USD} synthetic, delta-neutral).`,
    );
  }

  const openAccrued = Object.values(positions).reduce((sum, position) => sum + position.accrued_usd, 0);
  const history = [
    ...state.history,
    { ts: new Date(nowMs).toISOString(), total_usd: round2(realized + openAccrued) },
  ].slice(-HISTORY_CAP);

  return { state: { positions, realized_usd: realized, round_trips: roundTrips, history }, notes };
}

export type CarrySummary = {
  open_markets: number;
  open_accrued_usd: number;
  realized_usd: number;
  round_trips: number;
  total_usd: number;
  /** Annualized return on deployed synthetic notional; null before ~a day. */
  apr_pct: number | null;
};

export function summarizeCarryBook(state: CarryBookState, nowMs: number): CarrySummary {
  const open = Object.values(state.positions);
  const openAccrued = round2(open.reduce((sum, position) => sum + position.accrued_usd, 0));
  const total = round2(state.realized_usd + openAccrued);
  const firstTs = state.history[0]?.ts;
  const spanDays = firstTs ? (nowMs - Date.parse(firstTs)) / (24 * 3_600_000) : 0;
  const deployed = Math.max(CARRY_NOTIONAL_USD, open.length * CARRY_NOTIONAL_USD);
  const apr =
    spanDays >= 1 ? round2(((total / deployed) * (365 / spanDays)) * 100) : null;
  return {
    open_markets: open.length,
    open_accrued_usd: openAccrued,
    realized_usd: round2(state.realized_usd),
    round_trips: state.round_trips,
    total_usd: total,
    apr_pct: apr,
  };
}

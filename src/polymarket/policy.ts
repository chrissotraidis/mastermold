import type { PolymarketPaperPosition, PolymarketState } from "./store";

export type PolymarketEntryPolicyInput = {
  state: PolymarketState;
  positions: PolymarketPaperPosition[];
  market_id: string;
  outcome_index: number;
  stake_usd: number;
  entry_price: number;
  available_cash_usd: number;
  realized_today_usd: number;
};

export function validatePolymarketPaperEntry(input: PolymarketEntryPolicyInput): { ok: true } | { ok: false; error: string } {
  if (input.state.kill_switch || input.state.mode === "halted") return { ok: false, error: "Polymarket kill switch is engaged." };
  if (input.state.mode !== "paper") return { ok: false, error: "Arm Polymarket paper mode before opening a position." };
  if (!Number.isFinite(input.stake_usd) || input.stake_usd < 1) return { ok: false, error: "Paper stake must be at least $1." };
  if (input.stake_usd > input.state.caps.max_trade_usd) return { ok: false, error: `Paper stake exceeds the $${input.state.caps.max_trade_usd} cap.` };
  if (input.stake_usd > input.available_cash_usd) return { ok: false, error: "Paper account does not have enough available cash." };
  if (!Number.isFinite(input.entry_price) || input.entry_price <= 0 || input.entry_price >= 1) return { ok: false, error: "Market price is not usable for a paper entry." };
  if (input.realized_today_usd <= -input.state.caps.daily_loss_limit_usd) return { ok: false, error: "Daily paper loss limit has been reached." };
  if (input.positions.length >= input.state.caps.max_positions) return { ok: false, error: "Maximum open Polymarket paper positions reached." };
  if (input.positions.some((position) => position.market_id === input.market_id && position.outcome_index === input.outcome_index)) {
    return { ok: false, error: "That outcome already has an open paper position." };
  }
  return { ok: true };
}

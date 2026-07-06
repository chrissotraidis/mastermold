/**
 * Position policies: the operator's standing rules per symbol ("never sell BTC",
 * "trim NVDA above 40%", "exit this position"). They are the personal layer the
 * recommendation queue reads so review prompts reflect the operator's own plan
 * instead of generic weight heuristics. Advisory only — a breached policy produces
 * a review prompt, never an order.
 */

import { store, type PositionPolicyRow } from "./store";
import type { PortfolioHoldingJson } from "./portfolio";

export type PositionPolicyIntent = PositionPolicyRow["intent"];

export const positionPolicyIntents: PositionPolicyIntent[] = [
  "hold",
  "accumulate",
  "trim",
  "exit",
  "watch",
];

export type PositionPolicyInput = {
  symbol: string;
  intent: PositionPolicyIntent;
  max_weight_pct?: number | null;
  take_profit_pct?: number | null;
  stop_loss_pct?: number | null;
  rationale?: string;
};

export type PolicyFinding = {
  symbol: string;
  policy: PositionPolicyRow;
  kind: "max_weight_breach" | "take_profit_hit" | "stop_loss_hit" | "exit_still_held";
  classification: "Trim candidate" | "Review";
  title: string;
  detail: string;
};

export function getPositionPolicies(): PositionPolicyRow[] {
  return store().positionPolicies();
}

export function getPositionPolicy(symbol: string): PositionPolicyRow | null {
  const wanted = symbol.trim().toUpperCase();
  return store().positionPolicies().find((policy) => policy.symbol === wanted) ?? null;
}

export function savePositionPolicy(input: PositionPolicyInput):
  | { ok: true; policy: PositionPolicyRow }
  | { ok: false; error: string } {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol || symbol.length > 12) return { ok: false, error: "Use a short symbol, like NVDA or BTC." };
  if (!positionPolicyIntents.includes(input.intent)) return { ok: false, error: "Choose an intent." };

  const maxWeight = normalizePct(input.max_weight_pct, 0.1, 100);
  if (maxWeight === "invalid") return { ok: false, error: "Max weight must be between 0.1 and 100." };
  const takeProfit = normalizePct(input.take_profit_pct, 0.1, 10000);
  if (takeProfit === "invalid") return { ok: false, error: "Take profit must be a positive percent gain." };
  const stopLoss = normalizePct(input.stop_loss_pct, 0.1, 100);
  if (stopLoss === "invalid") return { ok: false, error: "Stop loss must be between 0.1 and 100." };

  const now = new Date().toISOString();
  const existing = getPositionPolicy(symbol);
  const policy: PositionPolicyRow = {
    symbol,
    intent: input.intent,
    max_weight_pct: maxWeight,
    take_profit_pct: takeProfit,
    stop_loss_pct: stopLoss,
    rationale: (input.rationale ?? "").trim().slice(0, 500),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  store().upsertPositionPolicy(policy);
  return { ok: true, policy };
}

export function removePositionPolicy(symbol: string): boolean {
  const wanted = symbol.trim().toUpperCase();
  if (!getPositionPolicy(wanted)) return false;
  store().deletePositionPolicy(wanted);
  return true;
}

/**
 * Compare each saved policy to the visible portfolio. Pure read: findings are
 * recomputed per request from current holdings, never persisted.
 */
export function evaluatePositionPolicies(holdings: PortfolioHoldingJson[]): PolicyFinding[] {
  const bySymbol = new Map(holdings.map((holding) => [holding.symbol.toUpperCase(), holding]));
  const findings: PolicyFinding[] = [];

  for (const policy of getPositionPolicies()) {
    const holding = bySymbol.get(policy.symbol);
    if (!holding) continue;

    if (policy.intent === "exit") {
      findings.push({
        symbol: policy.symbol,
        policy,
        kind: "exit_still_held",
        classification: "Review",
        title: `Your plan says exit ${policy.symbol}`,
        detail: `${policy.symbol} is marked exit in your position policy but is still ${holding.weight_pct.toFixed(1)}% of the visible portfolio.${rationaleSuffix(policy)}`,
      });
      continue;
    }

    if (policy.max_weight_pct !== null && holding.weight_pct > policy.max_weight_pct) {
      findings.push({
        symbol: policy.symbol,
        policy,
        kind: "max_weight_breach",
        classification: "Trim candidate",
        title: `${policy.symbol} is over your ${policy.max_weight_pct.toFixed(0)}% cap`,
        detail: `${policy.symbol} is ${holding.weight_pct.toFixed(1)}% of the visible portfolio, above the ${policy.max_weight_pct.toFixed(1)}% cap in your position policy.${rationaleSuffix(policy)}`,
      });
    }

    const gainPct = gainSinceCost(holding);
    if (gainPct !== null && policy.take_profit_pct !== null && gainPct >= policy.take_profit_pct) {
      findings.push({
        symbol: policy.symbol,
        policy,
        kind: "take_profit_hit",
        classification: "Trim candidate",
        title: `${policy.symbol} passed your +${policy.take_profit_pct.toFixed(0)}% target`,
        detail: `${policy.symbol} is up ${gainPct.toFixed(1)}% versus recorded cost, past the +${policy.take_profit_pct.toFixed(1)}% take-profit level in your position policy.${rationaleSuffix(policy)}`,
      });
    }
    if (gainPct !== null && policy.stop_loss_pct !== null && gainPct <= -policy.stop_loss_pct) {
      findings.push({
        symbol: policy.symbol,
        policy,
        kind: "stop_loss_hit",
        classification: "Review",
        title: `${policy.symbol} fell past your -${policy.stop_loss_pct.toFixed(0)}% line`,
        detail: `${policy.symbol} is down ${Math.abs(gainPct).toFixed(1)}% versus recorded cost, past the -${policy.stop_loss_pct.toFixed(1)}% review line in your position policy.${rationaleSuffix(policy)}`,
      });
    }
  }

  return findings;
}

function gainSinceCost(holding: PortfolioHoldingJson): number | null {
  if (!Number.isFinite(holding.cost_basis) || holding.cost_basis <= 0) return null;
  return ((holding.market_value - holding.cost_basis) / holding.cost_basis) * 100;
}

function rationaleSuffix(policy: PositionPolicyRow) {
  return policy.rationale ? ` Your note: ${policy.rationale}` : "";
}

function normalizePct(
  value: number | null | undefined,
  min: number,
  max: number,
): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value)) return "invalid";
  if (value < min || value > max) return "invalid";
  return value;
}

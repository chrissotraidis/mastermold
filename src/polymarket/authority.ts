import type { PolymarketBrainReport } from "./brain";
import type { PolymarketStrategyId } from "./strategies";

export type PolymarketEntryTier = "promoted" | "exploration";

export type PolymarketPaperAuthority = {
  available: boolean;
  tier: PolymarketEntryTier | null;
  strategy_id: PolymarketStrategyId | null;
  /** Strategies allowed to open new paper entries under this authority. */
  entry_strategies: PolymarketStrategyId[];
  detail: string;
};

/** Only strategies whose hypothesis is testable with a taker buy at the ask
 * may open simulator positions. Maker and structural hypotheses (maker_spread,
 * binary_parity) would be falsified by a taker fill model, so they stay shadow. */
export const POLYMARKET_EXPLORATION_STRATEGIES: PolymarketStrategyId[] = ["momentum", "book_pressure"];
export const POLYMARKET_EXPLORATION_STAKE_USD = 5;
export const POLYMARKET_EXPLORATION_MAX_OPEN_PER_STRATEGY = 2;

export function polymarketExplorationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.POLYMARKET_EXPLORATION === "1";
}

/** Shadow evidence remains the sole source of *promoted* paper-entry authority.
 * Exploration is a bounded operator opt-in: small tagged entries so the ledger
 * accumulates realized outcomes while promotion evidence builds. It never
 * touches live execution, which stays locked. */
export function evaluatePolymarketPaperAuthority(
  report: PolymarketBrainReport,
  env: Record<string, string | undefined> = process.env,
): PolymarketPaperAuthority {
  const promoted = report.strategies.find((strategy) => strategy.paper_candidate);
  if (promoted) {
    return {
      available: true,
      tier: "promoted",
      strategy_id: promoted.strategy_id,
      entry_strategies: [promoted.strategy_id],
      detail: `${strategyName(promoted.strategy_id)} clears the shadow promotion gate; operator arming is still required.`,
    };
  }

  if (polymarketExplorationEnabled(env)) {
    return {
      available: true,
      tier: "exploration",
      strategy_id: null,
      entry_strategies: POLYMARKET_EXPLORATION_STRATEGIES,
      detail: `Exploration mode: $${POLYMARKET_EXPLORATION_STAKE_USD} tagged paper entries for ${POLYMARKET_EXPLORATION_STRATEGIES.map(strategyName).join(" and ")} while promotion evidence accumulates. No strategy has cleared the gate yet.`,
    };
  }

  // The analyst lane opens its own forecast-driven entries outside the brain
  // candidate path, so paper mode stays armable while every price-signal
  // strategy remains shadow-only (entry_strategies stays empty).
  if (env.POLYMARKET_ANALYST === "1") {
    return {
      available: true,
      tier: "exploration",
      strategy_id: null,
      entry_strategies: [],
      detail: "Analyst lane active: LLM forecast-driven paper entries only; all price-signal strategies remain shadow-only after the 2026-08 falsification.",
    };
  }

  const momentum = report.strategies.find((strategy) => strategy.strategy_id === "momentum");
  return {
    available: false,
    tier: null,
    strategy_id: null,
    entry_strategies: [],
    detail: momentum
      ? `Momentum remains shadow-only: ${momentum.promotion_detail}`
      : "All strategies remain shadow-only until a forward-label promotion gate is measured and passed.",
  };
}

export function strategyName(value: PolymarketStrategyId): string {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

import type { PolymarketBrainReport } from "./brain";

export type PolymarketPaperAuthority = {
  available: boolean;
  strategy_id: "momentum";
  detail: string;
};

/** Shadow evidence is the sole source of paper-entry authority. A strategy
 * may be observed indefinitely without being allowed to open positions. */
export function evaluatePolymarketPaperAuthority(report: PolymarketBrainReport): PolymarketPaperAuthority {
  const metric = report.strategies.find((strategy) => strategy.strategy_id === "momentum");
  if (metric?.paper_candidate) {
    return {
      available: true,
      strategy_id: "momentum",
      detail: "Momentum clears the shadow promotion gate; operator arming is still required.",
    };
  }
  return {
    available: false,
    strategy_id: "momentum",
    detail: metric
      ? `Momentum remains shadow-only: ${metric.promotion_detail}`
      : "Momentum remains shadow-only until its forward-label promotion gate is measured and passed.",
  };
}

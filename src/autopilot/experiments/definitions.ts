import type { ExperimentDefinition } from "./types";
import { DEFAULT_STRATEGY_PARAMS } from "../params";

const shared = {
  starting_cash_usd: 1_000,
  max_entry_usd: 25,
  max_positions: 3,
  daily_spend_limit_usd: 100,
  daily_loss_limit_usd: 25,
  drawdown_halt_pct: 10,
  paper_only: true as const,
};

export const EXPERIMENT_DEFINITIONS: ExperimentDefinition[] = [
  { ...shared, id: "v2-control", name: "V2 control", source: "v2", treatment: "control", strategy_version: "v2-trend-pullback-2026-07", v2_params: { ...DEFAULT_STRATEGY_PARAMS } },
  { ...shared, id: "v2-bp-veto", name: "V2 + Bar Portion veto", source: "v2", treatment: "bar_portion_veto", strategy_version: "v2-trend-pullback-2026-07", v2_params: { ...DEFAULT_STRATEGY_PARAMS } },
  { ...shared, id: "cusum-tb", name: "CUSUM + triple barrier", source: "cusum_tb", treatment: "strategy_candidate", strategy_version: "strategy-pack-v3-2026-07" },
  { ...shared, id: "xsec", name: "Cross-sectional momentum", source: "xsec", treatment: "strategy_candidate", strategy_version: "strategy-pack-v3-2026-07" },
  { ...shared, id: "trending", name: "Trending tokens", source: "trending", treatment: "strategy_candidate", strategy_version: "strategy-pack-v3-2026-07" },
];

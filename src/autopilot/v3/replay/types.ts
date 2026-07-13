import type { ExecutionCost } from "../signal";

export type ReplayBar = {
  ts_ms: number;
  o: number;
  h: number;
  l: number;
  c: number;
  volume: number;
};

export type ReplaySeries = {
  symbol: string;
  source: "coinbase" | "kraken" | "geckoterminal" | "parquet" | "fixture";
  granularity_sec: number;
  bars: ReplayBar[];
};

export type ReplayDataset = {
  version: 1;
  fetched_at: string;
  series: ReplaySeries[];
};

export type ReplayModule = "cusum_tb" | "bar_portion" | "v2";

export type ReplayConfig = {
  module: ReplayModule;
  cost: ExecutionCost;
  liquidity_usd: number;
  cusum_edge_ratio: number;
  bar_portion_edge_ratio: number;
  bp_overlay: boolean;
};

export type ReplayTrade = {
  strategy_id: ReplayModule;
  symbol: string;
  signal_ts_ms: number;
  entry_ts_ms: number;
  exit_ts_ms: number;
  entry_price: number;
  exit_price: number;
  gross_bps: number;
  net_bps: number;
  outcome: "win" | "loss";
  exit_reason: "take_profit" | "stop" | "stop_same_bar_tie" | "horizon" | "signal_exit" | "end_of_data";
  cost_bps: number;
};

export type ReplayMetrics = {
  trades: number;
  hit_rate: number | null;
  mean_net_bps: number | null;
  sharpe_daily: number | null;
  max_drawdown_bps: number;
  exposure_pct: number;
  events_per_day: number;
  positive_walk_forward_quarters: number;
};

export type QuarterMetric = {
  quarter: string;
  trades: number;
  mean_net_bps: number | null;
  positive: boolean;
};

export type ReplayResult = {
  version: 1;
  module: ReplayModule;
  config_hash: string;
  config: ReplayConfig;
  data: Array<{ symbol: string; source: ReplaySeries["source"]; granularity_sec: number; from_ms: number; to_ms: number; bars: number }>;
  symbol_metrics: Array<{ symbol: string; exposure_pct: number; events_per_day: number }>;
  trades: ReplayTrade[];
  metrics: ReplayMetrics;
  quarters: QuarterMetric[];
  deterministic_tie_policy: "stop_wins";
  parameter_schedule?: Array<{ effective_from_ms: number; trained_through_ms: number; params: Record<string, number> }>;
};

export type ReplayPromotionEvidence = {
  config_hash: string;
  report_path: string;
  data_months: number;
  positive_walk_forward_quarters: number;
  doubled_cost_positive: boolean;
  base_mean_net_bps: number | null;
  ts: string;
};

export const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  module: "cusum_tb",
  cost: {
    dex_fee_bps: 25,
    price_impact_bps: 20,
    spread_bps: 5,
    slippage_bps: 20,
    priority_fee_bps: 3,
    failed_tx_bps: 4,
    total_bps: 77,
  },
  liquidity_usd: 100_000_000,
  cusum_edge_ratio: 0.15,
  bar_portion_edge_ratio: 0.25,
  bp_overlay: true,
};

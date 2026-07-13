import type { CandidateSignal, StrategyId } from "../v3/signal";
import type { StrategyParams } from "../params";

export type ExperimentId = "v2-control" | "v2-bp-veto" | "cusum-tb" | "xsec" | "trending";

export type ExperimentDefinition = {
  id: ExperimentId;
  name: string;
  source: "v2" | StrategyId;
  treatment: "control" | "bar_portion_veto" | "strategy_candidate";
  strategy_version: string;
  v2_params?: StrategyParams;
  starting_cash_usd: number;
  max_entry_usd: number;
  max_positions: number;
  daily_spend_limit_usd: number;
  daily_loss_limit_usd: number;
  drawdown_halt_pct: number;
  paper_only: true;
};

export type ExperimentRun = {
  id: string;
  experiment_id: ExperimentId;
  name: string;
  source: ExperimentDefinition["source"];
  treatment: ExperimentDefinition["treatment"];
  config_hash: string;
  config: ExperimentDefinition;
  started_at: string;
  paused: boolean;
};

export type ExperimentPosition = {
  run_id: string;
  mint: string;
  symbol: string;
  qty: number;
  entry_price_usd: number;
  entry_value_usd: number;
  entry_fee_usd: number;
  stop_pct: number;
  tp_pct: number;
  peak_usd: number;
  opened_at: string;
  deadline_ts: string;
  strategy_id: string;
};

export type ExperimentTrade = {
  id: number;
  run_id: string;
  ts: string;
  side: "buy" | "sell";
  mint: string;
  symbol: string;
  qty: number;
  price_usd: number;
  value_usd: number;
  fee_usd: number;
  realized_pnl_usd: number | null;
  reason: string;
  strategy_id: string;
};

export type ExperimentOrder = {
  action: "buy" | "sell";
  mint: string;
  symbol: string;
  price: number;
  value_usd?: number;
  stop_pct?: number;
  tp_pct?: number;
  deadline_ts?: string;
  reason: string;
  strategy_id: string;
};

export type ExperimentAccountView = {
  run: ExperimentRun;
  cash_usd: number;
  equity_usd: number;
  positions: ExperimentPosition[];
  trades: ExperimentTrade[];
  trades_today: number;
  spend_today_usd: number;
  cooldown_until_ms: Map<string, number>;
  loss_streak: number;
  last_loss_ms: number | null;
  last_entry_ms: number | null;
};

export type ExperimentSummary = {
  experiment_id: ExperimentId;
  run_id: string;
  name: string;
  source: string;
  treatment: string;
  started_at: string;
  paused: boolean;
  paper_only: true;
  starting_cash_usd: number;
  cash_usd: number;
  equity_usd: number;
  net_pnl_usd: number;
  net_bps: number;
  open_positions: number;
  round_trips: number;
  wins: number;
  win_rate_pct: number | null;
  expectancy_usd: number | null;
  profit_factor: number | null;
  max_drawdown_pct: number;
  fees_usd: number;
  turnover_usd: number;
  confidence: "provisional" | "directional" | "stronger";
  last_trade_at: string | null;
  config_hash: string;
};

export type ExperimentTickInput = {
  now_ms: number;
  prices: Map<string, number>;
  candidates: CandidateSignal[];
  one_way_cost_bps_by_mint: Map<string, number>;
  last_closed_bp_by_mint: Map<string, number | null>;
  v2_orders: (account: ExperimentAccountView) => ExperimentOrder[];
};

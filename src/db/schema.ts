export type BitemporalFields = {
  event_time: string;
  knowledge_time: string;
};

export type User = {
  id: string;
  email: string;
  display_name: string;
  role: "reviewer" | "operator";
  created_at: string;
};

export type Account = BitemporalFields & {
  id: string;
  kind: "coinbase" | "robinhood" | "onchain_wallet";
  label: string;
  integration_status: "connected" | "stubbed" | "credential_gated";
  scope: "read_only";
};

export type Asset = BitemporalFields & {
  id: string;
  symbol: string;
  name: string;
  asset_class: "equity" | "crypto" | "defi";
  venue: string;
};

export type Holding = BitemporalFields & {
  id: string;
  account_id: string;
  asset_id: string;
  quantity: number;
  cost_basis: number;
  market_value: number;
  as_of: string;
  weight: number;
};

export type PriceBar = {
  id: string;
  asset_id: string;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  knowledge_time: string;
};

export type NewsItem = BitemporalFields & {
  id: string;
  asset_id: string | null;
  headline: string;
  source: string;
  url: string;
  sentiment: "positive" | "neutral" | "negative" | null;
};

export type FundingObservation = {
  id: string;
  asset_id: string;
  period_ts: string;
  funding_rate: number;
  open_interest: number;
  knowledge_time: string;
};

export type BriefingCard = BitemporalFields & {
  id: string;
  date: string;
  rank: number;
  headline: string;
  why_now: string;
  relevance_note: string;
  bull_case: string;
  bear_case: string;
  conviction: number;
  horizon: string;
  status: "actionable" | "nothing_actionable";
  asset_ids: string[];
};

export type Driver = BitemporalFields & {
  id: string;
  briefing_card_id: string;
  label: string;
  direction: "bullish" | "bearish";
  weight: number;
  color: string;
  source_citation: string;
};

export type Alert = BitemporalFields & {
  id: string;
  asset_id: string;
  tier: "T0" | "T1" | "T2";
  z_score: number;
  message: string;
  rationale: string;
  created_at: string;
  acknowledged: boolean;
  useful_feedback: boolean | null;
  // Which screener signal triggered this alert (engine alerts only). Feeds the
  // alert-feedback -> screener-threshold tuning loop. Absent on seeded alerts.
  signal?: "return_z" | "volume_z" | "news_count_z" | string;
};

export type DecisionJournalEntry = BitemporalFields & {
  id: string;
  briefing_card_id: string | null;
  thesis: string;
  signals: string[];
  conviction: number;
  horizon: string;
  falsification_condition: string;
  logged_at: string;
};

export type OutcomeScore = BitemporalFields & {
  id: string;
  journal_entry_id: string;
  resolved_at: string;
  pnl_note: string;
  thesis_played_out: boolean;
  process_score: number;
  outcome_score: number;
};

export type PaperTradingRound = BitemporalFields & {
  id: string;
  week_label: string;
  opens_at: string;
  closes_at: string;
  status: "open" | "closed" | "scoring";
};

export type PaperPrediction = BitemporalFields & {
  id: string;
  round_id: string;
  asset_id: string;
  direction: "long" | "short" | "flat";
  fake_size_usd?: number;
  conviction: number;
  rationale: string;
  submitted_at: string;
};

export type RoundScore = BitemporalFields & {
  id: string;
  round_id: string;
  calibration: number;
  patience: number;
  diversification: number;
  total: number;
};

export type ExecutorStrategy = BitemporalFields & {
  id: string;
  name: "stablecoin_lending" | "delta_neutral_funding_carry";
  status: "paused" | "safe_mode" | "running_demo";
  venue: string;
  net_delta: number;
  margin_ratio: number;
  funding_rate: number;
  basis: number;
};

export type GuardrailConfig = BitemporalFields & {
  id: string;
  per_tx_cap: number;
  daily_cap: number;
  contract_allowlist: string[];
  recipient_allowlist: string[];
  session_key_expiry: string;
};

export type IntegrationStatus = BitemporalFields & {
  id: string;
  service: "coinbase" | "robinhood" | "onchain_wallet" | "llm";
  status: "connected" | "stubbed" | "credential_gated";
  detail: string;
};

export type StrategyBelief = BitemporalFields & {
  id: string;
  name: string;
  statement: string;
  confidence: number;
  updated_at: string;
};

export type ReflectionUpdate = BitemporalFields & {
  id: string;
  strategy_belief_id: string;
  evidence_summary: string;
  significance_passed: boolean;
  applied: boolean;
  created_at: string;
};

export type BrainRun = BitemporalFields & {
  id: string;
  run_date: string;
  status: "complete" | "failed";
  started_at: string;
  completed_at: string;
  scope: "local_seed" | "portfolio_snapshot" | "live_scan";
  source_count: number;
  symbols: string[];
  inference_model: string;
  summary: string;
};

export type MarketMemoryFact = BitemporalFields & {
  id: string;
  symbol: string | null;
  topic: "portfolio" | "news" | "funding" | "risk" | "market";
  summary: string;
  confidence: number;
  source_count: number;
  evidence_urls: string[];
  created_at: string;
  updated_at: string;
};

export type DemoDatabase = {
  users: User[];
  accounts: Account[];
  assets: Asset[];
  holdings: Holding[];
  priceBars: PriceBar[];
  newsItems: NewsItem[];
  fundingObservations: FundingObservation[];
  briefingCards: BriefingCard[];
  drivers: Driver[];
  alerts: Alert[];
  decisionJournalEntries: DecisionJournalEntry[];
  outcomeScores: OutcomeScore[];
  paperTradingRounds: PaperTradingRound[];
  paperPredictions: PaperPrediction[];
  roundScores: RoundScore[];
  executorStrategies: ExecutorStrategy[];
  guardrailConfigs: GuardrailConfig[];
  integrationStatuses: IntegrationStatus[];
  strategyBeliefs: StrategyBelief[];
  reflectionUpdates: ReflectionUpdate[];
  brainRuns?: BrainRun[];
  marketMemoryFacts?: MarketMemoryFact[];
};

export const entitySchemas = {
  User: ["id", "email", "display_name", "role", "created_at"],
  Account: ["id", "kind", "label", "integration_status", "scope", "event_time", "knowledge_time"],
  Asset: ["id", "symbol", "name", "asset_class", "venue", "event_time", "knowledge_time"],
  Holding: ["id", "account_id", "asset_id", "quantity", "cost_basis", "market_value", "as_of", "weight", "event_time", "knowledge_time"],
  PriceBar: ["id", "asset_id", "ts", "open", "high", "low", "close", "volume", "knowledge_time"],
  NewsItem: ["id", "asset_id", "headline", "source", "url", "sentiment", "event_time", "knowledge_time"],
  FundingObservation: ["id", "asset_id", "period_ts", "funding_rate", "open_interest", "knowledge_time"],
  BriefingCard: ["id", "date", "rank", "headline", "why_now", "relevance_note", "bull_case", "bear_case", "conviction", "horizon", "status", "asset_ids", "event_time", "knowledge_time"],
  Driver: ["id", "briefing_card_id", "label", "direction", "weight", "color", "source_citation", "event_time", "knowledge_time"],
  Alert: ["id", "asset_id", "tier", "z_score", "message", "rationale", "created_at", "acknowledged", "useful_feedback", "event_time", "knowledge_time"],
  DecisionJournalEntry: ["id", "briefing_card_id", "thesis", "signals", "conviction", "horizon", "falsification_condition", "logged_at", "event_time", "knowledge_time"],
  OutcomeScore: ["id", "journal_entry_id", "resolved_at", "pnl_note", "thesis_played_out", "process_score", "outcome_score", "event_time", "knowledge_time"],
  PaperTradingRound: ["id", "week_label", "opens_at", "closes_at", "status", "event_time", "knowledge_time"],
  PaperPrediction: ["id", "round_id", "asset_id", "direction", "conviction", "rationale", "submitted_at", "event_time", "knowledge_time"],
  RoundScore: ["id", "round_id", "calibration", "patience", "diversification", "total", "event_time", "knowledge_time"],
  ExecutorStrategy: ["id", "name", "status", "venue", "net_delta", "margin_ratio", "funding_rate", "basis", "event_time", "knowledge_time"],
  GuardrailConfig: ["id", "per_tx_cap", "daily_cap", "contract_allowlist", "recipient_allowlist", "session_key_expiry", "event_time", "knowledge_time"],
  IntegrationStatus: ["id", "service", "status", "detail", "event_time", "knowledge_time"],
  StrategyBelief: ["id", "name", "statement", "confidence", "updated_at", "event_time", "knowledge_time"],
  ReflectionUpdate: ["id", "strategy_belief_id", "evidence_summary", "significance_passed", "applied", "created_at", "event_time", "knowledge_time"],
  BrainRun: ["id", "run_date", "status", "started_at", "completed_at", "scope", "source_count", "symbols", "inference_model", "summary", "event_time", "knowledge_time"],
  MarketMemoryFact: ["id", "symbol", "topic", "summary", "confidence", "source_count", "evidence_urls", "created_at", "updated_at", "event_time", "knowledge_time"],
} as const;

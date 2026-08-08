export type PolymarketStrategyAuthority = "paper" | "shadow" | "observe" | "missing" | "unsupported";

export type PolymarketStrategyCapability = {
  id: string;
  name: string;
  authority: PolymarketStrategyAuthority;
  reference_intent: string;
  master_mold_reality: string;
};

export const POLYMARKET_PAPER_CONTRACT = {
  strategy_id: "momentum",
  authority: "promotion-gated-paper" as const,
  cadence_minutes: 5,
  max_new_positions_per_cycle: 1,
  default_stake_usd: 5,
  filters: [
    "Active binary market with an enabled order book",
    "No negative-risk event mechanics",
    "No market fee schedule",
    "At least $25,000 displayed liquidity and $10,000 24-hour volume",
    "At least six hours before the market's stated end time",
    "Absolute 24-hour YES move of at least 3%",
    "Selected outcome between 8c and 92c",
  ],
  entry: "Buy the outcome in the direction of the 24-hour YES move using the full displayed CLOB ask depth needed for the paper stake.",
  exits: ["5% executable return take-profit", "3% executable return stop-loss", "4-hour maximum hold", "resolved-market settlement at $1 or $0"],
  fill_model: "Snapshot depth walk only; it does not consume the public book or model latency, queueing, hidden liquidity, or future price movement.",
  live_authority: false,
} as const;

export const POLYMARKET_STRATEGY_CATALOG: readonly PolymarketStrategyCapability[] = [
  {
    id: "analyst",
    name: "LLM probability analyst",
    authority: "paper",
    reference_intent: "Research-backed lane (Halawi et al. 2024; market-prior conditioning): an LLM prices resolution criteria independently and bets only on large divergence.",
    master_mold_reality: "Prices up to 5 filtered binary markets every few hours, journals every forecast for Brier grading against resolution, and opens $5 hold-to-resolution paper entries only when model-vs-ask edge is at least 10 points at medium+ confidence.",
  },
  {
    id: "momentum",
    name: "24-hour momentum",
    authority: "shadow",
    reference_intent: "Not a named PolySniper strategy; added natively as a small baseline paper loop.",
    master_mold_reality: "A retired paper baseline that remains in shadow research. New entries stay blocked unless its forward-label promotion gate passes.",
  },
  {
    id: "book_pressure",
    name: "Order-book pressure",
    authority: "shadow",
    reference_intent: "PolySniper consumed live CLOB prices but did not catalog this as a separate strategy.",
    master_mold_reality: "Records resting-depth imbalance and later executable markouts. It cannot place paper or live trades.",
  },
  {
    id: "binary_parity",
    name: "Binary YES/NO parity",
    authority: "shadow",
    reference_intent: "A narrower cousin of PolySniper's multi-market logic arbitrage.",
    master_mold_reality: "Observes one binary market's combined displayed asks. Atomicity, fees, partial fills, and settlement remain unmodeled.",
  },
  {
    id: "maker_spread",
    name: "Displayed maker spread",
    authority: "shadow",
    reference_intent: "PolySniper listed market making as planned, not implemented.",
    master_mold_reality: "Measures displayed spreads only. Queue position, fills, adverse selection, rebates, and inventory are not modeled.",
  },
  {
    id: "weather",
    name: "Daily temperature weather",
    authority: "observe",
    reference_intent: "PolySniper intended ensemble forecasts, station observations, forecast-change triggers, bot defense, and position management.",
    master_mold_reality: "Discovers official daily-temperature events and computes raw station-matched ECMWF ensemble bucket probabilities for shadow inspection only. It does not bet them.",
  },
  {
    id: "correlation",
    name: "Correlation divergence",
    authority: "missing",
    reference_intent: "Trade a lagging market after a linked leader reprices.",
    master_mold_reality: "No linked-pair discovery, lag estimator, divergence trigger, or paper execution exists.",
  },
  {
    id: "cross_market_arbitrage",
    name: "Cross-market logic arbitrage",
    authority: "missing",
    reference_intent: "Trade linked date-stacked, mutually exclusive, or exhaustive market clusters.",
    master_mold_reality: "No event-level cluster model or atomic multi-leg execution exists. Binary parity is not equivalent.",
  },
  {
    id: "copy_trading",
    name: "Wallet copy trading",
    authority: "missing",
    reference_intent: "Poll followed wallets, detect position changes, and mirror entries and exits.",
    master_mold_reality: "No wallet tracking or copying exists. Public positions alone do not establish persistent, transferable skill.",
  },
  {
    id: "theta_decay",
    name: "Counting-market theta",
    authority: "missing",
    reference_intent: "PolySniper roadmap strategy.",
    master_mold_reality: "Not implemented.",
  },
  {
    id: "economic_events",
    name: "Economic event trading",
    authority: "missing",
    reference_intent: "PolySniper roadmap strategy using consensus and official releases.",
    master_mold_reality: "Not implemented.",
  },
  {
    id: "sports_latency",
    name: "Sports latency",
    authority: "unsupported",
    reference_intent: "PolySniper explicitly called this infeasible without costly low-latency data.",
    master_mold_reality: "Not supported.",
  },
] as const;

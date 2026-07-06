import type { DemoDatabase } from "./schema";

const eventDay = "2026-05-29";

export const demoDatabase: DemoDatabase = {
  users: [
    {
      id: "user_reviewer",
      email: "reviewer@example.test",
      display_name: "Demo Reviewer",
      role: "reviewer",
      created_at: "2026-05-01T09:00:00Z",
    },
    {
      id: "user_operator",
      email: "operator@example.test",
      display_name: "Demo Operator",
      role: "operator",
      created_at: "2026-05-01T09:05:00Z",
    },
  ],
  accounts: [
    {
      id: "acct_coinbase",
      kind: "coinbase",
      label: "Coinbase view-only demo",
      integration_status: "stubbed",
      scope: "read_only",
      event_time: "2026-05-24T14:00:00Z",
      knowledge_time: "2026-05-24T14:03:00Z",
    },
    {
      id: "acct_robinhood",
      kind: "robinhood",
      label: "Robinhood SnapTrade demo",
      integration_status: "stubbed",
      scope: "read_only",
      event_time: "2026-05-25T13:30:00Z",
      knowledge_time: "2026-05-25T13:41:00Z",
    },
    {
      id: "acct_wallet",
      kind: "onchain_wallet",
      label: "onchain_wallet Zerion demo",
      integration_status: "stubbed",
      scope: "read_only",
      event_time: "2026-05-26T16:20:00Z",
      knowledge_time: "2026-05-26T16:25:00Z",
    },
  ],
  assets: [
    { id: "asset_nvda", symbol: "NVDA", name: "NVIDIA", asset_class: "equity", venue: "NASDAQ", event_time: "2026-05-20T13:30:00Z", knowledge_time: "2026-05-20T13:31:00Z" },
    { id: "asset_hood", symbol: "HOOD", name: "Robinhood Markets", asset_class: "equity", venue: "NASDAQ", event_time: "2026-05-20T13:30:00Z", knowledge_time: "2026-05-20T13:31:00Z" },
    { id: "asset_btc", symbol: "BTC", name: "Bitcoin", asset_class: "crypto", venue: "Coinbase", event_time: "2026-05-20T00:00:00Z", knowledge_time: "2026-05-20T00:02:00Z" },
    { id: "asset_eth", symbol: "ETH", name: "Ethereum", asset_class: "crypto", venue: "Coinbase", event_time: "2026-05-20T00:00:00Z", knowledge_time: "2026-05-20T00:02:00Z" },
    { id: "asset_usdc_aave", symbol: "aUSDC", name: "Aave USDC Supply", asset_class: "defi", venue: "Base", event_time: "2026-05-20T00:00:00Z", knowledge_time: "2026-05-20T00:04:00Z" },
  ],
  holdings: [
    { id: "hold_nvda", account_id: "acct_robinhood", asset_id: "asset_nvda", quantity: 18, cost_basis: 15320, market_value: 18144, as_of: "2026-05-29T20:00:00Z", weight: 0.27, event_time: "2026-05-29T20:00:00Z", knowledge_time: "2026-05-29T20:02:00Z" },
    { id: "hold_hood", account_id: "acct_robinhood", asset_id: "asset_hood", quantity: 220, cost_basis: 11880, market_value: 13640, as_of: "2026-05-29T20:00:00Z", weight: 0.2, event_time: "2026-05-29T20:00:00Z", knowledge_time: "2026-05-29T20:02:00Z" },
    { id: "hold_btc", account_id: "acct_coinbase", asset_id: "asset_btc", quantity: 0.31, cost_basis: 28740, market_value: 32915, as_of: "2026-05-30T00:10:00Z", weight: 0.49, event_time: "2026-05-30T00:10:00Z", knowledge_time: "2026-05-30T00:12:00Z" },
    { id: "hold_usdc", account_id: "acct_wallet", asset_id: "asset_usdc_aave", quantity: 2500, cost_basis: 2500, market_value: 2507, as_of: "2026-05-30T00:20:00Z", weight: 0.04, event_time: "2026-05-30T00:20:00Z", knowledge_time: "2026-05-30T00:27:00Z" },
  ],
  priceBars: [
    { id: "bar_btc_1", asset_id: "asset_btc", ts: "2026-05-28T00:00:00Z", open: 103200, high: 106100, low: 102440, close: 105850, volume: 38210, knowledge_time: "2026-05-28T00:03:00Z" },
    { id: "bar_btc_2", asset_id: "asset_btc", ts: "2026-05-29T00:00:00Z", open: 105850, high: 108300, low: 104900, close: 106178, volume: 39750, knowledge_time: "2026-05-29T00:03:00Z" },
    { id: "bar_btc_3_future_knowledge", asset_id: "asset_btc", ts: "2026-05-30T00:00:00Z", open: 106178, high: 109420, low: 105980, close: 108760, volume: 42190, knowledge_time: "2026-05-30T03:03:00Z" },
    { id: "bar_nvda_1", asset_id: "asset_nvda", ts: "2026-05-28T20:00:00Z", open: 990.1, high: 1014.4, low: 981.6, close: 1008.0, volume: 51022000, knowledge_time: "2026-05-28T20:05:00Z" },
    { id: "bar_hood_1", asset_id: "asset_hood", ts: "2026-05-29T20:00:00Z", open: 60.2, high: 63.1, low: 59.4, close: 62.0, volume: 15200000, knowledge_time: "2026-05-29T20:07:00Z" },
  ],
  newsItems: [
    { id: "news_ai_capex", asset_id: "asset_nvda", headline: "Cloud capex revisions keep AI accelerator demand in focus", source: "Demo Market Wire", url: "https://example.com/demo/ai-capex", sentiment: "positive", event_time: "2026-05-29T12:15:00Z", knowledge_time: "2026-05-29T12:19:00Z" },
    { id: "news_crypto_flows", asset_id: "asset_btc", headline: "ETF flow streak slows while the futures price gap stays firm", source: "Demo Crypto Desk", url: "https://example.com/demo/crypto-flows", sentiment: "neutral", event_time: "2026-05-29T22:10:00Z", knowledge_time: "2026-05-29T22:18:00Z" },
    { id: "news_policy", asset_id: null, headline: "Macro calendar leaves risk assets sensitive to Monday liquidity", source: "Demo Macro Notes", url: "https://example.com/demo/macro", sentiment: "neutral", event_time: "2026-05-30T05:40:00Z", knowledge_time: "2026-05-30T05:50:00Z" },
  ],
  fundingObservations: [
    { id: "fund_btc_1", asset_id: "asset_btc", period_ts: "2026-05-29T08:00:00Z", funding_rate: 0.00014, open_interest: 18400000000, knowledge_time: "2026-05-29T08:02:00Z" },
    { id: "fund_eth_1", asset_id: "asset_eth", period_ts: "2026-05-29T16:00:00Z", funding_rate: 0.00009, open_interest: 8700000000, knowledge_time: "2026-05-29T16:04:00Z" },
  ],
  briefingCards: [
    {
      id: "brief_ai_supply",
      date: eventDay,
      rank: 1,
      headline: "AI supply chain is the top call this morning",
      why_now: "Price, news, and portfolio concentration all updated after Friday close.",
      relevance_note: "NVDA is the largest equity position and drives portfolio beta.",
      bull_case: "Cloud capex revisions and backlog commentary support continued demand.",
      bear_case: "Position size is already high and any capex disappointment would hit concentration.",
      conviction: 7,
      horizon: "2-4 weeks",
      status: "actionable",
      asset_ids: ["asset_nvda"],
      event_time: "2026-05-30T06:05:00Z",
      knowledge_time: "2026-05-30T06:08:00Z",
    },
    {
      id: "brief_crypto_basis",
      date: eventDay,
      rank: 2,
      headline: "Crypto futures price gap looks interesting — worth watching, not trading yet",
      why_now: "Crypto borrow-payment observations stayed positive while ETF flow momentum cooled.",
      relevance_note: "BTC and wallet exposure here are sample data; no capital is deployed.",
      bull_case: "Positive borrow payments and controlled exposure would suit a monitored carry idea.",
      bear_case: "Open interest is crowded, and the executor is still preview-only.",
      conviction: 5,
      horizon: "1 week",
      status: "actionable",
      asset_ids: ["asset_btc", "asset_eth"],
      event_time: "2026-05-30T06:12:00Z",
      knowledge_time: "2026-05-30T06:17:00Z",
    },
    {
      id: "brief_nothing",
      date: eventDay,
      rank: 3,
      headline: "Nothing urgent in the smaller broker balances today",
      why_now: "Robinhood and Coinbase show no threshold breach beyond the alerts already tracked.",
      relevance_note: "A real quiet state — I'd rather say nothing than manufacture a call.",
      bull_case: "Waiting preserves optionality and avoids over-trading thin evidence.",
      bear_case: "A breakout could be missed while these connections stay dormant.",
      conviction: 4,
      horizon: "Today",
      status: "nothing_actionable",
      asset_ids: ["asset_hood"],
      event_time: "2026-05-30T06:20:00Z",
      knowledge_time: "2026-05-30T06:22:00Z",
    },
  ],
  drivers: [
    { id: "driver_capex", briefing_card_id: "brief_ai_supply", label: "Cloud capex revisions", direction: "bullish", weight: 0.42, color: "green", source_citation: "Demo Market Wire, 2026-05-29", event_time: "2026-05-29T12:15:00Z", knowledge_time: "2026-05-29T12:19:00Z" },
    { id: "driver_concentration", briefing_card_id: "brief_ai_supply", label: "Portfolio concentration", direction: "bearish", weight: 0.3, color: "amber", source_citation: "Seeded portfolio snapshot, 2026-05-29", event_time: "2026-05-29T20:00:00Z", knowledge_time: "2026-05-29T20:02:00Z" },
    { id: "driver_funding", briefing_card_id: "brief_crypto_basis", label: "Positive borrow payments", direction: "bullish", weight: 0.36, color: "green", source_citation: "Demo Crypto Desk borrow-payment read, 2026-05-29", event_time: "2026-05-29T16:00:00Z", knowledge_time: "2026-05-29T16:04:00Z" },
    { id: "driver_crowding", briefing_card_id: "brief_crypto_basis", label: "Crowded open interest", direction: "bearish", weight: 0.28, color: "red", source_citation: "Demo Crypto Desk OI, 2026-05-29", event_time: "2026-05-29T16:00:00Z", knowledge_time: "2026-05-29T16:04:00Z" },
  ],
  alerts: [
    { id: "alert_concentration", asset_id: "asset_btc", tier: "T1", z_score: 2.2, message: "BTC weight is above its target band", rationale: "Top-position concentration plus elevated open interest warrants a review.", created_at: "2026-05-30T00:30:00Z", acknowledged: false, useful_feedback: null, event_time: "2026-05-30T00:30:00Z", knowledge_time: "2026-05-30T00:31:00Z" },
    { id: "alert_account_change", asset_id: "asset_usdc_aave", tier: "T0", z_score: 3.1, message: "Sensitive account change on the on-chain wallet", rationale: "A guardrail event — account changes are visible here, and inert.", created_at: "2026-05-29T18:45:00Z", acknowledged: false, useful_feedback: null, event_time: "2026-05-29T18:45:00Z", knowledge_time: "2026-05-29T18:46:00Z" },
    { id: "alert_hood", asset_id: "asset_hood", tier: "T2", z_score: 1.4, message: "Robinhood position moved but stayed below the action threshold", rationale: "Context only — there's no trade route.", created_at: "2026-05-29T20:10:00Z", acknowledged: true, useful_feedback: true, event_time: "2026-05-29T20:10:00Z", knowledge_time: "2026-05-29T20:11:00Z" },
  ],
  decisionJournalEntries: [
    { id: "journal_ai", briefing_card_id: "brief_ai_supply", thesis: "Hold AI exposure unless capex revisions break below trend.", signals: ["capex revisions", "relative strength", "position concentration"], conviction: 7, horizon: "2-4 weeks", falsification_condition: "Two consecutive negative capex guide revisions or a close below the 20-day trend.", logged_at: "2026-05-30T06:30:00Z", event_time: "2026-05-30T06:30:00Z", knowledge_time: "2026-05-30T06:30:30Z" },
    { id: "journal_crypto", briefing_card_id: "brief_crypto_basis", thesis: "Watch the futures price gap only — don't execute.", signals: ["crypto borrow-payment rate", "open interest", "ETF flows"], conviction: 5, horizon: "1 week", falsification_condition: "Borrow payments turn against the trade or the safety buffer falls below guardrail.", logged_at: "2026-05-30T06:35:00Z", event_time: "2026-05-30T06:35:00Z", knowledge_time: "2026-05-30T06:35:30Z" },
  ],
  outcomeScores: [
    { id: "outcome_prev_ai", journal_entry_id: "journal_ai", resolved_at: "2026-05-30T07:00:00Z", pnl_note: "Not resolved yet — scored on process.", thesis_played_out: false, process_score: 8, outcome_score: 0, event_time: "2026-05-30T07:00:00Z", knowledge_time: "2026-05-30T07:01:00Z" },
    { id: "outcome_prev_crypto", journal_entry_id: "journal_crypto", resolved_at: "2026-05-30T07:05:00Z", pnl_note: "No real gain or loss; monitoring stayed inside guardrails.", thesis_played_out: true, process_score: 7, outcome_score: 6, event_time: "2026-05-30T07:05:00Z", knowledge_time: "2026-05-30T07:06:00Z" },
  ],
  paperTradingRounds: [
    { id: "round_2026w22", week_label: "2026-W22", opens_at: "2026-05-25T13:30:00Z", closes_at: "2026-05-29T20:00:00Z", status: "closed", event_time: "2026-05-25T13:30:00Z", knowledge_time: "2026-05-25T13:31:00Z" },
    { id: "round_2026w23", week_label: "2026-W23", opens_at: "2026-06-01T13:30:00Z", closes_at: "2026-06-05T20:00:00Z", status: "open", event_time: "2026-05-30T08:00:00Z", knowledge_time: "2026-05-30T08:01:00Z" },
  ],
  paperPredictions: [
    { id: "pred_nvda", round_id: "round_2026w22", asset_id: "asset_nvda", direction: "long", conviction: 7, rationale: "Momentum and capex revisions remained aligned.", submitted_at: "2026-05-25T14:00:00Z", event_time: "2026-05-25T14:00:00Z", knowledge_time: "2026-05-25T14:00:30Z" },
    { id: "pred_btc", round_id: "round_2026w22", asset_id: "asset_btc", direction: "flat", conviction: 4, rationale: "The futures price gap looked interesting, but crowding made patience more valuable.", submitted_at: "2026-05-25T14:05:00Z", event_time: "2026-05-25T14:05:00Z", knowledge_time: "2026-05-25T14:05:30Z" },
  ],
  roundScores: [
    { id: "score_2026w22", round_id: "round_2026w22", calibration: 7.2, patience: 8.1, diversification: 6.4, total: 21.7, event_time: "2026-05-30T01:00:00Z", knowledge_time: "2026-05-30T01:02:00Z" },
  ],
  executorStrategies: [
    { id: "exec_stablecoin", name: "stablecoin_lending", status: "paused", venue: "Aave/Base sample", net_delta: 0, margin_ratio: 1, funding_rate: 0.036, basis: 0, event_time: "2026-05-30T06:00:00Z", knowledge_time: "2026-05-30T06:02:00Z" },
    { id: "exec_delta", name: "delta_neutral_funding_carry", status: "running_demo", venue: "Perp sample venue", net_delta: 0.02, margin_ratio: 0.64, funding_rate: 0.00014, basis: 0.018, event_time: "2026-05-30T06:00:00Z", knowledge_time: "2026-05-30T06:02:00Z" },
  ],
  guardrailConfigs: [
    { id: "guard_default", per_tx_cap: 0, daily_cap: 0, contract_allowlist: ["0xDemoAavePool", "0xDemoPermitModule"], recipient_allowlist: ["0xDemoVault"], session_key_expiry: "2026-06-30T00:00:00Z", event_time: "2026-05-28T10:00:00Z", knowledge_time: "2026-05-28T10:02:00Z" },
  ],
  integrationStatuses: [
    { id: "int_coinbase", service: "coinbase", status: "stubbed", detail: "Portfolio starts with sample Coinbase holdings. You can test account access and import a holdings snapshot only when you press import.", event_time: "2026-05-24T14:00:00Z", knowledge_time: "2026-05-24T14:03:00Z" },
    { id: "int_robinhood", service: "robinhood", status: "stubbed", detail: "Portfolio starts with sample equity holdings. You can test SnapTrade account access and import a holdings snapshot only when you press import.", event_time: "2026-05-25T13:30:00Z", knowledge_time: "2026-05-25T13:41:00Z" },
    { id: "int_wallet", service: "onchain_wallet", status: "stubbed", detail: "Portfolio starts with a sample on-chain wallet. You can test a wallet read key and import wallet positions only when you press import.", event_time: "2026-05-26T16:20:00Z", knowledge_time: "2026-05-26T16:25:00Z" },
    { id: "int_llm", service: "llm", status: "credential_gated", detail: "Live chat can use a saved server key or a one-time test key. Use Test live chat before relying on a daily read.", event_time: "2026-05-27T10:00:00Z", knowledge_time: "2026-05-27T10:01:00Z" },
  ],
  strategyBeliefs: [
    { id: "belief_patience", name: "Patience over churn", statement: "One reason to watch is not enough to change exposure.", confidence: 0.72, updated_at: "2026-05-29T21:00:00Z", event_time: "2026-05-29T21:00:00Z", knowledge_time: "2026-05-29T21:03:00Z" },
    { id: "belief_basis", name: "Futures price gaps can vanish", statement: "Borrow-payment carry should be monitored but not trusted without stress checks.", confidence: 0.58, updated_at: "2026-05-29T22:00:00Z", event_time: "2026-05-29T22:00:00Z", knowledge_time: "2026-05-29T22:04:00Z" },
  ],
  reflectionUpdates: [
    { id: "reflect_patience", strategy_belief_id: "belief_patience", evidence_summary: "One closed paper round supported patience, but significance was not sufficient to update policy.", significance_passed: false, applied: false, created_at: "2026-05-30T01:10:00Z", event_time: "2026-05-30T01:10:00Z", knowledge_time: "2026-05-30T01:11:00Z" },
  ],
};

export function getSeedSummary() {
  return {
    accounts: demoDatabase.accounts.length,
    assets: demoDatabase.assets.length,
    briefingCards: demoDatabase.briefingCards.length,
    alerts: demoDatabase.alerts.length,
    integrations: demoDatabase.integrationStatuses.map((status) => status.service),
  };
}

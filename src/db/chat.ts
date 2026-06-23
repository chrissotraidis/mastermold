import { getAlerts } from "./alerts";
import { getBriefingCards } from "./briefing";
import { getBrainContextForInference } from "./brain";
import { getJournal } from "./journal";
import { getPortfolio } from "./portfolio";
import { getDataMode } from "./engine-data";
import { getForwardProofStatus } from "./forward-proof";
import type { AsOfFilter } from "./bitemporal";
import { cleanAlertMessage, explainAlertRelevance, shortAlertTierLabel } from "@/lib/alert-loop";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import { buildTodayReadiness } from "@/lib/today-readiness-copy";

export type ChatPrompt = {
  id: string;
  label: string;
  prompt: string;
  reference: string;
};

export type ChatPageContext = {
  surface: string;
  route: string;
  summary: string;
  selected?: string;
};

export type ChatContext = {
  prompts: ChatPrompt[];
  fallback_response: string;
  llm_context: string;
  facts: ChatFacts;
};

export type ChatFacts = {
  top_holding: string;
  top_holding_weight_pct: number;
  top_holding_context: string;
  top_alert: string;
  top_alert_tier: string;
  decision_accuracy: string;
  briefing_headline: string;
};

const CHAT_FACTS_TTL_MS = 20_000;
const chatFactsCache = new Map<string, { expiresAt: number; facts: ChatFacts }>();

export function getChatContext(asOf: AsOfFilter | null = null): ChatContext {
  const facts = getChatFacts(asOf);

  return {
    prompts: buildChatPrompts(facts),
    fallback_response: buildCannedResponse(facts),
    llm_context: buildLlmContext(asOf),
    facts,
  };
}

export function getChatPrompts(asOf: AsOfFilter | null = null): ChatPrompt[] {
  return buildChatPrompts(getChatFacts(asOf));
}

export function getChatFacts(asOf: AsOfFilter | null = null): ChatFacts {
  if (isTestRuntime()) {
    return readChatFacts(asOf);
  }

  const cacheKey = chatFactsCacheKey(asOf);
  const cached = chatFactsCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.facts;
  }

  const facts = readChatFacts(asOf);
  chatFactsCache.set(cacheKey, { expiresAt: now + CHAT_FACTS_TTL_MS, facts });
  return facts;
}

function readChatFacts(asOf: AsOfFilter | null = null): ChatFacts {
  const portfolio = getPortfolio(asOf);
  const alerts = getAlerts(asOf);
  const journal = getJournal(asOf);
  const briefingCards = getBriefingCards(asOf);
  const topHolding = portfolio.holdings[0] ?? null;
  const topAlert = alerts[0] ?? null;
  const topBriefing = briefingCards[0] ?? null;
  const resolvedScores = journal.outcome_scores.filter((score) => score.thesis_played_out);
  const processAverage =
    journal.outcome_scores.length > 0
      ? journal.outcome_scores.reduce((sum, score) => sum + score.process_score, 0) /
        journal.outcome_scores.length
      : 0;
  const decisionAccuracy =
    journal.outcome_scores.length > 0
      ? `${resolvedScores.length}/${journal.outcome_scores.length} closed calls were right with ${processAverage.toFixed(1)}/10 average review quality`
      : "No resolved outcomes yet";

  const facts = {
    top_holding: topHolding?.symbol ?? "no visible holding",
    top_holding_weight_pct: topHolding?.weight_pct ?? 0,
    top_holding_context: topHolding
      ? topHoldingContext(topHolding.source, topHolding.symbol, topHolding.weight_pct)
      : "No visible holding is loaded",
    top_alert: topAlert ? cleanAlertMessage(topAlert.message) : "No visible activity item",
    top_alert_tier: topAlert ? shortAlertTierLabel(topAlert.tier) : "n/a",
    decision_accuracy: decisionAccuracy,
    briefing_headline: topBriefing ? plainBriefingHeadline(topBriefing.headline) : "No briefing card",
  };

  return facts;
}

function chatFactsCacheKey(asOf: AsOfFilter | null) {
  if (!asOf) return "latest";
  return JSON.stringify(asOf);
}

function isTestRuntime() {
  return process.env.NODE_ENV === "test" || process.env.npm_lifecycle_event === "test";
}

function buildChatPrompts(facts: ChatFacts): ChatPrompt[] {
  return [
    {
      id: "today-focus",
      label: "Today focus",
      prompt: "What should I focus on today, using the visible portfolio, activity, and market context?",
      reference: facts.top_holding_context,
    },
    {
      id: "top-activity",
      label: "Top activity",
      prompt: "Why does the top activity item matter, and what should I check?",
      reference: `${facts.top_alert_tier} activity: ${facts.top_alert}`,
    },
    {
      id: "recent-calls",
      label: "Recent calls",
      prompt: "What have your recent calls gotten right or wrong?",
      reference: facts.decision_accuracy,
    },
    {
      id: "top-idea",
      label: "Top idea",
      prompt: "What is the strongest daily idea, and what would prove it wrong?",
      reference: facts.briefing_headline,
    },
  ];
}

function buildCannedResponse(facts: ChatContext["facts"]) {
  return [
    facts.top_holding_context,
    `Top activity item right now: ${facts.top_alert_tier}: ${facts.top_alert}.`,
    `Recent record: ${facts.decision_accuracy}.`,
    "No live chat key is saved, so this is a fixed read. Guidance only; I cannot trade or move funds.",
  ].join(" ");
}

function topHoldingContext(
  source: "demo" | "manual" | "connected",
  symbol: string,
  weightPct: number,
) {
  const weight = `${weightPct.toFixed(1)}%`;
  if (source === "manual") return `Top manual holding: ${symbol} (${weight})`;
  if (source === "connected") return `Top imported holding: ${symbol} (${weight})`;
  return `Top sample holding: ${symbol} (${weight})`;
}

function buildLlmContext(asOf: AsOfFilter | null = null) {
  const portfolio = getPortfolio(asOf);
  const alerts = getAlerts(asOf);
  const journal = getJournal(asOf);
  const dataMode = getDataMode(asOf);
  const brain = getBrainContextForInference(asOf);
  const todayReadiness = buildTodayReadiness({ portfolio, dataMode, brain: getBrainStateForReadiness(brain) });
  const forwardProof = getForwardProofStatus();
  const briefingCards = getBriefingCards(asOf).map((card) => ({
    rank: card.rank,
    headline: plainBriefingHeadline(card.headline),
    confidence: `${card.conviction}/10`,
    horizon: card.horizon,
    read_status: card.status === "actionable" ? "Worth checking" : "Nothing urgent",
    bull_case: plainBriefingText(card.bull_case),
    bear_case: plainBriefingText(card.bear_case),
    why_now: plainBriefingText(card.why_now),
    data_state: card.provenance.label === "Engine output" ? "saved market read" : "sample data",
  }));

  return JSON.stringify({
    advisory_boundary: "No trading, order placement, custody, or fund movement authority.",
    truthfulness_rules: [
      "Answer in plain prose. Do not quote JSON keys, field names, raw context labels, or implementation names.",
      "Do not call portfolio values live, real-time, connected, synced, or imported unless the plain data-state summary says imported portfolio.",
      "Avoid toy-sounding paper-trading language plus the phrases live engine output, engine output, actionable, signals, insights, conviction, high-conviction, high-confidence, higher-confidence, higher confidence, highest-confidence, hypothesis, picks, and practice. Say saved market read, things to check, reasons to watch, stronger evidence, paper trade, review, and confidence.",
      "If the portfolio data state is Demo data, say sample portfolio.",
      "If the portfolio data state is Manual portfolio, say local manual entries plus sample data unless a holding source is imported.",
      "Connection checks do not import holdings by themselves. Imported holdings appear only after the explicit Settings import action.",
      "The market-memory automation status is included in context. If it is off or manual, say the chat context check is not running. Do not call it a whole-market reader.",
      "Save context for chat only saves or refreshes local app context for chat. It does not check the internet, news, or connected accounts.",
      "For Chat context questions, do not say the user can run checks, load fresh market data, trigger a scan, or manually trigger a scan to fetch fresh market data.",
      "Do not describe Save context for chat as a way to get live updates. It only saves local context for future chat answers.",
      "Use daily_readiness to explain what would make Today more personal. Do not imply the full PRD Brain is complete.",
      "The forward measurement status is included in context. A running measurement window only starts the clock; it needs enough later results before the baseline comparison means anything. Seeded/sample calls do not count as forward evidence.",
      "The app can create paper trades from Today, Activity, and Paper using simulator dollars. Never describe that as real execution, and never say the app cannot paper trade.",
    ],
    app_actions: {
      paper_trading:
        "Available in the app for simulator-only paper trades. Activity and Today can prefill a Paper trade with the asset and plain-language reason. No real money moves.",
      real_trading:
        "Unavailable. The app cannot place orders, move funds, sign transactions, or call a chain.",
    },
    data_state: {
      market_scan_state: dataMode.label === "Engine output" ? "saved market read" : "sample market context",
      market_scan_detail: userFacingBriefingSource(dataMode),
      portfolio_state: portfolio.provenance.label,
      portfolio_detail: userFacingPortfolioSource(portfolio.provenance.label),
      user_facing_summary:
        dataMode.label === "Engine output"
          ? `Today and Activity come from a saved market read${formatSavedRunDate(dataMode.as_of)}. Portfolio values are ${portfolioValueSummary(portfolio.provenance.label)}.`
          : `Today and Activity are sample data. Portfolio values are ${portfolioValueSummary(portfolio.provenance.label)}.`,
      note:
        portfolio.provenance.label === "Imported portfolio"
          ? "Portfolio context includes an imported holdings snapshot. It cannot trade or move money."
          : portfolio.provenance.label === "Manual portfolio"
          ? "Portfolio context includes local manual holdings. Treat broker or wallet values as sample unless they are shown in Portfolio as imported."
          : dataMode.label === "Engine output"
          ? "Today and Activity below come from a saved market read. Do not call them live. Portfolio values can still be sample data; use the portfolio data state before describing them."
          : "No saved market read is loaded; Today and Activity below are sample data. Portfolio values can also be sample data; use the portfolio data state before describing them.",
    },
    daily_readiness: todayReadiness,
    portfolio: {
      total_market_value: portfolio.total_market_value,
      daily_change_value: portfolio.daily_change_value,
      daily_change_pct: portfolio.daily_change_pct,
      manual_holding_count: portfolio.manual_holdings.length,
      imported_holding_count: portfolio.imported_holdings.length,
      import_snapshot: portfolio.import_snapshot,
      data_state: portfolio.provenance.label,
      import_status:
        portfolio.provenance.label === "Imported portfolio"
          ? `${portfolio.import_snapshot.status}; an imported holdings snapshot is present; no automatic refresh, trading, or money movement is available`
          : portfolio.provenance.label === "Manual portfolio"
            ? "local manual entries are present; use Settings import to add a holdings snapshot"
            : "sample portfolio; use Settings import to add a holdings snapshot",
    },
    holdings: portfolio.holdings.map((holding) => ({
      symbol: holding.symbol,
      name: holding.asset_name,
      asset_class: holding.asset_class,
      venue: holding.venue,
      market_value: holding.market_value,
      portfolio_weight_ratio: Number((holding.weight_pct / 100).toFixed(4)),
      portfolio_weight_pct: holding.weight_pct,
      daily_change_pct: holding.daily_change_pct,
      data_state: holding.source === "demo" ? "sample" : holding.source,
    })),
    concentration: portfolio.concentration,
    alerts: alerts.map((alert) => ({
      severity: shortAlertTierLabel(alert.tier),
      plain_message: cleanAlertMessage(alert.message),
      why_it_matters: explainAlertRelevance(alert),
      acknowledged: alert.acknowledged,
    })),
    forward_measurement: forwardProof,
    market_brain: brain,
    recent_call_record: summarizeTrackRecord(journal.track_record),
    daily_rundown_cards: briefingCards,
  });
}

function getBrainStateForReadiness(brain: ReturnType<typeof getBrainContextForInference>) {
  return {
    initialized: brain.initialized,
    summary: {
      snapshot_freshness: brain.snapshot_freshness,
    },
    schedule: {
      enabled: brain.schedule.enabled,
      status: brain.schedule.status,
    },
  };
}

function userFacingBriefingSource(dataMode: ReturnType<typeof getDataMode>) {
  if (dataMode.label === "Engine output") {
    return `Saved market read${formatSavedRunDate(dataMode.as_of)}`;
  }
  return "Sample Today and Activity";
}

function userFacingPortfolioSource(label: string) {
  if (label === "Manual portfolio") return "Local manual entries plus sample data";
  if (label === "Imported portfolio") return "Imported holdings snapshot plus local/sample data";
  return "Sample portfolio";
}

function portfolioValueSummary(label: string) {
  if (label === "Imported portfolio") return "imported holdings snapshot plus local/sample data";
  if (label === "Manual portfolio") return "local manual entries plus sample data";
  return "a sample portfolio";
}

function formatSavedRunDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return ` from ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed)}`;
}

function summarizeTrackRecord(trackRecord: ReturnType<typeof getJournal>["track_record"]) {
  return trackRecord.map((tier) => ({
    score_range: tier.key,
    label: tierLabel(tier.key),
    calls_logged: tier.entry_count,
    calls_resolved: tier.resolved_count,
    calls_right: tier.wins,
    hit_rate: tier.win_rate === null ? "not enough data" : `${Math.round(tier.win_rate * 100)}%`,
    average_result: tier.mean_outcome_score === null ? "not enough data" : `${tier.mean_outcome_score.toFixed(1)}/10`,
  }));
}

function tierLabel(key: string) {
  if (key === "7-10") return "strongly scored calls";
  if (key === "4-6") return "middle-scored calls";
  return "early watchlist calls";
}

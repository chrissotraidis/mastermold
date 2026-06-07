import { getAlerts } from "./alerts";
import { getBriefingCards } from "./briefing";
import { getJournal } from "./journal";
import { getPortfolio } from "./portfolio";
import { getDataMode } from "./engine-data";

export type ChatPrompt = {
  id: string;
  label: string;
  prompt: string;
  reference: string;
};

export type ChatContext = {
  prompts: ChatPrompt[];
  fallback_response: string;
  llm_context: string;
  facts: {
    top_holding: string;
    top_holding_weight_pct: number;
    top_alert: string;
    top_alert_tier: string;
    decision_accuracy: string;
    briefing_headline: string;
  };
};

export function getChatContext(): ChatContext {
  const portfolio = getPortfolio();
  const alerts = getAlerts();
  const journal = getJournal();
  const briefingCards = getBriefingCards();
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
      ? `${resolvedScores.length}/${journal.outcome_scores.length} resolved theses played out with ${processAverage.toFixed(1)}/10 mean process score`
      : "No resolved seeded outcomes yet";

  const facts = {
    top_holding: topHolding?.symbol ?? "no seeded holding",
    top_holding_weight_pct: topHolding?.weight_pct ?? 0,
    top_alert: topAlert?.message ?? "No seeded alert",
    top_alert_tier: topAlert?.tier ?? "n/a",
    decision_accuracy: decisionAccuracy,
    briefing_headline: topBriefing?.headline ?? "No briefing card",
  };

  return {
    prompts: [
      {
        id: "highest-conviction-holding",
        label: "Highest-conviction holding",
        prompt: "What is my highest-conviction holding?",
        reference: `${facts.top_holding} is the largest seeded portfolio weight at ${facts.top_holding_weight_pct.toFixed(1)}%.`,
      },
      {
        id: "top-alert",
        label: "Explain top alert",
        prompt: "Explain today's top alert.",
        reference: `${facts.top_alert_tier} alert: ${facts.top_alert}`,
      },
      {
        id: "decision-accuracy",
        label: "Decision accuracy",
        prompt: "Review my recent decision accuracy.",
        reference: facts.decision_accuracy,
      },
      {
        id: "briefing-thesis",
        label: "Briefing thesis",
        prompt: "Summarize the top briefing thesis and what would falsify it.",
        reference: facts.briefing_headline,
      },
    ],
    fallback_response: buildCannedResponse(facts),
    llm_context: buildLlmContext(),
    facts,
  };
}

function buildCannedResponse(facts: ChatContext["facts"]) {
  return [
    "Advisory only - no trade authority.",
    `Seeded context says ${facts.top_holding} is the largest portfolio exposure at ${facts.top_holding_weight_pct.toFixed(1)}% weight.`,
    `Today's highest-priority alert is ${facts.top_alert_tier}: ${facts.top_alert}.`,
    `Recent decision accuracy: ${facts.decision_accuracy}.`,
    "Treat this as a review prompt, not an instruction to trade or move funds.",
  ].join(" ");
}

function buildLlmContext() {
  const portfolio = getPortfolio();
  const alerts = getAlerts();
  const journal = getJournal();
  const dataMode = getDataMode();
  const briefingCards = getBriefingCards().map((card) => ({
    rank: card.rank,
    headline: card.headline,
    conviction: card.conviction,
    horizon: card.horizon,
    status: card.status,
    bull_case: card.bull_case,
    bear_case: card.bear_case,
    why_now: card.why_now,
    provenance: card.provenance.label,
  }));

  return JSON.stringify({
    advisory_boundary: "No trading, order placement, custody, or fund movement authority.",
    data_source: {
      label: dataMode.label,
      detail: dataMode.source,
      note:
        dataMode.label === "Engine output"
          ? "Briefing and alerts below are this morning's TradingAgents engine output; interrogate them directly."
          : "No engine run ingested; briefing and alerts below are seeded demo data.",
    },
    holdings: portfolio.holdings.map((holding) => ({
      symbol: holding.symbol,
      asset_class: holding.asset_class,
      venue: holding.venue,
      portfolio_weight_ratio: Number((holding.weight_pct / 100).toFixed(4)),
      portfolio_weight_pct: holding.weight_pct,
    })),
    concentration: portfolio.concentration,
    alerts: alerts.map((alert) => ({
      tier: alert.tier,
      z_score: alert.z_score,
      message: alert.message,
      rationale: alert.rationale,
      acknowledged: alert.acknowledged,
    })),
    decision_track_record: journal.track_record,
    briefing_cards: briefingCards,
  });
}

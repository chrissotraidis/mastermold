import { plainBriefingText } from "@/lib/plain-finance-copy";
import type { ChatPageContext } from "@/src/db/chat";

type AlertLoopInput = {
  tier?: string;
  severity?: string;
  z_score?: number;
  priority_score?: number;
  message: string;
  rationale: string;
  signal?: string;
  reason_type?: string;
  asset_id?: string;
  asset_key?: string;
  asset_symbol?: string;
  asset_name?: string;
  portfolio_weight_pct?: number;
};

export function alertLoopActions(alert: AlertLoopInput) {
  const message = cleanAlertMessage(alert.message);
  const ask = buildAlertChatPrompt(alert);
  const journalInput = buildAlertJournalInput(alert);
  const journalParams = new URLSearchParams({
    call: journalInput.call,
    reasons: Array.isArray(journalInput.signals) ? journalInput.signals.join(", ") : "",
    confidence: String(journalInput.confidence),
    horizon: journalInput.horizon,
    falsification: journalInput.falsification_condition,
  });

  return {
    askPrompt: ask,
    journalHref: `/journal?${journalParams.toString()}`,
    paperHref: buildAlertPaperHref(alert),
  };
}

export function buildAlertPaperHref(alert: AlertLoopInput) {
  const params = new URLSearchParams({
    rationale: `Testing alert as a paper trade: ${cleanAlertMessage(alert.message)}. ${explainAlertRelevance(alert)}`,
  });
  if (alert.asset_symbol) params.set("symbol", alert.asset_symbol);
  return `/paper?${params.toString()}`;
}

export function buildAlertChatPrompt(alert: AlertLoopInput) {
  const message = cleanAlertMessage(alert.message);
  return [
    `Explain this alert in plain English: ${message}.`,
    "Keep raw math hidden unless I ask for it.",
    "Tell me why it matters to the visible portfolio, what action is reasonable, and what would make it safe to ignore.",
    `Plain relevance: ${explainAlertRelevance(alert)}`,
    `Suggested response: ${buildAlertSuggestedResponse(alert)}`,
  ].join(" ");
}

export function buildAlertPageContext(alert: AlertLoopInput): ChatPageContext {
  const message = cleanAlertMessage(alert.message);
  const tier = alertTier(alert);
  return {
    surface: "Selected alert",
    route: "/alerts",
    summary:
      "The user opened chat from a specific alert. Explain why it matters, what response is reasonable, and what would make it safe to ignore.",
    selected: [
      `${shortAlertTierLabel(tier)}: ${message}`,
      explainAlertRelevance(alert),
      `Suggested response: ${buildAlertSuggestedResponse(alert)}`,
    ].join(" "),
  };
}

export function buildAlertJournalInput(alert: AlertLoopInput) {
  const message = cleanAlertMessage(alert.message);
  const tier = alertTier(alert);
  const signal = alertSignalLabel(alertSignal(alert));
  return {
    call: `Review alert: ${message}`,
    signals: [alertTierLabel(tier), signal, alert.portfolio_weight_pct ? "Portfolio-relevant" : "Watchlist context"],
    confidence: Number(defaultConfidence(tier)),
    horizon: tier === "T0" ? "Today" : "1-3 days",
    falsification_condition: buildAlertFalsification(alert),
  };
}

export function explainAlertRelevance(alert: AlertLoopInput) {
  const message = cleanAlertMessage(alert.message);
  const signal = alertSignal(alert).replace(/_/g, " ");
  const subject = message.split(":")[0] || message;
  const portfolioWeight = alert.portfolio_weight_pct ?? 0;
  const tier = alertTier(alert);
  const symbol = alert.asset_symbol ?? alert.asset_key;
  const relevance =
    portfolioWeight > 0
      ? `It touches ${symbol ?? subject}, which is ${portfolioWeight.toFixed(1)}% of the visible portfolio.`
      : `${symbol ?? subject} is not in the visible holdings, so treat this as watchlist context unless you plan to add exposure.`;
  const urgency =
    tier === "T0"
      ? "Check this now."
      : tier === "T1"
        ? "Worth checking today."
        : "Good to know; probably not urgent.";

  if (signal.includes("volume")) {
    return `${urgency} ${relevance} Trading is much heavier than usual, which can change risk today.`;
  }
  if (signal.includes("funding")) {
    return `${urgency} ${relevance} Borrow-payment conditions moved enough to affect crypto carry or crowded positioning.`;
  }
  if (signal.includes("return") || signal.includes("price")) {
    return `${urgency} ${relevance} The price move is unusual versus recent history.`;
  }
  if (signal.includes("news")) {
    return `${urgency} ${relevance} News flow picked up, so read the reason before changing exposure.`;
  }

  return `${urgency} ${relevance} This needs attention because the move is unusual; check the reason or ask Master Mold before making a decision.`;
}

export function buildAlertSuggestedResponse(alert: AlertLoopInput) {
  const signal = alertSignal(alert).replace(/_/g, " ");
  const weight = alert.portfolio_weight_pct ?? 0;
  const hasExposure = weight > 0;
  const isConcentrated = weight >= 20;
  const tier = alertTier(alert);
  const subject = alert.asset_symbol ?? alert.asset_key ?? cleanAlertMessage(alert.message).split(" ")[0] ?? "This";

  if (!hasExposure) {
    return `No action needed unless you plan to add ${subject}. Keep it as watchlist context.`;
  }

  if (tier === "T0") {
    return isConcentrated
      ? `Review before adding exposure. ${subject} is a large visible position, so decide whether to trim risk or simply hold.`
      : `Check before adding exposure. If your plan has not changed, holding steady is reasonable.`;
  }

  if (signal.includes("volume")) {
    return isConcentrated
      ? `Check whether the heavier trading changes your position size decision today.`
      : `Watch for follow-through before changing the position.`;
  }

  if (signal.includes("return") || signal.includes("price")) {
    return isConcentrated
      ? `Do not chase the move. Review whether the position is still the right size.`
      : `Wait for a cleaner reason before changing exposure.`;
  }

  if (signal.includes("news")) {
    return `Read the source before changing exposure. Ignore it if the news does not affect your actual holding.`;
  }

  if (signal.includes("funding")) {
    return `Treat this as a risk check, not a trade by itself. Funding can change quickly.`;
  }

  return `Check whether this changes a real decision. If it does not, dismiss it and keep the inbox quiet.`;
}

export function buildAlertIgnoreCondition(alert: AlertLoopInput) {
  return buildAlertFalsification(alert);
}

export function cleanAlertMessage(message: string) {
  return plainBriefingText(message.replace(/\s*\(z=[^)]*\)\s*$/i, ""));
}

export function cleanAlertRationale(rationale: string) {
  return plainBriefingText(rationale);
}

function defaultConfidence(tier: string) {
  if (tier === "T0") return "8";
  if (tier === "T1") return "6";
  return "4";
}

export function alertTierLabel(tier: string) {
  if (tier === "T0") return "Urgent alert";
  if (tier === "T1") return "Worth checking";
  return "FYI";
}

export function shortAlertTierLabel(tier: string) {
  if (tier === "T0") return "Urgent";
  if (tier === "T1") return "Worth checking";
  return "FYI";
}

function alertSignalLabel(signal: string | undefined) {
  if (signal === "return_z") return "Unusual price move";
  if (signal === "volume_z") return "Unusual trading volume";
  if (signal === "news_count_z") return "News pickup";
  if (signal === "funding") return "Borrow-payment change";
  return "Market move";
}

function buildAlertFalsification(alert: AlertLoopInput) {
  const subject = alert.asset_symbol || alert.asset_key || cleanAlertMessage(alert.message).split(":")[0] || "This alert";
  const signal = alertSignal(alert);
  if (signal.includes("volume")) {
    return `${subject} stops trading unusually heavily, no new source confirms the move, or the position impact stays too small to change today's decision.`;
  }
  if (signal.includes("return") || signal.includes("price")) {
    return `${subject} gives back the move or the change does not affect the visible exposure by the end of the stated horizon.`;
  }
  if (signal.includes("news")) {
    return `${subject} does not get follow-through from credible sources, or the news does not change the portfolio read.`;
  }
  if (signal.includes("funding")) {
    return `${subject} funding normalizes or the carry setup is too crowded to justify attention.`;
  }
  return `${subject} no longer affects the visible holdings, or the reason for the alert does not change a decision by the stated horizon.`;
}

function alertTier(alert: AlertLoopInput) {
  if (alert.tier) return alert.tier;
  if (alert.severity === "Urgent") return "T0";
  if (alert.severity === "Worth checking") return "T1";
  return "T2";
}

function alertSignal(alert: AlertLoopInput) {
  if (alert.signal) return alert.signal;
  if (alert.reason_type === "Unusual trading volume") return "volume_z";
  if (alert.reason_type === "Unusual price move") return "return_z";
  if (alert.reason_type === "News pickup") return "news_count_z";
  if (alert.reason_type === "Borrow-payment change") return "funding";
  return "market_move";
}

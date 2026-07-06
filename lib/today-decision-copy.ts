import { cleanAlertMessage } from "@/lib/alert-loop";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";

type TodayBriefingCard = {
  headline: string;
  conviction: number;
  horizon: string;
  relevance_note: string;
};

type TodayAlert = {
  message: string;
  portfolio_weight_pct?: number;
  tier?: string;
};

type TodayHolding = {
  symbol: string;
  weight_pct: number;
  asset_name: string;
  source?: "demo" | "manual" | "connected";
  account?: {
    label: string;
  };
};

export function todayMorningSummary(
  actionableCount: number,
  openAlertCount: number,
  topCard: Pick<TodayBriefingCard, "headline"> | null,
  topAlert: Pick<TodayAlert, "message" | "tier" | "portfolio_weight_pct"> | null = null,
) {
  if (actionableCount === 0 && openAlertCount === 0) {
    return "Nothing needs action right now. Ask for the bear case if you are considering a move.";
  }
  const alertText = openAlertCount > 0 ? `${openAlertCount} activity item${openAlertCount > 1 ? "s" : ""} to review.` : "No open activity items.";
  const ideaText = topCard ? plainBriefingHeadline(topCard.headline) : "";

  if (topAlert?.tier === "T0") {
    const alertSummary = todayAlertSummary(topAlert, "Also check");
    if (ideaText) {
      return `Start with ${ideaText}. ${alertSummary} ${alertText}`;
    }
    return `${todayAlertSummary(topAlert, "Check")} ${alertText}`;
  }

  if (ideaText) {
    return `Start with ${ideaText}. ${alertText}`;
  }

  return `${alertText} No idea is ready yet.`;
}

function todayAlertSummary(topAlert: Pick<TodayAlert, "message" | "portfolio_weight_pct">, lead: "Also check" | "Check") {
  const portfolioWeight = topAlert.portfolio_weight_pct;
  const relevance =
    typeof portfolioWeight === "number" && Number.isFinite(portfolioWeight)
      ? `; it touches ${portfolioWeight.toFixed(1)}% of the visible portfolio`
      : "";
  return `${lead} why ${cleanAlertMessage(topAlert.message)}${relevance}.`;
}

export function buildTodayPrompt(
  topCard: TodayBriefingCard | null,
  topAlert: TodayAlert | null,
  topHolding: TodayHolding | null,
) {
  return [
    "Give me today's financial rundown in plain English.",
    todayHoldingPromptDetail(topHolding),
    topCard
      ? `Visible Focus 1: ${plainBriefingHeadline(topCard.headline)}, confidence ${topCard.conviction}/10, horizon ${topCard.horizon}. Start with this portfolio-aware idea.`
      : "No top idea is visible.",
    topAlert
      ? `Top activity item to also check: ${cleanAlertMessage(topAlert.message)}. ${todayAlertPromptRelevance(topAlert, topHolding)}.`
      : "No open activity item is visible.",
    "Tell me the 1-3 things to focus on, in the same order as the visible Today page: Focus 1 first, then urgent activity items or smaller checks. Explain why each matters to the visible portfolio and what action is reasonable. Do not use jargon without translating it.",
  ].join(" ");
}

function todayAlertPromptRelevance(topAlert: TodayAlert, topHolding: TodayHolding | null) {
  if (typeof topAlert.portfolio_weight_pct === "number" && Number.isFinite(topAlert.portfolio_weight_pct)) {
    return `It relates to ${topAlert.portfolio_weight_pct.toFixed(1)}% of ${todayPortfolioScopePhrase(topHolding)}`;
  }
  return `It relates to ${todayPortfolioScopePhrase(topHolding)}`;
}

export function todayHoldingPromptDetail(holding: TodayHolding | null) {
  if (!holding) return "No visible holding is loaded.";

  const holdingWeight = `${holding.weight_pct.toFixed(1)}%`;

  if (holding.source === "manual") {
    return `The visible portfolio is built from local manual entries, not imported money. Its largest visible holding is ${holding.symbol} at ${holdingWeight} from a local manual entry.`;
  }

  if (holding.source === "connected") {
    const account = holding.account?.label ? ` ${holding.account.label}` : "";
    return `My largest visible holding is ${holding.symbol} at ${holdingWeight} from imported${account} portfolio data.`;
  }

  return `This is a sample portfolio, not imported money. Its largest visible holding is ${holding.symbol} at ${holdingWeight}.`;
}

export function todayPortfolioScopePhrase(holding: TodayHolding | null) {
  if (!holding) return "the visible portfolio";

  if (holding.source === "manual") {
    return "the visible portfolio, built from local manual entries";
  }

  if (holding.source === "connected") {
    return "my imported portfolio data";
  }

  return "the sample portfolio";
}

export function todayHoldingDetail(holding: TodayHolding | null) {
  if (!holding) return "No portfolio data";

  if (holding.source === "manual") {
    return `${holding.asset_name} · manual entry`;
  }

  if (holding.source === "connected") {
    const account = holding.account?.label ? ` from ${holding.account.label}` : "";
    return `${holding.asset_name} · imported${account}`;
  }

  return `${holding.asset_name} · sample holding`;
}

export function buildTodayPaperHref(
  topHolding: Pick<TodayHolding, "symbol"> | null,
  topCard: Pick<TodayBriefingCard, "headline" | "relevance_note"> | null,
) {
  const params = new URLSearchParams({
    rationale: topCard
      ? `Testing today's idea as a paper trade: ${plainBriefingHeadline(topCard.headline)}. ${plainBriefingText(topCard.relevance_note)}`
      : "Testing today's portfolio focus as a paper trade.",
  });
  if (topHolding?.symbol) params.set("symbol", topHolding.symbol);
  return `/paper?${params.toString()}`;
}

export function buildTodayRiskNote({
  topHoldingPct,
  topHoldingSymbol,
  activeAlerts,
  highScored,
}: {
  topHoldingPct: number;
  topHoldingSymbol: string;
  activeAlerts: number;
  highScored: number;
}) {
  if (topHoldingPct >= 30) {
    return `${topHoldingSymbol} is concentrated at ${topHoldingPct.toFixed(1)}%. Treat any idea as a risk decision first, not just a return idea.`;
  }
  if (activeAlerts > 0) {
    return `${activeAlerts} activity item${activeAlerts > 1 ? "s" : ""} need attention. Review those before adding a new idea.`;
  }
  if (highScored > 0) {
    return `${highScored} strongly scored idea${highScored > 1 ? "s" : ""} on the board. Check what would prove it wrong before acting outside the app.`;
  }
  return "No urgent risk flag. The app is advisory-only and cannot place trades or move funds.";
}

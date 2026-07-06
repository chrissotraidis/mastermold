import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import type { AsOfFilter } from "./bitemporal";
import { getBriefingCards, type BriefingCardJson } from "./briefing";
import { getDataMode } from "./engine-data";
import { getPortfolio, type PortfolioHoldingJson } from "./portfolio";
import { evaluatePositionPolicies } from "./position-policies";
import { demoDatabase } from "./seed-data";

export type PortfolioRecommendationClass =
  | "Review"
  | "Watch"
  | "Trim candidate"
  | "Add candidate"
  | "Paper test first";

export type PortfolioRecommendation = {
  id: string;
  symbol: string;
  classification: PortfolioRecommendationClass;
  title: string;
  detail: string;
  reason: string;
  href: string;
  source_label: "Saved read" | "Sample market context" | "Portfolio" | "Position policy";
  portfolio_weight_pct: number | null;
  market_value: number | null;
  confidence: number | null;
  data_boundary: string;
};

export function getPortfolioRecommendations(
  asOf: AsOfFilter | null = null,
  limit = 6,
): PortfolioRecommendation[] {
  const portfolio = getPortfolio(asOf);
  const cards = getBriefingCards(asOf).filter((card) => card.status === "actionable");
  const dataMode = getDataMode(asOf);
  const sourceLabel = dataMode.label === "Engine output" ? "Saved read" : "Sample market context";
  const recommendations: PortfolioRecommendation[] = [];
  const usedSymbols = new Set<string>();

  // Operator-set policies are checked live (not replayed), so only apply them to
  // the current view; an as-of replay shows what the queue said at that time.
  const holdingsBySymbol = new Map(portfolio.holdings.map((holding) => [holding.symbol.toUpperCase(), holding]));
  const policyFindings = asOf ? [] : evaluatePositionPolicies(portfolio.holdings);
  for (const finding of policyFindings) {
    const holding = holdingsBySymbol.get(finding.symbol);
    recommendations.push({
      id: `policy-${finding.symbol}-${finding.kind}`,
      symbol: finding.symbol,
      classification: finding.classification,
      title: finding.title,
      detail: finding.detail,
      reason: "Your position policy for this symbol.",
      href: "/portfolio#position-policies",
      source_label: "Position policy",
      portfolio_weight_pct: holding?.weight_pct ?? null,
      market_value: holding?.market_value ?? null,
      confidence: null,
      data_boundary: "Review prompt only. This cannot place brokerage trades, sign transactions, or move funds.",
    });
    usedSymbols.add(finding.symbol);
  }

  for (const card of cards) {
    const symbols = symbolsForCard(card);
    const holding = findBestHoldingForSymbols(symbols, portfolio.holdings);
    const symbol = holding?.symbol ?? symbols[0] ?? symbolFromHeadline(card.headline) ?? "MARKET";
    const className = recommendationClassForCard(card, holding);
    const title =
      className === "Add candidate"
        ? `Research ${symbol} before adding exposure`
        : className === "Paper test first"
          ? `Paper test ${symbol} before adding risk`
          : `${className} ${symbol}`;

    recommendations.push({
      id: `card-${card.id}-${symbol}-${className.toLowerCase().replaceAll(" ", "-")}`,
      symbol,
      classification: className,
      title,
      detail: recommendationDetail(card, holding, className),
      reason: plainBriefingText(card.relevance_note || card.why_now),
      href: holding ? `/briefing/${encodeURIComponent(card.id)}` : buildPaperHref(symbol, card.id),
      source_label: sourceLabel,
      portfolio_weight_pct: holding?.weight_pct ?? null,
      market_value: holding?.market_value ?? null,
      confidence: card.conviction,
      data_boundary: "Review prompt only. This cannot place brokerage trades, sign transactions, or move funds.",
    });
    usedSymbols.add(symbol);
  }

  for (const holding of portfolio.holdings) {
    if (usedSymbols.has(holding.symbol)) continue;
    if (holding.weight_pct < 15) continue;
    const className: PortfolioRecommendationClass = holding.weight_pct >= 35 ? "Trim candidate" : "Watch";
    recommendations.push({
      id: `holding-${holding.id}-${className.toLowerCase().replaceAll(" ", "-")}`,
      symbol: holding.symbol,
      classification: className,
      title: `${className} ${holding.symbol}`,
      detail:
        (className === "Trim candidate"
          ? `${holding.symbol} is ${holding.weight_pct.toFixed(1)}% of the visible portfolio. Treat any new idea here as concentration review before changing risk.`
          : `${holding.symbol} is ${holding.weight_pct.toFixed(1)}% of the visible portfolio. Keep it on the watch list even without a matching Today card.`) +
        costContext(holding),
      reason: holding.source === "demo" ? "Visible sample holding." : "Visible portfolio holding.",
      href: "/portfolio",
      source_label: "Portfolio",
      portfolio_weight_pct: holding.weight_pct,
      market_value: holding.market_value,
      confidence: null,
      data_boundary: "Review prompt only. This cannot place brokerage trades, sign transactions, or move funds.",
    });
  }

  return recommendations
    .sort((a, b) => recommendationPriority(a) - recommendationPriority(b))
    .slice(0, limit);
}

function recommendationClassForCard(
  card: BriefingCardJson,
  holding: PortfolioHoldingJson | null,
): PortfolioRecommendationClass {
  if (!holding) return card.conviction >= 7 ? "Add candidate" : "Paper test first";
  if (holding.weight_pct >= 35) return "Trim candidate";
  if (holding.weight_pct >= 10) return "Review";
  return card.conviction >= 7 ? "Paper test first" : "Watch";
}

function recommendationDetail(
  card: BriefingCardJson,
  holding: PortfolioHoldingJson | null,
  className: PortfolioRecommendationClass,
) {
  const headline = plainBriefingHeadline(card.headline);
  if (!holding) {
    return `${headline}. No matching visible holding is loaded, so research first and use Paper before adding exposure.`;
  }
  if (className === "Trim candidate") {
    return `${holding.symbol} is ${holding.weight_pct.toFixed(1)}% of visible holdings. ${headline}. Review concentration before adding or removing risk.${costContext(holding)}`;
  }
  return `${holding.symbol} is ${holding.weight_pct.toFixed(1)}% of visible holdings. ${headline}.${costContext(holding)}`;
}

/** Performance versus the operator's recorded cost — the "it keeps working, hold it" context. */
function costContext(holding: PortfolioHoldingJson) {
  if (!Number.isFinite(holding.cost_basis) || holding.cost_basis <= 0) return "";
  const gain = ((holding.market_value - holding.cost_basis) / holding.cost_basis) * 100;
  if (Math.abs(gain) < 1) return "";
  return ` It is ${gain >= 0 ? "up" : "down"} ${Math.abs(gain).toFixed(1)}% versus your recorded cost.`;
}

function findBestHoldingForSymbols(symbols: string[], holdings: PortfolioHoldingJson[]) {
  const set = new Set(symbols.map((symbol) => symbol.toUpperCase()));
  return holdings
    .filter((holding) => set.has(holding.symbol.toUpperCase()))
    .sort((a, b) => b.weight_pct - a.weight_pct || b.market_value - a.market_value)[0] ?? null;
}

function symbolsForCard(card: BriefingCardJson) {
  const symbols = new Set<string>();
  const assetsById = new Map(demoDatabase.assets.map((asset) => [asset.id, asset.symbol]));
  for (const assetId of card.asset_ids) {
    const mapped = assetsById.get(assetId);
    if (mapped) symbols.add(mapped.toUpperCase());
    if (/^[A-Za-z]{1,8}$/.test(assetId)) symbols.add(assetId.toUpperCase());
  }
  const fromHeadline = symbolFromHeadline(card.headline);
  if (fromHeadline) symbols.add(fromHeadline);
  return [...symbols];
}

function symbolFromHeadline(value: string) {
  const match = value.match(/\b[A-Z]{2,6}\b/);
  return match?.[0] ?? null;
}

function buildPaperHref(symbol: string, cardId: string) {
  const params = new URLSearchParams({
    symbol,
    source: "portfolio-recommendation",
    card: cardId,
  });
  return `/paper?${params.toString()}`;
}

function recommendationPriority(recommendation: PortfolioRecommendation) {
  const classRank: Record<PortfolioRecommendationClass, number> = {
    "Trim candidate": 0,
    Review: 1,
    Watch: 2,
    "Paper test first": 3,
    "Add candidate": 4,
  };
  const weightBoost = recommendation.portfolio_weight_pct === null ? 100 : -recommendation.portfolio_weight_pct;
  const confidenceBoost = recommendation.confidence === null ? 0 : -recommendation.confidence / 10;
  return classRank[recommendation.classification] * 100 + weightBoost + confidenceBoost;
}

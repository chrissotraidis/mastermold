import { NextResponse } from "next/server";
import {
  toPublicPortfolio,
  type PublicPortfolio,
  type PublicPortfolioDailyReview,
  type PublicPortfolioRecommendation,
} from "@/lib/public-api-copy";
import { parseAsOf, type AsOfFilter } from "@/src/db/bitemporal";
import {
  addManualHolding,
  getPortfolio,
  type AssetClass,
  type PortfolioJson,
} from "@/src/db/portfolio";
import { getPortfolioBrainScanContext, getPortfolioBrainState } from "@/src/db/portfolio-brain";
import {
  getPortfolioRecommendations,
  type PortfolioRecommendation,
} from "@/src/db/portfolio-recommendations";

export function GET(
  request: Request,
): NextResponse<PublicPortfolio | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const portfolio = getPortfolio(parsed.asOf);
  return NextResponse.json(toPublicPortfolio(portfolio, publicDailyReview(portfolio, parsed.asOf)));
}

const assetClasses: AssetClass[] = ["equity", "crypto", "defi", "cash"];

export async function POST(request: Request): Promise<NextResponse<PublicPortfolio | { error: string }>> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseManualHoldingBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  addManualHolding(parsed.input);
  const portfolio = getPortfolio();
  return NextResponse.json(toPublicPortfolio(portfolio, publicDailyReview(portfolio, null)));
}

function publicDailyReview(portfolio: PortfolioJson, asOf: AsOfFilter | null): PublicPortfolioDailyReview {
  const recommendations = getPortfolioRecommendations(asOf, 5).map(publicPortfolioRecommendation);

  if (asOf) {
    return {
      source_label: "Replay view",
      portfolio_brain_status: "replay",
      freshness_label: `Replaying portfolio as of ${asOf.iso}`,
      read_only: true,
      synced_at: null,
      as_of: asOf.iso,
      data_boundary:
        "Review prompt only. This replay cannot place brokerage trades, sign transactions, or move funds.",
      recommendations,
    };
  }

  const brain = getPortfolioBrainState();
  const hasSnapshot = brain.status !== "not_synced";
  const scanContext = getPortfolioBrainScanContext();
  return {
    source_label: hasSnapshot ? `${brain.source_label} snapshot` : scanContext.source_label,
    portfolio_brain_status: hasSnapshot ? brain.status : scanContext.status,
    freshness_label: hasSnapshot
      ? brain.freshness.label
      : publicActiveSourceFreshness(scanContext),
    read_only: true,
    synced_at: hasSnapshot ? brain.latest_snapshot?.synced_at ?? null : scanContext.synced_at,
    as_of: hasSnapshot ? brain.latest_snapshot?.as_of ?? portfolio.provenance.as_of : scanContext.as_of ?? portfolio.provenance.as_of,
    data_boundary: scanContext.data_boundary,
    recommendations,
  };
}

function publicPortfolioRecommendation(recommendation: PortfolioRecommendation): PublicPortfolioRecommendation {
  return {
    id: recommendation.id,
    symbol: recommendation.symbol,
    classification: recommendation.classification,
    title: recommendation.title,
    detail: recommendation.detail,
    reason: recommendation.reason,
    href: recommendation.href,
    source_label: recommendation.source_label,
    portfolio_share: recommendation.portfolio_weight_pct,
    value: recommendation.market_value,
    confidence: recommendation.confidence,
    data_boundary: recommendation.data_boundary,
  };
}

function publicActiveSourceFreshness(context: ReturnType<typeof getPortfolioBrainScanContext>) {
  if (context.status === "manual") return `Manual holdings entered locally; ${context.holdings_count} visible holding${context.holdings_count === 1 ? "" : "s"}.`;
  if (context.status === "imported") return `Imported holdings snapshot; ${context.holdings_count} visible holding${context.holdings_count === 1 ? "" : "s"}.`;
  if (context.status === "stale" && context.source_label === "Imported holdings") return "Imported holdings snapshot is stale; import or sync again before relying on balances.";
  if (context.status === "sample") return "Sample fallback only until Settings adds manual holdings or a read-only snapshot.";
  return "No Monarch sync yet; review prompts use the visible portfolio.";
}

function parseManualHoldingBody(body: Record<string, unknown> | null):
  | {
      ok: true;
      input: {
        symbol: string;
        asset_name: string;
        asset_class: AssetClass;
        venue: string;
        quantity: number;
        price: number;
        cost_basis?: number;
        daily_change_pct?: number;
      };
    }
  | { ok: false; error: string } {
  if (!body) return { ok: false, error: "Enter a holding first." };
  const symbol = stringValue(body.symbol).toUpperCase();
  const assetName = stringValue(body.asset_name) || symbol;
  const assetClass = stringValue(body.asset_class) as AssetClass;
  const venue = stringValue(body.venue) || "Manual";
  const quantity = numberValue(body.quantity);
  const price = numberValue(body.price);
  const costBasis = optionalNumberValue(body.cost_basis);
  const dailyChangePct = optionalNumberValue(body.daily_change_pct);

  if (!symbol || symbol.length > 12) return { ok: false, error: "Use a short symbol, like NVDA or BTC." };
  if (!assetClasses.includes(assetClass)) return { ok: false, error: "Choose an asset type." };
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: "Quantity must be greater than zero." };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "Price must be greater than zero." };
  if (costBasis !== undefined && costBasis < 0) return { ok: false, error: "Paid amount cannot be negative." };
  if (dailyChangePct !== undefined && Math.abs(dailyChangePct) > 100) {
    return { ok: false, error: "Daily change must be between -100% and 100%." };
  }

  return {
    ok: true,
    input: {
      symbol,
      asset_name: assetName,
      asset_class: assetClass,
      venue,
      quantity,
      price,
      cost_basis: costBasis,
      daily_change_pct: dailyChangePct,
    },
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

function optionalNumberValue(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

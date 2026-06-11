import { NextResponse } from "next/server";
import { toPublicPortfolio, type PublicPortfolio } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import {
  addManualHolding,
  getPortfolio,
  type AssetClass,
} from "@/src/db/portfolio";

export function GET(
  request: Request,
): NextResponse<PublicPortfolio | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(toPublicPortfolio(getPortfolio(parsed.asOf)));
}

const assetClasses: AssetClass[] = ["equity", "crypto", "defi", "cash"];

export async function POST(request: Request): Promise<NextResponse<PublicPortfolio | { error: string }>> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseManualHoldingBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  addManualHolding(parsed.input);
  return NextResponse.json(toPublicPortfolio(getPortfolio()));
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

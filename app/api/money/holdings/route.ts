import { NextResponse } from "next/server";
import { addManualHolding, type AssetClass } from "@/src/db/portfolio";
import { parseHoldingPatch, updateHolding } from "@/src/db/money";

const assetClasses: AssetClass[] = ["equity", "crypto", "defi", "cash"];

/** Add one holding (optionally into an account, with a real cost basis). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : "";
  const assetClass = body?.asset_class as AssetClass;
  const quantity = Number(body?.quantity);
  const price = assetClass === "cash" && (body?.price === undefined || body?.price === "") ? 1 : Number(body?.price);
  if (!symbol) return NextResponse.json({ error: "Enter a symbol." }, { status: 422 });
  if (!assetClasses.includes(assetClass)) return NextResponse.json({ error: "Choose an asset class." }, { status: 422 });
  if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "Amount must be more than zero." }, { status: 422 });
  if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "Price must be more than zero." }, { status: 422 });
  const created = addManualHolding({
    symbol,
    asset_name: typeof body?.asset_name === "string" ? body.asset_name : "",
    asset_class: assetClass,
    venue: typeof body?.venue === "string" ? body.venue : "",
    quantity,
    price,
  });
  const extra = parseHoldingPatch({
    account_id: body?.account_id ?? undefined,
    cost_basis: body?.cost_basis === undefined || body?.cost_basis === "" ? null : body.cost_basis,
  });
  if (!extra.ok) return NextResponse.json({ error: extra.error }, { status: 422 });
  const result = updateHolding(created.id, extra.patch);
  return NextResponse.json({ holding: result?.after ?? null });
}

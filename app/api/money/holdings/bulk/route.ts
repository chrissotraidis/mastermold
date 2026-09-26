import { NextResponse } from "next/server";
import { bulkUpdateHoldings, parseHoldingPatch } from "@/src/db/money";

/** { ids, delete: true } or { ids, patch: { account_id | asset_class } } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Select at least one holding." }, { status: 422 });
  if (body?.delete === true) return NextResponse.json(bulkUpdateHoldings(ids, { delete: true }));
  const parsed = parseHoldingPatch(body?.patch);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  return NextResponse.json(bulkUpdateHoldings(ids, { patch: parsed.patch }));
}

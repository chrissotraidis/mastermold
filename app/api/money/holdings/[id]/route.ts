import { NextResponse } from "next/server";
import { bulkUpdateHoldings, parseHoldingPatch, updateHolding } from "@/src/db/money";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = parseHoldingPatch(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const result = updateHolding(id, parsed.patch);
  if (!result) return NextResponse.json({ error: "Only manual holdings can be edited here." }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const result = bulkUpdateHoldings([id], { delete: true });
  if (result.affected === 0) return NextResponse.json({ error: "Holding not found." }, { status: 404 });
  return NextResponse.json(result);
}

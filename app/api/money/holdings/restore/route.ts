import { NextResponse } from "next/server";
import { restoreBook, restoreHoldings } from "@/src/db/money";

/** Undo. mode "rows" puts rows back by id; mode "book" replaces the whole book. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ error: "Nothing to restore." }, { status: 422 });
  const restored = body?.mode === "book" ? restoreBook(rows) : restoreHoldings(rows);
  return NextResponse.json({ restored });
}

import { NextResponse } from "next/server";
import { parseAsOf } from "@/src/db/bitemporal";
import { getPaper, type PaperJson } from "@/src/db/paper";

export function GET(
  request: Request,
): NextResponse<PaperJson | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(getPaper(parsed.asOf));
}

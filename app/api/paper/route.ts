import { NextResponse } from "next/server";
import { toPublicPaper, type PublicPaper } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getPaper } from "@/src/db/paper";

export function GET(
  request: Request,
): NextResponse<PublicPaper | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(toPublicPaper(getPaper(parsed.asOf)));
}

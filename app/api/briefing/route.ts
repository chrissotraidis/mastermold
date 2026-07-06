import { NextResponse } from "next/server";
import { toPublicBriefingCard, type PublicBriefingCard } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getBriefingCards } from "@/src/db/briefing";

export function GET(
  request: Request,
): NextResponse<PublicBriefingCard[] | { error: string }> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  return NextResponse.json(getBriefingCards(parsed.asOf).map(toPublicBriefingCard));
}

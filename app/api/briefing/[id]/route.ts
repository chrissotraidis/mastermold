import { NextResponse } from "next/server";
import { toPublicBriefingDetail, type PublicBriefingDetail } from "@/lib/public-api-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getBriefingCardById } from "@/src/db/briefing";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<PublicBriefingDetail | { error: string }>> {
  const parsed = parseAsOf(new URL(request.url).searchParams.get("as_of"));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const { id } = await context.params;
  const briefingCard = getBriefingCardById(id, parsed.asOf);

  if (!briefingCard) {
    return NextResponse.json({ error: "Briefing card not found" }, { status: 404 });
  }

  return NextResponse.json(toPublicBriefingDetail(briefingCard));
}

import { NextResponse } from "next/server";
import { getBriefingCardById, type BriefingDetailJson } from "@/src/db/briefing";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse<BriefingDetailJson | { error: string }>> {
  const { id } = await context.params;
  const briefingCard = getBriefingCardById(id);

  if (!briefingCard) {
    return NextResponse.json({ error: "Briefing card not found" }, { status: 404 });
  }

  return NextResponse.json(briefingCard);
}

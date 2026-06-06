import { NextResponse } from "next/server";
import { getBriefingCards, type BriefingCardJson } from "@/src/db/briefing";

export function GET(): NextResponse<BriefingCardJson[]> {
  return NextResponse.json(getBriefingCards());
}

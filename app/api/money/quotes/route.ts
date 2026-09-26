import { NextResponse } from "next/server";
import { refreshHoldingQuotes } from "@/src/db/money-quotes";

export async function POST() {
  return NextResponse.json(await refreshHoldingQuotes());
}

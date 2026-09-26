import { NextResponse } from "next/server";
import { getMoneySummary } from "@/src/db/money";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getMoneySummary());
}

import { NextResponse } from "next/server";
import { getAlerts, type AlertJson } from "@/src/db/alerts";

export function GET(): NextResponse<AlertJson[]> {
  return NextResponse.json(getAlerts());
}

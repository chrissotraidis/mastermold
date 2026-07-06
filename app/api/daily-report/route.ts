import { NextResponse } from "next/server";
import { getLatestDailyReport, runDailyReportRefresh } from "@/src/db/daily-report";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    report: getLatestDailyReport(),
  });
}

export async function POST() {
  const result = await runDailyReportRefresh();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

import { NextResponse } from "next/server";
import { getLatestDailyReport } from "@/src/db/daily-report";
import {
  getTodayDecisionResponses,
  recordTodayDecisionResponse,
  todayDecisionInbox,
  type TodayDecisionResponseKind,
} from "@/src/db/today-decisions";

export function GET() {
  const report = getLatestDailyReport();
  if (!report) return NextResponse.json({ report_id: null, responses: [] });
  return NextResponse.json({
    report_id: report.id,
    responses: [...getTodayDecisionResponses(report.id).values()],
  });
}

export async function POST(request: Request) {
  let body: { report_id?: unknown; play_id?: unknown; response?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const report = getLatestDailyReport();
  if (!report || body.report_id !== report.id) {
    return NextResponse.json({ error: "Refresh Today before recording this response." }, { status: 409 });
  }
  const play = todayDecisionInbox(report).find((candidate) => candidate.id === body.play_id);
  if (!play) return NextResponse.json({ error: "That play is not in the current decision inbox." }, { status: 404 });
  if (!isResponse(body.response)) {
    return NextResponse.json({ error: "Response must be save, watch, or pass." }, { status: 422 });
  }

  try {
    return NextResponse.json(recordTodayDecisionResponse({ report, play, response: body.response }), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record the response." },
      { status: 422 },
    );
  }
}

function isResponse(value: unknown): value is TodayDecisionResponseKind {
  return value === "save" || value === "watch" || value === "pass";
}

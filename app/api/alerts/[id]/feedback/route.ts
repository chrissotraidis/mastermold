import { NextResponse } from "next/server";
import { saveAlertFeedback, type AlertJson, type UsefulFeedback } from "@/src/db/alerts";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type FeedbackRequest = {
  useful_feedback?: unknown;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<AlertJson | { error: string }>> {
  const { id } = await context.params;
  let body: FeedbackRequest;

  try {
    body = (await request.json()) as FeedbackRequest;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const usefulFeedback = normalizeUsefulFeedback(body.useful_feedback);

  if (usefulFeedback === undefined) {
    return NextResponse.json(
      { error: "useful_feedback must be true, false, or null" },
      { status: 422 },
    );
  }

  const alert = saveAlertFeedback(id, usefulFeedback);

  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  return NextResponse.json(alert);
}

function normalizeUsefulFeedback(value: unknown): UsefulFeedback | undefined {
  if (typeof value === "boolean" || value === null) {
    return value;
  }

  return undefined;
}

import { NextResponse } from "next/server";
import { toPublicAlert, type PublicAlert } from "@/lib/public-api-copy";
import { saveAlertFeedback, type UsefulFeedback } from "@/src/db/alerts";
import { recordProductMetric } from "@/src/db/metrics";

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
): Promise<NextResponse<PublicAlert | { error: string }>> {
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

  recordProductMetric({
    event: "alert_feedback",
    surface: "alerts",
    entity_id: alert.id,
    metadata: { tier: alert.tier, signal: alert.signal ?? null, useful: usefulFeedback },
  });

  return NextResponse.json(toPublicAlert(alert));
}

function normalizeUsefulFeedback(value: unknown): UsefulFeedback | undefined {
  if (typeof value === "boolean" || value === null) {
    return value;
  }

  return undefined;
}

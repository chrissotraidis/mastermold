import { NextResponse } from "next/server";
import { toPublicAlert, type PublicAlert } from "@/lib/public-api-copy";
import { setAlertAcknowledged } from "@/src/db/alerts";
import { recordProductMetric } from "@/src/db/metrics";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<PublicAlert | { error: string }>> {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { acknowledged?: unknown } | null;
  const acknowledged = typeof body?.acknowledged === "boolean" ? body.acknowledged : true;
  const alert = setAlertAcknowledged(id, acknowledged);

  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  recordProductMetric({
    event: acknowledged ? "alert_acknowledged" : "alert_reopened",
    surface: "alerts",
    entity_id: alert.id,
    metadata: { tier: alert.tier, signal: alert.signal ?? null },
  });

  return NextResponse.json(toPublicAlert(alert));
}

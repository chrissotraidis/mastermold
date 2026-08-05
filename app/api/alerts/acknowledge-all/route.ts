import { NextResponse } from "next/server";
import { toPublicAlert, type PublicAlert } from "@/lib/public-api-copy";
import { acknowledgeAllAlerts } from "@/src/db/alerts";
import { recordProductMetric } from "@/src/db/metrics";

export function PATCH(): NextResponse<{ cleared: number; alerts: PublicAlert[] }> {
  const { cleared, alerts } = acknowledgeAllAlerts();

  if (cleared > 0) {
    recordProductMetric({
      event: "alerts_cleared_all",
      surface: "alerts",
      entity_id: "all",
      metadata: { cleared },
    });
  }

  return NextResponse.json({ cleared, alerts: alerts.map(toPublicAlert) });
}

import { NextResponse } from "next/server";
import { toPublicProductMetricSummary, type PublicProductMetricSummary } from "@/lib/public-api-copy";
import {
  getProductMetricSummary,
  isProductMetricEvent,
  recordProductMetric,
  type ProductMetricInput,
} from "@/src/db/metrics";

type MetricRequest = {
  event?: unknown;
  surface?: unknown;
  entity_id?: unknown;
  value?: unknown;
  metadata?: unknown;
};

export function GET(): NextResponse<PublicProductMetricSummary> {
  return NextResponse.json(toPublicProductMetricSummary(getProductMetricSummary()));
}

export async function POST(
  request: Request,
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  let body: MetricRequest;

  try {
    body = (await request.json()) as MetricRequest;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  if (typeof body.event !== "string" || !isProductMetricEvent(body.event)) {
    return NextResponse.json({ error: "Unknown metric event" }, { status: 422 });
  }

  const input: ProductMetricInput = {
    event: body.event,
    surface: typeof body.surface === "string" ? body.surface : undefined,
    entity_id: typeof body.entity_id === "string" ? body.entity_id : null,
    value: typeof body.value === "number" ? body.value : null,
    metadata:
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined,
  };

  recordProductMetric(input);
  return NextResponse.json({ ok: true }, { status: 201 });
}

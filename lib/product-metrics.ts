"use client";

import type { ProductMetricEvent } from "@/src/db/metrics";

type MetricPayload = {
  event: ProductMetricEvent;
  surface?: string;
  entity_id?: string | null;
  value?: number | null;
  metadata?: Record<string, unknown>;
};

export function recordProductEvent(payload: MetricPayload) {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/metrics", blob)) {
      return;
    }
  }

  void fetch("/api/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Metrics must never interrupt the decision workflow.
  });
}

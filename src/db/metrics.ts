import { getJournal } from "./journal";
import { store, type ProductMetricEventRow } from "./store";

export type ProductMetricEvent =
  | "today_read_time"
  | "briefing_opened"
  | "briefing_feedback"
  | "chat_sent"
  | "chat_followup_clicked"
  | "alert_acknowledged"
  | "alert_reopened"
  | "alert_feedback"
  | "decision_logged"
  | "calibration_outcome"
  | "brain_schedule_config"
  | "brain_schedule_check"
  | "forward_measurement_started"
  | "forward_trial_started"
  | "portfolio_import";

export type ProductMetricInput = {
  event: ProductMetricEvent;
  surface?: string;
  entity_id?: string | null;
  value?: number | null;
  metadata?: Record<string, unknown>;
};

export type ProductMetricSummary = {
  events: ProductMetricEventRow[];
  counts: Record<ProductMetricEvent, number>;
  briefing_opens: number;
  briefing_feedback: {
    useful: number;
    not_useful: number;
    usefulness_rate: number | null;
  };
  chat_followups: number;
  decisions_logged: number;
  alert_feedback: {
    useful: number;
    not_useful: number;
    precision_rate: number | null;
    fatigue_rate: number | null;
  };
  calibration_outcomes: {
    resolved: number;
    buckets: number;
    mean_hit_rate: number | null;
    mean_abs_error: number | null;
    within_confidence_band: boolean | null;
  };
  median_today_read_seconds: number | null;
  today_read_target: {
    target_seconds: number;
    met: boolean | null;
  };
};

const knownEvents: ProductMetricEvent[] = [
  "today_read_time",
  "briefing_opened",
  "briefing_feedback",
  "chat_sent",
  "chat_followup_clicked",
  "alert_acknowledged",
  "alert_reopened",
  "alert_feedback",
  "decision_logged",
  "calibration_outcome",
  "brain_schedule_config",
  "brain_schedule_check",
  "forward_measurement_started",
  "forward_trial_started",
  "portfolio_import",
];

export function recordProductMetric(input: ProductMetricInput): ProductMetricEventRow {
  const now = new Date().toISOString();
  const row: ProductMetricEventRow = {
    id: `metric_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    event: input.event,
    surface: cleanText(input.surface) || "app",
    entity_id: cleanText(input.entity_id) || null,
    value: typeof input.value === "number" && Number.isFinite(input.value) ? input.value : null,
    metadata: sanitizeMetadata(input.metadata),
    created_at: now,
  };

  store().recordProductEvent(row);
  return row;
}

export function getProductMetricSummary(limit = 500): ProductMetricSummary {
  const events = store().productEvents(limit);
  const journal = getJournal();
  const counts = Object.fromEntries(knownEvents.map((event) => [event, 0])) as Record<
    ProductMetricEvent,
    number
  >;

  for (const event of events) {
    if (isProductMetricEvent(event.event)) {
      counts[event.event] += 1;
    }
  }

  const readTimes = events
    .filter((event) => event.event === "today_read_time" && typeof event.value === "number")
    .map((event) => event.value as number)
    .sort((a, b) => a - b);
  const usefulAlerts = events.filter(
    (event) => event.event === "alert_feedback" && feedbackWasUseful(event),
  ).length;
  const notUsefulAlerts = events.filter(
    (event) => event.event === "alert_feedback" && feedbackWasUseful(event) === false,
  ).length;
  const alertFeedbackTotal = usefulAlerts + notUsefulAlerts;
  const usefulBriefings = events.filter(
    (event) => event.event === "briefing_feedback" && feedbackWasUseful(event),
  ).length;
  const notUsefulBriefings = events.filter(
    (event) => event.event === "briefing_feedback" && feedbackWasUseful(event) === false,
  ).length;
  const briefingFeedbackTotal = usefulBriefings + notUsefulBriefings;
  const medianTodayReadSeconds = median(readTimes);
  const calibrationError = weightedCalibrationError(journal.calibration);

  return {
    events,
    counts,
    briefing_opens: counts.briefing_opened,
    briefing_feedback: {
      useful: usefulBriefings,
      not_useful: notUsefulBriefings,
      usefulness_rate:
        briefingFeedbackTotal > 0 ? round(usefulBriefings / briefingFeedbackTotal, 3) : null,
    },
    chat_followups: counts.chat_followup_clicked,
    decisions_logged: counts.decision_logged,
    alert_feedback: {
      useful: usefulAlerts,
      not_useful: notUsefulAlerts,
      precision_rate: alertFeedbackTotal > 0 ? round(usefulAlerts / alertFeedbackTotal, 3) : null,
      fatigue_rate: alertFeedbackTotal > 0 ? round(notUsefulAlerts / alertFeedbackTotal, 3) : null,
    },
    calibration_outcomes: {
      resolved: journal.outcome_scores.length,
      buckets: journal.calibration.length,
      mean_hit_rate: mean(
        journal.calibration
          .map((bucket) => bucket.hit_rate)
          .filter((value): value is number => typeof value === "number"),
      ),
      mean_abs_error: calibrationError,
      within_confidence_band: calibrationError === null ? null : calibrationError <= 0.2,
    },
    median_today_read_seconds: medianTodayReadSeconds,
    today_read_target: {
      target_seconds: 300,
      met: medianTodayReadSeconds === null ? null : medianTodayReadSeconds <= 300,
    },
  };
}

export function isProductMetricEvent(value: string): value is ProductMetricEvent {
  return knownEvents.includes(value as ProductMetricEvent);
}

function feedbackWasUseful(event: ProductMetricEventRow) {
  if (!event.metadata || typeof event.metadata !== "object") return null;
  const useful = (event.metadata as { useful?: unknown }).useful;
  return typeof useful === "boolean" ? useful : null;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[mid];
  return Math.round(((values[mid - 1] + values[mid]) / 2) * 10) / 10;
}

function mean(values: number[]) {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 3);
}

function round(value: number, places: number) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function weightedCalibrationError(
  buckets: Array<{ conviction: number; hit_rate: number | null; resolved_count: number }>,
) {
  const resolved = buckets.filter(
    (bucket) => typeof bucket.hit_rate === "number" && bucket.resolved_count > 0,
  );
  const total = resolved.reduce((sum, bucket) => sum + bucket.resolved_count, 0);
  if (total === 0) return null;
  const weightedError = resolved.reduce(
    (sum, bucket) =>
      sum + Math.abs((bucket.hit_rate as number) - bucket.conviction / 10) * bucket.resolved_count,
    0,
  );
  return round(weightedError / total, 3);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

function sanitizeMetadata(value: ProductMetricInput["metadata"]) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key.slice(0, 60), sanitizeValue(item)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 240);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(sanitizeValue);
  return String(value).slice(0, 240);
}

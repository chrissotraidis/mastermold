import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  __resetWeatherResearchForTests,
  weatherResearchStore,
} from "@/src/polymarket/weather-research";

let scratch: string | null = null;

afterEach(() => {
  __resetWeatherResearchForTests();
  delete process.env.POLYMARKET_WEATHER_DB;
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

describe("Polymarket weather evidence store", () => {
  test("deduplicates immutable snapshots and excludes partial-provenance runs", () => {
    const store = isolatedStore();
    const rule = fixtureRule("event-1", "2026-01-01");
    const fingerprint = store.recordRule(rule);
    store.recordRule({ ...rule, captured_at: "2026-01-02T00:00:00.000Z" });
    store.recordRule({ ...rule, buckets: rule.buckets.map((bucket) => ({ ...bucket, market_yes_price: 0.99 })) });
    const forecast = {
      event_id: "event-1",
      rule_fingerprint: fingerprint,
      retrieved_at: "2025-12-30T00:00:00.000Z",
      target_date: "2026-01-01",
      temperature_kind: "maximum" as const,
      station_code: "KORD",
      latitude: 41.98,
      longitude: -87.9,
      elevation_m: 204,
      timezone: "America/Chicago",
      provider: "test",
      model: "test-ensemble",
      model_run_at: null,
      provenance_status: "partial" as const,
      member_values_celsius: [1, 2, 3],
      buckets: rule.buckets,
      source_payload_sha256: "partial-source",
    };
    store.recordForecast(forecast);
    store.recordForecast({ ...forecast, retrieved_at: "2025-12-30T00:05:00.000Z", source_payload_sha256: "poll-noise-changed" });
    const resolution = {
      event_id: "event-1",
      target_date: "2026-01-01",
      temperature_kind: "maximum" as const,
      station_code: "KORD",
      winning_market_id: "event-1-mid",
      winning_label: "2°C",
      exact_value_celsius: 2,
      resolved_at: "2026-01-02T00:00:00.000Z",
      retrieved_at: "2026-01-02T01:00:00.000Z",
      source: "test-final",
      source_payload_sha256: "resolution-source",
    };
    store.recordResolution(resolution);
    store.recordResolution({ ...resolution, retrieved_at: "2026-01-02T02:00:00.000Z", source_payload_sha256: "resolution-poll-noise" });

    const report = store.report();
    expect(report.counts.rule_snapshots).toBe(1);
    expect(report.counts.forecast_runs).toBe(1);
    expect(report.counts.partial_forecast_runs).toBe(1);
    expect(report.counts.aligned_complete_cases).toBe(0);
    expect(report.status).toBe("insufficient");
  });

  test("scores climatology, raw members, and simple EMOS with prior cases only", () => {
    const store = isolatedStore();
    const start = Date.UTC(2025, 0, 1);
    for (let index = 0; index < 50; index += 1) {
      const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
      const eventId = `event-${index}`;
      const outcome = 8 + (index % 9);
      const rule = fixtureRule(eventId, date, outcome);
      const ruleFingerprint = store.recordRule(rule);
      store.recordForecast({
        event_id: eventId,
        rule_fingerprint: ruleFingerprint,
        retrieved_at: new Date(start + index * 86_400_000 - 36 * 60 * 60_000).toISOString(),
        target_date: date,
        temperature_kind: "maximum",
        station_code: "KORD",
        latitude: 41.98,
        longitude: -87.9,
        elevation_m: 204,
        timezone: "America/Chicago",
        provider: "test",
        model: "identified-test-ensemble",
        model_run_at: new Date(start + index * 86_400_000 - 48 * 60 * 60_000).toISOString(),
        provenance_status: "complete",
        member_values_celsius: [-0.6, 0, 0.5, 1, 1.4].map((offset) => outcome + 2 + offset),
        buckets: rule.buckets,
        source_payload_sha256: `forecast-${index}`,
      });
      store.recordResolution({
        event_id: eventId,
        target_date: date,
        temperature_kind: "maximum",
        station_code: "KORD",
        winning_market_id: `${eventId}-mid`,
        winning_label: `${outcome}°C`,
        exact_value_celsius: outcome,
        resolved_at: new Date(start + (index + 1) * 86_400_000).toISOString(),
        retrieved_at: new Date(start + (index + 2) * 86_400_000).toISOString(),
        source: "test-final",
        source_payload_sha256: `resolution-${index}`,
      });
    }

    const report = store.report();
    expect(report.counts.aligned_complete_cases).toBe(50);
    expect(report.counts.heldout_cases).toBe(30);
    expect(report.models.climatology.evaluated_cases).toBe(30);
    expect(report.models.raw_ensemble.mean_crps_celsius).not.toBeNull();
    expect(report.models.simple_emos.mean_crps_celsius).toBeLessThan(report.models.raw_ensemble.mean_crps_celsius as number);
    expect(report.evidence_gate.passed).toBe(false);
  });
});

function isolatedStore() {
  scratch = mkdtempSync(join(tmpdir(), "mastermold-weather-test-"));
  process.env.POLYMARKET_WEATHER_DB = join(scratch, "weather.db");
  return weatherResearchStore();
}

function fixtureRule(eventId: string, targetDate: string, center = 2) {
  return {
    event_id: eventId,
    event_slug: eventId,
    event_title: `Highest temperature at O'Hare on ${targetDate}?`,
    target_date: targetDate,
    temperature_kind: "maximum" as const,
    resolution_source: "https://www.wunderground.com/history/daily/us/il/chicago/KORD",
    station_code: "KORD",
    station_name: "Chicago O'Hare",
    latitude: 41.98,
    longitude: -87.9,
    elevation_m: 204,
    timezone: "America/Chicago",
    rules_status: "auditable" as const,
    rules_detail: "Synthetic test fixture.",
    buckets: [
      { market_id: `${eventId}-low`, label: `${center - 1}°C or below`, market_yes_price: 0.2 },
      { market_id: `${eventId}-mid`, label: `${center}°C`, market_yes_price: 0.6 },
      { market_id: `${eventId}-high`, label: `${center + 1}°C or above`, market_yes_price: 0.2 },
    ],
  };
}

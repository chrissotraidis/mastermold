import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FEE_FREE, type FeeSchedule } from "@/src/polymarket/fees";
import {
  __resetForecastRevisionForTests,
  bucketIndex,
  controlTarget,
  forecastRevisionStore,
  isDayAhead,
  localExtreme,
  paperFill,
  parseBucketRange,
  parseP7Event,
  revisionTarget,
  runForecastRevisionCycle,
  safeForecastRevisionReport,
  summarizeP7Cases,
  type P7CaseRecord,
} from "@/src/polymarket/forecast-revision";
import { priceAsOf, replayFill, replayLag } from "@/src/polymarket/forecast-revision-replay";
import type { PolymarketOrderBook } from "@/src/polymarket/orderbook";
import { parseWeatherEvent } from "@/src/polymarket/weather";

const WEATHER_FEE: FeeSchedule = { rate: 0.05, exponent: 1, taker_only: true, rebate_rate: 0.25, fee_type: null, known: true };
const realFetch = globalThis.fetch;
let scratch: string | null = null;

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetForecastRevisionForTests();
  delete process.env.POLYMARKET_P7_DB;
  delete process.env.POLYMARKET_P7;
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

describe("P7 market parsing", () => {
  test("reads NOAA Fahrenheit ranges and Wunderground Celsius buckets, rejects unsupported sources", () => {
    const nyc = parseP7Event(gammaEvent("nyc", "Highest temperature in NYC on October 11?", "https://www.weather.gov/wrh/timeseries?site=klga",
      ["59°F or below", "60-61°F", "62-63°F", "64-65°F", "66-67°F", "68-69°F", "70-71°F", "72°F or higher"]));
    expect(nyc?.station_code).toBe("KLGA");
    expect(nyc?.unit).toBe("F");
    expect(nyc?.kind).toBe("maximum");
    expect(nyc?.buckets[1]).toMatchObject({ label: "60-61°F", lo: 60, hi: 61, yes_token_id: "nyc-1-yes" });
    expect(nyc?.buckets[1].fee.rate).toBe(0.05);

    const munich = parseP7Event(gammaEvent("mun", "Lowest temperature in Munich on October 11?", "https://www.wunderground.com/history/daily/de/munich/EDDM",
      ["-2°C or below", "-1°C", "0°C", "1°C or higher"]));
    expect(munich?.kind).toBe("minimum");
    expect(munich?.buckets.map((bucket) => [bucket.lo, bucket.hi])).toEqual([[-Infinity, -2], [-1, -1], [0, 0], [1, Infinity]]);

    expect(parseP7Event(gammaEvent("hk", "Lowest temperature in Hong Kong on October 11?", "https://www.weather.gov.hk/en/cis/climat.htm", ["24°C", "25°C"]))).toBeNull();
    expect(parseBucketRange("-5--4°C")).toEqual({ lo: -5, hi: -4, unit: "C" });
  });

  test("the existing weather lane accepts NOAA-settled Celsius markets again", () => {
    const event = parseWeatherEvent(gammaEvent("qd", "Highest temperature in Qingdao on October 11?", "https://www.weather.gov/wrh/timeseries?site=zsqd",
      ["22°C or below", "23°C", "24°C or higher"], "recorded by NOAA at the station in degrees Celsius"));
    expect(event?.station_code).toBe("ZSQD");
    expect(event?.rules_status).toBe("auditable");
    const fahrenheit = parseWeatherEvent(gammaEvent("ny", "Highest temperature in NYC on October 11?", "https://www.weather.gov/wrh/timeseries?site=klga",
      ["59°F or below", "60-61°F", "62°F or higher"], "in degrees Fahrenheit"));
    expect(fahrenheit?.rules_status).toBe("unsupported");
  });
});

describe("P7 rule", () => {
  const london = parseP7Event(gammaEvent("lon", "Highest temperature in London on October 11?", "https://www.weather.gov/wrh/timeseries?site=eglc",
    ["14°C or below", "15°C", "16°C", "17°C", "18°C", "19°C or higher"]))!;

  test("buys one bucket toward a ≥0.5 °C revision (the 16.8 → 15.8 example)", () => {
    expect(london.buckets[bucketIndex(london, 16.8)].label).toBe("17°C");
    expect(london.buckets[revisionTarget(london, 16.8, 15.8)!].label).toBe("16°C");
    expect(london.buckets[revisionTarget(london, 16.8, 17.4)!].label).toBe("18°C");
    expect(revisionTarget(london, 16.8, 16.4)).toBeNull();
    expect(revisionTarget(london, 13.0, 12.0)).toBeNull(); // already at the bottom bucket
  });

  test("converts to Fahrenheit and steps one two-degree range", () => {
    const nyc = parseP7Event(gammaEvent("nyc", "Highest temperature in NYC on October 11?", "https://www.weather.gov/wrh/timeseries?site=klga",
      ["63°F or below", "64-65°F", "66-67°F", "68-69°F", "70°F or higher"]))!;
    // 20.0 °C = 68 °F → 68-69; 19.2 °C = 66.6 °F → step down to 66-67.
    expect(nyc.buckets[revisionTarget(nyc, 20.0, 19.2)!].label).toBe("66-67°F");
  });

  test("control picks an adjacent bucket deterministically only when nothing moved", () => {
    const first = controlTarget(london, 16.8, 16.9, "seed-a");
    expect(first).toBe(controlTarget(london, 16.8, 16.9, "seed-a"));
    expect([2, 4]).toContain(first!);
    expect(controlTarget(london, 16.8, 15.8, "seed-a")).toBeNull();
  });

  test("daily extreme uses station-local hours and refuses partial days", () => {
    const hourly = localDay("2026-10-11", 15.8);
    expect(localExtreme(hourly, "2026-10-11", "maximum")).toBe(15.8);
    expect(localExtreme(hourly, "2026-10-11", "minimum")).toBe(9.8);
    expect(localExtreme({ time: hourly.time.slice(0, 12), temperature_2m: hourly.temperature_2m.slice(0, 12) }, "2026-10-11", "maximum")).toBeNull();
    expect(isDayAhead("2026-10-11", Date.parse("2026-10-10T22:30:00Z"), 3600)).toBe(true);
    expect(isDayAhead("2026-10-11", Date.parse("2026-10-10T23:30:00Z"), 3600)).toBe(false);
  });

  test("paper fill stays inside the 5–60¢ band, fills $25 at the ask, and charges the weather fee", () => {
    const fill = paperFill(book("t", [{ price: 0.2, size: 1000 }]), WEATHER_FEE);
    expect(fill).toMatchObject({ status: "filled", avg_price: 0.2, shares: 125, cost_usd: 25 });
    if (fill.status === "filled") expect(fill.fee_usd).toBeCloseTo(125 * 0.05 * 0.2 * 0.8, 4);
    expect(paperFill(book("t", [{ price: 0.72, size: 1000 }]), WEATHER_FEE)).toMatchObject({ status: "skipped", reason: "out_of_band" });
    expect(paperFill(book("t", [{ price: 0.2, size: 20 }]), WEATHER_FEE)).toMatchObject({ status: "skipped", reason: "thin_book" });
    expect(paperFill(undefined, FEE_FREE)).toMatchObject({ status: "skipped", reason: "no_book" });
  });
});

describe("P7 summary gate", () => {
  test("stays measuring until the pre-registered sample exists", () => {
    const summary = summarizeP7Cases(syntheticCases(10, 5, 3, 0.4, 0.1));
    expect(summary.gate.status).toBe("measuring");
    expect(summary.pnl.signal_per_dollar).toBeCloseTo(0.4, 2);
  });

  test("passes only when signal beats control with a day-clustered lower bound above zero", () => {
    expect(summarizeP7Cases(syntheticCases(160, 22, 15, 0.3, -0.1)).gate.status).toBe("pass");
    expect(summarizeP7Cases(syntheticCases(160, 22, 15, -0.05, -0.1)).gate.status).toBe("fail");
  });
});

describe("P7 replay pricing", () => {
  test("prices are as-of (no look-ahead) and stale points are refused", () => {
    const history = [{ t: 1000, p: 0.2 }, { t: 1600, p: 0.3 }];
    expect(priceAsOf(history, 1_599_000)).toBe(0.2);
    expect(priceAsOf(history, 1_600_000)).toBe(0.3);
    expect(priceAsOf(history, 999_000)).toBeNull();
    expect(priceAsOf(history, 1_600_000 + 181 * 60_000)).toBeNull();
  });

  test("the hour-before offset reports how far the price already moved toward the target", () => {
    const entry = 10_000_000;
    const history = [{ t: (entry - 3_600_000) / 1000, p: 0.15 }, { t: entry / 1000, p: 0.25 }, { t: (entry + 300_000) / 1000, p: 0.3 }];
    const lag = replayLag(history, entry, 0.25);
    expect(lag[-60]).toBeCloseTo(0.1, 6);
    expect(lag[5]).toBeCloseTo(0.05, 6);
    expect(replayFill(0.25, WEATHER_FEE, 0.01)).toMatchObject({ status: "filled", avg_price: 0.26, cost_usd: 25 });
    expect(replayFill(null, WEATHER_FEE, 0.01)).toMatchObject({ status: "skipped", reason: "no_price" });
  });
});

describe("P7 live cycle", () => {
  test("detects a revision, pairs a control, snapshots the book, and grades at settlement", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mm-p7-"));
    process.env.POLYMARKET_P7_DB = join(scratch, "p7.db");
    let ask = 0.2;
    let settled = false;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.endsWith("/ncep_gfs013/static/meta.json")) return new Response("down", { status: 503 });
      if (url.pathname.endsWith("/ecmwf_ifs/static/meta.json")) {
        const init12 = Date.parse("2026-10-10T12:00:00Z") / 1000;
        return Response.json({ last_run_initialisation_time: init12, last_run_availability_time: init12 + 6.9 * 3600 });
      }
      if (url.hostname === "gamma-api.polymarket.com" && url.pathname === "/events") {
        return Response.json([
          gammaEvent("lon", "Highest temperature in London on October 11?", "https://www.weather.gov/wrh/timeseries?site=eglc", ["14°C or below", "15°C", "16°C", "17°C", "18°C", "19°C or higher"]),
          gammaEvent("nyc", "Highest temperature in NYC on October 11?", "https://www.weather.gov/wrh/timeseries?site=klga", ["63°F or below", "64-65°F", "66-67°F", "68-69°F", "70-71°F", "72°F or higher"]),
        ]);
      }
      if (url.hostname === "gamma-api.polymarket.com" && url.pathname.startsWith("/events/")) {
        const id = url.pathname.split("/").at(-1)!;
        return Response.json(id === "lon" && settled
          ? gammaEvent("lon", "Highest temperature in London on October 11?", "https://www.weather.gov/wrh/timeseries?site=eglc", ["14°C or below", "15°C", "16°C", "17°C", "18°C", "19°C or higher"], undefined, "16°C")
          : gammaEvent(id, "Highest temperature in NYC on October 11?", "https://www.weather.gov/wrh/timeseries?site=klga", ["63°F or below", "64-65°F", "66-67°F", "68-69°F", "70-71°F", "72°F or higher"]));
      }
      if (url.hostname === "aviationweather.gov") {
        const id = url.searchParams.get("ids");
        return Response.json([{ icaoId: id, site: id, lat: id === "EGLC" ? 51.5 : 40.78, lon: id === "EGLC" ? 0.05 : -73.88, elev: 5 }]);
      }
      if (url.hostname === "single-runs-api.open-meteo.com") {
        const previous = url.searchParams.get("run") === "2026-10-10T06:00";
        return Response.json([
          { utc_offset_seconds: 3600, hourly: localDay("2026-10-11", previous ? 16.8 : 15.8) },
          { utc_offset_seconds: -14400, hourly: localDay("2026-10-11", previous ? 20.0 : 20.2) },
        ]);
      }
      if (url.hostname === "clob.polymarket.com" && url.pathname === "/books") {
        const tokens = JSON.parse(String(init?.body)) as Array<{ token_id: string }>;
        return Response.json(tokens.map(({ token_id }) => ({
          asset_id: token_id, market: "c", bids: [{ price: String(ask - 0.02), size: "500" }], asks: [{ price: String(ask), size: "500" }],
          tick_size: "0.01", min_order_size: "5", neg_risk: false,
        })));
      }
      throw new Error(`unexpected fetch ${url.href}`);
    }) as typeof fetch;

    const first = await runForecastRevisionCycle(new Date("2026-10-10T19:00:00Z"));
    expect(first.action).toBe("captured");
    expect(first.detail).toContain("1 revisions, 1 paper fills, 1 matched controls");
    expect(first.detail).toContain("GFS 0.11°: Open-Meteo ncep_gfs013 metadata returned 503.");

    const store = forecastRevisionStore();
    const cases = store.db.prepare("SELECT id, arm, paired_with, target_label, status FROM p7_cases ORDER BY arm DESC").all() as Array<Record<string, string>>;
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({ arm: "signal", target_label: "16°C", status: "filled" });
    expect(cases[0].paired_with).toBe(cases[1].id);
    expect(cases[1].arm).toBe("control");
    expect(["66-67°F", "70-71°F"]).toContain(cases[1].target_label);

    // The same run is never processed twice; the +5 minute snapshot comes due.
    ask = 0.3;
    const second = await runForecastRevisionCycle(new Date("2026-10-10T19:06:00Z"));
    expect(second.action).toBe("error"); // only the GFS outage remains
    const records = store.caseRecords();
    expect(records.find((row) => row.arm === "signal")?.lag[5]).toBeCloseTo(0.1, 6);

    settled = true;
    await runForecastRevisionCycle(new Date("2026-10-12T09:00:00Z"));
    const report = safeForecastRevisionReport();
    expect(report.summary.graded_signals).toBe(1);
    expect(report.summary.pnl.signal_per_dollar).toBeCloseTo((125 - 25 - 125 * 0.05 * 0.2 * 0.8) / 25, 3);
    expect(report.runs.find((run) => run.model === "ecmwf_ifs")?.live_runs).toBe(1);
  });

  test("POLYMARKET_P7=0 makes the cycle a no-op", async () => {
    process.env.POLYMARKET_P7 = "0";
    globalThis.fetch = (async () => { throw new Error("must not fetch"); }) as unknown as typeof fetch;
    expect((await runForecastRevisionCycle()).action).toBe("idle");
  });

  test("a run first seen long after publication is stored as a baseline with no cases", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mm-p7-"));
    process.env.POLYMARKET_P7_DB = join(scratch, "p7.db");
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.endsWith("/ncep_gfs013/static/meta.json")) return new Response("down", { status: 503 });
      if (url.pathname.endsWith("/ecmwf_ifs/static/meta.json")) {
        const init12 = Date.parse("2026-10-10T12:00:00Z") / 1000;
        return Response.json({ last_run_initialisation_time: init12, last_run_availability_time: init12 + 6.9 * 3600 });
      }
      if (url.hostname === "gamma-api.polymarket.com") {
        return Response.json([gammaEvent("lon", "Highest temperature in London on October 11?", "https://www.weather.gov/wrh/timeseries?site=eglc", ["14°C or below", "15°C", "16°C", "17°C", "18°C", "19°C or higher"])]);
      }
      if (url.hostname === "aviationweather.gov") return Response.json([{ icaoId: "EGLC", site: "EGLC", lat: 51.5, lon: 0.05, elev: 5 }]);
      if (url.hostname === "single-runs-api.open-meteo.com") {
        return Response.json({ utc_offset_seconds: 3600, hourly: localDay("2026-10-11", url.searchParams.get("run") === "2026-10-10T06:00" ? 16.8 : 15.8) });
      }
      throw new Error(`unexpected fetch ${url.href}`);
    }) as typeof fetch;
    const result = await runForecastRevisionCycle(new Date("2026-10-10T22:00:00Z"));
    expect(result.detail).toContain("stored as the baseline for the next run, no cases");
    const report = safeForecastRevisionReport();
    expect(report.summary.signals).toBe(0);
    expect(report.runs.find((run) => run.model === "ecmwf_ifs")?.live_runs).toBe(0);
    expect(forecastRevisionStore().forecast("ecmwf_ifs", "2026-10-10T12:00", "EGLC", "2026-10-11", "maximum")).toBe(15.8);
  });
});

function gammaEvent(id: string, title: string, source: string, labels: string[], description = "in degrees Celsius", winner?: string) {
  return {
    id,
    slug: id,
    title,
    endDate: "2026-10-11T12:00:00Z",
    resolutionSource: source,
    description,
    markets: labels.map((label, index) => ({
      id: `${id}-${index}`,
      groupItemTitle: label,
      clobTokenIds: JSON.stringify([`${id}-${index}-yes`, `${id}-${index}-no`]),
      outcomePrices: winner === undefined ? '["0.2","0.8"]' : label === winner ? '["1","0"]' : '["0","1"]',
      feesEnabled: true,
      feeSchedule: { rate: 0.05, exponent: 1, takerOnly: true, rebateRate: 0.25 },
    })),
  };
}

function localDay(date: string, peak: number) {
  const time = Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, "0")}:00`);
  return { time, temperature_2m: time.map((_, hour) => (hour === 15 ? peak : peak - 6 + hour * 0.1)) };
}

function book(token: string, asks: Array<{ price: number; size: number }>): PolymarketOrderBook {
  return { token_id: token, condition_id: "c", timestamp_ms: 0, bids: [], asks, tick_size: 0.01, minimum_order_size: 5, neg_risk: false, last_trade_price: null };
}

/** n graded pairs spread over stations and days; each arm's P&L per $1 is fixed with a little daily noise. */
function syntheticCases(n: number, stations: number, days: number, signalPerDollar: number, controlPerDollar: number): P7CaseRecord[] {
  return Array.from({ length: n }, (_, index) => {
    const day = `2026-09-${String(1 + (index % days)).padStart(2, "0")}T10:00:00Z`;
    const noise = ((index % 3) - 1) * 0.02;
    const base = { station_code: `S${index % stations}`, detected_at: day, status: "filled" as const, skip_reason: null, cost_usd: 25, fee_known: true, lag: {} };
    return [
      { ...base, id: `s${index}`, arm: "signal" as const, outcome: "won" as const, pnl_usd: 25 * (signalPerDollar + noise) },
      { ...base, id: `c${index}`, arm: "control" as const, outcome: "lost" as const, pnl_usd: 25 * controlPerDollar },
    ];
  }).flat();
}


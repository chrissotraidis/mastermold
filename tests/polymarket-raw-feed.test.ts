import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { __resetForecastRevisionForTests, safeForecastRevisionReport } from "@/src/polymarket/forecast-revision";
import { decodeGrib2, sampleNearest } from "@/src/polymarket/grib2";
import {
  RAW_FEEDS,
  __resetRawFeedForTests,
  localDayBounds,
  parseEcmwfIndex,
  parseNomadsIndex,
  runRawFeedCycle,
  safeRawFeedReport,
  utcOffsetSeconds,
  windowSteps,
} from "@/src/polymarket/raw-feed-revision";

const FIXTURES = join(import.meta.dir, "fixtures", "grib2");
const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));
const expected = JSON.parse(readFileSync(join(FIXTURES, "expected.json"), "utf8"));
const realFetch = globalThis.fetch;
let scratch: string | null = null;

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetForecastRevisionForTests();
  __resetRawFeedForTests();
  delete process.env.POLYMARKET_P7_DB;
  delete process.env.POLYMARKET_P8;
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

describe("GRIB2 decoder (fixtures encoded by ECMWF ecCodes)", () => {
  test("CCSDS (template 5.42) and complex packing (5.3) match ecCodes exactly", () => {
    for (const name of ["ccsds", "complex"]) {
      const field = decodeGrib2(fixture(`${name}.grib2`));
      expect(field.grid).toMatchObject({ ni: 24, nj: 12, la1: 56, lo1: 354, di: 0.5, dj: 0.5 });
      const want = expected[name].values as number[];
      expect(field.values.length).toBe(want.length);
      want.forEach((value, index) => expect(Math.abs(field.values[index] - value)).toBeLessThan(1e-9));
    }
  });

  test("nearest-point sampling wraps longitude across 0°", () => {
    const field = decodeGrib2(fixture("complex.grib2"));
    // lo1 = 354° (6° W); 0.05° E is 12 columns east; 51.5° N is row 9.
    expect(sampleNearest(field, 51.5, 0.05)).toBe(field.values[9 * 24 + 12]);
    expect(() => sampleNearest(field, 10, 0)).toThrow("outside");
    expect(() => decodeGrib2(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 2]))).toThrow("Not a GRIB2");
  });
});

describe("P8 timing", () => {
  test("station-local day bounds follow daylight saving", () => {
    expect(utcOffsetSeconds("Europe/London", Date.parse("2026-10-12T12:00:00Z"))).toBe(3600);
    expect(utcOffsetSeconds("America/New_York", Date.parse("2026-10-12T12:00:00Z"))).toBe(-14400);
    const london = localDayBounds("2026-10-12", "Europe/London");
    expect(new Date(london.start).toISOString()).toBe("2026-10-11T23:00:00.000Z");
    expect(new Date(london.end).toISOString()).toBe("2026-10-12T23:00:00.000Z");
    const fallBack = localDayBounds("2026-10-25", "Europe/London"); // clocks go back: a 25-hour day
    expect((fallBack.end - fallBack.start) / 3_600_000).toBe(25);
  });

  test("GFS needs every local hour; ECMWF needs every 3-hour max/min window touching the day", () => {
    const init = Date.parse("2026-10-10T12:00:00Z");
    const { start, end } = localDayBounds("2026-10-12", "Europe/London");
    const gfs = windowSteps(RAW_FEEDS[0], init, start, end)!;
    expect([gfs[0], gfs.at(-1), gfs.length]).toEqual([35, 58, 24]);
    const ecmwf = windowSteps(RAW_FEEDS[1], init, start, end)!;
    expect([ecmwf[0], ecmwf.at(-1), ecmwf.length]).toEqual([36, 60, 9]);
    expect(windowSteps(RAW_FEEDS[0], init, init - 3_600_000, init + 3_600_000)).toBeNull(); // day began before the run
  });

  test("index files give inclusive byte ranges", () => {
    const nomads = parseNomadsIndex("580:100:d=2026101012:UGRD:2 m above ground:36 hour fcst:\n581:426285156:d=2026101012:TMP:2 m above ground:36 hour fcst:\n582:427163847:d=2026101012:SPFH:2 m above ground:36 hour fcst:\n");
    expect(nomads.get("TMP:2 m above ground")).toEqual([426285156, 427163846]);
    expect(nomads.get("SPFH:2 m above ground")).toEqual([427163847, null]);
    const ecmwf = parseEcmwfIndex('{"levtype": "sfc", "param": "mx2t3", "_offset": 2179813, "_length": 641818}\n{"levtype": "pl", "param": "t", "_offset": 1, "_length": 2}\n');
    expect(ecmwf.get("mx2t3")).toEqual([2179813, 2821630]);
    expect(ecmwf.has("t")).toBe(false);
  });
});

describe("P8 live cycle", () => {
  test("tracks a run as its hours land, pairs a control, and measures the head start over Open-Meteo", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mm-p8-"));
    process.env.POLYMARKET_P7_DB = join(scratch, "p7.db");
    let landed00z = false;
    let openMeteo: { init: string; available: string } = { init: "2026-10-10T18:00:00Z", available: "2026-10-10T23:31:00Z" };
    let ask = 0.2;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname === "data.ecmwf.int") return new Response("not yet", { status: 404 });
      if (url.hostname === "nomads.ncep.noaa.gov") {
        const run00 = url.pathname.includes("gfs.20261011/00/");
        if (run00 && !landed00z) return new Response("not yet", { status: 404 });
        if (url.pathname.endsWith(".idx")) return new Response("1:0:d=x:TMP:2 m above ground:fcst:\n2:999999:d=x:UGRD:2 m above ground:fcst:\n");
        expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-999998");
        return new Response(fixture(run00 ? "gfs-curr.grib2" : "gfs-prev.grib2"), { status: 206 });
      }
      if (url.hostname === "api.open-meteo.com" && url.pathname.endsWith("/static/meta.json")) {
        return Response.json({ last_run_initialisation_time: Date.parse(openMeteo.init) / 1000, last_run_availability_time: Date.parse(openMeteo.available) / 1000 });
      }
      if (url.hostname === "api.open-meteo.com") {
        const count = url.searchParams.get("latitude")!.split(",").length;
        return Response.json(Array.from({ length: count }, () => ({ timezone: "Europe/London" })));
      }
      if (url.hostname === "gamma-api.polymarket.com") {
        return Response.json([
          gammaEvent("lhr", "Highest temperature in London on October 12?", "EGLL", ["14°C or below", "15°C", "16°C", "17°C", "18°C", "19°C or higher"]),
          gammaEvent("lcy", "Highest temperature in London City on October 12?", "EGLC", ["17°C or below", "18°C", "19°C", "20°C", "21°C", "22°C or higher"]),
        ]);
      }
      if (url.hostname === "aviationweather.gov") {
        const id = url.searchParams.get("ids");
        return Response.json([{ icaoId: id, site: id, lat: id === "EGLL" ? 51.47 : 51.5, lon: id === "EGLL" ? -0.45 : 0.05, elev: 20 }]);
      }
      if (url.hostname === "clob.polymarket.com") {
        const tokens = JSON.parse(String(init?.body)) as Array<{ token_id: string }>;
        return Response.json(tokens.map(({ token_id }) => ({
          asset_id: token_id, market: "c", bids: [{ price: String(ask - 0.02), size: "500" }], asks: [{ price: String(ask), size: "500" }],
          tick_size: "0.01", min_order_size: "5", neg_risk: false,
        })));
      }
      throw new Error(`unexpected fetch ${url.href}`);
    }) as typeof fetch;

    // 03:00Z: the 18Z run is already out (baseline only); the 00Z run has not started landing.
    const first = await runRawFeedCycle(new Date("2026-10-11T03:00:00Z"));
    expect(first.detail).toContain("2026-10-10T18:00Z: 2 station forecasts stored as the baseline");

    // 03:50Z: the 00Z hours land. Heathrow cooled ~1 °C (signal: 16 °C); City barely moved (control).
    landed00z = true;
    const second = await runRawFeedCycle(new Date("2026-10-11T03:50:00Z"));
    expect(second.detail).toContain("2026-10-11T00:00Z: 2 station forecasts complete, 2 comparable, 1 revisions, 1 paper fills, 1 matched controls");
    let report = safeRawFeedReport();
    expect(report.summary.signals).toBe(1);
    expect(report.summary.controls_filled).toBe(1);
    expect(report.feeds[0].live_runs).toBe(1);
    expect(report.feeds[0].head_start.compared).toBe(0); // Open-Meteo has not published 00Z yet
    expect(safeForecastRevisionReport().summary.signals).toBe(0); // P7 counts only Open-Meteo cases

    // 05:40Z: Open-Meteo publishes the 00Z run at 05:31Z, 101 minutes after P8 had it; the ask is now 30¢.
    openMeteo = { init: "2026-10-11T00:00:00Z", available: "2026-10-11T05:31:00Z" };
    ask = 0.3;
    await runRawFeedCycle(new Date("2026-10-11T05:40:00Z"));
    report = safeRawFeedReport();
    expect(report.feeds[0].head_start).toMatchObject({ compared: 2, raw_first: 2, open_meteo_first: 0, median_head_start_min: 101, n_signal: 1, n_control: 1 });
    expect(report.feeds[0].head_start.signal_move_cents).toBeCloseTo(10, 6);
  });

  test("POLYMARKET_P8=0 makes the cycle a no-op", async () => {
    process.env.POLYMARKET_P8 = "0";
    globalThis.fetch = (async () => { throw new Error("must not fetch"); }) as unknown as typeof fetch;
    expect((await runRawFeedCycle()).action).toBe("idle");
  });
});

function gammaEvent(id: string, title: string, station: string, labels: string[]) {
  return {
    id,
    slug: id,
    title,
    endDate: "2026-10-12T12:00:00Z",
    resolutionSource: `https://www.weather.gov/wrh/timeseries?site=${station.toLowerCase()}`,
    description: "in degrees Celsius",
    markets: labels.map((label, index) => ({
      id: `${id}-${index}`,
      groupItemTitle: label,
      clobTokenIds: JSON.stringify([`${id}-${index}-yes`, `${id}-${index}-no`]),
      outcomePrices: '["0.2","0.8"]',
      feesEnabled: true,
      feeSchedule: { rate: 0.05, exponent: 1, takerOnly: true, rebateRate: 0.25 },
    })),
  };
}



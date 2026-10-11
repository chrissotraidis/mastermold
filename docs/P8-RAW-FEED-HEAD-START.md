# P8 — raw-feed head start

Status: **shadow only. Live trading stays locked.** Added 2026-10-11.

## Question

P7's first replay found that a forecast revision carries real information, but
that Polymarket had already priced it by the time Open-Meteo published the run.
Open-Meteo republishes the producers' data, so the edge, if any, would have to
come from reading the producers directly. P8 tests that:

> Reading GFS from NOAA NOMADS and ECMWF open data as each forecast step lands,
> does the same rule trade before Open-Meteo publishes, and does the target
> bucket's price move in between?

## Measured landing times (2026-10-10/11)

| Feed | When tomorrow's steps land | Open-Meteo, same run |
|---|---|---|
| GFS 0.25° on NOMADS | hour by hour; f000–f048 at about +3 h 32 min to +3 h 47 min | `ncep_gfs013` about +5 h 32 min |
| ECMWF open data 0.25° | the whole run at once: +7 h 34 min (00/12Z), +6 h 27 min (06/18Z) | `ecmwf_ifs` (9 km HRES) +6 h 52 min for 12Z; 18Z not out by +7 h 05 min |

So GFS should give P8 a head start of about 1 h 45 min on every run. ECMWF can
be faster or slower depending on the run, which is exactly what the live
head-start measurement records.

## What P8 records

Every minute the scheduler checks the current and previous run of each feed:

1. **Plan:** for every listed, day-ahead market, the forecast steps covering the
   station's local day (DST-aware, from the station's IANA time zone). GFS uses
   every hourly 2 m temperature inside the day; ECMWF uses every 3-hour
   `mx2t3`/`mn2t3` window that overlaps it.
2. **Watch:** a run first probed before its first step landed is *tracking*. A
   run whose steps were already out when first seen is stored as the baseline
   for the next run only (no cases).
3. **Fetch:** each landed step's index (`.idx` on NOMADS, JSON `.index` on
   ECMWF) gives the byte range of the one field needed. P8 downloads only that
   record (about 0.9 MB for GFS, 0.65 MB for ECMWF), decodes it with a native
   GRIB2 decoder (`src/polymarket/grib2.ts`: complex packing with spatial
   differencing for GFS, CCSDS/AEC for ECMWF), and samples the nearest grid point
   to every station.
4. **Decide:** once a station's whole day has landed, its daily high or low is
   compared with the previous raw run of the same feed, and P7's frozen rule
   applies unchanged: ≥0.5 °C revision → $25 paper fill at the live ask one
   bucket toward the new value (5–60¢), matched control from the same batch,
   book snapshots at 0/5/15/60 minutes, settlement grading.
5. **Compare:** when Open-Meteo publishes the same run, P8 records the head start
   (Open-Meteo availability minus P8's detection) and snapshots the target
   bucket's book again. The mean price move from P8's entry to that moment,
   signal versus control, is what a faster feed alone could earn.

Cases share P7's ledger (`.data/polymarket-forecast-revision.db`) under the
model names `gfs_nomads` and `ecmwf_open_data`; P7's report counts only its own
models. Downloads total roughly 300 MB a day. `POLYMARKET_P8=0` stops capture.
Nothing in P8 can place an order.

The decoder was checked against ECMWF ecCodes on full global fields (all
1,038,240 points identical for both packings). Small ecCodes-encoded fixtures in
`tests/fixtures/grib2/` keep that check in the test suite.

## Producer-timing replay

```bash
npm run p7:replay -- --days 7 --timing raw
```

Same replay as P7, but entries are placed when the producers publish: GFS at
3.8 h after the run starts, ECMWF at 7.57 h (00/12Z) or 6.45 h (06/18Z). Values
come from Open-Meteo's archive of the closest product (`ecmwf_ifs025` is the
same open-data grid; `ncep_gfs013` stands in for GFS 0.25°). Like P7's replay it
has no book depth, so it is optimistic and cannot pass the gate.

## Pre-registered gate (fixed before any live capture)

On P8's raw-feed fills, all of:

- ≥150 graded signal paper fills across ≥20 stations and ≥14 UTC days;
- the day-clustered 95% lower bound of (signal − matched control) net P&L per
  $1, after fees, is above zero;
- signal net P&L per $1 is positive, and stays positive with its two most
  profitable stations removed.

The head-start comparison is descriptive: it explains a pass or a fail but is
not itself a gate. Passing earns a human review of depth at raw timing,
producer-outage handling and legal eligibility. It grants no authority.

## First producer-timing replay (2026-10-11, settled markets 2026-10-04 to 2026-10-10)

613 settled markets at 48 stations, entries at producer publication plus 2
minutes, 1¢ slippage, optimistic price-history fills:

| | Signal | Matched control |
|---|---|---|
| Paper fills (graded) | 1,744 | 1,744 |
| Net per $1 after fees | −0.267 | −0.386 |
| Mean price move, hour before entry | −0.12¢ | −0.14¢ |
| Mean price move, +5 / +15 / +60 / +120 / +180 min | −0.05 / −0.02 / −0.01 / −0.11 / −0.13¢ | +0.06 / −0.09 / −0.20 / −0.31 / −0.26¢ |

Signal − control was +0.12 per $1 (day-clustered 95% lower bound +0.05, 8 days),
close to P7's Open-Meteo-timed replay (+0.10). Entering 1 h 45 min earlier on
GFS did not change the picture: the target bucket's price does not rise during
the head start, there is no move in the hour before entry either, and the rule
loses about a quarter of each dollar after costs.

Reading: the market has priced these revisions before even the public producer
feeds publish them. That fits traders using sources earlier than the public
files (licensed real-time ECMWF dissemination, other models, hourly station
observations), or revisions that mostly converge on what those sources already
showed. Live P8 keeps measuring real asks and the head start per run; nothing so
far suggests that speed on public feeds is an edge.

## Known limits

- Nearest 0.25° grid point, no elevation correction; consecutive runs share the
  bias, so it mostly cancels in the revision.
- ECMWF 3-hour windows can extend up to 3 hours past local midnight.
- Detection is at most a minute behind each poll, plus download time.
- NOMADS asks users to stay under about 120 requests a minute; P8 makes a few.

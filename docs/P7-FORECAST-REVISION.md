# P7 — weather forecast-revision lag

Status: **shadow only. Live trading stays locked.** Added 2026-10-11.

## Hypothesis

Polymarket's daily-temperature markets already price the current forecast well
(see [POLYMARKET-WEATHER-EVIDENCE](POLYMARKET-WEATHER-EVIDENCE.md)). The claim
under test is narrower: when a new model run *changes* tomorrow's station
forecast, the price takes a while to catch up. The rule comes from a public
post about the Polymarket trader @bilberry:

> When a new forecast for the next day moves tomorrow's temperature by at least
> 0.5 °C, buy the bucket one degree closer to the new forecast, between 5¢ and
> 60¢, at most $25 a trade.

Example: the previous run said 16.8 °C (so 17 °C is the favourite); the new run
says 15.8 °C; buy 16 °C.

## What P7 records

Every two minutes the scheduler reads Open-Meteo's model metadata for
**ECMWF IFS HRES** (`ecmwf_ifs`) and **GFS 0.11°** (`ncep_gfs013`). When a new run
becomes available, P7:

1. fetches that exact run (and the run before it, if missing) from the Single
   Runs API at every listed market's station coordinates, and computes the
   station-local daily high or low for each target date;
2. keeps only day-ahead events (the target date has not started at the station);
3. **signal:** the previous→new move is ≥0.5 °C → the bucket one step toward the
   new value (°F markets are converted and step one two-degree range);
4. **matched control:** from the same run, an event whose forecast moved less
   than 0.5 °C → its adjacent bucket on a hash-chosen side, under the same band,
   stake and fee rules. This separates a revision effect from a "cheap adjacent
   bucket" price-band effect;
5. **paper fill:** $25 against the live CLOB asks, only if the best ask is
   5–60¢ and the average fill stays ≤60¢, with the market's own taker fee
   (`shares × 0.05 × p × (1 − p)` for weather). Out-of-band and thin-book
   signals are recorded as skips;
6. **lag snapshots:** the target bucket's book at detection and 5, 15 and 60
   minutes later;
7. **grading:** filled cases settle from Polymarket's final outcome prices.

Detection latency (our detection minus Open-Meteo's published availability
time) is measured per run. A run first seen more than 30 minutes after it was
published (cold start or outage) is stored only as the baseline for the next
run: it creates no cases and does not count toward latency. Everything lives in
`.data/polymarket-forecast-revision.db` (`POLYMARKET_P7_DB`). It never touches the
Polymarket paper account and has no code path to an order. `POLYMARKET_P7=0`
stops capture.

## Historical replay

```bash
npm run p7:replay -- --days 14          # optional: --max-events 200 --models ecmwf_ifs --slippage 1
```

The replay rebuilds past runs from the Single Runs archive for settled markets,
assumes each run became available at the live-measured median delay (defaults:
ECMWF 6.9 h, GFS 5.5 h after start) plus two minutes of detection, and prices
entries from Polymarket's minute price history (as-of, no look-ahead, refused if
older than 3 hours) plus 1¢ slippage. It also reports how far the price had
already moved in the hour *before* entry, which shows whether faster data
sources beat Open-Meteo.

Price history has no depth, so thin books never skip a replay trade: **replay
results are optimistic.** A negative replay can falsify the idea cheaply; a
positive one only justifies live measurement. The replay cannot pass the gate.

## Pre-registered gate (fixed before any live capture)

All of:

- ≥150 graded signal paper fills across ≥20 stations and ≥14 UTC days;
- the day-clustered 95% lower bound of (signal − matched control) net P&L per
  $1, after fees, is above zero;
- signal net P&L per $1 is positive, and stays positive with its two most
  profitable stations removed.

Passing earns a human review of depth, settlement-source risk (NOAA vs
Wunderground fallback), the maker variant and legal eligibility. It grants no
paper or live authority.

## Known limits

- Hourly model output understates the true daily extreme; the bias is shared by
  consecutive runs, so it mostly cancels in the revision but not in the bucket
  choice.
- Hong Kong (HKO) and any market without an ICAO station link are skipped.
- Only listed markets are visible; markets created after a revision are missed.
- One signal per event per model run; repeated revisions of the same event are
  not independent, which is why the gate clusters by day and drops top stations.


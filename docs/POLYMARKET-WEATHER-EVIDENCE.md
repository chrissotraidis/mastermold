# Polymarket weather evidence

Master Mold's weather feature is a shadow research system. It cannot create a
paper or live order and it does not share the Polymarket simulator database.

## What is captured

The scheduler refreshes public daily-temperature events every five minutes and
writes append-only, content-addressed records to ignored local state at
`.data/polymarket-weather-research.db`:

- normalized market-rule and bucket snapshots;
- station identity, coordinates, elevation, and timezone snapshots;
- ensemble member values plus provider/model/source hashes;
- source-station observations when an exact observation importer is available;
- decisive Polymarket winning buckets and later resolution revisions.

Identical rules and forecasts are deduplicated by their material content. A
changed source record is appended; existing evidence is never updated in place.

## Honest backfill boundary

The app backfills up to 100 recent closed daily-temperature events only when
exactly one bucket has decisive final Polymarket prices. It does not fabricate
historical ensemble members from market outcomes or from a deterministic weather
archive. Threshold winners (for example, `30 C or below`) are retained as
resolutions but are not treated as exact temperatures.

Open-Meteo's current ensemble response does not provide a stable model issuance
identifier. Those live member captures are marked `partial`: useful for audit
and future source reconciliation, but excluded from calibration. A future
forecast importer may mark a run `complete` only when provider, model, issuance
time, retrieval time, target date, station/grid, units, and member values are all
known.

## Market-relative research view (added 2026-08-09)

The strict evaluator below requires complete issuance provenance that
Open-Meteo does not provide, so on its own the archive produced no decision
evidence. The `market_relative` block in the research report closes that gap:
computed over ALL runs (including partial provenance), first run per event
only, it reports first-run model-vs-market Brier, per-station ensemble-median
bias against resolved values, and the expectancy of hypothetical $1 bets on
the model's most-underpriced bucket (buckets at or below 0.1c are excluded as
unfillable). It measures the model against the market, not absolute
calibration, and grants no authority.

### First findings (4 days of capture, 14 resolved events, 2026-08-05..09)

- The ensemble median is close to truth (overall bias about -0.1 C, sd about
  1.0 C) but station biases are systematic: RJTT about +1.4 C, RKSI about
  -1.0 C, LFPB about -0.5 C. With whole-degree buckets, a half-degree bias
  moves confident probability mass into the wrong adjacent bucket.
- Raw-ensemble gap betting loses: first-run virtual bets came out about
  -0.30/$1 (n=12), and the model's first-run Brier trails the market's
  (about 0.059 vs 0.041 per-bucket-averaged). Later-in-day captures are
  worse: the market watches the live thermometer, so late "gaps" are traps,
  not edge.
- Leave-one-out mean-shift debiasing on 2-4 outcomes per station made scores
  worse — noisy bias estimates overcorrect. Debiasing needs the evidence
  volumes the gate already demands; the gate's conservatism is validated, not
  bureaucratic.
- Coverage was the binding constraint: enrichment was capped at the 4
  nearest-to-close events, concentrating the archive on late-day captures of
  a few cities. Raised to 20 events (all listed cities, including tomorrow's
  markets) with a 30-minute full-sweep throttle and cached station lookups.

Consequence for any betting ambition: weather is not a "bet and always win"
lane. The plausible path is per-station bias correction learned from weeks of
day-ahead archive, evaluated by the strict walk-forward gate below, against
markets that carry taker fees and thin books. Nothing shorter is honest.

## Offline evaluator

Only complete forecast runs aligned to exact resolved temperatures enter the
walk-forward evaluator. Each test date uses earlier cases from the same station
and maximum/minimum kind. It compares:

1. empirical station/kind climatology;
2. raw ensemble frequency;
3. simple Gaussian EMOS (linear ensemble-mean correction and non-negative
   spread/error variance fit).

The UI reports categorical Brier score and continuous CRPS. It stays
`insufficient` until there are at least 365 independent aligned outcomes and at
least 100 in every station/lead/kind cell. Passing those counts still does not
promote or authorize a strategy; stability, source-revision, dependency, cost,
and settlement audits remain separate gates.

## Local verification

```bash
bun test tests/polymarket-weather-research.test.ts tests/polymarket-hardening.test.ts
npm run typecheck
npm test
npm run build
```

Inspect `/polymarket` for the evidence counters and `/review` for the explicit
working/missing boundary. The SQLite file and WAL sidecars are runtime data and
must remain ignored; never commit them.

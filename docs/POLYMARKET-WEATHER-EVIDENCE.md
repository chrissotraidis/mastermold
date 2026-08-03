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

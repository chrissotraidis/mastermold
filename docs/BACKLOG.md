# Backlog

Known gaps and deliberately deferred work, so nothing lives only in someone's
head. Items leave this list by being built or by being rejected with a reason.

## Waiting on evidence (the system unlocks these itself)

- **xsec signal re-derivation** — calibration currently reads the hand-scored
  xsec signal as INVERTED (high scores underperform). At 150+ labeled
  snapshots, re-derive the weights from the accumulated candidate dataset via
  `npm run v3:backtest`, or retire the module in favor of trending/copy/carry.
- **Tradfi feedback into play generation** — directional plays are graded
  against 3-day outcomes (Today page shows the track record), but the grades
  don't yet influence how plays are generated. Build once enough grades exist
  to mean something.
- **Live wallet slice** — the intent → policy → executor plumbing and the
  five-check go-live gate exist; arming live requires accumulated paper
  evidence plus a deliberately provisioned spare wallet
  (`AUTOPILOT_WALLET_SECRET`). By design, no code path sets this.

## Deferred with reasons

- **X/Twitter ingestion** — the free API tier is gone and paid tiers only make
  sense above ~$10k live capital (2026-07 research). On-chain attention
  (trending radar, boosts) is the proxy until then.
- **Drift live execution for the funding-carry strategy** — the carry shadow
  book measures the edge; executing it means perps integration, a materially
  larger lift than Jupiter swaps. Revisit when the shadow P&L has weeks of
  history.
- **Authentication on the web app** — deliberately local-first; the production
  server binds 127.0.0.1 and the deployment doc mandates tunnel/proxy. Build
  real auth only if the app is ever intentionally exposed.
- **Reboot autostart on macOS** — TCC blocks launchd under `~/Documents`
  (documented in the ops/ templates); the real fix is the planned VPS
  transfer, not a workaround.

## Small knowns

- `bin/smoke_test` is Ruby (absent on minimal Linux). Tooling only — not on
  the deploy path; `npm run smoke:app` covers the same ground.
- The 3D avatar logs a deprecated `THREE.Clock` warning to the dev console.
- Alert inbox ships with sample alerts that hold the unread badge at 2 until
  acknowledged.
- Solana radar shows raw on-chain token names, which can be offensive; a
  display filter has been discussed and not built.
- Engine Python tests need `pytest` (not vendored in the engine venv) and two
  integration cases additionally need the unpublished `ref/TradingAgents`
  fork; the TS contract tests cover the bundle boundary either way.

## Fixed since first logged

- Request timeouts: SnapTrade/Coinbase/Zerion imports (20s), integration
  connection tests (15s), and chat provider connects (30s, connect phase
  only — streams stay unbounded) now all abort instead of hanging.
- Look-ahead "invalid" health wart: the engine stamped a pre-open run's
  event_time as the upcoming 13:30Z open, which the dashboard's clamp turned
  into a future knowledge stamp — hiding the morning read until the open.
  Engine now stamps `min(open, run moment)`; the dashboard pulls a violating
  run header's event time back instead of pushing knowledge forward.
- `scripts/runtime-smoke.mjs` finds bun via `node_modules/.bin` → `~/.bun/bin`
  → PATH instead of requiring it on PATH.
- Scheduler hour is overridable with `MASTERMOLD_READ_AFTER=HH:MM` (local
  time) for UTC-clocked hosts; default stays 7:15.

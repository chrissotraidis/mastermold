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

- SnapTrade import, integration-test fetches, and streaming chat providers
  have no request timeouts (user-triggered paths only; nothing on the
  autopilot hot loop).
- `bin/smoke_test` is Ruby (absent on minimal Linux); `scripts/runtime-smoke.mjs`
  spawns bare `bun` from PATH. Tooling only — not on the deploy path.
- The engine's daily run record can trip the bundle validator's look-ahead
  guard until its stamped event time passes (cosmetic "invalid" in
  /api/health for part of the day).
- The 3D avatar logs a deprecated `THREE.Clock` warning to the dev console.
- The in-app scheduler fires at 7:15 server-local time — set the host TZ on a
  UTC VPS if the wall-clock hour matters.
- Alert inbox ships with sample alerts that hold the unread badge at 2 until
  acknowledged.
- Solana radar shows raw on-chain token names, which can be offensive; a
  display filter has been discussed and not built.

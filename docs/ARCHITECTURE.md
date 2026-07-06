# Architecture

Master Mold is a local-first Next.js App Router project.

## Lanes

- **Advisory lane:** Portfolio review, daily briefing, alerts, journal, and
  chat. This lane is read-only with respect to financial accounts.
- **Autopilot lane:** Paper/autopilot domain logic with a separate local store.
  Any real-money workflow must remain explicit, locally configured, bounded,
  and reviewable.

The lanes are intentionally separate. Shared UI can read summarized state from
both lanes, but personal data and runtime state stay in ignored local stores.

## Persistence

- Advisory app store: `.data/mastermold.db` by default.
- Autopilot store: `.data/autopilot.db.json` by default, with SQLite migration
  support.
- Engine output: `engine/out/` by default.

All of those paths are ignored by git. Public fixtures live in
`data/demo-seed.json` and must remain synthetic.

## External Services

External account, model, and market-data services are optional. Credentials are
read from ignored local environment files and must never be committed.

## Public Source Rule

The source tree is safe to publish only when `npm run privacy:audit` passes.

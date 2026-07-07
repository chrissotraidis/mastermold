# Master Mold

![Master Mold banner](public/master-mold-banner.png)

Master Mold is a local-first financial copilot for reviewing a portfolio,
capturing daily notes, asking bounded questions, and experimenting with a paper
autopilot lane. The public repository ships with synthetic sample data only.
This public build is advisory; it does not place brokerage trades or move funds.

Master Mold does not include a live portfolio, brokerage account, wallet
authority, or personal account history. If you connect your own accounts or add
your own notes, that state is created locally and belongs in ignored storage
such as `.data/`, `.env.local`, `engine/.env`, or another local-only workspace.

## What Ships

- A Next.js App Router app with `/api/health`.
- Synthetic sample holdings and sample activity so the app can be reviewed
  before any account is connected.
- Read-only portfolio import surfaces for credentials you provide locally.
- Local stores under `.data/` for imported holdings, notes, reports, and other
  user-created state.
- A paper/autopilot lane that is reviewable, bounded, and advisory in this
  public build.

## Privacy Boundary

Tracked files are code, public docs, assets, tests, and synthetic sample data.

Ignored local files are where personal state belongs:

- `.data/` for app databases, imported holdings, journals, reports, and bot state.
- `.env.local` and `engine/.env` for local secrets.
- `engine/out/` for generated engine output.
- `artifacts/`, `screenshots/`, `reports/private/`, and `docs/private/` for local review material.

Before publishing, pushing, or preparing a release, run:

```bash
npm run privacy:audit
```

## Quick Start

```bash
bun install
bun run dev
```

Open the printed local URL. The app starts in sample mode and runs without
external accounts or API keys. Connecting real accounts is optional and should
use local, ignored configuration only.

Production-style `npm run start` requires Node 22.5 or newer; local development
uses Bun's built-in SQLite support.

## Optional Local Configuration

Use `.env.local` for app settings and `engine/.env` for engine settings. Start
from the example files and keep real values out of git.

```bash
cp .env.example .env.local
cd engine && cp .env.example .env
```

Common local paths:

```bash
MASTERMOLD_DB=.data/mastermold.db
AUTOPILOT_DB=.data/autopilot.db.json
ENGINE_OUT_DIR=engine/out
```

## Development

```bash
bun run typecheck
bun test tests
npm run privacy:audit
npm run smoke:app
```

`npm run smoke:app` expects a local app server to be running.

## Repository Map

```text
app/                 Next.js pages and API routes
components/          UI components
src/db/              Local app store, sample data, portfolio imports, reports
src/chat/            Chat providers, context, and bounded local actions
src/autopilot/       Paper/autopilot domain logic and local store
src/helius/          Optional provider credit firewall
engine/              Optional Python briefing engine
public/              Public app assets
scripts/             Local helper and verification scripts
tests/               Unit and source-contract tests
docs/                Public documentation only
```

## Documentation

- [Docs index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Privacy](docs/PRIVACY.md)
- [Security](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)

## License

This is a public source release. A formal open-source license has not been
selected yet; until a `LICENSE` file is added, do not assume redistribution,
commercial-use, or reuse rights beyond viewing and local evaluation.

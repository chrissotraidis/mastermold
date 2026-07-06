# Master Mold

![Master Mold banner](public/master-mold-banner.png)

Master Mold is a local-first financial copilot demo. It combines a read-only
portfolio workspace, a daily briefing surface, a journal, chat, and a paper
autopilot lane. The repository ships with synthetic sample data only.

The tracked repository must never contain a user's real portfolio, account
history, wallet state, local reports, credentials, browser screenshots, or
personal operating notes. Those belong in ignored local storage such as
`.data/`, `.env.local`, `engine/.env`, or another ignored private workspace.

## What Ships

- A Next.js App Router app with `/api/health`.
- Seeded sample holdings and sample activity for local review.
- Read-only portfolio import surfaces that require the user to provide their
  own credentials locally.
- Local stores under `.data/` for user-created state.
- A paper/autopilot lane that is designed to be reviewable and bounded.

## Privacy Boundary

Tracked files are code, public docs, assets, tests, and sanitized sample data.

Ignored local files are where personal state belongs:

- `.data/` for app databases, imported holdings, journals, reports, and bot state.
- `.env.local` and `engine/.env` for local secrets.
- `engine/out/` for generated engine output.
- `artifacts/`, `screenshots/`, `reports/private/`, and `docs/private/` for local review material.

Before publishing or pushing, run:

```bash
npm run privacy:audit
```

## Quick Start

```bash
bun install
bun run dev
```

Open the printed local URL. The app runs without external accounts or API keys.

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

No license has been declared. Treat this repository as all rights reserved
unless a license is added.

# Privacy

Master Mold is designed so user data is local by default.

## Tracked Data

Tracked data must be synthetic and public-safe. The only portfolio-like data in
the repository should be sample fixture data used for demos and tests.

## Local Data

Personal state belongs in ignored paths:

- `.data/`
- `.env.local`
- `engine/.env`
- `engine/out/`
- `artifacts/`
- `screenshots/`
- `reports/private/`
- `docs/private/`

Examples of local-only data:

- Imported holdings and account snapshots.
- Manual portfolio entries.
- Journal entries and saved reports.
- Wallet state, public wallet setup receipts, and bot state.
- API keys, OAuth tokens, private keys, and provider secrets.
- Browser screenshots, metrics, audit trails, and helper handoff notes.

## Before Publishing

Run:

```bash
npm run privacy:audit
git status --short --ignored
```

The audit must pass, and ignored local state must remain untracked.

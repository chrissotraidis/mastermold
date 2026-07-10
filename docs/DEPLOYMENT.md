# Deployment

Master Mold can run locally without credentials.

```bash
bun install
bun run build
bun run dev
```

For a production-like local run:

```bash
npm run build
npm run start
```

`npm run start` requires Node 22.5 or newer because the autopilot store uses
the built-in `node:sqlite` driver. Local development and smoke checks can run
under Bun, which uses `bun:sqlite`.

## Environment

Create `.env.local` from `.env.example` and fill only the values you need.

```bash
cp .env.example .env.local
```

Keep real values out of git. User-specific stores should stay under `.data/`
or another ignored local path.

## Unattended server (VPS) deployment

Rehearsed end-to-end 2026-07-10. The whole deployment is:

```bash
npm install
npm run build
MASTERMOLD_WEB=prod bin/up        # under your supervisor of choice
```

`bin/up` in prod mode handles the two standalone-server traps for you — get
these right if you run the server any other way:

1. **The standalone artifact ships without `.env.local` or `.data`, and
   `server.js` chdirs into `.next/standalone`.** Run it bare and the web app
   silently creates a second, empty store inside the artifact while the
   daemon trades in the real one, with no API keys loaded. `bin/up` sources
   `.env.local` and exports absolute `MASTERMOLD_DB` / `AUTOPILOT_DB` /
   `ENGINE_OUT_DIR` paths so both processes share one `.data/`.
2. **There is no authentication on any route.** The dashboard exposes your
   holdings, and POST `/api/autopilot` controls the bot. `bin/up` binds the
   production server to `127.0.0.1`; reach it over an SSH tunnel or
   Tailscale, or front it with an authenticating reverse proxy and set
   `MASTERMOLD_BIND=0.0.0.0` only once that is in place.

Checklist for a new host:

- Copy `.env.local` and `engine/.env` (0600) from the old machine.
- Migrate `.data/` if you want to keep accumulated evidence (SQLite and JSON
  files are portable across OSes).
- Point `MASTERMOLD_BACKUP_DIR` somewhere durable; the daemon snapshots
  `.data/` daily and `npm run backup` works on demand.
- Optional: `cd engine && uv venv && uv pip install -e .` for engine-backed
  daily scans.
- The in-app scheduler runs the morning read at 7:15 **server-local time**
  (UTC on most VPSes). On a UTC host, set `MASTERMOLD_READ_AFTER=HH:MM` in
  `.env.local` (e.g. `12:15` for 7:15 ET) instead of changing the system
  timezone.
- Logs in `.data/logs/` self-trim at ~5MB; snapshots keep 14 days by default.

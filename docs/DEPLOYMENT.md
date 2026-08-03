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
MASTERMOLD_WEB=prod bin/up        # or bin/zo-start, which wraps exactly this
```

`bin/zo-start` is the idempotent entrypoint for a service manager: it
installs and builds only when missing, then execs production `bin/up`.
Point a supervisor at it and the host survives reboots:

- **systemd:** install `ops/mastermold.service` (instructions in the file),
  then `sudo systemctl enable --now mastermold`.
- **No sudo:** `crontab -e` →
  `@reboot cd $HOME/mastermold && bin/zo-start >> .data/logs/boot.log 2>&1`.

Moving an existing install (with its accumulated `.data` evidence) to a
VPS? Follow [ZO-MIGRATION.md](ZO-MIGRATION.md) — it sequences the cutover
so only one daemon ever runs and the store is never copied mid-write.

`bin/up` in prod mode handles the two standalone-server traps for you — get
these right if you run the server any other way:

1. **The standalone artifact ships without `.env.local` or `.data`, and
   `server.js` chdirs into `.next/standalone`.** Run it bare and the web app
   silently creates a second, empty store inside the artifact while the
   daemon trades in the real one, with no API keys loaded. `bin/up` sources
   `.env.local` and exports absolute `MASTERMOLD_DB` / `AUTOPILOT_DB` / `POLYMARKET_DB` /
   `POLYMARKET_BRAIN_DB` / `ENGINE_OUT_DIR` paths so both processes share one `.data/`.
2. **Remote requests fail closed.** `bin/up` binds to `127.0.0.1` by default,
   and a localhost or SSH-tunnel session has operator access. Any non-loopback
   Host receives an authentication challenge unless
   `MASTERMOLD_OPERATOR_PASSWORD` or `MASTERMOLD_VIEWER_PASSWORD` is configured.
   Use Basic Auth username `operator` for ordinary app writes or `viewer` for safe
   GET/HEAD access; viewer mutations return 403. Bot-control endpoints retain their stricter loopback-only checks. Browser mutations also require an
   exact same-origin request. Use these credentials only over HTTPS, such as
   Tailscale Serve or a TLS reverse proxy. Basic Auth does not encrypt transport.
   Keep both passwords distinct, random, and at least 16 characters (32+ is
   recommended). Set `MASTERMOLD_BIND=0.0.0.0` only behind that HTTPS proxy;
   doing so disables the localhost Host shortcut so spoofing `Host: localhost`
   cannot bypass authentication. State-changing routes are rate-limited in process, with tighter budgets for scans, imports, connection tests, notifications, chat, and autonomous-lane controls.

`/api/health` separates process health from decision readiness. A 200 `status: ok` means the local service and trading stores are operational; inspect `readiness.status`, `readiness.reasons`, and the individual checks before treating its data as current or useful.

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
- Logs in `.data/logs/` self-trim at ~5MB; snapshots keep 60 dated copies by default. A same-host snapshot is not disaster recovery: copy verified snapshots to a separately controlled off-host destination.

# Deploying Master Mold on Zo

Master Mold's primary home is a Zo Computer instance (always-on, 4 CPU / 32 GB).
Local clones from GitHub work identically with `bun dev` — nothing below is
required to run the app on a laptop.

## One-time setup (in a Zo terminal)

```bash
git clone <your-repo-url> mastermold
cd mastermold
bun install            # or npm install if bun is not on the box

# Optional but recommended — the engine, for real daily scans:
cd engine
uv venv && uv pip install -e .
cp .env.example .env   # add OPENROUTER_API_KEY (scans cost ~$0.002/day)
cd ..

bun run test           # 146 tests should pass on the box
```

## Register the two Zo primitives

1. **Service — the app.** Command: `bin/zo-start` (set `PORT` if Zo assigns one).
   It builds on first boot, reuses the build afterwards, and serves on
   `0.0.0.0`. Zo's periodic snapshot restarts are safe: runs are idempotent by
   date, the durable store lives in `.data/`, and the app always falls back to
   the last saved read.
2. **Automation — the daily scan.** Schedule `bin/engine-briefing` each weekday
   before the US open (e.g. 13:15 UTC). The app ingests the newest bundle on
   the next page load — no restart needed. Alternatively, have the Automation
   `curl -s -X POST http://localhost:$PORT/api/scan -H 'Content-Type: application/json' -d '{"trigger":"zo-automation"}'`
   to also settle paper rounds and refresh chat memory immediately.

## Verifying it is live

- `curl http://localhost:$PORT/api/health` → 200
- `curl http://localhost:$PORT/api/scan` → `runner_available: true` and the
  attempt history (failures included — a scan that did not happen is shown,
  never papered over)
- Open `/` → the header reads "scanned N hours ago", not a stale warning

## Environment knobs

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | 3000 | Service port |
| `ENGINE_OUT_DIR` | `engine/out` | Where scan bundles are written/read |
| `MASTERMOLD_DB` | `.data/mastermold.db` | Durable store (SQLite on Bun, JSON file on Node) |
| `MASTERMOLD_ENGINE_ADAPTER` | `direct` (for `/api/scan`) | `auto` re-enables the full TradingAgents graph for scheduled runs |
| `OPENROUTER_API_KEY` (in `engine/.env`) | — | Live scans + live chat; everything still works read-only without it |

Keys live only in `engine/.env` / `.env.local` and are never committed. The
app remains advisory-only by construction: no route can trade, sign, or move
funds, and the static enforcement test fails the suite if one is ever added.

# Operations

How to run Master Mold for weeks and know it is healthy. Deployment itself is
covered in [DEPLOYMENT.md](DEPLOYMENT.md); this is the day-2 manual.

## What runs

One command supervises everything:

```bash
npm run up          # web app + autopilot daemon, restart-on-crash, logs in .data/logs/
```

Three moving parts:

| Part | What it does | If it dies |
| --- | --- | --- |
| Web app (port 4002) | Dashboard, API, and the in-app scheduler that fires the morning read | Supervisor restarts it; nothing is lost |
| Autopilot daemon | Ticks every 20s: prices, strategy, shadow learning, backups | Supervisor restarts it; signal windows warm-start from persisted bars, so no blind spot |
| In-app scheduler | Refreshes the configured read-only Monarch snapshot, optionally runs the analysis engine, then saves the daily report after 7:15 server-local time (override: `MASTERMOLD_READ_AFTER=HH:MM`) | Runs on next server start; the Today page also self-heals its market-data report on view |

## Preferred read-only portfolio path

Monarch MCP is the first durable scheduled connection path. Configure either
`MONARCH_MCP_URL` or `MONARCH_MCP_COMMAND` with read-only snapshot tools. The
in-app morning scheduler refreshes and persists that snapshot before checking
whether the optional Python engine exists. If Monarch is unconfigured, the
preflight is a no-op. If a refresh fails, the previous snapshot remains visible
and becomes stale after 24 hours; the app never silently substitutes it as fresh.
No account write, brokerage order, wallet signing, or transfer scope is used.

## The cadences

Everything else is automatic and evidence-gated:

- **20 seconds** — strategy tick; per-symbol verdicts land on the Autopilot page.
- **5 minutes** — price bars and equity marks persist; V3 shadow evaluates and
  records; watched wallets are scanned for buys.
- **5 minutes** — the Polymarket research brain samples public Gamma markets and
  executable CLOB books, labels due 15m/1h/4h markouts, checks due markets for
  decisive final outcomes, updates Brier calibration, and records new shadow
  hypotheses even while the Polymarket paper trader is off.
- **Twice a day** — wallet discovery refreshes (metered against the
  SolanaTracker monthly budget, visible in the Smart Wallets card).
- **Daily (UTC)** — the Analyst reviews the attribution window and may adjust
  one parameter inside hard rails (auto-reverts if expectancy worsens);
  `.data/` snapshots to `~/.mastermold/backups`.
- **3+ days** — directional plays on the Today page receive their grade.

## What to check

**Daily, ~30 seconds (phone works):** the Today page. An amber banner means
the daemon stopped ticking. No banner proves only that this warning is absent;
confirm the portfolio source and saved-read date before relying on the brief.
Plays carry their running track record. The Web3 lab's strategy card shows
exactly why that separate bot is or isn't running.

**Weekly, ~5 minutes:** on the Autopilot page —

- **Go-live gate** chips: five checks (5-day window, every fill traced,
  equity ahead of SOL buy-and-hold, drawdown inside 10%, wallet provisioned).
  All five must pass before live mode can even be armed.
- **V3 shadow line**: labeled snapshot count and the calibration verdict. A
  verdict of "INVERTED" means a signal is measurably wrong and the promotion
  gate is blocking it — that is the system working, not failing.
- **Report cards**: each followed wallet judged by our own record of what
  happened 6h after its buys. Unfollow wallets that grade poorly.
- **SolanaTracker budget**: soft-stops itself at 90% and falls back to the
  keyless path; alerts at 50/80/100%.

On the Polymarket page, inspect the brain panel weekly. A strategy remains
`shadow only` until it has at least 100 execution-adjusted one-hour labels, a
positive mean markout, and at least a 52% hit rate. Passing that gate makes it a
paper candidate only; it does not arm paper mode or grant live authority.

## Notifications

Set in `.env.local` (see `.env.example`); the daemon picks them up on restart:

```bash
NOTIFY_TELEGRAM_BOT_TOKEN=   # @BotFather token
NOTIFY_TELEGRAM_CHAT_ID=     # your chat id
NOTIFY_DESKTOP=true          # macOS notification center (ignored elsewhere)
```

You then hear about: fills, every halt (daily loss, drawdown, live reconcile),
daemon stop, the daily Analyst review, applied parameter changes, promotion
gate transitions, budget thresholds, and backup failures. Identical messages
dedupe for 10 minutes. Restart the service after changing `.env.local`, then use
Settings → Notifications → **Send test notification** and confirm the message
arrives on the actual device. A configured badge without a received test is not
notification proof.

## Deployment acceptance

Run the read-only check against the service itself:

```bash
npm run ops:check
```

For the external HTTPS URL, set `MASTERMOLD_URL`,
`MASTERMOLD_CHECK_USERNAME=viewer`, and `MASTERMOLD_CHECK_PASSWORD` in the
operator shell, then run `npm run ops:check -- --expect-auth`. The external
probe must receive 401 without credentials and 200 with the viewer credentials.
The command fails on unavailable stores or routes, but reports stale reports,
backups, and limited decision readiness as warnings. This separation is
intentional: process health is not evidence quality or profitability. Follow it
with `npm run backup:verify`; the HTTP check cannot prove an off-host restore.

## Data, growth, and recovery

`.data/` is the entire evidence record. Every table carries a rolling cap
sized to outlive the longest evidence window that reads it, including the
Web3 go-live gate's five-day window. The Polymarket brain is a separate SQLite
database at `.data/polymarket-brain.db` by default and retains at most 90 days
or 50,000 five-minute observations. Its higher-frequency public CLOB stream is
separately capped at seven days or 100,000 deduplicated events. At high message
rates the count cap can represent much less than 24 hours, so the dashboard and
health route report retained time coverage instead of implying a complete day. Set
`POLYMARKET_STREAM_ENABLED=0` only when an operator intentionally wants to stop
that optional research feed. The count cap bounds growth but the SQLite file can
still reach roughly 100MB depending on payload mix. Logs in `.data/logs/` self-trim at ~5MB.

- **Backup**: automatic daily atomic snapshot (60-snapshot retention) plus
  `npm run backup` on demand. Override the location with
  `MASTERMOLD_BACKUP_DIR` and retention with `MASTERMOLD_BACKUP_KEEP`. A failed
  copy never becomes a completed dated snapshot.
- **Verify**: run `npm run backup:verify`. It copies the newest snapshot into an
  isolated temporary directory, parses every JSON store, runs SQLite
  `PRAGMA integrity_check`, and removes the copy. It never touches live `.data/`.
- **Off-host copy**: after verification, copy the completed dated snapshot to a
  separately controlled host or encrypted object store at least daily. `rsync`
  or `rclone copy` are appropriate; do not use a destructive mirror command and
  do not point the destination inside this public repository. Alert when the
  newest off-host copy is older than 36 hours. Same-VPS snapshots alone are not
  disaster recovery.
- **Restore**: first stop `npm run up`, preserve the current `.data/` directory,
  copy one verified snapshot's files into a new empty `.data/`, then restart and
  check `/api/health`. Never overlay a snapshot while the web or daemon process
  is running.

## Troubleshooting

| Symptom | Meaning | Do |
| --- | --- | --- |
| Amber "Autopilot is armed but…" banner on Today | Daemon stopped ticking (sleep, crash without supervisor) | `npm run up` |
| Strategy card shows "warming up" | First ~13 minutes after a cold start with no recent bars (a long outage) | Wait; normal restarts warm-start instantly |
| Gate says "SOL benchmark pending price history" | Less than ~2.5 days of persisted bars so far | Wait; bars accumulate to a 7-day window |
| "budget … soft stop reached" in the Smart Wallets card | Monthly SolanaTracker allowance protected | Nothing; discovery uses the keyless fallback until the month rolls |
| Tape shows one repeated error every 10 minutes | An upstream API is down; the throttle is keeping history intact | Nothing; every fetch degrades and retries |
| Chat gives canned answers | No server LLM key | Add a key to `.env.local` and restart, or paste one in Settings → Chat |
| Polymarket brain says `unavailable` | Its local SQLite file cannot be opened | Check `.data/` permissions and `POLYMARKET_BRAIN_DB`; live trading remains locked |
| Polymarket stream says `stale` | No public CLOB message or PONG arrived for 30 seconds | Check outbound WebSocket access; it reconnects automatically and trading authority stays unchanged |
| Polymarket stream says `disabled` | No eligible token set exists or `POLYMARKET_STREAM_ENABLED=0` | Run a research cycle, or enable the optional feed and restart |

## What it will never do on its own

Arm live trading (five-check evidence gate plus a deliberately provisioned
spare wallet), follow a wallet (discovery suggests; a human clicks Follow),
raise its own caps, or resume after a kill switch. The kill switch on the
Autopilot page stops everything and never auto-releases.

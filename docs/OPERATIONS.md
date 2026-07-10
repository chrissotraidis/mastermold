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
| In-app scheduler | Runs the daily read after 7:15 server-local time | Runs on next server start; the Today page also self-heals on view |

## The cadences

Everything else is automatic and evidence-gated:

- **20 seconds** — strategy tick; per-symbol verdicts land on the Autopilot page.
- **5 minutes** — price bars and equity marks persist; V3 shadow evaluates and
  records; watched wallets are scanned for buys.
- **Twice a day** — wallet discovery refreshes (metered against the
  SolanaTracker monthly budget, visible in the Smart Wallets card).
- **Daily (UTC)** — the Analyst reviews the attribution window and may adjust
  one parameter inside hard rails (auto-reverts if expectancy worsens);
  `.data/` snapshots to `~/.mastermold/backups`.
- **3+ days** — directional plays on the Today page receive their grade.

## What to check

**Daily, ~30 seconds (phone works):** the Today page. An amber banner means
the daemon stopped ticking — everything else means it's fine. Plays carry
their running track record. The Autopilot page's strategy card shows exactly
why the bot is or isn't trading right now.

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
dedupe for 10 minutes.

## Data, growth, and recovery

`.data/` is the entire evidence record. Every table carries a rolling cap
sized to outlive the longest evidence window that reads it (the go-live
gate's 5 days), so disk usage plateaus in the low tens of MB regardless of
uptime. Logs in `.data/logs/` self-trim at ~5MB.

- **Backup**: automatic daily snapshot (14-day retention) plus
  `npm run backup` on demand. Override the location with
  `MASTERMOLD_BACKUP_DIR` and retention with `MASTERMOLD_BACKUP_KEEP`.
- **Restore**: stop everything, copy a snapshot's files back into `.data/`,
  start again. SQLite snapshots are taken with `VACUUM INTO` and are complete,
  openable databases.

## Troubleshooting

| Symptom | Meaning | Do |
| --- | --- | --- |
| Amber "Autopilot is armed but…" banner on Today | Daemon stopped ticking (sleep, crash without supervisor) | `npm run up` |
| Strategy card shows "warming up" | First ~13 minutes after a cold start with no recent bars (a long outage) | Wait; normal restarts warm-start instantly |
| Gate says "SOL benchmark pending price history" | Less than ~2.5 days of persisted bars so far | Wait; bars accumulate to a 7-day window |
| "budget … soft stop reached" in the Smart Wallets card | Monthly SolanaTracker allowance protected | Nothing; discovery uses the keyless fallback until the month rolls |
| Tape shows one repeated error every 10 minutes | An upstream API is down; the throttle is keeping history intact | Nothing; every fetch degrades and retries |
| Chat gives canned answers | No server LLM key | Add a key to `.env.local` and restart, or paste one in Settings → Chat |

## What it will never do on its own

Arm live trading (five-check evidence gate plus a deliberately provisioned
spare wallet), follow a wallet (discovery suggests; a human clicks Follow),
raise its own caps, or resume after a kill switch. The kill switch on the
Autopilot page stops everything and never auto-releases.

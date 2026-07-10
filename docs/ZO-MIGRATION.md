# Zo migration — the cutover checklist

Moving an existing Master Mold install to a Zo VPS (or any Linux host),
keeping all accumulated evidence (holdings, V3 labels, wallet cursors,
API-budget counter). Follow top to bottom; each phase says what "done"
looks like before you move on.

**If you are an assistant running on the Zo host:** you can execute
Phases 0 and 3–7 yourself. Phase 1 and the copy commands in Phase 2 run
on the operator's old machine — ask the operator to run those and to
transfer three things as *files*: `.env.local`, `engine/.env`, and the
`.data/` directory. Never ask the operator to paste key values into chat,
and never commit any of those files — all three are gitignored on purpose.

The one rule that matters: **only one machine runs the daemon at a time.**
The SolanaTracker budget (2,500 requests/month) is metered per key with a
local counter — two daemons double-spend it invisibly and their learning
stores drift apart. The sequence below stops the old machine *before*
copying `.data`, so the store is never copied mid-write.

Time estimate: 30–45 minutes, most of it waiting on `npm install` and the
build.

---

## Phase 0 — Pre-flight on Zo (old machine keeps running)

Nothing here touches the old machine; if Zo isn't ready you've lost nothing.

```bash
node --version    # must be >= 22.5 (node:sqlite); install via nvm/apt if not
git --version
python3 --version # >= 3.10 only if you want engine-backed scans (optional)
```

Clone and install:

```bash
git clone https://github.com/chrissotraidis/mastermold.git ~/mastermold
cd ~/mastermold
npm install
npm run build
```

Optional — the Python engine (daily scans; the app falls back to
rules-only reads without it):

```bash
cd engine && uv venv && uv pip install -e . && cd ..
```

**Done when:** `npm run build` finishes without errors.

## Phase 1 — Stop the old machine

On the old machine:

```bash
# Ctrl-C the bin/up terminal if one is open. Otherwise kill the supervisor
# FIRST (it restarts its children if they die before it), then strays:
pkill -f "bin/up"; sleep 1; pkill -f autopilot-daemon; pkill -f "next dev"
# Verify nothing is left:
pgrep -fl "bin/up|autopilot-daemon|next"   # should print nothing
```

The bot's mode (paper/off) is stored in `.data` and travels with it — you
do not need to touch the kill switch for a migration.

**Done when:** `pgrep` prints nothing. From this moment the old machine is
legacy; don't restart `bin/up` on it.

## Phase 2 — Copy secrets and evidence

From the old machine (adjust host/user to your Zo SSH target):

```bash
cd /path/to/your/mastermold
scp .env.local  zo:~/mastermold/.env.local
scp engine/.env zo:~/mastermold/engine/.env    # if the engine is set up
rsync -a --delete .data/ zo:~/mastermold/.data/
```

Then on Zo, lock the secrets down and adjust two values for a UTC host:

```bash
chmod 600 ~/mastermold/.env.local ~/mastermold/engine/.env
```

Edit `~/mastermold/.env.local` and add/confirm:

```bash
MASTERMOLD_READ_AFTER=12:15    # 7:15 ET expressed in UTC; pick your hour
MASTERMOLD_BACKUP_DIR=$HOME/.mastermold/backups
```

What travels in `.data` and why you want it: your manually entered
holdings, every autopilot trade and decision, the V3 label history
(calibration resets to zero on a fresh start), followed wallets with
their scan cursors, and the SolanaTracker budget counter.

**Done when:** `ls ~/mastermold/.data` on Zo shows `mastermold.db`,
`autopilot.db.json`, and `logs/`.

## Phase 3 — First supervised start

On Zo:

```bash
cd ~/mastermold && bin/zo-start
```

Leave it in the foreground for this first run. In a second SSH session:

```bash
curl -s http://127.0.0.1:4002/api/health | python3 -m json.tool
curl -s http://127.0.0.1:4002/api/autopilot | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['state']['mode'], [p['symbol'] for p in d['positions']])"
```

**Done when:** health says `"status": "ok"`, and the autopilot response
shows the same mode and positions the old machine had. If positions are empty,
the store didn't travel — stop, re-run the rsync, start again.

## Phase 4 — Survive a reboot

Ctrl-C the foreground `bin/zo-start`, then install the systemd unit:

```bash
cd ~/mastermold
sed "s|%USER%|$USER|g; s|%ROOT%|$HOME/mastermold|g" ops/mastermold.service \
  | sudo tee /etc/systemd/system/mastermold.service
sudo systemctl daemon-reload
sudo systemctl enable --now mastermold
sudo reboot
```

No sudo on the box? Cron fallback: `crontab -e` and add
`@reboot cd $HOME/mastermold && bin/zo-start >> .data/logs/boot.log 2>&1`.

**Done when:** after the reboot, `curl -s http://127.0.0.1:4002/api/health`
answers without you starting anything by hand.

## Phase 5 — Reach it from your devices

The server binds 127.0.0.1 on purpose — there is no login screen, so it
must never face the open internet. Two good options:

- **Tailscale (recommended, works from the phone):** install on Zo and on
  your devices, then browse to `http://<zo-tailscale-ip>:4002`. Add it to
  the phone's home screen — the PWA manifest gives it an app icon.
- **SSH tunnel (quick check from a laptop):**
  `ssh -N -L 4002:127.0.0.1:4002 zo`, then open `http://localhost:4002`.

**Done when:** the Today page loads on your phone.

## Phase 6 — Telegram (required on Linux)

macOS desktop notifications don't exist on Linux — Telegram is the only
way the bot reaches you on Zo.

1. Message **@BotFather** on Telegram → `/newbot` → copy the token.
2. Message your new bot once (anything), then get your chat id:
   `curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"` → `chat.id`.
3. Add both to `~/mastermold/.env.local`:
   `NOTIFY_TELEGRAM_BOT_TOKEN=...` and `NOTIFY_TELEGRAM_CHAT_ID=...`
4. `sudo systemctl restart mastermold`, then Settings → Notifications →
   **Send test notification**.

**Done when:** the test message lands in Telegram.

## Phase 7 — First-week watch

- **Day 1:** after your `MASTERMOLD_READ_AFTER` hour, the Today page shows a
  fresh daily report; Autopilot shows recent ticks (heartbeat under 2 min).
- **Any day:** Settings → System health is green; `.data/logs/` under 20MB
  (self-trims); a dated folder appears in `~/.mastermold/backups`.
- **Budget sanity:** the Autopilot page's API budget line should advance
  ~20–40/month at current cadence. A sudden jump means something is
  scanning too often — check `.data/logs/autopilot.log`.
- Full day-2 routine: see `docs/OPERATIONS.md`.

## Rollback

The old machine's checkout is untouched. To fall back: stop the service on Zo
(`sudo systemctl disable --now mastermold`), copy `.data` back the other
way (`rsync -a --delete zo:~/mastermold/.data/ .data/`), and start
`bin/up` on the old machine. Same one-daemon rule, opposite direction.

## Decommissioning the old machine (after a clean week)

Nothing to uninstall — just don't run `bin/up` there. Keep the checkout as
a rollback target, or archive `~/.mastermold/backups` first if you delete
it.

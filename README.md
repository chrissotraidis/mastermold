# Master Mold

Master Mold is a personal financial decision app and the user-facing surface of a
larger Intelligent Financial Agent: a personal, owned system that combines a daily market
read, prioritized alerts, read-only portfolio context, a decision journal, paper trading,
global chat, and a future bounded Web3 executor model.

It began as a seeded RDS demo (the original public service at
`https://rds-rds-product-type-game-8a408d-kahris.zocomputer.io/` has been taken down).
It is now being evolved into the real thing: a Python sidecar **engine** (a fork of
[TradingAgents](https://github.com/TauricResearch/TradingAgents)) computes the briefing,
alerts, journal/memory loop, and suggested paper trades, and the Next.js app ingests
that output through a thin, schema-validated layer — falling back to sample data
whenever the engine has not run. The original product reference documents are preserved
in `docs/ref`.

## Getting started

Master Mold is built to **clone and run with zero setup** — no credentials, no engine, no
external accounts required. It boots on seeded sample data so you can explore the whole app
immediately.

```bash
bun install
bun dev            # then open the printed http://localhost:<port> URL
```

The first time you open it, a **getting-started screen** (`/welcome`) walks you through an
optional profile. You can fill it in, or skip setup and explore the sample data right away.
Nothing here can move money; the app is advisory-only by construction.

### Your profile (backup & restore)

Your profile preferences live in your browser (localStorage). App activity such as
journal entries, paper trades, alert feedback, manual holdings, and market-memory runs
lives in the local app store so it can survive reloads.

- **Set it up:** name + risk posture + asset focus on `/welcome`, or later in **Settings → Profile**.
- **Check or import accounts (optional):** enter account credentials under **Settings → Connection checks**.
  The app sends them to this local server for the selected test or holdings snapshot import; imports create Portfolio holdings only after you press import and still cannot trade.
- **Export:** **Settings → Profile → Export** downloads a single `mastermold-profile-*.json`
  bundling your preferences and saved test fields.
- **Import:** drop that file into **Import profile** (or **Restore from a backup** on the
  welcome screen) on any machine to pick up exactly where you left off.
- **Start from scratch:** wipes all local state and returns you to the getting-started screen.

This makes the project portable and personal at once: anyone can clone it and start fresh,
and you can back up and move your own setup between machines with one file.

## Current State

The app boots fully with **zero credentials and no saved market scan**, rendering
from local seeded data. When the engine has written a run, the briefing, alerts, journal
past-call review, score accuracy, paper trading, and chat context are computed from
that saved scan instead. The UI labels saved scans, sample data, and manual entries plainly
so reviewers can tell what is real, what is local, and what is still only sample data.
The **Performance** page (`/review`) separates what is scan-backed vs. sample vs. not
built, including per-run cost.

Implemented so far:

- **Phase 0** — the Python engine scaffold: an alert-filtered funnel, the additive
  TradingAgents schema delta, and the deterministic mapping logic, all unit-tested.
- **Phase 1** — the zod ingestion layer; briefing and alerts go engine-backed with
  honest provenance.
- **Phase 1.5** — durable `bun:sqlite` persistence so operator-created journal entries,
  paper trades, and alert feedback survive a restart.
- **Phase 2** — the journal/memory loop: score-bucket history and the reflection
  significance gate computed from resolved engine decisions.
- **Phase 3** — confidence checks, engine context in chat, the human-vs-engine paper
  trading loop, and the alert-feedback → alert-rule tuning loop.

What still requires credentials/ops (not yet done): scheduled market scans
(market-data keys + the full LangGraph dependency tree + Python 3.10 for the complete
multi-agent path), always-on cron scheduling, prompt caching, batch reflections, and
broad account-sync coverage beyond the explicit holdings snapshot import buttons in Settings.

The central invariant is unchanged for real capital: **advisory-only, read-only by
construction.** The app never places a real trade or moves funds; Web3 automation is
confined to the local paper ledger unless signer, custody, relay, approval, and kill-switch
gates are explicitly built and cleared. A static enforcement test fails if an unguarded
trade/order/write endpoint is ever introduced.

### Web3 autonomous paper daemon

The Web3 trading workspace can be driven without the browser by the bounded paper daemon:

```bash
npm run daemon:web3 -- --base-url=http://localhost:4010 --ticks=1 --heartbeat-when-gated --json
npm run forward:web3 -- --base-url=http://localhost:4010 --ticks=6 --min-net-pnl=0 --json
npm run forward-suite:web3 -- --base-url=http://localhost:4010 --ticks=2 --min-net-pnl=0 --json
npm run forward-repeat:web3 -- --base-url=http://localhost:4010 --ticks=2 --runs=3 --min-net-pnl=0 --min-hit-rate-pct=100 --min-deployed-alpha=0 --max-drawdown=1000 --min-consistency-score=80 --json
npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json
npm run preflight-live:web3 -- --base-url=http://localhost:4010 --ticks=2 --runs=2 --json
npm run reconcile-settlement:web3 -- --base-url=http://localhost:4010 --json
npm run guard-mirror:web3 -- --base-url=http://localhost:4010 --json
npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json
npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json
npm run verify:web3 -- --base-url=http://localhost:4010
npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet
npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order
npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live
npm run verify:web3 -- --base-url=http://localhost:4010 --require-live-canary
```

The runner calls `/api/web3-trading` with the persisted daemon lease guard, records JSON
receipts, refuses real-capital autonomy, and exits on conflicting runners. It is intended
for local/paper monitoring and rehearsal only; live signing, transaction submission, and
fund custody remain credential-gated future work. The market monitor command calls live DEX
discovery plus auto-resolved GeckoTerminal OHLCV, writes a local candle-proof receipt back
to the cockpit, appends a sanitized local monitor history at
`data/web3-market-monitor-history.json`, exposes it through
`/api/web3-market-monitor-history`, and keeps signing, submission, live execution, and
wallet mutation blocked.
When the public candle provider is throttled, it returns an observed/degraded receipt and
keeps fresh paper buys blocked instead of crashing or loosening execution gates.
The forward run resets the local paper
ledger, runs bounded daemon ticks, compares start/end wallet equity, and reports whether
the paper loop met the requested net-PnL target. The forward suite repeats that proof across
base, breakout, and rug-risk sample regimes so reviewers can see aggregate PnL, traded
regimes, worst/best scenario outcomes, full-wallet hot-coin baseline alpha, and same-notional
deployed-capital alpha versus the best visible coin; add `--fail-under-target` when that
report should gate deployment. The repeat proof reruns the bounded suite or scenario with
`--runs=N` and reports hit rate, average PnL, cumulative drawdown, consistency score, and
repeat deployed-capital alpha so a single lucky tape is harder to mistake for durable edge.
When `--fail-under-target` is set on repeat proof, net PnL, hit rate, drawdown, deployed
alpha, and consistency thresholds all have to pass before the report grants paper-promotion
permission. The live-capital preflight then combines the live-readiness audit, daemon
handoff boundary, and repeat proof gate; by default it fails closed if real-capital readiness
appears without explicit `--allow-live-ready` review, and it never signs, submits, or moves
funds. The live canary proof command reads the canary receipt and can optionally run the
guarded settlement watchdog for the latest stored signature; it exits nonzero until signed
relay, chain confirmation, settlement reconciliation, and local portfolio mirror proof all
pass. The settlement reconciliation drill inspects only local relay, lifecycle, and audit
metadata; it requires relayed transactions to keep signature/request/payload evidence and
can poll the latest audited relayed signature with Solana `getSignatureStatuses` through
the guarded `confirmation_poll` API path. Confirmed transactions must map to a landed
lifecycle before any portfolio mirror could be treated as reconciled. A guarded
`fill_reconcile` path can then read Solana `getTransaction` metadata for token-balance
deltas, infer side/price/quantity for simple USDC-versus-token swaps, and emit a reviewed
`mirror_apply_request` only when the fill is clean; it blocks ambiguous, missing, failed,
or over-cap fills instead of guessing. The portfolio mirror guard then requires that landed fill
to also have relay signature, request id, payload hash, a deterministic idempotency key,
and bounded autonomous handoff notional before a future reviewed mirror writer could treat
the fill as audit-ready. The Web3 trading API also accepts a guarded `portfolio_mirror`
apply request for the persistent paper mirror; it still blocks unless confirmed settlement
evidence, fill price, filled quantity, handoff notional, and idempotency all reconcile, and
it never grants live execution or wallet mutation permission. The first-canary drill reads
live blockers, supervised canary readiness, Jupiter order proof, unsigned-order preflight,
and canary proof receipts together through `GET /api/web3-first-canary-drill`, `/api/health`,
and `npm run drill-canary:web3`, but it remains read-only and cannot sign, submit, store
wallet authority, or move funds. The drill receipt now also includes an operator unblock plan
with the next safe step, later gated steps, safe surfaces, verifier commands, and completion
signals for the first funded canary. The Trading command center reads that same receipt for its
first-screen status, hash, hard-fail count, proof count, next post-signing proof step, signature
preview, live-dex drill link, ordered next lane, leading failing lanes, and ordered unblock plan
so the next real canary blocker is visible before the long workspace. Settings now reads the
same first-canary drill receipt inside the live trading setup launchpad, placing the next
unblock step, safe action surface, verifier command, and ordered first-canary unblock steps
next to the credential console that clears wallet and provider gates. The Settings credential
console also refreshes the first-canary drill after safe wallet, provider, Jupiter, preflight,
and canary actions so the app-visible next live-trade blocker changes without a page reload.
That same Settings credential console now has a `First canary live flags` arming panel that
shows the exact accepted flag values, whether each one is selected or installed locally, and
the safe localhost installer action; it still cannot sign, submit, custody funds, mutate a
wallet, or prove that a live trade happened.
`/api/health` also exposes `web3_live_first_canary_drill`, a canonical
live-dex persistent first-canary health summary for monitors that need the real live-trade
blocker without inferring it from the default app state, plus `web3_live_canary_proof`
for the compact post-signing proof chain after a signed canary exists. The drill health
and Trading card also split the ordered canary lane from the broader credential-intake
queue so a Jupiter order blocker and a wallet-proof intake step do not look like conflicting
answers. `verify:web3` is a Node-only
operator check for machines without Bun: against a running app, it snapshots the saved
public wallet/risk scope, proves health receipts, execution input validation, public-wallet
dry-run scope save, credential validate-only redaction, text-only `/api/web3-wallet-ownership`
freshness and receipt boundaries, manual live-review packet boundaries, deterministic DEX discovery receipt
boundaries, one-shot Jupiter rehearsal redaction, live canary preflight, private-field rejection, and the live
execution/wallet mutation locks, then restores the saved public wallet/risk scope before exit. Add
`--require-jupiter-order` after a `JUPITER_API_KEY`
or `WEB3_VERIFY_JUPITER_API_KEY` is available to fail closed until quote and unsigned-order
readiness are both proven without returning transaction bytes. Add `--require-operator-wallet`
with `--wallet=<public-solana-address>` or `WEB3_VERIFY_WALLET_PUBLIC_KEY` to fail closed
until the sample all-ones wallet has been replaced by a dedicated public trading wallet.
Add `--require-dex-live` to fail closed until the live DEX scanner returns current live
candidate and pair evidence with no failed discovery sources while execution, transaction
submission, wallet mutation, private-key storage, and secret echo remain blocked; if public
discovery is temporarily throttled, the strict gate can fall back to auto-resolved
GeckoTerminal OHLCV proof or a recent recorded live-dex candle proof for a Solana pool while
preserving the same live locks.
Add `--require-live-canary` only after the tiny funded canary has been signed externally,
relayed, confirmed or finalized on-chain, reconciled for settlement, and accounted in the
local portfolio mirror. This strict gate fails closed while `actual_live_trade_tested` is
false, while the signature is only relayed, or while settlement/mirror proof is incomplete.
`/api/web3-dex-discovery?source=live-dex` is the compact read-only scanner receipt for
current public DEX Screener discovery evidence: profiles, boosts, ads, paid orders, pair
mapping, top symbols, and scanner intake status. It is paper-only evidence and still blocks
live execution, transaction submission, wallet mutation, private-key storage, and secret echo.
`/api/web3-ohlcv?auto=true&source=live-dex` is the read-only candle-proof fallback for a
chartable Solana pool. It returns GeckoTerminal candle data, local signal/noise and paper
sizing evidence, and explicit live-execution/wallet-mutation/transaction-submission/private-key
blocks; it does not sign, submit, custody funds, or store wallet authority.
`/api/web3-live-capital-preflight?source=live-dex` is the compact go/no-go receipt for
the researched real-capital path: operator wallet, provider rail, live DEX scanner,
Jupiter order rehearsal, risk caps, kill switch, signer/custody, settlement, profit proof,
and manual review. It reports blockers and next actions while still refusing signing,
transaction submission, account creation, private-key storage, and wallet mutation.
`/api/web3-live-usability-blockers?source=live-dex` is the single "what is left"
receipt for real-money Web3 usability. It reconciles the usability status, cutover
board, operator runbook, live-capital preflight, supervised runway, and manual live-review
packet into missing operator inputs, signoff counts, safe next actions, verifier commands,
the latest sanitized credential-doctor status, the next ordered unlock step, the current
safe input contract, a compact next credential request with the safe value type, fix surface,
verifier command, verification runway, completion criteria, and never-provide boundary, and live-lane readiness while keeping autonomous live trading, signing, submission,
wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked.
It also groups missing rows by owner and evidence source so operators can see whether
the next work belongs to wallet setup, security, ops, accounting, strategy, or review,
and `/trading` shows the current input contract in both the first-screen command board
and expanded readiness receipt.
Use `rows=all` on that same endpoint to return every dependency-ranked missing row for
external review; the default response stays compact for dashboard panels.
The compact response ranks first-canary setup lanes ahead of paper/preflight market chores, so
wallet proof, Jupiter setup, live flags, signer relay, and review work are not hidden behind an
unrelated paper refresh row.
Live-capital preflight rows in that response also use canary-specific next actions for Jupiter
order proof, signer/custody, settlement, and manual review, so the real-money queue does not show
paper-market refresh or sizing instructions as the way to unlock a funded canary.
`/api/web3-first-canary-handoff?source=live-dex&account=persistent&scenario=breakout&cycles=0`
is the compact first funded canary handoff for another operator or helper. It combines the
first-canary drill and credential requirements into a redacted packet with completed gates,
open canary steps, the next operator action, current-step safe-to-provide values, never-provide values,
proof criteria, source endpoints, and strict commands while live execution, signing,
submission, wallet mutation, private-key storage, seed-phrase storage, signed-payload storage,
and secret echo remain blocked. `npm run --silent handoff-canary:web3 -- --base-url=http://localhost:4010`
prints the same packet as paste-ready Markdown, or `--json` returns the receipt.
`/api/web3-credential-doctor` is the localhost-only in-app refresh endpoint for the
sanitized Web3 credential doctor receipt used by Settings and live-usability summaries.
It requires `operator_ack: true`, supports preview mode for `npm run verify:web3`, accepts
only status fields, forces live-execution approval flags off while running the doctor, and
keeps signing, submission, wallet mutation, private-key storage, seed-phrase storage, and
secret echo blocked.
`/api/health` also exposes compact `web3_operator_runbook`, `web3_research_handoff`,
`web3_live_autonomy_readiness`, and `web3_live_usability` summaries for monitors. The live-autonomy
summary carries the final daemon, market, route, fee, policy, signer, relay, and kill-switch gate
score, source endpoint, live-review endpoint, unattended/real-capital booleans, live cap fields, and
blocked live-execution/signing/wallet/secret permissions. The runbook health summary carries the
primary safe action, current safe input contract, action counts, source endpoint,
live-review source endpoint, verifier command, and blocked live-execution/signing/wallet/secret permissions.
The research health summary names the exact source/account/scenario packet being summarized and separately
points at the live-dex persistent export packet for helper research. The live-usability
summary carries the same receipt hash, missing-input counts, total-versus-listed live-usability row counts,
live-lane counts, next ordered unlock step, next dependency blocker with its safe fix link and verifier command, next credential request with its verification runway and completion criteria, next action, current
safe input contract, and blocked live-execution/signing/wallet/secret permissions without
returning secrets or transaction bytes. Settings mirrors that next dependency blocker in
the Web3 setup priority card, live trading setup launchpad, and credential action console.
The launchpad condenses the next safe input, wallet proof, Jupiter order proof, signer/custody,
live blocker board, tiny canary proof, and the first-canary operator unblock plan into one no-secrets view, and Settings also shows
the compact credential request, verification runway, completion criteria, and safe credential profile
so the safe wallet/provider/review value, non-secret lane status, follow-up proof path, and done
condition are visible where the operator fixes credentials.
`/api/web3-live-autonomy-readiness` exposes that same final transition gate directly for the trading
cockpit and external monitors. It reports whether the system can run unattended, whether real-capital
wallet trading is allowed, the live trade cap, route TTL pressure, next wake cadence, blockers, and
the ordered final gate list only; it cannot sign, submit, custody funds, mutate wallets, store private
keys or seed phrases, or enable live execution.
`/api/web3-live-ignition` is the bot-facing real-money ignition go/no-go receipt. It reconciles
live scope, wallet scope, wallet ownership proof, Jupiter route/order proof, signer relay, autonomy readiness,
canary proof, and the safety boundary into one status for the trading cockpit, `/api/health`, and `npm run verify:web3`.
When a public wallet is scoped but not proven, ignition ranks the hash-only browser-wallet ownership proof
ahead of Jupiter/order rehearsal so every live-trade surface points at the same next safe action before
any unsigned canary order can be requested.
`POST /api/web3-live-ignition` can prepare a machine-readable launch envelope for either the next
supervised canary or a future bounded autonomous launch, but only after explicit acknowledgements and
only when the existing ignition gates say the step is allowed.
`/api/web3-supervised-canary-readiness` is the first-funded-trade ladder: it combines the dedicated
wallet, ownership proof, Jupiter order rail, live flags, unsigned-order preflight, signed relay,
manual review, and funded-canary proof into one ordered answer for whether the app can request the
tiny unsigned order, relay a signed payload, or prove a real canary yet.
It also exposes a `web3-first-live-canary-attempt-contract` object naming the current attempt stage,
whether anything is runnable now, the exact endpoint/command to use, missing inputs, required
acknowledgements, and the safety boundary before a funded canary is attempted; Settings and
Trading both surface the same contract. Settings also mirrors the first-canary drill's ordered
unblock plan beside that contract, and `/api/health` mirrors the canonical live-dex/persistent
version as `web3_live_canary_attempt`.
It keeps `can_autonomously_trade_real_money_now=false` until the supervised canary has actually
relayed, confirmed, reconciled settlement, and mirrored the local portfolio; it cannot sign, submit,
return transaction bytes from the ignition action, store wallet authority, echo secrets, or mutate wallets.
`/api/web3-live-activation-plan` now consolidates the credential requirements, live-usability blockers,
and final autonomy gate into one operator go/no-go packet with ordered milestones, the current safe
wallet milestone, strict verifier commands, paste-ready Markdown, and compact `/api/health`
`web3_live_activation` status. Run `npm run --silent activate:web3 -- --base-url=http://localhost:4010`
to export the same redacted plan as Markdown, or add `--json` for the full receipt. It is an activation
plan only: activation, live execution, signing, transaction submission, wallet mutation, private-key
storage, seed-phrase storage, and secret echo remain blocked.
`/api/web3-live-activation-intake` is the validate-only companion for that plan. `GET` returns the
safe activation profile schema, and `POST` accepts only public wallet scope, readiness statuses,
signer-provider mode, ops/accounting flags, risk caps, and manual-review flags. It rejects private
keys, seed phrases, API keys, transaction bytes, signed payloads, and secret-looking fields, echoes
only redacted readiness evidence, and still keeps live execution, signing, transaction submission,
wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked.
`/api/web3-live-trade-canary` is the truthful live-money test receipt. It says whether a real
live trade has actually been tested through Mastermind, whether any real funds moved through the
app, whether the signed relay can accept an external signed payload, and why browser-wallet live
signing now needs the separate gated unsigned-order handoff before a browser wallet can sign.
It also reports the post-signing proof chain: signed relay, chain confirmation, settlement/fill
reconciliation, and portfolio mirror accounting. A wallet signature by itself is not treated as a
complete live-trade proof until those follow-through stages are recorded or explicitly blocked.
Paper loops, read-only DEX checks, and Jupiter rehearsals do not count as actual live trades.
The blocker list is ordered by prerequisites first, so the live-dex receipt points at wallet
ownership proof, Jupiter setup, live canary flags, or request-id readiness before the final
missing-signature proof.
`POST /api/web3-live-unsigned-order-handoff` is the tiny live canary bridge: it can return a
one-shot SOL-to-USDC Jupiter unsigned transaction only after `source=live-dex`, `account=persistent`,
a matching dedicated public wallet, hash-only browser-wallet ownership proof, explicit canary acknowledgement,
`return_unsigned_transaction_ack`, server `JUPITER_API_KEY`, `MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true`,
`MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS`, and
`MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true`. It never accepts private keys, seed phrases,
API keys, raw transactions, or signed payloads, and it still cannot sign, submit, store transaction
bodies, execute, custody funds, or mutate wallets.
`GET /api/web3-live-unsigned-order-handoff` is the no-transaction preflight for that same exact
canary: it checks the saved scoped wallet or typed public wallet against hash-only ownership proof,
tiny amount, slippage cap, live flags, source/account scope, and Jupiter env before any browser-wallet
connection prompt, transaction prompt, or Jupiter order creation, and still returns no transaction
bytes. Trading and Settings expose this as `Canary preflight` before `Sign tiny canary`.
The Trading canary console now shows a compact `Canary launch checklist` that separates preflight,
browser-wallet signature, signed relay, and confirmation/accounting, and it labels the result as
`Funded canary still not proven` until all four live-money proof stages are complete.
It also shows an always-visible `Canary gate snapshot` for wallet proof, live flags, unsigned
handoff/request id, relay readiness, proof count, and current blocker count, so the operator can see
why the app has not moved funds without opening JSON or running preflight first.
That snapshot includes one current-gate action driven by the drill receipt: wallet proof runs the
text-only proof, preflight runs the no-transaction check, signer relay opens the tiny canary signing
flow, proof gates run the proof watcher, and external credential gates link to the exact safe setup
surface.
It now also includes a compact first-canary execution rail under the gate snapshot. The rail starts
at the current drill step, labels the next few canary gates as now/next/queued/done, shows whether
the action lives in Trading, Settings, a read-only receipt, or a verifier, and keeps live execution,
submission, signing authority, and wallet mutation blocked until the actual proof chain clears.
The same drill operator plan and supervised-canary readiness lanes use explicit downstream actions
for signer relay, manual live review, and proof watch, so blocked later rows still tell the operator
what will happen after wallet, Jupiter, and live-flag prerequisites are cleared instead of showing
raw evidence fragments.
The Trading live canary console refreshes the first-canary drill after wallet proof, canary
preflight, tiny-canary signing, proof checks, and manual receipt refresh, so the next unblock step,
hard-fail count, proof count, and ordered gates stay current without treating paper trades, DEX
reads, or Jupiter rehearsals as live-trade proof.
Plain `/trading` now defaults to the canonical live DEX breakout canary view, and Trading source
switching plus wallet-proof/blocker/credential/canary links preserve `scenario=breakout` so the
operator does not drift between base and breakout receipts while preparing the first funded test.
It also shows the actual trade, funds moved, signed-relay, unsigned-order, hard-fail, and proof
counts in one truth strip, plus an after-current-gate forecast so the operator can see the still
blocked Jupiter, live-flag, unsigned-preflight, signer-relay, and post-signing proof runway without
opening JSON.
Settings mirrors that same first-canary truth strip and forecast, and the credential requirements
packet now points wallet-ownership proof directly to the Trading live canary console anchor when
that proof is the active gate.
It also exposes `Prove wallet` in the same live canary console, using the existing text-only
`/api/web3-wallet-ownership` flow so the operator can clear the next wallet-control gate without a
transaction signature, private key, seed phrase, wallet mutation, or fund movement. That flow now
starts with a server-issued `GET /api/web3-wallet-ownership?wallet_public_key=...` challenge
receipt, expires that text challenge after 10 minutes, rejects stale or future-dated ownership
messages, then stores only hashes plus issue/expiry/age metadata after the browser wallet signs the
text challenge. Account setup can still show durable proof evidence, but the first funded canary
preflight, unsigned-order handoff, and signed-payload relay require current proof and tell the
operator to rerun `Prove wallet` when the hash-only receipt is too old.
Trading also exposes `Check wallet` beside `Prove wallet`; it fetches the same text-only challenge
receipt for the connected or saved dedicated wallet without asking for a signature, blocks mismatched
connected wallets, and refreshes the first-canary drill so the wallet-control gate can be diagnosed
before any wallet prompt.
Trading server-renders the latest hash-only wallet ownership receipt for the scoped public wallet,
so proof created from Settings or an earlier Trading session is visible in the live canary console
after reload before another canary attempt.
When wallet ownership proof is the active operator input, the live-usability blocker receipt now
promotes that proof step into `next_blocker` and `next_credential_request`, points the safe fix link
at Trading, and lists `Check wallet`, `Prove wallet`, strict verification, and receipt refresh as
the proof runway instead of re-asking for the public wallet address.
Trading and Settings expose the actual supervised handoff as `Sign tiny canary`: the browser
first requires a visible final acknowledgement that the tiny canary can move real funds,
deserializes the one-shot transaction with `@solana/web3.js`, asks the connected wallet to sign,
then posts the serialized signed payload to the live canary relay without storing transaction
bodies or wallet authority. The acknowledgement resets after a relay attempt so a later canary
cannot reuse an old armed state.
The Trading canary also exposes `Check proof chain` and `Auto watch proof`, which call the guarded
settlement watchdog for the latest signed relay to poll confirmation, reconcile the fill, refresh
the canary receipt, and apply only the reviewed local portfolio mirror patch when evidence is clean.
The auto watch is bounded by a fixed cadence and attempt cap so a signed canary can be watched
without open-ended browser churn. This follow-through still cannot sign, submit new transactions,
custody funds, mutate the wallet, or store transaction bodies.
Settings now mirrors the same post-signing proof chain as visible rows beside the live canary
handoff commands, so signed relay, chain confirmation, settlement reconciliation, and portfolio
mirror accounting are not hidden in the JSON receipt during real canary setup.
`POST /api/web3-live-trade-canary` is the guarded action wrapper for the existing external
signed-payload relay: it requires operator acknowledgement, canary acknowledgement, live-dex
persistent scope, request id, route, and a base64 signed transaction, hashes but never echoes the
payload, rejects private keys/API keys/seed phrases/raw transaction fields, and remains blocked
unless the runtime live gates are armed.
`/api/web3-operator-credential-handoff` is the redacted credential handoff contract for
operators and external research agents. It lists allowed inputs, never-requested fields,
safe collection surfaces, env target names, next input, verifier commands, and a compact
live-usability summary with real-capital blocker count, total-versus-listed row counts,
live-lane counts, the next ordered unlock step, and the same live-execution/wallet-mutation/
transaction-submission/private-key/seed-phrase/secret-echo blocks without returning raw secrets.
`/api/web3-operator-runbook` now carries that same current safe input contract beside the
safe action map, so monitors and cockpit panels can show the one setup field to open without
fetching the longer request packet.
`/api/web3-operator-request-packet` turns that same handoff into a shareable redacted
setup packet with the live-usability summary embedded in JSON and text form, so another
helper sees blocker counts, listed rows, the next unlock step, safe inputs, and never-provide
boundaries in one pasteable artifact. It also carries a `current_input` contract and
`Current Input Contract` text section that name the one safe next input, target env or
browser-storage names, verifier command, storage rule, collection surface, and blocked
live/signing/wallet/secret permissions.
`/api/web3-research-handoff-packet?source=live-dex` is the paste-ready research brief for
another helper. It includes the next ordered unlock step, the six-step operator unlock
sequence, compact live-usability summary, open operator inputs, a structured credential
requirements packet, live-capital blockers, source endpoints, current safe input contract,
and research questions while keeping secrets,
transaction bytes, signing, wallet mutation, and live execution blocked.
`/api/web3-credential-requirements?source=live-dex` exposes that credential checklist as
standalone JSON for monitors, operators, or helper agents. It carries safe value types,
target names, collection surfaces, storage rules, completion signals, the next requirement,
and blocked live/signing/wallet/secret permissions only; it never returns provider secrets,
private keys, seed phrases, raw transactions, signed payloads, or trading authority.
`npm run --silent requirements:web3 -- --base-url=http://localhost:4010` prints the same
credential-only packet as paste-ready Markdown, or add `--json` for the full redacted receipt.
The Settings credential console can also detect or connect a browser Solana wallet only
far enough to read the public address into the dry-run scope, then optionally prove wallet
ownership with a text-only signature whose local audit receipt stores only challenge and signature hashes.
The sample all-ones Solana wallet remains allowed for demo/public-scope rehearsal, but the
account setup and provider-readiness receipts mark it as demo-only and keep the dedicated
operator-wallet gate missing until a real public trading wallet is scoped.
It does not request transaction signatures, store wallet secrets, submit transactions, or
mutate balances.

## Architecture: the engine and the app

The two worlds talk through **files, not RPC**. The engine writes one schema-validated
JSON bundle per dated run; the app reads the newest valid bundle and falls back to
seeds when none exists. Pydantic validates on write, zod validates on read. See
[`engine/CONTRACT.md`](engine/CONTRACT.md).

The engine runs as a staged funnel (cost scales with market activity, not the calendar):

```text
Stage 0  Data refresh (free)   shared per-ticker + one global news fetch, cached
Stage 1  Alert filter (free)   raw market moves -> prioritized alert JSON AND
                               the list of tickers that earn a full agent run
Stage 2  Agent runs (paid)     full TradingAgents pipeline ONLY for triggered tickers
Stage 3  Outcome resolution    Phase B for pending journal entries; scores paper rounds
Stage 4  Export                adapter writes the briefing + alerts + journal-sync bundle
```

A quiet day where nothing needs review costs zero LLM spend and renders an honest
"nothing urgent today." Every engine artifact carries `event_time` and
`knowledge_time`; the app rejects future-stamped bundles and normalizes malformed older
saved scans so visible knowledge time never appears before event time. That keeps
bitemporal "as-of" replay honest with no look-ahead.

The additive fork delta is small and lives in the engine package
([`engine/mastermold_engine/schemas.py`](engine/mastermold_engine/schemas.py)), proven
against the real upstream schemas by the integration test: a `DriverList` schema,
`bull_case_summary` / `bear_case_summary` on `ResearchPlan`, and `falsification_condition`
on the PM `PortfolioDecision`.

## Product Intent

The long-range Master Mold concept is a personal financial agent with three layers:

1. **Brain** — a self-maintaining market and memory engine with point-in-time data
   discipline, reflection, and a significance-gated belief loop.
2. **Copilot** — a daily read, alerts, portfolio advisor, decision journal, and chat
   that reasons over the operator's holdings. Advisory only — the operator executes every
   real trade themselves.
3. **Executor** — a future bounded Web3 automation layer with capped authority,
   approved contracts, preflight checks, and human approval.

The app now has saved-scan Copilot reasoning plus a local memory snapshot used by chat.
The full always-on Brain, broad connected-portfolio coverage, and automated Executor remain
future work; the Executor is still a display-only monitor that signs nothing.

## What Works In This Repo

- Today page with a short daily read, prioritized ideas, relevance, bull/bear detail,
  confidence, horizon, and market notes; saved-scan-backed when a run exists, seeded otherwise.
- Briefing detail with market notes, evidence timing, and the linked, falsification-stamped
  decision-journal entry.
- Alert inbox and full Alert Feed with plain severity labels, "why it matters," dismiss,
  restore, and useful/not-useful feedback; raw source detail is hidden by default.
- Portfolio view with total value, today's move, manual holdings, explicit account
  holdings snapshots, freshness labels, on-chain positions, allocation,
  net-worth-over-time, and concentration scoring.
- Decision journal with pre-outcome call logging, "what would prove this wrong"
  checks, outcome scoring, confidence tracking, and a reflection significance
  gate computed from resolved engine decisions.
- Paper trading that compares the operator's paper trades with Master Mold's simulated calls —
  zero capital, no confetti.
- Global Master Mold chat plus the `/chat` route. Chat uses live OpenRouter, Anthropic,
  or OpenAI inference when a key is available, and falls back to a fixed advisory read.
- Market-memory snapshot plus a schedule-check endpoint that local automation can call;
  automatic broad internet/news scanning is still off by default.
- Executor preview with display-only metrics, guardrail controls, and a kill-switch drill
  that signs nothing.
- `/review` Performance & Trust surface with an engine-status card, per-run cost,
  ingested run history, alert feedback, and what is real/sample/not built.
- Honest status labels ("Saved scan", "Sample", "Manual portfolio", and "Imported portfolio") on surfaced facts; bitemporal
  as-of replay over both engine and seeded data.
- Durable `bun:sqlite` store behind journal/paper/alerts with idempotent engine ingestion.
- A static read-only enforcement test plus broad TypeScript route, copy, persistence,
  and user-journey coverage; the Python engine also has deterministic tests and an
  integration test against the real TradingAgents schemas.

## What Does Not Exist Yet

Intentionally not implemented / blocked on credentials or ops:

- The **scheduled full multi-agent engine run** (market-data keys, the LangGraph/LangChain
  dependency tree, Python 3.10+). Live chat works when a chat key is available,
  but the always-on run cadence is still ops work.
- Always-on cron scheduling, Anthropic prompt caching, and batch-API reflections (Phase 4).
- Broad live brokerage, exchange, or wallet sync. Settings can explicitly import some
  Coinbase, SnapTrade, and Zerion holdings snapshots, but unknown-asset pricing, full account
  coverage, and scheduled refresh are not complete.
- Automated equity trading (architectural non-goal — permanent).
- Real Web3 execution, signing, simulation, custody, on-chain spend caps, or chain RPC.
- Long-horizon live/out-of-sample forward evaluation with external baseline comparisons,
  real route costs, enough resolved calls, and pass/fail gates written before seeing results.
- CPA-reviewed tax treatment before any real capital.
- Multi-user accounts, public signup, or managing anyone else's money.

## Safety Boundaries

The central invariant is read-only advisory behavior.

- The app must never place a trade or move funds. The engine only reads market data
  and writes JSON; it never touches a brokerage.
- The `/api/executor` route is a seeded local monitor endpoint only, allowlisted in the
  read-only test because it is not a brokerage or wallet write path.
- Credential entry is optional and local. The app runs with zero credentials. AI-service
  keys live only in `engine/.env` or `.env.local` and are never committed.
- `knowledge_time` is stamped at engine write time; ingestion rejects future-stamped
  bundles and clamps malformed older saved files forward when a row would otherwise
  appear known before its event time.
- Any future live integration must preserve physical separation between read tools and
  execute tools, and any executor must fail closed behind enforceable policy boundaries.

## Tech Stack

App:

- Next.js App Router, React, TypeScript, Bun runtime
- Tailwind CSS, Radix Slot/Label primitives, Lucide icons, TradingView Lightweight Charts
- `zod` for engine-output validation; `bun:sqlite` for durable persistence (zero new deps)
- Local seeded data + engine ingestion in `src/db`; Bun test runner

Engine (`engine/`, separate runtime):

- Python 3.10+ managed with `uv`; pydantic v2
- A fork of TradingAgents (LangGraph multi-agent framework) pinned as a dependency, with
  the small additive schema delta in the engine package
- Deterministic mapping modules (conviction, screener, adapter, beliefs, journal bridge,
  cost, export) are dependency-light and unit-testable on a plain Python

## Repository Structure

```text
app/                         Next.js pages and read-only API routes
components/                  App UI components and shared primitives
src/db/                      Schema, seeds, bitemporal helpers, and:
  engine-data.ts             zod ingestion of engine bundles + provenance/run history
  store.ts                   durable bun:sqlite store (journal/paper/alerts) + fallback
  screener-feedback.ts       alert-feedback -> alert-rule tuning
engine/                      Python sidecar engine (own runtime, own .env)
  CONTRACT.md                the JSON bundle schema both sides validate
  config.yml                 watchlist, models, screener thresholds, budget cap
  mastermold_engine/         conviction/screener/adapter/beliefs/journal_bridge/...
  tests/                     deterministic + real-schema integration tests
tests/                       read-only enforcement, UAT, and engine-on test suites
tests/fixtures/engine/       contract-faithful engine bundles used by app tests
docs/ref/                    original first-party Master Mold PRDs and buildspec
spec.md, runbook.md          generated RDS implementation spec and runbook
ref/                         integration plan + the TradingAgents study clone (untracked)
```

## Main Routes

| Route | Purpose |
| --- | --- |
| `/` | Today page with the daily read (engine-backed or seeded) |
| `/briefing/[id]` | Briefing card detail with drivers + linked journal |
| `/alerts` | Alert Feed (saved market scan or sample data) |
| `/portfolio` | Consolidated read-only portfolio |
| `/journal` | Decision journal, saved calls, result scoring, and belief gate |
| `/paper` | Paper trading with a simulator account, paper trades, and results |
| `/chat` | Full-page chat; the global chat drawer is available from the app shell |
| `/executor` | Executor preview; display-only and signs nothing |
| `/review` | Performance & Trust: past calls, real/sample status, cost, and run history |
| `/settings/integrations` | Manual holdings, market-memory init, and connection tests |
| `/api/health` | Health check |

## Local Development

### App

```bash
bun install
bun run dev            # http://localhost:3000 (or set the port)
bun run test           # typecheck + the full Bun test suite
npm run verify:web3    # Node-only Web3 credential/readiness gate against localhost:4010
```

To see the app with a saved scan, point it at the bundled fixtures and use a local DB:

```bash
ENGINE_OUT_DIR="$(pwd)/tests/fixtures/engine" \
MASTERMOLD_DB="$(pwd)/.data/mastermold.db" \
bun run dev
```

With no `ENGINE_OUT_DIR` (the default), every surface renders from seeds — the permanent
zero-config fallback.

### Engine

The engine is a self-contained Python package with its own venv and keys (`engine/.env`,
gitignored). Its deterministic mapping is testable without keys or network:

```bash
cd engine
python tests/test_deterministic.py          # 16 tests, plain Python, no deps

# Integration test vs the real TradingAgents schemas (needs pydantic):
python -m venv .venv && .venv/bin/pip install pydantic
.venv/bin/python tests/test_integration.py

# Full run (needs the fork + market-data keys in engine/.env):
uv venv && uv pip install -e .
cp .env.example .env                         # add your market-data key
uv run python -m mastermold_engine.run_briefing --date 2026-06-05
```

`bin/engine-briefing` (repo root) is a thin wrapper around the run entry point. The
app ingests the newest `engine-run-*.json` from `engine/out/` automatically.

### Scheduling the daily scan

Three ways to keep the read fresh, all writing the same run history (every attempt —
including failures — is recorded and shown in the app):

1. **In-app:** the **Run today's scan** button on Today calls `POST /api/scan`,
   which spawns the engine, ingests the bundle, settles due paper rounds, and
   refreshes chat context. Use this when running interactively.
2. **Local schedule (cron/launchd):** hit the same endpoint on a cadence while the
   app is running, e.g. `30 13 * * 1-5 curl -s -X POST http://localhost:3000/api/scan
   -H 'Content-Type: application/json' -d '{"trigger":"cron"}'` — or run
   `bin/engine-briefing` directly; the app ingests the newest bundle on the next
   page load.
3. **Zo (the primary deployment):** register `bin/zo-start` as a Service and an
   Automation that runs `bin/engine-briefing` (or curls `/api/scan`) each
   weekday before the market opens — see [docs/deploy-zo.md](docs/deploy-zo.md)
   for the full recipe. Zo restarts are safe: runs are idempotent by date and
   the app falls back to the last saved read.

Interactive scans default to the engine's direct synthesis path
(`MASTERMOLD_ENGINE_ADAPTER=direct`); set `MASTERMOLD_ENGINE_ADAPTER=auto` to let
scheduled runs attempt the full TradingAgents graph first.

## Documentation

- `engine/CONTRACT.md` — the engine ⇄ app JSON contract.
- `engine/README.md` — engine setup, the fork delta, and how to run it.
- `ref/mastermold-integration-plan.md` — the phased integration roadmap.
- `docs/ref/financial-agent-PRD.md` and `-blueprint-v3-buildspec.md` — original PRD/spec.
- `spec.md`, `runbook.md` — the generated RDS implementation spec and runbook.

## License

No license has been declared yet. Treat this as private, all rights reserved unless Chris
adds an explicit license.

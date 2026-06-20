# Web3 Credentials And Readiness Runbook

This runbook covers the Mastermind Web3 credentials setup flow. The goal of this flow is to move the app from paper-only sample mode toward read-only provider and wallet verification, then dry-run order rehearsal. It does not enable live autonomous trading.

## Current Boundary

- The app may test Solana RPC, wallet public-key scope, read-only Helius DAS wallet asset visibility, Jupiter quote readiness, Jupiter unsigned order readiness, signer mode, and risk caps.
- The app may apply those values to the existing Web3 dry-run execution profile.
- The app must not store private keys, sign transactions, submit transactions, custody funds, or mutate wallet balances.
- Browser storage may keep non-secret preferences like wallet public key, signer mode, and risk caps, but must not store Helius or Jupiter API keys.
- Live-capital execution remains blocked until the launch checklist reaches manual live review and an external reviewed executor is deliberately enabled.

## Local Environment

Use ignored local environment files for secrets. Do not commit real API keys.

Recommended local values:

```bash
HELIUS_API_KEY=...
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=... # optional override; derived from HELIUS_API_KEY when omitted
SOLANA_WS_URL=wss://mainnet.helius-rpc.com/?api-key=...
JUPITER_API_KEY=...
MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER=external-wallet
PRIVY_APP_ID=...                         # optional policy signer review
PRIVY_APP_SECRET=...                     # optional policy signer review
PRIVY_SOLANA_WALLET_ID=...               # optional policy signer review
TURNKEY_ORGANIZATION_ID=...              # optional policy signer review
TURNKEY_API_PUBLIC_KEY=...               # optional policy signer review
TURNKEY_API_PRIVATE_KEY=...              # optional provider API credential, not wallet key
TURNKEY_SOLANA_WALLET_ACCOUNT=...        # optional policy signer review
MASTERMOLD_SESSION_KEY_PUBLIC_KEY=...     # future session-key review
MASTERMOLD_SESSION_POLICY_HASH=...        # future session-key review
```

Optional provider and operations targets can be added after the required Helius/Jupiter/wallet rail is healthy:

```bash
BIRDEYE_API_KEY=...                         # optional paid market enrichment
PUMPFUN_FEED_URL=...                        # optional launch-feed provider URL
YELLOWSTONE_GRPC_ENDPOINT=...               # optional low-latency read stream
YELLOWSTONE_GRPC_TOKEN=...                  # optional stream token
MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL=...   # future supervised-live ops
MASTERMOLD_EMERGENCY_STOP_CONTACT=...       # future supervised-live ops
MASTERMOLD_TAX_LEDGER_EXPORT_PATH=...       # future reviewed fill/accounting export
MASTERMOLD_WEB3_PROCESS_MANAGER=...         # production worker review target
MASTERMOLD_WEB3_WORKER_OWNER=...            # production worker owner/escalation
MASTERMOLD_WEB3_ALERT_WEBHOOK_URL=...       # production worker alert target
MASTERMOLD_WEB3_RESTART_POLICY_URL=...      # production restart/runbook URL
```

Keep these live-execution flags unset unless doing a separate manual live review:

```bash
MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=
MASTERMOLD_LIVE_OPERATOR_APPROVAL=
```

## In-App Flow

1. Open `/trading`.
2. Review `Launch checklist`, `Operator input packet`, `Launch repair queue`, and `Researched stack decisions` to see the selected provider, market, execution, signer, risk, storage rules, repair actions, and live-cutover path.
3. Select the `Wiring` focus in the operator focus deck.
4. Use `Web3 credential setup`.
5. Enter or rely on server environment values for Helius/Solana RPC and Jupiter. API key fields are session-only in the browser form and are not saved to browser storage. In local development only, Settings can use `Install local env` to write Helius, Solana RPC/WebSocket, Jupiter, signer-provider, emergency-stop, production-worker, and accounting/export values into ignored `.env.local` through `POST /api/web3-local-credentials`; that route is localhost/opt-in only, allowlists provider API credentials such as Privy app secret or Turnkey API private key, rejects wallet private-key, session private-key, seed-phrase, mnemonic, or keypair fields, clears page-sensitive fields after success, returns configured/missing key names only, and still cannot start workers, sign, submit, custody funds, mutate wallets, dispatch webhooks, or unlock live execution.
6. Enter a Solana wallet public address only, or use `Detect wallet` / `Connect wallet` to read only the public address from a browser Solana wallet. Never enter a private key.
   The sample all-ones Solana address may be used for demo/public-scope checks, but it is treated as demo-only and does not satisfy the dedicated trading-wallet gate.
7. Use `Prove ownership` only after the browser wallet is connected. It asks the wallet to sign a plain text Mastermind ownership challenge, posts it to `POST /api/web3-wallet-ownership`, and records a hash-only local audit receipt proving public wallet control. This is not a transaction signature and it cannot move funds.
8. Keep signer mode on `Manual external wallet` for the first live path.
9. Set conservative caps, for example `$250` max trade, `$1,000` daily cap, and `150` bps max slippage.
   Execution readiness reports cap status as ready, exhausted, or too-small. If the dry-run cap is exhausted, use the cockpit `Dry-run cap recovery` action to reset the persistent paper account or save a higher local dry-run daily cap before more paper/order rehearsal; this does not unlock live execution.
10. Press `Test credentials`.
11. Press `Apply dry-run profile` only after provider, wallet, and route evidence is acceptable.
12. Run `npm run landing-drill:web3` to confirm the landing path is still safely blocked before live signing/submission.
13. Run `npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json` to perform one read-only market monitor pass. It refreshes DEX discovery, auto-resolves a GeckoTerminal OHLCV candidate, records local candle proof for the cockpit, appends a sanitized monitor tape to `data/web3-market-monitor-history.json` or `WEB3_MARKET_MONITOR_HISTORY_PATH`, and still cannot sign, submit, custody funds, mutate wallets, or unlock live capital. If live DEX candle auto-resolution hits stale discovery, it performs one bounded read-only discovery refresh and one OHLCV retry, then writes a degraded receipt if current candle proof is still unavailable.
14. Use the Wiring focus `Build account receipt` control to create a redacted setup receipt from local provider-account configuration and current wallet gates. It reports whether Helius/Solana, Jupiter, a dedicated public wallet, signer posture, emergency stop, and accounting targets are configured or missing without creating external accounts or echoing secrets.
15. Use the Wiring focus `Test provider health` control to create a redacted provider-health receipt. It performs read-only Solana RPC, latest-blockhash, Helius DAS, Jupiter quote, and Jupiter order-gate checks from server environment values without returning API keys, raw wallet holdings, transaction bodies, signatures, or wallet authority.
16. Use `Rehearse Jupiter order` in the Web3 credential setup card to create a one-shot Jupiter rehearsal receipt. It accepts a session-only Jupiter key or server `JUPITER_API_KEY`, proves SOL-to-USDC quote/order readiness when possible, hashes request evidence, appends a sanitized proof tape to `data/web3-jupiter-rehearsal-history.json` or `WEB3_JUPITER_REHEARSAL_HISTORY_PATH`, withholds unsigned transaction bytes, and keeps execute/sign/submit/live trading blocked.
17. Use the Wiring focus `Build signer receipt` control to create a redacted signer handoff receipt from custody, hash-only request, pre-submit, relay, and live-boundary state. It never stores private keys, raw transaction bodies, unsigned payloads, signed payloads, or wallet authority.
18. Use the Wiring focus `Build ledger receipt` control to create a redacted local accounting receipt from the paper ledger, wallet-readiness state, settlement status, and mirror gates.
19. Review the cockpit or Wiring focus `Production worker review` panel after `npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json` writes a sanitized paper-supervisor receipt, or use `Refresh paper supervisor` in the cockpit to run the same one-round sample-source paper refresh through `POST /api/web3-supervisor-refresh`. It checks receipt freshness, circuit state, profit target, drawdown brake, and the live-boundary process gate, plus redacted process manager, worker owner, alert route, and restart-policy target status. It cannot install a process manager, start an external worker, dispatch alerts, sign, submit, mutate wallets, or authorize live capital from inside the app.
20. Use the Wiring focus `Run stop drill` control to record a local dry-run emergency-stop receipt. The drill halts browser Auto Watch and verifies ops target status, but it does not send webhooks, stop external processes by itself, sign, submit, or mutate wallets.
21. Run `npm run doctor:web3 -- --json` against the local app to write `data/web3-credential-doctor.json`, a sanitized local receipt that compares account setup, provider health, launch checklist, live preflight, manual live-review packet, market-monitor history, Jupiter rehearsal history, and production-supervisor boundaries. It stores configured/missing status, blockers, and safe commands only; it does not echo Helius/Jupiter keys, create accounts, sign, submit, or mutate wallets. When the production-supervisor receipt is stale, run `npm run doctor-repair:web3 -- --json` to let the doctor refresh one bounded paper-supervisor round before rewriting the same sanitized receipt; this still cannot sign, submit, custody funds, mutate wallets, or unlock live capital.
22. Run `npm run --silent research:web3 -- --base-url=http://localhost:4010` to print the redacted Web3 research handoff as paste-ready Markdown for another helper, or add `--json` for the full redacted receipt. The command refuses the packet if live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, or secret echo are not blocked, and it redacts configured local provider secrets from failures.
23. Run `npm run verify:web3 -- --base-url=http://localhost:4010` against the local app. This Node-only gate does not require Bun; it snapshots the current public wallet/risk scope, checks health receipts, malformed wallet rejection, private-field rejection, public-wallet dry-run scope save, wallet-ownership proof redaction, account setup redaction, validate-only credential readiness, Helius/Solana provider-health evidence when the read rail is configured, usability-status redaction, live-usability blocker redaction, direct dedicated-wallet/Jupiter-order/signer-credential/live-ops/live-capital-preflight/accounting-ledger packet boundaries, operator request/cutover/runbook/supervised-runway packet boundaries, manual live-review packet boundaries, research handoff and research-answer implementation queue boundaries, read-only DEX discovery receipt boundaries, one-shot Jupiter rehearsal redaction, unsigned-transaction withholding, and live-execution/wallet-mutation locks, then restores the original public wallet/risk scope.

The Settings page also includes a `Web3 trading credentials` runway card. It shows the same account-setup receipt as configured/missing status for Helius/Solana, Jupiter, dedicated wallet, signer posture, emergency-stop ops, accounting targets, and hash-only wallet ownership proof, then links back to both `/trading?source=sample` and `/trading?source=live-dex` for sample review, public DEX reads, provider tests, and dry-run receipts. Its first panel is now a `Credential command center` that condenses the next safe input, safe-in-Settings lanes, external-only lanes, strict verifier command, and never-provide boundary before the deeper receipts. It now follows that with a `What is left for real money` panel backed by `GET /api/web3-live-usability-blockers`, showing missing rows, live-lane counts, signoff counts, safe actions, and the next safe action before any credential fields. It then shows a `Credential safety matrix` that groups every setup lane by Settings console, server env only, browser wallet, external review, or never accepted, using target names and labels only so the operator can see exactly where each credential belongs before touching fields. Its next panel is an `Operator intake` board that names the next safe input, collection surface, storage rule, verifier command, safe-to-provide request packet, open required lanes, and never-provide list before the deeper receipts. Settings now renders the same cutover blocker board as the trading cockpit, grouping open setup work by owner, separating the next safe input from the next supervised-live blocker, linking to `/api/web3-cutover-blocker-board`, and naming only safe collection surfaces, env target names, storage rules, and verifier commands. Its `Secure credential handoff` summarizes which lanes are ready, which input is next, and the safe verifier command to run after each credential change without echoing secrets. Its `Dedicated wallet packet` separates the operator-wallet gate from signer setup: it rejects the sample all-ones wallet for readiness, asks for a public Solana address only, points at text-only ownership proof, exposes the strict `--require-operator-wallet` verifier command, links to Solana wallet docs, and keeps signing, submission, live execution, wallet mutation, private keys, and seed phrases blocked. Its `Jupiter order packet` separates the Swap V2 order rail from general account setup: it reports whether `JUPITER_API_KEY` is server-scoped, whether a dedicated public wallet is ready, whether Swap V2 order evidence is present, how to run `POST /api/web3-jupiter-rehearsal`, and the strict `--require-jupiter-order` verifier while withholding transaction bytes and blocking execute, signing, submission, live execution, and wallet mutation. Its `Live ops packet` consolidates production-worker review, emergency-stop target status, paper-supervisor freshness, accounting/export readiness, process-manager review, redacted production-worker process/owner/alert/restart target status, safe commands, and manual live-review requirements while hiding raw webhook/contact/alert values and keeping external dispatch, live execution, transaction submission, and wallet mutation blocked. Its `Manual live-review packet` consolidates the launch checklist, live-capital preflight, supervised runway, and live ops packet into external review signoffs while keeping in-app signing, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked. Its `Credential doctor receipt` panel reads the latest sanitized doctor file and shows local check status plus safe commands without exposing paths or secret values, including the optional paper-supervisor refresh command when that local receipt is stale. It also shows a `Signer credential packet` that compares manual external wallet, Privy server wallet, Turnkey policy wallet, and future session-key paths, names only env target names and setup/docs links, and reports selected-path evidence without storing signer secrets, private keys, seed phrases, transaction bodies, signed payloads, or wallet authority. It also shows the launch-blocker queue from the same launch checklist used by the trading cockpit, including hard blockers, review gates, and the next cutover step while live execution remains blocked. Settings now includes an `Operator input packet` from that same launch checklist. The packet names the exact safe inputs and external decisions still needed for supervised trading review: Helius/Solana read rail, dedicated trading wallet, wallet ownership proof, Jupiter route/order key, signer/custody choice, signer provider credentials, settlement/accounting review, and manual live approval. Its `Next operator action` callout separates the immediate credential or approval the operator must provide from the longer engineering cutover runway, so a missing Jupiter key or dedicated wallet does not get hidden behind paper-profit repair. Each row labels its storage rule as server env, browser public scope, hash-only local receipt, future signer vault, never-store, or external operator review; private keys and seed phrases stay out of the app. Settings also shows the same `Launch repair queue` as the cockpit for paper accountability repair, supervisor refresh, route/order rehearsal, operator input scope, and verifier actions. It also shows a full credential checklist with official setup/docs links, storage rules, required env names, test actions, and the next external operator action for every provider/account lane. The external setup packet now includes a `Policy signer provider` lane plus ignored-env template targets for Privy, Turnkey, future session-key review, and production-worker operations while keeping wallet/session private keys out of the app. Settings now includes a `Credential action console` for session-only Helius/Jupiter/wallet tests, local-only ignored-env installation, signer-provider env target setup for Privy, Turnkey, or session-key review, production-worker process/owner/alert/restart target setup, browser-wallet public-address detection, text-only wallet ownership proof, and read-only DEX scanner testing. That console can call the same credentials test, local credential install, ownership proof, DEX discovery, and Jupiter rehearsal routes, and it can save only public wallet scope plus dry-run risk caps into the Web3 trading state. It now includes emergency-stop webhook/contact, accounting export target, production-worker target fields, and signer-provider target fields in the same local-only installer, reports those values only as env target names, rejects wallet private keys, session private keys, and seed phrases, and still cannot dispatch webhooks, start workers, create external accounts, sign transactions, submit, execute, or mutate wallets.

## Researched Default Stack

- Provider stack: Helius/Solana RPC first for read-only wallet and chain data, plus Helius DAS `getAssetsByOwner` for wallet-held asset visibility, with secrets kept in server env or one-shot test inputs.
- Market discovery: use the app's live DEX/read-only intake, chart proof, route proof, and wallet marking before adding paid discovery feeds.
- Execution stack: use Jupiter Swap V2 `/order` for quote plus unsigned order rehearsal first, then keep `/execute`, signing, and submit out of scope until manual live review.
- Signer custody: start with a dedicated trading wallet and manual external wallet approval; do not collect private keys in the app.
- Risk policy: keep conservative per-trade caps, daily spend caps, max slippage, paper proof, and kill-switch review ahead of live autonomy.
- Live cutover: require supervised worker proof, profit proof, signer proof, settlement proof, wallet accounting, and manual live review before real-capital trading.

When `HELIUS_API_KEY` is set, the app can derive the Helius mainnet RPC endpoint for read-only wallet accounting even if `SOLANA_RPC_URL` is omitted. When the resolved Solana RPC endpoint is Helius, live wallet accounting also attempts an aggregate DAS asset-index proof. That proof records asset counts, fungible counts, priced-asset counts, and priced value only; it does not store raw wallet holdings, authorize signing, or unlock live execution.

The launch checklist now separates provider readiness into a read-provider rail and a signer-provider rail. `HELIUS_API_KEY` or `SOLANA_RPC_URL` plus `JUPITER_API_KEY` can make the read rail ready for wallet, route, and order rehearsal evidence, but signer/custody credentials, policy hashes, user approval, settlement, and manual live review are still separate gates.

The trading cockpit now opens with a read-only `Market source` switch plus a `Command board` before the large autonomous workspace and before the deeper readiness receipts. The source switch and page provenance make sample review tape versus `source=live-dex` public DEX reads explicit without changing signing or wallet authority. The command board combines the current autonomous decision, paper wallet net-worth curve, equity/PnL/exposure/drawdown metrics, primary safe action, runnable/gated counts, open blocker count, live-capital preflight score, next usable gate, supervised-live lane count, missing operator inputs, signal score, route proof, and a `Real-money usability` card that summarizes the new live-usability blocker receipt. It links to `/settings/integrations` for secure setup, labels operator inputs as non-secret planning items, and still keeps live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked. The detailed live-usability blocker, usability, cutover, and runbook receipts remain available in a collapsed `Readiness receipts and runbook` drawer so reviewers can inspect evidence without turning the operating screen into a long diagnostic scroll. The deeper workspace still includes the autonomy mode ladder that separates copilot, paper autonomy, dry-run order rehearsal, supervised live review, and autonomous live authority for the longer telemetry review.

The trading cockpit launch checklist also includes a `Launch repair queue`. It converts raw blockers into the next safe repair action for fill quality, paper accountability, production-supervisor freshness, route/order rehearsal, operator input scope, and the Node verifier. Queue commands such as `npm run repair-accountability:web3`, `npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json`, `npm run landing-drill:web3`, and `npm run verify:web3 -- --base-url=http://localhost:4010` refresh paper or readiness evidence only. They cannot create external accounts, sign transactions, submit swaps, custody funds, or unlock live capital.

`npm run repair-accountability:web3` also writes a sanitized local paper accountability repair receipt to `data/web3-local-accountability-repair.json`, or to `WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH` when that env target is set. The launch checklist reads that receipt as `local_accountability_repair_health` and uses it to show whether the latest repair improved, completed, blocked, became stale, or made no progress. The receipt stores only paper scores, attempt counts, summary text, blockers, and blocked live/wallet permissions; it does not store local paths in API responses, provider keys, private keys, raw transactions, signed payloads, or wallet authority.
The repair plan compares stale-heartbeat blocker copy against the current monitor heartbeat before writing the operator next action, so fresh monitor evidence points at route, preflight, or profit-lock repair instead of stale monitor guidance while true stale heartbeats still block repair.
The session supervisor uses the same distinction: a fresh monitor that is standing down because execution is blocked becomes watch/observe evidence, not a stale-heartbeat failure. Downstream run-envelope blockers should therefore point at route, preflight, risk, or profit-lock gates.

The cutover runway also consumes that same repair-health receipt. When the latest fresh receipt is blocked or no-progress, the `Prove paper edge` step becomes blocked and points at the receipt's next action instead of presenting another repair cycle as if it is still enough. The cockpit and Settings both show a compact local paper repair-health panel with receipt freshness, score, attempts, score delta, plateau state, and the safe next action.

When the launch checklist is built from `live-dex`, the safe paper-accountability repair command becomes `npm run repair-accountability:web3 -- --source=live-dex`. That mode may only post backend-authored read-only route-refresh repair requests. It refuses live-dex autonomous sessions, signing, submission, wallet mutation, private keys, raw transactions, and real-capital authority. Sample mode still supports bounded local paper-session repair.

When running from a standalone build, the app may have both a copied `.next/standalone/data` receipt and a workspace `data` receipt. The launch checklist reads the freshest sanitized repair receipt across those local receipt locations unless `WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH` is set, so the operator sees the latest safe repair result after a terminal repair command.

When public DEX discovery rate-limits or fails, live-dex fallback receipts keep a held-position watchlist row visible as failed/blocked evidence. This lets the cockpit show that protective monitoring needs fresh DEX data while fresh entries remain blocked.

Live DEX dry-run reads also expose a read-only wallet activity history receipt when a public wallet and Solana RPC are scoped. It uses `getSignaturesForAddress` to summarize recent signatures, slots, block times, and failure counts with signature previews and hashes only. It does not return raw transaction bodies, sign, submit, decode full swaps, or mutate balances.

When `HELIUS_API_KEY` is set, live DEX dry-run reads can also expose a read-only wallet transaction intelligence receipt from Helius Enhanced Transactions address history. It classifies recent decoded wallet transactions into swap, transfer, mint, burn, failure, or other buckets, counts token/native transfers, estimates visible fees, and hashes signatures. This is context for wallet monitoring and PnL review only. Helius marks Enhanced Transactions as deprecated for new parser coverage, so settlement-critical fills still need standard RPC reconciliation through `getTransaction`/confirmation evidence before live PnL is trusted.

The credential setup response now includes a credential vault plan with four explicit levels: read-only wallet sync, dry-run order rehearsal, supervised live review, and autonomous live trading. Only the first two levels can become ready in the app today. Supervised live and autonomous live stay blocked until signer custody, worker operations, emergency stop, settlement/accounting proof, long-horizon profit proof, and manual live review are separately completed. The plan also labels each input by storage rule: server environment, one-shot session input, browser-safe non-secret, future signer vault, or never-store. Private keys and seed phrases are always `never-store`.

The response also includes a provider account runway. It turns the researched stack into app-visible setup lanes: Helius/Solana read rail, Jupiter Swap V2 order rail, dedicated trading wallet, manual external signer, public DEX discovery fallback, future paid market feeds, future low-latency stream provider, emergency-stop operations, and tax/accounting ledger. This runway tracks which external accounts or provider keys are configured, needed, optional, future, or blocked; it does not create third-party accounts, transmit secrets, or grant live trading authority. Optional provider values are reported only as configured/missing status, never as raw secret values.

The Wiring focus also exposes:

```text
GET /api/web3-account-acquisition
GET /api/web3-account-setup
GET /api/web3-accounting-ledger
GET /api/web3-cutover-blocker-board
GET /api/web3-dedicated-wallet-packet
GET /api/web3-dex-discovery
GET /api/web3-jupiter-order-packet
GET /api/web3-jupiter-rehearsal-history
GET /api/web3-live-capital-preflight
GET /api/web3-live-ops-packet
GET /api/web3-manual-live-review-packet
GET /api/web3-market-monitor-history
GET /api/web3-ohlcv
GET /api/web3-operator-request-packet
GET /api/web3-operator-runbook
POST /api/web3-research-answer-intake
GET /api/web3-research-handoff-packet
GET /api/web3-provider-health
GET /api/web3-signer-credential-packet
GET /api/web3-signer-handoff
POST /api/web3-supervisor-refresh
GET /api/web3-supervised-live-runway
GET /api/web3-usability-status
POST /api/web3-emergency-stop/drill
POST /api/web3-jupiter-rehearsal
POST /api/web3-wallet-ownership
```

The account acquisition route returns the external setup packet used by Settings. It can name official setup/docs links for Helius, Jupiter, wallet, signer, emergency stop, and accounting work; report configured/needed/blocked/future status; and emit a redacted env template with target variable names only. It cannot create external accounts, submit signup forms, store credentials, sign, submit, custody funds, or mutate wallets.

The account setup route returns a redacted receipt with provider-account status for Helius/Solana reads, Jupiter Swap V2 order rehearsal, the dedicated public wallet, signer posture, emergency-stop ops, accounting, and optional market-feed lanes. It detects whether expected local env targets are configured but never returns their values. It also separates `wallet_scoped` from `dedicated_wallet_scoped`, so a demo all-ones wallet can prove the save path without satisfying live-readiness review. It does not create third-party accounts, submit signup forms, store secrets, sign, submit, custody funds, or mutate wallets; external account creation remains operator-owned outside the app.

The operator credential handoff route, `GET /api/web3-operator-credential-handoff`, returns the machine-readable version of the Settings handoff packet. It names safe inputs, never-requested fields, collection surfaces, env targets, next input, and verifier commands for Helius/Solana, Jupiter, dedicated wallet, wallet ownership proof, signer provider, emergency stop, production-worker ops targets, accounting/export target, settlement/accounting review, and manual live approval. It can guide another agent or reviewer through setup without returning raw secrets, private keys, seed phrases, transaction bodies, signed payloads, live execution permission, or wallet mutation authority.

The operator request packet route, `GET /api/web3-operator-request-packet`, turns the same handoff contract into a shareable redacted request packet for another helper or reviewer. It includes required input rows, review rows, safe-to-provide values, never-provide values, verifier commands, and a text packet that can be pasted into research or setup workflows. It returns only env target names and status text; it does not echo configured secrets, accept private keys, sign, submit, mutate wallets, or grant live execution.

The cutover blocker board route, `GET /api/web3-cutover-blocker-board`, reconciles the operator request packet, supervised-live runway, and usability receipt into one owner-grouped setup board. It separates the next safe input from the next supervised-live lane blocker, counts open work by now/before-live/review phase and by operator/security/ops/accounting/manual-review owner, lists safe collection surfaces, env target names, storage rules, live-lane dependencies, and verifier commands, and keeps live execution, signing, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked. The `/trading` cockpit feeds its open-blocker count and next safe input into the first-screen command board, while the full board stays in the collapsed readiness receipts drawer.

The operator runbook route, `GET /api/web3-operator-runbook`, turns usability, cutover, preflight, and supervised-live receipts into a safe action map. It names which app links or local commands can run now, which actions are gated, which real-capital gates still block live trading, and the primary next safe action. It returns only permission scopes, links, commands, target names, and status text; it cannot sign, submit, custody funds, mutate wallets, echo secrets, or approve autonomous live trading. The `/trading` cockpit now promotes the primary safe action and runnable/gated counts into the first-screen command board, keeps the full runbook in the collapsed readiness receipts drawer, and Settings renders the same runbook inside the credential runway before the deeper credential handoff.

The live-usability blocker route, `GET /api/web3-live-usability-blockers`, is the consolidated answer to what is actually left before real-money Web3 usability. It reconciles the usability status, cutover blocker board, operator runbook, live-capital preflight, supervised-live runway, and manual live-review packet into missing rows, operator-input counts, signoff counts, live-lane readiness, safe next actions, verifier commands, safe-to-provide inputs, and never-provide boundaries. It returns status and next-action text only; it cannot sign, submit, custody funds, mutate wallets, echo secrets, approve autonomous live trading, or store private keys or seed phrases. The `/trading` command board shows this as `Real-money usability`, and the full receipt appears first inside the collapsed readiness drawer.

The research handoff route, `GET /api/web3-research-handoff-packet`, composes the usability receipt, operator request packet, cutover board, operator runbook, live-capital preflight, supervised-live runway, and manual live-review packet into a shareable research brief. It summarizes current app state, open operator inputs, live-capital blockers, source endpoints, validated export commands, verifier commands, and the provider/custody/risk/ops/product/profit-proof questions that another helper should answer. It returns status, target names, commands, and questions only; it cannot echo configured secrets, accept private keys, sign, submit, mutate wallets, or unlock live trading. Settings renders the same packet after the credential command center so the operator can open the redacted JSON or run the local Markdown/JSON export command before sending work to another helper.

The research answer intake route, `POST /api/web3-research-answer-intake`, accepts redacted helper answers and scores whether they cover the custody, provider, Moonshot-style signal, latency, first-live-mode, compliance, risk, settlement/accounting, credential-storage, go-live, cockpit, and profit-proof decision lanes. It returns a local-session receipt with answered/partial/missing counts, a ready/blocked implementation decision queue, next missing question, safe next actions, and blocked live/signing/wallet permissions. The queue turns research into owner/phase work for signer custody, provider stack, high-signal filters, latency budgets, first-live mode, compliance copy, risk thresholds, settlement proof, credential storage, go-live gates, cockpit layout, and paper profit thresholds. It rejects secret-looking seed phrases, private keys, API keys, tokens, webhook secrets, and API-key query values, does not persist the answer server-side, and cannot sign, submit, mutate wallets, or unlock live trading. Settings renders this answer intake below the research handoff export commands so external research can be turned into app-visible implementation decisions.

`/api/health` also exposes a compact `web3_research_handoff` health summary with question counts, open operator input count, live blocker count, the next research question, and the redacted packet endpoint. It does not include the full text packet, configured secrets, transaction bytes, wallet authority, or live execution permission.

The monitor-history route, `GET /api/web3-market-monitor-history`, returns the latest sanitized `npm run monitor:web3` tape: run count, latest symbol, candle confidence, paper action, provider-degraded count, and recent read-only rows. The local file stores no API keys, private keys, seed phrases, transaction bodies, signed payloads, live execution permission, or wallet mutation authority, and rejects rows that do not preserve those blocked permissions.

The dedicated wallet packet route returns a redacted operator-wallet receipt. It reports whether a public wallet is scoped, whether that wallet is the sample all-ones demo wallet, whether it counts as a dedicated wallet, whether hash-only ownership proof exists, the strict operator-wallet verifier command, setup links, and the next safe wallet step. It stores and returns no private keys, seed phrases, raw signatures, transaction bodies, signed payloads, live execution permission, or wallet mutation authority.

The Jupiter order packet route returns a redacted Swap V2 setup receipt. It reports configured/missing Jupiter key status, required env target names, dedicated wallet dependency, current execution-adapter order-readiness evidence, setup links, the rehearsal endpoint, local install endpoint, strict verifier command, and missing proof steps. It never returns Jupiter key values, transaction bodies, signed payloads, execute permission, live execution permission, wallet mutation authority, or browser-storage permission for secrets.

The Jupiter rehearsal history route, `GET /api/web3-jupiter-rehearsal-history`, returns the latest sanitized quote/order proof tape from `POST /api/web3-jupiter-rehearsal`: status, wallet preview, key source, quote/order readiness, request hash, transaction-body-detected count, and the same withheld unsigned-transaction boundary. It stores no API key values, private keys, seed phrases, raw transaction bodies, signed payloads, execute permission, live execution permission, or wallet mutation authority.

The live ops packet route returns a redacted production-operations receipt. It consolidates sanitized production-supervisor readiness, emergency-stop target status, accounting/export status, settlement/mirror status, safe commands, process-manager review, production-worker process/owner/alert/restart target status, and manual live-review blockers. It reports webhook/contact/accounting/worker targets only as configured or missing booleans and cannot send external dispatches, start workers, install process managers, approve live execution, submit transactions, or mutate wallets.

The supervisor refresh route, `POST /api/web3-supervisor-refresh`, is the in-app equivalent of the bounded freshness repair command. It requires `operator_ack: true`, runs one sample-source paper supervisor round with one tick, target paper PnL `$1`, and max drawdown `$250`, forces live-execution flags off in the child process, then returns sanitized daemon health and production-supervisor readiness receipts. Its preview mode can report the same bounds without running the child process. It cannot create accounts, dispatch webhooks, sign, submit, custody funds, mutate wallets, store private keys, echo secrets, or satisfy the external production process gate.

The Supervised live runway route returns a single redacted first-live-review checklist across the dedicated wallet packet, Jupiter order packet, signer credential packet, live ops packet, and accounting/export target. It uses the `supervised-external-wallet-first` launch model, names the next missing lane, emits safe verifier commands, and keeps signing limited to future external wallet prompts while transaction submission, live execution, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.

The manual live-review packet route, `GET /api/web3-manual-live-review-packet`, returns an external-review-only receipt that consolidates the launch checklist, live-capital preflight gates, supervised live runway, and live ops packet into signoff rows for operator, security, ops, accounting, and strategy review. It can say when an outside human live-executor review may begin, but it remains a human review checklist only: transaction submission, wallet mutation, private-key storage, seed-phrase storage, and in-app signing stay blocked.

The usability status route, `GET /api/web3-usability-status`, returns the concise "what works now" receipt shown near the top of `/trading` as the live-readiness dossier. It separates copilot, paper autonomy, live DEX reads, wallet net worth, Jupiter dry-run orders, supervised live review, and autonomous live trading into usable/watch/gated/locked lanes, then names the next safe credential or review gate. The cockpit links to the same JSON receipt and keeps detailed capability evidence behind an expandable drawer so operators can see what is wired without scrolling through the full diagnostics stack. It never returns provider keys, private keys, seed phrases, raw transactions, unsigned transactions, signed payloads, live execution permission, transaction submission permission, or wallet mutation authority.

The provider health route returns a redacted receipt from live read-only provider checks. It can derive Helius mainnet RPC from `HELIUS_API_KEY`, test Solana `getHealth`, `getLatestBlockhash`, and `getSlot`, test Helius DAS `getAssetsByOwner` only when a public wallet is scoped, and test Jupiter quote/order readiness. It returns endpoint host/path, status booleans, aggregate wallet counts, and a receipt hash only; API keys, private keys, raw holdings, unsigned transactions, signed transactions, signatures, and wallet authority are never returned. Live execution and wallet mutation remain blocked even when all provider checks pass.

The signer credential packet route returns a redacted signer/custody setup packet for manual external wallet, Privy server wallet, Turnkey policy wallet, and future session-key paths. It reports selected-path status, env target names, docs/setup links, wallet ownership status, policy/request hash presence, missing required evidence, and live-boundary controls only. It cannot create provider accounts, store signer secrets, return secret values, sign, submit, custody funds, or mutate wallets.

The wallet ownership route accepts a public Solana address, the generated Mastermind ownership challenge, and a base64 Ed25519 message signature from a browser wallet. It verifies public wallet control, returns challenge/signature hashes and a receipt hash, stores that redacted receipt in the local Web3 audit log for account-setup and launch-readiness evidence, and never stores or returns the raw message, raw signature, private keys, transaction bodies, signed transactions, transaction-signing permission, live execution, or wallet mutation authority.

The DEX discovery route returns a redacted read-only scanner receipt from DEX Screener public discovery evidence. It can fetch latest token profiles, latest boosts, top boosts, community takeovers, latest ads, paid-order records, and token-pair mapping through the existing `live-dex` source path, then summarize source health, pair coverage, paid-hype count, top symbols, and scanner intake status. It returns no API keys, private keys, wallet authority, raw transaction bodies, or live execution permission; all candidates remain paper-only scanner evidence.

The OHLCV route can fetch a manually supplied GeckoTerminal pool or use `auto=true` to resolve the top current Web3 scanner candidate from the server-side DEX state, then fetch read-only GeckoTerminal candles for local signal/noise scoring. In `source=live-dex`, auto resolution refuses fallback/sample pool ids before calling GeckoTerminal, so stale DEX discovery becomes a clear blocked candle-proof receipt instead of a fake live chart request. The response includes only selected public candidate metadata, normalized candles, a local candle signal, and an optional paper-only decision. It cannot sign, submit, store wallet authority, or grant live execution.

The live-capital preflight route returns a redacted readiness receipt that consolidates the researched launch blockers into one operator-facing gate: operator wallet, Helius/Solana/Jupiter read rail, live DEX scanner, Jupiter order rehearsal, risk caps, kill switch, signer/custody, settlement/fill proof, profit proof, and manual live review. It can report live DEX and provider evidence, but it never signs, submits, stores private keys, returns transaction bodies, creates third-party accounts, or grants wallet mutation.

The Jupiter rehearsal route accepts a POST body with `jupiter_api_key`, `wallet_public_key`, and `max_slippage_bps`. The Jupiter key may be a one-shot session input or server `JUPITER_API_KEY`; it is never echoed or stored. The route requests SOL-to-USDC quote/order readiness, hashes the raw Jupiter request id, reports whether a transaction body was detected, withholds any unsigned transaction body, rejects private-key/seed-phrase-shaped fields, and always blocks execute, signing, transaction submission, live execution, and wallet mutation.

The signer handoff route returns a redacted receipt with wallet scope, signer provider, policy hash preview, request id, payload-hash preview, provider adapter status, pre-submit rehearsal state, relay boundary, and live-autonomy boundary. It always reports provider dispatch, live execution, wallet mutation, private-key storage, transaction-body storage, unsigned-transaction storage, and signed-payload storage as blocked. It never returns API keys, private keys, seed phrases, raw transaction bodies, unsigned payloads, signed payloads, full signatures, or wallet authority.

The accounting route returns a redacted paper-ledger receipt with aggregate portfolio PnL, recent paper-fill rows, wallet accounting readiness, settlement/mirror status, export columns, a receipt hash, and explicit live-execution/wallet-mutation blocks. It never returns API keys, private keys, seed phrases, raw transaction bodies, unsigned payloads, signed payloads, full signatures, or wallet authority. Its tax export permission is `paper-only` until real fill settlement, guarded mirror evidence, and CPA-reviewed export handling exist.

That route records a dry-run emergency-stop receipt only after `operator_ack` is true. It returns whether an emergency-stop webhook/contact is configured, which local surfaces would be halted or blocked, and a receipt hash. It never returns raw webhook URLs, contact details, API keys, private keys, transaction bytes, signed payloads, or wallet authority, and it never dispatches the external webhook from this local drill.

The production worker review surface is loaded from `/api/health` as `web3_production_supervisor`. It is derived from the sanitized daemon-supervisor receipt only, never exposes local receipt paths or secrets, and always keeps `can_satisfy_process_gate`, live execution, and wallet mutation blocked until an external process-manager and live-executor review exists.

## Local Verification

Run the fast Web3 readiness verifier after changing credential, wallet, signer, Jupiter, or launch-readiness code:

```bash
npm run --silent research:web3 -- --base-url=http://localhost:4010
npm run --silent research:web3 -- --base-url=http://localhost:4010 --json
npm run verify:web3 -- --base-url=http://localhost:4010
npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet
npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order
npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live
```

The research handoff command talks only to `GET /api/web3-research-handoff-packet`, checks that the returned packet includes a receipt hash, research questions, open operator inputs, live-capital blockers, and the `# Mastermind Web3 Research Handoff Packet` text body, then exits nonzero if any configured secret or API-key query value appears. It cannot sign, submit, custody funds, mutate wallets, unlock live capital, or turn the research packet into trading authority.

The verifier talks only to the running local app plus the existing provider-health, usability-status, live-usability blockers, dedicated-wallet packet, Jupiter-order packet, signer-credential packet, live-ops packet, live-capital preflight, accounting-ledger receipt, manual live-review packet, research handoff packet, DEX discovery, OHLCV, trading-state, and Jupiter rehearsal routes. It sends canary secrets to prove that responses do not echo one-shot keys or private-field values, temporarily saves only a public wallet and dry-run caps, restores the original public wallet/risk scope before exit, verifies configured Helius/Solana RPC health and latest-blockhash evidence, checks the direct wallet/order/signer/ops/preflight/accounting packets for hashes, safe actions, redaction boundaries, and live-lock controls, checks the live-usability blocker receipt for missing rows and safe next actions, checks the external-review-only manual packet, checks the shareable research handoff packet for redaction and live-lock boundaries, checks a deterministic sample DEX discovery receipt, and fails if any checked receipt grants direct live execution, transaction submission, or wallet mutation. Use `--wallet=<public-solana-address>` to verify against a dedicated public trading wallet; never pass a private key or seed phrase. The strict `--require-operator-wallet` mode refuses the sample all-ones wallet and requires `--wallet` or `WEB3_VERIFY_WALLET_PUBLIC_KEY` before any public scope is saved. The strict `--require-jupiter-order` mode requires `JUPITER_API_KEY` or `WEB3_VERIFY_JUPITER_API_KEY` in local env, then fails closed until Jupiter quote and unsigned order readiness are both proven while transaction bytes remain withheld. The strict `--require-dex-live` mode first requires the live DEX scanner to return current live evidence with mapped pairs, live candidates, no failed discovery sources, and all execution/wallet/transaction-submission permissions still blocked; when public discovery is throttled, it can fall back to auto-resolved GeckoTerminal OHLCV proof or a fresh recorded live-dex candle proof for a Solana pool with the same live locks.

The Settings `Credential action console` also shows a strict verifier runway. It builds the operator-wallet command, live-DEX command, and combined wallet-plus-Jupiter-plus-DEX command from the public wallet field and latest DEX receipt, marks the sample wallet as gated, marks live DEX as gated until `Test DEX scanner` returns a live receipt, and marks the Jupiter order gate as gated until a session key or server `JUPITER_API_KEY` is visible.

The Settings `Local credential installer` posts only known provider, signer-provider, emergency-stop, production-worker, and accounting fields to `POST /api/web3-local-credentials`. The route is intended for trusted local development: it accepts localhost requests or explicit `MASTERMOLD_ALLOW_LOCAL_CREDENTIAL_INSTALL=true`, writes only allowlisted targets such as `HELIUS_API_KEY`, `SOLANA_RPC_URL`, `SOLANA_WS_URL`, `JUPITER_API_KEY`, signer-provider env names, `MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL`, `MASTERMOLD_EMERGENCY_STOP_CONTACT`, `MASTERMOLD_TAX_LEDGER_EXPORT_PATH`, `MASTERMOLD_WEB3_PROCESS_MANAGER`, `MASTERMOLD_WEB3_WORKER_OWNER`, `MASTERMOLD_WEB3_ALERT_WEBHOOK_URL`, and `MASTERMOLD_WEB3_RESTART_POLICY_URL` into ignored `.env.local`, updates the current server process, rejects private-key/seed-phrase-shaped fields, and returns only configured/missing env target names. It never returns raw values, writes browser storage, starts workers, dispatches webhooks, signs, submits, custody funds, mutates wallets, or changes live execution permission.

The Settings `Jupiter Swap V2 setup` card points at the Jupiter Developer Platform and the Swap V2 order/execute docs. Swap V2 `/order` and `/execute` use the `x-api-key` header, so the app treats `JUPITER_API_KEY` as required before strict order rehearsal can pass. Even after the key is installed, the app uses it only for redacted quote/order evidence: unsigned transaction bodies stay withheld, signing/submission stay blocked, and live-capital permission remains external-review-only.

## API

The setup UI posts to:

```text
POST /api/web3-credentials/test
GET /api/web3-local-credentials
POST /api/web3-local-credentials
```

Useful request fields:

- `helius_api_key`
- `rpc_url`
- `ws_url`
- `jupiter_api_key`
- `wallet_public_key`
- `signer_mode`
- `max_trade_usd`
- `daily_spend_cap_usd`
- `max_slippage_bps`
- `require_manual_confirmation`
- `test_mode`: `network` or `validate-only`

The response is redacted. It returns host-level endpoint information only and never returns API keys, private keys, unsigned transaction bytes, signed transaction bytes, or wallet secrets. The browser form also scrubs Helius and Jupiter API key fields from its saved draft.

The response also returns `credential_plan` and `provider_account_runway`, which should be used by the UI and reviewers to see which mode is actually available and which provider accounts are still missing. `ready-for-read-only` means provider and wallet scope can support read-only accounting. `ready-for-dry-run` means route/order rehearsal can be tested. Neither status grants live signing or wallet mutation.

Reference: Helius documents `getAssetsByOwner` as the DAS method for retrieving Solana wallet-owned assets with pagination: https://www.helius.dev/docs/api-reference/das/getassetsbyowner

Reference: Helius documents Enhanced Transactions address history at `GET /v0/addresses/{address}/transactions` and notes that Enhanced Transactions are deprecated for new parser coverage: https://www.helius.dev/docs/enhanced-transactions/overview

## Done Criteria For This Gate

The credentials gate is ready for manual live review only when:

- Solana RPC health passes.
- A valid Solana public wallet key is scoped.
- Read-only wallet balance returns.
- Helius DAS wallet asset snapshot returns asset counts for the scoped public wallet.
- Jupiter quote proof passes.
- Jupiter unsigned order proof passes, if a Jupiter API key is configured.
- Manual external wallet approval remains required.
- Daily cap covers max trade.
- Max slippage is conservative.
- Launch checklist still shows live execution and wallet mutation as blocked.

## Still Left After This Gate

- Manual live review.
- Policy signer or explicit wallet prompt flow.
- External transaction signing.
- Submit/relay path.
- Confirmation polling.
- Fill reconciliation.
- Live wallet accounting and local portfolio mirror review.
- CPA-reviewed tax/accounting export handling for real fills.
- Production worker supervision, alerts, restart policy, and emergency stop operations.

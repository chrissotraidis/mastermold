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
5. Enter or rely on server environment values for Helius/Solana RPC and Jupiter. API key fields are session-only in the browser form and are not saved to browser storage. In local development only, Settings can use `Install local env` to write Helius, Solana RPC/WebSocket, and Jupiter provider values into ignored `.env.local` through `POST /api/web3-local-credentials`; that route is localhost/opt-in only, rejects private-key or seed-phrase fields, clears the page secret fields after success, returns configured/missing key names only, and still cannot sign, submit, custody funds, mutate wallets, or unlock live execution.
6. Enter a Solana wallet public address only, or use `Detect wallet` / `Connect wallet` to read only the public address from a browser Solana wallet. Never enter a private key.
   The sample all-ones Solana address may be used for demo/public-scope checks, but it is treated as demo-only and does not satisfy the dedicated trading-wallet gate.
7. Use `Prove ownership` only after the browser wallet is connected. It asks the wallet to sign a plain text Mastermind ownership challenge, posts it to `POST /api/web3-wallet-ownership`, and records a hash-only local audit receipt proving public wallet control. This is not a transaction signature and it cannot move funds.
8. Keep signer mode on `Manual external wallet` for the first live path.
9. Set conservative caps, for example `$250` max trade, `$1,000` daily cap, and `150` bps max slippage.
10. Press `Test credentials`.
11. Press `Apply dry-run profile` only after provider, wallet, and route evidence is acceptable.
12. Run `npm run landing-drill:web3` to confirm the landing path is still safely blocked before live signing/submission.
13. Use the Wiring focus `Build account receipt` control to create a redacted setup receipt from local provider-account configuration and current wallet gates. It reports whether Helius/Solana, Jupiter, a dedicated public wallet, signer posture, emergency stop, and accounting targets are configured or missing without creating external accounts or echoing secrets.
14. Use the Wiring focus `Test provider health` control to create a redacted provider-health receipt. It performs read-only Solana RPC, latest-blockhash, Helius DAS, Jupiter quote, and Jupiter order-gate checks from server environment values without returning API keys, raw wallet holdings, transaction bodies, signatures, or wallet authority.
15. Use `Rehearse Jupiter order` in the Web3 credential setup card to create a one-shot Jupiter rehearsal receipt. It accepts a session-only Jupiter key or server `JUPITER_API_KEY`, proves SOL-to-USDC quote/order readiness when possible, hashes request evidence, withholds unsigned transaction bytes, and keeps execute/sign/submit/live trading blocked.
16. Use the Wiring focus `Build signer receipt` control to create a redacted signer handoff receipt from custody, hash-only request, pre-submit, relay, and live-boundary state. It never stores private keys, raw transaction bodies, unsigned payloads, signed payloads, or wallet authority.
17. Use the Wiring focus `Build ledger receipt` control to create a redacted local accounting receipt from the paper ledger, wallet-readiness state, settlement status, and mirror gates.
18. Review the Wiring focus `Production worker review` panel after `npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json` writes a sanitized paper-supervisor receipt. It checks receipt freshness, circuit state, profit target, drawdown brake, and the live-boundary process gate, but it cannot install a process manager or authorize live capital from inside the app.
19. Use the Wiring focus `Run stop drill` control to record a local dry-run emergency-stop receipt. The drill halts browser Auto Watch and verifies ops target status, but it does not send webhooks, stop external processes by itself, sign, submit, or mutate wallets.
20. Run `npm run doctor:web3 -- --json` against the local app to write `data/web3-credential-doctor.json`, a sanitized local receipt that compares account setup, provider health, launch checklist, live preflight, and production-supervisor boundaries. It stores configured/missing status, blockers, and safe commands only; it does not echo Helius/Jupiter keys, create accounts, sign, submit, or mutate wallets. When the production-supervisor receipt is stale, run `npm run doctor-repair:web3 -- --json` to let the doctor refresh one bounded paper-supervisor round before rewriting the same sanitized receipt; this still cannot sign, submit, custody funds, mutate wallets, or unlock live capital.
21. Run `npm run verify:web3 -- --base-url=http://localhost:4010` against the local app. This Node-only gate does not require Bun; it snapshots the current public wallet/risk scope, checks health receipts, malformed wallet rejection, private-field rejection, public-wallet dry-run scope save, wallet-ownership proof redaction, account setup redaction, validate-only credential readiness, Helius/Solana provider-health evidence when the read rail is configured, read-only DEX discovery receipt boundaries, one-shot Jupiter rehearsal redaction, unsigned-transaction withholding, and live-execution/wallet-mutation locks, then restores the original public wallet/risk scope.

The Settings page also includes a `Web3 trading credentials` runway card. It shows the same account-setup receipt as configured/missing status for Helius/Solana, Jupiter, dedicated wallet, signer posture, emergency-stop ops, accounting targets, and hash-only wallet ownership proof, then links back to `/trading` for provider tests and dry-run receipts. Its `Secure credential handoff` summarizes which lanes are ready, which input is next, and the safe verifier command to run after each credential change without echoing secrets. Its `Dedicated wallet packet` separates the operator-wallet gate from signer setup: it rejects the sample all-ones wallet for readiness, asks for a public Solana address only, points at text-only ownership proof, exposes the strict `--require-operator-wallet` verifier command, links to Solana wallet docs, and keeps signing, submission, live execution, wallet mutation, private keys, and seed phrases blocked. Its `Jupiter order packet` separates the Swap V2 order rail from general account setup: it reports whether `JUPITER_API_KEY` is server-scoped, whether a dedicated public wallet is ready, whether Swap V2 order evidence is present, how to run `POST /api/web3-jupiter-rehearsal`, and the strict `--require-jupiter-order` verifier while withholding transaction bytes and blocking execute, signing, submission, live execution, and wallet mutation. Its `Credential doctor receipt` panel reads the latest sanitized doctor file and shows local check status plus safe commands without exposing paths or secret values, including the optional paper-supervisor refresh command when that local receipt is stale. It also shows a `Signer credential packet` that compares manual external wallet, Privy server wallet, Turnkey policy wallet, and future session-key paths, names only env target names and setup/docs links, and reports selected-path evidence without storing signer secrets, private keys, seed phrases, transaction bodies, signed payloads, or wallet authority. It also shows the launch-blocker queue from the same launch checklist used by the trading cockpit, including hard blockers, review gates, and the next cutover step while live execution remains blocked. Settings now includes an `Operator input packet` from that same launch checklist. The packet names the exact safe inputs and external decisions still needed for supervised trading review: Helius/Solana read rail, dedicated trading wallet, wallet ownership proof, Jupiter route/order key, signer/custody choice, signer provider credentials, settlement/accounting review, and manual live approval. Its `Next operator action` callout separates the immediate credential or approval the operator must provide from the longer engineering cutover runway, so a missing Jupiter key or dedicated wallet does not get hidden behind paper-profit repair. Each row labels its storage rule as server env, browser public scope, hash-only local receipt, future signer vault, never-store, or external operator review; private keys and seed phrases stay out of the app. Settings also shows the same `Launch repair queue` as the cockpit for paper accountability repair, supervisor refresh, route/order rehearsal, operator input scope, and verifier actions. It also shows a full credential checklist with official setup/docs links, storage rules, required env names, test actions, and the next external operator action for every provider/account lane. Settings now includes a `Credential action console` for session-only Helius/Jupiter/wallet tests, local-only ignored-env installation, browser-wallet public-address detection, text-only wallet ownership proof, and read-only DEX scanner testing. That console can call the same credentials test, local credential install, ownership proof, DEX discovery, and Jupiter rehearsal routes, and it can save only public wallet scope plus dry-run risk caps into the Web3 trading state. It does not save Helius or Jupiter keys to browser storage, does not send keys when saving public scope, does not accept private keys or seed phrases, and cannot create external accounts, sign transactions, submit, execute, or mutate wallets.

## Researched Default Stack

- Provider stack: Helius/Solana RPC first for read-only wallet and chain data, plus Helius DAS `getAssetsByOwner` for wallet-held asset visibility, with secrets kept in server env or one-shot test inputs.
- Market discovery: use the app's live DEX/read-only intake, chart proof, route proof, and wallet marking before adding paid discovery feeds.
- Execution stack: use Jupiter Swap V2 `/order` for quote plus unsigned order rehearsal first, then keep `/execute`, signing, and submit out of scope until manual live review.
- Signer custody: start with a dedicated trading wallet and manual external wallet approval; do not collect private keys in the app.
- Risk policy: keep conservative per-trade caps, daily spend caps, max slippage, paper proof, and kill-switch review ahead of live autonomy.
- Live cutover: require supervised worker proof, profit proof, signer proof, settlement proof, wallet accounting, and manual live review before real-capital trading.

When `HELIUS_API_KEY` is set, the app can derive the Helius mainnet RPC endpoint for read-only wallet accounting even if `SOLANA_RPC_URL` is omitted. When the resolved Solana RPC endpoint is Helius, live wallet accounting also attempts an aggregate DAS asset-index proof. That proof records asset counts, fungible counts, priced-asset counts, and priced value only; it does not store raw wallet holdings, authorize signing, or unlock live execution.

The launch checklist now separates provider readiness into a read-provider rail and a signer-provider rail. `HELIUS_API_KEY` or `SOLANA_RPC_URL` plus `JUPITER_API_KEY` can make the read rail ready for wallet, route, and order rehearsal evidence, but signer/custody credentials, policy hashes, user approval, settlement, and manual live review are still separate gates.

The trading cockpit launch checklist also includes a `Launch repair queue`. It converts raw blockers into the next safe repair action for fill quality, paper accountability, production-supervisor freshness, route/order rehearsal, operator input scope, and the Node verifier. Queue commands such as `npm run repair-accountability:web3`, `npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json`, `npm run landing-drill:web3`, and `npm run verify:web3 -- --base-url=http://localhost:4010` refresh paper or readiness evidence only. They cannot create external accounts, sign transactions, submit swaps, custody funds, or unlock live capital.

`npm run repair-accountability:web3` also writes a sanitized local paper accountability repair receipt to `data/web3-local-accountability-repair.json`, or to `WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH` when that env target is set. The launch checklist reads that receipt as `local_accountability_repair_health` and uses it to show whether the latest repair improved, completed, blocked, became stale, or made no progress. The receipt stores only paper scores, attempt counts, summary text, blockers, and blocked live/wallet permissions; it does not store local paths in API responses, provider keys, private keys, raw transactions, signed payloads, or wallet authority.

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
GET /api/web3-dedicated-wallet-packet
GET /api/web3-dex-discovery
GET /api/web3-jupiter-order-packet
GET /api/web3-live-capital-preflight
GET /api/web3-provider-health
GET /api/web3-signer-credential-packet
GET /api/web3-signer-handoff
POST /api/web3-emergency-stop/drill
POST /api/web3-jupiter-rehearsal
POST /api/web3-wallet-ownership
```

The account acquisition route returns the external setup packet used by Settings. It can name official setup/docs links for Helius, Jupiter, wallet, signer, emergency stop, and accounting work; report configured/needed/blocked/future status; and emit a redacted env template with target variable names only. It cannot create external accounts, submit signup forms, store credentials, sign, submit, custody funds, or mutate wallets.

The account setup route returns a redacted receipt with provider-account status for Helius/Solana reads, Jupiter Swap V2 order rehearsal, the dedicated public wallet, signer posture, emergency-stop ops, accounting, and optional market-feed lanes. It detects whether expected local env targets are configured but never returns their values. It also separates `wallet_scoped` from `dedicated_wallet_scoped`, so a demo all-ones wallet can prove the save path without satisfying live-readiness review. It does not create third-party accounts, submit signup forms, store secrets, sign, submit, custody funds, or mutate wallets; external account creation remains operator-owned outside the app.

The dedicated wallet packet route returns a redacted operator-wallet receipt. It reports whether a public wallet is scoped, whether that wallet is the sample all-ones demo wallet, whether it counts as a dedicated wallet, whether hash-only ownership proof exists, the strict operator-wallet verifier command, setup links, and the next safe wallet step. It stores and returns no private keys, seed phrases, raw signatures, transaction bodies, signed payloads, live execution permission, or wallet mutation authority.

The Jupiter order packet route returns a redacted Swap V2 setup receipt. It reports configured/missing Jupiter key status, required env target names, dedicated wallet dependency, current execution-adapter order-readiness evidence, setup links, the rehearsal endpoint, local install endpoint, strict verifier command, and missing proof steps. It never returns Jupiter key values, transaction bodies, signed payloads, execute permission, live execution permission, wallet mutation authority, or browser-storage permission for secrets.

The provider health route returns a redacted receipt from live read-only provider checks. It can derive Helius mainnet RPC from `HELIUS_API_KEY`, test Solana `getHealth`, `getLatestBlockhash`, and `getSlot`, test Helius DAS `getAssetsByOwner` only when a public wallet is scoped, and test Jupiter quote/order readiness. It returns endpoint host/path, status booleans, aggregate wallet counts, and a receipt hash only; API keys, private keys, raw holdings, unsigned transactions, signed transactions, signatures, and wallet authority are never returned. Live execution and wallet mutation remain blocked even when all provider checks pass.

The signer credential packet route returns a redacted signer/custody setup packet for manual external wallet, Privy server wallet, Turnkey policy wallet, and future session-key paths. It reports selected-path status, env target names, docs/setup links, wallet ownership status, policy/request hash presence, missing required evidence, and live-boundary controls only. It cannot create provider accounts, store signer secrets, return secret values, sign, submit, custody funds, or mutate wallets.

The wallet ownership route accepts a public Solana address, the generated Mastermind ownership challenge, and a base64 Ed25519 message signature from a browser wallet. It verifies public wallet control, returns challenge/signature hashes and a receipt hash, stores that redacted receipt in the local Web3 audit log for account-setup and launch-readiness evidence, and never stores or returns the raw message, raw signature, private keys, transaction bodies, signed transactions, transaction-signing permission, live execution, or wallet mutation authority.

The DEX discovery route returns a redacted read-only scanner receipt from DEX Screener public discovery evidence. It can fetch latest token profiles, latest boosts, top boosts, community takeovers, latest ads, paid-order records, and token-pair mapping through the existing `live-dex` source path, then summarize source health, pair coverage, paid-hype count, top symbols, and scanner intake status. It returns no API keys, private keys, wallet authority, raw transaction bodies, or live execution permission; all candidates remain paper-only scanner evidence.

The live-capital preflight route returns a redacted readiness receipt that consolidates the researched launch blockers into one operator-facing gate: operator wallet, Helius/Solana/Jupiter read rail, live DEX scanner, Jupiter order rehearsal, risk caps, kill switch, signer/custody, settlement/fill proof, profit proof, and manual live review. It can report live DEX and provider evidence, but it never signs, submits, stores private keys, returns transaction bodies, creates third-party accounts, or grants wallet mutation.

The Jupiter rehearsal route accepts a POST body with `jupiter_api_key`, `wallet_public_key`, and `max_slippage_bps`. The Jupiter key may be a one-shot session input or server `JUPITER_API_KEY`; it is never echoed or stored. The route requests SOL-to-USDC quote/order readiness, hashes the raw Jupiter request id, reports whether a transaction body was detected, withholds any unsigned transaction body, rejects private-key/seed-phrase-shaped fields, and always blocks execute, signing, transaction submission, live execution, and wallet mutation.

The signer handoff route returns a redacted receipt with wallet scope, signer provider, policy hash preview, request id, payload-hash preview, provider adapter status, pre-submit rehearsal state, relay boundary, and live-autonomy boundary. It always reports provider dispatch, live execution, wallet mutation, private-key storage, transaction-body storage, unsigned-transaction storage, and signed-payload storage as blocked. It never returns API keys, private keys, seed phrases, raw transaction bodies, unsigned payloads, signed payloads, full signatures, or wallet authority.

The accounting route returns a redacted paper-ledger receipt with aggregate portfolio PnL, recent paper-fill rows, wallet accounting readiness, settlement/mirror status, export columns, a receipt hash, and explicit live-execution/wallet-mutation blocks. It never returns API keys, private keys, seed phrases, raw transaction bodies, unsigned payloads, signed payloads, full signatures, or wallet authority. Its tax export permission is `paper-only` until real fill settlement, guarded mirror evidence, and CPA-reviewed export handling exist.

That route records a dry-run emergency-stop receipt only after `operator_ack` is true. It returns whether an emergency-stop webhook/contact is configured, which local surfaces would be halted or blocked, and a receipt hash. It never returns raw webhook URLs, contact details, API keys, private keys, transaction bytes, signed payloads, or wallet authority, and it never dispatches the external webhook from this local drill.

The production worker review surface is loaded from `/api/health` as `web3_production_supervisor`. It is derived from the sanitized daemon-supervisor receipt only, never exposes local receipt paths or secrets, and always keeps `can_satisfy_process_gate`, live execution, and wallet mutation blocked until an external process-manager and live-executor review exists.

## Local Verification

Run the fast Web3 readiness verifier after changing credential, wallet, signer, Jupiter, or launch-readiness code:

```bash
npm run verify:web3 -- --base-url=http://localhost:4010
npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet
npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order
npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live
```

The verifier talks only to the running local app plus the existing provider-health, DEX discovery, and Jupiter rehearsal routes. It sends canary secrets to prove that responses do not echo one-shot keys or private-field values, temporarily saves only a public wallet and dry-run caps, restores the original public wallet/risk scope before exit, verifies configured Helius/Solana RPC health and latest-blockhash evidence, checks a deterministic sample DEX discovery receipt, and fails if any checked receipt grants live execution or wallet mutation. Use `--wallet=<public-solana-address>` to verify against a dedicated public trading wallet; never pass a private key or seed phrase. The strict `--require-operator-wallet` mode refuses the sample all-ones wallet and requires `--wallet` or `WEB3_VERIFY_WALLET_PUBLIC_KEY` before any public scope is saved. The strict `--require-jupiter-order` mode requires `JUPITER_API_KEY` or `WEB3_VERIFY_JUPITER_API_KEY` in local env, then fails closed until Jupiter quote and unsigned order readiness are both proven while transaction bytes remain withheld. The strict `--require-dex-live` mode requires the live DEX scanner to return current live evidence with mapped pairs, live candidates, no failed discovery sources, and all execution/wallet/transaction-submission permissions still blocked.

The Settings `Credential action console` also shows a strict verifier runway. It builds the operator-wallet command, live-DEX command, and combined wallet-plus-Jupiter-plus-DEX command from the public wallet field and latest DEX receipt, marks the sample wallet as gated, marks live DEX as gated until `Test DEX scanner` returns a live receipt, and marks the Jupiter order gate as gated until a session key or server `JUPITER_API_KEY` is visible.

The Settings `Local credential installer` posts only known provider fields to `POST /api/web3-local-credentials`. The route is intended for trusted local development: it accepts localhost requests or explicit `MASTERMOLD_ALLOW_LOCAL_CREDENTIAL_INSTALL=true`, writes only `HELIUS_API_KEY`, `SOLANA_RPC_URL`, `SOLANA_WS_URL`, and `JUPITER_API_KEY` into ignored `.env.local`, updates the current server process, rejects private-key/seed-phrase-shaped fields, and returns only configured/missing env target names. It never returns raw values, writes browser storage, signs, submits, custody funds, mutates wallets, or changes live execution permission.

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

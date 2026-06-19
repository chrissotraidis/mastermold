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
2. Review `Launch checklist` and `Researched stack decisions` to see the selected provider, market, execution, signer, risk, and live-cutover path.
3. Select the `Wiring` focus in the operator focus deck.
4. Use `Web3 credential setup`.
5. Enter or rely on server environment values for Helius/Solana RPC and Jupiter. API key fields are session-only in the browser form and are not saved to browser storage.
6. Enter a Solana wallet public address only. Never enter a private key.
7. Keep signer mode on `Manual external wallet` for the first live path.
8. Set conservative caps, for example `$250` max trade, `$1,000` daily cap, and `150` bps max slippage.
9. Press `Test credentials`.
10. Press `Apply dry-run profile` only after provider, wallet, and route evidence is acceptable.
11. Run `npm run landing-drill:web3` to confirm the landing path is still safely blocked before live signing/submission.
12. Use the Wiring focus `Build account receipt` control to create a redacted setup receipt from local provider-account configuration and current wallet gates. It reports whether Helius/Solana, Jupiter, a dedicated public wallet, signer posture, emergency stop, and accounting targets are configured or missing without creating external accounts or echoing secrets.
13. Use the Wiring focus `Test provider health` control to create a redacted provider-health receipt. It performs read-only Solana RPC, latest-blockhash, Helius DAS, Jupiter quote, and Jupiter order-gate checks from server environment values without returning API keys, raw wallet holdings, transaction bodies, signatures, or wallet authority.
14. Use the Wiring focus `Build signer receipt` control to create a redacted signer handoff receipt from custody, hash-only request, pre-submit, relay, and live-boundary state. It never stores private keys, raw transaction bodies, unsigned payloads, signed payloads, or wallet authority.
15. Use the Wiring focus `Build ledger receipt` control to create a redacted local accounting receipt from the paper ledger, wallet-readiness state, settlement status, and mirror gates.
16. Review the Wiring focus `Production worker review` panel after `npm run supervise:web3` writes a sanitized paper-supervisor receipt. It checks receipt freshness, circuit state, profit target, drawdown brake, and the live-boundary process gate, but it cannot install a process manager or authorize live capital from inside the app.
17. Use the Wiring focus `Run stop drill` control to record a local dry-run emergency-stop receipt. The drill halts browser Auto Watch and verifies ops target status, but it does not send webhooks, stop external processes by itself, sign, submit, or mutate wallets.

The Settings page also includes a `Web3 trading credentials` runway card. It shows the same account-setup receipt as configured/missing status for Helius/Solana, Jupiter, dedicated wallet, signer posture, emergency-stop ops, and accounting targets, then links back to `/trading` for provider tests and dry-run receipts. It also shows an external setup packet with official setup/docs links, required env names, and the next external operator action. This Settings card is read-only: it does not accept API keys, persist secrets, create external accounts, sign, submit, or mutate wallets.

## Researched Default Stack

- Provider stack: Helius/Solana RPC first for read-only wallet and chain data, plus Helius DAS `getAssetsByOwner` for wallet-held asset visibility, with secrets kept in server env or one-shot test inputs.
- Market discovery: use the app's live DEX/read-only intake, chart proof, route proof, and wallet marking before adding paid discovery feeds.
- Execution stack: use Jupiter quote/order rehearsal first; signing and submit remain out of scope until manual live review.
- Signer custody: start with a dedicated trading wallet and manual external wallet approval; do not collect private keys in the app.
- Risk policy: keep conservative per-trade caps, daily spend caps, max slippage, paper proof, and kill-switch review ahead of live autonomy.
- Live cutover: require supervised worker proof, profit proof, signer proof, settlement proof, wallet accounting, and manual live review before real-capital trading.

When `HELIUS_API_KEY` is set, the app can derive the Helius mainnet RPC endpoint for read-only wallet accounting even if `SOLANA_RPC_URL` is omitted. When the resolved Solana RPC endpoint is Helius, live wallet accounting also attempts an aggregate DAS asset-index proof. That proof records asset counts, fungible counts, priced-asset counts, and priced value only; it does not store raw wallet holdings, authorize signing, or unlock live execution.

The launch checklist now separates provider readiness into a read-provider rail and a signer-provider rail. `HELIUS_API_KEY` or `SOLANA_RPC_URL` plus `JUPITER_API_KEY` can make the read rail ready for wallet, route, and order rehearsal evidence, but signer/custody credentials, policy hashes, user approval, settlement, and manual live review are still separate gates.

Live DEX dry-run reads also expose a read-only wallet activity history receipt when a public wallet and Solana RPC are scoped. It uses `getSignaturesForAddress` to summarize recent signatures, slots, block times, and failure counts with signature previews and hashes only. It does not return raw transaction bodies, sign, submit, decode full swaps, or mutate balances.

When `HELIUS_API_KEY` is set, live DEX dry-run reads can also expose a read-only wallet transaction intelligence receipt from Helius Enhanced Transactions address history. It classifies recent decoded wallet transactions into swap, transfer, mint, burn, failure, or other buckets, counts token/native transfers, estimates visible fees, and hashes signatures. This is context for wallet monitoring and PnL review only. Helius marks Enhanced Transactions as deprecated for new parser coverage, so settlement-critical fills still need standard RPC reconciliation through `getTransaction`/confirmation evidence before live PnL is trusted.

The credential setup response now includes a credential vault plan with four explicit levels: read-only wallet sync, dry-run order rehearsal, supervised live review, and autonomous live trading. Only the first two levels can become ready in the app today. Supervised live and autonomous live stay blocked until signer custody, worker operations, emergency stop, settlement/accounting proof, long-horizon profit proof, and manual live review are separately completed. The plan also labels each input by storage rule: server environment, one-shot session input, browser-safe non-secret, future signer vault, or never-store. Private keys and seed phrases are always `never-store`.

The response also includes a provider account runway. It turns the researched stack into app-visible setup lanes: Helius/Solana read rail, Jupiter execution rehearsal rail, dedicated trading wallet, manual external signer, public DEX discovery fallback, future paid market feeds, future low-latency stream provider, emergency-stop operations, and tax/accounting ledger. This runway tracks which external accounts or provider keys are configured, needed, optional, future, or blocked; it does not create third-party accounts, transmit secrets, or grant live trading authority. Optional provider values are reported only as configured/missing status, never as raw secret values.

The Wiring focus also exposes:

```text
GET /api/web3-account-acquisition
GET /api/web3-account-setup
GET /api/web3-accounting-ledger
GET /api/web3-provider-health
GET /api/web3-signer-handoff
POST /api/web3-emergency-stop/drill
```

The account acquisition route returns the external setup packet used by Settings. It can name official setup/docs links for Helius, Jupiter, wallet, signer, emergency stop, and accounting work; report configured/needed/blocked/future status; and emit a redacted env template with target variable names only. It cannot create external accounts, submit signup forms, store credentials, sign, submit, custody funds, or mutate wallets.

The account setup route returns a redacted receipt with provider-account status for Helius/Solana reads, Jupiter execution rehearsal, the dedicated public wallet, signer posture, emergency-stop ops, accounting, and optional market-feed lanes. It detects whether expected local env targets are configured but never returns their values. It does not create third-party accounts, submit signup forms, store secrets, sign, submit, custody funds, or mutate wallets; external account creation remains operator-owned outside the app.

The provider health route returns a redacted receipt from live read-only provider checks. It can derive Helius mainnet RPC from `HELIUS_API_KEY`, test Solana `getHealth`, `getLatestBlockhash`, and `getSlot`, test Helius DAS `getAssetsByOwner` only when a public wallet is scoped, and test Jupiter quote/order readiness. It returns endpoint host/path, status booleans, aggregate wallet counts, and a receipt hash only; API keys, private keys, raw holdings, unsigned transactions, signed transactions, signatures, and wallet authority are never returned. Live execution and wallet mutation remain blocked even when all provider checks pass.

The signer handoff route returns a redacted receipt with wallet scope, signer provider, policy hash preview, request id, payload-hash preview, provider adapter status, pre-submit rehearsal state, relay boundary, and live-autonomy boundary. It always reports provider dispatch, live execution, wallet mutation, private-key storage, transaction-body storage, unsigned-transaction storage, and signed-payload storage as blocked. It never returns API keys, private keys, seed phrases, raw transaction bodies, unsigned payloads, signed payloads, full signatures, or wallet authority.

The accounting route returns a redacted paper-ledger receipt with aggregate portfolio PnL, recent paper-fill rows, wallet accounting readiness, settlement/mirror status, export columns, a receipt hash, and explicit live-execution/wallet-mutation blocks. It never returns API keys, private keys, seed phrases, raw transaction bodies, unsigned payloads, signed payloads, full signatures, or wallet authority. Its tax export permission is `paper-only` until real fill settlement, guarded mirror evidence, and CPA-reviewed export handling exist.

That route records a dry-run emergency-stop receipt only after `operator_ack` is true. It returns whether an emergency-stop webhook/contact is configured, which local surfaces would be halted or blocked, and a receipt hash. It never returns raw webhook URLs, contact details, API keys, private keys, transaction bytes, signed payloads, or wallet authority, and it never dispatches the external webhook from this local drill.

The production worker review surface is loaded from `/api/health` as `web3_production_supervisor`. It is derived from the sanitized daemon-supervisor receipt only, never exposes local receipt paths or secrets, and always keeps `can_satisfy_process_gate`, live execution, and wallet mutation blocked until an external process-manager and live-executor review exists.

## API

The setup UI posts to:

```text
POST /api/web3-credentials/test
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

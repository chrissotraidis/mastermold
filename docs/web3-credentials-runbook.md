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

## Researched Default Stack

- Provider stack: Helius/Solana RPC first for read-only wallet and chain data, plus Helius DAS `getAssetsByOwner` for wallet-held asset visibility, with secrets kept in server env or one-shot test inputs.
- Market discovery: use the app's live DEX/read-only intake, chart proof, route proof, and wallet marking before adding paid discovery feeds.
- Execution stack: use Jupiter quote/order rehearsal first; signing and submit remain out of scope until manual live review.
- Signer custody: start with a dedicated trading wallet and manual external wallet approval; do not collect private keys in the app.
- Risk policy: keep conservative per-trade caps, daily spend caps, max slippage, paper proof, and kill-switch review ahead of live autonomy.
- Live cutover: require supervised worker proof, profit proof, signer proof, settlement proof, wallet accounting, and manual live review before real-capital trading.

When `HELIUS_API_KEY` is set, the app can derive the Helius mainnet RPC endpoint for read-only wallet accounting even if `SOLANA_RPC_URL` is omitted. When the resolved Solana RPC endpoint is Helius, live wallet accounting also attempts an aggregate DAS asset-index proof. That proof records asset counts, fungible counts, priced-asset counts, and priced value only; it does not store raw wallet holdings, authorize signing, or unlock live execution.

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

Reference: Helius documents `getAssetsByOwner` as the DAS method for retrieving Solana wallet-owned assets with pagination: https://www.helius.dev/docs/api-reference/das/getassetsbyowner

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
- Production worker supervision, alerts, restart policy, and emergency stop operations.

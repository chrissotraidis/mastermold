# Mastermind Autonomous Trading Reorientation

Date: 2026-06-22

## Bottom Line

The app is not yet usable as a real-money autonomous Web3 trader.

It can run the Web3 workspace, paper/autonomous loops, read-only live DEX checks, wallet-scope validation, canary readiness receipts, and a portfolio view with charts. It cannot yet autonomously buy or sell funded memecoins from a real wallet, and it has not moved real funds.

Current canary truth from the running app:

- `actual_live_trade_tested=false`
- `real_funds_moved_by_this_app=false`
- `can_autonomously_trade_real_money_now=false`
- next gate: `wallet-scope`
- next required input: `dedicated-public-wallet`

The product goal is still clear: Mastermind should become a copilot plus a bounded autonomous Web3 trading system that monitors high-signal noise, trades through a dedicated wallet, manages a wallet/portfolio, and looks for profit while keeping risk controls, accounting, and emergency stops visible.

The next work should not be more broad feature expansion. It should be the shortest proof path from "paper/live-read monitor" to "tiny funded canary was signed, relayed, confirmed, reconciled, and mirrored."

## What The App Does Now

### Copilot and TradFi/Portfolio

- Shows a daily read, alerts, journal, paper trading, chat, and portfolio context.
- `/portfolio` renders total value, daily move, allocation, holdings, on-chain positions, concentration, and a 7-point net-worth chart.
- Portfolio data can be seeded sample data, manual holdings, or explicit imported snapshots.
- Settings has local snapshot import paths for Coinbase, SnapTrade/Robinhood-style accounts, and Zerion wallet holdings.
- Alerts and chat can reason over the visible portfolio context.

Current evidence from the running app:

- `/api/portfolio` returned 4 holdings.
- provenance was `Sample data`.
- import snapshot was `No imported holdings`.
- net-worth series had 7 chart points.

What this means: the portfolio UI and read-only suggestion loop exist, but proactive live TradFi monitoring is not complete until scheduled account refresh, broader brokerage coverage, and live market/news scan cadence are wired and verified.

### Web3 Trading

- `/trading` opens the Web3 Autopilot workspace on the canonical live DEX breakout canary view.
- The workspace includes memecoin discovery, market-monitor receipts, paper wallet behavior, exit/protection governors, route/readiness checks, canary setup, and live-boundary truth strips.
- `scripts/web3-autonomous-daemon.mjs` and related commands can run bounded paper/autonomous loops outside the browser.
- The system can validate and save a dedicated public Solana wallet scope, but only the public address.
- The system can request a text-only wallet ownership proof and store hash-only proof evidence.
- The system can prepare/read canary status and first-canary gates.
- The system explicitly blocks signing, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo while gates are uncleared.

Current evidence from `npm run status-canary:web3 -- --base-url=http://localhost:4010 --json`:

- configured local keys: `HELIUS_API_KEY`, `SOLANA_RPC_URL`, `SOLANA_WS_URL`, `MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER`
- missing first live-trade items include `JUPITER_API_KEY`, `MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION`, `MASTERMOLD_LIVE_OPERATOR_APPROVAL`, and `MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF`
- additional missing production/custody/ops items include Privy or Turnkey signer details, session policy, emergency-stop contact/webhook, accounting export path, process manager, worker owner, alert webhook, and restart policy
- canary status is `blocked`

What this means: the Web3 system is a substantial paper/live-read control plane. It is not yet a funded execution system.

## What The App Cannot Claim Yet

- It cannot claim it has made money with real Web3 capital.
- It cannot autonomously trade real money now.
- It cannot sign transactions by itself.
- It cannot submit transactions by itself.
- It cannot custody a private key or seed phrase.
- It cannot guarantee profit.
- It cannot treat paper PnL, read-only DEX evidence, Jupiter rehearsal, wallet signature, or a relayed-but-unconfirmed transaction as a completed funded trade.
- It cannot treat the current TradFi portfolio as live and comprehensive unless connected-account refresh is configured and verified.

## Current Gate Progression

The app now exposes `gate_progression` from `/api/web3-canary-status` and `npm run status-canary:web3`.

1. `dedicated-public-wallet` - current gate. Save a dedicated public Solana wallet address only.
2. `wallet-ownership-proof` - blocked until the saved wallet signs a text-only browser-wallet challenge.
3. `jupiter-order-rail` - needs `JUPITER_API_KEY` and route/order proof.
4. `first-canary-live-flags` - needs explicit local arming flags for the first canary only.
5. `unsigned-order-preflight` - blocked until wallet, proof, Jupiter, and flags are ready.
6. `signed-payload-relay` - blocked until an external wallet signs the one-shot tiny canary.
7. `post-signing-proof` - blocked until relay, chain confirmation, settlement reconciliation, and portfolio mirror accounting all pass.

Every gate currently reports:

- `live_execution_permission=blocked`
- `transaction_submission_permission=blocked`
- `wallet_mutation_permission=blocked`
- `secret_echo_permission=blocked`

## Shortest Path To A Real Usability Proof

1. Provide a dedicated public Solana wallet address. Do not provide a private key, seed phrase, keypair JSON, raw transaction bytes, or signed payload in chat.
2. Save that public wallet scope with the Trading canary console or `npm run scope-wallet:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --save --json`.
3. Prove wallet ownership through the text-only wallet challenge and browser-wallet message signature.
4. Install `JUPITER_API_KEY`.
5. Install the first-canary local flags:
   - `MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true`
   - `MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS`
   - `MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true`
6. Run strict verification:
   - `npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet`
   - `npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order`
   - `npm run verify:web3 -- --base-url=http://localhost:4010 --require-live-canary-flags`
7. Generate the tiny unsigned canary order only after the prior gates pass.
8. Sign only that one tiny canary in a browser wallet.
9. Relay, confirm/finalize, reconcile settlement, and apply the reviewed local portfolio mirror.
10. Run `npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json`.
11. Only after `actual_live_trade_tested=true` and accounting proof is present should bounded supervised/autonomous real-capital trading be considered.

## Stop-Building Rule

Until the first funded canary proof is real, avoid building more broad Web3 panels, duplicate readiness surfaces, or strategy edge cases unless they directly clear one of the seven canary gates above.

The next development loop should be:

1. Clear one gate.
2. Run the verifier for that gate.
3. Update the app-visible truth surface.
4. Commit and push.
5. Move to the next gate.

## Open Questions For The Operator

These are the only inputs needed before the app can continue toward live Web3 proof:

- What dedicated public Solana wallet address should the app use for the tiny canary?
- Which signer path should be treated as the future production path: external browser wallet, Privy server wallet, Turnkey policy wallet, or session-key vault?
- What `JUPITER_API_KEY` should be installed locally?
- What maximum canary notional, daily cap, and slippage cap are acceptable for the first live proof?
- Where should accounting/tax export receipts be written?
- What emergency-stop webhook/contact should be used?
- What process manager should supervise the Web3 worker once it is allowed to run continuously?
- For TradFi suggestions, which real portfolio/brokerage sources should be connected first, and should they remain read-only advisory only?

## Verification Snapshot

Latest local verification during this reorientation pass:

- running app server: `http://localhost:4010`
- `/api/web3-canary-status`: returned 200 and reported blocked canary status
- `/api/web3-live-usability-summary`: returned 200 and reported `can_trade_real_capital_now=false`, `can_run_unattended_now=false`, and 27 real-capital blockers
- `/api/portfolio`: returned 200 with sample portfolio data and net-worth chart points
- `npm run status-canary:web3 -- --base-url=http://localhost:4010 --json`: passed and returned ordered `gate_progression`

Observed concern:

- `/api/health` timed out in one 12-second probe during this pass. That endpoint should be slimmed or split if it remains too heavy, because health checks should not wait behind expensive Web3 summary assembly.

## Definition Of "Actually Usable"

For the Web3 autonomous goal, "usable" means all of the following are true:

- a dedicated wallet is scoped and ownership-proven
- a tiny funded canary has been externally signed
- relay and chain confirmation/finalization have been recorded
- settlement reconciliation passes
- local portfolio mirror accounting passes
- live execution limits, kill switch, signer policy, and alerting are configured
- the app truth surfaces say real funds moved only after the proof chain is complete
- autonomous mode is capped, revocable, observable, and fail-closed

For the TradFi copilot goal, "usable" means:

- the user can connect/import the real accounts they care about
- holdings refresh is scheduled or clearly marked as a snapshot
- suggestions cite visible portfolio context
- the app never implies comprehensive live portfolio coverage when it is using sample, manual, or stale snapshot data


import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Database,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { AskMasterMoldButton } from "@/components/master-mold-actions";
import { Badge } from "@/components/ui/badge";
import { ForwardTrialStarter } from "@/components/forward-trial-starter";
import { ProvenanceChip } from "@/components/provenance-chip";
import { ReviewerEvidencePanel } from "@/components/reviewer-evidence-panel";
import { productProvenanceLabel, productProvenanceSource } from "@/lib/provenance-copy";
import { toPublicProductMetricSummary } from "@/lib/public-api-copy";
import { reviewResearchPathLabel, reviewRunNoteCopy, reviewScanActivityLabel } from "@/lib/review-status-copy";
import { buildTodayReadiness } from "@/lib/today-readiness-copy";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDataMode, getEngineRunHistory, getEngineStatus } from "@/src/db/engine-data";
import { getScanAttempts } from "@/src/db/scan";
import { getForwardProofStatus, type ForwardProofGate } from "@/src/db/forward-proof";
import { getBrainState } from "@/src/db/brain";
import { getJournal } from "@/src/db/journal";
import { getPortfolio } from "@/src/db/portfolio";
import { getProductMetricSummary } from "@/src/db/metrics";
import { getScreenerFeedback } from "@/src/db/screener-feedback";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";

type ReviewReadinessProps = {
  surface: "public" | "authenticated";
};

const disclosureSections = [
  {
    title: "Working now",
    icon: CheckCircle2,
    tone: "text-engine",
    summary:
      "Reviewable product flow with sample data, local manual entries, and explicit holdings snapshot imports.",
    items: [
      "Today and idea detail with the clues behind each idea",
      "Alert feed",
      "Portfolio and concentration",
      "Decision journal and local performance tracking",
      "Paper-trading rounds",
      "Web3 trading workspace with memecoin discovery tape, read-only promotion-order audit for organic vs boosted vs paid-hype attention, discovery-edge supervision for source coverage/pair mapping/actionable snipe-or-probe readiness, launch-sniper scoring for newest/trending coin chase/probe/watch/avoid/exit decisions, launch-graduation supervisor for bonding-curve/migration/post-graduation timing and paper graduate/snipe/probe/trim decisions, holder-flow sentinel for top-holder concentration, creator/authority uncertainty, first-buyer cluster risk, whale exit pressure, and paper block/reduce/trim/exit actions, live-feed integrity checks for freshness/source coverage/pair mapping/gap backfill, market-stream supervisor for websocket/backfill/reconnect/watch-symbol decisions, microstructure tape for buy bursts, absorption, distribution, sell cascades, churn, liquidity-vacuum risk, and chase/absorb/fade/distribute/rug-pull paper actions, smart-money sentinel for local top-trader/wallet-flow estimates, copy-confidence, concentration risk, follow/probe/fade/exit paper actions, and credential-gated exact wallet adapters, liquidity-exit sentinel for liquidity drain/sell-wall/authority/drawdown profit protection, risk governor for drawdown/turnover/feed/execution/learning gates, autonomous compounder for profit-vault locking, redeployable-profit sizing, fractional-size caps, and launch-order caps, execution-edge ladder for ranked execute/queue/protect/block decisions, route-profit gate for net profit after impact/slippage/priority-fee/MEV/fill-quality friction, autonomous scalping controller for compound/scalp-buy/trim/flip/stand-down decisions after churn, route, risk, and fill-quality gates, profit-loop controller for compound/attack/harvest/protect/cooldown/stand-down decisions from realized PnL, expected next profit, churn drag, fill quality, daemon memory, microstructure tape, and smart-money signals, live-execution arming checklist for signer/RPC/API/approval/governor/edge/preflight gates, transaction lifecycle tracking from unsigned payload to signature request, simulated signer proof, submit lock, signed-transaction relay readiness, confirmation polling, expiry, or failure, catalyst intelligence for organic flow vs boosts/ads/community-takeover hype, fast price-action monitor for snipe/press/trim/eject decisions, local rug-pull firewall for authority/liquidity/holder/promotion/sell-pressure risk, local token vetting for liquidity/flow/age/promotion/rug flags, tape-change memory, situation monitor/playbook, capital-rotation engine for release/redeploy decisions, position exit ladder for hard stops/trailing stops/take-profit trims/moonbag runners, signal-alpha attribution for velocity/buy-flow/liquidity/risk-filter/exit/execution-friction feedback, autonomous cycle runbook, adaptive autonomous monitor scheduler for wake cadence and advance-vs-observe decisions, paper-daemon tick controller with durable recent-tick memory for observe/advance/stand-down, rolling paper PnL, block/fill counts, and pause recommendations, post-trade review for paper PnL lessons, execution friction, alpha attribution, drawdown, trade-discipline adjustments, next-cycle size multiplier, cadence, and pause/exit-only decisions, execution intent queue with cooldown/retry controls, execution-cost monitor for route impact/slippage/priority-fee drag/landability, MEV/slippage guard for sandwich/public-route/liquidity-shock risk, paper fill-quality simulator for slippage/partial fills/missed fills/implementation shortfall, execution retry planner for bounded requotes/resizes/sliced child orders/priority-fee steps/stand-downs, execution preflight for quote freshness/impact/slippage/fees/MEV guard/retry plan/payload readiness, paper performance scorecard for net PnL/turnover/drawdown/friction, deterministic autonomous forward trial across base/breakout/rug-risk regimes, autonomous edge verifier for scale/probe/protect/stand-down paper capital permission from replay, route, signal/noise, churn, and fill-quality proof, cost-adjusted profit optimizer, adaptive paper-trade learning loop, memecoin monitoring, opportunity radar entry queue, bankroll-aware autonomy policy, signal scoring, strategy replay lab, position-level exit watch, simulated autonomous buy/sell/trim cycles, portfolio PnL, execution readiness caps, dry-run order planning, hash-only signer simulation, execution drills, audit records, and a live-execution gate",
      "On-chain event inbox accepts local Helius-style wallet event batches, dedupes by signature, stores parsed metadata in the local paper ledger, and turns mapped buy/sell flow into copy-buy, copy-sell, risk-exit, watch, or ignore recommendations.",
      "Wallet event reactor turns those mapped wallet events into bounded paper attack/probe/protect/stand-down decisions, faster monitor wakeups, watch symbols, and execution-intent queue entries.",
      "Autonomous source-quality oracle separates organic candidate flow from boosted, paid-ad, or unchecked paid-order attention before the Web3 paper loop can chase, reducing size or forcing refresh/block decisions when source quality is weak.",
      "Source-quality sizing now flows into ranked paper opportunities, tradeability execution, action-queue execution, tick-bundle projection, and paper-ledger apply paths, so probe-grade boosted or uncertain coins use smaller autonomous paper buys instead of full-size churn.",
      "Execution landing supervisor scores whether each intent should stay in the paper ledger, use Jupiter Swap V2 managed landing, use router-submit for child-order/custom route control, or require fast Sender-style landing for perishable/private-route setups.",
      "Autonomous order handoff packages buy/sell intents into paper-fill, request-order, request-signature, submit-signed, poll-confirmation, rebuild, or blocked states with path, request id, payload hash, TTL, slippage, priority-fee, and blocker details.",
      "Pre-submit rehearsal scores each handoff for quote age, TTL, payload/request id readiness, slippage, priority fee, Sender tip, custody scope, relay gates, rebuild needs, and confirmation-poll readiness before any signer-bound step.",
      "Settlement reconciliation drill now cross-checks signed-relay status, transaction lifecycle stage, request id, payload hash, relay signature, and confirmation metadata, failing closed if a relayed or confirmed transaction is not mapped to polling or landed lifecycle evidence.",
      "Signature confirmation polling can call Solana getSignatureStatuses for the latest audited relayed signature, then update local audit/lifecycle evidence only when RPC reports confirmed or finalized status.",
      "Settlement fill reconciliation can call Solana getTransaction for the latest audited confirmed signature, summarize token balance deltas, infer side/price/quantity for simple USDC-versus-token swaps, and emit a reviewed mirror_apply_request only when evidence is clean; ambiguous, missing, failed, complex, or over-cap fill evidence stays blocked.",
      "Autonomous settlement watchdog can run confirmation polling, fill reconciliation, and an explicitly allowed guarded local portfolio mirror apply as one chain, while still blocking live execution, wallet mutation, unsigned transaction storage, ambiguous fills, over-cap fills, and duplicate idempotency keys.",
      "Autonomous execution adapter readiness condenses read-only Jupiter quote refresh, Swap V2 order/execute readiness, landing path, signer handoff, relay state, and paper fallback into one quote-only, paper-only, credential-gated, signature-gated, or Swap-V2-ready verdict.",
      "Autonomous custody mandate builds a local signer-policy envelope with provider readiness, policy hash, wallet scope, allowed route paths, allowed tokens/sides, spend caps, slippage cap, short expiry, revocation window, and blockers before any autonomous signing could be considered.",
      "Signer ops compares external wallet prompts, Privy server-wallet, Turnkey policy-wallet, and session-key-vault paths, then exposes the active provider's hash-only signature request envelope, redacted provider request packet, validates signer-request API rehearsals, and records ready-to-sign or managed-submit audit status without returning raw or signed transaction bytes.",
      "The Web3 wiring focus can now build a signer handoff receipt that summarizes wallet scope, custody policy, provider adapter, hash-only request, pre-submit rehearsal, relay state, and live-boundary locks while private keys, raw transaction bodies, unsigned payloads, signed payloads, provider dispatch, live execution, and wallet mutation remain blocked.",
      "Provider credential readiness now separates read-provider rail evidence for Helius/Solana and Jupiter from signer-provider credential evidence, then turns wallet scope, redacted provider credential scope, policy hash continuity, custody envelope state, signer request evidence, provider request packet readiness, user-presence requirements, and live-boundary locks into one launch-checklist receipt.",
      "Provider-managed submit status polling can accept validated Privy, Turnkey, or session-key provider status evidence for an already audited managed-submit request, match request id and payload hash continuity, and advance local lifecycle evidence to pending, confirmed, or failed without storing transaction bodies.",
      "Autonomous live-readiness audit now fuses daemon loop health, market feed budget, route freshness, Solana fee/TTL rehearsal, custody policy, signer boundary, submit relay, and kill switch state into one paper-only, daemon-gated, signature-gated, submit-gated, blocked, or live-ready verdict before real-capital automation could be considered.",
      "A live-capital preflight drill now combines live-readiness state, daemon handoff real-capital boundaries, and repeat-proof promotion gates, failing closed unless any future live-ready state is explicitly allowed for manual executor review.",
      "A live-landing drill now checks the concrete Solana/Jupiter landing evidence that would be required before real autonomous swaps could ever be reviewed: fresh route proof, Swap V2 order readiness, blockhash lifetime, priority-fee and compute budget, slippage guard, signer policy, relay lock, and confirmation polling.",
      "Autonomous daemon handoff now exposes and persists an external-scheduler lease guard with endpoint, POST payload, renewal timing, active runner/request id, expiry, replay/conflict counts, max ticks/fills, provider budget, stop conditions, and paper-only live-boundary controls so overlapping daemon calls cannot silently double-advance the local paper loop.",
      "Autonomous daemon handoff now includes a read-only market-worker contract that tells an external runner which DEX/profile/pair/paid-order/route evidence lane to refresh next, with cadence, budget, watch symbols, loop-feed permission, blockers, and no signing or wallet authority.",
      "A runnable Web3 autonomous daemon script can now operate the existing backend loop outside the browser with bounded tick counts, lease ownership, replay/conflict protection, gated-heartbeat mode, JSON run receipts, and a hard paper-only refusal if real-capital autonomy is armed.",
      "A supervised Web3 daemon runner can now run repeated leased paper-daemon rounds outside the browser, write a local health receipt, count posted/blocked/error rounds, and open a fail-closed circuit while still refusing signing, wallet mutation, or real-capital authority.",
      "The supervised Web3 daemon runner now tracks paper equity, net paper PnL, peak equity, max drawdown, optional paper profit target, and optional paper drawdown brake so unattended paper runs can stop after gains or fail closed after losses.",
      "The supervised Web3 daemon runner keeps one stable runner id across repeated rounds, so lease renewal belongs to the same paper operator instead of creating self-conflicting runner identities.",
      "The Web3 trading cockpit now surfaces that supervised daemon health beside the backend daemon handoff, including running/completed/idle/circuit-open/error state, local receipt timing, fail-closed circuit posture, and live/wallet mutation locks.",
      "The autonomous daemon runner now opportunistically attaches the guarded settlement watchdog request when local state already contains relayed signature evidence, so confirmation polling, fill reconciliation, and local paper mirror follow-through can proceed without a human opening Route Ops.",
      "A Web3 autonomous forward-run harness now resets the local paper ledger, runs bounded daemon ticks, compares start/end wallet equity, reports net paper PnL against a target, and can fail deployment checks when the make-money loop is not producing target paper alpha.",
      "The Web3 autonomous forward suite now repeats the bounded paper-daemon proof across base, breakout, and rug-risk sample regimes, reporting aggregate PnL, moved/traded regime counts, full-wallet hot-coin baseline alpha, same-notional deployed-capital alpha, and best/worst scenario outcomes so the make-money loop is not judged from one tape only.",
      "The Web3 autonomous repeat proof can rerun the forward suite or a single regime multiple times, reporting hit rate, average PnL, cumulative drawdown, consistency score, full-wallet hot-coin alpha, same-notional deployed-capital alpha, and a paper-promotion gate with explicit blockers before any stronger autonomy claim is made.",
      "A paper-promotion guard now converts repeat proof into a bounded autonomy posture: scale paper, selective paper, protect-only, or blocked, with paper size multiplier, supervised-round cap, profit target, and loss brake recommendations while keeping live execution locked.",
      "A promoted paper autopilot can now run repeat proof, apply the paper-promotion guard, reset the local paper ledger, and start only the bounded supervised paper daemon rounds that the guard permits.",
      "The compact Web3 cockpit can now start that promoted paper autopilot through a guarded local API route, then refresh the paper wallet and daemon-supervisor health receipt after the run completes.",
      "Promoted paper autopilot receipts are now sanitized into a local health record and surfaced after reload through the Web3 cockpit and /api/health, preserving PnL, tick, supervisor, promotion, and paper-only boundary evidence.",
      "Promoted paper autopilot health now keeps a rolling local run memory with cumulative PnL, average run PnL, target-hit rate, and recent-run trend chart so the operator can judge whether the autonomous paper loop is improving over time.",
      "That promoted-run memory now acts as an autonomy governor: extend, continue, tighten, protect, or stand down, with a memory-based supervised-round cap applied before the next promoted paper run starts.",
      "Web3 profit-proof readiness now turns local paper PnL, promoted-run sample size, cumulative promoted PnL, target-hit rate, loss-brake state, and live-boundary locks into one health/checklist receipt before any stronger autonomy claim.",
      "Profit-proof readiness now includes a promoted paper proof plan with the required run count, remaining run gap, target-hit requirement, suggested next paper batch, and safe local command needed before live-capital review can trust the sample.",
      "The promoted paper autopilot route and cockpit button now consume that proof plan, clamp the next paper batch to the remaining proof gap, and support exact one-window proof gaps instead of always running a fixed batch.",
      "A Web3 autonomy launch checklist now rolls paper profit, promoted-run memory, market freshness, route proof, execution quality, custody policy, signer, relay, settlement, kill-switch, and live-boundary evidence into one visible and API-readable verdict with completed proof counts and structured remaining gates before any manual live-capital review.",
      "The launch checklist now includes top-cockpit dry-run signer setup and live DEX order rehearsal actions that scope a public-key rehearsal, signer simulation metadata, route/order evidence, caps, slippage, and kill-switch review while still refusing private keys, transaction submission, custody, wallet mutation, or real-capital trading.",
      "The launch checklist now also isolates the production cutover gates that are actually left for real-money autonomy: supervised worker operations, provider credentials, live wallet accounting, and long-horizon profit proof.",
      "The Web3 launch checklist now exposes a compact cutover runway that sequences paper profit proof, supervised runner evidence, wallet/provider scope, order rehearsal, and manual live review so the next safe action is visible without scanning the whole cockpit.",
      "The Web3 trading cockpit now shows the same operator input packet inline with launch readiness, naming the dedicated trading wallet, wallet ownership proof, Jupiter route/order key, signer/custody choice, signer provider credentials, settlement/accounting review, and manual live approval without accepting private keys or seed phrases.",
      "Operator request and research handoff packets now carry a current input contract that names the one safe next input, target names, storage rule, collection surface, verifier command, and blocked live/signing/wallet/secret authority for helper handoff.",
      "Wallet ownership proof now expires the server-issued text challenge after 10 minutes, rejects stale or future-dated signatures, stores only challenge/signature hashes plus freshness metadata, and keeps pre-freshness receipts from satisfying the live canary gate.",
      "The first funded canary gates now distinguish durable wallet-proof evidence from current canary authorization: unsigned-order preflight, unsigned-order handoff, supervised canary readiness, and live canary relay require a recent hash-only wallet proof and tell the operator to rerun Prove wallet when the proof is too old.",
      "The compact Web3 health summaries now include that same current input contract for monitors, so dashboard automation can show the next safe field without fetching full text packets or secrets.",
      "The trading command board and expanded live-usability receipt now show that current input contract, including target names and verifier command, so the cockpit points at the exact safe setup field before live review.",
      "The Web3 launch checklist now exposes a next-operator-action callout in the cockpit and Settings, so the immediate credential or approval gap stays visible even when the longer cutover runway is still proving paper profit.",
      "The Web3 trading cockpit now also shows a launch repair queue that turns raw blockers into safe actions for fill-quality repair, paper accountability, supervisor freshness, route/order rehearsal, operator input scope, and npm run verify:web3 checks while live execution stays blocked.",
      "The Web3 launch checklist now exposes a promoted paper proof threshold matrix for local accountability, promoted run count, promoted PnL, target-hit rate, recent positives, loss brake, memory posture, and live-boundary lock evidence, so profit proof gaps are visible before any live review.",
      "The local paper accountability repair command now writes a sanitized paper-only receipt that the launch checklist reads, so improved, blocked, stale, or no-progress repair loops are visible in the cockpit and Settings without exposing secrets or transaction payloads.",
      "The local paper accountability repair plan now compares blocker copy against the current monitor heartbeat, so fresh monitor evidence points operators at route, preflight, or profit-lock repair instead of stale-heartbeat guidance.",
      "The autonomous session heartbeat now treats a fresh monitor stand-down as a watch/observe state instead of a stale-heartbeat failure, so downstream run-envelope blockers stay tied to the real route, preflight, or risk gate.",
      "The cutover runway now consumes that local repair-health receipt too, so the profit-proof step becomes blocked with the latest repair next action when paper accountability has plateaued instead of continuing to imply the same repair command is enough.",
      "When the launch checklist is evaluating live DEX evidence, the paper-accountability repair command now uses a read-only live-dex route-refresh mode and refuses live-dex autonomous sessions, so route proof can refresh without enabling trading authority.",
      "When public DEX discovery rate-limits or fails, the live DEX fallback receipt now keeps held-position watchlist evidence visible as failed/blocked instead of hiding it, so protective monitoring stays explicit while fresh entries remain blocked.",
      "Settings now surfaces the Web3 operator input packet for the dedicated trading wallet, wallet ownership proof, Jupiter route/order key, signer/custody choice, signer provider credentials, settlement/accounting review, and manual live approval, while private keys and seed phrases stay out of the app.",
      "Settings now also surfaces the Web3 launch repair queue beside credential setup, so operators can see paper-accountability repair, supervisor refresh, route/order rehearsal, operator input scope, and verifier actions without switching back to the cockpit.",
      "The Web3 route-order cutover step now exposes the safe npm run landing-drill:web3 command for read-only landing rehearsal while live signing, submission, custody, and wallet mutation stay blocked.",
      "The Web3 wiring focus can now build an account setup receipt that detects local Helius/Solana, Jupiter, dedicated public wallet, signer posture, emergency-stop, accounting, and optional feed configuration without creating third-party accounts, submitting signup forms, or echoing secrets.",
      "The Web3 wiring focus can now test provider health with a redacted receipt that proves Solana RPC health, latest blockhash, Helius DAS wallet-read gating, Jupiter quote readiness, and Jupiter order gating from server env while keeping secrets, transaction bodies, live execution, and wallet mutation blocked.",
      "The Web3 API now includes a compact DEX discovery receipt that summarizes DEX Screener profiles, boosts, ads, paid-order checks, pair mapping, top symbols, scanner intake, and source health as read-only paper evidence while live execution, transaction submission, wallet mutation, private-key storage, and secret echo remain blocked.",
      "The Web3 credential panel can now rehearse Jupiter order readiness from a one-shot session key or server env, hash request evidence, withhold unsigned transaction bytes, and still block execute, signing, live execution, and wallet mutation.",
      "First funded canary receipts now distinguish Jupiter rehearsal evidence from canary-arming credentials: session-only Jupiter tests can prove route/order evidence, but the one-shot unsigned canary handoff requires `JUPITER_API_KEY` in ignored server env.",
      "Settings now includes a Web3 trading credentials runway with a full credential checklist for Helius/Solana, Jupiter, wallet, signer, emergency-stop, and accounting lanes, including storage rules, env targets, setup links, and test actions without accepting or storing API keys.",
      "The external Web3 setup packet now includes a policy-signer provider lane and redacted ignored-env template targets for Privy, Turnkey, and future session-key review while still keeping wallet private keys, session private keys, seed phrases, transaction bodies, signed payloads, live execution, and wallet mutation blocked.",
      "Settings now also includes a secure credential handoff that summarizes which Web3 lanes are ready, which input is next, and which verifier command to run while keeping Helius/Jupiter secrets out of browser storage and live execution blocked.",
      "Settings and /api/web3-operator-credential-handoff now expose a redacted operator credential handoff receipt with allowed inputs, never-requested fields, safe collection surfaces, env targets, next input, and verifier commands while keeping raw secrets and live execution blocked.",
      "The operator credential handoff now includes live-ops inputs for emergency-stop target, production-worker owner/process/alert/restart targets, and accounting export target, reported only as safe env target names and configured/missing status.",
      "The operator credential handoff now carries a compact live-usability summary with real-capital blocker counts, listed-versus-total row counts, live-lane counts, the next ordered unlock step, and the blocker receipt hash without exposing secrets or granting live authority.",
      "Settings and /api/web3-operator-request-packet now expose a shareable redacted Web3 request packet with the next ordered unlock step, full operator unlock sequence, compact live-usability summary, required inputs, safe-to-provide values, never-provide values, verifier commands, a copy action for the redacted text, and blocked live-authority boundaries.",
      "The Web3 research handoff now includes that same live-usability summary in both JSON and the pasteable research text, so external helpers see blocker counts and the next unlock step without a second lookup.",
      "Settings now promotes the operator handoff into a compact safe-to-provide request packet with open required lanes before the deeper receipts, so operators can see exactly which non-secret inputs are useful and which secrets are never accepted.",
      "Settings now includes a dedicated wallet packet that rejects invalid or sample all-ones wallet scope for live-review readiness, asks for a public Solana address only, points at text-only wallet ownership proof, and exposes the strict --wallet=<public-solana-address> operator-wallet verifier while live execution and wallet mutation stay blocked.",
      "Settings now includes a Jupiter order packet that names the missing Swap V2 key, dedicated-wallet dependency, redacted order rehearsal route, and strict order verifier while keeping transaction bytes, execute, signing, submission, live execution, and wallet mutation blocked.",
      "Settings now includes a live ops packet that consolidates production-supervisor freshness, emergency-stop target status, accounting/export readiness, production-worker target setup for process manager/owner/alerts/restart policy, safe ops commands, process-manager review, and manual live approval while external dispatch, live execution, transaction submission, and wallet mutation remain blocked.",
      "Settings now includes a supervised live runway that consolidates dedicated wallet, Jupiter order, signer, live ops, accounting, and manual review lanes into one next-action checklist while transaction submission, live execution, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.",
      "Settings and /api/web3-manual-live-review-packet now expose a manual live-review packet that consolidates the launch checklist, live-capital preflight, supervised runway, and live ops signoffs for external review only while signing, submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.",
      "The Web3 trading cockpit now surfaces that same supervised live runway before the main autonomous workspace, linking operators back to secure setup while keeping live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked.",
      "The Web3 trading cockpit can now refresh stale production-supervisor evidence through a one-round sample-source paper supervisor action, keeping the receipt fresh for review while live execution, transaction submission, webhook dispatch, and wallet mutation stay blocked.",
      "A Web3 credential doctor command can now read local account setup, provider health, launch checklist, live preflight, manual live-review packet, and production-supervisor receipts, optionally refresh one bounded paper-supervisor round, write a sanitized local doctor receipt, and surface it in Settings without echoing secrets or changing wallet authority.",
      "Settings can now refresh that same sanitized credential doctor receipt through a localhost-only /api/web3-credential-doctor action with operator acknowledgement, while preview mode is covered by the strict verifier and live execution, signing, submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.",
      "Settings now also includes a Web3 credential action console with an action checklist for provider evidence, public wallet scope, live DEX proof, Jupiter order proof, and live preflight, plus a next-operator-unlock callout that links directly to the public wallet field and verifier command; it can test Helius/Solana, read-only DEX scanner evidence, wallet scope, Jupiter rehearsal routes, emergency-stop/accounting target setup, signer-provider target setup, production-worker target setup, and a localhost-only ignored-env credential install path without saving API keys to browser storage, accepting wallet private keys or seed phrases, returning transaction bytes, dispatching webhooks, or unlocking live execution.",
      "The local Web3 credential installer receipt now reports runtime-applied keys, restart-required keys, and a runtime next action, so Settings can show whether a newly installed Jupiter key or first-canary flag is active in the currently running server before canary checks continue.",
      "Jupiter rehearsal now writes a sanitized proof tape that Settings can show after reload, preserving quote/order readiness, request-hash evidence, key source, wallet preview, and transaction-byte withholding without storing secrets or enabling execution.",
      "The local Web3 credential installer now has an allowlisted signer-provider lane for external-wallet, Privy, Turnkey, and session-key env targets, while still rejecting wallet private keys, session private keys, seed phrases, mnemonics, keypairs, raw transactions, signed payloads, live execution, and wallet mutation.",
      "Settings now opens Web3 credentials with an operator intake board that names the next safe input, collection surface, storage rule, verifier command, open credential lanes, and never-provide list before the deeper handoff receipt.",
      "Settings now starts Web3 credentials with a command center that condenses the next safe input, safe-in-Settings lanes, external-only review lanes, strict verifier path, and never-provide boundary before the longer credential receipts.",
      "Settings now places a first-screen Web3 setup priority card before the general setup sections, showing the next safe Web3 input, live-lane counts, research-question count, strict verifier command, and links to the wallet field, credential runway, research packet, and read-only Live DEX cockpit while live authority remains blocked.",
      "Settings now adds a first funded canary handoff inside that priority card, combining the current first-canary drill step, proof count, hard-fail count, safe-to-provide credential requirements, never-paste list, safe canary surface, and verifier command while still reporting the live canary as not proven until the signed confirmation and accounting proof chain is real.",
      "Settings now opens the deeper Web3 credentials runway with a live trading setup launchpad that condenses the next safe input, wallet proof, Jupiter order proof, signer/custody status, live blocker board, and tiny canary proof into one no-secrets operator view while private keys, seed phrases, raw transactions, signed payload storage, wallet authority, and live execution remain blocked.",
      "Settings now adds a Web3 credential safety matrix that groups setup inputs by Settings console, server env only, browser wallet, external review, and never accepted, using target names and labels only before any credential field is touched.",
      "Settings now includes a Web3 research handoff packet and /api/web3-research-handoff-packet so provider, custody, risk, operations, product, and profit-proof questions can be safely sent to another helper with the next ordered unlock step, without secrets, transaction bytes, signing authority, wallet mutation, or live execution.",
      "The Web3 research handoff now includes a credential requirements packet for helper/operator collection, naming safe value types, owners, surfaces, storage rules, target names, related research lanes, and completion signals for wallet, provider, Jupiter, signer, ops, accounting, risk, and manual-review gates while live authority stays blocked.",
      "/api/web3-credential-requirements now exposes that safe credential checklist as standalone JSON, and /api/health exposes compact web3_credential_requirements counts, hashes, the current wallet gate, source endpoints, and blocked live/signing/wallet/secret permissions for monitors.",
      "/api/web3-live-autonomy-readiness and /api/health now expose the final autonomous wallet-trading transition gate, including daemon, market, route, fee, policy, signer, relay, and kill-switch readiness while real-capital trading, live execution, signing, submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.",
      "/api/web3-live-activation-plan, npm run activate:web3, Settings, and /api/health now expose one consolidated Web3 live activation plan with ordered milestones, the current safe wallet milestone, strict verifier commands, copyable redacted Markdown, and blocked activation/signing/submission/wallet authority.",
      "The live activation plan now carries the scoped public wallet into milestone, health, Settings, and copyable command output, replacing <public-solana-address> placeholders when a dedicated public wallet is known while still blocking private keys, seed phrases, signing, submission, wallet mutation, and live authority.",
      "/api/web3-live-activation-intake now accepts only a safe activation profile shape for public wallet scope, readiness statuses, signer mode, ops/accounting state, and risk caps, rejects private keys, seed phrases, API keys, transaction bytes, and signed payloads, and returns a redacted receipt while live execution, signing, submission, wallet mutation, and secret echo stay blocked.",
      "/api/web3-live-ignition, Trading, /api/health, and npm run verify:web3 now expose one bot-facing real-money ignition go/no-go receipt plus a POST launch-envelope action that reconciles live scope, wallet scope, wallet ownership proof, route/order proof, signer relay, autonomy gate, canary proof, and the safety boundary while can_autonomously_trade_real_money_now remains false until a funded canary is relayed, confirmed, reconciled, and mirrored. Ignition now ranks wallet ownership ahead of Jupiter/order when a public wallet is scoped but not proven, so the app points at Prove wallet before any unsigned live canary order.",
      "/api/web3-supervised-canary-readiness, Trading, Settings, /api/health, and npm run verify:web3 now expose the first-funded-canary ladder and live canary attempt contract, separating the tiny unsigned-order request, external browser-wallet signature, guarded signed-payload relay, manual review, funded canary proof, exact next endpoint/command, missing inputs, and runnable-now state while live execution and wallet mutation remain blocked until the proof chain is real.",
      "/api/web3-supervised-canary-readiness now keeps signer-relay and manual-review lanes as explicit operator actions, so its blockers and attempt-contract missing inputs no longer surface raw evidence fragments while upstream wallet, Jupiter, flag, or preflight gates remain blocked.",
      "Trading now defaults plain /trading to the canonical live DEX breakout canary view, preserves that scenario through source switching, and keeps live canary console, blocker, credential, and receipt links on scenario=breakout so the operator is not bounced between base and breakout canary receipts before the first funded test.",
      "Trading now opens with a compact live trading command center driven by the first-canary drill receipt: drill status, hash, hard-fail count, proof count, live-dex drill link, ordered next lane, leading failing lanes, next safe credential/blocker, ordered unblock plan, next post-signing proof step, signature preview, and proof watcher command appear before the canary console, while detailed ignition and canary-readiness receipts sit in the review drawer. When wallet ownership is the next live blocker, the drill's safe setup surface points at Trading so Check wallet and Prove wallet sit beside the canary controls.",
      "Settings now mirrors that same first-canary drill receipt in the live trading setup launchpad, showing the next unblock step, safe setup surface, verifier command, and ordered first-canary unblock steps beside the credential console before any wallet or provider gate can be mistaken for a completed live trade.",
      "Settings credential console now refreshes that first-canary drill after safe wallet, provider, Jupiter, preflight, and canary actions, so the next live-trade blocker, proof count, hard-fail count, and ordered gates update in place while actual_live_trade_tested remains false until the signed canary proof chain is real.",
      "Settings credential console now includes the same no-transaction Canary preflight as Trading, checking the saved scoped wallet, tiny amount, slippage, live flags, source/account scope, and Jupiter env without connecting a browser wallet for preflight and while returning no transaction bytes.",
      "Trading live canary console now refreshes the first-canary drill after wallet proof, canary preflight, tiny-canary signing, proof checks, and manual refresh, keeping the next unblock step, hard-fail count, proof count, unsigned-order readiness, and ordered gates visible beside the signing controls.",
      "Trading live canary console now shows an explicit live-test truth strip for actual trade, real funds moved, signed-relay status, unsigned-order readiness, hard failures, and proof count, plus an after-current-gate forecast that keeps Jupiter order proof, live flags, unsigned preflight, signer relay, and post-signing proof visibly blocked until the active wallet proof succeeds.",
      "Trading live canary console now includes an always-visible gate snapshot for wallet proof, live flags, unsigned handoff/request id, relay readiness, proof count, and current blocker count, plus one receipt-driven current-gate action so wallet proof, preflight, signing, proof watching, or credential setup is the visible next step before live funds can move.",
      "Trading live canary console now adds a compact first-canary execution rail under that gate snapshot, starting at the current drill step and labeling the next few canary gates by action surface while live execution, submission, signing authority, and wallet mutation remain blocked.",
      "Trading and Settings now require a visible final tiny-canary acknowledgement before the Sign tiny canary action can open an external wallet transaction prompt, and the armed state resets after a relay attempt.",
      "Settings now mirrors that first-canary truth strip and after-current-gate forecast, and the credential requirements packet points wallet-ownership proof directly at the Trading live canary console anchor when that proof is the active gate.",
      "The live-usability blocker receipt now normalizes live-capital preflight rows for Jupiter order proof, signer/custody, settlement, and manual review so the real-money queue does not show unrelated paper-market refresh or sizing text.",
      "Trading live canary console now includes a no-signature Check wallet action that fetches the safe wallet-ownership challenge receipt for the connected or saved dedicated wallet, blocks mismatched connected wallets, and refreshes the first-canary drill before any message signature prompt.",
      "Trading now server-renders the latest hash-only wallet ownership receipt for the scoped public wallet into the live canary console, so ownership proof from Settings or an earlier Trading session remains visible after reload.",
      "The live-usability blocker receipt now promotes the active current input into next_blocker and next_credential_request when wallet ownership proof is the real next gate, so Settings, Trading, helper packets, and health monitors point at Check wallet and Prove wallet instead of re-asking for a public wallet address.",
      "The compact live-usability blocker queue now ranks first-canary setup lanes such as Jupiter setup before paper/preflight market-refresh chores, while rows=all still exposes every dependency row.",
      "/api/web3-live-unsigned-order-handoff now defaults its preflight and one-shot order handoff to the saved dedicated public wallet when no request wallet is supplied, while still rejecting invalid, sample, mismatched, or unproven wallets before any Jupiter order creation or browser-wallet transaction prompt.",
      "/api/web3-live-trade-canary now keeps the first-funded-canary blocker list scoped to live scope, wallet proof, Jupiter, live flags, unsigned handoff, signed relay, and confirmation proof, while paper dry-run cap recovery stays in paper/runway receipts instead of obscuring the next real canary action.",
      "/api/web3-live-trade-canary and the Trading canary console now expose structured required_inputs plus next_required_input for wallet ownership proof, Jupiter order rail, first-canary live flags, unsigned-order preflight, signed-payload relay, and post-signing proof, with safe surfaces, target names, verifier commands, completion signals, and blocked live execution, transaction submission, wallet mutation, and secret echo on every row.",
      "Settings Web3 credentials now mirrors that same live-canary required-input resolver, refreshes it with blocker and drill receipts, and keeps the current wallet/Jupiter/live-flag/preflight/relay/proof input visible next to the safe credential controls while live execution, submission, wallet mutation, and secret echo remain blocked.",
      "The Settings canary resolver now maps each current required input to the closest safe local control, including wallet proof, Jupiter key, first-canary live flags, canary preflight, and tiny-canary signing, while still linking back to the canonical canary receipt surface.",
      "/api/web3-first-canary-drill now also scopes its blocker list to first-canary operator steps, so paper market backfill, paper sizing repair, dry-run cap repair, and profit-proof chores stay in paper/readiness receipts instead of hiding the wallet, Jupiter, flag, relay, or confirmation action needed for the funded canary.",
      "/api/web3-first-canary-drill and /api/web3-first-canary-handoff now emit wallet-bound strict verifier commands when a dedicated public wallet is scoped, so first-canary handoff guidance no longer leaves <public-solana-address> placeholders in the active next step while private keys, seed phrases, signed payloads, and live authority remain blocked.",
      "/api/web3-live-usability-blockers and /api/health now carry the scoped public wallet into the active blocker, credential request, verification runway, and verifier-command list, replacing <public-solana-address> placeholders once a dedicated wallet is saved while still blocking private keys, seed phrases, signing, submission, wallet mutation, and live authority.",
      "The Web3 smoke check now fetches the actual Trading cockpit from the running app and fails if it renders the route-error fallback, drops the no-real-trade-tested truth strip, hides the wallet-ownership live gate, crashes on wallet-scoped helper code, or leaks stale raw blocker fragments into live-trade guidance.",
      "The Web3 verifier and smoke check now share a local state-mutation lock, so concurrent runs queue instead of resetting the sample/persistent wallet state while hash-only wallet ownership proof and live-canary blockers are being verified.",
      "/api/web3-first-canary-handoff and npm run handoff-canary:web3 now combine the first-canary drill with credential requirements into one redacted operator packet, naming done gates, open first-canary steps, the next operator action, current-step safe-to-provide values, never-provide values, proof criteria, source endpoints, and blocked live/signing/wallet/secret authority.",
      "The first-canary handoff now also includes a machine-readable current-step contract and proof ledger, and Settings mirrors that contract with a copyable redacted handoff packet so operators and helper agents can act on the same next gate without parsing prose.",
      "The standalone npm run drill-canary:web3 command now mirrors the API drill's scoped public-wallet verifier fields and replaces wallet placeholders in safe commands and the next unblock step whenever the local app has a dedicated public wallet saved.",
      "GET /api/web3-first-canary-drill, /api/health, and the Node-only npm run drill-canary:web3 command now consolidate the first-canary runway across live blockers, supervised canary readiness, Jupiter order proof, unsigned-order preflight, and canary proof receipts while staying read-only and unable to sign, submit, or move funds; the drill receipt and health summary include a next unblock step plus operator_unblock_plan with safe surfaces, commands, completion signals, and blocked live permissions. /api/health also exposes web3_live_first_canary_drill as the canonical live-dex persistent monitor summary, web3_live_canary_proof as the compact post-signing proof monitor, and the drill health separates the ordered canary lane from the broader credential-intake label.",
      "The first-canary operator unblock plan now uses explicit operator actions for signer relay, manual live review, and proof watch instead of raw evidence fragments, so Trading, Settings, and helper handoff packets show the next safe human step even while upstream gates remain blocked.",
      "The live-usability blocker receipt and signer credential packet now turn signer-runway wallet/setup gaps into explicit operator actions, so signer posture rows no longer show raw evidence fragments such as Hash-only wallet ownership proof.",
      "The full rows=all live-usability audit now normalizes preflight, manual-review, and runway rows into operator actions, so lower-priority signer, settlement, provider, and Jupiter rows no longer show spend/custody/debug fragments as the next step.",
      "/api/web3-live-trade-canary now checks signed-payload request continuity before attempting relay, orders canary blockers by live-scope, wallet, ownership-proof, Jupiter, live-flag, and request-id prerequisites before final signature proof, reports the expected current request id, keeps relayed-but-unconfirmed signatures out of actual_live_trade_tested, marks stale or missing canary request ids as blocked, and still never echoes signed payloads, private keys, seed phrases, API keys, raw transaction fields, wallet authority, or live execution permission.",
      "/api/web3-live-unsigned-order-handoff now requires the request wallet to match the scoped dedicated wallet and have a hash-only browser-wallet ownership proof before preflight can pass or a one-shot unsigned canary order can be returned; when it does return one, it records a redacted continuity audit preserving only request id, route, payload hash, and byte count so the signed-payload relay can match the browser-wallet signature without storing unsigned transaction bytes.",
      "/api/web3-live-trade-canary, /api/web3-live-unsigned-order-handoff, /api/web3-wallet-ownership, Trading, and Settings now explicitly state whether a real live trade has actually been tested, separate paper/read-only/Jupiter rehearsal from money movement, let Trading preflight the exact canary wallet before any prompt, let Trading prove wallet ownership with a fresh server-issued text-only challenge and hash receipt, show a canary launch checklist for preflight, wallet signing, relay, and confirmation/accounting, show the post-signing proof chain for signed relay, chain confirmation, settlement reconciliation, and portfolio mirror accounting in Trading and Settings, and let the live Trading canary run a bounded auto-watch proof loop after a wallet signature.",
      "A Node-only npm run prove-canary:web3 command now watches the live canary proof receipt, can run only the guarded settlement watchdog for the latest stored signature, and exits nonzero until signed relay, chain confirmation, settlement reconciliation, and portfolio mirror proof all pass.",
      "A Node-only npm run research:web3 command now prints that same redacted Web3 research handoff as Markdown or JSON, Settings surfaces the validated export commands, and the command checks live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo all stay blocked.",
      "A Node-only npm run requirements:web3 command now prints the standalone Web3 credential requirements packet as Markdown or JSON, checks the current wallet requirement, including ownership proof after wallet scope exists, and blocked live/signing/wallet/secret permissions while redacting configured local provider secrets from failures.",
      "The Web3 credential requirements packet now includes a first-canary live-flags requirement with the exact ignored-env targets MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION, MASTERMOLD_LIVE_OPERATOR_APPROVAL, and MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF, while still treating them as setup values only and keeping signing, submission, wallet mutation, and live-trade proof blocked until the canary proof chain is real.",
      "A Node-only npm run handoff-canary:web3 command now prints the first funded canary handoff as Markdown or JSON, verifies it links the canary drill and credential requirements hashes, confirms actual_live_trade_tested remains false until canary proof exists, and rejects secret-looking leaks while live execution, signing, submission, wallet mutation, signed-payload storage, private-key storage, seed-phrase storage, and secret echo stay blocked.",
      "Settings now includes a Web3 research answer intake console backed by /api/web3-research-answer-intake so redacted helper answers can be scored into custody, provider, risk, ops, cockpit, and profit-proof decision coverage, then turned into an owner/phase implementation plan and queue while secret-looking pasted values are rejected and live authority stays blocked. The console can also load a lane-by-lane paste-back answer template so external helper output follows the scorer's expected format.",
      "Settings now adds a Web3 setup runway directly after the credential command center, turning safe credential input, read-only live DEX proof, strict wallet/order verification, and external live review into ordered operator steps while live authority stays blocked.",
      "Settings local credential install now includes exact first-canary live flags for the tiny unsigned handoff path, accepts only the reviewed flag values, returns env target names only, rejects malformed/private inputs, and still cannot sign, submit, custody funds, or mutate wallets.",
      "Settings credential console now surfaces those first-canary live flags as an explicit arming panel with exact accepted values, selected/installed status, and the safe localhost installer action while transaction signing, submission, wallet mutation, custody, and live trade proof remain blocked until the canary proof chain is real.",
      "/api/health now exposes compact Web3 research handoff and live-usability blocker summaries with question counts, missing real-money input counts, live-blocker counts, exact summarized source/account/scenario pointers, a separate live-dex persistent research export endpoint, and the same live-execution, wallet-mutation, signing, private-key, seed-phrase, and secret-echo locks.",
      "Settings now links back to both the sample Web3 cockpit and the read-only live DEX cockpit, so credential setup can continue in the right market-source view without implying signing, submission, or wallet mutation authority.",
      "The Web3 trading cockpit now defaults plain /trading to Live DEX read, keeps Sample tape as an explicit review switch, and keeps public DEX evidence distinct from seeded review tape while signing, submission, wallet mutation, and secret storage remain blocked.",
      "The Web3 trading cockpit now keeps the deep readiness receipts as a compact linked evidence index instead of pre-rendering the full audit stack into first paint, reducing default scroll and page weight while preserving direct read-only JSON links.",
      "The lower Web3 advanced workspace now defers its bulky trading-state and launch-checklist payloads to client fetches using the active source/account, so first paint stays focused on the live command board, canary gate, and wallet-proof blocker.",
      "The live-usability blocker receipt now sends wallet-ownership proof directly to the Trading live canary console anchor, where Check wallet and Prove wallet sit beside the first funded canary controls.",
      "The Settings credential console can now detect or connect a browser Solana wallet only far enough to read the public address into dry-run scope; signing, private-key storage, wallet mutation, and transaction submission remain blocked.",
      "The Settings credential console can now create a text-only wallet ownership proof from a browser Solana wallet message signature, then persist only hash evidence in the local Web3 audit log while transaction signing, submission, live execution, private-key storage, and wallet mutation remain blocked.",
      "Settings can now run a live-capital preflight receipt that consolidates operator wallet, provider rail, live DEX, Jupiter order, risk caps, kill switch, signer/custody, settlement, profit proof, and manual-review blockers without signing, submitting, creating accounts, or mutating wallets.",
      "Settings now also surfaces the Web3 launch-blocker queue from the same launch checklist used by the trading cockpit, showing hard blockers, review gates, and the next cutover step while still blocking live execution, wallet mutation, private-key storage, and transaction submission.",
      "Settings now shows a strict verifier runway that builds the operator-wallet, live-DEX, and wallet-plus-Jupiter-plus-DEX commands from the public wallet field and latest DEX receipt, while marking sample-wallet, missing live scanner evidence, or missing-Jupiter inputs as gated.",
      "The OHLCV route can now auto-resolve the current scanner candidate into a read-only GeckoTerminal candle request, producing local signal/noise and paper-only sizing evidence without exposing wallet authority or unlocking live execution.",
      "A read-only npm run monitor:web3 command now refreshes live DEX discovery, auto-resolves GeckoTerminal OHLCV, records local candle proof into the trading cockpit, appends a sanitized monitor history for the cockpit/API, and keeps live execution, transaction submission, signing, wallet mutation, and secret echo blocked.",
      "The Web3 credential doctor now consumes that sanitized monitor history as a market-monitor tape check, so live market freshness sits beside Helius, Jupiter, wallet, live-boundary, and paper-supervisor readiness.",
      "The Web3 credential doctor also consumes the sanitized Jupiter rehearsal history, separating missing Jupiter key scope from quote/order proof history while transaction bytes, signing, submission, and wallet mutation stay blocked.",
      "The Web3 trading cockpit now opens with an autonomy mode ladder that separates copilot, paper autonomy, dry-run order rehearsal, supervised live review, and autonomous live authority, showing the next operator gate before the deeper telemetry.",
      "The Web3 trading cockpit now opens with a command board that combines the current autonomous decision, paper wallet net-worth curve, primary safe action, runnable/gated counts, open blocker count, live-capital preflight score, next usable gate, supervised-live lane count, missing operator inputs, signal score, and route proof before the deeper receipt stack.",
      "The Web3 trading cockpit command board now routes its setup action directly to the current Settings target, including the public wallet field while the dedicated-wallet gate is active, so the cockpit and credential console form one operator flow.",
      "The Web3 trading cockpit now includes a Real-money usability card backed by /api/web3-live-usability-blockers, so the first screen says which operator inputs, signoffs, live lanes, and safe actions are still missing before real-money Web3 review.",
      "That Real-money usability card now counts the total missing live-usability rows while naming the compact rows listed, and its receipt drawer opens rows=all for the complete dependency-ranked blocker audit.",
      "The live-usability blocker receipt now groups missing rows by owner and evidence source, and Trading plus Settings surface those summaries so wallet, security, ops, accounting, strategy, and review work are not blurred together.",
      "The live-usability blocker receipt now also carries the latest sanitized credential-doctor status and freshness, and Trading, Settings, and /api/health surface that local audit signal without running the doctor, echoing secrets, or changing wallet authority.",
      "The trading cockpit now keeps the detailed live-usability blocker, usability, cutover, and operator-runbook receipts in a collapsed Readiness receipts and runbook drawer, so the operating view starts with the charted command surface while reviewers can still inspect JSON-linked evidence.",
      "/api/web3-live-usability-blockers now reconciles usability, cutover, runbook, live-capital preflight, supervised runway, and manual live-review receipts into one what-is-left contract with the next ordered unlock step while signing, submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.",
      "The live-usability receipt headline now separates cutover setup blockers from total versus listed dependency-ranked live-usability rows, so the app does not hide preflight, runway, wallet, and review work behind one ambiguous blocker count.",
      "/api/web3-live-usability-blockers now supports rows=all for a complete dependency-ranked blocker audit while keeping the default receipt compact for dashboards and keeping all live-authority locks blocked.",
      "Trading and Settings now surface that listed-versus-total live-usability row count directly in their what-is-left cards, including the refreshed credential action console after each safe setup action.",
      "Settings now places that same live-usability blocker receipt directly after the Web3 credential command center, so the operator sees missing real-money rows, signoff counts, live-lane counts, safe actions, and the what-is-left JSON before any credential fields.",
      "The Settings Web3 credential action console now refreshes that live-usability blocker receipt after public-wallet scope, provider checks, DEX tests, Jupiter rehearsal, wallet proof, and live preflight, so the operator sees the next safe real-money gate without hunting through the long runway.",
      "That refreshed Settings console receipt now includes the top dependency-ranked live-usability blocker rows, an Open current gate jump, and an Open all blockers JSON link, so the exact next public/env/review row is visible after each safe action while the full safe row set is inspectable.",
      "The Web3 trading page now renders the Web3 usability status receipt as a compact live-readiness dossier near the top of /trading, with usable/gated/locked counts, a capability rail, a JSON receipt link, expandable evidence, and locked live-authority boundaries.",
      "The Web3 usability receipt and trading cockpit now show an ordered operator unlock sequence for dedicated wallet scope, hash-only ownership proof, Jupiter order rehearsal, signer path, ops/accounting, and external review, while private keys, seed phrases, signing, submission, wallet mutation, and live execution remain blocked.",
      "Settings now renders that same ordered operator unlock sequence immediately after the credential command center, so credential entry starts with dedicated wallet scope before wallet proof, Jupiter, signer, ops/accounting, or external review work.",
      "The Web3 trading page and /api/web3-cutover-blocker-board now expose a redacted cutover blocker board that groups remaining setup work by operator, security, ops, accounting, and manual review owner while separating the next safe input from the next supervised-live lane blocker.",
      "The Web3 trading page and /api/web3-operator-runbook now expose a safe operator action map plus the current input contract, so paper, read-only, credential, verifier, and external-review actions stay tied to the exact next safe setup field while real-capital autonomous trading stays blocked.",
      "/api/health now exposes a compact web3_operator_runbook summary beside research handoff and live-usability health, so monitors can read the primary safe action, current input contract, next dependency blocker, next credential request with verification runway and completion criteria, live-review runbook endpoint, safe command, and blocked live/signing/wallet authority without fetching the full runbook.",
      "Settings now mirrors the same next dependency blocker, safe fix link, verifier command, compact next credential request, verification runway, and completion criteria in the first-screen Web3 setup priority card and credential action console, so the operator sees the exact safe wallet/provider/review value, follow-up proof path, and done condition before opening deeper receipts.",
      "The Settings Web3 credential action console now includes a safe credential profile that summarizes public wallet scope, read provider rail, Jupiter order rail, signer policy, ops/emergency stop, accounting ledger, and risk caps by readiness lane without echoing raw API keys, wallet authority, transaction bytes, or signed payloads.",
      "Settings now renders that same Web3 cutover blocker board inside the credential runway, so a non-technical operator can see owner counts, the next safe input, the next supervised-live blocker, env target names, and verifier commands without entering private keys or seed phrases.",
      "Settings now also renders the Web3 operator runbook before credential handoff, so after adding a safe input the operator can see the next paper, read-only, verifier, or external-review action without unlocking live capital.",
      "The Settings Web3 credential action console now includes a dedicated wallet gate that rejects the sample all-ones wallet for readiness, previews only the public address, shows the strict wallet verifier, links to the dedicated-wallet packet, and repeats that private keys, seed phrases, keypair JSON, transaction bytes, and signed payloads never belong in Settings.",
      "When the public candle provider is throttled, npm run monitor:web3 now returns an observed/degraded receipt with paper buys blocked instead of crashing or loosening execution gates.",
      "When live DEX candle auto-resolution hits stale discovery, npm run monitor:web3 now performs one bounded read-only discovery refresh and one OHLCV retry before writing a degraded receipt.",
      "The live DEX OHLCV auto resolver now refuses fallback/sample pool ids before calling GeckoTerminal, so stale public discovery becomes an explicit blocked candle-proof receipt instead of spending a provider request on fake sample pools.",
      "A Node-only npm run verify:web3 gate now snapshots and restores the saved public wallet/risk scope while checking the running app's Web3 health receipts, malformed wallet rejection, private-field rejection, public dry-run wallet scope save, validate-only credential redaction, configured Helius/Solana provider-health proof, usability and live-usability blocker redaction, dedicated-wallet/Jupiter-order/signer-credential/live-ops/live-capital-preflight/accounting-ledger packet boundaries, operator request/cutover/runbook/supervised-runway packet boundaries, manual live-review packet boundaries, research handoff and research-answer implementation queue boundaries, deterministic DEX discovery receipt boundaries, one-shot Jupiter rehearsal redaction, and live-execution/wallet-mutation locks for machines where Bun tests are unavailable.",
      "The verifier also has an opt-in --require-operator-wallet gate that refuses the sample all-ones wallet and requires a dedicated public Solana wallet before public-scope readiness can count toward live review.",
      "Research handoff, research-answer, operator-runbook, and doctor receipts now use the full --wallet=<public-solana-address> --require-operator-wallet verifier shape so helper guidance does not omit dedicated wallet scope.",
      "Account setup and provider-credential readiness now separate demo wallet scope from dedicated operator-wallet scope, so the sample all-ones wallet can exercise the UI but cannot satisfy live-review readiness.",
      "That verifier also has an opt-in --require-jupiter-order gate that requires a local Jupiter key and fails closed until quote plus unsigned order readiness are proven while transaction bytes, signing, execution, and wallet mutation remain blocked.",
      "The verifier also has an opt-in --require-dex-live gate that fails closed until current live DEX scanner evidence returns live candidates, mapped pairs, no failed discovery sources, and the same execution, submission, wallet, private-key, and secret-echo blocks.",
      "The verifier also has an opt-in --require-live-canary gate that fails closed until the tiny funded canary has a signed relay, confirmed or finalized chain status, settlement reconciliation, and local portfolio mirror proof.",
      "The strict live-DEX verifier can now fall back from throttled DEX discovery to auto-resolved GeckoTerminal OHLCV proof or a fresh recorded live-dex candle proof for a Solana pool while preserving the same blocked live-execution, submission, wallet-mutation, private-key, and secret-echo permissions.",
      "Settings now also exposes a Web3 external setup packet with official provider setup/docs links, env target names, and the next external operator action for Helius, Jupiter, wallet, signer, emergency-stop, and accounting work while in-app signup and credential capture stay blocked.",
      "The Web3 wiring focus now includes a credentials setup section for Helius/Solana RPC, Jupiter, wallet public key, signer mode, and risk caps; it tests provider readiness and can apply only a dry-run profile while keeping live execution and wallet mutation blocked.",
      "The Web3 credential form keeps API keys session-only and scrubs Helius/Jupiter keys from browser-saved drafts while still allowing non-secret wallet public key, signer mode, and risk caps to persist locally.",
      "Execution readiness now separates ready, exhausted, and too-small dry-run caps, returning a safe cap repair action and in-cockpit recovery buttons so operators can reset paper state or save larger local rehearsal caps without changing live-execution locks.",
      "The Web3 credential test can now verify read-only Helius DAS wallet asset visibility with getAssetsByOwner, returning only aggregate asset/priced-token counts and priced value while keeping raw holdings, secrets, signing, and wallet mutation out of scope.",
      "The Web3 credential setup now returns and displays a credential vault plan for read-only sync, dry-run rehearsal, supervised live review, and autonomous live trading, including storage rules for each input and a hard never-store rule for private keys or seed phrases.",
      "The Web3 credential setup now also displays a provider account runway for the researched stack: Helius/Solana reads, Jupiter rehearsal, dedicated trading wallet, manual external signer, discovery feeds, low-latency stream, emergency stop, and tax/accounting ledger, including optional provider/ops env-target status without exposing raw secrets, while making clear that the app does not create third-party accounts, store signer secrets, or unlock live execution.",
      "The Web3 Wiring focus now builds a redacted accounting ledger receipt from local paper fills, portfolio PnL, wallet readiness, settlement status, and mirror gates, returning hashed row identifiers and paper-only export permission while keeping real-money accounting gated.",
      "The Web3 Wiring focus now has a local emergency-stop drill that records a no-secrets receipt, halts browser Auto Watch, checks whether an ops target is configured, and keeps external dispatch, signing, submission, live execution, and wallet mutation blocked.",
      "The Web3 launch checklist now includes researched stack decisions for Helius/Solana provider reads, market discovery, Jupiter rehearsal, signer custody, risk policy, and manual live cutover, including the exact user inputs still needed before real trading can be reviewed.",
      "Production supervisor readiness now converts sanitized daemon-supervisor health into an API-visible process gate with receipt freshness, circuit state, profit target, drawdown brake, and live-boundary checks while still refusing to satisfy real-capital authority from inside the app.",
      "The production-supervision cutover step now shows the hardened local paper command with explicit target, drawdown brake, one-round tick bound, and JSON receipt output instead of a generic supervisor command.",
      "Live DEX dry-run order rehearsal can now include held-position protective sell routes when a wallet position matches the live market tape, building token-to-USDC Jupiter quote/order metadata with payload hashes while still blocking signing, submission, custody, and real-capital automation.",
      "Held-position sell rehearsals now size raw token amounts from Solana token decimals when RPC is configured, or from the verified held-coin watchlist for BONK, WIF, and POPCAT, instead of silently assuming every memecoin has six decimals.",
      "A read-only Solana wallet holdings adapter can now derive Helius RPC from HELIUS_API_KEY or use SOLANA_RPC_URL, scan all SPL token accounts with getTokenAccountsByOwner when a public wallet key is scoped, price wallet-held mints against the live DEX tape, disclose unpriced accounts, and feed priced balances into local protection and dry-run route rehearsal without signatures, private keys, approvals, transfers, custody, or wallet mutation.",
      "Read-only wallet activity history can now use the configured Helius/Solana RPC rail to summarize recent getSignaturesForAddress results with signature previews, hashes, slots, block times, and failure counts while omitting raw transaction bodies and keeping wallet mutation blocked.",
      "Read-only wallet transaction intelligence can now use Helius Enhanced Transactions address history to classify recent decoded wallet activity into swap, transfer, mint, burn, failure, or other buckets with signature hashes, transfer counts, and estimated visible fees while blocking raw transaction storage, signing, submission, and wallet mutation.",
      "Live wallet accounting readiness now turns wallet scope, RPC configuration, aggregate Helius DAS asset-index proof, SPL account sync, pricing coverage, decoded transaction classification, local portfolio application, settlement reconciliation, guarded mirror evidence, and wallet-mutation locks into one API-readable launch gate before live PnL can be trusted.",
      "Settlement reconciliation now scopes getTransaction token-balance deltas to the configured wallet owner before emitting a local portfolio mirror request, ignoring unrelated owner balances and ownerless token metadata so another account's swap cannot be mirrored as the app's fill.",
      "A clean persistent paper wallet can now take one daemon-owned bounded risk-adjusted momentum scout on the deterministic high-signal sample tape, including boosted breakout leaders when hard rug/liquidity/promotion risks are absent, so the forward run proves real local paper cycle/fill movement instead of only posting heartbeat ticks.",
      "Autonomous wallet telemetry turns paper daemon memory, portfolio equity, cash, exposure, drawdown, PnL slope, and blocker/fill counts into a first-class compounding/harvest/recover/cooldown/protect wallet verdict and net-worth curve.",
      "Autonomous wallet growth director fuses wallet net-worth curve, regime tape, lane capital, command-board edge, paper fill quality, churn, portfolio heat, and release pressure into one press/scalp/compound/harvest/protect/recover/pause posture with heat-capped fresh-buy limits and release targets.",
      "Autonomous re-entry hunter watches sold or missed-runner symbols for reclaim momentum, signal/noise repair, fill quality, prior paper-exit evidence, and wallet/regime readiness before allowing a bounded paper rebuy or probe.",
      "Autonomous profit route selector compares command-center, high-frequency, opportunity-race, market-intelligence, market-pulse, trend-chase, re-entry, portfolio-protection, route-profit, and wallet-growth lanes by expected net paper profit after cost, risk, urgency, blockers, and fill-quality evidence, then gates fresh paper buys while preserving protective sells.",
      "Autonomous profit lane scoreboard condenses those ranked lanes into a first-screen make-money board with leader lane, expected paper edge, realized lane contribution, trade-frequency score, capital-efficiency score, ready/blocked lane counts, and paper-only safeguards.",
      "Autonomous position situation board condenses held-position surveillance, portfolio tape, scalp-exit, trigger coverage, wallet heat, and the make-money lane into one held-coin urgency board with fresh-buy blocking, release-now notional, protected profit, capital-at-risk, and next review timing.",
      "Autonomous position exit contract gives every held paper coin a hard-stop, trailing-stop, take-profit, time-stop, trigger-coverage, and fresh-entry permission verdict, blocking new paper exposure when protection is missing while clearly staying local/paper-only unless live wallet gates are explicitly cleared.",
      "Autonomous portfolio mark board marks every open paper position against wallet equity, cash, exposure, realized PnL, and unrealized PnL, then surfaces best/worst held coins, release pressure, press budget, and the next portfolio action.",
      "Autonomous trading directive fuses held-position urgency, profit-lane ranking, the final order ticket, route proof, wallet runway, and cadence into one protect/harvest/refresh/attack/probe/stand-down/observe paper command with notional, wallet impact, confidence, blockers, and evidence rows.",
      "Autonomous directive outcome auditor checks whether the current make-money directive is improving the local paper wallet, then presses, holds, shrinks, protects, refreshes, blocks, or observes the next paper sizing decision with outcome score, wallet trend, follow-through, release target, and evidence rows.",
      "Autonomous reaction loop condenses Moonshot-style hot-coin tape, high-frequency race pressure, directive outcome, wallet trend, held-position pressure, and route/execution readiness into one next-second paper action with urgency, invalidation timing, buy/sell/route/wallet pressure, and evidence rows.",
      "Autonomous landing optimizer turns the reaction loop, landing supervisor, priority-fee drag, compute-unit budget, slippage/MEV risk, route freshness, pre-submit rehearsal, and signer gates into one land-now/priority/managed/paper/refresh/fee-drag/signature-gated/blocked posture with modeled landing probability.",
      "Autonomous run envelope fuses the session supervisor, tick governor, burst scheduler, reaction loop, landing optimizer, profit velocity, provider budgets, wallet telemetry, and daemon memory into one local browser-loop posture with next wake, run confidence, fill caps, provider budget, stop reason, and evidence rows.",
      "Autonomous profit run guard fuses wallet PnL, forecast fit, profit velocity, objective progress, outcome memory, churn efficiency, lane quality, run confidence, and daemon loss streaks into one keep-running, tighten, protect, refresh, cooldown, or stand-down permission with max next fills and cadence.",
      "Autonomous daily profit lock adds a session-level profit target and loss brake over the paper loop, switching the agent between open, harvest-only, protect-only, paused, and stand-down modes before burst fills can spend.",
      "Auto Watch now consumes the daily profit lock and profit-integrity circuit before normal high-frequency cadence, so harvest/protect/pause/stand-down states can own the next backend tick instead of only appearing as dashboard labels.",
      "Auto Watch now also consumes wallet-performance and fill-ledger discipline before normal cadence, so wallet-curve drawdown, protective-sell-only posture, and bad last-fill audits can trigger protect, cooldown, or tighten ticks before fresh paper buys.",
      "Auto Watch now keeps safety-loop plans alive through blocked fresh-entry throttle states, so protect, review, cooldown, and stand-down ticks continue monitoring instead of silently pausing the local watcher.",
      "Autonomous replay gate now blocks, sizes down, protects, refreshes, or approves the next fresh paper buy from deterministic base, breakout, and rug-risk replay proof before child fills can spend.",
      "Autonomous burst fill plan converts the profit-run guard and final order ticket into explicit child paper fills with total notional, per-child notional, slippage budget, route-quote requirement, cadence, and blockers before any local ledger mutation.",
      "Autonomous burst outcome feedback scores those rapid paper fills against wallet trend, fill quality, churn efficiency, route confidence, and the daily lock, then returns a next-cycle scale/keep/tighten/protect/block verdict with multiplier and child-fill ceiling.",
      "The burst planner now consumes prior burst feedback on the next state rebuild, applying that multiplier and child-fill ceiling before another paper notional can be split into rapid child fills.",
      "Autonomous burst fill execution can now apply ready burst child fills into the durable local paper ledger, including weighted-average scale-ins when multiple child buys target the same held coin.",
      "Autonomous profit accountability now condenses wallet PnL, scorecard quality, recent fills, burst feedback, directive quality, and last bounded session outcome into one press/compound/tighten/protect/block paper verdict for the Web3 cockpit.",
      "Autonomous minute profit discipline now decides whether the next high-frequency paper minute may scale, keep running, tighten, protect, refresh, or stand down from expected profit, execution readiness, churn net edge, fill quality, wallet accountability, and loop impact.",
      "Autonomous execution-quality arbiter fuses the selected profit route with route profit, landing path, execution cost, MEV risk, pre-submit rehearsal, and modeled fill quality before allowing a fresh paper buy to pass the final gate.",
      "Autonomous token safety clearance fuses token vetting, rug firewall, holder-flow, symbol quarantine, market pulse, route score, and landing score into cleared/probe-only/blocked/exit-only permissions with a final max-buy cap for fresh paper entries.",
      "Autonomous reflex operator collapses route, tick, safety, execution, wallet heat, market pulse, and feed-refresh pressure into one immediate paper next-action queue with press/protect/refresh/observe/stand-down status, notional cap, edge, review timing, and blockers.",
      "Autonomous cash deployment director converts the reflex queue into deploy/scout/hold/protect/blocked paper-wallet posture with deploy-now amount, reserve, target exposure, confidence, safety, execution, wallet, and cash checks.",
      "Autonomous profit navigator fuses wallet net-worth trajectory, cash deployment, route edge, execution quality, token safety, portfolio protection, drawdown risk, deploy/release sizing, and cadence into one attack/scout/compound/harvest/protect/stand-down/blocked paper posture for the Web3 cockpit.",
      "Autonomous profit forecast projects the next local paper-trading window from navigator posture, wallet curve, route edge, risk drag, break-even timing, worst-case drawdown, and invalidation rules, then renders the projected equity curve in the Web3 cockpit.",
      "Autonomous forecast feedback compares the forecast against recent paper-daemon wallet movement, direction correctness, forecast error, and remembered fills/blocks, then emits press/keep/probe/tighten/protect/blocked size and cadence guidance for the next paper cycle.",
      "The default Web3 command view now includes a wallet runway chart that condenses net-worth slope, window PnL, drawdown, fill efficiency, exposure, and the next wallet action without requiring the deep diagnostics view.",
      "Autonomous alpha conviction ranks memecoin candidates from signal/noise, trend velocity, market pulse, route readiness, token safety, wallet heat, and forecast feedback into one buy/probe/hold/trim/avoid/protect cockpit strip.",
      "Autonomous execution escalator maps the current alpha leader through paper fill, order build, external signature request, signed-payload relay, and confirmation polling readiness in one cockpit strip.",
      "Autonomous size governor consolidates alpha conviction, execution escalation, forecast fit, wallet telemetry, profit control, command performance, profit learning, daemon memory, and outcome discipline into one press/scale/probe/halve/protect/pause next-size decision with wallet net-worth curve, edge buffer, max modeled loss, paper-fill readiness, and signed-submit boundary.",
      "Outcome discipline now turns recent paper PnL, command contribution, daemon-memory loss streaks, win-rate/profit-factor estimates, and wallet drawdown into a next-size multiplier so the agent presses winners, tightens weak churn, or protects after bad outcomes before another paper fill.",
      "Autonomous pressure tape condenses the next-minute desk state across size, market pulse, high-frequency race, tick plan, position surveillance, price action, wallet telemetry, and profit control into press/scalp/protect/refresh/pause posture with buy pressure, sell pressure, refresh pressure, action capacity, max notional, and expected profit-per-minute.",
      "Pressure-tape paper execution turns that next-minute posture into at most one bounded local paper-ledger buy or sell per cycle, with queued/applied/blocked status, paper size, cash delta, exposure delta, review cadence, and the same signer-free paper boundary as the rest of the simulator.",
      "Autonomous action queue ranks the command center, pressure tape, high-frequency race, opportunity race, portfolio protection, portfolio tape, market pulse, trend chase, and watchlist rotation into one next-action tape with leader action, deploy/release totals, expected $/min, readiness counts, and paper-only boundaries.",
      "Action-queue paper execution maps the top ranked queue lane back to its existing paper executor and can apply one queue-owned local paper fill per ledger cycle before older lane-specific fallbacks, while reusing all normal readiness, capital, regime, wallet, profit-route, execution-quality, and token-safety gates.",
      "Action-queue execution consumes route-refresh execution as a freshness veto, so fresh buy, scalp, or refresh lanes cannot become ready paper fills while the selected route is blocked or missing required read-only quote evidence.",
      "Action-queue execution and paper-ledger fallbacks now consume alpha-decay timing as a freshness veto, so stale, late, or over-cap fresh buys are blocked before they can mutate the local paper wallet.",
      "Action-queue execution now consumes protective trigger coverage as a fresh-buy gate, so uncovered or repair-needed trigger protection blocks queue, bundle, batch, and fallback paper buys while preserving sell, harvest, and protect lanes.",
      "Protective trigger coverage now treats synced active provider-side Trigger orders as real coverage only when they match the planned input/output/trigger mints, avoid terminal fill/cancel/expire events, and still have remaining order size; stale active-looking orders keep the fresh-buy gate in protect-first mode.",
      "Autonomous session planner turns scanner readiness, action queue, route freshness, profit control, tick throughput, portfolio protection, wallet telemetry, and the risk governor into one next paper-session plan with planned ticks, fill caps, fresh-buy/protective-sell limits, deploy/release budgets, route-refresh need, expected edge, and next action.",
      "Autonomous execution heartbeat fuses wallet PnL, action-queue readiness, route freshness, high-frequency velocity, churn permission, and risk gates into one next-loop press/protect/refresh/pause decision for the Web3 cockpit.",
      "Autonomous profit validator checks the next paper-loop action against forecast accuracy, realized wallet movement, expected value, cost drag, route proof, sizing discipline, and drawdown before allowing scale/trade/probe/protect/refresh/stand-down permissions.",
      "Autonomous trap radar separates Moonshot-style momentum from exit-liquidity traps by fusing paid hype, liquidity stress, holder risk, sell pressure, route gap, wallet heat, alpha quality, tradeability, and token-safety evidence before fresh paper buys.",
      "Autonomous opportunity-cost auditor compares current high-signal candidates against held positions and recent local paper buys, estimates missed paper edge, separates recoverable misses from justified safety blocks, and feeds edge verification plus profit-learning size/cadence guidance.",
      "Autonomous order ticket condenses the final next paper action into one explicit buy/sell/hold/route-refresh/protect ticket with symbol, lane, side, paper notional, stop, take-profit target, confidence, market regime, execution friction, alpha timing decay, candle conviction, route requirement, blockers, and live-execution boundary.",
      "Autonomous order-ticket execution receipt turns that final ticket into a visible local paper-ledger handoff with queued/applied/route-refresh/protect-only/blocked status, projected cash/exposure deltas, duplicate-avoidance controls, and explicit no-live-signing boundaries.",
      "Autonomous order tickets now consume regime tape directly, so breakout/scalp regimes can allow bounded paper size while rotation shrinks exposure and distribution, rug-risk, or dead-chop regimes block fresh paper buys without blocking protective sells.",
      "Autonomous order tickets now consume execution-friction evidence from route quote sampling, liquidity depth, impact, slippage, and local MEV risk before fresh paper buys can size or route-refresh.",
      "Autonomous order tickets now consume alpha-decay timing evidence, so stale, late, or missing high-velocity windows can refresh, shrink, or block fresh paper buys while protective sells stay available.",
      "Autonomous order tickets now mirror the autonomous size governor status, final cap, outcome-memory multiplier, and fresh-buy pause flag, and fresh-buy paper notionals cannot exceed the governor cap while protective sells remain available.",
      "Autonomous candle conviction gates fresh paper buys with chart momentum, volume, structure, read-only OHLCV refresh need, and risk pressure while still allowing protective sell paths to continue.",
      "Autonomous market evidence fusion now condenses Moonshot-style hot-coin tape, organic momentum, paid/promo noise, OHLCV candle proof, Jupiter-style route proof, provider freshness, and wallet fit into one trade/probe/refresh/protect/reject/watch cockpit verdict before fused paper fills can spend.",
      "Autonomous price-action chart tape renders top memecoin candidates as compact seven-point chart strips with DEX price action, buy-flow, volume, liquidity, route proof, candle proof, promotion noise, and paper-only next actions visible in the Web3 cockpit.",
      "Autonomous price-action execution contract now turns the chart tape into an auditable paper-buy/probe/refresh/protect/fade/watch contract with chart, proof, wallet, profit-lock, run-guard, and execution-boundary checks before any chart-led paper action appears in Next moves.",
      "Autonomous signal/noise trade decision now turns the hot-coin chart into a paper-only buy/probe/protect/refresh/stand-down receipt with size, fill cap, blockers, evidence, and live-signing boundary.",
      "Autonomous execution runway condenses scan, decision, route, paper, and wallet checks into one first-screen immediate-action timeline with latency target, paper size, fill cap, blockers, and read-only/live-signing boundary.",
      "Autonomous scalp-exit autopilot combines profit-capture race, profit lock, position commander, position surveillance, tape guard, and profit validator evidence into one eject/trim/harvest/trail/press/hold/refresh/stand-down decision for held paper coins, then can queue or record one bounded local paper sell per ledger cycle.",
      "Autonomous protection coordinator dedupes action-queue, pressure-tape, position-risk, portfolio-tape, scalp-exit, and surveillance sell/protect signals into one cockpit defense lane with sell-first release, raw lane pressure, per-symbol deduped exposure, ready/applied/blocked totals, overlap counts, and next review timing.",
      "Protective trigger coverage fuses open positions, Jupiter Trigger plans, Trigger history, reconciliation issues, and scalp-exit pressure into one coverage percentage, exposed notional, repair/auth/ready counts, and protect-first pause signal before the agent chases fresh buys.",
      "Auto autonomous sessions now follow the current session planner envelope, recording planner status, kind, target, route-refresh requirement, deploy/release caps, requested ticks, and fill cap in the paper-session run report before learning modules react.",
      "Live scanner readiness fuses DEX discovery/source coverage, paid-hype audit, feed integrity, provider budget, signal/noise, trend velocity, launch-sniper score, and route confidence into an attack/probe/refresh/watch/block intake verdict in the Web3 cockpit.",
      "Live discovery delta tape condenses DEX Screener latest profiles, boosts, top boosts, community takeovers, latest ads, paid-order checks, and pair mapping into urgency, expected paper edge, refresh, and block evidence for the Web3 cockpit.",
      "Autonomous alpha quality now fuses DEX Screener-style profile/boost/ad/paid-order evidence, pair liquidity, buy/sell pressure, route confidence, wallet fit, and hype/risk noise into paper-attack, paper-probe, refresh-first, watch, protect, or blocked verdicts.",
      "Autonomous tradeability simulator now haircuts alpha-quality candidates by route confidence, liquidity depth, route cost, modeled slippage, local fill quality, and churn pressure before exposing paper-fill, paper-probe, resize, requote, protect, blocked, or watch verdicts.",
      "Autonomous profit objective turns the make-money mandate into a visible paper PnL target, session target, required edge, stop budget, harvest line, press budget, and press/compound/harvest/protect/cooldown posture.",
      "Autonomous profit control fuses the profit objective, capital allocator, wallet telemetry, policy optimizer, command performance, and churn auditor into one press/compound/harvest/redeploy/protect/cooldown verdict with deploy, release, reserve, edge, cadence, max-trade, and confidence guidance.",
      "The autonomous policy optimizer now exposes a desk-mode selector for snipe, scalp, compound, harvest, protect, or stand-down behavior, with confidence, fresh-entry permission, allowed actions, and mode controls.",
      "Autonomous command center collapses the fast race, opportunity race, portfolio protection, trade arbiter, route refresh, and profit objective into one ranked paper command board with deterministic projected PnL, equity, drawdown, and pass/watch/fail rehearsal scores.",
      "Command-center paper execution turns the top pass-rated command-board buy/sell/protect/harvest decision into at most one bounded local paper-ledger fill per cycle, ahead of legacy position-risk, batch, arbiter, high-frequency, and opportunity fallbacks.",
      "Command performance auditor scores command-owned paper fills for estimated contribution, expectancy, modeled friction, quick round trips, next-size multiplier, and cadence before the command board keeps trading.",
      "Autonomous fill ledger digest summarizes the latest local paper fills, buy/sell pace, paper volume, net PnL, best and weak attribution lanes, and the next press/protect/tighten/evidence discipline directly in the Web3 cockpit.",
      "Autonomous outcome memory governor fuses setup memory, strategy attribution, recent fill ledger, wallet telemetry, churn efficiency, and paper performance into a next-cycle bias for pressing winners, compounding, probing, exit-first protection, cooldown, evidence collection, or waiting.",
      "The autonomous size governor now consumes that outcome-memory bias as an applied next-size multiplier and fresh-buy pause, so remembered paper outcomes can press, probe, downshift, or block the next local simulator buy without bypassing protection gates.",
      "Autonomous profit learning fuses paper scorecard, command performance, lane attribution, churn efficiency, market-pulse execution, and session feedback into next-size, cadence, deploy-bias, and release-bias guidance.",
      "Autonomous market intelligence fuses DEX discovery, signal/noise, catalyst quality, chart momentum, route confidence, provider health, and churn pressure into one ranked chase/probe/watch/protect/stand-down market read.",
      "Market-intelligence paper execution can turn the top fused chase/probe row into one bounded local paper buy with projected PnL, risk, confidence, cash delta, exposure delta, and ledger-applied status.",
      "Autonomous watchlist rotation ranks hot coins into paper-trade, route-quote, candle-refresh, pair-backfill, portfolio-protect, or watch lanes so the loop knows what to refresh or act on next.",
      "Watchlist-rotation paper execution can turn the top trade/protect rotation lane into one bounded local paper buy or sell with projected PnL, risk, score, cash delta, exposure delta, and ledger-applied status.",
      "High-frequency profit race ranks short-window paper buys, route-backed scalps, trims, harvests, and exits by expected paper profit per minute after route and churn cost.",
      "High-frequency action planning condenses that race into one fast-entry/scalp/profit-protect/route-repair/cooldown plan with cadence, data lane, route-refresh need, max local paper notional, and reason.",
      "High-frequency paper execution turns the top cleared fast-race action into one bounded local paper-ledger fill per cycle after sell-first protection and batch gates, before broader opportunity and trend-chase lanes.",
      "High-frequency paper route fallback can rehearse protective local paper sells from current marks when live route, kill-switch, signer, or preflight blockers would stop a real swap.",
      "Autonomous execution cadence governor ranks DEX discovery, pair refresh, route quote, wallet-protect, and signal-watch lanes with per-minute source budgets, next-poll timing, stale-ticket detection, and paper-daemon/run-vs-refresh guidance.",
      "Autonomous data freshness gate now condenses DEX Screener stream/REST discovery, paid-order context, GeckoTerminal-style OHLCV/candle proof, Jupiter-style read-only route quotes, and provider budget headroom into one allow/size-down/refresh/backfill/block verdict before burst child fills can spend.",
      "The Web3 trading cockpit promotes the paper wallet net-worth curve, consolidated profit stack, signal/race/edge/gate pulse, autonomous flow map, profit attribution board, and mission runway in Autopilot, while the Routes, Signals, Wallet, and Safety tabs use focused compact workspaces to avoid repeated executor-style scrolling.",
      "The Web3 trading cockpit now removes the repeated Copilot command/governor/fill stack from the first load: mobile starts with the primary paper action and wallet net-worth chart, desktop shows the wallet curve above secondary HFT/accountability charts, and the deeper executor-style receipts stay behind the focus tabs and advanced workbench.",
      "Navigation now separates Web3 Autopilot from the safety-preview executor so the autonomous trading desk is distinct from the non-signing execution drill surface.",
      "The Web3 trading first screen now shows next autonomous move, wallet net-worth curve, paper PnL, route/wiring status, live-signing lock state, and current blockers before the deeper diagnostic panels.",
      "The Web3 trading first screen also condenses signal, route proof, size, execution, and wallet feedback into one autonomous decision chain so route vetoes and paper/live boundaries are visible without opening the old executor-style diagnostics.",
      "The Web3 trading first screen now adds an autonomous desk matrix that keeps wallet runway, DEX stream freshness, scanner edge, and execution gate status together so the operator can see why the agent is pressing, watching, or blocked without scrolling into redundant diagnostics.",
      "The Web3 trading first screen now starts with a live alpha strip that combines a wallet net-worth sparkline, the top ranked memecoin candidates, route gate status, and max local paper size before the longer diagnostics.",
      "The Web3 trading first screen now includes a wallet net-worth curve that overlays local paper equity, next-window forecast, and recent paper buy/sell markers so trading progress is chart-visible before the longer diagnostics.",
      "The Web3 trading first screen now includes an active price-action cockpit for the current target, showing momentum path, buy pressure, risk, stop/target levels, candle proof, route proof, and paper-only sizing evidence before the long workbench.",
      "The Web3 trading first screen now includes an HFT reaction chart that exposes next-few-seconds buy pressure, sell pressure, route pressure, wallet pressure, landing probability, run-envelope wake timing, invalidation timing, and paper/live boundary status before deeper diagnostics.",
      "The Web3 trading first screen now includes an autonomous session ticket that shows the next bounded paper-run plan, including planned ticks, fill caps, fresh-buy and protective-sell limits, deploy/release budgets, wake action, order-ticket boundary, route/timing readiness, and paper/live gate status.",
      "The Web3 trading first screen now includes a profit-accountability chart that shows whether the autonomous paper loop is actually making money, including paper PnL, win rate, fills versus blocks, feedback size multiplier, outcome memory bias, session result, and paper/live boundary status.",
      "The Web3 trading state and first-screen profit chart now include a local paper accountability repair plan that names the weakest evidence row, score gap, route-refresh need, bounded session tick/fill caps, and blocked live-wallet permissions.",
      "The Web3 profit-proof plan now exposes a paper-only local accountability repair command that consumes the backend-authored repair plan, posts only read-only route refreshes or bounded paper sessions, and keeps live execution plus wallet mutation blocked.",
      "The Web3 launch runway now switches its profit-proof command from promoted-paper autopilot to local accountability repair once promoted proof is sufficient but the paper wallet accountability score is still too weak.",
      "The Web3 launch checklist now treats accepted sample route rehearsal as paper-review route evidence instead of a hard route-proof failure, while still requiring read-only quote and dry-run order proof before any live-capital review.",
      "The Web3 trading first screen now includes a profit benchmark strip that compares the local paper wallet against idle cash, the selected coin, and the visible hot-coin tape, then feeds alpha feedback and profit-thesis status into Next moves without implying live profitability.",
      "The Web3 trading state and first-screen profit chart now include a profit-integrity circuit that fuses validator expected value, forecast accuracy, execution quality, token safety, paper accountability, and loop feedback into one scale/trade/probe/protect/cooldown/stand-down permission that feeds the autonomous loop throttle while remaining local-paper only.",
      "The Web3 trading first screen now includes an execution-quality gate that shows whether the selected memecoin setup still clears route cost, landing path, fill quality, MEV/slippage, token safety, and paper/live boundary checks before another autonomous paper action can run.",
      "The Web3 trading first screen now includes a compact high-frequency profit loop card that charts profit velocity, next-minute fill capacity, throttle health, run guard, queue readiness, paper budget, and daily lock state before the longer executor diagnostics.",
      "The Web3 trading first screen now replaces the redundant executor-style readiness block with an autonomous proof queue that charts source intake, data freshness, candle proof, route proof, wallet health, and live-gate readiness before any paper tick can press.",
      "Sample-mode route repair now exposes and consumes a paper-only route rehearsal receipt for local accountability repair, then names the remaining preflight/profit-lock blocker while real Jupiter quote requests, signer paths, and wallet mutation remain separately blocked.",
      "The Web3 trading first screen now identifies the autonomous decision owner across directive, action queue, pressure tape, order ticket, scalp exit, and proof gates so reviewers can see which layer owns the next paper/protect move and where live execution remains credential-gated.",
      "The Web3 trading first screen now replaces the static held-position list with a position reaction tape that charts held-coin action pressure, paper PnL, release pressure, at-risk capital, scalp-exit posture, and fresh-buy gating before the Portfolio tab.",
      "The Web3 Copilot tab now opens with a chart-first command deck: wallet equity curve, active price-action cockpit, top memecoin alpha strip, profit attribution, and a wiring rail that separates the Web3 paper loop from the standalone executor safety preview.",
      "The Web3 trading first screen now uses a unified Copilot/Market/Portfolio/Wiring focus deck: quick paper controls appear before the chart deck, Copilot shows command forecast plus wallet net-worth and signal/noise charts, Portfolio holds the detailed position/profit views, and live swap execution remains locked behind credential gates.",
      "The Web3 trading first screen now shows an autonomous authority path from browser scheduler to source refresh, backend loop tick, local paper ledger, and live-boundary lock so reviewers can see exactly which layer owns each trade/protect decision.",
      "The Web3 trading first screen now shows recent autonomous loop memory from the latest bounded session ticks or durable daemon-memory window, including action, paper PnL, fills, blockers, status, and recommendation before the long diagnostics.",
      "The first-screen wallet net-worth curve now renders from actual local wallet telemetry points, including cash, exposure, drawdown, fill/block counts, loop action markers, and a slope-based paper forecast instead of a decorative placeholder path.",
      "The Web3 trading page now opens with quick autonomous paper controls for refreshing the market read, switching the read-only live/sample feed, running a bounded local paper session when gates allow it, and resetting the local paper account before the longer cockpit.",
      "The quick Web3 controls now run a bounded autonomous paper cycle even when fresh buys are blocked, then show wallet equity, window PnL, exposure, completed ticks, session PnL, and the agent's next action before the longer cockpit.",
      "The quick Web3 controls now include a Run minute action that builds a bounded next-minute paper session from the profit-velocity governor, tick plan, action queue, tick governor, loop throttle, and planner caps while keeping live execution locked; single-fill and protect-only lanes preserve the governor's max-trades-per-minute cap instead of inflating fills, and ready queue-owned sells count as protect-minute actions.",
      "Auto watch now keeps stale live DEX reads in a read-only auto-refresh mode when the tick governor or data-freshness gate asks for market evidence, so blocked trade throttles do not stop evidence refresh before the next paper decision.",
      "The quick Web3 controls now include a first-screen next-moves timeline built from the data-freshness gate, command execution, action queue, runway, re-entry hunter, launch timing, trigger opportunity, loop throttle, and wallet feedback, so read-only refreshes, missed-runner reviews, fresh-entry timing, protective paper sells, and blocked live-submit gates are visible before expert diagnostics.",
      "The Web3 trading state now includes an autonomous trigger-opportunity governor that ranks protective Jupiter Trigger handoffs from trigger coverage, planner readiness, alpha decay, position pressure, and unsigned deposit readiness; it can pause fresh paper buys or pre-arm a handoff, but still cannot sign, fund, submit, or custody funds.",
      "The Web3 trading state now includes an autonomous launch-timing governor that converts launch sniper, graduation, discovery freshness, crowding, paid hype, liquidity, velocity, and trap risk into snipe/probe/confirm/late-chase/fade/stand-down entry timing; it can recommend local paper entries or suppress bad chases, but cannot guarantee profit, sign swaps, or custody funds.",
      "Autonomous action queue ranking now consumes launch timing directly: clean snipe/probe timing can boost matching paper buy lanes, while crowded, hype-heavy, trapped, late, or blocked launch timing suppresses fresh paper buys before queue execution can spend.",
      "Autonomous trade readiness now includes launch timing as a final batch/fill gate, so batch, burst, queue, and direct paper executors cannot apply fresh buys when launch timing is fade/blocked/stand-down, while protective sells can remain available.",
      "The quick Web3 controls now include a first-screen autonomous sprint tape and holding sentry, showing fused hot candidates, max paper size, portfolio pressure, unrealized PnL, and release pressure before the longer cockpit.",
      "The quick Web3 controls now include an Auto watch toggle that keeps running bounded local paper cycles while the browser page is open, then pauses at the local 24-cycle review cap; it still cannot sign, submit, or continue after the app/browser stops.",
      "Auto watch now chooses auto minute, auto cycle, or auto sprint from the profit-velocity governor, tick plan, tick governor, run envelope, profit-run guard, market-fusion trade permission, policy status, cadence, and fill caps before scheduling the next local paper request.",
      "Auto watch now refreshes the selected market source once before its next local paper action, so sample and read-only live DEX monitoring both re-score the current tape before the browser-local loop acts.",
      "Auto watch now uses the backend autonomous loop tick as the authority for trade/protect actions after any source refresh, so the browser scheduler no longer rebuilds its own minute-session sizing path.",
      "Auto watch now consumes the profit benchmark and alpha-feedback loop before scheduling a backend tick, tightening cadence when the paper wallet lags cash/risk-adjusted alpha and refreshing read-only evidence when missed hot-tape alpha needs retarget review.",
      "Auto watch now consumes the market-intake plan before fresh paper ticks, refreshing route/provider evidence first or deferring fresh size when live provider budgets are throttled while preserving protective paper sell lanes.",
      "The quick Web3 controls now include an Auto watch accountability scoreboard from the latest local paper session, showing session PnL, fills versus blocks, exposure delta, protective sells, and cash delta before the longer diagnostics.",
      "The Web3 trading engine now publishes an autonomous loop throttle that fuses the session planner, run envelope, profit guard, daily lock, profit accountability, and last paper session into one sprint/cycle/protect/refresh/cooldown/blocked decision with tick, fill, cadence, size, deploy, and release caps for Auto watch.",
      "Autonomous loop feedback now grades recent tick PnL, wallet slope, fill efficiency, selected tactic edge, and session receipts, then feeds paper-only size, cadence, fill-cap, protect-first, and fresh-buy pause guidance back into the backend loop throttle.",
      "The Web3 trading API now accepts an autonomous loop tick request, letting the backend choose refresh, bounded paper session, protect-first session, cooldown, or stand-down from the current throttle instead of relying on browser-side session construction.",
      "Each backend autonomous loop tick now returns a loop-tick receipt that records whether the tick refreshed evidence, ran a bounded paper session, or stood down, plus cycle movement, paper PnL, fill/block counts, summary, and next action.",
      "Backend autonomous loop ticks now honor the server wake plan's protect-minute lane, so queued protective local paper sells can run even when the stricter fresh-buy throttle is blocked; live swap execution remains credential-gated and unsigned.",
      "Backend autonomous loop ticks now treat run-minute wake plans as the authoritative paper-session envelope, using wake-plan/velocity caps for ticks, fills, release budget, and protect-book posture before falling back to generic loop-throttle sessions.",
      "Backend autonomous loop tick receipts are now saved into the durable local paper ledger and reloaded into the Web3 cockpit, so the app remembers the backend's last refresh/session/protect/stand-down decision after the page refreshes.",
      "Read-only OHLCV candle refreshes from the Web3 chart reader can now be recorded into the durable local paper ledger, reloaded into the compact cockpit as candle-memory receipts, and consumed by the autonomous candle-conviction gate to clear refresh-first states, confirm bounded paper probes, or force protect/reject; they still cannot sign, submit, custody funds, or guarantee profit.",
      "The Web3 trading page now keeps the old deep diagnostic workspace collapsed behind a focused opener so the primary autonomous cockpit, order ticket, proof stack, and charts load first without repeating the executor-style long scroll.",
      "The compact Web3 cockpit now renders a Moonshot-style signal/noise chart from fused market evidence, plotting organic momentum, route proof, chart proof, wallet fit, and promotion noise for the top paper-trading candidates.",
      "The compact Web3 cockpit now surfaces the autonomous profit objective before the long diagnostics, with target progress, deploy budget, release pressure, locked profit, stop-loss room, cadence, confidence, and paper-only wallet impact.",
      "The compact Web3 cockpit now adds an autonomous command spine that fuses the command center, trade mission, profit forecast, capital allocator, batch rehearsal, and readiness gate into one above-the-fold buy/sell/protect/refresh/stand-down decision frame.",
      "The compact Web3 cockpit now adds an autopilot mission-control panel that condenses the selected paper command, market-to-wallet wiring path, profit runway, capital deploy/release path, one-minute loop capacity, and paper/live boundary before the deeper workbench.",
      "The compact Web3 cockpit now promotes a make-money governor that combines profit target progress, profit-control posture, active size-governor final paper size, and outcome-memory status before the longer diagnostics.",
      "The compact Web3 cockpit now adds a loop-permission matrix that shows the server wake plan, throttle, data freshness, profit guard, daily lock, replay learning, fresh-buy caps, protect-sell caps, size multiplier, and burst result before any long-form diagnostics.",
      "The pressure tape now consumes situation-change memory, acceleration, deterioration, urgent tape events, active regime, flow, risk, and liquidity stress, then publishes a tape-change score and reaction window in the compact loop matrix before next-minute paper actions run.",
      "The first-screen wallet net-worth strip now also shows held-position defense, releasable paper notional, protective trigger coverage, exposed trigger notional, and protection-coordinator status so harvest/protect work is visible before new-entry controls.",
      "The Web3 API and first-screen wallet strip now publish one autonomous make-money pulse that fuses wallet PnL, market evidence, profit lanes, held-position protection, trigger coverage, loop permission, and proof quality into attack/probe/harvest/protect/refresh/cooldown/blocked/observe guidance while remaining local-paper only.",
      "The Web3 API and first-screen wallet strip now publish an autonomous profit benchmark that compares the local paper wallet against idle cash, the selected coin, and the hottest visible one-hour coin tape, then shows agent alpha and risk-adjusted alpha as learning evidence rather than a real-money profit guarantee.",
      "The Web3 API and first-screen wallet strip now publish an autonomous alpha feedback loop that converts benchmark gaps, missed visible hot-coin alpha, drawdown penalty, protection status, and make-money pulse state into local paper press/retarget/tighten/protect/learn guidance with bounded size bias.",
      "The Web3 API and first-screen wallet strip now publish an autonomous profit thesis verifier that fuses pulse, benchmark, alpha-feedback, lane score, wallet drawdown, opportunity gap, and protection status into one local-paper press/probe/retarget/tighten/protect/block/learn verdict with bounded sizing.",
      "The profit thesis now publishes chase pressure, including urgency, paper budget, and size multiplier, so missed visible hot-coin alpha can influence the opportunity ranker without bypassing protection, source-quality, route, or custody gates.",
      "The Web3 API and first-screen command deck now publish an autonomous capital command that compresses tick plan, capital allocation, daily lock, profit integrity, source quality, wallet, and paper bundle rehearsal into one bounded next-dollar deploy/harvest/protect/refresh/stand-down receipt.",
      "The fill-learning ledger now publishes a last-fill profit audit that scores the most recent local paper fill by contribution, modeled fill quality, shortfall, churn, and scorecard evidence before granting press, selective, protect-only, cooldown, or wait permission.",
      "The Web3 API and first-screen cockpit now publish a forward-loop permission receipt that combines last-fill audit, profit integrity, accountability, throttle, wake plan, and now-decision evidence before the next local paper tick can press, probe, harvest, protect, refresh, cool down, or stand down.",
      "The Web3 API and first-screen cockpit now publish a loop-impact auditor that grades the latest backend paper loop by equity delta, exposure delta, fills versus blockers, route/chart proof freshness, forward permission, and local-paper boundary before allowing continued frequency.",
      "Auto watch now consumes the loop-impact auditor before scheduling the next local paper tick, so refresh, protect, harvest, tighten, cooldown, and blocked impact states can slow or redirect the loop instead of blindly following velocity.",
      "The Web3 command deck now shows a compact next-tick flow rail across proof, impact, queued action, paper ledger, and live boundary so the autonomous loop path is visible before the deeper executor-style controls.",
      "The Web3 API and compact command deck now include a profit-capture autopilot that fuses profit-capture race, held-position marks, route proof, action queue readiness, wallet telemetry, and loop impact into one exit, trim, harvest, trail, press, refresh, or stand-down decision.",
      "The Web3 API and compact command deck now include a profit-redeploy autopilot that connects released paper profit to the next chase/probe decision, forcing protect-first, read-only proof refresh, cooldown, or block states before bounded local-paper redeploy can run.",
      "The Web3 API and compact cockpit now include a profit-redeploy execution receipt that maps the redeploy autopilot to the ranked-opportunity, re-entry, or protect-first paper candidate, caps it to released-paper budget or held-position value, records queued/applied/blocked status, owns the local paper fill id/lane when queued or applied, lets protect-only daemon ticks apply that paper sell before generic protection lanes, and keeps live swaps, signing, custody, and profit guarantees out of scope.",
      "The compact Web3 cockpit now includes a first-screen profit feedback monitor that charts paper contribution by feedback lane, forward-replay agreement, recent paper PnL, expectancy, best/worst strategy lanes, outcome-memory bias, and daemon-memory window before the deeper fill-learning ledger.",
      "The compact Web3 cockpit now opens with a money-loop band that pairs held-position pressure with ranked memecoin entries, then follows with wallet net worth and profit feedback before the deeper Portfolio sentry.",
      "The compact Web3 cockpit now promotes an autonomous opportunity ranker that compares visible memecoin candidates across scanner readiness, alpha quality, trap clearance, tradeability, thesis fit, noise, modeled edge, and bounded local-paper sizing before choosing attack, probe, refresh, protect, block, or watch.",
      "The Web3 state now publishes ranked-opportunity paper execution, turning only the top attack/probe rank into one guarded local paper-ledger buy candidate after trigger, readiness, quarantine, lane-capital, regime, wallet, route, execution-quality, token-safety, and timing gates clear.",
      "The compact opportunity ranker now folds in a source-trust timing strip, so DEX stream freshness, live scanner readiness, data-proof refresh lane, and feed integrity explain whether the agent may chase now or must refresh evidence first.",
      "The compact Web3 cockpit now includes an autonomous rotation director that fuses ranked hot candidates, release sources, capital rotation, profit thesis, portfolio marks, and profit-integrity evidence into one rotate/retarget/protect/harvest/hold/blocked local-paper directive.",
      "The compact Web3 cockpit now includes a first-screen autonomous fill tape that shows recent local paper fills, side, lane, size, estimated contribution, wallet impact, loop feedback, and the paper-only boundary before the deeper Portfolio learning chart.",
      "The compact Web3 cockpit now adds a paper execution priority tape under the wallet curve, classifying durable local fills as redeploy protection, portfolio release, or fresh-entry risk before the paper wallet curve is judged.",
      "The primary Web3 Run tick control now behaves as a smart Proof plus tick path when the candle gate needs evidence: it builds read-only chart proof, sends that receipt with the backend autonomous loop tick, then lets the server choose refresh, bounded paper fill, protect, cooldown, or stand down while live signing stays locked.",
      "Auto watch now uses that same smart Proof plus tick path for candle-gate refresh wakes, so the browser-local scheduler can hand fresh chart evidence to the backend loop immediately instead of waiting for a separate later tick; it still stops when the page/app stops and stays local paper-only.",
      "Autonomous candle conviction now publishes a target-lock receipt: saved chart proof clears the candle gate only when its symbol matches the active autonomous target, while mismatched proof is retained as evidence but keeps the active coin in refresh-first mode.",
      "The Web3 state now publishes a server-authored chart-proof target with symbol, token id, chain/network, pair, provider, timeframe, candle limit, fetch permission, and target-lock status, and the smart tick uses that target before falling back to older client-side heuristics.",
      "The compact Web3 cockpit now includes a server-authored Now decision receipt that condenses the execution runway, market evidence, chart proof target, route/ticket state, wallet telemetry, loop wake plan, paper size, expected edge, and blocker stack into one current press/probe/protect/refresh/run/stand-down verdict.",
      "The Now decision card now owns the primary recommended Web3 action, mapping the server verdict to either a read-only route refresh, smart chart-proof plus backend tick, bounded next-minute paper run, or stand-down notice while live signing remains locked.",
      "The Now decision card now distinguishes a true read-only route quote refresh from route-read repair when sample mode, missing quote requests, or route blockers prevent quote refresh; sample-mode repair upgrades to a read-only Live DEX evidence refresh, and the primary action plus receipt explain the blocker before the paper loop advances.",
      "The compact Web3 cockpit now promotes a visible autonomous wiring map before the Now action, showing the signal, chart, route, paper executor, wallet, and live-gate path plus the scheduler-to-backend authority path without opening expert diagnostics.",
      "The compact Web3 cockpit now includes an agent action outcome strip that records the last recommended action's before/after decision path, wallet delta, exposure delta, fill/block delta, route/chart proof state, and next action from the returned trading state.",
      "The compact Web3 cockpit now promotes an autonomous profit authority lane that ranks make-money lanes into press, probe, protect, cooldown, blocked, or observe authority with expected paper edge, per-minute edge, lane readiness, wallet permission, max cap, and paper-only review receipt.",
      "The Web3 Portfolio focus now includes a fill-learning ledger that charts recent local paper fills against strategy-lane attribution, estimated contribution, recommended discipline, outcome-memory bias, and the paper-only boundary.",
      "The Web3 Market focus now includes a trap-clearance board that compares chase clearance against paid-hype, liquidity stress, holder risk, sell pressure, route gaps, token safety, fillability, wallet heat, and paper max-chase sizing before fresh exposure.",
      "The compact Web3 cockpit now has a Chart proof action that records read-only GeckoTerminal OHLCV evidence when a live pair is available, or sample price-action tape evidence otherwise, into the autonomous candle memory consumed by the paper-trading gates.",
      "The Web3 trading page now labels the old long control surface as an optional advanced workbench with expert receipts, keeping Copilot/Market/Portfolio/Wiring as the primary flow instead of presenting a second executor-style desk.",
      "The compact command spine now exposes the high-frequency minute loop directly, showing loop permission, max trades next minute, provider utilization, route quote budget, tick cadence, queued actions, paper budget, and modeled profit per minute.",
      "The compact Web3 cockpit now folds the ranked autonomous action queue into the command spine instead of stacking a duplicate next-action chart, preserving deploy, release, edge-per-minute, risk, selected lane, and paper-ready receipt evidence.",
      "The compact Web3 cockpit now surfaces execution adapter readiness before the long diagnostics, showing quote, Swap V2 order, landing, signature, relay, boundary, provider-budget, TTL, and paper-fallback status while live execution stays locked.",
      "The compact Web3 cockpit now folds an opportunity-versus-risk map into the Moonshot-style price-action card, separating chaseable paper edge from high-risk exit-liquidity danger without adding another long diagnostics section.",
      "The compact Web3 cockpit now charts smart exit pressure for held paper positions, combining scalp-exit pressure, hold edge, release size, keep size, protected profit, and exit-ladder risk before the agent redeploys.",
      "The compact Web3 cockpit now renders a Moonshot-style price-action tape chart from existing market rows, plotting 5m/1h/6h momentum, volume, liquidity, buy pressure, risk, and max paper size before the agent sizes a paper action.",
      "The wallet net-worth chart now bounds cash, equity, high-watermark, and forecast values into the visible SVG range so paper cash exposure cannot draw off-canvas while the agent is reviewing portfolio value.",
      "The Web3 trading header now includes a state-driven wallet mini curve so paper net-worth feedback is visible immediately on mobile before the longer diagnostic panels.",
      "The Web3 trading first screen now promotes a compact Moonshot hot-coin pressure chart that plots market-pulse candidates by blended edge, signal score, buyer flow, review pressure, and risk marker before the operator reaches deeper signal diagnostics.",
      "The Web3 trading first screen now binds that hot-coin pressure card to the autonomous next-tick bundle, showing the next bounded action, bundle size, paper budget, tick cadence, and throttle summary before the operator scrolls.",
      "The Web3 trading first screen now binds held-position monitoring into the same cockpit with a position sentry that exposes scalp-exit posture, watched count, release budget, at-risk notional, route/guard state, and review cadence.",
      "The Web3 trading cockpit now exposes a compact autonomous loop timeline that ties market monitoring, edge decision, session sizing, execution boundary, and wallet/profit feedback into one monitor-decide-size-execute-learn flow.",
      "The Web3 trading cockpit now includes a make-money proof stack that joins expected value, route quality, execution-quality gate, token safety, forecast accuracy, and wallet feedback into one trade/protect/refresh/pause verdict.",
      "The Web3 trading cockpit now surfaces the last planner-bound autonomous session outcome with requested/completed ticks, session PnL, cash delta, exposure delta, fills, blockers, and protective sells before the deep diagnostics.",
      "The latest planner-bound autonomous session outcome is now saved in the persistent local paper ledger and reloaded into the Web3 cockpit and policy optimizer after the page refreshes.",
      "The Web3 trading first screen now includes a profit velocity cockpit that condenses expected profit per minute, tick cadence, ready trades, blocked actions, churn capacity, friction, next-minute budget, and capital efficiency.",
      "The Web3 trading first screen now includes a Moonshot-style trending coin tape that ranks visible memecoin candidates by 5m/1h momentum, buy pressure, liquidity, signal score, route status, risk flags, and max local paper size.",
      "The compact autonomous wallet cockpit now brings wallet net worth, window PnL, tactic, planner tick/fill cap, drawdown, fill efficiency, last session impact, and portfolio guard release pressure into one first-screen charted card.",
      "Signal/noise scanner ranks each memecoin by attention velocity, organic confirmation, buy pressure, liquidity quality, paid-hype penalty, risk noise, route readiness, and signal-to-noise ratio before the arbiter sizes fresh paper buys.",
      "Symbol quarantine governor turns paid hype, weak signal/noise, fading flow, current position loss, wallet stress, and churn limits into allow/probe-only/quarantine/exit-only symbol permissions before local paper buys can apply.",
      "Lane capital controller allocates local paper budget by strategy lane, command performance, profit learning, wallet drawdown, and churn so press/fund/probe/cooldown/stop/protect lanes can gate fresh simulated buys before the paper ledger advances.",
      "Closed-loop profit allocator now turns lane capital, profit learning, fill-ledger memory, outcome memory, wallet telemetry, profit control, and churn into a next-cycle paper sizing plan that gates fresh local paper buys, clips oversize qualified buys to the learned lane cap, preserves protective sells, and publishes press/fund/probe/release/cooldown/stop lane weights, deploy/release caps, selected/suppressed lanes, cadence, and a paper-only live-gated boundary.",
      "Autonomous regime tape classifies each memecoin as breakout, scalp, rotation, distribution, rug-risk, or dead-chop, then gates fresh paper buys while preserving protective sells.",
      "Autonomous market pulse fuses signal/noise, organic momentum, source confirmation, buyer flow, trend velocity, route readiness, promotion risk, and risk into one attack/probe/watch/protect/stand-down row before the agent considers fresh paper exposure.",
      "Market-pulse paper execution can turn the top attack or probe pulse row into one bounded local paper buy after cash, deploy-budget, edge-permission, route/readiness, and duplicate-position gates clear.",
      "The Web3 signal view includes a hot tape chart that compresses Moonshot-style signal/noise, buyer flow, trend velocity, risk, blended edge, and race leadership into one visual candidate comparison before the agent chooses paper attack, probe, protect, or stand-down actions.",
      "Autonomous burst scheduler turns signal/noise, trade-batch readiness, wallet telemetry, route-refresh pressure, market-stream health, churn efficiency, and loop-director state into local paper tick cadence, max next trades, and DEX/quote budgets.",
      "Autonomous trade mission fuses signal/noise, arbiter, trade-batch, capital, wallet, route, burst, and readiness gates into one current attack/probe/harvest/protect/blocked mission with target, budget, expected edge, risk, blockers, evidence, and step health.",
      "Mission price tape renders the active coin with a price line, entry/stop/target guide levels, buy/sell pressure, liquidity, velocity, microstructure, and risk scores from the existing pair telemetry.",
      "Read-only OHLCV adapter endpoint validates network, pool, timeframe, aggregate, limit, and token side, then normalizes GeckoTerminal public pool candles for future real-candle mission charts.",
      "OHLCV candle signal analysis turns fetched candles into local press/probe/hold/trim/exit/avoid reads with chart confidence, momentum, volume burst, drawdown, volatility, support, resistance, stop, target, and review timing.",
      "Candle-signal paper executor sizes a bounded local paper buy, sell, hold, or block from that candle read using current cash, equity, position value, and max paper trade size.",
      "Actionable candle paper buy/sell responses can be applied idempotently to the persistent local paper ledger from the mission price tape, updating simulated cash, exposure, positions, and trade count without touching a wallet.",
      "Candle auto mode can apply those actionable candle paper responses by itself while the local browser-driven trading loop is running in Live DEX mode, using the same idempotent paper-ledger endpoint and duplicate guard.",
      "Autonomous candle targeting now follows urgent watchlist candle-refresh leaders before falling back to the mission or arbiter target, so the visible chart, candle paper decision, and agent flow inspect the same coin.",
      "Autonomous paper sessions now pause for a read-only candle refresh when the watchlist rotation is chart-first, letting the browser fetch GeckoTerminal-style OHLCV evidence before the next paper sizing pass.",
      "The command cockpit now includes autonomous profit mission control, fusing profit target progress, next trade sizing, route proof, cadence, wallet exposure, drawdown, and portfolio release actions into one above-the-fold operator readout.",
      "Autonomous strategy selector now ranks momentum sniper, high-frequency scalp, winner compounding, portfolio protection, and route repair tactics from paper profit evidence, wallet heat, route status, scanner readiness, and tradeability before the next session.",
      "Autonomous session planner now consumes the selected tactic to set the next paper session target, tick count, fill cap, deploy cap, route-refresh requirement, and run-report tactic metadata.",
      "Position candle guard compares the active live candle tape against any matching open paper position, then sizes a protective paper trim or exit from stop distance, target distance, open PnL, and candle exit pressure.",
      "Live DEX mode can request read-only GeckoTerminal OHLCV candles for the active pair and falls back to the derived pair tape if the public provider or pool id is unavailable.",
      "Autonomous capital allocator fuses cash, exposure, risk buffers, profit vault, route edge, churn drag, post-trade review, and profit-lock release needs into deploy/release/reserve budgets before the paper daemon can advance.",
      "Autonomous setup memory learns which symbols and drivers are paying after paper fills, open PnL, and route friction, then gives the trade arbiter bounded press, size-down, exit-first, or observe bias.",
      "Autonomous trade arbiter compares fresh buys against exits and harvests using expected value, route cost, blockers, and fractional Kelly caps before choosing the next paper action.",
      "Arbiter paper execution bridge turns the arbiter's selected cleared action into a single local paper-ledger fill when persistent paper mode advances.",
      "Autonomous loop director turns session, capital, risk, daemon-memory, post-trade review, trade-batch pressure, setup memory, route confidence, and feed freshness into local burst/active/watch/cooldown intensity, client-run/pause decisions, repeated-execution throttles, and next daemon request envelopes.",
      "Autonomous tick throughput planning caps next-minute local paper actions by ready lanes, repeated-execution slots, burst limits, route refresh needs, and readiness gates before the browser loop keeps trading.",
      "Autonomous tick bundle planning groups ready paper trade, protect, route-refresh, and market-refresh lanes into a next-minute local action bundle with action count, paper execution count, refresh count, symbols, budget, and expected edge.",
      "Tick-bundle paper rehearsal translates that next-minute bundle into ready, applied, refresh-only, blocked, or skipped lane outcomes with paper trade ids, projected cash delta, projected exposure delta, and edge, then can apply bounded ready paper fills through the existing ledger boundary when the local loop advances.",
      "Tick-bundle paper rehearsal now consumes route-refresh execution too, so fresh entry bundle lanes are blocked by stale or missing read-only quote evidence while protective paper sells and refresh-only lanes remain available.",
      "Tick-bundle feedback governor scores wallet PnL, recent daemon memory, churn permission, readiness gates, and bundle quality, then sets press/selective/cooldown/protect posture, next bundled-fill cap, sizing multiplier, and protective-sell-only behavior for local paper advances.",
      "Wallet performance governor scores whether the local paper wallet is actually making money from equity slope, window PnL, drawdown, expectancy, win rate, profit learning, and tick-bundle feedback, then opens, restricts, or blocks fresh paper buys.",
      "Autonomous exit bracket governor fuses stop/take-profit ladder, profit-lock automation, scalp-exit pressure, protective Trigger coverage, and wallet feedback into one paper-only OCO-style bracket posture that can block fresh buys until held exposure is protected.",
      "Autonomous tick governor fuses discovery, route, wallet, readiness, profit, and throughput checks into run-now/protect-first/refresh-first/observe/paused/blocked local paper tick permits, including a sell-only protect-first override and read-only re-arm plan for route or market evidence repair while fresh paper buys stay paused.",
      "The browser Start loop now follows the autonomous tick governor: pause/blocked stops the local loop, refresh-routes requests read-only quote evidence, refresh-market refreshes market or candle evidence, observe refreshes state, and trade/protect runs bounded paper sessions.",
      "Churn efficiency auditor measures whether rapid paper buy/sell/trim cycles remain net-positive after route cost, priority-fee drag, slippage, fill shortfall, and turnover pace before allowing accelerate/selective/cooldown/stop behavior, and now exposes an open/selective/cooldown/blocked fresh-entry governor with max next entry size.",
      "Market ingestion plan ranks the next DEX Screener websocket, REST pair-backfill, paid-order, Solana log-watch, and Jupiter-style quote refresh steps before the paper executor advances.",
      "Market ingestion now exposes provider-aware refresh budgets for DEX discovery, DEX pair backfill, paid-order checks, GeckoTerminal OHLCV candles, and route quotes so the autonomous loop can separate hot monitoring from throttled or reserved lanes.",
      "DEX stream freshness maps DEX Screener token-profile, boost, and community-takeover WebSocket lanes to REST fallback status and scanner freshness so the Web3 cockpit can distinguish hot market intake from stale or blocked discovery.",
      "Autonomous discovery intake condenses DEX profiles, boosts, ads, paid-order checks, pair mapping, and stream freshness into attack/probe/refresh/block paper intake verdicts with source coverage, pair coverage, paid-hype pressure, max local paper size, and next refresh timing.",
      "The Web3 cockpit now promotes a compact Data Ops Queue beside the action queue, showing the next provider lane, refresh cadence, budget use, watched symbols, route/candle/pair pressure, and watchlist leader without repeating the full ingestion diagnostics.",
      "The Web3 trading cockpit now opens with an autonomous operator brief that compresses protect, refresh, trade, and learn order-of-operations into a first-screen sequence with wallet impact, bracket gate, route/chart evidence, and live-signer boundary.",
      "Autonomous profit runway governor fuses wallet performance, expected edge, route proof, exit brackets, and tick cadence into one scale/trade/probe/harvest/protect/refresh/learn/blocked verdict with trade permission, max next notional, release-first amount, and break-even ticks.",
      "Autonomous profit velocity governor turns the profit runway, tick-bundle feedback, churn edge, wallet feedback, and provider data/quote budgets into one high-frequency loop permission: multi-fill, single-fill, protect-only, refresh-only, observe, or blocked.",
      "Autonomous trade readiness gate fuses market ingestion, feed integrity, arbiter output, batch readiness, preflight status, risk governor, live-arming gates, and legacy persistent-paper entry loops before allowing local paper buys, protective sells, or batch fills.",
      "Position watch clock turns every open paper coin into a next-review deadline with stale-feed, route-refresh, and log-watch evidence requirements before the daemon chases new entries.",
      "Autonomous session supervisor fuses monitor heartbeat, daemon memory, post-trade review, profit-loop score, risk governor, order handoff, custody mandate, and live-arming state into an attack/harvest/observe/cooldown/stand-down/blocked loop decision.",
      "Liquidity-depth controller for pool absorption, spread, price-impact, turnover, priority-fee pressure, route/resize/slice/protect/block decisions, child-order sizing, and paper deploy/release caps before rapid churn.",
      "Route quote sampler for quote confidence, route diversity, impact drift, probe/confirm/requote/block decisions, and paper deploy caps before autonomous fills.",
      "Quote freshness guard stamps live Jupiter route quotes with quote time, context slot, and router timing, then blocks preflight when a quote is older than the short trading window.",
      "Route refresh queue ranks stale quotes, due position reviews, DEX backfills, and protect-position refreshes into immediate requote, refresh-soon, confirm-fresh, watch, or blocked jobs, then lets the local loop director tighten its next paper tick before another paper sizing pass.",
      "Autonomous route refresh execution turns the route-refresh queue into a selected read-only requote or backfill action with symbol, lane, quote age, confidence, blockers, next deadline, and a structured Jupiter quote-request envelope when the mints, amount, slippage, and ExactIn route can be derived; a request-quote action can fetch that read-only quote and rebuild the local route/preflight/profit/session evidence before sizing resumes.",
      "Alpha-decay controller for chase/probe/harvest/expire decisions, setup half-life, freshness, attention decay, quote decay, and paper deploy/release caps before late-pump chasing.",
      "Profit-lock automation for per-position exit, harvest, trail, defend, and moonbag decisions that combine the exit ladder, liquidity sentinel, trigger-order planner, position commander, alpha decay, quote sampler, and landing supervisor before the next paper action.",
      "Profit-capture race controller for second-by-second race-exit, trim-now, harvest, trail, press, hold, or blocked decisions from profit lock, position commander, liquidity pressure, tape pressure, smart-money pressure, route freshness, quote age, and live-arming boundaries.",
      "Autonomous portfolio sentinel continuously ranks open paper positions for exit, harvest, trim, defend, trail, moonbag, or hold decisions from profit protection, liquidity pressure, tape pressure, and commander urgency.",
      "Autonomous position-risk execution turns the sentinel's highest-priority held-position release into at most one idempotent local paper sell per persistent paper cycle before fresh exposure is added.",
      "Portfolio protection sweep can apply up to three unblocked sentinel-ranked local paper sells from the open paper book, then refresh cash, exposure, net worth, positions, and trade tape.",
      "Portfolio auto-protect can fire that same bounded paper sweep by itself while the local browser trading loop is running, with duplicate-window protection so the same release window is not hammered repeatedly.",
      "Position surveillance matrix turns every open paper position into a ranked stop, target, route-refresh, feed-refresh, quote-refresh, log-watch, release/keep, confidence, and next-action row in the Web3 portfolio view.",
      "Portfolio tape guard scores every open paper position against the fast price-action tape for exit, trim, harvest, press, hold, or refresh actions before the agent prioritizes more fresh exposure.",
      "Portfolio tape-guard execution turns the top exit, trim, or harvest tape row into at most one idempotent local paper sell before the older position-risk fallback or fresh-exposure lanes get a chance to add risk.",
      "The Web3 wallet command strip ties the net-worth curve to the current paper handoff, command status, tape-guard execution, deploy/release budgets, allocation mix, PnL slope, and next local loop cadence.",
      "The Web3 execution view includes an execution path timeline that condenses paper decision, order handoff, pre-submit rehearsal, live arming, signed relay, and confirmation lifecycle into one local sequence with request id, payload hash, TTL, last-valid block height, and submit path.",
      "Autonomous burst requests can ask the server to run one sell-first paper protection pass before the normal paper daemon response, so one local tick can protect the book without a separate manual sweep click.",
      "Bounded autonomous session runs can ask the server to execute several paper daemon ticks in one request, then report completed ticks, fills, blockers, protection sells, cash/exposure deltas, and wallet net PnL.",
      "Autonomous policy optimizer turns paper PnL, churn edge, drawdown, signal/noise, setup memory, wallet telemetry, and the last session result into a visible attack/selective/protect/cooldown posture with next-session size, trade cap, tick count, and safeguards.",
      "Autonomous edge verifier turns forward-trial replay, current PnL quality, signal/noise, route proof, fill-quality simulation, churn budget, and live-boundary checks into scale, probe, protect-only, or stand-down paper capital permission before policy sizing.",
      "Autonomous edge verifier now includes missed-opportunity proof from the opportunity-cost auditor before sizing capital permission.",
      "Autonomous edge stack fuses signal/noise, replay proof, route tradeability, wallet runway, cost drag, and safety gates into one visible paper attack/probe/protect/refresh/stand-down verdict; it cannot sign, submit, custody funds, or guarantee profit.",
      "Autonomous edge-stack execution maps that fused verdict to the existing action-queue, tradeability, protective-sell, or read-only route-refresh lane, exposing queued/applied/refresh-only/protect-only/blocked status while preserving paper-ledger and read-only route boundaries.",
      "The autonomous tick plan now ingests the latest fused edge action as an edge lane, so the local loop can prioritize paper trade, protect, stand-down, or read-only route-refresh work from the combined proof instead of leaving it as display-only.",
	      "Autonomous opportunity race compares entry candidates against profit/protection exits using signal/noise, route proof, edge verification, wallet telemetry, and capital budgets before choosing the next paper attack, probe, protect, harvest, ignore, or stand-down action.",
	      "Opportunity-race paper execution can turn the race winner into one bounded local paper-ledger fill after sell-first batch and arbiter paths have had priority.",
	      "Trend-chase paper execution turns the hottest chase/probe trend into one bounded local paper buy candidate after cash, liquidity, edge, policy, capital, readiness, duplicate-position, route blockers, and tiny sample-mode scout-reserve rules are checked.",
	      "Scout lifecycle controller watches trend-scout, launch-probe, and scout/probe-origin paper entries, then queues one bounded paper harvest, trim, or stop before fresh trend-chase exposure when profit, drawdown, flow fade, or trend fade requires it.",
	      "Autonomous strategy attribution groups local paper fills by launch, graduation, signal-policy, arbiter, race, candle, protection, and manual lanes, then estimates net contribution, friction, size bias, and next action before future sizing.",
      "The autonomous policy optimizer consumes strategy attribution as a lane-bias multiplier, trade-cap clamp, and edge-hurdle adjustment so underperforming paper lanes tighten before future sessions add risk.",
      "Auto-policy sessions read that optimizer before running, then use its tick count, sell-first protection posture, and fill cap for the bounded local paper loop.",
      "The Start control repeats those bounded auto-policy paper sessions at a policy-adjusted cadence only when the burst scheduler says the local loop can run; otherwise it is visibly blocked and the operator can run a one-shot bounded paper session.",
      "Autonomous tick plan orders the next local paper tick across protect-now, trade-now, route-refresh, market-refresh, observe, and stand-down lanes with urgency, paper budget, expected edge, risk, confidence, and blocker rationale.",
      "Trend velocity scanner ranks Moonshot-style hot-coin flow from price velocity, buy pressure, discovery heat, freshness, liquidity, and signal/noise, then feeds paper chase/probe/watch/fade/block pressure into the opportunity race.",
      "Chat",
      "Live chat has a local size limit. Short questions can use a saved chat key; oversized questions stop before any live chat request.",
      "Executor preview",
      "Connection tests and explicit holdings snapshot imports",
      "Chat context saves what the app can remember; import holdings again when balances matter",
      "Rewind controls: Portfolio, Decision journal, Paper, and Executor can replay local data as of an earlier moment",
    ],
  },
  {
    title: "What a saved read can include",
    icon: Cpu,
    tone: "text-engine",
    summary:
      "When a saved read is loaded, these come straight from it. Everything else falls back to sample data.",
    items: [
      "Daily ideas, supporting notes, and alerts come from the saved read when one is loaded.",
      "When a saved read includes closed calls, Performance and the Decision journal show whether those calls were right and whether scores matched results.",
      "Chat reasons over today's read. Paper trading enters Master Mold's simulated call for comparison. Alert ratings show which alert types people keep or ignore.",
      "Every card and alert is labeled as a saved read or sample data. A quiet seeded day does not contact live chat by itself.",
      "Still sample or local: paper-trading scoring and strategy metrics. Portfolio can mix sample data, manual entries, and explicit holdings snapshots.",
      "Each saved fact carries when it happened and when it became known. Saved reads are normalized so the app never shows a fact as known before it happened.",
      "Saved market reads can inform Today, Alerts, Paper, and chat. They cannot touch accounts or move money.",
      "The Web3 trading page can use a local sample loop or read-only DEX Screener discovery from latest profiles, latest boosts, top boosts, community takeovers, ads, paid-order records, and pair telemetry, plus discovery-edge supervision for source coverage, pair mapping, source confirmation, actionable snipe/probe readiness, and promotion-risk cooldowns, launch-sniper scoring for velocity, buy-flow, liquidity support, source quality, and trap risk, launch-graduation supervision for inferred bonding-curve progress, AMM handoff, post-migration momentum, and paper graduate/snipe/probe/trim choices, holder-flow surveillance for local holder concentration, whale/sell-flow pressure, creator/authority uncertainty, first-buyer cluster risk, paper size multipliers, and credential-gated exact top-holder adapters, feed-integrity checks for freshness/source coverage/pair mapping/backfill, market-stream supervision for DEX Screener websocket lanes, REST pair backfill, reconnect timing, Solana log-watch readiness, and watched-symbol selection, liquidity-exit sentinel scoring for liquidity drains, sell walls, authority risk, drawdown, recommended paper sell size, and protected-profit estimates, catalyst intelligence for organic flow vs paid hype, fast price-action scoring for velocity/buy-flow/liquidity-turnover/exit-pressure windows, local rug-pull firewall scoring, local token vetting, tape-change memory for acceleration/liquidity/sell-flow shifts, situation-regime classification, exit-ladder planning for hard stops/trailing stops/take-profit trims/moonbag runners, position-commander commands for hold/defend/trim/exit/moonbag/lockout decisions, signal-alpha attribution for paper PnL and friction by driver family, capital rotation for paper release/redeploy actions, autonomous compounder profit-vault and redeploy caps, cycle-runbook sequencing, autonomous monitor wake decisions, durable paper-daemon memory for recent autonomous ticks, execution-edge ranking, live-execution arming checks, transaction lifecycle queueing for unsigned/signature/simulated-submit/confirmation/expiry states, signed-transaction relay status for externally signed payloads, Jupiter Trigger deposit-craft/create-order request shaping, order-history monitoring, fill reconciliation estimates, and idempotent local portfolio-mirror patches with hash-only signed-payload metadata, execution-intent queueing, local execution-cost modeling for priority fees/route friction/landability, local MEV/slippage-attack screening for sandwich risk/public-route exposure/liquidity shock/private-route need, paper fill-quality scoring for arrival-price slippage/fill rate/partial fills/opportunity cost, retry planning for requotes/resizes/slices/priority-fee steps/stand-downs, execution preflight checks, paper performance scoring, deterministic forward-trial gates, cost-adjusted profit optimization, paper-trade learning feedback, opportunity-radar ranking, bankroll-aware paper sizing, read-only Jupiter quote planning, unsigned-order dry-runs, payload-hash signer simulation, strategy replay comparisons, and execution drill audit records for Solana candidates; execution remains paper-only unless future live signer/RPC/API/approval gates are explicitly configured.",
      "Liquidity-depth results are local estimates from current pool liquidity, volume, transaction imbalance, route impact, priority-fee pressure, MEV guard, and fill-quality models until a live depth adapter is connected.",
      "Route quote sampler results compare current quote availability, route label diversity, impact drift, depth action, and dry-run status; they do not prove a route will land on chain.",
      "Quote freshness results measure the app's own quote timestamp against the current trading cycle and can block stale execution plans, but they do not guarantee the quoted route is still available on chain.",
      "Route refresh queue results are local read-only scheduling decisions. They can prioritize Jupiter quote refresh, DEX pair backfill, and position-protection lanes, but they do not contact a signer, submit a swap, or guarantee a refreshed quote will still be profitable.",
      "Autonomous action queue and queue-execution results are local orchestration evidence only. They decide which existing paper lane should be watched or applied first; they do not create a live order, bypass signer gates, or prove a trade will make money.",
      "Action-queue route vetoes are conservative local controls. They can block fresh simulated fills when quote evidence is stale or blocked, but they do not prove that a live route would execute or be profitable.",
      "Action-queue alpha timing vetoes are conservative local controls. They can block stale or late simulated buys before local ledger mutation, but they do not prove that a fresh-looking setup will remain profitable.",
      "Wallet performance governor results are local paper-feedback controls only. They can adjust paper-loop size, cadence, fresh-buy permission, and harvest/protect-first behavior, but they cannot guarantee profit, custody funds, sign, submit, settle, or keep running after the app stops.",
      "Autonomous exit bracket governor results are local paper supervision only. They can shape OCO-style stop/take-profit posture and block fresh simulated buys when held exposure is uncovered, but they cannot create, fund, sign, cancel, or submit Jupiter Trigger orders.",
      "Autonomous execution heartbeat and tick-governor results are local paper-loop controls only. They can recommend the next paper advance, read-only re-arm route or market refresh, protect-first sell-only pass, or pause, but they cannot sign, submit, custody funds, keep running after the app stops, or guarantee profit.",
      "Autonomous profit-run guard can pause or cap the local browser paper loop, but it cannot guarantee profit, keep running after the app stops, sign or submit swaps, custody funds, or override live-execution gates.",
      "Autonomous daily profit lock is a local paper circuit breaker only. It can block fresh simulated buys, preserve harvest/protect paper sells, or stand down the local loop from target/loss evidence, but it cannot guarantee profit, reset a real trading day, sign, submit, or move funds.",
      "Auto Watch profit-lock gating is local orchestration only. It can choose protect, harvest, cooldown, or stand-down paper ticks before fresh paper entries, but it cannot run after the app stops, guarantee realized profit, or submit live swaps.",
      "Auto Watch wallet and fill-audit gating is local paper feedback only. It can slow, protect, or tighten the browser loop from simulator wallet curves and local fill audits, but it cannot verify exchange balances, guarantee fills, or recover real losses.",
      "Auto Watch safety-loop keep-alive is still browser-local. It can keep local protect/review/cooldown ticks moving while the page is open; the separate supervised daemon can write local paper health receipts outside the browser, but it is not a process manager, live order submitter, loss-prevention guarantee, or real-capital trading bot.",
      "Autonomous replay gate is local deterministic replay evidence only. It can throttle simulated fresh buys from base, breakout, and rug-risk paper scenarios, but it cannot prove future profit, prevent live losses, sign swaps, submit transactions, or move wallet funds.",
      "Autonomous data freshness gate is local/read-only provider discipline only. It can block or shrink simulated fresh buys from stale stream, paid-order, OHLCV, quote, or provider-budget evidence, but it cannot open durable sockets, bypass rate limits, prove live liquidity, sign swaps, submit transactions, or guarantee profit.",
      "Autonomous market evidence fusion is a local paper/read-only scoring surface only. It can prioritize trade, probe, route refresh, candle refresh, protection, rejection, or watch actions from fused evidence, but it cannot prove future profit, maintain background trading after the app stops, sign swaps, submit transactions, custody funds, or move money.",
      "Autonomous burst fill plan is a local paper execution plan only. It can split or block the next paper ticket by guard capacity, prior burst feedback, route quote budget, cash, impact, and slippage, but it cannot execute live swaps, guarantee fills, guarantee profit, or bypass signer and custody gates.",
      "Autonomous burst outcome feedback is local paper scoring only. It can reduce, hold, or increase the next simulated burst size from observed wallet/fill/churn evidence, but it cannot guarantee profit, guarantee fills, keep running after the app stops, or move real funds.",
      "Autonomous burst fill execution writes only to the local paper ledger. It can record simulated child fills and scale-ins, but it cannot execute live swaps, custody assets, sign payloads, or guarantee that frequent trading will make money.",
      "Autonomous profit accountability is a local paper-trading verdict. It can size or pause the simulated loop from paper evidence, but it cannot prove future profit, execute live swaps, or guarantee that high-frequency trading will make money.",
      "Autonomous profit-accountability repair can now distinguish a remaining preflight blocker from a fully blocked state after sample route rehearsal, then request one protect-first diagnostic paper tick while keeping live execution and wallet mutation blocked.",
      "Route-sampler scout evidence can now unlock a tiny paper-only deploy budget and a one-fill protect-first repair tick when the run envelope, risk governor, route rehearsal, and paper quality gates agree; live signing, Jupiter execution, and wallet mutation remain separately blocked.",
      "Sample-mode local route evidence now feeds preflight and route refresh as paper-only proof: repairable high-confidence routes can move to a route-refresh probe lane, while toxic vetting, liquidity, pair-age, and MEV evidence remains blocked; live quotes, signing, and wallet mutation stay separately gated.",
      "Autonomous profit validator results are local expected-value proof only. They can downshift the paper loop to scale, trade, probe, protect-only, refresh-first, or stand-down, but they cannot guarantee profit, custody funds, sign transactions, or submit swaps.",
      "Autonomous scalp-exit autopilot results are local held-position paper guidance and local paper-ledger effects only. They can queue or record one bounded paper eject, trim, or harvest per ledger cycle, but they cannot sign, submit, settle, keep running after the app stops, or guarantee profit.",
      "Autonomous protection coordinator results are local synthesis only. They dedupe and rank paper defense lanes for review clarity and compress overlapping sell pressure into unique held-symbol exposure, but the underlying paper executors still enforce the ledger boundary and no coordinator output can sign, submit, settle, or guarantee protected profit.",
      "Protective trigger coverage results are local supervision only. They can pause fresh paper buys while exits are uncovered or need repair, but they cannot create, fund, sign, cancel, or submit a Jupiter Trigger order.",
      "Alpha-decay results use local velocity, attention, token age, route confidence, and liquidity-depth inputs to decide whether a setup is fresh enough for paper trading.",
      "Position-commander results fuse paper position health, exit pressure, profit capture, route protection, trigger-order plans, and alpha decay into local hold/defend/trim/exit/moonbag/lockout commands.",
      "Profit-lock automation results are local paper estimates for release size, protected profit, exposed profit, moonbag runner value, stop price, trigger status, landing path, and next review timing.",
      "Profit-capture race results are local paper decisions for release urgency, decision window, route freshness, signer boundary, protected profit, at-risk profit, and keep/release sizing. They can require a fresh route before trusting a paper sell size, but they cannot sign or submit a real sell.",
      "Autonomous portfolio sentinel results are local paper surveillance decisions. They can rank held coins for release, keep, stop, review-window, and source-stack attention, but they cannot create a real order or move funds.",
      "The position surveillance matrix is a UI synthesis of local paper sentinel and review-clock metadata. It does not create Jupiter Trigger orders, hold vault funds, request signatures, run after the app stops, or prove that a real bracket exit would execute.",
      "Portfolio tape guard results are local paper price-action guidance. They can rank held coins by velocity, flow, exit pressure, stop gap, target gap, and release/keep sizing, but they cannot create live sells, keep monitoring after the app stops, or guarantee profit.",
      "The execution path timeline is a UI synthesis of local paper and dry-run execution metadata. It cannot build, sign, submit, or confirm Jupiter Swap V2 transactions, hold request ids as authority, or guarantee Solana confirmation before blockhash expiry.",
      "Autonomous position-risk execution results are local ledger effects only. They can queue or record one bounded paper sell from the sentinel's top held-position risk, but they cannot sign, submit, settle, or prove a live exit would land.",
      "Portfolio tape-guard execution results are local ledger effects only. They can queue or record one bounded paper sell from fast price-action pressure, but they cannot sign, submit, settle, or prove a live exit would land.",
      "Portfolio protection sweep results are local paper-ledger sell fills from the sentinel's ranked release list. They update the simulated wallet only and do not prove a sell would land on chain.",
      "Microstructure-tape results use local or read-only short-window trade imbalance, transaction counts, volume/liquidity turnover, price impulse, tape memory, and liquidity flags to estimate buy bursts, absorption, distribution, sell cascades, churn, liquidity vacuum, deploy multipliers, and release size.",
      "Smart-money sentinel results estimate top-trader and smart-wallet behavior locally from DEX attention, holder-flow proxies, microstructure, price action, and concentration risk until Birdeye, CoinGecko top-trader, Solscan, or Helius-style wallet adapters are configured.",
      "On-chain event inbox results can come from posted Helius-style webhook/history/manual event metadata; they are local paper-trading signals, not a live wallet listener unless a public webhook and credentials are configured outside this review build.",
      "Wallet event reactor results are paper/dry-run reactions from the event inbox, token vetting, risk budget, and execution readiness. They can queue local execution intents but cannot submit swaps.",
      "Execution landing supervisor results are local readiness decisions from intent urgency, route quotes, priority-fee estimates, MEV guard status, and live-arming gates; they do not submit to Jupiter, Helius, or Solana.",
      "Autonomous order handoff results are local execution contracts. They can point to Jupiter order/execute, Sender-style submission, Solana RPC relay, or the paper ledger, but they still require external signing and live gates before any real submission.",
      "Pre-submit rehearsal results are local dry-run checks. They can require route refresh, order rebuild, external signature, submit-gate review, or confirmation polling, but they do not build, sign, rebroadcast, or confirm real transactions.",
      "Autonomous custody mandate results are local policy contracts. They can describe an external-wallet, Privy-style, Turnkey-style, or session-key signer envelope, but they do not create wallets, store private keys, grant approvals, or sign transactions.",
      "Signer ops results are provider readiness metadata. They can say whether a wallet prompt, Privy-style server wallet, Turnkey-style policy wallet, or session-key path is configured enough to request a bounded signature, prepare a redacted provider packet, and accept validated hash-only signer-request, managed-submit receipt, or managed-submit status evidence, but they do not store secrets, raw transaction bodies, or signed payloads.",
      "Provider credential readiness is redacted review evidence only. It can prove that Helius/Solana and Jupiter read rails exist and that credential scope, policy hash, signer request, and provider packet metadata line up, but it cannot expose secrets, create custody, sign, submit, or authorize real-capital trading.",
      "Profit-proof readiness is paper evidence only. It can require repeated positive promoted runs and target-hit consistency before a launch gate passes, but it cannot guarantee future profit, authorize live trading, or replace independent risk review.",
      "The promoted paper proof plan is a local paper-run checklist only. It can recommend how much proof to collect next, but it cannot execute live swaps, guarantee future PnL, or make a real wallet tradable.",
      "Plan-led promoted paper autopilot runs remain local paper processes. The route may choose a smaller next proof batch or refuse a complete plan, but it cannot bypass live-capital gates, custody policy, or wallet-mutation locks.",
      "Autonomous live-readiness audit is a conservative transition checklist only. In the current build it keeps real-capital autonomy locked unless every live gate clears; the launch checklist now calls out production worker supervision, provider credentials, live wallet accounting, and long-horizon profit proof as explicit remaining gates, but it still does not provide custody, signer policy enforcement, tax/compliance approval, or guaranteed profit.",
      "The cutover runway is sequencing and review evidence only. It can name the next safe setup action, but it cannot create exchange credentials, connect a wallet, start a production worker, approve custody, or authorize real-money trading.",
      "Autonomous daemon handoff and production supervisor readiness are process evidence only. They can tell an external runner when to call the paper backend loop and whether a sanitized supervisor receipt is fresh enough for review, but they do not install a production process manager, prevent every overlapping process outside the app, sign transactions, submit swaps, or keep running after hosting/runtime shutdown.",
      "Live wallet accounting readiness is a read-only evidence gate. It can prove wallet scope, aggregate Helius DAS asset-index coverage, RPC sync, pricing coverage, local portfolio mirroring, and settlement/mirror status, but it cannot authorize trades, custody assets, guarantee exchange-statement accuracy, or move funds.",
      "Wallet activity history is recent-signature context only. It can show redacted signature history from RPC, but it cannot prove complete wallet ownership, decode every swap, guarantee balances, sign transactions, or authorize wallet mutation.",
      "Autonomous wallet telemetry results are local paper-account measurements. They can show equity curve, high-water mark, allocation, drawdown, and slope across recorded daemon ticks, but they are not exchange statements or live wallet balances.",
      "The wallet command strip is a UI synthesis of local paper telemetry and command metadata. It cannot prove current live balances, guarantee profit, rebalance a real wallet, or override custody and live-execution gates.",
      "Autonomous wallet growth director results are local simulator controls only. They can cap fresh paper buys from wallet heat, exposure, drawdown, open-position crowding, and paper release pressure while preserving protective paper sells, but they cannot guarantee profit, verify live wallet balances, sign swaps, or move funds.",
      "Autonomous re-entry hunter results are local paper/simulator controls only. They can identify reclaim-style rebuy candidates after paper exits and queue bounded simulator re-entry trades, but they cannot prove a live reclaim, guarantee profit, sign swaps, submit orders, or move funds.",
      "Autonomous profit route selector results are local paper/simulator controls only. They can rank and gate simulated command, race, market, trend, re-entry, protection, route-profit, and wallet-growth lanes, but they cannot prove live fills, guarantee profit, sign swaps, submit orders, or move funds.",
      "Autonomous profit lane scoreboard results are local paper/simulator controls only. They can rank make-money lanes and summarize expected edge or realized paper contribution, but they cannot prove future profitability, sign swaps, submit orders, or move funds.",
      "Autonomous portfolio mark board results are local paper mark-to-market controls only. They can rank held simulated coins for press, harvest, trim, exit, protect, refresh, or hold, but they cannot verify live wallet balances, sign swaps, submit orders, or guarantee profit.",
      "Autonomous execution-quality arbiter results are local paper/dry-run controls only. They can block or allow simulated fresh buys from route, landing, MEV, pre-submit, and fill-quality evidence, but they cannot prove a live transaction will land, sign swaps, submit orders, or guarantee profit.",
      "Autonomous token safety clearance results are local paper/simulator controls only. They can suppress or cap simulated fresh buys from local token-risk, holder-flow, route, and landing evidence, but they do not replace a live audited token-security report, signer policy, or real fill reconciliation.",
      "Autonomous reflex operator results are local paper-control decisions only. They can rank the immediate press, protect, refresh, observe, or stand-down move and expose blockers, but they cannot run a background daemon after the app stops, sign swaps, submit transactions, or guarantee profit.",
      "Autonomous cash deployment director results are local paper-wallet sizing controls only. They can reserve cash and cap simulated deploy/scout buys from target exposure, safety, execution, and wallet heat, but they cannot verify live wallet balances, sign swaps, submit orders, or guarantee profit.",
      "Autonomous profit navigator results are local paper cockpit decisions only. They can combine wallet curve, deploy/release sizing, route edge, safety, execution, and portfolio-risk evidence into one visible posture, but they cannot verify live balances, sign swaps, land transactions, confirm fills, or guarantee the app will make money.",
      "Autonomous profit forecast results are deterministic local paper projections only. They can estimate a next-window equity path, drawdown, break-even timing, and invalidation rule from current simulator evidence, but they cannot predict live fills, account for unseen liquidity changes, sign swaps, land transactions, or guarantee profit.",
      "The wallet runway chart is a local simulator visualization only. It shows paper wallet slope, drawdown, fill/block pressure, and exposure from the current telemetry, but it cannot verify live balances, prove future performance, submit trades, or guarantee profit.",
      "Autonomous forecast feedback results are local paper calibration only. They can compare deterministic forecasts with remembered simulator ticks and shrink or expand the next simulated size, but they cannot prove live fills, account for unseen liquidity, sign transactions, or guarantee future profit.",
      "Autonomous alpha conviction results are local paper-trading rankings only. They can compress signal, route, safety, wallet, and forecast evidence into a clearer candidate list, but they cannot prove demand is real, verify live liquidity, sign swaps, submit orders, or guarantee profit.",
      "The Moonshot-style trending coin tape is a local/read-only ranking UI. It can surface momentum, buy pressure, liquidity, route status, and risk flags, but it cannot prove viral demand, guarantee profit, sign swaps, submit orders, or move wallet funds.",
      "The first-screen Moonshot pressure chart is a local paper/scanner visualization only. It can compare current scored candidates, but it cannot prove organic demand, execute a swap, or guarantee that chasing the leader will make money.",
      "The first-screen next-tick bundle is a bounded local paper-loop summary only. It can show what the browser loop may rehearse next, but it cannot run after the app is closed, sign transactions, submit swaps, move funds, or guarantee profit.",
      "The first-screen position sentry is a local paper-position monitor only. It can summarize scalp-exit, route-refresh, release, and guard pressure for simulated holdings, but it cannot verify live wallet balances, execute exits, or guarantee protected profit.",
      "The autonomous loop timeline is a compact synthesis of local paper/scanner state. It explains the current monitor-decide-size-execute-learn posture, but it does not prove live fills, custody, current balances, or future profitability.",
      "The make-money proof stack is local paper evidence only. It can explain why the simulator chooses trade, protect, refresh, or pause, but it cannot prove live route availability, certify token safety, sign transactions, or guarantee profit.",
      "Trap radar is local paper/read-only evidence only. It can suppress fresh simulated buys when hype, liquidity, holder, sell-pressure, route, or wallet-risk signals look trap-like, but it cannot prove organic demand, prevent rugs, replace live holder/security adapters, or guarantee profit.",
      "The autonomous order ticket is a local paper instruction only. It can show the next simulated side, size, stop, target, confidence, and blockers, but it cannot sign, submit, custody funds, create a real order, prove fillability, or guarantee profit.",
      "The execution cadence governor is a local scheduling model only. It uses source-budget assumptions and current paper telemetry to decide what to poll next, but it cannot guarantee API availability, execute live routes, bypass rate limits, or make real-money profits.",
      "The live alpha strip is a compressed cockpit view over local/sample or configured feeds. It improves first-screen visibility, but it is not a guarantee that a coin is liquid, safe, viral, or profitable.",
      "The wallet net-worth curve is a local paper/simulator visualization only. It can show wallet equity, forecast direction, and recent simulated buys/sells, but it cannot verify exchange fills, live wallet balances, or future profit.",
      "The state-driven wallet net-worth curve reads local paper telemetry points only. It can expose cash/exposure/drawdown/fill/block feedback from the simulator, but it still is not a bank, exchange, custodian, or live wallet statement.",
      "The profit velocity cockpit is a local paper/simulator visualization only. It can summarize expected paper profit per minute, paper trade cadence, blocked actions, churn friction, and budget pressure, but it cannot place live high-frequency trades or guarantee more trades will make money.",
      "Autonomous execution escalator results are local readiness decisions only. They can say whether the next step is paper fill, unsigned-order build, external signature request, signed-payload relay, or confirmation polling, but they cannot create signatures, store private keys, submit without live gates, or guarantee settlement.",
      "Autonomous size governor results are local simulator controls only. They can calculate the next paper size from wallet health, edge, execution readiness, recent paper memory, and outcome discipline, but they cannot verify live balances, sign swaps, submit transactions, custody funds, or guarantee profit.",
      "Autonomous pressure tape results are local next-minute paper controls only. They can prioritize press, scalp, protect, refresh, pause, or idle behavior from local evidence, but they cannot run after the app stops, sign swaps, submit live transactions, custody funds, or guarantee profit.",
      "Pressure-tape paper execution results are local ledger effects only. They can queue or record one bounded simulator buy/sell from the pressure tape, but they cannot request signatures, submit Jupiter orders, broadcast swaps, move wallet funds, or prove live profitability.",
      "Autonomous profit objective results are local paper-control targets only. They can focus the agent on required edge, stop, harvest, and press thresholds, but they cannot guarantee profit, authorize live execution, or move wallet funds.",
      "Autonomous profit control results are local paper policy guidance only. They can choose press, compound, harvest, redeploy, protect, or cooldown posture and expose deploy/release budgets, but they cannot guarantee profit, sign swaps, submit orders, or move wallet funds.",
      "Autonomous command center results are a UI and policy synthesis of local paper/dry-run evidence. The rehearsal score projects paper wallet impact from current local marks and modeled edge; it can rank what the agent should do next in paper mode, but it cannot sign, submit, settle, custody funds, prove live fills, or guarantee profitable trades.",
      "Command-center paper execution results are local ledger effects only. They can queue or record one bounded paper fill from the command-board winner, but they cannot request signatures, submit Jupiter orders, broadcast swaps, move wallet funds, or prove live profitability.",
      "Command performance results are local paper diagnostics only. They estimate command-fill contribution and churn from simulator trades; they cannot prove future profit, validate live liquidity, or authorize real-money trading.",
      "Live scanner readiness is a read-only intake verdict. It can say whether a candidate has enough current scanner evidence for local paper attack/probe posture, but it cannot prove demand is real, bypass provider limits, sign, submit, settle, custody funds, or guarantee money-making trades.",
      "Autonomous discovery intake is read-only and paper-gated. It can prioritize DEX candidates and cap simulated size from public discovery evidence, but it cannot prove organic demand, bypass provider limits, place swaps, move wallet funds, or guarantee profit.",
      "Autonomous alpha quality is a local paper-ranking verdict only. It can separate cleaner organic momentum from paid/noisy momentum and cap local paper size, but it cannot prove viral demand, guarantee profit, sign swaps, submit transactions, custody funds, or move wallet capital.",
      "Autonomous tradeability simulation is local execution modeling only. It can estimate fillability, slippage, shortfall, and route/depth blockers for paper sizing, but it cannot guarantee a real fill, prevent losses, submit swaps, sign payloads, custody funds, or move wallet capital.",
      "Autonomous fill ledger digest is local paper telemetry only. It can summarize recent simulator fills and discipline, but it cannot prove live profitability, verify exchange fills, sign, submit, settle, custody funds, or guarantee money-making trades.",
      "Autonomous outcome memory governor is local paper attribution only. It can bias the next simulator loop from remembered outcomes, expectancy, profit factor, lane contribution, and risk telemetry, but it cannot prove live profitability, sign swaps, submit orders, custody funds, or guarantee profit.",
      "Outcome-memory sizing inside the autonomous size governor only changes local paper-loop sizing and fresh-buy permission. It cannot override route, wallet, token-safety, protection, signer, custody, or live execution gates.",
      "High-frequency profit race results are local paper/dry-run timing metadata from trend velocity, signal/noise, route-profit, scalping, profit-capture, capital, risk, and churn state. They cannot run after the app stops, sign swaps, submit transactions, move wallet funds, or guarantee profit.",
      "High-frequency action-plan results are local paper scheduling guidance only. They can say which data lane to refresh, how quickly to review, and what simulated notional is capped, but they cannot open sockets, place live orders, or guarantee profit.",
      "High-frequency paper execution results are local ledger effects only. They can queue or record one bounded paper buy or sell from the fast-race winner, but they cannot request signatures, submit Jupiter orders, broadcast swaps, move wallet funds, or prove live profitability.",
      "High-frequency paper route fallback is not route proof. It deliberately preserves live route and signer blockers while allowing local portfolio-risk rehearsal in the paper wallet.",
      "The Web3 cockpit chart, flow map, profit attribution board, and runway are UI summaries of local paper telemetry and mission metadata. They make the agent flow easier to review, but they still do not represent exchange statements, custody access, proof of future profit, or live wallet trading authority.",
      "Web3 daemon supervisor receipts are local process-health and paper-PnL evidence only. They show whether the external paper runner posted, blocked, errored, hit a paper target, or opened its circuit; they do not prove exchange uptime, live fill quality, custody safety, real profit, or future profit.",
      "The autonomous operator brief is a compact UI synthesis only. It can show the current trade/protect/refresh order and wallet-impact estimate, but it cannot execute live swaps, keep running after the app stops, or guarantee profit.",
      "The autonomous position situation board is a local paper synthesis only. It can block or slow fresh paper buys while held coins need exit, trim, harvest, route refresh, or defense, but it cannot sell live tokens, custody a wallet, submit swaps, or guarantee profit.",
      "The autonomous trading directive is a local paper/read-only command summary only. It can decide whether the app should protect, harvest, refresh, attack, probe, stand down, or observe next, but it cannot sign, submit, custody funds, continue after the app stops, or guarantee profit.",
      "The autonomous directive outcome auditor is local paper feedback only. It can adjust the next simulated size or protect/refresh posture from wallet trend and follow-through evidence, but it cannot verify live balances, sign swaps, submit transactions, or guarantee profit.",
      "The autonomous profit runway governor is a local paper-trading decision layer. Its runway score, trade permission, max next notional, release-first amount, and break-even ticks are derived from simulator state and read-only evidence; they do not prove live profitability or unlock wallet signing.",
      "The autonomous profit velocity governor only throttles local paper-loop frequency. Multi-fill or single-fill permissions do not bypass provider limits, create persistent background workers, sign transactions, submit swaps, custody funds, or guarantee profit.",
      "Signal/noise scanner results are local scoring metadata. They can downsize, reject, or prioritize paper entries from read-only market signals, but they do not prove that a live memecoin trade will make money.",
      "Autonomous market pulse results are local paper-trading metadata. They can require organic momentum, source confirmation, and promotion-risk clearance before a simulated fresh buy, but they cannot prove viral demand is real, guarantee profit, sign swaps, submit orders, or move funds.",
      "Symbol quarantine results are local paper-entry controls only. They can block or shrink fresh simulated buys for a noisy symbol while allowing protective simulated sells, but they cannot prove live risk, guarantee profit, or move wallet funds.",
      "Lane capital results are simulator budgets only. They can press, probe, cool, stop, or protect local paper lanes, but they cannot guarantee profit, authorize live wallet exposure, submit swaps, or move funds.",
      "Autonomous regime tape results are local simulator controls only. They can classify breakout, scalp, rotation, distribution, rug-risk, and dead-chop conditions for paper entries, but they cannot prove a live market regime, guarantee profit, sign swaps, or move funds.",
      "The order ticket's regime gate is a local paper-entry brake. It can cap, shrink, or block simulated fresh buys from the current regime tape, but it cannot prove a live token is safe, liquid, or profitable.",
      "The order ticket's execution-friction gate is local paper/dry-run evidence. It can require a read-only requote, shrink size, or block simulated fresh buys from impact, slippage, pool depth, or MEV-risk pressure, but it cannot guarantee a real route will land or avoid loss.",
      "The order ticket's timing-decay gate is local paper freshness metadata. It can require fresh evidence, shrink size, or block simulated late-pump buys from alpha half-life and quote-decay pressure, but it cannot prove live demand, prevent stale data, or guarantee profit.",
      "Autonomous burst scheduler results are local cadence and budget metadata. They can speed up or slow down the browser-driven paper loop, but they do not create a persistent worker, bypass provider rate limits, or confirm real transactions.",
      "The Data Ops Queue is a UI synthesis of local market-ingestion state. It prioritizes read-only DEX Screener, GeckoTerminal, and Jupiter-style refresh work, but it does not open persistent sockets, bypass provider limits, sign, submit, or prove future profit.",
      "DEX stream freshness is a local planning and scanner-scoring surface. It maps documented WebSocket lanes and REST fallbacks, but it does not maintain a durable socket connection, custody funds, submit swaps, or guarantee that a trending coin will remain profitable.",
      "Route-refresh execution can request and read quote evidence only. It cannot sign, submit, create orders, custody funds, or move live wallet funds.",
      "Autonomous burst request results are local paper-ledger outcomes. They can include a server-side sell-first protection pass, but they still do not sign, submit, or settle any live swap.",
      "Autonomous session-run results are bounded paper-ledger outcomes from the current request only. The cockpit can summarize ticks, PnL, cash/exposure movement, fills, blockers, and protective sells, but it is not an always-on worker and cannot sign, submit, settle, or guarantee profitable live swaps.",
      "Autonomous policy optimizer results are paper policy guidance only. They can change local sizing posture, desk mode, allowed local actions, and next-session caps, but they cannot override risk gates, custody gates, kill switch, signer requirements, or guarantee profit.",
      "Autonomous edge verifier results are paper capital-permission guidance only. They can shrink local paper size, force protect-only behavior, or stand down paper entries, but they do not prove future profit or authorize live trading.",
	      "Autonomous opportunity race results are local paper guidance only. They can rank whether the desk should attack, probe, protect, harvest, ignore, or stand down next, but they cannot submit live swaps, move wallet funds, or guarantee profitable trades.",
	      "Opportunity-race paper execution results are local ledger effects only. They can record one bounded paper buy or sell from the race winner, but they cannot request signatures, submit Jupiter orders, broadcast swaps, move wallet funds, or prove a live fill would land.",
	      "Trend-chase paper execution results are local ledger effects only. They can queue or record one bounded paper buy from trend-velocity pressure, including a tiny sample-mode scout reserve, but they cannot sign, submit, settle, move wallet funds, prove live liquidity, or guarantee profit.",
	      "Scout lifecycle results are local paper exit decisions only. They can queue or record one bounded paper sell for a scout/probe-origin paper position, but they cannot request signatures, submit swaps, settle a live exit, or guarantee a profitable release.",
	      "Autonomous strategy attribution results are local paper diagnostics only. They can suggest scale/tighten/protect posture by execution lane, but they cannot prove live profitability or authorize real trades.",
      "Policy attribution bias can shrink local paper size, cap next-session fills, raise the minimum paper edge, or allow bounded paper scale. It cannot override edge verification, route quality, readiness, custody, kill-switch, or live-execution gates.",
      "Auto-policy session parameters are still local paper controls. They bound the current request's tick count, protection pass, and fill-cap checks, but they do not guarantee a live fill cap, route landing, or profitability.",
      "The browser Start loop only repeats bounded local paper sessions while the page is open and while the scheduler is not standing down. It is not an OS worker, server daemon, wallet bot, or live order submitter.",
      "Autonomous tick plan results are local paper scheduling guidance. They can decide what the browser/local loop should try next, but they cannot run after the app stops, sign, submit, settle, or move live funds.",
      "Autonomous tick-governor results are local paper-only permits. They can tell the browser loop to trade, protect, refresh, observe, or pause, but they cannot run after the app stops, sign, submit, settle, custody funds, or guarantee profit.",
      "The governor-driven browser loop only runs while the page is open and still uses the existing local paper-ledger, route quote, and read-only market refresh boundaries. It is not a persistent background trader and cannot make autonomous live swaps.",
      "Tick-throughput results are local paper caps only. They can show actions per minute, remaining slots, next-minute paper budget, and throttle reason, but they cannot create an always-on worker, bypass route/custody gates, or guarantee profit.",
      "Tick-bundle results are local paper rehearsal only. They can show the next-minute action group the browser loop may try, but they cannot submit multiple live swaps, reserve liquidity, or prove those actions will be profitable.",
      "Tick-bundle paper rehearsal can apply multiple bounded local paper fills during an explicit paper advance. It is still paper-ledger-only, idempotent, throughput-capped, duplicate-symbol guarded, and cannot sign, submit, or settle live transactions.",
      "Tick-bundle feedback results are local paper controls only. They can press, cap, cool down, or force protective-sell-only behavior from simulated wallet feedback, but they cannot prove future profit, authorize live wallet trades, or bypass custody and signer gates.",
      "Trend velocity scanner results are local paper pressure only. They can speed up, shrink, block, or prioritize paper chase decisions, but they cannot guarantee profit, prove live liquidity, sign, submit, or move wallet funds.",
      "Autonomous trade mission results are local paper mission metadata. They explain what the agent is trying next and why, but they do not create a live order, custody relationship, signer policy, or profitability guarantee.",
      "Mission price tape uses derived DEX-style pair stats in sample mode and whenever live OHLCV fetches fail. It should not be treated as exchange-grade history unless the chart is marked live.",
      "The OHLCV adapter is read-only chart data plumbing. It can fetch public GeckoTerminal candles for a provided pool id, but it does not select trades, guarantee candle quality, or submit orders.",
      "Autonomous candle conviction is local chart-gating metadata for paper buys. It can downsize, block, or request refreshes from available candle-like evidence, but it cannot guarantee signal quality, live provider availability, trade landing, or profit.",
      "Candle signal analysis is a local interpretation of fetched chart history. It can recommend press, probe, hold, trim, exit, or avoid posture, but execution gates still decide whether any paper or live action is allowed.",
      "Candle-signal paper executor decisions are local paper actions. They show cash/exposure deltas and can be applied to the local paper ledger with an idempotency key, but they do not request signatures, submit swaps, touch a live wallet, or guarantee profit.",
      "Candle auto mode runs only in the open browser session. It can auto-record a local paper fill when live candles, the running loop, and the paper decision line up, but it is not an always-on background trader.",
      "Position candle guard uses the active chart only for the matching open paper position. It can size a local paper trim/exit, but it is not a portfolio-wide live wallet monitor until multi-position candle feeds are connected.",
      "Portfolio auto-protect is local browser automation over the persistent paper ledger. It can auto-apply unblocked sentinel releases while the page is open and running, but it is not a background worker and cannot sell live tokens.",
      "Autonomous loop director decisions control only the browser/local paper loop. They can burst, slow, tick, observe, refresh route evidence, or pause local daemon requests, but they cannot create an always-on worker or submit real trades.",
      "Churn efficiency auditor results are local paper diagnostics. They can cap next-cycle trade count, slow cadence, stop fresh churn, or allow faster paper churn, but they do not prove live profitability or submit trades.",
      "Market ingestion plan results are local scheduling decisions. They can prioritize live-source reconnects, websocket lanes, REST backfills, paid-order checks, and quote refreshes, but they do not open sockets, run a background worker, or submit orders by themselves.",
      "Provider budget results are local rate-discipline guidance. They show how the paper agent would allocate read-only refresh pressure across public data providers, but they do not guarantee provider availability, bypass rate limits, keep the app running after the browser closes, or execute trades.",
      "Autonomous setup memory results are local paper learning signals. They can bias paper sizing and exit priority, but they cannot override risk, route, preflight, custody, or live execution gates.",
      "Autonomous trade arbiter decisions are local paper rankings. They can select a paper buy, sell, harvest, defend, or stand-down action, but they cannot sign, submit, or guarantee profitability.",
      "Arbiter paper execution results are local ledger effects only. They can show queued/applied paper size, cash delta, exposure delta, and blockers; they cannot submit a transaction or move wallet funds.",
      "Autonomous trade batch results are local sell-first paper batch plans. They can apply bounded ledger fills during a persistent paper advance, but they cannot create live orders, bypass caps, or guarantee profit.",
      "Autonomous trade readiness gate results are local allow/hold decisions. They can block fresh paper buys, including legacy persistent paper advances, until ingest, feed, route, risk, and preflight evidence is clean, but they do not prove a real trade would land or make money.",
      "Position watch clock results are local timing decisions. They can prioritize a held coin for feed repair, route quote refresh, log-watch attention, or immediate paper review, but they do not open sockets or run after the app stops.",
      "Autonomous session supervisor results are local mission-control decisions. They can tell the paper daemon whether to keep running, advance, observe, harvest, cool down, or stop, but they do not create an OS background worker or submit real trades.",
      "Autonomous capital allocator budgets are local paper/dry-run sizing envelopes. They reserve simulated cash, cap order count, and rank deploy/release lanes, but they cannot transfer funds or override execution gates.",
      "Post-trade review results are local paper lessons from daemon memory, paper PnL, execution friction, alpha attribution, drawdown, and trade-discipline signals. They recommend next-cycle size, cadence, and pause/exit-only posture; they do not prove live profitability.",
    ],
  },
  {
    title: "Sample data",
    icon: Database,
    tone: "text-violet",
    summary:
      "Seeded holdings, prices, borrow-rate samples, paper-trading rounds, and outcomes are sample data unless you add manual holdings or import a holdings snapshot. Today and Alerts use seeded data only when no saved read is loaded.",
    items: [
      "Account positions or balances appear only after an explicit holdings snapshot import. Profit/loss history is not connected.",
      "Seeded figures exist so concentration, past-call review, and paper results are reviewable.",
      "Web3 trading autonomous fills, trims, exits, discovery-tape candidates, autonomous discovery-intake verdicts, promotion-order audit verdicts, discovery-edge source/mapping/actionable-edge scores, launch-sniper verdicts and launch-origin paper fills, launch-graduation phases/actions and graduation-origin paper fills, holder-flow sentinel scores/actions and holder-flow-origin paper blocks/trims/exits, feed-integrity freshness/gap/backfill checks, stream-supervisor websocket/backfill/reconnect/watch-symbol decisions, microstructure-tape scores/actions/deploy multipliers/release estimates, smart-money sentinel scores/actions/flow estimates/copy-confidence/deploy multipliers/release estimates, liquidity-exit sentinel pressure/trim/exit decisions, position-commander command scores/sell sizes/stop tightening/re-entry lockouts, risk-governor drawdown/turnover/throttle decisions, autonomous-compounder vault/redeploy caps, execution-edge ranks, route-profit gate verdicts, scalping-controller compound/scalp-buy/trim/flip/stand-down decisions, profit-loop controller scores/statuses/deploy caps/release caps/churn-drag gates, post-trade review lessons/decisions/size multipliers/cadence recommendations, live-arming gate states, transaction lifecycle stages, signed-relay hash/signature/status records, catalyst-intelligence actions, fast price-action decisions, rug-firewall scores, token-vetting scores, exit-ladder steps, signal-alpha attribution, capital-rotation release/redeploy actions, tape-memory change events, situation-monitor playbook actions, cycle-runbook actions, autonomous monitor cadence and advance-vs-observe decisions, paper-daemon tick actions and durable paper-daemon memory, execution-intent statuses and retry windows, execution-cost estimates, MEV/slippage-guard risk scores, fill-quality slippage/partial-fill/shortfall scores, execution-retry plans, execution-preflight scores/checks, performance-scorecard PnL/turnover/drawdown/friction metrics, forward-trial pass/watch/fail gates, profit-optimizer verdicts, learning-loop size adjustments, opportunity-radar entries, bankroll-policy sizes, trailing-stop watch decisions, and strategy replay results are paper data. Market pairs and prices are sample unless the operator switches the page to live DEX data.",
      "Liquidity-depth controller spread, absorption, expected-impact, slice-count, child-order, deploy-cap, and release-cap values are paper estimates.",
      "Route quote sampler confidence, impact-drift, route-diversity, quote timestamp, context slot, probe, requote, confirm, and block values are paper estimates unless a live quote is attached.",
      "Route refresh queue priority, lane, quote age, refresh deadline, budget, and blocker values are local runtime metadata.",
      "Alpha-decay half-life, freshness, fastest-decay, chase, probe, harvest, expire, and deploy/release values are paper estimates.",
      "Position-commander command scores, stop tightening, lockout windows, protected profit, and commanded sell sizes are paper estimates.",
      "Profit-lock automation release, locked-profit, at-risk, runner, stop, trigger, landing-path, blocker, and review-window values are paper estimates.",
      "Profit-capture race score, route freshness, quote age, decision window, signer boundary, release, keep, protected-profit, and at-risk-profit values are paper estimates.",
      "Autonomous portfolio sentinel watched count, release, keep, protected profit, at-risk capital, surveillance score, review window, source stack, and per-position action values are paper estimates.",
      "Autonomous position-risk execution selected position, paper sell id, release size, protected profit, risk score, review window, blockers, and ledger-applied flag are local runtime metadata.",
      "Portfolio tape-guard execution selected tape row, paper sell id, release size, protected profit, tape score, review window, blockers, and ledger-applied flag are local runtime metadata.",
      "Portfolio protection sweep fills, released cash, realized PnL, and exposure changes are local paper ledger estimates.",
      "Microstructure-tape buy-burst, absorption, distribution, sell-cascade, churn, liquidity-vacuum, deploy, and release values are paper estimates.",
      "Smart-money follow, probe, fade, exit, copy-confidence, estimated smart-flow, deploy, and release values are paper estimates until exact wallet/trader adapters are connected.",
      "On-chain event inbox buy/sell counts, flow estimates, dedupe counts, copy-buy/copy-sell/risk-exit recommendations, size multipliers, and release estimates are paper estimates from stored event metadata.",
      "Wallet event reactor deploy, probe, trim, exit, latency, watch-symbol, and execution-intent values are paper estimates from local wallet-event metadata.",
      "Execution landing path, latency target, priority-fee budget, Sender-tip budget, TTL, and blocker values are local readiness estimates until a live signer and transaction sender are explicitly connected.",
      "Autonomous order handoff path, API sequence, request id, payload hash, quote age, TTL, fee, signer, and blocker values are local or hash-only execution metadata; private keys and raw transaction bodies are not stored.",
      "Pre-submit rehearsal action, score, execution window, quote freshness, submit readiness, custody score, protection score, request id, payload hash, priority fee, Sender tip, checks, and blockers are local runtime metadata.",
      "Execution path timeline values are derived from local order handoff, pre-submit rehearsal, live arming, signed-relay, transaction-lifecycle, and paper-trade state. They are not proof of a real submitted swap.",
      "Autonomous custody mandate provider, policy hash, wallet scope, token allowlist, allowed path, spend cap, expiry, revocation window, and blocker values are local metadata. Credential values, private keys, and raw signed transaction bodies are not stored.",
      "Signer ops provider, policy hash, wallet scope, request count, provider packet action, adapter request hash, signer-request or managed-submit audit status, expiry, auto-sign, and user-presence values are local readiness metadata until real provider credentials and explicit live-gate approvals are configured.",
      "Autonomous wallet telemetry curve points, net PnL, window PnL, slope per tick, high-water mark, allocation percentage, drawdown, fill count, and blocker count are local paper runtime metadata.",
      "Autonomous loop director status, intensity, market watch mode, pressure scores, next tick, max ticks per minute, repeated-execution limit, ticks remaining before pause, stop reason, and daemon request envelope are local runtime metadata.",
      "Churn efficiency status, fresh-entry permission, max fresh-entry cap, cooled/stopped symbol counts, symbol score, net edge, turnover, friction, route cost, fill quality, max next trade, next-cycle trade cap, and cadence values are local runtime metadata.",
      "Market ingestion plan status, urgent steps, websocket lane counts, REST lane counts, paid-order checks, pair repairs, quote refreshes, budgets, watch symbols, blockers, and safeguards are local runtime metadata.",
      "Autonomous setup memory status, net memory, win rate, size bias, hot/cold symbol counts, symbol action, driver ids, and evidence are local runtime metadata.",
      "Autonomous trade arbiter selected action, expected paper profit, max loss, win probability, expected gain/loss, fractional Kelly percentage, route status, review window, and blockers are local runtime metadata.",
      "Autonomous opportunity race status, winner, race score, deploy/release budget, expected edge, urgency, evidence, blockers, and next action are local runtime metadata.",
      "Opportunity-race paper execution status, selected side, paper trade id, cash delta, exposure delta, edge, risk, blockers, and ledger-applied flag are local runtime metadata.",
      "Autonomous strategy attribution lane, trade count, net contribution, expectancy, friction, confidence, size bias, and best/worst lane values are local runtime metadata.",
      "Autonomous outcome memory status, next bias, expectancy, profit factor, win rate, symbol lists, preferred/suppressed lanes, and memory checks are local runtime metadata.",
      "Autonomous size governor outcome-memory bias, status, multiplier, memory score, and fresh-buy-block flag are local runtime metadata.",
      "Autonomous policy optimizer attribution size bias, attribution best/worst lane, lane-attribution evidence row, edge-hurdle multiplier, and trade-cap clamp are local runtime metadata.",
      "Autonomous profit learning status, confidence, contribution, expectancy, next-size, cadence, deploy bias, release bias, best signal, worst drag, and feedback rows are local paper runtime metadata.",
      "Autonomous market intelligence leader, action, provider status, confidence, chart score, route score, catalyst score, risk score, cadence, max-trades, deploy bias, release bias, provider plan, and blockers are local paper runtime metadata.",
      "Market-intelligence paper execution selected symbol, action, paper trade id, size, expected edge, risk, projected PnL, projected equity, confidence, blockers, and ledger-applied flag are local runtime metadata.",
      "Autonomous watchlist rotation status, leader, lane, priority, rotation score, refresh clock, route/candle/pair refresh flags, expected edge, and blockers are local runtime metadata.",
      "Watchlist-rotation paper execution selected symbol, action, side, paper trade id, size, projected PnL, projected equity, risk, score, blockers, and ledger-applied flag are local runtime metadata.",
      "Autonomous tick plan status, next action, urgency, paper budget, expected edge, risk, confidence, execute/refresh/blocked counts, and per-item blocker values are local runtime metadata.",
      "Autonomous tick-governor status, action, auto-advance permission, route/market refresh permissions, decision score, confidence score, check scores, blockers, and local paper controls are local runtime metadata.",
      "Trend velocity scanner status, leader, trend score, buy-flow score, discovery heat, chase window, paper size multiplier, evidence, and blockers are local runtime metadata.",
      "Autonomous tradeability execution selected symbol, paper action, fill score, slippage, fill rate, paper size, cash/exposure delta, blockers, and ledger-applied flag are local runtime metadata.",
      "Autonomous discovery intake status, leader, source coverage, pair map, paid-hype count, max paper size, review timing, item reasons, and blockers are local runtime metadata from read-only public DEX evidence.",
      "Autonomous market pulse status, leader, pulse score, blended edge, action, review clock, size multiplier, evidence, and blockers are local runtime metadata from signal/noise and trend velocity rows.",
      "Market-pulse paper execution selected symbol, paper trade id, size, cash/exposure delta, expected edge, risk, review clock, blockers, and ledger-applied flag are local runtime metadata.",
      "Trend-chase paper execution status, selected symbol/action, paper size, scout reserve, cash/exposure delta, modeled edge/risk, review window, blockers, and ledger-applied flag are local runtime metadata.",
      "Scout lifecycle status, selected symbol/action, watched count, release size, protected profit, at-risk value, review window, paper trade id, and ledger-applied flag are local runtime metadata.",
      "Position surveillance matrix values are local UI metadata derived from the paper portfolio, portfolio sentinel, watch clock, route/feed refresh flags, and modeled release/keep sizing.",
      "Portfolio tape guard status, action counts, velocity score, flow score, exit pressure, stop/target gap, release/keep sizing, review window, blockers, and evidence are local runtime metadata.",
      "Wallet command strip action, loop, tape status, deploy, release, tape sell, allocation, slope, cadence, and next-action text are local runtime metadata.",
      "Hot tape chart symbol, signal, flow, risk, blended edge, review clock, and action badges are local runtime metadata derived from the signal/noise scanner and trend velocity scanner.",
      "Arbiter paper execution queued/applied status, local paper fill id, paper size, cash delta, exposure delta, execution boundary, and blockers are local runtime metadata.",
      "Autonomous trade readiness gate status, buy/sell/batch allow flags, route-refresh flag, data-repair flag, gate score, max paper fills, notional caps, blockers, checks, and safeguards are local runtime metadata.",
      "Position watch clock status, due/stale/refresh counts, next review time, watched symbols, lane selection, stale seconds, required evidence, and blockers are local runtime metadata.",
      "Autonomous session supervisor status, session id, cadence, watch symbols, risk score, loop score, expected profit, deploy/release caps, and blockers are local runtime metadata.",
      "Autonomous capital allocator deploy budget, release budget, reserved cash, profit vault, free cash, expected profit, allocation score, order cap, and lane blockers are local runtime metadata.",
      "Post-trade review lessons, size multipliers, cadence, and pause/exit-only decisions are paper estimates from local cycle memory.",
      "Sample data carries timestamps too, so time-travel works against it.",
      "It's the always-available backup data — the app runs fully with no keys or saved read.",
    ],
  },
  {
    title: "Money figures",
    icon: Database,
    tone: "text-violet",
    summary:
      "Dollar amounts are seeded sample data, local manual entries, or explicit holdings snapshots.",
    items: [
      "Manual holdings are local entries you type in; imported holdings appear only after you press an account import button.",
      "Imported holdings are snapshots. They do not refresh automatically; import again before relying on them.",
      "Seeded sample amounts exist so concentration, past-call review, and paper results are reviewable with no setup.",
      "No detailed tax records, realized gains or losses, or full account history are connected.",
      "Nothing here can turn a number into a trade.",
      "Autonomous Web3 fills are simulator entries only; they do not become orders.",
      "Autonomous session plans are local paper-session plans only; they cannot sign, submit, custody funds, keep running after the app closes, or guarantee real profit.",
      "Planner-bound session runs can advance and save only the local paper ledger inside the request; the saved last-session memory is evidence for learning and UI review, not proof of live wallet profit.",
    ],
  },
  {
    title: "Connection checks and imports",
    icon: LockKeyhole,
    tone: "text-caution",
    summary: "External services are testable. Account imports create Portfolio holdings snapshots only after an explicit import action.",
    items: [
      "Coinbase — account-list test and holdings snapshot import exist for priced balances.",
      "Robinhood, via SnapTrade — connection test reports whether access is read-only or trade-capable; import reads positions only, and Master Mold never calls order endpoints.",
      "On-chain wallet, via Zerion — wallet test and fungible-position snapshot import exist.",
      "Web3 credentials — Settings shows the Helius/Solana read rail, Jupiter Swap V2 order rail, dedicated public wallet, hash-only wallet ownership proof, signer posture, emergency-stop ops, production-worker ops, and accounting lanes with setup links, ignored-env targets, safe test commands, and redacted status only.",
      "Web3 helper packets — Settings shows the current input contract for the operator request and research handoff packets, so a reviewer can see the exact next safe field or external review step without scrolling through every blocker.",
      "Jupiter setup is explicit but still credential-gated: the app can point the operator to the Jupiter Developer Platform, install `JUPITER_API_KEY` into ignored local env in trusted local development, rehearse quote/order evidence with transaction bytes withheld, and expose Trading and Settings `Sign tiny canary` browser-wallet handoffs only after explicit live flags and canary acknowledgement; Mastermind still stores no wallet authority and cannot bypass the canary relay.",
      "Signer setup is now an explicit credential packet in Settings: manual external wallet, Privy server wallet, Turnkey policy wallet, and future session-key paths show env target names, selected-path status, missing evidence, and no-secret boundaries without creating provider accounts or requesting signatures.",
      "Account imports are one-time snapshots in this build; import again before relying on balances.",
      "Live chat can be tested and used when a key is saved.",
    ],
  },
  {
    title: "Local-only actions",
    icon: CircleAlert,
    tone: "text-caution",
    summary: "Controls here write only to this local app or this browser. None reach a broker, wallet, or chain.",
    items: [
      "Saving a guardrail draft and running the kill-switch drill stay in browser state; alerts, paper trades, past calls, chat context snapshots, and manual holdings stay in the local app store.",
      "Starting the Web3 trading agent runs only the local paper-daemon loop, including discovery-edge cooldown/stand-down recommendations, launch-sniper paper fills, launch-graduation paper fills and trims, holder-flow block/reduce/trim/exit decisions, liquidity-depth route/resize/slice/protect/block sizing, route-quote probe/confirm/requote/block sizing, alpha-decay chase/probe/harvest/expire sizing, position-commander hold/defend/trim/exit/moonbag/lockout commands, microstructure-tape chase/absorb/fade/distribute/rug-pull actions, smart-money follow/probe/fade/exit actions, post-trade review lessons and next-cycle size/cadence/pause decisions, tape-memory changes, paper position-watch exits, exit-ladder trims/stops, Jupiter-style trigger-order planning, learning-loop adjustments, risk-governor gates, autonomous-compounder profit-vault and order-cap decisions, execution-edge ranking, profit-loop compound/attack/harvest/protect/cooldown/stand-down gating, live-arming checks, cycle-runbook actions, autonomous monitor wake decisions, observe/advance/stand-down tick reports, durable recent-tick memory, execution-intent queue updates, and cooldown/retry metadata.",
      "Autonomous session planner actions can schedule only a bounded local paper session with fill caps and route-refresh requirements. They cannot bypass live-execution gates, create wallet authority, or submit swaps.",
      "Auto session runs use the planner's current paper tick/fill envelope and stop when the request completes; no background trading process continues after the local response.",
      "Profit-lock automation writes only local paper release/harvest/trail/defend/moonbag recommendations and monitor triggers; it cannot create a trigger order, sign a swap, or submit a sell.",
      "Profit-capture race actions can only accelerate local paper exits, trims, harvests, trailing reviews, or protected-press decisions. They cannot sign, submit, rebroadcast, settle, or guarantee profit from a real transaction.",
      "Posting on-chain event metadata writes only to the local paper ledger. The inbox stores signatures, token metadata, wallet/counterparty addresses, direction, amounts, confidence, and recommendations; it does not store private keys or submit transactions.",
      "Wallet event reactor actions write only local paper/dry-run intent records and monitor triggers. They do not sign, transmit, or create on-chain transactions.",
      "Execution landing supervisor actions are recommendations only. They can label a future Jupiter V2, router-submit, or Helius Sender path, but cannot build, sign, transmit, or land a transaction.",
      "Autonomous order handoff actions can organize the next order, signature, submit, or confirmation step locally. They cannot sign with a wallet, bypass the kill switch, or move funds.",
      "Pre-submit rehearsal actions can ask the local loop to refresh a route, rebuild an order, request an external signature, review submit gates, or poll confirmation metadata. They cannot sign, submit, rebroadcast, confirm, or settle a transaction.",
      "Autonomous execution adapter readiness is local paper/dry-run metadata only. It can show whether the route is quote-only, paper-only, credential-gated, signature-gated, or Swap V2-ready, but it cannot sign swaps, submit transactions, custody funds, keep running after the app stops, or guarantee profit.",
      "Autonomous reaction-loop actions are local next-few-seconds paper guidance only. They can prioritize press, scalp, protect, refresh, cooldown, stand-down, or observe states, but they cannot place a live order, bypass route/signature gates, run after the app stops, or guarantee profit.",
      "Autonomous landing-optimizer outputs are local planning estimates for landing path, priority fee, compute price, slippage cap, TTL, and modeled landing chance. They cannot submit a swap, source live block-fee telemetry without configured providers, bypass signer gates, or prove a live transaction would land profitably.",
      "Autonomous run-envelope actions can only coordinate the local browser paper loop, route refreshes, provider budgets, paper fill caps, and stop reasons. They cannot keep trading after the app/browser stops, sign or submit swaps, custody funds, or guarantee profit.",
      "Autonomous custody mandate actions can describe bounded signing permissions and revocation rules locally. They cannot create a delegated signer, approve a provider policy, bypass a wallet prompt, or move funds.",
      "Signer ops actions can request a wallet prompt or mark a provider policy path as ready only inside local checks. They cannot bypass provider policy, create external wallets, submit a redacted adapter contract as a signature, or sign without a configured signer.",
      "Autonomous wallet telemetry actions can tell the paper loop to compound, harvest, recover, cool down, or protect based on local metrics. They cannot prove real profit, rebalance a live wallet, or override execution/custody gates.",
      "Autonomous profit learning actions can only change local paper sizing, cadence, deploy bias, and release bias recommendations. They cannot guarantee profit, place live orders, sign, submit, settle, or move wallet funds.",
      "Opportunity-cost audit actions are local paper-learning signals only. Missed edge is modeled from public/sample tape and cannot prove that a real wallet would have captured the move.",
      "Live discovery delta tape is read-only scanner metadata. It can prioritize profile, boost, community-takeover, ad, paid-order, and pair-map evidence, but it cannot open browser-side persistent sockets, sign swaps, submit trades, or guarantee profit.",
      "Autonomous market intelligence actions can only guide local paper sizing, cadence, provider refresh priorities, route checks, and protection posture. They cannot guarantee profit, sign, submit, settle, or move wallet funds.",
      "Market-intelligence paper execution can record only one bounded local simulated buy. It cannot place a live order, route a swap, sign, submit, settle, or move wallet funds.",
      "Autonomous watchlist rotation can prioritize local refreshes and bounded paper execution candidates, but it cannot keep running after the app stops, submit swaps, sign transactions, or move wallet funds.",
      "Watchlist-rotation paper execution can record only one bounded local simulated buy or sell from the top rotation lane. It cannot place a live order, route a swap, sign, submit, settle, or move wallet funds.",
      "Signal/noise scanner actions can only adjust local paper sizing, reject noisy candidates, and explain why a coin is attack/probe/watch/protect. They cannot guarantee profit, place live orders, or override custody gates.",
      "Tradeability paper execution can record only one bounded local simulated buy from the top fillable/probe verdict. It cannot place a live order, route a swap, sign, submit, settle, or move wallet funds.",
      "Autonomous market pulse actions can only influence local paper-trading posture and UI prioritization. They cannot guarantee profit, submit swaps, sign, settle, or move funds.",
      "Market-pulse paper execution can record only one bounded local simulated buy. It cannot place a live order, route a swap, sign, submit, settle, or move wallet funds.",
      "The hot tape chart is a UI synthesis of local or read-only signal rows. It cannot prove live order-book depth, guarantee a trend continues, submit a trade, or move wallet funds.",
      "Autonomous burst scheduler actions can only choose local paper tick timing, route/data refresh urgency, and max next paper trades. They cannot run after the browser stops, sign transactions, submit swaps, or treat Solana submission as confirmation.",
      "Autonomous burst request actions can apply sell-first paper protection inside one local server tick. They cannot continue running as a daemon, touch wallet balances, or bypass live execution gates.",
      "Autonomous trade mission actions can only focus the local cockpit on the current paper target, gate, budget, and next action. They cannot override readiness gates, sign, submit, custody funds, or prove future profit.",
      "Mission price tape paper-apply writes only a local simulated fill with duplicate protection. It cannot sign, broadcast, settle, or debit a Web3 wallet.",
      "Mission price tape candle-auto can press the same paper-apply action while the local loop is running. It cannot run after the browser closes, place a real order, or bypass paper/live gates.",
      "Position candle guard actions can record only protective local paper sells for an already-held paper position. They cannot create a live sell order, settle a swap, or prove the exit would land on chain.",
      "Autonomous loop director actions can start, tick, burst, slow, quote-refresh, candle-refresh, or pause the local browser-driven paper loop, but they cannot keep running after the app/browser process stops unless future infrastructure is added.",
      "Churn efficiency actions can only change local paper cadence, next-cycle caps, fresh-entry permission, and fast-entry eligibility. They cannot guarantee that more trades will make money or place real orders.",
      "Market ingestion plan actions can tell the paper operator what to connect, poll, backfill, pause, or reconnect next. They do not create persistent subscriptions or contact a mutating chain endpoint.",
      "Route refresh queue actions can ask the local loop to refresh route evidence, backfill pair data, or keep a position-protect lane warm. They cannot sign, submit, or settle a transaction.",
      "Autonomous setup memory actions can only bias local paper size and priority. They cannot promise profitability, move funds, or bypass any blocker.",
      "Autonomous trade arbiter actions can queue only the next local paper buy, sell, harvest, defend, or stand-down recommendation. They cannot create live orders, override custody, or promise the action will make money.",
      "Arbiter paper execution can record one selected arbiter paper fill into the local paper ledger during an advance. It cannot sign, broadcast, route, or settle a live swap.",
      "Autonomous trade batch actions can record several bounded sell-first paper fills during an advance. They cannot sign, broadcast, route, or settle a live swap.",
      "Autonomous trade readiness gate actions can prevent local paper buys, including older persistent paper-entry loops, or limit the batch to protective sells while data repairs. They cannot fetch data, sign transactions, or bypass the custody/live execution gates.",
      "Position watch clock actions can schedule the next local paper review for held coins and point to feed, quote, or log-watch evidence. They cannot open persistent subscriptions, run in the background after the app stops, or move funds.",
      "Position surveillance matrix actions can rank held paper coins for exit, harvest, trim, defend, refresh, watch, or hold across the whole local portfolio, but they cannot place live sells, move wallet funds, or guarantee profit.",
      "Portfolio tape guard actions can rank held paper coins for exit, trim, harvest, press, hold, or refresh from current fast-tape pressure, but they cannot place live sells, add live exposure, or run as a background trader.",
      "Portfolio tape-guard execution can record one local paper sell for a held coin when the fast tape says exit, trim, or harvest. It cannot place live sells, add exposure, sign transactions, or move wallet funds.",
      "Autonomous portfolio sentinel actions can rank paper exits, harvests, trims, defenses, and moonbags, but they cannot place real sells, modify wallet balances, or bypass execution gates.",
      "Portfolio protection sweep actions can modify only the local persistent paper ledger. They cannot place real sells, transfer tokens, bypass the kill switch, or run after the app/browser process stops.",
      "Portfolio auto-protect actions can trigger that local paper sweep while the running loop is open, but they cannot continue after the browser closes, sign transactions, broadcast swaps, or touch a wallet.",
      "Autonomous session supervisor actions can start or pause the local paper loop from the UI, but they cannot keep running after the app/browser process stops unless future infrastructure is added.",
      "Autonomous capital allocator actions can prioritize local paper buy, sell, reserve, and rebalance lanes, but they cannot move cash, sign, submit, or create real exchange orders.",
      "Execution readiness controls save dry-run mode, wallet public key, caps, slippage, and kill-switch state locally.",
      "Execution retry planning, preflight, transaction lifecycle tracking, signed-relay attempts, provider-managed submit status evidence, read-only signature confirmation polling, read-only settlement fill reconciliation, Jupiter Trigger create/history/reconcile drills, portfolio-mirror guard checks, and guarded local portfolio-mirror apply requests record route, fee, quote age, quote timestamp, context slot, nonce, request id, retry-window, blocker metadata, payload hash, byte count, lifecycle stage, signature/status metadata, token-balance deltas, fill estimates, reviewed mirror-apply payloads, applied order ids, idempotency evidence, bounded fill notional, fill price, filled quantity, and synthetic signer proof locally. They do not store transaction bodies, sign with real keys, or accept private keys.",
      "In default/local review mode nothing signs a transaction, submits a swap, places a Jupiter Trigger order, moves funds, or calls a chain mutating endpoint. Signed relay and Trigger create can submit only externally signed payloads after explicit live environment approval, wallet, RPC/Jupiter, kill-switch, and governor gates pass.",
    ],
  },
  {
    title: "Not built yet",
    icon: CircleAlert,
    tone: "text-critical",
    summary: "On the roadmap, not in this build.",
    items: [
      "Chat context does not read the whole market yet; it saves app context for chat.",
      "Account snapshots do not refresh on a schedule. Import holdings again before relying on balances.",
      "Long-horizon live/out-of-sample forward evaluation with external baselines, real route costs, enough resolved calls, and pre-written pass/fail gates.",
      "A real executor connected to chains, with custody limits and a working kill switch.",
      "A completed live Web3 credential packet: real Jupiter key, dedicated wallet ownership proof, signer/custody provider, emergency-stop owner, settlement/accounting owner, and manual live approval still need to be supplied and reviewed before real-capital autonomy.",
      "Wallet session keys, real signed Jupiter/Raydium transaction execution, submit/retry handling, and durable real-money autonomous trade persistence.",
      "A real landing adapter for Jupiter Swap V2 order/execute, router submit, Helius Sender, Jito tips, confirmation monitoring, and real fill reconciliation.",
      "Jupiter Trigger wallet-challenge UX, vault registration/funding screen, edit/cancel controls, and audited real-money Trigger ledger application against a custody account.",
      "Solana token authority adapter, RugCheck/security report credentials, holder-concentration reads, and live token-vetting enforcement for real-money execution.",
      "Tax sign-off before any real capital goes in.",
    ],
  },
] as const;

export function ReviewReadiness({ surface }: ReviewReadinessProps) {
  const dataMode = getDataMode();
  const publicDataMode = {
    label: productProvenanceLabel(dataMode.label),
    source: productProvenanceSource(dataMode.label, dataMode.source),
  };
  return (
    <section className="space-y-5" aria-labelledby="review-readiness-title">
      <div className="rounded-lg border border-outline-variant/40 bg-surface-dim/70 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-violet text-void hover:bg-violet">
              Trust summary
            </Badge>
            <ProvenanceChip label={publicDataMode.label} title={publicDataMode.source} />
          </div>
        <h1
          id="review-readiness-title"
          className="mt-4 text-2xl font-semibold text-on-surface sm:text-3xl"
        >
          Performance
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant sm:text-base">
          See what Master Mold has tried, which data is real, and what still needs
          evidence before you rely on it.
        </p>
      </div>

      <ReviewVerdictCard />

      <AutonomousTradingStatusCard />

      <TrustBoundaryCard />

      <ForwardProofCard />

      <PerformanceSummaryCard />

      <EngineStatusCard />

      <ScreenerTuningCard />

      <ProductMetricsCard />

      <details className="rounded-lg border border-outline-variant/40 bg-surface-high/25 p-4 sm:p-5">
        <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold text-on-surface">
          What is real here
        </summary>
        <p className="mt-2 text-sm leading-6 text-outline">
          What works now, what uses sample data, and what has not been built yet.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {disclosureSections.map((section) => {
            const Icon = section.icon;

            return (
              <Card key={section.title} className="border-outline-variant/40 bg-surface-high/30">
                <CardHeader className="space-y-3 p-5">
                  <div
                    className={`flex size-10 items-center justify-center rounded-md border border-outline-variant/40 bg-surface-dim/50 ${section.tone}`}
                  >
                    <Icon aria-hidden="true" className="size-5" />
                  </div>
                  <div>
                    <CardTitle as="h2" className="text-xl text-on-surface">{section.title}</CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
                      {section.summary}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <ul className="space-y-2 text-sm leading-6 text-on-surface-variant">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </details>

      <Card className="border-violet/30 bg-violet/10">
        <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex size-11 items-center justify-center rounded-md border border-violet/30 bg-surface-dim/50 text-violet">
            <UserRound aria-hidden="true" className="size-5" />
          </div>
          <div>
            <CardTitle as="h2" className="text-xl text-on-surface">Try the app safely</CardTitle>
            <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
              You can look around without adding credentials. Optional keys stay in this
              local app while it checks the selected service. Local walkthrough account:
              reviewer@demo.local, no password or external login.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <details className="rounded-lg border border-outline-variant/40 bg-surface-high/25 p-4 sm:p-5">
        <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold text-on-surface">
          Local walkthrough checklist
        </summary>
        <p className="mt-2 text-sm leading-6 text-outline">
          Optional checks for this local build. They do not require credentials and do not change portfolio data.
        </p>
        <div className="mt-4">
          <ReviewerEvidencePanel />
        </div>
      </details>

      <p className="text-sm leading-6 text-outline">
        {surface === "public"
          ? "Preview build — advisory-only, and not production-ready yet."
          : "Keep this page current as sample, local, gated, or unbuilt features change."}
      </p>
    </section>
  );
}

function ReviewVerdictCard() {
  const status = getEngineStatus();
  const dataMode = getDataMode();
  const portfolio = getPortfolio();
  const brain = getBrainState();
  const liveEngine = status.state === "live";
  const publicDataMode = productProvenanceLabel(dataMode.label);
  const readiness = buildTodayReadiness({ portfolio, dataMode, brain });
  const nextStep =
    readiness.href === "/review"
      ? { action: "Open Today", href: "/" }
      : { action: readiness.action, href: readiness.href };
  const reviewPrompt =
    "Review the current Master Mold setup. What is real, what is sample, and what should I set up first?";
  const facts: Array<{ label: string; value: string; tone: string }> = [
    {
      label: "Daily read source",
      value: liveEngine ? "Saved read" : publicDataMode === "Sample data" ? "Sample" : publicDataMode,
      tone: liveEngine ? "text-engine" : "text-caution",
    },
    {
      label: "Money movement",
      value: "Cannot move money",
      tone: "text-engine",
    },
    {
      label: "Money shown",
      value: "Manual, imported, or sample",
      tone: "text-violet",
    },
    {
      label: "Best next step",
      value: nextStep.action,
      tone: "text-on-surface",
    },
  ];

  return (
    <Card className="border-engine/25 bg-surface-high/45">
      <CardHeader className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </div>
            <Badge variant="outline" className="border-engine/40 text-engine">
              Trust check
            </Badge>
          </div>
          <CardTitle as="h2" className="mt-3 text-xl text-on-surface">
            Current boundary
          </CardTitle>
          <CardDescription className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
            Use Master Mold to decide what to check. It can explain saved or sample reads
            and local history, but it cannot place orders, sign transactions, or use money
            from any account in this build.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link
            href={nextStep.href}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-violet px-3 text-sm font-semibold text-void transition hover:bg-violet/90"
          >
            {nextStep.action}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <AskMasterMoldButton
            prompt={reviewPrompt}
            className="min-h-11 border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/70"
          >
            Ask what is real
          </AskMasterMoldButton>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 p-5 pt-0 sm:grid-cols-2 xl:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">
              {fact.label}
            </p>
            <p className={`mt-1 text-sm font-semibold ${fact.tone}`}>{fact.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TrustBoundaryCard() {
  const boundaries: Array<{
    title: string;
    body: string;
    tone: string;
  }> = [
    {
      title: "Use it for today's decision",
      body:
        "Today, alerts, chat, Paper, and past-call review are useful for testing the daily decision loop. Chat stops oversized questions before any live chat request.",
      tone: "border-engine/30 bg-engine/[0.06]",
    },
    {
      title: "Do not treat it as live account advice yet",
      body:
      "Imported holdings are one-time snapshots. Money shown here can be sample, manual, or imported, and nothing can trade.",
      tone: "border-caution/30 bg-caution/[0.08]",
    },
    {
      title: "Web3 trading is paper-only learning",
      body:
        "The Web3 agent can monitor memecoin tape, score routes and candle proof, run bounded local paper ticks, update a paper wallet curve, and rehearse settlement checks. It cannot sign, submit, move funds, create wallet authority, or store private keys.",
      tone: "border-violet/30 bg-violet/[0.06]",
    },
    {
      title: "What is actually left",
      body:
        "Still missing for real-money autonomy: production process management, reviewed signer/custody provider credentials, provider-backed market and route workers, real wallet accounting, audited live submit/settlement, and out-of-sample profit proof. These now appear as explicit launch-checklist gates instead of only review copy.",
      tone: "border-critical/30 bg-critical/[0.06]",
    },
  ];

  return (
    <section aria-labelledby="trust-boundary-title" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <h2 id="trust-boundary-title" className="sr-only">
        Trust boundary
      </h2>
      {boundaries.map((boundary) => (
        <div
          key={boundary.title}
          className={`rounded-lg border p-4 sm:p-5 ${boundary.tone}`}
        >
          <p className="text-sm font-semibold text-on-surface">{boundary.title}</p>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">{boundary.body}</p>
        </div>
      ))}
    </section>
  );
}

function AutonomousTradingStatusCard() {
  const supervisor = getWeb3DaemonSupervisorHealth();
  const rows: Array<{
    label: string;
    value: string;
    detail: string;
    tone: string;
  }> = [
    {
      label: "Built",
      value: "Autonomous paper desk",
      detail:
        "Memecoin discovery, signal/noise charts, route and candle proof, bounded backend ticks, paper fills, wallet net-worth curve, daemon receipts, profit-proof readiness, and settlement watchdog rehearsal are wired for local review.",
      tone: "text-engine",
    },
    {
      label: "Safe boundary",
      value: "Live capital locked",
      detail:
        "The app does not store private keys or raw signed transactions. Live swaps remain blocked unless external signer, RPC/API, wallet approval, kill switch, submit, confirmation, and mirror checks all clear.",
      tone: "text-caution",
    },
    {
      label: "Supervisor",
      value: supervisor.status === "absent" ? "No receipt yet" : supervisor.status.replaceAll("-", " "),
      detail:
        supervisor.summary,
      tone: supervisor.status === "running" || supervisor.status === "completed" ? "text-engine" : supervisor.status === "circuit-open" || supervisor.status === "error" ? "text-critical" : "text-caution",
    },
    {
      label: "Not done",
      value: "Production trader",
      detail:
        "The remaining work is not more dashboard labels; it is real infrastructure: process supervision, provider credentials, custody policy, audited order submission, clean wallet-accounting evidence, and long-run profit proof.",
      tone: "text-critical",
    },
  ];

  return (
    <Card className="border-violet/30 bg-surface-high/40">
      <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex size-11 items-center justify-center rounded-md border border-violet/30 bg-violet/10 text-violet">
          <Cpu aria-hidden="true" className="size-5" />
        </div>
        <div>
          <CardTitle as="h2" className="text-xl text-on-surface">Autonomous trading status</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
            The Web3 subsystem is now a working local paper-trading cockpit and copilot. The real-money agent is still intentionally gated until custody, execution, accounting, and proof are production-grade.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-5 pt-0 md:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{row.label}</p>
            <p className={`mt-1 text-sm font-semibold ${row.tone}`}>{row.value}</p>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">{row.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PerformanceSummaryCard() {
  const journal = getJournal();
  const resolved = journal.entries.filter((entry) => entry.outcome_score);
  const wins = resolved.filter((entry) => entry.outcome_score?.thesis_played_out).length;
  const hitRate = resolved.length > 0 ? wins / resolved.length : null;
  const avgProcess =
    resolved.length > 0
      ? resolved.reduce((sum, entry) => sum + (entry.outcome_score?.process_score ?? 0), 0) / resolved.length
      : null;
  const topBelief = journal.strategy_beliefs[0] ?? null;
  const pastCallSourceLabel = productProvenanceLabel(journal.provenance.label);
  const isSamplePastCalls = journal.provenance.label !== "Engine output";
  const lessonSource =
    journal.provenance.label === "Engine output" ? "Saved outcomes" : "Seeded history";
  const lessonGatePassed =
    topBelief?.reflection_updates.some((update) => update.significance_passed && update.applied) ??
    false;
  const facts: Array<[string, string]> = [
    ["Calls logged", String(journal.entries.length)],
    ["Closed calls", String(resolved.length)],
    ["Calls right", hitRate === null ? "Not enough data" : formatPercent(hitRate)],
    ["Review quality", avgProcess === null ? "Not enough data" : `${avgProcess.toFixed(1)}/10`],
  ];

  return (
    <Card className="border-outline-variant/40 bg-surface-high/35">
      <CardHeader className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h2" className="text-xl text-on-surface">
            Past calls
          </CardTitle>
          <ProvenanceChip label={pastCallSourceLabel} title={journal.provenance.source} />
        </div>
        <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
          {isSamplePastCalls
            ? "Seeded and locally saved calls. Use this to check the review workflow; it is not evidence that future calls will work."
            : "Saved calls and outcomes. This shows whether past ideas were useful; it does not predict whether future calls will work."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-violet/25 bg-violet/[0.06] p-4">
          <p className="text-sm font-semibold text-on-surface">Learning check</p>
          <p className="mt-1 text-sm leading-6 text-on-surface-variant">
            {topBelief
              ? `${topBelief.name}: ${topBelief.statement} ${lessonSource} only; ${
                  lessonGatePassed
                    ? "an evidence gate updated this lesson."
                    : "no evidence gate has updated a live rule yet."
                }`
              : "No reusable lesson yet."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatReviewTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed) + " UTC";
}

/** PRD success signals from the local product-event log. */
function ProductMetricsCard() {
  const summary = toPublicProductMetricSummary(getProductMetricSummary());
  const briefingRatingCount = summary.briefing_ratings.useful + summary.briefing_ratings.not_useful;
  const facts: Array<[string, string]> = [
    [
      "Today read time",
      summary.today_read.under_target === null
        ? "No reads yet"
        : `${summary.today_read.median_seconds}s median · ${summary.today_read.under_target ? "under 5m" : "over 5m"}`,
    ],
    [
      "Today ratings",
      summary.briefing_ratings.useful_share === null
        ? "No ratings yet"
        : `${formatPercent(summary.briefing_ratings.useful_share)} useful · ${briefingRatingCount} ${briefingRatingCount === 1 ? "rating" : "ratings"}`,
    ],
    ["Chat follow-ups", String(summary.chat_followups)],
    ["Decisions logged", String(summary.decisions_logged)],
    [
      "Not-useful alerts",
      summary.alert_ratings.not_useful_share === null
        ? "No alert ratings"
        : `${formatPercent(summary.alert_ratings.not_useful_share)} not useful`,
    ],
    [
      "Score check",
      summary.score_accuracy.closed_calls > 0
        ? `${formatPercent(summary.score_accuracy.average_miss ?? 0)} average miss · ${summary.score_accuracy.close_enough ? "close enough" : "needs work"}`
        : "No resolved calls",
    ],
  ];

  return (
    <Card className="border-violet/30 bg-violet/[0.06]">
      <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex size-11 items-center justify-center rounded-md border border-violet/30 bg-surface-dim/50 text-violet">
          <Activity aria-hidden="true" className="size-5" />
        </div>
        <div>
          <CardTitle as="h2" className="text-xl text-on-surface">Recent local activity</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
            Local signs of whether the daily flow is useful: Today ratings, alert feedback,
            chat follow-ups, and decisions logged before outcomes. These show usage, not proof
            that future calls will work.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 p-5 pt-0 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
            <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Honest forward-evaluation status before the full PRD harness exists. */
function ForwardProofCard() {
  const proof = getForwardProofStatus();

  return (
    <Card className="border-outline-variant/40 bg-surface-high/30">
      <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex size-11 items-center justify-center rounded-md border border-outline-variant/40 bg-surface-dim/50 text-engine">
          <CheckCircle2 aria-hidden="true" className="size-5" />
        </div>
        <div>
          <CardTitle as="h2" className="text-xl text-on-surface">Forward measurement</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
            {proof.summary}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">
                What counts
              </p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{proof.measurement.status}</p>
            </div>
            <p className="max-w-xl text-sm leading-6 text-on-surface-variant">{proof.measurement.note}</p>
          </div>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ProgressStat label="Calls since start" value={proof.progress.saved_calls} />
            <ProgressStat label="Later results" value={proof.progress.later_results} />
            <ProgressStat label="Market reads" value={proof.progress.saved_scans} />
            <ProgressStat label="Next step" value={proof.progress.next_step} />
          </dl>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase text-outline">Minimum calls</dt>
              <dd className="mt-1 text-sm text-on-surface">{proof.measurement.min_logged_calls} saved</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-outline">Minimum results</dt>
              <dd className="mt-1 text-sm text-on-surface">{proof.measurement.min_resolved_calls} resolved</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-outline">Baseline</dt>
              <dd className="mt-1 text-sm text-on-surface">{proof.measurement.baseline}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-outline">Cost rule</dt>
              <dd className="mt-1 text-sm text-on-surface">{proof.measurement.cost_policy}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-6 text-on-surface-variant">{proof.measurement.pass_fail_gate}</p>
          <div className="mt-4 border-t border-outline-variant/40 pt-4">
            <ForwardTrialStarter status={proof.measurement.status} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {proof.gates.map((gate) => (
            <div key={gate.id} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{gate.label}</p>
              <p className={`mt-1 text-sm font-semibold ${forwardGateTone(gate)}`}>{gate.status}</p>
              <p className="mt-2 text-xs leading-5 text-outline">{gate.detail}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-caution/30 bg-caution/10 p-4 text-sm leading-6 text-on-surface-variant">
          <p className="font-semibold text-on-surface">Current status: {proof.verdict}</p>
          <p className="mt-1">
            This check needs saved calls, later outcomes, costs included, a baseline, and pass/fail gates written
            before seeing results. Until those results exist, this page is a trust log, not enough evidence that
            future calls will work.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-high/35 p-3">
      <dt className="text-xs font-semibold uppercase text-outline">{label}</dt>
      <dd className="mt-1 text-sm leading-5 text-on-surface">{value}</dd>
    </div>
  );
}

function forwardGateTone(gate: ForwardProofGate) {
  if (gate.status === "Working locally") return "text-engine";
  if (gate.status === "Partial") return "text-caution";
  return "text-critical";
}

/** Saved-read history plus recent scan attempts (failures stay visible). */
function EngineRunHistory() {
  const history = getEngineRunHistory();
  const attempts = getScanAttempts(6);
  if (history.length === 0 && attempts.length === 0) return null;

  return (
    <div className="space-y-3">
      {history.length > 0 ? (
        <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
          <p className="text-xs font-semibold uppercase text-outline">
            Runs saved locally ({history.length})
          </p>
          <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
            {history.slice(0, 8).map((run) => (
              <li key={run.run_date} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-on-surface">{run.run_date}</span>
                <span className="text-xs text-outline">
                  {run.triggered} worth checking · {run.usd > 0 ? `$${run.usd.toFixed(2)}` : "$0"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {attempts.length > 0 ? (
        <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
          <p className="text-xs font-semibold uppercase text-outline">Scan attempts</p>
          <ul className="mt-2 space-y-1.5 text-sm text-on-surface-variant">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="flex flex-wrap items-start justify-between gap-2">
                <span className="font-mono text-xs text-on-surface">
                  {formatReviewTimestamp(attempt.started_at)}
                </span>
                <span
                  className={
                    attempt.status === "ok"
                      ? "text-xs text-engine"
                      : attempt.status === "failed"
                        ? "text-xs text-critical"
                        : "text-xs text-outline"
                  }
                >
                  {attempt.status === "ok" ? "Completed" : attempt.status === "failed" ? "Failed" : "Running"}
                  {attempt.usd !== null && attempt.usd > 0 ? ` · $${attempt.usd.toFixed(4)}` : ""}
                </span>
                {attempt.status === "failed" ? (
                  <span className="w-full text-xs leading-5 text-outline">{attempt.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-outline">
            Failed scans never change recommendations; the last good read stays in place.
            Re-running the same day will not create a duplicate read.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Alert-feedback loop, surfaced for the operator. */
function ScreenerTuningCard() {
  const feedback = getScreenerFeedback();
  if (feedback.signals.length === 0) return null;

  const tone: Record<string, string> = {
    demote: "border-critical/40 text-critical",
    loosen: "border-engine/40 text-engine",
    hold: "border-amber-300/35 text-caution",
    insufficient: "border-outline-variant/50 text-on-surface-variant",
  };

  return (
    <Card className="border-outline-variant/40 bg-surface-high/30">
      <CardHeader className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h2" className="text-xl text-on-surface">Alert feedback</CardTitle>
          <ProvenanceChip label={feedback.provenance.label} />
        </div>
        <CardDescription className="text-sm leading-6 text-on-surface-variant">
          Marking alerts useful or not shows which alert types deserve more or less attention.
          The rules do not change automatically yet. {feedback.total_rated} rated so far.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <ul className="space-y-2 text-sm">
          {feedback.signals.map((s) => (
            <li
              key={`${alertSignalLabel(s.signal)}-${s.suggestion}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3"
            >
              <div className="min-w-0">
                <span className="font-semibold text-on-surface">{alertSignalLabel(s.signal)}</span>
                <span className="ml-2 text-xs text-outline">
                  {s.useful} useful · {s.not_useful} not useful · {s.pending} pending
                </span>
                <p className="mt-1 text-xs leading-5 text-outline">{s.rationale}</p>
              </div>
              <Badge variant="outline" className={tone[s.suggestion] ?? tone.insufficient}>
                {alertSuggestionLabel(s.suggestion)}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function alertSignalLabel(signal: string) {
  if (signal === "return_z") return "Unusual price move";
  if (signal === "volume_z") return "Unusual trading volume";
  if (signal === "news_count_z") return "News pickup";
  return signal.replace(/_/g, " ");
}

function alertSuggestionLabel(suggestion: string) {
  if (suggestion === "demote") return "Show fewer";
  if (suggestion === "loosen") return "Show more";
  if (suggestion === "hold") return "Keep";
  return "Need more ratings";
}

/** Disclosure of the most recent saved read (or its absence). */
function EngineStatusCard() {
  const status = getEngineStatus();

  if (status.state === "live") {
    const run = status.bundle.run;
    const tierNames: Record<string, string> = { quick_think: "Quick review", deep_think: "Second review" };
    const adapter = stageObject(run.stages.agent_adapter_detail);
    const modelTiers = Object.keys(run.models).map((tier) => tierNames[tier] ?? tier);
    const summaryFacts: Array<[string, string]> = [
      ["Last read", run.run_date],
      ["Market read", reviewScanActivityLabel(run.triggered_tickers)],
      ["Used for", "Today, alerts, chat, and paper ideas"],
      ["Still missing", "Daily account refresh"],
    ];
    const facts: Array<[string, string]> = [
      ["Read date", run.run_date],
      ["Read type", run.cost.llm_calls > 0 ? "Saved market summary" : "Local rules check"],
      ["Review passes", modelTiers.length ? modelTiers.join(" + ") : "Saved read"],
      ["Market checks", reviewScanActivityLabel(run.triggered_tickers)],
      ["Cost", formatScanCost(run.cost.usd, run.cost.llm_calls)],
      ["Known as of", formatReviewTimestamp(run.knowledge_time)],
      ["Review path", reviewResearchPathLabel(run.stages.agent_adapter, adapter)],
      ["Extra review", adapter.attempted_graph === true ? "Used the saved local summary" : "Not needed for this read"],
    ];
    return (
      <Card className="border-engine/30 bg-engine/[0.06]">
        <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex size-11 items-center justify-center rounded-md border border-engine/30 bg-surface-dim/50 text-engine">
            <Cpu aria-hidden="true" className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle as="h2" className="text-xl text-on-surface">Saved read loaded</CardTitle>
              <ProvenanceChip label="Engine output" />
            </div>
            <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
              Today, Alerts, Chat, and Paper can use this saved market read. It is a saved
              read, not a background market reader, and it will not refresh
              account balances for you.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {summaryFacts.map(([label, value]) => (
              <div key={label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
                <dt className="text-xs font-semibold uppercase text-outline">{label}</dt>
                <dd className="mt-1 break-words text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>
          <details className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
              Read details
            </summary>
            <div className="mt-3 space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {facts.map(([label, value]) => (
                  <div key={label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
                    <dt className="text-xs font-semibold uppercase text-outline">{label}</dt>
                    <dd className="mt-1 break-words text-on-surface">{value}</dd>
                  </div>
                ))}
              </dl>
              <EngineRunHistory />
              {adapter.reason ? (
                <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm leading-6 text-on-surface-variant">
                  <span className="font-semibold text-on-surface">Run note:</span>{" "}
                  {reviewRunNoteCopy(String(adapter.reason))}
                </div>
              ) : null}
            </div>
          </details>
        </CardContent>
      </Card>
    );
  }

  const invalid = status.state === "invalid";
  return (
    <Card className={invalid ? "border-caution/30 bg-caution/10" : "border-violet/30 bg-violet/10"}>
      <CardHeader className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className={`flex size-11 items-center justify-center rounded-md border bg-surface-dim/50 ${invalid ? "border-caution/30 text-caution" : "border-violet/30 text-violet"}`}>
          {invalid ? <CircleAlert aria-hidden="true" className="size-5" /> : <Database aria-hidden="true" className="size-5" />}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle as="h2" className="text-xl text-on-surface">
              {invalid ? "Latest read couldn't be used" : "No saved read loaded"}
            </CardTitle>
            <ProvenanceChip label="Sample data" />
          </div>
          <CardDescription className="mt-2 text-sm leading-6 text-on-surface-variant">
            {invalid
              ? `The newest read was rejected (${status.reason}), so Today and Alerts fall back to sample data until a clean read lands.`
              : "Today and Alerts are showing sample data — the always-available backup data. A saved read can replace it when one exists; this build does not fetch fresh market news by itself."}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

function stageObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatRunCost(usd: number) {
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatScanCost(usd: number, outsideReviewCalls: number) {
  if (usd <= 0 || outsideReviewCalls <= 0) return "$0 · local rules only";
  return `${formatRunCost(usd)} · ${outsideReviewCalls} outside review ${outsideReviewCalls === 1 ? "call" : "calls"}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

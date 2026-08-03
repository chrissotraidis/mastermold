export type ReviewCapabilityStatus =
  | "working"
  | "sample"
  | "sample-or-local"
  | "credential-gated"
  | "local-only"
  | "missing";

export type ReviewCapabilityIcon = "check" | "cpu" | "database" | "lock" | "alert";

export type ReviewCapabilitySection = {
  id: string;
  status: ReviewCapabilityStatus;
  source: string;
  reviewCredential: string;
  userVisibleSurface: string;
  evidenceEndpoint: string;
  title: string;
  icon: ReviewCapabilityIcon;
  tone: string;
  summary: string;
  items: readonly string[];
};

export const reviewCapabilitySections = [
  {
    id: "working-now",
    status: "working",
    source: "local-app-and-explicit-reads",
    reviewCredential: "Optional live chat/read-provider keys can deepen review, but the visible flow works without credentials.",
    userVisibleSurface: "Today, Portfolio, Web3 lab, Settings, Review",
    evidenceEndpoint: "/api/health",
    title: "Working now",
    icon: "check",
    tone: "text-engine",
    summary:
      "Reviewable product flow with sample data, local manual entries, explicit holdings imports, and a Monarch MCP portfolio-brain setup path.",
    items: [
      "Today and idea detail with the clues behind each idea",
      "Today Decision inbox caps the current report at three ranked plays and records one durable operator response: Save call, Watch, or Pass. Save call creates a provenance-linked Decision journal entry, but sample/fallback or stale portfolio context cannot become a scored call. Directional saved calls receive one deterministic first-horizon price grade against the declared equal-weight visible-holdings baseline; the operator's separate process review is never overwritten.",
      "Alert feed",
      "Portfolio and concentration",
      "Monarch MCP portfolio brain V1: Settings has a visible Monarch MCP panel, /api/portfolio-brain/monarch exposes status, /test checks the configured MCP transport, /sync saves one read-only timestamped snapshot, Portfolio prefers that snapshot over sample holdings, /api/portfolio exposes a read-only daily_review block with portfolio-aware recommendations, and Chat can answer from the saved Monarch snapshot with source and time.",
      "Portfolio-aware review prompts now appear in Portfolio, Today, chat context, and successful scan receipts as Review, Watch, Trim candidate, Add candidate, or Paper test first suggestions. Daily scans first run a read-only portfolio preflight that syncs Monarch when configured or records that no sync was available, then Review shows whether the scan used a Monarch snapshot, imported holdings, manual holdings, or sample fallback context. Chat can name the visible risk driver from concentration, daily movement, and asset-class exposure. They are review prompts only and cannot place brokerage trades, sign transactions, or move funds.",
      "The Web3 lab is explicitly a separate autonomy/research lane. Portfolio, Monarch MCP, SnapTrade, Coinbase, and manual holdings are read-only context there and cannot create Robinhood or brokerage orders, change Monarch data, sign transactions, or move funds.",
      "Settings investment awareness now names the real integration lanes: SnapTrade or Plaid for brokerages, Coinbase OAuth/account reads for custodial crypto, Zerion-style public wallet reads for Web3, and a separate locked autonomous-wallet bucket. /api/investment-sync/status exposes the same machine-readable plan, and all lanes remain read-only until OAuth, webhook, provider, and credential-vault setup exists.",
      "Decision journal with manual process reviews and derived directional price outcomes",
      "Paper-trading rounds",
      "Autopilot lane (src/autopilot): the daemon can sample Solana markets and persist every decision, but the former entry strategy is retired after negative completed replay and realized paper evidence. The current runtime starts off; protective exits and isolated shadow research remain separate.",
      "Typed autopilot execution path: decide() emits a typed TradeIntent that a pure non-LLM policy validator re-checks (per-trade cap, daily spend, cash, position count, kill switch) before the paper executor simulates the fill; live mode uses the same path through the gate-locked live executor (quote, build, sign, simulate, send, poll).",
      "Legacy live-execution plumbing remains behind policy checks, wallet provisioning, and an evidence gate, but the retired entry strategy has no promotion authority. Passing old minimum counts alone is not evidence of a profitable or deployable strategy.",
      "Autopilot learning loop: post-exit counterfactual watches, attribution over round trips, and a once-per-day Analyst review that can propose at most one clamped parameter changeset — validated by hard-coded rails and auto-reverted by pure code if expectancy degrades. The constitution (caps, loss limits, reserve floor, stops, kill switch, gate) can never be learned.",
      "Autopilot safety boundary: the kill switch halts everything and never auto-resumes; the wallet credential lives in server env only (AUTOPILOT_WALLET_SECRET); Settings has no wallet authority, never asks for private keys or seed phrases, and live execution and wallet mutation stay locked behind the gate.",
      "Helius Credit Firewall: every Helius call flows through one fail-closed choke point (master switch, DAS/Enhanced opt-ins, unknown methods blocked, daily credit budget); execution paths fall back to the public RPC while Helius is disabled.",
      "Chat",
      "Live chat has a local size limit. Short questions can use a tab-scoped chat key; oversized questions stop before any live chat request.",
      "Executor preview",
      "Connection tests and explicit holdings snapshot imports",
      "Chat context saves what the app can remember; import holdings again when balances matter",
      "Rewind controls: Portfolio, Decision journal, Paper, and Executor can replay local data as of an earlier moment",
    ],
  },
  {
    id: "saved-read",
    status: "working",
    source: "saved-read-or-sample-fallback",
    reviewCredential: "A tab-scoped chat key can answer short questions; saved reads do not require brokerage or wallet credentials.",
    userVisibleSurface: "Today, Alerts, Paper, Chat, Review",
    evidenceEndpoint: "/api/health",
    title: "What a saved read can include",
    icon: "cpu",
    tone: "text-engine",
    summary:
      "When a saved read is loaded, these come straight from it. Everything else falls back to sample data.",
    items: [
      "Daily ideas, supporting notes, and alerts come from the saved read when one is loaded.",
      "When a saved read includes closed calls, Performance and the Decision journal show whether those calls were right and whether scores matched results.",
      "Chat reasons over today's read. Paper trading enters Master Mold's simulated call for comparison. Alert ratings show which alert types people keep or ignore.",
      "Today and Portfolio share a compact truth strip for portfolio source, market read, daily scan schedule, and recommendation source; chat receives the same truth line before answering.",
      "Refresh today can save one compact manual daily report from the current portfolio snapshot plus simple price/volume refresh, then Today and chat read that report before falling back to the older saved-read surface.",
      "Stage 0 can refresh simple yfinance price/volume bars for configured holdings/watchlist symbols, cache the result, and mark partial or synthetic fallback explicitly. Fresh news, social, on-chain, and background portfolio polling are still later work.",
      "Every card and alert is labeled as a saved read or sample data. A quiet seeded day does not contact live chat by itself.",
      "Still sample or local: paper-trading scoring and strategy metrics. Portfolio can use a saved Monarch MCP snapshot, manual entries, explicit imports, or sample fallback.",
      "Each saved fact carries when it happened and when it became known. Saved reads are normalized so the app never shows a fact as known before it happened.",
      "Saved market reads can inform Today, Alerts, Paper, and chat. They cannot touch accounts or move money.",
      "The Autopilot page reads the autonomous lane's own store: positions, ledger, equity curve, decision trace, and analyst memos. Paper results are simulator dollars, never real gains.",
    ],
  },
  {
    id: "sample-data",
    status: "sample",
    source: "seeded-sample-data",
    reviewCredential: "No credentials are needed; these rows are the no-setup review fallback.",
    userVisibleSurface: "All reviewable product surfaces",
    evidenceEndpoint: "/api/health",
    title: "Sample data",
    icon: "database",
    tone: "text-violet",
    summary:
      "Seeded holdings, prices, borrow-rate samples, paper-trading rounds, and outcomes are sample data unless you add manual holdings or import a holdings snapshot. Today and Alerts use seeded data only when no saved read is loaded.",
    items: [
      "Account positions or balances appear only after a Monarch MCP sync or an explicit holdings import. Profit/loss history is not connected.",
      "Seeded figures exist so concentration, past-call review, and paper results are reviewable.",
      "Autopilot paper fills, equity points, and decision-trace rows are simulator data in the lane's own local store (.data/autopilot.db.json).",
      "Sample data carries timestamps too, so time-travel works against it.",
      "It's the always-available backup data — the app runs fully with no keys or saved read.",
    ],
  },
  {
    id: "money-figures",
    status: "sample-or-local",
    source: "seeded-samples-manual-entries-or-explicit-snapshots",
    reviewCredential: "Read-only import credentials can create snapshots; they never authorize trades.",
    userVisibleSurface: "Portfolio, Paper, Web3 lab, Review",
    evidenceEndpoint: "/api/health",
    title: "Money figures",
    icon: "database",
    tone: "text-violet",
    summary:
      "Dollar amounts are seeded sample data, local manual entries, or explicit holdings snapshots.",
    items: [
      "Manual holdings are local entries you type in. Monarch holdings appear after a manual sync or the configured morning read-only refresh; other imported holdings appear only after you press their import button.",
      "All connected holdings remain read-only snapshots. Configured Monarch can refresh each morning; other account imports must be rerun before relying on changed balances.",
      "Daily portfolio recommendations compare the visible portfolio against saved or sample Today cards. They are prompts for review and paper testing, not personalized financial advice or executable orders.",
      "Seeded sample amounts exist so concentration, past-call review, and paper results are reviewable with no setup.",
      "No detailed tax records, realized gains or losses, or full account history are connected.",
      "Nothing here can turn a number into a trade.",
      "Autopilot paper fills are simulator entries; a live fill can only come from the gate-locked autopilot wallet, never from advisory surfaces.",
    ],
  },
  {
    id: "connection-checks-and-imports",
    status: "credential-gated",
    source: "explicit-user-tests-and-imports",
    reviewCredential: "Zo review credentials may include a live chat key and read-only portfolio import keys only; private keys, seed phrases, raw keypairs, and wallet authority are never acceptable.",
    userVisibleSurface: "Settings, Portfolio, Trading, Review",
    evidenceEndpoint: "/api/health",
    title: "Connection checks and imports",
    icon: "lock",
    tone: "text-caution",
    summary: "External services are testable. Monarch MCP sync and account imports create Portfolio holdings snapshots only after an explicit user action.",
    items: [
      "Monarch MCP — local command, local HTTP, or fixture configuration can be tested from Settings. Manual sync reads accounts/holdings through the configured MCP tools and saves a portfolio-brain snapshot. Master Mold stores the resulting read-only snapshot, not Monarch credentials.",
      "Coinbase — account-list test and holdings snapshot import exist for priced balances; production needs OAuth/callback/token refresh before it is native.",
      "Brokerages, via SnapTrade — connection test reports whether access is read-only or trade-capable; import reads positions only, and Master Mold never calls order endpoints. Plaid Investments is documented as the fallback lane, but its Link/token exchange is not wired yet.",
      "On-chain wallet, via Zerion — wallet test and fungible-position snapshot import exist.",
      "Zo review credentials, if supplied, are limited to a live chat key and read-only portfolio import keys. Private keys, seed phrases, raw keypairs, and wallet authority are never acceptable review inputs.",
      "Monarch MCP sync and account imports are one-time snapshots in this build; sync or import again before relying on balances.",
      "Live chat can be tested and used while a tab-scoped key is present.",
    ],
  },
  {
    id: "local-only-actions",
    status: "local-only",
    source: "local-browser-and-local-app-store",
    reviewCredential: "No credential can turn these controls into broker, wallet, chain, or custody authority.",
    userVisibleSurface: "Trading, Paper, Journal, Settings, Review",
    evidenceEndpoint: "/api/health",
    title: "Local-only actions",
    icon: "alert",
    tone: "text-caution",
    summary: "Most controls write only to local state. The UI safety drill never halts a runtime; real autonomous-lane controls are separate and operator-only.",
    items: [
      "Saving a guardrail draft and running the safety drill stay in browser state; the drill overlay does not inspect or halt either runtime. Alerts, paper trades, past calls, chat context snapshots, and manual holdings stay in the local app store.",
      "Autopilot controls (kill switch, mode, cap edits) write only to the lane's local store through /api/autopilot; the kill switch never auto-resumes and releasing it returns mode to off.",
      "The autopilot daemon is a local process (npm run autopilot) with a non-blocking process lock; a second launcher fails closed instead of replacing the recorded PID.",
    ],
  },
  {
    id: "polymarket-lane",
    status: "sample-or-local",
    source: "public-polymarket-read-and-local-paper-store",
    reviewCredential: "No credentials are needed for public reads or paper mode. Review credentials must never include a Polygon private key, API secret, passphrase, or deposit-wallet authority.",
    userVisibleSurface: "Polymarket, Review",
    evidenceEndpoint: "/api/polymarket",
    title: "Polymarket lane",
    icon: "cpu",
    tone: "text-engine",
    summary:
      "A separate promotion-gated Polymarket research lane and station-matched weather observer inspired by PolySniper, implemented natively without importing its runtime database or legacy live client.",
    items: [
      "Working: Gamma discovery, batch CLOB books, and a bounded public market WebSocket feed momentum, book-pressure, binary-parity, and maker-spread hypotheses. The SQLite brain records executable quotes, depth, microstructure events, forward markouts, decisive outcomes, and Brier calibration; brain strategies remain shadow-only.",
      "Promotion-gated: 24-hour momentum is a retired paper baseline and currently has no entry authority. Manual and automatic entries fail closed until its forward-label gate passes; any existing simulator position can still settle or take a protective executable-depth exit.",
      "Weather observe-only: the lane discovers upcoming daily-temperature events by numeric tag, audits each stated resolution source and ICAO station, resolves official station coordinates, and displays raw ECMWF ensemble bucket fractions. It cannot place weather paper bets because those fractions are uncalibrated and omit fees, executable depth, station anomalies, source revisions, and settlement risk.",
      "Sample/simulator and data boundary: the $500 paper book in ignored .data/polymarket.db.json and research evidence in ignored .data/polymarket-brain.db are local evidence only, not a Polymarket balance or profit claim. Neither store reads portfolio holdings, the Solana wallet, advisory data, or the ignored PolySniper database.",
      "Missing from the PolySniper intent: linked-market correlation divergence, cross-market logic clusters and multi-leg execution, wallet copy trading, weather forecast-change/observation/exit automation, counting theta, and economic-event trading. Sports latency is unsupported.",
      "Credential-gated and missing: live orders remain unavailable. A future pass must review CLOB V2 signing, dynamic fees, funder/deposit-wallet handling, allowances, geographic eligibility, heartbeat/cancel-all behavior, and a separate operator live gate.",
    ],
  },
  {
    id: "not-built-yet",
    status: "missing",
    source: "roadmap-not-this-build",
    reviewCredential: "Review credentials do not unlock these missing capabilities.",
    userVisibleSurface: "Review",
    evidenceEndpoint: "/api/health",
    title: "Not built yet",
    icon: "alert",
    tone: "text-critical",
    summary: "On the roadmap, not in this build.",
    items: [
      "Chat context does not read the whole market yet; it saves app context for chat.",
      "Long-horizon live/out-of-sample forward evaluation with external baselines, real route costs, enough resolved calls, and pre-written pass/fail gates.",
      "A live autopilot fill with real funds: quote, build, sign, and simulate are proven against mainnet, but no transaction has ever been broadcast. The operator-run provisioning swap (--send) is deliberately the first.",
      "Tax sign-off before any real capital goes in.",
    ],
  },
] as const satisfies readonly ReviewCapabilitySection[];


export function getReviewCapabilityCoverage() {
  const statuses = new Set(reviewCapabilitySections.map((section) => section.status));
  const searchableText = reviewCapabilitySections
    .flatMap((section) => [
      section.title,
      section.summary,
      section.source,
      section.reviewCredential,
      section.userVisibleSurface,
      section.evidenceEndpoint,
      ...section.items,
    ])
    .join("\n");

  return {
    hasWorkingNow: statuses.has("working"),
    hasSampleOrSeededData: statuses.has("sample") || /\b(sample|seeded)\b/i.test(searchableText),
    hasCredentialGates: statuses.has("credential-gated") || /\bcredential/i.test(searchableText),
    hasLocalOnlyBoundaries: statuses.has("local-only") || /\blocal-only|local only/i.test(searchableText),
    hasMissingOrRoadmap: statuses.has("missing") || /\b(not built|missing|roadmap)\b/i.test(searchableText),
    explainsReviewCredentials: /\b(review credentials|Zo review credentials)\b/i.test(searchableText),
    blocksSecretInputs: /private keys/i.test(searchableText) && /seed phrases/i.test(searchableText),
    blocksLiveAuthority: /live execution/i.test(searchableText) && /wallet mutation/i.test(searchableText),
  };
}

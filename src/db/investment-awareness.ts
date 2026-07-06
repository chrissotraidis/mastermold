import type { IntegrationStatusJson } from "./integrations";
import type { PortfolioJson } from "./portfolio";

type InvestmentIntegrationContext = Pick<IntegrationStatusJson, "service" | "status" | "permission_scope" | "docs_url">;

export type InvestmentAwarenessSource = {
  id: "robinhood" | "coinbase" | "web3_wallet" | "autonomous_wallet";
  label: string;
  current_state: "not-connected" | "snapshot-ready" | "stale-snapshot" | "read-only-ready" | "paper-only";
  coverage: string;
  app_can_do_now: string;
  next_step: string;
  safety_boundary: string;
  docs_url: string;
};

export type InvestmentAwarenessSummary = {
  status: "sample-only" | "manual-only" | "snapshot-fresh" | "snapshot-stale";
  headline: string;
  daily_decision_boundary: string;
  refresh_policy: string;
  sources: InvestmentAwarenessSource[];
};

export type InvestmentRealtimeSource = {
  id: "snaptrade" | "coinbase" | "web3_wallet" | "autonomous_wallet";
  label: string;
  mode: "manual-refresh-webhook" | "read-polling" | "webhook-websocket" | "paper-only";
  status:
    | "not-configured"
    | "needs-oauth"
    | "needs-read-key"
    | "needs-provider-key"
    | "ready-for-refresh"
    | "ready-for-polling"
    | "webhook-ready"
    | "snapshot-ready"
    | "paper-only";
  cadence: string;
  trigger: string;
  next_step: string;
  safety_boundary: string;
  app_path: string;
  docs_url: string;
};

export type InvestmentRealtimePlan = {
  status: "not-started" | "snapshot-watch" | "webhook-ready" | "realtime-capable" | "locked";
  headline: string;
  summary: string;
  readiness_boundary: string;
  sources: InvestmentRealtimeSource[];
};

export type InvestmentIntegrationLane = {
  id: "snaptrade_brokerage" | "plaid_investments" | "coinbase_oauth" | "zerion_wallets" | "autonomous_wallet";
  label: string;
  target: string;
  status:
    | "import-button-ready"
    | "needs-provider-app"
    | "needs-oauth-callback"
    | "needs-read-provider"
    | "locked-by-design";
  current_app_support: string;
  production_gap: string;
  next_build_step: string;
  safety_boundary: string;
  docs_url: string;
};

export type InvestmentIntegrationPlan = {
  headline: string;
  principle: string;
  next_best_move: string;
  lanes: InvestmentIntegrationLane[];
};

export function buildInvestmentAwarenessSummary({
  portfolio,
  integrations,
}: {
  portfolio: PortfolioJson;
  integrations: ReadonlyArray<InvestmentIntegrationContext>;
}): InvestmentAwarenessSummary {
  const hasImported = portfolio.import_snapshot.count > 0;
  const hasManual = portfolio.manual_holdings.length > 0;
  const status = hasImported
    ? portfolio.import_snapshot.is_stale
      ? "snapshot-stale"
      : "snapshot-fresh"
    : hasManual
      ? "manual-only"
      : "sample-only";

  return {
    status,
    headline: investmentAwarenessHeadline(status),
    daily_decision_boundary: dailyDecisionBoundary(status),
    refresh_policy:
      "Holdings refresh is explicit today: test account access, import a snapshot, and import again when balances change. Automatic scheduled sync still needs a credential vault or provider OAuth flow.",
    sources: [
      brokerageSource(portfolio, integrations),
      coinbaseSource(portfolio, integrations),
      walletSource(portfolio, integrations),
      autonomousWalletSource(),
    ],
  };
}

export function buildInvestmentIntegrationPlan({
  portfolio,
  integrations,
}: {
  portfolio: PortfolioJson;
  integrations: ReadonlyArray<InvestmentIntegrationContext>;
}): InvestmentIntegrationPlan {
  const snapTrade = integrations.find((item) => item.service === "robinhood");
  const coinbase = integrations.find((item) => item.service === "coinbase");
  const wallet = integrations.find((item) => item.service === "onchain_wallet");
  const hasBrokerageSnapshot = portfolio.imported_holdings.some((holding) => holding.account.kind === "robinhood");
  const hasCoinbaseSnapshot = portfolio.imported_holdings.some((holding) => holding.account.kind === "coinbase");
  const hasWalletSnapshot = portfolio.imported_holdings.some((holding) => holding.account.kind === "onchain_wallet");

  return {
    headline: "The real plan is read-only account connection first, then automatic refresh, then advisory decisions.",
    principle:
      "Master Mold should know what you hold through user-authorized reads. It should not scrape Robinhood, ask for private keys, or get trading scope just to understand a portfolio.",
    next_best_move:
      "Ship usable one-time imports first, then add server-side OAuth callbacks and webhook refresh so Portfolio, Today, Trading, and chat all read the same current holdings state.",
    lanes: [
      {
        id: "snaptrade_brokerage",
        label: "Robinhood and brokerages via SnapTrade",
        target: "Robinhood, Schwab, Fidelity, Webull, Public, and other brokerages supported by SnapTrade.",
        status: "import-button-ready",
        current_app_support: hasBrokerageSnapshot
          ? "Brokerage holdings have been copied into Portfolio."
          : "The app can test a SnapTrade user connection and copy positions into Portfolio when you press Import.",
        production_gap:
          "Zo needs provider app credentials, a secure user-link flow, and webhook handling before this becomes a native connection with refresh.",
        next_build_step:
          "Add the SnapTrade connect flow, persist a user connection reference server-side, then refresh positions after ACCOUNT_HOLDINGS_UPDATED.",
        safety_boundary:
          snapTrade?.permission_scope ??
          "Read brokerage accounts and positions only. No brokerage order endpoints.",
        docs_url: "https://docs.snaptrade.com/docs/realtime-data",
      },
      {
        id: "plaid_investments",
        label: "Brokerage fallback via Plaid Investments",
        target: "US/Canada investment accounts where Plaid supports holdings and investment transactions.",
        status: "needs-provider-app",
        current_app_support:
          "Not wired yet. Plaid is the right fallback if you prefer Plaid Link over SnapTrade for supported brokerages.",
        production_gap:
          "Needs Plaid client credentials, Link token creation, public-token exchange, stored access tokens, and an investments holdings importer.",
        next_build_step:
          "Create /api/plaid/link-token, /api/plaid/exchange-public-token, and an /investments/holdings/get importer mapped into Portfolio holdings.",
        safety_boundary:
          "Request Investments read scopes only. Do not request transfers, payments, or trading authority.",
        docs_url: "https://plaid.com/docs/api/products/investments/",
      },
      {
        id: "coinbase_oauth",
        label: "Coinbase via OAuth or CDP account key",
        target: "Coinbase portfolios, accounts, and balances.",
        status: "import-button-ready",
        current_app_support: hasCoinbaseSnapshot
          ? "Coinbase balances have been copied into Portfolio."
          : "The app can test a Coinbase read token/key and copy balances into Portfolio when you press Import.",
        production_gap:
          "Needs a Coinbase OAuth app, callback route, token storage, refresh handling, and scheduled read polling.",
        next_build_step:
          "Add Coinbase OAuth connect, store view-only tokens server-side, then poll accounts/balances into Portfolio.",
        safety_boundary:
          coinbase?.permission_scope ??
          "Read accounts and balances only. No transfers, wallet creation, or trading.",
        docs_url: "https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/guides/oauth-access",
      },
      {
        id: "zerion_wallets",
        label: "Web3 wallets via Zerion or Alchemy",
        target: "Public wallet addresses across EVM, Solana, and supported chains.",
        status: hasWalletSnapshot ? "import-button-ready" : "needs-read-provider",
        current_app_support: hasWalletSnapshot
          ? "Wallet holdings have been copied into Portfolio."
          : "The app can test a Zerion key plus public wallet address and copy positions into Portfolio when you press Import.",
        production_gap:
          "Needs saved public wallet addresses, read-provider keys, webhook/subscription creation, and reconciliation into Portfolio.",
        next_build_step:
          "Add a wallet watcher table, provider-key readiness checks, and event/poll reconciliation for token balances and DeFi positions.",
        safety_boundary:
          `${wallet?.permission_scope ?? "Public-address reads only."} No signing, transfers, private keys, or seed phrases.`,
        docs_url: "https://developers.zerion.io/introduction",
      },
      {
        id: "autonomous_wallet",
        label: "Master Mold autonomous wallet",
        target: "A separate risk bucket for paper/live-review trading, not the same thing as your personal holdings.",
        status: "locked-by-design",
        current_app_support:
          "The autonomous Autopilot lane paper-trades from its own capped wallet bucket. Live mode stays behind the evidence gate.",
        production_gap:
          "A real autonomous wallet would need separate custody design, signing policy, approval gates, audit logging, and kill switches.",
        next_build_step:
          "Keep it separate from personal integrations. Only revisit after read-only holdings are stable and reviewed.",
        safety_boundary:
          "No private keys or seed phrases in Settings. No transaction submission from this integration layer.",
        docs_url: "/trading",
      },
    ],
  };
}

export function buildInvestmentRealtimePlan({
  portfolio,
  integrations,
}: {
  portfolio: PortfolioJson;
  integrations: ReadonlyArray<InvestmentIntegrationContext>;
}): InvestmentRealtimePlan {
  const sources = [
    snapTradeRealtimeSource(portfolio, integrations),
    coinbaseRealtimeSource(portfolio, integrations),
    web3RealtimeSource(portfolio, integrations),
    autonomousRealtimeSource(),
  ];
  const hasSnapshot = portfolio.import_snapshot.count > 0;
  const hasWebhookReady = sources.some((source) => source.status === "webhook-ready");
  const hasRefreshReady = sources.some((source) => source.status === "ready-for-refresh" || source.status === "ready-for-polling");
  const hasRealtimeCapable = hasWebhookReady && hasRefreshReady;
  const status: InvestmentRealtimePlan["status"] = hasRealtimeCapable
    ? "realtime-capable"
    : hasWebhookReady
      ? "webhook-ready"
      : hasSnapshot
        ? "snapshot-watch"
        : "not-started";

  return {
    status,
    headline: realtimeHeadline(status),
    summary:
      "The practical realtime version is a read-only sync loop: refresh or poll account data, accept provider webhooks when a source finishes updating, update Portfolio, then let Today and chat read that fresh state.",
    readiness_boundary:
      status === "not-started"
        ? "Automatic updates are not live yet. Add read-only account credentials, a server-side credential vault or OAuth callback, and a webhook receiver before Zo should treat holdings as current."
        : "Realtime sync can update what Master Mold knows, but it does not unlock trading, transfers, signing, wallet mutation, private-key storage, or seed-phrase storage.",
    sources,
  };
}

function brokerageSource(
  portfolio: PortfolioJson,
  integrations: ReadonlyArray<InvestmentIntegrationContext>,
): InvestmentAwarenessSource {
  const importedCount = portfolio.imported_holdings.filter((holding) => holding.account.kind === "robinhood").length;
  const state = importedState(importedCount, portfolio.import_snapshot.is_stale);
  const integration = integrations.find((item) => item.service === "robinhood");

  return {
    id: "robinhood",
    label: "Robinhood and brokerages",
    current_state: state,
    coverage: "Brokerage positions through SnapTrade: stocks, ETFs, funds, options, crypto, and cash-like rows when the connected brokerage returns them.",
    app_can_do_now:
      importedCount > 0
        ? `${importedCount} brokerage holding${importedCount === 1 ? "" : "s"} are in Portfolio from the latest snapshot.`
        : "Test SnapTrade access and import brokerage holdings.",
    next_step:
      importedCount > 0
        ? "Import again before using Today as a current personal portfolio read."
        : "Connect Robinhood through SnapTrade, then press Import holdings.",
    safety_boundary:
      integration?.permission_scope ??
      "Read account positions only. Trading permission is ignored and no order endpoints are called.",
    docs_url: integration?.docs_url ?? "https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getAllAccountPositions",
  };
}

function coinbaseSource(
  portfolio: PortfolioJson,
  integrations: ReadonlyArray<InvestmentIntegrationContext>,
): InvestmentAwarenessSource {
  const importedCount = portfolio.imported_holdings.filter((holding) => holding.account.kind === "coinbase").length;
  const state = importedState(importedCount, portfolio.import_snapshot.is_stale);
  const integration = integrations.find((item) => item.service === "coinbase");

  return {
    id: "coinbase",
    label: "Coinbase",
    current_state: state,
    coverage: "Coinbase accounts and balances with view/read scope.",
    app_can_do_now:
      importedCount > 0
        ? `${importedCount} Coinbase balance${importedCount === 1 ? "" : "s"} are in Portfolio from the latest snapshot.`
        : "Test Coinbase account access and import balances as holdings.",
    next_step:
      importedCount > 0
        ? "Refresh the Coinbase snapshot when balances change."
        : "Use a view-only Coinbase key/JWT, then press Import holdings.",
    safety_boundary:
      integration?.permission_scope ??
      "Read accounts and balances only. No transfers, wallet creation, or trading.",
    docs_url: integration?.docs_url ?? "https://docs.cdp.coinbase.com/api-reference/v2/rest-api/accounts/list-accounts",
  };
}

function walletSource(
  portfolio: PortfolioJson,
  integrations: ReadonlyArray<InvestmentIntegrationContext>,
): InvestmentAwarenessSource {
  const importedCount = portfolio.imported_holdings.filter((holding) => holding.account.kind === "onchain_wallet").length;
  const state = importedState(importedCount, portfolio.import_snapshot.is_stale);
  const integration = integrations.find((item) => item.service === "onchain_wallet");

  return {
    id: "web3_wallet",
    label: "Web3 wallets",
    current_state: state,
    coverage: "Public wallet addresses through Zerion-style read providers.",
    app_can_do_now:
      importedCount > 0
        ? `${importedCount} wallet position${importedCount === 1 ? "" : "s"} are in Portfolio from the latest snapshot.`
        : "Add a public wallet address and a read-only provider key before wallet holdings can be trusted.",
    next_step:
      importedCount > 0
        ? "Refresh the wallet snapshot before using it for current exposure."
        : "Add wallet read credentials and import a snapshot.",
    safety_boundary:
      integration?.permission_scope ??
      "Reads public wallet positions only. It cannot sign transactions or move tokens.",
    docs_url: integration?.docs_url ?? "https://developers.zerion.io/api-reference/wallets/get-wallet-fungible-positions",
  };
}

function autonomousWalletSource(): InvestmentAwarenessSource {
  return {
    id: "autonomous_wallet",
    label: "Master Mold autonomous wallet",
    current_state: "paper-only",
    coverage: "The Autopilot lane's own paper ledger, decision trace, and gate-locked live wallet.",
    app_can_do_now:
      "Use the Autopilot paper record for rehearsal and risk review. Live money movement stays behind the go-live gate.",
    next_step:
      "Keep the autonomous wallet separate from brokerage and Coinbase holdings; use it as its own risk bucket if live gates are ever reviewed.",
    safety_boundary:
      "No seed phrases or private keys. Signing, transaction submission, and wallet mutation remain blocked unless a separate guarded signer is added later.",
    docs_url: "/trading",
  };
}

function importedState(count: number, isStale: boolean): InvestmentAwarenessSource["current_state"] {
  if (count <= 0) return "not-connected";
  return isStale ? "stale-snapshot" : "snapshot-ready";
}

function snapTradeRealtimeSource(
  portfolio: PortfolioJson,
  integrations: ReadonlyArray<InvestmentIntegrationContext>,
): InvestmentRealtimeSource {
  const importedCount = portfolio.imported_holdings.filter((holding) => holding.account.kind === "robinhood").length;
  const integration = integrations.find((item) => item.service === "robinhood");
  const status: InvestmentRealtimeSource["status"] =
    importedCount > 0
      ? "snapshot-ready"
      : integration?.status === "connected"
        ? "ready-for-refresh"
        : "needs-oauth";

  return {
    id: "snaptrade",
    label: "Robinhood and brokerages",
    mode: "manual-refresh-webhook",
    status,
    cadence:
      "Refresh on demand before decisions; SnapTrade then sends ACCOUNT_HOLDINGS_UPDATED after queued account sync completes.",
    trigger:
      "Call the SnapTrade connection refresh endpoint, wait for the ACCOUNT_HOLDINGS_UPDATED webhook, then pull positions, options, and balances.",
    next_step:
      status === "needs-oauth"
        ? "Add SnapTrade OAuth or server-held user credentials before background refresh can run."
        : "Add the webhook receiver and reconcile refreshed holdings into Portfolio.",
    safety_boundary:
      integration?.permission_scope ??
      "Read account positions only. Master Mold must not call brokerage order endpoints.",
    app_path: "/settings#portfolio-connections",
    docs_url: "https://docs.snaptrade.com/docs/realtime-data",
  };
}

function coinbaseRealtimeSource(
  portfolio: PortfolioJson,
  integrations: ReadonlyArray<InvestmentIntegrationContext>,
): InvestmentRealtimeSource {
  const importedCount = portfolio.imported_holdings.filter((holding) => holding.account.kind === "coinbase").length;
  const integration = integrations.find((item) => item.service === "coinbase");
  const status: InvestmentRealtimeSource["status"] =
    importedCount > 0
      ? "snapshot-ready"
      : integration?.status === "connected"
        ? "ready-for-polling"
        : "needs-read-key";

  return {
    id: "coinbase",
    label: "Coinbase",
    mode: "read-polling",
    status,
    cadence:
      "Poll accounts, balances, and read-only transactions on a short interval; use webhooks only where the selected Coinbase product supports the needed event.",
    trigger:
      "Use view/read scopes for balances and transaction history, then update Portfolio when balances or new transactions change the account view.",
    next_step:
      status === "needs-read-key"
        ? "Add a view-only Coinbase key or OAuth flow; do not request trade or transfer scope."
        : "Add a background read job and reconcile balance deltas into Portfolio.",
    safety_boundary:
      integration?.permission_scope ??
      "Read Coinbase accounts, balances, and transactions only. No transfer or trading scope.",
    app_path: "/settings#portfolio-connections",
    docs_url: "https://docs.cdp.coinbase.com/coinbase-app/track-apis/transactions",
  };
}

function web3RealtimeSource(
  portfolio: PortfolioJson,
  integrations: ReadonlyArray<InvestmentIntegrationContext>,
): InvestmentRealtimeSource {
  const importedCount = portfolio.imported_holdings.filter((holding) => holding.account.kind === "onchain_wallet").length;
  const integration = integrations.find((item) => item.service === "onchain_wallet");
  const status: InvestmentRealtimeSource["status"] =
    importedCount > 0 ? "webhook-ready" : "needs-provider-key";

  return {
    id: "web3_wallet",
    label: "Web3 wallets",
    mode: "webhook-websocket",
    status,
    cadence:
      "Event-driven wallet updates through public-address webhooks or WebSockets, plus periodic balance reconciliation.",
    trigger:
      "Watch public wallet addresses for transfers, swaps, token balance changes, and transaction events from the read provider.",
    next_step:
      status === "needs-provider-key"
        ? "Add public wallet addresses and a read-only provider key before event subscriptions can be created."
        : "Create wallet event subscriptions and reconcile events into Portfolio.",
    safety_boundary:
      `Public-address reads only. ${integration?.permission_scope ?? "No signing, token movement, transaction submission, private keys, or seed phrases."}`,
    app_path: "/settings#web3-wallet-trading",
    docs_url: "https://www.helius.dev/docs/webhooks",
  };
}

function autonomousRealtimeSource(): InvestmentRealtimeSource {
  return {
    id: "autonomous_wallet",
    label: "Master Mold autonomous wallet",
    mode: "paper-only",
    status: "paper-only",
    cadence:
      "Paper/read-only telemetry can refresh, but autonomous live money movement stays locked behind separate review.",
    trigger:
      "Use trading cockpit paper state, route checks, and wallet accounting as rehearsal inputs only.",
    next_step:
      "Keep this separate from imported personal investments; do not store signing material in the app.",
    safety_boundary:
      "No private keys or seed phrases. Signing and transaction submission remain blocked.",
    app_path: "/trading",
    docs_url: "/trading",
  };
}

function realtimeHeadline(status: InvestmentRealtimePlan["status"]) {
  if (status === "realtime-capable") return "Realtime sync is ready to wire once server credentials and webhooks are installed.";
  if (status === "webhook-ready") return "Web3 wallet events can become realtime first; broker and Coinbase refresh still need server setup.";
  if (status === "snapshot-watch") return "Imported snapshots exist, but realtime refresh still needs background sync wiring.";
  if (status === "locked") return "Realtime sync is locked until read-only credentials and webhook safety gates exist.";
  return "Realtime investment awareness is designed, but not active yet.";
}

function investmentAwarenessHeadline(status: InvestmentAwarenessSummary["status"]) {
  if (status === "snapshot-fresh") return "Master Mold can use imported holdings snapshots for today's read.";
  if (status === "snapshot-stale") return "Master Mold has imported holdings, but they need a refresh before current decisions.";
  if (status === "manual-only") return "Master Mold can use local manual holdings, but no account snapshot is connected yet.";
  return "Master Mold is still using sample holdings until you add or import account data.";
}

function dailyDecisionBoundary(status: InvestmentAwarenessSummary["status"]) {
  if (status === "snapshot-fresh") {
    return "Daily ideas may reference imported exposure, concentration, and account labels, but they remain advisory and cannot trade.";
  }
  if (status === "snapshot-stale") {
    return "Daily ideas must treat imported positions as stale until you refresh the snapshot.";
  }
  if (status === "manual-only") {
    return "Daily ideas may use manually entered holdings, not live account balances.";
  }
  return "Daily ideas must disclose that portfolio holdings are sample data and not personal account visibility.";
}

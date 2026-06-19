export type Web3SignerSetupMode =
  | "external-wallet"
  | "privy-server-wallet"
  | "turnkey-policy-wallet"
  | "session-key-vault";

export type Web3CredentialsSetupRequest = {
  provider?: "helius" | "custom-rpc";
  helius_api_key?: string;
  rpc_url?: string;
  ws_url?: string;
  jupiter_api_key?: string;
  wallet_public_key?: string;
  signer_mode?: Web3SignerSetupMode;
  max_trade_usd?: number;
  daily_spend_cap_usd?: number;
  max_slippage_bps?: number;
  require_manual_confirmation?: boolean;
  test_mode?: "network" | "validate-only";
};

export type Web3CredentialsSetupCheck = {
  id:
    | "rpc-url"
    | "rpc-health"
    | "wallet"
    | "wallet-balance"
    | "wallet-assets"
    | "jupiter-quote"
    | "jupiter-order"
    | "risk-policy"
    | "signer-mode"
    | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export type Web3CredentialLevel = {
  id: "read-only-sync" | "dry-run-rehearsal" | "supervised-live" | "autonomous-live";
  label: string;
  status: "ready" | "partial" | "blocked";
  unlocks: string;
  required_inputs: string[];
  missing_inputs: string[];
  storage_rule: string;
  boundary: string;
  next_action: string;
};

export type Web3CredentialPlanItem = {
  id:
    | "helius-api-key"
    | "solana-rpc-url"
    | "solana-websocket-url"
    | "jupiter-api-key"
    | "wallet-public-key"
    | "signer-provider"
    | "risk-caps"
    | "manual-approval"
    | "private-key"
    | "live-execution-flags";
  label: string;
  status: "ready" | "missing" | "optional" | "blocked" | "future";
  storage: "server-env" | "session-only" | "browser-non-secret" | "never-store" | "future-vault";
  detail: string;
};

export type Web3CredentialPlan = {
  mode: "web3-credential-vault-plan";
  status: "ready-for-read-only" | "ready-for-dry-run" | "blocked";
  active_level: Web3CredentialLevel["id"];
  levels: Web3CredentialLevel[];
  items: Web3CredentialPlanItem[];
  summary: string;
  next_action: string;
  controls: string[];
};

export type Web3ProviderAccountRunwayItem = {
  id:
    | "helius-read-rail"
    | "jupiter-execution-rail"
    | "dexscreener-discovery"
    | "birdeye-discovery"
    | "pumpfun-launch-feed"
    | "yellowstone-grpc-stream"
    | "dedicated-trading-wallet"
    | "external-signer"
    | "emergency-stop"
    | "tax-ledger";
  label: string;
  lane: "read-data" | "market-discovery" | "execution" | "custody" | "operations" | "accounting";
  priority: "required-now" | "next" | "later";
  status: "configured" | "needed" | "optional" | "future" | "blocked";
  account_action: string;
  storage_rule: string;
  unlocks: string;
  next_action: string;
};

export type Web3ProviderAccountRunway = {
  mode: "web3-provider-account-runway";
  status: "dry-run-ready" | "read-rail-ready" | "needs-provider-accounts" | "live-blocked";
  primary_stack: string[];
  required_account_count: number;
  configured_required_count: number;
  optional_account_count: number;
  configured_optional_count: number;
  missing_required: string[];
  items: Web3ProviderAccountRunwayItem[];
  summary: string;
  next_action: string;
  controls: string[];
};

export type Web3CredentialsSetupReadiness = {
  mode: "web3-credentials-setup-readiness";
  status: "configured" | "partial" | "blocked";
  readiness_score: number;
  provider: "helius" | "custom-rpc";
  rpc_endpoint: string | null;
  websocket_endpoint: string | null;
  rpc_configured: boolean;
  websocket_configured: boolean;
  rpc_healthy: boolean;
  wallet_public_key: string | null;
  wallet_valid: boolean;
  wallet_balance_sol: number | null;
  wallet_asset_count: number | null;
  wallet_fungible_asset_count: number | null;
  wallet_priced_asset_count: number | null;
  wallet_priced_value_usd: number | null;
  helius_das_ready: boolean;
  jupiter_configured: boolean;
  jupiter_quote_ready: boolean;
  jupiter_order_ready: boolean;
  signer_mode: Web3SignerSetupMode;
  require_manual_confirmation: boolean;
  max_trade_usd: number;
  daily_spend_cap_usd: number;
  max_slippage_bps: number;
  can_support_readonly_wallet_sync: boolean;
  can_support_wallet_asset_snapshot: boolean;
  can_support_route_order_rehearsal: boolean;
  can_support_manual_live_review: boolean;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  summary: string;
  next_action: string;
  blockers: string[];
  checks: Web3CredentialsSetupCheck[];
  credential_plan: Web3CredentialPlan;
  provider_account_runway: Web3ProviderAccountRunway;
  controls: string[];
  env_targets: string[];
};

type Web3CredentialsNetworkEvidence = {
  rpc_healthy?: boolean;
  rpc_detail?: string;
  wallet_balance_sol?: number | null;
  wallet_balance_detail?: string;
  wallet_asset_count?: number | null;
  wallet_fungible_asset_count?: number | null;
  wallet_priced_asset_count?: number | null;
  wallet_priced_value_usd?: number | null;
  wallet_assets_detail?: string;
  helius_das_ready?: boolean;
  jupiter_quote_ready?: boolean;
  jupiter_quote_detail?: string;
  jupiter_order_ready?: boolean;
  jupiter_order_detail?: string;
};

export function buildWeb3CredentialsSetupReadiness(
  request: Web3CredentialsSetupRequest,
  evidence: Web3CredentialsNetworkEvidence = {},
): Web3CredentialsSetupReadiness {
  const provider = request.provider === "custom-rpc" ? "custom-rpc" : "helius";
  const heliusApiKey = text(request.helius_api_key) || text(process.env.HELIUS_API_KEY);
  const rpcUrl = normalizeRpcUrl(request.rpc_url, provider, heliusApiKey) ?? normalizeRpcUrl(process.env.SOLANA_RPC_URL, "custom-rpc", "") ?? null;
  const wsUrl = normalizeWebsocketUrl(request.ws_url, provider, heliusApiKey) ?? normalizeWebsocketUrl(process.env.SOLANA_WS_URL, "custom-rpc", "") ?? null;
  const walletPublicKey = normalizeWallet(request.wallet_public_key);
  const walletValid = Boolean(walletPublicKey && isLikelySolanaPublicKey(walletPublicKey));
  const jupiterConfigured = Boolean(text(request.jupiter_api_key) || process.env.JUPITER_API_KEY);
  const birdeyeConfigured = Boolean(text(process.env.BIRDEYE_API_KEY));
  const pumpfunFeedConfigured = Boolean(text(process.env.PUMPFUN_FEED_URL) || text(process.env.PUMP_FUN_FEED_URL));
  const yellowstoneConfigured = Boolean(text(process.env.YELLOWSTONE_GRPC_ENDPOINT) || text(process.env.YELLOWSTONE_GRPC_TOKEN));
  const emergencyStopConfigured = Boolean(text(process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL) || text(process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT));
  const taxLedgerConfigured = Boolean(text(process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH));
  const signerMode = normalizeSignerMode(request.signer_mode);
  const maxTradeUsd = boundedNumber(request.max_trade_usd, 250, 1, 1_000_000);
  const dailySpendCapUsd = boundedNumber(request.daily_spend_cap_usd, 1_000, 1, 10_000_000);
  const maxSlippageBps = boundedInteger(request.max_slippage_bps, 150, 1, 2_500);
  const requireManualConfirmation = request.require_manual_confirmation !== false;
  const rpcHealthy = evidence.rpc_healthy === true;
  const jupiterQuoteReady = evidence.jupiter_quote_ready === true;
  const jupiterOrderReady = evidence.jupiter_order_ready === true;
  const checks = credentialSetupChecks({
    rpcUrl,
    wsUrl,
    rpcHealthy,
    rpcDetail: evidence.rpc_detail,
    walletPublicKey,
    walletValid,
    walletBalanceSol: evidence.wallet_balance_sol ?? null,
    walletBalanceDetail: evidence.wallet_balance_detail,
    walletAssetCount: evidence.wallet_asset_count ?? null,
    walletFungibleAssetCount: evidence.wallet_fungible_asset_count ?? null,
    walletPricedAssetCount: evidence.wallet_priced_asset_count ?? null,
    walletPricedValueUsd: evidence.wallet_priced_value_usd ?? null,
    walletAssetsDetail: evidence.wallet_assets_detail,
    heliusDasReady: evidence.helius_das_ready === true,
    jupiterConfigured,
    jupiterQuoteReady,
    jupiterQuoteDetail: evidence.jupiter_quote_detail,
    jupiterOrderReady,
    jupiterOrderDetail: evidence.jupiter_order_detail,
    signerMode,
    maxTradeUsd,
    dailySpendCapUsd,
    maxSlippageBps,
    requireManualConfirmation,
  });
  const blockers = checks.filter((check) => check.status === "fail").map((check) => check.detail);
  const readinessScore = Math.round(checks.reduce((sum, check) => sum + checkScore(check.status), 0) / checks.length);
  const canSupportReadonlyWalletSync = Boolean(rpcUrl && rpcHealthy && walletValid);
  const canSupportWalletAssetSnapshot = canSupportReadonlyWalletSync && evidence.helius_das_ready === true;
  const canSupportRouteOrderRehearsal = Boolean(rpcUrl && rpcHealthy && walletValid && jupiterQuoteReady);
  const canSupportManualLiveReview = Boolean(
    canSupportRouteOrderRehearsal &&
    jupiterConfigured &&
    jupiterOrderReady &&
    requireManualConfirmation &&
    dailySpendCapUsd >= maxTradeUsd &&
    maxSlippageBps <= 250,
  );
  const status: Web3CredentialsSetupReadiness["status"] = blockers.length > 0
    ? "blocked"
    : canSupportManualLiveReview
      ? "configured"
      : "partial";
  const credentialPlan = buildCredentialPlan({
    status,
    rpcUrl,
    wsUrl,
    heliusApiKey,
    walletValid,
    walletPublicKey,
    jupiterConfigured,
    signerMode,
    requireManualConfirmation,
    dailySpendCapUsd,
    maxTradeUsd,
    maxSlippageBps,
    canSupportReadonlyWalletSync,
    canSupportWalletAssetSnapshot,
    canSupportRouteOrderRehearsal,
    canSupportManualLiveReview,
  });
  const providerAccountRunway = buildProviderAccountRunway({
    heliusApiKey,
    rpcUrl,
    wsUrl,
    walletValid,
    jupiterConfigured,
    signerMode,
    requireManualConfirmation,
    canSupportReadonlyWalletSync,
    canSupportRouteOrderRehearsal,
    birdeyeConfigured,
    pumpfunFeedConfigured,
    yellowstoneConfigured,
    emergencyStopConfigured,
    taxLedgerConfigured,
  });

  return {
    mode: "web3-credentials-setup-readiness",
    status,
    readiness_score: readinessScore,
    provider,
    rpc_endpoint: rpcUrl ? redactEndpoint(rpcUrl) : null,
    websocket_endpoint: wsUrl ? redactEndpoint(wsUrl) : null,
    rpc_configured: Boolean(rpcUrl),
    websocket_configured: Boolean(wsUrl),
    rpc_healthy: rpcHealthy,
    wallet_public_key: walletPublicKey,
    wallet_valid: walletValid,
    wallet_balance_sol: evidence.wallet_balance_sol ?? null,
    wallet_asset_count: evidence.wallet_asset_count ?? null,
    wallet_fungible_asset_count: evidence.wallet_fungible_asset_count ?? null,
    wallet_priced_asset_count: evidence.wallet_priced_asset_count ?? null,
    wallet_priced_value_usd: evidence.wallet_priced_value_usd ?? null,
    helius_das_ready: evidence.helius_das_ready === true,
    jupiter_configured: jupiterConfigured,
    jupiter_quote_ready: jupiterQuoteReady,
    jupiter_order_ready: jupiterOrderReady,
    signer_mode: signerMode,
    require_manual_confirmation: requireManualConfirmation,
    max_trade_usd: maxTradeUsd,
    daily_spend_cap_usd: dailySpendCapUsd,
    max_slippage_bps: maxSlippageBps,
    can_support_readonly_wallet_sync: canSupportReadonlyWalletSync,
    can_support_wallet_asset_snapshot: canSupportWalletAssetSnapshot,
    can_support_route_order_rehearsal: canSupportRouteOrderRehearsal,
    can_support_manual_live_review: canSupportManualLiveReview,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    summary: credentialSetupSummary(status, readinessScore, canSupportRouteOrderRehearsal, canSupportManualLiveReview),
    next_action: credentialSetupNextAction(status, checks),
    blockers: blockers.slice(0, 6),
    checks,
    credential_plan: credentialPlan,
    provider_account_runway: providerAccountRunway,
    controls: [
      "Credential setup validates provider, wallet, route, and risk-policy readiness only; it never signs, submits, stores private keys, or moves funds.",
      "API keys are accepted only as test inputs or server environment values and are never returned in the response.",
      "Manual live review remains required even when every setup check passes.",
    ],
    env_targets: [
      "HELIUS_API_KEY",
      "SOLANA_RPC_URL",
      "SOLANA_WS_URL",
      "JUPITER_API_KEY",
      "BIRDEYE_API_KEY",
      "PUMPFUN_FEED_URL",
      "YELLOWSTONE_GRPC_ENDPOINT",
      "YELLOWSTONE_GRPC_TOKEN",
      "MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL",
      "MASTERMOLD_EMERGENCY_STOP_CONTACT",
      "MASTERMOLD_TAX_LEDGER_EXPORT_PATH",
      "MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER",
      "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
      "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
    ],
  };
}

function buildProviderAccountRunway(input: {
  heliusApiKey: string;
  rpcUrl: string | null;
  wsUrl: string | null;
  walletValid: boolean;
  jupiterConfigured: boolean;
  signerMode: Web3SignerSetupMode;
  requireManualConfirmation: boolean;
  canSupportReadonlyWalletSync: boolean;
  canSupportRouteOrderRehearsal: boolean;
  birdeyeConfigured: boolean;
  pumpfunFeedConfigured: boolean;
  yellowstoneConfigured: boolean;
  emergencyStopConfigured: boolean;
  taxLedgerConfigured: boolean;
}): Web3ProviderAccountRunway {
  const heliusConfigured = Boolean(input.heliusApiKey || isHeliusEndpoint(input.rpcUrl ?? ""));
  const externalSignerReady = input.signerMode === "external-wallet" && input.requireManualConfirmation;
  const items: Web3ProviderAccountRunwayItem[] = [
    {
      id: "helius-read-rail",
      label: "Helius read rail",
      lane: "read-data",
      priority: "required-now",
      status: heliusConfigured || input.rpcUrl ? "configured" : "needed",
      account_action: "Create or use a Helius account, then place HELIUS_API_KEY in the ignored server environment.",
      storage_rule: "Server env or one-shot session input only; never render the key back to the browser.",
      unlocks: "Solana RPC, wallet balance, DAS asset visibility, signature history, and decoded wallet activity context.",
      next_action: heliusConfigured || input.rpcUrl
        ? "Run the network credential test and keep Helius as the primary read provider."
        : "Add HELIUS_API_KEY or a custom Solana RPC URL before wallet intelligence can be trusted.",
    },
    {
      id: "jupiter-execution-rail",
      label: "Jupiter execution rail",
      lane: "execution",
      priority: "required-now",
      status: input.jupiterConfigured ? "configured" : "needed",
      account_action: "Provision a Jupiter API key for quote and unsigned Swap V2 order rehearsal.",
      storage_rule: "Server env or one-shot session input only.",
      unlocks: "Route proof, cost checks, unsigned order rehearsal, and later signer-bound swap envelopes.",
      next_action: input.jupiterConfigured
        ? "Run quote/order rehearsal and keep live submission blocked."
        : "Add JUPITER_API_KEY before the app can prove the order-rehearsal rail.",
    },
    {
      id: "dedicated-trading-wallet",
      label: "Dedicated trading wallet",
      lane: "custody",
      priority: "required-now",
      status: input.walletValid ? "configured" : "needed",
      account_action: "Create a dedicated Solana trading wallet and enter only its public address here.",
      storage_rule: "Public address may be saved as browser non-secret state; private key and seed phrase are never accepted.",
      unlocks: "Read-only wallet accounting, wallet-aware risk caps, and later external-wallet approval scope.",
      next_action: input.walletValid
        ? "Keep this wallet scoped for read-only monitoring and dry-run rehearsal."
        : "Enter a public Solana wallet address before account-specific reads can run.",
    },
    {
      id: "external-signer",
      label: "Manual external signer",
      lane: "custody",
      priority: "next",
      status: externalSignerReady ? "configured" : "needed",
      account_action: "Use a wallet/provider approval surface for the first supervised live review; do not paste signer secrets into Master Mold.",
      storage_rule: "Signer credentials stay outside the app in the wallet/provider policy surface.",
      unlocks: "Human-reviewed signature prompts for a future one-off supervised live path.",
      next_action: externalSignerReady
        ? "Keep manual approval required until an audited policy signer is chosen."
        : "Switch signer mode to manual external wallet and require manual approval for first live review.",
    },
    {
      id: "dexscreener-discovery",
      label: "DEX Screener discovery",
      lane: "market-discovery",
      priority: "next",
      status: "optional",
      account_action: "Use public DEX Screener discovery as a low-friction fallback; evaluate paid/API terms before production dependence.",
      storage_rule: "No secret required for public reads; any paid key should live in server env.",
      unlocks: "Pair discovery, trending-token context, liquidity checks, and cross-provider sanity checks.",
      next_action: "Keep as a secondary discovery lane behind Helius/Jupiter-backed wallet and route evidence.",
    },
    {
      id: "birdeye-discovery",
      label: "Birdeye market feed",
      lane: "market-discovery",
      priority: "later",
      status: input.birdeyeConfigured ? "configured" : "future",
      account_action: "Provision only after the paper loop proves it needs paid trend, volume, or wallet-flow coverage.",
      storage_rule: "Server env secret if added.",
      unlocks: "Higher-coverage market ranking, token profiles, and historical trend enrichment.",
      next_action: input.birdeyeConfigured
        ? "Keep Birdeye as an enrichment lane; Helius/Jupiter remain the required execution rehearsal stack."
        : "Defer until the current Helius/Jupiter dry-run rail is green.",
    },
    {
      id: "pumpfun-launch-feed",
      label: "Pump.fun launch feed",
      lane: "market-discovery",
      priority: "later",
      status: input.pumpfunFeedConfigured ? "configured" : "future",
      account_action: "Select a supported launch-feed source before building a production sniping worker.",
      storage_rule: "Server env secret if the selected provider requires one.",
      unlocks: "Launch timing, bonding-curve and migration context, and first-buyer source evidence.",
      next_action: input.pumpfunFeedConfigured
        ? "Use the configured launch feed only as read-only market evidence until route and signer gates pass."
        : "Research and choose the concrete launch feed after read-only wallet and route evidence are stable.",
    },
    {
      id: "yellowstone-grpc-stream",
      label: "Yellowstone gRPC stream",
      lane: "read-data",
      priority: "later",
      status: input.yellowstoneConfigured ? "configured" : input.wsUrl ? "optional" : "future",
      account_action: "Add only when the local paper daemon needs lower-latency subscription evidence than HTTP polling.",
      storage_rule: "Server env endpoint/token only.",
      unlocks: "Low-latency program/account subscriptions for production monitoring workers.",
      next_action: input.yellowstoneConfigured
        ? "Keep gRPC as a read-only stream candidate; do not grant signing or custody from stream evidence."
        : input.wsUrl
        ? "Use WebSocket first; defer gRPC until latency tests show a need."
        : "Defer until the supervised worker exists.",
    },
    {
      id: "emergency-stop",
      label: "Emergency stop ops",
      lane: "operations",
      priority: "next",
      status: input.emergencyStopConfigured ? "configured" : "blocked",
      account_action: "Define the external kill-switch owner, alert channel, and revocation process before any live executor is enabled.",
      storage_rule: "Server-side ops policy and audited environment flags; never browser-only.",
      unlocks: "Fail-closed live-review posture and operator intervention during stuck or unsafe trading loops.",
      next_action: input.emergencyStopConfigured
        ? "Drill the emergency stop before any supervised live review."
        : "Implement and review this before supervised live trading.",
    },
    {
      id: "tax-ledger",
      label: "Tax/accounting ledger",
      lane: "accounting",
      priority: "later",
      status: input.taxLedgerConfigured ? "configured" : "future",
      account_action: "Choose the export/accounting workflow before real fills are mirrored as authoritative records.",
      storage_rule: "Persist only reviewed transaction/fill/tax evidence; never store private keys.",
      unlocks: "Cost-basis, realized PnL, fees, and audit exports for real trades.",
      next_action: input.taxLedgerConfigured
        ? "Use the ledger path only after confirmed settlement and reviewed fill reconciliation."
        : "Defer until settlement reconciliation is complete for supervised fills.",
    },
  ];
  const requiredNow = items.filter((item) => item.priority === "required-now");
  const optionalOrLater = items.filter((item) => item.priority !== "required-now");
  const missingRequired = requiredNow
    .filter((item) => item.status !== "configured")
    .map((item) => item.label);
  const status: Web3ProviderAccountRunway["status"] = input.canSupportRouteOrderRehearsal
    ? "dry-run-ready"
    : input.canSupportReadonlyWalletSync
      ? "read-rail-ready"
      : missingRequired.length > 0
        ? "needs-provider-accounts"
        : "live-blocked";

  return {
    mode: "web3-provider-account-runway",
    status,
    primary_stack: [
      "Helius/Solana RPC for read-only chain and wallet intelligence",
      "Jupiter for quote and unsigned order rehearsal",
      "Dedicated Solana trading wallet with manual external-wallet approval first",
      "DEX Screener/public discovery as fallback market context before paid feed expansion",
    ],
    required_account_count: requiredNow.length,
    configured_required_count: requiredNow.length - missingRequired.length,
    optional_account_count: optionalOrLater.length,
    configured_optional_count: optionalOrLater.filter((item) => item.status === "configured").length,
    missing_required: missingRequired,
    items,
    summary: providerAccountRunwaySummary(status, missingRequired),
    next_action: providerAccountRunwayNextAction(status, items),
    controls: [
      "This runway tracks external accounts and provider setup; it does not create third-party accounts or transmit credentials by itself.",
      "Only public wallet addresses and non-secret risk preferences may be persisted in the browser.",
      "Private keys, seed phrases, signed transactions, custody authority, and live execution remain blocked.",
    ],
  };
}

function buildCredentialPlan(input: {
  status: Web3CredentialsSetupReadiness["status"];
  rpcUrl: string | null;
  wsUrl: string | null;
  heliusApiKey: string;
  walletValid: boolean;
  walletPublicKey: string | null;
  jupiterConfigured: boolean;
  signerMode: Web3SignerSetupMode;
  requireManualConfirmation: boolean;
  dailySpendCapUsd: number;
  maxTradeUsd: number;
  maxSlippageBps: number;
  canSupportReadonlyWalletSync: boolean;
  canSupportWalletAssetSnapshot: boolean;
  canSupportRouteOrderRehearsal: boolean;
  canSupportManualLiveReview: boolean;
}): Web3CredentialPlan {
  const riskCapsReady = input.dailySpendCapUsd >= input.maxTradeUsd && input.maxSlippageBps <= 250;
  const readOnlyMissing = [
    !input.rpcUrl ? "Helius API key or Solana RPC URL" : null,
    !input.walletValid ? "Solana wallet public address" : null,
  ].filter((item): item is string => Boolean(item));
  const dryRunMissing = [
    ...readOnlyMissing,
    !input.jupiterConfigured ? "Jupiter API key for Swap V2 order rehearsal" : null,
    !riskCapsReady ? "Conservative risk caps" : null,
  ].filter((item): item is string => Boolean(item));
  const supervisedMissing = [
    ...dryRunMissing,
    input.signerMode !== "external-wallet" ? "Manual external wallet signer for first live review" : null,
    !input.requireManualConfirmation ? "Manual approval required toggle" : null,
    "Reviewed live executor and kill-switch operations",
  ].filter((item): item is string => Boolean(item));
  const autonomousMissing = [
    ...supervisedMissing,
    "Policy signer or audited session-key vault",
    "Production worker supervision and alerting",
    "Long-horizon positive paper proof after fees and failed fills",
    "Legal, tax, and operational review",
  ];
  const activeLevel: Web3CredentialLevel["id"] = input.canSupportRouteOrderRehearsal
    ? "dry-run-rehearsal"
    : input.canSupportReadonlyWalletSync
      ? "read-only-sync"
      : "read-only-sync";
  const planStatus: Web3CredentialPlan["status"] = input.canSupportRouteOrderRehearsal
    ? "ready-for-dry-run"
    : input.canSupportReadonlyWalletSync
      ? "ready-for-read-only"
      : "blocked";

  const levels: Web3CredentialLevel[] = [
    {
      id: "read-only-sync",
      label: "Read-only wallet sync",
      status: readOnlyMissing.length === 0 && input.canSupportReadonlyWalletSync ? "ready" : readOnlyMissing.length < 2 ? "partial" : "blocked",
      unlocks: "RPC health, wallet balance, recent signature history, and aggregate Helius asset visibility.",
      required_inputs: ["Helius API key or Solana RPC URL", "Solana wallet public address"],
      missing_inputs: readOnlyMissing,
      storage_rule: "Provider secrets belong in server env or one-shot session input; the wallet address may be saved as non-secret browser state.",
      boundary: "Read-only chain calls only; no signing, no transaction bodies, no wallet mutation.",
      next_action: readOnlyMissing[0] ?? "Run the network credential test and confirm wallet balance/assets are visible.",
    },
    {
      id: "dry-run-rehearsal",
      label: "Dry-run order rehearsal",
      status: input.canSupportRouteOrderRehearsal && riskCapsReady ? "ready" : dryRunMissing.length < 3 ? "partial" : "blocked",
      unlocks: "Jupiter quote proof, unsigned order rehearsal, route/cost checks, and dry-run execution profile.",
      required_inputs: ["Read-only wallet sync", "Jupiter API key", "Max trade", "Daily cap", "Max slippage"],
      missing_inputs: dryRunMissing,
      storage_rule: "Jupiter keys stay in server env or session-only form input; risk caps and wallet scope may be saved locally.",
      boundary: "Unsigned rehearsal only; live submission and external signer handoff remain blocked.",
      next_action: dryRunMissing[0] ?? "Apply the dry-run profile and run the Web3 landing drill.",
    },
    {
      id: "supervised-live",
      label: "Supervised live review",
      status: "blocked",
      unlocks: "A human-reviewed signer prompt and one-off live executor review after proof gates pass.",
      required_inputs: ["Dry-run order rehearsal", "Manual external wallet signer", "Reviewed executor ops", "Emergency stop"],
      missing_inputs: supervisedMissing,
      storage_rule: "No private keys in the app; signer credentials must live in the wallet/provider policy surface, not browser storage.",
      boundary: "Still blocked in this app until a separate manual live review deliberately enables an executor.",
      next_action: "Finish dry-run evidence, signer policy, worker supervision, and manual live review before any real-capital path.",
    },
    {
      id: "autonomous-live",
      label: "Autonomous live trading",
      status: "blocked",
      unlocks: "Fully autonomous real-capital trading only after audited custody, ops, and profit proof.",
      required_inputs: ["Policy signer", "Production supervisor", "Out-of-sample profit proof", "Legal/tax review"],
      missing_inputs: autonomousMissing,
      storage_rule: "Use an audited signer/provider vault with policy limits; never store seed phrases or private keys in Master Mold.",
      boundary: "Not enabled. Paper autonomy can keep running while real-capital autonomy stays locked.",
      next_action: "Keep compounding only in paper until signer, settlement, accounting, and operational proof are externally reviewed.",
    },
  ];

  const items: Web3CredentialPlanItem[] = [
    {
      id: "helius-api-key",
      label: "Helius API key",
      status: input.heliusApiKey || isHeliusEndpoint(input.rpcUrl ?? "") ? "ready" : "missing",
      storage: "server-env",
      detail: input.heliusApiKey
        ? "Configured for deriving read-only mainnet RPC/WebSocket endpoints; the key is never returned to the browser."
        : "Needed for the preferred Solana read rail, DAS asset snapshots, and wallet activity reads.",
    },
    {
      id: "solana-rpc-url",
      label: "Solana RPC URL",
      status: input.rpcUrl ? "ready" : "missing",
      storage: input.heliusApiKey ? "server-env" : "session-only",
      detail: input.rpcUrl ? `Resolved as ${redactEndpoint(input.rpcUrl)}.` : "Provide a Helius key or a custom RPC endpoint.",
    },
    {
      id: "solana-websocket-url",
      label: "Solana WebSocket URL",
      status: input.wsUrl ? "ready" : "optional",
      storage: input.heliusApiKey ? "server-env" : "session-only",
      detail: input.wsUrl ? `Resolved as ${redactEndpoint(input.wsUrl)}.` : "Optional for later live subscription workers; current setup can proceed with HTTP RPC.",
    },
    {
      id: "jupiter-api-key",
      label: "Jupiter API key",
      status: input.jupiterConfigured ? "ready" : "missing",
      storage: "server-env",
      detail: input.jupiterConfigured
        ? "Configured for Swap V2 order rehearsal; the key is not returned in API responses."
        : "Required before unsigned Swap V2 order rehearsal can be armed.",
    },
    {
      id: "wallet-public-key",
      label: "Wallet public address",
      status: input.walletValid ? "ready" : input.walletPublicKey ? "blocked" : "missing",
      storage: "browser-non-secret",
      detail: input.walletValid ? "Public address is valid-looking and can be saved as non-secret scope." : "Enter a Solana public address only.",
    },
    {
      id: "signer-provider",
      label: "Signer provider",
      status: input.signerMode === "external-wallet" ? "ready" : "future",
      storage: "future-vault",
      detail: input.signerMode === "external-wallet"
        ? "Manual external wallet is the first reviewed live posture."
        : `${input.signerMode.replaceAll("-", " ")} needs separate provider policy review before use.`,
    },
    {
      id: "risk-caps",
      label: "Risk caps",
      status: riskCapsReady ? "ready" : "blocked",
      storage: "browser-non-secret",
      detail: `$${input.maxTradeUsd.toLocaleString()} max trade, $${input.dailySpendCapUsd.toLocaleString()} daily cap, ${input.maxSlippageBps} bps max slippage.`,
    },
    {
      id: "manual-approval",
      label: "Manual approval",
      status: input.requireManualConfirmation ? "ready" : "blocked",
      storage: "browser-non-secret",
      detail: input.requireManualConfirmation ? "Required before any live review." : "Turn manual approval back on before live review.",
    },
    {
      id: "private-key",
      label: "Private key / seed phrase",
      status: "blocked",
      storage: "never-store",
      detail: "Never enter or store private keys, seed phrases, or raw signer secrets in this app.",
    },
    {
      id: "live-execution-flags",
      label: "Live execution flags",
      status: "blocked",
      storage: "server-env",
      detail: "Keep live execution flags unset until a separate manual live review approves an executor.",
    },
  ];

  return {
    mode: "web3-credential-vault-plan",
    status: planStatus,
    active_level: activeLevel,
    levels,
    items,
    summary: credentialPlanSummary(planStatus, input.canSupportWalletAssetSnapshot),
    next_action: levels.find((level) => level.id === activeLevel)?.next_action ?? "Start with read-only wallet sync.",
    controls: [
      "The app can save only non-secret wallet/risk preferences in browser storage.",
      "Provider API keys must stay in server env or one-shot session input.",
      "Private keys, seed phrases, signed transactions, and custody authority are never accepted by this setup flow.",
      "Live execution remains blocked even when read-only and dry-run credentials are ready.",
    ],
  };
}

function providerAccountRunwaySummary(status: Web3ProviderAccountRunway["status"], missingRequired: string[]) {
  if (status === "dry-run-ready") return "Provider accounts are ready for read-only wallet monitoring and dry-run Jupiter order rehearsal; live custody remains blocked.";
  if (status === "read-rail-ready") return "Provider accounts are ready for read-only wallet monitoring; Jupiter rehearsal and live-ops accounts still need work.";
  if (missingRequired.length > 0) return `Provider account runway is missing ${missingRequired.join(", ")}.`;
  return "Provider account runway still blocks live execution until signer, emergency stop, accounting, and production operations are reviewed.";
}

function providerAccountRunwayNextAction(
  status: Web3ProviderAccountRunway["status"],
  items: Web3ProviderAccountRunwayItem[],
) {
  if (status === "dry-run-ready") return "Run quote/order rehearsal, then keep live execution behind signer, settlement, emergency-stop, and accounting review.";
  const missing = items.find((item) => item.priority === "required-now" && item.status !== "configured");
  if (missing) return missing.next_action;
  const next = items.find((item) => item.priority === "next" && item.status !== "configured");
  return next?.next_action ?? "Keep the provider runway in paper/dry-run mode until live ops are reviewed.";
}

function credentialPlanSummary(status: Web3CredentialPlan["status"], walletAssetsReady: boolean) {
  if (status === "ready-for-dry-run") return "Credential plan is ready for dry-run order rehearsal; live execution remains locked.";
  if (status === "ready-for-read-only" && walletAssetsReady) return "Credential plan is ready for read-only wallet accounting and asset snapshots.";
  if (status === "ready-for-read-only") return "Credential plan is ready for basic read-only wallet/RPC checks; asset snapshots or route rehearsal still need evidence.";
  return "Credential plan is blocked until provider and wallet scope are supplied.";
}

export function deriveHeliusMainnetRpcUrl(apiKey: string) {
  const clean = text(apiKey);
  return clean ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(clean)}` : "";
}

export function deriveHeliusMainnetWebsocketUrl(apiKey: string) {
  const clean = text(apiKey);
  return clean ? `wss://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(clean)}` : "";
}

export function isLikelySolanaPublicKey(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function credentialSetupChecks(input: {
  rpcUrl: string | null;
  wsUrl: string | null;
  rpcHealthy: boolean;
  rpcDetail?: string;
  walletPublicKey: string | null;
  walletValid: boolean;
  walletBalanceSol: number | null;
  walletBalanceDetail?: string;
  walletAssetCount: number | null;
  walletFungibleAssetCount: number | null;
  walletPricedAssetCount: number | null;
  walletPricedValueUsd: number | null;
  walletAssetsDetail?: string;
  heliusDasReady: boolean;
  jupiterConfigured: boolean;
  jupiterQuoteReady: boolean;
  jupiterQuoteDetail?: string;
  jupiterOrderReady: boolean;
  jupiterOrderDetail?: string;
  signerMode: Web3SignerSetupMode;
  maxTradeUsd: number;
  dailySpendCapUsd: number;
  maxSlippageBps: number;
  requireManualConfirmation: boolean;
}): Web3CredentialsSetupCheck[] {
  return [
    {
      id: "rpc-url",
      label: "Solana RPC",
      status: input.rpcUrl ? "pass" : "fail",
      detail: input.rpcUrl
        ? `Read-only RPC endpoint is scoped as ${redactEndpoint(input.rpcUrl)}${input.wsUrl ? " with websocket scope." : "."}`
        : "Add a Helius API key or Solana RPC URL before wallet/accounting checks can run.",
    },
    {
      id: "rpc-health",
      label: "RPC health",
      status: input.rpcHealthy ? "pass" : input.rpcUrl ? "watch" : "fail",
      detail: input.rpcDetail ?? (input.rpcUrl ? "RPC health has not been tested yet." : "RPC health cannot be tested without an endpoint."),
    },
    {
      id: "wallet",
      label: "Wallet public key",
      status: input.walletValid ? "pass" : input.walletPublicKey ? "fail" : "watch",
      detail: input.walletValid
        ? "A Solana public wallet key is scoped for read-only holdings and unsigned order rehearsal."
        : input.walletPublicKey
          ? "Wallet public key is not a valid-looking Solana address."
          : "Wallet public key is optional for RPC health but required before wallet accounting and order rehearsal.",
    },
    {
      id: "wallet-balance",
      label: "Wallet balance",
      status: input.walletBalanceSol !== null ? "pass" : input.walletValid && input.rpcUrl ? "watch" : "fail",
      detail: input.walletBalanceDetail ?? (input.walletBalanceSol !== null
        ? `${input.walletBalanceSol.toFixed(4)} SOL returned by read-only getBalance.`
        : "Run a read-only wallet balance check after RPC and wallet scope are set."),
    },
    {
      id: "wallet-assets",
      label: "Wallet assets",
      status: input.heliusDasReady ? "pass" : input.walletValid && input.rpcUrl ? "watch" : "fail",
      detail: input.walletAssetsDetail ?? (input.walletAssetCount !== null
        ? `${input.walletAssetCount} total assets, ${input.walletFungibleAssetCount ?? 0} fungible tokens, ${input.walletPricedAssetCount ?? 0} priced assets, ${formatUsd(input.walletPricedValueUsd ?? 0)} priced value from read-only DAS.`
        : input.walletValid && input.rpcUrl
          ? "Run a read-only Helius DAS asset snapshot to prove wallet holdings visibility."
          : "Wallet asset snapshot requires RPC and a valid public wallet key."),
    },
    {
      id: "jupiter-quote",
      label: "Jupiter quote",
      status: input.jupiterQuoteReady ? "pass" : "watch",
      detail: input.jupiterQuoteDetail ?? "Quote route proof has not been tested from this setup card yet.",
    },
    {
      id: "jupiter-order",
      label: "Jupiter order",
      status: input.jupiterOrderReady ? "pass" : input.jupiterConfigured ? "watch" : "fail",
      detail: input.jupiterOrderDetail ?? (input.jupiterConfigured
        ? "Jupiter API key is present; dry-run order proof still needs to be tested."
        : "JUPITER_API_KEY is missing, so Swap V2 order rehearsal cannot be armed."),
    },
    {
      id: "risk-policy",
      label: "Risk policy",
      status: input.dailySpendCapUsd >= input.maxTradeUsd && input.maxSlippageBps <= 250 ? "pass" : "fail",
      detail: input.dailySpendCapUsd >= input.maxTradeUsd && input.maxSlippageBps <= 250
        ? `$${input.maxTradeUsd.toLocaleString()} max trade, $${input.dailySpendCapUsd.toLocaleString()} daily cap, ${input.maxSlippageBps} bps slippage.`
        : "Daily cap must cover max trade and slippage should stay at or under 250 bps before manual review.",
    },
    {
      id: "signer-mode",
      label: "Signer mode",
      status: input.signerMode === "external-wallet" && input.requireManualConfirmation ? "pass" : "watch",
      detail: input.signerMode === "external-wallet"
        ? "External wallet/manual confirmation is the safest first live mode."
        : `${input.signerMode.replaceAll("-", " ")} can be modeled, but provider credentials and policy enforcement must be reviewed separately.`,
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: "pass",
      detail: input.requireManualConfirmation
        ? "Setup can only prepare manual live review; real-capital execution remains blocked."
        : "Manual confirmation is off in the draft, so autonomous live review must remain blocked.",
    },
  ];
}

function credentialSetupSummary(
  status: Web3CredentialsSetupReadiness["status"],
  score: number,
  routeReady: boolean,
  liveReviewReady: boolean,
) {
  if (status === "configured" && liveReviewReady) return `Web3 credentials are configured at ${score}/100 for manual live review; live execution remains locked.`;
  if (routeReady) return `Web3 setup can support read-only route/order rehearsal at ${score}/100, but manual live review is still incomplete.`;
  if (status === "partial") return `Web3 setup is partially configured at ${score}/100; finish wallet, Jupiter, and policy checks before rehearsal.`;
  return `Web3 setup is blocked at ${score}/100; provider, wallet, or policy evidence is missing.`;
}

function credentialSetupNextAction(
  status: Web3CredentialsSetupReadiness["status"],
  checks: Web3CredentialsSetupCheck[],
) {
  const failed = checks.find((check) => check.status === "fail");
  const watch = checks.find((check) => check.status === "watch");
  if (status === "configured") return "Apply the dry-run profile, run landing drill, then keep real-capital trading behind manual review.";
  if (failed) return failed.detail;
  if (watch) return watch.detail;
  return "Keep the setup in read-only dry-run mode until manual live review.";
}

function normalizeRpcUrl(value: unknown, provider: "helius" | "custom-rpc", heliusApiKey: string) {
  const raw = text(value);
  if (raw) return isHttpUrl(raw) ? raw : null;
  if (provider === "helius" && heliusApiKey) return deriveHeliusMainnetRpcUrl(heliusApiKey);
  return null;
}

function normalizeWebsocketUrl(value: unknown, provider: "helius" | "custom-rpc", heliusApiKey: string) {
  const raw = text(value);
  if (raw) return isWebsocketUrl(raw) ? raw : null;
  if (provider === "helius" && heliusApiKey) return deriveHeliusMainnetWebsocketUrl(heliusApiKey);
  return null;
}

function normalizeWallet(value: unknown) {
  const wallet = text(value);
  return wallet || null;
}

function normalizeSignerMode(value: unknown): Web3SignerSetupMode {
  if (
    value === "external-wallet" ||
    value === "privy-server-wallet" ||
    value === "turnkey-policy-wallet" ||
    value === "session-key-vault"
  ) {
    return value;
  }
  return "external-wallet";
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed * 100) / 100));
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function checkScore(status: Web3CredentialsSetupCheck["status"]) {
  if (status === "pass") return 100;
  if (status === "watch") return 55;
  return 10;
}

function redactEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "configured endpoint";
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isWebsocketUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "wss:" || url.protocol === "ws:";
  } catch {
    return false;
  }
}

function isHeliusEndpoint(value: string) {
  try {
    return new URL(value).hostname.endsWith("helius-rpc.com");
  } catch {
    return false;
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatUsd(value: number) {
  return `$${value.toFixed(value >= 100 ? 0 : value >= 1 ? 2 : 4)}`;
}

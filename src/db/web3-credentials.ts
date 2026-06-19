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
    | "jupiter-quote"
    | "jupiter-order"
    | "risk-policy"
    | "signer-mode"
    | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
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
  jupiter_configured: boolean;
  jupiter_quote_ready: boolean;
  jupiter_order_ready: boolean;
  signer_mode: Web3SignerSetupMode;
  require_manual_confirmation: boolean;
  max_trade_usd: number;
  daily_spend_cap_usd: number;
  max_slippage_bps: number;
  can_support_readonly_wallet_sync: boolean;
  can_support_route_order_rehearsal: boolean;
  can_support_manual_live_review: boolean;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  summary: string;
  next_action: string;
  blockers: string[];
  checks: Web3CredentialsSetupCheck[];
  controls: string[];
  env_targets: string[];
};

type Web3CredentialsNetworkEvidence = {
  rpc_healthy?: boolean;
  rpc_detail?: string;
  wallet_balance_sol?: number | null;
  wallet_balance_detail?: string;
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
    jupiter_configured: jupiterConfigured,
    jupiter_quote_ready: jupiterQuoteReady,
    jupiter_order_ready: jupiterOrderReady,
    signer_mode: signerMode,
    require_manual_confirmation: requireManualConfirmation,
    max_trade_usd: maxTradeUsd,
    daily_spend_cap_usd: dailySpendCapUsd,
    max_slippage_bps: maxSlippageBps,
    can_support_readonly_wallet_sync: canSupportReadonlyWalletSync,
    can_support_route_order_rehearsal: canSupportRouteOrderRehearsal,
    can_support_manual_live_review: canSupportManualLiveReview,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    summary: credentialSetupSummary(status, readinessScore, canSupportRouteOrderRehearsal, canSupportManualLiveReview),
    next_action: credentialSetupNextAction(status, checks),
    blockers: blockers.slice(0, 6),
    checks,
    controls: [
      "Credential setup validates provider, wallet, route, and risk-policy readiness only; it never signs, submits, stores private keys, or moves funds.",
      "API keys are accepted only as test inputs or server environment values and are never returned in the response.",
      "Manual live review remains required even when every setup check passes.",
    ],
    env_targets: [
      "SOLANA_RPC_URL",
      "SOLANA_WS_URL",
      "JUPITER_API_KEY",
      "MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER",
      "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
      "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
    ],
  };
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

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

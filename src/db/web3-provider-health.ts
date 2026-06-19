import { createHash } from "node:crypto";
import { deriveHeliusMainnetRpcUrl, isLikelySolanaPublicKey } from "./web3-credentials";
import type { Web3TradingState } from "./web3-trading";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";

type FetchLike = typeof fetch;

type RpcResponse<T> = {
  result?: T;
  error?: { code?: number; message?: string };
};

type HeliusAssetsByOwnerResult = {
  total?: number;
  items?: Array<{
    interface?: string;
    token_info?: {
      price_info?: {
        total_price?: number;
      };
    };
  }>;
};

export type Web3ProviderHealthReceiptStatus =
  | "read-rail-ready"
  | "quote-ready"
  | "order-gated"
  | "wallet-gated"
  | "provider-gated"
  | "blocked";

export type Web3ProviderHealthReceiptCheck = {
  id:
    | "rpc-url"
    | "rpc-health"
    | "blockhash"
    | "wallet-scope"
    | "helius-das"
    | "jupiter-quote"
    | "jupiter-order"
    | "secret-boundary"
    | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export type Web3ProviderHealthReceipt = {
  mode: "web3-provider-health-receipt";
  status: Web3ProviderHealthReceiptStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  rpc_endpoint: string | null;
  rpc_provider: "helius" | "custom-rpc" | "missing";
  wallet_public_key_preview: string | null;
  provider_summary: {
    helius_configured: boolean;
    solana_rpc_configured: boolean;
    solana_ws_configured: boolean;
    rpc_healthy: boolean;
    latest_blockhash_ready: boolean;
    confirmed_slot: number | null;
    wallet_scoped: boolean;
    wallet_valid: boolean;
    helius_das_ready: boolean;
    wallet_asset_count: number | null;
    wallet_fungible_asset_count: number | null;
    wallet_priced_asset_count: number | null;
    wallet_priced_value_usd: number | null;
    jupiter_configured: boolean;
    jupiter_quote_ready: boolean;
    jupiter_order_ready: boolean;
  };
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  secret_echo_permission: "blocked";
  private_key_storage: "blocked";
  transaction_body_storage: "blocked";
  checks: Web3ProviderHealthReceiptCheck[];
  blockers: string[];
  controls: string[];
  summary: string;
  next_action: string;
};

export async function buildWeb3ProviderHealthReceipt(
  state: Web3TradingState,
  fetchImpl: FetchLike = fetch,
): Promise<Web3ProviderHealthReceipt> {
  const generatedAt = new Date().toISOString();
  const rpcUrl = solanaRpcUrl();
  const wallet = state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    null;
  const walletValid = Boolean(wallet && isLikelySolanaPublicKey(wallet));
  const jupiterConfigured = hasEnv("JUPITER_API_KEY");
  const rpcHealth = rpcUrl
    ? await testSolanaReadRail(fetchImpl, rpcUrl)
    : {
      rpc_healthy: false,
      latest_blockhash_ready: false,
      confirmed_slot: null,
      detail: "Add HELIUS_API_KEY or SOLANA_RPC_URL before provider health can test Solana reads.",
    };
  const das = rpcUrl && walletValid
    ? await testHeliusDas(fetchImpl, rpcUrl, wallet!)
    : {
      helius_das_ready: false,
      wallet_asset_count: null,
      wallet_fungible_asset_count: null,
      wallet_priced_asset_count: null,
      wallet_priced_value_usd: null,
      detail: wallet ? "Helius DAS skipped because the wallet address is malformed." : "Helius DAS skipped until a public wallet key is scoped.",
    };
  const jupiter = await testJupiterReadiness(fetchImpl, {
    jupiterApiKey: process.env.JUPITER_API_KEY ?? "",
    wallet: wallet ?? "",
    walletValid,
    maxSlippageBps: state.execution_readiness.config.max_slippage_bps,
  });
  const providerSummary = {
    helius_configured: hasEnv("HELIUS_API_KEY") || isHeliusEndpoint(rpcUrl ?? ""),
    solana_rpc_configured: Boolean(rpcUrl),
    solana_ws_configured: hasEnv("SOLANA_WS_URL"),
    rpc_healthy: rpcHealth.rpc_healthy,
    latest_blockhash_ready: rpcHealth.latest_blockhash_ready,
    confirmed_slot: rpcHealth.confirmed_slot,
    wallet_scoped: Boolean(wallet),
    wallet_valid: walletValid,
    helius_das_ready: das.helius_das_ready,
    wallet_asset_count: das.wallet_asset_count,
    wallet_fungible_asset_count: das.wallet_fungible_asset_count,
    wallet_priced_asset_count: das.wallet_priced_asset_count,
    wallet_priced_value_usd: das.wallet_priced_value_usd,
    jupiter_configured: jupiterConfigured,
    jupiter_quote_ready: jupiter.jupiter_quote_ready,
    jupiter_order_ready: jupiter.jupiter_order_ready,
  };
  const checks = buildProviderHealthChecks({
    rpcUrl,
    rpcHealth,
    wallet,
    walletValid,
    das,
    jupiter,
    jupiterConfigured,
  });
  const status = providerHealthStatus(providerSummary);
  const blockers = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.detail)
    .slice(0, 8);
  const receiptBase = {
    mode: "web3-provider-health-receipt" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: state.market_source.fetched_at,
    rpc_endpoint: rpcUrl ? redactEndpoint(rpcUrl) : null,
    rpc_provider: rpcUrl ? isHeliusEndpoint(rpcUrl) ? "helius" as const : "custom-rpc" as const : "missing" as const,
    wallet_public_key_preview: previewValue(wallet),
    provider_summary: providerSummary,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    transaction_body_storage: "blocked" as const,
    checks,
    blockers,
    controls: [
      "Provider health performs read-only network checks and returns redacted status only.",
      "API keys, private keys, seed phrases, raw transaction bodies, and signed payloads are never returned.",
      "Jupiter quote proof is read-only; unsigned order proof still requires JUPITER_API_KEY and a public wallet.",
      "Live execution and wallet mutation remain blocked even when provider health passes.",
    ],
    summary: providerHealthSummary(status, providerSummary),
    next_action: providerHealthNextAction(status, checks),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

async function testSolanaReadRail(fetchImpl: FetchLike, rpcUrl: string) {
  const health = await solanaRpc<string>(fetchImpl, rpcUrl, "getHealth");
  if (!health.ok) {
    return {
      rpc_healthy: false,
      latest_blockhash_ready: false,
      confirmed_slot: null,
      detail: health.detail,
    };
  }
  const blockhash = await solanaRpc<{ value?: { blockhash?: string; lastValidBlockHeight?: number } }>(
    fetchImpl,
    rpcUrl,
    "getLatestBlockhash",
    [{ commitment: "confirmed" }],
  );
  const slot = await solanaRpc<number>(fetchImpl, rpcUrl, "getSlot", [{ commitment: "confirmed" }]);
  return {
    rpc_healthy: true,
    latest_blockhash_ready: blockhash.ok && Boolean(blockhash.result?.value?.blockhash),
    confirmed_slot: slot.ok && typeof slot.result === "number" ? slot.result : null,
    detail: blockhash.ok
      ? `RPC health ok; latest blockhash and confirmed slot ${slot.ok ? slot.result : "unknown"} returned.`
      : `RPC health ok; ${blockhash.detail}`,
  };
}

async function testHeliusDas(fetchImpl: FetchLike, rpcUrl: string, wallet: string) {
  if (!isHeliusEndpoint(rpcUrl)) {
    return {
      helius_das_ready: false,
      wallet_asset_count: null,
      wallet_fungible_asset_count: null,
      wallet_priced_asset_count: null,
      wallet_priced_value_usd: null,
      detail: "Helius DAS skipped because the configured RPC endpoint is not Helius.",
    };
  }
  const assets = await solanaRpc<HeliusAssetsByOwnerResult>(fetchImpl, rpcUrl, "getAssetsByOwner", {
    ownerAddress: wallet,
    page: 1,
    limit: 10,
    displayOptions: {
      showFungible: true,
      showNativeBalance: true,
    },
  });
  if (!assets.ok || !assets.result) {
    return {
      helius_das_ready: false,
      wallet_asset_count: null,
      wallet_fungible_asset_count: null,
      wallet_priced_asset_count: null,
      wallet_priced_value_usd: null,
      detail: assets.detail,
    };
  }
  const items = Array.isArray(assets.result.items) ? assets.result.items : [];
  const total = typeof assets.result.total === "number" ? assets.result.total : items.length;
  const fungible = items.filter((item) => {
    const iface = typeof item.interface === "string" ? item.interface.toLowerCase() : "";
    return iface.includes("fungible") || Boolean(item.token_info);
  });
  const priced = fungible
    .map((item) => item.token_info?.price_info?.total_price)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  return {
    helius_das_ready: true,
    wallet_asset_count: total,
    wallet_fungible_asset_count: fungible.length,
    wallet_priced_asset_count: priced.length,
    wallet_priced_value_usd: Math.round(priced.reduce((sum, value) => sum + value, 0) * 100) / 100,
    detail: `Helius DAS returned ${total} wallet asset${total === 1 ? "" : "s"} on page 1.`,
  };
}

async function testJupiterReadiness(
  fetchImpl: FetchLike,
  input: { jupiterApiKey: string; wallet: string; walletValid: boolean; maxSlippageBps: number },
) {
  const amount = "1000000";
  const slippage = String(Math.max(1, Math.min(250, Number(input.maxSlippageBps) || 150)));
  const quoteParams = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount,
    slippageBps: slippage,
  });
  const quote = await fetchJson(fetchImpl, `${JUPITER_QUOTE_URL}?${quoteParams.toString()}`, {});
  const quoteReady = quote.ok && Boolean(quote.json && typeof quote.json === "object" && "outAmount" in quote.json);
  if (!input.jupiterApiKey) {
    return {
      jupiter_quote_ready: quoteReady,
      jupiter_quote_detail: quoteReady ? "Jupiter quote route returned for SOL to USDC." : quote.detail,
      jupiter_order_ready: false,
      jupiter_order_detail: "JUPITER_API_KEY is missing, so Swap V2 order rehearsal cannot be armed.",
    };
  }
  if (!input.walletValid) {
    return {
      jupiter_quote_ready: quoteReady,
      jupiter_quote_detail: quoteReady ? "Jupiter quote route returned for SOL to USDC." : quote.detail,
      jupiter_order_ready: false,
      jupiter_order_detail: "A valid Solana wallet public key is required before requesting an unsigned Jupiter order.",
    };
  }
  const orderParams = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount,
    taker: input.wallet,
    slippageBps: slippage,
  });
  const order = await fetchJson(fetchImpl, `${JUPITER_ORDER_URL}?${orderParams.toString()}`, {
    headers: {
      accept: "application/json",
      "x-api-key": input.jupiterApiKey,
    },
  });
  const orderJson = order.json && typeof order.json === "object" ? order.json as { transaction?: unknown; requestId?: unknown } : {};
  return {
    jupiter_quote_ready: quoteReady,
    jupiter_quote_detail: quoteReady ? "Jupiter quote route returned for SOL to USDC." : quote.detail,
    jupiter_order_ready: order.ok && typeof orderJson.requestId === "string" && (typeof orderJson.transaction === "string" || orderJson.transaction === null),
    jupiter_order_detail: order.ok
      ? "Jupiter unsigned order route returned request metadata without exposing transaction bytes."
      : order.detail,
  };
}

function buildProviderHealthChecks({
  rpcUrl,
  rpcHealth,
  wallet,
  walletValid,
  das,
  jupiter,
  jupiterConfigured,
}: {
  rpcUrl: string | null;
  rpcHealth: Awaited<ReturnType<typeof testSolanaReadRail>>;
  wallet: string | null;
  walletValid: boolean;
  das: Awaited<ReturnType<typeof testHeliusDas>>;
  jupiter: Awaited<ReturnType<typeof testJupiterReadiness>>;
  jupiterConfigured: boolean;
}): Web3ProviderHealthReceiptCheck[] {
  return [
    {
      id: "rpc-url",
      label: "Solana RPC",
      status: rpcUrl ? "pass" : "fail",
      detail: rpcUrl ? `Read-only RPC endpoint is scoped as ${redactEndpoint(rpcUrl)}.` : "HELIUS_API_KEY or SOLANA_RPC_URL is required.",
    },
    {
      id: "rpc-health",
      label: "RPC health",
      status: rpcHealth.rpc_healthy ? "pass" : rpcUrl ? "watch" : "fail",
      detail: rpcHealth.detail,
    },
    {
      id: "blockhash",
      label: "Blockhash",
      status: rpcHealth.latest_blockhash_ready ? "pass" : rpcHealth.rpc_healthy ? "watch" : "fail",
      detail: rpcHealth.latest_blockhash_ready ? `Latest blockhash returned; slot ${rpcHealth.confirmed_slot ?? "unknown"}.` : "Latest blockhash was not returned.",
    },
    {
      id: "wallet-scope",
      label: "Wallet scope",
      status: walletValid ? "pass" : wallet ? "fail" : "watch",
      detail: walletValid ? "Public wallet key is valid for read-only wallet checks." : wallet ? "Wallet address is malformed." : "Public wallet is not scoped yet.",
    },
    {
      id: "helius-das",
      label: "Helius DAS",
      status: das.helius_das_ready ? "pass" : walletValid && rpcUrl ? "watch" : "fail",
      detail: das.detail,
    },
    {
      id: "jupiter-quote",
      label: "Jupiter quote",
      status: jupiter.jupiter_quote_ready ? "pass" : "watch",
      detail: jupiter.jupiter_quote_detail,
    },
    {
      id: "jupiter-order",
      label: "Jupiter order",
      status: jupiter.jupiter_order_ready ? "pass" : jupiterConfigured ? "watch" : "fail",
      detail: jupiter.jupiter_order_detail,
    },
    {
      id: "secret-boundary",
      label: "Secret boundary",
      status: "pass",
      detail: "Provider health returns configured/missing and redacted host data only; API keys are never echoed.",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: "pass",
      detail: "Provider health cannot sign, submit, approve, custody, or mutate wallets.",
    },
  ];
}

function providerHealthStatus(summary: Web3ProviderHealthReceipt["provider_summary"]): Web3ProviderHealthReceiptStatus {
  if (!summary.solana_rpc_configured) return "provider-gated";
  if (!summary.rpc_healthy) return "blocked";
  if (!summary.wallet_scoped) return summary.jupiter_quote_ready ? "wallet-gated" : "read-rail-ready";
  if (!summary.jupiter_quote_ready) return "read-rail-ready";
  if (!summary.jupiter_order_ready) return summary.jupiter_configured ? "order-gated" : "quote-ready";
  return "order-gated";
}

function providerHealthSummary(status: Web3ProviderHealthReceiptStatus, summary: Web3ProviderHealthReceipt["provider_summary"]) {
  if (status === "provider-gated") return "Provider health is missing a Solana read rail; add Helius or custom RPC.";
  if (status === "blocked") return "Provider health could not prove RPC health; keep trading in sample/paper mode.";
  if (status === "wallet-gated") return "Helius/Solana and Jupiter quote reads are healthy; public wallet scope is still needed for wallet/order proof.";
  if (status === "read-rail-ready") return "Solana read rail is healthy; Jupiter quote/order evidence still needs to pass.";
  if (status === "quote-ready") return "Solana reads and Jupiter quote are healthy; JUPITER_API_KEY and wallet scope are still needed for unsigned order rehearsal.";
  return `Provider health has RPC ${summary.rpc_healthy ? "ready" : "gated"} and Jupiter order ${summary.jupiter_order_ready ? "ready" : "gated"}; live execution remains blocked.`;
}

function providerHealthNextAction(status: Web3ProviderHealthReceiptStatus, checks: Web3ProviderHealthReceiptCheck[]) {
  if (status === "quote-ready") return "Add JUPITER_API_KEY and a public trading wallet, then run order rehearsal.";
  if (status === "wallet-gated") return "Enter a dedicated public trading wallet address, then rerun provider health and credentials test.";
  if (status === "order-gated") return "Run dry-run order rehearsal and signer handoff receipt before live review.";
  const fail = checks.find((check) => check.status === "fail");
  const watch = checks.find((check) => check.status === "watch");
  return fail?.detail ?? watch?.detail ?? "Keep provider reads in dry-run mode.";
}

async function solanaRpc<T>(fetchImpl: FetchLike, rpcUrl: string, method: string, params?: unknown[] | Record<string, unknown>) {
  const response = await fetchJson(fetchImpl, rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "mastermind-web3-provider-health",
      method,
      ...(params ? { params } : {}),
    }),
  });
  const rpc = response.json as RpcResponse<T> | null;
  if (!response.ok || rpc?.error) {
    return {
      ok: false,
      result: undefined,
      detail: rpc?.error?.message ? `Solana RPC ${method} returned ${rpc.error.message}.` : response.detail,
    };
  }
  return {
    ok: true,
    result: rpc?.result as T,
    detail: `Solana RPC ${method} returned successfully.`,
  };
}

async function fetchJson(fetchImpl: FetchLike, url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const json = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        json,
        detail: `Provider request returned HTTP ${response.status}.`,
      };
    }
    return {
      ok: true,
      json,
      detail: "Provider request returned successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      json: null,
      detail: error instanceof Error && error.name === "AbortError"
        ? "Provider request timed out."
        : "Provider request failed before a response was returned.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function solanaRpcUrl() {
  return process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    deriveHeliusMainnetRpcUrl(process.env.HELIUS_API_KEY ?? "") ||
    null;
}

function isHeliusEndpoint(value: string) {
  try {
    return new URL(value).hostname.endsWith("helius-rpc.com");
  } catch {
    return false;
  }
}

function redactEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "configured endpoint";
  }
}

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hasEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

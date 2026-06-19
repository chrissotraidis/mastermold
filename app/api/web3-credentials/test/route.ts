import { NextResponse } from "next/server";
import {
  buildWeb3CredentialsSetupReadiness,
  deriveHeliusMainnetRpcUrl,
  isLikelySolanaPublicKey,
  type Web3CredentialsSetupReadiness,
  type Web3CredentialsSetupRequest,
} from "@/src/db/web3-credentials";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";
const LAMPORTS_PER_SOL = 1_000_000_000;

type Web3CredentialsTestResponse = Web3CredentialsSetupReadiness & {
  checked_at: string;
  network_tested: boolean;
};

type RpcResponse<T> = {
  result?: T;
  error?: { code?: number; message?: string };
};

export async function POST(request: Request): Promise<NextResponse<Web3CredentialsTestResponse | { error: string }>> {
  const body = (await request.json().catch(() => null)) as Web3CredentialsSetupRequest | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a Web3 credentials setup object." }, { status: 422 });
  }

  const networkTested = body.test_mode !== "validate-only";
  const rpcUrl = resolveRpcUrl(body);
  const wallet = normalizeText(body.wallet_public_key);
  const jupiterApiKey = normalizeText(body.jupiter_api_key) || process.env.JUPITER_API_KEY || "";

  if (!networkTested) {
    return NextResponse.json({
      ...buildWeb3CredentialsSetupReadiness(body),
      checked_at: new Date().toISOString(),
      network_tested: false,
    });
  }

  const rpcEvidence = rpcUrl ? await testSolanaRpc(rpcUrl, wallet) : {
    rpc_healthy: false,
    rpc_detail: "Add a Helius API key or Solana RPC URL before testing network health.",
    wallet_balance_sol: null,
    wallet_balance_detail: "Wallet balance cannot be checked without RPC.",
  };
  const jupiterEvidence = await testJupiter({
    jupiterApiKey,
    wallet,
    maxSlippageBps: body.max_slippage_bps,
  });

  return NextResponse.json({
    ...buildWeb3CredentialsSetupReadiness(body, {
      ...rpcEvidence,
      ...jupiterEvidence,
    }),
    checked_at: new Date().toISOString(),
    network_tested: true,
  });
}

function resolveRpcUrl(body: Web3CredentialsSetupRequest) {
  const explicitRpc = normalizeText(body.rpc_url);
  if (explicitRpc) return explicitRpc;
  const heliusKey = normalizeText(body.helius_api_key) || process.env.HELIUS_API_KEY || "";
  if (heliusKey) return deriveHeliusMainnetRpcUrl(heliusKey);
  return process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "";
}

async function testSolanaRpc(rpcUrl: string, wallet: string) {
  const health = await solanaRpc<string>(rpcUrl, "getHealth");
  if (!health.ok) {
    return {
      rpc_healthy: false,
      rpc_detail: health.detail,
      wallet_balance_sol: null,
      wallet_balance_detail: wallet ? "Wallet balance skipped because RPC health failed." : "Wallet balance skipped until a wallet key is scoped.",
    };
  }

  const blockhash = await solanaRpc<{ value?: { blockhash?: string; lastValidBlockHeight?: number } }>(
    rpcUrl,
    "getLatestBlockhash",
    [{ commitment: "confirmed" }],
  );
  const slot = await solanaRpc<number>(rpcUrl, "getSlot", [{ commitment: "confirmed" }]);
  const rpcDetail = blockhash.ok
    ? `RPC health ok; latest blockhash and confirmed slot ${slot.ok ? slot.result : "unknown"} returned.`
    : `RPC health ok; ${blockhash.detail}`;

  if (!wallet || !isLikelySolanaPublicKey(wallet)) {
    return {
      rpc_healthy: true,
      rpc_detail: rpcDetail,
      wallet_balance_sol: null,
      wallet_balance_detail: wallet ? "Wallet balance skipped because the wallet address is malformed." : "Wallet balance skipped until a public wallet key is entered.",
    };
  }

  const balance = await solanaRpc<{ value: number } | number>(rpcUrl, "getBalance", [wallet, { commitment: "confirmed" }]);
  const lamports = typeof balance.result === "number" ? balance.result : balance.result?.value;
  return {
    rpc_healthy: true,
    rpc_detail: rpcDetail,
    wallet_balance_sol: balance.ok && typeof lamports === "number" ? lamports / LAMPORTS_PER_SOL : null,
    wallet_balance_detail: balance.ok && typeof lamports === "number"
      ? `${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL returned by read-only getBalance.`
      : balance.detail,
  };
}

async function testJupiter({
  jupiterApiKey,
  wallet,
  maxSlippageBps,
}: {
  jupiterApiKey: string;
  wallet: string;
  maxSlippageBps: unknown;
}) {
  const amount = "1000000";
  const slippage = String(Math.max(1, Math.min(250, Number(maxSlippageBps) || 150)));
  const quoteParams = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount,
    slippageBps: slippage,
  });
  const quote = await fetchJson(`${JUPITER_QUOTE_URL}?${quoteParams.toString()}`, {});
  const quoteReady = quote.ok && Boolean(quote.json && typeof quote.json === "object" && "outAmount" in quote.json);

  if (!jupiterApiKey) {
    return {
      jupiter_quote_ready: quoteReady,
      jupiter_quote_detail: quoteReady
        ? "Jupiter quote route returned for SOL to USDC; Swap V2 order still needs JUPITER_API_KEY."
        : quote.detail,
      jupiter_order_ready: false,
      jupiter_order_detail: "JUPITER_API_KEY is missing, so Swap V2 order rehearsal cannot be armed.",
    };
  }

  if (!wallet || !isLikelySolanaPublicKey(wallet)) {
    return {
      jupiter_quote_ready: quoteReady,
      jupiter_quote_detail: quoteReady
        ? "Jupiter quote route returned for SOL to USDC."
        : quote.detail,
      jupiter_order_ready: false,
      jupiter_order_detail: "A valid Solana wallet public key is required before requesting an unsigned Jupiter order.",
    };
  }

  const orderParams = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount,
    taker: wallet,
    slippageBps: slippage,
  });
  const order = await fetchJson(`${JUPITER_ORDER_URL}?${orderParams.toString()}`, {
    headers: {
      accept: "application/json",
      "x-api-key": jupiterApiKey,
    },
  });
  const orderJson = order.json && typeof order.json === "object" ? order.json as { transaction?: unknown; requestId?: unknown; router?: unknown } : {};
  const orderReady = order.ok && typeof orderJson.requestId === "string" && (typeof orderJson.transaction === "string" || orderJson.transaction === null);

  return {
    jupiter_quote_ready: quoteReady,
    jupiter_quote_detail: quoteReady
      ? "Jupiter quote route returned for SOL to USDC."
      : quote.detail,
    jupiter_order_ready: orderReady,
    jupiter_order_detail: orderReady
      ? `Jupiter unsigned order returned with ${typeof orderJson.router === "string" ? orderJson.router : "router"} route metadata; transaction bytes were not returned by this API.`
      : order.detail,
  };
}

async function solanaRpc<T>(rpcUrl: string, method: string, params?: unknown[]) {
  const response = await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "mastermind-web3-setup",
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

async function fetchJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

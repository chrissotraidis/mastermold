import { createHash } from "node:crypto";
import { isLikelySolanaPublicKey } from "./web3-credentials";
import type { Web3TradingState } from "./web3-trading";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";

type FetchLike = typeof fetch;

export type Web3JupiterRehearsalReceiptStatus =
  | "order-ready"
  | "quote-ready"
  | "key-gated"
  | "wallet-gated"
  | "order-gated"
  | "blocked";

export type Web3JupiterRehearsalReceiptCheck = {
  id:
    | "wallet-scope"
    | "jupiter-key"
    | "quote"
    | "order"
    | "transaction-boundary"
    | "secret-boundary"
    | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export type Web3JupiterRehearsalInput = {
  jupiter_api_key?: string;
  wallet_public_key?: string;
  max_slippage_bps?: number;
};

export type Web3JupiterRehearsalReceipt = {
  mode: "web3-jupiter-rehearsal-receipt";
  status: Web3JupiterRehearsalReceiptStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  key_source: "one-shot" | "server-env" | "missing";
  one_shot_key_used: boolean;
  server_key_configured: boolean;
  wallet_public_key_preview: string | null;
  summary: {
    wallet_scoped: boolean;
    wallet_valid: boolean;
    jupiter_key_configured: boolean;
    jupiter_quote_ready: boolean;
    jupiter_order_ready: boolean;
    order_request_hash: string | null;
    transaction_body_detected: boolean;
    max_slippage_bps: number;
    input_mint: "SOL";
    output_mint: "USDC";
  };
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  secret_echo_permission: "blocked";
  private_key_storage: "blocked";
  transaction_body_storage: "blocked";
  unsigned_transaction_return: "withheld";
  signed_transaction_return: "blocked";
  execute_permission: "blocked";
  checks: Web3JupiterRehearsalReceiptCheck[];
  blockers: string[];
  controls: string[];
  narrative: string;
  next_action: string;
};

export async function buildWeb3JupiterRehearsalReceipt(
  state: Web3TradingState,
  input: Web3JupiterRehearsalInput = {},
  fetchImpl: FetchLike = fetch,
): Promise<Web3JupiterRehearsalReceipt> {
  const generatedAt = new Date().toISOString();
  const oneShotKey = text(input.jupiter_api_key);
  const serverKey = text(process.env.JUPITER_API_KEY);
  const jupiterApiKey = oneShotKey || serverKey;
  const wallet = text(input.wallet_public_key) ||
    text(state.autonomous_custody_mandate.wallet_public_key) ||
    text(state.live_wallet_accounting_readiness.wallet_public_key) ||
    text(state.execution_readiness.config.wallet_public_key);
  const walletValid = Boolean(wallet && isLikelySolanaPublicKey(wallet));
  const maxSlippageBps = clampSlippage(input.max_slippage_bps ?? state.execution_readiness.config.max_slippage_bps);
  const quote = await testJupiterQuote(fetchImpl, maxSlippageBps);
  const order = jupiterApiKey && walletValid
    ? await testJupiterOrder(fetchImpl, {
      jupiterApiKey,
      wallet,
      maxSlippageBps,
    })
    : {
      jupiter_order_ready: false,
      order_request_hash: null,
      transaction_body_detected: false,
      detail: !jupiterApiKey
        ? "Jupiter API key is missing, so order rehearsal cannot be requested."
        : "A valid public Solana wallet key is required before requesting a Jupiter order.",
    };
  const summary = {
    wallet_scoped: Boolean(wallet),
    wallet_valid: walletValid,
    jupiter_key_configured: Boolean(jupiterApiKey),
    jupiter_quote_ready: quote.jupiter_quote_ready,
    jupiter_order_ready: order.jupiter_order_ready,
    order_request_hash: order.order_request_hash,
    transaction_body_detected: order.transaction_body_detected,
    max_slippage_bps: maxSlippageBps,
    input_mint: "SOL" as const,
    output_mint: "USDC" as const,
  };
  const status = rehearsalStatus(summary);
  const checks = rehearsalChecks({
    wallet,
    walletValid,
    oneShotKey,
    serverKey,
    quote,
    order,
    summary,
  });
  const blockers = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.detail)
    .slice(0, 6);
  const receiptBase = {
    mode: "web3-jupiter-rehearsal-receipt" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: state.market_source.fetched_at,
    key_source: oneShotKey ? "one-shot" as const : serverKey ? "server-env" as const : "missing" as const,
    one_shot_key_used: Boolean(oneShotKey),
    server_key_configured: Boolean(serverKey),
    wallet_public_key_preview: previewValue(wallet),
    summary,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    transaction_body_storage: "blocked" as const,
    unsigned_transaction_return: "withheld" as const,
    signed_transaction_return: "blocked" as const,
    execute_permission: "blocked" as const,
    checks,
    blockers,
    controls: [
      "Jupiter API keys may be used from server env or one-shot POST body only; the receipt never echoes them.",
      "The route can request quote/order readiness, but it withholds assembled transaction bytes from the response.",
      "A wallet public key is accepted for rehearsal scope only; private keys and seed phrases are rejected before testing.",
      "Live execution, execute calls, signing, submission, custody, and wallet mutation remain blocked.",
    ],
    narrative: rehearsalNarrative(status, summary),
    next_action: rehearsalNextAction(status),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

async function testJupiterQuote(fetchImpl: FetchLike, maxSlippageBps: number) {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: "1000000",
    slippageBps: String(maxSlippageBps),
  });
  const quote = await fetchJson(fetchImpl, `${JUPITER_QUOTE_URL}?${params.toString()}`, {});
  const json = quote.json && typeof quote.json === "object" ? quote.json as { outAmount?: unknown; routePlan?: unknown } : {};
  const quoteReady = quote.ok && typeof json.outAmount === "string";
  return {
    jupiter_quote_ready: quoteReady,
    detail: quoteReady
      ? "Jupiter quote returned a SOL to USDC route."
      : quote.detail,
    route_plan_detected: Array.isArray(json.routePlan),
  };
}

async function testJupiterOrder(
  fetchImpl: FetchLike,
  input: { jupiterApiKey: string; wallet: string; maxSlippageBps: number },
) {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: "1000000",
    taker: input.wallet,
    slippageBps: String(input.maxSlippageBps),
  });
  const order = await fetchJson(fetchImpl, `${JUPITER_ORDER_URL}?${params.toString()}`, {
    headers: {
      accept: "application/json",
      "x-api-key": input.jupiterApiKey,
    },
  });
  const json = order.json && typeof order.json === "object"
    ? order.json as { transaction?: unknown; requestId?: unknown; router?: unknown; errorCode?: unknown }
    : {};
  const requestId = typeof json.requestId === "string" ? json.requestId : "";
  const transactionBodyDetected = typeof json.transaction === "string" && json.transaction.length > 0;
  const transactionShapeAllowed = typeof json.transaction === "string" || json.transaction === null || json.transaction === undefined;
  const orderReady = order.ok && Boolean(requestId) && transactionShapeAllowed;
  return {
    jupiter_order_ready: orderReady,
    order_request_hash: requestId ? hashJson({ requestId }) : null,
    transaction_body_detected: transactionBodyDetected,
    detail: orderReady
      ? "Jupiter order returned request metadata; transaction bytes were detected and withheld when present."
      : order.detail,
  };
}

function rehearsalChecks(input: {
  wallet: string;
  walletValid: boolean;
  oneShotKey: string;
  serverKey: string;
  quote: Awaited<ReturnType<typeof testJupiterQuote>>;
  order: Awaited<ReturnType<typeof testJupiterOrder>>;
  summary: Web3JupiterRehearsalReceipt["summary"];
}): Web3JupiterRehearsalReceiptCheck[] {
  const keyConfigured = Boolean(input.oneShotKey || input.serverKey);
  return [
    {
      id: "wallet-scope",
      label: "Wallet scope",
      status: input.walletValid ? "pass" : input.wallet ? "fail" : "watch",
      detail: input.walletValid
        ? "Public wallet key is valid for Jupiter order rehearsal."
        : input.wallet
          ? "Wallet address is malformed; use a public Solana wallet address only."
          : "Public trading wallet is needed before order rehearsal can include taker scope.",
    },
    {
      id: "jupiter-key",
      label: "Jupiter key",
      status: keyConfigured ? "pass" : "fail",
      detail: input.oneShotKey
        ? "A one-shot Jupiter key was used for this request and was not returned."
        : input.serverKey
          ? "Server-side JUPITER_API_KEY is configured for rehearsal."
          : "JUPITER_API_KEY or a one-shot Jupiter key is required for order rehearsal.",
    },
    {
      id: "quote",
      label: "Quote",
      status: input.quote.jupiter_quote_ready ? "pass" : "watch",
      detail: input.quote.detail,
    },
    {
      id: "order",
      label: "Order",
      status: input.summary.jupiter_order_ready ? "pass" : keyConfigured && input.walletValid ? "watch" : "fail",
      detail: input.order.detail,
    },
    {
      id: "transaction-boundary",
      label: "Transaction body",
      status: "pass",
      detail: input.summary.transaction_body_detected
        ? "Jupiter returned an assembled transaction, but the app withheld it from this receipt."
        : "No transaction bytes were returned to the browser receipt.",
    },
    {
      id: "secret-boundary",
      label: "Secret boundary",
      status: "pass",
      detail: "API keys are accepted only as server env or one-shot request input and are never echoed.",
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: "pass",
      detail: "This rehearsal cannot sign, execute, submit, custody funds, or mutate wallet balances.",
    },
  ];
}

function rehearsalStatus(summary: Web3JupiterRehearsalReceipt["summary"]): Web3JupiterRehearsalReceiptStatus {
  if (!summary.jupiter_quote_ready) return "blocked";
  if (!summary.jupiter_key_configured) return "key-gated";
  if (!summary.wallet_scoped || !summary.wallet_valid) return "wallet-gated";
  if (summary.jupiter_order_ready) return "order-ready";
  return "order-gated";
}

function rehearsalNarrative(
  status: Web3JupiterRehearsalReceiptStatus,
  summary: Web3JupiterRehearsalReceipt["summary"],
) {
  if (status === "order-ready") {
    return `Jupiter order rehearsal is ready for a SOL to USDC dry-run at ${summary.max_slippage_bps} bps; transaction bytes are withheld and live execution stays blocked.`;
  }
  if (status === "key-gated") return "Jupiter quote works, but order rehearsal still needs a Jupiter API key.";
  if (status === "wallet-gated") return "Jupiter quote/key are available, but order rehearsal needs a valid public wallet address.";
  if (status === "order-gated") return "Jupiter quote/key/wallet are scoped, but the order route did not return ready metadata.";
  if (status === "quote-ready") return "Jupiter quote is reachable; continue wiring key and wallet scope before order rehearsal.";
  return "Jupiter quote did not return route evidence; keep the app in paper/sample mode.";
}

function rehearsalNextAction(status: Web3JupiterRehearsalReceiptStatus) {
  if (status === "order-ready") return "Proceed to signer handoff receipt and landing drill review; do not enable live execution yet.";
  if (status === "key-gated") return "Add JUPITER_API_KEY in server env or paste a one-shot key into the session-only field, then rehearse again.";
  if (status === "wallet-gated") return "Enter a dedicated public Solana trading wallet address, then rehearse again.";
  if (status === "order-gated") return "Inspect Jupiter account/key tier, wallet funding posture, and provider response before signer review.";
  return "Restore Jupiter quote readiness before testing order rehearsal.";
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
        detail: `Jupiter request returned HTTP ${response.status}.`,
      };
    }
    return {
      ok: true,
      json,
      detail: "Jupiter request returned successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      json: null,
      detail: error instanceof Error && error.name === "AbortError"
        ? "Jupiter request timed out."
        : "Jupiter request failed before a response was returned.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function clampSlippage(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 150;
  return Math.max(1, Math.min(250, Math.trunc(parsed)));
}

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

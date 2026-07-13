/**
 * Quote-first execution-cost model. Jupiter's `outAmount` is net of AMM and
 * platform fees, so the executable price and reverse-quote loss are the source
 * of truth. Route fees are decomposed for attribution only; they are never
 * charged a second time to the paper ledger.
 */

import { decimalsFor, type MintMetaRow } from "../mint-meta";
import { p95CostPct } from "../rehearsal-stats";
import type { RehearsalRow } from "../store";
import type { ExecutionCost } from "./signal";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type JupiterRouteStep = {
  swapInfo?: { feeAmount?: unknown; feeMint?: unknown };
};

export type JupiterQuoteBody = {
  inputMint?: unknown;
  outputMint?: unknown;
  inAmount?: unknown;
  outAmount?: unknown;
  priceImpactPct?: unknown;
  routePlan?: JupiterRouteStep[];
};

export type QuoteSide = "buy" | "sell";

export type ExecutionQuote = {
  mint: string;
  side: QuoteSide;
  price_usd: number;
  /** Always zero: route fees are already embedded in Jupiter's outAmount. */
  fee_usd: number;
  qty: number;
  value_usd: number;
  quote_ts_ms: number;
  cost: ExecutionCost;
};

export type ExecutionQuoteRequest = {
  mint: string;
  side: QuoteSide;
  notional_usd: number;
  /** Required for an exact sell quote; otherwise derived from reference price. */
  qty?: number | null;
  reference_price_usd?: number | null;
  mint_meta?: MintMetaRow[];
  rehearsals?: RehearsalRow[];
  tier?: "A" | "B";
  now_ms?: number;
  /** Bypass the five-minute scout cache for the pre-execution venue check. */
  force_refresh?: boolean;
};

const QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const FETCH_TIMEOUT_MS = 6_000;
export const QUOTE_CACHE_MS = 5 * 60_000;
export const REQUOTE_MOVE_BPS = 5;
export const REQUOTE_MAX_AGE_MS = 20_000;
export const MAJOR_SLIPPAGE_FALLBACK_BPS = 20;
export const TIER_B_SLIPPAGE_FALLBACK_BPS = 60;

/** Modeled terms that are not yet available from the lite quote response. */
export const DEX_FEE_BPS = 25;
export const BASE_SPREAD_BPS = 5;
export const PRIORITY_FEE_BPS = 3;
export const FAILED_TX_BPS = 4;
export const CONSERVATIVE_TOTAL_BPS = 120;
export const MEMECOIN_CONSERVATIVE_TOTAL_BPS = 250;
export const MEMECOIN_DEX_FEE_BPS = 50;

const quoteCache = new Map<string, { expires_at: number; quote: ExecutionQuote }>();

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function conservativeCostAt(totalBps: number, dexFeeBps: number): ExecutionCost {
  return {
    dex_fee_bps: dexFeeBps,
    price_impact_bps: totalBps - dexFeeBps - BASE_SPREAD_BPS - PRIORITY_FEE_BPS - FAILED_TX_BPS,
    spread_bps: BASE_SPREAD_BPS,
    slippage_bps: 0,
    priority_fee_bps: PRIORITY_FEE_BPS,
    failed_tx_bps: FAILED_TX_BPS,
    total_bps: totalBps,
  };
}

export function conservativeCost(): ExecutionCost {
  return conservativeCostAt(CONSERVATIVE_TOTAL_BPS, DEX_FEE_BPS);
}

export function memecoinConservativeCost(): ExecutionCost {
  return conservativeCostAt(MEMECOIN_CONSERVATIVE_TOTAL_BPS, MEMECOIN_DEX_FEE_BPS);
}

/** Compatibility path for callers that have only a one-leg price impact. */
export function costFromImpact(priceImpactPct: number | null): ExecutionCost {
  const impactBps = priceImpactPct !== null && Number.isFinite(priceImpactPct) ? Math.abs(priceImpactPct) * 10_000 : null;
  if (impactBps === null) return conservativeCost();
  const roundTripImpact = impactBps * 2;
  const slippage = Math.max(roundTripImpact * 0.5, BASE_SPREAD_BPS);
  const total = DEX_FEE_BPS + roundTripImpact + BASE_SPREAD_BPS + slippage + PRIORITY_FEE_BPS + FAILED_TX_BPS;
  return {
    dex_fee_bps: DEX_FEE_BPS,
    price_impact_bps: round2(roundTripImpact),
    spread_bps: BASE_SPREAD_BPS,
    slippage_bps: round2(slippage),
    priority_fee_bps: PRIORITY_FEE_BPS,
    failed_tx_bps: FAILED_TX_BPS,
    total_bps: round2(total),
  };
}

export function impactFromQuoteBody(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const raw = Number((body as JupiterQuoteBody).priceImpactPct);
  return Number.isFinite(raw) ? raw : null;
}

/**
 * Route fee as a fraction of that leg's input/output amount. This is used only
 * to label the already-observed round-trip loss. It must not be added again.
 */
export function routeFeeBps(body: JupiterQuoteBody): number | null {
  const inputMint = typeof body.inputMint === "string" ? body.inputMint : null;
  const outputMint = typeof body.outputMint === "string" ? body.outputMint : null;
  const inAmount = finitePositive(body.inAmount);
  const outAmount = finitePositive(body.outAmount);
  if (!Array.isArray(body.routePlan)) return null;
  let bps = 0;
  let found = false;
  for (const step of body.routePlan) {
    const fee = finitePositive(step.swapInfo?.feeAmount);
    const feeMint = typeof step.swapInfo?.feeMint === "string" ? step.swapInfo.feeMint : null;
    if (fee === null || feeMint === null) continue;
    if (feeMint === inputMint && inAmount !== null) {
      bps += (fee / inAmount) * 10_000;
      found = true;
    } else if (feeMint === outputMint && outAmount !== null) {
      bps += (fee / outAmount) * 10_000;
      found = true;
    }
  }
  return found ? bps : null;
}

export function slippageP95Bps(
  rows: RehearsalRow[],
  mint: string,
  tier: "A" | "B" = "A",
): number {
  const measuredPct = p95CostPct(rows, mint, 10);
  if (measuredPct === null) return tier === "B" ? TIER_B_SLIPPAGE_FALLBACK_BPS : MAJOR_SLIPPAGE_FALLBACK_BPS;
  return round2(Math.max(0, measuredPct * 100));
}

/**
 * Decompose the observed reverse-quote loss without adding it as another cost
 * component. Jupiter documents `outAmount` as net of AMM/platform fees: the
 * residual becomes spread after explicit/fallback fee and impact attribution.
 * When favorable routing makes the observed loss smaller than those known
 * terms, spread floors at zero instead of applying a negative rebate.
 */
export function costFromRoundTripQuotes(
  forward: JupiterQuoteBody,
  reverse: JupiterQuoteBody,
  slippageBps: number,
): ExecutionCost | null {
  const originalIn = finitePositive(forward.inAmount);
  const reverseOut = finitePositive(reverse.outAmount);
  if (originalIn === null || reverseOut === null) return null;

  const observedBps = Math.max(0, (1 - reverseOut / originalIn) * 10_000);
  const rawImpactBps = Math.max(0, Math.abs(impactFromQuoteBody(forward) ?? 0) * 10_000)
    + Math.max(0, Math.abs(impactFromQuoteBody(reverse) ?? 0) * 10_000);
  const priceImpactBps = rawImpactBps;
  const explicitFee = (routeFeeBps(forward) ?? 0) + (routeFeeBps(reverse) ?? 0);
  const dexFeeBps = explicitFee > 0 ? explicitFee : DEX_FEE_BPS;
  const spreadBps = Math.max(0, observedBps - priceImpactBps - dexFeeBps);
  const safeSlippage = Math.max(0, Number.isFinite(slippageBps) ? slippageBps : 0);
  const total = dexFeeBps + priceImpactBps + spreadBps + safeSlippage + PRIORITY_FEE_BPS + FAILED_TX_BPS;

  return {
    dex_fee_bps: round2(dexFeeBps),
    price_impact_bps: round2(priceImpactBps),
    spread_bps: round2(spreadBps),
    slippage_bps: round2(safeSlippage),
    priority_fee_bps: PRIORITY_FEE_BPS,
    failed_tx_bps: FAILED_TX_BPS,
    total_bps: round2(total),
  };
}

export function quoteMoveBps(referencePrice: number, currentPrice: number): number {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) return Infinity;
  return Math.abs(currentPrice / referencePrice - 1) * 10_000;
}

/** Strictly over 5bp or strictly older than 20s; the boundaries remain valid. */
export function quoteNeedsRefresh(referencePrice: number, quoteTsMs: number, currentPrice: number, nowMs: number): boolean {
  return quoteMoveBps(referencePrice, currentPrice) > REQUOTE_MOVE_BPS || nowMs - quoteTsMs > REQUOTE_MAX_AGE_MS;
}

function quoteUrl(inputMint: string, outputMint: string, amount: number): string {
  return `${QUOTE_URL}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50&swapMode=ExactIn`;
}

async function getQuote(url: string, nowFetch: FetchLike): Promise<JupiterQuoteBody | null> {
  try {
    const response = await nowFetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    // In particular, do not retry 429s here; the daemon's existing backoff owns pacing.
    if (!response.ok) return null;
    const body = await response.json();
    return body && typeof body === "object" ? body as JupiterQuoteBody : null;
  } catch {
    return null;
  }
}

export async function fetchExecutionQuote(
  request: ExecutionQuoteRequest,
  nowFetch: FetchLike = fetch,
): Promise<ExecutionQuote | null> {
  const decimals = decimalsFor(request.mint, request.mint_meta ?? []);
  if (decimals === null || !Number.isFinite(request.notional_usd) || request.notional_usd <= 0) return null;
  const nowMs = request.now_ms ?? Date.now();
  const tokenQty = request.side === "sell"
    ? (request.qty && request.qty > 0 ? request.qty : request.reference_price_usd && request.reference_price_usd > 0
      ? request.notional_usd / request.reference_price_usd : null)
    : null;
  if (request.side === "sell" && tokenQty === null) return null;

  const inputAmount = request.side === "buy"
    ? Math.round(request.notional_usd * 10 ** USDC_DECIMALS)
    : Math.round((tokenQty as number) * 10 ** decimals);
  const cacheKey = `${request.mint}:${request.side}:${inputAmount}`;
  const cached = quoteCache.get(cacheKey);
  if (!request.force_refresh && cached && cached.expires_at >= nowMs) return cached.quote;

  const inputMint = request.side === "buy" ? USDC_MINT : request.mint;
  const outputMint = request.side === "buy" ? request.mint : USDC_MINT;
  const forward = await getQuote(quoteUrl(inputMint, outputMint, inputAmount), nowFetch);
  const forwardOut = finitePositive(forward?.outAmount);
  if (!forward || forwardOut === null) return null;

  const reverse = await getQuote(quoteUrl(outputMint, inputMint, Math.round(forwardOut)), nowFetch);
  const slippageBps = slippageP95Bps(request.rehearsals ?? [], request.mint, request.tier ?? "A");
  const cost = reverse ? costFromRoundTripQuotes(forward, reverse, slippageBps) : null;
  const finalCost = cost ?? costFromImpact(impactFromQuoteBody(forward));
  const qty = request.side === "buy" ? forwardOut / 10 ** decimals : tokenQty as number;
  const valueUsd = request.side === "buy" ? request.notional_usd : forwardOut / 10 ** USDC_DECIMALS;
  const priceUsd = request.side === "buy" ? request.notional_usd / qty : valueUsd / qty;
  if (![qty, valueUsd, priceUsd].every((value) => Number.isFinite(value) && value > 0)) return null;

  const quote: ExecutionQuote = {
    mint: request.mint,
    side: request.side,
    price_usd: priceUsd,
    fee_usd: 0,
    qty,
    value_usd: valueUsd,
    quote_ts_ms: nowMs,
    cost: finalCost,
  };
  quoteCache.set(cacheKey, { expires_at: nowMs + QUOTE_CACHE_MS, quote });
  return quote;
}

/** Compatibility wrapper used by existing V3 callers. */
export async function fetchExecutionCost(
  mint: string,
  notionalUsd: number,
  nowFetch: FetchLike = fetch,
  mintMeta: MintMetaRow[] = [],
  rehearsals: RehearsalRow[] = [],
  tier: "A" | "B" = "A",
): Promise<ExecutionCost> {
  const quote = await fetchExecutionQuote({ mint, side: "buy", notional_usd: notionalUsd, mint_meta: mintMeta, rehearsals, tier }, nowFetch);
  return quote?.cost ?? (tier === "B" ? memecoinConservativeCost() : conservativeCost());
}

export function __resetExecutionQuoteCacheForTests(): void {
  quoteCache.clear();
}

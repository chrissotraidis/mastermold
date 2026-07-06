/**
 * Quote-first execution-cost model (V3 plan §11.1). The unit of truth is "what
 * can I execute now, after route price impact and landing cost," NOT what a
 * price API says. Costs are estimated from a real Jupiter quote plus modeled
 * spread/priority/failure terms, in basis points.
 *
 * Pure core (`costFromQuote`, `estimateCost`) + a thin keyless-fetch shell
 * (`fetchExecutionCost`) reusing the same Jupiter lite endpoint as the paper
 * rehearsal. Never throws — a missing quote degrades to a conservative default
 * so the EV gate stays strict rather than optimistic.
 */

import { MINT_DECIMALS } from "../rehearsal";
import type { ExecutionCost } from "./signal";

const QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const FETCH_TIMEOUT_MS = 6_000;

/** Modeled cost terms not derivable from a single quote (basis points). */
export const DEX_FEE_BPS = 25; // typical Solana AMM taker fee, round-trip amortized per side ~25bp
export const BASE_SPREAD_BPS = 5;
export const PRIORITY_FEE_BPS = 3; // small priority fee, size-relative
export const FAILED_TX_BPS = 4; // amortized cost of a failed/late landing
/** Conservative fallback when no quote is available — keeps the EV gate strict. */
export const CONSERVATIVE_TOTAL_BPS = 120;

export function conservativeCost(): ExecutionCost {
  return {
    dex_fee_bps: DEX_FEE_BPS,
    price_impact_bps: CONSERVATIVE_TOTAL_BPS - DEX_FEE_BPS - BASE_SPREAD_BPS - PRIORITY_FEE_BPS - FAILED_TX_BPS,
    spread_bps: BASE_SPREAD_BPS,
    slippage_bps: 0,
    priority_fee_bps: PRIORITY_FEE_BPS,
    failed_tx_bps: FAILED_TX_BPS,
    total_bps: CONSERVATIVE_TOTAL_BPS,
  };
}

/**
 * Pure: assemble an ExecutionCost from a quote's price-impact fraction and the
 * modeled terms. `priceImpactPct` is Jupiter's `priceImpactPct` (a fraction,
 * e.g. 0.0012 = 0.12%). Slippage p95 is estimated as max(impact, base) — the
 * bad case we budget against, not the median.
 */
export function costFromImpact(priceImpactPct: number | null): ExecutionCost {
  const impactBps = priceImpactPct !== null && Number.isFinite(priceImpactPct) ? Math.abs(priceImpactPct) * 10_000 : null;
  if (impactBps === null) return conservativeCost();
  // A single quote is one side; a round trip pays impact twice plus spread.
  const roundTripImpact = impactBps * 2;
  const slippage = Math.max(roundTripImpact * 0.5, BASE_SPREAD_BPS);
  const total = DEX_FEE_BPS + roundTripImpact + BASE_SPREAD_BPS + slippage + PRIORITY_FEE_BPS + FAILED_TX_BPS;
  return {
    dex_fee_bps: DEX_FEE_BPS,
    price_impact_bps: Math.round(roundTripImpact * 100) / 100,
    spread_bps: BASE_SPREAD_BPS,
    slippage_bps: Math.round(slippage * 100) / 100,
    priority_fee_bps: PRIORITY_FEE_BPS,
    failed_tx_bps: FAILED_TX_BPS,
    total_bps: Math.round(total * 100) / 100,
  };
}

/** Pure parser: pull the price-impact fraction out of a Jupiter quote body. */
export function impactFromQuoteBody(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const raw = Number((body as { priceImpactPct?: unknown }).priceImpactPct);
  return Number.isFinite(raw) ? raw : null;
}

/**
 * Fetch a real executable-cost estimate for buying `notionalUsd` of a mint with
 * USDC. Never throws; returns the conservative cost on any failure so the EV
 * gate errs toward NOT trading.
 */
export async function fetchExecutionCost(mint: string, notionalUsd: number, nowFetch = fetch): Promise<ExecutionCost> {
  const decimals = MINT_DECIMALS[mint];
  if (decimals === undefined || !Number.isFinite(notionalUsd) || notionalUsd <= 0) return conservativeCost();
  const amount = Math.round(notionalUsd * 10 ** USDC_DECIMALS);
  try {
    const url = `${QUOTE_URL}?inputMint=${USDC_MINT}&outputMint=${mint}&amount=${amount}&slippageBps=50&swapMode=ExactIn`;
    const response = await nowFetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return conservativeCost();
    return costFromImpact(impactFromQuoteBody(await response.json()));
  } catch {
    return conservativeCost();
  }
}

/**
 * Live-route rehearsal: after every PAPER fill, ask Jupiter's keyless quote
 * API what the same swap would really cost right now, and log the gap.
 *
 * This is the zero-risk half of going live
 * (docs/roadmap/2026-07-03-autonomy-architecture.md, D3/D6): it measures the
 * paper book's 30bps-per-side cost model against real routes so the go-live
 * decision rests on data, not on the model's assumption about itself. No
 * wallet, no signing, no sending — one GET per fill, and failures degrade to
 * null (a missed rehearsal must never fail a trade that already happened).
 */

import type { TradeIntent } from "./intent";

const QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const FETCH_TIMEOUT_MS = 5_000;
const SLIPPAGE_BPS = 50;

/** SPL decimals for the fixed paper universe. Informational only — a wrong
 * entry shows up as an absurd effective price in the rehearsal log, and
 * nothing downstream trades on it. */
export const MINT_DECIMALS: Record<string, number> = {
  So11111111111111111111111111111111111111112: 9, // SOL
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 6, // JUP
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 5, // BONK
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: 6, // WIF
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: 9, // JTO
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": 8, // WETH (Wormhole)
  "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh": 8, // WBTC (Wormhole)
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": 6, // RAY
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: 6, // PYTH
};

export type SwapRehearsal = {
  symbol: string;
  side: "buy" | "sell";
  notional_usd: number;
  paper_price_usd: number;
  /** Effective USD price per token implied by the quoted route. */
  quoted_price_usd: number | null;
  /** Signed: positive means the live route is WORSE than the paper fill. */
  live_cost_vs_paper_pct: number | null;
  price_impact_pct: number | null;
  route_labels: string[];
  status: "quoted" | "no-route" | "error";
  detail: string;
};

type QuoteArgs = {
  symbol: string;
  side: "buy" | "sell";
  notional_usd: number;
  paper_price_usd: number;
  token_decimals: number;
};

/**
 * Pure parser over a Jupiter v1 quote body. Buys quote USDC→token (inAmount
 * is USDC), sells quote token→USDC (outAmount is USDC); either way the
 * effective price is usdc_amount / token_amount, and "worse than paper" means
 * buying above or selling below the paper price.
 */
export function parseQuoteRehearsal(body: unknown, args: QuoteArgs): SwapRehearsal {
  const base: Omit<SwapRehearsal, "status" | "detail"> = {
    symbol: args.symbol,
    side: args.side,
    notional_usd: args.notional_usd,
    paper_price_usd: args.paper_price_usd,
    quoted_price_usd: null,
    live_cost_vs_paper_pct: null,
    price_impact_pct: null,
    route_labels: [],
  };
  if (!body || typeof body !== "object") {
    return { ...base, status: "error", detail: "quote body was not an object" };
  }
  const quote = body as Record<string, unknown>;
  const inAmount = Number(quote.inAmount);
  const outAmount = Number(quote.outAmount);
  if (!Number.isFinite(inAmount) || !Number.isFinite(outAmount) || inAmount <= 0 || outAmount <= 0) {
    return { ...base, status: "no-route", detail: "no usable route in the quote response" };
  }

  const usdcRaw = args.side === "buy" ? inAmount : outAmount;
  const tokenRaw = args.side === "buy" ? outAmount : inAmount;
  const usdc = usdcRaw / 10 ** USDC_DECIMALS;
  const tokens = tokenRaw / 10 ** args.token_decimals;
  if (tokens <= 0) return { ...base, status: "no-route", detail: "quoted token amount was zero" };
  const quotedPrice = usdc / tokens;

  // Positive = live is worse: buys fill above paper, sells fill below it.
  const gap = ((quotedPrice - args.paper_price_usd) / args.paper_price_usd) * 100;
  const liveCostVsPaper = args.side === "buy" ? gap : -gap;

  const impact = Number(quote.priceImpactPct);
  const routePlan = Array.isArray(quote.routePlan) ? quote.routePlan : [];
  const labels = routePlan
    .map((leg) => (leg && typeof leg === "object" ? (leg as { swapInfo?: { label?: unknown } }).swapInfo?.label : null))
    .filter((label): label is string => typeof label === "string");

  return {
    ...base,
    quoted_price_usd: quotedPrice,
    live_cost_vs_paper_pct: Number.isFinite(liveCostVsPaper) ? liveCostVsPaper : null,
    price_impact_pct: Number.isFinite(impact) ? impact * 100 : null,
    route_labels: labels.slice(0, 4),
    status: "quoted",
    detail: `route quoted ${labels.length > 0 ? `via ${labels[0]}` : "ok"}`,
  };
}

/** One-line summary for the web3 memory log. */
export function describeRehearsal(rehearsal: SwapRehearsal): string {
  if (rehearsal.status !== "quoted" || rehearsal.quoted_price_usd === null) {
    return `Live-route check ${rehearsal.symbol}: ${rehearsal.detail}.`;
  }
  const gap = rehearsal.live_cost_vs_paper_pct ?? 0;
  const impact = rehearsal.price_impact_pct;
  return (
    `Live-route check ${rehearsal.symbol} ${rehearsal.side}: paper $${rehearsal.paper_price_usd.toFixed(4)}, ` +
    `Jupiter $${rehearsal.quoted_price_usd.toFixed(4)} (${gap >= 0 ? "+" : ""}${gap.toFixed(2)}% vs paper` +
    `${impact !== null ? `, impact ${impact.toFixed(2)}%` : ""}).`
  );
}

/**
 * Fetch a live Jupiter quote mirroring a paper fill. Never throws; returns
 * null when the mint has no known decimals so callers can fire-and-forget.
 */
export async function rehearseFill(
  intent: TradeIntent,
  fill: { qty: number; price_usd: number; value_usd: number },
): Promise<SwapRehearsal | null> {
  const decimals = MINT_DECIMALS[intent.mint];
  if (decimals === undefined) return null;
  const args: QuoteArgs = {
    symbol: intent.symbol,
    side: intent.action,
    notional_usd: fill.value_usd,
    paper_price_usd: fill.price_usd,
    token_decimals: decimals,
  };
  const [inputMint, outputMint] =
    intent.action === "buy" ? [USDC_MINT, intent.mint] : [intent.mint, USDC_MINT];
  const amount =
    intent.action === "buy"
      ? Math.round(fill.value_usd * 10 ** USDC_DECIMALS) // spend this much USDC
      : Math.round(fill.qty * 10 ** decimals); // sell this many tokens
  if (!Number.isFinite(amount) || amount <= 0) return null;

  try {
    const url = `${QUOTE_URL}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${SLIPPAGE_BPS}&swapMode=ExactIn`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ...parseQuoteRehearsal(null, args), status: "error", detail: `quote fetch ${response.status}` };
    }
    return parseQuoteRehearsal(await response.json(), args);
  } catch (error) {
    return {
      ...parseQuoteRehearsal(null, args),
      status: "error",
      detail: `quote fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

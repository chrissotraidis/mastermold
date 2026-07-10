/**
 * Module `copy_wallets` — slow-horizon smart-money following (2026-07-09).
 *
 * The best-evidenced copy edge at retail scale is NOT sub-minute mirroring
 * (a 2-second delay already buys the originator's exit); it is following a
 * small, hand-picked list of historically profitable wallets into positions
 * held hours-to-days. This module watches an operator-curated wallet list via
 * the public Solana RPC — free tier, no keys — and turns detected BUYS into
 * `CandidateSignal`s for the V3 shadow router, where the EV gate, calibration,
 * and the promotion gate decide if the signal ever touches the paper book.
 *
 * Detection is balance-delta based: for each new transaction on a watched
 * wallet, a positive token delta paired with a negative quote delta
 * (USDC/USDT/wrapped SOL or native SOL) reads as a buy of that token. Pure
 * parsers over canned RPC bodies; the fetch shell never throws and caps its
 * request budget per cycle so public-RPC rate limits stay comfortable.
 */

import type { PriceObservation } from "./candidate-store";
import { toExpectedValue, type CandidateSignal, type ExecutionCost, type MarketRegime } from "./signal";

export type WalletBuyEvent = {
  wallet: string;
  mint: string;
  /** Token units acquired (UI amount). */
  ui_amount: number;
  /** USD spent when the quote side was a stable; null when quoted in SOL. */
  quote_spent_usd: number | null;
  ts: string;
  signature: string;
};

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const QUOTE_MINTS = new Set([USDC_MINT, USDT_MINT, WSOL_MINT]);
/** Ignore dust: airdrops and rounding noise are not conviction. */
const MIN_QUOTE_SPENT_USD = 50;
const MIN_SOL_SPENT = 0.25;

/** Base58 Solana address sanity (length + alphabet), for config validation. */
export function isPlausibleSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

type TokenBalance = {
  mint?: unknown;
  owner?: unknown;
  uiTokenAmount?: { uiAmount?: unknown };
};

/**
 * Pure: extract this wallet's buys from one `getTransaction` (jsonParsed)
 * body. A buy = positive token delta in a non-quote mint AND value flowing
 * out of a quote (stable/wSOL token delta, or native SOL when the wallet is
 * the fee payer and its lamports dropped beyond fee noise).
 */
export function buysFromTransaction(body: unknown, wallet: string): WalletBuyEvent[] {
  const tx = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const result = (tx?.result ?? tx) as Record<string, unknown> | null;
  const meta = result?.meta as Record<string, unknown> | undefined;
  if (!meta || meta.err !== null) return [];
  const blockTime = typeof result?.blockTime === "number" ? result.blockTime : null;
  const transaction = result?.transaction as Record<string, unknown> | undefined;
  const signature = Array.isArray(transaction?.signatures) ? String(transaction.signatures[0] ?? "") : "";

  const deltaByMint = new Map<string, number>();
  const tally = (rows: unknown, sign: 1 | -1) => {
    if (!Array.isArray(rows)) return;
    for (const raw of rows as TokenBalance[]) {
      if (raw?.owner !== wallet || typeof raw.mint !== "string") continue;
      const amount = raw.uiTokenAmount?.uiAmount;
      if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
      deltaByMint.set(raw.mint, (deltaByMint.get(raw.mint) ?? 0) + sign * amount);
    }
  };
  tally(meta.postTokenBalances, 1);
  tally(meta.preTokenBalances, -1);

  // Native SOL delta: accountKeys align with pre/postBalances by index.
  let solDelta = 0;
  const message = transaction?.message as Record<string, unknown> | undefined;
  const accountKeys = Array.isArray(message?.accountKeys) ? (message.accountKeys as unknown[]) : [];
  const pre = Array.isArray(meta.preBalances) ? (meta.preBalances as unknown[]) : [];
  const post = Array.isArray(meta.postBalances) ? (meta.postBalances as unknown[]) : [];
  accountKeys.forEach((key, index) => {
    const pubkey = typeof key === "string" ? key : (key as { pubkey?: unknown })?.pubkey;
    if (pubkey !== wallet) return;
    const before = Number(pre[index]);
    const after = Number(post[index]);
    if (Number.isFinite(before) && Number.isFinite(after)) solDelta += (after - before) / 1e9;
  });

  const stableSpent = -Math.min(0, (deltaByMint.get(USDC_MINT) ?? 0) + (deltaByMint.get(USDT_MINT) ?? 0));
  const wsolSpent = -Math.min(0, deltaByMint.get(WSOL_MINT) ?? 0);
  const solSpent = -Math.min(0, solDelta);
  const paidQuote = stableSpent >= MIN_QUOTE_SPENT_USD || wsolSpent >= MIN_SOL_SPENT || solSpent >= MIN_SOL_SPENT;
  if (!paidQuote) return [];

  const events: WalletBuyEvent[] = [];
  for (const [mint, delta] of deltaByMint) {
    if (QUOTE_MINTS.has(mint) || delta <= 0) continue;
    events.push({
      wallet,
      mint,
      ui_amount: delta,
      quote_spent_usd: stableSpent >= MIN_QUOTE_SPENT_USD ? Math.round(stableSpent * 100) / 100 : null,
      ts: blockTime ? new Date(blockTime * 1000).toISOString() : new Date(0).toISOString(),
      signature,
    });
  }
  return events;
}

// --- fetch shell (public RPC, strict request budget, never throws) -----------

const RPC_TIMEOUT_MS = 8_000;
/** Per cycle: signatures per wallet, and transactions inspected per wallet. */
export const MAX_TX_LOOKUPS_PER_WALLET = 3;
export const MAX_WATCHED_WALLETS = 8;

async function rpcCall(rpcUrl: string, method: string, params: unknown[], doFetch: typeof fetch): Promise<unknown> {
  const response = await doFetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`rpc ${method} ${response.status}`);
  return response.json();
}

export type WalletScanResult = {
  events: WalletBuyEvent[];
  /** Newest seen signature per wallet — next cycle's cursor. */
  cursors: Record<string, string>;
};

/**
 * Scan watched wallets for buys since the given per-wallet cursors. Budgeted:
 * one signature listing per wallet plus at most MAX_TX_LOOKUPS_PER_WALLET
 * transaction fetches. Any per-wallet failure degrades to no events for that
 * wallet; the function itself never throws.
 */
export async function scanWatchedWallets(
  wallets: string[],
  cursors: Record<string, string>,
  rpcUrl: string,
  doFetch: typeof fetch = fetch,
): Promise<WalletScanResult> {
  const events: WalletBuyEvent[] = [];
  const nextCursors: Record<string, string> = { ...cursors };
  for (const wallet of wallets.slice(0, MAX_WATCHED_WALLETS)) {
    try {
      const listing = (await rpcCall(
        rpcUrl,
        "getSignaturesForAddress",
        [wallet, { limit: 10, ...(cursors[wallet] ? { until: cursors[wallet] } : {}) }],
        doFetch,
      )) as { result?: Array<{ signature?: unknown; err?: unknown }> };
      const rows = Array.isArray(listing?.result) ? listing.result : [];
      const fresh = rows
        .filter((row) => row && row.err === null && typeof row.signature === "string")
        .map((row) => row.signature as string);
      if (fresh.length === 0) continue;
      // Without a cursor this is the first sight of the wallet: set the
      // watermark to the newest signature but do not replay history.
      if (!cursors[wallet]) {
        nextCursors[wallet] = fresh[0];
        continue;
      }
      // The listing is newest-first; process OLDEST-first and advance the
      // watermark per fully-processed transaction. `until` returns everything
      // newer than the watermark, so a mid-loop RPC failure or the per-cycle
      // lookup cap just leaves the rest for the next cycle — nothing is
      // skipped and nothing is double-processed. (The original version
      // advanced the cursor to fresh[0] up front, which silently dropped
      // every transaction the loop hadn't inspected yet.)
      const oldestFirst = [...fresh].reverse();
      for (const signature of oldestFirst.slice(0, MAX_TX_LOOKUPS_PER_WALLET)) {
        const tx = await rpcCall(
          rpcUrl,
          "getTransaction",
          [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
          doFetch,
        );
        events.push(...buysFromTransaction(tx, wallet));
        nextCursors[wallet] = signature;
      }
    } catch {
      // This wallet's scan failed (rate limit, RPC hiccup): the watermark
      // stays at the last fully-processed transaction; next cycle resumes.
    }
  }
  return { events, cursors: nextCursors };
}

// --- candidate builder --------------------------------------------------------

// --- per-wallet report cards ---------------------------------------------------

/** Grade a followed wallet's buys at this horizon (matches the 6h forward
 * labels the shadow already computes — one clock for all evidence). */
export const WALLET_GRADE_HORIZON_MS = 6 * 60 * 60_000;
/** A bar must sit within this window of the wanted moment to count. */
const GRADE_TOLERANCE_MS = 15 * 60_000;

export type WalletReportCard = {
  wallet: string;
  buys: number;
  graded: number;
  /** Fraction of graded buys that were up at the horizon. */
  hit_rate: number | null;
  avg_return_pct: number | null;
  last_buy_at: string | null;
};

/** Nearest observation to `ms` within tolerance, else null. */
function priceNear(series: PriceObservation[] | undefined, ms: number): number | null {
  if (!series) return null;
  let best: PriceObservation | null = null;
  for (const observation of series) {
    if (Math.abs(observation.ts - ms) > GRADE_TOLERANCE_MS) continue;
    if (!best || Math.abs(observation.ts - ms) < Math.abs(best.ts - ms)) best = observation;
  }
  return best?.price ?? null;
}

/**
 * Judge each followed wallet by what OUR OWN price record says happened after
 * its buys — the discovery leaderboard got them followed; this decides
 * whether they stay followed. Pure: buys + minute-bar series in, cards out.
 * Buys the bars can't price (mint never tracked, or younger than the horizon)
 * stay ungraded rather than guessed.
 */
export function walletReportCards(
  buys: WalletBuyEvent[],
  seriesByMint: Map<string, PriceObservation[]>,
  nowMs: number,
): WalletReportCard[] {
  const byWallet = new Map<string, WalletBuyEvent[]>();
  for (const buy of buys) {
    byWallet.set(buy.wallet, [...(byWallet.get(buy.wallet) ?? []), buy]);
  }

  return [...byWallet.entries()].map(([wallet, walletBuys]) => {
    const returns: number[] = [];
    for (const buy of walletBuys) {
      const buyMs = Date.parse(buy.ts);
      if (!Number.isFinite(buyMs) || nowMs - buyMs < WALLET_GRADE_HORIZON_MS) continue;
      const series = seriesByMint.get(buy.mint);
      const entry = priceNear(series, buyMs);
      const exit = priceNear(series, buyMs + WALLET_GRADE_HORIZON_MS);
      if (entry === null || exit === null || entry <= 0) continue;
      returns.push(((exit - entry) / entry) * 100);
    }
    const wins = returns.filter((value) => value > 0).length;
    const lastBuy = walletBuys.map((buy) => buy.ts).sort().at(-1) ?? null;
    return {
      wallet,
      buys: walletBuys.length,
      graded: returns.length,
      hit_rate: returns.length > 0 ? Math.round((wins / returns.length) * 100) / 100 : null,
      avg_return_pct:
        returns.length > 0
          ? Math.round((returns.reduce((sum, value) => sum + value, 0) / returns.length) * 100) / 100
          : null,
      last_buy_at: lastBuy,
    };
  });
}

export const COPY_MIN_LIQUIDITY_USD = 150_000;
/** Conservative gross-return map from distinct-wallet conviction (research:
 * copiers realize ~3%/trade from strong originators; we start well under). */
export const COPY_BPS_PER_WALLET = 90;
export const COPY_MAX_EXPECTED_BPS = 270;

export function copyWalletsEnabledIn(regime: MarketRegime): boolean {
  return regime !== "risk_off";
}

/**
 * Build a candidate from recent buys of one mint. Conviction = distinct
 * watched wallets buying inside the window; liquidity/price must be supplied
 * by the shell (DexScreener lookup) or the EV gate rejects it anyway.
 */
export function copyWalletCandidate(input: {
  mint: string;
  symbol: string;
  events: WalletBuyEvent[];
  price_usd: number | null;
  liquidity_usd: number | null;
  cost: ExecutionCost;
}): CandidateSignal | null {
  const wallets = [...new Set(input.events.map((event) => event.wallet))];
  if (wallets.length === 0) return null;
  if (input.price_usd === null || input.price_usd <= 0) return null;
  if ((input.liquidity_usd ?? 0) < COPY_MIN_LIQUIDITY_USD) return null;

  const expectedReturnBps = Math.min(COPY_MAX_EXPECTED_BPS, wallets.length * COPY_BPS_PER_WALLET);
  const evBps = toExpectedValue(expectedReturnBps, input.cost);
  const spentUsd = input.events.reduce((sum, event) => sum + (event.quote_spent_usd ?? 0), 0);
  return {
    strategy_id: "copy_wallets",
    token_mint: input.mint,
    symbol: input.symbol,
    side: "buy",
    horizon_sec: 24 * 60 * 60, // follow into holds, never mirror ticks
    expected_return_bps: expectedReturnBps,
    cost: input.cost,
    expected_value_bps: evBps,
    confidence: Math.min(0.8, 0.4 + wallets.length * 0.15),
    max_loss_bps: 300,
    liquidity_usd: input.liquidity_usd ?? 0,
    features: {
      wallets: wallets.length,
      buys: input.events.length,
      quote_spent_usd: Math.round(spentUsd),
      liquidity_usd: input.liquidity_usd ?? 0,
    },
    reason: `copy: ${wallets.length} watched wallet${wallets.length === 1 ? "" : "s"} bought ${input.symbol}${spentUsd > 0 ? ` (~$${Math.round(spentUsd)})` : ""}; exp +${expectedReturnBps}bp vs cost ${input.cost.total_bps.toFixed(0)}bp → EV ${evBps.toFixed(0)}bp.`,
  };
}

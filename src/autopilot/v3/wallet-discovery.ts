/**
 * Smart-wallet discovery (2026-07-09): the copy_wallets module needs wallets
 * worth following, and hunting leaderboards by hand is exactly the kind of
 * work the system should do itself. Two sources, ranked by evidence quality:
 *
 *  1. SolanaTracker `/v2/pnl/leaderboard/top` — the only free, documented,
 *     purpose-built profitable-wallet leaderboard (set SOLANATRACKER_API_KEY;
 *     free tier 2,500 req/month per the account holder — metered by the
 *     daemon via v3/api-budget.ts, never assumed unlimited). Server-side
 *     quality filters help, but identity labels (bot/pool/developer/exchange)
 *     were `null` for every wallet observed live — NOT reliable alone; our
 *     own MAX_TRADES/MAX_TOKENS_TRADED ceilings are the load-bearing filter
 *     for institutional/MM-scale activity. This endpoint has no working
 *     pagination (page/offset are silently ignored), so one call = one
 *     top-100 snapshot; sort=win_percentage is used because sort=realized's
 *     top 100 was 100% whale/MM-scale in live testing and yielded zero
 *     candidates after filtering.
 *  2. Keyless fallback: GeckoTerminal pool trades on the trending pools the
 *     radar already tracks — aggregates recent buyers by volume. No PnL
 *     history, so these are "activity-only" leads, scored low and flagged.
 *
 * Anti-trap scoring encodes the 2026 copy-trading research: 90%+ win rates
 * are bot/insider red flags (the sweet spot is 45–80%) — heavily discounted
 * and flagged rather than excluded, since win_percentage-sorted results are
 * dominated by near-perfect records in practice and flagging beats showing
 * nothing. Realized PnL beats paper PnL, one-hit wonders and sub-20-trade
 * windows prove nothing, MM/institutional trade-count scale is excluded
 * outright, and labeled bots/pools/devs are excluded outright. Suggestions
 * are SUGGESTIONS: a human clicks Follow; nothing auto-follows.
 */

import { isPlausibleSolanaAddress } from "./smart-wallets";

export type SuggestedWallet = {
  address: string;
  source: "solanatracker" | "gecko_trades";
  /** 0–100; excluded wallets never appear at all. */
  score: number;
  win_rate: number | null; // 0..1
  realized_pnl_usd: number | null;
  trades: number | null;
  tokens_traded: number | null;
  period_days: number;
  /** Human-readable caveats ("activity-only lead", "high win rate"). */
  flags: string[];
};

export type WalletSuggestions = {
  ts: string;
  source: "solanatracker" | "gecko_trades" | "none";
  suggestions: SuggestedWallet[];
};

export const SUGGESTIONS_TTL_MS = 12 * 60 * 60_000;
export const MAX_SUGGESTIONS = 10;

/** Win-rate band (research): under 0.40 is losing, over 0.90 is a bot/insider
 * pattern (instant-sell scripts, cherry-picked fresh wallets). */
export const WIN_RATE_FLOOR = 0.4;
export const WIN_RATE_BOT_CEILING = 0.9;
export const MIN_TRADES = 20;
/**
 * Hard trade/token ceilings (2026-07-10, discovered against the LIVE
 * SolanaTracker leaderboard): `sort=realized` is dominated by wallets with
 * 100,000–1,200,000+ trades and 1,400+ tokens closed in a 30-day window —
 * market-maker/institutional-scale activity, not a human's conviction picks —
 * and the API's `identity` label was `null` for every one of them in
 * practice, so it cannot be trusted as the sole bot filter. These ceilings
 * are the load-bearing exclusion: generous enough for a very active manual
 * trader (a few hundred trades, a few dozen tokens a month), well below any
 * observed bot/MM wallet.
 */
export const MAX_TRADES = 3_000;
export const MAX_TOKENS_TRADED = 150;

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pure anti-trap scorer. Returns null when the wallet should be excluded
 * outright; otherwise a scored suggestion with honest flags.
 */
export function scoreLeaderboardWallet(input: {
  address: string;
  win_rate: number | null;
  realized_pnl_usd: number | null;
  trades: number | null;
  tokens_traded: number | null;
  period_days: number;
  labeled_bot: boolean;
  labeled_infra: boolean; // pool / exchange / developer / hacker
}): SuggestedWallet | null {
  if (!isPlausibleSolanaAddress(input.address)) return null;
  if (input.labeled_bot || input.labeled_infra) return null;
  if ((input.trades ?? 0) < MIN_TRADES) return null;
  if ((input.trades ?? 0) > MAX_TRADES) return null; // MM/institutional scale, not a human
  if ((input.tokens_traded ?? 0) > MAX_TOKENS_TRADED) return null; // scanning bot, not curated conviction
  if (input.realized_pnl_usd === null || input.realized_pnl_usd <= 0) return null;
  if (input.win_rate !== null && input.win_rate < WIN_RATE_FLOOR) return null;

  const flags: string[] = [];
  let score = 40;

  if (input.win_rate !== null) {
    if (input.win_rate > WIN_RATE_BOT_CEILING) {
      // Not excluded (the leaderboard already filtered bots) but heavily
      // discounted and flagged — perfection is a red flag, not a credential.
      flags.push(`${Math.round(input.win_rate * 100)}% win rate — bot/insider pattern, verify manually`);
      score -= 20;
    } else {
      // Peak credit at ~60% win rate, tapering toward both band edges.
      score += Math.max(0, 25 - Math.abs(input.win_rate - 0.6) * 100);
    }
  } else {
    flags.push("win rate unknown");
  }

  // Realized PnL on a log scale: $1k → ~+7, $10k → ~+14, $100k → ~+21 (capped).
  score += Math.min(25, Math.log10(input.realized_pnl_usd / 1_000 + 1) * 7 + 7);

  const tokens = input.tokens_traded;
  if (tokens !== null) {
    if (tokens >= 5 && tokens <= 40) score += 10;
    else if (tokens > 100) {
      flags.push(`${tokens} tokens traded — spray-everything pattern`);
      score -= 10;
    }
  }

  return {
    address: input.address,
    source: "solanatracker",
    score: Math.max(1, Math.min(100, Math.round(score))),
    win_rate: input.win_rate,
    realized_pnl_usd: input.realized_pnl_usd,
    trades: input.trades,
    tokens_traded: tokens,
    period_days: input.period_days,
    flags,
  };
}

/** Pure parser over the SolanaTracker leaderboard body. Defensive: unknown
 * shapes yield [], and every field degrades to null rather than throwing. */
export function parseSolanaTrackerLeaderboard(body: unknown, periodDays: number): SuggestedWallet[] {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rows = Array.isArray(root.traders) ? root.traders : Array.isArray(root.data) ? root.data : [];
  const suggestions: SuggestedWallet[] = [];
  for (const raw of rows as Array<Record<string, unknown>>) {
    if (!raw || typeof raw !== "object") continue;
    const address = typeof raw.wallet === "string" ? raw.wallet : typeof raw.address === "string" ? raw.address : null;
    if (!address) continue;
    const period = (raw.period ?? {}) as Record<string, unknown>;
    const counts = (raw.counts ?? {}) as Record<string, unknown>;
    const tokens = (raw.tokens ?? {}) as Record<string, unknown>;
    const identity = (raw.identity ?? {}) as Record<string, unknown>;
    const winRateRaw = asNumber(raw.winRate ?? (period.days as Record<string, unknown> | undefined)?.winRate);
    const scored = scoreLeaderboardWallet({
      address,
      // The API reports percentages (e.g. 62.5); normalize to 0..1.
      win_rate: winRateRaw !== null ? (winRateRaw > 1 ? winRateRaw / 100 : winRateRaw) : null,
      realized_pnl_usd: asNumber(period.realized ?? raw.realized),
      trades: asNumber(counts.trades ?? raw.trades),
      tokens_traded: asNumber(tokens.closed ?? tokens.total ?? raw.tokensTraded),
      period_days: periodDays,
      labeled_bot: identity.bot === true,
      labeled_infra:
        identity.pool === true || identity.exchange === true || identity.developer === true || identity.hacker === true,
    });
    if (scored) suggestions.push(scored);
  }
  return suggestions.sort((a, b) => b.score - a.score).slice(0, MAX_SUGGESTIONS);
}

/**
 * Pure parser over GeckoTerminal pool trades: aggregate buyers by USD volume.
 * No PnL history exists here, so every result is a low-scored, clearly
 * flagged "activity-only" lead — a starting point for manual vetting.
 */
export function tradersFromPoolTrades(body: unknown, minBuys = 2): SuggestedWallet[] {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rows = Array.isArray(root.data) ? (root.data as Array<Record<string, unknown>>) : [];
  const byWallet = new Map<string, { buys: number; volume: number }>();
  for (const row of rows) {
    const attributes = (row?.attributes ?? {}) as Record<string, unknown>;
    if (attributes.kind !== "buy") continue;
    const wallet = typeof attributes.tx_from_address === "string" ? attributes.tx_from_address : null;
    const volume = asNumber(attributes.volume_in_usd);
    if (!wallet || volume === null || !isPlausibleSolanaAddress(wallet)) continue;
    const entry = byWallet.get(wallet) ?? { buys: 0, volume: 0 };
    entry.buys += 1;
    entry.volume += volume;
    byWallet.set(wallet, entry);
  }
  return [...byWallet.entries()]
    .filter(([, stats]) => stats.buys >= minBuys && stats.volume >= 500)
    .sort((a, b) => b[1].volume - a[1].volume)
    .slice(0, MAX_SUGGESTIONS)
    .map(([address, stats]) => ({
      address,
      source: "gecko_trades" as const,
      // Capped low by construction: activity is not a track record.
      score: Math.min(30, 10 + Math.round(Math.log10(stats.volume) * 4)),
      win_rate: null,
      realized_pnl_usd: null,
      trades: stats.buys,
      tokens_traded: null,
      period_days: 0,
      flags: ["activity-only lead from a trending pool — no PnL history, verify before following"],
    }));
}

// --- fetch shell ----------------------------------------------------------------

const FETCH_TIMEOUT_MS = 10_000;
const LEADERBOARD_URL = "https://data.solanatracker.io/v2/pnl/leaderboard/top";
const GECKO_TRADES_URL = "https://api.geckoterminal.com/api/v2/networks/solana/pools";
export const LEADERBOARD_PERIOD_DAYS = 30;

/**
 * Fetch fresh wallet suggestions. With SOLANATRACKER_API_KEY set, the real
 * leaderboard (server-side quality filters engaged); otherwise the keyless
 * trending-pool fallback. Never throws; empty suggestions on total failure.
 */
export async function fetchWalletSuggestions(
  options: {
    apiKey?: string | null;
    /** Trending pool addresses (from the radar) for the keyless fallback. */
    trendingPools?: string[];
    nowMs?: number;
    fetchImpl?: typeof fetch;
    /** Budget gate: false skips the paid call even with a key present (this
     * month's soft-stop reached). Omitted/undefined means "allowed" — callers
     * without a budget tracker still work, just unmetered. */
    budgetAllows?: boolean;
    /** Invoked once, only after a successful leaderboard response, so the
     * caller can record real usage — never called for a skipped/failed call. */
    onLeaderboardCall?: () => void;
  } = {},
): Promise<WalletSuggestions> {
  const doFetch = options.fetchImpl ?? fetch;
  const nowMs = options.nowMs ?? Date.now();
  const ts = new Date(nowMs).toISOString();

  const apiKey = options.apiKey ?? process.env.SOLANATRACKER_API_KEY?.trim() ?? null;
  if (apiKey && options.budgetAllows !== false) {
    try {
      const params = new URLSearchParams({
        days: String(LEADERBOARD_PERIOD_DAYS),
        // sort=win_percentage, not realized (verified live, 2026-07-10): the
        // realized-sorted leaderboard's top 100 rows were 100% MM/institutional
        // scale (1.1M+ trades each) with identity=null — MAX_TRADES/
        // MAX_TOKENS_TRADED excluded every single one, yielding zero
        // candidates. win_percentage's top 100 all cleared the trap filters
        // structurally (human-scale trade/token counts); the scorer's
        // WIN_RATE_BOT_CEILING discount+flag is what keeps the near-perfect
        // records from being trusted at face value. This endpoint offers no
        // working pagination (page/offset params were silently ignored in
        // testing), so a single top-100 pull is genuinely all one call buys.
        sort: "win_percentage",
        limit: "50",
        minTrades: String(MIN_TRADES),
        minDays: "3",
        minWinRate: String(Math.round(WIN_RATE_FLOOR * 100)),
        maxSingleTokenPct: "40", // one-hit wonders out (research heuristic)
        pnlMode: "strict", // realized only — paper gains are bait
      });
      const response = await doFetch(`${LEADERBOARD_URL}?${params}`, {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      options.onLeaderboardCall?.(); // the request landed — count it regardless of body shape
      if (response.ok) {
        const suggestions = parseSolanaTrackerLeaderboard(await response.json(), LEADERBOARD_PERIOD_DAYS);
        if (suggestions.length > 0) return { ts, source: "solanatracker", suggestions };
      }
    } catch {
      // Fall through to the keyless path.
    }
  }

  for (const pool of (options.trendingPools ?? []).slice(0, 2)) {
    try {
      const response = await doFetch(
        `${GECKO_TRADES_URL}/${pool}/trades?trade_volume_in_usd_greater_than=100`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      );
      if (!response.ok) continue;
      const suggestions = tradersFromPoolTrades(await response.json());
      if (suggestions.length > 0) return { ts, source: "gecko_trades", suggestions };
    } catch {
      continue;
    }
  }

  return { ts, source: "none", suggestions: [] };
}

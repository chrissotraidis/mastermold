import { UNIVERSE } from "../universe";
import { decimalsFor, type MintMetaRow } from "../mint-meta";
import { EXCLUDED_MINTS, type TrendingToken } from "./trending";

export type TierBToken = {
  symbol: string;
  mint: string;
  liquidity_usd: number;
  volume_h24_usd: number;
  first_seen_ts: string;
  added_ts: string;
  below_exit_floor_days: number;
};

export type TierBConfig = {
  max_tokens: number;
  min_liquidity_usd: number;
  min_volume_h24_usd: number;
  min_age_days: number;
  exit_liquidity_usd: number;
  exit_grace_days: number;
};

export const DEFAULT_TIER_B_CONFIG: TierBConfig = {
  max_tokens: 12,
  min_liquidity_usd: 750_000,
  min_volume_h24_usd: 1_000_000,
  min_age_days: 14,
  exit_liquidity_usd: 500_000,
  exit_grace_days: 3,
};

/** The shell attaches its persisted first-sighting timestamp and resolved
 * decimals before invoking the pure selector. Missing decimals fail closed. */
export type TierBCandidate = TrendingToken & {
  first_seen_ts?: string;
  decimals?: number | null;
};

export type TierBSelection = {
  next: TierBToken[];
  added: TierBToken[];
  dropped: Array<{ token: TierBToken; reason: string }>;
};

const TIER_A_MINTS = new Set(UNIVERSE.map((asset) => asset.mint));
const RUG_LIQUIDITY_USD = 250_000;
const DAY_MS = 24 * 60 * 60_000;

function eligibleDecimals(candidate: TierBCandidate): boolean {
  return (
    typeof candidate.decimals === "number" &&
    Number.isInteger(candidate.decimals) &&
    candidate.decimals >= 0 &&
    candidate.decimals <= 18
  );
}

function hardExcluded(candidate: Pick<TierBCandidate, "mint">, denylist: Set<string>): boolean {
  return TIER_A_MINTS.has(candidate.mint) || EXCLUDED_MINTS.has(candidate.mint) || denylist.has(candidate.mint);
}

function selectionScore(candidate: Pick<TierBCandidate, "volume_h24_usd" | "liquidity_usd">): number {
  return (candidate.volume_h24_usd ?? 0) * Math.sqrt(Math.max(0, candidate.liquidity_usd ?? 0));
}

function finiteMetric(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Daily Tier B rotation. Entry uses the high floors; exit uses a lower floor
 * plus a consecutive-day grace window. A vanished token or rug-level
 * liquidity exits the tradable set immediately; any open position remains in
 * the daemon's separately priced exit-only set.
 */
export function selectTierB(
  current: TierBToken[],
  candidates: TierBCandidate[],
  denylist: Set<string>,
  cfg: TierBConfig,
  now_ms: number,
): TierBSelection {
  const nowIso = new Date(now_ms).toISOString();
  const byMint = new Map<string, TierBCandidate>();
  for (const candidate of candidates) {
    if (!candidate.mint || byMint.has(candidate.mint)) continue;
    byMint.set(candidate.mint, candidate);
  }

  const dropped: TierBSelection["dropped"] = [];
  const survivors: TierBToken[] = [];
  for (const token of current) {
    const candidate = byMint.get(token.mint);
    if (hardExcluded(token, denylist)) {
      dropped.push({ token, reason: "hard exclusion or operator denylist" });
      continue;
    }
    if (!candidate) {
      dropped.push({ token, reason: "vanished from the trending feed" });
      continue;
    }
    if (!eligibleDecimals(candidate)) {
      dropped.push({ token, reason: "mint decimals are unresolved" });
      continue;
    }
    const liquidity = finiteMetric(candidate.liquidity_usd);
    const volume = finiteMetric(candidate.volume_h24_usd);
    if (liquidity < RUG_LIQUIDITY_USD) {
      dropped.push({ token, reason: `liquidity $${Math.round(liquidity)} below the immediate $${RUG_LIQUIDITY_USD} rug floor` });
      continue;
    }
    const belowDays = liquidity < cfg.exit_liquidity_usd ? token.below_exit_floor_days + 1 : 0;
    if (belowDays >= cfg.exit_grace_days) {
      dropped.push({ token, reason: `liquidity below $${cfg.exit_liquidity_usd} for ${belowDays} daily evaluations` });
      continue;
    }
    survivors.push({
      ...token,
      symbol: candidate.symbol.slice(0, 12),
      liquidity_usd: liquidity,
      volume_h24_usd: volume,
      below_exit_floor_days: belowDays,
    });
  }

  // A hand-edited/corrupt store may exceed the cap. Keep the strongest
  // existing rows and make every overflow removal explicit in the evidence.
  survivors.sort((a, b) => selectionScore(b) - selectionScore(a));
  const kept = survivors.slice(0, Math.max(0, cfg.max_tokens));
  for (const token of survivors.slice(Math.max(0, cfg.max_tokens))) {
    dropped.push({ token, reason: `Tier B cap reduced to ${cfg.max_tokens}` });
  }

  const existing = new Set(kept.map((token) => token.mint));
  const additions = candidates
    .filter((candidate) => !existing.has(candidate.mint))
    .filter((candidate) => !hardExcluded(candidate, denylist))
    .filter(eligibleDecimals)
    .filter((candidate) => finiteMetric(candidate.liquidity_usd) >= cfg.min_liquidity_usd)
    .filter((candidate) => finiteMetric(candidate.volume_h24_usd) >= cfg.min_volume_h24_usd)
    .filter((candidate) => {
      const firstSeenMs = Date.parse(candidate.first_seen_ts ?? "");
      return Number.isFinite(firstSeenMs) && now_ms - firstSeenMs >= cfg.min_age_days * DAY_MS;
    })
    .sort((a, b) => selectionScore(b) - selectionScore(a));

  const added: TierBToken[] = [];
  for (const candidate of additions) {
    if (kept.length + added.length >= cfg.max_tokens) break;
    const token: TierBToken = {
      symbol: candidate.symbol.slice(0, 12),
      mint: candidate.mint,
      liquidity_usd: finiteMetric(candidate.liquidity_usd),
      volume_h24_usd: finiteMetric(candidate.volume_h24_usd),
      first_seen_ts: candidate.first_seen_ts ?? nowIso,
      added_ts: nowIso,
      below_exit_floor_days: 0,
    };
    added.push(token);
    existing.add(token.mint);
  }

  return { next: [...kept, ...added], added, dropped };
}

export type TradableAsset = { symbol: string; mint: string; tier: "A" | "B" };

/** Static anchors plus the persisted rotation, deduplicated fail-closed. */
export function buildTradableUniverse(tierB: TierBToken[], mintMeta: MintMetaRow[] = []): TradableAsset[] {
  const assets: TradableAsset[] = UNIVERSE.map((asset) => ({ ...asset, tier: "A" }));
  const seen = new Set(assets.map((asset) => asset.mint));
  const seenSymbols = new Set(assets.map((asset) => asset.symbol.trim().toUpperCase()));
  for (const token of tierB) {
    const symbol = token.symbol.trim();
    const symbolKey = symbol.toUpperCase();
    if (
      !token.mint ||
      !symbol ||
      seen.has(token.mint) ||
      seenSymbols.has(symbolKey) ||
      EXCLUDED_MINTS.has(token.mint) ||
      decimalsFor(token.mint, mintMeta) === null
    ) continue;
    assets.push({ symbol, mint: token.mint, tier: "B" });
    seen.add(token.mint);
    seenSymbols.add(symbolKey);
  }
  return assets;
}

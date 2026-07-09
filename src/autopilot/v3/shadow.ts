/**
 * V3 shadow evaluation (V3 plan §P1–P3, run in SHADOW first). Alongside v2's
 * live paper trading, this computes the V3 regime + candidates from the same
 * market data every tick and RECORDS what V3 would have done — entries and
 * skips alike — into the candidate store, without trading on it. v2 stays the
 * benchmark; V3 accumulates the labeled dataset and its net-EV discipline is
 * proven on paper before it ever routes a real intent.
 *
 * Pure decision core (`evaluateV3Shadow`) + a thin store-writing shell
 * (`recordV3Shadow`, `labelDueCandidates`). Cost estimates are passed in
 * (fetched in the daemon shell) so this stays testable without network.
 */

import type { MarketFeedRow } from "../feed";
import type { AutopilotStore } from "../store";
import { computeForwardLabels, type PriceObservation } from "./candidate-store";
import { buildRegimeInput, buildTokenFeatures } from "./features";
import { fundingCandidate, fundingEnabledIn, type FundingInput } from "./funding-basis";
import { pairEnabledIn } from "./pair-rv";
import { classifyRegime, describeRegime } from "./regime";
import { routeCandidates, type RouterResult } from "./router";
import type { CandidateSignal, ExecutionCost, MarketRegime, StrategyId } from "./signal";
import { trendingCandidate, trendingEnabledIn, type TrendingToken } from "./trending";
import { scoreToConfidence, xsecCandidate, xsecScore } from "./xsec";

/** xsec's liquidity floor for shadow eval (report tier-2 mid-liquidity). */
export const SHADOW_MIN_LIQUIDITY_USD = 250_000;

/** Which modules run in a given regime (plan §Modules). funding is always on
 * (market-neutral); xsec only in risk-on; pair in chop/risk-off. */
export function enabledModulesFor(regime: MarketRegime): Set<StrategyId> {
  const enabled = new Set<StrategyId>();
  if (regime === "risk_on") enabled.add("xsec");
  if (fundingEnabledIn(regime)) enabled.add("funding_basis");
  if (pairEnabledIn(regime)) enabled.add("pair_rv");
  if (trendingEnabledIn(regime)) enabled.add("trending");
  return enabled;
}

export type ShadowInput = {
  universe: Array<{ symbol: string; mint: string }>;
  windows: Map<string, number[]>; // mint → price window
  feed: Map<string, MarketFeedRow>; // symbol → row
  /** Cost estimate per mint (from a real quote in the shell; conservative default otherwise). */
  costByMint: Map<string, ExecutionCost>;
  volumeBaselineByMint?: Map<string, number>;
  /** Persisted minute bars (oldest → newest) for longer-horizon features (r_4h). */
  priceHistory?: Array<{ ts: string; prices: Record<string, number> }>;
  /** Live perp funding inputs by mint (Drift adapter; only FRESH data arrives here). */
  fundingByMint?: Map<string, FundingInput>;
  /** Solana trending radar rows (keyless GeckoTerminal + DexScreener boosts). */
  trendingTokens?: TrendingToken[];
  /** Conservative default cost for radar tokens outside `costByMint`. */
  defaultCost?: ExecutionCost;
};

/** The strongest xsec read this tick regardless of regime/floor — always
 * recorded, so the dataset captures what the model saw even when it wouldn't
 * trade (report §11.2: "store every candidate snapshot, including skipped"). */
export type BestObservation = {
  symbol: string;
  mint: string;
  score: number;
  features: Record<string, number | string | boolean>;
  cost_total_bps: number;
  expected_value_bps: number;
  confidence: number;
  would_enter: boolean;
  skip_reason: string | null;
};

export type ShadowResult = {
  regime: MarketRegime;
  regime_note: string;
  route: RouterResult;
  /** Candidates the router produced this tick (pre-gate), for recording. */
  candidates: CandidateSignal[];
  /** The best token to snapshot this tick even if it wouldn't trade. */
  best_observation: BestObservation | null;
};

/**
 * Pure: build features, classify regime, gather candidates from the enabled
 * modules (xsec today; funding/pair need perp data wired later so they only
 * emit when the shell provides it), and route them. Returns the regime, the
 * routing result, and the raw candidates.
 */
export function evaluateV3Shadow(input: ShadowInput): ShadowResult {
  const rows = [...input.feed.values()];
  const regimeInput = buildRegimeInput({
    sol: input.feed.get("SOL"),
    btc: input.feed.get("WBTC"),
    all: rows,
  });
  const regime = classifyRegime(regimeInput);
  const enabled = enabledModulesFor(regime);

  // r_4h per mint from the persisted minute bars: latest price vs the bar
  // closest to 4h ago (null when history is shorter than ~3.5h).
  const r4hByMint = new Map<string, number>();
  const history = input.priceHistory ?? [];
  if (history.length >= 2) {
    const latest = history[history.length - 1];
    const latestMs = Date.parse(latest.ts);
    const targetMs = latestMs - 4 * 60 * 60_000;
    let anchor = history[0];
    for (const row of history) {
      if (Date.parse(row.ts) <= targetMs) anchor = row;
      else break;
    }
    const anchorMs = Date.parse(anchor.ts);
    if (latestMs - anchorMs >= 3.5 * 60 * 60_000) {
      for (const [mint, price] of Object.entries(latest.prices)) {
        const past = anchor.prices[mint];
        if (Number.isFinite(past) && past > 0 && Number.isFinite(price)) {
          r4hByMint.set(mint, ((price - past) / past) * 100);
        }
      }
    }
  }

  // DATA COLLECTION always runs xsec across the universe, regardless of regime:
  // the regime gate governs TRADING, not what the model gets to observe. We
  // track the highest-scoring token to snapshot every tick, and only the
  // regime-enabled tokens flow into the router for the (shadow) trade decision.
  const candidates: CandidateSignal[] = [];
  let best: BestObservation | null = null;
  for (const asset of input.universe) {
    const window = input.windows.get(asset.mint) ?? [];
    if (window.length < 3) continue;
    const features = buildTokenFeatures({
      symbol: asset.symbol,
      mint: asset.mint,
      window,
      feed: input.feed.get(asset.symbol),
      volume_baseline_usd: input.volumeBaselineByMint?.get(asset.mint) ?? null,
      r_4h_pct: r4hByMint.get(asset.mint) ?? null,
    });
    const cost = input.costByMint.get(asset.mint);
    if (!cost) continue;
    const score = xsecScore(features);
    const candidate = xsecCandidate(features, cost); // null when score < floor
    if (candidate && enabled.has("xsec")) candidates.push(candidate);
    if (!best || score > best.score) {
      const evBps = candidate?.expected_value_bps ?? Math.round((xsecScore(features) * 45 - cost.total_bps) * 100) / 100;
      best = {
        symbol: asset.symbol,
        mint: asset.mint,
        score,
        features: candidate?.features ?? { score, r_1h_pct: features.r_1h_pct ?? 0, r_24h_pct: features.r_24h_pct ?? 0 },
        cost_total_bps: cost.total_bps,
        expected_value_bps: evBps,
        confidence: candidate?.confidence ?? scoreToConfidence(score),
        would_enter: false, // resolved below once routing is known
        skip_reason: candidate ? null : `xsec score ${score.toFixed(2)} below entry floor`,
      };
    }
  }
  // funding_basis: delta-neutral candidates from the Drift adapter's FRESH
  // funding snapshots (stale data never reaches this map — perps.ts enforces).
  if (enabled.has("funding_basis") && input.fundingByMint) {
    for (const fundingInput of input.fundingByMint.values()) {
      const candidate = fundingCandidate(fundingInput);
      if (candidate) candidates.push(candidate);
    }
  }
  // trending: attention-flow candidates from the Solana radar. Tokens outside
  // the majors universe are welcome here — that is the point — but they only
  // ever become SHADOW snapshots; nothing trades until calibration proves out.
  if (enabled.has("trending") && input.trendingTokens) {
    for (const token of input.trendingTokens) {
      const cost = input.costByMint.get(token.mint) ?? input.defaultCost;
      if (!cost) continue;
      const candidate = trendingCandidate(token, cost);
      if (candidate) candidates.push(candidate);
    }
  }
  // pair_rv needs spread history the daemon does not persist yet (plan §P5).

  const route = routeCandidates({
    candidates,
    regime,
    enabledModules: enabled,
    min_liquidity_usd: SHADOW_MIN_LIQUIDITY_USD,
  });

  // If the best observed token became the top routed candidate, it would enter;
  // otherwise annotate why it wouldn't (regime-disabled if xsec is off).
  if (best) {
    const top = route.ranked[0];
    best.would_enter = top?.token_mint === best.mint;
    if (!best.would_enter && best.skip_reason === null) {
      best.skip_reason = enabled.has("xsec") ? "did not rank first / failed EV gate" : `xsec disabled in ${regime} regime`;
    }
  }

  return { regime, regime_note: describeRegime(regime, regimeInput), route, candidates, best_observation: best };
}

/**
 * Record this tick's shadow evaluation into the candidate store: the top
 * passing candidate as an "enter" snapshot, and the strongest rejected one as a
 * "skip" snapshot with its gate reason. Throttled by the caller — one write per
 * few minutes is plenty for a training set and keeps the JSON store light.
 * Returns a short note for the activity log, or null when nothing to record.
 */
export function recordV3Shadow(
  store: AutopilotStore,
  result: ShadowResult,
  priceByMint: Map<string, number>,
): string | null {
  const top = result.route.ranked[0] ?? null;
  const rejected = result.route.best_rejected;

  if (top) {
    store.appendCandidateSnapshot({
      strategy_id: top.strategy_id,
      token_mint: top.token_mint,
      symbol: top.symbol,
      decision: "enter",
      features: top.features,
      cost_total_bps: top.cost.total_bps,
      expected_value_bps: top.expected_value_bps,
      confidence: top.confidence,
      price_usd_at_snapshot: priceByMint.get(top.token_mint) ?? 0,
    });
    return `V3 shadow [${result.regime}] would ENTER ${top.symbol} (${top.strategy_id}, EV ${top.expected_value_bps.toFixed(0)}bp).`;
  }
  if (rejected && rejected.verdict.pass === false) {
    store.appendCandidateSnapshot({
      strategy_id: rejected.signal.strategy_id,
      token_mint: rejected.signal.token_mint,
      symbol: rejected.signal.symbol,
      decision: "skip",
      skip_reason: rejected.verdict.reason,
      features: rejected.signal.features,
      cost_total_bps: rejected.signal.cost.total_bps,
      expected_value_bps: rejected.signal.expected_value_bps,
      confidence: rejected.signal.confidence,
      price_usd_at_snapshot: priceByMint.get(rejected.signal.token_mint) ?? 0,
    });
    return `V3 shadow [${result.regime}] skipped ${rejected.signal.symbol}: ${rejected.verdict.reason}.`;
  }
  // No routed candidate this tick (common in risk-off/chop, or sub-floor
  // scores) — still snapshot the best observation so the dataset has coverage
  // in every regime, not only when the bot would trade.
  const best = result.best_observation;
  if (best) {
    store.appendCandidateSnapshot({
      strategy_id: "xsec",
      token_mint: best.mint,
      symbol: best.symbol,
      decision: "skip",
      skip_reason: best.skip_reason ?? "no routed candidate",
      features: best.features,
      cost_total_bps: best.cost_total_bps,
      expected_value_bps: best.expected_value_bps,
      confidence: best.confidence,
      price_usd_at_snapshot: priceByMint.get(best.mint) ?? 0,
    });
    return `V3 shadow [${result.regime}] observed ${best.symbol} (score ${best.score.toFixed(2)}): ${best.skip_reason}.`;
  }
  return null;
}

/**
 * Fill forward-outcome labels on snapshots old enough to observe (≥6h). The
 * caller supplies a per-mint recent price series (from equity/feed history or a
 * short backfill); labels that can't be computed stay null. Returns how many
 * rows were labeled.
 */
export function labelDueCandidates(
  store: AutopilotStore,
  priceSeriesByMint: Map<string, PriceObservation[]>,
  nowMs: number = Date.now(),
): number {
  const due = store.unlabeledSnapshotsOlderThan(6 * 60 * 60_000, nowMs);
  let labeled = 0;
  for (const row of due) {
    const series = priceSeriesByMint.get(row.token_mint);
    if (!series || series.length === 0) continue;
    const labels = computeForwardLabels(row.price_usd_at_snapshot, series, Date.parse(row.ts));
    store.labelCandidateSnapshot(row.id, labels);
    labeled += 1;
  }
  return labeled;
}

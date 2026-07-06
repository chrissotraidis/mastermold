/**
 * The V3 router (plan §Architecture). Collects candidates from every enabled
 * strategy module, drops anything that fails the EV gate, dedupes by mint
 * (best EV wins), and returns a ranked list — highest net EV first. The daemon
 * takes the top candidate that also clears the risk-cap policy engine.
 *
 * Pure: modules do their own (possibly async) work upstream and hand the router
 * finished `CandidateSignal`s; the router is deterministic ranking + gating.
 */

import { passesEvGate, type EvVerdict } from "./ev-gate";
import type { CandidateSignal, MarketRegime, StrategyId } from "./signal";

export type RoutedCandidate = {
  signal: CandidateSignal;
  verdict: EvVerdict;
};

export type RouterResult = {
  /** Passing candidates, best net EV first. */
  ranked: CandidateSignal[];
  /** Every candidate with its verdict, for the trace (incl. rejected). */
  evaluated: RoutedCandidate[];
  /** The strongest REJECTED candidate, for the decision log. */
  best_rejected: RoutedCandidate | null;
};

export type RouterInput = {
  candidates: CandidateSignal[];
  regime: MarketRegime;
  /** Module → whether it's enabled in this regime. */
  enabledModules: Set<StrategyId>;
  min_liquidity_usd: number;
};

export function routeCandidates(input: RouterInput): RouterResult {
  const evaluated: RoutedCandidate[] = [];
  for (const signal of input.candidates) {
    if (!input.enabledModules.has(signal.strategy_id)) {
      evaluated.push({ signal, verdict: { pass: false, reason: `${signal.strategy_id} disabled in ${input.regime} regime` } });
      continue;
    }
    evaluated.push({ signal, verdict: passesEvGate(signal, { min_liquidity_usd: input.min_liquidity_usd }) });
  }

  const passing = evaluated.filter((row) => row.verdict.pass).map((row) => row.signal);
  // Dedupe by mint: if two modules want the same token, keep the higher-EV one.
  const bestByMint = new Map<string, CandidateSignal>();
  for (const signal of passing) {
    const existing = bestByMint.get(signal.token_mint);
    if (!existing || signal.expected_value_bps > existing.expected_value_bps) bestByMint.set(signal.token_mint, signal);
  }
  const ranked = [...bestByMint.values()].sort((a, b) => b.expected_value_bps - a.expected_value_bps);

  const rejected = evaluated.filter((row) => !row.verdict.pass);
  const bestRejected = rejected.reduce<RoutedCandidate | null>((best, row) => {
    if (!best || row.signal.expected_value_bps > best.signal.expected_value_bps) return row;
    return best;
  }, null);

  return { ranked, evaluated, best_rejected: bestRejected };
}

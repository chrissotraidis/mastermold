/**
 * V3 candidate / feature store (V3 plan §P1, report §11.2 — "record EVERY
 * candidate incl. skips, with features + cost estimate + forward labels").
 *
 * This is the training dataset for the eventual ML model. Every candidate the
 * router evaluates — the ones it ENTERS and the ones it SKIPS — is snapshotted
 * here with its feature vector, execution-cost estimate, and expected value at
 * decision time. Later, a labeling pass fills in the forward-outcome labels
 * (return_*_bps, max adverse/favorable excursion) once enough time has elapsed
 * to observe what actually happened. Without this substrate no model can be
 * trained, so it is pure additive logging: it never gates or changes a trade.
 *
 * The rows live in the SAME autopilot store file (a `candidate_snapshots` table
 * on the shared JSON snapshot) so there is no second database to reconcile —
 * see `src/autopilot/store.ts`. This module owns the row TYPE and the pure
 * forward-label math; the store methods that persist it live on AutopilotStore.
 */

/**
 * One evaluated candidate at decision time, plus nullable forward labels filled
 * in by a later labeling pass. `features` mirrors the strategy module's feature
 * snapshot (see v3/xsec.ts `TokenFeatures` → CandidateSignal.features).
 */
export type CandidateSnapshotRow = {
  id: string;
  /** ISO timestamp of the decision. */
  ts: string;
  strategy_id: string;
  token_mint: string;
  symbol: string;
  decision: "enter" | "skip";
  /** Present when decision === "skip" — the gate/reason that vetoed it. */
  skip_reason?: string;
  /** Feature vector behind the decision (numeric/categorical/boolean). */
  features: Record<string, number | string | boolean>;
  /** Modeled round-trip execution cost at decision time. */
  cost_total_bps: number;
  /** expected_return_bps − cost_total_bps: the router's ranking number. */
  expected_value_bps: number;
  /** Calibrated 0..1. */
  confidence: number;
  /** Executable price at snapshot — the anchor the forward labels return from. */
  price_usd_at_snapshot: number;

  // --- forward labels (nullable; filled in by the labeling pass) ------------
  return_30m_bps: number | null;
  return_2h_bps: number | null;
  return_6h_bps: number | null;
  /** Worst (most negative) excursion within 2h, in bps. */
  max_adverse_2h_bps: number | null;
  /** Best (most positive) excursion within 2h, in bps. */
  max_favorable_2h_bps: number | null;
  /** True once the forward labels above have been computed. */
  labeled: boolean;
};

/** Input to appendCandidateSnapshot: id/ts generated when omitted; labels start null. */
export type CandidateSnapshotInput = Omit<
  CandidateSnapshotRow,
  | "id"
  | "ts"
  | "return_30m_bps"
  | "return_2h_bps"
  | "return_6h_bps"
  | "max_adverse_2h_bps"
  | "max_favorable_2h_bps"
  | "labeled"
> & { id?: string; ts?: string };

/** The forward-outcome labels a labeling pass writes back onto a snapshot. */
export type ForwardLabels = {
  return_30m_bps: number | null;
  return_2h_bps: number | null;
  return_6h_bps: number | null;
  max_adverse_2h_bps: number | null;
  max_favorable_2h_bps: number | null;
};

/** A price observation after the snapshot: ms timestamp + executable price. */
export type PriceObservation = { ts: number; price: number };

const MIN_30 = 30 * 60_000;
const HOUR_2 = 2 * 60 * 60_000;
const HOUR_6 = 6 * 60 * 60_000;

function bpsReturn(from: number, to: number): number {
  return Math.round(((to - from) / from) * 10_000 * 100) / 100;
}

/**
 * Pure forward-label math. Given the snapshot price and price observations
 * AFTER the snapshot (each with a ms `ts` relative to the same clock as the
 * snapshot), compute point-in-time returns at +30m/+2h/+6h and the max
 * adverse/favorable excursion within the first 2h.
 *
 * - `snapshotTs` anchors the horizons; observations with ts <= snapshotTs are
 *   ignored (a label can only look forward).
 * - A horizon return uses the LAST observation at or before that horizon end;
 *   it is null when no observation has reached that horizon yet.
 * - Excursions scan every observation within (snapshotTs, snapshotTs + 2h].
 *   max_adverse is the most negative bps move (<= 0 when any dip occurred),
 *   max_favorable the most positive (>= 0). Both null when no observation
 *   falls in the 2h window.
 *
 * Prices <= 0 for the snapshot make every label null (can't return from zero).
 */
export function computeForwardLabels(
  snapshotPriceUsd: number,
  priceSeries: PriceObservation[],
  snapshotTs = 0,
): ForwardLabels {
  const empty: ForwardLabels = {
    return_30m_bps: null,
    return_2h_bps: null,
    return_6h_bps: null,
    max_adverse_2h_bps: null,
    max_favorable_2h_bps: null,
  };
  if (!Number.isFinite(snapshotPriceUsd) || snapshotPriceUsd <= 0) return empty;

  const forward = priceSeries
    .filter((o) => Number.isFinite(o.ts) && Number.isFinite(o.price) && o.price > 0 && o.ts > snapshotTs)
    .sort((a, b) => a.ts - b.ts);
  if (forward.length === 0) return empty;

  const atHorizon = (windowMs: number): number | null => {
    const cutoff = snapshotTs + windowMs;
    let last: PriceObservation | null = null;
    for (const o of forward) {
      if (o.ts <= cutoff) last = o;
      else break;
    }
    return last ? bpsReturn(snapshotPriceUsd, last.price) : null;
  };

  let maxAdverse: number | null = null;
  let maxFavorable: number | null = null;
  const twoHourCutoff = snapshotTs + HOUR_2;
  for (const o of forward) {
    if (o.ts > twoHourCutoff) break;
    const move = bpsReturn(snapshotPriceUsd, o.price);
    maxAdverse = maxAdverse === null ? move : Math.min(maxAdverse, move);
    maxFavorable = maxFavorable === null ? move : Math.max(maxFavorable, move);
  }

  return {
    return_30m_bps: atHorizon(MIN_30),
    return_2h_bps: atHorizon(HOUR_2),
    return_6h_bps: atHorizon(HOUR_6),
    max_adverse_2h_bps: maxAdverse,
    max_favorable_2h_bps: maxFavorable,
  };
}

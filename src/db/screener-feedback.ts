/**
 * Alert-feedback → screener-threshold tuning loop (Phase 3).
 *
 * The `useful_feedback` the operator marks on alerts is the screener's only learning
 * signal, and it needs no LLM. This module aggregates that feedback by screener signal
 * type (return_z / volume_z / news_count_z) and emits a per-signal tuning *suggestion*:
 * signals whose alerts are consistently marked not-useful should be demoted or muted;
 * consistently-useful ones can be loosened to trigger more often. The actual threshold
 * change in `engine/config.yml` stays manual ("manual at first", per the plan) — this
 * surface makes the loop visible and concrete on `/review`.
 *
 * Only engine alerts carry a `signal`, so the loop operates on engine output; with no
 * engine run (or no rated alerts) it reports an honest "insufficient feedback" state.
 */

import { getAlerts } from "./alerts";
import { getDataMode } from "./engine-data";

export type ScreenerSuggestion = "loosen" | "hold" | "demote" | "insufficient";

export type SignalFeedbackJson = {
  signal: string;
  total: number;
  useful: number;
  not_useful: number;
  pending: number;
  suggestion: ScreenerSuggestion;
  rationale: string;
};

export type ScreenerFeedbackJson = {
  signals: SignalFeedbackJson[];
  total_rated: number;
  provenance: {
    label: "Demo data" | "Engine output";
    source: string;
  };
};

// Minimum rated alerts before a signal earns a (still-suggestive) tuning recommendation.
const MIN_RATED = 2;
const MAJORITY = 0.6;

export function getScreenerFeedback(): ScreenerFeedbackJson {
  const dataMode = getDataMode();
  const alerts = getAlerts().filter((alert) => alert.signal);

  const bySignal = new Map<string, { useful: number; not_useful: number; pending: number }>();
  for (const alert of alerts) {
    const signal = alert.signal as string;
    const bucket = bySignal.get(signal) ?? { useful: 0, not_useful: 0, pending: 0 };
    if (alert.useful_feedback === true) bucket.useful += 1;
    else if (alert.useful_feedback === false) bucket.not_useful += 1;
    else bucket.pending += 1;
    bySignal.set(signal, bucket);
  }

  const signals: SignalFeedbackJson[] = [...bySignal.entries()]
    .map(([signal, b]) => {
      const total = b.useful + b.not_useful + b.pending;
      const rated = b.useful + b.not_useful;
      const { suggestion, rationale } = suggest(b.useful, b.not_useful, rated);
      return { signal, total, useful: b.useful, not_useful: b.not_useful, pending: b.pending, suggestion, rationale };
    })
    .sort((a, b) => b.total - a.total || a.signal.localeCompare(b.signal));

  return {
    signals,
    total_rated: signals.reduce((sum, s) => sum + s.useful + s.not_useful, 0),
    provenance: { label: dataMode.label, source: dataMode.source },
  };
}

function suggest(
  useful: number,
  notUseful: number,
  rated: number,
): { suggestion: ScreenerSuggestion; rationale: string } {
  if (rated < MIN_RATED) {
    return {
      suggestion: "insufficient",
      rationale: `Only ${rated} rated so far; rate ${MIN_RATED}+ before changing this alert type.`,
    };
  }
  if (notUseful / rated >= MAJORITY) {
    return {
      suggestion: "demote",
      rationale: `${notUseful}/${rated} rated not useful. Show fewer alerts like this unless the move is stronger.`,
    };
  }
  if (useful / rated >= MAJORITY) {
    return {
      suggestion: "loosen",
      rationale: `${useful}/${rated} rated useful. It is safe to show a few more alerts like this.`,
    };
  }
  return {
    suggestion: "hold",
    rationale: `${useful}/${rated} rated useful. Mixed feedback, so keep this alert type as-is.`,
  };
}

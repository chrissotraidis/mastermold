/**
 * File-contract adapter for the Python CUSUM classifier.
 *
 * Python may only append probabilities. TypeScript retains every decision:
 * an exact event-key match, freshness, model approval, and the independent
 * four-week shadow-history gate are all required before a probability can
 * affect a candidate. Any malformed/missing/stale state degrades to the
 * unchanged rule-based path.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CandidateSnapshotRow } from "./candidate-store";

export const ML_SIGNAL_FRESH_MS = 60_000;
export const ML_SIGNAL_STALE_WARNING_MS = 60 * 60_000;
export const ML_MODEL_MAX_AGE_MS = 100 * 24 * 60 * 60_000;
export const ML_SHADOW_MIN_SPAN_MS = 28 * 24 * 60 * 60_000;

export type MlSignalRow = {
  mint: string;
  event_ts: number;
  p_up: number;
  model_id: string;
  trained_through: string;
  scored_at: string;
};

export type FreshMlSignal = MlSignalRow & { status: "fresh" };
export type MlEventRequest = { mint: string; event_ts: number };

export type MlSignalState = {
  approved_model_id: string | null;
  model_result_eligible: boolean;
  history_eligible: boolean;
  latest_scored_at_ms: number | null;
  signals: Map<string, MlSignalRow>;
};

export type MlEventResolution =
  | { decision: "signal"; signal: FreshMlSignal }
  | { decision: "rule"; signal: null }
  | { decision: "wait"; signal: null };

export function mlSignalKey(mint: string, eventTsMs: number): string {
  return `${mint}:${eventTsMs}`;
}

/** Append the exact TypeScript event key for an independently supervised
 * Python scorer. This is observation-only and has no candidate/order path. */
export function appendMlEventRequest(row: MlEventRequest, path: string = join(process.cwd(), "engine", "out", "ml", "events.jsonl")): boolean {
  if (!row.mint || !Number.isFinite(row.event_ts) || row.event_ts <= 0) return false;
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ mint: row.mint, event_ts: row.event_ts })}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function finiteTs(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseMlSignals(text: string): Map<string, MlSignalRow> {
  const rows = new Map<string, MlSignalRow>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      const eventTs = finiteTs(raw.event_ts);
      const pUp = Number(raw.p_up);
      if (
        typeof raw.mint !== "string" || !raw.mint || eventTs === null ||
        !Number.isFinite(pUp) || pUp < 0 || pUp > 1 ||
        typeof raw.model_id !== "string" || !raw.model_id ||
        typeof raw.trained_through !== "string" || finiteTs(raw.trained_through) === null ||
        typeof raw.scored_at !== "string" || finiteTs(raw.scored_at) === null
      ) continue;
      const row: MlSignalRow = {
        mint: raw.mint,
        event_ts: eventTs,
        p_up: pUp,
        model_id: raw.model_id,
        trained_through: raw.trained_through,
        scored_at: raw.scored_at,
      };
      rows.set(mlSignalKey(row.mint, row.event_ts), row); // append log: newest wins
    } catch {
      // One torn/malformed append must not disrupt the trading daemon.
    }
  }
  return rows;
}

export function cusumShadowHistoryEligible(
  snapshots: Pick<CandidateSnapshotRow, "strategy_id" | "ts">[],
  nowMs: number = Date.now(),
  persistedRange?: { first_ts: string; latest_ts: string } | null,
): boolean {
  const times = [
    ...snapshots
    .filter((row) => row.strategy_id === "cusum_tb")
    .map((row) => Date.parse(row.ts)),
    ...(persistedRange ? [Date.parse(persistedRange.first_ts), Date.parse(persistedRange.latest_ts)] : []),
  ]
    .filter((ts) => Number.isFinite(ts) && ts <= nowMs)
    .sort((a, b) => a - b);
  return times.length >= 2 && times[times.length - 1] - times[0] >= ML_SHADOW_MIN_SPAN_MS;
}

export function loadMlSignalState(input: {
  snapshots: Pick<CandidateSnapshotRow, "strategy_id" | "ts">[];
  now_ms?: number;
  signals_path?: string;
  approval_path?: string;
  training_result_path?: string;
  cusum_evidence_range?: { first_ts: string; latest_ts: string } | null;
}): MlSignalState {
  const nowMs = input.now_ms ?? Date.now();
  const base = join(process.cwd(), "engine", "out", "ml");
  let signalText = "";
  let approvedModelId: string | null = null;
  let modelResultEligible = false;
  try { signalText = readFileSync(input.signals_path ?? join(base, "signals.jsonl"), "utf8"); } catch { /* absent is rule-based */ }
  try { approvedModelId = readFileSync(input.approval_path ?? join(base, "APPROVED_MODEL"), "utf8").trim() || null; } catch { /* operator has not approved */ }
  try {
    const result = JSON.parse(readFileSync(input.training_result_path ?? join(base, "training-result.json"), "utf8")) as Record<string, unknown>;
    modelResultEligible = Boolean(
      approvedModelId && result.model_id === approvedModelId && result.fixture === false &&
      result.data_compliant === true && result.criterion_passed === true,
    );
  } catch { /* absent/invalid result fails closed */ }
  if (!modelResultEligible) approvedModelId = null;
  const signals = parseMlSignals(signalText);
  const scored = [...signals.values()].map((row) => Date.parse(row.scored_at)).filter(Number.isFinite);
  return {
    approved_model_id: approvedModelId,
    model_result_eligible: modelResultEligible,
    history_eligible: cusumShadowHistoryEligible(input.snapshots, nowMs, input.cusum_evidence_range),
    latest_scored_at_ms: scored.length ? Math.max(...scored) : null,
    signals,
  };
}

export function freshMlSignal(
  state: MlSignalState,
  mint: string,
  eventTsMs: number,
  nowMs: number = Date.now(),
): FreshMlSignal | null {
  if (!state.history_eligible || !state.approved_model_id) return null;
  const row = state.signals.get(mlSignalKey(mint, eventTsMs));
  if (!row || row.model_id !== state.approved_model_id) return null;
  const scoredAt = Date.parse(row.scored_at);
  const trainedThrough = Date.parse(row.trained_through);
  if (
    !Number.isFinite(scoredAt) || scoredAt > nowMs || nowMs - scoredAt > ML_SIGNAL_FRESH_MS ||
    !Number.isFinite(trainedThrough) || trainedThrough > nowMs || nowMs - trainedThrough > ML_MODEL_MAX_AGE_MS
  ) return null;
  return { ...row, status: "fresh" };
}

/** Resolve an event only after the independently supervised scorer has had a
 * chance to answer. An inactive model uses the rule immediately; an active
 * model gets one freshness window, after which the event safely falls back to
 * the unchanged rule path. */
export function resolveMlEvent(
  state: MlSignalState,
  mint: string,
  eventTsMs: number,
  nowMs: number = Date.now(),
): MlEventResolution {
  const modelExpected = Boolean(
    state.approved_model_id && state.model_result_eligible && state.history_eligible,
  );
  if (!modelExpected) return { decision: "rule", signal: null };
  const signal = freshMlSignal(state, mint, eventTsMs, nowMs);
  if (signal) return { decision: "signal", signal };
  if (nowMs - eventTsMs >= ML_SIGNAL_FRESH_MS) return { decision: "rule", signal: null };
  return { decision: "wait", signal: null };
}

export function mlConfidence(pUp: number): number {
  return Math.min(0.9, Math.max(0.3, 0.5 + (pUp - 0.5) * 0.4));
}

export function mlSignalsDegraded(state: MlSignalState, nowMs: number = Date.now()): boolean {
  return state.latest_scored_at_ms !== null && nowMs - state.latest_scored_at_ms > ML_SIGNAL_STALE_WARNING_MS;
}

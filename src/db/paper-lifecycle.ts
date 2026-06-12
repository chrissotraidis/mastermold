/**
 * Paper-round lifecycle: rolling weekly rounds, derived (never trusted) status,
 * and deterministic process-based scoring when a round's close date passes.
 *
 * Rounds were previously static seed rows whose `status` column was displayed
 * verbatim — so a round that closed on Jun 5 still said "Open" a week later and
 * accepted new trades. Status is now always derived from `closes_at` plus
 * whether a score exists, a fresh round is opened automatically for the current
 * trading week, and due rounds are scored on process (calibration, patience,
 * variety) — price hits are folded into calibration when bar data covers the
 * round window, per the PRD's "reward process, not P&L".
 */

import { demoDatabase } from "./seed-data";
import { store } from "./store";
import type { PaperPrediction, PaperTradingRound, PriceBar, RoundScore } from "./schema";

export type DerivedRoundStatus = "open" | "scoring" | "closed";

export function deriveRoundStatus(
  round: PaperTradingRound,
  hasScore: boolean,
  nowMs: number,
): DerivedRoundStatus {
  const closes = Date.parse(round.closes_at);
  if (Number.isNaN(closes) || nowMs < closes) return "open";
  return hasScore ? "closed" : "scoring";
}

/** ISO week label like "2026-W24". */
export function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * The round covering the trading week of `now` (Mon 13:30 UTC → Fri 20:00 UTC).
 * After Friday's close the next week's round is returned, so there is always a
 * round accepting paper trades.
 */
export function weekRoundFor(now: Date): PaperTradingRound {
  const monday = new Date(now);
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  monday.setUTCHours(13, 30, 0, 0);

  let closes = new Date(monday);
  closes.setUTCDate(closes.getUTCDate() + 4);
  closes.setUTCHours(20, 0, 0, 0);

  let opens = monday;
  if (now.getTime() >= closes.getTime()) {
    opens = new Date(monday);
    opens.setUTCDate(opens.getUTCDate() + 7);
    closes = new Date(closes);
    closes.setUTCDate(closes.getUTCDate() + 7);
  }

  const label = isoWeekLabel(opens);
  const nowIso = now.toISOString();
  return {
    id: `round_${label.toLowerCase().replace("-", "")}`,
    week_label: label,
    opens_at: opens.toISOString(),
    closes_at: closes.toISOString(),
    status: "open",
    event_time: nowIso,
    knowledge_time: nowIso,
  };
}

/** Seed + locally opened rounds, deduped by id (local rows win). */
export function allRounds(): PaperTradingRound[] {
  const local = store().paperRounds();
  const localIds = new Set(local.map((r) => r.id));
  return [...local, ...demoDatabase.paperTradingRounds.filter((r) => !localIds.has(r.id))];
}

/** Seed + locally computed scores, deduped by round_id (local rows win). */
export function allRoundScores(): RoundScore[] {
  const local = store().roundScores();
  const localRounds = new Set(local.map((s) => s.round_id));
  return [...local, ...demoDatabase.roundScores.filter((s) => !localRounds.has(s.round_id))];
}

/**
 * Make sure a round is open right now; called lazily from the paper read path
 * (current view only — never during an as-of replay). Returns the open round.
 */
export function ensureOpenRound(nowMs: number = Date.now()): PaperTradingRound {
  const scores = allRoundScores();
  const open = allRounds().find(
    (round) =>
      deriveRoundStatus(round, scores.some((s) => s.round_id === round.id), nowMs) === "open",
  );
  if (open) return open;
  const round = weekRoundFor(new Date(nowMs));
  store().upsertPaperRound(round);
  return round;
}

/**
 * Score every round whose close date has passed and that has no score yet.
 * Deterministic, runs without market keys; returns the rounds scored this call.
 */
export function resolveDueRounds(nowMs: number = Date.now()): RoundScore[] {
  const scores = allRoundScores();
  const scored = new Set(scores.map((s) => s.round_id));
  const due = allRounds().filter(
    (round) => deriveRoundStatus(round, scored.has(round.id), nowMs) === "scoring",
  );
  if (due.length === 0) return [];

  const predictions = [...demoDatabase.paperPredictions, ...store().submittedPredictions()];
  const created: RoundScore[] = [];
  for (const round of due) {
    const roundPredictions = predictions.filter((p) => p.round_id === round.id);
    const score = scoreRound(round, roundPredictions, nowMs);
    store().upsertRoundScore(score);
    created.push(score);
  }
  return created;
}

function scoreRound(
  round: PaperTradingRound,
  predictions: PaperPrediction[],
  nowMs: number,
): RoundScore {
  const calibration = calibrationScore(round, predictions);
  const patience = patienceScore(predictions);
  const diversification = diversificationScore(predictions);
  return {
    id: `score_${round.id}`,
    round_id: round.id,
    calibration,
    patience,
    diversification,
    total: round1(calibration + patience + diversification),
    event_time: round.closes_at,
    knowledge_time: new Date(nowMs).toISOString(),
  };
}

/**
 * Calibration: when price bars cover a prediction's window, score how well
 * conviction matched the outcome (high conviction + right direction scores
 * best). Without price coverage, fall back to sizing discipline — did stake
 * size track stated conviction.
 */
function calibrationScore(round: PaperTradingRound, predictions: PaperPrediction[]): number {
  const active = predictions.filter((p) => p.direction !== "flat");
  if (active.length === 0) return 5;

  const judged: number[] = [];
  for (const prediction of active) {
    const move = priceMove(prediction.asset_id, prediction.submitted_at, round.closes_at);
    if (move === null) continue;
    const hit = (move >= 0 ? "long" : "short") === prediction.direction ? 1 : 0;
    judged.push(10 - Math.abs(prediction.conviction / 10 - hit) * 10);
  }
  if (judged.length > 0) return round1(avg(judged));

  // No price coverage: sizing discipline as a process proxy.
  const discipline = active.map((p) => {
    const impliedConviction = (p.fake_size_usd ?? p.conviction * 1000) / 1000;
    return Math.max(0, 10 - Math.abs(impliedConviction - p.conviction) * 2);
  });
  return round1(avg(discipline));
}

/** Patience: a handful of deliberate trades beats churn. */
function patienceScore(predictions: PaperPrediction[]): number {
  const trades = predictions.filter((p) => p.direction !== "flat").length;
  if (trades === 0) return 10;
  return round1(Math.max(0, 10 - Math.max(0, trades - 3) * 2));
}

/** Variety: distinct symbols and asset classes among active predictions. */
function diversificationScore(predictions: PaperPrediction[]): number {
  const active = predictions.filter((p) => p.direction !== "flat");
  if (active.length === 0) return 0;
  const assets = demoDatabase.assets;
  const symbols = new Set(active.map((p) => p.asset_id));
  const classes = new Set(
    active
      .map((p) => assets.find((a) => a.id === p.asset_id)?.asset_class)
      .filter(Boolean),
  );
  return round1(Math.min(10, symbols.size * 2 + classes.size * 2));
}

/** Relative price move for an asset between two timestamps, or null without coverage. */
function priceMove(assetId: string, fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  const bars = demoDatabase.priceBars
    .filter((bar) => bar.asset_id === assetId)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const entry = lastAtOrBefore(bars, from);
  const exit = lastAtOrBefore(bars, to);
  if (!entry || !exit || entry.id === exit.id || entry.close === 0) return null;
  return (exit.close - entry.close) / entry.close;
}

function lastAtOrBefore(bars: PriceBar[], ts: number): PriceBar | null {
  let found: PriceBar | null = null;
  for (const bar of bars) {
    if (Date.parse(bar.ts) <= ts) found = bar;
    else break;
  }
  return found;
}

function avg(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

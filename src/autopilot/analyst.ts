/**
 * The Analyst (Day 2 of docs/roadmap/2026-07-03-learning-loop-plan.md): the
 * LLM in the SLOW loop. Once per UTC day the daemon hands it the attribution
 * window, the current params + rails, recent lessons, and what the strategy
 * refused to do — and it returns strict JSON: a review memo, loss lessons,
 * and at most ONE clamped parameter changeset. The store validates the
 * changeset against the same rails no matter what the model says; the model
 * has no other lever. Prompt discipline follows the DX paper: prior decisions
 * are context not precedent, no invented thresholds, unknown = say so.
 *
 * Auto-revert: before each run, if the most recent analyst change is ≥2 days
 * old and the expectancy since it applied is worse than before, the change is
 * reversed (source "revert") and recorded — tried-and-failed is memory too.
 */

import { buildAttribution, type AttributionSummary } from "./attribution";
import { notifyOperator } from "./notify";
import { calibrate, describeCalibration } from "./v3/calibration";
import { PARAM_CLAMPS, type Changeset, type ParamChangelogEntry, type ParamKey, type StrategyParams } from "./params";
import { autopilotStore, type BotDecisionRow } from "./store";

export type AnalystOutput = {
  review: string;
  lessons: Array<{ symbol: string; summary: string }>;
  proposal: { changes: Changeset; reason: string } | null;
};

/** One-shot completion function — injected so tests never touch the network. */
export type CompletionFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

export const ANALYST_SYSTEM_PROMPT = [
  "You are the trading Analyst for a small autonomous Solana paper-trading bot.",
  "You review its own records and adjust its tunable parameters within fixed rails.",
  "Rules you must follow exactly:",
  "- Prior decisions and prior parameter values are context, not precedent.",
  "- Never invent numeric thresholds: any value you propose must be inside the rails given to you.",
  "- Position-size caps, loss limits, stops existing, and the kill switch are NOT parameters; never mention changing them.",
  "- A small sample proves little. With under 5 round trips in the window, prefer proposal: null and say why.",
  "- If the bot sat out because market conditions failed its gates, sitting out may be correct — distinguish 'wrongly picky' from 'rightly patient' using the skip reasons.",
  "- Output STRICT JSON only, no markdown fences, matching:",
  '{"review": "3-6 sentence plain-English memo of what happened and why",',
  ' "lessons": [{"symbol": "SOL", "summary": "one concrete lesson tied to a specific trade"}],',
  ' "proposal": null OR {"changes": {"<param>": <number>}, "reason": "why, tied to the evidence"}}',
].join("\n");

/** Everything the Analyst is allowed to know, as a compact prompt. */
export function buildAnalystPrompt(input: {
  params: StrategyParams;
  attribution: AttributionSummary;
  prematureStopTrips: number;
  recentDecisions: BotDecisionRow[];
  recentLessons: string[];
  changelog: ParamChangelogEntry[];
  windowDays: number;
  /** V3 shadow calibration block (see v3/calibration.ts); empty when absent. */
  v3Calibration?: string;
}): string {
  const skipCounts = new Map<string, number>();
  for (const decision of input.recentDecisions) {
    if (decision.verdict === "skip" || decision.verdict === "blocked") {
      const key = decision.reason.slice(0, 60);
      skipCounts.set(key, (skipCounts.get(key) ?? 0) + 1);
    }
  }
  const topSkips = [...skipCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const rails = (Object.keys(PARAM_CLAMPS) as ParamKey[])
    .map((key) => `${key}=${input.params[key]} (rail ${PARAM_CLAMPS[key].min}..${PARAM_CLAMPS[key].max})`)
    .join("\n");

  return [
    `WINDOW: last ${input.windowDays} days (v2 strategy era only).`,
    `PERFORMANCE: ${JSON.stringify(input.attribution)}`,
    `PREMATURE STOPS (loss exits that recovered ≥1% within 2h): ${input.prematureStopTrips}`,
    `CURRENT PARAMS AND RAILS:\n${rails}`,
    `WHAT THE BOT REFUSED TO DO (skip/blocked reasons, count desc):\n${topSkips.map(([reason, count]) => `${count}x ${reason}`).join("\n") || "none recorded"}`,
    `RECENT PARAM CHANGES:\n${input.changelog.slice(0, 5).map((entry) => `${entry.ts.slice(0, 10)} [${entry.source}] ${entry.reason}`).join("\n") || "none yet"}`,
    `PRIOR LESSONS (do not re-learn these):\n${input.recentLessons.join("\n") || "none yet"}`,
    ...(input.v3Calibration ? [input.v3Calibration] : []),
  ].join("\n\n");
}

/** Strict-JSON parse with a fenced/embedded fallback. Null on anything off-shape. */
export function parseAnalystOutput(text: string): AnalystOutput | null {
  const candidates = [text.trim()];
  const embedded = text.match(/\{[\s\S]*\}/);
  if (embedded) candidates.push(embedded[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<AnalystOutput>;
      if (typeof parsed.review !== "string" || parsed.review.length === 0) continue;
      const lessons = Array.isArray(parsed.lessons)
        ? parsed.lessons.filter(
            (lesson): lesson is { symbol: string; summary: string } =>
              !!lesson && typeof lesson === "object" && typeof lesson.symbol === "string" && typeof lesson.summary === "string",
          )
        : [];
      let proposal: AnalystOutput["proposal"] = null;
      if (parsed.proposal && typeof parsed.proposal === "object") {
        const raw = parsed.proposal as { changes?: unknown; reason?: unknown };
        if (raw.changes && typeof raw.changes === "object" && typeof raw.reason === "string") {
          proposal = { changes: raw.changes as Changeset, reason: raw.reason };
        }
      }
      return { review: parsed.review, lessons, proposal };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Pure auto-revert check: if the newest analyst change is ≥`minAgeMs` old,
 * enough trips closed since it, and expectancy since the change is worse than
 * before it, return the reversing changeset.
 */
export function evaluateRevert(
  changelog: ParamChangelogEntry[],
  trips: Array<{ exit_ts: string; net_usd: number }>,
  nowMs: number,
  options: { min_age_ms?: number; min_trips?: number } = {},
): { changes: Changeset; reason: string } | null {
  const minAge = options.min_age_ms ?? 2 * 24 * 60 * 60_000;
  const minTrips = options.min_trips ?? 3;
  const newestAnalyst = [...changelog]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .find((entry) => entry.source === "analyst");
  if (!newestAnalyst) return null;
  const changeMs = Date.parse(newestAnalyst.ts);
  if (nowMs - changeMs < minAge) return null;
  // Already reverted?
  if (changelog.some((entry) => entry.source === "revert" && Date.parse(entry.ts) > changeMs)) return null;

  const before = trips.filter((trip) => Date.parse(trip.exit_ts) < changeMs);
  const after = trips.filter((trip) => Date.parse(trip.exit_ts) >= changeMs);
  if (after.length < minTrips || before.length === 0) return null;
  const mean = (rows: typeof trips) => rows.reduce((sum, trip) => sum + trip.net_usd, 0) / rows.length;
  if (mean(after) >= mean(before)) return null;

  const changes: Changeset = {};
  for (const key of Object.keys(newestAnalyst.changes) as ParamKey[]) {
    changes[key] = newestAnalyst.changes[key]!.from;
  }
  return {
    changes,
    reason: `Auto-revert of ${newestAnalyst.ts.slice(0, 10)} change (${newestAnalyst.reason.slice(0, 80)}): expectancy ${mean(after).toFixed(2)} after vs ${mean(before).toFixed(2)} before.`,
  };
}

/**
 * Rule-based Analyst (no-LLM fallback, 2026-07-09): a fresh clone has no
 * OPENROUTER_API_KEY, and "the learning loop is off until you add a key" is
 * not a working product. This is the deterministic subset of the review: the
 * same attribution evidence, the same rails, at most one conservative
 * changeset — chosen by fixed rules instead of a model. Pure and testable.
 */
export function ruleBasedAnalysis(input: {
  params: StrategyParams;
  attribution: AttributionSummary;
  prematureStops: number;
  recentDecisions: BotDecisionRow[];
}): AnalystOutput {
  const { attribution, params } = input;
  const skips = input.recentDecisions.filter(
    (decision) => decision.verdict === "skip" || decision.verdict === "blocked",
  );
  const skipCounts = new Map<string, number>();
  for (const decision of skips) {
    const key = decision.reason.slice(0, 60);
    skipCounts.set(key, (skipCounts.get(key) ?? 0) + 1);
  }
  const topSkips = [...skipCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const skipLine =
    topSkips.length > 0
      ? ` Most common refusals: ${topSkips.map(([reason, count]) => `${count}x "${reason}"`).join("; ")}.`
      : "";

  const clampToRail = (key: ParamKey, value: number): number =>
    Math.min(PARAM_CLAMPS[key].max, Math.max(PARAM_CLAMPS[key].min, value));

  // Zero trades: distinguish "rightly patient" from "wrongly picky" on volume
  // of evidence — only a heavily exercised 24h-trend gate justifies loosening.
  if (attribution.round_trips === 0) {
    const trendGateSkips = skips.filter((decision) => decision.reason.includes("below the +")).length;
    if (skips.length >= 30 && trendGateSkips / skips.length >= 0.6) {
      const proposed = clampToRail("entry_min_h24_pct", params.entry_min_h24_pct - 0.5);
      if (proposed < params.entry_min_h24_pct) {
        return {
          review: `Rule-based review (no LLM key set). No round trips closed in the window; the bot refused ${skips.length} candidates and ${trendGateSkips} of those failed the +${params.entry_min_h24_pct}% 24h-trend gate.${skipLine} The gate looks like the binding constraint, so this proposes one conservative loosening inside the rails. Auto-revert will undo it if expectancy worsens.`,
          lessons: [],
          proposal: {
            changes: { entry_min_h24_pct: proposed },
            reason: `${trendGateSkips}/${skips.length} window skips failed the 24h-trend gate with zero trades taken; lowering entry_min_h24_pct ${params.entry_min_h24_pct} → ${proposed} within the rails.`,
          },
        };
      }
    }
    return {
      review: `Rule-based review (no LLM key set). No round trips closed in the window and only ${skips.length} refusals were recorded — not enough evidence to call the gates wrong.${skipLine} Sitting out can be correct; keep collecting.`,
      lessons: [],
      proposal: null,
    };
  }

  // Small sample: the honest move is no change.
  if (attribution.round_trips < 5) {
    return {
      review: `Rule-based review (no LLM key set). Only ${attribution.round_trips} round trip${attribution.round_trips === 1 ? "" : "s"} closed in the window (expectancy ${attribution.expectancy_usd === null ? "n/a" : `$${attribution.expectancy_usd.toFixed(2)}`}). A sample this small proves little, so no parameter change is proposed.${skipLine}`,
      lessons: [],
      proposal: null,
    };
  }

  const winRate = attribution.win_rate ?? 0;
  const stats = `${attribution.round_trips} round trips, ${(winRate * 100).toFixed(0)}% wins, expectancy ${attribution.expectancy_usd === null ? "n/a" : `$${attribution.expectancy_usd.toFixed(2)}`}, ${input.prematureStops} premature stop${input.prematureStops === 1 ? "" : "s"}`;

  // Stops that keep proving premature are the clearest single signal we have.
  if (input.prematureStops >= 2 && input.prematureStops >= attribution.wins) {
    const proposed = clampToRail("stop_vol_mult", params.stop_vol_mult + 0.25);
    if (proposed > params.stop_vol_mult) {
      return {
        review: `Rule-based review (no LLM key set). ${stats}. Losses keep recovering within 2h of the stop — stops look systematically too tight for current volatility, so this widens the volatility multiple one notch inside the rails.`,
        lessons: [],
        proposal: {
          changes: { stop_vol_mult: proposed },
          reason: `${input.prematureStops} premature stops vs ${attribution.wins} wins in the window; widening stop_vol_mult ${params.stop_vol_mult} → ${proposed}.`,
        },
      };
    }
  }

  // A poor hit rate with a real sample: demand a stronger trend before entering.
  if (winRate < 0.35) {
    const proposed = clampToRail("entry_min_h24_pct", params.entry_min_h24_pct + 0.5);
    if (proposed > params.entry_min_h24_pct) {
      return {
        review: `Rule-based review (no LLM key set). ${stats}. The hit rate is poor on a real sample, so this tightens the 24h-trend entry gate one notch inside the rails — fewer, stronger setups.`,
        lessons: [],
        proposal: {
          changes: { entry_min_h24_pct: proposed },
          reason: `Win rate ${(winRate * 100).toFixed(0)}% over ${attribution.round_trips} trips; raising entry_min_h24_pct ${params.entry_min_h24_pct} → ${proposed}.`,
        },
      };
    }
  }

  return {
    review: `Rule-based review (no LLM key set). ${stats}. Nothing in the window argues for a parameter change.${skipLine}`,
    lessons: [],
    proposal: null,
  };
}

/** Default completion: one-shot OpenRouter chat call (no streaming). */
export async function openRouterCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`analyst completion ${response.status}`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("analyst completion returned no content");
  return content;
}

/** The Analyst reads the v2 era only — never the retired v1 strategy's trades. */
export const V2_ERA_START_MS = Date.parse("2026-07-03T18:00:00Z");
const WINDOW_DAYS = 5;

export type AnalystRunResult = {
  ran: boolean;
  memo?: string;
  lessons_written?: number;
  proposal_applied?: boolean;
  proposal_error?: string;
  reverted?: boolean;
  error?: string;
};

/**
 * One full Analyst run: auto-revert check, then review + lessons + at most
 * one clamped changeset. All writes go through the store's validated paths;
 * a garbage LLM response degrades to "no run" instead of corrupting state.
 */
export async function runAnalyst(
  complete: CompletionFn = openRouterCompletion,
  nowMs: number = Date.now(),
): Promise<AnalystRunResult> {
  const store = autopilotStore();
  const sinceMs = Math.max(V2_ERA_START_MS, nowMs - WINDOW_DAYS * 24 * 60 * 60_000);
  const { trips, summary } = buildAttribution({
    trades: store.trades(1000),
    decisions: store.decisions(400),
    exit_watches: store.exitWatches(200),
    param_changelog: store.paramChangelog(200),
    since_ms: sinceMs,
  });

  // Auto-revert runs first and unconditionally (it is code, not the model).
  let reverted = false;
  const revert = evaluateRevert(store.paramChangelog(200), trips, nowMs);
  if (revert) {
    const applied = store.applyParamChangeset(revert.changes, "revert", revert.reason, nowMs);
    reverted = applied.ok;
    if (applied.ok) store.appendActivity("analyst", revert.reason);
  }

  // No key and no injected completion → the deterministic reviewer, so the
  // learning loop works on a fresh clone instead of skipping for lack of an
  // LLM. An injected `complete` (tests, alt providers) always wins.
  let output: AnalystOutput | null;
  if (complete === openRouterCompletion && !process.env.OPENROUTER_API_KEY) {
    output = ruleBasedAnalysis({
      params: store.strategyParams(),
      attribution: summary,
      prematureStops: trips.filter((trip) => trip.premature_stop).length,
      recentDecisions: store.decisions(200),
    });
  } else {
    const prompt = buildAnalystPrompt({
      params: store.strategyParams(),
      attribution: summary,
      prematureStopTrips: trips.filter((trip) => trip.premature_stop).length,
      recentDecisions: store.decisions(200),
      recentLessons: store
        .web3Memory(100)
        .filter((row) => row.kind === "lesson")
        .slice(0, 10)
        .map((row) => `${row.ts.slice(0, 10)} ${row.symbol}: ${row.summary}`),
      changelog: store.paramChangelog(20),
      windowDays: WINDOW_DAYS,
      // The V3 shadow's realized-outcome calibration: the evidence block that
      // lets the Analyst judge the NEW signal against what actually happened.
      v3Calibration: describeCalibration(calibrate(store.candidateSnapshots(2000))),
    });

    let raw: string;
    try {
      raw = await complete(ANALYST_SYSTEM_PROMPT, prompt);
    } catch (error) {
      return { ran: false, reverted, error: `completion failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    output = parseAnalystOutput(raw);
    if (!output) return { ran: false, reverted, error: "analyst output was not valid JSON" };
  }

  store.setAnalystMemo(output.review, nowMs);
  store.appendActivity("analyst", `Daily review: ${output.review.slice(0, 180)}`);
  // The one daily "here's what I learned" should reach the operator's pocket,
  // not just the panel — fills and halts already do.
  notifyOperator("analyst", `Daily review: ${output.review.slice(0, 240)}`);
  for (const lesson of output.lessons.slice(0, 5)) {
    store.appendWeb3Memory({ symbol: lesson.symbol.slice(0, 12), kind: "lesson", summary: lesson.summary });
  }

  let proposalApplied = false;
  let proposalError: string | undefined;
  if (output.proposal) {
    const applied = store.applyParamChangeset(output.proposal.changes, "analyst", output.proposal.reason, nowMs);
    proposalApplied = applied.ok;
    if (applied.ok) {
      store.appendActivity("analyst", `Param change applied: ${output.proposal.reason.slice(0, 160)}`);
      notifyOperator("analyst", `Param change applied: ${output.proposal.reason.slice(0, 200)}`);
    } else {
      proposalError = applied.error;
      store.appendActivity("analyst", `Param proposal REFUSED by the rails: ${applied.error}`);
    }
  }

  return { ran: true, memo: output.review, lessons_written: Math.min(output.lessons.length, 5), proposal_applied: proposalApplied, proposal_error: proposalError, reverted };
}

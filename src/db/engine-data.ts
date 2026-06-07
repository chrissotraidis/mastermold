/// <reference types="node" />

/**
 * Engine ingestion layer (Phase 1).
 *
 * Reads the newest `engine-run-*.json` bundle the Python engine dropped in
 * `engine/out/`, validates it with zod, and exposes it as the same `schema.ts`
 * row types the seeded surfaces already use — labelled with an honest
 * "Engine output" provenance. When no bundle exists, or the newest one is
 * invalid / future-stamped, callers fall back to seeds (the permanent
 * zero-config boot path) and a visible notice explains why.
 *
 * Files, not RPC: the engine writes JSON, the dashboard reads JSON. Nothing here
 * mutates anything external, so the advisory-only / read-only invariant holds.
 * `knowledge_time` is stamped by the engine at write time and never rewritten
 * here, so as-of replay stays honest.
 *
 * See `engine/CONTRACT.md` for the bundle shape this mirrors.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { isKnownBy, type AsOfFilter } from "./bitemporal";
import { store } from "./store";
import type {
  Alert,
  BriefingCard,
  DecisionJournalEntry,
  Driver,
  OutcomeScore,
  ReflectionUpdate,
  StrategyBelief,
} from "./schema";

// --- zod schemas mirroring engine/CONTRACT.md -----------------------------

const bitemporal = {
  event_time: z.string().min(1),
  knowledge_time: z.string().min(1),
};

const driverSchema = z.object({
  id: z.string(),
  briefing_card_id: z.string(),
  label: z.string(),
  direction: z.enum(["bullish", "bearish"]),
  weight: z.number(),
  color: z.string(),
  source_citation: z.string(),
  ...bitemporal,
});

const briefingCardSchema = z.object({
  id: z.string(),
  date: z.string(),
  rank: z.number(),
  headline: z.string(),
  why_now: z.string(),
  relevance_note: z.string(),
  bull_case: z.string(),
  bear_case: z.string(),
  conviction: z.number(),
  horizon: z.string(),
  status: z.enum(["actionable", "nothing_actionable"]),
  asset_ids: z.array(z.string()),
  ...bitemporal,
  drivers: z.array(driverSchema),
});

const alertSchema = z.object({
  id: z.string(),
  asset_id: z.string().nullable(),
  tier: z.enum(["T0", "T1", "T2"]),
  z_score: z.number(),
  message: z.string(),
  rationale: z.string(),
  created_at: z.string(),
  acknowledged: z.boolean(),
  useful_feedback: z.boolean().nullable(),
  ...bitemporal,
});

const journalPendingSchema = z.object({
  id: z.string(),
  briefing_card_id: z.string().nullable(),
  thesis: z.string(),
  signals: z.array(z.string()),
  conviction: z.number(),
  horizon: z.string(),
  falsification_condition: z.string(),
  logged_at: z.string(),
  ...bitemporal,
});

const outcomeSchema = z.object({
  id: z.string(),
  journal_entry_id: z.string(),
  resolved_at: z.string(),
  pnl_note: z.string(),
  thesis_played_out: z.boolean(),
  // process_score stays operator-scored; the engine never emits it. Defaulted here.
  process_score: z.number().optional(),
  outcome_score: z.number(),
  ...bitemporal,
});

const reflectionSchema = z.object({
  id: z.string(),
  strategy_belief_id: z.string(),
  evidence_summary: z.string(),
  significance_passed: z.boolean(),
  applied: z.boolean(),
  created_at: z.string(),
  ...bitemporal,
});

const strategyBeliefSchema = z.object({
  id: z.string(),
  name: z.string(),
  statement: z.string(),
  confidence: z.number(),
  updated_at: z.string(),
  ...bitemporal,
});

const runMetaSchema = z.object({
  run_date: z.string(),
  event_time: z.string(),
  knowledge_time: z.string(),
  provider: z.string(),
  models: z.record(z.string(), z.string()),
  watchlist: z.array(z.string()),
  triggered_tickers: z.array(z.string()),
  cost: z.object({
    llm_calls: z.number(),
    tool_calls: z.number(),
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    usd: z.number(),
  }),
  stages: z.record(z.string(), z.union([z.string(), z.number()])),
});

const bundleSchema = z.object({
  schema_version: z.literal(1),
  run: runMetaSchema,
  briefing_cards: z.array(briefingCardSchema),
  alerts: z.array(alertSchema),
  journal_sync: z
    .object({
      pending_entries: z.array(journalPendingSchema).default([]),
      resolved_entries: z.array(journalPendingSchema).default([]),
      outcomes: z.array(outcomeSchema).default([]),
      reflections: z.array(reflectionSchema).default([]),
      beliefs: z.array(strategyBeliefSchema).default([]),
    })
    .default({
      pending_entries: [],
      resolved_entries: [],
      outcomes: [],
      reflections: [],
      beliefs: [],
    }),
});

export type EngineBundle = z.infer<typeof bundleSchema>;
export type EngineRunMeta = EngineBundle["run"];

// --- Loading & validation --------------------------------------------------

export type EngineStatus =
  | { state: "live"; bundle: EngineBundle; file: string }
  | { state: "absent" } // no engine output at all -> seeds, no notice needed
  | { state: "invalid"; reason: string; file?: string }; // present but unusable -> seeds + notice

type LoadOptions = {
  dir?: string;
  now?: number;
};

export function engineOutDir(): string {
  return process.env.ENGINE_OUT_DIR ?? join(process.cwd(), "engine", "out");
}

function listBundleFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^engine-run-.*\.json$/.test(name))
    .map((name) => join(dir, name));
}

/**
 * Resolve the engine status: the newest valid bundle whose knowledge_time is
 * known by `now` (no look-ahead) and, when an as-of replay is active, by `asOf`.
 */
export function getEngineStatus(
  asOf: AsOfFilter | null = null,
  opts: LoadOptions = {},
): EngineStatus {
  const dir = opts.dir ?? engineOutDir();
  const now = opts.now ?? Date.now();
  const files = listBundleFiles(dir);
  if (files.length === 0) {
    return { state: "absent" };
  }

  const candidates: Array<{ bundle: EngineBundle; file: string }> = [];
  let lastInvalid: { reason: string; file: string } | null = null;

  for (const file of files) {
    const parsed = parseBundle(file);
    if (!parsed.ok) {
      lastInvalid = { reason: parsed.reason, file };
      continue;
    }
    const bundle = parsed.bundle;
    const knownAt = Date.parse(bundle.run.knowledge_time);
    if (Number.isNaN(knownAt)) {
      lastInvalid = { reason: "run.knowledge_time is not a valid timestamp", file };
      continue;
    }
    if (knownAt > now) {
      // Future-stamped relative to wall clock = look-ahead violation.
      lastInvalid = { reason: "run.knowledge_time is in the future (look-ahead)", file };
      continue;
    }
    candidates.push({ bundle, file });
  }

  // Newest valid run by run_date (ties broken by knowledge_time).
  candidates.sort(
    (a, b) =>
      b.bundle.run.run_date.localeCompare(a.bundle.run.run_date) ||
      Date.parse(b.bundle.run.knowledge_time) - Date.parse(a.bundle.run.knowledge_time),
  );

  // Respect as-of replay: only surface a bundle the operator would already know.
  const visible = candidates.find((c) => isKnownBy(c.bundle.run.knowledge_time, asOf));
  if (visible) {
    return { state: "live", bundle: visible.bundle, file: visible.file };
  }

  if (candidates.length > 0) {
    // Valid bundles exist but all are after the as-of cutoff: not an error, just
    // nothing known yet at that timestamp. Treat as absent (seeds, no notice).
    return { state: "absent" };
  }

  return {
    state: "invalid",
    reason: lastInvalid?.reason ?? "no usable engine bundle",
    file: lastInvalid?.file,
  };
}

/**
 * Record a run in the durable store, idempotent by `run_date` (Phase 1.5). Re-running
 * a day's import is a no-op: returns false if the run was already ingested. The
 * dashboard still renders cards/alerts live from the file; this gives history
 * retention and a place for the Phase-2 journal/outcome rows to land durably.
 */
export function ingestEngineRun(bundle: EngineBundle): boolean {
  return store().markRunIngested(
    bundle.run.run_date,
    bundle.run.knowledge_time,
    bundle.run,
  );
}

/** Ingest the newest valid bundle if one exists and has not been ingested yet. */
export function ingestNewestEngineRun(opts: LoadOptions = {}): boolean {
  const status = getEngineStatus(null, opts);
  if (status.state !== "live") return false;
  return ingestEngineRun(status.bundle);
}

function parseBundle(
  file: string,
): { ok: true; bundle: EngineBundle } | { ok: false; reason: string } {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return { ok: false, reason: "could not read file" };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid JSON" };
  }
  const result = bundleSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, reason: `schema validation failed: ${result.error.issues[0]?.message ?? "unknown"}` };
  }
  return { ok: true, bundle: result.data };
}

// --- Provenance ------------------------------------------------------------

export type EngineProvenanceLabel = "Engine output";

export type EngineProvenance = {
  label: EngineProvenanceLabel;
  source: string;
  as_of: string;
  run_date: string;
  provider: string;
  models: Record<string, string>;
};

export function engineProvenance(bundle: EngineBundle, source: string): EngineProvenance {
  return {
    label: "Engine output",
    source,
    as_of: bundle.run.knowledge_time,
    run_date: bundle.run.run_date,
    provider: bundle.run.provider,
    models: bundle.run.models,
  };
}

/**
 * The active data mode for a surface, for honest chips and headers. `label`
 * distinguishes live engine output from the seeded fallback; `notice` is set when
 * an engine bundle was present but unusable.
 */
export type DataMode = {
  label: "Engine output" | "Demo data";
  source: string;
  detail: string;
  as_of: string | null;
  notice?: string;
};

export function getDataMode(asOf: AsOfFilter | null = null): DataMode {
  const status = getEngineStatus(asOf);
  if (status.state === "live") {
    return {
      label: "Engine output",
      source: engineRunSummary(status.bundle),
      detail: `Live TradingAgents run · ${status.bundle.run.triggered_tickers.length} ticker(s) analyzed`,
      as_of: status.bundle.run.knowledge_time,
    };
  }
  const notice =
    status.state === "invalid"
      ? `Engine output present but unusable (${status.reason}); showing seeded demo data.`
      : undefined;
  return {
    label: "Demo data",
    source: "Seeded demo data",
    detail: "Permanent zero-config fallback; no engine run ingested",
    as_of: null,
    notice,
  };
}

/** One-line, human-readable description of the run for chips and /review. */
export function engineRunSummary(bundle: EngineBundle): string {
  const models = Object.values(bundle.run.models).join(" + ");
  const cost =
    bundle.run.cost.usd > 0 ? `$${bundle.run.cost.usd.toFixed(2)}` : "$0 (quiet day)";
  return `TradingAgents run ${bundle.run.run_date} · ${bundle.run.provider} (${models}) · ${cost}`;
}

// --- Row extraction (bundle -> schema.ts types) ----------------------------

export function engineBriefingCards(bundle: EngineBundle): BriefingCard[] {
  return [...bundle.briefing_cards]
    .map(stripDrivers)
    .sort((a, b) => a.rank - b.rank);
}

export function engineDrivers(bundle: EngineBundle): Driver[] {
  return bundle.briefing_cards.flatMap((card) => card.drivers);
}

export function engineDriversFor(bundle: EngineBundle, cardId: string): Driver[] {
  const card = bundle.briefing_cards.find((c) => c.id === cardId);
  return card ? [...card.drivers].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)) : [];
}

export function engineAlerts(bundle: EngineBundle): Alert[] {
  // asset_id is non-null in the Alert schema; engine alerts always carry one.
  return bundle.alerts.filter((a): a is Alert => a.asset_id !== null);
}

/** Logged-before-outcome entries from this run (used to link a card to its journal). */
export function engineJournalEntries(bundle: EngineBundle): DecisionJournalEntry[] {
  return bundle.journal_sync.pending_entries.map((entry) => ({ ...entry }));
}

/** All engine decisions (pending + resolved) — the basis for the track record. */
export function engineAllJournalEntries(bundle: EngineBundle): DecisionJournalEntry[] {
  return [...bundle.journal_sync.pending_entries, ...bundle.journal_sync.resolved_entries].map(
    (entry) => ({ ...entry }),
  );
}

export function engineOutcomeScores(bundle: EngineBundle): OutcomeScore[] {
  return bundle.journal_sync.outcomes.map((o) => ({
    ...o,
    // process_score is operator-scored; default to 0 until the operator grades it.
    process_score: o.process_score ?? 0,
  }));
}

export function engineReflections(bundle: EngineBundle): ReflectionUpdate[] {
  return bundle.journal_sync.reflections.map((r) => ({ ...r }));
}

export function engineBeliefs(bundle: EngineBundle): StrategyBelief[] {
  return bundle.journal_sync.beliefs.map((b) => ({ ...b }));
}

/** True when the engine bundle carries resolved decisions to compute a track record from. */
export function engineHasResolvedJournal(bundle: EngineBundle): boolean {
  return bundle.journal_sync.outcomes.length > 0;
}

function stripDrivers(card: EngineBundle["briefing_cards"][number]): BriefingCard {
  const { drivers: _drivers, ...rest } = card;
  return rest;
}

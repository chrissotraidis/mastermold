import { demoDatabase } from "./seed-data";
import { store } from "./store";
import {
  engineAllJournalEntries,
  engineBeliefs,
  engineHasResolvedJournal,
  engineOutcomeScores,
  engineReflections,
  engineRunSummary,
  getEngineStatus,
} from "./engine-data";
import { isKnownBy, latestKnowledgeTime as getLatestKnowledgeTime, type AsOfFilter } from "./bitemporal";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import type {
  DecisionJournalEntry,
  OutcomeScore,
  ReflectionUpdate,
  StrategyBelief,
} from "./schema";

export type ConfidenceTierKey = "1-3" | "4-6" | "7-10";

export type JournalEntryJson = DecisionJournalEntry & {
  conviction_tier: {
    key: ConfidenceTierKey;
    label: string;
  };
  outcome_score: OutcomeScore | null;
};

export type TrackRecordTierJson = {
  key: ConfidenceTierKey;
  label: string;
  entry_count: number;
  resolved_count: number;
  wins: number;
  win_rate: number | null;
  mean_outcome_score: number | null;
};

export type StrategyBeliefJson = StrategyBelief & {
  reflection_updates: ReflectionUpdate[];
};

export type CalibrationBucketJson = {
  conviction: number; // 1-10
  resolved_count: number;
  wins: number;
  hit_rate: number | null; // wins / resolved_count
};

export type JournalJson = {
  entries: JournalEntryJson[];
  outcome_scores: OutcomeScore[];
  track_record: TrackRecordTierJson[];
  calibration: CalibrationBucketJson[];
  strategy_beliefs: StrategyBeliefJson[];
  reflection_updates: ReflectionUpdate[];
  provenance: {
    label: "Demo data" | "Engine output";
    source: string;
    as_of: string;
    replay_as_of: string | null;
  };
};

export type CreateDecisionInput = {
  thesis: string;
  signals: string[];
  conviction: number;
  horizon: string;
  falsification_condition: string;
};

export type CreateOutcomeInput = {
  thesis_played_out: boolean;
  process_score: number;
  outcome_score: number;
  pnl_note: string;
};

const tierDefinitions: Array<{
  key: ConfidenceTierKey;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "1-3", label: "1-3 exploratory", min: 1, max: 3 },
  { key: "4-6", label: "4-6 cautious", min: 4, max: 6 },
  { key: "7-10", label: "7-10 stronger calls", min: 7, max: 10 },
];

export function getJournal(asOf: AsOfFilter | null = null): JournalJson {
  const status = getEngineStatus(asOf);
  // Use engine data only once it carries resolved decisions (a track record);
  // before then, the journal stays on seeds even if a briefing run exists.
  const engineLive = status.state === "live" && engineHasResolvedJournal(status.bundle);
  const bundle = engineLive ? status.bundle : null;

  const outcomeScores = getOutcomeScores(asOf, bundle ? engineOutcomeScores(bundle) : undefined);

  // Engine decisions (when live) replace seeded decisions; operator-logged entries
  // from the durable store are always included on top.
  const baseEntries = bundle ? engineAllJournalEntries(bundle) : demoDatabase.decisionJournalEntries;
  const entries = buildEntries(baseEntries, asOf, outcomeScores);

  const reflectionUpdates = bundle
    ? engineReflections(bundle)
        .filter((update) => isKnownBy(update.knowledge_time, asOf))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    : getReflectionUpdates(asOf);

  const strategyBeliefs = bundle
    ? engineBeliefs(bundle)
        .filter((belief) => isKnownBy(belief.knowledge_time, asOf))
        .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
        .map((belief) => ({
          ...belief,
          reflection_updates: reflectionUpdates.filter(
            (update) => update.strategy_belief_id === belief.id,
          ),
        }))
    : getStrategyBeliefs(reflectionUpdates, asOf);

  return {
    entries,
    outcome_scores: outcomeScores,
    track_record: getTrackRecord(entries),
    calibration: getCalibration(entries),
    strategy_beliefs: strategyBeliefs,
    reflection_updates: reflectionUpdates,
    provenance: {
      label: engineLive ? "Engine output" : "Demo data",
      source: engineLive ? engineRunSummary(bundle!) : "Seeded decision journal",
      as_of: asOf?.iso ?? (bundle ? bundle.run.knowledge_time : latestKnowledgeTime(asOf)),
      replay_as_of: asOf?.iso ?? null,
    },
  };
}

export function createDecisionJournalEntry(input: CreateDecisionInput): JournalEntryJson {
  const now = new Date().toISOString();
  const entry: DecisionJournalEntry = {
    id: `journal_logged_${Date.now().toString(36)}`,
    briefing_card_id: null,
    thesis: input.thesis,
    signals: input.signals,
    conviction: input.conviction,
    horizon: input.horizon,
    falsification_condition: input.falsification_condition,
    logged_at: now,
    event_time: now,
    knowledge_time: now,
  };

  store().addJournalEntry(entry);
  return toJournalEntryJson(entry);
}

export function createOutcomeScore(
  journalEntryId: string,
  input: CreateOutcomeInput,
): JournalEntryJson | null {
  const currentJournal = getJournal();
  const entry = currentJournal.entries.find((item) => item.id === journalEntryId);
  if (!entry || entry.outcome_score) return null;

  const now = new Date().toISOString();
  const score: OutcomeScore = {
    id: `outcome_${journalEntryId}_${Date.now().toString(36)}`,
    journal_entry_id: journalEntryId,
    resolved_at: now,
    pnl_note: input.pnl_note,
    thesis_played_out: input.thesis_played_out,
    process_score: input.process_score,
    outcome_score: input.outcome_score,
    event_time: now,
    knowledge_time: now,
  };

  store().addOutcomeScore(score);
  return getJournal().entries.find((item) => item.id === journalEntryId) ?? null;
}

function buildEntries(
  baseEntries: DecisionJournalEntry[],
  asOf: AsOfFilter | null,
  outcomeScores: OutcomeScore[],
): JournalEntryJson[] {
  const entries = [...baseEntries, ...store().loggedJournalEntries()]
    .filter((entry) => isKnownBy(entry.knowledge_time, asOf))
    .map((entry) => toJournalEntryJson(entry, outcomeScores))
    .sort((a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at));

  return collapseRepeatedJournalEntries(entries);
}

function toJournalEntryJson(
  entry: DecisionJournalEntry,
  outcomeScores = demoDatabase.outcomeScores,
): JournalEntryJson {
  return {
    ...entry,
    conviction_tier: getConvictionTier(entry.conviction),
    outcome_score: outcomeScores.find((score) => score.journal_entry_id === entry.id) ?? null,
  };
}

function collapseRepeatedJournalEntries(entries: JournalEntryJson[]) {
  const byKey = new Map<string, JournalEntryJson>();

  for (const entry of entries) {
    const key = journalDedupeKey(entry);
    const existing = byKey.get(key);

    if (!existing || Date.parse(entry.logged_at) > Date.parse(existing.logged_at)) {
      byKey.set(key, entry);
    }
  }

  return [...byKey.values()].sort((a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at));
}

function journalDedupeKey(entry: JournalEntryJson) {
  const title = canonicalText(entry.thesis);
  const horizon = canonicalText(entry.horizon);
  const proof = canonicalText(entry.falsification_condition);
  const clues = entry.signals.map(canonicalClue).filter(Boolean);
  const clue = clues.sort().join("|");
  const alertSymbol = alertSymbolFromTitle(title);

  if (alertSymbol) {
    const alertClue = clues
      .filter((item) => item !== "portfolio" && item !== "watchlist")
      .sort()
      .join("|");
    return `alert:${alertSymbol}:${alertClue}:${horizon}`;
  }

  return `${title}:${clue}:${horizon}:${proof}`;
}

function alertSymbolFromTitle(title: string) {
  if (!title.startsWith("review alert")) return null;
  const alertBody = title.replace(/^review alert\s*/, "");
  return alertBody.match(/\b[a-z]{1,6}\b/i)?.[0]?.toUpperCase() ?? null;
}

function canonicalClue(value: string) {
  const normalized = canonicalText(value);
  if (/^z\s*\d/.test(normalized) || /^z$/.test(normalized)) return "";
  if (
    normalized === "saved market scan" ||
    normalized === "engine output" ||
    normalized.startsWith("market read") ||
    normalized.startsWith("portfolio") ||
    normalized.startsWith("memory")
  ) {
    return "";
  }
  if (normalized === "t0" || normalized.includes("urgent")) return "urgent";
  if (normalized === "t1" || normalized.includes("worth checking")) return "worth-checking";
  if (normalized === "t2" || normalized.includes("fyi")) return "fyi";
  if (normalized.includes("volume")) return "volume";
  if (normalized.includes("return") || normalized.includes("price")) return "price";
  if (normalized.includes("news")) return "news";
  if (normalized.includes("funding")) return "funding";
  if (normalized.includes("portfolio")) return "portfolio";
  if (normalized.includes("watchlist")) return "watchlist";
  return normalized;
}

function canonicalText(value: string) {
  return plainBriefingText(plainBriefingHeadline(value))
    .toLowerCase()
    .replace(/&#x27;/g, "'")
    .replace(/[^a-z0-9%$]+/g, " ")
    .trim();
}

function getOutcomeScores(asOf: AsOfFilter | null, baseScores = demoDatabase.outcomeScores) {
  return [...baseScores, ...store().outcomeScores()]
    .filter((score) => isKnownBy(score.knowledge_time, asOf))
    .sort(
    (a, b) => Date.parse(b.resolved_at) - Date.parse(a.resolved_at),
  );
}

function getReflectionUpdates(asOf: AsOfFilter | null) {
  return [...demoDatabase.reflectionUpdates]
    .filter((update) => isKnownBy(update.knowledge_time, asOf))
    .sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
}

function getStrategyBeliefs(
  reflectionUpdates: ReflectionUpdate[],
  asOf: AsOfFilter | null,
): StrategyBeliefJson[] {
  return [...demoDatabase.strategyBeliefs]
    .filter((belief) => isKnownBy(belief.knowledge_time, asOf))
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name))
    .map((belief) => ({
      ...belief,
      reflection_updates: reflectionUpdates.filter(
        (update) => update.strategy_belief_id === belief.id,
      ),
    }));
}

function getTrackRecord(entries: JournalEntryJson[]): TrackRecordTierJson[] {
  return tierDefinitions.map((tier) => {
    const tierEntries = entries.filter((entry) => entry.conviction_tier.key === tier.key);
    const resolvedEntries = tierEntries.filter((entry) => entry.outcome_score);
    const wins = resolvedEntries.filter((entry) => entry.outcome_score?.thesis_played_out).length;
    const outcomeTotal = resolvedEntries.reduce(
      (total, entry) => total + (entry.outcome_score?.outcome_score ?? 0),
      0,
    );

    return {
      key: tier.key,
      label: tier.label,
      entry_count: tierEntries.length,
      resolved_count: resolvedEntries.length,
      wins,
      win_rate: resolvedEntries.length > 0 ? wins / resolvedEntries.length : null,
      mean_outcome_score:
        resolvedEntries.length > 0 ? outcomeTotal / resolvedEntries.length : null,
    };
  });
}

/**
 * Calibration curve: realized hit rate at each conviction level (1-10), over resolved
 * decisions. The honest core of the anti-self-deception promise — it shows whether an
 * 8/10 conviction actually wins more often than a 5/10. Only buckets with at least one
 * resolved decision are returned; at small sample sizes this is suggestive, not proof.
 */
function getCalibration(entries: JournalEntryJson[]): CalibrationBucketJson[] {
  const buckets: CalibrationBucketJson[] = [];
  for (let conviction = 1; conviction <= 10; conviction += 1) {
    const resolved = entries.filter(
      (entry) => entry.conviction === conviction && entry.outcome_score,
    );
    if (resolved.length === 0) continue;
    const wins = resolved.filter((entry) => entry.outcome_score?.thesis_played_out).length;
    buckets.push({
      conviction,
      resolved_count: resolved.length,
      wins,
      hit_rate: resolved.length > 0 ? wins / resolved.length : null,
    });
  }
  return buckets;
}

export function getConvictionTier(conviction: number) {
  const tier =
    tierDefinitions.find((item) => conviction >= item.min && conviction <= item.max) ??
    tierDefinitions[0];

  return {
    key: tier.key,
    label: tier.label,
  };
}

function latestKnowledgeTime(asOf: AsOfFilter | null) {
  const knowledgeTimes = [
    ...demoDatabase.decisionJournalEntries
      .filter((entry) => isKnownBy(entry.knowledge_time, asOf))
      .map((entry) => entry.knowledge_time),
    ...store()
      .loggedJournalEntries()
      .filter((entry) => isKnownBy(entry.knowledge_time, asOf))
      .map((entry) => entry.knowledge_time),
    ...store()
      .outcomeScores()
      .filter((score) => isKnownBy(score.knowledge_time, asOf))
      .map((score) => score.knowledge_time),
    ...demoDatabase.outcomeScores
      .filter((score) => isKnownBy(score.knowledge_time, asOf))
      .map((score) => score.knowledge_time),
    ...demoDatabase.strategyBeliefs
      .filter((belief) => isKnownBy(belief.knowledge_time, asOf))
      .map((belief) => belief.knowledge_time),
    ...demoDatabase.reflectionUpdates
      .filter((update) => isKnownBy(update.knowledge_time, asOf))
      .map((update) => update.knowledge_time),
  ];

  return getLatestKnowledgeTime(knowledgeTimes);
}

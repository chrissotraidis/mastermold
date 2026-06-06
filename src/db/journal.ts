import { demoDatabase } from "./seed-data";
import { isKnownBy, latestKnowledgeTime as getLatestKnowledgeTime, type AsOfFilter } from "./bitemporal";
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

export type JournalJson = {
  entries: JournalEntryJson[];
  outcome_scores: OutcomeScore[];
  track_record: TrackRecordTierJson[];
  strategy_beliefs: StrategyBeliefJson[];
  reflection_updates: ReflectionUpdate[];
  provenance: {
    label: "Demo data";
    source: "Seeded decision journal";
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

const loggedDecisions: DecisionJournalEntry[] = [];

const tierDefinitions: Array<{
  key: ConfidenceTierKey;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "1-3", label: "1-3 exploratory", min: 1, max: 3 },
  { key: "4-6", label: "4-6 watchlist", min: 4, max: 6 },
  { key: "7-10", label: "7-10 high conviction", min: 7, max: 10 },
];

export function getJournal(asOf: AsOfFilter | null = null): JournalJson {
  const outcomeScores = getOutcomeScores(asOf);
  const entries = getJournalEntries(asOf, outcomeScores);
  const reflectionUpdates = getReflectionUpdates(asOf);

  return {
    entries,
    outcome_scores: outcomeScores,
    track_record: getTrackRecord(entries),
    strategy_beliefs: getStrategyBeliefs(reflectionUpdates, asOf),
    reflection_updates: reflectionUpdates,
    provenance: {
      label: "Demo data",
      source: "Seeded decision journal",
      as_of: asOf?.iso ?? latestKnowledgeTime(asOf),
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

  loggedDecisions.push(entry);
  return toJournalEntryJson(entry);
}

function getJournalEntries(
  asOf: AsOfFilter | null,
  outcomeScores: OutcomeScore[],
): JournalEntryJson[] {
  return [...demoDatabase.decisionJournalEntries, ...loggedDecisions]
    .filter((entry) => isKnownBy(entry.knowledge_time, asOf))
    .map((entry) => toJournalEntryJson(entry, outcomeScores))
    .sort((a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at));
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

function getOutcomeScores(asOf: AsOfFilter | null) {
  return [...demoDatabase.outcomeScores]
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
    ...loggedDecisions
      .filter((entry) => isKnownBy(entry.knowledge_time, asOf))
      .map((entry) => entry.knowledge_time),
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

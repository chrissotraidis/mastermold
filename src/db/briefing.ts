import { demoDatabase } from "./seed-data";
import type { BriefingCard, DecisionJournalEntry, Driver } from "./schema";
import {
  engineBriefingCards,
  engineDriversFor,
  engineJournalEntries,
  engineProvenance,
  engineRunSummary,
  getEngineStatus,
  type EngineBundle,
} from "./engine-data";

/**
 * Provenance carried on every briefing payload. `label` distinguishes live
 * "Engine output" from the seeded "Demo data" fallback; `notice` is set only when
 * an engine bundle was present but unusable and the surface fell back to seeds.
 */
export type BriefingProvenance = {
  label: "Demo data" | "Engine output";
  source: string;
  as_of: string;
  notice?: string;
};

export type BriefingCardJson = BriefingCard & {
  provenance: BriefingProvenance;
};

export type BriefingDetailJson = Omit<BriefingCardJson, "provenance"> & {
  drivers: Driver[];
  decision_journal_entry: DecisionJournalEntry | null;
  provenance: BriefingProvenance;
};

function seededProvenance(source: string, asOf: string, notice?: string): BriefingProvenance {
  return notice
    ? { label: "Demo data", source, as_of: asOf, notice }
    : { label: "Demo data", source, as_of: asOf };
}

function fallbackNotice(): string | undefined {
  const status = getEngineStatus();
  return status.state === "invalid"
    ? `Engine output present but unusable (${status.reason}); showing seeded demo data.`
    : undefined;
}

export function getBriefingCards(): BriefingCardJson[] {
  const status = getEngineStatus();

  if (status.state === "live") {
    const provenance: BriefingProvenance = {
      ...engineProvenance(status.bundle, engineRunSummary(status.bundle)),
    };
    return engineBriefingCards(status.bundle)
      .map((card) => ({ ...card, provenance }))
      .sort((a, b) => a.rank - b.rank);
  }

  const notice = fallbackNotice();
  return demoDatabase.briefingCards
    .map((card) => ({
      ...card,
      provenance: seededProvenance("Seeded briefing", card.knowledge_time, notice),
    }))
    .sort((a, b) => a.rank - b.rank);
}

export function getBriefingCardIds(): string[] {
  const status = getEngineStatus();
  const engineIds = status.state === "live" ? status.bundle.briefing_cards.map((c) => c.id) : [];
  return [...engineIds, ...demoDatabase.briefingCards.map((card) => card.id), "[id]"];
}

export function getBriefingCardById(id: string): BriefingDetailJson | null {
  const decodedId = safelyDecodeId(id);
  const status = getEngineStatus();

  if (status.state === "live") {
    const detail = engineCardDetail(status.bundle, decodedId);
    if (detail) return detail;
    // Fall through to seeds if the id is not an engine card (e.g. a stale link).
  }

  const normalizedId = decodedId === "[id]" ? demoDatabase.briefingCards[0]?.id : decodedId;
  const card = demoDatabase.briefingCards.find((item) => item.id === normalizedId);

  if (!card) {
    return null;
  }

  const drivers = demoDatabase.drivers
    .filter((driver) => driver.briefing_card_id === card.id)
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));

  const decisionJournalEntry =
    demoDatabase.decisionJournalEntries.find((entry) => entry.briefing_card_id === card.id) ??
    null;

  return {
    ...card,
    drivers,
    decision_journal_entry: decisionJournalEntry,
    provenance: seededProvenance("Seeded briefing detail", card.knowledge_time, fallbackNotice()),
  };
}

function engineCardDetail(bundle: EngineBundle, id: string): BriefingDetailJson | null {
  const cards = engineBriefingCards(bundle);
  const normalizedId = id === "[id]" ? cards[0]?.id : id;
  const card = cards.find((item) => item.id === normalizedId);
  if (!card) return null;

  const decision_journal_entry =
    engineJournalEntries(bundle).find((entry) => entry.briefing_card_id === card.id) ?? null;

  return {
    ...card,
    drivers: engineDriversFor(bundle, card.id),
    decision_journal_entry,
    provenance: engineProvenance(bundle, engineRunSummary(bundle)),
  };
}

function safelyDecodeId(id: string) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export function getDecisionJournalEntries(): DecisionJournalEntry[] {
  const status = getEngineStatus();
  if (status.state === "live") {
    const engineEntries = engineJournalEntries(status.bundle);
    if (engineEntries.length > 0) {
      return [...engineEntries].sort((a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at));
    }
  }
  return [...demoDatabase.decisionJournalEntries].sort(
    (a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at),
  );
}

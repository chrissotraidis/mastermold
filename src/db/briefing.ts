import { demoDatabase } from "./seed-data";
import type { BriefingCard, DecisionJournalEntry, Driver } from "./schema";

export type BriefingCardJson = BriefingCard & {
  provenance: {
    label: "Demo data";
    source: "Seeded briefing";
    as_of: string;
  };
};

export type BriefingDetailJson = Omit<BriefingCardJson, "provenance"> & {
  drivers: Driver[];
  decision_journal_entry: DecisionJournalEntry | null;
  provenance: Omit<BriefingCardJson["provenance"], "source"> & {
    source: "Seeded briefing detail";
  };
};

export function getBriefingCards(): BriefingCardJson[] {
  return demoDatabase.briefingCards
    .map((card) => ({
      ...card,
      provenance: {
        label: "Demo data" as const,
        source: "Seeded briefing" as const,
        as_of: card.knowledge_time,
      },
    }))
    .sort((a, b) => a.rank - b.rank);
}

export function getBriefingCardIds(): string[] {
  return [...demoDatabase.briefingCards.map((card) => card.id), "[id]"];
}

export function getBriefingCardById(id: string): BriefingDetailJson | null {
  const decodedId = safelyDecodeId(id);
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
    provenance: {
      label: "Demo data",
      source: "Seeded briefing detail",
      as_of: card.knowledge_time,
    },
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
  return [...demoDatabase.decisionJournalEntries].sort(
    (a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at),
  );
}

import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";

type BriefingJournalCard = {
  headline: string;
  conviction: number;
  horizon: string;
  bear_case: string;
  decision_journal_entry?: {
    thesis: string;
    falsification_condition: string;
  } | null;
};

type BriefingJournalDriver = {
  label: string;
};

export function buildBriefingJournalDraftHref({
  card,
  drivers,
}: {
  card: BriefingJournalCard;
  drivers: BriefingJournalDriver[];
}) {
  const headline = plainBriefingHeadline(card.headline);
  const params = new URLSearchParams({
    call: card.decision_journal_entry
      ? plainBriefingHeadline(card.decision_journal_entry.thesis)
      : headline,
    reasons: drivers.map((driver) => plainBriefingText(driver.label)).join(", "),
    confidence: String(card.conviction || 6),
    horizon: card.horizon,
    falsification: plainBriefingText(
      card.decision_journal_entry?.falsification_condition ?? card.bear_case,
    ),
  });
  return `/journal?${params.toString()}`;
}

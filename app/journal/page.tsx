import { AppShell } from "@/components/app-shell";
import { JournalWorkspace, type SystemJournalEntry } from "@/components/journal-workspace";
import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { toPublicJournal } from "@/lib/public-api-copy";
import { autopilotStore } from "@/src/autopilot/store";
import { parseAsOf, type AsOfFilter } from "@/src/db/bitemporal";
import { getBriefingCardById, getBriefingCards } from "@/src/db/briefing";
import { getJournal } from "@/src/db/journal";
import { getPortfolio } from "@/src/db/portfolio";

export const dynamic = "force-dynamic";

type JournalPageProps = {
  searchParams?: Promise<{
    entry?: string;
    as_of?: string;
    call?: string;
    thesis?: string;
    reasons?: string;
    signals?: string;
    confidence?: string;
    conviction?: string;
    horizon?: string;
    falsification?: string;
    action?: string;
  }>;
};

export default async function JournalPage({ searchParams }: JournalPageProps) {
  const params = await searchParams;
  const parsedAsOf = parseAsOf(params?.as_of ?? null);
  const journal = getJournal(parsedAsOf.ok ? parsedAsOf.asOf : null);
  const publicJournal = toPublicJournal(journal);
  const publicProvenanceLabel = productProvenanceLabel(journal.provenance.label);
  const preparedDraft = topIdeaDraft(parsedAsOf.ok ? parsedAsOf.asOf : null, params?.action);
  const initialDraft = draftFromParams(params) ?? preparedDraft?.draft;
  const systemEntries = systemJournalEntries();
  const holdingSymbols = getPortfolio().holdings.map((holding) => holding.symbol);

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="grid w-full min-w-0 grid-cols-1 gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mm-eyebrow">Your calls and Master Mold&apos;s own lessons — every entry says who wrote it</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Journal</h1>
          </div>
          <a
            href="/paper"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-outline-variant/70 bg-surface-low/60 px-4 text-sm font-semibold text-on-surface transition hover:border-violet/45 sm:min-h-9"
          >
            Test a call in the simulator →
          </a>
        </header>

        <JournalWorkspace
          initialJournal={publicJournal}
          initialDraft={initialDraft}
          initialDraftReason={preparedDraft?.reason}
          focusedEntryId={params?.entry}
          systemEntries={systemEntries}
          holdingSymbols={holdingSymbols}
        />
      </div>
    </AppShell>
  );
}

/**
 * Master Mold's own journal entries: the autopilot Analyst's daily review memo
 * and its loss lessons. This is a read-only READ across the lane boundary
 * (docs/ARCHITECTURE.md — chat/briefing/journal may read both lanes); nothing
 * here can write to the autopilot store. Fail-soft: a missing or unreadable
 * autopilot db just means no system entries.
 */
function systemJournalEntries(): SystemJournalEntry[] {
  try {
    const store = autopilotStore();
    const memo = store.analystMemo();
    const lessons = store.web3Memory(50).filter((row) => row.kind === "lesson");

    return [
      ...(memo
        ? [
            {
              id: "analyst-daily-review",
              kind: "daily-review" as const,
              ts: memo.ts,
              text: memo.memo,
              symbol: null,
            },
          ]
        : []),
      ...lessons.map((row) => ({
        id: row.id,
        kind: "lesson" as const,
        ts: row.ts,
        text: row.summary,
        symbol: row.symbol || null,
      })),
    ];
  } catch {
    return [];
  }
}

function draftFromParams(params: Awaited<JournalPageProps["searchParams"]>) {
  const call = cleanParam(params?.call) || cleanParam(params?.thesis);
  if (!call) return undefined;
  return {
    call,
    signals: cleanParam(params?.reasons) || cleanParam(params?.signals),
    confidence: cleanParam(params?.confidence) || cleanParam(params?.conviction) || "6",
    horizon: cleanParam(params?.horizon),
    falsification_condition: cleanParam(params?.falsification),
  };
}

function topIdeaDraft(asOf: AsOfFilter | null, action: string | undefined) {
  if (action !== "record-top-idea") return undefined;

  const cards = getBriefingCards(asOf);
  const topCard = cards.find((card) => card.status === "actionable") ?? cards[0];
  if (!topCard) return undefined;

  const detail = getBriefingCardById(topCard.id, asOf);
  if (!detail) return undefined;

  const reasonText =
    detail.drivers.length > 0
      ? detail.drivers.map((driver) => plainBriefingText(driver.label)).join(", ")
      : plainBriefingText(detail.relevance_note || detail.why_now);

  return {
    reason: "Built from the current top market idea.",
    draft: {
      call: detail.decision_journal_entry
        ? plainBriefingHeadline(detail.decision_journal_entry.thesis)
        : plainBriefingHeadline(detail.headline),
      signals: reasonText,
      confidence: String(detail.conviction || 6),
      horizon: detail.horizon,
      falsification_condition: plainBriefingText(
        detail.decision_journal_entry?.falsification_condition ?? detail.bear_case,
      ),
    },
  };
}

function cleanParam(value: string | undefined) {
  return typeof value === "string" ? value.slice(0, 2000) : "";
}


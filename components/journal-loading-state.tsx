import { CommandConsole, type CommandSuggestion } from "@/components/command-console";
import type { ChatPageContext } from "@/src/db/chat";

const journalLoadingContext: ChatPageContext = {
  surface: "Decision journal",
  route: "/journal",
  summary:
    "The Decision journal is loading. The user may want to record a call, review recent calls, check decision quality, or prepare a paper trade.",
};

const journalLoadingSuggestions: CommandSuggestion[] = [
  { label: "Record call", prompt: "Record a call." },
  { label: "Recent calls", prompt: "What do my recent saved calls say about my decision quality?" },
  { label: "Next review", prompt: "Open journal." },
  { label: "Paper check", prompt: "Prepare paper trade." },
];

export function JournalLoadingState() {
  return (
    <section
      className="grid min-h-[calc(100svh-10rem)] gap-4 pb-6 lg:grid-cols-[minmax(0,0.68fr)_minmax(18rem,0.36fr)] lg:content-start"
      aria-label="Decision journal loading"
      data-testid="journal-loading-state"
    >
      <div className="min-w-0 space-y-4">
        <div className="rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Next journal action</p>
          <h2 className="mt-1 text-lg font-semibold leading-tight text-on-surface sm:text-xl">
            Ask Master Mold while Journal opens.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
            Saved calls, score checks, and the record form are loading. You can still route to record a call, review decisions, or prepare a paper check.
          </p>
          <CommandConsole
            className="mt-4"
            pageContext={journalLoadingContext}
            suggestions={journalLoadingSuggestions}
            placeholder="Ask Master Mold to check Journal..."
          />
        </div>

        <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-on-surface">Decision quality</p>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">Track record and recent saved calls will appear here.</p>
            </div>
            <div className="h-8 w-24 animate-pulse rounded bg-surface-highest/50" aria-hidden="true" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-hidden="true">
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </div>
          <div className="mt-4 space-y-3" aria-hidden="true">
            <EntrySkeleton />
            <EntrySkeleton />
            <EntrySkeleton />
          </div>
        </div>
      </div>

      <aside className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4">
        <p className="text-lg font-semibold text-on-surface">Record a call</p>
        <p className="mt-1 text-sm leading-6 text-outline">The form loads here so a decision can be saved before the result is obvious.</p>
        <div className="mt-4 space-y-3" aria-hidden="true">
          <div className="h-24 animate-pulse rounded-md bg-surface-dim/65" />
          <div className="h-11 animate-pulse rounded-md bg-surface-dim/65" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-11 animate-pulse rounded-md bg-surface-dim/65" />
            <div className="h-11 animate-pulse rounded-md bg-surface-dim/65" />
          </div>
          <div className="h-11 animate-pulse rounded-md bg-violet/20" />
        </div>
      </aside>
    </section>
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/40 p-3">
      <div className="h-3 w-20 animate-pulse rounded bg-surface-highest/45" />
      <div className="mt-2 h-6 w-14 animate-pulse rounded bg-surface-highest/60" />
    </div>
  );
}

function EntrySkeleton() {
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/40 p-3">
      <div className="h-4 w-44 max-w-full animate-pulse rounded bg-surface-highest/60" />
      <div className="mt-2 h-3 w-full animate-pulse rounded bg-surface-highest/35" />
      <div className="mt-2 h-3 w-9/12 animate-pulse rounded bg-surface-highest/35" />
    </div>
  );
}

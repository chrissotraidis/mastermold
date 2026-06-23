import { CommandConsole, type CommandSuggestion } from "@/components/command-console";
import type { ChatPageContext } from "@/src/db/chat";

const paperLoadingContext: ChatPageContext = {
  surface: "Paper",
  route: "/paper",
  summary:
    "The Paper page is loading. The user may want to prepare a paper trade, test the top idea, review simulator cash, or check the journal.",
};

const paperLoadingSuggestions: CommandSuggestion[] = [
  { label: "Paper trade", prompt: "Prepare paper trade." },
  { label: "Top idea", prompt: "Test top idea on paper." },
  { label: "Journal", prompt: "Open journal." },
  { label: "Save context", prompt: "Save context for chat." },
];

export function PaperLoadingState() {
  return (
    <section
      className="grid min-h-[calc(100svh-10rem)] gap-4 pb-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(18rem,0.34fr)] lg:content-start"
      aria-label="Paper trading loading"
      data-testid="paper-loading-state"
    >
      <div className="min-w-0 space-y-4">
        <div className="rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Next paper action</p>
          <h2 className="mt-1 text-lg font-semibold leading-tight text-on-surface sm:text-xl">
            Ask Master Mold while Paper opens.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
            Simulator cash, open ideas, and the paper-trade form are loading. You can still route to a paper test or journal review right away.
          </p>
          <CommandConsole
            className="mt-4"
            pageContext={paperLoadingContext}
            suggestions={paperLoadingSuggestions}
            placeholder="Ask Master Mold to prepare Paper..."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricSkeleton label="Simulator cash" />
          <MetricSkeleton label="Reserved paper value" />
          <MetricSkeleton label="Open positions" />
        </div>

        <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-on-surface">Active paper round</p>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">Open simulator ideas and scoring history will appear here.</p>
            </div>
            <div className="h-8 w-24 animate-pulse rounded bg-surface-highest/50" aria-hidden="true" />
          </div>
          <div className="mt-4 space-y-3" aria-hidden="true">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        </div>
      </div>

      <aside className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4">
        <p className="text-lg font-semibold text-on-surface">Test a paper trade</p>
        <p className="mt-1 text-sm leading-6 text-outline">The form loads here. Nothing places a real trade.</p>
        <div className="mt-4 space-y-3" aria-hidden="true">
          <div className="h-11 animate-pulse rounded-md bg-surface-dim/65" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-11 animate-pulse rounded-md bg-surface-dim/65" />
            <div className="h-11 animate-pulse rounded-md bg-surface-dim/65" />
            <div className="h-11 animate-pulse rounded-md bg-surface-dim/65" />
          </div>
          <div className="h-24 animate-pulse rounded-md bg-surface-dim/65" />
          <div className="h-11 animate-pulse rounded-md bg-violet/20" />
        </div>
      </aside>
    </section>
  );
}

function MetricSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3">
      <p className="text-xs uppercase tracking-telemetry text-outline">{label}</p>
      <div className="mt-2 h-6 w-20 animate-pulse rounded bg-surface-highest/50" aria-hidden="true" />
      <div className="mt-2 h-3 w-full animate-pulse rounded bg-surface-highest/35" aria-hidden="true" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="h-4 w-36 max-w-full animate-pulse rounded bg-surface-highest/60" />
        <div className="h-5 w-20 animate-pulse rounded bg-surface-highest/45" />
      </div>
      <div className="mt-2 h-3 w-10/12 animate-pulse rounded bg-surface-highest/35" />
    </div>
  );
}

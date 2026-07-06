import { CommandConsole, type CommandSuggestion } from "@/components/command-console";
import type { ChatPageContext } from "@/src/db/chat";

const activityLoadingContext: ChatPageContext = {
  surface: "Activity",
  route: "/activity",
  summary:
    "The Activity page is loading. The user may want the top activity item, urgent items, feedback actions, a paper trade check, or decision capture.",
};

const activityLoadingSuggestions: CommandSuggestion[] = [
  { label: "Top activity", prompt: "Show activity list." },
  { label: "Needs attention", prompt: "Show urgent activity." },
  { label: "Urgent", prompt: "Show urgent activity." },
  { label: "Test on paper", prompt: "Prepare a paper trade check from the most important activity item." },
  { label: "Save context", prompt: "Save context for chat." },
];

export function ActivityLoadingState() {
  return (
    <section
      className="grid min-h-[calc(100svh-10rem)] gap-4 pb-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.32fr)] lg:content-start"
      aria-label="Activity loading"
      data-testid="activity-loading-state"
    >
      <div className="hidden min-w-0 rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:block sm:p-5">
        <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Next activity action</p>
        <h2 className="mt-1 text-lg font-semibold leading-tight text-on-surface sm:text-xl">
          Ask Master Mold while Activity opens.
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
          Activity items, filters, and feedback actions are loading. You can still ask what matters, open urgent items, or prepare a paper check.
        </p>
        <CommandConsole
          className="mt-4"
          pageContext={activityLoadingContext}
          suggestions={activityLoadingSuggestions}
          placeholder="Ask Master Mold to check Activity..."
        />
      </div>

      <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4">
        <p className="text-lg font-semibold text-on-surface">Filters</p>
        <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
          <FilterSkeleton />
          <FilterSkeleton />
          <FilterSkeleton />
          <FilterSkeleton />
        </div>
      </div>

      <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-on-surface">Activity list</p>
            <p className="mt-1 text-sm leading-6 text-on-surface-variant">Latest items will appear with dismiss, feedback, paper-test, and journal actions.</p>
          </div>
          <div className="h-8 w-24 animate-pulse rounded bg-surface-highest/50" aria-hidden="true" />
        </div>
        <div className="mt-4 space-y-3" aria-hidden="true">
          <ActivityItemSkeleton />
          <ActivityItemSkeleton />
          <ActivityItemSkeleton />
        </div>
      </div>
    </section>
  );
}

function FilterSkeleton() {
  return <div className="h-10 w-24 rounded-md bg-surface-highest/35" data-calm-placeholder />;
}

function ActivityItemSkeleton() {
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-4 w-40 max-w-full rounded bg-surface-highest/45" data-calm-placeholder />
          <div className="mt-2 h-3 w-full rounded bg-surface-highest/25" data-calm-placeholder />
          <div className="mt-2 h-3 w-10/12 rounded bg-surface-highest/25" data-calm-placeholder />
        </div>
        <div className="h-6 w-20 rounded bg-surface-highest/30" data-calm-placeholder />
      </div>
    </div>
  );
}

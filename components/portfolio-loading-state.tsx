import { CommandConsole, type CommandSuggestion } from "@/components/command-console";
import type { ChatPageContext } from "@/src/db/chat";

const portfolioLoadingContext: ChatPageContext = {
  surface: "Portfolio",
  route: "/portfolio",
  summary:
    "The Portfolio page is loading. The user may want portfolio risk, holdings, allocation, net worth, manual holdings, or connection setup.",
};

const portfolioLoadingSuggestions: CommandSuggestion[] = [
  { label: "Check risk", prompt: "Check portfolio risk." },
  { label: "Holdings", prompt: "Show holdings." },
  { label: "Add holding", prompt: "Add holding." },
  { label: "Connections", prompt: "Open portfolio connections." },
  { label: "Check Trade", prompt: "Check Trade." },
];

export function PortfolioLoadingState() {
  return (
    <section
      className="grid min-h-[calc(100svh-10rem)] gap-4 pb-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.32fr)] lg:content-start"
      aria-label="Portfolio loading"
      data-testid="portfolio-loading-state"
    >
      <div className="min-w-0 space-y-4">
        <div className="rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Next portfolio action</p>
          <h2 className="mt-1 text-lg font-semibold leading-tight text-on-surface sm:text-xl">
            Ask Master Mold while Portfolio opens.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
            Net worth, holdings, allocation, and connection status are loading. You can still route to risk, holdings, setup, or Trade right away.
          </p>
          <CommandConsole
            className="mt-4 hidden sm:block"
            pageContext={portfolioLoadingContext}
            suggestions={portfolioLoadingSuggestions}
            placeholder="Ask Master Mold to check Portfolio..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricSkeleton label="Total value" />
          <MetricSkeleton label="Today's move" />
          <MetricSkeleton label="Concentration" />
          <MetricSkeleton label="Data source" />
        </div>

        <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-on-surface">Portfolio chart</p>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">Allocation and net-worth movement will appear here.</p>
            </div>
            <div className="h-8 w-28 rounded bg-surface-highest/35" aria-hidden="true" data-calm-placeholder />
          </div>
          <div className="mt-4 h-36 rounded-md border border-outline-variant/30 bg-surface-dim/45 sm:h-48" aria-hidden="true" data-calm-placeholder />
        </div>
      </div>

      <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-on-surface">Holdings</p>
            <p className="mt-1 text-sm leading-6 text-outline">Largest positions first.</p>
          </div>
          <div className="h-7 w-20 rounded bg-surface-highest/35" aria-hidden="true" data-calm-placeholder />
        </div>
        <div className="mt-4 space-y-3" aria-hidden="true">
          <HoldingSkeleton />
          <HoldingSkeleton />
          <HoldingSkeleton />
          <HoldingSkeleton />
        </div>
      </div>
    </section>
  );
}

function MetricSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3 sm:p-4">
      <p className="text-xs uppercase tracking-telemetry text-outline">{label}</p>
      <div className="mt-2 h-7 w-24 rounded bg-surface-highest/35" aria-hidden="true" data-calm-placeholder />
      <div className="mt-2 h-3 w-full rounded bg-surface-highest/25" aria-hidden="true" data-calm-placeholder />
    </div>
  );
}

function HoldingSkeleton() {
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-4 w-20 rounded bg-surface-highest/45" data-calm-placeholder />
          <div className="mt-2 h-3 w-32 max-w-full rounded bg-surface-highest/25" data-calm-placeholder />
        </div>
        <div className="h-5 w-16 rounded bg-surface-highest/30" data-calm-placeholder />
      </div>
    </div>
  );
}

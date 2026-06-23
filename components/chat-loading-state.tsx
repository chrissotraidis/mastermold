import { CommandConsole, type CommandSuggestion } from "@/components/command-console";
import type { ChatPageContext } from "@/src/db/chat";

const chatLoadingContext: ChatPageContext = {
  surface: "Chat",
  route: "/chat",
  summary:
    "The dedicated Master Mold chat view is loading. The user may want today's focus, activity, portfolio risk, Trade status, or setup routes.",
};

const chatLoadingSuggestions: CommandSuggestion[] = [
  { label: "Today focus", prompt: "What should I focus on today?" },
  { label: "Activity", prompt: "Show urgent activity." },
  { label: "Trade", prompt: "Check Trade." },
  { label: "Setup", prompt: "Check setup." },
];

export function ChatLoadingState() {
  return (
    <section
      className="grid min-h-[calc(100svh-10rem)] gap-4 pb-6 lg:grid-cols-[minmax(0,0.76fr)_minmax(18rem,0.34fr)] lg:content-start"
      aria-label="Master Mold chat loading"
      data-testid="chat-loading-state"
    >
      <div className="min-w-0 rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Next chat action</p>
        <h2 className="mt-1 text-lg font-semibold leading-tight text-on-surface sm:text-xl">
          Ask Master Mold while chat opens.
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
          Today, portfolio, activity, Trade, and setup routes are ready while the conversation view loads.
        </p>
        <CommandConsole
          className="mt-4"
          pageContext={chatLoadingContext}
          suggestions={chatLoadingSuggestions}
          placeholder="Ask Master Mold..."
        />
        <div className="mt-5 rounded-md border border-outline-variant/35 bg-surface-dim/45 p-4">
          <div className="h-4 w-28 rounded bg-surface-highest/45" aria-hidden="true" data-calm-placeholder />
          <div className="mt-4 h-11 rounded-md bg-surface-highest/30" aria-hidden="true" data-calm-placeholder />
          <div className="mt-3 h-11 w-10/12 rounded-md bg-surface-highest/25" aria-hidden="true" data-calm-placeholder />
        </div>
      </div>
      <aside className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4">
        <p className="text-lg font-semibold text-on-surface">Ready routes</p>
        <p className="mt-1 text-sm leading-6 text-outline">Use a chip or ask a question; no trade runs from chat.</p>
        <div className="mt-4 grid gap-2" aria-hidden="true">
          <RouteSkeleton label="Today" />
          <RouteSkeleton label="Portfolio" />
          <RouteSkeleton label="Activity" />
          <RouteSkeleton label="Trade" />
        </div>
      </aside>
    </section>
  );
}

function RouteSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between rounded-md border border-outline-variant/35 bg-surface-dim/40 px-3">
      <span className="text-sm font-semibold text-on-surface-variant">{label}</span>
      <span className="h-2 w-12 rounded bg-surface-highest/35" aria-hidden="true" data-calm-placeholder />
    </div>
  );
}

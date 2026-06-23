import { CommandConsole, type CommandSuggestion } from "@/components/command-console";
import type { ChatPageContext } from "@/src/db/chat";

const tradeLoadingContext: ChatPageContext = {
  surface: "Trade",
  route: "/trading",
  summary:
    "The Trade page is loading. The user may want wallet status, the next required action, active positions, a test trade, or Web3 setup.",
};

const tradeLoadingSuggestions: CommandSuggestion[] = [
  { label: "Next action", prompt: "Show next action." },
  { label: "Wallet status", prompt: "Show wallet status." },
  { label: "Test trade", prompt: "Open test trade." },
];

export function TradeLoadingState() {
  return (
    <section
      className="grid min-h-[calc(100svh-10rem)] gap-4 pb-6 lg:grid-cols-[minmax(0,0.74fr)_minmax(21rem,0.36fr)] lg:content-start"
      aria-label="Trade loading"
      data-testid="trade-loading-state"
    >
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-outline-variant/40 bg-surface-high/35 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-on-surface">Wallet status</p>
              <span className="rounded-md bg-caution/10 px-2 py-1 text-xs font-semibold text-caution">
                Checking
              </span>
            </div>
            <p className="mt-3 font-mono text-xs text-outline">Checking wallet setup...</p>
            <div className="mt-3 grid grid-cols-3 gap-2" aria-hidden="true">
              <div className="h-16 animate-pulse rounded-md bg-surface-dim/70" />
              <div className="h-16 animate-pulse rounded-md bg-surface-dim/70" />
              <div className="h-16 animate-pulse rounded-md bg-surface-dim/70" />
            </div>
          </div>
          <div className="rounded-md border border-violet/30 bg-violet/[0.045] p-3 sm:p-4 md:col-span-2">
            <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Next required action</p>
            <h2 className="mt-1 text-lg font-semibold leading-tight text-on-surface sm:text-xl">
              Ask Master Mold while Trade opens.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
              Wallet, test-trade, and position controls are loading. No trade can run from this screen.
            </p>
            <CommandConsole
              className="mt-4"
              pageContext={tradeLoadingContext}
              suggestions={tradeLoadingSuggestions}
              placeholder="Ask Master Mold to check Trade..."
            />
          </div>
        </div>
        <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-on-surface">Portfolio and net worth chart</p>
              <div className="mt-3 h-4 w-64 max-w-full animate-pulse rounded bg-surface-highest/50" aria-hidden="true" />
            </div>
            <div className="h-8 w-28 animate-pulse rounded bg-surface-highest/60" aria-hidden="true" />
          </div>
          <div
            className="mt-4 h-28 animate-pulse rounded-md border border-outline-variant/30 bg-surface-dim/50 sm:h-48"
            aria-hidden="true"
          />
        </div>
      </div>
      <div className="hidden min-w-0 rounded-md border border-outline-variant/40 bg-surface-high/30 p-4 lg:block">
        <p className="text-lg font-semibold text-on-surface">Active positions and orders</p>
        <div className="mt-4 grid grid-cols-4 gap-3 border-b border-outline-variant/30 pb-2" aria-hidden="true">
          <div className="h-3 animate-pulse rounded bg-surface-highest/50" />
          <div className="h-3 animate-pulse rounded bg-surface-highest/50" />
          <div className="h-3 animate-pulse rounded bg-surface-highest/50" />
          <div className="h-3 animate-pulse rounded bg-surface-highest/50" />
        </div>
        <div className="mt-5 space-y-3" aria-hidden="true">
          <div className="h-14 animate-pulse rounded-md bg-surface-dim/70" />
          <div className="h-14 animate-pulse rounded-md bg-surface-dim/70" />
          <div className="h-14 animate-pulse rounded-md bg-surface-dim/70" />
        </div>
      </div>
    </section>
  );
}

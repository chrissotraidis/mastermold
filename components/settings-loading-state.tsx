import { CommandConsole, type CommandSuggestion } from "@/components/command-console";
import type { ChatPageContext } from "@/src/db/chat";

const settingsLoadingContext: ChatPageContext = {
  surface: "Settings",
  route: "/settings",
  summary:
    "The Settings page is loading. The user may want profile setup, portfolio connections, AI/chat keys, Web3 wallet setup, safety limits, or a setup check.",
};

const settingsLoadingSuggestions: CommandSuggestion[] = [
  { label: "Check setup", prompt: "Check setup." },
  { label: "Portfolio setup", prompt: "Open portfolio connections." },
  { label: "AI/chat keys", prompt: "Open AI/chat keys." },
  { label: "Web3 setup", prompt: "Open Web3 setup." },
  { label: "Safety limits", prompt: "Open safety limits." },
];

const setupSections = [
  {
    title: "Profile",
    detail: "Preferences and backup controls",
  },
  {
    title: "Portfolio connections",
    detail: "Manual holdings and read-only imports",
  },
  {
    title: "AI/chat keys",
    detail: "Optional live chat provider checks",
  },
  {
    title: "Web3 wallet and trading setup",
    detail: "Dedicated wallet, provider keys, and locked live money",
  },
  {
    title: "Safety limits",
    detail: "Caps, boundaries, and privacy rules",
  },
];

export function SettingsLoadingState() {
  return (
    <section
      className="grid min-h-[calc(100svh-10rem)] gap-4 pb-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.32fr)] lg:content-start"
      aria-label="Settings loading"
      data-testid="settings-loading-state"
    >
      <div className="min-w-0 rounded-md border border-violet/30 bg-violet/[0.045] p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Next setup action</p>
        <h2 className="mt-1 text-lg font-semibold leading-tight text-on-surface sm:text-xl">
          Ask Master Mold while Settings opens.
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
          Profile, connections, AI keys, Web3 setup, and safety limits are loading. No account import, live chat test, or trade can run unless you choose it.
        </p>
        <CommandConsole
          className="mt-4"
          pageContext={settingsLoadingContext}
          suggestions={settingsLoadingSuggestions}
          placeholder="Ask Master Mold to check setup..."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {setupSections.map((section) => (
          <div key={section.title} className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface">{section.title}</p>
                <p className="mt-1 text-xs leading-5 text-outline">{section.detail}</p>
              </div>
              <div className="h-6 w-14 shrink-0 animate-pulse rounded-md bg-surface-highest/45" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-4 sm:p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-on-surface">Setup sections</p>
            <p className="mt-1 text-sm leading-6 text-on-surface-variant">
              The controls will appear in simple sections, with technical details kept behind expanders.
            </p>
          </div>
          <div className="h-8 w-28 animate-pulse rounded bg-surface-highest/50" aria-hidden="true" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-hidden="true">
          <div className="h-20 animate-pulse rounded-md bg-surface-dim/65" />
          <div className="h-20 animate-pulse rounded-md bg-surface-dim/65" />
          <div className="h-20 animate-pulse rounded-md bg-surface-dim/65" />
        </div>
      </div>
    </section>
  );
}

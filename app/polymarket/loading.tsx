import { AppShell } from "@/components/app-shell";

export default function PolymarketLoading() {
  return (
    <AppShell dataMode="Live market read">
      <div className="mx-auto w-full max-w-6xl animate-pulse space-y-4" aria-label="Loading Polymarket">
        <div className="h-8 w-48 rounded bg-surface-high/50" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-lg border border-outline-variant/25 bg-surface-low/50" />)}
        </div>
        <div className="h-96 rounded-lg border border-outline-variant/25 bg-surface-low/50" />
      </div>
    </AppShell>
  );
}

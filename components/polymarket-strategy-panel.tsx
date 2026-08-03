import { ClipboardCheck, LockKeyhole } from "lucide-react";

import type { PolymarketStrategyCapability } from "@/src/polymarket/catalog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PolymarketStrategyPanel({
  contract,
  catalog,
}: {
  contract: {
    cadence_minutes: number;
    max_new_positions_per_cycle: number;
    default_stake_usd: number;
    filters: readonly string[];
    entry: string;
    exits: readonly string[];
    fill_model: string;
  };
  catalog: readonly PolymarketStrategyCapability[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.4fr)]">
      <Card className="border-engine/25 bg-engine/[0.035]">
        <CardHeader className="p-4 pb-2">
          <CardTitle as="h2" className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4 text-engine" /> What the bot trades now
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-1 text-xs leading-5 text-on-surface-variant">
          <p>
            <strong className="text-on-surface">No strategy currently has paper-entry authority.</strong> Momentum is a measured, promotion-gated shadow baseline; every other strategy is shadow, observation-only, missing, or unsupported.
          </p>
          <div className="rounded-md border border-outline-variant/25 bg-void/20 p-3">
            <p>{contract.entry}</p>
            <p className="mt-2 text-outline">
              ${contract.default_stake_usd} default · one new position per {contract.cadence_minutes}-minute cycle · exits at {contract.exits.join(", ")}.
            </p>
          </div>
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-outline">
            {contract.filters.map((filter) => <li key={filter}>{filter}</li>)}
          </ul>
          <p className="flex items-start gap-2 text-[11px] text-caution">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0" /> {contract.fill_model}
          </p>
        </CardContent>
      </Card>

      <Card className="border-outline-variant/30 bg-surface-low/70">
        <CardHeader className="p-4 pb-2">
          <CardTitle as="h2" className="text-base">PolySniper coverage</CardTitle>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">Reference intent compared with the code that actually exists in Master Mold.</p>
        </CardHeader>
        <CardContent className="grid gap-2 p-4 pt-2 md:grid-cols-2">
          {catalog.map((strategy) => (
            <div key={strategy.id} className="rounded-md border border-outline-variant/25 bg-void/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-on-surface">{strategy.name}</p>
                <AuthorityBadge authority={strategy.authority} />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-outline"><span className="text-on-surface-variant">PolySniper:</span> {strategy.reference_intent}</p>
              <p className="mt-1 text-[11px] leading-4 text-on-surface-variant"><span className="text-on-surface">Master Mold:</span> {strategy.master_mold_reality}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AuthorityBadge({ authority }: { authority: PolymarketStrategyCapability["authority"] }) {
  const label = authority === "paper" ? "Paper trades" : authority === "observe" ? "Observe only" : authority === "shadow" ? "Shadow only" : authority === "unsupported" ? "Unsupported" : "Not built";
  return (
    <Badge variant="outline" className={cn(
      authority === "paper" && "border-engine/35 text-engine",
      (authority === "shadow" || authority === "observe") && "border-violet/30 text-violet",
      authority === "missing" && "text-outline",
      authority === "unsupported" && "border-critical/35 text-critical",
    )}>
      {label}
    </Badge>
  );
}

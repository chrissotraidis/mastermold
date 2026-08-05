import { ClipboardCheck, LockKeyhole } from "lucide-react";

import type { PolymarketStrategyCapability } from "@/src/polymarket/catalog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PaperContract = {
  cadence_minutes: number;
  max_new_positions_per_cycle: number;
  default_stake_usd: number;
  filters: readonly string[];
  entry: string;
  exits: readonly string[];
  fill_model: string;
};

export function TradeContractCard({ contract }: { contract: PaperContract }) {
  return (
    <Card className="border-engine/25 bg-engine/[0.035]">
      <CardContent className="space-y-2 p-4 text-xs leading-5 text-on-surface-variant">
        <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <ClipboardCheck className="size-4 text-engine" /> What the bot trades now
        </p>
        <p>
          <strong className="text-on-surface">No strategy currently has paper-entry authority.</strong>{" "}
          Momentum is a measured, promotion-gated shadow baseline. {contract.entry}
        </p>
        <p className="text-outline">
          ${contract.default_stake_usd} default · one new position per {contract.cadence_minutes}-minute cycle · exits at {contract.exits.join(", ")}.
        </p>
        <details>
          <summary className="cursor-pointer text-[11px] font-semibold text-on-surface">
            Entry filters <span className="font-normal text-outline">({contract.filters.length}) · fill model</span>
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-outline">
            {contract.filters.map((filter) => <li key={filter}>{filter}</li>)}
          </ul>
          <p className="mt-2 flex items-start gap-2 text-[11px] text-caution">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0" /> {contract.fill_model}
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

export function PolySniperCoverage({ catalog }: { catalog: readonly PolymarketStrategyCapability[] }) {
  return (
    <div>
      <p className="mb-2 text-xs leading-5 text-on-surface-variant">
        <span className="font-semibold text-on-surface">PolySniper coverage.</span> Reference intent compared with the code that actually exists in Master Mold.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
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
      </div>
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

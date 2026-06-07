import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, CircleSlash2 } from "lucide-react";
import { ProvenanceChip } from "@/components/provenance-chip";
import { Chip, Panel } from "@/components/sentinel";
import type { BriefingCardJson } from "@/src/db/briefing";
import { cn } from "@/lib/utils";

export function DailyBriefingCard({ card }: { card: BriefingCardJson }) {
  const nothing = card.status === "nothing_actionable";
  const StatusIcon = nothing ? CircleSlash2 : CheckCircle2;
  const convictionTone =
    card.conviction >= 7 ? "text-engine" : card.conviction >= 4 ? "text-violet" : "text-on-surface-variant";

  return (
    <Link
      href={`/briefing/${card.id}`}
      aria-label={`Open thesis for ${card.headline}`}
      className="group block focus-visible:outline-none"
    >
      <Panel
        tint="advise"
        className="p-5 transition-all duration-200 group-hover:translate-y-[-2px] group-focus-visible:ring-2 group-focus-visible:ring-violet sm:p-6"
      >
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-stretch">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Chip tone="violet">Rank {card.rank}</Chip>
              <ProvenanceChip label={card.provenance.label} title={card.provenance.source} />
              <Chip tone={nothing ? "caution" : "engine"}>
                <StatusIcon aria-hidden="true" className="size-3" />
                {nothing ? "No action" : "Actionable"}
              </Chip>
            </div>

            <h3 className="font-display text-xl font-semibold leading-tight text-on-surface sm:text-2xl">
              {card.headline}
            </h3>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              <span className="font-mono text-[11px] uppercase tracking-telemetry text-violet">Why now</span>{" "}
              {card.why_now}
            </p>

            {card.bull_case || card.bear_case ? (
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <div className="border border-engine/20 bg-engine/[0.06] p-3 chamfer-sm">
                  <p className="font-mono text-[10px] uppercase tracking-telemetry text-engine">Bull</p>
                  <p className="mt-1 text-sm leading-5 text-on-surface-variant">{card.bull_case}</p>
                </div>
                <div className="border border-critical/20 bg-critical/[0.06] p-3 chamfer-sm">
                  <p className="font-mono text-[10px] uppercase tracking-telemetry text-critical">Bear</p>
                  <p className="mt-1 text-sm leading-5 text-on-surface-variant">{card.bear_case}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Chip tone="neutral">
                <CalendarClock aria-hidden="true" className="size-3" />
                {card.horizon}
              </Chip>
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-telemetry text-violet">
                Open thesis
                <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>

          {/* conviction readout */}
          <div className="flex shrink-0 flex-row items-center gap-3 border-t border-outline-variant/30 pt-4 md:w-32 md:flex-col md:items-end md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0">
            <div className="text-right">
              <p className={cn("font-display text-4xl font-bold tracking-tight", convictionTone)}>
                {card.conviction}
                <span className="text-lg text-outline">/10</span>
              </p>
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Conviction</p>
            </div>
            <div className="h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-surface-container md:mt-2">
              <div
                className={cn("h-full rounded-full", card.conviction >= 7 ? "bg-engine" : "bg-violet")}
                style={{ width: `${Math.min(card.conviction * 10, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </Panel>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, CircleSlash2 } from "lucide-react";
import { ProvenanceChip } from "@/components/provenance-chip";
import { SaveBriefingCallButton } from "@/components/save-briefing-call-button";
import { Chip, Panel } from "@/components/sentinel";
import type { ProductProvenanceLabel } from "@/lib/provenance-copy";
import { cn } from "@/lib/utils";
import { recordProductEvent } from "@/lib/product-metrics";

export type DailyBriefingCardProps = {
  id: string;
  rank: number;
  headline: string;
  relevance: string;
  confidence: number;
  horizon: string;
  nothing: boolean;
  provenance: {
    label: ProductProvenanceLabel;
    source: string;
  };
  sourceNotes?: string[];
};

export function DailyBriefingCard({
  id,
  rank,
  headline,
  relevance,
  confidence,
  horizon,
  nothing,
  provenance,
  sourceNotes = [],
}: DailyBriefingCardProps) {
  const StatusIcon = nothing ? CircleSlash2 : CheckCircle2;
  const confidenceTone =
    confidence >= 7 ? "text-engine" : confidence >= 4 ? "text-violet" : "text-on-surface-variant";

  const openMetrics = () =>
    recordProductEvent({
      event: "briefing_opened",
      surface: "today",
      entity_id: id,
      value: confidence,
      metadata: { rank, horizon, provenance: provenance.label },
    });

  return (
    <article>
      <Panel
        tint="advise"
        className="p-5 transition-all duration-200 hover:translate-y-[-2px] sm:p-6"
      >
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-stretch">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Chip tone="violet">Focus {rank}</Chip>
              <ProvenanceChip label={provenance.label} title={provenance.source} />
              <Chip tone={nothing ? "caution" : "engine"}>
                <StatusIcon aria-hidden="true" className="size-3" />
                {nothing ? "No action" : "Check this"}
              </Chip>
            </div>

            <Link
              href={`/briefing/${id}`}
              aria-label={`Open idea for ${headline}`}
              onClick={openMetrics}
              className="group/title flex min-h-11 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
            >
              <h3 className="font-display text-xl font-semibold leading-tight text-on-surface transition-colors group-hover/title:text-violet sm:text-2xl">
                {headline}
              </h3>
            </Link>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              <span className="font-mono text-[11px] uppercase tracking-telemetry text-violet">Why it matters</span>{" "}
              {relevance}
            </p>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              <span className="font-mono text-[11px] uppercase tracking-telemetry text-caution">What to do</span>{" "}
              {briefingNextStep({ confidence, nothing })}
            </p>
            {sourceNotes.length > 0 ? (
              <details className="mt-3 rounded-md border border-outline-variant/35 bg-surface-dim/35 px-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
                  Sources used for this read
                </summary>
                <ul className="space-y-2 pb-3 text-xs leading-5 text-on-surface-variant">
                  {sourceNotes.slice(0, 3).map((note) => (
                    <SourceNoteLine key={note} note={note} />
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Chip tone="neutral">
                <CalendarClock aria-hidden="true" className="size-3" />
                {horizon}
              </Chip>
              <Link
                href={`/briefing/${id}`}
                onClick={openMetrics}
                className="group/open ml-auto inline-flex min-h-11 items-center gap-1 rounded-md font-mono text-[11px] uppercase tracking-telemetry text-violet transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              >
                Open idea
                <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover/open:translate-x-0.5" />
              </Link>
            </div>

            {!nothing ? (
              <div className="mt-4 max-w-sm">
                <SaveBriefingCallButton
                  headline={headline}
                  reason={relevance}
                  confidence={confidence}
                  horizon={horizon}
                  source={provenance.label}
                  sourceNotes={sourceNotes}
                />
              </div>
            ) : null}
          </div>

          {/* Confidence readout */}
          <div className="flex shrink-0 flex-row items-center gap-3 border-t border-outline-variant/30 pt-4 md:w-32 md:flex-col md:items-end md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0">
            <div className="text-right">
              <p className={cn("font-display text-4xl font-bold tracking-tight", confidenceTone)}>
                {confidence}
                <span className="text-lg text-outline">/10</span>
              </p>
              <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">Confidence</p>
            </div>
            <div className="h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-surface-container md:mt-2">
              <div
                className={cn("h-full rounded-full", confidence >= 7 ? "bg-engine" : "bg-violet")}
                style={{ width: `${Math.min(confidence * 10, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </Panel>
    </article>
  );
}

function SourceNoteLine({ note }: { note: string }) {
  const [label, ...rest] = note.split(":");
  const body = rest.join(":").trim();

  if (!body) {
    return <li>{note}</li>;
  }

  return (
    <li>
      <span className="font-semibold text-on-surface">{label}:</span>{" "}
      <span>{body}</span>
    </li>
  );
}

function briefingNextStep({ confidence, nothing }: { confidence: number; nothing: boolean }) {
  if (nothing) {
    return "No action. Keep it on the watchlist unless the next saved read changes.";
  }

  if (confidence >= 7) {
    return "Review before changing exposure, then check the detail page for the bull and bear case.";
  }

  return "Watch first. Use Paper if you want to test the idea without real money.";
}

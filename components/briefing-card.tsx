import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, CircleSlash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProvenanceChip } from "@/components/provenance-chip";
import type { BriefingCardJson } from "@/src/db/briefing";
import { cn } from "@/lib/utils";

type DailyBriefingCardProps = {
  card: BriefingCardJson;
};

export function DailyBriefingCard({ card }: DailyBriefingCardProps) {
  const isNothingActionable = card.status === "nothing_actionable";
  const StatusIcon = isNothingActionable ? CircleSlash2 : CheckCircle2;

  return (
    <Link
      href={`/briefing/${card.id}`}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      aria-label={`Open briefing detail for ${card.headline}`}
    >
      <Card className="h-full border-white/10 bg-white/[0.035] transition duration-200 group-hover:-translate-y-0.5 group-hover:border-cyan-300/45 group-hover:bg-white/[0.055]">
        <CardHeader className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/15 bg-slate-950/60 text-slate-200">
              Rank {card.rank}
            </Badge>
            <ProvenanceChip label={card.provenance.label} title={card.provenance.source} />
            <Badge
              variant="outline"
              className={cn(
                "gap-1 border-white/15 bg-slate-950/60",
                isNothingActionable ? "text-amber-200" : "text-emerald-200",
              )}
            >
              <StatusIcon aria-hidden="true" className="size-3.5" />
              {isNothingActionable ? "Nothing actionable today" : "Actionable"}
            </Badge>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-xl leading-7 text-white sm:text-2xl">
              {card.headline}
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              <span className="font-semibold text-slate-100">Why now:</span> {card.why_now}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5 pt-0 text-sm leading-6 text-slate-300 sm:p-6 sm:pt-0">
          <p>
            <span className="font-semibold text-slate-100">Relevance:</span> {card.relevance_note}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-emerald-300/20 bg-emerald-300/5 p-3">
              <p className="text-xs font-semibold uppercase text-emerald-200">Bull case</p>
              <p className="mt-2">{card.bull_case}</p>
            </div>
            <div className="rounded-md border border-rose-300/20 bg-rose-300/5 p-3">
              <p className="text-xs font-semibold uppercase text-rose-200">Bear case</p>
              <p className="mt-2">{card.bear_case}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/15 bg-slate-950/60 text-slate-100">
              Conviction {card.conviction}/10
            </Badge>
            <Badge variant="outline" className="gap-1 border-white/15 bg-slate-950/60 text-slate-100">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              {card.horizon}
            </Badge>
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-cyan-200">
              Open detail
              <ArrowRight aria-hidden="true" className="size-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

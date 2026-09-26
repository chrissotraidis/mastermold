import * as React from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/ui/chart";

export type StatTone = "neutral" | "up" | "down" | "magenta" | "gold" | "caution";

const toneText: Record<StatTone, string> = {
  neutral: "text-on-surface-variant",
  up: "text-engine",
  down: "text-critical",
  magenta: "text-violet",
  gold: "text-gold-soft",
  caution: "text-caution",
};

/** Compact metric: label, big tabular value, optional delta and sparkline. */
export function StatTile({
  label,
  value,
  delta,
  deltaTone = "neutral",
  hint,
  trend,
  className,
  emphasis = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: StatTone;
  hint?: React.ReactNode;
  trend?: number[];
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={cn("mm-panel flex min-w-0 flex-col gap-2 p-4", emphasis && "border-violet/35", className)}>
      <p className="mm-eyebrow truncate">{label}</p>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <p
          className={cn(
            "mm-num min-w-0 truncate font-display font-semibold tracking-tight text-on-surface",
            emphasis ? "text-3xl" : "text-2xl",
          )}
        >
          {value}
        </p>
        {trend && trend.length > 1 ? (
          <Sparkline values={trend} tone={deltaTone === "down" ? "down" : deltaTone === "up" ? "up" : "magenta"} className="h-8 w-20 shrink-0" />
        ) : null}
      </div>
      {delta || hint ? (
        <p className="mm-num min-w-0 truncate text-xs">
          {delta ? <span className={cn("font-semibold", toneText[deltaTone])}>{delta}</span> : null}
          {delta && hint ? <span className="text-outline"> · </span> : null}
          {hint ? <span className="text-outline">{hint}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

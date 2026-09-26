import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { GetStartedProgress } from "@/src/db/get-started";
import { cn } from "@/lib/utils";

/** Numbered first-run checklist. Each step ticks itself off from local data. */
export function GetStartedChecklist({ progress, className }: { progress: GetStartedProgress; className?: string }) {
  const next = progress.steps.find((step) => !step.done);
  return (
    <section aria-labelledby="get-started-title" className={cn("mm-panel overflow-hidden border-violet/30", className)} data-testid="get-started">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <div>
          <p className="mm-eyebrow">Get started · {progress.doneCount} of {progress.steps.length} done</p>
          <h2 id="get-started-title" className="mt-1 font-display text-base font-semibold text-on-surface">
            Make Master Mold yours
          </h2>
        </div>
        <p className="text-xs text-outline">Until step 1 is done, every page shows sample data.</p>
      </div>
      <ol className="grid gap-2 p-3 sm:grid-cols-3">
        {progress.steps.map((step, index) => {
          const isNext = step.id === next?.id;
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  "group flex h-full min-h-11 flex-col gap-2 rounded-xl border p-4 transition",
                  step.done
                    ? "border-engine/25 bg-engine/[0.04]"
                    : isNext
                      ? "border-violet/50 bg-violet/[0.08] hover:border-violet"
                      : "border-outline-variant/50 hover:border-violet/50",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      step.done ? "bg-engine/20 text-engine" : isNext ? "bg-violet text-void" : "bg-surface-high text-outline",
                    )}
                  >
                    {step.done ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className={cn("text-sm font-semibold", step.done ? "text-on-surface-variant line-through decoration-outline/50" : "text-on-surface")}>
                    {step.title}
                  </span>
                  <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
                </span>
                <span className="text-xs leading-5 text-on-surface-variant">{step.detail}</span>
                {step.done ? null : (
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-violet group-hover:text-violet-soft">
                    {step.cta} <ArrowRight aria-hidden="true" className="size-3" />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}


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
        <p className="hidden text-xs text-outline sm:block">Until step 1 is done, every page shows sample data.</p>
      </div>
      <ol className="grid gap-2 p-3 sm:grid-cols-3">
        {progress.steps.map((step, index) => {
          const isNext = step.id === next?.id;
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  // Phones: one tappable row per step; the detail shows from sm up.
                  "group flex h-full min-h-12 items-center gap-2 rounded-xl border px-3 py-2.5 transition sm:flex-col sm:items-stretch sm:p-4",
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
                <span className="hidden text-xs leading-5 text-on-surface-variant sm:block">{step.detail}</span>
                {step.done ? null : (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-violet group-hover:text-violet-soft sm:ml-0 sm:mt-auto">
                    <span className="hidden sm:inline">{step.cta}</span> <ArrowRight aria-hidden="true" className="size-4 sm:size-3" />
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


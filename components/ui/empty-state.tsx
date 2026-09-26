import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/70 px-6 py-10 text-center", className)}>
      {Icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-violet/10 text-violet ring-1 ring-violet/25">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      ) : null}
      <div className="max-w-sm">
        <p className="font-display text-sm font-semibold text-on-surface">{title}</p>
        {description ? <p className="mt-1 text-sm leading-5 text-on-surface-variant">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

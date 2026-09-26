import * as React from "react";
import { cn } from "@/lib/utils";

/** A labelled page region: small eyebrow title, optional action, content. */
export function Section({
  title,
  action,
  children,
  className,
  id,
  titleId,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  titleId?: string;
}) {
  return (
    <section id={id} aria-labelledby={titleId} className={cn("scroll-mt-24", className)}>
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 id={titleId} className="mm-eyebrow">
          {title}
        </h2>
        {action ? <div className="flex items-center gap-2 text-xs">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

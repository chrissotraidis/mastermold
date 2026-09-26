import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one surface every page builds on. Glass panel, 1rem radius, hairline
 * border. `interactive` adds the magenta hover edge for clickable panels.
 */
export function Panel({
  className,
  interactive = false,
  as: Component = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & { interactive?: boolean; as?: "section" | "div" | "article" | "aside" }) {
  return <Component className={cn("mm-panel", interactive && "mm-panel-interactive", className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  eyebrow,
  action,
  className,
  titleId,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="mm-eyebrow mb-1">{eyebrow}</p> : null}
        <h2 id={titleId} className="font-display text-base font-semibold tracking-tight text-on-surface">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm leading-5 text-on-surface-variant">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

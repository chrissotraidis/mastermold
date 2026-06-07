import * as React from "react";
import { Eye, Brain, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MasterMold "Sentinel" component kit — chamfered armored panels, telemetry chips,
 * and the OBSERVE / ADVISE / ACT authority language, shared across every surface.
 */

export type AuthorityZone = "observe" | "advise" | "act";

const ZONE_TINT: Record<AuthorityZone, string> = {
  observe: "before:bg-[radial-gradient(ellipse_at_top,_rgba(149,142,160,0.10),transparent_60%)]",
  advise: "before:bg-[radial-gradient(ellipse_at_top,_rgba(208,188,255,0.12),transparent_60%)]",
  act: "before:bg-[radial-gradient(ellipse_at_top,_rgba(251,191,36,0.10),transparent_60%)]",
};

/** A chamfered, backlit armored panel — the structural unit of the interface. */
export function Panel({
  className,
  tint,
  glow = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tint?: AuthorityZone; glow?: boolean }) {
  return (
    <div
      className={cn(
        "relative isolate bg-panel chamfer overflow-hidden",
        glow ? "inner-glow-strong" : "inner-glow",
        tint && "before:absolute before:inset-0 before:-z-10 before:content-['']",
        tint && ZONE_TINT[tint],
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 brushed-metal opacity-[0.07]" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Standard panel header: icon + title (Space Grotesk) + optional right slot, underlined. */
export function PanelHeader({
  icon: Icon,
  title,
  iconClassName,
  right,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  iconClassName?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative z-10 mb-4 flex items-center justify-between gap-3 border-b border-outline-variant/40 pb-3",
        className,
      )}
    >
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-on-surface">
        {Icon ? <Icon aria-hidden="true" className={cn("size-5 text-violet", iconClassName)} /> : null}
        {title}
      </h3>
      {right}
    </div>
  );
}

/** Small mono telemetry chip. */
export function Chip({
  children,
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "violet" | "engine" | "demo" | "caution" | "critical";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-container text-on-surface-variant",
    violet: "bg-violet/15 text-violet",
    engine: "bg-engine/15 text-engine",
    demo: "bg-demo/15 text-demo",
    caution: "bg-caution/15 text-caution",
    critical: "bg-critical/15 text-critical",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-telemetry chamfer-sm",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

const ZONE_META: Record<AuthorityZone, { label: string; icon: LucideIcon; cls: string }> = {
  observe: { label: "Observe", icon: Eye, cls: "border-outline/40 text-outline" },
  advise: { label: "Advise", icon: Brain, cls: "border-violet/40 text-violet" },
  act: { label: "Act · Bounded", icon: Zap, cls: "border-caution/40 text-caution" },
};

/** Authority-zone badge: is this something MasterMold tells me, or can do? */
export function AuthorityBadge({ zone, className }: { zone: AuthorityZone; className?: string }) {
  const meta = ZONE_META[zone];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border bg-surface-dim/60 px-2.5 py-1 font-mono text-[11px] uppercase tracking-telemetry chamfer-sm",
        meta.cls,
        className,
      )}
      title={`Authority zone: ${meta.label}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {meta.label}
    </span>
  );
}

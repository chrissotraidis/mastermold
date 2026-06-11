"use client";

import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { openMasterMoldAlerts } from "@/components/alert-inbox-drawer";
import { cn } from "@/lib/utils";

export function OpenAlertsAction({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <button type="button" onClick={openMasterMoldAlerts} className={className}>
      {children}
    </button>
  );
}

export function AlertStatButton({
  label,
  value,
  detail,
  tone = "caution",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "violet" | "caution" | "critical" | "engine";
}) {
  const toneClass =
    tone === "critical"
      ? "text-critical"
      : tone === "engine"
        ? "text-engine"
        : tone === "violet"
          ? "text-violet"
          : "text-caution";

  return (
    <OpenAlertsAction className="group block w-full border border-outline-variant/40 bg-surface-high/30 p-3 text-left chamfer-sm transition-colors hover:border-violet/50 hover:bg-surface-high/55">
      <div className="flex items-center gap-2">
        <AlertTriangle className={cn("size-4", toneClass)} aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">{label}</p>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-on-surface">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-outline">{detail}</p>
    </OpenAlertsAction>
  );
}

export function AlertQueueButton({
  label,
  detail,
  active,
}: {
  label: string;
  detail: string;
  active: boolean;
}) {
  return (
    <OpenAlertsAction className="group flex w-full items-start gap-3 rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3 text-left transition-colors hover:border-violet/50 hover:bg-violet/10">
      <span
        className={cn("mt-1 size-2 shrink-0 rounded-full", active ? "bg-violet" : "bg-outline-variant")}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-on-surface">{label}</span>
        <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-outline">{detail}</span>
      </span>
      <ArrowRight className="ml-auto mt-0.5 size-4 shrink-0 text-outline transition-transform group-hover:translate-x-0.5 group-hover:text-violet" />
    </OpenAlertsAction>
  );
}

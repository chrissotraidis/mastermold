"use client";

import { cn } from "@/lib/utils";

export const fieldClass =
  "min-h-11 w-full rounded-xl border border-outline-variant/70 bg-surface-lowest/70 px-3 text-sm text-on-surface placeholder:text-outline focus:border-violet/60 focus:outline-none focus:ring-2 focus:ring-violet/20 sm:min-h-10";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      <span className="font-medium text-on-surface">{label}</span>
      {children}
      {hint ? <span className="text-xs text-outline">{hint}</span> : null}
    </label>
  );
}

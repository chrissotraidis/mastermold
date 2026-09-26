"use client";

import { cn } from "@/lib/utils";

/** Pill segmented control for switching views (allocation by class/account…). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full border border-outline-variant/70 bg-surface-lowest/70 p-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-9 rounded-full px-3 text-xs font-semibold transition-colors sm:min-h-8",
              active ? "bg-violet text-void shadow-glow" : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

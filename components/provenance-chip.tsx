import { Cpu, Database } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProvenanceLabel = "Engine output" | "Demo data";

/**
 * Honest provenance chip, sentinel-styled. "Engine output" (emerald, chip icon) means
 * the fact was computed by the engine; "Demo data" (cyan, database icon) means it came
 * from the seeded fallback. Deliberately distinct so a reviewer never confuses live for
 * demo. Mono/telemetry treatment signals "machine-level truth."
 */
export function ProvenanceChip({
  label,
  title,
  className,
}: {
  label: ProvenanceLabel;
  title?: string;
  className?: string;
}) {
  const isEngine = label === "Engine output";
  const Icon = isEngine ? Cpu : Database;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-telemetry chamfer-sm",
        isEngine
          ? "bg-engine/15 text-engine ring-1 ring-inset ring-engine/30"
          : "bg-demo/15 text-demo ring-1 ring-inset ring-demo/30",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}

import { Cpu, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ProvenanceLabel = "Engine output" | "Demo data";

/**
 * Honest provenance chip. "Engine output" (emerald + chip icon) means the fact was
 * computed by the TradingAgents engine; "Demo data" (cyan + database icon) means it
 * came from the seeded fallback. The two are deliberately visually distinct so a
 * reviewer can never confuse a live engine card for fabricated demo data.
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
    <Badge
      title={title}
      className={cn(
        "gap-1",
        isEngine
          ? "bg-emerald-300 text-slate-950 hover:bg-emerald-300"
          : "bg-cyan-300 text-slate-950 hover:bg-cyan-300",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </Badge>
  );
}

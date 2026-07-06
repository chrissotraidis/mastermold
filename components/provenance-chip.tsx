import { Activity, Database, Download, PencilLine, ScanSearch } from "lucide-react";
import type { ProductProvenanceLabel } from "@/lib/provenance-copy";
import { cn } from "@/lib/utils";

export type ProvenanceLabel =
  | "Engine output"
  | "Demo data"
  | "Saved scan"
  | ProductProvenanceLabel
  | "Manual portfolio"
  | "Imported portfolio";

/**
 * Honest provenance chip, sentinel-styled. The internal data labels stay precise,
 * while the visible copy uses product language: saved read, sample data, or manual portfolio.
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
  const isEngine = label === "Engine output" || label === "Saved scan" || label === "Saved read";
  const isLiveDex = label === "Live DEX read";
  const isManual = label === "Manual portfolio";
  const isImported = label === "Imported portfolio";
  const Icon = isEngine ? ScanSearch : isLiveDex ? Activity : isManual ? PencilLine : isImported ? Download : Database;
  const displayLabel = isEngine ? "Saved read" : isLiveDex ? "Live DEX read" : isManual ? "Manual portfolio" : isImported ? "Imported portfolio" : "Sample";
  const titleText = cleanProvenanceTitle(label, title);
  return (
    <span
      title={titleText}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-telemetry chamfer-sm",
        isEngine || isLiveDex
          ? "bg-engine/15 text-engine ring-1 ring-inset ring-engine/30"
          : isManual || isImported
            ? "bg-violet/15 text-violet ring-1 ring-inset ring-violet/30"
          : "bg-demo/15 text-demo ring-1 ring-inset ring-demo/30",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {displayLabel}
    </span>
  );
}

function cleanProvenanceTitle(label: ProvenanceLabel, title?: string) {
  if (label === "Engine output" || label === "Saved scan" || label === "Saved read") {
    return "Saved market read";
  }
  if (label === "Live DEX read") {
    return "Read-only public DEX market evidence";
  }
  if (label === "Demo data" || label === "Sample data") {
    return "Sample data for review and testing";
  }
  return title;
}

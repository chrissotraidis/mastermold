export type ProductProvenanceLabel =
  | "Saved read"
  | "Live DEX read"
  | "Sample data"
  | "Manual portfolio"
  | "Imported portfolio";

export function productProvenanceLabel(label: string): ProductProvenanceLabel {
  if (label === "Engine output" || label === "Saved scan" || label === "Saved read") return "Saved read";
  if (label === "Live DEX read") return "Live DEX read";
  if (label === "Manual portfolio") return "Manual portfolio";
  if (label === "Imported portfolio") return "Imported portfolio";
  return "Sample data";
}

export function productProvenanceSource(label: string, source?: string) {
  if (label === "Engine output" || label === "Saved scan" || label === "Saved read") return "Saved market read";
  if (label === "Live DEX read") return "Read-only public DEX market evidence";
  if (label === "Manual portfolio") return source || "Local manual entries";
  if (label === "Imported portfolio") return source || "Imported holdings snapshots plus local manual entries";
  return "Sample data for review and testing";
}

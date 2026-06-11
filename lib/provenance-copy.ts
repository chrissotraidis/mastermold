export type ProductProvenanceLabel =
  | "Saved read"
  | "Sample data"
  | "Manual portfolio"
  | "Imported portfolio";

export function productProvenanceLabel(label: string): ProductProvenanceLabel {
  if (label === "Engine output" || label === "Saved scan" || label === "Saved read") return "Saved read";
  if (label === "Manual portfolio") return "Manual portfolio";
  if (label === "Imported portfolio") return "Imported portfolio";
  return "Sample data";
}

export function productProvenanceSource(label: string, source?: string) {
  if (label === "Engine output" || label === "Saved scan" || label === "Saved read") return "Saved market read";
  if (label === "Manual portfolio") return source || "Local manual entries plus sample data";
  if (label === "Imported portfolio") return source || "Imported holdings snapshots plus local/sample data";
  return "Sample data for review and testing";
}

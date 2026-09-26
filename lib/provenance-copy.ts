export type ProductProvenanceLabel =
  | "Saved read"
  | "Live DEX read"
  | "Live market read"
  | "Sample data"
  | "Manual portfolio"
  | "Imported portfolio"
  | "Your entries";

export function productProvenanceLabel(label: string): ProductProvenanceLabel {
  if (label === "Engine output" || label === "Saved scan" || label === "Saved read") return "Saved read";
  if (label === "Live DEX read") return "Live DEX read";
  if (label === "Live market read") return "Live market read";
  if (label === "Manual portfolio") return "Manual portfolio";
  if (label === "Imported portfolio") return "Imported portfolio";
  if (label === "Manual journal" || label === "Your entries") return "Your entries";
  return "Sample data";
}

export function productProvenanceSource(label: string, source?: string) {
  if (label === "Engine output" || label === "Saved scan" || label === "Saved read") return "Saved market read";
  if (label === "Live DEX read") return "Read-only public DEX market evidence";
  if (label === "Live market read") return "Read-only public prediction-market evidence";
  if (label === "Manual portfolio") return source || "Local manual entries";
  if (label === "Imported portfolio") return source || "Imported holdings snapshots plus local manual entries";
  if (label === "Manual journal" || label === "Your entries") return source || "Calls you logged in this app";
  return "Sample data for review and testing";
}

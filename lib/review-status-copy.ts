function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "";
}

export function reviewResearchPathLabel(value: unknown, detail: Record<string, unknown>) {
  const adapter = textValue(value);
  const status = textValue(detail.status);
  const fallback = textValue(detail.fallback);

  if (adapter === "openrouter_direct" && fallback) return "Saved market summary";
  if (adapter === "quiet_no_agent_runs") return "Skipped because nothing needed attention";
  if (adapter === "tradingagents_graph") return "Market review";

  const fallbackText = adapter || status;
  if (!fallbackText) return "Saved read";

  return fallbackText
    .replace(/openrouter/gi, "saved model")
    .replace(/tradingagents/gi, "market review")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function reviewRunNoteCopy(reason: string) {
  if (/No module named 'yfinance'/.test(reason) || /ModuleNotFoundError/i.test(reason)) {
    return "One optional market check was unavailable locally, so this read used the saved local summary.";
  }

  if (/OpenRouter|fallback|module|dependency/i.test(reason)) {
    return "This read used the available local review path.";
  }

  return reason;
}

export function reviewScanActivityLabel(tickers: string[]) {
  if (tickers.length === 0) return "Quiet day";
  if (tickers.length === 1) return `${tickers[0]} worth checking`;
  if (tickers.length <= 3) return `${tickers.join(", ")} worth checking`;
  return `${tickers.length} items worth checking`;
}

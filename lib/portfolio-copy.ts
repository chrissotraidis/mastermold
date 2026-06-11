export function portfolioPageSubtitle() {
  return "Net worth, holdings, allocation, and sources. Manual entries make Today and chat use what you enter.";
}

export function portfolioConcentrationNote(symbol?: string | null) {
  return symbol ? `${symbol} is the biggest visible position` : "No visible position yet";
}

export function portfolioPageSubtitle() {
  return "Holdings, allocation, and source status for Today and chat.";
}

export function portfolioConcentrationNote(symbol?: string | null) {
  return symbol ? `${symbol} is the biggest visible position` : "No visible position yet";
}

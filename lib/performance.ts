/**
 * Investment performance for the Portfolio page: change over a chosen range of
 * the daily net-worth history, and total unrealized gain across holdings whose
 * cost basis is known. Pure functions so the page and tests share them.
 */

export type Range = "1M" | "3M" | "YTD" | "1Y" | "ALL";
export const RANGES: Range[] = ["1M", "3M", "YTD", "1Y", "ALL"];

type Point = { date: string; value: number };

function startOf(range: Range, today: string): string | null {
  if (range === "ALL") return null;
  if (range === "YTD") return `${today.slice(0, 4)}-01-01`;
  const d = new Date(`${today}T00:00:00Z`);
  if (range === "1M") d.setUTCMonth(d.getUTCMonth() - 1);
  if (range === "3M") d.setUTCMonth(d.getUTCMonth() - 3);
  if (range === "1Y") d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Points inside the range, plus the change from the first to the last point. */
export function historyRange(history: Point[], range: Range, today = new Date().toISOString().slice(0, 10)) {
  const start = startOf(range, today);
  const points = start ? history.filter((point) => point.date >= start) : history;
  if (points.length < 2) return { points, change: null as null | { value: number; pct: number | null } };
  const first = points[0].value;
  const value = round2(points[points.length - 1].value - first);
  return { points, change: { value, pct: first !== 0 ? Math.round((value / Math.abs(first)) * 1000) / 10 : null } };
}

/** Unrealized gain over holdings with a known cost basis; unknown ones are counted, never guessed. */
export function totalGain(holdings: Array<{ gain_value: number | null; cost_basis: number; cost_basis_known: boolean }>) {
  const known = holdings.filter((holding) => holding.cost_basis_known && holding.gain_value !== null);
  const gain = round2(known.reduce((sum, holding) => sum + (holding.gain_value ?? 0), 0));
  const basis = round2(known.reduce((sum, holding) => sum + holding.cost_basis, 0));
  return {
    gain,
    basis,
    pct: basis > 0 ? Math.round((gain / basis) * 1000) / 10 : null,
    known: known.length,
    unknown: holdings.length - known.length,
  };
}

import type { RehearsalRow } from "./store";

const MAX_RECENT_ROWS = 50;

/**
 * Return the recent, usable route gaps for one mint. Store reads are newest
 * first, but callers may pass fixtures or migrated rows in any order, so the
 * pure helper establishes its own ordering before applying the 50-row window.
 */
function recentQuotedCosts(rows: RehearsalRow[], mint: string): number[] {
  return rows
    .filter(
      (row) =>
        row.mint === mint &&
        row.status === "quoted" &&
        // A quoted paper fill followed by the same Jupiter quote is a
        // self-comparison (normally ~0), not measured slippage. Legacy rows
        // lack trustworthy provenance and are excluded for the same reason.
        row.reference_basis === "flat_fallback" &&
        row.live_cost_vs_paper_pct !== null &&
        Number.isFinite(row.live_cost_vs_paper_pct),
    )
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, MAX_RECENT_ROWS)
    .map((row) => row.live_cost_vs_paper_pct as number);
}

/** Median signed independent-route gap, in percent, over the latest 50 usable rows. */
export function medianRoundTripCostPct(
  rows: RehearsalRow[],
  mint: string,
  minSamples = 10,
): number | null {
  const values = recentQuotedCosts(rows, mint);
  if (values.length < minSamples) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Nearest-rank p95 signed independent-route gap, in percent, over the latest 50 rows. */
export function p95CostPct(
  rows: RehearsalRow[],
  mint: string,
  minSamples = 10,
): number | null {
  const values = recentQuotedCosts(rows, mint);
  if (values.length < minSamples) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
}

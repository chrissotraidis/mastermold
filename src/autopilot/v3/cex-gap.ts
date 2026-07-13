export type CexVenue = "coinbase" | "kraken";
export type CexGapDirection = "buy_dex_sell_cex" | "buy_cex_sell_dex";

export const TRANSFER_AMORTIZATION_BPS = 5;
export const DRIFT_ALLOWANCE_BPS = 5;
export const CEX_FEE_CONFIG: Record<CexVenue, { taker_fee_bps: number; verified_on: string; source: string }> = {
  coinbase: { taker_fee_bps: 60, verified_on: "2026-07-12", source: "https://help.coinbase.com/en/exchange/trading-and-funding/exchange-fees" },
  kraken: { taker_fee_bps: 80, verified_on: "2026-07-12", source: "https://www.kraken.com/features/fee-schedule" },
};

export type CexBook = { bid: number; ask: number };
export type CexGapObservation = {
  ts: string;
  symbol: string;
  venue: CexVenue;
  pair: string;
  direction: CexGapDirection;
  gap_bps: number;
  net_bps: number;
  jup_cost_bps: number;
  cex_mid: number;
  jup_eff: number;
  cex_taker_fee_bps: number;
  fee_verified_on: string;
};

export type CexGapWeeklyAggregate = {
  key: string;
  week: string;
  symbol: string;
  venue: CexVenue;
  observations: number;
  positive_count: number;
  over_25_count: number;
};

function round(value: number): number { return Math.round(value * 100) / 100; }

export function cexGapObservations(input: {
  ts: string; symbol: string; venue: CexVenue; pair: string; book: CexBook;
  jup_buy_eff: number; jup_sell_eff: number; jup_buy_cost_bps: number; jup_sell_cost_bps: number;
}): CexGapObservation[] {
  const values = [input.book.bid, input.book.ask, input.jup_buy_eff, input.jup_sell_eff, input.jup_buy_cost_bps, input.jup_sell_cost_bps];
  if (!values.every(Number.isFinite) || input.book.bid <= 0 || input.book.ask <= 0 || input.book.ask < input.book.bid || input.jup_buy_eff <= 0 || input.jup_sell_eff <= 0 || input.jup_buy_cost_bps < 0 || input.jup_sell_cost_bps < 0) return [];
  const fee = CEX_FEE_CONFIG[input.venue];
  const cexMid = (input.book.bid + input.book.ask) / 2;
  const rows: Array<{ direction: CexGapDirection; gap: number; eff: number; jupCost: number }> = [
    { direction: "buy_dex_sell_cex", gap: ((input.book.bid - input.jup_buy_eff) / input.jup_buy_eff) * 10_000, eff: input.jup_buy_eff, jupCost: input.jup_buy_cost_bps },
    { direction: "buy_cex_sell_dex", gap: ((input.jup_sell_eff - input.book.ask) / input.book.ask) * 10_000, eff: input.jup_sell_eff, jupCost: input.jup_sell_cost_bps },
  ];
  return rows.map((row) => ({
    ts: input.ts, symbol: input.symbol, venue: input.venue, pair: input.pair, direction: row.direction,
    gap_bps: round(row.gap), net_bps: round(row.gap - fee.taker_fee_bps - row.jupCost - TRANSFER_AMORTIZATION_BPS - DRIFT_ALLOWANCE_BPS), jup_cost_bps: round(row.jupCost),
    cex_mid: round(cexMid), jup_eff: round(row.eff), cex_taker_fee_bps: fee.taker_fee_bps, fee_verified_on: fee.verified_on,
  }));
}

export type CexGapGroupSummary = {
  symbol: string; venue: CexVenue; observations: number; positive_share: number;
  p95_net_bps: number | null; longest_positive_streak: number; weeks_observed: number;
  qualifying_weeks: string[]; graduated: boolean;
};
export type CexGapSummary = { groups: CexGapGroupSummary[]; graduated: boolean; cadence: "five_minute" | "monthly" | "graduated"; verdict: string };

export function mondayKey(ts: string): string | null {
  const value = Date.parse(ts); if (!Number.isFinite(value)) return null;
  const date = new Date(value); const day = date.getUTCDay();
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((day + 6) % 7));
  return new Date(monday).toISOString().slice(0, 10);
}

export function cexGapWeeklyKey(week: string, symbol: string, venue: CexVenue): string {
  return `${week}:${venue}:${symbol.trim().toUpperCase()}`;
}

export function aggregateCexGapWeeks(rows: CexGapObservation[]): CexGapWeeklyAggregate[] {
  const aggregates = new Map<string, CexGapWeeklyAggregate>();
  for (const row of rows) {
    const week = mondayKey(row.ts);
    if (!week) continue;
    const key = cexGapWeeklyKey(week, row.symbol, row.venue);
    const prior = aggregates.get(key) ?? {
      key, week, symbol: row.symbol, venue: row.venue,
      observations: 0, positive_count: 0, over_25_count: 0,
    };
    prior.observations += 1;
    if (row.net_bps > 0) prior.positive_count += 1;
    if (row.net_bps > 25) prior.over_25_count += 1;
    aggregates.set(key, prior);
  }
  return [...aggregates.values()].sort((a, b) => a.week.localeCompare(b.week) || a.key.localeCompare(b.key));
}
function consecutiveWeeks(keys: string[]): number {
  const sorted = [...new Set(keys)].sort(); let run = 0; let best = 0; let prior = -Infinity;
  for (const key of sorted) { const value = Date.parse(`${key}T00:00:00Z`); run = value - prior === 7 * 86_400_000 ? run + 1 : 1; best = Math.max(best, run); prior = value; }
  return best;
}
function nearestP95(values: number[]): number | null {
  if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
}

export function summarizeCexGaps(
  rows: CexGapObservation[],
  durableWeeks: CexGapWeeklyAggregate[] = aggregateCexGapWeeks(rows),
  nowMs: number = Date.now(),
): CexGapSummary {
  const rawGrouped = new Map<string, CexGapObservation[]>();
  for (const row of rows) rawGrouped.set(`${row.symbol}:${row.venue}`, [...(rawGrouped.get(`${row.symbol}:${row.venue}`) ?? []), row]);
  const weekGrouped = new Map<string, CexGapWeeklyAggregate[]>();
  for (const week of durableWeeks) weekGrouped.set(`${week.symbol}:${week.venue}`, [...(weekGrouped.get(`${week.symbol}:${week.venue}`) ?? []), week]);
  const groupKeys = new Set([...rawGrouped.keys(), ...weekGrouped.keys()]);
  const groups = [...groupKeys].map((groupKey): CexGapGroupSummary => {
    const items = rawGrouped.get(groupKey) ?? [];
    const ordered = [...items].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)); let run = 0; let longest = 0;
    for (const row of ordered) { run = row.net_bps > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
    const allWeeks = weekGrouped.get(groupKey) ?? [];
    const completedWeeks = allWeeks.filter((week) => {
      const start = Date.parse(`${week.week}T00:00:00Z`);
      return Number.isFinite(start) && start + 7 * 86_400_000 <= nowMs && week.observations > 0;
    });
    const observations = allWeeks.reduce((sum, week) => sum + week.observations, 0);
    const positives = allWeeks.reduce((sum, week) => sum + week.positive_count, 0);
    const qualifying = completedWeeks.filter((week) => week.over_25_count / week.observations >= 0.02).map((week) => week.week);
    const sample = ordered[0] ?? allWeeks[0];
    const [fallbackSymbol, fallbackVenue] = groupKey.split(":") as [string, CexVenue];
    return {
      symbol: sample?.symbol ?? fallbackSymbol, venue: sample?.venue ?? fallbackVenue, observations,
      positive_share: observations > 0 ? round(positives / observations) : 0,
      p95_net_bps: nearestP95(ordered.map((row) => row.net_bps)), longest_positive_streak: longest,
      weeks_observed: completedWeeks.length, qualifying_weeks: qualifying, graduated: consecutiveWeeks(qualifying) >= 3,
    };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol) || a.venue.localeCompare(b.venue));
  const graduated = groups.some((group) => group.graduated);
  const mature = groups.some((group) => group.weeks_observed >= 3);
  const cadence = graduated ? "graduated" as const : mature ? "monthly" as const : "five_minute" as const;
  const verdict = graduated ? "CEX execution research may proceed for the graduated symbol only; no account or order authority is granted." : mature ? "No sustained fee-adjusted edge after three observed weeks; archive and scout monthly." : "Collecting fee-adjusted DEX-CEX observations; fewer than three weeks are not a verdict.";
  return { groups, graduated, cadence, verdict };
}

export function describeCexGapSummary(summary: CexGapSummary): string {
  const rows = summary.groups.map((group) => `${group.symbol}/${group.venue}: n=${group.observations}, net>0 ${(group.positive_share * 100).toFixed(1)}%, p95=${group.p95_net_bps ?? "n/a"}bp, streak=${group.longest_positive_streak}, weeks=${group.weeks_observed}`).join("\n");
  return `CEX GAP SCOUT (${summary.cadence}):\n${rows || "no observations yet"}\nVERDICT: ${summary.verdict}`;
}

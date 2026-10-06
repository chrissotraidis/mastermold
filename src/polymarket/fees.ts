/**
 * Polymarket taker fees, from each market's own `feeSchedule`.
 *
 * Gamma's `takerBaseFee` is NOT a fee rate: every fee-enabled market carries
 * takerBaseFee=1000, including fee-free NFL markets (feeSchedule.rate = 0).
 * The documented fee is  shares × rate × (p × (1 − p))^exponent, charged to
 * takers only. See docs/research-2026-09/polymarket-market-structure.md.
 */

export type FeeSchedule = {
  /** Fee rate; null when the market says fees are on but gives no schedule. */
  rate: number | null;
  exponent: number;
  taker_only: boolean;
  rebate_rate: number;
  fee_type: string | null;
  known: boolean;
};

export const FEE_FREE: FeeSchedule = { rate: 0, exponent: 1, taker_only: true, rebate_rate: 0, fee_type: null, known: true };

export function parseFeeSchedule(raw: Record<string, unknown>): FeeSchedule {
  const feeType = typeof raw.feeType === "string" ? raw.feeType : null;
  let schedule = raw.feeSchedule as unknown;
  if (typeof schedule === "string") {
    try {
      schedule = JSON.parse(schedule);
    } catch {
      schedule = null;
    }
  }
  if (schedule && typeof schedule === "object") {
    const value = schedule as Record<string, unknown>;
    const rate = Number(value.rate);
    const exponent = Number(value.exponent);
    if (Number.isFinite(rate) && rate >= 0) {
      return {
        rate,
        exponent: Number.isFinite(exponent) && exponent > 0 ? exponent : 1,
        taker_only: value.takerOnly !== false,
        rebate_rate: Number.isFinite(Number(value.rebateRate)) ? Number(value.rebateRate) : 0,
        fee_type: feeType,
        known: true,
      };
    }
  }
  if (raw.feesEnabled === true) {
    // Fees are on but the schedule is missing: unknown, never assumed zero.
    return { rate: null, exponent: 1, taker_only: true, rebate_rate: 0, fee_type: feeType, known: false };
  }
  return { ...FEE_FREE, fee_type: feeType };
}

/** Taker fee in USD for buying `shares` at `price`. Null when unknown. */
export function takerFeeUsd(shares: number, price: number, schedule: Pick<FeeSchedule, "rate" | "exponent">): number | null {
  if (schedule.rate === null) return null;
  if (!(shares > 0) || !(price > 0) || !(price < 1)) return 0;
  const fee = shares * schedule.rate * Math.pow(price * (1 - price), schedule.exponent || 1);
  return Math.round(fee * 1e4) / 1e4;
}

/** True when a taker would pay something (or we can't tell). */
export function chargesTakerFee(schedule: Pick<FeeSchedule, "rate">): boolean {
  return schedule.rate === null || schedule.rate > 0;
}

/** Rate stored as integer basis points on the rate itself (0.05 → 500). */
export function feeRateBps(schedule: Pick<FeeSchedule, "rate">): number | null {
  return schedule.rate === null ? null : Math.round(schedule.rate * 10_000);
}

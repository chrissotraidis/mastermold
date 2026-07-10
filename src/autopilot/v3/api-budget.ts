/**
 * Monthly API request budget (2026-07-10): the SolanaTracker free tier caps
 * out at 2,500 requests/month. Discovery only refreshes twice a day (~60
 * calls/month) so headroom is wide today, but nothing should EVER assume that
 * stays true — a future module (per-token trader lookups, wallet PnL detail)
 * could add calls without anyone noticing the tier. This is a generic,
 * store-backed guard any paid-API caller can consume from: check before
 * calling, record after a successful call, and the state resets itself on
 * the first check of a new calendar month. Pure math; the daemon owns the
 * store read/write around it.
 */

export type ApiBudgetState = {
  /** "YYYY-MM" the counter applies to. */
  month_key: string;
  used: number;
};

export type ApiBudgetConfig = {
  service: string;
  monthly_limit: number;
  /** Stop making calls at this fraction of the limit — reserves headroom for
   * manual debugging instead of running the tier down to the last request. */
  soft_stop_fraction: number;
};

export const EMPTY_BUDGET_STATE: ApiBudgetState = { month_key: "", used: 0 };

/** SolanaTracker's stated free tier (per the operator, 2026-07-10). */
export const SOLANATRACKER_BUDGET: ApiBudgetConfig = {
  service: "solanatracker",
  monthly_limit: 2_500,
  soft_stop_fraction: 0.9,
};

/** The live config: defaults above, with SOLANATRACKER_MONTHLY_LIMIT from the
 * environment taking precedence when the account's actual plan differs. */
export function solanaTrackerBudget(
  env: Record<string, string | undefined> = process.env as unknown as Record<string, string | undefined>,
): ApiBudgetConfig {
  const raw = Number(env.SOLANATRACKER_MONTHLY_LIMIT);
  if (Number.isFinite(raw) && raw > 0) {
    return { ...SOLANATRACKER_BUDGET, monthly_limit: Math.floor(raw) };
  }
  return SOLANATRACKER_BUDGET;
}

export function currentMonthKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7); // "YYYY-MM"
}

/** Roll the counter over to a fresh month; identity otherwise. Pure. */
export function resetIfNewMonth(state: ApiBudgetState, nowMs: number): ApiBudgetState {
  const key = currentMonthKey(nowMs);
  return state.month_key === key ? state : { month_key: key, used: 0 };
}

export type BudgetCheck = {
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
  soft_limit: number;
  /** 0..1 (or above 1 if somehow over budget — the UI should treat >=1 as full). */
  fraction_used: number;
  reason?: string;
};

/** Pure: has this month's request room to make one more call right now? */
export function checkBudget(state: ApiBudgetState, config: ApiBudgetConfig, nowMs: number): BudgetCheck {
  const current = resetIfNewMonth(state, nowMs);
  const softLimit = Math.floor(config.monthly_limit * config.soft_stop_fraction);
  const remaining = Math.max(0, config.monthly_limit - current.used);
  const allowed = current.used < softLimit;
  return {
    allowed,
    used: current.used,
    remaining,
    limit: config.monthly_limit,
    soft_limit: softLimit,
    fraction_used: config.monthly_limit > 0 ? current.used / config.monthly_limit : 1,
    reason: allowed
      ? undefined
      : `${config.service}: ${current.used}/${config.monthly_limit} requests used this month (soft stop at ${softLimit}) — falling back to the keyless path until next month.`,
  };
}

/** Pure: record N successful calls against this month's counter. */
export function recordUsage(state: ApiBudgetState, nowMs: number, count = 1): ApiBudgetState {
  const current = resetIfNewMonth(state, nowMs);
  return { month_key: current.month_key, used: current.used + count };
}

/** Notification thresholds (fraction of monthly_limit) — cross once per month. */
export const BUDGET_ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const;

/** Pure: which alert threshold (if any) does `before -> after` newly cross? */
export function crossedAlertThreshold(beforeFraction: number, afterFraction: number): number | null {
  for (const threshold of BUDGET_ALERT_THRESHOLDS) {
    if (beforeFraction < threshold && afterFraction >= threshold) return threshold;
  }
  return null;
}

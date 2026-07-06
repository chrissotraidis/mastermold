/**
 * Strategy parameters as DATA (learning-loop plan, layer 2): the tunable
 * surface of the v2 strategy lives in the bot DB behind hard-coded clamps,
 * so the Analyst (and the operator) can adjust behavior between days while
 * the rails stay in code. The CONSTITUTION is deliberately absent here —
 * position-size caps, daily loss/spend limits, drawdown halt, reserve floor,
 * stops existing at all, the kill switch, and the go-live gate are not
 * parameters and can never be learned.
 *
 * Every change arrives as a typed changeset validated by `validateChangeset`
 * (pure): inside clamps, known keys only, and — for the Analyst — at most one
 * changeset per UTC day. The changelog records who/when/why/from→to so
 * attribution can reconstruct the exact values active at any past entry.
 */

export type StrategyParams = {
  /** Entry: established daily uptrend required (percent). */
  entry_min_h24_pct: number;
  /** Entry: but never a blow-off day (percent). */
  entry_max_h24_pct: number;
  /** Entry: hourly trend must agree (percent). */
  entry_min_h1_pct: number;
  /** Entry: short-window pullback band, lower bound (percent, negative). */
  entry_pullback_min_pct: number;
  /** Entry: short-window pullback band, upper bound (percent). */
  entry_pullback_max_pct: number;
  /** Screens on the deepest pair (USD). */
  min_volume_h24_usd: number;
  min_liquidity_usd: number;
  /** Stop scaling: clamp floor/cap (percent) and range multiplier. */
  min_stop_pct: number;
  max_stop_pct: number;
  stop_vol_mult: number;
  /** Take profit at this multiple of the stop (R). */
  take_profit_r: number;
  /** Target must be at least this multiple of round-trip cost. */
  min_edge_over_cost: number;
  /** Time stop: stale position + hourly trend down (ms). */
  time_stop_ms: number;
  /** Per-symbol cooldown after any exit (ms). */
  cooldown_ms: number;
  /** Entries per UTC day — frequency is EARNED via the Analyst, not configured. */
  max_trades_per_day: number;
  /** Consecutive losses that pause entries, and for how long (ms). */
  loss_streak_limit: number;
  loss_streak_pause_ms: number;
};

export type ParamKey = keyof StrategyParams;

/** The current v2 values (research doc 2026-07-03) — the changelog origin. */
export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  entry_min_h24_pct: 2.5,
  entry_max_h24_pct: 25,
  entry_min_h1_pct: 0,
  entry_pullback_min_pct: -1.2,
  entry_pullback_max_pct: 0.6,
  min_volume_h24_usd: 500_000,
  min_liquidity_usd: 250_000,
  min_stop_pct: 1.2,
  max_stop_pct: 3.0,
  stop_vol_mult: 2.0,
  take_profit_r: 2.0,
  min_edge_over_cost: 3.0,
  time_stop_ms: 4 * 60 * 60_000,
  cooldown_ms: 60 * 60_000,
  max_trades_per_day: 5,
  loss_streak_limit: 2,
  loss_streak_pause_ms: 2 * 60 * 60_000,
};

/** Hard rails. A proposal outside these is rejected no matter who made it. */
export const PARAM_CLAMPS: Record<ParamKey, { min: number; max: number }> = {
  entry_min_h24_pct: { min: 1, max: 8 },
  entry_max_h24_pct: { min: 10, max: 40 },
  entry_min_h1_pct: { min: -1, max: 2 },
  entry_pullback_min_pct: { min: -3, max: -0.3 },
  entry_pullback_max_pct: { min: 0, max: 1.5 },
  min_volume_h24_usd: { min: 100_000, max: 5_000_000 },
  min_liquidity_usd: { min: 100_000, max: 2_000_000 },
  min_stop_pct: { min: 0.8, max: 2 },
  max_stop_pct: { min: 2, max: 5 },
  stop_vol_mult: { min: 1.5, max: 3 },
  take_profit_r: { min: 1.5, max: 3 },
  min_edge_over_cost: { min: 2, max: 5 },
  time_stop_ms: { min: 60 * 60_000, max: 12 * 60 * 60_000 },
  cooldown_ms: { min: 15 * 60_000, max: 4 * 60 * 60_000 },
  max_trades_per_day: { min: 3, max: 10 },
  loss_streak_limit: { min: 2, max: 4 },
  loss_streak_pause_ms: { min: 60 * 60_000, max: 8 * 60 * 60_000 },
};

export type ParamChangeSource = "operator" | "analyst" | "revert";

export type ParamChangelogEntry = {
  id: string;
  ts: string;
  source: ParamChangeSource;
  reason: string;
  changes: Partial<Record<ParamKey, { from: number; to: number }>>;
};

export type Changeset = Partial<Record<ParamKey, number>>;

export type ChangesetVerdict = { ok: true } | { ok: false; error: string };

const INTEGER_KEYS = new Set<ParamKey>(["max_trades_per_day", "loss_streak_limit"]);

/**
 * Pure validation of a proposed changeset against the rails. `lastAnalystTs`
 * enforces the Analyst's one-changeset-per-UTC-day budget; operator and
 * revert changes are not day-limited.
 */
export function validateChangeset(
  changeset: Changeset,
  source: ParamChangeSource,
  options: { now_ms: number; last_analyst_change_ts: string | null },
): ChangesetVerdict {
  const keys = Object.keys(changeset) as ParamKey[];
  if (keys.length === 0) return { ok: false, error: "changeset is empty" };
  for (const key of keys) {
    const clamp = PARAM_CLAMPS[key];
    if (!clamp) return { ok: false, error: `unknown parameter "${key}"` };
    const value = changeset[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, error: `${key} must be a finite number` };
    }
    if (INTEGER_KEYS.has(key) && !Number.isInteger(value)) {
      return { ok: false, error: `${key} must be a whole number` };
    }
    if (value < clamp.min || value > clamp.max) {
      return { ok: false, error: `${key}=${value} is outside the [${clamp.min}, ${clamp.max}] rail` };
    }
  }
  // The pullback band must stay a band.
  const min = changeset.entry_pullback_min_pct;
  const max = changeset.entry_pullback_max_pct;
  if (min !== undefined && max !== undefined && min >= max) {
    return { ok: false, error: "pullback band is inverted" };
  }
  if (source === "analyst" && options.last_analyst_change_ts) {
    const lastDay = options.last_analyst_change_ts.slice(0, 10);
    const today = new Date(options.now_ms).toISOString().slice(0, 10);
    if (lastDay === today) {
      return { ok: false, error: "the Analyst already spent its one changeset today" };
    }
  }
  return { ok: true };
}

/** Merge stored values over defaults, clamping every field on the way in so a
 * hand-edited or corrupt DB can never smuggle a value past the rails. */
export function sanitizeParams(raw: unknown): StrategyParams {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const params = { ...DEFAULT_STRATEGY_PARAMS };
  for (const key of Object.keys(PARAM_CLAMPS) as ParamKey[]) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const { min, max } = PARAM_CLAMPS[key];
      params[key] = Math.min(max, Math.max(min, INTEGER_KEYS.has(key) ? Math.round(value) : value));
    }
  }
  if (params.entry_pullback_min_pct >= params.entry_pullback_max_pct) {
    params.entry_pullback_min_pct = DEFAULT_STRATEGY_PARAMS.entry_pullback_min_pct;
    params.entry_pullback_max_pct = DEFAULT_STRATEGY_PARAMS.entry_pullback_max_pct;
  }
  return params;
}

/**
 * Reconstruct the parameter values that were active at `atMs` by replaying
 * the changelog (oldest→newest) up to that moment — attribution's view of
 * "what the strategy believed when it entered."
 */
export function paramsAtTime(changelog: ParamChangelogEntry[], atMs: number): StrategyParams {
  const params = { ...DEFAULT_STRATEGY_PARAMS };
  const ordered = [...changelog].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  for (const entry of ordered) {
    if (Date.parse(entry.ts) > atMs) break;
    for (const key of Object.keys(entry.changes) as ParamKey[]) {
      const change = entry.changes[key];
      if (change) params[key] = change.to;
    }
  }
  return sanitizeParams(params);
}

/**
 * Autopilot control plane (slice C3 — PAPER ONLY).
 *
 * The only write authority the dashboard has over the bot DB: kill switch,
 * mode (off/paper), and hard caps. Everything here mutates bot control state
 * in `.data/autopilot.db.json` and nothing else — no execution, no signing,
 * no external calls. The paper daemon (a later slice) reads this state at the
 * top of every loop tick; flipping the kill switch here stops it without
 * touching the daemon process.
 *
 * Safety invariants encoded below:
 * - Kill ON always forces mode "halted".
 * - Releasing the kill switch sets mode "off" — the bot NEVER auto-resumes.
 * - Mode "paper" is refused while the kill switch is engaged.
 * - Caps must be positive, and max_trade_usd has a $1,000 hard bound.
 */

import { evaluateGoLiveGate } from "./gate";
import { liveReadiness } from "./live";
import {
  autopilotStore,
  type AutopilotCaps,
  type BotActivityRow,
  type BotStateRow,
} from "./store";

/** Hard bound: no cap edit can push a single paper trade above this. */
export const MAX_TRADE_USD_HARD_BOUND = 1000;

/** Heartbeat freshness: a tick within this window means the daemon is live. */
export const DAEMON_LIVE_WITHIN_MS = 90_000;
/** Older than live but within this window reads as stale (wedged or lagging). */
export const DAEMON_STALE_WITHIN_MS = 600_000;

export type DaemonStatus = "live" | "stale" | "offline";

export type AutopilotStateView = BotStateRow & {
  open_positions: number;
  equity_usd: number;
  last_activity: BotActivityRow | null;
  daemon: DaemonStatus;
};

/**
 * Pure heartbeat derivation: live if the last tick is under 90s old, stale
 * under 10 minutes, otherwise offline (never ticked, unparsable, or ancient).
 */
export function deriveDaemonStatus(lastTickAt: string | null, nowMs: number = Date.now()): DaemonStatus {
  if (!lastTickAt) return "offline";
  const tickMs = Date.parse(lastTickAt);
  if (!Number.isFinite(tickMs)) return "offline";
  const age = nowMs - tickMs;
  if (age < DAEMON_LIVE_WITHIN_MS) return "live";
  if (age < DAEMON_STALE_WITHIN_MS) return "stale";
  return "offline";
}

export type ControlResult =
  | { ok: true; state: AutopilotStateView }
  | { ok: false; error: string; state: AutopilotStateView };

/** Bot control row plus the derived numbers the status panel needs.
 * Read-only: derives daemon liveness from the heartbeat, never writes it. */
export function getAutopilotState(): AutopilotStateView {
  const store = autopilotStore();
  const series = store.equitySeries(1);
  const latestActivity = store.activity(1);
  const state = store.botState();
  return {
    ...state,
    open_positions: store.positions().length,
    equity_usd: series.length > 0 ? series[series.length - 1].equity_usd : 0,
    last_activity: latestActivity[0] ?? null,
    daemon: deriveDaemonStatus(state.last_tick_at),
  };
}

/**
 * Engage or release the kill switch.
 * ON also halts the bot; releasing returns mode to "off" (never auto-resumes).
 */
export function setKillSwitch(on: boolean): ControlResult {
  const store = autopilotStore();
  if (on) {
    store.updateBotState({ kill_switch: true, mode: "halted" });
  } else {
    store.updateBotState({ kill_switch: false, mode: "off", started_at: null });
  }
  return { ok: true, state: getAutopilotState() };
}

/**
 * Switch between "off", "paper", and "live". Arming is refused while the kill
 * switch is on, and "live" additionally requires every go-live gate check to
 * pass (autonomy ADR, D6) — the flip is evidence-gated, never a free toggle.
 */
export function setMode(mode: "off" | "paper" | "live"): ControlResult {
  const store = autopilotStore();
  const current = store.botState();

  if (mode !== "off" && current.kill_switch) {
    return {
      ok: false,
      error: "Kill switch is engaged. Release it first; the bot never resumes on its own.",
      state: getAutopilotState(),
    };
  }

  if (mode === "live") {
    const gate = evaluateGoLiveGate({
      trades: store.trades(1000),
      decisions: store.decisions(400),
      equity_series: store.equitySeries(2000),
      wallet_provisioned: liveReadiness().wallet_provisioned,
      now_ms: Date.now(),
    });
    if (!gate.ready) {
      const failing = gate.checks.filter((check) => !check.pass).map((check) => check.detail);
      return {
        ok: false,
        error: `Go-live gate is not open yet: ${failing.join("; ")}.`,
        state: getAutopilotState(),
      };
    }
    store.updateBotState({ mode: "live", started_at: new Date().toISOString() });
    store.appendActivity("mode", "LIVE mode armed: the go-live gate passed every check.");
  } else if (mode === "paper") {
    store.updateBotState({ mode: "paper", started_at: new Date().toISOString() });
  } else {
    store.updateBotState({ mode: "off", started_at: null });
  }
  return { ok: true, state: getAutopilotState() };
}

/** Update hard caps. All values must be positive; max_trade_usd is hard-bounded at $1,000. */
export function updateCaps(partial: Partial<AutopilotCaps>): ControlResult {
  const errors: string[] = [];
  const patch: Partial<AutopilotCaps> = {};
  const keys: Array<keyof AutopilotCaps> = [
    "max_trade_usd",
    "daily_loss_limit_usd",
    "daily_spend_limit_usd",
    "max_positions",
    "drawdown_halt_pct",
    "reserve_floor_sol",
  ];

  for (const key of keys) {
    const value = partial[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      errors.push(`${key} must be a positive number.`);
      continue;
    }
    if (key === "max_trade_usd" && value > MAX_TRADE_USD_HARD_BOUND) {
      errors.push(`max_trade_usd cannot exceed $${MAX_TRADE_USD_HARD_BOUND}.`);
      continue;
    }
    if (key === "max_positions" && !Number.isInteger(value)) {
      errors.push("max_positions must be a whole number.");
      continue;
    }
    patch[key] = value;
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join(" "), state: getAutopilotState() };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No cap values provided.", state: getAutopilotState() };
  }

  autopilotStore().updateBotState({ caps: patch });
  return { ok: true, state: getAutopilotState() };
}

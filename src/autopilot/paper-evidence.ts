import type { AutopilotStateView } from "./control";
import { DEFAULT_AUTOPILOT_CAPS, type AutopilotCaps } from "./store";

export type PaperEvidenceCounts = {
  price_history: number;
  candidate_snapshots: number;
  labeled_snapshots: number;
  cex_gap_observations: number;
  veto_watches: number;
  rehearsals: number;
  trades: number;
  open_positions: number;
};

export type PaperEvidenceLatest = {
  price_history: string | null;
  candidate_snapshot: string | null;
  cex_gap_observation: string | null;
};

export type PaperEvidenceInput = {
  now_ms: number;
  app_health_ok: boolean;
  state: AutopilotStateView;
  counts: PaperEvidenceCounts;
  latest: PaperEvidenceLatest;
  recent_error_count: number;
  recent_halt_count: number;
};

export type PaperEvidenceResult = {
  status: "ok" | "warning" | "fail";
  caps_match_defaults: boolean;
  failures: string[];
  warnings: string[];
};

const EVIDENCE_STALE_MS = 7 * 60_000;
const WARMING_GRACE_MS = 10 * 60_000;

function capsEqual(left: AutopilotCaps, right: AutopilotCaps): boolean {
  return left.max_trade_usd === right.max_trade_usd &&
    left.daily_loss_limit_usd === right.daily_loss_limit_usd &&
    left.daily_spend_limit_usd === right.daily_spend_limit_usd &&
    left.max_positions === right.max_positions &&
    left.drawdown_halt_pct === right.drawdown_halt_pct &&
    left.reserve_floor_sol === right.reserve_floor_sol;
}

function ageMs(ts: string | null, nowMs: number): number | null {
  if (!ts) return null;
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? nowMs - parsed : null;
}

/**
 * Pure, read-only verdict for the recurring paper monitor. It treats an
 * unexpected live mode, cap drift, a dead daemon, or stalled paper evidence as
 * failures. A deliberate kill/halt is safe and therefore a warning, never an
 * excuse to auto-resume.
 */
export function evaluatePaperEvidence(input: PaperEvidenceInput): PaperEvidenceResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const capsMatch = capsEqual(input.state.caps, DEFAULT_AUTOPILOT_CAPS);

  if (!input.app_health_ok) failures.push("/api/health is unavailable or unhealthy");
  if (input.state.mode === "live") failures.push("unexpected live mode — this monitor authorizes paper only");
  if (!capsMatch) failures.push("autopilot caps differ from the frozen defaults");
  if (input.state.daemon !== "live") failures.push(`daemon heartbeat is ${input.state.daemon}`);
  if (input.recent_error_count > 0) failures.push(`${input.recent_error_count} runtime error row(s) in the last hour`);

  if (input.state.kill_switch) warnings.push("kill switch is engaged; never auto-resume");
  if (input.state.mode !== "paper" && input.state.mode !== "live") warnings.push(`paper collection is not armed (mode=${input.state.mode})`);
  if (input.recent_halt_count > 0) warnings.push(`${input.recent_halt_count} risk halt row(s) in the last hour`);

  if (input.state.mode === "paper") {
    const startedMs = input.state.started_at ? Date.parse(input.state.started_at) : Number.NaN;
    const warming = Number.isFinite(startedMs) && input.now_ms - startedMs < WARMING_GRACE_MS;
    for (const [label, ts] of Object.entries(input.latest)) {
      const age = ageMs(ts, input.now_ms);
      if (age === null) {
        (warming ? warnings : failures).push(`${label} has no persisted row${warming ? " during warm-up" : ""}`);
      } else if (age > EVIDENCE_STALE_MS) {
        failures.push(`${label} is stale by ${Math.round(age / 1000)}s`);
      }
    }
  }

  return {
    status: failures.length ? "fail" : warnings.length ? "warning" : "ok",
    caps_match_defaults: capsMatch,
    failures,
    warnings,
  };
}

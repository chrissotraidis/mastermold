/**
 * Read-only paper-runtime monitor. It inspects the local API and durable store,
 * prints one machine-readable report, and exits non-zero on a real health or
 * safety invariant failure. It has no mutation imports or control actions.
 */

import { getAutopilotState } from "../src/autopilot/control";
import { lossStreak, realizedRoundTrips } from "../src/autopilot/daemon";
import { evaluatePaperEvidence } from "../src/autopilot/paper-evidence";
import { autopilotStore } from "../src/autopilot/store";

const baseArg = process.argv.find((arg) => arg.startsWith("--base-url="));
const baseUrl = (baseArg?.slice("--base-url=".length) || "http://127.0.0.1:4002").replace(/\/$/, "");
const nowMs = Date.now();
const oneHourAgo = nowMs - 60 * 60_000;

async function healthOk(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return false;
    const body = await response.json() as { status?: unknown };
    return body.status === "ok";
  } catch {
    return false;
  }
}

function latestTs<T extends { ts: string }>(rows: T[]): string | null {
  if (!rows.length) return null;
  return rows.reduce((latest, row) => Date.parse(row.ts) > Date.parse(latest) ? row.ts : latest, rows[0].ts);
}

async function main(): Promise<void> {
  const store = autopilotStore();
  const state = getAutopilotState();
  const prices = store.priceHistory();
  const snapshots = store.candidateSnapshots(2_000);
  const cexRows = store.cexGapObservations(20_000);
  const vetoes = store.vetoWatches();
  const rehearsals = store.rehearsals();
  const trades = store.trades(10_000);
  const chronologicalTrades = [...trades].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const roundTrips = realizedRoundTrips(chronologicalTrades);
  const streak = lossStreak(roundTrips);
  const params = store.strategyParams();
  const pauseUntil = streak.streak >= params.loss_streak_limit && streak.last_loss_ms !== null
    ? new Date(streak.last_loss_ms + params.loss_streak_pause_ms).toISOString()
    : null;
  const activity = store.activity(500).filter((row) => Date.parse(row.ts) >= oneHourAgo);
  const recentErrors = activity.filter((row) => ["error", "execution-error", "daemon-error"].includes(row.kind));
  const recentHalts = activity.filter((row) => row.kind === "halt");

  const counts = {
    price_history: prices.length,
    candidate_snapshots: snapshots.length,
    labeled_snapshots: snapshots.filter((row) => row.labeled).length,
    cex_gap_observations: cexRows.length,
    veto_watches: vetoes.length,
    rehearsals: rehearsals.length,
    trades: trades.length,
    open_positions: store.positions().length,
  };
  const latest = {
    price_history: latestTs(prices),
    candidate_snapshot: latestTs(snapshots),
    cex_gap_observation: latestTs(cexRows),
  };
  const result = evaluatePaperEvidence({
    now_ms: nowMs,
    app_health_ok: await healthOk(),
    state,
    counts,
    latest,
    recent_error_count: recentErrors.length,
    recent_halt_count: recentHalts.length,
  });

  console.log(JSON.stringify({
    checked_at: new Date(nowMs).toISOString(),
    status: result.status,
    state: {
      mode: state.mode,
      kill_switch: state.kill_switch,
      daemon: state.daemon,
      last_tick_at: state.last_tick_at,
      started_at: state.started_at,
    },
    safety: {
      caps_match_defaults: result.caps_match_defaults,
      caps: state.caps,
    },
    evidence: {
      counts,
      latest,
      outcomes: {
        round_trips: roundTrips.length,
        wins: roundTrips.filter((row) => row.net_usd > 0).length,
        losses: roundTrips.filter((row) => row.net_usd < 0).length,
        realized_pnl_usd: Math.round(roundTrips.reduce((sum, row) => sum + row.net_usd, 0) * 10_000) / 10_000,
        consecutive_losses: streak.streak,
        last_loss_at: streak.last_loss_ms === null ? null : new Date(streak.last_loss_ms).toISOString(),
        entry_pause_until: pauseUntil,
      },
    },
    recent: {
      errors: recentErrors.map(({ ts, kind, message }) => ({ ts, kind, message })),
      halts: recentHalts.map(({ ts, kind, message }) => ({ ts, kind, message })),
    },
    failures: result.failures,
    warnings: result.warnings,
  }, null, 2));

  if (result.status === "fail") process.exitCode = 1;
}

void main();

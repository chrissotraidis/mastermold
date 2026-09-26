/**
 * W1 (docs/research-2026-09/solana-web3-bots.md): score cusum_tb on the
 * outcome it actually trades — a 24h triple barrier — net of modeled cost.
 * Its earlier +61bp was a 2h pre-cost number on 63 labels.
 */
import type { CandidateSnapshotRow, PriceObservation } from "./candidate-store";

const DAY_MS = 24 * 60 * 60_000;

/** Pre-registered 2026-09-26. */
export const CUSUM_GATE = { min_labels: 150, min_net_mean_bps: 20, bootstrap_draws: 1000 } as const;

/**
 * Directional first-touch outcome in bps. Long ("up") wins on +barrier;
 * short ("down") wins when price falls by the barrier. Null when the window
 * has not been observed far enough to decide.
 */
export function barrierOutcomeBps(
  snapshotPrice: number,
  series: PriceObservation[],
  snapshotTs: number,
  barrierBps: number,
  direction: "up" | "down",
  horizonMs = DAY_MS,
): number | null {
  if (!(snapshotPrice > 0) || !(barrierBps > 0)) return null;
  const sign = direction === "down" ? -1 : 1;
  const end = snapshotTs + horizonMs;
  let last: PriceObservation | null = null;
  for (const observation of [...series].sort((a, b) => a.ts - b.ts)) {
    if (observation.ts <= snapshotTs) continue;
    if (observation.ts > end) {
      return last ? round2(sign * bps(snapshotPrice, last.price)) : null;
    }
    const move = sign * bps(snapshotPrice, observation.price);
    if (move >= barrierBps) return barrierBps;
    if (move <= -barrierBps) return -barrierBps;
    last = observation;
  }
  return null; // window not complete yet and no touch
}

/** Write barrier outcomes for cusum_tb rows old enough to have a full window. */
export function labelDueBarrierOutcomes(
  store: { cusumSnapshotsAwaitingBarrier(ageMs: number, nowMs?: number): CandidateSnapshotRow[]; setBarrierOutcome(id: string, value: number | null): void },
  priceSeriesByMint: Map<string, PriceObservation[]>,
  nowMs = Date.now(),
): number {
  let written = 0;
  for (const row of store.cusumSnapshotsAwaitingBarrier(DAY_MS, nowMs)) {
    const barrier = Number(row.features.barrier_bps);
    const direction = row.features.direction === "down" ? "down" : "up";
    const outcome = barrierOutcomeBps(row.price_usd_at_snapshot, priceSeriesByMint.get(row.token_mint) ?? [], Date.parse(row.ts), barrier, direction);
    if (outcome !== null) {
      store.setBarrierOutcome(row.id, outcome);
      written += 1;
    } else if (nowMs - Date.parse(row.ts) > 7 * DAY_MS) {
      // Price history no longer covers the window; record "unknown" so it stops retrying.
      store.setBarrierOutcome(row.id, null);
    }
  }
  return written;
}

export type CusumGateResult = {
  status: "insufficient" | "pass" | "fail";
  labels: number;
  net_mean_bps: number | null;
  net_lower_90_bps: number | null;
  clusters: number;
  detail: string;
};

/** Net barrier outcome, clustered by day and mint, against the pre-registered gate. */
export function evaluateCusumGate(rows: CandidateSnapshotRow[], draws: number = CUSUM_GATE.bootstrap_draws): CusumGateResult {
  const scored = rows.filter(
    (row) => row.strategy_id === "cusum_tb" && row.decision === "enter" && typeof row.barrier_24h_bps === "number" && row.features.venue !== "drift_perp",
  );
  const byCluster = new Map<string, number[]>();
  for (const row of scored) {
    const key = `${row.ts.slice(0, 10)}:${row.token_mint}`;
    byCluster.set(key, [...(byCluster.get(key) ?? []), (row.barrier_24h_bps as number) - row.cost_total_bps]);
  }
  const clusters = [...byCluster.values()].map((values) => values.reduce((sum, value) => sum + value, 0) / values.length);
  const mean = clusters.length ? clusters.reduce((sum, value) => sum + value, 0) / clusters.length : null;
  let lower: number | null = null;
  if (clusters.length >= 2) {
    let seed = 2_468_013;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const samples: number[] = [];
    for (let draw = 0; draw < draws; draw += 1) {
      let total = 0;
      for (let index = 0; index < clusters.length; index += 1) total += clusters[Math.floor(random() * clusters.length)];
      samples.push(total / clusters.length);
    }
    samples.sort((a, b) => a - b);
    lower = samples[Math.floor(draws * 0.05)];
  }
  const status: CusumGateResult["status"] =
    scored.length < CUSUM_GATE.min_labels
      ? "insufficient"
      : mean !== null && mean > CUSUM_GATE.min_net_mean_bps && lower !== null && lower > 0
        ? "pass"
        : "fail";
  return {
    status,
    labels: scored.length,
    net_mean_bps: mean === null ? null : round2(mean),
    net_lower_90_bps: lower === null ? null : round2(lower),
    clusters: clusters.length,
    detail:
      status === "insufficient"
        ? `${scored.length}/${CUSUM_GATE.min_labels} would-enter events scored on the 24h barrier after cost.`
        : status === "pass"
          ? "Net 24h barrier outcome clears +20bp with a 90% lower bound above zero."
          : "Net 24h barrier outcome does not clear the pre-registered bar; the 2h pre-cost edge did not survive.",
  };
}

function bps(from: number, to: number) {
  return ((to - from) / from) * 10_000;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

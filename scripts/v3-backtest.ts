/**
 * V3 walk-forward backtest REPORT over the real candidate dataset. Run with
 * `npm run v3:backtest`.
 *
 * Loads the shadow's accumulated candidate snapshots from the autopilot store
 * and asks the one question that matters (plan §P5, report discipline: naive
 * strategies collapse once transaction costs are imposed): does the score the
 * router recorded AT DECISION TIME show positive out-of-sample net expectancy
 * at each forward horizon, with entry floors calibrated only on the past and
 * each row charged its own modeled round-trip execution cost?
 *
 * This is a report, not a gate: it always exits 0. A young/unlabeled dataset
 * is reported honestly, not treated as an error.
 */

import { autopilotStore } from "../src/autopilot/store";
import {
  storedScore,
  walkForward,
  type BacktestHorizon,
  type FoldResult,
} from "../src/autopilot/v3/backtest";
import { XSEC_SCORE_FLOOR } from "../src/autopilot/v3/xsec";

const HORIZONS: BacktestHorizon[] = ["30m", "2h", "6h"];
const RETURN_KEY = { "30m": "return_30m_bps", "2h": "return_2h_bps", "6h": "return_6h_bps" } as const;
const FOLDS = 5;

const num = (x: number): string => (x === Infinity ? "inf" : x.toFixed(2));

function printFoldTable(folds: FoldResult[]): void {
  const header = ["fold", "train_n", "test_n", "trades", "mean_net_bps", "hit_rate", "profit_factor", "total_net_bps"];
  const rows = folds.map((f) => [
    String(f.fold),
    String(f.train_n),
    String(f.test_n),
    String(f.trades),
    num(f.mean_net_bps),
    f.hit_rate.toFixed(3),
    num(f.profit_factor),
    num(f.total_net_bps),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padStart(widths[i])).join("  ");
  console.log(`  ${line(header)}`);
  for (const r of rows) console.log(`  ${line(r)}`);
}

function main(): void {
  const rows = autopilotStore().candidateSnapshots(2000);
  const labeled = rows.filter((r) => r.labeled);
  console.log("V3 walk-forward backtest — stored decision-time score, per-row round-trip cost");
  console.log(`dataset: ${rows.length} candidate snapshots, ${labeled.length} labeled`);

  if (labeled.length === 0) {
    console.log("0 labeled snapshots — nothing to validate yet; the shadow is still collecting.");
    return;
  }

  for (const horizon of HORIZONS) {
    const usable = labeled.filter((r) => r[RETURN_KEY[horizon]] !== null).length;
    console.log(`\n=== horizon ${horizon} (${usable} labeled returns, ${FOLDS} folds, cost = each row's own cost_total_bps) ===`);
    if (usable === 0) {
      console.log("  no labeled returns at this horizon yet — the shadow is still collecting.");
      continue;
    }
    const report = walkForward(rows, storedScore, {
      entry_score_floor: XSEC_SCORE_FLOOR,
      cost_total_bps: null, // per-row modeled cost — the honest number
      horizon,
      folds: FOLDS,
    });
    printFoldTable(report.folds);
    const o = report.overall;
    console.log(
      `  overall: trades=${o.trades} mean_net_bps=${num(o.mean_net_bps)} hit_rate=${o.hit_rate.toFixed(3)} profit_factor=${num(o.profit_factor)}`,
    );
    console.log(`  verdict: ${report.verdict}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`v3-backtest report failed: ${error instanceof Error ? error.message : String(error)}`);
}
process.exit(0);

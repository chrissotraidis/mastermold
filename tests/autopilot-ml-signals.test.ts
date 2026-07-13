import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cusumTbCandidate, type CusumTbInput } from "../src/autopilot/v3/cusum-tb";
import {
  appendMlEventRequest,
  cusumShadowHistoryEligible,
  freshMlSignal,
  loadMlSignalState,
  mlConfidence,
  mlSignalsDegraded,
  parseMlSignals,
  resolveMlEvent,
  type FreshMlSignal,
} from "../src/autopilot/v3/ml-signals";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 12, 12);
const EVENT = NOW - 5_000;
const cost = { dex_fee_bps: 1, price_impact_bps: 1, spread_bps: 1, slippage_bps: 1, priority_fee_bps: 1, failed_tx_bps: 1, total_bps: 6 };

function signal(pUp: number, overrides: Partial<FreshMlSignal> = {}): FreshMlSignal {
  return {
    status: "fresh", mint: "mint", event_ts: EVENT, p_up: pUp, model_id: "model-1",
    trained_through: new Date(NOW - DAY).toISOString(), scored_at: new Date(NOW - 10_000).toISOString(), ...overrides,
  };
}

function input(direction: "up" | "down", ml: FreshMlSignal | null, held = false): CusumTbInput {
  return {
    symbol: "SOL", mint: "mint", price_usd: 100, event: { direction, magnitude: .02, ts_ms: EVENT },
    h_pct: 2, held, h1_pct: 1, h24_pct: 5, liquidity_usd: 10_000_000, volume_h24_usd: 20_000_000,
    sigma_daily_pct: 4, edge_ratio: .15, ml,
    perp: direction === "down" ? { market: "SOL-PERP", funding_rate_8h_pct: 0 } : null,
  };
}

describe("ML file contract and activation gate", () => {
  test("appends exact daemon event keys without adding decision fields", () => {
    const dir=mkdtempSync(join(tmpdir(),"mm-ml-events-")); const path=join(dir,"events.jsonl");
    expect(appendMlEventRequest({ mint:"mint",event_ts:EVENT },path)).toBe(true);
    expect(JSON.parse(readFileSync(path,"utf8"))).toEqual({ mint:"mint",event_ts:EVENT });
    expect(appendMlEventRequest({ mint:"",event_ts:EVENT },path)).toBe(false);
  });
  test("parses append-only rows defensively and newest exact event key wins", () => {
    const rows = parseMlSignals([
      JSON.stringify(signal(.61)),
      "not-json",
      JSON.stringify({ ...signal(.72), extra: true }),
      JSON.stringify({ ...signal(2), event_ts: EVENT + 1 }),
    ].join("\n"));
    expect(rows.size).toBe(1);
    expect(rows.get(`mint:${EVENT}`)?.p_up).toBe(.72);
  });

  test("requires 28 days of independent cusum_tb shadow evidence", () => {
    const row = (strategy_id: string, ago: number) => ({ strategy_id, ts: new Date(NOW - ago).toISOString() });
    expect(cusumShadowHistoryEligible([row("cusum_tb", 27 * DAY), row("cusum_tb", 0)], NOW)).toBe(false);
    expect(cusumShadowHistoryEligible([row("xsec", 40 * DAY), row("cusum_tb", 28 * DAY), row("cusum_tb", 0)], NOW)).toBe(true);
  });

  test("loads only explicitly approved, fresh, exact-event signals", () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-ml-"));
    const signalsPath = join(dir, "signals.jsonl"); const approvalPath = join(dir, "APPROVED_MODEL"); const resultPath = join(dir, "training-result.json");
    writeFileSync(signalsPath, JSON.stringify(signal(.75)) + "\n"); writeFileSync(approvalPath, "model-1\n");
    writeFileSync(resultPath, JSON.stringify({ model_id: "model-1", fixture: false, data_compliant: true, criterion_passed: true }));
    const state = loadMlSignalState({
      snapshots: [
        { strategy_id: "cusum_tb", ts: new Date(NOW - 29 * DAY).toISOString() },
        { strategy_id: "cusum_tb", ts: new Date(NOW).toISOString() },
      ],
      now_ms: NOW, signals_path: signalsPath, approval_path: approvalPath, training_result_path: resultPath,
    });
    expect(freshMlSignal(state, "mint", EVENT, NOW)?.p_up).toBe(.75);
    expect(freshMlSignal(state, "mint", EVENT + 1, NOW)).toBeNull();
    expect(freshMlSignal({ ...state, approved_model_id: "other" }, "mint", EVENT, NOW)).toBeNull();
    expect(freshMlSignal({ ...state, history_eligible: false }, "mint", EVENT, NOW)).toBeNull();
  });

  test("operator approval cannot activate a fixture, rejected, noncompliant, or mismatched result", () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-ml-result-")); const signalsPath=join(dir,"signals.jsonl"); const approvalPath=join(dir,"APPROVED_MODEL"); const resultPath=join(dir,"training-result.json");
    writeFileSync(signalsPath,JSON.stringify(signal(.75))+"\n"); writeFileSync(approvalPath,"model-1\n");
    const snapshots=[{ strategy_id:"cusum_tb",ts:new Date(NOW-29*DAY).toISOString() },{ strategy_id:"cusum_tb",ts:new Date(NOW).toISOString() }];
    for (const result of [
      { model_id:"model-1",fixture:true,data_compliant:true,criterion_passed:true },
      { model_id:"model-1",fixture:false,data_compliant:false,criterion_passed:true },
      { model_id:"model-1",fixture:false,data_compliant:true,criterion_passed:false },
      { model_id:"other",fixture:false,data_compliant:true,criterion_passed:true },
    ]) {
      writeFileSync(resultPath,JSON.stringify(result)); const state=loadMlSignalState({ snapshots,now_ms:NOW,signals_path:signalsPath,approval_path:approvalPath,training_result_path:resultPath });
      expect(state.approved_model_id).toBeNull(); expect(state.model_result_eligible).toBe(false); expect(freshMlSignal(state,"mint",EVENT,NOW)).toBeNull();
    }
  });

  test("rejects stale scores and stale models and reports hour-old degradation", () => {
    const base = { approved_model_id: "model-1", model_result_eligible: true, history_eligible: true, latest_scored_at_ms: NOW - 2 * 60 * 60_000, signals: parseMlSignals(JSON.stringify(signal(.7))) };
    expect(mlSignalsDegraded(base, NOW)).toBe(true);
    expect(freshMlSignal({ ...base, signals: parseMlSignals(JSON.stringify(signal(.7, { scored_at: new Date(NOW - 60_001).toISOString() }))) }, "mint", EVENT, NOW)).toBeNull();
    expect(freshMlSignal({ ...base, signals: parseMlSignals(JSON.stringify(signal(.7, { trained_through: new Date(NOW - 101 * DAY).toISOString() }))) }, "mint", EVENT, NOW)).toBeNull();
  });

  test("waits across ticks for an active scorer, then resolves or safely times out", () => {
    const active = {
      approved_model_id: "model-1", model_result_eligible: true, history_eligible: true,
      latest_scored_at_ms: null, signals: new Map(),
    };
    expect(resolveMlEvent(active, "mint", EVENT, EVENT + 1).decision).toBe("wait");
    expect(resolveMlEvent({ ...active, signals: parseMlSignals(JSON.stringify(signal(.75))) }, "mint", EVENT, NOW)).toMatchObject({
      decision: "signal", signal: { p_up: .75 },
    });
    expect(resolveMlEvent(active, "mint", EVENT, EVENT + 60_000).decision).toBe("rule");
    expect(resolveMlEvent({ ...active, approved_model_id: null }, "mint", EVENT, EVENT + 1).decision).toBe("rule");
  });
});

describe("CUSUM ML direction filter", () => {
  test("maps p(up) conservatively and stamps fresh model evidence", () => {
    expect(mlConfidence(.75)).toBe(.6);
    expect(mlConfidence(-10)).toBe(.3);
    expect(mlConfidence(10)).toBe(.9);
    const candidate = cusumTbCandidate(input("up", signal(.75)), cost)!;
    expect(candidate.confidence).toBe(.6);
    expect(candidate.features).toMatchObject({ ml: "fresh", p_up: .75, model_id: "model-1" });
  });

  test("uses strict 60/40 filter for new exposure", () => {
    expect(cusumTbCandidate(input("up", signal(.60)), cost)).toBeNull();
    expect(cusumTbCandidate(input("up", signal(.6001)), cost)).not.toBeNull();
    expect(cusumTbCandidate(input("down", signal(.40)), cost)).toBeNull();
    expect(cusumTbCandidate(input("down", signal(.3999)), cost)).not.toBeNull();
  });

  test("missing ML degrades to rule rules and never blocks a held protective exit", () => {
    expect(cusumTbCandidate(input("up", null), cost)?.features.ml).toBe("absent");
    expect(cusumTbCandidate(input("down", signal(.95), true), cost)?.side).toBe("sell");
  });
});

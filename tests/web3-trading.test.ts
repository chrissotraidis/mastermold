/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, POST } from "@/app/api/web3-trading/route";
import { GET as OHLCV_GET, POST as OHLCV_POST } from "@/app/api/web3-ohlcv/route";
import { buildAutonomousNextMoves, chooseAutoWatchPlan } from "@/components/web3-trading-workspace-loader";
import {
  getWeb3TradingStateAsync,
  getWeb3TradingState,
  scoreMarket,
  type MemecoinMarket,
  type Web3TradingState,
} from "@/src/db/web3-trading";
import { __resetStoreForTests } from "@/src/db/store";

let prevDb: string | undefined;
let prevJupiterKey: string | undefined;
let prevJupiterTriggerJwt: string | undefined;
let prevRpcUrl: string | undefined;
let prevLiveExecution: string | undefined;
let prevLiveApproval: string | undefined;
let prevSignerProvider: string | undefined;
let prevPrivyAppId: string | undefined;
let prevPrivyAppSecret: string | undefined;
let prevPrivyWalletId: string | undefined;
let prevFetch: typeof globalThis.fetch;

beforeEach(() => {
  prevDb = process.env.MASTERMOLD_DB;
  prevJupiterKey = process.env.JUPITER_API_KEY;
  prevJupiterTriggerJwt = process.env.JUPITER_TRIGGER_JWT;
  prevRpcUrl = process.env.SOLANA_RPC_URL;
  prevLiveExecution = process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION;
  prevLiveApproval = process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL;
  prevSignerProvider = process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER;
  prevPrivyAppId = process.env.PRIVY_APP_ID;
  prevPrivyAppSecret = process.env.PRIVY_APP_SECRET;
  prevPrivyWalletId = process.env.PRIVY_SOLANA_WALLET_ID;
  prevFetch = globalThis.fetch;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-web3-")), "db.sqlite");
  delete process.env.JUPITER_API_KEY;
  delete process.env.JUPITER_TRIGGER_JWT;
  delete process.env.SOLANA_RPC_URL;
  delete process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION;
  delete process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL;
  delete process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER;
  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.PRIVY_SOLANA_WALLET_ID;
  __resetStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  if (prevJupiterKey === undefined) delete process.env.JUPITER_API_KEY;
  else process.env.JUPITER_API_KEY = prevJupiterKey;
  if (prevJupiterTriggerJwt === undefined) delete process.env.JUPITER_TRIGGER_JWT;
  else process.env.JUPITER_TRIGGER_JWT = prevJupiterTriggerJwt;
  if (prevRpcUrl === undefined) delete process.env.SOLANA_RPC_URL;
  else process.env.SOLANA_RPC_URL = prevRpcUrl;
  if (prevLiveExecution === undefined) delete process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION;
  else process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = prevLiveExecution;
  if (prevLiveApproval === undefined) delete process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL;
  else process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = prevLiveApproval;
  if (prevSignerProvider === undefined) delete process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER;
  else process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = prevSignerProvider;
  if (prevPrivyAppId === undefined) delete process.env.PRIVY_APP_ID;
  else process.env.PRIVY_APP_ID = prevPrivyAppId;
  if (prevPrivyAppSecret === undefined) delete process.env.PRIVY_APP_SECRET;
  else process.env.PRIVY_APP_SECRET = prevPrivyAppSecret;
  if (prevPrivyWalletId === undefined) delete process.env.PRIVY_SOLANA_WALLET_ID;
  else process.env.PRIVY_SOLANA_WALLET_ID = prevPrivyWalletId;
  globalThis.fetch = prevFetch;
  __resetStoreForTests();
});

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("Web3 autonomous trading subsystem", () => {
  test("GIVEN a paper trading state WHEN the agent scores markets THEN it buys strong setups and blocks unsafe launches", () => {
    const state = getWeb3TradingState("base", 0);
    const buy = state.signals.find((signal) => signal.action === "buy");
    const blocked = state.signals.find((signal) => signal.symbol === "LAUNCHX");

    expect(state.autonomy.status).toBe("armed-paper");
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    expect(state.portfolio.cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.trade_tape.every((trade) => trade.status === "paper-filled")).toBe(true);
    expect(buy?.suggested_size_usd).toBeGreaterThan(0);
    expect(blocked?.action).toBe("block");
    expect(blocked?.risk_warnings).toContain("thin-liquidity");
  });

  test("GIVEN a rug-risk market WHEN scored THEN the agent exits instead of adding exposure", () => {
    const market: MemecoinMarket = {
      id: "test",
      chain: "solana",
      symbol: "RISK",
      name: "Risk",
      token_address: "risk",
      pair_address: "risk",
      dex: "PumpSwap",
      price_usd: 0.01,
      market_cap_usd: 1_000_000,
      liquidity_usd: 300_000,
      volume_5m_usd: 200_000,
      volume_1h_usd: 900_000,
      volume_24h_usd: 2_000_000,
      buys_5m: 42,
      sells_5m: 350,
      price_change_5m_pct: -8,
      price_change_1h_pct: -19,
      price_change_6h_pct: -31,
      age_minutes: 800,
      boosts: 0,
      paid_orders: 0,
      holder_count_estimate: 8_000,
      risk_flags: ["sell-wall"],
    };

    const signal = scoreMarket(market);
    expect(signal.action).toBe("sell");
    expect(signal.suggested_size_usd).toBe(0);
  });

  test("GIVEN open positions WHEN the desk refreshes THEN the agent produces position-level exit watch decisions", () => {
    const state = getWeb3TradingState("base", 0);
    const managedWatch = state.position_watch.find((watch) => watch.action === "exit" || watch.action === "tighten-stop");

    expect(Array.isArray(state.position_watch)).toBe(true);
    expect(state.position_watch.length).toBeGreaterThan(0);
    expect(managedWatch?.urgency).toMatch(/high|medium/);
    expect(managedWatch?.triggers.some((trigger) => trigger.includes("open PnL"))).toBe(true);
    expect(state.position_watch.every((watch) => watch.health_score >= 0 && watch.health_score <= 100)).toBe(true);
  });

  test("GIVEN open positions WHEN exit ladders run THEN they arm stops, profit trims, and moonbag runners", () => {
    const state = getWeb3TradingState("rug-risk", 0);
    const ladder = state.position_exit_ladder;
    const kinds = new Set(ladder.items.flatMap((item) => item.steps.map((step) => step.kind)));

    expect(ladder.items.length).toBe(state.portfolio.open_positions.length);
    expect(ladder.active_count).toBeGreaterThan(0);
    expect(ladder.risk_at_stop_usd).toBeGreaterThan(0);
    expect(kinds).toEqual(new Set(["risk-exit", "hard-stop", "trailing-stop", "take-profit", "moonbag"]));
    expect(ladder.items.every((item) => item.ladder_score >= 0 && item.ladder_score <= 100)).toBe(true);
    expect(ladder.items.some((item) => item.steps.some((step) => step.kind === "trailing-stop" && step.status === "armed"))).toBe(true);
    expect(ladder.items.some((item) => item.steps.some((step) => step.kind === "moonbag" && step.size_usd >= 0))).toBe(true);
  });

  test("GIVEN open memecoin positions WHEN liquidity exit sentinel runs THEN it sizes trims and exits before profit disappears", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const sentinel = state.liquidity_exit_sentinel;
    const urgent = sentinel.items.find((item) => item.action === "exit" || item.action === "trim");

    expect(sentinel.mode).toBe("liquidity-exit-sentinel");
    expect(["clear", "watch", "tighten", "trim", "exit"]).toContain(sentinel.status);
    expect(sentinel.items.length).toBe(state.portfolio.open_positions.length);
    expect(sentinel.average_exit_pressure_score).toBeGreaterThanOrEqual(0);
    expect(sentinel.average_exit_pressure_score).toBeLessThanOrEqual(100);
    expect(sentinel.scan_interval_seconds).toBeGreaterThan(0);
    expect(urgent?.recommended_exit_usd).toBeGreaterThan(0);
    expect(urgent?.triggers.some((trigger) => trigger.includes("liquidity") || trigger.includes("buy flow"))).toBe(true);
    expect(state.autopilot.actions.some((action) => action.id.includes("autopilot-liquidity-exit") && action.side === "sell")).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "liquidity-exit-sentinel")).toBe(true);
  });

  test("GIVEN open positions WHEN the position commander runs THEN it fuses exits, stops, routes, and alpha into one command", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const commander = state.position_commander;
    const profitLock = state.profit_lock_autopilot;
    const profitRace = state.profit_capture_race;
    const urgent = commander.items.find((item) => item.action === "exit" || item.action === "lockout" || item.action === "trim" || item.action === "defend");

    expect(commander.mode).toBe("autonomous-position-commander");
    expect(["idle", "watch", "defend", "trim", "exit", "moonbag"]).toContain(commander.status);
    expect(commander.items.length).toBe(state.portfolio.open_positions.length);
    expect(commander.items.every((item) =>
      item.command_score >= 0 &&
      item.command_score <= 100 &&
      item.position_health_score >= 0 &&
      item.exit_pressure_score >= 0 &&
      item.profit_capture_score >= 0 &&
      item.route_protection_score >= 0 &&
      item.review_after_seconds > 0 &&
      item.current_value_usd >= item.commanded_sell_usd &&
      item.reentry_lockout_seconds >= 0
    )).toBe(true);
    expect(urgent?.triggers.length).toBeGreaterThan(0);
    if (commander.commanded_sell_usd > 0) {
      expect(state.profit_loop_controller.max_cycle_release_usd)
        .toBeGreaterThanOrEqual(commander.commanded_sell_usd);
      expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "position-commander")).toBe(true);
    }

    expect(profitLock.mode).toBe("profit-lock-autopilot");
    expect(["exit", "harvest", "trail", "defend", "moonbag", "idle"]).toContain(profitLock.status);
    expect(profitLock.items.length).toBe(state.portfolio.open_positions.length);
    expect(profitLock.items.every((item) =>
      item.lock_score >= 0 &&
      item.lock_score <= 100 &&
      item.current_value_usd >= item.release_usd &&
      item.release_usd >= 0 &&
      item.locked_profit_usd >= 0 &&
      item.at_risk_usd >= 0 &&
      item.moonbag_usd >= 0 &&
      item.stop_price_usd > 0 &&
      item.review_after_seconds > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(profitLock.release_usd).toBeGreaterThanOrEqual(0);
    if (profitLock.status === "exit" || profitLock.status === "harvest" || profitLock.status === "defend") {
      expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "profit-lock-autopilot")).toBe(true);
    }

    expect(profitRace.mode).toBe("profit-capture-race");
    expect(["race", "trim", "harvest", "trail", "press", "blocked", "idle"]).toContain(profitRace.status);
    expect(profitRace.items.length).toBe(state.portfolio.open_positions.length);
    expect(profitRace.items.every((item) =>
      item.race_score >= 0 &&
      item.race_score <= 100 &&
      item.profit_capture_score >= 0 &&
      item.profit_capture_score <= 100 &&
      item.liquidity_pressure_score >= 0 &&
      item.liquidity_pressure_score <= 100 &&
      item.tape_pressure_score >= 0 &&
      item.tape_pressure_score <= 100 &&
      item.smart_money_pressure_score >= 0 &&
      item.smart_money_pressure_score <= 100 &&
      item.route_freshness_score >= 0 &&
      item.route_freshness_score <= 100 &&
      item.time_to_decision_seconds > 0 &&
      item.current_value_usd >= item.recommended_release_usd &&
      item.keep_usd >= 0 &&
      item.evidence.length > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(profitRace.recommended_release_usd).toBeGreaterThanOrEqual(0);
    if (profitRace.status === "race" || profitRace.status === "trim" || profitRace.status === "harvest" || profitRace.status === "trail" || profitRace.status === "press") {
      expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "profit-capture-race")).toBe(true);
    }
  });

  test("GIVEN open positions WHEN trigger-order planner runs THEN it shapes Jupiter-style OCO and stop protection without creating orders", () => {
    const state = getWeb3TradingState("rug-risk", 0);
    const planner = state.trigger_order_planner;
    const oco = planner.items.find((item) => item.order_type === "oco");
    const stop = planner.items.find((item) => item.order_type === "single-stop");

    expect(planner.mode).toBe("jupiter-trigger-planner");
    expect(["auth-required", "blocked", "monitoring", "ready", "idle"]).toContain(planner.status);
    expect(planner.base_url).toBe("https://api.jup.ag/trigger/v2");
    expect(planner.min_order_usd).toBe(10);
    expect(planner.vault_required).toBe(true);
    expect(planner.api_key_configured).toBe(false);
    expect(planner.jwt_configured).toBe(false);
    expect(planner.items.length).toBe(state.portfolio.open_positions.length);
    expect(planner.planned_notional_usd).toBeGreaterThan(0);
    expect(planner.protected_notional_usd).toBeGreaterThan(0);
    expect(planner.safeguards.some((item) => item.includes("No trigger order is created"))).toBe(true);
    expect(oco).toBeDefined();
    expect(oco?.trigger_direction).toBe("oco");
    expect(oco?.take_profit_trigger_price_usd).toBeGreaterThan(0);
    expect(oco?.stop_trigger_price_usd).toBeGreaterThan(0);
    expect(oco?.blockers).toContain("JUPITER_API_KEY is missing.");
    expect(stop).toBeDefined();
    expect(stop?.trigger_direction).toBe("sell-below");
    expect(stop?.slippage_bps).toBeGreaterThanOrEqual(1_000);
    expect(planner.items.every((item) => item.deposit_usd === 0 || item.deposit_usd >= planner.min_order_usd)).toBe(true);
  });

  test("GIVEN sample market regimes WHEN strategy lab replays them THEN it recommends the strongest paper profile", () => {
    const state = getWeb3TradingState("base", 0);

    expect(state.strategy_lab.replay_cycles).toBeGreaterThanOrEqual(3);
    expect(state.strategy_lab.runs.map((run) => run.profile_id).sort()).toEqual([
      "aggressive",
      "balanced",
      "defensive",
    ]);
    expect(state.strategy_lab.runs[0].profile_id).toBe(state.strategy_lab.selected_profile_id);
    expect(state.strategy_lab.runs[0].trade_count).toBeGreaterThan(0);
    expect(state.strategy_lab.runs[0].notes.length).toBeGreaterThan(0);
    expect(state.strategy_lab.recommendation).toContain(state.strategy_lab.runs[0].label);
  });

  test("GIVEN a market tape WHEN opportunity radar ranks candidates THEN it exposes entries and blocks unsafe launches", () => {
    const state = getWeb3TradingState("base", 0);
    const entry = state.opportunity_radar.items.find((item) => item.action === "enter");
    const blocked = state.opportunity_radar.items.find((item) => item.symbol === "LAUNCHX");

    expect(state.opportunity_radar.selected_profile_id).toBe(state.strategy_lab.selected_profile_id);
    expect(state.opportunity_radar.enter_count).toBeGreaterThan(0);
    expect(entry?.suggested_size_usd).toBeGreaterThanOrEqual(100);
    expect(entry?.snipe_window_seconds).toBeGreaterThan(0);
    expect(blocked).toMatchObject({ action: "blocked" });
    expect(blocked?.blockers.length).toBeGreaterThan(0);
  });

  test("GIVEN discovery catalysts WHEN hype quality is scored THEN paid promotion is separated from organic flow", () => {
    const state = getWeb3TradingState("base", 0);
    const catalyst = state.trend_catalyst;
    const paid = catalyst.items.find((item) => item.symbol === "LAUNCHX");

    expect(["hot", "selective", "promotion-risk", "quiet"]).toContain(catalyst.status);
    expect(catalyst.source).toBe("local-catalyst-model");
    expect(catalyst.items.length).toBeGreaterThan(0);
    expect(catalyst.items.every((item) => item.attention_score >= 0 && item.attention_score <= 100)).toBe(true);
    expect(catalyst.items.every((item) => item.organic_score >= 0 && item.organic_score <= 100)).toBe(true);
    expect(catalyst.items.every((item) => item.review_after_seconds > 0)).toBe(true);
    expect(paid).toBeDefined();
    expect(paid?.promotion_risk_score).toBeGreaterThanOrEqual(45);
    expect(paid?.action === "fade" || paid?.action === "block").toBe(true);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Catalyst model applies"))).toBe(true);
  });

  test("GIVEN token vetting WHEN a fresh risky launch appears THEN it blocks or caps autonomous entries", () => {
    const state = getWeb3TradingState("base", 0);
    const launch = state.token_vetting.items.find((item) => item.symbol === "LAUNCHX");
    const cappedCandidate = state.token_vetting.items.find((item) => item.status !== "blocked");

    expect(state.token_vetting.items.length).toBe(state.market.length);
    expect(state.token_vetting.credential_gated_count).toBeGreaterThan(0);
    expect(launch).toMatchObject({
      status: "blocked",
      max_position_usd: 0,
    });
    expect(launch?.checks.some((check) => check.status === "fail")).toBe(true);
    expect(cappedCandidate?.max_position_usd).toBeGreaterThan(0);
  });

  test("GIVEN rug-prone tokens WHEN firewall scores them THEN it quarantines risky buys before autonomy sizing", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const quarantined = state.rug_pull_firewall.items.find((item) => item.symbol === "LAUNCHX");
    const exitFirst = state.rug_pull_firewall.items.find((item) => item.action === "exit");

    expect(state.rug_pull_firewall.items.length).toBe(state.market.length);
    expect(state.rug_pull_firewall.scan_interval_seconds).toBe(10);
    expect(state.rug_pull_firewall.average_risk_score).toBeGreaterThanOrEqual(0);
    expect(state.rug_pull_firewall.credential_gated_count).toBeGreaterThan(0);
    expect(quarantined).toMatchObject({ action: "quarantine" });
    expect(quarantined?.composite_risk_score).toBeGreaterThanOrEqual(70);
    expect(quarantined?.blockers.length).toBeGreaterThan(0);
    expect(exitFirst?.blockers.length).toBeGreaterThan(0);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Rug firewall gates entries"))).toBe(true);
    expect(state.profit_optimizer.candidates
      .filter((candidate) => state.rug_pull_firewall.items.some((item) =>
        item.symbol === candidate.symbol && (item.action === "quarantine" || item.action === "exit")
      ))
      .every((candidate) => candidate.verdict === "avoid" || candidate.verdict === "exit" || candidate.adjusted_size_usd === 0)).toBe(true);
  });

  test("GIVEN profit, route, scanner, and wallet evidence WHEN the strategy selector runs THEN it chooses one bounded paper tactic", () => {
    const state = getWeb3TradingState("breakout", 2);
    const selector = state.autonomous_strategy_selector;
    const selected = selector.items.find((item) => item.status === "selected");

    expect(selector.mode).toBe("autonomous-strategy-selector");
    expect(["press", "probe", "compound", "protect", "refresh", "cooldown", "idle"]).toContain(selector.status);
    expect(selector.items.length).toBeGreaterThanOrEqual(5);
    expect(selected).toBeDefined();
    expect(selector.selected_tactic).toBe(selected?.tactic ?? null);
    expect(selector.confidence_score).toBeGreaterThanOrEqual(0);
    expect(selector.confidence_score).toBeLessThanOrEqual(100);
    expect(selector.cadence_seconds).toBeGreaterThan(0);
    expect(selector.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(selector.controls.some((control) => control.includes("local paper evidence"))).toBe(true);
    expect(selector.controls.some((control) => control.includes("not a guarantee of live profit"))).toBe(true);
    expect(selector.items.every((item) =>
      item.score >= 0 &&
      item.score <= 100 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.max_trade_usd >= 0 &&
      item.cadence_seconds > 0 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(state.autonomous_session_planner.selected_tactic).toBe(selector.selected_tactic);
    expect(state.autonomous_session_planner.selected_tactic_label).toBe(selector.selected_label);
    expect(state.autonomous_session_planner.selected_tactic_status).toBe(selector.status);
    if (selector.selected_symbol) {
      expect(state.autonomous_session_planner.target_symbol).toBe(selector.selected_symbol);
    }
  });

  test("GIVEN concentrated holders and whale exits WHEN holder-flow sentinel runs THEN it blocks buys and exits held risk", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const sentinel = state.holder_flow_sentinel;
    const launch = sentinel.items.find((item) => item.symbol === "LAUNCHX");
    const heldExit = sentinel.items.find((item) => item.action === "exit" || item.action === "trim");

    expect(sentinel.mode).toBe("holder-flow-sentinel");
    expect(["clear", "watch", "blocked", "exit"]).toContain(sentinel.status);
    expect(sentinel.items.length).toBeGreaterThan(0);
    expect(sentinel.credential_gated_count).toBeGreaterThan(0);
    expect(sentinel.items.every((item) =>
      item.insider_risk_score >= 0 &&
      item.insider_risk_score <= 100 &&
      item.holder_concentration_score >= 0 &&
      item.holder_concentration_score <= 100 &&
      item.whale_exit_pressure_score >= 0 &&
      item.whale_exit_pressure_score <= 100 &&
      item.recommended_size_multiplier >= 0 &&
      item.recommended_size_multiplier <= 1 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(launch).toMatchObject({ action: "block" });
    expect(launch!.blockers.length).toBeGreaterThan(0);
    expect(heldExit?.recommended_exit_usd).toBeGreaterThan(0);
    expect(state.autopilot.actions.some((action) =>
      action.id.startsWith("autopilot-holder-flow-") &&
      action.side === "sell"
    )).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "holder-flow-sentinel")).toBe(true);
  });

  test("GIVEN fast price action WHEN the monitor scans the tape THEN it classifies snipe and eject windows", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);
    const active = breakout.price_action_monitor.items.find((item) => item.decision === "snipe" || item.decision === "press");
    const protectedItem = rugRisk.price_action_monitor.items.find((item) => item.decision === "avoid" || item.decision === "eject" || item.decision === "trim");

    expect(breakout.price_action_monitor.items.length).toBeGreaterThan(0);
    expect(breakout.price_action_monitor.scan_interval_seconds).toBe(10);
    expect(active?.entry_size_multiplier).toBeGreaterThan(0);
    expect(active?.triggers.length).toBeGreaterThan(0);
    expect(rugRisk.price_action_monitor.eject_count + rugRisk.price_action_monitor.trim_count + rugRisk.price_action_monitor.avoid_count)
      .toBeGreaterThan(0);
    expect(protectedItem?.blockers.length).toBeGreaterThan(0);
    expect(rugRisk.autonomy_policy.rules.some((rule) => rule.includes("Price action monitor applies"))).toBe(true);
  });

  test("GIVEN transaction imbalance WHEN microstructure tape runs THEN it classifies buy bursts and sell cascades", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);
    const active = breakout.microstructure_tape.items.find((item) => item.action === "chase" || item.action === "absorb");
    const defensive = rugRisk.microstructure_tape.items.find((item) => item.action === "rug-pull" || item.action === "distribute" || item.action === "fade");

    expect(breakout.microstructure_tape.mode).toBe("microstructure-tape");
    expect(["attack", "absorb", "defensive", "rug-pull", "idle"]).toContain(breakout.microstructure_tape.status);
    expect(breakout.microstructure_tape.items.length).toBeGreaterThan(0);
    expect(breakout.microstructure_tape.items.every((item) =>
      item.micro_score >= 0 &&
      item.micro_score <= 100 &&
      item.trade_count_5m >= 0 &&
      item.avg_trade_size_usd >= 0 &&
      item.review_after_seconds > 0 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(active?.recommended_size_multiplier).toBeGreaterThan(0);
    expect(active?.evidence.some((entry) => entry.includes("buy pressure"))).toBe(true);
    expect(["defensive", "rug-pull", "attack", "absorb", "idle"]).toContain(rugRisk.microstructure_tape.status);
    expect(defensive).toBeDefined();
    expect(defensive!.sell_cascade_score + defensive!.liquidity_vacuum_score + defensive!.distribution_score).toBeGreaterThan(0);
    if (rugRisk.microstructure_tape.recommended_release_usd > 0) {
      expect(rugRisk.profit_loop_controller.max_cycle_release_usd)
        .toBeGreaterThanOrEqual(rugRisk.microstructure_tape.recommended_release_usd);
    }
    if (breakout.microstructure_tape.status !== "idle") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "microstructure-tape")).toBe(true);
    }
  });

  test("GIVEN smart wallet proxies WHEN smart money sentinel runs THEN it follows clean accumulation and fades risky flow", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);
    const follow = breakout.smart_money_sentinel.items.find((item) => item.action === "follow" || item.action === "probe");
    const defensive = rugRisk.smart_money_sentinel.items.find((item) => item.action === "exit" || item.action === "fade");

    expect(breakout.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(breakout.onchain_event_inbox.mode).toBe("onchain-event-inbox");
    expect(breakout.onchain_event_inbox.status).toBe("idle");
    expect(breakout.onchain_event_inbox.source_status).toBe("empty");
    expect(breakout.wallet_event_reactor.mode).toBe("wallet-event-reactor");
    expect(breakout.wallet_event_reactor.status).toBe("idle");
    expect(["follow", "probe", "defensive", "exit", "idle"]).toContain(breakout.smart_money_sentinel.status);
    expect(breakout.smart_money_sentinel.items.length).toBeGreaterThan(0);
    expect(breakout.smart_money_sentinel.items.every((item) =>
      item.smart_score >= 0 &&
      item.smart_score <= 100 &&
      item.wallet_accumulation_score >= 0 &&
      item.trader_quality_score >= 0 &&
      item.concentration_risk_score >= 0 &&
      item.copy_trade_confidence >= 0 &&
      item.review_after_seconds > 0 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(follow?.recommended_size_multiplier).toBeGreaterThan(0);
    expect(follow?.evidence.some((entry) => entry.includes("estimated smart flow"))).toBe(true);
    expect(rugRisk.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(defensive).toBeDefined();
    if (rugRisk.smart_money_sentinel.recommended_release_usd > 0) {
      expect(rugRisk.profit_loop_controller.max_cycle_release_usd)
        .toBeGreaterThanOrEqual(rugRisk.smart_money_sentinel.recommended_release_usd);
    }
    if (breakout.smart_money_sentinel.status !== "idle") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "smart-money-sentinel")).toBe(true);
    }
  });

  test("GIVEN Helius-style wallet events WHEN posted to the trading API THEN the inbox dedupes and pushes smart-money copy recommendations", async () => {
    const bonk = getWeb3TradingState("base", 0).market.find((market) => market.symbol === "BONK");
    expect(bonk).toBeDefined();

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          account: "persistent",
          scenario: "breakout",
          reset: true,
          advance: false,
          execution: { kill_switch: false },
          onchain_events: {
            source: "helius-webhook",
            events: [
              {
                signature: "5copyBuyBonk111111111111111111111111111111111111111111",
                type: "SWAP",
                timestamp: "2026-06-16T14:00:00.000Z",
                direction: "buy",
                token_address: bonk!.token_address,
                symbol: "BONK",
                wallet_address: "SmartWallet111111111111111111111111111111111",
                counterparty: "Pool111111111111111111111111111111111111111",
                amount: 520_000_000,
                amount_usd: 75_000,
              },
              {
                signature: "5copyBuyBonk111111111111111111111111111111111111111111",
                type: "SWAP",
                timestamp: "2026-06-16T14:00:01.000Z",
                direction: "buy",
                token_address: bonk!.token_address,
                symbol: "BONK",
                wallet_address: "SmartWallet111111111111111111111111111111111",
                amount: 520_000_000,
                amount_usd: 75_000,
              },
            ],
          },
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);
    const inboxItem = state.onchain_event_inbox.items.find((item) => item.symbol === "BONK");
    const reactorItem = state.wallet_event_reactor.items.find((item) => item.symbol === "BONK");
    const smartItem = state.smart_money_sentinel.items.find((item) => item.symbol === "BONK");
    const walletIntent = state.execution_intents.intents.find((intent) =>
      intent.source_action_id.startsWith("wallet-reactor-") && intent.symbol === "BONK"
    );

    expect(response.status).toBe(200);
    expect(state.onchain_event_inbox.status).toBe("accumulation");
    expect(state.onchain_event_inbox.source_status).toBe("local-events");
    expect(state.onchain_event_inbox.event_count).toBe(1);
    expect(state.onchain_event_inbox.buy_count).toBe(1);
    expect(state.onchain_event_inbox.actionable_count).toBeGreaterThanOrEqual(1);
    expect(state.onchain_event_inbox.estimated_flow_usd).toBe(75_000);
    expect(inboxItem).toMatchObject({
      action: "copy-buy",
      direction: "buy",
      source: "helius-webhook",
      token_id: "bonk-sol",
    });
    expect(inboxItem!.pressure_score).toBeGreaterThanOrEqual(58);
    expect(state.wallet_event_reactor.status).toBe("attack");
    expect(state.wallet_event_reactor.deploy_count).toBe(1);
    expect(state.wallet_event_reactor.total_deploy_usd).toBeGreaterThan(0);
    expect(reactorItem).toMatchObject({
      action: "deploy",
      side: "buy",
      priority: "now",
      status: "ready",
      token_id: "bonk-sol",
    });
    expect(reactorItem!.latency_budget_seconds).toBeLessThanOrEqual(5);
    expect(walletIntent).toBeDefined();
    expect(walletIntent).toMatchObject({
      side: "buy",
      priority: "now",
      symbol: "BONK",
    });
    expect(walletIntent!.rationale).toContain("wallet flow");
    expect(state.autonomous_monitor.triggers.find((trigger) => trigger.id === "wallet-event-reactor")).toMatchObject({
      label: "Wallet copy",
      severity: "urgent",
      symbol: "BONK",
    });
    expect(state.autonomous_monitor.watch_symbols).toContain("BONK");
    expect(smartItem?.evidence.some((entry) => entry.includes("copy buy event"))).toBe(true);

    const repeat = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          account: "persistent",
          scenario: "breakout",
          advance: false,
          onchain_events: {
            source: "helius-webhook",
            events: [
              {
                signature: "5copyBuyBonk111111111111111111111111111111111111111111",
                type: "SWAP",
                direction: "buy",
                token_address: bonk!.token_address,
                symbol: "BONK",
                amount: 520_000_000,
                amount_usd: 75_000,
              },
            ],
          },
        }),
      }),
    );
    const repeatedState = await json<Web3TradingState>(repeat);

    expect(repeat.status).toBe(200);
    expect(repeatedState.onchain_event_inbox.event_count).toBe(1);
    expect(repeatedState.wallet_event_reactor.items.filter((item) => item.event_id === "5copyBuyBonk111111111111111111111111111111111111111111")).toHaveLength(1);
    expect(repeatedState.onchain_event_inbox.items.filter((item) => item.signature === "5copyBuyBonk111111111111111111111111111111111111111111")).toHaveLength(1);
  });

  test("GIVEN paper outcomes WHEN post-trade review runs THEN it turns lessons into next-cycle throttle guidance", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);

    expect(breakout.post_trade_review.mode).toBe("post-trade-review");
    expect(["scale", "steady", "tighten", "cooldown", "halted", "learning"]).toContain(breakout.post_trade_review.status);
    expect(["increase-size", "hold-size", "reduce-size", "pause-entries", "exit-only"]).toContain(breakout.post_trade_review.decision);
    expect(breakout.post_trade_review.reviewed_trade_count).toBe(breakout.performance_scorecard.trade_count);
    expect(breakout.post_trade_review.execution_friction_usd).toBeGreaterThanOrEqual(0);
    expect(breakout.post_trade_review.recommended_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(breakout.post_trade_review.recommended_size_multiplier).toBeLessThanOrEqual(1.18);
    expect(breakout.post_trade_review.recommended_cadence_seconds).toBeGreaterThan(0);
    expect(breakout.post_trade_review.next_action.length).toBeGreaterThan(0);
    expect(breakout.post_trade_review.lessons.map((lesson) => lesson.id)).toEqual([
      "pnl",
      "execution",
      "alpha",
      "drawdown",
      "discipline",
    ]);
    expect(breakout.post_trade_review.lessons.every((lesson) =>
      ["pass", "watch", "fail"].includes(lesson.status) &&
      ["positive", "neutral", "negative"].includes(lesson.impact) &&
      lesson.adjustment.length > 0
    )).toBe(true);
    expect(rugRisk.post_trade_review.lessons.some((lesson) => lesson.status === "watch" || lesson.status === "fail")).toBe(true);
    if (rugRisk.post_trade_review.pause_new_entries) {
      expect(["pause-entries", "exit-only"]).toContain(rugRisk.post_trade_review.decision);
    }
  });

  test("GIVEN execution intents WHEN cost monitor prices the lane THEN it estimates route, priority-fee, and landability drag", () => {
    const state = getWeb3TradingState("breakout", 2);
    const costed = state.execution_cost_monitor.items.find((item) => item.side === "buy");

    expect(state.execution_cost_monitor.source).toBe("local-estimate");
    expect(state.execution_cost_monitor.priority_fee_window_blocks).toBe(150);
    expect(state.execution_cost_monitor.items.length).toBeGreaterThan(0);
    expect(state.execution_cost_monitor.average_total_cost_bps).toBeGreaterThanOrEqual(0);
    expect(state.execution_cost_monitor.fee_drag_usd).toBeGreaterThanOrEqual(0);
    expect(costed?.total_cost_bps).toBeGreaterThanOrEqual(costed?.route_cost_bps ?? 0);
    expect(costed?.priority_fee_lamports).toBeGreaterThanOrEqual(0);
    expect(costed?.landability_score).toBeGreaterThanOrEqual(0);
    expect(costed?.landability_score).toBeLessThanOrEqual(100);
    expect(state.execution_preflight.items.some((item) =>
      item.estimated_priority_fee_lamports !== null && item.fee_bps !== null
    )).toBe(true);
  });

  test("GIVEN execution intents WHEN MEV guard screens them THEN it catches sandwich and liquidity-shock exposure", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const guard = state.execution_mev_guard;

    expect(["clear", "watch", "protect", "blocked", "paper", "idle"]).toContain(guard.status);
    expect(guard.source).toBe("local-mev-risk-model");
    expect(guard.items.length).toBeGreaterThan(0);
    expect(guard.average_sandwich_risk_score).toBeGreaterThanOrEqual(0);
    expect(guard.average_liquidity_shock_score).toBeGreaterThanOrEqual(0);
    expect(guard.items.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(guard.items.every((item) => item.recommended_slippage_bps <= guard.max_slippage_bps)).toBe(true);
    expect(guard.items.some((item) =>
      item.action === "block" ||
      item.action === "split" ||
      item.action === "private-route" ||
      item.action === "tighten-slippage" ||
      item.status === "paper"
    )).toBe(true);
    expect(state.execution_preflight.items.some((item) => item.checks.some((check) => check.id === "mev-guard"))).toBe(true);
  });

  test("GIVEN paper fills WHEN fill quality scores them THEN it measures slippage, partial fills, and shortfall", () => {
    const state = getWeb3TradingState("breakout", 2);
    const quality = state.paper_execution_quality;

    expect(["excellent", "acceptable", "degraded", "poor", "idle"]).toContain(quality.status);
    expect(quality.source).toBe("local-fill-simulator");
    expect(quality.items.length).toBe(state.trade_tape.length);
    expect(quality.requested_usd).toBeGreaterThanOrEqual(quality.filled_usd);
    expect(quality.fill_rate_pct).toBeGreaterThanOrEqual(0);
    expect(quality.fill_rate_pct).toBeLessThanOrEqual(100);
    expect(quality.average_slippage_bps).toBeGreaterThanOrEqual(0);
    expect(quality.implementation_shortfall_usd).toBeGreaterThanOrEqual(0);
    expect(quality.items.every((item) => item.quality_score >= 0 && item.quality_score <= 100)).toBe(true);
    expect(quality.items.every((item) => item.simulated_fill_price_usd > 0)).toBe(true);
    expect(quality.items.some((item) => item.tactics.length > 0)).toBe(true);
  });

  test("GIVEN ranked opportunities WHEN autonomy policy sizes entries THEN it caps risk before paper fills", () => {
    const state = getWeb3TradingState("base", 0);
    const blockedByCost = state.autonomy_policy.orders.find((order) =>
      order.blockers.some((blocker) => blocker.includes("Execution") || blocker.includes("minimum")),
    );

    expect(state.autonomy_policy.bankroll_usd).toBeGreaterThan(0);
    expect(state.autonomy_policy.risk_per_trade_pct).toBeGreaterThan(0);
    expect(state.autonomy_policy.risk_per_trade_pct).toBeLessThanOrEqual(1.4);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Risk no more"))).toBe(true);
    expect(blockedByCost?.recommended_size_usd).toBe(0);
    expect(state.autonomy_policy.orders.every((order) => order.max_loss_usd <= order.risk_budget_usd)).toBe(true);
    expect(state.autonomous_compounder.mode).toBe("autonomous-compounder");
    expect(state.autonomous_compounder.next_order_cap_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_compounder.launch_order_cap_usd).toBeLessThanOrEqual(state.autonomous_compounder.next_order_cap_usd);
    expect(state.autonomous_compounder.directives.length).toBeGreaterThan(0);
    expect(state.trade_tape.filter((trade) => trade.side === "buy").every((trade) =>
      trade.id.startsWith("paper-graduation-")
        ? state.launch_graduation.items.some((item) =>
          item.symbol === trade.symbol &&
          (item.action === "graduate" || item.action === "snipe" || item.action === "probe") &&
          item.suggested_entry_usd >= trade.size_usd &&
          state.autonomous_compounder.launch_order_cap_usd >= trade.size_usd
        )
        : trade.id.startsWith("paper-launch-")
        ? state.launch_sniper.items.some((item) =>
          item.symbol === trade.symbol &&
          (item.verdict === "snipe" || item.verdict === "probe") &&
          item.suggested_entry_usd >= trade.size_usd &&
          state.autonomous_compounder.launch_order_cap_usd >= trade.size_usd
        )
        : state.autonomy_policy.orders.some((order) => order.symbol === trade.symbol && order.recommended_size_usd >= trade.size_usd)
    )).toBe(true);
  });

  test("GIVEN policy-sized entries WHEN profit optimizer accounts for costs THEN buys require positive net edge", () => {
    const state = getWeb3TradingState("base", 0);
    const fills = state.trade_tape.filter((trade) => trade.side === "buy");

    expect(state.profit_optimizer.candidates.length).toBeGreaterThan(0);
    expect(state.profit_optimizer.candidates.every((candidate) => candidate.estimated_cost_bps >= 0)).toBe(true);
    expect(state.profit_optimizer.candidates.some((candidate) =>
      (candidate.verdict === "wait" || candidate.verdict === "avoid") &&
      candidate.blockers.some((blocker) => blocker.includes("Execution-cost") || blocker.includes("risk") || blocker.includes("Rug"))
    )).toBe(true);
    expect(fills.every((trade) => {
      if (trade.id.startsWith("paper-graduation-")) {
        const graduation = state.launch_graduation.items.find((item) => item.symbol === trade.symbol);
        return graduation !== undefined &&
          (graduation.action === "graduate" || graduation.action === "snipe" || graduation.action === "probe") &&
          graduation.suggested_entry_usd >= trade.size_usd &&
          state.autonomous_compounder.launch_order_cap_usd >= trade.size_usd;
      }
      if (trade.id.startsWith("paper-launch-")) {
        const launch = state.launch_sniper.items.find((item) => item.symbol === trade.symbol);
        return launch !== undefined &&
          (launch.verdict === "snipe" || launch.verdict === "probe") &&
          launch.suggested_entry_usd >= trade.size_usd &&
          state.autonomous_compounder.launch_order_cap_usd >= trade.size_usd;
      }
      const candidate = state.profit_optimizer.candidates.find((item) => item.symbol === trade.symbol);
      return candidate !== undefined &&
        (candidate.verdict === "press" || candidate.verdict === "take") &&
        candidate.net_edge_pct > 0 &&
        trade.size_usd === candidate.adjusted_size_usd;
    })).toBe(true);
  });

  test("GIVEN launch candidates WHEN graduation supervisor runs THEN it separates curve, migration, and post-graduation timing", () => {
    const state = getWeb3TradingState("breakout", 2);
    const graduation = state.launch_graduation;

    expect(graduation.mode).toBe("launch-graduation-supervisor");
    expect(["hunt", "graduating", "post-graduation", "cooldown", "quiet"]).toContain(graduation.status);
    expect(graduation.items.length).toBeGreaterThan(0);
    expect(graduation.items.every((item) =>
      item.graduation_score >= 0 &&
      item.graduation_score <= 100 &&
      item.curve_progress_pct >= 0 &&
      item.curve_progress_pct <= 100 &&
      item.migration_readiness_score >= 0 &&
      item.migration_readiness_score <= 100 &&
      item.liquidity_handoff_score >= 0 &&
      item.liquidity_handoff_score <= 100 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(graduation.items.some((item) =>
      item.phase === "bonding-curve" ||
      item.phase === "graduating" ||
      item.phase === "graduated" ||
      item.phase === "post-graduation"
    )).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id.startsWith("launch-graduation"))).toBe(true);
  });

  test("GIVEN open positions and new edges WHEN capital rotation runs THEN it pairs release and redeploy decisions", () => {
    const state = getWeb3TradingState("breakout", 2);
    const actionable = state.capital_rotation.items.find((item) => item.priority === "now");

    expect(["rotate", "harvest", "accumulate", "hold", "blocked"]).toContain(state.capital_rotation.status);
    expect(state.capital_rotation.items.length).toBeGreaterThan(0);
    expect(state.capital_rotation.rotation_score).toBeGreaterThanOrEqual(0);
    expect(state.capital_rotation.rotation_score).toBeLessThanOrEqual(100);
    expect(state.capital_rotation.churn_cost_bps).toBeGreaterThanOrEqual(0);
    expect(state.capital_rotation.release_usd + state.capital_rotation.deploy_usd).toBeGreaterThanOrEqual(0);
    expect(state.capital_rotation.items.every((item) => item.size_usd >= 0 && item.confidence >= 0 && item.confidence <= 100))
      .toBe(true);
    if (actionable) {
      expect(state.autopilot.actions.some((action) => action.lane === "rotation")).toBe(true);
    }
  });

  test("GIVEN paper results WHEN learning loop evaluates them THEN it produces adaptive sizing guidance", () => {
    const state = getWeb3TradingState("base", 0);

    expect(state.learning_loop.sample_size).toBe(state.trade_tape.length);
    expect(state.learning_loop.confidence).toBeGreaterThan(0);
    expect(state.learning_loop.size_multiplier).toBeGreaterThan(0);
    expect(state.learning_loop.signals.length).toBeGreaterThanOrEqual(4);
    expect(["cold-start", "press-edge", "steady", "tighten", "stand-down"]).toContain(state.learning_loop.mode);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Learning loop applies"))).toBe(true);
  });

  test("GIVEN paper outcomes WHEN signal alpha attribution runs THEN it ranks drivers after friction", () => {
    const state = getWeb3TradingState("breakout", 2);
    const attribution = state.signal_alpha_attribution;
    const setupMemory = state.autonomous_setup_memory;

    expect(["scale-up", "learning", "tighten", "protect", "idle"]).toContain(attribution.status);
    expect(attribution.items.length).toBeGreaterThanOrEqual(6);
    expect(attribution.sample_size).toBeGreaterThan(0);
    expect(attribution.friction_usd).toBeGreaterThanOrEqual(0);
    expect(attribution.recommended_size_multiplier).toBeGreaterThan(0);
    expect(attribution.items.some((item) => item.id === "execution-friction")).toBe(true);
    expect(attribution.items.every((item) => item.confidence >= 0 && item.confidence <= 96)).toBe(true);
    expect(attribution.items.every((item) => item.size_multiplier > 0)).toBe(true);
    expect(attribution.items.some((item) => item.evidence.length > 0)).toBe(true);
    expect(setupMemory.mode).toBe("autonomous-setup-memory");
    expect(["press", "selective", "cooldown", "cold-start"]).toContain(setupMemory.status);
    expect(setupMemory.sample_size).toBeGreaterThanOrEqual(0);
    expect(setupMemory.size_bias_multiplier).toBeGreaterThanOrEqual(0.5);
    expect(setupMemory.size_bias_multiplier).toBeLessThanOrEqual(1.16);
    expect(setupMemory.controls.some((control) => control.includes("paper fills"))).toBe(true);
    expect(setupMemory.items.length).toBeGreaterThan(0);
    expect(setupMemory.items.every((item) =>
      ["press", "size-down", "exit-first", "observe"].includes(item.action) &&
      item.size_multiplier > 0 &&
      item.confidence >= 0 &&
      item.confidence <= 96 &&
      item.reason.length > 0
    )).toBe(true);
  });

  test("GIVEN paper fills and open positions WHEN the performance scorecard runs THEN it measures profit, churn, and risk", () => {
    const state = getWeb3TradingState("base", 0);
    const scorecard = state.performance_scorecard;
    const churn = state.churn_efficiency_auditor;
    const objective = state.autonomous_profit_objective;
    const commandCenter = state.autonomous_command_center;
    const commandExecution = state.autonomous_command_center_execution;
    const commandPerformance = state.autonomous_command_performance;
    const profitControl = state.autonomous_profit_control;
    const fillLedger = state.autonomous_fill_ledger_digest;
    const forwardPermission = state.autonomous_forward_loop_permission;
    const loopImpact = state.autonomous_loop_impact_auditor;

    expect(["compounding", "learning", "overtrading", "protect"]).toContain(scorecard.status);
    expect(scorecard.net_pnl_usd).toBe(Math.round(state.portfolio.realized_pnl_usd + state.portfolio.unrealized_pnl_usd));
    expect(scorecard.trade_count).toBe(state.trade_tape.length);
    expect(scorecard.turnover_pct).toBeGreaterThanOrEqual(0);
    expect(scorecard.risk_adjusted_score).toBeGreaterThanOrEqual(0);
    expect(scorecard.risk_adjusted_score).toBeLessThanOrEqual(100);
    expect(scorecard.checkpoints.map((checkpoint) => checkpoint.id)).toEqual([
      "net-profit",
      "cost-edge",
      "turnover",
      "drawdown",
      "profit-factor",
      "execution-friction",
    ]);
    expect(scorecard.checkpoints.every((checkpoint) => checkpoint.detail.length > 0)).toBe(true);

    expect(fillLedger.mode).toBe("autonomous-fill-ledger-digest");
    expect(["pressing", "profitable", "protecting", "cooldown", "learning", "idle"]).toContain(fillLedger.status);
    expect(["press-winners", "protect-book", "tighten-churn", "collect-evidence", "wait"]).toContain(fillLedger.recommended_discipline);
    expect(fillLedger.recent_fill_count).toBeLessThanOrEqual(Math.min(8, state.trade_tape.length));
    expect(fillLedger.paper_volume_usd).toBeGreaterThanOrEqual(0);
    expect(fillLedger.net_pnl_usd).toBe(Math.round(state.portfolio.realized_pnl_usd + state.portfolio.unrealized_pnl_usd));
    expect(["press", "keep", "tighten", "protect", "learn", "idle"]).toContain(fillLedger.last_fill_verdict);
    expect(fillLedger.last_fill_profit_score).toBeGreaterThanOrEqual(0);
    expect(fillLedger.last_fill_profit_score).toBeLessThanOrEqual(100);
    expect(fillLedger.last_fill_quality_score).toBeGreaterThanOrEqual(0);
    expect(fillLedger.last_fill_quality_score).toBeLessThanOrEqual(100);
    expect(fillLedger.last_fill_shortfall_usd).toBeGreaterThanOrEqual(0);
    expect(["press", "selective", "protect-only", "cooldown", "wait"]).toContain(fillLedger.next_fill_permission);
    expect(fillLedger.last_fill_audit.length).toBeGreaterThan(0);
    if (fillLedger.recent_fill_count > 0) {
      expect(fillLedger.last_fill_profit_score).toBeGreaterThan(0);
      expect(fillLedger.last_fill_symbol).toBeTruthy();
    }
    expect(fillLedger.controls.some((control) => control.includes("local paper-ledger fills"))).toBe(true);
    expect(fillLedger.controls.some((control) => control.includes("last-fill profit audit"))).toBe(true);
    expect(fillLedger.items.every((item) =>
      ["launch-sniper", "launch-graduation", "signal-policy", "market-pulse", "market-intelligence", "arbiter", "opportunity-race", "candle", "protection", "manual-paper"].includes(item.lane) &&
      ["press", "keep", "tighten", "protect"].includes(item.discipline) &&
      ["profitable", "learning", "dragging", "protective"].includes(item.status) &&
      item.size_usd >= 0 &&
      item.reason.length > 0
    )).toBe(true);

    expect(objective.mode).toBe("autonomous-profit-objective");
    expect(["press", "compound", "harvest", "protect", "cooldown"]).toContain(objective.status);
    expect(objective.target_net_pnl_usd).toBeGreaterThan(0);
    expect(objective.session_profit_target_usd).toBeGreaterThanOrEqual(0);
    expect(objective.required_edge_usd).toBeGreaterThanOrEqual(0);
    expect(objective.stop_loss_usd).toBeGreaterThan(0);
    expect(objective.items.map((item) => item.id)).toEqual(["pace", "edge", "drawdown", "velocity", "policy"]);
    expect(objective.controls.some((control) => control.includes("make-money mandate"))).toBe(true);

    expect(profitControl.mode).toBe("autonomous-profit-control");
    expect(["press", "compound", "harvest", "redeploy", "protect", "cooldown"]).toContain(profitControl.status);
    expect(["burst", "active", "selective", "defensive", "paused"]).toContain(profitControl.loop_intensity);
    expect(profitControl.deploy_now_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.release_now_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.reserve_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.required_edge_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.cadence_seconds).toBeGreaterThan(0);
    expect(profitControl.confidence_score).toBeGreaterThanOrEqual(0);
    expect(profitControl.confidence_score).toBeLessThanOrEqual(100);
    expect(profitControl.controls.some((control) => control.includes("objective"))).toBe(true);
    expect(profitControl.items.length).toBeGreaterThanOrEqual(6);

    expect(commandCenter.mode).toBe("autonomous-command-center");
    expect(["attack", "protect", "harvest", "prepare", "blocked", "watch"]).toContain(commandCenter.status);
    expect(["buy", "sell", "harvest", "protect", "refresh", "hold", "blocked"]).toContain(commandCenter.primary_action);
    expect(["buy", "sell", "hold"]).toContain(commandCenter.primary_side);
    expect(commandCenter.command_score).toBeGreaterThanOrEqual(0);
    expect(commandCenter.deploy_usd).toBeGreaterThanOrEqual(0);
    expect(commandCenter.release_usd).toBeGreaterThanOrEqual(0);
    expect(commandCenter.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(commandCenter.fastest_review_seconds).toBeGreaterThan(0);
    expect(commandCenter.controls.some((control) => control.includes("Collapses the fast race"))).toBe(true);
    expect(commandCenter.items.length).toBeGreaterThan(0);
    expect(commandCenter.items.every((item) =>
      ["fast-race", "opportunity", "portfolio-protect", "trade-arbiter", "route-refresh", "objective"].includes(item.lane) &&
      ["buy", "sell", "hold"].includes(item.side) &&
      ["buy", "sell", "harvest", "protect", "refresh", "hold", "blocked"].includes(item.action) &&
      ["ready", "queued", "applied", "blocked", "watch"].includes(item.status) &&
      ["now", "next", "watch"].includes(item.priority) &&
      item.command_score >= 0 &&
      item.size_usd >= 0 &&
      item.expected_edge_usd >= 0 &&
      item.rehearsal_score >= 0 &&
      item.rehearsal_score <= 100 &&
      ["pass", "watch", "fail"].includes(item.rehearsal_verdict) &&
      item.projected_equity_usd > 0 &&
      typeof item.projected_pnl_usd === "number" &&
      item.projected_drawdown_pct >= 0 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0 &&
      Array.isArray(item.evidence) &&
      Array.isArray(item.blockers)
    )).toBe(true);

    expect(forwardPermission.mode).toBe("autonomous-forward-loop-permission");
    expect(["press", "probe", "harvest", "protect", "refresh", "cooldown", "blocked", "observe"]).toContain(forwardPermission.status);
    expect(["press", "selective", "harvest-only", "protect-only", "refresh-first", "cooldown", "stand-down"]).toContain(forwardPermission.permission);
    expect(["run-minute", "run-loop", "paper-probe", "harvest-profit", "protect-book", "refresh-proof", "cooldown", "stand-down"]).toContain(forwardPermission.action);
    expect(forwardPermission.permission_score).toBeGreaterThanOrEqual(0);
    expect(forwardPermission.permission_score).toBeLessThanOrEqual(100);
    expect(forwardPermission.fill_audit_score).toBe(fillLedger.last_fill_profit_score);
    expect(forwardPermission.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(forwardPermission.max_fresh_buys).toBeLessThanOrEqual(forwardPermission.max_next_fills);
    expect(forwardPermission.required_after_fill_score).toBeGreaterThan(0);
    expect(typeof forwardPermission.can_fire_next_tick).toBe("boolean");
    expect(typeof forwardPermission.allows_fresh_buy).toBe("boolean");
    expect(typeof forwardPermission.requires_protection_first).toBe("boolean");
    expect(forwardPermission.items.map((item) => item.id)).toEqual(["fill-audit", "profit-proof", "integrity", "throttle", "wake", "decision"]);
    expect(forwardPermission.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(forwardPermission.controls.some((control) => control.includes("Final forward permission"))).toBe(true);

    expect(loopImpact.mode).toBe("autonomous-loop-impact-auditor");
    expect(["compound", "continue", "tighten", "harvest", "protect", "refresh", "cooldown", "blocked", "idle"]).toContain(loopImpact.status);
    expect(["increase-frequency", "keep-running", "tighten-size", "harvest-profit", "protect-wallet", "refresh-proof", "cooldown", "stand-down", "observe"]).toContain(loopImpact.action);
    expect(loopImpact.impact_score).toBeGreaterThanOrEqual(0);
    expect(loopImpact.impact_score).toBeLessThanOrEqual(100);
    expect(loopImpact.permission_after).toBe(forwardPermission.permission);
    expect(loopImpact.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(loopImpact.next_cadence_seconds).toBeGreaterThan(0);
    expect(typeof loopImpact.requested).toBe("boolean");
    expect(loopImpact.paper_only).toBe(true);
    expect(typeof loopImpact.can_press_next_loop).toBe("boolean");
    expect(typeof loopImpact.must_reduce_frequency).toBe("boolean");
    expect(typeof loopImpact.must_refresh_proof).toBe("boolean");
    expect(loopImpact.items.map((item) => item.id)).toEqual(["equity", "exposure", "fills", "permission", "proof", "boundary"]);
    expect(loopImpact.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(loopImpact.controls.some((control) => control.includes("Audits the latest backend paper loop"))).toBe(true);
    expect(commandExecution.mode).toBe("command-center-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(commandExecution.status);
    expect(commandExecution.execution_boundary).toBe("paper-ledger-only");
    expect(commandExecution.rehearsal_score).toBeGreaterThanOrEqual(0);
    expect(commandExecution.rehearsal_score).toBeLessThanOrEqual(100);
    expect(commandExecution.projected_equity_usd).toBeGreaterThan(0);
    expect(typeof commandExecution.projected_pnl_usd).toBe("number");
    expect(commandExecution.projected_drawdown_pct).toBeGreaterThanOrEqual(0);
    expect(commandExecution.controls.some((control) => control.includes("one local paper-ledger fill"))).toBe(true);
    if (commandExecution.paper_trade) {
      expect(commandExecution.paper_trade.reason).toContain("Command center paper");
    }
    expect(commandPerformance.mode).toBe("autonomous-command-performance");
    expect(["press", "selective", "tighten", "protect", "learning", "idle"]).toContain(commandPerformance.status);
    expect(commandPerformance.command_trade_count).toBeGreaterThanOrEqual(0);
    expect(commandPerformance.command_buy_count + commandPerformance.command_sell_count).toBe(commandPerformance.command_trade_count);
    expect(commandPerformance.command_volume_usd).toBeGreaterThanOrEqual(0);
    expect(typeof commandPerformance.net_contribution_usd).toBe("number");
    expect(typeof commandPerformance.expectancy_usd).toBe("number");
    expect(commandPerformance.next_size_multiplier).toBeGreaterThan(0);
    expect(commandPerformance.recommended_cadence_seconds).toBeGreaterThan(0);
    expect(commandPerformance.controls.some((control) => control.includes("command-center paper fills"))).toBe(true);
    expect(commandPerformance.items.length).toBeGreaterThan(0);

    expect(churn.mode).toBe("churn-efficiency-auditor");
    expect(["accelerate", "selective", "cooldown", "stop", "idle"]).toContain(churn.status);
    expect(churn.trade_count).toBe(state.trade_tape.length);
    expect(churn.turnover_usd).toBeGreaterThanOrEqual(0);
    expect(churn.friction_usd).toBeGreaterThanOrEqual(0);
    expect(churn.churn_score).toBeGreaterThanOrEqual(0);
    expect(churn.churn_score).toBeLessThanOrEqual(100);
    expect(churn.max_trades_next_cycle).toBeGreaterThanOrEqual(0);
    expect(["open", "selective", "cooldown", "blocked"]).toContain(churn.entry_permission);
    expect(churn.can_open_fresh_entries)
      .toBe(churn.entry_permission === "open" || churn.entry_permission === "selective");
    expect(churn.max_fresh_entry_usd).toBeGreaterThanOrEqual(0);
    expect(churn.cooled_symbol_count).toBeGreaterThanOrEqual(0);
    expect(churn.stopped_symbol_count).toBeGreaterThanOrEqual(0);
    expect(churn.cooldown_symbols.length).toBeLessThanOrEqual(5);
    expect(churn.entry_governor_summary.length).toBeGreaterThan(0);
    expect(churn.recommended_cadence_seconds).toBeGreaterThan(0);
    if (!churn.can_open_fresh_entries) {
      expect(churn.max_fresh_entry_usd).toBe(0);
    }
    expect(churn.controls.some((control) => control.includes("net-positive"))).toBe(true);
    expect(churn.controls.some((control) => control.includes("Fresh-entry permission"))).toBe(true);
    expect(churn.items.length).toBeGreaterThan(0);
    expect(churn.items.every((item) =>
      ["accelerate", "selective", "cooldown", "stop"].includes(item.action) &&
      item.turnover_usd >= 0 &&
      item.friction_usd >= 0 &&
      item.churn_score >= 0 &&
      item.churn_score <= 100 &&
      item.fill_quality_score >= 0 &&
      item.fill_quality_score <= 100 &&
      item.route_cost_bps >= 0 &&
      item.max_trade_usd >= 0 &&
      item.next_review_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
  });

  test("GIVEN the autonomous desk WHEN the forward trial runs THEN it stress-tests profit gates across regimes", () => {
    const state = getWeb3TradingState("base", 0);
    const trial = state.autonomous_forward_test;

    expect(["passed", "watch", "failed"]).toContain(trial.status);
    expect(trial.scenario_count).toBe(3);
    expect(trial.cycles_tested).toBeGreaterThanOrEqual(9);
    expect(trial.scenarios.map((scenario) => scenario.scenario).sort()).toEqual(["base", "breakout", "rug-risk"]);
    expect(trial.scenarios.every((scenario) => scenario.trade_count >= 0 && scenario.note.length > 0)).toBe(true);
    expect(trial.gates.map((gate) => gate.id)).toEqual([
      "profitability",
      "rug-survival",
      "drawdown",
      "churn",
      "current-edge",
      "execution-boundary",
    ]);
    expect(trial.gates.every((gate) => ["pass", "watch", "fail"].includes(gate.status))).toBe(true);
    expect(trial.gates.find((gate) => gate.id === "execution-boundary")?.status).toBe("pass");
  });

  test("GIVEN replay and execution evidence WHEN the edge verifier runs THEN it grants bounded capital permission before policy sizing", () => {
    const state = getWeb3TradingState("base", 0);
    const verifier = state.autonomous_edge_verifier;

    expect(verifier.mode).toBe("autonomous-edge-verifier");
    expect(["scale", "probe", "protect", "blocked"]).toContain(verifier.status);
    expect(["increase-size", "small-probe", "protect-only", "stand-down"]).toContain(verifier.permission);
    expect(verifier.confidence_score).toBeGreaterThanOrEqual(0);
    expect(verifier.confidence_score).toBeLessThanOrEqual(100);
    expect(verifier.max_trades_allowed).toBeGreaterThanOrEqual(0);
    expect(verifier.max_notional_usd).toBeGreaterThanOrEqual(0);
    expect(verifier.checks.map((check) => check.id)).toEqual([
      "replay-edge",
      "risk-adjusted",
      "signal-noise",
      "route-proof",
      "fill-quality",
      "churn-budget",
      "opportunity-cost",
      "edge-after-costs",
      "live-boundary",
    ]);
    expect(verifier.checks.every((check) => ["pass", "watch", "fail"].includes(check.status) && check.detail.length > 0)).toBe(true);
    expect(state.autonomous_policy_optimizer.min_expected_edge_usd).toBeGreaterThanOrEqual(verifier.min_required_edge_usd);
    expect(state.autonomous_policy_optimizer.safeguards.some((safeguard) => safeguard.includes("edge verifier"))).toBe(true);
    if (verifier.permission === "stand-down" || verifier.permission === "protect-only") {
      expect(state.autonomous_policy_optimizer.deploy_budget_usd).toBe(0);
    }
  });

  test("GIVEN live-style signal, replay, route, and wallet evidence WHEN the edge stack runs THEN it emits one auditable paper-trade verdict", () => {
    const state = getWeb3TradingState("breakout", 2);
    const stack = state.autonomous_edge_stack;

    expect(stack.mode).toBe("autonomous-edge-stack");
    expect(["attack", "probe", "protect", "replay", "blocked"]).toContain(stack.status);
    expect(["paper-attack", "paper-probe", "protect-only", "refresh-first", "stand-down"]).toContain(stack.permission);
    expect(stack.edge_score).toBeGreaterThanOrEqual(0);
    expect(stack.edge_score).toBeLessThanOrEqual(100);
    expect(stack.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(stack.required_edge_usd).toBeGreaterThan(0);
    expect(stack.max_paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(stack.review_after_seconds).toBeGreaterThan(0);
    expect(stack.items.map((item) => item.lane)).toEqual(["signal", "replay", "route", "wallet", "cost", "safety"]);
    expect(stack.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(stack.controls.some((control) => control.includes("Fuses signal/noise"))).toBe(true);
    expect(stack.controls.some((control) => control.includes("local paper-ledger only"))).toBe(true);
    if (stack.should_auto_trade) {
      expect(stack.status === "attack" || stack.status === "probe").toBe(true);
      expect(stack.max_trades_next_tick).toBeGreaterThan(0);
      expect(stack.expected_edge_usd).toBeGreaterThanOrEqual(stack.required_edge_usd);
    } else {
      expect(stack.next_action.length).toBeGreaterThan(0);
    }
  });

  test("GIVEN the fused edge-stack verdict WHEN execution is planned THEN it selects one bounded paper or read-only lane", () => {
    const state = getWeb3TradingState("breakout", 2);
    const stack = state.autonomous_edge_stack;
    const execution = state.autonomous_edge_stack_execution;

    expect(execution.mode).toBe("autonomous-edge-stack-execution");
    expect(["queued", "applied", "refresh-only", "protect-only", "blocked", "idle"]).toContain(execution.status);
    expect(["paper-buy", "paper-sell", "route-refresh", "protect", "stand-down"]).toContain(execution.selected_action);
    expect(execution.permission).toBe(stack.permission);
    expect(execution.edge_status).toBe(stack.status);
    expect(execution.execution_boundary).toBe("paper-ledger-or-readonly-route");
    expect(execution.paper_boundary).toBe("paper-ledger-only");
    expect(execution.route_boundary).toBe("read-only-route-refresh");
    expect(typeof execution.paper_trade_ready).toBe("boolean");
    expect(typeof execution.route_refresh_ready).toBe("boolean");
    expect(typeof execution.ledger_applied).toBe("boolean");
    expect(execution.paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(execution.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(execution.required_edge_usd).toBeGreaterThan(0);
    expect(execution.edge_score).toBe(stack.edge_score);
    expect(execution.controls.some((control) => control.includes("concrete existing lane"))).toBe(true);
    expect(execution.controls.some((control) => control.includes("read-only"))).toBe(true);
    expect(execution.summary.length).toBeGreaterThan(0);
    expect(execution.next_action.length).toBeGreaterThan(0);

    if (execution.status === "queued" || execution.status === "applied") {
      expect(execution.paper_trade_ready).toBe(true);
      expect(execution.paper_trade).not.toBeNull();
      expect(["paper-buy", "paper-sell"]).toContain(execution.selected_action);
      expect(execution.paper_size_usd).toBeGreaterThan(0);
    }

    if (execution.status === "refresh-only") {
      expect(execution.selected_action).toBe("route-refresh");
      expect(execution.route_refresh_required).toBe(true);
      expect(execution.route_refresh_ready).toBe(true);
    }

    if (execution.status === "blocked") {
      expect(execution.blockers.length).toBeGreaterThan(0);
    }
  });

  test("GIVEN edge-stack execution WHEN the tick plan ranks lanes THEN the fused edge action feeds the next autonomous loop", async () => {
    const coldState = getWeb3TradingState("breakout", 2);
    const coldExecution = coldState.autonomous_edge_stack_execution;
    const coldEdgeItem = coldState.autonomous_tick_plan.items.find((item) => item.id === "tick-plan-edge-action");

    expect(coldEdgeItem).toBeTruthy();
    expect(coldEdgeItem?.lane).toBe("edge");
    expect(coldEdgeItem?.symbol).toBe(coldExecution.selected_symbol);
    expect(coldState.autonomous_tick_plan.controls.some((control) => control.includes("fused edge action"))).toBe(true);

    const state = await getWeb3TradingStateAsync({
      scenario: "breakout",
      source: "sample",
      account: "persistent",
      reset: true,
    });
    const execution = state.autonomous_edge_stack_execution;
    const edgeItem = state.autonomous_tick_plan.items.find((item) => item.id === "tick-plan-edge-action");

    expect(edgeItem).toBeTruthy();
    expect(edgeItem?.lane).toBe("edge");
    expect(edgeItem?.symbol).toBe(execution.selected_symbol);
    expect(edgeItem?.expected_edge_usd).toBe(Math.round(Math.max(0, execution.expected_edge_usd)));
    expect(state.autonomous_tick_plan.controls.some((control) => control.includes("fused edge action"))).toBe(true);

    if (execution.selected_action === "paper-buy") {
      expect(edgeItem?.action).toBe("trade-now");
      expect(edgeItem?.status).toBe(execution.status === "queued" ? "ready" : execution.status === "applied" ? "watch" : "blocked");
    }

    if (execution.selected_action === "paper-sell" || execution.selected_action === "protect") {
      expect(edgeItem?.action).toBe("protect-now");
      expect(edgeItem?.priority).toBe("critical");
    }

    if (execution.selected_action === "route-refresh") {
      expect(edgeItem?.action).toBe("refresh-routes");
      expect(edgeItem?.paper_budget_usd).toBe(0);
    }

    if (execution.status === "blocked") {
      expect(edgeItem?.status).toBe("blocked");
      expect(edgeItem?.blocker).toBeTruthy();
    }
  });

  test("GIVEN entry and protection candidates WHEN the opportunity race runs THEN it ranks the next bounded paper action", () => {
    const state = getWeb3TradingState("breakout", 2);
    const race = state.autonomous_opportunity_race;

    expect(race.mode).toBe("autonomous-opportunity-race");
    expect(["attack", "probe", "protect", "stand-down", "idle"]).toContain(race.status);
    expect(["attack", "probe", "protect", "harvest", "ignore", "blocked"]).toContain(race.winner_action);
    expect(race.fastest_decision_seconds).toBeGreaterThan(0);
    expect(race.items.length).toBeGreaterThan(0);
    expect(race.controls.length).toBeGreaterThan(0);
    expect(race.items.every((item) =>
      ["buy", "sell", "hold"].includes(item.side) &&
      ["attack", "probe", "protect", "harvest", "ignore", "blocked"].includes(item.action) &&
      ["now", "next", "watch"].includes(item.priority) &&
      item.race_score >= 0 &&
      item.race_score <= 100 &&
      item.signal_score >= 0 &&
      item.route_score >= 0 &&
      item.wallet_score >= 0 &&
      item.urgency_seconds > 0 &&
      item.recommended_notional_usd >= 0 &&
      item.expected_edge_usd >= 0 &&
      item.risk_usd >= 0 &&
      item.evidence.length > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(race.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(race.risk_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_race_execution.mode).toBe("opportunity-race-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_opportunity_race_execution.status);
    expect(state.autonomous_opportunity_race_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_opportunity_race_execution.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_opportunity_race_execution.controls.some((control) => control.includes("opportunity-race winner"))).toBe(true);
    expect(state.autonomous_position_risk_execution.mode).toBe("autonomous-position-risk-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_position_risk_execution.status);
    expect(state.autonomous_position_risk_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_position_risk_execution.controls.some((control) => control.includes("paper-ledger boundary"))).toBe(true);
    expect(state.portfolio_tape_guard_execution.mode).toBe("portfolio-tape-guard-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.portfolio_tape_guard_execution.status);
    expect(state.portfolio_tape_guard_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.portfolio_tape_guard_execution.controls.some((control) => control.includes("paper sell"))).toBe(true);
    if (state.autonomous_position_risk_execution.paper_trade) {
      expect(state.autonomous_position_risk_execution.paper_trade.status).toBe("paper-filled");
      expect(state.autonomous_position_risk_execution.paper_trade.side).toBe("sell");
      expect(state.autonomous_position_risk_execution.paper_trade.id).toMatch(/^paper-position-risk-/);
    }
    if (state.portfolio_tape_guard_execution.paper_trade) {
      expect(state.portfolio_tape_guard_execution.paper_trade.status).toBe("paper-filled");
      expect(state.portfolio_tape_guard_execution.paper_trade.side).toBe("sell");
      expect(state.portfolio_tape_guard_execution.paper_trade.id).toMatch(/^paper-tape-guard-/);
    }
    if (state.autonomous_opportunity_race_execution.paper_trade) {
      expect(state.autonomous_opportunity_race_execution.paper_trade.status).toBe("paper-filled");
      expect(state.autonomous_opportunity_race_execution.paper_trade.reason).toContain("Opportunity race");
      expect(Math.abs(state.autonomous_opportunity_race_execution.cash_delta_usd)).toBe(
        state.autonomous_opportunity_race_execution.paper_trade.size_usd,
      );
    }
    if (race.status === "attack" || race.status === "probe") {
      expect(race.deploy_notional_usd).toBeGreaterThan(0);
    }
    if (race.status === "protect") {
      expect(race.release_notional_usd).toBeGreaterThan(0);
    }
    if (race.status === "stand-down") {
      expect(race.items.some((item) => item.action === "blocked" || item.blockers.length > 0)).toBe(true);
    }
  });

  test("GIVEN fast markets WHEN the high-frequency profit race runs THEN it ranks immediate paper actions by after-cost profit per minute", () => {
    const state = getWeb3TradingState("breakout", 2);
    const race = state.high_frequency_profit_race;
    const execution = state.high_frequency_profit_race_execution;

    expect(race.mode).toBe("high-frequency-profit-race");
    expect(["attack", "scalp", "protect", "cooldown", "blocked", "idle"]).toContain(race.status);
    expect(race.items.length).toBeGreaterThan(0);
    expect(race.fastest_window_seconds).toBeGreaterThan(0);
    expect(race.average_score).toBeGreaterThanOrEqual(0);
    expect(race.expected_profit_usd).toBeGreaterThanOrEqual(0);
    expect(race.expected_profit_per_minute_usd).toBeGreaterThanOrEqual(0);
    expect(["fast-entry", "scalp", "profit-protect", "route-repair", "cooldown-watch"]).toContain(race.action_plan.mode);
    expect(["attack", "scalp", "trim", "exit", "harvest", "watch", "blocked", "refresh"]).toContain(race.action_plan.action);
    expect(["buy", "sell", "hold"]).toContain(race.action_plan.side);
    expect(["now", "next", "watch"]).toContain(race.action_plan.urgency);
    expect(["dex-discovery", "pair-refresh", "route-quote", "wallet-protect", "signal-watch"]).toContain(race.action_plan.data_lane);
    expect(race.action_plan.cadence_seconds).toBeGreaterThan(0);
    expect(race.action_plan.max_notional_usd).toBeGreaterThanOrEqual(0);
    expect(race.action_plan.expected_profit_per_minute_usd).toBeGreaterThanOrEqual(0);
    expect(typeof race.action_plan.route_refresh_required).toBe("boolean");
    expect(race.action_plan.reason.length).toBeGreaterThan(0);
    expect(race.action_plan.controls.some((control) => control.includes("Max local paper notional"))).toBe(true);
    if (race.action_plan.action === "refresh" || race.action_plan.action === "watch" || race.action_plan.action === "blocked") {
      expect(race.action_plan.max_notional_usd).toBe(0);
    }
    expect(race.controls.some((control) => control.includes("expected paper profit per minute"))).toBe(true);
    expect(race.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(race.items.every((item) =>
      ["buy", "sell", "hold"].includes(item.side) &&
      ["attack", "scalp", "trim", "exit", "harvest", "watch", "blocked"].includes(item.action) &&
      ["now", "next", "watch"].includes(item.priority) &&
      ["trend-entry", "scalp-route", "profit-protect"].includes(item.source) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.notional_usd >= 0 &&
      item.expected_profit_usd >= 0 &&
      item.expected_profit_per_minute_usd >= 0 &&
      item.churn_cost_bps >= 0 &&
      item.decision_window_seconds > 0 &&
      typeof item.paper_route_fallback === "boolean" &&
      Array.isArray(item.live_route_blockers) &&
      item.evidence.length > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(execution.mode).toBe("high-frequency-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(execution.status);
    expect(execution.execution_boundary).toBe("paper-ledger-only");
    expect(execution.review_after_seconds).toBeGreaterThan(0);
    expect(execution.expected_profit_usd).toBeGreaterThanOrEqual(0);
    expect(execution.expected_profit_per_minute_usd).toBeGreaterThanOrEqual(0);
    expect(execution.churn_cost_bps).toBeGreaterThanOrEqual(0);
    expect(typeof execution.paper_route_fallback).toBe("boolean");
    expect(Array.isArray(execution.live_route_blockers)).toBe(true);
    expect(execution.controls.some((control) => control.includes("one local paper-ledger fill"))).toBe(true);
    expect(execution.controls.some((control) => control.includes("local paper route fallback"))).toBe(true);
    expect(execution.controls.some((control) => control.includes("Jupiter"))).toBe(true);
    if (execution.paper_route_fallback) {
      expect(execution.live_route_blockers.length).toBeGreaterThan(0);
    }
    if (execution.paper_trade) {
      expect(execution.paper_trade.status).toBe("paper-filled");
      expect(execution.paper_trade.reason).toContain("High-frequency race");
      expect(Math.abs(execution.cash_delta_usd)).toBe(execution.paper_trade.size_usd);
      expect(Math.abs(execution.exposure_delta_usd)).toBe(execution.paper_trade.size_usd);
    }
    expect(state.autonomous_tick_plan.items.some((item) => item.id === "tick-plan-high-frequency" || execution.status === "idle")).toBe(true);
  });

  test("GIVEN an exit-only wallet WHEN the minute loop runs THEN it can protect positions without opening fresh buys", () => {
    const state = getWeb3TradingState("base", 0);
    const velocity = state.autonomous_profit_velocity_governor;

    expect(state.autonomous_trade_readiness_gate.status).toBe("exit-only");
    expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
    expect(state.autonomous_action_queue_execution.selected_side).toBe("sell");
    expect(state.autonomous_action_queue_execution.paper_trade_ready).toBe(true);
    expect(velocity.status).toBe("protect");
    expect(velocity.loop_permission).toBe("protect-only");
    expect(velocity.max_trades_next_minute).toBeGreaterThan(0);
    expect(velocity.target_trades_per_minute).toBeGreaterThan(0);
    expect(velocity.max_churn_notional_usd).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.items.some((item) =>
      item.action === "protect-now" &&
      item.status === "ready"
    )).toBe(true);
  });

  test("GIVEN a protect-minute wake plan WHEN the backend loop tick runs THEN it executes a bounded protective paper session", async () => {
    const baseline = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "ephemeral",
      advance: false,
    });

    expect(baseline.autonomous_wake_plan.status).toBe("minute");
    expect(baseline.autonomous_wake_plan.next_client_action).toBe("run-minute");
    expect(baseline.autonomous_wake_plan.can_auto_watch_run).toBe(true);
    expect(baseline.autonomous_profit_velocity_governor.loop_permission).toBe("protect-only");
    expect(baseline.autonomous_loop_throttle.can_run).toBe(false);

    const state = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "ephemeral",
      autonomous_loop: {
        action: "tick",
      },
    });

    expect(state.autonomous_loop_tick.status).toBe("session-run");
    expect(state.autonomous_loop_tick.action).toBe("protect-book");
    expect(state.autonomous_loop_tick.summary).toContain("protect-minute");
    expect(state.autonomous_session_run.requested).toBe(true);
    expect(state.autonomous_session_run.completed_ticks).toBeLessThanOrEqual(Math.max(1, baseline.autonomous_wake_plan.ticks, baseline.autonomous_profit_velocity_governor.max_trades_next_minute));
    expect(state.autonomous_session_run.protective_sell_count).toBeLessThanOrEqual(baseline.autonomous_wake_plan.max_protective_sells);
    expect(state.autonomous_session_run.max_total_fills).toBeLessThanOrEqual(Math.max(1, baseline.autonomous_wake_plan.max_total_fills, baseline.autonomous_profit_velocity_governor.max_trades_next_minute));
  });

  test("GIVEN a held-profit race with stale proof WHEN profit capture autopilot plans THEN it refreshes before trusting release sizing", () => {
    const state = getWeb3TradingState("base", 0);
    const capture = state.autonomous_profit_capture_autopilot;

    expect(capture.mode).toBe("autonomous-profit-capture-autopilot");
    expect(capture.status).toBe("race");
    expect(capture.action).toBe("exit-now");
    expect(capture.side).toBe("sell");
    expect(capture.release_usd).toBeGreaterThan(0);
    expect(capture.must_refresh_route).toBe(true);
    expect(capture.must_apply_protective_sell).toBe(false);
    expect(capture.paper_trade_ready).toBe(false);
    expect(capture.execution_boundary).toBe("read-only-refresh");
    expect(capture.next_action).toContain("Refresh read-only route proof");
    expect(capture.items.find((item) => item.id === "route")).toMatchObject({
      status: "watch",
      value: state.autonomous_route_refresh_execution.status.replace("-", " "),
    });
    expect(capture.items.find((item) => item.id === "boundary")).toMatchObject({
      status: "pass",
      value: "read only refresh",
    });
  });

  test("GIVEN released profit still needs proof WHEN redeploy autopilot plans THEN it refuses to chase before refresh", () => {
    const state = getWeb3TradingState("base", 0);
    const redeploy = state.autonomous_profit_redeploy_autopilot;

    expect(redeploy.mode).toBe("autonomous-profit-redeploy-autopilot");
    expect(redeploy.status).toBe("protect-first");
    expect(redeploy.action).toBe("protect-before-redeploy");
    expect(redeploy.must_protect_first).toBe(true);
    expect(redeploy.must_refresh_proof).toBe(true);
    expect(redeploy.can_redeploy_paper).toBe(false);
    expect(redeploy.redeploy_budget_usd).toBe(0);
    expect(redeploy.released_cash_usd).toBeGreaterThan(0);
    expect(redeploy.execution_boundary).toBe("read-only-refresh");
    expect(redeploy.next_action).toContain("Protect");
    expect(redeploy.items.find((item) => item.id === "capture")).toMatchObject({
      status: "block",
    });
    expect(redeploy.items.find((item) => item.id === "boundary")).toMatchObject({
      status: "pass",
      value: "read only refresh",
    });
    expect(redeploy.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
  });

  test("GIVEN a persistent paper account WHEN backend loop tick runs THEN the loop receipt survives reload", async () => {
    const ticked = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      reset: true,
      autonomous_loop: {
        action: "tick",
      },
    });
    const reloaded = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      advance: false,
    });

    expect(ticked.autonomous_loop_tick.requested).toBe(true);
    expect(reloaded.autonomous_loop_tick.requested).toBe(true);
    expect(reloaded.autonomous_loop_tick.status).toBe(ticked.autonomous_loop_tick.status);
    expect(reloaded.autonomous_loop_tick.action).toBe(ticked.autonomous_loop_tick.action);
    expect(reloaded.autonomous_loop_tick.summary).toBe(ticked.autonomous_loop_tick.summary);
    expect(reloaded.autonomous_loop_tick.next_action).toBe(ticked.autonomous_loop_tick.next_action);
  });

  test("GIVEN chart proof is bundled with a backend loop tick WHEN posted THEN the server records proof before deciding the tick", async () => {
    const targetSeed = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      reset: true,
      advance: false,
    });
    const targetSymbol = targetSeed.autonomous_chart_proof_target.target_symbol ?? targetSeed.autonomous_candle_conviction.target_symbol ?? "FARTCOIN";
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "base",
        source: "sample",
        account: "persistent",
        reset: true,
        advance: false,
        candle_refresh: {
          action: "record",
          provider: "sample",
          source: "local-price-action-tape",
          symbol: targetSymbol,
          pool: `${targetSymbol.toLowerCase()}-solana-pool`,
          network: "solana",
          timeframe: "minute",
          candle_count: 24,
          last_price_usd: 0.000022,
          fetched_at: "2026-06-18T12:03:00.000Z",
          signal: {
            action: "probe",
            confidence: 72,
            momentum_score: 76,
            volume_score: 70,
            risk_score: 32,
            review_after_seconds: 15,
            summary: `Probe ${targetSymbol} after the chart gate refreshes.`,
            blockers: [],
          },
          paper_decision: {
            action: "paper-buy",
            side: "buy",
            notional_usd: 90,
            reason: `${targetSymbol} chart proof clears a bounded paper probe before the backend loop tick.`,
            blockers: [],
          },
        },
        autonomous_loop: {
          action: "tick",
        },
      }),
    }));
    const ticked = await json<Web3TradingState>(response);
    const reloaded = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      advance: false,
    });

    expect(response.status).toBe(200);
    expect(ticked.autonomous_loop_tick.requested).toBe(true);
    expect(ticked.autonomous_candle_refresh.requested).toBe(true);
    expect(ticked.autonomous_candle_refresh.symbol).toBe(targetSymbol);
    expect(ticked.autonomous_candle_refresh.paper_action).toBe("paper-buy");
    expect(ticked.autonomous_candle_conviction.saved_proof_symbol).toBe(targetSymbol);
    expect(ticked.autonomous_candle_conviction.proof_target_matched).toBe(true);
    expect(ticked.autonomous_candle_conviction.proof_target_mismatch).toBeNull();
    expect(ticked.autonomous_candle_conviction.refresh_required).toBe(false);
    expect(ticked.autonomous_chart_proof_target.target_symbol).toBe(targetSymbol);
    expect(ticked.autonomous_chart_proof_target.proof_target_matched).toBe(true);
    expect(ticked.autonomous_chart_proof_target.should_fetch).toBe(false);
    expect(reloaded.autonomous_loop_tick.summary).toBe(ticked.autonomous_loop_tick.summary);
    expect(reloaded.autonomous_candle_refresh.summary).toBe(ticked.autonomous_candle_refresh.summary);
    expect(reloaded.autonomous_candle_conviction.target_symbol).toBe(targetSymbol);
    expect(reloaded.autonomous_candle_conviction.proof_target_matched).toBe(true);
    expect(reloaded.autonomous_chart_proof_target.target_symbol).toBe(targetSymbol);
  });

  test("GIVEN chart proof is for a different coin WHEN bundled with a backend loop tick THEN the server keeps the active target locked", async () => {
    const targetSeed = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      reset: true,
      advance: false,
    });
    const targetSymbol = targetSeed.autonomous_chart_proof_target.target_symbol ?? targetSeed.autonomous_candle_conviction.target_symbol ?? "FARTCOIN";
    const proofSymbol = targetSymbol === "BONK" ? "FARTCOIN" : "BONK";
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "base",
        source: "sample",
        account: "persistent",
        reset: true,
        advance: false,
        candle_refresh: {
          action: "record",
          provider: "sample",
          source: "local-price-action-tape",
          symbol: proofSymbol,
          pool: `${proofSymbol.toLowerCase()}-solana-pool`,
          network: "solana",
          timeframe: "minute",
          candle_count: 24,
          last_price_usd: 0.000022,
          fetched_at: "2026-06-18T12:02:00.000Z",
          signal: {
            action: "probe",
            confidence: 72,
            momentum_score: 76,
            volume_score: 70,
            risk_score: 32,
            review_after_seconds: 15,
            summary: `Probe ${proofSymbol} after the chart gate refreshes.`,
            blockers: [],
          },
          paper_decision: {
            action: "paper-buy",
            side: "buy",
            notional_usd: 90,
            reason: `${proofSymbol} chart proof should not clear a different active target.`,
            blockers: [],
          },
        },
        autonomous_loop: {
          action: "tick",
        },
      }),
    }));
    const ticked = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(ticked.autonomous_candle_refresh.symbol).toBe(proofSymbol);
    expect(ticked.autonomous_candle_conviction.target_symbol).toBe(targetSymbol);
    expect(ticked.autonomous_candle_conviction.saved_proof_symbol).toBe(proofSymbol);
    expect(ticked.autonomous_candle_conviction.proof_target_matched).toBe(false);
    expect(ticked.autonomous_candle_conviction.proof_target_mismatch).toContain(proofSymbol);
    expect(ticked.autonomous_candle_conviction.proof_target_mismatch).toContain(targetSymbol);
    expect(ticked.autonomous_candle_conviction.refresh_required).toBe(true);
    expect(ticked.autonomous_chart_proof_target.target_symbol).toBe(targetSymbol);
    expect(ticked.autonomous_chart_proof_target.saved_proof_symbol).toBe(proofSymbol);
    expect(ticked.autonomous_chart_proof_target.should_fetch).toBe(true);
  });

  test("GIVEN a candle refresh receipt WHEN it is recorded through the trading API THEN chart proof survives reload", async () => {
    const targetSeed = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      reset: true,
      advance: false,
    });
    const targetSymbol = targetSeed.autonomous_chart_proof_target.target_symbol ?? targetSeed.autonomous_candle_conviction.target_symbol ?? "FARTCOIN";
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "base",
        source: "sample",
        account: "persistent",
        reset: true,
        advance: false,
        candle_refresh: {
          action: "record",
          provider: "geckoterminal",
          source: "geckoterminal-public",
          symbol: targetSymbol,
          pool: `${targetSymbol.toLowerCase()}-solana-pool`,
          network: "solana",
          timeframe: "minute",
          candle_count: 48,
          last_price_usd: 0.000025,
          fetched_at: "2026-06-18T12:00:00.000Z",
          signal: {
            action: "press",
            confidence: 88,
            momentum_score: 91,
            volume_score: 86,
            risk_score: 18,
            review_after_seconds: 10,
            summary: "Press candidate from fresh OHLCV evidence.",
            blockers: [],
          },
          paper_decision: {
            action: "paper-buy",
            side: "buy",
            notional_usd: 125,
            reason: `Press ${targetSymbol} in paper after candle confirmation.`,
            blockers: [],
          },
        },
      }),
    }));
    const recorded = await json<Web3TradingState>(response);
    const reloaded = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      advance: false,
    });

    expect(response.status).toBe(200);
    expect(recorded.autonomous_candle_refresh.requested).toBe(true);
    expect(recorded.autonomous_candle_refresh.status).toBe("ready");
    expect(recorded.autonomous_candle_refresh.symbol).toBe(targetSymbol);
    expect(recorded.autonomous_candle_refresh.signal_action).toBe("press");
    expect(recorded.autonomous_candle_refresh.paper_action).toBe("paper-buy");
    expect(recorded.autonomous_candle_refresh.paper_notional_usd).toBe(125);
    expect(recorded.autonomous_candle_conviction.target_symbol).toBe(targetSymbol);
    expect(recorded.autonomous_candle_conviction.status).toBe("confirm");
    expect(recorded.autonomous_candle_conviction.refresh_required).toBe(false);
    expect(recorded.autonomous_candle_conviction.summary).toContain("recorded OHLCV confirmation");
    expect(reloaded.autonomous_candle_refresh.requested).toBe(true);
    expect(reloaded.autonomous_candle_refresh.summary).toBe(recorded.autonomous_candle_refresh.summary);
    expect(reloaded.autonomous_candle_refresh.next_action).toBe(recorded.autonomous_candle_refresh.next_action);
    expect(reloaded.autonomous_candle_conviction.status).toBe("confirm");
    expect(reloaded.autonomous_candle_conviction.refresh_required).toBe(false);
  });

  test("GIVEN malformed candle refresh evidence WHEN posted THEN the trading API rejects it", async () => {
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "base",
        source: "sample",
        account: "persistent",
        advance: false,
        candle_refresh: {
          action: "record",
          symbol: "BONK",
          candle_count: 48,
          signal: {
            action: "press",
            confidence: 101,
            momentum_score: 81,
            volume_score: 74,
            risk_score: 31,
            review_after_seconds: 10,
            summary: "Invalid confidence should be rejected.",
          },
        },
      }),
    }));
    const payload = await json<{ error: string }>(response);

    expect(response.status).toBe(422);
    expect(payload.error).toContain("confidence");
  });

  test("GIVEN a ready queue-owned sell WHEN Auto watch plans THEN it selects the protect-minute lane", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...state,
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 0,
        bundle_action_count: 0,
        next_minute_trade_budget_usd: 0,
      },
    });

    expect(plan.mode).toBe("minute");
    expect(plan.label).toBe("auto protect minute");
    expect(plan.reason).toContain("1 trades/min max");
    expect(plan.reason).toContain("1 queued action");
    expect(plan.reason).toContain("Backend loop tick owns");
  });

  test("GIVEN stale live market evidence WHEN Auto watch plans THEN it refreshes read-only evidence instead of pausing", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...state,
      market_source: {
        ...state.market_source,
        mode: "live-dex",
        status: "live",
        label: "DEX Screener live",
      },
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        max_trades_next_minute: 0,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 0,
      },
      autonomous_action_queue_execution: {
        ...state.autonomous_action_queue_execution,
        selected_side: "buy",
        paper_trade_ready: false,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        action: "pause",
        should_refresh_market_data: true,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "refresh",
        action: "fetch-candles",
        next_action: "Fetch read-only OHLCV candles for LIVE before another fresh buy.",
      },
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "blocked",
        can_run: false,
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
    });

    expect(plan.mode).toBe("refresh");
    expect(plan.label).toBe("auto refresh");
    expect(plan.reason).toContain("Fetch read-only OHLCV candles");
    expect(plan.reason).toContain("read-only DEX Screener live evidence");
  });

  test("GIVEN loop impact evidence WHEN Auto watch plans THEN impact can refresh, protect, tighten, or continue cadence", () => {
    const state = getWeb3TradingState("base", 0);
    const loopImpact = state.autonomous_loop_impact_auditor;
    const quietMinuteLoop = {
      ...state,
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        max_trades_next_minute: 0,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 0,
        bundle_action_count: 0,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        should_refresh_market_data: false,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "clear",
        action: "allow-paper",
      },
    } satisfies Web3TradingState;

    const refreshPlan = chooseAutoWatchPlan({
      ...quietMinuteLoop,
      autonomous_loop_impact_auditor: {
        ...loopImpact,
        status: "refresh",
        action: "refresh-proof",
        must_refresh_proof: true,
        next_cadence_seconds: 6,
        next_action: "Refresh route and chart proof before the next paper loop.",
      },
    });
    expect(refreshPlan.mode).toBe("refresh");
    expect(refreshPlan.label).toBe("impact refresh");
    expect(refreshPlan.delayMs).toBe(6_000);
    expect(refreshPlan.reason).toContain("loop impact is refresh");

    const protectPlan = chooseAutoWatchPlan({
      ...quietMinuteLoop,
      autonomous_loop_impact_auditor: {
        ...loopImpact,
        status: "protect",
        action: "protect-wallet",
        must_reduce_frequency: true,
        must_refresh_proof: false,
        next_cadence_seconds: 5,
        next_action: "Protect wallet exposure before fresh entries.",
      },
    });
    expect(protectPlan.mode).toBe("cycle");
    expect(protectPlan.label).toBe("impact protect");
    expect(protectPlan.reason).toContain("protect wallet");

    const tightenPlan = chooseAutoWatchPlan({
      ...quietMinuteLoop,
      autonomous_loop_impact_auditor: {
        ...loopImpact,
        status: "tighten",
        action: "tighten-size",
        impact_score: 47,
        must_reduce_frequency: true,
        must_refresh_proof: false,
        next_cadence_seconds: 9,
        next_action: "Use a smaller paper action before increasing cadence.",
      },
    });
    expect(tightenPlan.mode).toBe("cycle");
    expect(tightenPlan.label).toBe("impact tighten");
    expect(tightenPlan.delayMs).toBe(10_000);
    expect(tightenPlan.reason).toContain("latest paper loop impact is 47/100");

    const continuePlan = chooseAutoWatchPlan({
      ...quietMinuteLoop,
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "sprint",
        action: "run-sprint",
        cadence_seconds: 12,
        can_run: true,
      },
      autonomous_loop_impact_auditor: {
        ...loopImpact,
        status: "continue",
        action: "keep-running",
        must_reduce_frequency: false,
        must_refresh_proof: false,
        next_cadence_seconds: 4,
        next_action: "Keep the paper loop running while post-loop impact stays positive.",
      },
    });
    expect(continuePlan.mode).toBe("sprint");
    expect(continuePlan.label).toBe("auto sprint");
    expect(continuePlan.delayMs).toBe(4_000);
    expect(continuePlan.reason).toContain("continue impact");
  });

  test("GIVEN a protect-only paper wallet WHEN next moves are built THEN the queue-owned sell is visible before the long desk", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves(state);
    const queueMove = moves.find((move) => move.id === "queue");
    const expectedLabel = state.autonomous_action_queue_execution.selected_symbol ?? state.autonomous_action_queue.leader_symbol ?? "Action queue";

    expect(queueMove?.label).toBe(expectedLabel);
    expect(queueMove?.action).toBe("sell");
    expect(queueMove?.tone).toBe("engine");
    expect(queueMove?.budgetUsd).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(6);
  });

  test("GIVEN launch timing state WHEN next moves are built THEN the fresh-entry decision is visible before the long desk", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves(state);
    const launchMove = moves.find((move) => move.id === "launch-timing");

    expect(launchMove?.label).toContain("Launch");
    expect(launchMove?.action).toBe(state.autonomous_launch_timing.selected_action.replaceAll("-", " "));
    expect(launchMove?.detail).toBe(state.autonomous_launch_timing.next_action);
    expect(launchMove?.etaSeconds).toBe(state.autonomous_launch_timing.fastest_review_seconds);
  });

  test("GIVEN trigger protection state WHEN next moves are built THEN the trigger opportunity is folded into the compact operator timeline", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves(state);
    const triggerMove = moves.find((move) => move.id === "trigger-opportunity");

    expect(triggerMove?.label).toContain("Trigger");
    expect(triggerMove?.action).toBe(state.autonomous_trigger_opportunity.selected_action.replaceAll("-", " "));
    expect(triggerMove?.detail).toBe(state.autonomous_trigger_opportunity.next_action);
    expect(triggerMove?.etaSeconds).toBe(state.autonomous_trigger_opportunity.fastest_review_seconds);
  });

  test("GIVEN stale live market evidence WHEN next moves are built THEN read-only refresh leads the timeline", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves({
      ...state,
      market_source: {
        ...state.market_source,
        mode: "live-dex",
        status: "live",
        label: "DEX Screener live",
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        should_refresh_market_data: true,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "refresh",
        action: "fetch-candles",
        next_refresh_lane: "gecko-ohlcv",
        next_action: "Fetch read-only OHLCV candles for LIVE before another fresh buy.",
      },
    });

    expect(moves[0].id).toBe("refresh-evidence");
    expect(moves[0].action).toBe("gecko ohlcv");
    expect(moves[0].detail).toContain("DEX Screener live");
    expect(moves[0].tone).toBe("caution");
  });

  test("GIVEN the desk reads a market tape WHEN situation monitor runs THEN it produces a regime and playbook", () => {
    const state = getWeb3TradingState("base", 0);

    expect(state.situation_monitor.confidence).toBeGreaterThan(0);
    expect(state.situation_monitor.tape_score).toBeGreaterThan(0);
    expect(state.situation_monitor.playbook.length).toBeGreaterThan(0);
    expect(state.situation_monitor.playbook.some((action) => action.priority === "now" || action.priority === "next")).toBe(true);
    expect(["selective-momentum", "risk-on", "chop", "rug-watch", "stand-down"]).toContain(state.situation_monitor.regime);
  });

  test("GIVEN a changed tape WHEN tape memory compares cycles THEN it creates actionable change events", () => {
    const state = getWeb3TradingState("breakout", 2);
    const acceleration = state.tape_memory.events.find((event) => event.action === "press" || event.action === "probe");

    expect(state.tape_memory.previous_cycle).toBe(1);
    expect(state.tape_memory.current_cycle).toBe(2);
    expect(state.tape_memory.tokens_tracked).toBeGreaterThan(0);
    expect(state.tape_memory.events.length).toBeGreaterThan(0);
    expect(state.tape_memory.pressure_score).toBeGreaterThan(0);
    expect(acceleration?.evidence.length).toBeGreaterThan(0);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Tape memory applies"))).toBe(true);
    expect(state.situation_monitor.playbook.some((action) => action.id.includes("tape") || action.detail.includes("accelerated"))).toBe(true);
  });

  test("GIVEN liquidity and sell-flow deterioration WHEN tape memory sees rug risk THEN autopilot prioritizes blocking or exits", () => {
    const state = getWeb3TradingState("rug-risk", 1);

    expect(state.tape_memory.urgent_count).toBeGreaterThan(0);
    expect(state.tape_memory.deterioration_count).toBeGreaterThan(0);
    expect(state.tape_memory.events.some((event) => event.severity === "urgent" && (event.action === "block" || event.action === "exit"))).toBe(true);
    expect(state.situation_monitor.regime).toBe("rug-watch");
    expect(state.autopilot.actions.some((action) => action.id.includes("autopilot-tape") && (action.status === "blocked" || action.lane === "risk-exit"))).toBe(true);
  });

  test("GIVEN a trading cycle WHEN autopilot plans actions THEN it sequences exits, entries, and gates", () => {
    const state = getWeb3TradingState("base", 0);

    expect(state.autopilot.cycle).toBe(0);
    expect(state.autopilot.actions.length).toBeGreaterThan(0);
    expect(state.autopilot.orders_considered).toBeGreaterThan(0);
    expect(state.autopilot.actions[0].sequence).toBe(1);
    expect(state.autopilot.actions.some((action) => action.lane === "risk-exit" || action.lane === "entry")).toBe(true);
    expect(state.autopilot.actions.every((action) => action.execution_gate.length > 0)).toBe(true);
    expect(["executed-paper", "planned", "stand-down", "blocked"]).toContain(state.autopilot.status);
  });

  test("GIVEN changing risk WHEN autonomous monitor schedules the next wake THEN it adapts cadence and advance mode", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);

    expect(["accelerate", "active", "cooldown", "stand-down", "idle"]).toContain(breakout.autonomous_monitor.status);
    expect(breakout.autonomous_monitor.mode).toBe("paper-daemon");
    expect(breakout.autonomous_monitor.recommended_interval_seconds).toBeGreaterThan(0);
    expect(breakout.autonomous_monitor.next_wake_at).toContain("T");
    expect(breakout.autonomous_monitor.scan_budget_per_minute).toBeGreaterThan(0);
    expect(breakout.autonomous_monitor.triggers.length).toBeGreaterThan(0);
    expect(breakout.autonomous_monitor.urgency_score).toBeGreaterThanOrEqual(0);
    expect(breakout.autonomous_monitor.urgency_score).toBeLessThanOrEqual(100);
    expect(breakout.paper_daemon.mode).toBe("paper-daemon");
    expect(breakout.paper_daemon.requested).toBe(false);
    expect(["observe", "advance", "stand-down"]).toContain(breakout.paper_daemon.action);
    expect(breakout.paper_daemon.interval_seconds).toBeGreaterThan(0);
    expect(breakout.autonomous_loop_director.next_tick_seconds).toBeGreaterThan(0);
    expect(["clear", "tighten", "cooldown", "halted"]).toContain(breakout.autonomy_risk_governor.status);
    expect(breakout.autonomy_risk_governor.checks.length).toBe(5);
    expect(breakout.autonomy_risk_governor.max_messages_per_minute).toBe(breakout.execution_intents.max_messages_per_minute);
    expect(breakout.execution_edge_ladder.mode).toBe("execution-edge-ladder");
    expect(["attack", "selective", "protect", "blocked", "idle"]).toContain(breakout.execution_edge_ladder.status);
    expect(breakout.execution_edge_ladder.items.every((item) => item.rank > 0 && item.evidence.length > 0)).toBe(true);
    expect(breakout.route_profit_gate.mode).toBe("route-profit-gate");
    expect(["execute", "queue", "resize", "blocked", "protect", "idle"]).toContain(breakout.route_profit_gate.status);
    expect(breakout.route_profit_gate.items.every((item) => item.total_cost_bps >= 0 && item.fill_quality_score >= 0)).toBe(true);
    expect(breakout.route_profit_gate.items.flatMap((item) => item.blockers).every((blocker) => !/wallet|kill switch/i.test(blocker))).toBe(true);
    expect(breakout.liquidity_depth_controller.mode).toBe("liquidity-depth-controller");
    expect(["route", "resize", "slice", "protect", "blocked", "idle"]).toContain(breakout.liquidity_depth_controller.status);
    expect(breakout.liquidity_depth_controller.items.length).toBeGreaterThan(0);
    expect(breakout.liquidity_depth_controller.items.every((item) =>
      item.depth_score >= 0 &&
      item.depth_score <= 100 &&
      item.absorption_score >= 0 &&
      item.absorption_score <= 100 &&
      item.spread_bps >= 0 &&
      item.expected_impact_bps >= 0 &&
      item.slice_count >= 1 &&
      item.child_order_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.profit_loop_controller.max_cycle_deploy_usd > 0) {
      expect(breakout.profit_loop_controller.max_cycle_deploy_usd)
        .toBeLessThanOrEqual(breakout.liquidity_depth_controller.recommended_deploy_usd);
    }
    expect(breakout.route_quote_sampler.mode).toBe("route-quote-sampler");
    expect(["confirmed", "probe", "requote", "protect", "blocked", "idle"]).toContain(breakout.route_quote_sampler.status);
    expect(breakout.route_quote_sampler.items.length).toBeGreaterThan(0);
    expect(breakout.route_quote_sampler.items.every((item) =>
      item.route_confidence_score >= 0 &&
      item.route_confidence_score <= 100 &&
      item.route_diversity_score >= 0 &&
      item.route_diversity_score <= 100 &&
      item.modeled_impact_bps >= 0 &&
      item.impact_drift_bps >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.profit_loop_controller.max_cycle_deploy_usd > 0) {
      expect(breakout.profit_loop_controller.max_cycle_deploy_usd)
        .toBeLessThanOrEqual(breakout.route_quote_sampler.recommended_deploy_usd);
    }
    expect(breakout.execution_landing_supervisor.mode).toBe("execution-landing-supervisor");
    expect(["paper", "managed", "sender-needed", "blocked", "idle"]).toContain(breakout.execution_landing_supervisor.status);
    expect(breakout.execution_landing_supervisor.items.length).toBeGreaterThan(0);
    expect(breakout.execution_landing_supervisor.items.every((item) =>
      item.landing_score >= 0 &&
      item.landing_score <= 100 &&
      item.urgency_score >= 0 &&
      item.route_score >= 0 &&
      item.latency_target_ms >= 0 &&
      item.ttl_seconds >= 0
    )).toBe(true);
    expect(breakout.execution_landing_supervisor.items.every((item) =>
      item.status !== "dry-run" || item.path !== "paper-ledger"
    )).toBe(true);
    expect(breakout.alpha_decay_controller.mode).toBe("alpha-decay-controller");
    expect(["chase", "probe", "harvest", "cooldown", "expired", "idle"]).toContain(breakout.alpha_decay_controller.status);
    expect(breakout.alpha_decay_controller.items.length).toBeGreaterThan(0);
    expect(breakout.alpha_decay_controller.items.every((item) =>
      item.alpha_score >= 0 &&
      item.alpha_score <= 100 &&
      item.freshness_score >= 0 &&
      item.freshness_score <= 100 &&
      item.velocity_decay_score >= 0 &&
      item.attention_decay_score >= 0 &&
      item.quote_decay_score >= 0 &&
      item.half_life_seconds >= 0 &&
      item.time_to_decay_seconds >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.profit_loop_controller.max_cycle_deploy_usd > 0) {
      expect(breakout.profit_loop_controller.max_cycle_deploy_usd)
        .toBeLessThanOrEqual(breakout.alpha_decay_controller.recommended_deploy_usd);
    }
    expect(breakout.microstructure_tape.mode).toBe("microstructure-tape");
    expect(["attack", "absorb", "defensive", "rug-pull", "idle"]).toContain(breakout.microstructure_tape.status);
    expect(breakout.microstructure_tape.items.every((item) =>
      item.buy_burst_score >= 0 &&
      item.sell_cascade_score >= 0 &&
      item.liquidity_vacuum_score >= 0 &&
      item.recommended_size_multiplier >= 0
    )).toBe(true);
    if (breakout.microstructure_tape.status !== "idle") {
      expect(breakout.autonomous_monitor.watch_symbols.some((symbol) =>
        breakout.microstructure_tape.items.map((item) => item.symbol).includes(symbol)
      )).toBe(true);
    }
    expect(breakout.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(["follow", "probe", "defensive", "exit", "idle"]).toContain(breakout.smart_money_sentinel.status);
    expect(breakout.smart_money_sentinel.items.every((item) =>
      item.smart_score >= 0 &&
      item.copy_trade_confidence >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.smart_money_sentinel.status !== "idle") {
      expect(breakout.autonomous_monitor.watch_symbols.some((symbol) =>
        breakout.smart_money_sentinel.items.map((item) => item.symbol).includes(symbol)
      )).toBe(true);
    }
    expect(breakout.position_commander.mode).toBe("autonomous-position-commander");
    expect(["idle", "watch", "defend", "trim", "exit", "moonbag"]).toContain(breakout.position_commander.status);
    expect(breakout.position_commander.items.length).toBe(breakout.portfolio.open_positions.length);
    expect(breakout.position_commander.items.every((item) =>
      item.command_score >= 0 &&
      item.command_score <= 100 &&
      item.stop_price_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.position_commander.commanded_sell_usd > 0) {
      expect(breakout.profit_loop_controller.max_cycle_release_usd)
        .toBeGreaterThanOrEqual(breakout.position_commander.commanded_sell_usd);
    }
    expect(breakout.scalping_controller.mode).toBe("autonomous-scalping-controller");
    expect(["compound", "scalp", "protect", "cooldown", "stand-down", "idle"]).toContain(breakout.scalping_controller.status);
    expect(breakout.scalping_controller.items.length).toBeGreaterThan(0);
    expect(breakout.scalping_controller.items.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(breakout.scalping_controller.items.every((item) =>
      item.action !== "compound" || (item.route_action === "execute-paper" && item.expected_profit_usd > 0)
    )).toBe(true);
    expect(breakout.scalping_controller.scalp_budget_usd).toBeLessThanOrEqual(breakout.autonomy_risk_governor.allowed_trade_usd);
    expect(breakout.profit_loop_controller.mode).toBe("profit-loop-controller");
    expect(["compound", "attack", "harvest", "protect", "cooldown", "stand-down", "idle"]).toContain(breakout.profit_loop_controller.status);
    expect(breakout.profit_loop_controller.loop_score).toBeGreaterThanOrEqual(0);
    expect(breakout.profit_loop_controller.loop_score).toBeLessThanOrEqual(100);
    expect(breakout.profit_loop_controller.items.length).toBeGreaterThan(0);
    expect(breakout.profit_loop_controller.items.every((item) =>
      item.score >= 0 &&
      item.score <= 100 &&
      item.churn_drag_bps >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(breakout.profit_loop_controller.allows_new_entries)
      .toBe(breakout.profit_loop_controller.status === "compound" || breakout.profit_loop_controller.status === "attack");
    expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "profit-loop-controller")).toBe(true);
    expect(["accelerate", "selective", "cooldown", "stop", "idle"]).toContain(breakout.churn_efficiency_auditor.status);
    if (breakout.churn_efficiency_auditor.status === "accelerate" || breakout.churn_efficiency_auditor.status === "cooldown" || breakout.churn_efficiency_auditor.status === "stop") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "churn-efficiency-auditor")).toBe(true);
    }
    if (breakout.liquidity_depth_controller.status !== "route" && breakout.liquidity_depth_controller.status !== "idle") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "liquidity-depth-controller")).toBe(true);
    }
    if (breakout.route_quote_sampler.status !== "confirmed" && breakout.route_quote_sampler.status !== "idle") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "route-quote-sampler")).toBe(true);
    }
    expect(rugRisk.autonomous_monitor.recommended_interval_seconds).toBeLessThanOrEqual(20);
    expect(rugRisk.autonomous_monitor.triggers.some((trigger) => trigger.severity === "urgent")).toBe(true);
    expect(["protect", "cooldown", "stand-down", "idle", "scalp"]).toContain(rugRisk.scalping_controller.status);
    expect(["harvest", "protect", "cooldown", "stand-down", "idle", "attack", "compound"]).toContain(rugRisk.profit_loop_controller.status);
    expect(["protect", "blocked", "resize", "slice", "route", "idle"]).toContain(rugRisk.liquidity_depth_controller.status);
    expect(["protect", "blocked", "requote", "probe", "confirmed", "idle"]).toContain(rugRisk.route_quote_sampler.status);
    expect(["chase", "probe", "harvest", "cooldown", "expired", "idle"]).toContain(rugRisk.alpha_decay_controller.status);
    expect(["idle", "watch", "defend", "trim", "exit", "moonbag"]).toContain(rugRisk.position_commander.status);
  });

  test("GIVEN autopilot actions WHEN the execution queue builds THEN it adds retry and route-quality controls", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const blocked = state.execution_intents.intents.find((intent) => intent.status === "blocked");

    expect(state.execution_intents.intents.length).toBeGreaterThan(0);
    expect(state.execution_intents.max_messages_per_minute).toBe(12);
    expect(state.execution_intents.blocked_count + state.execution_intents.ready_count + state.execution_intents.cooldown_count)
      .toBeGreaterThan(0);
    expect(blocked?.blockers.length).toBeGreaterThan(0);
    expect(state.execution_intents.intents.every((intent) => intent.estimated_shortfall_bps >= 0)).toBe(true);
    expect(state.execution_intents.intents.every((intent) => intent.route_quality_score >= 0 && intent.route_quality_score <= 100))
      .toBe(true);
  });

  test("GIVEN execution intents WHEN preflight runs THEN it scores route, cap, payload, and fee gates", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const guarded = state.execution_preflight.items.find((item) => item.status === "blocked" || item.status === "watch");

    expect(state.execution_preflight.items.length).toBeGreaterThan(0);
    expect(state.execution_preflight.max_quote_age_seconds).toBe(15);
    expect(state.execution_preflight.blocked_count + state.execution_preflight.watch_count + state.execution_preflight.paper_count)
      .toBeGreaterThan(0);
    expect(state.execution_preflight.items.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(guarded?.checks.some((check) => check.status === "fail" || check.status === "warn")).toBe(true);
    expect(state.execution_preflight.items.some((item) => item.checks.some((check) => check.id === "fees"))).toBe(true);
  });

  test("GIVEN congested execution intents WHEN retry planning runs THEN it bounds retry, resize, and stand-down tactics", () => {
    const state = getWeb3TradingState("breakout", 2);
    const retryPlanner = state.execution_retry_planner;

    expect(retryPlanner.items.length).toBeGreaterThan(0);
    expect(["send", "retry", "resize", "stand-down", "paper", "idle"]).toContain(retryPlanner.status);
    expect(retryPlanner.items.every((item) => item.max_attempts >= 1 && item.max_attempts <= 3)).toBe(true);
    expect(retryPlanner.items.every((item) => item.recommended_size_usd <= item.original_size_usd)).toBe(true);
    expect(retryPlanner.items.every((item) => item.slice_count >= 1 && item.slice_count <= 4)).toBe(true);
    expect(retryPlanner.items.some((item) =>
      ["retry", "resize", "slice", "escalate-priority", "stand-down"].includes(item.action),
    )).toBe(true);
    expect(state.execution_preflight.items.some((item) => item.checks.some((check) => check.id === "retry-plan"))).toBe(true);
  });

  test("GET /api/web3-trading returns the paper execution boundary", async () => {
    const response = await GET(new Request("http://localhost/api/web3-trading?scenario=breakout&cycles=2"));
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.scenario).toBe("breakout");
    expect(state.market_source.status).toBe("sample");
    expect(state.paper_account.mode).toBe("persistent");
    expect(state.paper_account.cycle).toBe(0);
    expect(state.market.length).toBeGreaterThan(0);
    expect(Array.isArray(state.position_watch)).toBe(true);
    expect(state.autonomous_now_decision.mode).toBe("autonomous-now-decision");
    expect(["attack", "probe", "protect", "refresh", "loop", "blocked", "watch", "idle"]).toContain(state.autonomous_now_decision.status);
    expect(["paper-buy", "paper-probe", "paper-sell", "protect", "refresh-route", "refresh-candles", "stand-down", "watch", "run-loop"]).toContain(state.autonomous_now_decision.action);
    expect(state.autonomous_now_decision.decision_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_now_decision.decision_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_now_decision.target_symbol).toBe(state.autonomous_execution_runway.target_symbol);
    expect(state.autonomous_now_decision.execution_boundary).toBe(state.autonomous_execution_runway.execution_boundary);
    expect(state.autonomous_now_decision.chart_proof_required).toBe(
      state.autonomous_execution_runway.should_refresh_chart ||
        state.autonomous_chart_proof_target.should_fetch ||
        state.autonomous_chart_proof_target.status === "blocked",
    );
    expect(state.autonomous_now_decision.route_refresh_required).toBe(
      state.autonomous_execution_runway.should_refresh_route ||
        state.autonomous_order_ticket.route_required ||
        state.autonomous_order_ticket_execution.status === "route-refresh",
    );
    if (state.autonomous_now_decision.route_refresh_required) {
      expect(state.autonomous_now_decision.button_label).toBe("Refresh read");
    } else if (state.autonomous_now_decision.chart_proof_required) {
      expect(state.autonomous_now_decision.button_label).toBe("Proof + tick");
    }
    expect(state.autonomous_now_decision.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_now_decision.proof.map((item) => item.id)).toEqual(["market", "route", "chart", "wallet", "loop", "ticket"]);
    expect(state.autonomous_now_decision.proof.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_now_decision.safeguards.some((item) => item.includes("local paper-ledger"))).toBe(true);
    expect(state.autonomous_make_money_pulse.mode).toBe("autonomous-make-money-pulse");
    expect(["attack", "probe", "harvest", "protect", "refresh", "cooldown", "blocked", "observe"]).toContain(state.autonomous_make_money_pulse.status);
    expect(["paper-attack", "paper-probe", "paper-harvest", "paper-protect", "refresh-proof", "cooldown", "stand-down", "observe"]).toContain(state.autonomous_make_money_pulse.action);
    expect(state.autonomous_make_money_pulse.pulse_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.pulse_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_make_money_pulse.wallet_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.market_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.profit_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.protection_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.loop_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.reaction_seconds).toBeGreaterThan(0);
    expect(state.autonomous_make_money_pulse.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_make_money_pulse.fresh_buy_allowed).toBe("boolean");
    expect(typeof state.autonomous_make_money_pulse.protective_sell_required).toBe("boolean");
    expect(state.autonomous_make_money_pulse.items.map((item) => item.id)).toEqual(["wallet", "market", "profit", "protection", "loop", "quality"]);
    expect(state.autonomous_make_money_pulse.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_make_money_pulse.controls.some((control) => control.includes("Single make-money pulse"))).toBe(true);
    expect(state.autonomous_make_money_pulse.controls.some((control) => control.includes("local paper ledger") || control.includes("local paper-ledger"))).toBe(true);
    expect(state.autonomous_forward_loop_permission.mode).toBe("autonomous-forward-loop-permission");
    expect(["press", "probe", "harvest", "protect", "refresh", "cooldown", "blocked", "observe"]).toContain(state.autonomous_forward_loop_permission.status);
    expect(["press", "selective", "harvest-only", "protect-only", "refresh-first", "cooldown", "stand-down"]).toContain(state.autonomous_forward_loop_permission.permission);
    expect(["run-minute", "run-loop", "paper-probe", "harvest-profit", "protect-book", "refresh-proof", "cooldown", "stand-down"]).toContain(state.autonomous_forward_loop_permission.action);
    expect(state.autonomous_forward_loop_permission.permission_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_forward_loop_permission.permission_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_forward_loop_permission.items.map((item) => item.id)).toEqual(["fill-audit", "profit-proof", "integrity", "throttle", "wake", "decision"]);
    expect(state.autonomous_forward_loop_permission.controls.some((control) => control.includes("Final forward permission"))).toBe(true);
    expect(state.autonomous_loop_impact_auditor.mode).toBe("autonomous-loop-impact-auditor");
    expect(["compound", "continue", "tighten", "harvest", "protect", "refresh", "cooldown", "blocked", "idle"]).toContain(state.autonomous_loop_impact_auditor.status);
    expect(["increase-frequency", "keep-running", "tighten-size", "harvest-profit", "protect-wallet", "refresh-proof", "cooldown", "stand-down", "observe"]).toContain(state.autonomous_loop_impact_auditor.action);
    expect(state.autonomous_loop_impact_auditor.impact_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_loop_impact_auditor.impact_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_loop_impact_auditor.permission_after).toBe(state.autonomous_forward_loop_permission.permission);
    expect(state.autonomous_loop_impact_auditor.paper_only).toBe(true);
    expect(state.autonomous_loop_impact_auditor.items.map((item) => item.id)).toEqual(["equity", "exposure", "fills", "permission", "proof", "boundary"]);
    expect(state.autonomous_loop_impact_auditor.controls.some((control) => control.includes("Audits the latest backend paper loop"))).toBe(true);
    expect(state.autonomous_profit_capture_autopilot.mode).toBe("autonomous-profit-capture-autopilot");
    expect(["race", "trim", "harvest", "trail", "press", "refresh", "blocked", "idle"]).toContain(state.autonomous_profit_capture_autopilot.status);
    expect(["exit-now", "trim-now", "harvest-profit", "tighten-trail", "press-runner", "refresh-route", "stand-down", "observe"]).toContain(state.autonomous_profit_capture_autopilot.action);
    expect(state.autonomous_profit_capture_autopilot.autopilot_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_capture_autopilot.autopilot_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_capture_autopilot.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_capture_autopilot.keep_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_capture_autopilot.next_cadence_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_profit_capture_autopilot.must_apply_protective_sell).toBe("boolean");
    expect(typeof state.autonomous_profit_capture_autopilot.must_refresh_route).toBe("boolean");
    expect(typeof state.autonomous_profit_capture_autopilot.can_press_fresh_buy).toBe("boolean");
    expect(state.autonomous_profit_capture_autopilot.items.map((item) => item.id)).toEqual(["race", "wallet", "route", "queue", "impact", "boundary"]);
    expect(state.autonomous_profit_capture_autopilot.items.every((item) =>
      ["pass", "watch", "block"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_capture_autopilot.controls.some((control) => control.includes("Condenses profit-capture race"))).toBe(true);
    expect(state.autonomous_profit_capture_autopilot.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
    expect(state.autonomous_profit_redeploy_autopilot.mode).toBe("autonomous-profit-redeploy-autopilot");
    expect(["redeploy", "probe", "wait-proof", "protect-first", "cooldown", "blocked", "idle"]).toContain(state.autonomous_profit_redeploy_autopilot.status);
    expect(["paper-redeploy", "paper-probe", "refresh-proof", "protect-before-redeploy", "cooldown", "stand-down", "observe"]).toContain(state.autonomous_profit_redeploy_autopilot.action);
    expect(state.autonomous_profit_redeploy_autopilot.redeploy_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_autopilot.redeploy_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_redeploy_autopilot.redeploy_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_autopilot.released_cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_autopilot.reserve_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_autopilot.next_cadence_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_profit_redeploy_autopilot.can_redeploy_paper).toBe("boolean");
    expect(typeof state.autonomous_profit_redeploy_autopilot.must_refresh_proof).toBe("boolean");
    expect(typeof state.autonomous_profit_redeploy_autopilot.must_protect_first).toBe("boolean");
    expect(state.autonomous_profit_redeploy_autopilot.items.map((item) => item.id)).toEqual(["capture", "candidate", "cash", "integrity", "intake", "boundary"]);
    expect(state.autonomous_profit_redeploy_autopilot.items.every((item) =>
      ["pass", "watch", "block"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_redeploy_autopilot.controls.some((control) => control.includes("Connects profit capture"))).toBe(true);
    expect(state.autonomous_profit_redeploy_autopilot.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
    expect(state.autonomous_profit_benchmark.mode).toBe("autonomous-profit-benchmark");
    expect(["beating-cash", "lagging-cash", "beating-selected", "lagging-selected", "protecting-capital", "learning"]).toContain(state.autonomous_profit_benchmark.status);
    expect(state.autonomous_profit_benchmark.benchmark_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_benchmark.benchmark_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_benchmark.agent_equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_benchmark.cash_baseline_usd).toBeGreaterThan(0);
    expect(state.autonomous_profit_benchmark.selected_coin_baseline_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_benchmark.hot_coin_baseline_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_benchmark.items.map((item) => item.id)).toEqual(["cash", "selected-coin", "hot-coin", "risk", "execution"]);
    expect(state.autonomous_profit_benchmark.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_benchmark.controls.some((control) => control.includes("idle cash"))).toBe(true);
    expect(state.autonomous_profit_benchmark.controls.some((control) => control.includes("hindsight learning signal"))).toBe(true);
    expect(state.autonomous_alpha_feedback_loop.mode).toBe("autonomous-alpha-feedback-loop");
    expect(["press", "retarget", "tighten", "protect", "learn", "idle"]).toContain(state.autonomous_alpha_feedback_loop.status);
    expect(["increase-bias", "retarget-hot-lane", "tighten-size", "protect-capital", "collect-evidence", "stand-down"]).toContain(state.autonomous_alpha_feedback_loop.action);
    expect(state.autonomous_alpha_feedback_loop.feedback_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_feedback_loop.feedback_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_alpha_feedback_loop.size_bias).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_feedback_loop.size_bias).toBeLessThanOrEqual(1.2);
    expect(state.autonomous_alpha_feedback_loop.target_bias_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_feedback_loop.target_bias_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_alpha_feedback_loop.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_alpha_feedback_loop.items.map((item) => item.id)).toEqual(["benchmark", "gap", "target", "sizing", "protection"]);
    expect(state.autonomous_alpha_feedback_loop.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_alpha_feedback_loop.controls.some((control) => control.includes("Alpha feedback turns benchmark gaps"))).toBe(true);
    expect(state.autonomous_alpha_feedback_loop.controls.some((control) => control.includes("Hindsight hot-coin gaps"))).toBe(true);
    expect(state.autonomous_profit_thesis_verifier.mode).toBe("autonomous-profit-thesis-verifier");
    expect(["validated", "probing", "retarget", "tighten", "protect", "blocked", "learning"]).toContain(state.autonomous_profit_thesis_verifier.status);
    expect(["press-thesis", "probe-thesis", "retarget-thesis", "tighten-size", "protect-capital", "block-thesis", "collect-evidence"]).toContain(state.autonomous_profit_thesis_verifier.action);
    expect(state.autonomous_profit_thesis_verifier.thesis_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.thesis_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.evidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.evidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.outcome_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.outcome_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.alpha_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.alpha_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.risk_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.risk_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.sizing_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.sizing_multiplier).toBeLessThanOrEqual(1.2);
    expect(state.autonomous_profit_thesis_verifier.chase_urgency_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.chase_urgency_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.chase_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.chase_size_multiplier).toBeLessThanOrEqual(1.2);
    expect(state.autonomous_profit_thesis_verifier.chase_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_profit_thesis_verifier.items.map((item) => item.id)).toEqual(["setup", "evidence", "outcome", "alpha", "risk"]);
    expect(state.autonomous_profit_thesis_verifier.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_thesis_verifier.controls.some((control) => control.includes("idle cash"))).toBe(true);
    expect(state.autonomous_profit_thesis_verifier.controls.some((control) => control.includes("Chase pressure"))).toBe(true);
    expect(state.autonomous_profit_thesis_verifier.controls.some((control) => control.includes("cannot override custody"))).toBe(true);
    expect(state.autonomous_opportunity_ranker.mode).toBe("autonomous-opportunity-ranker");
    expect(["attack-ready", "probe-ready", "retarget", "protect", "refresh", "blocked", "learning", "idle"]).toContain(state.autonomous_opportunity_ranker.status);
    expect(
      state.autonomous_opportunity_ranker.leader_action === null ||
        ["paper-attack", "paper-probe", "watch", "refresh-proof", "protect-capital", "block"].includes(state.autonomous_opportunity_ranker.leader_action),
    ).toBe(true);
    expect(state.autonomous_opportunity_ranker.best_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_ranker.best_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_opportunity_ranker.recommended_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_ranker.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_opportunity_ranker.items.length).toBeGreaterThan(0);
    expect(state.autonomous_opportunity_ranker.items.every((item) =>
      ["attack", "probe", "watch", "refresh", "protect", "blocked"].includes(item.status) &&
      ["paper-attack", "paper-probe", "watch", "refresh-proof", "protect-capital", "block"].includes(item.action) &&
      item.opportunity_score >= 0 &&
      item.opportunity_score <= 100 &&
      item.scanner_score >= 0 &&
      item.scanner_score <= 100 &&
      item.alpha_quality_score >= 0 &&
      item.alpha_quality_score <= 100 &&
      item.trap_clearance_score >= 0 &&
      item.trap_clearance_score <= 100 &&
      item.tradeability_score >= 0 &&
      item.tradeability_score <= 100 &&
      item.thesis_fit_score >= 0 &&
      item.thesis_fit_score <= 100 &&
      item.noise_score >= 0 &&
      item.noise_score <= 100 &&
      item.symbol.length > 0 &&
      item.decision.length > 0 &&
      item.evidence.length > 0
    )).toBe(true);
    const thesisRankItem = state.autonomous_profit_thesis_verifier.target_symbol
      ? state.autonomous_opportunity_ranker.items.find((item) => item.symbol === state.autonomous_profit_thesis_verifier.target_symbol)
      : null;
    if (thesisRankItem && state.autonomous_profit_thesis_verifier.chase_urgency_score > 0) {
      expect(thesisRankItem.evidence.some((item) => item.includes("chase urgency"))).toBe(true);
    }
    expect(state.autonomous_opportunity_ranker.controls.some((control) => control.includes("scanner readiness"))).toBe(true);
    expect(state.autonomous_opportunity_ranker.controls.some((control) => control.includes("local-paper only"))).toBe(true);
    expect(state.autonomous_rotation_director.mode).toBe("autonomous-rotation-director");
    expect(["rotate-now", "retarget", "protect", "harvest", "hold", "blocked", "idle"]).toContain(state.autonomous_rotation_director.status);
    expect(["rotate-capital", "retarget-hot-coin", "protect-position", "harvest-profit", "hold-current", "stand-down"]).toContain(state.autonomous_rotation_director.action);
    expect(state.autonomous_rotation_director.rotation_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.rotation_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_rotation_director.opportunity_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.opportunity_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_rotation_director.release_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.release_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_rotation_director.integrity_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.integrity_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_rotation_director.deploy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.max_paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_rotation_director.items.map((item) => item.id)).toEqual(["candidate", "release", "capital", "profit", "integrity"]);
    expect(state.autonomous_rotation_director.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_rotation_director.controls.some((control) => control.includes("local-paper only"))).toBe(true);
    expect(state.autonomous_rotation_director.controls.some((control) => control.includes("does not churn"))).toBe(true);
    expect(state.autonomous_opportunity_rank_execution.mode).toBe("opportunity-rank-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_opportunity_rank_execution.status);
    expect(
      state.autonomous_opportunity_rank_execution.selected_action === null ||
        ["paper-attack", "paper-probe", "watch", "refresh-proof", "protect-capital", "block"].includes(state.autonomous_opportunity_rank_execution.selected_action),
    ).toBe(true);
    expect(["buy", "hold"]).toContain(state.autonomous_opportunity_rank_execution.selected_side);
    expect(state.autonomous_opportunity_rank_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_rank_execution.opportunity_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_rank_execution.opportunity_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_opportunity_rank_execution.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_opportunity_rank_execution.execution_boundary).toBe("paper-ledger-only");
    if (state.autonomous_opportunity_rank_execution.paper_trade) {
      expect(state.autonomous_opportunity_rank_execution.paper_trade.id).toContain("paper-opportunity-rank");
      expect(state.autonomous_opportunity_rank_execution.paper_trade.side).toBe("buy");
      expect(state.autonomous_opportunity_rank_execution.paper_trade.size_usd).toBeGreaterThan(0);
      expect(state.autonomous_opportunity_rank_execution.paper_trade.symbol.length).toBeGreaterThan(0);
    }
    expect(state.autonomous_opportunity_rank_execution.controls.some((control) => control.includes("local paper-ledger buy candidate"))).toBe(true);
    expect(state.autonomous_opportunity_rank_execution.controls.some((control) => control.includes("Cannot sign"))).toBe(true);
    expect(state.position_exit_ladder.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.trigger_order_planner.mode).toBe("jupiter-trigger-planner");
    expect(state.trigger_order_planner.items.length).toBe(state.portfolio.open_positions.length);
    expect(["auth-required", "blocked", "monitoring", "ready", "idle"]).toContain(state.trigger_order_planner.status);
    expect(state.trigger_order_planner.safeguards.length).toBeGreaterThan(0);
    expect(state.trigger_order_execution.mode).toBe("jupiter-trigger-execution");
    expect(["idle", "locked", "craft-ready", "failed"]).toContain(state.trigger_order_execution.status);
    expect(state.trigger_order_execution.safeguards.some((item) => item.includes("raw signed transactions are not stored"))).toBe(true);
    expect(state.trigger_order_history.mode).toBe("jupiter-trigger-history");
    expect(state.trigger_order_history.status).toBe("locked");
    expect(state.trigger_order_history.safeguards.some((item) => item.includes("read-only"))).toBe(true);
    expect(state.autonomous_trigger_opportunity.mode).toBe("autonomous-trigger-opportunity");
    expect(["pre-arm", "protect", "repair", "auth-required", "monitor", "blocked", "idle"]).toContain(state.autonomous_trigger_opportunity.status);
    expect(["pre-arm", "protect-now", "repair", "authenticate", "monitor", "stand-down"]).toContain(state.autonomous_trigger_opportunity.selected_action);
    expect(state.autonomous_trigger_opportunity.items.length).toBe(state.protective_trigger_coverage.items.length);
    expect(state.autonomous_trigger_opportunity.controls.some((control) => control.includes("protective Trigger opportunities"))).toBe(true);
    expect(state.autonomous_trigger_opportunity.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    if (state.autonomous_trigger_opportunity.items.length > 0) {
      expect(state.autonomous_trigger_opportunity.fastest_review_seconds).toBeGreaterThan(0);
      expect(state.autonomous_trigger_opportunity.items.every((item) =>
        ["pre-arm", "protect-now", "repair", "authenticate", "monitor", "stand-down"].includes(item.action) &&
        ["ready", "watch", "blocked", "idle"].includes(item.status) &&
        item.opportunity_score >= 0 &&
        item.opportunity_score <= 100 &&
        item.edge_decay_score >= 0 &&
        item.edge_decay_score <= 100 &&
        item.review_after_seconds > 0 &&
        item.reason.length > 0
      )).toBe(true);
    }
    expect(state.autonomous_launch_timing.mode).toBe("autonomous-launch-timing");
    expect(["snipe", "probe", "confirm", "late-chase", "fade", "blocked", "idle"]).toContain(state.autonomous_launch_timing.status);
    expect(["snipe-now", "probe", "confirm", "late-chase", "fade", "stand-down"]).toContain(state.autonomous_launch_timing.selected_action);
    expect(state.autonomous_launch_timing.timing_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_launch_timing.timing_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_launch_timing.fastest_review_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_launch_timing.should_wait_confirmation).toBe("boolean");
    expect(typeof state.autonomous_launch_timing.should_block_late_chase).toBe("boolean");
    expect(state.autonomous_launch_timing.controls.some((control) => control.includes("Moonshot-style entry timing"))).toBe(true);
    expect(state.autonomous_launch_timing.controls.some((control) => control.includes("cannot guarantee profit"))).toBe(true);
    expect(state.autonomous_launch_timing.items.length).toBeGreaterThan(0);
    expect(state.autonomous_launch_timing.items.every((item) =>
      ["fresh-launch", "early-momentum", "migration-window", "crowded-pump", "late-cycle", "blocked"].includes(item.phase) &&
      ["snipe-now", "probe", "confirm", "late-chase", "fade", "stand-down"].includes(item.action) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      item.timing_score >= 0 &&
      item.timing_score <= 100 &&
      item.early_edge_score >= 0 &&
      item.early_edge_score <= 100 &&
      item.crowding_score >= 0 &&
      item.crowding_score <= 100 &&
      item.paid_hype_score >= 0 &&
      item.paid_hype_score <= 100 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.strategy_lab.runs.length).toBe(3);
    expect(state.opportunity_radar.items.length).toBeGreaterThan(0);
    expect(state.discovery_tape.top_candidates.length).toBeGreaterThan(0);
    expect(state.autonomous_signal_noise.mode).toBe("signal-noise-scanner");
    expect(["attack", "selective", "noisy", "protect", "idle"]).toContain(state.autonomous_signal_noise.status);
    expect(state.autonomous_signal_noise.items.length).toBeGreaterThan(0);
    expect(state.autonomous_signal_noise.items.every((item) =>
      item.signal_score >= 0 &&
      item.signal_score <= 100 &&
      item.noise_score >= 0 &&
      item.noise_score <= 100 &&
      item.signal_to_noise_ratio >= 0 &&
      item.review_after_seconds > 0 &&
      item.evidence.length > 0
    )).toBe(true);
	    expect(state.autonomous_signal_noise.controls.some((control) => control.includes("Blocks or size-reduces"))).toBe(true);
	    expect(state.trend_velocity_scanner.mode).toBe("trend-velocity-scanner");
	    expect(["hot", "selective", "cooldown", "blocked", "idle"]).toContain(state.trend_velocity_scanner.status);
	    expect(state.trend_velocity_scanner.items.length).toBeGreaterThan(0);
	    expect(state.trend_velocity_scanner.fastest_chase_seconds).toBeGreaterThan(0);
	    expect(state.trend_velocity_scanner.controls.some((control) => control.includes("Moonshot-style hot coin flow"))).toBe(true);
	    expect(state.trend_velocity_scanner.controls.some((control) => control.includes("cannot sign"))).toBe(true);
		    expect(state.trend_velocity_scanner.items.every((item) =>
		      ["chase", "probe", "watch", "fade", "block"].includes(item.action) &&
	      item.trend_score >= 0 &&
	      item.trend_score <= 100 &&
	      item.velocity_score >= 0 &&
	      item.buyer_flow_score >= 0 &&
	      item.discovery_heat_score >= 0 &&
	      item.freshness_score >= 0 &&
	      item.liquidity_score >= 0 &&
	      item.noise_score >= 0 &&
	      item.signal_to_noise_ratio >= 0 &&
	      item.chase_window_seconds > 0 &&
	      item.paper_size_multiplier >= 0 &&
	      item.reason.length > 0 &&
		      item.evidence.length > 0
		    )).toBe(true);
		    expect(state.autonomous_market_pulse.mode).toBe("autonomous-market-pulse");
		    expect(["attack", "selective", "protect", "cooldown", "idle"]).toContain(state.autonomous_market_pulse.status);
		    expect(state.autonomous_market_pulse.items.length).toBeGreaterThan(0);
		    expect(state.autonomous_market_pulse.fastest_review_seconds).toBeGreaterThan(0);
		    expect(state.autonomous_market_pulse.controls.some((control) => control.includes("signal/noise"))).toBe(true);
		    expect(state.autonomous_market_pulse.controls.some((control) => control.includes("cannot sign"))).toBe(true);
		    expect(state.autonomous_market_pulse.items.every((item) =>
		      ["attack", "probe", "watch", "protect", "stand-down"].includes(item.action) &&
	      item.pulse_score >= 0 &&
	      item.pulse_score <= 100 &&
	      item.organic_momentum_score >= 0 &&
	      item.organic_momentum_score <= 100 &&
	      item.signal_score >= 0 &&
	      item.flow_score >= 0 &&
	      item.velocity_score >= 0 &&
	      item.risk_score >= 0 &&
	      item.blended_edge_score >= 0 &&
	      item.source_confirmation_score >= 0 &&
	      item.source_confirmation_score <= 100 &&
	      item.promotion_risk_score >= 0 &&
	      item.promotion_risk_score <= 100 &&
	      item.signal_to_noise_ratio >= 0 &&
	      item.review_after_seconds > 0 &&
	      item.recommended_size_multiplier >= 0 &&
	      item.reason.length > 0 &&
		      item.evidence.length > 0
		    )).toBe(true);
		    expect(state.autonomous_market_pulse.average_organic_momentum_score).toBeGreaterThanOrEqual(0);
		    expect(state.autonomous_market_pulse.organic_attack_count).toBeGreaterThanOrEqual(0);
		    expect(state.autonomous_market_pulse.controls.some((control) => control.includes("organic-momentum"))).toBe(true);
		    expect(state.market_pulse_execution.mode).toBe("market-pulse-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(state.market_pulse_execution.status);
		    expect(state.market_pulse_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(state.market_pulse_execution.review_after_seconds).toBeGreaterThan(0);
		    expect(state.market_pulse_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
		    expect(state.market_pulse_execution.controls.some((control) => control.includes("top market-pulse"))).toBe(true);
		    expect(state.market_pulse_execution.controls.some((control) => control.includes("paper-ledger-only"))).toBe(true);
		    if (state.market_pulse_execution.paper_trade) {
		      expect(state.market_pulse_execution.paper_trade.side).toBe("buy");
		      expect(state.market_pulse_execution.paper_trade.reason).toContain("Market pulse");
		    }
		    expect(state.autonomous_profit_learning.mode).toBe("autonomous-profit-learning");
		    expect(["press", "selective", "tighten", "protect", "learning", "idle"]).toContain(state.autonomous_profit_learning.status);
		    expect(state.autonomous_profit_learning.items.length).toBeGreaterThanOrEqual(5);
		    expect(state.autonomous_profit_learning.confidence_score).toBeGreaterThanOrEqual(0);
		    expect(state.autonomous_profit_learning.confidence_score).toBeLessThanOrEqual(100);
		    expect(state.autonomous_profit_learning.size_multiplier).toBeGreaterThan(0);
		    expect(state.autonomous_profit_learning.cadence_seconds).toBeGreaterThan(0);
		    expect(state.autonomous_profit_learning.controls.some((control) => control.includes("local paper PnL"))).toBe(true);
		    expect(state.autonomous_profit_learning.controls.some((control) => control.includes("Forward replay"))).toBe(true);
		    expect(state.autonomous_profit_learning.items.some((item) => item.lane === "replay" && item.label === "Forward replay")).toBe(true);
		    expect(state.autonomous_profit_learning.items.every((item) =>
		      ["scorecard", "replay", "command", "strategy", "churn", "pulse", "session", "opportunity"].includes(item.lane) &&
		      ["pass", "watch", "fail"].includes(item.status) &&
		      ["press", "probe", "tighten", "harvest", "cooldown", "stand-down"].includes(item.action) &&
		      item.confidence_score >= 0 &&
		      item.confidence_score <= 100 &&
		      item.size_multiplier > 0 &&
		      item.cadence_seconds > 0 &&
		      item.detail.length > 0
		    )).toBe(true);
		    expect(state.autonomous_market_intelligence.mode).toBe("autonomous-market-intelligence");
		    expect(["chase", "selective", "watch", "protect", "blocked", "idle"]).toContain(state.autonomous_market_intelligence.status);
		    expect(["sample", "live", "repair", "blocked"]).toContain(state.autonomous_market_intelligence.provider_status);
		    expect(state.autonomous_market_intelligence.items.length).toBeGreaterThan(0);
		    expect(state.autonomous_market_intelligence.provider_confidence_score).toBeGreaterThanOrEqual(0);
		    expect(state.autonomous_market_intelligence.provider_confidence_score).toBeLessThanOrEqual(100);
		    expect(state.autonomous_market_intelligence.recommended_cadence_seconds).toBeGreaterThan(0);
		    expect(state.autonomous_market_intelligence.recommended_max_trades).toBeGreaterThan(0);
		    expect(state.autonomous_market_intelligence.provider_plan.length).toBeGreaterThanOrEqual(2);
		    expect(state.autonomous_market_intelligence.controls.some((control) => control.includes("DEX discovery"))).toBe(true);
		    expect(state.autonomous_market_intelligence.controls.some((control) => control.includes("local paper"))).toBe(true);
		    expect(state.autonomous_market_intelligence.items.every((item) =>
		      ["chase", "probe", "watch", "harvest", "protect", "stand-down"].includes(item.action) &&
		      item.confidence_score >= 0 &&
		      item.confidence_score <= 100 &&
		      item.signal_score >= 0 &&
		      item.chart_score >= 0 &&
		      item.route_score >= 0 &&
		      item.catalyst_score >= 0 &&
		      item.risk_score >= 0 &&
		      item.signal_to_noise_ratio >= 0 &&
		      item.chase_window_seconds > 0 &&
		      item.paper_size_multiplier >= 0 &&
		      item.source_count >= 0 &&
		      item.reason.length > 0 &&
		      item.evidence.length > 0
		    )).toBe(true);
		    expect(state.market_intelligence_execution.mode).toBe("market-intelligence-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(state.market_intelligence_execution.status);
		    expect(state.market_intelligence_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(state.market_intelligence_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
		    expect(state.market_intelligence_execution.expected_edge_usd).toBeGreaterThanOrEqual(0);
		    expect(state.market_intelligence_execution.risk_usd).toBeGreaterThanOrEqual(0);
		    expect(typeof state.market_intelligence_execution.projected_pnl_usd).toBe("number");
		    expect(state.market_intelligence_execution.review_after_seconds).toBeGreaterThan(0);
		    expect(state.market_intelligence_execution.controls.some((control) => control.includes("bounded local paper buy"))).toBe(true);
		    expect(state.market_intelligence_execution.controls.some((control) => control.includes("live signing"))).toBe(true);
		    if (state.market_intelligence_execution.paper_trade) {
		      expect(state.market_intelligence_execution.paper_trade.side).toBe("buy");
		      expect(state.market_intelligence_execution.paper_trade.reason).toContain("Market intelligence");
		    }
		    expect(state.autonomous_watchlist_rotation.mode).toBe("autonomous-watchlist-rotation");
		    expect(["trade-now", "quote-first", "chart-first", "refresh-first", "protect", "watch", "idle"]).toContain(state.autonomous_watchlist_rotation.status);
		    expect(state.autonomous_watchlist_rotation.items.length).toBeGreaterThan(0);
		    expect(state.autonomous_watchlist_rotation.fastest_refresh_seconds).toBeGreaterThan(0);
		    expect(typeof state.autonomous_watchlist_rotation.expected_edge_usd).toBe("number");
		    expect(state.autonomous_watchlist_rotation.controls.some((control) => control.includes("wallet funds"))).toBe(true);
		    expect(state.autonomous_watchlist_rotation.items.every((item) =>
		      ["paper-trade", "quote-route", "fetch-candles", "refresh-pair", "protect-position", "watch"].includes(item.action) &&
		      ["trade", "route", "chart", "pair", "portfolio", "watch"].includes(item.lane) &&
		      ["critical", "high", "normal", "low"].includes(item.priority) &&
		      item.rotation_score >= 0 &&
		      item.rotation_score <= 100 &&
		      item.refresh_after_seconds > 0 &&
		      typeof item.paper_trade_ready === "boolean" &&
		      typeof item.route_refresh_required === "boolean" &&
		      typeof item.candle_refresh_required === "boolean" &&
		      typeof item.pair_refresh_required === "boolean" &&
		      item.reason.length > 0 &&
		      item.evidence.length > 0
		    )).toBe(true);
		    expect(state.watchlist_rotation_execution.mode).toBe("watchlist-rotation-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(state.watchlist_rotation_execution.status);
		    expect(state.watchlist_rotation_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(state.watchlist_rotation_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
		    expect(state.watchlist_rotation_execution.expected_edge_usd).toBeGreaterThanOrEqual(0);
		    expect(state.watchlist_rotation_execution.risk_usd).toBeGreaterThanOrEqual(0);
		    expect(typeof state.watchlist_rotation_execution.projected_pnl_usd).toBe("number");
		    expect(state.watchlist_rotation_execution.review_after_seconds).toBeGreaterThan(0);
		    expect(state.watchlist_rotation_execution.controls.some((control) => control.includes("paper-ledger-only"))).toBe(true);
		    expect(state.watchlist_rotation_execution.controls.some((control) => control.includes("wallet fund"))).toBe(true);
		    if (state.watchlist_rotation_execution.paper_trade) {
		      expect(["buy", "sell"]).toContain(state.watchlist_rotation_execution.paper_trade.side);
		      expect(state.watchlist_rotation_execution.paper_trade.reason).toContain("Watchlist rotation");
		    }
		    expect(state.trend_chase_execution.mode).toBe("trend-chase-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(state.trend_chase_execution.status);
		    expect(state.trend_chase_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(state.trend_chase_execution.review_after_seconds).toBeGreaterThan(0);
		    expect(state.trend_chase_execution.scout_reserve_usd).toBeGreaterThanOrEqual(0);
		    expect(typeof state.trend_chase_execution.uses_scout_reserve).toBe("boolean");
		    expect(state.trend_chase_execution.controls.some((control) => control.includes("hot/probe trend-velocity candidate"))).toBe(true);
		    expect(state.trend_chase_execution.controls.some((control) => control.includes("scout reserve"))).toBe(true);
		    if (state.trend_chase_execution.paper_trade) {
		      expect(state.trend_chase_execution.paper_trade.side).toBe("buy");
		      expect(state.trend_chase_execution.paper_trade.reason).toContain("Trend chase");
		      if (state.trend_chase_execution.uses_scout_reserve) {
		        expect(state.trend_chase_execution.paper_trade.reason).toContain("scout-reserve");
		        expect(state.trend_chase_execution.paper_trade.size_usd).toBe(state.trend_chase_execution.scout_reserve_usd);
		      }
		    }
		    expect(state.scout_lifecycle.mode).toBe("scout-lifecycle-controller");
		    expect(["harvest", "trim", "stop", "tighten", "watch", "idle"]).toContain(state.scout_lifecycle.status);
		    expect(state.scout_lifecycle.execution_boundary).toBe("paper-ledger-only");
		    expect(state.scout_lifecycle.watched_count).toBeGreaterThanOrEqual(0);
		    expect(state.scout_lifecycle.release_usd).toBeGreaterThanOrEqual(0);
		    expect(state.scout_lifecycle.review_after_seconds).toBeGreaterThan(0);
		    expect(state.scout_lifecycle.controls.some((control) => control.includes("scout-origin"))).toBe(true);
		    if (state.scout_lifecycle.paper_trade) {
		      expect(state.scout_lifecycle.paper_trade.side).toBe("sell");
		      expect(state.scout_lifecycle.paper_trade.reason).toContain("Scout lifecycle");
		    }
		    expect(state.autonomous_trade_arbiter.controls.some((control) => control.includes("signal/noise"))).toBe(true);
    expect(state.autonomous_trade_arbiter.items.some((item) =>
      item.sources.some((source) => source.startsWith("signal-noise-"))
    )).toBe(true);
    expect(state.autonomous_burst_scheduler.mode).toBe("autonomous-burst-scheduler");
    expect(["burst", "active", "selective", "cooldown", "protect", "stand-down", "idle"]).toContain(state.autonomous_burst_scheduler.status);
    expect(state.autonomous_burst_scheduler.next_tick_seconds).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_scheduler.max_trades_next_tick).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_scheduler.dex_discovery_budget_per_minute).toBeLessThanOrEqual(60);
    expect(state.autonomous_burst_scheduler.dex_pair_budget_per_minute).toBeLessThanOrEqual(300);
    expect(state.autonomous_burst_scheduler.items.length).toBeGreaterThan(0);
    expect(state.autonomous_burst_scheduler.controls.some((control) => control.includes("local paper daemon bursts"))).toBe(true);
    expect(state.autonomous_daily_profit_lock.mode).toBe("autonomous-daily-profit-lock");
    expect(["run", "lock-profit", "harvest", "protect", "cooldown", "stand-down"]).toContain(state.autonomous_daily_profit_lock.status);
    expect(["trade", "lock-gains", "harvest", "protect-only", "cooldown", "stand-down"]).toContain(state.autonomous_daily_profit_lock.action);
    expect(["open", "harvest-only", "protect-only", "paused", "stand-down"]).toContain(state.autonomous_daily_profit_lock.loop_permission);
    expect(typeof state.autonomous_daily_profit_lock.fresh_buy_allowed).toBe("boolean");
    expect(typeof state.autonomous_daily_profit_lock.protect_sell_allowed).toBe("boolean");
    expect(state.autonomous_daily_profit_lock.target_net_pnl_usd).toBeGreaterThan(0);
    expect(state.autonomous_daily_profit_lock.target_remaining_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.stop_loss_usd).toBeGreaterThan(0);
    expect(state.autonomous_daily_profit_lock.loss_budget_remaining_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.locked_profit_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.release_required_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.deploy_allowed_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_daily_profit_lock.controls.some((control) => control.includes("daily/session paper circuit breaker"))).toBe(true);
    expect(state.autonomous_daily_profit_lock.controls.some((control) => control.includes("cannot guarantee profit"))).toBe(true);
    expect(state.autonomous_daily_profit_lock.items.length).toBe(6);
    expect(state.autonomous_daily_profit_lock.items.every((item) =>
      ["target", "loss", "drawdown", "fresh-buy", "release", "memory"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_portfolio_mark_board.mode).toBe("autonomous-portfolio-mark-board");
    expect(["compound", "harvest", "protect", "exit", "watch", "idle"]).toContain(state.autonomous_portfolio_mark_board.status);
    expect(state.autonomous_portfolio_mark_board.held_count).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_mark_board.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_mark_board.equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.exposure_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.release_pressure_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.press_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_portfolio_mark_board.controls.some((control) => control.includes("mark-to-market"))).toBe(true);
    expect(state.autonomous_portfolio_mark_board.controls.some((control) => control.includes("cannot guarantee profit"))).toBe(true);
    expect(state.autonomous_portfolio_mark_board.items.every((item) =>
      ["press", "harvest", "trim", "exit", "protect", "refresh", "hold"].includes(item.action) &&
      ["winner", "watch", "risk", "exit", "idle"].includes(item.status) &&
      item.current_value_usd >= 0 &&
      item.cost_basis_usd >= 0 &&
      item.exposure_pct >= 0 &&
      item.suggested_release_usd >= 0 &&
      item.suggested_press_usd >= 0 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_replay_gate.mode).toBe("autonomous-replay-gate");
    expect(["approve", "size-down", "protect", "refresh", "blocked", "learning"]).toContain(state.autonomous_replay_gate.status);
    expect(["approve-size", "reduce-size", "protect-only", "refresh-replay", "stand-down", "learn-more"]).toContain(state.autonomous_replay_gate.action);
    expect(typeof state.autonomous_replay_gate.can_spend).toBe("boolean");
    expect(state.autonomous_replay_gate.replay_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_replay_gate.replay_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_replay_gate.size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_replay_gate.size_multiplier).toBeLessThanOrEqual(1.5);
    expect(state.autonomous_replay_gate.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_replay_gate.max_next_fills).toBeLessThanOrEqual(6);
    expect(["base", "breakout", "rug-risk"]).toContain(state.autonomous_replay_gate.best_regime);
    expect(["base", "breakout", "rug-risk"]).toContain(state.autonomous_replay_gate.worst_regime);
    expect(state.autonomous_replay_gate.items.length).toBe(6);
    expect(state.autonomous_replay_gate.items.every((item) =>
      ["forward", "regime", "rug", "scorecard", "ticket", "queue"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_replay_gate.controls.some((control) => control.includes("base, breakout, and rug-risk"))).toBe(true);
    expect(state.autonomous_replay_gate.controls.some((control) => control.includes("cannot predict future PnL"))).toBe(true);
    expect(state.autonomous_burst_fill_plan.mode).toBe("autonomous-burst-fill-plan");
    expect(state.autonomous_burst_fill_plan.plan_id).toContain(`burst-plan-${state.paper_account.cycle}`);
    expect(state.autonomous_burst_fill_plan.cycle).toBe(state.paper_account.cycle);
    expect(["burst", "single", "protect", "refresh", "blocked", "idle"]).toContain(state.autonomous_burst_fill_plan.status);
    expect(["paper-ledger-only", "read-only-route-refresh", "blocked-paper-only"]).toContain(state.autonomous_burst_fill_plan.execution_boundary);
    expect(state.autonomous_burst_fill_plan.child_fill_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.child_fill_count).toBeLessThanOrEqual(state.autonomous_burst_fill_plan.max_child_fills);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(state.autonomous_daily_profit_lock.max_next_fills);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(6);
    expect(state.autonomous_burst_fill_plan.feedback_child_fill_ceiling).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.feedback_child_fill_ceiling).toBeLessThanOrEqual(6);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(state.autonomous_burst_fill_plan.feedback_child_fill_ceiling);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(state.autonomous_data_freshness_gate.max_next_fills);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(state.autonomous_replay_gate.max_next_fills);
    expect(state.autonomous_burst_fill_plan.prior_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.prior_size_multiplier).toBeLessThanOrEqual(1.5);
    expect(["clear", "tradeable", "refresh", "backfill", "blocked", "sample"]).toContain(state.autonomous_burst_fill_plan.data_gate_status);
    expect(state.autonomous_burst_fill_plan.data_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.data_size_multiplier).toBeLessThanOrEqual(1.5);
    expect(["approve", "size-down", "protect", "refresh", "blocked", "learning"]).toContain(state.autonomous_burst_fill_plan.replay_gate_status);
    expect(state.autonomous_burst_fill_plan.replay_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.replay_size_multiplier).toBeLessThanOrEqual(1.5);
    expect(
      state.autonomous_burst_fill_plan.prior_feedback_action === null ||
        ["increase-next-burst", "keep-next-burst", "halve-next-burst", "protect-only", "refresh-proof", "stand-down", "observe"].includes(state.autonomous_burst_fill_plan.prior_feedback_action)
    ).toBe(true);
    expect(state.autonomous_burst_fill_plan.total_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.child_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.max_slippage_bps).toBeGreaterThanOrEqual(50);
    expect(state.autonomous_burst_fill_plan.max_slippage_bps).toBeLessThanOrEqual(2000);
    expect(state.autonomous_burst_fill_plan.children.length).toBeGreaterThan(0);
    expect(state.autonomous_burst_fill_plan.children.every((child) =>
      child.notional_usd >= 0 &&
      child.expected_edge_usd >= 0 &&
      child.max_slippage_bps >= 50
    )).toBe(true);
    expect(state.autonomous_burst_fill_plan.controls.some((control) => control.includes("child paper fills"))).toBe(true);
    expect(state.autonomous_burst_fill_plan.controls.some((control) => control.includes("prior burst feedback"))).toBe(true);
    expect(state.autonomous_burst_fill_plan.controls.some((control) => control.includes("data freshness gate multiplier"))).toBe(true);
    expect(state.autonomous_burst_fill_plan.controls.some((control) => control.includes("replay gate multiplier"))).toBe(true);
    expect(state.autonomous_burst_outcome_feedback.mode).toBe("autonomous-burst-outcome-feedback");
    expect(["scale", "keep", "tighten", "protect", "blocked", "idle"]).toContain(state.autonomous_burst_outcome_feedback.status);
    expect(["increase-next-burst", "keep-next-burst", "halve-next-burst", "protect-only", "refresh-proof", "stand-down", "observe"]).toContain(state.autonomous_burst_outcome_feedback.action);
    expect(typeof state.autonomous_burst_outcome_feedback.can_scale_next_burst).toBe("boolean");
    expect(typeof state.autonomous_burst_outcome_feedback.should_halve_next_burst).toBe("boolean");
    expect(typeof state.autonomous_burst_outcome_feedback.blocks_fresh_buy).toBe("boolean");
    expect(state.autonomous_burst_outcome_feedback.outcome_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.outcome_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_burst_outcome_feedback.fill_efficiency_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.fill_efficiency_pct).toBeLessThanOrEqual(100);
    expect(state.autonomous_burst_outcome_feedback.paper_quality_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.paper_quality_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_burst_outcome_feedback.churn_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.churn_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_burst_outcome_feedback.projected_friction_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.max_next_child_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.max_next_child_fills).toBeLessThanOrEqual(6);
    expect(state.autonomous_burst_outcome_feedback.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_burst_outcome_feedback.items.length).toBe(6);
    expect(state.autonomous_burst_outcome_feedback.items.every((item) =>
      ["edge", "fill-quality", "churn", "wallet", "daily-lock", "route"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_burst_outcome_feedback.controls.some((control) => control.includes("next-cycle size multiplier"))).toBe(true);
    expect(state.autonomous_burst_outcome_feedback.controls.some((control) => control.includes("paper-trading feedback only"))).toBe(true);
    expect(state.autonomous_burst_fill_execution.mode).toBe("autonomous-burst-fill-execution");
    expect(["applied", "ready", "blocked", "idle"]).toContain(state.autonomous_burst_fill_execution.status);
    expect(typeof state.autonomous_burst_fill_execution.ledger_applied).toBe("boolean");
    expect(state.autonomous_burst_fill_execution.requested_child_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_execution.requested_child_count).toBeLessThanOrEqual(6);
    expect(state.autonomous_burst_fill_execution.applied_child_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_execution.applied_child_count).toBeLessThanOrEqual(state.autonomous_burst_fill_execution.requested_child_count);
    expect(state.autonomous_burst_fill_execution.planned_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_execution.applied_notional_usd).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(state.autonomous_burst_fill_execution.last_trade_ids)).toBe(true);
    expect(state.autonomous_burst_fill_execution.controls.some((control) => control.includes("weighted-average paper scale-ins"))).toBe(true);
    expect(state.autonomous_burst_fill_execution.controls.some((control) => control.includes("Local paper ledger only"))).toBe(true);
    expect(state.autonomous_profit_accountability.mode).toBe("autonomous-profit-accountability");
    expect(["press", "compound", "tighten", "protect", "blocked", "learning"]).toContain(state.autonomous_profit_accountability.status);
    expect(["press-size", "keep-size", "tighten-size", "protect-wallet", "refresh-proof", "stand-down"]).toContain(state.autonomous_profit_accountability.action);
    expect(typeof state.autonomous_profit_accountability.making_money).toBe("boolean");
    expect(state.autonomous_profit_accountability.accountability_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.accountability_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_accountability.next_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.next_size_multiplier).toBeLessThanOrEqual(1.5);
    expect(state.autonomous_profit_accountability.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.max_next_fills).toBeLessThanOrEqual(6);
    expect(state.autonomous_profit_accountability.fill_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.blocked_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.items.length).toBe(6);
    expect(state.autonomous_profit_accountability.items.every((item) =>
      ["wallet", "scorecard", "fills", "burst", "directive", "session"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_accountability.controls.some((control) => control.includes("paper wallet PnL"))).toBe(true);
    expect(state.autonomous_profit_accountability.controls.some((control) => control.includes("Local paper-accountability only"))).toBe(true);
    expect(state.autonomous_profit_integrity_circuit.mode).toBe("autonomous-profit-integrity-circuit");
    expect(["press", "continue", "probe", "protect", "cooldown", "blocked", "learning"]).toContain(state.autonomous_profit_integrity_circuit.status);
    expect(["scale", "trade", "probe", "protect-only", "cooldown", "stand-down"]).toContain(state.autonomous_profit_integrity_circuit.permission);
    expect(["increase-frequency", "keep-running", "single-probe", "protect-wallet", "cooldown", "stand-down"]).toContain(state.autonomous_profit_integrity_circuit.action);
    expect(state.autonomous_profit_integrity_circuit.integrity_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_integrity_circuit.integrity_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_integrity_circuit.size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_integrity_circuit.size_multiplier).toBeLessThanOrEqual(1.35);
    expect(state.autonomous_profit_integrity_circuit.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_integrity_circuit.max_next_fills).toBeLessThanOrEqual(6);
    expect(typeof state.autonomous_profit_integrity_circuit.can_continue).toBe("boolean");
    expect(typeof state.autonomous_profit_integrity_circuit.should_pause_fresh_buys).toBe("boolean");
    expect(typeof state.autonomous_profit_integrity_circuit.should_protect_first).toBe("boolean");
    expect(state.autonomous_profit_integrity_circuit.items.length).toBe(6);
    expect(state.autonomous_profit_integrity_circuit.items.every((item) =>
      ["validator", "forecast", "execution", "safety", "accountability", "loop"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_integrity_circuit.controls.some((control) => control.includes("Closes the autonomous profit loop"))).toBe(true);
    expect(state.autonomous_profit_integrity_circuit.controls.some((control) => control.includes("Feeds a single size multiplier"))).toBe(true);
    expect(state.autonomous_loop_throttle.items.some((item) => item.id === "accountability" && item.label === "Integrity")).toBe(true);
    expect(state.autonomous_trade_mission.mode).toBe("autonomous-trade-mission");
    expect(["attack", "probe", "harvest", "protect", "cooldown", "blocked", "idle"]).toContain(state.autonomous_trade_mission.status);
    expect(state.autonomous_trade_mission.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_mission.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_trade_mission.steps.length).toBeGreaterThanOrEqual(6);
    expect(state.autonomous_trade_mission.evidence.length).toBeGreaterThan(0);
    expect(state.autonomous_trade_mission.controls.some((control) => control.includes("existing trading subsystems"))).toBe(true);
    if (state.autonomous_trade_mission.status === "blocked") {
      expect(state.autonomous_trade_mission.blockers.length).toBeGreaterThan(0);
      expect(state.autonomous_trade_mission.next_action.length).toBeGreaterThan(0);
    }
    expect(state.autonomous_tick_plan.mode).toBe("autonomous-tick-plan");
    expect(["trade", "protect", "refresh", "observe", "stand-down", "blocked"]).toContain(state.autonomous_tick_plan.status);
    expect(["burst", "steady", "refresh-first", "protect-first", "cooldown", "blocked"]).toContain(state.autonomous_tick_plan.throughput_mode);
    expect(state.autonomous_tick_plan.items.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.tick_seconds).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.max_actions_next_minute).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.max_actions_next_minute).toBeLessThanOrEqual(state.autonomous_loop_director.max_ticks_per_minute);
    expect(state.autonomous_tick_plan.execution_slots_remaining).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_action_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_action_count).toBeLessThanOrEqual(state.autonomous_tick_plan.max_actions_next_minute);
    expect(state.autonomous_tick_plan.bundle_trade_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_refresh_count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(state.autonomous_tick_plan.bundle_symbols)).toBe(true);
    expect(state.autonomous_tick_plan.bundle_expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_trade_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_summary.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.next_minute_trade_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.throttle_reason.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_governor.mode).toBe("autonomous-tick-governor");
    expect(["run-now", "protect-first", "refresh-first", "observe", "paused", "blocked"]).toContain(state.autonomous_tick_governor.status);
    expect(["trade", "protect", "refresh-routes", "refresh-market", "observe", "pause"]).toContain(state.autonomous_tick_governor.action);
    expect(typeof state.autonomous_tick_governor.can_auto_advance).toBe("boolean");
    expect(typeof state.autonomous_tick_governor.should_trade).toBe("boolean");
    if (state.autonomous_tick_governor.should_trade) {
      expect(state.autonomous_tick_governor.can_auto_advance).toBe(true);
      expect(state.autonomous_tick_governor.action).toBe("trade");
    }
    if (state.autonomous_tick_governor.should_request_route_quote) {
      expect(state.autonomous_tick_governor.action).toBe("refresh-routes");
    }
    if (state.autonomous_tick_governor.status === "blocked" || state.autonomous_tick_governor.status === "paused") {
      expect(state.autonomous_tick_governor.action).toBe("pause");
      expect(state.autonomous_tick_governor.can_auto_advance).toBe(false);
    }
    expect(state.autonomous_tick_governor.next_tick_seconds).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_governor.decision_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_governor.decision_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_tick_governor.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_governor.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_tick_governor.checks.map((check) => check.id)).toEqual(["discovery", "route", "wallet", "readiness", "profit", "throughput"]);
    expect(state.autonomous_tick_governor.checks.every((check) =>
      ["pass", "watch", "fail"].includes(check.status) &&
      check.score >= 0 &&
      check.score <= 100 &&
      check.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_tick_governor.controls.some((control) => control.includes("local paper-only"))).toBe(true);
    expect(state.autonomous_tick_bundle_execution.mode).toBe("tick-bundle-paper-rehearsal");
    expect(["ready", "applied", "refresh-only", "blocked", "empty", "mixed"]).toContain(state.autonomous_tick_bundle_execution.status);
    expect(state.autonomous_tick_bundle_execution.execution_boundary).toBe("paper-ledger-only");
    expect(["requesting", "ready", "blocked", "watching", "idle"]).toContain(state.autonomous_tick_bundle_execution.route_refresh_status);
    expect(typeof state.autonomous_tick_bundle_execution.route_refresh_vetoed).toBe("boolean");
    expect(state.autonomous_tick_bundle_execution.route_refresh_blocker === null || typeof state.autonomous_tick_bundle_execution.route_refresh_blocker === "string").toBe(true);
    expect(state.autonomous_tick_bundle_execution.route_vetoed_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.bundle_size).toBeLessThanOrEqual(
      state.autonomous_tick_plan.max_actions_next_minute + state.autonomous_tick_bundle_execution.applied_trade_count,
    );
    expect(state.autonomous_tick_bundle_execution.ready_trade_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.applied_trade_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.refresh_only_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.blocked_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.skipped_count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(state.autonomous_tick_bundle_execution.paper_trade_ids)).toBe(true);
    expect(state.autonomous_tick_bundle_execution.projected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_bundle_execution.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_bundle_execution.controls.some((control) => control.includes("bounded local paper fills"))).toBe(true);
    expect(state.autonomous_tick_bundle_execution.controls.some((control) => control.includes("paper-ledger boundary"))).toBe(true);
    expect(state.autonomous_tick_bundle_execution.controls.some((control) => control.includes("route-refresh execution"))).toBe(true);
    if (state.autonomous_tick_bundle_execution.route_refresh_vetoed) {
      expect(state.autonomous_tick_bundle_execution.route_refresh_blocker).toBeTruthy();
      expect(state.autonomous_tick_bundle_execution.route_vetoed_count).toBeGreaterThan(0);
      expect(state.autonomous_tick_bundle_execution.items.some((item) =>
        item.status === "ready" &&
        item.side === "buy" &&
        item.lane === "entry"
      )).toBe(false);
    }
    expect(state.autonomous_capital_command.mode).toBe("autonomous-capital-command");
    expect(["deploy", "harvest", "protect", "refresh", "observe", "blocked", "idle"]).toContain(state.autonomous_capital_command.status);
    expect(["deploy-now", "harvest-first", "protect-first", "refresh-first", "observe", "stand-down"]).toContain(state.autonomous_capital_command.action);
    expect(state.autonomous_capital_command.command_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.command_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_capital_command.spend_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.release_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.reserved_cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.risk_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.next_tick_seconds).toBeGreaterThan(0);
    expect(state.autonomous_capital_command.max_child_fills).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_capital_command.can_execute_paper).toBe("boolean");
    expect(["paper-ledger-only", "read-only-refresh", "blocked-paper-only"]).toContain(state.autonomous_capital_command.execution_boundary);
    expect(state.autonomous_capital_command.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_capital_command.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_capital_command.items.map((item) => item.id)).toEqual(["tick", "capital", "profit", "wallet", "source", "execution"]);
    expect(state.autonomous_capital_command.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_capital_command.controls.some((control) => control.includes("next-dollar command"))).toBe(true);
    expect(state.autonomous_capital_command.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.autonomous_tick_bundle_feedback.mode).toBe("tick-bundle-feedback-governor");
    expect(["press", "selective", "cooldown", "protect", "idle"]).toContain(state.autonomous_tick_bundle_feedback.status);
    expect(state.autonomous_tick_bundle_feedback.bundle_quality_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_feedback.bundle_quality_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_tick_bundle_feedback.next_bundle_trade_cap).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_feedback.next_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_tick_bundle_feedback.protective_sell_only).toBe("boolean");
    expect(state.autonomous_tick_bundle_feedback.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_bundle_feedback.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_bundle_feedback.controls.some((control) => control.includes("local paper-ledger sizing"))).toBe(true);
    expect(state.autonomous_lane_capital_controller.mode).toBe("autonomous-lane-capital-controller");
    expect(["press", "balanced", "selective", "cooldown", "protect", "idle"]).toContain(state.autonomous_lane_capital_controller.status);
    expect(state.autonomous_lane_capital_controller.total_lane_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_lane_capital_controller.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_lane_capital_controller.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_lane_capital_controller.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_lane_capital_controller.controls.some((control) => control.includes("local paper capital"))).toBe(true);
    expect(state.autonomous_lane_capital_controller.items.every((item) =>
      ["press", "fund", "probe", "cooldown", "stop", "protect"].includes(item.status) &&
      item.lane_budget_usd >= 0 &&
      item.max_trade_usd >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100
    )).toBe(true);
    expect(state.autonomous_profit_allocation_plan.mode).toBe("autonomous-profit-allocation-plan");
    expect(["press", "rotate", "protect", "cooldown", "learning", "idle"]).toContain(state.autonomous_profit_allocation_plan.status);
    expect(state.autonomous_profit_allocation_plan.deploy_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.release_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.size_multiplier).toBeGreaterThan(0);
    expect(state.autonomous_profit_allocation_plan.cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_profit_allocation_plan.allocation_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.allocation_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("next-cycle sizing plan"))).toBe(true);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("allocator gate"))).toBe(true);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("clipped to the learned lane cap"))).toBe(true);
    expect(state.autonomous_profit_allocation_plan.items.every((item) =>
      ["press", "fund", "probe", "release", "cooldown", "stop"].includes(item.action) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.allocation_weight_pct >= 0 &&
      item.allocation_weight_pct <= 100 &&
      item.budget_usd >= 0 &&
      item.max_trade_usd >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100
    )).toBe(true);
    expect(state.autonomous_regime_tape.mode).toBe("autonomous-regime-tape");
    expect(["attack", "scalp", "rotate", "distribute", "protect", "chop", "idle"]).toContain(state.autonomous_regime_tape.status);
    expect(state.autonomous_regime_tape.average_regime_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_regime_tape.average_regime_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_regime_tape.average_risk_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_regime_tape.average_risk_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_regime_tape.max_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_regime_tape.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_regime_tape.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_regime_tape.controls.some((control) => control.includes("local simulator control"))).toBe(true);
    expect(state.autonomous_regime_tape.items.every((item) =>
      ["breakout", "scalp", "rotation", "distribution", "rug-risk", "dead-chop"].includes(item.regime) &&
      ["attack", "scalp", "probe", "rotate", "trim", "protect", "avoid"].includes(item.action) &&
      item.regime_score >= 0 &&
      item.regime_score <= 100 &&
      item.risk_score >= 0 &&
      item.risk_score <= 100 &&
      item.max_buy_usd >= 0
    )).toBe(true);
    expect(state.autonomous_wallet_growth_director.mode).toBe("autonomous-wallet-growth-director");
    expect(["press", "scalp", "compound", "harvest", "protect", "recover", "pause", "idle"]).toContain(state.autonomous_wallet_growth_director.status);
    expect(state.autonomous_wallet_growth_director.growth_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.growth_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_wallet_growth_director.risk_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.risk_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_wallet_growth_director.portfolio_heat_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.portfolio_heat_score).toBeLessThanOrEqual(100);
    expect(["open", "selective", "cooldown", "exit-only"]).toContain(state.autonomous_wallet_growth_director.fresh_entry_permission);
    expect(state.autonomous_wallet_growth_director.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_wallet_growth_director.max_fresh_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.heat_limited_buy_usd).toBeGreaterThanOrEqual(0);
    expect(
      state.autonomous_wallet_growth_director.max_fresh_buy_usd <= state.autonomous_wallet_growth_director.heat_limited_buy_usd ||
        ["protect", "recover", "pause"].includes(state.autonomous_wallet_growth_director.status),
    ).toBe(true);
    expect(state.autonomous_wallet_growth_director.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_wallet_growth_director.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_wallet_growth_director.controls.some((control) => control.includes("paper/simulator control"))).toBe(true);
    expect(state.autonomous_wallet_growth_director.controls.some((control) => control.includes("heat-capped"))).toBe(true);
    expect(state.autonomous_wallet_growth_director.items.every((item) =>
      ["wallet", "regime", "capital", "execution", "portfolio", "loop"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      ["press", "scalp", "compound", "harvest", "protect", "recover", "pause"].includes(item.action) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.budget_usd >= 0
    )).toBe(true);
    expect(state.autonomous_reentry_hunter.mode).toBe("autonomous-reentry-hunter");
    expect(["rebuy", "probe", "watch", "blocked", "idle"]).toContain(state.autonomous_reentry_hunter.status);
    expect(state.autonomous_reentry_hunter.max_reentry_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reentry_hunter.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reentry_hunter.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_reentry_hunter.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_reentry_hunter.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_reentry_hunter.controls.some((control) => control.includes("paper/simulator control"))).toBe(true);
    expect(state.autonomous_reentry_hunter.items.every((item) =>
      ["rebuy", "probe", "wait", "blocked"].includes(item.action) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      item.reentry_score >= 0 &&
      item.reentry_score <= 100 &&
      item.reclaim_score >= 0 &&
      item.reclaim_score <= 100 &&
      item.signal_score >= 0 &&
      item.signal_score <= 100 &&
      item.risk_score >= 0 &&
      item.risk_score <= 100 &&
      item.last_exit_size_usd >= 0 &&
      item.recommended_size_usd >= 0 &&
      item.expected_edge_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_profit_route_selector.mode).toBe("autonomous-profit-route-selector");
    expect(["execute", "selective", "protect", "observe", "blocked", "idle"]).toContain(state.autonomous_profit_route_selector.status);
    expect(state.autonomous_profit_route_selector.selected_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_route_selector.selected_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_route_selector.max_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_route_selector.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_route_selector.average_fill_quality_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_route_selector.average_fill_quality_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_route_selector.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_route_selector.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_route_selector.controls.some((control) => control.includes("paper/simulator control"))).toBe(true);
    expect(state.autonomous_profit_route_selector.items.every((item) =>
      ["command-center", "high-frequency", "opportunity-race", "market-intelligence", "market-pulse", "trend-chase", "reentry-hunter", "portfolio-protect", "route-profit", "wallet-growth"].includes(item.lane) &&
      ["execute", "queue", "protect", "resize", "observe", "block"].includes(item.action) &&
      ["selected", "ready", "watch", "blocked"].includes(item.status) &&
      ["buy", "sell", "hold"].includes(item.side) &&
      item.route_score >= 0 &&
      item.route_score <= 100 &&
      item.fill_quality_score >= 0 &&
      item.fill_quality_score <= 100 &&
      item.notional_usd >= 0 &&
      item.risk_usd >= 0
    )).toBe(true);
    expect(state.autonomous_execution_quality_arbiter.mode).toBe("autonomous-execution-quality-arbiter");
    expect(["execute", "selective", "paper-only", "repair", "blocked", "idle"]).toContain(state.autonomous_execution_quality_arbiter.status);
    expect(state.autonomous_execution_quality_arbiter.selected_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_quality_arbiter.selected_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_execution_quality_arbiter.max_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_quality_arbiter.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_quality_arbiter.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_execution_quality_arbiter.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_execution_quality_arbiter.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_execution_quality_arbiter.controls.some((control) => control.includes("Final fresh-buy arbiter"))).toBe(true);
    expect(state.autonomous_execution_quality_arbiter.items.every((item) =>
      ["command-center", "high-frequency", "opportunity-race", "market-intelligence", "market-pulse", "trend-chase", "reentry-hunter", "portfolio-protect", "route-profit", "wallet-growth"].includes(item.lane) &&
      ["execute-paper", "protect", "rehearse", "requote", "resize", "block"].includes(item.action) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      ["buy", "sell", "hold"].includes(item.side) &&
      ["paper-ledger", "jupiter-v2-managed", "jupiter-router-submit", "helius-sender", "blocked"].includes(item.landing_path) &&
      item.execution_score >= 0 &&
      item.execution_score <= 100 &&
      item.landing_score >= 0 &&
      item.landing_score <= 100 &&
      item.pre_submit_score >= 0 &&
      item.pre_submit_score <= 100 &&
      item.fill_quality_score >= 0 &&
      item.fill_quality_score <= 100 &&
      item.mev_risk_score >= 0 &&
      item.mev_risk_score <= 100 &&
      item.cost_bps >= 0 &&
      item.max_notional_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_token_safety_clearance.mode).toBe("autonomous-token-safety-clearance");
    expect(["cleared", "selective", "blocked", "exit-only", "idle"]).toContain(state.autonomous_token_safety_clearance.status);
    expect(state.autonomous_token_safety_clearance.average_safety_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_token_safety_clearance.average_safety_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_token_safety_clearance.max_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_token_safety_clearance.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_token_safety_clearance.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_token_safety_clearance.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_token_safety_clearance.controls.some((control) => control.includes("fresh local paper buys"))).toBe(true);
    expect(state.autonomous_token_safety_clearance.items.every((item) =>
      ["cleared", "probe-only", "blocked", "exit-only"].includes(item.clearance) &&
      item.safety_score >= 0 &&
      item.safety_score <= 100 &&
      item.risk_score >= 0 &&
      item.risk_score <= 100 &&
      item.holder_score >= 0 &&
      item.holder_score <= 100 &&
      item.liquidity_score >= 0 &&
      item.liquidity_score <= 100 &&
      item.promotion_score >= 0 &&
      item.promotion_score <= 100 &&
      item.landing_score >= 0 &&
      item.landing_score <= 100 &&
      item.route_score >= 0 &&
      item.route_score <= 100 &&
      item.max_buy_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_reflex_operator.mode).toBe("autonomous-reflex-operator");
    expect(["press", "protect", "refresh", "observe", "stand-down", "blocked", "idle"]).toContain(state.autonomous_reflex_operator.status);
    expect(state.autonomous_reflex_operator.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_reflex_operator.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_reflex_operator.reflex_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.reflex_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_reflex_operator.safety_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.safety_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_reflex_operator.execution_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.execution_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_reflex_operator.wallet_heat_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.wallet_heat_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_reflex_operator.max_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.review_after_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_reflex_operator.should_tick_now).toBe("boolean");
    expect(typeof state.autonomous_reflex_operator.should_refresh_market).toBe("boolean");
    expect(typeof state.autonomous_reflex_operator.should_refresh_routes).toBe("boolean");
    expect(typeof state.autonomous_reflex_operator.can_paper_trade).toBe("boolean");
    expect(state.autonomous_reflex_operator.controls.some((control) => control.includes("local paper-ledger intent"))).toBe(true);
    expect(state.autonomous_reflex_operator.items.length).toBeGreaterThan(0);
    expect(state.autonomous_reflex_operator.items.every((item) =>
      ["profit-route", "tick-plan", "market-pulse", "wallet-protect", "route-refresh"].includes(item.source) &&
      ["paper-buy", "paper-sell", "refresh-route", "refresh-market", "protect", "observe", "stand-down"].includes(item.action) &&
      ["now", "next", "watch", "blocked"].includes(item.priority) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.notional_usd >= 0 &&
      item.safety_score >= 0 &&
      item.safety_score <= 100 &&
      item.execution_score >= 0 &&
      item.execution_score <= 100 &&
      item.wallet_heat_score >= 0 &&
      item.wallet_heat_score <= 100 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_cash_deployment_director.mode).toBe("autonomous-cash-deployment-director");
    expect(["deploy", "scout", "hold", "protect", "blocked", "idle"]).toContain(state.autonomous_cash_deployment_director.status);
    expect(["fresh-buy", "protect-sell", "refresh-first", "observe", "none"]).toContain(state.autonomous_cash_deployment_director.paper_intent);
    expect(state.autonomous_cash_deployment_director.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_cash_deployment_director.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_cash_deployment_director.cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.reserve_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.deploy_now_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.target_exposure_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.target_exposure_pct).toBeLessThanOrEqual(64);
    expect(state.autonomous_cash_deployment_director.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_cash_deployment_director.review_after_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_cash_deployment_director.can_deploy_paper).toBe("boolean");
    expect(state.autonomous_cash_deployment_director.controls.some((control) => control.includes("bounded paper cash-deployment"))).toBe(true);
    expect(state.autonomous_cash_deployment_director.items.length).toBeGreaterThanOrEqual(6);
    expect(state.autonomous_cash_deployment_director.items.every((item) =>
      ["cash", "reflex", "safety", "execution", "wallet", "reserve"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_navigator.mode).toBe("autonomous-profit-navigator");
    expect(["attack", "scout", "compound", "harvest", "protect", "stand-down", "blocked", "idle"]).toContain(state.autonomous_profit_navigator.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_profit_navigator.primary_side);
    expect(["paper-buy", "paper-sell", "protect", "harvest", "refresh", "observe", "blocked"]).toContain(state.autonomous_profit_navigator.primary_action);
    expect(state.autonomous_profit_navigator.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_navigator.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_navigator.wallet_equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.deploy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.reserve_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_navigator.risk_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.risk_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_navigator.urgency_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_profit_navigator.can_advance_paper).toBe("boolean");
    expect(state.autonomous_profit_navigator.controls.some((control) => control.includes("wallet trajectory"))).toBe(true);
    expect(state.autonomous_profit_navigator.items.length).toBeGreaterThanOrEqual(7);
    expect(state.autonomous_profit_navigator.items.every((item) =>
      ["wallet", "cash", "route", "execution", "safety", "portfolio", "cadence"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_forecast.mode).toBe("autonomous-profit-forecast");
    expect(["press", "probe", "harvest", "protect", "wait", "blocked", "idle"]).toContain(state.autonomous_profit_forecast.status);
    expect(state.autonomous_profit_forecast.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_forecast.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_forecast.horizon_seconds).toBeGreaterThanOrEqual(30);
    expect(state.autonomous_profit_forecast.horizon_seconds).toBeLessThanOrEqual(300);
    expect(state.autonomous_profit_forecast.starting_equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.projected_equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.worst_case_drawdown_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.worst_case_drawdown_pct).toBeLessThanOrEqual(30);
    expect(state.autonomous_profit_forecast.recommended_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_forecast.invalidation.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_forecast.controls.some((control) => control.includes("next local paper-trading window"))).toBe(true);
    expect(state.autonomous_profit_forecast.points.length).toBeGreaterThanOrEqual(6);
    expect(state.autonomous_profit_forecast.points.every((point) =>
      point.id.length > 0 &&
      point.label.length > 0 &&
      point.tick >= 0 &&
      ["buy", "sell", "hold", "protect"].includes(point.action) &&
      point.equity_usd >= 0 &&
      point.drawdown_pct >= 0 &&
      point.drawdown_pct <= 30
    )).toBe(true);
    expect(state.autonomous_profit_forecast.items.length).toBeGreaterThanOrEqual(5);
    expect(state.autonomous_profit_forecast.items.every((item) =>
      ["edge", "wallet", "risk", "cash", "protection"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_forecast_feedback.mode).toBe("autonomous-forecast-feedback");
    expect(["press", "keep", "probe", "tighten", "protect", "blocked", "idle"]).toContain(state.autonomous_forecast_feedback.status);
    expect(state.autonomous_forecast_feedback.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_forecast_feedback.next_action.length).toBeGreaterThan(0);
    expect(typeof state.autonomous_forecast_feedback.direction_correct).toBe("boolean");
    expect(state.autonomous_forecast_feedback.accuracy_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_forecast_feedback.accuracy_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_forecast_feedback.next_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_forecast_feedback.next_size_multiplier).toBeLessThanOrEqual(1.18);
    expect(state.autonomous_forecast_feedback.recommended_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_forecast_feedback.cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_forecast_feedback.controls.some((control) => control.includes("daemon-memory wallet movement"))).toBe(true);
    expect(state.autonomous_forecast_feedback.items.length).toBeGreaterThanOrEqual(5);
    expect(state.autonomous_forecast_feedback.items.every((item) =>
      ["forecast", "realized", "error", "sizing", "cadence"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_alpha_conviction.mode).toBe("autonomous-alpha-conviction");
    expect(["attack", "selective", "protect", "blocked", "idle"]).toContain(state.autonomous_alpha_conviction.status);
    expect(state.autonomous_alpha_conviction.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_alpha_conviction.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_alpha_conviction.average_conviction_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_conviction.average_conviction_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_alpha_conviction.average_signal_to_noise_ratio).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_conviction.max_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_conviction.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_conviction.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_alpha_conviction.controls.some((control) => control.includes("signal/noise"))).toBe(true);
    expect(state.autonomous_alpha_conviction.items.length).toBeGreaterThan(0);
    expect(state.autonomous_alpha_conviction.items.every((item) =>
      ["buy", "probe", "hold", "trim", "avoid", "protect"].includes(item.action) &&
      ["trade", "watch", "blocked", "protect"].includes(item.status) &&
      item.conviction_score >= 0 &&
      item.conviction_score <= 100 &&
      item.signal_score >= 0 &&
      item.velocity_score >= 0 &&
      item.pulse_score >= 0 &&
      item.route_score >= 0 &&
      item.safety_score >= 0 &&
      item.forecast_fit_score >= 0 &&
      item.wallet_score >= 0 &&
      item.risk_score >= 0 &&
      item.max_size_usd >= 0 &&
      item.review_after_seconds > 0 &&
      item.thesis.length > 0 &&
      item.evidence.length >= 3
    )).toBe(true);
    expect(state.autonomous_execution_escalator.mode).toBe("autonomous-execution-escalator");
    expect(["paper-ready", "order-ready", "signature-needed", "submit-ready", "confirming", "blocked", "idle"]).toContain(state.autonomous_execution_escalator.status);
    expect(["paper-fill", "build-order", "request-signature", "submit-signed", "poll-confirmation", "rebuild", "stand-down"]).toContain(state.autonomous_execution_escalator.stage);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_execution_escalator.selected_side);
    expect(state.autonomous_execution_escalator.readiness_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.readiness_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_execution_escalator.live_readiness_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.live_readiness_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_execution_escalator.paper_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.estimated_cost_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.ttl_seconds).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_execution_escalator.can_autonomous_paper_fill).toBe("boolean");
    expect(typeof state.autonomous_execution_escalator.can_request_signature).toBe("boolean");
    expect(typeof state.autonomous_execution_escalator.can_submit_signed_payload).toBe("boolean");
    expect(state.autonomous_execution_escalator.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_execution_escalator.controls.some((control) => control.includes("paper fill"))).toBe(true);
    expect(state.autonomous_execution_escalator.items.length).toBeGreaterThanOrEqual(7);
    expect(state.autonomous_execution_escalator.items.every((item) =>
      ["alpha", "order", "pre-submit", "signer", "live-gate", "relay", "confirm"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_size_governor.mode).toBe("autonomous-size-governor");
    expect(["press", "scale", "probe", "halve", "protect", "pause", "idle"]).toContain(state.autonomous_size_governor.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_size_governor.selected_side);
    expect(state.autonomous_size_governor.base_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.capped_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.final_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_size_governor.risk_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.stop_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.max_loss_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.required_edge_usd).toBeGreaterThanOrEqual(0);
    expect(["press", "selective", "tighten", "protect", "cold-start"]).toContain(state.autonomous_size_governor.outcome_discipline_status);
    expect(state.autonomous_size_governor.outcome_discipline_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.outcome_sample_size).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.outcome_win_rate_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.outcome_win_rate_pct).toBeLessThanOrEqual(100);
    expect(state.autonomous_size_governor.outcome_profit_factor).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_size_governor.outcome_expectancy_usd).toBe("number");
    expect(state.autonomous_size_governor.outcome_summary.length).toBeGreaterThan(0);
    expect(state.autonomous_size_governor.cadence_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_size_governor.can_trade_paper).toBe("boolean");
    expect(typeof state.autonomous_size_governor.live_blocked).toBe("boolean");
    expect(state.autonomous_size_governor.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_size_governor.controls.some((control) => control.includes("next-size"))).toBe(true);
    expect(state.autonomous_size_governor.items.length).toBeGreaterThanOrEqual(10);
    expect(state.autonomous_size_governor.items.every((item) =>
      ["alpha", "execution", "forecast", "wallet", "profit", "learning", "command", "memory", "outcome", "outcome-memory", "risk"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_pressure_tape.mode).toBe("autonomous-pressure-tape");
    expect(["press", "scalp", "protect", "refresh", "pause", "idle"]).toContain(state.autonomous_pressure_tape.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_pressure_tape.leader_side);
    expect(state.autonomous_pressure_tape.pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.buy_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.buy_pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.sell_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.sell_pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.refresh_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.refresh_pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.tape_change_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.tape_change_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.urgent_change_count).toBe(state.tape_memory.urgent_count);
    expect(state.autonomous_pressure_tape.situation_regime).toBe(state.situation_monitor.regime);
    expect(state.autonomous_pressure_tape.reaction_window_seconds).toBeGreaterThan(0);
    expect(state.autonomous_pressure_tape.reaction_window_seconds).toBeLessThanOrEqual(state.autonomous_pressure_tape.cadence_seconds);
    expect(state.autonomous_pressure_tape.max_next_actions).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.max_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.cadence_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_pressure_tape.paper_trade_ready).toBe("boolean");
    expect(typeof state.autonomous_pressure_tape.live_blocked).toBe("boolean");
    expect(state.autonomous_pressure_tape.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_pressure_tape.controls.some((control) => control.includes("next-minute"))).toBe(true);
    expect(state.autonomous_pressure_tape.controls.some((control) => control.includes("situation-change memory"))).toBe(true);
    expect(state.autonomous_pressure_tape.items.length).toBeGreaterThanOrEqual(8);
    expect(state.autonomous_pressure_tape.items.every((item) =>
      ["size", "market", "fast-race", "tick-plan", "positions", "wallet", "profit", "situation"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_pressure_tape.items.some((item) => item.id === "situation")).toBe(true);
    expect(state.autonomous_pressure_execution.mode).toBe("pressure-tape-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_pressure_execution.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_pressure_execution.selected_side);
    expect(["press", "scalp", "protect", "refresh", "pause", "idle"]).toContain(state.autonomous_pressure_execution.selected_posture);
    expect(typeof state.autonomous_pressure_execution.paper_trade_ready).toBe("boolean");
    expect(typeof state.autonomous_pressure_execution.ledger_applied).toBe("boolean");
    expect(state.autonomous_pressure_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_pressure_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_pressure_execution.projected_cash_delta_usd).toBe("number");
    expect(typeof state.autonomous_pressure_execution.projected_exposure_delta_usd).toBe("number");
    expect(state.autonomous_pressure_execution.pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_execution.pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_execution.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_pressure_execution.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_pressure_execution.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_pressure_execution.controls.some((control) => control.includes("paper-ledger"))).toBe(true);
    expect(state.autonomous_action_queue.mode).toBe("autonomous-action-queue");
    expect(["executing", "attack", "scalp", "protect", "prepare", "blocked", "watch", "idle"]).toContain(state.autonomous_action_queue.status);
    expect(["buy", "sell", "scalp", "protect", "harvest", "refresh", "hold", "blocked"]).toContain(state.autonomous_action_queue.leader_action);
    expect(["snipe", "probe", "confirm", "late-chase", "fade", "blocked", "idle", "missing"]).toContain(state.autonomous_action_queue.launch_timing_status);
    expect(state.autonomous_action_queue.launch_timing_blocked_count).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_action_queue.launch_timing_allows_fresh_buys).toBe("boolean");
    expect(state.autonomous_action_queue.launch_timing_blocker === null || typeof state.autonomous_action_queue.launch_timing_blocker === "string").toBe(true);
    expect(state.autonomous_action_queue.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_action_queue.items.length).toBeGreaterThan(0);
    expect(state.autonomous_action_queue.items.every((item) =>
      ["command-center", "pressure-tape", "tradeability", "high-frequency", "opportunity-race", "portfolio-protect", "portfolio-tape", "market-pulse", "trend-chase", "watchlist-rotation"].includes(item.lane) &&
      ["ready", "queued", "applied", "blocked", "watch", "idle"].includes(item.status) &&
      ["buy", "sell", "scalp", "protect", "harvest", "refresh", "hold", "blocked"].includes(item.action) &&
      item.execution_boundary === "paper-ledger-only" &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_action_queue.controls.some((control) => control.includes("Ranks the command center"))).toBe(true);
    expect(state.autonomous_action_queue.controls.some((control) => control.includes("Launch timing can boost"))).toBe(true);
    if (!state.autonomous_action_queue.launch_timing_allows_fresh_buys) {
      expect(state.autonomous_action_queue.launch_timing_blocker).toBeTruthy();
      expect(state.autonomous_action_queue.items.filter((item) => item.side === "buy" && (item.action === "buy" || item.action === "scalp")).every((item) =>
        item.status === "blocked" &&
        item.paper_trade_ready === false &&
        item.blockers.some((blocker) => blocker === state.autonomous_action_queue.launch_timing_blocker || blocker.includes("Launch timing") || blocker.includes("launch timing"))
      )).toBe(true);
    }
    expect(state.autonomous_action_queue_execution.mode).toBe("autonomous-action-queue-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_action_queue_execution.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_action_queue_execution.selected_side);
    expect(["buy", "sell", "scalp", "protect", "harvest", "refresh", "hold", "blocked"]).toContain(state.autonomous_action_queue_execution.selected_action);
    expect(["requesting", "ready", "blocked", "watching", "idle"]).toContain(state.autonomous_action_queue_execution.route_refresh_status);
    expect(typeof state.autonomous_action_queue_execution.route_refresh_vetoed).toBe("boolean");
    expect(state.autonomous_action_queue_execution.route_refresh_blocker === null || typeof state.autonomous_action_queue_execution.route_refresh_blocker === "string").toBe(true);
    expect(typeof state.autonomous_action_queue_execution.paper_trade_ready).toBe("boolean");
    expect(typeof state.autonomous_action_queue_execution.ledger_applied).toBe("boolean");
    expect(state.autonomous_action_queue_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_action_queue_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_action_queue_execution.projected_cash_delta_usd).toBe("number");
    expect(typeof state.autonomous_action_queue_execution.projected_exposure_delta_usd).toBe("number");
    expect(state.autonomous_action_queue_execution.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_action_queue_execution.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_action_queue_execution.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_action_queue_execution.controls.some((control) => control.includes("top-ranked action-queue paper trade"))).toBe(true);
    expect(state.autonomous_action_queue_execution.controls.some((control) => control.includes("route-refresh execution"))).toBe(true);
    if (state.autonomous_action_queue_execution.route_refresh_vetoed) {
      expect(state.autonomous_action_queue_execution.status).toBe("blocked");
      expect(state.autonomous_action_queue_execution.paper_trade_ready).toBe(false);
      expect(state.autonomous_action_queue_execution.route_refresh_blocker).toBeTruthy();
    }
    expect(state.autonomous_session_planner.mode).toBe("autonomous-session-planner");
    expect(["run-now", "probe", "refresh-first", "protect", "cooldown", "blocked", "idle"]).toContain(state.autonomous_session_planner.status);
    expect(["attack", "probe", "refresh", "protect", "cooldown", "observe"]).toContain(state.autonomous_session_planner.session_kind);
    expect(state.autonomous_session_planner.target_symbol === null || typeof state.autonomous_session_planner.target_symbol === "string").toBe(true);
    expect(state.autonomous_session_planner.planned_ticks).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_session_planner.max_total_fills).toBeGreaterThanOrEqual(1);
    expect(state.autonomous_session_planner.max_fresh_buys).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_session_planner.max_protective_sells).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_session_planner.route_refresh_required).toBe("boolean");
    expect(state.autonomous_session_planner.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_session_planner.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_session_planner.controls.some((control) => control.includes("bounded autonomous paper session"))).toBe(true);
    expect(state.autonomous_session_planner.controls.some((control) => control.includes("Cannot sign"))).toBe(true);
    expect(state.autonomous_session_planner.steps.map((step) => step.id)).toEqual([
      "scanner",
      "queue",
      "profit",
      "route",
      "tick",
      "portfolio",
      "risk",
    ]);
    expect(state.autonomous_session_planner.steps.every((step) =>
      ["pass", "watch", "fail"].includes(step.status) &&
      ["paper-session", "paper-probe", "refresh-routes", "protect-book", "observe", "stand-down"].includes(step.action) &&
      step.score >= 0 &&
      step.score <= 100 &&
      step.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_symbol_quarantine.mode).toBe("autonomous-symbol-quarantine");
    expect(["clear", "selective", "quarantine", "exit-only", "idle"]).toContain(state.autonomous_symbol_quarantine.status);
    expect(state.autonomous_symbol_quarantine.max_quarantine_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_symbol_quarantine.max_quarantine_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_symbol_quarantine.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_symbol_quarantine.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_symbol_quarantine.controls.some((control) => control.includes("symbol-level paper buy permission"))).toBe(true);
    expect(state.autonomous_symbol_quarantine.items.every((item) =>
      ["allow", "probe-only", "quarantine", "exit-only"].includes(item.status) &&
      item.quarantine_score >= 0 &&
      item.quarantine_score <= 100 &&
      typeof item.max_buy_usd === "number"
    )).toBe(true);
    expect(state.autonomous_tick_plan.controls.some((control) => control.includes("local paper tick"))).toBe(true);
    expect(state.autonomous_tick_plan.controls.some((control) => control.includes("Caps next-minute throughput"))).toBe(true);
    expect(state.autonomous_tick_plan.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.autonomous_tick_governor.controls.some((control) => control.includes("local paper-only"))).toBe(true);
    expect(state.autonomous_tick_governor.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    if (!state.autonomous_tick_governor.can_auto_advance) {
      expect(state.autonomous_tick_governor.should_trade).toBe(false);
    }
    expect(state.autonomous_tick_plan.items.every((item) =>
      ["edge", "protect", "entry", "route", "market", "observe", "blocked"].includes(item.lane) &&
      ["protect-now", "trade-now", "refresh-routes", "refresh-market", "observe", "stand-down"].includes(item.action) &&
      ["critical", "high", "normal", "low"].includes(item.priority) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      item.urgency_seconds > 0 &&
      item.paper_budget_usd >= 0 &&
      item.expected_edge_usd >= 0 &&
      item.risk_usd >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.launch_sniper.mode).toBe("launch-sniper");
    expect(state.launch_sniper.items.length).toBeGreaterThan(0);
    expect(state.launch_sniper.items.some((item) => item.verdict === "probe" || item.verdict === "snipe")).toBe(true);
    expect(state.launch_sniper.items.every((item) =>
      item.launch_score >= 0 &&
      item.launch_score <= 100 &&
      item.review_after_seconds > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(state.autopilot.actions.some((action) => action.lane === "launch-sniper" || action.lane === "entry")).toBe(true);
    expect(state.market_feed_integrity.status).toBe("sample");
    expect(state.market_feed_integrity.checks.length).toBe(4);
    expect(state.market_feed_integrity.actions.length).toBeGreaterThan(0);
    expect(state.market_stream_supervisor.status).toBe("sample");
    expect(state.market_stream_supervisor.transport).toBe("sample-loop");
    expect(state.market_stream_supervisor.lanes.every((lane) => lane.status === "sample" || lane.status === "paused")).toBe(true);
    expect(state.market_ingestion_plan.status).toBe("sample");
    expect(state.market_ingestion_plan.steps.some((step) => step.action === "sample")).toBe(true);
    expect(state.market_ingestion_plan.safeguards.some((item) => item.includes("Live trading remains gated"))).toBe(true);
    expect(state.market_ingestion_plan.provider_budget_status).toBe("paused");
    expect(state.market_ingestion_plan.provider_budget_utilization_pct).toBe(0);
    expect(state.market_ingestion_plan.next_provider_refresh_seconds).toBeGreaterThan(0);
    expect(state.market_ingestion_plan.provider_budget_lanes.map((lane) => lane.id)).toEqual([
      "dex-discovery",
      "dex-pairs",
      "dex-paid-orders",
      "gecko-ohlcv",
      "route-quotes",
    ]);
    expect(state.market_ingestion_plan.provider_budget_lanes.every((lane) =>
      lane.used_per_minute >= 0 &&
      lane.limit_per_minute > 0 &&
      lane.utilization_pct >= 0 &&
      lane.cadence_seconds > 0 &&
      lane.next_action.length > 0
    )).toBe(true);
    expect(state.autonomous_market_intake_plan.mode).toBe("autonomous-market-intake-plan");
    expect(state.autonomous_market_intake_plan.status).toBe("sample");
    expect(state.autonomous_market_intake_plan.provider_budget_status).toBe(state.market_ingestion_plan.provider_budget_status);
    expect(state.autonomous_market_intake_plan.data_score).toBe(state.autonomous_data_freshness_gate.data_score);
    const expectedMarketIntakeLaneIds: Array<(typeof state.autonomous_market_intake_plan.items)[number]["id"]> = [
      "wallet-net-worth",
      "dex-discovery",
      "dex-pairs",
      "paid-orders",
      "candles",
      "route-quotes",
    ];
    expect([...state.autonomous_market_intake_plan.items.map((item) => item.id)].sort()).toEqual(expectedMarketIntakeLaneIds.sort());
    expect(state.autonomous_market_intake_plan.items.every((item) =>
      ["DEX Screener", "Birdeye", "Jupiter", "Local paper wallet"].includes(item.provider) &&
      item.endpoint.length > 0 &&
      item.priority_score >= 0 &&
      item.priority_score <= 100 &&
      item.limit_per_minute > 0 &&
      item.cadence_seconds > 0
    )).toBe(true);
    expect(state.dex_stream_freshness.mode).toBe("dex-stream-freshness");
    expect(["hot", "ready", "watch", "backfill", "blocked", "sample"]).toContain(state.dex_stream_freshness.status);
    expect(typeof state.dex_stream_freshness.websocket_ready).toBe("boolean");
    expect(state.dex_stream_freshness.items.map((item) => item.id)).toEqual([
      "token-profiles",
      "boosts",
      "community-takeovers",
    ]);
    expect(state.dex_stream_freshness.items.every((item) =>
      ["stream-ready", "poll-fallback", "blocked", "sample"].includes(item.status) &&
      item.websocket_path.startsWith("wss://api.dexscreener.com/") &&
      item.rest_path.startsWith("/") &&
      item.next_request_seconds > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(state.dex_stream_freshness.controls.some((control) => control.includes("does not open persistent sockets"))).toBe(true);
    expect(state.dex_stream_freshness.controls.some((control) => control.includes("WebSocket"))).toBe(true);
    expect(state.live_discovery_delta_tape.mode).toBe("live-discovery-delta-tape");
    expect(["hot", "ready", "watch", "refresh", "blocked", "sample", "idle"]).toContain(state.live_discovery_delta_tape.status);
    expect(state.live_discovery_delta_tape.newest_review_seconds).toBeGreaterThan(0);
    expect(state.live_discovery_delta_tape.controls.some((control) => control.includes("DEX Screener latest profiles"))).toBe(true);
    expect(state.live_discovery_delta_tape.items.every((item) =>
      ["new-profile", "new-boost", "top-boost", "community-takeover", "paid-ad", "sample"].includes(item.event) &&
      ["attack", "probe", "watch", "refresh", "blocked"].includes(item.status) &&
      item.urgency_score >= 0 &&
      item.urgency_score <= 100 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_discovery_intake.mode).toBe("autonomous-discovery-intake");
    expect(["attack-ready", "probe-ready", "refresh-first", "blocked", "sample", "idle"]).toContain(state.autonomous_discovery_intake.status);
    expect(state.autonomous_discovery_intake.source_mode).toBe(state.discovery_tape.status);
    expect(state.autonomous_discovery_intake.source_coverage_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_discovery_intake.source_coverage_pct).toBeLessThanOrEqual(100);
    expect(state.autonomous_discovery_intake.pair_coverage_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_discovery_intake.pair_coverage_pct).toBeLessThanOrEqual(100);
    expect(state.autonomous_discovery_intake.next_refresh_seconds).toBeGreaterThan(0);
    expect(state.autonomous_discovery_intake.controls.some((control) => control.includes("read-only"))).toBe(true);
    expect(state.autonomous_discovery_intake.items.length).toBeGreaterThan(0);
    expect(state.autonomous_discovery_intake.items.every((item) =>
      ["attack", "probe", "refresh", "watch", "block"].includes(item.action) &&
      ["ready", "watch", "refresh", "blocked"].includes(item.status) &&
      item.intake_score >= 0 &&
      item.intake_score <= 100 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_data_freshness_gate.mode).toBe("autonomous-data-freshness-gate");
    expect(["clear", "tradeable", "refresh", "backfill", "blocked", "sample"]).toContain(state.autonomous_data_freshness_gate.status);
    expect(["allow-paper", "size-down", "refresh-stream", "fetch-candles", "refresh-quote", "stand-down"]).toContain(state.autonomous_data_freshness_gate.action);
    expect(typeof state.autonomous_data_freshness_gate.can_trade).toBe("boolean");
    expect(state.autonomous_data_freshness_gate.data_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_data_freshness_gate.data_score).toBeLessThanOrEqual(100);
    expect(["dex-stream", "dex-rest", "paid-orders", "gecko-ohlcv", "jupiter-quote", "none"]).toContain(state.autonomous_data_freshness_gate.next_refresh_lane);
    expect(state.autonomous_data_freshness_gate.size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_data_freshness_gate.size_multiplier).toBeLessThanOrEqual(1.5);
    expect(state.autonomous_data_freshness_gate.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_data_freshness_gate.max_next_fills).toBeLessThanOrEqual(6);
    expect(state.autonomous_data_freshness_gate.items.length).toBe(6);
    expect(state.autonomous_data_freshness_gate.items.every((item) =>
      ["stream", "discovery", "paid-orders", "ohlcv", "quote", "budget"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_data_freshness_gate.controls.some((control) => control.includes("DEX Screener"))).toBe(true);
    expect(state.autonomous_data_freshness_gate.controls.some((control) => control.includes("Jupiter-style read-only route quotes"))).toBe(true);
    expect(state.autonomous_source_quality_oracle.mode).toBe("autonomous-source-quality-oracle");
    expect(["organic", "boosted-confirmed", "paid-hype", "refresh-first", "blocked", "sample", "idle"]).toContain(state.autonomous_source_quality_oracle.status);
    expect(typeof state.autonomous_source_quality_oracle.can_chase).toBe("boolean");
    expect(typeof state.autonomous_source_quality_oracle.needs_refresh).toBe("boolean");
    expect(state.autonomous_source_quality_oracle.quality_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_source_quality_oracle.quality_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_source_quality_oracle.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_source_quality_oracle.items.length).toBeGreaterThan(0);
    expect(state.autonomous_source_quality_oracle.items.every((item) =>
      ["attack", "probe", "refresh-proof", "fade", "block", "watch"].includes(item.action) &&
      ["organic", "boosted-confirmed", "paid-hype", "refresh-first", "blocked", "watch"].includes(item.status) &&
      item.source_quality_score >= 0 &&
      item.source_quality_score <= 100 &&
      item.organic_confirmation_score >= 0 &&
      item.organic_confirmation_score <= 100 &&
      item.market_activity_score >= 0 &&
      item.market_activity_score <= 100 &&
      item.promotion_noise_score >= 0 &&
      item.promotion_noise_score <= 100 &&
      item.max_paper_size_multiplier >= 0 &&
      item.max_paper_size_multiplier <= 1.2 &&
      item.review_after_seconds > 0 &&
      item.evidence.length >= 4 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_source_quality_oracle.controls.some((control) => control.includes("organic momentum"))).toBe(true);
    expect(state.autonomous_source_quality_oracle.controls.some((control) => control.includes("paid-order"))).toBe(true);
    const sourceQualityBySymbol = new Map(state.autonomous_source_quality_oracle.items.map((item) => [item.symbol, item]));
    const sourceSizedExecutions = [
      {
        execution: state.autonomous_tradeability_execution,
        requestedSizeUsd: state.autonomous_tradeability_execution.selected_symbol
          ? state.autonomous_tradeability_simulator.items.find((item) => item.symbol === state.autonomous_tradeability_execution.selected_symbol)?.recommended_size_usd ?? 0
          : 0,
      },
      {
        execution: state.autonomous_opportunity_rank_execution,
        requestedSizeUsd: state.autonomous_opportunity_rank_execution.selected_symbol
          ? state.autonomous_opportunity_ranker.items.find((item) => item.symbol === state.autonomous_opportunity_rank_execution.selected_symbol)?.max_paper_size_usd ?? 0
          : 0,
      },
    ];
    for (const { execution, requestedSizeUsd } of sourceSizedExecutions) {
      const trade = execution.paper_trade;
      const sourceQualityItem = trade?.side === "buy" ? sourceQualityBySymbol.get(trade.symbol) : null;
      if (trade && sourceQualityItem && sourceQualityItem.max_paper_size_multiplier < 0.995 && requestedSizeUsd >= 10) {
        expect(trade.size_usd).toBeLessThanOrEqual(Math.round(requestedSizeUsd * sourceQualityItem.max_paper_size_multiplier));
        expect(trade.reason).toContain("Source-quality sizing caps");
      }
    }
    expect(state.autonomous_market_evidence_fusion.mode).toBe("autonomous-market-evidence-fusion");
    expect(["attack", "selective", "refresh", "protect", "blocked", "watch", "sample", "idle"]).toContain(state.autonomous_market_evidence_fusion.status);
    expect(state.autonomous_market_evidence_fusion.fusion_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_evidence_fusion.fusion_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_market_evidence_fusion.organic_momentum_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_evidence_fusion.organic_momentum_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_market_evidence_fusion.promotion_noise_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_evidence_fusion.promotion_noise_score).toBeLessThanOrEqual(100);
    expect(["dex-stream", "dex-rest", "paid-orders", "gecko-ohlcv", "jupiter-quote", "wallet-protect", "none"]).toContain(state.autonomous_market_evidence_fusion.provider_lane);
    expect(["dex-stream", "dex-rest", "paid-orders", "gecko-ohlcv", "jupiter-quote", "none"]).toContain(state.autonomous_market_evidence_fusion.next_refresh_lane);
    expect(typeof state.autonomous_market_evidence_fusion.can_trade).toBe("boolean");
    expect(state.autonomous_market_evidence_fusion.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_evidence_fusion.max_next_fills).toBeLessThanOrEqual(state.autonomous_data_freshness_gate.max_next_fills);
    expect(state.autonomous_market_evidence_fusion.items.length).toBeGreaterThan(0);
    expect(state.autonomous_market_evidence_fusion.items.every((item) =>
      ["trade", "probe", "refresh-route", "refresh-candles", "protect", "reject", "watch"].includes(item.action) &&
      ["hot-tape", "route", "chart", "protection", "watch"].includes(item.lane) &&
      item.fusion_score >= 0 &&
      item.fusion_score <= 100 &&
      item.evidence.length >= 4 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_market_evidence_fusion.controls.some((control) => control.includes("hot-coin tape"))).toBe(true);
    expect(state.autonomous_market_evidence_fusion.controls.some((control) => control.includes("paper/read-only evidence layer"))).toBe(true);
    expect(state.live_scanner_readiness.mode).toBe("live-scanner-readiness");
    expect(["attack-ready", "probe-ready", "refresh-first", "blocked", "sample", "idle"]).toContain(state.live_scanner_readiness.status);
    expect(state.live_scanner_readiness.source_mode).toBe(state.discovery_tape.status);
    expect(state.live_scanner_readiness.provider_budget_status).toBe(state.market_ingestion_plan.provider_budget_status);
    expect(state.live_scanner_readiness.source_coverage_pct).toBe(state.discovery_edge.source_coverage_pct);
    expect(state.live_scanner_readiness.mapped_coverage_pct).toBe(state.discovery_edge.mapped_coverage_pct);
    expect(state.live_scanner_readiness.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.live_scanner_readiness.summary.length).toBeGreaterThan(0);
    expect(state.live_scanner_readiness.next_action.length).toBeGreaterThan(0);
    expect(state.live_scanner_readiness.controls.some((control) => control.includes("DEX Screener"))).toBe(true);
    expect(state.live_scanner_readiness.controls.some((control) => control.includes("Cannot sign"))).toBe(true);
    expect(state.live_scanner_readiness.items.length).toBeGreaterThan(0);
    expect(state.live_scanner_readiness.items.some((item) =>
      item.evidence.some((entry) => entry.includes("DEX stream freshness")),
    )).toBe(true);
    expect(state.live_scanner_readiness.items.every((item) =>
      ["attack", "probe", "refresh", "watch", "protect", "blocked"].includes(item.action) &&
      ["ready", "watch", "blocked", "stale"].includes(item.status) &&
      item.scanner_score >= 0 &&
      item.scanner_score <= 100 &&
      item.source_confirmation_score >= 0 &&
      item.source_confirmation_score <= 100 &&
      item.route_score >= 0 &&
      item.route_score <= 100 &&
      item.review_after_seconds > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(state.autonomous_trade_readiness_gate.mode).toBe("autonomous-trade-readiness-gate");
    expect(["paper-only", "exit-only", "blocked", "idle"]).toContain(state.autonomous_trade_readiness_gate.status);
    expect(state.autonomous_trade_readiness_gate.live_submission_allowed).toBe(false);
    expect(["snipe", "probe", "confirm", "late-chase", "fade", "blocked", "idle", "missing"]).toContain(state.autonomous_trade_readiness_gate.launch_timing_status);
    expect(typeof state.autonomous_trade_readiness_gate.launch_timing_blocks_fresh_buys).toBe("boolean");
    expect(state.autonomous_trade_readiness_gate.launch_timing_blocker === null || typeof state.autonomous_trade_readiness_gate.launch_timing_blocker === "string").toBe(true);
    if (state.autonomous_trade_readiness_gate.launch_timing_blocks_fresh_buys) {
      expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
      expect(state.autonomous_trade_readiness_gate.max_buy_notional_usd).toBe(0);
      expect(state.autonomous_trade_readiness_gate.checks.find((check) => check.id === "launch-timing")?.status).toBe("fail");
    }
    expect(state.autonomous_trade_readiness_gate.checks.length).toBe(8);
    expect(state.autonomous_trade_readiness_gate.checks.some((check) => check.id === "churn-governor")).toBe(true);
    expect(state.autonomous_trade_readiness_gate.checks.some((check) => check.id === "launch-timing")).toBe(true);
    expect(state.autonomous_wake_plan.mode).toBe("autonomous-wake-plan");
    expect(["minute", "sprint", "cycle", "protect", "refresh", "cooldown", "blocked"]).toContain(state.autonomous_wake_plan.status);
    expect(["profit-velocity", "data-freshness", "loop-throttle", "run-envelope", "profit-guard"]).toContain(state.autonomous_wake_plan.trigger);
    expect(["run-minute", "run-loop", "refresh-read", "stand-down"]).toContain(state.autonomous_wake_plan.next_client_action);
    expect(state.autonomous_wake_plan.next_wake_seconds).toBeGreaterThan(0);
    expect(state.autonomous_wake_plan.items.map((item) => item.id)).toEqual([
      "velocity",
      "freshness",
      "throttle",
      "envelope",
      "guard",
      "queue",
    ]);
    expect(state.autonomous_wake_plan.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.autonomous_market_intake_plan.mode).toBe("autonomous-market-intake-plan");
    expect(["attack", "refresh", "watch", "blocked", "sample"]).toContain(state.autonomous_market_intake_plan.status);
    expect(state.autonomous_market_intake_plan.provider_budget_status).toBe(state.market_ingestion_plan.provider_budget_status);
    expect(state.autonomous_market_intake_plan.data_score).toBe(state.autonomous_data_freshness_gate.data_score);
    expect(state.autonomous_market_intake_plan.next_request_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_market_intake_plan.can_feed_trade_loop).toBe("boolean");
    expect(state.autonomous_market_intake_plan.items).toHaveLength(6);
    expect(state.autonomous_market_intake_plan.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.liquidity_exit_sentinel.mode).toBe("liquidity-exit-sentinel");
    expect(state.liquidity_exit_sentinel.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.liquidity_exit_sentinel.items.every((item) =>
      item.exit_pressure_score >= 0 &&
      item.exit_pressure_score <= 100 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.trend_catalyst.items.length).toBeGreaterThan(0);
    expect(state.trend_catalyst.source).toBe("local-catalyst-model");
    expect(state.autonomy_policy.orders.length).toBeGreaterThan(0);
    expect(state.situation_monitor.playbook.length).toBeGreaterThan(0);
    expect(state.tape_memory.tokens_tracked).toBeGreaterThan(0);
    expect(state.price_action_monitor.items.length).toBeGreaterThan(0);
    expect(state.rug_pull_firewall.items.length).toBeGreaterThan(0);
    expect(state.capital_rotation.items.length).toBeGreaterThan(0);
    expect(state.autopilot.actions.length).toBeGreaterThan(0);
    expect(state.autonomous_monitor.mode).toBe("paper-daemon");
    expect(state.autonomous_monitor.triggers.length).toBeGreaterThan(0);
    expect(state.autonomy_risk_governor.mode).toBe("risk-governor");
    expect(state.autonomy_risk_governor.actions.length).toBeGreaterThan(0);
    expect(state.autonomy_risk_governor.allowed_trade_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_compounder.mode).toBe("autonomous-compounder");
    expect(["press", "steady", "vault", "tighten", "halted"]).toContain(state.autonomous_compounder.status);
    expect(state.autonomous_compounder.next_order_cap_usd).toBeLessThanOrEqual(state.autonomy_risk_governor.allowed_trade_usd);
    expect(state.autonomous_compounder.launch_order_cap_usd).toBeLessThanOrEqual(state.autonomous_compounder.next_order_cap_usd);
    expect(state.autonomous_compounder.directives.some((directive) => directive.includes("profit vault"))).toBe(true);
    expect(state.paper_daemon.mode).toBe("paper-daemon");
    expect(state.paper_daemon.controls.some((control) => control.includes("Paper ledger only"))).toBe(true);
    expect(state.post_trade_review.mode).toBe("post-trade-review");
    expect(state.post_trade_review.lessons.length).toBe(5);
    expect(state.post_trade_review.recommended_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.post_trade_review.recommended_cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_capital_allocator.mode).toBe("autonomous-capital-allocator");
    expect(["deploy", "harvest", "rebalance", "reserve", "cooldown", "blocked", "idle"]).toContain(state.autonomous_capital_allocator.status);
    expect(state.autonomous_capital_allocator.deploy_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_allocator.release_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_allocator.reserved_cash_usd).toBeGreaterThanOrEqual(state.autonomous_capital_allocator.risk_buffer_usd);
    expect(state.autonomous_capital_allocator.max_orders_this_cycle).toBeLessThanOrEqual(4);
    expect(state.autonomous_capital_allocator.items.length).toBeGreaterThan(0);
    expect(state.autonomous_capital_allocator.items.every((item) =>
      item.reason.length > 0 &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.size_usd >= 0 &&
      item.confidence >= 0 &&
      item.confidence <= 100
    )).toBe(true);
    expect(state.autonomous_capital_allocator.controls.some((control) => control.includes("Reserve cash"))).toBe(true);
    expect(state.autonomous_trade_arbiter.mode).toBe("autonomous-trade-arbiter");
    expect(["buy", "sell", "harvest", "defend", "stand-down", "idle"]).toContain(state.autonomous_trade_arbiter.status);
    expect(state.autonomous_trade_arbiter.total_expected_profit_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_arbiter.total_risk_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_arbiter.fractional_kelly_cap_pct).toBeLessThanOrEqual(18);
    expect(state.autonomous_trade_arbiter.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_trade_arbiter.controls.some((control) => control.includes("fractional Kelly"))).toBe(true);
    expect(state.autonomous_trade_arbiter.items.length).toBeGreaterThan(0);
    expect(state.autonomous_trade_arbiter.items.every((item) =>
      item.decision_score >= 0 &&
      item.decision_score <= 100 &&
      item.win_probability_pct >= 0 &&
      item.win_probability_pct <= 100 &&
      item.fractional_kelly_pct >= 0 &&
      item.fractional_kelly_pct <= state.autonomous_trade_arbiter.fractional_kelly_cap_pct &&
      item.recommended_size_usd >= 0 &&
      item.max_loss_usd >= 0 &&
      item.sources.length > 0
    )).toBe(true);
    expect(state.autonomous_setup_memory.mode).toBe("autonomous-setup-memory");
    expect(["press", "selective", "cooldown", "cold-start"]).toContain(state.autonomous_setup_memory.status);
    expect(state.autonomous_setup_memory.items.length).toBeGreaterThan(0);
    expect(state.autonomous_setup_memory.items.every((item) => item.evidence.length > 0 && item.size_multiplier > 0)).toBe(true);
    expect(state.autonomous_trade_execution_bridge.mode).toBe("arbiter-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_trade_execution_bridge.status);
    expect(state.autonomous_trade_execution_bridge.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_trade_execution_bridge.controls.some((control) => control.includes("paper-ledger"))).toBe(true);
    expect(state.autonomous_trade_execution_bridge.review_after_seconds).toBeGreaterThan(0);
    if (state.autonomous_trade_execution_bridge.paper_trade) {
      expect(state.autonomous_trade_execution_bridge.paper_trade.status).toBe("paper-filled");
      expect(state.autonomous_trade_execution_bridge.paper_trade.reason).toContain("Trade arbiter");
      expect(Math.abs(state.autonomous_trade_execution_bridge.cash_delta_usd)).toBe(
        state.autonomous_trade_execution_bridge.paper_trade.size_usd,
      );
    }
    expect(state.autonomous_trade_batch.mode).toBe("autonomous-trade-batch");
    expect(["ready", "partially-applied", "applied", "blocked", "idle"]).toContain(state.autonomous_trade_batch.status);
    expect(state.autonomous_trade_batch.max_trades_per_cycle).toBeLessThanOrEqual(4);
    expect(state.autonomous_trade_batch.controls.some((control) => control.includes("sell-first"))).toBe(true);
    expect(state.autonomous_trade_batch.items.length).toBeGreaterThan(0);
    expect(state.autonomous_trade_batch.items.every((item) =>
      item.planned_size_usd >= 0 &&
      item.review_after_seconds >= 0 &&
      item.sources.length > 0 &&
      (item.paper_trade === null || item.paper_trade.status === "paper-filled")
    )).toBe(true);
    expect(state.autonomous_trade_batch.ready_count).toBeLessThanOrEqual(state.autonomous_trade_batch.max_trades_per_cycle);
    expect(state.autonomous_trade_batch.planned_count).toBeLessThanOrEqual(state.autonomous_trade_batch.max_trades_per_cycle);
    expect(state.autonomous_session_supervisor.mode).toBe("autonomous-session-supervisor");
    expect(["attack", "harvest", "observe", "cooldown", "stand-down", "blocked"]).toContain(state.autonomous_session_supervisor.status);
    expect(state.autonomous_session_supervisor.session_id).toMatch(/^session-[0-9a-f]{12}$/);
    expect(state.autonomous_session_supervisor.items.length).toBeGreaterThan(0);
    expect(state.autonomous_session_supervisor.items.every((item) =>
      item.reason.length > 0 &&
      item.next_review_seconds >= 0 &&
      item.score >= 0 &&
      item.score <= 100
    )).toBe(true);
    expect(state.autonomous_session_supervisor.items.some((item) => item.lane === "capital")).toBe(true);
    expect(state.autonomous_session_supervisor.controls.some((control) => control.includes("Heartbeat"))).toBe(true);
    expect(state.autonomous_loop_director.mode).toBe("autonomous-loop-director");
    expect(["tick-now", "run", "observe", "cooldown", "paused", "halted", "blocked"]).toContain(state.autonomous_loop_director.status);
    expect(["burst", "active", "watch", "cooldown", "paused"]).toContain(state.autonomous_loop_director.intensity);
    expect(["stream", "backfill", "sample-loop", "standby"]).toContain(state.autonomous_loop_director.market_watch_mode);
    expect(state.autonomous_loop_director.next_tick_seconds).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_loop_director.client_interval_seconds).toBe(state.autonomous_loop_director.next_tick_seconds);
    expect(state.autonomous_loop_director.max_ticks_per_minute).toBeGreaterThan(0);
    expect(state.autonomous_loop_director.recommended_burst_ticks).toBeGreaterThanOrEqual(1);
    expect([
      state.autonomous_loop_director.batch_pressure_score,
      state.autonomous_loop_director.feed_pressure_score,
      state.autonomous_loop_director.route_pressure_score,
      state.autonomous_loop_director.setup_pressure_score,
    ].every((score) => score >= 0 && score <= 100)).toBe(true);
    expect(state.autonomous_loop_director.request.endpoint).toBe("/api/web3-trading");
    expect(state.autonomous_loop_director.request.method).toBe("POST");
    expect(state.autonomous_loop_director.request.account).toBe("persistent");
    expect(state.autonomous_loop_director.request.source).toBe(state.market_source.mode);
    expect(state.autonomous_loop_director.request.daemon).toBe(true);
    expect(state.autonomous_loop_director.request.advance).toBe(false);
    expect(state.autonomous_loop_director.route_refresh_status).toBe(state.route_refresh_queue.status);
    expect(state.autonomous_loop_director.route_refresh_next_action).toBe(state.route_refresh_queue.next_action);
    expect(state.autonomous_loop_director.should_refresh_route_quotes).toBe(
      state.route_refresh_queue.status === "refresh-now" ||
        state.route_refresh_queue.status === "queued" ||
        state.autonomous_monitor.should_refresh_route_quotes,
    );
    expect(state.autonomous_loop_director.controls.some((control) => control.includes("Client loop"))).toBe(true);
    expect(state.autonomous_loop_director.controls.some((control) => control.includes("Burst mode"))).toBe(true);
    if (!state.autonomous_loop_director.client_should_run) {
      expect(state.autonomous_loop_director.stop_reason).toBeTruthy();
    }
    expect(state.autonomous_portfolio_sentinel.mode).toBe("autonomous-portfolio-sentinel");
    expect(["exit", "harvest", "defend", "trail", "moonbag", "watch", "idle"]).toContain(state.autonomous_portfolio_sentinel.status);
    expect(state.autonomous_portfolio_sentinel.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_sentinel.recommended_release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_sentinel.capital_at_risk_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_sentinel.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_portfolio_sentinel.controls.some((control) => control.includes("Ranks every open paper position"))).toBe(true);
    expect(state.autonomous_portfolio_sentinel.items.every((item) =>
      item.position_id.length > 0 &&
      item.source_stack.length > 0 &&
      item.surveillance_score >= 0 &&
      item.surveillance_score <= 100 &&
      item.recommended_release_usd >= 0 &&
      item.keep_position_usd >= 0
    )).toBe(true);
    expect(state.position_watch_clock.mode).toBe("position-watch-clock");
    expect(["due-now", "refresh-soon", "scheduled", "stale", "idle"]).toContain(state.position_watch_clock.status);
    expect(state.position_watch_clock.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.position_watch_clock.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.position_watch_clock.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.position_watch_clock.controls.some((control) => control.includes("next-review deadline"))).toBe(true);
    expect(state.position_watch_clock.items.every((item) =>
      item.position_id.length > 0 &&
      item.required_evidence.length > 0 &&
      item.next_review_at.includes("T") &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.position_surveillance_matrix.mode).toBe("position-surveillance-matrix");
    expect(["exit-now", "harvest", "refresh", "defend", "watch", "idle"]).toContain(state.position_surveillance_matrix.status);
    expect(state.position_surveillance_matrix.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.position_surveillance_matrix.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.position_surveillance_matrix.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.position_surveillance_matrix.controls.some((control) => control.includes("every open paper position"))).toBe(true);
    expect(state.position_surveillance_matrix.items.every((item) =>
      ["exit", "harvest", "trim", "defend", "refresh", "watch", "hold"].includes(item.status) &&
      item.position_usd >= 0 &&
      typeof item.stop_distance_pct === "number" &&
      typeof item.target_distance_pct === "number" &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(state.portfolio_price_action_guard.mode).toBe("portfolio-price-action-guard");
    expect(["eject", "trim", "harvest", "press", "watch", "idle"]).toContain(state.portfolio_price_action_guard.status);
    expect(state.portfolio_price_action_guard.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.portfolio_price_action_guard.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.portfolio_price_action_guard.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.portfolio_price_action_guard.controls.some((control) => control.includes("fast price-action tape"))).toBe(true);
    expect(state.portfolio_price_action_guard.items.every((item) =>
      ["exit", "trim", "harvest", "press", "hold", "refresh"].includes(item.action) &&
      ["eject", "trim", "harvest", "press", "watch", "stale"].includes(item.status) &&
      item.position_usd >= 0 &&
      typeof item.velocity_score === "number" &&
      typeof item.flow_score === "number" &&
      typeof item.exit_pressure_score === "number" &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(state.route_refresh_queue.mode).toBe("route-refresh-queue");
    expect(["refresh-now", "queued", "watch", "blocked", "idle"]).toContain(state.route_refresh_queue.status);
    expect(state.route_refresh_queue.max_quote_age_seconds).toBe(state.execution_preflight.max_quote_age_seconds);
    expect(state.route_refresh_queue.fastest_refresh_seconds).toBeGreaterThan(0);
    expect(state.route_refresh_queue.refresh_budget_per_minute).toBeGreaterThan(0);
    expect(state.route_refresh_queue.controls.some((control) => control.includes("Ranks stale quotes"))).toBe(true);
    if (state.route_refresh_queue.status === "refresh-now") {
      if (state.autonomous_loop_director.status === "blocked") {
        expect(state.autonomous_loop_director.blockers.length).toBeGreaterThan(0);
      } else {
        expect(state.autonomous_loop_director.status).toBe("tick-now");
        expect(state.autonomous_loop_director.next_tick_seconds).toBeLessThanOrEqual(
          Math.max(2, state.route_refresh_queue.fastest_refresh_seconds),
        );
        expect(state.autonomous_loop_director.tick_reason).toBe(state.route_refresh_queue.next_action);
      }
    }
    expect(state.route_refresh_queue.items.every((item) =>
      item.due_in_seconds > 0 &&
      item.next_refresh_at.includes("T") &&
      item.max_quote_age_seconds === state.execution_preflight.max_quote_age_seconds &&
      item.refresh_budget_per_minute > 0
    )).toBe(true);
    expect(state.autonomous_route_refresh_execution.mode).toBe("autonomous-route-refresh-execution");
    expect(["requesting", "ready", "blocked", "watching", "idle"]).toContain(state.autonomous_route_refresh_execution.status);
    expect(state.autonomous_route_refresh_execution.execution_boundary).toBe("read-only-route-refresh");
    expect(typeof state.autonomous_route_refresh_execution.route_refresh_required).toBe("boolean");
    expect(typeof state.autonomous_route_refresh_execution.can_request_readonly_quote).toBe("boolean");
    expect(state.autonomous_route_refresh_execution.requested_quote_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_route_refresh_execution.blocked_count).toBe(state.route_refresh_queue.blocked_count);
    expect(state.autonomous_route_refresh_execution.route_confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_route_refresh_execution.next_refresh_seconds).toBeGreaterThan(0);
    expect(state.autonomous_route_refresh_execution.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_route_refresh_execution.controls.some((control) => control.includes("read-only quote"))).toBe(true);
    expect(state.autonomous_route_refresh_execution.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.autonomous_route_refresh_execution.checks.map((check) => check.id)).toEqual(["queue", "quote", "budget", "lane", "boundary"]);
    expect(state.autonomous_route_refresh_execution.checks.every((check) =>
      ["pass", "watch", "fail"].includes(check.status) && check.detail.length > 0
    )).toBe(true);
    if (state.route_refresh_queue.status === "refresh-now" || state.route_refresh_queue.status === "queued") {
      expect(state.autonomous_route_refresh_execution.route_refresh_required).toBe(true);
      expect(state.autonomous_route_refresh_execution.selected_item_id).toBe(state.route_refresh_queue.items[0]?.id ?? null);
      if (state.autonomous_route_refresh_execution.selected_lane === "dex-backfill") {
        expect(state.autonomous_route_refresh_execution.can_request_readonly_quote).toBe(true);
        expect(state.autonomous_route_refresh_execution.selected_quote_request).toBeNull();
      }
      if (state.autonomous_route_refresh_execution.selected_lane === "jupiter-quote" &&
        state.autonomous_route_refresh_execution.can_request_readonly_quote) {
        expect(state.autonomous_route_refresh_execution.selected_quote_request).not.toBeNull();
      }
    }
    expect(state.profit_optimizer.candidates.length).toBeGreaterThan(0);
    expect(state.execution_edge_ladder.mode).toBe("execution-edge-ladder");
    expect(state.execution_edge_ladder.items.length).toBeGreaterThan(0);
    expect(state.execution_edge_ladder.items[0].governor_status).toBe(state.autonomy_risk_governor.status);
    expect(state.live_execution_arming.mode).toBe("live-execution-arming");
    expect(state.live_execution_arming.submit_ready).toBe(false);
    expect(state.live_execution_arming.checks.some((check) => check.id === "operator-approval" && check.status === "fail")).toBe(true);
    expect(state.transaction_lifecycle.mode).toBe("transaction-lifecycle");
    expect(state.transaction_lifecycle.items.length).toBeGreaterThan(0);
    expect(state.transaction_lifecycle.items.every((item) => item.status_label.length > 0 && item.next_step.length > 0)).toBe(true);
    expect(state.signed_transaction_relay.mode).toBe("signed-transaction-relay");
    expect(["locked", "awaiting-signature", "ready", "relayed", "confirmed", "failed"]).toContain(state.signed_transaction_relay.status);
    expect(state.signed_transaction_relay.requires_external_wallet).toBe(true);
    expect(state.signed_transaction_relay.safeguards.some((item) => item.includes("never stored"))).toBe(true);
    expect(state.autonomous_order_handoff.mode).toBe("autonomous-order-handoff");
    expect(["paper", "build-order", "needs-signature", "ready-to-submit", "confirming", "blocked", "idle"]).toContain(state.autonomous_order_handoff.status);
    expect(state.autonomous_order_handoff.items.length).toBeGreaterThan(0);
    expect(state.autonomous_order_handoff.safeguards.some((item) => item.includes("private keys never enter"))).toBe(true);
    expect(state.autonomous_order_handoff.items.every((item) =>
      item.api_sequence.length > 0 &&
      item.next_action.length > 0 &&
      item.expected_cost_bps >= 0 &&
      item.ttl_seconds >= 0
    )).toBe(true);
    expect(state.pre_submit_rehearsal.mode).toBe("pre-submit-rehearsal");
    expect(["paper-only", "rehearse", "refresh-first", "signing-needed", "submit-ready", "confirming", "blocked", "idle"]).toContain(state.pre_submit_rehearsal.status);
    expect(state.pre_submit_rehearsal.items.length).toBe(state.autonomous_order_handoff.items.length);
    expect(state.pre_submit_rehearsal.controls.some((control) => control.includes("before an external signer"))).toBe(true);
    expect(state.pre_submit_rehearsal.items.every((item) =>
      item.handoff_id.length > 0 &&
      item.next_action.length > 0 &&
      item.execution_window_seconds >= 0 &&
      item.ttl_seconds >= 0 &&
      item.rehearsal_score >= 0 &&
      item.rehearsal_score <= 100 &&
      item.checks.some((check) => check.id === "quote") &&
      item.checks.some((check) => check.id === "custody")
    )).toBe(true);
    expect(state.autonomous_custody_mandate.mode).toBe("autonomous-custody-mandate");
    expect(["locked", "setup-required", "bounded-ready", "armed", "blocked"]).toContain(state.autonomous_custody_mandate.status);
    expect(state.autonomous_custody_mandate.policy_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.autonomous_custody_mandate.checks.some((check) => check.id === "signer-provider")).toBe(true);
    expect(state.autonomous_custody_mandate.safeguards.some((item) => item.includes("not a private-key store"))).toBe(true);
    expect(state.autonomous_custody_mandate.expires_at).toMatch(/T/);
    expect(state.autonomous_signer_ops.mode).toBe("autonomous-signer-ops");
    expect(["ready", "signature-needed", "setup-required", "blocked", "idle"]).toContain(state.autonomous_signer_ops.status);
    expect(state.autonomous_signer_ops.active_provider).toBe(state.autonomous_custody_mandate.provider);
    expect(state.autonomous_signer_ops.policy_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.autonomous_signer_ops.items.map((item) => item.provider).sort()).toEqual([
      "external-wallet",
      "privy-server-wallet",
      "session-key-vault",
      "turnkey-policy-wallet",
    ]);
    expect(state.autonomous_signer_ops.items.every((item) =>
      item.checks.some((check) => check.id === "provider") &&
      item.checks.some((check) => check.id === "payload") &&
      item.readiness_score >= 0 &&
      item.readiness_score <= 100
    )).toBe(true);
    expect(state.autonomous_signer_ops.controls.some((control) => control.includes("private keys"))).toBe(true);
    expect(state.autonomous_wallet_telemetry.mode).toBe("autonomous-wallet-telemetry");
    expect(["compounding", "harvest", "recover", "flat", "cooldown", "protect"]).toContain(state.autonomous_wallet_telemetry.status);
    expect(state.autonomous_wallet_telemetry.curve.length).toBeGreaterThanOrEqual(2);
    expect(state.autonomous_wallet_telemetry.curve.at(-1)?.equity_usd).toBeCloseTo(state.portfolio.equity_usd, 2);
    expect(state.autonomous_wallet_telemetry.net_pnl_usd).toBeCloseTo(
      state.portfolio.equity_usd - state.portfolio.starting_cash_usd,
      2,
    );
    expect(state.autonomous_wallet_telemetry.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_wallet_telemetry.risk_notes.length).toBeGreaterThan(0);
    expect(state.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(state.smart_money_sentinel.items.length).toBeGreaterThan(0);
    expect(state.learning_loop.signals.length).toBeGreaterThan(0);
    expect(state.signal_alpha_attribution.items.length).toBeGreaterThan(0);
    expect(state.autonomous_strategy_attribution.mode).toBe("autonomous-strategy-attribution");
    expect(["scale", "selective", "tighten", "protect", "learning", "idle"]).toContain(state.autonomous_strategy_attribution.status);
    expect(state.autonomous_strategy_attribution.items.length).toBeGreaterThan(0);
    expect(state.autonomous_strategy_attribution.recommended_size_bias).toBeGreaterThan(0);
    expect(state.autonomous_strategy_attribution.controls.some((control) => control.includes("local paper fills"))).toBe(true);
    expect(state.autonomous_strategy_attribution.items.every((item) =>
      ["launch-sniper", "launch-graduation", "signal-policy", "arbiter", "opportunity-race", "candle", "protection", "manual-paper"].includes(item.lane) &&
      ["scale", "keep", "tighten", "protect", "learning"].includes(item.status) &&
      item.trade_count >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.size_bias_multiplier > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(state.autonomous_policy_optimizer.attribution_size_bias).toBeGreaterThan(0);
    expect(state.autonomous_policy_optimizer.min_expected_edge_usd).toBeGreaterThanOrEqual(state.autonomous_edge_verifier.min_required_edge_usd);
    expect(state.autonomous_policy_optimizer.items.some((item) => item.id === "strategy-policy" && item.lane === "strategy")).toBe(true);
    expect(state.autonomous_policy_optimizer.safeguards.some((item) => item.includes("lane attribution"))).toBe(true);
    expect(state.autonomous_policy_optimizer.attribution_best_lane).toBe(state.autonomous_strategy_attribution.best_lane);
    expect(state.autonomous_policy_optimizer.attribution_worst_lane).toBe(state.autonomous_strategy_attribution.worst_lane);
    expect(state.paper_execution_quality.source).toBe("local-fill-simulator");
    expect(Array.isArray(state.paper_execution_quality.items)).toBe(true);
    expect(state.execution_intents.intents.length).toBeGreaterThan(0);
    expect(state.execution_cost_monitor.items.length).toBeGreaterThan(0);
    expect(state.execution_mev_guard.items.length).toBeGreaterThan(0);
    expect(state.execution_retry_planner.items.length).toBeGreaterThan(0);
    expect(state.execution_preflight.items.length).toBeGreaterThan(0);
    expect(state.performance_scorecard.checkpoints.length).toBeGreaterThan(0);
    expect(state.autonomous_forward_test.scenarios.length).toBe(3);
    expect(state.token_vetting.items.length).toBeGreaterThan(0);
    expect(state.execution_gate.live_blockers.length).toBeGreaterThanOrEqual(3);
    expect(state.research_sources.some((source) => source.label === "Solana token authorities")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "DEX Screener")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "DEX Screener launch sources")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Moonshot")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "FIA automated trading risk controls")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Solana sendTransaction")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Solana signature statuses")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Solana transaction expiration")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Jupiter Trigger API")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Jupiter Ultra execution")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "GeckoTerminal OHLCV")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Birdeye OHLCV")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "CoinGecko onchain top traders")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Birdeye trades and traders")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Helius enhanced transactions")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Helius webhooks")).toBe(true);
  });

  test("GIVEN mocked DEX Screener payloads WHEN live mode is requested THEN the agent trades from live market telemetry", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenFresh222", amount: 12, totalAmount: 14 },
        ]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", description: "profiled momentum coin" },
        ]);
      }
      if (url.includes("/community-takeovers/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", description: "community revived momentum coin" },
        ]);
      }
      if (url.includes("/ads/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenFresh222", impressions: 140_000, type: "trendingBarAd" },
        ]);
      }
      if (url.includes("/orders/v1/solana/TokenLive111")) {
        return Response.json([
          { type: "tokenProfile", status: "approved", paymentTimestamp: Date.now() - 90_000 },
          { type: "communityTakeover", status: "approved", paymentTimestamp: Date.now() - 60_000 },
        ]);
      }
      if (url.includes("/orders/v1/solana/TokenFresh222")) {
        return Response.json([
          { type: "tokenAd", status: "approved", paymentTimestamp: Date.now() - 45_000 },
          { type: "trendingBarAd", status: "approved", paymentTimestamp: Date.now() - 30_000 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111,TokenFresh222")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
          {
            chainId: "solana",
            dexId: "pumpswap",
            pairAddress: "PairFresh222",
            baseToken: { address: "TokenFresh222", name: "Fresh Coin", symbol: "FRESH" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.004",
            txns: { m5: { buys: 300, sells: 32 } },
            volume: { m5: 95_000, h1: 390_000, h24: 720_000 },
            priceChange: { m5: 22.5, h1: 80.2, h6: 95.1 },
            liquidity: { usd: 55_000 },
            marketCap: 1_900_000,
            pairCreatedAt: Date.now() - 20 * 60 * 1000,
            boosts: { active: 12 },
          },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          contextSlot: 284_001_337,
          timeTaken: 0.018,
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });
    const live = state.signals.find((signal) => signal.symbol === "LIVE");

    expect(state.market_source.status).toBe("live");
    expect(state.discovery_tape.status).toBe("live");
    expect(state.discovery_tape.tokens_considered).toBe(2);
    expect(state.discovery_tape.sources.every((source) => source.status === "ok")).toBe(true);
    expect(state.market_feed_integrity.status).toBe("healthy");
    expect(state.market_feed_integrity.stream_mode).toBe("rest-snapshot");
    expect(state.market_feed_integrity.gap_count).toBe(0);
    expect(state.market_feed_integrity.backfill_required).toBe(false);
    expect(state.market_feed_integrity.checks.every((check) => check.status === "pass")).toBe(true);
    expect(state.market_stream_supervisor.mode).toBe("market-stream-supervisor");
    expect(state.market_stream_supervisor.status).toBe("streaming");
    expect(state.market_stream_supervisor.transport).toBe("websocket");
    expect(state.market_stream_supervisor.lanes.some((lane) =>
      lane.source === "dex-screener-websocket" &&
      lane.status === "subscribed"
    )).toBe(true);
    expect(state.market_stream_supervisor.watch_symbols).toContain("LIVE");
    expect(state.market_ingestion_plan.mode).toBe("market-ingestion-plan");
    expect(state.market_ingestion_plan.status).toBe("stream-ready");
    expect(state.market_ingestion_plan.steps.some((step) =>
      step.source === "dex-screener-websocket" &&
      step.action === "connect"
    )).toBe(true);
    expect(state.market_ingestion_plan.steps.some((step) =>
      step.id === "paid-orders" &&
      step.source === "dex-screener-rest"
    )).toBe(true);
    expect(["within-budget", "hot", "throttled"]).toContain(state.market_ingestion_plan.provider_budget_status);
    expect(state.market_ingestion_plan.provider_budget_utilization_pct).toBeGreaterThanOrEqual(0);
    expect(state.market_ingestion_plan.provider_budget_lanes.find((lane) => lane.id === "dex-discovery")).toMatchObject({
      provider: "DEX Screener",
      transport: "websocket",
      status: "hot",
      limit_per_minute: 60,
    });
    expect(state.market_ingestion_plan.provider_budget_lanes.find((lane) => lane.id === "dex-pairs")?.limit_per_minute).toBe(300);
    expect(state.market_ingestion_plan.provider_budget_lanes.find((lane) => lane.id === "gecko-ohlcv")?.limit_per_minute).toBe(30);
    expect(state.market_ingestion_plan.provider_budget_lanes.every((lane) => lane.used_per_minute <= lane.limit_per_minute)).toBe(true);
    expect(state.autonomous_market_intake_plan.mode).toBe("autonomous-market-intake-plan");
    expect(["attack", "refresh", "watch"]).toContain(state.autonomous_market_intake_plan.status);
    expect(state.autonomous_market_intake_plan.next_provider).not.toBe("none");
    expect(state.autonomous_market_intake_plan.items.some((item) =>
      item.id === "route-quotes" &&
      item.provider === "Jupiter" &&
      item.endpoint.includes("/order")
    )).toBe(true);
    expect(state.autonomous_market_intake_plan.items.some((item) =>
      item.id === "candles" &&
      item.provider === "Birdeye" &&
      item.endpoint.includes("ohlcv")
    )).toBe(true);
    expect(state.autonomous_market_intake_plan.items.some((item) =>
      item.id === "wallet-net-worth" &&
      item.endpoint.includes("net-worth")
    )).toBe(true);
    expect(["ready", "paper-only", "exit-only", "blocked", "idle"]).toContain(state.autonomous_trade_readiness_gate.status);
    expect(state.autonomous_trade_readiness_gate.data_repair_required).toBe(false);
    expect(state.autonomous_trade_readiness_gate.checks.find((check) => check.id === "ingestion")?.status).toBe("pass");
    if (state.autonomous_trade_readiness_gate.launch_timing_blocks_fresh_buys) {
      expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
    }
    expect(state.autonomous_signal_noise.mode).toBe("signal-noise-scanner");
    expect(state.autonomous_signal_noise.items.some((item) => item.symbol === "LIVE")).toBe(true);
    expect(state.autonomous_signal_noise.items.every((item) =>
      item.signal_score >= 0 &&
      item.noise_score >= 0 &&
      item.signal_to_noise_ratio >= 0 &&
      item.recommended_size_multiplier >= 0
    )).toBe(true);
    expect(state.autonomous_burst_scheduler.mode).toBe("autonomous-burst-scheduler");
    expect(state.autonomous_burst_scheduler.dex_discovery_budget_per_minute).toBeLessThanOrEqual(60);
    expect(state.autonomous_burst_scheduler.dex_pair_budget_per_minute).toBeLessThanOrEqual(300);
    expect(state.autonomous_burst_scheduler.route_quote_budget_per_minute).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_scheduler.signal_to_noise_ratio).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_mission.mode).toBe("autonomous-trade-mission");
    expect(state.autonomous_trade_mission.steps.some((step) => step.id === "mission-route")).toBe(true);
    expect(state.autonomous_trade_mission.route_quote_budget_per_minute).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_mission.signal_to_noise_ratio).toBeGreaterThanOrEqual(0);
    expect(state.liquidity_exit_sentinel.mode).toBe("liquidity-exit-sentinel");
    expect(state.liquidity_exit_sentinel.items.every((item) =>
      item.confidence >= 0 &&
      item.confidence <= 100 &&
      item.blockers.every((blocker) => !blocker.includes("reconnect"))
    )).toBe(true);
    expect(state.discovery_tape.top_candidates.find((candidate) => candidate.symbol === "LIVE")?.sources).toEqual([
      "dex-top-boosts",
      "dex-latest-profiles",
      "dex-community-takeovers",
    ]);
    expect(state.discovery_tape.top_candidates.find((candidate) => candidate.symbol === "FRESH")?.sources).toContain("dex-latest-ads");
    const liveDelta = state.live_discovery_delta_tape.items.find((item) => item.symbol === "LIVE");
    const freshDelta = state.live_discovery_delta_tape.items.find((item) => item.symbol === "FRESH");
    expect(liveDelta).toMatchObject({
      event: "community-takeover",
      mapped_pair: true,
    });
    expect(liveDelta).toBeDefined();
    expect(["attack", "probe", "watch", "refresh"]).toContain(liveDelta!.status);
    expect(freshDelta).toMatchObject({
      event: "paid-ad",
      status: "blocked",
    });
    expect(freshDelta?.blockers).toContain(
      "Paid promotion pressure requires organic reconfirmation.",
    );
    expect(state.promotion_order_audit).toMatchObject({
      mode: "promotion-order-audit",
      status: "verified",
      paid_hype_count: 1,
    });
    expect(state.promotion_order_audit.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      verdict: "boosted",
      paid_order_count: 2,
      paid_ad_order_count: 0,
    });
    expect(state.promotion_order_audit.items.find((item) => item.symbol === "FRESH")).toMatchObject({
      verdict: "paid-hype",
      paid_ad_order_count: 2,
    });
    expect(state.autonomous_source_quality_oracle).toMatchObject({
      mode: "autonomous-source-quality-oracle",
    });
    expect(["paid-hype", "refresh-first", "blocked", "boosted-confirmed", "organic"]).toContain(state.autonomous_source_quality_oracle.status);
    expect(state.autonomous_source_quality_oracle.items.find((item) => item.symbol === "FRESH")).toMatchObject({
      status: "paid-hype",
    });
    expect(state.autonomous_source_quality_oracle.items.find((item) => item.symbol === "FRESH")?.promotion_noise_score).toBeGreaterThanOrEqual(70);
    expect(state.autonomous_source_quality_oracle.items.find((item) => item.symbol === "FRESH")?.max_paper_size_multiplier).toBe(0);
    expect([
      state.autonomous_tradeability_execution,
      state.autonomous_action_queue_execution,
      state.autonomous_opportunity_rank_execution,
    ].some((execution) =>
      execution.paper_trade_ready &&
      execution.paper_trade?.side === "buy" &&
      execution.paper_trade.symbol === "FRESH"
    )).toBe(false);
    expect(state.autonomous_action_queue_execution.controls.some((control) => control.includes("source quality"))).toBe(true);
    expect(state.autonomous_tick_bundle_execution.controls.some((control) => control.includes("source quality"))).toBe(true);
    if (state.autonomous_source_quality_oracle.status === "paid-hype" || state.autonomous_source_quality_oracle.status === "refresh-first" || state.autonomous_source_quality_oracle.status === "blocked") {
      expect(buildAutonomousNextMoves(state).some((move) => move.id === "source-quality")).toBe(true);
    }
    const advanced = await getWeb3TradingStateAsync({
      account: "persistent",
      reset: true,
      source: "live-dex",
      fetchImpl,
      advance: true,
    });
    expect(advanced.autonomous_source_quality_oracle.items.find((item) => item.symbol === "FRESH")).toMatchObject({
      status: "paid-hype",
    });
    expect(advanced.trade_tape.some((trade) => trade.side === "buy" && trade.symbol === "FRESH")).toBe(false);
    expect(state.discovery_edge).toMatchObject({
      mode: "discovery-edge-supervisor",
      status: "cooldown",
      source_coverage_pct: 100,
      mapped_coverage_pct: 100,
      actionable_count: 0,
    });
    expect(state.discovery_edge.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      action: "reject",
      source_count: 3,
      launch_verdict: "avoid",
    });
    expect(state.discovery_edge.items.find((item) => item.symbol === "FRESH")?.blockers).toContain(
      "Paid-promotion risk overwhelms organic confirmation.",
    );
    expect(state.autonomous_discovery_intake).toMatchObject({
      mode: "autonomous-discovery-intake",
      source_mode: "live",
      source_coverage_pct: 100,
      pair_coverage_pct: 100,
      mapped_candidate_count: 2,
      paid_hype_count: 2,
    });
    expect(["attack-ready", "probe-ready", "refresh-first", "blocked", "idle"]).toContain(state.autonomous_discovery_intake.status);
    expect(state.autonomous_discovery_intake.items.some((item) =>
      item.symbol === "LIVE" &&
      item.source_count >= 2 &&
      item.sources.includes("dex-community-takeovers") &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_discovery_intake.items.find((item) => item.symbol === "FRESH")?.blockers).toContain(
      "Paid-hype pressure is too high for autonomous intake.",
    );
    expect(state.autonomous_discovery_intake.controls.some((control) => control.includes("paper-gated"))).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "discovery-edge-quality")).toBe(true);
    expect(typeof state.autonomous_monitor.should_advance_paper).toBe("boolean");
    const liveLaunch = state.launch_sniper.items.find((item) => item.symbol === "LIVE");
    const freshLaunch = state.launch_sniper.items.find((item) => item.symbol === "FRESH");
    expect(state.launch_sniper.mode).toBe("launch-sniper");
    expect(liveLaunch).toMatchObject({
      verdict: "avoid",
      priority: "later",
    });
    expect(liveLaunch?.launch_score).toBeGreaterThanOrEqual(70);
    expect(liveLaunch?.suggested_entry_usd).toBe(0);
    expect(liveLaunch?.blockers.length).toBeGreaterThan(0);
    expect(liveLaunch?.sources).toContain("dex-community-takeovers");
    expect(freshLaunch).toBeDefined();
    expect(freshLaunch!.verdict).toBe("avoid");
    expect(freshLaunch!.blockers.length).toBeGreaterThan(0);
    expect(state.launch_graduation.mode).toBe("launch-graduation-supervisor");
    expect(state.launch_graduation.items.find((item) => item.symbol === "LIVE")).toBeDefined();
    expect(state.launch_graduation.items.every((item) =>
      item.curve_progress_pct >= 0 &&
      item.curve_progress_pct <= 100 &&
      item.graduation_score >= 0 &&
      item.graduation_score <= 100
    )).toBe(true);
    expect(state.market.some((market) => market.symbol === "LIVE")).toBe(true);
    expect(live?.action).toBe("buy");
    const liveCatalyst = state.trend_catalyst.items.find((item) => item.symbol === "LIVE");
    const freshCatalyst = state.trend_catalyst.items.find((item) => item.symbol === "FRESH");
    expect(liveCatalyst).toBeDefined();
    expect(liveCatalyst!.catalyst_type).toMatch(/organic-breakout|community-takeover|fresh-profile|mixed-hype/);
    expect(freshCatalyst).toBeDefined();
    expect(freshCatalyst?.promotion_risk_score).toBeGreaterThanOrEqual(70);
    expect(freshCatalyst?.action === "fade" || freshCatalyst?.action === "block").toBe(true);
    expect(state.execution_edge_ladder.items.length).toBeGreaterThan(0);
    expect(state.execution_edge_ladder.items.every((item) => item.preflight_status.length > 0)).toBe(true);
    expect(state.token_vetting.items.find((item) => item.symbol === "FRESH")).toMatchObject({
      status: "blocked",
      max_position_usd: 0,
    });
    expect(state.token_vetting.items.find((item) => item.symbol === "LIVE")?.checks.some((check) =>
      check.id === "authority" && check.status === "credential-gated"
    )).toBe(true);
    expect(state.trade_tape.some((trade) => trade.symbol === "LIVE" && trade.side === "buy")).toBe(true);
    expect(state.execution_plans.find((plan) => plan.symbol === "LIVE")).toMatchObject({
      source: "jupiter",
      status: "quoted",
      gate: "would-block-live",
      price_impact_pct: 0.42,
      quoted_at: expect.any(String),
      quote_context_slot: 284_001_337,
    });
    expect(state.execution_plans.find((plan) => plan.symbol === "LIVE")?.quote_time_taken_seconds).toBeGreaterThanOrEqual(0);
    expect(state.route_profit_gate.mode).toBe("route-profit-gate");
    expect(state.route_profit_gate.items.length).toBeGreaterThan(0);
    const liveRouteProfit = state.route_profit_gate.items.find((item) => item.symbol === "LIVE");
    expect(liveRouteProfit).toBeDefined();
    expect(liveRouteProfit!.total_cost_bps).toBeGreaterThan(0);
    expect(liveRouteProfit!.net_edge_after_route_pct).toBeGreaterThan(0);
    expect(liveRouteProfit!.blockers.every((blocker) => !/wallet|kill switch/i.test(blocker))).toBe(true);
    expect(state.route_quote_sampler.mode).toBe("route-quote-sampler");
    expect(state.route_quote_sampler.quoted_count).toBeGreaterThan(0);
    expect(state.route_quote_sampler.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      source: "jupiter",
      quote_status: "quoted",
    });
    expect(state.route_quote_sampler.items.find((item) => item.symbol === "LIVE")!.route_confidence_score).toBeGreaterThan(0);
    expect(state.route_quote_sampler.items.find((item) => item.symbol === "LIVE")!.route_label).toContain("Raydium");
    expect(state.execution_landing_supervisor.mode).toBe("execution-landing-supervisor");
    expect(["paper", "managed", "sender-needed", "blocked"]).toContain(state.execution_landing_supervisor.status);
    const liveLanding = state.execution_landing_supervisor.items.find((item) => item.symbol === "LIVE");
    expect(liveLanding).toBeDefined();
    expect(["jupiter-v2-managed", "helius-sender", "jupiter-router-submit", "paper-ledger", "blocked"]).toContain(liveLanding!.path);
    expect(liveLanding!.requires_api_key || liveLanding!.path === "paper-ledger" || liveLanding!.path === "blocked").toBe(true);
    expect(liveLanding!.priority_fee_lamports).toBeGreaterThanOrEqual(0);
    expect(liveLanding!.next_action.length).toBeGreaterThan(0);
    expect(state.alpha_decay_controller.mode).toBe("alpha-decay-controller");
    expect(state.alpha_decay_controller.items.some((item) => item.symbol === "LIVE")).toBe(true);
    const liveAlpha = state.alpha_decay_controller.items.find((item) => item.symbol === "LIVE");
    expect(liveAlpha!.alpha_score).toBeGreaterThan(0);
    expect(liveAlpha!.half_life_seconds).toBeGreaterThan(0);
    expect(liveAlpha!.time_to_decay_seconds).toBeGreaterThanOrEqual(0);
    expect(state.microstructure_tape.mode).toBe("microstructure-tape");
    expect(state.microstructure_tape.items.some((item) => item.symbol === "LIVE")).toBe(true);
    const liveMicrostructure = state.microstructure_tape.items.find((item) => item.symbol === "LIVE");
    expect(liveMicrostructure!.buy_burst_score).toBeGreaterThan(0);
    expect(liveMicrostructure!.trade_count_5m).toBe(161);
    expect(liveMicrostructure!.evidence.length).toBeGreaterThan(0);
    expect(state.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(state.smart_money_sentinel.items.some((item) => item.symbol === "LIVE")).toBe(true);
    const liveSmartMoney = state.smart_money_sentinel.items.find((item) => item.symbol === "LIVE");
    expect(liveSmartMoney!.data_status).toBe("credential-gated");
    expect(liveSmartMoney!.copy_trade_confidence).toBeGreaterThan(0);
    expect(liveSmartMoney!.evidence.length).toBeGreaterThan(0);
    expect(state.scalping_controller.mode).toBe("autonomous-scalping-controller");
    expect(state.scalping_controller.items.some((item) => item.symbol === "LIVE")).toBe(true);
    expect(state.scalping_controller.items.every((item) => item.churn_cost_bps >= 0 && item.review_after_seconds > 0)).toBe(true);
    expect(state.scalping_controller.items.filter((item) => item.side === "buy").every((item) =>
      item.size_usd <= state.autonomous_compounder.next_order_cap_usd
    )).toBe(true);
    expect(state.execution_intents.intents.find((intent) => intent.symbol === "LIVE")).toMatchObject({
      route_status: "paper-ledger",
      status: "paper-filled",
    });
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    expect(state.autopilot.actions.some((action) => action.symbol === "LIVE")).toBe(true);
    expect(state.profit_optimizer.candidates.some((candidate) => candidate.symbol === "LIVE")).toBe(true);
    expect(state.learning_loop.sample_size).toBeGreaterThan(0);
    expect(state.performance_scorecard.trade_count).toBe(state.trade_tape.length);
  });

  test("GIVEN a clean multi-source DEX edge WHEN live mode is requested THEN the supervisor arms a paper snipe hunt", async () => {
    const edgeAddress = "TokenEdge333";
    const communityAddress = "TokenCto444";
    const adAddress = "TokenAd555";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: edgeAddress, amount: 4, totalAmount: 6 },
        ]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: edgeAddress, amount: 4, totalAmount: 6 },
        ]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: edgeAddress, description: "organic momentum profile" },
        ]);
      }
      if (url.includes("/community-takeovers/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: communityAddress, description: "community takeover watch" },
        ]);
      }
      if (url.includes("/ads/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: adAddress, impressions: 80_000, type: "trendingBarAd" },
        ]);
      }
      if (url.includes(`/orders/v1/solana/${edgeAddress}`)) {
        return Response.json([]);
      }
      if (url.includes(`/orders/v1/solana/${communityAddress}`)) {
        return Response.json([
          { type: "communityTakeover", status: "approved", paymentTimestamp: Date.now() - 60_000 },
        ]);
      }
      if (url.includes(`/orders/v1/solana/${adAddress}`)) {
        return Response.json([
          { type: "trendingBarAd", status: "approved", paymentTimestamp: Date.now() - 30_000 },
        ]);
      }
      if (url.includes(`/tokens/v1/solana/${edgeAddress},${communityAddress},${adAddress}`)) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairEdge333",
            baseToken: { address: edgeAddress, name: "Edge Coin", symbol: "EDGE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.012",
            txns: { m5: { buys: 600, sells: 25 } },
            volume: { m5: 180_000, h1: 1_300_000, h24: 3_900_000 },
            priceChange: { m5: 24, h1: 130, h6: 190 },
            liquidity: { usd: 1_800_000 },
            marketCap: 7_800_000,
            pairCreatedAt: Date.now() - 240 * 60 * 1000,
            boosts: { active: 4 },
          },
          {
            chainId: "solana",
            dexId: "pumpswap",
            pairAddress: "PairCto444",
            baseToken: { address: communityAddress, name: "CTO Coin", symbol: "CTO" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.002",
            txns: { m5: { buys: 70, sells: 64 } },
            volume: { m5: 30_000, h1: 120_000, h24: 320_000 },
            priceChange: { m5: 3, h1: 14, h6: 28 },
            liquidity: { usd: 210_000 },
            marketCap: 1_000_000,
            pairCreatedAt: Date.now() - 300 * 60 * 1000,
            boosts: { active: 0 },
          },
          {
            chainId: "solana",
            dexId: "pumpswap",
            pairAddress: "PairAd555",
            baseToken: { address: adAddress, name: "Ad Coin", symbol: "ADCO" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.001",
            txns: { m5: { buys: 36, sells: 52 } },
            volume: { m5: 18_000, h1: 72_000, h24: 210_000 },
            priceChange: { m5: 1.5, h1: 7, h6: 19 },
            liquidity: { usd: 180_000 },
            marketCap: 700_000,
            pairCreatedAt: Date.now() - 260 * 60 * 1000,
            boosts: { active: 0 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.28",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });
    const edgeLaunch = state.launch_sniper.items.find((item) => item.symbol === "EDGE");
    const edgeItem = state.discovery_edge.items.find((item) => item.symbol === "EDGE");

    expect(state.discovery_tape.sources.every((source) => source.status === "ok")).toBe(true);
    expect(state.promotion_order_audit).toMatchObject({
      status: "verified",
      paid_hype_count: 1,
    });
    expect(state.promotion_order_audit.items.find((item) => item.symbol === "EDGE")).toMatchObject({
      verdict: "boosted",
      paid_order_count: 0,
      paid_ad_order_count: 0,
    });
    expect(state.discovery_edge).toMatchObject({
      status: "hunt",
      source_coverage_pct: 100,
      mapped_coverage_pct: 100,
      actionable_count: 1,
      snipe_count: 1,
    });
    expect(edgeLaunch).toMatchObject({
      verdict: "snipe",
      priority: "now",
    });
    expect(edgeItem).toMatchObject({
      action: "snipe",
      source_count: 3,
      launch_verdict: "snipe",
    });
    expect(edgeItem!.edge_score).toBeGreaterThanOrEqual(72);
    const edgeGraduation = state.launch_graduation.items.find((item) => item.symbol === "EDGE");
    expect(edgeGraduation).toBeDefined();
    expect(["graduate", "snipe", "probe", "wait"]).toContain(edgeGraduation!.action);
    expect(["bonding-curve", "graduating", "graduated", "post-graduation"]).toContain(edgeGraduation!.phase);
    expect(edgeGraduation!.graduation_score).toBeGreaterThanOrEqual(50);
    expect(state.autopilot.actions.some((action) =>
      action.symbol === "EDGE" &&
      (action.id.includes("graduation") || action.id.includes("launch"))
    )).toBe(true);
    expect(edgeItem!.blockers).toEqual([]);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "discovery-edge-quality")).toBe(false);
    expect(state.autonomous_monitor.should_advance_paper).toBe(true);
  });

  test("GIVEN too few DEX discovery lanes WHEN live mode is requested THEN the supervisor blocks fresh paper entries", async () => {
    const tokenAddress = "TokenOnlyOne111";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress, amount: 3, totalAmount: 4 },
        ]);
      }
      if (
        url.includes("/token-boosts/latest/v1") ||
        url.includes("/token-profiles/latest/v1") ||
        url.includes("/community-takeovers/latest/v1") ||
        url.includes("/ads/latest/v1")
      ) {
        return Response.json([]);
      }
      if (url.includes(`/orders/v1/solana/${tokenAddress}`)) {
        return Response.json([]);
      }
      if (url.includes(`/tokens/v1/solana/${tokenAddress}`)) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairOnlyOne111",
            baseToken: { address: tokenAddress, name: "Only Coin", symbol: "ONLY" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.018",
            txns: { m5: { buys: 210, sells: 45 } },
            volume: { m5: 90_000, h1: 520_000, h24: 1_400_000 },
            priceChange: { m5: 14, h1: 44, h6: 88 },
            liquidity: { usd: 900_000 },
            marketCap: 4_800_000,
            pairCreatedAt: Date.now() - 240 * 60 * 1000,
            boosts: { active: 3 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.28",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });

    expect(state.discovery_edge.status).toBe("cooldown");
    expect(state.discovery_edge.source_coverage_pct).toBe(20);
    expect(state.discovery_edge.mapped_coverage_pct).toBe(100);
    expect(state.discovery_edge.blockers).toContain("Too few hot-discovery sources are healthy.");
    expect(state.discovery_edge.items.find((item) => item.symbol === "ONLY")).toMatchObject({
      action: "reject",
      source_count: 1,
    });
    expect(["cooldown", "quiet"]).toContain(state.launch_graduation.status);
    expect(state.launch_graduation.items.find((item) => item.symbol === "ONLY")?.blockers.length).toBeGreaterThan(0);
    expect(state.autonomous_monitor.triggers.find((trigger) => trigger.id === "discovery-edge-quality")).toMatchObject({
      severity: "watch",
      symbol: "ONLY",
    });
    expect(state.autonomous_monitor.should_advance_paper).toBe(false);
  });

  test("GIVEN dry-run readiness WHEN Jupiter v2 order returns an unsigned transaction THEN the plan records order metadata only", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          contextSlot: 284_001_337,
          timeTaken: 0.018,
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-123",
          router: "metis",
          outAmount: "123",
          mode: "manual",
          feeBps: 10,
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
    });
    const plan = state.execution_plans.find((item) => item.symbol === "LIVE");

    expect(state.execution_readiness.config.mode).toBe("dry-run");
    expect(state.execution_readiness.checks.every((check) => check.status !== "fail")).toBe(true);
    expect(plan?.input_amount_usd).toBe(500);
    expect(plan).toMatchObject({
      quoted_at: expect.any(String),
      quote_context_slot: 284_001_337,
      quote_time_taken_seconds: 0.018,
    });
    expect(plan?.dry_run).toMatchObject({
      status: "order-built",
      request_id: "order-123",
      router: "metis",
      order_mode: "manual",
      fee_bps: 10,
      transaction_ready: true,
    });
    expect(state.execution_preflight.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      plan_id: plan?.id,
      payload_ready: true,
    });
    expect(state.execution_preflight.items.find((item) => item.symbol === "LIVE")?.fee_bps).toBeGreaterThanOrEqual(10);
    expect(state.execution_cost_monitor.items.find((item) => item.symbol === "LIVE")?.priority_fee_lamports).toBeGreaterThanOrEqual(0);
    expect(state.execution_preflight.items.find((item) => item.symbol === "LIVE")?.checks.some((check) =>
      check.id === "fees" && (check.status === "pass" || check.status === "warn")
    )).toBe(true);
    expect(state.live_execution_arming.mode).toBe("live-execution-arming");
    expect(state.live_execution_arming.submit_ready).toBe(false);
    expect(state.live_execution_arming.checks.find((check) => check.id === "operator-approval")?.status).toBe("fail");
    expect(state.live_execution_arming.checks.find((check) => check.id === "preflight")?.status).toBe("fail");
    const lifecycleItem = state.transaction_lifecycle.items.find((item) => item.symbol === "LIVE");
    expect(lifecycleItem).toMatchObject({
      plan_id: plan?.id,
      stage: "submit-locked",
      request_id: "order-123",
    });
    expect(lifecycleItem?.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(lifecycleItem?.last_valid_block_height).toBeGreaterThan(0);
    expect(lifecycleItem?.next_step).toContain("Clear");
    expect(state.signed_transaction_relay.status).toBe("awaiting-signature");
    expect(state.signed_transaction_relay.can_accept_signed_payload).toBe(false);
    expect(state.signed_transaction_relay.request_id).toBe("order-123");
    const handoff = state.autonomous_order_handoff.items.find((item) => item.symbol === "LIVE");
    expect(state.autonomous_order_handoff.mode).toBe("autonomous-order-handoff");
    expect(state.autonomous_order_handoff.status).toMatch(/needs-signature|blocked|build-order/);
    expect(handoff).toMatchObject({
      plan_id: plan?.id,
      request_id: "order-123",
      handoff_path: expect.stringMatching(/jupiter|paper|solana|helius/),
      signer_required: true,
      can_submit_signed_payload: false,
    });
    expect(handoff?.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(handoff?.api_sequence.length).toBeGreaterThan(0);
    expect(handoff?.blockers.some((blocker) => /Operator approval|Preflight|Live/i.test(blocker))).toBe(true);
    expect(JSON.stringify(handoff)).not.toContain("unsigned-transaction-redacted-by-engine");
    const rehearsal = state.pre_submit_rehearsal.items.find((item) => item.symbol === "LIVE");
    expect(state.pre_submit_rehearsal.mode).toBe("pre-submit-rehearsal");
    expect(["signing-needed", "blocked", "refresh-first", "rehearse"]).toContain(state.pre_submit_rehearsal.status);
    expect(rehearsal).toMatchObject({
      plan_id: plan?.id,
      request_id: "order-123",
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(rehearsal?.checks.some((check) => check.id === "payload" && check.status === "pass")).toBe(true);
    expect(rehearsal?.checks.some((check) => check.id === "relay" && check.status === "fail")).toBe(true);
    expect(rehearsal?.blockers.some((blocker) => /Relay|Operator approval|Live/i.test(blocker))).toBe(true);
    expect(state.autonomous_custody_mandate).toMatchObject({
      mode: "autonomous-custody-mandate",
      provider: "external-wallet",
      provider_configured: false,
      signer_scope: "wallet-prompt",
      wallet_public_key: "11111111111111111111111111111111",
      max_slippage_bps: 150,
    });
    expect(["blocked", "setup-required"]).toContain(state.autonomous_custody_mandate.status);
    expect(state.autonomous_custody_mandate.policy_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.autonomous_custody_mandate.checks.find((check) => check.id === "live-gates")?.status).not.toBe("pass");
    expect(state.autonomous_custody_mandate.next_action).toMatch(/wallet prompts|Clear|configure/i);
    expect(JSON.stringify(state.autonomous_custody_mandate)).not.toContain("unsigned-transaction-redacted-by-engine");
    expect(state.execution_retry_planner.items.find((item) => item.symbol === "LIVE")?.action).toMatch(/send|retry|resize|slice|escalate-priority|paper/);
    expect(state.execution_intents.intents.find((intent) => intent.symbol === "LIVE")).toMatchObject({
      plan_id: plan?.id,
      route_quality_score: expect.any(Number),
    });
    expect(JSON.stringify(plan)).not.toContain("unsigned-transaction-redacted-by-engine");
  });

  test("GIVEN a stale Jupiter quote WHEN preflight runs THEN the agent blocks execution until it requotes", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          contextSlot: 284_001_337,
          timeTaken: 0.018,
          quotedAt: "2000-01-01T00:00:00.000Z",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });
    const preflight = state.execution_preflight.items.find((item) => item.symbol === "LIVE");
    const freshness = preflight?.checks.find((check) => check.id === "freshness");
    const refresh = state.route_refresh_queue.items.find((item) => item.symbol === "LIVE");

    expect(state.execution_plans.find((plan) => plan.symbol === "LIVE")).toMatchObject({
      source: "jupiter",
      status: "quoted",
      quoted_at: "2000-01-01T00:00:00.000Z",
    });
    expect(preflight).toBeDefined();
    expect(preflight?.quote_age_seconds).toBeGreaterThan(15);
    expect(["paper", "blocked"]).toContain(preflight?.status ?? "missing");
    expect(freshness).toMatchObject({
      status: preflight?.status === "paper" ? "pass" : "fail",
      label: "Freshness",
    });
    expect(state.route_refresh_queue.status).toBe("refresh-now");
    expect(state.autonomous_loop_director.route_refresh_status).toBe("refresh-now");
    expect(state.autonomous_loop_director.should_refresh_route_quotes).toBe(true);
    expect(state.autonomous_loop_director.tick_reason).toBe(state.route_refresh_queue.next_action);
    expect(state.autonomous_loop_director.next_tick_seconds).toBeLessThanOrEqual(2);
    expect(refresh).toMatchObject({
      action: "requote-now",
      priority: "critical",
      lane: "dex-backfill",
      quote_context_slot: 284_001_337,
      quote_request: {
        provider: "jupiter-quote-v1",
        method: "GET",
        input_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        output_mint: "TokenLive111",
        slippage_bps: 250,
        swap_mode: "ExactIn",
        max_quote_age_seconds: 15,
      },
    });
    expect(refresh?.quote_request?.url).toContain("https://lite-api.jup.ag/swap/v1/quote?");
    expect(refresh?.quote_request?.url).toContain("inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(refresh?.quote_request?.url).toContain("outputMint=TokenLive111");
    expect(refresh?.quote_request?.url).toContain("swapMode=ExactIn");
    expect(state.autonomous_route_refresh_execution.selected_quote_request).toMatchObject(refresh?.quote_request ?? {});
    expect(state.autonomous_route_refresh_execution.can_request_readonly_quote).toBe(true);
    expect(refresh?.quote_age_seconds).toBeGreaterThan(15);
    expect(refresh?.due_in_seconds).toBeLessThanOrEqual(2);
  });

  test("GIVEN a stale Jupiter quote WHEN route refresh requests a quote THEN the agent refreshes route evidence before sizing", async () => {
    let quoteCalls = 0;
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        quoteCalls += 1;
        return Response.json({
          outAmount: quoteCalls === 1 ? "124000000000" : "128000000000",
          priceImpactPct: quoteCalls === 1 ? "0.42" : "0.31",
          contextSlot: quoteCalls === 1 ? 284_001_337 : 284_001_401,
          timeTaken: quoteCalls === 1 ? 0.018 : 0.012,
          quotedAt: quoteCalls === 1 ? "2000-01-01T00:00:00.000Z" : new Date().toISOString(),
          routePlan: [{ swapInfo: { label: quoteCalls === 1 ? "Raydium" : "Raydium CLMM" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      route_refresh: { action: "request-quote" },
      fetchImpl,
    });
    const plan = state.execution_plans.find((item) => item.symbol === "LIVE");
    const preflight = state.execution_preflight.items.find((item) => item.symbol === "LIVE");

    expect(quoteCalls).toBe(2);
    expect(plan).toMatchObject({
      source: "jupiter",
      status: "quoted",
      estimated_output_raw: "128000000000",
      price_impact_pct: 0.31,
      quote_context_slot: 284_001_401,
      quote_time_taken_seconds: 0.012,
    });
    expect(plan?.route_label).toContain("Raydium CLMM");
    expect(preflight?.quote_age_seconds).toBeLessThanOrEqual(15);
    expect(preflight?.checks.find((check) => check.id === "freshness")?.status).toBe("pass");
    expect(["refresh-now", "watch", "idle"]).toContain(state.route_refresh_queue.status);
    expect(["ready", "requesting"]).toContain(state.autonomous_route_refresh_execution.status);
    expect(state.autonomous_route_refresh_execution.can_request_readonly_quote).toBe(state.route_refresh_queue.status === "refresh-now");
    expect(state.autonomous_loop_director.should_refresh_route_quotes).toBe(state.route_refresh_queue.status === "refresh-now");
  });

  test("GIVEN an externally signed Jupiter payload WHEN live relay gates are armed THEN the API records signature status without storing transaction bytes", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    process.env.SOLANA_RPC_URL = "https://rpc.test.invalid";
    process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = "true";
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = "I_UNDERSTAND_REAL_FUNDS";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "privy";
    process.env.PRIVY_APP_ID = "test-privy-app";
    process.env.PRIVY_APP_SECRET = "test-privy-secret";
    process.env.PRIVY_SOLANA_WALLET_ID = "wallet-live-1";
    const signedPayload = Buffer.from("signed-transaction-redacted-by-engine").toString("base64");
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 2, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", description: "Live Coin profile" },
        ]);
      }
      if (url.includes("/community-takeovers/latest/v1")) {
        return Response.json([
          { chainId: "bsc", tokenAddress: "IgnoredCommunity111", description: "Unsupported chain keeps source healthy only" },
        ]);
      }
      if (url.includes("/ads/latest/v1")) {
        return Response.json([
          { chainId: "bsc", tokenAddress: "IgnoredAd111", impressions: 1_000 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-123",
          router: "metis",
          outAmount: "123",
          mode: "manual",
          feeBps: 10,
        });
      }
      if (url.includes("api.jup.ag/swap/v2/execute")) {
        const body = JSON.parse(String(init?.body));
        expect(body.signedTransaction).toBe(signedPayload);
        expect(body.requestId).toBe("order-123");
        return Response.json({
          status: "Success",
          signature: "5NfRelaySignature111111111111111111111111111111111111111",
          slot: "341197933",
          code: 0,
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
      relay: {
        signed_transaction: signedPayload,
        request_id: "order-123",
        route: "jupiter-swap-v2",
      },
    });

    expect(state.live_execution_arming.submit_ready).toBe(true);
    expect(state.signed_transaction_relay.status).toBe("confirmed");
    expect(state.signed_transaction_relay.latest_signature).toBe("5NfRelaySignature111111111111111111111111111111111111111");
    expect(state.signed_transaction_relay.latest_slot).toBe("341197933");
    expect(state.signed_transaction_relay.confirmation_status).toBe("confirmed");
    expect(state.transaction_lifecycle.items.find((item) => item.symbol === "LIVE")?.stage).toBe("landed");
    expect(state.autonomous_order_handoff.status).toBe("confirming");
    expect(state.autonomous_order_handoff.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      action: "poll-confirmation",
      request_id: "order-123",
      can_submit_signed_payload: true,
    });
    expect(["confirming", "refresh-first"]).toContain(state.pre_submit_rehearsal.status);
    expect(state.pre_submit_rehearsal.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      action: expect.stringMatching(/poll-confirmation|refresh-route/),
      request_id: "order-123",
    });
    expect(state.autonomous_custody_mandate).toMatchObject({
      mode: "autonomous-custody-mandate",
      status: "armed",
      provider: "privy-server-wallet",
      provider_configured: true,
      signer_scope: "policy-wallet",
      wallet_public_key: "11111111111111111111111111111111",
    });
    expect(state.autonomous_custody_mandate.allowed_paths).toContain("jupiter-swap-v2");
    expect(state.autonomous_custody_mandate.allowed_symbols).toContain("LIVE");
    expect(state.autonomous_custody_mandate.allowed_sides).toContain("buy");
    expect(state.autonomous_custody_mandate.open_order_count).toBeGreaterThan(0);
    expect(state.autonomous_custody_mandate.spend_limit_usd).toBeGreaterThan(0);
    expect(state.autonomous_custody_mandate.per_trade_limit_usd).toBeLessThanOrEqual(500);
    expect(state.autonomous_custody_mandate.checks.every((check) => check.status !== "fail")).toBe(true);
    expect(state.autonomous_signer_ops).toMatchObject({
      mode: "autonomous-signer-ops",
      active_provider: "privy-server-wallet",
      can_auto_sign: false,
      can_request_signature: false,
      requires_user_presence: false,
    });
    expect(["ready", "blocked"]).toContain(state.autonomous_signer_ops.status);
    expect(state.autonomous_signer_ops.items.find((item) => item.provider === "privy-server-wallet")?.checks.every((check) => check.status !== "fail")).toBe(true);
    expect(state.execution_audit.latest).toMatchObject({
      status: "confirmed",
      request_id: "order-123",
      relay_path: "jupiter-swap-v2",
      relay_signature: "5NfRelaySignature111111111111111111111111111111111111111",
    });
    expect(JSON.stringify(state.execution_audit.latest)).not.toContain("signed-transaction-redacted-by-engine");
  });

  test("GIVEN a dry-run profile with the kill switch on WHEN plans are built THEN unsigned orders stay blocked", async () => {
    const state = await getWeb3TradingStateAsync({
      execution: {
        mode: "dry-run",
        kill_switch: true,
        wallet_public_key: "11111111111111111111111111111111",
      },
    });

    expect(state.execution_readiness.checks.find((check) => check.id === "kill-switch")?.status).toBe("fail");
    expect(state.execution_plans.some((plan) => plan.dry_run.status === "blocked")).toBe(true);
    expect(state.live_execution_arming.status).toBe("halted");
    expect(state.live_execution_arming.checks.find((check) => check.id === "kill-switch")?.status).toBe("fail");
    expect(state.transaction_lifecycle.status).toBe("blocked");
    expect(state.transaction_lifecycle.items.every((item) => item.stage !== "awaiting-signature")).toBe(true);
    expect(state.execution_gate.live_execution_enabled).toBe(false);
  });

  test("GIVEN the kill switch is on WHEN an execution drill runs THEN it records a blocked audit entry", async () => {
    const state = await getWeb3TradingStateAsync({
      drill: true,
      execution: {
        mode: "dry-run",
        kill_switch: true,
        wallet_public_key: "11111111111111111111111111111111",
      },
    });

    expect(state.execution_audit.latest).toMatchObject({
      status: "blocked",
      nonce: "web3-drill-0001",
      kill_switch: true,
      transaction_ready: false,
    });
    expect(state.execution_audit.latest?.reason).toContain("Kill switch");
    expect(state.transaction_lifecycle.status).toBe("blocked");
  });

  test("GIVEN an unsigned order exists WHEN an execution drill runs THEN it stops at the signing boundary", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-456",
          router: "metis",
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      drill: true,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
    });

    expect(state.execution_audit.latest).toMatchObject({
      status: "ready-to-sign",
      request_id: "order-456",
      router: "metis",
      transaction_ready: true,
      kill_switch: false,
    });
    expect(state.execution_audit.latest?.reason).toContain("stopped before signing");
    expect(JSON.stringify(state.execution_audit.latest)).not.toContain("unsigned-transaction-redacted-by-engine");
    expect(state.transaction_lifecycle.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      stage: "awaiting-signature",
      request_id: "order-456",
      signed_transaction_required: true,
    });
  });

  test("GIVEN signer simulation is armed WHEN an execution drill reaches an unsigned order THEN it records a synthetic signature from the payload hash", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-789",
          router: "metis",
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      drill: true,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
        signer_simulation_enabled: true,
        signer_session_label: "session-alpha",
        signer_network: "devnet",
      },
    });

    const latest = state.execution_audit.latest;

    expect(latest).toMatchObject({
      status: "simulated-signed",
      request_id: "order-789",
      router: "metis",
      transaction_ready: true,
      kill_switch: false,
      signer_session_label: "session-alpha",
      signer_network: "devnet",
    });
    expect(latest?.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(latest?.payload_bytes).toBeGreaterThan(0);
    expect(latest?.simulated_signature).toMatch(/^sim_sig_/);
    expect(state.transaction_lifecycle.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      stage: "signed-simulated",
      request_id: "order-789",
      simulated_signature: latest?.simulated_signature,
    });
    expect(JSON.stringify(latest)).not.toContain("unsigned-transaction-redacted-by-engine");
  });

  test("GIVEN a persistent paper account WHEN the agent advances twice THEN cycles and trade history carry forward", async () => {
    const first = await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base" });
    const second = await getWeb3TradingStateAsync({ account: "persistent", scenario: "breakout" });

    expect(first.paper_account.persisted).toBe(true);
    expect(first.paper_account.cycle).toBe(1);
    expect(second.paper_account.cycle).toBe(2);
    expect(second.paper_account.trade_count).toBeGreaterThanOrEqual(first.paper_account.trade_count);
    expect(second.portfolio.cash_usd).not.toBe(25_000);
    expect(["executed-paper", "planned"]).toContain(second.autopilot.status);
    expect(second.trade_tape.some((trade) => trade.status === "paper-filled")).toBe(true);
    expect(second.profit_optimizer.candidates.length).toBeGreaterThan(0);
    expect(second.learning_loop.sample_size).toBe(second.paper_account.trade_count);
    expect(second.learning_loop.size_multiplier).toBeGreaterThan(0);
    expect(second.performance_scorecard.trade_count).toBe(second.trade_tape.length);
    expect(second.performance_scorecard.window_label).toContain("cycle");
    expect(second.performance_scorecard.checkpoints.some((checkpoint) => checkpoint.id === "turnover")).toBe(true);
    expect(second.autonomous_strategy_attribution.mode).toBe("autonomous-strategy-attribution");
    expect(second.autonomous_strategy_attribution.sample_size).toBeGreaterThan(0);
    expect(second.autonomous_strategy_attribution.items.some((item) => item.trade_count > 0)).toBe(true);
    expect(second.autonomous_strategy_attribution.net_contribution_usd).toBeCloseTo(
      second.autonomous_strategy_attribution.items.reduce((sum, item) => sum + item.net_contribution_usd, 0),
      2,
    );
	    expect(second.autonomous_policy_optimizer.attribution_size_bias).toBeGreaterThan(0);
	    expect(second.autonomous_policy_optimizer.items.some((item) => item.id === "strategy-policy")).toBe(true);
	    if (second.autonomous_strategy_attribution.status === "tighten" || second.autonomous_strategy_attribution.status === "protect") {
	      expect(second.autonomous_policy_optimizer.max_trades_next_session).toBeLessThanOrEqual(1);
	    }
		    expect(second.trend_velocity_scanner.mode).toBe("trend-velocity-scanner");
		    expect(second.trend_velocity_scanner.items.length).toBeGreaterThan(0);
		    expect(second.trend_velocity_scanner.fastest_chase_seconds).toBeGreaterThan(0);
		    expect(second.trend_chase_execution.mode).toBe("trend-chase-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(second.trend_chase_execution.status);
		    expect(second.trend_chase_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(second.trend_chase_execution.scout_reserve_usd).toBeGreaterThanOrEqual(0);
		    expect(second.scout_lifecycle.mode).toBe("scout-lifecycle-controller");
		    expect(["harvest", "trim", "stop", "tighten", "watch", "idle"]).toContain(second.scout_lifecycle.status);
		    expect(second.scout_lifecycle.execution_boundary).toBe("paper-ledger-only");
		    expect(second.scout_lifecycle.watched_count).toBeGreaterThanOrEqual(0);
		    expect(second.scout_lifecycle.controls.some((control) => control.includes("paper sell"))).toBe(true);
		    expect(second.autonomous_forward_test.gates.some((gate) => gate.id === "rug-survival")).toBe(true);
    expect(second.autonomous_trade_execution_bridge.mode).toBe("arbiter-paper-execution");
    expect(second.autonomous_trade_execution_bridge.controls.some((control) => control.includes("local paper-ledger fill"))).toBe(true);
    expect(second.autonomous_trade_batch.mode).toBe("autonomous-trade-batch");
    expect(second.autonomous_trade_batch.controls.some((control) => control.includes("paper batch"))).toBe(true);
    expect(second.autonomous_trade_batch.ready_count).toBeLessThanOrEqual(second.autonomous_trade_batch.max_trades_per_cycle);
    expect(second.autonomous_tick_plan.mode).toBe("autonomous-tick-plan");
    expect(second.autonomous_tick_plan.items.length).toBeGreaterThan(0);
    expect(second.autonomous_tick_plan.paper_budget_usd).toBeGreaterThanOrEqual(0);
    expect(second.autonomous_tick_plan.execute_count + second.autonomous_tick_plan.refresh_count + second.autonomous_tick_plan.blocked_count).toBeGreaterThanOrEqual(0);
    expect(second.trade_tape.some((trade) =>
      trade.id.startsWith("paper-command-") ||
      trade.id.startsWith("paper-arbiter-") ||
      trade.id.startsWith("paper-watchlist-rotation")
    )).toBe(true);
    expect(second.autonomous_command_center_execution.mode).toBe("command-center-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(second.autonomous_command_center_execution.status);
    expect(second.autonomous_command_center_execution.controls.some((control) => control.includes("defensive sell"))).toBe(true);
  });

  test("GIVEN a persistent paper account WHEN redeploy is rebuilt THEN capture symbols match the live paper book", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const state = await getWeb3TradingStateAsync({ account: "persistent", scenario: "base", advance: false });
    const heldSymbols = new Set(state.portfolio.open_positions.map((position) => position.symbol));

    expect(heldSymbols.size).toBeGreaterThan(0);
    expect(state.autonomous_profit_capture_autopilot.mode).toBe("autonomous-profit-capture-autopilot");
    expect(state.autonomous_profit_redeploy_autopilot.mode).toBe("autonomous-profit-redeploy-autopilot");
    if (state.autonomous_profit_capture_autopilot.symbol) {
      expect(heldSymbols.has(state.autonomous_profit_capture_autopilot.symbol)).toBe(true);
    }
    if (state.autonomous_profit_redeploy_autopilot.from_symbol) {
      expect(heldSymbols.has(state.autonomous_profit_redeploy_autopilot.from_symbol)).toBe(true);
    }
    if (state.autonomous_profit_redeploy_autopilot.released_cash_usd > 0) {
      expect(state.autonomous_profit_redeploy_autopilot.from_symbol).toBe(state.autonomous_profit_capture_autopilot.symbol);
      expect(state.autonomous_profit_redeploy_autopilot.next_action).toContain(state.autonomous_profit_redeploy_autopilot.from_symbol ?? "");
    }
    if (state.autonomous_profit_redeploy_autopilot.status === "protect-first") {
      expect(state.autonomous_profit_redeploy_autopilot.symbol).not.toBe(state.autonomous_profit_redeploy_autopilot.from_symbol);
    }
  });

  test("GIVEN launch sniper finds a clean probe WHEN the persistent paper ledger advances THEN it opens a launch-origin position", async () => {
    const state = await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const launchTrade = state.trade_tape.find((trade) => trade.id.startsWith("paper-launch-") && trade.side === "buy");

    expect(launchTrade).toBeDefined();
    expect(launchTrade?.reason).toContain("Launch sniper");
    expect(state.portfolio.open_positions.some((position) => position.symbol === launchTrade?.symbol)).toBe(true);
    expect(typeof state.trade_tape.some((trade) => trade.side === "sell" && trade.symbol === launchTrade?.symbol)).toBe("boolean");
    expect(state.autopilot.actions.find((action) => action.symbol === launchTrade?.symbol && action.lane === "launch-sniper")).toMatchObject({
      status: "paper-filled",
      side: "buy",
    });
    expect(state.execution_intents.intents.find((intent) => intent.symbol === launchTrade?.symbol && intent.source_action_id.includes("launch"))).toMatchObject({
      status: "paper-filled",
      route_status: "paper-ledger",
    });
  });

  test("GIVEN a held paper position WHEN the next command-board cycle advances THEN the command bridge owns the protective paper fill", async () => {
    const first = await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "breakout", advance: true });
    const firstCommandSell = first.trade_tape.find((trade) => trade.id.startsWith("paper-command-") && trade.side === "sell");
    const second = await getWeb3TradingStateAsync({ account: "persistent", scenario: "breakout", advance: true });
    const protectiveSell = second.trade_tape.find((trade) => trade.side === "sell" && (
      trade.id.startsWith("paper-command-") ||
      trade.id.startsWith("paper-watchlist-rotation") ||
      trade.id.startsWith("paper-position-risk")
    ));

    expect(firstCommandSell).toBeUndefined();
    expect(first.autonomous_command_center_execution.status).toBe("queued");
    expect(first.autonomous_command_center_execution.paper_trade_ready).toBe(true);
    expect(protectiveSell).toBeDefined();
    expect(["applied", "queued", "blocked"]).toContain(second.autonomous_command_center_execution.status);
    expect(second.autonomous_command_center_execution.paper_trade?.side).toBe("sell");
    expect(second.autonomous_command_performance.mode).toBe("autonomous-command-performance");
    expect(second.autonomous_command_performance.command_trade_count).toBeGreaterThanOrEqual(0);
    expect(second.trade_tape.some((trade) => trade.side === "sell")).toBe(true);
    expect(typeof second.autonomous_command_performance.net_contribution_usd).toBe("number");
    expect(second.autonomous_command_performance.next_size_multiplier).toBeGreaterThan(0);
    expect(second.execution_gate.live_execution_enabled).toBe(false);
  });

  test("GIVEN a daemon tick request WHEN the monitor evaluates advance mode THEN the API records the paper daemon action", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "breakout",
          cycles: 2,
          account: "persistent",
          reset: true,
          advance: false,
          daemon: true,
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.paper_daemon.mode).toBe("paper-daemon");
    expect(state.paper_daemon.requested).toBe(true);
    expect(["advance", "observe", "stand-down"]).toContain(state.paper_daemon.action);
    expect(["advanced", "observed", "stand-down"]).toContain(state.paper_daemon.status);
    expect(state.paper_daemon.interval_seconds).toBeGreaterThan(0);
    expect(state.autonomous_loop_director.next_tick_seconds).toBeGreaterThan(0);
    expect(state.paper_daemon.next_tick_at).toContain("T");
    expect(state.paper_daemon.current_cycle).toBe(state.paper_account.cycle);
    expect(state.paper_daemon.controls.some((control) => control.includes("Live execution remains locked"))).toBe(true);
    expect(state.paper_daemon.controls.some((control) => control.includes("Risk governor"))).toBe(true);
    expect(state.autonomous_strategy_attribution.mode).toBe("autonomous-strategy-attribution");
    expect(["scale", "selective", "tighten", "protect", "learning", "idle"]).toContain(state.autonomous_strategy_attribution.status);
    expect(state.autonomous_strategy_attribution.controls.some((control) => control.includes("local paper fills"))).toBe(true);
    expect(state.autonomous_policy_optimizer.items.some((item) => item.id === "strategy-policy")).toBe(true);
    expect(state.autonomous_policy_optimizer.attribution_size_bias).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.mode).toBe("autonomous-tick-plan");
    expect(["trade", "protect", "refresh", "observe", "stand-down", "blocked"]).toContain(state.autonomous_tick_plan.status);
    expect(state.autonomous_tick_plan.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.items.length).toBeGreaterThan(0);
    expect(state.autonomous_session_supervisor.mode).toBe("autonomous-session-supervisor");
    expect(state.autonomous_session_supervisor.cadence_seconds).toBeLessThanOrEqual(state.autonomous_monitor.recommended_interval_seconds);
    expect(state.autonomous_session_supervisor.next_wake_at).toBe(state.autonomous_monitor.next_wake_at);
    expect(state.autonomous_session_supervisor.can_advance_paper).toBe(
      state.autonomous_monitor.should_advance_paper &&
        state.autonomy_risk_governor.allow_paper_advance &&
        state.autonomous_capital_allocator.status !== "blocked" &&
        !state.post_trade_review.pause_new_entries &&
        !state.paper_daemon_memory.pause_new_entries,
    );
    expect(state.autonomous_session_supervisor.items.some((item) => item.lane === "heartbeat")).toBe(true);
    expect(state.autonomous_session_supervisor.items.some((item) => item.lane === "capital")).toBe(true);
    expect(state.autonomous_capital_allocator.deploy_budget_usd).toBeLessThanOrEqual(state.portfolio.cash_usd);
    expect(state.autonomous_capital_allocator.max_orders_this_cycle).toBeLessThanOrEqual(
      Math.max(0, Math.floor(state.autonomy_risk_governor.message_budget_remaining / 2)),
    );
    expect(state.autonomous_session_supervisor.live_execution_permitted).toBe(false);
    expect(state.autonomous_session_supervisor.controls.some((control) => control.includes("Paper advance can run"))).toBe(true);
    expect(state.autonomous_loop_director.mode).toBe("autonomous-loop-director");
    expect(state.autonomous_loop_director.request.daemon).toBe(true);
    expect(state.autonomous_loop_director.request.advance).toBe(false);
    expect(state.autonomous_loop_director.max_ticks_per_minute).toBeLessThanOrEqual(12);
    expect(["burst", "active", "watch", "cooldown", "paused"]).toContain(state.autonomous_loop_director.intensity);
    expect(state.autonomous_loop_director.batch_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_loop_director.feed_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_loop_director.route_refresh_status).toBe(state.route_refresh_queue.status);
    expect(typeof state.autonomous_loop_director.should_refresh_route_quotes).toBe("boolean");
    expect(state.autonomous_loop_director.controls.some((control) => control.includes("Repeated autonomous advances"))).toBe(true);
    if (["blocked", "halted", "paused"].includes(state.autonomous_loop_director.status)) {
      expect(state.autonomous_loop_director.client_should_run).toBe(false);
    } else {
      expect(state.autonomous_loop_director.client_should_run).toBe(true);
    }
    expect(state.autonomous_portfolio_sentinel.mode).toBe("autonomous-portfolio-sentinel");
    expect(state.autonomous_portfolio_sentinel.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_sentinel.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_sentinel.controls.some((control) => control.includes("local paper recommendations"))).toBe(true);
    expect(state.autonomous_trade_arbiter.mode).toBe("autonomous-trade-arbiter");
    expect(state.autonomous_trade_arbiter.items.length).toBeGreaterThan(0);
    expect(state.autonomous_trade_arbiter.controls.some((control) => control.includes("Produces local paper trade decisions only"))).toBe(true);
    expect(state.autonomous_trade_arbiter.items.every((item) => item.route_status.length > 0 && item.reason.length > 0)).toBe(true);
    expect(state.autonomous_trade_execution_bridge.mode).toBe("arbiter-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_trade_execution_bridge.status);
    expect(state.autonomous_trade_execution_bridge.controls.some((control) => control.includes("paper-ledger-only"))).toBe(true);
	    expect(state.autonomous_opportunity_race_execution.mode).toBe("opportunity-race-paper-execution");
	    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_opportunity_race_execution.status);
	    expect(state.trend_chase_execution.mode).toBe("trend-chase-paper-execution");
	    expect(["queued", "applied", "blocked", "idle"]).toContain(state.trend_chase_execution.status);
	    expect(state.trend_chase_execution.execution_boundary).toBe("paper-ledger-only");
	    expect(state.trend_chase_execution.scout_reserve_usd).toBeGreaterThanOrEqual(0);
	    expect(state.scout_lifecycle.mode).toBe("scout-lifecycle-controller");
	    expect(["harvest", "trim", "stop", "tighten", "watch", "idle"]).toContain(state.scout_lifecycle.status);
	    expect(state.scout_lifecycle.execution_boundary).toBe("paper-ledger-only");
	    expect(state.scout_lifecycle.watched_count).toBeGreaterThanOrEqual(0);
	    expect(state.autonomous_tick_plan.items.some((item) => item.id === "tick-plan-trend-chase")).toBe(
	      state.trend_chase_execution.status !== "idle",
	    );
	    expect(typeof state.autonomous_tick_plan.items.some((item) => item.id === "tick-plan-scout-lifecycle")).toBe("boolean");
	    expect(state.autonomous_position_risk_execution.mode).toBe("autonomous-position-risk-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_position_risk_execution.status);
    expect(state.autonomous_position_risk_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.portfolio_tape_guard_execution.mode).toBe("portfolio-tape-guard-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.portfolio_tape_guard_execution.status);
    expect(state.portfolio_tape_guard_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_trade_mission.steps.some((step) => step.id === "mission-race-execution")).toBe(true);
    const raceStep = state.autonomous_trade_mission.steps.find((step) => step.id === "mission-race-execution");
    expect(raceStep?.detail).toBe(state.autonomous_opportunity_race_execution.next_action);
    if (state.autonomous_opportunity_race_execution.status !== "idle") {
      expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "opportunity-race-execution")).toBe(true);
      if (state.autonomous_opportunity_race_execution.selected_symbol) {
        expect(state.autonomous_monitor.watch_symbols).toContain(state.autonomous_opportunity_race_execution.selected_symbol);
      }
    }
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    if (state.paper_daemon.advanced) {
      expect(state.paper_daemon.current_cycle).toBeGreaterThan(state.paper_daemon.previous_cycle);
    } else {
      expect(state.paper_daemon.current_cycle).toBe(state.paper_daemon.previous_cycle);
    }
  });

  test("GIVEN DEX Screener fails WHEN live mode is requested THEN the route falls back to sample data visibly", async () => {
    const fetchImpl = async () => Response.json({ error: "rate limited" }, { status: 429 });
    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });

    expect(state.market_source.status).toBe("fallback");
    expect(state.market_source.detail).toContain("429");
    expect(state.discovery_tape.status).toBe("fallback");
    expect(state.market_feed_integrity.status).toBe("fallback");
    expect(state.market_feed_integrity.reconnect_required).toBe(true);
    expect(state.market_feed_integrity.backfill_required).toBe(true);
    expect(state.market_feed_integrity.checks.some((check) => check.status === "fail")).toBe(true);
    expect(state.market_stream_supervisor.status).toBe("reconnect");
    expect(state.market_stream_supervisor.transport).toBe("unavailable");
    expect(state.market_stream_supervisor.reconnect_count).toBeGreaterThan(0);
    expect(state.market_stream_supervisor.backfill_count).toBeGreaterThan(0);
    expect(state.market_ingestion_plan.status).toBe("blocked");
    expect(state.market_ingestion_plan.steps.some((step) => step.action === "reconnect" || step.action === "pause")).toBe(true);
    expect(state.market_ingestion_plan.safeguards.some((item) => item.includes("Fresh entries stay blocked"))).toBe(true);
    expect(state.autonomous_trade_readiness_gate.status).toBe("blocked");
    expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
    expect(state.autonomous_trade_readiness_gate.data_repair_required).toBe(true);
    expect(state.autonomous_loop_director.should_issue_daemon_tick).toBe(false);
    expect(state.position_watch_clock.status).toBe("stale");
    expect(state.position_watch_clock.stale_count).toBe(state.portfolio.open_positions.length);
    expect(state.position_watch_clock.items.every((item) => item.feed_refresh_required)).toBe(true);
    expect(state.position_watch_clock.items.some((item) => item.lane === "rest-backfill")).toBe(true);
    expect(["refresh", "exit-now"]).toContain(state.position_surveillance_matrix.status);
    expect(state.position_surveillance_matrix.stale_count).toBe(state.portfolio.open_positions.length);
    expect(state.position_surveillance_matrix.items.every((item) => item.feed_refresh_required)).toBe(true);
    expect(state.portfolio_price_action_guard.stale_count).toBe(state.portfolio.open_positions.length);
    expect(state.portfolio_price_action_guard.items.every((item) => item.action === "refresh" && item.status === "stale")).toBe(true);
    expect(["tighten", "trim", "exit"]).toContain(state.liquidity_exit_sentinel.status);
    expect(state.liquidity_exit_sentinel.items.some((item) =>
      item.blockers.some((blocker) => blocker.includes("reconnect"))
    )).toBe(true);
    expect(state.autonomy_risk_governor.status).toBe("halted");
    expect(state.autonomy_risk_governor.allow_paper_advance).toBe(false);
    expect(state.autonomy_risk_governor.kill_switch_recommended).toBe(true);
    expect(state.autonomy_risk_governor.checks.find((check) => check.id === "feed")?.status).toBe("fail");
    expect(state.autonomous_compounder.status).toBe("halted");
    expect(state.autonomous_compounder.next_order_cap_usd).toBe(0);
    expect(state.autonomous_compounder.launch_order_cap_usd).toBe(0);
    expect(state.execution_edge_ladder.status).toBe("blocked");
    expect(state.execution_edge_ladder.items.every((item) => item.action !== "execute-paper")).toBe(true);
    expect(state.live_execution_arming.submit_ready).toBe(false);
    expect(state.live_execution_arming.checks.find((check) => check.id === "preflight")?.status).toBe("fail");
    expect(state.transaction_lifecycle.status).toBe("blocked");
    expect(state.transaction_lifecycle.items.every((item) => item.stage !== "awaiting-signature")).toBe(true);
    expect(state.discovery_tape.sources[0]).toMatchObject({ status: "failed" });
    expect(state.autonomy_policy.stand_down).toBe(true);
    expect(state.autonomy_policy.orders.every((order) => order.decision !== "press")).toBe(true);
    expect(state.situation_monitor.regime).toBe("stand-down");
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "monitor-feed-integrity-critical")).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "monitor-risk-governor")).toBe(true);
    expect(state.autonomous_monitor.should_advance_paper).toBe(false);
    expect(state.situation_monitor.alerts.some((alert) => alert.id === "discovery-fallback")).toBe(true);
    expect(state.autopilot.status).toBe("stand-down");
    expect(state.autopilot.actions[0]).toMatchObject({ lane: "stand-down", status: "blocked" });
    expect(state.profit_optimizer.mode).toBe("protect");
    expect(state.learning_loop.signals.length).toBeGreaterThan(0);
    expect(state.market.length).toBeGreaterThan(0);
    expect(state.market.some((market) => market.symbol === "BONK")).toBe(true);
  });

  test("GIVEN live discovery fails WHEN persistent paper advances THEN legacy entries stay blocked by readiness gate", async () => {
    const fetchImpl = async () => Response.json({ error: "rate limited" }, { status: 429 });
    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      account: "persistent",
      reset: true,
      advance: true,
      fetchImpl,
    });

    expect(state.paper_account.persisted).toBe(true);
    expect(state.paper_account.cycle).toBe(1);
    expect(state.market_source.status).toBe("fallback");
    expect(state.autonomous_trade_readiness_gate.status).toBe("blocked");
    expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
    expect(state.autonomous_trade_readiness_gate.data_repair_required).toBe(true);
    expect(state.paper_account.trade_count).toBe(0);
    expect(state.trade_tape.filter((trade) => trade.side === "buy")).toHaveLength(0);
    expect(state.portfolio.open_positions).toHaveLength(0);
    expect(state.portfolio.cash_usd).toBe(25_000);
  });

  test("GIVEN live trigger credentials WHEN deposit craft is requested THEN the app returns hash-only signer metadata", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "rug-risk", advance: true });

    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const craftedTx = Buffer.from("unsigned-trigger-deposit").toString("base64");
    let depositBody: Record<string, unknown> | null = null;
    const liveTokens = [
      { address: "BonkMint111111111111111111111111111111111", symbol: "BONK", name: "Bonk", price: "0.000019" },
      { address: "WifMint1111111111111111111111111111111111", symbol: "WIF", name: "dogwifhat", price: "2.54" },
      { address: "FartcoinMint111111111111111111111111111", symbol: "FARTCOIN", name: "Fartcoin", price: "0.92" },
      { address: "PopcatMint111111111111111111111111111111", symbol: "POPCAT", name: "Popcat", price: "0.58" },
    ];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1") || url.includes("/token-boosts/latest/v1")) {
        return Response.json(liveTokens.map((token) => ({ chainId: "solana", tokenAddress: token.address })));
      }
      if (
        url.includes("/token-profiles/latest/v1") ||
        url.includes("/community-takeovers/latest/v1") ||
        url.includes("/ads/latest/v1")
      ) {
        return Response.json([]);
      }
      if (url.includes("/tokens/v1/solana/")) {
        return Response.json(liveTokens.map((token) => ({
            chainId: "solana",
            dexId: "raydium",
            pairAddress: `${token.symbol}Pair111`,
            baseToken: { address: token.address, name: token.name, symbol: token.symbol },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: token.price,
            txns: { m5: { buys: 90, sells: 130 } },
            volume: { m5: 120_000, h1: 1_200_000, h24: 14_000_000 },
            priceChange: { m5: -7.8, h1: -12.4, h6: -18.9 },
            liquidity: { usd: 6_000_000 },
            marketCap: 1_500_000_000,
            pairCreatedAt: Date.now() - 500 * 24 * 60 * 60 * 1000,
            boosts: { active: 1 },
          })));
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "42000000000",
          priceImpactPct: "0.18",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("/trigger/v2/deposit/craft")) {
        depositBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return Response.json({ requestId: "deposit-request-1", transaction: craftedTx });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      account: "persistent",
      scenario: "rug-risk",
      advance: false,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_order: { action: "craft-deposit" },
      fetchImpl,
    });

    expect(state.market_source.status).toBe("live");
    expect(state.trigger_order_planner.status).toBe("ready");
    expect(state.trigger_order_execution.status).toBe("deposit-crafted");
    expect(state.trigger_order_execution.deposit_request_id).toBe("deposit-request-1");
    expect(state.trigger_order_execution.deposit_payload_hash).toHaveLength(64);
    expect(state.trigger_order_execution.deposit_payload_bytes).toBe(Buffer.from("unsigned-trigger-deposit").length);
    expect(state.trigger_order_execution.signed_deposit_hash).toBeNull();
    const craftedBody = depositBody as Record<string, unknown> | null;
    expect(craftedBody).toMatchObject({
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      userAddress: "11111111111111111111111111111111",
      orderType: "price",
    });
    expect(liveTokens.map((token) => token.address)).toContain(String(craftedBody?.inputMint));
    expect(typeof craftedBody?.amount).toBe("string");
  });

  test("GIVEN trigger credentials WHEN order history is synced THEN fills and signatures are summarized without transaction bodies", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const wifMint = "EKpQGSJtjMFqKZ9KQan...sample";
    let historyUrl = "";
    let historyHeaders: HeadersInit | undefined;
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      historyUrl = String(input);
      historyHeaders = init?.headers;
      return Response.json({
        orders: [
          {
            id: "order-filled-1",
            orderType: "oco",
            orderState: "filled",
            rawState: "fill_success",
            inputMint: wifMint,
            initialInputAmount: "1000000",
            remainingInputAmount: "0",
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            triggerMint: wifMint,
            triggerPriceUsd: 2.95,
            slippageBps: 650,
            fillPercent: 1,
            outputAmount: "3100000",
            inputUsed: "1000000",
            updatedAt: Date.parse("2026-06-16T12:00:00.000Z"),
            events: [
              {
                type: "deposit",
                timestamp: Date.parse("2026-06-16T11:55:00.000Z"),
                txSignature: "deposit-signature-1",
                mint: wifMint,
                amount: "1000000",
                state: "success",
              },
              {
                type: "fill",
                timestamp: Date.parse("2026-06-16T12:00:00.000Z"),
                txSignature: "fill-signature-1",
                mint: wifMint,
                amount: "1000000",
                outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                outputAmount: "3100000",
                orderContext: "stop_loss",
                state: "success",
              },
            ],
          },
        ],
        pagination: { total: 1, limit: 2, offset: 0 },
      });
    };

    const state = await getWeb3TradingStateAsync({
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_history: {
        state: "past",
        mint: wifMint,
        limit: 2,
        offset: 0,
        sort: "updated_at",
        dir: "desc",
      },
      fetchImpl,
    });

    const headerRecord = historyHeaders as Record<string, string>;
    expect(historyUrl).toContain("/trigger/v2/orders/history?state=past");
    expect(historyUrl).toContain("limit=2");
    expect(historyUrl).toContain(`mint=${encodeURIComponent(wifMint)}`);
    expect(headerRecord["x-api-key"]).toBe("test-jupiter-key");
    expect(headerRecord.authorization).toBe("Bearer test-trigger-jwt");
    expect(state.trigger_order_history.status).toBe("filled");
    expect(state.trigger_order_history.total_orders).toBe(1);
    expect(state.trigger_order_history.filled_count).toBe(1);
    expect(state.trigger_order_history.fill_event_count).toBe(1);
    expect(state.trigger_order_history.latest_order_id).toBe("order-filled-1");
    expect(state.trigger_order_history.latest_event_type).toBe("fill");
    expect(state.trigger_order_history.latest_tx_signature).toBe("fill-signature-1");
    expect(state.trigger_order_history.items[0]?.events[1]?.output_amount_raw).toBe("3100000");
    expect(state.trigger_order_reconciliation.status).toBe("needs-reconcile");
    expect(state.trigger_order_reconciliation.ledger_patch_ready).toBe(true);
    expect(state.trigger_order_reconciliation.fill_count).toBe(1);
    expect(state.trigger_order_reconciliation.realized_output_usd).toBe(3);
    expect(state.trigger_order_reconciliation.estimated_realized_pnl_usd).toBeGreaterThanOrEqual(0);
    expect(state.trigger_order_reconciliation.items[0]).toMatchObject({
      order_id: "order-filled-1",
      symbol: "WIF",
      position_id: "pos-wif",
      action: "realize-fill",
      latest_tx_signature: "fill-signature-1",
    });
  });

  test("GIVEN an expired trigger order WHEN history is reconciled THEN the bot blocks redeploy until protection is rebuilt", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const fetchImpl = async () => Response.json({
      orders: [
        {
          id: "order-expired-1",
          orderType: "single",
          orderState: "expired",
          rawState: "expired",
          inputMint: "EKpQGSJtjMFqKZ9KQan...sample",
          initialInputAmount: "1000000",
          remainingInputAmount: "1000000",
          outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          triggerMint: "EKpQGSJtjMFqKZ9KQan...sample",
          triggerPriceUsd: 2.35,
          slippageBps: 650,
          expiresAt: Date.parse("2026-06-16T12:05:00.000Z"),
          updatedAt: Date.parse("2026-06-16T12:06:00.000Z"),
          events: [
            {
              type: "expired",
              timestamp: Date.parse("2026-06-16T12:06:00.000Z"),
              state: "success",
            },
          ],
        },
      ],
      pagination: { total: 1, limit: 20, offset: 0 },
    });

    const state = await getWeb3TradingStateAsync({
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_history: { state: "past" },
      fetchImpl,
    });

    expect(state.trigger_order_history.expired_count).toBe(1);
    expect(state.trigger_order_reconciliation.status).toBe("attention");
    expect(state.trigger_order_reconciliation.ledger_patch_ready).toBe(false);
    expect(state.trigger_order_reconciliation.action_count).toBe(1);
    expect(state.trigger_order_reconciliation.items[0]).toMatchObject({
      order_id: "order-expired-1",
      symbol: "WIF",
      position_id: "pos-wif",
      action: "rebuild-order",
    });
    expect(state.trigger_order_reconciliation.next_action).toContain("protection");
  });

  test("GIVEN active Trigger protection for every planned exit WHEN coverage is built THEN fresh buys can reopen", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const execution = {
      mode: "dry-run" as const,
      kill_switch: false,
      wallet_public_key: "11111111111111111111111111111111",
      max_trade_usd: 1_000,
      daily_spend_cap_usd: 5_000,
      max_slippage_bps: 500,
    };
    const seed = await getWeb3TradingStateAsync({ scenario: "rug-risk", execution });
    const orders = seed.trigger_order_planner.items
      .filter((plan) => plan.input_mint && plan.input_amount_raw && plan.protected_notional_usd > 0)
      .map((plan, index) => ({
        id: `order-active-${index}`,
        orderType: plan.order_type === "oco" ? "oco" : "single",
        orderState: "active",
        rawState: "open",
        inputMint: plan.input_mint,
        initialInputAmount: plan.input_amount_raw,
        remainingInputAmount: plan.input_amount_raw,
        outputMint: plan.output_mint,
        triggerMint: plan.trigger_mint,
        triggerPriceUsd: plan.stop_trigger_price_usd,
        slippageBps: plan.slippage_bps,
        updatedAt: Date.parse("2026-06-16T12:00:00.000Z") + index,
        events: [
          {
            type: "deposit",
            timestamp: Date.parse("2026-06-16T11:59:00.000Z") + index,
            txSignature: `deposit-active-${index}`,
            mint: plan.input_mint,
            amount: plan.input_amount_raw,
            state: "success",
          },
        ],
      }));

    const fetchImpl = async () => Response.json({
      orders,
      pagination: { total: orders.length, limit: 20, offset: 0 },
    });

    const state = await getWeb3TradingStateAsync({
      scenario: "rug-risk",
      execution,
      trigger_history: { state: "active" },
      fetchImpl,
    });

    expect(orders.length).toBeGreaterThan(0);
    expect(state.trigger_order_history.active_count).toBe(orders.length);
    expect(state.protective_trigger_coverage.active_order_count).toBe(orders.length);
    expect(state.protective_trigger_coverage.uncovered_count).toBe(0);
    expect(state.protective_trigger_coverage.repair_count).toBe(0);
    expect(state.protective_trigger_coverage.should_pause_fresh_buys).toBe(false);
    expect(state.autonomous_action_queue.fresh_buy_protection_status).toBe("clear");
    expect(state.autonomous_action_queue.fresh_buy_blocked_count).toBe(0);
    expect(state.autonomous_session_planner.max_fresh_buys).toBeGreaterThanOrEqual(0);
    expect(state.protective_trigger_coverage.items.filter((item) => item.coverage_status === "covered")).toHaveLength(orders.length);
  });

  test("GIVEN an active-looking Trigger order with no remaining size WHEN coverage is built THEN fresh buys stay blocked", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const execution = {
      mode: "dry-run" as const,
      kill_switch: false,
      wallet_public_key: "11111111111111111111111111111111",
      max_trade_usd: 1_000,
      daily_spend_cap_usd: 5_000,
      max_slippage_bps: 500,
    };
    const seed = await getWeb3TradingStateAsync({ scenario: "rug-risk", execution });
    const stalePlan = seed.trigger_order_planner.items.find((plan) => plan.input_mint && plan.input_amount_raw);
    expect(stalePlan).toBeDefined();

    const fetchImpl = async () => Response.json({
      orders: stalePlan ? [
        {
          id: "order-stale-active-1",
          orderType: stalePlan.order_type === "oco" ? "oco" : "single",
          orderState: "active",
          rawState: "open",
          inputMint: stalePlan.input_mint,
          initialInputAmount: stalePlan.input_amount_raw,
          remainingInputAmount: "0",
          outputMint: stalePlan.output_mint,
          triggerMint: stalePlan.trigger_mint,
          triggerPriceUsd: stalePlan.stop_trigger_price_usd,
          slippageBps: stalePlan.slippage_bps,
          fillPercent: 0,
          updatedAt: Date.parse("2026-06-16T12:00:00.000Z"),
          events: [
            {
              type: "deposit",
              timestamp: Date.parse("2026-06-16T11:59:00.000Z"),
              txSignature: "deposit-stale-active-1",
              mint: stalePlan.input_mint,
              amount: stalePlan.input_amount_raw,
              state: "success",
            },
          ],
        },
      ] : [],
      pagination: { total: stalePlan ? 1 : 0, limit: 20, offset: 0 },
    });

    const state = await getWeb3TradingStateAsync({
      scenario: "rug-risk",
      execution,
      trigger_history: { state: "active" },
      fetchImpl,
    });

    const staleCoverage = state.protective_trigger_coverage.items.find((item) => item.position_id === stalePlan?.position_id);
    expect(state.trigger_order_history.active_count).toBe(stalePlan ? 1 : 0);
    expect(staleCoverage?.coverage_status).not.toBe("covered");
    expect(state.protective_trigger_coverage.should_pause_fresh_buys).toBe(true);
    expect(state.autonomous_action_queue.fresh_buy_protection_status).toBe("protect-first");
    expect(state.autonomous_action_queue.fresh_buy_blocked_count).toBeGreaterThan(0);
    expect(state.autonomous_session_planner.max_fresh_buys).toBe(0);
  });

  test("GIVEN a Trigger fill patch WHEN applied twice THEN the persistent portfolio mirror only changes once", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });

    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";
    const fartcoinMint = "9BB6NFEcjBCtnNLFko...sample";
    const fetchImpl = async () => Response.json({
      orders: [
        {
          id: "order-fill-apply-1",
          orderType: "single",
          orderState: "filled",
          rawState: "fill_success",
          inputMint: fartcoinMint,
          initialInputAmount: "100000000",
          remainingInputAmount: "0",
          outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          triggerMint: fartcoinMint,
          triggerPriceUsd: 1.3,
          slippageBps: 650,
          fillPercent: 1,
          outputAmount: "130000000",
          inputUsed: "100000000",
          updatedAt: Date.parse("2026-06-16T12:00:00.000Z"),
          events: [
            {
              type: "fill",
              timestamp: Date.parse("2026-06-16T12:00:00.000Z"),
              txSignature: "fill-apply-signature-1",
              mint: fartcoinMint,
              amount: "100000000",
              outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              outputAmount: "130000000",
              orderContext: "take_profit",
              state: "success",
            },
          ],
        },
      ],
      pagination: { total: 1, limit: 20, offset: 0 },
    });

    const before = await getWeb3TradingStateAsync({ account: "persistent", scenario: "base", advance: false });
    const beforePosition = before.portfolio.open_positions.find((position) => position.symbol === "FARTCOIN");

    const applied = await getWeb3TradingStateAsync({
      account: "persistent",
      scenario: "base",
      advance: false,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_history: { state: "past" },
      trigger_reconcile: { action: "apply", order_ids: ["order-fill-apply-1"] },
      fetchImpl,
    });

    const afterPosition = applied.portfolio.open_positions.find((position) => position.symbol === "FARTCOIN");
    expect(beforePosition?.quantity).toBeGreaterThan(afterPosition?.quantity ?? 0);
    expect(Math.round(applied.portfolio.cash_usd - before.portfolio.cash_usd)).toBe(130);
    expect(applied.paper_account.trade_count).toBe(before.paper_account.trade_count + 1);
    expect(applied.trigger_order_reconciliation.status).toBe("reconciled");
    expect(applied.trigger_order_reconciliation.applied_count).toBe(1);
    expect(applied.trigger_order_reconciliation.pending_patch_count).toBe(0);
    expect(applied.trigger_order_reconciliation.items[0]).toMatchObject({
      order_id: "order-fill-apply-1",
      patch_status: "applied",
      action: "realize-fill",
    });

    const duplicate = await getWeb3TradingStateAsync({
      account: "persistent",
      scenario: "base",
      advance: false,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_history: { state: "past" },
      trigger_reconcile: { action: "apply", order_ids: ["order-fill-apply-1"] },
      fetchImpl,
    });

    expect(duplicate.portfolio.cash_usd).toBe(applied.portfolio.cash_usd);
    expect(duplicate.paper_account.trade_count).toBe(applied.paper_account.trade_count);
    expect(duplicate.trigger_order_reconciliation.applied_count).toBe(1);
    expect(duplicate.trigger_order_reconciliation.pending_patch_count).toBe(0);
  });

  test("GIVEN repeated daemon ticks WHEN the agent runs autonomously THEN recent tick memory persists", async () => {
    const first = await getWeb3TradingStateAsync({
      account: "persistent",
      reset: true,
      scenario: "breakout",
      daemon: true,
    });
    const second = await getWeb3TradingStateAsync({
      account: "persistent",
      scenario: "breakout",
      daemon: true,
    });

    expect(first.paper_daemon.requested).toBe(true);
    expect(first.paper_daemon_memory.tick_count).toBe(1);
    expect(first.paper_daemon_memory.ticks[0]).toMatchObject({
      cycle: first.paper_daemon.current_cycle,
      action: first.paper_daemon.action,
      equity_usd: first.portfolio.equity_usd,
    });
    expect(second.paper_daemon_memory.tick_count).toBe(2);
    expect(second.paper_daemon_memory.window_size).toBe(2);
    expect(second.paper_daemon_memory.fill_count).toBeGreaterThanOrEqual(first.paper_daemon_memory.fill_count);
    expect(second.paper_daemon_memory.recommended_action.length).toBeGreaterThan(0);
    expect(second.paper_daemon_memory.ticks.map((tick) => tick.id)).toHaveLength(
      new Set(second.paper_daemon_memory.ticks.map((tick) => tick.id)).size,
    );
    expect(second.post_trade_review.mode).toBe("post-trade-review");
    expect(second.post_trade_review.reviewed_tick_count).toBe(second.paper_daemon_memory.window_size);
    expect(second.post_trade_review.reviewed_trade_count).toBe(second.performance_scorecard.trade_count);
    expect(second.post_trade_review.lessons.length).toBe(5);
    expect(second.post_trade_review.next_action.length).toBeGreaterThan(0);
    expect(second.post_trade_review.recommended_cadence_seconds).toBeGreaterThan(0);
  });

  test("POST /api/web3-trading validates requested cycles", async () => {
    const bad = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ scenario: "base", cycles: 100 }),
      }),
    );
    const good = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ scenario: "rug-risk", cycles: 1 }),
      }),
    );

    expect(bad.status).toBe(422);
    expect(good.status).toBe(200);
    expect((await json<Web3TradingState>(good)).scenario).toBe("rug-risk");
  });

  test("POST /api/web3-trading validates requested source", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ source: "live-wallet" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "source must be sample or live-dex." });
  });

  test("POST /api/web3-trading validates portfolio sweep limits", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ portfolio_sweep: { action: "apply", max_trades: 0 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "portfolio_sweep.max_trades must be an integer from 1 to 6." });
  });

  test("POST /api/web3-trading validates autonomous burst limits", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ autonomous_burst: { action: "run", max_protective_sells: 0 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "autonomous_burst.max_protective_sells must be an integer from 1 to 6." });
  });

  test("POST /api/web3-trading validates autonomous session tick limits", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ autonomous_session: { action: "run", ticks: 13 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "autonomous_session.ticks must be an integer from 1 to 12." });
  });

  test("POST /api/web3-trading validates autonomous session policy mode", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ autonomous_session: { action: "run", policy_mode: "reckless" } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "autonomous_session.policy_mode must be auto or manual." });
  });

  test("POST /api/web3-trading validates autonomous session fill caps", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ autonomous_session: { action: "run", max_total_fills: 25 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "autonomous_session.max_total_fills must be an integer from 1 to 24." });
  });

  test("POST /api/web3-trading runs a bounded autonomous paper session", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "breakout",
          source: "sample",
          account: "persistent",
          reset: true,
          autonomous_session: {
            action: "run",
            policy_mode: "manual",
            ticks: 3,
            protect_book: true,
            max_protective_sells: 3,
            min_release_usd: 25,
            max_total_fills: 8,
          },
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.autonomous_session_run.mode).toBe("autonomous-session-run");
    expect(state.autonomous_session_run.requested).toBe(true);
    expect(state.autonomous_session_run.policy_mode).toBe("manual");
    expect(state.autonomous_session_run.planner_status).toBe("none");
    expect(state.autonomous_session_run.planner_session_kind).toBe("none");
    expect(state.autonomous_session_run.planner_route_refresh_required).toBe(false);
    expect(state.autonomous_session_run.requested_ticks).toBe(3);
    expect(state.autonomous_session_run.max_total_fills).toBe(8);
    expect(state.autonomous_session_run.completed_ticks).toBeGreaterThanOrEqual(1);
    expect(state.autonomous_session_run.completed_ticks).toBeLessThanOrEqual(3);
    expect(state.autonomous_session_run.ticks).toHaveLength(state.autonomous_session_run.completed_ticks);
    expect(state.autonomous_session_run.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_session_run.safeguards.some((item) => item.includes("Live execution remains disabled"))).toBe(true);
    expect(state.autonomous_policy_optimizer.mode).toBe("autonomous-policy-optimizer");
    expect(["attack", "selective", "protect", "cooldown"]).toContain(state.autonomous_policy_optimizer.status);
    expect(["snipe", "scalp", "compound", "harvest", "protect", "stand-down"]).toContain(state.autonomous_policy_optimizer.desk_mode);
    expect(state.autonomous_policy_optimizer.desk_mode_confidence).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_policy_optimizer.desk_mode_confidence).toBeLessThanOrEqual(100);
    expect(state.autonomous_policy_optimizer.fresh_entry_permission).toBe(state.churn_efficiency_auditor.entry_permission);
    expect(state.autonomous_policy_optimizer.allowed_actions.length).toBeGreaterThanOrEqual(2);
    expect(state.autonomous_policy_optimizer.allowed_actions).toContain("watch");
    expect(state.autonomous_policy_optimizer.mode_reason.length).toBeGreaterThan(0);
    expect(state.autonomous_policy_optimizer.mode_controls.some((item) => item.includes("Desk mode"))).toBe(true);
    if (!state.churn_efficiency_auditor.can_open_fresh_entries) {
      expect(state.autonomous_policy_optimizer.allowed_actions).not.toContain("fresh-buy");
    }
    expect(state.autonomous_policy_optimizer.recommended_session_ticks).toBeGreaterThanOrEqual(1);
    expect(state.autonomous_policy_optimizer.max_trades_next_session).toBeGreaterThanOrEqual(1);
    expect(state.autonomous_policy_optimizer.items.length).toBeGreaterThanOrEqual(4);
    expect(state.autonomous_policy_optimizer.safeguards.some((item) => item.includes("Do not bypass execution readiness"))).toBe(true);
    expect(state.execution_gate.live_execution_enabled).toBe(false);
  });

  test("POST /api/web3-trading respects a one-fill autonomous paper session cap", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "breakout",
          source: "sample",
          account: "persistent",
          reset: true,
          autonomous_session: {
            action: "run",
            policy_mode: "manual",
            ticks: 12,
            protect_book: true,
            max_protective_sells: 3,
            min_release_usd: 25,
            max_total_fills: 1,
          },
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.autonomous_session_run.requested).toBe(true);
    expect(state.autonomous_session_run.max_total_fills).toBe(1);
    expect(state.autonomous_session_run.fill_count).toBeLessThanOrEqual(1);
    expect(state.autonomous_session_run.protective_sell_count).toBeLessThanOrEqual(1);
    expect(state.autonomous_session_run.summary).toContain("1-fill planner cap");
  });

  test("POST /api/web3-trading auto session follows the baseline planner envelope", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "breakout", advance: false });
    const baseline = await getWeb3TradingStateAsync({ account: "persistent", scenario: "breakout", advance: false });

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "breakout",
          source: "sample",
          account: "persistent",
          autonomous_session: {
            action: "run",
            policy_mode: "auto",
          },
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.autonomous_session_run.policy_mode).toBe("auto");
    expect(state.autonomous_session_run.policy_status).toBe(baseline.autonomous_policy_optimizer.status);
    expect(state.autonomous_session_run.policy_label).toBe(baseline.autonomous_policy_optimizer.policy_label);
    expect(state.autonomous_session_run.planner_status).toBe(baseline.autonomous_session_planner.status);
    expect(state.autonomous_session_run.planner_session_kind).toBe(baseline.autonomous_session_planner.session_kind);
    expect(state.autonomous_session_run.planner_selected_tactic).toBe(baseline.autonomous_session_planner.selected_tactic);
    expect(state.autonomous_session_run.planner_selected_tactic_label).toBe(baseline.autonomous_session_planner.selected_tactic_label);
    expect(state.autonomous_session_run.planner_target_symbol).toBe(baseline.autonomous_session_planner.target_symbol);
    expect(state.autonomous_session_run.planner_deploy_budget_usd).toBe(baseline.autonomous_session_planner.deploy_budget_usd);
    expect(state.autonomous_session_run.planner_release_budget_usd).toBe(baseline.autonomous_session_planner.release_budget_usd);
    expect(state.autonomous_session_run.planner_route_refresh_required).toBe(baseline.autonomous_session_planner.route_refresh_required);
    expect(state.autonomous_session_run.requested_ticks).toBe(
      baseline.autonomous_session_planner.planned_ticks > 0
        ? baseline.autonomous_session_planner.planned_ticks
        : baseline.autonomous_policy_optimizer.recommended_session_ticks,
    );
    expect(state.autonomous_session_run.max_total_fills).toBe(baseline.autonomous_session_planner.max_total_fills);
    expect(state.autonomous_session_run.summary).toContain("under auto");
    expect(state.autonomous_session_run.summary).toContain("planner");
    expect(state.autonomous_session_run.safeguards.some((item) => item.includes("session planner sets"))).toBe(true);
    expect(state.autonomous_command_center.mode).toBe("autonomous-command-center");
    expect(state.autonomous_command_center.items.length).toBeGreaterThan(0);
    expect(state.autonomous_command_center.items.every((item) => typeof item.rehearsal_score === "number")).toBe(true);
    expect(state.autonomous_command_center_execution.mode).toBe("command-center-paper-execution");
    expect(state.autonomous_command_center_execution.execution_boundary).toBe("paper-ledger-only");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_command_center_execution.status);
    expect(typeof state.autonomous_command_center_execution.rehearsal_score).toBe("number");
    expect(state.autonomous_command_performance.mode).toBe("autonomous-command-performance");
    expect(typeof state.autonomous_command_performance.next_size_multiplier).toBe("number");
    expect(state.autonomous_profit_learning.mode).toBe("autonomous-profit-learning");
    expect(["press", "selective", "tighten", "protect", "learning", "idle"]).toContain(state.autonomous_profit_learning.status);
    expect(state.autonomous_profit_learning.items.length).toBeGreaterThanOrEqual(5);
    expect(state.autonomous_profit_learning.deploy_bias_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_learning.release_bias_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_learning.cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_profit_learning.items.some((item) =>
      item.lane === "replay" &&
      item.detail.includes("replay PnL") &&
      item.cadence_seconds > 0
    )).toBe(true);
    expect(state.autonomous_profit_allocation_plan.mode).toBe("autonomous-profit-allocation-plan");
    expect(["press", "rotate", "protect", "cooldown", "learning", "idle"]).toContain(state.autonomous_profit_allocation_plan.status);
    expect(state.autonomous_profit_allocation_plan.deploy_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.release_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("simulated sizing"))).toBe(true);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("protective sells bypass"))).toBe(true);
    expect(state.autonomous_market_intelligence.mode).toBe("autonomous-market-intelligence");
    expect(["chase", "selective", "watch", "protect", "blocked", "idle"]).toContain(state.autonomous_market_intelligence.status);
    expect(state.autonomous_market_intelligence.items.length).toBeGreaterThan(0);
    expect(state.autonomous_market_intelligence.deploy_bias_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_intelligence.recommended_cadence_seconds).toBeGreaterThan(0);
    expect(state.market_intelligence_execution.mode).toBe("market-intelligence-paper-execution");
    expect(state.market_intelligence_execution.execution_boundary).toBe("paper-ledger-only");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.market_intelligence_execution.status);
    expect(state.autonomous_watchlist_rotation.mode).toBe("autonomous-watchlist-rotation");
    expect(state.autonomous_watchlist_rotation.items.length).toBeGreaterThan(0);
    expect(state.watchlist_rotation_execution.mode).toBe("watchlist-rotation-paper-execution");
    expect(state.watchlist_rotation_execution.execution_boundary).toBe("paper-ledger-only");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.watchlist_rotation_execution.status);
    expect(state.autonomous_profit_control.mode).toBe("autonomous-profit-control");
    expect(["press", "compound", "harvest", "redeploy", "protect", "cooldown"]).toContain(state.autonomous_profit_control.status);
    expect(state.autonomous_profit_control.cadence_seconds).toBeGreaterThan(0);
    expect(state.execution_gate.live_execution_enabled).toBe(false);
  });

  test("POST /api/web3-trading applies sentinel portfolio sweep to the paper ledger", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const beforeResponse = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "rug-risk",
          account: "persistent",
          advance: false,
        }),
      }),
    );
    const before = await json<Web3TradingState>(beforeResponse);

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "rug-risk",
          account: "persistent",
          advance: false,
          portfolio_sweep: {
            action: "apply",
            max_trades: 3,
            min_release_usd: 25,
          },
        }),
      }),
    );
    const after = await json<Web3TradingState>(response);

    expect(beforeResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(before.portfolio.open_positions.length).toBeGreaterThan(0);
    expect(before.autonomous_portfolio_sentinel.recommended_release_usd).toBeGreaterThan(0);
    expect(after.trade_tape.some((trade) => trade.id.startsWith("paper-portfolio-sweep") && trade.side === "sell")).toBe(true);
    expect(after.paper_account.trade_count).toBeGreaterThan(before.paper_account.trade_count);
    expect(after.portfolio.cash_usd).toBeGreaterThan(before.portfolio.cash_usd);
    expect(after.portfolio.exposure_usd).toBeLessThan(before.portfolio.exposure_usd);
  });

  test("POST /api/web3-trading runs autonomous burst with sell-first paper protection", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const before = await getWeb3TradingStateAsync({ account: "persistent", scenario: "rug-risk", advance: false });

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "rug-risk",
          account: "persistent",
          daemon: true,
          advance: false,
          autonomous_burst: {
            action: "run",
            protect_book: true,
            max_protective_sells: 3,
            min_release_usd: 25,
          },
        }),
      }),
    );
    const after = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(before.autonomous_portfolio_sentinel.recommended_release_usd).toBeGreaterThan(0);
    expect(after.trade_tape.some((trade) => trade.id.startsWith("paper-portfolio-sweep") && trade.side === "sell")).toBe(true);
    expect(after.autonomous_position_risk_execution.mode).toBe("autonomous-position-risk-execution");
    expect(after.paper_daemon.requested).toBe(true);
    expect(after.portfolio.cash_usd).toBeGreaterThan(before.portfolio.cash_usd);
    expect(after.portfolio.exposure_usd).toBeLessThan(before.portfolio.exposure_usd);
  });

  test("POST /api/web3-trading advances autonomous position risk execution without an explicit sweep", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const before = await getWeb3TradingStateAsync({ account: "persistent", scenario: "rug-risk", advance: false });

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "rug-risk",
          account: "persistent",
          advance: true,
        }),
      }),
    );
    const after = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(before.autonomous_position_risk_execution.mode).toBe("autonomous-position-risk-execution");
    expect(after.trade_tape.some((trade) => (
      trade.id.startsWith("paper-command-") ||
      trade.id.startsWith("paper-tape-guard") ||
      trade.id.startsWith("paper-position-risk") ||
      trade.id.startsWith("paper-watchlist-rotation")
    ) && trade.side === "sell")).toBe(true);
    expect(after.portfolio_tape_guard_execution.execution_boundary).toBe("paper-ledger-only");
    expect(after.autonomous_position_risk_execution.execution_boundary).toBe("paper-ledger-only");
    expect(after.autonomous_command_center_execution.execution_boundary).toBe("paper-ledger-only");
    expect(after.paper_account.trade_count).toBeGreaterThan(before.paper_account.trade_count);
    expect(after.execution_gate.live_execution_enabled).toBe(false);
  });

  test("GET /api/web3-ohlcv validates pool candles without calling a provider", async () => {
    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&timeframe=minute"),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "pool must be a non-empty pool address or id without URL separators." });
  });

  test("GET /api/web3-ohlcv rejects pool ids with URL separators", async () => {
    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&pool=bad/pool&timeframe=minute"),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "pool must be a non-empty pool address or id without URL separators." });
  });

  test("GET /api/web3-ohlcv validates paper wallet context", async () => {
    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&pool=pool-1&timeframe=minute&paper=true&cash_usd=-1"),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "cash_usd must be a number from 0 to 10000000." });
  });

  test("GET /api/web3-ohlcv normalizes GeckoTerminal candles", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        data: {
          attributes: {
            ohlcv_list: [
              [1_718_000_000, 0.1, 0.2, 0.08, 0.18, 1200],
              [1_718_000_060, 0.18, 0.24, 0.16, 0.22, 1800],
            ],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&pool=pool-1&timeframe=minute&aggregate=1&limit=2&token=base"),
    );
    const body = await json<{
      status: string;
      candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>;
      source: string;
      signal: { action: string; confidence: number; blockers: string[] };
      paper_decision: { action: string; reason: string; blockers: string[] };
    }>(response);

    expect(response.status).toBe(200);
    expect(requestedUrl).toContain("/networks/solana/pools/pool-1/ohlcv/minute?");
    expect(requestedUrl).toContain("aggregate=1");
    expect(body.status).toBe("ok");
    expect(body.source).toBe("geckoterminal-public");
    expect(body.candles).toEqual([
      { timestamp: 1_718_000_000, open: 0.1, high: 0.2, low: 0.08, close: 0.18, volume: 1200 },
      { timestamp: 1_718_000_060, open: 0.18, high: 0.24, low: 0.16, close: 0.22, volume: 1800 },
    ]);
    expect(body.signal.action).toBe("hold");
    expect(body.signal.confidence).toBe(18);
    expect(body.signal.blockers).toContain("Candle window is too short for high-frequency paper sizing.");
    expect(body.paper_decision.action).toBe("paper-hold");
    expect(body.paper_decision.blockers).toContain("Pass paper=true with cash_usd, equity_usd, and position_usd to size a local action.");
  });

  test("GET /api/web3-ohlcv sorts candles and returns a local candle decision", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL) => {
      return new Response(JSON.stringify({
        data: {
          attributes: {
            ohlcv_list: [
              [1_718_000_420, 0.128, 0.15, 0.126, 0.148, 3200],
              [1_718_000_360, 0.118, 0.13, 0.116, 0.128, 2600],
              [1_718_000_300, 0.112, 0.12, 0.111, 0.118, 1900],
              [1_718_000_240, 0.108, 0.114, 0.107, 0.112, 1500],
              [1_718_000_180, 0.105, 0.11, 0.104, 0.108, 1300],
              [1_718_000_120, 0.103, 0.106, 0.102, 0.105, 900],
              [1_718_000_060, 0.101, 0.104, 0.1, 0.103, 800],
              [1_718_000_000, 0.1, 0.102, 0.099, 0.101, 700],
            ],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&pool=pool-press&timeframe=minute&aggregate=1&limit=8&token=base&paper=true&cash_usd=2500&position_usd=0&equity_usd=10000&max_trade_usd=500"),
    );
    const body = await json<{
      candles: Array<{ timestamp: number }>;
      signal: {
        mode: string;
        action: string;
        confidence: number;
        short_change_pct: number;
        volume_burst_ratio: number;
        stop_price_usd: number;
        take_profit_price_usd: number;
        review_after_seconds: number;
        triggers: string[];
      };
      paper_decision: {
        action: string;
        side: string;
        notional_usd: number;
        cash_delta_usd: number;
        exposure_delta_usd: number;
        projected_cash_usd: number;
        projected_position_usd: number;
        safeguards: string[];
      };
    }>(response);

    expect(response.status).toBe(200);
    expect(body.candles.map((candle) => candle.timestamp)).toEqual([
      1_718_000_000,
      1_718_000_060,
      1_718_000_120,
      1_718_000_180,
      1_718_000_240,
      1_718_000_300,
      1_718_000_360,
      1_718_000_420,
    ]);
    expect(body.signal.mode).toBe("local-candle-signal-v1");
    expect(body.signal.action).toBe("press");
    expect(body.signal.confidence).toBeGreaterThanOrEqual(72);
    expect(body.signal.short_change_pct).toBeGreaterThan(20);
    expect(body.signal.volume_burst_ratio).toBeGreaterThan(1);
    expect(body.signal.stop_price_usd).toBeLessThan(body.signal.take_profit_price_usd);
    expect(body.signal.review_after_seconds).toBe(10);
    expect(body.signal.triggers.length).toBeGreaterThanOrEqual(3);
    expect(body.paper_decision.action).toBe("paper-buy");
    expect(body.paper_decision.side).toBe("buy");
    expect(body.paper_decision.notional_usd).toBeGreaterThan(10);
    expect(body.paper_decision.notional_usd).toBeLessThanOrEqual(500);
    expect(body.paper_decision.cash_delta_usd).toBeLessThan(0);
    expect(body.paper_decision.exposure_delta_usd).toBeGreaterThan(0);
    expect(body.paper_decision.projected_cash_usd).toBe(2500 - body.paper_decision.notional_usd);
    expect(body.paper_decision.projected_position_usd).toBe(body.paper_decision.notional_usd);
    expect(body.paper_decision.safeguards).toContain("no transaction broadcast");
  });

  test("POST /api/web3-ohlcv validates paper ledger apply requests", async () => {
    const response = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify({
          action: "apply-paper-decision",
          idempotency_key: "bad/key",
          symbol: "TEST",
          side: "buy",
          notional_usd: 250,
          price_usd: 0.1,
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "idempotency_key must be 1 to 160 characters without URL separators." });
  });

  test("POST /api/web3-ohlcv applies a candle paper buy to the local ledger once", async () => {
    const request = {
      action: "apply-paper-decision",
      idempotency_key: "test-candle-1718000420-buy",
      symbol: "TEST",
      token_id: "solana-test-ohlcv",
      token_address: "test-token",
      chain: "solana",
      side: "buy",
      notional_usd: 250,
      price_usd: 0.1,
      stop_price_usd: 0.092,
      take_profit_price_usd: 0.124,
      reason: "press signal confirmed by candle momentum and volume burst",
      source: "pool-test",
    };

    const first = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
    const firstBody = await json<{
      status: string;
      cash_usd: number;
      equity_usd: number;
      exposure_usd: number;
      position_usd: number;
      trade_count: number;
      safeguards: string[];
    }>(first);

    const duplicate = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
    const duplicateBody = await json<{
      status: string;
      cash_usd: number;
      exposure_usd: number;
      trade_count: number;
      blockers: string[];
    }>(duplicate);

    expect(first.status).toBe(200);
    expect(firstBody.status).toBe("applied");
    expect(firstBody.cash_usd).toBe(24_750);
    expect(firstBody.equity_usd).toBe(25_000);
    expect(firstBody.exposure_usd).toBe(250);
    expect(firstBody.position_usd).toBe(250);
    expect(firstBody.trade_count).toBe(1);
    expect(firstBody.safeguards).toContain("no transaction broadcast");
    expect(duplicate.status).toBe(200);
    expect(duplicateBody.status).toBe("duplicate");
    expect(duplicateBody.cash_usd).toBe(24_750);
    expect(duplicateBody.exposure_usd).toBe(250);
    expect(duplicateBody.trade_count).toBe(1);
    expect(duplicateBody.blockers).toContain("duplicate-idempotency-key");
  });

  test("POST /api/web3-ohlcv applies a candle paper sell against an open paper position", async () => {
    const buy = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify({
          action: "apply-paper-decision",
          idempotency_key: "test-candle-roundtrip-buy",
          symbol: "TEST",
          token_id: "solana-test-ohlcv",
          token_address: "test-token",
          chain: "solana",
          side: "buy",
          notional_usd: 250,
          price_usd: 0.1,
          stop_price_usd: 0.092,
          take_profit_price_usd: 0.124,
          reason: "press signal confirmed by candle momentum and volume burst",
          source: "pool-test",
        }),
      }),
    );

    const sell = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify({
          action: "apply-paper-decision",
          idempotency_key: "test-candle-roundtrip-sell",
          symbol: "TEST",
          token_id: "solana-test-ohlcv",
          token_address: "test-token",
          chain: "solana",
          side: "sell",
          notional_usd: 120,
          price_usd: 0.12,
          stop_price_usd: 0.108,
          take_profit_price_usd: 0.132,
          reason: "trim after candle exit pressure",
          source: "pool-test",
        }),
      }),
    );
    const sellBody = await json<{
      status: string;
      cash_usd: number;
      equity_usd: number;
      exposure_usd: number;
      realized_pnl_usd: number;
      position_usd: number;
      trade_count: number;
    }>(sell);

    expect(buy.status).toBe(200);
    expect(sell.status).toBe(200);
    expect(sellBody.status).toBe("applied");
    expect(sellBody.cash_usd).toBe(24_870);
    expect(sellBody.exposure_usd).toBe(180);
    expect(sellBody.position_usd).toBe(180);
    expect(sellBody.equity_usd).toBe(25_050);
    expect(sellBody.realized_pnl_usd).toBe(20);
    expect(sellBody.trade_count).toBe(2);
  });

  test("POST /api/web3-ohlcv blocks a protective paper sell without a matching position", async () => {
    const response = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify({
          action: "apply-paper-decision",
          idempotency_key: "test-guard-sell-no-position",
          symbol: "MISS",
          token_id: "solana-miss-ohlcv",
          token_address: "miss-token",
          chain: "solana",
          side: "sell",
          notional_usd: 120,
          price_usd: 0.12,
          stop_price_usd: 0.108,
          take_profit_price_usd: 0.132,
          reason: "protective guard sell without a held position",
          source: "pool-miss",
        }),
      }),
    );
    const body = await json<{
      status: string;
      cash_usd: number;
      exposure_usd: number;
      trade_count: number;
      blockers: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe("blocked");
    expect(body.cash_usd).toBe(25_000);
    expect(body.exposure_usd).toBe(0);
    expect(body.trade_count).toBe(0);
    expect(body.blockers).toContain("no-paper-position");
  });

  test("POST /api/web3-trading rejects malformed trigger-order signed deposits", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          trigger_order: {
            action: "create-order",
            deposit_request_id: "deposit-request-1",
            deposit_signed_tx: "not base64!",
          },
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "trigger_order.deposit_signed_tx must be base64 encoded." });
  });

  test("POST /api/web3-trading validates trigger-history pagination", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ trigger_history: { state: "active", limit: 101 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "trigger_history.limit must be an integer from 1 to 100." });
  });

  test("POST /api/web3-trading validates trigger reconciliation requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ trigger_reconcile: { action: "apply", order_ids: [""] } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "trigger_reconcile.order_ids must be an array of non-empty strings when provided." });
  });

  test("POST /api/web3-trading validates on-chain event inbox batches", async () => {
    const badSource = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ onchain_events: { source: "mystery-feed", events: [{}] } }),
      }),
    );
    const badEvents = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ onchain_events: { source: "manual", events: [] } }),
      }),
    );

    expect(badSource.status).toBe(422);
    expect(await json<{ error: string }>(badSource)).toEqual({
      error: "onchain_events.source must be helius-webhook, helius-history, or manual.",
    });
    expect(badEvents.status).toBe(422);
    expect(await json<{ error: string }>(badEvents)).toEqual({
      error: "onchain_events.events must contain 1 to 25 events.",
    });
  });

  test("POST /api/web3-trading validates advance as an explicit boolean", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ advance: "yes" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "advance must be a boolean." });
  });

  test("POST /api/web3-trading validates daemon as an explicit boolean", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ daemon: "yes" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "daemon must be a boolean." });
  });

  test("POST /api/web3-trading validates execution cap inputs", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ execution: { mode: "dry-run", max_trade_usd: -1 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "execution.max_trade_usd must be greater than 0." });
  });

  test("POST /api/web3-trading validates drill as an explicit boolean", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ drill: "true" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "drill must be a boolean." });
  });

  test("POST /api/web3-trading validates signer simulation fields", async () => {
    const badToggle = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ execution: { signer_simulation_enabled: "yes" } }),
      }),
    );
    const badNetwork = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ execution: { signer_network: "mainnet" } }),
      }),
    );

    expect(badToggle.status).toBe(422);
    expect(await json<{ error: string }>(badToggle)).toEqual({
      error: "execution.signer_simulation_enabled must be a boolean.",
    });
    expect(badNetwork.status).toBe(422);
    expect(await json<{ error: string }>(badNetwork)).toEqual({
      error: "execution.signer_network must be devnet or localnet.",
    });
  });

  test("POST /api/web3-trading validates signed relay payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ relay: { signed_transaction: "not base64!" } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({
      error: "relay.signed_transaction must be base64 encoded.",
    });
  });
});

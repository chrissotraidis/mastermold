import { bpEntryGate } from "../v3/bars";
import type { CandidateSignal } from "../v3/signal";
import { ExperimentStore, experimentStore } from "./store";
import type {
  ExperimentAccountView,
  ExperimentOrder,
  ExperimentPosition,
  ExperimentRun,
  ExperimentTickInput,
  ExperimentTrade,
} from "./types";

const DEFAULT_STOP_PCT = 2;
const DEFAULT_TP_PCT = 4;
const DEFAULT_HORIZON_MS = 6 * 60 * 60_000;

function equity(store: ExperimentStore, run: ExperimentRun, prices: Map<string, number>): number {
  return store.cash(run) + store.positions(run.id).reduce(
    (sum, position) => sum + position.qty * (prices.get(position.mint) ?? position.entry_price_usd),
    0,
  );
}

function accountView(store: ExperimentStore, run: ExperimentRun, prices: Map<string, number>, nowMs: number): ExperimentAccountView {
  const trades = store.trades(run.id);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const exits = trades.filter((trade) => trade.side === "sell" && trade.realized_pnl_usd !== null);
  let lossStreak = 0;
  let lastLossMs: number | null = null;
  for (const trade of [...exits].reverse()) {
    if ((trade.realized_pnl_usd ?? 0) >= 0) break;
    lossStreak += 1;
    lastLossMs ??= Date.parse(trade.ts);
  }
  const cooldown = new Map<string, number>();
  const cooldownMs = run.config.v2_params?.cooldown_ms ?? 45 * 60_000;
  for (const trade of exits) cooldown.set(trade.mint, Date.parse(trade.ts) + cooldownMs);
  return {
    run,
    cash_usd: store.cash(run),
    equity_usd: equity(store, run, prices),
    positions: store.positions(run.id),
    trades,
    trades_today: trades.filter((trade) => trade.side === "buy" && trade.ts.startsWith(today)).length,
    spend_today_usd: trades.filter((trade) => trade.side === "buy" && trade.ts.startsWith(today)).reduce((sum, trade) => sum + trade.value_usd, 0),
    cooldown_until_ms: cooldown,
    loss_streak: lossStreak,
    last_loss_ms: lastLossMs,
    last_entry_ms: [...trades].reverse().find((trade) => trade.side === "buy")?.ts
      ? Date.parse([...trades].reverse().find((trade) => trade.side === "buy")!.ts)
      : null,
  };
}

function costRate(input: ExperimentTickInput, mint: string): number {
  return Math.max(0, input.one_way_cost_bps_by_mint.get(mint) ?? 30) / 10_000;
}

function sell(
  store: ExperimentStore,
  run: ExperimentRun,
  position: ExperimentPosition,
  price: number,
  reason: string,
  input: ExperimentTickInput,
): void {
  const value = position.qty * price;
  const fee = value * costRate(input, position.mint);
  const pnl = value - fee - position.entry_value_usd - position.entry_fee_usd;
  const ts = new Date(input.now_ms).toISOString();
  store.appendTrade({
    run_id: run.id, ts, side: "sell", mint: position.mint, symbol: position.symbol,
    qty: position.qty, price_usd: price, value_usd: value, fee_usd: fee,
    realized_pnl_usd: pnl, reason, strategy_id: position.strategy_id,
  });
  store.closePosition(run.id, position.mint);
  store.appendDecision({ run_id: run.id, ts, symbol: position.symbol, verdict: "exit", reason });
}

function markAndExit(store: ExperimentStore, run: ExperimentRun, input: ExperimentTickInput): void {
  for (const position of store.positions(run.id)) {
    const price = input.prices.get(position.mint);
    if (!price || price <= 0) continue;
    const peak = Math.max(position.peak_usd, price);
    if (peak !== position.peak_usd) store.upsertPosition({ ...position, peak_usd: peak });
    if (price <= position.entry_price_usd * (1 - position.stop_pct / 100)) {
      sell(store, run, position, price, "hard stop", input);
    } else if (price >= position.entry_price_usd * (1 + position.tp_pct / 100)) {
      sell(store, run, position, price, "take profit", input);
    } else if (input.now_ms >= Date.parse(position.deadline_ts)) {
      sell(store, run, position, price, "time barrier", input);
    }
  }
}

function orderFromCandidate(candidate: CandidateSignal, price: number, nowMs: number): ExperimentOrder {
  const stopPct = Math.min(8, Math.max(0.5, candidate.max_loss_bps / 100));
  const targetPct = Math.min(12, Math.max(stopPct * 1.5, candidate.expected_return_bps / 100));
  return {
    action: candidate.side === "sell" ? "sell" : "buy",
    mint: candidate.token_mint,
    symbol: candidate.symbol,
    price,
    stop_pct: stopPct,
    tp_pct: targetPct,
    deadline_ts: new Date(nowMs + Math.max(15 * 60_000, candidate.horizon_sec * 1_000)).toISOString(),
    reason: candidate.reason,
    strategy_id: candidate.strategy_id,
  };
}

function candidateOrder(run: ExperimentRun, input: ExperimentTickInput): ExperimentOrder[] {
  const candidates = input.candidates
    .filter((candidate) => candidate.strategy_id === run.source)
    .filter((candidate) => candidate.expected_value_bps > 0)
    .filter((candidate) => candidate.side === "buy" || candidate.side === "sell")
    .sort((left, right) => right.expected_value_bps - left.expected_value_bps);
  const best = candidates[0];
  if (!best) return [];
  const price = input.prices.get(best.token_mint);
  return price && price > 0 ? [orderFromCandidate(best, price, input.now_ms)] : [];
}

function executeOrder(
  store: ExperimentStore,
  run: ExperimentRun,
  order: ExperimentOrder,
  input: ExperimentTickInput,
): void {
  const ts = new Date(input.now_ms).toISOString();
  const positions = store.positions(run.id);
  const held = positions.find((position) => position.mint === order.mint);
  const price = input.prices.get(order.mint) ?? order.price;
  if (!Number.isFinite(price) || price <= 0) return;
  if (order.action === "sell") {
    if (held) sell(store, run, held, price, order.reason, input);
    return;
  }
  if (held) return;
  if (run.treatment === "bar_portion_veto") {
    const verdict = bpEntryGate(input.last_closed_bp_by_mint.get(order.mint) ?? null, 0);
    if (!verdict.allow) {
      store.appendDecision({ run_id: run.id, ts, symbol: order.symbol, verdict: "blocked", reason: verdict.reason });
      return;
    }
  }
  const account = accountView(store, run, input.prices, input.now_ms);
  const points = store.equityPoints(run.id);
  const peak = Math.max(run.config.starting_cash_usd, ...points.map((point) => point.equity_usd), account.equity_usd);
  const today = ts.slice(0, 10);
  const dayStart = points.find((point) => point.ts.startsWith(today))?.equity_usd ?? run.config.starting_cash_usd;
  if (run.paused) return;
  if (account.positions.length >= run.config.max_positions) {
    store.appendDecision({ run_id: run.id, ts, symbol: order.symbol, verdict: "blocked", reason: "position limit" });
    return;
  }
  if (account.spend_today_usd >= run.config.daily_spend_limit_usd) {
    store.appendDecision({ run_id: run.id, ts, symbol: order.symbol, verdict: "blocked", reason: "daily spend limit" });
    return;
  }
  if (account.equity_usd < dayStart - run.config.daily_loss_limit_usd) {
    store.appendDecision({ run_id: run.id, ts, symbol: order.symbol, verdict: "blocked", reason: "daily loss limit" });
    return;
  }
  if (account.equity_usd < peak * (1 - run.config.drawdown_halt_pct / 100)) {
    store.appendDecision({ run_id: run.id, ts, symbol: order.symbol, verdict: "blocked", reason: "drawdown limit" });
    return;
  }
  const feeRate = costRate(input, order.mint);
  const maxAffordable = account.cash_usd / (1 + feeRate);
  const value = Math.min(order.value_usd ?? run.config.max_entry_usd, run.config.max_entry_usd, maxAffordable);
  if (value < 5 || account.spend_today_usd + value > run.config.daily_spend_limit_usd) return;
  const fee = value * feeRate;
  const position: ExperimentPosition = {
    run_id: run.id,
    mint: order.mint,
    symbol: order.symbol,
    qty: value / price,
    entry_price_usd: price,
    entry_value_usd: value,
    entry_fee_usd: fee,
    stop_pct: order.stop_pct ?? DEFAULT_STOP_PCT,
    tp_pct: order.tp_pct ?? DEFAULT_TP_PCT,
    peak_usd: price,
    opened_at: ts,
    deadline_ts: order.deadline_ts ?? new Date(input.now_ms + DEFAULT_HORIZON_MS).toISOString(),
    strategy_id: order.strategy_id,
  };
  const trade: Omit<ExperimentTrade, "id"> = {
    run_id: run.id, ts, side: "buy", mint: order.mint, symbol: order.symbol,
    qty: position.qty, price_usd: price, value_usd: value, fee_usd: fee,
    realized_pnl_usd: null, reason: order.reason, strategy_id: order.strategy_id,
  };
  store.appendTrade(trade);
  store.upsertPosition(position);
  store.appendDecision({ run_id: run.id, ts, symbol: order.symbol, verdict: "enter", reason: order.reason });
}

export function runExperimentTick(input: ExperimentTickInput, store = experimentStore()): void {
  for (const run of store.runs()) {
    markAndExit(store, run, input);
    const account = accountView(store, run, input.prices, input.now_ms);
    if (!run.paused) {
      const orders = run.source === "v2" ? input.v2_orders(account) : candidateOrder(run, input);
      for (const order of orders) executeOrder(store, run, order, input);
    }
    const cash = store.cash(run);
    store.markEquity(run.id, new Date(input.now_ms).toISOString(), equity(store, run, input.prices), cash);
  }
}

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { PolymarketMarket } from "./markets";

export type PolymarketMode = "off" | "paper" | "halted";

export type PolymarketCaps = {
  starting_bankroll_usd: number;
  max_trade_usd: number;
  daily_loss_limit_usd: number;
  max_positions: number;
};

export const DEFAULT_POLYMARKET_CAPS: PolymarketCaps = {
  starting_bankroll_usd: 500,
  max_trade_usd: 20,
  daily_loss_limit_usd: 50,
  max_positions: 5,
};

export type PolymarketState = {
  mode: PolymarketMode;
  kill_switch: boolean;
  started_at: string | null;
  updated_at: string;
  last_cycle_at: string | null;
  caps: PolymarketCaps;
};

export type PolymarketPaperPosition = {
  id: string;
  market_id: string;
  token_id: string;
  question: string;
  slug: string;
  outcome_index: number;
  outcome: string;
  shares: number;
  stake_usd: number;
  entry_price: number;
  opened_at: string;
  thesis: string;
};

export type PolymarketPaperTrade = {
  id: string;
  position_id: string;
  ts: string;
  action: "open" | "close";
  market_id: string;
  outcome: string;
  price: number;
  value_usd: number;
  pnl_usd: number | null;
  reason: string;
};

export type PolymarketActivity = {
  id: string;
  ts: string;
  kind: "control" | "cycle" | "paper" | "risk" | "data";
  message: string;
};

export type StoredPolymarketSnapshot = {
  fetched_at: string;
  markets: PolymarketMarket[];
};

type PolymarketDatabase = {
  version: 1;
  state: PolymarketState;
  positions: PolymarketPaperPosition[];
  trades: PolymarketPaperTrade[];
  activity: PolymarketActivity[];
  last_snapshot: StoredPolymarketSnapshot | null;
};

class PolymarketStore {
  private readonly path: string;
  private database: PolymarketDatabase;

  constructor(path: string) {
    this.path = path;
    this.database = this.readOrCreate();
  }

  state(): PolymarketState {
    return structuredClone(this.database.state);
  }

  positions(): PolymarketPaperPosition[] {
    return structuredClone(this.database.positions);
  }

  trades(limit = 50): PolymarketPaperTrade[] {
    return structuredClone(this.database.trades.slice(-limit).reverse());
  }

  activity(limit = 50): PolymarketActivity[] {
    return structuredClone(this.database.activity.slice(-limit).reverse());
  }

  lastSnapshot(): StoredPolymarketSnapshot | null {
    return this.database.last_snapshot ? structuredClone(this.database.last_snapshot) : null;
  }

  saveSnapshot(snapshot: StoredPolymarketSnapshot) {
    this.database.last_snapshot = {
      fetched_at: snapshot.fetched_at,
      markets: snapshot.markets.slice(0, 100),
    };
    this.persist();
  }

  setMode(mode: "off" | "paper"): { ok: true; state: PolymarketState } | { ok: false; error: string; state: PolymarketState } {
    if (mode === "paper" && this.database.state.kill_switch) {
      return { ok: false, error: "Release the Polymarket kill switch before arming paper mode.", state: this.state() };
    }
    const now = new Date().toISOString();
    this.database.state.mode = mode;
    this.database.state.started_at = mode === "paper" ? this.database.state.started_at ?? now : null;
    this.database.state.updated_at = now;
    this.appendActivityInternal("control", mode === "paper" ? "Polymarket paper bot armed." : "Polymarket paper bot switched off.");
    this.persist();
    return { ok: true, state: this.state() };
  }

  setKillSwitch(engaged: boolean) {
    const now = new Date().toISOString();
    this.database.state.kill_switch = engaged;
    this.database.state.mode = engaged ? "halted" : "off";
    this.database.state.started_at = null;
    this.database.state.updated_at = now;
    this.appendActivityInternal(
      "control",
      engaged
        ? "Polymarket kill switch engaged; new paper entries are blocked."
        : "Polymarket kill switch released; mode returned to off and must be re-armed manually.",
    );
    this.persist();
    return this.state();
  }

  markCycle(message?: string) {
    const now = new Date().toISOString();
    this.database.state.last_cycle_at = now;
    this.database.state.updated_at = now;
    if (message) this.appendActivityInternal("cycle", message);
    this.persist();
  }

  appendActivity(kind: PolymarketActivity["kind"], message: string) {
    this.appendActivityInternal(kind, message);
    this.persist();
  }

  openPosition(input: Omit<PolymarketPaperPosition, "id" | "shares" | "opened_at">) {
    const position: PolymarketPaperPosition = {
      ...input,
      id: randomUUID(),
      shares: input.stake_usd / input.entry_price,
      opened_at: new Date().toISOString(),
    };
    this.database.positions.push(position);
    this.database.trades.push({
      id: randomUUID(),
      position_id: position.id,
      ts: position.opened_at,
      action: "open",
      market_id: position.market_id,
      outcome: position.outcome,
      price: position.entry_price,
      value_usd: position.stake_usd,
      pnl_usd: null,
      reason: position.thesis,
    });
    this.appendActivityInternal(
      "paper",
      `Paper bought ${position.outcome} for $${position.stake_usd.toFixed(2)} at ${(position.entry_price * 100).toFixed(1)}¢.`,
    );
    this.persist();
    return structuredClone(position);
  }

  closePosition(positionId: string, exitPrice: number, reason: string) {
    const index = this.database.positions.findIndex((position) => position.id === positionId);
    if (index < 0) return null;
    const position = this.database.positions[index];
    const exitValue = position.shares * exitPrice;
    const pnl = exitValue - position.stake_usd;
    this.database.positions.splice(index, 1);
    this.database.trades.push({
      id: randomUUID(),
      position_id: position.id,
      ts: new Date().toISOString(),
      action: "close",
      market_id: position.market_id,
      outcome: position.outcome,
      price: exitPrice,
      value_usd: exitValue,
      pnl_usd: pnl,
      reason,
    });
    this.appendActivityInternal(
      "paper",
      `Paper closed ${position.outcome} at ${(exitPrice * 100).toFixed(1)}¢ (${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}): ${reason}`,
    );
    this.persist();
    return { position: structuredClone(position), exit_value_usd: exitValue, pnl_usd: pnl };
  }

  account(markets: PolymarketMarket[]) {
    const prices = new Map(markets.flatMap((market) => market.token_ids.map((token, index) => [token, market.outcome_prices[index]] as const)));
    const realized = this.database.trades.reduce((sum, trade) => sum + (trade.pnl_usd ?? 0), 0);
    const deployed = this.database.positions.reduce((sum, position) => sum + position.stake_usd, 0);
    const openValue = this.database.positions.reduce(
      (sum, position) => sum + position.shares * (prices.get(position.token_id) ?? position.entry_price),
      0,
    );
    const cash = this.database.state.caps.starting_bankroll_usd + realized - deployed;
    const today = new Date().toISOString().slice(0, 10);
    const realizedToday = this.database.trades
      .filter((trade) => trade.action === "close" && trade.ts.startsWith(today))
      .reduce((sum, trade) => sum + (trade.pnl_usd ?? 0), 0);

    return {
      starting_bankroll_usd: this.database.state.caps.starting_bankroll_usd,
      cash_usd: cash,
      deployed_usd: deployed,
      open_value_usd: openValue,
      equity_usd: cash + openValue,
      realized_pnl_usd: realized,
      realized_today_usd: realizedToday,
      unrealized_pnl_usd: openValue - deployed,
    };
  }

  private appendActivityInternal(kind: PolymarketActivity["kind"], message: string) {
    this.database.activity.push({ id: randomUUID(), ts: new Date().toISOString(), kind, message });
    if (this.database.activity.length > 500) this.database.activity = this.database.activity.slice(-500);
    if (this.database.trades.length > 1_000) this.database.trades = this.database.trades.slice(-1_000);
  }

  private readOrCreate(): PolymarketDatabase {
    if (!existsSync(this.path)) {
      const now = new Date().toISOString();
      const initial: PolymarketDatabase = {
        version: 1,
        state: {
          mode: "off",
          kill_switch: false,
          started_at: null,
          updated_at: now,
          last_cycle_at: null,
          caps: DEFAULT_POLYMARKET_CAPS,
        },
        positions: [],
        trades: [],
        activity: [],
        last_snapshot: null,
      };
      this.database = initial;
      this.persist();
      return initial;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as PolymarketDatabase;
      if (parsed.version !== 1 || !parsed.state || !Array.isArray(parsed.positions) || !Array.isArray(parsed.trades)) {
        throw new Error("unsupported store shape");
      }
      return parsed;
    } catch {
      throw new Error("Polymarket store is unreadable; refusing to replace local state with defaults.");
    }
  }

  private persist() {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.database, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.path);
  }
}

let singleton: PolymarketStore | null = null;
let singletonPath = "";
const TEST_STORE_PATH = join(tmpdir(), `mastermold-polymarket-${process.pid}-${randomUUID()}.db.json`);

export function polymarketStore() {
  const path = process.env.POLYMARKET_DB ?? (process.env.NODE_ENV === "test"
    ? TEST_STORE_PATH
    : join(/* turbopackIgnore: true */ process.cwd(), ".data", "polymarket.db.json"));
  if (!singleton || singletonPath !== path) {
    singleton = new PolymarketStore(path);
    singletonPath = path;
  }
  return singleton;
}

export function __resetPolymarketStoreForTests() {
  singleton = null;
  singletonPath = "";
}

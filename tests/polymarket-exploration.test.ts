import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluatePolymarketPaperAuthority,
  POLYMARKET_EXPLORATION_STRATEGIES,
  polymarketExplorationEnabled,
} from "@/src/polymarket/authority";
import { __resetPolymarketBrainForTests, polymarketBrain, type PolymarketBrainReport } from "@/src/polymarket/brain";
import { notifyWeb3, web3AlertsEnabled, __resetNotifyDedupeForTests } from "@/src/autopilot/notify";

let scratch: string | null = null;

afterEach(() => {
  __resetPolymarketBrainForTests();
  __resetNotifyDedupeForTests();
  delete process.env.POLYMARKET_BRAIN_DB;
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

function reportWith(strategies: Array<Partial<PolymarketBrainReport["strategies"][number]> & { strategy_id: string }>): PolymarketBrainReport {
  return {
    strategies: strategies.map((strategy) => ({
      observations: 10,
      labels_15m: 0,
      labels_1h: 0,
      labels_4h: 0,
      mean_1h_bps: null,
      hit_rate_1h: null,
      resolved_labels: 0,
      mean_brier_score: null,
      paper_candidate: false,
      promotion_detail: "0/100 one-hour labels; mean not labeled; hit not labeled.",
      paper_open_positions: 0,
      paper_round_trips: 0,
      paper_win_rate: null,
      paper_pnl_usd: null,
      ...strategy,
    })),
  } as unknown as PolymarketBrainReport;
}

describe("Polymarket exploration authority", () => {
  test("stays unavailable without promotion or the exploration flag", () => {
    const authority = evaluatePolymarketPaperAuthority(reportWith([{ strategy_id: "momentum" }]), {});
    expect(authority.available).toBe(false);
    expect(authority.tier).toBeNull();
    expect(authority.entry_strategies).toEqual([]);
  });

  test("grants bounded exploration entries when the operator opts in", () => {
    expect(polymarketExplorationEnabled({ POLYMARKET_EXPLORATION: "1" })).toBe(true);
    expect(polymarketExplorationEnabled({})).toBe(false);
    const authority = evaluatePolymarketPaperAuthority(
      reportWith([{ strategy_id: "momentum" }, { strategy_id: "book_pressure" }]),
      { POLYMARKET_EXPLORATION: "1" },
    );
    expect(authority.available).toBe(true);
    expect(authority.tier).toBe("exploration");
    expect(authority.entry_strategies).toEqual(POLYMARKET_EXPLORATION_STRATEGIES);
    expect(authority.entry_strategies).not.toContain("maker_spread");
    expect(authority.entry_strategies).not.toContain("binary_parity");
  });

  test("any promoted strategy outranks exploration and restricts entries to itself", () => {
    const authority = evaluatePolymarketPaperAuthority(
      reportWith([{ strategy_id: "momentum" }, { strategy_id: "book_pressure", paper_candidate: true }]),
      { POLYMARKET_EXPLORATION: "1" },
    );
    expect(authority.tier).toBe("promoted");
    expect(authority.strategy_id).toBe("book_pressure");
    expect(authority.entry_strategies).toEqual(["book_pressure"]);
  });
});

describe("Polymarket paper trade ledger", () => {
  test("journals opens and closes and feeds realized stats into the report", () => {
    scratch = mkdtempSync(join(tmpdir(), "mastermold-exploration-"));
    process.env.POLYMARKET_BRAIN_DB = join(scratch, "brain.db");
    const brain = polymarketBrain();

    const base = {
      strategy_id: "book_pressure" as const,
      tier: "exploration",
      market_id: "market-1",
      token_id: "token-1",
      outcome: "Yes",
      question: "Will the ledger learn?",
      slug: "ledger-learn",
      stake_usd: 5,
      reason: "test",
    };
    brain.recordPaperTrade({ ...base, event: "open", position_id: "p1", price: 0.5, pnl_usd: null });
    brain.recordPaperTrade({ ...base, event: "close", position_id: "p1", price: 0.55, pnl_usd: 0.5 });
    brain.recordPaperTrade({ ...base, event: "open", position_id: "p2", price: 0.6, pnl_usd: null });

    // The strategy metric row only exists once the strategy has observations;
    // record a minimal cycle for attribution.
    brain.recordCycle({
      source: "test",
      markets: [],
      candidates: [{
        id: "book_pressure:market-1:0",
        strategy_id: "book_pressure",
        label_kind: "markout",
        market_id: "market-1",
        token_id: "token-1",
        outcome_index: 0,
        question: "Will the ledger learn?",
        slug: "ledger-learn",
        outcome: "Yes",
        market_price: 0.5,
        executable_entry_price: 0.5,
        best_bid: 0.49,
        best_ask: 0.5,
        midpoint: 0.495,
        spread_bps: 200,
        bid_depth_shares: 500,
        ask_depth_shares: 300,
        depth_imbalance: 0.4,
        executable_size_usd: 50,
        move_24h: 0.1,
        score: 80,
        paper_eligible: false,
        thesis: "test",
      }],
    });

    const metric = brain.report().strategies.find((strategy) => strategy.strategy_id === "book_pressure");
    expect(metric).toBeDefined();
    expect(metric?.paper_round_trips).toBe(1);
    expect(metric?.paper_open_positions).toBe(1);
    expect(metric?.paper_win_rate).toBe(1);
    expect(metric?.paper_pnl_usd).toBe(0.5);
  });
});

describe("Web3 alert gate", () => {
  test("mutes Web3 trade chatter with NOTIFY_WEB3_TRADES=0 without touching the flag default", () => {
    expect(web3AlertsEnabled({})).toBe(true);
    expect(web3AlertsEnabled({ NOTIFY_WEB3_TRADES: "0" })).toBe(false);

    let sent = 0;
    const config = { telegram_token: "t", telegram_chat_id: "c", desktop: false, webhook_url: null };
    const fetchImpl = (async () => {
      sent += 1;
      return new Response("{}");
    }) as unknown as typeof fetch;
    notifyWeb3("entry", "muted", { env: { NOTIFY_WEB3_TRADES: "0" }, config, fetchImpl });
    expect(sent).toBe(0);
    notifyWeb3("entry", "sent", { env: {}, config, fetchImpl });
    expect(sent).toBe(1);
  });
});

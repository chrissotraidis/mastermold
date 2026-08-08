import { NextResponse } from "next/server";

import { runPolymarketAnalystCycle, safePolymarketAnalystReport, type AnalystReport } from "@/src/polymarket/analyst";
import { evaluatePolymarketPaperAuthority, type PolymarketPaperAuthority } from "@/src/polymarket/authority";
import { POLYMARKET_PAPER_CONTRACT, POLYMARKET_STRATEGY_CATALOG } from "@/src/polymarket/catalog";
import { polymarketBrain, safePolymarketBrainReport, type PolymarketBrainReport } from "@/src/polymarket/brain";
import type { PolymarketStrategyId } from "@/src/polymarket/strategies";
import { getPolymarketSnapshot, runPolymarketBrainCycle, runPolymarketPaperCycle, type PolymarketSnapshotView } from "@/src/polymarket/engine";
import { fetchPolymarketOrderBooks, quotePolymarketPaperBuy, quotePolymarketPaperSell } from "@/src/polymarket/orderbook";
import { buildPolymarketWatchSignals, type PolymarketMarket } from "@/src/polymarket/markets";
import { validatePolymarketPaperEntry } from "@/src/polymarket/policy";
import {
  polymarketStore,
  type PolymarketActivity,
  type PolymarketPaperPosition,
  type PolymarketPaperTrade,
  type PolymarketState,
} from "@/src/polymarket/store";
import { fetchPolymarketWeatherReport, type PolymarketWeatherReport } from "@/src/polymarket/weather";

export const dynamic = "force-dynamic";

export type PolymarketApiPayload = {
  state: PolymarketState;
  account: ReturnType<ReturnType<typeof polymarketStore>["account"]>;
  positions: Array<PolymarketPaperPosition & { current_price: number; value_usd: number; pnl_usd: number }>;
  trades: PolymarketPaperTrade[];
  activity: PolymarketActivity[];
  markets: PolymarketMarket[];
  signals: ReturnType<typeof buildPolymarketWatchSignals>;
  market_read: {
    source: PolymarketSnapshotView["source"];
    fetched_at: string;
    error: string | null;
  };
  paper_contract: typeof POLYMARKET_PAPER_CONTRACT;
  paper_authority: PolymarketPaperAuthority;
  equity_curve: Array<{ ts: string; realized_pnl_usd: number; action: "open" | "close" }>;
  strategy_catalog: typeof POLYMARKET_STRATEGY_CATALOG;
  weather: PolymarketWeatherReport;
  brain: PolymarketBrainReport;
  analyst: AnalystReport;
  control_access: {
    available: boolean;
    scope: "loopback-only";
    detail: string;
  };
  live_execution: {
    available: false;
    status: "locked";
    detail: string;
  };
  data_boundary: string;
};

type ControlRequest = {
  action?: unknown;
  mode?: unknown;
  market_id?: unknown;
  outcome_index?: unknown;
  stake_usd?: unknown;
  position_id?: unknown;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export async function GET(request: Request): Promise<NextResponse<PolymarketApiPayload | { error: string }>> {
  try {
    return NextResponse.json(await payload(request));
  } catch {
    return NextResponse.json({ error: "Polymarket lane is unavailable; local state was not replaced." }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<NextResponse<PolymarketApiPayload | { error: string }>> {
  if (!isAuthorizedLocalPolymarketControl(request)) {
    return NextResponse.json({ error: "Polymarket controls require a matching local loopback origin." }, { status: 403 });
  }

  let body: ControlRequest;
  try {
    body = await request.json() as ControlRequest;
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  try {
    const store = polymarketStore();
    switch (body.action) {
      case "set_mode": {
        if (body.mode === "live") {
          return NextResponse.json(
            { error: "Live Polymarket execution is locked. The reference bot uses legacy CLOB plumbing; a reviewed CLOB V2 wallet and funder flow is required." },
            { status: 409 },
          );
        }
        if (body.mode !== "off" && body.mode !== "paper") {
          return NextResponse.json({ error: 'mode must be "off" or "paper".' }, { status: 422 });
        }
        const authority = evaluatePolymarketPaperAuthority(safePolymarketBrainReport());
        if (body.mode === "paper" && !authority.available) {
          return NextResponse.json({ error: authority.detail }, { status: 409 });
        }
        const result = store.setMode(body.mode);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
        break;
      }
      case "kill":
        store.setKillSwitch(true);
        break;
      case "release":
        store.setKillSwitch(false);
        break;
      case "run_cycle":
        await runPolymarketPaperCycle("manual");
        break;
      case "run_brain_cycle":
        await runPolymarketBrainCycle("manual");
        break;
      case "run_analyst_cycle":
        await runPolymarketAnalystCycle("manual");
        break;
      case "paper_buy": {
        const authority = evaluatePolymarketPaperAuthority(safePolymarketBrainReport());
        if (!authority.available) {
          return NextResponse.json({ error: authority.detail }, { status: 409 });
        }
        if (typeof body.market_id !== "string" || !Number.isInteger(body.outcome_index)) {
          return NextResponse.json({ error: "market_id and integer outcome_index are required." }, { status: 422 });
        }
        const snapshot = await getPolymarketSnapshot(true);
        if (snapshot.source === "persistent-cache") {
          return NextResponse.json({ error: "A live Polymarket read is required for a new paper entry." }, { status: 409 });
        }
        const market = snapshot.markets.find((candidate) => candidate.id === body.market_id);
        const outcomeIndex = body.outcome_index as number;
        if (!market || outcomeIndex < 0 || outcomeIndex >= market.outcomes.length) {
          return NextResponse.json({ error: "Market outcome is no longer available." }, { status: 404 });
        }
        const signal = buildPolymarketWatchSignals(snapshot.markets)
          .find((candidate) => candidate.market_id === market.id && candidate.outcome_index === outcomeIndex);
        if (!signal) return NextResponse.json({ error: "Manual paper entries are restricted to current momentum watch setups." }, { status: 409 });
        const stake = typeof body.stake_usd === "number" ? body.stake_usd : POLYMARKET_PAPER_CONTRACT.default_stake_usd;
        const books = await fetchPolymarketOrderBooks([signal.token_id], true);
        const entryQuote = quotePolymarketPaperBuy(books.get(signal.token_id)!, stake);
        if (!entryQuote) return NextResponse.json({ error: "Displayed CLOB ask depth cannot fill this paper entry at the requested size." }, { status: 409 });
        const account = store.account(snapshot.markets);
        const policy = validatePolymarketPaperEntry({
          state: store.state(),
          positions: store.positions(),
          market_id: market.id,
          outcome_index: outcomeIndex,
          stake_usd: stake,
          entry_price: entryQuote.average_price,
          available_cash_usd: account.cash_usd,
          realized_today_usd: account.realized_today_usd,
        });
        if (!policy.ok) return NextResponse.json({ error: policy.error }, { status: 409 });
        const opened = store.openPosition({
          market_id: market.id,
          token_id: market.token_ids[outcomeIndex],
          question: market.question,
          slug: market.slug,
          outcome_index: outcomeIndex,
          outcome: market.outcomes[outcomeIndex],
          stake_usd: stake,
          entry_price: entryQuote.average_price,
          strategy_id: "momentum",
          tier: "manual",
          thesis: `Operator-selected momentum paper entry using displayed CLOB ask depth across ${entryQuote.levels_used} level(s).`,
        });
        try {
          polymarketBrain().recordPaperTrade({
            event: "open",
            position_id: opened.id,
            strategy_id: "momentum",
            tier: "manual",
            market_id: market.id,
            token_id: market.token_ids[outcomeIndex],
            outcome: market.outcomes[outcomeIndex],
            question: market.question,
            slug: market.slug,
            price: entryQuote.average_price,
            stake_usd: stake,
            pnl_usd: null,
            reason: opened.thesis,
          });
        } catch {
          // Ledger write failure must not block the operator's entry.
        }
        break;
      }
      case "close_position": {
        if (typeof body.position_id !== "string") {
          return NextResponse.json({ error: "position_id is required." }, { status: 422 });
        }
        const position = store.positions().find((candidate) => candidate.id === body.position_id);
        if (!position) return NextResponse.json({ error: "Paper position was not found." }, { status: 404 });
        const snapshot = await getPolymarketSnapshot(true);
        if (snapshot.source === "persistent-cache") {
          return NextResponse.json({ error: "A live Polymarket read is required to close the paper position." }, { status: 409 });
        }
        const books = await fetchPolymarketOrderBooks([position.token_id], true);
        const exitQuote = quotePolymarketPaperSell(books.get(position.token_id)!, position.shares);
        if (!exitQuote) return NextResponse.json({ error: "Displayed CLOB bid depth cannot close the full paper position." }, { status: 409 });
        const reason = `Operator close using displayed CLOB bid depth across ${exitQuote.levels_used} level(s)`;
        const closed = store.closePosition(position.id, exitQuote.average_price, reason);
        if (closed) {
          try {
            polymarketBrain().recordPaperTrade({
              event: "close",
              position_id: position.id,
              strategy_id: (position.strategy_id as PolymarketStrategyId | undefined) ?? null,
              tier: position.tier ?? null,
              market_id: position.market_id,
              token_id: position.token_id,
              outcome: position.outcome,
              question: position.question,
              slug: position.slug,
              price: exitQuote.average_price,
              stake_usd: position.stake_usd,
              pnl_usd: closed.pnl_usd,
              reason,
            });
          } catch {
            // Ledger write failure must not block the operator's close.
          }
        }
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown Polymarket control action." }, { status: 400 });
    }
    return NextResponse.json(await payload(request));
  } catch {
    return NextResponse.json({ error: "Polymarket control failed; local state was left intact." }, { status: 503 });
  }
}

async function payload(request: Request): Promise<PolymarketApiPayload> {
  const store = polymarketStore();
  const controlAvailable = polymarketControlAccess(request);
  const [snapshot, weather] = await Promise.all([getPolymarketSnapshot(), fetchPolymarketWeatherReport()]);
  const marketById = new Map(snapshot.markets.map((market) => [market.id, market]));
  const positions = store.positions().map((position) => {
    const currentPrice = marketById.get(position.market_id)?.outcome_prices[position.outcome_index] ?? position.entry_price;
    const value = position.shares * currentPrice;
    return { ...position, current_price: currentPrice, value_usd: value, pnl_usd: value - position.stake_usd };
  });
  const brain = safePolymarketBrainReport();

  return {
    state: store.state(),
    account: store.account(snapshot.markets),
    positions,
    paper_contract: POLYMARKET_PAPER_CONTRACT,
    paper_authority: evaluatePolymarketPaperAuthority(brain),
    strategy_catalog: POLYMARKET_STRATEGY_CATALOG,
    weather,
    analyst: safePolymarketAnalystReport(),
    equity_curve: buildEquityCurve(store.trades(200)),
    trades: store.trades(50),
    activity: store.activity(50),
    markets: snapshot.markets.slice(0, 40),
    signals: buildPolymarketWatchSignals(snapshot.markets).slice(0, 12),
    market_read: {
      source: snapshot.source,
      fetched_at: snapshot.fetched_at,
      error: "error" in snapshot ? snapshot.error : null,
    },
    brain,
    control_access: {
      available: controlAvailable,
      scope: "loopback-only",
      detail: controlAvailable
        ? "Controls are available from this exact loopback address."
        : "This address is read-only. Open Master Mold through an SSH tunnel at localhost:4002 to use controls.",
    },
    live_execution: {
      available: false,
      status: "locked",
      detail: "No wallet key, API credential, order signer, deposit wallet, or CLOB V2 execution path is connected in this pass.",
    },
    data_boundary: "This lane reads public Polymarket, Aviation Weather Center, and Open-Meteo data and writes only simulator/research state under the ignored local .data directory.",
  };
}

/** Chronological realized-P&L curve derived from the trade log for the lab's
 * activity sparkline. trades() returns newest-first, so replay oldest-first. */
function buildEquityCurve(trades: PolymarketPaperTrade[]): Array<{ ts: string; realized_pnl_usd: number; action: "open" | "close" }> {
  let realized = 0;
  return [...trades].reverse().map((trade) => {
    if (trade.action === "close") realized += trade.pnl_usd ?? 0;
    return { ts: trade.ts, realized_pnl_usd: Math.round(realized * 100) / 100, action: trade.action };
  });
}

export function isAuthorizedLocalPolymarketControl(request: Request): boolean {
  try {
    if (!polymarketControlAccess(request)) return false;
    const target = new URL(request.url);
    const targetPort = target.port || (target.protocol === "https:" ? "443" : "80");
    const originHeader = request.headers.get("origin");
    if (!originHeader) return false;
    const origin = new URL(originHeader);
    const originPort = origin.port || (origin.protocol === "https:" ? "443" : "80");
    return LOOPBACK_HOSTS.has(origin.hostname.toLowerCase()) && origin.protocol === target.protocol && originPort === targetPort;
  } catch {
    return false;
  }
}

export function polymarketControlAccess(request: Request): boolean {
  try {
    const target = new URL(request.url);
    if (!LOOPBACK_HOSTS.has(target.hostname.toLowerCase())) return false;
    const targetPort = target.port || (target.protocol === "https:" ? "443" : "80");
    const hostHeader = request.headers.get("host");
    if (!hostHeader) return true;
    const host = new URL(`http://${hostHeader}`);
    const hostPort = host.port || "80";
    return LOOPBACK_HOSTS.has(host.hostname.toLowerCase()) && hostPort === targetPort;
  } catch {
    return false;
  }
}

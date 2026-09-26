/**
 * Negative-risk basket monitor (docs/research-2026-09 P3). In a neg-risk
 * event exactly one named outcome pays $1, so buying YES on every named leg
 * for less than $1 after fees would be a structural edge. Augmented "Other"
 * legs change meaning as placeholders are named, so a basket that contains
 * one is never counted. Observation only: no order path exists.
 */
import { parseFeeSchedule, takerFeeUsd, type FeeSchedule } from "./fees";
import { fetchPolymarketOrderBooks, summarizePolymarketBook, type PolymarketOrderBook } from "./orderbook";
import type { PolymarketBrainCandidate } from "./strategies";

export type NegRiskLeg = {
  market_id: string;
  question: string;
  title: string;
  yes_token: string;
  accepting: boolean;
  other: boolean;
  fee: FeeSchedule;
};

export type NegRiskEvent = { event_id: string; title: string; legs: NegRiskLeg[] };

export type NegRiskBasketResult = {
  event_id: string;
  title: string;
  legs: number;
  priced_legs: number;
  sum_asks: number | null;
  fees_per_basket: number | null;
  net_edge: number | null;
  min_depth_shares: number;
  status: "edge" | "no_edge" | "incomplete" | "has_other";
};

export const NEG_RISK_MIN_NET_EDGE = 0.02; // $2 per 100 baskets
export const NEG_RISK_MIN_DEPTH = 20;

export function parseNegRiskEvent(raw: unknown): NegRiskEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Record<string, unknown>;
  if (event.negRisk !== true || !Array.isArray(event.markets)) return null;
  const legs: NegRiskLeg[] = [];
  for (const item of event.markets) {
    if (!item || typeof item !== "object") continue;
    const market = item as Record<string, unknown>;
    if (market.closed === true || market.active === false) continue;
    let tokens: unknown = market.clobTokenIds;
    if (typeof tokens === "string") {
      try {
        tokens = JSON.parse(tokens);
      } catch {
        tokens = [];
      }
    }
    const yesToken = Array.isArray(tokens) && typeof tokens[0] === "string" ? tokens[0] : "";
    if (!yesToken) continue;
    legs.push({
      market_id: String(market.id ?? ""),
      question: typeof market.question === "string" ? market.question : "",
      title: typeof market.groupItemTitle === "string" ? market.groupItemTitle : "",
      yes_token: yesToken,
      accepting: market.acceptingOrders === true,
      other: market.negRiskOther === true,
      fee: parseFeeSchedule(market),
    });
  }
  return { event_id: String(event.id ?? ""), title: typeof event.title === "string" ? event.title : "", legs };
}

export function evaluateNegRiskBasket(event: NegRiskEvent, books: Map<string, PolymarketOrderBook>): NegRiskBasketResult {
  const base = { event_id: event.event_id, title: event.title, legs: event.legs.length };
  if (event.legs.some((leg) => leg.other)) {
    return { ...base, priced_legs: 0, sum_asks: null, fees_per_basket: null, net_edge: null, min_depth_shares: 0, status: "has_other" };
  }
  let sum = 0;
  let fees = 0;
  let minDepth = Infinity;
  let priced = 0;
  let feeUnknown = false;
  for (const leg of event.legs) {
    const book = books.get(leg.yes_token);
    const metrics = book ? summarizePolymarketBook(book) : null;
    if (!leg.accepting || !book || !metrics || metrics.best_ask === null) continue;
    const topAskSize = book.asks.find((level) => level.price === metrics.best_ask)?.size ?? 0;
    priced += 1;
    sum += metrics.best_ask;
    const fee = takerFeeUsd(1, metrics.best_ask, leg.fee);
    if (fee === null) feeUnknown = true;
    else fees += fee;
    minDepth = Math.min(minDepth, topAskSize);
  }
  if (priced < event.legs.length || priced < 2 || feeUnknown) {
    return { ...base, priced_legs: priced, sum_asks: priced ? round4(sum) : null, fees_per_basket: feeUnknown ? null : round4(fees), net_edge: null, min_depth_shares: Number.isFinite(minDepth) ? minDepth : 0, status: "incomplete" };
  }
  const net = 1 - sum - fees;
  const depth = Number.isFinite(minDepth) ? minDepth : 0;
  return {
    ...base,
    priced_legs: priced,
    sum_asks: round4(sum),
    fees_per_basket: round4(fees),
    net_edge: round4(net),
    min_depth_shares: depth,
    status: net >= NEG_RISK_MIN_NET_EDGE && depth >= NEG_RISK_MIN_DEPTH ? "edge" : "no_edge",
  };
}

export function negRiskCandidate(result: NegRiskBasketResult, event: NegRiskEvent): PolymarketBrainCandidate | null {
  if (result.status !== "edge" || result.net_edge === null || result.sum_asks === null) return null;
  return {
    id: `neg_risk_basket:${result.event_id}`,
    strategy_id: "neg_risk_basket",
    label_kind: "structural",
    market_id: event.legs[0]?.market_id ?? result.event_id,
    token_id: event.legs[0]?.yes_token ?? "",
    outcome_index: 0,
    question: result.title,
    slug: "",
    outcome: `All ${result.legs} named outcomes`,
    market_price: result.sum_asks,
    executable_entry_price: result.sum_asks,
    best_bid: null,
    best_ask: result.sum_asks,
    midpoint: null,
    spread_bps: null,
    bid_depth_shares: 0,
    ask_depth_shares: result.min_depth_shares,
    depth_imbalance: null,
    executable_size_usd: result.min_depth_shares * result.sum_asks,
    move_24h: null,
    score: Math.min(99, Math.round(60 + result.net_edge * 1000)),
    paper_eligible: false,
    thesis: `YES on all ${result.legs} named outcomes costs ${(result.sum_asks * 100).toFixed(1)}¢ plus ${((result.fees_per_basket ?? 0) * 100).toFixed(2)}¢ in taker fees, ${(result.net_edge * 100).toFixed(1)}¢ under the $1 payout, with ${result.min_depth_shares} shares on the thinnest leg. Leg risk and book staleness are the usual reasons this disappears.`,
  };
}

let lastScan: { at: string; results: NegRiskBasketResult[] } | null = null;

export function lastNegRiskScan() {
  return lastScan;
}

/** Read up to `limit` events in full and evaluate each basket. */
export async function scanNegRiskBaskets(eventIds: string[], limit = 3): Promise<{ results: NegRiskBasketResult[]; candidates: PolymarketBrainCandidate[] }> {
  const events: NegRiskEvent[] = [];
  for (const id of [...new Set(eventIds)].slice(0, limit)) {
    try {
      const response = await fetch(`https://gamma-api.polymarket.com/events/${encodeURIComponent(id)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const parsed = parseNegRiskEvent(await response.json());
      if (parsed && parsed.legs.length >= 2) events.push(parsed);
    } catch {
      // A missing event just means no scan for it this cycle.
    }
  }
  const tokens = events.flatMap((event) => event.legs.map((leg) => leg.yes_token)).slice(0, 120);
  const books = tokens.length ? await fetchPolymarketOrderBooks(tokens, true) : new Map<string, PolymarketOrderBook>();
  const results = events.map((event) => evaluateNegRiskBasket(event, books));
  const candidates = results
    .map((result, index) => negRiskCandidate(result, events[index]))
    .filter((candidate): candidate is PolymarketBrainCandidate => candidate !== null);
  lastScan = { at: new Date().toISOString(), results };
  return { results, candidates };
}

function round4(value: number) {
  return Math.round(value * 1e4) / 1e4;
}

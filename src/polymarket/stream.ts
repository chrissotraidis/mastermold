import { createHash } from "node:crypto";

import {
  polymarketBrain,
  type PolymarketStreamEventRecord,
} from "./brain";
import { parsePolymarketOrderBook, summarizePolymarketBook } from "./orderbook";

const MARKET_STREAM_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const MAX_STREAM_TOKENS = 50;
const HEARTBEAT_MS = 10_000;
const MAX_RECONNECT_MS = 30_000;

export type PolymarketStreamParseResult = {
  heartbeat: boolean;
  events: PolymarketStreamEventRecord[];
};

export function parsePolymarketStreamMessage(
  message: string,
  receivedAtMs = Date.now(),
): PolymarketStreamParseResult {
  if (message.trim() === "PONG") return { heartbeat: true, events: [] };

  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return { heartbeat: false, events: [] };
  }

  const values = Array.isArray(payload) ? payload : [payload];
  return {
    heartbeat: false,
    events: values.flatMap((value, index) => parseEvent(value, receivedAtMs, index)),
  };
}

function parseEvent(value: unknown, receivedAtMs: number, messageIndex: number): PolymarketStreamEventRecord[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as Record<string, unknown>;
  const eventType = text(raw.event_type ?? raw.type);
  const timestampMs = timestamp(raw.timestamp, receivedAtMs);
  const marketId = text(raw.market ?? raw.condition_id);

  if (eventType === "book") {
    const book = parsePolymarketOrderBook(raw);
    if (!book) return [];
    const summary = summarizePolymarketBook(book);
    return [makeEvent({
      event_type: "book",
      market_id: marketId || book.condition_id,
      token_id: book.token_id,
      timestamp_ms: timestampMs,
      best_bid: summary.best_bid,
      best_ask: summary.best_ask,
      spread: summary.spread,
      bid_depth_shares: summary.bid_depth_shares,
      ask_depth_shares: summary.ask_depth_shares,
      depth_imbalance: summary.depth_imbalance,
      price: book.last_trade_price,
      tick_size: positive(book.tick_size),
      fingerprint: text(raw.hash),
      message_index: messageIndex,
    })];
  }

  if (eventType === "price_change") {
    if (!Array.isArray(raw.price_changes)) return [];
    return raw.price_changes.flatMap((value, changeIndex) => {
      if (!value || typeof value !== "object") return [];
      const change = value as Record<string, unknown>;
      const tokenId = text(change.asset_id);
      if (!tokenId) return [];
      const bestBid = probability(change.best_bid);
      const bestAsk = probability(change.best_ask);
      return [makeEvent({
        event_type: "price_change",
        market_id: marketId,
        token_id: tokenId,
        timestamp_ms: timestampMs,
        best_bid: bestBid,
        best_ask: bestAsk,
        spread: spread(bestBid, bestAsk),
        price: probability(change.price),
        size: nonNegative(change.size),
        side: side(change.side),
        fingerprint: text(change.hash ?? raw.hash),
        message_index: messageIndex * 1_000 + changeIndex,
      })];
    });
  }

  if (eventType === "best_bid_ask") {
    const tokenId = text(raw.asset_id);
    if (!tokenId) return [];
    const bestBid = probability(raw.best_bid);
    const bestAsk = probability(raw.best_ask);
    return [makeEvent({
      event_type: "best_bid_ask",
      market_id: marketId,
      token_id: tokenId,
      timestamp_ms: timestampMs,
      best_bid: bestBid,
      best_ask: bestAsk,
      spread: spread(bestBid, bestAsk),
      fingerprint: text(raw.hash),
      message_index: messageIndex,
    })];
  }

  if (eventType === "last_trade_price") {
    const tokenId = text(raw.asset_id);
    if (!tokenId) return [];
    return [makeEvent({
      event_type: "last_trade_price",
      market_id: marketId,
      token_id: tokenId,
      timestamp_ms: timestampMs,
      price: probability(raw.price),
      size: nonNegative(raw.size),
      side: side(raw.side),
      fee_rate_bps: nonNegative(raw.fee_rate_bps),
      fingerprint: text(raw.hash ?? raw.transaction_hash),
      message_index: messageIndex,
    })];
  }

  if (eventType === "tick_size_change") {
    const tokenId = text(raw.asset_id);
    if (!tokenId) return [];
    return [makeEvent({
      event_type: "tick_size_change",
      market_id: marketId,
      token_id: tokenId,
      timestamp_ms: timestampMs,
      tick_size: positive(raw.new_tick_size ?? raw.tick_size),
      fingerprint: text(raw.hash),
      message_index: messageIndex,
    })];
  }

  if (eventType === "market_resolved") {
    return [makeEvent({
      event_type: "market_resolved",
      market_id: marketId,
      token_id: text(raw.winning_asset_id ?? raw.asset_id),
      timestamp_ms: timestampMs,
      price: probability(raw.winning_outcome_price ?? raw.price),
      fingerprint: text(raw.hash),
      message_index: messageIndex,
    })];
  }

  if (eventType === "new_market") {
    const assets = Array.isArray(raw.assets_ids) ? raw.assets_ids.map(text).filter(Boolean) : [];
    return [makeEvent({
      event_type: "new_market",
      market_id: marketId,
      token_id: text(raw.asset_id) || assets[0] || "",
      timestamp_ms: timestampMs,
      fingerprint: text(raw.hash),
      message_index: messageIndex,
    })];
  }

  return [];
}

type PartialEvent = Pick<PolymarketStreamEventRecord, "event_type" | "market_id" | "token_id" | "timestamp_ms"> & {
  best_bid?: number | null;
  best_ask?: number | null;
  spread?: number | null;
  bid_depth_shares?: number | null;
  ask_depth_shares?: number | null;
  depth_imbalance?: number | null;
  price?: number | null;
  size?: number | null;
  side?: "BUY" | "SELL" | null;
  fee_rate_bps?: number | null;
  tick_size?: number | null;
  fingerprint: string;
  message_index: number;
};

function makeEvent(input: PartialEvent): PolymarketStreamEventRecord {
  const stable = [
    input.event_type,
    input.market_id,
    input.token_id,
    input.timestamp_ms,
    input.best_bid ?? null,
    input.best_ask ?? null,
    input.price ?? null,
    input.size ?? null,
    input.side ?? null,
    input.fingerprint,
    input.message_index,
  ];
  return {
    id: createHash("sha256").update(JSON.stringify(stable)).digest("hex"),
    timestamp_ms: input.timestamp_ms,
    event_type: input.event_type,
    market_id: input.market_id,
    token_id: input.token_id,
    best_bid: input.best_bid ?? null,
    best_ask: input.best_ask ?? null,
    spread: input.spread ?? null,
    bid_depth_shares: input.bid_depth_shares ?? null,
    ask_depth_shares: input.ask_depth_shares ?? null,
    depth_imbalance: input.depth_imbalance ?? null,
    price: input.price ?? null,
    size: input.size ?? null,
    side: input.side ?? null,
    fee_rate_bps: input.fee_rate_bps ?? null,
    tick_size: input.tick_size ?? null,
  };
}

class PolymarketMarketStream {
  private socket: WebSocket | null = null;
  private desired = new Set<string>();
  private subscribed = new Set<string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private reconnects = 0;
  private stopped = true;
  private readonly observedQuotes = new Map<string, string>();

  update(tokenIds: string[]) {
    this.desired = new Set([...new Set(tokenIds.map((token) => token.trim()).filter(Boolean))].slice(0, MAX_STREAM_TOKENS));
    if (!streamEnabled() || this.desired.size === 0) {
      this.stop();
      return;
    }

    this.stopped = false;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.reconcileSubscriptions();
    } else if (!this.socket && !this.reconnectTimer) {
      this.connect();
    }
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.subscribed.clear();
    this.observedQuotes.clear();
    socket?.close(1000, "Master Mold stream stopped");
    safeBrainCall(() => polymarketBrain().recordStreamStatus({
      status: "disabled",
      subscribed_tokens: 0,
      reconnects: this.reconnects,
      error: null,
    }));
  }

  private connect() {
    if (this.stopped || this.desired.size === 0) return;
    if (typeof WebSocket === "undefined") {
      safeBrainCall(() => polymarketBrain().recordStreamStatus({
        status: "error",
        subscribed_tokens: this.desired.size,
        reconnects: this.reconnects,
        error: "The Node runtime does not expose WebSocket support.",
      }));
      return;
    }

    safeBrainCall(() => polymarketBrain().recordStreamStatus({
      status: "connecting",
      subscribed_tokens: this.desired.size,
      reconnects: this.reconnects,
      error: null,
    }));

    const socket = new WebSocket(MARKET_STREAM_URL);
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket || this.stopped) return;
      this.reconnectAttempts = 0;
      this.subscribed.clear();
      socket.send(JSON.stringify({
        assets_ids: [...this.desired],
        type: "market",
        custom_feature_enabled: true,
      }));
      this.subscribed = new Set(this.desired);
      const now = new Date().toISOString();
      safeBrainCall(() => polymarketBrain().recordStreamStatus({
        status: "live",
        connected_at: now,
        last_message_at: now,
        subscribed_tokens: this.subscribed.size,
        reconnects: this.reconnects,
        error: null,
      }));
      this.heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send("PING");
      }, HEARTBEAT_MS);
    });

    socket.addEventListener("message", (event) => {
      void this.handleMessage(socket, event.data);
    });
    socket.addEventListener("error", () => {
      if (this.socket !== socket) return;
      safeBrainCall(() => polymarketBrain().recordStreamStatus({
        status: "error",
        subscribed_tokens: this.subscribed.size,
        reconnects: this.reconnects,
        error: "The public Polymarket market stream reported a connection error.",
      }));
    });
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.subscribed.clear();
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (!this.stopped) this.scheduleReconnect(`Stream closed (${event.code}${event.reason ? `: ${event.reason}` : ""}).`);
    });
  }

  private async handleMessage(socket: WebSocket, data: unknown) {
    if (this.socket !== socket) return;
    const message = await messageText(data);
    if (message === null || this.socket !== socket) return;
    const parsed = parsePolymarketStreamMessage(message);
    const selected = selectPolymarketMicrostructureEvents(parsed.events, this.observedQuotes);
    if (selected.length > 0) {
      safeBrainCall(() => polymarketBrain().recordStreamEvents(selected));
    } else {
      safeBrainCall(() => polymarketBrain().recordStreamHeartbeat());
    }
  }

  private reconcileSubscriptions() {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const added = [...this.desired].filter((token) => !this.subscribed.has(token));
    const removed = [...this.subscribed].filter((token) => !this.desired.has(token));
    if (added.length > 0) socket.send(JSON.stringify({ assets_ids: added, operation: "subscribe" }));
    if (removed.length > 0) socket.send(JSON.stringify({ assets_ids: removed, operation: "unsubscribe" }));
    this.subscribed = new Set(this.desired);
    safeBrainCall(() => polymarketBrain().recordStreamStatus({
      status: "live",
      subscribed_tokens: this.subscribed.size,
      reconnects: this.reconnects,
      error: null,
    }));
  }

  private scheduleReconnect(error: string) {
    this.reconnectAttempts += 1;
    this.reconnects += 1;
    const delay = Math.min(MAX_RECONNECT_MS, 1_000 * 2 ** Math.min(5, this.reconnectAttempts - 1));
    safeBrainCall(() => polymarketBrain().recordStreamStatus({
      status: "error",
      subscribed_tokens: this.desired.size,
      reconnects: this.reconnects,
      error,
    }));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

let singleton: PolymarketMarketStream | null = null;

export function startOrUpdatePolymarketStream(tokenIds: string[]) {
  singleton ??= new PolymarketMarketStream();
  singleton.update(tokenIds);
}

export function stopPolymarketStream() {
  singleton?.stop();
}

export function __resetPolymarketStreamForTests() {
  singleton?.stop();
  singleton = null;
}

export function selectPolymarketMicrostructureEvents(
  events: PolymarketStreamEventRecord[],
  observedQuotes = new Map<string, string>(),
) {
  return events.filter((event) => {
    if (!event.token_id) return event.event_type === "new_market" || event.event_type === "market_resolved";
    const quoteKey = `${event.best_bid ?? ""}:${event.best_ask ?? ""}`;
    if (event.event_type === "book") {
      if (event.best_bid === null && event.best_ask === null) return false;
      const changed = observedQuotes.get(event.token_id) !== quoteKey;
      observedQuotes.set(event.token_id, quoteKey);
      return changed;
    }
    if (event.event_type === "best_bid_ask") {
      if (event.best_bid === null && event.best_ask === null) return false;
      const changed = observedQuotes.get(event.token_id) !== quoteKey;
      observedQuotes.set(event.token_id, quoteKey);
      return changed;
    }
    if (event.event_type === "price_change") {
      if (event.best_bid === null && event.best_ask === null) return false;
      const changed = observedQuotes.get(event.token_id) !== quoteKey;
      observedQuotes.set(event.token_id, quoteKey);
      return changed;
    }
    return true;
  });
}

function streamEnabled() {
  const value = process.env.POLYMARKET_STREAM_ENABLED?.trim().toLowerCase();
  return value !== "0" && value !== "false";
}

function safeBrainCall(callback: () => unknown) {
  try {
    callback();
  } catch (error) {
    console.error("[mastermold] Polymarket stream persistence failed:", error);
  }
}

async function messageText(value: unknown): Promise<string | null> {
  if (typeof value === "string") return value;
  if (value instanceof Blob) return value.text();
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value);
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function probability(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed !== null && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonNegative(value: unknown): number | null {
  const parsed = numeric(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function timestamp(value: unknown, fallback: number) {
  const parsed = numeric(value);
  if (parsed === null || parsed <= 0) return fallback;
  return parsed < 10_000_000_000 ? Math.round(parsed * 1_000) : Math.round(parsed);
}

function side(value: unknown): "BUY" | "SELL" | null {
  const normalized = text(value).toUpperCase();
  return normalized === "BUY" || normalized === "SELL" ? normalized : null;
}

function spread(bestBid: number | null, bestAsk: number | null) {
  return bestBid !== null && bestAsk !== null && bestAsk >= bestBid ? bestAsk - bestBid : null;
}

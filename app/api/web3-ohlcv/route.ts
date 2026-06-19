import { NextResponse } from "next/server";
import {
  applyOhlcvPaperDecisionToLedger,
  getWeb3TradingStateAsync,
  isTradingAccountMode,
  isTradingMarketSource,
  isTradingScenario,
  type MemecoinMarket,
  type OhlcvPaperLedgerApplyRequest,
  type OhlcvPaperLedgerApplyResult,
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
} from "@/src/db/web3-trading";

type OhlcvProvider = "geckoterminal";
type OhlcvNetwork = "solana" | "base" | "eth" | "ethereum";
type OhlcvTimeframe = "minute" | "hour" | "day";
type OhlcvTokenSide = "base" | "quote";

type NormalizedOhlcvCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type OhlcvSignalAction = "press" | "probe" | "hold" | "trim" | "exit" | "avoid";

type OhlcvCandleSignal = {
  mode: "local-candle-signal-v1";
  action: OhlcvSignalAction;
  confidence: number;
  momentum_score: number;
  volume_score: number;
  risk_score: number;
  short_change_pct: number;
  window_change_pct: number;
  drawdown_from_high_pct: number;
  range_pct: number;
  volume_burst_ratio: number;
  support_price_usd: number;
  resistance_price_usd: number;
  stop_price_usd: number;
  take_profit_price_usd: number;
  review_after_seconds: number;
  summary: string;
  triggers: string[];
  blockers: string[];
};

type OhlcvPaperDecision = {
  mode: "candle-signal-paper-executor-v1";
  action: "paper-buy" | "paper-sell" | "paper-hold" | "paper-block";
  side: "buy" | "sell" | "hold";
  notional_usd: number;
  size_pct_equity: number;
  cash_delta_usd: number;
  exposure_delta_usd: number;
  projected_cash_usd: number;
  projected_position_usd: number;
  stop_price_usd: number;
  take_profit_price_usd: number;
  review_after_seconds: number;
  reason: string;
  blockers: string[];
  safeguards: string[];
};

type OhlcvPaperContext = {
  enabled: boolean;
  cash_usd: number;
  position_usd: number;
  equity_usd: number;
  max_trade_usd: number;
};

type OhlcvResponse = {
  provider: OhlcvProvider;
  status: "ok";
  source: "geckoterminal-public";
  resolution: OhlcvPoolResolution;
  network: OhlcvNetwork;
  pool: string;
  timeframe: OhlcvTimeframe;
  aggregate: number;
  limit: number;
  token: OhlcvTokenSide;
  fetched_at: string;
  url: string;
  candles: NormalizedOhlcvCandle[];
  signal: OhlcvCandleSignal;
  paper_decision: OhlcvPaperDecision;
};

const GECKOTERMINAL_BASE_URL = "https://api.geckoterminal.com/api/v2";

type OhlcvPoolResolution = {
  mode: "manual-pool" | "auto-dex-candidate";
  source: TradingMarketSource | "manual";
  scenario: TradingScenario | null;
  account: TradingAccountMode | null;
  cycles: number | null;
  symbol: string | null;
  token_id: string | null;
  token_address: string | null;
  pair_address: string;
  attempt_count: number;
  scanner_status: string | null;
  summary: string;
};

export async function POST(request: Request): Promise<NextResponse<OhlcvPaperLedgerApplyResult | { error: string }>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 422 });
  }

  const parsed = parseOhlcvPaperApplyRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  return NextResponse.json(applyOhlcvPaperDecisionToLedger(parsed.value));
}

export async function GET(request: Request): Promise<NextResponse<OhlcvResponse | { error: string }>> {
  const parsed = parseOhlcvRequest(new URL(request.url).searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const resolved = await resolveOhlcvPools(parsed.value);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 422 });

  const { provider, timeframe, aggregate, limit, token, paper } = parsed.value;
  let lastFailure = "";
  for (const candidate of resolved.value.candidates) {
    const { network, pool, resolution } = candidate;
    const url = ohlcvUrl({ network, pool, timeframe, aggregate, limit, token });

    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        lastFailure = `GeckoTerminal OHLCV request failed with ${response.status}.`;
        if (parsed.value.auto) continue;
        return NextResponse.json({ error: lastFailure }, { status: 502 });
      }

      const body = await response.json();
      const candles = normalizeGeckoTerminalCandles(body).slice(-limit);
      const signal = analyzeOhlcvCandles(candles);
      const lastPrice = candles[candles.length - 1]?.close ?? 0;
      return NextResponse.json({
        provider,
        status: "ok",
        source: "geckoterminal-public",
        resolution,
        network,
        pool,
        timeframe,
        aggregate,
        limit,
        token,
        fetched_at: new Date().toISOString(),
        url,
        candles,
        signal,
        paper_decision: buildOhlcvPaperDecision(signal, paper, lastPrice),
      });
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "GeckoTerminal OHLCV request failed.";
      if (!parsed.value.auto) {
        return NextResponse.json({ error: lastFailure }, { status: 502 });
      }
    }
  }

  return NextResponse.json({
    error: lastFailure || "No auto-resolved DEX candidate returned GeckoTerminal OHLCV candles.",
  }, { status: 502 });
}

function parseOhlcvPaperApplyRequest(value: unknown):
  | { ok: true; value: OhlcvPaperLedgerApplyRequest }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Request must be an object." };
  }

  const record = value as Record<string, unknown>;
  if (record.action !== "apply-paper-decision") {
    return { ok: false, error: "action must be apply-paper-decision." };
  }

  const idempotencyKey = stringValue(record.idempotency_key);
  const symbol = stringValue(record.symbol);
  const tokenId = stringValue(record.token_id);
  const tokenAddress = stringValue(record.token_address);
  const source = stringValue(record.source);
  const reason = stringValue(record.reason) ?? "candle paper decision";
  const side = record.side;
  const chain = record.chain;
  const notionalUsd = numberValue(record.notional_usd);
  const priceUsd = numberValue(record.price_usd);
  const stopPriceUsd = numberValue(record.stop_price_usd);
  const takeProfitPriceUsd = numberValue(record.take_profit_price_usd);

  if (!idempotencyKey || idempotencyKey.length > 160 || idempotencyKey.includes("/") || idempotencyKey.includes("\\")) {
    return { ok: false, error: "idempotency_key must be 1 to 160 characters without URL separators." };
  }
  if (!symbol || symbol.length > 24) return { ok: false, error: "symbol must be 1 to 24 characters." };
  if (side !== "buy" && side !== "sell") return { ok: false, error: "side must be buy or sell." };
  if (!isOptionalTradingChain(chain)) return { ok: false, error: "chain must be solana, base, or ethereum when provided." };
  if (notionalUsd === null || notionalUsd < 10 || notionalUsd > 10_000) {
    return { ok: false, error: "notional_usd must be a number from 10 to 10000." };
  }
  if (priceUsd === null || priceUsd <= 0 || priceUsd > 1_000_000) {
    return { ok: false, error: "price_usd must be a positive number no greater than 1000000." };
  }
  if (stopPriceUsd !== null && stopPriceUsd <= 0) return { ok: false, error: "stop_price_usd must be positive when provided." };
  if (takeProfitPriceUsd !== null && takeProfitPriceUsd <= 0) {
    return { ok: false, error: "take_profit_price_usd must be positive when provided." };
  }

  return {
    ok: true,
    value: {
      action: "apply-paper-decision",
      idempotency_key: idempotencyKey,
      symbol,
      token_id: tokenId ?? undefined,
      token_address: tokenAddress ?? undefined,
      chain: chain ?? undefined,
      side,
      notional_usd: notionalUsd,
      price_usd: priceUsd,
      reason,
      stop_price_usd: stopPriceUsd ?? undefined,
      take_profit_price_usd: takeProfitPriceUsd ?? undefined,
      source: source ?? undefined,
    },
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function isOptionalTradingChain(value: unknown): value is MemecoinMarket["chain"] | undefined {
  return value === undefined || value === "solana" || value === "base" || value === "ethereum";
}

function parseOhlcvRequest(search: URLSearchParams):
  | { ok: true; value: { provider: OhlcvProvider; network: OhlcvNetwork; pool: string; auto: boolean; scenario: TradingScenario; source: TradingMarketSource; account: TradingAccountMode; cycles: number; timeframe: OhlcvTimeframe; aggregate: number; limit: number; token: OhlcvTokenSide; paper: OhlcvPaperContext } }
  | { ok: false; error: string } {
  const provider = search.get("provider") ?? "geckoterminal";
  const network = search.get("network") ?? "";
  const pool = search.get("pool") ?? "";
  const auto = search.get("auto") === "true";
  const scenario = search.get("scenario") ?? "breakout";
  const source = search.get("source") ?? "live-dex";
  const account = search.get("account") ?? "ephemeral";
  const cycles = Number(search.get("cycles") ?? "0");
  const timeframe = search.get("timeframe") ?? "minute";
  const aggregate = Number(search.get("aggregate") ?? "1");
  const limit = Number(search.get("limit") ?? "48");
  const token = search.get("token") ?? "base";
  const paperEnabled = search.get("paper") === "true";
  const cashUsd = parseUsdParam(search.get("cash_usd") ?? "0");
  const positionUsd = parseUsdParam(search.get("position_usd") ?? "0");
  const equityUsd = parseUsdParam(search.get("equity_usd") ?? search.get("cash_usd") ?? "0");
  const maxTradeUsd = parseUsdParam(search.get("max_trade_usd") ?? "750");

  if (provider !== "geckoterminal") return { ok: false, error: "provider must be geckoterminal." };
  if (!isTradingScenario(scenario)) return { ok: false, error: "scenario must be base, breakout, or rug-risk." };
  if (!isTradingMarketSource(source)) return { ok: false, error: "source must be sample or live-dex." };
  if (!isTradingAccountMode(account)) return { ok: false, error: "account must be ephemeral or persistent." };
  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 24) return { ok: false, error: "cycles must be an integer from 0 to 24." };
  if (!auto && !isOhlcvNetwork(network)) return { ok: false, error: "network must be solana, base, eth, or ethereum." };
  if (!auto && !isSafePoolId(pool)) return { ok: false, error: "pool must be a non-empty pool address or id without URL separators." };
  if (auto && pool && !isSafePoolId(pool)) return { ok: false, error: "pool must be empty or a safe pool id when auto=true." };
  if (!isOhlcvTimeframe(timeframe)) return { ok: false, error: "timeframe must be minute, hour, or day." };
  if (!Number.isInteger(aggregate) || aggregate < 1 || aggregate > 60) {
    return { ok: false, error: "aggregate must be an integer from 1 to 60." };
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "limit must be an integer from 1 to 100." };
  }
  if (!isOhlcvTokenSide(token)) return { ok: false, error: "token must be base or quote." };
  if (cashUsd === null) return { ok: false, error: "cash_usd must be a number from 0 to 10000000." };
  if (positionUsd === null) return { ok: false, error: "position_usd must be a number from 0 to 10000000." };
  if (equityUsd === null) return { ok: false, error: "equity_usd must be a number from 0 to 10000000." };
  if (maxTradeUsd === null || maxTradeUsd <= 0) return { ok: false, error: "max_trade_usd must be a number greater than 0 and no more than 10000000." };

  return {
    ok: true,
    value: {
      provider,
      network: isOhlcvNetwork(network) ? network : "solana",
      pool,
      auto,
      scenario,
      source,
      account,
      cycles,
      timeframe,
      aggregate,
      limit,
      token,
      paper: {
        enabled: paperEnabled,
        cash_usd: cashUsd,
        position_usd: positionUsd,
        equity_usd: Math.max(equityUsd, cashUsd + positionUsd),
        max_trade_usd: maxTradeUsd,
      },
    },
  };
}

async function resolveOhlcvPools(input: {
  network: OhlcvNetwork;
  pool: string;
  auto: boolean;
  scenario: TradingScenario;
  source: TradingMarketSource;
  account: TradingAccountMode;
  cycles: number;
}): Promise<
  | { ok: true; value: { candidates: Array<{ network: OhlcvNetwork; pool: string; resolution: OhlcvPoolResolution }> } }
  | { ok: false; error: string }
> {
  if (!input.auto) {
    return {
      ok: true,
      value: {
        candidates: [{
          network: input.network,
          pool: input.pool,
          resolution: {
            mode: "manual-pool",
            source: "manual",
            scenario: null,
            account: null,
            cycles: null,
            symbol: null,
            token_id: null,
            token_address: null,
            pair_address: input.pool,
            attempt_count: 1,
            scanner_status: null,
            summary: "Using the manually supplied GeckoTerminal pool id.",
          },
        }],
      },
    };
  }

  const state = await getWeb3TradingStateAsync({
    scenario: input.scenario,
    source: input.source,
    account: input.account,
    cycles: input.cycles,
    advance: false,
  });
  const candidates = state.market
    .filter((market) => (
      market.chain === "solana" &&
      isSafePoolId(market.pair_address) &&
      market.price_usd > 0 &&
      market.liquidity_usd > 0
    ))
    .slice(0, 8);

  if (candidates.length === 0) {
    return { ok: false, error: "No safe Solana DEX candidate pool is available for auto OHLCV resolution." };
  }

  return {
    ok: true,
    value: {
      candidates: candidates.map((candidate, index) => ({
        network: "solana" as const,
        pool: candidate.pair_address,
        resolution: {
          mode: "auto-dex-candidate" as const,
          source: input.source,
          scenario: input.scenario,
          account: input.account,
          cycles: input.cycles,
          symbol: candidate.symbol,
          token_id: candidate.id,
          token_address: candidate.token_address,
          pair_address: candidate.pair_address,
          attempt_count: index + 1,
          scanner_status: state.live_scanner_readiness.status,
          summary: `Auto-selected ${candidate.symbol} from ${input.source} DEX scanner evidence for read-only OHLCV proof.`,
        },
      })),
    },
  };
}

function ohlcvUrl({
  network,
  pool,
  timeframe,
  aggregate,
  limit,
  token,
}: {
  network: OhlcvNetwork;
  pool: string;
  timeframe: OhlcvTimeframe;
  aggregate: number;
  limit: number;
  token: OhlcvTokenSide;
}) {
  const params = new URLSearchParams({
    aggregate: aggregate.toString(),
    limit: limit.toString(),
    currency: "usd",
    token,
  });
  return `${GECKOTERMINAL_BASE_URL}/networks/${network === "ethereum" ? "eth" : network}/pools/${encodeURIComponent(pool)}/ohlcv/${timeframe}?${params.toString()}`;
}

function normalizeGeckoTerminalCandles(body: unknown): NormalizedOhlcvCandle[] {
  const list = typeof body === "object" && body !== null &&
    "data" in body &&
    typeof body.data === "object" &&
    body.data !== null &&
    "attributes" in body.data &&
    typeof body.data.attributes === "object" &&
    body.data.attributes !== null &&
    "ohlcv_list" in body.data.attributes &&
    Array.isArray(body.data.attributes.ohlcv_list)
    ? body.data.attributes.ohlcv_list
    : [];

  return list
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const [timestamp, open, high, low, close, volume] = row.map(Number);
      if (![timestamp, open, high, low, close, volume].every(Number.isFinite)) return null;
      return { timestamp, open, high, low, close, volume };
    })
    .filter((row): row is NormalizedOhlcvCandle => row !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function analyzeOhlcvCandles(candles: NormalizedOhlcvCandle[]): OhlcvCandleSignal {
  const validCandles = candles.filter((candle) =>
    candle.close > 0 &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.volume >= 0
  );
  const fallback = validCandles[validCandles.length - 1] ?? {
    timestamp: 0,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 0,
  };

  if (validCandles.length < 6) {
    return {
      mode: "local-candle-signal-v1",
      action: "hold",
      confidence: 18,
      momentum_score: 0,
      volume_score: 0,
      risk_score: 100,
      short_change_pct: 0,
      window_change_pct: 0,
      drawdown_from_high_pct: 0,
      range_pct: 0,
      volume_burst_ratio: 1,
      support_price_usd: fallback.low,
      resistance_price_usd: fallback.high,
      stop_price_usd: fallback.close * 0.94,
      take_profit_price_usd: fallback.close * 1.08,
      review_after_seconds: 30,
      summary: "Not enough candle history for autonomous chart conviction.",
      triggers: ["Need at least 6 candles before trusting short-window momentum."],
      blockers: ["Candle window is too short for high-frequency paper sizing."],
    };
  }

  const first = validCandles[0];
  const last = validCandles[validCandles.length - 1];
  const lookback = validCandles[Math.max(0, validCandles.length - 6)];
  const highs = validCandles.map((candle) => candle.high);
  const lows = validCandles.map((candle) => candle.low);
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const last5 = validCandles.slice(-5);
  const previous = validCandles.slice(Math.max(0, validCandles.length - 15), Math.max(0, validCandles.length - 5));
  const lastVolumeAvg = average(last5.map((candle) => candle.volume));
  const previousVolumeAvg = average(previous.map((candle) => candle.volume)) || lastVolumeAvg || 1;
  const shortChangePct = pctChange(lookback.close, last.close);
  const windowChangePct = pctChange(first.open || first.close, last.close);
  const drawdownFromHighPct = high > 0 ? ((high - last.close) / high) * 100 : 0;
  const rangePct = last.close > 0 ? ((high - low) / last.close) * 100 : 0;
  const volumeBurstRatio = lastVolumeAvg / Math.max(1, previousVolumeAvg);
  const support = Math.min(...last5.map((candle) => candle.low));
  const resistance = Math.max(...last5.map((candle) => candle.high));
  const momentumScore = clampScore(50 + shortChangePct * 4 + windowChangePct * 1.4);
  const volumeScore = clampScore(45 + (volumeBurstRatio - 1) * 35 + Math.min(18, Math.log10(Math.max(1, lastVolumeAvg)) * 2));
  const riskScore = clampScore(drawdownFromHighPct * 3.1 + rangePct * 1.35 + Math.max(0, -shortChangePct) * 4);
  const confidence = clampScore(momentumScore * 0.42 + volumeScore * 0.28 + (100 - riskScore) * 0.3);
  const action = candleSignalAction({
    confidence,
    shortChangePct,
    windowChangePct,
    drawdownFromHighPct,
    rangePct,
    volumeBurstRatio,
    riskScore,
  });
  const stopPct = action === "press" ? 0.07 : action === "probe" ? 0.055 : action === "trim" ? 0.035 : 0.06;
  const takeProfitPct = action === "press" ? 0.18 : action === "probe" ? 0.11 : action === "trim" ? 0.04 : 0.08;
  const triggers = [
    `${formatSignedPctForSignal(shortChangePct)} over the latest candle lookback.`,
    `${volumeBurstRatio.toFixed(2)}x recent volume burst.`,
    `${formatSignedPctForSignal(windowChangePct)} over the fetched candle window.`,
  ];
  const blockers = [
    ...(riskScore >= 72 ? [`Chart risk is ${riskScore}/100 from volatility and drawdown.`] : []),
    ...(drawdownFromHighPct >= 14 ? [`Price is ${drawdownFromHighPct.toFixed(1)}% below the window high.`] : []),
    ...(volumeBurstRatio < 0.75 ? ["Recent volume is fading against the prior window."] : []),
  ];

  return {
    mode: "local-candle-signal-v1",
    action,
    confidence,
    momentum_score: momentumScore,
    volume_score: volumeScore,
    risk_score: riskScore,
    short_change_pct: roundMetric(shortChangePct),
    window_change_pct: roundMetric(windowChangePct),
    drawdown_from_high_pct: roundMetric(drawdownFromHighPct),
    range_pct: roundMetric(rangePct),
    volume_burst_ratio: roundMetric(volumeBurstRatio),
    support_price_usd: support,
    resistance_price_usd: resistance,
    stop_price_usd: last.close * (1 - stopPct),
    take_profit_price_usd: last.close * (1 + takeProfitPct),
    review_after_seconds: action === "press" || action === "exit" ? 10 : action === "probe" || action === "trim" ? 15 : 30,
    summary: candleSignalSummary(action, confidence, shortChangePct, volumeBurstRatio, riskScore),
    triggers,
    blockers,
  };
}

function candleSignalAction({
  confidence,
  shortChangePct,
  windowChangePct,
  drawdownFromHighPct,
  rangePct,
  volumeBurstRatio,
  riskScore,
}: {
  confidence: number;
  shortChangePct: number;
  windowChangePct: number;
  drawdownFromHighPct: number;
  rangePct: number;
  volumeBurstRatio: number;
  riskScore: number;
}): OhlcvSignalAction {
  if (shortChangePct <= -8 || drawdownFromHighPct >= 22) return "exit";
  if (riskScore >= 82 || rangePct >= 55) return "avoid";
  if (drawdownFromHighPct >= 13 || shortChangePct <= -3.5) return "trim";
  if (confidence >= 72 && shortChangePct >= 3 && windowChangePct >= 0 && volumeBurstRatio >= 1.15) return "press";
  if (confidence >= 58 && shortChangePct >= 0.9 && volumeBurstRatio >= 0.85) return "probe";
  return "hold";
}

function candleSignalSummary(
  action: OhlcvSignalAction,
  confidence: number,
  shortChangePct: number,
  volumeBurstRatio: number,
  riskScore: number,
) {
  if (action === "press") {
    return `Press candidate: ${confidence}/100 chart confidence, ${formatSignedPctForSignal(shortChangePct)} recent momentum, and ${volumeBurstRatio.toFixed(2)}x volume burst.`;
  }
  if (action === "probe") {
    return `Probe only: chart confidence is ${confidence}/100 with improving momentum but not enough confirmation for full paper sizing.`;
  }
  if (action === "trim") {
    return `Trim pressure: recent candles are losing structure and chart risk is ${riskScore}/100.`;
  }
  if (action === "exit") {
    return `Exit pressure: the candle window shows a fast drawdown or failed momentum setup.`;
  }
  if (action === "avoid") {
    return `Avoid chase: volatility and drawdown are too high for autonomous entry.`;
  }
  return `Hold/watch: chart confidence is ${confidence}/100 and the candle window does not justify a fresh autonomous trade.`;
}

function pctChange(from: number, to: number) {
  return ((to - from) / Math.max(0.0000001, Math.abs(from))) * 100;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}

function formatSignedPctForSignal(value: number) {
  return `${value >= 0 ? "+" : ""}${roundMetric(value).toFixed(2)}%`;
}

function buildOhlcvPaperDecision(signal: OhlcvCandleSignal, paper: OhlcvPaperContext, lastPrice: number): OhlcvPaperDecision {
  const safeguards = [
    "paper ledger only",
    "no signer request",
    "no transaction broadcast",
    "bounded by cash, position value, and max trade size",
  ];
  const baseDecision = {
    mode: "candle-signal-paper-executor-v1" as const,
    stop_price_usd: signal.stop_price_usd || lastPrice * 0.94,
    take_profit_price_usd: signal.take_profit_price_usd || lastPrice * 1.08,
    review_after_seconds: signal.review_after_seconds,
    safeguards,
  };

  if (!paper.enabled) {
    return {
      ...baseDecision,
      action: "paper-hold",
      side: "hold",
      notional_usd: 0,
      size_pct_equity: 0,
      cash_delta_usd: 0,
      exposure_delta_usd: 0,
      projected_cash_usd: paper.cash_usd,
      projected_position_usd: paper.position_usd,
      reason: "Paper executor context was not requested for this candle read.",
      blockers: ["Pass paper=true with cash_usd, equity_usd, and position_usd to size a local action."],
    };
  }

  if (signal.action === "press" || signal.action === "probe") {
    const riskCapPct = signal.action === "press" ? 0.065 : 0.028;
    const confidenceScale = Math.max(0.35, signal.confidence / 100);
    const riskScale = Math.max(0.2, (100 - signal.risk_score) / 100);
    const desiredNotional = paper.equity_usd * riskCapPct * confidenceScale * riskScale;
    const notional = roundCurrency(Math.min(paper.cash_usd, paper.max_trade_usd, desiredNotional));
    const blockers = [
      ...(paper.cash_usd < 10 ? ["Paper cash is below the $10 minimum action size."] : []),
      ...(signal.risk_score >= 78 ? [`Chart risk is ${signal.risk_score}/100; buy sizing is blocked.`] : []),
      ...(notional < 10 ? ["Computed buy size is below the $10 minimum action size."] : []),
    ];

    if (blockers.length > 0) {
      return paperBlockDecision(baseDecision, paper, `Buy blocked even though the candle signal is ${signal.action}.`, blockers);
    }

    return {
      ...baseDecision,
      action: "paper-buy",
      side: "buy",
      notional_usd: notional,
      size_pct_equity: pctOfEquity(notional, paper.equity_usd),
      cash_delta_usd: -notional,
      exposure_delta_usd: notional,
      projected_cash_usd: roundCurrency(paper.cash_usd - notional),
      projected_position_usd: roundCurrency(paper.position_usd + notional),
      reason: `${signal.action === "press" ? "Press" : "Probe"} ${formatCurrencyForDecision(notional)} in paper because chart confidence is ${signal.confidence}/100 and risk is ${signal.risk_score}/100.`,
      blockers: [],
    };
  }

  if (signal.action === "trim" || signal.action === "exit" || signal.action === "avoid") {
    const sellPct = signal.action === "trim" ? 0.35 : 1;
    const desiredNotional = paper.position_usd * sellPct;
    const notional = roundCurrency(Math.min(paper.position_usd, paper.max_trade_usd, desiredNotional));
    const blockers = [
      ...(paper.position_usd < 10 ? ["No paper position value is available for a sell action."] : []),
      ...(notional < 10 ? ["Computed sell size is below the $10 minimum action size."] : []),
    ];

    if (blockers.length > 0) {
      return paperBlockDecision(baseDecision, paper, `Sell blocked even though the candle signal is ${signal.action}.`, blockers);
    }

    return {
      ...baseDecision,
      action: "paper-sell",
      side: "sell",
      notional_usd: notional,
      size_pct_equity: pctOfEquity(notional, paper.equity_usd),
      cash_delta_usd: notional,
      exposure_delta_usd: -notional,
      projected_cash_usd: roundCurrency(paper.cash_usd + notional),
      projected_position_usd: roundCurrency(Math.max(0, paper.position_usd - notional)),
      reason: `${signal.action === "trim" ? "Trim" : "Exit"} ${formatCurrencyForDecision(notional)} in paper because the candle signal is ${signal.action} with ${signal.risk_score}/100 chart risk.`,
      blockers: [],
    };
  }

  return {
    ...baseDecision,
    action: "paper-hold",
    side: "hold",
    notional_usd: 0,
    size_pct_equity: 0,
    cash_delta_usd: 0,
    exposure_delta_usd: 0,
    projected_cash_usd: paper.cash_usd,
    projected_position_usd: paper.position_usd,
    reason: "Hold in paper because the candle signal does not clear a buy, trim, or exit threshold.",
    blockers: signal.blockers,
  };
}

function paperBlockDecision(
  baseDecision: Pick<OhlcvPaperDecision, "mode" | "stop_price_usd" | "take_profit_price_usd" | "review_after_seconds" | "safeguards">,
  paper: OhlcvPaperContext,
  reason: string,
  blockers: string[],
): OhlcvPaperDecision {
  return {
    ...baseDecision,
    action: "paper-block",
    side: "hold",
    notional_usd: 0,
    size_pct_equity: 0,
    cash_delta_usd: 0,
    exposure_delta_usd: 0,
    projected_cash_usd: paper.cash_usd,
    projected_position_usd: paper.position_usd,
    reason,
    blockers,
  };
}

function parseUsdParam(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10_000_000) return null;
  return number;
}

function pctOfEquity(value: number, equity: number) {
  if (equity <= 0) return 0;
  return roundMetric((value / equity) * 100);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCurrencyForDecision(value: number) {
  return `$${roundCurrency(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function isOhlcvNetwork(value: string): value is OhlcvNetwork {
  return value === "solana" || value === "base" || value === "eth" || value === "ethereum";
}

function isOhlcvTimeframe(value: string): value is OhlcvTimeframe {
  return value === "minute" || value === "hour" || value === "day";
}

function isOhlcvTokenSide(value: string): value is OhlcvTokenSide {
  return value === "base" || value === "quote";
}

function isSafePoolId(value: string) {
  return value.length > 0 &&
    value.length <= 120 &&
    !value.includes("/") &&
    !value.includes("?") &&
    !value.includes("#");
}

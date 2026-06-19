#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:4010";

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2), process.env);
  await runCli(config);
}

export function parseArgs(argv = [], env = {}) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_MONITOR_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: choice(flags.get("scenario") ?? env.WEB3_MONITOR_SCENARIO ?? "breakout", ["base", "breakout", "rug-risk"], "breakout"),
    source: choice(flags.get("source") ?? env.WEB3_MONITOR_SOURCE ?? "live-dex", ["sample", "live-dex"], "live-dex"),
    account: choice(flags.get("account") ?? env.WEB3_MONITOR_ACCOUNT ?? "persistent", ["ephemeral", "persistent"], "persistent"),
    cycles: integer(flags.get("cycles") ?? env.WEB3_MONITOR_CYCLES, 0, 0, 24),
    timeframe: choice(flags.get("timeframe") ?? env.WEB3_MONITOR_TIMEFRAME ?? "minute", ["minute", "hour", "day"], "minute"),
    limit: integer(flags.get("limit") ?? env.WEB3_MONITOR_LIMIT, 24, 6, 100),
    aggregate: integer(flags.get("aggregate") ?? env.WEB3_MONITOR_AGGREGATE, 1, 1, 60),
    cashUsd: numberValue(flags.get("cash-usd") ?? env.WEB3_MONITOR_CASH_USD, 2500, 0, 10_000_000),
    positionUsd: numberValue(flags.get("position-usd") ?? env.WEB3_MONITOR_POSITION_USD, 0, 0, 10_000_000),
    equityUsd: numberValue(flags.get("equity-usd") ?? env.WEB3_MONITOR_EQUITY_USD, 10_000, 0, 10_000_000),
    maxTradeUsd: numberValue(flags.get("max-trade-usd") ?? env.WEB3_MONITOR_MAX_TRADE_USD, 500, 1, 10_000_000),
    record: booleanFlag(flags.get("record") ?? env.WEB3_MONITOR_RECORD, true),
    json: booleanFlag(flags.get("json") ?? env.WEB3_MONITOR_JSON, false),
  };
}

export async function runWeb3MarketMonitor(input) {
  const startedAt = new Date().toISOString();
  const discovery = await requestJson(input.baseUrl, `/api/web3-dex-discovery?${query({
    scenario: input.scenario,
    source: input.source,
    account: input.account,
    cycles: input.cycles,
  })}`);

  let ohlcv = null;
  let ohlcvError = "";
  try {
    ohlcv = await requestJson(input.baseUrl, `/api/web3-ohlcv?${query({
      auto: "true",
      scenario: input.scenario,
      source: input.source,
      account: input.account,
      cycles: input.cycles,
      timeframe: input.timeframe,
      aggregate: input.aggregate,
      limit: input.limit,
      token: "base",
      paper: "true",
      cash_usd: input.cashUsd,
      position_usd: input.positionUsd,
      equity_usd: input.equityUsd,
      max_trade_usd: input.maxTradeUsd,
    })}`);
  } catch (error) {
    ohlcvError = error instanceof Error ? error.message : "GeckoTerminal candle proof is unavailable.";
  }

  if (!ohlcv) {
    return {
      mode: "web3-market-monitor",
      status: "observed",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      base_url: input.baseUrl,
      scenario: input.scenario,
      source: input.source,
      account: input.account,
      discovery_status: discovery.status,
      scanner_status: discovery.source_summary?.scanner_status ?? "unknown",
      selected_symbol: discovery.source_summary?.top_symbols?.[0] ?? "UNKNOWN",
      selected_pair: null,
      selected_attempt_count: 0,
      candle_count: 0,
      candle_action: "unavailable",
      candle_confidence: 0,
      paper_action: "paper-block",
      paper_notional_usd: 0,
      recorded_candle_status: "not-recorded",
      recorded_candle_symbol: null,
      recorded_conviction_status: "not-recorded",
      provider_degraded: true,
      provider_error: ohlcvError,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      secret_echo_permission: "blocked",
      summary: `DEX discovery ${discovery.status}; candle proof unavailable from GeckoTerminal.`,
      next_action: "Retry the monitor after the public candle provider rate limit clears; keep fresh paper buys blocked until candle proof records.",
      controls: [
        "Uses only public DEX discovery and GeckoTerminal OHLCV reads.",
        "When candle proof is unavailable, records an observed/degraded receipt instead of enabling trading.",
        "Does not request private keys, signatures, transaction bodies, live execution, or wallet mutation.",
      ],
    };
  }

  const symbol = ohlcv.resolution?.symbol ?? "UNKNOWN";
  const lastPrice = ohlcv.candles?.at(-1)?.close ?? 0;
  const recordBody = buildCandleRecordBody(input, ohlcv, symbol, lastPrice);
  const recordedState = input.record
    ? await requestJson(input.baseUrl, "/api/web3-trading", {
      method: "POST",
      body: JSON.stringify(recordBody),
    })
    : null;

  const liveExecutionPermission = recordedState?.execution_gate?.live_execution_enabled ? "unexpected-enabled" : "blocked";
  const walletMutationPermission = recordedState?.execution_gate?.wallet_mutation_enabled ? "unexpected-enabled" : "blocked";
  const status = liveExecutionPermission === "blocked" && walletMutationPermission === "blocked"
    ? input.record ? "recorded" : "observed"
    : "blocked";

  return {
    mode: "web3-market-monitor",
    status,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    base_url: input.baseUrl,
    scenario: input.scenario,
    source: input.source,
    account: input.account,
    discovery_status: discovery.status,
    scanner_status: discovery.source_summary?.scanner_status ?? ohlcv.resolution?.scanner_status ?? "unknown",
    selected_symbol: symbol,
    selected_pair: ohlcv.resolution?.pair_address ?? ohlcv.pool,
    selected_attempt_count: ohlcv.resolution?.attempt_count ?? 1,
    candle_count: ohlcv.candles?.length ?? 0,
    candle_action: ohlcv.signal?.action ?? "unknown",
    candle_confidence: ohlcv.signal?.confidence ?? 0,
    paper_action: ohlcv.paper_decision?.action ?? "unknown",
    paper_notional_usd: ohlcv.paper_decision?.notional_usd ?? 0,
    recorded_candle_status: recordedState?.autonomous_candle_refresh?.status ?? "not-recorded",
    recorded_candle_symbol: recordedState?.autonomous_candle_refresh?.symbol ?? null,
    recorded_conviction_status: recordedState?.autonomous_candle_conviction?.status ?? "not-recorded",
    live_execution_permission: liveExecutionPermission,
    wallet_mutation_permission: walletMutationPermission,
    transaction_submission_permission: "blocked",
    secret_echo_permission: "blocked",
    summary: `${symbol} ${ohlcv.signal?.action ?? "unknown"} candle proof from ${ohlcv.candles?.length ?? 0} read-only GeckoTerminal candle${(ohlcv.candles?.length ?? 0) === 1 ? "" : "s"}.`,
    next_action: recordedState?.autonomous_candle_refresh?.next_action ??
      ohlcv.paper_decision?.reason ??
      "Review the candle proof before another paper-loop tick.",
    controls: [
      "Uses only public DEX discovery and GeckoTerminal OHLCV reads.",
      "Records local candle proof for the paper/autonomy cockpit only.",
      "Does not request private keys, signatures, transaction bodies, live execution, or wallet mutation.",
    ],
  };
}

function buildCandleRecordBody(input, ohlcv, symbol, lastPrice) {
  return {
    scenario: input.scenario,
    source: input.source,
    account: input.account,
    cycles: input.cycles,
    advance: false,
    candle_refresh: {
      action: "record",
      provider: ohlcv.provider ?? "geckoterminal",
      source: ohlcv.resolution?.source ?? input.source,
      symbol,
      pool: ohlcv.pool,
      network: ohlcv.network,
      timeframe: ohlcv.timeframe,
      candle_count: ohlcv.candles?.length ?? 0,
      last_price_usd: lastPrice,
      fetched_at: ohlcv.fetched_at,
      signal: {
        action: ohlcv.signal?.action ?? "none",
        confidence: ohlcv.signal?.confidence ?? 0,
        momentum_score: ohlcv.signal?.momentum_score ?? 0,
        volume_score: ohlcv.signal?.volume_score ?? 0,
        risk_score: ohlcv.signal?.risk_score ?? 100,
        review_after_seconds: ohlcv.signal?.review_after_seconds ?? 30,
        summary: ohlcv.signal?.summary ?? "No candle signal returned.",
        blockers: ohlcv.signal?.blockers ?? [],
      },
      paper_decision: {
        action: ohlcv.paper_decision?.action ?? "none",
        side: ohlcv.paper_decision?.side ?? "hold",
        notional_usd: ohlcv.paper_decision?.notional_usd ?? 0,
        reason: ohlcv.paper_decision?.reason ?? "No paper decision returned.",
        blockers: ohlcv.paper_decision?.blockers ?? [],
      },
    },
  };
}

async function requestJson(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.error) {
    throw new Error(payload?.error ?? `Request failed with ${response.status}.`);
  }
  return payload;
}

function query(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    params.set(key, String(value));
  }
  return params.toString();
}

function normalizeBaseUrl(value) {
  const text = String(value || DEFAULT_BASE_URL).trim();
  return text.replace(/\/+$/, "") || DEFAULT_BASE_URL;
}

function choice(value, allowed, fallback) {
  return allowed.includes(String(value)) ? String(value) : fallback;
}

function integer(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function numberValue(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function runCli(config) {
  try {
    const receipt = await runWeb3MarketMonitor(config);
    if (config.json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log(`${receipt.status}: ${receipt.summary}`);
      console.log(receipt.next_action);
    }
    process.exit(receipt.status === "recorded" || receipt.status === "observed" ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Web3 market monitor failed.";
    if (config.json) {
      console.log(JSON.stringify({
        mode: "web3-market-monitor",
        status: "error",
        error: message,
        live_execution_permission: "blocked",
        wallet_mutation_permission: "blocked",
        transaction_submission_permission: "blocked",
        secret_echo_permission: "blocked",
      }, null, 2));
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}

function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function booleanFlag(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

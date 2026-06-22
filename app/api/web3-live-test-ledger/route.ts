import { NextResponse } from "next/server";
import {
  buildWeb3LiveTradeCanaryBlockedFallbackReceipt,
  buildWeb3LiveTradeCanaryReceipt,
} from "@/src/db/web3-live-trade-canary";
import {
  buildWeb3LiveTestLedgerReceipt,
  type Web3LiveTestLedgerReceipt,
} from "@/src/db/web3-live-test-ledger";
import {
  getWeb3TradingStateAsync,
  isTradingAccountMode,
  isTradingMarketSource,
  isTradingScenario,
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
} from "@/src/db/web3-trading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE_TEST_LEDGER_STATUS_TIMEOUT_MS = 6_000;

export async function GET(request: Request): Promise<NextResponse<Web3LiveTestLedgerReceipt | { error: string }>> {
  const parsed = parseLiveTestLedgerQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const state = await withStatusTimeout(
    getWeb3TradingStateAsync({
      ...parsed.value,
      advance: false,
    }),
    LIVE_TEST_LEDGER_STATUS_TIMEOUT_MS,
  );

  return NextResponse.json(buildWeb3LiveTestLedgerReceipt({
    canary: state.ok
      ? buildWeb3LiveTradeCanaryReceipt(state.value)
      : buildWeb3LiveTradeCanaryBlockedFallbackReceipt({
        ...parsed.value,
        reason: state.error,
      }),
  }));
}

function parseLiveTestLedgerQuery(url: string):
  | { ok: true; value: { scenario: TradingScenario; source: TradingMarketSource; account: TradingAccountMode; cycles: number } }
  | { ok: false; error: string } {
  const search = new URL(url).searchParams;
  const scenario = search.get("scenario") ?? "breakout";
  const source = search.get("source") ?? "live-dex";
  const account = search.get("account") ?? "persistent";
  const cycles = Number(search.get("cycles") ?? "0");

  if (!isTradingScenario(scenario)) {
    return { ok: false, error: "scenario must be base, breakout, or rug-risk." };
  }
  if (!isTradingMarketSource(source)) {
    return { ok: false, error: "source must be sample or live-dex." };
  }
  if (!isTradingAccountMode(account)) {
    return { ok: false, error: "account must be ephemeral or persistent." };
  }
  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 24) {
    return { ok: false, error: "cycles must be an integer from 0 to 24." };
  }

  return {
    ok: true,
    value: {
      scenario: scenario as TradingScenario,
      source: source as TradingMarketSource,
      account: account as TradingAccountMode,
      cycles,
    },
  };
}

async function withStatusTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise.then((value) => ({ ok: true as const, value })),
      new Promise<{ ok: false; error: string }>((resolve) => {
        timeout = setTimeout(() => {
          resolve({
            ok: false,
            error: `Live test ledger timed out after ${timeoutMs}ms while building live market state; no live trade was attempted.`,
          });
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    return {
      ok: false,
      error: `Live test ledger failed before any live trade attempt: ${error instanceof Error ? error.message : "unknown error"}.`,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

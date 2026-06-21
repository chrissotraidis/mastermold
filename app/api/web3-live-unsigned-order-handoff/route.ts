import { NextResponse } from "next/server";
import {
  buildWeb3LiveUnsignedOrderHandoffReceipt,
  type Web3LiveUnsignedOrderHandoffInput,
  type Web3LiveUnsignedOrderHandoffReceipt,
} from "@/src/db/web3-live-unsigned-order-handoff";
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

export async function POST(request: Request): Promise<NextResponse<Web3LiveUnsignedOrderHandoffReceipt | { error: string }>> {
  const parsed = parseHandoffQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const body = await request.json().catch(() => null) as Web3LiveUnsignedOrderHandoffInput | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a live unsigned order handoff object." }, { status: 422 });
  }

  const state = await getWeb3TradingStateAsync({
    ...parsed.value,
    advance: false,
  });
  const receipt = await buildWeb3LiveUnsignedOrderHandoffReceipt(state, body);
  return NextResponse.json(receipt, { status: receipt.status === "unsafe-rejected" ? 422 : 200 });
}

function parseHandoffQuery(url: string):
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

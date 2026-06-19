import { NextResponse } from "next/server";
import {
  buildWeb3JupiterRehearsalReceipt,
  type Web3JupiterRehearsalReceipt,
} from "@/src/db/web3-jupiter-rehearsal";
import { writeWeb3JupiterRehearsalHistoryEntry } from "@/src/db/web3-jupiter-rehearsal-history";
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

type JupiterRehearsalBody = {
  jupiter_api_key?: unknown;
  wallet_public_key?: unknown;
  max_slippage_bps?: unknown;
};

export async function POST(request: Request): Promise<NextResponse<Web3JupiterRehearsalReceipt | { error: string }>> {
  const search = new URL(request.url).searchParams;
  const scenario = search.get("scenario") ?? "base";
  const source = search.get("source") ?? "sample";
  const account = search.get("account") ?? "persistent";
  const cycles = Number(search.get("cycles") ?? "0");

  if (!isTradingScenario(scenario)) {
    return NextResponse.json({ error: "scenario must be base, breakout, or rug-risk." }, { status: 422 });
  }
  if (!isTradingMarketSource(source)) {
    return NextResponse.json({ error: "source must be sample or live-dex." }, { status: 422 });
  }
  if (!isTradingAccountMode(account)) {
    return NextResponse.json({ error: "account must be ephemeral or persistent." }, { status: 422 });
  }
  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 24) {
    return NextResponse.json({ error: "cycles must be an integer from 0 to 24." }, { status: 422 });
  }

  const body = (await request.json().catch(() => null)) as JupiterRehearsalBody | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a Jupiter rehearsal object." }, { status: 422 });
  }
  const privateField = Object.keys(body).find((key) => /private|seed|secret|mnemonic/i.test(key));
  if (privateField) {
    return NextResponse.json({ error: "Private keys, seed phrases, mnemonics, and secret-bearing wallet fields are not accepted." }, { status: 422 });
  }
  if (body.jupiter_api_key !== undefined && typeof body.jupiter_api_key !== "string") {
    return NextResponse.json({ error: "jupiter_api_key must be a string when provided." }, { status: 422 });
  }
  if (body.wallet_public_key !== undefined && typeof body.wallet_public_key !== "string") {
    return NextResponse.json({ error: "wallet_public_key must be a public address string when provided." }, { status: 422 });
  }
  const maxSlippageBps = body.max_slippage_bps === undefined ? undefined : Number(body.max_slippage_bps);
  if (maxSlippageBps !== undefined && (!Number.isFinite(maxSlippageBps) || maxSlippageBps < 1 || maxSlippageBps > 10000)) {
    return NextResponse.json({ error: "max_slippage_bps must be a number from 1 to 10000." }, { status: 422 });
  }

  const state = await getWeb3TradingStateAsync({
    scenario: scenario as TradingScenario,
    source: source as TradingMarketSource,
    account: account as TradingAccountMode,
    cycles,
    advance: false,
  });

  const receipt = await buildWeb3JupiterRehearsalReceipt(state, {
    jupiter_api_key: body.jupiter_api_key,
    wallet_public_key: body.wallet_public_key,
    max_slippage_bps: maxSlippageBps,
  });
  writeWeb3JupiterRehearsalHistoryEntry(receipt);
  return NextResponse.json(receipt);
}

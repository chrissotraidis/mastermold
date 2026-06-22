import { NextResponse } from "next/server";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import {
  buildWeb3DedicatedWalletIntakeContract,
  validateWeb3DedicatedWalletIntake,
  type Web3DedicatedWalletIntakeContract,
  type Web3DedicatedWalletIntakeValidationReceipt,
} from "@/src/db/web3-dedicated-wallet-intake-contract";
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

export async function GET(request: Request): Promise<NextResponse<Web3DedicatedWalletIntakeContract | { error: string }>> {
  const parsed = parseWalletIntakeQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const state = await getWeb3TradingStateAsync({
    scenario: parsed.value.scenario,
    source: parsed.value.source,
    account: parsed.value.account,
    cycles: parsed.value.cycles,
    advance: false,
  });

  return NextResponse.json(buildWeb3DedicatedWalletIntakeContract({
    state,
    wallet: buildWeb3DedicatedWalletPacket(state),
  }));
}

export async function POST(request: Request): Promise<NextResponse<Web3DedicatedWalletIntakeValidationReceipt | { error: string }>> {
  const parsed = parseWalletIntakeQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "wallet intake validation body must be JSON." }, { status: 422 });
  }

  const state = await getWeb3TradingStateAsync({
    scenario: parsed.value.scenario,
    source: parsed.value.source,
    account: parsed.value.account,
    cycles: parsed.value.cycles,
    advance: false,
  });
  const receipt = validateWeb3DedicatedWalletIntake({ state, body });
  const status = receipt.status === "valid-public-wallet" || receipt.status === "sample-wallet-rejected" ? 200 : 422;
  return NextResponse.json(receipt, { status });
}

function parseWalletIntakeQuery(url: string):
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

import { NextResponse } from "next/server";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import {
  buildWeb3DedicatedWalletIntakeContract,
  type Web3DedicatedWalletIntakeContract,
} from "@/src/db/web3-dedicated-wallet-intake-contract";
import {
  getWeb3TradingStateAsync,
  isTradingAccountMode,
  isTradingScenario,
  type TradingAccountMode,
  type TradingScenario,
} from "@/src/db/web3-trading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<Web3DedicatedWalletIntakeContract | { error: string }>> {
  const parsed = parseWalletIntakeQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const state = await getWeb3TradingStateAsync({
    scenario: parsed.value.scenario,
    source: "sample",
    account: parsed.value.account,
    cycles: parsed.value.cycles,
    advance: false,
  });

  return NextResponse.json(buildWeb3DedicatedWalletIntakeContract({
    state,
    wallet: buildWeb3DedicatedWalletPacket(state),
  }));
}

function parseWalletIntakeQuery(url: string):
  | { ok: true; value: { scenario: TradingScenario; account: TradingAccountMode; cycles: number } }
  | { ok: false; error: string } {
  const search = new URL(url).searchParams;
  const scenario = search.get("scenario") ?? "breakout";
  const account = search.get("account") ?? "persistent";
  const cycles = Number(search.get("cycles") ?? "0");

  if (!isTradingScenario(scenario)) {
    return { ok: false, error: "scenario must be base, breakout, or rug-risk." };
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
      account: account as TradingAccountMode,
      cycles,
    },
  };
}

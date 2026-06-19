import { NextResponse } from "next/server";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3AutonomyLaunchChecklist, type Web3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import {
  getWeb3TradingStateAsync,
  isTradingAccountMode,
  isTradingMarketSource,
  isTradingScenario,
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
} from "@/src/db/web3-trading";

export async function GET(request: Request): Promise<NextResponse<Web3AutonomyLaunchChecklist | { error: string }>> {
  const search = new URL(request.url).searchParams;
  const scenario = normalizeScenario(search.get("scenario"));
  const source = normalizeSource(search.get("source"));
  const account = normalizeAccount(search.get("account"));

  try {
    const state = await getWeb3TradingStateAsync({
      scenario,
      source,
      account,
      advance: false,
    });
    return NextResponse.json(buildWeb3AutonomyLaunchChecklist(state, getWeb3PromotedPaperAutopilotHealth()));
  } catch {
    return NextResponse.json({ error: "Web3 autonomy launch checklist could not be built." }, { status: 500 });
  }
}

function normalizeScenario(value: string | null): TradingScenario {
  return value && isTradingScenario(value) ? value : "breakout";
}

function normalizeSource(value: string | null): TradingMarketSource {
  return value && isTradingMarketSource(value) ? value : "sample";
}

function normalizeAccount(value: string | null): TradingAccountMode {
  return value && isTradingAccountMode(value) ? value : "persistent";
}

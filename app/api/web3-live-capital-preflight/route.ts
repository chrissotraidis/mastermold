import { NextResponse } from "next/server";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveCapitalPreflightReceipt, type Web3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
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

export async function GET(request: Request): Promise<NextResponse<Web3LiveCapitalPreflightReceipt | { error: string }>> {
  const search = new URL(request.url).searchParams;
  const scenario = search.get("scenario") ?? "breakout";
  const source = search.get("source") ?? "live-dex";
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

  const state = await getWeb3TradingStateAsync({
    scenario: scenario as TradingScenario,
    source: source as TradingMarketSource,
    account: account as TradingAccountMode,
    cycles,
    advance: false,
  });
  const checklist = buildWeb3AutonomyLaunchChecklist(
    state,
    getWeb3PromotedPaperAutopilotHealth(),
    getWeb3DaemonSupervisorHealth(),
  );

  return NextResponse.json(buildWeb3LiveCapitalPreflightReceipt({ state, checklist }));
}

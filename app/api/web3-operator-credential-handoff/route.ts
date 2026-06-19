import { NextResponse } from "next/server";
import { buildWeb3AccountAcquisitionReceipt } from "@/src/db/web3-account-acquisition";
import { buildWeb3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import {
  buildWeb3OperatorCredentialHandoffReceipt,
  type Web3OperatorCredentialHandoffReceipt,
} from "@/src/db/web3-operator-credential-handoff";
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

export async function GET(request: Request): Promise<NextResponse<Web3OperatorCredentialHandoffReceipt | { error: string }>> {
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

  const state = await getWeb3TradingStateAsync({
    scenario: scenario as TradingScenario,
    source: source as TradingMarketSource,
    account: account as TradingAccountMode,
    cycles,
    advance: false,
  });
  const launchChecklist = buildWeb3AutonomyLaunchChecklist(
    state,
    getWeb3PromotedPaperAutopilotHealth(),
    getWeb3DaemonSupervisorHealth(),
  );

  return NextResponse.json(buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup: buildWeb3AccountSetupReceipt(state),
    acquisition: buildWeb3AccountAcquisitionReceipt(state),
    launchChecklist,
  }));
}

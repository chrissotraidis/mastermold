import { NextResponse } from "next/server";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import {
  buildWeb3ManualLiveReviewPacket,
  type Web3ManualLiveReviewPacket,
} from "@/src/db/web3-manual-live-review-packet";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import { buildWeb3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
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

export async function GET(request: Request): Promise<NextResponse<Web3ManualLiveReviewPacket | { error: string }>> {
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
  const daemonHealth = getWeb3DaemonSupervisorHealth();
  const productionSupervisor = buildWeb3ProductionSupervisorReadiness(daemonHealth);
  const accounting = buildWeb3AccountingLedgerReceipt(state);
  const liveOps = buildWeb3LiveOpsPacket({
    state,
    productionSupervisor,
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({
      reason: "manual live review packet preview",
      operator_ack: true,
    }),
    accounting,
  });
  const runway = buildWeb3SupervisedLiveRunway({
    state,
    wallet: buildWeb3DedicatedWalletPacket(state),
    jupiter: buildWeb3JupiterOrderPacket(state),
    signer: buildWeb3SignerCredentialPacket(state),
    liveOps,
  });
  const checklist = buildWeb3AutonomyLaunchChecklist(
    state,
    getWeb3PromotedPaperAutopilotHealth(),
    daemonHealth,
  );
  const preflight = buildWeb3LiveCapitalPreflightReceipt({ state, checklist });

  return NextResponse.json(buildWeb3ManualLiveReviewPacket({
    state,
    checklist,
    preflight,
    liveOps,
    runway,
  }));
}

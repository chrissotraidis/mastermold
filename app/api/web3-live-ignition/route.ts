import { NextResponse } from "next/server";
import { buildWeb3AccountAcquisitionReceipt } from "@/src/db/web3-account-acquisition";
import { buildWeb3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { buildWeb3CutoverBlockerBoard } from "@/src/db/web3-cutover-blocker-board";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import {
  buildWeb3LiveIgnitionActionReceipt,
  buildWeb3LiveIgnitionReceipt,
  type Web3LiveIgnitionActionMode,
  type Web3LiveIgnitionActionReceipt,
  type Web3LiveIgnitionReceipt,
} from "@/src/db/web3-live-ignition";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import { buildWeb3LiveTradeCanaryReceipt } from "@/src/db/web3-live-trade-canary";
import { buildWeb3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import { buildWeb3ManualLiveReviewPacket } from "@/src/db/web3-manual-live-review-packet";
import { buildWeb3OperatorCredentialHandoffReceipt } from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3OperatorRequestPacket } from "@/src/db/web3-operator-request-packet";
import { buildWeb3OperatorRunbook } from "@/src/db/web3-operator-runbook";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
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
import { buildWeb3UsabilityStatus } from "@/src/db/web3-usability-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<Web3LiveIgnitionReceipt | { error: string }>> {
  const parsed = parseIgnitionQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const ignition = await buildIgnitionFromQuery(parsed.value);
  return NextResponse.json(ignition);
}

export async function POST(request: Request): Promise<NextResponse<Web3LiveIgnitionActionReceipt | { error: string }>> {
  const parsed = parseIgnitionQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 422 });
  }

  if (!isPlainObject(body)) {
    return NextResponse.json({ error: "Request body must be a live ignition action object." }, { status: 422 });
  }

  const action = body.action === "prepare-autonomous-live" ? body.action : "prepare-supervised-canary";
  const ignition = await buildIgnitionFromQuery(parsed.value);
  const unsafeFields = findUnsafeFields(body);
  const receipt = buildWeb3LiveIgnitionActionReceipt({
    ignition,
    action: action as Web3LiveIgnitionActionMode,
    operatorAcknowledged: body.operator_ack === true,
    liveCapitalAcknowledged: body.live_capital_ack === "I_UNDERSTAND_REAL_FUNDS",
    unsafeFields,
  });

  return NextResponse.json(receipt, { status: receipt.status === "unsafe-rejected" ? 422 : 200 });
}

async function buildIgnitionFromQuery(value: { scenario: TradingScenario; source: TradingMarketSource; account: TradingAccountMode; cycles: number }) {
  const state = await getWeb3TradingStateAsync({
    ...value,
    advance: false,
  });
  const supervisorHealth = getWeb3DaemonSupervisorHealth();
  const promotedAutopilotHealth = getWeb3PromotedPaperAutopilotHealth();
  const launchChecklist = buildWeb3AutonomyLaunchChecklist(state, promotedAutopilotHealth, supervisorHealth);
  const accountSetup = buildWeb3AccountSetupReceipt(state);
  const liveOps = buildWeb3LiveOpsPacket({
    state,
    productionSupervisor: buildWeb3ProductionSupervisorReadiness(supervisorHealth),
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({
      reason: "live ignition preview",
      operator_ack: true,
    }),
    accounting: buildWeb3AccountingLedgerReceipt(state),
  });
  const runway = buildWeb3SupervisedLiveRunway({
    state,
    wallet: buildWeb3DedicatedWalletPacket(state),
    jupiter: buildWeb3JupiterOrderPacket(state),
    signer: buildWeb3SignerCredentialPacket(state),
    liveOps,
  });
  const usability = buildWeb3UsabilityStatus({
    state,
    launchChecklist,
    supervisedRunway: runway,
  });
  const handoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup,
    acquisition: buildWeb3AccountAcquisitionReceipt(state),
    launchChecklist,
  });
  const requestPacket = buildWeb3OperatorRequestPacket(handoff, { usability });
  const cutover = buildWeb3CutoverBlockerBoard({
    requestPacket,
    runway,
    usability,
  });
  const preflight = buildWeb3LiveCapitalPreflightReceipt({
    state,
    checklist: launchChecklist,
  });
  const runbook = buildWeb3OperatorRunbook({
    state,
    usability,
    cutover,
    preflight,
    runway,
    currentInput: requestPacket.current_input,
  });
  const manualLiveReview = buildWeb3ManualLiveReviewPacket({
    state,
    checklist: launchChecklist,
    preflight,
    liveOps,
    runway,
  });
  const liveUsability = buildWeb3LiveUsabilityBlockersReceipt({
    state,
    usability,
    cutover,
    runbook,
    preflight,
    manualLiveReview,
    runway,
    currentInput: requestPacket.current_input,
  });

  return buildWeb3LiveIgnitionReceipt({
    state,
    liveUsability,
    canary: buildWeb3LiveTradeCanaryReceipt(state),
  });
}

function parseIgnitionQuery(url: string):
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

function findUnsafeFields(value: unknown, path = ""): string[] {
  if (!isPlainObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    const unsafeKey = unsafeKeyPatterns.some((pattern) => pattern.test(key));
    const unsafeValue = typeof child === "string" && looksSecretLike(child);
    const nested = isPlainObject(child) ? findUnsafeFields(child, childPath) : [];
    return [
      unsafeKey || unsafeValue ? childPath : null,
      ...nested,
    ].filter((item): item is string => Boolean(item));
  });
}

const unsafeKeyPatterns = [
  /private/i,
  /seed/i,
  /mnemonic/i,
  /keypair/i,
  /secret/i,
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /raw[_-]?transaction/i,
  /unsigned[_-]?transaction/i,
  /signed[_-]?transaction/i,
  /signed[_-]?payload/i,
  /transaction[_-]?bytes/i,
];

function looksSecretLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/api-key=|bearer\s+[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9_-]{16,}/i.test(trimmed)) return true;
  if (/private[_\s-]?key|seed\s+phrase|mnemonic|keypair/i.test(trimmed)) return true;
  if (trimmed.split(/\s+/).length >= 12 && /^[a-z\s]+$/i.test(trimmed)) return true;
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

import { Database, ExternalLink, KeyRound, LockKeyhole, PlugZap, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BrainInitializationPanel } from "@/components/brain-initialization-panel";
import { CopyRedactedPacketButton } from "@/components/copy-redacted-packet-button";
import { PageHeader } from "@/components/page-header";
import { IntegrationKeyInput } from "@/components/integration-key-input";
import { ManualHoldingsPanel } from "@/components/manual-holdings-panel";
import { ProfileSettings } from "@/components/profile-settings";
import { SettingsWeb3CredentialConsole } from "@/components/settings-web3-credential-console";
import { SettingsWeb3ResearchAnswerConsole } from "@/components/settings-web3-research-answer-console";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { toPublicBrainState } from "@/lib/public-api-copy";
import { cn } from "@/lib/utils";
import { getBrainStateAfterDueScheduleCheck } from "@/src/db/brain";
import { getIntegrationStatuses, type IntegrationStatusJson } from "@/src/db/integrations";
import { getPortfolio } from "@/src/db/portfolio";
import { buildWeb3AccountAcquisitionReceipt, type Web3AccountAcquisitionReceipt } from "@/src/db/web3-account-acquisition";
import { buildWeb3AccountSetupReceipt, type Web3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { getWeb3CredentialDoctorHealth, type Web3CredentialDoctorHealth } from "@/src/db/web3-credential-doctor";
import { buildWeb3CredentialRequirementsReceipt, type Web3CredentialRequirementsReceipt } from "@/src/db/web3-credential-requirements";
import { buildWeb3CutoverBlockerBoard, type Web3CutoverBlockerBoard } from "@/src/db/web3-cutover-blocker-board";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket, type Web3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3FirstCanaryDrillReceipt, type Web3FirstCanaryDrillReceipt } from "@/src/db/web3-first-canary-drill";
import { buildWeb3JupiterOrderPacket, type Web3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { getWeb3JupiterRehearsalHistory, type Web3JupiterRehearsalHistory } from "@/src/db/web3-jupiter-rehearsal-history";
import { buildWeb3AutonomyLaunchChecklist, type Web3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveActivationPlan, type Web3LiveActivationPlan } from "@/src/db/web3-live-activation-plan";
import { buildWeb3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import { buildWeb3LiveIgnitionReceipt } from "@/src/db/web3-live-ignition";
import { buildWeb3LiveOpsPacket, type Web3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import { buildWeb3LiveTradeCanaryReceipt, type Web3LiveTradeCanaryReceipt } from "@/src/db/web3-live-trade-canary";
import { buildWeb3LiveUnsignedOrderPreflightReceipt } from "@/src/db/web3-live-unsigned-order-handoff";
import { buildWeb3LiveUsabilityBlockersReceipt, type Web3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import {
  buildWeb3ManualLiveReviewPacket,
  type Web3ManualLiveReviewPacket,
} from "@/src/db/web3-manual-live-review-packet";
import {
  buildWeb3OperatorCredentialHandoffReceipt,
  type Web3OperatorCredentialHandoffReceipt,
} from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3OperatorRequestPacket, type Web3OperatorRequestPacket } from "@/src/db/web3-operator-request-packet";
import { buildWeb3OperatorRunbook, type Web3OperatorRunbookReceipt } from "@/src/db/web3-operator-runbook";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3ResearchHandoffPacket, type Web3ResearchHandoffPacket } from "@/src/db/web3-research-handoff-packet";
import { buildWeb3SignerCredentialPacket, type Web3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import { buildWeb3SupervisedCanaryReadinessReceipt, type Web3SupervisedCanaryReadinessReceipt } from "@/src/db/web3-supervised-canary-readiness";
import { buildWeb3SupervisedLiveRunway, type Web3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import { getWeb3TradingStateAsync } from "@/src/db/web3-trading";
import { buildWeb3UsabilityStatus, type Web3UsabilityStatusReceipt } from "@/src/db/web3-usability-status";

const statusLabels: Record<IntegrationStatusJson["status"], string> = {
  connected: "Test passed",
  stubbed: "Sample mode",
  credential_gated: "Needs key",
};

export const dynamic = "force-dynamic";

type SettingsIntegrationService = Exclude<IntegrationStatusJson["service"], "llm"> | "live_chat";
type SettingsIntegrationStatus = Omit<IntegrationStatusJson, "id" | "service"> & {
  id: string;
  service: SettingsIntegrationService;
};

export default async function IntegrationsSettingsPage() {
  const integrations = getIntegrationStatuses().map(toSettingsIntegrationStatus);
  const portfolio = getPortfolio();
  const [brainStateRaw, web3State] = await Promise.all([
    getBrainStateAfterDueScheduleCheck({ trigger: "settings-open" }),
    getWeb3TradingStateAsync({ advance: false }),
  ]);
  const brainState = toPublicBrainState(brainStateRaw);
  const web3AccountReceipt = buildWeb3AccountSetupReceipt(web3State);
  const web3AcquisitionReceipt = buildWeb3AccountAcquisitionReceipt(web3State);
  const web3DedicatedWalletPacket = buildWeb3DedicatedWalletPacket(web3State);
  const web3JupiterOrderPacket = buildWeb3JupiterOrderPacket(web3State);
  const web3JupiterRehearsalHistory = getWeb3JupiterRehearsalHistory();
  const web3SignerPacket = buildWeb3SignerCredentialPacket(web3State);
  const web3CredentialDoctor = getWeb3CredentialDoctorHealth();
  const web3DaemonSupervisorHealth = getWeb3DaemonSupervisorHealth();
  const web3ProductionSupervisor = buildWeb3ProductionSupervisorReadiness(web3DaemonSupervisorHealth);
  const web3AccountingReceipt = buildWeb3AccountingLedgerReceipt(web3State);
  const web3LiveOpsPacket = buildWeb3LiveOpsPacket({
    state: web3State,
    productionSupervisor: web3ProductionSupervisor,
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({ reason: "settings preview", operator_ack: true }),
    accounting: web3AccountingReceipt,
  });
  const web3SupervisedLiveRunway = buildWeb3SupervisedLiveRunway({
    state: web3State,
    wallet: web3DedicatedWalletPacket,
    jupiter: web3JupiterOrderPacket,
    signer: web3SignerPacket,
    liveOps: web3LiveOpsPacket,
  });
  const web3LaunchChecklist = buildWeb3AutonomyLaunchChecklist(
    web3State,
    getWeb3PromotedPaperAutopilotHealth(),
    web3DaemonSupervisorHealth,
  );
  const web3LiveCapitalPreflight = buildWeb3LiveCapitalPreflightReceipt({
    state: web3State,
    checklist: web3LaunchChecklist,
  });
  const web3ManualLiveReviewPacket = buildWeb3ManualLiveReviewPacket({
    state: web3State,
    checklist: web3LaunchChecklist,
    preflight: web3LiveCapitalPreflight,
    liveOps: web3LiveOpsPacket,
    runway: web3SupervisedLiveRunway,
  });
  const web3BaseOperatorCredentialHandoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup: web3AccountReceipt,
    acquisition: web3AcquisitionReceipt,
    launchChecklist: web3LaunchChecklist,
  });
  const web3UsabilityStatus = buildWeb3UsabilityStatus({
    state: web3State,
    launchChecklist: web3LaunchChecklist,
    supervisedRunway: web3SupervisedLiveRunway,
  });
  const web3BaseOperatorRequestPacket = buildWeb3OperatorRequestPacket(web3BaseOperatorCredentialHandoff, {
    usability: web3UsabilityStatus,
  });
  const web3CutoverBlockerBoard = buildWeb3CutoverBlockerBoard({
    requestPacket: web3BaseOperatorRequestPacket,
    runway: web3SupervisedLiveRunway,
    usability: web3UsabilityStatus,
  });
  const web3OperatorRunbook = buildWeb3OperatorRunbook({
    state: web3State,
    usability: web3UsabilityStatus,
    cutover: web3CutoverBlockerBoard,
    preflight: web3LiveCapitalPreflight,
    runway: web3SupervisedLiveRunway,
    currentInput: web3BaseOperatorRequestPacket.current_input,
  });
  const web3LiveUsabilityBlockers = buildWeb3LiveUsabilityBlockersReceipt({
    state: web3State,
    usability: web3UsabilityStatus,
    cutover: web3CutoverBlockerBoard,
    runbook: web3OperatorRunbook,
    preflight: web3LiveCapitalPreflight,
    manualLiveReview: web3ManualLiveReviewPacket,
    runway: web3SupervisedLiveRunway,
    currentInput: web3BaseOperatorRequestPacket.current_input,
    credentialDoctor: web3CredentialDoctor,
  });
  const web3OperatorCredentialHandoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup: web3AccountReceipt,
    acquisition: web3AcquisitionReceipt,
    launchChecklist: web3LaunchChecklist,
    liveUsability: web3LiveUsabilityBlockers,
  });
  const web3OperatorRequestPacket = buildWeb3OperatorRequestPacket(web3OperatorCredentialHandoff, {
    usability: web3UsabilityStatus,
  });
  const web3ResearchHandoffPacket = buildWeb3ResearchHandoffPacket({
    state: web3State,
    usability: web3UsabilityStatus,
    handoff: web3OperatorCredentialHandoff,
    requestPacket: web3OperatorRequestPacket,
    cutover: web3CutoverBlockerBoard,
    runbook: web3OperatorRunbook,
    preflight: web3LiveCapitalPreflight,
    runway: web3SupervisedLiveRunway,
    manualLiveReview: web3ManualLiveReviewPacket,
  });
  const web3CredentialRequirements = buildWeb3CredentialRequirementsReceipt(web3ResearchHandoffPacket);
  const web3LiveActivationPlan = buildWeb3LiveActivationPlan({
    requirements: web3CredentialRequirements,
    liveUsability: web3LiveUsabilityBlockers,
    liveAutonomy: web3State.autonomous_live_autonomy_readiness,
    operatorWalletPublicKey: web3State.execution_readiness.config.wallet_public_key,
  });
  const web3LiveTradeCanary = buildWeb3LiveTradeCanaryReceipt(web3State);
  const web3LiveIgnition = buildWeb3LiveIgnitionReceipt({
    state: web3State,
    liveUsability: web3LiveUsabilityBlockers,
    canary: web3LiveTradeCanary,
  });
  const web3UnsignedCanaryPreflight = buildWeb3LiveUnsignedOrderPreflightReceipt(web3State, {
    operator_ack: true,
    canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
    wallet_public_key: web3State.execution_readiness.config.wallet_public_key,
    amount_lamports: 100_000,
    max_slippage_bps: web3State.execution_readiness.config.max_slippage_bps,
  });
  const web3SupervisedCanaryReadiness = buildWeb3SupervisedCanaryReadinessReceipt({
    state: web3State,
    wallet: web3DedicatedWalletPacket,
    jupiter: web3JupiterOrderPacket,
    signer: web3SignerPacket,
    livePreflight: web3LiveCapitalPreflight,
    ignition: web3LiveIgnition,
    unsignedPreflight: web3UnsignedCanaryPreflight,
    canary: web3LiveTradeCanary,
  });
  const web3FirstCanaryDrill = buildWeb3FirstCanaryDrillReceipt({
    state: web3State,
    liveUsability: web3LiveUsabilityBlockers,
    readiness: web3SupervisedCanaryReadiness,
    jupiter: web3JupiterOrderPacket,
    unsignedPreflight: web3UnsignedCanaryPreflight,
    canary: web3LiveTradeCanary,
  });
  const publicProvenanceLabel = productProvenanceLabel(portfolio.provenance.label);

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Settings"
          subtitle="Add holdings, test account access, set up live chat, and finish safe Web3 trading setup before trusting automation."
          provenance={publicProvenanceLabel}
        />

        <div className="mb-8">
          <SettingsWeb3SetupPriorityCard
            liveUsability={web3LiveUsabilityBlockers}
            requestPacket={web3OperatorRequestPacket}
            researchPacket={web3ResearchHandoffPacket}
            credentialRequirements={web3CredentialRequirements}
            firstCanaryDrill={web3FirstCanaryDrill}
          />
        </div>

        <div className="mb-8">
          <SettingsWeb3LiveActivationPlanPanel plan={web3LiveActivationPlan} />
        </div>

        <div className="mb-8">
          <SettingsWeb3LiveTradeCanaryPanel receipt={web3LiveTradeCanary} />
        </div>

        <div className="mb-8">
          <ManualHoldingsPanel holdings={portfolio.manual_holdings} />
        </div>

        <div className="mb-8">
          <Web3CredentialsRunwayCard
            receipt={web3AccountReceipt}
            acquisition={web3AcquisitionReceipt}
            dedicatedWalletPacket={web3DedicatedWalletPacket}
            jupiterOrderPacket={web3JupiterOrderPacket}
            jupiterRehearsalHistory={web3JupiterRehearsalHistory}
            signerPacket={web3SignerPacket}
            liveOpsPacket={web3LiveOpsPacket}
            supervisedLiveRunway={web3SupervisedLiveRunway}
            manualLiveReviewPacket={web3ManualLiveReviewPacket}
            credentialDoctor={web3CredentialDoctor}
            launchChecklist={web3LaunchChecklist}
            operatorCredentialHandoff={web3OperatorCredentialHandoff}
            operatorRequestPacket={web3OperatorRequestPacket}
            cutoverBlockerBoard={web3CutoverBlockerBoard}
            operatorRunbook={web3OperatorRunbook}
            usabilityStatus={web3UsabilityStatus}
            liveUsabilityBlockers={web3LiveUsabilityBlockers}
            liveTradeCanary={web3LiveTradeCanary}
            supervisedCanaryReadiness={web3SupervisedCanaryReadiness}
            firstCanaryDrill={web3FirstCanaryDrill}
            researchHandoffPacket={web3ResearchHandoffPacket}
            state={web3State}
          />
        </div>

        <div className="mb-8">
          <ConnectionChecks integrations={integrations} />
        </div>

        <div className="mb-8">
          <ProfileSettings />
        </div>

        <div className="mb-8">
          <PortfolioImportStatusCard portfolio={portfolio} />
        </div>

        <div className="mb-8">
          <DataPrivacyCard />
        </div>

        <div className="mb-8">
          <BrainInitializationPanel initialState={brainState} />
        </div>

        <Card className="border-violet/30 bg-violet/[0.055]">
          <CardContent className="flex gap-3 p-5 text-sm leading-6 text-on-surface">
            <Database aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p>
              Manual entries and imported holdings affect Today and chat. Account imports are read-only snapshots; keys here still cannot move money.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Web3CredentialsRunwayCard({
  receipt,
  acquisition,
  dedicatedWalletPacket,
  jupiterOrderPacket,
  jupiterRehearsalHistory,
  signerPacket,
  liveOpsPacket,
  supervisedLiveRunway,
  manualLiveReviewPacket,
  credentialDoctor,
  launchChecklist,
  operatorCredentialHandoff,
  operatorRequestPacket,
  cutoverBlockerBoard,
  operatorRunbook,
  usabilityStatus,
  liveUsabilityBlockers,
  liveTradeCanary,
  supervisedCanaryReadiness,
  firstCanaryDrill,
  researchHandoffPacket,
  state,
}: {
  receipt: Web3AccountSetupReceipt;
  acquisition: Web3AccountAcquisitionReceipt;
  dedicatedWalletPacket: Web3DedicatedWalletPacket;
  jupiterOrderPacket: Web3JupiterOrderPacket;
  jupiterRehearsalHistory: Web3JupiterRehearsalHistory;
  signerPacket: Web3SignerCredentialPacket;
  liveOpsPacket: Web3LiveOpsPacket;
  supervisedLiveRunway: Web3SupervisedLiveRunway;
  manualLiveReviewPacket: Web3ManualLiveReviewPacket;
  credentialDoctor: Web3CredentialDoctorHealth;
  launchChecklist: Web3AutonomyLaunchChecklist;
  operatorCredentialHandoff: Web3OperatorCredentialHandoffReceipt;
  operatorRequestPacket: Web3OperatorRequestPacket;
  cutoverBlockerBoard: Web3CutoverBlockerBoard;
  operatorRunbook: Web3OperatorRunbookReceipt;
  usabilityStatus: Web3UsabilityStatusReceipt;
  liveUsabilityBlockers: Web3LiveUsabilityBlockersReceipt;
  liveTradeCanary: Web3LiveTradeCanaryReceipt;
  supervisedCanaryReadiness: Web3SupervisedCanaryReadinessReceipt;
  firstCanaryDrill: Web3FirstCanaryDrillReceipt;
  researchHandoffPacket: Web3ResearchHandoffPacket;
  state: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>;
}) {
  const requiredConfigured = receipt.environment_summary.required_configured_count;
  const requiredTotal = receipt.environment_summary.required_account_count;
  const liveReady = receipt.status === "live-review-blocked";
  const scopedWallet = state.autonomous_custody_mandate.wallet_public_key ??
    state.live_wallet_accounting_readiness.wallet_public_key ??
    state.execution_readiness.config.wallet_public_key ??
    "";
  const credentialQueue = buildWeb3CredentialActionQueue(receipt, acquisition, state);
  const queueReadyCount = credentialQueue.filter((item) => item.status === "ready").length;
  const handoffRows = buildWeb3CredentialHandoffRows(credentialQueue);
  const nextMissing = credentialQueue.find((item) => item.status === "missing" || item.status === "blocked") ??
    credentialQueue.find((item) => item.status === "review") ??
    credentialQueue[0];
  const jupiterAcquisition = acquisition.items.find((item) => item.id === "jupiter");
  const launchpadRows = buildSettingsWeb3LiveCredentialLaunchpadRows({
    credentialQueue,
    handoff: operatorCredentialHandoff,
    requestPacket: operatorRequestPacket,
    dedicatedWalletPacket,
    jupiterOrderPacket,
    signerPacket,
    liveUsability: liveUsabilityBlockers,
    liveTradeCanary,
  });

  return (
    <section id="settings-web3-credentials-runway" aria-labelledby="web3-credential-runway-title">
      <Card className="border-engine/30 bg-engine/[0.045]">
        <CardHeader className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
                <WalletCards aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0">
                <CardTitle as="h2" id="web3-credential-runway-title" className="text-xl text-on-surface">
                  Web3 trading credentials
                </CardTitle>
                <p className="mt-1 text-sm leading-6 text-outline">
                  Secure setup state for the autonomous Web3 paper desk before any live-capital review.
                </p>
              </div>
            </div>
            <StatusBadge status={liveReady ? "connected" : requiredConfigured > 0 ? "stubbed" : "credential_gated"} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <SettingsWeb3LiveCredentialLaunchpad
            rows={launchpadRows}
            handoff={operatorCredentialHandoff}
            liveUsability={liveUsabilityBlockers}
            liveTradeCanary={liveTradeCanary}
            supervisedCanaryReadiness={supervisedCanaryReadiness}
            firstCanaryDrill={firstCanaryDrill}
          />
          <SettingsWeb3CredentialCommandCenter
            handoff={operatorCredentialHandoff}
            requestPacket={operatorRequestPacket}
            runbook={operatorRunbook}
            cutover={cutoverBlockerBoard}
          />
          <SettingsWeb3OperatorUnlockSequence usability={usabilityStatus} />
          <SettingsWeb3OperatorSetupRunway
            handoff={operatorCredentialHandoff}
            requestPacket={operatorRequestPacket}
            runbook={operatorRunbook}
            liveUsability={liveUsabilityBlockers}
          />
          <SettingsWeb3LiveUsabilityBlockersPanel receipt={liveUsabilityBlockers} />
          <SettingsWeb3CredentialSafetyMatrix handoff={operatorCredentialHandoff} requestPacket={operatorRequestPacket} />
          <SettingsWeb3ResearchHandoffPanel packet={researchHandoffPacket} />
          <SettingsWeb3OperatorIntakeBoard receipt={operatorCredentialHandoff} />
          <SettingsWeb3OperatorRequestPacketPanel packet={operatorRequestPacket} />
          <SettingsWeb3CutoverBlockerBoardPanel board={cutoverBlockerBoard} />
          <SettingsWeb3OperatorRunbookPanel runbook={operatorRunbook} />

          <div className="rounded-md border border-violet/25 bg-violet/[0.035] p-3" aria-label="Secure Web3 credential handoff">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Secure credential handoff</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  Next input: {nextMissing.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-outline">
                  Helius read checks can be local server-env evidence; Jupiter, wallet ownership, signer, stop, and accounting inputs still need explicit review before live capital.
                </p>
              </div>
              <CredentialStateBadge configured={queueReadyCount === credentialQueue.length} status={`${credentialQueue.length - queueReadyCount} open`} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {handoffRows.map((item) => (
                <div key={item.label} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{item.label}</p>
                  <p className="mt-1 text-xs font-semibold text-on-surface">{item.value}</p>
                  <p className="mt-1 text-[11px] leading-4 text-outline">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/35 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Verification path</p>
              <p className="mt-1 break-words text-[11px] leading-4 text-on-surface-variant">
                Run <code className="rounded bg-black/20 px-1 py-0.5">npm run verify:web3 -- --base-url=http://localhost:4010</code> after each credential change; add strict wallet, Jupiter, and live-DEX flags only after those rows are ready.
              </p>
            </div>
            <p className="sr-only" aria-label="Secure Web3 credential handoff boundary">
              Secure credential handoff shows configured or missing status only; Helius and Jupiter secrets stay out of browser storage; private keys and seed phrases are never accepted; live execution and wallet mutation remain blocked.
            </p>
          </div>

          <SettingsOperatorCredentialHandoffReceiptPanel receipt={operatorCredentialHandoff} />

          <SettingsSupervisedLiveRunwayPanel runway={supervisedLiveRunway} />

          <SettingsManualLiveReviewPacketPanel packet={manualLiveReviewPacket} />

          {jupiterAcquisition && jupiterAcquisition.status !== "configured" ? (
            <div className="rounded-md border border-caution/30 bg-caution/[0.04] p-3" aria-label="Jupiter Swap V2 setup action">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Jupiter Swap V2 setup</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{jupiterAcquisition.label}</p>
                  <p className="mt-1 text-xs leading-5 text-on-surface-variant">{jupiterAcquisition.next_action}</p>
                </div>
                <CredentialStateBadge configured={false} status={jupiterAcquisition.status} />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe install</p>
                  <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
                    Paste the key into the Settings credential console and press Install local env, or add JUPITER_API_KEY to ignored local env manually.
                  </p>
                </div>
                <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Proof command</p>
                  <code className="mt-1 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
                    npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order
                  </code>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={jupiterAcquisition.setup_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-engine hover:text-engine/80"
                >
                  Jupiter portal
                  <ExternalLink aria-hidden="true" className="size-3" />
                </a>
                <a
                  href={jupiterAcquisition.docs_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-violet hover:text-violet/80"
                >
                  Swap V2 docs
                  <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-outline">
                This is order-rehearsal evidence only. Mastermind still withholds transaction bytes, never stores the key in browser storage, and keeps signing, submission, live execution, and wallet mutation blocked.
              </p>
            </div>
          ) : null}

          <SettingsDedicatedWalletPacketPanel packet={dedicatedWalletPacket} />

          <SettingsJupiterOrderPacketPanel packet={jupiterOrderPacket} rehearsalHistory={jupiterRehearsalHistory} />

          <SettingsCredentialDoctorPanel health={credentialDoctor} />

          <SettingsSignerCredentialPacketPanel packet={signerPacket} />

          <SettingsLiveOpsPacketPanel packet={liveOpsPacket} />

          <div className="rounded-md border border-engine/25 bg-surface-dim/35 p-3" aria-label="Live Web3 credential queue">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Live credential queue</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">What is left before supervised trading review</p>
                <p className="mt-1 text-xs leading-5 text-outline">
                  {queueReadyCount}/{credentialQueue.length} setup lanes are ready. Secrets stay in ignored server env or one-shot tests; private keys and seed phrases stay out of the app.
                </p>
              </div>
              <CredentialStateBadge configured={queueReadyCount === credentialQueue.length} status={`${queueReadyCount}/${credentialQueue.length} ready`} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {credentialQueue.map((item) => (
                <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/30 bg-void/20 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-outline">{item.detail}</p>
                    </div>
                    <CredentialQueueBadge status={item.status} />
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.action}</p>
                  <p className="mt-2 rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                    {item.storage}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SettingsMetric label="Required rails" value={`${requiredConfigured}/${requiredTotal}`} />
            <SettingsMetric label="Current gate" value={receipt.status.replaceAll("-", " ")} />
            <SettingsMetric label="Signer posture" value={receipt.environment_summary.signer_provider.replaceAll("-", " ")} />
          </div>

          <p className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm leading-6 text-on-surface-variant">
            {receipt.summary} {receipt.next_action}
          </p>

          <SettingsLaunchBlockerQueue checklist={launchChecklist} />

          <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-3" aria-label="Web3 external account setup packet">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">External setup packet</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">Credential checklist</p>
                <p className="mt-1 text-xs leading-5 text-outline">{acquisition.next_external_action}</p>
              </div>
              <CredentialStateBadge configured={acquisition.status === "ready-for-order-rehearsal"} status={acquisition.status} />
            </div>
            <p className="mt-2 rounded-md border border-outline-variant/35 bg-surface-dim/45 p-2 text-xs leading-5 text-on-surface-variant">
              {acquisition.summary} Setup links, storage rules, env names, and tests stay visible here so the next credential action is not hidden in the deeper trading cockpit.
            </p>
            <div className="mt-3 grid gap-2">
              {acquisition.items.map((item) => (
                <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/35 bg-surface-dim/45 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                        {item.priority.replace("-", " ")} · {item.account_owner} owned
                      </p>
                    </div>
                    <CredentialStateBadge configured={item.status === "configured"} status={item.status} />
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-outline">{item.next_action}</p>
                  <p className="mt-1 text-[11px] leading-4 text-outline">{item.security_rule}</p>
                  {item.env_targets.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.env_targets.map((target) => (
                        <span key={target} className="max-w-full break-all rounded-md border border-outline-variant/35 bg-void/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                          {target}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 rounded-md border border-outline-variant/25 bg-void/20 p-2 text-[11px] leading-4 text-on-surface-variant">
                    Test: {item.test_action}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a
                      href={item.setup_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-engine hover:text-engine/80"
                    >
                      Setup
                      <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                    <a
                      href={item.docs_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-violet hover:text-violet/80"
                    >
                      Docs
                      <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-outline-variant/35 bg-void/20 p-2" aria-label="Web3 credential environment template">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Ignored env template</p>
              <div className="mt-2 grid gap-1">
                {acquisition.env_template.length > 0 ? acquisition.env_template.map((target) => (
                  <code key={target} className="break-all rounded-md border border-outline-variant/25 bg-black/20 px-2 py-1 font-mono text-[11px] leading-5 text-on-surface-variant">
                    {target}
                  </code>
                )) : (
                  <p className="rounded-md border border-outline-variant/25 bg-black/20 px-2 py-1 text-xs leading-5 text-outline">
                    No server env slots are currently required by the visible checklist.
                  </p>
                )}
              </div>
            </div>
            <p className="sr-only" aria-label="Web3 external account setup security boundary">
              External account setup is operator owned; in app signup blocked; private key storage blocked; seed phrase storage blocked; live execution blocked; wallet mutation blocked; secret echo blocked.
            </p>
          </div>

          <div id="web3-credential-action-console">
            <SettingsWeb3CredentialConsole
              walletPublicKeyPreview={receipt.wallet_summary.wallet_public_key_preview}
              defaultWalletPublicKey={scopedWallet}
              nextOperatorInputLabel={operatorRequestPacket.current_input?.label ?? operatorRequestPacket.next_input?.label ?? operatorRequestPacket.next_unlock_step?.label ?? null}
              nextOperatorInputAction={operatorRequestPacket.current_input?.next_action ?? operatorRequestPacket.next_input?.next_action ?? operatorRequestPacket.next_unlock_step?.next_action ?? null}
              nextOperatorInputStorage={operatorRequestPacket.current_input?.storage ?? operatorRequestPacket.next_input?.storage ?? operatorRequestPacket.next_unlock_step?.storage ?? null}
              nextOperatorInputVerifier={operatorRequestPacket.current_input?.verifier_command ?? operatorRequestPacket.next_input?.verifier_command ?? null}
              maxTradeUsd={state.execution_readiness.config.max_trade_usd}
              dailySpendCapUsd={state.execution_readiness.config.daily_spend_cap_usd}
              maxSlippageBps={state.execution_readiness.config.max_slippage_bps}
              jupiterConfigured={receipt.environment_summary.jupiter_configured}
              initialLiveUsability={liveUsabilityBlockers}
              initialFirstCanaryDrill={firstCanaryDrill}
              initialLiveTradeCanary={liveTradeCanary}
              scenario={state.scenario}
              source={state.market_source.mode}
              account={state.paper_account.mode}
              cycles={state.paper_account.cycle}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/trading?source=sample"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/40 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15"
            >
              <KeyRound aria-hidden="true" className="size-4" />
              Open Web3 wiring
            </Link>
            <Link
              href="/trading?source=live-dex"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-violet/35 bg-violet/10 px-3 py-2 text-sm font-semibold text-violet transition hover:bg-violet/15"
            >
              <PlugZap aria-hidden="true" className="size-4" />
              Open Live DEX read
            </Link>
            <Badge variant="outline" className="border-outline-variant/40 bg-surface-dim/45 text-outline">
              live execution blocked
            </Badge>
            <Badge variant="outline" className="border-outline-variant/40 bg-surface-dim/45 text-outline">
              wallet mutation blocked
            </Badge>
          </div>

          <p className="sr-only" aria-label="Web3 credentials security boundary">
            Web3 trading credentials status {receipt.status}; live execution blocked; wallet mutation blocked; private key storage blocked; seed phrase storage blocked; secret echo blocked.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

type SettingsWeb3LaunchpadRow = {
  id: string;
  label: string;
  status: "ready" | "active" | "review" | "blocked";
  detail: string;
  next_action: string;
  storage: string;
  href: string;
  command: string | null;
};

function SettingsWeb3LiveCredentialLaunchpad({
  rows,
  handoff,
  liveUsability,
  liveTradeCanary,
  supervisedCanaryReadiness,
  firstCanaryDrill,
}: {
  rows: SettingsWeb3LaunchpadRow[];
  handoff: Web3OperatorCredentialHandoffReceipt;
  liveUsability: Web3LiveUsabilityBlockersReceipt;
  liveTradeCanary: Web3LiveTradeCanaryReceipt;
  supervisedCanaryReadiness: Web3SupervisedCanaryReadinessReceipt;
  firstCanaryDrill: Web3FirstCanaryDrillReceipt;
}) {
  const readyRows = rows.filter((row) => row.status === "ready").length;
  const nextRow = rows.find((row) => row.status === "active" || row.status === "blocked" || row.status === "review") ?? rows[0];
  const attempt = supervisedCanaryReadiness.canary_attempt_contract;
  const nextUnblockStep = firstCanaryDrill.next_unblock_step;
  const unblockSteps = [
    ...firstCanaryDrill.operator_unblock_plan.filter((step) => step.status === "next" || step.status === "watch"),
    ...firstCanaryDrill.operator_unblock_plan.filter((step) => step.status === "blocked"),
    ...firstCanaryDrill.operator_unblock_plan.filter((step) => step.status === "done"),
  ].slice(0, 4);
  const strictVerifier = nextRow?.command ??
    handoff.next_input?.verifier_command ??
    liveUsability.current_input?.verifier_command ??
    "npm run verify:web3 -- --base-url=http://localhost:4010";
  const nextSurface = nextRow?.storage.split("·")[0]?.trim() || handoff.next_input?.safe_collection_surface.replaceAll("-", " ") || "review";

  return (
    <div className="rounded-md border border-engine/35 bg-engine/[0.06] p-3" aria-label="Settings Web3 live credential launchpad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Live trading setup launchpad</p>
          <p className="mt-1 text-base font-semibold text-on-surface">
            {nextRow ? `Next: ${nextRow.label}` : "Setup evidence is ready for strict review"}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            {nextRow?.next_action ?? liveUsability.next_action}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={readyRows === rows.length ? "pass" : "watch"} label={`${readyRows}/${rows.length} ready`} />
          <LaunchQueueBadge status={liveTradeCanary.actual_live_trade_tested ? "pass" : "fail"} label={liveTradeCanary.actual_live_trade_tested ? "trade tested" : "trade untested"} />
          <LaunchQueueBadge status={attempt.runnable_now ? "watch" : "fail"} label={attempt.runnable_now ? "canary runnable" : "canary blocked"} />
          <LaunchQueueBadge status="fail" label="wallet authority blocked" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <SettingsMetric label="Safe inputs" value={`${handoff.ready_count}/${handoff.inputs.length}`} />
        <SettingsMetric label="Live blockers" value={`${liveUsability.real_capital_blocker_count}`} />
        <SettingsMetric label="Canary" value={liveTradeCanary.actual_live_trade_tested ? "tested" : "not tested"} />
        <SettingsMetric label="Next surface" value={nextSurface} />
      </div>

      <div className="mt-3 rounded-md border border-engine/25 bg-surface-dim/35 p-2" aria-label="Settings first live canary attempt contract">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">First live canary attempt</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">{attempt.operator_action_label}</p>
            <p className="mt-1 text-[11px] leading-4 text-outline">
              This is the exact live-trade attempt contract. It is blocked until the wallet, Jupiter, signer, live flags, and proof gates are ready.
            </p>
          </div>
          <LaunchQueueBadge status={attempt.runnable_now ? "watch" : "fail"} label={attempt.stage.replaceAll("-", " ")} />
        </div>
        <div className="mt-2 grid gap-1.5">
          <Link
            href={attempt.primary_endpoint}
            className="truncate rounded-md border border-outline-variant/25 bg-void/20 px-2 py-1.5 text-[11px] font-semibold text-engine transition hover:border-engine/35"
          >
            {attempt.primary_endpoint}
          </Link>
          <code className="block overflow-x-auto whitespace-nowrap rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1.5 text-[11px] leading-5 text-on-surface-variant">
            {attempt.exact_next_command}
          </code>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <SettingsMetric label="Runnable now" value={attempt.runnable_now ? "yes" : "no"} />
          <SettingsMetric label="Missing inputs" value={`${attempt.missing_inputs.length}`} />
          <SettingsMetric label="Acknowledgements" value={`${attempt.required_acknowledgements.length}`} />
        </div>
        {attempt.missing_inputs.length > 0 ? (
          <p className="mt-2 text-[11px] leading-4 text-outline">
            Next missing input: {attempt.missing_inputs[0]}
          </p>
        ) : null}
      </div>

      <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.03] p-2" aria-label="Settings first canary operator unblock plan">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Operator unblock plan</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              {nextUnblockStep?.label ?? "No canary blocker is next"}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-outline">
              {nextUnblockStep?.action ?? "All first-canary unblock steps are clear; run the strict proof command before any autonomy review."}
            </p>
          </div>
          <LaunchQueueBadge status={firstCanaryUnblockBadgeStatus(nextUnblockStep?.status ?? "done")} label={nextUnblockStep?.status ?? "done"} />
        </div>
        <div className="mt-2 grid gap-2" aria-label="Settings ordered first canary unblock steps">
          {unblockSteps.map((step) => (
            <div key={step.id} className="grid min-w-0 gap-2 rounded-md border border-outline-variant/25 bg-void/20 p-2 sm:grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-on-surface">{step.label}</p>
                  <LaunchQueueBadge status={firstCanaryUnblockBadgeStatus(step.status)} label={step.status} />
                </div>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                  {step.phase.replaceAll("-", " ")}
                </p>
                <Link
                  href={step.safe_surface}
                  className="mt-1 inline-flex min-h-10 max-w-full items-center rounded-md px-1 text-[11px] font-semibold text-engine transition hover:text-engine/80"
                >
                  <span className="truncate">{step.safe_surface}</span>
                </Link>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] leading-4 text-on-surface-variant">{step.action}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">{step.completion_signal}</p>
                {step.command ? (
                  <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
                    {step.command}
                  </code>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {nextUnblockStep?.command ? (
          <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1.5 text-[11px] leading-5 text-on-surface-variant">
            {nextUnblockStep.command}
          </code>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.55fr)]">
        <div className="grid gap-2" aria-label="Settings Web3 live credential launchpad proof lanes">
          {rows.map((row) => (
            <div key={row.id} className="grid min-w-0 gap-2 rounded-md border border-outline-variant/25 bg-void/20 p-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-on-surface">{row.label}</p>
                  <LaunchQueueBadge status={launchpadBadgeStatus(row.status)} label={row.status} />
                </div>
                <p className="mt-1 text-[11px] leading-4 text-outline">{row.storage}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] leading-4 text-on-surface-variant">{row.detail}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">{row.next_action}</p>
              </div>
              <Link
                href={row.href}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline-variant/25 bg-surface-dim/45 px-2 py-1.5 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
              >
                Open
              </Link>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-2" aria-label="Settings Web3 live credential launchpad boundary">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Safety boundary</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">
            This launchpad accepts only public wallet scope, text-only wallet proof, ignored server-env provider keys, and external review status.
          </p>
          <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-outline">
            <li>Private keys and seed phrases are rejected.</li>
            <li>Raw transactions and signed payloads are not stored here.</li>
            <li>Live execution stays blocked until the canary proof records a real confirmed signature.</li>
          </ul>
          <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
            {strictVerifier}
          </code>
        </div>
      </div>
    </div>
  );
}

function buildSettingsWeb3LiveCredentialLaunchpadRows({
  credentialQueue,
  handoff,
  requestPacket,
  dedicatedWalletPacket,
  jupiterOrderPacket,
  signerPacket,
  liveUsability,
  liveTradeCanary,
}: {
  credentialQueue: CredentialQueueItem[];
  handoff: Web3OperatorCredentialHandoffReceipt;
  requestPacket: Web3OperatorRequestPacket;
  dedicatedWalletPacket: Web3DedicatedWalletPacket;
  jupiterOrderPacket: Web3JupiterOrderPacket;
  signerPacket: Web3SignerCredentialPacket;
  liveUsability: Web3LiveUsabilityBlockersReceipt;
  liveTradeCanary: Web3LiveTradeCanaryReceipt;
}): SettingsWeb3LaunchpadRow[] {
  const walletStatus = dedicatedWalletPacket.wallet_ownership_proved
    ? "ready"
    : dedicatedWalletPacket.dedicated_wallet_scoped
      ? "active"
      : "blocked";
  const jupiterStatus = jupiterOrderPacket.swap_v2_order_ready
    ? "ready"
    : jupiterOrderPacket.jupiter_configured && jupiterOrderPacket.dedicated_wallet_scoped
      ? "active"
      : "blocked";
  const signerStatus = signerPacket.status === "review-ready"
    ? "ready"
    : signerPacket.status === "needs-policy" || signerPacket.status === "needs-signer-request"
      ? "review"
      : "blocked";
  const blockerStatus = liveUsability.real_capital_blocker_count === 0
    ? "ready"
    : liveUsability.open_operator_input_count > 0
      ? "active"
      : "review";
  const canaryStatus = liveTradeCanary.actual_live_trade_tested
    ? "ready"
    : liveTradeCanary.status === "ready-for-external-signed-payload"
      ? "active"
      : "blocked";
  const packetNextInput = handoff.next_input ?? requestPacket.next_input;
  const nextInput = packetNextInput && !settingsWeb3LaunchpadInputAlreadyCovered(packetNextInput.id, {
    walletReady: walletStatus === "ready",
    dedicatedWalletReady: dedicatedWalletPacket.dedicated_wallet_scoped,
    jupiterReady: jupiterStatus === "ready",
  })
    ? packetNextInput
    : null;
  const nextCredential = credentialQueue.find((item) => item.status === "missing" || item.status === "blocked" || item.status === "review");

  return [
    {
      id: "next-safe-input",
      label: nextInput?.label ?? nextCredential?.label ?? "Strict verifier review",
      status: nextInput || nextCredential ? "active" : "ready",
      detail: nextInput?.secret_handling ?? nextCredential?.detail ?? "All safe credential lanes have current evidence.",
      next_action: nextInput?.next_action ?? nextCredential?.action ?? "Run strict verification before any live review.",
      storage: nextInput
        ? `${nextInput.safe_collection_surface.replaceAll("-", " ")} · ${nextInput.storage.replaceAll("-", " ")}`
        : nextCredential?.storage ?? "status-only receipt",
      href: nextInput ? settingsWeb3LaunchpadHrefForInput(nextInput) : "#web3-credential-action-console",
      command: nextInput?.verifier_command ?? requestPacket.verifier_commands[0] ?? null,
    },
    {
      id: "wallet-proof",
      label: "Wallet proof",
      status: walletStatus,
      detail: dedicatedWalletPacket.summary,
      next_action: dedicatedWalletPacket.next_action,
      storage: "public address plus hash-only text signature",
      href: "#settings-web3-wallet-public-key",
      command: dedicatedWalletPacket.strict_verifier_command,
    },
    {
      id: "jupiter-order-proof",
      label: "Jupiter order proof",
      status: jupiterStatus,
      detail: jupiterOrderPacket.summary,
      next_action: jupiterOrderPacket.next_action,
      storage: "server env or one-shot key; transaction bytes withheld",
      href: "#web3-credential-action-console",
      command: jupiterOrderPacket.strict_verifier_command,
    },
    {
      id: "signer-custody-proof",
      label: "Signer and custody",
      status: signerStatus,
      detail: signerPacket.summary,
      next_action: signerPacket.next_action,
      storage: signerPacket.credential_storage_permission.replaceAll("-", " "),
      href: "/api/web3-signer-credential-packet?source=live-dex&account=persistent",
      command: null,
    },
    {
      id: "live-blocker-proof",
      label: "Live blocker board",
      status: blockerStatus,
      detail: liveUsability.summary,
      next_action: liveUsability.next_action,
      storage: "redacted readiness receipts only",
      href: "/api/web3-live-usability-blockers?source=live-dex&account=persistent&rows=all",
      command: "npm run verify:web3 -- --base-url=http://localhost:4010",
    },
    {
      id: "tiny-canary-proof",
      label: "Tiny canary proof",
      status: canaryStatus,
      detail: liveTradeCanary.actual_live_trade_tested
        ? "A live canary signature has been recorded and can be reviewed."
        : "No funded live trade has been tested by this app yet.",
      next_action: liveTradeCanary.next_action,
      storage: "signed payload bytes are hashed, not echoed or stored",
      href: "/trading?source=live-dex&account=persistent&scenario=breakout&cycles=0",
      command: null,
    },
  ];
}

function launchpadBadgeStatus(status: SettingsWeb3LaunchpadRow["status"]) {
  if (status === "ready") return "pass";
  if (status === "active" || status === "review") return "watch";
  return "fail";
}

function firstCanaryUnblockBadgeStatus(status: Web3FirstCanaryDrillReceipt["operator_unblock_plan"][number]["status"]) {
  if (status === "done") return "pass";
  if (status === "next" || status === "watch") return "watch";
  return "fail";
}

function settingsWeb3LaunchpadHrefForInput(input: Web3OperatorRequestPacket["next_input"]) {
  if (!input) return "#web3-credential-action-console";
  if (input.id === "dedicated-trading-wallet") return "#settings-web3-wallet-public-key";
  if (input.id === "wallet-ownership-proof") return "#web3-credential-action-console";
  if (input.safe_collection_surface === "manual-review") return "/api/web3-manual-live-review-packet?source=live-dex&account=persistent";
  if (input.safe_collection_surface === "external-system") return "/api/web3-operator-request-packet?source=live-dex&account=persistent";
  return "#web3-credential-action-console";
}

function settingsWeb3LaunchpadInputAlreadyCovered(
  id: string,
  status: { walletReady: boolean; dedicatedWalletReady: boolean; jupiterReady: boolean },
) {
  if (id === "dedicated-trading-wallet") return status.dedicatedWalletReady;
  if (id === "wallet-ownership-proof") return status.walletReady;
  if (id === "jupiter-route-order-key") return status.jupiterReady;
  return false;
}

function SettingsWeb3SetupPriorityCard({
  liveUsability,
  requestPacket,
  researchPacket,
  credentialRequirements,
  firstCanaryDrill,
}: {
  liveUsability: Web3LiveUsabilityBlockersReceipt;
  requestPacket: Web3OperatorRequestPacket;
  researchPacket: Web3ResearchHandoffPacket;
  credentialRequirements: Web3CredentialRequirementsReceipt;
  firstCanaryDrill: Web3FirstCanaryDrillReceipt;
}) {
  const nextInput = requestPacket.next_input;
  const nextUnlock = liveUsability.next_unlock_step ?? requestPacket.next_unlock_step;
  const nextBlocker = liveUsability.next_blocker;
  const nextCredentialRequest = liveUsability.next_credential_request;
  const nextCanaryStep = firstCanaryDrill.next_unblock_step;
  const canarySurface = nextCanaryStep?.safe_surface ?? nextCredentialRequest?.fix_href ?? "/trading?source=live-dex&account=persistent";
  const canarySurfaceHref = canarySurface.startsWith("/") ? canarySurface : "/settings/integrations#settings-web3-credentials-runway";
  const canaryCommand = nextCanaryStep?.command ?? nextCredentialRequest?.verifier_command ?? firstCanaryDrill.strict_ready_command;
  const neededRequirements = credentialRequirements.requirements
    .filter((item) => item.priority === "needed-now")
    .slice(0, 4);
  const verifier = nextInput?.verifier_command ??
    requestPacket.verifier_commands.find((command) => command.includes("verify:web3")) ??
    "npm run verify:web3 -- --base-url=http://localhost:4010";

  return (
    <section
      aria-label="Settings Web3 setup priority"
      className="rounded-md border border-engine/35 bg-engine/[0.055] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Web3 setup priority</p>
          <h2 className="mt-1 text-lg font-semibold text-on-surface">
            {nextInput ? `Next: ${nextInput.label}` : nextUnlock ? `Next: ${nextUnlock.label}` : "Web3 setup is ready for review"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            {nextInput?.next_action ?? nextUnlock?.next_action ?? liveUsability.next_action}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={liveUsability.open_operator_input_count > 0 ? "fail" : "watch"} label={`${liveUsability.open_operator_input_count} inputs`} />
          <LaunchQueueBadge status={liveUsability.real_capital_blocker_count > 0 ? "fail" : "watch"} label={`${liveUsability.real_capital_blocker_count} blockers`} />
          <LaunchQueueBadge status="fail" label="live blocked" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <SettingsMetric label="Live lanes" value={`${liveUsability.ready_live_lane_count}/${liveUsability.total_live_lane_count}`} />
        <SettingsMetric label="Rows listed" value={`${liveUsability.listed_live_usability_row_count}/${liveUsability.total_live_usability_row_count}`} />
        <SettingsMetric label="Research questions" value={`${researchPacket.research_questions.length}`} />
        <SettingsMetric label="Verifier" value={verifier.includes("--require-operator-wallet") ? "wallet gate" : "base gate"} />
      </div>

      <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.035] p-3" aria-label="Settings first funded canary handoff">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">First funded canary handoff</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {nextCanaryStep ? nextCanaryStep.label : firstCanaryDrill.status.replaceAll("-", " ")}
            </p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              {nextCanaryStep?.action ?? firstCanaryDrill.next_action}
            </p>
          </div>
          <LaunchQueueBadge status={firstCanaryDrill.actual_live_trade_tested ? "pass" : "fail"} label={firstCanaryDrill.actual_live_trade_tested ? "live proven" : "not proven"} />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <SettingsMetric label="Stage" value={firstCanaryDrill.status.replaceAll("-", " ")} />
          <SettingsMetric label="Proof" value={`${firstCanaryDrill.proof_pass_count}/${firstCanaryDrill.proof_required_count}`} />
          <SettingsMetric label="Hard fails" value={`${firstCanaryDrill.hard_fail_count}`} />
          <SettingsMetric label="Needed now" value={`${credentialRequirements.needed_now_count}`} />
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.58fr)]">
          <div className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe to provide next</p>
            <div className="mt-2 grid gap-1.5">
              {neededRequirements.map((requirement) => (
                <div key={requirement.id} className="rounded-md border border-outline-variant/20 bg-black/10 p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-[11px] font-semibold text-on-surface">{requirement.label}</p>
                    <LaunchQueueBadge status={requirement.blocks_live_capital ? "fail" : "watch"} label={requirement.owner} />
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-outline">{requirement.safe_value_type}</p>
                  <p className="mt-1 text-[10px] leading-4 text-on-surface-variant">{requirement.next_action}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Never paste</p>
            <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-outline">
              {credentialRequirements.never_provide.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)]">
          <Link
            href={canarySurfaceHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-sm font-semibold text-caution transition hover:bg-caution/15"
          >
            Open canary step
            <ExternalLink aria-hidden="true" className="size-4" />
          </Link>
          <code className="block overflow-x-auto whitespace-nowrap rounded-md border border-outline-variant/20 bg-black/20 px-2 py-2 text-[11px] leading-5 text-on-surface-variant">
            {canaryCommand}
          </code>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-outline">
          This handoff is the operator checklist for the first real canary only; it cannot sign, submit, save signed payloads, custody funds, or enable autonomous live trading.
        </p>
      </div>

      {nextBlocker ? (
        <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.025] p-3" aria-label="Settings Web3 priority next dependency blocker">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Next dependency blocker</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{nextBlocker.label}</p>
            </div>
            <LaunchQueueBadge status={nextBlocker.status === "needed" || nextBlocker.status === "watch" || nextBlocker.status === "review" ? "watch" : "fail"} label={nextBlocker.status} />
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{nextBlocker.next_action}</p>
          <p className="mt-1 truncate text-[11px] leading-4 text-outline">
            {nextBlocker.owner.replaceAll("-", " ")} · {nextBlocker.source.replaceAll("-", " ")} · {nextBlocker.blocks_live_capital ? "blocks live capital" : "review item"}
          </p>
          <Link
            href={nextBlocker.href}
            className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md border border-critical/30 bg-critical/10 px-3 py-2 text-xs font-semibold text-critical transition hover:bg-critical/15"
          >
            Open blocker control
          </Link>
          {nextBlocker.safe_command ? (
            <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {nextBlocker.safe_command}
            </code>
          ) : null}
        </div>
      ) : null}

      {nextCredentialRequest ? (
        <div className="mt-3 rounded-md border border-engine/25 bg-surface-dim/30 p-3" aria-label="Settings Web3 priority next credential request">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Next credential request</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{nextCredentialRequest.label}</p>
            </div>
            <LaunchQueueBadge status={nextCredentialRequest.can_enter_in_app ? "watch" : "fail"} label={nextCredentialRequest.can_enter_in_app ? "safe in app" : "external"} />
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{nextCredentialRequest.safe_value_description}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Surface</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">{nextCredentialRequest.safe_collection_surface.replaceAll("-", " ")}</p>
            </div>
            <div className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Storage</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">{nextCredentialRequest.storage.replaceAll("-", " ")}</p>
            </div>
          </div>
          <Link
            href={nextCredentialRequest.fix_href}
            className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md border border-engine/30 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine transition hover:bg-engine/15"
          >
            Open request surface
          </Link>
          {nextCredentialRequest.verifier_command ? (
            <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {nextCredentialRequest.verifier_command}
            </code>
          ) : null}
          <div className="mt-2 rounded-md border border-outline-variant/20 bg-void/20 p-2" aria-label="Settings Web3 priority credential completion criteria">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Done when</p>
            <ul className="mt-1 grid gap-1 text-[10px] leading-4 text-outline">
              {nextCredentialRequest.completion_criteria.slice(0, 3).map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ul>
          </div>
          <div className="mt-2 grid gap-1.5" aria-label="Settings Web3 priority credential verification runway">
            {nextCredentialRequest.verification_runway.slice(0, 3).map((step, index) => (
              <div key={step.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border border-outline-variant/20 bg-void/20 p-2">
                <span className="flex size-5 items-center justify-center rounded-md border border-outline-variant/25 bg-black/20 text-[10px] font-semibold text-outline">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-on-surface">{step.label}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-outline">{step.next_action}</p>
                  {step.command ? (
                    <code className="mt-1 block break-all text-[10px] leading-4 text-outline">{step.command}</code>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
        <div className="rounded-md border border-outline-variant/25 bg-surface-dim/35 p-2" aria-label="Settings Web3 priority next verifier">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">After the next input</p>
          <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
            {verifier}
          </code>
        </div>
        <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-2" aria-label="Settings Web3 priority boundary">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Never here</p>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">
            Private keys, seed phrases, raw keypairs, signed payloads, and live trading approval stay outside Settings.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="#settings-web3-wallet-public-key"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15"
        >
          <WalletCards aria-hidden="true" className="size-4" />
          Go to wallet field
        </Link>
        <Link
          href="#settings-web3-credentials-runway"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-outline-variant/35 bg-black/15 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:bg-black/25"
        >
          <KeyRound aria-hidden="true" className="size-4" />
          Open Web3 runway
        </Link>
        <Link
          href="#settings-web3-research-handoff"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-violet/35 bg-violet/10 px-3 py-2 text-sm font-semibold text-violet transition hover:bg-violet/15"
        >
          <PlugZap aria-hidden="true" className="size-4" />
          Send research packet
        </Link>
        <Link
          href="/trading?source=live-dex"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-sm font-semibold text-caution transition hover:bg-caution/15"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          Open Live DEX read
        </Link>
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        This first-screen card is navigation and status only. It cannot save secrets, sign, submit, mutate wallets, custody funds, or unlock autonomous live trading.
      </p>
    </section>
  );
}

function SettingsWeb3LiveTradeCanaryPanel({ receipt }: { receipt: Web3LiveTradeCanaryReceipt }) {
  const canaryEndpoint = `/api/web3-live-trade-canary?source=${receipt.source}&account=${receipt.account}&scenario=${receipt.scenario}&cycles=0`;
  const unsignedHandoffEndpoint = `/api/web3-live-unsigned-order-handoff?source=live-dex&account=persistent&scenario=${receipt.scenario}&cycles=0`;

  return (
    <section
      aria-label="Settings Web3 live trade canary"
      className="rounded-md border border-critical/35 bg-critical/[0.035] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Live trade canary</p>
          <h2 className="mt-1 text-lg font-semibold text-on-surface">
            Actual live trade tested: {receipt.actual_live_trade_tested ? "yes" : "no"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">{receipt.next_action}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={receipt.actual_live_trade_tested ? "pass" : "fail"} label={receipt.status.replaceAll("-", " ")} />
          <LaunchQueueBadge status={receipt.can_submit_from_app_now ? "watch" : "fail"} label={receipt.can_submit_from_app_now ? "external payload ready" : "submit blocked"} />
          <LaunchQueueBadge status="watch" label="unsigned handoff gated" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <SettingsMetric label="Live gate" value={receipt.live_execution_gate_enabled ? "enabled" : "locked"} />
        <SettingsMetric label="Relay" value={receipt.signed_relay_status.replaceAll("-", " ")} />
        <SettingsMetric label="Request" value={receipt.current_request_id ?? "none"} />
        <SettingsMetric label="Signature" value={receipt.latest_signature_preview ?? "none"} />
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/35 p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Current blocker</p>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">{receipt.blockers[0] ?? "No blocker reported."}</p>
        <p className="mt-2 text-[11px] leading-4 text-outline">
          Paper, DEX-read, and Jupiter rehearsal checks do not count as live trades. This panel only turns green after live relay evidence records a real signature.
        </p>
      </div>

      <div className="mt-3 rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings post-signing proof chain">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Post-signing proof chain</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              {receipt.post_signing_evidence_status.replaceAll("-", " ")}
            </p>
          </div>
          <LaunchQueueBadge
            status={receipt.post_signing_evidence.every((item) => item.status === "pass") ? "pass" : receipt.latest_signature_preview ? "watch" : "fail"}
            label={`${receipt.post_signing_evidence.filter((item) => item.status === "pass").length}/${receipt.post_signing_evidence.length} proven`}
          />
        </div>
        <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
          {receipt.post_signing_next_action}
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {receipt.post_signing_evidence.map((item) => (
            <div key={item.id} className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                <LaunchQueueBadge status={item.status} label={item.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{item.detail}</p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-outline">{item.next_action}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/35 p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Tiny unsigned order handoff</p>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">
          POST can build a one-shot SOL-to-USDC Jupiter canary transaction for browser-wallet signing only after live env flags, source=live-dex, account=persistent, a dedicated public wallet, and explicit unsigned-return acknowledgement are present.
        </p>
        <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
          {`POST ${unsignedHandoffEndpoint} {"operator_ack":true,"canary_ack":"I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED","return_unsigned_transaction_ack":true,"wallet_public_key":"<public-solana-address>","amount_lamports":100000}`}
        </code>
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/35 p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">External signed-payload action</p>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">
          POST can attempt only a matching external signed payload after live-dex, persistent account, operator acknowledgement, canary acknowledgement, request id, and live env gates are ready.
        </p>
        <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
          {`POST ${canaryEndpoint} {"operator_ack":true,"canary_ack":"I_UNDERSTAND_THIS_CAN_MOVE_REAL_FUNDS","request_id":"<current-request-id>","route":"jupiter-swap-v2","signed_transaction":"<external-signed-base64>"}`}
        </code>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={canaryEndpoint}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-outline-variant/30 bg-surface-dim/45 px-2 text-xs font-semibold text-on-surface-variant transition hover:border-critical/35 hover:text-critical"
        >
          Open canary JSON
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </Link>
        <Badge variant="outline" className="border-outline-variant/40 bg-surface-dim/45 text-outline">
          unsigned tx {receipt.unsigned_transaction_return}
        </Badge>
        <Badge variant="outline" className="border-outline-variant/40 bg-surface-dim/45 text-outline">
          wallet mutation {receipt.wallet_mutation_permission}
        </Badge>
      </div>
    </section>
  );
}

function SettingsWeb3LiveActivationPlanPanel({ plan }: { plan: Web3LiveActivationPlan }) {
  const nextMilestone = plan.next_milestone;
  const topMilestones = plan.milestones.slice(0, 5);
  const intakeEndpoint = `/api/web3-live-activation-intake?source=${plan.source}&account=${plan.account}&scenario=${plan.scenario}&cycles=0`;

  return (
    <section
      aria-label="Settings Web3 live activation plan"
      className="rounded-md border border-caution/35 bg-caution/[0.045] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Live activation plan</p>
          <h2 className="mt-1 text-lg font-semibold text-on-surface">
            {nextMilestone ? `Next: ${nextMilestone.label}` : plan.status.replaceAll("-", " ")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">{plan.summary}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={plan.activation_permitted ? "pass" : "fail"} label="activation blocked" />
          <LaunchQueueBadge status={plan.can_trade_real_capital ? "pass" : "fail"} label="real capital blocked" />
          <LaunchQueueBadge status={plan.live_execution_permitted ? "pass" : "fail"} label="live execution blocked" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <SettingsMetric label="Activation" value={plan.status.replaceAll("-", " ")} />
        <SettingsMetric label="Final gate" value={`${plan.readiness_score}/100`} />
        <SettingsMetric label="Milestones" value={`${plan.milestone_count}`} />
        <SettingsMetric label="Blockers" value={`${plan.real_capital_blocker_count}`} />
      </div>

      {nextMilestone ? (
        <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.025] p-3" aria-label="Settings Web3 live activation next milestone">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Next milestone</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{nextMilestone.label}</p>
            </div>
            <LaunchQueueBadge status={nextMilestone.status === "ready" ? "pass" : nextMilestone.status === "watch" || nextMilestone.status === "external-review" ? "watch" : "fail"} label={nextMilestone.status.replaceAll("-", " ")} />
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{nextMilestone.next_action}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <SettingsMetric label="Owner" value={nextMilestone.owner.replaceAll("-", " ")} />
            <SettingsMetric label="Surface" value={nextMilestone.safe_collection_surface.replaceAll("-", " ")} />
            <SettingsMetric label="Targets" value={nextMilestone.target_names.join(", ") || "none"} />
          </div>
          {nextMilestone.verifier_command ? (
            <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {nextMilestone.verifier_command}
            </code>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2" aria-label="Settings Web3 live activation milestones">
        {topMilestones.map((milestone, index) => (
          <div key={milestone.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2 rounded-md border border-outline-variant/25 bg-surface-dim/30 p-2">
            <span className="flex size-6 items-center justify-center rounded-md border border-outline-variant/30 bg-surface text-[10px] font-semibold text-outline">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-on-surface">{milestone.label}</p>
              <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-outline">{milestone.completion_signal}</p>
            </div>
            <LaunchQueueBadge status={milestone.status === "ready" ? "pass" : milestone.status === "watch" || milestone.status === "external-review" ? "watch" : "fail"} label={milestone.status.replaceAll("-", " ")} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyRedactedPacketButton text={plan.text_packet} label="Copy activation plan" ariaLabel="Copy Web3 live activation plan" />
        <Link
          href={plan.source_endpoint}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-outline-variant/30 bg-surface-dim/45 px-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
        >
          Open JSON
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </Link>
        <Link
          href={intakeEndpoint}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-caution/35 bg-caution/10 px-2 text-xs font-semibold text-caution transition hover:bg-caution/15"
        >
          Open intake schema
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/35 p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe activation intake</p>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">
          Validate public wallet scope, readiness statuses, signer mode, ops/accounting status, and risk caps without accepting secrets or unlocking live wallet authority.
        </p>
        <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
          {`POST ${intakeEndpoint} {"operator_ack":true,"wallet_public_key":"<public-solana-address>","wallet_ownership_proof":"planned"}`}
        </code>
      </div>

      <p className="mt-3 text-xs leading-5 text-outline">
        This plan is a coordination packet only. It cannot sign, submit, custody funds, mutate wallets, store private keys, store seed phrases, echo secrets, or unlock autonomous live trading.
      </p>
    </section>
  );
}

function SettingsWeb3CredentialCommandCenter({
  handoff,
  requestPacket,
  runbook,
  cutover,
}: {
  handoff: Web3OperatorCredentialHandoffReceipt;
  requestPacket: Web3OperatorRequestPacket;
  runbook: Web3OperatorRunbookReceipt;
  cutover: Web3CutoverBlockerBoard;
}) {
  const nextInput = handoff.next_input ?? requestPacket.next_input;
  const safeSettingsInputs = handoff.inputs
    .filter((input) => input.can_enter_in_app && input.status !== "ready")
    .slice(0, 4);
  const externalOnlyInputs = handoff.inputs
    .filter((input) => !input.can_enter_in_app || input.safe_collection_surface === "external-system" || input.safe_collection_surface === "manual-review")
    .filter((input) => input.status !== "ready")
    .slice(0, 4);
  const primaryAction = runbook.primary_safe_action;
  const strictVerifier = requestPacket.verifier_commands.find((command) => command.includes("--require-operator-wallet")) ??
    runbook.verifier_commands.find((command) => command.includes("verify:web3")) ??
    "npm run verify:web3 -- --base-url=http://localhost:4010";
  return (
    <div className="rounded-md border border-engine/35 bg-engine/[0.055] p-3" aria-label="Settings Web3 credential command center">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Credential command center</p>
          <p className="mt-1 text-base font-semibold text-on-surface">
            {nextInput ? `Do next: ${nextInput.label}` : "Credential lanes are ready for strict verifier review"}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            {nextInput?.next_action ?? runbook.next_live_lane_action}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={handoff.open_required_count > 0 ? "fail" : "watch"} label={`${handoff.open_required_count} required open`} />
          <LaunchQueueBadge status={runbook.allowed_now_count > 0 ? "pass" : "watch"} label={`${runbook.allowed_now_count} safe now`} />
          <LaunchQueueBadge status="fail" label="live blocked" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <SettingsMetric label="Ready lanes" value={`${handoff.ready_count}/${handoff.inputs.length}`} />
        <SettingsMetric label="Need now" value={`${cutover.now_count}`} />
        <SettingsMetric label="Before live" value={`${cutover.before_live_count}`} />
        <SettingsMetric label="Review gates" value={`${cutover.review_count}`} />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-engine/25 bg-surface-dim/30 p-2" aria-label="Settings safe credential entry lanes">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Safe in Settings</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">Public or server-env setup only</p>
            </div>
            <LaunchQueueBadge status={safeSettingsInputs.length > 0 ? "watch" : "pass"} label={`${safeSettingsInputs.length} open`} />
          </div>
          <div className="mt-2 grid gap-2">
            {(safeSettingsInputs.length > 0 ? safeSettingsInputs : handoff.inputs.filter((input) => input.can_enter_in_app).slice(0, 2)).map((input) => (
              <div key={input.id} className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
                <p className="text-xs font-semibold text-on-surface">{input.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">{input.storage.replaceAll("-", " ")} · {input.safe_collection_surface.replaceAll("-", " ")}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-caution/25 bg-caution/[0.035] p-2" aria-label="Settings external-only Web3 credential lanes">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">External or review only</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">Signer, settlement, and live approval stay outside the app</p>
            </div>
            <LaunchQueueBadge status={externalOnlyInputs.length > 0 ? "fail" : "watch"} label={`${externalOnlyInputs.length} open`} />
          </div>
          <div className="mt-2 grid gap-2">
            {(externalOnlyInputs.length > 0 ? externalOnlyInputs : requestPacket.review_inputs.slice(0, 2)).map((input) => (
              <div key={input.id} className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
                <p className="text-xs font-semibold text-on-surface">{input.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">{input.storage.replaceAll("-", " ")} · {input.safe_collection_surface.replaceAll("-", " ")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
        <div className="rounded-md border border-outline-variant/25 bg-black/15 p-2" aria-label="Settings credential strict verifier command">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Strict verifier path</p>
          <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
            {strictVerifier}
          </code>
          <p className="mt-2 text-[11px] leading-4 text-outline">
            Primary safe action: {primaryAction?.label ?? "review setup"} · {primaryAction?.status ?? "gated"}.
          </p>
        </div>
        <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-2" aria-label="Settings credential never-provide boundary">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Never provide</p>
          <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-on-surface-variant">
            {handoff.never_request.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/api/web3-operator-request-packet?source=live-dex&account=persistent"
          className="inline-flex min-h-10 items-center rounded-md px-2 text-xs font-semibold text-engine hover:text-engine/80"
        >
          Open share packet
        </Link>
        <Link
          href="/api/web3-operator-runbook?source=live-dex&account=persistent"
          className="inline-flex min-h-10 items-center rounded-md px-2 text-xs font-semibold text-violet hover:text-violet/80"
        >
          Open runbook
        </Link>
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        The command center is a safe-entry map only; it cannot store private keys, store seed phrases, sign, submit, mutate wallets, or approve autonomous live trading.
      </p>
    </div>
  );
}

function SettingsWeb3OperatorUnlockSequence({ usability }: { usability: Web3UsabilityStatusReceipt }) {
  const sequence = usability.operator_unlock_sequence;
  const nextStep = sequence.find((step) => step.status !== "ready") ?? sequence[sequence.length - 1];
  const readyCount = sequence.filter((step) => step.status === "ready").length;
  return (
    <div className="rounded-md border border-engine/30 bg-engine/[0.04] p-3" aria-label="Settings Web3 operator unlock sequence">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Operator unlock sequence</p>
          <p className="mt-1 text-base font-semibold text-on-surface">
            {nextStep ? `Next in order: ${nextStep.label}` : "Unlock sequence is ready for review"}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            Wallet scope comes before wallet proof, Jupiter rehearsal, signer review, ops/accounting, and external live review. This is the same ordered receipt shown in the trading cockpit.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={readyCount === sequence.length ? "pass" : "watch"} label={`${readyCount}/${sequence.length} ready`} />
          <LaunchQueueBadge status="fail" label="live blocked" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3" aria-label="Settings Web3 ordered unlock steps">
        {sequence.map((step, index) => (
          <div key={step.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Step {index + 1}</p>
                <p className="mt-1 truncate text-sm font-semibold text-on-surface">{step.label}</p>
              </div>
              <LaunchQueueBadge status={settingsOperatorUnlockBadgeStatus(step.status)} label={step.status} />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">{step.next_action}</p>
            <p className="mt-2 truncate text-[11px] leading-4 text-outline">{step.storage.replaceAll("-", " ")}</p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        Ordered unlock steps expose public, env-target, hash-only, or external-review work only. Private keys, seed phrases, raw keypairs, transaction bodies, signed payloads, signing, submission, wallet mutation, and autonomous live trading remain blocked.
      </p>
    </div>
  );
}

function SettingsWeb3OperatorSetupRunway({
  handoff,
  requestPacket,
  runbook,
  liveUsability,
}: {
  handoff: Web3OperatorCredentialHandoffReceipt;
  requestPacket: Web3OperatorRequestPacket;
  runbook: Web3OperatorRunbookReceipt;
  liveUsability: Web3LiveUsabilityBlockersReceipt;
}) {
  const steps = buildSettingsOperatorSetupRunwaySteps(handoff, requestPacket, runbook, liveUsability);
  const activeStep = steps.find((step) => step.status !== "ready") ?? steps[steps.length - 1];
  const readyCount = steps.filter((step) => step.status === "ready").length;
  const safeActionCount = steps.filter((step) => step.status === "ready" || step.status === "active").length;
  return (
    <div className="rounded-md border border-engine/30 bg-surface-dim/35 p-3" aria-label="Settings Web3 operator setup runway">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Setup runway</p>
          <p className="mt-1 text-base font-semibold text-on-surface">
            {activeStep ? `Next: ${activeStep.label}` : "Setup runway is ready for review"}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            A short operator path from safe credential inputs to dry-run proof and external live review. It uses existing receipts only; it cannot collect wallet secrets or grant live authority.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={readyCount === steps.length ? "pass" : "watch"} label={`${readyCount}/${steps.length} ready`} />
          <LaunchQueueBadge status={safeActionCount > 0 ? "pass" : "watch"} label={`${safeActionCount} safe actions`} />
          <LaunchQueueBadge status="fail" label="live blocked" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4" aria-label="Settings Web3 setup runway metrics">
        <SettingsMetric label="Open inputs" value={`${handoff.open_required_count}`} />
        <SettingsMetric label="Real blockers" value={`${liveUsability.real_capital_blocker_count}`} />
        <SettingsMetric label="Rows listed" value={`${liveUsability.listed_live_usability_row_count}/${liveUsability.total_live_usability_row_count}`} />
        <SettingsMetric label="Live lanes" value={`${liveUsability.ready_live_lane_count}/${liveUsability.total_live_lane_count}`} />
      </div>

      <ol className="mt-3 grid gap-2" aria-label="Settings Web3 next three safe steps">
        {steps.map((step, index) => (
          <li key={step.id} className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Step {index + 1}</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">{step.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">{step.storage_rule}</p>
              </div>
              <LaunchQueueBadge status={settingsSetupRunwayBadgeStatus(step.status)} label={step.status} />
            </div>
            <p className="mt-2 text-xs leading-5 text-on-surface-variant">{step.next_action}</p>
            {step.command ? (
              <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
                {step.command}
              </code>
            ) : step.href ? (
              <Link
                href={step.href}
                className="mt-2 inline-flex min-h-10 items-center rounded-md px-2 text-xs font-semibold text-engine hover:text-engine/80"
              >
                Open safe surface
              </Link>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.72fr)]">
        <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings Web3 runway verifier">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Verifier after each change</p>
          <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
            {requestPacket.verifier_commands[0] ?? runbook.verifier_commands[0] ?? "npm run verify:web3 -- --base-url=http://localhost:4010"}
          </code>
        </div>
        <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-2" aria-label="Settings Web3 runway never provide">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Never provide</p>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
            {liveUsability.never_provide.slice(0, 3).join(" · ")}
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        Setup runway is a guide only. Private keys, seed phrases, transaction bodies, signed payloads, signing, submission, wallet mutation, and autonomous live trading stay blocked.
      </p>
    </div>
  );
}

function SettingsWeb3LiveUsabilityBlockersPanel({ receipt }: { receipt: Web3LiveUsabilityBlockersReceipt }) {
  const topMissing = receipt.missing_for_live_usability.slice(0, 4);
  const safeActions = receipt.safe_next_actions.slice(0, 3);
  const ownerSummary = receipt.missing_owner_summary.slice(0, 4);
  const sourceSummary = receipt.missing_source_summary.slice(0, 4);
  return (
    <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-3" aria-label="Settings Web3 live usability blockers">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">What is left for real money</p>
          <p className="mt-1 text-base font-semibold text-on-surface">{receipt.status.replaceAll("-", " ")}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">{receipt.summary}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={receipt.open_operator_input_count > 0 ? "fail" : "watch"} label={`${receipt.open_operator_input_count} inputs`} />
          <LaunchQueueBadge status={receipt.failed_or_watch_signoff_count > 0 ? "fail" : "watch"} label={`${receipt.failed_or_watch_signoff_count} signoffs`} />
          <LaunchQueueBadge status="fail" label="live blocked" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SettingsMetric label="Capital blockers" value={`${receipt.real_capital_blocker_count}`} />
        <SettingsMetric label="Rows listed" value={`${receipt.listed_live_usability_row_count}/${receipt.total_live_usability_row_count}`} />
        <SettingsMetric label="Live lanes" value={`${receipt.ready_live_lane_count}/${receipt.total_live_lane_count}`} />
        <SettingsMetric label="Signoffs" value={`${receipt.passed_signoff_count}/${receipt.required_signoff_count}`} />
        <SettingsMetric label="Safe actions" value={`${receipt.safe_action_count}`} />
        <SettingsMetric label="Doctor" value={receipt.credential_doctor.receipt_fresh ? "fresh" : "stale"} />
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/30 p-2" aria-label="Settings live usability credential doctor summary">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Credential doctor</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              {receipt.credential_doctor.status.replaceAll("-", " ")} · {receipt.credential_doctor.ready_count} ready · {receipt.credential_doctor.blocked_count} blocked
            </p>
          </div>
          <LaunchQueueBadge
            status={receipt.credential_doctor.status === "absent" || receipt.credential_doctor.blocked_count > 0 ? "fail" : receipt.credential_doctor.receipt_fresh ? "pass" : "watch"}
            label={receipt.credential_doctor.receipt_fresh ? "fresh" : "refresh"}
          />
        </div>
        <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{receipt.credential_doctor.next_action}</p>
        <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
          {receipt.credential_doctor.safe_command}
        </code>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2" aria-label="Settings Web3 blocker owner and evidence summary">
        <div className="rounded-md border border-outline-variant/25 bg-surface-dim/30 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Owner split</p>
          <div className="mt-2 grid gap-1">
            {ownerSummary.map((item) => (
              <p key={item.owner} className="flex min-w-0 items-center justify-between gap-2 text-[11px] leading-4 text-on-surface-variant">
                <span className="truncate capitalize">{item.owner.replaceAll("-", " ")}</span>
                <span className="shrink-0 font-semibold text-on-surface">{item.missing_count}</span>
              </p>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-surface-dim/30 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Evidence split</p>
          <div className="mt-2 grid gap-1">
            {sourceSummary.map((item) => (
              <p key={item.source} className="flex min-w-0 items-center justify-between gap-2 text-[11px] leading-4 text-on-surface-variant">
                <span className="truncate capitalize">{item.source.replaceAll("-", " ")}</span>
                <span className="shrink-0 font-semibold text-on-surface">{item.missing_count}</span>
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)]">
        <div className="rounded-md border border-critical/25 bg-surface-dim/30 p-2" aria-label="Settings real-money missing rows">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Missing before review</p>
          <div className="mt-2 grid gap-2">
            {topMissing.length > 0 ? topMissing.map((item) => (
              <div key={item.id} className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                      {item.owner.replaceAll("-", " ")} · {item.source.replaceAll("-", " ")}
                    </p>
                  </div>
                  <LaunchQueueBadge status={item.status === "needed" || item.status === "watch" || item.status === "review" ? "watch" : "fail"} label={item.status} />
                </div>
                <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.next_action}</p>
              </div>
            )) : (
              <p className="rounded-md border border-outline-variant/20 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant">
                No missing rows are listed, but live execution still waits for external executor review.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          {receipt.next_unlock_step ? (
            <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings live usability next unlock step">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Next unlock step</p>
                <LaunchQueueBadge status={settingsOperatorUnlockBadgeStatus(receipt.next_unlock_step.status)} label={receipt.next_unlock_step.status} />
              </div>
              <p className="mt-1 text-xs font-semibold text-on-surface">{receipt.next_unlock_step.label}</p>
              <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">{receipt.next_unlock_step.next_action}</p>
              <p className="mt-1 truncate text-[11px] leading-4 text-outline">{receipt.next_unlock_step.storage.replaceAll("-", " ")}</p>
            </div>
          ) : null}
          <div className="rounded-md border border-caution/25 bg-caution/[0.035] p-2" aria-label="Settings live usability next action">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next safe action</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{receipt.next_action}</p>
          </div>
          <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings live usability safe actions">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Can do safely</p>
            <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-on-surface-variant">
              {safeActions.map((action) => (
                <li key={action.id}>
                  <span className="font-semibold text-on-surface">{action.label}</span>
                  <span className="text-outline"> · {action.status}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link
            href="/api/web3-live-usability-blockers?source=live-dex&account=persistent&rows=all"
            className="inline-flex min-h-10 items-center rounded-md px-2 text-xs font-semibold text-critical hover:text-critical/80"
          >
            Open all blockers JSON
          </Link>
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        This is a readiness receipt only. It cannot sign, submit, custody funds, mutate wallets, echo secrets, approve autonomous live trading, or store private keys or seed phrases.
      </p>
    </div>
  );
}

function SettingsWeb3CredentialSafetyMatrix({
  handoff,
  requestPacket,
}: {
  handoff: Web3OperatorCredentialHandoffReceipt;
  requestPacket: Web3OperatorRequestPacket;
}) {
  const matrix = buildCredentialSafetyMatrix(handoff, requestPacket);
  return (
    <div className="rounded-md border border-outline-variant/30 bg-surface-dim/35 p-3" aria-label="Settings Web3 credential safety matrix">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Credential safety matrix</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">Where each input belongs before live review</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-on-surface-variant">
            This matrix is a read-only contract. It groups safe setup lanes by collection surface and repeats the never-accepted boundary before any credential fields appear.
          </p>
        </div>
        <CredentialStateBadge configured={handoff.open_required_count === 0} status={`${handoff.open_required_count} required open`} />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-5">
        {matrix.map((group) => (
          <div key={group.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{group.label}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{group.count_label}</p>
              </div>
              <LaunchQueueBadge status={group.status} label={group.badge_label} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">{group.rule}</p>
            <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-on-surface-variant">
              {group.items.map((item) => (
                <li key={item} className="truncate">{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        Matrix receipts expose target names and status only. API key values, private keys, seed phrases, raw keypairs, transaction bodies, signed payloads, and live trading authority remain outside this app.
      </p>
    </div>
  );
}

function SettingsWeb3ResearchHandoffPanel({ packet }: { packet: Web3ResearchHandoffPacket }) {
  const nowQuestions = packet.research_questions.filter((question) => question.priority === "now").slice(0, 4);
  const liveBlockers = packet.live_capital_blockers.slice(0, 4);
  const openInputs = packet.open_operator_inputs.slice(0, 4);
  const credentialRequirements = packet.credential_requirements.slice(0, 6);
  const credentialRequirementExportCommands = packet.safe_export_commands.filter((command) => command.includes("requirements:web3"));
  const liveUsability = packet.live_usability;
  const currentInput = packet.current_input;
  return (
    <div id="settings-web3-research-handoff" className="rounded-md border border-violet/30 bg-violet/[0.045] p-3" aria-label="Settings Web3 research handoff packet">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-violet">Research handoff</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            Shareable packet for provider, custody, risk, ops, and proof research
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-on-surface-variant">{packet.summary}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={packet.open_operator_inputs.length > 0 ? "fail" : "watch"} label={`${packet.open_operator_inputs.length} inputs`} />
          <LaunchQueueBadge status="watch" label={`${packet.research_questions.length} questions`} />
          <LaunchQueueBadge status="fail" label="redacted" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <SettingsMetric label="Questions" value={`${packet.research_questions.length}`} />
        <SettingsMetric label="Need now" value={`${nowQuestions.length}`} />
        <SettingsMetric label="Credential asks" value={`${packet.credential_requirements.length}`} />
        <SettingsMetric label="Live blockers" value={`${packet.live_capital_blockers.length}`} />
        <SettingsMetric label="Ready lanes" value={`${packet.app_state.ready_credential_lanes}/${packet.app_state.total_credential_lanes}`} />
      </div>

      {liveUsability ? (
        <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.025] p-2" aria-label="Settings Web3 research live-usability summary">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Live-usability summary</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">
                {liveUsability.real_capital_blocker_count} real-money blockers · {liveUsability.listed_live_usability_row_count}/{liveUsability.total_live_usability_row_count} rows listed
              </p>
            </div>
            <LaunchQueueBadge status="fail" label={liveUsability.status.replaceAll("-", " ")} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
            {liveUsability.next_unlock_step_label
              ? `Next unlock: ${liveUsability.next_unlock_step_label}. ${liveUsability.next_unlock_step_action}`
              : liveUsability.next_action}
          </p>
        </div>
      ) : null}

      {currentInput ? (
        <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.04] p-2" aria-label="Settings Web3 research current input contract">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Current input contract</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">{currentInput.label}</p>
            </div>
            <LaunchQueueBadge status={currentInput.status === "ready" ? "pass" : currentInput.status === "blocked" ? "fail" : "watch"} label={currentInput.source.replace("-", " ")} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{currentInput.next_action}</p>
          <p className="mt-1 text-[10px] leading-4 text-outline">
            Surface: {currentInput.safe_collection_surface.replaceAll("-", " ")} · Storage: {currentInput.storage.replaceAll("-", " ")}
          </p>
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings Web3 credential requirements packet">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Credential requirements packet</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              {packet.credential_requirements.filter((item) => item.priority === "needed-now").length} needed now · {packet.credential_requirements.length} total safe asks
            </p>
            <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
              Give this structured list to a helper or operator when collecting credentials. It names safe value types, storage rules, target names, and done signals without requesting wallet secrets.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <LaunchQueueBadge status="watch" label="safe asks only" />
            <Link
              href={`/api/web3-credential-requirements?source=${packet.source}&account=${packet.account}&scenario=${packet.scenario}&cycles=0`}
              className="inline-flex min-h-8 items-center rounded-md px-2 text-[11px] font-semibold text-engine hover:text-engine/80"
            >
              Open requirements JSON
            </Link>
          </div>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {credentialRequirements.map((requirement) => (
            <div key={requirement.id} className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-on-surface">{requirement.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                    {requirement.owner.replace("-", " ")} · {requirement.priority.replace("-", " ")}
                  </p>
                </div>
                <LaunchQueueBadge status={requirement.priority === "needed-now" ? "fail" : requirement.priority === "before-live" ? "watch" : "pass"} label={requirement.blocks_live_capital ? "blocks live" : "review"} />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{requirement.safe_value_type}</p>
              <p className="mt-1 text-[10px] leading-4 text-outline">Surface: {requirement.safe_collection_surface}</p>
              <p className="mt-1 break-words font-mono text-[10px] leading-4 text-outline">
                {requirement.target_names.join(", ")}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-outline">Done: {requirement.completion_signal}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-outline">
          Every requirement keeps live execution, wallet mutation, and secret echo blocked; private keys, seed phrases, raw transactions, and signed payloads are never requested.
        </p>
        {credentialRequirementExportCommands.length > 0 ? (
          <div className="mt-2 grid gap-2" aria-label="Settings Web3 credential requirements export commands">
            {credentialRequirementExportCommands.map((command) => (
              <code key={command} className="block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
                {command}
              </code>
            ))}
          </div>
        ) : null}
      </div>

      {packet.next_unlock_step ? (
        <div className="mt-3 rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings Web3 research next unlock step">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Next ordered unlock step</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">{packet.next_unlock_step.label}</p>
            </div>
            <LaunchQueueBadge status={settingsOperatorUnlockBadgeStatus(packet.next_unlock_step.status)} label={packet.next_unlock_step.status} />
          </div>
          <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">{packet.next_unlock_step.next_action}</p>
          <p className="mt-1 truncate text-[11px] leading-4 text-outline">{packet.next_unlock_step.storage.replaceAll("-", " ")}</p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.86fr)]">
        <div className="rounded-md border border-violet/25 bg-surface-dim/30 p-2" aria-label="Settings Web3 research questions">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-violet">Questions to answer first</p>
          <div className="mt-2 grid gap-2">
            {nowQuestions.map((question) => (
              <div key={question.id} className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
                <p className="text-xs font-semibold text-on-surface">{question.question}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">
                  {question.category} · {question.expected_answer_format}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-caution/25 bg-caution/[0.035] p-2" aria-label="Settings Web3 research open blockers">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Open blockers and inputs</p>
          <div className="mt-2 grid gap-2">
            {(liveBlockers.length > 0 ? liveBlockers : openInputs).slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
                <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">{item.next_action}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-black/15 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Redacted packet</p>
          <Link
            href="/api/web3-research-handoff-packet?source=live-dex&account=persistent"
            className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold text-violet hover:text-violet/80"
          >
            Open research JSON
          </Link>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2" aria-label="Settings Web3 research export commands">
          {packet.safe_export_commands.map((command) => (
            <code key={command} className="block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {command}
            </code>
          ))}
        </div>
        <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md border border-outline-variant/20 bg-void/50 p-2 text-[11px] leading-5 text-on-surface-variant">
          {packet.text_packet}
        </pre>
      </div>

      <div className="mt-3">
        <SettingsWeb3ResearchAnswerConsole
          scenario={packet.scenario}
          source={packet.source}
          account={packet.account}
          cycles={0}
          questions={packet.research_questions}
        />
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        Research handoff is safe to share with another helper because it contains status, target names, questions, and validated export commands only; it cannot echo secrets, sign, submit, mutate wallets, or unlock live trading.
      </p>
    </div>
  );
}

function SettingsWeb3OperatorIntakeBoard({ receipt }: { receipt: Web3OperatorCredentialHandoffReceipt }) {
  const nextInput = receipt.next_input;
  const openInputs = receipt.inputs.filter((item) => item.status !== "ready").slice(0, 2);
  const openRequiredInputs = receipt.inputs
    .filter((item) => item.priority !== "review-before-live" && item.status !== "ready")
    .slice(0, 4);
  const safeInputs = receipt.allowed_inputs.slice(0, 5);
  const verifier = nextInput?.verifier_command ?? receipt.safe_commands[0];
  const facts = [
    ["Ready lanes", `${receipt.ready_count}/${receipt.inputs.length}`],
    ["Required open", String(receipt.open_required_count)],
    ["Real blockers", receipt.live_usability ? String(receipt.live_usability.real_capital_blocker_count) : "pending"],
    ["Rows listed", receipt.live_usability ? `${receipt.live_usability.listed_live_usability_row_count}/${receipt.live_usability.total_live_usability_row_count}` : "pending"],
    ["Surface", nextInput?.safe_collection_surface.replaceAll("-", " ") ?? "verifier"],
    ["Storage", nextInput?.storage.replaceAll("-", " ") ?? "status only"],
  ];
  return (
    <div className="rounded-md border border-engine/30 bg-engine/[0.04] p-3" aria-label="Web3 operator intake board">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Operator intake</p>
          <h3 className="mt-1 text-base font-semibold text-on-surface">
            {nextInput ? `Next safe input: ${nextInput.label}` : "Credential intake is ready for verifier review"}
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            {nextInput?.next_action ?? receipt.next_action}
          </p>
        </div>
        <CredentialStateBadge configured={receipt.open_required_count === 0} status={`${receipt.open_required_count} required open`} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {facts.map(([label, value]) => (
          <span key={label} className="max-w-full rounded-md border border-outline-variant/25 bg-surface-dim/35 px-2 py-1 text-[11px] leading-4 text-outline">
            <span className="font-mono uppercase tracking-[0.08em]">{label}</span>
            <span className="ml-1 font-semibold text-on-surface">{value}</span>
          </span>
        ))}
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.72fr)]" aria-label="Web3 operator request packet">
        <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Safe to provide</p>
          <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-on-surface-variant">
            {safeInputs.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="rounded-md border border-caution/25 bg-caution/[0.035] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Open required lanes</p>
          {openRequiredInputs.length > 0 ? (
            <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-on-surface-variant">
              {openRequiredInputs.map((item) => (
                <li key={item.id}>
                  <span className="font-semibold text-on-surface">{item.label}</span>
                  <span className="text-outline"> · {item.safe_collection_surface.replaceAll("-", " ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
              Required dry-run lanes are ready; keep live review external and rerun the verifier.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe verifier</p>
          <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
            {verifier}
          </code>
          <p className="mt-2 text-[11px] leading-4 text-outline">
            {nextInput?.secret_handling ?? "Verifier receipts report status only and keep live execution blocked."}
          </p>
        </div>
        <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Never provide</p>
          <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-on-surface-variant">
            {receipt.never_request.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {(openInputs.length > 0 ? openInputs : receipt.inputs.slice(0, 2)).map((item) => (
          <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/30 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                  {item.input_kind.replaceAll("-", " ")} · {item.can_enter_in_app ? "guided in settings" : "external review"}
                </p>
              </div>
              <LaunchQueueBadge status={operatorInputBadgeStatus(item.status)} label={item.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.detail}</p>
            {item.env_targets.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.env_targets.slice(0, 2).map((target) => (
                  <span key={target} className="max-w-full break-all rounded-md border border-outline-variant/25 bg-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                    {target}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        Operator intake is a setup guide only; it cannot create accounts, sign, submit, custody funds, echo secrets, or mutate wallets.
      </p>
    </div>
  );
}

function SettingsWeb3OperatorRequestPacketPanel({ packet }: { packet: Web3OperatorRequestPacket }) {
  const openInputs = packet.required_inputs.slice(0, 4);
  const nextInput = packet.next_input;
  const currentInput = packet.current_input;
  return (
    <div className="rounded-md border border-engine/25 bg-surface-dim/30 p-3" aria-label="Web3 operator share packet">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Share packet</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {nextInput ? `Ask for ${nextInput.label}` : "Required inputs are ready"}
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{packet.summary}</p>
        </div>
        <LaunchQueueBadge status={packet.status === "needs-input" ? "watch" : "pass"} label={`${packet.required_inputs.length} open`} />
      </div>

      {currentInput ? (
        <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.04] p-2" aria-label="Settings Web3 current input contract">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Current input contract</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">{currentInput.label}</p>
            </div>
            <LaunchQueueBadge status={currentInput.status === "ready" ? "pass" : currentInput.status === "blocked" ? "fail" : "watch"} label={currentInput.source.replace("-", " ")} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{currentInput.next_action}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Surface</p>
              <p className="mt-1 text-[11px] font-semibold text-on-surface">{currentInput.safe_collection_surface.replaceAll("-", " ")}</p>
            </div>
            <div className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Storage</p>
              <p className="mt-1 text-[11px] font-semibold text-on-surface">{currentInput.storage.replaceAll("-", " ")}</p>
            </div>
            <div className="rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Targets</p>
              <p className="mt-1 break-all text-[11px] font-semibold text-on-surface">{currentInput.target_names.length > 0 ? currentInput.target_names.join(", ") : "none"}</p>
            </div>
            <div className="rounded-md border border-critical/20 bg-critical/[0.025] p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Authority</p>
              <p className="mt-1 text-[11px] font-semibold text-on-surface">live blocked</p>
            </div>
          </div>
          {currentInput.verifier_command ? (
            <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {currentInput.verifier_command}
            </code>
          ) : null}
        </div>
      ) : null}

      {packet.next_unlock_step ? (
        <div className="mt-3 rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings Web3 operator request next unlock step">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Next ordered unlock step</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">{packet.next_unlock_step.label}</p>
            </div>
            <LaunchQueueBadge status={settingsOperatorUnlockBadgeStatus(packet.next_unlock_step.status)} label={packet.next_unlock_step.status} />
          </div>
          <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">{packet.next_unlock_step.next_action}</p>
          <p className="mt-1 truncate text-[11px] leading-4 text-outline">{packet.next_unlock_step.storage.replaceAll("-", " ")}</p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {openInputs.length > 0 ? openInputs.map((item) => (
          <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                  {item.safe_collection_surface.replaceAll("-", " ")} · {item.storage.replaceAll("-", " ")}
                </p>
              </div>
              <LaunchQueueBadge status={operatorInputBadgeStatus(item.status)} label={item.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.next_action}</p>
            {item.env_targets.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.env_targets.slice(0, 3).map((target) => (
                  <span key={target} className="max-w-full break-all rounded-md border border-outline-variant/25 bg-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                    {target}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )) : (
          <p className="rounded-md border border-outline-variant/25 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant">
            No required setup inputs are open; manual review remains external.
          </p>
        )}
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-black/20 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Redacted request text</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <CopyRedactedPacketButton
              text={packet.text_packet}
              ariaLabel="Copy Web3 operator request packet"
            />
            <Link
              href="/api/web3-operator-request-packet?source=live-dex&account=persistent"
              className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold text-engine hover:text-engine/80"
            >
              Open JSON
            </Link>
          </div>
        </div>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-outline-variant/20 bg-void/50 p-2 text-[11px] leading-5 text-on-surface-variant">
          {packet.text_packet}
        </pre>
      </div>
      <p className="mt-2 text-xs leading-5 text-outline">
        Packet {packet.receipt_hash.slice(0, 12)} keeps live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked.
      </p>
    </div>
  );
}

function SettingsWeb3CutoverBlockerBoardPanel({ board }: { board: Web3CutoverBlockerBoard }) {
  const nextSafeInput = board.next_safe_input;
  const visibleRows = board.rows.filter((row) => row.status !== "ready").slice(0, 6);
  const ownerEntries = Object.entries(board.owner_counts).filter(([, count]) => count > 0);
  return (
    <div className="rounded-md border border-caution/30 bg-caution/[0.035] p-3" aria-label="Settings Web3 cutover blocker board">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Cutover blocker board</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {board.open_blocker_count} open setup blockers before usable live trading
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{board.summary}</p>
        </div>
        <LaunchQueueBadge status={board.open_blocker_count > 0 ? "fail" : "watch"} label={board.status.replaceAll("-", " ")} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SettingsMetric label="Need now" value={`${board.now_count}`} />
        <SettingsMetric label="Before live" value={`${board.before_live_count}`} />
        <SettingsMetric label="Review" value={`${board.review_count}`} />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-caution/30 bg-caution/[0.04] p-2" aria-label="Settings next safe Web3 input">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next safe input</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">
            {nextSafeInput?.label ?? "No open setup input"}
          </p>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
            {nextSafeInput?.next_action ?? "Keep live execution blocked until external review signs off."}
          </p>
          <p className="mt-2 text-[10px] leading-4 text-outline">
            Surface: {nextSafeInput?.safe_collection_surface.replaceAll("-", " ") ?? "external review"} · storage: {nextSafeInput?.storage.replaceAll("-", " ") ?? "status only"}
          </p>
          {nextSafeInput?.env_targets.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {nextSafeInput.env_targets.slice(0, 3).map((target) => (
                <span key={target} className="max-w-full break-all rounded-md border border-outline-variant/25 bg-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                  {target}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-violet/25 bg-violet/[0.035] p-2" aria-label="Settings next supervised-live Web3 blocker">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-violet">Next live-lane blocker</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{board.next_live_lane_action}</p>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Settings cutover blockers by owner">
            {ownerEntries.length > 0 ? ownerEntries.map(([owner, count]) => (
              <span key={owner} className="rounded-md border border-outline-variant/25 bg-void/20 px-2 py-1 text-[11px] leading-4 text-outline">
                <span className="font-semibold text-on-surface">{count}</span> {settingsCutoverOwnerLabel(owner as Web3CutoverBlockerBoard["rows"][number]["owner"])}
              </span>
            )) : (
              <span className="rounded-md border border-engine/25 bg-engine/[0.04] px-2 py-1 text-[11px] leading-4 text-engine">
                No owner blockers open
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2" aria-label="Settings top Web3 cutover blockers">
        {visibleRows.length > 0 ? visibleRows.map((row) => (
          <div key={row.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{row.label}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                  {settingsCutoverOwnerLabel(row.owner)} · {row.phase.replace("-", " ")} · {row.storage.replaceAll("-", " ")}
                </p>
              </div>
              <LaunchQueueBadge status={settingsCutoverRowBadgeStatus(row.status)} label={row.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{row.next_action}</p>
            <p className="mt-1 text-[10px] leading-4 text-outline">
              {row.can_enter_in_app ? "Guided by Settings." : "External review only."} {row.secret_handling}
            </p>
          </div>
        )) : (
          <p className="rounded-md border border-engine/25 bg-engine/[0.04] p-2 text-xs leading-5 text-on-surface-variant">
            No cutover blockers are open in this local receipt; live authority still waits for external review.
          </p>
        )}
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-black/15 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe verifier</p>
          <Link
            href="/api/web3-cutover-blocker-board?source=live-dex&account=persistent"
            className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold text-engine hover:text-engine/80"
          >
            Open board JSON
          </Link>
        </div>
        <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
          {board.verifier_commands[0] ?? "npm run verify:web3 -- --base-url=http://localhost:4010"}
        </code>
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        This Settings board names env targets and verifier commands only. It cannot store secrets, sign, submit, mutate a wallet, or approve autonomous live trading.
      </p>
    </div>
  );
}

function SettingsWeb3OperatorRunbookPanel({ runbook }: { runbook: Web3OperatorRunbookReceipt }) {
  const primary = runbook.primary_safe_action;
  const currentInput = runbook.current_input;
  const currentInputHref = currentInput?.id === "dedicated-trading-wallet" || currentInput?.unlock_step_id === "scope-wallet"
    ? "#settings-web3-wallet-public-key"
    : "#settings-web3-credentials-runway";
  const visibleActions = runbook.run_now.slice(0, 5);
  const blockers = runbook.real_capital_blockers.slice(0, 4);
  return (
    <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-3" aria-label="Settings Web3 operator runbook">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Operator runbook</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {runbook.status.replaceAll("-", " ")} · {runbook.allowed_now_count} safe now
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{runbook.summary}</p>
        </div>
        <LaunchQueueBadge status={runbook.allowed_now_count > 0 ? "pass" : "watch"} label={`${runbook.gated_count} gated`} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SettingsMetric label="Can run" value={`${runbook.allowed_now_count}`} />
        <SettingsMetric label="Gated" value={`${runbook.gated_count}`} />
        <SettingsMetric label="Blocked" value={`${runbook.blocked_count}`} />
      </div>

      <div className="mt-3 rounded-md border border-engine/25 bg-surface-dim/30 p-2" aria-label="Settings primary safe Web3 action">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Primary safe action</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">{primary?.label ?? "Review setup first"}</p>
          </div>
          <LaunchQueueBadge status={settingsRunbookActionBadgeStatus(primary?.status ?? "gated")} label={primary?.status ?? "gated"} />
        </div>
        <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
          {primary?.next_action ?? runbook.next_safe_input?.next_action ?? runbook.next_live_lane_action}
        </p>
        {primary?.command ? (
          <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
            {primary.command}
          </code>
        ) : primary?.href ? (
          <Link
            href={primary.href}
            className="mt-2 inline-flex min-h-10 items-center rounded-md px-2 text-xs font-semibold text-engine hover:text-engine/80"
          >
            Open safe surface
          </Link>
        ) : null}
      </div>

      {currentInput ? (
        <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.035] p-2" aria-label="Settings runbook current input contract">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Current input</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">{currentInput.label}</p>
            </div>
            <LaunchQueueBadge status="fail" label="live blocked" />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{currentInput.next_action}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <SettingsMetric label="Surface" value={currentInput.safe_collection_surface.replaceAll("-", " ")} />
            <SettingsMetric label="Storage" value={currentInput.storage.replaceAll("-", " ")} />
            <SettingsMetric label="Targets" value={currentInput.target_names.length > 0 ? currentInput.target_names.join(", ") : "none"} />
          </div>
          <Link
            href={currentInputHref}
            className="mt-2 inline-flex min-h-10 items-center rounded-md px-2 text-xs font-semibold text-engine hover:text-engine/80"
          >
            Open current input
          </Link>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2" aria-label="Settings safe Web3 run-now actions">
        {visibleActions.map((action) => (
          <div key={action.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{action.label}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                  {action.surface.replaceAll("-", " ")} · {action.kind.replace("-", " ")}
                </p>
              </div>
              <LaunchQueueBadge status={settingsRunbookActionBadgeStatus(action.status)} label={action.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{action.next_action}</p>
            <p className="mt-1 text-[10px] leading-4 text-outline">{action.permission_scope}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.025] p-2" aria-label="Settings real-capital Web3 blockers">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Real-capital blockers</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">Live authority remains unavailable</p>
          </div>
          <LaunchQueueBadge status="fail" label="live blocked" />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {blockers.length > 0 ? blockers.map((blocker) => (
            <div key={blocker.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <p className="text-xs font-semibold text-on-surface">{blocker.label}</p>
              <p className="mt-1 text-[11px] leading-4 text-outline">{blocker.next_action}</p>
            </div>
          )) : (
            <p className="rounded-md border border-outline-variant/20 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant">
              No blocker rows are open in this local receipt; external live review is still required.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-black/15 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Runbook receipt</p>
          <Link
            href="/api/web3-operator-runbook?source=live-dex&account=persistent"
            className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold text-engine hover:text-engine/80"
          >
            Open runbook JSON
          </Link>
        </div>
        <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
          {runbook.verifier_commands[0] ?? "npm run verify:web3 -- --base-url=http://localhost:4010"}
        </code>
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        Settings runbook actions are paper, read-only, credential, verifier, or external-review steps only; they cannot store secrets, sign, submit, mutate a wallet, or approve autonomous live trading.
      </p>
    </div>
  );
}

type SettingsOperatorSetupRunwayStep = {
  id: string;
  label: string;
  status: "ready" | "active" | "blocked" | "review";
  storage_rule: string;
  next_action: string;
  href: string | null;
  command: string | null;
};

function buildSettingsOperatorSetupRunwaySteps(
  handoff: Web3OperatorCredentialHandoffReceipt,
  requestPacket: Web3OperatorRequestPacket,
  runbook: Web3OperatorRunbookReceipt,
  liveUsability: Web3LiveUsabilityBlockersReceipt,
): SettingsOperatorSetupRunwayStep[] {
  const nextInput = handoff.next_input ?? requestPacket.next_input;
  const liveDexAction = runbook.run_now.find((action) => action.id === "refresh-live-dex");
  const orderAction = runbook.run_now.find((action) => action.id === "rehearse-jupiter-order");
  const strictWalletVerifier = requestPacket.verifier_commands.find((command) => command.includes("--require-operator-wallet"));
  const strictJupiterVerifier = requestPacket.verifier_commands.find((command) => command.includes("--require-jupiter-order")) ?? orderAction?.command;
  const combinedStrictVerifier = [
    strictWalletVerifier,
    strictJupiterVerifier,
    requestPacket.verifier_commands.find((command) => command.includes("--require-dex-live")),
  ].filter(Boolean).join(" && ");
  const verifierCommand = combinedStrictVerifier ||
    requestPacket.verifier_commands[0] ||
    runbook.verifier_commands[0] ||
    "npm run verify:web3 -- --base-url=http://localhost:4010";

  return [
    {
      id: "safe-credential-input",
      label: nextInput ? nextInput.label : "Credential inputs are ready",
      status: handoff.open_required_count === 0 ? "ready" : nextInput ? "active" : "blocked",
      storage_rule: nextInput
        ? `${nextInput.safe_collection_surface.replaceAll("-", " ")} · ${nextInput.storage.replaceAll("-", " ")}`
        : "status-only receipt",
      next_action: nextInput?.next_action ?? handoff.next_action,
      href: "#web3-credential-action-console",
      command: null,
    },
    {
      id: "live-market-proof",
      label: liveDexAction?.label ?? "Refresh read-only live DEX tape",
      status: liveDexAction?.status === "allowed" ? "active" : liveDexAction?.status === "gated" ? "review" : "blocked",
      storage_rule: "read-only public market data",
      next_action: liveDexAction?.next_action ?? "Refresh public DEX discovery and candle proof without signing or wallet authority.",
      href: liveDexAction?.href ?? null,
      command: liveDexAction?.command ?? null,
    },
    {
      id: "strict-wallet-order-proof",
      label: "Run strict wallet/order verifier",
      status: handoff.open_required_count === 0 && liveUsability.dry_run_usable ? "ready" : orderAction?.status === "allowed" ? "active" : "blocked",
      storage_rule: "public wallet plus redacted order proof",
      next_action: liveUsability.dry_run_usable
        ? "Run the strict verifier after any credential or wallet change and keep transaction bytes withheld."
        : orderAction?.next_action ?? "Scope a dedicated public wallet and Jupiter order rehearsal before strict dry-run proof can pass.",
      href: null,
      command: verifierCommand,
    },
    {
      id: "external-live-review",
      label: "Prepare external live review",
      status: liveUsability.can_request_external_review ? "review" : "blocked",
      storage_rule: "external approval only",
      next_action: liveUsability.can_request_external_review
        ? "Export the manual live-review packet for external approval; in-app live execution remains blocked."
        : liveUsability.next_action,
      href: "/api/web3-manual-live-review-packet?source=live-dex&account=persistent",
      command: null,
    },
  ];
}

function settingsSetupRunwayBadgeStatus(status: SettingsOperatorSetupRunwayStep["status"]) {
  if (status === "ready") return "pass";
  if (status === "active" || status === "review") return "watch";
  return "fail";
}

function settingsCutoverOwnerLabel(owner: Web3CutoverBlockerBoard["rows"][number]["owner"]) {
  if (owner === "manual-review") return "manual review";
  return owner;
}

function settingsRunbookActionBadgeStatus(status: Web3OperatorRunbookReceipt["run_now"][number]["status"]) {
  if (status === "allowed") return "pass";
  if (status === "blocked") return "fail";
  return "watch";
}

function settingsCutoverRowBadgeStatus(status: Web3CutoverBlockerBoard["rows"][number]["status"]) {
  if (status === "ready") return "pass";
  if (status === "review") return "watch";
  return "fail";
}

function ConnectionChecks({ integrations }: { integrations: SettingsIntegrationStatus[] }) {
  return (
    <section aria-labelledby="integration-status-title" className="space-y-4">
      <div>
        <h2 id="integration-status-title" className="text-xl font-semibold text-on-surface">
          Connection checks
        </h2>
        <p className="mt-1 text-sm leading-6 text-outline">
          Check account access first, then import a holdings snapshot only when you press import.
          Imported holdings are labeled in Portfolio, and this app still cannot place trades.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => (
          <Card key={integration.id} className="border-outline-variant/40 bg-surface-high/30">
            <CardHeader className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-md border border-violet/30 bg-violet/10 text-violet">
                      {integration.status === "credential_gated" ? (
                        <LockKeyhole aria-hidden="true" className="size-5" />
                      ) : (
                        <PlugZap aria-hidden="true" className="size-5" />
                      )}
                    </div>
                    <CardTitle className="text-xl text-on-surface">
                      {integration.display_name}
                    </CardTitle>
                  </div>
                </div>
                <StatusBadge status={integration.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5 pt-0">
              <p className="text-sm leading-6 text-on-surface-variant">{integration.detail}</p>
              <div className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-xs leading-5 text-outline">
                <div className="flex items-start gap-2 text-on-surface-variant">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-engine" />
                  <span>{integration.permission_scope}</span>
                </div>
                <a
                  href={integration.docs_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md px-1 font-semibold text-violet hover:text-violet/80"
                >
                  Docs checked {integration.researched_at}
                  <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              </div>
              <IntegrationKeyInput
                service={integration.service}
                label={integration.credential_hint}
                fields={integration.test_fields}
                permissionScope={integration.permission_scope}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function SettingsSupervisedLiveRunwayPanel({ runway }: { runway: Web3SupervisedLiveRunway }) {
  const openCount = runway.total_lane_count - runway.ready_lane_count;
  return (
    <div className="rounded-md border border-engine/30 bg-engine/[0.04] p-3" aria-label="Web3 supervised live runway">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Supervised live runway</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {runway.status.replaceAll("-", " ")} · {runway.ready_lane_count}/{runway.total_lane_count} lanes ready
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-engine">
            {runway.launch_model}
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{runway.summary}</p>
        </div>
        <LaunchQueueBadge status={runway.can_request_live_review ? "watch" : openCount > 0 ? "fail" : "watch"} label={runway.can_request_live_review ? "review" : `${openCount} open`} />
      </div>

      <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.035] p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next supervised-live action</p>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">{runway.next_action}</p>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {runway.lanes.map((lane) => (
          <div key={lane.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{lane.label}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-outline">{lane.detail}</p>
              </div>
              <CredentialStateBadge configured={lane.status === "ready" || lane.status === "review"} status={lane.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{lane.next_action}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lane.evidence.map((item) => (
                <span key={item} className="max-w-full break-words rounded-md border border-outline-variant/25 bg-surface-dim/30 px-2 py-1 text-[11px] leading-4 text-outline">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-black/15 p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe verifier commands</p>
        <div className="mt-2 grid gap-1">
          {runway.safe_commands.map((command) => (
            <code key={command} className="break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {command}
            </code>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        Supervised live runway keeps transaction submission, live execution, wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked.
      </p>
    </div>
  );
}

function SettingsManualLiveReviewPacketPanel({ packet }: { packet: Web3ManualLiveReviewPacket }) {
  const statusTone = packet.status === "ready-for-external-review"
    ? "watch"
    : packet.failed_signoff_count > 0
      ? "fail"
      : "watch";
  const signoffs = packet.signoffs.slice(0, 6);
  return (
    <div className="rounded-md border border-caution/30 bg-caution/[0.035] p-3" aria-label="Manual live-review packet">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Manual live-review packet</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {packet.status.replaceAll("-", " ")} · {packet.passed_signoff_count}/{packet.required_signoff_count} signoffs passing
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{packet.summary}</p>
        </div>
        <LaunchQueueBadge status={statusTone} label={packet.can_request_external_review ? "external review" : "blocked"} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SettingsMetric label="Launch score" value={`${packet.launch_readiness_score}/100`} />
        <SettingsMetric label="Failed signoffs" value={`${packet.failed_signoff_count}`} />
        <SettingsMetric label="Review signoffs" value={`${packet.watch_signoff_count}`} />
      </div>

      <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.045] p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next external-review action</p>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">{packet.next_action}</p>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {signoffs.map((item) => (
          <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{item.reviewer}</p>
              </div>
              <LaunchQueueBadge status={item.status} label={item.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">{item.evidence}</p>
            <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">{item.next_action}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-black/15 p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">External review evidence</p>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {packet.evidence_links.slice(0, 4).map((item) => (
            <code key={item} className="break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {item}
            </code>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-outline">
        This packet is external review only; it cannot sign, submit, custody funds, mutate wallets, store private keys, store seed phrases, or echo secrets.
      </p>
    </div>
  );
}

function SettingsLaunchBlockerQueue({ checklist }: { checklist: Web3AutonomyLaunchChecklist }) {
  const nextStep = checklist.next_cutover_step;
  const remaining = checklist.remaining_work.slice(0, 6);
  const operatorInputs = checklist.operator_inputs_needed.slice(0, 8);
  const nextOperatorAction = checklist.next_operator_action;
  const repairActions = checklist.repair_actions.slice(0, 6);
  const repairHealth = checklist.local_accountability_repair_health;
  return (
    <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-3" aria-label="Settings Web3 launch blocker queue">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Launch blocker queue</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {checklist.status.replaceAll("-", " ")} · {checklist.readiness_score}/100
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">
            {checklist.remaining_work_count} gates remain; next cutover step is {nextStep.label.toLowerCase()}.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <LaunchQueueBadge status={checklist.hard_blocker_count > 0 ? "fail" : checklist.watch_count > 0 ? "watch" : "pass"} label={`${checklist.hard_blocker_count} hard`} />
          <LaunchQueueBadge status={checklist.live_review_permitted ? "watch" : "fail"} label={checklist.live_review_permitted ? "manual review" : "live blocked"} />
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {remaining.length > 0 ? remaining.map((item) => (
          <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-outline">{item.detail}</p>
              </div>
              <LaunchQueueBadge status={item.status} label={item.priority} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.next_action}</p>
          </div>
        )) : (
          <p className="rounded-md border border-engine/25 bg-engine/[0.04] p-2 text-xs leading-5 text-on-surface-variant">
            No launch blockers remain in the current local checklist; manual live review is still external to this app.
          </p>
        )}
      </div>
      <div className="mt-3 rounded-md border border-outline-variant/25 bg-void/20 p-2" aria-label="Operator input packet">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Operator input packet</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              What Mastermind still needs before supervised trading review
            </p>
          </div>
          <LaunchQueueBadge
            status={operatorInputs.some((item) => item.status === "blocked" || item.status === "needed") ? "fail" : "watch"}
            label={`${operatorInputs.filter((item) => item.status !== "ready").length} open`}
          />
        </div>
        {nextOperatorAction ? (
          <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.04] p-2" aria-label="Next Web3 operator action">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next operator action</p>
                <p className="mt-1 text-xs font-semibold text-on-surface">{nextOperatorAction.label}</p>
              </div>
              <LaunchQueueBadge status={operatorInputBadgeStatus(nextOperatorAction.status)} label={nextOperatorAction.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{nextOperatorAction.next_action}</p>
            <p className="mt-1 text-[10px] leading-4 text-outline">
              Storage: {nextOperatorAction.storage.replaceAll("-", " ")} · {nextOperatorAction.secret_handling}
            </p>
          </div>
        ) : null}
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {operatorInputs.map((item) => (
            <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/20 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-outline">{item.detail}</p>
                </div>
                <LaunchQueueBadge status={operatorInputBadgeStatus(item.status)} label={item.status} />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.next_action}</p>
              <p className="mt-1 text-[10px] leading-4 text-outline">
                Storage: {item.storage.replaceAll("-", " ")} · {item.secret_handling}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-outline">
          This packet is the handoff list for credentials and approvals; private keys and seed phrases stay out of the app.
        </p>
      </div>
      <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2" aria-label="Settings Web3 launch repair queue">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Launch repair queue</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              Safe repair actions for proof, route, supervision, and verification
            </p>
          </div>
          <LaunchQueueBadge
            status={repairActions.some((item) => item.status === "blocked") ? "fail" : repairActions.some((item) => item.status === "active" || item.status === "review") ? "watch" : "pass"}
            label={`${repairActions.filter((item) => item.status !== "ready").length} repair`}
          />
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {repairActions.map((item) => (
            <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-outline">{item.detail}</p>
                </div>
                <LaunchQueueBadge status={repairActionBadgeStatus(item.status)} label={item.status} />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.command ?? item.next_action}</p>
              <p className="mt-1 text-[10px] leading-4 text-outline">
                Surface: {item.surface.replaceAll("-", " ")} · evidence repair only
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-outline">
          Repair actions can refresh paper/readiness evidence only; they cannot create accounts, sign, submit, custody funds, or unlock live capital.
        </p>
      </div>
      <div className="mt-3 rounded-md border border-outline-variant/25 bg-void/20 p-2" aria-label="Settings local paper repair health">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Local paper repair health</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              {repairHealth.status.replaceAll("-", " ")} · {repairHealth.final_accountability_score}/100
            </p>
          </div>
          <LaunchQueueBadge
            status={repairHealth.repair_plateaued ? "fail" : repairHealth.status === "complete" ? "pass" : "watch"}
            label={repairHealth.receipt_fresh ? "fresh" : "stale"}
          />
        </div>
        <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{repairHealth.summary}</p>
        <p className="mt-1 text-[10px] leading-4 text-outline">
          Posted {repairHealth.attempts_posted}/{repairHealth.attempts_requested}; score delta {repairHealth.score_delta > 0 ? "+" : ""}{repairHealth.score_delta}; next: {repairHealth.next_action}
        </p>
      </div>
      <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Next cutover step</p>
        <p className="mt-1 text-xs font-semibold text-on-surface">{nextStep.label} · {nextStep.status}</p>
        <p className="mt-1 text-[11px] leading-4 text-outline">{nextStep.next_action}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-outline">
        Settings shows this queue for planning only; the app still blocks live execution, wallet mutation, private-key storage, and transaction submission.
      </p>
    </div>
  );
}

function SettingsOperatorCredentialHandoffReceiptPanel({ receipt }: { receipt: Web3OperatorCredentialHandoffReceipt }) {
  const nextInput = receipt.next_input;
  const visibleInputs = receipt.inputs.slice(0, 12);
  const liveUsability = receipt.live_usability;
  return (
    <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-3" aria-label="Operator credential handoff receipt">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Operator credential handoff receipt</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">{receipt.status.replaceAll("-", " ")}</p>
          <p className="mt-1 text-xs leading-5 text-outline">{receipt.summary}</p>
        </div>
        <CredentialStateBadge configured={receipt.open_required_count === 0} status={`${receipt.ready_count}/${receipt.inputs.length} ready`} />
      </div>
      {nextInput ? (
        <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.04] p-2" aria-label="Next safe credential input">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next safe input</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">{nextInput.label}</p>
            </div>
            <LaunchQueueBadge status={operatorInputBadgeStatus(nextInput.status)} label={nextInput.priority.replaceAll("-", " ")} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{nextInput.next_action}</p>
          <p className="mt-1 text-[10px] leading-4 text-outline">
            Surface: {nextInput.safe_collection_surface.replaceAll("-", " ")} · storage: {nextInput.storage.replaceAll("-", " ")}
          </p>
        </div>
      ) : null}
      {liveUsability ? (
        <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.025] p-2" aria-label="Credential handoff live-usability summary">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Live-usability summary</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">
                {liveUsability.real_capital_blocker_count} real-money blockers · {liveUsability.listed_live_usability_row_count}/{liveUsability.total_live_usability_row_count} rows listed
              </p>
            </div>
            <LaunchQueueBadge status="fail" label={liveUsability.status.replaceAll("-", " ")} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
            {liveUsability.next_unlock_step_label
              ? `Next unlock: ${liveUsability.next_unlock_step_label}. ${liveUsability.next_unlock_step_action}`
              : liveUsability.next_action}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-outline">
            Evidence: {liveUsability.evidence_endpoint}; receipt {liveUsability.receipt_hash.slice(0, 12)}.
          </p>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {visibleInputs.map((item) => (
          <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                  {item.input_kind.replaceAll("-", " ")} · {item.can_enter_in_app ? "app guided" : "external"}
                </p>
              </div>
              <LaunchQueueBadge status={operatorInputBadgeStatus(item.status)} label={item.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">{item.detail}</p>
            {item.env_targets.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.env_targets.slice(0, 4).map((target) => (
                  <span key={target} className="max-w-full break-all rounded-md border border-outline-variant/25 bg-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                    {target}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe commands</p>
          <div className="mt-2 space-y-1">
            {receipt.safe_commands.slice(0, 3).map((command) => (
              <code key={command} className="block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[10px] leading-4 text-on-surface-variant">
                {command}
              </code>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Allowed inputs</p>
          <ul className="mt-2 space-y-1 text-[11px] leading-4 text-on-surface-variant">
            {receipt.allowed_inputs.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Never request</p>
          <ul className="mt-2 space-y-1 text-[11px] leading-4 text-on-surface-variant">
            {receipt.never_request.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-outline">
        Handoff receipt {receipt.receipt_hash.slice(0, 12)} keeps live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo blocked.
      </p>
    </div>
  );
}

function operatorInputBadgeStatus(status: Web3AutonomyLaunchChecklist["operator_inputs_needed"][number]["status"]) {
  if (status === "ready") return "pass";
  if (status === "review") return "watch";
  return "fail";
}

function repairActionBadgeStatus(status: Web3AutonomyLaunchChecklist["repair_actions"][number]["status"]) {
  if (status === "ready") return "pass";
  if (status === "active" || status === "review") return "watch";
  return "fail";
}

function SettingsDedicatedWalletPacketPanel({ packet }: { packet: Web3DedicatedWalletPacket }) {
  const openCount = packet.missing_required.length;
  const primaryTone = packet.dedicated_wallet_scoped && packet.wallet_ownership_proved ? "pass" : packet.wallet_is_sample ? "fail" : "watch";
  return (
    <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-3" aria-label="Web3 dedicated wallet packet">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Dedicated wallet packet</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {packet.status.replaceAll("-", " ")} · {packet.wallet_public_key_preview ?? "no wallet"}
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{packet.summary}</p>
        </div>
        <LaunchQueueBadge status={primaryTone} label={openCount > 0 ? `${openCount} open` : "ready"} />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Public address</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">
            {packet.dedicated_wallet_scoped ? "Dedicated wallet scoped" : packet.wallet_is_sample ? "Sample wallet rejected" : "Public address needed"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            Public address only. No private key, seed phrase, raw transaction, or custody credential belongs here.
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Ownership proof</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">
            {packet.wallet_ownership_proved ? "Hash receipt ready" : "Prove ownership"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            Text-only browser wallet signature; receipt {packet.wallet_ownership_receipt_hash ? packet.wallet_ownership_receipt_hash.slice(0, 10) : "not recorded"}.
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Strict verifier</p>
          <code className="mt-1 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
            {packet.strict_verifier_command}
          </code>
        </div>
      </div>

      {packet.missing_required.length > 0 ? (
        <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.035] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Required before wallet review</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {packet.missing_required.map((item) => (
              <span key={item} className="rounded-md border border-caution/30 bg-caution/10 px-2 py-1 text-[11px] leading-4 text-caution">
                {item}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{packet.next_action}</p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {packet.steps.map((step) => (
          <div key={step.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{step.label}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-outline">{step.detail}</p>
              </div>
              <CredentialStateBadge configured={step.status === "done"} status={step.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{step.next_action}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {packet.setup_links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-engine hover:text-engine/80"
            title={link.detail}
          >
            {link.label}
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-outline">
        Dedicated wallet packet receipts are setup evidence only; signing, submission, live execution, and wallet mutation stay blocked.
      </p>
    </div>
  );
}

function SettingsJupiterOrderPacketPanel({
  packet,
  rehearsalHistory,
}: {
  packet: Web3JupiterOrderPacket;
  rehearsalHistory: Web3JupiterRehearsalHistory;
}) {
  const openCount = packet.missing_required.length;
  const primaryTone = packet.status === "review-ready" ? "pass" : packet.status === "missing-key" || packet.status === "wallet-needed" ? "fail" : "watch";
  const latestRuns = rehearsalHistory.recent_runs.slice(-4);
  return (
    <div className="rounded-md border border-caution/30 bg-caution/[0.035] p-3" aria-label="Web3 Jupiter order packet">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Jupiter order packet</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            Swap V2 order rail · {packet.status.replaceAll("-", " ")}
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{packet.summary}</p>
        </div>
        <LaunchQueueBadge status={primaryTone} label={openCount > 0 ? `${openCount} open` : "ready"} />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Credential scope</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">
            {packet.jupiter_configured ? "Server key configured" : "Jupiter API key needed"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            Storage: {packet.key_storage.replaceAll("-", " ")}. Browser storage and secret echo stay blocked.
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Order proof</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">
            {packet.swap_v2_order_ready ? "Order evidence ready" : "Rehearse Jupiter"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            Adapter {packet.adapter_status.replaceAll("-", " ")} · score {packet.adapter_readiness_score}/100 · quote {packet.quote_request_ready ? "ready" : "gated"}.
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Strict verifier</p>
          <code className="mt-1 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
            {packet.strict_verifier_command}
          </code>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-void/20 p-2" aria-label="Jupiter rehearsal history">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Last rehearsal proof</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">{rehearsalHistory.summary}</p>
            <p className="mt-1 text-[11px] leading-4 text-outline">
              Quote {rehearsalHistory.latest_quote_ready ? "ready" : "gated"} · order {rehearsalHistory.latest_order_ready ? "ready" : "gated"} · transaction bytes {rehearsalHistory.unsigned_transaction_return}.
            </p>
          </div>
          <LaunchQueueBadge
            status={rehearsalHistory.status === "order-ready" ? "pass" : rehearsalHistory.status === "absent" || rehearsalHistory.status === "blocked" ? "fail" : "watch"}
            label={rehearsalHistory.status.replaceAll("-", " ")}
          />
        </div>
        {latestRuns.length > 0 ? (
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {latestRuns.map((run) => (
              <div key={`${run.generated_at}-${run.status}`} className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-dim/25 p-2">
                <p className="truncate text-[11px] font-semibold text-on-surface">{run.status.replaceAll("-", " ")}</p>
                <p className="mt-0.5 truncate text-[10px] leading-4 text-outline">
                  wallet {run.wallet_public_key_preview ?? "missing"} · key {run.key_source.replaceAll("-", " ")}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">
            No redacted Jupiter rehearsal has been recorded yet.
          </p>
        )}
      </div>

      {packet.missing_required.length > 0 ? (
        <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.035] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Required before order review</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {packet.missing_required.map((item) => (
              <span key={item} className="rounded-md border border-caution/30 bg-caution/10 px-2 py-1 text-[11px] leading-4 text-caution">
                {item}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{packet.next_action}</p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {packet.steps.map((step) => (
          <div key={step.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{step.label}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-outline">{step.detail}</p>
              </div>
              <CredentialStateBadge configured={step.status === "done"} status={step.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{step.next_action}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe endpoints</p>
          <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
            {packet.local_install_endpoint} installs ignored local env on trusted localhost; {packet.rehearsal_endpoint} builds redacted quote/order proof.
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Execution boundary</p>
          <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
            Unsigned transaction return {packet.unsigned_transaction_return}; execute, signing, submission, live execution, and wallet mutation blocked.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {packet.setup_links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-engine hover:text-engine/80"
            title={link.detail}
          >
            {link.label}
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-outline">
        Jupiter order packet receipts are proof planning only; real order execution remains externally reviewed and blocked here.
      </p>
    </div>
  );
}

function SettingsLiveOpsPacketPanel({ packet }: { packet: Web3LiveOpsPacket }) {
  const openCount = packet.missing_required.length;
  const primaryTone = packet.status === "manual-review-needed" ? "watch" : packet.status === "blocked" ? "fail" : "watch";
  const workerTargetCount = [
    packet.process_manager_configured,
    packet.worker_owner_configured,
    packet.alert_route_configured,
    packet.restart_policy_configured,
  ].filter(Boolean).length;
  return (
    <div className="rounded-md border border-violet/25 bg-violet/[0.035] p-3" aria-label="Web3 live ops packet">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Live ops packet</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            Production worker review · {packet.status.replaceAll("-", " ")}
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{packet.summary}</p>
        </div>
        <LaunchQueueBadge status={primaryTone} label={openCount > 0 ? `${openCount} open` : "review"} />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Supervisor</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">
            {packet.production_supervisor_status.replaceAll("-", " ")} · {packet.production_supervisor_score}/100
          </p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            Receipt {packet.production_supervisor_fresh ? "fresh" : "stale/missing"} · process gate remains external.
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Emergency stop</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">
            {packet.emergency_stop_configured ? "Ops target configured" : "Ops target missing"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            Webhook {packet.emergency_stop_webhook_configured ? "set" : "missing"} · contact {packet.emergency_stop_contact_configured ? "set" : "missing"} · External dispatch blocked.
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Accounting</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">
            {packet.accounting_export_configured ? "Export target review" : "Export target needed"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            Boundary {packet.accounting_boundary}; settlement {packet.settlement_status.replaceAll("-", " ")}; mirror {packet.portfolio_mirror_status.replaceAll("-", " ")}.
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Worker ops</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">
            {packet.production_ops_targets_configured ? "Review targets configured" : `${workerTargetCount}/4 targets set`}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            Process {packet.process_manager_configured ? "set" : "missing"} · owner {packet.worker_owner_configured ? "set" : "missing"} · alert {packet.alert_route_configured ? "set" : "missing"} · restart {packet.restart_policy_configured ? "set" : "missing"}.
          </p>
        </div>
      </div>

      {packet.missing_required.length > 0 ? (
        <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.035] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Required before live ops review</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {packet.missing_required.map((item) => (
              <span key={item} className="rounded-md border border-caution/30 bg-caution/10 px-2 py-1 text-[11px] leading-4 text-caution">
                {item}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{packet.next_action}</p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {packet.steps.map((step) => (
          <div key={step.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{step.label}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-outline">{step.detail}</p>
              </div>
              <CredentialStateBadge configured={step.status === "done"} status={step.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{step.next_action}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-void/20 p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe commands</p>
        <div className="mt-2 grid gap-1">
          {packet.safe_commands.slice(0, 4).map((command) => (
            <code key={command} className="break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {command}
            </code>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-outline">
        Live ops packet receipts cannot send webhooks, install process managers, approve live trades, submit transactions, or mutate wallets.
      </p>
    </div>
  );
}

function SettingsCredentialDoctorPanel({ health }: { health: Web3CredentialDoctorHealth }) {
  const doctorChecks = health.checks;
  return (
    <div className="rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3" aria-label="Web3 credential doctor receipt">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Credential doctor receipt</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {health.status.replaceAll("-", " ")} - {health.ready_count}/{Math.max(health.checks.length, health.ready_count + health.watch_count + health.blocked_count)} passing
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{health.summary}</p>
        </div>
        <LaunchQueueBadge
          status={health.status === "absent" || health.blocked_count > 0 ? "fail" : health.watch_count > 0 ? "watch" : "pass"}
          label={health.receipt_fresh ? "fresh" : health.status === "absent" ? "not run" : "stale"}
        />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {doctorChecks.length > 0 ? doctorChecks.map((item) => (
          <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-outline">{item.detail}</p>
              </div>
              <LaunchQueueBadge status={item.status} label={item.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.next_action}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{item.storage}</p>
          </div>
        )) : (
          <p className="rounded-md border border-caution/25 bg-caution/[0.035] p-2 text-xs leading-5 text-on-surface-variant">
            Run <code className="rounded bg-black/20 px-1 py-0.5">npm run doctor:web3 -- --json</code> to write a sanitized credential doctor receipt.
          </p>
        )}
      </div>
      <div className="mt-3 rounded-md border border-outline-variant/25 bg-void/20 p-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe commands</p>
        <div className="mt-2 grid gap-1">
          {health.safe_commands.slice(0, 5).map((command) => (
            <code key={command} className="break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {command}
            </code>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-outline">
        Doctor receipts are local, sanitized, and status-only; they cannot create accounts, store secrets, sign, submit, custody funds, mutate wallets, or unlock live capital.
      </p>
      <p className="sr-only" aria-label="Web3 credential doctor security boundary">
        Web3 credential doctor live execution blocked; wallet mutation blocked; transaction submission blocked; private key storage blocked; seed phrase storage blocked; secret echo blocked.
      </p>
    </div>
  );
}

function SettingsSignerCredentialPacketPanel({ packet }: { packet: Web3SignerCredentialPacket }) {
  const selected = packet.selected_path;
  const openCount = packet.missing_required.length;
  return (
    <div className="rounded-md border border-violet/25 bg-violet/[0.035] p-3" aria-label="Web3 signer credential packet">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Signer credential packet</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {selected.label} · {packet.status.replaceAll("-", " ")}
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">{packet.summary}</p>
        </div>
        <LaunchQueueBadge status={packet.status === "review-ready" ? "watch" : packet.status === "blocked" ? "fail" : "watch"} label={`${openCount} open`} />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Selected path</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">{selected.signing_model.replaceAll("-", " ")}</p>
          <p className="mt-1 text-[11px] leading-4 text-outline">{selected.next_action}</p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Evidence</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">{packet.provider_readiness_score}/100 · {packet.provider_readiness_status.replaceAll("-", " ")}</p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            Wallet proof {packet.wallet_ownership_proved ? "ready" : "missing"} · policy {packet.policy_hash_present ? "ready" : "missing"} · request {packet.request_id_present ? "ready" : "missing"}
          </p>
        </div>
        <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Boundary</p>
          <p className="mt-1 text-xs font-semibold text-on-surface">Live signing blocked</p>
          <p className="mt-1 text-[11px] leading-4 text-outline">
            No private keys, seed phrases, raw transactions, signed payloads, live execution, or wallet mutation.
          </p>
        </div>
      </div>
      {packet.missing_required.length > 0 ? (
        <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.035] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next signer inputs</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {packet.missing_required.map((item) => (
              <span key={item} className="rounded-md border border-caution/30 bg-caution/10 px-2 py-1 text-[11px] leading-4 text-caution">
                {item}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{packet.next_action}</p>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {packet.paths.map((path) => (
          <div key={path.id} className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">{path.label}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                  {path.status} · {path.credential_storage.replaceAll("-", " ")}
                </p>
              </div>
              <CredentialStateBadge configured={path.configured} status={path.configured ? "configured" : path.status} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">{path.security_rule}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {path.env_targets.map((target) => (
                <span key={target} className="max-w-full break-all rounded-md border border-outline-variant/25 bg-void/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                  {target}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={path.setup_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-engine hover:text-engine/80">
                Setup
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
              <a href={path.docs_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-semibold text-violet hover:text-violet/80">
                Docs
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-outline">
        This packet is credential planning only; provider accounts are operator-owned outside the app and real-capital execution remains externally reviewed.
      </p>
    </div>
  );
}

function LaunchQueueBadge({
  status,
  label,
}: {
  status: "pass" | "watch" | "fail";
  label: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 border text-xs",
        status === "pass" && "border-engine/35 bg-engine/10 text-engine",
        status === "watch" && "border-caution/40 bg-caution/10 text-caution",
        status === "fail" && "border-critical/35 bg-critical/10 text-critical",
      )}
    >
      {label}
    </Badge>
  );
}

function settingsOperatorUnlockBadgeStatus(status: Web3UsabilityStatusReceipt["operator_unlock_sequence"][number]["status"]): "pass" | "watch" | "fail" {
  if (status === "ready") return "pass";
  if (status === "active" || status === "review") return "watch";
  return "fail";
}

type CredentialQueueStatus = "ready" | "missing" | "review" | "blocked";

type CredentialSafetyMatrixGroup = {
  id: string;
  label: string;
  count_label: string;
  badge_label: string;
  status: "pass" | "watch" | "fail";
  rule: string;
  items: string[];
};

type CredentialQueueItem = {
  id: string;
  label: string;
  status: CredentialQueueStatus;
  detail: string;
  action: string;
  storage: string;
};

type CredentialHandoffRow = {
  label: string;
  value: string;
  detail: string;
};

function buildWeb3CredentialHandoffRows(queue: CredentialQueueItem[]): CredentialHandoffRow[] {
  const ready = queue.filter((item) => item.status === "ready");
  const missing = queue.filter((item) => item.status === "missing" || item.status === "blocked");
  const review = queue.filter((item) => item.status === "review");
  const next = missing[0] ?? review[0] ?? ready[0];
  return [
    {
      label: "Ready now",
      value: `${ready.length}/${queue.length} lanes`,
      detail: ready.length > 0 ? ready.map((item) => item.label).slice(0, 3).join(", ") : "No live-review credential lane is ready yet.",
    },
    {
      label: "Needs input",
      value: `${missing.length} missing`,
      detail: next ? `${next.label}: ${next.action}` : "All setup inputs are present; run strict verification before any review.",
    },
    {
      label: "Review only",
      value: `${review.length} review`,
      detail: review.length > 0 ? review.map((item) => item.label).slice(0, 3).join(", ") : "No review-only lanes are waiting.",
    },
  ];
}

function buildCredentialSafetyMatrix(
  handoff: Web3OperatorCredentialHandoffReceipt,
  requestPacket: Web3OperatorRequestPacket,
): CredentialSafetyMatrixGroup[] {
  const settingsRows = handoff.inputs.filter((input) => input.safe_collection_surface === "settings-console" && input.can_enter_in_app);
  const browserRows = handoff.inputs.filter((input) => input.safe_collection_surface === "browser-wallet" || input.storage === "browser-public-scope" || input.storage === "hash-only-local-receipt");
  const reviewRows = handoff.inputs.filter((input) => input.safe_collection_surface === "external-system" || input.safe_collection_surface === "manual-review" || !input.can_enter_in_app);
  const envTargets = Array.from(new Set(
    handoff.inputs
      .filter((input) => input.storage === "server-env" || input.storage === "future-signer-vault")
      .flatMap((input) => input.env_targets),
  ));
  const settingsOpen = settingsRows.filter((input) => input.status !== "ready").length;
  const browserOpen = browserRows.filter((input) => input.status !== "ready").length;
  const reviewOpen = reviewRows.filter((input) => input.status !== "ready").length;

  return [
    {
      id: "settings-console",
      label: "Settings console",
      count_label: `${settingsRows.length - settingsOpen}/${settingsRows.length} ready`,
      badge_label: settingsOpen > 0 ? `${settingsOpen} open` : "ready",
      status: settingsOpen > 0 ? "watch" : "pass",
      rule: "Use for public wallet scope, one-shot tests, and ignored local env target installation.",
      items: settingsRows.map((input) => input.label).slice(0, 4),
    },
    {
      id: "server-env",
      label: "Server env only",
      count_label: `${envTargets.length} targets`,
      badge_label: envTargets.length > 0 ? "env" : "none",
      status: envTargets.length > 0 ? "watch" : "pass",
      rule: "Secrets and ops targets belong in ignored server env or provider vaults, never browser storage.",
      items: envTargets.slice(0, 4),
    },
    {
      id: "browser-wallet",
      label: "Browser wallet",
      count_label: `${browserRows.length - browserOpen}/${browserRows.length} ready`,
      badge_label: browserOpen > 0 ? `${browserOpen} open` : "ready",
      status: browserOpen > 0 ? "watch" : "pass",
      rule: "Public address and text-message ownership proof only; no transaction signature for setup proof.",
      items: browserRows.map((input) => input.label).slice(0, 4),
    },
    {
      id: "external-review",
      label: "External review",
      count_label: `${reviewRows.length - reviewOpen}/${reviewRows.length} ready`,
      badge_label: reviewOpen > 0 ? `${reviewOpen} open` : "review",
      status: reviewOpen > 0 ? "fail" : "watch",
      rule: "Signer policy, settlement, and manual live approval require separate human/provider review.",
      items: reviewRows.map((input) => input.label).slice(0, 4),
    },
    {
      id: "never-accepted",
      label: "Never accepted",
      count_label: `${requestPacket.never_provide.length} blocked`,
      badge_label: "blocked",
      status: "fail",
      rule: "These values must not be pasted into Settings, chat, files, browser storage, or helper packets.",
      items: requestPacket.never_provide.slice(0, 4),
    },
  ];
}

function buildWeb3CredentialActionQueue(
  receipt: Web3AccountSetupReceipt,
  acquisition: Web3AccountAcquisitionReceipt,
  state: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>,
): CredentialQueueItem[] {
  const sampleWallet = receipt.wallet_summary.wallet_is_sample;
  const dedicatedWallet = receipt.wallet_summary.dedicated_wallet_scoped;
  const ownershipProved = receipt.wallet_summary.wallet_ownership_proved;
  const emergencyStop = receipt.environment_summary.emergency_stop_configured;
  const accounting = receipt.environment_summary.tax_ledger_configured;
  const jupiter = receipt.environment_summary.jupiter_configured;
  const readRail = receipt.environment_summary.helius_read_rail_configured;
  const failedDexSources = state.discovery_tape.sources.filter((source) => source.status === "failed").length;
  const liveDexReady = state.market_source.status === "live" &&
    state.discovery_tape.status === "live" &&
    state.discovery_tape.pairs_mapped > 0 &&
    failedDexSources === 0;
  const liveDexWatch = state.market_source.status === "live" || state.discovery_tape.pairs_mapped > 0;

  return [
    {
      id: "read-rail",
      label: "Helius / Solana read rail",
      status: readRail ? "ready" : "missing",
      detail: readRail ? "Server scope has read-provider evidence." : "Wallet and chain reads need Helius or Solana RPC.",
      action: readRail ? "Run provider health after rotating the key." : "Add HELIUS_API_KEY or SOLANA_RPC_URL in ignored local env.",
      storage: "secret: server env only",
    },
    {
      id: "live-dex-scanner",
      label: "Live DEX scanner",
      status: liveDexReady ? "ready" : liveDexWatch ? "review" : "missing",
      detail: liveDexReady
        ? `${state.discovery_tape.pairs_mapped} live pair${state.discovery_tape.pairs_mapped === 1 ? "" : "s"} mapped with no failed discovery sources.`
        : liveDexWatch
          ? `${state.discovery_tape.pairs_mapped} pair${state.discovery_tape.pairs_mapped === 1 ? "" : "s"} mapped; ${failedDexSources} source failure${failedDexSources === 1 ? "" : "s"} still need review.`
          : "Current Settings state is still sample or untested for live DEX discovery.",
      action: liveDexReady
        ? "Run the strict live DEX verifier after source changes; keep this as read-only scanner evidence."
        : "Use Test DEX scanner or Web3 Live DEX read, then require mapped live pairs with zero failed sources.",
      storage: "public market data: read-only",
    },
    {
      id: "jupiter-order",
      label: "Jupiter order rehearsal",
      status: jupiter ? "ready" : "missing",
      detail: jupiter ? "Jupiter server key is configured for quote/order rehearsal." : "Order rehearsal cannot prove route readiness without Jupiter access.",
      action: jupiter ? "Run Rehearse Jupiter and strict order verifier." : "Add JUPITER_API_KEY in ignored local env or use a one-shot Settings test.",
      storage: "secret: server env or one-shot",
    },
    {
      id: "dedicated-wallet",
      label: "Dedicated trading wallet",
      status: dedicatedWallet ? "ready" : "missing",
      detail: dedicatedWallet
        ? `Scoped wallet ${receipt.wallet_summary.wallet_public_key_preview ?? "public key"} is not the sample wallet.`
        : sampleWallet
          ? "The sample all-ones wallet is scoped for demo only."
          : "No dedicated public trading wallet is scoped yet.",
      action: dedicatedWallet ? "Keep seed phrase and private key outside Master Mold." : acquisition.items.find((item) => item.id === "dedicated-wallet")?.next_action ?? "Enter only a public Solana address.",
      storage: "public address: browser-safe",
    },
    {
      id: "wallet-ownership",
      label: "Wallet ownership proof",
      status: ownershipProved && dedicatedWallet ? "ready" : dedicatedWallet ? "review" : "blocked",
      detail: ownershipProved ? "Hash-only ownership receipt is recorded." : "Ownership is unproved until a browser wallet signs the text challenge.",
      action: ownershipProved ? "Use the receipt as review evidence; it grants no signing authority." : "Connect the browser wallet and run Prove ownership.",
      storage: "signature evidence: hash-only",
    },
    {
      id: "manual-signer",
      label: "Manual external signer",
      status: receipt.environment_summary.signer_provider === "external-wallet" ? "review" : "missing",
      detail: "First live posture should require user-present external wallet approval.",
      action: receipt.environment_summary.signer_provider === "external-wallet"
        ? "Build signer receipt; live submission remains blocked."
        : "Switch signer posture to manual external wallet before live review.",
      storage: "signer secrets: never stored here",
    },
    {
      id: "emergency-stop",
      label: "Emergency stop operations",
      status: emergencyStop ? "review" : "missing",
      detail: emergencyStop ? "Ops target metadata is configured." : "Supervised live review needs an external stop owner/channel.",
      action: emergencyStop ? "Run the local stop drill before live review." : "Add MASTERMOLD_EMERGENCY_STOP_CONTACT or webhook target in server env.",
      storage: "ops target: server env only",
    },
    {
      id: "accounting",
      label: "Settlement and accounting",
      status: accounting ? "review" : "missing",
      detail: accounting ? "Accounting export target is configured." : "Real fills need settlement evidence and export handling before they are trusted.",
      action: accounting ? "Use only after confirmed fill reconciliation." : "Choose an export target after guarded fill reconciliation is clean.",
      storage: "fill evidence: reviewed ledger",
    },
  ];
}

function DataPrivacyCard() {
  const items = [
    {
      label: "Stays in this browser",
      detail:
        "Profile preferences and saved connection-test fields stay in local browser storage unless you export a backup or press a test/import/live chat action.",
    },
    {
      label: "Sent to this local app",
      detail:
        "Connection tests, holdings imports, live chat, manual holdings, paper trades, and journal saves go through this local app server so the UI can update.",
    },
    {
      label: "Can leave this app",
      detail:
        "Only the action you choose can contact an outside service: account test/import sends that service's fields, and live chat sends the question plus visible app context to the selected chat service.",
    },
    {
      label: "Never sent by this app",
      detail:
        "Master Mold has no order endpoint, cannot sign transactions, and never asks for private wallet keys.",
    },
  ];

  return (
    <section aria-labelledby="data-privacy-title">
      <Card className="border-outline-variant/40 bg-surface-high/30">
        <CardHeader className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-violet/30 bg-violet/10 text-violet">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle as="h2" id="data-privacy-title" className="text-xl text-on-surface">
                Data and privacy
              </CardTitle>
              <p className="mt-1 text-sm leading-6 text-outline">
                What stays local, what reaches this app, and what can leave only when you press a button.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 pt-0 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-outline">{item.label}</p>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function PortfolioImportStatusCard({ portfolio }: { portfolio: ReturnType<typeof getPortfolio> }) {
  const snapshot = portfolio.import_snapshot;
  const hasImportedHoldings = snapshot.count > 0;
  const hasImportIssues = snapshot.issue_count > 0;
  const statusNote = hasImportedHoldings
    ? snapshot.note
    : hasImportIssues
      ? "The latest import checked an account but could not add every holding. Open the issue list before relying on the total."
      : "No account holdings imported yet. Check account access, then press Import holdings snapshot to add holdings.";

  return (
    <section aria-labelledby="portfolio-refresh-title">
      <Card className="border-outline-variant/40 bg-surface-high/30">
        <CardHeader className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
              <RefreshCw aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle as="h2" id="portfolio-refresh-title" className="text-xl text-on-surface">
                Import refresh status
              </CardTitle>
              <p className="mt-1 text-sm leading-6 text-outline">
                Manual refresh only. Import again whenever you want current balances.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsMetric label="Imported holdings" value={String(snapshot.count)} />
            <SettingsMetric label="Skipped entries" value={String(snapshot.skipped_count)} />
            <SettingsMetric label="Freshness" value={snapshot.status} />
            <SettingsMetric label="Last checked" value={formatSettingsTime(snapshot.last_imported_at ?? snapshot.last_checked_at)} />
            <SettingsMetric label="Account refresh" value="Manual refresh only" />
          </div>
          <p className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm leading-6 text-on-surface-variant">
            {statusNote}
          </p>
          {hasImportIssues ? (
            <details className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
                Import issues
              </summary>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-on-surface-variant">
                {snapshot.issues.map((issue) => (
                  <li key={`${issue.symbol}-${issue.reason}`}>
                    <span className="font-semibold text-on-surface">{issue.symbol}</span>
                    {" - "}
                    {issue.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-5 text-outline">
                Entries without a usable price or amount stay out of Portfolio so totals do not pretend to know more than the account source returned.
              </p>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function CredentialStateBadge({ configured, status }: { configured: boolean; status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 border text-xs",
        configured && "border-engine/35 bg-engine/10 text-engine",
        !configured && status === "blocked" && "border-critical/35 bg-critical/10 text-critical",
        !configured && status !== "blocked" && "border-caution/40 bg-caution/10 text-caution",
      )}
    >
      {configured ? "Configured" : status.replaceAll("-", " ")}
    </Badge>
  );
}

function CredentialQueueBadge({ status }: { status: CredentialQueueStatus }) {
  const label = status === "ready" ? "Ready" : status === "review" ? "Review" : status === "blocked" ? "Blocked" : "Missing";
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 border text-xs",
        status === "ready" && "border-engine/35 bg-engine/10 text-engine",
        status === "review" && "border-violet/35 bg-violet/10 text-violet",
        status === "missing" && "border-caution/40 bg-caution/10 text-caution",
        status === "blocked" && "border-critical/35 bg-critical/10 text-critical",
      )}
    >
      {label}
    </Badge>
  );
}

function SettingsMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className="mt-1 break-words text-base font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: IntegrationStatusJson["status"] }) {
  return (
    <Badge
      className={cn(
        "border text-xs",
        status === "connected" && "border-engine/30 bg-engine/10 text-engine",
        status === "stubbed" && "border-caution/40 bg-caution/10 text-caution",
        status === "credential_gated" &&
          "border-violet/40 bg-violet/10 text-violet",
      )}
      variant="outline"
    >
      {statusLabels[status]}
    </Badge>
  );
}

function toSettingsIntegrationStatus(status: IntegrationStatusJson): SettingsIntegrationStatus {
  return {
    ...status,
    id: status.service === "llm" ? "int_live_chat" : status.id,
    service: status.service === "llm" ? "live_chat" : status.service,
  };
}

function formatSettingsTime(value: string | null) {
  if (!value) return "No import yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

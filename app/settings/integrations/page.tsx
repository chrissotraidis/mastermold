import { Database, ExternalLink, KeyRound, LockKeyhole, PlugZap, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BrainInitializationPanel } from "@/components/brain-initialization-panel";
import { PageHeader } from "@/components/page-header";
import { IntegrationKeyInput } from "@/components/integration-key-input";
import { ManualHoldingsPanel } from "@/components/manual-holdings-panel";
import { ProfileSettings } from "@/components/profile-settings";
import { SettingsWeb3CredentialConsole } from "@/components/settings-web3-credential-console";
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
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket, type Web3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3JupiterOrderPacket, type Web3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { getWeb3JupiterRehearsalHistory, type Web3JupiterRehearsalHistory } from "@/src/db/web3-jupiter-rehearsal-history";
import { buildWeb3AutonomyLaunchChecklist, type Web3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveOpsPacket, type Web3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import {
  buildWeb3OperatorCredentialHandoffReceipt,
  type Web3OperatorCredentialHandoffReceipt,
} from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3SignerCredentialPacket, type Web3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import { buildWeb3SupervisedLiveRunway, type Web3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import { getWeb3TradingStateAsync } from "@/src/db/web3-trading";

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
  const web3OperatorCredentialHandoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup: web3AccountReceipt,
    acquisition: web3AcquisitionReceipt,
    launchChecklist: web3LaunchChecklist,
  });
  const publicProvenanceLabel = productProvenanceLabel(portfolio.provenance.label);

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="Settings"
          subtitle="Add holdings, test account access, set up live chat, and see what is safe before trusting a daily read."
          provenance={publicProvenanceLabel}
        />

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
            credentialDoctor={web3CredentialDoctor}
            launchChecklist={web3LaunchChecklist}
            operatorCredentialHandoff={web3OperatorCredentialHandoff}
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
  credentialDoctor,
  launchChecklist,
  operatorCredentialHandoff,
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
  credentialDoctor: Web3CredentialDoctorHealth;
  launchChecklist: Web3AutonomyLaunchChecklist;
  operatorCredentialHandoff: Web3OperatorCredentialHandoffReceipt;
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

  return (
    <section aria-labelledby="web3-credential-runway-title">
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

          <SettingsWeb3CredentialConsole
            walletPublicKeyPreview={receipt.wallet_summary.wallet_public_key_preview}
            defaultWalletPublicKey={scopedWallet}
            maxTradeUsd={state.execution_readiness.config.max_trade_usd}
            dailySpendCapUsd={state.execution_readiness.config.daily_spend_cap_usd}
            maxSlippageBps={state.execution_readiness.config.max_slippage_bps}
            jupiterConfigured={receipt.environment_summary.jupiter_configured}
            scenario={state.scenario}
            source={state.market_source.mode}
            account={state.paper_account.mode}
            cycles={state.paper_account.cycle}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/trading"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/40 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15"
            >
              <KeyRound aria-hidden="true" className="size-4" />
              Open Web3 wiring
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
  const visibleInputs = receipt.inputs.slice(0, 8);
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
  const topChecks = health.checks.slice(0, 8);
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
        {topChecks.length > 0 ? topChecks.map((item) => (
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

type CredentialQueueStatus = "ready" | "missing" | "review" | "blocked";

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

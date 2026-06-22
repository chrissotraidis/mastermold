import { Activity, ArrowRight, BarChart3, Database, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { CopyRedactedPacketButton } from "@/components/copy-redacted-packet-button";
import { PageHeader } from "@/components/page-header";
import { Chip } from "@/components/sentinel";
import { Web3LiveCanaryConsole } from "@/components/web3-live-canary-console";
import { Web3TradingWorkspaceLoader } from "@/components/web3-trading-workspace-loader";
import { buildWeb3AccountAcquisitionReceipt } from "@/src/db/web3-account-acquisition";
import { buildWeb3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { buildWeb3CanaryStatusReceipt, type Web3CanaryStatusReceipt } from "@/src/db/web3-canary-status";
import { buildWeb3CredentialRequirementsReceipt } from "@/src/db/web3-credential-requirements";
import { buildWeb3CutoverBlockerBoard, type Web3CutoverBlockerBoard } from "@/src/db/web3-cutover-blocker-board";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3FirstCanaryDrillReceipt, type Web3FirstCanaryDrillLane, type Web3FirstCanaryDrillReceipt } from "@/src/db/web3-first-canary-drill";
import { buildWeb3FirstCanaryHandoffReceipt, type Web3FirstCanaryHandoffReceipt } from "@/src/db/web3-first-canary-handoff";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { getWeb3MarketMonitorHistory, type Web3MarketMonitorHistory } from "@/src/db/web3-market-monitor-history";
import { buildWeb3OperatorCredentialHandoffReceipt } from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3OperatorRequestPacket } from "@/src/db/web3-operator-request-packet";
import { buildWeb3OperatorRunbook, type Web3OperatorRunbookReceipt } from "@/src/db/web3-operator-runbook";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import { buildWeb3LiveIgnitionReceipt, type Web3LiveIgnitionCheck, type Web3LiveIgnitionReceipt } from "@/src/db/web3-live-ignition";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import { buildWeb3LiveTradeCanaryReceipt, type Web3LiveTradeCanaryReceipt } from "@/src/db/web3-live-trade-canary";
import { buildWeb3LiveUnsignedOrderPreflightReceipt } from "@/src/db/web3-live-unsigned-order-handoff";
import { buildWeb3LiveUsabilityBlockersReceipt, type Web3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import { buildWeb3LocalCredentialInstallHealth } from "@/src/db/web3-local-credential-install";
import { buildWeb3ManualLiveReviewPacket } from "@/src/db/web3-manual-live-review-packet";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { buildWeb3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import { buildWeb3ResearchHandoffPacket } from "@/src/db/web3-research-handoff-packet";
import { buildWeb3SupervisedLiveRunway, type Web3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import { buildWeb3SupervisedCanaryReadinessReceipt, type Web3SupervisedCanaryReadinessLane, type Web3SupervisedCanaryReadinessReceipt } from "@/src/db/web3-supervised-canary-readiness";
import { buildWeb3UsabilityStatus, type Web3UsabilityStatusReceipt } from "@/src/db/web3-usability-status";
import { getWeb3TradingStateAsync, isTradingAccountMode, isTradingMarketSource, isTradingScenario } from "@/src/db/web3-trading";
import { getLatestWeb3WalletOwnershipReceipt } from "@/src/db/web3-wallet-ownership";

export const dynamic = "force-dynamic";

const TRADING_LIVE_CANARY_CONSOLE_HREF = "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console";
const SETTINGS_WEB3_RUNWAY_HREF = "/settings/integrations#settings-web3-credentials-runway";

type TradingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TradingPage({ searchParams }: TradingPageProps) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const accountParam = firstParam(params?.account);
  const sourceParam = firstParam(params?.source);
  const scenarioParam = firstParam(params?.scenario);
  const account = accountParam && isTradingAccountMode(accountParam) ? accountParam : "persistent";
  const source = sourceParam && isTradingMarketSource(sourceParam) ? sourceParam : "live-dex";
  const scenario = scenarioParam && isTradingScenario(scenarioParam) ? scenarioParam : "breakout";
  const initialState = await getWeb3TradingStateAsync({
    account,
    source,
    scenario,
  });
  const latestWalletOwnership = getLatestWeb3WalletOwnershipReceipt(initialState.execution_readiness.config.wallet_public_key);
  const supervisorHealth = getWeb3DaemonSupervisorHealth();
  const promotedAutopilotHealth = getWeb3PromotedPaperAutopilotHealth();
  const monitorHistory = getWeb3MarketMonitorHistory();
  const launchChecklist = buildWeb3AutonomyLaunchChecklist(initialState, promotedAutopilotHealth, supervisorHealth);
  const productionSupervisor = buildWeb3ProductionSupervisorReadiness(supervisorHealth);
  const accountSetup = buildWeb3AccountSetupReceipt(initialState);
  const accounting = buildWeb3AccountingLedgerReceipt(initialState);
  const liveOps = buildWeb3LiveOpsPacket({
    state: initialState,
    productionSupervisor,
    emergencyStop: buildWeb3EmergencyStopDrillReceipt({
      reason: "trading cockpit supervised live preview",
      operator_ack: true,
    }),
    accounting,
  });
  const dedicatedWallet = buildWeb3DedicatedWalletPacket(initialState);
  const jupiterOrder = buildWeb3JupiterOrderPacket(initialState);
  const signerPacket = buildWeb3SignerCredentialPacket(initialState);
  const supervisedLiveRunway = buildWeb3SupervisedLiveRunway({
    state: initialState,
    wallet: dedicatedWallet,
    jupiter: jupiterOrder,
    signer: signerPacket,
    liveOps,
  });
  const usabilityStatus = buildWeb3UsabilityStatus({
    state: initialState,
    launchChecklist,
    supervisedRunway: supervisedLiveRunway,
  });
  const operatorCredentialHandoff = buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup,
    acquisition: buildWeb3AccountAcquisitionReceipt(initialState),
    launchChecklist,
  });
  const operatorRequestPacket = buildWeb3OperatorRequestPacket(operatorCredentialHandoff, { usability: usabilityStatus });
  const cutoverBlockerBoard = buildWeb3CutoverBlockerBoard({
    requestPacket: operatorRequestPacket,
    runway: supervisedLiveRunway,
    usability: usabilityStatus,
  });
  const liveCapitalPreflight = buildWeb3LiveCapitalPreflightReceipt({
    state: initialState,
    checklist: launchChecklist,
  });
  const manualLiveReview = buildWeb3ManualLiveReviewPacket({
    state: initialState,
    checklist: launchChecklist,
    preflight: liveCapitalPreflight,
    liveOps,
    runway: supervisedLiveRunway,
  });
  const operatorRunbook = buildWeb3OperatorRunbook({
    state: initialState,
    usability: usabilityStatus,
    cutover: cutoverBlockerBoard,
    preflight: liveCapitalPreflight,
    runway: supervisedLiveRunway,
    currentInput: operatorRequestPacket.current_input,
  });
  const liveUsabilityBlockers = buildWeb3LiveUsabilityBlockersReceipt({
    state: initialState,
    usability: usabilityStatus,
    cutover: cutoverBlockerBoard,
    runbook: operatorRunbook,
    preflight: liveCapitalPreflight,
    manualLiveReview,
    runway: supervisedLiveRunway,
    currentInput: operatorRequestPacket.current_input,
  });
  const liveTradeCanary = buildWeb3LiveTradeCanaryReceipt(initialState);
  const liveIgnition = buildWeb3LiveIgnitionReceipt({
    state: initialState,
    liveUsability: liveUsabilityBlockers,
    canary: liveTradeCanary,
  });
  const unsignedCanaryPreflight = buildWeb3LiveUnsignedOrderPreflightReceipt(initialState, {
    operator_ack: true,
    canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
    wallet_public_key: initialState.execution_readiness.config.wallet_public_key,
    amount_lamports: 100_000,
    max_slippage_bps: initialState.execution_readiness.config.max_slippage_bps,
  });
  const supervisedCanaryReadiness = buildWeb3SupervisedCanaryReadinessReceipt({
    state: initialState,
    wallet: dedicatedWallet,
    jupiter: jupiterOrder,
    signer: signerPacket,
    livePreflight: liveCapitalPreflight,
    ignition: liveIgnition,
    unsignedPreflight: unsignedCanaryPreflight,
    canary: liveTradeCanary,
  });
  const firstCanaryDrill = buildWeb3FirstCanaryDrillReceipt({
    state: initialState,
    liveUsability: liveUsabilityBlockers,
    readiness: supervisedCanaryReadiness,
    jupiter: jupiterOrder,
    unsignedPreflight: unsignedCanaryPreflight,
    canary: liveTradeCanary,
  });
  const researchHandoff = buildWeb3ResearchHandoffPacket({
    state: initialState,
    usability: usabilityStatus,
    handoff: operatorCredentialHandoff,
    requestPacket: operatorRequestPacket,
    cutover: cutoverBlockerBoard,
    runbook: operatorRunbook,
    preflight: liveCapitalPreflight,
    runway: supervisedLiveRunway,
    manualLiveReview,
  });
  const credentialRequirements = buildWeb3CredentialRequirementsReceipt(researchHandoff);
  const firstCanaryHandoff = buildWeb3FirstCanaryHandoffReceipt({
    drill: firstCanaryDrill,
    requirements: credentialRequirements,
  });
  const localCredentialStatus = buildWeb3LocalCredentialInstallHealth(localCredentialStatusRequest(requestHeaders));
  const canaryStatus = buildWeb3CanaryStatusReceipt({
    canary: liveTradeCanary,
    ignition: liveIgnition,
    localCredentials: localCredentialStatus,
  });
  const shellStatus = initialState.autonomous_edge_stack_execution.status === "blocked"
    ? "Edge action blocked"
    : initialState.autonomous_edge_stack_execution.selected_action.replace("-", " ");
  const provenanceLabel = source === "live-dex" ? "Live DEX read" : "Sample data";

  return (
    <AppShell dataMode={provenanceLabel}>
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        <PageHeader
          title="Web3 Autopilot"
          subtitle="Autonomous Web3 trading desk and copilot for live memecoin monitoring, wallet growth, route checks, and gated canary execution."
          provenance={provenanceLabel}
          right={<Chip tone={initialState.autonomous_edge_stack_execution.status === "blocked" ? "critical" : "caution"}>{shellStatus}</Chip>}
        />

        <div className="w-full min-w-0 space-y-4">
          <TradingSourceSwitch source={source} account={account} scenario={initialState.scenario} />
          <LiveCanaryCommandCenter
            status={canaryStatus}
            ignition={liveIgnition}
            readiness={supervisedCanaryReadiness}
            blockers={liveUsabilityBlockers}
            canary={liveTradeCanary}
            drill={firstCanaryDrill}
          />
          <TradingOperatorInputPacket receipt={liveTradeCanary} handoff={firstCanaryHandoff} />
          <Web3LiveCanaryConsole
            receipt={liveTradeCanary}
            firstCanaryDrill={firstCanaryDrill}
            initialWalletOwnershipReceipt={latestWalletOwnership}
            source={source}
            account={account}
            scenario={initialState.scenario}
            cycles={0}
            maxTradeUsd={initialState.execution_readiness.config.max_trade_usd}
            dailySpendCapUsd={initialState.execution_readiness.config.daily_spend_cap_usd}
            maxSlippageBps={initialState.execution_readiness.config.max_slippage_bps}
            defaultWalletPublicKey={initialState.execution_readiness.config.wallet_public_key}
          />
          <TradingCommandBoard
            state={initialState}
            status={usabilityStatus}
            runway={supervisedLiveRunway}
            launchChecklist={launchChecklist}
            cutover={cutoverBlockerBoard}
            runbook={operatorRunbook}
            preflight={liveCapitalPreflight}
            liveUsabilityBlockers={liveUsabilityBlockers}
          />
          <ReadinessReceiptsDrawer
            source={source}
            account={account}
            scenario={initialState.scenario}
            liveIgnitionStatus={liveIgnition.status}
            canaryReadinessStatus={supervisedCanaryReadiness.status}
            liveAutonomyStatus={initialState.autonomous_live_autonomy_readiness.status}
            liveUsabilityStatus={liveUsabilityBlockers.status}
            usabilityMode={usabilityStatus.current_mode}
            cutoverSummary={`${cutoverBlockerBoard.open_blocker_count} open blockers`}
            runbookSummary={`${operatorRunbook.allowed_now_count} safe actions`}
          />
          <MarketMonitorHistoryPanel history={monitorHistory} />

          <Web3TradingWorkspaceLoader
            initialPromotedAutopilotHealth={promotedAutopilotHealth}
            initialSource={source}
            initialAccount={account}
          />
        </div>
      </div>
    </AppShell>
  );
}

function localCredentialStatusRequest(requestHeaders: Headers) {
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:4010";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return new Request(`${protocol}://${host}/api/web3-local-credentials`, {
    headers: {
      host,
      "x-forwarded-host": host,
    },
  });
}

function TradingOperatorInputPacket({
  receipt,
  handoff,
}: {
  receipt: Web3LiveTradeCanaryReceipt;
  handoff: Web3FirstCanaryHandoffReceipt;
}) {
  const nextInput = receipt.next_required_input;
  const openInputs = receipt.required_inputs
    .filter((input) => input.status !== "done")
    .slice(0, 4);
  const canaryEndpoint = `/api/web3-live-trade-canary?source=${receipt.source}&account=${receipt.account}&scenario=${receipt.scenario}&cycles=0`;
  const handoffEndpoint = `/api/web3-first-canary-handoff?source=${receipt.source}&account=${receipt.account}&scenario=${receipt.scenario}&cycles=0`;
  const safeTargetLabel = nextInput?.target_names.join(", ") ?? "No open target";
  const ownerLabel = nextInput?.owner.replace("-", " ") ?? "system";
  const contract = handoff.current_step_contract;
  const handoffCommand = handoff.safe_commands.find((command) => command.includes("handoff-canary:web3")) ?? null;

  return (
    <section
      aria-label="Trading operator live canary input packet"
      className="rounded-md border border-engine/25 bg-engine/[0.035] p-4 sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.88fr)_minmax(18rem,0.62fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Operator inputs needed</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-on-surface">
                {nextInput ? nextInput.label : "First canary inputs are accounted"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
                {nextInput?.completion_signal ?? "Run the strict proof command before any autonomy review."}
              </p>
            </div>
            <span className={tradingOperatorInputStatusClassName(nextInput?.status ?? "done")}>
              {(nextInput?.status ?? "done").replaceAll("-", " ")}
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <LiveUsabilityStat label="Safe value" value={safeTargetLabel} tone={nextInput ? "caution" : "engine"} />
            <LiveUsabilityStat label="Owner" value={ownerLabel} tone={nextInput?.owner === "external-wallet" ? "caution" : "engine"} />
            <LiveUsabilityStat label="Live trade" value={receipt.actual_live_trade_tested ? "tested" : "not tested"} tone={receipt.actual_live_trade_tested ? "engine" : "critical"} />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Trading operator canary safe boundaries">
            <div className="rounded-md border border-outline/15 bg-surface/55 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe to provide here</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                {nextInput?.safe_value_type ?? "Receipt hashes, public wallet addresses, verifier output summaries, and external review status."}
              </p>
            </div>
            <div className="rounded-md border border-critical/25 bg-critical/[0.035] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Never provide here</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                Private keys, seed phrases, keypair JSON, raw transaction bytes, API keys, or signed payload text.
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <CopyRedactedPacketButton
              text={handoff.text_packet}
              label="Copy handoff"
              copiedLabel="Copied"
              ariaLabel="Copy first funded canary handoff from Trading"
              className="min-h-10 border-caution/35 bg-caution/10 px-3 py-2 text-caution hover:bg-caution/15"
            />
            {nextInput ? (
              <Link
                href={nextInput.safe_surface}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine transition hover:bg-engine/15"
              >
                Open next input
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
            <Link
              href={handoffEndpoint}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open handoff JSON
            </Link>
            <Link
              href={canaryEndpoint}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open canary receipt
            </Link>
            <Link
              href={SETTINGS_WEB3_RUNWAY_HREF}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open credential runway
            </Link>
          </div>

          {nextInput?.verifier_command ? (
            <code className="mt-3 block break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
              {nextInput.verifier_command}
            </code>
          ) : null}

          <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.035] p-3" aria-label="Trading first funded canary share packet">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Shareable canary handoff</p>
                <p className="mt-1 text-xs font-semibold text-on-surface">{contract.label}</p>
              </div>
              <span className={tradingOperatorInputStatusClassName(contract.status)}>
                {contract.status.replaceAll("-", " ")}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-on-surface-variant">{contract.action}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <LiveUsabilityStat label="Proof" value={`${handoff.proof_pass_count}/${handoff.proof_required_count}`} tone={handoff.proof_pass_count === handoff.proof_required_count ? "engine" : "critical"} />
              <LiveUsabilityStat label="Open steps" value={`${handoff.open_steps.length}`} tone={handoff.open_steps.length > 0 ? "critical" : "engine"} />
              <LiveUsabilityStat label="Packet" value={handoff.status.replaceAll("-", " ")} tone={handoff.status === "canary-proven" ? "engine" : "caution"} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">
              Copying this packet gives a helper the redacted current-step contract, proof ledger, safe values, never-provide boundary, and strict commands. It still cannot sign, submit, store payloads, or prove a live trade.
            </p>
            {handoffCommand ? (
              <code className="mt-2 block break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                {handoffCommand}
              </code>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-2" aria-label="Trading operator open canary inputs">
          {openInputs.length > 0 ? openInputs.map((input) => (
            <Link
              key={input.id}
              href={input.safe_surface}
              className="grid min-w-0 gap-2 rounded-md border border-outline/15 bg-surface/55 p-2.5 transition hover:border-engine/35"
            >
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-xs font-semibold text-on-surface">{input.label}</span>
                <span className={tradingOperatorInputStatusClassName(input.status)}>
                  {input.status.replaceAll("-", " ")}
                </span>
              </div>
              <p className="line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{input.completion_signal}</p>
              {input.verifier_command ? (
                <code className="block truncate text-[10px] leading-4 text-outline">{input.verifier_command}</code>
              ) : null}
            </Link>
          )) : (
            <div className="rounded-md border border-engine/20 bg-engine/[0.035] p-3">
              <p className="text-xs font-semibold text-on-surface">No open input rows</p>
              <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
                Keep live execution blocked until the signed canary, confirmation, settlement, and mirror proof are complete.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function tradingOperatorInputStatusClassName(status: Web3LiveTradeCanaryReceipt["required_inputs"][number]["status"] | "done" | "complete" | "next" | "watch") {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "done") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "needed-now" || status === "external-signature" || status === "proof-watch" || status === "next" || status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function TradingSourceSwitch({
  source,
  account,
  scenario,
}: {
  source: "sample" | "live-dex";
  account: "persistent" | "ephemeral";
  scenario: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>["scenario"];
}) {
  const sourceLabel = source === "live-dex" ? "Live DEX read" : "Sample tape";
  const sourceDetail = source === "live-dex"
    ? "Using public DEX and read-only route evidence when providers respond."
    : "Using seeded review data so the cockpit is safe to explore without credentials.";

  return (
    <section
      aria-label="Web3 market source switch"
      className="rounded-md border border-outline/15 bg-surface/70 p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Market source</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">{sourceLabel}</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{sourceDetail}</p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:w-auto" aria-label="Choose Web3 market source">
          <TradingSourceLink
            href={tradingSourceHref("sample", account, scenario)}
            active={source === "sample"}
            icon={<Database aria-hidden="true" className="size-4" />}
            label="Sample tape"
          />
          <TradingSourceLink
            href={tradingSourceHref("live-dex", account, scenario)}
            active={source === "live-dex"}
            icon={<Activity aria-hidden="true" className="size-4" />}
            label="Live DEX read"
          />
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-outline">
        Plain /trading opens the live DEX breakout canary view by default. Source switching changes read-only market evidence only; signing, submission, wallet mutation, private-key storage, and seed phrase storage stay blocked.
      </p>
    </section>
  );
}

function LiveIgnitionPanel({ receipt }: { receipt: Web3LiveIgnitionReceipt }) {
  const leadingChecks = [
    ...receipt.checks.filter((check) => check.status === "fail"),
    ...receipt.checks.filter((check) => check.status === "watch"),
    ...receipt.checks.filter((check) => check.status === "pass"),
  ].slice(0, 4);
  const canaryHref = `/api/web3-live-ignition?source=${receipt.source}&account=${receipt.account}&scenario=${receipt.scenario}&cycles=0`;

  return (
    <section
      aria-labelledby="web3-live-ignition-title"
      className="rounded-md border border-critical/25 bg-critical/[0.025] p-4 sm:p-5"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.86fr)_minmax(22rem,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Live ignition gate</p>
              <h2 id="web3-live-ignition-title" className="mt-1 font-display text-xl font-semibold text-on-surface">
                {receipt.can_autonomously_trade_real_money_now
                  ? "Autonomous live trading can be reviewed"
                  : receipt.can_start_supervised_canary_now
                    ? "Supervised canary is ready"
                    : "Autonomous live trading is blocked"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">{receipt.next_action}</p>
            </div>
            <span className={liveIgnitionStatusClassName(receipt.status)}>
              {receipt.status.replaceAll("-", " ")}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LiveUsabilityStat label="Autonomy" value={receipt.can_autonomously_trade_real_money_now ? "ready" : "blocked"} tone={receipt.can_autonomously_trade_real_money_now ? "engine" : "critical"} />
            <LiveUsabilityStat label="Canary" value={receipt.actual_live_trade_tested ? "tested" : "untested"} tone={receipt.actual_live_trade_tested ? "engine" : "critical"} />
            <LiveUsabilityStat label="First path" value={receipt.first_trade_path.replaceAll("-", " ")} tone={receipt.first_trade_path === "blocked" ? "critical" : "caution"} />
            <LiveUsabilityStat label="Blockers" value={`${receipt.blocker_count}`} tone={receipt.blocker_count > 0 ? "critical" : "engine"} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={canaryHref}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open ignition JSON
            </Link>
            <Link
              href="/settings/integrations#settings-web3-credentials-runway"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine transition hover:bg-engine/15"
            >
              Fix live gates
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <p className="mt-3 text-xs leading-5 text-outline">
            This is a read-only go/no-go contract for the bot. It cannot sign, submit, store wallet authority, custody funds, mutate wallets, echo secrets, or count paper trades as live money.
          </p>
        </div>

        <div className="grid min-w-0 gap-2" aria-label="Trading live ignition checks">
          {leadingChecks.map((check) => (
            <div key={check.id} className="grid min-w-0 gap-2 rounded-md border border-outline/15 bg-surface/55 p-2.5 sm:grid-cols-[minmax(0,0.44fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={liveIgnitionCheckClassName(check.status)}>{check.status}</span>
                  <p className="text-xs font-semibold text-on-surface">{check.label}</p>
                </div>
                <Link href={check.evidence_endpoint} className="mt-1 block truncate text-[11px] leading-4 text-outline transition hover:text-engine">
                  {check.evidence_endpoint}
                </Link>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] leading-4 text-on-surface-variant">{check.detail}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">{check.next_action}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function liveIgnitionStatusClassName(status: Web3LiveIgnitionReceipt["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "autonomy-ready" || status === "canary-proven") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "supervised-canary-ready") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function liveIgnitionCheckClassName(status: Web3LiveIgnitionCheck["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "pass") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function SupervisedCanaryReadinessPanel({ receipt }: { receipt: Web3SupervisedCanaryReadinessReceipt }) {
  const visibleLanes = [
    ...receipt.lanes.filter((lane) => lane.blocks_first_canary && lane.status !== "pass"),
    ...receipt.lanes.filter((lane) => lane.blocks_first_canary && lane.status === "pass"),
    ...receipt.lanes.filter((lane) => !lane.blocks_first_canary),
  ].slice(0, 6);
  const attempt = receipt.canary_attempt_contract;
  const latestAttempt = receipt.latest_attempt_receipt;

  return (
    <section
      aria-labelledby="web3-supervised-canary-readiness-title"
      className="rounded-md border border-caution/25 bg-caution/[0.025] p-4 sm:p-5"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(22rem,1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">First funded canary readiness</p>
              <h2 id="web3-supervised-canary-readiness-title" className="mt-1 font-display text-xl font-semibold text-on-surface">
                {receipt.actual_live_trade_tested
                  ? "Funded canary proof exists"
                  : receipt.can_relay_signed_payload_now
                    ? "Signed canary relay is ready"
                    : receipt.can_request_unsigned_order_now
                      ? "Tiny unsigned canary is ready"
                      : "First live canary is blocked"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">{receipt.next_action}</p>
            </div>
            <span className={supervisedCanaryStatusClassName(receipt.status)}>
              {receipt.status.replaceAll("-", " ")}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LiveUsabilityStat label="Unsigned order" value={receipt.can_request_unsigned_order_now ? "ready" : "blocked"} tone={receipt.can_request_unsigned_order_now ? "engine" : "critical"} />
            <LiveUsabilityStat label="Signed relay" value={receipt.can_relay_signed_payload_now ? "ready" : "blocked"} tone={receipt.can_relay_signed_payload_now ? "engine" : "critical"} />
            <LiveUsabilityStat label="Live trade" value={receipt.actual_live_trade_tested ? "tested" : "not tested"} tone={receipt.actual_live_trade_tested ? "engine" : "critical"} />
            <LiveUsabilityStat label="Blockers" value={`${receipt.blocker_count}`} tone={receipt.blocker_count > 0 ? "critical" : "engine"} />
          </div>

          <div className="mt-3 rounded-md border border-engine/20 bg-engine/[0.035] p-3" aria-label="Trading first live canary attempt contract">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Live canary attempt contract</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">{attempt.operator_action_label}</p>
              </div>
              <span className={canaryAttemptStageClassName(attempt.stage, attempt.runnable_now)}>
                {attempt.stage.replaceAll("-", " ")}
              </span>
            </div>
            <div className="mt-2 grid gap-1.5">
              <Link href={attempt.primary_endpoint} className="truncate rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[11px] leading-5 text-outline transition hover:text-engine">
                {attempt.primary_endpoint}
              </Link>
              <code className="block overflow-x-auto whitespace-nowrap rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                {attempt.exact_next_command}
              </code>
            </div>
            {attempt.missing_inputs.length > 0 ? (
              <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">
                Missing: {attempt.missing_inputs[0]}
              </p>
            ) : null}
            {latestAttempt ? (
              <div className="mt-2 rounded-md border border-violet/20 bg-violet/[0.035] p-2" aria-label="Trading latest live canary gate check">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-violet">Latest gate check</p>
                  <span className={canaryAttemptStageClassName(latestAttempt.stage, latestAttempt.runnable_now)}>
                    {latestAttempt.status.replaceAll("-", " ")}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
                  {latestAttempt.actual_live_trade_tested
                    ? "A funded canary proof exists."
                    : latestAttempt.first_blocker ?? latestAttempt.next_action}
                </p>
                <p className="mt-1 truncate text-[10px] leading-4 text-outline">
                  {latestAttempt.generated_at} · receipt {latestAttempt.receipt_hash.slice(0, 10)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-4 text-outline">
                No live gate check receipt recorded yet; use Record gate check in the live cockpit to persist the current blocker without signing or submitting.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={receipt.unsigned_handoff_endpoint}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open preflight JSON
            </Link>
            <Link
              href={receipt.settings_fix_href}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine transition hover:bg-engine/15"
            >
              Fix canary gates
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <p className="mt-3 text-xs leading-5 text-outline">
            This ladder is the first real-money proof path: tiny unsigned order, external browser-wallet signature, guarded signed-payload relay, then settlement and portfolio mirror proof. It still cannot store private keys, seed phrases, signed payloads, or wallet authority.
          </p>
        </div>

        <div className="grid min-w-0 gap-2" aria-label="Trading supervised canary readiness lanes">
          {visibleLanes.map((lane) => (
            <div key={lane.id} className="grid min-w-0 gap-2 rounded-md border border-outline/15 bg-surface/55 p-2.5 sm:grid-cols-[minmax(0,0.4fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={supervisedCanaryLaneClassName(lane.status)}>{lane.status}</span>
                  <p className="text-xs font-semibold text-on-surface">{lane.label}</p>
                </div>
                <Link href={lane.evidence_endpoint} className="mt-1 block truncate text-[11px] leading-4 text-outline transition hover:text-engine">
                  {lane.evidence_endpoint}
                </Link>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] leading-4 text-on-surface-variant">{lane.detail}</p>
                <p className="mt-1 text-[11px] leading-4 text-outline">{lane.next_action}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function canaryAttemptStageClassName(stage: Web3SupervisedCanaryReadinessReceipt["canary_attempt_contract"]["stage"], runnableNow: boolean) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (stage === "canary-proven" || (runnableNow && stage === "proof-watch")) return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (runnableNow) return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function supervisedCanaryStatusClassName(status: Web3SupervisedCanaryReadinessReceipt["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "canary-tested" || status === "signed-relay-ready") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "unsigned-order-ready") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function supervisedCanaryLaneClassName(status: Web3SupervisedCanaryReadinessLane["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "pass") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function firstCanaryDrillStatusClassName(status: Web3FirstCanaryDrillReceipt["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "canary-proven" || status === "ready-to-relay-signed-payload") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "ready-to-request-unsigned-order") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function firstCanaryDrillLaneClassName(status: Web3FirstCanaryDrillLane["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "pass") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function firstCanaryUnblockStepClassName(status: "done" | "next" | "blocked" | "watch") {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "done") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "next" || status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function liveTestLedgerStatusClassName(tone: "engine" | "caution" | "critical") {
  const base = "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (tone === "engine") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (tone === "caution") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function canaryProofStageClassName(status: "pass" | "watch" | "fail") {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "pass") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function TradingSourceLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={active
        ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine"
        : "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-outline/20 bg-surface-dim/45 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function tradingSourceHref(source: "sample" | "live-dex", account: "persistent" | "ephemeral", scenario: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>["scenario"]) {
  const params = new URLSearchParams({ source, scenario });
  if (account !== "persistent") params.set("account", account);
  return `/trading?${params.toString()}`;
}

function LiveCanaryCommandCenter({
  status,
  ignition,
  readiness,
  blockers,
  canary,
  drill,
}: {
  status: Web3CanaryStatusReceipt;
  ignition: Web3LiveIgnitionReceipt;
  readiness: Web3SupervisedCanaryReadinessReceipt;
  blockers: Web3LiveUsabilityBlockersReceipt;
  canary: ReturnType<typeof buildWeb3LiveTradeCanaryReceipt>;
  drill: Web3FirstCanaryDrillReceipt;
}) {
  const canaryProven = drill.status === "canary-proven" && drill.actual_live_trade_tested && drill.real_funds_moved_by_this_app;
  const nextCredential = blockers.next_credential_request;
  const nextBlocker = blockers.next_blocker;
  const nextCanaryLane = drill.lanes.find((lane) => lane.status === "fail") ?? drill.lanes.find((lane) => lane.status === "watch") ?? readiness.lanes.find((lane) => lane.id === readiness.next_lane_id);
  const drillCommand = drill.strict_ready_command.replace(" --require-ready", "");
  const proofCommand = drill.strict_proof_command;
  const liveHref = `/trading?source=live-dex&account=persistent&scenario=${drill.scenario}#web3-live-canary-console`;
  const drillHref = drill.live_review_source_endpoint;
  const liveTestLedgerHref = `/api/web3-live-test-ledger?source=${canary.source}&account=${canary.account}&scenario=${canary.scenario}&cycles=0`;
  const liveUsabilitySummaryHref = `/api/web3-live-usability-summary?source=${canary.source}&account=${canary.account}&scenario=${canary.scenario}&cycles=0`;
  const canaryStatusHref = `/api/web3-canary-status?source=${canary.source}&account=${canary.account}&scenario=${canary.scenario}&cycles=0`;
  const walletIntakeContractHref = `/api/web3-dedicated-wallet-intake-contract?source=${canary.source}&account=${canary.account}&scenario=${canary.scenario}&cycles=0`;
  const canaryAttemptSummaryHref = `/api/web3-supervised-canary-readiness?source=${canary.source}&account=${canary.account}&scenario=${canary.scenario}&cycles=0`;
  const attemptContract = readiness.canary_attempt_contract;
  const attemptMissingInputs = attemptContract.missing_inputs.slice(0, 4);
  const nextProof = canary.post_signing_evidence.find((item) => item.status !== "pass") ?? null;
  const proofPassCount = canary.post_signing_evidence.filter((item) => item.status === "pass").length;
  const latestAttempt = readiness.latest_attempt_receipt;
  const leadingDrillLanes = [
    ...drill.lanes.filter((lane) => lane.status === "fail"),
    ...drill.lanes.filter((lane) => lane.status === "watch"),
    ...drill.lanes.filter((lane) => lane.status === "pass"),
  ].slice(0, 4);
  const unblockSteps = [
    ...drill.operator_unblock_plan.filter((step) => step.status === "next" || step.status === "watch"),
    ...drill.operator_unblock_plan.filter((step) => step.status === "blocked"),
    ...drill.operator_unblock_plan.filter((step) => step.status === "done"),
  ].slice(0, 5);
  const jupiterOrderInput = canary.required_inputs.find((input) => input.id === "jupiter-order-rail");
  const liveFlagInput = canary.required_inputs.find((input) => input.id === "first-canary-live-flags");
  const liveTestLedgerRows = [
    {
      id: "paper-loop",
      label: "Paper autonomy",
      value: "tested",
      detail: "Backend loop, daemon, forward replay, and promoted-paper proof are simulator evidence only.",
      tone: "engine" as const,
    },
    {
      id: "live-dex-read",
      label: "Live DEX read",
      value: canary.source === "live-dex" ? "read-only" : "sample",
      detail: "Market and route reads can refresh public DEX evidence, but they cannot sign or move funds.",
      tone: canary.source === "live-dex" ? "caution" as const : "critical" as const,
    },
    {
      id: "order-rehearsal",
      label: "Order rehearsal",
      value: jupiterOrderInput?.status === "done" ? "ready" : "blocked",
      detail: jupiterOrderInput?.completion_signal ?? "Jupiter order proof is still required before an unsigned canary can be requested.",
      tone: jupiterOrderInput?.status === "done" ? "engine" as const : "critical" as const,
    },
    {
      id: "live-flags",
      label: "Live flags",
      value: liveFlagInput?.status === "done" ? "armed" : "missing",
      detail: liveFlagInput?.completion_signal ?? "Exact first-canary flags stay in ignored local env and do not grant live authority by themselves.",
      tone: liveFlagInput?.status === "done" ? "caution" as const : "critical" as const,
    },
    {
      id: "funded-trade",
      label: "Funded wallet trade",
      value: canary.actual_live_trade_tested ? "tested" : "not attempted",
      detail: canary.actual_live_trade_tested
        ? "A signed canary has proof; inspect settlement and portfolio mirror status before any autonomy review."
        : "No funded trade counts until the signed relay confirms, settlement reconciles, and the portfolio mirror is accounted.",
      tone: canary.actual_live_trade_tested ? "engine" as const : "critical" as const,
    },
  ];

  return (
    <section
      aria-labelledby="web3-live-command-center-title"
      className="rounded-md border border-critical/25 bg-surface/80 p-4 sm:p-5"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-critical/30 bg-critical/10 text-critical">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Live trading command center</p>
                <h2 id="web3-live-command-center-title" className="mt-1 font-display text-xl font-semibold text-on-surface">
                  {canaryProven
                    ? "Funded canary proof is accounted"
                    : drill.status === "ready-to-request-unsigned-order"
                      ? "Tiny canary can be prepared for review"
                      : drill.status === "ready-to-relay-signed-payload"
                        ? "Signed canary relay is the next stop"
                      : "No real trade tested yet"}
                </h2>
                <p className="mt-1 line-clamp-3 max-w-3xl text-sm leading-6 text-on-surface-variant">
                  {drill.next_action}
                </p>
              </div>
            </div>
            <span className={firstCanaryDrillStatusClassName(drill.status)}>
              {drill.status.replaceAll("-", " ")}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LiveUsabilityStat label="Live trade" value={canaryProven ? "proven" : "not tested"} tone={canaryProven ? "engine" : "critical"} />
            <LiveUsabilityStat label="Unsigned order" value={drill.can_request_unsigned_order_now ? "ready" : "blocked"} tone={drill.can_request_unsigned_order_now ? "caution" : "critical"} />
            <LiveUsabilityStat label="Signed relay" value={drill.signed_relay_status.replaceAll("-", " ")} tone={drill.signed_relay_status === "ready" || drill.signed_relay_status === "relayed" ? "engine" : "critical"} />
            <LiveUsabilityStat label="Proof" value={`${drill.proof_pass_count}/${drill.proof_required_count}`} tone={canaryProven ? "engine" : "critical"} />
          </div>

          <div className="mt-3 rounded-md border border-outline/15 bg-surface-dim/40 p-3" aria-label="Running app canary status">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Running app canary status</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {status.actual_live_trade_tested
                    ? "Funded canary proof exists"
                    : "Running app tested, funded trade not proven"}
                </p>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-on-surface-variant">{status.next_action}</p>
              </div>
              <Link
                href={canaryStatusHref}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline/20 bg-surface/70 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
              >
                Open status JSON
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <LiveUsabilityStat label="Autonomy" value={status.can_autonomously_trade_real_money_now ? "ready" : "blocked"} tone={status.can_autonomously_trade_real_money_now ? "engine" : "critical"} />
              <LiveUsabilityStat label="Next gate" value={status.next_gate_id?.replaceAll("-", " ") ?? "unknown"} tone={status.next_gate_id ? "critical" : "caution"} />
              <LiveUsabilityStat label="Credentials" value={`${status.local_credentials.configured_count}/${status.local_credentials.configured_count + status.local_credentials.missing_count}`} tone={status.local_credentials.missing_count === 0 ? "engine" : "caution"} />
              <LiveUsabilityStat label="Alignment" value={status.alignment.status} tone="engine" />
            </div>
            <div className="mt-3 grid gap-2" aria-label="Running app safe next commands">
              {status.safe_next_commands.slice(0, 5).map((command) => (
                <div key={command.id} className="rounded-md border border-outline/15 bg-surface/60 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-on-surface">{command.label}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-outline">{command.purpose}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                        {command.uses_placeholder ? "needs public value" : "ready"}
                      </span>
                      <CopyRedactedPacketButton
                        text={command.command}
                        label="Copy"
                        copiedLabel="Copied"
                        ariaLabel={`Copy ${command.label} command`}
                        className="min-h-8 border-outline/25 bg-surface px-2 text-[11px] text-on-surface-variant hover:border-engine/35 hover:bg-engine/10 hover:text-engine"
                      />
                    </div>
                  </div>
                  <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded border border-outline/10 bg-black/20 px-2 py-1 text-[10px] leading-5 text-outline">
                    {command.command}
                  </code>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">
              {status.alignment.detail} Safe commands are public/env-target setup only; this panel is read-only and cannot sign, submit, store wallet authority, or move funds.
            </p>
          </div>

          <div className="hidden gap-2 sm:mt-3 sm:grid sm:grid-cols-3">
            <LiveUsabilityContractStat label="Drill source" value={drill.source === "live-dex" ? "Live DEX" : "sample"} />
            <LiveUsabilityContractStat label="Hard fails" value={`${drill.hard_fail_count}`} />
            <LiveUsabilityContractStat label="Drill hash" value={drill.receipt_hash.slice(0, 12)} />
          </div>

          <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.035] p-3" aria-label="Trading first canary attempt summary">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">First canary attempt summary</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">{attemptContract.operator_action_label}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                  {attemptContract.runnable_now
                    ? "The next tiny canary action is runnable only through the guarded external-wallet path below."
                    : attemptMissingInputs[0] ?? readiness.next_action}
                </p>
              </div>
              <span className={canaryAttemptStageClassName(attemptContract.stage, attemptContract.runnable_now)}>
                {attemptContract.runnable_now ? "runnable" : "blocked"}
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <LiveUsabilityContractStat label="Stage" value={attemptContract.stage.replaceAll("-", " ")} />
              <LiveUsabilityContractStat label="Missing" value={`${attemptContract.missing_inputs.length}`} />
              <LiveUsabilityContractStat label="Acknowledgements" value={`${attemptContract.required_acknowledgements.length}`} />
            </div>
            <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.62fr)]">
              <code className="block overflow-x-auto whitespace-nowrap rounded-md border border-outline/15 bg-black/20 px-2 py-1.5 text-[11px] leading-5 text-outline">
                {attemptContract.exact_next_command}
              </code>
              <Link
                href={attemptContract.primary_endpoint}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-caution/30 bg-caution/10 px-2 py-1.5 text-xs font-semibold text-caution transition hover:bg-caution/15"
              >
                Open next endpoint
              </Link>
            </div>
            {attemptMissingInputs.length > 0 ? (
              <div className="mt-2 grid gap-1.5" aria-label="Trading first canary attempt missing inputs">
                {attemptMissingInputs.map((item) => (
                  <p key={item} className="line-clamp-2 rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[11px] leading-4 text-outline">
                    {item}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={canaryAttemptSummaryHref}
                className="inline-flex min-h-8 items-center rounded-md border border-outline/20 bg-surface-dim/55 px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
              >
                Open attempt readiness JSON
              </Link>
              <Link
                href="/settings/integrations#settings-web3-credentials-runway"
                className="inline-flex min-h-8 items-center rounded-md border border-outline/20 bg-surface-dim/55 px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
              >
                Open setup runway
              </Link>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-critical/20 bg-critical/[0.025] p-3" aria-label="Actual live trade test ledger">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Actual live trade test ledger</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {canary.actual_live_trade_tested ? "Funded canary evidence exists" : "Funded wallet trade not attempted"}
                </p>
              </div>
              <span className={firstCanaryDrillStatusClassName(drill.status)}>
                {canary.real_funds_moved_by_this_app ? "funds moved" : "no funds moved"}
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {liveTestLedgerRows.map((row) => (
                <div key={row.id} className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/40 p-2">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <p className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{row.label}</p>
                    <span className={liveTestLedgerStatusClassName(row.tone)}>{row.value}</span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-on-surface-variant">{row.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-outline">
              This ledger is the first-screen answer to what has actually run. Paper profit, live reads, and order rehearsal are not funded-trade proof.
            </p>
            <Link
              href={liveTestLedgerHref}
              className="mt-2 inline-flex min-h-8 items-center rounded-md border border-outline/20 bg-surface-dim/55 px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open ledger JSON
            </Link>
            <Link
              href={liveUsabilitySummaryHref}
              className="ml-2 mt-2 inline-flex min-h-8 items-center rounded-md border border-outline/20 bg-surface-dim/55 px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open usability JSON
            </Link>
            <Link
              href={walletIntakeContractHref}
              className="ml-2 mt-2 inline-flex min-h-8 items-center rounded-md border border-outline/20 bg-surface-dim/55 px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open wallet contract
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={liveHref}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15"
            >
              Open live cockpit
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              href={nextCredential?.fix_href ?? nextBlocker?.href ?? "/settings/integrations#settings-web3-credentials-runway"}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-sm font-semibold text-caution transition hover:bg-caution/15"
            >
              {nextCredential?.label ?? nextBlocker?.label ?? "Fix next gate"}
            </Link>
            <Link
              href={drillHref}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-sm font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open drill receipt
            </Link>
          </div>
        </div>

        <div className="grid min-w-0 gap-3">
          <div className="rounded-md border border-critical/20 bg-critical/[0.025] p-3" aria-label="Trading first canary drill status">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">First canary drill</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">{drill.next_lane_label ?? nextCanaryLane?.label ?? nextBlocker?.label ?? nextCredential?.label ?? "First funded canary"}</p>
              </div>
              <span className={firstCanaryDrillStatusClassName(drill.status)}>
                {drill.status.replaceAll("-", " ")}
              </span>
            </div>
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">
              {drill.next_lane_action ?? nextCanaryLane?.next_action ?? drill.next_action}
            </p>
            {drill.current_input_label ? (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2" aria-label="Trading canary queue split">
                <p className="truncate rounded-md border border-critical/15 bg-critical/[0.025] px-2 py-1 text-[11px] leading-5 text-outline">
                  Canary lane: <span className="font-semibold text-on-surface">{drill.next_lane_label ?? nextCanaryLane?.label ?? "review"}</span>
                </p>
                <p className="truncate rounded-md border border-caution/20 bg-caution/[0.035] px-2 py-1 text-[11px] leading-5 text-outline">
                  Credential intake: <span className="font-semibold text-on-surface">{drill.current_input_label}</span>
                </p>
              </div>
            ) : null}
            {nextCredential?.safe_value_description ? (
              <p className="mt-2 line-clamp-2 rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[11px] leading-5 text-outline">
                {nextCredential.safe_value_description}
              </p>
            ) : null}
          </div>

          <div className="rounded-md border border-caution/25 bg-caution/[0.03] p-3" aria-label="Trading first canary operator unblock plan">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Operator unblock plan</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {drill.next_unblock_step?.label ?? "No canary blocker is next"}
                </p>
              </div>
              <span className={firstCanaryUnblockStepClassName(drill.next_unblock_step?.status ?? "done")}>
                {drill.next_unblock_step?.status ?? "done"}
              </span>
            </div>
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">
              {drill.next_unblock_step?.action ?? "All first-canary unblock steps are clear; run the strict proof command before any autonomy review."}
            </p>
            <div className="mt-2 grid gap-2" aria-label="Trading ordered first canary unblock steps">
              {unblockSteps.map((step) => (
                <div key={step.id} className="grid min-w-0 gap-2 rounded-md border border-outline/15 bg-surface/50 p-2 sm:grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={firstCanaryUnblockStepClassName(step.status)}>{step.status}</span>
                      <p className="text-xs font-semibold text-on-surface">{step.label}</p>
                    </div>
                    <Link href={step.safe_surface} className="mt-1 block truncate text-[11px] leading-4 text-outline transition hover:text-engine">
                      {step.safe_surface}
                    </Link>
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{step.action}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-outline">{step.completion_signal}</p>
                  </div>
                </div>
              ))}
            </div>
            {drill.next_unblock_step?.command ? (
              <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                {drill.next_unblock_step.command}
              </code>
            ) : null}
          </div>

          <div className="rounded-md border border-violet/20 bg-violet/[0.035] p-3" aria-label="Trading latest live canary gate check">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-violet">Latest gate check</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {latestAttempt ? latestAttempt.status.replaceAll("-", " ") : "Not recorded yet"}
                </p>
              </div>
              <span className={canaryAttemptStageClassName(latestAttempt?.stage ?? "credential-intake", latestAttempt?.runnable_now ?? false)}>
                {latestAttempt?.stage.replaceAll("-", " ") ?? "not recorded"}
              </span>
            </div>
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">
              {latestAttempt
                ? latestAttempt.actual_live_trade_tested
                  ? "A funded canary proof exists."
                  : latestAttempt.first_blocker ?? latestAttempt.next_action
                : "No live gate check receipt recorded yet; use Record gate check in the live cockpit to persist the current blocker without signing or submitting."}
            </p>
            {latestAttempt ? (
              <p className="mt-2 truncate text-[11px] leading-4 text-outline">
                {latestAttempt.generated_at} · receipt {latestAttempt.receipt_hash.slice(0, 10)}
              </p>
            ) : null}
          </div>

          <div className="rounded-md border border-engine/20 bg-engine/[0.035] p-3" aria-label="Trading canary proof monitor">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Canary proof monitor</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {nextProof?.label ?? "Settlement accounted"}
                </p>
              </div>
              <span className={canaryProofStageClassName(nextProof?.status ?? (canary.actual_live_trade_tested ? "pass" : "fail"))}>
                {canary.post_signing_evidence_status.replaceAll("-", " ")}
              </span>
            </div>
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">
              {nextProof?.next_action ?? canary.post_signing_next_action}
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              <p className="truncate rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[11px] leading-5 text-outline">
                Signature: <span className="font-semibold text-on-surface">{canary.latest_signature_preview ?? "none"}</span>
              </p>
              <p className="truncate rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[11px] leading-5 text-outline">
                Proof stages: <span className="font-semibold text-on-surface">{proofPassCount}/{canary.post_signing_evidence.length}</span>
              </p>
            </div>
          </div>

          <div className="grid min-w-0 gap-2" aria-label="Trading first canary drill lanes">
            {leadingDrillLanes.map((lane) => (
              <div key={lane.id} className="grid min-w-0 gap-2 rounded-md border border-outline/15 bg-surface/55 p-2.5 sm:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={firstCanaryDrillLaneClassName(lane.status)}>{lane.status}</span>
                    <p className="text-xs font-semibold text-on-surface">{lane.label}</p>
                  </div>
                  <Link href={lane.evidence_endpoint} className="mt-1 block truncate text-[11px] leading-4 text-outline transition hover:text-engine">
                    {lane.evidence_endpoint}
                  </Link>
                </div>
                <p className="line-clamp-3 text-[11px] leading-4 text-on-surface-variant">{lane.detail}</p>
              </div>
            ))}
          </div>

          <details className="rounded-md border border-outline/15 bg-surface-dim/40 p-3" aria-label="Trading live proof command">
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Canary drill commands</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {canaryProven ? "strict canary proof can be reviewed" : "drill first, then prove a signed canary"}
                </p>
              </div>
              <span className={supervisedCanaryStatusClassName(readiness.status)}>
                {readiness.status.replaceAll("-", " ")}
              </span>
            </summary>
            <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
              {drillCommand}
            </code>
            <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
              {proofCommand}
            </code>
            <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-outline">
              The drill cannot sign, submit, store wallet authority, or move funds; the proof watcher fails until signed-relay, confirmation, settlement, and portfolio mirror proof are real.
            </p>
          </details>

          <div className="grid grid-cols-2 gap-2">
            <CommandBoardMetric label="Capital blockers" value={`${blockers.real_capital_blocker_count}`} detail={`${blockers.open_operator_input_count} inputs`} tone={blockers.real_capital_blocker_count > 0 ? "critical" : "engine"} />
            <CommandBoardMetric label="Ignition blockers" value={`${ignition.blocker_count}`} detail={ignition.first_trade_path.replaceAll("-", " ")} tone={ignition.blocker_count > 0 ? "critical" : "engine"} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TradingCommandBoard({
  state,
  status,
  runway,
  launchChecklist,
  cutover,
  runbook,
  preflight,
  liveUsabilityBlockers,
}: {
  state: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>;
  status: Web3UsabilityStatusReceipt;
  runway: Web3SupervisedLiveRunway;
  launchChecklist: ReturnType<typeof buildWeb3AutonomyLaunchChecklist>;
  cutover: Web3CutoverBlockerBoard;
  runbook: Web3OperatorRunbookReceipt;
  preflight: ReturnType<typeof buildWeb3LiveCapitalPreflightReceipt>;
  liveUsabilityBlockers: Web3LiveUsabilityBlockersReceipt;
}) {
  const wallet = state.autonomous_wallet_telemetry;
  const decision = state.autonomous_now_decision;
  const fusion = state.autonomous_market_evidence_fusion;
  const route = state.autonomous_route_refresh_execution;
  const primaryAction = runbook.primary_safe_action;
  const nextGate = status.capabilities.find((capability) => capability.status === "gated") ??
    status.capabilities.find((capability) => capability.status === "watch") ??
    status.capabilities[0];
  const missingInputs = launchChecklist.operator_inputs_needed
    .filter((input) => input.status !== "ready")
    .slice(0, 4);
  const commandTone = decision.status === "attack" || decision.status === "probe" || decision.status === "loop"
    ? "engine"
    : decision.status === "blocked"
      ? "critical"
      : decision.route_refresh_required || decision.chart_proof_required || decision.status === "protect"
        ? "caution"
        : "neutral";
  const nextUnlockStep = liveUsabilityBlockers.next_unlock_step;
  const currentInput = liveUsabilityBlockers.current_input;
  const nextBlocker = liveUsabilityBlockers.next_blocker;
  const nextCredentialRequest = liveUsabilityBlockers.next_credential_request;
  const settingsFixHref = currentInput?.id === "dedicated-trading-wallet" || currentInput?.unlock_step_id === "scope-wallet" || nextUnlockStep?.id === "scope-wallet"
    ? TRADING_LIVE_CANARY_CONSOLE_HREF
    : SETTINGS_WEB3_RUNWAY_HREF;
  const settingsFixLabel = currentInput?.id === "dedicated-trading-wallet" || currentInput?.unlock_step_id === "scope-wallet" || nextUnlockStep?.id === "scope-wallet" ? "Fix wallet gate" : "Fix gates";
  const leadMissingOwner = liveUsabilityBlockers.missing_owner_summary[0];

  return (
    <section
      aria-labelledby="trading-command-board-title"
      className="rounded-md border border-engine/30 bg-engine/[0.045] p-4 sm:p-5"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
                <Wallet aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Command board</p>
                <h2 id="trading-command-board-title" className="mt-1 font-display text-xl font-semibold text-on-surface">
                  {decision.action.replaceAll("-", " ")} {decision.target_symbol ?? fusion.leader_symbol ?? "desk"}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">
                  {decision.next_action}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={commandBoardBadgeClassName(commandTone)}>
                {decision.status.replaceAll("-", " ")}
              </span>
              <Link
                href={settingsFixHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15"
              >
                {settingsFixLabel}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>

          <WalletNetWorthCurve wallet={wallet} />

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CommandBoardMetric label="Equity" value={formatTradingCurrency(wallet.equity_usd)} tone={wallet.window_pnl_usd >= 0 ? "engine" : "critical"} />
            <CommandBoardMetric label="Window PnL" value={formatTradingSignedCurrency(wallet.window_pnl_usd)} tone={wallet.window_pnl_usd >= 0 ? "engine" : "critical"} />
            <CommandBoardMetric label="Exposure" value={formatTradingCurrency(wallet.exposure_usd)} tone={wallet.exposure_pct > 70 ? "caution" : "engine"} />
            <CommandBoardMetric label="Drawdown" value={`${wallet.max_drawdown_pct.toFixed(1)}%`} tone={wallet.max_drawdown_pct > 8 ? "critical" : wallet.max_drawdown_pct > 3 ? "caution" : "engine"} />
          </div>
        </div>

        <div className="grid min-w-0 gap-3">
          <div className="rounded-md border border-engine/25 bg-surface/55 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Primary safe action</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">{primaryAction?.label ?? "Review setup first"}</p>
              </div>
              <span className={operatorRunbookActionClassName(primaryAction?.status ?? "gated")}>{primaryAction?.status ?? "gated"}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              {primaryAction?.next_action ?? runbook.next_safe_input?.next_action ?? runbook.next_live_lane_action}
            </p>
            {primaryAction?.command ? (
              <code className="mt-2 block break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                {primaryAction.command}
              </code>
            ) : primaryAction?.href ? (
              <Link
                href={primaryAction.href}
                className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md border border-engine/30 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine"
              >
                Open safe surface
              </Link>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <CommandBoardMetric label="Can run" value={`${runbook.allowed_now_count}`} detail={`${runbook.gated_count} gated`} tone="engine" />
            <CommandBoardMetric label="Live lanes" value={`${runway.ready_lane_count}/${runway.total_lane_count}`} detail={runway.status.replaceAll("-", " ")} tone={runway.ready_lane_count === runway.total_lane_count ? "engine" : "caution"} />
            <CommandBoardMetric label="Open blockers" value={`${cutover.open_blocker_count}`} detail={cutover.next_safe_input?.label ?? "review queue"} tone={cutover.open_blocker_count > 0 ? "caution" : "engine"} />
            <CommandBoardMetric label="Preflight" value={`${preflight.launch_readiness_score}/100`} detail={`${preflight.blocker_count} blockers`} tone={preflight.live_review_permitted ? "engine" : preflight.failed_gate_count > 0 ? "critical" : "caution"} />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-md border border-caution/25 bg-caution/[0.04] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next usable gate</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{nextGate?.label ?? status.next_gate_label}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">{nextGate?.next_action ?? status.next_gate_action}</p>
            </div>

            <div className="rounded-md border border-outline/15 bg-surface-dim/45 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Live review lanes</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">
                    {runway.ready_lane_count}/{runway.total_lane_count} ready
                  </p>
                </div>
                <span className={runwayStatusClassName(runway.status)}>{runway.status.replaceAll("-", " ")}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">{runway.next_action}</p>
            </div>
          </div>

          <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Real-money usability</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">{liveUsabilityBlockers.status.replaceAll("-", " ")}</p>
              </div>
              <span className={liveUsabilityStatusClassName(liveUsabilityBlockers.status)}>
                live blocked
              </span>
            </div>
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">{liveUsabilityBlockers.summary}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <CommandBoardMetric label="Missing" value={`${liveUsabilityBlockers.total_live_usability_row_count}`} detail={`${liveUsabilityBlockers.listed_live_usability_row_count} listed`} tone={liveUsabilityBlockers.total_live_usability_row_count > 0 ? "critical" : "engine"} />
              <CommandBoardMetric label="Signoffs" value={`${liveUsabilityBlockers.passed_signoff_count}/${liveUsabilityBlockers.required_signoff_count}`} detail={`${liveUsabilityBlockers.failed_or_watch_signoff_count} open`} tone={liveUsabilityBlockers.failed_or_watch_signoff_count > 0 ? "caution" : "engine"} />
              <CommandBoardMetric label="Actions" value={`${liveUsabilityBlockers.safe_action_count}`} detail={`${liveUsabilityBlockers.gated_action_count} gated`} tone="engine" />
            </div>
            {nextBlocker ? (
              <div className="mt-2 rounded-md border border-critical/20 bg-critical/[0.025] p-2" aria-label="Trading next dependency blocker">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Next blocker</p>
                    <p className="mt-1 text-xs font-semibold text-on-surface">{nextBlocker.label}</p>
                  </div>
                  <span className={liveUsabilityMissingStatusClassName(nextBlocker.status)}>{nextBlocker.status}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{nextBlocker.next_action}</p>
                <p className="mt-1 truncate text-[10px] leading-4 text-outline">
                  {nextBlocker.owner.replaceAll("-", " ")} · {nextBlocker.source.replaceAll("-", " ")} · {nextBlocker.blocks_live_capital ? "blocks live capital" : "review item"}
                </p>
                <Link
                  href={nextBlocker.href}
                  className="mt-2 inline-flex min-h-9 items-center rounded-md border border-critical/30 bg-critical/10 px-2 text-[11px] font-semibold text-critical transition hover:bg-critical/15"
                >
                  Open blocker control
                </Link>
                {nextBlocker.safe_command ? (
                  <code className="mt-2 block break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                    {nextBlocker.safe_command}
                  </code>
                ) : null}
              </div>
            ) : null}
            {nextCredentialRequest ? (
              <div className="mt-2 rounded-md border border-engine/20 bg-engine/[0.035] p-2" aria-label="Trading next credential request">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Next credential request</p>
                    <p className="mt-1 text-xs font-semibold text-on-surface">{nextCredentialRequest.label}</p>
                  </div>
                  <span className={nextCredentialRequest.can_enter_in_app ? "rounded-md border border-engine/25 bg-engine/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-engine" : "rounded-md border border-caution/25 bg-caution/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-caution"}>
                    {nextCredentialRequest.can_enter_in_app ? "in app" : "external"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">{nextCredentialRequest.safe_value_description}</p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <p className="truncate rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[10px] leading-4 text-outline">
                    Surface: <span className="font-semibold text-on-surface">{nextCredentialRequest.safe_collection_surface.replaceAll("-", " ")}</span>
                  </p>
                  <p className="truncate rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[10px] leading-4 text-outline">
                    Storage: <span className="font-semibold text-on-surface">{nextCredentialRequest.storage.replaceAll("-", " ")}</span>
                  </p>
                </div>
                <Link
                  href={nextCredentialRequest.fix_href}
                  className="mt-2 inline-flex min-h-9 items-center rounded-md border border-engine/30 bg-engine/10 px-2 text-[11px] font-semibold text-engine transition hover:bg-engine/15"
                >
                  Open request surface
                </Link>
                {nextCredentialRequest.verifier_command ? (
                  <code className="mt-2 block break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                    {nextCredentialRequest.verifier_command}
                  </code>
                ) : null}
                <div className="mt-2 rounded-md border border-outline/15 bg-surface-dim/30 p-2" aria-label="Trading next credential completion criteria">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Done when</p>
                  <ul className="mt-1 grid gap-1 text-[10px] leading-4 text-outline">
                    {nextCredentialRequest.completion_criteria.slice(0, 3).map((criterion) => (
                      <li key={criterion}>{criterion}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-2 grid gap-1.5" aria-label="Trading next credential verification runway">
                  {nextCredentialRequest.verification_runway.slice(0, 3).map((step, index) => (
                    <div key={step.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border border-outline/15 bg-surface-dim/30 p-2">
                      <span className="flex size-5 items-center justify-center rounded-md border border-outline/20 bg-surface text-[10px] font-semibold text-outline">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-on-surface">{step.label}</p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-outline">{step.next_action}</p>
                        {step.command ? (
                          <code className="mt-1 block break-all text-[10px] leading-4 text-outline">{step.command}</code>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {currentInput ? (
              <div className="mt-2 rounded-md border border-caution/25 bg-caution/[0.04] p-2" aria-label="Trading current input contract">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Current input</p>
                    <p className="mt-1 text-xs font-semibold text-on-surface">{currentInput.label}</p>
                  </div>
                  <span className="rounded-md border border-critical/20 bg-critical/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-critical">
                    live blocked
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{currentInput.next_action}</p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                  <p className="truncate rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[10px] leading-4 text-outline">
                    Surface: <span className="font-semibold text-on-surface">{currentInput.safe_collection_surface.replaceAll("-", " ")}</span>
                  </p>
                  <p className="truncate rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[10px] leading-4 text-outline">
                    Storage: <span className="font-semibold text-on-surface">{currentInput.storage.replaceAll("-", " ")}</span>
                  </p>
                  <p className="truncate rounded-md border border-outline/15 bg-surface-dim/35 px-2 py-1 text-[10px] leading-4 text-outline">
                    Targets: <span className="font-semibold text-on-surface">{currentInput.target_names.length > 0 ? currentInput.target_names.join(", ") : "none"}</span>
                  </p>
                </div>
                {currentInput.verifier_command ? (
                  <code className="mt-2 block break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                    {currentInput.verifier_command}
                  </code>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 rounded-md border border-outline/15 bg-surface-dim/35 p-2" aria-label="Trading credential doctor status">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Credential doctor</p>
                  <p className="mt-1 truncate text-xs font-semibold text-on-surface">
                    {liveUsabilityBlockers.credential_doctor.status.replaceAll("-", " ")}
                  </p>
                </div>
                <span className={credentialDoctorBadgeClassName(liveUsabilityBlockers.credential_doctor)}>
                  {liveUsabilityBlockers.credential_doctor.receipt_fresh ? "fresh" : "stale"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-outline">
                {liveUsabilityBlockers.credential_doctor.next_action}
              </p>
            </div>
            {leadMissingOwner ? (
              <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-outline">
                Lead owner: {leadMissingOwner.owner.replaceAll("-", " ")} has {leadMissingOwner.missing_count} row{leadMissingOwner.missing_count === 1 ? "" : "s"} open; next is {leadMissingOwner.first_label}.
              </p>
            ) : null}
            {nextUnlockStep ? (
              <div className="mt-2 rounded-md border border-engine/20 bg-engine/[0.035] p-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Next unlock step</p>
                  <span className={operatorUnlockStepClassName(nextUnlockStep.status)}>
                    {nextUnlockStep.status}
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold text-on-surface">{nextUnlockStep.label}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{nextUnlockStep.next_action}</p>
                <Link
                  href={settingsFixHref}
                  className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md border border-engine/30 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine transition hover:bg-engine/15"
                >
                  Open setup step
                </Link>
              </div>
            ) : null}
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-outline">{liveUsabilityBlockers.next_action}</p>
          </div>

          <div className="rounded-md border border-engine/25 bg-engine/[0.035] p-3" aria-label="Web3 operator unlock sequence">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Operator unlock sequence</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {status.operator_unlock_sequence.find((step) => step.status !== "ready")?.label ?? "External review packet"}
                </p>
              </div>
              <span className="rounded-md border border-engine/25 bg-engine/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-engine">
                ordered
              </span>
            </div>
            <div className="mt-2 grid gap-1.5">
              {status.operator_unlock_sequence.slice(0, 4).map((step, index) => (
                <div key={step.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border border-outline/15 bg-surface-dim/35 p-2">
                  <span className="mt-0.5 flex size-5 items-center justify-center rounded-md border border-outline/20 bg-surface text-[10px] font-semibold text-outline">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-on-surface">{step.label}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-outline">{step.next_action}</p>
                  </div>
                  <span className={operatorUnlockStepClassName(step.status)}>{step.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-outline/15 bg-surface/65 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Inputs still needed</p>
              <span className="rounded-md border border-outline/20 bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-outline">
                no secrets here
              </span>
            </div>
            <div className="mt-2 grid gap-2">
              {missingInputs.length > 0 ? missingInputs.map((input) => (
                <div key={input.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-outline/15 bg-void/20 p-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-on-surface">{input.label}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-outline">{input.next_action}</p>
                  </div>
                  <span className={operatorInputStatusClassName(input.status)}>{input.status}</span>
                </div>
              )) : (
                <p className="text-xs leading-5 text-on-surface-variant">
                  All listed inputs are ready. Run strict verifiers before any supervised-live review.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <CommandBoardMetric label="Signal" value={`${fusion.fusion_score}/100`} detail={fusion.leader_symbol ?? "no leader"} tone={fusion.can_trade ? "engine" : "caution"} />
            <CommandBoardMetric label="Route" value={route.status.replaceAll("-", " ")} detail={route.local_rehearsal_ready ? "rehearsed" : state.market_source.label} tone={route.status === "ready" ? "engine" : route.status === "blocked" ? "critical" : "caution"} />
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-outline">
        This command board is paper and read-only evidence. It cannot sign, submit, store wallet authority, or mutate balances.
      </p>
    </section>
  );
}

function WalletNetWorthCurve({ wallet }: { wallet: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>["autonomous_wallet_telemetry"] }) {
  const width = 680;
  const height = 164;
  const pad = { left: 28, right: 28, top: 20, bottom: 30 };
  const points = wallet.curve.length > 0
    ? wallet.curve.slice(-10)
    : [{
      id: "current",
      label: "now",
      recorded_at: "",
      cycle: 0,
      action: "current" as const,
      equity_usd: wallet.equity_usd,
      cash_usd: wallet.cash_usd,
      exposure_usd: wallet.exposure_usd,
      realized_pnl_usd: wallet.realized_pnl_usd,
      unrealized_pnl_usd: wallet.unrealized_pnl_usd,
      drawdown_pct: wallet.max_drawdown_pct,
      filled_count: wallet.fill_count,
      blocked_count: wallet.blocked_count,
    }];
  const values = points.flatMap((point) => [point.equity_usd, point.cash_usd, point.exposure_usd, wallet.high_watermark_usd, wallet.starting_cash_usd]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(1, maxValue - minValue);
  const xFor = (index: number) => pad.left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - pad.left - pad.right));
  const yFor = (value: number) => Math.round(pad.top + (1 - ((value - minValue) / range)) * (height - pad.top - pad.bottom));
  const equityPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.equity_usd)}`).join(" ");
  const cashPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.cash_usd)}`).join(" ");
  const exposurePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.exposure_usd)}`).join(" ");
  const highWaterY = yFor(wallet.high_watermark_usd);
  const lastPoint = points[points.length - 1];
  const lastX = xFor(points.length - 1);
  const lastY = yFor(lastPoint?.equity_usd ?? wallet.equity_usd);
  const chartTone = wallet.window_pnl_usd >= 0 ? "text-engine" : "text-critical";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="First-screen Web3 wallet net worth curve with paper equity, cash, exposure, and fill markers"
      className={`mt-3 h-40 w-full ${chartTone}`}
    >
      <rect width={width} height={height} rx="8" className="fill-surface-dim" opacity="0.32" />
      <line x1={pad.left} x2={width - pad.right} y1={highWaterY} y2={highWaterY} stroke="currentColor" strokeDasharray="5 8" strokeOpacity="0.24" strokeWidth="2" />
      <path d={exposurePath} fill="none" stroke="currentColor" strokeDasharray="2 8" strokeOpacity="0.24" strokeWidth="2" />
      <path d={cashPath} fill="none" stroke="currentColor" strokeDasharray="8 8" strokeOpacity="0.36" strokeWidth="2" />
      <path d={equityPath} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      {points.slice(1).map((point, index) => (
        <circle
          key={point.id}
          cx={xFor(index + 1)}
          cy={yFor(point.equity_usd)}
          r={point.blocked_count > point.filled_count ? "3.5" : "4.5"}
          className={point.blocked_count > point.filled_count ? "fill-caution" : point.action === "stand-down" ? "fill-critical" : "fill-engine"}
          opacity="0.86"
        />
      ))}
      <circle cx={lastX} cy={lastY} r="6" className={wallet.window_pnl_usd >= 0 ? "fill-engine" : "fill-critical"} />
      <text x={pad.left} y="16" className="fill-outline font-mono text-[10px] uppercase tracking-[0.08em]">equity solid - cash dash - exposure dots</text>
      <text x={pad.left} y={height - 10} className="fill-outline font-mono text-[10px] uppercase tracking-[0.08em]">{points.length} ticks - paper fills only - high-water guide</text>
      <text x={width - pad.right} y="16" textAnchor="end" className="fill-outline font-mono text-[10px] uppercase tracking-[0.08em]">{formatTradingCompactCurrency(maxValue)}</text>
      <text x={width - pad.right} y={height - 10} textAnchor="end" className="fill-outline font-mono text-[10px] uppercase tracking-[0.08em]">{formatTradingCompactCurrency(minValue)}</text>
    </svg>
  );
}

function CommandBoardMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone: "engine" | "caution" | "critical" | "neutral";
}) {
  const toneClassName = tone === "engine"
    ? "text-engine"
    : tone === "caution"
      ? "text-caution"
      : tone === "critical"
        ? "text-critical"
        : "text-on-surface";
  return (
    <div className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${toneClassName}`}>{value}</p>
      {detail ? <p className="mt-0.5 truncate text-[11px] text-outline">{detail}</p> : null}
    </div>
  );
}

function commandBoardBadgeClassName(tone: "engine" | "caution" | "critical" | "neutral") {
  const base = "shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold capitalize";
  if (tone === "engine") return `${base} border-engine/35 bg-engine/10 text-engine`;
  if (tone === "critical") return `${base} border-critical/35 bg-critical/10 text-critical`;
  if (tone === "caution") return `${base} border-caution/35 bg-caution/10 text-caution`;
  return `${base} border-outline/20 bg-surface text-outline`;
}

function operatorInputStatusClassName(status: ReturnType<typeof buildWeb3AutonomyLaunchChecklist>["operator_inputs_needed"][number]["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "ready") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "blocked") return `${base} border-critical/30 bg-critical/10 text-critical`;
  if (status === "review") return `${base} border-violet/30 bg-violet/10 text-violet`;
  return `${base} border-caution/30 bg-caution/10 text-caution`;
}

function formatTradingCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 0 : 2,
  }).format(value);
}

function formatTradingSignedCurrency(value: number) {
  const formatted = formatTradingCurrency(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatTradingCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 0,
  }).format(value);
}

function ReadinessReceiptsDrawer({
  source,
  account,
  scenario,
  liveIgnitionStatus,
  canaryReadinessStatus,
  liveAutonomyStatus,
  liveUsabilityStatus,
  usabilityMode,
  cutoverSummary,
  runbookSummary,
}: {
  source: "sample" | "live-dex";
  account: "persistent" | "ephemeral";
  scenario: string;
  liveIgnitionStatus: string;
  canaryReadinessStatus: string;
  liveAutonomyStatus: string;
  liveUsabilityStatus: string;
  usabilityMode: string;
  cutoverSummary: string;
  runbookSummary: string;
}) {
  const params = new URLSearchParams({ source, account, scenario, cycles: "0" });
  const receiptHref = (path: string, extra?: Record<string, string>) => {
    const nextParams = new URLSearchParams(params);
    for (const [key, value] of Object.entries(extra ?? {})) nextParams.set(key, value);
    return `${path}?${nextParams.toString()}`;
  };
  const receipts = [
    {
      label: "Live ignition",
      status: liveIgnitionStatus,
      detail: "Launch envelope, live locks, and canary transition checks.",
      href: receiptHref("/api/web3-live-ignition"),
    },
    {
      label: "First canary readiness",
      status: canaryReadinessStatus,
      detail: "Supervised lanes for wallet proof, Jupiter, relay, and settlement.",
      href: receiptHref("/api/web3-supervised-canary-readiness"),
    },
    {
      label: "Live autonomy gate",
      status: liveAutonomyStatus,
      detail: "Final unattended real-capital gate; read-only until all proof passes.",
      href: receiptHref("/api/web3-live-autonomy-readiness"),
    },
    {
      label: "What is left",
      status: liveUsabilityStatus,
      detail: "Dependency-ranked live usability blockers and safe next input.",
      href: receiptHref("/api/web3-live-usability-blockers", { rows: "all" }),
    },
    {
      label: "Usability dossier",
      status: usabilityMode,
      detail: "Copilot, paper, dry-run, supervised-live, and locked-live capabilities.",
      href: receiptHref("/api/web3-usability-status"),
    },
    {
      label: "Cutover board",
      status: cutoverSummary,
      detail: "Owner-grouped setup blockers for wallet, security, ops, and review.",
      href: receiptHref("/api/web3-cutover-blocker-board"),
    },
    {
      label: "Operator runbook",
      status: runbookSummary,
      detail: "Allowed actions, gated actions, verifier commands, and safe surfaces.",
      href: receiptHref("/api/web3-operator-runbook"),
    },
  ];

  return (
    <details className="group min-w-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-outline/15 bg-surface/70 px-3 py-2 text-sm font-semibold text-on-surface transition hover:border-engine/35 hover:text-engine">
        <span>Readiness receipts and runbook</span>
        <span className="rounded-md border border-outline/20 bg-surface-dim/55 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline group-open:hidden">
          open
        </span>
        <span className="hidden rounded-md border border-engine/25 bg-engine/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-engine group-open:inline-flex">
          shown
        </span>
      </summary>
      <div className="mt-3 rounded-md border border-outline/15 bg-surface/70 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Compact evidence index</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">Full receipts stay linked, not pre-rendered</p>
          </div>
          <span className="rounded-md border border-engine/25 bg-engine/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-engine">
            lighter cockpit
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-on-surface-variant">
          The default cockpit keeps the long audit bodies out of first paint. Open a receipt when you need the full blocker audit, verifier commands, or reviewer evidence.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3" aria-label="Trading linked readiness receipt index">
          {receipts.map((receipt) => (
            <Link
              key={receipt.label}
              href={receipt.href}
              className="grid min-w-0 gap-2 rounded-md border border-outline/15 bg-surface-dim/45 p-3 transition hover:border-engine/35"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="truncate text-sm font-semibold text-on-surface">{receipt.label}</p>
                <span className={readinessReceiptIndexStatusClassName(receipt.status)}>
                  {receipt.status.replaceAll("-", " ")}
                </span>
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-on-surface-variant">{receipt.detail}</p>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-outline">
          These receipt links are read-only. They cannot sign, submit transactions, store wallet authority, mutate balances, or approve autonomous live trading.
        </p>
      </div>
    </details>
  );
}

function readinessReceiptIndexStatusClassName(status: string) {
  const normalized = status.toLowerCase();
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (normalized.includes("blocked") || normalized.includes("needed") || normalized.includes("locked")) {
    return `${base} border-critical/30 bg-critical/10 text-critical`;
  }
  if (normalized.includes("input") || normalized.includes("gated") || normalized.includes("watch") || normalized.includes("open")) {
    return `${base} border-caution/30 bg-caution/10 text-caution`;
  }
  return `${base} border-engine/30 bg-engine/10 text-engine`;
}

function UsabilityStatusPanel({
  status,
  source,
  account,
}: {
  status: Web3UsabilityStatusReceipt;
  source: "sample" | "live-dex";
  account: "persistent" | "ephemeral";
}) {
  const params = new URLSearchParams({ source, account });
  const receiptHref = `/api/web3-usability-status?${params.toString()}`;

  return (
    <section
      aria-labelledby="trading-usability-status-title"
      className="rounded-md border border-engine/25 bg-surface/80 p-3 sm:p-4"
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.58fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Live readiness dossier</p>
                <h2 id="trading-usability-status-title" className="mt-1 font-display text-xl font-semibold text-on-surface">
                  {status.current_mode.replaceAll("-", " ")}
                </h2>
                <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-6 text-on-surface-variant">{status.summary}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={receiptHref}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
              >
                Open JSON
              </Link>
              <Link
                href="/settings/integrations"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine transition hover:bg-engine/15"
              >
                Credentials
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-md">
            <UsabilityStat label="Usable" value={`${status.usable_count}`} tone="engine" />
            <UsabilityStat label="Gated" value={`${status.gated_count}`} tone={status.gated_count > 0 ? "caution" : "engine"} />
            <UsabilityStat label="Locked" value={`${status.locked_count}`} tone="demo" />
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-caution/25 bg-caution/[0.04] p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next gate</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">{status.next_gate_label}</p>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">{status.next_gate_action}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-engine/25 bg-engine/[0.035] p-3" aria-label="Web3 usability operator unlock sequence">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Operator unlock sequence</p>
          <p className="text-[11px] leading-4 text-outline">Public/env targets only; never private keys or seed phrases.</p>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          {status.operator_unlock_sequence.map((step, index) => (
            <div key={step.id} className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Step {index + 1}</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-on-surface">{step.label}</p>
                </div>
                <span className={operatorUnlockStepClassName(step.status)}>{step.status}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{step.next_action}</p>
              <p className="mt-1 truncate text-[10px] leading-4 text-outline">{step.storage.replaceAll("-", " ")}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex min-w-0 flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0" aria-label="Web3 capability status rail">
        {status.capabilities.map((capability) => (
          <div key={capability.id} className="inline-flex min-h-9 min-w-0 max-w-[12rem] shrink-0 items-center gap-2 rounded-md border border-outline/15 bg-surface-dim/45 px-2.5 py-1.5 sm:max-w-full">
            <p className="min-w-0 truncate text-xs font-semibold text-on-surface">{capability.label}</p>
            <span className={usabilityCapabilityClassName(capability.status)}>
              {capability.status}
            </span>
          </div>
        ))}
      </div>

      <details className="mt-3 rounded-md border border-outline/15 bg-surface-dim/35 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-on-surface">
          Capability evidence
        </summary>
        <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
          {status.capabilities.map((capability) => (
            <div key={capability.id} className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{capability.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{capability.detail}</p>
                </div>
                <span className={usabilityCapabilityClassName(capability.status)}>
                  {capability.status}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 border-t border-outline/15 pt-2 text-[11px] leading-4 text-outline">
                {capability.evidence.slice(0, 2).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </details>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-outline">
        Live execution, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.
      </p>
    </section>
  );
}

function UsabilityStat({ label, value, tone }: { label: string; value: string; tone: "engine" | "caution" | "demo" }) {
  const valueClassName = tone === "engine" ? "text-engine" : tone === "caution" ? "text-caution" : "text-demo";
  return (
    <div className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function usabilityCapabilityClassName(status: Web3UsabilityStatusReceipt["capabilities"][number]["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "usable") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  if (status === "gated") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-outline/20 bg-surface text-outline`;
}

function operatorUnlockStepClassName(status: Web3UsabilityStatusReceipt["operator_unlock_sequence"][number]["status"]) {
  if (status === "ready") return "rounded-md border border-engine/30 bg-engine/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-engine";
  if (status === "review") return "rounded-md border border-caution/30 bg-caution/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-caution";
  if (status === "active") return "rounded-md border border-outline/25 bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant";
  return "rounded-md border border-critical/30 bg-critical/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-critical";
}

function credentialDoctorBadgeClassName(doctor: Web3LiveUsabilityBlockersReceipt["credential_doctor"]) {
  const base = "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (doctor.status === "absent" || doctor.blocked_count > 0) return `${base} border-critical/30 bg-critical/10 text-critical`;
  if (!doctor.receipt_fresh || doctor.watch_count > 0) return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-engine/30 bg-engine/10 text-engine`;
}

function LiveAutonomyReadinessPanel({
  readiness,
  source,
  account,
  scenario,
}: {
  readiness: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>["autonomous_live_autonomy_readiness"];
  source: "sample" | "live-dex";
  account: "persistent" | "ephemeral";
  scenario: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>["scenario"];
}) {
  const params = new URLSearchParams({ source, account, scenario, cycles: "0" });
  const href = `/api/web3-live-autonomy-readiness?${params.toString()}`;
  const failing = readiness.items.filter((item) => item.status === "fail");
  const watching = readiness.items.filter((item) => item.status === "watch");
  const topItems = [...failing, ...watching, ...readiness.items.filter((item) => item.status === "pass")].slice(0, 8);

  return (
    <section
      aria-labelledby="web3-live-autonomy-readiness-title"
      className="rounded-md border border-engine/25 bg-engine/[0.035] p-3 sm:p-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Live autonomy gate</p>
              <h2 id="web3-live-autonomy-readiness-title" className="mt-1 font-display text-lg font-semibold text-on-surface">
                {readiness.status.replaceAll("-", " ")}
              </h2>
              <p className="mt-1 line-clamp-3 text-sm leading-6 text-on-surface-variant">{readiness.summary}</p>
            </div>
            <Link
              href={href}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open readiness JSON
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LiveUsabilityStat label="Score" value={`${readiness.readiness_score}/100`} tone={readiness.readiness_score >= 80 ? "engine" : readiness.readiness_score >= 55 ? "caution" : "critical"} />
            <LiveUsabilityStat label="Unattended" value={readiness.can_run_unattended ? "yes" : "no"} tone={readiness.can_run_unattended ? "engine" : "critical"} />
            <LiveUsabilityStat label="Real capital" value={readiness.can_trade_real_capital ? "yes" : "blocked"} tone={readiness.can_trade_real_capital ? "engine" : "critical"} />
            <LiveUsabilityStat label="Live max" value={formatTradingCompactCurrency(readiness.max_live_trade_usd)} tone={readiness.max_live_trade_usd > 0 ? "caution" : "critical"} />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <LiveUsabilityContractStat label="Cap left" value={formatTradingCurrency(readiness.daily_cap_remaining_usd)} />
            <LiveUsabilityContractStat label="Fastest TTL" value={`${readiness.fastest_ttl_seconds}s`} />
            <LiveUsabilityContractStat label="Next wake" value={`${readiness.next_wake_seconds}s`} />
          </div>

          <div className="mt-3 rounded-md border border-outline/15 bg-surface/50 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Next action</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{readiness.next_action}</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Autonomy checklist</p>
            <span className={liveAutonomyReadinessStatusClassName(readiness.status)}>
              {failing.length} fail · {watching.length} watch
            </span>
          </div>
          <div className="mt-2 grid gap-2">
            {topItems.map((item) => (
              <div key={item.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-outline/15 bg-surface-dim/35 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-on-surface">{item.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-outline">{item.detail}</p>
                </div>
                <span className={liveAutonomyItemStatusClassName(item.status)}>{item.status}</span>
              </div>
            ))}
          </div>
          {readiness.blockers.length > 0 ? (
            <div className="mt-3 rounded-md border border-critical/20 bg-critical/[0.025] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Blocking real-capital autonomy</p>
              <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-on-surface-variant">
                {readiness.blockers.slice(0, 4).map((blocker, blockerIndex) => (
                  <li key={`${blockerIndex}-${blocker}`}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-outline">
            This is the final transition gate for wallet-backed autonomy; it reports readiness only and cannot sign, submit, custody funds, or move wallet assets.
          </p>
        </div>
      </div>
    </section>
  );
}

function liveAutonomyReadinessStatusClassName(
  status: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>["autonomous_live_autonomy_readiness"]["status"],
) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "live-ready") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "paper-only" || status === "daemon-gated" || status === "signature-gated" || status === "submit-gated") {
    return `${base} border-caution/30 bg-caution/10 text-caution`;
  }
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function liveAutonomyItemStatusClassName(
  status: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>["autonomous_live_autonomy_readiness"]["items"][number]["status"],
) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "pass") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "watch") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function LiveUsabilityBlockersPanel({
  receipt,
  source,
  account,
}: {
  receipt: Web3LiveUsabilityBlockersReceipt;
  source: "sample" | "live-dex";
  account: "persistent" | "ephemeral";
}) {
  const params = new URLSearchParams({ source, account, scenario: receipt.scenario, cycles: "0" });
  params.set("rows", "all");
  const href = `/api/web3-live-usability-blockers?${params.toString()}`;
  const missing = receipt.missing_for_live_usability.slice(0, 6);
  const ownerSummary = receipt.missing_owner_summary.slice(0, 4);
  const sourceSummary = receipt.missing_source_summary.slice(0, 4);
  const currentInput = receipt.current_input;
  const nextBlocker = receipt.next_blocker;
  const currentInputHref = currentInput?.id === "dedicated-trading-wallet" || currentInput?.unlock_step_id === "scope-wallet"
    ? TRADING_LIVE_CANARY_CONSOLE_HREF
    : SETTINGS_WEB3_RUNWAY_HREF;

  return (
    <section
      aria-labelledby="web3-live-usability-blockers-title"
      className="rounded-md border border-critical/25 bg-critical/[0.025] p-3 sm:p-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">What is left</p>
              <h2 id="web3-live-usability-blockers-title" className="mt-1 font-display text-lg font-semibold text-on-surface">
                {receipt.status.replaceAll("-", " ")}
              </h2>
              <p className="mt-1 line-clamp-3 text-sm leading-6 text-on-surface-variant">{receipt.summary}</p>
            </div>
            <Link
              href={href}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open all blockers JSON
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LiveUsabilityStat label="Inputs" value={`${receipt.open_operator_input_count}`} tone={receipt.open_operator_input_count > 0 ? "caution" : "engine"} />
            <LiveUsabilityStat label="Capital blockers" value={`${receipt.real_capital_blocker_count}`} tone={receipt.real_capital_blocker_count > 0 ? "critical" : "engine"} />
            <LiveUsabilityStat label="Rows listed" value={`${receipt.listed_live_usability_row_count}/${receipt.total_live_usability_row_count}`} tone={receipt.listed_live_usability_row_count < receipt.total_live_usability_row_count ? "caution" : "engine"} />
            <LiveUsabilityStat label="Live lanes" value={`${receipt.ready_live_lane_count}/${receipt.total_live_lane_count}`} tone={receipt.ready_live_lane_count === receipt.total_live_lane_count ? "engine" : "caution"} />
          </div>

          <div className="mt-3 rounded-md border border-outline/15 bg-surface/50 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Next action</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{receipt.next_action}</p>
            <p className="mt-2 text-[11px] leading-4 text-outline">
              Showing {receipt.listed_live_usability_row_count}/{receipt.total_live_usability_row_count} rows here; open the JSON for every dependency-ranked blocker.
            </p>
          </div>

          {nextBlocker ? (
            <div className="mt-2 rounded-md border border-critical/20 bg-critical/[0.025] p-3" aria-label="Live usability next dependency blocker">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Next dependency blocker</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{nextBlocker.label}</p>
                </div>
                <span className={liveUsabilityMissingStatusClassName(nextBlocker.status)}>{nextBlocker.status}</span>
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
                <code className="mt-2 block break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                  {nextBlocker.safe_command}
                </code>
              ) : null}
            </div>
          ) : null}

          {currentInput ? (
            <div className="mt-2 rounded-md border border-caution/25 bg-caution/[0.04] p-3" aria-label="Live usability current input contract">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Current input contract</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{currentInput.label}</p>
                </div>
                <span className="rounded-md border border-critical/25 bg-critical/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-critical">
                  live blocked
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">{currentInput.next_action}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <LiveUsabilityContractStat label="Surface" value={currentInput.safe_collection_surface.replaceAll("-", " ")} />
                <LiveUsabilityContractStat label="Storage" value={currentInput.storage.replaceAll("-", " ")} />
                <LiveUsabilityContractStat label="Targets" value={currentInput.target_names.length > 0 ? currentInput.target_names.join(", ") : "none"} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link
                  href={currentInputHref}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-engine/30 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine transition hover:bg-engine/15"
                >
                  Open current input
                </Link>
                {currentInput.verifier_command ? (
                  <code className="min-w-0 flex-1 break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                    {currentInput.verifier_command}
                  </code>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-2 rounded-md border border-outline/15 bg-surface/50 p-3" aria-label="Live usability credential doctor summary">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Credential doctor</p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {receipt.credential_doctor.ready_count} ready · {receipt.credential_doctor.blocked_count} blocked
                </p>
              </div>
              <span className={credentialDoctorBadgeClassName(receipt.credential_doctor)}>
                {receipt.credential_doctor.status.replaceAll("-", " ")}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{receipt.credential_doctor.next_action}</p>
            <code className="mt-2 block break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
              {receipt.credential_doctor.safe_command}
            </code>
          </div>

          {receipt.next_unlock_step ? (
            <div className="mt-2 rounded-md border border-engine/20 bg-engine/[0.035] p-3" aria-label="Live usability next unlock step">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Next unlock step</p>
                <span className={operatorUnlockStepClassName(receipt.next_unlock_step.status)}>{receipt.next_unlock_step.status}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-on-surface">{receipt.next_unlock_step.label}</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">{receipt.next_unlock_step.next_action}</p>
              <p className="mt-1 truncate text-[11px] leading-4 text-outline">{receipt.next_unlock_step.storage.replaceAll("-", " ")}</p>
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-2">
          <div className="grid gap-2 sm:grid-cols-2" aria-label="Live usability blocker owner and source summary">
            <div className="rounded-md border border-outline/15 bg-surface/50 p-3">
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
            <div className="rounded-md border border-outline/15 bg-surface/50 p-3">
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

          {missing.length > 0 ? missing.map((item) => (
            <div key={item.id} className="grid min-w-0 gap-2 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5 sm:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-on-surface">{item.label}</p>
                <p className="mt-0.5 truncate text-[11px] text-outline">{item.owner.replace("-", " ")} · {item.source.replace("-", " ")}</p>
              </div>
              <p className="line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{item.next_action}</p>
              <span className={liveUsabilityMissingStatusClassName(item.status)}>{item.status}</span>
            </div>
          )) : (
            <p className="rounded-md border border-outline/15 bg-surface-dim/45 p-3 text-xs leading-5 text-on-surface-variant">
              No missing rows are listed. Keep autonomous live trading blocked until external review approves the executor boundary.
            </p>
          )}

          <div className="rounded-md border border-outline/15 bg-surface/50 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Safe actions</p>
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">
              {receipt.safe_next_actions.map((action) => action.label).join(" · ") || "Review the readiness receipts before running more checks."}
            </p>
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-outline">
        This receipt answers readiness only. Live execution, signing, transaction submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo stay blocked.
      </p>
    </section>
  );
}

function LiveUsabilityStat({ label, value, tone }: { label: string; value: string; tone: "engine" | "caution" | "critical" }) {
  const valueClassName = tone === "engine" ? "text-engine" : tone === "critical" ? "text-critical" : "text-caution";
  return (
    <div className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function LiveUsabilityContractStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/35 p-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className="mt-1 truncate text-[11px] font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function liveUsabilityStatusClassName(status: Web3LiveUsabilityBlockersReceipt["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "live-review-ready") return `${base} border-caution/30 bg-caution/10 text-caution`;
  if (status === "autonomous-live-locked") return `${base} border-critical/30 bg-critical/10 text-critical`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function liveUsabilityMissingStatusClassName(status: Web3LiveUsabilityBlockersReceipt["missing_for_live_usability"][number]["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "needed" || status === "watch" || status === "review") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function CutoverBlockerBoardPanel({
  board,
  source,
  account,
}: {
  board: Web3CutoverBlockerBoard;
  source: "sample" | "live-dex";
  account: "persistent" | "ephemeral";
}) {
  const params = new URLSearchParams({ source, account });
  const href = `/api/web3-cutover-blocker-board?${params.toString()}`;
  const topRows = board.rows.filter((row) => row.status !== "ready").slice(0, 5);
  const ownerCounts: Array<{ owner: keyof Web3CutoverBlockerBoard["owner_counts"]; label: string }> = [
    { owner: "operator", label: "Operator" },
    { owner: "security", label: "Security" },
    { owner: "ops", label: "Ops" },
    { owner: "accounting", label: "Accounting" },
    { owner: "manual-review", label: "Review" },
  ];

  return (
    <section
      aria-labelledby="web3-cutover-blocker-board-title"
      className="rounded-md border border-caution/25 bg-caution/[0.035] p-3 sm:p-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Cutover blocker board</p>
              <h2 id="web3-cutover-blocker-board-title" className="mt-1 font-display text-lg font-semibold text-on-surface">
                {board.open_blocker_count} open setup blocker{board.open_blocker_count === 1 ? "" : "s"}
              </h2>
              <p className="mt-1 line-clamp-3 text-sm leading-6 text-on-surface-variant">{board.summary}</p>
            </div>
            <Link
              href={href}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open board JSON
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <CutoverBoardStat label="Now" value={`${board.now_count}`} tone={board.now_count > 0 ? "critical" : "engine"} />
            <CutoverBoardStat label="Before live" value={`${board.before_live_count}`} tone={board.before_live_count > 0 ? "caution" : "engine"} />
            <CutoverBoardStat label="Review" value={`${board.review_count}`} tone={board.review_count > 0 ? "demo" : "engine"} />
          </div>

          <div className="mt-3 flex min-w-0 flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0" aria-label="Cutover blockers by owner">
            {ownerCounts.map(({ owner, label }) => (
              <div key={owner} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-outline/15 bg-surface-dim/45 px-2.5 py-1.5">
                <span className="text-xs font-semibold text-on-surface">{label}</span>
                <span className={board.owner_counts[owner] > 0 ? "text-xs font-semibold text-caution" : "text-xs font-semibold text-engine"}>
                  {board.owner_counts[owner]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-2">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-md border border-caution/25 bg-surface/50 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next safe input</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{board.next_safe_input?.label ?? "No input open"}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                {board.next_safe_input?.next_action ?? "Keep live review external and leave live flags unset."}
              </p>
            </div>
            <div className="rounded-md border border-outline/15 bg-surface/50 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Next live lane</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">{board.next_live_lane_action}</p>
            </div>
          </div>

          <div className="grid min-w-0 gap-2" aria-label="Top cutover blockers">
            {topRows.length > 0 ? topRows.map((row) => (
              <div key={row.id} className="grid min-w-0 gap-2 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5 sm:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-on-surface">{row.label}</p>
                  <p className="mt-0.5 truncate text-[11px] text-outline">{cutoverOwnerLabel(row.owner)} · {row.phase.replace("-", " ")}</p>
                </div>
                <p className="line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{row.next_action}</p>
                <span className={cutoverRowStatusClassName(row.severity)}>{row.status}</span>
              </div>
            )) : (
              <p className="rounded-md border border-outline/15 bg-surface-dim/45 p-3 text-xs leading-5 text-on-surface-variant">
                No open rows. Keep live execution blocked until the external live review packet is approved.
              </p>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-outline">
        The board names env targets and verifier commands only. It cannot store secrets, sign, submit, mutate a wallet, or approve autonomous live trading.
      </p>
    </section>
  );
}

function OperatorRunbookPanel({
  runbook,
  source,
  account,
}: {
  runbook: Web3OperatorRunbookReceipt;
  source: "sample" | "live-dex";
  account: "persistent" | "ephemeral";
}) {
  const params = new URLSearchParams({ source, account });
  const href = `/api/web3-operator-runbook?${params.toString()}`;
  const primary = runbook.primary_safe_action;
  const currentInput = runbook.current_input;
  const currentInputHref = currentInput?.id === "dedicated-trading-wallet" || currentInput?.unlock_step_id === "scope-wallet"
    ? TRADING_LIVE_CANARY_CONSOLE_HREF
    : SETTINGS_WEB3_RUNWAY_HREF;
  const visibleActions = runbook.run_now.slice(0, 6);
  const blockers = runbook.real_capital_blockers.slice(0, 4);

  return (
    <section
      aria-labelledby="web3-operator-runbook-title"
      className="rounded-md border border-engine/25 bg-engine/[0.04] p-3 sm:p-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Operator runbook</p>
              <h2 id="web3-operator-runbook-title" className="mt-1 font-display text-lg font-semibold text-on-surface">
                {runbook.status.replaceAll("-", " ")}
              </h2>
              <p className="mt-1 line-clamp-3 text-sm leading-6 text-on-surface-variant">{runbook.summary}</p>
            </div>
            <Link
              href={href}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-outline/20 bg-surface-dim/55 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open runbook JSON
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <RunbookStat label="Can run" value={`${runbook.allowed_now_count}`} tone="engine" />
            <RunbookStat label="Gated" value={`${runbook.gated_count}`} tone={runbook.gated_count > 0 ? "caution" : "engine"} />
            <RunbookStat label="Blocked" value={`${runbook.blocked_count}`} tone="critical" />
          </div>

          <div className="mt-3 rounded-md border border-engine/25 bg-surface/50 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Primary safe action</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">{primary?.label ?? "Review setup first"}</p>
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-on-surface-variant">
              {primary?.next_action ?? runbook.next_safe_input?.next_action ?? runbook.next_live_lane_action}
            </p>
            {primary?.command ? (
              <code className="mt-2 block break-all rounded-md border border-outline/15 bg-black/20 px-2 py-1 text-[11px] leading-5 text-outline">
                {primary.command}
              </code>
            ) : primary?.href ? (
              <Link
                href={primary.href}
                className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md border border-engine/30 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine"
              >
                Open safe surface
              </Link>
            ) : null}
          </div>

          {currentInput ? (
            <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.035] p-3" aria-label="Operator runbook current input contract">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Current input</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{currentInput.label}</p>
                </div>
                <span className="rounded-md border border-critical/25 bg-critical/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-critical">
                  live blocked
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">{currentInput.next_action}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <LiveUsabilityContractStat label="Surface" value={currentInput.safe_collection_surface.replaceAll("-", " ")} />
                <LiveUsabilityContractStat label="Storage" value={currentInput.storage.replaceAll("-", " ")} />
                <LiveUsabilityContractStat label="Targets" value={currentInput.target_names.length > 0 ? currentInput.target_names.join(", ") : "none"} />
              </div>
              <Link
                href={currentInputHref}
                className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md border border-engine/30 bg-engine/10 px-3 py-2 text-xs font-semibold text-engine transition hover:bg-engine/15"
              >
                Open current input
              </Link>
            </div>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-2">
          <div className="grid min-w-0 gap-2" aria-label="Safe Web3 run-now actions">
            {visibleActions.map((action) => (
              <div key={action.id} className="grid min-w-0 gap-2 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-on-surface">{action.label}</p>
                  <p className="mt-0.5 truncate text-[11px] text-outline">{action.surface.replaceAll("-", " ")} · {action.permission_scope}</p>
                </div>
                <p className="line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{action.next_action}</p>
                <span className={operatorRunbookActionClassName(action.status)}>{action.status}</span>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-3" aria-label="Real-capital Web3 blockers">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Real-capital blockers</p>
              <span className="rounded-md border border-critical/30 bg-critical/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-critical">
                live blocked
              </span>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {blockers.length > 0 ? blockers.map((blocker) => (
                <div key={blocker.id} className="min-w-0 rounded-md border border-outline/15 bg-void/20 p-2">
                  <p className="truncate text-xs font-semibold text-on-surface">{blocker.label}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-outline">{blocker.next_action}</p>
                </div>
              )) : (
                <p className="rounded-md border border-outline/15 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant">
                  No real-capital blocker rows are open, but live approval still requires external review.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-outline">
        The runbook maps safe actions only. It cannot store secrets, sign, submit, mutate a wallet, or approve autonomous live trading.
      </p>
    </section>
  );
}

function RunbookStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "engine" | "caution" | "critical";
}) {
  const valueClassName = tone === "engine" ? "text-engine" : tone === "critical" ? "text-critical" : "text-caution";
  return (
    <div className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function operatorRunbookActionClassName(status: Web3OperatorRunbookReceipt["run_now"][number]["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "allowed") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "gated") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-critical/30 bg-critical/10 text-critical`;
}

function CutoverBoardStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "engine" | "caution" | "critical" | "demo";
}) {
  const valueClassName = tone === "engine"
    ? "text-engine"
    : tone === "critical"
      ? "text-critical"
      : tone === "demo"
        ? "text-demo"
        : "text-caution";
  return (
    <div className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function cutoverOwnerLabel(owner: Web3CutoverBlockerBoard["rows"][number]["owner"]) {
  if (owner === "manual-review") return "Manual review";
  return owner.charAt(0).toUpperCase() + owner.slice(1);
}

function cutoverRowStatusClassName(severity: Web3CutoverBlockerBoard["rows"][number]["severity"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (severity === "critical") return `${base} border-critical/30 bg-critical/10 text-critical`;
  if (severity === "review") return `${base} border-violet/30 bg-violet/10 text-violet`;
  return `${base} border-caution/30 bg-caution/10 text-caution`;
}

function MarketMonitorHistoryPanel({ history }: { history: Web3MarketMonitorHistory }) {
  const latestRuns = history.recent_runs.slice(-6);

  return (
    <section
      aria-labelledby="trading-market-monitor-history-title"
      className="rounded-md border border-outline/15 bg-surface/70 p-4 sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.9fr]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-violet/30 bg-violet/10 text-violet">
              <Activity aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                Read-only market monitor
              </p>
              <h2 id="trading-market-monitor-history-title" className="mt-1 font-display text-lg font-semibold text-on-surface">
                {history.run_count > 0 ? `${history.run_count} recent run${history.run_count === 1 ? "" : "s"}` : "No monitor tape yet"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">
                {history.summary} Signing, live execution, transaction submission, and wallet mutation remain blocked.
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <MonitorStat label="Latest" value={history.latest_symbol ?? "None"} />
            <MonitorStat label="Confidence" value={`${history.latest_confidence}/100`} />
            <MonitorStat label="Degraded" value={`${history.degraded_count}`} />
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <BarChart3 aria-hidden="true" className="size-4 shrink-0 text-engine" />
              <p className="truncate text-sm font-semibold text-on-surface">Monitor run tape</p>
            </div>
            <span className={monitorHistoryStatusClassName(history.status)}>{history.status}</span>
          </div>

          {latestRuns.length > 0 ? (
            <div className="mt-3 grid gap-2" aria-label="Recent read-only market monitor runs">
              {latestRuns.map((run) => (
                <div key={`${run.finished_at}-${run.selected_symbol}`} className="grid min-w-0 grid-cols-[76px_1fr_auto] items-center gap-2">
                  <p className="truncate text-xs font-semibold text-on-surface">{run.selected_symbol}</p>
                  <div className="h-2 overflow-hidden rounded-full bg-outline/15" aria-label={`${run.selected_symbol} confidence ${run.candle_confidence} of 100`}>
                    <div
                      className={run.provider_degraded ? "h-full rounded-full bg-caution" : "h-full rounded-full bg-engine"}
                      style={{ width: `${Math.max(4, Math.min(100, run.candle_confidence))}%` }}
                    />
                  </div>
                  <p className="min-w-0 text-right text-[11px] text-outline">
                    {run.paper_action.replaceAll("-", " ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-outline/20 bg-surface/50 p-3">
              <p className="text-sm font-semibold text-on-surface">Run the monitor once</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                Use npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json to write the first sanitized tape row.
              </p>
            </div>
          )}

          <p className="mt-3 line-clamp-2 text-xs leading-5 text-on-surface-variant">{history.next_action}</p>
        </div>
      </div>
    </section>
  );
}

function MonitorStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-outline/15 bg-surface-dim/45 p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function monitorHistoryStatusClassName(status: Web3MarketMonitorHistory["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "active") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "blocked") return `${base} border-critical/30 bg-critical/10 text-critical`;
  if (status === "degraded") return `${base} border-caution/30 bg-caution/10 text-caution`;
  return `${base} border-outline/20 bg-surface text-outline`;
}

function SupervisedLiveRunwayPanel({ runway }: { runway: Web3SupervisedLiveRunway }) {
  const nextLane = runway.lanes.find((lane) => lane.status === "needed" || lane.status === "blocked") ??
    runway.lanes.find((lane) => lane.status === "review") ??
    runway.lanes[0];

  return (
    <section
      aria-labelledby="trading-supervised-live-runway-title"
      className="rounded-md border border-engine/25 bg-surface-dim/45 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
              Supervised live runway
            </p>
            <h2 id="trading-supervised-live-runway-title" className="mt-1 font-display text-xl font-semibold text-on-surface">
              {runway.ready_lane_count}/{runway.total_lane_count} lanes ready before live review
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
              {runway.summary} Live execution, transaction submission, and wallet mutation stay blocked inside Mastermind.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={runwayStatusClassName(runway.status)}>
            {runway.status.replaceAll("-", " ")}
          </span>
          <Link
            href="/settings/integrations"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15"
          >
            Open setup
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_1.9fr]">
        <div className="rounded-md border border-caution/25 bg-caution/[0.035] p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next supervised-live action</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">{nextLane?.label ?? "Review runway"}</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{runway.next_action}</p>
          <p className="mt-2 text-[11px] leading-4 text-outline">
            Launch model: {runway.launch_model}; signing remains external-wallet-prompt-only.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Supervised live lane states">
          {runway.lanes.map((lane) => (
            <div key={lane.id} className="min-w-0 rounded-md border border-outline/15 bg-surface/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-on-surface">{lane.label}</p>
                <span className={runwayLaneClassName(lane.status)}>{lane.status}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">{lane.detail}</p>
              <p className="mt-2 truncate text-[11px] leading-4 text-outline">{lane.evidence[0] ?? lane.next_action}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function runwayStatusClassName(status: Web3SupervisedLiveRunway["status"]) {
  const base = "inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold capitalize";
  if (status === "manual-review-needed") return `${base} border-engine/35 bg-engine/10 text-engine`;
  if (status === "blocked") return `${base} border-critical/35 bg-critical/10 text-critical`;
  return `${base} border-caution/35 bg-caution/10 text-caution`;
}

function runwayLaneClassName(status: Web3SupervisedLiveRunway["lanes"][number]["status"]) {
  const base = "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]";
  if (status === "ready" || status === "review") return `${base} border-engine/30 bg-engine/10 text-engine`;
  if (status === "blocked") return `${base} border-critical/30 bg-critical/10 text-critical`;
  return `${base} border-caution/30 bg-caution/10 text-caution`;
}

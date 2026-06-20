import { Activity, ArrowRight, BarChart3, Database, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Chip } from "@/components/sentinel";
import { Web3TradingWorkspaceLoader } from "@/components/web3-trading-workspace-loader";
import { buildWeb3AccountAcquisitionReceipt } from "@/src/db/web3-account-acquisition";
import { buildWeb3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { buildWeb3CutoverBlockerBoard, type Web3CutoverBlockerBoard } from "@/src/db/web3-cutover-blocker-board";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { getWeb3MarketMonitorHistory, type Web3MarketMonitorHistory } from "@/src/db/web3-market-monitor-history";
import { buildWeb3OperatorCredentialHandoffReceipt } from "@/src/db/web3-operator-credential-handoff";
import { buildWeb3OperatorRequestPacket } from "@/src/db/web3-operator-request-packet";
import { buildWeb3OperatorRunbook, type Web3OperatorRunbookReceipt } from "@/src/db/web3-operator-runbook";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
import { buildWeb3LiveUsabilityBlockersReceipt, type Web3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import { buildWeb3ManualLiveReviewPacket } from "@/src/db/web3-manual-live-review-packet";
import { buildWeb3ProductionSupervisorReadiness } from "@/src/db/web3-production-supervisor";
import { buildWeb3SignerCredentialPacket } from "@/src/db/web3-signer-credential-packet";
import { buildWeb3SupervisedLiveRunway, type Web3SupervisedLiveRunway } from "@/src/db/web3-supervised-live-runway";
import { buildWeb3UsabilityStatus, type Web3UsabilityStatusReceipt } from "@/src/db/web3-usability-status";
import { getWeb3TradingStateAsync, isTradingAccountMode, isTradingMarketSource } from "@/src/db/web3-trading";

export const dynamic = "force-dynamic";

type TradingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TradingPage({ searchParams }: TradingPageProps) {
  const params = await searchParams;
  const accountParam = firstParam(params?.account);
  const sourceParam = firstParam(params?.source);
  const account = accountParam && isTradingAccountMode(accountParam) ? accountParam : "persistent";
  const source = sourceParam && isTradingMarketSource(sourceParam) ? sourceParam : "sample";
  const initialState = await getWeb3TradingStateAsync({
    account,
    source,
  });
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
  const supervisedLiveRunway = buildWeb3SupervisedLiveRunway({
    state: initialState,
    wallet: buildWeb3DedicatedWalletPacket(initialState),
    jupiter: buildWeb3JupiterOrderPacket(initialState),
    signer: buildWeb3SignerCredentialPacket(initialState),
    liveOps,
  });
  const usabilityStatus = buildWeb3UsabilityStatus({
    state: initialState,
    launchChecklist,
    supervisedRunway: supervisedLiveRunway,
  });
  const operatorRequestPacket = buildWeb3OperatorRequestPacket(buildWeb3OperatorCredentialHandoffReceipt({
    accountSetup,
    acquisition: buildWeb3AccountAcquisitionReceipt(initialState),
    launchChecklist,
  }));
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
  });
  const liveUsabilityBlockers = buildWeb3LiveUsabilityBlockersReceipt({
    state: initialState,
    usability: usabilityStatus,
    cutover: cutoverBlockerBoard,
    runbook: operatorRunbook,
    preflight: liveCapitalPreflight,
    manualLiveReview,
    runway: supervisedLiveRunway,
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
          subtitle="Autonomous Web3 trading desk and copilot for high-signal memecoin monitoring, wallet growth, route checks, and local paper fills."
          provenance={provenanceLabel}
          right={<Chip tone={initialState.autonomous_edge_stack_execution.status === "blocked" ? "critical" : "caution"}>{shellStatus}</Chip>}
        />

        <div className="w-full min-w-0 space-y-4">
          <TradingSourceSwitch source={source} account={account} />
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
          <ReadinessReceiptsDrawer>
            <LiveUsabilityBlockersPanel receipt={liveUsabilityBlockers} source={source} account={account} />
            <UsabilityStatusPanel status={usabilityStatus} source={source} account={account} />
            <CutoverBlockerBoardPanel board={cutoverBlockerBoard} source={source} account={account} />
            <OperatorRunbookPanel runbook={operatorRunbook} source={source} account={account} />
          </ReadinessReceiptsDrawer>
          <MarketMonitorHistoryPanel history={monitorHistory} />

          <Web3TradingWorkspaceLoader
            initialState={initialState}
            initialSupervisorHealth={supervisorHealth}
            initialPromotedAutopilotHealth={promotedAutopilotHealth}
            initialLaunchChecklist={launchChecklist}
          />
        </div>
      </div>
    </AppShell>
  );
}

function TradingSourceSwitch({
  source,
  account,
}: {
  source: "sample" | "live-dex";
  account: "persistent" | "ephemeral";
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
            href={tradingSourceHref("sample", account)}
            active={source === "sample"}
            icon={<Database aria-hidden="true" className="size-4" />}
            label="Sample tape"
          />
          <TradingSourceLink
            href={tradingSourceHref("live-dex", account)}
            active={source === "live-dex"}
            icon={<Activity aria-hidden="true" className="size-4" />}
            label="Live DEX read"
          />
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-outline">
        Source switching changes read-only market evidence only; signing, submission, wallet mutation, private-key storage, and seed phrase storage stay blocked.
      </p>
    </section>
  );
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

function tradingSourceHref(source: "sample" | "live-dex", account: "persistent" | "ephemeral") {
  const params = new URLSearchParams({ source });
  if (account !== "persistent") params.set("account", account);
  return `/trading?${params.toString()}`;
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
                href="/settings/integrations"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-engine/35 bg-engine/10 px-3 py-2 text-sm font-semibold text-engine transition hover:bg-engine/15"
              >
                Fix gates
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
              <CommandBoardMetric label="Missing" value={`${liveUsabilityBlockers.missing_for_live_usability.length}`} detail="top rows" tone={liveUsabilityBlockers.missing_for_live_usability.length > 0 ? "critical" : "engine"} />
              <CommandBoardMetric label="Signoffs" value={`${liveUsabilityBlockers.passed_signoff_count}/${liveUsabilityBlockers.required_signoff_count}`} detail={`${liveUsabilityBlockers.failed_or_watch_signoff_count} open`} tone={liveUsabilityBlockers.failed_or_watch_signoff_count > 0 ? "caution" : "engine"} />
              <CommandBoardMetric label="Actions" value={`${liveUsabilityBlockers.safe_action_count}`} detail={`${liveUsabilityBlockers.gated_action_count} gated`} tone="engine" />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-outline">{liveUsabilityBlockers.next_action}</p>
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

function ReadinessReceiptsDrawer({ children }: { children: React.ReactNode }) {
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
      <div className="mt-3 space-y-3">
        {children}
      </div>
    </details>
  );
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
  const href = `/api/web3-live-usability-blockers?${params.toString()}`;
  const missing = receipt.missing_for_live_usability.slice(0, 6);

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
              Open blockers JSON
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <LiveUsabilityStat label="Inputs" value={`${receipt.open_operator_input_count}`} tone={receipt.open_operator_input_count > 0 ? "caution" : "engine"} />
            <LiveUsabilityStat label="Capital blockers" value={`${receipt.real_capital_blocker_count}`} tone={receipt.real_capital_blocker_count > 0 ? "critical" : "engine"} />
            <LiveUsabilityStat label="Live lanes" value={`${receipt.ready_live_lane_count}/${receipt.total_live_lane_count}`} tone={receipt.ready_live_lane_count === receipt.total_live_lane_count ? "engine" : "caution"} />
          </div>

          <div className="mt-3 rounded-md border border-outline/15 bg-surface/50 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Next action</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{receipt.next_action}</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-2">
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

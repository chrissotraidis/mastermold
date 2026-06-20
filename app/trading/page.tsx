import { Activity, ArrowRight, BarChart3, Database, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Chip } from "@/components/sentinel";
import { Web3TradingWorkspaceLoader } from "@/components/web3-trading-workspace-loader";
import { buildWeb3AccountingLedgerReceipt } from "@/src/db/web3-accounting-ledger";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { buildWeb3DedicatedWalletPacket } from "@/src/db/web3-dedicated-wallet-packet";
import { buildWeb3EmergencyStopDrillReceipt } from "@/src/db/web3-emergency-stop";
import { buildWeb3JupiterOrderPacket } from "@/src/db/web3-jupiter-order-packet";
import { getWeb3MarketMonitorHistory, type Web3MarketMonitorHistory } from "@/src/db/web3-market-monitor-history";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import { buildWeb3LiveOpsPacket } from "@/src/db/web3-live-ops-packet";
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
          />
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
}: {
  state: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>;
  status: Web3UsabilityStatusReceipt;
  runway: Web3SupervisedLiveRunway;
  launchChecklist: ReturnType<typeof buildWeb3AutonomyLaunchChecklist>;
}) {
  const wallet = state.autonomous_wallet_telemetry;
  const decision = state.autonomous_now_decision;
  const fusion = state.autonomous_market_evidence_fusion;
  const route = state.autonomous_route_refresh_execution;
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
          <div className="rounded-md border border-caution/25 bg-caution/[0.04] p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next usable gate</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">{nextGate?.label ?? status.next_gate_label}</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{nextGate?.next_action ?? status.next_gate_action}</p>
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
            <p className="mt-2 text-xs leading-5 text-on-surface-variant">{runway.next_action}</p>
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

function UsabilityStatusPanel({ status }: { status: Web3UsabilityStatusReceipt }) {
  const nextCapability = status.capabilities.find((capability) => capability.status === "gated") ??
    status.capabilities.find((capability) => capability.status === "watch") ??
    status.capabilities[0];

  return (
    <section
      aria-labelledby="trading-usability-status-title"
      className="rounded-md border border-engine/25 bg-engine/[0.04] p-4 sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-engine/30 bg-engine/10 text-engine">
              <ArrowRight aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Usability status</p>
              <h2 id="trading-usability-status-title" className="mt-1 font-display text-xl font-semibold text-on-surface">
                {status.current_mode.replaceAll("-", " ")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{status.summary}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <UsabilityStat label="Usable" value={`${status.usable_count}`} tone="engine" />
            <UsabilityStat label="Gated" value={`${status.gated_count}`} tone={status.gated_count > 0 ? "caution" : "engine"} />
            <UsabilityStat label="Locked" value={`${status.locked_count}`} tone="demo" />
          </div>

          <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.04] p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next gate</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">{status.next_gate_label}</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{status.next_gate_action}</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
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
              {nextCapability?.id === capability.id ? (
                <p className="mt-2 line-clamp-2 border-t border-outline/15 pt-2 text-[11px] leading-4 text-outline">
                  {capability.next_action}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-outline">
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

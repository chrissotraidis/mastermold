import { Activity, ArrowRight, BarChart3, ShieldCheck } from "lucide-react";
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
  const shellStatus = initialState.autonomous_edge_stack_execution.status === "blocked"
    ? "Edge action blocked"
    : initialState.autonomous_edge_stack_execution.selected_action.replace("-", " ");

  return (
    <AppShell dataMode="Sample data">
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        <PageHeader
          title="Web3 Autopilot"
          subtitle="Autonomous Web3 trading desk and copilot for high-signal memecoin monitoring, wallet growth, route checks, and local paper fills."
          provenance="Sample data"
          right={<Chip tone={initialState.autonomous_edge_stack_execution.status === "blocked" ? "critical" : "caution"}>{shellStatus}</Chip>}
        />

        <div className="w-full min-w-0 space-y-4">
          <SupervisedLiveRunwayPanel runway={supervisedLiveRunway} />
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

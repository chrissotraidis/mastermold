import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Chip } from "@/components/sentinel";
import { Web3TradingWorkspaceLoader } from "@/components/web3-trading-workspace-loader";
import { getWeb3DaemonSupervisorHealth } from "@/src/db/web3-daemon-supervisor";
import { getWeb3PromotedPaperAutopilotHealth } from "@/src/db/web3-promoted-paper-autopilot";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
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
  const launchChecklist = buildWeb3AutonomyLaunchChecklist(initialState, promotedAutopilotHealth, supervisorHealth);
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

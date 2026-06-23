import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { TradeDeferredDetails } from "@/components/trade-deferred-details";
import { TradeLoadingState } from "@/components/trade-loading-state";
import { TradeOverview } from "@/components/trade-overview";
import { peekCachedWeb3TradingState, warmCachedWeb3TradingState } from "@/src/db/web3-trading-state-cache";
import { isTradingAccountMode, isTradingMarketSource, isTradingScenario, type Web3TradingState } from "@/src/db/web3-trading";
import { Suspense } from "react";

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
  const scenarioParam = firstParam(params?.scenario);
  const detailsParam = firstParam(params?.details);
  const actionParam = firstParam(params?.action);
  const account = accountParam && isTradingAccountMode(accountParam) ? accountParam : "persistent";
  const source = sourceParam && isTradingMarketSource(sourceParam) ? sourceParam : "live-dex";
  const scenario = scenarioParam && isTradingScenario(scenarioParam) ? scenarioParam : "breakout";
  const technicalDetailsOpen = detailsParam === "technical";
  const commandAction = actionParam === "run-paper-test" ? actionParam : undefined;
  const provenanceLabel = source === "live-dex" ? "Live DEX read" : "Sample data";
  const stateRequest = { account, source, scenario };
  const cachedOverviewState = peekCachedWeb3TradingState(stateRequest);
  const overviewState = cachedOverviewState ?? null;
  const overviewMode = cachedOverviewState ? "cached" : "fast-preview";
  warmCachedWeb3TradingState(stateRequest);
  const tradeRoute = `/trading?account=${account}&source=${source}&scenario=${scenario}`;

  return (
    <AppShell dataMode={provenanceLabel}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <PageHeader
          title="Trade"
          subtitle="Monitor the Web3 desk, review the next test trade, and keep live money locked until setup is reviewed."
          provenance={provenanceLabel}
          back={false}
          command={{
            pageContext: {
              surface: "Trade",
              route: tradeRoute,
              summary:
                "The user is looking at wallet status, the next required trade action, portfolio/net-worth movement, active positions, test trades, and technical setup details. The current app signs nothing.",
            },
            suggestions: [
              { label: "Next action", prompt: "Show next action." },
              { label: "Check Web3", prompt: "Check Web3." },
              { label: "Test trade", prompt: "Open test trade." },
              { label: "Save context", prompt: "Save context for chat." },
            ],
          }}
        />

        <Suspense fallback={<TradeLoadingState />}>
          <TradeStateSections
            state={overviewState}
            overviewMode={overviewMode}
            scenario={scenario}
            source={source}
            account={account}
            technicalDetailsOpen={technicalDetailsOpen}
            commandAction={commandAction}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}

function TradeStateSections({
  state,
  overviewMode,
  scenario,
  source,
  account,
  technicalDetailsOpen,
  commandAction,
}: {
  state: Web3TradingState | null;
  overviewMode: "cached" | "fast-preview";
  scenario: "base" | "breakout" | "rug-risk";
  source: "sample" | "live-dex";
  account: "ephemeral" | "persistent";
  technicalDetailsOpen: boolean;
  commandAction?: "run-paper-test";
}) {
  return (
    <>
      <TradeOverview state={state} overviewMode={overviewMode} requestedSource={source} />
      <TradeDeferredDetails
        source={source}
        account={account}
        scenario={scenario}
        technicalDetailsOpen={technicalDetailsOpen}
        commandAction={commandAction}
      />
    </>
  );
}

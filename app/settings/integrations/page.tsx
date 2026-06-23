import { ExternalLink, LockKeyhole, PlugZap, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { BrainInitializationPanel } from "@/components/brain-initialization-panel";
import { PageHeader } from "@/components/page-header";
import { IntegrationKeyInput } from "@/components/integration-key-input";
import { ManualHoldingsPanel } from "@/components/manual-holdings-panel";
import { ProfileSettings } from "@/components/profile-settings";
import { SettingsSection } from "@/components/settings-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { toPublicBrainState } from "@/lib/public-api-copy";
import { cn } from "@/lib/utils";
import { getBrainState, getBrainStateAfterDueScheduleCheck, type BrainState } from "@/src/db/brain";
import { getIntegrationStatuses, type IntegrationStatusJson } from "@/src/db/integrations";
import { getPortfolio } from "@/src/db/portfolio";
import { buildWeb3AccountSetupReceipt, type Web3AccountSetupReceipt } from "@/src/db/web3-account-setup";
import { getWeb3TradingState, getWeb3TradingStateAsync, type Web3TradingState } from "@/src/db/web3-trading";

const statusLabels: Record<IntegrationStatusJson["status"], string> = {
  connected: "Test passed",
  stubbed: "Sample mode",
  credential_gated: "Needs key",
};

export const dynamic = "force-dynamic";

const SETTINGS_STATE_TTL_MS = 8_000;
const SETTINGS_FALLBACK_TTL_MS = 2_000;
let settingsStateCache:
  | {
      expiresAt: number;
      value: {
        brainStateRaw: BrainState;
        web3State: Web3TradingState;
      };
    }
  | null = null;
let settingsStateWarmTimer: ReturnType<typeof setTimeout> | null = null;
let settingsStateWarmPromise: Promise<void> | null = null;

type SettingsIntegrationService = Exclude<IntegrationStatusJson["service"], "llm"> | "live_chat";
type SettingsIntegrationStatus = Omit<IntegrationStatusJson, "id" | "service"> & {
  id: string;
  service: SettingsIntegrationService;
};

type IntegrationsSettingsPageProps = {
  searchParams?: Promise<{ action?: string }>;
};

export default async function IntegrationsSettingsPage({ searchParams }: IntegrationsSettingsPageProps = {}) {
  const params = await searchParams;
  const commandAction = parseSettingsCommandAction(params?.action);
  const integrations = getIntegrationStatuses().map(toSettingsIntegrationStatus);
  const portfolio = getPortfolio();
  const publicProvenanceLabel = productProvenanceLabel(portfolio.provenance.label);
  const portfolioIntegrations = integrations.filter((integration) => integration.service !== "live_chat");
  const chatIntegrations = integrations.filter((integration) => integration.service === "live_chat");

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Settings"
          subtitle="Set up your profile, portfolio connections, AI keys, Web3 wallet, and safety limits without digging through technical details."
          provenance={publicProvenanceLabel}
          back={false}
          command={{
            pageContext: {
              surface: "Settings",
              route: "/settings",
              summary:
                "The user is looking at connection checks, manual holdings, holdings snapshot imports, preferences, local profile backup, Web3 wallet setup, and privacy. Imports happen only after the user presses the import button.",
            },
            suggestions: [
              { label: "Check setup", prompt: "Check setup." },
              { label: "Portfolio setup", prompt: "Open portfolio connections." },
              { label: "AI/chat keys", prompt: "Open AI/chat keys." },
              { label: "Web3 setup", prompt: "Open Web3 setup." },
            ],
          }}
        />

        <Suspense
          fallback={
            <SettingsSectionsLoading
              portfolioConnectionCount={portfolioIntegrations.length}
              chatConnectionCount={chatIntegrations.length}
            />
          }
        >
          <SettingsDeferredSections
            commandAction={commandAction}
            portfolio={portfolio}
            portfolioIntegrations={portfolioIntegrations}
            chatIntegrations={chatIntegrations}
          />
        </Suspense>
      </div>
    </AppShell>
  );
}

function SettingsDeferredSections({
  commandAction,
  portfolio,
  portfolioIntegrations,
  chatIntegrations,
}: {
  commandAction: SettingsCommandAction | null;
  portfolio: ReturnType<typeof getPortfolio>;
  portfolioIntegrations: SettingsIntegrationStatus[];
  chatIntegrations: SettingsIntegrationStatus[];
}) {
  const { brainStateRaw, web3State } = getFastSettingsState();
  const brainState = toPublicBrainState(brainStateRaw);
  const web3AccountReceipt = buildWeb3AccountSetupReceipt(web3State);

  return (
    <>
      <SettingsSectionIndex
        portfolioConnectionCount={portfolioIntegrations.length}
        chatConnectionCount={chatIntegrations.length}
        web3ReadyCount={web3AccountReceipt.environment_summary.required_configured_count}
        web3RequiredCount={web3AccountReceipt.environment_summary.required_account_count}
        safetyLimitUsd={web3State.execution_readiness.config.max_trade_usd}
      />

      <SettingsSection
        id="profile"
        title="Profile"
        purpose="Personal details and preferences used by Today, chat, and saved briefings."
        nextAction="Review your profile and update anything stale."
      >
        <ProfileSettings />
      </SettingsSection>

      <SettingsSection
        id="portfolio-connections"
        title="Portfolio connections"
        purpose="Add manual holdings, test read-only account access, and import snapshots when you choose."
        nextAction="Add holdings manually or test one account connection."
        defaultOpen={commandAction === "test-portfolio-connection" || commandAction === "import-portfolio-snapshot"}
      >
        <div className="grid gap-4">
          <ManualHoldingsPanel holdings={portfolio.manual_holdings} />
          <PortfolioImportStatusCard portfolio={portfolio} />
          <ConnectionChecks integrations={portfolioIntegrations} commandGroup="portfolio" />
        </div>
      </SettingsSection>

      <SettingsSection
        id="ai-chat-keys"
        title="AI/chat keys"
        purpose="Connect optional chat providers and refresh the local brain state."
        nextAction="Test live chat only if you want the assistant to use an external provider."
        defaultOpen={commandAction === "test-live-chat"}
      >
        <div className="grid gap-4">
          {chatIntegrations.length > 0 ? <ConnectionChecks integrations={chatIntegrations} commandGroup="chat" /> : (
            <p className="rounded-md border border-outline-variant/40 bg-surface-dim/45 p-4 text-sm leading-6 text-outline">
              No live chat provider is configured in this build.
            </p>
          )}
          <details className="rounded-md border border-outline-variant/40 bg-surface-high/25 p-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
              Brain refresh tools
            </summary>
            <div className="pt-4">
              <BrainInitializationPanel initialState={brainState} />
            </div>
          </details>
        </div>
      </SettingsSection>

      <SettingsSection
        id="web3-wallet-trading"
        title="Web3 wallet and trading setup"
        purpose="Prepare a dedicated wallet and provider keys while live money remains locked."
        nextAction={plainSettingsCopy(web3AccountReceipt.next_action)}
      >
        <Web3SettingsSummary
          account={web3AccountReceipt}
          walletStatus={web3State.wallet_holdings_adapter.status}
          tradeMode={web3State.paper_account.mode}
        />
        <details className="mt-4 rounded-md border border-outline-variant/40 bg-surface-high/25 p-4">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-on-surface">
            <span>Technical details</span>
            <span className="text-xs font-normal text-outline">Reviewer checks and setup tools</span>
          </summary>
          <Web3TechnicalLinks />
        </details>
      </SettingsSection>

      <div className="pt-6 sm:pt-0">
        <SettingsSection
          id="safety-limits"
          title="Safety limits"
          purpose="See the trade caps, live-money boundary, and data privacy rules in plain English."
          nextAction="Keep live execution off until wallet setup and manual review are complete."
          defaultOpen
        >
          <SafetyLimitsSettingsCard
            maxTradeUsd={web3State.execution_readiness.config.max_trade_usd}
            dailySpendCapUsd={web3State.execution_readiness.config.daily_spend_cap_usd}
            maxSlippageBps={web3State.execution_readiness.config.max_slippage_bps}
            liveExecutionPermitted={web3State.autonomous_live_autonomy_readiness.live_execution_permitted}
            walletMutationPermission="blocked"
          />
          <div className="mt-4">
            <DataPrivacyCard />
          </div>
        </SettingsSection>
      </div>
    </>
  );
}

type SettingsCommandAction =
  | "test-portfolio-connection"
  | "import-portfolio-snapshot"
  | "test-live-chat";

function parseSettingsCommandAction(value: string | undefined): SettingsCommandAction | null {
  if (
    value === "test-portfolio-connection" ||
    value === "import-portfolio-snapshot" ||
    value === "test-live-chat"
  ) {
    return value;
  }

  return null;
}

function getFastSettingsState() {
  const now = Date.now();
  if (settingsStateCache && settingsStateCache.expiresAt > now) {
    return settingsStateCache.value;
  }

  const value = settingsStateCache?.value ?? {
    brainStateRaw: getBrainState(),
    web3State: getWeb3TradingState("base", 0),
  };

  settingsStateCache = {
    expiresAt: now + SETTINGS_FALLBACK_TTL_MS,
    value,
  };

  warmSettingsState();
  return value;
}

function warmSettingsState() {
  if (settingsStateWarmTimer || settingsStateWarmPromise) return;

  settingsStateWarmTimer = setTimeout(() => {
    settingsStateWarmTimer = null;
    settingsStateWarmPromise = Promise.all([
      getBrainStateAfterDueScheduleCheck({ trigger: "settings-open" }),
      getWeb3TradingStateAsync({ advance: false }),
    ])
      .then(([brainStateRaw, web3State]) => {
        settingsStateCache = {
          expiresAt: Date.now() + SETTINGS_STATE_TTL_MS,
          value: { brainStateRaw, web3State },
        };
      })
      .catch(() => {
        settingsStateCache = null;
      })
      .finally(() => {
        settingsStateWarmPromise = null;
      });
  }, 0);
  settingsStateWarmTimer.unref?.();
}

function SettingsSectionsLoading({
  portfolioConnectionCount,
  chatConnectionCount,
}: {
  portfolioConnectionCount: number;
  chatConnectionCount: number;
}) {
  const sections = [
    ["Profile", "Review"],
    ["Portfolio connections", `${portfolioConnectionCount} sources`],
    ["AI/chat keys", chatConnectionCount > 0 ? "Available" : "Optional"],
    ["Web3 wallet and trading setup", "Checking"],
    ["Safety limits", "Checking"],
  ];

  return (
    <div className="grid gap-3" data-testid="settings-deferred-loading">
      <section aria-label="Settings sections loading" className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-5">
        {sections.map(([title, value]) => (
          <div
            key={title}
            className="flex min-h-12 flex-col justify-between rounded-md border border-outline-variant/40 bg-surface-high/25 p-2.5 sm:min-h-16 sm:p-3"
          >
            <p className="text-xs font-semibold leading-4 text-on-surface sm:text-sm sm:leading-5">{title}</p>
            <p className="mt-1 text-[11px] font-semibold leading-4 text-violet sm:mt-2 sm:text-xs">{value}</p>
          </div>
        ))}
      </section>

      {["Profile", "Portfolio connections", "AI/chat keys", "Web3 wallet and trading setup", "Safety limits"].map((title) => (
        <div
          key={title}
          className="rounded-md border border-outline-variant/40 bg-surface-high/20 p-4"
        >
          <div className="flex min-h-11 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-on-surface">{title}</p>
              <p className="mt-1 text-xs leading-5 text-outline">Loading setup details. Master Mold can still route you here.</p>
            </div>
            <div className="size-9 shrink-0 animate-pulse rounded-md bg-surface-highest/45" aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsSectionIndex({
  portfolioConnectionCount,
  chatConnectionCount,
  web3ReadyCount,
  web3RequiredCount,
  safetyLimitUsd,
}: {
  portfolioConnectionCount: number;
  chatConnectionCount: number;
  web3ReadyCount: number;
  web3RequiredCount: number;
  safetyLimitUsd: number;
}) {
  const sections = [
    {
      title: "Profile",
      href: "#profile",
      value: "Review",
    },
    {
      title: "Portfolio connections",
      href: "#portfolio-connections",
      value: `${portfolioConnectionCount} sources`,
    },
    {
      title: "AI/chat keys",
      href: "#ai-chat-keys",
      value: chatConnectionCount > 0 ? "Available" : "Optional",
    },
    {
      title: "Web3 wallet and trading setup",
      href: "#web3-wallet-trading",
      value: `${web3ReadyCount}/${web3RequiredCount} ready`,
    },
    {
      title: "Safety limits",
      href: "#safety-limits",
      value: `${formatSettingsCurrency(safetyLimitUsd)} max`,
    },
  ];

  return (
    <section aria-label="Settings sections" className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-5">
      {sections.map((section) => (
        <a
          key={section.href}
          href={section.href}
          aria-label={`${section.title}: ${section.value}`}
          className="flex min-h-12 flex-col justify-between rounded-md border border-outline-variant/40 bg-surface-high/30 p-2.5 transition hover:border-violet/50 sm:min-h-16 sm:p-3"
        >
          <p className="text-xs font-semibold leading-4 text-on-surface sm:text-sm sm:leading-5">{section.title}</p>
          <span className="sr-only">: </span>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-violet sm:mt-2 sm:text-xs">{section.value}</p>
        </a>
      ))}
    </section>
  );
}

function Web3SettingsSummary({
  account,
  walletStatus,
  tradeMode,
}: {
  account: Web3AccountSetupReceipt;
  walletStatus: string;
  tradeMode: string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-telemetry text-outline">Setup status</p>
            <h3 className="mt-1 text-lg font-semibold text-on-surface">
              {account.environment_summary.required_configured_count}/{account.environment_summary.required_account_count} required setup items are ready.
            </h3>
          </div>
          <StatusBadge status={account.environment_summary.required_configured_count === account.environment_summary.required_account_count ? "connected" : "credential_gated"} />
        </div>
        <p className="mt-3 text-sm leading-6 text-on-surface-variant">{plainSettingsCopy(account.summary)}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <SettingsMetric label="Wallet" value={account.wallet_summary.wallet_public_key_preview ?? "Needs wallet"} />
          <SettingsMetric label="Read rail" value={account.environment_summary.helius_read_rail_configured ? "Ready" : "Needs key"} />
          <SettingsMetric label="Jupiter" value={account.environment_summary.jupiter_configured ? "Ready" : "Needs key"} />
        </div>
      </div>
      <div className="rounded-md border border-caution/30 bg-caution/[0.035] p-4">
        <p className="text-xs font-medium uppercase tracking-telemetry text-caution">Next setup action</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-on-surface">{account.status.replaceAll("-", " ")}</p>
        <p className="mt-2 text-xs leading-5 text-on-surface-variant">{plainSettingsCopy(account.next_action)}</p>
        <div className="mt-3 grid gap-2">
          <SettingsMetric label="Wallet scan" value={walletStatus.replaceAll("-", " ")} />
          <SettingsMetric label="Trade mode" value={tradeMode.replaceAll("-", " ")} />
        </div>
        <Link
          href="/trading"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-caution/40 bg-caution/10 px-3 py-2 text-xs font-semibold text-caution transition hover:bg-caution/15"
        >
          Open Trade
        </Link>
      </div>
    </div>
  );
}

function Web3TechnicalLinks() {
  const links = [
    {
      label: "Trade control room",
      detail: "Open the rebuilt trade page for wallet status, next action, chart, and orders.",
      href: "/trading",
    },
    {
      label: "System status",
      detail: "Reviewer evidence for what works, what is sample, what is missing, and credentials.",
      href: "/review",
    },
    {
      label: "Health status",
      detail: "Local health endpoint for reviewers and automation checks.",
      href: "/api/health",
    },
    {
      label: "Web3 setup status",
      detail: "Account setup status for credential troubleshooting.",
      href: "/api/web3-account-setup",
    },
  ];

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-md border border-outline-variant/35 bg-surface-dim/35 p-3 transition hover:border-violet/50"
        >
          <p className="text-sm font-semibold text-on-surface">{link.label}</p>
          <p className="mt-1 text-xs leading-5 text-outline">{link.detail}</p>
        </Link>
      ))}
    </div>
  );
}

function SafetyLimitsSettingsCard({
  maxTradeUsd,
  dailySpendCapUsd,
  maxSlippageBps,
  liveExecutionPermitted,
  walletMutationPermission,
}: {
  maxTradeUsd: number;
  dailySpendCapUsd: number;
  maxSlippageBps: number;
  liveExecutionPermitted: boolean;
  walletMutationPermission: string;
}) {
  return (
    <Card className="border-outline-variant/40 bg-surface-high/30">
      <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <SettingsMetric label="Max trade" value={formatSettingsCurrency(maxTradeUsd)} />
        <SettingsMetric label="Daily cap" value={formatSettingsCurrency(dailySpendCapUsd)} />
        <SettingsMetric label="Max slippage" value={`${maxSlippageBps} bps`} />
        <SettingsMetric label="Live movement" value={liveExecutionPermitted || walletMutationPermission !== "blocked" ? "Review now" : "Off"} />
      </CardContent>
    </Card>
  );
}

function plainSettingsCopy(value: string) {
  return value
    .replaceAll("canary", "test trade")
    .replaceAll("Canary", "Test trade")
    .replaceAll("receipt", "status")
    .replaceAll("Receipt", "Status")
    .replaceAll("packet", "status")
    .replaceAll("Packet", "Status")
    .replaceAll("blocker", "need")
    .replaceAll("Blocker", "Need")
    .replaceAll("blockers", "needs")
    .replaceAll("Blockers", "Needs")
    .replaceAll("relay", "confirmation")
    .replaceAll("Relay", "Confirmation")
    .replaceAll("proof chain", "confirmation")
    .replaceAll("Proof chain", "Confirmation");
}

function formatSettingsCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function ConnectionChecks({
  integrations,
  commandGroup,
}: {
  integrations: SettingsIntegrationStatus[];
  commandGroup: "portfolio" | "chat";
}) {
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
        {integrations.map((integration, index) => (
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
                commandGroup={commandGroup}
                commandPrimary={index === 0}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
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
    <section id="data-privacy" className="scroll-mt-28" aria-labelledby="data-privacy-title">
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

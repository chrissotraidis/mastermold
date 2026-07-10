import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { IntegrationKeyInput } from "@/components/integration-key-input";
import { MonarchMcpPanel } from "@/components/monarch-mcp-panel";
import { ProfileSettings } from "@/components/profile-settings";
import { SettingsSection } from "@/components/settings-section";
import { Badge } from "@/components/ui/badge";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { cn } from "@/lib/utils";
import {
  ensureDailyReportAutoRefresh,
  getDailyReportAutoRefreshStatus,
  getLatestDailyReport,
} from "@/src/db/daily-report";
import { getDataMode } from "@/src/db/engine-data";
import { getIntegrationStatuses, type IntegrationStatusJson } from "@/src/db/integrations";
import { getMonarchMcpPublicConfig } from "@/src/db/monarch-mcp";
import { getPortfolio } from "@/src/db/portfolio";
import { getPortfolioBrainScanContext, getPortfolioBrainState } from "@/src/db/portfolio-brain";
import { getAutopilotState } from "@/src/autopilot/control";

export const dynamic = "force-dynamic";

type SettingsIntegrationService = Exclude<IntegrationStatusJson["service"], "llm"> | "live_chat";
type SettingsIntegrationStatus = Omit<IntegrationStatusJson, "id" | "service"> & {
  id: string;
  service: SettingsIntegrationService;
};

const statusLabels: Record<IntegrationStatusJson["status"], string> = {
  connected: "Test passed",
  stubbed: "Sample mode",
  credential_gated: "Key needed",
};

export default async function SettingsPage() {
  const portfolio = getPortfolio();
  const publicProvenanceLabel = productProvenanceLabel(portfolio.provenance.label);
  const integrations = getIntegrationStatuses().map(toSettingsIntegrationStatus);
  const portfolioIntegrations = integrations.filter((integration) => integration.service !== "live_chat");
  const chatIntegrations = integrations.filter((integration) => integration.service === "live_chat");
  const portfolioBrain = getPortfolioBrainState();
  const monarchConfig = getMonarchMcpPublicConfig();
  const autopilot = getAutopilotState();

  // System health (absorbed from /review).
  const dataMode = getDataMode();
  const autoRefresh = await ensureDailyReportAutoRefresh();
  const dailyReport = autoRefresh.report ?? getLatestDailyReport();
  const autoRefreshStatus = getDailyReportAutoRefreshStatus();
  const portfolioSource = getPortfolioBrainScanContext();
  const publicDataMode = productProvenanceLabel(dataMode.label);

  // One-line closed-row summaries so the whole page reads at a glance.
  const connectedCount = portfolioIntegrations.filter((integration) => integration.status === "connected").length;
  const connectionsStatus =
    portfolio.import_snapshot.count === 0 && connectedCount === 0
      ? "No account source connected"
      : `${portfolio.import_snapshot.count} imported · ${connectedCount}/${portfolioIntegrations.length} tested`;
  const chatStatus = chatIntegrations.length > 0 ? integrationStatusLabel(chatIntegrations[0]) : "No chat provider";
  const autopilotLive = autopilot.mode === "live" && !autopilot.kill_switch;
  const autopilotStatus = autopilot.runtime_unavailable
    ? "Bot store locked"
    : autopilot.kill_switch
    ? "Kill switch engaged"
    : `Mode ${autopilot.mode} · daemon ${autopilot.daemon}`;
  const safetyStatus = autopilot.runtime_unavailable
    ? "Autopilot read-only · live off"
    : `Max trade ${formatSettingsCurrency(autopilot.caps.max_trade_usd)} · cap ${formatSettingsCurrency(autopilot.caps.daily_spend_limit_usd)}/day · live ${autopilotLive ? "on" : "off"}`;
  const healthStatus = `${publicDataMode} · report ${dailyReport ? dailyReport.run_date : "not saved"}`;

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="mx-auto grid w-full max-w-4xl gap-3 [&>*]:min-w-0">
        <header>
          <h1 className="font-display text-lg font-semibold text-on-surface">Settings</h1>
          <p className="mt-0.5 text-xs text-outline">
            Choose what to connect. Nothing here places trades, signs transactions, or moves funds.
          </p>
        </header>

        <nav
          aria-label="First-run setup path"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-outline-variant/25 px-3 py-2 text-xs leading-5 text-outline"
        >
          <span className="font-semibold text-on-surface">New here?</span>
          <Link href="#profile" className="font-semibold text-violet hover:text-tertiary">
            Save local preferences
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/portfolio#add-holdings" className="font-semibold text-violet hover:text-tertiary">
            add holdings manually
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="#chat" className="font-semibold text-violet hover:text-tertiary">
            add a chat key if you want live answers
          </Link>
          <span className="basis-full text-outline sm:basis-auto">
            Sample data stays separate until you add your own context.
          </span>
        </nav>

        <div className="divide-y divide-outline-variant/15 rounded-md border border-outline-variant/25">
          <SettingsSection
            id="connections"
            title="Connections"
            status={connectionsStatus}
            statusTone={connectedCount > 0 ? "ok" : "muted"}
            aliases={["investment-awareness", "portfolio-connections"]}
          >
            <span id="investment-awareness" aria-hidden="true" className="block scroll-mt-24" />
            <p className="text-xs leading-5 text-outline">
              Read-only portfolio sources. Manual holdings are often the fastest first setup; to add
              or edit them by hand, use{" "}
              <Link href="/portfolio#add-holdings" className="text-violet hover:text-tertiary">
                Portfolio
              </Link>
              . Imports are snapshots only, not automatic brokerage trading.
            </p>
            <div id="portfolio-connections" className="mt-2 grid scroll-mt-24 gap-2">
              <MonarchMcpPanel initialState={portfolioBrain} config={monarchConfig} />
              <PortfolioImportStatusCard portfolio={portfolio} />
              <ConnectionChecks integrations={portfolioIntegrations} commandGroup="portfolio" />
            </div>
          </SettingsSection>

          <SettingsSection id="profile" title="Profile" status="Saved in this browser">
            <ProfileSettings />
          </SettingsSection>

          <SettingsSection
            id="chat"
            title="Chat"
            status={chatStatus}
            statusTone={chatIntegrations[0]?.status === "connected" ? "ok" : "muted"}
            aliases={["ai-chat-keys"]}
          >
            <span id="ai-chat-keys" aria-hidden="true" className="block scroll-mt-24" />
            <p className="text-xs leading-5 text-outline">
              Optional. App commands and sample screens work without a chat key. Add an OpenRouter,
              OpenAI, or Anthropic key only if you want model-written answers using visible app context.
            </p>
            <div className="mt-2">
              {chatIntegrations.length > 0 ? (
                <ConnectionChecks integrations={chatIntegrations} commandGroup="chat" />
              ) : (
                <p className="rounded-md border border-outline-variant/25 px-3 py-2 text-xs leading-5 text-outline">
                  No live chat provider is configured in this build.
                </p>
              )}
            </div>
          </SettingsSection>

          <SettingsSection
            id="autopilot"
            title="Autopilot"
            status={autopilotStatus}
            statusTone={autopilot.runtime_unavailable ? "muted" : autopilot.kill_switch ? "watch" : autopilot.daemon === "live" ? "ok" : "muted"}
            aliases={["web3-wallet-trading"]}
          >
            <span id="web3-wallet-trading" aria-hidden="true" className="block scroll-mt-24" />
            <div className="grid gap-2">
              <AutopilotSettingsSummary state={autopilot} />
              <details className="rounded-md border border-outline-variant/25 px-3 py-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-on-surface marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>Technical details</span>
                  <span className="text-outline">Bot room and raw status</span>
                </summary>
                <p className="border-t border-outline-variant/15 pt-2 text-xs leading-5 text-outline">
                  Trade controls, daemon status, wallet provisioning, and go-live evidence live in{" "}
                  <Link href="/trading" className="font-semibold text-violet hover:text-tertiary">
                    Autopilot
                  </Link>
                  . Raw troubleshooting payload:{" "}
                  <a href="/api/autopilot" className="font-semibold text-violet hover:text-tertiary">
                    status JSON
                  </a>
                  .
                </p>
              </details>
            </div>
          </SettingsSection>

          <SettingsSection
            id="safety"
            title="Safety and privacy"
            status={safetyStatus}
            statusTone={autopilotLive ? "watch" : "muted"}
            aliases={["safety-limits", "data-privacy"]}
          >
            <span id="safety-limits" aria-hidden="true" className="block scroll-mt-24" />
            <div className="grid gap-2">
              <SafetyLimitsSettingsCard caps={autopilot.caps} liveExecutionPermitted={autopilotLive} />
              <DataPrivacyCard />
            </div>
          </SettingsSection>

          <SettingsSection id="health" title="System health" status={healthStatus}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs leading-5 text-outline">Data mode, sources, and report freshness.</p>
              <a href="/api/health" className="text-xs font-semibold text-violet hover:text-tertiary">
                Health JSON
              </a>
            </div>
            <dl className="mt-2 divide-y divide-outline-variant/15 rounded-md border border-outline-variant/25">
              <HealthRow label="Data mode" value={publicDataMode} />
              <HealthRow
                label="Portfolio source"
                value={portfolioSource.source_label}
                detail={`${portfolioSource.holdings_count} visible holding${portfolioSource.holdings_count === 1 ? "" : "s"}${portfolioSource.as_of ? ` · as of ${formatStatusTime(portfolioSource.as_of)}` : ""}`}
              />
              <HealthRow
                label="Daily report"
                value={dailyReport ? dailyReport.run_date : "Not saved yet"}
                detail={
                  dailyReport
                    ? `${dailyReport.market_rows.filter((row) => row.status === "refreshed").length} symbols refreshed, ${dailyReport.freshness.skipped_symbols.length} skipped · auto-refresh ${autoRefreshStatus.due ? "due" : "on"}, next ${formatStatusTime(autoRefreshStatus.next_refresh_after)}`
                    : "Use Refresh today on Today to save the first report."
                }
              />
              <HealthRow label="Credentials" value="Local reviewer" detail="No secrets required for local review." />
              <HealthRow label="Live trading" value="Locked" detail="No swaps, signatures, or fund movement." />
            </dl>
          </SettingsSection>
        </div>
      </div>
    </AppShell>
  );
}

function HealthRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <dt className="text-sm text-on-surface-variant">{label}</dt>
        <dd className="text-right text-sm font-semibold text-on-surface">{value}</dd>
      </div>
      {detail ? <p className="mt-0.5 text-xs leading-5 text-outline">{detail}</p> : null}
    </div>
  );
}

function ConnectionChecks({
  integrations,
  commandGroup,
}: {
  integrations: SettingsIntegrationStatus[];
  commandGroup: "portfolio" | "chat";
}) {
  // One status row per provider; the key-entry form only appears on demand.
  return (
    <div className="divide-y divide-outline-variant/15 rounded-md border border-outline-variant/25">
      {integrations.map((integration, index) => (
        // The primary provider stays open so routed command actions
        // (action=test-portfolio-connection) land on a visible form.
        <details key={integration.id} className="group" open={index === 0}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
              {integration.display_name}
            </span>
            <StatusBadge status={integration.status} />
            <span className="shrink-0 text-xs text-outline transition group-open:rotate-90">›</span>
          </summary>
          <div className="px-3 pb-3">
            <p className="text-xs leading-5 text-outline">{integration.detail}</p>
            <div className="mt-2">
              <IntegrationKeyInput
                service={integration.service}
                label={integration.credential_hint}
                fields={integration.test_fields}
                permissionScope={integration.permission_scope}
                commandGroup={commandGroup}
                commandPrimary={index === 0}
              />
            </div>
          </div>
        </details>
      ))}
    </div>
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
      : "No account holdings imported yet. Check account access, then press Import holdings.";

  return (
    <div className="rounded-md border border-outline-variant/25 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-on-surface">Import status</h3>
        <span className="text-xs text-outline">
          {snapshot.count} imported · {snapshot.skipped_count} skipped · {formatImportStatus(snapshot.status)} ·{" "}
          {formatSettingsTime(snapshot.last_imported_at ?? snapshot.last_checked_at)}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-outline">
        {statusNote} One-time import; import again for current balances.
      </p>
      {hasImportIssues ? (
        <details className="mt-2 rounded-md border border-outline-variant/25 px-3 py-1">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
            Import issues
          </summary>
          <ul className="mt-1 space-y-1 pb-2 text-xs leading-5 text-on-surface-variant">
            {snapshot.issues.map((issue) => (
              <li key={`${issue.symbol}-${issue.reason}`}>
                <span className="font-semibold text-on-surface">{issue.symbol}</span>
                {" - "}
                {issue.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function AutopilotSettingsSummary({ state }: { state: ReturnType<typeof getAutopilotState> }) {
  return (
    <div className="rounded-md border border-outline-variant/25 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-on-surface">Autopilot paper bot · {modeCopy(state.mode)}</h3>
        <Badge
          variant="outline"
          className={cn(
            "border text-xs",
            state.runtime_unavailable
              ? "border-outline-variant/40 bg-surface-dim/40 text-outline"
              : state.kill_switch
                ? "border-caution/40 bg-caution/10 text-caution"
                : "border-engine/30 bg-engine/10 text-engine",
          )}
        >
          {state.runtime_unavailable ? "Read-only" : state.kill_switch ? "Locked" : "Ready"}
        </Badge>
      </div>
      <p className="mt-1 text-xs leading-5 text-on-surface-variant">
        Daemon {state.daemon} · {state.open_positions} open position{state.open_positions === 1 ? "" : "s"} · equity{" "}
        {formatSettingsCurrency(state.equity_usd)} · kill switch {state.kill_switch ? "engaged" : "off"}
      </p>
      <p className="mt-1 text-xs leading-5 text-outline">
        {state.runtime_unavailable
          ? "The local bot store is unavailable, so controls are locked and this section is read-only."
          : "This lane is separate from Portfolio imports and connected-account snapshots. It can paper trade only when the daemon is running and the kill switch is released."}
      </p>
      <p className="mt-1 text-xs leading-5 text-outline">
        Wallet setup is server-side: set <code className="font-mono text-[11px] text-on-surface-variant">AUTOPILOT_WALLET_SECRET</code>{" "}
        for a spare wallet. The browser never asks for private keys, and live mode still requires the
        go-live gate on the Autopilot page.
      </p>
    </div>
  );
}

function SafetyLimitsSettingsCard({
  caps,
  liveExecutionPermitted,
}: {
  caps: ReturnType<typeof getAutopilotState>["caps"];
  liveExecutionPermitted: boolean;
}) {
  return (
    <div className="rounded-md border border-outline-variant/25 px-3 py-2">
      <p className="text-sm text-on-surface">
        <span className="font-semibold">Safety limits</span>
        <span className="text-on-surface-variant">
          {" "}
          · Max trade {formatSettingsCurrency(caps.max_trade_usd)} · Daily cap{" "}
          {formatSettingsCurrency(caps.daily_spend_limit_usd)} · Daily loss limit{" "}
          {formatSettingsCurrency(caps.daily_loss_limit_usd)} · Drawdown halt {caps.drawdown_halt_pct}% · Live
          movement: {liveExecutionPermitted ? "On (gate-approved)" : "Off"}
        </span>
      </p>
    </div>
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
      detail: "Master Mold has no order endpoint, cannot sign transactions, and never asks for private wallet keys.",
    },
  ];

  // Read-once boilerplate lives behind one row.
  return (
    <details id="data-privacy" className="scroll-mt-24 rounded-md border border-outline-variant/25">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-on-surface">Data privacy</span>
        <span className="text-xs text-outline">What stays local, what can leave</span>
      </summary>
      <div className="grid gap-3 border-t border-outline-variant/15 px-3 py-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-telemetry text-outline">{item.label}</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{item.detail}</p>
          </div>
        ))}
      </div>
    </details>
  );
}


function StatusBadge({ status }: { status: IntegrationStatusJson["status"] }) {
  return (
    <Badge
      className={cn(
        "border text-xs",
        status === "connected" && "border-engine/30 bg-engine/10 text-engine",
        status === "stubbed" && "border-caution/40 bg-caution/10 text-caution",
        status === "credential_gated" && "border-violet/40 bg-violet/10 text-violet",
      )}
      variant="outline"
    >
      {statusLabels[status]}
    </Badge>
  );
}

function integrationStatusLabel(integration: SettingsIntegrationStatus) {
  if (integration.status === "connected") return "Test passed";
  if (integration.status === "stubbed") return integration.service === "live_chat" ? "No chat key" : "Sample mode";
  if (integration.service === "live_chat") return "Chat key missing";
  return "Key needed";
}

function modeCopy(mode: ReturnType<typeof getAutopilotState>["mode"]) {
  if (mode === "off") return "off";
  if (mode === "paper") return "paper mode";
  if (mode === "live") return "live mode";
  return "halted";
}

function toSettingsIntegrationStatus(status: IntegrationStatusJson): SettingsIntegrationStatus {
  return {
    ...status,
    id: status.service === "llm" ? "int_live_chat" : status.id,
    service: status.service === "llm" ? "live_chat" : status.service,
  };
}

function formatSettingsCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
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

function formatStatusTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatImportStatus(value: string) {
  if (value === "Fresh snapshot") return "Fresh import";
  if (value === "Aging snapshot") return "Aging import";
  if (value === "Stale snapshot") return "Stale import";
  return value;
}

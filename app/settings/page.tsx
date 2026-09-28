import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { IntegrationKeyInput } from "@/components/integration-key-input";
import { MonarchMcpPanel } from "@/components/monarch-mcp-panel";
import { OpenOnAction } from "@/components/open-on-action";
import { NotificationTestButton } from "@/components/notification-test-button";
import { ProfileSettings } from "@/components/profile-settings";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Bell, DatabaseBackup, MessageSquare, ShieldCheck, Sun, Wallet, type LucideIcon } from "lucide-react";
import { productProvenanceLabel } from "@/lib/provenance-copy";
import { cn } from "@/lib/utils";
import {
  ensureDailyReportAutoRefresh,
  getDailyReportAutoRefreshStatus,
  getLatestDailyReport,
} from "@/src/db/daily-report";
import { getBackupStatus } from "@/src/db/backup";
import { getDataMode } from "@/src/db/engine-data";
import { getIntegrationStatuses, type IntegrationStatusJson } from "@/src/db/integrations";
import { getMonarchMcpPublicConfig } from "@/src/db/monarch-mcp";
import { getPortfolio } from "@/src/db/portfolio";
import { notifyConfigFromEnv, notifyEnabled } from "@/src/autopilot/notify";
import { getPortfolioBrainScanContext, getPortfolioBrainState } from "@/src/db/portfolio-brain";
import { getAutopilotState } from "@/src/autopilot/control";
import { Tabs } from "@/components/ui/tabs";

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
  const notifyConfig = notifyConfigFromEnv();
  const notificationsEnabled = notifyEnabled(notifyConfig);
  const notificationsStatus = notificationsEnabled
    ? [
        notifyConfig.telegram_token && notifyConfig.telegram_chat_id ? "Telegram" : null,
        notifyConfig.webhook_url ? "Zo Telegram relay" : null,
        notifyConfig.desktop ? "Desktop" : null,
      ]
        .filter(Boolean)
        .join(" + ") + " configured"
    : "Not configured";

  // System health (absorbed from /review).
  const dataMode = getDataMode();
  const backup = getBackupStatus();
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
  const healthStatus = `${publicDataMode} · report ${dailyReport ? dailyReport.run_date : "not saved"} · backup ${backup.status}`;

  const moneyValue =
    portfolio.provenance.label === "Demo data"
      ? "Sample data"
      : `${portfolio.holdings.length} holdings`;
  const moneyDetail =
    portfolio.provenance.label === "Demo data"
      ? "Import your book or add holdings to make every page personal."
      : `${portfolioSource.source_label} · as of ${formatStatusTime(portfolio.provenance.as_of)}`;

  return (
    <AppShell dataMode={publicProvenanceLabel}>
      <div className="grid w-full grid-cols-1 gap-6 [&>*]:min-w-0">
        <header>
          <p className="mm-eyebrow">Read-only. Nothing here can move money.</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">Settings</h1>
        </header>

        <section
          aria-label="Status overview"
          className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3"
        >
          <StatusCard
            icon={Wallet}
            title="Your money"
            value={moneyValue}
            detail={moneyDetail}
            tone={portfolio.provenance.label === "Demo data" ? "watch" : "ok"}
            action={
              portfolio.provenance.label === "Demo data"
                ? { href: "/portfolio?action=import-holdings", label: "Import your book" }
                : { href: "/portfolio", label: "Open Portfolio" }
            }
          />
          <StatusCard
            icon={MessageSquare}
            title="Chat"
            value={chatStatus}
            detail="Optional. Needed only for model-written answers."
            tone={chatIntegrations[0]?.status === "connected" ? "ok" : "muted"}
            action={{ href: "#chat", label: chatIntegrations[0]?.status === "connected" ? "Manage" : "Add a key" }}
          />
          <StatusCard
            icon={Sun}
            title="Daily read"
            value={dailyReport ? `Saved ${dailyReport.run_date}` : "Not saved yet"}
            detail={
              dailyReport
                ? `${dailyReport.market_rows.filter((row) => row.status === "refreshed").length} symbols priced · next ${formatStatusTime(autoRefreshStatus.next_refresh_after)}`
                : "Refresh Today to save the first report."
            }
            tone={dailyReport ? "ok" : "watch"}
            action={{ href: "/?action=run-scan#run-scan", label: "Refresh now" }}
          />
          <StatusCard
            icon={DatabaseBackup}
            title="Backups"
            value={backup.status === "fresh" ? "Fresh" : backup.status === "stale" ? "Stale" : backup.status === "missing" ? "Missing" : "Unavailable"}
            detail={backup.created_at ? `Last ${formatStatusTime(backup.created_at)}` : "Run npm run backup, then npm run backup:verify."}
            tone={backup.status === "fresh" ? "ok" : "watch"}
            action={{ href: "#health", label: "Details" }}
          />
          <StatusCard
            icon={Bell}
            title="Notifications"
            value={notificationsEnabled ? "On" : "Off"}
            detail={notificationsStatus}
            tone={notificationsEnabled ? "ok" : "muted"}
            action={{ href: "#notifications", label: notificationsEnabled ? "Test" : "Set up" }}
          />
          <StatusCard
            icon={ShieldCheck}
            title="Research labs"
            value={autopilotLive ? "Live enabled" : "Live locked"}
            detail={autopilotStatus}
            tone={autopilotLive ? "watch" : "ok"}
            action={{ href: "#autopilot", label: "Details" }}
          />
        </section>

        <Tabs
          label="Settings sections"
          items={[
            {
              id: "connections",
              label: "Accounts",
              anchors: ["investment-awareness", "portfolio-connections"],
              content: (
                <SettingsPanel id="connections" title="Connections" status={connectionsStatus}>
                  <span id="investment-awareness" aria-hidden="true" className="block scroll-mt-24" />
                  <p className="text-xs leading-5 text-outline">
                    Read-only portfolio sources. Fastest:{" "}
                    <Link href="/portfolio?action=import-holdings" className="text-violet hover:text-violet-soft">
                      import your book
                    </Link>
                    .
                  </p>
                  <div id="portfolio-connections" className="mt-3 grid scroll-mt-24 items-start gap-3 lg:grid-cols-2 [&>*]:min-w-0">
                    <MonarchMcpPanel initialState={portfolioBrain} config={monarchConfig} />
                    <div className="grid content-start gap-3">
                      <PortfolioImportStatusCard portfolio={portfolio} />
                      <ConnectionChecks integrations={portfolioIntegrations} commandGroup="portfolio" />
                    </div>
                  </div>
                </SettingsPanel>
              ),
            },
            {
              id: "chat",
              label: "Chat",
              anchors: ["ai-chat-keys"],
              content: (
                <SettingsPanel id="chat" title="Chat" status={chatStatus}>
                  <span id="ai-chat-keys" aria-hidden="true" className="block scroll-mt-24" />
                  <p className="text-xs leading-5 text-outline">
                    Optional. App commands and sample screens work without a chat key. Add a key only if you want model-written answers using visible app context.
                  </p>
                  <div className="mt-3">
                    {chatIntegrations.length > 0 ? (
                      <ConnectionChecks integrations={chatIntegrations} commandGroup="chat" />
                    ) : (
                      <p className="rounded-xl border border-outline-variant/50 px-3 py-2 text-xs leading-5 text-outline">
                        No live chat provider is configured in this build.
                      </p>
                    )}
                  </div>
                </SettingsPanel>
              ),
            },
            {
              id: "profile",
              label: "Profile",
              content: (
                <SettingsPanel id="profile" title="Profile" status="Saved in this browser">
                  <ProfileSettings />
                </SettingsPanel>
              ),
            },
            {
              id: "autopilot",
              label: "Labs & safety",
              anchors: ["web3-wallet-trading", "safety", "safety-limits", "data-privacy"],
              content: (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
                  <SettingsPanel id="autopilot" title="Research labs" status={autopilotStatus}>
                    <span id="web3-wallet-trading" aria-hidden="true" className="block scroll-mt-24" />
            <p className="mb-3 text-xs leading-5 text-outline">
              Paper research lanes, separate from your money and not evidence of profit. Open the{" "}
              <Link href="/trading" className="font-semibold text-violet hover:text-violet-soft">Web3 lab</Link> or the{" "}
              <Link href="/polymarket" className="font-semibold text-violet hover:text-violet-soft">Polymarket lab</Link>.
            </p>
                    <div className="grid gap-3">
                      <AutopilotSettingsSummary state={autopilot} />
                      <details className="rounded-xl border border-outline-variant/50 px-3 py-2">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-on-surface marker:hidden [&::-webkit-details-marker]:hidden">
                          <span>Technical details</span>
                          <span className="text-outline">Bot room and raw status</span>
                        </summary>
                        <p className="border-t border-outline-variant/40 pt-2 text-xs leading-5 text-outline">
                          Trade controls, daemon status, wallet provisioning, and go-live evidence live in{" "}
                          <Link href="/trading" className="font-semibold text-violet hover:text-violet-soft">
                            Web3 lab
                          </Link>
                          . Raw troubleshooting payload:{" "}
                          <a href="/api/autopilot" className="font-semibold text-violet hover:text-violet-soft">
                            status JSON
                          </a>
                          .
                        </p>
                      </details>
                    </div>
                  </SettingsPanel>
                  <SettingsPanel id="safety" title="Safety and privacy" status={safetyStatus}>
                    <span id="safety-limits" aria-hidden="true" className="block scroll-mt-24" />
                    <div className="grid gap-3">
                      <SafetyLimitsSettingsCard caps={autopilot.caps} liveExecutionPermitted={autopilotLive} />
                      <DataPrivacyCard />
                    </div>
                  </SettingsPanel>
                </div>
              ),
            },
            {
              id: "notifications",
              label: "Notifications",
              content: (
                <SettingsPanel id="notifications" title="Notifications" status={notificationsStatus}>
                  <p className="text-xs leading-5 text-outline">
                    Optional. The bot pushes fills, halts, the daily Analyst review, and backup failures to Telegram and/or the desktop. Configuration lives in{" "}
                    <code>.env.local</code> because the daemon reads it too — the browser can&apos;t own this key:
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-xl border border-outline-variant/50 bg-surface-lowest/70 px-3 py-2 text-xs leading-5 text-on-surface-variant">
                    {"NOTIFY_TELEGRAM_BOT_TOKEN=   # from @BotFather\nNOTIFY_TELEGRAM_CHAT_ID=     # your chat id\nNOTIFY_DESKTOP=false         # macOS notification center"}
                  </pre>
                  <p className="mt-2 text-xs leading-5 text-outline">
                    Restart <code>npm run up</code> after editing, then prove the pipe:
                  </p>
                  <div className="mt-2">
                    <NotificationTestButton />
                  </div>
                </SettingsPanel>
              ),
            },
            {
              id: "health",
              label: "System",
              content: (
                <SettingsPanel id="health" title="System health" status={healthStatus}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs leading-5 text-outline">Data mode, sources, and report freshness.</p>
                    <a href="/api/health" className="text-xs font-semibold text-violet hover:text-violet-soft">
                      Health JSON
                    </a>
                  </div>
                  <dl className="mt-3 grid divide-y divide-outline-variant/30 rounded-xl border border-outline-variant/50 md:grid-cols-2 md:divide-y-0">
                    <HealthRow label="Data mode" value={publicDataMode} />
                    <HealthRow
                      label="Portfolio source"
                      value={portfolioSource.source_label === "Sample fallback" ? "Sample data" : portfolioSource.source_label}
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
                    <HealthRow
                      label="Backup"
                      value={backup.status === "fresh" ? "Fresh" : backup.status === "stale" ? "Stale" : backup.status === "missing" ? "Missing" : "Unavailable"}
                      detail={backup.created_at
                        ? `${backup.files.length} stores · created ${formatStatusTime(backup.created_at)} · verify recovery with npm run backup:verify`
                        : `${backup.detail} Run npm run backup, then npm run backup:verify.`}
                    />
                    <HealthRow label="Access" value="This computer only" detail="Other devices are blocked unless you configure an operator or read-only viewer login." />
                    <HealthRow
                      label="Live trading"
                      value={autopilotLive ? "Enabled" : "Locked"}
                      detail={autopilotLive
                        ? "Autopilot reports live mode. Confirm the wallet, caps, and real lane controls before relying on this state."
                        : "Neither lab can place real trades. Web3 needs every go-live check; Polymarket live orders are not built."}
                    />
                  </dl>
                </SettingsPanel>
              ),
            },
          ]}
        />
      </div>
    </AppShell>
  );
}

function SettingsPanel({
  id,
  title,
  status,
  className,
  children,
}: {
  id: string;
  title: string;
  status?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 id={`${id}-title`} className="font-display text-base font-semibold text-on-surface">
          {title}
        </h2>
        {status ? <span className="min-w-0 truncate text-xs text-outline">{status}</span> : null}
      </div>
      <div className="p-5 pt-3">{children}</div>
    </Panel>
  );
}

function StatusCard({
  icon: Icon,
  title,
  value,
  detail,
  tone,
  action,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  detail: string;
  tone: "ok" | "watch" | "muted";
  action: { href: string; label: string };
}) {
  return (
    <div className="mm-panel flex min-w-0 items-start gap-3 p-3 sm:p-4">
      <span
        className={cn(
          "hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex",
          tone === "ok" ? "bg-engine/10 text-engine" : tone === "watch" ? "bg-caution/10 text-caution" : "bg-surface-high/70 text-outline",
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      {/* The action sits under the text so the value keeps the full width. */}
      <div className="min-w-0 flex-1">
        <p className="mm-eyebrow">{title}</p>
        <p className="mt-0.5 truncate font-display text-base font-semibold text-on-surface">{value}</p>
        <p className="mt-0.5 hidden text-xs leading-5 text-outline line-clamp-2 sm:block">{detail}</p>
        <Link
          href={action.href}
          className="mt-2 inline-flex min-h-10 max-w-full items-center truncate rounded-xl border border-outline-variant/60 px-3 text-xs font-semibold text-on-surface transition hover:border-violet/50 hover:text-violet sm:min-h-9"
        >
          {action.label}
        </Link>
      </div>
    </div>
  );
}

function HealthRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="px-4 py-3">
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
    <div className="divide-y divide-outline-variant/15 rounded-xl border border-outline-variant/50">
      <OpenOnAction />
      {integrations.map((integration, index) => (
        // Collapsed by default; OpenOnAction opens the primary provider when a
        // routed command (action=test-portfolio-connection) needs its form.
        <details key={integration.id} className="group" data-open-on-action={index === 0 ? "" : undefined}>
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
  // Nothing imported and nothing wrong: the card would only repeat the empty state.
  if (!hasImportedHoldings && !hasImportIssues) return null;

  return (
    <div className="rounded-xl border border-outline-variant/50 px-3 py-2">
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
        <details className="mt-2 rounded-xl border border-outline-variant/50 px-3 py-1">
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
    <div className="rounded-xl border border-outline-variant/50 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-on-surface">Web3 paper bot · {modeCopy(state.mode)}</h3>
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
          {state.runtime_unavailable ? "Read-only" : state.kill_switch ? "Halted" : "Not halted"}
        </Badge>
      </div>
      <p className="mt-1 text-xs leading-5 text-on-surface-variant">
        Bot process {state.daemon} · {state.open_positions} open position{state.open_positions === 1 ? "" : "s"} · paper balance{" "}
        {formatSettingsCurrency(state.equity_usd)} · kill switch {state.kill_switch ? "on" : "off"}
      </p>
      <p className="mt-1 text-xs leading-5 text-outline">
        {state.runtime_unavailable
          ? "The local bot store is unavailable, so controls are locked and this section is read-only."
          : "Separate from your Portfolio. It paper trades only while the bot process runs (npm run autopilot) and the kill switch is off."}
      </p>
      <p className="mt-1 text-xs leading-5 text-outline">
        Wallet setup is server-side: set <code className="font-mono text-[11px] text-on-surface-variant">AUTOPILOT_WALLET_SECRET</code>{" "}
        for a spare wallet. The browser never asks for private keys, and live trading also needs every
        go-live check in the Web3 lab to pass.
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
    <div className="rounded-xl border border-outline-variant/50 px-3 py-2">
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
    { label: "Stays on this device", detail: "Preferences, and keys you type (this tab only, never exported)." },
    { label: "Goes to your Master Mold server", detail: "Holdings, transactions, journal, tests and imports. Nothing else sees them." },
    { label: "Can leave", detail: "Only an action you choose can contact an outside service: an account test or import, or chat (live chat sends the question plus visible app context to the selected chat service)." },
    { label: "Never", detail: "No orders and no wallet keys from here. The separate Web3 bot signs only with a server wallet, after its gates pass." },
  ];

  return (
    <div id="data-privacy" className="scroll-mt-24 rounded-xl border border-outline-variant/50">
      <p className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
        <span className="text-sm font-semibold text-on-surface">Data privacy</span>
        
      </p>
      <div className="grid gap-3 border-t border-outline-variant/40 px-3 py-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <p className="mm-eyebrow">{item.label}</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{item.detail}</p>
          </div>
        ))}
      </div>
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
        status === "credential_gated" && "border-violet/40 bg-violet/10 text-violet",
      )}
      variant="outline"
    >
      {statusLabels[status]}
    </Badge>
  );
}

function integrationStatusLabel(integration: SettingsIntegrationStatus) {
  // A server key being present is not the same as a passed test.
  if (integration.status === "connected") return integration.service === "live_chat" ? "Server key set" : "Test passed";
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

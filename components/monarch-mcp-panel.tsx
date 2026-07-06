"use client";

import { useState } from "react";
import { Loader2, PlugZap, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { MonarchMcpConfigPublic, MonarchMcpConnectionStatus } from "@/src/db/monarch-mcp";
import type { PortfolioBrainState } from "@/src/db/portfolio-brain";

type MonarchMcpPanelProps = {
  initialState: PortfolioBrainState;
  config: MonarchMcpConfigPublic;
};

type TestResult = {
  ok: boolean;
  status: MonarchMcpConnectionStatus;
  message: string;
  tools?: string[];
  required_tools?: string[];
  required_tools_ready?: boolean;
  error_code?: string;
  error?: string;
};

type SyncResult = {
  ok: boolean;
  status: MonarchMcpConnectionStatus;
  message: string;
  snapshot?: PortfolioBrainState["latest_snapshot"];
  error?: string;
};

export function MonarchMcpPanel({ initialState, config }: MonarchMcpPanelProps) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [testState, setTestState] = useState<"idle" | "running" | "passed" | "failed">("idle");
  const [syncState, setSyncState] = useState<"idle" | "running" | "passed" | "failed">("idle");
  const [message, setMessage] = useState(state.summary.detail);
  const [tools, setTools] = useState<string[]>([]);
  const [requiredTools, setRequiredTools] = useState<string[]>(config.snapshot_tool ? [config.snapshot_tool] : [config.accounts_tool, config.holdings_tool]);

  async function testConnection() {
    markBrowserAction("test-monarch-mcp");
    setTestState("running");
    setMessage("Testing Monarch MCP...");
    setTools([]);
    try {
      const response = await fetch("/api/portfolio-brain/monarch/test", { method: "POST" });
      const result = (await response.json().catch(() => null)) as TestResult | null;
      if (result) {
        setMessage(result.message || result.error || "Monarch MCP test returned a response.");
        setTools(result.tools ?? []);
        setRequiredTools(result.required_tools ?? requiredTools);
      }
      if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || "Monarch MCP test failed.");
      setTestState("passed");
    } catch (caught) {
      setTestState("failed");
      setMessage(caught instanceof Error ? caught.message : "Monarch MCP test failed.");
    }
  }

  async function syncNow() {
    markBrowserAction("sync-monarch-mcp");
    setSyncState("running");
    setMessage("Syncing Monarch portfolio snapshot...");
    try {
      const response = await fetch("/api/portfolio-brain/monarch/sync", { method: "POST" });
      const result = (await response.json().catch(() => null)) as SyncResult | null;
      if (!response.ok || !result?.ok || !result.snapshot) throw new Error(result?.message || result?.error || "Monarch sync failed.");
      setSyncState("passed");
      setMessage(result.message);
      setState({
        ...state,
        status: result.snapshot.status,
        latest_snapshot: result.snapshot,
        freshness: {
          label: "Synced this hour",
          is_stale: false,
          stale_after_hours: 24,
        },
        summary: {
          headline: `${result.snapshot.holdings.length} Monarch holdings saved`,
          detail: `Using a Monarch MCP snapshot from ${formatReadableTime(result.snapshot.synced_at)}.`,
          accounts_count: result.snapshot.accounts.length,
          holdings_count: result.snapshot.holdings.length,
          total_value: result.snapshot.total_value,
        },
        change_summary: state.change_summary,
      });
      router.refresh();
    } catch (caught) {
      setSyncState("failed");
      setMessage(caught instanceof Error ? caught.message : "Monarch sync failed.");
    }
  }

  const latest = state.latest_snapshot;
  const checklist = buildChecklist({
    config,
    latest,
    state,
    testState,
    syncState,
    tools,
  });
  const busy = testState === "running" || syncState === "running";
  const actionRan = testState !== "idle" || syncState !== "idle";
  const statusTone: DotTone = latest
    ? state.status === "ready"
      ? "pass"
      : state.status === "partial"
        ? "watch"
        : "idle"
    : "idle";
  const statusLine = [
    transportLabel(config),
    latest ? `synced ${formatReadableTime(latest.synced_at)}` : "never synced",
    latest ? `${latest.holdings.length} holding${latest.holdings.length === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-labelledby="monarch-mcp-title" className="rounded-md border border-outline-variant/25">
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Dot tone={statusTone} />
          <h3 id="monarch-mcp-title" className="shrink-0 text-sm font-semibold text-on-surface">
            Monarch MCP
          </h3>
          <p className="min-w-0 truncate text-sm text-on-surface-variant">· {statusLine}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            onClick={testConnection}
            disabled={busy}
            className="min-h-11 bg-violet px-3 text-xs text-void hover:bg-violet/90 sm:min-h-8"
            data-rds-action="test-monarch-mcp"
            data-action-state={testState}
          >
            {testState === "running" ? <Loader2 aria-hidden="true" className="animate-spin" /> : <PlugZap aria-hidden="true" />}
            Test MCP connection
          </Button>
          <Button
            type="button"
            onClick={syncNow}
            disabled={busy}
            variant="outline"
            className="min-h-11 border-outline-variant/50 bg-transparent px-3 text-xs text-on-surface hover:bg-surface-high/70 sm:min-h-8"
            data-rds-action="sync-monarch-mcp"
            data-action-state={syncState}
          >
            {syncState === "running" ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            Sync Monarch now
          </Button>
        </div>
      </div>

      {actionRan ? (
        <p className="border-t border-outline-variant/15 px-3 py-2 text-sm leading-6 text-on-surface-variant">{message}</p>
      ) : null}
      <p className="sr-only" aria-live="polite">{message}</p>

      <details className="border-t border-outline-variant/15 px-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-on-surface">
          Connection details
        </summary>
        <div className="grid gap-3 pb-3">
          <p className="text-sm leading-6 text-on-surface-variant">
            Connect Monarch through MCP, test read-only access, then save one holdings snapshot into Master Mold's portfolio brain.
          </p>
          <dl className="divide-y divide-outline-variant/15 rounded-md border border-outline-variant/25">
            <DetailRow label="Transport" value={transportLabel(config)} />
            <DetailRow label="Last synced" value={formatReadableTime(latest?.synced_at ?? null)} />
            <DetailRow label="Accounts" value={String(latest?.accounts.length ?? 0)} />
            <DetailRow label="Holdings" value={String(latest?.holdings.length ?? 0)} />
            {(latest?.facts ?? []).slice(0, 3).map((fact) => (
              <DetailRow key={fact.id} label={fact.label} value={fact.value} detail={fact.detail} />
            ))}
          </dl>
          <ul className="divide-y divide-outline-variant/15 rounded-md border border-outline-variant/25">
            {checklist.map((item) => (
              <ChecklistRow key={item.id} {...item} />
            ))}
          </ul>
          <p className="text-xs leading-5 text-outline">
            Scope is read-only snapshot access. Monarch MCP is beta and OAuth-based; Monarch's connector may expose read/write scopes and broad account visibility to the MCP server, so Master Mold requests read-only access only. It saves only normalized accounts, holdings, sync time, skipped rows, and summary facts. It cannot place Robinhood trades, change Monarch data, sign transactions, or move funds.
          </p>
          <div className="text-xs leading-5 text-outline">
            <p className="text-sm leading-6 text-on-surface-variant">{message}</p>
            {latest ? (
              <p className="mt-1">
                Source hash {latest.source_hash.slice(0, 12)} · {latest.receipt.skipped_count} skipped row{latest.receipt.skipped_count === 1 ? "" : "s"} · stale after {state.freshness.stale_after_hours}h
              </p>
            ) : (
              <p className="mt-1">
                Required env: `MONARCH_MCP_COMMAND` plus optional args, or `MONARCH_MCP_URL`. Tool names default to `get_accounts` and `get_holdings`; configured required tools: {requiredTools.join(", ")}.
              </p>
            )}
            {tools.length > 0 ? (
              <p className="mt-1">
                Tools seen: {tools.slice(0, 8).join(", ")}{tools.length > 8 ? `, +${tools.length - 8} more` : ""}
              </p>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  );
}

type DotTone = "pass" | "watch" | "fail" | "idle";

function Dot({ tone }: { tone: DotTone }) {
  return (
    <span
      aria-hidden="true"
      className={
        tone === "pass"
          ? "size-2 shrink-0 rounded-full bg-engine"
          : tone === "watch"
            ? "size-2 shrink-0 rounded-full bg-caution"
            : tone === "fail"
              ? "size-2 shrink-0 rounded-full bg-critical"
              : "size-2 shrink-0 rounded-full bg-outline"
      }
    />
  );
}

function DetailRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <dt className="text-sm text-on-surface-variant">{label}</dt>
        <dd className="min-w-0 break-words text-right text-sm font-semibold text-on-surface">{value}</dd>
      </div>
      {detail ? <p className="mt-0.5 text-xs leading-5 text-outline">{detail}</p> : null}
    </div>
  );
}

function ChecklistRow({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: "pass" | "watch" | "fail";
}) {
  return (
    <li className="flex items-start gap-2 px-3 py-2">
      <span className="mt-1.5 flex shrink-0">
        <Dot tone={state} />
      </span>
      <p className="min-w-0 text-sm leading-5 text-on-surface">
        <span className="sr-only">{state === "pass" ? "Ready" : state === "watch" ? "Check" : "Blocked"}: </span>
        <span className="font-semibold">{label}</span>
        <span className="text-xs leading-5 text-outline"> · {detail}</span>
      </p>
    </li>
  );
}

function buildChecklist({
  config,
  latest,
  state,
  testState,
  syncState,
  tools,
}: {
  config: MonarchMcpConfigPublic;
  latest: PortfolioBrainState["latest_snapshot"];
  state: PortfolioBrainState;
  testState: "idle" | "running" | "passed" | "failed";
  syncState: "idle" | "running" | "passed" | "failed";
  tools: string[];
}) {
  const transportReady = config.fixture_configured || config.url_configured || config.command_configured;
  const snapshotToolReady = Boolean(config.snapshot_tool && tools.includes(config.snapshot_tool));
  const accountsToolReady = config.fixture_configured || snapshotToolReady || tools.includes(config.accounts_tool);
  const holdingsToolReady = config.fixture_configured || snapshotToolReady || tools.includes(config.holdings_tool);
  const toolState = (ready: boolean) => tools.length > 0 || config.fixture_configured
    ? ready ? "pass" as const : "fail" as const
    : "watch" as const;
  const toolDetail = (kind: "accounts" | "holdings", toolName: string) => {
    if (config.fixture_configured) return `Fixture mode covers ${kind} rows without live OAuth.`;
    if (snapshotToolReady) return `Covered by snapshot tool ${config.snapshot_tool}.`;
    if (tools.length > 0 && tools.includes(toolName)) return `Found ${toolName}.`;
    if (tools.length > 0) return `Missing ${toolName}.`;
    return `Required tool: ${toolName}. Run Test MCP connection after OAuth is complete.`;
  };
  const oauthState = config.fixture_configured || testState === "passed"
    ? "pass" as const
    : testState === "failed"
      ? "fail" as const
      : "watch" as const;
  const oauthDetail = config.fixture_configured
    ? "Fixture mode bypasses live Monarch OAuth for local verification."
    : testState === "passed"
      ? "OAuth/server authorization looks usable in this browser session."
      : testState === "failed"
        ? "Connection failed. Complete Monarch OAuth or fix server access, then test again."
        : testState === "running"
          ? "Testing Monarch MCP OAuth/server access now."
          : transportReady
            ? "Complete Monarch OAuth in the MCP server, then test here."
            : "Configure the MCP server before testing OAuth.";
  return [
    {
      id: "transport",
      label: "MCP server",
      detail: transportReady
        ? `${transportLabel(config)} configured. Test it after OAuth changes.`
        : "Add MONARCH_MCP_COMMAND or MONARCH_MCP_URL, then test the connection.",
      state: transportReady ? "pass" as const : "fail" as const,
    },
    {
      id: "oauth",
      label: "OAuth / connection",
      detail: oauthDetail,
      state: oauthState,
    },
    {
      id: "scope",
      label: "Read-only scope",
      detail: config.requested_scope === "read" && config.permission_scope === "read_only_snapshot"
        ? "Monarch MCP can expose read/write scopes; Master Mold requests read-only snapshot access and never calls write or trading tools."
        : "Scope should stay read-only before sync is allowed.",
      state: config.requested_scope === "read" ? "pass" as const : "fail" as const,
    },
    {
      id: "accounts-tool",
      label: "Accounts tool",
      detail: toolDetail("accounts", config.accounts_tool),
      state: toolState(accountsToolReady),
    },
    {
      id: "holdings-tool",
      label: "Holdings tool",
      detail: toolDetail("holdings", config.holdings_tool),
      state: toolState(holdingsToolReady),
    },
    {
      id: "test-state",
      label: "Last check",
      detail: testState === "passed"
        ? "Connection test passed in this browser session."
        : testState === "failed"
          ? "Connection test failed. Fix OAuth/server configuration, then test again."
          : testState === "running"
            ? "Testing Monarch MCP now."
            : "Not tested in this browser session.",
      state: testState === "passed" ? "pass" as const : testState === "failed" ? "fail" as const : "watch" as const,
    },
    {
      id: "sync-state",
      label: "Last sync",
      detail: syncState === "passed"
        ? "Sync saved the latest snapshot in this browser session."
        : syncState === "failed"
          ? "Sync failed. No new portfolio brain snapshot was saved."
          : syncState === "running"
            ? "Syncing Monarch snapshot now."
            : latest
              ? `${state.freshness.label}; ${latest.holdings.length} holdings across ${latest.accounts.length} accounts.`
              : "No Monarch holdings are saved yet. Sync only after the test is clean.",
      state: syncState === "passed" || latest
        ? latest && state.freshness.is_stale ? "watch" as const : "pass" as const
        : syncState === "failed" ? "fail" as const : "watch" as const,
    },
  ];
}

function transportLabel(config: MonarchMcpConfigPublic) {
  if (config.fixture_configured) return "Fixture";
  if (config.url_configured) return "HTTP MCP";
  if (config.command_configured) return "Local command";
  return "Not configured";
}

function formatReadableTime(value: string | null) {
  if (!value) return "not synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function markBrowserAction(token: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("rds_action", token);
  url.searchParams.set("rds_seq", String(Date.now()));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  document.documentElement.dataset.rdsAction = token;
}

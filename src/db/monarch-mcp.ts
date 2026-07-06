import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  loadMonarchFixtureSnapshot,
  saveMonarchPortfolioSnapshot,
  type MonarchRawPayload,
  type PortfolioBrainSnapshot,
} from "./portfolio-brain";

export type MonarchMcpConnectionStatus =
  | "not_configured"
  | "configured"
  | "connected"
  | "sync_ready"
  | "failed";

export type MonarchMcpConfigPublic = {
  transport: "stdio" | "http" | "fixture" | "missing";
  requested_scope: "read";
  permission_scope: "read_only_snapshot";
  command_configured: boolean;
  url_configured: boolean;
  fixture_configured: boolean;
  accounts_tool: string;
  holdings_tool: string;
  snapshot_tool: string | null;
};

export type MonarchMcpTestResult = {
  ok: boolean;
  status: MonarchMcpConnectionStatus;
  message: string;
  config: MonarchMcpConfigPublic;
  tools: string[];
  required_tools: string[];
  required_tools_ready: boolean;
  error_code?: MonarchMcpErrorCode;
  error?: string;
};

export type MonarchMcpSyncResult = {
  ok: boolean;
  status: MonarchMcpConnectionStatus;
  message: string;
  config: MonarchMcpConfigPublic;
  snapshot?: PortfolioBrainSnapshot;
  error_code?: MonarchMcpErrorCode;
  error?: string;
};

export type MonarchMcpErrorCode =
  | "not_configured"
  | "auth_or_connection_failed"
  | "missing_tools"
  | "empty_holdings"
  | "partial_snapshot"
  | "sync_failed";

type MonarchMcpConfig = MonarchMcpConfigPublic & {
  command: string | null;
  args: string[];
  url: string | null;
  fixture_path: string | null;
};

type ConnectedClient = {
  client: Client;
  close: () => Promise<void>;
};

const DEFAULT_ACCOUNTS_TOOL = "get_accounts";
const DEFAULT_HOLDINGS_TOOL = "get_holdings";

export function getMonarchMcpPublicConfig(): MonarchMcpConfigPublic {
  const config = getMonarchMcpConfig();
  return publicConfig(config);
}

export async function testMonarchMcpConnection(): Promise<MonarchMcpTestResult> {
  const config = getMonarchMcpConfig();
  if (config.fixture_path) {
    try {
      const payload = loadMonarchFixtureSnapshot(config.fixture_path);
      return {
        ok: true,
        status: "connected",
        message: `Monarch fixture is readable with ${Array.isArray(payload.holdings) ? payload.holdings.length : 0} holding rows.`,
        config: publicConfig(config),
        tools: ["fixture"],
        required_tools: requiredTools(config),
        required_tools_ready: true,
      };
    } catch (caught) {
      return failedResult(config, "Monarch fixture could not be read.", caught);
    }
  }

  if (!config.command && !config.url) {
    return {
      ok: false,
      status: "not_configured",
      message: "Monarch MCP is not configured. Add MONARCH_MCP_COMMAND or MONARCH_MCP_URL, then test again.",
      config: publicConfig(config),
      tools: [],
      required_tools: requiredTools(config),
      required_tools_ready: false,
      error_code: "not_configured",
    };
  }

  let connected: ConnectedClient | null = null;
  try {
    connected = await connectMonarchMcp(config);
    const listed = await connected.client.listTools(undefined, { timeout: 8_000 });
    const tools = listed.tools.map((tool) => tool.name).sort();
    const ready = Boolean(config.snapshot_tool && tools.includes(config.snapshot_tool)) ||
      (tools.includes(config.accounts_tool) && tools.includes(config.holdings_tool));
    return {
      ok: ready,
      status: ready ? "sync_ready" : "connected",
      message: ready
        ? "Monarch MCP is reachable and exposes the tools needed for a manual sync."
        : `Monarch MCP is reachable, but Master Mold needs ${config.snapshot_tool ?? `${config.accounts_tool} and ${config.holdings_tool}`}.`,
      config: publicConfig(config),
      tools,
      required_tools: requiredTools(config),
      required_tools_ready: ready,
      error_code: ready ? undefined : "missing_tools",
    };
  } catch (caught) {
    return failedResult(config, "Monarch MCP connection failed.", caught);
  } finally {
    await connected?.close().catch(() => {});
  }
}

export async function syncMonarchMcpPortfolio(): Promise<MonarchMcpSyncResult> {
  const config = getMonarchMcpConfig();
  if (config.fixture_path) {
    try {
      const snapshot = saveMonarchPortfolioSnapshot(loadMonarchFixtureSnapshot(config.fixture_path));
      return {
        ok: true,
        status: "sync_ready",
        message: snapshot.status === "partial"
          ? `${snapshot.receipt.message} Some rows were skipped; review the import issues before relying on totals.`
          : snapshot.receipt.message,
        config: publicConfig(config),
        snapshot,
        error_code: snapshot.status === "partial" ? "partial_snapshot" : undefined,
      };
    } catch (caught) {
      return failedSync(config, "Monarch fixture sync failed.", caught);
    }
  }

  if (!config.command && !config.url) {
    return {
      ok: false,
      status: "not_configured",
      message: "Monarch MCP is not configured. Add MONARCH_MCP_COMMAND or MONARCH_MCP_URL before syncing.",
      config: publicConfig(config),
      error_code: "not_configured",
    };
  }

  let connected: ConnectedClient | null = null;
  try {
    connected = await connectMonarchMcp(config);
    const payload = await readPortfolioPayload(connected.client, config);
    const snapshot = saveMonarchPortfolioSnapshot(payload);
    return {
      ok: snapshot.holdings.length > 0,
      status: snapshot.holdings.length > 0 ? "sync_ready" : "failed",
      message: snapshot.holdings.length > 0
        ? snapshot.status === "partial"
          ? `${snapshot.receipt.message} Some rows were skipped; review the import issues before relying on totals.`
          : snapshot.receipt.message
        : "Monarch MCP returned no usable holding rows.",
      config: publicConfig(config),
      snapshot,
      error_code: snapshot.holdings.length === 0 ? "empty_holdings" : snapshot.status === "partial" ? "partial_snapshot" : undefined,
    };
  } catch (caught) {
    return failedSync(config, "Monarch MCP sync failed.", caught);
  } finally {
    await connected?.close().catch(() => {});
  }
}

async function connectMonarchMcp(config: MonarchMcpConfig): Promise<ConnectedClient> {
  const client = new Client({ name: "master-mold", version: "0.1.0" });
  const transport = config.url
    ? new StreamableHTTPClientTransport(new URL(config.url))
    : new StdioClientTransport({
        command: config.command!,
        args: config.args,
        stderr: "pipe",
      });
  await client.connect(transport, { timeout: 10_000 });
  return {
    client,
    close: async () => {
      await transport.close();
    },
  };
}

async function readPortfolioPayload(client: Client, config: MonarchMcpConfig): Promise<MonarchRawPayload> {
  if (config.snapshot_tool) {
    const result = await client.callTool({ name: config.snapshot_tool, arguments: {} }, undefined, { timeout: 20_000 });
    return extractPayload(result);
  }

  const [accounts, holdings] = await Promise.all([
    client.callTool({ name: config.accounts_tool, arguments: {} }, undefined, { timeout: 20_000 }),
    client.callTool({ name: config.holdings_tool, arguments: {} }, undefined, { timeout: 20_000 }),
  ]);
  return {
    accounts: extractArrayPayload(accounts),
    holdings: extractArrayPayload(holdings),
    synced_at: new Date().toISOString(),
  };
}

function extractPayload(result: unknown): MonarchRawPayload {
  const object = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const structured = object.structuredContent;
  if (structured && typeof structured === "object") return structured as MonarchRawPayload;
  const parsed = parseFirstTextContent(object.content);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as MonarchRawPayload;
  if (Array.isArray(parsed)) return { holdings: parsed };
  return {};
}

function extractArrayPayload(result: unknown): unknown[] {
  const payload = extractPayload(result);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.accounts)) return payload.accounts;
  if (Array.isArray(payload.holdings)) return payload.holdings;
  if (Array.isArray((payload as Record<string, unknown>).data)) return (payload as Record<string, unknown>).data as unknown[];
  return [];
}

function parseFirstTextContent(value: unknown): unknown {
  const object = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const content = Array.isArray(object?.content) ? object.content : [];
  for (const item of content) {
    const entry = item && typeof item === "object" ? item as Record<string, unknown> : null;
    if (entry?.type !== "text" || typeof entry.text !== "string") continue;
    try {
      return JSON.parse(entry.text);
    } catch {
      continue;
    }
  }
  return null;
}

function getMonarchMcpConfig(): MonarchMcpConfig {
  const command = cleanEnv(process.env.MONARCH_MCP_COMMAND);
  const url = cleanEnv(process.env.MONARCH_MCP_URL);
  const fixturePath = cleanEnv(process.env.MONARCH_MCP_FIXTURE_PATH);
  return {
    transport: fixturePath ? "fixture" : url ? "http" : command ? "stdio" : "missing",
    requested_scope: "read",
    permission_scope: "read_only_snapshot",
    command_configured: Boolean(command),
    url_configured: Boolean(url),
    fixture_configured: Boolean(fixturePath),
    command,
    args: parseArgs(process.env.MONARCH_MCP_ARGS),
    url,
    fixture_path: fixturePath,
    accounts_tool: cleanEnv(process.env.MONARCH_MCP_ACCOUNTS_TOOL) ?? DEFAULT_ACCOUNTS_TOOL,
    holdings_tool: cleanEnv(process.env.MONARCH_MCP_HOLDINGS_TOOL) ?? DEFAULT_HOLDINGS_TOOL,
    snapshot_tool: cleanEnv(process.env.MONARCH_MCP_SNAPSHOT_TOOL),
  };
}

function publicConfig(config: MonarchMcpConfig): MonarchMcpConfigPublic {
  return {
    transport: config.transport,
    requested_scope: "read",
    permission_scope: "read_only_snapshot",
    command_configured: config.command_configured,
    url_configured: config.url_configured,
    fixture_configured: config.fixture_configured,
    accounts_tool: config.accounts_tool,
    holdings_tool: config.holdings_tool,
    snapshot_tool: config.snapshot_tool,
  };
}

function requiredTools(config: MonarchMcpConfig) {
  return config.snapshot_tool ? [config.snapshot_tool] : [config.accounts_tool, config.holdings_tool];
}

function parseArgs(value: string | undefined): string[] {
  const trimmed = cleanEnv(value);
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
  } catch {
    // fall through to shell-like whitespace split for simple local configs
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

function cleanEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function failedResult(config: MonarchMcpConfig, message: string, caught: unknown): MonarchMcpTestResult {
  const detail = caught instanceof Error ? caught.message : "Unknown MCP error.";
  return {
    ok: false,
    status: "failed",
    message: `${message} ${safeErrorDetail(detail)}`,
    config: publicConfig(config),
    tools: [],
    required_tools: requiredTools(config),
    required_tools_ready: false,
    error_code: "auth_or_connection_failed",
    error: safeErrorDetail(detail),
  };
}

function failedSync(config: MonarchMcpConfig, message: string, caught: unknown): MonarchMcpSyncResult {
  const detail = caught instanceof Error ? caught.message : "Unknown MCP error.";
  return {
    ok: false,
    status: "failed",
    message: `${message} ${safeErrorDetail(detail)}`,
    config: publicConfig(config),
    error_code: "sync_failed",
    error: safeErrorDetail(detail),
  };
}

function safeErrorDetail(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/token[=:]\s*[^,\s]+/gi, "token=[redacted]")
    .replace(/secret[=:]\s*[^,\s]+/gi, "secret=[redacted]")
    .slice(0, 240);
}

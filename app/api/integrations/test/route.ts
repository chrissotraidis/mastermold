import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

type IntegrationService = "coinbase" | "robinhood" | "onchain_wallet" | "llm";
type PublicIntegrationService = Exclude<IntegrationService, "llm"> | "live_chat";
type ModelProvider = "openrouter" | "openai" | "anthropic";

type TestResult = {
  ok: boolean;
  service: PublicIntegrationService;
  message: string;
  checked_at: string;
  evidence?: string;
  docs_url?: string;
};

// A connection test must answer fast or fail fast — without a bound, one
// hung provider socket leaves the Settings button spinning indefinitely.
const TEST_TIMEOUT_MS = 15_000;

const docsByService: Record<IntegrationService, string> = {
  coinbase: "https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/guides/oauth-access",
  robinhood: "https://docs.snaptrade.com/docs/account-data",
  onchain_wallet: "https://developers.zerion.io/authentication",
  llm: "https://openrouter.ai/docs/api-reference/chat-completion",
};

export async function POST(request: Request): Promise<NextResponse<TestResult | { error: string }>> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const service = text(body?.service) as IntegrationService;

  if (!["coinbase", "robinhood", "onchain_wallet", "llm"].includes(service)) {
    return NextResponse.json({ error: "Choose a supported integration to test." }, { status: 422 });
  }

  try {
    const result =
      service === "coinbase"
        ? await testCoinbase(body)
        : service === "robinhood"
          ? await testSnapTrade(body)
          : service === "onchain_wallet"
            ? await testZerion(body)
            : await testModel(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (caught) {
    return NextResponse.json(
      {
        ok: false,
        service: publicService(service),
        message: caught instanceof Error ? caught.message : "Connection test failed.",
        checked_at: new Date().toISOString(),
        docs_url: docsByService[service],
      },
      { status: 422 },
    );
  }
}

async function testCoinbase(body: Record<string, unknown> | null): Promise<TestResult> {
  const apiKey = required(body, "api_key", "Paste a Coinbase accounts JWT first.");
  const response = await fetch("https://api.cdp.coinbase.com/platform/v2/accounts?pageSize=1", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });

  if (!response.ok) return providerFailure("coinbase", response, "Coinbase rejected the read-only account test.");
  const json = (await response.json().catch(() => ({}))) as { accounts?: unknown[] };
  return ok("coinbase", "Coinbase read-only account test passed.", `${json.accounts?.length ?? 0} accounts returned. Import can copy balances into Portfolio.`);
}

async function testSnapTrade(body: Record<string, unknown> | null): Promise<TestResult> {
  const clientId = required(body, "client_id", "Enter the SnapTrade clientId.");
  const consumerKey = required(body, "consumer_key", "Enter the SnapTrade consumerKey.");
  const userId = required(body, "user_id", "Enter the SnapTrade userId.");
  const userSecret = required(body, "user_secret", "Enter the SnapTrade userSecret.");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = "/api/v1/authorizations";
  const query = new URLSearchParams({ clientId, timestamp, userId, userSecret }).toString();
  const signature = createConnectionListSignature({ content: null, path, query }, consumerKey);
  const response = await fetch(`https://api.snaptrade.com${path}?${query}`, {
    headers: {
      Signature: signature,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });

  if (!response.ok) return providerFailure("robinhood", response, "SnapTrade rejected the connection list test.");
  const json = (await response.json().catch(() => [])) as unknown[];
  return ok("robinhood", "SnapTrade brokerage connection list test passed.", summarizeSnapTradeConnections(json));
}

async function testZerion(body: Record<string, unknown> | null): Promise<TestResult> {
  const apiKey = required(body, "api_key", "Enter a Zerion API key.");
  const walletAddress = required(body, "wallet_address", "Enter a wallet address.");
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const response = await fetch(`https://api.zerion.io/v1/wallets/${encodeURIComponent(walletAddress)}/portfolio`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });

  if (!response.ok) return providerFailure("onchain_wallet", response, "Zerion rejected the wallet portfolio test.");
  const json = (await response.json().catch(() => ({}))) as { data?: { id?: string; type?: string } };
  return ok("onchain_wallet", "Zerion wallet portfolio test passed.", `${json.data?.type ?? "portfolio"} ${json.data?.id ?? "returned"}.`);
}

async function testModel(body: Record<string, unknown> | null): Promise<TestResult> {
  const provider = (text(body?.provider) || "openrouter") as ModelProvider;
  if (!["openrouter", "openai", "anthropic"].includes(provider)) {
    throw new Error("Choose OpenRouter, OpenAI, or Anthropic.");
  }
  const apiKey = text(body?.api_key) || envKey(provider);
  if (!apiKey) throw new Error(`No ${providerLabel(provider)} key was provided or found in the server environment.`);
  const model = text(body?.model) || defaultModel(provider);
  const result =
    provider === "anthropic"
      ? await testAnthropic(apiKey, model)
      : provider === "openai"
        ? await testOpenAI(apiKey, model)
        : await testOpenRouter(apiKey, model);

  return {
    ok: true,
    service: "live_chat",
    message: "Live chat test passed.",
    evidence: result,
    checked_at: new Date().toISOString(),
    docs_url: provider === "anthropic" ? "https://docs.claude.com/en/api/messages" : provider === "openai" ? "https://platform.openai.com/docs/api-reference/authentication" : docsByService.llm,
  };
}

async function testOpenRouter(apiKey: string, model: string) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4002",
      "X-OpenRouter-Title": "Master Mold",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: "user", content: "Reply with OK." }],
    }),
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(await providerErrorText(response, "OpenRouter rejected the live chat test."));
  return "The selected chat service responded.";
}

async function testOpenAI(apiKey: string, model: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: "user", content: "Reply with OK." }],
    }),
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(await providerErrorText(response, "OpenAI rejected the live chat test."));
  return "The selected chat service responded.";
}

async function testAnthropic(apiKey: string, model: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: "user", content: "Reply with OK." }],
    }),
    signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(await providerErrorText(response, "Anthropic rejected the live chat test."));
  return "The selected chat service responded.";
}

function createConnectionListSignature(payload: { content: unknown; path: string; query: string }, consumerKey: string) {
  return createHmac("sha256", consumerKey)
    .update(canonicalJson(payload))
    .digest("base64");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(",")}}`;
}

async function providerFailure(service: IntegrationService, response: Response, fallback: string): Promise<TestResult> {
  return {
    ok: false,
    service: publicService(service),
    message: await providerErrorText(response, fallback),
    checked_at: new Date().toISOString(),
    docs_url: docsByService[service],
  };
}

async function providerErrorText(response: Response, fallback: string) {
  const detail = await response.text().catch(() => "");
  return `${fallback} HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`;
}

function ok(service: IntegrationService, message: string, evidence: string): TestResult {
  return {
    ok: true,
    service: publicService(service),
    message,
    evidence,
    checked_at: new Date().toISOString(),
    docs_url: docsByService[service],
  };
}

function publicService(service: IntegrationService): PublicIntegrationService {
  return service === "llm" ? "live_chat" : service;
}

function summarizeSnapTradeConnections(value: unknown) {
  if (!Array.isArray(value)) return "Connection response returned. Use the import button to copy holdings into Portfolio.";
  const readOnly = value.filter((item) => connectionType(item) === "read").length;
  const tradeEnabled = value.filter((item) => connectionType(item) === "trade").length;
  const unknown = value.length - readOnly - tradeEnabled;
  return `${value.length} connection${value.length === 1 ? "" : "s"} returned: ${readOnly} read-only, ${tradeEnabled} trade-capable${unknown > 0 ? `, ${unknown} unknown` : ""}. Master Mold ignores trading capability and never calls order endpoints. Use the import button to copy holdings into Portfolio.`;
}

function connectionType(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" ? type.toLowerCase() : "";
}

function required(body: Record<string, unknown> | null, key: string, message: string) {
  const value = text(body?.[key]);
  if (!value) throw new Error(message);
  return value;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function envKey(provider: ModelProvider) {
  if (provider === "openrouter") return process.env.OPENROUTER_API_KEY ?? "";
  if (provider === "openai") return process.env.OPENAI_API_KEY ?? "";
  return process.env.ANTHROPIC_API_KEY ?? "";
}

function defaultModel(provider: ModelProvider) {
  if (provider === "openrouter") return process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-chat";
  if (provider === "openai") return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  return process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
}

function providerLabel(provider: ModelProvider) {
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "openai") return "OpenAI";
  return "Anthropic";
}

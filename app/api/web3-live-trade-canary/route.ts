import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildWeb3LiveTradeCanaryActionReceipt,
  buildWeb3LiveTradeCanaryReceipt,
  liveCanaryRequestContinuityBlockers,
  type Web3LiveTradeCanaryActionReceipt,
  type Web3LiveTradeCanaryReceipt,
} from "@/src/db/web3-live-trade-canary";
import {
  getWeb3TradingStateAsync,
  isTradingAccountMode,
  isTradingMarketSource,
  isTradingScenario,
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
} from "@/src/db/web3-trading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<Web3LiveTradeCanaryReceipt | { error: string }>> {
  const parsed = parseCanaryQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const state = await getWeb3TradingStateAsync({
    ...parsed.value,
    advance: false,
  });

  return NextResponse.json(buildWeb3LiveTradeCanaryReceipt(state));
}

export async function POST(request: Request): Promise<NextResponse<Web3LiveTradeCanaryActionReceipt | { error: string }>> {
  const parsed = parseCanaryQuery(request.url);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 422 });
  }

  const state = await getWeb3TradingStateAsync({
    ...parsed.value,
    advance: false,
  });
  const before = buildWeb3LiveTradeCanaryReceipt(state);
  const record = isPlainObject(body) ? body : {};
  const unsafeFields = findUnsafeFields(record);
  const operatorAcknowledged = record.operator_ack === true;
  const canaryAcknowledged = record.canary_ack === "I_UNDERSTAND_THIS_CAN_MOVE_REAL_FUNDS";
  const signedTransaction = stringValue(record.signed_transaction);
  const requestId = stringValue(record.request_id);
  const route = record.route === "jupiter-swap-v2" || record.route === "solana-rpc" ? record.route : null;
  const signedPayloadHash = signedTransaction ? hashString(signedTransaction) : null;
  const signedPayloadByteCount = signedTransaction && isBase64Payload(signedTransaction)
    ? Buffer.from(signedTransaction, "base64").byteLength
    : 0;
  const blockers = [
    !operatorAcknowledged ? "operator_ack must be true before any live canary action." : null,
    !canaryAcknowledged ? "canary_ack must equal I_UNDERSTAND_THIS_CAN_MOVE_REAL_FUNDS." : null,
    parsed.value.source !== "live-dex" ? "Live canary actions require source=live-dex." : null,
    parsed.value.account !== "persistent" ? "Live canary actions require account=persistent." : null,
    !signedTransaction ? "signed_transaction is required for the external signed-payload canary path." : null,
    signedTransaction && !isBase64Payload(signedTransaction) ? "signed_transaction must be base64 encoded." : null,
    !requestId ? "request_id is required so the signed payload can be matched to the current order request." : null,
    !route ? "route must be jupiter-swap-v2 or solana-rpc." : null,
    signedPayloadByteCount > 0 && signedPayloadByteCount > 2_500_000 ? "signed_transaction payload is too large for canary relay." : null,
    requestId ? liveCanaryRequestContinuityBlockers(before, requestId)[0] ?? null : null,
  ].filter((item): item is string => Boolean(item));

  if (unsafeFields.length > 0 || blockers.length > 0) {
    const receipt = buildWeb3LiveTradeCanaryActionReceipt({
      before,
      operatorAcknowledged,
      canaryAcknowledged,
      relayAttempted: false,
      requestId: requestId || null,
      route,
      signedPayloadHash,
      signedPayloadByteCount,
      unsafeFields,
      blockers,
    });
    return NextResponse.json(receipt, { status: unsafeFields.length > 0 ? 422 : 200 });
  }

  try {
    const afterState = await getWeb3TradingStateAsync({
      ...parsed.value,
      advance: false,
      relay: {
        signed_transaction: signedTransaction,
        request_id: requestId,
        route: route ?? undefined,
      },
    });
    const after = buildWeb3LiveTradeCanaryReceipt(afterState);
    return NextResponse.json(buildWeb3LiveTradeCanaryActionReceipt({
      before,
      after,
      operatorAcknowledged,
      canaryAcknowledged,
      relayAttempted: true,
      requestId,
      route,
      signedPayloadHash,
      signedPayloadByteCount,
    }));
  } catch (error) {
    return NextResponse.json(buildWeb3LiveTradeCanaryActionReceipt({
      before,
      operatorAcknowledged,
      canaryAcknowledged,
      relayAttempted: true,
      requestId,
      route,
      signedPayloadHash,
      signedPayloadByteCount,
      blockers: [`Relay attempt failed before confirmation: ${error instanceof Error ? error.message : "unknown error"}.`],
    }), { status: 502 });
  }
}

function parseCanaryQuery(url: string):
  | { ok: true; value: { scenario: TradingScenario; source: TradingMarketSource; account: TradingAccountMode; cycles: number } }
  | { ok: false; error: string } {
  const search = new URL(url).searchParams;
  const scenario = search.get("scenario") ?? "breakout";
  const source = search.get("source") ?? "live-dex";
  const account = search.get("account") ?? "persistent";
  const cycles = Number(search.get("cycles") ?? "0");

  if (!isTradingScenario(scenario)) {
    return { ok: false, error: "scenario must be base, breakout, or rug-risk." };
  }
  if (!isTradingMarketSource(source)) {
    return { ok: false, error: "source must be sample or live-dex." };
  }
  if (!isTradingAccountMode(account)) {
    return { ok: false, error: "account must be ephemeral or persistent." };
  }
  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 24) {
    return { ok: false, error: "cycles must be an integer from 0 to 24." };
  }

  return {
    ok: true,
    value: {
      scenario: scenario as TradingScenario,
      source: source as TradingMarketSource,
      account: account as TradingAccountMode,
      cycles,
    },
  };
}

function findUnsafeFields(value: unknown, path = ""): string[] {
  if (!isPlainObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    const unsafeKey = key !== "signed_transaction" && unsafeKeyPatterns.some((pattern) => pattern.test(key));
    const unsafeValue = typeof child === "string" && looksSecretLike(child) && key !== "signed_transaction";
    const nested = isPlainObject(child) ? findUnsafeFields(child, childPath) : [];
    return [
      unsafeKey || unsafeValue ? childPath : null,
      ...nested,
    ].filter((item): item is string => Boolean(item));
  });
}

const unsafeKeyPatterns = [
  /private/i,
  /seed/i,
  /mnemonic/i,
  /keypair/i,
  /secret/i,
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /raw[_-]?transaction/i,
  /unsigned[_-]?transaction/i,
  /transaction[_-]?bytes/i,
  /signed[_-]?payload/i,
];

function looksSecretLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/api-key=|bearer\s+[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9_-]{16,}/i.test(trimmed)) return true;
  if (/private[_\s-]?key|seed\s+phrase|mnemonic|keypair/i.test(trimmed)) return true;
  if (trimmed.split(/\s+/).length >= 12 && /^[a-z\s]+$/i.test(trimmed)) return true;
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isBase64Payload(value: string) {
  return value.length <= 4_000_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function hashString(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

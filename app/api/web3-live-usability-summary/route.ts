import { NextResponse } from "next/server";
import { GET as LIVE_TEST_LEDGER_GET } from "@/app/api/web3-live-test-ledger/route";
import { GET as LIVE_USABILITY_BLOCKERS_GET } from "@/app/api/web3-live-usability-blockers/route";
import { GET as LOCAL_CREDENTIALS_GET } from "@/app/api/web3-local-credentials/route";
import {
  buildWeb3LiveUsabilitySummaryFallbackReceipt,
  buildWeb3LiveUsabilitySummaryReceipt,
  type Web3LiveUsabilitySummaryReceipt,
} from "@/src/db/web3-live-usability-summary";
import type { Web3LiveTestLedgerReceipt } from "@/src/db/web3-live-test-ledger";
import type { Web3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import type { Web3LocalCredentialInstallReceipt } from "@/src/db/web3-local-credential-install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE_USABILITY_SOURCE_TIMEOUT_MS = 8_000;

export async function GET(request: Request): Promise<NextResponse<Web3LiveUsabilitySummaryReceipt | { error: string }>> {
  const searchParams = new URL(request.url).searchParams;
  const compactOnly = searchParams.get("compact") === "1" || searchParams.get("full") === "0";
  const [ledgerResponse, localCredentialsResponse] = await Promise.all([
    LIVE_TEST_LEDGER_GET(new Request(request.url, { headers: request.headers })),
    LOCAL_CREDENTIALS_GET(new Request(localCredentialsUrl(request.url), { headers: request.headers })),
  ]);
  const [ledger, localCredentials] = await Promise.all([
    ledgerResponse.json().catch(() => null) as Promise<Web3LiveTestLedgerReceipt | { error: string } | null>,
    localCredentialsResponse.json().catch(() => null) as Promise<Web3LocalCredentialInstallReceipt | { error: string } | null>,
  ]);

  if (!ledgerResponse.ok || !ledger || "error" in ledger) {
    return NextResponse.json(errorPayload(ledger, "Live-test ledger source packet failed."), {
      status: ledgerResponse.status,
    });
  }
  if (!localCredentialsResponse.ok || !localCredentials || "error" in localCredentials) {
    return NextResponse.json(errorPayload(localCredentials, "Local credential status source packet failed."), {
      status: localCredentialsResponse.status,
    });
  }

  if (compactOnly) {
    return NextResponse.json(buildWeb3LiveUsabilitySummaryFallbackReceipt({
      source: ledger.source,
      account: ledger.account,
      scenario: ledger.scenario,
      liveTestLedger: ledger,
      localCredentials,
      reason: "Compact summary was explicitly requested; open the default summary or /api/web3-live-usability-blockers?rows=all for the full blocker packet.",
    }));
  }

  const liveUsabilityResult = await withResponseTimeout(
    LIVE_USABILITY_BLOCKERS_GET(new Request(withRowsAll(request.url), { headers: request.headers })),
    LIVE_USABILITY_SOURCE_TIMEOUT_MS,
    `Live usability source timed out after ${LIVE_USABILITY_SOURCE_TIMEOUT_MS}ms; no live trade was attempted.`,
  );
  const liveUsability = liveUsabilityResult.ok
    ? await liveUsabilityResult.response.json().catch(() => null) as Web3LiveUsabilityBlockersReceipt | { error: string } | null
    : { error: liveUsabilityResult.error };
  if (!liveUsabilityResult.ok || !liveUsability || "error" in liveUsability) {
    return NextResponse.json(buildWeb3LiveUsabilitySummaryFallbackReceipt({
      source: ledger.source,
      account: ledger.account,
      scenario: ledger.scenario,
      liveTestLedger: ledger,
      localCredentials,
      reason: !liveUsabilityResult.ok
        ? liveUsabilityResult.error
        : errorPayload(liveUsability, "Live usability source packet failed.").error,
    }));
  }

  return NextResponse.json(buildWeb3LiveUsabilitySummaryReceipt({
    liveUsability,
    liveTestLedger: ledger,
    localCredentials,
  }));
}

function withRowsAll(url: string) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("rows", "all");
  return nextUrl.toString();
}

function localCredentialsUrl(url: string) {
  const nextUrl = new URL(url);
  nextUrl.pathname = "/api/web3-local-credentials";
  nextUrl.search = "";
  return nextUrl.toString();
}

function errorPayload(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? { error: payload.error }
    : { error: fallback };
}

async function withResponseTimeout(
  promise: Promise<NextResponse>,
  timeoutMs: number,
  error: string,
): Promise<{ ok: true; response: NextResponse } | { ok: false; error: string }> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise.then((response) => ({ ok: true as const, response })),
      new Promise<{ ok: false; error: string }>((resolve) => {
        timeout = setTimeout(() => resolve({ ok: false, error }), timeoutMs);
      }),
    ]);
  } catch (caught) {
    return {
      ok: false,
      error: `Live usability source failed before any live trade attempt: ${caught instanceof Error ? caught.message : "unknown error"}.`,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

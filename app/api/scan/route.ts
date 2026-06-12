import { NextResponse } from "next/server";
import {
  getScanAttempts,
  getScanStatusLine,
  isScanRunning,
  runMarketScan,
  scanRunnerAvailable,
} from "@/src/db/scan";

export const dynamic = "force-dynamic";

/** Latest scan attempts + whether this machine can run the engine. */
export async function GET() {
  return NextResponse.json({
    runner_available: scanRunnerAvailable(),
    running: isScanRunning(),
    status_line: getScanStatusLine(),
    attempts: getScanAttempts(10),
  });
}

/**
 * Run today's market scan. Reads market data and writes a JSON bundle — no
 * brokerage, wallet, or order path exists anywhere in this flow.
 */
export async function POST(request: Request) {
  let trigger = "manual";
  try {
    const body = (await request.json()) as { trigger?: unknown };
    if (typeof body.trigger === "string" && body.trigger.trim()) {
      trigger = body.trigger.trim().slice(0, 40);
    }
  } catch {
    // empty body is fine
  }

  if (!scanRunnerAvailable()) {
    return NextResponse.json(
      {
        ok: false,
        detail:
          "The scan engine is not set up on this machine. See engine/README.md; the app keeps working on the last saved read.",
      },
      { status: 503 },
    );
  }

  const result = await runMarketScan({ trigger });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

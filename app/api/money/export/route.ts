import { NextResponse } from "next/server";
import { exportManualHoldings } from "@/src/db/money-import";

export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(JSON.stringify(exportManualHoldings(), null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="mastermold-holdings-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

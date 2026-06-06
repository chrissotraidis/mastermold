import { NextResponse } from "next/server";
import { getIntegrationStatuses, type IntegrationStatusJson } from "@/src/db/integrations";

export function GET(): NextResponse<IntegrationStatusJson[]> {
  return NextResponse.json(getIntegrationStatuses());
}

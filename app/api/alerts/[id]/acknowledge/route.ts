import { NextResponse } from "next/server";
import { acknowledgeAlert, type AlertJson } from "@/src/db/alerts";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse<AlertJson | { error: string }>> {
  const { id } = await context.params;
  const alert = acknowledgeAlert(id);

  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  return NextResponse.json(alert);
}

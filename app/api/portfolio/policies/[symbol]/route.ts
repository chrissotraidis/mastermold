import { NextResponse } from "next/server";
import { removePositionPolicy } from "@/src/db/position-policies";

type PositionPolicyRouteProps = {
  params: Promise<{
    symbol: string;
  }>;
};

export async function DELETE(
  _request: Request,
  { params }: PositionPolicyRouteProps,
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const { symbol } = await params;
  const deleted = removePositionPolicy(decodeURIComponent(symbol));

  if (!deleted) {
    return NextResponse.json({ error: "No policy is saved for that symbol." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

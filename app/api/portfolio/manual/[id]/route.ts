import { NextResponse } from "next/server";
import { toPublicPortfolio, type PublicPortfolio } from "@/lib/public-api-copy";
import { deleteManualHolding, getPortfolio } from "@/src/db/portfolio";

type ManualHoldingRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(
  _request: Request,
  { params }: ManualHoldingRouteProps,
): Promise<NextResponse<PublicPortfolio | { error: string }>> {
  const { id } = await params;
  const deleted = deleteManualHolding(id);

  if (!deleted) {
    return NextResponse.json({ error: "Manual holding was not found." }, { status: 404 });
  }

  return NextResponse.json(toPublicPortfolio(getPortfolio()));
}

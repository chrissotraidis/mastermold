import { NextResponse } from "next/server";
import { toPublicPortfolio, type PublicPortfolio } from "@/lib/public-api-copy";
import {
  importPortfolioFromProvider,
  type PortfolioImportResult,
} from "@/src/db/portfolio-imports";

type PublicPortfolioImportResult = Omit<PortfolioImportResult, "portfolio"> & {
  portfolio: PublicPortfolio;
};

type PortfolioImportError = {
  error: string;
  message: string;
  docs_url?: string;
};

const docsByService: Record<string, string> = {
  coinbase: "https://docs.cdp.coinbase.com/api-reference/v2/rest-api/accounts/list-accounts",
  robinhood: "https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getAllAccountPositions",
  onchain_wallet: "https://developers.zerion.io/api-reference/wallets/get-wallet-fungible-positions",
};

export async function POST(
  request: Request,
): Promise<NextResponse<PublicPortfolioImportResult | PortfolioImportError>> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    const result = await importPortfolioFromProvider(body);
    return NextResponse.json({
      ...result,
      portfolio: toPublicPortfolio(result.portfolio),
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Portfolio import failed.";
    const service = typeof body?.service === "string" ? body.service : "";
    return NextResponse.json(
      {
        error: message,
        message,
        ...(docsByService[service] ? { docs_url: docsByService[service] } : {}),
      },
      { status: 422 },
    );
  }
}

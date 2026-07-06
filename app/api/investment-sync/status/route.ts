import { NextResponse } from "next/server";
import {
  buildInvestmentAwarenessSummary,
  buildInvestmentIntegrationPlan,
  buildInvestmentRealtimePlan,
  type InvestmentIntegrationPlan,
  type InvestmentAwarenessSummary,
  type InvestmentRealtimePlan,
} from "@/src/db/investment-awareness";
import { getIntegrationStatuses } from "@/src/db/integrations";
import { getPortfolio } from "@/src/db/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvestmentSyncStatusResponse = {
  awareness: InvestmentAwarenessSummary;
  integration_plan: InvestmentIntegrationPlan;
  realtime: InvestmentRealtimePlan;
  live_trading_boundary: {
    status: "locked";
    detail: string;
  };
};

export function GET(): NextResponse<InvestmentSyncStatusResponse> {
  const portfolio = getPortfolio();
  const integrations = getIntegrationStatuses();

  return NextResponse.json({
    awareness: buildInvestmentAwarenessSummary({
      portfolio,
      integrations,
    }),
    integration_plan: buildInvestmentIntegrationPlan({
      portfolio,
      integrations,
    }),
    realtime: buildInvestmentRealtimePlan({
      portfolio,
      integrations,
    }),
    live_trading_boundary: {
      status: "locked",
      detail:
        "Realtime sync is read-only awareness. It does not enable trading, transfers, signing, wallet mutation, private-key storage, or seed-phrase storage.",
    },
  });
}

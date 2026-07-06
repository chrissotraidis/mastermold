import { NextResponse } from "next/server";
import { getPortfolio } from "@/src/db/portfolio";
import {
  evaluatePositionPolicies,
  getPositionPolicies,
  positionPolicyIntents,
  savePositionPolicy,
  type PolicyFinding,
  type PositionPolicyInput,
} from "@/src/db/position-policies";
import type { PositionPolicyRow } from "@/src/db/store";

export type PublicPositionPolicies = {
  policies: PositionPolicyRow[];
  findings: Array<Pick<PolicyFinding, "symbol" | "kind" | "classification" | "title" | "detail">>;
  data_boundary: string;
};

const dataBoundary =
  "Standing review rules only. A breached policy raises a review prompt; it cannot place brokerage trades, sign transactions, or move funds.";

export function GET(): NextResponse<PublicPositionPolicies> {
  return NextResponse.json(buildResponse());
}

export async function POST(
  request: Request,
): Promise<NextResponse<PublicPositionPolicies | { error: string }>> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Enter a policy first." }, { status: 422 });

  const input: PositionPolicyInput = {
    symbol: typeof body.symbol === "string" ? body.symbol : "",
    intent: (typeof body.intent === "string" ? body.intent : "") as PositionPolicyInput["intent"],
    max_weight_pct: optionalNumber(body.max_weight_pct),
    take_profit_pct: optionalNumber(body.take_profit_pct),
    stop_loss_pct: optionalNumber(body.stop_loss_pct),
    rationale: typeof body.rationale === "string" ? body.rationale : "",
  };
  if (!positionPolicyIntents.includes(input.intent)) {
    return NextResponse.json({ error: "Choose an intent." }, { status: 422 });
  }

  const result = savePositionPolicy(input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json(buildResponse());
}

function buildResponse(): PublicPositionPolicies {
  const portfolio = getPortfolio();
  return {
    policies: getPositionPolicies(),
    findings: evaluatePositionPolicies(portfolio.holdings).map((finding) => ({
      symbol: finding.symbol,
      kind: finding.kind,
      classification: finding.classification,
      title: finding.title,
      detail: finding.detail,
    })),
    data_boundary: dataBoundary,
  };
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

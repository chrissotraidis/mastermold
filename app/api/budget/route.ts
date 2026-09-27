import { NextResponse } from "next/server";
import { removeBudgetLine, setBudgetLine, suggestBudget, type BudgetGroup } from "@/src/db/budgets";
import { budgetPayload, defaultGroup } from "@/src/db/budget-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json(budgetPayload(new URL(request.url).searchParams.get("month")));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const month = typeof body?.month === "string" ? body.month : new Date().toISOString().slice(0, 7);
  try {
    switch (body?.action) {
      case "set_line":
        setBudgetLine(
          {
            category_id: String(body.category_id ?? ""),
            group: String(body.group ?? "flex") as BudgetGroup,
            amount: Number(body.amount),
            rollover: typeof body.rollover === "boolean" ? body.rollover : undefined,
            rollover_start_balance: body.rollover_start_balance === undefined ? undefined : Number(body.rollover_start_balance),
          },
          month,
        );
        break;
      case "remove_line":
        removeBudgetLine(String(body.category_id ?? ""));
        break;
      case "apply_suggestions":
        for (const row of suggestBudget(month)) {
          setBudgetLine({ category_id: row.category_id, group: defaultGroup(row.category_id), amount: Math.ceil(row.average / 5) * 5 }, month);
        }
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 422 });
    }
    return NextResponse.json(budgetPayload(month));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 422 });
  }
}


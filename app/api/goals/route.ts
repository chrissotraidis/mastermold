import { NextResponse } from "next/server";
import { store } from "@/src/db/store";
import { createGoal, deleteGoal, goalViews, linkTransactionsToGoal, updateGoal, type GoalInput } from "@/src/db/goals";

export const dynamic = "force-dynamic";

function payload() {
  const rows = store().transactions();
  const cutoff = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  return {
    goals: goalViews(rows),
    // Recent transfers are the usual contributions; offer them for linking.
    candidates: rows
      .filter((tx) => !tx.goal_id && tx.date >= cutoff && (tx.category_id === "transfer" || /saving/i.test(tx.original_description)))
      .slice(0, 12),
    accounts: store().financialAccounts().map((account) => ({ id: account.id, name: account.name })),
  };
}

function input(body: Record<string, unknown>): GoalInput {
  return {
    name: String(body.name ?? ""),
    target_amount: Number(body.target_amount),
    target_date: typeof body.target_date === "string" && body.target_date ? body.target_date : null,
    account_id: typeof body.account_id === "string" && body.account_id ? body.account_id : null,
    starting_balance: body.starting_balance === undefined || body.starting_balance === "" ? 0 : Number(body.starting_balance),
  };
}

export async function GET() {
  return NextResponse.json(payload());
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    switch (body.action) {
      case "create":
        createGoal(input(body));
        break;
      case "update":
        updateGoal(String(body.id ?? ""), input(body));
        break;
      case "delete":
        deleteGoal(String(body.id ?? ""));
        break;
      case "link":
        linkTransactionsToGoal(typeof body.goal_id === "string" ? body.goal_id : null, Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : []);
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 422 });
    }
    return NextResponse.json(payload());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 422 });
  }
}


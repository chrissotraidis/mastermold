import type { APIRequestContext } from "@playwright/test";

export const ORIGIN = `http://127.0.0.1:${process.env.E2E_PORT ?? 4012}`;
const headers = { "content-type": "application/json", origin: ORIGIN };

/** Empty the throwaway store's transactions, rules and budget between specs. */
export async function resetMoney(request: APIRequestContext) {
  const tx = await (await request.get("/api/transactions")).json();
  for (const rule of tx.rules) await request.post("/api/transactions", { headers, data: { action: "delete_rule", id: rule.id } });
  if (tx.transactions.length) {
    await request.post("/api/transactions", { headers, data: { action: "delete", ids: tx.transactions.map((row: { id: string }) => row.id) } });
  }
  const goals = await (await request.get("/api/goals")).json();
  for (const goal of goals.goals) await request.post("/api/goals", { headers, data: { action: "delete", id: goal.id } });
  const budget = await (await request.get("/api/budget")).json();
  for (const group of budget.budget.groups) {
    for (const line of group.lines) await request.post("/api/budget", { headers, data: { action: "remove_line", category_id: line.category_id } });
  }
}

export async function importCsv(request: APIRequestContext, csv: string) {
  const response = await request.post("/api/transactions", { headers, data: { action: "import", csv } });
  if (!response.ok()) throw new Error(`import failed: ${response.status()}`);
  return (await response.json()).result as { imported: number; batch_id: string };
}

/** Three months of made-up spending ending last month, for budget suggestions. */
export function threeMonthsCsv(now = new Date()) {
  const months: string[] = [];
  for (let back = 3; back >= 1; back -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const current = now.toISOString().slice(0, 7);
  const rows = [...months, current].flatMap((month, index) => [
    `${month}-01,ACME CORP PAYROLL,5000.00`,
    `${month}-02,RENT PAYMENT PROPERTY MGMT,-2100.00`,
    `${month}-10,NETFLIX.COM,-15.99`,
    `${month}-12,WHOLE FOODS MARKET #1234,-${(400 + index * 10).toFixed(2)}`,
    `${month}-18,SWEETGREEN RESTAURANT,-${(150 + index * 5).toFixed(2)}`,
  ]);
  return { csv: `Date,Description,Amount\n${rows.join("\n")}\n`, current, months };
}


import { NextResponse } from "next/server";
import { deleteAccount, parseAccountInput, updateAccount } from "@/src/db/money";
import { store } from "@/src/db/store";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const existing = store().financialAccounts().find((account) => account.id === id);
  if (!existing) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseAccountInput({ ...existing, ...(body ?? {}) });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
  return NextResponse.json({ account: updateAccount(id, parsed.input) });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const existing = store().financialAccounts().find((account) => account.id === id);
  if (!existing || !deleteAccount(id)) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json({ deleted: existing });
}

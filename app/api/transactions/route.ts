import { NextResponse } from "next/server";
import { runSync, sandboxProvider } from "@/src/db/bank-sync";
import { transactionsPayload } from "@/src/db/transactions-view";
import {
  addManualTransaction,
  addRule,
  deleteRule,
  deleteTransactions,
  importTransactions,
  parseTransactionCsv,
  previewRule,
  previewTransactionImport,
  undoImport,
  updateTransaction,
  type NewRule,
  type TransactionPatch,
} from "@/src/db/transactions";

export const dynamic = "force-dynamic";

const payload = transactionsPayload;

/**
 * After an import, show a month that actually contains the new rows: importing
 * last month's statement used to report success and then show an empty month.
 */
function monthShowing(requested: string | null, dates: string[]): string | null {
  const months = [...new Set(dates.map((date) => date.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort();
  if (months.length === 0 || (requested && months.includes(requested))) return requested;
  return months[months.length - 1];
}

export async function GET(request: Request) {
  return NextResponse.json(payload(new URL(request.url).searchParams.get("month")));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const month = typeof body?.month === "string" ? body.month : null;
  try {
    switch (action) {
      case "add": {
        const added = addManualTransaction({
          date: String(body?.date ?? ""),
          amount: Number(body?.amount),
          description: String(body?.description ?? ""),
          category_id: typeof body?.category_id === "string" ? body.category_id : null,
          account_id: typeof body?.account_id === "string" && body.account_id ? body.account_id : null,
          notes: typeof body?.notes === "string" ? body.notes : "",
        });
        return NextResponse.json(payload(monthShowing(month, [added.date])));
      }
      case "update":
        updateTransaction(String(body?.id ?? ""), (body?.patch ?? {}) as TransactionPatch);
        break;
      case "delete":
        deleteTransactions(Array.isArray(body?.ids) ? (body.ids as unknown[]).map(String) : []);
        break;
      case "import_preview": {
        const parsed = parseTransactionCsv(String(body?.csv ?? ""), { flipSign: typeof body?.flip_sign === "boolean" ? body.flip_sign : undefined });
        const accountId = typeof body?.account_id === "string" && body.account_id ? body.account_id : null;
        return NextResponse.json({
          preview: previewTransactionImport(parsed, accountId),
          columns: parsed.columns,
          format: parsed.format,
          flipped: parsed.flipped,
          issues: parsed.issues.slice(0, 20),
          sample: parsed.rows.slice(0, 5),
        });
      }
      case "import": {
        const parsed = parseTransactionCsv(String(body?.csv ?? ""), { flipSign: typeof body?.flip_sign === "boolean" ? body.flip_sign : undefined });
        const accountId = typeof body?.account_id === "string" && body.account_id ? body.account_id : null;
        const result = importTransactions(parsed, accountId);
        return NextResponse.json({ ...payload(monthShowing(month, parsed.rows.map((row) => row.date))), result });
      }
      case "undo_import":
        undoImport(String(body?.batch_id ?? ""));
        break;
      case "sandbox_sync": {
        // Made-up data only: no bank, no network, no keys (see src/db/bank-sync.ts).
        const result = await runSync(sandboxProvider());
        return NextResponse.json({ ...payload(month), sync_result: result });
      }
      case "preview_rule":
        return NextResponse.json({ matches: previewRule(body?.rule as NewRule) });
      case "add_rule": {
        const result = addRule(body?.rule as NewRule, { applyToPast: body?.apply_to_past === true });
        return NextResponse.json({ ...payload(month), rule_result: { updated: result.updated } });
      }
      case "delete_rule":
        deleteRule(String(body?.id ?? ""));
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 422 });
    }
    return NextResponse.json(payload(month));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 422 });
  }
}

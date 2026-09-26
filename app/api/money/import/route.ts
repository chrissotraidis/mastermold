import { NextResponse } from "next/server";
import { applyImport, parseHoldingsImport, previewImport, type ImportField, type ImportMode } from "@/src/db/money-import";

const MAX_IMPORT_CHARS = 2_000_000;

/** { text, mode: "merge" | "replace", mapping?, apply?: boolean } */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ error: "Paste holdings or choose a file first." }, { status: 422 });
  if (text.length > MAX_IMPORT_CHARS) return NextResponse.json({ error: "That file is too large to import here." }, { status: 413 });
  const mode: ImportMode = body?.mode === "replace" ? "replace" : "merge";
  const mapping = body?.mapping && typeof body.mapping === "object" ? (body.mapping as Partial<Record<ImportField, string>>) : {};
  const parsed = parseHoldingsImport(text, mapping);
  if (body?.apply === true) {
    if (parsed.rows.length === 0) return NextResponse.json({ error: "No importable rows were found." }, { status: 422 });
    return NextResponse.json({ applied: applyImport(parsed, mode), preview: null });
  }
  return NextResponse.json({ preview: previewImport(parsed, mode) });
}

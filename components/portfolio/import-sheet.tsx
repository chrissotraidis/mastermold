"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney, formatQuantity } from "@/lib/money-format";
import { cn } from "@/lib/utils";
import type { ImportField, ImportPreview } from "@/src/db/money-import";
import { fieldClass } from "./fields";
import { moneyRequest, toastError, toastWithUndo } from "./money-api";

const MAPPABLE: Array<{ field: ImportField; label: string }> = [
  { field: "symbol", label: "Symbol" },
  { field: "quantity", label: "Amount" },
  { field: "price", label: "Price" },
  { field: "value", label: "Total value" },
  { field: "cost_basis", label: "Cost basis" },
  { field: "asset_class", label: "Kind" },
  { field: "account", label: "Account" },
  { field: "asset_name", label: "Name" },
];

const FORMAT_LABEL: Record<ImportPreview["format"], string> = {
  manual_holdings_json: "Master Mold book (manual_holdings JSON)",
  holdings_json: "Holdings JSON",
  csv: "CSV / pasted table",
  empty: "Nothing yet",
};

export function ImportSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
  }, [open]);

  // Re-preview whenever the input, mode, or column mapping changes.
  useEffect(() => {
    if (!open || !text.trim()) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await moneyRequest<{ preview: ImportPreview }>("/api/money/import", { method: "POST", body: { text, mode, mapping } });
        setPreview(result.preview);
      } catch (error) {
        toastError(error);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, text, mode, mapping]);

  async function readFile(file: File) {
    setFileName(file.name);
    setMapping({});
    setText(await file.text());
  }

  async function apply() {
    setBusy(true);
    try {
      const result = await moneyRequest<{ applied: { previous: unknown[]; counts: { add: number; update: number; remove: number } } }>(
        "/api/money/import",
        { method: "POST", body: { text, mode, mapping, apply: true } },
      );
      const { counts } = result.applied;
      toastWithUndo(
        "Import saved",
        result.applied.previous,
        "book",
        onSaved,
        `${counts.add} added · ${counts.update} updated${counts.remove ? ` · ${counts.remove} removed` : ""}`,
      );
      setText("");
      setFileName(null);
      onSaved();
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  }

  const importable = preview ? preview.counts.add + preview.counts.update + preview.counts.unchanged : 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import holdings"
      description="Paste or drop your Master Mold book (the manual_holdings JSON), a brokerage CSV, or any table with a symbol column. Nothing saves until you confirm."
      className="sm:w-[min(40rem,100vw)]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <a href="/api/money/export" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-violet">
            <Download aria-hidden="true" className="size-3.5" /> Download current book
          </a>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={apply} disabled={busy || !preview || importable === 0}>
              {preview ? `Save ${importable} holding${importable === 1 ? "" : "s"}` : "Save"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void readFile(file);
          }}
          className="grid gap-2"
        >
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setFileName(null);
            }}
            placeholder={'{"manual_holdings": [ … ]}\n\nor\n\nsymbol,quantity,price,cost_basis,account\nNVDA,10.5,125.25,900,Fidelity'}
            aria-label="Holdings to import"
            className={cn(fieldClass, "min-h-40 py-3 font-mono text-xs leading-5 sm:min-h-40")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".json,.csv,.tsv,.txt,application/json,text/csv" className="hidden" onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0])} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp /> Choose file
            </Button>
            {fileName ? <span className="truncate text-xs text-outline">{fileName}</span> : <span className="text-xs text-outline">or drop a file on the box</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Import mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "merge", label: "Merge into my book" },
              { value: "replace", label: "Replace my book" },
            ]}
          />
          {preview ? <span className="text-xs text-outline">{FORMAT_LABEL[preview.format]}</span> : null}
        </div>

        {preview && preview.format === "csv" && preview.columns.length > 0 ? (
          <div className="grid gap-2 rounded-2xl border border-outline-variant/60 p-3">
            <p className="mm-eyebrow">Columns</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MAPPABLE.map(({ field, label }) => (
                <label key={field} className="grid gap-1 text-xs text-on-surface-variant">
                  {label}
                  <select
                    className={fieldClass + " min-h-9 text-xs sm:min-h-9"}
                    value={mapping[field] ?? preview.mapping[field] ?? ""}
                    onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
                  >
                    <option value="">—</option>
                    {preview.columns.map((column) => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {preview ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="up">{preview.counts.add} new</Badge>
              <Badge variant="magenta">{preview.counts.update} updated</Badge>
              <Badge variant="muted">{preview.counts.unchanged} unchanged</Badge>
              {preview.counts.remove ? <Badge variant="down">{preview.counts.remove} removed</Badge> : null}
              {preview.counts.issues ? <Badge variant="caution">{preview.counts.issues} skipped</Badge> : null}
            </div>
            <p className="mm-num text-sm text-on-surface-variant">
              Book value {formatMoney(preview.total_before)} → <span className="font-semibold text-on-surface">{formatMoney(preview.total_after)}</span>
              {preview.new_accounts.length ? <span className="text-outline"> · new accounts: {preview.new_accounts.join(", ")}</span> : null}
            </p>
            {preview.issues.length ? (
              <div className="rounded-2xl border border-caution/40 bg-caution/10 p-3 text-xs">
                <p className="font-semibold text-caution">Skipped rows</p>
                <ul className="mt-1 grid gap-0.5 text-on-surface-variant">
                  {preview.issues.slice(0, 8).map((issue) => (
                    <li key={`${issue.line}-${issue.reason}`}>Line {issue.line}: {issue.reason}</li>
                  ))}
                  {preview.issues.length > 8 ? <li>…and {preview.issues.length - 8} more</li> : null}
                </ul>
              </div>
            ) : null}
            <ul className="grid max-h-72 gap-0.5 overflow-y-auto rounded-2xl border border-outline-variant/50 p-1.5">
              {preview.changes.filter((change) => change.kind !== "unchanged").slice(0, 120).map((change, index) => (
                <li key={`${change.symbol}-${index}`} className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs">
                  <Badge variant={change.kind === "add" ? "up" : change.kind === "remove" ? "down" : "magenta"} className="w-16 justify-center">
                    {change.kind}
                  </Badge>
                  <span className="w-16 shrink-0 font-semibold text-on-surface">{change.symbol}</span>
                  <span className="mm-num min-w-0 flex-1 truncate text-on-surface-variant">
                    {change.before && change.after
                      ? `${formatQuantity(change.before.quantity)} → ${formatQuantity(change.after.quantity)} · ${change.fields.join(", ")}`
                      : change.after
                        ? `${formatQuantity(change.after.quantity)} @ ${change.after.price}`
                        : change.before
                          ? `${formatQuantity(change.before.quantity)} held now`
                          : ""}
                  </span>
                  <span className="mm-num shrink-0 text-on-surface">{formatMoney((change.after ?? change.before)?.value ?? 0)}</span>
                </li>
              ))}
              {preview.changes.every((change) => change.kind === "unchanged") ? (
                <li className="px-2 py-3 text-center text-xs text-outline">Everything already matches your book.</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

"use client";

import { toast } from "@/components/ui/toast";

export async function moneyRequest<T>(url: string, init: { method: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init.method,
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body;
}

/** Toast with an Undo button that puts rows back exactly as they were. */
export function toastWithUndo(
  title: string,
  rows: unknown[],
  mode: "rows" | "book",
  onDone: () => void,
  description?: string,
) {
  toast({
    title,
    description,
    action: rows.length
      ? {
          label: "Undo",
          onAction: async () => {
            try {
              await moneyRequest("/api/money/holdings/restore", { method: "POST", body: { rows, mode } });
              toast({ title: "Undone", tone: "info" });
            } catch (error) {
              toast({ title: "Could not undo", description: (error as Error).message, tone: "error" });
            }
            onDone();
          },
        }
      : undefined,
  });
}

export function toastError(error: unknown) {
  toast({ title: "That didn’t save", description: (error as Error).message, tone: "error" });
}

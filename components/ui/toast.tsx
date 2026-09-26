"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { emitFaceReaction } from "@/lib/face-reactions";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: "success" | "info" | "error";
  action?: { label: string; onAction: () => void };
  durationMs?: number;
};

type ToastItem = ToastInput & { id: number };

const TOAST_EVENT = "mm:toast";
let counter = 0;

/** Fire-and-forget toast from anywhere on the client. */
export function toast(input: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastItem>(TOAST_EVENT, { detail: { ...input, id: (counter += 1) } }));
  // Master Mold reacts to outcomes: a nod for success, a head shake for errors.
  if (input.tone === "error") emitFaceReaction("shake");
  else if (input.tone !== "info") emitFaceReaction("nod");
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const item = (event as CustomEvent<ToastItem>).detail;
      setItems((current) => [...current.slice(-3), item]);
      window.setTimeout(() => {
        setItems((current) => current.filter((entry) => entry.id !== item.id));
      }, item.durationMs ?? (item.action ? 7000 : 3600));
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[99] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end"
      role="status"
      aria-live="polite"
    >
      {items.map((item) => {
        const Icon = item.tone === "error" ? AlertTriangle : item.tone === "info" ? Info : CheckCircle2;
        return (
          <div
            key={item.id}
            className="pointer-events-auto flex w-full max-w-sm animate-mm-enter items-start gap-3 rounded-2xl border border-outline-variant/70 bg-surface-low/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl"
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "mt-0.5 size-4 shrink-0",
                item.tone === "error" ? "text-critical" : item.tone === "info" ? "text-gold-soft" : "text-violet",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-on-surface">{item.title}</p>
              {item.description ? <p className="mt-0.5 text-on-surface-variant">{item.description}</p> : null}
            </div>
            {item.action ? (
              <button
                type="button"
                onClick={() => {
                  item.action?.onAction();
                  setItems((current) => current.filter((entry) => entry.id !== item.id));
                }}
                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-violet/40 px-3 text-xs font-semibold text-violet hover:bg-violet/10"
              >
                <Undo2 aria-hidden="true" className="size-3.5" />
                {item.action.label}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

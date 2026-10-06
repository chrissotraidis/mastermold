"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Side sheet on desktop, bottom sheet on phones. Esc and backdrop close it;
 * focus moves into the sheet on open and returns to the opener on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[95]">
      <div className="absolute inset-0 animate-mm-fade bg-void/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[92dvh] animate-mm-sheet-up flex-col rounded-t-3xl border border-outline-variant/70 bg-surface-dim shadow-2xl outline-none",
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(32rem,100vw)] sm:animate-mm-sheet-in sm:rounded-none sm:rounded-l-3xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant/50 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight text-on-surface">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-5 text-on-surface-variant">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-outline transition hover:bg-surface-high hover:text-on-surface sm:size-9"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-outline-variant/50 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

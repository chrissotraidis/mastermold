"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  label: string;
  /** Small count or status shown after the label. */
  badge?: React.ReactNode;
  /** Extra URL hashes that should open this tab (old deep links). */
  anchors?: string[];
  content: React.ReactNode;
};

/**
 * Page-level tabs. The selected tab follows the URL hash, so /page#tab links,
 * the back button, and old section anchors all land on the right view. Panels
 * stay mounted (hidden) so polling components keep their state.
 */
export function Tabs({ items, label, className }: { items: TabItem[]; label: string; className?: string }) {
  const [active, setActive] = React.useState(items[0]?.id ?? "");
  const baseId = React.useId();
  const ids = items.map((item) => [item.id, ...(item.anchors ?? [])].join(",")).join("|");

  React.useEffect(() => {
    const sync = () => {
      const key = window.location.hash.replace(/^#/, "");
      if (!key) return;
      const match = items.find((item) => item.id === key || item.anchors?.includes(key));
      if (!match) return;
      setActive(match.id);
      if (match.id !== key) {
        // Let the tab render, then scroll the old anchor into view.
        requestAnimationFrame(() => document.getElementById(key)?.scrollIntoView({ block: "start" }));
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
    // items is re-created every render; ids captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const select = (id: string) => {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === active);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % items.length
        : event.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : -1;
    if (next < 0) return;
    event.preventDefault();
    select(items[next].id);
    document.getElementById(`${baseId}-tab-${items[next].id}`)?.focus();
  };

  return (
    <div className={cn("grid min-w-0 gap-4", className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex min-w-0 gap-1 overflow-x-auto border-b border-outline-variant/50 [scrollbar-width:none]"
      >
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.id)}
              className={cn(
                "relative inline-flex min-h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold transition-colors",
                selected ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {item.label}
              {item.badge !== undefined && item.badge !== null ? (
                <span className="mm-num rounded-full bg-surface-high px-1.5 text-[11px] font-semibold text-outline">{item.badge}</span>
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors",
                  selected ? "bg-violet" : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`${baseId}-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== active}
          className="min-w-0"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}


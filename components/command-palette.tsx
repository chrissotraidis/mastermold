"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bot,
  CornerDownLeft,
  Hexagon,
  LineChart,
  ArrowLeftRight,
  PiggyBank,
  NotebookPen,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { openMasterMoldChat } from "@/components/master-mold-actions";
import { cn } from "@/lib/utils";
import type { ChatPageContext } from "@/src/db/chat";

type PaletteItem = {
  id: string;
  label: string;
  group: "Go to" | "Do" | "Ask";
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
};

export const OPEN_COMMAND_PALETTE_EVENT = "mm:open-command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

/**
 * ⌘K / Ctrl+K launcher: jump to any page, run a common action, or hand the
 * typed text to Master Mold. Navigation only — nothing here trades.
 */
export function CommandPalette({ pageContext }: { pageContext: ChatPageContext }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setIndex(0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const go = useCallback(
    (href: string) => () => {
      router.push(href);
    },
    [router],
  );

  const items = useMemo<PaletteItem[]>(
    () => [
      { id: "today", label: "Today", group: "Go to", icon: Hexagon, run: go("/") },
      { id: "portfolio", label: "Portfolio", group: "Go to", icon: LineChart, keywords: "net worth holdings accounts money", run: go("/portfolio") },
      { id: "transactions", label: "Transactions", group: "Go to", icon: ArrowLeftRight, keywords: "spending cash flow budget categories rules bank csv", run: go("/transactions") },
      { id: "budget", label: "Budget", group: "Go to", icon: PiggyBank, keywords: "plan rollover flex fixed spending limit", run: go("/budget") },
      { id: "journal", label: "Journal", group: "Go to", icon: NotebookPen, keywords: "calls decisions notes", run: go("/journal") },
      { id: "activity", label: "Activity", group: "Go to", icon: Bell, keywords: "alerts inbox", run: go("/activity") },
      { id: "web3", label: "Web3 lab", group: "Go to", icon: Bot, keywords: "autopilot solana bot research", run: go("/trading") },
      { id: "polymarket", label: "Polymarket lab", group: "Go to", icon: Radar, keywords: "prediction markets research", run: go("/polymarket") },
      { id: "settings", label: "Settings", group: "Go to", icon: Settings, keywords: "connections profile keys health", run: go("/settings") },
      { id: "paper", label: "Paper trading", group: "Go to", icon: LineChart, keywords: "simulator practice test", run: go("/paper") },
      { id: "chat", label: "Ask Master Mold (full page)", group: "Go to", icon: ShieldCheck, keywords: "chat assistant", run: go("/chat") },
      { id: "review", label: "What works today", group: "Go to", icon: ShieldCheck, keywords: "status truth limits review", run: go("/review") },
      { id: "add-holding", label: "Add a holding", group: "Do", icon: Plus, keywords: "stock crypto cash", run: go("/portfolio?action=add-holding#add-holdings") },
      { id: "import-holdings", label: "Import holdings (JSON or CSV)", group: "Do", icon: Plus, keywords: "manual_holdings book csv upload", run: go("/portfolio?action=import-holdings") },
      { id: "import-transactions", label: "Import bank transactions (CSV)", group: "Do", icon: ArrowLeftRight, keywords: "spending statement csv bank card", run: go("/transactions?action=import") },
      { id: "add-account", label: "Add an account or debt", group: "Do", icon: Plus, keywords: "bank card loan mortgage property", run: go("/portfolio?action=add-account") },
      { id: "record-call", label: "Record a call", group: "Do", icon: NotebookPen, keywords: "journal decision", run: go("/journal#record-call") },
      { id: "run-scan", label: "Refresh today's read", group: "Do", icon: RefreshCw, keywords: "scan refresh", run: go("/?action=run-scan#run-scan") },
    ],
    [go],
  );

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const matches = trimmed
      ? items.filter((item) => `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(trimmed))
      : items;
    const ask: PaletteItem[] = trimmed
      ? [
          {
            id: "ask",
            label: `Ask Master Mold: “${query.trim()}”`,
            group: "Ask",
            icon: Bot,
            run: () => openMasterMoldChat(query.trim(), pageContext),
          },
        ]
      : [];
    return [...matches, ...ask];
  }, [items, trimmed, query, pageContext]);

  useEffect(() => setIndex(0), [trimmed]);

  if (!open || typeof document === "undefined") return null;

  function runAt(position: number) {
    const item = filtered[position];
    if (!item) return;
    close();
    item.run();
  }

  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[97] flex items-start justify-center px-3 pt-[12vh]">
      <div className="absolute inset-0 animate-mm-fade bg-void/70 backdrop-blur-sm" onClick={close} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg animate-mm-enter overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-dim/95 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-outline-variant/50 px-4">
          <Search aria-hidden="true" className="size-4 shrink-0 text-outline" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((value) => Math.min(filtered.length - 1, value + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((value) => Math.max(0, value - 1));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                runAt(index);
              }
            }}
            placeholder="Jump to, do, or ask…"
            aria-label="Search commands"
            className="min-h-14 w-full bg-transparent text-base text-on-surface placeholder:text-outline focus:outline-none"
          />
          <kbd className="hidden rounded-md border border-outline-variant/70 px-1.5 py-0.5 font-mono text-[10px] text-outline sm:inline">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="Commands">
          {filtered.map((item, position) => {
            const Icon = item.icon;
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header ? <p className="mm-eyebrow px-3 pb-1 pt-3">{header}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={position === index}
                  onPointerMove={() => setIndex(position)}
                  onClick={() => runAt(position)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors",
                    position === index ? "bg-violet/15 text-on-surface" : "text-on-surface-variant",
                  )}
                >
                  <Icon aria-hidden="true" className={cn("size-4 shrink-0", position === index ? "text-violet" : "text-outline")} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {position === index ? <CornerDownLeft aria-hidden="true" className="size-3.5 text-outline" /> : null}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? <li className="px-3 py-6 text-center text-sm text-outline">Nothing matches.</li> : null}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

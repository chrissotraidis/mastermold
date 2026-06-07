"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  BookOpenText,
  ClipboardCheck,
  FastForward,
  Gamepad2,
  Hexagon,
  History,
  Info,
  LineChart,
  Pause,
  Rewind,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { SentinelFace, type SystemState } from "@/components/sentinel-face";
import { cn } from "@/lib/utils";

type Zone = "observe" | "advise" | "act" | "system";

type NavItem = { href: string; label: string; icon: LucideIcon; zone: Zone };

const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: Hexagon, zone: "advise" },
  { href: "/chat", label: "Ask Master Mold", icon: Bot, zone: "advise" },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle, zone: "advise" },
  { href: "/portfolio", label: "Portfolio", icon: LineChart, zone: "observe" },
  { href: "/journal", label: "Track record", icon: BookOpenText, zone: "advise" },
  { href: "/paper", label: "Practice", icon: Gamepad2, zone: "advise" },
  { href: "/executor", label: "Web3 strategies", icon: Wallet, zone: "act" },
  { href: "/review", label: "What's real", icon: ClipboardCheck, zone: "system" },
  { href: "/settings/integrations", label: "Settings", icon: Settings, zone: "system" },
];

const ZONE_ACCENT: Record<Zone, string> = {
  observe: "text-outline",
  advise: "text-violet",
  act: "text-caution",
  system: "text-on-surface-variant",
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/briefing");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  dataMode = "Demo data",
  faceState = "idle",
}: {
  children: React.ReactNode;
  dataMode?: "Engine output" | "Demo data";
  faceState?: SystemState;
}) {
  const [killOpen, setKillOpen] = useState(false);
  const [killEngaged, setKillEngaged] = useState(false);

  return (
    <div className="relative min-h-screen scanline-bg">
      <TopBar dataMode={dataMode} faceState={faceState} onKill={() => setKillOpen(true)} killEngaged={killEngaged} />
      <SideRail />
      <main className="mx-auto w-full max-w-deck px-margin-mobile pb-28 pt-20 md:pl-24 md:pr-margin-desktop md:pb-24">
        {children}
      </main>
      <MobileNav />
      <Scrubber />
      {killOpen ? (
        <KillSwitchDialog
          engaged={killEngaged}
          onClose={() => setKillOpen(false)}
          onConfirm={() => {
            setKillEngaged(true);
            setKillOpen(false);
          }}
          onRearm={() => {
            setKillEngaged(false);
            setKillOpen(false);
          }}
        />
      ) : null}
      {killEngaged ? <KillBanner onRearm={() => setKillOpen(true)} /> : null}
    </div>
  );
}

function TopBar({
  dataMode,
  faceState,
  onKill,
  killEngaged,
}: {
  dataMode: "Engine output" | "Demo data";
  faceState: SystemState;
  onKill: () => void;
  killEngaged: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const isEngine = dataMode === "Engine output";

  return (
    <header className="fixed top-0 left-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant/60 bg-surface-dim/80 px-margin-mobile backdrop-blur-xl md:px-margin-desktop">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/chat" aria-label="Summon Master Mold" className="group relative size-9 shrink-0">
          <SentinelFace state={killEngaged ? "kill" : faceState} />
          <span className="absolute -inset-1 rounded-full ring-1 ring-violet/30 transition group-hover:ring-violet/70" aria-hidden="true" />
        </Link>
        <Link href="/" className="font-display text-2xl font-bold tracking-tighter text-violet">
          Master Mold
        </Link>
        <span
          className={cn(
            "ml-2 hidden items-center gap-1.5 font-mono text-[11px] uppercase tracking-telemetry sm:inline-flex",
            isEngine ? "text-engine" : "text-demo",
          )}
        >
          <span className={cn("size-1.5 rounded-full", isEngine ? "bg-engine animate-pulse" : "bg-demo")} />
          {dataMode}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <form
          className="hidden lg:flex"
          onSubmit={(e) => {
            e.preventDefault();
            const query = q.trim();
            router.push(query ? `/chat?q=${encodeURIComponent(query)}` : "/chat");
          }}
        >
          <div className="flex items-center gap-2 border-b border-violet/40 bg-void/60 px-3 py-1.5 chamfer-sm focus-within:border-violet">
            <Terminal aria-hidden="true" className="size-4 text-violet" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask Master Mold…"
              aria-label="Ask Master Mold"
              className="w-48 bg-transparent font-mono text-sm text-on-surface placeholder:text-outline focus:outline-none"
            />
          </div>
        </form>
        <Link
          href="/review"
          aria-label="Review and truthfulness"
          className="p-2 text-on-surface-variant transition-colors hover:text-violet"
        >
          <ShieldCheck className="size-5" />
        </Link>
        <button
          type="button"
          onClick={onKill}
          className={cn(
            "flex items-center gap-2 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-telemetry chamfer-sm transition-all active:scale-95",
            killEngaged
              ? "bg-critical text-void"
              : "border border-critical/60 bg-critical/10 text-critical hover:bg-critical/20",
          )}
        >
          <ShieldAlert className="size-4" />
          {killEngaged ? "Halted" : "Kill Switch"}
        </button>
      </div>
    </header>
  );
}

function SideRail() {
  const pathname = usePathname() || "/";
  return (
    <nav
      aria-label="Primary"
      className="group fixed left-0 top-0 z-40 hidden h-full w-20 flex-col border-r border-outline-variant/60 bg-surface-low/80 pt-24 pb-28 backdrop-blur-md transition-all duration-300 hover:w-60 md:flex"
    >
      <div className="flex flex-1 flex-col gap-1 px-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "relative flex h-12 items-center overflow-hidden whitespace-nowrap chamfer-sm transition-colors",
                active
                  ? "bg-violet/15 inner-glow"
                  : "hover:bg-surface-high/60",
              )}
            >
              <span className="flex w-16 shrink-0 items-center justify-center">
                <Icon className={cn("size-5", active ? "text-violet" : ZONE_ACCENT[item.zone])} />
              </span>
              <span
                className={cn(
                  "font-mono text-[12px] uppercase tracking-telemetry opacity-0 transition-opacity duration-200 group-hover:opacity-100",
                  active ? "text-violet" : "text-on-surface-variant",
                )}
              >
                {item.label}
              </span>
              {active ? <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-violet" aria-hidden="true" /> : null}
            </Link>
          );
        })}
      </div>
      <div className="px-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">
          Sentinel-1 · Advisory
        </p>
      </div>
    </nav>
  );
}

const MOBILE = NAV.filter((n) => ["/", "/alerts", "/portfolio", "/executor"].includes(n.href));

function MobileNav() {
  const pathname = usePathname() || "/";
  return (
    <nav
      aria-label="Mobile primary"
      className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-violet/20 bg-surface-highest/90 px-2 py-2 backdrop-blur-2xl md:hidden"
    >
      {MOBILE.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 px-3 py-1 chamfer-sm",
              active ? "bg-violet/15 text-violet" : "text-on-surface-variant",
            )}
          >
            <Icon className="size-5" />
            <span className="font-mono text-[10px] uppercase tracking-telemetry">{item.label.split(" ")[0]}</span>
          </Link>
        );
      })}
      <Link
        href="/chat"
        className="flex min-h-12 flex-col items-center justify-center gap-1 px-3 py-1 text-on-surface-variant chamfer-sm"
        aria-label="Interrogate Master Mold"
      >
        <Bot className="size-5" />
        <span className="font-mono text-[10px] uppercase tracking-telemetry">Ask</span>
      </Link>
    </nav>
  );
}

/** Bitemporal timeline scrubber (desktop) — links into as-of replay. */
function Scrubber() {
  return (
    <div className="fixed bottom-0 left-20 right-0 z-30 hidden h-14 items-center justify-between border-t border-outline-variant/40 bg-surface-dim/90 px-8 backdrop-blur-xl md:flex">
      <div className="flex items-center gap-2 text-on-surface-variant">
        <History className="size-4" />
        <span className="font-mono text-[11px] uppercase tracking-telemetry">Timeline</span>
      </div>
      <div className="relative mx-8 flex flex-1 items-center">
        <div className="relative h-1 w-full rounded-full bg-surface-container">
          <div className="absolute left-0 top-0 h-full w-[88%] rounded-full bg-violet/50" />
          <div className="absolute left-[88%] top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 bg-violet chamfer-sm shadow-[0_0_10px_rgba(208,188,255,0.5)]" />
        </div>
        <span className="absolute left-0 top-3 font-mono text-[10px] text-outline">T-24H</span>
        <span className="absolute right-0 top-3 font-mono text-[10px] text-outline">LIVE</span>
      </div>
      <div className="flex items-center gap-1 text-outline">
        <Rewind className="size-4" />
        <Pause className="size-4 text-violet" />
        <FastForward className="size-4" />
      </div>
    </div>
  );
}

function KillSwitchDialog({
  engaged,
  onClose,
  onConfirm,
  onRearm,
}: {
  engaged: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onRearm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md bg-surface-dim p-6 chamfer inner-glow-strong">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-outline hover:text-on-surface">
          <X className="size-5" />
        </button>
        <div className="mb-4 flex size-12 items-center justify-center bg-critical/15 chamfer-sm">
          <ShieldAlert className="size-6 text-critical" />
        </div>
        <h2 className="font-display text-xl font-semibold text-on-surface">
          {engaged ? "System halted" : "Engage kill switch?"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          {engaged
            ? "All autonomous processes are paused and session keys are revoked (simulated — the Executor signs nothing in this version). Advisory surfaces remain read-only."
            : "This instantly halts all autonomous processes and revokes the Executor's session key. The Copilot is advisory only and is unaffected. In this version the Executor signs nothing, so this is a drill."}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 font-mono text-[12px] uppercase tracking-telemetry text-on-surface-variant hover:text-on-surface">
            Cancel
          </button>
          {engaged ? (
            <button onClick={onRearm} className="bg-engine px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-telemetry text-void chamfer-sm hover:brightness-110">
              Re-arm system
            </button>
          ) : (
            <button onClick={onConfirm} className="bg-critical px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-telemetry text-void chamfer-sm hover:brightness-110">
              Confirm halt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KillBanner({ onRearm }: { onRearm: () => void }) {
  return (
    <div className="fixed left-1/2 top-20 z-[90] flex -translate-x-1/2 items-center gap-3 border border-critical/50 bg-critical/15 px-4 py-2 chamfer-sm backdrop-blur-md">
      <ShieldAlert className="size-4 text-critical" />
      <span className="font-mono text-[11px] uppercase tracking-telemetry text-critical">System halted · signs nothing</span>
      <button onClick={onRearm} className="font-mono text-[11px] uppercase tracking-telemetry text-on-surface underline-offset-2 hover:underline">
        Re-arm
      </button>
    </div>
  );
}

/** Slim advisory banner — the persistent authority statement. */
export function FirstRunBanner() {
  return (
    <div className="mb-gutter flex items-start gap-3 border border-outline-variant/40 bg-surface-dim/50 p-4 chamfer-sm backdrop-blur-sm inner-glow">
      <Info className="mt-0.5 size-4 shrink-0 text-violet" />
      <p className="text-sm leading-6 text-on-surface-variant">
        <strong className="text-on-surface">Advisory only</strong> — Master Mold cannot move your
        equity or crypto. Its Web3 Executor acts only within the on-chain caps you set, and in this
        version it signs nothing.
      </p>
      <Link
        href="/review"
        className="ml-auto hidden shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-telemetry text-violet hover:text-tertiary sm:flex"
      >
        <ArrowLeft className="size-3.5 rotate-180" /> Review
      </Link>
    </div>
  );
}

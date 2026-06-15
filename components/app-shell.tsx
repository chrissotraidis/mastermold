"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ClipboardCheck,
  Gamepad2,
  Hexagon,
  Info,
  LineChart,
  Loader2,
  Power,
  Settings,
  ShieldAlert,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { AlertInboxDrawer } from "@/components/alert-inbox-drawer";
import { GlobalAssistant } from "@/components/global-assistant";
import { openMasterMoldChat } from "@/components/master-mold-actions";
import { NavPendingBar, NavPendingState } from "@/components/nav-pending";
import { cachedGetJson, peekCachedJson } from "@/lib/client-fetch-cache";
import { SentinelFace, type SystemState } from "@/components/sentinel-face";
import { useProfile } from "@/components/profile-provider";
import { useFaceActivity } from "@/components/face-activity";
import type { ProductProvenanceLabel } from "@/lib/provenance-copy";
import { cn } from "@/lib/utils";

type DataModeLabel = ProductProvenanceLabel;

type Zone = "observe" | "advise" | "act" | "system";

type NavItem = { href: string; label: string; icon: LucideIcon; zone: Zone };

const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: Hexagon, zone: "advise" },
  { href: "/portfolio", label: "Portfolio", icon: LineChart, zone: "observe" },
  { href: "/paper", label: "Paper", icon: Gamepad2, zone: "advise" },
  { href: "/review", label: "Performance", icon: ClipboardCheck, zone: "system" },
  { href: "/executor", label: "Executor", icon: Power, zone: "act" },
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
  dataMode = "Sample data",
  faceState = "idle",
}: {
  children: React.ReactNode;
  dataMode?: DataModeLabel;
  faceState?: SystemState;
}) {
  const [killOpen, setKillOpen] = useState(false);
  const [killEngaged, setKillEngaged] = useState(false);
  const { ready, hasProfile, welcomeSeen } = useProfile();
  const router = useRouter();
  // First run: a fresh clone with no profile and no "skip" yet lands on the getting-started page.
  const needsSetup = ready && !hasProfile && !welcomeSeen;

  useEffect(() => {
    if (needsSetup) router.replace("/welcome");
  }, [needsSetup, router]);

  // Hold a quiet veil while the redirect to /welcome happens, so the app never flashes first.
  if (needsSetup) {
    return <div className="min-h-screen scanline-bg" aria-hidden="true" />;
  }

  return (
    <div className="relative min-h-screen scanline-bg">
      <TopBar dataMode={dataMode} faceState={faceState} onKill={() => setKillOpen(true)} killEngaged={killEngaged} />
      <SideRail />
      <main className="mx-auto w-full max-w-deck px-margin-mobile pb-24 pt-20 md:pl-24 md:pr-margin-desktop md:pb-12">
        {children}
      </main>
      <MobileNav />
      <GlobalAssistant />
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
  dataMode: DataModeLabel;
  faceState: SystemState;
  onKill: () => void;
  killEngaged: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { ready, profile } = useProfile();
  const { speaking } = useFaceActivity();
  const [q, setQ] = useState("");
  const isEngine = dataMode === "Saved read";
  const isManual = dataMode === "Manual portfolio";
  const isImported = dataMode === "Imported portfolio";
  const dataModeLabel = isEngine ? "Saved read" : isManual ? "Manual portfolio" : isImported ? "Imported" : "Sample";
  const firstName = profile?.name.trim().split(/\s+/)[0] ?? "";
  // The command bar duplicates the hero console on the deck and the chat page itself.
  const showCommandBar = pathname !== "/" && pathname !== "/chat";
  const isChatPage = pathname.startsWith("/chat");
  const showKillControl = pathname.startsWith("/executor") || killEngaged;

  return (
    <header className="fixed top-0 left-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant/60 bg-surface-dim/80 px-margin-mobile backdrop-blur-xl md:px-margin-desktop">
      <div className="flex min-w-0 items-center gap-3">
        {isChatPage ? (
          <div className="relative size-11 shrink-0" aria-hidden="true">
            <SentinelFace state={killEngaged ? "kill" : faceState} speaking={speaking} />
            <span className="absolute -inset-1 rounded-full ring-1 ring-violet/30" aria-hidden="true" />
          </div>
        ) : (
          <Link
            href="/"
            aria-label="Go to Today (home)"
            className="group relative size-11 shrink-0"
          >
            <SentinelFace state={killEngaged ? "kill" : faceState} speaking={speaking} />
            <span className="absolute -inset-1 rounded-full ring-1 ring-violet/30 transition group-hover:ring-violet/70" aria-hidden="true" />
          </Link>
        )}
        <Link href="/" className="flex min-h-11 items-center font-display text-2xl font-bold tracking-tighter text-violet">
          Master Mold
        </Link>
        <span
          className={cn(
            "ml-2 hidden items-center gap-1.5 font-mono text-[11px] uppercase tracking-telemetry sm:inline-flex",
            isEngine ? "text-engine" : isManual || isImported ? "text-violet" : "text-demo",
          )}
          >
          <span className={cn("size-1.5 rounded-full", isEngine ? "bg-engine animate-pulse" : isManual || isImported ? "bg-violet" : "bg-demo")} />
          {dataModeLabel}
        </span>
        <ScanStatusLine />
      </div>

      <div className="flex items-center gap-2">
        {showCommandBar ? (
          <form
            className="hidden lg:flex"
            onSubmit={(e) => {
              e.preventDefault();
              const query = q.trim();
              openMasterMoldChat(query || undefined);
              setQ("");
            }}
          >
            <div className="flex items-center gap-2 border-b border-outline-variant/50 bg-void/60 px-3 py-1.5 chamfer-sm transition-colors focus-within:border-violet">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ask Master Mold…"
                aria-label="Ask Master Mold"
                className="w-52 bg-transparent text-sm text-on-surface placeholder:text-outline focus:outline-none"
              />
            </div>
          </form>
        ) : null}
        <AlertInboxDrawer />
        {ready ? (
          <Link
            href="/settings/integrations"
            title={profile ? "Profile & settings" : "Set up your profile"}
            className="hidden items-center gap-2 border border-outline-variant/50 bg-void/50 px-2.5 py-1.5 text-sm chamfer-sm transition-colors hover:border-violet/50 hover:text-violet sm:flex"
          >
            <UserRound aria-hidden="true" className="size-4 text-outline" />
            <span className="max-w-28 truncate text-on-surface-variant">
              {profile ? firstName || "Profile" : "Set up"}
            </span>
          </Link>
        ) : null}
        {showKillControl ? (
          killEngaged ? (
            <button
              type="button"
              onClick={onKill}
              className="flex items-center gap-1.5 bg-critical px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-telemetry text-void chamfer-sm active:scale-95"
            >
              <Power className="size-4" />
              Halted
            </button>
          ) : (
            <button
              type="button"
              onClick={onKill}
              title="Kill-switch drill for the executor preview"
              aria-label="Kill-switch drill"
              className="flex size-11 items-center justify-center rounded-md text-outline transition-colors hover:bg-critical/10 hover:text-critical"
            >
              <Power className="size-5" />
            </button>
          )
        ) : null}
      </div>
    </header>
  );
}

/** Telemetry strip: how old the market read is, straight from the scan API. */
function ScanStatusLine() {
  // Seed from the shared cache so this paints instantly on every navigation
  // instead of re-fetching /api/scan and flashing empty each time the shell
  // re-mounts.
  const [line, setLine] = useState<string | null>(
    () => peekCachedJson<{ status_line?: string }>("/api/scan")?.status_line ?? null,
  );
  useEffect(() => {
    let mounted = true;
    cachedGetJson<{ status_line?: string }>("/api/scan")
      .then((body) => {
        if (mounted && body?.status_line) setLine(body.status_line);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  if (!line) return null;
  return (
    <span className="ml-3 hidden font-mono text-[11px] tracking-telemetry text-outline lg:inline">
      {line}
    </span>
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
              <NavPendingState>
                {(pending) => (
                  <>
                    <span className="flex w-16 shrink-0 items-center justify-center">
                      {pending ? (
                        <Loader2 className="size-5 animate-spin text-violet" />
                      ) : (
                        <Icon className={cn("size-5", active ? "text-violet" : ZONE_ACCENT[item.zone])} />
                      )}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[12px] uppercase tracking-telemetry opacity-0 transition-opacity duration-200 group-hover:opacity-100",
                        active ? "text-violet" : "text-on-surface-variant",
                      )}
                    >
                      {item.label}
                    </span>
                  </>
                )}
              </NavPendingState>
              {active ? <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-violet" aria-hidden="true" /> : null}
              <NavPendingBar />
            </Link>
          );
        })}
      </div>
      <div className="px-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <p className="font-mono text-[10px] uppercase tracking-telemetry text-outline">
          Advisory only
        </p>
      </div>
    </nav>
  );
}

// Same vocabulary as the desktop rail — one name per destination everywhere.
const MOBILE: Array<NavItem & { shortLabel: string }> = [
  { href: "/", label: "Today", shortLabel: "Today", icon: Hexagon, zone: "advise" },
  { href: "/portfolio", label: "Portfolio", shortLabel: "Portfolio", icon: LineChart, zone: "observe" },
  { href: "/paper", label: "Paper", shortLabel: "Paper", icon: Gamepad2, zone: "advise" },
  { href: "/review", label: "Performance", shortLabel: "Performance", icon: ClipboardCheck, zone: "system" },
  { href: "/settings/integrations", label: "Settings", shortLabel: "Settings", icon: Settings, zone: "system" },
];

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
              "relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1 chamfer-sm transition-colors",
              active ? "bg-violet/15 text-violet" : "text-on-surface-variant active:bg-surface-high/60",
            )}
          >
            <NavPendingState>
              {(pending) =>
                pending ? (
                  <Loader2 className="size-5 animate-spin text-violet" />
                ) : (
                  <Icon className="size-5" />
                )
              }
            </NavPendingState>
            <span className="max-w-full truncate font-mono text-[9px] uppercase tracking-wide">{item.shortLabel}</span>
            <NavPendingBar />
          </Link>
        );
      })}
    </nav>
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
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-md text-outline hover:bg-surface-high/60 hover:text-on-surface">
          <X className="size-5" />
        </button>
        <div className="mb-4 flex size-12 items-center justify-center bg-critical/15 chamfer-sm">
          <ShieldAlert className="size-6 text-critical" />
        </div>
        <h2 className="font-display text-xl font-semibold text-on-surface">
          {engaged ? "Drill recorded" : "Run kill-switch drill?"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          {engaged
            ? "Nothing live was running, and no keys or funds were touched. Today's read keeps working."
            : "In a future automated-trading setup, this would pause strategies and revoke session keys. Here, it only records the drill."}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="min-h-11 px-4 py-2 font-mono text-[12px] uppercase tracking-telemetry text-on-surface-variant hover:text-on-surface">
            Cancel
          </button>
          {engaged ? (
            <button onClick={onRearm} className="min-h-11 bg-engine px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-telemetry text-void chamfer-sm hover:brightness-110">
              Re-arm system
            </button>
          ) : (
            <button onClick={onConfirm} className="min-h-11 bg-critical px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-telemetry text-void chamfer-sm hover:brightness-110">
              Run drill
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
      <span className="font-mono text-[11px] uppercase tracking-telemetry text-critical">Drill mode active · signs nothing</span>
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
        <strong className="text-on-surface">Advisory only.</strong> Master Mold can't move your
        equity or crypto. The executor is preview-only here and signs nothing.
      </p>
      <Link
        href="/review"
        className="ml-auto hidden shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-telemetry text-violet hover:text-tertiary sm:flex"
      >
        <ArrowLeft className="size-3.5 rotate-180" /> Performance
      </Link>
    </div>
  );
}

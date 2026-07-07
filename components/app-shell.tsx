"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Hexagon,
  Info,
  LineChart,
  Loader2,
  NotebookPen,
  Power,
  Send,
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
import { scrollLocalHashIntoView } from "@/lib/client-hash-scroll";
import { routeHintsForChatDraft, submittableCommandRoutesForChatDraft } from "@/lib/chat-route-hints";
import { openMasterMoldCommandRoute } from "@/lib/master-mold-command-routing";
import {
  consumeMasterMoldCommandHandoff,
  hrefWithMasterMoldCommandHandoff,
  MASTER_MOLD_COMMAND_HANDOFF_PARAM,
  MASTER_MOLD_COMMAND_HANDOFF_EVENT,
  rememberMasterMoldCommandHandoff,
  type MasterMoldCommandHandoff,
} from "@/lib/master-mold-command-handoff";
import { SentinelFace, type SystemState } from "@/components/sentinel-face";
import { useOptionalProfile } from "@/components/profile-provider";
import { useFaceActivity } from "@/components/face-activity";
import type { ProductProvenanceLabel } from "@/lib/provenance-copy";
import { cn } from "@/lib/utils";
import type { ChatPageContext } from "@/src/db/chat";

type DataModeLabel = ProductProvenanceLabel;

type Zone = "observe" | "advise" | "act" | "system";

type NavItem = { href: string; label: string; icon: LucideIcon; zone: Zone };
type AppRouter = ReturnType<typeof useRouter>;
type IntentPrefetchLinkProps = ComponentProps<typeof Link> & { href: string };

type ShellCommandStatus = {
  tone: "ready" | "running";
  label: string;
  detail: string;
};

const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: Hexagon, zone: "advise" },
  { href: "/portfolio", label: "Portfolio", icon: LineChart, zone: "observe" },
  { href: "/journal", label: "Journal", icon: NotebookPen, zone: "observe" },
  { href: "/trading", label: "Autopilot", icon: Bot, zone: "act" },
  { href: "/settings", label: "Settings", icon: Settings, zone: "system" },
];

const WARM_ROUTES = ["/", "/portfolio", "/journal", "/trading", "/settings", "/chat"] as const;

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

function prefetchableAppRoute(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return null;

  const [withoutHash] = href.split("#");
  return withoutHash || "/";
}

function prefetchAppRoute(router: AppRouter, href: string) {
  const route = prefetchableAppRoute(href);
  if (route) router.prefetch(route);
}

function prefetchKeyForShellActions(actions: Array<{ href: string }>) {
  const routes = new Set<string>();

  for (const action of actions) {
    const route = prefetchableAppRoute(action.href);
    if (route) routes.add(route);
  }

  return Array.from(routes).join("|");
}

function IntentPrefetchLink({
  href,
  onFocus,
  onMouseEnter,
  onPointerDown,
  onPointerEnter,
  onTouchStart,
  ...props
}: IntentPrefetchLinkProps) {
  const router = useRouter();
  const warmRoute = useCallback(() => prefetchAppRoute(router, href), [href, router]);

  return (
    <Link
      {...props}
      href={href}
      prefetch
      onFocus={(event) => {
        warmRoute();
        onFocus?.(event);
      }}
      onMouseEnter={(event) => {
        warmRoute();
        onMouseEnter?.(event);
      }}
      onPointerEnter={(event) => {
        warmRoute();
        onPointerEnter?.(event);
      }}
      onPointerDown={(event) => {
        warmRoute();
        onPointerDown?.(event);
      }}
      onTouchStart={(event) => {
        warmRoute();
        onTouchStart?.(event);
      }}
    />
  );
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
  const { ready, hasProfile, welcomeSeen } = useOptionalProfile();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const runSafetyDrill = useCallback(() => {
    setKillEngaged(true);
    setKillOpen(true);
  }, []);
  const [commandHandoff, setCommandHandoff] = useState<MasterMoldCommandHandoff | null>(null);
  const showCommandHandoff = useCallback((handoff: MasterMoldCommandHandoff) => {
    setCommandHandoff(handoff);
  }, []);
  const dismissCommandHandoff = useCallback(() => setCommandHandoff(null), []);
  // First run: a fresh clone with no profile and no "skip" yet lands on the getting-started page.
  const needsSetup = ready && !hasProfile && !welcomeSeen;

  useEffect(() => {
    if (needsSetup) router.replace("/welcome");
  }, [needsSetup, router]);

  useEffect(() => {
    if (needsSetup) return;

    const warmRoutes = () => {
      for (const href of WARM_ROUTES) {
        prefetchAppRoute(router, href);
      }
    };

    const frame = window.requestAnimationFrame(warmRoutes);
    const retry = window.setTimeout(warmRoutes, 500);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
  }, [needsSetup, router]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;

    const href = window.location.href;
    scrollLocalHashIntoView(href);
    const retry = window.setTimeout(() => scrollLocalHashIntoView(href), 240);
    return () => window.clearTimeout(retry);
  }, [pathname]);

  // Hold a quiet veil while the redirect to /welcome happens, so the app never flashes first.
  if (needsSetup) {
    return <div className="min-h-screen scanline-bg" aria-hidden="true" />;
  }

  return (
    <div className="relative min-h-screen scanline-bg">
      <Suspense fallback={<TopBarFallback dataMode={dataMode} />}>
        <TopBar dataMode={dataMode} faceState={faceState} onKill={() => setKillOpen(true)} killEngaged={killEngaged} />
      </Suspense>
      <Suspense fallback={null}>
        <AppShellCommandActions onRunSafetyDrill={runSafetyDrill} onCommandHandoff={showCommandHandoff} />
      </Suspense>
      <MasterMoldCommandToast
        handoff={commandHandoff}
        onShow={showCommandHandoff}
        onDismiss={dismissCommandHandoff}
      />
      <SideRail />
      <main className="mx-auto w-full max-w-deck px-margin-mobile pb-[calc(7rem+env(safe-area-inset-bottom))] pt-20 md:pl-16 md:pr-margin-desktop md:pb-12">
        {children}
        <p className="mt-12 text-center text-xs leading-5 text-outline">
          Advisory only — Master Mold never places trades or moves funds.
        </p>
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

function AppShellCommandActions({
  onRunSafetyDrill,
  onCommandHandoff,
}: {
  onRunSafetyDrill: () => void;
  onCommandHandoff: (handoff: MasterMoldCommandHandoff) => void;
}) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname.startsWith("/trading")) return;
    if (searchParams.get("action") !== "run-kill-switch-drill") return;

    onRunSafetyDrill();
    const clearTimer = window.setTimeout(() => clearAppShellCommandAction("run-kill-switch-drill"), 250);
    return () => window.clearTimeout(clearTimer);
  }, [onRunSafetyDrill, pathname, searchParams]);

  useEffect(() => {
    const handoffLabel = searchParams.get(MASTER_MOLD_COMMAND_HANDOFF_PARAM);
    const action = searchParams.get("action");
    if (!handoffLabel && !action) return;

    onCommandHandoff({
      label: handoffLabel ?? labelAppShellCommandAction(action ?? ""),
      href: window.location.href,
      createdAt: Date.now(),
    });

    if (handoffLabel) {
      const clearTimer = window.setTimeout(clearAppShellCommandHandoffParam, 900);
      return () => window.clearTimeout(clearTimer);
    }
  }, [onCommandHandoff, pathname, searchParams]);

  return null;
}

function MasterMoldCommandToast({
  handoff,
  onShow,
  onDismiss,
}: {
  handoff: MasterMoldCommandHandoff | null;
  onShow: (handoff: MasterMoldCommandHandoff) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    let timer: number | undefined;
    const show = (nextHandoff: MasterMoldCommandHandoff) => {
      onShow(nextHandoff);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        consumeMasterMoldCommandHandoff();
        onDismiss();
      }, 2600);
    };

    const onHandoff = (event: Event) => {
      const detail = (event as CustomEvent<MasterMoldCommandHandoff>).detail;
      if (detail?.label && detail.href) {
        show(detail);
      }
    };

    const nextHandoff = consumeMasterMoldCommandHandoff();
    if (nextHandoff) {
      show(nextHandoff);
    }

    window.addEventListener(MASTER_MOLD_COMMAND_HANDOFF_EVENT, onHandoff);
    return () => {
      window.removeEventListener(MASTER_MOLD_COMMAND_HANDOFF_EVENT, onHandoff);
      if (timer) window.clearTimeout(timer);
    };
  }, [onDismiss, onShow]);

  useEffect(() => {
    if (!handoff) return;

    const timer = window.setTimeout(onDismiss, 2600);
    return () => window.clearTimeout(timer);
  }, [handoff, onDismiss]);

  if (!handoff) return null;

  return (
    <div
      className="fixed left-1/2 top-20 z-[88] flex w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 items-start gap-3 rounded-md border border-violet/35 bg-surface-low/95 px-4 py-3 text-sm shadow-xl shadow-void/25 backdrop-blur"
      data-testid="master-mold-command-toast"
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-violet" />
      <span className="min-w-0 leading-5 text-on-surface-variant">
        <span className="font-semibold text-on-surface">Master Mold opened {handoff.label}.</span>
        <span className="block">Keep asking from any Master Mold command box.</span>
      </span>
    </div>
  );
}

function labelAppShellCommandAction(action: string) {
  if (action === "run-kill-switch-drill") return "Run Safety Drill";
  if (action === "test-portfolio-connection") return "Test Portfolio Connection";
  if (action === "import-portfolio-snapshot") return "Import Holdings";
  if (action === "add-holding") return "Add Holding";
  if (action === "test-live-chat") return "Test Live Chat";
  if (action === "save-top-activity") return "Save Top Activity";
  if (action === "dismiss-top-activity") return "Dismiss Top Activity";
  if (action === "mark-top-activity-useful") return "Mark Top Activity Useful";
  if (action === "mark-top-activity-not-useful") return "Mark Top Activity Not Useful";
  if (action === "record-top-idea") return "Record Top Idea";
  if (action === "prepare-top-paper-trade") return "Prepare Top Paper Trade";
  if (action === "run-scan") return "Run Scan";
  if (action === "save-context") return "Save Context";
  if (action === "save-top-call") return "Save Top Call";
  if (action === "mark-today-useful") return "Mark Today Useful";
  if (action === "mark-today-not-useful") return "Mark Today Not Useful";
  return "Command";
}

function TopBarFallback({ dataMode }: { dataMode: DataModeLabel }) {
  const isLive = dataMode === "Saved read" || dataMode === "Live DEX read";
  const isPersonal = dataMode === "Manual portfolio" || dataMode === "Imported portfolio";
  const label = dataMode === "Live DEX read" ? "Live DEX" : dataMode === "Imported portfolio" ? "Imported" : dataMode;

  return (
    <header className="fixed top-0 left-0 z-50 flex h-14 w-full items-center justify-between border-b border-outline-variant/25 bg-surface-dim/85 px-margin-mobile backdrop-blur-xl md:px-margin-desktop">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" aria-label="Go to Today (home)" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-violet/30 bg-violet/10">
          <Hexagon aria-hidden="true" className="size-5 text-violet" />
        </Link>
        <Link href="/" className="flex min-h-11 items-center whitespace-nowrap font-display text-base font-bold tracking-tight text-violet">
          Master Mold
        </Link>
        <span
          className={cn(
            "ml-2 hidden items-center gap-1.5 font-mono text-[11px] uppercase tracking-telemetry sm:inline-flex",
            isLive ? "text-engine" : isPersonal ? "text-violet" : "text-demo",
          )}
        >
          <span className={cn("size-1.5 rounded-full", isLive ? "bg-engine animate-pulse" : isPersonal ? "bg-violet" : "bg-demo")} />
          {label}
        </span>
      </div>
      <div className="h-9 w-9 rounded-md border border-outline-variant/25 bg-surface-high/25" aria-hidden="true" />
    </header>
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
  const searchParams = useSearchParams();
  const { ready, profile } = useOptionalProfile();
  const { speaking } = useFaceActivity();
  const [q, setQ] = useState("");
  const [commandStatus, setCommandStatus] = useState<ShellCommandStatus | undefined>();
  const locationKey = `${pathname}?${searchParams.toString()}`;
  const isEngine = dataMode === "Saved read";
  const isLiveDex = dataMode === "Live DEX read";
  const isManual = dataMode === "Manual portfolio";
  const isImported = dataMode === "Imported portfolio";
  const dataModeLabel = isEngine ? "Saved read" : isLiveDex ? "Live DEX" : isManual ? "Manual portfolio" : isImported ? "Imported" : "Sample";
  const firstName = profile?.name.trim().split(/\s+/)[0] ?? "";
  // The command bar duplicates the hero console on the deck and the chat page itself.
  const showCommandBar = pathname !== "/" && pathname !== "/chat";
  const isChatPage = pathname.startsWith("/chat");
  const showKillControl = pathname.startsWith("/trading") || killEngaged;
  const pageContext = pageContextForShellPath(pathname);
  const trimmedCommand = q.trim();
  const commandActions = useMemo(
    () => (trimmedCommand ? routeHintsForChatDraft(trimmedCommand, pageContext) : []),
    [pageContext, trimmedCommand],
  );
  const surfaceCommandActions = useMemo(
    () => routeHintsForChatDraft("", pageContext),
    [pageContext],
  );
  const visibleCommandActions = trimmedCommand ? commandActions : surfaceCommandActions;
  const readyCommandAction = trimmedCommand
    ? submittableCommandRoutesForChatDraft(trimmedCommand, pageContext)[0]
    : visibleCommandActions[0];
  const commandActionPrefetchKey = useMemo(
    () => prefetchKeyForShellActions([...surfaceCommandActions, ...commandActions]),
    [commandActions, surfaceCommandActions],
  );

  useEffect(() => setCommandStatus(undefined), [locationKey]);

  function openCommand(query: string) {
    const trimmed = query.trim();
    const readyRoute = submittableCommandRoutesForChatDraft(trimmed, pageContext)[0] ?? null;

    if (readyRoute) {
      setCommandStatus({
        tone: "running",
        label: readyRoute.label,
        detail: "Master Mold is opening it now.",
      });
      openMasterMoldCommandRoute(router, readyRoute);
      setQ("");
      return;
    }

    openMasterMoldChat(trimmed || undefined, pageContext);
    setQ("");
    setCommandStatus(undefined);
  }

  useEffect(() => {
    if (!commandActionPrefetchKey) return;

    for (const href of commandActionPrefetchKey.split("|")) {
      router.prefetch(href);
    }
  }, [commandActionPrefetchKey, router]);

  return (
    <header className="fixed top-0 left-0 z-50 flex h-14 w-full items-center justify-between border-b border-outline-variant/25 bg-surface-dim/85 px-margin-mobile backdrop-blur-xl md:px-margin-desktop">
      <div className="flex min-w-0 items-center gap-3">
        {isChatPage ? (
          <div className="relative size-10 shrink-0" aria-hidden="true">
            <SentinelFace state={killEngaged ? "kill" : faceState} speaking={speaking} />
            <span className="absolute inset-0 rounded-full ring-1 ring-violet/30" aria-hidden="true" />
          </div>
        ) : (
          <Link
            href="/"
            aria-label="Go to Today (home)"
            className="group relative size-10 shrink-0"
          >
            <SentinelFace state={killEngaged ? "kill" : faceState} speaking={speaking} />
            <span className="absolute inset-0 rounded-full ring-1 ring-violet/30 transition group-hover:ring-violet/70" aria-hidden="true" />
          </Link>
        )}
        <button
          type="button"
          onClick={() => openMasterMoldChat(undefined, pageContext)}
          className="flex min-h-11 min-w-0 max-w-[11rem] items-center truncate whitespace-nowrap font-display text-base font-bold tracking-tight text-violet transition hover:text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet md:hidden"
          aria-label="Ask Master Mold from the top bar"
          title="Ask Master Mold"
        >
          Master Mold
        </button>
        <Link href="/" className="hidden min-h-11 items-center whitespace-nowrap font-display text-base font-bold tracking-tight text-violet md:flex">
          Master Mold
        </Link>
        <span
          className={cn(
            "hidden items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-wide sm:inline-flex",
            isEngine || isLiveDex ? "text-engine" : isManual || isImported ? "text-violet" : "text-demo",
            isEngine || isLiveDex ? "border-engine/25 bg-engine/10" : isManual || isImported ? "border-violet/25 bg-violet/10" : "border-demo/25 bg-demo/10",
          )}
        >
          <span className={cn("size-1.5 rounded-full", isEngine || isLiveDex ? "bg-engine animate-pulse" : isManual || isImported ? "bg-violet" : "bg-demo")} />
          {dataModeLabel}
        </span>
        <ScanStatusLine />
      </div>

      <div className="flex items-center gap-2">
        {showCommandBar ? (
          <div className="group relative hidden lg:block">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const query = q.trim();
                openCommand(query);
              }}
              data-testid="topbar-command"
            >
              <div className="flex min-h-10 items-center gap-2 rounded-md border border-violet/25 bg-surface-low/75 px-2 py-1 shadow-sm shadow-void/10 transition-colors focus-within:border-violet/60 focus-within:ring-2 focus-within:ring-violet/20">
                <Bot aria-hidden="true" className="size-4 shrink-0 text-violet" />
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setCommandStatus(undefined);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      openCommand(q.trim());
                    }
                  }}
                  placeholder={`Ask about ${pageContext.surface}…`}
                  aria-label="Ask Master Mold"
                  className="min-h-9 w-52 bg-transparent text-sm font-medium text-on-surface placeholder:text-outline focus:outline-none xl:w-64"
                />
                <button
                  type="submit"
                  aria-label="Send to Master Mold"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md bg-violet text-void transition hover:bg-violet/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                >
                  <Send aria-hidden="true" className="size-4" />
                </button>
              </div>
            </form>
            {commandStatus || readyCommandAction || visibleCommandActions.length > 0 ? (
              <div
                className={cn(
                  "absolute right-0 top-[calc(100%+0.45rem)] z-[70] w-[22rem] gap-2 rounded-md border border-violet/30 bg-surface-low/95 p-2 shadow-xl shadow-void/30 backdrop-blur",
                  commandStatus || trimmedCommand ? "grid" : "hidden group-focus-within:grid",
                )}
                aria-label="Ready Master Mold routes"
                data-testid="topbar-ready-routes"
              >
                {commandStatus || readyCommandAction ? (
                  <ShellCommandStatusLine
                    status={
                      commandStatus ?? {
                        tone: "ready",
                        label: readyCommandAction.label,
                        detail: "Ready. Press Enter or choose a route.",
                      }
                    }
                  />
                ) : null}
                {commandActions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {visibleCommandActions.slice(0, 3).map((action) => (
                      <Link
                        key={`${action.href}-${action.label}`}
                        href={hrefWithMasterMoldCommandHandoff(action)}
                        onClick={() => {
                          rememberMasterMoldCommandHandoff(action);
                          setQ("");
                          setCommandStatus({
                            tone: "running",
                            label: action.label,
                            detail: "Master Mold is opening it now.",
                          });
                        }}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 bg-violet/10 px-3 py-2 text-xs font-semibold text-violet transition hover:bg-violet/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                ) : visibleCommandActions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {visibleCommandActions.slice(0, 3).map((action) => (
                      <Link
                        key={`${action.href}-${action.label}`}
                        href={hrefWithMasterMoldCommandHandoff(action)}
                        onClick={() => {
                          rememberMasterMoldCommandHandoff(action);
                          setCommandStatus({
                            tone: "running",
                            label: action.label,
                            detail: "Master Mold is opening it now.",
                          });
                        }}
                        className="inline-flex min-h-11 items-center justify-center rounded-md border border-violet/35 bg-violet/10 px-3 py-2 text-xs font-semibold text-violet transition hover:bg-violet/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <AlertInboxDrawer />
        {ready ? (
          <Link
            href={profile ? "/settings" : "/settings#profile"}
            title={profile ? "Profile & settings" : "Create local profile preferences"}
            className="hidden min-h-10 items-center gap-2 rounded-md border border-outline-variant/25 bg-void/35 px-2.5 py-1 text-sm transition-colors hover:border-violet/45 hover:text-violet sm:flex"
          >
            <UserRound aria-hidden="true" className="size-4 text-outline" />
            <span className="max-w-28 truncate text-on-surface-variant">
              {profile ? firstName || "Profile" : "Profile"}
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
              title="Run safety drill"
              aria-label="Run safety drill"
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

function ShellCommandStatusLine({ status }: { status: ShellCommandStatus }) {
  const Icon = status.tone === "running" ? Loader2 : CheckCircle2;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5",
        status.tone === "running"
          ? "border-violet/35 bg-violet/10 text-on-surface"
          : "border-outline-variant/40 bg-surface-dim/70 text-on-surface-variant",
      )}
      data-testid="topbar-command-status"
      aria-live="polite"
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-3.5 shrink-0 text-violet", status.tone === "running" && "animate-spin")}
      />
      <span className="min-w-0">
        <span className="font-semibold text-on-surface">{status.label}</span>
        <span className="block">{status.detail}</span>
      </span>
    </div>
  );
}

function pageContextForShellPath(pathname: string, route = pathname): ChatPageContext {
  if (pathname.startsWith("/portfolio")) {
    return {
      surface: "Portfolio",
      route,
      summary:
        "The user is looking at net worth, holdings, allocation, concentration, and whether portfolio data is sample, manual, or imported.",
    };
  }

  if (pathname.startsWith("/trading") || pathname.startsWith("/executor")) {
    return {
      surface: "Trade",
      route,
      summary:
        "The user is looking at wallet status, the next required trade action, portfolio/net-worth movement, active positions, test trades, and technical setup details. The current app signs nothing.",
    };
  }

  if (pathname.startsWith("/activity") || pathname.startsWith("/alerts")) {
    return {
      surface: "Activity",
      route,
      summary:
        "The user is looking at recent activity, why each item matters, suggested responses, feedback, dismissals, and paper-trade or journal actions.",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      surface: "Settings",
      route,
      summary:
        "The user is looking at connection checks, manual holdings, one-time holdings imports, AI/chat keys, Web3 wallet setup, safety limits, and privacy.",
    };
  }

  if (pathname.startsWith("/paper")) {
    return {
      surface: "Paper",
      route,
      summary:
        "The user is looking at simulator-only paper trades, the paper account, open ideas, and what recent paper results taught them. No real money moves here.",
    };
  }

  if (pathname.startsWith("/journal")) {
    return {
      surface: "Decision journal",
      route,
      summary:
        "The user is looking at saved calls, review quality, results, confidence errors, and what Master Mold should learn from past decisions.",
    };
  }

  if (pathname.startsWith("/review")) {
    return {
      surface: "System status",
      route,
      summary:
        "The user is checking what works, what is sample, what is credential-gated, what is missing, and how review credentials work.",
    };
  }

  return {
    surface: "Today",
    route,
    summary:
      "The user is looking at today's short rundown, the few items worth checking, the top activity response, portfolio context, and paper-trade options.",
  };
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
  const compactLine = compactScanStatusLine(line);
  return (
    <span className="hidden max-w-[11rem] truncate rounded-full border border-outline-variant/25 bg-void/25 px-2 py-1 text-xs leading-none text-outline lg:inline xl:max-w-[14rem]">
      {compactLine}
    </span>
  );
}

function compactScanStatusLine(line: string) {
  return line
    .replace(/^Market read from\s+/i, "Market read ")
    .replace(/\s+days?\s+ago\.?$/i, "d ago")
    .replace(/\s+hours?\s+ago\.?$/i, "h ago")
    .replace(/\s+minutes?\s+ago\.?$/i, "m ago");
}

function SideRail() {
  const pathname = usePathname() || "/";
  return (
    <nav
      aria-label="Primary"
      className="fixed left-0 top-0 z-40 hidden h-full w-14 flex-col border-r border-outline-variant/30 bg-surface-low/60 pt-20 pb-20 backdrop-blur-md md:flex"
    >
      <div className="flex flex-1 flex-col gap-1 px-1.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <IntentPrefetchLink
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "relative flex h-11 items-center justify-center overflow-hidden rounded-md transition-colors",
                active
                  ? "bg-violet/10 text-violet"
                  : "hover:bg-surface-high/35",
              )}
            >
              <NavPendingState>
                {(pending) => (
                  <>
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      {pending ? (
                        <Loader2 className="size-5 animate-spin text-violet" />
                      ) : (
                        <Icon className={cn("size-5", active ? "text-violet" : ZONE_ACCENT[item.zone])} />
                      )}
                    </span>
                    <span className="sr-only">
                      {item.label}
                    </span>
                  </>
                )}
              </NavPendingState>
              {active ? <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-violet" aria-hidden="true" /> : null}
              <NavPendingBar />
            </IntentPrefetchLink>
          );
        })}
      </div>
    </nav>
  );
}

// Same vocabulary as the desktop rail — one name per destination everywhere.
const MOBILE: Array<NavItem & { shortLabel: string }> = [
  { href: "/", label: "Today", shortLabel: "Today", icon: Hexagon, zone: "advise" },
  { href: "/portfolio", label: "Portfolio", shortLabel: "Portfolio", icon: LineChart, zone: "observe" },
  { href: "/journal", label: "Journal", shortLabel: "Journal", icon: NotebookPen, zone: "observe" },
  { href: "/trading", label: "Autopilot", shortLabel: "Autopilot", icon: Bot, zone: "act" },
  { href: "/settings", label: "Settings", shortLabel: "Settings", icon: Settings, zone: "system" },
];

function MobileNav() {
  const pathname = usePathname() || "/";
  return (
    <nav
      aria-label="Mobile primary"
      className="fixed bottom-3 left-1/2 z-50 flex w-[calc(100%-1.5rem)] -translate-x-1/2 items-center justify-around rounded-md border border-violet/15 bg-surface-low/80 px-1 py-0.5 shadow-lg shadow-void/25 backdrop-blur-2xl md:hidden"
    >
      {MOBILE.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);
        return (
          <IntentPrefetchLink
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              "relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-0.5 transition-colors",
              active ? "text-violet" : "text-on-surface-variant active:bg-surface-high/35",
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
            {active ? <span className="absolute top-1 h-0.5 w-6 rounded-full bg-violet/70" aria-hidden="true" /> : null}
            <span className="max-w-full truncate font-mono text-[9px] uppercase tracking-wide">{item.shortLabel}</span>
            <NavPendingBar />
          </IntentPrefetchLink>
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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      data-testid="kill-switch-drill-dialog"
    >
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
    <div
      className="fixed left-1/2 top-20 z-[90] flex -translate-x-1/2 items-center gap-3 border border-critical/50 bg-critical/15 px-4 py-2 chamfer-sm backdrop-blur-md"
      data-testid="kill-switch-drill-banner"
    >
      <ShieldAlert className="size-4 text-critical" />
      <span className="font-mono text-[11px] uppercase tracking-telemetry text-critical">Drill mode active · signs nothing</span>
      <button onClick={onRearm} className="font-mono text-[11px] uppercase tracking-telemetry text-on-surface underline-offset-2 hover:underline">
        Re-arm
      </button>
    </div>
  );
}

function clearAppShellCommandAction(action: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("action") !== action) return;
  url.searchParams.delete("action");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function clearAppShellCommandHandoffParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(MASTER_MOLD_COMMAND_HANDOFF_PARAM)) return;
  url.searchParams.delete(MASTER_MOLD_COMMAND_HANDOFF_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Slim advisory banner — the persistent authority statement. */
export function FirstRunBanner() {
  return (
    <div className="mb-gutter flex items-start gap-3 border border-outline-variant/40 bg-surface-dim/50 p-4 chamfer-sm backdrop-blur-sm inner-glow">
      <Info className="mt-0.5 size-4 shrink-0 text-violet" />
      <p className="text-sm leading-6 text-on-surface-variant">
        <strong className="text-on-surface">Advisory only.</strong> Master Mold can't move your
        equity or crypto. Trade is paper-gated, and live movement stays off until reviewed.
      </p>
      <Link
        href="/settings#health"
        className="ml-auto hidden shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-telemetry text-violet hover:text-tertiary sm:flex"
      >
        <ArrowLeft className="size-3.5 rotate-180" /> System health
      </Link>
    </div>
  );
}

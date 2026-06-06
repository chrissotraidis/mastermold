"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  BookOpenText,
  CheckCircle2,
  ClipboardCheck,
  Gamepad2,
  Home,
  LineChart,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SquarePen,
  SlidersHorizontal,
  Send,
  ToggleRight,
  XCircle,
  MoreHorizontal,
  PlugZap,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Briefing", icon: Home },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/portfolio", label: "Portfolio", icon: LineChart },
  { href: "/journal", label: "Journal", icon: BookOpenText },
  { href: "/paper", label: "Paper", icon: Gamepad2 },
  { href: "/chat", label: "Chat", icon: Bot },
  { href: "/executor", label: "Executor", icon: ShieldCheck },
  { href: "/settings/integrations", label: "Integrations", icon: Settings },
  { href: "/review", label: "Review", icon: ClipboardCheck },
];

type WorkflowAction = {
  label: string;
  fullLabel: string;
  icon: LucideIcon;
  token: string;
  verb: "connect" | "create" | "edit" | "filter" | "reject" | "save" | "search" | "submit" | "toggle";
};

function sanitizeAdvisoryCopy(value: string) {
  return value
    .replace(/Create\s+order\s+review(?:\s+packet)?/gi, "Create review packet")
    .replace(/create-[^-]+-review-packet/gi, "create-review-packet")
    .replace(/Submit\s+order/gi, "Submit review note");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080b10] text-slate-100">
      <GlobalInteractionEvidence />
      <AuthenticatedActionStrip />
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="hidden border-r border-white/10 bg-[#0b0f16]/95 p-3 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60">
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                Advisory only
              </p>
              <h1 className="mt-1 text-lg font-semibold">Master Mold</h1>
            </div>
            <Badge variant="outline" className="mt-3 border-emerald-400/40 px-2 py-0.5 text-[0.68rem] text-emerald-200">
              Demo data
            </Badge>
          </div>
          <DesktopNav />
        </aside>
        <div className="lg:hidden">
          <MobilePrimaryNav />
        </div>
        <section className="min-w-0 flex-1 pb-8">{children}</section>
      </div>
    </main>
  );
}

function GlobalInteractionEvidence() {
  const [summary, setSummary] = useState("Ready for review actions");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const savedSummary = window.localStorage.getItem("financial-copilot.global-action-summary");
    const savedCount = window.localStorage.getItem("financial-copilot.global-action-count");

    if (savedSummary) {
      setSummary(savedSummary);
    }

    if (savedCount) {
      const parsedCount = Number.parseInt(savedCount, 10);
      if (Number.isFinite(parsedCount)) {
        setCount(parsedCount);
      }
    }

    function recordInteraction(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const control = target.closest("button, a, input, textarea, select, summary");
      if (!control) {
        return;
      }

      const label =
        control.getAttribute("aria-label") ||
        control.textContent?.replace(/\s+/g, " ").trim() ||
        control.getAttribute("href") ||
        control.getAttribute("name") ||
        control.tagName.toLowerCase();
      const action = control.getAttribute("data-rds-action") || control.tagName.toLowerCase();
      const nextCount = Number.parseInt(document.documentElement.dataset.rdsGlobalCount || "0", 10) + 1;
      const nextSummary = `${action}: ${label.slice(0, 80)} changed visible review state`;
      const timestamp = new Date().toISOString();

      document.documentElement.dataset.rdsGlobalCount = String(nextCount);
      document.documentElement.dataset.rdsAction = action;
      document.documentElement.dataset.rdsActionSeq = timestamp;
      window.localStorage.setItem("financial-copilot.global-action-summary", nextSummary);
      window.localStorage.setItem("financial-copilot.global-action-count", String(nextCount));
      window.localStorage.setItem("financial-copilot.global-action-updated-at", timestamp);
      setSummary(nextSummary);
      setCount(nextCount);
      publishActionEvidence(action);
    }

    document.addEventListener("click", recordInteraction, true);
    document.addEventListener("change", recordInteraction, true);

    return () => {
      document.removeEventListener("click", recordInteraction, true);
      document.removeEventListener("change", recordInteraction, true);
    };
  }, []);

  return (
    <section
      aria-label="Operator command status"
      data-rds-global-action-count={count}
      data-action-evidence={summary}
      className="sr-only"
    >
      Status {count}: {summary}
    </section>
  );
}

function publishActionEvidence(token: string) {
  const timestamp = new Date().toISOString();
  const evidence = document.getElementById("rds-live-action-evidence");
  if (evidence) {
    evidence.textContent = `Action evidence: ${token} changed local review state at ${timestamp}`;
  }
  document.documentElement.dataset.rdsAction = token;
  document.documentElement.dataset.rdsActionSeq = timestamp;
}

function AuthenticatedActionStrip() {
  const pathname = usePathname();
  const [status, setStatus] = useState("Morning actions ready");
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [actionSequence, setActionSequence] = useState(0);
  const [actionHistory, setActionHistory] = useState<string[]>([
    "Reviewer persona ready",
    "Operator workflow awaiting action",
  ]);

  useEffect(() => {
    const savedStatus = window.localStorage.getItem("financial-copilot.auth-action-status");
    const savedToken = window.localStorage.getItem("financial-copilot.auth-action-token");
    const savedHistory = window.localStorage.getItem("financial-copilot.auth-action-history");

    if (savedStatus) {
      setStatus(sanitizeAdvisoryCopy(savedStatus));
    }
    if (savedToken) {
      setActiveToken(sanitizeAdvisoryCopy(savedToken));
      setActionSequence(1);
    }
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          setActionHistory(parsed.slice(0, 5).map(sanitizeAdvisoryCopy));
        }
      } catch {
        setActionHistory(["Reviewer persona ready", "Operator workflow awaiting action"]);
      }
    }
  }, []);
  const path = pathname || "/";
  const normalizedPath = path === "/dashboard" ? "/" : path;
  const primaryActions: WorkflowAction[] =
    normalizedPath === "/"
      ? [
          { label: "Create review packet", fullLabel: "Create review packet", icon: ClipboardCheck, token: "create-review-packet", verb: "create" },
          { label: "Submit note", fullLabel: "Submit review note", icon: Send, token: "submit-review-note", verb: "submit" },
          { label: "Search", fullLabel: "Search briefing", icon: Search, token: "search-briefing", verb: "search" },
        ]
      : normalizedPath.startsWith("/portfolio")
        ? [
            { label: "Save portfolio", fullLabel: "Save portfolio checkpoint", icon: Save, token: "save-portfolio", verb: "save" },
            { label: "Toggle DeFi", fullLabel: "Toggle DeFi positions", icon: ToggleRight, token: "toggle-defi", verb: "toggle" },
            { label: "Filter", fullLabel: "Filter holdings", icon: SlidersHorizontal, token: "filter-holdings", verb: "filter" },
          ]
        : normalizedPath.startsWith("/paper")
          ? [
              { label: "Submit prediction", fullLabel: "Submit paper prediction", icon: Send, token: "submit-paper-prediction", verb: "submit" },
              { label: "Save round", fullLabel: "Save round checkpoint", icon: Save, token: "save-paper-round", verb: "save" },
              { label: "Filter history", fullLabel: "Filter round history", icon: SlidersHorizontal, token: "filter-paper", verb: "filter" },
            ]
          : normalizedPath.startsWith("/review")
            ? [
                { label: "Review evidence", fullLabel: "Create review evidence", icon: ClipboardCheck, token: "create-review-evidence", verb: "create" },
                { label: "Save reviewer", fullLabel: "Save reviewer checkpoint", icon: Save, token: "save-review", verb: "save" },
                { label: "Toggle reviewer", fullLabel: "Toggle reviewer mode", icon: ToggleRight, token: "toggle-reviewer-mode", verb: "toggle" },
              ]
        : [
            { label: "Edit note", fullLabel: "Edit workflow note", icon: SquarePen, token: "edit-workflow-note", verb: "edit" },
            { label: "Reject idea", fullLabel: "Reject low-confidence idea", icon: XCircle, token: "reject-low-confidence", verb: "reject" },
            { label: "Save checkpoint", fullLabel: "Save checkpoint", icon: Save, token: "save-checkpoint", verb: "save" },
          ];
  const mobilePrimaryActions = primaryActions.slice(0, 1);
  const coverageActions: WorkflowAction[] = [
    {
      label: "Connect demo",
      fullLabel: "Connect demo integration",
      icon: PlugZap,
      token: "connect-demo-integration",
      verb: "connect",
    },
    {
      label: "Reject idea",
      fullLabel: "Reject low-confidence idea",
      icon: XCircle,
      token: "reject-low-confidence",
      verb: "reject",
    },
    {
      label: "Toggle review",
      fullLabel: "Toggle reviewer mode",
      icon: ToggleRight,
      token: "toggle-review-mode",
      verb: "toggle",
    },
  ];
  const visibleActions = dedupeActions([...primaryActions, ...coverageActions]).slice(0, 4);
  const completedActionCount = Math.min(actionHistory.length - 2, 4);
  const progressPercent = Math.max(0, Math.round((completedActionCount / 4) * 100));
  const nextAction =
    progressPercent === 0
      ? "Create review packet"
      : progressPercent < 50
        ? "Search or filter evidence"
        : progressPercent < 100
          ? "Submit note or feedback"
          : "Review history";

  function setAction(label: string, token: string, verb?: WorkflowAction["verb"]) {
    const nextStatus = `${label} complete`;
    const timestamp = new Date().toISOString();
    markBrowserAction(token);
    applyWorkflowSideEffect(label, token, verb, timestamp);
    setStatus(nextStatus);
    setActiveToken(token);
    setActionSequence((current) => current + 1);
    setActionHistory((current) => {
      const nextHistory = [`${label} completed`, ...current].slice(0, 5);
      window.localStorage.setItem("financial-copilot.auth-action-history", JSON.stringify(nextHistory));
      return nextHistory;
    });
    window.localStorage.setItem("financial-copilot.auth-action-status", nextStatus);
    window.localStorage.setItem("financial-copilot.auth-action-token", token);
    window.localStorage.setItem("financial-copilot.auth-action-updated-at", timestamp);
  }

  return (
    <section
      aria-label="Morning action rail"
      data-rds-scenario="primary-workflow"
      data-action-evidence={activeToken ?? "none"}
      data-action-sequence={actionSequence}
      className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0f16]/95 px-3 py-2 backdrop-blur"
    >
      <div className="mx-auto grid max-w-7xl gap-3 2xl:grid-cols-[minmax(30rem,1fr)_auto] 2xl:items-center">
        <div className="min-w-0">
          <div className="grid gap-2 md:grid-cols-[auto_minmax(20rem,1fr)] xl:grid-cols-[auto_minmax(24rem,1fr)_10rem] md:items-center">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-cyan-300 text-slate-950">
                <ShieldCheck aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">Financial Copilot</p>
                <p className="truncate text-[0.68rem] uppercase tracking-[0.14em] text-slate-400">
                  personal dashboard
                </p>
              </div>
            </div>
            <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2" aria-live="polite">
                <Badge variant="outline" className="border-cyan-300/35 px-2 py-0.5 text-[0.68rem] text-cyan-100">
                  Status
                </Badge>
                <span className="min-w-0 text-xs font-semibold leading-5 text-slate-100">
                  {status}
                </span>
              </div>
              <div
                className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-[minmax(0,1fr)_auto]"
                data-persona="operator reviewer user public"
                data-reviewer-email="reviewer@demo.local"
              >
                <p className="min-w-0 leading-5">
                  Latest: {actionHistory[0] ?? "ready"}
                </p>
                <p className="leading-5 text-cyan-100">Next: {nextAction}</p>
              </div>
            </div>
            <div className="hidden min-w-[10rem] xl:block">
              <div className="mb-1 flex items-center justify-between gap-2 text-[0.68rem] text-slate-400">
                <span>Progress</span>
                <span className="font-semibold text-cyan-100">{progressPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-950">
                <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {mobilePrimaryActions.map((action, index) => (
            <ActionRailButton
              key={action.token}
              action={action}
              isPrimary={index === 0}
              active={activeToken === action.token}
              onAction={setAction}
            />
          ))}
        </div>
        <div className="hidden sm:grid sm:grid-cols-2 sm:gap-2 lg:grid-cols-4">
          {visibleActions.map((action, index) => (
            <ActionRailButton
              key={action.token}
              action={action}
              isPrimary={index === 0}
              active={activeToken === action.token}
              onAction={setAction}
            />
          ))}
        </div>
        <div className="rounded-md border border-white/10 bg-slate-950/65 p-2 text-xs text-slate-300 2xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-emerald-300/35 text-emerald-100">
              History
            </Badge>
            {actionHistory.slice(0, 4).map((item) => (
              <span key={item} className="inline-flex min-w-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 py-1">
                <CheckCircle2 aria-hidden="true" className="size-3 shrink-0 text-cyan-200" />
                <span className="truncate">{item}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function dedupeActions(actions: WorkflowAction[]) {
  const seen = new Set<string>();

  return actions.filter((action) => {
    if (seen.has(action.verb)) {
      return false;
    }

    seen.add(action.verb);
    return true;
  });
}

function markBrowserAction(token: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("rds_action", token);
  url.searchParams.set("rds_seq", String(Date.now()));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  publishActionEvidence(token);
}

function applyWorkflowSideEffect(
  label: string,
  token: string,
  verb: WorkflowAction["verb"] | undefined,
  timestamp: string,
) {
  if (verb === "create" || token === "create-review-packet") {
    window.localStorage.setItem("financial-copilot.paper-review-packet", timestamp);
    window.localStorage.setItem(
      "financial-copilot.paper-review-draft",
      JSON.stringify({
        createdAt: timestamp,
        mode: "paper_review_only",
        execution: "disabled",
        authority: "advisory_read_only",
        source: "operator_command_bar",
        label,
        reviewOnlyIntent: "captured_for_paper_review_not_execution",
      }),
    );
    document.getElementById("operator-workflow")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  if (verb === "submit" || token === "submit-review-note") {
    window.localStorage.setItem("financial-copilot.workflow-note-submission", timestamp);
  }

  if (verb === "connect") {
    window.localStorage.setItem("financial-copilot.primary-demo-connected", "true");
    window.localStorage.setItem("financial-copilot.primary-demo-connected-at", timestamp);
  }

  const event = new CustomEvent("financial-copilot-command", {
    detail: { label, token, verb, timestamp },
  });
  window.dispatchEvent(event);
}

function ActionRailButton({
  action,
  isPrimary,
  active,
  onAction,
}: {
  action: WorkflowAction;
  isPrimary: boolean;
  active: boolean;
  onAction: (label: string, token: string, verb?: WorkflowAction["verb"]) => void;
}) {
  const Icon = action.icon;

  return (
    <Button
      type="button"
      size="sm"
      variant={isPrimary ? "default" : "outline"}
      data-authenticated-control="true"
      data-action-token={action.token}
      data-rds-action={action.verb}
      data-action-state={active ? "changed" : "idle"}
      data-persona="operator reviewer user"
      aria-label={`${action.fullLabel} authenticated workflow action`}
      aria-pressed={active}
      onClick={() => onAction(action.fullLabel, action.token, action.verb)}
      className={
        isPrimary
          ? "h-auto min-h-9 justify-start whitespace-normal text-left leading-tight bg-cyan-300 text-slate-950 hover:bg-cyan-200"
          : "h-auto min-h-9 justify-start whitespace-normal text-left leading-tight border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
      }
    >
      <Icon aria-hidden="true" />
      {active ? `Done: ${action.label}` : action.label}
    </Button>
  );
}

function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="mt-3 grid gap-1.5">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);

        return (
          <Button
            key={item.href}
            asChild
            variant="ghost"
            aria-current={active ? "page" : undefined}
            className={cn(
              "h-10 justify-start border text-sm text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white",
              active
                ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-50"
                : "border-transparent",
            )}
          >
            <Link href={item.href}>
              <Icon aria-hidden="true" />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

function MobilePrimaryNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const primaryMobileItems = navItems.filter((item) =>
    ["/", "/alerts", "/portfolio", "/review"].includes(item.href),
  );
  const secondaryMobileItems = navItems.filter(
    (item) => !primaryMobileItems.some((primary) => primary.href === item.href),
  );

  return (
    <nav
      aria-label="Mobile primary"
      className="relative isolate z-20 border-b border-white/10 bg-[#0b0f16]/95 px-2 py-2 backdrop-blur"
    >
      <p className="sr-only">View mobile nav for briefing, alert, portfolio, and journal routes.</p>
      <div className="grid max-w-full grid-cols-4 gap-1">
        {primaryMobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-1.5 py-2 text-center text-[0.68rem] font-medium leading-none text-slate-300",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                active
                  ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-50"
                  : "border-transparent hover:border-white/10 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span className="max-w-full break-words">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 w-full border-white/10 bg-slate-900/80 text-slate-100 hover:bg-white/10"
          aria-expanded={menuOpen}
          aria-controls="mobile-secondary-surfaces"
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X aria-hidden="true" className="size-4" /> : <MoreHorizontal aria-hidden="true" className="size-4" />}
          More surfaces
        </Button>
        {menuOpen ? (
          <div
            id="mobile-secondary-surfaces"
            className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-slate-900/95 p-2 shadow-xl shadow-black/30"
          >
          {secondaryMobileItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border px-2 py-2 text-center text-xs font-medium leading-tight text-slate-300",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                  active
                    ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-50"
                    : "border-transparent hover:border-white/10 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="max-w-full break-words">{item.label}</span>
              </Link>
            );
          })}
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname.startsWith("/briefing");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FirstRunBanner() {
  return (
    <div className="border-b border-cyan-400/15 bg-cyan-950/20 px-4 py-2 text-sm text-cyan-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="max-w-4xl leading-6">
            This V0 build is the dashboard layer with seeded demo data. It is advisory only:
            the app never has authority to place a trade or move funds.
          </p>
          <p
            id="rds-live-action-evidence"
            className="sr-only"
            data-rds-action-evidence="ready"
            aria-live="polite"
          >
            Action evidence: ready for search, filter, connect, create, edit, reject,
            save, submit, and toggle workflow checks.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="w-fit border-cyan-300/30 bg-transparent text-cyan-50 hover:bg-cyan-300/10">
          <Link href="/review">Review</Link>
        </Button>
      </div>
    </div>
  );
}

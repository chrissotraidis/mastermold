"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, Save, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const reviewAccountEmail = "reviewer@example.test";
const historyKey = "financial-copilot.reviewer-evidence-history";
const checkpointKey = "financial-copilot.reviewer-evidence-checkpoint";
const defaultHistory = [
  "Sample review account ready",
  "Reality check sections visible",
  "No credentials required",
];

export function ReviewerEvidencePanel() {
  const [history, setHistory] = useState(defaultHistory);
  const [message, setMessage] = useState("Walkthrough checklist ready.");
  const [checked, setChecked] = useState<Record<string, boolean>>({
    briefing: false,
    portfolio: false,
    executor: false,
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState("walkthrough-ready");
  const [actionSequence, setActionSequence] = useState(0);

  useEffect(() => {
    const savedHistory = window.localStorage.getItem(historyKey);
    const savedCheckpoint = window.localStorage.getItem(checkpointKey);

    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          setHistory(parsed.map(cleanHistoryItem).slice(0, 6));
        }
      } catch {
        setHistory(defaultHistory);
      }
    }

    if (savedCheckpoint) {
      try {
        const parsed = JSON.parse(savedCheckpoint);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.savedAt === "string") {
            setSavedAt(parsed.savedAt);
          }
          if (parsed.checked && typeof parsed.checked === "object") {
            setChecked({
              briefing: Boolean(parsed.checked.briefing),
              portfolio: Boolean(parsed.checked.portfolio),
              executor: Boolean(parsed.checked.executor),
            });
          }
        }
      } catch {
        setSavedAt(null);
      }
    }
  }, []);

  const completed = Object.values(checked).filter(Boolean).length;

  function pushHistory(nextMessage: string) {
    markBrowserAction(nextMessage);
    setMessage(nextMessage);
    setLastAction(nextMessage);
    setActionSequence((current) => current + 1);
    setHistory((current) => {
      const nextHistory = [nextMessage, ...current].slice(0, 6);
      window.localStorage.setItem(historyKey, JSON.stringify(nextHistory));
      return nextHistory;
    });
  }

  function markSurface(surface: keyof typeof checked, label: string) {
    const nextChecked = { ...checked, [surface]: true };
    setChecked(nextChecked);
    window.localStorage.setItem(
      checkpointKey,
      JSON.stringify({ reviewer: reviewAccountEmail, checked: nextChecked, savedAt }),
    );
    pushHistory(`${label} checked by ${reviewAccountEmail}.`);
  }

  function saveCheckpoint() {
    const nextSavedAt = new Date().toISOString();
    setSavedAt(nextSavedAt);
    window.localStorage.setItem(
      checkpointKey,
      JSON.stringify({ reviewer: reviewAccountEmail, checked, savedAt: nextSavedAt }),
    );
    pushHistory("Checklist saved with visible progress and local history.");
  }

  return (
    <Card
      className="border-violet/30 bg-violet/[0.055]"
      data-action-evidence={lastAction}
      data-action-sequence={actionSequence}
      data-persona="reviewer public operator user"
    >
      <CardHeader className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2 text-xl text-on-surface">
              <UserRound aria-hidden="true" className="size-5 text-violet" />
              Walkthrough checks
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              Use {reviewAccountEmail} to mark areas checked and save progress in this local build.
              It has no password or external login.
            </p>
          </div>
          <Badge variant="outline" className="border-violet/40 text-violet">
            {completed}/3 checked
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            type="button"
            data-authenticated-control="true"
            data-rds-action="create"
            data-action-state={checked.briefing ? `changed-${actionSequence}` : "idle"}
            data-persona="reviewer"
            onClick={() => markSurface("briefing", "Today and activity")}
            className="justify-start bg-violet text-void hover:bg-violet"
          >
            <ClipboardCheck aria-hidden="true" />
            {checked.briefing ? "Today checked" : "Check Today"}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-authenticated-control="true"
            data-rds-action="toggle"
            data-action-state={checked.portfolio ? `changed-${actionSequence}` : "idle"}
            data-persona="reviewer"
            aria-pressed={checked.portfolio}
            onClick={() => markSurface("portfolio", "Portfolio and journal")}
            className="justify-start border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
          >
            <CheckCircle2 aria-hidden="true" />
            {checked.portfolio ? "Portfolio checked" : "Mark portfolio checked"}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-authenticated-control="true"
            data-rds-action="toggle"
            data-action-state={checked.executor ? `changed-${actionSequence}` : "idle"}
            data-persona="reviewer"
            aria-pressed={checked.executor}
            onClick={() => markSurface("executor", "Trade and integrations")}
            className="justify-start border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
          >
            <CheckCircle2 aria-hidden="true" />
            {checked.executor ? "Trade checked" : "Mark Trade checked"}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-authenticated-control="true"
            data-rds-action="save"
            data-action-state={savedAt ? `changed-${actionSequence}` : "idle"}
            data-persona="reviewer"
            onClick={saveCheckpoint}
            className="justify-start border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
          >
            <Save aria-hidden="true" />
            {savedAt ? "Checklist saved" : "Save checklist"}
          </Button>
        </div>

        <p className="sr-only" aria-live="polite">
          {message}
        </p>
        <div className="grid gap-3 rounded-md border border-outline-variant/40 bg-surface-dim/45 p-3 text-sm text-on-surface-variant md:grid-cols-[1fr_13rem]">
          <div>
            <p className="font-semibold text-on-surface">{message}</p>
            <p className="mt-1 text-xs text-outline">
              Local action #{actionSequence}: {lastAction}
            </p>
            <ul className="mt-2 space-y-1">
              {history.map((item, index) => (
                <li key={`${item}-${index}`} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-outline-variant/40 bg-surface-high/30 p-3">
            <p className="text-xs font-semibold uppercase text-outline">Checklist status</p>
            <p className="mt-1 font-semibold text-on-surface">
              {savedAt ? `Saved ${formatTime(savedAt)}` : "Not saved yet"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function markBrowserAction(message: string) {
  const token = message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "review";
  const url = new URL(window.location.href);
  url.searchParams.set("rds_action", token);
  url.searchParams.set("rds_seq", String(Date.now()));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  document.documentElement.dataset.rdsAction = token;
  const evidence = document.getElementById("rds-live-action-evidence");
  if (evidence) {
    evidence.textContent = `Action evidence: ${token} changed visible walkthrough progress.`;
    evidence.dataset.rdsActionEvidence = token;
  }
}

function cleanHistoryItem(item: string) {
  return item.replace(/\bDemo review account ready\b/gi, "Sample review account ready");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

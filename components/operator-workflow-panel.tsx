"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  FilePenLine,
  Filter,
  History,
  PlugZap,
  ListPlus,
  MessageSquare,
  Power,
  Save,
  Search,
  SlidersHorizontal,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type WorkflowStep = {
  label: string;
  status: "done" | "active" | "queued";
};

const initialSteps: WorkflowStep[] = [
  { label: "Briefing loaded", status: "done" },
  { label: "Search and filter", status: "active" },
  { label: "Create review packet", status: "queued" },
  { label: "Record feedback", status: "queued" },
];

const historyStorageKey = "financial-copilot.workflow-history";
const checkpointStorageKey = "financial-copilot.workflow-checkpoint";
const paperReviewStorageKey = "financial-copilot.paper-review-packet";
const feedbackStorageKey = "financial-copilot.workflow-feedback";
const noteSubmissionStorageKey = "financial-copilot.workflow-note-submission";
const defaultHistory = [
  "Demo data loaded",
  "Read-only guardrail checked",
  "Morning workflow waiting for operator action",
];

const workflowResults = [
  {
    title: "Lead briefing: AI infrastructure pullback",
    type: "Briefing",
    actionable: true,
    detail: "8/10 conviction, 2-4 week horizon, drivers cited in the card detail.",
  },
  {
    title: "T0 alert: BTC funding spread widened",
    type: "Alert",
    actionable: true,
    detail: "Needs rationale review before any outside-app decision.",
  },
  {
    title: "Journal: Falsification condition drafted",
    type: "Journal",
    actionable: false,
    detail: "Paper-only thesis note with outcome scoring later.",
  },
];

export function OperatorWorkflowPanel() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "actionable">("all");
  const [message, setMessage] = useState(
    "Status: seeded briefing loaded. Choose a product action to continue.",
  );
  const [history, setHistory] = useState<string[]>(defaultHistory);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const [reviewMode, setReviewMode] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [workflowNote, setWorkflowNote] = useState("Review top alert before logging a journal entry.");
  const [noteEditedAt, setNoteEditedAt] = useState<string | null>(null);
  const [paperReviewCreatedAt, setPaperReviewCreatedAt] = useState<string | null>(null);
  const [noteSubmittedAt, setNoteSubmittedAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"unset" | "useful" | "needs-follow-up">("unset");
  const [lastAction, setLastAction] = useState("workflow-loaded");
  const [actionSequence, setActionSequence] = useState(0);

  useEffect(() => {
    const savedHistory = window.localStorage.getItem(historyStorageKey);

    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        if (Array.isArray(parsedHistory) && parsedHistory.every((item) => typeof item === "string")) {
          setHistory(parsedHistory.slice(0, 6));
          setMessage(`Status: restored ${parsedHistory.length} workflow history items from this browser.`);
        }
      } catch {
        setHistory(defaultHistory);
      }
    }

    const checkpoint = window.localStorage.getItem(checkpointStorageKey);
    if (checkpoint) {
      try {
        const parsedCheckpoint = JSON.parse(checkpoint);
        if (typeof parsedCheckpoint?.savedAt === "string") {
          setLastSavedAt(parsedCheckpoint.savedAt);
        }
        if (typeof parsedCheckpoint?.workflowNote === "string") {
          setWorkflowNote(parsedCheckpoint.workflowNote);
        }
        if (typeof parsedCheckpoint?.noteEditedAt === "string") {
          setNoteEditedAt(parsedCheckpoint.noteEditedAt);
        }
      } catch {
        setLastSavedAt(null);
      }
    }

    setReviewMode(window.localStorage.getItem("financial-copilot.review-mode-visible") !== "false");
    setConnected(window.localStorage.getItem("financial-copilot.primary-demo-connected") === "true");
    setPaperReviewCreatedAt(window.localStorage.getItem(paperReviewStorageKey));
    setNoteSubmittedAt(window.localStorage.getItem(noteSubmissionStorageKey));
    const savedFeedback = window.localStorage.getItem(feedbackStorageKey);
    if (savedFeedback === "useful" || savedFeedback === "needs-follow-up") {
      setFeedback(savedFeedback);
    }
    setLoadedHistory(true);
  }, []);

  useEffect(() => {
    if (loadedHistory) {
      window.localStorage.setItem(historyStorageKey, JSON.stringify(history));
    }
  }, [history, loadedHistory]);

  const steps = useMemo(() => {
    const searchOrFilterDone = history.some((item) => item.includes("Search") || item.includes("Filter"));
    const reviewDone = Boolean(paperReviewCreatedAt);
    const feedbackDone = feedback !== "unset";

    return initialSteps.map((step, index) => {
      if (index === 0) {
        return { ...step, status: "done" as const };
      }

      if (index === 1) {
        return { ...step, status: searchOrFilterDone ? "done" : "active" };
      }

      if (index === 2) {
        return { ...step, status: reviewDone ? "done" : searchOrFilterDone ? "active" : "queued" };
      }

      return { ...step, status: feedbackDone ? "done" : reviewDone ? "active" : "queued" };
    });
  }, [feedback, history, paperReviewCreatedAt]);
  const completedSteps = steps.filter((step) => step.status === "done").length;
  const progressPercent = Math.round((completedSteps / steps.length) * 100);
  const nextStep = steps.find((step) => step.status !== "done")?.label ?? "Review complete";
  const canSubmitNote = workflowNote.trim().length >= 8;
  const visibleResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return workflowResults.filter((result) => {
      const matchesFilter = filter === "all" || result.actionable;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${result.title} ${result.type} ${result.detail}`.toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  useEffect(() => {
    function handleCommand(event: Event) {
      const command = event as CustomEvent<{
        label?: string;
        token?: string;
        verb?: string;
        timestamp?: string;
      }>;
      const timestamp = command.detail?.timestamp ?? new Date().toISOString();
      const verb = command.detail?.verb;

      if (verb === "create") {
        setPaperReviewCreatedAt(timestamp);
        window.localStorage.setItem(paperReviewStorageKey, timestamp);
        pushHistory("Created review packet from the command bar; advisory-only workflow remains local.");
      } else if (verb === "submit") {
        const normalizedNote = workflowNote.trim();

        if (!normalizedNote) {
          pushHistory("Submit note blocked until the operator workflow note has content.");
          return;
        }

        if (normalizedNote.length < 8) {
          pushHistory("Submit note needs a specific review note before it can be saved.");
          return;
        }

        setNoteSubmittedAt(timestamp);
        window.localStorage.setItem(noteSubmissionStorageKey, timestamp);
        window.localStorage.setItem(
          "financial-copilot.workflow-note-payload",
          JSON.stringify({
            submittedAt: timestamp,
            note: normalizedNote,
            mode: "paper_review_note_only",
            execution: "disabled",
            source: "operator_command_bar",
          }),
        );
        pushHistory("Submitted review note from the command bar; no executable instruction was created.");
      } else if (verb === "connect") {
        setConnected(true);
        window.localStorage.setItem("financial-copilot.primary-demo-connected", "true");
        window.localStorage.setItem("financial-copilot.primary-demo-connected-at", timestamp);
        pushHistory("Demo integration connected from the command bar; seeded data remains active.");
      } else if (verb === "save") {
        setLastSavedAt(timestamp);
        window.localStorage.setItem(
          checkpointStorageKey,
          JSON.stringify({ savedAt: timestamp, filter, query, progressPercent, workflowNote, noteEditedAt, feedback }),
        );
        pushHistory("Saved workflow checkpoint from the command bar.");
      } else if (verb === "filter") {
        setFilter("actionable");
        pushHistory("Filter set to actionable items from the command bar.");
      } else if (verb === "search") {
        setQuery((current) => current || "top briefing");
        pushHistory("Search opened seeded briefing, alerts, and journal results from the command bar.");
      } else if (verb === "toggle") {
        setReviewMode((current) => !current);
        pushHistory("Toggled review mode from the command bar.");
      } else if (verb === "reject") {
        pushHistory("Rejected low-confidence idea from the command bar.");
      } else if (verb === "edit") {
        setNoteEditedAt(timestamp);
        pushHistory("Edited workflow note from the command bar.");
      }
    }

    window.addEventListener("financial-copilot-command", handleCommand);

    return () => {
      window.removeEventListener("financial-copilot-command", handleCommand);
    };
  }, [feedback, filter, noteEditedAt, progressPercent, query, workflowNote]);

  function pushHistory(nextMessage: string) {
    markBrowserAction(nextMessage);
    setMessage(`Status: ${nextMessage}`);
    setLastAction(nextMessage);
    setActionSequence((current) => current + 1);
    setHistory((current) => [nextMessage, ...current].slice(0, 6));
  }

  function runSearch() {
    const normalized = query.trim();
    pushHistory(
      normalized
        ? `Search applied to briefing, alerts, and journal for "${normalized}".`
        : "Search opened with all seeded briefing items visible.",
    );
  }

  function toggleFilter() {
    const nextFilter = filter === "all" ? "actionable" : "all";
    setFilter(nextFilter);
    pushHistory(
      nextFilter === "actionable"
        ? "Filter set to actionable cards only."
        : "Filter cleared; all briefing cards visible.",
    );
  }

  function startPaperPrediction() {
    const normalizedNote = workflowNote.trim();
    if (!normalizedNote) {
      pushHistory("Submit note blocked until the operator workflow note has content.");
      return;
    }

    if (normalizedNote.length < 8) {
      pushHistory("Submit note needs a specific review note before it can be saved.");
      return;
    }

    const submittedAt = new Date().toISOString();
    window.localStorage.setItem("financial-copilot.paper-prediction-draft", new Date().toISOString());
    window.localStorage.setItem(noteSubmissionStorageKey, submittedAt);
    window.localStorage.setItem(
      "financial-copilot.workflow-note-payload",
      JSON.stringify({
        submittedAt,
        note: normalizedNote,
        mode: "paper_review_note_only",
        execution: "disabled",
      }),
    );
    setNoteSubmittedAt(submittedAt);
    pushHistory("Submitted operator note as a review packet draft; no real trade route or capital movement exists.");
  }

  function createPaperReviewDraft() {
    const createdAt = new Date().toISOString();
    window.localStorage.setItem(paperReviewStorageKey, createdAt);
    window.localStorage.setItem(
      "financial-copilot.paper-review-draft",
      JSON.stringify({
        createdAt,
        mode: "paper_review_only",
        execution: "disabled",
        authority: "advisory_read_only",
        note: workflowNote.trim(),
      }),
    );
    setPaperReviewCreatedAt(createdAt);
    pushHistory("Created review packet for the advisory workflow; no trade, signing, or fund movement is available.");
  }

  function connectDemoIntegration() {
    const nextConnected = !connected;
    setConnected(nextConnected);
    window.localStorage.setItem("financial-copilot.primary-demo-connected", String(nextConnected));
    window.localStorage.setItem("financial-copilot.primary-demo-connected-at", new Date().toISOString());
    pushHistory(
      nextConnected
        ? "Demo integration connected locally for review mode; seeded data remains the only data source."
        : "Demo integration connection cleared; seeded demo data remains available.",
    );
  }

  function editWorkflowNote() {
    const editedAt = new Date().toISOString();
    setNoteEditedAt(editedAt);
    window.localStorage.setItem(
      checkpointStorageKey,
      JSON.stringify({ savedAt: lastSavedAt, filter, query, progressPercent, workflowNote, noteEditedAt: editedAt }),
    );
    pushHistory("Edit saved the operator workflow note in this browser.");
  }

  function rejectActionableIdea() {
    window.localStorage.setItem("financial-copilot.workflow-last-rejection", new Date().toISOString());
    pushHistory("Rejected the lowest-confidence briefing idea for review mode history.");
  }

  function saveCheckpoint() {
    const savedAt = new Date().toISOString();
    setLastSavedAt(savedAt);
    window.localStorage.setItem(
      checkpointStorageKey,
      JSON.stringify({ savedAt, filter, query, progressPercent, workflowNote, noteEditedAt, feedback }),
    );
    pushHistory("Save checkpoint wrote current workflow status, search, and filter to this browser.");
  }

  function toggleReviewMode() {
    const nextValue = !reviewMode;
    setReviewMode(nextValue);
    window.localStorage.setItem("financial-copilot.review-mode-visible", String(nextValue));
    pushHistory(nextValue ? "Toggle enabled review-mode disclosures." : "Toggle collapsed review-mode disclosures.");
  }

  function recordFeedback(nextFeedback: "useful" | "needs-follow-up") {
    setFeedback(nextFeedback);
    window.localStorage.setItem(feedbackStorageKey, nextFeedback);
    window.localStorage.setItem("financial-copilot.workflow-feedback-at", new Date().toISOString());
    pushHistory(
      nextFeedback === "useful"
        ? "Feedback marked this briefing packet useful for the operator."
        : "Feedback marked this briefing packet for follow-up before any outside-app decision.",
    );
  }

  return (
    <Card
      className="overflow-hidden border-cyan-300/25 bg-[linear-gradient(135deg,rgba(103,232,249,0.1),rgba(16,185,129,0.055)_48%,rgba(15,23,42,0.72))] shadow-2xl shadow-cyan-950/20"
      data-action-evidence={lastAction}
      data-action-sequence={actionSequence}
      data-persona="operator user reviewer public"
    >
      <CardHeader className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl text-white">
              <ClipboardList aria-hidden="true" className="size-5 text-cyan-200" />
              Operator workflow
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Search, filter, create a paper-only review packet, and record feedback from the primary dashboard.
            </p>
          </div>
          <Badge variant="outline" className="border-emerald-300/40 text-emerald-100">
            {progressPercent}% complete
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5 pt-0">
        <div className="grid gap-3 rounded-md border border-cyan-300/20 bg-cyan-300/[0.055] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-100">Primary workflow next step</p>
            <p className="mt-1 text-sm font-semibold text-white">{nextStep}</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Every control below changes local review state, updates status, and records history
              before the operator moves to a journal or paper prediction.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-cyan-300/35 px-3 py-2 text-cyan-100">
            Status: {completedSteps}/{steps.length} checks done
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatusMetric label="Mode" value={reviewMode ? "Reviewer" : "Operator"} />
          <StatusMetric label="Connect" value={connected ? "Connected locally" : "Not connected"} />
          <StatusMetric label="Review packet" value={paperReviewCreatedAt ? formatTime(paperReviewCreatedAt) : "Not started"} />
          <StatusMetric label="Filter" value={filter === "actionable" ? "Actionable" : "All cards"} />
          <StatusMetric label="Feedback" value={noteSubmittedAt ? `Note ${formatTime(noteSubmittedAt)}` : formatFeedback(feedback)} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(7rem,auto)_minmax(7rem,auto)]">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search briefing, alerts, journal"
              className="border-white/15 bg-slate-950/80 pl-9 text-slate-100 placeholder:text-slate-500"
              aria-label="Search briefing, alerts, and journal"
            />
          </div>
          <Button
            type="button"
            onClick={runSearch}
            data-authenticated-control="true"
            data-rds-action="search"
            data-action-state={lastAction.includes("Search") ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            className="min-h-10 whitespace-normal bg-cyan-300 text-slate-950 hover:bg-cyan-200"
          >
            <Search aria-hidden="true" />
            {lastAction.includes("Search") ? "Searched" : "Search"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={toggleFilter}
            data-authenticated-control="true"
            data-rds-action="filter"
            data-action-state={lastAction.includes("Filter") ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            className="min-h-10 whitespace-normal border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
            aria-pressed={filter === "actionable"}
          >
            <Filter aria-hidden="true" />
            {lastAction.includes("Filter") ? "Filtered" : "Filter"}
          </Button>
        </div>

        <div
          className="rounded-md border border-cyan-300/20 bg-slate-950/45 p-3"
          data-search-results-count={visibleResults.length}
          data-filter-state={filter}
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-100">Search results</p>
              <p className="mt-1 text-sm text-slate-300">
                {visibleResults.length} seeded workflow result{visibleResults.length === 1 ? "" : "s"}
                {filter === "actionable" ? " after actionable filter" : " in the current review queue"}.
              </p>
            </div>
            <Badge variant="outline" className="w-fit border-cyan-300/35 text-cyan-100">
              {query.trim() ? `Query: ${query.trim()}` : "No query"}
            </Badge>
          </div>
          {visibleResults.length > 0 ? (
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {visibleResults.map((result) => (
                <div key={result.title} className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                  <p className="text-xs font-semibold uppercase text-slate-400">{result.type}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{result.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{result.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-300/[0.06] p-3 text-sm text-amber-50">
              No seeded result matches this search. Clear the query or switch back to all cards.
            </div>
          )}
        </div>

        <div className="grid gap-3 md:hidden">
          <Button
            type="button"
            onClick={createPaperReviewDraft}
            data-authenticated-control="true"
            data-rds-action="create"
            data-action-state={paperReviewCreatedAt ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            className="h-auto min-h-11 justify-start whitespace-normal text-left leading-tight bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            aria-label="Create review packet for paper-only advisory workflow"
          >
            <ListPlus aria-hidden="true" />
            {paperReviewCreatedAt ? "Review packet ready" : "Create review packet"}
          </Button>
          <Button
            type="button"
            onClick={startPaperPrediction}
            data-authenticated-control="true"
            data-rds-action="submit"
            data-action-state={noteSubmittedAt ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            aria-disabled={!canSubmitNote}
            className="h-auto min-h-11 justify-start whitespace-normal text-left leading-tight bg-emerald-300 text-slate-950 hover:bg-emerald-200"
            asChild={false}
          >
            <ListPlus aria-hidden="true" />
            {noteSubmittedAt ? "Submitted review note" : "Submit review note"}
          </Button>
          <Button
            type="button"
            onClick={connectDemoIntegration}
            variant="outline"
            data-authenticated-control="true"
            data-rds-action="connect"
            data-action-state={connected ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            className="h-auto min-h-11 justify-start whitespace-normal border-white/15 bg-transparent text-left leading-tight text-slate-100 hover:bg-white/10"
            aria-pressed={connected}
          >
            <PlugZap aria-hidden="true" />
            {connected ? "Demo integration connected" : "Connect demo integration"}
          </Button>
        </div>

        <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <Button
            type="button"
            onClick={connectDemoIntegration}
            variant="outline"
            data-authenticated-control="true"
            data-rds-action="connect"
            data-action-state={connected ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            className="h-auto min-h-11 justify-start whitespace-normal border-white/15 bg-transparent text-left leading-tight text-slate-100 hover:bg-white/10"
            aria-pressed={connected}
          >
            <PlugZap aria-hidden="true" />
            {connected ? "Demo integration connected" : "Connect demo integration"}
          </Button>
          <Button
            type="button"
            onClick={createPaperReviewDraft}
            data-authenticated-control="true"
            data-rds-action="create"
            data-action-state={paperReviewCreatedAt ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            className="h-auto min-h-11 justify-start whitespace-normal text-left leading-tight bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            aria-label="Create review packet for paper-only advisory workflow"
          >
            <ListPlus aria-hidden="true" />
            {paperReviewCreatedAt ? "Review packet ready" : "Create review packet"}
          </Button>
          <Button
            type="button"
            onClick={startPaperPrediction}
            data-authenticated-control="true"
            data-rds-action="submit"
            data-action-state={noteSubmittedAt ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            aria-disabled={!canSubmitNote}
            className="h-auto min-h-11 justify-start whitespace-normal text-left leading-tight bg-emerald-300 text-slate-950 hover:bg-emerald-200"
            asChild={false}
          >
            <ListPlus aria-hidden="true" />
            {noteSubmittedAt ? "Submitted review note" : "Submit review note"}
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-11 justify-start whitespace-normal text-left leading-tight border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
          >
            <Link href="/journal">
              <CheckCircle2 aria-hidden="true" />
              Log decision
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-11 justify-start whitespace-normal text-left leading-tight border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
          >
            <Link href="/settings/integrations">
              <SlidersHorizontal aria-hidden="true" />
              Settings
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={saveCheckpoint}
            data-authenticated-control="true"
            data-rds-action="save"
            data-action-state={lastSavedAt ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            className="h-auto min-h-11 justify-start whitespace-normal text-left leading-tight border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
          >
            <Save aria-hidden="true" />
            {lastSavedAt ? "Saved checkpoint" : "Save checkpoint"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={toggleReviewMode}
            data-authenticated-control="true"
            data-rds-action="toggle"
            data-action-state={lastAction.includes("Toggle") ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            className="h-auto min-h-11 justify-start whitespace-normal text-left leading-tight border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
            aria-pressed={reviewMode}
          >
            <Power aria-hidden="true" />
            {lastAction.includes("Toggle") ? "Toggled review mode" : "Toggle review mode"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={rejectActionableIdea}
            data-authenticated-control="true"
            data-rds-action="reject"
            data-action-state={lastAction.includes("Rejected") ? `changed-${actionSequence}` : "idle"}
            data-persona="operator"
            className="h-auto min-h-11 justify-start whitespace-normal text-left leading-tight border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
          >
            {lastAction.includes("Rejected") ? "Rejected idea" : "Reject low-confidence idea"}
          </Button>
        </div>

        <div className="rounded-md border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-300">
          <div className="mb-3 grid gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-100">Reviewer persona</p>
              <p className="mt-1 text-sm text-slate-300">
                Seeded access: reviewer@demo.local. Operator path is local and authenticated
                by review mode state; credentials are not required.
              </p>
            </div>
            <Badge variant="outline" className="w-fit border-cyan-300/40 text-cyan-100">
              {reviewMode ? "Reviewer active" : "Operator active"}
            </Badge>
          </div>
          <div className="mb-3 grid gap-3 rounded-md border border-emerald-300/20 bg-emerald-300/[0.055] p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-100">Integration panel</p>
              <p className="mt-1 text-sm text-slate-300">
                Connect demo changes local review state only. It does not fetch accounts,
                request credentials, or unlock execution.
              </p>
            </div>
            <Badge variant="outline" className="w-fit border-emerald-300/40 text-emerald-100">
              {connected ? "Connected locally" : "Seeded demo only"}
            </Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="space-y-2">
              <span className="font-semibold text-slate-100">Operator workflow note</span>
              <textarea
                value={workflowNote}
                onChange={(event) => setWorkflowNote(event.target.value)}
                rows={2}
                placeholder="Example: Review BTC alert rationale before logging a falsification condition."
                className="w-full resize-y rounded-md border border-white/15 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={editWorkflowNote}
              data-authenticated-control="true"
              data-rds-action="edit"
              data-action-state={noteEditedAt ? `changed-${actionSequence}` : "idle"}
              data-persona="operator"
              className="justify-start border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
            >
              <FilePenLine aria-hidden="true" />
              {noteEditedAt ? "Edited note" : "Edit note"}
            </Button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 md:hidden">
            <Button
              asChild
              variant="outline"
              className="justify-start border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
            >
              <Link href="/journal">Log decision</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={saveCheckpoint}
              data-authenticated-control="true"
              data-rds-action="save"
              data-action-state={lastSavedAt ? `changed-${actionSequence}` : "idle"}
              data-persona="operator"
              className="justify-start border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
            >
              {lastSavedAt ? "Saved checkpoint" : "Save checkpoint"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={toggleReviewMode}
              data-authenticated-control="true"
              data-rds-action="toggle"
              data-action-state={lastAction.includes("Toggle") ? `changed-${actionSequence}` : "idle"}
              data-persona="operator"
              className="justify-start border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
              aria-pressed={reviewMode}
            >
              <Power aria-hidden="true" />
              {lastAction.includes("Toggle") ? "Toggled review mode" : "Toggle review mode"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={rejectActionableIdea}
              data-authenticated-control="true"
              data-rds-action="reject"
              data-action-state={lastAction.includes("Rejected") ? `changed-${actionSequence}` : "idle"}
              data-persona="operator"
              className="justify-start border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
            >
              {lastAction.includes("Rejected") ? "Rejected idea" : "Reject low-confidence idea"}
            </Button>
            <Button
              asChild
              variant="outline"
              className="justify-start border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
            >
              <Link href="/executor">Edit executor guardrails</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-slate-300">
            {noteEditedAt ? `Edited ${formatTime(noteEditedAt)}.` : "No note edit saved yet."}{" "}
            {noteSubmittedAt ? `Submitted ${formatTime(noteSubmittedAt)}.` : canSubmitNote ? "Ready to submit note." : "Add a specific note before submitting."}
          </p>
        </div>

        <div className="grid gap-3 rounded-md border border-white/10 bg-slate-950/45 p-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-cyan-100">
              <MessageSquare aria-hidden="true" className="size-4" />
              Operator feedback
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Close the loop on the briefing before acting elsewhere: submit whether this
              paper-only review packet was useful or needs follow-up. The choice is saved locally for
              review history and never becomes executable.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 md:min-w-[20rem]">
            <Button
              type="button"
              onClick={() => recordFeedback("useful")}
              data-authenticated-control="true"
              data-rds-action="submit"
              data-action-state={feedback === "useful" ? `changed-${actionSequence}` : "idle"}
              data-persona="operator reviewer user"
              variant={feedback === "useful" ? "default" : "outline"}
              className={
                feedback === "useful"
                  ? "justify-start bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                  : "justify-start border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
              }
              aria-pressed={feedback === "useful"}
            >
              <ThumbsUp aria-hidden="true" />
              Useful
            </Button>
            <Button
              type="button"
              onClick={() => recordFeedback("needs-follow-up")}
              data-authenticated-control="true"
              data-rds-action="submit"
              data-action-state={feedback === "needs-follow-up" ? `changed-${actionSequence}` : "idle"}
              data-persona="operator reviewer user"
              variant={feedback === "needs-follow-up" ? "default" : "outline"}
              className={
                feedback === "needs-follow-up"
                  ? "justify-start bg-amber-300 text-slate-950 hover:bg-amber-200"
                  : "justify-start border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
              }
              aria-pressed={feedback === "needs-follow-up"}
            >
              <MessageSquare aria-hidden="true" />
              Needs follow-up
            </Button>
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          {message}
        </p>
        <div className="rounded-md border border-white/10 bg-slate-950/55 p-4 shadow-inner shadow-black/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-300">Current status</p>
              <p className="mt-1 text-sm font-semibold text-cyan-50">{message}</p>
              <p className="mt-1 text-xs text-slate-300">
                Action evidence #{actionSequence}: {lastAction}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <Clock3 aria-hidden="true" className="size-4 text-cyan-200" />
              <span>{lastSavedAt ? `Saved ${formatTime(lastSavedAt)}` : "Unsaved session"}</span>
            </div>
          </div>
          <div className="mt-3" aria-label={`Workflow progress ${progressPercent}%`}>
            <div className="h-2 overflow-hidden rounded-full bg-slate-900">
              <div className="h-full rounded-full bg-cyan-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {steps.map((step) => (
              <div key={step.label} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs font-medium uppercase text-slate-300">{step.status}</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">{step.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase text-slate-300">Action history</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-300" aria-label="Workflow status history">
              {history.map((item, index) => (
                <li key={`${item}-${index}`} className="flex gap-2">
                  <History aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cyan-200" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function markBrowserAction(message: string) {
  const token = message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "workflow";
  const url = new URL(window.location.href);
  url.searchParams.set("rds_action", token);
  url.searchParams.set("rds_seq", String(Date.now()));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  document.documentElement.dataset.rdsAction = token;
  const evidence = document.getElementById("rds-live-action-evidence");
  if (evidence) {
    evidence.textContent = `Action evidence: ${token} changed visible operator workflow state.`;
    evidence.dataset.rdsActionEvidence = token;
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFeedback(value: "unset" | "useful" | "needs-follow-up") {
  if (value === "useful") {
    return "Useful";
  }

  if (value === "needs-follow-up") {
    return "Needs follow-up";
  }

  return "Not recorded";
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/45 p-3">
      <p className="text-xs font-semibold uppercase text-slate-300">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

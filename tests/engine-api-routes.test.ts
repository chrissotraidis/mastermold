/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GET as getBriefingRoute } from "@/app/api/briefing/route";
import { GET as getBriefingDetailRoute } from "@/app/api/briefing/[id]/route";
import { GET as getAlertsRoute } from "@/app/api/alerts/route";
import { PATCH as patchAlertFeedbackRoute } from "@/app/api/alerts/[id]/feedback/route";
import { GET as getJournalRoute, POST as postJournalRoute } from "@/app/api/journal/route";
import { POST as postJournalOutcomeRoute } from "@/app/api/journal/[id]/outcome/route";
import { GET as getMetricsRoute, POST as postMetricsRoute } from "@/app/api/metrics/route";
import { GET as getPaperRoute } from "@/app/api/paper/route";
import { GET as getPortfolioRoute } from "@/app/api/portfolio/route";
import { GET as getExecutorRoute } from "@/app/api/executor/route";
import { POST as postPortfolioImportRoute } from "@/app/api/portfolio/import/route";
import { POST as postChatRoute } from "@/app/api/chat/route";
import { GET as getBrainRoute } from "@/app/api/brain/route";
import { POST as postBrainInitializeRoute } from "@/app/api/brain/initialize/route";
import { GET as getBrainScheduleRoute, POST as postBrainScheduleRoute } from "@/app/api/brain/schedule/route";
import { GET as getForwardProofRoute, POST as postForwardProofRoute } from "@/app/api/evaluation/forward-proof/route";
import { POST as postIntegrationTestRoute } from "@/app/api/integrations/test/route";
import { buildUserPromptForRequest } from "@/lib/chat-copy";
import { parseAsOf } from "@/src/db/bitemporal";
import { getBrainStateAfterDueScheduleCheck } from "@/src/db/brain";
import { getChatContext } from "@/src/db/chat";
import { replaceImportedHoldings } from "@/src/db/portfolio";
import type { DecisionJournalEntry, OutcomeScore } from "@/src/db/schema";
import { __resetStoreForTests, store, type ImportedHoldingRow } from "@/src/db/store";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "engine");

let prevEngine: string | undefined;
let prevDb: string | undefined;
let prevBrainDailyScan: string | undefined;
let prevChatMaxResponseTokens: string | undefined;
let prevChatMaxTotalTokens: string | undefined;

beforeEach(() => {
  prevEngine = process.env.ENGINE_OUT_DIR;
  prevDb = process.env.MASTERMOLD_DB;
  prevBrainDailyScan = process.env.MASTERMOLD_BRAIN_DAILY_SCAN;
  prevChatMaxResponseTokens = process.env.MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS;
  prevChatMaxTotalTokens = process.env.MASTERMOLD_CHAT_MAX_TOTAL_TOKENS;
  process.env.ENGINE_OUT_DIR = FIXTURES;
  process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-api-")), "db.sqlite");
  delete process.env.MASTERMOLD_BRAIN_DAILY_SCAN;
  delete process.env.MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS;
  delete process.env.MASTERMOLD_CHAT_MAX_TOTAL_TOKENS;
  __resetStoreForTests();
});

afterEach(() => {
  if (prevEngine === undefined) delete process.env.ENGINE_OUT_DIR;
  else process.env.ENGINE_OUT_DIR = prevEngine;
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  if (prevBrainDailyScan === undefined) delete process.env.MASTERMOLD_BRAIN_DAILY_SCAN;
  else process.env.MASTERMOLD_BRAIN_DAILY_SCAN = prevBrainDailyScan;
  if (prevChatMaxResponseTokens === undefined) delete process.env.MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS;
  else process.env.MASTERMOLD_CHAT_MAX_RESPONSE_TOKENS = prevChatMaxResponseTokens;
  if (prevChatMaxTotalTokens === undefined) delete process.env.MASTERMOLD_CHAT_MAX_TOTAL_TOKENS;
  else process.env.MASTERMOLD_CHAT_MAX_TOTAL_TOKENS = prevChatMaxTotalTokens;
  __resetStoreForTests();
});

async function json<T>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

const req = (path: string) => new Request(`http://localhost${path}`);

describe("API routes serve engine output end to end", () => {
  test("GET /api/briefing returns saved-scan cards with public copy", async () => {
    const cards = await json<
      Array<{
        asset_keys: string[];
        asset_ids?: string[];
        provenance: { label: string; source: string };
        confidence: number;
        status: string;
      }>
    >(getBriefingRoute(req("/api/briefing")));
    expect(cards.length).toBe(3);
    expect(cards.every((c) => c.asset_keys.length > 0 && c.asset_ids === undefined)).toBe(true);
    expect(cards.every((c) => c.provenance.label === "Saved read")).toBe(true);
    expect(cards.every((c) => c.provenance.source === "Saved market read")).toBe(true);
    expect(cards.every((c) => c.confidence >= 1 && c.confidence <= 10)).toBe(true);
    expect(cards.every((c) => c.status === "worth_checking")).toBe(true);
    expect(JSON.stringify(cards)).toMatch(/happened_at|saved_at/);
    expect(JSON.stringify(cards)).not.toMatch(/asset_ids|asset_id|Engine output|OpenRouter|deepseek|provider|models|conviction|actionable|z-score|sigma|event_time|knowledge_time/i);
  });

  test("GET /api/briefing/[id] returns the saved-scan detail with support notes", async () => {
    const cards = await json<Array<{ id: string }>>(getBriefingRoute(req("/api/briefing")));
    const topId = cards[0].id;
    const res = await getBriefingDetailRoute(req(`/api/briefing/${topId}`), {
      params: Promise.resolve({ id: topId }),
    });
    const detail = await json<{
      asset_keys: string[];
      asset_ids?: string[];
      provenance: { label: string };
      drivers: Array<{ importance: number; support_note: string }>;
      decision_journal_entry: { what_would_prove_wrong: string } | null;
    }>(res);
    expect(detail.provenance.label).toBe("Saved read");
    expect(detail.asset_keys.length).toBeGreaterThan(0);
    expect(detail.asset_ids).toBeUndefined();
    expect(detail.drivers.length).toBeGreaterThanOrEqual(2);
    expect(detail.drivers.every((driver) => driver.importance > 0 && driver.support_note)).toBe(true);
    expect(detail.decision_journal_entry?.what_would_prove_wrong).toBeTruthy();
    expect(JSON.stringify(detail)).toMatch(/happened_at|saved_at/);
    expect(JSON.stringify(detail)).not.toMatch(/asset_ids|asset_id|briefing_card_id|source_citation|weight|z-score|sigma|Engine output|OpenRouter|deepseek|provider|models|event_time|knowledge_time/i);
  });

  test("GET /api/alerts returns public alert ids, severity, and reason labels", async () => {
    const alerts = await json<
      Array<{
        id: string;
        asset_key: string;
        asset_id?: string;
        provenance: { label: string };
        severity: string;
        reason_type: string;
        priority_score: number;
      }>
    >(
      getAlertsRoute(req("/api/alerts")),
    );
    expect(alerts.length).toBe(3);
    expect(alerts.every((a) => a.id.startsWith("alert_") && a.asset_key.length > 0)).toBe(true);
    expect(alerts.every((a) => a.asset_id === undefined)).toBe(true);
    expect(alerts.every((a) => a.provenance.label === "Saved read")).toBe(true);
    expect(alerts.every((a) => ["Urgent", "Worth checking", "FYI"].includes(a.severity))).toBe(true);
    expect(alerts.every((a) => a.reason_type.length > 0 && Number.isFinite(a.priority_score))).toBe(true);
    expect(JSON.stringify(alerts)).not.toMatch(/engine_alert|asset_id|z_score|signal|Engine output|OpenRouter|deepseek|screener/i);
  });

  test("PATCH /api/alerts/[id]/feedback persists feedback on an engine alert", async () => {
    const alerts = await json<Array<{ id: string; acknowledged: boolean }>>(
      getAlertsRoute(req("/api/alerts")),
    );
    const target = alerts[0];
    const res = await patchAlertFeedbackRoute(
      new Request(`http://localhost/api/alerts/${target.id}/feedback`, {
        method: "PATCH",
        body: JSON.stringify({ useful_feedback: false }),
      }),
      { params: Promise.resolve({ id: target.id }) },
    );
    const updated = await json<{ useful_feedback: boolean | null; acknowledged: boolean }>(res);
    expect(updated.useful_feedback).toBe(false);
    expect(updated.acknowledged).toBe(target.acknowledged); // unchanged
  });

  test("GET /api/journal returns an engine-computed track record", async () => {
    const journal = await json<{
      provenance: { label: string };
      track_record: Array<{ resolved_count: number; mean_result_score?: number; mean_outcome_score?: number }>;
      confidence_check: unknown[];
    }>(getJournalRoute(req("/api/journal")));
    expect(journal.provenance.label).toBe("Saved read");
    const resolved = journal.track_record.reduce((s, t) => s + t.resolved_count, 0);
    expect(resolved).toBe(6);
    expect(journal.track_record.some((t) => typeof t.mean_result_score === "number")).toBe(true);
    expect(journal.track_record.every((t) => t.mean_outcome_score === undefined)).toBe(true);
    expect(journal.confidence_check.length).toBeGreaterThan(0);
    expect(JSON.stringify(journal)).toMatch(/happened_at|saved_at/);
    expect(JSON.stringify(journal)).not.toMatch(/Engine output|Demo data|briefing_card_id|brief_crypto_basis|conviction|calibration|outcome_score|thesis_played_out|pnl_note|played out|event_time|knowledge_time/i);
  });

  test("GET /api/journal?as_of before the run falls back to seeds (no look-ahead)", async () => {
    const journal = await json<{ provenance: { label: string } }>(
      getJournalRoute(req("/api/journal?as_of=2026-06-01T00:00:00.000Z")),
    );
    expect(journal.provenance.label).toBe("Sample data");
  });

  test("POST /api/journal/[id]/outcome resolves a logged call and records the result", async () => {
    const created = await json<{ id: string; result: null; happened_at: string; saved_at: string }>(
      await postJournalRoute(
        new Request("http://localhost/api/journal", {
          method: "POST",
          body: JSON.stringify({
            call: "NVDA call should be scored later",
            signals: ["volume", "holding concentration"],
            confidence: 7,
            horizon: "1 week",
            falsification_condition: "Volume spike fades and relative strength breaks.",
          }),
        }),
      ),
    );

    const resolved = await json<{
      id: string;
      happened_at: string;
      saved_at: string;
      result: {
        call_was_right: boolean;
        review_quality: number;
        result_score: number;
        result_note: string;
        happened_at: string;
        saved_at: string;
      };
    }>(
      await postJournalOutcomeRoute(
        new Request(`http://localhost/api/journal/${created.id}/outcome`, {
          method: "POST",
          body: JSON.stringify({
            call_was_right: true,
            review_quality: 8,
            result_score: 7,
            result_note: "The call was right for the stated reason.",
          }),
        }),
        { params: Promise.resolve({ id: created.id }) },
      ),
    );
    const summary = await json<{ activity_counts: Array<{ activity: string; count: number }> }>(getMetricsRoute());

    expect(created.result).toBeNull();
    expect(created.happened_at).toMatch(/2026-/);
    expect(created.saved_at).toMatch(/2026-/);
    expect(resolved.id).toBe(created.id);
    expect(resolved.happened_at).toBe(created.happened_at);
    expect(resolved.saved_at).toMatch(/2026-/);
    expect(resolved.result.call_was_right).toBe(true);
    expect(resolved.result.review_quality).toBe(8);
    expect(resolved.result.result_score).toBe(7);
    expect(resolved.result.happened_at).toMatch(/2026-/);
    expect(resolved.result.saved_at).toMatch(/2026-/);
    expect(JSON.stringify(resolved)).not.toMatch(/outcome_score|thesis_played_out|pnl_note|conviction/i);
    expect(summary.activity_counts).toContainEqual({ activity: "Call logged", count: 1 });
    expect(summary.activity_counts).toContainEqual({ activity: "Result saved", count: 1 });

    const proof = await json<{
      gates: Array<{ id: string; status: string; detail: string }>;
      counts: { logged_calls: number; resolved_calls: number };
      progress: { saved_calls: string; later_results: string; next_step: string };
    }>(await getForwardProofRoute());
    expect(proof.gates.find((gate) => gate.id === "pre_outcome_log")?.status).toBe("Working locally");
    expect(proof.gates.find((gate) => gate.id === "pre_outcome_log")?.detail).toContain("local calls");
    expect(proof.gates.find((gate) => gate.id === "resolve_results")?.status).toBe("Working locally");
    expect(proof.gates.find((gate) => gate.id === "resolve_results")?.detail).toContain("local calls");
    expect(proof.counts.logged_calls).toBe(1);
    expect(proof.counts.resolved_calls).toBe(1);
    expect(proof.progress.saved_calls).toContain("1/");
    expect(proof.progress.later_results).toContain("1/");
  });

  test("GET /api/evaluation/forward-proof reports measurement gates without claiming proof", async () => {
    const proof = await json<{
      verdict: string;
      summary: string;
      gates: Array<{ id: string; status: string; detail: string }>;
      measurement: { status: string; baseline: string; note: string };
      trial?: unknown;
      counts: { logged_calls: number; resolved_calls: number; saved_scans: number };
      progress: { saved_calls: string; later_results: string; saved_scans: string; next_step: string };
    }>(await getForwardProofRoute());

    expect(proof.verdict).toBe("Trust log only");
    expect(proof.summary).toContain("needs a dated measurement window and later results");
    expect(proof.measurement.status).toBe("Not started");
    expect(proof.measurement.baseline).toBe("Hold the visible portfolio evenly");
    expect(proof.measurement.note).toContain("No dated measurement window is running");
    expect(proof.trial).toBeUndefined();
    expect(proof.gates.find((gate) => gate.id === "pre_outcome_log")?.status).toBe("Missing");
    expect(proof.gates.find((gate) => gate.id === "pre_outcome_log")?.detail).toContain(
      "Seeded/sample calls do not count as forward evidence",
    );
    expect(proof.gates.find((gate) => gate.id === "resolve_results")?.status).toBe("Missing");
    expect(proof.gates.find((gate) => gate.id === "baselines_and_costs")?.status).toBe("Missing");
    expect(proof.gates.find((gate) => gate.id === "measurement_window")?.detail).toContain("No dated measurement window is running");
    expect(proof.gates.find((gate) => gate.id === "forward_trial")).toBeUndefined();
    expect(proof.counts.logged_calls).toBe(0);
    expect(proof.counts.resolved_calls).toBe(0);
    expect(proof.progress.saved_calls).toBe("0/30 saved after the start point");
    expect(proof.progress.later_results).toBe("0/10 later results");
    expect(proof.progress.next_step).toContain("Start measuring before treating later calls as forward evidence");
  });

  test("POST /api/evaluation/forward-proof starts local measurement without claiming proof", async () => {
    const started = await json<{
      verdict: string;
      summary: string;
      gates: Array<{ id: string; status: string; detail: string }>;
      measurement: {
        status: string;
        min_logged_calls: number;
        min_resolved_calls: number;
        cost_policy: string;
        pass_fail_gate: string;
      };
      trial?: unknown;
      progress: { next_step: string };
    }>(
      await postForwardProofRoute(
        new Request("http://localhost/api/evaluation/forward-proof", {
          method: "POST",
          body: JSON.stringify({
            trigger: "test",
            min_logged_calls: 30,
            min_resolved_calls: 10,
          }),
        }),
      ),
    );
    const current = await json<typeof started>(await getForwardProofRoute());

    expect(started.verdict).toBe("Measuring forward");
    expect(started.summary).toContain("needs enough later results for a baseline comparison");
    expect(started.measurement.status).toBe("Running locally");
    expect(started.measurement.min_logged_calls).toBe(30);
    expect(started.measurement.min_resolved_calls).toBe(10);
    expect(started.measurement.cost_policy).toContain("Execution costs stay at zero");
    expect(started.measurement.pass_fail_gate).toContain("before the app can say the calls beat the baseline");
    expect(started.trial).toBeUndefined();
    expect(started.gates.find((gate) => gate.id === "baselines_and_costs")?.status).toBe("Partial");
    expect(started.gates.find((gate) => gate.id === "baselines_and_costs")?.detail).toContain(
      "Result comparison needs later outcomes",
    );
    expect(started.gates.find((gate) => gate.id === "measurement_window")?.status).toBe("Partial");
    expect(started.progress.next_step).toContain("Save 30 more calls after the start point");
    expect(current.measurement.status).toBe("Running locally");
    expect(current.verdict).toBe("Measuring forward");
  });

  test("GET /api/evaluation/forward-proof counts only calls saved after the measurement starts", async () => {
    const oldEntry: DecisionJournalEntry = {
      id: "journal_old_before_measurement",
      briefing_card_id: null,
      thesis: "Old local call that should stay out of the new window.",
      signals: ["old setup"],
      conviction: 6,
      horizon: "1 week",
      falsification_condition: "Old result condition",
      logged_at: "2026-01-01T00:00:00.000Z",
      event_time: "2026-01-01T00:00:00.000Z",
      knowledge_time: "2026-01-01T00:00:00.000Z",
    };
    const oldOutcome: OutcomeScore = {
      id: "outcome_old_before_measurement",
      journal_entry_id: oldEntry.id,
      resolved_at: "2026-01-08T00:00:00.000Z",
      pnl_note: "Old result.",
      thesis_played_out: true,
      process_score: 6,
      outcome_score: 6,
      event_time: "2026-01-08T00:00:00.000Z",
      knowledge_time: "2026-01-08T00:00:00.000Z",
    };
    store().addJournalEntry(oldEntry);
    store().addOutcomeScore(oldOutcome);

    const started = await json<{
      counts: { logged_calls: number; resolved_calls: number };
      gates: Array<{ id: string; status: string; detail: string }>;
      progress: { saved_calls: string; later_results: string; next_step: string };
    }>(
      await postForwardProofRoute(
        new Request("http://localhost/api/evaluation/forward-proof", {
          method: "POST",
          body: JSON.stringify({
            trigger: "window-count-test",
            min_logged_calls: 1,
            min_resolved_calls: 1,
          }),
        }),
      ),
    );

    expect(started.counts.logged_calls).toBe(0);
    expect(started.counts.resolved_calls).toBe(0);
    expect(started.gates.find((gate) => gate.id === "pre_outcome_log")?.detail).toContain(
      "Older local calls stay in the trust log but do not count here",
    );
    expect(started.gates.find((gate) => gate.id === "resolve_results")?.detail).toContain(
      "after the measurement start",
    );
    expect(started.progress.saved_calls).toBe("0/1 saved after the start point");
    expect(started.progress.later_results).toBe("0/1 later results");

    const created = await json<{ id: string }>(
      await postJournalRoute(
        new Request("http://localhost/api/journal", {
          method: "POST",
          body: JSON.stringify({
            call: "New measurement-window call.",
            signals: ["new evidence"],
            confidence: 7,
            horizon: "1 week",
            falsification_condition: "New evidence breaks.",
          }),
        }),
      ),
    );
    await postJournalOutcomeRoute(
      new Request(`http://localhost/api/journal/${created.id}/outcome`, {
        method: "POST",
        body: JSON.stringify({
          call_was_right: true,
          review_quality: 8,
          result_score: 7,
          result_note: "New result recorded after the measurement start.",
        }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );

    const proof = await json<{
      verdict: string;
      counts: { logged_calls: number; resolved_calls: number };
      gates: Array<{ id: string; status: string; detail: string }>;
      progress: { saved_calls: string; later_results: string; next_step: string };
    }>(await getForwardProofRoute());

    expect(proof.verdict).toBe("Measuring forward");
    expect(proof.counts.logged_calls).toBe(1);
    expect(proof.counts.resolved_calls).toBe(1);
    expect(proof.gates.find((gate) => gate.id === "pre_outcome_log")?.detail).toContain(
      "in this measurement window",
    );
    expect(proof.gates.find((gate) => gate.id === "resolve_results")?.detail).toContain(
      "measurement-window",
    );
    expect(proof.progress.saved_calls).toBe("1/1 saved after the start point");
    expect(proof.progress.later_results).toBe("1/1 later results");
    expect(proof.progress.next_step).toContain("Enough local calls and later results");
  });

  test("GET /api/portfolio stays seeded — the engine never touches holdings", async () => {
    const portfolio = await json<{
      provenance: { label: string; source: string };
      summary: { data_state: string; source_note: string };
      holdings: Array<{ source_label: string; type: string; paid_amount: number }>;
    }>(
      getPortfolioRoute(req("/api/portfolio")),
    );
    expect(portfolio.provenance.label).toBe("Sample data");
    expect(portfolio.summary.data_state).toBe("Sample data");
    expect(portfolio.summary.source_note).toContain("Sample holdings");
    expect(portfolio.holdings.length).toBeGreaterThan(0);
    expect(portfolio.holdings.every((holding) => holding.source_label === "Sample holding")).toBe(true);
    expect(JSON.stringify(portfolio)).not.toMatch(/Demo data|cost_basis|asset_class|integration_status|stubbed|defi|source":"demo|knowledge_time|event_time/i);
  });

  test("GET /api/paper serves paper-trading payload with public timing fields", async () => {
    const paper = await json<{
      rounds: Array<{ happened_at: string; saved_at: string; paper_trades: Array<{ happened_at: string; saved_at: string }> }>;
      paper_trades: Array<{ happened_at: string; saved_at: string }>;
      results: Array<{ happened_at: string; saved_at: string }>;
    }>(
      getPaperRoute(req("/api/paper")),
    );
    expect(Array.isArray(paper.rounds)).toBe(true);
    expect(Array.isArray(paper.paper_trades)).toBe(true);
    expect(Array.isArray(paper.results)).toBe(true);
    expect(paper.rounds.every((round) => round.happened_at && round.saved_at)).toBe(true);
    expect(paper.paper_trades.every((trade) => trade.happened_at && trade.saved_at)).toBe(true);
    expect(paper.results.every((result) => result.happened_at && result.saved_at)).toBe(true);
    expect(JSON.stringify(paper)).not.toMatch(/fake_|predictions|conviction|calibration|asset_id|asset_class|Demo data|Engine output|event_time|knowledge_time/i);
  });

  test("GET /api/executor serves preview-only payload with public timing fields", async () => {
    const executor = await json<{
      strategies: Array<{ happened_at: string; saved_at: string; status: string }>;
      safety_drafts: Array<{ happened_at: string; saved_at: string; note: string }>;
      borrow_rate_preview: Array<{ saved_at: string }>;
      provenance: { label: string };
    }>(
      getExecutorRoute(req("/api/executor")),
    );

    expect(executor.provenance.label).toBe("Sample data");
    expect(executor.strategies.some((strategy) => strategy.status === "Preview only")).toBe(true);
    expect(executor.strategies.every((strategy) => strategy.happened_at && strategy.saved_at)).toBe(true);
    expect(executor.safety_drafts.every((draft) => draft.happened_at && draft.saved_at)).toBe(true);
    expect(executor.borrow_rate_preview.every((preview) => preview.saved_at)).toBe(true);
    expect(executor.safety_drafts[0]?.note).toContain("Nothing here signs");
    expect(JSON.stringify(executor)).not.toMatch(/guardrail_configs|funding_observations|asset_id|net_delta|margin_ratio|funding_rate|running_demo|stablecoin_lending|delta_neutral_funding_carry|Demo data|event_time|knowledge_time/i);
  });

  test("POST /api/chat returns a canned guidance stream with no live chat key set", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevR = process.env.OPENROUTER_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const res = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: "What is the top briefing thesis?" }),
        }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Chat-Mode")).toBe("canned");
      const text = await res.text();
      expect(text).toContain("No live chat key is saved");
      expect(text).toContain("Guidance only");
    } finally {
      if (prevA !== undefined) process.env.ANTHROPIC_API_KEY = prevA;
      if (prevR !== undefined) process.env.OPENROUTER_API_KEY = prevR;
      if (prevO !== undefined) process.env.OPENAI_API_KEY = prevO;
    }
  });

  test("POST /api/chat narrows daily-focus and portfolio-truth questions before live chat", () => {
    const focusPrompt = buildUserPromptForRequest("What should I check first today?");
    expect(focusPrompt).toContain("Begin with `Top priority:`");
    expect(focusPrompt).toContain("Do not summarize the whole context");
    expect(focusPrompt).toContain("Do not use bullets or numbered sections");

    const oneSentencePrompt = buildUserPromptForRequest("In one sentence, what should I check first today?");
    expect(oneSentencePrompt).toContain("Keep the whole answer to one sentence");

    const portfolioPrompt = buildUserPromptForRequest("Is my portfolio live or sample?");
    expect(portfolioPrompt).toContain("Begin with `Portfolio state:`");
    expect(portfolioPrompt).toContain("sample, manual, or imported");
    expect(portfolioPrompt).toContain("Do not mention unrelated alerts");

    const sampleDailyPrompt = buildUserPromptForRequest(
      "What should I focus on today with this sample portfolio?",
    );
    expect(sampleDailyPrompt).toContain("Begin with `Portfolio state:` in one sentence, then `Top priority:`");
    expect(sampleDailyPrompt).toContain("before calling any holding mine/yours");
  });

  test("POST /api/chat accepts OpenAI-style messages and still applies daily-focus cleanup", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevR = process.env.OPENROUTER_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";

    globalThis.fetch = ((url, init) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      const userContent = JSON.stringify(body.messages);
      expect(userContent).toContain("Begin with `Top priority:`");
      expect(userContent).toContain("Keep the whole answer to one sentence");
      expect(userContent).not.toContain("Summarize the advisory context");

      return Promise.resolve(
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"Here is the context. Top priority: Check NVDA first because it is trading much more than usual; next, review the position before adding exposure."}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    try {
      const res = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: [{ role: "user", content: "In one sentence, what should I check first today?" }],
          }),
        }),
      );
      const text = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("X-Chat-Mode")).toBe("openrouter");
      expect(res.headers.get("X-Chat-Cleanup-Mode")).toBe("daily-focus");
      expect(text).toStartWith("Top priority:");
      expect(text).not.toContain("Here is the context");
    } finally {
      globalThis.fetch = originalFetch;
      if (prevA === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevA;
      if (prevR === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevR;
      if (prevO === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevO;
    }
  });

  test("POST /api/chat uses replay context from the page route before live chat", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevR = process.env.OPENROUTER_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    let systemPrompt = "";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";

    globalThis.fetch = ((url, init) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      systemPrompt = String(body.messages[0]?.content ?? "");

      return Promise.resolve(
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"Top priority: Treat this as a rewound view and do not use current memory."}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    try {
      const res = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            message: "What should I focus on today?",
            page_context: {
              surface: "Today",
              route: "/?as_of=2026-05-01T00:00:00.000Z",
              summary: "The user is looking at a rewound Today page.",
            },
          }),
        }),
      );

      expect(res.status).toBe(200);
      expect(systemPrompt).toContain("No snapshot by replay time");
      expect(systemPrompt).toContain(`"route":"/?as_of=2026-05-01T00:00:00.000Z"`);
      expect(systemPrompt).not.toContain("Fresh today");
      expect(systemPrompt).not.toContain("7 saved context notes");
      await expect(res.text()).resolves.toContain("rewound view");
    } finally {
      globalThis.fetch = originalFetch;
      if (prevA === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevA;
      if (prevR === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevR;
      if (prevO === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevO;
    }
  });

  test("POST /api/chat streams through OpenRouter when its key is set", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevR = process.env.OPENROUTER_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    const prevM = process.env.OPENROUTER_MODEL;
    const originalFetch = globalThis.fetch;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.OPENROUTER_MODEL = "deepseek/deepseek-chat";

    globalThis.fetch = ((url, init) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-openrouter-key",
      );
      expect((init?.headers as Record<string, string>)["X-OpenRouter-Title"]).toBe("Master Mold");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("deepseek/deepseek-chat");
      expect(body.max_tokens).toBe(700);
      expect(JSON.stringify(body.messages)).toContain("inference_budget");
      expect(JSON.stringify(body.messages)).toContain("local size limit");
      expect(JSON.stringify(body.messages)).toContain("Short questions can use a saved chat key");
      expect(JSON.stringify(body.messages)).toContain("The Today Save context for chat action only saves or refreshes local app context for chat");

      return Promise.resolve(
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"1. mixed reasons "}}]}',
            'data: {"choices":[{"delta":{"content":"to watch: "}}]}',
            'data: {"choices":[{"delta":{"content":"BTC is worth checking."}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    try {
      const res = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: "Explain today's top alert." }),
        }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Chat-Mode")).toBe("openrouter");
      expect(res.headers.get("X-Chat-Max-Response-Tokens")).toBe("700");
      expect(Number(res.headers.get("X-Chat-Estimated-Prompt-Tokens"))).toBeGreaterThan(0);
      await expect(res.text()).resolves.toBe("1. Mixed picture: BTC is worth checking.");
    } finally {
      globalThis.fetch = originalFetch;
      if (prevA === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevA;
      if (prevR === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevR;
      if (prevO === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevO;
      if (prevM === undefined) delete process.env.OPENROUTER_MODEL;
      else process.env.OPENROUTER_MODEL = prevM;
    }
  });

  test("POST /api/chat cleans budget answers that deny live chat can happen", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevR = process.env.OPENROUTER_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";

    globalThis.fetch = ((() =>
      Promise.resolve(
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"No real-money execution or outside AI calls are made."}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
          { status: 200 },
        ),
      )) as unknown) as typeof fetch;

    try {
      const res = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: "Does Master Mold have a local chat size limit?" }),
        }),
      );
      const text = await res.text();

      expect(text).toContain("No real-money execution happens");
      expect(text).toContain("Short questions may use live chat when a key is saved");
      expect(text).not.toContain("No real-money execution or outside AI calls are made");
      expect(text).not.toContain("No outside AI calls are made");
    } finally {
      globalThis.fetch = originalFetch;
      if (prevA === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevA;
      if (prevR === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevR;
      if (prevO === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevO;
    }
  });

  test("POST /api/chat cleans awkward mixed-picture source wording", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevR = process.env.OPENROUTER_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";

    globalThis.fetch = ((() =>
      Promise.resolve(
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"For deeper checks, review Today’s a mixed picture."}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
          { status: 200 },
        ),
      )) as unknown) as typeof fetch;

    try {
      const res = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: "What sources did today's read use?" }),
        }),
      );
      const text = await res.text();

      expect(text).toContain("review today's read");
      expect(text).not.toMatch(/Today.?s a mixed picture/i);
    } finally {
      globalThis.fetch = originalFetch;
      if (prevA === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevA;
      if (prevR === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevR;
      if (prevO === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevO;
    }
  });

  test("POST /api/chat stops before live chat when the local size limit is exceeded", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevR = process.env.OPENROUTER_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.MASTERMOLD_CHAT_MAX_TOTAL_TOKENS = "1000";
    let calledProvider = false;
    globalThis.fetch = ((() => {
      calledProvider = true;
      return Promise.resolve(new Response("", { status: 200 }));
    }) as unknown) as typeof fetch;

    try {
      const res = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: "Explain today's top alert." }),
        }),
      );
      const body = await json<{ code: string; error: string; provider: string }>(res);

      expect(res.status).toBe(413);
      expect(calledProvider).toBe(false);
      expect(res.headers.get("X-Chat-Error-Code")).toBe("budget");
      expect(res.headers.get("X-Chat-Mode")).toBe("canned");
      expect(res.headers.get("X-Chat-Max-Total-Tokens")).toBe("1000");
      expect(body.code).toBe("budget");
      expect(body.provider).toBe("Master Mold");
      expect(body.error).toContain("too large to send to live chat");
    } finally {
      globalThis.fetch = originalFetch;
      if (prevA === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevA;
      if (prevR === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevR;
      if (prevO === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevO;
    }
  });

  test("POST /api/chat classifies OpenRouter model failures with provider context", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevR = process.env.OPENROUTER_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    const prevM = process.env.OPENROUTER_MODEL;
    const originalFetch = globalThis.fetch;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.OPENROUTER_MODEL = "missing/model";

    globalThis.fetch = ((() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "model missing/model not found" } }), {
          status: 404,
        }),
      )) as unknown) as typeof fetch;

    try {
      const res = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: "Explain today's top alert." }),
        }),
      );
      const body = await json<{ provider: string; code: string }>(res);

      expect(res.status).toBe(502);
      expect(res.headers.get("X-Chat-Mode")).toBe("openrouter");
      expect(res.headers.get("X-Chat-Model")).toBe("missing/model");
      expect(res.headers.get("X-Chat-Error-Code")).toBe("model");
      expect(body.provider).toBe("OpenRouter");
      expect(body.code).toBe("model");
    } finally {
      globalThis.fetch = originalFetch;
      if (prevA === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevA;
      if (prevR === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevR;
      if (prevO === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevO;
      if (prevM === undefined) delete process.env.OPENROUTER_MODEL;
      else process.env.OPENROUTER_MODEL = prevM;
    }
  });

  test("POST /api/metrics records five-minute loop signals and GET summarizes them", async () => {
    const posted = await postMetricsRoute(
      new Request("http://localhost/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          event: "today_read_time",
          surface: "today",
          value: 42,
          metadata: { source: "test" },
        }),
      }),
    );

    await postMetricsRoute(
      new Request("http://localhost/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          event: "alert_feedback",
          surface: "alerts",
          entity_id: "alert_test",
          metadata: { useful: false },
        }),
      }),
    );

    await postMetricsRoute(
      new Request("http://localhost/api/metrics", {
        method: "POST",
        body: JSON.stringify({
          event: "briefing_feedback",
          surface: "today",
          metadata: { useful: true },
        }),
      }),
    );

    const summary = await json<{
      events: Array<{ area: string; surface?: string }>;
      activity_counts: Array<{ activity: string; count: number }>;
      briefing_ratings: {
        useful: number;
        not_useful: number;
        useful_share: number | null;
      };
      alert_ratings: {
        useful: number;
        not_useful: number;
        useful_share: number | null;
        not_useful_share: number | null;
      };
      today_read: { median_seconds: number | null; target_seconds: number; under_target: boolean | null };
      score_accuracy: {
        closed_calls: number;
        average_miss: number | null;
        close_enough: boolean | null;
      };
    }>(getMetricsRoute());

    expect(posted.status).toBe(201);
    expect(summary.activity_counts).toContainEqual({ activity: "Today read", count: 1 });
    expect(summary.activity_counts).toContainEqual({ activity: "Today rated", count: 1 });
    expect(summary.events.some((event) => event.area === "Today")).toBe(true);
    expect(summary.events.every((event) => event.surface === undefined)).toBe(true);
    expect(summary.briefing_ratings.useful_share).toBe(1);
    expect(summary.alert_ratings.not_useful).toBe(1);
    expect(summary.alert_ratings.not_useful_share).toBe(1);
    expect(summary.today_read).toEqual({ median_seconds: 42, target_seconds: 300, under_target: true });
    expect(summary.score_accuracy.closed_calls).toBeGreaterThan(0);
    expect(summary.score_accuracy.average_miss).not.toBeNull();
    expect(JSON.stringify(summary)).not.toMatch(
      /"surface"|calibration|engine_alert|volume_z|T0|signal|conviction|usefulness_rate|precision_rate|fatigue_rate|mean_abs_error|within_confidence_band|median_today_read_seconds/i,
    );
  });

  test("POST /api/integrations/test rejects missing Coinbase credentials clearly", async () => {
    const res = await postIntegrationTestRoute(
      new Request("http://localhost/api/integrations/test", {
        method: "POST",
        body: JSON.stringify({ service: "coinbase" }),
      }),
    );
    const body = await json<{ ok: boolean; message: string; docs_url: string }>(res);

    expect(res.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(body.message).toContain("Coinbase");
    expect(body.docs_url).toContain("coinbase");
  });

  test("POST /api/portfolio/import rejects missing Coinbase credentials with setup docs", async () => {
    const res = await postPortfolioImportRoute(
      new Request("http://localhost/api/portfolio/import", {
        method: "POST",
        body: JSON.stringify({ service: "coinbase" }),
      }),
    );
    const body = await json<{ message: string; docs_url: string }>(res);

    expect(res.status).toBe(422);
    expect(body.message).toBe("Paste a Coinbase accounts JWT first.");
    expect(body.docs_url).toContain("docs.cdp.coinbase.com");
  });

  test("POST /api/integrations/test runs a tiny OpenRouter inference check", async () => {
    const prevKey = process.env.OPENROUTER_API_KEY;
    const prevModel = process.env.OPENROUTER_MODEL;
    const originalFetch = globalThis.fetch;
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.OPENROUTER_MODEL = "deepseek/deepseek-chat";
    globalThis.fetch = ((url, init) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-openrouter-key",
      );
      expect((init?.headers as Record<string, string>)["X-OpenRouter-Title"]).toBe("Master Mold");
      return Promise.resolve(
        Response.json({ choices: [{ message: { content: "OK" } }] }, { status: 200 }),
      );
    }) as typeof fetch;

    try {
      const res = await postIntegrationTestRoute(
        new Request("http://localhost/api/integrations/test", {
          method: "POST",
          body: JSON.stringify({ service: "llm", provider: "openrouter" }),
        }),
      );
      const body = await json<{ ok: boolean; service: string; message: string; evidence: string }>(res);

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.service).toBe("live_chat");
      expect(body.message).toBe("Live chat test passed.");
      expect(body.evidence).toBe("The selected chat service responded.");
      expect(JSON.stringify(body)).not.toMatch(/"service":"llm"|deepseek|inference test passed/i);
    } finally {
      globalThis.fetch = originalFetch;
      if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevKey;
      if (prevModel === undefined) delete process.env.OPENROUTER_MODEL;
      else process.env.OPENROUTER_MODEL = prevModel;
    }
  });

  test("POST /api/integrations/test reports SnapTrade read and trade-capable accounts without enabling trades", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url) => {
      expect(String(url)).toContain("https://api.snaptrade.com/api/v1/authorizations");
      return Promise.resolve(
        Response.json([
          { id: "read-connection", type: "read" },
          { id: "trade-connection", type: "trade" },
          { id: "unknown-connection" },
        ]),
      );
    }) as typeof fetch;

    try {
      const res = await postIntegrationTestRoute(
        new Request("http://localhost/api/integrations/test", {
          method: "POST",
          body: JSON.stringify({
            service: "robinhood",
            client_id: "client",
            consumer_key: "consumer",
            user_id: "user",
            user_secret: "secret",
          }),
        }),
      );
      const body = await json<{ ok: boolean; message: string; evidence: string }>(res);

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.message).toContain("connection list");
      expect(body.evidence).toContain("1 read-only");
      expect(body.evidence).toContain("1 trade-capable");
      expect(body.evidence).toContain("never calls order endpoints");
      expect(body.evidence).toContain("Use the import button");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("POST /api/portfolio/import reads SnapTrade unified positions as snapshots", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url) => {
      const href = String(url);
      if (href.startsWith("https://api.snaptrade.com/api/v1/accounts?")) {
        return Promise.resolve(
          Response.json([
            {
              id: "acct_snap_aapl",
              institution_name: "Robinhood",
              sync_status: { holdings: { last_successful_sync: "2026-06-01T10:00:00.000Z" } },
            },
          ]),
        );
      }
      expect(href).toContain("https://api.snaptrade.com/api/v1/accounts/acct_snap_aapl/positions/all?");
      return Promise.resolve(
        Response.json({
          results: [
            {
              instrument: {
                kind: "stock",
                symbol: "AAPL",
                raw_symbol: "AAPL",
                description: "Apple Inc.",
              },
              units: "10.5",
              price: "123.45",
              cost_basis: "118.20",
            },
          ],
          data_freshness: { as_of: "2026-06-02T14:30:00.000Z" },
        }),
      );
    }) as typeof fetch;

    try {
      const imported = await json<{
        ok: boolean;
        imported_count: number;
        portfolio: {
          provenance: { label: string };
          imported_holdings: Array<{
            symbol: string;
            quantity: number;
            paid_amount: number;
            value: number;
            source_label: string;
            account_label: string;
            as_of: string;
          }>;
        };
      }>(
        await postPortfolioImportRoute(
          new Request("http://localhost/api/portfolio/import", {
            method: "POST",
            body: JSON.stringify({
              service: "robinhood",
              client_id: "client",
              consumer_key: "consumer",
              user_id: "user",
              user_secret: "secret",
            }),
          }),
        ),
      );

      expect(imported.ok).toBe(true);
      expect(imported.imported_count).toBe(1);
      expect(imported.portfolio.provenance.label).toBe("Imported portfolio");
      expect(imported.portfolio.imported_holdings).toEqual([
        expect.objectContaining({
          symbol: "AAPL",
          quantity: 10.5,
          paid_amount: 1241.1,
          value: 1296.23,
          source_label: "Imported holding",
          account_label: "Robinhood",
          as_of: "2026-06-02T14:30:00.000Z",
        }),
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("POST /api/portfolio/import reads Coinbase CDP accounts and balances as snapshots", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url, init) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer cdp-jwt");
      if (String(url) === "https://api.cdp.coinbase.com/platform/v2/accounts?pageSize=250") {
        return Promise.resolve(
          Response.json({
            accounts: [
              {
                accountId: "account_btc",
                name: "Coinbase BTC",
                updatedAt: "2026-06-09T12:00:00.000Z",
              },
            ],
          }),
        );
      }
      expect(String(url)).toBe("https://api.cdp.coinbase.com/platform/v2/accounts/account_btc/balances?pageSize=250");
      return Promise.resolve(
        Response.json({
          balances: [
            {
              asset: { symbol: "btc", type: "crypto", name: "Bitcoin" },
              amount: {
                btc: { available: "0.5", total: "0.5" },
                usd: { available: "50000", total: "50000" },
              },
            },
          ],
        }),
      );
    }) as typeof fetch;

    try {
      const imported = await json<{
        ok: boolean;
        imported_count: number;
        portfolio: {
          provenance: { label: string; source: string };
          imported_holdings: Array<{ symbol: string; value: number; source_label: string; account_label: string }>;
        };
      }>(
        await postPortfolioImportRoute(
          new Request("http://localhost/api/portfolio/import", {
            method: "POST",
            body: JSON.stringify({
              service: "coinbase",
              api_key: "cdp-jwt",
            }),
          }),
        ),
      );

      expect(imported.ok).toBe(true);
      expect(imported.imported_count).toBe(1);
      expect(imported.portfolio.provenance.label).toBe("Imported portfolio");
      expect(imported.portfolio.imported_holdings).toEqual([
        expect.objectContaining({
          symbol: "BTC",
          value: 50000,
          source_label: "Imported holding",
          account_label: "Coinbase BTC",
        }),
      ]);
      expect(JSON.stringify(imported)).not.toMatch(/api.coinbase.com|brokerage|cost_basis|asset_class/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("POST /api/portfolio/import reports account entries skipped for missing prices", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url, init) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer cdp-jwt");
      if (String(url) === "https://api.cdp.coinbase.com/platform/v2/accounts?pageSize=250") {
        return Promise.resolve(
          Response.json({
            accounts: [
              {
                accountId: "account_mixed",
                name: "Coinbase mixed",
                updatedAt: "2026-06-09T12:00:00.000Z",
              },
            ],
          }),
        );
      }
      expect(String(url)).toBe("https://api.cdp.coinbase.com/platform/v2/accounts/account_mixed/balances?pageSize=250");
      return Promise.resolve(
        Response.json({
          balances: [
            {
              asset: { symbol: "btc", type: "crypto", name: "Bitcoin" },
              amount: {
                btc: { total: "0.25" },
                usd: { total: "25000" },
              },
            },
            {
              asset: { symbol: "mystery", type: "crypto", name: "Mystery Token" },
              amount: {
                mystery: { total: "12" },
              },
            },
          ],
        }),
      );
    }) as typeof fetch;

    try {
      const imported = await json<{
        ok: boolean;
        message: string;
        imported_count: number;
        skipped_count: number;
        issues: Array<{ symbol: string; name: string; reason: string }>;
        portfolio: {
          import_snapshot: {
            count: number;
            skipped_count: number;
            issue_count: number;
            issues: Array<{ symbol: string; name: string; reason: string }>;
            note: string;
          };
          imported_holdings: Array<{ symbol: string; value: number }>;
        };
      }>(
        await postPortfolioImportRoute(
          new Request("http://localhost/api/portfolio/import", {
            method: "POST",
            body: JSON.stringify({
              service: "coinbase",
              api_key: "cdp-jwt",
            }),
          }),
        ),
      );

      expect(imported.ok).toBe(true);
      expect(imported.imported_count).toBe(1);
      expect(imported.skipped_count).toBe(1);
      expect(imported.message).toContain("skipped because price or amount was missing");
      expect(imported.issues).toEqual([
        {
          symbol: "MYSTERY",
          name: "Mystery Token",
          reason: "Account source did not return a usable price.",
        },
      ]);
      expect(imported.portfolio.import_snapshot.count).toBe(1);
      expect(imported.portfolio.import_snapshot.skipped_count).toBe(1);
      expect(imported.portfolio.import_snapshot.issue_count).toBe(1);
      expect(imported.portfolio.import_snapshot.note).toContain("Some account entries were skipped");
      expect(imported.portfolio.import_snapshot.issues).toEqual(imported.issues);
      expect(imported.portfolio.imported_holdings).toEqual([
        expect.objectContaining({ symbol: "BTC", value: 25000 }),
      ]);
      expect(JSON.stringify(imported)).not.toMatch(/cost_basis|asset_class|api.coinbase.com/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("POST /api/portfolio/import stores read-only wallet holdings separately from manual and sample data", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url, init) => {
      expect(String(url)).toBe("https://api.zerion.io/v1/wallets/0xabc/positions/");
      expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
      return Promise.resolve(
        Response.json({
          data: [
            {
              id: "eth-position",
              attributes: {
                name: "Ethereum",
                quantity: { float: 2 },
                value: 6400,
                price: 3200,
                changes: { percent_1d: 1.2 },
                fungible_info: { symbol: "ETH", name: "Ethereum" },
              },
              relationships: { chain: { data: { id: "ethereum" } } },
            },
          ],
        }),
      );
    }) as typeof fetch;

    try {
      const imported = await json<{
        ok: boolean;
        imported_count: number;
        portfolio: {
          provenance: { label: string; source: string };
          import_snapshot: { status: string; count: number; is_stale: boolean; note: string };
          imported_holdings: Array<{ symbol: string; source_label: string; account_label: string }>;
        };
      }>(
        await postPortfolioImportRoute(
          new Request("http://localhost/api/portfolio/import", {
            method: "POST",
            body: JSON.stringify({
              service: "onchain_wallet",
              api_key: "zerion-key",
              wallet_address: "0xabc",
            }),
          }),
        ),
      );
      const portfolio = await json<{
        provenance: { label: string; source: string };
        import_snapshot: { status: string; count: number; is_stale: boolean; note: string };
        imported_holdings: Array<{ symbol: string; source_label: string; account_label: string }>;
      }>(getPortfolioRoute(req("/api/portfolio")));
      const chatContext = JSON.parse(getChatContext().llm_context);

      expect(imported.ok).toBe(true);
      expect(imported.imported_count).toBe(1);
      expect(imported.portfolio.provenance.label).toBe("Imported portfolio");
      expect(imported.portfolio.import_snapshot.status).toBe("Fresh snapshot");
      expect(portfolio.provenance.label).toBe("Imported portfolio");
      expect(portfolio.provenance.source).toContain("Imported holdings snapshots");
      expect(portfolio.import_snapshot.count).toBe(1);
      expect(portfolio.import_snapshot.is_stale).toBe(false);
      expect(portfolio.import_snapshot.note).toContain("do not refresh automatically");
      expect(portfolio.imported_holdings).toEqual([
        expect.objectContaining({
          symbol: "ETH",
          source_label: "Imported holding",
          account_label: "Wallet import",
        }),
      ]);
      expect(JSON.stringify(portfolio)).not.toMatch(/source":"connected|cost_basis|asset_class|integration_status|defi/i);
      expect(chatContext.data_state.portfolio_state).toBe("Imported portfolio");
      expect(chatContext.portfolio.imported_holding_count).toBe(1);
      expect(chatContext.portfolio.import_snapshot.status).toBe("Fresh snapshot");
      expect(chatContext.portfolio.import_status).toContain("imported holdings snapshot");
      expect(chatContext.portfolio.import_status).toContain("no automatic refresh");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("GET /api/portfolio marks old imported holdings as stale snapshots", async () => {
    const oldRow: ImportedHoldingRow = {
      id: "import_coinbase_old_btc",
      service: "coinbase",
      account_id: "coinbase-old",
      account_label: "Coinbase import",
      symbol: "BTC",
      asset_name: "Bitcoin",
      asset_class: "crypto",
      venue: "Coinbase",
      quantity: 1,
      price: 100000,
      cost_basis: 90000,
      daily_change_pct: 0,
      imported_at: "2026-05-01T00:00:00.000Z",
      as_of: "2026-05-01T00:00:00.000Z",
    };

    replaceImportedHoldings("coinbase", [oldRow]);
    const portfolio = await json<{
      provenance: { label: string };
      import_snapshot: { status: string; is_stale: boolean; note: string; latest_as_of: string | null };
    }>(getPortfolioRoute(req("/api/portfolio")));
    const chatContext = JSON.parse(getChatContext().llm_context);

    expect(portfolio.provenance.label).toBe("Imported portfolio");
    expect(portfolio.import_snapshot.status).toBe("Stale snapshot");
    expect(portfolio.import_snapshot.is_stale).toBe(true);
    expect(portfolio.import_snapshot.note).toContain("Use Settings import again");
    expect(portfolio.import_snapshot.latest_as_of).toBe("2026-05-01T00:00:00.000Z");
    expect(chatContext.portfolio.import_snapshot.status).toBe("Stale snapshot");
    expect(chatContext.portfolio.import_status).toContain("Stale snapshot");
  });

  test("POST /api/brain/initialize persists market memory facts", async () => {
    const prevBrainLlm = process.env.MASTERMOLD_BRAIN_LLM;
    delete process.env.MASTERMOLD_BRAIN_LLM;
    try {
      const initialized = await json<{
        initialized: boolean;
        latest_snapshot: { status: string; evidence_count: number; symbols: string[]; saved_at: string; happened_at: string } | null;
        snapshot_history: Array<{ id: string; status: string; evidence_count: number; happened_at: string }>;
        snapshot_sources: Array<{ key: string; status: string; detail: string }>;
        facts: Array<{
          summary: string;
          category: string;
          topic?: string;
          evidence_count: number;
          source_links: string[];
          saved_at: string;
          happened_at: string;
          evidence_urls?: string[];
        }>;
      }>(await postBrainInitializeRoute());
      const current = await json<{
        initialized: boolean;
        latest_snapshot: { status: string; evidence_count: number } | null;
        schedule: { enabled: boolean; status: string; next_run: string | null; last_check_message: string | null };
        snapshot_history: Array<{ id: string; status: string; evidence_count: number; happened_at: string }>;
        snapshot_sources: Array<{ key: string; status: string; detail: string }>;
        summary: {
          memory_count: number;
          evidence_count: number;
          chat_context: string;
          run_schedule: string;
          snapshot_freshness: string;
        };
      }>(await getBrainRoute(req("/api/brain")));
      const replayedBeforeMemory = await json<{
        initialized: boolean;
        latest_snapshot: null;
        snapshot_history: unknown[];
        facts: unknown[];
        schedule: { status: string; note: string; last_check_message: string | null };
        summary: { snapshot_freshness: string; memory_count: number; chat_context: string };
      }>(await getBrainRoute(req("/api/brain?as_of=2026-05-01T00:00:00.000Z")));
      const chatContext = JSON.parse(getChatContext().llm_context);
      const chatReplayAsOf = parseAsOf("2026-05-01T00:00:00.000Z");
      if (!chatReplayAsOf.ok) throw new Error(chatReplayAsOf.error);
      const replayedChatContext = JSON.parse(getChatContext(chatReplayAsOf.asOf).llm_context);

      expect(initialized.initialized).toBe(true);
      expect(initialized.latest_snapshot?.status).toBe("Saved");
      expect(initialized.latest_snapshot?.evidence_count).toBeGreaterThan(0);
      expect(initialized.latest_snapshot?.symbols.length).toBeGreaterThan(0);
      expect(initialized.latest_snapshot?.saved_at).toBeTruthy();
      expect(initialized.latest_snapshot?.happened_at).toBeTruthy();
      expect(initialized.snapshot_history.length).toBeGreaterThan(0);
      expect(initialized.snapshot_history[0].status).toBe("Saved");
      expect(initialized.snapshot_history[0].happened_at).toBeTruthy();
      expect(initialized.snapshot_sources.map((source) => source.key)).toContain("account-imports");
      expect(initialized.snapshot_sources.find((source) => source.key === "account-imports")?.status).toBe("No imported holdings");
      expect(initialized.snapshot_sources.find((source) => source.key === "market-news")?.detail).toContain("does not fetch fresh news");
      expect(initialized.snapshot_sources.find((source) => source.key === "borrow-rates")?.detail).toContain("no live borrow-rate feed is connected");
      expect(initialized.facts.length).toBeGreaterThan(0);
      expect(initialized.facts[0].summary).toContain("not imported money");
      expect(initialized.facts.every((fact) => fact.category.length > 0 && Array.isArray(fact.source_links))).toBe(true);
      expect(initialized.facts.every((fact) => fact.saved_at && fact.happened_at)).toBe(true);
      expect(initialized.facts.every((fact) => fact.topic === undefined && fact.evidence_urls === undefined)).toBe(true);
      expect(JSON.stringify(initialized)).not.toMatch(/latest_run|recent_runs|source_ledger|source_count|inference_model|local_seed|Seeded|evidence_urls|"topic"|event_time|knowledge_time/i);
      expect(JSON.stringify(initialized)).not.toMatch(/engine scan|fresh market read|exchange feed is running|broader market\/news/i);
      expect(current.initialized).toBe(true);
      expect(current.latest_snapshot?.status).toBe("Saved");
      expect(current.snapshot_history.length).toBeGreaterThan(0);
      expect(current.snapshot_sources.find((source) => source.key === "visible-portfolio")?.status).toBe("Sample only");
      expect(current.snapshot_sources.find((source) => source.key === "account-imports")?.detail).toContain("do not add holdings by themselves");
      expect(current.schedule.enabled).toBe(false);
      expect(current.schedule.status).toBe("On demand only");
      expect(current.schedule.next_run).toBe(null);
      expect(current.schedule.last_check_message).toBeNull();
      expect(current.summary.memory_count).toBeGreaterThan(0);
      expect(replayedChatContext.market_brain.initialized).toBe(false);
      expect(replayedChatContext.market_brain.snapshot_freshness).toBe("No snapshot by replay time");
      expect(replayedChatContext.market_brain.memory_facts).toHaveLength(0);
      expect(replayedChatContext.daily_readiness.detail).toContain("chat context snapshot had been saved");
      expect(JSON.stringify(replayedChatContext)).not.toContain("Fresh today");
      expect(current.summary.evidence_count).toBeGreaterThan(0);
      expect(current.summary.chat_context).toBe("Included in chat");
      expect(current.summary.run_schedule).toBe("On demand only");
      expect(current.summary.snapshot_freshness).toBe("Saved today");
      expect(JSON.stringify(current)).not.toMatch(/latest_run|recent_runs|source_ledger|source_count|inference_model|local_seed|Seeded|evidence_urls|"topic"|event_time|knowledge_time/i);
      expect(JSON.stringify(current)).not.toMatch(/engine scan|fresh market read|exchange feed is running|broader market\/news/i);
      expect(replayedBeforeMemory.initialized).toBe(false);
      expect(replayedBeforeMemory.latest_snapshot).toBeNull();
      expect(replayedBeforeMemory.snapshot_history).toHaveLength(0);
      expect(replayedBeforeMemory.facts).toHaveLength(0);
      expect(replayedBeforeMemory.schedule.status).toBe("No memory at this time");
      expect(replayedBeforeMemory.schedule.note).toContain("No chat context snapshot had been saved");
      expect(replayedBeforeMemory.schedule.last_check_message).toBeNull();
      expect(replayedBeforeMemory.summary.snapshot_freshness).toBe("No snapshot by replay time");
      expect(replayedBeforeMemory.summary.memory_count).toBe(0);
      expect(replayedBeforeMemory.summary.chat_context).toBe("Not included yet");
      expect(JSON.stringify(replayedBeforeMemory)).not.toMatch(/Fresh today|latest_run|recent_runs|source_ledger|source_count|event_time|knowledge_time/i);
      expect(chatContext.market_brain.initialized).toBe(true);
      expect(chatContext.market_brain.schedule.status).toBe("On demand only");
      expect(chatContext.market_brain.schedule.enabled).toBe(false);
      expect(chatContext.market_brain.latest_snapshot?.evidence_count).toBeGreaterThan(0);
      expect(chatContext.market_brain.memory_facts[0].category).toBe("Visible portfolio");
      expect(chatContext.market_brain.memory_facts[0].summary).toContain("not imported money");
      expect(chatContext.market_brain.snapshot_sources.find((source: { label: string }) => source.label === "Account imports")?.detail).toContain("do not add holdings by themselves");
      expect(JSON.stringify(chatContext.market_brain)).not.toMatch(/latest_run|source_ledger|source_count|local_seed|evidence_urls|"topic"|knowledge_time/i);
    } finally {
      if (prevBrainLlm === undefined) delete process.env.MASTERMOLD_BRAIN_LLM;
      else process.env.MASTERMOLD_BRAIN_LLM = prevBrainLlm;
    }
  });

  test("POST /api/brain/schedule records disabled checks and can run an enabled local snapshot", async () => {
    const prevBrainLlm = process.env.MASTERMOLD_BRAIN_LLM;
    delete process.env.MASTERMOLD_BRAIN_LLM;
    try {
      const disabled = await json<{
        ok: boolean;
        status: string;
        message: string;
        state: {
          initialized: boolean;
          schedule: { enabled: boolean; last_check_status: string; status: string; last_check_message: string | null };
        };
      }>(
        await postBrainScheduleRoute(
          new Request("http://localhost/api/brain/schedule", {
            method: "POST",
            body: JSON.stringify({ trigger: "test" }),
          }),
        ),
      );
      const disabledStatus = await json<{
        ok: boolean;
        schedule: { enabled: boolean; last_check_status: string; status: string; last_check_message: string | null };
      }>(await getBrainScheduleRoute());

      expect(disabled.ok).toBe(true);
      expect(disabled.status).toBe("disabled");
      expect(disabled.message).toContain("No snapshot changed");
      expect(disabled.state.initialized).toBe(false);
      expect(disabled.state.schedule.last_check_message).toContain("Chat context automation is off");
      expect(disabledStatus.schedule.enabled).toBe(false);
      expect(disabledStatus.schedule.last_check_status).toBe("disabled");
      expect(disabledStatus.schedule.last_check_message).toContain("Chat context automation is off");

      const configured = await json<{
        ok: boolean;
        status: string;
        message: string;
        state: {
          schedule: { enabled: boolean; cadence: string; status: string; last_configured: string | null };
        };
      }>(
        await postBrainScheduleRoute(
          new Request("http://localhost/api/brain/schedule", {
            method: "POST",
            body: JSON.stringify({ trigger: "test", enabled: true }),
          }),
        ),
      );
      expect(configured.ok).toBe(true);
      expect(configured.status).toBe("configured");
      expect(configured.message).toContain("Chat context automation is on");
      expect(configured.message).toContain("import holdings again when you want current balances");
      expect(configured.state.schedule.enabled).toBe(true);
      expect(configured.state.schedule.cadence).toBe("daily");
      expect(configured.state.schedule.last_configured).toBeTruthy();

      const openedSettings = await getBrainStateAfterDueScheduleCheck({ trigger: "settings-open" });
      const checkEventsAfterOpen = store()
        .productEvents()
        .filter((event) => event.event === "brain_schedule_check");
      const latestCheckMetadata = checkEventsAfterOpen[0].metadata as { status?: string; trigger?: string };

      expect(openedSettings.initialized).toBe(true);
      expect(openedSettings.latest_run?.status).toBe("complete");
      expect(openedSettings.schedule.enabled).toBe(true);
      expect(openedSettings.schedule.last_check_status).toBe("ran");
      expect(openedSettings.schedule.last_check_message).toContain("Chat context check saved a snapshot");
      expect(latestCheckMetadata.status).toBe("ran");
      expect(latestCheckMetadata.trigger).toBe("settings-open");

      const openedSettingsAgain = await getBrainStateAfterDueScheduleCheck({ trigger: "settings-open" });
      const checkEventsAfterSecondOpen = store()
        .productEvents()
        .filter((event) => event.event === "brain_schedule_check");

      expect(openedSettingsAgain.initialized).toBe(true);
      expect(openedSettingsAgain.schedule.last_check_status).toBe("ran");
      expect(checkEventsAfterSecondOpen).toHaveLength(checkEventsAfterOpen.length);

      const ran = await json<{
        ok: boolean;
        status: string;
        message: string;
        state: {
          initialized: boolean;
          latest_snapshot: { status: string; evidence_count: number } | null;
          schedule: { enabled: boolean; cadence: string; last_check_status: string; status: string; last_check_message: string | null };
        };
      }>(
        await postBrainScheduleRoute(
          new Request("http://localhost/api/brain/schedule", {
            method: "POST",
            body: JSON.stringify({ trigger: "test", force: true }),
          }),
        ),
      );

      expect(ran.ok).toBe(true);
      expect(ran.status).toBe("ran");
      expect(ran.message).toContain("Chat context check saved a snapshot");
      expect(ran.state.initialized).toBe(true);
      expect(ran.state.latest_snapshot?.status).toBe("Saved");
      expect(ran.state.latest_snapshot?.evidence_count).toBeGreaterThan(0);
      expect(ran.state.schedule.enabled).toBe(true);
      expect(ran.state.schedule.cadence).toBe("daily");
      expect(ran.state.schedule.last_check_message).toContain("Chat context check saved a snapshot");
      expect(JSON.stringify(ran)).not.toMatch(/latest_run|recent_runs|source_ledger|source_count|inference_model|local_seed/i);
    } finally {
      if (prevBrainLlm === undefined) delete process.env.MASTERMOLD_BRAIN_LLM;
      else process.env.MASTERMOLD_BRAIN_LLM = prevBrainLlm;
    }
  });
});

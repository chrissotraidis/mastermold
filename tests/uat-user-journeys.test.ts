/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET as getAlertsRoute } from "@/app/api/alerts/route";
import { GET as getBriefingRoute } from "@/app/api/briefing/route";
import { GET as getBriefingDetailRoute } from "@/app/api/briefing/[id]/route";
import { POST as postChatRoute } from "@/app/api/chat/route";
import { GET as getExecutorRoute } from "@/app/api/executor/route";
import { GET as getJournalRoute } from "@/app/api/journal/route";
import { GET as getPaperRoute } from "@/app/api/paper/route";
import { GET as getPortfolioRoute } from "@/app/api/portfolio/route";
import { POST as postPortfolioRoute } from "@/app/api/portfolio/route";
import { DELETE as deleteManualHoldingRoute } from "@/app/api/portfolio/manual/[id]/route";
import { GET as getStatusRoute } from "@/app/api/status/route";
import { parseAsOf } from "@/src/db/bitemporal";
import { getAlerts as getInternalAlerts } from "@/src/db/alerts";
import { getBrainState } from "@/src/db/brain";
import { getBriefingCards as getInternalBriefingCards } from "@/src/db/briefing";
import { getPortfolio as getInternalPortfolio } from "@/src/db/portfolio";
import { __resetStoreForTests } from "@/src/db/store";
import { getChatContext } from "@/src/db/chat";
import { demoDatabase } from "@/src/db/seed-data";
import { getSystemState } from "@/src/db/system";
import {
  alertLoopActions,
  buildAlertIgnoreCondition,
  buildAlertPageContext,
  buildAlertSuggestedResponse,
  cleanAlertRationale,
  shortAlertTierLabel,
} from "@/lib/alert-loop";
import { buildBriefingJournalDraftHref } from "@/lib/briefing-journal-copy";
import { plainBriefingText } from "@/lib/plain-finance-copy";
import { portfolioConcentrationNote, portfolioPageSubtitle } from "@/lib/portfolio-copy";
import {
  buildTodayPaperHref,
  buildTodayPrompt,
  buildTodayRiskNote,
  todayHoldingDetail,
  todayHoldingPromptDetail,
  todayPortfolioScopePhrase,
  todayMorningSummary,
} from "@/lib/today-decision-copy";

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("UAT user journeys over seeded data", () => {
  test("GIVEN the reviewer seed persona WHEN the app boots with zero credentials THEN every primary surface has seeded backing data", async () => {
    const reviewer = demoDatabase.users.find((user) => user.email === "reviewer@demo.local");
    expect(reviewer?.role).toBe("reviewer");

    const briefing = await responseJson<Array<{ asset_keys: string[]; asset_ids?: string[] }>>(
      getBriefingRoute(new Request("http://localhost/api/briefing")),
    );
    const alerts = await responseJson<unknown[]>(getAlertsRoute(new Request("http://localhost/api/alerts")));
    const portfolioApi = await responseJson<{
      holdings: Array<{
        name: string;
        source_label: "Sample holding" | "Manual entry" | "Imported holding";
        account_label: string;
        symbol: string;
        portfolio_share: number;
      }>;
      on_chain_positions: unknown[];
      provenance: { label: string };
    }>(getPortfolioRoute(new Request("http://localhost/api/portfolio")));
    const portfolio = getInternalPortfolio();
    const journal = await responseJson<{
      entries: unknown[];
      track_record: unknown[];
      provenance: { label: string };
    }>(getJournalRoute(new Request("http://localhost/api/journal")));
    const paper = await responseJson<{
      rounds: unknown[];
      paper_trades: unknown[];
      results: unknown[];
    }>(getPaperRoute(new Request("http://localhost/api/paper")));
    const executor = await responseJson<{
      strategies: unknown[];
      safety_drafts: unknown[];
      borrow_rate_preview: unknown[];
      provenance: { label: string };
    }>(getExecutorRoute(new Request("http://localhost/api/executor")));
    const integrations = await responseJson<unknown[]>(getStatusRoute());

    expect(briefing.length).toBeGreaterThanOrEqual(3);
    expect(briefing.every((card) => card.asset_keys.length > 0 && card.asset_ids === undefined)).toBe(true);
    expect(JSON.stringify(briefing)).not.toMatch(/asset_ids|asset_id|event_time|knowledge_time/i);
    expect(alerts.length).toBeGreaterThan(0);
    expect(portfolioApi.holdings.length).toBeGreaterThan(0);
    expect(portfolioApi.on_chain_positions.length).toBeGreaterThan(0);
    expect(portfolioApi.provenance.label).toBe("Sample data");
    expect(JSON.stringify(portfolioApi)).not.toMatch(/Demo data|cost_basis|asset_class|integration_status|stubbed|defi|source":"demo|event_time|knowledge_time/i);
    expect(todayHoldingDetail(portfolio.holdings[0])).toContain("sample holding");
    expect(todayHoldingPromptDetail(portfolio.holdings[0])).toContain("sample portfolio");
    expect(todayHoldingPromptDetail(portfolio.holdings[0])).toContain("not imported money");
    expect(todayPortfolioScopePhrase(portfolio.holdings[0])).toBe("the sample portfolio");
    expect(buildTodayPrompt(null, null, portfolio.holdings[0])).toContain("sample portfolio");
    expect(portfolioPageSubtitle()).toContain("Net worth, holdings, allocation");
    expect(portfolioPageSubtitle()).toContain("where each number came from");
    expect(portfolioPageSubtitle()).not.toMatch(/visible money picture|your visible money picture/i);
    expect(portfolioConcentrationNote(portfolio.holdings[0].symbol)).toContain("biggest visible position");
    expect(portfolioConcentrationNote(null)).toBe("No visible position yet");
    expect(portfolioConcentrationNote(portfolio.holdings[0].symbol)).not.toMatch(/your biggest position/i);
    expect(
      buildTodayPrompt(
        null,
        { message: "NVDA volume 2.1x avg", portfolio_weight_pct: 27, tier: "T0" },
        portfolio.holdings[0],
      ),
    ).toContain("It relates to 27.0% of the sample portfolio.");
    expect(
      buildTodayPrompt(
        {
          headline: "BTC moved up; check the bear case before adding risk",
          conviction: 6,
          horizon: "2-4 weeks",
          relevance_note: "BTC is the largest visible holding.",
        },
        { message: "NVDA volume 2.1x avg", portfolio_weight_pct: 27, tier: "T0" },
        portfolio.holdings[0],
      ),
    ).toContain("Focus 1 first, then urgent alerts or smaller checks.");
    expect(journal.entries.length).toBeGreaterThan(0);
    expect(journal.track_record.length).toBeGreaterThan(0);
    expect(["Sample data", "Saved read"]).toContain(journal.provenance.label);
    expect(JSON.stringify(journal)).not.toMatch(/event_time|knowledge_time|briefing_card_id|thesis_played_out|pnl_note/i);
    expect(paper.rounds.length).toBeGreaterThan(0);
    expect(paper.paper_trades.length).toBeGreaterThan(0);
    expect(paper.results.length).toBeGreaterThan(0);
    expect(JSON.stringify(paper)).not.toMatch(/fake_|predictions|conviction|calibration|asset_class|Demo data|Engine output|event_time|knowledge_time/i);
    expect(executor.strategies.length).toBeGreaterThan(0);
    expect(executor.safety_drafts.length).toBeGreaterThan(0);
    expect(executor.borrow_rate_preview.length).toBeGreaterThan(0);
    expect(executor.provenance.label).toBe("Sample data");
    expect(JSON.stringify(executor)).not.toMatch(/event_time|knowledge_time|guardrail_configs|funding_observations|net_delta|funding_rate|running_demo/i);
    expect(integrations.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(integrations)).toContain('"name":"chat_service"');
    expect(JSON.stringify(integrations)).not.toContain('"name":"provider"');
    expect(JSON.stringify(integrations)).not.toMatch(/AI test|AI key|ai_service|int_llm|"service":"llm"|event_time|knowledge_time/i);
  });

  test("GIVEN review readiness is required WHEN the review copy is checked THEN it names the seeded local persona and no-login path", () => {
    const reviewer = demoDatabase.users.find((user) => user.email === "reviewer@demo.local");
    const reviewPanelSource = readFileSync(join(process.cwd(), "components", "reviewer-evidence-panel.tsx"), "utf8");

    expect(reviewer?.role).toBe("reviewer");
    expect(reviewPanelSource).toContain("reviewer@demo.local");
    expect(reviewPanelSource).toContain("no password or external login");
    expect(reviewPanelSource).not.toContain("walkthrough@local.test");
  });

  test("GIVEN briefing prompts and quiet states can be sent to live chat WHEN source copy is checked THEN sample data is not described as owned holdings", () => {
    const briefingPageSource = readFileSync(join(process.cwd(), "app", "briefing", "[id]", "page.tsx"), "utf8");
    const todayPageSource = readFileSync(join(process.cwd(), "app", "page.tsx"), "utf8");

    expect(briefingPageSource).toContain("matters to the visible holdings");
    expect(briefingPageSource).not.toContain("matters to my holdings");
    expect(todayPageSource).toContain("checked the visible watchlist");
    expect(todayPageSource).not.toContain("checked your watchlist");
  });

  test("GIVEN alerts use fallback or borrow-payment reasons WHEN relevance copy is generated THEN it stays decision-oriented", () => {
    const fallback = alertLoopActions({
      tier: "T1",
      message: "XYZ moved enough to review",
      rationale: "Unknown market reason",
      signal: "custom_reason",
      asset_symbol: "XYZ",
      portfolio_weight_pct: 0,
    });
    const funding = alertLoopActions({
      tier: "T1",
      message: "aUSDC funding changed",
      rationale: "Funding moved",
      signal: "funding",
      asset_symbol: "aUSDC",
      portfolio_weight_pct: 3.7,
    });

    expect(fallback.askPrompt).toContain("check the reason or ask Master Mold");
    expect(fallback.askPrompt).not.toMatch(/scan details|raw signal|z-score|sigma/i);
    expect(funding.journalHref).toContain("Borrow-payment+change");
    expect(funding.askPrompt).toContain("Borrow-payment conditions moved");
    expect(funding.askPrompt).not.toMatch(/Funding moved enough|scan details/i);
  });

  test("GIVEN the Paper simulator is user-facing WHEN source copy is checked THEN old fake-wallet and abstract result labels stay out of the UI", () => {
    const paperWorkspaceSource = readFileSync(join(process.cwd(), "components", "paper-workspace.tsx"), "utf8");
    const globalAssistantSource = readFileSync(join(process.cwd(), "components", "global-assistant.tsx"), "utf8");

    expect(paperWorkspaceSource).toContain('name="paper_size_usd"');
    expect(paperWorkspaceSource).toContain("paper-account-title");
    expect(paperWorkspaceSource).toContain('Metric label="Call quality"');
    expect(paperWorkspaceSource).toContain('Metric label="Risk spread"');
    expect(paperWorkspaceSource).toContain("Open tests");
    expect(paperWorkspaceSource).toContain("Use simulator dollars to test a call");
    expect(paperWorkspaceSource).toContain("close date");
    expect(paperWorkspaceSource).not.toContain("Open paper tests");
    expect(paperWorkspaceSource).not.toContain("Paper tests -");
    expect(paperWorkspaceSource).not.toContain('name="fake_size_usd"');
    expect(paperWorkspaceSource).not.toContain("fake-wallet-title");
    expect(paperWorkspaceSource).not.toContain('Metric label="Was it right?"');
    expect(paperWorkspaceSource).not.toContain('Metric label="Variety"');
    expect(paperWorkspaceSource).not.toContain('Metric label="Round score"');
    expect(paperWorkspaceSource).not.toContain('Metric label="Confidence match"');
    expect(paperWorkspaceSource).not.toContain('Metric label="Asset mix"');
    expect(globalAssistantSource).not.toContain("paper-fake-wallet");
    expect(globalAssistantSource).not.toContain("briefing-fake-test");
    expect(globalAssistantSource).not.toContain("today-fake-test");
  });

  test("GIVEN the daily briefing journey WHEN cards and a card detail are loaded THEN ranked cards disclose all required decision fields and cited drivers", async () => {
    const cards = await responseJson<
      Array<{
        id: string;
        rank: number;
        headline: string;
        why_now: string;
        relevance_note: string;
        bull_case: string;
        bear_case: string;
        confidence: number;
        horizon: string;
        status: string;
        provenance: { label: string };
      }>
    >(getBriefingRoute(new Request("http://localhost/api/briefing")));

    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.length).toBeLessThanOrEqual(5);
    expect(cards.map((card) => card.rank)).toEqual(cards.map((_, index) => index + 1));

    for (const card of cards) {
      expect(card.headline).not.toBe("");
      expect(card.why_now).not.toBe("");
      expect(card.relevance_note).not.toBe("");
      if (card.status === "worth_checking") {
        expect(card.bull_case).not.toBe("");
        expect(card.bear_case).not.toBe("");
      }
      expect(card.confidence).toBeGreaterThanOrEqual(1);
      expect(card.confidence).toBeLessThanOrEqual(10);
      expect(card.horizon).not.toBe("");
      expect(["Sample data", "Saved read"]).toContain(card.provenance.label);
    }

    const detail = await responseJson<{
      drivers: Array<{ label: string; direction: string; importance: number; color: string; support_note: string }>;
      decision_journal_entry: { call: string; what_would_prove_wrong: string } | null;
      provenance: { source: string };
    }>(
      await getBriefingDetailRoute(new Request(`http://localhost/api/briefing/${cards[0].id}`), {
        params: Promise.resolve({ id: cards[0].id }),
      }),
    );

    expect(detail.drivers.length).toBeGreaterThan(0);
    expect(detail.drivers.map((driver) => driver.importance)).toEqual(
      [...detail.drivers.map((driver) => driver.importance)].sort((a, b) => b - a),
    );
    expect(detail.drivers.some((driver) => driver.direction === "bullish")).toBe(true);
    expect(detail.drivers.some((driver) => driver.direction === "bearish")).toBe(true);
    expect(detail.drivers.every((driver) => driver.color && driver.support_note)).toBe(true);
    expect(detail.decision_journal_entry?.call).not.toBe("");
    expect(detail.decision_journal_entry?.what_would_prove_wrong).not.toBe("");
    expect(detail.provenance.source).not.toBe("");

    const draftHref = buildBriefingJournalDraftHref({
      card: {
        ...cards[0],
        conviction: cards[0].confidence,
        decision_journal_entry: detail.decision_journal_entry
          ? {
              thesis: detail.decision_journal_entry.call,
              falsification_condition: detail.decision_journal_entry.what_would_prove_wrong,
            }
          : null,
      },
      drivers: detail.drivers,
    });
    const draftUrl = new URL(`http://localhost${draftHref}`);
    expect(draftUrl.pathname).toBe("/journal");
    expect(draftUrl.searchParams.get("call")).toBeTruthy();
    expect(draftUrl.searchParams.get("thesis")).toBeNull();
    expect(draftUrl.searchParams.get("reasons")).toBeTruthy();
    expect(draftUrl.searchParams.get("signals")).toBeNull();
    expect(draftUrl.searchParams.get("confidence")).toBe(String(cards[0].confidence));
    expect(draftUrl.searchParams.get("conviction")).toBeNull();
    expect(draftUrl.searchParams.get("horizon")).toBe(cards[0].horizon);
    expect(draftUrl.searchParams.get("falsification")).toBeTruthy();
    expect(decodeURIComponent(draftHref)).not.toMatch(/z-score|sigma|σ|trailing mean|_z|Log this decision/i);
  });

  test("GIVEN portfolio and journal as-of replay WHEN a past timestamp is requested THEN later knowledge is excluded without look-ahead", async () => {
    const asOf = "2026-05-30T00:13:00.000Z";
    const briefing = await responseJson<Array<{ id: string; saved_at: string }>>(
      getBriefingRoute(new Request(`http://localhost/api/briefing?as_of=${asOf}`)),
    );
    const alerts = await responseJson<Array<{ id: string; provenance: { as_of: string } }>>(
      getAlertsRoute(new Request(`http://localhost/api/alerts?as_of=${asOf}`)),
    );
    const portfolio = await responseJson<{
      holdings: Array<{ symbol: string }>;
      asset_history: Array<{ bars: Array<{ saved_at: string }> }>;
      provenance: { replay_as_of: string | null };
    }>(getPortfolioRoute(new Request(`http://localhost/api/portfolio?as_of=${asOf}`)));
    const journal = await responseJson<{
      entries: Array<{ id: string }>;
      results: Array<{ id: string }>;
      provenance: { replay_as_of: string | null };
    }>(getJournalRoute(new Request(`http://localhost/api/journal?as_of=${asOf}`)));

    expect(briefing.every((card) => Date.parse(card.saved_at) <= Date.parse(asOf))).toBe(true);
    expect(alerts.every((alert) => Date.parse(alert.provenance.as_of) <= Date.parse(asOf))).toBe(true);
    expect(alerts.map((alert) => alert.id)).not.toContain("alert_concentration");
    expect(portfolio.provenance.replay_as_of).toBe(asOf);
    expect(portfolio.holdings.map((holding) => holding.symbol)).toEqual(["BTC", "NVDA", "HOOD"]);
    expect(portfolio.holdings.some((holding) => holding.symbol === "aUSDC")).toBe(false);
    expect(
      portfolio.asset_history.flatMap((asset) => asset.bars).every((bar) => Date.parse(bar.saved_at) <= Date.parse(asOf)),
    ).toBe(true);
    expect(JSON.stringify(briefing)).not.toMatch(/event_time|knowledge_time/i);
    expect(JSON.stringify(portfolio)).not.toMatch(/event_time|knowledge_time/i);
    expect(journal.provenance.replay_as_of).toBe(asOf);
    expect(journal.entries).toHaveLength(0);
    expect(journal.results).toHaveLength(0);
  });

  test("GIVEN Today is replayed before any known facts WHEN the daily read is built THEN no current scan leaks into the quiet state", async () => {
    const asOf = "2026-05-01T00:00:00.000Z";
    const parsed = parseAsOf(asOf);
    expect(parsed.ok).toBe(true);

    const briefing = await responseJson<Array<{ id: string }>>(
      getBriefingRoute(new Request(`http://localhost/api/briefing?as_of=${asOf}`)),
    );
    const alerts = await responseJson<Array<{ id: string }>>(
      getAlertsRoute(new Request(`http://localhost/api/alerts?as_of=${asOf}`)),
    );
    const brain = getBrainState(parsed.ok ? parsed.asOf : null);
    const todayState = getSystemState(parsed.ok ? parsed.asOf : null);
    const morningCopy = todayMorningSummary(briefing.length, alerts.length, null);

    expect(briefing).toHaveLength(0);
    expect(alerts).toHaveLength(0);
    expect(brain.initialized).toBe(false);
    expect(brain.summary.snapshot_freshness).toBe("No snapshot by replay time");
    expect(brain.schedule.status).toBe("No memory at this time");
    expect(brain.schedule.note).toContain("No chat context snapshot had been saved");
    expect(todayState.actionableCount).toBe(0);
    expect(todayState.alertCount).toBe(0);
    expect(todayState.greeting).toBe("Nothing urgent today. I will say so if that changes.");
    expect(todayState.greeting).not.toMatch(/surface|actionable|signal/i);
    expect(morningCopy).toContain("Nothing needs action right now");
    expect(morningCopy).not.toMatch(/BTC is moving up|NVDA is trading|saved scan/i);
  });

  test("GIVEN the alert feed journey WHEN saved alerts are loaded THEN public ids, severity, reasons, dismiss, and feedback state are present", async () => {
    const alerts = await responseJson<
      Array<{
        id: string;
        asset_key: string;
        asset_id?: string;
        severity: string;
        priority_score: number;
        message: string;
        rationale: string;
        acknowledged: boolean;
        useful_feedback: boolean | null;
        provenance: { label: string };
      }>
    >(getAlertsRoute(new Request("http://localhost/api/alerts")));

    expect(alerts.every((alert) => alert.id.startsWith("alert_") && alert.asset_key.length > 0)).toBe(true);
    expect(alerts.every((alert) => alert.asset_id === undefined)).toBe(true);
    expect(new Set(alerts.map((alert) => alert.severity))).toEqual(new Set(["Urgent", "Worth checking", "FYI"]));
    expect(Math.max(...alerts.map((alert) => alert.priority_score))).toBeGreaterThanOrEqual(
      Math.min(...alerts.map((alert) => alert.priority_score)),
    );
    expect(alerts.every((alert) => alert.message && alert.rationale)).toBe(true);
    expect(alerts.every((alert) => ["Sample data", "Saved read"].includes(alert.provenance.label))).toBe(true);
    expect(JSON.stringify(alerts)).not.toMatch(/engine_alert|asset_id|z_score|signal|Engine output|Demo data|screener/i);
  });

  test("GIVEN an alert WHEN the operator continues the loop THEN chat, journal, and paper receive plain context", async () => {
    const alerts = getInternalAlerts();
    const critical = alerts.find((alert) => alert.tier === "T0") ?? alerts[0];
    const actions = alertLoopActions(critical);
    const journalUrl = new URL(`http://localhost${actions.journalHref}`);
    const visibleTier = shortAlertTierLabel(critical.tier);
    const suggestedResponse = buildAlertSuggestedResponse(critical);
    const ignoreCondition = buildAlertIgnoreCondition(critical);
    const cleanRationale = cleanAlertRationale(critical.rationale);
    const pageContext = buildAlertPageContext(critical);

    expect(actions.askPrompt).toContain(critical.message.replace(/\s*\(z=[^)]*\)\s*$/i, ""));
    expect(actions.askPrompt).toContain("why it matters to the visible portfolio");
    expect(actions.askPrompt).toContain("Suggested response:");
    expect(actions.askPrompt).toContain("Keep raw math hidden");
    expect(actions.askPrompt).not.toMatch(/z-score|sigma|σ|z=|standard deviations/i);
    expect(suggestedResponse).toMatch(/Review|Check|Watch|No action|Wait|Read|Treat/);
    expect(suggestedResponse).not.toMatch(/z-score|sigma|σ|signal|flagged|clear noise|tune/i);
    expect(ignoreCondition).toMatch(/stops|gives back|does not|get follow-through|normalizes|no longer affects/i);
    expect(ignoreCondition).not.toMatch(/z-score|sigma|σ|z=|flagged|clear noise|tune/i);
    expect(cleanRationale).not.toMatch(/z-score|sigma|σ|z=|screener/i);
    expect(pageContext.surface).toBe("Selected alert");
    expect(pageContext.route).toBe("/alerts");
    expect(pageContext.summary).toContain("specific alert");
    expect(pageContext.selected).toContain(visibleTier);
    expect(pageContext.selected).toContain("Suggested response:");
    expect(pageContext.selected).not.toMatch(/z-score|sigma|σ|z=|signal|flagged|clear noise|tune/i);
    expect(["Urgent", "Worth checking", "FYI"]).toContain(visibleTier);
    expect(visibleTier).not.toMatch(/^T[0-2]$/);
    expect(journalUrl.pathname).toBe("/journal");
    expect(journalUrl.searchParams.get("call")).toContain("Review alert:");
    expect(journalUrl.searchParams.get("thesis")).toBeNull();
    expect(journalUrl.searchParams.get("confidence")).toBeTruthy();
    expect(journalUrl.searchParams.get("conviction")).toBeNull();
    expect(journalUrl.searchParams.get("reasons")).toContain(
      critical.tier === "T0" ? "Urgent alert" : critical.tier === "T1" ? "Worth checking" : "FYI",
    );
    expect(journalUrl.searchParams.get("reasons")).not.toContain("z=");
    expect(journalUrl.searchParams.get("reasons")).not.toContain("_z");
    expect(journalUrl.searchParams.get("signals")).toBeNull();
    expect(journalUrl.searchParams.get("horizon")).toBe(critical.tier === "T0" ? "Today" : "1-3 days");
    expect(journalUrl.searchParams.get("falsification")).not.toBe(critical.rationale);
    expect(journalUrl.searchParams.get("falsification")).not.toMatch(/z-score|sigma|σ|trailing mean/i);

    const paperUrl = new URL(`http://localhost${actions.paperHref}`);
    expect(paperUrl.pathname).toBe("/paper");
    expect(critical.asset_symbol).toBeTruthy();
    expect(paperUrl.searchParams.get("symbol")).toBe(critical.asset_symbol ?? null);
    expect(paperUrl.searchParams.get("rationale")).toContain("Testing alert as a paper trade");
    expect(paperUrl.searchParams.get("rationale")).toContain("visible portfolio");
    expect(paperUrl.searchParams.get("rationale")).not.toMatch(/z-score|sigma|σ|trailing mean|_z/i);
  });

  test("GIVEN a manual holding is added WHEN portfolio-aware surfaces reload THEN alerts and chat use the manual portfolio context", async () => {
    const previousDb = process.env.MASTERMOLD_DB;
    const previousEngineDir = process.env.ENGINE_OUT_DIR;
    process.env.MASTERMOLD_DB = join(mkdtempSync(join(tmpdir(), "mm-uat-manual-")), "db.sqlite");
    process.env.ENGINE_OUT_DIR = mkdtempSync(join(tmpdir(), "mm-uat-empty-engine-"));
    __resetStoreForTests();

    try {
      const beforeAlerts = await responseJson<Array<{ asset_symbol: string; portfolio_weight_pct: number }>>(
        getAlertsRoute(new Request("http://localhost/api/alerts")),
      );
      const beforeNvdaAlert = beforeAlerts.find((alert) => alert.asset_symbol === "NVDA");

      const portfolioAfterAddApi = await responseJson<{
        holdings: Array<{
          id: string;
          symbol: string;
          name: string;
          source_label: "Sample holding" | "Manual entry" | "Imported holding";
          portfolio_share: number;
          account_label: string;
        }>;
        manual_entries: Array<{
          id: string;
          symbol: string;
          name: string;
          source_label: "Sample holding" | "Manual entry" | "Imported holding";
          portfolio_share: number;
          account_label: string;
        }>;
        provenance: { label: string };
      }>(
        await postPortfolioRoute(
          new Request("http://localhost/api/portfolio", {
            method: "POST",
            body: JSON.stringify({
              symbol: "NVDA",
              asset_name: "NVIDIA manual test",
              asset_class: "equity",
              venue: "Manual UAT",
              quantity: "1000",
              price: "1000",
              daily_change_pct: "1",
            }),
          }),
        ),
      );
      const portfolioAfterAdd = getInternalPortfolio();

      const manualHolding = portfolioAfterAddApi.manual_entries.find((holding) => holding.symbol === "NVDA");
      expect(portfolioAfterAddApi.provenance.label).toBe("Manual portfolio");
      expect(manualHolding?.source_label).toBe("Manual entry");
      expect(portfolioAfterAddApi.holdings[0].symbol).toBe("NVDA");
      expect(portfolioAfterAddApi.holdings[0].source_label).toBe("Manual entry");
      expect(portfolioAfterAdd.holdings[0].symbol).toBe("NVDA");
      expect(portfolioAfterAdd.holdings[0].source).toBe("manual");

      const afterAlerts = getInternalAlerts();
      const afterNvdaAlert = afterAlerts.find((alert) => alert.asset_symbol === "NVDA");
      expect(afterNvdaAlert?.portfolio_weight_pct ?? 0).toBeGreaterThan(beforeNvdaAlert?.portfolio_weight_pct ?? 0);

      const briefing = getInternalBriefingCards();
      const topCard = briefing.find((card) => card.status === "actionable") ?? briefing[0] ?? null;
      const topHolding = portfolioAfterAdd.holdings[0];
      const todayPrompt = buildTodayPrompt(topCard, afterNvdaAlert ?? null, {
        symbol: topHolding.symbol,
        weight_pct: topHolding.weight_pct,
        asset_name: topHolding.asset_name,
        source: topHolding.source,
        account: topHolding.account,
      });
      const todayPaperHref = buildTodayPaperHref({ symbol: topHolding.symbol }, topCard);
      const todayRiskNote = buildTodayRiskNote({
        topHoldingPct: topHolding.weight_pct,
        topHoldingSymbol: topHolding.symbol,
        activeAlerts: afterAlerts.length,
        highScored: briefing.filter((card) => card.conviction >= 7).length,
      });
      const morningCopy = todayMorningSummary(
        briefing.filter((card) => card.status === "actionable").length,
        afterAlerts.length,
        topCard,
        afterNvdaAlert ?? null,
      );

      expect(todayPrompt).toContain(`Its largest visible holding is NVDA at ${topHolding.weight_pct.toFixed(1)}%`);
      expect(todayPrompt).toContain("The visible portfolio includes local manual entries plus sample data");
      expect(todayPrompt).toContain("local manual entry");
      expect(todayPrompt).toContain("including local manual entries plus sample data");
      expect(todayPrompt).toContain("Visible Focus 1:");
      expect(todayPrompt).toContain("Start with this portfolio-aware idea.");
      expect(todayPrompt).toContain("Top alert to also check:");
      expect(todayPrompt.indexOf("Visible Focus 1:")).toBeLessThan(todayPrompt.indexOf("Top alert to also check:"));
      expect(todayPrompt).toContain("why each matters to the visible portfolio");
      expect(todayPrompt).toContain("Focus 1 first, then urgent alerts or smaller checks.");
      expect(todayPrompt).not.toMatch(/z-score|sigma|σ|trailing mean|_z/i);
      expect(todayPaperHref).toContain("symbol=NVDA");
      expect(decodeURIComponent(todayPaperHref)).toContain("paper trade");
      expect(todayHoldingDetail(topHolding)).toBe("NVIDIA manual test · manual entry");
      expect(todayHoldingPromptDetail(topHolding)).toContain("local manual entry");
      expect(todayPortfolioScopePhrase(topHolding)).toContain("local manual entries plus sample data");
      expect(todayRiskNote).toContain("NVDA is concentrated");
      expect(todayRiskNote).toContain("risk decision");
      expect(morningCopy).toMatch(/^Start with /);
      expect(morningCopy).toContain("NVDA is trading much more than usual");
      expect(morningCopy).not.toMatch(/^\d+ alerts? to check/i);
      expect(morningCopy).not.toMatch(/dashboard|engine output|actionable signals|z-score|sigma/i);

      const chatContext = getChatContext();
      const parsedChatContext = JSON.parse(chatContext.llm_context) as {
        data_state: { portfolio_state: string; note: string };
        portfolio: { manual_holding_count: number };
        holdings: Array<{ symbol: string; data_state: string; portfolio_weight_pct: number }>;
      };
      expect(chatContext.facts.top_holding).toBe("NVDA");
      expect(parsedChatContext.data_state.portfolio_state).toBe("Manual portfolio");
      expect(parsedChatContext.data_state.note).toContain("local manual holdings");
      expect(parsedChatContext.portfolio.manual_holding_count).toBe(1);
      expect(parsedChatContext.holdings.some((holding) => holding.symbol === "NVDA" && holding.data_state === "manual")).toBe(true);

      if (manualHolding) {
        const portfolioAfterDelete = await responseJson<{
          manual_entries: Array<{ id: string; symbol: string }>;
        }>(
          await deleteManualHoldingRoute(new Request(`http://localhost/api/portfolio/manual/${manualHolding.id}`, { method: "DELETE" }), {
            params: Promise.resolve({ id: manualHolding.id }),
          }),
        );
        expect(portfolioAfterDelete.manual_entries.some((holding) => holding.id === manualHolding.id)).toBe(false);
      }
    } finally {
      if (previousDb === undefined) delete process.env.MASTERMOLD_DB;
      else process.env.MASTERMOLD_DB = previousDb;
      if (previousEngineDir === undefined) delete process.env.ENGINE_OUT_DIR;
      else process.env.ENGINE_OUT_DIR = previousEngineDir;
      __resetStoreForTests();
    }
  });

  test("GIVEN an urgent alert and a top idea WHEN Today chooses the first focus THEN portfolio focus leads and urgent alert stays visible", () => {
    const morningCopy = todayMorningSummary(
      3,
      4,
      { headline: "BTC shows positive momentum amid mixed signals" },
      { message: "NVDA volume 2.1x avg", tier: "T0", portfolio_weight_pct: 27 },
    );

    expect(morningCopy).toBe(
      "Start with BTC moved up; check the bear case before adding risk. Also check why NVDA is trading much more than usual; it touches 27.0% of the visible portfolio. 4 alerts to review.",
    );
    expect(morningCopy).not.toMatch(/^4 alerts? to check/i);
    expect(morningCopy).not.toMatch(/Focus first|picture is mixed|urgent alert|\d+(\.\d+)?x\s+avg|z-score|sigma|σ/i);
  });

  test("GIVEN engine-style metric copy WHEN it is shown in the product THEN the visible copy is translated before display", () => {
    const raw =
      "BTC's recent return z-score of 1.53 indicates outperformance relative to its historical mean, suggesting potential short-term momentum. Elevated volume and return z-scores may signal growing demand.";
    const translated = plainBriefingText(raw);

    expect(translated).toContain("BTC is moving better than usual");
    expect(translated).toContain("unusual price moves");
    expect(translated).not.toMatch(/z-score|z-scores|sigma|σ|trailing mean/i);

    const rawVolume = "Review alert: NVDA volume 2.1x avg";
    const translatedVolume = plainBriefingText(rawVolume);
    expect(translatedVolume).toBe("Review alert: NVDA is trading much more than usual");
    expect(translatedVolume).not.toMatch(/\d+(\.\d+)?x\s+avg/i);

    const rawReturnAlert = "ETH 1-day return +0.7% (z=+2.1)";
    const translatedReturnAlert = plainBriefingText(rawReturnAlert);
    expect(translatedReturnAlert).toBe("ETH moved up 0.7% today");
    expect(translatedReturnAlert).not.toMatch(/1-day return|z=/i);

    const rawEngineCard =
      "Recent readings indicate significant deviations from mean in returns, volume, and news coverage. Extreme positive momentum (z=15) with surging volume (z=56) suggests continued institutional interest. Such extreme readings may indicate overbought conditions and potential mean reversion. Negative news sentiment (z-score -1.0) may weigh on price if negative narratives gain traction.";
    const translatedEngineCard = plainBriefingText(rawEngineCard);
    expect(translatedEngineCard).toContain("price, trading activity, and news changed enough to review");
    expect(translatedEngineCard).toContain("Strong price momentum with heavy trading");
    expect(translatedEngineCard).toContain("risk is a pullback");
    expect(translatedEngineCard).toContain("Negative headlines could pressure the price");
    expect(translatedEngineCard).not.toMatch(/z-score|z=|sigma|deviations from mean|overbought|mean reversion|unusual moves -?\d/i);

    const rawCitation = "Screener return_z signal (z=1.53 vs mean 0.0005)";
    const translatedCitation = plainBriefingText(rawCitation);
    expect(translatedCitation).toBe("The market scan found an unusual price move");
    expect(translatedCitation).not.toMatch(/return_z|z=|mean/i);

    const rawAlternateCitation = "Screener volume_z 56.1 vs mean 100";
    expect(plainBriefingText(rawAlternateCitation)).toBe("The market scan found unusually heavy trading");
    expect(
      plainBriefingText("Volume is 55.9σ above its trailing mean (99.67); deterministic screener trigger, no model involved."),
    ).toBe("The market scan found unusually heavy trading.");
    expect(plainBriefingText("Return momentum extreme")).toBe("Unusual price strength");
    expect(plainBriefingText("Counter-case uncertainty")).toBe("Unclear downside case");
    expect(plainBriefingText("Basis attractive but funding rate can flip.")).toBe(
      "The futures price gap looked interesting but crypto borrow-payment rate can flip.",
    );
    expect(plainBriefingText("Relevant for DeFi watchlists due to its role in Aave's liquidity pools.")).toBe(
      "aUSDC is a small on-chain cash position, so review it only if you planned to adjust that cash.",
    );
    expect(plainBriefingText("BTC is a core holding in many crypto portfolios and a key benchmark for the asset class.")).toBe(
      "BTC is the largest visible holding, so a move matters more than a small watchlist item.",
    );
    expect(plainBriefingText("High relevance for tech/growth watchlists given NVDA's market leadership")).toBe(
      "NVDA is a large visible position, so unusual movement can change the visible portfolio's risk today.",
    );
    expect(plainBriefingText("Demo Market Wire, 2026-05-29")).toBe("Sample market note, 2026-05-29");
    expect(plainBriefingText("Demo Crypto Desk borrow-payment read, 2026-05-29")).toBe(
      "Sample crypto note borrow-payment read, 2026-05-29",
    );
    expect(plainBriefingText("Seeded portfolio snapshot, 2026-05-29")).toBe(
      "Sample portfolio snapshot, 2026-05-29",
    );

    const rawAlertActions = alertLoopActions({
      tier: "T0",
      z_score: 3,
      message: "NVDA volume 2.1x avg",
      rationale: "Raw screener shorthand",
      signal: "volume_z",
      asset_symbol: "NVDA",
      portfolio_weight_pct: 27,
    });
    expect(rawAlertActions.askPrompt).toContain("NVDA is trading much more than usual");
    expect(rawAlertActions.askPrompt).toContain("27.0% of the visible portfolio");
    expect(rawAlertActions.askPrompt).toContain("why it matters to the visible portfolio");
    expect(rawAlertActions.askPrompt).not.toMatch(/your visible portfolio|my portfolio/i);
    expect(rawAlertActions.askPrompt).not.toMatch(/\d+(\.\d+)?x\s+avg/i);
    expect(buildAlertIgnoreCondition({
      tier: "T0",
      message: "NVDA volume 2.1x avg",
      rationale: "Raw screener shorthand",
      signal: "volume_z",
      asset_symbol: "NVDA",
      portfolio_weight_pct: 27,
    })).toContain("NVDA stops trading unusually heavily");
  });

  test("GIVEN the paper and executor journeys WHEN seeded sandbox and monitor data are loaded THEN scoring and guardrails are display-only", async () => {
    const paper = await responseJson<{
      rounds: Array<{
        status: string;
        result: {
          was_it_right_score: number;
          patience_score: number;
          variety_score: number;
          total_score: number;
        } | null;
      }>;
      paper_trades: Array<{ asset_key: string; call: string; confidence: number; reason: string; paper_size_usd: number }>;
    }>(getPaperRoute(new Request("http://localhost/api/paper")));
    const executor = await responseJson<{
      strategies: Array<{ status: string; price_exposure: number; borrow_cushion: number; borrow_rate: number; price_gap: number }>;
      safety_drafts: Array<{ per_transaction_cap_usd: number; daily_cap_usd: number; approved_contracts: string[]; approved_recipients: string[]; note: string }>;
      borrow_rate_preview: Array<{ asset_key: string; borrow_rate: number; asset_symbol: string }>;
    }>(getExecutorRoute(new Request("http://localhost/api/executor")));

    const scoredRound = paper.rounds.find((round) => round.result);
    expect(paper.rounds.some((round) => round.status === "open")).toBe(true);
    expect(scoredRound?.result?.was_it_right_score).toBeGreaterThan(0);
    expect(scoredRound?.result?.patience_score).toBeGreaterThan(0);
    expect(scoredRound?.result?.variety_score).toBeGreaterThan(0);
    expect(scoredRound?.result?.total_score).toBeGreaterThan(0);
    expect(paper.paper_trades.every((trade) => trade.asset_key && trade.reason && trade.confidence >= 1 && trade.paper_size_usd >= 100)).toBe(true);
    expect(JSON.stringify(paper)).not.toMatch(/fake_|predictions|conviction|calibration|confidence_match|asset_mix|asset_id|asset_class|Demo data|Engine output|event_time|knowledge_time/i);
    expect(executor.strategies.some((strategy) => strategy.status === "Preview only")).toBe(true);
    expect(
      executor.strategies.every(
        (strategy) =>
          Number.isFinite(strategy.price_exposure) &&
          Number.isFinite(strategy.borrow_cushion) &&
          Number.isFinite(strategy.borrow_rate) &&
          Number.isFinite(strategy.price_gap),
      ),
    ).toBe(true);
    expect(executor.safety_drafts[0].per_transaction_cap_usd).toBe(0);
    expect(executor.safety_drafts[0].daily_cap_usd).toBe(0);
    expect(executor.safety_drafts[0].approved_contracts.length).toBeGreaterThan(0);
    expect(executor.safety_drafts[0].approved_contracts).toContain("0xDemoPermitModule");
    expect(executor.safety_drafts[0].approved_contracts.join(" ")).not.toMatch(/\bT[0-2]\b|Permit2/i);
    expect(executor.safety_drafts[0].approved_recipients.length).toBeGreaterThan(0);
    expect(executor.safety_drafts[0].note).toContain("Nothing here signs");
    expect(executor.borrow_rate_preview.every((item) => item.asset_key && item.asset_symbol && Number.isFinite(item.borrow_rate))).toBe(true);
    expect(JSON.stringify(executor)).not.toMatch(/guardrail_configs|funding_observations|asset_id|net_delta|margin_ratio|funding_rate|running_demo|stablecoin_lending|delta_neutral_funding_carry|Demo data|event_time|knowledge_time/i);
  });

  test("GIVEN chat has no AI credentials WHEN the reviewer asks about app context THEN a canned guidance-only response is returned without network access", async () => {
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const context = getChatContext();
      const response = await postChatRoute(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: "Explain today's top alert." }),
        }),
      );
      const text = await response.text();
      const sources = JSON.parse(decodeURIComponent(response.headers.get("X-Chat-Sources") ?? "[]")) as string[];

      expect(response.headers.get("X-Chat-Mode")).toBe("canned");
      expect(context.prompts).toHaveLength(4);
      expect(sources).toContain(context.facts.top_holding_context);
      expect(sources).toContain(`Top alert: ${context.facts.top_alert_tier} ${context.facts.top_alert}`);
      expect(sources.join(" ")).not.toContain("Top alert: FYI NVDA");
      expect(text).toContain(context.facts.top_holding_context);
      expect(text).not.toContain("your largest exposure");
      expect(text).toContain("No live chat key is saved");
      expect(text).toContain("Guidance only");
      expect(text).toContain(context.facts.top_alert);
      expect(text).toContain("I cannot trade or move funds");
    } finally {
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }

      if (originalOpenRouterKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
      }

      if (originalAnthropicKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      }
    }
  });

  test("GIVEN integration settings and review readiness are required WHEN statuses are loaded THEN sample and key-gated services are disclosed", async () => {
    const integrations = await responseJson<
      Array<{
        service: string;
        status: string;
        detail: string;
        display_name: string;
        credential_hint: string;
        permission_scope: string;
        status_since: string;
        checked_at: string;
      }>
    >(getStatusRoute());
    const services = new Set(integrations.map((integration) => integration.service));

    expect(services).toEqual(new Set(["coinbase", "robinhood", "onchain_wallet", "live_chat"]));
    expect(integrations.filter((integration) => integration.status === "Sample mode")).toHaveLength(3);
    expect(integrations.filter((integration) => integration.status === "Needs key")).toHaveLength(1);
    expect(JSON.stringify(integrations)).not.toMatch(/stubbed|credential_gated/i);
    expect(JSON.stringify(integrations)).toContain("Test live chat");
    expect(JSON.stringify(integrations)).not.toMatch(/AI test|AI key|ai_service|int_llm|"service":"llm"|event_time|knowledge_time/i);
    expect(
      integrations.every(
        (integration) =>
          integration.detail.length > 0 &&
          integration.display_name.length > 0 &&
          integration.credential_hint.length > 0 &&
          integration.permission_scope.length > 0 &&
          integration.status_since.length > 0 &&
          integration.checked_at.length > 0,
      ),
    ).toBe(true);
    const snapTrade = integrations.find((integration) => integration.service === "robinhood");
    expect(snapTrade?.permission_scope).toContain("Trading capability is ignored");
    expect(snapTrade?.permission_scope).toContain("never calls order endpoints");
  });
});

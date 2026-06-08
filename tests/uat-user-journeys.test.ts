/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { GET as getAlertsRoute } from "@/app/api/alerts/route";
import { GET as getBriefingRoute } from "@/app/api/briefing/route";
import { GET as getBriefingDetailRoute } from "@/app/api/briefing/[id]/route";
import { POST as postChatRoute } from "@/app/api/chat/route";
import { GET as getExecutorRoute } from "@/app/api/executor/route";
import { GET as getJournalRoute } from "@/app/api/journal/route";
import { GET as getPaperRoute } from "@/app/api/paper/route";
import { GET as getPortfolioRoute } from "@/app/api/portfolio/route";
import { GET as getStatusRoute } from "@/app/api/status/route";
import { getChatContext } from "@/src/db/chat";
import { demoDatabase } from "@/src/db/seed-data";

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("UAT user journeys over seeded data", () => {
  test("GIVEN the reviewer seed persona WHEN the app boots with zero credentials THEN every primary surface has seeded backing data", async () => {
    const reviewer = demoDatabase.users.find((user) => user.email === "reviewer@demo.local");
    expect(reviewer?.role).toBe("reviewer");

    const briefing = await responseJson<unknown[]>(getBriefingRoute());
    const alerts = await responseJson<unknown[]>(getAlertsRoute());
    const portfolio = await responseJson<{
      holdings: unknown[];
      defi_positions: unknown[];
      provenance: { label: string };
    }>(getPortfolioRoute(new Request("http://localhost/api/portfolio")));
    const journal = await responseJson<{
      entries: unknown[];
      track_record: unknown[];
      provenance: { label: string };
    }>(getJournalRoute(new Request("http://localhost/api/journal")));
    const paper = await responseJson<{
      rounds: unknown[];
      predictions: unknown[];
      scores: unknown[];
    }>(getPaperRoute(new Request("http://localhost/api/paper")));
    const executor = await responseJson<{
      strategies: unknown[];
      guardrail_configs: unknown[];
      funding_observations: unknown[];
      provenance: { label: string };
    }>(getExecutorRoute(new Request("http://localhost/api/executor")));
    const integrations = await responseJson<unknown[]>(getStatusRoute());

    expect(briefing.length).toBeGreaterThanOrEqual(3);
    expect(alerts.length).toBeGreaterThan(0);
    expect(portfolio.holdings.length).toBeGreaterThan(0);
    expect(portfolio.defi_positions.length).toBeGreaterThan(0);
    expect(portfolio.provenance.label).toBe("Demo data");
    expect(journal.entries.length).toBeGreaterThan(0);
    expect(journal.track_record.length).toBeGreaterThan(0);
    expect(journal.provenance.label).toBe("Demo data");
    expect(paper.rounds.length).toBeGreaterThan(0);
    expect(paper.predictions.length).toBeGreaterThan(0);
    expect(paper.scores.length).toBeGreaterThan(0);
    expect(executor.strategies.length).toBeGreaterThan(0);
    expect(executor.guardrail_configs.length).toBeGreaterThan(0);
    expect(executor.funding_observations.length).toBeGreaterThan(0);
    expect(executor.provenance.label).toBe("Demo data");
    expect(integrations.length).toBeGreaterThanOrEqual(4);
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
        conviction: number;
        horizon: string;
        status: string;
        provenance: { label: string };
      }>
    >(getBriefingRoute());

    expect(cards.map((card) => card.rank)).toEqual([1, 2, 3]);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.length).toBeLessThanOrEqual(5);
    expect(cards.some((card) => card.status === "nothing_actionable")).toBe(true);

    for (const card of cards) {
      expect(card.headline).not.toBe("");
      expect(card.why_now).not.toBe("");
      expect(card.relevance_note).not.toBe("");
      expect(card.bull_case).not.toBe("");
      expect(card.bear_case).not.toBe("");
      expect(card.conviction).toBeGreaterThanOrEqual(1);
      expect(card.conviction).toBeLessThanOrEqual(10);
      expect(card.horizon).not.toBe("");
      expect(card.provenance.label).toBe("Demo data");
    }

    const detail = await responseJson<{
      drivers: Array<{ direction: string; weight: number; color: string; source_citation: string }>;
      decision_journal_entry: { thesis: string } | null;
      provenance: { source: string };
    }>(
      await getBriefingDetailRoute(new Request(`http://localhost/api/briefing/${cards[0].id}`), {
        params: Promise.resolve({ id: cards[0].id }),
      }),
    );

    expect(detail.drivers.length).toBeGreaterThan(0);
    expect(detail.drivers.map((driver) => driver.weight)).toEqual(
      [...detail.drivers.map((driver) => driver.weight)].sort((a, b) => b - a),
    );
    expect(detail.drivers.some((driver) => driver.direction === "bullish")).toBe(true);
    expect(detail.drivers.some((driver) => driver.direction === "bearish")).toBe(true);
    expect(detail.drivers.every((driver) => driver.color && driver.source_citation)).toBe(true);
    expect(detail.decision_journal_entry?.thesis).toContain("AI exposure");
    expect(detail.provenance.source).toBe("Seeded briefing detail");
  });

  test("GIVEN portfolio and journal as-of replay WHEN a past timestamp is requested THEN later knowledge is excluded without look-ahead", async () => {
    const asOf = "2026-05-30T00:13:00.000Z";
    const portfolio = await responseJson<{
      holdings: Array<{ symbol: string }>;
      chart_assets: Array<{ bars: Array<{ knowledge_time: string }> }>;
      provenance: { replay_as_of: string | null };
    }>(getPortfolioRoute(new Request(`http://localhost/api/portfolio?as_of=${asOf}`)));
    const journal = await responseJson<{
      entries: Array<{ id: string }>;
      outcome_scores: Array<{ id: string }>;
      provenance: { replay_as_of: string | null };
    }>(getJournalRoute(new Request(`http://localhost/api/journal?as_of=${asOf}`)));

    expect(portfolio.provenance.replay_as_of).toBe(asOf);
    expect(portfolio.holdings.map((holding) => holding.symbol)).toEqual(["BTC", "NVDA", "HOOD"]);
    expect(portfolio.holdings.some((holding) => holding.symbol === "aUSDC")).toBe(false);
    expect(
      portfolio.chart_assets.flatMap((asset) => asset.bars).every((bar) => Date.parse(bar.knowledge_time) <= Date.parse(asOf)),
    ).toBe(true);
    expect(journal.provenance.replay_as_of).toBe(asOf);
    expect(journal.entries).toHaveLength(0);
    expect(journal.outcome_scores).toHaveLength(0);
  });

  test("GIVEN the alert feed journey WHEN seeded alerts are loaded THEN priority tiers, rationale, acknowledgement, and feedback state are present", async () => {
    const alerts = await responseJson<
      Array<{
        tier: string;
        z_score: number;
        message: string;
        rationale: string;
        acknowledged: boolean;
        useful_feedback: boolean | null;
        provenance: { label: string };
      }>
    >(getAlertsRoute());

    expect(alerts.map((alert) => alert.tier)).toEqual(["T0", "T1", "T2"]);
    expect(alerts[0].z_score).toBeGreaterThan(alerts[2].z_score);
    expect(alerts.every((alert) => alert.message && alert.rationale)).toBe(true);
    expect(alerts.some((alert) => alert.acknowledged)).toBe(true);
    expect(alerts.some((alert) => alert.useful_feedback === true)).toBe(true);
    expect(alerts.every((alert) => alert.provenance.label === "Demo data")).toBe(true);
  });

  test("GIVEN the paper and executor journeys WHEN seeded sandbox and monitor data are loaded THEN scoring and guardrails are display-only", async () => {
    const paper = await responseJson<{
      rounds: Array<{ status: string; score: { calibration: number; patience: number; diversification: number; total: number } | null }>;
      predictions: Array<{ direction: string; conviction: number; rationale: string }>;
    }>(getPaperRoute(new Request("http://localhost/api/paper")));
    const executor = await responseJson<{
      strategies: Array<{ status: string; net_delta: number; margin_ratio: number; funding_rate: number; basis: number }>;
      guardrail_configs: Array<{ per_tx_cap: number; daily_cap: number; contract_allowlist: string[]; recipient_allowlist: string[] }>;
    }>(getExecutorRoute(new Request("http://localhost/api/executor")));

    const scoredRound = paper.rounds.find((round) => round.score);
    expect(paper.rounds.some((round) => round.status === "open")).toBe(true);
    expect(scoredRound?.score?.calibration).toBeGreaterThan(0);
    expect(scoredRound?.score?.patience).toBeGreaterThan(0);
    expect(scoredRound?.score?.diversification).toBeGreaterThan(0);
    expect(scoredRound?.score?.total).toBeGreaterThan(0);
    expect(paper.predictions.every((prediction) => prediction.rationale && prediction.conviction >= 1)).toBe(true);
    expect(executor.strategies.some((strategy) => strategy.status === "running_demo")).toBe(true);
    expect(
      executor.strategies.every(
        (strategy) =>
          Number.isFinite(strategy.net_delta) &&
          Number.isFinite(strategy.margin_ratio) &&
          Number.isFinite(strategy.funding_rate) &&
          Number.isFinite(strategy.basis),
      ),
    ).toBe(true);
    expect(executor.guardrail_configs[0].per_tx_cap).toBe(0);
    expect(executor.guardrail_configs[0].daily_cap).toBe(0);
    expect(executor.guardrail_configs[0].contract_allowlist.length).toBeGreaterThan(0);
    expect(executor.guardrail_configs[0].recipient_allowlist.length).toBeGreaterThan(0);
  });

  test("GIVEN chat has no BYOK credentials WHEN the reviewer asks about dashboard context THEN a canned advisory-only response is returned without network access", async () => {
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
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

      expect(response.headers.get("X-Chat-Mode")).toBe("canned");
      expect(context.prompts).toHaveLength(4);
      expect(text).toContain("Advisory only");
      expect(text).toContain(context.facts.top_alert);
      expect(text).toContain("not an instruction to trade or move funds");
    } finally {
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }

      if (originalAnthropicKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      }
    }
  });

  test("GIVEN integration settings and review readiness are required WHEN statuses are loaded THEN stubbed and credential-gated services are disclosed", async () => {
    const integrations = await responseJson<
      Array<{ service: string; status: string; detail: string; display_name: string; credential_hint: string }>
    >(getStatusRoute());
    const services = new Set(integrations.map((integration) => integration.service));

    expect(services).toEqual(new Set(["coinbase", "robinhood", "onchain_wallet", "llm"]));
    expect(integrations.filter((integration) => integration.status === "stubbed")).toHaveLength(3);
    expect(integrations.filter((integration) => integration.status === "credential_gated")).toHaveLength(1);
    expect(
      integrations.every(
        (integration) =>
          integration.detail.length > 0 &&
          integration.display_name.length > 0 &&
          integration.credential_hint.length > 0,
      ),
    ).toBe(true);
  });
});

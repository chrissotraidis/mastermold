/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Portfolio Brain product UI contracts", () => {
  test("GIVEN the money hub WHEN Portfolio renders THEN source, accounts, allocation, and holdings are visible", () => {
    // 2026-09 hub rewrite: net worth = assets − debts, account cards, an
    // interactive allocation donut that filters the holdings table, and a
    // collapsible position-rules panel below. Monarch sync lives in Settings.
    const portfolioPage = source("app/portfolio/page.tsx");
    const hub = source("components/portfolio/portfolio-hub.tsx");
    const monarchPanel = source("components/monarch-mcp-panel.tsx");

    expect(portfolioPage).toContain("function sourceLine");
    expect(portfolioPage).toContain("getMoneySummary(portfolio)");
    expect(portfolioPage).toContain("<PortfolioHub");
    expect(hub).toContain('label="Net worth"');
    expect(hub).toContain('label="Debts"');
    expect(hub).toContain('id="accounts-title"');
    expect(hub).toContain("<DonutChart");
    expect(hub).toContain("onPick={(key) => setFilter(");
    expect(hub).toContain('id="holdings-title"');
    expect(hub).toContain("<ImportSheet");
    expect(portfolioPage.indexOf("<PortfolioHub")).toBeLessThan(portfolioPage.indexOf('id="position-policies"'));
    expect(monarchPanel).toContain('fetch("/api/portfolio-brain/monarch/sync", { method: "POST" })');
    expect(monarchPanel).toContain("Sync Monarch now");
  });

  test("GIVEN Portfolio Brain v1 WHEN Today renders THEN portfolio-aware review prompts are visible", () => {
    // Redesign: Today's 90-second brief renders the top five portfolio
    // recommendations under "Worth your attention" instead of a proof-line rail.
    const todayPage = source("app/page.tsx");

    expect(todayPage).toContain("getPortfolioRecommendations(asOf, 5)");
    expect(todayPage).toContain("Worth your attention");
    expect(todayPage).toContain("function RecommendationLine");
    expect(todayPage).toContain("{recommendation.reason}");
    expect(todayPage).toContain("Nothing needs a decision right now.");
  });

  test("GIVEN Portfolio Brain v1 WHEN Trade renders THEN brokerage and Monarch authority stay out of Trade", () => {
    // Redesign: TradeScopeBanner was deleted in favor of the single global
    // advisory footer in AppShell; Trade itself never names brokerage authority.
    const tradingPage = source("app/trading/page.tsx");
    const appShell = source("components/app-shell.tsx");

    expect(appShell).toContain("Advisory by default — live execution requires an explicit operator action and passing evidence gates.");
    expect(tradingPage).toContain("Live money stays locked.");
    expect(tradingPage).not.toMatch(/Monarch|SnapTrade|Coinbase|Robinhood|brokerage/i);
  });

  test("GIVEN Monarch MCP setup WHEN Settings renders THEN read-only broad snapshot boundaries stay visible", () => {
    // Redesign: the settings hub + integrations pages merged into one flat
    // /settings page; the connection source map became the Connections section.
    const settingsPage = source("app/settings/page.tsx");
    const reviewCapabilities = source("src/product/capabilities.ts");
    const monarchPanel = source("components/monarch-mcp-panel.tsx");
    const localCommands = source("src/chat/local-commands.ts");
    const connector = source("src/db/monarch-mcp.ts");

    expect(settingsPage).toContain('id="connections"');
    expect(settingsPage).toContain("Read-only portfolio sources.");
    expect(settingsPage).toContain("<MonarchMcpPanel");
    expect(settingsPage).toContain('id="portfolio-connections"');
    expect(reviewCapabilities).toContain("Monarch MCP portfolio brain V1");
    expect(reviewCapabilities).toContain("Portfolio prefers that snapshot over sample holdings");
    expect(reviewCapabilities).toContain("read-only portfolio preflight");
    expect(reviewCapabilities).toContain("Monarch snapshot, imported holdings, manual holdings, or sample fallback context");
    expect(reviewCapabilities).toContain("review prompts only");
    expect(reviewCapabilities).toContain("cannot place brokerage trades, sign transactions, or move funds");
    expect(monarchPanel).toContain("buildChecklist");
    expect(monarchPanel).toContain("Scope is read-only snapshot access.");
    expect(monarchPanel).toContain("Monarch MCP is beta and OAuth-based");
    expect(monarchPanel).toContain("read/write scopes");
    expect(monarchPanel).toContain("Master Mold requests read-only access only");
    expect(monarchPanel).toContain("OAuth / connection");
    expect(monarchPanel).toContain("Read-only scope");
    expect(monarchPanel).toContain("Accounts tool");
    expect(monarchPanel).toContain("Holdings tool");
    expect(monarchPanel).toContain("Last sync");
    expect(monarchPanel).toContain("Covered by snapshot tool");
    expect(monarchPanel).toContain("result.tools ?? []");
    expect(monarchPanel).toContain("broad account visibility");
    expect(monarchPanel).toContain("It cannot place Robinhood trades, change Monarch data, sign transactions, or move funds.");
    expect(monarchPanel).toContain("Master Mold requests read-only snapshot access and never calls write or trading tools.");
    // Compact redesign: one status line + collapsed details.
    expect(monarchPanel).toContain("flex min-w-0 flex-1 flex-col gap-3 px-3 py-2.5 sm:flex-row");
    expect(monarchPanel).toContain("Connection details");
    expect(localCommands).toContain("Portfolio check:");
    expect(localCommands).toContain("Source:");
    expect(localCommands).toContain("Chat cannot trade or move funds");
    expect(localCommands).toContain("cannot sign, submit, or move funds");
    expect(connector).toContain('requested_scope: "read"');
    expect(connector).toContain('permission_scope: "read_only_snapshot"');
    expect(connector).not.toContain('requested_scope: "write"');
  });
});

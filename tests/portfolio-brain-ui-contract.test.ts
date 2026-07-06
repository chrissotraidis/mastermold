/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Portfolio Brain product UI contracts", () => {
  test("GIVEN Portfolio Brain v1 WHEN Portfolio renders THEN the source, sync, accounts, and exposures are visible", () => {
    // Redesign: the source banner, account groups, exposure summary, and analysis
    // drawer collapsed into a header source line plus one dense holdings table.
    // Monarch sync moved into the Settings Monarch MCP panel.
    const portfolioPage = source("app/portfolio/page.tsx");
    const monarchPanel = source("components/monarch-mcp-panel.tsx");

    expect(portfolioPage).toContain("function sourceLine");
    expect(portfolioPage).toContain("manual holdings · local only");
    expect(portfolioPage).toContain("imported holdings · read-only snapshot");
    expect(portfolioPage).toContain("Sample data until you add holdings");
    expect(portfolioPage).toContain("{rows.length} positions");
    expect(portfolioPage).toContain("{holding.weight_pct.toFixed(1)}%");
    expect(portfolioPage).toContain('href="#position-policies"');
    expect(portfolioPage).toContain("<PositionPoliciesPanel");
    expect(portfolioPage).toContain("<PortfolioCharts allocation={portfolio.allocation}");
    expect(portfolioPage).toContain('id="add-holdings"');
    expect(portfolioPage).toContain("<ManualHoldingsPanel holdings={portfolio.manual_holdings} />");
    expect(portfolioPage).toContain("Connections (Monarch, brokerages, wallets) live in");
    expect(portfolioPage.indexOf('id="holdings-title"')).toBeLessThan(portfolioPage.indexOf('id="position-policies"'));
    expect(portfolioPage.indexOf('id="position-policies"')).toBeLessThan(portfolioPage.indexOf('id="add-holdings"'));
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

    expect(appShell).toContain("Advisory only — Master Mold never places trades or moves funds.");
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

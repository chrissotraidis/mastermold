/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import {
  buildInvestmentAwarenessSummary,
  buildInvestmentIntegrationPlan,
  buildInvestmentRealtimePlan,
  type InvestmentAwarenessSummary,
  type InvestmentIntegrationPlan,
  type InvestmentRealtimePlan,
} from "@/src/db/investment-awareness";
import { getIntegrationStatuses } from "@/src/db/integrations";
import { getPortfolio, type PortfolioJson } from "@/src/db/portfolio";

describe("investment awareness summary", () => {
  test("GIVEN no manual or imported holdings WHEN Settings renders THEN Master Mold discloses sample-only portfolio context", () => {
    const summary = buildInvestmentAwarenessSummary({
      portfolio: getPortfolio(),
      integrations: getIntegrationStatuses(),
    });

    expect(summary.status).toBe("sample-only");
    expect(summary.headline).toContain("sample holdings");
    expect(summary.daily_decision_boundary).toContain("sample data");
    expect(source(summary, "robinhood").app_can_do_now).toContain("Test SnapTrade access");
    expect(summary.refresh_policy).toContain("Automatic scheduled sync still needs");
  });

  test("GIVEN a fresh Robinhood snapshot WHEN Settings renders THEN daily ideas can use imported exposure but not trade", () => {
    const summary = buildInvestmentAwarenessSummary({
      portfolio: portfolioWithImportedHolding("robinhood", false),
      integrations: getIntegrationStatuses(),
    });

    expect(summary.status).toBe("snapshot-fresh");
    expect(summary.daily_decision_boundary).toContain("imported exposure");
    expect(summary.daily_decision_boundary).toContain("cannot trade");
    expect(source(summary, "robinhood").current_state).toBe("snapshot-ready");
    expect(source(summary, "robinhood").app_can_do_now).toContain("brokerage holding");
  });

  test("GIVEN an old imported snapshot WHEN Settings renders THEN the decision boundary requires refresh first", () => {
    const summary = buildInvestmentAwarenessSummary({
      portfolio: portfolioWithImportedHolding("coinbase", true),
      integrations: getIntegrationStatuses(),
    });

    expect(summary.status).toBe("snapshot-stale");
    expect(summary.daily_decision_boundary).toContain("stale");
    expect(source(summary, "coinbase").current_state).toBe("stale-snapshot");
    expect(source(summary, "coinbase").next_step).toContain("Refresh");
  });

  test("GIVEN no wallet snapshot is imported WHEN Settings renders THEN Web3 stays not-connected and the autonomous bucket stays paper-only", () => {
    // Retirement 2026-07-05: the supervised read-only wallet adapter is gone;
    // wallet awareness now comes only from imported snapshots.
    const summary = buildInvestmentAwarenessSummary({
      portfolio: getPortfolio(),
      integrations: getIntegrationStatuses(),
    });

    expect(source(summary, "web3_wallet").current_state).toBe("not-connected");
    expect(source(summary, "web3_wallet").app_can_do_now).toContain("read-only provider key");
    expect(source(summary, "autonomous_wallet").current_state).toBe("paper-only");
    expect(source(summary, "autonomous_wallet").safety_boundary).toContain("No seed phrases or private keys");
  });

  test("GIVEN no read-only credentials WHEN realtime plan is built THEN automatic sync is not active", () => {
    const plan = buildInvestmentRealtimePlan({
      portfolio: getPortfolio(),
      integrations: getIntegrationStatuses(),
    });

    expect(plan.status).toBe("not-started");
    expect(plan.headline).toContain("not active yet");
    expect(plan.readiness_boundary).toContain("webhook receiver");
    expect(realtimeSource(plan, "snaptrade").status).toBe("needs-oauth");
    expect(realtimeSource(plan, "coinbase").status).toBe("needs-read-key");
    expect(realtimeSource(plan, "autonomous_wallet").safety_boundary).toContain("No private keys or seed phrases");
  });

  test("GIVEN Settings renders integration readiness WHEN plan is built THEN it names real connector lanes and gaps", () => {
    const plan = buildInvestmentIntegrationPlan({
      portfolio: getPortfolio(),
      integrations: getIntegrationStatuses(),
    });

    expect(plan.headline).toContain("read-only account connection");
    expect(plan.principle).toContain("should not scrape Robinhood");
    expect(integrationLane(plan, "snaptrade_brokerage").status).toBe("import-button-ready");
    expect(integrationLane(plan, "snaptrade_brokerage").current_app_support).toContain("copy positions into Portfolio");
    expect(integrationLane(plan, "plaid_investments").status).toBe("needs-provider-app");
    expect(integrationLane(plan, "plaid_investments").next_build_step).toContain("/investments/holdings/get");
    expect(integrationLane(plan, "coinbase_oauth").production_gap).toContain("OAuth app");
    expect(integrationLane(plan, "zerion_wallets").safety_boundary).toContain("No signing");
    expect(integrationLane(plan, "autonomous_wallet").status).toBe("locked-by-design");
  });

  test("GIVEN a Robinhood snapshot WHEN realtime plan is built THEN it stays snapshot-only until refresh webhooks are wired", () => {
    const plan = buildInvestmentRealtimePlan({
      portfolio: portfolioWithImportedHolding("robinhood", false),
      integrations: getIntegrationStatuses(),
    });

    expect(plan.status).toBe("snapshot-watch");
    expect(realtimeSource(plan, "snaptrade").status).toBe("snapshot-ready");
    expect(realtimeSource(plan, "snaptrade").trigger).toContain("ACCOUNT_HOLDINGS_UPDATED");
    expect(plan.readiness_boundary).toContain("does not unlock trading");
  });

  test("GIVEN a wallet snapshot is imported WHEN realtime plan is built THEN Web3 can be event-driven first", () => {
    const plan = buildInvestmentRealtimePlan({
      portfolio: portfolioWithImportedHolding("onchain_wallet", false),
      integrations: getIntegrationStatuses(),
    });

    expect(realtimeSource(plan, "web3_wallet").status).toBe("webhook-ready");
    expect(realtimeSource(plan, "web3_wallet").cadence).toContain("Event-driven");
    expect(realtimeSource(plan, "web3_wallet").safety_boundary).toContain("Public-address reads only");
  });
});

function source(summary: InvestmentAwarenessSummary, id: InvestmentAwarenessSummary["sources"][number]["id"]) {
  const item = summary.sources.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing awareness source ${id}`);
  return item;
}

function realtimeSource(plan: InvestmentRealtimePlan, id: InvestmentRealtimePlan["sources"][number]["id"]) {
  const item = plan.sources.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing realtime source ${id}`);
  return item;
}

function integrationLane(plan: InvestmentIntegrationPlan, id: InvestmentIntegrationPlan["lanes"][number]["id"]) {
  const item = plan.lanes.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing integration lane ${id}`);
  return item;
}

function portfolioWithImportedHolding(
  kind: PortfolioJson["imported_holdings"][number]["account"]["kind"],
  isStale: boolean,
): PortfolioJson {
  const base = getPortfolio();
  const imported = {
    ...base.holdings[0],
    id: `test-import-${kind}`,
    source: "connected" as const,
    account: {
      ...base.holdings[0].account,
      id: `test-${kind}`,
      kind,
      label: kind === "coinbase" ? "Coinbase" : kind === "robinhood" ? "Robinhood" : "Wallet",
      integration_status: "connected" as const,
      scope: "read_only" as const,
    },
  };

  return {
    ...base,
    imported_holdings: [imported],
    import_snapshot: {
      ...base.import_snapshot,
      count: 1,
      skipped_count: 0,
      issue_count: 0,
      issues: [],
      status: isStale ? "Stale snapshot" : "Fresh snapshot",
      last_imported_at: "2026-06-24T08:00:00.000Z",
      last_checked_at: "2026-06-24T08:00:00.000Z",
      oldest_imported_at: "2026-06-24T08:00:00.000Z",
      latest_as_of: "2026-06-24T08:00:00.000Z",
      is_stale: isStale,
      note: isStale
        ? "Imported holdings are read-only snapshots and need a refresh."
        : "Imported holdings are read-only snapshots.",
    },
    provenance: {
      ...base.provenance,
      label: "Imported portfolio",
    },
  };
}

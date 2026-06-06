import { demoDatabase } from "./seed-data";
import { isKnownBy, latestKnowledgeTime, type AsOfFilter } from "./bitemporal";
import type { Account, Asset, PriceBar } from "./schema";

type AssetClass = Asset["asset_class"];

export type PortfolioHoldingJson = {
  id: string;
  symbol: string;
  asset_name: string;
  asset_class: AssetClass;
  venue: string;
  quantity: number;
  cost_basis: number;
  market_value: number;
  weight_pct: number;
  as_of: string;
  account: Pick<Account, "id" | "kind" | "label" | "integration_status" | "scope">;
};

export type AllocationJson = {
  asset_class: AssetClass;
  market_value: number;
  weight_pct: number;
};

export type PriceChartAssetJson = {
  asset: Pick<Asset, "id" | "symbol" | "name" | "asset_class" | "venue">;
  bars: Pick<PriceBar, "ts" | "open" | "high" | "low" | "close" | "volume" | "knowledge_time">[];
};

export type PortfolioJson = {
  total_market_value: number;
  holdings: PortfolioHoldingJson[];
  defi_positions: PortfolioHoldingJson[];
  allocation: AllocationJson[];
  concentration: {
    hhi: number;
    top_position_pct: number;
    top_symbol: string | null;
  };
  chart_assets: PriceChartAssetJson[];
  provenance: {
    label: "Demo data";
    source: "Seeded Holding, Account, Asset, and PriceBar rows";
    as_of: string;
    replay_as_of: string | null;
  };
};

const assetClassOrder: AssetClass[] = ["equity", "crypto", "defi"];

export function getPortfolio(asOf: AsOfFilter | null = null): PortfolioJson {
  const visibleHoldings = demoDatabase.holdings.filter((holding) =>
    isKnownBy(holding.knowledge_time, asOf),
  );
  const visiblePriceBars = demoDatabase.priceBars.filter((bar) => isKnownBy(bar.knowledge_time, asOf));

  const totalMarketValue = roundMoney(
    visibleHoldings.reduce((sum, holding) => sum + holding.market_value, 0),
  );

  const holdings = visibleHoldings
    .map((holding) => {
      const asset = demoDatabase.assets.find((item) => item.id === holding.asset_id);
      const account = demoDatabase.accounts.find((item) => item.id === holding.account_id);

      if (!asset || !account) {
        return null;
      }

      return {
        id: holding.id,
        symbol: asset.symbol,
        asset_name: asset.name,
        asset_class: asset.asset_class,
        venue: asset.venue,
        quantity: holding.quantity,
        cost_basis: holding.cost_basis,
        market_value: holding.market_value,
        weight_pct: totalMarketValue > 0 ? roundPct((holding.market_value / totalMarketValue) * 100) : 0,
        as_of: holding.as_of,
        account: {
          id: account.id,
          kind: account.kind,
          label: account.label,
          integration_status: account.integration_status,
          scope: account.scope,
        },
      } satisfies PortfolioHoldingJson;
    })
    .filter((holding): holding is PortfolioHoldingJson => holding !== null)
    .sort((a, b) => b.market_value - a.market_value || a.symbol.localeCompare(b.symbol));

  const allocation = assetClassOrder.map((assetClass) => {
    const marketValue = holdings
      .filter((holding) => holding.asset_class === assetClass)
      .reduce((sum, holding) => sum + holding.market_value, 0);

    return {
      asset_class: assetClass,
      market_value: roundMoney(marketValue),
      weight_pct: totalMarketValue > 0 ? roundPct((marketValue / totalMarketValue) * 100) : 0,
    };
  });

  const topHolding = holdings[0] ?? null;
  const hhi = Math.round(
    holdings.reduce((sum, holding) => sum + holding.weight_pct * holding.weight_pct, 0),
  );
  const provenanceAsOf = asOf?.iso ?? latestKnowledgeTime([
    ...visibleHoldings.map((holding) => holding.knowledge_time),
    ...visiblePriceBars.map((bar) => bar.knowledge_time),
  ]);

  return {
    total_market_value: totalMarketValue,
    holdings,
    defi_positions: holdings.filter((holding) => holding.asset_class === "defi"),
    allocation,
    concentration: {
      hhi,
      top_position_pct: topHolding?.weight_pct ?? 0,
      top_symbol: topHolding?.symbol ?? null,
    },
    chart_assets: getPriceChartAssets(visiblePriceBars),
    provenance: {
      label: "Demo data",
      source: "Seeded Holding, Account, Asset, and PriceBar rows",
      as_of: provenanceAsOf,
      replay_as_of: asOf?.iso ?? null,
    },
  };
}

function getPriceChartAssets(priceBars: PriceBar[]): PriceChartAssetJson[] {
  return demoDatabase.assets
    .map((asset) => {
      const bars = priceBars
        .filter((bar) => bar.asset_id === asset.id)
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
        .map(({ ts, open, high, low, close, volume, knowledge_time }) => ({
          ts,
          open,
          high,
          low,
          close,
          volume,
          knowledge_time,
        }));

      if (bars.length === 0) {
        return null;
      }

      return {
        asset: {
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          asset_class: asset.asset_class,
          venue: asset.venue,
        },
        bars,
      } satisfies PriceChartAssetJson;
    })
    .filter((item): item is PriceChartAssetJson => item !== null)
    .sort((a, b) => a.asset.symbol.localeCompare(b.asset.symbol));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number) {
  return Math.round(value * 10) / 10;
}

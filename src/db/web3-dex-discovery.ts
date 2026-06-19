import { createHash } from "node:crypto";
import type { DiscoveryCandidate, DiscoverySource, Web3TradingState } from "./web3-trading";

export type Web3DexDiscoveryReceiptStatus =
  | "live-ready"
  | "live-watch"
  | "sample-only"
  | "fallback"
  | "blocked";

export type Web3DexDiscoveryReceipt = {
  mode: "web3-dex-discovery-receipt";
  status: Web3DexDiscoveryReceiptStatus;
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  provider: "DEX Screener";
  provider_docs_url: "https://docs.dexscreener.com/api/reference";
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  secret_echo_permission: "blocked";
  private_key_storage: "blocked";
  transaction_submission_permission: "blocked";
  source_summary: {
    market_source_mode: Web3TradingState["market_source"]["mode"];
    market_source_status: Web3TradingState["market_source"]["status"];
    discovery_status: Web3TradingState["discovery_tape"]["status"];
    stream_freshness_status: Web3TradingState["dex_stream_freshness"]["status"];
    scanner_status: Web3TradingState["live_scanner_readiness"]["status"];
    intake_status: Web3TradingState["autonomous_discovery_intake"]["status"];
    tokens_considered: number;
    pairs_mapped: number;
    pair_coverage_pct: number;
    source_count: number;
    failed_source_count: number;
    live_candidate_count: number;
    paid_hype_count: number;
    top_symbols: string[];
  };
  source_checks: Array<DiscoverySource & {
    rate_limit_class: "discovery-60-rpm" | "pair-300-rpm" | "local";
  }>;
  top_candidates: Array<Pick<
    DiscoveryCandidate,
    | "token_id"
    | "symbol"
    | "chain"
    | "sources"
    | "scout_score"
    | "liquidity_usd"
    | "volume_1h_usd"
    | "age_minutes"
    | "promotion_intensity"
    | "paid_order_checked"
    | "paid_order_count"
    | "approved_paid_order_count"
    | "paid_ad_order_count"
    | "freshness_score"
    | "risk_flags"
    | "note"
  >>;
  blockers: string[];
  controls: string[];
  summary: string;
  next_action: string;
};

export function buildWeb3DexDiscoveryReceipt(state: Web3TradingState): Web3DexDiscoveryReceipt {
  const generatedAt = new Date().toISOString();
  const pairCoverage = state.discovery_tape.tokens_considered > 0
    ? Math.round((state.discovery_tape.pairs_mapped / state.discovery_tape.tokens_considered) * 100)
    : state.discovery_tape.status === "sample" ? 100 : 0;
  const failedSourceCount = state.discovery_tape.sources.filter((source) => source.status === "failed").length;
  const topCandidates = state.discovery_tape.top_candidates.slice(0, 8).map((candidate) => ({
    token_id: candidate.token_id,
    symbol: candidate.symbol,
    chain: candidate.chain,
    sources: candidate.sources,
    scout_score: candidate.scout_score,
    liquidity_usd: candidate.liquidity_usd,
    volume_1h_usd: candidate.volume_1h_usd,
    age_minutes: candidate.age_minutes,
    promotion_intensity: candidate.promotion_intensity,
    paid_order_checked: candidate.paid_order_checked,
    paid_order_count: candidate.paid_order_count,
    approved_paid_order_count: candidate.approved_paid_order_count,
    paid_ad_order_count: candidate.paid_ad_order_count,
    freshness_score: candidate.freshness_score,
    risk_flags: candidate.risk_flags,
    note: candidate.note,
  }));
  const status = dexDiscoveryStatus(state, failedSourceCount);
  const blockers = uniqueStrings([
    ...state.live_scanner_readiness.items.flatMap((item) => item.blockers),
    ...state.autonomous_discovery_intake.items.flatMap((item) => item.blockers),
    state.discovery_tape.status === "fallback" ? state.market_source.detail : null,
    failedSourceCount > 0 ? `${failedSourceCount} DEX discovery source${failedSourceCount === 1 ? "" : "s"} failed.` : null,
  ]).slice(0, 8);
  const receiptBase = {
    mode: "web3-dex-discovery-receipt" as const,
    status,
    generated_at: generatedAt,
    source_state_as_of: state.market_source.fetched_at,
    provider: "DEX Screener" as const,
    provider_docs_url: "https://docs.dexscreener.com/api/reference" as const,
    live_execution_permission: "blocked" as const,
    wallet_mutation_permission: "blocked" as const,
    secret_echo_permission: "blocked" as const,
    private_key_storage: "blocked" as const,
    transaction_submission_permission: "blocked" as const,
    source_summary: {
      market_source_mode: state.market_source.mode,
      market_source_status: state.market_source.status,
      discovery_status: state.discovery_tape.status,
      stream_freshness_status: state.dex_stream_freshness.status,
      scanner_status: state.live_scanner_readiness.status,
      intake_status: state.autonomous_discovery_intake.status,
      tokens_considered: state.discovery_tape.tokens_considered,
      pairs_mapped: state.discovery_tape.pairs_mapped,
      pair_coverage_pct: pairCoverage,
      source_count: state.discovery_tape.sources.length,
      failed_source_count: failedSourceCount,
      live_candidate_count: topCandidates.filter((candidate) => !candidate.sources.includes("sample-seed")).length,
      paid_hype_count: state.live_discovery_delta_tape.paid_hype_count,
      top_symbols: topCandidates.map((candidate) => candidate.symbol),
    },
    source_checks: state.discovery_tape.sources.map((source) => ({
      ...source,
      rate_limit_class: discoveryRateLimitClass(source),
    })),
    top_candidates: topCandidates,
    blockers,
    controls: [
      "Reads only public DEX Screener discovery, boost, ad, paid-order, and token-pair evidence.",
      "Discovery endpoints are budgeted as 60 requests/minute; token-pair backfill is budgeted separately as 300 requests/minute.",
      "Receipt fields are scanner evidence for local paper decisions only; they do not authorize signing, submission, live execution, or wallet mutation.",
      "Private keys, seed phrases, API keys, raw transactions, signed payloads, and wallet authority are never requested or returned.",
    ],
    summary: dexDiscoverySummary(status, state),
    next_action: dexDiscoveryNextAction(status, state, blockers),
  };

  return {
    ...receiptBase,
    receipt_hash: hashJson(receiptBase),
  };
}

function dexDiscoveryStatus(
  state: Web3TradingState,
  failedSourceCount: number,
): Web3DexDiscoveryReceiptStatus {
  if (state.discovery_tape.status === "sample") return "sample-only";
  if (state.discovery_tape.status === "fallback" || state.market_source.status === "fallback") return "fallback";
  if (failedSourceCount > 0 || state.discovery_tape.pairs_mapped === 0) return "blocked";
  if (state.live_scanner_readiness.status === "attack-ready" || state.autonomous_discovery_intake.status === "attack-ready") {
    return "live-ready";
  }
  return "live-watch";
}

function dexDiscoverySummary(status: Web3DexDiscoveryReceiptStatus, state: Web3TradingState) {
  if (status === "live-ready") {
    return `${state.discovery_tape.pairs_mapped} live DEX pair${state.discovery_tape.pairs_mapped === 1 ? "" : "s"} mapped; scanner evidence is ready for bounded local paper decisions.`;
  }
  if (status === "live-watch") {
    return `${state.discovery_tape.pairs_mapped} live DEX pair${state.discovery_tape.pairs_mapped === 1 ? "" : "s"} mapped; keep watching until source, freshness, and route gates clear.`;
  }
  if (status === "sample-only") return "DEX discovery is replaying sample candidates only; switch to live-dex before treating the tape as current.";
  if (status === "fallback") return "Live DEX discovery fell back to sample protection; scanner output is not current enough for fresh paper buys.";
  return "Live DEX discovery is blocked until source failures or pair mapping gaps are repaired.";
}

function dexDiscoveryNextAction(
  status: Web3DexDiscoveryReceiptStatus,
  state: Web3TradingState,
  blockers: string[],
) {
  if (blockers.length > 0) return blockers[0];
  if (status === "live-ready") return state.live_scanner_readiness.next_action;
  if (status === "live-watch") return state.autonomous_discovery_intake.next_action;
  if (status === "sample-only") return "Open Web3 Trading in Live DEX mode to fetch current public DEX discovery evidence.";
  if (status === "fallback") return "Retry DEX discovery after provider rate limits or network errors clear.";
  return "Repair DEX discovery source checks before allowing scanner intake.";
}

function discoveryRateLimitClass(source: DiscoverySource): "discovery-60-rpm" | "pair-300-rpm" | "local" {
  if (source.id === "sample-seed" || source.id === "portfolio-watch" || source.id === "wallet-holdings") return "local";
  return "discovery-60-rpm";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim().length > 0)))];
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

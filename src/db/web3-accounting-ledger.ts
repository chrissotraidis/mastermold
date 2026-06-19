import { createHash } from "node:crypto";
import type { Web3TradingState } from "./web3-trading";

export type Web3AccountingLedgerRow = {
  row_id: string;
  occurred_at: string;
  source: "paper-fill-ledger" | "settlement-review";
  source_id_hash: string;
  symbol: string;
  side: "buy" | "sell";
  notional_usd: number;
  price_usd: number;
  estimated_pnl_usd: number;
  lane: string;
  settlement_status: "paper-only" | "reconciled" | "not-reconciled";
  storage_rule: "redacted";
};

export type Web3AccountingLedgerCheck = {
  id:
    | "paper-ledger"
    | "portfolio-pnl"
    | "wallet-scope"
    | "transaction-decode"
    | "settlement"
    | "portfolio-mirror"
    | "live-boundary";
  label: string;
  status: "pass" | "watch" | "fail";
  detail: string;
};

export type Web3AccountingLedgerReceipt = {
  mode: "web3-accounting-ledger-receipt";
  status: "paper-ledger-ready" | "missing-paper-fills" | "live-accounting-gated" | "settlement-review" | "blocked";
  generated_at: string;
  source_state_as_of: string;
  receipt_hash: string;
  export_scope: "paper-ledger-and-redacted-readiness";
  accounting_boundary: "paper-only";
  paper_account: {
    mode: Web3TradingState["paper_account"]["mode"];
    persisted: boolean;
    cycle: number;
    trade_count: number;
    last_updated_at: string;
  };
  portfolio_summary: {
    starting_cash_usd: number;
    cash_usd: number;
    equity_usd: number;
    exposure_usd: number;
    realized_pnl_usd: number;
    unrealized_pnl_usd: number;
    net_pnl_usd: number;
    max_drawdown_pct: number;
    open_position_count: number;
  };
  fill_summary: {
    recent_fill_count: number;
    total_trade_count: number;
    buy_count: number;
    sell_count: number;
    paper_volume_usd: number;
    average_fill_usd: number;
    net_pnl_usd: number;
    best_lane: string | null;
    worst_lane: string | null;
    last_fill_symbol: string | null;
    last_fill_side: "buy" | "sell" | null;
    next_fill_permission: Web3TradingState["autonomous_fill_ledger_digest"]["next_fill_permission"];
  };
  wallet_accounting: {
    status: Web3TradingState["live_wallet_accounting_readiness"]["status"];
    readiness_score: number;
    wallet_scoped: boolean;
    rpc_configured: boolean;
    holdings_status: Web3TradingState["live_wallet_accounting_readiness"]["holdings_status"];
    priced_wallet_mint_count: number;
    unpriced_token_account_count: number;
    decoded_transaction_count: number;
    swap_transaction_count: number;
    failed_transaction_count: number;
    can_trust_live_pnl: boolean;
  };
  settlement_summary: {
    settlement_status: Web3TradingState["live_wallet_accounting_readiness"]["settlement_status"];
    mirror_status: Web3TradingState["live_wallet_accounting_readiness"]["mirror_status"];
    settlement_signature_hash: string | null;
    mirror_trade_id_hash: string | null;
    reviewed_fill_usd: number | null;
  };
  export_columns: string[];
  sample_rows: Web3AccountingLedgerRow[];
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  tax_export_permission: "paper-only" | "blocked";
  blockers: string[];
  checks: Web3AccountingLedgerCheck[];
  summary: string;
  next_action: string;
  controls: string[];
};

const EXPORT_COLUMNS = [
  "occurred_at",
  "source",
  "source_id_hash",
  "symbol",
  "side",
  "notional_usd",
  "price_usd",
  "estimated_pnl_usd",
  "lane",
  "settlement_status",
  "storage_rule",
];

export function buildWeb3AccountingLedgerReceipt(
  state: Web3TradingState,
  now = new Date(),
): Web3AccountingLedgerReceipt {
  const portfolio = state.portfolio;
  const digest = state.autonomous_fill_ledger_digest;
  const readiness = state.live_wallet_accounting_readiness;
  const settlement = state.settlement_fill_reconciliation;
  const mirror = state.portfolio_mirror_apply;
  const generatedAt = now.toISOString();
  const netPnl = roundMoney(portfolio.realized_pnl_usd + portfolio.unrealized_pnl_usd);
  const rows = digest.items.slice(0, 8).map((item, index): Web3AccountingLedgerRow => ({
    row_id: `paper-${index + 1}`,
    occurred_at: item.created_at,
    source: "paper-fill-ledger",
    source_id_hash: shortHash(item.id),
    symbol: item.symbol,
    side: item.side,
    notional_usd: roundMoney(item.size_usd),
    price_usd: roundPrice(item.price_usd),
    estimated_pnl_usd: roundMoney(item.estimated_contribution_usd),
    lane: item.lane_label,
    settlement_status: "paper-only",
    storage_rule: "redacted",
  }));
  const walletScoped = Boolean(readiness.wallet_public_key);
  const settlementSignatureHash = settlement?.signature ? shortHash(settlement.signature) : null;
  const mirrorTradeHash = mirror?.trade_id ? shortHash(mirror.trade_id) : null;
  const reviewedFillUsd = settlement?.input_usd ?? settlement?.output_usd ?? mirror?.fill_notional_usd ?? null;
  const checks = accountingChecks(state);
  const blockers = [
    state.paper_account.trade_count <= 0 && rows.length === 0 ? "No local paper fills are available for an accounting export preview." : null,
    !readiness.can_trust_live_pnl ? readiness.blockers[0] ?? "Live wallet PnL is not trusted yet." : null,
    readiness.settlement_status !== "reconciled" ? "No reconciled live fill settlement is available for real-capital accounting." : null,
    readiness.mirror_status !== "applied" && readiness.mirror_status !== "duplicate" ? "Guarded portfolio mirror evidence has not been applied for live fills." : null,
  ].filter((item): item is string => Boolean(item));
  const status = accountingStatus(state, rows.length);
  const receiptHash = createHash("sha256")
    .update(JSON.stringify({
      mode: "web3-accounting-ledger-receipt",
      generatedAt,
      sourceStateAsOf: state.as_of,
      paperCycle: state.paper_account.cycle,
      tradeCount: state.paper_account.trade_count,
      portfolio: {
        equity: roundMoney(portfolio.equity_usd),
        exposure: roundMoney(portfolio.exposure_usd),
        realized: roundMoney(portfolio.realized_pnl_usd),
        unrealized: roundMoney(portfolio.unrealized_pnl_usd),
      },
      digest: {
        recent: digest.recent_fill_count,
        volume: roundMoney(digest.paper_volume_usd),
        pnl: roundMoney(digest.net_pnl_usd),
      },
      readiness: {
        status: readiness.status,
        settlement: readiness.settlement_status,
        mirror: readiness.mirror_status,
      },
      rows: rows.map((row) => [row.source_id_hash, row.symbol, row.side, row.notional_usd, row.estimated_pnl_usd]),
    }))
    .digest("hex");

  return {
    mode: "web3-accounting-ledger-receipt",
    status,
    generated_at: generatedAt,
    source_state_as_of: state.as_of,
    receipt_hash: receiptHash,
    export_scope: "paper-ledger-and-redacted-readiness",
    accounting_boundary: "paper-only",
    paper_account: {
      mode: state.paper_account.mode,
      persisted: state.paper_account.persisted,
      cycle: state.paper_account.cycle,
      trade_count: state.paper_account.trade_count,
      last_updated_at: state.paper_account.last_updated_at,
    },
    portfolio_summary: {
      starting_cash_usd: roundMoney(portfolio.starting_cash_usd),
      cash_usd: roundMoney(portfolio.cash_usd),
      equity_usd: roundMoney(portfolio.equity_usd),
      exposure_usd: roundMoney(portfolio.exposure_usd),
      realized_pnl_usd: roundMoney(portfolio.realized_pnl_usd),
      unrealized_pnl_usd: roundMoney(portfolio.unrealized_pnl_usd),
      net_pnl_usd: netPnl,
      max_drawdown_pct: roundPct(portfolio.max_drawdown_pct),
      open_position_count: portfolio.open_positions.length,
    },
    fill_summary: {
      recent_fill_count: digest.recent_fill_count,
      total_trade_count: state.paper_account.trade_count,
      buy_count: digest.buy_count,
      sell_count: digest.sell_count,
      paper_volume_usd: roundMoney(digest.paper_volume_usd),
      average_fill_usd: roundMoney(digest.average_fill_usd),
      net_pnl_usd: roundMoney(digest.net_pnl_usd),
      best_lane: digest.best_lane,
      worst_lane: digest.worst_lane,
      last_fill_symbol: digest.last_fill_symbol,
      last_fill_side: digest.last_fill_side,
      next_fill_permission: digest.next_fill_permission,
    },
    wallet_accounting: {
      status: readiness.status,
      readiness_score: readiness.readiness_score,
      wallet_scoped: walletScoped,
      rpc_configured: readiness.rpc_configured,
      holdings_status: readiness.holdings_status,
      priced_wallet_mint_count: readiness.priced_wallet_mint_count,
      unpriced_token_account_count: readiness.unpriced_token_account_count,
      decoded_transaction_count: readiness.decoded_transaction_count,
      swap_transaction_count: readiness.swap_transaction_count,
      failed_transaction_count: readiness.failed_transaction_count,
      can_trust_live_pnl: readiness.can_trust_live_pnl,
    },
    settlement_summary: {
      settlement_status: readiness.settlement_status,
      mirror_status: readiness.mirror_status,
      settlement_signature_hash: settlementSignatureHash,
      mirror_trade_id_hash: mirrorTradeHash,
      reviewed_fill_usd: reviewedFillUsd === null ? null : roundMoney(reviewedFillUsd),
    },
    export_columns: EXPORT_COLUMNS,
    sample_rows: rows,
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    tax_export_permission: rows.length > 0 ? "paper-only" : "blocked",
    blockers,
    checks,
    summary: accountingSummary(status, state, rows.length),
    next_action: accountingNextAction(status, blockers),
    controls: [
      "This receipt is an accounting preview for local paper fills and redacted readiness evidence; it is not CPA-reviewed tax advice.",
      "Rows use hashed source ids and never return API keys, private keys, seed phrases, raw transaction bodies, unsigned payloads, signed payloads, or full signatures.",
      "Live wallet PnL remains untrusted until wallet scope, RPC reads, pricing coverage, settlement reconciliation, and guarded portfolio mirror evidence pass.",
      "The receipt cannot sign, submit, approve, transfer, custody funds, or unlock autonomous live trading.",
    ],
  };
}

function accountingStatus(
  state: Web3TradingState,
  rowCount: number,
): Web3AccountingLedgerReceipt["status"] {
  const readiness = state.live_wallet_accounting_readiness;
  if (state.execution_gate.live_execution_enabled) return "blocked";
  if (state.paper_account.trade_count <= 0 && rowCount === 0) return "missing-paper-fills";
  if (readiness.settlement_status === "reconciled" || readiness.mirror_status === "applied" || readiness.mirror_status === "duplicate") {
    return "settlement-review";
  }
  if (!readiness.can_trust_live_pnl) return "live-accounting-gated";
  return "paper-ledger-ready";
}

function accountingChecks(state: Web3TradingState): Web3AccountingLedgerCheck[] {
  const readiness = state.live_wallet_accounting_readiness;
  const digest = state.autonomous_fill_ledger_digest;
  const netPnl = state.portfolio.realized_pnl_usd + state.portfolio.unrealized_pnl_usd;
  return [
    {
      id: "paper-ledger",
      label: "Paper ledger",
      status: state.paper_account.trade_count > 0 || digest.recent_fill_count > 0 ? "pass" : "watch",
      detail: `${state.paper_account.trade_count} total paper fill${state.paper_account.trade_count === 1 ? "" : "s"}; ${digest.recent_fill_count} visible in the recent digest.`,
    },
    {
      id: "portfolio-pnl",
      label: "Portfolio PnL",
      status: state.portfolio.equity_usd > 0 ? "pass" : "fail",
      detail: `Paper equity ${formatMoney(state.portfolio.equity_usd)}, realized ${formatMoney(state.portfolio.realized_pnl_usd)}, unrealized ${formatMoney(state.portfolio.unrealized_pnl_usd)}, net ${formatMoney(netPnl)}.`,
    },
    {
      id: "wallet-scope",
      label: "Wallet scope",
      status: readiness.wallet_public_key ? "pass" : "fail",
      detail: readiness.wallet_public_key ? "A public wallet key is scoped for read-only accounting checks." : "No public wallet key is scoped for live wallet accounting.",
    },
    {
      id: "transaction-decode",
      label: "Transaction decode",
      status: readiness.transaction_intelligence_status === "ready" || readiness.transaction_intelligence_status === "empty" ? "pass" : readiness.transaction_intelligence_status === "blocked" ? "fail" : "watch",
      detail: `${readiness.transaction_intelligence_status.replaceAll("-", " ")}; ${readiness.decoded_transaction_count} decoded, ${readiness.swap_transaction_count} swap-like, ${readiness.failed_transaction_count} failed.`,
    },
    {
      id: "settlement",
      label: "Settlement",
      status: readiness.settlement_status === "reconciled" ? "pass" : readiness.settlement_status === "ambiguous" || readiness.settlement_status === "failed" || readiness.settlement_status === "blocked" ? "fail" : "watch",
      detail: `Settlement reconciliation is ${readiness.settlement_status.replaceAll("-", " ")}.`,
    },
    {
      id: "portfolio-mirror",
      label: "Portfolio mirror",
      status: readiness.mirror_status === "applied" || readiness.mirror_status === "duplicate" ? "pass" : readiness.mirror_status === "blocked" ? "fail" : "watch",
      detail: `Guarded portfolio mirror is ${readiness.mirror_status.replaceAll("-", " ")}.`,
    },
    {
      id: "live-boundary",
      label: "Live boundary",
      status: state.execution_gate.live_execution_enabled ? "fail" : "pass",
      detail: "Live execution and wallet mutation remain blocked by this receipt.",
    },
  ];
}

function accountingSummary(
  status: Web3AccountingLedgerReceipt["status"],
  state: Web3TradingState,
  rowCount: number,
) {
  if (status === "blocked") return "Accounting receipt is blocked because a live execution flag is not in the expected fail-closed state.";
  if (status === "missing-paper-fills") return "No local paper fills are available yet, so the ledger can only show readiness gates.";
  if (status === "settlement-review") return `Accounting receipt includes ${rowCount} redacted paper row${rowCount === 1 ? "" : "s"} plus settlement or mirror review evidence.`;
  if (status === "live-accounting-gated") return `Paper accounting is available for ${state.paper_account.trade_count} fill${state.paper_account.trade_count === 1 ? "" : "s"}, but live wallet PnL is still gated.`;
  return `Paper accounting is ready for ${state.paper_account.trade_count} local fill${state.paper_account.trade_count === 1 ? "" : "s"} with live execution blocked.`;
}

function accountingNextAction(
  status: Web3AccountingLedgerReceipt["status"],
  blockers: string[],
) {
  if (status === "blocked") return blockers[0] ?? "Restore the fail-closed live execution boundary before reviewing accounting.";
  if (status === "missing-paper-fills") return "Run a bounded paper session or promoted paper proof, then rebuild the accounting receipt.";
  if (status === "settlement-review") return "Review settlement and mirror evidence before treating any real fill as accounted.";
  if (status === "live-accounting-gated") return blockers[0] ?? "Complete wallet, settlement, mirror, and pricing gates before trusting live PnL.";
  return "Export or review the paper ledger preview, then keep collecting out-of-sample paper proof.";
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPrice(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundPct(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(roundMoney(value)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

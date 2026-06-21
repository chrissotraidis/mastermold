import type { Web3TradingState } from "./web3-trading";

export type Web3LiveAutonomyReadinessHealth = {
  mode: "web3-live-autonomy-readiness-health";
  status: Web3TradingState["autonomous_live_autonomy_readiness"]["status"];
  source: Web3TradingState["market_source"]["mode"];
  account: Web3TradingState["paper_account"]["mode"];
  scenario: Web3TradingState["scenario"];
  readiness_score: number;
  can_run_unattended: boolean;
  can_trade_real_capital: boolean;
  live_execution_permitted: boolean;
  max_live_trade_usd: number;
  daily_cap_remaining_usd: number;
  fastest_ttl_seconds: number;
  next_wake_seconds: number;
  failed_item_count: number;
  watch_item_count: number;
  passed_item_count: number;
  blocker_count: number;
  next_action: string;
  source_endpoint: string;
  live_review_source_endpoint: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  signing_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

export function buildWeb3LiveAutonomyReadinessHealth(
  state: Web3TradingState,
): Web3LiveAutonomyReadinessHealth {
  const readiness = state.autonomous_live_autonomy_readiness;
  const failedItemCount = readiness.items.filter((item) => item.status === "fail").length;
  const watchItemCount = readiness.items.filter((item) => item.status === "watch").length;
  const passedItemCount = readiness.items.filter((item) => item.status === "pass").length;

  return {
    mode: "web3-live-autonomy-readiness-health",
    status: readiness.status,
    source: state.market_source.mode,
    account: state.paper_account.mode,
    scenario: state.scenario,
    readiness_score: readiness.readiness_score,
    can_run_unattended: readiness.can_run_unattended,
    can_trade_real_capital: readiness.can_trade_real_capital,
    live_execution_permitted: readiness.live_execution_permitted,
    max_live_trade_usd: readiness.max_live_trade_usd,
    daily_cap_remaining_usd: readiness.daily_cap_remaining_usd,
    fastest_ttl_seconds: readiness.fastest_ttl_seconds,
    next_wake_seconds: readiness.next_wake_seconds,
    failed_item_count: failedItemCount,
    watch_item_count: watchItemCount,
    passed_item_count: passedItemCount,
    blocker_count: readiness.blockers.length,
    next_action: readiness.next_action,
    source_endpoint: `/api/web3-live-autonomy-readiness?source=${state.market_source.mode}&account=${state.paper_account.mode}&scenario=${state.scenario}&cycles=0`,
    live_review_source_endpoint: "/api/web3-live-autonomy-readiness?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    signing_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
  };
}

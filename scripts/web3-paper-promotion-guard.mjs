#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runWeb3AutonomousForwardRun } from "./web3-autonomous-forward-run.mjs";

const DEFAULT_BASE_URL = "http://localhost:4010";
const SCENARIOS = ["base", "breakout", "rug-risk", "all"];

export function parsePaperPromotionGuardArgs(argv = [], env = process.env) {
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);
    flags.set(key, rawValue ?? "true");
  }

  return {
    baseUrl: normalizeBaseUrl(flags.get("base-url") ?? env.WEB3_TRADING_BASE_URL ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(flags.get("scenario") ?? env.WEB3_PROMOTION_SCENARIO ?? "all", SCENARIOS, "all"),
    source: normalizeChoice(flags.get("source") ?? env.WEB3_PROMOTION_SOURCE ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(flags.get("runner-id") ?? env.WEB3_PROMOTION_RUNNER_ID ?? "paper-promotion-daemon", "paper-promotion-daemon", 80),
    runs: boundedInteger(flags.get("runs") ?? env.WEB3_PROMOTION_RUNS, 3, 1, 30),
    ticks: boundedInteger(flags.get("ticks") ?? env.WEB3_PROMOTION_TICKS, 6, 1, 120),
    intervalMs: boundedInteger(flags.get("interval-ms") ?? env.WEB3_PROMOTION_INTERVAL_MS, 0, 0, 120_000),
    minNetPnlUsd: boundedNumber(flags.get("min-net-pnl") ?? env.WEB3_PROMOTION_MIN_NET_PNL_USD, 0, -1_000_000, 1_000_000),
    minHitRatePct: boundedNumber(flags.get("min-hit-rate-pct") ?? env.WEB3_PROMOTION_MIN_HIT_RATE_PCT, 100, 0, 100),
    minDeployedAlphaUsd: boundedNumber(flags.get("min-deployed-alpha") ?? env.WEB3_PROMOTION_MIN_DEPLOYED_ALPHA_USD, 0, -1_000_000, 1_000_000),
    maxDrawdownUsd: boundedNumber(flags.get("max-drawdown") ?? env.WEB3_PROMOTION_MAX_DRAWDOWN_USD, 1_000, 0, 1_000_000),
    minConsistencyScore: boundedNumber(flags.get("min-consistency-score") ?? env.WEB3_PROMOTION_MIN_CONSISTENCY_SCORE, 80, 0, 100),
    failOnBlocked: booleanFlag(flags.get("fail-on-blocked") ?? env.WEB3_PROMOTION_FAIL_ON_BLOCKED, false),
    json: booleanFlag(flags.get("json") ?? env.WEB3_PROMOTION_JSON, false),
  };
}

export async function runWeb3PaperPromotionGuard(input = {}) {
  const config = {
    ...parsePaperPromotionGuardArgs([], {}),
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl ?? DEFAULT_BASE_URL),
    scenario: normalizeChoice(input.scenario ?? "all", SCENARIOS, "all"),
    source: normalizeChoice(input.source ?? "sample", ["sample", "live-dex"], "sample"),
    runnerId: normalizeLeaseText(input.runnerId ?? "paper-promotion-daemon", "paper-promotion-daemon", 80),
    runs: boundedInteger(input.runs, 3, 1, 30),
    ticks: boundedInteger(input.ticks, 6, 1, 120),
    intervalMs: boundedInteger(input.intervalMs, 0, 0, 120_000),
    minNetPnlUsd: boundedNumber(input.minNetPnlUsd, 0, -1_000_000, 1_000_000),
    minHitRatePct: boundedNumber(input.minHitRatePct, 100, 0, 100),
    minDeployedAlphaUsd: boundedNumber(input.minDeployedAlphaUsd, 0, -1_000_000, 1_000_000),
    maxDrawdownUsd: boundedNumber(input.maxDrawdownUsd, 1_000, 0, 1_000_000),
    minConsistencyScore: boundedNumber(input.minConsistencyScore, 80, 0, 100),
    failOnBlocked: Boolean(input.failOnBlocked),
  };
  const repeatProof = input.repeatProof ?? await runWeb3AutonomousForwardRun({
    baseUrl: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    runnerId: config.runnerId,
    runs: config.runs,
    ticks: config.ticks,
    intervalMs: config.intervalMs,
    minNetPnlUsd: config.minNetPnlUsd,
    minHitRatePct: config.minHitRatePct,
    minDeployedAlphaUsd: config.minDeployedAlphaUsd,
    maxDrawdownUsd: config.maxDrawdownUsd,
    minConsistencyScore: config.minConsistencyScore,
    heartbeatWhenGated: true,
    failUnderTarget: false,
  });
  const report = buildPaperPromotionGuardReport({ config, repeatProof });
  if (config.failOnBlocked && report.exit_code !== 0) {
    const error = new Error(report.blockers[0] ?? "Paper promotion guard blocked autonomy.");
    error.report = report;
    throw error;
  }
  return report;
}

export function buildPaperPromotionGuardReport({ config, repeatProof }) {
  const proofGatePassed = repeatProof?.proof_gate_status === "passed";
  const netPnl = roundMoney(repeatProof?.net_pnl_usd);
  const averageNetPnl = roundMoney(repeatProof?.average_net_pnl_usd);
  const deployedAlpha = roundMoney(repeatProof?.deployed_hot_coin_alpha_usd);
  const fullWalletHotAlpha = roundMoney(repeatProof?.hot_coin_alpha_usd);
  const hitRate = roundMoney(repeatProof?.hit_rate_pct);
  const targetHitRate = roundMoney(repeatProof?.target_hit_rate_pct);
  const drawdown = roundMoney(repeatProof?.max_cumulative_drawdown_usd);
  const consistency = roundMoney(repeatProof?.consistency_score);
  const moved = Number(repeatProof?.advanced_ticks ?? 0) > 0 && Number(repeatProof?.trade_count_delta ?? 0) > 0;
  const proofBlockers = Array.isArray(repeatProof?.proof_gate_blockers) ? repeatProof.proof_gate_blockers : [];
  const blockers = uniqueText([
    !repeatProof ? "Repeat forward proof is missing." : null,
    !proofGatePassed ? proofBlockers[0] ?? "Repeat forward proof has not passed the paper-promotion gate." : null,
    !moved ? "Forward proof did not move paper capital, so there is no strategy to promote." : null,
    drawdown > Number(config.maxDrawdownUsd ?? 1_000) ? `Drawdown ${formatCurrency(-drawdown)} exceeds ${formatCurrency(-Number(config.maxDrawdownUsd ?? 1_000))}.` : null,
  ]);
  const status = promotionStatus({ proofGatePassed, blockers, netPnl, deployedAlpha, fullWalletHotAlpha, consistency });
  const permission = promotionPermission(status);
  const sizeMultiplier = promotionSizeMultiplier(status, fullWalletHotAlpha, consistency);
  const maxSupervisedRounds = promotionSupervisedRounds(status);
  const maxTicksPerRound = promotionTicksPerRound(status);
  const targetNetPnlUsd = promotionTargetNetPnl(status, averageNetPnl);
  const maxDrawdownUsd = promotionMaxDrawdown(status, drawdown, targetNetPnlUsd);

  return {
    mode: "web3-paper-promotion-guard",
    paper_only: true,
    status,
    exit_code: status === "blocked" ? 1 : 0,
    base_url: config.baseUrl,
    scenario: config.scenario,
    source: config.source,
    runner_id: config.runnerId,
    repeat_proof_status: repeatProof?.proof_gate_status ?? "missing",
    repeat_promotion_permission: repeatProof?.promotion_permission ?? "missing",
    net_pnl_usd: netPnl,
    average_net_pnl_usd: averageNetPnl,
    hit_rate_pct: hitRate,
    target_hit_rate_pct: targetHitRate,
    consistency_score: consistency,
    max_cumulative_drawdown_usd: drawdown,
    deployed_hot_coin_alpha_usd: deployedAlpha,
    full_wallet_hot_coin_alpha_usd: fullWalletHotAlpha,
    advanced_ticks: Number(repeatProof?.advanced_ticks ?? 0),
    trade_count_delta: Number(repeatProof?.trade_count_delta ?? 0),
    promotion_permission: permission,
    can_start_supervised_paper: status !== "blocked",
    can_increase_paper_size: status === "scale-paper",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    recommended_paper_size_multiplier: sizeMultiplier,
    recommended_supervisor_rounds: maxSupervisedRounds,
    recommended_ticks_per_round: maxTicksPerRound,
    recommended_target_net_pnl_usd: targetNetPnlUsd,
    recommended_max_drawdown_usd: maxDrawdownUsd,
    blockers,
    summary: promotionSummary(status, netPnl, deployedAlpha, fullWalletHotAlpha, consistency),
    next_action: promotionNextAction(status, blockers, maxSupervisedRounds, maxTicksPerRound, targetNetPnlUsd, maxDrawdownUsd),
    controls: [
      "Promotion guard converts repeat paper proof into a bounded paper autonomy posture only.",
      "Full-wallet hot-coin underperformance prevents scale-up even when same-notional deployed alpha is positive.",
      "Scale, selective, and protect permissions can tune paper size, supervised rounds, and loss brakes; they cannot sign, submit, custody funds, or authorize real-capital trading.",
      "Blocked permission should stop unattended paper expansion until repeat proof, hit rate, drawdown, deployed alpha, and movement evidence clear together.",
    ],
    items: promotionItems({ repeatProof, config, moved, netPnl, deployedAlpha, fullWalletHotAlpha, hitRate, drawdown, consistency }),
  };
}

function promotionStatus({ proofGatePassed, blockers, netPnl, deployedAlpha, fullWalletHotAlpha, consistency }) {
  if (!proofGatePassed || blockers.length > 0) return "blocked";
  if (netPnl <= 0 || deployedAlpha < 0) return "protect-paper";
  if (fullWalletHotAlpha >= 0 && consistency >= 90) return "scale-paper";
  if (fullWalletHotAlpha >= 0) return "selective-paper";
  return "selective-paper";
}

function promotionPermission(status) {
  if (status === "scale-paper") return "scale-paper";
  if (status === "selective-paper") return "selective-paper";
  if (status === "protect-paper") return "protect-only";
  return "blocked";
}

function promotionSizeMultiplier(status, fullWalletHotAlpha, consistency) {
  if (status === "scale-paper") return consistency >= 95 ? 1.25 : 1.1;
  if (status === "selective-paper") return fullWalletHotAlpha >= 0 ? 0.85 : 0.65;
  if (status === "protect-paper") return 0.3;
  return 0;
}

function promotionSupervisedRounds(status) {
  if (status === "scale-paper") return 24;
  if (status === "selective-paper") return 12;
  if (status === "protect-paper") return 6;
  return 0;
}

function promotionTicksPerRound(status) {
  if (status === "scale-paper") return 2;
  if (status === "selective-paper") return 2;
  if (status === "protect-paper") return 1;
  return 0;
}

function promotionTargetNetPnl(status, averageNetPnl) {
  if (status === "blocked") return 0;
  const base = Math.max(1, Math.abs(averageNetPnl || 0));
  if (status === "scale-paper") return roundMoney(base * 1.2);
  if (status === "selective-paper") return roundMoney(base * 0.7);
  return roundMoney(base * 0.35);
}

function promotionMaxDrawdown(status, observedDrawdown, targetNetPnl) {
  if (status === "blocked") return 0;
  const floor = status === "scale-paper" ? 150 : status === "selective-paper" ? 90 : 45;
  return roundMoney(Math.max(floor, observedDrawdown * 1.5, targetNetPnl * 1.8));
}

function promotionSummary(status, netPnl, deployedAlpha, fullWalletHotAlpha, consistency) {
  if (status === "scale-paper") return `Repeat proof clears scale-up with ${formatCurrency(netPnl)} paper PnL, ${formatCurrency(deployedAlpha)} deployed alpha, and ${consistency}/100 consistency.`;
  if (status === "selective-paper") return `Repeat proof is profitable, but full-wallet hot-coin alpha is ${formatCurrency(fullWalletHotAlpha)}; keep paper sizing selective.`;
  if (status === "protect-paper") return `Repeat proof is not strong enough for fresh risk; keep protect-only paper autonomy until net PnL and deployed alpha recover.`;
  return "Paper promotion is blocked until repeat profit, movement, drawdown, hit-rate, and alpha gates clear.";
}

function promotionNextAction(status, blockers, rounds, ticksPerRound, targetNetPnl, maxDrawdown) {
  if (status === "blocked") return blockers[0] ?? "Rerun repeat proof after repairing the blocked gate.";
  if (status === "protect-paper") return `Run at most ${rounds} protect-first paper rounds with ${ticksPerRound} tick per round and a ${formatCurrency(-maxDrawdown)} loss brake.`;
  return `Allow ${rounds} supervised paper rounds at ${ticksPerRound} tick${ticksPerRound === 1 ? "" : "s"} per round, target ${formatCurrency(targetNetPnl)}, and loss brake ${formatCurrency(-maxDrawdown)}.`;
}

function promotionItems({ repeatProof, config, moved, netPnl, deployedAlpha, fullWalletHotAlpha, hitRate, drawdown, consistency }) {
  return [
    {
      id: "net-pnl",
      label: "Net PnL",
      status: netPnl >= Number(config.minNetPnlUsd ?? 0) * Math.max(1, Number(repeatProof?.run_count ?? 1)) ? "pass" : "fail",
      value: formatCurrency(netPnl),
      detail: `Minimum target is ${formatCurrency(Number(config.minNetPnlUsd ?? 0) * Math.max(1, Number(repeatProof?.run_count ?? 1)))} across repeat runs.`,
    },
    {
      id: "hit-rate",
      label: "Hit rate",
      status: hitRate >= Number(config.minHitRatePct ?? 100) ? "pass" : "fail",
      value: `${hitRate}%`,
      detail: `Required hit rate is ${roundMoney(config.minHitRatePct)}%.`,
    },
    {
      id: "drawdown",
      label: "Drawdown",
      status: drawdown <= Number(config.maxDrawdownUsd ?? 1_000) ? "pass" : "fail",
      value: formatCurrency(-drawdown),
      detail: `Maximum allowed cumulative drawdown is ${formatCurrency(-Number(config.maxDrawdownUsd ?? 1_000))}.`,
    },
    {
      id: "deployed-alpha",
      label: "Deployed alpha",
      status: deployedAlpha >= Number(config.minDeployedAlphaUsd ?? 0) ? "pass" : "fail",
      value: formatCurrency(deployedAlpha),
      detail: "Same-notional hot-coin alpha must be positive before any stronger paper autonomy claim.",
    },
    {
      id: "full-wallet-alpha",
      label: "Hot-coin alpha",
      status: fullWalletHotAlpha >= 0 ? "pass" : "watch",
      value: formatCurrency(fullWalletHotAlpha),
      detail: "Negative full-wallet hot-coin alpha keeps sizing selective even when deployed alpha passes.",
    },
    {
      id: "consistency",
      label: "Consistency",
      status: consistency >= Number(config.minConsistencyScore ?? 80) ? "pass" : "fail",
      value: `${consistency}/100`,
      detail: `Required consistency is ${roundMoney(config.minConsistencyScore)}/100.`,
    },
    {
      id: "movement",
      label: "Paper movement",
      status: moved ? "pass" : "fail",
      value: `${Number(repeatProof?.trade_count_delta ?? 0)} trades`,
      detail: `${Number(repeatProof?.advanced_ticks ?? 0)} advanced tick${Number(repeatProof?.advanced_ticks ?? 0) === 1 ? "" : "s"} across repeat proof.`,
    },
  ];
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeLeaseText(value, fallback, maxLength) {
  const normalized = String(value || fallback).trim().replace(/[^a-zA-Z0-9_.:-]/g, "-").replace(/-+/g, "-").slice(0, maxLength);
  return normalized || fallback.slice(0, maxLength);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function booleanFlag(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function roundMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function formatCurrency(value) {
  const safe = roundMoney(value);
  return `${safe >= 0 ? "+" : "-"}$${Math.abs(safe).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function uniqueText(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

async function main() {
  const config = parsePaperPromotionGuardArgs(process.argv.slice(2), process.env);
  try {
    const report = await runWeb3PaperPromotionGuard(config);
    if (config.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`${report.status}: ${report.summary}`);
    console.log(`Permission: ${report.promotion_permission}; size: ${report.recommended_paper_size_multiplier}x; rounds: ${report.recommended_supervisor_rounds}.`);
  } catch (error) {
    if (config.json && error?.report) console.error(JSON.stringify(error.report, null, 2));
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = error?.report?.exit_code ?? 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

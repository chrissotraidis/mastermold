import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { buildWeb3ProfitProofReadiness } from "@/src/db/web3-profit-proof";
import { getWeb3PromotedPaperAutopilotHealth, writeWeb3PromotedPaperAutopilotReceipt } from "@/src/db/web3-promoted-paper-autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

type PromotedPaperAutopilotRequest = {
  scenario?: "base" | "breakout" | "rug-risk";
  source?: "sample" | "live-dex";
  promotion_scenario?: "base" | "breakout" | "rug-risk" | "all";
  promotion_runs?: number;
  promotion_ticks?: number;
  max_supervisor_rounds?: number;
  max_ticks_per_round?: number;
};

const SCENARIOS = ["base", "breakout", "rug-risk"] as const;
const PROMOTION_SCENARIOS = ["base", "breakout", "rug-risk", "all"] as const;
const SOURCES = ["sample", "live-dex"] as const;

export async function POST(request: Request): Promise<NextResponse<unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 422 });
  }

  const parsed = parseAutopilotRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const origin = new URL(request.url).origin;
  const scriptPath = join(process.cwd(), "scripts", "web3-promoted-paper-autopilot.mjs");
  const runMemory = getWeb3PromotedPaperAutopilotHealth();
  const proofPlan = buildWeb3ProfitProofReadiness({ promotedHealth: runMemory }).proof_plan;
  const plannedPromotionRuns = resolvePlannedPromotionRuns(parsed.value.promotion_runs, proofPlan.suggested_next_runs, proofPlan.remaining_promoted_runs);
  if (plannedPromotionRuns <= 0) {
    return NextResponse.json({
      error: "Promoted paper proof plan is already complete.",
      proof_plan_status: proofPlan.status,
      proof_plan_remaining_runs: proofPlan.remaining_promoted_runs,
      proof_plan_promotion_runs: proofPlan.suggested_next_runs,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    }, { status: 409 });
  }
  const supervisedRoundCap = Math.max(0, Math.min(parsed.value.max_supervisor_rounds, runMemory.recommended_supervisor_round_cap));
  const args = [
    scriptPath,
    `--base-url=${origin}`,
    `--scenario=${parsed.value.scenario}`,
    `--promotion-scenario=${parsed.value.promotion_scenario}`,
    `--source=${parsed.value.source}`,
    "--runner-id=browser-promoted-paper-autopilot",
    `--promotion-runs=${plannedPromotionRuns}`,
    `--promotion-ticks=${parsed.value.promotion_ticks}`,
    `--max-supervisor-rounds=${supervisedRoundCap}`,
    `--max-ticks-per-round=${parsed.value.max_ticks_per_round}`,
    "--interval-ms=0",
    "--round-delay-ms=0",
    "--json",
  ];

  try {
    const { stdout } = await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        WEB3_AUTOPILOT_FAIL_ON_BLOCKED: "false",
      },
    });
    const report = JSON.parse(stdout) as Record<string, unknown>;
    writeWeb3PromotedPaperAutopilotReceipt(report);
    return NextResponse.json({
      ...report,
      api_boundary: "local-paper-process",
      requested_promotion_runs: parsed.value.promotion_runs ?? null,
      proof_plan_promotion_runs: proofPlan.suggested_next_runs,
      proof_plan_remaining_runs: proofPlan.remaining_promoted_runs,
      applied_promotion_runs: plannedPromotionRuns,
      requested_supervisor_rounds: parsed.value.max_supervisor_rounds,
      memory_supervisor_round_cap: runMemory.recommended_supervisor_round_cap,
      memory_applied_supervisor_rounds: supervisedRoundCap,
      run_memory_status: runMemory.run_memory_status,
      run_memory_score: runMemory.run_memory_score,
      run_memory_next_action: runMemory.memory_next_action,
      promotion_repair_items: Array.isArray((report.promotion as { items?: unknown } | undefined)?.items)
        ? (report.promotion as { items: unknown[] }).items
        : [],
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promoted paper autopilot could not run.";
    return NextResponse.json({
      error: "Promoted paper autopilot could not run.",
      detail: message.slice(0, 500),
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    }, { status: 500 });
  }
}

function parseAutopilotRequest(value: unknown):
  | { ok: true; value: Required<Omit<PromotedPaperAutopilotRequest, "promotion_runs">> & { promotion_runs: number | null } }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Request must be an object." };
  }

  const record = value as PromotedPaperAutopilotRequest;
  const scenario = record.scenario ?? "breakout";
  const source = record.source ?? "sample";
  const promotionScenario = record.promotion_scenario ?? "all";
  if (!SCENARIOS.includes(scenario)) {
    return { ok: false, error: "scenario must be base, breakout, or rug-risk." };
  }
  if (!SOURCES.includes(source)) {
    return { ok: false, error: "source must be sample or live-dex." };
  }
  if (!PROMOTION_SCENARIOS.includes(promotionScenario)) {
    return { ok: false, error: "promotion_scenario must be base, breakout, rug-risk, or all." };
  }

  const promotionRuns = record.promotion_runs === undefined ? null : boundedInteger(record.promotion_runs, 2, 0, 6);
  const promotionTicks = boundedInteger(record.promotion_ticks, 2, 1, 8);
  const maxSupervisorRounds = boundedInteger(record.max_supervisor_rounds, 2, 0, 6);
  const maxTicksPerRound = boundedInteger(record.max_ticks_per_round, 2, 1, 4);

  return {
    ok: true,
    value: {
      scenario,
      source,
      promotion_scenario: promotionScenario,
      promotion_runs: promotionRuns,
      promotion_ticks: promotionTicks,
      max_supervisor_rounds: maxSupervisorRounds,
      max_ticks_per_round: maxTicksPerRound,
    },
  };
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function resolvePlannedPromotionRuns(requestedRuns: number | null, suggestedRuns: number, remainingRuns: number) {
  const planCap = Math.max(0, Math.min(6, remainingRuns > 0 ? Math.max(1, suggestedRuns) : suggestedRuns));
  const requested = requestedRuns === null ? planCap : Math.max(0, Math.min(6, requestedRuns));
  if (planCap <= 0) return 0;
  return Math.max(1, Math.min(requested, planCap));
}

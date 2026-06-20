import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import {
  getWeb3DaemonSupervisorHealth,
  type Web3DaemonSupervisorHealth,
  type Web3DaemonSupervisorReceipt,
} from "@/src/db/web3-daemon-supervisor";
import {
  buildWeb3ProductionSupervisorReadiness,
  type Web3ProductionSupervisorReadiness,
} from "@/src/db/web3-production-supervisor";
import { isTradingScenario, type TradingScenario } from "@/src/db/web3-trading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

type Web3SupervisorRefreshRequest = {
  operator_ack?: boolean;
  scenario?: TradingScenario;
  preview_only?: boolean;
};

type Web3SupervisorRefreshReceipt = {
  mode: "web3-supervisor-refresh";
  status: "preview" | "refreshed";
  summary: string;
  applied_scenario: TradingScenario;
  applied_source: "sample";
  applied_rounds: 1;
  applied_ticks_per_round: 1;
  applied_target_net_pnl_usd: 1;
  applied_max_drawdown_usd: 250;
  api_boundary: "local-paper-process";
  supervisor_receipt: Web3DaemonSupervisorReceipt | null;
  supervisor_health: Web3DaemonSupervisorHealth;
  production_supervisor: Web3ProductionSupervisorReadiness;
  external_dispatch_permission: "blocked";
  live_execution_permission: "blocked";
  transaction_submission_permission: "blocked";
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export async function POST(request: Request): Promise<NextResponse<Web3SupervisorRefreshReceipt | { error: string; detail?: string }>> {
  const body = (await request.json().catch(() => null)) as Web3SupervisorRefreshRequest | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a supervisor refresh object." }, { status: 422 });
  }
  if (body.operator_ack !== true) {
    return NextResponse.json({ error: "operator_ack must be true before refreshing the paper supervisor receipt." }, { status: 422 });
  }

  const scenario = body.scenario ?? "breakout";
  if (!isTradingScenario(scenario)) {
    return NextResponse.json({ error: "scenario must be base, breakout, or rug-risk." }, { status: 422 });
  }

  if (body.preview_only === true) {
    return NextResponse.json(buildSupervisorRefreshResponse({
      scenario,
      status: "preview",
      supervisorReceipt: null,
      summary: "Supervisor refresh preview is ready; the actual action runs one bounded paper-only supervisor round.",
    }));
  }

  const scriptPath = join(process.cwd(), "scripts", "web3-daemon-supervisor.mjs");
  const origin = new URL(request.url).origin;
  const args = [
    scriptPath,
    `--base-url=${origin}`,
    `--scenario=${scenario}`,
    "--source=sample",
    "--runner-id=browser-supervisor-refresh",
    "--rounds=1",
    "--ticks-per-round=1",
    "--interval-ms=0",
    "--round-delay-ms=0",
    "--target-net-pnl=1",
    "--max-drawdown=250",
    "--heartbeat-when-gated=true",
    "--json",
  ];

  try {
    const { stdout } = await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      timeout: 45_000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION: "",
        MASTERMOLD_LIVE_OPERATOR_APPROVAL: "",
      },
    });
    const supervisorReceipt = JSON.parse(stdout) as Web3DaemonSupervisorReceipt;
    const supervisorHealth = getWeb3DaemonSupervisorHealth();
    const productionSupervisor = buildWeb3ProductionSupervisorReadiness(supervisorHealth);
    return NextResponse.json({
      ...buildSupervisorRefreshResponse({
        scenario,
        status: "refreshed",
        supervisorReceipt,
        supervisorHealth,
        productionSupervisor,
        summary: productionSupervisor.summary,
      }),
      supervisor_receipt: supervisorReceipt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supervisor refresh could not run.";
    return NextResponse.json({
      error: "Supervisor refresh could not run.",
      detail: message.slice(0, 500),
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    }, { status: 500 });
  }
}

function buildSupervisorRefreshResponse({
  scenario,
  status,
  supervisorReceipt,
  supervisorHealth = getWeb3DaemonSupervisorHealth(),
  productionSupervisor = buildWeb3ProductionSupervisorReadiness(supervisorHealth),
  summary,
}: {
  scenario: TradingScenario;
  status: "preview" | "refreshed";
  supervisorReceipt: Web3DaemonSupervisorReceipt | null;
  supervisorHealth?: Web3DaemonSupervisorHealth;
  productionSupervisor?: Web3ProductionSupervisorReadiness;
  summary: string;
}): Web3SupervisorRefreshReceipt {
  return {
    mode: "web3-supervisor-refresh",
    status,
    summary,
    applied_scenario: scenario,
    applied_source: "sample",
    applied_rounds: 1,
    applied_ticks_per_round: 1,
    applied_target_net_pnl_usd: 1,
    applied_max_drawdown_usd: 250,
    api_boundary: "local-paper-process",
    supervisor_receipt: supervisorReceipt,
    supervisor_health: supervisorHealth,
    production_supervisor: productionSupervisor,
    external_dispatch_permission: "blocked",
    live_execution_permission: "blocked",
    transaction_submission_permission: "blocked",
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    controls: [
      "Runs one bounded sample-source paper supervisor round from the local app process.",
      "Refreshes sanitized supervisor freshness evidence only; it does not install or start a production worker.",
      "Forces live-execution flags off for the child process and never signs, submits, dispatches webhooks, or mutates wallets.",
      "Returns only redacted health/readiness receipts plus configured/missing boundaries.",
    ],
  };
}

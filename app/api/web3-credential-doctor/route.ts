import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import {
  getWeb3CredentialDoctorHealth,
  type Web3CredentialDoctorHealth,
} from "@/src/db/web3-credential-doctor";
import { isLocalCredentialInstallAllowed } from "@/src/db/web3-local-credential-install";
import {
  isTradingAccountMode,
  isTradingMarketSource,
  isTradingScenario,
  type TradingAccountMode,
  type TradingMarketSource,
  type TradingScenario,
} from "@/src/db/web3-trading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const ALLOWED_FIELDS = new Set([
  "operator_ack",
  "preview_only",
  "refresh_supervisor",
  "scenario",
  "source",
  "account",
]);
const REJECTED_FIELD_PATTERN = /(private|secret|seed|mnemonic|phrase|keypair|transaction|signature|signed|payload)/i;

type Web3CredentialDoctorRefreshRequest = {
  operator_ack?: boolean;
  preview_only?: boolean;
  refresh_supervisor?: boolean;
  scenario?: TradingScenario;
  source?: TradingMarketSource;
  account?: TradingAccountMode;
};

type Web3CredentialDoctorRefreshReceipt = {
  mode: "web3-credential-doctor-refresh";
  status: "preview" | "refreshed" | "blocked";
  refreshed: boolean;
  refresh_supervisor_requested: boolean;
  scenario: TradingScenario;
  source: TradingMarketSource;
  account: TradingAccountMode;
  doctor: Web3CredentialDoctorHealth;
  api_boundary: "local-sanitized-doctor";
  local_refresh_allowed: boolean;
  summary: string;
  next_action: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
  controls: string[];
};

export async function GET(request: Request): Promise<NextResponse<Web3CredentialDoctorRefreshReceipt>> {
  const receipt = buildDoctorRefreshReceipt({
    request,
    status: isLocalCredentialInstallAllowed(request) ? "preview" : "blocked",
    refreshed: false,
    refreshSupervisor: false,
    scenario: "breakout",
    source: "live-dex",
    account: "persistent",
    summary: isLocalCredentialInstallAllowed(request)
      ? "Credential doctor refresh is ready to run locally; POST with operator_ack=true to refresh the sanitized receipt."
      : "Credential doctor refresh is blocked outside trusted localhost scope.",
  });
  return NextResponse.json(receipt, { status: receipt.status === "blocked" ? 403 : 200 });
}

export async function POST(request: Request): Promise<NextResponse<Web3CredentialDoctorRefreshReceipt | { error: string; detail?: string }>> {
  const allowed = isLocalCredentialInstallAllowed(request);
  if (!allowed) {
    return NextResponse.json(buildDoctorRefreshReceipt({
      request,
      status: "blocked",
      refreshed: false,
      refreshSupervisor: false,
      scenario: "breakout",
      source: "live-dex",
      account: "persistent",
      summary: "Credential doctor refresh is blocked outside trusted localhost scope.",
    }), { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Web3CredentialDoctorRefreshRequest | null;
  const parsed = parseDoctorRefreshRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({
      error: parsed.error,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    }, { status: 422 });
  }

  if (parsed.value.preview_only === true) {
    return NextResponse.json(buildDoctorRefreshReceipt({
      request,
      status: "preview",
      refreshed: false,
      refreshSupervisor: parsed.value.refresh_supervisor === true,
      scenario: parsed.value.scenario,
      source: parsed.value.source,
      account: parsed.value.account,
      summary: "Credential doctor refresh preview is ready; no local receipt was rewritten.",
    }));
  }

  const origin = new URL(request.url).origin;
  const scriptPath = join(process.cwd(), "scripts", "web3-credential-doctor.mjs");
  const args = [
    scriptPath,
    `--base-url=${origin}`,
    `--scenario=${parsed.value.scenario}`,
    `--source=${parsed.value.source}`,
    `--account=${parsed.value.account}`,
    "--json",
  ];
  if (parsed.value.refresh_supervisor === true) args.push("--refresh-supervisor=true");

  try {
    await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      timeout: parsed.value.refresh_supervisor === true ? 70_000 : 45_000,
      maxBuffer: 3 * 1024 * 1024,
      env: {
        ...process.env,
        MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION: "",
        MASTERMOLD_LIVE_OPERATOR_APPROVAL: "",
      },
    });
    const doctor = getWeb3CredentialDoctorHealth();
    return NextResponse.json(buildDoctorRefreshReceipt({
      request,
      status: "refreshed",
      refreshed: true,
      refreshSupervisor: parsed.value.refresh_supervisor === true,
      scenario: parsed.value.scenario,
      source: parsed.value.source,
      account: parsed.value.account,
      summary: doctor.summary,
    }));
  } catch (error) {
    return NextResponse.json({
      error: "Credential doctor refresh could not run.",
      detail: redactSensitiveText(error instanceof Error ? error.message : String(error)).slice(0, 500),
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    }, { status: 500 });
  }
}

function parseDoctorRefreshRequest(input: Web3CredentialDoctorRefreshRequest | null):
  | { ok: true; value: Required<Web3CredentialDoctorRefreshRequest> }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Request body must be a credential doctor refresh object." };
  }
  const keys = Object.keys(input);
  const rejectedKey = keys.find((key) => !ALLOWED_FIELDS.has(key) || REJECTED_FIELD_PATTERN.test(key));
  if (rejectedKey) return { ok: false, error: "Credential doctor refresh accepts only safe status fields." };
  if (JSON.stringify(input).match(REJECTED_FIELD_PATTERN)) {
    return { ok: false, error: "Credential doctor refresh rejected secret-looking input." };
  }
  if (input.operator_ack !== true) {
    return { ok: false, error: "operator_ack must be true before refreshing the credential doctor receipt." };
  }
  const scenario = input.scenario ?? "breakout";
  if (!isTradingScenario(scenario)) return { ok: false, error: "scenario must be base, breakout, or rug-risk." };
  const source = input.source ?? "live-dex";
  if (!isTradingMarketSource(source)) return { ok: false, error: "source must be sample or live-dex." };
  const account = input.account ?? "persistent";
  if (!isTradingAccountMode(account)) return { ok: false, error: "account must be ephemeral or persistent." };
  return {
    ok: true,
    value: {
      operator_ack: true,
      preview_only: input.preview_only === true,
      refresh_supervisor: input.refresh_supervisor === true,
      scenario,
      source,
      account,
    },
  };
}

function buildDoctorRefreshReceipt({
  request,
  status,
  refreshed,
  refreshSupervisor,
  scenario,
  source,
  account,
  summary,
}: {
  request: Request;
  status: Web3CredentialDoctorRefreshReceipt["status"];
  refreshed: boolean;
  refreshSupervisor: boolean;
  scenario: TradingScenario;
  source: TradingMarketSource;
  account: TradingAccountMode;
  summary: string;
}): Web3CredentialDoctorRefreshReceipt {
  const doctor = getWeb3CredentialDoctorHealth();
  return {
    mode: "web3-credential-doctor-refresh",
    status,
    refreshed,
    refresh_supervisor_requested: refreshSupervisor,
    scenario,
    source,
    account,
    doctor,
    api_boundary: "local-sanitized-doctor",
    local_refresh_allowed: isLocalCredentialInstallAllowed(request),
    summary,
    next_action: refreshed
      ? doctor.next_action
      : "POST with operator_ack=true from localhost to rewrite the sanitized credential doctor receipt.",
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    transaction_submission_permission: "blocked",
    private_key_storage: "blocked",
    seed_phrase_storage: "blocked",
    secret_echo_permission: "blocked",
    controls: [
      "Credential doctor refresh is available only from trusted localhost or explicit local operator opt-in.",
      "The refresh reads local sanitized app receipts and writes configured/missing status only.",
      "Request bodies may include only operator acknowledgement, scenario, source, account, preview, and optional paper-supervisor refresh flags.",
      "Private keys, seed phrases, raw transactions, signed payloads, provider secret values, signing, submission, live execution, and wallet mutation remain blocked.",
    ],
  };
}

function redactSensitiveText(value: string) {
  return value
    .replace(/([?&](?:api[-_]?key|token|secret|signature)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<redacted-secret>")
    .replace(/\b(?:sk|pk|jup|helius)_[A-Za-z0-9_-]{16,}\b/g, "<redacted-secret>");
}

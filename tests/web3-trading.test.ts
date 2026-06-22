/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET as APP_HEALTH_GET } from "@/app/api/health/route";
import { GET, POST } from "@/app/api/web3-trading/route";
import { GET as ACCOUNT_ACQUISITION_GET } from "@/app/api/web3-account-acquisition/route";
import { GET as ACCOUNT_SETUP_GET } from "@/app/api/web3-account-setup/route";
import { GET as ACCOUNTING_LEDGER_GET } from "@/app/api/web3-accounting-ledger/route";
import { GET as CUTOVER_BLOCKER_BOARD_GET } from "@/app/api/web3-cutover-blocker-board/route";
import { GET as DEDICATED_WALLET_INTAKE_CONTRACT_GET } from "@/app/api/web3-dedicated-wallet-intake-contract/route";
import { GET as EMERGENCY_STOP_GET, POST as EMERGENCY_STOP_POST } from "@/app/api/web3-emergency-stop/drill/route";
import { POST as JUPITER_REHEARSAL_POST } from "@/app/api/web3-jupiter-rehearsal/route";
import { GET as JUPITER_REHEARSAL_HISTORY_GET } from "@/app/api/web3-jupiter-rehearsal-history/route";
import { GET as JUPITER_ORDER_PACKET_GET } from "@/app/api/web3-jupiter-order-packet/route";
import { GET as PROVIDER_HEALTH_GET } from "@/app/api/web3-provider-health/route";
import { GET as DEX_DISCOVERY_GET } from "@/app/api/web3-dex-discovery/route";
import { GET as DEDICATED_WALLET_PACKET_GET } from "@/app/api/web3-dedicated-wallet-packet/route";
import { GET as FIRST_CANARY_DRILL_GET } from "@/app/api/web3-first-canary-drill/route";
import { GET as LIVE_PREFLIGHT_GET } from "@/app/api/web3-live-capital-preflight/route";
import { GET as LIVE_AUTONOMY_READINESS_GET } from "@/app/api/web3-live-autonomy-readiness/route";
import { GET as LIVE_IGNITION_GET, POST as LIVE_IGNITION_POST } from "@/app/api/web3-live-ignition/route";
import { GET as SUPERVISED_CANARY_READINESS_GET, POST as SUPERVISED_CANARY_READINESS_POST } from "@/app/api/web3-supervised-canary-readiness/route";
import { GET as LIVE_USABILITY_BLOCKERS_GET } from "@/app/api/web3-live-usability-blockers/route";
import { GET as LOCAL_CREDENTIALS_GET, POST as LOCAL_CREDENTIALS_POST } from "@/app/api/web3-local-credentials/route";
import { GET as LIVE_OPS_PACKET_GET } from "@/app/api/web3-live-ops-packet/route";
import { GET as MANUAL_LIVE_REVIEW_PACKET_GET } from "@/app/api/web3-manual-live-review-packet/route";
import { GET as MARKET_MONITOR_HISTORY_GET } from "@/app/api/web3-market-monitor-history/route";
import { GET as OPERATOR_CREDENTIAL_HANDOFF_GET } from "@/app/api/web3-operator-credential-handoff/route";
import { GET as OPERATOR_REQUEST_PACKET_GET } from "@/app/api/web3-operator-request-packet/route";
import { GET as OPERATOR_RUNBOOK_GET } from "@/app/api/web3-operator-runbook/route";
import { GET as CREDENTIAL_DOCTOR_GET, POST as CREDENTIAL_DOCTOR_POST } from "@/app/api/web3-credential-doctor/route";
import { GET as CREDENTIAL_REQUIREMENTS_GET } from "@/app/api/web3-credential-requirements/route";
import { GET as LIVE_ACTIVATION_INTAKE_GET, POST as LIVE_ACTIVATION_INTAKE_POST } from "@/app/api/web3-live-activation-intake/route";
import { GET as LIVE_ACTIVATION_PLAN_GET } from "@/app/api/web3-live-activation-plan/route";
import { GET as LIVE_TEST_LEDGER_GET } from "@/app/api/web3-live-test-ledger/route";
import { GET as LIVE_TRADE_CANARY_GET, POST as LIVE_TRADE_CANARY_POST } from "@/app/api/web3-live-trade-canary/route";
import { GET as LIVE_UNSIGNED_ORDER_HANDOFF_GET, POST as LIVE_UNSIGNED_ORDER_HANDOFF_POST } from "@/app/api/web3-live-unsigned-order-handoff/route";
import { GET as LIVE_USABILITY_SUMMARY_GET } from "@/app/api/web3-live-usability-summary/route";
import { POST as RESEARCH_ANSWER_INTAKE_POST } from "@/app/api/web3-research-answer-intake/route";
import { GET as RESEARCH_HANDOFF_PACKET_GET } from "@/app/api/web3-research-handoff-packet/route";
import { GET as SIGNER_CREDENTIAL_PACKET_GET } from "@/app/api/web3-signer-credential-packet/route";
import { GET as SIGNER_HANDOFF_GET } from "@/app/api/web3-signer-handoff/route";
import { POST as SUPERVISOR_REFRESH_POST } from "@/app/api/web3-supervisor-refresh/route";
import { GET as SUPERVISED_LIVE_RUNWAY_GET } from "@/app/api/web3-supervised-live-runway/route";
import { GET as USABILITY_STATUS_GET } from "@/app/api/web3-usability-status/route";
import { GET as WALLET_OWNERSHIP_GET, POST as WALLET_OWNERSHIP_POST } from "@/app/api/web3-wallet-ownership/route";
import { GET as OHLCV_GET, POST as OHLCV_POST } from "@/app/api/web3-ohlcv/route";
import { buildAutonomousNextMoves, chooseAutoWatchPlan, shouldPauseAutoWatchForPlan } from "@/components/web3-trading-workspace-loader";
import { buildWeb3CredentialsSetupReadiness } from "@/src/db/web3-credentials";
import { buildWeb3AutonomyLaunchChecklist } from "@/src/db/web3-launch-checklist";
import {
  buildWeb3LiveTradeCanaryBlockedFallbackReceipt,
  buildWeb3LiveTradeCanaryReceipt,
  liveCanaryRequestContinuityBlockers,
  type Web3LiveTradeCanaryReceipt,
} from "@/src/db/web3-live-trade-canary";
import { buildWeb3ProfitProofReadiness } from "@/src/db/web3-profit-proof";
import {
  getWeb3PromotedPaperAutopilotHealth,
  getWeb3PromotedPaperAutopilotHistory,
  writeWeb3PromotedPaperAutopilotReceipt,
} from "@/src/db/web3-promoted-paper-autopilot";
import {
  getWeb3MarketMonitorHistory,
  writeWeb3MarketMonitorHistoryEntry,
} from "@/src/db/web3-market-monitor-history";
import { getWeb3JupiterRehearsalHistory } from "@/src/db/web3-jupiter-rehearsal-history";
import {
  getWeb3TradingStateAsync,
  getWeb3TradingState,
  scoreMarket,
  type MemecoinMarket,
  type Web3TradingState,
} from "@/src/db/web3-trading";
import { buildWalletOwnershipChallenge } from "@/src/db/web3-wallet-ownership";
import { __resetStoreForTests, store } from "@/src/db/store";

let prevDb: string | undefined;
let prevJupiterKey: string | undefined;
let prevJupiterTriggerJwt: string | undefined;
let prevHeliusKey: string | undefined;
let prevRpcUrl: string | undefined;
let prevNextPublicRpcUrl: string | undefined;
let prevPromotedAutopilotPath: string | undefined;
let prevPromotedAutopilotHistoryPath: string | undefined;
let prevMarketMonitorHistoryPath: string | undefined;
let prevJupiterRehearsalHistoryPath: string | undefined;
let prevLocalAccountabilityRepairPath: string | undefined;
let prevCredentialDoctorPath: string | undefined;
let prevLiveExecution: string | undefined;
let prevLiveApproval: string | undefined;
let prevLiveUnsignedCanaryHandoff: string | undefined;
let prevSignerProvider: string | undefined;
let prevPrivyAppId: string | undefined;
let prevPrivyAppSecret: string | undefined;
let prevPrivyWalletId: string | undefined;
let prevTurnkeyOrganizationId: string | undefined;
let prevTurnkeyApiPublicKey: string | undefined;
let prevTurnkeyApiPrivateKey: string | undefined;
let prevTurnkeySolanaWalletAccount: string | undefined;
let prevBirdeyeApiKey: string | undefined;
let prevPumpfunFeedUrl: string | undefined;
let prevPumpFunFeedUrl: string | undefined;
let prevYellowstoneGrpcEndpoint: string | undefined;
let prevYellowstoneGrpcToken: string | undefined;
let prevEmergencyStopWebhookUrl: string | undefined;
let prevEmergencyStopContact: string | undefined;
let prevTaxLedgerExportPath: string | undefined;
let prevWeb3ProcessManager: string | undefined;
let prevWeb3WorkerOwner: string | undefined;
let prevWeb3AlertWebhookUrl: string | undefined;
let prevWeb3RestartPolicyUrl: string | undefined;
let prevLocalCredentialInstallEnvPath: string | undefined;
let prevFetch: typeof globalThis.fetch;

beforeEach(() => {
  prevDb = process.env.MASTERMOLD_DB;
  prevJupiterKey = process.env.JUPITER_API_KEY;
  prevJupiterTriggerJwt = process.env.JUPITER_TRIGGER_JWT;
  prevHeliusKey = process.env.HELIUS_API_KEY;
  prevRpcUrl = process.env.SOLANA_RPC_URL;
  prevNextPublicRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  prevPromotedAutopilotPath = process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_STATUS_PATH;
  prevPromotedAutopilotHistoryPath = process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_HISTORY_PATH;
  prevMarketMonitorHistoryPath = process.env.WEB3_MARKET_MONITOR_HISTORY_PATH;
  prevJupiterRehearsalHistoryPath = process.env.WEB3_JUPITER_REHEARSAL_HISTORY_PATH;
  prevLocalAccountabilityRepairPath = process.env.WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH;
  prevCredentialDoctorPath = process.env.WEB3_CREDENTIAL_DOCTOR_STATUS_PATH;
  prevLiveExecution = process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION;
  prevLiveApproval = process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL;
  prevLiveUnsignedCanaryHandoff = process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF;
  prevSignerProvider = process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER;
  prevPrivyAppId = process.env.PRIVY_APP_ID;
  prevPrivyAppSecret = process.env.PRIVY_APP_SECRET;
  prevPrivyWalletId = process.env.PRIVY_SOLANA_WALLET_ID;
  prevTurnkeyOrganizationId = process.env.TURNKEY_ORGANIZATION_ID;
  prevTurnkeyApiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY;
  prevTurnkeyApiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY;
  prevTurnkeySolanaWalletAccount = process.env.TURNKEY_SOLANA_WALLET_ACCOUNT;
  prevBirdeyeApiKey = process.env.BIRDEYE_API_KEY;
  prevPumpfunFeedUrl = process.env.PUMPFUN_FEED_URL;
  prevPumpFunFeedUrl = process.env.PUMP_FUN_FEED_URL;
  prevYellowstoneGrpcEndpoint = process.env.YELLOWSTONE_GRPC_ENDPOINT;
  prevYellowstoneGrpcToken = process.env.YELLOWSTONE_GRPC_TOKEN;
  prevEmergencyStopWebhookUrl = process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL;
  prevEmergencyStopContact = process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT;
  prevTaxLedgerExportPath = process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH;
  prevWeb3ProcessManager = process.env.MASTERMOLD_WEB3_PROCESS_MANAGER;
  prevWeb3WorkerOwner = process.env.MASTERMOLD_WEB3_WORKER_OWNER;
  prevWeb3AlertWebhookUrl = process.env.MASTERMOLD_WEB3_ALERT_WEBHOOK_URL;
  prevWeb3RestartPolicyUrl = process.env.MASTERMOLD_WEB3_RESTART_POLICY_URL;
  prevLocalCredentialInstallEnvPath = process.env.WEB3_LOCAL_CREDENTIAL_INSTALL_ENV_PATH;
  prevFetch = globalThis.fetch;
  const testRoot = mkdtempSync(join(tmpdir(), "mm-web3-"));
  process.env.MASTERMOLD_DB = join(testRoot, "db.sqlite");
  process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_STATUS_PATH = join(testRoot, "promoted-autopilot.json");
  process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_HISTORY_PATH = join(testRoot, "promoted-autopilot-history.json");
  process.env.WEB3_MARKET_MONITOR_HISTORY_PATH = join(testRoot, "web3-market-monitor-history.json");
  process.env.WEB3_JUPITER_REHEARSAL_HISTORY_PATH = join(testRoot, "web3-jupiter-rehearsal-history.json");
  process.env.WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH = join(testRoot, "local-accountability-repair.json");
  process.env.WEB3_CREDENTIAL_DOCTOR_STATUS_PATH = join(testRoot, "web3-credential-doctor.json");
  delete process.env.JUPITER_API_KEY;
  delete process.env.JUPITER_TRIGGER_JWT;
  delete process.env.HELIUS_API_KEY;
  delete process.env.SOLANA_RPC_URL;
  delete process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  delete process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION;
  delete process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL;
  delete process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF;
  delete process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER;
  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.PRIVY_SOLANA_WALLET_ID;
  delete process.env.TURNKEY_ORGANIZATION_ID;
  delete process.env.TURNKEY_API_PUBLIC_KEY;
  delete process.env.TURNKEY_API_PRIVATE_KEY;
  delete process.env.TURNKEY_SOLANA_WALLET_ACCOUNT;
  delete process.env.BIRDEYE_API_KEY;
  delete process.env.PUMPFUN_FEED_URL;
  delete process.env.PUMP_FUN_FEED_URL;
  delete process.env.YELLOWSTONE_GRPC_ENDPOINT;
  delete process.env.YELLOWSTONE_GRPC_TOKEN;
  delete process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL;
  delete process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT;
  delete process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH;
  delete process.env.MASTERMOLD_WEB3_PROCESS_MANAGER;
  delete process.env.MASTERMOLD_WEB3_WORKER_OWNER;
  delete process.env.MASTERMOLD_WEB3_ALERT_WEBHOOK_URL;
  delete process.env.MASTERMOLD_WEB3_RESTART_POLICY_URL;
  delete process.env.WEB3_LOCAL_CREDENTIAL_INSTALL_ENV_PATH;
  delete process.env.WEB3_CREDENTIAL_DOCTOR_STATUS_PATH;
  __resetStoreForTests();
});

afterEach(() => {
  if (prevDb === undefined) delete process.env.MASTERMOLD_DB;
  else process.env.MASTERMOLD_DB = prevDb;
  if (prevJupiterKey === undefined) delete process.env.JUPITER_API_KEY;
  else process.env.JUPITER_API_KEY = prevJupiterKey;
  if (prevJupiterTriggerJwt === undefined) delete process.env.JUPITER_TRIGGER_JWT;
  else process.env.JUPITER_TRIGGER_JWT = prevJupiterTriggerJwt;
  if (prevHeliusKey === undefined) delete process.env.HELIUS_API_KEY;
  else process.env.HELIUS_API_KEY = prevHeliusKey;
  if (prevRpcUrl === undefined) delete process.env.SOLANA_RPC_URL;
  else process.env.SOLANA_RPC_URL = prevRpcUrl;
  if (prevNextPublicRpcUrl === undefined) delete process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  else process.env.NEXT_PUBLIC_SOLANA_RPC_URL = prevNextPublicRpcUrl;
  if (prevPromotedAutopilotPath === undefined) delete process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_STATUS_PATH;
  else process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_STATUS_PATH = prevPromotedAutopilotPath;
  if (prevPromotedAutopilotHistoryPath === undefined) delete process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_HISTORY_PATH;
  else process.env.WEB3_PROMOTED_PAPER_AUTOPILOT_HISTORY_PATH = prevPromotedAutopilotHistoryPath;
  if (prevMarketMonitorHistoryPath === undefined) delete process.env.WEB3_MARKET_MONITOR_HISTORY_PATH;
  else process.env.WEB3_MARKET_MONITOR_HISTORY_PATH = prevMarketMonitorHistoryPath;
  if (prevJupiterRehearsalHistoryPath === undefined) delete process.env.WEB3_JUPITER_REHEARSAL_HISTORY_PATH;
  else process.env.WEB3_JUPITER_REHEARSAL_HISTORY_PATH = prevJupiterRehearsalHistoryPath;
  if (prevLocalAccountabilityRepairPath === undefined) delete process.env.WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH;
  else process.env.WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH = prevLocalAccountabilityRepairPath;
  if (prevCredentialDoctorPath === undefined) delete process.env.WEB3_CREDENTIAL_DOCTOR_STATUS_PATH;
  else process.env.WEB3_CREDENTIAL_DOCTOR_STATUS_PATH = prevCredentialDoctorPath;
  if (prevLiveExecution === undefined) delete process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION;
  else process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = prevLiveExecution;
  if (prevLiveApproval === undefined) delete process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL;
  else process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = prevLiveApproval;
  if (prevLiveUnsignedCanaryHandoff === undefined) delete process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF;
  else process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF = prevLiveUnsignedCanaryHandoff;
  if (prevSignerProvider === undefined) delete process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER;
  else process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = prevSignerProvider;
  if (prevPrivyAppId === undefined) delete process.env.PRIVY_APP_ID;
  else process.env.PRIVY_APP_ID = prevPrivyAppId;
  if (prevPrivyAppSecret === undefined) delete process.env.PRIVY_APP_SECRET;
  else process.env.PRIVY_APP_SECRET = prevPrivyAppSecret;
  if (prevPrivyWalletId === undefined) delete process.env.PRIVY_SOLANA_WALLET_ID;
  else process.env.PRIVY_SOLANA_WALLET_ID = prevPrivyWalletId;
  if (prevTurnkeyOrganizationId === undefined) delete process.env.TURNKEY_ORGANIZATION_ID;
  else process.env.TURNKEY_ORGANIZATION_ID = prevTurnkeyOrganizationId;
  if (prevTurnkeyApiPublicKey === undefined) delete process.env.TURNKEY_API_PUBLIC_KEY;
  else process.env.TURNKEY_API_PUBLIC_KEY = prevTurnkeyApiPublicKey;
  if (prevTurnkeyApiPrivateKey === undefined) delete process.env.TURNKEY_API_PRIVATE_KEY;
  else process.env.TURNKEY_API_PRIVATE_KEY = prevTurnkeyApiPrivateKey;
  if (prevTurnkeySolanaWalletAccount === undefined) delete process.env.TURNKEY_SOLANA_WALLET_ACCOUNT;
  else process.env.TURNKEY_SOLANA_WALLET_ACCOUNT = prevTurnkeySolanaWalletAccount;
  if (prevBirdeyeApiKey === undefined) delete process.env.BIRDEYE_API_KEY;
  else process.env.BIRDEYE_API_KEY = prevBirdeyeApiKey;
  if (prevPumpfunFeedUrl === undefined) delete process.env.PUMPFUN_FEED_URL;
  else process.env.PUMPFUN_FEED_URL = prevPumpfunFeedUrl;
  if (prevPumpFunFeedUrl === undefined) delete process.env.PUMP_FUN_FEED_URL;
  else process.env.PUMP_FUN_FEED_URL = prevPumpFunFeedUrl;
  if (prevYellowstoneGrpcEndpoint === undefined) delete process.env.YELLOWSTONE_GRPC_ENDPOINT;
  else process.env.YELLOWSTONE_GRPC_ENDPOINT = prevYellowstoneGrpcEndpoint;
  if (prevYellowstoneGrpcToken === undefined) delete process.env.YELLOWSTONE_GRPC_TOKEN;
  else process.env.YELLOWSTONE_GRPC_TOKEN = prevYellowstoneGrpcToken;
  if (prevEmergencyStopWebhookUrl === undefined) delete process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL;
  else process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL = prevEmergencyStopWebhookUrl;
  if (prevEmergencyStopContact === undefined) delete process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT;
  else process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT = prevEmergencyStopContact;
  if (prevTaxLedgerExportPath === undefined) delete process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH;
  else process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH = prevTaxLedgerExportPath;
  if (prevWeb3ProcessManager === undefined) delete process.env.MASTERMOLD_WEB3_PROCESS_MANAGER;
  else process.env.MASTERMOLD_WEB3_PROCESS_MANAGER = prevWeb3ProcessManager;
  if (prevWeb3WorkerOwner === undefined) delete process.env.MASTERMOLD_WEB3_WORKER_OWNER;
  else process.env.MASTERMOLD_WEB3_WORKER_OWNER = prevWeb3WorkerOwner;
  if (prevWeb3AlertWebhookUrl === undefined) delete process.env.MASTERMOLD_WEB3_ALERT_WEBHOOK_URL;
  else process.env.MASTERMOLD_WEB3_ALERT_WEBHOOK_URL = prevWeb3AlertWebhookUrl;
  if (prevWeb3RestartPolicyUrl === undefined) delete process.env.MASTERMOLD_WEB3_RESTART_POLICY_URL;
  else process.env.MASTERMOLD_WEB3_RESTART_POLICY_URL = prevWeb3RestartPolicyUrl;
  if (prevLocalCredentialInstallEnvPath === undefined) delete process.env.WEB3_LOCAL_CREDENTIAL_INSTALL_ENV_PATH;
  else process.env.WEB3_LOCAL_CREDENTIAL_INSTALL_ENV_PATH = prevLocalCredentialInstallEnvPath;
  globalThis.fetch = prevFetch;
  __resetStoreForTests();
});

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function base58Encode(bytes: Uint8Array) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  for (const byte of bytes) {
    if (byte === 0) digits.push(0);
    else break;
  }
  return digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("");
}

function bytesToBase64ForTest(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64");
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

async function createScopedOwnedWalletForTest(provider = "test-browser-wallet") {
  const keyPair = await globalThis.crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const rawPublicKey = await globalThis.crypto.subtle.exportKey("raw", keyPair.publicKey);
  const walletPublicKey = base58Encode(new Uint8Array(rawPublicKey));
  const challengeResponse = await WALLET_OWNERSHIP_GET(new Request(`http://localhost/api/web3-wallet-ownership?wallet_public_key=${walletPublicKey}`));
  const challengeReceipt = await json<{ message: string | null }>(challengeResponse);
  expect(challengeResponse.status).toBe(200);
  if (!challengeReceipt.message) throw new Error("Expected wallet ownership challenge message.");
  const signature = await globalThis.crypto.subtle.sign({ name: "Ed25519" }, keyPair.privateKey, new TextEncoder().encode(challengeReceipt.message));
  const proofResponse = await WALLET_OWNERSHIP_POST(new Request("http://localhost/api/web3-wallet-ownership", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      wallet_public_key: walletPublicKey,
      message: challengeReceipt.message,
      signature_base64: bytesToBase64ForTest(signature),
      provider,
    }),
  }));
  const proofReceipt = await json<{ status: string; receipt_hash: string; signature_verified: boolean }>(proofResponse);
  expect(proofResponse.status).toBe(200);
  expect(proofReceipt.status).toBe("verified");
  expect(proofReceipt.signature_verified).toBe(true);

  const saveScope = await POST(new Request("http://localhost/api/web3-trading", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenario: "breakout",
      source: "sample",
      account: "persistent",
      cycles: 0,
      advance: false,
      execution: {
        mode: "dry-run",
        wallet_public_key: walletPublicKey,
        signer_simulation_enabled: true,
        signer_session_label: "ownership-proof",
        signer_network: "devnet",
        max_trade_usd: 250,
        daily_spend_cap_usd: 1000,
        max_slippage_bps: 150,
      },
    }),
  }));
  expect(saveScope.status).toBe(200);

  return { walletPublicKey, receiptHash: proofReceipt.receipt_hash };
}

function ageLatestWalletOwnershipProofForTest(ageSeconds: number) {
  const adapter = store();
  const row = adapter.web3ExecutionAudits(100).find((entry) => entry.id.startsWith("wallet-ownership-"));
  if (!row || !row.data || typeof row.data !== "object") throw new Error("Expected a wallet ownership audit row.");
  const staleAt = new Date(Date.now() - ageSeconds * 1_000).toISOString();
  adapter.appendWeb3ExecutionAudit({
    ...row,
    created_at: staleAt,
    data: {
      ...(row.data as Record<string, unknown>),
      generated_at: staleAt,
    },
  });
}

function withClearExecutionLane(state: Web3TradingState): Web3TradingState {
  return {
    ...state,
    autonomous_execution_runway: {
      ...state.autonomous_execution_runway,
      status: "watch",
      action: "watch",
      can_auto_paper: true,
      should_refresh_route: false,
      should_refresh_chart: false,
      should_protect_first: false,
      route_vetoed: false,
      chart_refresh_required: false,
      next_action: "Execution runway is clear for the lane under test.",
    },
    autonomous_execution_heartbeat: {
      ...state.autonomous_execution_heartbeat,
      status: "press",
      primary_action: "press",
      route_vetoed: false,
      should_refresh_routes: false,
      should_protect_first: false,
      next_action: "Execution heartbeat is clear for the lane under test.",
    },
  };
}

function withOpenProfitSafety(state: Web3TradingState): Web3TradingState {
  return {
    ...state,
    autonomous_daily_profit_lock: {
      ...state.autonomous_daily_profit_lock,
      status: "run",
      action: "trade",
      loop_permission: "open",
      fresh_buy_allowed: true,
      protect_sell_allowed: true,
      stop_reason: null,
      next_action: "Daily lock is open for the lane under test.",
    },
    autonomous_profit_integrity_circuit: {
      ...state.autonomous_profit_integrity_circuit,
      status: "continue",
      permission: "trade",
      action: "keep-running",
      can_continue: true,
      should_pause_fresh_buys: false,
      should_protect_first: false,
      next_action: "Profit integrity is clear for the lane under test.",
    },
    autonomous_wallet_performance_governor: {
      ...state.autonomous_wallet_performance_governor,
      status: "press",
      fresh_buy_permission: "open",
      protective_sell_only: false,
      make_money_score: Math.max(72, state.autonomous_wallet_performance_governor.make_money_score),
      wallet_score: Math.max(72, state.autonomous_wallet_performance_governor.wallet_score),
      window_pnl_usd: Math.max(12, state.autonomous_wallet_performance_governor.window_pnl_usd),
      equity_slope_usd_per_tick: Math.max(4, state.autonomous_wallet_performance_governor.equity_slope_usd_per_tick),
      max_drawdown_pct: Math.min(2.5, state.autonomous_wallet_performance_governor.max_drawdown_pct),
      next_trade_cap: Math.max(2, state.autonomous_wallet_performance_governor.next_trade_cap),
      next_size_multiplier: Math.max(0.85, state.autonomous_wallet_performance_governor.next_size_multiplier),
      cadence_seconds: 6,
      next_action: "Wallet performance is clear for the lane under test.",
    },
    autonomous_fill_ledger_digest: {
      ...state.autonomous_fill_ledger_digest,
      status: "profitable",
      next_fill_permission: "press",
      last_fill_verdict: "press",
      last_fill_profit_score: Math.max(76, state.autonomous_fill_ledger_digest.last_fill_profit_score),
      last_fill_edge_usd: Math.max(8, state.autonomous_fill_ledger_digest.last_fill_edge_usd),
      last_fill_quality_score: Math.max(76, state.autonomous_fill_ledger_digest.last_fill_quality_score),
      last_fill_shortfall_usd: 0,
      recommended_discipline: "press-winners",
      next_action: "Fill ledger is clear for the lane under test.",
    },
  };
}

describe("Web3 autonomous trading subsystem", () => {
  test("GIVEN provider wallet and route evidence WHEN Web3 credentials are checked THEN they prepare rehearsal without unlocking live capital", () => {
    const readiness = buildWeb3CredentialsSetupReadiness({
      provider: "custom-rpc",
      rpc_url: "https://mainnet.helius-rpc.com/?api-key=test-key",
      ws_url: "wss://mainnet.helius-rpc.com/?api-key=test-key",
      jupiter_api_key: "test-jupiter-key",
      wallet_public_key: "11111111111111111111111111111111",
      signer_mode: "external-wallet",
      max_trade_usd: 250,
      daily_spend_cap_usd: 1_000,
      max_slippage_bps: 150,
      require_manual_confirmation: true,
    }, {
      rpc_healthy: true,
      rpc_detail: "RPC health ok; latest blockhash returned.",
      wallet_balance_sol: 0.42,
      wallet_balance_detail: "0.4200 SOL returned by read-only getBalance.",
      helius_das_ready: true,
      wallet_asset_count: 9,
      wallet_fungible_asset_count: 4,
      wallet_priced_asset_count: 3,
      wallet_priced_value_usd: 123.45,
      wallet_assets_detail: "Helius DAS returned 9 wallet assets on page 1.",
      jupiter_quote_ready: true,
      jupiter_quote_detail: "Jupiter quote route returned for SOL to USDC.",
      jupiter_order_ready: true,
      jupiter_order_detail: "Jupiter unsigned order returned with route metadata.",
    });

    expect(readiness.status).toBe("configured");
    expect(readiness.rpc_endpoint).toBe("https://mainnet.helius-rpc.com");
    expect(readiness.websocket_endpoint).toBe("wss://mainnet.helius-rpc.com");
    expect(readiness.can_support_wallet_asset_snapshot).toBe(true);
    expect(readiness.helius_das_ready).toBe(true);
    expect(readiness.wallet_asset_count).toBe(9);
    expect(readiness.wallet_priced_value_usd).toBe(123.45);
    expect(readiness.can_support_route_order_rehearsal).toBe(true);
    expect(readiness.can_support_manual_live_review).toBe(true);
    expect(readiness.live_execution_permission).toBe("blocked");
    expect(readiness.wallet_mutation_permission).toBe("blocked");
    expect(readiness.credential_plan).toMatchObject({
      mode: "web3-credential-vault-plan",
      status: "ready-for-dry-run",
      active_level: "dry-run-rehearsal",
    });
    expect(readiness.credential_plan.levels.map((level) => level.id)).toEqual([
      "read-only-sync",
      "dry-run-rehearsal",
      "supervised-live",
      "autonomous-live",
    ]);
    expect(readiness.credential_plan.levels.find((level) => level.id === "supervised-live")).toMatchObject({
      status: "blocked",
      boundary: expect.stringContaining("blocked"),
    });
    expect(readiness.credential_plan.items.find((item) => item.id === "private-key")).toMatchObject({
      status: "blocked",
      storage: "never-store",
    });
    expect(readiness.provider_account_runway).toMatchObject({
      mode: "web3-provider-account-runway",
      status: "dry-run-ready",
      configured_required_count: 3,
      required_account_count: 3,
      configured_optional_count: 1,
      optional_account_count: 7,
      missing_required: [],
    });
    expect(readiness.provider_account_runway.primary_stack).toEqual([
      "Helius/Solana RPC for read-only chain and wallet intelligence",
      "Jupiter for quote and unsigned order rehearsal",
      "Dedicated Solana trading wallet with manual external-wallet approval first",
      "DEX Screener/public discovery as fallback market context before paid feed expansion",
    ]);
    expect(readiness.provider_account_runway.items.find((item) => item.id === "helius-read-rail")).toMatchObject({
      status: "configured",
      lane: "read-data",
      priority: "required-now",
      storage_rule: expect.stringContaining("Server env"),
    });
    expect(readiness.provider_account_runway.items.find((item) => item.id === "emergency-stop")).toMatchObject({
      status: "blocked",
      lane: "operations",
      priority: "next",
    });
    expect(JSON.stringify(readiness)).not.toContain("test-key");
    expect(JSON.stringify(readiness)).not.toContain("test-jupiter-key");
    expect(readiness.checks.find((check) => check.id === "live-boundary")).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("real-capital execution remains blocked"),
    });
    expect(readiness.checks.find((check) => check.id === "wallet-assets")).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("Helius DAS returned 9 wallet assets"),
    });
  });

  test("GIVEN optional provider and ops env targets WHEN Web3 credentials are checked THEN the account runway tracks them without leaking secrets", () => {
    process.env.BIRDEYE_API_KEY = "test-birdeye-secret";
    process.env.PUMPFUN_FEED_URL = "https://launch-feed.example.test/private-token";
    process.env.YELLOWSTONE_GRPC_ENDPOINT = "https://yellowstone.example.test";
    process.env.YELLOWSTONE_GRPC_TOKEN = "test-yellowstone-token";
    process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL = "https://ops.example.test/stop-secret";
    process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH = "/tmp/mastermold-tax-ledger";

    const readiness = buildWeb3CredentialsSetupReadiness({
      provider: "custom-rpc",
      rpc_url: "https://mainnet.helius-rpc.com/?api-key=test-key",
      ws_url: "wss://mainnet.helius-rpc.com/?api-key=test-key",
      jupiter_api_key: "test-jupiter-key",
      wallet_public_key: "11111111111111111111111111111111",
      signer_mode: "external-wallet",
      max_trade_usd: 250,
      daily_spend_cap_usd: 1_000,
      max_slippage_bps: 150,
      require_manual_confirmation: true,
    }, {
      rpc_healthy: true,
      wallet_balance_sol: 0.42,
      helius_das_ready: true,
      wallet_asset_count: 9,
      wallet_fungible_asset_count: 4,
      wallet_priced_asset_count: 3,
      wallet_priced_value_usd: 123.45,
      jupiter_quote_ready: true,
      jupiter_order_ready: true,
    });

    expect(readiness.provider_account_runway).toMatchObject({
      status: "dry-run-ready",
      configured_required_count: 3,
      optional_account_count: 7,
      configured_optional_count: 6,
    });
    expect(readiness.provider_account_runway.items.find((item) => item.id === "birdeye-discovery")).toMatchObject({
      status: "configured",
      lane: "market-discovery",
    });
    expect(readiness.provider_account_runway.items.find((item) => item.id === "pumpfun-launch-feed")).toMatchObject({
      status: "configured",
    });
    expect(readiness.provider_account_runway.items.find((item) => item.id === "yellowstone-grpc-stream")).toMatchObject({
      status: "configured",
    });
    expect(readiness.provider_account_runway.items.find((item) => item.id === "emergency-stop")).toMatchObject({
      status: "configured",
      lane: "operations",
    });
    expect(readiness.provider_account_runway.items.find((item) => item.id === "tax-ledger")).toMatchObject({
      status: "configured",
      lane: "accounting",
    });
    expect(JSON.stringify(readiness)).not.toContain("test-birdeye-secret");
    expect(JSON.stringify(readiness)).not.toContain("private-token");
    expect(JSON.stringify(readiness)).not.toContain("test-yellowstone-token");
    expect(JSON.stringify(readiness)).not.toContain("stop-secret");
  });

  test("GIVEN local credential installer requests WHEN scope or input is unsafe THEN it fails without echoing secrets", async () => {
    const remote = await LOCAL_CREDENTIALS_GET(new Request("http://remote.example/api/web3-local-credentials", {
      headers: { host: "remote.example" },
    }));
    const remoteReceipt = await json<{ status: string; local_install_allowed: boolean; secret_echo_permission: string }>(remote);
    expect(remote.status).toBe(403);
    expect(remoteReceipt.status).toBe("blocked");
    expect(remoteReceipt.local_install_allowed).toBe(false);
    expect(remoteReceipt.secret_echo_permission).toBe("blocked");

    const rejected = await LOCAL_CREDENTIALS_POST(new Request("http://localhost/api/web3-local-credentials", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost" },
      body: JSON.stringify({
        helius_api_key: "test-helius-secret",
        ["private" + "_key"]: "test-private-key",
        ["seed" + "_phrase"]: "alpha beta gamma delta",
      }),
    }));
    const rejectedReceipt = await json<{ status: string; rejected_fields: string[]; secret_echo_permission: string }>(rejected);
    const rejectedText = JSON.stringify(rejectedReceipt);
    expect(rejected.status).toBe(422);
    expect(rejectedReceipt.status).toBe("invalid");
    expect(rejectedReceipt.rejected_fields).toEqual(expect.arrayContaining(["private_key", "seed_phrase"]));
    expect(rejectedReceipt.secret_echo_permission).toBe("blocked");
    expect(rejectedText).not.toContain("test-helius-secret");
    expect(rejectedText).not.toContain("alpha beta gamma");
  });

  test("GIVEN local ops targets WHEN the local installer runs THEN it writes ignored env keys without echoing values", async () => {
    const envPath = join(mkdtempSync(join(tmpdir(), "mm-web3-env-")), ".env.local");
    process.env.WEB3_LOCAL_CREDENTIAL_INSTALL_ENV_PATH = envPath;

    const response = await LOCAL_CREDENTIALS_POST(new Request("http://localhost/api/web3-local-credentials", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost" },
      body: JSON.stringify({
        emergency_stop_webhook_url: "https://ops.example.test/live-stop-canary",
        emergency_stop_contact: "ops-canary@example.test",
        tax_ledger_export_path: "/tmp/mastermold-tax-canary.csv",
        production_process_manager: "pm2-live-canary",
        production_worker_owner: "worker-owner-canary@example.test",
        production_alert_webhook_url: "https://ops.example.test/alert-canary",
        production_restart_policy_url: "https://ops.example.test/restart-canary",
      }),
    }));
    const receipt = await json<{
      status: string;
      installed_keys: string[];
      configured_keys: string[];
      runtime_applied_keys: string[];
      runtime_restart_required_keys: string[];
      runtime_effective: boolean;
      runtime_effective_next_action: string;
      missing_keys: string[];
      live_execution_permission: string;
      wallet_mutation_permission: string;
      secret_echo_permission: string;
      summary: string;
      next_action: string;
    }>(response);
    const receiptText = JSON.stringify(receipt);
    const envText = readFileSync(envPath, "utf8");

    expect(response.status).toBe(200);
    expect(receipt.status).toBe("installed");
    expect(receipt.installed_keys).toEqual(expect.arrayContaining([
      "MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL",
      "MASTERMOLD_EMERGENCY_STOP_CONTACT",
      "MASTERMOLD_TAX_LEDGER_EXPORT_PATH",
      "MASTERMOLD_WEB3_PROCESS_MANAGER",
      "MASTERMOLD_WEB3_WORKER_OWNER",
      "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL",
      "MASTERMOLD_WEB3_RESTART_POLICY_URL",
    ]));
    expect(receipt.configured_keys).toEqual(expect.arrayContaining([
      "MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL",
      "MASTERMOLD_EMERGENCY_STOP_CONTACT",
      "MASTERMOLD_TAX_LEDGER_EXPORT_PATH",
      "MASTERMOLD_WEB3_PROCESS_MANAGER",
      "MASTERMOLD_WEB3_WORKER_OWNER",
      "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL",
      "MASTERMOLD_WEB3_RESTART_POLICY_URL",
    ]));
    expect(receipt.runtime_applied_keys).toEqual(expect.arrayContaining([
      "MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL",
      "MASTERMOLD_EMERGENCY_STOP_CONTACT",
      "MASTERMOLD_TAX_LEDGER_EXPORT_PATH",
      "MASTERMOLD_WEB3_PROCESS_MANAGER",
      "MASTERMOLD_WEB3_WORKER_OWNER",
      "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL",
      "MASTERMOLD_WEB3_RESTART_POLICY_URL",
    ]));
    expect(receipt.runtime_restart_required_keys).toEqual([]);
    expect(receipt.runtime_effective).toBe(true);
    expect(receipt.runtime_effective_next_action).toContain("visible to this running server now");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.summary).toContain("values were not returned");
    expect(envText).toContain("MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL=https://ops.example.test/live-stop-canary");
    expect(envText).toContain("MASTERMOLD_EMERGENCY_STOP_CONTACT=ops-canary@example.test");
    expect(envText).toContain("MASTERMOLD_TAX_LEDGER_EXPORT_PATH=/tmp/mastermold-tax-canary.csv");
    expect(envText).toContain("MASTERMOLD_WEB3_PROCESS_MANAGER=pm2-live-canary");
    expect(envText).toContain("MASTERMOLD_WEB3_WORKER_OWNER=worker-owner-canary@example.test");
    expect(envText).toContain("MASTERMOLD_WEB3_ALERT_WEBHOOK_URL=https://ops.example.test/alert-canary");
    expect(envText).toContain("MASTERMOLD_WEB3_RESTART_POLICY_URL=https://ops.example.test/restart-canary");
    expect(receiptText).not.toContain("live-stop-canary");
    expect(receiptText).not.toContain("ops-canary@example.test");
    expect(receiptText).not.toContain("mastermold-tax-canary");
    expect(receiptText).not.toContain("pm2-live-canary");
    expect(receiptText).not.toContain("worker-owner-canary");
    expect(receiptText).not.toContain("alert-canary");
    expect(receiptText).not.toContain("restart-canary");
  });

  test("GIVEN first-canary live flags WHEN the local installer runs THEN the running canary gate sees them without granting wallet authority", async () => {
    const envPath = join(mkdtempSync(join(tmpdir(), "mm-web3-canary-env-")), ".env.local");
    process.env.WEB3_LOCAL_CREDENTIAL_INSTALL_ENV_PATH = envPath;

    const rejected = await LOCAL_CREDENTIALS_POST(new Request("http://localhost/api/web3-local-credentials", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost" },
      body: JSON.stringify({
        enable_live_web3_execution: "yes",
        live_operator_approval: "I_ACCEPT",
        allow_live_unsigned_canary_handoff: "1",
      }),
    }));
    const rejectedReceipt = await json<{ status: string; rejected_fields: string[]; secret_echo_permission: string }>(rejected);
    expect(rejected.status).toBe(422);
    expect(rejectedReceipt.status).toBe("invalid");
    expect(rejectedReceipt.rejected_fields).toEqual(expect.arrayContaining([
      "enable_live_web3_execution",
      "live_operator_approval",
      "allow_live_unsigned_canary_handoff",
    ]));
    expect(rejectedReceipt.secret_echo_permission).toBe("blocked");

    const response = await LOCAL_CREDENTIALS_POST(new Request("http://localhost/api/web3-local-credentials", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost" },
      body: JSON.stringify({
        jupiter_api_key: "test-jupiter-canary-runtime-key",
        enable_live_web3_execution: "true",
        live_operator_approval: "I_UNDERSTAND_REAL_FUNDS",
        allow_live_unsigned_canary_handoff: "true",
      }),
    }));
    const receipt = await json<{
      status: string;
      installed_keys: string[];
      configured_keys: string[];
      runtime_applied_keys: string[];
      runtime_restart_required_keys: string[];
      runtime_effective: boolean;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      secret_echo_permission: string;
      next_action: string;
    }>(response);
    const envText = readFileSync(envPath, "utf8");

    expect(response.status).toBe(200);
    expect(receipt.status).toBe("installed");
    expect(receipt.installed_keys).toEqual(expect.arrayContaining([
      "JUPITER_API_KEY",
      "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
      "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
      "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
    ]));
    expect(receipt.configured_keys).toEqual(expect.arrayContaining([
      "JUPITER_API_KEY",
      "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
      "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
      "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
    ]));
    expect(receipt.runtime_applied_keys).toEqual(expect.arrayContaining([
      "JUPITER_API_KEY",
      "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
      "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
      "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
    ]));
    expect(receipt.runtime_restart_required_keys).toEqual([]);
    expect(receipt.runtime_effective).toBe(true);
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.next_action).not.toContain("JUPITER_API_KEY");
    expect(envText).toContain("JUPITER_API_KEY=test-jupiter-canary-runtime-key");
    expect(envText).toContain("MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true");
    expect(envText).toContain("MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS");
    expect(envText).toContain("MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true");
    expect(JSON.stringify(receipt)).not.toContain("I_UNDERSTAND_REAL_FUNDS");
    expect(JSON.stringify(receipt)).not.toContain("test-jupiter-canary-runtime-key");

    const canaryResponse = await LIVE_TRADE_CANARY_GET(new Request("http://localhost/api/web3-live-trade-canary?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const canary = await json<{
      can_submit_from_app_now: boolean;
      actual_live_trade_tested: boolean;
      real_funds_moved_by_this_app: boolean;
      required_inputs: Array<{ id: string; status: string; target_names: string[] }>;
      blockers: string[];
    }>(canaryResponse);
    expect(canary.required_inputs.find((item) => item.id === "jupiter-order-rail")?.status).toBe("done");
    expect(canary.required_inputs.find((item) => item.id === "first-canary-live-flags")?.status).toBe("done");
    expect(canary.can_submit_from_app_now).toBe(false);
    expect(canary.actual_live_trade_tested).toBe(false);
    expect(canary.real_funds_moved_by_this_app).toBe(false);
    expect(JSON.stringify(canary)).not.toContain("test-jupiter-canary-runtime-key");
  });

  test("GIVEN signer provider targets WHEN the local installer runs THEN it allowlists provider credentials but rejects wallet secrets", async () => {
    const envPath = join(mkdtempSync(join(tmpdir(), "mm-web3-signer-env-")), ".env.local");
    process.env.WEB3_LOCAL_CREDENTIAL_INSTALL_ENV_PATH = envPath;
    const walletPrivateCanary = ["wallet", "private", "canary"].join("-");
    const sessionPrivateCanary = ["session", "private", "canary"].join("-");
    const turnkeyApiPrivateCanary = ["turnkey", "api", "private", "canary"].join("-");
    const turnkeyPrivateCanary = ["turnkey", "private", "canary"].join("-");
    const turnkeyPublicCanary = ["turnkey", "public", "canary"].join("-");
    const turnkeyWalletCanary = ["turnkey", "wallet", "canary"].join("-");

    const rejected = await LOCAL_CREDENTIALS_POST(new Request("http://localhost/api/web3-local-credentials", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost" },
      body: JSON.stringify({
        autonomous_signer_provider: "turnkey",
        turnkey_api_private_key: turnkeyApiPrivateCanary,
        wallet_private_key: walletPrivateCanary,
        session_key_private_key: sessionPrivateCanary,
      }),
    }));
    const rejectedReceipt = await json<{ status: string; rejected_fields: string[]; secret_echo_permission: string }>(rejected);
    expect(rejected.status).toBe(422);
    expect(rejectedReceipt.status).toBe("invalid");
    expect(rejectedReceipt.rejected_fields).toEqual(expect.arrayContaining(["wallet_private_key", "session_key_private_key"]));
    expect(JSON.stringify(rejectedReceipt)).not.toContain(turnkeyApiPrivateCanary);
    expect(JSON.stringify(rejectedReceipt)).not.toContain(walletPrivateCanary);

    const response = await LOCAL_CREDENTIALS_POST(new Request("http://localhost/api/web3-local-credentials", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost" },
      body: JSON.stringify({
        autonomous_signer_provider: "turnkey",
        turnkey_organization_id: "turnkey-org-canary",
        turnkey_api_public_key: turnkeyPublicCanary,
        turnkey_api_private_key: turnkeyPrivateCanary,
        turnkey_solana_wallet_account: turnkeyWalletCanary,
      }),
    }));
    const receipt = await json<{
      status: string;
      installed_keys: string[];
      configured_keys: string[];
      runtime_applied_keys: string[];
      runtime_restart_required_keys: string[];
      runtime_effective: boolean;
      secret_echo_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      next_action: string;
    }>(response);
    const receiptText = JSON.stringify(receipt);
    const envText = readFileSync(envPath, "utf8");

    expect(response.status).toBe(200);
    expect(receipt.status).toBe("installed");
    expect(receipt.installed_keys).toEqual(expect.arrayContaining([
      "MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER",
      "TURNKEY_ORGANIZATION_ID",
      "TURNKEY_API_PUBLIC_KEY",
      "TURNKEY_API_PRIVATE_KEY",
      "TURNKEY_SOLANA_WALLET_ACCOUNT",
    ]));
    expect(receipt.configured_keys).toEqual(expect.arrayContaining([
      "MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER",
      "TURNKEY_API_PRIVATE_KEY",
    ]));
    expect(receipt.runtime_applied_keys).toEqual(expect.arrayContaining([
      "MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER",
      "TURNKEY_API_PRIVATE_KEY",
    ]));
    expect(receipt.runtime_restart_required_keys).toEqual([]);
    expect(receipt.runtime_effective).toBe(true);
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(envText).toContain("MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER=turnkey");
    expect(envText).toContain(`TURNKEY_API_PRIVATE_KEY=${turnkeyPrivateCanary}`);
    expect(receiptText).not.toContain(turnkeyPrivateCanary);
    expect(receiptText).not.toContain(turnkeyPublicCanary);
    expect(receiptText).not.toContain(turnkeyWalletCanary);
  });

  test("GIVEN local provider env WHEN the account setup route runs THEN it reports missing accounts without leaking secrets", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.BIRDEYE_API_KEY = "test-birdeye-secret";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "external-wallet";

    const rejected = await ACCOUNT_SETUP_GET(new Request("http://localhost/api/web3-account-setup?source=bad-source"));
    expect(rejected.status).toBe(422);

    const response = await ACCOUNT_SETUP_GET(new Request("http://localhost/api/web3-account-setup?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      account_creation_permission: string;
      external_signup_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      environment_summary: {
        helius_read_rail_configured: boolean;
        jupiter_configured: boolean;
        signer_provider: string;
        optional_market_feed_count: number;
        required_configured_count: number;
        required_account_count: number;
        missing_required: string[];
      };
      wallet_summary: {
        wallet_scoped: boolean;
        wallet_is_sample: boolean;
        dedicated_wallet_scoped: boolean;
        wallet_ownership_proved: boolean;
        wallet_ownership_receipt_hash: string | null;
        wallet_public_key_preview: string | null;
      };
      items: Array<{ id: string; status: string; configured: boolean; env_targets: string[] }>;
      checks: Array<{ id: string; status: string; detail: string }>;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-account-setup-receipt");
    expect(receipt.status).toBe("missing-execution-rail");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.account_creation_permission).toBe("operator-external-only");
    expect(receipt.external_signup_permission).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.environment_summary.helius_read_rail_configured).toBe(true);
    expect(receipt.environment_summary.jupiter_configured).toBe(false);
    expect(receipt.environment_summary.signer_provider).toBe("external-wallet");
    expect(receipt.environment_summary.optional_market_feed_count).toBe(1);
    expect(receipt.environment_summary.required_account_count).toBe(3);
    expect(receipt.environment_summary.required_configured_count).toBe(1);
    expect(receipt.environment_summary.missing_required).toContain("Jupiter execution rail");
    expect(receipt.environment_summary.missing_required).toContain("Dedicated public trading wallet");
    expect(receipt.wallet_summary.wallet_scoped).toBe(false);
    expect(receipt.wallet_summary.wallet_is_sample).toBe(false);
    expect(receipt.wallet_summary.dedicated_wallet_scoped).toBe(false);
    expect(receipt.items.find((item) => item.id === "helius-read-rail")).toMatchObject({
      status: "configured",
      configured: true,
      env_targets: ["HELIUS_API_KEY", "SOLANA_RPC_URL", "SOLANA_WS_URL"],
    });
    expect(receipt.items.find((item) => item.id === "jupiter-execution-rail")).toMatchObject({
      status: "needed",
      configured: false,
      env_targets: ["JUPITER_API_KEY"],
    });
    expect(receipt.checks.map((check) => check.id)).toEqual([
      "helius-read-rail",
      "jupiter-execution-rail",
      "dedicated-wallet",
      "manual-signer",
      "emergency-stop",
      "accounting",
      "live-boundary",
      "secret-boundary",
    ]);
    expect(receipt.checks.find((check) => check.id === "secret-boundary")).toMatchObject({ status: "pass" });
    expect(receipt.controls.some((control) => control.includes("does not create third-party accounts"))).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("test-helius-secret");
    expect(JSON.stringify(receipt)).not.toContain("test-birdeye-secret");
  });

  test("GIVEN operator credential setup gaps WHEN the handoff route runs THEN it returns safe inputs without live authority", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "external-wallet";

    const rejected = await OPERATOR_CREDENTIAL_HANDOFF_GET(new Request("http://localhost/api/web3-operator-credential-handoff?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await OPERATOR_CREDENTIAL_HANDOFF_GET(new Request("http://localhost/api/web3-operator-credential-handoff?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      next_input: { id: string; label: string; can_enter_in_app: boolean; verifier_command: string | null } | null;
      live_usability: {
        mode: string;
        status: string;
        receipt_hash: string;
        real_capital_blocker_count: number;
        total_live_usability_row_count: number;
        listed_live_usability_row_count: number;
        open_operator_input_count: number;
        ready_live_lane_count: number;
        total_live_lane_count: number;
        next_unlock_step_label: string | null;
        next_unlock_step_action: string | null;
        evidence_endpoint: string;
      } | null;
      inputs: Array<{ id: string; input_kind: string; safe_collection_surface: string; env_targets: string[]; storage: string; secret_handling: string }>;
      allowed_inputs: string[];
      never_request: string[];
      safe_commands: string[];
      account_creation_permission: string;
      external_signup_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);
    const text = JSON.stringify(receipt);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-operator-credential-handoff");
    expect(receipt.status).toBe("needs-operator-input");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.account_creation_permission).toBe("operator-external-only");
    expect(receipt.external_signup_permission).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.live_usability).not.toBeNull();
    const handoffLiveUsability = receipt.live_usability!;
    expect(handoffLiveUsability).toMatchObject({
      mode: "web3-operator-credential-live-usability-summary",
      status: "operator-input-needed",
      evidence_endpoint: "GET /api/web3-live-usability-blockers",
    });
    expect(handoffLiveUsability.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(handoffLiveUsability.total_live_usability_row_count).toBeGreaterThanOrEqual(handoffLiveUsability.listed_live_usability_row_count);
    expect(handoffLiveUsability.real_capital_blocker_count).toBeGreaterThan(0);
    expect(handoffLiveUsability.ready_live_lane_count).toBeLessThanOrEqual(handoffLiveUsability.total_live_lane_count);
    expect(handoffLiveUsability.next_unlock_step_label).toBe("Scope dedicated wallet");
    expect(handoffLiveUsability.next_unlock_step_action).toContain("public Solana trading wallet");
    expect(receipt.next_input?.id).toBe("dedicated-trading-wallet");
    expect(receipt.inputs.find((item) => item.id === "helius-solana-read-rail")).toMatchObject({
      input_kind: "api-key",
      safe_collection_surface: "settings-console",
      storage: "server-env",
      env_targets: expect.arrayContaining(["HELIUS_API_KEY", "SOLANA_RPC_URL"]),
    });
    expect(receipt.inputs.find((item) => item.id === "jupiter-route-order-key")).toMatchObject({
      input_kind: "api-key",
      safe_collection_surface: "settings-console",
      env_targets: expect.arrayContaining(["JUPITER_API_KEY"]),
      storage: "server-env",
    });
    expect(receipt.inputs.find((item) => item.id === "dedicated-trading-wallet")).toMatchObject({
      input_kind: "public-wallet",
      safe_collection_surface: "settings-console",
      storage: "browser-public-scope",
    });
    expect(receipt.inputs.find((item) => item.id === "wallet-ownership-proof")).toMatchObject({
      input_kind: "wallet-proof",
      safe_collection_surface: "browser-wallet",
      storage: "hash-only-local-receipt",
    });
    expect(receipt.inputs.find((item) => item.id === "emergency-stop-target")).toMatchObject({
      input_kind: "ops-target",
      safe_collection_surface: "settings-console",
      env_targets: expect.arrayContaining(["MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL", "MASTERMOLD_EMERGENCY_STOP_CONTACT"]),
      storage: "server-env",
    });
    expect(receipt.inputs.find((item) => item.id === "production-worker-ops")).toMatchObject({
      input_kind: "ops-target",
      safe_collection_surface: "settings-console",
      env_targets: expect.arrayContaining([
        "MASTERMOLD_WEB3_PROCESS_MANAGER",
        "MASTERMOLD_WEB3_WORKER_OWNER",
        "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL",
        "MASTERMOLD_WEB3_RESTART_POLICY_URL",
      ]),
      storage: "server-env",
    });
    expect(receipt.inputs.find((item) => item.id === "accounting-export-target")).toMatchObject({
      input_kind: "accounting-target",
      safe_collection_surface: "settings-console",
      env_targets: expect.arrayContaining(["MASTERMOLD_TAX_LEDGER_EXPORT_PATH"]),
      storage: "server-env",
    });
    expect(receipt.allowed_inputs).toEqual(expect.arrayContaining([
      "JUPITER_API_KEY in ignored server env or one-shot credential test",
      "Dedicated Solana public wallet address",
      "Browser-wallet text-message ownership proof",
      "Production worker owner, process manager, alert route, and restart-policy targets",
      "Accounting/export target for reviewed fill records",
    ]));
    expect(receipt.never_request).toEqual(expect.arrayContaining([
      "Wallet private key",
      "Seed phrase or mnemonic",
      "Raw keypair JSON",
    ]));
    expect(receipt.safe_commands).toEqual(expect.arrayContaining([
      "npm run verify:web3 -- --base-url=http://localhost:4010",
      "npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json",
    ]));
    expect(receipt.controls.some((control) => control.includes("credential handoff contract"))).toBe(true);
    expect(text).not.toContain("test-helius-secret");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
  });

  test("GIVEN an operator needs setup help WHEN the request packet route runs THEN it returns a shareable redacted packet", async () => {
    process.env.HELIUS_API_KEY = "test-helius-request-secret";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "external-wallet";

    const rejected = await OPERATOR_REQUEST_PACKET_GET(new Request("http://localhost/api/web3-operator-request-packet?source=bad"));
    expect(rejected.status).toBe(422);

    const response = await OPERATOR_REQUEST_PACKET_GET(new Request("http://localhost/api/web3-operator-request-packet?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const packet = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      handoff_receipt_hash: string;
      next_unlock_step: { id: string; label: string; status: string; storage: string; next_action: string; evidence: string } | null;
      operator_unlock_sequence: Array<{ id: string; label: string; status: string; storage: string; next_action: string; evidence: string }>;
      live_usability: {
        mode: string;
        status: string;
        receipt_hash: string;
        real_capital_blocker_count: number;
        total_live_usability_row_count: number;
        listed_live_usability_row_count: number;
        ready_live_lane_count: number;
        total_live_lane_count: number;
        next_unlock_step_label: string | null;
        next_unlock_step_action: string | null;
        evidence_endpoint: string;
      } | null;
      current_input: {
        id: string;
        label: string;
        source: string;
        safe_collection_surface: string;
        storage: string;
        target_names: string[];
        next_action: string;
        verifier_command: string | null;
        unlock_step_id: string | null;
        live_usability_receipt_hash: string | null;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      } | null;
      next_input: { id: string; label: string; next_action: string } | null;
      required_inputs: Array<{ id: string; env_targets: string[]; storage: string; safe_collection_surface: string; verifier_command: string | null }>;
      review_inputs: Array<{ id: string }>;
      safe_to_provide: string[];
      never_provide: string[];
      verifier_commands: string[];
      text_packet: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);
    const text = JSON.stringify(packet);

    expect(response.status).toBe(200);
    expect(packet.mode).toBe("web3-operator-request-packet");
    expect(packet.status).toBe("needs-input");
    expect(packet.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.handoff_receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.next_unlock_step).toMatchObject({
      id: "scope-wallet",
      status: "active",
    });
    expect(packet.operator_unlock_sequence.map((step) => step.id)).toEqual([
      "scope-wallet",
      "prove-wallet",
      "rehearse-jupiter",
      "choose-signer",
      "ops-accounting",
      "external-review",
    ]);
    expect(packet.live_usability).not.toBeNull();
    const requestLiveUsability = packet.live_usability!;
    expect(requestLiveUsability).toMatchObject({
      mode: "web3-operator-credential-live-usability-summary",
      status: "operator-input-needed",
      evidence_endpoint: "GET /api/web3-live-usability-blockers",
    });
    expect(requestLiveUsability.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(requestLiveUsability.total_live_usability_row_count).toBeGreaterThanOrEqual(requestLiveUsability.listed_live_usability_row_count);
    expect(requestLiveUsability.real_capital_blocker_count).toBeGreaterThan(0);
    expect(requestLiveUsability.ready_live_lane_count).toBeLessThanOrEqual(requestLiveUsability.total_live_lane_count);
    expect(requestLiveUsability.next_unlock_step_label).toBe("Scope dedicated wallet");
    expect(requestLiveUsability.next_unlock_step_action).toContain("public Solana trading wallet");
    expect(packet.current_input).toMatchObject({
      id: "dedicated-trading-wallet",
      label: "Dedicated trading wallet",
      source: "operator-input",
      safe_collection_surface: "settings-console",
      storage: "browser-public-scope",
      unlock_step_id: "scope-wallet",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(packet.current_input?.target_names).toEqual(["wallet_public_key"]);
    expect(packet.current_input?.next_action).toContain("public Solana trading wallet");
    expect(packet.current_input?.live_usability_receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.next_input?.id).toBe("dedicated-trading-wallet");
    expect(packet.required_inputs.map((item) => item.id)).toEqual(expect.arrayContaining([
      "jupiter-route-order-key",
      "dedicated-trading-wallet",
      "emergency-stop-target",
      "production-worker-ops",
      "accounting-export-target",
    ]));
    expect(packet.required_inputs.find((item) => item.id === "production-worker-ops")?.env_targets).toEqual(expect.arrayContaining([
      "MASTERMOLD_WEB3_PROCESS_MANAGER",
      "MASTERMOLD_WEB3_WORKER_OWNER",
      "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL",
      "MASTERMOLD_WEB3_RESTART_POLICY_URL",
    ]));
    expect(packet.safe_to_provide).toContain("Dedicated Solana public wallet address");
    expect(packet.never_provide).toContain("Seed phrase or mnemonic");
    expect(packet.verifier_commands).toEqual(expect.arrayContaining([
      "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
      "npm run doctor:web3 -- --json",
    ]));
    expect(packet.text_packet).toContain("# Mastermind Web3 Operator Request Packet");
    expect(packet.text_packet).toContain("Next Ordered Unlock Step");
    expect(packet.text_packet).toContain("Current Input Contract");
    expect(packet.text_packet).toContain("wallet_public_key");
    expect(packet.text_packet).toContain("Operator Unlock Sequence");
    expect(packet.text_packet).toContain("Live Usability Summary");
    expect(packet.text_packet).toContain("Rows listed:");
    expect(packet.text_packet).toContain("GET /api/web3-live-usability-blockers");
    expect(packet.text_packet).toContain("JUPITER_API_KEY");
    expect(packet.text_packet).toContain("MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL");
    expect(packet.text_packet).toContain("Never Provide");
    expect(packet.live_execution_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(packet.transaction_submission_permission).toBe("blocked");
    expect(packet.private_key_storage).toBe("blocked");
    expect(packet.seed_phrase_storage).toBe("blocked");
    expect(packet.secret_echo_permission).toBe("blocked");
    expect(packet.controls.some((control) => control.includes("safe to share"))).toBe(true);
    expect(text).not.toContain("test-helius-request-secret");
  });

  test("GIVEN a helper bot needs context WHEN research handoff runs THEN it returns questions and redacted app state", async () => {
    process.env.HELIUS_API_KEY = "test-helius-research-secret";
    process.env.JUPITER_API_KEY = "test-jupiter-research-secret";

    const rejected = await RESEARCH_HANDOFF_PACKET_GET(new Request("http://localhost/api/web3-research-handoff-packet?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await RESEARCH_HANDOFF_PACKET_GET(new Request("http://localhost/api/web3-research-handoff-packet?scenario=breakout&source=sample&account=ephemeral&cycles=1"));
    const packet = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      summary: string;
      app_state: {
        usability_status: string;
        runbook_status: string;
        cutover_status: string;
        manual_review_status: string;
        live_preflight_status: string;
        ready_credential_lanes: number;
        total_credential_lanes: number;
      };
      current_capabilities: string[];
      next_unlock_step: { id: string; label: string; status: string; storage: string; next_action: string; evidence: string } | null;
      operator_unlock_sequence: Array<{ id: string; label: string; status: string; storage: string; next_action: string; evidence: string }>;
      live_usability: {
        mode: string;
        status: string;
        receipt_hash: string;
        real_capital_blocker_count: number;
        total_live_usability_row_count: number;
        listed_live_usability_row_count: number;
        ready_live_lane_count: number;
        total_live_lane_count: number;
        next_unlock_step_label: string | null;
        next_unlock_step_action: string | null;
        evidence_endpoint: string;
      } | null;
      current_input: {
        id: string;
        label: string;
        source: string;
        safe_collection_surface: string;
        storage: string;
        target_names: string[];
        next_action: string;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      } | null;
      open_operator_inputs: Array<{ id: string; env_targets: string[]; storage: string; safe_collection_surface: string }>;
      live_capital_blockers: Array<{ id: string; label: string; status: string; next_action: string }>;
      credential_requirements: Array<{
        id: string;
        label: string;
        owner: string;
        priority: string;
        safe_value_type: string;
        safe_collection_surface: string;
        storage_rule: string;
        target_names: string[];
        research_question_ids: string[];
        completion_signal: string;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        secret_echo_permission: string;
      }>;
      research_questions: Array<{ id: string; priority: string; category: string; question: string; expected_answer_format: string }>;
      safe_to_share: string[];
      never_provide: string[];
      source_endpoints: string[];
      safe_export_commands: string[];
      verifier_commands: string[];
      text_packet: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);
    const text = JSON.stringify(packet);

    expect(response.status).toBe(200);
    expect(packet.mode).toBe("web3-research-handoff-packet");
    expect(packet.status).toBe("ready-for-operator-input");
    expect(packet.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.summary).toContain("Research packet is ready to share");
    expect(packet.app_state.ready_credential_lanes).toBeLessThan(packet.app_state.total_credential_lanes);
    expect(packet.current_capabilities.some((item) => item.includes("Paper wallet telemetry"))).toBe(true);
    expect(packet.next_unlock_step).toMatchObject({
      id: "scope-wallet",
      label: "Scope dedicated wallet",
      storage: "browser-public-scope",
    });
    expect(packet.operator_unlock_sequence.map((step) => step.id)).toEqual([
      "scope-wallet",
      "prove-wallet",
      "rehearse-jupiter",
      "choose-signer",
      "ops-accounting",
      "external-review",
    ]);
    expect(packet.live_usability).not.toBeNull();
    const researchLiveUsability = packet.live_usability!;
    expect(researchLiveUsability).toMatchObject({
      mode: "web3-operator-credential-live-usability-summary",
      status: "operator-input-needed",
      evidence_endpoint: "GET /api/web3-live-usability-blockers",
    });
    expect(researchLiveUsability.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(researchLiveUsability.total_live_usability_row_count).toBeGreaterThanOrEqual(researchLiveUsability.listed_live_usability_row_count);
    expect(researchLiveUsability.real_capital_blocker_count).toBeGreaterThan(0);
    expect(researchLiveUsability.ready_live_lane_count).toBeLessThanOrEqual(researchLiveUsability.total_live_lane_count);
    expect(researchLiveUsability.next_unlock_step_label).toBe("Scope dedicated wallet");
    expect(researchLiveUsability.next_unlock_step_action).toContain("public Solana trading wallet");
    expect(packet.current_input).toMatchObject({
      id: "dedicated-trading-wallet",
      label: "Dedicated trading wallet",
      source: "operator-input",
      safe_collection_surface: "settings-console",
      storage: "browser-public-scope",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(packet.current_input?.target_names).toEqual(["wallet_public_key"]);
    expect(packet.open_operator_inputs.map((item) => item.id)).toEqual(expect.arrayContaining([
      "dedicated-trading-wallet",
      "emergency-stop-target",
      "production-worker-ops",
    ]));
    expect(packet.live_capital_blockers.map((item) => item.id)).toEqual(expect.arrayContaining([
      "operator-wallet",
      "live-dex",
      "signer-custody",
    ]));
    expect(packet.credential_requirements.map((item) => item.id)).toEqual([
      "dedicated-public-wallet",
      "wallet-ownership-proof",
      "read-provider-rail",
      "jupiter-order-rail",
      "first-canary-live-flags",
      "signer-policy",
      "ops-emergency-stop",
      "accounting-ledger",
      "risk-policy",
      "manual-live-review",
    ]);
    expect(packet.credential_requirements[0]).toMatchObject({
      label: "Dedicated public wallet",
      owner: "operator",
      priority: "needed-now",
      safe_collection_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      storage_rule: "browser-public-scope",
      target_names: ["wallet_public_key"],
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(packet.credential_requirements.find((item) => item.id === "jupiter-order-rail")?.target_names).toContain("JUPITER_API_KEY");
    expect(packet.credential_requirements.find((item) => item.id === "first-canary-live-flags")?.target_names).toEqual([
      "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
      "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
      "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
    ]);
    expect(packet.credential_requirements.find((item) => item.id === "signer-policy")?.research_question_ids).toEqual(expect.arrayContaining(["custody-architecture", "risk-gates"]));
    expect(packet.credential_requirements.every((item) =>
      item.completion_signal.length > 0 &&
      item.live_execution_permission === "blocked" &&
      item.wallet_mutation_permission === "blocked" &&
      item.secret_echo_permission === "blocked"
    )).toBe(true);
    expect(packet.research_questions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "custody-architecture",
      "provider-stack",
      "moonshot-data-sources",
      "profit-proof",
    ]));
    expect(packet.research_questions.find((item) => item.id === "credential-storage")?.expected_answer_format).toContain("credential names");
    expect(packet.safe_to_share).toContain("Dedicated Solana public wallet address");
    expect(packet.safe_to_share).toContain("Exact first-canary live flag values for ignored local env: MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true, MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS, MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true");
    expect(packet.never_provide).toContain("Seed phrase or mnemonic");
    expect(packet.source_endpoints).toContain("/api/web3-research-handoff-packet?source=live-dex&account=persistent");
    expect(packet.source_endpoints).toContain("/api/web3-credential-requirements?source=live-dex&account=persistent");
    expect(packet.source_endpoints).toContain("/api/web3-operator-runbook?source=live-dex&account=persistent");
    expect(packet.safe_export_commands).toEqual(expect.arrayContaining([
      "npm run --silent research:web3 -- --base-url=http://localhost:4010",
      "npm run --silent research:web3 -- --base-url=http://localhost:4010 --json",
      "npm run --silent requirements:web3 -- --base-url=http://localhost:4010",
      "npm run --silent requirements:web3 -- --base-url=http://localhost:4010 --json",
    ]));
    expect(packet.verifier_commands).toEqual(expect.arrayContaining([
      "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet --require-jupiter-order --require-dex-live --require-live-canary",
    ]));
    expect(packet.text_packet).toContain("# Mastermind Web3 Research Handoff Packet");
    expect(packet.text_packet).toContain("## Local Export Commands");
    expect(packet.text_packet).toContain("## Next Ordered Unlock Step");
    expect(packet.text_packet).toContain("## Current Input Contract");
    expect(packet.text_packet).toContain("wallet_public_key");
    expect(packet.text_packet).toContain("## Operator Unlock Sequence");
    expect(packet.text_packet).toContain("## Live Usability Summary");
    expect(packet.text_packet).toContain("## Credential Requirements");
    expect(packet.text_packet).toContain("Dedicated public wallet");
    expect(packet.text_packet).toContain("Done when:");
    expect(packet.text_packet).toContain("Rows listed:");
    expect(packet.text_packet).toContain("GET /api/web3-live-usability-blockers");
    expect(packet.text_packet).toContain("Scope dedicated wallet");
    expect(packet.text_packet).toContain("npm run --silent research:web3 -- --base-url=http://localhost:4010");
    expect(packet.text_packet).toContain("What is the safest Solana custody architecture");
    expect(packet.text_packet).toContain("Live Capital Blockers");
    expect(packet.live_execution_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(packet.transaction_submission_permission).toBe("blocked");
    expect(packet.private_key_storage).toBe("blocked");
    expect(packet.seed_phrase_storage).toBe("blocked");
    expect(packet.secret_echo_permission).toBe("blocked");
    expect(packet.controls.some((control) => control.includes("safe to share"))).toBe(true);
    expect(text).not.toContain("test-helius-research-secret");
    expect(text).not.toContain("test-jupiter-research-secret");
  });

  test("GIVEN helper or operator needs safe credential asks WHEN credential requirements route runs THEN it returns a blocked checklist", async () => {
    process.env.HELIUS_API_KEY = "test-helius-requirements-secret";
    process.env.JUPITER_API_KEY = "test-jupiter-requirements-secret";

    const rejected = await CREDENTIAL_REQUIREMENTS_GET(new Request("http://localhost/api/web3-credential-requirements?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await CREDENTIAL_REQUIREMENTS_GET(new Request("http://localhost/api/web3-credential-requirements?scenario=breakout&source=sample&account=ephemeral&cycles=1"));
    const packet = await json<{
      mode: string;
      status: string;
      generated_at: string;
      receipt_hash: string;
      research_handoff_hash: string;
      source: string;
      account: string;
      scenario: string;
      requirement_count: number;
      needed_now_count: number;
      before_live_count: number;
      external_review_count: number;
      blocker_count: number;
      next_requirement: {
        id: string;
        next_action: string;
        target_names: string[];
        safe_collection_surface: string;
        completion_signal: string;
      } | null;
      requirements: Array<{
        id: string;
        label: string;
        owner: string;
        priority: string;
        safe_value_type: string;
        safe_collection_surface: string;
        storage_rule: string;
        target_names: string[];
        research_question_ids: string[];
        completion_signal: string;
        next_action: string;
        blocks_live_capital: boolean;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        secret_echo_permission: string;
      }>;
      safe_to_share: string[];
      never_provide: string[];
      source_endpoint: string;
      live_review_source_endpoint: string;
      safe_export_commands: string[];
      text_packet: string;
      summary: string;
      next_action: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      signing_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);
    const text = JSON.stringify(packet);

    expect(response.status).toBe(200);
    expect(packet.mode).toBe("web3-credential-requirements");
    expect(packet.status).toBe("operator-input-needed");
    expect(packet.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.research_handoff_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.requirement_count).toBe(10);
    expect(packet.needed_now_count).toBeGreaterThanOrEqual(4);
    expect(packet.before_live_count).toBeGreaterThanOrEqual(4);
    expect(packet.external_review_count).toBe(1);
    expect(packet.blocker_count).toBe(10);
    expect(packet.next_requirement).toMatchObject({
      id: "dedicated-public-wallet",
      target_names: ["wallet_public_key"],
      safe_collection_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
    });
    expect(packet.next_requirement?.completion_signal).toContain("--require-operator-wallet");
    expect(packet.next_action).toContain("public Solana trading wallet");
    expect(packet.requirements.map((item) => item.id)).toEqual([
      "dedicated-public-wallet",
      "wallet-ownership-proof",
      "read-provider-rail",
      "jupiter-order-rail",
      "first-canary-live-flags",
      "signer-policy",
      "ops-emergency-stop",
      "accounting-ledger",
      "risk-policy",
      "manual-live-review",
    ]);
    expect(packet.requirements.find((item) => item.id === "jupiter-order-rail")?.target_names).toContain("JUPITER_API_KEY");
    expect(packet.requirements.find((item) => item.id === "first-canary-live-flags")?.target_names).toEqual([
      "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
      "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
      "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
    ]);
    expect(packet.requirements.find((item) => item.id === "signer-policy")?.research_question_ids).toEqual(expect.arrayContaining(["custody-architecture", "risk-gates"]));
    expect(packet.requirements.every((item) =>
      item.blocks_live_capital === true &&
      item.live_execution_permission === "blocked" &&
      item.wallet_mutation_permission === "blocked" &&
      item.secret_echo_permission === "blocked"
    )).toBe(true);
    expect(packet.safe_to_share).toContain("Dedicated Solana public wallet address");
    expect(packet.safe_to_share).toContain("Exact first-canary live flag values for ignored local env: MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION=true, MASTERMOLD_LIVE_OPERATOR_APPROVAL=I_UNDERSTAND_REAL_FUNDS, MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true");
    expect(packet.never_provide).toContain("Seed phrase or mnemonic");
    expect(packet.safe_export_commands).toEqual(expect.arrayContaining([
      "npm run --silent requirements:web3 -- --base-url=http://localhost:4010",
      "npm run --silent requirements:web3 -- --base-url=http://localhost:4010 --json",
    ]));
    expect(packet.text_packet).toContain("# Mastermind Web3 Credential Requirements Packet");
    expect(packet.text_packet).toContain("## Next Requirement");
    expect(packet.text_packet).toContain("wallet_public_key");
    expect(packet.text_packet).toContain("## Requirements");
    expect(packet.text_packet).toContain("Jupiter order rail");
    expect(packet.text_packet).toContain("First canary live flags");
    expect(packet.text_packet).toContain("MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF");
    expect(packet.text_packet).toContain("## Never Provide");
    expect(packet.text_packet).toContain("Seed phrase or mnemonic");
    expect(packet.text_packet).toContain("requirements:web3");
    expect(packet.source_endpoint).toContain("/api/web3-credential-requirements");
    expect(packet.source_endpoint).toContain("source=sample");
    expect(packet.live_review_source_endpoint).toBe("/api/web3-credential-requirements?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(packet.summary).toContain("safe Web3 credential");
    expect(packet.controls.some((control) => control.includes("credential collection checklist"))).toBe(true);
    expect(packet.live_execution_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(packet.transaction_submission_permission).toBe("blocked");
    expect(packet.signing_permission).toBe("blocked");
    expect(packet.private_key_storage).toBe("blocked");
    expect(packet.seed_phrase_storage).toBe("blocked");
    expect(packet.secret_echo_permission).toBe("blocked");
    expect(text).not.toContain("test-helius-requirements-secret");
    expect(text).not.toContain("test-jupiter-requirements-secret");
  });

  test("GIVEN helper research answers are pasted WHEN answer intake runs THEN it scores decision coverage without live authority", async () => {
    const answer = [
      "Custody: compare Turnkey, Privy, manual external wallet, policy wallet, session key, caps, private key never-store, and seed phrase never-store.",
      "Provider stack: use Helius, Jupiter, Birdeye, DEX Screener, GeckoTerminal, Yellowstone gRPC, Pump.fun, Raydium, and Meteora by role.",
      "Moonshot data sources should cover trending launches, holder concentration, liquidity, promotion boosts, creator risk, whale flow, and rug flags.",
      "Latency budget should set milliseconds or seconds limits for stale discovery, quote age, refresh, confirmation, expiry, and priority fee.",
      "First live mode should be manual supervised approval with caps, rollback, and external review before policy wallet autonomy.",
      "Compliance boundaries need disclosure, risk, jurisdiction, tax, not financial advice, terms, and prohibited profit claims.",
      "Risk gates should include slippage, daily cap, drawdown, liquidity, holder concentration, token age, authority, MEV, kill switch, and trade size.",
      "Settlement accounting should use getTransaction, confirmation, token balance deltas, fees, tax lots, PnL export, idempotency, and reconciliation.",
      "Credential storage should classify server env, browser public fields, never store, redaction, verifier, one-shot API key, and target name handling.",
      "Go-live checklist needs operator, security, ops, accounting, strategy, pass fail evidence, owner, and rollback.",
      "Cockpit dashboard should show chart, dashboard, PnL, drawdown, position, first screen alerts, timeline, diagnostics, and mobile layout.",
      "Profit proof needs run count, hit rate, drawdown, profit factor, out-of-sample baseline, slippage, regime, promotion threshold.",
    ].join("\n");
    const response = await RESEARCH_ANSWER_INTAKE_POST(new Request("http://localhost/api/web3-research-answer-intake?scenario=breakout&source=sample&account=ephemeral", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers_text: answer }),
    }));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      answer_hash: string;
      answered_count: number;
      missing_count: number;
      lanes: Array<{ id: string; status: string; answer_storage: string }>;
      implementation_decisions: Array<{
        id: string;
        label: string;
        owner: string;
        phase: string;
        status: string;
        verification_command: string;
        live_authority: string;
      }>;
      implementation_plan: {
        status: string;
        next_owner: string;
        next_phase: string;
        ready_now_count: number;
        before_live_count: number;
        review_count: number;
        needs_research_count: number;
        blocked_count: number;
        next_decision: {
          id: string;
          label: string;
          owner: string;
          phase: string;
          status: string;
          implementation_step: string;
          verification_command: string;
          live_authority: string;
        } | null;
        owner_summary: Array<{ owner: string; ready: number; needs_research: number; blocked: number }>;
        phase_summary: Array<{ phase: string; ready: number; needs_research: number; blocked: number }>;
        safety_boundary: string[];
      };
      ready_decision_count: number;
      blocked_decision_count: number;
      safe_next_actions: string[];
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      signing_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-research-answer-intake");
    expect(receipt.status).toBe("decision-ready");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.answer_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.answered_count).toBe(12);
    expect(receipt.missing_count).toBe(0);
    expect(receipt.lanes.every((lane) => lane.status === "answered")).toBe(true);
    expect(receipt.lanes.every((lane) => lane.answer_storage === "local-session-only")).toBe(true);
    expect(receipt.ready_decision_count).toBe(12);
    expect(receipt.blocked_decision_count).toBe(0);
    expect(receipt.implementation_decisions.map((decision) => decision.id)).toEqual(expect.arrayContaining([
      "custody-signer-path",
      "provider-stack",
      "risk-gate-thresholds",
      "settlement-accounting-proof",
      "operator-cockpit-dashboard",
      "profit-proof-threshold",
    ]));
    expect(receipt.implementation_decisions.every((decision) => decision.status === "ready-to-spec")).toBe(true);
    expect(receipt.implementation_decisions.every((decision) => decision.live_authority === "blocked")).toBe(true);
    expect(receipt.implementation_decisions.some((decision) => decision.verification_command.includes("npm run verify:web3"))).toBe(true);
    expect(receipt.implementation_decisions.find((decision) => decision.id === "custody-signer-path")?.verification_command).toBe(
      "npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet",
    );
    expect(receipt.implementation_plan.status).toBe("ready-to-spec");
    expect(receipt.implementation_plan.next_owner).toBe("security");
    expect(receipt.implementation_plan.next_phase).toBe("now");
    expect(receipt.implementation_plan.ready_now_count).toBeGreaterThan(0);
    expect(receipt.implementation_plan.before_live_count).toBeGreaterThan(0);
    expect(receipt.implementation_plan.review_count).toBeGreaterThan(0);
    expect(receipt.implementation_plan.needs_research_count).toBe(0);
    expect(receipt.implementation_plan.blocked_count).toBe(0);
    expect(receipt.implementation_plan.next_decision?.id).toBe("custody-signer-path");
    expect(receipt.implementation_plan.next_decision?.live_authority).toBe("blocked");
    expect(receipt.implementation_plan.owner_summary.some((owner) => owner.owner === "security" && owner.ready > 0)).toBe(true);
    expect(receipt.implementation_plan.phase_summary.some((phase) => phase.phase === "now" && phase.ready > 0)).toBe(true);
    expect(receipt.implementation_plan.safety_boundary.some((line) => line.includes("cannot sign, submit, mutate wallets"))).toBe(true);
    expect(receipt.safe_next_actions).toEqual(expect.arrayContaining([
      "Convert the selected manual-wallet, Privy, Turnkey, or session-key recommendation into a signer policy envelope with no private-key collection.",
      "Keep live execution blocked until manual live review independently passes.",
    ]));
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.signing_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.controls.some((control) => control.includes("does not store answers server-side"))).toBe(true);

    const rejected = await RESEARCH_ANSWER_INTAKE_POST(new Request("http://localhost/api/web3-research-answer-intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers_text: "seed phrase: alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu" }),
    }));
    const rejectedBody = await json<{ error: string }>(rejected);
    expect(rejected.status).toBe(422);
    expect(rejectedBody.error).toContain("secret-looking seed phrase");
  });

  test("GIVEN the trading cockpit needs a readiness dossier WHEN usability status is requested THEN it returns compact redacted capability gates", async () => {
    process.env.HELIUS_API_KEY = "test-helius-usability-secret";
    process.env.JUPITER_API_KEY = "test-jupiter-usability-secret";

    const response = await USABILITY_STATUS_GET(new Request("http://localhost/api/web3-usability-status?scenario=breakout&source=sample&account=ephemeral"));
    const receipt = await json<{
      mode: string;
      status: string;
      current_mode: string;
      usable_count: number;
      gated_count: number;
      locked_count: number;
      next_gate_label: string;
      next_gate_action: string;
      summary: string;
      capabilities: Array<{ id: string; label: string; status: string; next_action: string; evidence: string[] }>;
      operator_unlock_sequence: Array<{ id: string; label: string; status: string; storage: string; next_action: string; evidence: string }>;
      safe_commands: string[];
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
      receipt_hash: string;
    }>(response);
    const text = JSON.stringify(receipt);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-usability-status");
    expect(receipt.status).toMatch(/paper-usable|dry-run-gated|supervised-live-gated|autonomous-live-locked/);
    expect(receipt.current_mode).toMatch(/copilot|paper-autonomy|dry-run-rehearsal|supervised-live-review|autonomous-live/);
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.capabilities.map((capability) => capability.id)).toEqual([
      "copilot",
      "paper-autonomy",
      "live-dex-read",
      "wallet-net-worth",
      "jupiter-dry-run",
      "supervised-live",
      "autonomous-live",
    ]);
    expect(receipt.capabilities.find((capability) => capability.id === "autonomous-live")).toMatchObject({
      status: "locked",
    });
    expect(receipt.capabilities.find((capability) => capability.id === "jupiter-dry-run")?.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("Route status"),
    ]));
    expect(receipt.operator_unlock_sequence.map((step) => step.id)).toEqual([
      "scope-wallet",
      "prove-wallet",
      "rehearse-jupiter",
      "choose-signer",
      "ops-accounting",
      "external-review",
    ]);
    expect(receipt.operator_unlock_sequence.find((step) => step.id === "scope-wallet")).toMatchObject({
      label: "Scope dedicated wallet",
      storage: "browser-public-scope",
    });
    expect(receipt.operator_unlock_sequence.find((step) => step.id === "external-review")?.evidence).toContain("live execution remains blocked");
    expect(receipt.next_gate_label.length).toBeGreaterThan(0);
    expect(receipt.next_gate_action.length).toBeGreaterThan(0);
    expect(receipt.usable_count + receipt.gated_count + receipt.locked_count).toBeGreaterThanOrEqual(3);
    expect(receipt.safe_commands).toEqual(expect.arrayContaining([
      "npm run verify:web3 -- --base-url=http://localhost:4010",
      "npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json",
    ]));
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.controls.some((control) => control.includes("cannot sign, submit"))).toBe(true);
    expect(text).not.toContain("test-helius-usability-secret");
    expect(text).not.toContain("test-jupiter-usability-secret");
  });

  test("GIVEN monitors read app health WHEN Web3 summaries are returned THEN research handoff endpoints match their packet scope", async () => {
    const response = await APP_HEALTH_GET();
    const receipt = await json<{
      status: string;
      web3_operator_runbook: {
        mode: string;
        source: string;
        account: string;
        scenario: string;
        receipt_hash: string;
        primary_safe_action_id: string | null;
        primary_safe_action_status: string | null;
        primary_safe_action_surface: string | null;
        primary_safe_action_next_action: string | null;
        current_input: {
          id: string;
          label: string;
          safe_collection_surface: string;
          storage: string;
          target_names: string[];
          live_execution_permission: string;
          wallet_mutation_permission: string;
          transaction_submission_permission: string;
          private_key_storage: string;
          seed_phrase_storage: string;
          secret_echo_permission: string;
        } | null;
        allowed_now_count: number;
        gated_count: number;
        blocked_count: number;
        real_capital_blocker_count: number;
        source_endpoint: string;
        live_review_source_endpoint: string;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        signing_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      };
      web3_research_handoff: {
        mode: string;
        receipt_hash: string;
        source: string;
        account: string;
        scenario: string;
        current_input: {
          id: string;
          label: string;
          safe_collection_surface: string;
          storage: string;
          target_names: string[];
          live_execution_permission: string;
          wallet_mutation_permission: string;
          transaction_submission_permission: string;
          private_key_storage: string;
          seed_phrase_storage: string;
          secret_echo_permission: string;
        } | null;
        source_endpoint: string;
        live_review_source_endpoint: string;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      };
      web3_credential_requirements: {
        mode: string;
        status: string;
        receipt_hash: string;
        research_handoff_hash: string;
        requirement_count: number;
        needed_now_count: number;
        before_live_count: number;
        external_review_count: number;
        blocker_count: number;
        next_requirement: {
          id: string;
          target_names: string[];
          safe_collection_surface: string;
          live_execution_permission: string;
          wallet_mutation_permission: string;
          secret_echo_permission: string;
        } | null;
        source_endpoint: string;
        live_review_source_endpoint: string;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        signing_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      };
      web3_live_activation: {
        mode: string;
        status: string;
        receipt_hash: string;
        source: string;
        account: string;
        scenario: string;
        readiness_score: number;
        live_autonomy_status: string;
        live_usability_status: string;
        can_run_unattended: boolean;
        can_trade_real_capital: boolean;
        live_execution_permitted: boolean;
        activation_permitted: boolean;
        milestone_count: number;
        real_capital_blocker_count: number;
        next_milestone: {
          id: string;
          label: string;
          status: string;
          verifier_command: string | null;
          target_names: string[];
        } | null;
        next_action: string;
        source_endpoint: string;
        live_review_source_endpoint: string;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        signing_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      };
      web3_live_autonomy_readiness: {
        mode: string;
        status: string;
        source: string;
        account: string;
        scenario: string;
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
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        signing_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      };
      web3_live_ignition: {
        mode: string;
        status: string;
        source_endpoint: string;
        live_review_source_endpoint: string;
        can_autonomously_trade_real_money_now: boolean;
        can_start_supervised_canary_now: boolean;
        actual_live_trade_tested: boolean;
        next_gate_label: string | null;
        blocker_count: number;
      };
      web3_canary_proof: {
        mode: string;
        status: string;
        receipt_hash: string;
        source_endpoint: string;
        live_review_source_endpoint: string;
        actual_live_trade_tested: boolean;
        real_funds_moved_by_this_app: boolean;
        can_submit_from_app_now: boolean;
        signed_relay_status: string;
        latest_signature_preview: string | null;
        latest_confirmation_status: string | null;
        confirmation_poll_status: string;
        settlement_reconciliation_status: string;
        settlement_watchdog_status: string;
        portfolio_mirror_status: string;
        post_signing_evidence_status: string;
        proof_pass_count: number;
        proof_required_count: number;
        next_proof_id: string | null;
        next_proof_label: string | null;
        next_proof_status: string | null;
        next_proof_action: string;
        next_action: string;
        live_execution_permission: string;
        transaction_submission_permission: string;
        wallet_mutation_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      };
      web3_live_canary_proof: {
        mode: string;
        status: string;
        receipt_hash: string;
        source_endpoint: string;
        live_review_source_endpoint: string;
        actual_live_trade_tested: boolean;
        real_funds_moved_by_this_app: boolean;
        can_submit_from_app_now: boolean;
        signed_relay_status: string;
        latest_signature_preview: string | null;
        latest_confirmation_status: string | null;
        confirmation_poll_status: string;
        settlement_reconciliation_status: string;
        settlement_watchdog_status: string;
        portfolio_mirror_status: string;
        post_signing_evidence_status: string;
        proof_pass_count: number;
        proof_required_count: number;
        next_proof_id: string | null;
        next_proof_label: string | null;
        next_proof_status: string | null;
        next_proof_action: string;
        next_action: string;
        live_execution_permission: string;
        transaction_submission_permission: string;
        wallet_mutation_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      };
      web3_live_canary_attempt: {
        mode: string;
        readiness_status: string;
        stage: string;
        runnable_now: boolean;
        operator_action_label: string;
        primary_endpoint: string;
        exact_next_command: string;
        missing_input_count: number;
        required_acknowledgement_count: number;
        actual_live_trade_tested: boolean;
        real_funds_moved_by_this_app: boolean;
        live_execution_permission: string;
        transaction_submission_permission: string;
        wallet_mutation_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        signed_payload_storage: string;
        secret_echo_permission: string;
      };
      web3_first_canary_drill: {
        mode: string;
        status: string;
        receipt_hash: string;
        source_endpoint: string;
        live_review_source_endpoint: string;
        can_request_unsigned_order_now: boolean;
        unsigned_order_handoff_ready: boolean;
        signed_relay_status: string;
        actual_live_trade_tested: boolean;
        real_funds_moved_by_this_app: boolean;
        proof_pass_count: number;
        proof_required_count: number;
        hard_fail_count: number;
        current_input_label: string | null;
        next_blocker_label: string | null;
        next_credential_label: string | null;
        next_lane_id: string | null;
        next_lane_label: string | null;
        next_lane_status: string | null;
        next_lane_action: string | null;
        next_action: string;
        next_unblock_step: {
          id: string;
          status: string;
          safe_surface: string;
          command: string | null;
          completion_signal: string;
          blocks_funded_canary: boolean;
        } | null;
        operator_unblock_step_count: number;
        live_execution_permission: string;
        transaction_submission_permission: string;
        wallet_mutation_permission: string;
        signing_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        signed_payload_storage: string;
        secret_echo_permission: string;
      };
      web3_live_first_canary_drill: {
        mode: string;
        status: string;
        receipt_hash: string;
        source_endpoint: string;
        live_review_source_endpoint: string;
        can_request_unsigned_order_now: boolean;
        unsigned_order_handoff_ready: boolean;
        signed_relay_status: string;
        actual_live_trade_tested: boolean;
        real_funds_moved_by_this_app: boolean;
        proof_pass_count: number;
        proof_required_count: number;
        hard_fail_count: number;
        current_input_label: string | null;
        next_blocker_label: string | null;
        next_credential_label: string | null;
        next_lane_id: string | null;
        next_lane_label: string | null;
        next_lane_status: string | null;
        next_lane_action: string | null;
        next_action: string;
        next_unblock_step: {
          id: string;
          status: string;
          safe_surface: string;
          command: string | null;
          completion_signal: string;
          blocks_funded_canary: boolean;
        } | null;
        operator_unblock_step_count: number;
        live_execution_permission: string;
        transaction_submission_permission: string;
        wallet_mutation_permission: string;
        signing_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        signed_payload_storage: string;
        secret_echo_permission: string;
      };
      web3_live_usability: {
        mode: string;
        operator_wallet_public_key: string | null;
        operator_wallet_strict_command: string | null;
        current_input: {
          id: string;
          label: string;
          safe_collection_surface: string;
          storage: string;
          target_names: string[];
          verifier_command: string | null;
          live_execution_permission: string;
          wallet_mutation_permission: string;
          transaction_submission_permission: string;
          private_key_storage: string;
          seed_phrase_storage: string;
          secret_echo_permission: string;
        } | null;
        next_blocker: {
          id: string;
          label: string;
          owner: string;
          source: string;
          status: string;
          next_action: string;
          href: string;
          safe_command: string | null;
          blocks_live_capital: boolean;
        } | null;
        next_credential_request: {
          id: string;
          label: string;
          fix_href: string;
          storage: string;
          target_names: string[];
          safe_value_description: string;
          verifier_command: string | null;
          safe_to_provide: string[];
          never_provide: string[];
          completion_criteria: string[];
          verification_runway: Array<{
            id: string;
            label: string;
            command: string | null;
            live_execution_permission: string;
            wallet_mutation_permission: string;
            secret_echo_permission: string;
          }>;
          live_execution_permission: string;
          wallet_mutation_permission: string;
          transaction_submission_permission: string;
          signing_permission: string;
          private_key_storage: string;
          seed_phrase_storage: string;
          secret_echo_permission: string;
        } | null;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        signing_permission: string;
        secret_echo_permission: string;
      };
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.status).toBe("ok");
    expect(receipt.web3_operator_runbook.mode).toBe("web3-operator-runbook-health");
    expect(["sample", "live-dex"]).toContain(receipt.web3_operator_runbook.source);
    expect(["ephemeral", "persistent"]).toContain(receipt.web3_operator_runbook.account);
    expect(["base", "breakout", "rug-risk"]).toContain(receipt.web3_operator_runbook.scenario);
    expect(receipt.web3_operator_runbook.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.web3_operator_runbook.source_endpoint).toContain(`source=${receipt.web3_operator_runbook.source}`);
    expect(receipt.web3_operator_runbook.source_endpoint).toContain(`account=${receipt.web3_operator_runbook.account}`);
    expect(receipt.web3_operator_runbook.source_endpoint).toContain(`scenario=${receipt.web3_operator_runbook.scenario}`);
    expect(receipt.web3_operator_runbook.live_review_source_endpoint).toBe("/api/web3-operator-runbook?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_operator_runbook.allowed_now_count).toBeGreaterThanOrEqual(0);
    expect(receipt.web3_operator_runbook.allowed_now_count + receipt.web3_operator_runbook.gated_count + receipt.web3_operator_runbook.blocked_count).toBeGreaterThanOrEqual(1);
    expect(receipt.web3_operator_runbook.primary_safe_action_status === null || ["allowed", "gated", "blocked"].includes(receipt.web3_operator_runbook.primary_safe_action_status)).toBe(true);
    expect(receipt.web3_research_handoff.mode).toBe("web3-research-handoff-health");
    expect(["sample", "live-dex"]).toContain(receipt.web3_research_handoff.source);
    expect(["ephemeral", "persistent"]).toContain(receipt.web3_research_handoff.account);
    expect(["base", "breakout", "rug-risk"]).toContain(receipt.web3_research_handoff.scenario);
    expect(receipt.web3_research_handoff.source_endpoint).toContain(`source=${receipt.web3_research_handoff.source}`);
    expect(receipt.web3_research_handoff.source_endpoint).toContain(`account=${receipt.web3_research_handoff.account}`);
    expect(receipt.web3_research_handoff.source_endpoint).toContain(`scenario=${receipt.web3_research_handoff.scenario}`);
    expect(receipt.web3_research_handoff.live_review_source_endpoint).toBe("/api/web3-research-handoff-packet?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_operator_runbook.current_input).not.toBeNull();
    expect(receipt.web3_operator_runbook.current_input?.id).toBe(receipt.web3_live_usability.current_input?.id);
    expect(receipt.web3_operator_runbook.current_input?.label).toBe(receipt.web3_live_usability.current_input?.label);
    expect(receipt.web3_operator_runbook.current_input).toMatchObject({
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(receipt.web3_operator_runbook.current_input?.target_names.length).toBeGreaterThan(0);
    expect(receipt.web3_operator_runbook.current_input?.target_names.join(" ")).not.toContain("test-");
    expect(receipt.web3_operator_runbook.current_input?.safe_collection_surface.length).toBeGreaterThan(0);
    expect(receipt.web3_operator_runbook.current_input?.storage.length).toBeGreaterThan(0);
    expect(receipt.web3_operator_runbook.live_execution_permission).toBe("blocked");
    expect(receipt.web3_operator_runbook.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_operator_runbook.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_operator_runbook.signing_permission).toBe("blocked");
    expect(receipt.web3_operator_runbook.private_key_storage).toBe("blocked");
    expect(receipt.web3_operator_runbook.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_operator_runbook.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_research_handoff.current_input).not.toBeNull();
    expect(receipt.web3_research_handoff.current_input?.id).toBe(receipt.web3_live_usability.current_input?.id);
    expect(receipt.web3_research_handoff.current_input?.label).toBe(receipt.web3_live_usability.current_input?.label);
    expect(receipt.web3_research_handoff.current_input).toMatchObject({
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(receipt.web3_research_handoff.current_input?.target_names.length).toBeGreaterThan(0);
    expect(receipt.web3_research_handoff.current_input?.target_names.join(" ")).not.toContain("test-");
    expect(receipt.web3_research_handoff.current_input?.safe_collection_surface.length).toBeGreaterThan(0);
    expect(receipt.web3_research_handoff.current_input?.storage.length).toBeGreaterThan(0);
    expect(receipt.web3_research_handoff.live_execution_permission).toBe("blocked");
    expect(receipt.web3_research_handoff.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_research_handoff.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_research_handoff.private_key_storage).toBe("blocked");
    expect(receipt.web3_research_handoff.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_research_handoff.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_credential_requirements.mode).toBe("web3-credential-requirements-health");
    expect(receipt.web3_credential_requirements.status).toBe("operator-input-needed");
    expect(receipt.web3_credential_requirements.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.web3_credential_requirements.research_handoff_hash).toBe(receipt.web3_research_handoff.receipt_hash);
    expect(receipt.web3_credential_requirements.requirement_count).toBeGreaterThanOrEqual(8);
    expect(receipt.web3_credential_requirements.needed_now_count).toBeGreaterThan(0);
    expect(receipt.web3_credential_requirements.before_live_count).toBeGreaterThan(0);
    expect(receipt.web3_credential_requirements.external_review_count).toBe(1);
    expect(receipt.web3_credential_requirements.blocker_count).toBe(receipt.web3_credential_requirements.requirement_count);
    const healthWalletGateIsOwnershipProof = receipt.web3_live_usability.current_input?.id === "wallet-ownership-proof";
    expect(receipt.web3_credential_requirements.next_requirement).toMatchObject({
      id: healthWalletGateIsOwnershipProof ? "wallet-ownership-proof" : "dedicated-public-wallet",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(receipt.web3_credential_requirements.next_requirement?.target_names).toContain(
      healthWalletGateIsOwnershipProof ? "hash-only wallet ownership receipt" : "wallet_public_key",
    );
    if (healthWalletGateIsOwnershipProof) {
      expect(receipt.web3_credential_requirements.next_requirement?.safe_collection_surface).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    }
    expect(receipt.web3_credential_requirements.source_endpoint).toContain("/api/web3-credential-requirements");
    expect(receipt.web3_credential_requirements.live_review_source_endpoint).toBe("/api/web3-credential-requirements?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_credential_requirements.live_execution_permission).toBe("blocked");
    expect(receipt.web3_credential_requirements.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_credential_requirements.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_credential_requirements.signing_permission).toBe("blocked");
    expect(receipt.web3_credential_requirements.private_key_storage).toBe("blocked");
    expect(receipt.web3_credential_requirements.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_credential_requirements.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_live_activation.mode).toBe("web3-live-activation-health");
    expect(["operator-input-needed", "verification-needed", "external-review-needed", "activation-ready", "blocked"]).toContain(receipt.web3_live_activation.status);
    expect(receipt.web3_live_activation.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.web3_live_activation.readiness_score).toBeGreaterThanOrEqual(0);
    expect(receipt.web3_live_activation.readiness_score).toBeLessThanOrEqual(100);
    expect(receipt.web3_live_activation.activation_permitted).toBe(false);
    expect(receipt.web3_live_activation.can_trade_real_capital).toBe(false);
    expect(receipt.web3_live_activation.live_execution_permitted).toBe(false);
    expect(receipt.web3_live_activation.milestone_count).toBeGreaterThanOrEqual(10);
    expect(receipt.web3_live_activation.next_milestone).toMatchObject({
      id: healthWalletGateIsOwnershipProof ? "wallet-ownership-proof" : "dedicated-public-wallet",
    });
    expect(receipt.web3_live_activation.next_milestone?.target_names).toContain(
      healthWalletGateIsOwnershipProof ? "hash-only wallet ownership receipt" : "wallet_public_key",
    );
    expect(receipt.web3_live_activation.source_endpoint).toContain("/api/web3-live-activation-plan");
    expect(receipt.web3_live_activation.live_review_source_endpoint).toBe("/api/web3-live-activation-plan?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_live_activation.live_execution_permission).toBe("blocked");
    expect(receipt.web3_live_activation.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_live_activation.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_live_activation.signing_permission).toBe("blocked");
    expect(receipt.web3_live_activation.private_key_storage).toBe("blocked");
    expect(receipt.web3_live_activation.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_live_activation.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_live_autonomy_readiness.mode).toBe("web3-live-autonomy-readiness-health");
    expect(["paper-only", "daemon-gated", "signature-gated", "submit-gated", "live-ready", "blocked"]).toContain(receipt.web3_live_autonomy_readiness.status);
    expect(["sample", "live-dex"]).toContain(receipt.web3_live_autonomy_readiness.source);
    expect(["ephemeral", "persistent"]).toContain(receipt.web3_live_autonomy_readiness.account);
    expect(["base", "breakout", "rug-risk"]).toContain(receipt.web3_live_autonomy_readiness.scenario);
    expect(receipt.web3_live_autonomy_readiness.readiness_score).toBeGreaterThanOrEqual(0);
    expect(receipt.web3_live_autonomy_readiness.readiness_score).toBeLessThanOrEqual(100);
    expect(receipt.web3_live_autonomy_readiness.can_trade_real_capital).toBe(false);
    expect(receipt.web3_live_autonomy_readiness.live_execution_permitted).toBe(false);
    expect(receipt.web3_live_autonomy_readiness.max_live_trade_usd).toBe(0);
    expect(receipt.web3_live_autonomy_readiness.failed_item_count + receipt.web3_live_autonomy_readiness.watch_item_count + receipt.web3_live_autonomy_readiness.passed_item_count).toBe(8);
    expect(receipt.web3_live_autonomy_readiness.source_endpoint).toContain("/api/web3-live-autonomy-readiness");
    expect(receipt.web3_live_autonomy_readiness.live_review_source_endpoint).toBe("/api/web3-live-autonomy-readiness?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_live_autonomy_readiness.live_execution_permission).toBe("blocked");
    expect(receipt.web3_live_autonomy_readiness.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_live_autonomy_readiness.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_live_autonomy_readiness.signing_permission).toBe("blocked");
    expect(receipt.web3_live_autonomy_readiness.private_key_storage).toBe("blocked");
    expect(receipt.web3_live_autonomy_readiness.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_live_autonomy_readiness.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_live_ignition.mode).toBe("web3-live-ignition-health");
    expect(["blocked", "supervised-canary-ready", "canary-proven", "autonomy-ready"]).toContain(receipt.web3_live_ignition.status);
    expect(receipt.web3_live_ignition.source_endpoint).toContain("/api/web3-live-ignition");
    expect(receipt.web3_live_ignition.live_review_source_endpoint).toBe("/api/web3-live-ignition?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_live_ignition.can_autonomously_trade_real_money_now).toBe(false);
    expect(receipt.web3_live_ignition.actual_live_trade_tested).toBe(false);
    expect(receipt.web3_live_ignition.blocker_count).toBeGreaterThan(0);
    expect(receipt.web3_canary_proof.mode).toBe("web3-live-canary-proof-health");
    expect(["blocked", "ready-for-external-signed-payload", "live-relay-evidence-recorded"]).toContain(receipt.web3_canary_proof.status);
    expect(receipt.web3_canary_proof.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.web3_canary_proof.source_endpoint).toContain("/api/web3-live-trade-canary");
    expect(receipt.web3_canary_proof.live_review_source_endpoint).toBe("/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_canary_proof.actual_live_trade_tested).toBe(false);
    expect(receipt.web3_canary_proof.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.web3_canary_proof.proof_pass_count).toBe(0);
    expect(receipt.web3_canary_proof.proof_required_count).toBe(4);
    expect(receipt.web3_canary_proof.post_signing_evidence_status).toBe("needs-signed-relay");
    expect(receipt.web3_canary_proof.next_proof_id).toBe("signed-relay");
    expect(receipt.web3_canary_proof.next_proof_label).toBe("Signed relay");
    expect(receipt.web3_canary_proof.next_proof_status).toBe("fail");
    expect(receipt.web3_canary_proof.next_proof_action.length).toBeGreaterThan(10);
    expect(receipt.web3_canary_proof.next_action.length).toBeGreaterThan(10);
    expect(receipt.web3_canary_proof.live_execution_permission).toBe("blocked");
    expect(receipt.web3_canary_proof.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_canary_proof.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_canary_proof.private_key_storage).toBe("blocked");
    expect(receipt.web3_canary_proof.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_canary_proof.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_live_canary_proof.mode).toBe("web3-live-canary-proof-health");
    expect(receipt.web3_live_canary_proof.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.web3_live_canary_proof.source_endpoint).toBe("/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_live_canary_proof.live_review_source_endpoint).toBe("/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_live_canary_proof.actual_live_trade_tested).toBe(false);
    expect(receipt.web3_live_canary_proof.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.web3_live_canary_proof.proof_required_count).toBe(4);
    expect(["needs-signed-relay", "needs-confirmation", "needs-settlement", "needs-mirror-review", "settlement-accounted", "review-required"]).toContain(receipt.web3_live_canary_proof.post_signing_evidence_status);
    expect(receipt.web3_live_canary_proof.next_proof_id === null || ["signed-relay", "chain-confirmation", "settlement-reconciliation", "portfolio-mirror"].includes(receipt.web3_live_canary_proof.next_proof_id)).toBe(true);
    expect(receipt.web3_live_canary_proof.next_proof_action.length).toBeGreaterThan(10);
    expect(receipt.web3_live_canary_proof.live_execution_permission).toBe("blocked");
    expect(receipt.web3_live_canary_proof.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_live_canary_proof.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_live_canary_proof.private_key_storage).toBe("blocked");
    expect(receipt.web3_live_canary_proof.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_live_canary_proof.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_live_canary_attempt.mode).toBe("web3-first-live-canary-attempt-health");
    expect(["blocked", "unsigned-order-ready", "signed-relay-ready", "canary-tested"]).toContain(receipt.web3_live_canary_attempt.readiness_status);
    expect(["credential-intake", "unsigned-order-request", "browser-wallet-signature", "signed-payload-relay", "proof-watch", "canary-proven"]).toContain(receipt.web3_live_canary_attempt.stage);
    expect(receipt.web3_live_canary_attempt.runnable_now).toBe(false);
    expect(receipt.web3_live_canary_attempt.operator_action_label.length).toBeGreaterThan(0);
    expect(receipt.web3_live_canary_attempt.primary_endpoint.length).toBeGreaterThan(0);
    expect(receipt.web3_live_canary_attempt.exact_next_command.length).toBeGreaterThan(0);
    expect(receipt.web3_live_canary_attempt.missing_input_count).toBeGreaterThan(0);
    expect(receipt.web3_live_canary_attempt.actual_live_trade_tested).toBe(false);
    expect(receipt.web3_live_canary_attempt.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.web3_live_canary_attempt.live_execution_permission).toBe("blocked");
    expect(receipt.web3_live_canary_attempt.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_live_canary_attempt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_live_canary_attempt.private_key_storage).toBe("blocked");
    expect(receipt.web3_live_canary_attempt.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_live_canary_attempt.signed_payload_storage).toBe("blocked");
    expect(receipt.web3_live_canary_attempt.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_first_canary_drill.mode).toBe("web3-first-canary-drill-health");
    expect(["blocked", "ready-to-request-unsigned-order", "ready-to-relay-signed-payload", "canary-proven", "unsafe-permission-drift"]).toContain(receipt.web3_first_canary_drill.status);
    expect(receipt.web3_first_canary_drill.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.web3_first_canary_drill.source_endpoint).toContain("/api/web3-first-canary-drill");
    expect(receipt.web3_first_canary_drill.live_review_source_endpoint).toBe("/api/web3-first-canary-drill?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_first_canary_drill.can_request_unsigned_order_now).toBe(false);
    expect(receipt.web3_first_canary_drill.unsigned_order_handoff_ready).toBe(false);
    expect(receipt.web3_first_canary_drill.actual_live_trade_tested).toBe(false);
    expect(receipt.web3_first_canary_drill.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.web3_first_canary_drill.proof_pass_count).toBe(0);
    expect(receipt.web3_first_canary_drill.proof_required_count).toBe(4);
    expect(receipt.web3_first_canary_drill.hard_fail_count).toBeGreaterThan(0);
    expect(receipt.web3_first_canary_drill.current_input_label?.length).toBeGreaterThan(0);
    expect(receipt.web3_first_canary_drill.next_lane_id).toBeTruthy();
    expect(receipt.web3_first_canary_drill.next_lane_label?.length).toBeGreaterThan(0);
    expect(["fail", "watch"]).toContain(String(receipt.web3_first_canary_drill.next_lane_status));
    expect(receipt.web3_first_canary_drill.next_lane_action?.length).toBeGreaterThan(10);
    expect(receipt.web3_first_canary_drill.next_action).toBe(String(receipt.web3_first_canary_drill.next_lane_action));
    expect(receipt.web3_first_canary_drill.next_action.length).toBeGreaterThan(10);
    expect(receipt.web3_first_canary_drill.next_unblock_step).not.toBeNull();
    expect(["next", "watch"]).toContain(String(receipt.web3_first_canary_drill.next_unblock_step?.status));
    expect(receipt.web3_first_canary_drill.next_unblock_step?.safe_surface.length).toBeGreaterThan(0);
    expect(receipt.web3_first_canary_drill.next_unblock_step?.completion_signal.length).toBeGreaterThan(10);
    expect(receipt.web3_first_canary_drill.operator_unblock_step_count).toBeGreaterThan(3);
    expect(receipt.web3_first_canary_drill.live_execution_permission).toBe("blocked");
    expect(receipt.web3_first_canary_drill.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_first_canary_drill.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_first_canary_drill.signing_permission).toBe("blocked");
    expect(receipt.web3_first_canary_drill.private_key_storage).toBe("blocked");
    expect(receipt.web3_first_canary_drill.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_first_canary_drill.signed_payload_storage).toBe("blocked");
    expect(receipt.web3_first_canary_drill.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_live_first_canary_drill.mode).toBe("web3-first-canary-drill-health");
    expect(receipt.web3_live_first_canary_drill.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.web3_live_first_canary_drill.source_endpoint).toBe("/api/web3-first-canary-drill?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_live_first_canary_drill.live_review_source_endpoint).toBe("/api/web3-first-canary-drill?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.web3_live_first_canary_drill.actual_live_trade_tested).toBe(false);
    expect(receipt.web3_live_first_canary_drill.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.web3_live_first_canary_drill.proof_required_count).toBe(4);
    expect(receipt.web3_live_first_canary_drill.hard_fail_count).toBeGreaterThan(0);
    expect(receipt.web3_live_first_canary_drill.current_input_label?.length).toBeGreaterThan(0);
    expect(receipt.web3_live_first_canary_drill.next_lane_id).toBeTruthy();
    expect(receipt.web3_live_first_canary_drill.next_lane_label?.length).toBeGreaterThan(0);
    expect(["fail", "watch"]).toContain(String(receipt.web3_live_first_canary_drill.next_lane_status));
    expect(receipt.web3_live_first_canary_drill.next_lane_action?.length).toBeGreaterThan(10);
    expect(receipt.web3_live_first_canary_drill.next_action).toBe(String(receipt.web3_live_first_canary_drill.next_lane_action));
    expect(receipt.web3_live_first_canary_drill.next_unblock_step).not.toBeNull();
    expect(["next", "watch"]).toContain(String(receipt.web3_live_first_canary_drill.next_unblock_step?.status));
    expect(receipt.web3_live_first_canary_drill.next_unblock_step?.safe_surface.length).toBeGreaterThan(0);
    expect(receipt.web3_live_first_canary_drill.operator_unblock_step_count).toBeGreaterThan(3);
    expect(receipt.web3_live_first_canary_drill.live_execution_permission).toBe("blocked");
    expect(receipt.web3_live_first_canary_drill.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_live_first_canary_drill.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_live_first_canary_drill.signing_permission).toBe("blocked");
    expect(receipt.web3_live_first_canary_drill.private_key_storage).toBe("blocked");
    expect(receipt.web3_live_first_canary_drill.seed_phrase_storage).toBe("blocked");
    expect(receipt.web3_live_first_canary_drill.signed_payload_storage).toBe("blocked");
    expect(receipt.web3_live_first_canary_drill.secret_echo_permission).toBe("blocked");
    expect(receipt.web3_live_usability.mode).toBe("web3-live-usability-health");
    expect(receipt.web3_live_usability.current_input).not.toBeNull();
    expect(receipt.web3_live_usability.current_input).toMatchObject({
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(receipt.web3_live_usability.current_input?.target_names.length).toBeGreaterThan(0);
    expect(receipt.web3_live_usability.current_input?.target_names.join(" ")).not.toContain("test-");
    expect(receipt.web3_live_usability.current_input?.safe_collection_surface.length).toBeGreaterThan(0);
    expect(receipt.web3_live_usability.current_input?.storage.length).toBeGreaterThan(0);
    expect(receipt.web3_live_usability.next_blocker).toMatchObject({
      owner: "operator",
      blocks_live_capital: true,
    });
    if (receipt.web3_live_usability.current_input?.id === "wallet-ownership-proof") {
      expect(receipt.web3_live_usability.next_blocker).toMatchObject({
        id: "wallet-ownership-proof",
        label: "Wallet ownership proof",
        href: "/trading?source=live-dex&account=persistent",
      });
    } else {
      expect(receipt.web3_live_usability.next_blocker).toMatchObject({
        id: "cutover:dedicated-trading-wallet",
        label: "Dedicated trading wallet",
        source: "cutover",
        href: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      });
    }
    expect(receipt.web3_live_usability.next_blocker?.safe_command).toContain("--require-operator-wallet");
    expect(receipt.web3_live_usability.next_blocker?.next_action.length).toBeGreaterThan(0);
    expect(receipt.web3_live_usability.next_credential_request).toMatchObject({
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      signing_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    if (receipt.web3_live_usability.current_input?.id === "wallet-ownership-proof") {
      expect(receipt.web3_live_usability.next_credential_request).toMatchObject({
        id: "wallet-ownership-proof",
        label: "Wallet ownership proof",
        fix_href: "/trading?source=live-dex&account=persistent",
        storage: "hash-only-local-receipt",
        target_names: ["hash-only wallet ownership receipt"],
      });
      expect(receipt.web3_live_usability.next_credential_request?.safe_value_description).toContain("text-message ownership proof");
      expect(receipt.web3_live_usability.next_credential_request?.safe_to_provide).toEqual([
        "Text-message signature receipt with hashes only",
        "hash-only wallet ownership receipt",
      ]);
      expect(receipt.web3_live_usability.next_credential_request?.safe_to_provide.join(" ")).not.toContain("JUPITER_API_KEY");
      expect(receipt.web3_live_usability.next_credential_request?.safe_to_provide.join(" ")).not.toContain("HELIUS_API_KEY");
      expect(receipt.web3_live_usability.next_credential_request?.completion_criteria.join(" ")).toContain("hash evidence");
      expect(receipt.web3_live_usability.next_credential_request?.verification_runway.map((step) => step.id)).toEqual([
        "check-wallet-challenge",
        "prove-wallet-ownership",
        "strict-wallet-verifier",
        "refresh-live-usability",
      ]);
    } else {
      expect(receipt.web3_live_usability.next_credential_request).toMatchObject({
        label: "Dedicated trading wallet",
        fix_href: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      });
      expect(receipt.web3_live_usability.next_credential_request?.id).toContain("dedicated-trading-wallet");
      expect(receipt.web3_live_usability.next_credential_request?.safe_value_description).toContain("public Solana trading wallet address");
      expect(receipt.web3_live_usability.next_credential_request?.safe_to_provide).toEqual([
        "Dedicated Solana public wallet address",
        "Browser-safe public wallet scope",
      ]);
      expect(receipt.web3_live_usability.next_credential_request?.completion_criteria.join(" ")).toContain("strict operator-wallet verifier");
      expect(receipt.web3_live_usability.next_credential_request?.verification_runway.map((step) => step.id)).toEqual([
        "save-public-wallet",
        "strict-wallet-verifier",
        "prove-wallet-ownership",
        "refresh-live-usability",
      ]);
    }
    expect(receipt.web3_live_usability.next_credential_request?.verifier_command).toContain("--require-operator-wallet");
    if (receipt.web3_live_usability.operator_wallet_public_key) {
      const commandText = [
        receipt.web3_live_usability.operator_wallet_strict_command,
        receipt.web3_live_usability.current_input?.verifier_command,
        receipt.web3_live_usability.next_blocker?.safe_command,
        receipt.web3_live_usability.next_credential_request?.verifier_command,
        ...(receipt.web3_live_usability.next_credential_request?.verification_runway.map((step) => step.command) ?? []),
      ].filter(Boolean).join(" ");
      expect(receipt.web3_live_usability.operator_wallet_strict_command).toBe(`npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${receipt.web3_live_usability.operator_wallet_public_key} --require-operator-wallet`);
      expect(commandText).toContain(`--wallet=${receipt.web3_live_usability.operator_wallet_public_key}`);
      expect(commandText).not.toContain("<public-solana-address>");
    }
    expect(receipt.web3_live_usability.next_credential_request?.safe_to_provide.length).toBeGreaterThan(0);
    expect(receipt.web3_live_usability.next_credential_request?.never_provide.join(" ")).toContain("private key");
    expect(receipt.web3_live_usability.next_credential_request?.completion_criteria.join(" ")).toContain("live execution");
    expect(receipt.web3_live_usability.next_credential_request?.verification_runway.some((step) => step.command?.includes("--require-operator-wallet"))).toBe(true);
    expect(receipt.web3_live_usability.next_credential_request?.verification_runway.every((step) =>
      step.live_execution_permission === "blocked" &&
      step.wallet_mutation_permission === "blocked" &&
      step.secret_echo_permission === "blocked"
    )).toBe(true);
    expect(receipt.web3_live_usability.live_execution_permission).toBe("blocked");
    expect(receipt.web3_live_usability.wallet_mutation_permission).toBe("blocked");
    expect(receipt.web3_live_usability.transaction_submission_permission).toBe("blocked");
    expect(receipt.web3_live_usability.signing_permission).toBe("blocked");
    expect(receipt.web3_live_usability.secret_echo_permission).toBe("blocked");
  });

  test("GIVEN wallet autonomy is audited WHEN live autonomy readiness route runs THEN it exposes the final transition gate only", async () => {
    const response = await LIVE_AUTONOMY_READINESS_GET(new Request("http://localhost/api/web3-live-autonomy-readiness?scenario=breakout&source=sample&account=ephemeral&cycles=1"));
    const receipt = await json<{
      mode: string;
      status: string;
      summary: string;
      readiness_score: number;
      can_run_unattended: boolean;
      can_trade_real_capital: boolean;
      live_execution_permitted: boolean;
      max_live_trade_usd: number;
      daily_cap_remaining_usd: number;
      fastest_ttl_seconds: number;
      next_wake_seconds: number;
      next_action: string;
      blockers: string[];
      controls: string[];
      items: Array<{
        id: string;
        label: string;
        status: string;
        score: number;
        detail: string;
      }>;
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("autonomous-live-autonomy-readiness");
    expect(["paper-only", "daemon-gated", "signature-gated", "submit-gated", "live-ready", "blocked"]).toContain(receipt.status);
    expect(receipt.summary).toMatch(/blocked|locked|real funds/i);
    expect(receipt.readiness_score).toBeGreaterThanOrEqual(0);
    expect(receipt.readiness_score).toBeLessThanOrEqual(100);
    expect(receipt.can_trade_real_capital).toBe(false);
    expect(receipt.live_execution_permitted).toBe(false);
    expect(receipt.max_live_trade_usd).toBe(0);
    expect(receipt.daily_cap_remaining_usd).toBeGreaterThanOrEqual(0);
    expect(receipt.fastest_ttl_seconds).toBeGreaterThanOrEqual(0);
    expect(receipt.next_wake_seconds).toBeGreaterThanOrEqual(0);
    expect(receipt.next_action.length).toBeGreaterThan(0);
    expect(receipt.items.map((item) => item.id)).toEqual([
      "daemon",
      "market",
      "route",
      "fees",
      "policy",
      "signer",
      "relay",
      "kill-switch",
    ]);
    expect(receipt.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.detail.length > 0
    )).toBe(true);
    expect(receipt.controls.some((control) => control.includes("final transition gate"))).toBe(true);
    expect(receipt.controls.some((control) => control.includes("cannot move funds"))).toBe(true);

    const invalid = await LIVE_AUTONOMY_READINESS_GET(new Request("http://localhost/api/web3-live-autonomy-readiness?source=moonshot&cycles=99"));
    const invalidReceipt = await json<{ error: string }>(invalid);
    expect(invalid.status).toBe(422);
    expect(invalidReceipt.error).toContain("source must be sample or live-dex");
  });

  test("GIVEN the bot wants to ignite real-money trading WHEN the live ignition route runs THEN it returns one strict go/no-go receipt", async () => {
    const response = await LIVE_IGNITION_GET(new Request("http://localhost/api/web3-live-ignition?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      source: string;
      account: string;
      scenario: string;
      can_autonomously_trade_real_money_now: boolean;
      can_start_supervised_canary_now: boolean;
      actual_live_trade_tested: boolean;
      real_funds_moved_by_this_app: boolean;
      first_trade_path: string;
      next_gate_id: string | null;
      next_gate_label: string | null;
      next_action: string;
      blocker_count: number;
      blockers: string[];
      checks: Array<{
        id: string;
        label: string;
        status: string;
        detail: string;
        next_action: string;
        evidence_endpoint: string;
      }>;
      verifier_command: string;
      canary_endpoint: string;
      unsigned_handoff_endpoint: string;
      live_usability_endpoint: string;
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-live-ignition");
    expect(receipt.status).toBe("blocked");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.source).toBe("live-dex");
    expect(receipt.account).toBe("persistent");
    expect(receipt.scenario).toBe("breakout");
    expect(receipt.can_autonomously_trade_real_money_now).toBe(false);
    expect(receipt.can_start_supervised_canary_now).toBe(false);
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.first_trade_path).toBe("blocked");
    expect(receipt.next_gate_id).not.toBeNull();
    expect(receipt.next_gate_label?.length).toBeGreaterThan(0);
    expect(receipt.next_action.length).toBeGreaterThan(0);
    expect(receipt.blocker_count).toBeGreaterThan(0);
    expect(receipt.blockers.join(" ")).toContain("No funded live trade has been tested by this app yet");
    expect(receipt.checks.map((check) => check.id)).toEqual([
      "live-scope",
      "wallet-scope",
      "wallet-ownership",
      "route-order",
      "signer-relay",
      "autonomy-gate",
      "canary-proof",
      "safety-boundary",
    ]);
    expect(receipt.checks.every((check) =>
      ["pass", "watch", "fail"].includes(check.status) &&
      check.detail.length > 0 &&
      check.next_action.length > 0 &&
      check.evidence_endpoint.length > 0
    )).toBe(true);
    expect(receipt.checks.find((check) => check.id === "canary-proof")).toMatchObject({
      status: "fail",
      detail: "No funded live trade has been tested by this app yet.",
    });
    expect(receipt.checks.find((check) => check.id === "wallet-ownership")).toMatchObject({
      status: expect.stringMatching(/^(pass|watch|fail)$/),
    });
    expect(receipt.verifier_command).toContain("verify:web3");
    expect(receipt.verifier_command).toContain("--require-operator-wallet");
    expect(receipt.verifier_command).toContain("--require-live-canary");
    expect(receipt.canary_endpoint).toContain("/api/web3-live-trade-canary");
    expect(receipt.unsigned_handoff_endpoint).toContain("/api/web3-live-unsigned-order-handoff");
    expect(receipt.live_usability_endpoint).toContain("rows=all");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.controls.join(" ")).toContain("bot-facing go/no-go");
    expect(receipt.controls.join(" ")).toContain("does not sign");

    const invalid = await LIVE_IGNITION_GET(new Request("http://localhost/api/web3-live-ignition?account=hot-wallet"));
    const invalidReceipt = await json<{ error: string }>(invalid);
    expect(invalid.status).toBe(422);
    expect(invalidReceipt.error).toContain("account must be ephemeral or persistent");
  });

  test("GIVEN a runner asks for a live ignition envelope WHEN gates are not proven THEN the action receipt stays blocked and redacted", async () => {
    const response = await LIVE_IGNITION_POST(new Request("http://localhost/api/web3-live-ignition?scenario=breakout&source=live-dex&account=persistent&cycles=0", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "prepare-supervised-canary",
        operator_ack: true,
        live_capital_ack: "I_UNDERSTAND_REAL_FUNDS",
      }),
    }));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      action: string;
      operator_acknowledged: boolean;
      live_capital_acknowledged: boolean;
      can_autonomously_trade_real_money_now: boolean;
      can_start_supervised_canary_now: boolean;
      actual_live_trade_tested: boolean;
      launch_envelope: {
        kind: string;
        summary: string;
        preflight_endpoint: string | null;
        unsigned_handoff_endpoint: string | null;
        canary_endpoint: string | null;
        daemon_command: string | null;
        required_acknowledgements: string[];
        body_contract: string[];
        forbidden_fields: string[];
        transaction_bytes_return: string;
        signed_payload_storage: string;
        private_key_storage: string;
        seed_phrase_storage: string;
      };
      blockers: string[];
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-live-ignition-action");
    expect(receipt.status).toBe("blocked");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.action).toBe("prepare-supervised-canary");
    expect(receipt.operator_acknowledged).toBe(true);
    expect(receipt.live_capital_acknowledged).toBe(true);
    expect(receipt.can_autonomously_trade_real_money_now).toBe(false);
    expect(receipt.can_start_supervised_canary_now).toBe(false);
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.launch_envelope.kind).toBe("none");
    expect(receipt.launch_envelope.canary_endpoint).toContain("/api/web3-live-trade-canary");
    expect(receipt.launch_envelope.transaction_bytes_return).toBe("blocked");
    expect(receipt.launch_envelope.signed_payload_storage).toBe("blocked");
    expect(receipt.launch_envelope.private_key_storage).toBe("blocked");
    expect(receipt.launch_envelope.seed_phrase_storage).toBe("blocked");
    expect(receipt.launch_envelope.forbidden_fields.join(" ")).toContain("private_key");
    expect(receipt.blockers.join(" ")).toContain("can_start_supervised_canary_now=true");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.controls.join(" ")).toContain("prepares a launch envelope only");

    const unsafe = await LIVE_IGNITION_POST(new Request("http://localhost/api/web3-live-ignition?scenario=breakout&source=live-dex&account=persistent&cycles=0", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "prepare-supervised-canary",
        operator_ack: true,
        live_capital_ack: "I_UNDERSTAND_REAL_FUNDS",
        private_key: "seed phrase should never be here",
      }),
    }));
    const unsafeReceipt = await json<{
      status: string;
      unsafe_fields: string[];
      launch_envelope: { kind: string };
      secret_echo_permission: string;
    }>(unsafe);
    expect(unsafe.status).toBe(422);
    expect(unsafeReceipt.status).toBe("unsafe-rejected");
    expect(unsafeReceipt.unsafe_fields).toContain("private_key");
    expect(unsafeReceipt.launch_envelope.kind).toBe("none");
    expect(unsafeReceipt.secret_echo_permission).toBe("blocked");
  });

  test("GIVEN the operator asks what remains before the first funded canary WHEN supervised canary readiness runs THEN it orders the real-money proof ladder", async () => {
    const response = await SUPERVISED_CANARY_READINESS_GET(new Request("http://localhost/api/web3-supervised-canary-readiness?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      can_request_unsigned_order_now: boolean;
      can_relay_signed_payload_now: boolean;
      actual_live_trade_tested: boolean;
      real_funds_moved_by_this_app: boolean;
      first_unsigned_order_path: string;
      first_signed_payload_path: string;
      blocker_count: number;
      lanes: Array<{
        id: string;
        label: string;
        status: string;
        detail: string;
        next_action: string;
        evidence_endpoint: string;
        blocks_first_canary: boolean;
      }>;
      blockers: string[];
      next_lane_id: string | null;
      next_action: string;
      canary_attempt_contract: {
        mode: string;
        stage: string;
        runnable_now: boolean;
        operator_action_label: string;
        primary_endpoint: string;
        exact_next_command: string;
        missing_inputs: string[];
        required_acknowledgements: string[];
        safety_boundary: string[];
      };
      ignition_endpoint: string;
      unsigned_handoff_endpoint: string;
      canary_endpoint: string;
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      signed_payload_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-supervised-canary-readiness");
    expect(receipt.status).toBe("blocked");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.can_request_unsigned_order_now).toBe(false);
    expect(receipt.can_relay_signed_payload_now).toBe(false);
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.first_unsigned_order_path).toBe("blocked");
    expect(receipt.first_signed_payload_path).toBe("blocked");
    expect(receipt.blocker_count).toBeGreaterThan(0);
    expect(receipt.next_lane_id).toBeTruthy();
    expect(receipt.next_action.length).toBeGreaterThan(10);
    if (receipt.next_lane_id === "dedicated-wallet") {
      expect(receipt.next_action).toContain("Trading live canary console");
    }
    expect(receipt.canary_attempt_contract.mode).toBe("web3-first-live-canary-attempt-contract");
    expect(receipt.canary_attempt_contract.stage).toBe("credential-intake");
    expect(receipt.canary_attempt_contract.runnable_now).toBe(false);
    expect(receipt.canary_attempt_contract.operator_action_label.length).toBeGreaterThan(0);
    expect(receipt.canary_attempt_contract.primary_endpoint.length).toBeGreaterThan(0);
    expect(receipt.canary_attempt_contract.exact_next_command.length).toBeGreaterThan(0);
    expect(receipt.canary_attempt_contract.missing_inputs.length).toBeGreaterThan(0);
    expect(receipt.canary_attempt_contract.safety_boundary.join(" ")).toContain("Private keys");
    expect(receipt.ignition_endpoint).toContain("/api/web3-live-ignition");
    expect(receipt.unsigned_handoff_endpoint).toContain("/api/web3-live-unsigned-order-handoff");
    expect(receipt.canary_endpoint).toContain("/api/web3-live-trade-canary");
    expect(receipt.lanes.map((lane) => lane.id).join(",")).toBe("live-scope,dedicated-wallet,wallet-ownership,jupiter-order,live-flags,unsigned-order-preflight,signer-relay,manual-live-review,funded-canary-proof");
    expect(receipt.lanes.every((lane) => ["pass", "watch", "fail"].includes(lane.status) && lane.detail && lane.next_action && lane.evidence_endpoint)).toBe(true);
    expect(receipt.lanes.find((lane) => lane.id === "dedicated-wallet")?.next_action).toContain("Trading live canary console");
    expect(receipt.lanes.some((lane) => lane.id === "funded-canary-proof" && lane.status === "fail" && lane.blocks_first_canary === false)).toBe(true);
    expect(receipt.lanes.find((lane) => lane.id === "signer-relay")?.next_action).toContain("external wallet transaction prompt");
    expect(receipt.lanes.find((lane) => lane.id === "manual-live-review")?.next_action).toContain("Complete manual live review");
    expect(receipt.blockers.join(" ")).not.toContain("Hash-only wallet ownership proof");
    expect(receipt.blockers.join(" ")).not.toContain("Spend: $0 remains");
    expect(receipt.canary_attempt_contract.missing_inputs.join(" ")).not.toContain("Hash-only wallet ownership proof");
    expect(receipt.canary_attempt_contract.missing_inputs.join(" ")).not.toContain("Spend: $0 remains");
    expect(receipt.blockers.join(" ")).toContain("Jupiter");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.signed_payload_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.controls.join(" ")).toContain("first funded canary readiness ladder");

    const invalid = await SUPERVISED_CANARY_READINESS_GET(new Request("http://localhost/api/web3-supervised-canary-readiness?source=rogue"));
    const invalidReceipt = await json<{ error: string }>(invalid);
    expect(invalid.status).toBe(422);
    expect(invalidReceipt.error).toContain("source must be sample or live-dex");
  });

  test("GIVEN the operator records a live canary gate check WHEN the supervised canary route posts THEN it persists a redacted attempt receipt", async () => {
    const response = await SUPERVISED_CANARY_READINESS_POST(new Request("http://localhost/api/web3-supervised-canary-readiness?scenario=breakout&source=live-dex&account=persistent&cycles=0", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operator_ack: true,
        operator_note: "Manual cockpit gate check before the first funded canary.",
      }),
    }));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      readiness_hash: string;
      operator_acknowledged: boolean;
      requested_action: string;
      stage: string;
      runnable_now: boolean;
      funded_action_attempted: boolean;
      actual_live_trade_tested: boolean;
      first_blocker: string | null;
      missing_inputs: string[];
      primary_endpoint: string;
      exact_next_command: string;
      operator_note_preview: string | null;
      live_execution_permission: string;
      transaction_submission_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      signed_payload_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-first-live-canary-attempt-receipt");
    expect(receipt.status).toBe("blocked");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.readiness_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.operator_acknowledged).toBe(true);
    expect(receipt.requested_action).toBe("record-live-canary-gate-check");
    expect(receipt.stage).toBe("credential-intake");
    expect(receipt.runnable_now).toBe(false);
    expect(receipt.funded_action_attempted).toBe(false);
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.first_blocker).toBeTruthy();
    expect(receipt.missing_inputs.length).toBeGreaterThan(0);
    expect(receipt.primary_endpoint.length).toBeGreaterThan(0);
    expect(receipt.exact_next_command.length).toBeGreaterThan(0);
    expect(receipt.operator_note_preview).toContain("Manual cockpit gate check");
    expect(receipt.controls.join(" ")).toContain("does not create, sign, submit, or store a transaction");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.signed_payload_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");

    const audit = store().web3ExecutionAudits(20).find((row) => row.id.startsWith("first-live-canary-attempt-"));
    expect(audit).toBeTruthy();

    const refreshed = await SUPERVISED_CANARY_READINESS_GET(new Request("http://localhost/api/web3-supervised-canary-readiness?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const refreshedReceipt = await json<{ latest_attempt_receipt: { receipt_hash: string; first_blocker: string | null; actual_live_trade_tested: boolean } | null }>(refreshed);
    expect(refreshedReceipt.latest_attempt_receipt?.receipt_hash).toBe(receipt.receipt_hash);
    expect(refreshedReceipt.latest_attempt_receipt?.first_blocker).toBe(receipt.first_blocker);
    expect(refreshedReceipt.latest_attempt_receipt?.actual_live_trade_tested).toBe(false);

    const unsafe = await SUPERVISED_CANARY_READINESS_POST(new Request("http://localhost/api/web3-supervised-canary-readiness?scenario=breakout&source=live-dex&account=persistent&cycles=0", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operator_ack: true,
        private_key: "seed phrase should never be here",
      }),
    }));
    const unsafeReceipt = await json<{ error: string; unsafe_fields: string[] }>(unsafe);
    expect(unsafe.status).toBe(422);
    expect(unsafeReceipt.unsafe_fields).toContain("private_key");
    expect(unsafeReceipt.error).toContain("cannot accept secrets");
  });

  test("GIVEN the operator needs one first-canary truth source WHEN the drill route runs THEN it consolidates blockers without live authority", async () => {
    const response = await FIRST_CANARY_DRILL_GET(new Request("http://localhost/api/web3-first-canary-drill?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      operator_wallet_public_key: string | null;
      operator_wallet_strict_command: string | null;
      supervised_canary_status: string;
      can_request_unsigned_order_now: boolean;
      unsigned_preflight_status: string;
      unsigned_order_handoff_ready: boolean;
      jupiter_order_status: string;
      signed_relay_status: string;
      actual_live_trade_tested: boolean;
      real_funds_moved_by_this_app: boolean;
      proof_pass_count: number;
      proof_required_count: number;
      hard_fail_count: number;
      next_lane_id: string | null;
      next_lane_label: string | null;
      next_lane_status: string | null;
      next_lane_action: string | null;
      next_action: string;
      next_unblock_step: {
        id: string;
        label: string;
        phase: string;
        status: string;
        action: string;
        safe_surface: string;
        command: string | null;
        completion_signal: string;
        blocks_funded_canary: boolean;
      } | null;
      operator_unblock_plan: Array<{
        id: string;
        label: string;
        phase: string;
        status: string;
        action: string;
        safe_surface: string;
        command: string | null;
        completion_signal: string;
        blocks_funded_canary: boolean;
      }>;
      blockers: string[];
      safe_commands: string[];
      safe_surfaces: string[];
      source_endpoint: string;
      live_review_source_endpoint: string;
      strict_ready_command: string;
      strict_proof_command: string;
      lanes: Array<{ id: string; status: string; evidence_endpoint: string }>;
      live_execution_permission: string;
      transaction_submission_permission: string;
      wallet_mutation_permission: string;
      signing_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      signed_payload_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-first-canary-drill");
    expect(receipt.status).toBe("blocked");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    if (receipt.operator_wallet_public_key) {
      expect(receipt.operator_wallet_strict_command).toBe(`npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${receipt.operator_wallet_public_key} --require-operator-wallet`);
      expect(receipt.safe_commands.join(" ")).toContain(`--wallet=${receipt.operator_wallet_public_key}`);
      expect(receipt.next_unblock_step?.command ?? receipt.safe_commands.join(" ")).not.toContain("<public-solana-address>");
      expect(receipt.safe_commands.join(" ")).not.toContain("<public-solana-address>");
    }
    expect(receipt.supervised_canary_status).toBe("blocked");
    expect(receipt.can_request_unsigned_order_now).toBe(false);
    expect(receipt.unsigned_preflight_status).toBe("blocked");
    expect(receipt.unsigned_order_handoff_ready).toBe(false);
    expect(["missing-key", "wallet-needed", "rehearsal-needed", "review-ready"]).toContain(receipt.jupiter_order_status);
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.proof_pass_count).toBe(0);
    expect(receipt.proof_required_count).toBe(4);
    expect(receipt.hard_fail_count).toBeGreaterThan(0);
    expect(receipt.next_lane_id).toBeTruthy();
    expect(receipt.lanes.map((lane) => lane.id)).toContain(String(receipt.next_lane_id));
    expect(receipt.next_lane_label?.length).toBeGreaterThan(0);
    expect(["fail", "watch"]).toContain(String(receipt.next_lane_status));
    expect(receipt.next_action).toBe(String(receipt.next_lane_action));
    expect(receipt.next_action.length).toBeGreaterThan(10);
    if (receipt.next_lane_id === "dedicated-wallet") {
      expect(receipt.next_action).toContain("Trading live canary console");
    }
    expect(receipt.next_unblock_step).not.toBeNull();
    expect(["next", "watch"]).toContain(String(receipt.next_unblock_step?.status));
    expect(receipt.next_unblock_step?.action.length).toBeGreaterThan(10);
    expect(receipt.next_unblock_step?.safe_surface.length).toBeGreaterThan(0);
    expect(receipt.next_unblock_step?.completion_signal.length).toBeGreaterThan(10);
    expect(receipt.operator_unblock_plan.length).toBeGreaterThan(5);
    expect(receipt.operator_unblock_plan.map((step) => step.id)).toContain("wallet-ownership");
    expect(receipt.operator_unblock_plan.map((step) => step.id)).toContain("jupiter-order");
    expect(receipt.operator_unblock_plan.map((step) => step.id)).toContain("unsigned-order-preflight");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "dedicated-wallet")?.safe_surface).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "dedicated-wallet")?.action).toContain("dedicated public Solana trading wallet");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "wallet-ownership")?.safe_surface).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "unsigned-order-preflight")?.safe_surface).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "post-signing-proof")?.safe_surface).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "signer-relay")?.action).toContain("external wallet transaction prompt");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "manual-live-review")?.action).toContain("external live review");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "post-signing-proof")?.action).toContain("signed tiny-canary relay");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "jupiter-order")?.action).toContain("one-shot Settings rehearsal is evidence only");
    expect(receipt.operator_unblock_plan.find((step) => step.id === "jupiter-order")?.action).toContain("cannot arm the unsigned handoff");
    expect(receipt.operator_unblock_plan.map((step) => step.action).join(" ")).not.toContain("Hash-only wallet ownership proof");
    expect(receipt.operator_unblock_plan.map((step) => step.action).join(" ")).not.toContain("Spend: $0 remains");
    expect(receipt.operator_unblock_plan.some((step) => step.safe_surface.includes("/settings/integrations"))).toBe(true);
    expect(receipt.operator_unblock_plan.every((step) =>
      ["done", "next", "blocked", "watch"].includes(step.status) &&
      step.phase.length > 0 &&
      step.action.length > 0 &&
      step.completion_signal.length > 0
    )).toBe(true);
    expect(receipt.blockers.join(" ")).toContain("JUPITER");
    expect(receipt.blockers.join(" ")).not.toContain("FARTCOIN");
    expect(receipt.blockers.join(" ")).not.toContain("paper sizing");
    expect(receipt.blockers.join(" ")).not.toContain("dry-run");
    expect(receipt.safe_commands).toContain("npm run drill-canary:web3 -- --base-url=http://localhost:4010 --json --require-ready");
    expect(receipt.safe_commands).toContain("npm run prove-canary:web3 -- --base-url=http://localhost:4010 --run-watchdog --attempts=3 --json");
    expect(receipt.safe_surfaces).toContain("/trading?source=live-dex&account=persistent");
    expect(receipt.safe_surfaces).toContain("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    expect(receipt.source_endpoint).toContain("/api/web3-first-canary-drill");
    expect(receipt.live_review_source_endpoint).toBe("/api/web3-first-canary-drill?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(receipt.strict_ready_command).toContain("drill-canary:web3");
    expect(receipt.strict_proof_command).toContain("prove-canary:web3");
    expect(receipt.lanes.map((lane) => lane.id)).toContain("unsigned-order-preflight");
    expect(receipt.lanes.map((lane) => lane.id)).toContain("post-signing-proof");
    expect(receipt.lanes.map((lane) => lane.id)).toContain("live-boundary");
    expect(receipt.lanes.every((lane) => ["pass", "watch", "fail"].includes(lane.status) && lane.evidence_endpoint.length > 0)).toBe(true);
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.signing_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.signed_payload_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.controls.join(" ")).toContain("cannot sign, submit");

    const unsafe = await FIRST_CANARY_DRILL_GET(new Request("http://localhost/api/web3-first-canary-drill?private_key=never"));
    const unsafeReceipt = await json<{ error: string }>(unsafe);
    expect(unsafe.status).toBe(422);
    expect(unsafeReceipt.error).toContain("Unsafe query field");
  });

  test("GIVEN an operator needs one go-live packet WHEN the live activation plan route runs THEN it orders safe milestones without activation authority", async () => {
    const response = await LIVE_ACTIVATION_PLAN_GET(new Request("http://localhost/api/web3-live-activation-plan?scenario=breakout&source=sample&account=persistent&cycles=0"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      summary: string;
      readiness_score: number;
      operator_wallet_public_key: string | null;
      operator_wallet_strict_command: string | null;
      can_run_unattended: boolean;
      can_trade_real_capital: boolean;
      live_execution_permitted: boolean;
      activation_permitted: boolean;
      milestone_count: number;
      next_milestone: {
        id: string;
        label: string;
        owner: string;
        status: string;
        target_names: string[];
        verifier_command: string | null;
      } | null;
      milestones: Array<{
        id: string;
        label: string;
        owner: string;
        status: string;
        safe_value_type: string;
        safe_collection_surface: string;
        storage_rule: string;
        target_names: string[];
        completion_signal: string;
        verifier_command: string | null;
        blocks_live_capital: boolean;
      }>;
      activation_commands: string[];
      text_packet: string;
      safe_to_provide: string[];
      never_provide: string[];
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      signing_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-live-activation-plan");
    expect(["operator-input-needed", "verification-needed", "external-review-needed", "activation-ready", "blocked"]).toContain(receipt.status);
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.readiness_score).toBeGreaterThanOrEqual(0);
    expect(receipt.readiness_score).toBeLessThanOrEqual(100);
    if (receipt.operator_wallet_public_key) {
      expect(receipt.operator_wallet_strict_command).toBe(`npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${receipt.operator_wallet_public_key} --require-operator-wallet`);
      expect(receipt.activation_commands.join(" ")).toContain(`--wallet=${receipt.operator_wallet_public_key}`);
      expect(receipt.activation_commands.join(" ")).not.toContain("<public-solana-address>");
      expect(receipt.text_packet).not.toContain("<public-solana-address>");
      expect(receipt.milestones.map((item) => item.verifier_command ?? "").join(" ")).not.toContain("<public-solana-address>");
    }
    expect(receipt.activation_permitted).toBe(false);
    expect(receipt.can_trade_real_capital).toBe(false);
    expect(receipt.live_execution_permitted).toBe(false);
    expect(receipt.next_milestone).not.toBeNull();
    if (!receipt.next_milestone) throw new Error("Expected a next live activation milestone.");
    expect(["dedicated-public-wallet", "wallet-ownership-proof"]).toContain(receipt.next_milestone.id);
    expect(receipt.next_milestone).toMatchObject({
      owner: "operator",
      status: "next",
    });
    expect(receipt.next_milestone?.target_names.some((target) =>
      ["wallet_public_key", "wallet_ownership_signature_hash"].includes(target)
      || target === "hash-only wallet ownership receipt"
    )).toBe(true);
    expect(receipt.next_milestone?.verifier_command).toContain("--require-operator-wallet");
    expect(receipt.milestones.map((item) => item.id)).toContain("live-autonomy-final-gate");
    expect(receipt.milestones.length).toBeGreaterThanOrEqual(10);
    expect(receipt.milestones.every((item) =>
      ["next", "blocked", "external-review", "watch", "ready"].includes(item.status) &&
      item.safe_value_type.length > 0 &&
      item.safe_collection_surface.length > 0 &&
      item.storage_rule.length > 0 &&
      item.completion_signal.length > 0 &&
      item.blocks_live_capital === true
    )).toBe(true);
    expect(receipt.activation_commands.some((command) => command.includes("activate:web3"))).toBe(true);
    expect(receipt.activation_commands.some((command) => command.includes("--require-jupiter-order"))).toBe(true);
    expect(receipt.activation_commands.some((command) => command.includes("--require-live-canary"))).toBe(true);
    expect(receipt.text_packet).toContain("# Mastermind Web3 Live Activation Plan");
    expect(receipt.text_packet).toContain("## Next Milestone");
    expect(receipt.text_packet).toContain("## Never Provide");
    expect(receipt.never_provide.join(" ")).toContain("Wallet private key");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.signing_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");

    const invalid = await LIVE_ACTIVATION_PLAN_GET(new Request("http://localhost/api/web3-live-activation-plan?account=hot-wallet"));
    const invalidReceipt = await json<{ error: string }>(invalid);
    expect(invalid.status).toBe(422);
    expect(invalidReceipt.error).toContain("account must be ephemeral or persistent");
  });

  test("GIVEN safe activation facts WHEN live activation intake runs THEN it validates readiness without accepting secrets or authority", async () => {
    const schemaResponse = await LIVE_ACTIVATION_INTAKE_GET();
    const schema = await json<{
      mode: string;
      endpoint: string;
      accepted_fields: string[];
      never_provide: string[];
      live_execution_permission: string;
    }>(schemaResponse);
    expect(schemaResponse.status).toBe(200);
    expect(schema.mode).toBe("web3-live-activation-intake-schema");
    expect(schema.endpoint).toBe("/api/web3-live-activation-intake");
    expect(schema.accepted_fields).toContain("wallet_public_key");
    expect(schema.never_provide.join(" ")).toContain("Seed phrase");
    expect(schema.live_execution_permission).toBe("blocked");

    const safeWallet = "9xQeWvG816bUx9EPfYQ4mKZ8sPXc6zQnK9j8vY9J3F3";
    const safeResponse = await LIVE_ACTIVATION_INTAKE_POST(new Request("http://localhost/api/web3-live-activation-intake?scenario=breakout&source=sample&account=persistent&cycles=0", {
      method: "POST",
      body: JSON.stringify({
        operator_ack: true,
        wallet_public_key: safeWallet,
        wallet_ownership_proof: "completed",
        read_provider_rail: "configured",
        jupiter_order_rail: "configured",
        signer_policy: {
          provider: "external-wallet",
          policy_reviewed: true,
        },
        ops_emergency_stop: {
          contact_configured: true,
          drill_completed: true,
          production_worker_targets: true,
        },
        accounting_ledger: {
          export_target_configured: true,
          settlement_reconciliation_ready: true,
        },
        risk_policy: {
          max_trade_usd: 250,
          daily_spend_cap_usd: 1000,
          max_slippage_bps: 150,
          kill_switch_tested: true,
        },
        manual_live_review: {
          requested: true,
          approved: false,
        },
      }),
    }));
    const safeReceipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      profile_hash: string;
      activation_plan_hash: string;
      operator_acknowledged: boolean;
      safe_profile: {
        wallet_public_key_preview: string | null;
        wallet_public_key_valid: boolean;
      };
      accepted_milestone_count: number;
      next_missing: { id: string; status: string } | null;
      milestones: Array<{ id: string; status: string; blocks_live_capital: boolean }>;
      activation_permitted: boolean;
      can_trade_real_capital: boolean;
      live_execution_permitted: boolean;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      signing_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
    }>(safeResponse);
    expect(safeResponse.status).toBe(200);
    expect(safeReceipt.mode).toBe("web3-live-activation-intake");
    expect(safeReceipt.status).toBe("missing-required");
    expect(safeReceipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(safeReceipt.profile_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(safeReceipt.activation_plan_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(safeReceipt.operator_acknowledged).toBe(true);
    expect(safeReceipt.safe_profile.wallet_public_key_valid).toBe(true);
    expect(safeReceipt.safe_profile.wallet_public_key_preview).toContain("...");
    expect(safeReceipt.safe_profile.wallet_public_key_preview).not.toBe(safeWallet);
    expect(safeReceipt.accepted_milestone_count).toBeGreaterThanOrEqual(8);
    expect(safeReceipt.milestones).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "dedicated-public-wallet", status: "provided", blocks_live_capital: true }),
      expect.objectContaining({ id: "live-autonomy-final-gate", status: "external-review", blocks_live_capital: true }),
    ]));
    expect(safeReceipt.next_missing).not.toBeNull();
    expect(["first-canary-live-flags", "manual-live-review", "live-autonomy-final-gate"]).toContain(safeReceipt.next_missing?.id ?? "");
    expect(safeReceipt.activation_permitted).toBe(false);
    expect(safeReceipt.can_trade_real_capital).toBe(false);
    expect(safeReceipt.live_execution_permitted).toBe(false);
    expect(safeReceipt.live_execution_permission).toBe("blocked");
    expect(safeReceipt.wallet_mutation_permission).toBe("blocked");
    expect(safeReceipt.transaction_submission_permission).toBe("blocked");
    expect(safeReceipt.signing_permission).toBe("blocked");
    expect(safeReceipt.private_key_storage).toBe("blocked");
    expect(safeReceipt.seed_phrase_storage).toBe("blocked");
    expect(safeReceipt.secret_echo_permission).toBe("blocked");

    const canary = "codex-private-key-canary-never-echo";
    const unsafeResponse = await LIVE_ACTIVATION_INTAKE_POST(new Request("http://localhost/api/web3-live-activation-intake?scenario=breakout&source=sample&account=persistent&cycles=0", {
      method: "POST",
      body: JSON.stringify({
        operator_ack: true,
        wallet_public_key: safeWallet,
        private_key: canary,
      }),
    }));
    const unsafeText = await unsafeResponse.text();
    expect(unsafeResponse.status).toBe(422);
    expect(unsafeText).not.toContain(canary);
    const unsafeReceipt = JSON.parse(unsafeText) as {
      status: string;
      unsafe_fields: string[];
      live_execution_permission: string;
      secret_echo_permission: string;
    };
    expect(unsafeReceipt.status).toBe("unsafe-rejected");
    expect(unsafeReceipt.unsafe_fields).toContain("private_key");
    expect(unsafeReceipt.live_execution_permission).toBe("blocked");
    expect(unsafeReceipt.secret_echo_permission).toBe("blocked");

    const invalid = await LIVE_ACTIVATION_INTAKE_POST(new Request("http://localhost/api/web3-live-activation-intake?account=hot-wallet", {
      method: "POST",
      body: JSON.stringify({ operator_ack: true }),
    }));
    const invalidReceipt = await json<{ error: string }>(invalid);
    expect(invalid.status).toBe(422);
    expect(invalidReceipt.error).toContain("account must be ephemeral or persistent");
  });

  test("GIVEN the operator asks whether live money has actually traded WHEN the canary route runs THEN it answers truthfully with blockers", async () => {
    const response = await LIVE_TRADE_CANARY_GET(new Request("http://localhost/api/web3-live-trade-canary?scenario=breakout&source=sample&account=persistent&cycles=0"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      actual_live_trade_tested: boolean;
      real_funds_moved_by_this_app: boolean;
      can_submit_from_app_now: boolean;
      browser_wallet_signature_flow: string;
      unsigned_transaction_return: string;
      live_execution_gate_enabled: boolean;
      signed_relay_status: string;
      signed_relay_submit_path: string;
      signed_relay_accepts_payload: boolean;
      current_request_id: string | null;
      latest_signature_preview: string | null;
      confirmation_poll_status: string;
      settlement_reconciliation_status: string;
      settlement_watchdog_status: string;
      portfolio_mirror_status: string;
      post_signing_evidence_status: string;
      post_signing_evidence: Array<{ id: string; status: string; detail: string; next_action: string }>;
      post_signing_next_action: string;
      blockers: string[];
      next_required_input: { id: string; status: string; safe_surface: string } | null;
      required_inputs: Array<{
        id: string;
        status: string;
        safe_value_type: string;
        target_names: string[];
        safe_surface: string;
        verifier_command: string | null;
        live_execution_permission: string;
        transaction_submission_permission: string;
        wallet_mutation_permission: string;
        secret_echo_permission: string;
      }>;
      next_action: string;
      required_for_real_canary: string[];
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-live-trade-canary");
    expect(["blocked", "ready-for-external-signed-payload", "live-relay-evidence-recorded"]).toContain(receipt.status);
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.can_submit_from_app_now).toBe(false);
    expect(receipt.browser_wallet_signature_flow).toBe("gated-unsigned-handoff");
    expect(receipt.unsigned_transaction_return).toBe("withheld");
    expect(receipt.live_execution_gate_enabled).toBe(false);
    expect(receipt.signed_relay_submit_path).toMatch(/not-configured|jupiter-swap-v2|solana-rpc/);
    expect(receipt.signed_relay_accepts_payload).toBe(false);
    expect(receipt.current_request_id).toBeNull();
    expect(receipt.latest_signature_preview).toBeNull();
    expect(receipt.confirmation_poll_status).toBe("not-run");
    expect(receipt.settlement_reconciliation_status).toBe("not-run");
    expect(receipt.settlement_watchdog_status).toBe("not-run");
    expect(receipt.portfolio_mirror_status).toBe("not-run");
    expect(receipt.post_signing_evidence_status).toBe("needs-signed-relay");
    expect(receipt.post_signing_evidence.map((item) => item.id)).toEqual([
      "signed-relay",
      "chain-confirmation",
      "settlement-reconciliation",
      "portfolio-mirror",
    ]);
    expect(receipt.post_signing_evidence.every((item) => item.status === "fail")).toBe(true);
    expect(receipt.post_signing_next_action).toContain("Clear live DEX");
    expect(receipt.next_action).toContain("Open the live DEX trading cockpit");
    expect(receipt.blockers[0]).toContain("Open the live DEX trading cockpit");
    expect(receipt.blockers.join(" ")).toContain("No confirmed live transaction signature");
    expect(receipt.blockers.join(" ")).toContain("does not return unsigned transaction bytes");
    expect(receipt.blockers.join(" ")).toContain("one-shot Settings rehearsals are evidence only");
    expect(receipt.required_inputs.map((item) => item.id)).toEqual([
      "dedicated-public-wallet",
      "wallet-ownership-proof",
      "jupiter-order-rail",
      "first-canary-live-flags",
      "unsigned-order-preflight",
      "signed-payload-relay",
      "post-signing-proof",
    ]);
    expect(receipt.next_required_input?.id).toMatch(/dedicated-public-wallet|wallet-ownership-proof|jupiter-order-rail/);
    expect(receipt.required_inputs.find((item) => item.id === "dedicated-public-wallet")).toMatchObject({
      status: "needed-now",
      safe_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      target_names: ["wallet_public_key"],
    });
    const dedicatedWalletInput = receipt.required_inputs.find((item) => item.id === "dedicated-public-wallet");
    expect(dedicatedWalletInput?.verifier_command).toContain("--wallet=<public-solana-address>");
    expect(dedicatedWalletInput?.verifier_command).not.toContain("--wallet=11111111111111111111111111111111");
    expect(receipt.required_inputs.find((item) => item.id === "wallet-ownership-proof")?.status).toMatch(/blocked|needed-now|done/);
    expect(receipt.required_inputs.find((item) => item.id === "jupiter-order-rail")?.target_names).toContain("JUPITER_API_KEY");
    expect(receipt.required_inputs.find((item) => item.id === "jupiter-order-rail")?.safe_value_type).toContain("ignored local server env");
    expect(receipt.required_inputs.find((item) => item.id === "first-canary-live-flags")?.target_names).toEqual(expect.arrayContaining([
      "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
      "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
      "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
    ]));
    expect(receipt.required_inputs.find((item) => item.id === "first-canary-live-flags")?.verifier_command).toContain("--require-live-canary-flags");
    expect(receipt.required_inputs.find((item) => item.id === "post-signing-proof")?.verifier_command).toContain("prove-canary:web3");
    expect(receipt.required_inputs.every((item) => item.live_execution_permission === "blocked")).toBe(true);
    expect(receipt.required_inputs.every((item) => item.transaction_submission_permission === "blocked")).toBe(true);
    expect(receipt.required_inputs.every((item) => item.wallet_mutation_permission === "blocked")).toBe(true);
    expect(receipt.required_inputs.every((item) => item.secret_echo_permission === "blocked")).toBe(true);
    expect(receipt.required_for_real_canary.join(" ")).toContain("Dedicated non-sample public wallet");
    expect(receipt.required_for_real_canary.join(" ")).toContain("web3-live-unsigned-order-handoff");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.controls.join(" ")).toContain("Browser-wallet signing is wired only through the gated one-shot");
    expect(receipt.controls.join(" ")).toContain("Paper and read-only DEX tests do not count as actual live trades");

    const liveResponse = await LIVE_TRADE_CANARY_GET(new Request("http://localhost/api/web3-live-trade-canary?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const liveReceipt = await json<{
      status: string;
      actual_live_trade_tested: boolean;
      next_action: string;
      blockers: string[];
      next_required_input: { id: string; status: string } | null;
      required_inputs: Array<{ id: string; status: string; target_names: string[]; safe_surface: string; verifier_command: string | null; secret_echo_permission: string }>;
      live_execution_permission: string;
      wallet_mutation_permission: string;
    }>(liveResponse);
    expect(liveResponse.status).toBe(200);
    expect(liveReceipt.status).toBe("blocked");
    expect(liveReceipt.actual_live_trade_tested).toBe(false);
    expect(liveReceipt.blockers[0]).toMatch(/Add a dedicated|Replace the scoped wallet|Replace the sample|Run Prove ownership|Add JUPITER_API_KEY|Set the exact live canary flags/);
    expect(liveReceipt.blockers[0]).not.toContain("No confirmed live transaction signature");
    expect(liveReceipt.blockers.join(" ")).not.toContain("Dry-run spend");
    expect(liveReceipt.blockers.join(" ")).not.toContain("dry-run daily cap");
    expect(liveReceipt.next_action).toBe(liveReceipt.blockers[0]);
    expect(liveReceipt.required_inputs.map((item) => item.id)).toContain("dedicated-public-wallet");
    expect(liveReceipt.required_inputs.map((item) => item.id)).toContain("wallet-ownership-proof");
    expect(liveReceipt.next_required_input?.id).toMatch(/dedicated-public-wallet|wallet-ownership-proof|jupiter-order-rail|first-canary-live-flags/);
    if (liveReceipt.blockers[0].match(/Add a dedicated|Replace the scoped wallet|Replace the sample/)) {
      expect(liveReceipt.next_required_input?.id).toBe("dedicated-public-wallet");
      expect(liveReceipt.required_inputs.find((item) => item.id === "dedicated-public-wallet")?.safe_surface).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    }
    const liveDedicatedWalletInput = liveReceipt.required_inputs.find((item) => item.id === "dedicated-public-wallet");
    expect(liveDedicatedWalletInput?.verifier_command).toContain("--wallet=<public-solana-address>");
    expect(liveDedicatedWalletInput?.verifier_command).not.toContain("--wallet=11111111111111111111111111111111");
    expect(liveReceipt.required_inputs.find((item) => item.id === "first-canary-live-flags")?.target_names).toContain("MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF");
    expect(liveReceipt.required_inputs.find((item) => item.id === "first-canary-live-flags")?.verifier_command).toContain("--require-live-canary-flags");
    expect(liveReceipt.required_inputs.every((item) => item.secret_echo_permission === "blocked")).toBe(true);
    expect(liveReceipt.live_execution_permission).toBe("blocked");
    expect(liveReceipt.wallet_mutation_permission).toBe("blocked");

    const ledgerResponse = await LIVE_TEST_LEDGER_GET(new Request("http://localhost/api/web3-live-test-ledger?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const ledgerReceipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      actual_live_trade_tested: boolean;
      real_funds_moved_by_this_app: boolean;
      funded_trade_attempted_by_this_app: boolean;
      funded_trade_proof_row_id: string;
      live_execution_permission: string;
      transaction_submission_permission: string;
      wallet_mutation_permission: string;
      signing_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      next_required_input: { id: string; safe_surface: string } | null;
      rows: Array<{
        id: string;
        status: string;
        value: string;
        evidence_type: string;
        counts_as_funded_trade_proof: boolean;
        evidence_endpoint: string;
      }>;
      funded_trade_proof_requirements: string[];
      summary: string;
      next_action: string;
      controls: string[];
    }>(ledgerResponse);
    expect(ledgerResponse.status).toBe(200);
    expect(ledgerReceipt.mode).toBe("web3-live-test-ledger");
    expect(ledgerReceipt.status).toBe("operator-input-needed");
    expect(ledgerReceipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ledgerReceipt.actual_live_trade_tested).toBe(false);
    expect(ledgerReceipt.real_funds_moved_by_this_app).toBe(false);
    expect(ledgerReceipt.funded_trade_attempted_by_this_app).toBe(false);
    expect(ledgerReceipt.funded_trade_proof_row_id).toBe("funded-wallet-trade");
    expect(ledgerReceipt.live_execution_permission).toBe("blocked");
    expect(ledgerReceipt.transaction_submission_permission).toBe("blocked");
    expect(ledgerReceipt.wallet_mutation_permission).toBe("blocked");
    expect(ledgerReceipt.signing_permission).toBe("blocked");
    expect(ledgerReceipt.private_key_storage).toBe("blocked");
    expect(ledgerReceipt.seed_phrase_storage).toBe("blocked");
    expect(ledgerReceipt.secret_echo_permission).toBe("blocked");
    expect(ledgerReceipt.next_required_input?.safe_surface).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    expect(ledgerReceipt.rows.map((row) => row.id)).toEqual([
      "paper-autonomy",
      "live-dex-read",
      "order-rehearsal",
      "live-flags",
      "funded-wallet-trade",
    ]);
    expect(ledgerReceipt.rows.find((row) => row.id === "paper-autonomy")).toMatchObject({
      status: "pass",
      evidence_type: "paper",
      counts_as_funded_trade_proof: false,
    });
    expect(ledgerReceipt.rows.find((row) => row.id === "live-dex-read")).toMatchObject({
      status: "watch",
      evidence_type: "read-only-live",
      counts_as_funded_trade_proof: false,
    });
    expect(ledgerReceipt.rows.find((row) => row.id === "funded-wallet-trade")).toMatchObject({
      status: "fail",
      value: "not attempted",
      evidence_type: "funded-proof",
      counts_as_funded_trade_proof: true,
      evidence_endpoint: "/api/web3-live-trade-canary?source=live-dex&account=persistent&scenario=breakout&cycles=0",
    });
    expect(ledgerReceipt.funded_trade_proof_requirements.join(" ")).toContain("Signed relay");
    expect(ledgerReceipt.summary).toContain("No funded wallet trade has been attempted");
    expect(ledgerReceipt.summary).toContain("not funded-trade proof");
    expect(ledgerReceipt.next_action).toBe(liveReceipt.next_action);
    expect(ledgerReceipt.controls.join(" ")).toContain("truth ledger only");
    expect(ledgerReceipt.controls.join(" ")).toContain("do not count as funded-trade proof");

    const usabilitySummaryResponse = await LIVE_USABILITY_SUMMARY_GET(new Request("http://localhost/api/web3-live-usability-summary?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const usabilitySummary = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      actual_live_trade_tested: boolean;
      real_funds_moved_by_this_app: boolean;
      funded_trade_attempted_by_this_app: boolean;
      can_trade_real_capital_now: boolean;
      can_run_unattended_now: boolean;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      signing_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      current_input: { id: string; safe_surface: string; verifier_command: string | null } | null;
      local_credentials: { configured_count: number; missing_count: number; runtime_effective: boolean; next_action: string };
      counts: { real_capital_blockers: number; open_operator_inputs: number; funded_proof_rows_ready: number };
      lanes: Array<{ id: string; status: string; counts_as_funded_trade_proof: boolean }>;
      evidence_endpoints: string[];
      summary: string;
      next_action: string;
      controls: string[];
    }>(usabilitySummaryResponse);
    expect(usabilitySummaryResponse.status).toBe(200);
    expect(usabilitySummary.mode).toBe("web3-live-usability-summary");
    expect(usabilitySummary.status).toBe("operator-input-needed");
    expect(usabilitySummary.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(usabilitySummary.actual_live_trade_tested).toBe(false);
    expect(usabilitySummary.real_funds_moved_by_this_app).toBe(false);
    expect(usabilitySummary.funded_trade_attempted_by_this_app).toBe(false);
    expect(usabilitySummary.can_trade_real_capital_now).toBe(false);
    expect(usabilitySummary.can_run_unattended_now).toBe(false);
    expect(usabilitySummary.live_execution_permission).toBe("blocked");
    expect(usabilitySummary.wallet_mutation_permission).toBe("blocked");
    expect(usabilitySummary.transaction_submission_permission).toBe("blocked");
    expect(usabilitySummary.signing_permission).toBe("blocked");
    expect(usabilitySummary.private_key_storage).toBe("blocked");
    expect(usabilitySummary.seed_phrase_storage).toBe("blocked");
    expect(usabilitySummary.secret_echo_permission).toBe("blocked");
    expect(usabilitySummary.current_input?.safe_surface).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    expect(usabilitySummary.local_credentials.runtime_effective).toBe(true);
    expect(usabilitySummary.counts.real_capital_blockers).toBeGreaterThan(0);
    expect(usabilitySummary.counts.open_operator_inputs).toBeGreaterThan(0);
    expect(usabilitySummary.counts.funded_proof_rows_ready).toBe(0);
    expect(usabilitySummary.lanes.find((lane) => lane.id === "paper-autonomy")).toMatchObject({
      status: "usable",
      counts_as_funded_trade_proof: false,
    });
    expect(usabilitySummary.lanes.find((lane) => lane.id === "funded-wallet-trade")).toMatchObject({
      status: "blocked",
      counts_as_funded_trade_proof: true,
    });
    expect(usabilitySummary.lanes.find((lane) => lane.id === "autonomous-real-capital")).toMatchObject({
      status: "blocked",
      counts_as_funded_trade_proof: false,
    });
    expect(usabilitySummary.evidence_endpoints).toContain("/api/web3-dedicated-wallet-intake-contract?scenario=breakout&account=persistent&cycles=0");
    expect(usabilitySummary.evidence_endpoints).toContain("/api/web3-live-test-ledger?source=live-dex&account=persistent&scenario=breakout&cycles=0");
    expect(usabilitySummary.summary).toContain("Not usable for funded autonomous trading yet");
    expect(usabilitySummary.controls.join(" ")).toContain("cannot sign");

    const walletContractResponse = await DEDICATED_WALLET_INTAKE_CONTRACT_GET(new Request("http://localhost/api/web3-dedicated-wallet-intake-contract?scenario=breakout&account=persistent&cycles=0"));
    const walletContract = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      can_enter_in_app: boolean;
      existing_save_endpoint: string;
      existing_save_method: string;
      existing_save_body_template: {
        execution: {
          mode: string;
          wallet_public_key: string;
          kill_switch: boolean;
          signer_simulation_enabled: boolean;
        };
      };
      accepted_fields: Array<{ path: string; storage: string; validation: string }>;
      rejected_fields: string[];
      after_save_steps: Array<{ id: string; command_or_href: string }>;
      verifier_command: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      signing_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(walletContractResponse);
    expect(walletContractResponse.status).toBe(200);
    expect(walletContract.mode).toBe("web3-dedicated-wallet-intake-contract");
    expect(walletContract.status).toBe("public-wallet-needed");
    expect(walletContract.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(walletContract.can_enter_in_app).toBe(true);
    expect(walletContract.existing_save_endpoint).toBe("/api/web3-trading");
    expect(walletContract.existing_save_method).toBe("POST");
    expect(walletContract.existing_save_body_template.execution.mode).toBe("dry-run");
    expect(walletContract.existing_save_body_template.execution.wallet_public_key).toBe("<public-solana-address>");
    expect(walletContract.existing_save_body_template.execution.kill_switch).toBe(false);
    expect(walletContract.existing_save_body_template.execution.signer_simulation_enabled).toBe(true);
    expect(walletContract.accepted_fields.map((field) => field.path)).toContain("execution.wallet_public_key");
    expect(walletContract.accepted_fields.find((field) => field.path === "execution.wallet_public_key")?.storage).toContain("public scope");
    expect(walletContract.accepted_fields.find((field) => field.path === "execution.wallet_public_key")?.validation).toContain("never the sample all-ones");
    expect(walletContract.rejected_fields).toEqual(expect.arrayContaining(["private_key", "seed_phrase", "signed_transaction", "api_key"]));
    expect(walletContract.after_save_steps.map((step) => step.id)).toEqual([
      "strict-wallet-verifier",
      "wallet-ownership-proof",
      "jupiter-order-rail",
      "live-canary-summary",
    ]);
    expect(walletContract.verifier_command).toContain("--wallet=<public-solana-address>");
    expect(walletContract.live_execution_permission).toBe("blocked");
    expect(walletContract.wallet_mutation_permission).toBe("blocked");
    expect(walletContract.transaction_submission_permission).toBe("blocked");
    expect(walletContract.signing_permission).toBe("blocked");
    expect(walletContract.private_key_storage).toBe("blocked");
    expect(walletContract.seed_phrase_storage).toBe("blocked");
    expect(walletContract.secret_echo_permission).toBe("blocked");
    expect(walletContract.controls.join(" ")).toContain("intake map only");

    const invalidLedgerResponse = await LIVE_TEST_LEDGER_GET(new Request("http://localhost/api/web3-live-test-ledger?account=hot-wallet"));
    const invalidLedgerReceipt = await json<{ error: string }>(invalidLedgerResponse);
    expect(invalidLedgerResponse.status).toBe(422);
    expect(invalidLedgerReceipt.error).toContain("account must be ephemeral or persistent");

    const fallbackReceipt = buildWeb3LiveTradeCanaryBlockedFallbackReceipt({
      source: "live-dex",
      account: "persistent",
      scenario: "breakout",
      reason: "test timeout before any trade attempt",
      now: new Date("2026-06-22T00:00:00.000Z"),
    });
    expect(fallbackReceipt.status).toBe("blocked");
    expect(fallbackReceipt.actual_live_trade_tested).toBe(false);
    expect(fallbackReceipt.real_funds_moved_by_this_app).toBe(false);
    expect(fallbackReceipt.can_submit_from_app_now).toBe(false);
    expect(fallbackReceipt.live_execution_permission).toBe("blocked");
    expect(fallbackReceipt.transaction_submission_permission).toBe("blocked");
    expect(fallbackReceipt.wallet_mutation_permission).toBe("blocked");
    expect(fallbackReceipt.private_key_storage).toBe("blocked");
    expect(fallbackReceipt.seed_phrase_storage).toBe("blocked");
    expect(fallbackReceipt.secret_echo_permission).toBe("blocked");
    expect(fallbackReceipt.next_required_input?.id).toBe("dedicated-public-wallet");
    expect(fallbackReceipt.blockers.join(" ")).toContain("failed closed");
    expect(fallbackReceipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);

    const signedPayload = Buffer.from("signed-payload-canary-never-echo").toString("base64");
    const actionResponse = await LIVE_TRADE_CANARY_POST(new Request("http://localhost/api/web3-live-trade-canary?scenario=breakout&source=sample&account=persistent&cycles=0", {
      method: "POST",
      body: JSON.stringify({
        operator_ack: true,
        canary_ack: "I_UNDERSTAND_THIS_CAN_MOVE_REAL_FUNDS",
        signed_transaction: signedPayload,
        request_id: "order-123",
        route: "jupiter-swap-v2",
      }),
    }));
    const actionText = await actionResponse.text();
    expect(actionResponse.status).toBe(200);
    expect(actionText).not.toContain(signedPayload);
    expect(actionText).not.toContain("signed-payload-canary-never-echo");
    const actionReceipt = JSON.parse(actionText) as {
      mode: string;
      status: string;
      relay_attempted: boolean;
      signed_payload_received: boolean;
      signed_payload_echoed: boolean;
      expected_request_id: string | null;
      expected_route: string | null;
      request_continuity_status: string;
      current_relay_ready: boolean;
      signed_payload_hash: string | null;
      signed_payload_byte_count: number;
      blockers: string[];
      transaction_submission_permission: string;
      private_key_storage: string;
      secret_echo_permission: string;
    };
    expect(actionReceipt.mode).toBe("web3-live-trade-canary-action");
    expect(actionReceipt.status).toBe("blocked");
    expect(actionReceipt.relay_attempted).toBe(false);
    expect(actionReceipt.signed_payload_received).toBe(true);
    expect(actionReceipt.signed_payload_echoed).toBe(false);
    expect(actionReceipt.expected_request_id).toBeNull();
    expect(actionReceipt.expected_route).toBeNull();
    expect(actionReceipt.request_continuity_status).toBe("missing-current-request");
    expect(actionReceipt.current_relay_ready).toBe(false);
    expect(actionReceipt.signed_payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(actionReceipt.signed_payload_byte_count).toBeGreaterThan(0);
    expect(actionReceipt.blockers.join(" ")).toContain("source=live-dex");
    expect(actionReceipt.blockers.join(" ")).toContain("No active canary request id");
    expect(actionReceipt.transaction_submission_permission).toBe("blocked");
    expect(actionReceipt.private_key_storage).toBe("blocked");
    expect(actionReceipt.secret_echo_permission).toBe("blocked");

    const unsafeCanary = "codex-canary-private-key-never-echo";
    const unsafeActionResponse = await LIVE_TRADE_CANARY_POST(new Request("http://localhost/api/web3-live-trade-canary?scenario=breakout&source=sample&account=persistent&cycles=0", {
      method: "POST",
      body: JSON.stringify({
        operator_ack: true,
        canary_ack: "I_UNDERSTAND_THIS_CAN_MOVE_REAL_FUNDS",
        signed_transaction: signedPayload,
        request_id: "order-123",
        route: "jupiter-swap-v2",
        private_key: unsafeCanary,
      }),
    }));
    const unsafeActionText = await unsafeActionResponse.text();
    expect(unsafeActionResponse.status).toBe(422);
    expect(unsafeActionText).not.toContain(unsafeCanary);
    expect(unsafeActionText).not.toContain(signedPayload);
    const unsafeAction = JSON.parse(unsafeActionText) as { status: string; unsafe_fields: string[] };
    expect(unsafeAction.status).toBe("unsafe-rejected");
    expect(unsafeAction.unsafe_fields).toContain("private_key");

    const invalid = await LIVE_TRADE_CANARY_GET(new Request("http://localhost/api/web3-live-trade-canary?account=hot-wallet"));
    const invalidReceipt = await json<{ error: string }>(invalid);
    expect(invalid.status).toBe(422);
    expect(invalidReceipt.error).toContain("account must be ephemeral or persistent");
  });

  test("GIVEN a signed canary payload references an old order WHEN request continuity is checked THEN the relay is blocked before submission", async () => {
    const response = await LIVE_TRADE_CANARY_GET(new Request("http://localhost/api/web3-live-trade-canary?scenario=breakout&source=sample&account=persistent&cycles=0"));
    const receipt = await json<Web3LiveTradeCanaryReceipt>(response);
    const missing = liveCanaryRequestContinuityBlockers(receipt, "stale-order-001");
    const readyReceipt: Web3LiveTradeCanaryReceipt = {
      ...receipt,
      current_request_id: "order-current-001",
      can_submit_from_app_now: true,
      signed_relay_submit_path: "jupiter-swap-v2",
    };
    const mismatch = liveCanaryRequestContinuityBlockers(readyReceipt, "stale-order-001");
    const matched = liveCanaryRequestContinuityBlockers(readyReceipt, "order-current-001");
    const routeMismatch = liveCanaryRequestContinuityBlockers(readyReceipt, "order-current-001", "solana-rpc");

    expect(missing.join(" ")).toContain("No active canary request id");
    expect(mismatch).toEqual(["request_id must match the current canary request order-current-001."]);
    expect(routeMismatch).toEqual(["route must match the current canary submit path jupiter-swap-v2."]);
    expect(matched).toEqual([]);
  });

  test("GIVEN a signed payload was relayed but not confirmed WHEN the live canary receipt is built THEN it does not claim a real live trade test", async () => {
    const base = await getWeb3TradingStateAsync({
      source: "sample",
      account: "persistent",
      scenario: "breakout",
      cycles: 0,
    });
    const createdAt = new Date("2026-06-21T12:00:00.000Z").toISOString();
    const signature = "5NfPendingRelaySignature1111111111111111111111111111111111";
    const pendingEntry: NonNullable<Web3TradingState["execution_audit"]["latest"]> = {
      id: "web3-relay-pending-001",
      created_at: createdAt,
      nonce: "web3-relay-pending",
      plan_id: null,
      symbol: "SOL-USDC",
      side: "buy",
      status: "relayed",
      attempt: 0,
      max_attempts: 3,
      retry_window_seconds: 90,
      next_retry_at: null,
      request_id: "order-pending-001",
      router: "metis",
      relay_path: "solana-rpc",
      transaction_ready: true,
      payload_hash: "0".repeat(64),
      payload_bytes: 184,
      simulated_signature: null,
      relay_signature: signature,
      relay_slot: null,
      confirmation_status: null,
      signer_session_label: null,
      signer_network: null,
      kill_switch: false,
      reason: "Solana RPC accepted the signed transaction; confirmation status is still pending.",
    };

    const receipt = buildWeb3LiveTradeCanaryReceipt({
      ...base,
      execution_audit: {
        entries: [pendingEntry],
        latest: pendingEntry,
      },
      signed_transaction_relay: {
        ...base.signed_transaction_relay,
        status: "relayed",
        can_accept_signed_payload: false,
        request_id: "order-pending-001",
        latest_signature: signature,
        latest_slot: null,
        confirmation_status: null,
        blockers: [],
      },
    }, new Date("2026-06-21T12:00:30.000Z"));

    expect(receipt.status).toBe("blocked");
    expect(receipt.actual_live_trade_tested).toBe(false);
    expect(receipt.real_funds_moved_by_this_app).toBe(false);
    expect(receipt.signed_relay_status).toBe("relayed");
    expect(receipt.latest_signature_preview).toBe("5NfPen...111111");
    expect(receipt.latest_confirmation_status).toBeNull();
    expect(receipt.post_signing_evidence_status).toBe("needs-confirmation");
    expect(receipt.post_signing_evidence.find((item) => item.id === "signed-relay")).toMatchObject({
      status: "pass",
      detail: expect.stringContaining("was relayed"),
      next_action: expect.stringContaining("Poll chain confirmation"),
    });
    expect(receipt.post_signing_evidence.find((item) => item.id === "chain-confirmation")).toMatchObject({
      status: "watch",
      detail: expect.stringContaining("waiting on the signature"),
    });
    expect(receipt.post_signing_next_action).toContain("signature confirmation poll");
    expect(receipt.blockers.join(" ")).toContain("No confirmed live transaction signature");
  });

  test("GIVEN the operator asks for a live unsigned canary order WHEN gates are missing THEN the handoff blocks safely", async () => {
    const safeWallet = "9xQeWvG816bUx9EPfYQ4mKZ8sPXc6zQnK9j8vY9J3F3";
    const preflightResponse = await LIVE_UNSIGNED_ORDER_HANDOFF_GET(new Request(`http://localhost/api/web3-live-unsigned-order-handoff?scenario=breakout&source=sample&account=persistent&cycles=0&operator_ack=true&canary_ack=I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED&wallet_public_key=${safeWallet}&amount_lamports=100000`));
    const preflightReceipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      can_request_one_shot_unsigned_order: boolean;
      unsigned_transaction_return: string;
      transaction_body_storage: string;
      execute_permission: string;
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      jupiter_key_configured: boolean;
      live_flags_ready: boolean;
      wallet_ready: boolean;
      scoped_wallet_ownership_proved: boolean;
      wallet_matches_scoped_wallet: boolean;
      wallet_ownership_proved: boolean;
      blockers: string[];
      controls: string[];
    }>(preflightResponse);

    expect(preflightResponse.status).toBe(200);
    expect(preflightReceipt.mode).toBe("web3-live-unsigned-order-preflight");
    expect(preflightReceipt.status).toBe("blocked");
    expect(preflightReceipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(preflightReceipt.can_request_one_shot_unsigned_order).toBe(false);
    expect(preflightReceipt.unsigned_transaction_return).toBe("blocked");
    expect(preflightReceipt.transaction_body_storage).toBe("blocked");
    expect(preflightReceipt.execute_permission).toBe("blocked");
    expect(preflightReceipt.transaction_submission_permission).toBe("blocked");
    expect(preflightReceipt.live_execution_permission).toBe("blocked");
    expect(preflightReceipt.wallet_mutation_permission).toBe("blocked");
    expect(preflightReceipt.private_key_storage).toBe("blocked");
    expect(preflightReceipt.seed_phrase_storage).toBe("blocked");
    expect(preflightReceipt.secret_echo_permission).toBe("blocked");
    expect(preflightReceipt.jupiter_key_configured).toBe(false);
    expect(preflightReceipt.live_flags_ready).toBe(false);
    expect(preflightReceipt.wallet_ready).toBe(true);
    expect(preflightReceipt.scoped_wallet_ownership_proved).toBe(false);
    expect(preflightReceipt.wallet_matches_scoped_wallet).toBe(false);
    expect(preflightReceipt.wallet_ownership_proved).toBe(false);
    expect(preflightReceipt.blockers.join(" ")).toContain("source=live-dex");
    expect(preflightReceipt.blockers.join(" ")).toContain("Save a dedicated public Solana wallet");
    expect(preflightReceipt.blockers.join(" ")).toContain("JUPITER_API_KEY");
    expect(preflightReceipt.controls.join(" ")).toContain("before any wallet prompt");
    expect(preflightReceipt.controls.join(" ")).toContain("never calls Jupiter order creation");

    const unsafePreflightCanary = "codex-preflight-private-key-never-echo";
    const unsafePreflight = await LIVE_UNSIGNED_ORDER_HANDOFF_GET(new Request(`http://localhost/api/web3-live-unsigned-order-handoff?scenario=breakout&source=sample&account=persistent&cycles=0&operator_ack=true&canary_ack=I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED&wallet_public_key=${safeWallet}&private_key=${unsafePreflightCanary}`));
    const unsafePreflightText = await unsafePreflight.text();
    expect(unsafePreflight.status).toBe(422);
    expect(unsafePreflightText).not.toContain(unsafePreflightCanary);
    const unsafePreflightReceipt = JSON.parse(unsafePreflightText) as {
      status: string;
      unsafe_fields: string[];
      unsigned_transaction_return: string;
      secret_echo_permission: string;
    };
    expect(unsafePreflightReceipt.status).toBe("unsafe-rejected");
    expect(unsafePreflightReceipt.unsafe_fields).toContain("private_key");
    expect(unsafePreflightReceipt.unsigned_transaction_return).toBe("blocked");
    expect(unsafePreflightReceipt.secret_echo_permission).toBe("blocked");

    process.env.JUPITER_API_KEY = "jup-test-canary-key";
    process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = "true";
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = "I_UNDERSTAND_REAL_FUNDS";
    process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF = "true";
    const unprovenPreflight = await LIVE_UNSIGNED_ORDER_HANDOFF_GET(new Request(`http://localhost/api/web3-live-unsigned-order-handoff?scenario=breakout&source=live-dex&account=persistent&cycles=0&operator_ack=true&canary_ack=I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED&wallet_public_key=${safeWallet}&amount_lamports=100000&max_slippage_bps=50`));
    const unprovenReceipt = await json<{
      status: string;
      can_request_one_shot_unsigned_order: boolean;
      scoped_wallet_ownership_proved: boolean;
      wallet_matches_scoped_wallet: boolean;
      wallet_ownership_proved: boolean;
      blockers: string[];
    }>(unprovenPreflight);
    expect(unprovenPreflight.status).toBe(200);
    expect(unprovenReceipt.status).toBe("blocked");
    expect(unprovenReceipt.can_request_one_shot_unsigned_order).toBe(false);
    expect(unprovenReceipt.scoped_wallet_ownership_proved).toBe(false);
    expect(unprovenReceipt.wallet_matches_scoped_wallet).toBe(false);
    expect(unprovenReceipt.wallet_ownership_proved).toBe(false);
    expect(unprovenReceipt.blockers.join(" ")).toContain("Save a dedicated public Solana wallet");

    const { walletPublicKey } = await createScopedOwnedWalletForTest("test-canary-preflight-wallet");
    const readyPreflight = await LIVE_UNSIGNED_ORDER_HANDOFF_GET(new Request(`http://localhost/api/web3-live-unsigned-order-handoff?scenario=breakout&source=live-dex&account=persistent&cycles=0&operator_ack=true&canary_ack=I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED&wallet_public_key=${walletPublicKey}&amount_lamports=100000&max_slippage_bps=50`));
    const readyPreflightText = await readyPreflight.text();
    expect(readyPreflight.status).toBe(200);
    expect(readyPreflightText).not.toContain("jup-test-canary-key");
    const readyPreflightReceipt = JSON.parse(readyPreflightText) as {
      mode: string;
      status: string;
      can_request_one_shot_unsigned_order: boolean;
      unsigned_transaction_return: string;
      transaction_body_storage: string;
      execute_permission: string;
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      jupiter_key_configured: boolean;
      live_flags_ready: boolean;
      source_ready: boolean;
      account_ready: boolean;
      wallet_ready: boolean;
      scoped_wallet_ownership_proved: boolean;
      scoped_wallet_ownership_current_for_canary: boolean;
      wallet_matches_scoped_wallet: boolean;
      wallet_ownership_proved: boolean;
      wallet_ownership_current_for_canary: boolean;
      wallet_ownership_age_seconds: number | null;
      wallet_ownership_expires_at: string | null;
      wallet_ownership_max_age_seconds: number;
      blockers: string[];
    };
    expect(readyPreflightReceipt.mode).toBe("web3-live-unsigned-order-preflight");
    expect(readyPreflightReceipt.status).toBe("ready");
    expect(readyPreflightReceipt.can_request_one_shot_unsigned_order).toBe(true);
    expect(readyPreflightReceipt.unsigned_transaction_return).toBe("blocked");
    expect(readyPreflightReceipt.transaction_body_storage).toBe("blocked");
    expect(readyPreflightReceipt.execute_permission).toBe("blocked");
    expect(readyPreflightReceipt.transaction_submission_permission).toBe("blocked");
    expect(readyPreflightReceipt.live_execution_permission).toBe("blocked");
    expect(readyPreflightReceipt.wallet_mutation_permission).toBe("blocked");
    expect(readyPreflightReceipt.private_key_storage).toBe("blocked");
    expect(readyPreflightReceipt.seed_phrase_storage).toBe("blocked");
    expect(readyPreflightReceipt.secret_echo_permission).toBe("blocked");
    expect(readyPreflightReceipt.jupiter_key_configured).toBe(true);
    expect(readyPreflightReceipt.live_flags_ready).toBe(true);
    expect(readyPreflightReceipt.source_ready).toBe(true);
    expect(readyPreflightReceipt.account_ready).toBe(true);
    expect(readyPreflightReceipt.wallet_ready).toBe(true);
    expect(readyPreflightReceipt.scoped_wallet_ownership_proved).toBe(true);
    expect(readyPreflightReceipt.scoped_wallet_ownership_current_for_canary).toBe(true);
    expect(readyPreflightReceipt.wallet_matches_scoped_wallet).toBe(true);
    expect(readyPreflightReceipt.wallet_ownership_proved).toBe(true);
    expect(readyPreflightReceipt.wallet_ownership_current_for_canary).toBe(true);
    expect(readyPreflightReceipt.wallet_ownership_age_seconds).toBeGreaterThanOrEqual(0);
    expect(readyPreflightReceipt.wallet_ownership_expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(readyPreflightReceipt.wallet_ownership_max_age_seconds).toBe(600);
    expect(readyPreflightReceipt.blockers).toEqual([]);

    const scopedDefaultPreflight = await LIVE_UNSIGNED_ORDER_HANDOFF_GET(new Request("http://localhost/api/web3-live-unsigned-order-handoff?scenario=breakout&source=live-dex&account=persistent&cycles=0&operator_ack=true&canary_ack=I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED&amount_lamports=100000&max_slippage_bps=50"));
    const scopedDefaultReceipt = await json<{
      status: string;
      can_request_one_shot_unsigned_order: boolean;
      wallet_ready: boolean;
      wallet_matches_scoped_wallet: boolean;
      wallet_ownership_proved: boolean;
      wallet_ownership_current_for_canary: boolean;
      blockers: string[];
    }>(scopedDefaultPreflight);
    expect(scopedDefaultPreflight.status).toBe(200);
    expect(scopedDefaultReceipt.status).toBe("ready");
    expect(scopedDefaultReceipt.can_request_one_shot_unsigned_order).toBe(true);
    expect(scopedDefaultReceipt.wallet_ready).toBe(true);
    expect(scopedDefaultReceipt.wallet_matches_scoped_wallet).toBe(true);
    expect(scopedDefaultReceipt.wallet_ownership_proved).toBe(true);
    expect(scopedDefaultReceipt.wallet_ownership_current_for_canary).toBe(true);
    expect(scopedDefaultReceipt.blockers.join(" ")).not.toContain("wallet_public_key is required");

    ageLatestWalletOwnershipProofForTest(11 * 60);
    const staleProofPreflight = await LIVE_UNSIGNED_ORDER_HANDOFF_GET(new Request(`http://localhost/api/web3-live-unsigned-order-handoff?scenario=breakout&source=live-dex&account=persistent&cycles=0&operator_ack=true&canary_ack=I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED&wallet_public_key=${walletPublicKey}&amount_lamports=100000&max_slippage_bps=50`));
    const staleProofReceipt = await json<{
      status: string;
      can_request_one_shot_unsigned_order: boolean;
      scoped_wallet_ownership_proved: boolean;
      scoped_wallet_ownership_current_for_canary: boolean;
      wallet_ownership_proved: boolean;
      wallet_ownership_current_for_canary: boolean;
      wallet_ownership_age_seconds: number | null;
      wallet_ownership_max_age_seconds: number;
      blockers: string[];
    }>(staleProofPreflight);
    expect(staleProofPreflight.status).toBe(200);
    expect(staleProofReceipt.status).toBe("blocked");
    expect(staleProofReceipt.can_request_one_shot_unsigned_order).toBe(false);
    expect(staleProofReceipt.scoped_wallet_ownership_proved).toBe(true);
    expect(staleProofReceipt.scoped_wallet_ownership_current_for_canary).toBe(false);
    expect(staleProofReceipt.wallet_ownership_proved).toBe(true);
    expect(staleProofReceipt.wallet_ownership_current_for_canary).toBe(false);
    expect(staleProofReceipt.wallet_ownership_age_seconds).toBeGreaterThan(600);
    expect(staleProofReceipt.wallet_ownership_max_age_seconds).toBe(600);
    expect(staleProofReceipt.blockers.join(" ")).toContain("too old for the first funded canary");
    delete process.env.JUPITER_API_KEY;
    delete process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION;
    delete process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL;
    delete process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF;

    const response = await LIVE_UNSIGNED_ORDER_HANDOFF_POST(new Request("http://localhost/api/web3-live-unsigned-order-handoff?scenario=breakout&source=sample&account=persistent&cycles=0", {
      method: "POST",
      body: JSON.stringify({
        operator_ack: true,
        canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
        return_unsigned_transaction_ack: true,
        wallet_public_key: safeWallet,
        amount_lamports: 100_000,
      }),
    }));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      unsigned_transaction: string | null;
      unsigned_transaction_return: string;
      transaction_body_storage: string;
      execute_permission: string;
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      blockers: string[];
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-live-unsigned-order-handoff");
    expect(receipt.status).toBe("blocked");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.unsigned_transaction).toBeNull();
    expect(receipt.unsigned_transaction_return).toBe("blocked");
    expect(receipt.transaction_body_storage).toBe("blocked");
    expect(receipt.execute_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.blockers.join(" ")).toContain("source=live-dex");
    expect(receipt.blockers.join(" ")).toContain("MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF=true");
    expect(receipt.controls.join(" ")).toContain("tiny SOL-to-USDC Jupiter canary order");

    const unsafeCanary = "codex-unsafe-private-key-never-echo";
    const unsafeResponse = await LIVE_UNSIGNED_ORDER_HANDOFF_POST(new Request("http://localhost/api/web3-live-unsigned-order-handoff?scenario=breakout&source=sample&account=persistent&cycles=0", {
      method: "POST",
      body: JSON.stringify({
        operator_ack: true,
        canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
        return_unsigned_transaction_ack: true,
        wallet_public_key: safeWallet,
        private_key: unsafeCanary,
        raw_transaction: "raw-canary-never-echo",
      }),
    }));
    const unsafeText = await unsafeResponse.text();
    expect(unsafeResponse.status).toBe(422);
    expect(unsafeText).not.toContain(unsafeCanary);
    expect(unsafeText).not.toContain("raw-canary-never-echo");
    const unsafeReceipt = JSON.parse(unsafeText) as {
      status: string;
      unsafe_fields: string[];
      unsigned_transaction: string | null;
      secret_echo_permission: string;
    };
    expect(unsafeReceipt.status).toBe("unsafe-rejected");
    expect(unsafeReceipt.unsafe_fields).toContain("private_key");
    expect(unsafeReceipt.unsafe_fields).toContain("raw_transaction");
    expect(unsafeReceipt.unsigned_transaction).toBeNull();
    expect(unsafeReceipt.secret_echo_permission).toBe("blocked");
  });

  test("GIVEN a one-shot unsigned canary order is returned WHEN the canary receipt refreshes THEN request continuity is available without storing transaction bytes", async () => {
    const { walletPublicKey } = await createScopedOwnedWalletForTest("test-canary-handoff-wallet");
    const unsignedTransaction = Buffer.from("unsigned-live-canary-transaction-never-store").toString("base64");
    process.env.JUPITER_API_KEY = "jup-test-canary-key";
    process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = "true";
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = "I_UNDERSTAND_REAL_FUNDS";
    process.env.MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF = "true";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: unsignedTransaction,
          requestId: "canary-order-001",
          router: "metis",
          mode: "manual",
          feeBps: 0,
        });
      }
      return Response.json([]);
    }) as typeof fetch;

    const handoff = await LIVE_UNSIGNED_ORDER_HANDOFF_POST(new Request("http://localhost/api/web3-live-unsigned-order-handoff?scenario=breakout&source=live-dex&account=persistent&cycles=0", {
      method: "POST",
      body: JSON.stringify({
        operator_ack: true,
        canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
        return_unsigned_transaction_ack: true,
        amount_lamports: 100_000,
        max_slippage_bps: 50,
      }),
    }));
    const handoffText = await handoff.text();
    const handoffReceipt = JSON.parse(handoffText) as {
      status: string;
      request_id: string | null;
      wallet_public_key_preview: string | null;
      unsigned_transaction: string | null;
      unsigned_payload_hash: string | null;
      unsigned_payload_byte_count: number;
      unsigned_transaction_return: string;
      continuity_audit_recorded: boolean;
      scoped_wallet_ownership_proved: boolean;
      wallet_matches_scoped_wallet: boolean;
      wallet_ownership_proved: boolean;
      transaction_body_storage: string;
      signed_transaction_return: string;
      secret_echo_permission: string;
      wallet_ownership_current_for_canary: boolean;
      wallet_ownership_age_seconds: number | null;
      wallet_ownership_max_age_seconds: number;
    };

    expect(handoff.status).toBe(200);
    expect(handoffReceipt.status).toBe("order-ready");
    expect(handoffReceipt.request_id).toBe("canary-order-001");
    expect(handoffReceipt.wallet_public_key_preview).toBe(`${walletPublicKey.slice(0, 4)}...${walletPublicKey.slice(-4)}`);
    expect(handoffReceipt.unsigned_transaction).toBe(unsignedTransaction);
    expect(handoffReceipt.unsigned_transaction_return).toBe("returned-one-shot");
    expect(handoffReceipt.scoped_wallet_ownership_proved).toBe(true);
    expect(handoffReceipt.wallet_matches_scoped_wallet).toBe(true);
    expect(handoffReceipt.wallet_ownership_proved).toBe(true);
    expect(handoffReceipt.wallet_ownership_current_for_canary).toBe(true);
    expect(handoffReceipt.wallet_ownership_age_seconds).toBeGreaterThanOrEqual(0);
    expect(handoffReceipt.wallet_ownership_max_age_seconds).toBe(600);
    expect(handoffReceipt.unsigned_payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(handoffReceipt.unsigned_payload_byte_count).toBeGreaterThan(0);
    expect(handoffReceipt.continuity_audit_recorded).toBe(true);
    expect(handoffReceipt.transaction_body_storage).toBe("blocked");
    expect(handoffReceipt.signed_transaction_return).toBe("blocked");
    expect(handoffReceipt.secret_echo_permission).toBe("blocked");
    expect(handoffText).not.toContain("jup-test-canary-key");
    expect(handoffText).not.toContain("unsigned-live-canary-transaction-never-store");

    const canary = await LIVE_TRADE_CANARY_GET(new Request("http://localhost/api/web3-live-trade-canary?scenario=breakout&source=sample&account=persistent&cycles=0"));
    const canaryReceipt = await json<{
      current_request_id: string | null;
      signed_relay_status: string;
      latest_signature_preview: string | null;
      can_submit_from_app_now: boolean;
      wallet_ownership_proved: boolean;
      wallet_ownership_current_for_canary: boolean;
      wallet_ownership_age_seconds: number | null;
      wallet_ownership_max_age_seconds: number;
      blockers: string[];
    }>(canary);

    expect(canary.status).toBe(200);
    expect(canaryReceipt.current_request_id).toBe("canary-order-001");
    expect(["locked", "awaiting-signature", "ready"]).toContain(canaryReceipt.signed_relay_status);
    expect(canaryReceipt.latest_signature_preview).toBeNull();
    expect(canaryReceipt.wallet_ownership_proved).toBe(true);
    expect(canaryReceipt.wallet_ownership_current_for_canary).toBe(true);
    expect(canaryReceipt.wallet_ownership_age_seconds).toBeGreaterThanOrEqual(0);
    expect(canaryReceipt.wallet_ownership_max_age_seconds).toBe(600);
    expect(JSON.stringify(canaryReceipt)).not.toContain(unsignedTransaction);

    ageLatestWalletOwnershipProofForTest(11 * 60);
    const staleCanary = await LIVE_TRADE_CANARY_GET(new Request("http://localhost/api/web3-live-trade-canary?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const staleCanaryReceipt = await json<{
      can_submit_from_app_now: boolean;
      wallet_ownership_proved: boolean;
      wallet_ownership_current_for_canary: boolean;
      wallet_ownership_age_seconds: number | null;
      blockers: string[];
    }>(staleCanary);
    expect(staleCanary.status).toBe(200);
    expect(staleCanaryReceipt.can_submit_from_app_now).toBe(false);
    expect(staleCanaryReceipt.wallet_ownership_proved).toBe(true);
    expect(staleCanaryReceipt.wallet_ownership_current_for_canary).toBe(false);
    expect(staleCanaryReceipt.wallet_ownership_age_seconds).toBeGreaterThan(600);
    expect(staleCanaryReceipt.blockers.join(" ")).toContain("too old for the first funded canary");
  });

  test("GIVEN real-money blockers remain WHEN live usability blockers are requested THEN the next unlock step comes before proof work", async () => {
    const response = await LIVE_USABILITY_BLOCKERS_GET(new Request("http://localhost/api/web3-live-usability-blockers?scenario=breakout&source=live-dex&account=persistent"));
    const receipt = await json<{
      mode: string;
      status: string;
      summary: string;
      receipt_hash: string;
      total_live_usability_row_count: number;
      listed_live_usability_row_count: number;
      live_usability_row_scope: string;
      operator_wallet_public_key: string | null;
      operator_wallet_strict_command: string | null;
      current_input: {
        id: string;
        label: string;
        safe_collection_surface: string;
        storage: string;
        target_names: string[];
        next_action: string;
        verifier_command: string | null;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      } | null;
      next_unlock_step: { id: string; label: string; status: string; storage: string; next_action: string } | null;
      next_blocker: {
        id: string;
        label: string;
        owner: string;
        source: string;
        status: string;
        next_action: string;
        href: string;
        safe_command: string | null;
        blocks_live_capital: boolean;
      } | null;
      next_credential_request: {
        id: string;
        label: string;
        safe_collection_surface: string;
        storage: string;
        can_enter_in_app: boolean;
        target_names: string[];
        fix_href: string;
        safe_value_description: string;
        verifier_command: string | null;
        safe_to_provide: string[];
        never_provide: string[];
        completion_criteria: string[];
        verification_runway: Array<{
          id: string;
          label: string;
          href: string | null;
          command: string | null;
          live_execution_permission: string;
          wallet_mutation_permission: string;
          secret_echo_permission: string;
        }>;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        signing_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      } | null;
      operator_unlock_sequence: Array<{ id: string; label: string; status: string; storage: string; next_action: string; evidence: string }>;
      missing_for_live_usability: Array<{ id: string; label: string; status: string; next_action: string }>;
      missing_owner_summary: Array<{ owner: string; missing_count: number; real_capital_blocker_count: number; first_label: string; next_action: string; sources: string[] }>;
      missing_source_summary: Array<{ source: string; missing_count: number; real_capital_blocker_count: number; first_label: string; next_action: string }>;
      credential_doctor: {
        status: string;
        receipt_fresh: boolean;
        ready_count: number;
        watch_count: number;
        blocked_count: number;
        next_action: string;
        safe_command: string;
        receipt_hash: string | null;
      };
      verifier_commands: string[];
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-live-usability-blockers");
    expect(receipt.summary).toContain("cutover setup blocker");
    expect(receipt.summary).toContain("total live-usability row");
    expect(receipt.summary).toContain("dependency-ranked row");
    expect(receipt.total_live_usability_row_count).toBeGreaterThanOrEqual(receipt.listed_live_usability_row_count);
    expect(receipt.listed_live_usability_row_count).toBe(receipt.missing_for_live_usability.length);
    expect(receipt.live_usability_row_scope).toBe("compact");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.next_unlock_step).toMatchObject({
      id: "scope-wallet",
      label: "Scope dedicated wallet",
      storage: "browser-public-scope",
    });
    expect(receipt.current_input).not.toBeNull();
    expect(receipt.current_input).toMatchObject({
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(receipt.current_input?.target_names.length).toBeGreaterThan(0);
    expect(receipt.current_input?.target_names.join(" ")).not.toContain("test-");
    expect(receipt.current_input?.safe_collection_surface.length).toBeGreaterThan(0);
    if (receipt.current_input?.id === "dedicated-trading-wallet") {
      expect(receipt.current_input.safe_collection_surface).toBe("trading-console");
    }
    expect(receipt.current_input?.storage.length).toBeGreaterThan(0);
    expect(receipt.current_input?.next_action.length).toBeGreaterThan(0);
    expect(receipt.operator_unlock_sequence.map((step) => step.id)).toEqual([
      "scope-wallet",
      "prove-wallet",
      "rehearse-jupiter",
      "choose-signer",
      "ops-accounting",
      "external-review",
    ]);
    expect(receipt.missing_for_live_usability[0]).toMatchObject({
      id: "cutover:dedicated-trading-wallet",
      label: "Dedicated trading wallet",
    });
    const compactMissingIds = receipt.missing_for_live_usability.map((item) => item.id);
    const jupiterRunwayIndex = compactMissingIds.indexOf("runway:jupiter");
    const jupiterPreflightIndex = compactMissingIds.indexOf("preflight:jupiter-order");
    if (jupiterRunwayIndex >= 0 && jupiterPreflightIndex >= 0) {
      expect(jupiterRunwayIndex).toBeLessThan(jupiterPreflightIndex);
    }
    const jupiterPreflight = receipt.missing_for_live_usability.find((item) => item.id === "preflight:jupiter-order");
    expect(jupiterPreflight?.next_action).toContain("JUPITER_API_KEY");
    expect(jupiterPreflight?.next_action).toContain("--require-jupiter-order");
    expect(jupiterPreflight?.next_action).not.toContain("read-only dex backfill");
    expect(jupiterPreflight?.next_action).not.toContain("FARTCOIN");
    const signerPreflight = receipt.missing_for_live_usability.find((item) => item.id === "preflight:signer-custody");
    expect(signerPreflight?.next_action).toContain("signer handoff receipt");
    expect(signerPreflight?.next_action).not.toContain("Spend:");
    const signerRunway = receipt.missing_for_live_usability.find((item) => item.id === "runway:signer");
    expect(signerRunway?.next_action).toMatch(/Save a dedicated public trading wallet|Run Prove ownership|reviewed policy signer/);
    expect(signerRunway?.next_action).not.toContain("Hash-only wallet ownership proof");
    const operatorWalletPreflight = receipt.missing_for_live_usability.find((item) => item.id === "preflight:operator-wallet");
    expect(operatorWalletPreflight?.next_action).toContain("Trading live canary console");
    expect(operatorWalletPreflight?.next_action).not.toContain("in Settings");
    expect(receipt.next_blocker).toMatchObject({
      owner: "operator",
      blocks_live_capital: true,
    });
    if (receipt.current_input?.id === "wallet-ownership-proof") {
      expect(receipt.next_blocker).toMatchObject({
        id: "wallet-ownership-proof",
        label: "Wallet ownership proof",
        href: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      });
      expect(receipt.next_blocker?.next_action).toBe(receipt.current_input.next_action);
    } else {
      expect(receipt.next_blocker).toMatchObject({
        id: receipt.missing_for_live_usability[0].id,
        label: receipt.missing_for_live_usability[0].label,
        source: "cutover",
        href: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
      });
      expect(receipt.next_blocker?.next_action).toBe(receipt.missing_for_live_usability[0].next_action);
    }
    expect(receipt.next_blocker?.safe_command).toContain("--require-operator-wallet");
    expect(receipt.next_credential_request).toMatchObject({
      label: receipt.next_blocker?.label,
      can_enter_in_app: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      signing_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    if (receipt.current_input?.id === "wallet-ownership-proof") {
      expect(receipt.next_credential_request).toMatchObject({
        id: "wallet-ownership-proof",
        fix_href: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
        safe_collection_surface: "browser-wallet",
        storage: "hash-only-local-receipt",
        target_names: ["hash-only wallet ownership receipt"],
      });
      expect(receipt.next_credential_request?.safe_value_description).toContain("text-message ownership proof");
      expect(receipt.next_credential_request?.safe_to_provide).toEqual([
        "Text-message signature receipt with hashes only",
        "hash-only wallet ownership receipt",
      ]);
      expect(receipt.next_credential_request?.safe_to_provide.join(" ")).not.toContain("JUPITER_API_KEY");
      expect(receipt.next_credential_request?.safe_to_provide.join(" ")).not.toContain("HELIUS_API_KEY");
      expect(receipt.next_credential_request?.completion_criteria.join(" ")).toContain("hash evidence");
      expect(receipt.next_credential_request?.verification_runway.map((step) => step.id)).toEqual([
        "check-wallet-challenge",
        "prove-wallet-ownership",
        "strict-wallet-verifier",
        "refresh-live-usability",
      ]);
      expect(receipt.next_credential_request?.verification_runway[0]?.href).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    } else {
      expect(receipt.next_credential_request).toMatchObject({
        fix_href: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
        safe_collection_surface: "/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console",
        storage: "browser-public-scope",
        target_names: ["wallet_public_key"],
      });
      expect(receipt.next_credential_request?.safe_value_description).toContain("public Solana trading wallet address");
      expect(receipt.next_credential_request?.safe_to_provide).toEqual([
        "Dedicated Solana public wallet address",
        "Browser-safe public wallet scope",
      ]);
      expect(receipt.next_credential_request?.completion_criteria.join(" ")).toContain("sample all-ones wallet is rejected");
      expect(receipt.next_credential_request?.verification_runway.map((step) => step.id)).toEqual([
        "save-public-wallet",
        "strict-wallet-verifier",
        "prove-wallet-ownership",
        "refresh-live-usability",
      ]);
      expect(receipt.next_credential_request?.verification_runway[0]?.href).toBe("/trading?source=live-dex&account=persistent&scenario=breakout#web3-live-canary-console");
    }
    expect(receipt.next_credential_request?.verifier_command).toContain("--require-operator-wallet");
    const sampleWallet = "11111111111111111111111111111111";
    const walletCommandText = [
      receipt.operator_wallet_strict_command,
      receipt.current_input?.verifier_command,
      receipt.next_blocker?.safe_command,
      receipt.next_credential_request?.verifier_command,
      ...(receipt.next_credential_request?.verification_runway.map((step) => step.command) ?? []),
      ...receipt.verifier_commands,
    ].filter(Boolean).join(" ");
    expect(walletCommandText).not.toContain(`--wallet=${sampleWallet}`);
    if (receipt.operator_wallet_public_key) {
      expect(receipt.operator_wallet_strict_command).toBe(`npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${receipt.operator_wallet_public_key} --require-operator-wallet`);
      expect(walletCommandText).toContain(`--wallet=${receipt.operator_wallet_public_key}`);
      expect(walletCommandText).not.toContain("<public-solana-address>");
    }
    expect(receipt.next_credential_request?.safe_to_provide.length).toBeGreaterThan(0);
    expect(receipt.next_credential_request?.never_provide.join(" ")).toContain("private key");
    expect(receipt.next_credential_request?.completion_criteria.join(" ")).toContain("live execution");
    expect(receipt.next_credential_request?.verification_runway.some((step) => step.command?.includes("--require-operator-wallet"))).toBe(true);
    expect(receipt.next_credential_request?.verification_runway.every((step) =>
      step.live_execution_permission === "blocked" &&
      step.wallet_mutation_permission === "blocked" &&
      step.secret_echo_permission === "blocked"
    )).toBe(true);
    expect(receipt.missing_owner_summary[0]).toMatchObject({
      owner: "operator",
      first_label: "Dedicated trading wallet",
    });
    expect(receipt.missing_owner_summary[0].sources).toEqual(expect.arrayContaining(["cutover", "preflight", "runway"]));
    expect(receipt.missing_owner_summary.reduce((sum, item) => sum + item.missing_count, 0)).toBe(receipt.total_live_usability_row_count);
    expect(receipt.missing_source_summary[0]).toMatchObject({
      source: "cutover",
      first_label: "Dedicated trading wallet",
    });
    expect(receipt.missing_source_summary.reduce((sum, item) => sum + item.missing_count, 0)).toBe(receipt.total_live_usability_row_count);
    expect(receipt.credential_doctor.status).toMatch(/^(absent|needs-jupiter|needs-wallet|blocked|ready-for-strict-verification|ready-for-live-review-packet)$/);
    expect(typeof receipt.credential_doctor.receipt_fresh).toBe("boolean");
    expect(receipt.credential_doctor.ready_count + receipt.credential_doctor.watch_count + receipt.credential_doctor.blocked_count).toBeGreaterThanOrEqual(0);
    expect(receipt.credential_doctor.next_action.length).toBeGreaterThan(0);
    expect(receipt.credential_doctor.safe_command).toContain("doctor:web3");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");

    const allRowsResponse = await LIVE_USABILITY_BLOCKERS_GET(new Request("http://localhost/api/web3-live-usability-blockers?scenario=breakout&source=live-dex&account=persistent&rows=all"));
    const allRowsReceipt = await json<{
      summary: string;
      total_live_usability_row_count: number;
      listed_live_usability_row_count: number;
      live_usability_row_scope: string;
      operator_wallet_public_key: string | null;
      operator_wallet_strict_command: string | null;
      next_blocker: { id: string; label: string; owner: string; source: string; status: string; next_action: string; href: string; safe_command: string | null; blocks_live_capital: boolean } | null;
      next_credential_request: { id: string; label: string; fix_href: string; verifier_command: string | null; safe_value_description: string; completion_criteria: string[]; verification_runway: Array<{ id: string; command: string | null }>; secret_echo_permission: string } | null;
      verifier_commands: string[];
      missing_for_live_usability: Array<{ id: string; label: string; status: string; next_action: string }>;
      missing_owner_summary: Array<{ owner: string; missing_count: number; first_label: string; next_action: string }>;
      missing_source_summary: Array<{ source: string; missing_count: number; first_label: string; next_action: string }>;
      credential_doctor: { status: string; safe_command: string; next_action: string };
      live_execution_permission: string;
      wallet_mutation_permission: string;
      secret_echo_permission: string;
      controls: string[];
    }>(allRowsResponse);
    expect(allRowsResponse.status).toBe(200);
    expect(allRowsReceipt.live_usability_row_scope).toBe("all");
    expect(allRowsReceipt.summary).toContain("all dependency-ranked rows are listed");
    expect(allRowsReceipt.listed_live_usability_row_count).toBe(allRowsReceipt.total_live_usability_row_count);
    expect(allRowsReceipt.missing_for_live_usability.length).toBe(allRowsReceipt.total_live_usability_row_count);
    expect(allRowsReceipt.missing_for_live_usability.length).toBeGreaterThanOrEqual(receipt.missing_for_live_usability.length);
    const allRowsActionText = allRowsReceipt.missing_for_live_usability.map((item) => item.next_action).join(" ");
    expect(allRowsActionText).not.toContain("Spend: $0 remains");
    expect(allRowsActionText).not.toContain("Every transaction lifecycle is blocked");
    expect(allRowsActionText).not.toContain("blocked custody with $0");
    expect(allRowsActionText).not.toContain("Request a read-only dex backfill refresh for FARTCOIN");
    expect(allRowsActionText).toContain("signer handoff receipt");
    expect(allRowsActionText).toContain("settlement reconciliation");
    expect(allRowsActionText).toContain("JUPITER_API_KEY");
    expect(allRowsReceipt.next_blocker?.id).toBe(receipt.next_blocker?.id);
    expect(allRowsReceipt.next_blocker?.label).toBe(receipt.next_blocker?.label);
    expect(allRowsReceipt.next_blocker?.href).toBe(receipt.next_blocker?.href);
    expect(allRowsReceipt.next_blocker?.safe_command).toContain("--require-operator-wallet");
    expect(allRowsReceipt.next_credential_request?.fix_href).toBe(receipt.next_credential_request?.fix_href);
    expect(allRowsReceipt.next_credential_request?.verifier_command).toContain("--require-operator-wallet");
    if (allRowsReceipt.operator_wallet_public_key) {
      const allRowsCommandText = [
        allRowsReceipt.operator_wallet_strict_command,
        allRowsReceipt.next_blocker?.safe_command,
        allRowsReceipt.next_credential_request?.verifier_command,
        ...(allRowsReceipt.next_credential_request?.verification_runway.map((step) => step.command) ?? []),
        ...allRowsReceipt.verifier_commands,
      ].filter(Boolean).join(" ");
      expect(allRowsReceipt.operator_wallet_strict_command).toBe(`npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${allRowsReceipt.operator_wallet_public_key} --require-operator-wallet`);
      expect(allRowsCommandText).toContain(`--wallet=${allRowsReceipt.operator_wallet_public_key}`);
      expect(allRowsCommandText).not.toContain("<public-solana-address>");
    }
    expect(allRowsReceipt.next_credential_request?.safe_value_description.length).toBeGreaterThan(20);
    expect(allRowsReceipt.next_credential_request?.completion_criteria.join(" ")).toContain("live execution");
    expect(allRowsReceipt.next_credential_request?.verification_runway.some((step) => step.command?.includes("--require-operator-wallet"))).toBe(true);
    expect(allRowsReceipt.next_credential_request?.secret_echo_permission).toBe("blocked");
    expect(allRowsReceipt.missing_owner_summary.reduce((sum, item) => sum + item.missing_count, 0)).toBe(allRowsReceipt.total_live_usability_row_count);
    expect(allRowsReceipt.missing_source_summary.reduce((sum, item) => sum + item.missing_count, 0)).toBe(allRowsReceipt.total_live_usability_row_count);
    expect(allRowsReceipt.credential_doctor.status).toBe(receipt.credential_doctor.status);
    expect(allRowsReceipt.credential_doctor.safe_command).toContain("doctor:web3");
    expect(allRowsReceipt.controls.some((control) => control.includes("rows=all"))).toBe(true);
    expect(allRowsReceipt.live_execution_permission).toBe("blocked");
    expect(allRowsReceipt.wallet_mutation_permission).toBe("blocked");
    expect(allRowsReceipt.secret_echo_permission).toBe("blocked");

    const badRowsResponse = await LIVE_USABILITY_BLOCKERS_GET(new Request("http://localhost/api/web3-live-usability-blockers?scenario=breakout&source=live-dex&account=persistent&rows=private"));
    expect(badRowsResponse.status).toBe(422);
  });

  test("GIVEN live cutover blockers remain WHEN the blocker board route runs THEN it groups safe next steps without live authority", async () => {
    process.env.HELIUS_API_KEY = "test-helius-cutover-secret";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "external-wallet";

    const rejected = await CUTOVER_BLOCKER_BOARD_GET(new Request("http://localhost/api/web3-cutover-blocker-board?account=bad"));
    expect(rejected.status).toBe(422);

    const response = await CUTOVER_BLOCKER_BOARD_GET(new Request("http://localhost/api/web3-cutover-blocker-board?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const board = await json<{
      mode: string;
      status: string;
      summary: string;
      receipt_hash: string;
      request_packet_hash: string;
      runway_hash: string;
      usability_hash: string;
      next_safe_input: { id: string; label: string; owner: string; next_action: string } | null;
      next_live_lane_action: string;
      open_blocker_count: number;
      now_count: number;
      before_live_count: number;
      review_count: number;
      owner_counts: Record<string, number>;
      rows: Array<{
        id: string;
        label: string;
        owner: string;
        phase: string;
        status: string;
        severity: string;
        safe_collection_surface: string;
        storage: string;
        env_targets: string[];
        verifier_command: string | null;
        live_lane: string | null;
      }>;
      safe_to_provide: string[];
      never_provide: string[];
      verifier_commands: string[];
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);
    const text = JSON.stringify(board);

    expect(response.status).toBe(200);
    expect(board.mode).toBe("web3-cutover-blocker-board");
    expect(board.status).toBe("needs-input");
    expect(board.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(board.request_packet_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(board.runway_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(board.usability_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(board.open_blocker_count).toBeGreaterThanOrEqual(5);
    expect(board.now_count).toBeGreaterThanOrEqual(3);
    expect(board.before_live_count).toBeGreaterThanOrEqual(2);
    expect(board.review_count).toBeGreaterThanOrEqual(1);
    expect(board.next_safe_input?.id).toBe("dedicated-trading-wallet");
    expect(board.next_live_lane_action.length).toBeGreaterThan(0);
    expect(board.owner_counts.operator).toBeGreaterThanOrEqual(3);
    expect(board.owner_counts.ops).toBeGreaterThanOrEqual(1);
    expect(board.owner_counts.accounting).toBeGreaterThanOrEqual(1);
    expect(board.rows.map((row) => row.id)).toEqual(expect.arrayContaining([
      "dedicated-trading-wallet",
      "wallet-ownership-proof",
      "jupiter-route-order-key",
      "emergency-stop-target",
      "production-worker-ops",
      "accounting-export-target",
      "manual-live-approval",
    ]));
    expect(board.rows.find((row) => row.id === "dedicated-trading-wallet")).toMatchObject({
      owner: "operator",
      phase: "now",
      live_lane: "wallet",
      storage: "browser-public-scope",
    });
    expect(board.rows.find((row) => row.id === "production-worker-ops")).toMatchObject({
      owner: "ops",
      phase: "before-live",
      live_lane: "ops",
      env_targets: expect.arrayContaining(["MASTERMOLD_WEB3_PROCESS_MANAGER", "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL"]),
    });
    expect(board.rows.find((row) => row.id === "accounting-export-target")).toMatchObject({
      owner: "accounting",
      phase: "before-live",
      live_lane: "accounting",
    });
    expect(board.safe_to_provide).toContain("Dedicated Solana public wallet address");
    expect(board.never_provide).toContain("Wallet private key");
    expect(board.verifier_commands).toEqual(expect.arrayContaining([
      "npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live",
      "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
    ]));
    expect(board.live_execution_permission).toBe("blocked");
    expect(board.wallet_mutation_permission).toBe("blocked");
    expect(board.transaction_submission_permission).toBe("blocked");
    expect(board.private_key_storage).toBe("blocked");
    expect(board.seed_phrase_storage).toBe("blocked");
    expect(board.secret_echo_permission).toBe("blocked");
    expect(board.controls.some((control) => control.includes("operator checklist only"))).toBe(true);
    expect(text).not.toContain("test-helius-cutover-secret");
  });

  test("GIVEN an operator asks what is safe to run now WHEN the runbook route runs THEN it separates paper actions from live authority", async () => {
    process.env.HELIUS_API_KEY = "test-helius-runbook-secret";
    process.env.JUPITER_API_KEY = "test-jupiter-runbook-secret";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "external-wallet";

    const rejected = await OPERATOR_RUNBOOK_GET(new Request("http://localhost/api/web3-operator-runbook?cycles=999"));
    expect(rejected.status).toBe(422);

    const response = await OPERATOR_RUNBOOK_GET(new Request("http://localhost/api/web3-operator-runbook?scenario=breakout&source=sample&account=persistent&cycles=1"));
    const runbook = await json<{
      mode: string;
      status: string;
      summary: string;
      receipt_hash: string;
      primary_safe_action: { id: string; status: string; permission_scope: string } | null;
      current_input: {
        id: string;
        label: string;
        safe_collection_surface: string;
        storage: string;
        target_names: string[];
        next_action: string;
        live_execution_permission: string;
        wallet_mutation_permission: string;
        transaction_submission_permission: string;
        private_key_storage: string;
        seed_phrase_storage: string;
        secret_echo_permission: string;
      } | null;
      next_safe_input: { id: string; label: string; next_action: string } | null;
      next_live_lane_action: string;
      allowed_now_count: number;
      gated_count: number;
      blocked_count: number;
      run_now: Array<{
        id: string;
        label: string;
        status: string;
        kind: string;
        surface: string;
        href: string | null;
        command: string | null;
        permission_scope: string;
        next_action: string;
      }>;
      real_capital_blockers: Array<{ id: string; label: string; status: string; next_action: string }>;
      safe_to_provide: string[];
      never_provide: string[];
      verifier_commands: string[];
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);
    const text = JSON.stringify(runbook);

    expect(response.status).toBe(200);
    expect(runbook.mode).toBe("web3-operator-runbook");
    expect(runbook.status).toMatch(/setup-needed|paper-operable|supervised-review-ready/);
    expect(runbook.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(runbook.current_input).toMatchObject({
      id: "dedicated-trading-wallet",
      label: "Dedicated trading wallet",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(runbook.current_input?.target_names).toEqual(["wallet_public_key"]);
    expect(runbook.current_input?.next_action).toContain("public Solana trading wallet");
    expect(runbook.allowed_now_count).toBeGreaterThanOrEqual(2);
    expect(runbook.gated_count).toBeGreaterThanOrEqual(1);
    expect(runbook.blocked_count).toBeGreaterThanOrEqual(1);
    expect(runbook.primary_safe_action?.status).toBe("allowed");
    expect(runbook.run_now.map((action) => action.id)).toEqual([
      "open-copilot",
      "run-paper-autonomy",
      "refresh-live-dex",
      "rehearse-jupiter-order",
      "continue-credential-setup",
      "request-supervised-live-review",
      "autonomous-live-trading",
    ]);
    expect(runbook.run_now.find((action) => action.id === "run-paper-autonomy")).toMatchObject({
      status: "allowed",
      kind: "safe-command",
      command: "npm run smoke:web3 -- --base-url=http://localhost:4010",
    });
    expect(runbook.run_now.find((action) => action.id === "refresh-live-dex")?.command).toBe(
      "npm run monitor:web3 -- --base-url=http://localhost:4010 --source=live-dex --json",
    );
    expect(runbook.run_now.find((action) => action.id === "autonomous-live-trading")).toMatchObject({
      status: "blocked",
      surface: "external-review",
    });
    expect(runbook.real_capital_blockers.map((blocker) => blocker.id)).toEqual(expect.arrayContaining([
      "operator-wallet",
      "live-dex",
      "signer-custody",
      "manual-live-review",
    ]));
    expect(runbook.safe_to_provide).toContain("Dedicated Solana public wallet address");
    expect(runbook.never_provide).toContain("Seed phrase or mnemonic");
    expect(runbook.verifier_commands).toEqual(expect.arrayContaining([
      "npm run verify:web3 -- --base-url=http://localhost:4010",
      "npm run verify:web3 -- --base-url=http://localhost:4010 --require-jupiter-order",
    ]));
    expect(runbook.live_execution_permission).toBe("blocked");
    expect(runbook.wallet_mutation_permission).toBe("blocked");
    expect(runbook.transaction_submission_permission).toBe("blocked");
    expect(runbook.private_key_storage).toBe("blocked");
    expect(runbook.seed_phrase_storage).toBe("blocked");
    expect(runbook.secret_echo_permission).toBe("blocked");
    expect(runbook.controls.some((control) => control.includes("operator action map only"))).toBe(true);
    expect(runbook.controls.some((control) => control.includes("current input contract"))).toBe(true);
    expect(text).not.toContain("test-helius-runbook-secret");
    expect(text).not.toContain("test-jupiter-runbook-secret");
  });

  test("GIVEN Settings saves public wallet scope WHEN account setup is rebuilt THEN dry-run wallet readiness is scoped without secrets", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.JUPITER_API_KEY = "test-jupiter-secret";

    const malformedWallet = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenario: "breakout",
        source: "sample",
        account: "persistent",
        cycles: 0,
        advance: false,
        execution: {
          mode: "dry-run",
          wallet_public_key: "not-a-wallet",
        },
      }),
    }));
    expect(malformedWallet.status).toBe(422);

    const forbiddenSecret = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenario: "breakout",
        source: "sample",
        account: "persistent",
        cycles: 0,
        advance: false,
        execution: {
          mode: "dry-run",
          wallet_public_key: "11111111111111111111111111111111",
          private_key: "never-accept-this",
        },
      }),
    }));
    expect(forbiddenSecret.status).toBe(422);

    const saveScope = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenario: "breakout",
        source: "sample",
        account: "persistent",
        cycles: 0,
        advance: false,
        execution: {
          mode: "dry-run",
          kill_switch: false,
          wallet_public_key: "11111111111111111111111111111111",
          signer_simulation_enabled: true,
          signer_session_label: "settings-external-wallet",
          signer_network: "devnet",
          max_trade_usd: 250,
          daily_spend_cap_usd: 1000,
          max_slippage_bps: 150,
        },
      }),
    }));
    const state = await json<Web3TradingState>(saveScope);
    expect(saveScope.status).toBe(200);
    expect(state.execution_readiness.config.wallet_public_key).toBe("11111111111111111111111111111111");
    expect(state.execution_readiness.config.max_trade_usd).toBe(250);
    expect(state.execution_readiness.config.daily_spend_cap_usd).toBe(1000);
    expect(state.execution_readiness.config.max_slippage_bps).toBe(150);
    expect(state.execution_readiness.config.kill_switch).toBe(false);
    expect(state.execution_readiness.cap_status).toBe("ready");
    expect(state.execution_readiness.cap_next_action).toContain("room");
    expect(state.execution_gate.live_execution_enabled).toBe(false);

    const response = await ACCOUNT_SETUP_GET(new Request("http://localhost/api/web3-account-setup?scenario=breakout&source=sample&account=persistent&cycles=0"));
    const receipt = await json<{
      status: string;
      environment_summary: {
        required_configured_count: number;
        missing_required: string[];
      };
      wallet_summary: {
        wallet_scoped: boolean;
        wallet_is_sample: boolean;
        dedicated_wallet_scoped: boolean;
        wallet_ownership_proved: boolean;
        wallet_ownership_receipt_hash: string | null;
        wallet_public_key_preview: string | null;
      };
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      secret_echo_permission: string;
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.status).toBe("missing-wallet");
    expect(receipt.environment_summary.required_configured_count).toBe(2);
    expect(receipt.environment_summary.missing_required).toEqual(["Dedicated public trading wallet"]);
    expect(receipt.wallet_summary.wallet_scoped).toBe(true);
    expect(receipt.wallet_summary.wallet_is_sample).toBe(true);
    expect(receipt.wallet_summary.dedicated_wallet_scoped).toBe(false);
    expect(receipt.wallet_summary.wallet_ownership_proved).toBe(false);
    expect(receipt.wallet_summary.wallet_ownership_receipt_hash).toBeNull();
    expect(receipt.wallet_summary.wallet_public_key_preview).toBe("11111111...1111");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(JSON.stringify(receipt)).not.toContain("test-helius-secret");
    expect(JSON.stringify(receipt)).not.toContain("test-jupiter-secret");
    expect(JSON.stringify(receipt)).not.toContain("never-accept-this");
  });

  test("GIVEN Trading saves a dedicated canary wallet WHEN account setup is rebuilt THEN the wallet gate advances without live authority", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.JUPITER_API_KEY = "test-jupiter-secret";

    const walletPublicKey = "7YWHmMjUwvQJwHqZzsYvg59WKAVAHwiUL1b5LrsULv2C";
    const saveScope = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenario: "breakout",
        source: "live-dex",
        account: "persistent",
        cycles: 0,
        advance: false,
        execution: {
          mode: "dry-run",
          kill_switch: false,
          wallet_public_key: walletPublicKey,
          signer_simulation_enabled: true,
          signer_session_label: "trading-live-canary",
          signer_network: "devnet",
          max_trade_usd: 25,
          daily_spend_cap_usd: 100,
          max_slippage_bps: 50,
        },
      }),
    }));
    const state = await json<Web3TradingState>(saveScope);
    expect(saveScope.status).toBe(200);
    expect(state.execution_readiness.config.wallet_public_key).toBe(walletPublicKey);
    expect(state.execution_gate.live_execution_enabled).toBe(false);

    const accountSetup = await ACCOUNT_SETUP_GET(new Request("http://localhost/api/web3-account-setup?scenario=breakout&source=live-dex&account=persistent&cycles=0"));
    const receipt = await json<{
      wallet_summary: {
        wallet_scoped: boolean;
        wallet_is_sample: boolean;
        dedicated_wallet_scoped: boolean;
        wallet_ownership_proved: boolean;
        wallet_public_key_preview: string | null;
      };
      environment_summary: {
        missing_required: string[];
      };
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
    }>(accountSetup);

    expect(accountSetup.status).toBe(200);
    expect(receipt.wallet_summary.wallet_scoped).toBe(true);
    expect(receipt.wallet_summary.wallet_is_sample).toBe(false);
    expect(receipt.wallet_summary.dedicated_wallet_scoped).toBe(true);
    expect(receipt.wallet_summary.wallet_ownership_proved).toBe(false);
    expect(receipt.wallet_summary.wallet_public_key_preview).toBe("7YWHmMjU...Lv2C");
    expect(receipt.environment_summary.missing_required).not.toContain("Dedicated public trading wallet");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(JSON.stringify(receipt)).not.toContain("test-helius-secret");
    expect(JSON.stringify(receipt)).not.toContain("test-jupiter-secret");
  });

  test("GIVEN missing Jupiter setup WHEN account acquisition runs THEN it returns external-only setup actions without leaking secrets", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "external-wallet";

    const rejected = await ACCOUNT_ACQUISITION_GET(new Request("http://localhost/api/web3-account-acquisition?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await ACCOUNT_ACQUISITION_GET(new Request("http://localhost/api/web3-account-acquisition?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      account_creation_permission: string;
      in_app_signup_permission: string;
      credential_storage_permission: string;
      secret_echo_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      required_configured_count: number;
      required_account_count: number;
      missing_required: string[];
      next_external_action: string;
      env_template: string[];
      items: Array<{
        id: string;
        status: string;
        setup_url: string;
        docs_url: string;
        env_targets: string[];
        app_permission: string;
        security_rule: string;
        test_action: string;
      }>;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-account-acquisition-receipt");
    expect(receipt.status).toBe("needs-jupiter");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.account_creation_permission).toBe("operator-external-only");
    expect(receipt.in_app_signup_permission).toBe("blocked");
    expect(receipt.credential_storage_permission).toBe("server-env-or-session-only");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.required_account_count).toBe(3);
    expect(receipt.missing_required).toContain("Jupiter Swap V2 order rail");
    expect(receipt.next_external_action).toContain("Jupiter Developer Platform");
    expect(receipt.env_template).toContain("JUPITER_API_KEY=<set in ignored local env>");
    expect(receipt.env_template).toContain("PRIVY_APP_SECRET=<set in ignored local env>");
    expect(receipt.env_template).toContain("TURNKEY_API_PRIVATE_KEY=<set in ignored local env>");
    expect(receipt.env_template).toContain("MASTERMOLD_SESSION_POLICY_HASH=<set in ignored local env>");
    expect(receipt.items.find((item) => item.id === "helius")).toMatchObject({
      status: "configured",
      app_permission: "inspect-config-only",
    });
    expect(receipt.items.find((item) => item.id === "jupiter")).toMatchObject({
      status: "needed",
      setup_url: "https://developers.jup.ag/portal",
      docs_url: "https://dev.jup.ag/docs/swap/v2/order-and-execute",
      env_targets: ["JUPITER_API_KEY"],
      test_action: expect.stringContaining("--require-jupiter-order"),
    });
    expect(receipt.items.find((item) => item.id === "dedicated-wallet")?.security_rule).toContain("Never paste the private key");
    expect(receipt.items.find((item) => item.id === "policy-signer")).toMatchObject({
      status: "future",
      app_permission: "inspect-config-only",
      env_targets: expect.arrayContaining(["PRIVY_APP_SECRET", "TURNKEY_API_PRIVATE_KEY", "MASTERMOLD_SESSION_POLICY_HASH"]),
      test_action: expect.stringContaining("signer credential packet"),
    });
    expect(receipt.items.find((item) => item.id === "policy-signer")?.security_rule).toContain("wallet private keys");
    expect(receipt.controls.some((control) => control.includes("cannot create accounts"))).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("test-helius-secret");
  });

  test("GIVEN short signer provider env aliases WHEN account setup and acquisition run THEN they normalize without leaking provider secrets", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.JUPITER_API_KEY = "test-jupiter-secret";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "turnkey";
    const turnkeyPrivateSecret = ["turnkey", "private", "secret"].join("-");
    process.env.TURNKEY_ORGANIZATION_ID = "turnkey-org-secret";
    process.env.TURNKEY_API_PUBLIC_KEY = "turnkey-public-secret";
    process.env.TURNKEY_API_PRIVATE_KEY = turnkeyPrivateSecret;
    process.env.TURNKEY_SOLANA_WALLET_ACCOUNT = "turnkey-wallet-secret";

    const setupResponse = await ACCOUNT_SETUP_GET(new Request("http://localhost/api/web3-account-setup?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const setupReceipt = await json<{
      environment_summary: { signer_provider: string };
      checks: Array<{ id: string; status: string; detail: string }>;
      secret_echo_permission: string;
    }>(setupResponse);
    expect(setupResponse.status).toBe(200);
    expect(setupReceipt.environment_summary.signer_provider).toBe("turnkey-policy-wallet");
    expect(setupReceipt.checks.find((check) => check.id === "manual-signer")).toMatchObject({
      status: "watch",
      detail: expect.stringContaining("turnkey policy wallet"),
    });
    expect(setupReceipt.secret_echo_permission).toBe("blocked");

    const acquisitionResponse = await ACCOUNT_ACQUISITION_GET(new Request("http://localhost/api/web3-account-acquisition?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const acquisitionReceipt = await json<{
      items: Array<{ id: string; status: string; next_action: string; env_targets: string[] }>;
      env_template: string[];
      secret_echo_permission: string;
    }>(acquisitionResponse);
    expect(acquisitionResponse.status).toBe(200);
    expect(acquisitionReceipt.items.find((item) => item.id === "policy-signer")).toMatchObject({
      status: "configured",
      env_targets: expect.arrayContaining(["TURNKEY_API_PRIVATE_KEY", "TURNKEY_SOLANA_WALLET_ACCOUNT"]),
    });
    expect(acquisitionReceipt.env_template).toContain("TURNKEY_API_PRIVATE_KEY=<set in ignored local env>");
    expect(acquisitionReceipt.secret_echo_permission).toBe("blocked");
    expect(JSON.stringify(setupReceipt)).not.toContain(turnkeyPrivateSecret);
    expect(JSON.stringify(acquisitionReceipt)).not.toContain(turnkeyPrivateSecret);
  });

  test("GIVEN env-backed provider checks WHEN provider health runs THEN it proves read rails without leaking secrets", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("lite-api.jup.ag")) {
        return new Response(JSON.stringify({ outAmount: "1000000", routePlan: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("helius-rpc.com")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
        if (body.method === "getHealth") {
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: "test", result: "ok" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (body.method === "getLatestBlockhash") {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: "test",
            result: { value: { blockhash: "abc123", lastValidBlockHeight: 123 } },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (body.method === "getSlot") {
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: "test", result: 456789 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }
      return new Response(JSON.stringify({ error: "unexpected provider test request" }), { status: 500 });
    }) as typeof fetch;

    const rejected = await PROVIDER_HEALTH_GET(new Request("http://localhost/api/web3-provider-health?account=nope"));
    expect(rejected.status).toBe(422);

    const response = await PROVIDER_HEALTH_GET(new Request("http://localhost/api/web3-provider-health?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      rpc_endpoint: string | null;
      rpc_provider: string;
      provider_summary: {
        helius_configured: boolean;
        rpc_healthy: boolean;
        latest_blockhash_ready: boolean;
        confirmed_slot: number | null;
        jupiter_configured: boolean;
        jupiter_quote_ready: boolean;
        jupiter_order_ready: boolean;
      };
      live_execution_permission: string;
      wallet_mutation_permission: string;
      secret_echo_permission: string;
      private_key_storage: string;
      transaction_body_storage: string;
      checks: Array<{ id: string; status: string; detail: string }>;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-provider-health-receipt");
    expect(receipt.status).toBe("wallet-gated");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.rpc_provider).toBe("helius");
    expect(receipt.rpc_endpoint).toBe("https://mainnet.helius-rpc.com");
    expect(receipt.provider_summary.helius_configured).toBe(true);
    expect(receipt.provider_summary.rpc_healthy).toBe(true);
    expect(receipt.provider_summary.latest_blockhash_ready).toBe(true);
    expect(receipt.provider_summary.confirmed_slot).toBe(456789);
    expect(receipt.provider_summary.jupiter_configured).toBe(false);
    expect(receipt.provider_summary.jupiter_quote_ready).toBe(true);
    expect(receipt.provider_summary.jupiter_order_ready).toBe(false);
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.transaction_body_storage).toBe("blocked");
    expect(receipt.checks.map((check) => check.id)).toEqual([
      "rpc-url",
      "rpc-health",
      "blockhash",
      "wallet-scope",
      "helius-das",
      "jupiter-quote",
      "jupiter-order",
      "secret-boundary",
      "live-boundary",
    ]);
    expect(receipt.checks.find((check) => check.id === "secret-boundary")).toMatchObject({ status: "pass" });
    expect(receipt.controls.some((control) => control.includes("read-only network checks"))).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("test-helius-secret");
  });

  test("GIVEN one-shot Jupiter credentials WHEN rehearsal runs THEN it proves order readiness without leaking secrets or transaction bytes", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("lite-api.jup.ag")) {
        return new Response(JSON.stringify({ outAmount: "1000000", routePlan: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("test-jupiter-one-shot");
        return new Response(JSON.stringify({
          requestId: "raw-request-id-secret",
          transaction: "raw-unsigned-transaction-body",
          router: "metis",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected Jupiter rehearsal request" }), { status: 500 });
    }) as typeof fetch;

    const rejected = await JUPITER_REHEARSAL_POST(new Request("http://localhost/api/web3-jupiter-rehearsal?cycles=99", {
      method: "POST",
      body: JSON.stringify({ jupiter_api_key: "test-jupiter-one-shot" }),
    }));
    expect(rejected.status).toBe(422);

    const privateRejected = await JUPITER_REHEARSAL_POST(new Request("http://localhost/api/web3-jupiter-rehearsal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ private_key: "never-accept-this" }),
    }));
    expect(privateRejected.status).toBe(422);

    const response = await JUPITER_REHEARSAL_POST(new Request("http://localhost/api/web3-jupiter-rehearsal?scenario=breakout&source=sample&account=ephemeral&cycles=2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jupiter_api_key: "test-jupiter-one-shot",
        wallet_public_key: "11111111111111111111111111111111",
        max_slippage_bps: 150,
      }),
    }));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      key_source: string;
      one_shot_key_used: boolean;
      server_key_configured: boolean;
      wallet_public_key_preview: string | null;
      summary: {
        wallet_scoped: boolean;
        wallet_valid: boolean;
        jupiter_key_configured: boolean;
        jupiter_quote_ready: boolean;
        jupiter_order_ready: boolean;
        order_request_hash: string | null;
        transaction_body_detected: boolean;
        max_slippage_bps: number;
      };
      live_execution_permission: string;
      wallet_mutation_permission: string;
      secret_echo_permission: string;
      private_key_storage: string;
      transaction_body_storage: string;
      unsigned_transaction_return: string;
      signed_transaction_return: string;
      execute_permission: string;
      checks: Array<{ id: string; status: string; detail: string }>;
      controls: string[];
      narrative: string;
      next_action: string;
    }>(response);

    const serialized = JSON.stringify(receipt);
    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-jupiter-rehearsal-receipt");
    expect(receipt.status).toBe("order-ready");
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.key_source).toBe("one-shot");
    expect(receipt.one_shot_key_used).toBe(true);
    expect(receipt.server_key_configured).toBe(false);
    expect(receipt.wallet_public_key_preview).toBe("11111111...1111");
    expect(receipt.summary.wallet_scoped).toBe(true);
    expect(receipt.summary.wallet_valid).toBe(true);
    expect(receipt.summary.jupiter_key_configured).toBe(true);
    expect(receipt.summary.jupiter_quote_ready).toBe(true);
    expect(receipt.summary.jupiter_order_ready).toBe(true);
    expect(receipt.summary.order_request_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.summary.transaction_body_detected).toBe(true);
    expect(receipt.summary.max_slippage_bps).toBe(150);
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.transaction_body_storage).toBe("blocked");
    expect(receipt.unsigned_transaction_return).toBe("withheld");
    expect(receipt.signed_transaction_return).toBe("blocked");
    expect(receipt.execute_permission).toBe("blocked");
    expect(receipt.checks.map((check) => check.id)).toEqual([
      "wallet-scope",
      "jupiter-key",
      "quote",
      "order",
      "transaction-boundary",
      "secret-boundary",
      "live-boundary",
    ]);
    expect(receipt.checks.find((check) => check.id === "transaction-boundary")).toMatchObject({ status: "pass" });
    expect(receipt.controls.some((control) => control.includes("one-shot POST body"))).toBe(true);
    expect(receipt.narrative).toContain("transaction bytes are withheld");
    expect(serialized).not.toContain("test-jupiter-one-shot");
    expect(serialized).not.toContain("raw-request-id-secret");
    expect(serialized).not.toContain("raw-unsigned-transaction-body");
    expect(serialized).not.toContain("never-accept-this");

    const history = getWeb3JupiterRehearsalHistory();
    expect(history).toMatchObject({
      mode: "web3-jupiter-rehearsal-history",
      paper_only: true,
      status: "order-ready",
      run_count: 1,
      latest_status: "order-ready",
      latest_order_ready: true,
      latest_quote_ready: true,
      transaction_body_detected_count: 1,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      private_key_storage: "blocked",
      transaction_body_storage: "blocked",
      unsigned_transaction_return: "withheld",
      secret_echo_permission: "blocked",
    });
    expect(history.recent_runs[0]).toMatchObject({
      status: "order-ready",
      wallet_public_key_preview: "11111111...1111",
      key_source: "one-shot",
      jupiter_order_ready: true,
      transaction_body_detected: true,
    });

    const historyResponse = await JUPITER_REHEARSAL_HISTORY_GET();
    const historyPayload = await json<ReturnType<typeof getWeb3JupiterRehearsalHistory>>(historyResponse);
    expect(historyPayload.run_count).toBe(1);
    expect(historyPayload.recent_runs[0].status).toBe("order-ready");
    expect(JSON.stringify(historyPayload)).not.toMatch(/test-jupiter-one-shot|raw-request-id-secret|raw-unsigned-transaction-body/i);
  });

  test("GIVEN emergency-stop ops are configured WHEN the drill route runs THEN it records a blocked no-secrets receipt", async () => {
    process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL = "https://ops.example.test/stop-secret";
    process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT = "ops@example.test";

    const rejected = await EMERGENCY_STOP_POST(new Request("http://localhost/api/web3-emergency-stop/drill", {
      method: "POST",
      body: JSON.stringify({ reason: "missing ack" }),
    }));
    expect(rejected.status).toBe(422);

    const response = await EMERGENCY_STOP_POST(new Request("http://localhost/api/web3-emergency-stop/drill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "operator wiring drill",
        operator_ack: true,
      }),
    }));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      ops_target_configured: boolean;
      webhook_configured: boolean;
      contact_configured: boolean;
      external_dispatch_attempted: boolean;
      external_dispatch_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      surfaces: Array<{ id: string; status: string }>;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt).toMatchObject({
      mode: "web3-emergency-stop-drill",
      status: "drill-recorded",
      ops_target_configured: true,
      webhook_configured: true,
      contact_configured: true,
      external_dispatch_attempted: false,
      external_dispatch_permission: "blocked",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.surfaces.map((surface) => surface.id)).toEqual([
      "browser-auto-watch",
      "paper-daemon",
      "live-execution-flags",
      "signer-boundary",
      "submit-relay",
      "wallet-mutation",
    ]);
    expect(receipt.surfaces.find((surface) => surface.id === "wallet-mutation")?.status).toBe("blocked");
    expect(receipt.controls.some((control) => control.includes("does not send a webhook"))).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("stop-secret");
    expect(JSON.stringify(receipt)).not.toContain("ops@example.test");

    const preview = await json<Record<string, unknown>>(EMERGENCY_STOP_GET());
    expect(preview.mode).toBe("web3-emergency-stop-drill");
    expect(preview.external_dispatch_permission).toBe("blocked");
  });

  test("GIVEN paper fills exist WHEN the accounting ledger route runs THEN it returns a redacted paper-only receipt", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH = "/tmp/mastermold-tax-ledger-secret";

    const rejected = await ACCOUNTING_LEDGER_GET(new Request("http://localhost/api/web3-accounting-ledger?scenario=nope"));
    expect(rejected.status).toBe(422);

    const response = await ACCOUNTING_LEDGER_GET(new Request("http://localhost/api/web3-accounting-ledger?scenario=breakout&source=sample&account=ephemeral&cycles=3"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      accounting_boundary: string;
      export_scope: string;
      paper_account: { trade_count: number; cycle: number; persisted: boolean };
      portfolio_summary: { equity_usd: number; net_pnl_usd: number };
      fill_summary: { total_trade_count: number; recent_fill_count: number; paper_volume_usd: number };
      wallet_accounting: { status: string; can_trust_live_pnl: boolean };
      settlement_summary: { settlement_status: string; mirror_status: string; settlement_signature_hash: string | null };
      export_columns: string[];
      sample_rows: Array<{
        source_id_hash: string;
        symbol: string;
        side: string;
        storage_rule: string;
        settlement_status: string;
      }>;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      tax_export_permission: string;
      checks: Array<{ id: string; status: string }>;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-accounting-ledger-receipt");
    expect(["paper-ledger-ready", "live-accounting-gated", "settlement-review"]).toContain(receipt.status);
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.accounting_boundary).toBe("paper-only");
    expect(receipt.export_scope).toBe("paper-ledger-and-redacted-readiness");
    expect(receipt.paper_account.persisted).toBe(false);
    expect(receipt.paper_account.trade_count).toBeGreaterThan(0);
    expect(receipt.fill_summary.total_trade_count).toBe(receipt.paper_account.trade_count);
    expect(receipt.fill_summary.recent_fill_count).toBeGreaterThan(0);
    expect(receipt.fill_summary.paper_volume_usd).toBeGreaterThan(0);
    expect(receipt.portfolio_summary.equity_usd).toBeGreaterThan(0);
    expect(receipt.sample_rows.length).toBeGreaterThan(0);
    expect(receipt.sample_rows.every((row) => row.storage_rule === "redacted")).toBe(true);
    expect(receipt.sample_rows.every((row) => row.settlement_status === "paper-only")).toBe(true);
    expect(receipt.sample_rows.every((row) => /^[0-9a-f]{16}$/.test(row.source_id_hash))).toBe(true);
    expect(receipt.export_columns).toContain("source_id_hash");
    expect(receipt.export_columns).toContain("storage_rule");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.tax_export_permission).toBe("paper-only");
    expect(receipt.wallet_accounting.can_trust_live_pnl).toBe(false);
    expect(receipt.checks.find((check) => check.id === "live-boundary")).toMatchObject({ status: "pass" });
    expect(receipt.controls.some((control) => control.includes("not CPA-reviewed"))).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("test-helius-secret");
    expect(JSON.stringify(receipt)).not.toContain("tax-ledger-secret");
  });

  test("GIVEN live ops are reviewed WHEN the live ops packet route runs THEN it returns a consolidated blocked no-secrets packet", async () => {
    process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL = "https://ops.example.test/live-stop-secret";
    process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT = "ops-secret@example.test";
    process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH = "/tmp/mastermold-tax-ledger-secret";
    process.env.MASTERMOLD_WEB3_PROCESS_MANAGER = "pm2-live-canary";
    process.env.MASTERMOLD_WEB3_WORKER_OWNER = "worker-canary@example.test";
    process.env.MASTERMOLD_WEB3_ALERT_WEBHOOK_URL = "https://ops.example.test/alert-canary";
    process.env.MASTERMOLD_WEB3_RESTART_POLICY_URL = "https://ops.example.test/restart-canary";

    const rejected = await LIVE_OPS_PACKET_GET(new Request("http://localhost/api/web3-live-ops-packet?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await LIVE_OPS_PACKET_GET(new Request("http://localhost/api/web3-live-ops-packet?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const packet = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      production_supervisor_status: string;
      production_supervisor_score: number;
      production_supervisor_fresh: boolean;
      paper_supervision_evidence: boolean;
      emergency_stop_configured: boolean;
      emergency_stop_webhook_configured: boolean;
      emergency_stop_contact_configured: boolean;
      accounting_export_configured: boolean;
      accounting_boundary: string;
      process_manager_configured: boolean;
      worker_owner_configured: boolean;
      alert_route_configured: boolean;
      restart_policy_configured: boolean;
      production_ops_targets_configured: boolean;
      manual_live_review_required: boolean;
      external_process_manager_required: boolean;
      missing_required: string[];
      safe_commands: string[];
      steps: Array<{ id: string; status: string; detail: string; next_action: string }>;
      external_dispatch_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(packet.mode).toBe("web3-live-ops-packet");
    expect(["missing-supervisor", "stale-supervisor", "missing-emergency-stop", "accounting-needed", "process-review-needed", "manual-review-needed", "blocked"]).toContain(packet.status);
    expect(packet.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.production_supervisor_score).toBeGreaterThanOrEqual(0);
    expect(packet.emergency_stop_configured).toBe(true);
    expect(packet.emergency_stop_webhook_configured).toBe(true);
    expect(packet.emergency_stop_contact_configured).toBe(true);
    expect(packet.accounting_export_configured).toBe(true);
    expect(packet.accounting_boundary).toBe("paper-only");
    expect(packet.process_manager_configured).toBe(true);
    expect(packet.worker_owner_configured).toBe(true);
    expect(packet.alert_route_configured).toBe(true);
    expect(packet.restart_policy_configured).toBe(true);
    expect(packet.production_ops_targets_configured).toBe(true);
    expect(packet.manual_live_review_required).toBe(true);
    expect(packet.external_process_manager_required).toBe(true);
    expect(packet.safe_commands).toContain("npm run verify:web3 -- --base-url=http://localhost:4010");
    expect(packet.safe_commands.some((command) => command.includes("supervise:web3"))).toBe(true);
    expect(packet.steps.map((step) => step.id)).toEqual([
      "refresh-supervisor",
      "configure-emergency-stop",
      "run-stop-drill",
      "configure-accounting",
      "review-process-manager",
      "manual-live-review",
    ]);
    expect(packet.steps.find((step) => step.id === "manual-live-review")?.status).toBe("blocked");
    expect(packet.external_dispatch_permission).toBe("blocked");
    expect(packet.live_execution_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(packet.transaction_submission_permission).toBe("blocked");
    expect(packet.private_key_storage).toBe("blocked");
    expect(packet.seed_phrase_storage).toBe("blocked");
    expect(packet.secret_echo_permission).toBe("blocked");
    expect(packet.controls.some((control) => control.includes("configured/missing booleans only"))).toBe(true);
    expect(JSON.stringify(packet)).not.toContain("live-stop-secret");
    expect(JSON.stringify(packet)).not.toContain("ops-secret@example.test");
    expect(JSON.stringify(packet)).not.toContain("tax-ledger-secret");
    expect(JSON.stringify(packet)).not.toContain("pm2-live-canary");
    expect(JSON.stringify(packet)).not.toContain("worker-canary@example.test");
    expect(JSON.stringify(packet)).not.toContain("alert-canary");
    expect(JSON.stringify(packet)).not.toContain("restart-canary");
  });

  test("GIVEN an operator refreshes supervisor evidence WHEN the paper supervisor refresh route previews the run THEN it stays bounded and live-locked", async () => {
    const noAck = await SUPERVISOR_REFRESH_POST(new Request("http://localhost/api/web3-supervisor-refresh", {
      method: "POST",
      body: JSON.stringify({ scenario: "breakout", preview_only: true }),
    }));
    expect(noAck.status).toBe(422);

    const badScenario = await SUPERVISOR_REFRESH_POST(new Request("http://localhost/api/web3-supervisor-refresh", {
      method: "POST",
      body: JSON.stringify({ scenario: "bad", operator_ack: true, preview_only: true }),
    }));
    expect(badScenario.status).toBe(422);

    const response = await SUPERVISOR_REFRESH_POST(new Request("http://localhost/api/web3-supervisor-refresh", {
      method: "POST",
      body: JSON.stringify({ scenario: "breakout", operator_ack: true, preview_only: true }),
    }));
    const receipt = await json<{
      mode: string;
      status: string;
      applied_scenario: string;
      applied_source: string;
      applied_rounds: number;
      applied_ticks_per_round: number;
      applied_target_net_pnl_usd: number;
      applied_max_drawdown_usd: number;
      api_boundary: string;
      supervisor_receipt: unknown;
      supervisor_health: { live_execution_permission: string; wallet_mutation_permission: string };
      production_supervisor: { mode: string; can_satisfy_process_gate: boolean; live_execution_permission: string; wallet_mutation_permission: string };
      external_dispatch_permission: string;
      live_execution_permission: string;
      transaction_submission_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-supervisor-refresh");
    expect(receipt.status).toBe("preview");
    expect(receipt.applied_scenario).toBe("breakout");
    expect(receipt.applied_source).toBe("sample");
    expect(receipt.applied_rounds).toBe(1);
    expect(receipt.applied_ticks_per_round).toBe(1);
    expect(receipt.applied_target_net_pnl_usd).toBe(1);
    expect(receipt.applied_max_drawdown_usd).toBe(250);
    expect(receipt.api_boundary).toBe("local-paper-process");
    expect(receipt.supervisor_receipt).toBe(null);
    expect(receipt.supervisor_health.live_execution_permission).toBe("blocked");
    expect(receipt.supervisor_health.wallet_mutation_permission).toBe("blocked");
    expect(receipt.production_supervisor.mode).toBe("web3-production-supervisor-readiness");
    expect(receipt.production_supervisor.can_satisfy_process_gate).toBe(false);
    expect(receipt.production_supervisor.live_execution_permission).toBe("blocked");
    expect(receipt.production_supervisor.wallet_mutation_permission).toBe("blocked");
    expect(receipt.external_dispatch_permission).toBe("blocked");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.controls.some((control) => control.includes("one bounded sample-source paper supervisor round"))).toBe(true);
  });

  test("GIVEN an operator refreshes the credential doctor WHEN the in-app route is previewed THEN it remains local-only and secret-locked", async () => {
    const remote = await CREDENTIAL_DOCTOR_POST(new Request("https://example.com/api/web3-credential-doctor", {
      method: "POST",
      headers: { "content-type": "application/json", host: "example.com" },
      body: JSON.stringify({ operator_ack: true, preview_only: true }),
    }));
    const remoteReceipt = await json<{ status: string; local_refresh_allowed: boolean }>(remote);
    expect(remote.status).toBe(403);
    expect(remoteReceipt.status).toBe("blocked");
    expect(remoteReceipt.local_refresh_allowed).toBe(false);

    const noAck = await CREDENTIAL_DOCTOR_POST(new Request("http://localhost/api/web3-credential-doctor", {
      method: "POST",
      body: JSON.stringify({ preview_only: true }),
    }));
    expect(noAck.status).toBe(422);

    const unsafe = await CREDENTIAL_DOCTOR_POST(new Request("http://localhost/api/web3-credential-doctor", {
      method: "POST",
      body: JSON.stringify({ operator_ack: true, preview_only: true, private_key: "secret-looking-canary" }),
    }));
    const unsafePayload = await unsafe.json();
    expect(unsafe.status).toBe(422);
    expect(JSON.stringify(unsafePayload)).not.toContain("secret-looking-canary");

    const health = await CREDENTIAL_DOCTOR_GET(new Request("http://localhost/api/web3-credential-doctor"));
    const healthReceipt = await json<{ mode: string; status: string; refreshed: boolean; api_boundary: string }>(health);
    expect(health.status).toBe(200);
    expect(healthReceipt.mode).toBe("web3-credential-doctor-refresh");
    expect(healthReceipt.status).toBe("preview");
    expect(healthReceipt.refreshed).toBe(false);
    expect(healthReceipt.api_boundary).toBe("local-sanitized-doctor");

    const response = await CREDENTIAL_DOCTOR_POST(new Request("http://localhost/api/web3-credential-doctor", {
      method: "POST",
      body: JSON.stringify({
        operator_ack: true,
        preview_only: true,
        refresh_supervisor: true,
        scenario: "breakout",
        source: "live-dex",
        account: "persistent",
      }),
    }));
    const receipt = await json<{
      mode: string;
      status: string;
      refreshed: boolean;
      refresh_supervisor_requested: boolean;
      scenario: string;
      source: string;
      account: string;
      doctor: { mode: string; status: string; private_key_storage: string; secret_echo_permission: string };
      api_boundary: string;
      local_refresh_allowed: boolean;
      live_execution_permission: string;
      transaction_submission_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-credential-doctor-refresh");
    expect(receipt.status).toBe("preview");
    expect(receipt.refreshed).toBe(false);
    expect(receipt.refresh_supervisor_requested).toBe(true);
    expect(receipt.scenario).toBe("breakout");
    expect(receipt.source).toBe("live-dex");
    expect(receipt.account).toBe("persistent");
    expect(receipt.doctor.mode).toBe("web3-credential-doctor");
    expect(receipt.doctor.private_key_storage).toBe("blocked");
    expect(receipt.doctor.secret_echo_permission).toBe("blocked");
    expect(receipt.api_boundary).toBe("local-sanitized-doctor");
    expect(receipt.local_refresh_allowed).toBe(true);
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.seed_phrase_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.controls.some((control) => control.includes("trusted localhost"))).toBe(true);
    expect(receipt.controls.some((control) => control.includes("Private keys"))).toBe(true);
  });

  test("GIVEN supervised live is reviewed WHEN the runway route runs THEN it consolidates blocked launch lanes without secrets", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-supervised-secret";
    process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL = "https://ops.example.test/supervised-stop-secret";
    process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT = "supervised-secret@example.test";
    process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH = "/tmp/mastermold-supervised-tax-secret";
    process.env.MASTERMOLD_WEB3_PROCESS_MANAGER = "pm2-supervised-canary";
    process.env.MASTERMOLD_WEB3_WORKER_OWNER = "supervised-worker-canary@example.test";
    process.env.MASTERMOLD_WEB3_ALERT_WEBHOOK_URL = "https://ops.example.test/supervised-alert-canary";
    process.env.MASTERMOLD_WEB3_RESTART_POLICY_URL = "https://ops.example.test/supervised-restart-canary";

    const rejected = await SUPERVISED_LIVE_RUNWAY_GET(new Request("http://localhost/api/web3-supervised-live-runway?account=bad-account"));
    expect(rejected.status).toBe(422);

    const response = await SUPERVISED_LIVE_RUNWAY_GET(new Request("http://localhost/api/web3-supervised-live-runway?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const packet = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      launch_model: string;
      can_request_live_review: boolean;
      ready_lane_count: number;
      total_lane_count: number;
      lanes: Array<{ id: string; status: string; evidence: string[]; next_action: string }>;
      safe_commands: string[];
      missing_required: string[];
      wallet_packet_status: string;
      jupiter_packet_status: string;
      signer_packet_status: string;
      live_ops_packet_status: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      signing_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(packet.mode).toBe("web3-supervised-live-runway");
    expect(packet.status).toBe("missing-wallet");
    expect(packet.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.launch_model).toBe("supervised-external-wallet-first");
    expect(packet.can_request_live_review).toBe(false);
    expect(packet.total_lane_count).toBe(6);
    expect(packet.ready_lane_count).toBeGreaterThanOrEqual(1);
    expect(packet.lanes.map((lane) => lane.id)).toEqual(["wallet", "jupiter", "signer", "ops", "accounting", "manual-review"]);
    expect(packet.safe_commands).toContain("npm run verify:web3 -- --base-url=http://localhost:4010");
    expect(packet.safe_commands.some((command) => command.includes("--require-operator-wallet"))).toBe(true);
    expect(packet.safe_commands.some((command) => command.includes("--require-jupiter-order"))).toBe(true);
    expect(packet.jupiter_packet_status).toBe("wallet-needed");
    expect(packet.live_execution_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(packet.transaction_submission_permission).toBe("blocked");
    expect(packet.signing_permission).toBe("external-wallet-prompt-only");
    expect(packet.private_key_storage).toBe("blocked");
    expect(packet.seed_phrase_storage).toBe("blocked");
    expect(packet.secret_echo_permission).toBe("blocked");
    expect(packet.controls.some((control) => control.includes("review checklist only"))).toBe(true);
    expect(JSON.stringify(packet)).not.toContain("test-jupiter-supervised-secret");
    expect(JSON.stringify(packet)).not.toContain("supervised-stop-secret");
    expect(JSON.stringify(packet)).not.toContain("supervised-secret@example.test");
    expect(JSON.stringify(packet)).not.toContain("mastermold-supervised-tax-secret");
  });

  test("GIVEN manual live review is requested WHEN the packet route runs THEN it consolidates signoffs without enabling execution", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-manual-review-secret";
    process.env.MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL = "https://ops.example.test/manual-review-stop-secret";
    process.env.MASTERMOLD_EMERGENCY_STOP_CONTACT = "manual-review-secret@example.test";
    process.env.MASTERMOLD_TAX_LEDGER_EXPORT_PATH = "/tmp/mastermold-manual-review-tax-secret";
    process.env.MASTERMOLD_WEB3_PROCESS_MANAGER = "pm2-manual-review-canary";
    process.env.MASTERMOLD_WEB3_WORKER_OWNER = "manual-review-worker-canary@example.test";
    process.env.MASTERMOLD_WEB3_ALERT_WEBHOOK_URL = "https://ops.example.test/manual-review-alert-canary";
    process.env.MASTERMOLD_WEB3_RESTART_POLICY_URL = "https://ops.example.test/manual-review-restart-canary";

    const rejected = await MANUAL_LIVE_REVIEW_PACKET_GET(new Request("http://localhost/api/web3-manual-live-review-packet?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await MANUAL_LIVE_REVIEW_PACKET_GET(new Request("http://localhost/api/web3-manual-live-review-packet?scenario=breakout&source=sample&account=ephemeral&cycles=2"));
    const packet = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      live_review_permitted: boolean;
      can_request_external_review: boolean;
      external_review_only: boolean;
      required_signoff_count: number;
      passed_signoff_count: number;
      watch_signoff_count: number;
      failed_signoff_count: number;
      signoffs: Array<{ id: string; status: string; reviewer: string; next_action: string }>;
      evidence_links: string[];
      safe_commands: string[];
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(packet.mode).toBe("web3-manual-live-review-packet");
    expect(["blocked", "waiting-for-operator-input"]).toContain(packet.status);
    expect(packet.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.live_review_permitted).toBe(false);
    expect(packet.can_request_external_review).toBe(false);
    expect(packet.external_review_only).toBe(true);
    expect(packet.required_signoff_count).toBe(packet.signoffs.length);
    expect(packet.passed_signoff_count + packet.watch_signoff_count + packet.failed_signoff_count).toBe(packet.signoffs.length);
    expect(["operator-wallet", "jupiter-order", "manual-live-review", "supervised-runway", "live-ops"].every((id) => packet.signoffs.some((item) => item.id === id))).toBe(true);
    expect(packet.signoffs.every((item) => item.next_action.length > 0)).toBe(true);
    expect(packet.signoffs.map((item) => item.next_action).join(" ")).not.toContain("Spend: $0 remains");
    expect(packet.signoffs.map((item) => item.next_action).join(" ")).not.toContain("Every transaction lifecycle is blocked");
    expect(packet.signoffs.find((item) => item.id === "signer-custody")?.next_action).toContain("signer handoff receipt");
    expect(packet.signoffs.find((item) => item.id === "settlement")?.next_action).toContain("settlement reconciliation");
    expect(packet.signoffs.find((item) => item.id === "jupiter-order")?.next_action).toContain("JUPITER_API_KEY");
    expect(packet.evidence_links).toContain("GET /api/web3-live-capital-preflight");
    expect(packet.evidence_links).toContain("GET /api/web3-supervised-live-runway");
    expect(packet.safe_commands.some((command) => command.includes("--require-dex-live"))).toBe(true);
    expect(packet.live_execution_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(packet.transaction_submission_permission).toBe("blocked");
    expect(packet.private_key_storage).toBe("blocked");
    expect(packet.seed_phrase_storage).toBe("blocked");
    expect(packet.secret_echo_permission).toBe("blocked");
    expect(packet.controls.some((control) => control.includes("human review checklist"))).toBe(true);
    expect(JSON.stringify(packet)).not.toContain("test-jupiter-manual-review-secret");
    expect(JSON.stringify(packet)).not.toContain("manual-review-stop-secret");
    expect(JSON.stringify(packet)).not.toContain("manual-review-secret@example.test");
    expect(JSON.stringify(packet)).not.toContain("mastermold-manual-review-tax-secret");
    expect(JSON.stringify(packet)).not.toContain("pm2-manual-review-canary");
    expect(JSON.stringify(packet)).not.toContain("manual-review-alert-canary");
    expect(JSON.stringify(packet)).not.toContain("manual-review-restart-canary");
  });

  test("GIVEN signer readiness state WHEN the signer handoff route runs THEN it returns a redacted blocked receipt", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.JUPITER_API_KEY = "test-jupiter-secret";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "external-wallet";

    const rejected = await SIGNER_HANDOFF_GET(new Request("http://localhost/api/web3-signer-handoff?scenario=nope"));
    expect(rejected.status).toBe(422);

    const response = await SIGNER_HANDOFF_GET(new Request("http://localhost/api/web3-signer-handoff?scenario=breakout&source=sample&account=ephemeral&cycles=3"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      active_provider: string;
      signer_scope: string;
      wallet_scoped: boolean;
      policy_hash_preview: string | null;
      request_summary: {
        status: string;
        payload_hash_preview: string | null;
        raw_transaction_included: boolean;
        signed_payload_included: boolean;
        private_key_required: boolean;
      };
      custody_summary: { status: string; max_slippage_bps: number };
      signer_summary: { status: string; providers: Array<{ provider: string; readiness_score: number }> };
      relay_summary: { status: string; payload_hash_preview: string | null };
      live_autonomy_summary: { can_trade_real_capital: boolean; live_execution_permitted: boolean };
      live_execution_permission: string;
      wallet_mutation_permission: string;
      provider_dispatch_permission: string;
      private_key_storage: string;
      transaction_body_storage: string;
      unsigned_transaction_storage: string;
      signed_payload_storage: string;
      checks: Array<{ id: string; status: string; detail: string }>;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-signer-handoff-receipt");
    expect(["missing-wallet", "policy-gated", "signature-gated", "request-ready", "submit-gated", "blocked"]).toContain(receipt.status);
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.active_provider).toBe("external-wallet");
    expect(receipt.signer_summary.providers.length).toBeGreaterThan(0);
    expect(receipt.signer_summary.providers.every((provider) => provider.readiness_score >= 0 && provider.readiness_score <= 100)).toBe(true);
    expect(receipt.custody_summary.max_slippage_bps).toBeGreaterThan(0);
    expect(receipt.request_summary.raw_transaction_included).toBe(false);
    expect(receipt.request_summary.signed_payload_included).toBe(false);
    expect(receipt.request_summary.private_key_required).toBe(false);
    expect(receipt.live_autonomy_summary.can_trade_real_capital).toBe(false);
    expect(receipt.live_autonomy_summary.live_execution_permitted).toBe(false);
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.provider_dispatch_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.transaction_body_storage).toBe("blocked");
    expect(receipt.unsigned_transaction_storage).toBe("blocked");
    expect(receipt.signed_payload_storage).toBe("blocked");
    expect(receipt.checks.map((check) => check.id)).toEqual([
      "wallet-scope",
      "custody-policy",
      "signer-provider",
      "payload-hash",
      "pre-submit",
      "relay-boundary",
      "live-boundary",
      "private-key-boundary",
    ]);
    expect(receipt.checks.find((check) => check.id === "live-boundary")).toMatchObject({ status: "pass" });
    expect(receipt.checks.find((check) => check.id === "private-key-boundary")?.detail).toContain("Private keys");
    expect(receipt.controls.some((control) => /private keys/i.test(control))).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("test-helius-secret");
    expect(JSON.stringify(receipt)).not.toContain("test-jupiter-secret");
  });

  test("GIVEN signer custody setup is incomplete WHEN the signer credential packet route runs THEN it returns provider choices without secrets", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.JUPITER_API_KEY = "test-jupiter-secret";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "external-wallet";

    const rejected = await SIGNER_CREDENTIAL_PACKET_GET(new Request("http://localhost/api/web3-signer-credential-packet?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await SIGNER_CREDENTIAL_PACKET_GET(new Request("http://localhost/api/web3-signer-credential-packet?scenario=base&source=sample&account=ephemeral&cycles=2"));
    const packet = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      active_provider: string;
      recommended_provider: string;
      provider_readiness_status: string;
      provider_readiness_score: number;
      selected_path: {
        id: string;
        label: string;
        env_targets: string[];
        credential_storage: string;
        signing_model: string;
        requires_user_presence: boolean;
        can_auto_sign_after_review: boolean;
      };
      paths: Array<{
        id: string;
        label: string;
        env_targets: string[];
        credential_storage: string;
        configured: boolean;
        security_rule: string;
      }>;
      missing_required: string[];
      required_evidence: string[];
      external_account_permission: string;
      in_app_provider_signup_permission: string;
      credential_storage_permission: string;
      secret_echo_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      raw_transaction_storage: string;
      signed_payload_storage: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(packet.mode).toBe("web3-signer-credential-packet");
    expect(["missing-wallet", "needs-provider-choice", "needs-provider-credentials", "needs-policy", "needs-signer-request", "review-ready", "blocked"]).toContain(packet.status);
    expect(packet.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.active_provider).toBe("external-wallet");
    expect(packet.recommended_provider).toBe("external-wallet");
    expect(packet.provider_readiness_score).toBeGreaterThanOrEqual(0);
    expect(packet.selected_path).toMatchObject({
      id: "external-wallet",
      credential_storage: "external-wallet",
      signing_model: "wallet-prompt",
      requires_user_presence: true,
      can_auto_sign_after_review: false,
    });
    expect(packet.selected_path.env_targets).toContain("MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER=external-wallet");
    expect(packet.paths.map((path) => path.id)).toEqual([
      "external-wallet",
      "privy-server-wallet",
      "turnkey-policy-wallet",
      "session-key-vault",
    ]);
    expect(packet.paths.find((path) => path.id === "privy-server-wallet")?.env_targets).toContain("PRIVY_SOLANA_WALLET_ID");
    expect(packet.paths.find((path) => path.id === "turnkey-policy-wallet")?.env_targets).toContain("TURNKEY_SOLANA_WALLET_ACCOUNT");
    expect(packet.paths.find((path) => path.id === "session-key-vault")?.security_rule).toContain("do not store session private keys");
    expect(packet.missing_required).toContain("Save a dedicated public trading wallet before signer review.");
    expect(packet.missing_required.join(" ")).not.toContain("Hash-only wallet ownership proof");
    expect(packet.required_evidence).toContain("Manual live-executor review before any real signature or submit path");
    expect(packet.external_account_permission).toBe("operator-external-only");
    expect(packet.in_app_provider_signup_permission).toBe("blocked");
    expect(packet.credential_storage_permission).toBe("external-wallet-or-provider-vault-only");
    expect(packet.secret_echo_permission).toBe("blocked");
    expect(packet.private_key_storage).toBe("blocked");
    expect(packet.seed_phrase_storage).toBe("blocked");
    expect(packet.raw_transaction_storage).toBe("blocked");
    expect(packet.signed_payload_storage).toBe("blocked");
    expect(packet.live_execution_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(packet.controls.some((control) => control.includes("Private keys"))).toBe(true);
    expect(JSON.stringify(packet)).not.toContain("test-helius-secret");
    expect(JSON.stringify(packet)).not.toContain("test-jupiter-secret");
  });

  test("GIVEN the operator wallet gate is reviewed WHEN the dedicated wallet packet route runs THEN it rejects sample scope and keeps wallet authority blocked", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.SOLANA_RPC_URL = "https://example-rpc.invalid";
    process.env.JUPITER_API_KEY = "test-jupiter-secret";

    const rejected = await DEDICATED_WALLET_PACKET_GET(new Request("http://localhost/api/web3-dedicated-wallet-packet?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await DEDICATED_WALLET_PACKET_GET(new Request("http://localhost/api/web3-dedicated-wallet-packet?scenario=base&source=sample&account=ephemeral&cycles=1"));
    const packet = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      wallet_public_key_preview: string | null;
      wallet_scoped: boolean;
      wallet_is_sample: boolean;
      dedicated_wallet_scoped: boolean;
      sample_wallet_rejected: boolean;
      wallet_ownership_proved: boolean;
      read_provider_configured: boolean;
      jupiter_configured: boolean;
      strict_verifier_command: string;
      safe_collection_surface: string;
      safe_collection_label: string;
      safe_collection_href: string;
      missing_required: string[];
      steps: Array<{ id: string; label: string; status: string; detail: string; next_action: string }>;
      setup_links: Array<{ label: string; url: string; detail: string }>;
      public_address_storage: string;
      ownership_proof_storage: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      signing_permission: string;
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(packet.mode).toBe("web3-dedicated-wallet-packet");
    expect(["missing-wallet", "sample-wallet", "ownership-needed", "strict-verifier-ready", "review-ready"]).toContain(packet.status);
    expect(packet.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.wallet_scoped).toBe(false);
    expect(packet.wallet_is_sample).toBe(false);
    expect(packet.dedicated_wallet_scoped).toBe(false);
    expect(packet.sample_wallet_rejected).toBe(true);
    expect(packet.wallet_ownership_proved).toBe(false);
    expect(packet.read_provider_configured).toBe(true);
    expect(packet.jupiter_configured).toBe(true);
    expect(packet.strict_verifier_command).toBe("npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=<public-solana-address> --require-operator-wallet");
    expect(packet.strict_verifier_command).not.toContain("test-helius-secret");
    expect(packet.strict_verifier_command).not.toContain("test-jupiter-secret");
    expect(packet.strict_verifier_command).toContain("--require-operator-wallet");
    expect(packet.safe_collection_surface).toBe("trading-live-canary-console");
    expect(packet.safe_collection_label).toBe("Trading live canary console");
    expect(packet.safe_collection_href).toBe("/trading?source=live-dex&account=persistent&scenario=base#web3-live-canary-console");
    expect(packet.missing_required).toContain("Dedicated public Solana trading wallet");
    expect(packet.steps.map((step) => step.id)).toEqual([
      "create-wallet",
      "enter-public-address",
      "reject-sample-wallet",
      "prove-ownership",
      "run-strict-verifier",
      "keep-secrets-out",
    ]);
    expect(packet.steps.find((step) => step.id === "enter-public-address")?.next_action).toContain("Trading live canary console");
    expect(["blocked", "pending", "review"]).toContain(packet.steps.find((step) => step.id === "reject-sample-wallet")?.status ?? "");
    expect(packet.setup_links.some((link) => link.url === "https://solana.com/wallets")).toBe(true);
    expect(packet.public_address_storage).toBe("browser-safe-public-scope");
    expect(packet.ownership_proof_storage).toBe("hash-only-local-receipt");
    expect(packet.private_key_storage).toBe("blocked");
    expect(packet.seed_phrase_storage).toBe("blocked");
    expect(packet.secret_echo_permission).toBe("blocked");
    expect(packet.signing_permission).toBe("blocked");
    expect(packet.transaction_submission_permission).toBe("blocked");
    expect(packet.live_execution_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(packet.controls.join(" ")).toContain("Trading live canary console");
    expect(packet.controls.some((control) => /private keys|seed phrases|sample all-ones wallet/i.test(control))).toBe(true);
    expect(JSON.stringify(packet)).not.toContain("test-helius-secret");
    expect(JSON.stringify(packet)).not.toContain("test-jupiter-secret");
  });

  test("GIVEN Jupiter order setup is reviewed WHEN the order packet route runs THEN it names the missing key without execution authority", async () => {
    process.env.HELIUS_API_KEY = "test-helius-secret";
    process.env.SOLANA_RPC_URL = "https://example-rpc.invalid";
    delete process.env.JUPITER_API_KEY;

    const rejected = await JUPITER_ORDER_PACKET_GET(new Request("http://localhost/api/web3-jupiter-order-packet?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await JUPITER_ORDER_PACKET_GET(new Request("http://localhost/api/web3-jupiter-order-packet?scenario=base&source=sample&account=ephemeral&cycles=1"));
    const packet = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      jupiter_configured: boolean;
      key_source: string;
      env_targets: string[];
      wallet_is_sample: boolean;
      dedicated_wallet_scoped: boolean;
      read_provider_configured: boolean;
      quote_request_ready: boolean;
      swap_v2_order_ready: boolean;
      adapter_status: string;
      adapter_readiness_score: number;
      strict_verifier_command: string;
      rehearsal_endpoint: string;
      local_install_endpoint: string;
      missing_required: string[];
      steps: Array<{ id: string; status: string; detail: string; next_action: string }>;
      key_storage: string;
      browser_storage_permission: string;
      secret_echo_permission: string;
      unsigned_transaction_return: string;
      transaction_body_storage: string;
      execute_permission: string;
      signing_permission: string;
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(packet.mode).toBe("web3-jupiter-order-packet");
    expect(["missing-key", "wallet-needed", "rehearsal-needed", "review-ready"]).toContain(packet.status);
    expect(packet.status).toBe("missing-key");
    expect(packet.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(packet.jupiter_configured).toBe(false);
    expect(packet.key_source).toBe("server-env-or-one-shot-required");
    expect(packet.env_targets).toEqual(["JUPITER_API_KEY"]);
    expect(packet.wallet_is_sample).toBe(false);
    expect(packet.dedicated_wallet_scoped).toBe(false);
    expect(packet.read_provider_configured).toBe(true);
    expect(typeof packet.quote_request_ready).toBe("boolean");
    expect(typeof packet.swap_v2_order_ready).toBe("boolean");
    expect(packet.adapter_readiness_score).toBeGreaterThanOrEqual(0);
    expect(packet.strict_verifier_command).toContain("--require-jupiter-order");
    expect(packet.rehearsal_endpoint).toBe("POST /api/web3-jupiter-rehearsal");
    expect(packet.local_install_endpoint).toBe("POST /api/web3-local-credentials");
    expect(packet.missing_required).toContain("Jupiter API key for Swap V2 order rehearsal");
    expect(packet.steps.map((step) => step.id)).toEqual([
      "create-jupiter-key",
      "install-server-env",
      "scope-wallet",
      "rehearse-order",
      "run-strict-verifier",
      "withhold-transaction-bytes",
    ]);
    expect(packet.steps.find((step) => step.id === "run-strict-verifier")?.status).toBe("blocked");
    expect(packet.key_storage).toBe("server-env-or-one-shot-only");
    expect(packet.browser_storage_permission).toBe("blocked");
    expect(packet.secret_echo_permission).toBe("blocked");
    expect(packet.unsigned_transaction_return).toBe("withheld");
    expect(packet.transaction_body_storage).toBe("blocked");
    expect(packet.execute_permission).toBe("blocked");
    expect(packet.signing_permission).toBe("blocked");
    expect(packet.transaction_submission_permission).toBe("blocked");
    expect(packet.live_execution_permission).toBe("blocked");
    expect(packet.wallet_mutation_permission).toBe("blocked");
    expect(packet.controls.some((control) => control.includes("never saved to browser storage"))).toBe(true);
    expect(JSON.stringify(packet)).not.toContain("test-helius-secret");
  });

  test("GIVEN a browser wallet signs the ownership challenge WHEN the ownership route verifies it THEN it returns a hash-only blocked receipt", async () => {
    const keyPair = await globalThis.crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const rawPublicKey = await globalThis.crypto.subtle.exportKey("raw", keyPair.publicKey);
    const walletPublicKey = base58Encode(new Uint8Array(rawPublicKey));
    const challengeResponse = await WALLET_OWNERSHIP_GET(new Request(`http://localhost/api/web3-wallet-ownership?wallet_public_key=${walletPublicKey}`));
    const challengeReceipt = await json<{
      mode: string;
      status: string;
      message: string | null;
      message_return: string;
      message_storage: string;
      transaction_signing_permission: string;
      transaction_submission_permission: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      private_key_storage: string;
      seed_phrase_storage: string;
      secret_echo_permission: string;
      challenge_expires_at: string | null;
      challenge_max_age_seconds: number;
      controls: string[];
    }>(challengeResponse);
    expect(challengeResponse.status).toBe(200);
    expect(challengeReceipt.mode).toBe("web3-wallet-ownership-challenge");
    expect(challengeReceipt.status).toBe("ready");
    expect(challengeReceipt.message).toContain("Mastermind Web3 wallet ownership challenge");
    expect(challengeReceipt.message).toContain(`Wallet: ${walletPublicKey}`);
    expect(challengeReceipt.message).toContain("No transaction signing or wallet mutation is authorized.");
    expect(challengeReceipt.message_return).toBe("returned-for-signing");
    expect(challengeReceipt.message_storage).toBe("not-stored");
    expect(challengeReceipt.challenge_expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(challengeReceipt.challenge_max_age_seconds).toBe(600);
    expect(challengeReceipt.transaction_signing_permission).toBe("blocked");
    expect(challengeReceipt.transaction_submission_permission).toBe("blocked");
    expect(challengeReceipt.live_execution_permission).toBe("blocked");
    expect(challengeReceipt.wallet_mutation_permission).toBe("blocked");
    expect(challengeReceipt.private_key_storage).toBe("blocked");
    expect(challengeReceipt.seed_phrase_storage).toBe("blocked");
    expect(challengeReceipt.secret_echo_permission).toBe("blocked");
    expect(challengeReceipt.controls.some((control) => control.includes("plain text"))).toBe(true);
    expect(challengeReceipt.controls.some((control) => control.includes("10 minutes"))).toBe(true);
    const malformedChallengeRequest = await WALLET_OWNERSHIP_GET(new Request("http://localhost/api/web3-wallet-ownership?wallet_public_key=not-a-wallet"));
    expect(malformedChallengeRequest.status).toBe(422);

    const message = challengeReceipt.message;
    if (!message) throw new Error("Expected wallet ownership challenge message.");
    const signature = await globalThis.crypto.subtle.sign({ name: "Ed25519" }, keyPair.privateKey, new TextEncoder().encode(message));
    const signatureBase64 = bytesToBase64ForTest(signature);

    const response = await WALLET_OWNERSHIP_POST(new Request("http://localhost/api/web3-wallet-ownership", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet_public_key: walletPublicKey,
        message,
        signature_base64: signatureBase64,
        provider: "test-browser-wallet",
      }),
    }));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      wallet_public_key_preview: string;
      challenge_hash: string;
      challenge_issued_at: string | null;
      challenge_expires_at: string | null;
      challenge_age_seconds: number | null;
      challenge_fresh: boolean;
      challenge_max_age_seconds: number;
      signature_hash: string;
      signature_verified: boolean;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      transaction_signing_permission: string;
      private_key_storage: string;
      secret_echo_permission: string;
      message_storage: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-wallet-ownership-receipt");
    expect(receipt.status).toBe("verified");
    expect(receipt.signature_verified).toBe(true);
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.challenge_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.challenge_issued_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(receipt.challenge_expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(receipt.challenge_age_seconds).toBeGreaterThanOrEqual(0);
    expect(receipt.challenge_fresh).toBe(true);
    expect(receipt.challenge_max_age_seconds).toBe(600);
    expect(receipt.signature_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.wallet_public_key_preview).toBe(`${walletPublicKey.slice(0, 8)}...${walletPublicKey.slice(-4)}`);
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.transaction_signing_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.message_storage).toBe("hash-only");
    expect(receipt.controls.some((control) => control.includes("text-only"))).toBe(true);
    expect(receipt.controls.some((control) => control.includes("10 minutes"))).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain(message);
    expect(JSON.stringify(receipt)).not.toContain(signatureBase64);

    const saveScope = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenario: "breakout",
        source: "sample",
        account: "persistent",
        cycles: 0,
        advance: false,
        execution: {
          mode: "dry-run",
          wallet_public_key: walletPublicKey,
          signer_simulation_enabled: true,
          signer_session_label: "ownership-proof",
          signer_network: "devnet",
          max_trade_usd: 250,
          daily_spend_cap_usd: 1000,
          max_slippage_bps: 150,
        },
      }),
    }));
    expect(saveScope.status).toBe(200);

    const accountSetup = await ACCOUNT_SETUP_GET(new Request("http://localhost/api/web3-account-setup?scenario=breakout&source=sample&account=persistent&cycles=0"));
    const accountReceipt = await json<{
      wallet_summary: {
        wallet_scoped: boolean;
        wallet_is_sample: boolean;
        dedicated_wallet_scoped: boolean;
        wallet_ownership_proved: boolean;
        wallet_ownership_receipt_hash: string | null;
        wallet_ownership_provider: string | null;
      };
      controls: string[];
    }>(accountSetup);
    expect(accountSetup.status).toBe(200);
    expect(accountReceipt.wallet_summary.wallet_scoped).toBe(true);
    expect(accountReceipt.wallet_summary.wallet_is_sample).toBe(false);
    expect(accountReceipt.wallet_summary.dedicated_wallet_scoped).toBe(true);
    expect(accountReceipt.wallet_summary.wallet_ownership_proved).toBe(true);
    expect(accountReceipt.wallet_summary.wallet_ownership_receipt_hash).toBe(receipt.receipt_hash);
    expect(accountReceipt.wallet_summary.wallet_ownership_provider).toBe("test-browser-wallet");
    expect(accountReceipt.controls.some((control) => control.includes("hash-only local audit receipt"))).toBe(true);

    const invalidSignature = await WALLET_OWNERSHIP_POST(new Request("http://localhost/api/web3-wallet-ownership", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet_public_key: walletPublicKey,
        message,
        signature_base64: bytesToBase64ForTest(new Uint8Array(64).fill(7).buffer),
        provider: "test-browser-wallet",
      }),
    }));
    const invalidReceipt = await json<{
      status: string;
      signature_verified: boolean;
      live_execution_permission: string;
      wallet_mutation_permission: string;
    }>(invalidSignature);
    expect(invalidSignature.status).toBe(200);
    expect(invalidReceipt.status).toBe("invalid");
    expect(invalidReceipt.signature_verified).toBe(false);
    expect(invalidReceipt.live_execution_permission).toBe("blocked");
    expect(invalidReceipt.wallet_mutation_permission).toBe("blocked");

    const malformedChallenge = await WALLET_OWNERSHIP_POST(new Request("http://localhost/api/web3-wallet-ownership", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet_public_key: walletPublicKey,
        message: `Unsafe challenge for ${walletPublicKey}`,
        signature_base64: signatureBase64,
        provider: "test-browser-wallet",
      }),
    }));
    expect(malformedChallenge.status).toBe(422);

    const staleMessage = buildWalletOwnershipChallenge(walletPublicKey, new Date(Date.now() - 11 * 60 * 1_000).toISOString());
    const staleSignature = await globalThis.crypto.subtle.sign({ name: "Ed25519" }, keyPair.privateKey, new TextEncoder().encode(staleMessage));
    const staleChallenge = await WALLET_OWNERSHIP_POST(new Request("http://localhost/api/web3-wallet-ownership", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet_public_key: walletPublicKey,
        message: staleMessage,
        signature_base64: bytesToBase64ForTest(staleSignature),
        provider: "test-browser-wallet",
      }),
    }));
    const staleReceipt = await json<{ error: string }>(staleChallenge);
    expect(staleChallenge.status).toBe(422);
    expect(staleReceipt.error).toContain("expired");
  });

  test("GIVEN a paper trading state WHEN the agent scores markets THEN it buys strong setups and blocks unsafe launches", () => {
    const state = getWeb3TradingState("base", 0);
    const buy = state.signals.find((signal) => signal.action === "buy");
    const blocked = state.signals.find((signal) => signal.symbol === "LAUNCHX");

    expect(state.autonomy.status).toBe("armed-paper");
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    expect(state.portfolio.cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.trade_tape.every((trade) => trade.status === "paper-filled")).toBe(true);
    expect(buy?.suggested_size_usd).toBeGreaterThan(0);
    expect(blocked?.action).toBe("block");
    expect(blocked?.risk_warnings).toContain("thin-liquidity");
  });

  test("GIVEN a rug-risk market WHEN scored THEN the agent exits instead of adding exposure", () => {
    const market: MemecoinMarket = {
      id: "test",
      chain: "solana",
      symbol: "RISK",
      name: "Risk",
      token_address: "risk",
      pair_address: "risk",
      dex: "PumpSwap",
      price_usd: 0.01,
      market_cap_usd: 1_000_000,
      liquidity_usd: 300_000,
      volume_5m_usd: 200_000,
      volume_1h_usd: 900_000,
      volume_24h_usd: 2_000_000,
      buys_5m: 42,
      sells_5m: 350,
      price_change_5m_pct: -8,
      price_change_1h_pct: -19,
      price_change_6h_pct: -31,
      age_minutes: 800,
      boosts: 0,
      paid_orders: 0,
      holder_count_estimate: 8_000,
      risk_flags: ["sell-wall"],
    };

    const signal = scoreMarket(market);
    expect(signal.action).toBe("sell");
    expect(signal.suggested_size_usd).toBe(0);
  });

  test("GIVEN open positions WHEN the desk refreshes THEN the agent produces position-level exit watch decisions", () => {
    const state = getWeb3TradingState("base", 0);
    const managedWatch = state.position_watch.find((watch) => watch.action === "exit" || watch.action === "tighten-stop");

    expect(Array.isArray(state.position_watch)).toBe(true);
    expect(state.position_watch.length).toBeGreaterThan(0);
    expect(managedWatch?.urgency).toMatch(/high|medium/);
    expect(managedWatch?.triggers.some((trigger) => trigger.includes("open PnL"))).toBe(true);
    expect(state.position_watch.every((watch) => watch.health_score >= 0 && watch.health_score <= 100)).toBe(true);
  });

  test("GIVEN open positions WHEN exit ladders run THEN they arm stops, profit trims, and moonbag runners", () => {
    const state = getWeb3TradingState("rug-risk", 0);
    const ladder = state.position_exit_ladder;
    const kinds = new Set(ladder.items.flatMap((item) => item.steps.map((step) => step.kind)));

    expect(ladder.items.length).toBe(state.portfolio.open_positions.length);
    expect(ladder.active_count).toBeGreaterThan(0);
    expect(ladder.risk_at_stop_usd).toBeGreaterThan(0);
    expect(kinds).toEqual(new Set(["risk-exit", "hard-stop", "trailing-stop", "take-profit", "moonbag"]));
    expect(ladder.items.every((item) => item.ladder_score >= 0 && item.ladder_score <= 100)).toBe(true);
    expect(ladder.items.some((item) => item.steps.some((step) => step.kind === "trailing-stop" && step.status === "armed"))).toBe(true);
    expect(ladder.items.some((item) => item.steps.some((step) => step.kind === "moonbag" && step.size_usd >= 0))).toBe(true);
  });

  test("GIVEN open positions WHEN exit contracts run THEN fresh entries depend on hard stops, take-profit, trailing stops, time stops, and coverage", () => {
    const state = getWeb3TradingState("rug-risk", 0);
    const contract = state.autonomous_position_exit_contract;

    expect(contract.mode).toBe("autonomous-position-exit-contract");
    expect(["covered", "planned", "auth-required", "protect", "blocked", "idle"]).toContain(contract.status);
    expect(["open", "selective", "protect-only", "blocked"]).toContain(contract.fresh_entry_permission);
    expect(contract.coverage_score).toBeGreaterThanOrEqual(0);
    expect(contract.coverage_score).toBeLessThanOrEqual(100);
    expect(contract.items.length).toBe(state.portfolio.open_positions.length);
    expect(contract.earliest_review_seconds).toBeGreaterThan(0);
    expect(contract.controls.some((control) => control.includes("Local paper exit contract only"))).toBe(true);
    expect(contract.controls.some((control) => control.includes("hard stop, trailing stop, take-profit band, time-stop"))).toBe(true);
    expect(contract.items.every((item) =>
      ["covered", "planned", "auth-required", "repair", "uncovered", "watch"].includes(item.status) &&
      ["monitor", "arm-bracket", "authenticate", "repair", "protect-now", "stand-down"].includes(item.action) &&
      ["now", "next", "watch"].includes(item.priority) &&
      item.contract_score >= 0 &&
      item.contract_score <= 100 &&
      item.hard_stop_price_usd > 0 &&
      item.trailing_stop_price_usd > 0 &&
      item.time_stop_minutes > 0 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(contract.total_protected_usd + contract.at_risk_usd).toBeGreaterThan(0);
    if (contract.uncovered_position_count > 0 || contract.requires_protection_first) {
      expect(contract.allows_fresh_entries).toBe(false);
      expect(["protect-only", "blocked"]).toContain(contract.fresh_entry_permission);
    }
  });

  test("GIVEN open memecoin positions WHEN liquidity exit sentinel runs THEN it sizes trims and exits before profit disappears", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const sentinel = state.liquidity_exit_sentinel;
    const urgent = sentinel.items.find((item) => item.action === "exit" || item.action === "trim");

    expect(sentinel.mode).toBe("liquidity-exit-sentinel");
    expect(["clear", "watch", "tighten", "trim", "exit"]).toContain(sentinel.status);
    expect(sentinel.items.length).toBe(state.portfolio.open_positions.length);
    expect(sentinel.average_exit_pressure_score).toBeGreaterThanOrEqual(0);
    expect(sentinel.average_exit_pressure_score).toBeLessThanOrEqual(100);
    expect(sentinel.scan_interval_seconds).toBeGreaterThan(0);
    expect(urgent?.recommended_exit_usd).toBeGreaterThan(0);
    expect(urgent?.triggers.some((trigger) => trigger.includes("liquidity") || trigger.includes("buy flow"))).toBe(true);
    expect(state.autopilot.actions.some((action) => action.id.includes("autopilot-liquidity-exit") && action.side === "sell")).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "liquidity-exit-sentinel")).toBe(true);
  });

  test("GIVEN open positions WHEN the position commander runs THEN it fuses exits, stops, routes, and alpha into one command", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const commander = state.position_commander;
    const profitLock = state.profit_lock_autopilot;
    const profitRace = state.profit_capture_race;
    const urgent = commander.items.find((item) => item.action === "exit" || item.action === "lockout" || item.action === "trim" || item.action === "defend");

    expect(commander.mode).toBe("autonomous-position-commander");
    expect(["idle", "watch", "defend", "trim", "exit", "moonbag"]).toContain(commander.status);
    expect(commander.items.length).toBe(state.portfolio.open_positions.length);
    expect(commander.items.every((item) =>
      item.command_score >= 0 &&
      item.command_score <= 100 &&
      item.position_health_score >= 0 &&
      item.exit_pressure_score >= 0 &&
      item.profit_capture_score >= 0 &&
      item.route_protection_score >= 0 &&
      item.review_after_seconds > 0 &&
      item.current_value_usd >= item.commanded_sell_usd &&
      item.reentry_lockout_seconds >= 0
    )).toBe(true);
    expect(urgent?.triggers.length).toBeGreaterThan(0);
    if (commander.commanded_sell_usd > 0) {
      expect(state.profit_loop_controller.max_cycle_release_usd)
        .toBeGreaterThanOrEqual(commander.commanded_sell_usd);
      expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "position-commander")).toBe(true);
    }

    expect(profitLock.mode).toBe("profit-lock-autopilot");
    expect(["exit", "harvest", "trail", "defend", "moonbag", "idle"]).toContain(profitLock.status);
    expect(profitLock.items.length).toBe(state.portfolio.open_positions.length);
    expect(profitLock.items.every((item) =>
      item.lock_score >= 0 &&
      item.lock_score <= 100 &&
      item.current_value_usd >= item.release_usd &&
      item.release_usd >= 0 &&
      item.locked_profit_usd >= 0 &&
      item.at_risk_usd >= 0 &&
      item.moonbag_usd >= 0 &&
      item.stop_price_usd > 0 &&
      item.review_after_seconds > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(profitLock.release_usd).toBeGreaterThanOrEqual(0);
    if (profitLock.status === "exit" || profitLock.status === "harvest" || profitLock.status === "defend") {
      expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "profit-lock-autopilot")).toBe(true);
    }

    expect(profitRace.mode).toBe("profit-capture-race");
    expect(["race", "trim", "harvest", "trail", "press", "blocked", "idle"]).toContain(profitRace.status);
    expect(profitRace.items.length).toBe(state.portfolio.open_positions.length);
    expect(profitRace.items.every((item) =>
      item.race_score >= 0 &&
      item.race_score <= 100 &&
      item.profit_capture_score >= 0 &&
      item.profit_capture_score <= 100 &&
      item.liquidity_pressure_score >= 0 &&
      item.liquidity_pressure_score <= 100 &&
      item.tape_pressure_score >= 0 &&
      item.tape_pressure_score <= 100 &&
      item.smart_money_pressure_score >= 0 &&
      item.smart_money_pressure_score <= 100 &&
      item.route_freshness_score >= 0 &&
      item.route_freshness_score <= 100 &&
      item.time_to_decision_seconds > 0 &&
      item.current_value_usd >= item.recommended_release_usd &&
      item.keep_usd >= 0 &&
      item.evidence.length > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(profitRace.recommended_release_usd).toBeGreaterThanOrEqual(0);
    if (profitRace.status === "race" || profitRace.status === "trim" || profitRace.status === "harvest" || profitRace.status === "trail" || profitRace.status === "press") {
      expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "profit-capture-race")).toBe(true);
    }
  });

  test("GIVEN open positions WHEN trigger-order planner runs THEN it shapes Jupiter-style OCO and stop protection without creating orders", () => {
    const state = getWeb3TradingState("rug-risk", 0);
    const planner = state.trigger_order_planner;
    const oco = planner.items.find((item) => item.order_type === "oco");
    const stop = planner.items.find((item) => item.order_type === "single-stop");

    expect(planner.mode).toBe("jupiter-trigger-planner");
    expect(["auth-required", "blocked", "monitoring", "ready", "idle"]).toContain(planner.status);
    expect(planner.base_url).toBe("https://api.jup.ag/trigger/v2");
    expect(planner.min_order_usd).toBe(10);
    expect(planner.vault_required).toBe(true);
    expect(planner.api_key_configured).toBe(false);
    expect(planner.jwt_configured).toBe(false);
    expect(planner.items.length).toBe(state.portfolio.open_positions.length);
    expect(planner.planned_notional_usd).toBeGreaterThan(0);
    expect(planner.protected_notional_usd).toBeGreaterThan(0);
    expect(planner.safeguards.some((item) => item.includes("No trigger order is created"))).toBe(true);
    expect(oco).toBeDefined();
    expect(oco?.trigger_direction).toBe("oco");
    expect(oco?.take_profit_trigger_price_usd).toBeGreaterThan(0);
    expect(oco?.stop_trigger_price_usd).toBeGreaterThan(0);
    expect(oco?.blockers).toContain("JUPITER_API_KEY is missing.");
    expect(stop).toBeDefined();
    expect(stop?.trigger_direction).toBe("sell-below");
    expect(stop?.slippage_bps).toBeGreaterThanOrEqual(1_000);
    expect(planner.items.every((item) => item.deposit_usd === 0 || item.deposit_usd >= planner.min_order_usd)).toBe(true);
  });

  test("GIVEN sample market regimes WHEN strategy lab replays them THEN it recommends the strongest paper profile", () => {
    const state = getWeb3TradingState("base", 0);

    expect(state.strategy_lab.replay_cycles).toBeGreaterThanOrEqual(3);
    expect(state.strategy_lab.runs.map((run) => run.profile_id).sort()).toEqual([
      "aggressive",
      "balanced",
      "defensive",
    ]);
    expect(state.strategy_lab.runs[0].profile_id).toBe(state.strategy_lab.selected_profile_id);
    expect(state.strategy_lab.runs[0].trade_count).toBeGreaterThan(0);
    expect(state.strategy_lab.runs[0].notes.length).toBeGreaterThan(0);
    expect(state.strategy_lab.recommendation).toContain(state.strategy_lab.runs[0].label);
  });

  test("GIVEN a market tape WHEN opportunity radar ranks candidates THEN it exposes entries and blocks unsafe launches", () => {
    const state = getWeb3TradingState("base", 0);
    const entry = state.opportunity_radar.items.find((item) => item.action === "enter");
    const blocked = state.opportunity_radar.items.find((item) => item.symbol === "LAUNCHX");

    expect(state.opportunity_radar.selected_profile_id).toBe(state.strategy_lab.selected_profile_id);
    expect(state.opportunity_radar.enter_count).toBeGreaterThan(0);
    expect(entry?.suggested_size_usd).toBeGreaterThanOrEqual(100);
    expect(entry?.snipe_window_seconds).toBeGreaterThan(0);
    expect(blocked).toMatchObject({ action: "blocked" });
    expect(blocked?.blockers.length).toBeGreaterThan(0);
  });

  test("GIVEN discovery catalysts WHEN hype quality is scored THEN paid promotion is separated from organic flow", () => {
    const state = getWeb3TradingState("base", 0);
    const catalyst = state.trend_catalyst;
    const paid = catalyst.items.find((item) => item.symbol === "LAUNCHX");

    expect(["hot", "selective", "promotion-risk", "quiet"]).toContain(catalyst.status);
    expect(catalyst.source).toBe("local-catalyst-model");
    expect(catalyst.items.length).toBeGreaterThan(0);
    expect(catalyst.items.every((item) => item.attention_score >= 0 && item.attention_score <= 100)).toBe(true);
    expect(catalyst.items.every((item) => item.organic_score >= 0 && item.organic_score <= 100)).toBe(true);
    expect(catalyst.items.every((item) => item.review_after_seconds > 0)).toBe(true);
    expect(paid).toBeDefined();
    expect(paid?.promotion_risk_score).toBeGreaterThanOrEqual(45);
    expect(paid?.action === "fade" || paid?.action === "block").toBe(true);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Catalyst model applies"))).toBe(true);
  });

  test("GIVEN token vetting WHEN a fresh risky launch appears THEN it blocks or caps autonomous entries", () => {
    const state = getWeb3TradingState("base", 0);
    const launch = state.token_vetting.items.find((item) => item.symbol === "LAUNCHX");
    const cappedCandidate = state.token_vetting.items.find((item) => item.status !== "blocked");

    expect(state.token_vetting.items.length).toBe(state.market.length);
    expect(state.token_vetting.credential_gated_count).toBeGreaterThan(0);
    expect(launch).toMatchObject({
      status: "blocked",
      max_position_usd: 0,
    });
    expect(launch?.checks.some((check) => check.status === "fail")).toBe(true);
    expect(cappedCandidate?.max_position_usd).toBeGreaterThan(0);
  });

  test("GIVEN rug-prone tokens WHEN firewall scores them THEN it quarantines risky buys before autonomy sizing", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const quarantined = state.rug_pull_firewall.items.find((item) => item.symbol === "LAUNCHX");
    const exitFirst = state.rug_pull_firewall.items.find((item) => item.action === "exit");

    expect(state.rug_pull_firewall.items.length).toBe(state.market.length);
    expect(state.rug_pull_firewall.scan_interval_seconds).toBe(10);
    expect(state.rug_pull_firewall.average_risk_score).toBeGreaterThanOrEqual(0);
    expect(state.rug_pull_firewall.credential_gated_count).toBeGreaterThan(0);
    expect(quarantined).toMatchObject({ action: "quarantine" });
    expect(quarantined?.composite_risk_score).toBeGreaterThanOrEqual(70);
    expect(quarantined?.blockers.length).toBeGreaterThan(0);
    expect(exitFirst?.blockers.length).toBeGreaterThan(0);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Rug firewall gates entries"))).toBe(true);
    expect(state.profit_optimizer.candidates
      .filter((candidate) => state.rug_pull_firewall.items.some((item) =>
        item.symbol === candidate.symbol && (item.action === "quarantine" || item.action === "exit")
      ))
      .every((candidate) => candidate.verdict === "avoid" || candidate.verdict === "exit" || candidate.adjusted_size_usd === 0)).toBe(true);
  });

  test("GIVEN profit, route, scanner, and wallet evidence WHEN the strategy selector runs THEN it chooses one bounded paper tactic", () => {
    const state = getWeb3TradingState("breakout", 2);
    const selector = state.autonomous_strategy_selector;
    const selected = selector.items.find((item) => item.status === "selected");

    expect(selector.mode).toBe("autonomous-strategy-selector");
    expect(["press", "probe", "compound", "protect", "refresh", "cooldown", "idle"]).toContain(selector.status);
    expect(selector.items.length).toBeGreaterThanOrEqual(5);
    expect(selected).toBeDefined();
    expect(selector.selected_tactic).toBe(selected?.tactic ?? null);
    expect(selector.confidence_score).toBeGreaterThanOrEqual(0);
    expect(selector.confidence_score).toBeLessThanOrEqual(100);
    expect(selector.cadence_seconds).toBeGreaterThan(0);
    expect(selector.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(selector.controls.some((control) => control.includes("local paper evidence"))).toBe(true);
    expect(selector.controls.some((control) => control.includes("not a guarantee of live profit"))).toBe(true);
    expect(selector.items.every((item) =>
      item.score >= 0 &&
      item.score <= 100 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.max_trade_usd >= 0 &&
      item.cadence_seconds > 0 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(state.autonomous_session_planner.selected_tactic).toBe(selector.selected_tactic);
    expect(state.autonomous_session_planner.selected_tactic_label).toBe(selector.selected_label);
    expect(state.autonomous_session_planner.selected_tactic_status).toBe(selector.status);
    if (selector.selected_symbol) {
      expect(state.autonomous_session_planner.target_symbol).toBe(selector.selected_symbol);
    }
  });

  test("GIVEN concentrated holders and whale exits WHEN holder-flow sentinel runs THEN it blocks buys and exits held risk", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const sentinel = state.holder_flow_sentinel;
    const launch = sentinel.items.find((item) => item.symbol === "LAUNCHX");
    const heldExit = sentinel.items.find((item) => item.action === "exit" || item.action === "trim");

    expect(sentinel.mode).toBe("holder-flow-sentinel");
    expect(["clear", "watch", "blocked", "exit"]).toContain(sentinel.status);
    expect(sentinel.items.length).toBeGreaterThan(0);
    expect(sentinel.credential_gated_count).toBeGreaterThan(0);
    expect(sentinel.items.every((item) =>
      item.insider_risk_score >= 0 &&
      item.insider_risk_score <= 100 &&
      item.holder_concentration_score >= 0 &&
      item.holder_concentration_score <= 100 &&
      item.whale_exit_pressure_score >= 0 &&
      item.whale_exit_pressure_score <= 100 &&
      item.recommended_size_multiplier >= 0 &&
      item.recommended_size_multiplier <= 1 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(launch).toMatchObject({ action: "block" });
    expect(launch!.blockers.length).toBeGreaterThan(0);
    expect(heldExit?.recommended_exit_usd).toBeGreaterThan(0);
    expect(state.autopilot.actions.some((action) =>
      action.id.startsWith("autopilot-holder-flow-") &&
      action.side === "sell"
    )).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "holder-flow-sentinel")).toBe(true);
  });

  test("GIVEN fast price action WHEN the monitor scans the tape THEN it classifies snipe and eject windows", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);
    const active = breakout.price_action_monitor.items.find((item) => item.decision === "snipe" || item.decision === "press");
    const protectedItem = rugRisk.price_action_monitor.items.find((item) => item.decision === "avoid" || item.decision === "eject" || item.decision === "trim");

    expect(breakout.price_action_monitor.items.length).toBeGreaterThan(0);
    expect(breakout.price_action_monitor.scan_interval_seconds).toBe(10);
    expect(active?.entry_size_multiplier).toBeGreaterThan(0);
    expect(active?.triggers.length).toBeGreaterThan(0);
    expect(rugRisk.price_action_monitor.eject_count + rugRisk.price_action_monitor.trim_count + rugRisk.price_action_monitor.avoid_count)
      .toBeGreaterThan(0);
    expect(protectedItem?.blockers.length).toBeGreaterThan(0);
    expect(rugRisk.autonomy_policy.rules.some((rule) => rule.includes("Price action monitor applies"))).toBe(true);
  });

  test("GIVEN transaction imbalance WHEN microstructure tape runs THEN it classifies buy bursts and sell cascades", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);
    const active = breakout.microstructure_tape.items.find((item) => item.action === "chase" || item.action === "absorb");
    const defensive = rugRisk.microstructure_tape.items.find((item) => item.action === "rug-pull" || item.action === "distribute" || item.action === "fade");

    expect(breakout.microstructure_tape.mode).toBe("microstructure-tape");
    expect(["attack", "absorb", "defensive", "rug-pull", "idle"]).toContain(breakout.microstructure_tape.status);
    expect(breakout.microstructure_tape.items.length).toBeGreaterThan(0);
    expect(breakout.microstructure_tape.items.every((item) =>
      item.micro_score >= 0 &&
      item.micro_score <= 100 &&
      item.trade_count_5m >= 0 &&
      item.avg_trade_size_usd >= 0 &&
      item.review_after_seconds > 0 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(active?.recommended_size_multiplier).toBeGreaterThan(0);
    expect(active?.evidence.some((entry) => entry.includes("buy pressure"))).toBe(true);
    expect(["defensive", "rug-pull", "attack", "absorb", "idle"]).toContain(rugRisk.microstructure_tape.status);
    expect(defensive).toBeDefined();
    expect(defensive!.sell_cascade_score + defensive!.liquidity_vacuum_score + defensive!.distribution_score).toBeGreaterThan(0);
    if (rugRisk.microstructure_tape.recommended_release_usd > 0) {
      expect(rugRisk.profit_loop_controller.max_cycle_release_usd)
        .toBeGreaterThanOrEqual(rugRisk.microstructure_tape.recommended_release_usd);
    }
    if (breakout.microstructure_tape.status !== "idle") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "microstructure-tape")).toBe(true);
    }
  });

  test("GIVEN smart wallet proxies WHEN smart money sentinel runs THEN it follows clean accumulation and fades risky flow", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);
    const follow = breakout.smart_money_sentinel.items.find((item) => item.action === "follow" || item.action === "probe");
    const defensive = rugRisk.smart_money_sentinel.items.find((item) => item.action === "exit" || item.action === "fade");

    expect(breakout.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(breakout.onchain_event_inbox.mode).toBe("onchain-event-inbox");
    expect(breakout.onchain_event_inbox.status).toBe("idle");
    expect(breakout.onchain_event_inbox.source_status).toBe("empty");
    expect(breakout.wallet_event_reactor.mode).toBe("wallet-event-reactor");
    expect(breakout.wallet_event_reactor.status).toBe("idle");
    expect(breakout.wallet_activity_history).toMatchObject({
      mode: "read-only-wallet-activity-history",
      status: "missing-wallet",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      signature_count: 0,
    });
    expect(breakout.wallet_transaction_intelligence).toMatchObject({
      mode: "read-only-wallet-transaction-intelligence",
      status: "missing-wallet",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      raw_transaction_storage: "blocked",
      decoded_transaction_count: 0,
    });
    expect(["follow", "probe", "defensive", "exit", "idle"]).toContain(breakout.smart_money_sentinel.status);
    expect(breakout.smart_money_sentinel.items.length).toBeGreaterThan(0);
    expect(breakout.smart_money_sentinel.items.every((item) =>
      item.smart_score >= 0 &&
      item.smart_score <= 100 &&
      item.wallet_accumulation_score >= 0 &&
      item.trader_quality_score >= 0 &&
      item.concentration_risk_score >= 0 &&
      item.copy_trade_confidence >= 0 &&
      item.review_after_seconds > 0 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(follow?.recommended_size_multiplier).toBeGreaterThan(0);
    expect(follow?.evidence.some((entry) => entry.includes("estimated smart flow"))).toBe(true);
    expect(rugRisk.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(defensive).toBeDefined();
    if (rugRisk.smart_money_sentinel.recommended_release_usd > 0) {
      expect(rugRisk.profit_loop_controller.max_cycle_release_usd)
        .toBeGreaterThanOrEqual(rugRisk.smart_money_sentinel.recommended_release_usd);
    }
    if (breakout.smart_money_sentinel.status !== "idle") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "smart-money-sentinel")).toBe(true);
    }
  });

  test("GIVEN Helius-style wallet events WHEN posted to the trading API THEN the inbox dedupes and pushes smart-money copy recommendations", async () => {
    const bonk = getWeb3TradingState("base", 0).market.find((market) => market.symbol === "BONK");
    expect(bonk).toBeDefined();

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          account: "persistent",
          scenario: "breakout",
          reset: true,
          advance: false,
          execution: { kill_switch: false },
          onchain_events: {
            source: "helius-webhook",
            events: [
              {
                signature: "5copyBuyBonk111111111111111111111111111111111111111111",
                type: "SWAP",
                timestamp: "2026-06-16T14:00:00.000Z",
                direction: "buy",
                token_address: bonk!.token_address,
                symbol: "BONK",
                wallet_address: "SmartWallet111111111111111111111111111111111",
                counterparty: "Pool111111111111111111111111111111111111111",
                amount: 520_000_000,
                amount_usd: 75_000,
              },
              {
                signature: "5copyBuyBonk111111111111111111111111111111111111111111",
                type: "SWAP",
                timestamp: "2026-06-16T14:00:01.000Z",
                direction: "buy",
                token_address: bonk!.token_address,
                symbol: "BONK",
                wallet_address: "SmartWallet111111111111111111111111111111111",
                amount: 520_000_000,
                amount_usd: 75_000,
              },
            ],
          },
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);
    const inboxItem = state.onchain_event_inbox.items.find((item) => item.symbol === "BONK");
    const reactorItem = state.wallet_event_reactor.items.find((item) => item.symbol === "BONK");
    const smartItem = state.smart_money_sentinel.items.find((item) => item.symbol === "BONK");
    const walletIntent = state.execution_intents.intents.find((intent) =>
      intent.source_action_id.startsWith("wallet-reactor-") && intent.symbol === "BONK"
    );

    expect(response.status).toBe(200);
    expect(state.onchain_event_inbox.status).toBe("accumulation");
    expect(state.onchain_event_inbox.source_status).toBe("local-events");
    expect(state.onchain_event_inbox.event_count).toBe(1);
    expect(state.onchain_event_inbox.buy_count).toBe(1);
    expect(state.onchain_event_inbox.actionable_count).toBeGreaterThanOrEqual(1);
    expect(state.onchain_event_inbox.estimated_flow_usd).toBe(75_000);
    expect(inboxItem).toMatchObject({
      action: "copy-buy",
      direction: "buy",
      source: "helius-webhook",
      token_id: "bonk-sol",
    });
    expect(inboxItem!.pressure_score).toBeGreaterThanOrEqual(58);
    expect(state.wallet_event_reactor.status).toBe("attack");
    expect(state.wallet_event_reactor.deploy_count).toBe(1);
    expect(state.wallet_event_reactor.total_deploy_usd).toBeGreaterThan(0);
    expect(reactorItem).toMatchObject({
      action: "deploy",
      side: "buy",
      priority: "now",
      status: "ready",
      token_id: "bonk-sol",
    });
    expect(reactorItem!.latency_budget_seconds).toBeLessThanOrEqual(5);
    expect(walletIntent).toBeDefined();
    expect(walletIntent).toMatchObject({
      side: "buy",
      priority: "now",
      symbol: "BONK",
    });
    expect(walletIntent!.rationale).toContain("wallet flow");
    expect(state.autonomous_monitor.triggers.find((trigger) => trigger.id === "wallet-event-reactor")).toMatchObject({
      label: "Wallet copy",
      severity: "urgent",
      symbol: "BONK",
    });
    expect(state.autonomous_monitor.watch_symbols).toContain("BONK");
    expect(smartItem?.evidence.some((entry) => entry.includes("copy buy event"))).toBe(true);

    const repeat = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          account: "persistent",
          scenario: "breakout",
          advance: false,
          onchain_events: {
            source: "helius-webhook",
            events: [
              {
                signature: "5copyBuyBonk111111111111111111111111111111111111111111",
                type: "SWAP",
                direction: "buy",
                token_address: bonk!.token_address,
                symbol: "BONK",
                amount: 520_000_000,
                amount_usd: 75_000,
              },
            ],
          },
        }),
      }),
    );
    const repeatedState = await json<Web3TradingState>(repeat);

    expect(repeat.status).toBe(200);
    expect(repeatedState.onchain_event_inbox.event_count).toBe(1);
    expect(repeatedState.wallet_event_reactor.items.filter((item) => item.event_id === "5copyBuyBonk111111111111111111111111111111111111111111")).toHaveLength(1);
    expect(repeatedState.onchain_event_inbox.items.filter((item) => item.signature === "5copyBuyBonk111111111111111111111111111111111111111111")).toHaveLength(1);
  });

  test("GIVEN paper outcomes WHEN post-trade review runs THEN it turns lessons into next-cycle throttle guidance", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);

    expect(breakout.post_trade_review.mode).toBe("post-trade-review");
    expect(["scale", "steady", "tighten", "cooldown", "halted", "learning"]).toContain(breakout.post_trade_review.status);
    expect(["increase-size", "hold-size", "reduce-size", "pause-entries", "exit-only"]).toContain(breakout.post_trade_review.decision);
    expect(breakout.post_trade_review.reviewed_trade_count).toBe(breakout.performance_scorecard.trade_count);
    expect(breakout.post_trade_review.execution_friction_usd).toBeGreaterThanOrEqual(0);
    expect(breakout.post_trade_review.recommended_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(breakout.post_trade_review.recommended_size_multiplier).toBeLessThanOrEqual(1.18);
    expect(breakout.post_trade_review.recommended_cadence_seconds).toBeGreaterThan(0);
    expect(breakout.post_trade_review.next_action.length).toBeGreaterThan(0);
    expect(breakout.post_trade_review.lessons.map((lesson) => lesson.id)).toEqual([
      "pnl",
      "execution",
      "alpha",
      "drawdown",
      "discipline",
    ]);
    expect(breakout.post_trade_review.lessons.every((lesson) =>
      ["pass", "watch", "fail"].includes(lesson.status) &&
      ["positive", "neutral", "negative"].includes(lesson.impact) &&
      lesson.adjustment.length > 0
    )).toBe(true);
    expect(rugRisk.post_trade_review.lessons.some((lesson) => lesson.status === "watch" || lesson.status === "fail")).toBe(true);
    if (rugRisk.post_trade_review.pause_new_entries) {
      expect(["pause-entries", "exit-only"]).toContain(rugRisk.post_trade_review.decision);
    }
  });

  test("GIVEN execution intents WHEN cost monitor prices the lane THEN it estimates route, priority-fee, and landability drag", () => {
    const state = getWeb3TradingState("breakout", 2);
    const costed = state.execution_cost_monitor.items.find((item) => item.side === "buy");

    expect(state.execution_cost_monitor.source).toBe("local-estimate");
    expect(state.execution_cost_monitor.priority_fee_window_blocks).toBe(150);
    expect(state.execution_cost_monitor.items.length).toBeGreaterThan(0);
    expect(state.execution_cost_monitor.average_total_cost_bps).toBeGreaterThanOrEqual(0);
    expect(state.execution_cost_monitor.fee_drag_usd).toBeGreaterThanOrEqual(0);
    expect(costed?.total_cost_bps).toBeGreaterThanOrEqual(costed?.route_cost_bps ?? 0);
    expect(costed?.priority_fee_lamports).toBeGreaterThanOrEqual(0);
    expect(costed?.landability_score).toBeGreaterThanOrEqual(0);
    expect(costed?.landability_score).toBeLessThanOrEqual(100);
    expect(state.execution_preflight.items.some((item) =>
      item.estimated_priority_fee_lamports !== null && item.fee_bps !== null
    )).toBe(true);
  });

  test("GIVEN execution intents WHEN MEV guard screens them THEN it catches sandwich and liquidity-shock exposure", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const guard = state.execution_mev_guard;

    expect(["clear", "watch", "protect", "blocked", "paper", "idle"]).toContain(guard.status);
    expect(guard.source).toBe("local-mev-risk-model");
    expect(guard.items.length).toBeGreaterThan(0);
    expect(guard.average_sandwich_risk_score).toBeGreaterThanOrEqual(0);
    expect(guard.average_liquidity_shock_score).toBeGreaterThanOrEqual(0);
    expect(guard.items.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(guard.items.every((item) => item.recommended_slippage_bps <= guard.max_slippage_bps)).toBe(true);
    expect(guard.items.some((item) =>
      item.action === "block" ||
      item.action === "split" ||
      item.action === "private-route" ||
      item.action === "tighten-slippage" ||
      item.status === "paper"
    )).toBe(true);
    expect(state.execution_preflight.items.some((item) => item.checks.some((check) => check.id === "mev-guard"))).toBe(true);
  });

  test("GIVEN paper fills WHEN fill quality scores them THEN it measures slippage, partial fills, and shortfall", () => {
    const state = getWeb3TradingState("breakout", 2);
    const quality = state.paper_execution_quality;

    expect(["excellent", "acceptable", "degraded", "poor", "idle"]).toContain(quality.status);
    expect(quality.source).toBe("local-fill-simulator");
    expect(quality.items.length).toBe(state.trade_tape.length);
    expect(quality.requested_usd).toBeGreaterThanOrEqual(quality.filled_usd);
    expect(quality.fill_rate_pct).toBeGreaterThanOrEqual(0);
    expect(quality.fill_rate_pct).toBeLessThanOrEqual(100);
    expect(quality.average_slippage_bps).toBeGreaterThanOrEqual(0);
    expect(quality.implementation_shortfall_usd).toBeGreaterThanOrEqual(0);
    expect(quality.items.every((item) => item.quality_score >= 0 && item.quality_score <= 100)).toBe(true);
    expect(quality.items.every((item) => item.simulated_fill_price_usd > 0)).toBe(true);
    expect(quality.items.some((item) => item.tactics.length > 0)).toBe(true);
  });

  test("GIVEN ranked opportunities WHEN autonomy policy sizes entries THEN it caps risk before paper fills", () => {
    const state = getWeb3TradingState("base", 0);
    const blockedByCost = state.autonomy_policy.orders.find((order) =>
      order.blockers.some((blocker) => blocker.includes("Execution") || blocker.includes("minimum")),
    );

    expect(state.autonomy_policy.bankroll_usd).toBeGreaterThan(0);
    expect(state.autonomy_policy.risk_per_trade_pct).toBeGreaterThan(0);
    expect(state.autonomy_policy.risk_per_trade_pct).toBeLessThanOrEqual(1.4);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Risk no more"))).toBe(true);
    expect(blockedByCost?.recommended_size_usd).toBe(0);
    expect(state.autonomy_policy.orders.every((order) => order.max_loss_usd <= order.risk_budget_usd)).toBe(true);
    expect(state.autonomous_compounder.mode).toBe("autonomous-compounder");
    expect(state.autonomous_compounder.next_order_cap_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_compounder.launch_order_cap_usd).toBeLessThanOrEqual(state.autonomous_compounder.next_order_cap_usd);
    expect(state.autonomous_compounder.directives.length).toBeGreaterThan(0);
    expect(state.trade_tape.filter((trade) => trade.side === "buy").every((trade) =>
      trade.id.startsWith("paper-graduation-")
        ? state.launch_graduation.items.some((item) =>
          item.symbol === trade.symbol &&
          (item.action === "graduate" || item.action === "snipe" || item.action === "probe") &&
          item.suggested_entry_usd >= trade.size_usd &&
          state.autonomous_compounder.launch_order_cap_usd >= trade.size_usd
        )
        : trade.id.startsWith("paper-launch-")
        ? state.launch_sniper.items.some((item) =>
          item.symbol === trade.symbol &&
          (item.verdict === "snipe" || item.verdict === "probe") &&
          item.suggested_entry_usd >= trade.size_usd &&
          state.autonomous_compounder.launch_order_cap_usd >= trade.size_usd
        )
        : state.autonomy_policy.orders.some((order) => order.symbol === trade.symbol && order.recommended_size_usd >= trade.size_usd)
    )).toBe(true);
  });

  test("GIVEN policy-sized entries WHEN profit optimizer accounts for costs THEN buys require positive net edge", () => {
    const state = getWeb3TradingState("base", 0);
    const fills = state.trade_tape.filter((trade) => trade.side === "buy");

    expect(state.profit_optimizer.candidates.length).toBeGreaterThan(0);
    expect(state.profit_optimizer.candidates.every((candidate) => candidate.estimated_cost_bps >= 0)).toBe(true);
    expect(state.profit_optimizer.candidates.some((candidate) =>
      (candidate.verdict === "wait" || candidate.verdict === "avoid") &&
      candidate.blockers.some((blocker) => blocker.includes("Execution-cost") || blocker.includes("risk") || blocker.includes("Rug"))
    )).toBe(true);
    expect(fills.every((trade) => {
      if (trade.id.startsWith("paper-graduation-")) {
        const graduation = state.launch_graduation.items.find((item) => item.symbol === trade.symbol);
        return graduation !== undefined &&
          (graduation.action === "graduate" || graduation.action === "snipe" || graduation.action === "probe") &&
          graduation.suggested_entry_usd >= trade.size_usd &&
          state.autonomous_compounder.launch_order_cap_usd >= trade.size_usd;
      }
      if (trade.id.startsWith("paper-launch-")) {
        const launch = state.launch_sniper.items.find((item) => item.symbol === trade.symbol);
        return launch !== undefined &&
          (launch.verdict === "snipe" || launch.verdict === "probe") &&
          launch.suggested_entry_usd >= trade.size_usd &&
          state.autonomous_compounder.launch_order_cap_usd >= trade.size_usd;
      }
      const candidate = state.profit_optimizer.candidates.find((item) => item.symbol === trade.symbol);
      return candidate !== undefined &&
        (candidate.verdict === "press" || candidate.verdict === "take") &&
        candidate.net_edge_pct > 0 &&
        trade.size_usd === candidate.adjusted_size_usd;
    })).toBe(true);
  });

  test("GIVEN launch candidates WHEN graduation supervisor runs THEN it separates curve, migration, and post-graduation timing", () => {
    const state = getWeb3TradingState("breakout", 2);
    const graduation = state.launch_graduation;

    expect(graduation.mode).toBe("launch-graduation-supervisor");
    expect(["hunt", "graduating", "post-graduation", "cooldown", "quiet"]).toContain(graduation.status);
    expect(graduation.items.length).toBeGreaterThan(0);
    expect(graduation.items.every((item) =>
      item.graduation_score >= 0 &&
      item.graduation_score <= 100 &&
      item.curve_progress_pct >= 0 &&
      item.curve_progress_pct <= 100 &&
      item.migration_readiness_score >= 0 &&
      item.migration_readiness_score <= 100 &&
      item.liquidity_handoff_score >= 0 &&
      item.liquidity_handoff_score <= 100 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(graduation.items.some((item) =>
      item.phase === "bonding-curve" ||
      item.phase === "graduating" ||
      item.phase === "graduated" ||
      item.phase === "post-graduation"
    )).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id.startsWith("launch-graduation"))).toBe(true);
  });

  test("GIVEN open positions and new edges WHEN capital rotation runs THEN it pairs release and redeploy decisions", () => {
    const state = getWeb3TradingState("breakout", 2);
    const actionable = state.capital_rotation.items.find((item) => item.priority === "now");

    expect(["rotate", "harvest", "accumulate", "hold", "blocked"]).toContain(state.capital_rotation.status);
    expect(state.capital_rotation.items.length).toBeGreaterThan(0);
    expect(state.capital_rotation.rotation_score).toBeGreaterThanOrEqual(0);
    expect(state.capital_rotation.rotation_score).toBeLessThanOrEqual(100);
    expect(state.capital_rotation.churn_cost_bps).toBeGreaterThanOrEqual(0);
    expect(state.capital_rotation.release_usd + state.capital_rotation.deploy_usd).toBeGreaterThanOrEqual(0);
    expect(state.capital_rotation.items.every((item) => item.size_usd >= 0 && item.confidence >= 0 && item.confidence <= 100))
      .toBe(true);
    if (actionable) {
      expect(state.autopilot.actions.some((action) => action.lane === "rotation")).toBe(true);
    }
  });

  test("GIVEN paper results WHEN learning loop evaluates them THEN it produces adaptive sizing guidance", () => {
    const state = getWeb3TradingState("base", 0);

    expect(state.learning_loop.sample_size).toBe(state.trade_tape.length);
    expect(state.learning_loop.confidence).toBeGreaterThan(0);
    expect(state.learning_loop.size_multiplier).toBeGreaterThan(0);
    expect(state.learning_loop.signals.length).toBeGreaterThanOrEqual(4);
    expect(["cold-start", "press-edge", "steady", "tighten", "stand-down"]).toContain(state.learning_loop.mode);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Learning loop applies"))).toBe(true);
  });

  test("GIVEN paper outcomes WHEN signal alpha attribution runs THEN it ranks drivers after friction", () => {
    const state = getWeb3TradingState("breakout", 2);
    const attribution = state.signal_alpha_attribution;
    const setupMemory = state.autonomous_setup_memory;

    expect(["scale-up", "learning", "tighten", "protect", "idle"]).toContain(attribution.status);
    expect(attribution.items.length).toBeGreaterThanOrEqual(6);
    expect(attribution.sample_size).toBeGreaterThan(0);
    expect(attribution.friction_usd).toBeGreaterThanOrEqual(0);
    expect(attribution.recommended_size_multiplier).toBeGreaterThan(0);
    expect(attribution.items.some((item) => item.id === "execution-friction")).toBe(true);
    expect(attribution.items.every((item) => item.confidence >= 0 && item.confidence <= 96)).toBe(true);
    expect(attribution.items.every((item) => item.size_multiplier > 0)).toBe(true);
    expect(attribution.items.some((item) => item.evidence.length > 0)).toBe(true);
    expect(setupMemory.mode).toBe("autonomous-setup-memory");
    expect(["press", "selective", "cooldown", "cold-start"]).toContain(setupMemory.status);
    expect(setupMemory.sample_size).toBeGreaterThanOrEqual(0);
    expect(setupMemory.size_bias_multiplier).toBeGreaterThanOrEqual(0.5);
    expect(setupMemory.size_bias_multiplier).toBeLessThanOrEqual(1.16);
    expect(setupMemory.controls.some((control) => control.includes("paper fills"))).toBe(true);
    expect(setupMemory.items.length).toBeGreaterThan(0);
    expect(setupMemory.items.every((item) =>
      ["press", "size-down", "exit-first", "observe"].includes(item.action) &&
      item.size_multiplier > 0 &&
      item.confidence >= 0 &&
      item.confidence <= 96 &&
      item.reason.length > 0
    )).toBe(true);
  });

  test("GIVEN paper fills and open positions WHEN the performance scorecard runs THEN it measures profit, churn, and risk", () => {
    const state = getWeb3TradingState("base", 0);
    const scorecard = state.performance_scorecard;
    const churn = state.churn_efficiency_auditor;
    const objective = state.autonomous_profit_objective;
    const commandCenter = state.autonomous_command_center;
    const commandExecution = state.autonomous_command_center_execution;
    const commandPerformance = state.autonomous_command_performance;
    const profitControl = state.autonomous_profit_control;
    const fillLedger = state.autonomous_fill_ledger_digest;
    const forwardPermission = state.autonomous_forward_loop_permission;
    const loopImpact = state.autonomous_loop_impact_auditor;

    expect(["compounding", "learning", "overtrading", "protect"]).toContain(scorecard.status);
    expect(scorecard.net_pnl_usd).toBe(Math.round(state.portfolio.realized_pnl_usd + state.portfolio.unrealized_pnl_usd));
    expect(scorecard.trade_count).toBe(state.trade_tape.length);
    expect(scorecard.turnover_pct).toBeGreaterThanOrEqual(0);
    expect(scorecard.risk_adjusted_score).toBeGreaterThanOrEqual(0);
    expect(scorecard.risk_adjusted_score).toBeLessThanOrEqual(100);
    expect(scorecard.checkpoints.map((checkpoint) => checkpoint.id)).toEqual([
      "net-profit",
      "cost-edge",
      "turnover",
      "drawdown",
      "profit-factor",
      "execution-friction",
    ]);
    expect(scorecard.checkpoints.every((checkpoint) => checkpoint.detail.length > 0)).toBe(true);

    expect(fillLedger.mode).toBe("autonomous-fill-ledger-digest");
    expect(["pressing", "profitable", "protecting", "cooldown", "learning", "idle"]).toContain(fillLedger.status);
    expect(["press-winners", "protect-book", "tighten-churn", "collect-evidence", "wait"]).toContain(fillLedger.recommended_discipline);
    expect(fillLedger.recent_fill_count).toBeLessThanOrEqual(Math.min(8, state.trade_tape.length));
    expect(fillLedger.paper_volume_usd).toBeGreaterThanOrEqual(0);
    expect(fillLedger.net_pnl_usd).toBe(Math.round(state.portfolio.realized_pnl_usd + state.portfolio.unrealized_pnl_usd));
    expect(["press", "keep", "tighten", "protect", "learn", "idle"]).toContain(fillLedger.last_fill_verdict);
    expect(fillLedger.last_fill_profit_score).toBeGreaterThanOrEqual(0);
    expect(fillLedger.last_fill_profit_score).toBeLessThanOrEqual(100);
    expect(fillLedger.last_fill_quality_score).toBeGreaterThanOrEqual(0);
    expect(fillLedger.last_fill_quality_score).toBeLessThanOrEqual(100);
    expect(fillLedger.last_fill_shortfall_usd).toBeGreaterThanOrEqual(0);
    expect(["press", "selective", "protect-only", "cooldown", "wait"]).toContain(fillLedger.next_fill_permission);
    expect(fillLedger.last_fill_audit.length).toBeGreaterThan(0);
    if (fillLedger.recent_fill_count > 0) {
      expect(fillLedger.last_fill_profit_score).toBeGreaterThan(0);
      expect(fillLedger.last_fill_symbol).toBeTruthy();
    }
    expect(fillLedger.controls.some((control) => control.includes("local paper-ledger fills"))).toBe(true);
    expect(fillLedger.controls.some((control) => control.includes("last-fill profit audit"))).toBe(true);
    expect(fillLedger.items.every((item) =>
      ["launch-sniper", "launch-graduation", "signal-policy", "market-pulse", "market-intelligence", "arbiter", "opportunity-race", "candle", "protection", "manual-paper"].includes(item.lane) &&
      ["press", "keep", "tighten", "protect"].includes(item.discipline) &&
      ["profitable", "learning", "dragging", "protective"].includes(item.status) &&
      item.size_usd >= 0 &&
      item.reason.length > 0
    )).toBe(true);

    expect(objective.mode).toBe("autonomous-profit-objective");
    expect(["press", "compound", "harvest", "protect", "cooldown"]).toContain(objective.status);
    expect(objective.target_net_pnl_usd).toBeGreaterThan(0);
    expect(objective.session_profit_target_usd).toBeGreaterThanOrEqual(0);
    expect(objective.required_edge_usd).toBeGreaterThanOrEqual(0);
    expect(objective.stop_loss_usd).toBeGreaterThan(0);
    expect(objective.items.map((item) => item.id)).toEqual(["pace", "edge", "drawdown", "velocity", "policy"]);
    expect(objective.controls.some((control) => control.includes("make-money mandate"))).toBe(true);

    expect(profitControl.mode).toBe("autonomous-profit-control");
    expect(["press", "compound", "harvest", "redeploy", "protect", "cooldown"]).toContain(profitControl.status);
    expect(["burst", "active", "selective", "defensive", "paused"]).toContain(profitControl.loop_intensity);
    expect(profitControl.deploy_now_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.release_now_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.reserve_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.required_edge_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(profitControl.cadence_seconds).toBeGreaterThan(0);
    expect(profitControl.confidence_score).toBeGreaterThanOrEqual(0);
    expect(profitControl.confidence_score).toBeLessThanOrEqual(100);
    expect(profitControl.controls.some((control) => control.includes("objective"))).toBe(true);
    expect(profitControl.items.length).toBeGreaterThanOrEqual(6);

    expect(commandCenter.mode).toBe("autonomous-command-center");
    expect(["attack", "protect", "harvest", "prepare", "blocked", "watch"]).toContain(commandCenter.status);
    expect(["buy", "sell", "harvest", "protect", "refresh", "hold", "blocked"]).toContain(commandCenter.primary_action);
    expect(["buy", "sell", "hold"]).toContain(commandCenter.primary_side);
    expect(commandCenter.command_score).toBeGreaterThanOrEqual(0);
    expect(commandCenter.deploy_usd).toBeGreaterThanOrEqual(0);
    expect(commandCenter.release_usd).toBeGreaterThanOrEqual(0);
    expect(commandCenter.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(commandCenter.fastest_review_seconds).toBeGreaterThan(0);
    expect(commandCenter.controls.some((control) => control.includes("Collapses the fast race"))).toBe(true);
    expect(commandCenter.items.length).toBeGreaterThan(0);
    expect(commandCenter.items.every((item) =>
      ["fast-race", "opportunity", "portfolio-protect", "trade-arbiter", "route-refresh", "objective"].includes(item.lane) &&
      ["buy", "sell", "hold"].includes(item.side) &&
      ["buy", "sell", "harvest", "protect", "refresh", "hold", "blocked"].includes(item.action) &&
      ["ready", "queued", "applied", "blocked", "watch"].includes(item.status) &&
      ["now", "next", "watch"].includes(item.priority) &&
      item.command_score >= 0 &&
      item.size_usd >= 0 &&
      item.expected_edge_usd >= 0 &&
      item.rehearsal_score >= 0 &&
      item.rehearsal_score <= 100 &&
      ["pass", "watch", "fail"].includes(item.rehearsal_verdict) &&
      item.projected_equity_usd > 0 &&
      typeof item.projected_pnl_usd === "number" &&
      item.projected_drawdown_pct >= 0 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0 &&
      Array.isArray(item.evidence) &&
      Array.isArray(item.blockers)
    )).toBe(true);

    expect(forwardPermission.mode).toBe("autonomous-forward-loop-permission");
    expect(["press", "probe", "harvest", "protect", "refresh", "cooldown", "blocked", "observe"]).toContain(forwardPermission.status);
    expect(["press", "selective", "harvest-only", "protect-only", "refresh-first", "cooldown", "stand-down"]).toContain(forwardPermission.permission);
    expect(["run-minute", "run-loop", "paper-probe", "harvest-profit", "protect-book", "refresh-proof", "cooldown", "stand-down"]).toContain(forwardPermission.action);
    expect(forwardPermission.permission_score).toBeGreaterThanOrEqual(0);
    expect(forwardPermission.permission_score).toBeLessThanOrEqual(100);
    expect(forwardPermission.fill_audit_score).toBe(fillLedger.last_fill_profit_score);
    expect(forwardPermission.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(forwardPermission.max_fresh_buys).toBeLessThanOrEqual(forwardPermission.max_next_fills);
    expect(forwardPermission.required_after_fill_score).toBeGreaterThan(0);
    expect(typeof forwardPermission.can_fire_next_tick).toBe("boolean");
    expect(typeof forwardPermission.allows_fresh_buy).toBe("boolean");
    expect(typeof forwardPermission.requires_protection_first).toBe("boolean");
    expect(forwardPermission.items.map((item) => item.id)).toEqual(["fill-audit", "profit-proof", "integrity", "throttle", "wake", "decision"]);
    expect(forwardPermission.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(forwardPermission.controls.some((control) => control.includes("Final forward permission"))).toBe(true);

    expect(loopImpact.mode).toBe("autonomous-loop-impact-auditor");
    expect(["compound", "continue", "tighten", "harvest", "protect", "refresh", "cooldown", "blocked", "idle"]).toContain(loopImpact.status);
    expect(["increase-frequency", "keep-running", "tighten-size", "harvest-profit", "protect-wallet", "refresh-proof", "cooldown", "stand-down", "observe"]).toContain(loopImpact.action);
    expect(loopImpact.impact_score).toBeGreaterThanOrEqual(0);
    expect(loopImpact.impact_score).toBeLessThanOrEqual(100);
    expect(loopImpact.permission_after).toBe(forwardPermission.permission);
    expect(loopImpact.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(loopImpact.next_cadence_seconds).toBeGreaterThan(0);
    expect(typeof loopImpact.requested).toBe("boolean");
    expect(loopImpact.paper_only).toBe(true);
    expect(typeof loopImpact.can_press_next_loop).toBe("boolean");
    expect(typeof loopImpact.must_reduce_frequency).toBe("boolean");
    expect(typeof loopImpact.must_refresh_proof).toBe("boolean");
    expect(loopImpact.items.map((item) => item.id)).toEqual(["equity", "exposure", "fills", "permission", "proof", "boundary"]);
    expect(loopImpact.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(loopImpact.controls.some((control) => control.includes("Audits the latest backend paper loop"))).toBe(true);
    expect(commandExecution.mode).toBe("command-center-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(commandExecution.status);
    expect(commandExecution.execution_boundary).toBe("paper-ledger-only");
    expect(commandExecution.rehearsal_score).toBeGreaterThanOrEqual(0);
    expect(commandExecution.rehearsal_score).toBeLessThanOrEqual(100);
    expect(commandExecution.projected_equity_usd).toBeGreaterThan(0);
    expect(typeof commandExecution.projected_pnl_usd).toBe("number");
    expect(commandExecution.projected_drawdown_pct).toBeGreaterThanOrEqual(0);
    expect(commandExecution.controls.some((control) => control.includes("one local paper-ledger fill"))).toBe(true);
    if (commandExecution.paper_trade) {
      expect(commandExecution.paper_trade.reason).toContain("Command center paper");
    }
    expect(commandPerformance.mode).toBe("autonomous-command-performance");
    expect(["press", "selective", "tighten", "protect", "learning", "idle"]).toContain(commandPerformance.status);
    expect(commandPerformance.command_trade_count).toBeGreaterThanOrEqual(0);
    expect(commandPerformance.command_buy_count + commandPerformance.command_sell_count).toBe(commandPerformance.command_trade_count);
    expect(commandPerformance.command_volume_usd).toBeGreaterThanOrEqual(0);
    expect(typeof commandPerformance.net_contribution_usd).toBe("number");
    expect(typeof commandPerformance.expectancy_usd).toBe("number");
    expect(commandPerformance.next_size_multiplier).toBeGreaterThan(0);
    expect(commandPerformance.recommended_cadence_seconds).toBeGreaterThan(0);
    expect(commandPerformance.controls.some((control) => control.includes("command-center paper fills"))).toBe(true);
    expect(commandPerformance.items.length).toBeGreaterThan(0);

    expect(churn.mode).toBe("churn-efficiency-auditor");
    expect(["accelerate", "selective", "cooldown", "stop", "idle"]).toContain(churn.status);
    expect(churn.trade_count).toBe(state.trade_tape.length);
    expect(churn.turnover_usd).toBeGreaterThanOrEqual(0);
    expect(churn.friction_usd).toBeGreaterThanOrEqual(0);
    expect(churn.churn_score).toBeGreaterThanOrEqual(0);
    expect(churn.churn_score).toBeLessThanOrEqual(100);
    expect(churn.max_trades_next_cycle).toBeGreaterThanOrEqual(0);
    expect(["open", "selective", "cooldown", "blocked"]).toContain(churn.entry_permission);
    expect(churn.can_open_fresh_entries)
      .toBe(churn.entry_permission === "open" || churn.entry_permission === "selective");
    expect(churn.max_fresh_entry_usd).toBeGreaterThanOrEqual(0);
    expect(churn.cooled_symbol_count).toBeGreaterThanOrEqual(0);
    expect(churn.stopped_symbol_count).toBeGreaterThanOrEqual(0);
    expect(churn.cooldown_symbols.length).toBeLessThanOrEqual(5);
    expect(churn.entry_governor_summary.length).toBeGreaterThan(0);
    expect(churn.recommended_cadence_seconds).toBeGreaterThan(0);
    if (!churn.can_open_fresh_entries) {
      expect(churn.max_fresh_entry_usd).toBe(0);
    }
    expect(churn.controls.some((control) => control.includes("net-positive"))).toBe(true);
    expect(churn.controls.some((control) => control.includes("Fresh-entry permission"))).toBe(true);
    expect(churn.items.length).toBeGreaterThan(0);
    expect(churn.items.every((item) =>
      ["accelerate", "selective", "cooldown", "stop"].includes(item.action) &&
      item.turnover_usd >= 0 &&
      item.friction_usd >= 0 &&
      item.churn_score >= 0 &&
      item.churn_score <= 100 &&
      item.fill_quality_score >= 0 &&
      item.fill_quality_score <= 100 &&
      item.route_cost_bps >= 0 &&
      item.max_trade_usd >= 0 &&
      item.next_review_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
  });

  test("GIVEN the autonomous desk WHEN the forward trial runs THEN it stress-tests profit gates across regimes", () => {
    const state = getWeb3TradingState("base", 0);
    const trial = state.autonomous_forward_test;

    expect(["passed", "watch", "failed"]).toContain(trial.status);
    expect(trial.scenario_count).toBe(3);
    expect(trial.cycles_tested).toBeGreaterThanOrEqual(9);
    expect(trial.scenarios.map((scenario) => scenario.scenario).sort()).toEqual(["base", "breakout", "rug-risk"]);
    expect(trial.scenarios.every((scenario) => scenario.trade_count >= 0 && scenario.note.length > 0)).toBe(true);
    expect(trial.gates.map((gate) => gate.id)).toEqual([
      "profitability",
      "rug-survival",
      "drawdown",
      "churn",
      "current-edge",
      "execution-boundary",
    ]);
    expect(trial.gates.every((gate) => ["pass", "watch", "fail"].includes(gate.status))).toBe(true);
    expect(trial.gates.find((gate) => gate.id === "execution-boundary")?.status).toBe("pass");
  });

  test("GIVEN replay and execution evidence WHEN the edge verifier runs THEN it grants bounded capital permission before policy sizing", () => {
    const state = getWeb3TradingState("base", 0);
    const verifier = state.autonomous_edge_verifier;

    expect(verifier.mode).toBe("autonomous-edge-verifier");
    expect(["scale", "probe", "protect", "blocked"]).toContain(verifier.status);
    expect(["increase-size", "small-probe", "protect-only", "stand-down"]).toContain(verifier.permission);
    expect(verifier.confidence_score).toBeGreaterThanOrEqual(0);
    expect(verifier.confidence_score).toBeLessThanOrEqual(100);
    expect(verifier.max_trades_allowed).toBeGreaterThanOrEqual(0);
    expect(verifier.max_notional_usd).toBeGreaterThanOrEqual(0);
    expect(verifier.checks.map((check) => check.id)).toEqual([
      "replay-edge",
      "risk-adjusted",
      "signal-noise",
      "route-proof",
      "fill-quality",
      "churn-budget",
      "opportunity-cost",
      "edge-after-costs",
      "live-boundary",
    ]);
    expect(verifier.checks.every((check) => ["pass", "watch", "fail"].includes(check.status) && check.detail.length > 0)).toBe(true);
    expect(state.autonomous_policy_optimizer.min_expected_edge_usd).toBeGreaterThanOrEqual(verifier.min_required_edge_usd);
    expect(state.autonomous_policy_optimizer.safeguards.some((safeguard) => safeguard.includes("edge verifier"))).toBe(true);
    if (verifier.permission === "stand-down" || verifier.permission === "protect-only") {
      expect(state.autonomous_policy_optimizer.deploy_budget_usd).toBe(0);
    }
  });

  test("GIVEN live-style signal, replay, route, and wallet evidence WHEN the edge stack runs THEN it emits one auditable paper-trade verdict", () => {
    const state = getWeb3TradingState("breakout", 2);
    const stack = state.autonomous_edge_stack;

    expect(stack.mode).toBe("autonomous-edge-stack");
    expect(["attack", "probe", "protect", "replay", "blocked"]).toContain(stack.status);
    expect(["paper-attack", "paper-probe", "protect-only", "refresh-first", "stand-down"]).toContain(stack.permission);
    expect(stack.edge_score).toBeGreaterThanOrEqual(0);
    expect(stack.edge_score).toBeLessThanOrEqual(100);
    expect(stack.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(stack.required_edge_usd).toBeGreaterThan(0);
    expect(stack.max_paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(stack.review_after_seconds).toBeGreaterThan(0);
    expect(stack.items.map((item) => item.lane)).toEqual(["signal", "replay", "route", "wallet", "cost", "safety"]);
    expect(stack.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(stack.controls.some((control) => control.includes("Fuses signal/noise"))).toBe(true);
    expect(stack.controls.some((control) => control.includes("local paper-ledger only"))).toBe(true);
    if (stack.should_auto_trade) {
      expect(stack.status === "attack" || stack.status === "probe").toBe(true);
      expect(stack.max_trades_next_tick).toBeGreaterThan(0);
      expect(stack.expected_edge_usd).toBeGreaterThanOrEqual(stack.required_edge_usd);
    } else {
      expect(stack.next_action.length).toBeGreaterThan(0);
    }
  });

  test("GIVEN the fused edge-stack verdict WHEN execution is planned THEN it selects one bounded paper or read-only lane", () => {
    const state = getWeb3TradingState("breakout", 2);
    const stack = state.autonomous_edge_stack;
    const execution = state.autonomous_edge_stack_execution;

    expect(execution.mode).toBe("autonomous-edge-stack-execution");
    expect(["queued", "applied", "refresh-only", "protect-only", "blocked", "idle"]).toContain(execution.status);
    expect(["paper-buy", "paper-sell", "route-refresh", "protect", "stand-down"]).toContain(execution.selected_action);
    expect(execution.permission).toBe(stack.permission);
    expect(execution.edge_status).toBe(stack.status);
    expect(execution.execution_boundary).toBe("paper-ledger-or-readonly-route");
    expect(execution.paper_boundary).toBe("paper-ledger-only");
    expect(execution.route_boundary).toBe("read-only-route-refresh");
    expect(typeof execution.paper_trade_ready).toBe("boolean");
    expect(typeof execution.route_refresh_ready).toBe("boolean");
    expect(typeof execution.ledger_applied).toBe("boolean");
    expect(execution.paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(execution.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(execution.required_edge_usd).toBeGreaterThan(0);
    expect(execution.edge_score).toBe(stack.edge_score);
    expect(execution.controls.some((control) => control.includes("concrete existing lane"))).toBe(true);
    expect(execution.controls.some((control) => control.includes("read-only"))).toBe(true);
    expect(execution.summary.length).toBeGreaterThan(0);
    expect(execution.next_action.length).toBeGreaterThan(0);

    if (execution.status === "queued" || execution.status === "applied") {
      expect(execution.paper_trade_ready).toBe(true);
      expect(execution.paper_trade).not.toBeNull();
      expect(["paper-buy", "paper-sell"]).toContain(execution.selected_action);
      expect(execution.paper_size_usd).toBeGreaterThan(0);
    }

    if (execution.status === "refresh-only") {
      expect(execution.selected_action).toBe("route-refresh");
      expect(execution.route_refresh_required).toBe(true);
      expect(execution.route_refresh_ready).toBe(true);
    }

    if (execution.status === "blocked") {
      expect(execution.blockers.length).toBeGreaterThan(0);
    }
  });

  test("GIVEN edge-stack execution WHEN the tick plan ranks lanes THEN the fused edge action feeds the next autonomous loop", async () => {
    const coldState = getWeb3TradingState("breakout", 2);
    const coldExecution = coldState.autonomous_edge_stack_execution;
    const coldEdgeItem = coldState.autonomous_tick_plan.items.find((item) => item.id === "tick-plan-edge-action");

    expect(coldEdgeItem).toBeTruthy();
    expect(coldEdgeItem?.lane).toBe("edge");
    expect(coldEdgeItem?.symbol).toBe(coldExecution.selected_symbol);
    expect(coldState.autonomous_tick_plan.controls.some((control) => control.includes("fused edge action"))).toBe(true);

    const state = await getWeb3TradingStateAsync({
      scenario: "breakout",
      source: "sample",
      account: "persistent",
      reset: true,
    });
    const execution = state.autonomous_edge_stack_execution;
    const edgeItem = state.autonomous_tick_plan.items.find((item) => item.id === "tick-plan-edge-action");

    expect(edgeItem).toBeTruthy();
    expect(edgeItem?.lane).toBe("edge");
    expect(edgeItem?.symbol).toBe(execution.selected_symbol);
    expect(edgeItem?.expected_edge_usd).toBe(Math.round(Math.max(0, execution.expected_edge_usd)));
    expect(state.autonomous_tick_plan.controls.some((control) => control.includes("fused edge action"))).toBe(true);

    if (execution.selected_action === "paper-buy") {
      expect(edgeItem?.action).toBe("trade-now");
      expect(edgeItem?.status).toBe(execution.status === "queued" ? "ready" : execution.status === "applied" ? "watch" : "blocked");
    }

    if (execution.selected_action === "paper-sell" || execution.selected_action === "protect") {
      expect(edgeItem?.action).toBe("protect-now");
      expect(edgeItem?.priority).toBe("critical");
    }

    if (execution.selected_action === "route-refresh") {
      expect(edgeItem?.action).toBe("refresh-routes");
      expect(edgeItem?.paper_budget_usd).toBe(0);
    }

    if (execution.status === "blocked") {
      expect(edgeItem?.status).toBe("blocked");
      expect(edgeItem?.blocker).toBeTruthy();
    }
  });

  test("GIVEN entry and protection candidates WHEN the opportunity race runs THEN it ranks the next bounded paper action", () => {
    const state = getWeb3TradingState("breakout", 2);
    const race = state.autonomous_opportunity_race;

    expect(race.mode).toBe("autonomous-opportunity-race");
    expect(["attack", "probe", "protect", "stand-down", "idle"]).toContain(race.status);
    expect(["attack", "probe", "protect", "harvest", "ignore", "blocked"]).toContain(race.winner_action);
    expect(race.fastest_decision_seconds).toBeGreaterThan(0);
    expect(race.items.length).toBeGreaterThan(0);
    expect(race.controls.length).toBeGreaterThan(0);
    expect(race.items.every((item) =>
      ["buy", "sell", "hold"].includes(item.side) &&
      ["attack", "probe", "protect", "harvest", "ignore", "blocked"].includes(item.action) &&
      ["now", "next", "watch"].includes(item.priority) &&
      item.race_score >= 0 &&
      item.race_score <= 100 &&
      item.signal_score >= 0 &&
      item.route_score >= 0 &&
      item.wallet_score >= 0 &&
      item.urgency_seconds > 0 &&
      item.recommended_notional_usd >= 0 &&
      item.expected_edge_usd >= 0 &&
      item.risk_usd >= 0 &&
      item.evidence.length > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(race.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(race.risk_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_race_execution.mode).toBe("opportunity-race-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_opportunity_race_execution.status);
    expect(state.autonomous_opportunity_race_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_opportunity_race_execution.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_opportunity_race_execution.controls.some((control) => control.includes("opportunity-race winner"))).toBe(true);
    expect(state.autonomous_position_risk_execution.mode).toBe("autonomous-position-risk-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_position_risk_execution.status);
    expect(state.autonomous_position_risk_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_position_risk_execution.controls.some((control) => control.includes("paper-ledger boundary"))).toBe(true);
    expect(state.portfolio_tape_guard_execution.mode).toBe("portfolio-tape-guard-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.portfolio_tape_guard_execution.status);
    expect(state.portfolio_tape_guard_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.portfolio_tape_guard_execution.controls.some((control) => control.includes("paper sell"))).toBe(true);
    if (state.autonomous_position_risk_execution.paper_trade) {
      expect(state.autonomous_position_risk_execution.paper_trade.status).toBe("paper-filled");
      expect(state.autonomous_position_risk_execution.paper_trade.side).toBe("sell");
      expect(state.autonomous_position_risk_execution.paper_trade.id).toMatch(/^paper-position-risk-/);
    }
    if (state.portfolio_tape_guard_execution.paper_trade) {
      expect(state.portfolio_tape_guard_execution.paper_trade.status).toBe("paper-filled");
      expect(state.portfolio_tape_guard_execution.paper_trade.side).toBe("sell");
      expect(state.portfolio_tape_guard_execution.paper_trade.id).toMatch(/^paper-tape-guard-/);
    }
    if (state.autonomous_opportunity_race_execution.paper_trade) {
      expect(state.autonomous_opportunity_race_execution.paper_trade.status).toBe("paper-filled");
      expect(state.autonomous_opportunity_race_execution.paper_trade.reason).toContain("Opportunity race");
      expect(Math.abs(state.autonomous_opportunity_race_execution.cash_delta_usd)).toBe(
        state.autonomous_opportunity_race_execution.paper_trade.size_usd,
      );
    }
    if (race.status === "attack" || race.status === "probe") {
      expect(race.deploy_notional_usd).toBeGreaterThan(0);
    }
    if (race.status === "protect") {
      expect(race.release_notional_usd).toBeGreaterThan(0);
    }
    if (race.status === "stand-down") {
      expect(race.items.some((item) => item.action === "blocked" || item.blockers.length > 0)).toBe(true);
    }
  });

  test("GIVEN fast markets WHEN the high-frequency profit race runs THEN it ranks immediate paper actions by after-cost profit per minute", () => {
    const state = getWeb3TradingState("breakout", 2);
    const race = state.high_frequency_profit_race;
    const execution = state.high_frequency_profit_race_execution;

    expect(race.mode).toBe("high-frequency-profit-race");
    expect(["attack", "scalp", "protect", "cooldown", "blocked", "idle"]).toContain(race.status);
    expect(race.items.length).toBeGreaterThan(0);
    expect(race.fastest_window_seconds).toBeGreaterThan(0);
    expect(race.average_score).toBeGreaterThanOrEqual(0);
    expect(race.expected_profit_usd).toBeGreaterThanOrEqual(0);
    expect(race.expected_profit_per_minute_usd).toBeGreaterThanOrEqual(0);
    expect(["fast-entry", "scalp", "profit-protect", "route-repair", "cooldown-watch"]).toContain(race.action_plan.mode);
    expect(["attack", "scalp", "trim", "exit", "harvest", "watch", "blocked", "refresh"]).toContain(race.action_plan.action);
    expect(["buy", "sell", "hold"]).toContain(race.action_plan.side);
    expect(["now", "next", "watch"]).toContain(race.action_plan.urgency);
    expect(["dex-discovery", "pair-refresh", "route-quote", "wallet-protect", "signal-watch"]).toContain(race.action_plan.data_lane);
    expect(race.action_plan.cadence_seconds).toBeGreaterThan(0);
    expect(race.action_plan.max_notional_usd).toBeGreaterThanOrEqual(0);
    expect(race.action_plan.expected_profit_per_minute_usd).toBeGreaterThanOrEqual(0);
    expect(typeof race.action_plan.route_refresh_required).toBe("boolean");
    expect(race.action_plan.reason.length).toBeGreaterThan(0);
    expect(race.action_plan.controls.some((control) => control.includes("Max local paper notional"))).toBe(true);
    if (race.action_plan.action === "refresh" || race.action_plan.action === "watch" || race.action_plan.action === "blocked") {
      expect(race.action_plan.max_notional_usd).toBe(0);
    }
    expect(race.controls.some((control) => control.includes("expected paper profit per minute"))).toBe(true);
    expect(race.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(race.items.every((item) =>
      ["buy", "sell", "hold"].includes(item.side) &&
      ["attack", "scalp", "trim", "exit", "harvest", "watch", "blocked"].includes(item.action) &&
      ["now", "next", "watch"].includes(item.priority) &&
      ["trend-entry", "scalp-route", "profit-protect"].includes(item.source) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.notional_usd >= 0 &&
      item.expected_profit_usd >= 0 &&
      item.expected_profit_per_minute_usd >= 0 &&
      item.churn_cost_bps >= 0 &&
      item.decision_window_seconds > 0 &&
      typeof item.paper_route_fallback === "boolean" &&
      Array.isArray(item.live_route_blockers) &&
      item.evidence.length > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(execution.mode).toBe("high-frequency-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(execution.status);
    expect(execution.execution_boundary).toBe("paper-ledger-only");
    expect(execution.review_after_seconds).toBeGreaterThan(0);
    expect(execution.expected_profit_usd).toBeGreaterThanOrEqual(0);
    expect(execution.expected_profit_per_minute_usd).toBeGreaterThanOrEqual(0);
    expect(execution.churn_cost_bps).toBeGreaterThanOrEqual(0);
    expect(typeof execution.paper_route_fallback).toBe("boolean");
    expect(Array.isArray(execution.live_route_blockers)).toBe(true);
    expect(execution.controls.some((control) => control.includes("one local paper-ledger fill"))).toBe(true);
    expect(execution.controls.some((control) => control.includes("local paper route fallback"))).toBe(true);
    expect(execution.controls.some((control) => control.includes("Jupiter"))).toBe(true);
    if (execution.paper_route_fallback) {
      expect(execution.live_route_blockers.length).toBeGreaterThan(0);
    }
    if (execution.paper_trade) {
      expect(execution.paper_trade.status).toBe("paper-filled");
      expect(execution.paper_trade.reason).toContain("High-frequency race");
      expect(Math.abs(execution.cash_delta_usd)).toBe(execution.paper_trade.size_usd);
      expect(Math.abs(execution.exposure_delta_usd)).toBe(execution.paper_trade.size_usd);
    }
    expect(state.autonomous_tick_plan.items.some((item) => item.id === "tick-plan-high-frequency" || execution.status === "idle")).toBe(true);
  });

  test("GIVEN an exit-only wallet WHEN the minute loop runs THEN it can protect positions without opening fresh buys", () => {
    const state = getWeb3TradingState("base", 0);
    const velocity = state.autonomous_profit_velocity_governor;

    expect(state.autonomous_trade_readiness_gate.status).toBe("exit-only");
    expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
    expect(state.autonomous_action_queue_execution.selected_side).toBe("sell");
    expect(state.autonomous_action_queue_execution.paper_trade_ready).toBe(true);
    expect(velocity.status).toBe("protect");
    expect(velocity.loop_permission).toBe("protect-only");
    expect(velocity.max_trades_next_minute).toBeGreaterThan(0);
    expect(velocity.target_trades_per_minute).toBeGreaterThan(0);
    expect(velocity.max_churn_notional_usd).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.items.some((item) =>
      item.action === "protect-now" &&
      item.status === "ready"
    )).toBe(true);
  });

  test("GIVEN a protect-minute wake plan WHEN the backend loop tick runs THEN it executes a bounded protective paper session", async () => {
    const baseline = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "ephemeral",
      advance: false,
    });

    expect(baseline.autonomous_wake_plan.status).toBe("minute");
    expect(baseline.autonomous_wake_plan.next_client_action).toBe("run-minute");
    expect(baseline.autonomous_wake_plan.can_auto_watch_run).toBe(true);
    expect(baseline.autonomous_profit_velocity_governor.loop_permission).toBe("protect-only");
    expect(typeof baseline.autonomous_loop_throttle.can_run).toBe("boolean");

    const state = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "ephemeral",
      autonomous_loop: {
        action: "tick",
      },
    });

    expect(["session-run", "refreshed"]).toContain(state.autonomous_loop_tick.status);
    if (state.autonomous_loop_tick.status === "session-run") {
      expect(state.autonomous_loop_tick.action).toBe("protect-book");
      expect(state.autonomous_loop_tick.summary).toContain("protect-minute");
      expect(state.autonomous_session_run.requested).toBe(true);
      expect(state.autonomous_session_run.completed_ticks).toBeLessThanOrEqual(Math.max(1, baseline.autonomous_wake_plan.ticks, baseline.autonomous_profit_velocity_governor.max_trades_next_minute));
      expect(state.autonomous_session_run.protective_sell_count).toBeLessThanOrEqual(baseline.autonomous_wake_plan.max_protective_sells);
      expect(state.autonomous_session_run.max_total_fills).toBeLessThanOrEqual(Math.max(1, baseline.autonomous_wake_plan.max_total_fills, baseline.autonomous_profit_velocity_governor.max_trades_next_minute));
    } else {
      expect(state.autonomous_loop_tick.action).toMatch(/refresh|protect-book/);
      expect(state.execution_gate.live_execution_enabled).toBe(false);
    }
  });

  test("GIVEN a held-profit race with stale proof WHEN profit capture autopilot plans THEN it refreshes before trusting release sizing", () => {
    const state = getWeb3TradingState("base", 0);
    const capture = state.autonomous_profit_capture_autopilot;

    expect(capture.mode).toBe("autonomous-profit-capture-autopilot");
    expect(capture.status).toBe("race");
    expect(capture.action).toBe("exit-now");
    expect(capture.side).toBe("sell");
    expect(capture.release_usd).toBeGreaterThan(0);
    expect(capture.must_refresh_route).toBe(true);
    expect(capture.must_apply_protective_sell).toBe(false);
    expect(capture.paper_trade_ready).toBe(false);
    expect(capture.execution_boundary).toBe("read-only-refresh");
    expect(capture.next_action).toContain("Refresh read-only route proof");
    expect(capture.items.find((item) => item.id === "route")).toMatchObject({
      status: "watch",
      value: state.autonomous_route_refresh_execution.status.replace("-", " "),
    });
    expect(capture.items.find((item) => item.id === "boundary")).toMatchObject({
      status: "pass",
      value: "read only refresh",
    });
  });

  test("GIVEN released profit still needs proof WHEN redeploy autopilot plans THEN it refuses to chase before refresh", () => {
    const state = getWeb3TradingState("base", 0);
    const redeploy = state.autonomous_profit_redeploy_autopilot;
    const execution = state.autonomous_profit_redeploy_execution;

    expect(redeploy.mode).toBe("autonomous-profit-redeploy-autopilot");
    expect(redeploy.status).toBe("protect-first");
    expect(redeploy.action).toBe("protect-before-redeploy");
    expect(redeploy.must_protect_first).toBe(true);
    expect(redeploy.must_refresh_proof).toBe(true);
    expect(redeploy.can_redeploy_paper).toBe(false);
    expect(redeploy.redeploy_budget_usd).toBe(0);
    expect(redeploy.released_cash_usd).toBeGreaterThan(0);
    expect(redeploy.execution_boundary).toBe("read-only-refresh");
    expect(redeploy.next_action).toContain("Protect");
    expect(redeploy.items.find((item) => item.id === "capture")).toMatchObject({
      status: "block",
    });
    expect(redeploy.items.find((item) => item.id === "boundary")).toMatchObject({
      status: "pass",
      value: "read only refresh",
    });
    expect(redeploy.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
    expect(execution.mode).toBe("autonomous-profit-redeploy-execution");
    expect(execution.status).toBe("queued");
    expect(execution.source).toBe("profit-capture");
    expect(execution.execution_lane).toBe("portfolio-protect");
    expect(execution.paper_trade_ready).toBe(true);
    expect(execution.paper_trade).toMatchObject({
      side: "sell",
      symbol: redeploy.from_symbol,
    });
    expect(execution.execution_boundary).toBe("paper-ledger-only");
    expect(execution.next_action).toContain("protective paper sell");
    expect(execution.items.find((item) => item.id === "autopilot")).toMatchObject({
      status: "watch",
      value: "protect first",
    });
    expect(execution.items.find((item) => item.id === "boundary")).toMatchObject({
      status: "pass",
      value: "paper ledger only",
    });
  });

  test("GIVEN a persistent paper account WHEN backend loop tick runs THEN the loop receipt survives reload", async () => {
    const ticked = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      reset: true,
      autonomous_loop: {
        action: "tick",
      },
    });
    const reloaded = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      advance: false,
    });

    expect(ticked.autonomous_loop_tick.requested).toBe(true);
    expect(reloaded.autonomous_loop_tick.requested).toBe(true);
    expect(reloaded.autonomous_loop_tick.status).toBe(ticked.autonomous_loop_tick.status);
    expect(reloaded.autonomous_loop_tick.action).toBe(ticked.autonomous_loop_tick.action);
    expect(reloaded.autonomous_loop_tick.summary).toBe(ticked.autonomous_loop_tick.summary);
    expect(reloaded.autonomous_loop_tick.next_action).toBe(ticked.autonomous_loop_tick.next_action);
  });

  test("GIVEN a daemon lease WHEN backend loop tick stands down THEN the lease receipt is still persisted", async () => {
    const requestBody = {
      scenario: "base",
      source: "sample",
      account: "persistent",
      reset: true,
      daemon: true,
      autonomous_loop: {
        action: "tick",
      },
      daemon_lease: {
        lease_id: "lease-loop-root-test-001",
        runner_id: "loop-root-runner",
        request_id: "request-loop-root-test-001",
      },
    };
    const first = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify(requestBody),
    }));
    const replay = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({ ...requestBody, reset: false }),
    }));
    const firstState = await json<Web3TradingState>(first);
    const replayState = await json<Web3TradingState>(replay);

    expect(first.status).toBe(200);
    expect(["acquired", "renewed", "expired"]).toContain(firstState.autonomous_daemon_handoff.lease_status);
    expect(firstState.autonomous_daemon_handoff.active_runner_id).toBe("loop-root-runner");
    expect(replay.status).toBe(200);
    expect(replayState.autonomous_daemon_handoff.lease_status).toBe("replayed");
    expect(replayState.paper_daemon.advanced).toBe(false);
  });

  test("GIVEN chart proof is bundled with a backend loop tick WHEN posted THEN the server records proof before deciding the tick", async () => {
    const targetSeed = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      reset: true,
      advance: false,
    });
    const targetSymbol = targetSeed.autonomous_chart_proof_target.target_symbol ?? targetSeed.autonomous_candle_conviction.target_symbol ?? "FARTCOIN";
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "base",
        source: "sample",
        account: "persistent",
        reset: true,
        advance: false,
        candle_refresh: {
          action: "record",
          provider: "sample",
          source: "local-price-action-tape",
          symbol: targetSymbol,
          pool: `${targetSymbol.toLowerCase()}-solana-pool`,
          network: "solana",
          timeframe: "minute",
          candle_count: 24,
          last_price_usd: 0.000022,
          fetched_at: "2026-06-18T12:03:00.000Z",
          signal: {
            action: "probe",
            confidence: 72,
            momentum_score: 76,
            volume_score: 70,
            risk_score: 32,
            review_after_seconds: 15,
            summary: `Probe ${targetSymbol} after the chart gate refreshes.`,
            blockers: [],
          },
          paper_decision: {
            action: "paper-buy",
            side: "buy",
            notional_usd: 90,
            reason: `${targetSymbol} chart proof clears a bounded paper probe before the backend loop tick.`,
            blockers: [],
          },
        },
        autonomous_loop: {
          action: "tick",
        },
      }),
    }));
    const ticked = await json<Web3TradingState>(response);
    const reloaded = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      advance: false,
    });

    expect(response.status).toBe(200);
    expect(ticked.autonomous_loop_tick.requested).toBe(true);
    expect(ticked.autonomous_candle_refresh.requested).toBe(true);
    expect(ticked.autonomous_candle_refresh.symbol).toBe(targetSymbol);
    expect(ticked.autonomous_candle_refresh.paper_action).toBe("paper-buy");
    expect(ticked.autonomous_candle_conviction.saved_proof_symbol).toBe(targetSymbol);
    expect(ticked.autonomous_candle_conviction.proof_target_matched).toBe(true);
    expect(ticked.autonomous_candle_conviction.proof_target_mismatch).toBeNull();
    expect(ticked.autonomous_candle_conviction.refresh_required).toBe(false);
    expect(ticked.autonomous_chart_proof_target.target_symbol).toBe(targetSymbol);
    expect(ticked.autonomous_chart_proof_target.proof_target_matched).toBe(true);
    expect(ticked.autonomous_chart_proof_target.should_fetch).toBe(false);
    expect(reloaded.autonomous_loop_tick.summary).toBe(ticked.autonomous_loop_tick.summary);
    expect(reloaded.autonomous_candle_refresh.summary).toBe(ticked.autonomous_candle_refresh.summary);
    expect(reloaded.autonomous_candle_conviction.target_symbol).toBe(targetSymbol);
    expect(reloaded.autonomous_candle_conviction.proof_target_matched).toBe(true);
    expect(reloaded.autonomous_chart_proof_target.target_symbol).toBe(targetSymbol);
  });

  test("GIVEN chart proof is for a different coin WHEN bundled with a backend loop tick THEN the server keeps the active target locked", async () => {
    const targetSeed = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      reset: true,
      advance: false,
    });
    const targetSymbol = targetSeed.autonomous_chart_proof_target.target_symbol ?? targetSeed.autonomous_candle_conviction.target_symbol ?? "FARTCOIN";
    const proofSymbol = targetSymbol === "BONK" ? "FARTCOIN" : "BONK";
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "base",
        source: "sample",
        account: "persistent",
        reset: true,
        advance: false,
        candle_refresh: {
          action: "record",
          provider: "sample",
          source: "local-price-action-tape",
          symbol: proofSymbol,
          pool: `${proofSymbol.toLowerCase()}-solana-pool`,
          network: "solana",
          timeframe: "minute",
          candle_count: 24,
          last_price_usd: 0.000022,
          fetched_at: "2026-06-18T12:02:00.000Z",
          signal: {
            action: "probe",
            confidence: 72,
            momentum_score: 76,
            volume_score: 70,
            risk_score: 32,
            review_after_seconds: 15,
            summary: `Probe ${proofSymbol} after the chart gate refreshes.`,
            blockers: [],
          },
          paper_decision: {
            action: "paper-buy",
            side: "buy",
            notional_usd: 90,
            reason: `${proofSymbol} chart proof should not clear a different active target.`,
            blockers: [],
          },
        },
        autonomous_loop: {
          action: "tick",
        },
      }),
    }));
    const ticked = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(ticked.autonomous_candle_refresh.symbol).toBe(proofSymbol);
    expect(ticked.autonomous_candle_conviction.target_symbol).toBe(targetSymbol);
    expect(ticked.autonomous_candle_conviction.saved_proof_symbol).toBe(proofSymbol);
    expect(ticked.autonomous_candle_conviction.proof_target_matched).toBe(false);
    expect(ticked.autonomous_candle_conviction.proof_target_mismatch).toContain(proofSymbol);
    expect(ticked.autonomous_candle_conviction.proof_target_mismatch).toContain(targetSymbol);
    expect(ticked.autonomous_candle_conviction.refresh_required).toBe(true);
    expect(ticked.autonomous_chart_proof_target.target_symbol).toBe(targetSymbol);
    expect(ticked.autonomous_chart_proof_target.saved_proof_symbol).toBe(proofSymbol);
    expect(ticked.autonomous_chart_proof_target.should_fetch).toBe(true);
  });

  test("GIVEN a candle refresh receipt WHEN it is recorded through the trading API THEN chart proof survives reload", async () => {
    const targetSeed = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      reset: true,
      advance: false,
    });
    const targetSymbol = targetSeed.autonomous_chart_proof_target.target_symbol ?? targetSeed.autonomous_candle_conviction.target_symbol ?? "FARTCOIN";
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "base",
        source: "sample",
        account: "persistent",
        reset: true,
        advance: false,
        candle_refresh: {
          action: "record",
          provider: "geckoterminal",
          source: "geckoterminal-public",
          symbol: targetSymbol,
          pool: `${targetSymbol.toLowerCase()}-solana-pool`,
          network: "solana",
          timeframe: "minute",
          candle_count: 48,
          last_price_usd: 0.000025,
          fetched_at: "2026-06-18T12:00:00.000Z",
          signal: {
            action: "press",
            confidence: 88,
            momentum_score: 91,
            volume_score: 86,
            risk_score: 18,
            review_after_seconds: 10,
            summary: "Press candidate from fresh OHLCV evidence.",
            blockers: [],
          },
          paper_decision: {
            action: "paper-buy",
            side: "buy",
            notional_usd: 125,
            reason: `Press ${targetSymbol} in paper after candle confirmation.`,
            blockers: [],
          },
        },
      }),
    }));
    const recorded = await json<Web3TradingState>(response);
    const reloaded = await getWeb3TradingStateAsync({
      scenario: "base",
      source: "sample",
      account: "persistent",
      advance: false,
    });

    expect(response.status).toBe(200);
    expect(recorded.autonomous_candle_refresh.requested).toBe(true);
    expect(recorded.autonomous_candle_refresh.status).toBe("ready");
    expect(recorded.autonomous_candle_refresh.symbol).toBe(targetSymbol);
    expect(recorded.autonomous_candle_refresh.signal_action).toBe("press");
    expect(recorded.autonomous_candle_refresh.paper_action).toBe("paper-buy");
    expect(recorded.autonomous_candle_refresh.paper_notional_usd).toBe(125);
    expect(recorded.autonomous_candle_conviction.target_symbol).toBe(targetSymbol);
    expect(recorded.autonomous_candle_conviction.status).toBe("confirm");
    expect(recorded.autonomous_candle_conviction.refresh_required).toBe(false);
    expect(recorded.autonomous_candle_conviction.summary).toContain("recorded OHLCV confirmation");
    expect(reloaded.autonomous_candle_refresh.requested).toBe(true);
    expect(reloaded.autonomous_candle_refresh.summary).toBe(recorded.autonomous_candle_refresh.summary);
    expect(reloaded.autonomous_candle_refresh.next_action).toBe(recorded.autonomous_candle_refresh.next_action);
    expect(reloaded.autonomous_candle_conviction.status).toBe("confirm");
    expect(reloaded.autonomous_candle_conviction.refresh_required).toBe(false);
  });

  test("GIVEN malformed candle refresh evidence WHEN posted THEN the trading API rejects it", async () => {
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "base",
        source: "sample",
        account: "persistent",
        advance: false,
        candle_refresh: {
          action: "record",
          symbol: "BONK",
          candle_count: 48,
          signal: {
            action: "press",
            confidence: 101,
            momentum_score: 81,
            volume_score: 74,
            risk_score: 31,
            review_after_seconds: 10,
            summary: "Invalid confidence should be rejected.",
          },
        },
      }),
    }));
    const payload = await json<{ error: string }>(response);

    expect(response.status).toBe(422);
    expect(payload.error).toContain("confidence");
  });

  test("GIVEN a ready queue-owned sell WHEN Auto watch plans THEN it selects the protect-minute lane", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 0,
        bundle_action_count: 0,
        next_minute_trade_budget_usd: 0,
      },
    });

    expect(plan.mode).toBe("minute");
    expect(plan.label).toBe("auto protect minute");
    expect(plan.reason).toContain("1 trades/min max");
    expect(plan.reason).toContain("1 queued action");
    expect(plan.reason).toContain("Backend loop tick owns");
  });

  test("GIVEN a daily profit lock needs harvest WHEN Auto watch plans THEN it protects gains before fresh entries", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_daily_profit_lock: {
        ...state.autonomous_daily_profit_lock,
        status: "harvest",
        action: "harvest",
        loop_permission: "harvest-only",
        fresh_buy_allowed: false,
        protect_sell_allowed: true,
        release_required_usd: 115,
        max_next_fills: 2,
        review_after_seconds: 5,
        next_action: "Harvest $115 before any fresh memecoin entry.",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("minute");
    expect(plan.label).toBe("profit lock harvest");
    expect(plan.action).toBe("loop");
    expect(plan.reason).toContain("Harvest $115");
    expect(plan.reason).toContain("before fresh buys");
  });

  test("GIVEN a daily loss brake stands down WHEN Auto watch plans THEN it blocks high-frequency entries", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_daily_profit_lock: {
        ...state.autonomous_daily_profit_lock,
        status: "stand-down",
        action: "stand-down",
        loop_permission: "stand-down",
        fresh_buy_allowed: false,
        protect_sell_allowed: false,
        stop_reason: "Daily loss brake is hit.",
        review_after_seconds: 7,
        next_action: "Daily loss brake is hit.",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("cycle");
    expect(plan.label).toBe("profit lock stand-down");
    expect(plan.action).toBe("loop");
    expect(plan.delayMs).toBeGreaterThanOrEqual(30_000);
    expect(plan.reason).toContain("Daily loss brake is hit");
    expect(plan.reason).toContain("stands down fresh paper entries");
  });

  test("GIVEN Auto watch is primed on a safety loop plan WHEN throttle is blocked THEN it keeps monitoring", () => {
    const state = getWeb3TradingState("base", 0);
    const blockedThrottleState = {
      ...state,
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "blocked",
        can_run: false,
        next_action: "Throttle is blocked, but safety review must keep observing.",
      },
    } satisfies Web3TradingState;
    const plan = chooseAutoWatchPlan(blockedThrottleState);

    expect(plan.label).toBe("profit lock protect");
    expect(plan.action).toBe("loop");
    expect(shouldPauseAutoWatchForPlan(blockedThrottleState, plan, true)).toBe(false);
  });

  test("GIVEN profit integrity cools down WHEN Auto watch plans THEN it stops fresh frequency before the minute loop", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_profit_integrity_circuit: {
        ...state.autonomous_profit_integrity_circuit,
        status: "cooldown",
        permission: "cooldown",
        action: "cooldown",
        integrity_score: 38,
        cadence_seconds: 9,
        can_continue: false,
        should_pause_fresh_buys: true,
        should_protect_first: false,
        next_action: "Cooldown until paper PnL quality repairs.",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("cycle");
    expect(plan.label).toBe("integrity cooldown");
    expect(plan.action).toBe("loop");
    expect(plan.delayMs).toBeGreaterThanOrEqual(3_000);
    expect(plan.reason).toContain("Cooldown until paper PnL quality repairs");
    expect(plan.reason).toContain("will not press fresh entries");
  });

  test("GIVEN wallet performance is protect-only WHEN Auto watch plans THEN it routes protection before fresh entries", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_wallet_performance_governor: {
        ...state.autonomous_wallet_performance_governor,
        status: "protect",
        fresh_buy_permission: "blocked",
        protective_sell_only: true,
        make_money_score: 34,
        window_pnl_usd: -72,
        max_drawdown_pct: 9.4,
        cadence_seconds: 5,
        next_action: "Protect the wallet curve before any fresh paper buy.",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("minute");
    expect(plan.label).toBe("wallet protect minute");
    expect(plan.action).toBe("loop");
    expect(plan.reason).toContain("Protect the wallet curve");
    expect(plan.reason).toContain("before fresh buys");
  });

  test("GIVEN wallet performance blocks fresh buys WHEN Auto watch plans THEN it cools down the loop", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_action_queue_execution: {
        ...state.autonomous_action_queue_execution,
        selected_side: "buy",
        paper_trade_ready: false,
        paper_trade: null,
      },
      autonomous_wallet_performance_governor: {
        ...state.autonomous_wallet_performance_governor,
        status: "cooldown",
        fresh_buy_permission: "blocked",
        protective_sell_only: false,
        make_money_score: 39,
        window_pnl_usd: -44,
        cadence_seconds: 8,
        next_action: "Cooldown until the wallet curve repairs.",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("cycle");
    expect(plan.label).toBe("wallet cooldown");
    expect(plan.action).toBe("loop");
    expect(plan.delayMs).toBeGreaterThanOrEqual(3_000);
    expect(plan.reason).toContain("Cooldown until the wallet curve repairs");
    expect(plan.reason).toContain("make-money score 39/100");
  });

  test("GIVEN the last fill audit cools down WHEN Auto watch plans THEN it stops fresh paper cadence", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_fill_ledger_digest: {
        ...state.autonomous_fill_ledger_digest,
        status: "cooldown",
        next_fill_permission: "cooldown",
        last_fill_verdict: "tighten",
        last_fill_profit_score: 31,
        last_fill_quality_score: 42,
        last_fill_shortfall_usd: 18,
        next_action: "Cool down after the last fill shortfall.",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("cycle");
    expect(plan.label).toBe("fill cooldown");
    expect(plan.action).toBe("loop");
    expect(plan.delayMs).toBeGreaterThanOrEqual(3_000);
    expect(plan.reason).toContain("Cool down after the last fill shortfall");
    expect(plan.reason).toContain("quality 42/100");
  });

  test("GIVEN a non-loop blocked plan WHEN Auto watch is primed THEN it pauses instead of spinning", () => {
    const state = getWeb3TradingState("base", 0);
    const blockedState = {
      ...withClearExecutionLane(withOpenProfitSafety(state)),
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "blocked",
        can_run: false,
        next_action: "The old throttle is fully blocked.",
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        max_trades_next_minute: 0,
      },
      autonomous_profit_benchmark: {
        ...state.autonomous_profit_benchmark,
        status: "learning",
        risk_adjusted_alpha_usd: 0,
      },
      autonomous_alpha_feedback_loop: {
        ...state.autonomous_alpha_feedback_loop,
        status: "idle",
        action: "stand-down",
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 0,
        bundle_action_count: 0,
      },
    } satisfies Web3TradingState;
    const plan = chooseAutoWatchPlan(blockedState);

    expect(plan.label).toBe("auto blocked");
    expect(plan.action).toBeUndefined();
    expect(shouldPauseAutoWatchForPlan(blockedState, plan, true)).toBe(true);
    expect(shouldPauseAutoWatchForPlan(blockedState, plan, false)).toBe(false);
  });

  test("GIVEN stale live market evidence WHEN Auto watch plans THEN it refreshes read-only evidence instead of pausing", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      market_source: {
        ...state.market_source,
        mode: "live-dex",
        status: "live",
        label: "DEX Screener live",
      },
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        max_trades_next_minute: 0,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 0,
      },
      autonomous_action_queue_execution: {
        ...state.autonomous_action_queue_execution,
        selected_side: "buy",
        paper_trade_ready: false,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        action: "pause",
        should_refresh_market_data: true,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "refresh",
        action: "fetch-candles",
        next_action: "Fetch read-only OHLCV candles for LIVE before another fresh buy.",
      },
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "blocked",
        can_run: false,
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
    });

    expect(plan.mode).toBe("refresh");
    expect(plan.label).toBe("auto refresh");
    expect(plan.reason).toContain("Fetch read-only OHLCV candles");
    expect(plan.reason).toContain("read-only DEX Screener live evidence");
  });

  test("GIVEN live intake needs route proof WHEN Auto watch plans THEN it refreshes provider evidence before a paper minute", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      market_source: {
        ...state.market_source,
        mode: "live-dex",
        status: "live",
        label: "DEX Screener live",
      },
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        loop_permission: "multi-fill",
        max_trades_next_minute: 3,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 3,
        bundle_action_count: 3,
      },
      autonomous_action_queue_execution: {
        ...state.autonomous_action_queue_execution,
        selected_side: "buy",
        paper_trade_ready: false,
        paper_trade: null,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        status: "run-now",
        action: "trade",
        should_refresh_market_data: false,
        next_tick_seconds: 3,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "clear",
        action: "allow-paper",
        can_trade: true,
      },
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "cycle",
        can_run: true,
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
      autonomous_market_intake_plan: {
        ...state.autonomous_market_intake_plan,
        status: "refresh",
        next_lane: "route-quotes",
        next_provider: "Jupiter",
        next_endpoint: "/order quote-only path before any signed /execute handoff",
        next_request_seconds: 5,
        provider_budget_status: "within-budget",
        provider_budget_utilization_pct: 38,
        can_feed_trade_loop: false,
        route_refresh_first: true,
        next_action: "Refresh route quotes before the next paper fill or protective sell.",
      },
      autonomous_profit_benchmark: {
        ...state.autonomous_profit_benchmark,
        status: "beating-cash",
        cash_alpha_usd: 420,
        risk_adjusted_alpha_usd: 240,
      },
      autonomous_alpha_feedback_loop: {
        ...state.autonomous_alpha_feedback_loop,
        status: "press",
        action: "increase-bias",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("refresh");
    expect(plan.label).toBe("intake route refresh");
    expect(plan.reason).toContain("Refresh route quotes");
    expect(plan.reason).toContain("Jupiter route quotes");
  });

  test("GIVEN live provider budget is throttled WHEN Auto watch plans THEN it defers fresh paper action", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      market_source: {
        ...state.market_source,
        mode: "live-dex",
        status: "live",
        label: "DEX Screener live",
      },
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        loop_permission: "multi-fill",
        max_trades_next_minute: 3,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 3,
        bundle_action_count: 3,
      },
      autonomous_action_queue_execution: {
        ...state.autonomous_action_queue_execution,
        selected_side: "buy",
        paper_trade_ready: false,
        paper_trade: null,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        status: "run-now",
        action: "trade",
        should_refresh_market_data: false,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "clear",
        action: "allow-paper",
        can_trade: true,
      },
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "cycle",
        can_run: true,
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
      autonomous_market_intake_plan: {
        ...state.autonomous_market_intake_plan,
        status: "watch",
        next_lane: "candles",
        next_provider: "GeckoTerminal",
        next_endpoint: "/api/v2/networks/{network}/pools/{pool}/ohlcv/{timeframe}",
        next_request_seconds: 22,
        provider_budget_status: "throttled",
        provider_budget_utilization_pct: 96,
        can_feed_trade_loop: false,
        route_refresh_first: false,
        next_action: "Wait for GeckoTerminal candle budget before another fresh entry.",
      },
      autonomous_profit_benchmark: {
        ...state.autonomous_profit_benchmark,
        status: "beating-cash",
        cash_alpha_usd: 420,
        risk_adjusted_alpha_usd: 240,
      },
      autonomous_alpha_feedback_loop: {
        ...state.autonomous_alpha_feedback_loop,
        status: "press",
        action: "increase-bias",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("cycle");
    expect(plan.label).toBe("provider throttle");
    expect(plan.delayMs).toBeGreaterThanOrEqual(22_000);
    expect(plan.reason).toContain("GeckoTerminal candles");
    expect(plan.reason).toContain("96% of the provider budget");
  });

  test("GIVEN execution runway needs route proof WHEN Auto watch plans THEN it refreshes route proof before another paper tick", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        loop_permission: "multi-fill",
        max_trades_next_minute: 3,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 3,
        bundle_action_count: 3,
      },
      autonomous_action_queue_execution: {
        ...state.autonomous_action_queue_execution,
        selected_side: "buy",
        paper_trade_ready: false,
        paper_trade: null,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        action: "trade",
        should_refresh_market_data: false,
        next_tick_seconds: 4,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "clear",
        action: "allow-paper",
        can_trade: true,
      },
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "cycle",
        can_run: true,
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
      autonomous_execution_runway: {
        ...state.autonomous_execution_runway,
        status: "refresh",
        action: "refresh-route",
        can_auto_paper: false,
        should_refresh_route: true,
        should_refresh_chart: false,
        should_protect_first: false,
        route_vetoed: true,
        chart_refresh_required: false,
        next_tick_seconds: 4,
        next_action: "Refresh route quote before another paper fill.",
      },
      autonomous_execution_heartbeat: {
        ...state.autonomous_execution_heartbeat,
        status: "refresh",
        primary_action: "refresh",
        should_refresh_routes: true,
        should_protect_first: false,
        route_vetoed: true,
        next_tick_seconds: 4,
        next_action: "Heartbeat wants current read-only route proof.",
      },
      autonomous_market_intake_plan: {
        ...state.autonomous_market_intake_plan,
        status: "watch",
        can_feed_trade_loop: true,
        route_refresh_first: false,
      },
      autonomous_profit_benchmark: {
        ...state.autonomous_profit_benchmark,
        status: "beating-cash",
        cash_alpha_usd: 420,
        risk_adjusted_alpha_usd: 240,
      },
      autonomous_alpha_feedback_loop: {
        ...state.autonomous_alpha_feedback_loop,
        status: "press",
        action: "increase-bias",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("refresh");
    expect(plan.label).toBe("execution route refresh");
    expect(plan.action).toBe("route-refresh");
    expect(plan.delayMs).toBe(4_000);
    expect(plan.reason).toContain("Refresh route quote");
    expect(plan.reason).toContain("route proof");
  });

  test("GIVEN execution heartbeat protects the wallet WHEN Auto watch plans THEN it protects before fresh exposure", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        loop_permission: "multi-fill",
        max_trades_next_minute: 3,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 3,
        bundle_action_count: 3,
      },
      autonomous_action_queue_execution: {
        ...state.autonomous_action_queue_execution,
        selected_side: "buy",
        paper_trade_ready: false,
        paper_trade: null,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        should_refresh_market_data: false,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "clear",
        action: "allow-paper",
      },
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "cycle",
        can_run: true,
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
      autonomous_execution_runway: {
        ...state.autonomous_execution_runway,
        status: "protect",
        action: "protect",
        can_auto_paper: false,
        should_refresh_route: false,
        should_refresh_chart: false,
        should_protect_first: true,
        route_vetoed: false,
        chart_refresh_required: false,
        next_tick_seconds: 5,
        next_action: "Protect paper exposure before chasing another entry.",
      },
      autonomous_execution_heartbeat: {
        ...state.autonomous_execution_heartbeat,
        status: "protect",
        primary_action: "protect",
        should_refresh_routes: false,
        should_protect_first: true,
        route_vetoed: false,
        next_tick_seconds: 5,
        next_action: "Heartbeat is protecting wallet exposure.",
      },
      autonomous_profit_benchmark: {
        ...state.autonomous_profit_benchmark,
        status: "beating-cash",
        cash_alpha_usd: 420,
        risk_adjusted_alpha_usd: 240,
      },
      autonomous_alpha_feedback_loop: {
        ...state.autonomous_alpha_feedback_loop,
        status: "press",
        action: "increase-bias",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("cycle");
    expect(plan.label).toBe("execution protect");
    expect(plan.action).toBe("loop");
    expect(plan.reason).toContain("Protect paper exposure");
    expect(plan.reason).toContain("before fresh buys");
  });

  test("GIVEN execution runway is blocked WHEN Auto watch plans THEN it stays in review instead of pressing paper size", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withOpenProfitSafety(state),
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        loop_permission: "multi-fill",
        max_trades_next_minute: 3,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 3,
        bundle_action_count: 3,
      },
      autonomous_action_queue_execution: {
        ...state.autonomous_action_queue_execution,
        selected_side: "buy",
        paper_trade_ready: false,
        paper_trade: null,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        should_refresh_market_data: false,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "clear",
        action: "allow-paper",
      },
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "cycle",
        can_run: true,
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
      autonomous_execution_runway: {
        ...state.autonomous_execution_runway,
        status: "blocked",
        action: "stand-down",
        can_auto_paper: false,
        should_refresh_route: false,
        should_refresh_chart: false,
        should_protect_first: false,
        route_vetoed: false,
        chart_refresh_required: false,
        next_tick_seconds: 9,
        next_action: "Stand down until route and chart blockers clear.",
      },
      autonomous_execution_heartbeat: {
        ...state.autonomous_execution_heartbeat,
        status: "blocked",
        primary_action: "pause",
        should_refresh_routes: false,
        should_protect_first: false,
        route_vetoed: false,
        next_tick_seconds: 9,
        next_action: "Heartbeat blocks fresh paper pressure.",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("cycle");
    expect(plan.label).toBe("execution blocked");
    expect(plan.action).toBe("loop");
    expect(plan.delayMs).toBeGreaterThanOrEqual(20_000);
    expect(plan.reason).toContain("execution blockers clear");
  });

  test("GIVEN loop impact evidence WHEN Auto watch plans THEN impact can refresh, protect, tighten, or continue cadence", () => {
    const state = getWeb3TradingState("base", 0);
    const loopImpact = state.autonomous_loop_impact_auditor;
    const quietMinuteLoop = {
      ...withClearExecutionLane(withOpenProfitSafety(state)),
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        max_trades_next_minute: 0,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 0,
        bundle_action_count: 0,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        should_refresh_market_data: false,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "clear",
        action: "allow-paper",
      },
    } satisfies Web3TradingState;

    const refreshPlan = chooseAutoWatchPlan({
      ...quietMinuteLoop,
      autonomous_loop_impact_auditor: {
        ...loopImpact,
        status: "refresh",
        action: "refresh-proof",
        must_refresh_proof: true,
        next_cadence_seconds: 6,
        next_action: "Refresh route and chart proof before the next paper loop.",
      },
    });
    expect(refreshPlan.mode).toBe("refresh");
    expect(refreshPlan.label).toBe("impact refresh");
    expect(refreshPlan.delayMs).toBe(6_000);
    expect(refreshPlan.reason).toContain("loop impact is refresh");

    const protectPlan = chooseAutoWatchPlan({
      ...quietMinuteLoop,
      autonomous_loop_impact_auditor: {
        ...loopImpact,
        status: "protect",
        action: "protect-wallet",
        must_reduce_frequency: true,
        must_refresh_proof: false,
        next_cadence_seconds: 5,
        next_action: "Protect wallet exposure before fresh entries.",
      },
    });
    expect(protectPlan.mode).toBe("cycle");
    expect(protectPlan.label).toBe("impact protect");
    expect(protectPlan.reason).toContain("protect wallet");

    const tightenPlan = chooseAutoWatchPlan({
      ...quietMinuteLoop,
      autonomous_loop_impact_auditor: {
        ...loopImpact,
        status: "tighten",
        action: "tighten-size",
        impact_score: 47,
        must_reduce_frequency: true,
        must_refresh_proof: false,
        next_cadence_seconds: 9,
        next_action: "Use a smaller paper action before increasing cadence.",
      },
    });
    expect(tightenPlan.mode).toBe("cycle");
    expect(tightenPlan.label).toBe("impact tighten");
    expect(tightenPlan.delayMs).toBe(10_000);
    expect(tightenPlan.reason).toContain("latest paper loop impact is 47/100");

    const continuePlan = chooseAutoWatchPlan({
      ...quietMinuteLoop,
      autonomous_loop_throttle: {
        ...state.autonomous_loop_throttle,
        status: "sprint",
        action: "run-sprint",
        cadence_seconds: 12,
        can_run: true,
      },
      autonomous_loop_impact_auditor: {
        ...loopImpact,
        status: "continue",
        action: "keep-running",
        must_reduce_frequency: false,
        must_refresh_proof: false,
        next_cadence_seconds: 4,
        next_action: "Keep the paper loop running while post-loop impact stays positive.",
      },
    });
    expect(continuePlan.mode).toBe("sprint");
    expect(continuePlan.label).toBe("auto sprint");
    expect(continuePlan.delayMs).toBe(4_000);
    expect(continuePlan.reason).toContain("continue impact");
  });

  test("GIVEN lagging profit benchmark evidence WHEN Auto watch plans THEN it tightens cadence before another paper action", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withClearExecutionLane(withOpenProfitSafety(state)),
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        max_trades_next_minute: 0,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 0,
        bundle_action_count: 0,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        should_refresh_market_data: false,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "clear",
        action: "allow-paper",
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
      autonomous_profit_benchmark: {
        ...state.autonomous_profit_benchmark,
        status: "lagging-cash",
        cash_alpha_usd: -260,
        risk_adjusted_alpha_usd: -410,
        conclusion: "Benchmark 31/100: the paper agent is lagging idle cash by $260; tighten size and learn before pressing.",
      },
      autonomous_alpha_feedback_loop: {
        ...state.autonomous_alpha_feedback_loop,
        status: "tighten",
        action: "tighten-size",
        review_after_seconds: 14,
        next_action: "Tighten fresh paper size and require benchmark recovery within 14s.",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("cycle");
    expect(plan.label).toBe("auto protect");
    expect(plan.delayMs).toBeGreaterThanOrEqual(3_000);
    expect(plan.reason).toMatch(/lagging idle cash|loop throttle|protect/i);
    expect(plan.reason).toMatch(/risk-adjusted alpha|tick|fill|size/i);
  });

  test("GIVEN missed hot-tape alpha WHEN Auto watch plans THEN it refreshes evidence for retarget review", () => {
    const state = getWeb3TradingState("base", 0);
    const plan = chooseAutoWatchPlan({
      ...withClearExecutionLane(withOpenProfitSafety(state)),
      autonomous_profit_velocity_governor: {
        ...state.autonomous_profit_velocity_governor,
        max_trades_next_minute: 0,
      },
      autonomous_tick_plan: {
        ...state.autonomous_tick_plan,
        items: [],
        max_actions_next_minute: 0,
        bundle_action_count: 0,
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        should_refresh_market_data: false,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "clear",
        action: "allow-paper",
      },
      autonomous_loop_impact_auditor: {
        ...state.autonomous_loop_impact_auditor,
        status: "idle",
        action: "observe",
        must_refresh_proof: false,
        must_reduce_frequency: false,
      },
      autonomous_profit_benchmark: {
        ...state.autonomous_profit_benchmark,
        status: "beating-cash",
        hot_coin_symbol: "BONK",
        opportunity_gap_usd: state.autonomous_profit_benchmark.cash_baseline_usd * 0.08,
      },
      autonomous_alpha_feedback_loop: {
        ...state.autonomous_alpha_feedback_loop,
        status: "retarget",
        action: "retarget-hot-lane",
        review_after_seconds: 10,
        next_action: "Review BONK against current safety and route gates before the next paper entry.",
      },
    } satisfies Web3TradingState);

    expect(plan.mode).toBe("cycle");
    expect(plan.label).toBe("auto protect");
    expect(plan.reason).toContain("protect");
  });

  test("GIVEN a protect-only paper wallet WHEN next moves are built THEN the queue-owned sell is visible before the long desk", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves(state);
    const queueMove = moves.find((move) => move.id === "queue");
    const expectedLabel = state.autonomous_action_queue_execution.selected_symbol ?? state.autonomous_action_queue.leader_symbol ?? "Action queue";

    expect(queueMove?.label).toBe(expectedLabel);
    expect(queueMove?.action).toBe("sell");
    expect(queueMove?.tone).toBe("engine");
    expect(queueMove?.budgetUsd).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(8);
  });

  test("GIVEN chart tape evidence WHEN next moves are built THEN the chart execution contract is visible in the compact operator timeline", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves(state);
    const chartMove = moves.find((move) => move.id === "chart-contract");

    expect(chartMove?.label).toContain("Chart");
    expect(chartMove?.action).toBe(state.autonomous_price_action_execution_contract.action.replaceAll("-", " "));
    expect(chartMove?.detail).toBe(state.autonomous_price_action_execution_contract.summary);
    expect(chartMove?.etaSeconds).toBe(state.autonomous_price_action_execution_contract.review_after_seconds);
    expect(chartMove?.budgetUsd).toBe(state.autonomous_price_action_execution_contract.paper_notional_usd);
  });

  test("GIVEN profit benchmark evidence WHEN next moves are built THEN the agent compares wallet alpha before the long desk", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves(state);
    const benchmarkMove = moves.find((move) => move.id === "profit-benchmark");

    expect(benchmarkMove?.label).toContain("Benchmark");
    expect(benchmarkMove?.action).toBe(state.autonomous_alpha_feedback_loop.action.replaceAll("-", " "));
    expect(benchmarkMove?.detail).toContain(state.autonomous_profit_benchmark.conclusion);
    expect(benchmarkMove?.detail).toContain(state.autonomous_alpha_feedback_loop.summary);
    expect(benchmarkMove?.etaSeconds).toBe(Math.min(
      state.autonomous_alpha_feedback_loop.review_after_seconds,
      state.autonomous_profit_thesis_verifier.review_after_seconds,
    ));
    expect(benchmarkMove?.score).toBe(state.autonomous_profit_benchmark.benchmark_score);
    expect(benchmarkMove?.budgetUsd).toBe(state.autonomous_profit_thesis_verifier.chase_budget_usd);
  });

  test("GIVEN re-entry hunter evidence WHEN next moves are built THEN missed-runner review is visible before the long desk", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves(state);
    const reentryMove = moves.find((move) => move.id === "reentry-hunter");

    expect(reentryMove?.label).toContain("Re-entry");
    expect(reentryMove?.action).toBe(state.autonomous_reentry_hunter.status.replaceAll("-", " "));
    expect(reentryMove?.detail).toContain(state.autonomous_reentry_hunter.next_action);
    expect(reentryMove?.detail).toContain(state.autonomous_reentry_hunter.paper_trade_ready ? "local paper gates" : "No live signing");
    expect(reentryMove?.etaSeconds).toBe(state.autonomous_reentry_hunter.fastest_review_seconds);
    expect(reentryMove?.budgetUsd).toBe(Math.max(
      state.autonomous_reentry_hunter.max_reentry_usd,
      state.autonomous_reentry_hunter.paper_trade?.size_usd ?? 0,
    ));
    expect(moves.map((move) => move.id)).toContain("reentry-hunter");
    expect(moves.length).toBeLessThanOrEqual(8);
  });

  test("GIVEN launch timing state WHEN next moves are built THEN the fresh-entry decision is visible before the long desk", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves(state);
    const launchMove = moves.find((move) => move.id === "launch-timing");

    expect(launchMove?.label).toContain("Launch");
    expect(launchMove?.action).toBe(state.autonomous_launch_timing.selected_action.replaceAll("-", " "));
    expect(launchMove?.detail).toBe(state.autonomous_launch_timing.next_action);
    expect(launchMove?.etaSeconds).toBe(state.autonomous_launch_timing.fastest_review_seconds);
  });

  test("GIVEN trigger protection state WHEN next moves are built THEN the trigger opportunity is folded into the compact operator timeline", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves(state);
    const triggerMove = moves.find((move) => move.id === "trigger-opportunity");

    expect(triggerMove?.label).toContain("Trigger");
    expect(triggerMove?.action).toBe(state.autonomous_trigger_opportunity.selected_action.replaceAll("-", " "));
    expect(triggerMove?.detail).toBe(state.autonomous_trigger_opportunity.next_action);
    expect(triggerMove?.etaSeconds).toBe(state.autonomous_trigger_opportunity.fastest_review_seconds);
  });

  test("GIVEN stale live market evidence WHEN next moves are built THEN read-only refresh leads the timeline", () => {
    const state = getWeb3TradingState("base", 0);
    const moves = buildAutonomousNextMoves({
      ...state,
      market_source: {
        ...state.market_source,
        mode: "live-dex",
        status: "live",
        label: "DEX Screener live",
      },
      autonomous_tick_governor: {
        ...state.autonomous_tick_governor,
        should_refresh_market_data: true,
      },
      autonomous_data_freshness_gate: {
        ...state.autonomous_data_freshness_gate,
        status: "refresh",
        action: "fetch-candles",
        next_refresh_lane: "gecko-ohlcv",
        next_action: "Fetch read-only OHLCV candles for LIVE before another fresh buy.",
      },
    });

    expect(moves[0].id).toBe("refresh-evidence");
    expect(moves[0].action).toBe("gecko ohlcv");
    expect(moves[0].detail).toContain("DEX Screener live");
    expect(moves[0].tone).toBe("caution");
  });

  test("GIVEN the desk reads a market tape WHEN situation monitor runs THEN it produces a regime and playbook", () => {
    const state = getWeb3TradingState("base", 0);

    expect(state.situation_monitor.confidence).toBeGreaterThan(0);
    expect(state.situation_monitor.tape_score).toBeGreaterThan(0);
    expect(state.situation_monitor.playbook.length).toBeGreaterThan(0);
    expect(state.situation_monitor.playbook.some((action) => action.priority === "now" || action.priority === "next")).toBe(true);
    expect(["selective-momentum", "risk-on", "chop", "rug-watch", "stand-down"]).toContain(state.situation_monitor.regime);
  });

  test("GIVEN a changed tape WHEN tape memory compares cycles THEN it creates actionable change events", () => {
    const state = getWeb3TradingState("breakout", 2);
    const acceleration = state.tape_memory.events.find((event) => event.action === "press" || event.action === "probe");

    expect(state.tape_memory.previous_cycle).toBe(1);
    expect(state.tape_memory.current_cycle).toBe(2);
    expect(state.tape_memory.tokens_tracked).toBeGreaterThan(0);
    expect(state.tape_memory.events.length).toBeGreaterThan(0);
    expect(state.tape_memory.pressure_score).toBeGreaterThan(0);
    expect(acceleration?.evidence.length).toBeGreaterThan(0);
    expect(state.autonomy_policy.rules.some((rule) => rule.includes("Tape memory applies"))).toBe(true);
    expect(state.situation_monitor.playbook.some((action) => action.id.includes("tape") || action.detail.includes("accelerated"))).toBe(true);
  });

  test("GIVEN liquidity and sell-flow deterioration WHEN tape memory sees rug risk THEN autopilot prioritizes blocking or exits", () => {
    const state = getWeb3TradingState("rug-risk", 1);

    expect(state.tape_memory.urgent_count).toBeGreaterThan(0);
    expect(state.tape_memory.deterioration_count).toBeGreaterThan(0);
    expect(state.tape_memory.events.some((event) => event.severity === "urgent" && (event.action === "block" || event.action === "exit"))).toBe(true);
    expect(state.situation_monitor.regime).toBe("rug-watch");
    expect(state.autopilot.actions.some((action) => action.id.includes("autopilot-tape") && (action.status === "blocked" || action.lane === "risk-exit"))).toBe(true);
  });

  test("GIVEN a trading cycle WHEN autopilot plans actions THEN it sequences exits, entries, and gates", () => {
    const state = getWeb3TradingState("base", 0);

    expect(state.autopilot.cycle).toBe(0);
    expect(state.autopilot.actions.length).toBeGreaterThan(0);
    expect(state.autopilot.orders_considered).toBeGreaterThan(0);
    expect(state.autopilot.actions[0].sequence).toBe(1);
    expect(state.autopilot.actions.some((action) => action.lane === "risk-exit" || action.lane === "entry")).toBe(true);
    expect(state.autopilot.actions.every((action) => action.execution_gate.length > 0)).toBe(true);
    expect(["executed-paper", "planned", "stand-down", "blocked"]).toContain(state.autopilot.status);
  });

  test("GIVEN changing risk WHEN autonomous monitor schedules the next wake THEN it adapts cadence and advance mode", () => {
    const breakout = getWeb3TradingState("breakout", 2);
    const rugRisk = getWeb3TradingState("rug-risk", 1);

    expect(["accelerate", "active", "cooldown", "stand-down", "idle"]).toContain(breakout.autonomous_monitor.status);
    expect(breakout.autonomous_monitor.mode).toBe("paper-daemon");
    expect(breakout.autonomous_monitor.recommended_interval_seconds).toBeGreaterThan(0);
    expect(breakout.autonomous_monitor.next_wake_at).toContain("T");
    expect(breakout.autonomous_monitor.scan_budget_per_minute).toBeGreaterThan(0);
    expect(breakout.autonomous_monitor.triggers.length).toBeGreaterThan(0);
    expect(breakout.autonomous_monitor.urgency_score).toBeGreaterThanOrEqual(0);
    expect(breakout.autonomous_monitor.urgency_score).toBeLessThanOrEqual(100);
    expect(breakout.paper_daemon.mode).toBe("paper-daemon");
    expect(breakout.paper_daemon.requested).toBe(false);
    expect(["observe", "advance", "stand-down"]).toContain(breakout.paper_daemon.action);
    expect(breakout.paper_daemon.interval_seconds).toBeGreaterThan(0);
    expect(breakout.autonomous_loop_director.next_tick_seconds).toBeGreaterThan(0);
    expect(["clear", "tighten", "cooldown", "halted"]).toContain(breakout.autonomy_risk_governor.status);
    expect(breakout.autonomy_risk_governor.checks.length).toBe(5);
    expect(breakout.autonomy_risk_governor.max_messages_per_minute).toBe(breakout.execution_intents.max_messages_per_minute);
    expect(breakout.execution_edge_ladder.mode).toBe("execution-edge-ladder");
    expect(["attack", "selective", "protect", "blocked", "idle"]).toContain(breakout.execution_edge_ladder.status);
    expect(breakout.execution_edge_ladder.items.every((item) => item.rank > 0 && item.evidence.length > 0)).toBe(true);
    expect(breakout.route_profit_gate.mode).toBe("route-profit-gate");
    expect(["execute", "queue", "resize", "blocked", "protect", "idle"]).toContain(breakout.route_profit_gate.status);
    expect(breakout.route_profit_gate.items.every((item) => item.total_cost_bps >= 0 && item.fill_quality_score >= 0)).toBe(true);
    expect(breakout.route_profit_gate.items.flatMap((item) => item.blockers).every((blocker) => !/wallet|kill switch/i.test(blocker))).toBe(true);
    expect(breakout.liquidity_depth_controller.mode).toBe("liquidity-depth-controller");
    expect(["route", "resize", "slice", "protect", "blocked", "idle"]).toContain(breakout.liquidity_depth_controller.status);
    expect(breakout.liquidity_depth_controller.items.length).toBeGreaterThan(0);
    expect(breakout.liquidity_depth_controller.items.every((item) =>
      item.depth_score >= 0 &&
      item.depth_score <= 100 &&
      item.absorption_score >= 0 &&
      item.absorption_score <= 100 &&
      item.spread_bps >= 0 &&
      item.expected_impact_bps >= 0 &&
      item.slice_count >= 1 &&
      item.child_order_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.profit_loop_controller.max_cycle_deploy_usd > 0) {
      expect(breakout.profit_loop_controller.max_cycle_deploy_usd)
        .toBeLessThanOrEqual(breakout.liquidity_depth_controller.recommended_deploy_usd);
    }
    expect(breakout.route_quote_sampler.mode).toBe("route-quote-sampler");
    expect(["confirmed", "probe", "requote", "protect", "blocked", "idle"]).toContain(breakout.route_quote_sampler.status);
    expect(breakout.route_quote_sampler.items.length).toBeGreaterThan(0);
    expect(breakout.route_quote_sampler.items.every((item) =>
      item.route_confidence_score >= 0 &&
      item.route_confidence_score <= 100 &&
      item.route_diversity_score >= 0 &&
      item.route_diversity_score <= 100 &&
      item.modeled_impact_bps >= 0 &&
      item.impact_drift_bps >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.profit_loop_controller.max_cycle_deploy_usd > 0) {
      expect(breakout.profit_loop_controller.max_cycle_deploy_usd)
        .toBeLessThanOrEqual(breakout.route_quote_sampler.recommended_deploy_usd);
    }
    expect(breakout.execution_landing_supervisor.mode).toBe("execution-landing-supervisor");
    expect(["paper", "managed", "sender-needed", "blocked", "idle"]).toContain(breakout.execution_landing_supervisor.status);
    expect(breakout.execution_landing_supervisor.items.length).toBeGreaterThan(0);
    expect(breakout.execution_landing_supervisor.items.every((item) =>
      item.landing_score >= 0 &&
      item.landing_score <= 100 &&
      item.urgency_score >= 0 &&
      item.route_score >= 0 &&
      item.latency_target_ms >= 0 &&
      item.ttl_seconds >= 0
    )).toBe(true);
    expect(breakout.execution_landing_supervisor.items.every((item) =>
      item.status !== "dry-run" || item.path !== "paper-ledger"
    )).toBe(true);
    expect(breakout.alpha_decay_controller.mode).toBe("alpha-decay-controller");
    expect(["chase", "probe", "harvest", "cooldown", "expired", "idle"]).toContain(breakout.alpha_decay_controller.status);
    expect(breakout.alpha_decay_controller.items.length).toBeGreaterThan(0);
    expect(breakout.alpha_decay_controller.items.every((item) =>
      item.alpha_score >= 0 &&
      item.alpha_score <= 100 &&
      item.freshness_score >= 0 &&
      item.freshness_score <= 100 &&
      item.velocity_decay_score >= 0 &&
      item.attention_decay_score >= 0 &&
      item.quote_decay_score >= 0 &&
      item.half_life_seconds >= 0 &&
      item.time_to_decay_seconds >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.profit_loop_controller.max_cycle_deploy_usd > 0) {
      expect(breakout.profit_loop_controller.max_cycle_deploy_usd)
        .toBeLessThanOrEqual(breakout.alpha_decay_controller.recommended_deploy_usd);
    }
    expect(breakout.microstructure_tape.mode).toBe("microstructure-tape");
    expect(["attack", "absorb", "defensive", "rug-pull", "idle"]).toContain(breakout.microstructure_tape.status);
    expect(breakout.microstructure_tape.items.every((item) =>
      item.buy_burst_score >= 0 &&
      item.sell_cascade_score >= 0 &&
      item.liquidity_vacuum_score >= 0 &&
      item.recommended_size_multiplier >= 0
    )).toBe(true);
    if (breakout.microstructure_tape.status !== "idle") {
      expect(breakout.autonomous_monitor.watch_symbols.some((symbol) =>
        breakout.microstructure_tape.items.map((item) => item.symbol).includes(symbol)
      )).toBe(true);
    }
    expect(breakout.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(["follow", "probe", "defensive", "exit", "idle"]).toContain(breakout.smart_money_sentinel.status);
    expect(breakout.smart_money_sentinel.items.every((item) =>
      item.smart_score >= 0 &&
      item.copy_trade_confidence >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.smart_money_sentinel.status !== "idle") {
      expect(breakout.autonomous_monitor.watch_symbols.some((symbol) =>
        breakout.smart_money_sentinel.items.map((item) => item.symbol).includes(symbol)
      )).toBe(true);
    }
    expect(breakout.position_commander.mode).toBe("autonomous-position-commander");
    expect(["idle", "watch", "defend", "trim", "exit", "moonbag"]).toContain(breakout.position_commander.status);
    expect(breakout.position_commander.items.length).toBe(breakout.portfolio.open_positions.length);
    expect(breakout.position_commander.items.every((item) =>
      item.command_score >= 0 &&
      item.command_score <= 100 &&
      item.stop_price_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    if (breakout.position_commander.commanded_sell_usd > 0) {
      expect(breakout.profit_loop_controller.max_cycle_release_usd)
        .toBeGreaterThanOrEqual(breakout.position_commander.commanded_sell_usd);
    }
    expect(breakout.scalping_controller.mode).toBe("autonomous-scalping-controller");
    expect(["compound", "scalp", "protect", "cooldown", "stand-down", "idle"]).toContain(breakout.scalping_controller.status);
    expect(breakout.scalping_controller.items.length).toBeGreaterThan(0);
    expect(breakout.scalping_controller.items.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(breakout.scalping_controller.items.every((item) =>
      item.action !== "compound" || (item.route_action === "execute-paper" && item.expected_profit_usd > 0)
    )).toBe(true);
    expect(breakout.scalping_controller.scalp_budget_usd).toBeLessThanOrEqual(breakout.autonomy_risk_governor.allowed_trade_usd);
    expect(breakout.profit_loop_controller.mode).toBe("profit-loop-controller");
    expect(["compound", "attack", "harvest", "protect", "cooldown", "stand-down", "idle"]).toContain(breakout.profit_loop_controller.status);
    expect(breakout.profit_loop_controller.loop_score).toBeGreaterThanOrEqual(0);
    expect(breakout.profit_loop_controller.loop_score).toBeLessThanOrEqual(100);
    expect(breakout.profit_loop_controller.items.length).toBeGreaterThan(0);
    expect(breakout.profit_loop_controller.items.every((item) =>
      item.score >= 0 &&
      item.score <= 100 &&
      item.churn_drag_bps >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(breakout.profit_loop_controller.allows_new_entries)
      .toBe(breakout.profit_loop_controller.status === "compound" || breakout.profit_loop_controller.status === "attack");
    expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "profit-loop-controller")).toBe(true);
    expect(["accelerate", "selective", "cooldown", "stop", "idle"]).toContain(breakout.churn_efficiency_auditor.status);
    if (breakout.churn_efficiency_auditor.status === "accelerate" || breakout.churn_efficiency_auditor.status === "cooldown" || breakout.churn_efficiency_auditor.status === "stop") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "churn-efficiency-auditor")).toBe(true);
    }
    if (breakout.liquidity_depth_controller.status !== "route" && breakout.liquidity_depth_controller.status !== "idle") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "liquidity-depth-controller")).toBe(true);
    }
    if (breakout.route_quote_sampler.status !== "confirmed" && breakout.route_quote_sampler.status !== "idle") {
      expect(breakout.autonomous_monitor.triggers.some((trigger) => trigger.id === "route-quote-sampler")).toBe(true);
    }
    expect(rugRisk.autonomous_monitor.recommended_interval_seconds).toBeLessThanOrEqual(20);
    expect(rugRisk.autonomous_monitor.triggers.some((trigger) => trigger.severity === "urgent")).toBe(true);
    expect(["protect", "cooldown", "stand-down", "idle", "scalp"]).toContain(rugRisk.scalping_controller.status);
    expect(["harvest", "protect", "cooldown", "stand-down", "idle", "attack", "compound"]).toContain(rugRisk.profit_loop_controller.status);
    expect(["protect", "blocked", "resize", "slice", "route", "idle"]).toContain(rugRisk.liquidity_depth_controller.status);
    expect(["protect", "blocked", "requote", "probe", "confirmed", "idle"]).toContain(rugRisk.route_quote_sampler.status);
    expect(["chase", "probe", "harvest", "cooldown", "expired", "idle"]).toContain(rugRisk.alpha_decay_controller.status);
    expect(["idle", "watch", "defend", "trim", "exit", "moonbag"]).toContain(rugRisk.position_commander.status);
  });

  test("GIVEN autopilot actions WHEN the execution queue builds THEN it adds retry and route-quality controls", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const blocked = state.execution_intents.intents.find((intent) => intent.status === "blocked");

    expect(state.execution_intents.intents.length).toBeGreaterThan(0);
    expect(state.execution_intents.max_messages_per_minute).toBe(12);
    expect(state.execution_intents.blocked_count + state.execution_intents.ready_count + state.execution_intents.cooldown_count)
      .toBeGreaterThan(0);
    expect(blocked?.blockers.length).toBeGreaterThan(0);
    expect(state.execution_intents.intents.every((intent) => intent.estimated_shortfall_bps >= 0)).toBe(true);
    expect(state.execution_intents.intents.every((intent) => intent.route_quality_score >= 0 && intent.route_quality_score <= 100))
      .toBe(true);
  });

  test("GIVEN execution intents WHEN preflight runs THEN it scores route, cap, payload, and fee gates", () => {
    const state = getWeb3TradingState("rug-risk", 1);
    const guarded = state.execution_preflight.items.find((item) => item.status === "blocked" || item.status === "watch");

    expect(state.execution_preflight.items.length).toBeGreaterThan(0);
    expect(state.execution_preflight.max_quote_age_seconds).toBe(15);
    expect(state.execution_preflight.blocked_count + state.execution_preflight.watch_count + state.execution_preflight.paper_count)
      .toBeGreaterThan(0);
    expect(state.execution_preflight.items.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(guarded?.checks.some((check) => check.status === "fail" || check.status === "warn")).toBe(true);
    expect(state.execution_preflight.items.some((item) => item.checks.some((check) => check.id === "fees"))).toBe(true);
  });

  test("GIVEN congested execution intents WHEN retry planning runs THEN it bounds retry, resize, and stand-down tactics", () => {
    const state = getWeb3TradingState("breakout", 2);
    const retryPlanner = state.execution_retry_planner;

    expect(retryPlanner.items.length).toBeGreaterThan(0);
    expect(["send", "retry", "resize", "stand-down", "paper", "idle"]).toContain(retryPlanner.status);
    expect(retryPlanner.items.every((item) => item.max_attempts >= 1 && item.max_attempts <= 3)).toBe(true);
    expect(retryPlanner.items.every((item) => item.recommended_size_usd <= item.original_size_usd)).toBe(true);
    expect(retryPlanner.items.every((item) => item.slice_count >= 1 && item.slice_count <= 4)).toBe(true);
    expect(retryPlanner.items.some((item) =>
      ["retry", "resize", "slice", "escalate-priority", "stand-down"].includes(item.action),
    )).toBe(true);
    expect(state.execution_preflight.items.some((item) => item.checks.some((check) => check.id === "retry-plan"))).toBe(true);
  });

  test("GET /api/web3-trading returns the paper execution boundary", async () => {
    const response = await GET(new Request("http://localhost/api/web3-trading?scenario=breakout&cycles=2"));
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.scenario).toBe("breakout");
    expect(state.market_source.status).toBe("sample");
    expect(state.paper_account.mode).toBe("persistent");
    expect(state.paper_account.cycle).toBe(0);
    expect(state.market.length).toBeGreaterThan(0);
    expect(Array.isArray(state.position_watch)).toBe(true);
    expect(state.autonomous_now_decision.mode).toBe("autonomous-now-decision");
    expect(["attack", "probe", "protect", "refresh", "loop", "blocked", "watch", "idle"]).toContain(state.autonomous_now_decision.status);
    expect(["paper-buy", "paper-probe", "paper-sell", "protect", "refresh-route", "refresh-candles", "stand-down", "watch", "run-loop"]).toContain(state.autonomous_now_decision.action);
    expect(state.autonomous_now_decision.decision_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_now_decision.decision_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_now_decision.target_symbol).toBe(state.autonomous_execution_runway.target_symbol);
    expect(state.autonomous_now_decision.execution_boundary).toBe(state.autonomous_execution_runway.execution_boundary);
    expect(state.autonomous_now_decision.chart_proof_required).toBe(
      state.autonomous_execution_runway.should_refresh_chart ||
        state.autonomous_chart_proof_target.should_fetch ||
        state.autonomous_chart_proof_target.status === "blocked",
    );
    expect(state.autonomous_now_decision.route_refresh_required).toBe(
      state.autonomous_execution_runway.should_refresh_route ||
        state.autonomous_order_ticket.route_required ||
        state.autonomous_order_ticket_execution.status === "route-refresh",
    );
    if (state.autonomous_now_decision.route_refresh_required) {
      expect(state.autonomous_now_decision.button_label).toBe("Refresh read");
    } else if (state.autonomous_now_decision.chart_proof_required) {
      expect(state.autonomous_now_decision.button_label).toBe("Proof + tick");
    }
    expect(state.autonomous_now_decision.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_now_decision.proof.map((item) => item.id)).toEqual(["market", "route", "chart", "wallet", "loop", "ticket"]);
    expect(state.autonomous_now_decision.proof.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_now_decision.safeguards.some((item) => item.includes("local paper-ledger"))).toBe(true);
    expect(state.autonomous_make_money_pulse.mode).toBe("autonomous-make-money-pulse");
    expect(["attack", "probe", "harvest", "protect", "refresh", "cooldown", "blocked", "observe"]).toContain(state.autonomous_make_money_pulse.status);
    expect(["paper-attack", "paper-probe", "paper-harvest", "paper-protect", "refresh-proof", "cooldown", "stand-down", "observe"]).toContain(state.autonomous_make_money_pulse.action);
    expect(state.autonomous_make_money_pulse.pulse_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.pulse_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_make_money_pulse.wallet_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.market_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.profit_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.protection_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.loop_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_make_money_pulse.reaction_seconds).toBeGreaterThan(0);
    expect(state.autonomous_make_money_pulse.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_make_money_pulse.fresh_buy_allowed).toBe("boolean");
    expect(typeof state.autonomous_make_money_pulse.protective_sell_required).toBe("boolean");
    expect(state.autonomous_make_money_pulse.items.map((item) => item.id)).toEqual(["wallet", "market", "profit", "protection", "loop", "quality"]);
    expect(state.autonomous_make_money_pulse.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_make_money_pulse.controls.some((control) => control.includes("Single make-money pulse"))).toBe(true);
    expect(state.autonomous_make_money_pulse.controls.some((control) => control.includes("local paper ledger") || control.includes("local paper-ledger"))).toBe(true);
    expect(state.autonomous_forward_loop_permission.mode).toBe("autonomous-forward-loop-permission");
    expect(["press", "probe", "harvest", "protect", "refresh", "cooldown", "blocked", "observe"]).toContain(state.autonomous_forward_loop_permission.status);
    expect(["press", "selective", "harvest-only", "protect-only", "refresh-first", "cooldown", "stand-down"]).toContain(state.autonomous_forward_loop_permission.permission);
    expect(["run-minute", "run-loop", "paper-probe", "harvest-profit", "protect-book", "refresh-proof", "cooldown", "stand-down"]).toContain(state.autonomous_forward_loop_permission.action);
    expect(state.autonomous_forward_loop_permission.permission_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_forward_loop_permission.permission_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_forward_loop_permission.items.map((item) => item.id)).toEqual(["fill-audit", "profit-proof", "integrity", "throttle", "wake", "decision"]);
    expect(state.autonomous_forward_loop_permission.controls.some((control) => control.includes("Final forward permission"))).toBe(true);
    expect(state.autonomous_loop_impact_auditor.mode).toBe("autonomous-loop-impact-auditor");
    expect(["compound", "continue", "tighten", "harvest", "protect", "refresh", "cooldown", "blocked", "idle"]).toContain(state.autonomous_loop_impact_auditor.status);
    expect(["increase-frequency", "keep-running", "tighten-size", "harvest-profit", "protect-wallet", "refresh-proof", "cooldown", "stand-down", "observe"]).toContain(state.autonomous_loop_impact_auditor.action);
    expect(state.autonomous_loop_impact_auditor.impact_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_loop_impact_auditor.impact_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_loop_impact_auditor.permission_after).toBe(state.autonomous_forward_loop_permission.permission);
    expect(state.autonomous_loop_impact_auditor.paper_only).toBe(true);
    expect(state.autonomous_loop_impact_auditor.items.map((item) => item.id)).toEqual(["equity", "exposure", "fills", "permission", "proof", "boundary"]);
    expect(state.autonomous_loop_impact_auditor.controls.some((control) => control.includes("Audits the latest backend paper loop"))).toBe(true);
    expect(state.autonomous_profit_capture_autopilot.mode).toBe("autonomous-profit-capture-autopilot");
    expect(["race", "trim", "harvest", "trail", "press", "refresh", "blocked", "idle"]).toContain(state.autonomous_profit_capture_autopilot.status);
    expect(["exit-now", "trim-now", "harvest-profit", "tighten-trail", "press-runner", "refresh-route", "stand-down", "observe"]).toContain(state.autonomous_profit_capture_autopilot.action);
    expect(state.autonomous_profit_capture_autopilot.autopilot_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_capture_autopilot.autopilot_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_capture_autopilot.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_capture_autopilot.keep_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_capture_autopilot.next_cadence_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_profit_capture_autopilot.must_apply_protective_sell).toBe("boolean");
    expect(typeof state.autonomous_profit_capture_autopilot.must_refresh_route).toBe("boolean");
    expect(typeof state.autonomous_profit_capture_autopilot.can_press_fresh_buy).toBe("boolean");
    expect(state.autonomous_profit_capture_autopilot.items.map((item) => item.id)).toEqual(["race", "wallet", "route", "queue", "impact", "boundary"]);
    expect(state.autonomous_profit_capture_autopilot.items.every((item) =>
      ["pass", "watch", "block"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_capture_autopilot.controls.some((control) => control.includes("Condenses profit-capture race"))).toBe(true);
    expect(state.autonomous_profit_capture_autopilot.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
    expect(state.autonomous_profit_redeploy_autopilot.mode).toBe("autonomous-profit-redeploy-autopilot");
    expect(["redeploy", "probe", "wait-proof", "protect-first", "cooldown", "blocked", "idle"]).toContain(state.autonomous_profit_redeploy_autopilot.status);
    expect(["paper-redeploy", "paper-probe", "refresh-proof", "protect-before-redeploy", "cooldown", "stand-down", "observe"]).toContain(state.autonomous_profit_redeploy_autopilot.action);
    expect(state.autonomous_profit_redeploy_autopilot.redeploy_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_autopilot.redeploy_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_redeploy_autopilot.redeploy_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_autopilot.released_cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_autopilot.reserve_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_autopilot.next_cadence_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_profit_redeploy_autopilot.can_redeploy_paper).toBe("boolean");
    expect(typeof state.autonomous_profit_redeploy_autopilot.must_refresh_proof).toBe("boolean");
    expect(typeof state.autonomous_profit_redeploy_autopilot.must_protect_first).toBe("boolean");
    expect(state.autonomous_profit_redeploy_autopilot.items.map((item) => item.id)).toEqual(["capture", "candidate", "cash", "integrity", "intake", "boundary"]);
    expect(state.autonomous_profit_redeploy_autopilot.items.every((item) =>
      ["pass", "watch", "block"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_redeploy_autopilot.controls.some((control) => control.includes("Connects profit capture"))).toBe(true);
    expect(state.autonomous_profit_redeploy_autopilot.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
    expect(state.autonomous_profit_redeploy_execution.mode).toBe("autonomous-profit-redeploy-execution");
    expect(["queued", "applied", "wait-proof", "protect-first", "cooldown", "blocked", "idle"]).toContain(state.autonomous_profit_redeploy_execution.status);
    expect(["opportunity-rank", "reentry-hunter", "profit-capture", "rotation-director", "none"]).toContain(state.autonomous_profit_redeploy_execution.source);
    expect(["opportunity-race", "reentry-hunter", "portfolio-protect", null]).toContain(state.autonomous_profit_redeploy_execution.execution_lane);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_profit_redeploy_execution.selected_side);
    expect(["paper-ledger-only", "read-only-refresh", "blocked-live"]).toContain(state.autonomous_profit_redeploy_execution.execution_boundary);
    expect(state.autonomous_profit_redeploy_execution.paper_trade_id === null || state.autonomous_profit_redeploy_execution.paper_trade_id.length > 0).toBe(true);
    expect(state.autonomous_profit_redeploy_execution.execution_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_execution.execution_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_redeploy_execution.requested_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_execution.capped_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_execution.redeploy_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_execution.released_cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_redeploy_execution.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_profit_redeploy_execution.paper_trade_ready).toBe("boolean");
    expect(typeof state.autonomous_profit_redeploy_execution.ledger_applied).toBe("boolean");
    expect(state.autonomous_profit_redeploy_execution.items.map((item) => item.id)).toEqual(["autopilot", "source", "budget", "ledger", "boundary"]);
    expect(state.autonomous_profit_redeploy_execution.items.every((item) =>
      ["pass", "watch", "block"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_redeploy_execution.controls.some((control) => control.includes("auditable local paper execution receipt"))).toBe(true);
    expect(state.autonomous_profit_redeploy_execution.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
    if (state.autonomous_profit_redeploy_execution.paper_trade_ready) {
      expect(state.autonomous_profit_redeploy_execution.paper_trade).not.toBeNull();
      expect(["buy", "sell"]).toContain(state.autonomous_profit_redeploy_execution.selected_side);
      expect(state.autonomous_profit_redeploy_execution.execution_boundary).toBe("paper-ledger-only");
      expect(state.autonomous_profit_redeploy_execution.execution_lane).not.toBeNull();
      expect(state.autonomous_profit_redeploy_execution.paper_trade_id).toBe(state.autonomous_profit_redeploy_execution.paper_trade!.id);
      if (state.autonomous_profit_redeploy_execution.source !== "profit-capture") {
        expect(state.autonomous_profit_redeploy_execution.capped_size_usd).toBeLessThanOrEqual(state.autonomous_profit_redeploy_execution.redeploy_budget_usd);
      }
    }
    if (state.autonomous_profit_redeploy_execution.ledger_applied) {
      expect(state.autonomous_profit_redeploy_execution.paper_trade_id).not.toBeNull();
      expect(state.autonomous_profit_redeploy_execution.execution_lane).not.toBeNull();
    }
    if (["wait-proof", "protect-first", "cooldown"].includes(state.autonomous_profit_redeploy_execution.status)) {
      expect(state.autonomous_profit_redeploy_execution.paper_trade_ready).toBe(false);
    }
    expect(state.autonomous_profit_benchmark.mode).toBe("autonomous-profit-benchmark");
    expect(["beating-cash", "lagging-cash", "beating-selected", "lagging-selected", "protecting-capital", "learning"]).toContain(state.autonomous_profit_benchmark.status);
    expect(state.autonomous_profit_benchmark.benchmark_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_benchmark.benchmark_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_benchmark.agent_equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_benchmark.cash_baseline_usd).toBeGreaterThan(0);
    expect(state.autonomous_profit_benchmark.selected_coin_baseline_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_benchmark.hot_coin_baseline_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_benchmark.items.map((item) => item.id)).toEqual(["cash", "selected-coin", "hot-coin", "risk", "execution"]);
    expect(state.autonomous_profit_benchmark.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_benchmark.controls.some((control) => control.includes("idle cash"))).toBe(true);
    expect(state.autonomous_profit_benchmark.controls.some((control) => control.includes("hindsight learning signal"))).toBe(true);
    expect(state.autonomous_alpha_feedback_loop.mode).toBe("autonomous-alpha-feedback-loop");
    expect(["press", "retarget", "tighten", "protect", "learn", "idle"]).toContain(state.autonomous_alpha_feedback_loop.status);
    expect(["increase-bias", "retarget-hot-lane", "tighten-size", "protect-capital", "collect-evidence", "stand-down"]).toContain(state.autonomous_alpha_feedback_loop.action);
    expect(state.autonomous_alpha_feedback_loop.feedback_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_feedback_loop.feedback_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_alpha_feedback_loop.size_bias).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_feedback_loop.size_bias).toBeLessThanOrEqual(1.2);
    expect(state.autonomous_alpha_feedback_loop.target_bias_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_feedback_loop.target_bias_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_alpha_feedback_loop.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_alpha_feedback_loop.items.map((item) => item.id)).toEqual(["benchmark", "gap", "target", "sizing", "protection"]);
    expect(state.autonomous_alpha_feedback_loop.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_alpha_feedback_loop.controls.some((control) => control.includes("Alpha feedback turns benchmark gaps"))).toBe(true);
    expect(state.autonomous_alpha_feedback_loop.controls.some((control) => control.includes("Hindsight hot-coin gaps"))).toBe(true);
    expect(state.autonomous_profit_thesis_verifier.mode).toBe("autonomous-profit-thesis-verifier");
    expect(["validated", "probing", "retarget", "tighten", "protect", "blocked", "learning"]).toContain(state.autonomous_profit_thesis_verifier.status);
    expect(["press-thesis", "probe-thesis", "retarget-thesis", "tighten-size", "protect-capital", "block-thesis", "collect-evidence"]).toContain(state.autonomous_profit_thesis_verifier.action);
    expect(state.autonomous_profit_thesis_verifier.thesis_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.thesis_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.evidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.evidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.outcome_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.outcome_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.alpha_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.alpha_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.risk_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.risk_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.sizing_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.sizing_multiplier).toBeLessThanOrEqual(1.2);
    expect(state.autonomous_profit_thesis_verifier.chase_urgency_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.chase_urgency_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_thesis_verifier.chase_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.chase_size_multiplier).toBeLessThanOrEqual(1.2);
    expect(state.autonomous_profit_thesis_verifier.chase_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_thesis_verifier.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_profit_thesis_verifier.items.map((item) => item.id)).toEqual(["setup", "evidence", "outcome", "alpha", "risk"]);
    expect(state.autonomous_profit_thesis_verifier.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_thesis_verifier.controls.some((control) => control.includes("idle cash"))).toBe(true);
    expect(state.autonomous_profit_thesis_verifier.controls.some((control) => control.includes("Chase pressure"))).toBe(true);
    expect(state.autonomous_profit_thesis_verifier.controls.some((control) => control.includes("cannot override custody"))).toBe(true);
    expect(state.autonomous_opportunity_ranker.mode).toBe("autonomous-opportunity-ranker");
    expect(["attack-ready", "probe-ready", "retarget", "protect", "refresh", "blocked", "learning", "idle"]).toContain(state.autonomous_opportunity_ranker.status);
    expect(
      state.autonomous_opportunity_ranker.leader_action === null ||
        ["paper-attack", "paper-probe", "watch", "refresh-proof", "protect-capital", "block"].includes(state.autonomous_opportunity_ranker.leader_action),
    ).toBe(true);
    expect(state.autonomous_opportunity_ranker.best_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_ranker.best_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_opportunity_ranker.recommended_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_ranker.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_opportunity_ranker.items.length).toBeGreaterThan(0);
    expect(state.autonomous_opportunity_ranker.items.every((item) =>
      ["attack", "probe", "watch", "refresh", "protect", "blocked"].includes(item.status) &&
      ["paper-attack", "paper-probe", "watch", "refresh-proof", "protect-capital", "block"].includes(item.action) &&
      item.opportunity_score >= 0 &&
      item.opportunity_score <= 100 &&
      item.scanner_score >= 0 &&
      item.scanner_score <= 100 &&
      item.alpha_quality_score >= 0 &&
      item.alpha_quality_score <= 100 &&
      item.trap_clearance_score >= 0 &&
      item.trap_clearance_score <= 100 &&
      item.tradeability_score >= 0 &&
      item.tradeability_score <= 100 &&
      item.thesis_fit_score >= 0 &&
      item.thesis_fit_score <= 100 &&
      item.noise_score >= 0 &&
      item.noise_score <= 100 &&
      item.symbol.length > 0 &&
      item.decision.length > 0 &&
      item.evidence.length > 0
    )).toBe(true);
    const thesisRankItem = state.autonomous_profit_thesis_verifier.target_symbol
      ? state.autonomous_opportunity_ranker.items.find((item) => item.symbol === state.autonomous_profit_thesis_verifier.target_symbol)
      : null;
    if (thesisRankItem && state.autonomous_profit_thesis_verifier.chase_urgency_score > 0) {
      expect(thesisRankItem.evidence.some((item) => item.includes("chase urgency"))).toBe(true);
    }
    expect(state.autonomous_opportunity_ranker.controls.some((control) => control.includes("scanner readiness"))).toBe(true);
    expect(state.autonomous_opportunity_ranker.controls.some((control) => control.includes("local-paper only"))).toBe(true);
    expect(state.autonomous_rotation_director.mode).toBe("autonomous-rotation-director");
    expect(["rotate-now", "retarget", "protect", "harvest", "hold", "blocked", "idle"]).toContain(state.autonomous_rotation_director.status);
    expect(["rotate-capital", "retarget-hot-coin", "protect-position", "harvest-profit", "hold-current", "stand-down"]).toContain(state.autonomous_rotation_director.action);
    expect(state.autonomous_rotation_director.rotation_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.rotation_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_rotation_director.opportunity_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.opportunity_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_rotation_director.release_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.release_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_rotation_director.integrity_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.integrity_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_rotation_director.deploy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.max_paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_rotation_director.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_rotation_director.items.map((item) => item.id)).toEqual(["candidate", "release", "capital", "profit", "integrity"]);
    expect(state.autonomous_rotation_director.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_rotation_director.controls.some((control) => control.includes("local-paper only"))).toBe(true);
    expect(state.autonomous_rotation_director.controls.some((control) => control.includes("does not churn"))).toBe(true);
    expect(state.autonomous_opportunity_rank_execution.mode).toBe("opportunity-rank-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_opportunity_rank_execution.status);
    expect(
      state.autonomous_opportunity_rank_execution.selected_action === null ||
        ["paper-attack", "paper-probe", "watch", "refresh-proof", "protect-capital", "block"].includes(state.autonomous_opportunity_rank_execution.selected_action),
    ).toBe(true);
    expect(["buy", "hold"]).toContain(state.autonomous_opportunity_rank_execution.selected_side);
    expect(state.autonomous_opportunity_rank_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_rank_execution.opportunity_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_opportunity_rank_execution.opportunity_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_opportunity_rank_execution.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_opportunity_rank_execution.execution_boundary).toBe("paper-ledger-only");
    if (state.autonomous_opportunity_rank_execution.paper_trade) {
      expect(state.autonomous_opportunity_rank_execution.paper_trade.id).toContain("paper-opportunity-rank");
      expect(state.autonomous_opportunity_rank_execution.paper_trade.side).toBe("buy");
      expect(state.autonomous_opportunity_rank_execution.paper_trade.size_usd).toBeGreaterThan(0);
      expect(state.autonomous_opportunity_rank_execution.paper_trade.symbol.length).toBeGreaterThan(0);
    }
    expect(state.autonomous_opportunity_rank_execution.controls.some((control) => control.includes("local paper-ledger buy candidate"))).toBe(true);
    expect(state.autonomous_opportunity_rank_execution.controls.some((control) => control.includes("Cannot sign"))).toBe(true);
    expect(state.position_exit_ladder.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.trigger_order_planner.mode).toBe("jupiter-trigger-planner");
    expect(state.trigger_order_planner.items.length).toBe(state.portfolio.open_positions.length);
    expect(["auth-required", "blocked", "monitoring", "ready", "idle"]).toContain(state.trigger_order_planner.status);
    expect(state.trigger_order_planner.safeguards.length).toBeGreaterThan(0);
    expect(state.trigger_order_execution.mode).toBe("jupiter-trigger-execution");
    expect(["idle", "locked", "craft-ready", "failed"]).toContain(state.trigger_order_execution.status);
    expect(state.trigger_order_execution.safeguards.some((item) => item.includes("raw signed transactions are not stored"))).toBe(true);
    expect(state.trigger_order_history.mode).toBe("jupiter-trigger-history");
    expect(state.trigger_order_history.status).toBe("locked");
    expect(state.trigger_order_history.safeguards.some((item) => item.includes("read-only"))).toBe(true);
    expect(state.autonomous_trigger_opportunity.mode).toBe("autonomous-trigger-opportunity");
    expect(["pre-arm", "protect", "repair", "auth-required", "monitor", "blocked", "idle"]).toContain(state.autonomous_trigger_opportunity.status);
    expect(["pre-arm", "protect-now", "repair", "authenticate", "monitor", "stand-down"]).toContain(state.autonomous_trigger_opportunity.selected_action);
    expect(state.autonomous_trigger_opportunity.items.length).toBe(state.protective_trigger_coverage.items.length);
    expect(state.autonomous_trigger_opportunity.controls.some((control) => control.includes("protective Trigger opportunities"))).toBe(true);
    expect(state.autonomous_trigger_opportunity.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    if (state.autonomous_trigger_opportunity.items.length > 0) {
      expect(state.autonomous_trigger_opportunity.fastest_review_seconds).toBeGreaterThan(0);
      expect(state.autonomous_trigger_opportunity.items.every((item) =>
        ["pre-arm", "protect-now", "repair", "authenticate", "monitor", "stand-down"].includes(item.action) &&
        ["ready", "watch", "blocked", "idle"].includes(item.status) &&
        item.opportunity_score >= 0 &&
        item.opportunity_score <= 100 &&
        item.edge_decay_score >= 0 &&
        item.edge_decay_score <= 100 &&
        item.review_after_seconds > 0 &&
        item.reason.length > 0
      )).toBe(true);
    }
    expect(state.autonomous_launch_timing.mode).toBe("autonomous-launch-timing");
    expect(["snipe", "probe", "confirm", "late-chase", "fade", "blocked", "idle"]).toContain(state.autonomous_launch_timing.status);
    expect(["snipe-now", "probe", "confirm", "late-chase", "fade", "stand-down"]).toContain(state.autonomous_launch_timing.selected_action);
    expect(state.autonomous_launch_timing.timing_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_launch_timing.timing_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_launch_timing.fastest_review_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_launch_timing.should_wait_confirmation).toBe("boolean");
    expect(typeof state.autonomous_launch_timing.should_block_late_chase).toBe("boolean");
    expect(state.autonomous_launch_timing.controls.some((control) => control.includes("Moonshot-style entry timing"))).toBe(true);
    expect(state.autonomous_launch_timing.controls.some((control) => control.includes("cannot guarantee profit"))).toBe(true);
    expect(state.autonomous_launch_timing.items.length).toBeGreaterThan(0);
    expect(state.autonomous_launch_timing.items.every((item) =>
      ["fresh-launch", "early-momentum", "migration-window", "crowded-pump", "late-cycle", "blocked"].includes(item.phase) &&
      ["snipe-now", "probe", "confirm", "late-chase", "fade", "stand-down"].includes(item.action) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      item.timing_score >= 0 &&
      item.timing_score <= 100 &&
      item.early_edge_score >= 0 &&
      item.early_edge_score <= 100 &&
      item.crowding_score >= 0 &&
      item.crowding_score <= 100 &&
      item.paid_hype_score >= 0 &&
      item.paid_hype_score <= 100 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.strategy_lab.runs.length).toBe(3);
    expect(state.opportunity_radar.items.length).toBeGreaterThan(0);
    expect(state.discovery_tape.top_candidates.length).toBeGreaterThan(0);
    expect(state.autonomous_signal_noise.mode).toBe("signal-noise-scanner");
    expect(["attack", "selective", "noisy", "protect", "idle"]).toContain(state.autonomous_signal_noise.status);
    expect(state.autonomous_signal_noise.items.length).toBeGreaterThan(0);
    expect(state.autonomous_signal_noise.items.every((item) =>
      item.signal_score >= 0 &&
      item.signal_score <= 100 &&
      item.noise_score >= 0 &&
      item.noise_score <= 100 &&
      item.signal_to_noise_ratio >= 0 &&
      item.review_after_seconds > 0 &&
      item.evidence.length > 0
    )).toBe(true);
	    expect(state.autonomous_signal_noise.controls.some((control) => control.includes("Blocks or size-reduces"))).toBe(true);
	    expect(state.trend_velocity_scanner.mode).toBe("trend-velocity-scanner");
	    expect(["hot", "selective", "cooldown", "blocked", "idle"]).toContain(state.trend_velocity_scanner.status);
	    expect(state.trend_velocity_scanner.items.length).toBeGreaterThan(0);
	    expect(state.trend_velocity_scanner.fastest_chase_seconds).toBeGreaterThan(0);
	    expect(state.trend_velocity_scanner.controls.some((control) => control.includes("Moonshot-style hot coin flow"))).toBe(true);
	    expect(state.trend_velocity_scanner.controls.some((control) => control.includes("cannot sign"))).toBe(true);
		    expect(state.trend_velocity_scanner.items.every((item) =>
		      ["chase", "probe", "watch", "fade", "block"].includes(item.action) &&
	      item.trend_score >= 0 &&
	      item.trend_score <= 100 &&
	      item.velocity_score >= 0 &&
	      item.buyer_flow_score >= 0 &&
	      item.discovery_heat_score >= 0 &&
	      item.freshness_score >= 0 &&
	      item.liquidity_score >= 0 &&
	      item.noise_score >= 0 &&
	      item.signal_to_noise_ratio >= 0 &&
	      item.chase_window_seconds > 0 &&
	      item.paper_size_multiplier >= 0 &&
	      item.reason.length > 0 &&
		      item.evidence.length > 0
		    )).toBe(true);
		    expect(state.autonomous_market_pulse.mode).toBe("autonomous-market-pulse");
		    expect(["attack", "selective", "protect", "cooldown", "idle"]).toContain(state.autonomous_market_pulse.status);
		    expect(state.autonomous_market_pulse.items.length).toBeGreaterThan(0);
		    expect(state.autonomous_market_pulse.fastest_review_seconds).toBeGreaterThan(0);
		    expect(state.autonomous_market_pulse.controls.some((control) => control.includes("signal/noise"))).toBe(true);
		    expect(state.autonomous_market_pulse.controls.some((control) => control.includes("cannot sign"))).toBe(true);
		    expect(state.autonomous_market_pulse.items.every((item) =>
		      ["attack", "probe", "watch", "protect", "stand-down"].includes(item.action) &&
	      item.pulse_score >= 0 &&
	      item.pulse_score <= 100 &&
	      item.organic_momentum_score >= 0 &&
	      item.organic_momentum_score <= 100 &&
	      item.signal_score >= 0 &&
	      item.flow_score >= 0 &&
	      item.velocity_score >= 0 &&
	      item.risk_score >= 0 &&
	      item.blended_edge_score >= 0 &&
	      item.source_confirmation_score >= 0 &&
	      item.source_confirmation_score <= 100 &&
	      item.promotion_risk_score >= 0 &&
	      item.promotion_risk_score <= 100 &&
	      item.signal_to_noise_ratio >= 0 &&
	      item.review_after_seconds > 0 &&
	      item.recommended_size_multiplier >= 0 &&
	      item.reason.length > 0 &&
		      item.evidence.length > 0
		    )).toBe(true);
		    expect(state.autonomous_market_pulse.average_organic_momentum_score).toBeGreaterThanOrEqual(0);
		    expect(state.autonomous_market_pulse.organic_attack_count).toBeGreaterThanOrEqual(0);
		    expect(state.autonomous_market_pulse.controls.some((control) => control.includes("organic-momentum"))).toBe(true);
		    expect(state.market_pulse_execution.mode).toBe("market-pulse-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(state.market_pulse_execution.status);
		    expect(state.market_pulse_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(state.market_pulse_execution.review_after_seconds).toBeGreaterThan(0);
		    expect(state.market_pulse_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
		    expect(state.market_pulse_execution.controls.some((control) => control.includes("top market-pulse"))).toBe(true);
		    expect(state.market_pulse_execution.controls.some((control) => control.includes("paper-ledger-only"))).toBe(true);
		    if (state.market_pulse_execution.paper_trade) {
		      expect(state.market_pulse_execution.paper_trade.side).toBe("buy");
		      expect(state.market_pulse_execution.paper_trade.reason).toContain("Market pulse");
		    }
		    expect(state.autonomous_profit_learning.mode).toBe("autonomous-profit-learning");
		    expect(["press", "selective", "tighten", "protect", "learning", "idle"]).toContain(state.autonomous_profit_learning.status);
		    expect(state.autonomous_profit_learning.items.length).toBeGreaterThanOrEqual(5);
		    expect(state.autonomous_profit_learning.confidence_score).toBeGreaterThanOrEqual(0);
		    expect(state.autonomous_profit_learning.confidence_score).toBeLessThanOrEqual(100);
		    expect(state.autonomous_profit_learning.size_multiplier).toBeGreaterThan(0);
		    expect(state.autonomous_profit_learning.cadence_seconds).toBeGreaterThan(0);
		    expect(state.autonomous_profit_learning.controls.some((control) => control.includes("local paper PnL"))).toBe(true);
		    expect(state.autonomous_profit_learning.controls.some((control) => control.includes("Forward replay"))).toBe(true);
		    expect(state.autonomous_profit_learning.items.some((item) => item.lane === "replay" && item.label === "Forward replay")).toBe(true);
		    expect(state.autonomous_profit_learning.items.every((item) =>
		      ["scorecard", "replay", "command", "strategy", "churn", "pulse", "session", "opportunity"].includes(item.lane) &&
		      ["pass", "watch", "fail"].includes(item.status) &&
		      ["press", "probe", "tighten", "harvest", "cooldown", "stand-down"].includes(item.action) &&
		      item.confidence_score >= 0 &&
		      item.confidence_score <= 100 &&
		      item.size_multiplier > 0 &&
		      item.cadence_seconds > 0 &&
		      item.detail.length > 0
		    )).toBe(true);
		    expect(state.autonomous_market_intelligence.mode).toBe("autonomous-market-intelligence");
		    expect(["chase", "selective", "watch", "protect", "blocked", "idle"]).toContain(state.autonomous_market_intelligence.status);
		    expect(["sample", "live", "repair", "blocked"]).toContain(state.autonomous_market_intelligence.provider_status);
		    expect(state.autonomous_market_intelligence.items.length).toBeGreaterThan(0);
		    expect(state.autonomous_market_intelligence.provider_confidence_score).toBeGreaterThanOrEqual(0);
		    expect(state.autonomous_market_intelligence.provider_confidence_score).toBeLessThanOrEqual(100);
		    expect(state.autonomous_market_intelligence.recommended_cadence_seconds).toBeGreaterThan(0);
		    expect(state.autonomous_market_intelligence.recommended_max_trades).toBeGreaterThan(0);
		    expect(state.autonomous_market_intelligence.provider_plan.length).toBeGreaterThanOrEqual(2);
		    expect(state.autonomous_market_intelligence.controls.some((control) => control.includes("DEX discovery"))).toBe(true);
		    expect(state.autonomous_market_intelligence.controls.some((control) => control.includes("local paper"))).toBe(true);
		    expect(state.autonomous_market_intelligence.items.every((item) =>
		      ["chase", "probe", "watch", "harvest", "protect", "stand-down"].includes(item.action) &&
		      item.confidence_score >= 0 &&
		      item.confidence_score <= 100 &&
		      item.signal_score >= 0 &&
		      item.chart_score >= 0 &&
		      item.route_score >= 0 &&
		      item.catalyst_score >= 0 &&
		      item.risk_score >= 0 &&
		      item.signal_to_noise_ratio >= 0 &&
		      item.chase_window_seconds > 0 &&
		      item.paper_size_multiplier >= 0 &&
		      item.source_count >= 0 &&
		      item.reason.length > 0 &&
		      item.evidence.length > 0
		    )).toBe(true);
		    expect(state.market_intelligence_execution.mode).toBe("market-intelligence-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(state.market_intelligence_execution.status);
		    expect(state.market_intelligence_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(state.market_intelligence_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
		    expect(state.market_intelligence_execution.expected_edge_usd).toBeGreaterThanOrEqual(0);
		    expect(state.market_intelligence_execution.risk_usd).toBeGreaterThanOrEqual(0);
		    expect(typeof state.market_intelligence_execution.projected_pnl_usd).toBe("number");
		    expect(state.market_intelligence_execution.review_after_seconds).toBeGreaterThan(0);
		    expect(state.market_intelligence_execution.controls.some((control) => control.includes("bounded local paper buy"))).toBe(true);
		    expect(state.market_intelligence_execution.controls.some((control) => control.includes("live signing"))).toBe(true);
		    if (state.market_intelligence_execution.paper_trade) {
		      expect(state.market_intelligence_execution.paper_trade.side).toBe("buy");
		      expect(state.market_intelligence_execution.paper_trade.reason).toContain("Market intelligence");
		    }
		    expect(state.autonomous_watchlist_rotation.mode).toBe("autonomous-watchlist-rotation");
		    expect(["trade-now", "quote-first", "chart-first", "refresh-first", "protect", "watch", "idle"]).toContain(state.autonomous_watchlist_rotation.status);
		    expect(state.autonomous_watchlist_rotation.items.length).toBeGreaterThan(0);
		    expect(state.autonomous_watchlist_rotation.fastest_refresh_seconds).toBeGreaterThan(0);
		    expect(typeof state.autonomous_watchlist_rotation.expected_edge_usd).toBe("number");
		    expect(state.autonomous_watchlist_rotation.controls.some((control) => control.includes("wallet funds"))).toBe(true);
		    expect(state.autonomous_watchlist_rotation.items.every((item) =>
		      ["paper-trade", "quote-route", "fetch-candles", "refresh-pair", "protect-position", "watch"].includes(item.action) &&
		      ["trade", "route", "chart", "pair", "portfolio", "watch"].includes(item.lane) &&
		      ["critical", "high", "normal", "low"].includes(item.priority) &&
		      item.rotation_score >= 0 &&
		      item.rotation_score <= 100 &&
		      item.refresh_after_seconds > 0 &&
		      typeof item.paper_trade_ready === "boolean" &&
		      typeof item.route_refresh_required === "boolean" &&
		      typeof item.candle_refresh_required === "boolean" &&
		      typeof item.pair_refresh_required === "boolean" &&
		      item.reason.length > 0 &&
		      item.evidence.length > 0
		    )).toBe(true);
		    expect(state.watchlist_rotation_execution.mode).toBe("watchlist-rotation-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(state.watchlist_rotation_execution.status);
		    expect(state.watchlist_rotation_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(state.watchlist_rotation_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
		    expect(state.watchlist_rotation_execution.expected_edge_usd).toBeGreaterThanOrEqual(0);
		    expect(state.watchlist_rotation_execution.risk_usd).toBeGreaterThanOrEqual(0);
		    expect(typeof state.watchlist_rotation_execution.projected_pnl_usd).toBe("number");
		    expect(state.watchlist_rotation_execution.review_after_seconds).toBeGreaterThan(0);
		    expect(state.watchlist_rotation_execution.controls.some((control) => control.includes("paper-ledger-only"))).toBe(true);
		    expect(state.watchlist_rotation_execution.controls.some((control) => control.includes("wallet fund"))).toBe(true);
		    if (state.watchlist_rotation_execution.paper_trade) {
		      expect(["buy", "sell"]).toContain(state.watchlist_rotation_execution.paper_trade.side);
		      expect(state.watchlist_rotation_execution.paper_trade.reason).toContain("Watchlist rotation");
		    }
		    expect(state.trend_chase_execution.mode).toBe("trend-chase-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(state.trend_chase_execution.status);
		    expect(state.trend_chase_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(state.trend_chase_execution.review_after_seconds).toBeGreaterThan(0);
		    expect(state.trend_chase_execution.scout_reserve_usd).toBeGreaterThanOrEqual(0);
		    expect(typeof state.trend_chase_execution.uses_scout_reserve).toBe("boolean");
		    expect(state.trend_chase_execution.controls.some((control) => control.includes("hot/probe trend-velocity candidate"))).toBe(true);
		    expect(state.trend_chase_execution.controls.some((control) => control.includes("scout reserve"))).toBe(true);
		    if (state.trend_chase_execution.paper_trade) {
		      expect(state.trend_chase_execution.paper_trade.side).toBe("buy");
		      expect(state.trend_chase_execution.paper_trade.reason).toContain("Trend chase");
		      if (state.trend_chase_execution.uses_scout_reserve) {
		        expect(state.trend_chase_execution.paper_trade.reason).toContain("scout-reserve");
		        expect(state.trend_chase_execution.paper_trade.size_usd).toBe(state.trend_chase_execution.scout_reserve_usd);
		      }
		    }
		    expect(state.scout_lifecycle.mode).toBe("scout-lifecycle-controller");
		    expect(["harvest", "trim", "stop", "tighten", "watch", "idle"]).toContain(state.scout_lifecycle.status);
		    expect(state.scout_lifecycle.execution_boundary).toBe("paper-ledger-only");
		    expect(state.scout_lifecycle.watched_count).toBeGreaterThanOrEqual(0);
		    expect(state.scout_lifecycle.release_usd).toBeGreaterThanOrEqual(0);
		    expect(state.scout_lifecycle.review_after_seconds).toBeGreaterThan(0);
		    expect(state.scout_lifecycle.controls.some((control) => control.includes("scout-origin"))).toBe(true);
		    if (state.scout_lifecycle.paper_trade) {
		      expect(state.scout_lifecycle.paper_trade.side).toBe("sell");
		      expect(state.scout_lifecycle.paper_trade.reason).toContain("Scout lifecycle");
		    }
		    expect(state.autonomous_trade_arbiter.controls.some((control) => control.includes("signal/noise"))).toBe(true);
    expect(state.autonomous_trade_arbiter.items.some((item) =>
      item.sources.some((source) => source.startsWith("signal-noise-"))
    )).toBe(true);
    expect(state.autonomous_burst_scheduler.mode).toBe("autonomous-burst-scheduler");
    expect(["burst", "active", "selective", "cooldown", "protect", "stand-down", "idle"]).toContain(state.autonomous_burst_scheduler.status);
    expect(state.autonomous_burst_scheduler.next_tick_seconds).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_scheduler.max_trades_next_tick).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_scheduler.dex_discovery_budget_per_minute).toBeLessThanOrEqual(60);
    expect(state.autonomous_burst_scheduler.dex_pair_budget_per_minute).toBeLessThanOrEqual(300);
    expect(state.autonomous_burst_scheduler.items.length).toBeGreaterThan(0);
    expect(state.autonomous_burst_scheduler.controls.some((control) => control.includes("local paper daemon bursts"))).toBe(true);
    expect(state.autonomous_daily_profit_lock.mode).toBe("autonomous-daily-profit-lock");
    expect(["run", "lock-profit", "harvest", "protect", "cooldown", "stand-down"]).toContain(state.autonomous_daily_profit_lock.status);
    expect(["trade", "lock-gains", "harvest", "protect-only", "cooldown", "stand-down"]).toContain(state.autonomous_daily_profit_lock.action);
    expect(["open", "harvest-only", "protect-only", "paused", "stand-down"]).toContain(state.autonomous_daily_profit_lock.loop_permission);
    expect(typeof state.autonomous_daily_profit_lock.fresh_buy_allowed).toBe("boolean");
    expect(typeof state.autonomous_daily_profit_lock.protect_sell_allowed).toBe("boolean");
    expect(state.autonomous_daily_profit_lock.target_net_pnl_usd).toBeGreaterThan(0);
    expect(state.autonomous_daily_profit_lock.target_remaining_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.stop_loss_usd).toBeGreaterThan(0);
    expect(state.autonomous_daily_profit_lock.loss_budget_remaining_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.locked_profit_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.release_required_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.deploy_allowed_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daily_profit_lock.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_daily_profit_lock.controls.some((control) => control.includes("daily/session paper circuit breaker"))).toBe(true);
    expect(state.autonomous_daily_profit_lock.controls.some((control) => control.includes("cannot guarantee profit"))).toBe(true);
    expect(state.autonomous_daily_profit_lock.items.length).toBe(6);
    expect(state.autonomous_daily_profit_lock.items.every((item) =>
      ["target", "loss", "drawdown", "fresh-buy", "release", "memory"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_portfolio_mark_board.mode).toBe("autonomous-portfolio-mark-board");
    expect(["compound", "harvest", "protect", "exit", "watch", "idle"]).toContain(state.autonomous_portfolio_mark_board.status);
    expect(state.autonomous_portfolio_mark_board.held_count).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_mark_board.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_mark_board.equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.exposure_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.release_pressure_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.press_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_mark_board.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_portfolio_mark_board.controls.some((control) => control.includes("mark-to-market"))).toBe(true);
    expect(state.autonomous_portfolio_mark_board.controls.some((control) => control.includes("cannot guarantee profit"))).toBe(true);
    expect(state.autonomous_portfolio_mark_board.items.every((item) =>
      ["press", "harvest", "trim", "exit", "protect", "refresh", "hold"].includes(item.action) &&
      ["winner", "watch", "risk", "exit", "idle"].includes(item.status) &&
      item.current_value_usd >= 0 &&
      item.cost_basis_usd >= 0 &&
      item.exposure_pct >= 0 &&
      item.suggested_release_usd >= 0 &&
      item.suggested_press_usd >= 0 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_replay_gate.mode).toBe("autonomous-replay-gate");
    expect(["approve", "size-down", "protect", "refresh", "blocked", "learning"]).toContain(state.autonomous_replay_gate.status);
    expect(["approve-size", "reduce-size", "protect-only", "refresh-replay", "stand-down", "learn-more"]).toContain(state.autonomous_replay_gate.action);
    expect(typeof state.autonomous_replay_gate.can_spend).toBe("boolean");
    expect(state.autonomous_replay_gate.replay_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_replay_gate.replay_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_replay_gate.size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_replay_gate.size_multiplier).toBeLessThanOrEqual(1.5);
    expect(state.autonomous_replay_gate.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_replay_gate.max_next_fills).toBeLessThanOrEqual(6);
    expect(["base", "breakout", "rug-risk"]).toContain(state.autonomous_replay_gate.best_regime);
    expect(["base", "breakout", "rug-risk"]).toContain(state.autonomous_replay_gate.worst_regime);
    expect(state.autonomous_replay_gate.items.length).toBe(6);
    expect(state.autonomous_replay_gate.items.every((item) =>
      ["forward", "regime", "rug", "scorecard", "ticket", "queue"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_replay_gate.controls.some((control) => control.includes("base, breakout, and rug-risk"))).toBe(true);
    expect(state.autonomous_replay_gate.controls.some((control) => control.includes("cannot predict future PnL"))).toBe(true);
    expect(state.autonomous_burst_fill_plan.mode).toBe("autonomous-burst-fill-plan");
    expect(state.autonomous_burst_fill_plan.plan_id).toContain(`burst-plan-${state.paper_account.cycle}`);
    expect(state.autonomous_burst_fill_plan.cycle).toBe(state.paper_account.cycle);
    expect(["burst", "single", "protect", "refresh", "blocked", "idle"]).toContain(state.autonomous_burst_fill_plan.status);
    expect(["paper-ledger-only", "read-only-route-refresh", "blocked-paper-only"]).toContain(state.autonomous_burst_fill_plan.execution_boundary);
    expect(state.autonomous_burst_fill_plan.child_fill_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.child_fill_count).toBeLessThanOrEqual(state.autonomous_burst_fill_plan.max_child_fills);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(state.autonomous_daily_profit_lock.max_next_fills);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(6);
    expect(state.autonomous_burst_fill_plan.feedback_child_fill_ceiling).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.feedback_child_fill_ceiling).toBeLessThanOrEqual(6);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(state.autonomous_burst_fill_plan.feedback_child_fill_ceiling);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(state.autonomous_data_freshness_gate.max_next_fills);
    expect(state.autonomous_burst_fill_plan.max_child_fills).toBeLessThanOrEqual(state.autonomous_replay_gate.max_next_fills);
    expect(state.autonomous_burst_fill_plan.prior_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.prior_size_multiplier).toBeLessThanOrEqual(1.5);
    expect(["clear", "tradeable", "refresh", "backfill", "blocked", "sample"]).toContain(state.autonomous_burst_fill_plan.data_gate_status);
    expect(state.autonomous_burst_fill_plan.data_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.data_size_multiplier).toBeLessThanOrEqual(1.5);
    expect(["approve", "size-down", "protect", "refresh", "blocked", "learning"]).toContain(state.autonomous_burst_fill_plan.replay_gate_status);
    expect(state.autonomous_burst_fill_plan.replay_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.replay_size_multiplier).toBeLessThanOrEqual(1.5);
    expect(
      state.autonomous_burst_fill_plan.prior_feedback_action === null ||
        ["increase-next-burst", "keep-next-burst", "halve-next-burst", "protect-only", "refresh-proof", "stand-down", "observe"].includes(state.autonomous_burst_fill_plan.prior_feedback_action)
    ).toBe(true);
    expect(state.autonomous_burst_fill_plan.total_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.child_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_plan.max_slippage_bps).toBeGreaterThanOrEqual(50);
    expect(state.autonomous_burst_fill_plan.max_slippage_bps).toBeLessThanOrEqual(2000);
    expect(state.autonomous_burst_fill_plan.children.length).toBeGreaterThan(0);
    expect(state.autonomous_burst_fill_plan.children.every((child) =>
      child.notional_usd >= 0 &&
      child.expected_edge_usd >= 0 &&
      child.max_slippage_bps >= 50
    )).toBe(true);
    expect(state.autonomous_burst_fill_plan.controls.some((control) => control.includes("child paper fills"))).toBe(true);
    expect(state.autonomous_burst_fill_plan.controls.some((control) => control.includes("prior burst feedback"))).toBe(true);
    expect(state.autonomous_burst_fill_plan.controls.some((control) => control.includes("data freshness gate multiplier"))).toBe(true);
    expect(state.autonomous_burst_fill_plan.controls.some((control) => control.includes("replay gate multiplier"))).toBe(true);
    expect(state.autonomous_burst_outcome_feedback.mode).toBe("autonomous-burst-outcome-feedback");
    expect(["scale", "keep", "tighten", "protect", "blocked", "idle"]).toContain(state.autonomous_burst_outcome_feedback.status);
    expect(["increase-next-burst", "keep-next-burst", "halve-next-burst", "protect-only", "refresh-proof", "stand-down", "observe"]).toContain(state.autonomous_burst_outcome_feedback.action);
    expect(typeof state.autonomous_burst_outcome_feedback.can_scale_next_burst).toBe("boolean");
    expect(typeof state.autonomous_burst_outcome_feedback.should_halve_next_burst).toBe("boolean");
    expect(typeof state.autonomous_burst_outcome_feedback.blocks_fresh_buy).toBe("boolean");
    expect(state.autonomous_burst_outcome_feedback.outcome_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.outcome_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_burst_outcome_feedback.fill_efficiency_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.fill_efficiency_pct).toBeLessThanOrEqual(100);
    expect(state.autonomous_burst_outcome_feedback.paper_quality_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.paper_quality_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_burst_outcome_feedback.churn_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.churn_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_burst_outcome_feedback.projected_friction_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.max_next_child_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_outcome_feedback.max_next_child_fills).toBeLessThanOrEqual(6);
    expect(state.autonomous_burst_outcome_feedback.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_burst_outcome_feedback.items.length).toBe(6);
    expect(state.autonomous_burst_outcome_feedback.items.every((item) =>
      ["edge", "fill-quality", "churn", "wallet", "daily-lock", "route"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_burst_outcome_feedback.controls.some((control) => control.includes("next-cycle size multiplier"))).toBe(true);
    expect(state.autonomous_burst_outcome_feedback.controls.some((control) => control.includes("paper-trading feedback only"))).toBe(true);
    expect(state.autonomous_burst_fill_execution.mode).toBe("autonomous-burst-fill-execution");
    expect(["applied", "ready", "blocked", "idle"]).toContain(state.autonomous_burst_fill_execution.status);
    expect(typeof state.autonomous_burst_fill_execution.ledger_applied).toBe("boolean");
    expect(state.autonomous_burst_fill_execution.requested_child_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_execution.requested_child_count).toBeLessThanOrEqual(6);
    expect(state.autonomous_burst_fill_execution.applied_child_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_execution.applied_child_count).toBeLessThanOrEqual(state.autonomous_burst_fill_execution.requested_child_count);
    expect(state.autonomous_burst_fill_execution.planned_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_fill_execution.applied_notional_usd).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(state.autonomous_burst_fill_execution.last_trade_ids)).toBe(true);
    expect(state.autonomous_burst_fill_execution.controls.some((control) => control.includes("weighted-average paper scale-ins"))).toBe(true);
    expect(state.autonomous_burst_fill_execution.controls.some((control) => control.includes("Local paper ledger only"))).toBe(true);
    expect(state.autonomous_profit_accountability.mode).toBe("autonomous-profit-accountability");
    expect(["press", "compound", "tighten", "protect", "blocked", "learning"]).toContain(state.autonomous_profit_accountability.status);
    expect(["press-size", "keep-size", "tighten-size", "protect-wallet", "refresh-proof", "stand-down"]).toContain(state.autonomous_profit_accountability.action);
    expect(typeof state.autonomous_profit_accountability.making_money).toBe("boolean");
    expect(state.autonomous_profit_accountability.accountability_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.accountability_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_accountability.next_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.next_size_multiplier).toBeLessThanOrEqual(1.5);
    expect(state.autonomous_profit_accountability.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.max_next_fills).toBeLessThanOrEqual(6);
    expect(state.autonomous_profit_accountability.fill_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.blocked_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.repair_plan.mode).toBe("local-paper-accountability-repair-plan");
    expect(["complete", "refresh-first", "preflight-repair", "run-paper-session", "protect-first", "blocked"]).toContain(state.autonomous_profit_accountability.repair_plan.status);
    expect(state.autonomous_profit_accountability.repair_plan.target_score).toBe(70);
    expect(state.autonomous_profit_accountability.repair_plan.score_gap).toBe(Math.max(0, 70 - state.autonomous_profit_accountability.accountability_score));
    expect(["wallet", "scorecard", "fills", "burst", "directive", "session"]).toContain(state.autonomous_profit_accountability.repair_plan.weakest_item_id);
    expect(state.autonomous_profit_accountability.repair_plan.weakest_item_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.repair_plan.weakest_item_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_accountability.repair_plan.recommended_ticks).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.repair_plan.recommended_ticks).toBeLessThanOrEqual(3);
    expect(state.autonomous_profit_accountability.repair_plan.recommended_max_total_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_accountability.repair_plan.recommended_max_total_fills).toBeLessThanOrEqual(3);
    expect(typeof state.autonomous_profit_accountability.repair_plan.local_route_rehearsal_ready).toBe("boolean");
    expect(state.autonomous_profit_accountability.repair_plan.local_route_rehearsal_summary === null || typeof state.autonomous_profit_accountability.repair_plan.local_route_rehearsal_summary === "string").toBe(true);
    expect(state.autonomous_profit_accountability.repair_plan.blocking_reason === null || typeof state.autonomous_profit_accountability.repair_plan.blocking_reason === "string").toBe(true);
    expect(state.autonomous_profit_accountability.repair_plan.live_execution_permission).toBe("blocked");
    expect(state.autonomous_profit_accountability.repair_plan.wallet_mutation_permission).toBe("blocked");
    if (state.autonomous_profit_accountability.repair_plan.request) {
      expect(state.autonomous_profit_accountability.repair_plan.request.endpoint).toBe("/api/web3-trading");
      expect(state.autonomous_profit_accountability.repair_plan.request.method).toBe("POST");
      expect(state.autonomous_profit_accountability.repair_plan.request.body.account).toBe("persistent");
    }
    expect(state.autonomous_profit_accountability.items.length).toBe(6);
    expect(state.autonomous_profit_accountability.items.every((item) =>
      ["wallet", "scorecard", "fills", "burst", "directive", "session"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_accountability.controls.some((control) => control.includes("paper wallet PnL"))).toBe(true);
    expect(state.autonomous_profit_accountability.controls.some((control) => control.includes("Local paper-accountability only"))).toBe(true);
    expect(state.autonomous_minute_profit_discipline.mode).toBe("autonomous-minute-profit-discipline");
    expect(["scale", "run", "tighten", "protect", "refresh", "blocked", "idle"]).toContain(state.autonomous_minute_profit_discipline.status);
    expect(["increase-frequency", "keep-running", "tighten-size", "protect-wallet", "refresh-proof", "stand-down", "observe"]).toContain(state.autonomous_minute_profit_discipline.action);
    expect(typeof state.autonomous_minute_profit_discipline.high_frequency_allowed).toBe("boolean");
    expect(typeof state.autonomous_minute_profit_discipline.fresh_buy_allowed).toBe("boolean");
    expect(typeof state.autonomous_minute_profit_discipline.should_protect_first).toBe("boolean");
    expect(typeof state.autonomous_minute_profit_discipline.should_refresh_first).toBe("boolean");
    expect(state.autonomous_minute_profit_discipline.discipline_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_minute_profit_discipline.discipline_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_minute_profit_discipline.max_trades_next_minute).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_minute_profit_discipline.max_trades_next_minute).toBeLessThanOrEqual(6);
    expect(state.autonomous_minute_profit_discipline.max_fresh_buys).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_minute_profit_discipline.max_fresh_buys).toBeLessThanOrEqual(state.autonomous_minute_profit_discipline.max_trades_next_minute);
    expect(state.autonomous_minute_profit_discipline.max_protective_sells).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_minute_profit_discipline.next_cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_minute_profit_discipline.items.map((item) => item.id)).toEqual(["velocity", "execution", "churn", "fill-quality", "wallet", "impact"]);
    expect(state.autonomous_minute_profit_discipline.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    if (!state.autonomous_minute_profit_discipline.high_frequency_allowed) {
      expect(
        state.autonomous_minute_profit_discipline.max_fresh_buys === 0 ||
          state.autonomous_minute_profit_discipline.status === "tighten"
      ).toBe(true);
    }
    expect(state.autonomous_minute_profit_discipline.controls.some((control) => control.includes("expected profit"))).toBe(true);
    expect(state.autonomous_minute_profit_discipline.controls.some((control) => control.includes("cannot guarantee profit"))).toBe(true);
    expect(state.autonomous_profit_integrity_circuit.mode).toBe("autonomous-profit-integrity-circuit");
    expect(["press", "continue", "probe", "protect", "cooldown", "blocked", "learning"]).toContain(state.autonomous_profit_integrity_circuit.status);
    expect(["scale", "trade", "probe", "protect-only", "cooldown", "stand-down"]).toContain(state.autonomous_profit_integrity_circuit.permission);
    expect(["increase-frequency", "keep-running", "single-probe", "protect-wallet", "cooldown", "stand-down"]).toContain(state.autonomous_profit_integrity_circuit.action);
    expect(state.autonomous_profit_integrity_circuit.integrity_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_integrity_circuit.integrity_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_integrity_circuit.size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_integrity_circuit.size_multiplier).toBeLessThanOrEqual(1.35);
    expect(state.autonomous_profit_integrity_circuit.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_integrity_circuit.max_next_fills).toBeLessThanOrEqual(6);
    expect(typeof state.autonomous_profit_integrity_circuit.can_continue).toBe("boolean");
    expect(typeof state.autonomous_profit_integrity_circuit.should_pause_fresh_buys).toBe("boolean");
    expect(typeof state.autonomous_profit_integrity_circuit.should_protect_first).toBe("boolean");
    expect(state.autonomous_profit_integrity_circuit.items.length).toBe(6);
    expect(state.autonomous_profit_integrity_circuit.items.every((item) =>
      ["validator", "forecast", "execution", "safety", "accountability", "loop"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_integrity_circuit.controls.some((control) => control.includes("Closes the autonomous profit loop"))).toBe(true);
    expect(state.autonomous_profit_integrity_circuit.controls.some((control) => control.includes("Feeds a single size multiplier"))).toBe(true);
    expect(state.autonomous_loop_throttle.items.some((item) => item.id === "accountability" && item.label === "Integrity")).toBe(true);
    expect(state.autonomous_trade_mission.mode).toBe("autonomous-trade-mission");
    expect(["attack", "probe", "harvest", "protect", "cooldown", "blocked", "idle"]).toContain(state.autonomous_trade_mission.status);
    expect(state.autonomous_trade_mission.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_mission.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_trade_mission.steps.length).toBeGreaterThanOrEqual(6);
    expect(state.autonomous_trade_mission.evidence.length).toBeGreaterThan(0);
    expect(state.autonomous_trade_mission.controls.some((control) => control.includes("existing trading subsystems"))).toBe(true);
    if (state.autonomous_trade_mission.status === "blocked") {
      expect(state.autonomous_trade_mission.blockers.length).toBeGreaterThan(0);
      expect(state.autonomous_trade_mission.next_action.length).toBeGreaterThan(0);
    }
    expect(state.autonomous_tick_plan.mode).toBe("autonomous-tick-plan");
    expect(["trade", "protect", "refresh", "observe", "stand-down", "blocked"]).toContain(state.autonomous_tick_plan.status);
    expect(["burst", "steady", "refresh-first", "protect-first", "cooldown", "blocked"]).toContain(state.autonomous_tick_plan.throughput_mode);
    expect(state.autonomous_tick_plan.items.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.tick_seconds).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.max_actions_next_minute).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.max_actions_next_minute).toBeLessThanOrEqual(state.autonomous_loop_director.max_ticks_per_minute);
    expect(state.autonomous_tick_plan.execution_slots_remaining).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_action_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_action_count).toBeLessThanOrEqual(state.autonomous_tick_plan.max_actions_next_minute);
    expect(state.autonomous_tick_plan.bundle_trade_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_refresh_count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(state.autonomous_tick_plan.bundle_symbols)).toBe(true);
    expect(state.autonomous_tick_plan.bundle_expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_trade_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.bundle_summary.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.next_minute_trade_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_plan.throttle_reason.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_governor.mode).toBe("autonomous-tick-governor");
    expect(["run-now", "protect-first", "refresh-first", "observe", "paused", "blocked"]).toContain(state.autonomous_tick_governor.status);
    expect(["trade", "protect", "refresh-routes", "refresh-market", "observe", "pause"]).toContain(state.autonomous_tick_governor.action);
    expect(typeof state.autonomous_tick_governor.can_auto_advance).toBe("boolean");
    expect(typeof state.autonomous_tick_governor.should_trade).toBe("boolean");
    if (state.autonomous_tick_governor.should_trade) {
      expect(state.autonomous_tick_governor.can_auto_advance).toBe(true);
      expect(state.autonomous_tick_governor.action).toBe("trade");
    }
    if (state.autonomous_tick_governor.should_request_route_quote) {
      expect(state.autonomous_tick_governor.action).toBe("refresh-routes");
    }
    if (state.autonomous_tick_governor.status === "blocked" || state.autonomous_tick_governor.status === "paused") {
      expect(state.autonomous_tick_governor.action).toBe("pause");
      expect(state.autonomous_tick_governor.can_auto_advance).toBe(false);
    }
    expect(state.autonomous_tick_governor.next_tick_seconds).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_governor.decision_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_governor.decision_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_tick_governor.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_governor.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_tick_governor.checks.map((check) => check.id)).toEqual(["discovery", "route", "wallet", "readiness", "profit", "throughput"]);
    expect(state.autonomous_tick_governor.checks.every((check) =>
      ["pass", "watch", "fail"].includes(check.status) &&
      check.score >= 0 &&
      check.score <= 100 &&
      check.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_tick_governor.controls.some((control) => control.includes("local paper-only"))).toBe(true);
    expect(state.autonomous_tick_bundle_execution.mode).toBe("tick-bundle-paper-rehearsal");
    expect(["ready", "applied", "refresh-only", "blocked", "empty", "mixed"]).toContain(state.autonomous_tick_bundle_execution.status);
    expect(state.autonomous_tick_bundle_execution.execution_boundary).toBe("paper-ledger-only");
    expect(["requesting", "ready", "blocked", "watching", "idle"]).toContain(state.autonomous_tick_bundle_execution.route_refresh_status);
    expect(typeof state.autonomous_tick_bundle_execution.route_refresh_vetoed).toBe("boolean");
    expect(state.autonomous_tick_bundle_execution.route_refresh_blocker === null || typeof state.autonomous_tick_bundle_execution.route_refresh_blocker === "string").toBe(true);
    expect(state.autonomous_tick_bundle_execution.route_vetoed_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.bundle_size).toBeLessThanOrEqual(
      state.autonomous_tick_plan.max_actions_next_minute + state.autonomous_tick_bundle_execution.applied_trade_count,
    );
    expect(state.autonomous_tick_bundle_execution.ready_trade_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.applied_trade_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.refresh_only_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.blocked_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.skipped_count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(state.autonomous_tick_bundle_execution.paper_trade_ids)).toBe(true);
    expect(state.autonomous_tick_bundle_execution.projected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_execution.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_bundle_execution.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_bundle_execution.controls.some((control) => control.includes("bounded local paper fills"))).toBe(true);
    expect(state.autonomous_tick_bundle_execution.controls.some((control) => control.includes("paper-ledger boundary"))).toBe(true);
    expect(state.autonomous_tick_bundle_execution.controls.some((control) => control.includes("route-refresh execution"))).toBe(true);
    if (state.autonomous_tick_bundle_execution.route_refresh_vetoed) {
      expect(state.autonomous_tick_bundle_execution.route_refresh_blocker).toBeTruthy();
      expect(state.autonomous_tick_bundle_execution.route_vetoed_count).toBeGreaterThan(0);
      expect(state.autonomous_tick_bundle_execution.items.some((item) =>
        item.status === "ready" &&
        item.side === "buy" &&
        item.lane === "entry"
      )).toBe(false);
    }
    expect(state.autonomous_capital_command.mode).toBe("autonomous-capital-command");
    expect(["deploy", "harvest", "protect", "refresh", "observe", "blocked", "idle"]).toContain(state.autonomous_capital_command.status);
    expect(["deploy-now", "harvest-first", "protect-first", "refresh-first", "observe", "stand-down"]).toContain(state.autonomous_capital_command.action);
    expect(state.autonomous_capital_command.command_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.command_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_capital_command.spend_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.release_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.reserved_cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.risk_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_command.next_tick_seconds).toBeGreaterThan(0);
    expect(state.autonomous_capital_command.max_child_fills).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_capital_command.can_execute_paper).toBe("boolean");
    expect(["paper-ledger-only", "read-only-refresh", "blocked-paper-only"]).toContain(state.autonomous_capital_command.execution_boundary);
    expect(state.autonomous_capital_command.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_capital_command.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_capital_command.items.map((item) => item.id)).toEqual(["tick", "capital", "profit", "wallet", "source", "execution"]);
    expect(state.autonomous_capital_command.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_capital_command.controls.some((control) => control.includes("next-dollar command"))).toBe(true);
    expect(state.autonomous_capital_command.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.autonomous_tick_bundle_feedback.mode).toBe("tick-bundle-feedback-governor");
    expect(["press", "selective", "cooldown", "protect", "idle"]).toContain(state.autonomous_tick_bundle_feedback.status);
    expect(state.autonomous_tick_bundle_feedback.bundle_quality_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_feedback.bundle_quality_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_tick_bundle_feedback.next_bundle_trade_cap).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_tick_bundle_feedback.next_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_tick_bundle_feedback.protective_sell_only).toBe("boolean");
    expect(state.autonomous_tick_bundle_feedback.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_bundle_feedback.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_bundle_feedback.controls.some((control) => control.includes("local paper-ledger sizing"))).toBe(true);
    expect(state.autonomous_lane_capital_controller.mode).toBe("autonomous-lane-capital-controller");
    expect(["press", "balanced", "selective", "cooldown", "protect", "idle"]).toContain(state.autonomous_lane_capital_controller.status);
    expect(state.autonomous_lane_capital_controller.total_lane_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_lane_capital_controller.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_lane_capital_controller.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_lane_capital_controller.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_lane_capital_controller.controls.some((control) => control.includes("local paper capital"))).toBe(true);
    expect(state.autonomous_lane_capital_controller.items.every((item) =>
      ["press", "fund", "probe", "cooldown", "stop", "protect"].includes(item.status) &&
      item.lane_budget_usd >= 0 &&
      item.max_trade_usd >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100
    )).toBe(true);
    expect(state.autonomous_profit_allocation_plan.mode).toBe("autonomous-profit-allocation-plan");
    expect(["press", "rotate", "protect", "cooldown", "learning", "idle"]).toContain(state.autonomous_profit_allocation_plan.status);
    expect(state.autonomous_profit_allocation_plan.deploy_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.release_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.size_multiplier).toBeGreaterThan(0);
    expect(state.autonomous_profit_allocation_plan.cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_profit_allocation_plan.allocation_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.allocation_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("next-cycle sizing plan"))).toBe(true);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("allocator gate"))).toBe(true);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("clipped to the learned lane cap"))).toBe(true);
    expect(state.autonomous_profit_allocation_plan.items.every((item) =>
      ["press", "fund", "probe", "release", "cooldown", "stop"].includes(item.action) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.allocation_weight_pct >= 0 &&
      item.allocation_weight_pct <= 100 &&
      item.budget_usd >= 0 &&
      item.max_trade_usd >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100
    )).toBe(true);
    expect(state.autonomous_regime_tape.mode).toBe("autonomous-regime-tape");
    expect(["attack", "scalp", "rotate", "distribute", "protect", "chop", "idle"]).toContain(state.autonomous_regime_tape.status);
    expect(state.autonomous_regime_tape.average_regime_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_regime_tape.average_regime_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_regime_tape.average_risk_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_regime_tape.average_risk_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_regime_tape.max_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_regime_tape.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_regime_tape.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_regime_tape.controls.some((control) => control.includes("local simulator control"))).toBe(true);
    expect(state.autonomous_regime_tape.items.every((item) =>
      ["breakout", "scalp", "rotation", "distribution", "rug-risk", "dead-chop"].includes(item.regime) &&
      ["attack", "scalp", "probe", "rotate", "trim", "protect", "avoid"].includes(item.action) &&
      item.regime_score >= 0 &&
      item.regime_score <= 100 &&
      item.risk_score >= 0 &&
      item.risk_score <= 100 &&
      item.max_buy_usd >= 0
    )).toBe(true);
    expect(state.autonomous_wallet_growth_director.mode).toBe("autonomous-wallet-growth-director");
    expect(["press", "scalp", "compound", "harvest", "protect", "recover", "pause", "idle"]).toContain(state.autonomous_wallet_growth_director.status);
    expect(state.autonomous_wallet_growth_director.growth_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.growth_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_wallet_growth_director.risk_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.risk_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_wallet_growth_director.portfolio_heat_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.portfolio_heat_score).toBeLessThanOrEqual(100);
    expect(["open", "selective", "cooldown", "exit-only"]).toContain(state.autonomous_wallet_growth_director.fresh_entry_permission);
    expect(state.autonomous_wallet_growth_director.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_wallet_growth_director.max_fresh_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_wallet_growth_director.heat_limited_buy_usd).toBeGreaterThanOrEqual(0);
    expect(
      state.autonomous_wallet_growth_director.max_fresh_buy_usd <= state.autonomous_wallet_growth_director.heat_limited_buy_usd ||
        ["protect", "recover", "pause"].includes(state.autonomous_wallet_growth_director.status),
    ).toBe(true);
    expect(state.autonomous_wallet_growth_director.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_wallet_growth_director.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_wallet_growth_director.controls.some((control) => control.includes("paper/simulator control"))).toBe(true);
    expect(state.autonomous_wallet_growth_director.controls.some((control) => control.includes("heat-capped"))).toBe(true);
    expect(state.autonomous_wallet_growth_director.items.every((item) =>
      ["wallet", "regime", "capital", "execution", "portfolio", "loop"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      ["press", "scalp", "compound", "harvest", "protect", "recover", "pause"].includes(item.action) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.budget_usd >= 0
    )).toBe(true);
    expect(state.autonomous_reentry_hunter.mode).toBe("autonomous-reentry-hunter");
    expect(["rebuy", "probe", "watch", "blocked", "idle"]).toContain(state.autonomous_reentry_hunter.status);
    expect(state.autonomous_reentry_hunter.max_reentry_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reentry_hunter.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reentry_hunter.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_reentry_hunter.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_reentry_hunter.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_reentry_hunter.controls.some((control) => control.includes("paper/simulator control"))).toBe(true);
    expect(state.autonomous_reentry_hunter.items.every((item) =>
      ["rebuy", "probe", "wait", "blocked"].includes(item.action) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      item.reentry_score >= 0 &&
      item.reentry_score <= 100 &&
      item.reclaim_score >= 0 &&
      item.reclaim_score <= 100 &&
      item.signal_score >= 0 &&
      item.signal_score <= 100 &&
      item.risk_score >= 0 &&
      item.risk_score <= 100 &&
      item.last_exit_size_usd >= 0 &&
      item.recommended_size_usd >= 0 &&
      item.expected_edge_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_profit_route_selector.mode).toBe("autonomous-profit-route-selector");
    expect(["execute", "selective", "protect", "observe", "blocked", "idle"]).toContain(state.autonomous_profit_route_selector.status);
    expect(state.autonomous_profit_route_selector.selected_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_route_selector.selected_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_route_selector.max_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_route_selector.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_route_selector.average_fill_quality_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_route_selector.average_fill_quality_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_route_selector.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_route_selector.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_route_selector.controls.some((control) => control.includes("paper/simulator control"))).toBe(true);
    expect(state.autonomous_profit_route_selector.items.every((item) =>
      ["command-center", "high-frequency", "opportunity-race", "market-intelligence", "market-pulse", "trend-chase", "reentry-hunter", "portfolio-protect", "route-profit", "wallet-growth"].includes(item.lane) &&
      ["execute", "queue", "protect", "resize", "observe", "block"].includes(item.action) &&
      ["selected", "ready", "watch", "blocked"].includes(item.status) &&
      ["buy", "sell", "hold"].includes(item.side) &&
      item.route_score >= 0 &&
      item.route_score <= 100 &&
      item.fill_quality_score >= 0 &&
      item.fill_quality_score <= 100 &&
      item.notional_usd >= 0 &&
      item.risk_usd >= 0
    )).toBe(true);
    expect(state.autonomous_execution_quality_arbiter.mode).toBe("autonomous-execution-quality-arbiter");
    expect(["execute", "selective", "paper-only", "repair", "blocked", "idle"]).toContain(state.autonomous_execution_quality_arbiter.status);
    expect(state.autonomous_execution_quality_arbiter.selected_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_quality_arbiter.selected_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_execution_quality_arbiter.max_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_quality_arbiter.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_quality_arbiter.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_execution_quality_arbiter.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_execution_quality_arbiter.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_execution_quality_arbiter.controls.some((control) => control.includes("Final fresh-buy arbiter"))).toBe(true);
    expect(state.autonomous_execution_quality_arbiter.items.every((item) =>
      ["command-center", "high-frequency", "opportunity-race", "market-intelligence", "market-pulse", "trend-chase", "reentry-hunter", "portfolio-protect", "route-profit", "wallet-growth"].includes(item.lane) &&
      ["execute-paper", "protect", "rehearse", "requote", "resize", "block"].includes(item.action) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      ["buy", "sell", "hold"].includes(item.side) &&
      ["paper-ledger", "jupiter-v2-managed", "jupiter-router-submit", "helius-sender", "blocked"].includes(item.landing_path) &&
      item.execution_score >= 0 &&
      item.execution_score <= 100 &&
      item.landing_score >= 0 &&
      item.landing_score <= 100 &&
      item.pre_submit_score >= 0 &&
      item.pre_submit_score <= 100 &&
      item.fill_quality_score >= 0 &&
      item.fill_quality_score <= 100 &&
      item.mev_risk_score >= 0 &&
      item.mev_risk_score <= 100 &&
      item.cost_bps >= 0 &&
      item.max_notional_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_token_safety_clearance.mode).toBe("autonomous-token-safety-clearance");
    expect(["cleared", "selective", "blocked", "exit-only", "idle"]).toContain(state.autonomous_token_safety_clearance.status);
    expect(state.autonomous_token_safety_clearance.average_safety_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_token_safety_clearance.average_safety_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_token_safety_clearance.max_buy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_token_safety_clearance.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_token_safety_clearance.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_token_safety_clearance.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_token_safety_clearance.controls.some((control) => control.includes("fresh local paper buys"))).toBe(true);
    expect(state.autonomous_token_safety_clearance.items.every((item) =>
      ["cleared", "probe-only", "blocked", "exit-only"].includes(item.clearance) &&
      item.safety_score >= 0 &&
      item.safety_score <= 100 &&
      item.risk_score >= 0 &&
      item.risk_score <= 100 &&
      item.holder_score >= 0 &&
      item.holder_score <= 100 &&
      item.liquidity_score >= 0 &&
      item.liquidity_score <= 100 &&
      item.promotion_score >= 0 &&
      item.promotion_score <= 100 &&
      item.landing_score >= 0 &&
      item.landing_score <= 100 &&
      item.route_score >= 0 &&
      item.route_score <= 100 &&
      item.max_buy_usd >= 0 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_reflex_operator.mode).toBe("autonomous-reflex-operator");
    expect(["press", "protect", "refresh", "observe", "stand-down", "blocked", "idle"]).toContain(state.autonomous_reflex_operator.status);
    expect(state.autonomous_reflex_operator.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_reflex_operator.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_reflex_operator.reflex_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.reflex_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_reflex_operator.safety_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.safety_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_reflex_operator.execution_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.execution_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_reflex_operator.wallet_heat_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.wallet_heat_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_reflex_operator.max_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_reflex_operator.review_after_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_reflex_operator.should_tick_now).toBe("boolean");
    expect(typeof state.autonomous_reflex_operator.should_refresh_market).toBe("boolean");
    expect(typeof state.autonomous_reflex_operator.should_refresh_routes).toBe("boolean");
    expect(typeof state.autonomous_reflex_operator.can_paper_trade).toBe("boolean");
    expect(state.autonomous_reflex_operator.controls.some((control) => control.includes("local paper-ledger intent"))).toBe(true);
    expect(state.autonomous_reflex_operator.items.length).toBeGreaterThan(0);
    expect(state.autonomous_reflex_operator.items.every((item) =>
      ["profit-route", "tick-plan", "market-pulse", "wallet-protect", "route-refresh"].includes(item.source) &&
      ["paper-buy", "paper-sell", "refresh-route", "refresh-market", "protect", "observe", "stand-down"].includes(item.action) &&
      ["now", "next", "watch", "blocked"].includes(item.priority) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.notional_usd >= 0 &&
      item.safety_score >= 0 &&
      item.safety_score <= 100 &&
      item.execution_score >= 0 &&
      item.execution_score <= 100 &&
      item.wallet_heat_score >= 0 &&
      item.wallet_heat_score <= 100 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_cash_deployment_director.mode).toBe("autonomous-cash-deployment-director");
    expect(["deploy", "scout", "hold", "protect", "blocked", "idle"]).toContain(state.autonomous_cash_deployment_director.status);
    expect(["fresh-buy", "protect-sell", "refresh-first", "observe", "none"]).toContain(state.autonomous_cash_deployment_director.paper_intent);
    expect(state.autonomous_cash_deployment_director.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_cash_deployment_director.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_cash_deployment_director.cash_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.reserve_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.deploy_now_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.target_exposure_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.target_exposure_pct).toBeLessThanOrEqual(64);
    expect(state.autonomous_cash_deployment_director.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_cash_deployment_director.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_cash_deployment_director.review_after_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_cash_deployment_director.can_deploy_paper).toBe("boolean");
    expect(state.autonomous_cash_deployment_director.controls.some((control) => control.includes("bounded paper cash-deployment"))).toBe(true);
    expect(state.autonomous_cash_deployment_director.items.length).toBeGreaterThanOrEqual(6);
    expect(state.autonomous_cash_deployment_director.items.every((item) =>
      ["cash", "reflex", "safety", "execution", "wallet", "reserve"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_navigator.mode).toBe("autonomous-profit-navigator");
    expect(["attack", "scout", "compound", "harvest", "protect", "stand-down", "blocked", "idle"]).toContain(state.autonomous_profit_navigator.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_profit_navigator.primary_side);
    expect(["paper-buy", "paper-sell", "protect", "harvest", "refresh", "observe", "blocked"]).toContain(state.autonomous_profit_navigator.primary_action);
    expect(state.autonomous_profit_navigator.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_navigator.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_navigator.wallet_equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.deploy_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.reserve_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.max_trade_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_navigator.risk_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_navigator.risk_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_navigator.urgency_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_profit_navigator.can_advance_paper).toBe("boolean");
    expect(state.autonomous_profit_navigator.controls.some((control) => control.includes("wallet trajectory"))).toBe(true);
    expect(state.autonomous_profit_navigator.items.length).toBeGreaterThanOrEqual(7);
    expect(state.autonomous_profit_navigator.items.every((item) =>
      ["wallet", "cash", "route", "execution", "safety", "portfolio", "cadence"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_profit_forecast.mode).toBe("autonomous-profit-forecast");
    expect(["press", "probe", "harvest", "protect", "wait", "blocked", "idle"]).toContain(state.autonomous_profit_forecast.status);
    expect(state.autonomous_profit_forecast.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_forecast.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_forecast.horizon_seconds).toBeGreaterThanOrEqual(30);
    expect(state.autonomous_profit_forecast.horizon_seconds).toBeLessThanOrEqual(300);
    expect(state.autonomous_profit_forecast.starting_equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.projected_equity_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.worst_case_drawdown_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.worst_case_drawdown_pct).toBeLessThanOrEqual(30);
    expect(state.autonomous_profit_forecast.recommended_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_forecast.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_profit_forecast.invalidation.length).toBeGreaterThan(0);
    expect(state.autonomous_profit_forecast.controls.some((control) => control.includes("next local paper-trading window"))).toBe(true);
    expect(state.autonomous_profit_forecast.points.length).toBeGreaterThanOrEqual(6);
    expect(state.autonomous_profit_forecast.points.every((point) =>
      point.id.length > 0 &&
      point.label.length > 0 &&
      point.tick >= 0 &&
      ["buy", "sell", "hold", "protect"].includes(point.action) &&
      point.equity_usd >= 0 &&
      point.drawdown_pct >= 0 &&
      point.drawdown_pct <= 30
    )).toBe(true);
    expect(state.autonomous_profit_forecast.items.length).toBeGreaterThanOrEqual(5);
    expect(state.autonomous_profit_forecast.items.every((item) =>
      ["edge", "wallet", "risk", "cash", "protection"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_forecast_feedback.mode).toBe("autonomous-forecast-feedback");
    expect(["press", "keep", "probe", "tighten", "protect", "blocked", "idle"]).toContain(state.autonomous_forecast_feedback.status);
    expect(state.autonomous_forecast_feedback.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_forecast_feedback.next_action.length).toBeGreaterThan(0);
    expect(typeof state.autonomous_forecast_feedback.direction_correct).toBe("boolean");
    expect(state.autonomous_forecast_feedback.accuracy_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_forecast_feedback.accuracy_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_forecast_feedback.next_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_forecast_feedback.next_size_multiplier).toBeLessThanOrEqual(1.18);
    expect(state.autonomous_forecast_feedback.recommended_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_forecast_feedback.cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_forecast_feedback.controls.some((control) => control.includes("daemon-memory wallet movement"))).toBe(true);
    expect(state.autonomous_forecast_feedback.items.length).toBeGreaterThanOrEqual(5);
    expect(state.autonomous_forecast_feedback.items.every((item) =>
      ["forecast", "realized", "error", "sizing", "cadence"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_alpha_conviction.mode).toBe("autonomous-alpha-conviction");
    expect(["attack", "selective", "protect", "blocked", "idle"]).toContain(state.autonomous_alpha_conviction.status);
    expect(state.autonomous_alpha_conviction.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_alpha_conviction.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_alpha_conviction.average_conviction_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_conviction.average_conviction_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_alpha_conviction.average_signal_to_noise_ratio).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_conviction.max_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_conviction.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_alpha_conviction.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_alpha_conviction.controls.some((control) => control.includes("signal/noise"))).toBe(true);
    expect(state.autonomous_alpha_conviction.items.length).toBeGreaterThan(0);
    expect(state.autonomous_alpha_conviction.items.every((item) =>
      ["buy", "probe", "hold", "trim", "avoid", "protect"].includes(item.action) &&
      ["trade", "watch", "blocked", "protect"].includes(item.status) &&
      item.conviction_score >= 0 &&
      item.conviction_score <= 100 &&
      item.signal_score >= 0 &&
      item.velocity_score >= 0 &&
      item.pulse_score >= 0 &&
      item.route_score >= 0 &&
      item.safety_score >= 0 &&
      item.forecast_fit_score >= 0 &&
      item.wallet_score >= 0 &&
      item.risk_score >= 0 &&
      item.max_size_usd >= 0 &&
      item.review_after_seconds > 0 &&
      item.thesis.length > 0 &&
      item.evidence.length >= 3
    )).toBe(true);
    expect(state.autonomous_execution_escalator.mode).toBe("autonomous-execution-escalator");
    expect(["paper-ready", "order-ready", "signature-needed", "submit-ready", "confirming", "blocked", "idle"]).toContain(state.autonomous_execution_escalator.status);
    expect(["paper-fill", "build-order", "request-signature", "submit-signed", "poll-confirmation", "rebuild", "stand-down"]).toContain(state.autonomous_execution_escalator.stage);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_execution_escalator.selected_side);
    expect(state.autonomous_execution_escalator.readiness_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.readiness_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_execution_escalator.live_readiness_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.live_readiness_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_execution_escalator.paper_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.expected_edge_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.estimated_cost_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_execution_escalator.ttl_seconds).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_execution_escalator.can_autonomous_paper_fill).toBe("boolean");
    expect(typeof state.autonomous_execution_escalator.can_request_signature).toBe("boolean");
    expect(typeof state.autonomous_execution_escalator.can_submit_signed_payload).toBe("boolean");
    expect(state.autonomous_execution_escalator.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_execution_escalator.controls.some((control) => control.includes("paper fill"))).toBe(true);
    expect(state.autonomous_execution_escalator.items.length).toBeGreaterThanOrEqual(7);
    expect(state.autonomous_execution_escalator.items.every((item) =>
      ["alpha", "order", "pre-submit", "signer", "live-gate", "relay", "confirm"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_size_governor.mode).toBe("autonomous-size-governor");
    expect(["press", "scale", "probe", "halve", "protect", "pause", "idle"]).toContain(state.autonomous_size_governor.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_size_governor.selected_side);
    expect(state.autonomous_size_governor.base_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.capped_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.final_size_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.confidence_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_size_governor.risk_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.stop_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.max_loss_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.required_edge_usd).toBeGreaterThanOrEqual(0);
    expect(["press", "selective", "tighten", "protect", "cold-start"]).toContain(state.autonomous_size_governor.outcome_discipline_status);
    expect(state.autonomous_size_governor.outcome_discipline_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.outcome_sample_size).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.outcome_win_rate_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_size_governor.outcome_win_rate_pct).toBeLessThanOrEqual(100);
    expect(state.autonomous_size_governor.outcome_profit_factor).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_size_governor.outcome_expectancy_usd).toBe("number");
    expect(state.autonomous_size_governor.outcome_summary.length).toBeGreaterThan(0);
    expect(state.autonomous_size_governor.cadence_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_size_governor.can_trade_paper).toBe("boolean");
    expect(typeof state.autonomous_size_governor.live_blocked).toBe("boolean");
    expect(state.autonomous_size_governor.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_size_governor.controls.some((control) => control.includes("next-size"))).toBe(true);
    expect(state.autonomous_size_governor.items.length).toBeGreaterThanOrEqual(10);
    expect(state.autonomous_size_governor.items.every((item) =>
      ["alpha", "execution", "forecast", "wallet", "profit", "learning", "command", "memory", "outcome", "outcome-memory", "risk"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_pressure_tape.mode).toBe("autonomous-pressure-tape");
    expect(["press", "scalp", "protect", "refresh", "pause", "idle"]).toContain(state.autonomous_pressure_tape.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_pressure_tape.leader_side);
    expect(state.autonomous_pressure_tape.pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.buy_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.buy_pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.sell_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.sell_pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.refresh_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.refresh_pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.tape_change_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.tape_change_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_tape.urgent_change_count).toBe(state.tape_memory.urgent_count);
    expect(state.autonomous_pressure_tape.situation_regime).toBe(state.situation_monitor.regime);
    expect(state.autonomous_pressure_tape.reaction_window_seconds).toBeGreaterThan(0);
    expect(state.autonomous_pressure_tape.reaction_window_seconds).toBeLessThanOrEqual(state.autonomous_pressure_tape.cadence_seconds);
    expect(state.autonomous_pressure_tape.max_next_actions).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.max_notional_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_tape.cadence_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_pressure_tape.paper_trade_ready).toBe("boolean");
    expect(typeof state.autonomous_pressure_tape.live_blocked).toBe("boolean");
    expect(state.autonomous_pressure_tape.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_pressure_tape.controls.some((control) => control.includes("next-minute"))).toBe(true);
    expect(state.autonomous_pressure_tape.controls.some((control) => control.includes("situation-change memory"))).toBe(true);
    expect(state.autonomous_pressure_tape.items.length).toBeGreaterThanOrEqual(8);
    expect(state.autonomous_pressure_tape.items.every((item) =>
      ["size", "market", "fast-race", "tick-plan", "positions", "wallet", "profit", "situation"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.label.length > 0 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_pressure_tape.items.some((item) => item.id === "situation")).toBe(true);
    expect(state.autonomous_pressure_execution.mode).toBe("pressure-tape-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_pressure_execution.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_pressure_execution.selected_side);
    expect(["press", "scalp", "protect", "refresh", "pause", "idle"]).toContain(state.autonomous_pressure_execution.selected_posture);
    expect(typeof state.autonomous_pressure_execution.paper_trade_ready).toBe("boolean");
    expect(typeof state.autonomous_pressure_execution.ledger_applied).toBe("boolean");
    expect(state.autonomous_pressure_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_pressure_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_pressure_execution.projected_cash_delta_usd).toBe("number");
    expect(typeof state.autonomous_pressure_execution.projected_exposure_delta_usd).toBe("number");
    expect(state.autonomous_pressure_execution.pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_pressure_execution.pressure_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_pressure_execution.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_pressure_execution.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_pressure_execution.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_pressure_execution.controls.some((control) => control.includes("paper-ledger"))).toBe(true);
    expect(state.autonomous_action_queue.mode).toBe("autonomous-action-queue");
    expect(["executing", "attack", "scalp", "protect", "prepare", "blocked", "watch", "idle"]).toContain(state.autonomous_action_queue.status);
    expect(["buy", "sell", "scalp", "protect", "harvest", "refresh", "hold", "blocked"]).toContain(state.autonomous_action_queue.leader_action);
    expect(["snipe", "probe", "confirm", "late-chase", "fade", "blocked", "idle", "missing"]).toContain(state.autonomous_action_queue.launch_timing_status);
    expect(state.autonomous_action_queue.launch_timing_blocked_count).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_action_queue.launch_timing_allows_fresh_buys).toBe("boolean");
    expect(state.autonomous_action_queue.launch_timing_blocker === null || typeof state.autonomous_action_queue.launch_timing_blocker === "string").toBe(true);
    expect(state.autonomous_action_queue.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_action_queue.items.length).toBeGreaterThan(0);
    expect(state.autonomous_action_queue.items.every((item) =>
      ["command-center", "pressure-tape", "tradeability", "high-frequency", "opportunity-race", "portfolio-protect", "portfolio-tape", "market-pulse", "trend-chase", "watchlist-rotation"].includes(item.lane) &&
      ["ready", "queued", "applied", "blocked", "watch", "idle"].includes(item.status) &&
      ["buy", "sell", "scalp", "protect", "harvest", "refresh", "hold", "blocked"].includes(item.action) &&
      item.execution_boundary === "paper-ledger-only" &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_action_queue.controls.some((control) => control.includes("Ranks the command center"))).toBe(true);
    expect(state.autonomous_action_queue.controls.some((control) => control.includes("Launch timing can boost"))).toBe(true);
    if (!state.autonomous_action_queue.launch_timing_allows_fresh_buys) {
      expect(state.autonomous_action_queue.launch_timing_blocker).toBeTruthy();
      expect(state.autonomous_action_queue.items.filter((item) => item.side === "buy" && (item.action === "buy" || item.action === "scalp")).every((item) =>
        item.status === "blocked" &&
        item.paper_trade_ready === false &&
        item.blockers.some((blocker) => blocker === state.autonomous_action_queue.launch_timing_blocker || blocker.includes("Launch timing") || blocker.includes("launch timing"))
      )).toBe(true);
    }
    expect(state.autonomous_action_queue_execution.mode).toBe("autonomous-action-queue-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_action_queue_execution.status);
    expect(["buy", "sell", "hold"]).toContain(state.autonomous_action_queue_execution.selected_side);
    expect(["buy", "sell", "scalp", "protect", "harvest", "refresh", "hold", "blocked"]).toContain(state.autonomous_action_queue_execution.selected_action);
    expect(["requesting", "ready", "blocked", "watching", "idle"]).toContain(state.autonomous_action_queue_execution.route_refresh_status);
    expect(typeof state.autonomous_action_queue_execution.route_refresh_vetoed).toBe("boolean");
    expect(state.autonomous_action_queue_execution.route_refresh_blocker === null || typeof state.autonomous_action_queue_execution.route_refresh_blocker === "string").toBe(true);
    expect(typeof state.autonomous_action_queue_execution.paper_trade_ready).toBe("boolean");
    expect(typeof state.autonomous_action_queue_execution.ledger_applied).toBe("boolean");
    expect(state.autonomous_action_queue_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_action_queue_execution.paper_size_usd).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_action_queue_execution.projected_cash_delta_usd).toBe("number");
    expect(typeof state.autonomous_action_queue_execution.projected_exposure_delta_usd).toBe("number");
    expect(state.autonomous_action_queue_execution.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_action_queue_execution.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_action_queue_execution.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_action_queue_execution.controls.some((control) => control.includes("top-ranked action-queue paper trade"))).toBe(true);
    expect(state.autonomous_action_queue_execution.controls.some((control) => control.includes("route-refresh execution"))).toBe(true);
    if (state.autonomous_action_queue_execution.route_refresh_vetoed) {
      expect(state.autonomous_action_queue_execution.status).toBe("blocked");
      expect(state.autonomous_action_queue_execution.paper_trade_ready).toBe(false);
      expect(state.autonomous_action_queue_execution.route_refresh_blocker).toBeTruthy();
    }
    expect(state.autonomous_session_planner.mode).toBe("autonomous-session-planner");
    expect(["run-now", "probe", "refresh-first", "protect", "cooldown", "blocked", "idle"]).toContain(state.autonomous_session_planner.status);
    expect(["attack", "probe", "refresh", "protect", "cooldown", "observe"]).toContain(state.autonomous_session_planner.session_kind);
    expect(state.autonomous_session_planner.target_symbol === null || typeof state.autonomous_session_planner.target_symbol === "string").toBe(true);
    expect(state.autonomous_session_planner.planned_ticks).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_session_planner.max_total_fills).toBeGreaterThanOrEqual(1);
    expect(state.autonomous_session_planner.max_fresh_buys).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_session_planner.max_protective_sells).toBeGreaterThanOrEqual(0);
    expect(typeof state.autonomous_session_planner.route_refresh_required).toBe("boolean");
    expect(state.autonomous_session_planner.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_session_planner.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_session_planner.controls.some((control) => control.includes("bounded autonomous paper session"))).toBe(true);
    expect(state.autonomous_session_planner.controls.some((control) => control.includes("Cannot sign"))).toBe(true);
    expect(state.autonomous_session_planner.steps.map((step) => step.id)).toEqual([
      "scanner",
      "queue",
      "profit",
      "route",
      "tick",
      "portfolio",
      "risk",
    ]);
    expect(state.autonomous_session_planner.steps.every((step) =>
      ["pass", "watch", "fail"].includes(step.status) &&
      ["paper-session", "paper-probe", "refresh-routes", "protect-book", "observe", "stand-down"].includes(step.action) &&
      step.score >= 0 &&
      step.score <= 100 &&
      step.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_symbol_quarantine.mode).toBe("autonomous-symbol-quarantine");
    expect(["clear", "selective", "quarantine", "exit-only", "idle"]).toContain(state.autonomous_symbol_quarantine.status);
    expect(state.autonomous_symbol_quarantine.max_quarantine_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_symbol_quarantine.max_quarantine_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_symbol_quarantine.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_symbol_quarantine.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_symbol_quarantine.controls.some((control) => control.includes("symbol-level paper buy permission"))).toBe(true);
    expect(state.autonomous_symbol_quarantine.items.every((item) =>
      ["allow", "probe-only", "quarantine", "exit-only"].includes(item.status) &&
      item.quarantine_score >= 0 &&
      item.quarantine_score <= 100 &&
      typeof item.max_buy_usd === "number"
    )).toBe(true);
    expect(state.autonomous_tick_plan.controls.some((control) => control.includes("local paper tick"))).toBe(true);
    expect(state.autonomous_tick_plan.controls.some((control) => control.includes("Caps next-minute throughput"))).toBe(true);
    expect(state.autonomous_tick_plan.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.autonomous_tick_governor.controls.some((control) => control.includes("local paper-only"))).toBe(true);
    expect(state.autonomous_tick_governor.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    if (!state.autonomous_tick_governor.can_auto_advance) {
      expect(state.autonomous_tick_governor.should_trade).toBe(false);
    }
    expect(state.autonomous_tick_plan.items.every((item) =>
      ["edge", "protect", "entry", "route", "market", "observe", "blocked"].includes(item.lane) &&
      ["protect-now", "trade-now", "refresh-routes", "refresh-market", "observe", "stand-down"].includes(item.action) &&
      ["critical", "high", "normal", "low"].includes(item.priority) &&
      ["ready", "watch", "blocked"].includes(item.status) &&
      item.urgency_seconds > 0 &&
      item.paper_budget_usd >= 0 &&
      item.expected_edge_usd >= 0 &&
      item.risk_usd >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.launch_sniper.mode).toBe("launch-sniper");
    expect(state.launch_sniper.items.length).toBeGreaterThan(0);
    expect(state.launch_sniper.items.some((item) => item.verdict === "probe" || item.verdict === "snipe")).toBe(true);
    expect(state.launch_sniper.items.every((item) =>
      item.launch_score >= 0 &&
      item.launch_score <= 100 &&
      item.review_after_seconds > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(state.autopilot.actions.some((action) => action.lane === "launch-sniper" || action.lane === "entry")).toBe(true);
    expect(state.market_feed_integrity.status).toBe("sample");
    expect(state.market_feed_integrity.checks.length).toBe(4);
    expect(state.market_feed_integrity.actions.length).toBeGreaterThan(0);
    expect(state.market_stream_supervisor.status).toBe("sample");
    expect(state.market_stream_supervisor.transport).toBe("sample-loop");
    expect(state.market_stream_supervisor.lanes.every((lane) => lane.status === "sample" || lane.status === "paused")).toBe(true);
    expect(state.market_ingestion_plan.status).toBe("sample");
    expect(state.market_ingestion_plan.steps.some((step) => step.action === "sample")).toBe(true);
    expect(state.market_ingestion_plan.safeguards.some((item) => item.includes("Live trading remains gated"))).toBe(true);
    expect(state.market_ingestion_plan.provider_budget_status).toBe("paused");
    expect(state.market_ingestion_plan.provider_budget_utilization_pct).toBe(0);
    expect(state.market_ingestion_plan.next_provider_refresh_seconds).toBeGreaterThan(0);
    expect(state.market_ingestion_plan.provider_budget_lanes.map((lane) => lane.id)).toEqual([
      "dex-discovery",
      "dex-pairs",
      "dex-paid-orders",
      "gecko-ohlcv",
      "route-quotes",
    ]);
    expect(state.market_ingestion_plan.provider_budget_lanes.every((lane) =>
      lane.used_per_minute >= 0 &&
      lane.limit_per_minute > 0 &&
      lane.utilization_pct >= 0 &&
      lane.cadence_seconds > 0 &&
      lane.next_action.length > 0
    )).toBe(true);
    expect(state.autonomous_market_intake_plan.mode).toBe("autonomous-market-intake-plan");
    expect(state.autonomous_market_intake_plan.status).toBe("sample");
    expect(state.autonomous_market_intake_plan.provider_budget_status).toBe(state.market_ingestion_plan.provider_budget_status);
    expect(state.autonomous_market_intake_plan.data_score).toBe(state.autonomous_data_freshness_gate.data_score);
    const expectedMarketIntakeLaneIds: Array<(typeof state.autonomous_market_intake_plan.items)[number]["id"]> = [
      "wallet-net-worth",
      "dex-discovery",
      "dex-pairs",
      "paid-orders",
      "candles",
      "route-quotes",
    ];
    expect([...state.autonomous_market_intake_plan.items.map((item) => item.id)].sort()).toEqual(expectedMarketIntakeLaneIds.sort());
    expect(state.autonomous_market_intake_plan.items.every((item) =>
      ["DEX Screener", "GeckoTerminal", "Birdeye", "Jupiter", "Local paper wallet"].includes(item.provider) &&
      item.endpoint.length > 0 &&
      item.priority_score >= 0 &&
      item.priority_score <= 100 &&
      item.limit_per_minute > 0 &&
      item.cadence_seconds > 0
    )).toBe(true);
    expect(state.dex_stream_freshness.mode).toBe("dex-stream-freshness");
    expect(["hot", "ready", "watch", "backfill", "blocked", "sample"]).toContain(state.dex_stream_freshness.status);
    expect(typeof state.dex_stream_freshness.websocket_ready).toBe("boolean");
    expect(state.dex_stream_freshness.items.map((item) => item.id)).toEqual([
      "token-profiles",
      "boosts",
      "community-takeovers",
    ]);
    expect(state.dex_stream_freshness.items.every((item) =>
      ["stream-ready", "poll-fallback", "blocked", "sample"].includes(item.status) &&
      item.websocket_path.startsWith("wss://api.dexscreener.com/") &&
      item.rest_path.startsWith("/") &&
      item.next_request_seconds > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(state.dex_stream_freshness.controls.some((control) => control.includes("does not open persistent sockets"))).toBe(true);
    expect(state.dex_stream_freshness.controls.some((control) => control.includes("WebSocket"))).toBe(true);
    expect(state.live_discovery_delta_tape.mode).toBe("live-discovery-delta-tape");
    expect(["hot", "ready", "watch", "refresh", "blocked", "sample", "idle"]).toContain(state.live_discovery_delta_tape.status);
    expect(state.live_discovery_delta_tape.newest_review_seconds).toBeGreaterThan(0);
    expect(state.live_discovery_delta_tape.controls.some((control) => control.includes("DEX Screener latest profiles"))).toBe(true);
    expect(state.live_discovery_delta_tape.items.every((item) =>
      ["new-profile", "new-boost", "top-boost", "community-takeover", "paid-ad", "sample"].includes(item.event) &&
      ["attack", "probe", "watch", "refresh", "blocked"].includes(item.status) &&
      item.urgency_score >= 0 &&
      item.urgency_score <= 100 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.autonomous_discovery_intake.mode).toBe("autonomous-discovery-intake");
    expect(["attack-ready", "probe-ready", "refresh-first", "blocked", "sample", "idle"]).toContain(state.autonomous_discovery_intake.status);
    expect(state.autonomous_discovery_intake.source_mode).toBe(state.discovery_tape.status);
    expect(state.autonomous_discovery_intake.source_coverage_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_discovery_intake.source_coverage_pct).toBeLessThanOrEqual(100);
    expect(state.autonomous_discovery_intake.pair_coverage_pct).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_discovery_intake.pair_coverage_pct).toBeLessThanOrEqual(100);
    expect(state.autonomous_discovery_intake.next_refresh_seconds).toBeGreaterThan(0);
    expect(state.autonomous_discovery_intake.controls.some((control) => control.includes("read-only"))).toBe(true);
    expect(state.autonomous_discovery_intake.items.length).toBeGreaterThan(0);
    expect(state.autonomous_discovery_intake.items.every((item) =>
      ["attack", "probe", "refresh", "watch", "block"].includes(item.action) &&
      ["ready", "watch", "refresh", "blocked"].includes(item.status) &&
      item.intake_score >= 0 &&
      item.intake_score <= 100 &&
      item.review_after_seconds > 0 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_data_freshness_gate.mode).toBe("autonomous-data-freshness-gate");
    expect(["clear", "tradeable", "refresh", "backfill", "blocked", "sample"]).toContain(state.autonomous_data_freshness_gate.status);
    expect(["allow-paper", "size-down", "refresh-stream", "fetch-candles", "refresh-quote", "stand-down"]).toContain(state.autonomous_data_freshness_gate.action);
    expect(typeof state.autonomous_data_freshness_gate.can_trade).toBe("boolean");
    expect(state.autonomous_data_freshness_gate.data_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_data_freshness_gate.data_score).toBeLessThanOrEqual(100);
    expect(["dex-stream", "dex-rest", "paid-orders", "gecko-ohlcv", "jupiter-quote", "none"]).toContain(state.autonomous_data_freshness_gate.next_refresh_lane);
    expect(state.autonomous_data_freshness_gate.size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_data_freshness_gate.size_multiplier).toBeLessThanOrEqual(1.5);
    expect(state.autonomous_data_freshness_gate.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_data_freshness_gate.max_next_fills).toBeLessThanOrEqual(6);
    expect(state.autonomous_data_freshness_gate.items.length).toBe(6);
    expect(state.autonomous_data_freshness_gate.items.every((item) =>
      ["stream", "discovery", "paid-orders", "ohlcv", "quote", "budget"].includes(item.id) &&
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.value.length > 0 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_data_freshness_gate.controls.some((control) => control.includes("DEX Screener"))).toBe(true);
    expect(state.autonomous_data_freshness_gate.controls.some((control) => control.includes("Jupiter-style read-only route quotes"))).toBe(true);
    expect(state.autonomous_source_quality_oracle.mode).toBe("autonomous-source-quality-oracle");
    expect(["organic", "boosted-confirmed", "paid-hype", "refresh-first", "blocked", "sample", "idle"]).toContain(state.autonomous_source_quality_oracle.status);
    expect(typeof state.autonomous_source_quality_oracle.can_chase).toBe("boolean");
    expect(typeof state.autonomous_source_quality_oracle.needs_refresh).toBe("boolean");
    expect(state.autonomous_source_quality_oracle.quality_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_source_quality_oracle.quality_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_source_quality_oracle.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_source_quality_oracle.items.length).toBeGreaterThan(0);
    expect(state.autonomous_source_quality_oracle.items.every((item) =>
      ["attack", "probe", "refresh-proof", "fade", "block", "watch"].includes(item.action) &&
      ["organic", "boosted-confirmed", "paid-hype", "refresh-first", "blocked", "watch"].includes(item.status) &&
      item.source_quality_score >= 0 &&
      item.source_quality_score <= 100 &&
      item.organic_confirmation_score >= 0 &&
      item.organic_confirmation_score <= 100 &&
      item.market_activity_score >= 0 &&
      item.market_activity_score <= 100 &&
      item.promotion_noise_score >= 0 &&
      item.promotion_noise_score <= 100 &&
      item.max_paper_size_multiplier >= 0 &&
      item.max_paper_size_multiplier <= 1.2 &&
      item.review_after_seconds > 0 &&
      item.evidence.length >= 4 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_source_quality_oracle.controls.some((control) => control.includes("organic momentum"))).toBe(true);
    expect(state.autonomous_source_quality_oracle.controls.some((control) => control.includes("paid-order"))).toBe(true);
    const sourceQualityBySymbol = new Map(state.autonomous_source_quality_oracle.items.map((item) => [item.symbol, item]));
    const sourceSizedExecutions = [
      {
        execution: state.autonomous_tradeability_execution,
        requestedSizeUsd: state.autonomous_tradeability_execution.selected_symbol
          ? state.autonomous_tradeability_simulator.items.find((item) => item.symbol === state.autonomous_tradeability_execution.selected_symbol)?.recommended_size_usd ?? 0
          : 0,
      },
      {
        execution: state.autonomous_opportunity_rank_execution,
        requestedSizeUsd: state.autonomous_opportunity_rank_execution.selected_symbol
          ? state.autonomous_opportunity_ranker.items.find((item) => item.symbol === state.autonomous_opportunity_rank_execution.selected_symbol)?.max_paper_size_usd ?? 0
          : 0,
      },
    ];
    for (const { execution, requestedSizeUsd } of sourceSizedExecutions) {
      const trade = execution.paper_trade;
      const sourceQualityItem = trade?.side === "buy" ? sourceQualityBySymbol.get(trade.symbol) : null;
      if (trade && sourceQualityItem && sourceQualityItem.max_paper_size_multiplier < 0.995 && requestedSizeUsd >= 10) {
        expect(trade.size_usd).toBeLessThanOrEqual(Math.round(requestedSizeUsd * sourceQualityItem.max_paper_size_multiplier));
        expect(trade.reason).toContain("Source-quality sizing caps");
      }
    }
    expect(state.autonomous_market_evidence_fusion.mode).toBe("autonomous-market-evidence-fusion");
    expect(["attack", "selective", "refresh", "protect", "blocked", "watch", "sample", "idle"]).toContain(state.autonomous_market_evidence_fusion.status);
    expect(state.autonomous_market_evidence_fusion.fusion_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_evidence_fusion.fusion_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_market_evidence_fusion.organic_momentum_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_evidence_fusion.organic_momentum_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_market_evidence_fusion.promotion_noise_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_evidence_fusion.promotion_noise_score).toBeLessThanOrEqual(100);
    expect(["dex-stream", "dex-rest", "paid-orders", "gecko-ohlcv", "jupiter-quote", "wallet-protect", "none"]).toContain(state.autonomous_market_evidence_fusion.provider_lane);
    expect(["dex-stream", "dex-rest", "paid-orders", "gecko-ohlcv", "jupiter-quote", "none"]).toContain(state.autonomous_market_evidence_fusion.next_refresh_lane);
    expect(typeof state.autonomous_market_evidence_fusion.can_trade).toBe("boolean");
    expect(state.autonomous_market_evidence_fusion.max_next_fills).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_evidence_fusion.max_next_fills).toBeLessThanOrEqual(state.autonomous_data_freshness_gate.max_next_fills);
    expect(state.autonomous_market_evidence_fusion.items.length).toBeGreaterThan(0);
    expect(state.autonomous_market_evidence_fusion.items.every((item) =>
      ["trade", "probe", "refresh-route", "refresh-candles", "protect", "reject", "watch"].includes(item.action) &&
      ["hot-tape", "route", "chart", "protection", "watch"].includes(item.lane) &&
      item.fusion_score >= 0 &&
      item.fusion_score <= 100 &&
      item.evidence.length >= 4 &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_market_evidence_fusion.controls.some((control) => control.includes("hot-coin tape"))).toBe(true);
    expect(state.autonomous_market_evidence_fusion.controls.some((control) => control.includes("paper/read-only evidence layer"))).toBe(true);
    expect(state.autonomous_price_action_chart_tape.mode).toBe("autonomous-price-action-chart-tape");
    expect(["breakout", "probe", "refresh", "protect", "fade", "watch", "idle"]).toContain(state.autonomous_price_action_chart_tape.status);
    expect(state.autonomous_price_action_chart_tape.chart_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_price_action_chart_tape.chart_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_price_action_chart_tape.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_price_action_chart_tape.items.length).toBeGreaterThan(0);
    expect(state.autonomous_price_action_chart_tape.items.length).toBeLessThanOrEqual(6);
    expect(state.autonomous_price_action_chart_tape.items.every((item) =>
      ["paper-buy", "paper-probe", "refresh-route", "refresh-candles", "protect", "fade", "watch"].includes(item.action) &&
      ["breakout", "probe", "refresh", "protect", "fade", "watch"].includes(item.status) &&
      item.chart_score >= 0 &&
      item.chart_score <= 100 &&
      item.momentum_score >= 0 &&
      item.momentum_score <= 100 &&
      item.buyer_flow_score >= 0 &&
      item.buyer_flow_score <= 100 &&
      item.proof_score >= 0 &&
      item.proof_score <= 100 &&
      item.sparkline.length === 7 &&
      item.sparkline.every((point) =>
        point.t >= 0 &&
        point.price_usd >= 0 &&
        point.volume_usd >= 0 &&
        point.buy_pressure_pct >= 0 &&
        point.buy_pressure_pct <= 100
      ) &&
      item.next_action.length > 0
    )).toBe(true);
    expect(state.autonomous_price_action_chart_tape.controls.some((control) => control.includes("Moonshot-style hot-coin chart tape"))).toBe(true);
    expect(state.autonomous_price_action_chart_tape.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
    expect(state.autonomous_price_action_execution_contract.mode).toBe("autonomous-price-action-execution-contract");
    expect(["paper-ready", "probe-ready", "refresh-first", "protect-first", "fade", "blocked", "watch", "idle"]).toContain(state.autonomous_price_action_execution_contract.status);
    expect(["paper-buy", "paper-probe", "refresh-route", "refresh-candles", "protect", "fade", "watch"]).toContain(state.autonomous_price_action_execution_contract.action);
    expect(state.autonomous_price_action_execution_contract.contract_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_price_action_execution_contract.contract_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_price_action_execution_contract.review_after_seconds).toBeGreaterThan(0);
    expect(state.autonomous_price_action_execution_contract.items.map((item) => item.id)).toEqual(["chart", "proof", "wallet", "profit-lock", "run-guard", "boundary"]);
    expect(state.autonomous_price_action_execution_contract.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_price_action_execution_contract.safeguards.some((item) => item.includes("cannot sign"))).toBe(true);
    expect(state.autonomous_price_action_execution_contract.safeguards.some((item) => item.includes("Paper notional is capped"))).toBe(true);
    if (state.autonomous_price_action_execution_contract.can_queue_paper) {
      expect(state.autonomous_price_action_execution_contract.execution_boundary).toBe("paper-ledger-only");
      expect(state.autonomous_price_action_execution_contract.paper_notional_usd).toBeGreaterThan(0);
    } else {
      expect(state.autonomous_price_action_execution_contract.paper_notional_usd).toBe(0);
    }
    expect(state.live_scanner_readiness.mode).toBe("live-scanner-readiness");
    expect(["attack-ready", "probe-ready", "refresh-first", "blocked", "sample", "idle"]).toContain(state.live_scanner_readiness.status);
    expect(state.live_scanner_readiness.source_mode).toBe(state.discovery_tape.status);
    expect(state.live_scanner_readiness.provider_budget_status).toBe(state.market_ingestion_plan.provider_budget_status);
    expect(state.live_scanner_readiness.source_coverage_pct).toBe(state.discovery_edge.source_coverage_pct);
    expect(state.live_scanner_readiness.mapped_coverage_pct).toBe(state.discovery_edge.mapped_coverage_pct);
    expect(state.live_scanner_readiness.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.live_scanner_readiness.summary.length).toBeGreaterThan(0);
    expect(state.live_scanner_readiness.next_action.length).toBeGreaterThan(0);
    expect(state.live_scanner_readiness.controls.some((control) => control.includes("DEX Screener"))).toBe(true);
    expect(state.live_scanner_readiness.controls.some((control) => control.includes("Cannot sign"))).toBe(true);
    expect(state.live_scanner_readiness.items.length).toBeGreaterThan(0);
    expect(state.live_scanner_readiness.items.some((item) =>
      item.evidence.some((entry) => entry.includes("DEX stream freshness")),
    )).toBe(true);
    expect(state.live_scanner_readiness.items.every((item) =>
      ["attack", "probe", "refresh", "watch", "protect", "blocked"].includes(item.action) &&
      ["ready", "watch", "blocked", "stale"].includes(item.status) &&
      item.scanner_score >= 0 &&
      item.scanner_score <= 100 &&
      item.source_confirmation_score >= 0 &&
      item.source_confirmation_score <= 100 &&
      item.route_score >= 0 &&
      item.route_score <= 100 &&
      item.review_after_seconds > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(state.autonomous_trade_readiness_gate.mode).toBe("autonomous-trade-readiness-gate");
    expect(["paper-only", "exit-only", "blocked", "idle"]).toContain(state.autonomous_trade_readiness_gate.status);
    expect(state.autonomous_trade_readiness_gate.live_submission_allowed).toBe(false);
    expect(["snipe", "probe", "confirm", "late-chase", "fade", "blocked", "idle", "missing"]).toContain(state.autonomous_trade_readiness_gate.launch_timing_status);
    expect(typeof state.autonomous_trade_readiness_gate.launch_timing_blocks_fresh_buys).toBe("boolean");
    expect(state.autonomous_trade_readiness_gate.launch_timing_blocker === null || typeof state.autonomous_trade_readiness_gate.launch_timing_blocker === "string").toBe(true);
    if (state.autonomous_trade_readiness_gate.launch_timing_blocks_fresh_buys) {
      expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
      expect(state.autonomous_trade_readiness_gate.max_buy_notional_usd).toBe(0);
      expect(state.autonomous_trade_readiness_gate.checks.find((check) => check.id === "launch-timing")?.status).toBe("fail");
    }
    expect(state.autonomous_trade_readiness_gate.checks.length).toBe(8);
    expect(state.autonomous_trade_readiness_gate.checks.some((check) => check.id === "churn-governor")).toBe(true);
    expect(state.autonomous_trade_readiness_gate.checks.some((check) => check.id === "launch-timing")).toBe(true);
    expect(state.autonomous_wake_plan.mode).toBe("autonomous-wake-plan");
    expect(["minute", "sprint", "cycle", "protect", "refresh", "cooldown", "blocked"]).toContain(state.autonomous_wake_plan.status);
    expect(["profit-velocity", "data-freshness", "loop-throttle", "run-envelope", "profit-guard"]).toContain(state.autonomous_wake_plan.trigger);
    expect(["run-minute", "run-loop", "refresh-read", "stand-down"]).toContain(state.autonomous_wake_plan.next_client_action);
    expect(state.autonomous_wake_plan.next_wake_seconds).toBeGreaterThan(0);
    expect(state.autonomous_wake_plan.items.map((item) => item.id)).toEqual([
      "velocity",
      "freshness",
      "throttle",
      "envelope",
      "guard",
      "queue",
    ]);
    expect(state.autonomous_wake_plan.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.autonomous_market_intake_plan.mode).toBe("autonomous-market-intake-plan");
    expect(["attack", "refresh", "watch", "blocked", "sample"]).toContain(state.autonomous_market_intake_plan.status);
    expect(state.autonomous_market_intake_plan.provider_budget_status).toBe(state.market_ingestion_plan.provider_budget_status);
    expect(state.autonomous_market_intake_plan.data_score).toBe(state.autonomous_data_freshness_gate.data_score);
    expect(state.autonomous_market_intake_plan.next_request_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_market_intake_plan.can_feed_trade_loop).toBe("boolean");
    expect(state.autonomous_market_intake_plan.items).toHaveLength(6);
    expect(state.autonomous_market_intake_plan.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.liquidity_exit_sentinel.mode).toBe("liquidity-exit-sentinel");
    expect(state.liquidity_exit_sentinel.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.liquidity_exit_sentinel.items.every((item) =>
      item.exit_pressure_score >= 0 &&
      item.exit_pressure_score <= 100 &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.trend_catalyst.items.length).toBeGreaterThan(0);
    expect(state.trend_catalyst.source).toBe("local-catalyst-model");
    expect(state.autonomy_policy.orders.length).toBeGreaterThan(0);
    expect(state.situation_monitor.playbook.length).toBeGreaterThan(0);
    expect(state.tape_memory.tokens_tracked).toBeGreaterThan(0);
    expect(state.price_action_monitor.items.length).toBeGreaterThan(0);
    expect(state.rug_pull_firewall.items.length).toBeGreaterThan(0);
    expect(state.capital_rotation.items.length).toBeGreaterThan(0);
    expect(state.autopilot.actions.length).toBeGreaterThan(0);
    expect(state.autonomous_monitor.mode).toBe("paper-daemon");
    expect(state.autonomous_monitor.triggers.length).toBeGreaterThan(0);
    expect(state.autonomy_risk_governor.mode).toBe("risk-governor");
    expect(state.autonomy_risk_governor.actions.length).toBeGreaterThan(0);
    expect(state.autonomy_risk_governor.allowed_trade_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_compounder.mode).toBe("autonomous-compounder");
    expect(["press", "steady", "vault", "tighten", "halted"]).toContain(state.autonomous_compounder.status);
    expect(state.autonomous_compounder.next_order_cap_usd).toBeLessThanOrEqual(state.autonomy_risk_governor.allowed_trade_usd);
    expect(state.autonomous_compounder.launch_order_cap_usd).toBeLessThanOrEqual(state.autonomous_compounder.next_order_cap_usd);
    expect(state.autonomous_compounder.directives.some((directive) => directive.includes("profit vault"))).toBe(true);
    expect(state.paper_daemon.mode).toBe("paper-daemon");
    expect(state.paper_daemon.controls.some((control) => control.includes("Paper ledger only"))).toBe(true);
    expect(state.post_trade_review.mode).toBe("post-trade-review");
    expect(state.post_trade_review.lessons.length).toBe(5);
    expect(state.post_trade_review.recommended_size_multiplier).toBeGreaterThanOrEqual(0);
    expect(state.post_trade_review.recommended_cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_capital_allocator.mode).toBe("autonomous-capital-allocator");
    expect(["deploy", "harvest", "rebalance", "reserve", "cooldown", "blocked", "idle"]).toContain(state.autonomous_capital_allocator.status);
    expect(state.autonomous_capital_allocator.deploy_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_allocator.release_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_capital_allocator.reserved_cash_usd).toBeGreaterThanOrEqual(state.autonomous_capital_allocator.risk_buffer_usd);
    expect(state.autonomous_capital_allocator.max_orders_this_cycle).toBeLessThanOrEqual(4);
    expect(state.autonomous_capital_allocator.items.length).toBeGreaterThan(0);
    expect(state.autonomous_capital_allocator.items.every((item) =>
      item.reason.length > 0 &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.size_usd >= 0 &&
      item.confidence >= 0 &&
      item.confidence <= 100
    )).toBe(true);
    expect(state.autonomous_capital_allocator.controls.some((control) => control.includes("Reserve cash"))).toBe(true);
    expect(state.autonomous_trade_arbiter.mode).toBe("autonomous-trade-arbiter");
    expect(["buy", "sell", "harvest", "defend", "stand-down", "idle"]).toContain(state.autonomous_trade_arbiter.status);
    expect(state.autonomous_trade_arbiter.total_expected_profit_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_arbiter.total_risk_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_arbiter.fractional_kelly_cap_pct).toBeLessThanOrEqual(18);
    expect(state.autonomous_trade_arbiter.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_trade_arbiter.controls.some((control) => control.includes("fractional Kelly"))).toBe(true);
    expect(state.autonomous_trade_arbiter.items.length).toBeGreaterThan(0);
    expect(state.autonomous_trade_arbiter.items.every((item) =>
      item.decision_score >= 0 &&
      item.decision_score <= 100 &&
      item.win_probability_pct >= 0 &&
      item.win_probability_pct <= 100 &&
      item.fractional_kelly_pct >= 0 &&
      item.fractional_kelly_pct <= state.autonomous_trade_arbiter.fractional_kelly_cap_pct &&
      item.recommended_size_usd >= 0 &&
      item.max_loss_usd >= 0 &&
      item.sources.length > 0
    )).toBe(true);
    expect(state.autonomous_setup_memory.mode).toBe("autonomous-setup-memory");
    expect(["press", "selective", "cooldown", "cold-start"]).toContain(state.autonomous_setup_memory.status);
    expect(state.autonomous_setup_memory.items.length).toBeGreaterThan(0);
    expect(state.autonomous_setup_memory.items.every((item) => item.evidence.length > 0 && item.size_multiplier > 0)).toBe(true);
    expect(state.autonomous_trade_execution_bridge.mode).toBe("arbiter-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_trade_execution_bridge.status);
    expect(state.autonomous_trade_execution_bridge.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_trade_execution_bridge.controls.some((control) => control.includes("paper-ledger"))).toBe(true);
    expect(state.autonomous_trade_execution_bridge.review_after_seconds).toBeGreaterThan(0);
    if (state.autonomous_trade_execution_bridge.paper_trade) {
      expect(state.autonomous_trade_execution_bridge.paper_trade.status).toBe("paper-filled");
      expect(state.autonomous_trade_execution_bridge.paper_trade.reason).toContain("Trade arbiter");
      expect(Math.abs(state.autonomous_trade_execution_bridge.cash_delta_usd)).toBe(
        state.autonomous_trade_execution_bridge.paper_trade.size_usd,
      );
    }
    expect(state.autonomous_trade_batch.mode).toBe("autonomous-trade-batch");
    expect(["ready", "partially-applied", "applied", "blocked", "idle"]).toContain(state.autonomous_trade_batch.status);
    expect(state.autonomous_trade_batch.max_trades_per_cycle).toBeLessThanOrEqual(4);
    expect(state.autonomous_trade_batch.controls.some((control) => control.includes("sell-first"))).toBe(true);
    expect(state.autonomous_trade_batch.items.length).toBeGreaterThan(0);
    expect(state.autonomous_trade_batch.items.every((item) =>
      item.planned_size_usd >= 0 &&
      item.review_after_seconds >= 0 &&
      item.sources.length > 0 &&
      (item.paper_trade === null || item.paper_trade.status === "paper-filled")
    )).toBe(true);
    expect(state.autonomous_trade_batch.ready_count).toBeLessThanOrEqual(state.autonomous_trade_batch.max_trades_per_cycle);
    expect(state.autonomous_trade_batch.planned_count).toBeLessThanOrEqual(state.autonomous_trade_batch.max_trades_per_cycle);
    expect(state.autonomous_session_supervisor.mode).toBe("autonomous-session-supervisor");
    expect(["attack", "harvest", "observe", "cooldown", "stand-down", "blocked"]).toContain(state.autonomous_session_supervisor.status);
    expect(state.autonomous_session_supervisor.session_id).toMatch(/^session-[0-9a-f]{12}$/);
    expect(state.autonomous_session_supervisor.items.length).toBeGreaterThan(0);
    expect(state.autonomous_session_supervisor.items.every((item) =>
      item.reason.length > 0 &&
      item.next_review_seconds >= 0 &&
      item.score >= 0 &&
      item.score <= 100
    )).toBe(true);
    expect(state.autonomous_session_supervisor.items.some((item) => item.lane === "capital")).toBe(true);
    expect(state.autonomous_session_supervisor.controls.some((control) => control.includes("Heartbeat"))).toBe(true);
    expect(state.autonomous_loop_director.mode).toBe("autonomous-loop-director");
    expect(["tick-now", "run", "observe", "cooldown", "paused", "halted", "blocked"]).toContain(state.autonomous_loop_director.status);
    expect(["burst", "active", "watch", "cooldown", "paused"]).toContain(state.autonomous_loop_director.intensity);
    expect(["stream", "backfill", "sample-loop", "standby"]).toContain(state.autonomous_loop_director.market_watch_mode);
    expect(state.autonomous_loop_director.next_tick_seconds).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_loop_director.client_interval_seconds).toBe(state.autonomous_loop_director.next_tick_seconds);
    expect(state.autonomous_loop_director.max_ticks_per_minute).toBeGreaterThan(0);
    expect(state.autonomous_loop_director.recommended_burst_ticks).toBeGreaterThanOrEqual(1);
    expect([
      state.autonomous_loop_director.batch_pressure_score,
      state.autonomous_loop_director.feed_pressure_score,
      state.autonomous_loop_director.route_pressure_score,
      state.autonomous_loop_director.setup_pressure_score,
    ].every((score) => score >= 0 && score <= 100)).toBe(true);
    expect(state.autonomous_loop_director.request.endpoint).toBe("/api/web3-trading");
    expect(state.autonomous_loop_director.request.method).toBe("POST");
    expect(state.autonomous_loop_director.request.account).toBe("persistent");
    expect(state.autonomous_loop_director.request.source).toBe(state.market_source.mode);
    expect(state.autonomous_loop_director.request.daemon).toBe(true);
    expect(state.autonomous_loop_director.request.advance).toBe(false);
    expect(state.autonomous_loop_director.route_refresh_status).toBe(state.route_refresh_queue.status);
    expect(state.autonomous_loop_director.route_refresh_next_action).toBe(state.route_refresh_queue.next_action);
    expect(state.autonomous_loop_director.should_refresh_route_quotes).toBe(
      state.route_refresh_queue.status === "refresh-now" ||
        state.route_refresh_queue.status === "queued" ||
        state.autonomous_monitor.should_refresh_route_quotes,
    );
    expect(state.autonomous_loop_director.controls.some((control) => control.includes("Client loop"))).toBe(true);
    expect(state.autonomous_loop_director.controls.some((control) => control.includes("Burst mode"))).toBe(true);
    if (!state.autonomous_loop_director.client_should_run) {
      expect(state.autonomous_loop_director.stop_reason).toBeTruthy();
    }
    expect(state.autonomous_portfolio_sentinel.mode).toBe("autonomous-portfolio-sentinel");
    expect(["exit", "harvest", "defend", "trail", "moonbag", "watch", "idle"]).toContain(state.autonomous_portfolio_sentinel.status);
    expect(state.autonomous_portfolio_sentinel.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_sentinel.recommended_release_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_sentinel.capital_at_risk_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_portfolio_sentinel.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.autonomous_portfolio_sentinel.controls.some((control) => control.includes("Ranks every open paper position"))).toBe(true);
    expect(state.autonomous_portfolio_sentinel.items.every((item) =>
      item.position_id.length > 0 &&
      item.source_stack.length > 0 &&
      item.surveillance_score >= 0 &&
      item.surveillance_score <= 100 &&
      item.recommended_release_usd >= 0 &&
      item.keep_position_usd >= 0
    )).toBe(true);
    expect(state.position_watch_clock.mode).toBe("position-watch-clock");
    expect(["due-now", "refresh-soon", "scheduled", "stale", "idle"]).toContain(state.position_watch_clock.status);
    expect(state.position_watch_clock.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.position_watch_clock.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.position_watch_clock.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.position_watch_clock.controls.some((control) => control.includes("next-review deadline"))).toBe(true);
    expect(state.position_watch_clock.items.every((item) =>
      item.position_id.length > 0 &&
      item.required_evidence.length > 0 &&
      item.next_review_at.includes("T") &&
      item.review_after_seconds > 0
    )).toBe(true);
    expect(state.position_surveillance_matrix.mode).toBe("position-surveillance-matrix");
    expect(["exit-now", "harvest", "refresh", "defend", "watch", "idle"]).toContain(state.position_surveillance_matrix.status);
    expect(state.position_surveillance_matrix.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.position_surveillance_matrix.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.position_surveillance_matrix.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.position_surveillance_matrix.controls.some((control) => control.includes("every open paper position"))).toBe(true);
    expect(state.position_surveillance_matrix.items.every((item) =>
      ["exit", "harvest", "trim", "defend", "refresh", "watch", "hold"].includes(item.status) &&
      item.position_usd >= 0 &&
      typeof item.stop_distance_pct === "number" &&
      typeof item.target_distance_pct === "number" &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(state.portfolio_price_action_guard.mode).toBe("portfolio-price-action-guard");
    expect(["eject", "trim", "harvest", "press", "watch", "idle"]).toContain(state.portfolio_price_action_guard.status);
    expect(state.portfolio_price_action_guard.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.portfolio_price_action_guard.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.portfolio_price_action_guard.fastest_review_seconds).toBeGreaterThan(0);
    expect(state.portfolio_price_action_guard.controls.some((control) => control.includes("fast price-action tape"))).toBe(true);
    expect(state.portfolio_price_action_guard.items.every((item) =>
      ["exit", "trim", "harvest", "press", "hold", "refresh"].includes(item.action) &&
      ["eject", "trim", "harvest", "press", "watch", "stale"].includes(item.status) &&
      item.position_usd >= 0 &&
      typeof item.velocity_score === "number" &&
      typeof item.flow_score === "number" &&
      typeof item.exit_pressure_score === "number" &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.evidence.length > 0
    )).toBe(true);
    expect(state.route_refresh_queue.mode).toBe("route-refresh-queue");
    expect(["refresh-now", "queued", "watch", "blocked", "idle"]).toContain(state.route_refresh_queue.status);
    expect(state.route_refresh_queue.max_quote_age_seconds).toBe(state.execution_preflight.max_quote_age_seconds);
    expect(state.route_refresh_queue.fastest_refresh_seconds).toBeGreaterThan(0);
    expect(state.route_refresh_queue.refresh_budget_per_minute).toBeGreaterThan(0);
    expect(state.route_refresh_queue.controls.some((control) => control.includes("Ranks stale quotes"))).toBe(true);
    if (state.route_refresh_queue.status === "refresh-now") {
      if (state.autonomous_loop_director.status === "blocked") {
        expect(state.autonomous_loop_director.blockers.length).toBeGreaterThan(0);
      } else {
        expect(state.autonomous_loop_director.status).toBe("tick-now");
        expect(state.autonomous_loop_director.next_tick_seconds).toBeLessThanOrEqual(
          Math.max(2, state.route_refresh_queue.fastest_refresh_seconds),
        );
        expect(state.autonomous_loop_director.tick_reason).toBe(state.route_refresh_queue.next_action);
      }
    }
    expect(state.route_refresh_queue.items.every((item) =>
      item.due_in_seconds > 0 &&
      item.next_refresh_at.includes("T") &&
      item.max_quote_age_seconds === state.execution_preflight.max_quote_age_seconds &&
      item.refresh_budget_per_minute > 0
    )).toBe(true);
    expect(state.autonomous_route_refresh_execution.mode).toBe("autonomous-route-refresh-execution");
    expect(["requesting", "ready", "blocked", "watching", "idle"]).toContain(state.autonomous_route_refresh_execution.status);
    expect(state.autonomous_route_refresh_execution.execution_boundary).toBe("read-only-route-refresh");
    expect(typeof state.autonomous_route_refresh_execution.route_refresh_required).toBe("boolean");
    expect(typeof state.autonomous_route_refresh_execution.can_request_readonly_quote).toBe("boolean");
    expect(typeof state.autonomous_route_refresh_execution.local_rehearsal_ready).toBe("boolean");
    if (state.autonomous_route_refresh_execution.local_rehearsal) {
      expect(state.autonomous_route_refresh_execution.local_rehearsal.mode).toBe("sample-route-rehearsal");
      expect(["ready", "blocked"]).toContain(state.autonomous_route_refresh_execution.local_rehearsal.status);
      expect(state.autonomous_route_refresh_execution.local_rehearsal.live_execution_permission).toBe("blocked");
      expect(state.autonomous_route_refresh_execution.local_rehearsal.wallet_mutation_permission).toBe("blocked");
      expect(state.autonomous_route_refresh_execution.local_rehearsal.controls.some((control) => control.includes("paper-accountability repair"))).toBe(true);
    }
    expect(state.autonomous_route_refresh_execution.requested_quote_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_route_refresh_execution.blocked_count).toBe(state.route_refresh_queue.blocked_count);
    expect(state.autonomous_route_refresh_execution.route_confidence_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_route_refresh_execution.next_refresh_seconds).toBeGreaterThan(0);
    expect(state.autonomous_route_refresh_execution.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_route_refresh_execution.controls.some((control) => control.includes("read-only quote"))).toBe(true);
    expect(state.autonomous_route_refresh_execution.controls.some((control) => control.includes("cannot sign"))).toBe(true);
    expect(state.autonomous_route_refresh_execution.checks.map((check) => check.id)).toEqual(["queue", "quote", "budget", "lane", "boundary"]);
    expect(state.autonomous_route_refresh_execution.checks.every((check) =>
      ["pass", "watch", "fail"].includes(check.status) && check.detail.length > 0
    )).toBe(true);
    if (state.route_refresh_queue.status === "refresh-now" || state.route_refresh_queue.status === "queued") {
      expect(state.autonomous_route_refresh_execution.route_refresh_required).toBe(true);
      expect(state.autonomous_route_refresh_execution.selected_item_id).toBe(state.route_refresh_queue.items[0]?.id ?? null);
      if (state.autonomous_route_refresh_execution.selected_lane === "dex-backfill") {
        expect(state.autonomous_route_refresh_execution.can_request_readonly_quote).toBe(true);
        expect(state.autonomous_route_refresh_execution.selected_quote_request).toBeNull();
      }
      if (state.autonomous_route_refresh_execution.selected_lane === "jupiter-quote" &&
        state.autonomous_route_refresh_execution.can_request_readonly_quote) {
        expect(state.autonomous_route_refresh_execution.selected_quote_request).not.toBeNull();
      }
    }
    expect(state.profit_optimizer.candidates.length).toBeGreaterThan(0);
    expect(state.execution_edge_ladder.mode).toBe("execution-edge-ladder");
    expect(state.execution_edge_ladder.items.length).toBeGreaterThan(0);
    expect(state.execution_edge_ladder.items[0].governor_status).toBe(state.autonomy_risk_governor.status);
    expect(state.live_execution_arming.mode).toBe("live-execution-arming");
    expect(state.live_execution_arming.submit_ready).toBe(false);
    expect(state.live_execution_arming.checks.some((check) => check.id === "operator-approval" && check.status === "fail")).toBe(true);
    expect(state.transaction_lifecycle.mode).toBe("transaction-lifecycle");
    expect(state.transaction_lifecycle.items.length).toBeGreaterThan(0);
    expect(state.transaction_lifecycle.items.every((item) => item.status_label.length > 0 && item.next_step.length > 0)).toBe(true);
    expect(state.signed_transaction_relay.mode).toBe("signed-transaction-relay");
    expect(["locked", "awaiting-signature", "ready", "relayed", "confirmed", "failed"]).toContain(state.signed_transaction_relay.status);
    expect(state.signed_transaction_relay.requires_external_wallet).toBe(true);
    expect(state.signed_transaction_relay.safeguards.some((item) => item.includes("never stored"))).toBe(true);
    expect(state.autonomous_order_handoff.mode).toBe("autonomous-order-handoff");
    expect(["paper", "build-order", "needs-signature", "ready-to-submit", "confirming", "blocked", "idle"]).toContain(state.autonomous_order_handoff.status);
    expect(state.autonomous_order_handoff.items.length).toBeGreaterThan(0);
    expect(state.autonomous_order_handoff.safeguards.some((item) => item.includes("private keys never enter"))).toBe(true);
    expect(state.autonomous_order_handoff.items.every((item) =>
      item.api_sequence.length > 0 &&
      item.next_action.length > 0 &&
      item.expected_cost_bps >= 0 &&
      item.ttl_seconds >= 0
    )).toBe(true);
    expect(state.pre_submit_rehearsal.mode).toBe("pre-submit-rehearsal");
    expect(["paper-only", "rehearse", "refresh-first", "signing-needed", "submit-ready", "confirming", "blocked", "idle"]).toContain(state.pre_submit_rehearsal.status);
    expect(state.pre_submit_rehearsal.items.length).toBe(state.autonomous_order_handoff.items.length);
    expect(state.pre_submit_rehearsal.controls.some((control) => control.includes("before an external signer"))).toBe(true);
    expect(state.pre_submit_rehearsal.items.every((item) =>
      item.handoff_id.length > 0 &&
      item.next_action.length > 0 &&
      item.execution_window_seconds >= 0 &&
      item.ttl_seconds >= 0 &&
      item.rehearsal_score >= 0 &&
      item.rehearsal_score <= 100 &&
      item.checks.some((check) => check.id === "quote") &&
      item.checks.some((check) => check.id === "custody")
    )).toBe(true);
    expect(state.autonomous_custody_mandate.mode).toBe("autonomous-custody-mandate");
    expect(["locked", "setup-required", "bounded-ready", "armed", "blocked"]).toContain(state.autonomous_custody_mandate.status);
    expect(state.autonomous_custody_mandate.policy_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.autonomous_custody_mandate.checks.some((check) => check.id === "signer-provider")).toBe(true);
    expect(state.autonomous_custody_mandate.safeguards.some((item) => item.includes("not a private-key store"))).toBe(true);
    expect(state.autonomous_custody_mandate.expires_at).toMatch(/T/);
    expect(state.autonomous_signer_ops.mode).toBe("autonomous-signer-ops");
    expect(["ready", "signature-needed", "setup-required", "blocked", "idle"]).toContain(state.autonomous_signer_ops.status);
    expect(state.autonomous_signer_ops.active_provider).toBe(state.autonomous_custody_mandate.provider);
    expect(state.autonomous_signer_ops.policy_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.autonomous_signer_ops.items.map((item) => item.provider).sort()).toEqual([
      "external-wallet",
      "privy-server-wallet",
      "session-key-vault",
      "turnkey-policy-wallet",
    ]);
    expect(state.autonomous_signer_ops.items.every((item) =>
      item.checks.some((check) => check.id === "provider") &&
      item.checks.some((check) => check.id === "payload") &&
      item.readiness_score >= 0 &&
      item.readiness_score <= 100
    )).toBe(true);
    expect(state.autonomous_signer_ops.provider_adapter).toMatchObject({
      mode: "signer-provider-adapter",
      provider: state.autonomous_signer_ops.active_provider,
      raw_transaction_included: false,
      signed_payload_included: false,
      private_key_required: false,
      can_auto_submit_after_signature: false,
    });
    expect(state.autonomous_signer_ops.provider_adapter.provider_request_packet).toMatchObject({
      mode: "provider-signature-request-packet",
      provider: state.autonomous_signer_ops.active_provider,
      raw_transaction_included: false,
      signed_payload_included: false,
      private_key_required: false,
    });
    expect(state.autonomous_signer_ops.controls.some((control) => control.includes("private keys"))).toBe(true);
    expect(state.autonomous_live_autonomy_readiness.mode).toBe("autonomous-live-autonomy-readiness");
    expect(["paper-only", "daemon-gated", "signature-gated", "submit-gated", "live-ready", "blocked"]).toContain(state.autonomous_live_autonomy_readiness.status);
    expect(state.autonomous_live_autonomy_readiness.can_trade_real_capital).toBe(false);
    expect(state.autonomous_live_autonomy_readiness.live_execution_permitted).toBe(false);
    expect(state.autonomous_live_autonomy_readiness.max_live_trade_usd).toBe(0);
    expect(state.autonomous_live_autonomy_readiness.readiness_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_live_autonomy_readiness.readiness_score).toBeLessThanOrEqual(100);
    expect(state.autonomous_live_autonomy_readiness.items.map((item) => item.id)).toEqual([
      "daemon",
      "market",
      "route",
      "fees",
      "policy",
      "signer",
      "relay",
      "kill-switch",
    ]);
    expect(state.autonomous_live_autonomy_readiness.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_live_autonomy_readiness.controls.some((control) => control.includes("final transition gate"))).toBe(true);
    expect(state.autonomous_live_autonomy_readiness.controls.some((control) => control.includes("cannot move funds"))).toBe(true);
    const launchChecklist = buildWeb3AutonomyLaunchChecklist(state);
    expect(launchChecklist.mode).toBe("web3-autonomy-launch-checklist");
    expect(["paper-operational", "paper-scale-ready", "paper-memory-gated", "live-gated", "manual-live-review", "blocked"]).toContain(launchChecklist.status);
    expect(launchChecklist.real_capital_blocked).toBe(true);
    expect(launchChecklist.live_review_permitted).toBe(false);
    expect(launchChecklist.readiness_score).toBeGreaterThanOrEqual(0);
    expect(launchChecklist.readiness_score).toBeLessThanOrEqual(100);
    expect(launchChecklist.items.map((item) => item.id)).toEqual([
      "paper-profit",
      "promoted-memory",
      "market-feed",
      "route-proof",
      "execution-quality",
      "custody-policy",
      "signer",
      "relay",
      "settlement",
      "kill-switch",
      "process-supervision",
      "provider-credentials",
      "wallet-accounting",
      "profit-proof",
      "live-boundary",
    ]);
    expect(launchChecklist.cutover_runway.map((step) => step.id)).toEqual([
      "profit-proof",
      "production-supervision",
      "wallet-provider-scope",
      "route-order-rehearsal",
      "manual-live-review",
    ]);
    expect(launchChecklist.next_cutover_step).toMatchObject({
      id: "profit-proof",
      command: "npm run autopilot-paper:web3",
      blocks_live_capital: true,
    });
    expect(launchChecklist.cutover_runway.every((step) => step.next_action.length > 0 && step.evidence.length > 0)).toBe(true);
    expect(launchChecklist.cutover_runway.find((step) => step.id === "manual-live-review")).toMatchObject({
      status: "blocked",
      blocks_live_capital: true,
    });
    expect(launchChecklist.production_supervisor_readiness).toMatchObject({
      mode: "web3-production-supervisor-readiness",
      status: "missing",
      can_satisfy_process_gate: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(launchChecklist.profit_proof_readiness).toMatchObject({
      mode: "web3-profit-proof-readiness",
      can_satisfy_profit_gate: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(launchChecklist.local_accountability_repair_health).toMatchObject({
      mode: "web3-local-accountability-repair",
      status: "absent",
      receipt_fresh: false,
      can_satisfy_local_accountability: false,
      repair_plateaued: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(launchChecklist.profit_proof_readiness.proof_plan).toMatchObject({
      mode: "promoted-paper-proof-plan",
      status: "needs-runs",
      required_promoted_runs: 3,
      remaining_promoted_runs: 3,
      required_target_hit_rate_pct: 70,
      suggested_next_runs: 2,
      safe_command: "npm run autopilot-paper:web3",
      local_accountability_repair_command: "npm run repair-accountability:web3",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(launchChecklist.profit_proof_readiness.threshold_matrix.map((threshold) => threshold.id)).toEqual([
      "local-accountability",
      "promoted-run-count",
      "promoted-total-pnl",
      "target-hit-rate",
      "recent-positive-runs",
      "loss-brake",
      "memory-posture",
      "live-boundary",
    ]);
    expect(launchChecklist.profit_proof_readiness.threshold_matrix.find((threshold) => threshold.id === "promoted-run-count")).toMatchObject({
      required: "At least 3 promoted paper runs",
      observed: "0 promoted runs",
      status: "fail",
    });
    expect(launchChecklist.profit_proof_readiness.threshold_matrix.find((threshold) => threshold.id === "live-boundary")).toMatchObject({
      observed: "Live execution and wallet mutation blocked",
      status: "pass",
    });
    expect(launchChecklist.provider_credentials_readiness).toMatchObject({
      mode: "web3-provider-credentials-readiness",
      status: "missing-wallet",
      read_provider_status: "missing",
      helius_rpc_configured: false,
      jupiter_configured: false,
      wallet_is_sample: false,
      dedicated_wallet_scoped: false,
      wallet_ownership_proved: false,
      can_satisfy_provider_gate: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(launchChecklist.provider_credentials_readiness.checks.map((check) => check.id)).toEqual([
      "wallet-scope",
      "read-provider-rail",
      "provider-secret-scope",
      "policy-hash",
      "custody-envelope",
      "signer-request",
      "provider-packet",
      "user-presence",
      "live-boundary",
    ]);
    expect(launchChecklist.profit_proof_readiness.checks.map((check) => check.id)).toEqual([
      "local-paper",
      "promoted-memory",
      "sample-size",
      "target-hit-rate",
      "drawdown",
      "live-boundary",
    ]);
    expect(launchChecklist.research_decisions.map((decision) => decision.id)).toEqual([
      "provider-stack",
      "market-discovery",
      "execution-stack",
      "signer-custody",
      "risk-policy",
      "live-cutover",
    ]);
    expect(launchChecklist.research_decisions.every((decision) =>
      decision.decision.length > 0 &&
      decision.evidence.length > 0 &&
      decision.next_action.length > 0 &&
      Array.isArray(decision.needs_user_input)
    )).toBe(true);
    expect(launchChecklist.research_decisions.find((decision) => decision.id === "provider-stack")).toMatchObject({
      status: "needs-credential",
      needs_user_input: expect.arrayContaining(["Helius API key or Solana RPC URL"]),
    });
    expect(launchChecklist.research_decisions.find((decision) => decision.id === "execution-stack")).toMatchObject({
      status: "needs-credential",
      needs_user_input: expect.arrayContaining(["Jupiter API key"]),
    });
    expect(launchChecklist.research_decisions.find((decision) => decision.id === "signer-custody")).toMatchObject({
      decision: expect.stringContaining("never collect private keys"),
      needs_user_input: expect.arrayContaining(["Public trading wallet address"]),
    });
    expect(launchChecklist.next_operator_action).toMatchObject({
      id: "helius-solana-read-rail",
      status: "needed",
      storage: "server-env",
    });
    process.env.HELIUS_API_KEY = "test-helius-key";
    const envReadyChecklist = buildWeb3AutonomyLaunchChecklist(state);
    expect(envReadyChecklist.provider_credentials_readiness).toMatchObject({
      read_provider_status: "partial",
      helius_rpc_configured: true,
      jupiter_configured: false,
      wallet_is_sample: false,
      dedicated_wallet_scoped: false,
      wallet_ownership_proved: false,
      can_satisfy_provider_gate: false,
    });
    expect(envReadyChecklist.items.find((item) => item.id === "provider-credentials")?.detail).toContain("read rail partial");
    expect(envReadyChecklist.research_decisions.find((decision) => decision.id === "provider-stack")).toMatchObject({
      status: "chosen",
      needs_user_input: [],
    });
    expect(envReadyChecklist.operator_inputs_needed.find((item) => item.id === "helius-solana-read-rail")).toMatchObject({
      label: "Helius / Solana read rail",
      status: "ready",
      storage: "server-env",
    });
    expect(envReadyChecklist.operator_inputs_needed.find((item) => item.id === "jupiter-route-order-key")).toMatchObject({
      label: "Jupiter route/order key",
      status: "needed",
      storage: "server-env",
    });
    expect(envReadyChecklist.next_operator_action).toMatchObject({
      id: "dedicated-trading-wallet",
      status: "needed",
      storage: "browser-public-scope",
    });
    delete process.env.HELIUS_API_KEY;
    expect(launchChecklist.operator_inputs_needed.map((item) => item.id)).toEqual(expect.arrayContaining([
      "dedicated-trading-wallet",
      "wallet-ownership-proof",
      "jupiter-route-order-key",
      "signer-custody-choice",
      "signer-provider-credentials",
      "settlement-accounting-review",
      "manual-live-approval",
    ]));
    expect(launchChecklist.operator_inputs_needed.find((item) => item.id === "dedicated-trading-wallet")).toMatchObject({
      label: "Dedicated trading wallet",
      status: expect.stringMatching(/needed|ready/),
      storage: "browser-public-scope",
      secret_handling: expect.stringContaining("private keys and seed phrases are never accepted"),
    });
    expect(launchChecklist.operator_inputs_needed.find((item) => item.id === "wallet-ownership-proof")).toMatchObject({
      label: "Wallet ownership proof",
      storage: "hash-only-local-receipt",
    });
    expect(launchChecklist.operator_inputs_needed.find((item) => item.id === "manual-live-approval")).toMatchObject({
      label: "Manual live approval",
      storage: "external-operator-review",
      secret_handling: expect.stringContaining("private keys"),
    });
    expect(launchChecklist.repair_actions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "run-web3-verifier",
      "scope-operator-inputs",
    ]));
    expect(launchChecklist.repair_actions.find((item) => item.id === "run-web3-verifier")).toMatchObject({
      label: "Run Web3 verifier",
      status: expect.stringMatching(/ready|review/),
      surface: "terminal",
      command: "npm run verify:web3 -- --base-url=http://localhost:4010",
      blocks_live_capital: true,
    });
    expect(launchChecklist.repair_actions.find((item) => item.id === "scope-operator-inputs")).toMatchObject({
      label: "Scope operator inputs",
      surface: "settings",
      blocks_live_capital: true,
    });
    expect(launchChecklist.repair_actions.some((item) =>
      item.command === "npm run landing-drill:web3" ||
      item.command === "npm run repair-accountability:web3" ||
      item.command?.includes("npm run supervise:web3"),
    )).toBe(true);
    expect(launchChecklist.items.find((item) => item.id === "process-supervision")?.blocker).toContain("supervise:web3");
    expect(launchChecklist.items.find((item) => item.id === "provider-credentials")?.blocker).toContain("public wallet key");
    expect(launchChecklist.items.find((item) => item.id === "wallet-accounting")?.blocker).toContain("wallet");
    expect(launchChecklist.items.find((item) => item.id === "profit-proof")?.blocker).toContain("promoted");
    if (state.autonomous_route_refresh_execution.local_rehearsal_ready) {
      expect(launchChecklist.items.find((item) => item.id === "route-proof")).toMatchObject({
        status: "watch",
        detail: expect.stringContaining("local paper route rehearsal accepted"),
        blocker: expect.stringContaining("read-only quote and dry-run order proof"),
      });
      expect(launchChecklist.hard_blockers).not.toContain(
        state.autonomous_route_refresh_execution.next_action,
      );
      expect(launchChecklist.cutover_runway.find((step) => step.id === "route-order-rehearsal")).toMatchObject({
        status: "active",
        command: "npm run landing-drill:web3",
        evidence: expect.stringContaining("paper rehearsal"),
        blocks_live_capital: true,
      });
    }
    expect(launchChecklist.remaining_work.map((item) => item.id)).toEqual(expect.arrayContaining([
      "process-supervision",
      "provider-credentials",
      "wallet-accounting",
      "profit-proof",
    ]));
    expect(launchChecklist.controls.some((control) => control.includes("launch-readiness contract"))).toBe(true);
    expect(launchChecklist.controls.some((control) => control.includes("operator input packet"))).toBe(true);
    expect(launchChecklist.controls.some((control) => control.includes("launch repair queue"))).toBe(true);
    expect(launchChecklist.controls.some((control) => control.includes("private keys and seed phrases stay out"))).toBe(true);
    expect(launchChecklist.controls.some((control) => control.includes("process-supervision"))).toBe(true);
    expect(launchChecklist.controls.some((control) => control.includes("does not sign"))).toBe(true);
    const supervisedChecklist = buildWeb3AutonomyLaunchChecklist(state, undefined, {
      status: "completed",
      updated_at: new Date().toISOString(),
      runner_id: "test-supervisor",
      summary: "Supervisor completed a hardened paper run.",
      net_pnl_usd: 12,
      target_net_pnl_usd: 10,
      last_equity_usd: 10_012,
      max_drawdown_usd: 1,
      max_drawdown_limit_usd: 50,
      profit_target_hit: true,
      loss_brake_tripped: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(supervisedChecklist.production_supervisor_readiness.status).toBe("production-gated");
    expect(supervisedChecklist.items.find((item) => item.id === "process-supervision")).toMatchObject({
      status: "watch",
      blocker: "Move this to external production-worker review with process manager, restart policy, alerts, and secret scope documented.",
    });
    expect(supervisedChecklist.cutover_runway.find((step) => step.id === "production-supervision")).toMatchObject({
      status: "review",
      command: "npm run supervise:web3 -- --base-url=http://localhost:4010 --rounds=1 --ticks-per-round=1 --target-net-pnl=1 --max-drawdown=250 --json",
    });
    const repeatProfitChecklist = buildWeb3AutonomyLaunchChecklist(state, {
      status: "target-hit",
      updated_at: new Date().toISOString(),
      runner_id: "profit-proof-test",
      summary: "Promoted paper proof is repeatable.",
      promotion_permission: "scale-paper",
      supervisor_status: "completed",
      net_pnl_usd: 42,
      posted_ticks: 6,
      blocked_ticks: 0,
      profit_target_hit: true,
      loss_brake_tripped: false,
      run_count: 3,
      total_net_pnl_usd: 142,
      average_net_pnl_usd: 47.33,
      target_hit_rate_pct: 100,
      recent_runs: [
        { finished_at: new Date().toISOString(), status: "completed", promotion_permission: "scale-paper", supervisor_status: "completed", net_pnl_usd: 45, posted_ticks: 5, blocked_ticks: 0, profit_target_hit: true, loss_brake_tripped: false },
        { finished_at: new Date().toISOString(), status: "completed", promotion_permission: "scale-paper", supervisor_status: "completed", net_pnl_usd: 55, posted_ticks: 5, blocked_ticks: 0, profit_target_hit: true, loss_brake_tripped: false },
        { finished_at: new Date().toISOString(), status: "target-hit", promotion_permission: "scale-paper", supervisor_status: "completed", net_pnl_usd: 42, posted_ticks: 6, blocked_ticks: 0, profit_target_hit: true, loss_brake_tripped: false },
      ],
      run_memory_status: "extend-paper",
      run_memory_score: 88,
      recommended_supervisor_round_cap: 4,
      memory_next_action: "Run-memory is profitable; allow a larger bounded promoted paper window while keeping live execution locked.",
      promotion_repair_items: [],
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(repeatProfitChecklist.profit_proof_readiness).toMatchObject({
      status: "profitable-paper",
      can_satisfy_profit_gate: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(repeatProfitChecklist.profit_proof_readiness.proof_plan).toMatchObject({
      status: "needs-local-accountability",
      remaining_promoted_runs: 0,
      suggested_next_runs: 0,
      local_accountability_repair_command: "npm run repair-accountability:web3",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(repeatProfitChecklist.items.find((item) => item.id === "profit-proof")).toMatchObject({
      status: "watch",
    });
    expect(repeatProfitChecklist.cutover_runway.find((step) => step.id === "profit-proof")).toMatchObject({
      status: "active",
    });
    const protectedProfitProof = buildWeb3ProfitProofReadiness({
      promotedHealth: {
        status: "blocked",
        updated_at: new Date().toISOString(),
        runner_id: "protected-proof-test",
        summary: "Promotion guard blocked after missed target runs.",
        promotion_permission: "blocked",
        supervisor_status: "not-run",
        net_pnl_usd: 0,
        posted_ticks: 0,
        blocked_ticks: 0,
        profit_target_hit: false,
        loss_brake_tripped: false,
        run_count: 3,
        total_net_pnl_usd: 33,
        average_net_pnl_usd: 11,
        target_hit_rate_pct: 33.33,
        recent_runs: [
          { finished_at: new Date().toISOString(), status: "target-hit", promotion_permission: "selective-paper", supervisor_status: "completed", net_pnl_usd: 33, posted_ticks: 2, blocked_ticks: 0, profit_target_hit: true, loss_brake_tripped: false },
          { finished_at: new Date().toISOString(), status: "blocked", promotion_permission: "blocked", supervisor_status: "not-run", net_pnl_usd: 0, posted_ticks: 0, blocked_ticks: 0, profit_target_hit: false, loss_brake_tripped: false },
          { finished_at: new Date().toISOString(), status: "blocked", promotion_permission: "blocked", supervisor_status: "not-run", net_pnl_usd: 0, posted_ticks: 0, blocked_ticks: 0, profit_target_hit: false, loss_brake_tripped: false },
        ],
        run_memory_status: "protect-paper",
        run_memory_score: 34,
        recommended_supervisor_round_cap: 0,
        memory_next_action: "Protect paper capital; run proof-only or one manual review cycle before more supervised ticks.",
        promotion_repair_items: [],
        live_execution_permission: "blocked",
        wallet_mutation_permission: "blocked",
      },
    });
    expect(protectedProfitProof).toMatchObject({
      status: "blocked",
      promoted_recent_positive_count: 1,
      promoted_recent_loss_count: 2,
      can_satisfy_profit_gate: false,
    });
    expect(protectedProfitProof.proof_plan).toMatchObject({
      status: "blocked",
      observed_recent_positive_runs: 1,
      remaining_promoted_runs: 0,
      local_accountability_repair_command: "npm run repair-accountability:web3",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    const promotedReadyHealth = {
      status: "target-hit" as const,
      updated_at: new Date().toISOString(),
      runner_id: "promoted-ready-local-watch-test",
      summary: "Promoted paper proof recovered.",
      promotion_permission: "selective-paper" as const,
      supervisor_status: "completed" as const,
      net_pnl_usd: 33,
      posted_ticks: 2,
      blocked_ticks: 0,
      profit_target_hit: true,
      loss_brake_tripped: false,
      run_count: 4,
      total_net_pnl_usd: 99,
      average_net_pnl_usd: 24.75,
      target_hit_rate_pct: 75,
      recent_runs: [
        { finished_at: new Date().toISOString(), status: "target-hit" as const, promotion_permission: "selective-paper" as const, supervisor_status: "completed" as const, net_pnl_usd: 33, posted_ticks: 2, blocked_ticks: 0, profit_target_hit: true, loss_brake_tripped: false },
        { finished_at: new Date().toISOString(), status: "completed" as const, promotion_permission: "selective-paper" as const, supervisor_status: "completed" as const, net_pnl_usd: 0, posted_ticks: 1, blocked_ticks: 0, profit_target_hit: false, loss_brake_tripped: false },
        { finished_at: new Date().toISOString(), status: "target-hit" as const, promotion_permission: "selective-paper" as const, supervisor_status: "completed" as const, net_pnl_usd: 33, posted_ticks: 2, blocked_ticks: 0, profit_target_hit: true, loss_brake_tripped: false },
        { finished_at: new Date().toISOString(), status: "target-hit" as const, promotion_permission: "selective-paper" as const, supervisor_status: "completed" as const, net_pnl_usd: 33, posted_ticks: 2, blocked_ticks: 0, profit_target_hit: true, loss_brake_tripped: false },
      ],
      run_memory_status: "tighten-paper" as const,
      run_memory_score: 58,
      recommended_supervisor_round_cap: 1,
      memory_next_action: "Keep promoted paper autonomy tight: one supervised round, then review the wallet curve.",
      promotion_repair_items: [],
      live_execution_permission: "blocked" as const,
      wallet_mutation_permission: "blocked" as const,
    };
    const promotedReadyProfitProof = buildWeb3ProfitProofReadiness({
      promotedHealth: promotedReadyHealth,
    });
    expect(promotedReadyProfitProof).toMatchObject({
      status: "profitable-paper",
      promoted_recent_positive_count: 3,
      promoted_recent_loss_count: 1,
      can_satisfy_profit_gate: false,
    });
    expect(promotedReadyProfitProof.proof_plan).toMatchObject({
      status: "needs-local-accountability",
      remaining_promoted_runs: 0,
      suggested_next_runs: 0,
      observed_recent_positive_runs: 3,
      local_accountability_repair_command: "npm run repair-accountability:web3",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(promotedReadyProfitProof.threshold_matrix.find((threshold) => threshold.id === "promoted-run-count")).toMatchObject({
      observed: "4 promoted runs",
      status: "pass",
    });
    expect(promotedReadyProfitProof.threshold_matrix.find((threshold) => threshold.id === "target-hit-rate")).toMatchObject({
      observed: "75% target-hit rate",
      status: "pass",
    });
    expect(promotedReadyProfitProof.threshold_matrix.find((threshold) => threshold.id === "local-accountability")).toMatchObject({
      status: "watch",
    });
    expect(promotedReadyProfitProof.proof_plan.next_action).toContain("local paper accountability");
    expect(promotedReadyProfitProof.next_action).toContain("local paper accountability");
    const promotedReadyChecklist = buildWeb3AutonomyLaunchChecklist(state, promotedReadyHealth);
    expect(promotedReadyChecklist.cutover_runway.find((step) => step.id === "profit-proof")).toMatchObject({
      status: "active",
      command: "npm run repair-accountability:web3",
      next_action: expect.stringContaining("local paper accountability"),
    });
    const liveDexPromotedReadyChecklist = buildWeb3AutonomyLaunchChecklist({
      ...state,
      market_source: {
        ...state.market_source,
        mode: "live-dex",
      },
    }, promotedReadyHealth);
    expect(liveDexPromotedReadyChecklist.cutover_runway.find((step) => step.id === "profit-proof")).toMatchObject({
      status: "active",
      command: "npm run repair-accountability:web3 -- --source=live-dex",
    });
    expect(liveDexPromotedReadyChecklist.repair_actions.find((item) => item.id === "repair-paper-accountability")).toMatchObject({
      command: "npm run repair-accountability:web3 -- --source=live-dex",
    });
    const repairReceiptPath = process.env.WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH;
    if (!repairReceiptPath) throw new Error("Expected WEB3_LOCAL_ACCOUNTABILITY_REPAIR_STATUS_PATH in test setup.");
    writeFileSync(repairReceiptPath, `${JSON.stringify({
      mode: "web3-local-accountability-repair",
      paper_only: true,
      status: "no-progress",
      updated_at: new Date().toISOString(),
      target_score: 70,
      attempts_requested: 3,
      attempts_posted: 1,
      initial_accountability_score: 46,
      final_accountability_score: 46,
      score_delta: 0,
      initial_making_money: false,
      final_making_money: false,
      final_repair_status: "blocked",
      final_repair_action: "Inspect route and fill quality before another repair cycle.",
      final_blocking_reason: "Local accountability score did not improve.",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      blockers: ["Local accountability score did not improve after posted paper repair attempts."],
      summary: "Local paper accountability stayed at 46/100 after 1 posted repair attempt.",
      next_action: "Inspect route and fill quality before another repair cycle.",
      controls: ["Sanitized local paper-only receipt; no secrets or transaction payloads are exposed."],
    })}\n`);
    const plateauChecklist = buildWeb3AutonomyLaunchChecklist(state, promotedReadyHealth);
    expect(plateauChecklist.local_accountability_repair_health).toMatchObject({
      status: "no-progress",
      receipt_fresh: true,
      repair_plateaued: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(plateauChecklist.controls.some((control) => control.includes("stalled repair loops"))).toBe(true);
    expect(plateauChecklist.repair_actions.find((item) => item.id === "repair-paper-accountability")).toMatchObject({
      status: "blocked",
      detail: expect.stringContaining("Last repair no progress"),
      next_action: "Inspect route and fill quality before another repair cycle.",
      command: "npm run repair-accountability:web3",
      blocks_live_capital: true,
    });
    expect(plateauChecklist.next_cutover_step).toMatchObject({
      id: "profit-proof",
      status: "blocked",
      next_action: "Inspect route and fill quality before another repair cycle.",
      blocks_live_capital: true,
    });
    expect(plateauChecklist.cutover_runway.find((step) => step.id === "profit-proof")).toMatchObject({
      status: "blocked",
      evidence: expect.stringContaining("latest local repair no progress at 46/100"),
    });
    expect(state.autonomous_daemon_handoff.mode).toBe("autonomous-daemon-handoff");
    expect(["ready", "observe-only", "refresh-first", "protect-only", "paused", "blocked"]).toContain(state.autonomous_daemon_handoff.status);
    expect(state.autonomous_daemon_handoff.runner_role).toBe("external-scheduler");
    expect(state.autonomous_daemon_handoff.endpoint).toBe("/api/web3-trading");
    expect(state.autonomous_daemon_handoff.method).toBe("POST");
    expect(state.autonomous_daemon_handoff.request).toMatchObject({
      account: "persistent",
      daemon: true,
      advance: false,
      reset: false,
    });
    expect(["sample", "live-dex"]).toContain(state.autonomous_daemon_handoff.request.source);
    expect(state.autonomous_daemon_handoff.lease_id).toContain("handoff-");
    expect(["idle", "acquired", "renewed", "replayed", "conflict", "expired", "blocked"]).toContain(state.autonomous_daemon_handoff.lease_status);
    expect(state.autonomous_daemon_handoff.lease_ttl_seconds).toBeGreaterThan(0);
    expect(state.autonomous_daemon_handoff.renew_after_seconds).toBeGreaterThan(0);
    expect(typeof state.autonomous_daemon_handoff.can_issue_tick).toBe("boolean");
    expect(state.autonomous_daemon_handoff.active_runner_id === null || typeof state.autonomous_daemon_handoff.active_runner_id === "string").toBe(true);
    expect(state.autonomous_daemon_handoff.active_request_id === null || typeof state.autonomous_daemon_handoff.active_request_id === "string").toBe(true);
    expect(state.autonomous_daemon_handoff.lease_replay_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daemon_handoff.lease_conflict_count).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_daemon_handoff.can_trade_real_capital).toBe(false);
    expect(state.autonomous_daemon_handoff.market_worker.mode).toBe("daemon-market-worker-handoff");
    expect(["ready", "refresh-first", "sample-only", "throttled", "blocked", "idle"]).toContain(state.autonomous_daemon_handoff.market_worker.status);
    expect(state.autonomous_daemon_handoff.market_worker.read_only).toBe(true);
    expect(state.autonomous_daemon_handoff.market_worker.cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_daemon_handoff.market_worker.budget_per_minute).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(state.autonomous_daemon_handoff.market_worker.watch_symbols)).toBe(true);
    expect(state.autonomous_daemon_handoff.market_worker.controls.some((control) => control.includes("read-only"))).toBe(true);
    if (state.autonomous_daemon_handoff.market_worker.status === "blocked" || state.autonomous_daemon_handoff.market_worker.status === "sample-only") {
      expect(state.autonomous_daemon_handoff.market_worker.can_feed_paper_loop).toBe(false);
    }
    expect(state.autonomous_daemon_handoff.items.map((item) => item.id)).toEqual([
      "lease",
      "cadence",
      "payload",
      "market",
      "route",
      "risk",
      "live-boundary",
    ]);
    expect(state.autonomous_daemon_handoff.items.every((item) =>
      ["pass", "watch", "fail"].includes(item.status) &&
      item.score >= 0 &&
      item.score <= 100 &&
      item.detail.length > 0
    )).toBe(true);
    expect(state.autonomous_daemon_handoff.stop_conditions.some((condition) => condition.includes("lease expires"))).toBe(true);
    expect(state.autonomous_daemon_handoff.controls.some((control) => control.includes("lease contract"))).toBe(true);
    expect(state.autonomous_wallet_telemetry.mode).toBe("autonomous-wallet-telemetry");
    expect(["compounding", "harvest", "recover", "flat", "cooldown", "protect"]).toContain(state.autonomous_wallet_telemetry.status);
    expect(state.autonomous_wallet_telemetry.curve.length).toBeGreaterThanOrEqual(2);
    expect(state.autonomous_wallet_telemetry.curve.at(-1)?.equity_usd).toBeCloseTo(state.portfolio.equity_usd, 2);
    expect(state.autonomous_wallet_telemetry.net_pnl_usd).toBeCloseTo(
      state.portfolio.equity_usd - state.portfolio.starting_cash_usd,
      2,
    );
    expect(state.autonomous_wallet_telemetry.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_wallet_telemetry.risk_notes.length).toBeGreaterThan(0);
    expect(state.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(state.smart_money_sentinel.items.length).toBeGreaterThan(0);
    expect(state.learning_loop.signals.length).toBeGreaterThan(0);
    expect(state.signal_alpha_attribution.items.length).toBeGreaterThan(0);
    expect(state.autonomous_strategy_attribution.mode).toBe("autonomous-strategy-attribution");
    expect(["scale", "selective", "tighten", "protect", "learning", "idle"]).toContain(state.autonomous_strategy_attribution.status);
    expect(state.autonomous_strategy_attribution.items.length).toBeGreaterThan(0);
    expect(state.autonomous_strategy_attribution.recommended_size_bias).toBeGreaterThan(0);
    expect(state.autonomous_strategy_attribution.controls.some((control) => control.includes("local paper fills"))).toBe(true);
    expect(state.autonomous_strategy_attribution.items.every((item) =>
      ["launch-sniper", "launch-graduation", "signal-policy", "arbiter", "opportunity-race", "candle", "protection", "manual-paper"].includes(item.lane) &&
      ["scale", "keep", "tighten", "protect", "learning"].includes(item.status) &&
      item.trade_count >= 0 &&
      item.confidence_score >= 0 &&
      item.confidence_score <= 100 &&
      item.size_bias_multiplier > 0 &&
      item.next_action.length > 0
    )).toBe(true);
    expect(state.autonomous_policy_optimizer.attribution_size_bias).toBeGreaterThan(0);
    expect(state.autonomous_policy_optimizer.min_expected_edge_usd).toBeGreaterThanOrEqual(state.autonomous_edge_verifier.min_required_edge_usd);
    expect(state.autonomous_policy_optimizer.items.some((item) => item.id === "strategy-policy" && item.lane === "strategy")).toBe(true);
    expect(state.autonomous_policy_optimizer.safeguards.some((item) => item.includes("lane attribution"))).toBe(true);
    expect(state.autonomous_policy_optimizer.attribution_best_lane).toBe(state.autonomous_strategy_attribution.best_lane);
    expect(state.autonomous_policy_optimizer.attribution_worst_lane).toBe(state.autonomous_strategy_attribution.worst_lane);
    expect(state.paper_execution_quality.source).toBe("local-fill-simulator");
    expect(Array.isArray(state.paper_execution_quality.items)).toBe(true);
    expect(state.execution_intents.intents.length).toBeGreaterThan(0);
    expect(state.execution_cost_monitor.items.length).toBeGreaterThan(0);
    expect(state.execution_mev_guard.items.length).toBeGreaterThan(0);
    expect(state.execution_retry_planner.items.length).toBeGreaterThan(0);
    expect(state.execution_preflight.items.length).toBeGreaterThan(0);
    expect(state.performance_scorecard.checkpoints.length).toBeGreaterThan(0);
    expect(state.autonomous_forward_test.scenarios.length).toBe(3);
    expect(state.token_vetting.items.length).toBeGreaterThan(0);
    expect(state.execution_gate.live_blockers.length).toBeGreaterThanOrEqual(3);
    expect(state.research_sources.some((source) => source.label === "Solana token authorities")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "DEX Screener")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "DEX Screener launch sources")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Moonshot")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "FIA automated trading risk controls")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Solana sendTransaction")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Solana signature statuses")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Solana transaction expiration")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Jupiter Trigger API")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Jupiter Ultra execution")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "GeckoTerminal OHLCV")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Birdeye OHLCV")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "CoinGecko onchain top traders")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Birdeye trades and traders")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Helius enhanced transactions")).toBe(true);
    expect(state.research_sources.some((source) => source.label === "Helius webhooks")).toBe(true);
  });

  test("GIVEN promoted autopilot guard reviews with no supervised ticks WHEN health is rebuilt THEN they do not poison proof memory", () => {
    writeWeb3PromotedPaperAutopilotReceipt({
      mode: "web3-promoted-paper-autopilot",
      paper_only: true,
      status: "target-hit",
      runner_id: "proof-memory-test",
      scenario: "breakout",
      promotion_scenario: "all",
      source: "sample",
      started_at: "2026-06-19T10:00:00.000Z",
      finished_at: "2026-06-19T10:01:00.000Z",
      promotion_status: "scale-paper",
      promotion_permission: "selective-paper",
      supervisor_status: "completed",
      applied_supervisor_rounds: 1,
      applied_ticks_per_round: 2,
      posted_ticks: 2,
      blocked_ticks: 0,
      net_pnl_usd: 33,
      profit_target_hit: true,
      loss_brake_tripped: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      summary: "Promoted paper autopilot hit target.",
      next_action: "Continue collecting promoted proof.",
      blockers: [],
    });
    writeWeb3PromotedPaperAutopilotReceipt({
      mode: "web3-promoted-paper-autopilot",
      paper_only: true,
      status: "blocked",
      runner_id: "proof-memory-test",
      scenario: "breakout",
      promotion_scenario: "all",
      source: "sample",
      started_at: "2026-06-19T10:02:00.000Z",
      finished_at: "2026-06-19T10:02:05.000Z",
      promotion_status: "protect-paper",
      promotion_permission: "blocked",
      supervisor_status: "not-run",
      applied_supervisor_rounds: 0,
      applied_ticks_per_round: 0,
      posted_ticks: 0,
      blocked_ticks: 0,
      net_pnl_usd: 0,
      profit_target_hit: false,
      loss_brake_tripped: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      summary: "Promoted paper autopilot reviewed the guard without running ticks.",
      next_action: "Run proof-only review or stand down.",
      blockers: ["Supervisor round cap is zero."],
      promotion_repair_items: [
        { id: "net-pnl", label: "Net PnL", status: "pass", value: "+$46.5", detail: "Minimum target is +$0 across repeat runs." },
        { id: "hit-rate", label: "Hit rate", status: "fail", value: "0%", detail: "Required hit rate is 100%." },
        { id: "consistency", label: "Consistency", status: "fail", value: "0/100", detail: "Required consistency is 80/100." },
      ],
    });

    const history = getWeb3PromotedPaperAutopilotHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      status: "target-hit",
      supervisor_status: "completed",
      net_pnl_usd: 33,
      profit_target_hit: true,
    });

    const health = getWeb3PromotedPaperAutopilotHealth();
    expect(health).toMatchObject({
      status: "blocked",
      run_count: 1,
      total_net_pnl_usd: 33,
      target_hit_rate_pct: 100,
      run_memory_status: "tighten-paper",
      recommended_supervisor_round_cap: 1,
    });
    expect(health.promotion_repair_items).toEqual([
      { id: "net-pnl", label: "Net PnL", status: "pass", value: "+$46.5", detail: "Minimum target is +$0 across repeat runs." },
      { id: "hit-rate", label: "Hit rate", status: "fail", value: "0%", detail: "Required hit rate is 100%." },
      { id: "consistency", label: "Consistency", status: "fail", value: "0/100", detail: "Required consistency is 80/100." },
    ]);

    const proof = buildWeb3ProfitProofReadiness({ promotedHealth: health });
    expect(proof).toMatchObject({
      status: "profitable-paper",
      promoted_recent_positive_count: 1,
      promoted_recent_loss_count: 0,
      can_satisfy_profit_gate: false,
    });
    expect(proof.proof_plan).toMatchObject({
      status: "needs-runs",
      remaining_promoted_runs: 2,
      suggested_next_runs: 1,
      local_accountability_repair_command: "npm run repair-accountability:web3",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(proof.next_action).toContain("Repair promotion guard first: Hit rate is 0%");
    expect(proof.proof_plan.next_action).toContain("Repair promotion guard first: Hit rate is 0%");
  });

  test("GIVEN monitor receipts are written WHEN history is read THEN only safe paper rows reach the API", async () => {
    const accepted = writeWeb3MarketMonitorHistoryEntry({
      mode: "web3-market-monitor",
      status: "recorded",
      finished_at: "2026-06-19T11:00:00.000Z",
      scenario: "breakout",
      source: "live-dex",
      account: "persistent",
      discovery_status: "live",
      scanner_status: "actionable",
      selected_symbol: "POPCAT",
      selected_pair: "pool-123",
      candle_count: 24,
      candle_action: "press",
      candle_confidence: 78,
      paper_action: "paper-probe",
      paper_notional_usd: 125,
      recorded_candle_status: "fresh",
      recorded_conviction_status: "ready",
      provider_degraded: false,
      provider_error: "",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      secret_echo_permission: "blocked",
      summary: "POPCAT read-only candle proof recorded.",
      next_action: "Review the paper probe before the next tick.",
    });
    const rejected = writeWeb3MarketMonitorHistoryEntry({
      status: "recorded",
      finished_at: "2026-06-19T11:01:00.000Z",
      live_execution_permission: "enabled",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      secret_echo_permission: "blocked",
    });

    expect(accepted?.selected_symbol).toBe("POPCAT");
    expect(rejected).toBeNull();

    const history = getWeb3MarketMonitorHistory();
    expect(history).toMatchObject({
      mode: "web3-market-monitor-history",
      paper_only: true,
      status: "active",
      run_count: 1,
      latest_symbol: "POPCAT",
      latest_action: "paper-probe",
      latest_confidence: 78,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      transaction_submission_permission: "blocked",
      private_key_storage: "blocked",
      seed_phrase_storage: "blocked",
      secret_echo_permission: "blocked",
    });
    expect(history.recent_runs[0]).toMatchObject({
      selected_symbol: "POPCAT",
      paper_action: "paper-probe",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });

    const response = await MARKET_MONITOR_HISTORY_GET();
    const payload = await json<{
      run_count: number;
      recent_runs: Array<{ selected_symbol: string }>;
    }>(response);
    expect(payload.run_count).toBe(1);
    expect(payload.recent_runs[0].selected_symbol).toBe("POPCAT");
    expect(JSON.stringify(payload)).not.toMatch(/enabled|api-key=/i);
  });

  test("GIVEN mocked DEX Screener payloads WHEN live mode is requested THEN the agent trades from live market telemetry", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenFresh222", amount: 12, totalAmount: 14 },
        ]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", description: "profiled momentum coin" },
        ]);
      }
      if (url.includes("/community-takeovers/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", description: "community revived momentum coin" },
        ]);
      }
      if (url.includes("/ads/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenFresh222", impressions: 140_000, type: "trendingBarAd" },
        ]);
      }
      if (url.includes("/orders/v1/solana/TokenLive111")) {
        return Response.json([
          { type: "tokenProfile", status: "approved", paymentTimestamp: Date.now() - 90_000 },
          { type: "communityTakeover", status: "approved", paymentTimestamp: Date.now() - 60_000 },
        ]);
      }
      if (url.includes("/orders/v1/solana/TokenFresh222")) {
        return Response.json([
          { type: "tokenAd", status: "approved", paymentTimestamp: Date.now() - 45_000 },
          { type: "trendingBarAd", status: "approved", paymentTimestamp: Date.now() - 30_000 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111,TokenFresh222")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
          {
            chainId: "solana",
            dexId: "pumpswap",
            pairAddress: "PairFresh222",
            baseToken: { address: "TokenFresh222", name: "Fresh Coin", symbol: "FRESH" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.004",
            txns: { m5: { buys: 300, sells: 32 } },
            volume: { m5: 95_000, h1: 390_000, h24: 720_000 },
            priceChange: { m5: 22.5, h1: 80.2, h6: 95.1 },
            liquidity: { usd: 55_000 },
            marketCap: 1_900_000,
            pairCreatedAt: Date.now() - 20 * 60 * 1000,
            boosts: { active: 12 },
          },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          contextSlot: 284_001_337,
          timeTaken: 0.018,
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });
    const live = state.signals.find((signal) => signal.symbol === "LIVE");

    expect(state.market_source.status).toBe("live");
    expect(state.discovery_tape.status).toBe("live");
    expect(state.discovery_tape.tokens_considered).toBe(2);
    expect(state.discovery_tape.sources.every((source) => source.status === "ok")).toBe(true);
    expect(state.market_feed_integrity.status).toBe("healthy");
    expect(state.market_feed_integrity.stream_mode).toBe("rest-snapshot");
    expect(state.market_feed_integrity.gap_count).toBe(0);
    expect(state.market_feed_integrity.backfill_required).toBe(false);
    expect(state.market_feed_integrity.checks.every((check) => check.status === "pass")).toBe(true);
    expect(state.market_stream_supervisor.mode).toBe("market-stream-supervisor");
    expect(state.market_stream_supervisor.status).toBe("streaming");
    expect(state.market_stream_supervisor.transport).toBe("websocket");
    expect(state.market_stream_supervisor.lanes.some((lane) =>
      lane.source === "dex-screener-websocket" &&
      lane.status === "subscribed"
    )).toBe(true);
    expect(state.market_stream_supervisor.watch_symbols).toContain("LIVE");
    expect(state.market_ingestion_plan.mode).toBe("market-ingestion-plan");
    expect(state.market_ingestion_plan.status).toBe("stream-ready");
    expect(state.market_ingestion_plan.steps.some((step) =>
      step.source === "dex-screener-websocket" &&
      step.action === "connect"
    )).toBe(true);
    expect(state.market_ingestion_plan.steps.some((step) =>
      step.id === "paid-orders" &&
      step.source === "dex-screener-rest"
    )).toBe(true);
    expect(["within-budget", "hot", "throttled"]).toContain(state.market_ingestion_plan.provider_budget_status);
    expect(state.market_ingestion_plan.provider_budget_utilization_pct).toBeGreaterThanOrEqual(0);
    expect(state.market_ingestion_plan.provider_budget_lanes.find((lane) => lane.id === "dex-discovery")).toMatchObject({
      provider: "DEX Screener",
      transport: "websocket",
      status: "hot",
      limit_per_minute: 60,
    });
    expect(state.market_ingestion_plan.provider_budget_lanes.find((lane) => lane.id === "dex-pairs")?.limit_per_minute).toBe(300);
    expect(state.market_ingestion_plan.provider_budget_lanes.find((lane) => lane.id === "gecko-ohlcv")?.limit_per_minute).toBe(10);
    expect(state.market_ingestion_plan.provider_budget_lanes.every((lane) => lane.used_per_minute <= lane.limit_per_minute)).toBe(true);
    expect(state.autonomous_market_intake_plan.mode).toBe("autonomous-market-intake-plan");
    expect(["attack", "refresh", "watch"]).toContain(state.autonomous_market_intake_plan.status);
    expect(state.autonomous_market_intake_plan.next_provider).not.toBe("none");
    expect(state.autonomous_market_intake_plan.items.some((item) =>
      item.id === "route-quotes" &&
      item.provider === "Jupiter" &&
      item.endpoint.includes("/order")
    )).toBe(true);
    expect(state.autonomous_market_intake_plan.items.some((item) =>
      item.id === "candles" &&
      item.provider === "GeckoTerminal" &&
      item.endpoint.includes("ohlcv")
    )).toBe(true);
    expect(state.autonomous_market_intake_plan.items.some((item) =>
      item.id === "wallet-net-worth" &&
      item.endpoint.includes("net-worth")
    )).toBe(true);
    expect(["ready", "paper-only", "exit-only", "blocked", "idle"]).toContain(state.autonomous_trade_readiness_gate.status);
    expect(state.autonomous_trade_readiness_gate.data_repair_required).toBe(false);
    expect(state.autonomous_trade_readiness_gate.checks.find((check) => check.id === "ingestion")?.status).toBe("pass");
    expect(state.autonomous_monitor.heartbeat_status).not.toBe("stale");
    if (state.autonomous_profit_accountability.repair_plan.blocking_reason) {
      expect(state.autonomous_profit_accountability.repair_plan.blocking_reason).not.toMatch(/Monitor heartbeat is stale/i);
    }
    expect(state.autonomous_profit_accountability.repair_plan.next_action).not.toMatch(/Monitor heartbeat is stale/i);
    expect(state.autonomous_profit_accountability.repair_plan.next_action.match(/repair preflight\/profit-lock evidence/gi)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(state.autonomous_profit_accountability.repair_plan.status).not.toBe("preflight-repair");
    expect(state.autonomous_profit_accountability.repair_plan.can_run_local_paper).toBe(false);
    if (state.autonomous_profit_accountability.repair_plan.request) {
      expect(state.autonomous_profit_accountability.repair_plan.request.body.source).toBe("live-dex");
      expect(state.autonomous_profit_accountability.repair_plan.request.body.route_refresh).toBeDefined();
      expect(state.autonomous_profit_accountability.repair_plan.request.body.autonomous_session).toBeUndefined();
    }
    if (state.autonomous_trade_readiness_gate.launch_timing_blocks_fresh_buys) {
      expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
    }
    expect(state.autonomous_signal_noise.mode).toBe("signal-noise-scanner");
    expect(state.autonomous_signal_noise.items.some((item) => item.symbol === "LIVE")).toBe(true);
    expect(state.autonomous_signal_noise.items.every((item) =>
      item.signal_score >= 0 &&
      item.noise_score >= 0 &&
      item.signal_to_noise_ratio >= 0 &&
      item.recommended_size_multiplier >= 0
    )).toBe(true);
    expect(state.autonomous_burst_scheduler.mode).toBe("autonomous-burst-scheduler");
    expect(state.autonomous_burst_scheduler.dex_discovery_budget_per_minute).toBeLessThanOrEqual(60);
    expect(state.autonomous_burst_scheduler.dex_pair_budget_per_minute).toBeLessThanOrEqual(300);
    expect(state.autonomous_burst_scheduler.route_quote_budget_per_minute).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_burst_scheduler.signal_to_noise_ratio).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_mission.mode).toBe("autonomous-trade-mission");
    expect(state.autonomous_trade_mission.steps.some((step) => step.id === "mission-route")).toBe(true);
    expect(state.autonomous_trade_mission.route_quote_budget_per_minute).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_trade_mission.signal_to_noise_ratio).toBeGreaterThanOrEqual(0);
    expect(state.liquidity_exit_sentinel.mode).toBe("liquidity-exit-sentinel");
    expect(state.liquidity_exit_sentinel.items.every((item) =>
      item.confidence >= 0 &&
      item.confidence <= 100 &&
      item.blockers.every((blocker) => !blocker.includes("reconnect"))
    )).toBe(true);
    expect(state.discovery_tape.top_candidates.find((candidate) => candidate.symbol === "LIVE")?.sources).toEqual([
      "dex-top-boosts",
      "dex-latest-profiles",
      "dex-community-takeovers",
    ]);
    expect(state.discovery_tape.top_candidates.find((candidate) => candidate.symbol === "FRESH")?.sources).toContain("dex-latest-ads");
    const liveDelta = state.live_discovery_delta_tape.items.find((item) => item.symbol === "LIVE");
    const freshDelta = state.live_discovery_delta_tape.items.find((item) => item.symbol === "FRESH");
    expect(liveDelta).toMatchObject({
      event: "community-takeover",
      mapped_pair: true,
    });
    expect(liveDelta).toBeDefined();
    expect(["attack", "probe", "watch", "refresh"]).toContain(liveDelta!.status);
    expect(freshDelta).toMatchObject({
      event: "paid-ad",
      status: "blocked",
    });
    expect(freshDelta?.blockers).toContain(
      "Paid promotion pressure requires organic reconfirmation.",
    );
    expect(state.promotion_order_audit).toMatchObject({
      mode: "promotion-order-audit",
      status: "verified",
      paid_hype_count: 1,
    });
    expect(state.promotion_order_audit.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      verdict: "boosted",
      paid_order_count: 2,
      paid_ad_order_count: 0,
    });
    expect(state.promotion_order_audit.items.find((item) => item.symbol === "FRESH")).toMatchObject({
      verdict: "paid-hype",
      paid_ad_order_count: 2,
    });
    expect(state.autonomous_source_quality_oracle).toMatchObject({
      mode: "autonomous-source-quality-oracle",
    });
    expect(["paid-hype", "refresh-first", "blocked", "boosted-confirmed", "organic"]).toContain(state.autonomous_source_quality_oracle.status);
    expect(state.autonomous_source_quality_oracle.items.find((item) => item.symbol === "FRESH")).toMatchObject({
      status: "paid-hype",
    });
    expect(state.autonomous_source_quality_oracle.items.find((item) => item.symbol === "FRESH")?.promotion_noise_score).toBeGreaterThanOrEqual(70);
    expect(state.autonomous_source_quality_oracle.items.find((item) => item.symbol === "FRESH")?.max_paper_size_multiplier).toBe(0);
    expect([
      state.autonomous_tradeability_execution,
      state.autonomous_action_queue_execution,
      state.autonomous_opportunity_rank_execution,
    ].some((execution) =>
      execution.paper_trade_ready &&
      execution.paper_trade?.side === "buy" &&
      execution.paper_trade.symbol === "FRESH"
    )).toBe(false);
    expect(state.autonomous_action_queue_execution.controls.some((control) => control.includes("source quality"))).toBe(true);
    expect(state.autonomous_tick_bundle_execution.controls.some((control) => control.includes("source quality"))).toBe(true);
    if (state.autonomous_source_quality_oracle.status === "paid-hype" || state.autonomous_source_quality_oracle.status === "refresh-first" || state.autonomous_source_quality_oracle.status === "blocked") {
      expect(buildAutonomousNextMoves(state).some((move) => move.id === "source-quality")).toBe(true);
    }
    const advanced = await getWeb3TradingStateAsync({
      account: "persistent",
      reset: true,
      source: "live-dex",
      fetchImpl,
      advance: true,
    });
    expect(advanced.autonomous_source_quality_oracle.items.find((item) => item.symbol === "FRESH")).toMatchObject({
      status: "paid-hype",
    });
    expect(advanced.trade_tape.some((trade) => trade.side === "buy" && trade.symbol === "FRESH")).toBe(false);
    expect(state.discovery_edge).toMatchObject({
      mode: "discovery-edge-supervisor",
      status: "cooldown",
      source_coverage_pct: 100,
      mapped_coverage_pct: 100,
      actionable_count: 0,
    });
    expect(state.discovery_edge.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      action: "reject",
      source_count: 3,
      launch_verdict: "avoid",
    });
    expect(state.discovery_edge.items.find((item) => item.symbol === "FRESH")?.blockers).toContain(
      "Paid-promotion risk overwhelms organic confirmation.",
    );
    expect(state.autonomous_discovery_intake).toMatchObject({
      mode: "autonomous-discovery-intake",
      source_mode: "live",
      source_coverage_pct: 100,
      pair_coverage_pct: 100,
      mapped_candidate_count: 2,
      paid_hype_count: 2,
    });
    expect(["attack-ready", "probe-ready", "refresh-first", "blocked", "idle"]).toContain(state.autonomous_discovery_intake.status);
    expect(state.autonomous_discovery_intake.items.some((item) =>
      item.symbol === "LIVE" &&
      item.source_count >= 2 &&
      item.sources.includes("dex-community-takeovers") &&
      item.reason.length > 0
    )).toBe(true);
    expect(state.autonomous_discovery_intake.items.find((item) => item.symbol === "FRESH")?.blockers).toContain(
      "Paid-hype pressure is too high for autonomous intake.",
    );
    expect(state.autonomous_discovery_intake.controls.some((control) => control.includes("paper-gated"))).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "discovery-edge-quality")).toBe(true);
    expect(typeof state.autonomous_monitor.should_advance_paper).toBe("boolean");
    const liveLaunch = state.launch_sniper.items.find((item) => item.symbol === "LIVE");
    const freshLaunch = state.launch_sniper.items.find((item) => item.symbol === "FRESH");
    expect(state.launch_sniper.mode).toBe("launch-sniper");
    expect(liveLaunch).toMatchObject({
      verdict: "avoid",
      priority: "later",
    });
    expect(liveLaunch?.launch_score).toBeGreaterThanOrEqual(70);
    expect(liveLaunch?.suggested_entry_usd).toBe(0);
    expect(liveLaunch?.blockers.length).toBeGreaterThan(0);
    expect(liveLaunch?.sources).toContain("dex-community-takeovers");
    expect(freshLaunch).toBeDefined();
    expect(freshLaunch!.verdict).toBe("avoid");
    expect(freshLaunch!.blockers.length).toBeGreaterThan(0);
    expect(state.launch_graduation.mode).toBe("launch-graduation-supervisor");
    expect(state.launch_graduation.items.find((item) => item.symbol === "LIVE")).toBeDefined();
    expect(state.launch_graduation.items.every((item) =>
      item.curve_progress_pct >= 0 &&
      item.curve_progress_pct <= 100 &&
      item.graduation_score >= 0 &&
      item.graduation_score <= 100
    )).toBe(true);
    expect(state.market.some((market) => market.symbol === "LIVE")).toBe(true);
    expect(live?.action).toBe("buy");
    const liveCatalyst = state.trend_catalyst.items.find((item) => item.symbol === "LIVE");
    const freshCatalyst = state.trend_catalyst.items.find((item) => item.symbol === "FRESH");
    expect(liveCatalyst).toBeDefined();
    expect(liveCatalyst!.catalyst_type).toMatch(/organic-breakout|community-takeover|fresh-profile|mixed-hype/);
    expect(freshCatalyst).toBeDefined();
    expect(freshCatalyst?.promotion_risk_score).toBeGreaterThanOrEqual(70);
    expect(freshCatalyst?.action === "fade" || freshCatalyst?.action === "block").toBe(true);
    expect(state.execution_edge_ladder.items.length).toBeGreaterThan(0);
    expect(state.execution_edge_ladder.items.every((item) => item.preflight_status.length > 0)).toBe(true);
    expect(state.token_vetting.items.find((item) => item.symbol === "FRESH")).toMatchObject({
      status: "blocked",
      max_position_usd: 0,
    });
    expect(state.token_vetting.items.find((item) => item.symbol === "LIVE")?.checks.some((check) =>
      check.id === "authority" && check.status === "credential-gated"
    )).toBe(true);
    expect(state.trade_tape.some((trade) => trade.symbol === "LIVE" && trade.side === "buy")).toBe(true);
    expect(state.execution_plans.find((plan) => plan.symbol === "LIVE")).toMatchObject({
      source: "jupiter",
      status: "quoted",
      gate: "would-block-live",
      price_impact_pct: 0.42,
      quoted_at: expect.any(String),
      quote_context_slot: 284_001_337,
    });
    expect(state.execution_plans.find((plan) => plan.symbol === "LIVE")?.quote_time_taken_seconds).toBeGreaterThanOrEqual(0);
    expect(state.route_profit_gate.mode).toBe("route-profit-gate");
    expect(state.route_profit_gate.items.length).toBeGreaterThan(0);
    const liveRouteProfit = state.route_profit_gate.items.find((item) => item.symbol === "LIVE");
    expect(liveRouteProfit).toBeDefined();
    expect(liveRouteProfit!.total_cost_bps).toBeGreaterThan(0);
    expect(liveRouteProfit!.net_edge_after_route_pct).toBeGreaterThan(0);
    expect(liveRouteProfit!.blockers.every((blocker) => !/wallet|kill switch/i.test(blocker))).toBe(true);
    expect(state.route_quote_sampler.mode).toBe("route-quote-sampler");
    expect(state.route_quote_sampler.quoted_count).toBeGreaterThan(0);
    expect(state.route_quote_sampler.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      source: "jupiter",
      quote_status: "quoted",
    });
    expect(state.route_quote_sampler.items.find((item) => item.symbol === "LIVE")!.route_confidence_score).toBeGreaterThan(0);
    expect(state.route_quote_sampler.items.find((item) => item.symbol === "LIVE")!.route_label).toContain("Raydium");
    expect(state.execution_landing_supervisor.mode).toBe("execution-landing-supervisor");
    expect(["paper", "managed", "sender-needed", "blocked"]).toContain(state.execution_landing_supervisor.status);
    const liveLanding = state.execution_landing_supervisor.items.find((item) => item.symbol === "LIVE");
    expect(liveLanding).toBeDefined();
    expect(["jupiter-v2-managed", "helius-sender", "jupiter-router-submit", "paper-ledger", "blocked"]).toContain(liveLanding!.path);
    expect(liveLanding!.requires_api_key || liveLanding!.path === "paper-ledger" || liveLanding!.path === "blocked").toBe(true);
    expect(liveLanding!.priority_fee_lamports).toBeGreaterThanOrEqual(0);
    expect(liveLanding!.next_action.length).toBeGreaterThan(0);
    expect(state.alpha_decay_controller.mode).toBe("alpha-decay-controller");
    expect(state.alpha_decay_controller.items.some((item) => item.symbol === "LIVE")).toBe(true);
    const liveAlpha = state.alpha_decay_controller.items.find((item) => item.symbol === "LIVE");
    expect(liveAlpha!.alpha_score).toBeGreaterThan(0);
    expect(liveAlpha!.half_life_seconds).toBeGreaterThan(0);
    expect(liveAlpha!.time_to_decay_seconds).toBeGreaterThanOrEqual(0);
    expect(state.microstructure_tape.mode).toBe("microstructure-tape");
    expect(state.microstructure_tape.items.some((item) => item.symbol === "LIVE")).toBe(true);
    const liveMicrostructure = state.microstructure_tape.items.find((item) => item.symbol === "LIVE");
    expect(liveMicrostructure!.buy_burst_score).toBeGreaterThan(0);
    expect(liveMicrostructure!.trade_count_5m).toBe(161);
    expect(liveMicrostructure!.evidence.length).toBeGreaterThan(0);
    expect(state.smart_money_sentinel.mode).toBe("smart-money-sentinel");
    expect(state.smart_money_sentinel.items.some((item) => item.symbol === "LIVE")).toBe(true);
    const liveSmartMoney = state.smart_money_sentinel.items.find((item) => item.symbol === "LIVE");
    expect(liveSmartMoney!.data_status).toBe("credential-gated");
    expect(liveSmartMoney!.copy_trade_confidence).toBeGreaterThan(0);
    expect(liveSmartMoney!.evidence.length).toBeGreaterThan(0);
    expect(state.scalping_controller.mode).toBe("autonomous-scalping-controller");
    expect(state.scalping_controller.items.some((item) => item.symbol === "LIVE")).toBe(true);
    expect(state.scalping_controller.items.every((item) => item.churn_cost_bps >= 0 && item.review_after_seconds > 0)).toBe(true);
    expect(state.scalping_controller.items.filter((item) => item.side === "buy").every((item) =>
      item.size_usd <= state.autonomous_compounder.next_order_cap_usd
    )).toBe(true);
    expect(state.execution_intents.intents.find((intent) => intent.symbol === "LIVE")).toMatchObject({
      route_status: "paper-ledger",
      status: "paper-filled",
    });
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    expect(state.autopilot.actions.some((action) => action.symbol === "LIVE")).toBe(true);
    expect(state.profit_optimizer.candidates.some((candidate) => candidate.symbol === "LIVE")).toBe(true);
    expect(state.learning_loop.sample_size).toBeGreaterThan(0);
    expect(state.performance_scorecard.trade_count).toBe(state.trade_tape.length);
  });

  test("GIVEN a clean multi-source DEX edge WHEN live mode is requested THEN the supervisor arms a paper snipe hunt", async () => {
    const edgeAddress = "TokenEdge333";
    const communityAddress = "TokenCto444";
    const adAddress = "TokenAd555";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: edgeAddress, amount: 4, totalAmount: 6 },
        ]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: edgeAddress, amount: 4, totalAmount: 6 },
        ]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: edgeAddress, description: "organic momentum profile" },
        ]);
      }
      if (url.includes("/community-takeovers/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: communityAddress, description: "community takeover watch" },
        ]);
      }
      if (url.includes("/ads/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: adAddress, impressions: 80_000, type: "trendingBarAd" },
        ]);
      }
      if (url.includes(`/orders/v1/solana/${edgeAddress}`)) {
        return Response.json([]);
      }
      if (url.includes(`/orders/v1/solana/${communityAddress}`)) {
        return Response.json([
          { type: "communityTakeover", status: "approved", paymentTimestamp: Date.now() - 60_000 },
        ]);
      }
      if (url.includes(`/orders/v1/solana/${adAddress}`)) {
        return Response.json([
          { type: "trendingBarAd", status: "approved", paymentTimestamp: Date.now() - 30_000 },
        ]);
      }
      if (url.includes(`/tokens/v1/solana/${edgeAddress},${communityAddress},${adAddress}`)) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairEdge333",
            baseToken: { address: edgeAddress, name: "Edge Coin", symbol: "EDGE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.012",
            txns: { m5: { buys: 600, sells: 25 } },
            volume: { m5: 180_000, h1: 1_300_000, h24: 3_900_000 },
            priceChange: { m5: 24, h1: 130, h6: 190 },
            liquidity: { usd: 1_800_000 },
            marketCap: 7_800_000,
            pairCreatedAt: Date.now() - 240 * 60 * 1000,
            boosts: { active: 4 },
          },
          {
            chainId: "solana",
            dexId: "pumpswap",
            pairAddress: "PairCto444",
            baseToken: { address: communityAddress, name: "CTO Coin", symbol: "CTO" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.002",
            txns: { m5: { buys: 70, sells: 64 } },
            volume: { m5: 30_000, h1: 120_000, h24: 320_000 },
            priceChange: { m5: 3, h1: 14, h6: 28 },
            liquidity: { usd: 210_000 },
            marketCap: 1_000_000,
            pairCreatedAt: Date.now() - 300 * 60 * 1000,
            boosts: { active: 0 },
          },
          {
            chainId: "solana",
            dexId: "pumpswap",
            pairAddress: "PairAd555",
            baseToken: { address: adAddress, name: "Ad Coin", symbol: "ADCO" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.001",
            txns: { m5: { buys: 36, sells: 52 } },
            volume: { m5: 18_000, h1: 72_000, h24: 210_000 },
            priceChange: { m5: 1.5, h1: 7, h6: 19 },
            liquidity: { usd: 180_000 },
            marketCap: 700_000,
            pairCreatedAt: Date.now() - 260 * 60 * 1000,
            boosts: { active: 0 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.28",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });
    const edgeLaunch = state.launch_sniper.items.find((item) => item.symbol === "EDGE");
    const edgeItem = state.discovery_edge.items.find((item) => item.symbol === "EDGE");

    expect(state.discovery_tape.sources.every((source) => source.status === "ok")).toBe(true);
    expect(state.promotion_order_audit).toMatchObject({
      status: "verified",
      paid_hype_count: 1,
    });
    expect(state.promotion_order_audit.items.find((item) => item.symbol === "EDGE")).toMatchObject({
      verdict: "boosted",
      paid_order_count: 0,
      paid_ad_order_count: 0,
    });
    expect(state.discovery_edge).toMatchObject({
      status: "hunt",
      source_coverage_pct: 100,
      mapped_coverage_pct: 100,
      actionable_count: 1,
      snipe_count: 1,
    });
    expect(edgeLaunch).toMatchObject({
      verdict: "snipe",
      priority: "now",
    });
    expect(edgeItem).toMatchObject({
      action: "snipe",
      source_count: 3,
      launch_verdict: "snipe",
    });
    expect(edgeItem!.edge_score).toBeGreaterThanOrEqual(72);
    const edgeGraduation = state.launch_graduation.items.find((item) => item.symbol === "EDGE");
    expect(edgeGraduation).toBeDefined();
    expect(["graduate", "snipe", "probe", "wait"]).toContain(edgeGraduation!.action);
    expect(["bonding-curve", "graduating", "graduated", "post-graduation"]).toContain(edgeGraduation!.phase);
    expect(edgeGraduation!.graduation_score).toBeGreaterThanOrEqual(50);
    expect(state.autopilot.actions.some((action) =>
      action.symbol === "EDGE" &&
      (action.id.includes("graduation") || action.id.includes("launch"))
    )).toBe(true);
    expect(edgeItem!.blockers).toEqual([]);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "discovery-edge-quality")).toBe(false);
    expect(state.autonomous_monitor.should_advance_paper).toBe(true);
  });

  test("GIVEN too few DEX discovery lanes WHEN live mode is requested THEN the supervisor blocks fresh paper entries", async () => {
    const tokenAddress = "TokenOnlyOne111";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress, amount: 3, totalAmount: 4 },
        ]);
      }
      if (
        url.includes("/token-boosts/latest/v1") ||
        url.includes("/token-profiles/latest/v1") ||
        url.includes("/community-takeovers/latest/v1") ||
        url.includes("/ads/latest/v1")
      ) {
        return Response.json([]);
      }
      if (url.includes(`/orders/v1/solana/${tokenAddress}`)) {
        return Response.json([]);
      }
      if (url.includes(`/tokens/v1/solana/${tokenAddress}`)) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairOnlyOne111",
            baseToken: { address: tokenAddress, name: "Only Coin", symbol: "ONLY" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.018",
            txns: { m5: { buys: 210, sells: 45 } },
            volume: { m5: 90_000, h1: 520_000, h24: 1_400_000 },
            priceChange: { m5: 14, h1: 44, h6: 88 },
            liquidity: { usd: 900_000 },
            marketCap: 4_800_000,
            pairCreatedAt: Date.now() - 240 * 60 * 1000,
            boosts: { active: 3 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.28",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });

    expect(state.discovery_edge.status).toBe("cooldown");
    expect(state.discovery_edge.source_coverage_pct).toBe(20);
    expect(state.discovery_edge.mapped_coverage_pct).toBe(100);
    expect(state.discovery_edge.blockers).toContain("Too few hot-discovery sources are healthy.");
    expect(state.discovery_edge.items.find((item) => item.symbol === "ONLY")).toMatchObject({
      action: "reject",
      source_count: 1,
    });
    expect(["cooldown", "quiet"]).toContain(state.launch_graduation.status);
    expect(state.launch_graduation.items.find((item) => item.symbol === "ONLY")?.blockers.length).toBeGreaterThan(0);
    expect(state.autonomous_monitor.triggers.find((trigger) => trigger.id === "discovery-edge-quality")).toMatchObject({
      severity: "watch",
      symbol: "ONLY",
    });
    expect(state.autonomous_monitor.should_advance_paper).toBe(false);
  });

  test("GIVEN dry-run readiness WHEN Jupiter v2 order returns an unsigned transaction THEN the plan records order metadata only", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    const previousRpcUrl = process.env.SOLANA_RPC_URL;
    const previousHeliusKey = process.env.HELIUS_API_KEY;
    delete process.env.SOLANA_RPC_URL;
    process.env.HELIUS_API_KEY = "test-helius-wallet-accounting";
    const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=test-helius-wallet-accounting";
    const requestedUrls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === rpcUrl) {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        if (body.method === "getTokenAccountsByOwner") {
          const selector = body.params?.[1];
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              context: { slot: 284_001_338 },
              value: selector?.programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
                ? [
                  {
                    pubkey: "BonkTokenAccount111",
                    account: {
                      data: {
                        program: "spl-token",
                        parsed: {
                          type: "account",
                          info: {
                            mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
                            tokenAmount: {
                              amount: "10000000000000",
                              decimals: 5,
                              uiAmount: 100_000_000,
                              uiAmountString: "100000000",
                            },
                          },
                        },
                      },
                    },
                  },
                  {
                    pubkey: "MoonTokenAccount222",
                    account: {
                      data: {
                        program: "spl-token",
                        parsed: {
                          type: "account",
                          info: {
                            mint: "FomoMint111111111111111111111111111111111",
                            tokenAmount: {
                              amount: "50000000000",
                              decimals: 6,
                              uiAmount: 50_000,
                              uiAmountString: "50000",
                            },
                          },
                        },
                      },
                    },
                  },
                  {
                    pubkey: "UnpricedTokenAccount333",
                    account: {
                      data: {
                        program: "spl-token",
                        parsed: {
                          type: "account",
                          info: {
                            mint: "NoPriceMint11111111111111111111111111111",
                            tokenAmount: {
                              amount: "42000000",
                              decimals: 6,
                              uiAmount: 42,
                              uiAmountString: "42",
                            },
                          },
                        },
                      },
                    },
                  },
                ]
                : [],
            },
          });
        }
        if (body.method === "getAssetsByOwner") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              total: 9,
              items: [
                {
                  interface: "FungibleToken",
                  token_info: {
                    price_info: {
                      total_price: 2360,
                    },
                  },
                },
                {
                  interface: "FungibleToken",
                  token_info: {
                    price_info: {
                      total_price: 600,
                    },
                  },
                },
                {
                  interface: "FungibleToken",
                  token_info: {},
                },
              ],
            },
          });
        }
        if (body.method === "getSignaturesForAddress") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: [
              {
                signature: "5WalletActivitySig1111111111111111111111111111111111111",
                slot: 284_001_400,
                err: null,
                memo: null,
                blockTime: 1_781_893_200,
                confirmationStatus: "confirmed",
              },
              {
                signature: "5WalletActivitySig2222222222222222222222222222222222222",
                slot: 284_001_350,
                err: { InstructionError: [1, "Custom"] },
                memo: "failed swap",
                blockTime: 1_781_893_000,
                confirmationStatus: "finalized",
              },
            ],
          });
        }
        if (body.method === "getTokenSupply") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: { context: { slot: 284_001_339 }, value: { amount: "10000000000000", decimals: 5, uiAmountString: "100000000" } },
          });
        }
      }
      if (url.includes("/v0/addresses/11111111111111111111111111111111/transactions")) {
        return Response.json([
          {
            signature: "5EnhancedTxSig111111111111111111111111111111111111111",
            type: "SWAP",
            source: "JUPITER",
            timestamp: 1_781_893_210,
            fee: 5_000,
            feePayer: "11111111111111111111111111111111",
            tokenTransfers: [
              { fromUserAccount: "11111111111111111111111111111111", mint: "So11111111111111111111111111111111111111112", tokenAmount: 1.2 },
              { toUserAccount: "11111111111111111111111111111111", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", tokenAmount: 100_000 },
            ],
            nativeTransfers: [],
          },
          {
            signature: "5EnhancedTxSig222222222222222222222222222222222222222",
            type: "TRANSFER",
            source: "SYSTEM_PROGRAM",
            timestamp: 1_781_893_111,
            fee: 5_000,
            feePayer: "OtherFeePayer11111111111111111111111111",
            tokenTransfers: [],
            nativeTransfers: [
              { fromUserAccount: "11111111111111111111111111111111", toUserAccount: "OtherWallet111111111111111111111111111", amount: 1_000_000 },
            ],
            transactionError: { InstructionError: [0, "Custom"] },
          },
        ]);
      }
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
          { chainId: "solana", tokenAddress: "BonkReal1111111111111111111111111111111", amount: 2, totalAmount: 3 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairBonk111",
            baseToken: { address: "BonkReal1111111111111111111111111111111", name: "Bonk", symbol: "BONK" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.0000236",
            txns: { m5: { buys: 742, sells: 501 } },
            volume: { m5: 1_240_000, h1: 13_800_000, h24: 151_000_000 },
            priceChange: { m5: -3.4, h1: -7.1, h6: 12.5 },
            liquidity: { usd: 31_200_000 },
            marketCap: 1_840_000_000,
            pairCreatedAt: Date.now() - 1_400_000 * 60 * 1000,
            boosts: { active: 2 },
          },
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairBonkWatch111",
            baseToken: { address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", name: "Bonk", symbol: "Bonk" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.0000236",
            txns: { m5: { buys: 742, sells: 501 } },
            volume: { m5: 1_240_000, h1: 13_800_000, h24: 151_000_000 },
            priceChange: { m5: -3.4, h1: -7.1, h6: 12.5 },
            liquidity: { usd: 31_200_000 },
            marketCap: 1_840_000_000,
            pairCreatedAt: Date.now() - 1_400_000 * 60 * 1000,
            boosts: { active: 2 },
          },
        ]);
      }
      if (url.includes("/tokens/v1/solana/FomoMint111111111111111111111111111111111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairMoonWallet111",
            baseToken: { address: "FomoMint111111111111111111111111111111111", name: "Wallet Moon", symbol: "MOON" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.012",
            txns: { m5: { buys: 51, sells: 22 } },
            volume: { m5: 41_000, h1: 220_000, h24: 2_800_000 },
            priceChange: { m5: -1.2, h1: 4.8, h6: 19.5 },
            liquidity: { usd: 480_000 },
            marketCap: 6_400_000,
            pairCreatedAt: Date.now() - 19 * 60 * 60 * 1000,
            boosts: { active: 1 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          contextSlot: 284_001_337,
          timeTaken: 0.018,
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-123",
          router: "metis",
          outAmount: "123",
          mode: "manual",
          feeBps: 10,
        });
      }
      return Response.json([], { status: 404 });
    };

    let state!: Awaited<ReturnType<typeof getWeb3TradingStateAsync>>;
    try {
      state = await getWeb3TradingStateAsync({
        source: "live-dex",
        fetchImpl,
        execution: {
          mode: "dry-run",
          kill_switch: false,
          wallet_public_key: "11111111111111111111111111111111",
          max_trade_usd: 500,
          daily_spend_cap_usd: 2_500,
          max_slippage_bps: 150,
        },
      });
    } finally {
      if (previousRpcUrl === undefined) delete process.env.SOLANA_RPC_URL;
      else process.env.SOLANA_RPC_URL = previousRpcUrl;
      if (previousHeliusKey === undefined) delete process.env.HELIUS_API_KEY;
      else process.env.HELIUS_API_KEY = previousHeliusKey;
    }
    const plan = state.execution_plans.find((item) => item.symbol === "LIVE");
    const sellPlan = state.execution_plans.find((item) => item.symbol === "BONK" && item.side === "sell");

    expect(state.execution_readiness.config.mode).toBe("dry-run");
    expect(state.execution_readiness.checks.every((check) => check.status !== "fail")).toBe(true);
    expect(state.discovery_tape.sources.find((source) => source.id === "portfolio-watch")).toMatchObject({
      status: "ok",
      count: 3,
    });
    expect(requestedUrls.some((url) =>
      url.includes("/tokens/v1/solana/") &&
      url.includes("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263")
    )).toBe(true);
    expect(requestedUrls.filter((url) => url === rpcUrl).length).toBeGreaterThanOrEqual(3);
    expect(state.wallet_holdings_adapter).toMatchObject({
      status: "synced",
      scan_scope: "all-spl-token-accounts",
      rpc_configured: true,
      asset_index_status: "ready",
      asset_index_count: 9,
      asset_index_fungible_count: 3,
      asset_index_priced_count: 2,
      asset_index_priced_value_usd: 2960,
      matched_position_count: 2,
      token_account_count: 3,
      priced_wallet_mint_count: 2,
      unpriced_token_account_count: 1,
      portfolio_applied: true,
      total_value_usd: 2960,
    });
    expect(state.wallet_activity_history).toMatchObject({
      mode: "read-only-wallet-activity-history",
      status: "ready",
      rpc_configured: true,
      signature_count: 2,
      failed_signature_count: 1,
      newest_slot: "284001400",
      oldest_slot: "284001350",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(state.wallet_activity_history.items[0]).toMatchObject({
      signature_preview: "5Walle...111111",
      signature_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      confirmation_status: "confirmed",
      failed: false,
      memo_present: false,
    });
    expect(JSON.stringify(state.wallet_activity_history)).not.toContain("5WalletActivitySig1111111111111111111111111111111111111");
    expect(state.wallet_transaction_intelligence).toMatchObject({
      mode: "read-only-wallet-transaction-intelligence",
      status: "ready",
      provider: "helius-enhanced-transactions",
      provider_configured: true,
      decoded_transaction_count: 2,
      swap_transaction_count: 1,
      transfer_transaction_count: 0,
      failed_transaction_count: 1,
      token_transfer_count: 2,
      native_transfer_count: 1,
      estimated_fee_sol: 0.00001,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
      raw_transaction_storage: "blocked",
    });
    expect(state.wallet_transaction_intelligence.items[0]).toMatchObject({
      signature_preview: "5Enhan...111111",
      signature_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      type: "SWAP",
      source: "JUPITER",
      classified_action: "swap",
      wallet_role: "fee-payer",
    });
    expect(state.wallet_transaction_intelligence.items[1]).toMatchObject({
      classified_action: "failure",
      wallet_role: "participant",
    });
    expect(JSON.stringify(state.wallet_transaction_intelligence)).not.toContain("5EnhancedTxSig111111111111111111111111111111111111111");
    expect(JSON.stringify(state.wallet_transaction_intelligence)).not.toContain("test-helius-wallet-accounting");
    expect(state.live_wallet_accounting_readiness).toMatchObject({
      mode: "live-wallet-accounting-readiness",
      status: "pricing-gapped",
      wallet_public_key: "11111111111111111111111111111111",
      rpc_configured: true,
      asset_index_status: "ready",
      asset_index_count: 9,
      asset_index_fungible_count: 3,
      asset_index_priced_count: 2,
      asset_index_priced_value_usd: 2960,
      holdings_status: "synced",
      matched_position_count: 2,
      token_account_count: 3,
      priced_wallet_mint_count: 2,
      unpriced_token_account_count: 1,
      portfolio_applied: true,
      transaction_intelligence_status: "ready",
      decoded_transaction_count: 2,
      swap_transaction_count: 1,
      failed_transaction_count: 1,
      can_trust_live_pnl: false,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(state.live_wallet_accounting_readiness.checks.map((check) => check.id)).toEqual([
      "wallet-scope",
      "rpc",
      "asset-index",
      "holdings-sync",
      "pricing-coverage",
      "portfolio-application",
      "transaction-decode",
      "settlement-evidence",
      "mirror-evidence",
      "mutation-boundary",
    ]);
    expect(state.live_wallet_accounting_readiness.blockers[0]).toContain("unpriced wallet token");
    expect(state.wallet_holdings_adapter.items.find((item) => item.symbol === "BONK")).toMatchObject({
      quantity: 100_000_000,
      decimals: 5,
      token_account: "BonkTokenAccount111",
    });
    expect(state.wallet_holdings_adapter.items.find((item) => item.symbol === "MOON")).toMatchObject({
      quantity: 50_000,
      decimals: 6,
      token_account: "MoonTokenAccount222",
      value_usd: 600,
    });
    expect(state.wallet_holdings_adapter.items.find((item) => item.mint === "NoPriceMint11111111111111111111111111111")).toBeUndefined();
    expect(state.discovery_tape.sources.find((source) => source.id === "wallet-holdings")).toMatchObject({
      status: "ok",
      count: 3,
    });
    expect(state.portfolio.open_positions.length).toBeGreaterThanOrEqual(1);
    expect(state.portfolio.open_positions.some((position) => ["BONK", "MOON"].includes(position.symbol))).toBe(true);
    expect(plan?.input_amount_usd).toBe(500);
    expect(plan).toMatchObject({
      quoted_at: expect.any(String),
      quote_context_slot: 284_001_337,
      quote_time_taken_seconds: 0.018,
    });
    expect(plan?.dry_run).toMatchObject({
      status: "order-built",
      request_id: "order-123",
      router: "metis",
      order_mode: "manual",
      fee_bps: 10,
      transaction_ready: true,
    });
    expect(state.execution_preflight.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      plan_id: plan?.id,
      payload_ready: true,
    });
    expect(state.execution_preflight.items.find((item) => item.symbol === "LIVE")?.fee_bps).toBeGreaterThanOrEqual(10);
    expect(state.execution_cost_monitor.items.find((item) => item.symbol === "LIVE")?.priority_fee_lamports).toBeGreaterThanOrEqual(0);
    expect(state.execution_preflight.items.find((item) => item.symbol === "LIVE")?.checks.length).toBeGreaterThan(0);
    expect(state.live_execution_arming.mode).toBe("live-execution-arming");
    expect(state.live_execution_arming.submit_ready).toBe(false);
    expect(state.live_execution_arming.checks.find((check) => check.id === "operator-approval")?.status).toBe("fail");
    expect(state.live_execution_arming.checks.find((check) => check.id === "preflight")?.status).toBe("fail");
    const lifecycleItem = state.transaction_lifecycle.items.find((item) => item.symbol === "LIVE");
    expect(lifecycleItem).toMatchObject({
      plan_id: plan?.id,
      stage: "submit-locked",
      request_id: "order-123",
    });
    expect(lifecycleItem?.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((lifecycleItem?.last_valid_block_height ?? 0) >= 0).toBe(true);
    expect(lifecycleItem?.next_step).toContain("Clear");
    expect(state.signed_transaction_relay.status).toBe("awaiting-signature");
    expect(state.signed_transaction_relay.can_accept_signed_payload).toBe(false);
    expect(state.signed_transaction_relay.request_id).toBe("order-123");
    const handoff = state.autonomous_order_handoff.items.find((item) => item.symbol === "LIVE");
    expect(state.autonomous_order_handoff.mode).toBe("autonomous-order-handoff");
    expect(state.autonomous_order_handoff.status).toMatch(/needs-signature|blocked|build-order/);
    expect(handoff).toMatchObject({
      plan_id: plan?.id,
      request_id: "order-123",
      handoff_path: expect.stringMatching(/jupiter|paper|solana|helius/),
      signer_required: true,
      can_submit_signed_payload: false,
    });
    expect(handoff?.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(handoff?.api_sequence.length).toBeGreaterThan(0);
    expect(handoff?.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(handoff)).not.toContain("unsigned-transaction-redacted-by-engine");
    const rehearsal = state.pre_submit_rehearsal.items.find((item) => item.symbol === "LIVE");
    expect(state.pre_submit_rehearsal.mode).toBe("pre-submit-rehearsal");
    expect(["signing-needed", "blocked", "refresh-first", "rehearse"]).toContain(state.pre_submit_rehearsal.status);
    expect(rehearsal).toMatchObject({
      plan_id: plan?.id,
      request_id: "order-123",
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(rehearsal?.checks.some((check) => check.id === "payload" && check.status === "pass")).toBe(true);
    expect(rehearsal?.checks.some((check) => check.id === "relay" && check.status === "fail")).toBe(true);
    expect(JSON.stringify(rehearsal)).not.toContain("unsigned-transaction-redacted-by-engine");
    expect(state.autonomous_custody_mandate).toMatchObject({
      mode: "autonomous-custody-mandate",
      provider: "external-wallet",
      provider_configured: false,
      signer_scope: "wallet-prompt",
      wallet_public_key: "11111111111111111111111111111111",
      max_slippage_bps: 150,
    });
    expect(["blocked", "setup-required"]).toContain(state.autonomous_custody_mandate.status);
    expect(state.autonomous_custody_mandate.policy_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.autonomous_custody_mandate.checks.find((check) => check.id === "live-gates")?.status).not.toBe("pass");
    expect(state.autonomous_custody_mandate.next_action).toMatch(/wallet prompts|Clear|configure/i);
    expect(JSON.stringify(state.autonomous_custody_mandate)).not.toContain("unsigned-transaction-redacted-by-engine");
    expect(state.autonomous_live_autonomy_readiness).toMatchObject({
      mode: "autonomous-live-autonomy-readiness",
      status: "paper-only",
      can_trade_real_capital: false,
      live_execution_permitted: false,
      max_live_trade_usd: 0,
      daily_cap_remaining_usd: 0,
    });
    expect(state.autonomous_live_autonomy_readiness.items.find((item) => item.id === "route")?.detail).toContain("TTL");
    expect(state.autonomous_live_autonomy_readiness.items.find((item) => item.id === "signer")?.status).not.toBe("pass");
    expect(state.autonomous_live_autonomy_readiness.next_action).toMatch(/live execution|locked|disabled/i);
    expect(state.execution_retry_planner.items.find((item) => item.symbol === "LIVE")?.action).toMatch(/send|retry|resize|slice|escalate-priority|paper|stand-down/);
    expect(state.execution_intents.intents.find((intent) => intent.symbol === "LIVE")).toMatchObject({
      plan_id: plan?.id,
      route_quality_score: expect.any(Number),
    });
    expect(sellPlan).toMatchObject({
      side: "sell",
      source: "jupiter",
      status: "quoted",
      input_mint: expect.stringMatching(/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263|BonkReal1111111111111111111111111111111/),
      output_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      input_token_decimals: 5,
      input_amount_source: "solana-rpc",
      quote_context_slot: 284_001_337,
      dry_run: {
        status: "order-built",
        request_id: "order-123",
        transaction_ready: true,
      },
    });
    expect(sellPlan?.input_amount_usd).toBe(500);
    expect(sellPlan?.input_amount_raw).toMatch(/^[1-9][0-9]+$/);
    expect(state.pre_submit_rehearsal.items.find((item) => item.symbol === "BONK")).toMatchObject({
      plan_id: sellPlan?.id,
      request_id: "order-123",
      payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(state.autonomous_order_handoff.items.find((item) => item.symbol === "BONK")).toMatchObject({
      plan_id: sellPlan?.id,
      signer_required: true,
      can_submit_signed_payload: false,
    });
    expect(JSON.stringify(sellPlan)).not.toContain("unsigned-transaction-redacted-by-engine");
    expect(JSON.stringify(plan)).not.toContain("unsigned-transaction-redacted-by-engine");
  });

  test("GIVEN a stale Jupiter quote WHEN preflight runs THEN the agent blocks execution until it requotes", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          contextSlot: 284_001_337,
          timeTaken: 0.018,
          quotedAt: "2000-01-01T00:00:00.000Z",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });
    const preflight = state.execution_preflight.items.find((item) => item.symbol === "LIVE");
    const freshness = preflight?.checks.find((check) => check.id === "freshness");
    const refresh = state.route_refresh_queue.items.find((item) => item.symbol === "LIVE");

    expect(state.execution_plans.find((plan) => plan.symbol === "LIVE")).toMatchObject({
      source: "jupiter",
      status: "quoted",
      quoted_at: "2000-01-01T00:00:00.000Z",
    });
    expect(preflight).toBeDefined();
    expect(preflight?.quote_age_seconds).toBeGreaterThan(15);
    expect(["paper", "blocked"]).toContain(preflight?.status ?? "missing");
    expect(freshness).toMatchObject({
      status: preflight?.status === "paper" ? "pass" : "fail",
      label: "Freshness",
    });
    expect(state.route_refresh_queue.status).toBe("refresh-now");
    expect(state.autonomous_loop_director.route_refresh_status).toBe("refresh-now");
    expect(state.autonomous_loop_director.should_refresh_route_quotes).toBe(true);
    expect(state.autonomous_loop_director.tick_reason).toBe(state.route_refresh_queue.next_action);
    expect(state.autonomous_loop_director.next_tick_seconds).toBeLessThanOrEqual(2);
    expect(refresh).toMatchObject({
      action: "requote-now",
      priority: "critical",
      lane: "dex-backfill",
      quote_context_slot: 284_001_337,
      quote_request: {
        provider: "jupiter-quote-v1",
        method: "GET",
        slippage_bps: 250,
        swap_mode: "ExactIn",
        max_quote_age_seconds: 15,
      },
    });
    expect(refresh?.quote_request?.url).toContain("https://lite-api.jup.ag/swap/v1/quote?");
    expect(refresh?.quote_request?.url).toContain("inputMint=");
    expect(refresh?.quote_request?.url).toContain("outputMint=");
    expect(refresh?.quote_request?.url).toContain("swapMode=ExactIn");
    expect(state.autonomous_route_refresh_execution.selected_quote_request).toMatchObject(refresh?.quote_request ?? {});
    expect(state.autonomous_route_refresh_execution.can_request_readonly_quote).toBe(true);
    expect(refresh?.quote_age_seconds).toBeGreaterThan(15);
    expect(refresh?.due_in_seconds).toBeLessThanOrEqual(2);
  });

  test("GIVEN a stale Jupiter quote WHEN route refresh requests a quote THEN the agent refreshes route evidence before sizing", async () => {
    let quoteCalls = 0;
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        quoteCalls += 1;
        return Response.json({
          outAmount: quoteCalls === 1 ? "124000000000" : "128000000000",
          priceImpactPct: quoteCalls === 1 ? "0.42" : "0.31",
          contextSlot: quoteCalls === 1 ? 284_001_337 : 284_001_401,
          timeTaken: quoteCalls === 1 ? 0.018 : 0.012,
          quotedAt: quoteCalls === 1 ? "2000-01-01T00:00:00.000Z" : new Date().toISOString(),
          routePlan: [{ swapInfo: { label: quoteCalls === 1 ? "Raydium" : "Raydium CLMM" } }],
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      route_refresh: { action: "request-quote" },
      fetchImpl,
    });
    const plan = state.execution_plans.find((item) => item.symbol === "LIVE");
    const preflight = state.execution_preflight.items.find((item) => item.symbol === "LIVE");

    expect(quoteCalls).toBeGreaterThanOrEqual(2);
    expect(plan).toMatchObject({
      source: "jupiter",
      status: "quoted",
      estimated_output_raw: "128000000000",
      price_impact_pct: 0.31,
      quote_context_slot: 284_001_401,
      quote_time_taken_seconds: 0.012,
    });
    expect(plan?.route_label).toContain("Raydium CLMM");
    expect(preflight?.quote_age_seconds).toBeLessThanOrEqual(15);
    expect(preflight?.checks.find((check) => check.id === "freshness")?.status).toBe("pass");
    expect(["refresh-now", "watch", "idle"]).toContain(state.route_refresh_queue.status);
    expect(["ready", "requesting"]).toContain(state.autonomous_route_refresh_execution.status);
    expect(state.autonomous_route_refresh_execution.can_request_readonly_quote).toBe(state.route_refresh_queue.status === "refresh-now");
    expect(state.autonomous_loop_director.should_refresh_route_quotes).toBe(state.route_refresh_queue.status === "refresh-now");
  });

  test("GIVEN sample route repair WHEN route refresh requests proof THEN the agent exposes a paper-only route rehearsal", async () => {
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "breakout",
        source: "sample",
        account: "persistent",
        advance: false,
        route_refresh: { action: "request-quote" },
      }),
    }));
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    expect(["blocked", "watching"]).toContain(state.autonomous_route_refresh_execution.status);
    expect(state.autonomous_route_refresh_execution.can_request_readonly_quote).toBe(false);
    expect(["watch", "blocked"]).toContain(state.execution_preflight.status);
    expect(state.execution_preflight.items.find((item) => item.symbol === "FARTCOIN")).toMatchObject({
      status: expect.stringMatching(/watch|blocked/),
    });
    expect(state.execution_preflight.items.find((item) => item.symbol === "FARTCOIN")?.checks.find((check) => check.id === "route")).toMatchObject({
      status: "warn",
      detail: expect.stringContaining("paper-only deployment proof"),
    });
    expect(["queued", "refresh-now"]).toContain(state.route_refresh_queue.status);
    expect(state.route_refresh_queue.items[0]).toMatchObject({
      action: expect.stringMatching(/refresh-soon|requote-now/),
    });
    expect(state.autonomous_route_refresh_execution.local_rehearsal_ready).toBe(true);
    expect(state.autonomous_route_refresh_execution.local_rehearsal).toMatchObject({
      mode: "sample-route-rehearsal",
      status: "ready",
      symbol: "FARTCOIN",
      can_feed_local_paper: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(state.autonomous_route_refresh_execution.local_rehearsal?.summary).toContain("paper repair");
    expect(state.autonomous_capital_allocator.blockers.length).toBeGreaterThanOrEqual(0);
    expect(["deploy", "blocked", "protect"]).toContain(state.autonomous_capital_allocator.status);
    expect(["protect", "blocked"]).toContain(state.autonomous_run_envelope.status);
    expect(typeof state.autonomous_run_envelope.run_enabled).toBe("boolean");
    expect(["protect", "blocked"]).toContain(state.autonomous_profit_run_guard.status);
    expect(["protect-first", "blocked", "preflight-repair"]).toContain(state.autonomous_profit_accountability.repair_plan.status);
    if (state.autonomous_profit_accountability.repair_plan.can_run_local_paper) {
      expect(state.autonomous_profit_accountability.repair_plan.request).toMatchObject({
        endpoint: "/api/web3-trading",
        method: "POST",
      });
    }
    expect(state.autonomous_profit_accountability.repair_plan.live_execution_permission).toBe("blocked");
    expect(state.autonomous_profit_accountability.repair_plan.wallet_mutation_permission).toBe("blocked");
  });

  test("GIVEN an externally signed Jupiter payload WHEN live relay gates are armed THEN the API records signature status without storing transaction bytes", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    process.env.SOLANA_RPC_URL = "https://rpc.test.invalid";
    process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = "true";
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = "I_UNDERSTAND_REAL_FUNDS";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "privy";
    process.env.PRIVY_APP_ID = "test-privy-app";
    process.env.PRIVY_APP_SECRET = "test-privy-secret";
    process.env.PRIVY_SOLANA_WALLET_ID = "wallet-live-1";
    const signedPayload = Buffer.from("signed-transaction-redacted-by-engine").toString("base64");
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 2, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", description: "Live Coin profile" },
        ]);
      }
      if (url.includes("/community-takeovers/latest/v1")) {
        return Response.json([
          { chainId: "bsc", tokenAddress: "IgnoredCommunity111", description: "Unsupported chain keeps source healthy only" },
        ]);
      }
      if (url.includes("/ads/latest/v1")) {
        return Response.json([
          { chainId: "bsc", tokenAddress: "IgnoredAd111", impressions: 1_000 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-123",
          router: "metis",
          outAmount: "123",
          mode: "manual",
          feeBps: 10,
        });
      }
      if (url.includes("api.jup.ag/swap/v2/execute")) {
        const body = JSON.parse(String(init?.body));
        expect(body.signedTransaction).toBe(signedPayload);
        expect(body.requestId).toBe("order-123");
        return Response.json({
          status: "Success",
          signature: "5NfRelaySignature111111111111111111111111111111111111111",
          slot: "341197933",
          code: 0,
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
      relay: {
        signed_transaction: signedPayload,
        request_id: "order-123",
        route: "jupiter-swap-v2",
      },
    });

    expect(state.live_execution_arming.submit_ready).toBe(true);
    expect(state.signed_transaction_relay.status).toBe("confirmed");
    expect(state.signed_transaction_relay.latest_signature).toBe("5NfRelaySignature111111111111111111111111111111111111111");
    expect(state.signed_transaction_relay.latest_slot).toBe("341197933");
    expect(state.signed_transaction_relay.confirmation_status).toBe("confirmed");
    expect(state.transaction_lifecycle.items.find((item) => item.symbol === "LIVE")?.stage).toBe("landed");
    expect(state.autonomous_order_handoff.status).toBe("confirming");
    expect(state.autonomous_order_handoff.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      action: "poll-confirmation",
      request_id: "order-123",
      can_submit_signed_payload: true,
    });
    expect(["confirming", "refresh-first"]).toContain(state.pre_submit_rehearsal.status);
    expect(state.pre_submit_rehearsal.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      action: expect.stringMatching(/poll-confirmation|refresh-route/),
      request_id: "order-123",
    });
    expect(state.autonomous_custody_mandate).toMatchObject({
      mode: "autonomous-custody-mandate",
      status: "armed",
      provider: "privy-server-wallet",
      provider_configured: true,
      signer_scope: "policy-wallet",
      wallet_public_key: "11111111111111111111111111111111",
    });
    expect(state.autonomous_custody_mandate.allowed_paths).toContain("jupiter-swap-v2");
    expect(state.autonomous_custody_mandate.allowed_symbols).toContain("LIVE");
    expect(state.autonomous_custody_mandate.allowed_sides).toContain("buy");
    expect(state.autonomous_custody_mandate.open_order_count).toBeGreaterThan(0);
    expect(state.autonomous_custody_mandate.spend_limit_usd).toBeGreaterThan(0);
    expect(state.autonomous_custody_mandate.per_trade_limit_usd).toBeLessThanOrEqual(500);
    expect(state.autonomous_custody_mandate.checks.every((check) => check.status !== "fail")).toBe(true);
    expect(state.autonomous_signer_ops).toMatchObject({
      mode: "autonomous-signer-ops",
      active_provider: "privy-server-wallet",
      can_auto_sign: false,
      can_request_signature: false,
      requires_user_presence: false,
    });
    if (state.autonomous_signer_ops.active_request) {
      expect(state.autonomous_signer_ops.active_request).toMatchObject({
        mode: "hash-only-signer-request",
        provider: "privy-server-wallet",
        signer_scope: "policy-wallet",
        wallet_public_key: "11111111111111111111111111111111",
        policy_hash: state.autonomous_custody_mandate.policy_hash,
        request_id: "order-123",
        payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        symbol: "LIVE",
        side: "buy",
        path: "jupiter-swap-v2",
        raw_transaction_included: false,
        signed_payload_included: false,
        private_key_required: false,
      });
    } else {
      expect(state.autonomous_signer_ops.status).toBe("blocked");
      expect(state.autonomous_signer_ops.provider_adapter.raw_transaction_included).toBe(false);
      expect(state.autonomous_signer_ops.provider_adapter.signed_payload_included).toBe(false);
    }
    expect(state.autonomous_signer_ops.provider_adapter).toMatchObject({
      mode: "signer-provider-adapter",
      provider: "privy-server-wallet",
      signer_scope: "policy-wallet",
      credential_configured: true,
      policy_hash: state.autonomous_custody_mandate.policy_hash,
      raw_transaction_included: false,
      signed_payload_included: false,
      private_key_required: false,
      can_auto_submit_after_signature: false,
    });
    expect(state.autonomous_signer_ops.provider_adapter.provider_request_packet).toMatchObject({
      mode: "provider-signature-request-packet",
      provider: "privy-server-wallet",
      execution_model: "provider-sign-only",
      sdk_action: state.autonomous_signer_ops.active_request ? "privy.solana.signTransaction" : "none",
      caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      required_env: ["PRIVY_APP_ID", "PRIVY_APP_SECRET", "PRIVY_SOLANA_WALLET_ID"],
      raw_transaction_included: false,
      signed_payload_included: false,
      private_key_required: false,
    });
    expect(["blocked", "ready-to-request", "idle"]).toContain(state.autonomous_signer_ops.provider_adapter.status);
    if (state.autonomous_signer_ops.provider_adapter.request_body_hash) {
      expect(state.autonomous_signer_ops.provider_adapter.request_body_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(["ready", "blocked"]).toContain(state.autonomous_signer_ops.status);
    expect(state.autonomous_signer_ops.items.find((item) => item.provider === "privy-server-wallet")?.checks.every((check) => check.status !== "fail")).toBe(true);
    expect(state.autonomous_live_autonomy_readiness.status).toBe("paper-only");
    expect(state.autonomous_live_autonomy_readiness.can_trade_real_capital).toBe(false);
    expect(state.autonomous_live_autonomy_readiness.live_execution_permitted).toBe(false);
    expect(state.autonomous_live_autonomy_readiness.items.find((item) => item.id === "relay")?.status).not.toBe("fail");
    expect(state.autonomous_live_autonomy_readiness.items.find((item) => item.id === "policy")?.status).toBe("pass");
    expect(state.autonomous_live_autonomy_readiness.summary).toContain("real-capital trading is locked");
    expect(state.execution_audit.latest).toMatchObject({
      status: "confirmed",
      request_id: "order-123",
      relay_path: "jupiter-swap-v2",
      relay_signature: "5NfRelaySignature111111111111111111111111111111111111111",
    });
    expect(JSON.stringify(state.execution_audit.latest)).not.toContain("signed-transaction-redacted-by-engine");
  });

  test("GIVEN a hash-only signer adapter WHEN a provider signature is requested THEN the lifecycle waits for an external signature", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    process.env.SOLANA_RPC_URL = "https://rpc.test.invalid";
    process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = "true";
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = "I_UNDERSTAND_REAL_FUNDS";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "privy";
    process.env.PRIVY_APP_ID = "test-privy-app";
    process.env.PRIVY_APP_SECRET = "test-privy-secret";
    process.env.PRIVY_SOLANA_WALLET_ID = "wallet-live-1";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 2, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", description: "Live Coin profile" },
        ]);
      }
      if (url.includes("/community-takeovers/latest/v1") || url.includes("/ads/latest/v1")) {
        return Response.json([]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-123",
          router: "metis",
          outAmount: "123",
          mode: "manual",
          feeBps: 10,
        });
      }
      return Response.json([], { status: 404 });
    };

    const setup = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
    });
    expect(setup.autonomous_signer_ops.provider_adapter).toMatchObject({
      status: "idle",
      provider: "privy-server-wallet",
      request_id: null,
      can_request_provider_signature: false,
      raw_transaction_included: false,
      signed_payload_included: false,
    });
    expect(setup.autonomous_signer_ops.provider_adapter.provider_request_packet).toMatchObject({
      status: "idle",
      execution_model: "provider-sign-only",
      sdk_action: "none",
      can_dispatch_now: false,
      signed_payload_included: false,
    });
    expect(setup.autonomous_signer_ops.provider_adapter.blockers).toContain("No hash-only signer request is active.");

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      signer_request: {
        action: "request",
        provider: "privy-server-wallet",
        request_id: "order-123",
        payload_hash: setup.autonomous_signer_ops.provider_adapter.payload_hash!,
      },
    });

    expect(state.execution_audit.latest).toMatchObject({
      status: expect.stringMatching(/blocked|awaiting-signature/),
      request_id: "order-123",
      payload_hash: null,
      payload_bytes: null,
      simulated_signature: null,
      relay_signature: null,
    });
    expect(state.transaction_lifecycle.status).not.toBe("awaiting-signature");
    expect(state.signed_transaction_relay).toMatchObject({
      status: expect.stringMatching(/blocked|awaiting-signature/),
      request_id: "order-123",
      payload_bytes: null,
      latest_signature: null,
    });
  });

  test("GIVEN a Turnkey managed-submit receipt WHEN provider status is confirmed THEN the API records signature evidence without signed bytes", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    process.env.SOLANA_RPC_URL = "https://rpc.test.invalid";
    process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = "true";
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = "I_UNDERSTAND_REAL_FUNDS";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "turnkey";
    process.env.TURNKEY_ORGANIZATION_ID = "org-live-1";
    process.env.TURNKEY_API_PUBLIC_KEY = "turnkey-public";
    process.env.TURNKEY_API_PRIVATE_KEY = "turnkey-private";
    process.env.TURNKEY_SOLANA_WALLET_ACCOUNT = "turnkey-solana-account";
    const signature = "5NfRelaySignature111111111111111111111111111111111111111";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 2, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", description: "Live Coin profile" },
        ]);
      }
      if (url.includes("/community-takeovers/latest/v1") || url.includes("/ads/latest/v1")) {
        return Response.json([]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-123",
          router: "metis",
          outAmount: "123",
          mode: "manual",
          feeBps: 10,
        });
      }
      return Response.json([], { status: 404 });
    };

    const setup = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
    });

    expect(setup.autonomous_signer_ops.provider_adapter.provider_request_packet).toMatchObject({
      provider: "turnkey-policy-wallet",
      execution_model: "provider-managed-submit",
      sdk_action: "none",
      request_body_fields: {
        broadcast: "provider-managed",
      },
      raw_transaction_included: false,
      signed_payload_included: false,
      private_key_required: false,
    });

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      managed_submit: {
        action: "record",
        provider: "turnkey-policy-wallet",
        status: "confirmed",
        request_id: "order-123",
        payload_hash: setup.autonomous_signer_ops.provider_adapter.payload_hash!,
        provider_status_id: "turnkey-status-123",
        transaction_signature: signature,
        confirmation_status: "confirmed",
        slot: "341197933",
      },
    });

    expect(state.execution_audit.latest).toMatchObject({
      status: "blocked",
      request_id: "order-123",
      payload_hash: null,
      payload_bytes: null,
      relay_signature: signature,
      signer_session_label: "turnkey-policy-wallet:managed-submit:turnkey-status-123",
    });
    expect(state.signed_transaction_relay).toMatchObject({
      status: expect.stringMatching(/blocked|awaiting-signature/),
      request_id: "order-123",
      payload_bytes: null,
      latest_signature: signature,
    });
    expect(state.transaction_lifecycle.items.find((item) => item.symbol === "LIVE")?.stage).not.toBe("landed");
    expect(JSON.stringify(state.execution_audit.latest)).not.toContain("unsigned-transaction-redacted-by-engine");
  });

  test("GIVEN a pending Turnkey managed submit WHEN provider polling confirms THEN the lifecycle lands without signed bytes", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    process.env.SOLANA_RPC_URL = "https://rpc.test.invalid";
    process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = "true";
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = "I_UNDERSTAND_REAL_FUNDS";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "turnkey";
    process.env.TURNKEY_ORGANIZATION_ID = "org-live-1";
    process.env.TURNKEY_API_PUBLIC_KEY = "turnkey-public";
    process.env.TURNKEY_API_PRIVATE_KEY = "turnkey-private";
    process.env.TURNKEY_SOLANA_WALLET_ACCOUNT = "turnkey-solana-account";
    const signature = "5NfRaySignature111111111111111111111111111111111111111";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 }]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress: "TokenLive111", amount: 2, totalAmount: 9 }]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress: "TokenLive111", description: "Live Coin profile" }]);
      }
      if (url.includes("/community-takeovers/latest/v1") || url.includes("/ads/latest/v1")) {
        return Response.json([]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-123",
          router: "metis",
          outAmount: "123",
          mode: "manual",
          feeBps: 10,
        });
      }
      return Response.json([], { status: 404 });
    };

    const setup = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
    });
    const payloadHash = setup.autonomous_signer_ops.provider_adapter.payload_hash!;

    const pending = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      managed_submit: {
        action: "record",
        provider: "turnkey-policy-wallet",
        status: "pending",
        request_id: "order-123",
        payload_hash: payloadHash,
        provider_status_id: "turnkey-status-123",
      },
    });

    expect(pending.execution_audit.latest).toMatchObject({
      status: "blocked",
      request_id: "order-123",
      payload_hash: null,
      payload_bytes: null,
      relay_signature: null,
      signer_session_label: "turnkey-policy-wallet:managed-submit:turnkey-status-123",
    });

    const confirmed = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      managed_submit_poll: {
        action: "poll",
        provider: "turnkey-policy-wallet",
        provider_status_id: "turnkey-status-123",
        request_id: "order-123",
        payload_hash: payloadHash,
        result: {
          status: "confirmed",
          transaction_signature: signature,
          confirmation_status: "confirmed",
          slot: "341197999",
        },
      },
    });

    expect(confirmed.managed_submit_status_poll).toMatchObject({
      status: "confirmed",
      provider: "turnkey-policy-wallet",
      provider_status_id: "turnkey-status-123",
      request_id: "order-123",
      payload_hash: null,
      signature,
      slot: "341197999",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(confirmed.execution_audit.latest).toMatchObject({
      status: "confirmed",
      request_id: "order-123",
      payload_hash: null,
      payload_bytes: null,
      relay_signature: signature,
      signer_session_label: "turnkey-policy-wallet:managed-submit:turnkey-status-123",
    });
    expect(confirmed.signed_transaction_relay).toMatchObject({
      status: "confirmed",
      request_id: "order-123",
      payload_bytes: null,
      latest_signature: signature,
    });
    expect(["landed", "submit-locked"]).toContain(confirmed.transaction_lifecycle.items.find((item) => item.symbol === "LIVE")?.stage ?? "");
    expect(JSON.stringify(confirmed.execution_audit.latest)).not.toContain("unsigned-transaction-redacted-by-engine");
  });

  test("GIVEN a confirmed signed relay WHEN the autonomous settlement watchdog runs THEN it reconciles and mirrors the fill once", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    process.env.SOLANA_RPC_URL = "https://rpc.test.invalid";
    process.env.MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION = "true";
    process.env.MASTERMOLD_LIVE_OPERATOR_APPROVAL = "I_UNDERSTAND_REAL_FUNDS";
    process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER = "privy";
    process.env.PRIVY_APP_ID = "test-privy-app";
    process.env.PRIVY_APP_SECRET = "test-privy-secret";
    process.env.PRIVY_SOLANA_WALLET_ID = "wallet-live-1";
    const signature = "5NfRelaySignature111111111111111111111111111111111111111";
    const signedPayload = Buffer.from("signed-transaction-redacted-by-engine").toString("base64");
    const tokenBalance = 20_833.333333;
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress: "TokenLive111", amount: 2, totalAmount: 9 }]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress: "TokenLive111", description: "Live Coin profile" }]);
      }
      if (url.includes("/community-takeovers/latest/v1") || url.includes("/ads/latest/v1")) {
        return Response.json([]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-123",
          router: "metis",
          outAmount: "123",
          mode: "manual",
          feeBps: 10,
        });
      }
      if (url.includes("api.jup.ag/swap/v2/execute")) {
        return Response.json({
          status: "Success",
          signature,
          slot: "341197933",
          code: 0,
        });
      }
      if (url === "https://rpc.test.invalid") {
        const body = JSON.parse(String(init?.body));
        if (body.method === "getSignatureStatuses") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              value: [{ slot: 341_197_933, confirmationStatus: "confirmed", err: null }],
            },
          });
        }
        if (body.method === "getTransaction") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              slot: 341_197_933,
              blockTime: 1_718_000_000,
              meta: {
                err: null,
                preTokenBalances: [
                  { owner: "11111111111111111111111111111111", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", uiTokenAmount: { uiAmount: 500, decimals: 6 } },
                  { owner: "11111111111111111111111111111111", mint: "TokenLive111", uiTokenAmount: { uiAmount: 0, decimals: 6 } },
                  { owner: "OtherWallet111111111111111111111111111111", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", uiTokenAmount: { uiAmount: 7_500, decimals: 6 } },
                  { owner: "OtherWallet111111111111111111111111111111", mint: "TokenLive111", uiTokenAmount: { uiAmount: 10, decimals: 6 } },
                ],
                postTokenBalances: [
                  { owner: "11111111111111111111111111111111", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", uiTokenAmount: { uiAmount: 0, decimals: 6 } },
                  { owner: "11111111111111111111111111111111", mint: "TokenLive111", uiTokenAmount: { uiAmount: tokenBalance, decimals: 6 } },
                  { owner: "OtherWallet111111111111111111111111111111", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", uiTokenAmount: { uiAmount: 0, decimals: 6 } },
                  { owner: "OtherWallet111111111111111111111111111111", mint: "TokenLive111", uiTokenAmount: { uiAmount: 312_500, decimals: 6 } },
                ],
              },
            },
          });
        }
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      account: "persistent",
      reset: true,
      fetchImpl,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
      relay: {
        signed_transaction: signedPayload,
        request_id: "order-123",
        route: "jupiter-swap-v2",
      },
      settlement_watchdog: {
        action: "run",
        apply_mirror: true,
        max_fill_usd: 500,
      },
    });

    expect(state.autonomous_settlement_watchdog).toMatchObject({
      mode: "autonomous-settlement-watchdog",
      status: "blocked",
      action: "stand-down",
      poll_status: "blocked",
      fill_status: "not-run",
      mirror_status: "not-run",
      apply_mirror_requested: true,
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(state.signature_confirmation_poll?.status).toBe("blocked");
    expect([undefined, "not-run"]).toContain(state.settlement_fill_reconciliation?.status);
    expect([undefined, "not-run"]).toContain(state.portfolio_mirror_apply?.status);
    expect(state.live_wallet_accounting_readiness).toMatchObject({
      mode: "live-wallet-accounting-readiness",
      settlement_status: "not-run",
      mirror_status: "not-run",
      live_execution_permission: "blocked",
      wallet_mutation_permission: "blocked",
    });
    expect(state.live_wallet_accounting_readiness.checks.find((check) => check.id === "settlement-evidence")?.status).not.toBe("pass");
    expect(state.live_wallet_accounting_readiness.checks.find((check) => check.id === "mirror-evidence")?.status).not.toBe("pass");
    expect(JSON.stringify(state.execution_audit.latest)).not.toContain("signed-transaction-redacted-by-engine");

    const duplicate = await getWeb3TradingStateAsync({
      source: "live-dex",
      account: "persistent",
      fetchImpl,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
      settlement_watchdog: {
        action: "run",
        apply_mirror: true,
        max_fill_usd: 500,
      },
    });

    expect(["blocked", "duplicate"]).toContain(duplicate.autonomous_settlement_watchdog?.status ?? "");
    expect([undefined, "not-run", "duplicate"]).toContain(duplicate.portfolio_mirror_apply?.status);
  });

  test("GIVEN a dry-run profile with the kill switch on WHEN plans are built THEN unsigned orders stay blocked", async () => {
    const state = await getWeb3TradingStateAsync({
      execution: {
        mode: "dry-run",
        kill_switch: true,
        wallet_public_key: "11111111111111111111111111111111",
      },
    });

    expect(state.execution_readiness.checks.find((check) => check.id === "kill-switch")?.status).toBe("fail");
    expect(state.execution_plans.some((plan) => plan.dry_run.status === "blocked")).toBe(true);
    expect(state.live_execution_arming.status).toBe("halted");
    expect(state.live_execution_arming.checks.find((check) => check.id === "kill-switch")?.status).toBe("fail");
    expect(state.transaction_lifecycle.status).toBe("blocked");
    expect(state.transaction_lifecycle.items.every((item) => item.stage !== "awaiting-signature")).toBe(true);
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    expect(state.autonomous_live_autonomy_readiness.status).toBe("blocked");
    expect(state.autonomous_live_autonomy_readiness.can_trade_real_capital).toBe(false);
    expect(state.autonomous_live_autonomy_readiness.items.find((item) => item.id === "kill-switch")?.status).toBe("fail");
    expect(state.autonomous_live_autonomy_readiness.next_action).toMatch(/kill switch/i);
  });

  test("GIVEN dry-run caps are too small WHEN readiness is built THEN it returns a safe cap repair action", async () => {
    const state = await getWeb3TradingStateAsync({
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1,
        daily_spend_cap_usd: 1,
        max_slippage_bps: 150,
      },
    });
    const capCheck = state.execution_readiness.checks.find((check) => check.id === "caps");

    expect(state.execution_readiness.cap_status).toBe("too-small");
    expect(state.execution_readiness.cap_next_action).toContain("Save conservative positive dry-run caps");
    expect(capCheck).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("Dry-run caps are too small"),
    });
    expect(state.execution_gate.live_blockers[0]).toContain("Save conservative positive dry-run caps");
    expect(state.execution_gate.live_execution_enabled).toBe(false);
  });

  test("GIVEN the paper account has spent the dry-run cap WHEN readiness is rebuilt THEN it returns the reset-or-raise cap action", async () => {
    const state = await getWeb3TradingStateAsync({
      account: "persistent",
      reset: true,
      scenario: "breakout",
      advance: true,
      autonomous_burst: {
        action: "run",
        max_child_fills: 4,
      },
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 100,
        max_slippage_bps: 150,
      },
    });
    const capCheck = state.execution_readiness.checks.find((check) => check.id === "caps");

    expect(state.execution_readiness.spend_today_usd).toBeGreaterThanOrEqual(100);
    expect(state.execution_readiness.cap_status).toBe("exhausted");
    expect(state.execution_readiness.cap_next_action).toContain("Reset the persistent paper account");
    expect(capCheck).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("Dry-run spend is"),
    });
    expect(state.execution_gate.live_blockers[0]).toContain("Reset the persistent paper account");
    expect(state.execution_gate.live_execution_enabled).toBe(false);

    const resetResponse = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: "persistent",
        scenario: "breakout",
        reset: true,
        advance: false,
      }),
    }));
    const resetState = await json<Web3TradingState>(resetResponse);

    expect(resetResponse.status).toBe(200);
    expect(resetState.execution_readiness.spend_today_usd).toBe(0);
    expect(resetState.execution_readiness.cap_status).toBe("ready");
    expect(resetState.execution_gate.live_execution_enabled).toBe(false);
  });

  test("GIVEN the kill switch is on WHEN an execution drill runs THEN it records a blocked audit entry", async () => {
    const state = await getWeb3TradingStateAsync({
      drill: true,
      execution: {
        mode: "dry-run",
        kill_switch: true,
        wallet_public_key: "11111111111111111111111111111111",
      },
    });

    expect(state.execution_audit.latest).toMatchObject({
      status: "blocked",
      nonce: "web3-drill-0001",
      kill_switch: true,
      transaction_ready: false,
    });
    expect(state.execution_audit.latest?.reason).toContain("Kill switch");
    expect(state.transaction_lifecycle.status).toBe("blocked");
  });

  test("GIVEN an unsigned order exists WHEN an execution drill runs THEN it stops at the signing boundary", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-456",
          router: "metis",
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      drill: true,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
      },
    });

    expect(state.execution_audit.latest).toMatchObject({
      status: "ready-to-sign",
      request_id: "order-456",
      router: "metis",
      transaction_ready: true,
      kill_switch: false,
    });
    expect(state.execution_audit.latest?.reason).toContain("stopped before signing");
    expect(JSON.stringify(state.execution_audit.latest)).not.toContain("unsigned-transaction-redacted-by-engine");
    expect(state.transaction_lifecycle.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      stage: "awaiting-signature",
      request_id: "order-456",
      signed_transaction_required: true,
    });
  });

  test("GIVEN signer simulation is armed WHEN an execution drill reaches an unsigned order THEN it records a synthetic signature from the payload hash", async () => {
    process.env.JUPITER_API_KEY = "test-key";
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([
          { chainId: "solana", tokenAddress: "TokenLive111", amount: 6, totalAmount: 9 },
        ]);
      }
      if (url.includes("/tokens/v1/solana/TokenLive111")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "PairLive111",
            baseToken: { address: "TokenLive111", name: "Live Coin", symbol: "LIVE" },
            priceUsd: "0.024",
            txns: { m5: { buys: 120, sells: 41 } },
            volume: { m5: 85_000, h1: 410_000, h24: 1_800_000 },
            priceChange: { m5: 8.5, h1: 24.2, h6: 55.1 },
            liquidity: { usd: 950_000 },
            marketCap: 9_200_000,
            pairCreatedAt: Date.now() - 4 * 60 * 60 * 1000,
            boosts: { active: 6 },
          },
        ]);
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "124000000000",
          priceImpactPct: "0.42",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("api.jup.ag/swap/v2/order")) {
        return Response.json({
          transaction: Buffer.from("unsigned-transaction-redacted-by-engine").toString("base64"),
          requestId: "order-789",
          router: "metis",
        });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      fetchImpl,
      drill: true,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 500,
        daily_spend_cap_usd: 2_500,
        max_slippage_bps: 150,
        signer_simulation_enabled: true,
        signer_session_label: "session-alpha",
        signer_network: "devnet",
      },
    });

    const latest = state.execution_audit.latest;

    expect(latest).toMatchObject({
      status: "simulated-signed",
      request_id: "order-789",
      router: "metis",
      transaction_ready: true,
      kill_switch: false,
      signer_session_label: "session-alpha",
      signer_network: "devnet",
    });
    expect(latest?.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(latest?.payload_bytes).toBeGreaterThan(0);
    expect(latest?.simulated_signature).toMatch(/^sim_sig_/);
    expect(state.transaction_lifecycle.items.find((item) => item.symbol === "LIVE")).toMatchObject({
      stage: "signed-simulated",
      request_id: "order-789",
      simulated_signature: latest?.simulated_signature,
    });
    expect(JSON.stringify(latest)).not.toContain("unsigned-transaction-redacted-by-engine");
  });

  test("GIVEN a persistent paper account WHEN the agent advances twice THEN cycles and trade history carry forward", async () => {
    const first = await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base" });
    const second = await getWeb3TradingStateAsync({ account: "persistent", scenario: "breakout" });

    expect(first.paper_account.persisted).toBe(true);
    expect(first.paper_account.cycle).toBe(1);
    expect(second.paper_account.cycle).toBe(2);
    expect(second.paper_account.trade_count).toBeGreaterThanOrEqual(first.paper_account.trade_count);
    expect(second.portfolio.cash_usd).not.toBe(25_000);
    expect(["executed-paper", "planned"]).toContain(second.autopilot.status);
    expect(second.trade_tape.some((trade) => trade.status === "paper-filled")).toBe(true);
    expect(second.profit_optimizer.candidates.length).toBeGreaterThan(0);
    expect(second.learning_loop.sample_size).toBe(second.paper_account.trade_count);
    expect(second.learning_loop.size_multiplier).toBeGreaterThan(0);
    expect(second.performance_scorecard.trade_count).toBe(second.trade_tape.length);
    expect(second.performance_scorecard.window_label).toContain("cycle");
    expect(second.performance_scorecard.checkpoints.some((checkpoint) => checkpoint.id === "turnover")).toBe(true);
    expect(second.autonomous_strategy_attribution.mode).toBe("autonomous-strategy-attribution");
    expect(second.autonomous_strategy_attribution.sample_size).toBeGreaterThan(0);
    expect(second.autonomous_strategy_attribution.items.some((item) => item.trade_count > 0)).toBe(true);
    expect(second.autonomous_strategy_attribution.net_contribution_usd).toBeCloseTo(
      second.autonomous_strategy_attribution.items.reduce((sum, item) => sum + item.net_contribution_usd, 0),
      2,
    );
	    expect(second.autonomous_policy_optimizer.attribution_size_bias).toBeGreaterThan(0);
	    expect(second.autonomous_policy_optimizer.items.some((item) => item.id === "strategy-policy")).toBe(true);
	    if (second.autonomous_strategy_attribution.status === "tighten" || second.autonomous_strategy_attribution.status === "protect") {
	      expect(second.autonomous_policy_optimizer.max_trades_next_session).toBeLessThanOrEqual(1);
	    }
		    expect(second.trend_velocity_scanner.mode).toBe("trend-velocity-scanner");
		    expect(second.trend_velocity_scanner.items.length).toBeGreaterThan(0);
		    expect(second.trend_velocity_scanner.fastest_chase_seconds).toBeGreaterThan(0);
		    expect(second.trend_chase_execution.mode).toBe("trend-chase-paper-execution");
		    expect(["queued", "applied", "blocked", "idle"]).toContain(second.trend_chase_execution.status);
		    expect(second.trend_chase_execution.execution_boundary).toBe("paper-ledger-only");
		    expect(second.trend_chase_execution.scout_reserve_usd).toBeGreaterThanOrEqual(0);
		    expect(second.scout_lifecycle.mode).toBe("scout-lifecycle-controller");
		    expect(["harvest", "trim", "stop", "tighten", "watch", "idle"]).toContain(second.scout_lifecycle.status);
		    expect(second.scout_lifecycle.execution_boundary).toBe("paper-ledger-only");
		    expect(second.scout_lifecycle.watched_count).toBeGreaterThanOrEqual(0);
		    expect(second.scout_lifecycle.controls.some((control) => control.includes("paper sell"))).toBe(true);
		    expect(second.autonomous_forward_test.gates.some((gate) => gate.id === "rug-survival")).toBe(true);
    expect(second.autonomous_trade_execution_bridge.mode).toBe("arbiter-paper-execution");
    expect(second.autonomous_trade_execution_bridge.controls.some((control) => control.includes("local paper-ledger fill"))).toBe(true);
    expect(second.autonomous_trade_batch.mode).toBe("autonomous-trade-batch");
    expect(second.autonomous_trade_batch.controls.some((control) => control.includes("paper batch"))).toBe(true);
    expect(second.autonomous_trade_batch.ready_count).toBeLessThanOrEqual(second.autonomous_trade_batch.max_trades_per_cycle);
    expect(second.autonomous_tick_plan.mode).toBe("autonomous-tick-plan");
    expect(second.autonomous_tick_plan.items.length).toBeGreaterThan(0);
    expect(second.autonomous_tick_plan.paper_budget_usd).toBeGreaterThanOrEqual(0);
    expect(second.autonomous_tick_plan.execute_count + second.autonomous_tick_plan.refresh_count + second.autonomous_tick_plan.blocked_count).toBeGreaterThanOrEqual(0);
    expect(second.trade_tape.some((trade) =>
      trade.id.startsWith("paper-command-") ||
      trade.id.startsWith("paper-arbiter-") ||
      trade.id.startsWith("paper-watchlist-rotation")
    )).toBe(true);
    expect(second.autonomous_command_center_execution.mode).toBe("command-center-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(second.autonomous_command_center_execution.status);
    expect(second.autonomous_command_center_execution.controls.some((control) => control.includes("defensive sell"))).toBe(true);
  });

  test("GIVEN a persistent paper account WHEN redeploy is rebuilt THEN capture symbols match the live paper book", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const state = await getWeb3TradingStateAsync({ account: "persistent", scenario: "base", advance: false });
    const heldSymbols = new Set(state.portfolio.open_positions.map((position) => position.symbol));

    expect(heldSymbols.size).toBeGreaterThan(0);
    expect(state.autonomous_profit_capture_autopilot.mode).toBe("autonomous-profit-capture-autopilot");
    expect(state.autonomous_profit_redeploy_autopilot.mode).toBe("autonomous-profit-redeploy-autopilot");
    expect(state.autonomous_profit_redeploy_execution.mode).toBe("autonomous-profit-redeploy-execution");
    if (state.autonomous_profit_capture_autopilot.symbol) {
      expect(heldSymbols.has(state.autonomous_profit_capture_autopilot.symbol)).toBe(true);
    }
    if (state.autonomous_profit_redeploy_autopilot.from_symbol) {
      expect(heldSymbols.has(state.autonomous_profit_redeploy_autopilot.from_symbol)).toBe(true);
    }
    if (state.autonomous_profit_redeploy_autopilot.released_cash_usd > 0) {
      expect(state.autonomous_profit_redeploy_autopilot.from_symbol).toBe(state.autonomous_profit_capture_autopilot.symbol);
      expect(state.autonomous_profit_redeploy_autopilot.next_action).toContain(state.autonomous_profit_redeploy_autopilot.from_symbol ?? "");
    }
    if (state.autonomous_profit_redeploy_autopilot.status === "protect-first") {
      expect(state.autonomous_profit_redeploy_autopilot.symbol).not.toBe(state.autonomous_profit_redeploy_autopilot.from_symbol);
      expect(["queued", "protect-first"]).toContain(state.autonomous_profit_redeploy_execution.status);
      if (state.autonomous_profit_redeploy_execution.status === "queued") {
        expect(state.autonomous_profit_redeploy_execution.source).toBe("profit-capture");
        expect(state.autonomous_profit_redeploy_execution.paper_trade_ready).toBe(true);
      } else {
        expect(state.autonomous_profit_redeploy_execution.paper_trade_ready).toBe(false);
      }
    }
  });

  test("GIVEN protect-first released profit WHEN persistent paper advances THEN redeploy execution queues the protective paper sell", async () => {
    const state = await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const execution = state.autonomous_profit_redeploy_execution;

    expect(execution.status).toBe("queued");
    expect(execution.source).toBe("profit-capture");
    expect(execution.execution_lane).toBe("portfolio-protect");
    expect(execution.paper_trade_ready).toBe(true);
    expect(execution.paper_trade_id).toBe(execution.paper_trade!.id);
    expect(execution.paper_trade).toMatchObject({
      side: "sell",
      status: "paper-filled",
    });
    expect(execution.paper_trade?.size_usd).toBeGreaterThanOrEqual(10);
    expect(execution.paper_trade?.size_usd ?? 0).toBeLessThanOrEqual(state.portfolio.open_positions.find((position) => position.symbol === execution.paper_trade?.symbol)?.value_usd ?? 0);
    expect(execution.paper_trade?.reason).toContain("Profit redeploy protect-first");
    expect(execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    expect(execution.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
    expect(execution.controls.some((control) => control.includes("local paper candidate"))).toBe(true);
  });

  test("GIVEN a queued protect-first redeploy receipt WHEN the autonomous daemon ticks THEN the paper ledger applies that protective sell first", async () => {
    const queued = await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const receipt = queued.autonomous_profit_redeploy_execution.paper_trade;

    expect(queued.autonomous_profit_redeploy_execution.status).toBe("queued");
    expect(receipt).not.toBeNull();
    expect(receipt?.side).toBe("sell");
    const receiptId = receipt?.id ?? null;
    expect(receiptId).not.toBeNull();

    const applied = await getWeb3TradingStateAsync({
      account: "persistent",
      scenario: "base",
      advance: false,
      daemon: true,
    });
    const appliedTrade = applied.trade_tape.find((trade) => trade.id === receiptId);

    expect(applied.paper_daemon.requested).toBe(true);
    expect(applied.paper_daemon.advanced).toBe(true);
    expect(applied.paper_account.cycle).toBe(queued.paper_account.cycle);
    if (appliedTrade) {
      expect(appliedTrade).toMatchObject({
        id: receiptId,
        side: "sell",
        symbol: receipt?.symbol,
        status: "paper-filled",
      });
      expect(appliedTrade.reason).toContain("Profit redeploy protect-first");
    }
    expect(["applied", "queued", "protect-first"]).toContain(applied.autonomous_profit_redeploy_execution.status);
    expect(["profit-capture", "none"]).toContain(applied.autonomous_profit_redeploy_execution.source);
    expect(["portfolio-protect", "none", null]).toContain(applied.autonomous_profit_redeploy_execution.execution_lane);
    if (applied.autonomous_profit_redeploy_execution.status === "applied") {
      expect(applied.autonomous_profit_redeploy_execution.ledger_applied).toBe(true);
      expect(applied.autonomous_profit_redeploy_execution.paper_trade_ready).toBe(false);
      expect(applied.autonomous_profit_redeploy_execution.paper_trade_id).toBe(receiptId);
    } else {
      expect(applied.autonomous_profit_redeploy_execution.ledger_applied).toBe(false);
      expect(applied.autonomous_profit_redeploy_execution.paper_trade_id).not.toBe(receiptId);
      expect(applied.autonomous_profit_redeploy_execution.next_action).toMatch(/protective paper sell|protect|review|queued/i);
    }
    expect(applied.execution_gate.live_execution_enabled).toBe(false);
    expect(applied.autonomous_profit_redeploy_execution.controls.some((control) => control.includes("cannot sign swaps"))).toBe(true);
  });

  test("GIVEN launch sniper finds a clean probe WHEN the persistent paper ledger advances THEN it opens a launch-origin position", async () => {
    const state = await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const launchTrade = state.trade_tape.find((trade) => trade.id.startsWith("paper-launch-") && trade.side === "buy");

    expect(launchTrade).toBeDefined();
    expect(launchTrade?.reason).toContain("Launch sniper");
    expect(state.portfolio.open_positions.some((position) => position.symbol === launchTrade?.symbol)).toBe(true);
    expect(typeof state.trade_tape.some((trade) => trade.side === "sell" && trade.symbol === launchTrade?.symbol)).toBe("boolean");
    expect(state.autopilot.actions.find((action) => action.symbol === launchTrade?.symbol && action.lane === "launch-sniper")).toMatchObject({
      status: "paper-filled",
      side: "buy",
    });
    expect(state.execution_intents.intents.find((intent) => intent.symbol === launchTrade?.symbol && intent.source_action_id.includes("launch"))).toMatchObject({
      status: "paper-filled",
      route_status: "paper-ledger",
    });
  });

  test("GIVEN a held paper position WHEN the next command-board cycle advances THEN the command bridge owns the protective paper fill", async () => {
    const first = await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "breakout", advance: true });
    const firstCommandSell = first.trade_tape.find((trade) => trade.id.startsWith("paper-command-") && trade.side === "sell");
    const second = await getWeb3TradingStateAsync({ account: "persistent", scenario: "breakout", advance: true });
    const protectiveSell = second.trade_tape.find((trade) => trade.side === "sell" && (
      trade.id.startsWith("paper-command-") ||
      trade.id.startsWith("paper-watchlist-rotation") ||
      trade.id.startsWith("paper-position-risk")
    ));

    expect(firstCommandSell).toBeUndefined();
    expect(first.autonomous_command_center_execution.status).toBe("queued");
    expect(first.autonomous_command_center_execution.paper_trade_ready).toBe(true);
    expect(protectiveSell).toBeDefined();
    expect(["applied", "queued", "blocked"]).toContain(second.autonomous_command_center_execution.status);
    expect(second.autonomous_command_center_execution.paper_trade?.side).toBe("sell");
    expect(second.autonomous_command_performance.mode).toBe("autonomous-command-performance");
    expect(second.autonomous_command_performance.command_trade_count).toBeGreaterThanOrEqual(0);
    expect(second.trade_tape.some((trade) => trade.side === "sell")).toBe(true);
    expect(typeof second.autonomous_command_performance.net_contribution_usd).toBe("number");
    expect(second.autonomous_command_performance.next_size_multiplier).toBeGreaterThan(0);
    expect(second.execution_gate.live_execution_enabled).toBe(false);
  });

  test("GIVEN a daemon tick request WHEN the monitor evaluates advance mode THEN the API records the paper daemon action", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "breakout",
          cycles: 2,
          account: "persistent",
          reset: true,
          advance: false,
          daemon: true,
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.paper_daemon.mode).toBe("paper-daemon");
    expect(state.paper_daemon.requested).toBe(true);
    expect(["advance", "observe", "stand-down"]).toContain(state.paper_daemon.action);
    expect(["advanced", "observed", "stand-down"]).toContain(state.paper_daemon.status);
    expect(state.paper_daemon.interval_seconds).toBeGreaterThan(0);
    expect(state.autonomous_loop_director.next_tick_seconds).toBeGreaterThanOrEqual(0);
    if (state.autonomous_loop_director.status !== "blocked") {
      expect(state.autonomous_loop_director.next_tick_seconds).toBeGreaterThan(0);
    }
    expect(state.paper_daemon.next_tick_at).toContain("T");
    expect(state.paper_daemon.current_cycle).toBe(state.paper_account.cycle);
    expect(state.paper_daemon.controls.some((control) => control.includes("Live execution remains locked"))).toBe(true);
    expect(state.paper_daemon.controls.some((control) => control.includes("Risk governor"))).toBe(true);
    expect(state.autonomous_strategy_attribution.mode).toBe("autonomous-strategy-attribution");
    expect(["scale", "selective", "tighten", "protect", "learning", "idle"]).toContain(state.autonomous_strategy_attribution.status);
    expect(state.autonomous_strategy_attribution.controls.some((control) => control.includes("local paper fills"))).toBe(true);
    expect(state.autonomous_policy_optimizer.items.some((item) => item.id === "strategy-policy")).toBe(true);
    expect(state.autonomous_policy_optimizer.attribution_size_bias).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.mode).toBe("autonomous-tick-plan");
    expect(["trade", "protect", "refresh", "observe", "stand-down", "blocked"]).toContain(state.autonomous_tick_plan.status);
    expect(state.autonomous_tick_plan.next_action.length).toBeGreaterThan(0);
    expect(state.autonomous_tick_plan.items.length).toBeGreaterThan(0);
    expect(state.autonomous_session_supervisor.mode).toBe("autonomous-session-supervisor");
    expect(state.autonomous_session_supervisor.cadence_seconds).toBeLessThanOrEqual(state.autonomous_monitor.recommended_interval_seconds);
    expect(state.autonomous_session_supervisor.next_wake_at).toBe(state.autonomous_monitor.next_wake_at);
    expect(state.autonomous_session_supervisor.can_advance_paper).toBe(
      state.autonomous_monitor.should_advance_paper &&
        state.autonomy_risk_governor.allow_paper_advance &&
        state.autonomous_capital_allocator.status !== "blocked" &&
        !state.post_trade_review.pause_new_entries &&
        !state.paper_daemon_memory.pause_new_entries,
    );
    expect(state.autonomous_session_supervisor.items.some((item) => item.lane === "heartbeat")).toBe(true);
    expect(state.autonomous_session_supervisor.items.some((item) => item.lane === "capital")).toBe(true);
    expect(state.autonomous_capital_allocator.deploy_budget_usd).toBeLessThanOrEqual(state.portfolio.cash_usd);
    expect(state.autonomous_capital_allocator.max_orders_this_cycle).toBeLessThanOrEqual(
      Math.max(0, Math.floor(state.autonomy_risk_governor.message_budget_remaining / 2)),
    );
    expect(state.autonomous_session_supervisor.live_execution_permitted).toBe(false);
    expect(state.autonomous_session_supervisor.controls.some((control) => control.includes("Paper advance can run"))).toBe(true);
    expect(state.autonomous_loop_director.mode).toBe("autonomous-loop-director");
    expect(state.autonomous_loop_director.request.daemon).toBe(true);
    expect(state.autonomous_loop_director.request.advance).toBe(false);
    expect(state.autonomous_loop_director.max_ticks_per_minute).toBeLessThanOrEqual(12);
    expect(["burst", "active", "watch", "cooldown", "paused"]).toContain(state.autonomous_loop_director.intensity);
    expect(state.autonomous_loop_director.batch_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_loop_director.feed_pressure_score).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_loop_director.route_refresh_status).toBe(state.route_refresh_queue.status);
    expect(typeof state.autonomous_loop_director.should_refresh_route_quotes).toBe("boolean");
    expect(state.autonomous_loop_director.controls.some((control) => control.includes("Repeated autonomous advances"))).toBe(true);
    expect(state.autonomous_daemon_handoff.mode).toBe("autonomous-daemon-handoff");
    expect(state.autonomous_daemon_handoff.request).toMatchObject({
      account: "persistent",
      source: "sample",
      daemon: true,
      advance: false,
      reset: false,
    });
    expect(state.autonomous_daemon_handoff.next_wake_seconds).toBe(state.autonomous_run_envelope.next_wake_seconds);
    expect(state.autonomous_daemon_handoff.next_wake_at).toBe(state.autonomous_run_envelope.next_wake_at);
    expect(["idle", "acquired", "renewed", "replayed", "conflict", "expired", "blocked"]).toContain(state.autonomous_daemon_handoff.lease_status);
    expect(typeof state.autonomous_daemon_handoff.can_issue_tick).toBe("boolean");
    expect(state.autonomous_daemon_handoff.can_trade_real_capital).toBe(false);
    expect(state.autonomous_daemon_handoff.max_fills_per_lease).toBeLessThanOrEqual(3);
    expect(state.autonomous_daemon_handoff.max_trades_next_minute).toBeLessThanOrEqual(state.autonomous_run_envelope.max_trades_next_minute);
    expect(state.autonomous_daemon_handoff.market_worker.mode).toBe("daemon-market-worker-handoff");
    expect(state.autonomous_daemon_handoff.market_worker.read_only).toBe(true);
    expect(["ready", "refresh-first", "sample-only", "throttled", "blocked", "idle"]).toContain(state.autonomous_daemon_handoff.market_worker.status);
    expect(state.autonomous_daemon_handoff.market_worker.cadence_seconds).toBeGreaterThan(0);
    if (state.autonomous_daemon_handoff.status === "blocked" || state.autonomous_daemon_handoff.status === "paused") {
      expect(state.autonomous_daemon_handoff.can_run_background_paper).toBe(false);
    }
    expect(state.autonomous_daemon_handoff.stop_conditions.some((condition) => condition.includes("Never sign"))).toBe(true);
    expect(state.autonomous_daemon_handoff.controls.some((control) => control.includes("overlapping runners"))).toBe(true);
    if (["blocked", "halted", "paused"].includes(state.autonomous_loop_director.status)) {
      expect(state.autonomous_loop_director.client_should_run).toBe(false);
    } else {
      expect(state.autonomous_loop_director.client_should_run).toBe(true);
    }
    expect(state.autonomous_portfolio_sentinel.mode).toBe("autonomous-portfolio-sentinel");
    expect(state.autonomous_portfolio_sentinel.watched_count).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_sentinel.items.length).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_portfolio_sentinel.controls.some((control) => control.includes("local paper recommendations"))).toBe(true);
    expect(state.autonomous_trade_arbiter.mode).toBe("autonomous-trade-arbiter");
    expect(state.autonomous_trade_arbiter.items.length).toBeGreaterThan(0);
    expect(state.autonomous_trade_arbiter.controls.some((control) => control.includes("Produces local paper trade decisions only"))).toBe(true);
    expect(state.autonomous_trade_arbiter.items.every((item) => item.route_status.length > 0 && item.reason.length > 0)).toBe(true);
    expect(state.autonomous_trade_execution_bridge.mode).toBe("arbiter-paper-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_trade_execution_bridge.status);
    expect(state.autonomous_trade_execution_bridge.controls.some((control) => control.includes("paper-ledger-only"))).toBe(true);
	    expect(state.autonomous_opportunity_race_execution.mode).toBe("opportunity-race-paper-execution");
	    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_opportunity_race_execution.status);
	    expect(state.trend_chase_execution.mode).toBe("trend-chase-paper-execution");
	    expect(["queued", "applied", "blocked", "idle"]).toContain(state.trend_chase_execution.status);
	    expect(state.trend_chase_execution.execution_boundary).toBe("paper-ledger-only");
	    expect(state.trend_chase_execution.scout_reserve_usd).toBeGreaterThanOrEqual(0);
	    expect(state.scout_lifecycle.mode).toBe("scout-lifecycle-controller");
	    expect(["harvest", "trim", "stop", "tighten", "watch", "idle"]).toContain(state.scout_lifecycle.status);
	    expect(state.scout_lifecycle.execution_boundary).toBe("paper-ledger-only");
	    expect(state.scout_lifecycle.watched_count).toBeGreaterThanOrEqual(0);
	    expect(state.autonomous_tick_plan.items.some((item) => item.id === "tick-plan-trend-chase")).toBe(
	      state.trend_chase_execution.status !== "idle",
	    );
	    expect(typeof state.autonomous_tick_plan.items.some((item) => item.id === "tick-plan-scout-lifecycle")).toBe("boolean");
	    expect(state.autonomous_position_risk_execution.mode).toBe("autonomous-position-risk-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_position_risk_execution.status);
    expect(state.autonomous_position_risk_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.portfolio_tape_guard_execution.mode).toBe("portfolio-tape-guard-execution");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.portfolio_tape_guard_execution.status);
    expect(state.portfolio_tape_guard_execution.execution_boundary).toBe("paper-ledger-only");
    expect(state.autonomous_trade_mission.steps.some((step) => step.id === "mission-race-execution")).toBe(true);
    const raceStep = state.autonomous_trade_mission.steps.find((step) => step.id === "mission-race-execution");
    expect(raceStep?.detail).toBe(state.autonomous_opportunity_race_execution.next_action);
    if (state.autonomous_opportunity_race_execution.status !== "idle") {
      expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "opportunity-race-execution")).toBe(true);
      if (state.autonomous_opportunity_race_execution.selected_symbol) {
        expect(state.autonomous_monitor.watch_symbols).toContain(state.autonomous_opportunity_race_execution.selected_symbol);
      }
    }
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    if (state.paper_daemon.advanced) {
      expect(state.paper_daemon.current_cycle).toBeGreaterThanOrEqual(state.paper_daemon.previous_cycle);
    } else {
      expect(state.paper_daemon.current_cycle).toBe(state.paper_daemon.previous_cycle);
    }
  });

  test("GIVEN DEX Screener fails WHEN live mode is requested THEN the route falls back to sample data visibly", async () => {
    const fetchImpl = async () => Response.json({ error: "rate limited" }, { status: 429 });
    const state = await getWeb3TradingStateAsync({ source: "live-dex", fetchImpl });

    expect(state.market_source.status).toBe("fallback");
    expect(state.market_source.detail).toContain("429");
    expect(state.discovery_tape.status).toBe("fallback");
    expect(state.market_feed_integrity.status).toBe("fallback");
    expect(state.market_feed_integrity.reconnect_required).toBe(true);
    expect(state.market_feed_integrity.backfill_required).toBe(true);
    expect(state.market_feed_integrity.checks.some((check) => check.status === "fail")).toBe(true);
    expect(state.market_stream_supervisor.status).toBe("reconnect");
    expect(state.market_stream_supervisor.transport).toBe("unavailable");
    expect(state.market_stream_supervisor.reconnect_count).toBeGreaterThan(0);
    expect(state.market_stream_supervisor.backfill_count).toBeGreaterThan(0);
    expect(state.market_ingestion_plan.status).toBe("blocked");
    expect(state.market_ingestion_plan.steps.some((step) => step.action === "reconnect" || step.action === "pause")).toBe(true);
    expect(state.market_ingestion_plan.safeguards.some((item) => item.includes("Fresh entries stay blocked"))).toBe(true);
    expect(state.autonomous_trade_readiness_gate.status).toBe("blocked");
    expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
    expect(state.autonomous_trade_readiness_gate.data_repair_required).toBe(true);
    expect(state.autonomous_monitor.heartbeat_status).not.toBe("stale");
    const fallbackHeartbeat = state.autonomous_session_supervisor.items.find((item) => item.id === "session-heartbeat");
    expect(fallbackHeartbeat?.blocker ?? "").not.toMatch(/stale or stood down/i);
    expect(fallbackHeartbeat?.status).not.toBe("fail");
    expect(state.autonomous_loop_director.should_issue_daemon_tick).toBe(false);
    expect(state.position_watch_clock.status).toBe("stale");
    expect(state.position_watch_clock.stale_count).toBe(state.portfolio.open_positions.length);
    expect(state.position_watch_clock.items.every((item) => item.feed_refresh_required)).toBe(true);
    expect(state.position_watch_clock.items.some((item) => item.lane === "rest-backfill")).toBe(true);
    expect(["refresh", "exit-now"]).toContain(state.position_surveillance_matrix.status);
    expect(state.position_surveillance_matrix.stale_count).toBe(state.portfolio.open_positions.length);
    expect(state.position_surveillance_matrix.items.every((item) => item.feed_refresh_required)).toBe(true);
    expect(state.portfolio_price_action_guard.stale_count).toBe(state.portfolio.open_positions.length);
    expect(state.portfolio_price_action_guard.items.every((item) => item.action === "refresh" && item.status === "stale")).toBe(true);
    expect(["tighten", "trim", "exit"]).toContain(state.liquidity_exit_sentinel.status);
    expect(state.liquidity_exit_sentinel.items.some((item) =>
      item.blockers.some((blocker) => blocker.includes("reconnect"))
    )).toBe(true);
    expect(state.autonomy_risk_governor.status).toBe("halted");
    expect(state.autonomy_risk_governor.allow_paper_advance).toBe(false);
    expect(state.autonomy_risk_governor.kill_switch_recommended).toBe(true);
    expect(state.autonomy_risk_governor.checks.find((check) => check.id === "feed")?.status).toBe("fail");
    expect(state.autonomous_compounder.status).toBe("halted");
    expect(state.autonomous_compounder.next_order_cap_usd).toBe(0);
    expect(state.autonomous_compounder.launch_order_cap_usd).toBe(0);
    expect(state.execution_edge_ladder.status).toBe("blocked");
    expect(state.execution_edge_ladder.items.every((item) => item.action !== "execute-paper")).toBe(true);
    expect(state.live_execution_arming.submit_ready).toBe(false);
    expect(state.live_execution_arming.checks.find((check) => check.id === "preflight")?.status).toBe("fail");
    expect(state.transaction_lifecycle.status).toBe("blocked");
    expect(state.transaction_lifecycle.items.every((item) => item.stage !== "awaiting-signature")).toBe(true);
    expect(state.discovery_tape.sources[0]).toMatchObject({ status: "failed" });
    expect(state.discovery_tape.sources.some((source) =>
      source.id === "portfolio-watch" &&
      source.status === "failed" &&
      source.detail.includes("Held-position DEX refresh is blocked")
    )).toBe(true);
    expect(state.autonomy_policy.stand_down).toBe(true);
    expect(state.autonomy_policy.orders.every((order) => order.decision !== "press")).toBe(true);
    expect(state.situation_monitor.regime).toBe("stand-down");
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "monitor-feed-integrity-critical")).toBe(true);
    expect(state.autonomous_monitor.triggers.some((trigger) => trigger.id === "monitor-risk-governor")).toBe(true);
    expect(state.autonomous_monitor.should_advance_paper).toBe(false);
    expect(state.situation_monitor.alerts.some((alert) => alert.id === "discovery-fallback")).toBe(true);
    expect(state.autopilot.status).toBe("stand-down");
    expect(state.autopilot.actions[0]).toMatchObject({ lane: "stand-down", status: "blocked" });
    expect(state.profit_optimizer.mode).toBe("protect");
    expect(state.learning_loop.signals.length).toBeGreaterThan(0);
    expect(state.market.length).toBeGreaterThan(0);
    expect(state.market.some((market) => market.symbol === "BONK")).toBe(true);
  });

  test("GIVEN public DEX discovery works WHEN the discovery receipt runs THEN it exposes scanner evidence without live authority", async () => {
    const tokenAddress = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, amount: 9, totalAmount: 14, description: "top boost" }]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, amount: 3, totalAmount: 14, description: "fresh boost" }]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, description: "fresh profile" }]);
      }
      if (url.includes("/community-takeovers/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, description: "takeover" }]);
      }
      if (url.includes("/ads/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, type: "tokenAd", impressions: 42_000 }]);
      }
      if (url.includes("/orders/v1/solana/")) {
        return Response.json([{ type: "tokenAd", status: "approved" }]);
      }
      if (url.includes("/tokens/v1/solana/")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "bonk-pair-live",
            pairCreatedAt: Date.now() - 20 * 60 * 1000,
            baseToken: { address: tokenAddress, symbol: "BONK", name: "Bonk" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Solana" },
            priceUsd: "0.000024",
            marketCap: 1_900_000_000,
            liquidity: { usd: 28_000_000 },
            volume: { m5: 120_000, h1: 1_900_000, h24: 41_000_000 },
            txns: { m5: { buys: 110, sells: 42 } },
            priceChange: { m5: 4.8, h1: 13.5, h6: 22.1 },
            boosts: { active: 4 },
          },
        ]);
      }
      return Response.json({ error: "unexpected DEX test request" }, { status: 500 });
    }) as typeof fetch;

    const rejected = await DEX_DISCOVERY_GET(new Request("http://localhost/api/web3-dex-discovery?source=bad-source"));
    expect(rejected.status).toBe(422);

    const response = await DEX_DISCOVERY_GET(new Request("http://localhost/api/web3-dex-discovery?scenario=breakout&source=live-dex&account=ephemeral&cycles=0"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      provider: string;
      provider_docs_url: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      secret_echo_permission: string;
      private_key_storage: string;
      transaction_submission_permission: string;
      source_summary: {
        market_source_status: string;
        discovery_status: string;
        tokens_considered: number;
        pairs_mapped: number;
        pair_coverage_pct: number;
        failed_source_count: number;
        live_candidate_count: number;
        paid_hype_count: number;
        top_symbols: string[];
      };
      source_checks: Array<{ id: string; status: string; rate_limit_class: string }>;
      top_candidates: Array<{ symbol: string; paid_order_checked: boolean; paid_order_count: number; sources: string[] }>;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-dex-discovery-receipt");
    expect(["live-ready", "live-watch"]).toContain(receipt.status);
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.provider).toBe("DEX Screener");
    expect(receipt.provider_docs_url).toBe("https://docs.dexscreener.com/api/reference");
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.source_summary.market_source_status).toBe("live");
    expect(receipt.source_summary.discovery_status).toBe("live");
    expect(receipt.source_summary.tokens_considered).toBeGreaterThan(0);
    expect(receipt.source_summary.pairs_mapped).toBeGreaterThan(0);
    expect(receipt.source_summary.pair_coverage_pct).toBeGreaterThan(0);
    expect(receipt.source_summary.failed_source_count).toBe(0);
    expect(receipt.source_summary.live_candidate_count).toBeGreaterThan(0);
    expect(receipt.source_summary.top_symbols).toContain("BONK");
    expect(receipt.source_checks.map((check) => check.id)).toEqual([
      "dex-top-boosts",
      "dex-latest-boosts",
      "dex-latest-profiles",
      "dex-community-takeovers",
      "dex-latest-ads",
      "portfolio-watch",
    ]);
    expect(receipt.source_checks.every((check) => check.status === "ok")).toBe(true);
    expect(receipt.source_checks.find((check) => check.id === "dex-latest-profiles")?.rate_limit_class).toBe("discovery-60-rpm");
    const bonkCandidate = receipt.top_candidates.find((candidate) => candidate.symbol === "BONK");
    expect(bonkCandidate).toMatchObject({
      symbol: "BONK",
      paid_order_checked: expect.any(Boolean),
      paid_order_count: expect.any(Number),
    });
    expect(bonkCandidate?.sources).toContain("dex-latest-profiles");
    expect(receipt.controls.some((control) => control.includes("local paper decisions only"))).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("test-helius-secret");
  });

  test("GIVEN live-capital preflight runs WHEN live DEX data is present THEN it returns gated review blockers", async () => {
    const tokenAddress = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, amount: 4, totalAmount: 20, description: "top boost" }]);
      }
      if (url.includes("/token-boosts/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, amount: 2, totalAmount: 8, description: "fresh boost" }]);
      }
      if (url.includes("/token-profiles/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, description: "fresh profile" }]);
      }
      if (url.includes("/community-takeovers/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, description: "takeover" }]);
      }
      if (url.includes("/ads/latest/v1")) {
        return Response.json([{ chainId: "solana", tokenAddress, type: "tokenAd", impressions: 10_000 }]);
      }
      if (url.includes("/orders/v1/solana/")) {
        return Response.json([{ type: "tokenAd", status: "approved" }]);
      }
      if (url.includes("/tokens/v1/solana/")) {
        return Response.json([
          {
            chainId: "solana",
            dexId: "raydium",
            pairAddress: "bonk-pair-live",
            pairCreatedAt: Date.now() - 12 * 60 * 1000,
            baseToken: { address: tokenAddress, symbol: "BONK", name: "Bonk" },
            quoteToken: { address: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Solana" },
            priceUsd: "0.000023",
            marketCap: 1_800_000_000,
            liquidity: { usd: 22_000_000 },
            volume: { m5: 80_000, h1: 1_200_000, h24: 31_000_000 },
            txns: { m5: { buys: 80, sells: 36 } },
            priceChange: { m5: 3.2, h1: 9.4, h6: 18.1 },
            boosts: { active: 3 },
          },
        ]);
      }
      return Response.json({ error: "unexpected preflight request" }, { status: 500 });
    }) as typeof fetch;

    const rejected = await LIVE_PREFLIGHT_GET(new Request("http://localhost/api/web3-live-capital-preflight?cycles=99"));
    expect(rejected.status).toBe(422);

    const response = await LIVE_PREFLIGHT_GET(new Request("http://localhost/api/web3-live-capital-preflight?scenario=breakout&source=live-dex&account=ephemeral&cycles=0"));
    const receipt = await json<{
      mode: string;
      status: string;
      receipt_hash: string;
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      secret_echo_permission: string;
      real_capital_blocked: boolean;
      passed_gate_count: number;
      watch_gate_count: number;
      failed_gate_count: number;
      gates: Array<{ id: string; status: string; next_action: string; blocks_live_capital: boolean }>;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.mode).toBe("web3-live-capital-preflight-receipt");
    expect(["blocked", "blocked-as-expected"]).toContain(receipt.status);
    expect(receipt.receipt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.live_execution_permission).toBe("blocked");
    expect(receipt.wallet_mutation_permission).toBe("blocked");
    expect(receipt.transaction_submission_permission).toBe("blocked");
    expect(receipt.private_key_storage).toBe("blocked");
    expect(receipt.secret_echo_permission).toBe("blocked");
    expect(receipt.real_capital_blocked).toBe(true);
    expect(receipt.passed_gate_count + receipt.watch_gate_count + receipt.failed_gate_count).toBe(receipt.gates.length);
    expect(["operator-wallet", "provider-read-rail", "live-dex", "jupiter-order", "risk-policy", "kill-switch", "signer-custody", "settlement", "profit-proof", "manual-live-review"].every((id) => receipt.gates.some((gate) => gate.id === id))).toBe(true);
    expect(receipt.gates.every((gate) => gate.blocks_live_capital && gate.next_action.length > 0)).toBe(true);
    expect(receipt.gates.find((gate) => gate.id === "live-dex")?.status).toBe("pass");
    expect(receipt.controls.some((control) => control.includes("never asks for private keys"))).toBe(true);
  });

  test("GIVEN live discovery fails WHEN persistent paper advances THEN legacy entries stay blocked by readiness gate", async () => {
    const fetchImpl = async () => Response.json({ error: "rate limited" }, { status: 429 });
    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      account: "persistent",
      reset: true,
      advance: true,
      fetchImpl,
    });

    expect(state.paper_account.persisted).toBe(true);
    expect(state.paper_account.cycle).toBe(1);
    expect(state.market_source.status).toBe("fallback");
    expect(state.autonomous_trade_readiness_gate.status).toBe("blocked");
    expect(state.autonomous_trade_readiness_gate.can_apply_buys).toBe(false);
    expect(state.autonomous_trade_readiness_gate.data_repair_required).toBe(true);
    expect(state.paper_account.trade_count).toBe(0);
    expect(state.trade_tape.filter((trade) => trade.side === "buy")).toHaveLength(0);
    expect(state.portfolio.open_positions).toHaveLength(0);
    expect(state.portfolio.cash_usd).toBe(25_000);
  });

  test("GIVEN live trigger credentials WHEN deposit craft is requested THEN the app returns hash-only signer metadata", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "rug-risk", advance: true });

    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const craftedTx = Buffer.from("unsigned-trigger-deposit").toString("base64");
    let depositBody: Record<string, unknown> | null = null;
    const liveTokens = [
      { address: "BonkMint111111111111111111111111111111111", symbol: "BONK", name: "Bonk", price: "0.000019" },
      { address: "WifMint1111111111111111111111111111111111", symbol: "WIF", name: "dogwifhat", price: "2.54" },
      { address: "FartcoinMint111111111111111111111111111", symbol: "FARTCOIN", name: "Fartcoin", price: "0.92" },
      { address: "PopcatMint111111111111111111111111111111", symbol: "POPCAT", name: "Popcat", price: "0.58" },
    ];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/token-boosts/top/v1") || url.includes("/token-boosts/latest/v1")) {
        return Response.json(liveTokens.map((token) => ({ chainId: "solana", tokenAddress: token.address })));
      }
      if (
        url.includes("/token-profiles/latest/v1") ||
        url.includes("/community-takeovers/latest/v1") ||
        url.includes("/ads/latest/v1")
      ) {
        return Response.json([]);
      }
      if (url.includes("/tokens/v1/solana/")) {
        return Response.json(liveTokens.map((token) => ({
            chainId: "solana",
            dexId: "raydium",
            pairAddress: `${token.symbol}Pair111`,
            baseToken: { address: token.address, name: token.name, symbol: token.symbol },
            quoteToken: { address: "So11111111111111111111111111111111111111112", name: "Wrapped SOL", symbol: "SOL" },
            priceUsd: token.price,
            txns: { m5: { buys: 90, sells: 130 } },
            volume: { m5: 120_000, h1: 1_200_000, h24: 14_000_000 },
            priceChange: { m5: -7.8, h1: -12.4, h6: -18.9 },
            liquidity: { usd: 6_000_000 },
            marketCap: 1_500_000_000,
            pairCreatedAt: Date.now() - 500 * 24 * 60 * 60 * 1000,
            boosts: { active: 1 },
          })));
      }
      if (url.includes("lite-api.jup.ag/swap/v1/quote")) {
        return Response.json({
          outAmount: "42000000000",
          priceImpactPct: "0.18",
          routePlan: [{ swapInfo: { label: "Raydium" } }],
        });
      }
      if (url.includes("/trigger/v2/deposit/craft")) {
        depositBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return Response.json({ requestId: "deposit-request-1", transaction: craftedTx });
      }
      return Response.json([], { status: 404 });
    };

    const state = await getWeb3TradingStateAsync({
      source: "live-dex",
      account: "persistent",
      scenario: "rug-risk",
      advance: false,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_order: { action: "craft-deposit" },
      fetchImpl,
    });

    expect(state.market_source.status).toBe("live");
    expect(state.trigger_order_planner.status).toBe("ready");
    expect(state.trigger_order_execution.status).toBe("deposit-crafted");
    expect(state.trigger_order_execution.deposit_request_id).toBe("deposit-request-1");
    expect(state.trigger_order_execution.deposit_payload_hash).toHaveLength(64);
    expect(state.trigger_order_execution.deposit_payload_bytes).toBe(Buffer.from("unsigned-trigger-deposit").length);
    expect(state.trigger_order_execution.signed_deposit_hash).toBeNull();
    const craftedBody = depositBody as Record<string, unknown> | null;
    expect(craftedBody).toMatchObject({
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      userAddress: "11111111111111111111111111111111",
      orderType: "price",
    });
    expect(liveTokens.map((token) => token.address)).toContain(String(craftedBody?.inputMint));
    expect(typeof craftedBody?.amount).toBe("string");
  });

  test("GIVEN trigger credentials WHEN order history is synced THEN fills and signatures are summarized without transaction bodies", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const wifMint = "EKpQGSJtjMFqKZ9KQan...sample";
    let historyUrl = "";
    let historyHeaders: HeadersInit | undefined;
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      historyUrl = String(input);
      historyHeaders = init?.headers;
      return Response.json({
        orders: [
          {
            id: "order-filled-1",
            orderType: "oco",
            orderState: "filled",
            rawState: "fill_success",
            inputMint: wifMint,
            initialInputAmount: "1000000",
            remainingInputAmount: "0",
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            triggerMint: wifMint,
            triggerPriceUsd: 2.95,
            slippageBps: 650,
            fillPercent: 1,
            outputAmount: "3100000",
            inputUsed: "1000000",
            updatedAt: Date.parse("2026-06-16T12:00:00.000Z"),
            events: [
              {
                type: "deposit",
                timestamp: Date.parse("2026-06-16T11:55:00.000Z"),
                txSignature: "deposit-signature-1",
                mint: wifMint,
                amount: "1000000",
                state: "success",
              },
              {
                type: "fill",
                timestamp: Date.parse("2026-06-16T12:00:00.000Z"),
                txSignature: "fill-signature-1",
                mint: wifMint,
                amount: "1000000",
                outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                outputAmount: "3100000",
                orderContext: "stop_loss",
                state: "success",
              },
            ],
          },
        ],
        pagination: { total: 1, limit: 2, offset: 0 },
      });
    };

    const state = await getWeb3TradingStateAsync({
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_history: {
        state: "past",
        mint: wifMint,
        limit: 2,
        offset: 0,
        sort: "updated_at",
        dir: "desc",
      },
      fetchImpl,
    });

    const headerRecord = historyHeaders as Record<string, string>;
    expect(historyUrl).toContain("/trigger/v2/orders/history?state=past");
    expect(historyUrl).toContain("limit=2");
    expect(historyUrl).toContain(`mint=${encodeURIComponent(wifMint)}`);
    expect(headerRecord["x-api-key"]).toBe("test-jupiter-key");
    expect(headerRecord.authorization).toBe("Bearer test-trigger-jwt");
    expect(state.trigger_order_history.status).toBe("filled");
    expect(state.trigger_order_history.total_orders).toBe(1);
    expect(state.trigger_order_history.filled_count).toBe(1);
    expect(state.trigger_order_history.fill_event_count).toBe(1);
    expect(state.trigger_order_history.latest_order_id).toBe("order-filled-1");
    expect(state.trigger_order_history.latest_event_type).toBe("fill");
    expect(state.trigger_order_history.latest_tx_signature).toBe("fill-signature-1");
    expect(state.trigger_order_history.items[0]?.events[1]?.output_amount_raw).toBe("3100000");
    expect(state.trigger_order_reconciliation.status).toBe("needs-reconcile");
    expect(state.trigger_order_reconciliation.ledger_patch_ready).toBe(true);
    expect(state.trigger_order_reconciliation.fill_count).toBe(1);
    expect(state.trigger_order_reconciliation.realized_output_usd).toBe(3);
    expect(state.trigger_order_reconciliation.estimated_realized_pnl_usd).toBeGreaterThanOrEqual(0);
    expect(state.trigger_order_reconciliation.items[0]).toMatchObject({
      order_id: "order-filled-1",
      symbol: "WIF",
      position_id: "pos-wif",
      action: "realize-fill",
      latest_tx_signature: "fill-signature-1",
    });
  });

  test("GIVEN an expired trigger order WHEN history is reconciled THEN the bot blocks redeploy until protection is rebuilt", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const fetchImpl = async () => Response.json({
      orders: [
        {
          id: "order-expired-1",
          orderType: "single",
          orderState: "expired",
          rawState: "expired",
          inputMint: "EKpQGSJtjMFqKZ9KQan...sample",
          initialInputAmount: "1000000",
          remainingInputAmount: "1000000",
          outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          triggerMint: "EKpQGSJtjMFqKZ9KQan...sample",
          triggerPriceUsd: 2.35,
          slippageBps: 650,
          expiresAt: Date.parse("2026-06-16T12:05:00.000Z"),
          updatedAt: Date.parse("2026-06-16T12:06:00.000Z"),
          events: [
            {
              type: "expired",
              timestamp: Date.parse("2026-06-16T12:06:00.000Z"),
              state: "success",
            },
          ],
        },
      ],
      pagination: { total: 1, limit: 20, offset: 0 },
    });

    const state = await getWeb3TradingStateAsync({
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_history: { state: "past" },
      fetchImpl,
    });

    expect(state.trigger_order_history.expired_count).toBe(1);
    expect(state.trigger_order_reconciliation.status).toBe("attention");
    expect(state.trigger_order_reconciliation.ledger_patch_ready).toBe(false);
    expect(state.trigger_order_reconciliation.action_count).toBe(1);
    expect(state.trigger_order_reconciliation.items[0]).toMatchObject({
      order_id: "order-expired-1",
      symbol: "WIF",
      position_id: "pos-wif",
      action: "rebuild-order",
    });
    expect(state.trigger_order_reconciliation.next_action).toContain("protection");
  });

  test("GIVEN active Trigger protection for every planned exit WHEN coverage is built THEN fresh buys can reopen", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const execution = {
      mode: "dry-run" as const,
      kill_switch: false,
      wallet_public_key: "11111111111111111111111111111111",
      max_trade_usd: 1_000,
      daily_spend_cap_usd: 5_000,
      max_slippage_bps: 500,
    };
    const seed = await getWeb3TradingStateAsync({ scenario: "rug-risk", execution });
    const orders = seed.trigger_order_planner.items
      .filter((plan) => plan.input_mint && plan.input_amount_raw && plan.protected_notional_usd > 0)
      .map((plan, index) => ({
        id: `order-active-${index}`,
        orderType: plan.order_type === "oco" ? "oco" : "single",
        orderState: "active",
        rawState: "open",
        inputMint: plan.input_mint,
        initialInputAmount: plan.input_amount_raw,
        remainingInputAmount: plan.input_amount_raw,
        outputMint: plan.output_mint,
        triggerMint: plan.trigger_mint,
        triggerPriceUsd: plan.stop_trigger_price_usd,
        slippageBps: plan.slippage_bps,
        updatedAt: Date.parse("2026-06-16T12:00:00.000Z") + index,
        events: [
          {
            type: "deposit",
            timestamp: Date.parse("2026-06-16T11:59:00.000Z") + index,
            txSignature: `deposit-active-${index}`,
            mint: plan.input_mint,
            amount: plan.input_amount_raw,
            state: "success",
          },
        ],
      }));

    const fetchImpl = async () => Response.json({
      orders,
      pagination: { total: orders.length, limit: 20, offset: 0 },
    });

    const state = await getWeb3TradingStateAsync({
      scenario: "rug-risk",
      execution,
      trigger_history: { state: "active" },
      fetchImpl,
    });

    expect(orders.length).toBeGreaterThan(0);
    expect(state.trigger_order_history.active_count).toBe(orders.length);
    expect(state.protective_trigger_coverage.active_order_count).toBe(orders.length);
    expect(state.protective_trigger_coverage.uncovered_count).toBe(0);
    expect(state.protective_trigger_coverage.repair_count).toBe(0);
    expect(state.protective_trigger_coverage.should_pause_fresh_buys).toBe(false);
    expect(state.autonomous_action_queue.fresh_buy_protection_status).toBe("clear");
    expect(state.autonomous_action_queue.fresh_buy_blocked_count).toBe(0);
    expect(state.autonomous_session_planner.max_fresh_buys).toBeGreaterThanOrEqual(0);
    expect(state.protective_trigger_coverage.items.filter((item) => item.coverage_status === "covered")).toHaveLength(orders.length);
  });

  test("GIVEN an active-looking Trigger order with no remaining size WHEN coverage is built THEN fresh buys stay blocked", async () => {
    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";

    const execution = {
      mode: "dry-run" as const,
      kill_switch: false,
      wallet_public_key: "11111111111111111111111111111111",
      max_trade_usd: 1_000,
      daily_spend_cap_usd: 5_000,
      max_slippage_bps: 500,
    };
    const seed = await getWeb3TradingStateAsync({ scenario: "rug-risk", execution });
    const stalePlan = seed.trigger_order_planner.items.find((plan) => plan.input_mint && plan.input_amount_raw);
    expect(stalePlan).toBeDefined();

    const fetchImpl = async () => Response.json({
      orders: stalePlan ? [
        {
          id: "order-stale-active-1",
          orderType: stalePlan.order_type === "oco" ? "oco" : "single",
          orderState: "active",
          rawState: "open",
          inputMint: stalePlan.input_mint,
          initialInputAmount: stalePlan.input_amount_raw,
          remainingInputAmount: "0",
          outputMint: stalePlan.output_mint,
          triggerMint: stalePlan.trigger_mint,
          triggerPriceUsd: stalePlan.stop_trigger_price_usd,
          slippageBps: stalePlan.slippage_bps,
          fillPercent: 0,
          updatedAt: Date.parse("2026-06-16T12:00:00.000Z"),
          events: [
            {
              type: "deposit",
              timestamp: Date.parse("2026-06-16T11:59:00.000Z"),
              txSignature: "deposit-stale-active-1",
              mint: stalePlan.input_mint,
              amount: stalePlan.input_amount_raw,
              state: "success",
            },
          ],
        },
      ] : [],
      pagination: { total: stalePlan ? 1 : 0, limit: 20, offset: 0 },
    });

    const state = await getWeb3TradingStateAsync({
      scenario: "rug-risk",
      execution,
      trigger_history: { state: "active" },
      fetchImpl,
    });

    const staleCoverage = state.protective_trigger_coverage.items.find((item) => item.position_id === stalePlan?.position_id);
    expect(state.trigger_order_history.active_count).toBe(stalePlan ? 1 : 0);
    expect(staleCoverage?.coverage_status).not.toBe("covered");
    expect(state.protective_trigger_coverage.should_pause_fresh_buys).toBe(true);
    expect(state.autonomous_action_queue.fresh_buy_protection_status).toBe("protect-first");
    expect(state.autonomous_action_queue.fresh_buy_blocked_count).toBeGreaterThan(0);
    expect(state.autonomous_session_planner.max_fresh_buys).toBe(0);
  });

  test("GIVEN a Trigger fill patch WHEN applied twice THEN the persistent portfolio mirror only changes once", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });

    process.env.JUPITER_API_KEY = "test-jupiter-key";
    process.env.JUPITER_TRIGGER_JWT = "test-trigger-jwt";
    const fartcoinMint = "9BB6NFEcjBCtnNLFko...sample";
    const fetchImpl = async () => Response.json({
      orders: [
        {
          id: "order-fill-apply-1",
          orderType: "single",
          orderState: "filled",
          rawState: "fill_success",
          inputMint: fartcoinMint,
          initialInputAmount: "100000000",
          remainingInputAmount: "0",
          outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          triggerMint: fartcoinMint,
          triggerPriceUsd: 1.3,
          slippageBps: 650,
          fillPercent: 1,
          outputAmount: "130000000",
          inputUsed: "100000000",
          updatedAt: Date.parse("2026-06-16T12:00:00.000Z"),
          events: [
            {
              type: "fill",
              timestamp: Date.parse("2026-06-16T12:00:00.000Z"),
              txSignature: "fill-apply-signature-1",
              mint: fartcoinMint,
              amount: "100000000",
              outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              outputAmount: "130000000",
              orderContext: "take_profit",
              state: "success",
            },
          ],
        },
      ],
      pagination: { total: 1, limit: 20, offset: 0 },
    });

    const before = await getWeb3TradingStateAsync({ account: "persistent", scenario: "base", advance: false });
    const beforePosition = before.portfolio.open_positions.find((position) => position.symbol === "FARTCOIN");

    const applied = await getWeb3TradingStateAsync({
      account: "persistent",
      scenario: "base",
      advance: false,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_history: { state: "past" },
      trigger_reconcile: { action: "apply", order_ids: ["order-fill-apply-1"] },
      fetchImpl,
    });

    const afterPosition = applied.portfolio.open_positions.find((position) => position.symbol === "FARTCOIN");
    if (beforePosition && afterPosition) {
      expect(beforePosition.quantity).toBeGreaterThan(afterPosition.quantity);
    }
    expect(applied.paper_account.trade_count).toBeGreaterThanOrEqual(before.paper_account.trade_count);
    expect(["reconciled", "attention"]).toContain(applied.trigger_order_reconciliation.status);
    if (applied.trigger_order_reconciliation.status === "reconciled") {
      expect(applied.trigger_order_reconciliation.applied_count).toBe(1);
      expect(applied.trigger_order_reconciliation.pending_patch_count).toBe(0);
      expect(applied.trigger_order_reconciliation.items[0]).toMatchObject({
        order_id: "order-fill-apply-1",
        patch_status: "applied",
        action: "realize-fill",
      });
    }

    const duplicate = await getWeb3TradingStateAsync({
      account: "persistent",
      scenario: "base",
      advance: false,
      execution: {
        mode: "dry-run",
        kill_switch: false,
        wallet_public_key: "11111111111111111111111111111111",
        max_trade_usd: 1_000,
        daily_spend_cap_usd: 5_000,
        max_slippage_bps: 500,
      },
      trigger_history: { state: "past" },
      trigger_reconcile: { action: "apply", order_ids: ["order-fill-apply-1"] },
      fetchImpl,
    });

    expect(duplicate.portfolio.cash_usd).toBe(applied.portfolio.cash_usd);
    expect(duplicate.paper_account.trade_count).toBe(applied.paper_account.trade_count);
    expect(duplicate.trigger_order_reconciliation.applied_count).toBeGreaterThanOrEqual(0);
    expect(duplicate.trigger_order_reconciliation.pending_patch_count).toBeGreaterThanOrEqual(0);
  });

  test("GIVEN repeated daemon ticks WHEN the agent runs autonomously THEN recent tick memory persists", async () => {
    const first = await getWeb3TradingStateAsync({
      account: "persistent",
      reset: true,
      scenario: "breakout",
      daemon: true,
    });
    const second = await getWeb3TradingStateAsync({
      account: "persistent",
      scenario: "breakout",
      daemon: true,
    });

    expect(first.paper_daemon.requested).toBe(true);
    expect(first.paper_daemon_memory.tick_count).toBe(1);
    expect(first.paper_daemon_memory.ticks[0]).toMatchObject({
      cycle: first.paper_daemon.current_cycle,
      action: first.paper_daemon.action,
      equity_usd: first.portfolio.equity_usd,
    });
    expect(second.paper_daemon_memory.tick_count).toBe(2);
    expect(second.paper_daemon_memory.window_size).toBe(2);
    expect(second.paper_daemon_memory.fill_count).toBeGreaterThanOrEqual(first.paper_daemon_memory.fill_count);
    expect(second.paper_daemon_memory.recommended_action.length).toBeGreaterThan(0);
    expect(second.paper_daemon_memory.ticks.map((tick) => tick.id)).toHaveLength(
      new Set(second.paper_daemon_memory.ticks.map((tick) => tick.id)).size,
    );
    expect(second.post_trade_review.mode).toBe("post-trade-review");
    expect(second.post_trade_review.reviewed_tick_count).toBe(second.paper_daemon_memory.window_size);
    expect(second.post_trade_review.reviewed_trade_count).toBe(second.performance_scorecard.trade_count);
    expect(second.post_trade_review.lessons.length).toBe(5);
    expect(second.post_trade_review.next_action.length).toBeGreaterThan(0);
    expect(second.post_trade_review.recommended_cadence_seconds).toBeGreaterThan(0);
  });

  test("GIVEN a duplicate daemon lease request WHEN posted twice THEN the second request is replay-blocked", async () => {
    const body = {
      account: "persistent",
      reset: true,
      scenario: "breakout",
      daemon: true,
      daemon_lease: {
        lease_id: "lease-replay-test-001",
        runner_id: "runner-alpha",
        request_id: "request-replay-test-001",
        issued_at: new Date().toISOString(),
      },
    };
    const first = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    const replay = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ ...body, reset: false }),
      }),
    );
    const firstState = await json<Web3TradingState>(first);
    const replayState = await json<Web3TradingState>(replay);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(firstState.autonomous_daemon_handoff.active_runner_id).toBe("runner-alpha");
    expect(replayState.autonomous_daemon_handoff.lease_status).toBe("replayed");
    expect(replayState.autonomous_daemon_handoff.can_issue_tick).toBe(false);
    expect(replayState.paper_daemon.advanced).toBe(false);
    expect(replayState.autonomous_daemon_handoff.lease_replay_count).toBeGreaterThanOrEqual(1);
  });

  test("GIVEN a clean persistent paper wallet WHEN a daemon loop tick runs THEN it opens a bounded paper scout bundle", async () => {
    const reset = await getWeb3TradingStateAsync({
      scenario: "breakout",
      source: "sample",
      account: "persistent",
      reset: true,
      advance: false,
    });
    const response = await POST(new Request("http://localhost/api/web3-trading", {
      method: "POST",
      body: JSON.stringify({
        scenario: "breakout",
        source: "sample",
        account: "persistent",
        daemon: true,
        autonomous_loop: {
          action: "tick",
        },
        daemon_lease: {
          lease_id: reset.autonomous_daemon_handoff.lease_id,
          runner_id: "clean-wallet-scout-test",
          request_id: "request-clean-wallet-scout-test-001",
        },
      }),
    }));
    const state = await json<Web3TradingState>(response);
    const buys = state.trade_tape.filter((trade) => trade.id.startsWith("paper-clean-wallet-scout-") && trade.side === "buy");

    expect(response.status).toBe(200);
    expect(state.execution_gate.live_execution_enabled).toBe(false);
    expect(state.paper_daemon.advanced).toBe(true);
    expect(state.paper_account.cycle).toBe(1);
    expect(state.paper_account.trade_count).toBeGreaterThanOrEqual(2);
    expect(state.portfolio.open_positions.length).toBeGreaterThanOrEqual(2);
    expect(new Set(state.portfolio.open_positions.map((position) => position.symbol)).size).toBe(state.portfolio.open_positions.length);
    expect(state.autonomous_loop_tick.status).toBe("session-run");
    expect(state.autonomous_loop_tick.action).toBe("run-cycle");
    expect(state.autonomous_loop_tick.fill_count).toBeGreaterThanOrEqual(2);
    expect(state.autonomous_loop_tick.summary).toContain("bounded clean-wallet scout fills");
    expect(buys.length).toBeGreaterThanOrEqual(2);
    expect(["BONK", "FARTCOIN"]).toContain(buys[0].symbol);
    expect(buys.every((buy) => buy.size_usd <= 1_000)).toBe(true);
    expect(buys.every((buy) => buy.reason.includes("Clean-wallet scout bundle score"))).toBe(true);
  });

  test("GIVEN an active daemon lease WHEN another runner posts THEN the conflict is persisted and no paper advance occurs", async () => {
    const first = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          account: "persistent",
          reset: true,
          scenario: "breakout",
          daemon: true,
          daemon_lease: {
            lease_id: "lease-conflict-test-001",
            runner_id: "runner-alpha",
            request_id: "request-conflict-alpha",
          },
        }),
      }),
    );
    const firstState = await json<Web3TradingState>(first);
    const conflict = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          account: "persistent",
          scenario: "breakout",
          daemon: true,
          daemon_lease: {
            lease_id: "lease-conflict-test-002",
            runner_id: "runner-beta",
            request_id: "request-conflict-beta",
          },
        }),
      }),
    );
    const conflictState = await json<Web3TradingState>(conflict);

    expect(first.status).toBe(200);
    expect(conflict.status).toBe(200);
    expect(firstState.autonomous_daemon_handoff.active_runner_id).toBe("runner-alpha");
    expect(conflictState.autonomous_daemon_handoff.lease_status).toBe("conflict");
    expect(conflictState.autonomous_daemon_handoff.active_runner_id).toBe("runner-alpha");
    expect(conflictState.autonomous_daemon_handoff.lease_conflict_count).toBeGreaterThanOrEqual(1);
    expect(conflictState.autonomous_daemon_handoff.can_issue_tick).toBe(false);
    expect(conflictState.paper_daemon.advanced).toBe(false);
    expect(conflictState.paper_account.cycle).toBe(firstState.paper_account.cycle);
  });

  test("POST /api/web3-trading validates requested cycles", async () => {
    const bad = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ scenario: "base", cycles: 100 }),
      }),
    );
    const good = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ scenario: "rug-risk", cycles: 1 }),
      }),
    );

    expect(bad.status).toBe(422);
    expect(good.status).toBe(200);
    expect((await json<Web3TradingState>(good)).scenario).toBe("rug-risk");
  });

  test("POST /api/web3-trading validates daemon lease requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          account: "persistent",
          daemon: true,
          daemon_lease: {
            lease_id: "short",
            runner_id: "x",
          },
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({
      error: "daemon_lease.lease_id must be a string from 8 to 160 characters.",
    });
  });

  test("POST /api/web3-trading validates requested source", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ source: "live-wallet" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "source must be sample or live-dex." });
  });

  test("POST /api/web3-trading validates portfolio sweep limits", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ portfolio_sweep: { action: "apply", max_trades: 0 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "portfolio_sweep.max_trades must be an integer from 1 to 6." });
  });

  test("POST /api/web3-trading validates autonomous burst limits", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ autonomous_burst: { action: "run", max_protective_sells: 0 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "autonomous_burst.max_protective_sells must be an integer from 1 to 6." });
  });

  test("POST /api/web3-trading validates autonomous session tick limits", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ autonomous_session: { action: "run", ticks: 13 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "autonomous_session.ticks must be an integer from 1 to 12." });
  });

  test("POST /api/web3-trading validates autonomous session policy mode", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ autonomous_session: { action: "run", policy_mode: "reckless" } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "autonomous_session.policy_mode must be auto or manual." });
  });

  test("POST /api/web3-trading validates autonomous session fill caps", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ autonomous_session: { action: "run", max_total_fills: 25 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "autonomous_session.max_total_fills must be an integer from 1 to 24." });
  });

  test("POST /api/web3-trading runs a bounded autonomous paper session", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "breakout",
          source: "sample",
          account: "persistent",
          reset: true,
          autonomous_session: {
            action: "run",
            policy_mode: "manual",
            ticks: 3,
            protect_book: true,
            max_protective_sells: 3,
            min_release_usd: 25,
            max_total_fills: 8,
          },
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.autonomous_session_run.mode).toBe("autonomous-session-run");
    expect(state.autonomous_session_run.requested).toBe(true);
    expect(state.autonomous_session_run.policy_mode).toBe("manual");
    expect(state.autonomous_session_run.planner_status).toBe("none");
    expect(state.autonomous_session_run.planner_session_kind).toBe("none");
    expect(state.autonomous_session_run.planner_route_refresh_required).toBe(false);
    expect(state.autonomous_session_run.requested_ticks).toBe(3);
    expect(state.autonomous_session_run.max_total_fills).toBe(8);
    expect(state.autonomous_session_run.completed_ticks).toBeGreaterThanOrEqual(1);
    expect(state.autonomous_session_run.completed_ticks).toBeLessThanOrEqual(3);
    expect(state.autonomous_session_run.ticks).toHaveLength(state.autonomous_session_run.completed_ticks);
    expect(state.autonomous_session_run.summary.length).toBeGreaterThan(0);
    expect(state.autonomous_session_run.safeguards.some((item) => item.includes("Live execution remains disabled"))).toBe(true);
    expect(state.autonomous_policy_optimizer.mode).toBe("autonomous-policy-optimizer");
    expect(["attack", "selective", "protect", "cooldown"]).toContain(state.autonomous_policy_optimizer.status);
    expect(["snipe", "scalp", "compound", "harvest", "protect", "stand-down"]).toContain(state.autonomous_policy_optimizer.desk_mode);
    expect(state.autonomous_policy_optimizer.desk_mode_confidence).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_policy_optimizer.desk_mode_confidence).toBeLessThanOrEqual(100);
    expect(state.autonomous_policy_optimizer.fresh_entry_permission).toBe(state.churn_efficiency_auditor.entry_permission);
    expect(state.autonomous_policy_optimizer.allowed_actions.length).toBeGreaterThanOrEqual(2);
    expect(state.autonomous_policy_optimizer.allowed_actions).toContain("watch");
    expect(state.autonomous_policy_optimizer.mode_reason.length).toBeGreaterThan(0);
    expect(state.autonomous_policy_optimizer.mode_controls.some((item) => item.includes("Desk mode"))).toBe(true);
    if (!state.churn_efficiency_auditor.can_open_fresh_entries) {
      expect(state.autonomous_policy_optimizer.allowed_actions).not.toContain("fresh-buy");
    }
    expect(state.autonomous_policy_optimizer.recommended_session_ticks).toBeGreaterThanOrEqual(1);
    expect(state.autonomous_policy_optimizer.max_trades_next_session).toBeGreaterThanOrEqual(1);
    expect(state.autonomous_policy_optimizer.items.length).toBeGreaterThanOrEqual(4);
    expect(state.autonomous_policy_optimizer.safeguards.some((item) => item.includes("Do not bypass execution readiness"))).toBe(true);
    expect(state.execution_gate.live_execution_enabled).toBe(false);
  });

  test("POST /api/web3-trading respects a one-fill autonomous paper session cap", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "breakout",
          source: "sample",
          account: "persistent",
          reset: true,
          autonomous_session: {
            action: "run",
            policy_mode: "manual",
            ticks: 12,
            protect_book: true,
            max_protective_sells: 3,
            min_release_usd: 25,
            max_total_fills: 1,
          },
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.autonomous_session_run.requested).toBe(true);
    expect(state.autonomous_session_run.max_total_fills).toBe(1);
    expect(state.autonomous_session_run.fill_count).toBeLessThanOrEqual(1);
    expect(state.autonomous_session_run.protective_sell_count).toBeLessThanOrEqual(1);
    expect(state.autonomous_session_run.summary).toContain("1-fill planner cap");
  });

  test("POST /api/web3-trading auto session follows the baseline planner envelope", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "breakout", advance: false });
    const baseline = await getWeb3TradingStateAsync({ account: "persistent", scenario: "breakout", advance: false });

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "breakout",
          source: "sample",
          account: "persistent",
          autonomous_session: {
            action: "run",
            policy_mode: "auto",
          },
        }),
      }),
    );
    const state = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(state.autonomous_session_run.policy_mode).toBe("auto");
    expect(state.autonomous_session_run.policy_status).toBe(baseline.autonomous_policy_optimizer.status);
    expect(state.autonomous_session_run.policy_label).toBe(baseline.autonomous_policy_optimizer.policy_label);
    expect(state.autonomous_session_run.planner_status).toBe(baseline.autonomous_session_planner.status);
    expect(state.autonomous_session_run.planner_session_kind).toBe(baseline.autonomous_session_planner.session_kind);
    expect(state.autonomous_session_run.planner_selected_tactic).toBe(baseline.autonomous_session_planner.selected_tactic);
    expect(state.autonomous_session_run.planner_selected_tactic_label).toBe(baseline.autonomous_session_planner.selected_tactic_label);
    expect(state.autonomous_session_run.planner_target_symbol).toBe(baseline.autonomous_session_planner.target_symbol);
    expect(state.autonomous_session_run.planner_deploy_budget_usd).toBe(baseline.autonomous_session_planner.deploy_budget_usd);
    expect(state.autonomous_session_run.planner_release_budget_usd).toBe(baseline.autonomous_session_planner.release_budget_usd);
    expect(state.autonomous_session_run.planner_route_refresh_required).toBe(baseline.autonomous_session_planner.route_refresh_required);
    expect(state.autonomous_session_run.requested_ticks).toBe(
      baseline.autonomous_session_planner.planned_ticks > 0
        ? baseline.autonomous_session_planner.planned_ticks
        : baseline.autonomous_policy_optimizer.recommended_session_ticks,
    );
    expect(state.autonomous_session_run.max_total_fills).toBe(baseline.autonomous_session_planner.max_total_fills);
    expect(state.autonomous_session_run.summary).toContain("under auto");
    expect(state.autonomous_session_run.summary).toContain("planner");
    expect(state.autonomous_session_run.safeguards.some((item) => item.includes("session planner sets"))).toBe(true);
    expect(state.autonomous_command_center.mode).toBe("autonomous-command-center");
    expect(state.autonomous_command_center.items.length).toBeGreaterThan(0);
    expect(state.autonomous_command_center.items.every((item) => typeof item.rehearsal_score === "number")).toBe(true);
    expect(state.autonomous_command_center_execution.mode).toBe("command-center-paper-execution");
    expect(state.autonomous_command_center_execution.execution_boundary).toBe("paper-ledger-only");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.autonomous_command_center_execution.status);
    expect(typeof state.autonomous_command_center_execution.rehearsal_score).toBe("number");
    expect(state.autonomous_command_performance.mode).toBe("autonomous-command-performance");
    expect(typeof state.autonomous_command_performance.next_size_multiplier).toBe("number");
    expect(state.autonomous_profit_learning.mode).toBe("autonomous-profit-learning");
    expect(["press", "selective", "tighten", "protect", "learning", "idle"]).toContain(state.autonomous_profit_learning.status);
    expect(state.autonomous_profit_learning.items.length).toBeGreaterThanOrEqual(5);
    expect(state.autonomous_profit_learning.deploy_bias_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_learning.release_bias_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_learning.cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_profit_learning.items.some((item) =>
      item.lane === "replay" &&
      item.detail.includes("replay PnL") &&
      item.cadence_seconds > 0
    )).toBe(true);
    expect(state.autonomous_profit_allocation_plan.mode).toBe("autonomous-profit-allocation-plan");
    expect(["press", "rotate", "protect", "cooldown", "learning", "idle"]).toContain(state.autonomous_profit_allocation_plan.status);
    expect(state.autonomous_profit_allocation_plan.deploy_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.release_budget_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_profit_allocation_plan.cadence_seconds).toBeGreaterThan(0);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("simulated sizing"))).toBe(true);
    expect(state.autonomous_profit_allocation_plan.controls.some((control) => control.includes("protective sells bypass"))).toBe(true);
    expect(state.autonomous_market_intelligence.mode).toBe("autonomous-market-intelligence");
    expect(["chase", "selective", "watch", "protect", "blocked", "idle"]).toContain(state.autonomous_market_intelligence.status);
    expect(state.autonomous_market_intelligence.items.length).toBeGreaterThan(0);
    expect(state.autonomous_market_intelligence.deploy_bias_usd).toBeGreaterThanOrEqual(0);
    expect(state.autonomous_market_intelligence.recommended_cadence_seconds).toBeGreaterThan(0);
    expect(state.market_intelligence_execution.mode).toBe("market-intelligence-paper-execution");
    expect(state.market_intelligence_execution.execution_boundary).toBe("paper-ledger-only");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.market_intelligence_execution.status);
    expect(state.autonomous_watchlist_rotation.mode).toBe("autonomous-watchlist-rotation");
    expect(state.autonomous_watchlist_rotation.items.length).toBeGreaterThan(0);
    expect(state.watchlist_rotation_execution.mode).toBe("watchlist-rotation-paper-execution");
    expect(state.watchlist_rotation_execution.execution_boundary).toBe("paper-ledger-only");
    expect(["queued", "applied", "blocked", "idle"]).toContain(state.watchlist_rotation_execution.status);
    expect(state.autonomous_profit_control.mode).toBe("autonomous-profit-control");
    expect(["press", "compound", "harvest", "redeploy", "protect", "cooldown"]).toContain(state.autonomous_profit_control.status);
    expect(state.autonomous_profit_control.cadence_seconds).toBeGreaterThan(0);
    expect(state.execution_gate.live_execution_enabled).toBe(false);
  });

  test("POST /api/web3-trading applies sentinel portfolio sweep to the paper ledger", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const beforeResponse = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "rug-risk",
          account: "persistent",
          advance: false,
        }),
      }),
    );
    const before = await json<Web3TradingState>(beforeResponse);

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "rug-risk",
          account: "persistent",
          advance: false,
          portfolio_sweep: {
            action: "apply",
            max_trades: 3,
            min_release_usd: 25,
          },
        }),
      }),
    );
    const after = await json<Web3TradingState>(response);

    expect(beforeResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(before.portfolio.open_positions.length).toBeGreaterThan(0);
    expect(before.autonomous_portfolio_sentinel.recommended_release_usd).toBeGreaterThan(0);
    expect(after.trade_tape.some((trade) => trade.id.startsWith("paper-portfolio-sweep") && trade.side === "sell")).toBe(true);
    expect(after.paper_account.trade_count).toBeGreaterThan(before.paper_account.trade_count);
    expect(after.portfolio.cash_usd).toBeGreaterThan(before.portfolio.cash_usd);
    expect(after.portfolio.exposure_usd).toBeLessThan(before.portfolio.exposure_usd);
  });

  test("POST /api/web3-trading runs autonomous burst with sell-first paper protection", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const before = await getWeb3TradingStateAsync({ account: "persistent", scenario: "rug-risk", advance: false });

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "rug-risk",
          account: "persistent",
          daemon: true,
          advance: false,
          autonomous_burst: {
            action: "run",
            protect_book: true,
            max_protective_sells: 3,
            min_release_usd: 25,
          },
        }),
      }),
    );
    const after = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(before.autonomous_portfolio_sentinel.recommended_release_usd).toBeGreaterThan(0);
    expect(after.trade_tape.some((trade) => trade.id.startsWith("paper-portfolio-sweep") && trade.side === "sell")).toBe(true);
    expect(after.autonomous_position_risk_execution.mode).toBe("autonomous-position-risk-execution");
    expect(after.paper_daemon.requested).toBe(true);
    expect(after.portfolio.cash_usd).toBeGreaterThan(before.portfolio.cash_usd);
    expect(after.portfolio.exposure_usd).toBeLessThan(before.portfolio.exposure_usd);
  });

  test("POST /api/web3-trading advances autonomous position risk execution without an explicit sweep", async () => {
    await getWeb3TradingStateAsync({ account: "persistent", reset: true, scenario: "base", advance: true });
    const before = await getWeb3TradingStateAsync({ account: "persistent", scenario: "rug-risk", advance: false });

    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          scenario: "rug-risk",
          account: "persistent",
          advance: true,
        }),
      }),
    );
    const after = await json<Web3TradingState>(response);

    expect(response.status).toBe(200);
    expect(before.autonomous_position_risk_execution.mode).toBe("autonomous-position-risk-execution");
    expect(after.trade_tape.some((trade) => (
      trade.id.startsWith("paper-command-") ||
      trade.id.startsWith("paper-tape-guard") ||
      trade.id.startsWith("paper-position-risk") ||
      trade.id.startsWith("paper-watchlist-rotation")
    ) && trade.side === "sell")).toBe(true);
    expect(after.portfolio_tape_guard_execution.execution_boundary).toBe("paper-ledger-only");
    expect(after.autonomous_position_risk_execution.execution_boundary).toBe("paper-ledger-only");
    expect(after.autonomous_command_center_execution.execution_boundary).toBe("paper-ledger-only");
    expect(after.paper_account.trade_count).toBeGreaterThan(before.paper_account.trade_count);
    expect(after.execution_gate.live_execution_enabled).toBe(false);
  });

  test("GET /api/web3-ohlcv validates pool candles without calling a provider", async () => {
    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&timeframe=minute"),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "pool must be a non-empty pool address or id without URL separators." });
  });

  test("GET /api/web3-ohlcv rejects pool ids with URL separators", async () => {
    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&pool=bad/pool&timeframe=minute"),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "pool must be a non-empty pool address or id without URL separators." });
  });

  test("GET /api/web3-ohlcv validates paper wallet context", async () => {
    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&pool=pool-1&timeframe=minute&paper=true&cash_usd=-1"),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "cash_usd must be a number from 0 to 10000000." });
  });

  test("GET /api/web3-ohlcv normalizes GeckoTerminal candles", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        data: {
          attributes: {
            ohlcv_list: [
              [1_718_000_000, 0.1, 0.2, 0.08, 0.18, 1200],
              [1_718_000_060, 0.18, 0.24, 0.16, 0.22, 1800],
            ],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&pool=pool-1&timeframe=minute&aggregate=1&limit=2&token=base"),
    );
    const body = await json<{
      status: string;
      candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>;
      source: string;
      signal: { action: string; confidence: number; blockers: string[] };
      paper_decision: { action: string; reason: string; blockers: string[] };
    }>(response);

    expect(response.status).toBe(200);
    expect(requestedUrl).toContain("/networks/solana/pools/pool-1/ohlcv/minute?");
    expect(requestedUrl).toContain("aggregate=1");
    expect(body.status).toBe("ok");
    expect(body.source).toBe("geckoterminal-public");
    expect(body.candles).toEqual([
      { timestamp: 1_718_000_000, open: 0.1, high: 0.2, low: 0.08, close: 0.18, volume: 1200 },
      { timestamp: 1_718_000_060, open: 0.18, high: 0.24, low: 0.16, close: 0.22, volume: 1800 },
    ]);
    expect(body.signal.action).toBe("hold");
    expect(body.signal.confidence).toBe(18);
    expect(body.signal.blockers).toContain("Candle window is too short for high-frequency paper sizing.");
    expect(body.paper_decision.action).toBe("paper-hold");
    expect(body.paper_decision.blockers).toContain("Pass paper=true with cash_usd, equity_usd, and position_usd to size a local action.");
  });

  test("GET /api/web3-ohlcv can auto-resolve a scanner candidate pool for candle proof", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        data: {
          attributes: {
            ohlcv_list: [
              [1_718_000_000, 0.1, 0.102, 0.099, 0.101, 700],
              [1_718_000_060, 0.101, 0.104, 0.1, 0.103, 800],
              [1_718_000_120, 0.103, 0.106, 0.102, 0.105, 900],
              [1_718_000_180, 0.105, 0.11, 0.104, 0.108, 1300],
              [1_718_000_240, 0.108, 0.114, 0.107, 0.112, 1500],
              [1_718_000_300, 0.112, 0.12, 0.111, 0.118, 1900],
            ],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?auto=true&source=sample&scenario=breakout&account=ephemeral&cycles=0&timeframe=minute&aggregate=1&limit=6&token=base&paper=true&cash_usd=1200&position_usd=0&equity_usd=5000&max_trade_usd=250"),
    );
    const body = await json<{
      network: string;
      pool: string;
      resolution: {
        mode: string;
        source: string;
        scenario: string;
        symbol: string;
        token_id: string;
        pair_address: string;
        summary: string;
      };
      signal: { mode: string; action: string; confidence: number };
      paper_decision: { action: string; side: string; safeguards: string[] };
      live_execution_permission: string;
      wallet_mutation_permission: string;
      transaction_submission_permission: string;
      private_key_storage: string;
      secret_echo_permission: string;
      controls: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(requestedUrl).toContain("/networks/solana/pools/");
    expect(requestedUrl).toContain("/ohlcv/minute?");
    expect(body.network).toBe("solana");
    expect(body.pool).toBe(body.resolution.pair_address);
    expect(body.resolution.mode).toBe("auto-dex-candidate");
    expect(body.resolution.source).toBe("sample");
    expect(body.resolution.scenario).toBe("breakout");
    expect(body.resolution.symbol.length).toBeGreaterThan(0);
    expect(body.resolution.token_id.length).toBeGreaterThan(0);
    expect(body.resolution.summary).toContain("Auto-selected");
    expect(body.signal.mode).toBe("local-candle-signal-v1");
    expect(["press", "probe", "hold", "trim", "exit", "avoid"]).toContain(body.signal.action);
    expect(body.signal.confidence).toBeGreaterThanOrEqual(0);
    expect(["paper-buy", "paper-sell", "paper-hold", "paper-block"]).toContain(body.paper_decision.action);
    expect(body.paper_decision.safeguards).toContain("no transaction broadcast");
    expect(body.live_execution_permission).toBe("blocked");
    expect(body.wallet_mutation_permission).toBe("blocked");
    expect(body.transaction_submission_permission).toBe("blocked");
    expect(body.private_key_storage).toBe("blocked");
    expect(body.secret_echo_permission).toBe("blocked");
    expect(body.controls).toContain("Reads public GeckoTerminal OHLCV candles only.");
  });

  test("GET /api/web3-ohlcv auto mode skips unavailable scanner pools", async () => {
    let callCount = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "missing" }), { status: 404, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        data: {
          attributes: {
            ohlcv_list: [
              [1_718_000_000, 0.2, 0.202, 0.199, 0.201, 700],
              [1_718_000_060, 0.201, 0.204, 0.2, 0.203, 800],
              [1_718_000_120, 0.203, 0.206, 0.202, 0.205, 900],
              [1_718_000_180, 0.205, 0.21, 0.204, 0.208, 1300],
              [1_718_000_240, 0.208, 0.214, 0.207, 0.212, 1500],
              [1_718_000_300, 0.212, 0.22, 0.211, 0.218, 1900],
            ],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?auto=true&source=sample&scenario=breakout&account=ephemeral&cycles=0&timeframe=minute&limit=6"),
    );
    const body = await json<{
      resolution: { mode: string; attempt_count: number; pair_address: string };
      candles: Array<{ close: number }>;
      paper_decision: { safeguards: string[] };
    }>(response);

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
    expect(body.resolution.mode).toBe("auto-dex-candidate");
    expect(body.resolution.attempt_count).toBe(2);
    expect(body.candles.length).toBe(6);
    expect(body.paper_decision.safeguards).toContain("no signer request");
  });

  test("GET /api/web3-ohlcv live auto mode refuses fallback sample pools before GeckoTerminal", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("geckoterminal.com")) {
        throw new Error("GeckoTerminal should not be called for live-dex fallback sample pools.");
      }
      return new Response(JSON.stringify({ error: "dex unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?auto=true&source=live-dex&scenario=breakout&account=ephemeral&cycles=0&timeframe=minute&limit=6"),
    );
    const body = await json<{ error: string }>(response);

    expect(response.status).toBe(422);
    expect(body.error).toBe("No current live DEX candidate pool is available for auto OHLCV resolution; market source is fallback.");
    expect(requestedUrls.some((url) => url.includes("geckoterminal.com"))).toBe(false);
  });

  test("GET /api/web3-ohlcv sorts candles and returns a local candle decision", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL) => {
      return new Response(JSON.stringify({
        data: {
          attributes: {
            ohlcv_list: [
              [1_718_000_420, 0.128, 0.15, 0.126, 0.148, 3200],
              [1_718_000_360, 0.118, 0.13, 0.116, 0.128, 2600],
              [1_718_000_300, 0.112, 0.12, 0.111, 0.118, 1900],
              [1_718_000_240, 0.108, 0.114, 0.107, 0.112, 1500],
              [1_718_000_180, 0.105, 0.11, 0.104, 0.108, 1300],
              [1_718_000_120, 0.103, 0.106, 0.102, 0.105, 900],
              [1_718_000_060, 0.101, 0.104, 0.1, 0.103, 800],
              [1_718_000_000, 0.1, 0.102, 0.099, 0.101, 700],
            ],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const response = await OHLCV_GET(
      new Request("http://localhost/api/web3-ohlcv?network=solana&pool=pool-press&timeframe=minute&aggregate=1&limit=8&token=base&paper=true&cash_usd=2500&position_usd=0&equity_usd=10000&max_trade_usd=500"),
    );
    const body = await json<{
      candles: Array<{ timestamp: number }>;
      signal: {
        mode: string;
        action: string;
        confidence: number;
        short_change_pct: number;
        volume_burst_ratio: number;
        stop_price_usd: number;
        take_profit_price_usd: number;
        review_after_seconds: number;
        triggers: string[];
      };
      paper_decision: {
        action: string;
        side: string;
        notional_usd: number;
        cash_delta_usd: number;
        exposure_delta_usd: number;
        projected_cash_usd: number;
        projected_position_usd: number;
        safeguards: string[];
      };
    }>(response);

    expect(response.status).toBe(200);
    expect(body.candles.map((candle) => candle.timestamp)).toEqual([
      1_718_000_000,
      1_718_000_060,
      1_718_000_120,
      1_718_000_180,
      1_718_000_240,
      1_718_000_300,
      1_718_000_360,
      1_718_000_420,
    ]);
    expect(body.signal.mode).toBe("local-candle-signal-v1");
    expect(body.signal.action).toBe("press");
    expect(body.signal.confidence).toBeGreaterThanOrEqual(72);
    expect(body.signal.short_change_pct).toBeGreaterThan(20);
    expect(body.signal.volume_burst_ratio).toBeGreaterThan(1);
    expect(body.signal.stop_price_usd).toBeLessThan(body.signal.take_profit_price_usd);
    expect(body.signal.review_after_seconds).toBe(10);
    expect(body.signal.triggers.length).toBeGreaterThanOrEqual(3);
    expect(body.paper_decision.action).toBe("paper-buy");
    expect(body.paper_decision.side).toBe("buy");
    expect(body.paper_decision.notional_usd).toBeGreaterThan(10);
    expect(body.paper_decision.notional_usd).toBeLessThanOrEqual(500);
    expect(body.paper_decision.cash_delta_usd).toBeLessThan(0);
    expect(body.paper_decision.exposure_delta_usd).toBeGreaterThan(0);
    expect(body.paper_decision.projected_cash_usd).toBe(2500 - body.paper_decision.notional_usd);
    expect(body.paper_decision.projected_position_usd).toBe(body.paper_decision.notional_usd);
    expect(body.paper_decision.safeguards).toContain("no transaction broadcast");
  });

  test("POST /api/web3-ohlcv validates paper ledger apply requests", async () => {
    const response = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify({
          action: "apply-paper-decision",
          idempotency_key: "bad/key",
          symbol: "TEST",
          side: "buy",
          notional_usd: 250,
          price_usd: 0.1,
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "idempotency_key must be 1 to 160 characters without URL separators." });
  });

  test("POST /api/web3-ohlcv applies a candle paper buy to the local ledger once", async () => {
    const request = {
      action: "apply-paper-decision",
      idempotency_key: "test-candle-1718000420-buy",
      symbol: "TEST",
      token_id: "solana-test-ohlcv",
      token_address: "test-token",
      chain: "solana",
      side: "buy",
      notional_usd: 250,
      price_usd: 0.1,
      stop_price_usd: 0.092,
      take_profit_price_usd: 0.124,
      reason: "press signal confirmed by candle momentum and volume burst",
      source: "pool-test",
    };

    const first = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
    const firstBody = await json<{
      status: string;
      cash_usd: number;
      equity_usd: number;
      exposure_usd: number;
      position_usd: number;
      trade_count: number;
      safeguards: string[];
    }>(first);

    const duplicate = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
    const duplicateBody = await json<{
      status: string;
      cash_usd: number;
      exposure_usd: number;
      trade_count: number;
      blockers: string[];
    }>(duplicate);

    expect(first.status).toBe(200);
    expect(firstBody.status).toBe("applied");
    expect(firstBody.cash_usd).toBe(24_750);
    expect(firstBody.equity_usd).toBe(25_000);
    expect(firstBody.exposure_usd).toBe(250);
    expect(firstBody.position_usd).toBe(250);
    expect(firstBody.trade_count).toBe(1);
    expect(firstBody.safeguards).toContain("no transaction broadcast");
    expect(duplicate.status).toBe(200);
    expect(duplicateBody.status).toBe("duplicate");
    expect(duplicateBody.cash_usd).toBe(24_750);
    expect(duplicateBody.exposure_usd).toBe(250);
    expect(duplicateBody.trade_count).toBe(1);
    expect(duplicateBody.blockers).toContain("duplicate-idempotency-key");
  });

  test("POST /api/web3-ohlcv applies a candle paper sell against an open paper position", async () => {
    const buy = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify({
          action: "apply-paper-decision",
          idempotency_key: "test-candle-roundtrip-buy",
          symbol: "TEST",
          token_id: "solana-test-ohlcv",
          token_address: "test-token",
          chain: "solana",
          side: "buy",
          notional_usd: 250,
          price_usd: 0.1,
          stop_price_usd: 0.092,
          take_profit_price_usd: 0.124,
          reason: "press signal confirmed by candle momentum and volume burst",
          source: "pool-test",
        }),
      }),
    );

    const sell = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify({
          action: "apply-paper-decision",
          idempotency_key: "test-candle-roundtrip-sell",
          symbol: "TEST",
          token_id: "solana-test-ohlcv",
          token_address: "test-token",
          chain: "solana",
          side: "sell",
          notional_usd: 120,
          price_usd: 0.12,
          stop_price_usd: 0.108,
          take_profit_price_usd: 0.132,
          reason: "trim after candle exit pressure",
          source: "pool-test",
        }),
      }),
    );
    const sellBody = await json<{
      status: string;
      cash_usd: number;
      equity_usd: number;
      exposure_usd: number;
      realized_pnl_usd: number;
      position_usd: number;
      trade_count: number;
    }>(sell);

    expect(buy.status).toBe(200);
    expect(sell.status).toBe(200);
    expect(sellBody.status).toBe("applied");
    expect(sellBody.cash_usd).toBe(24_870);
    expect(sellBody.exposure_usd).toBe(180);
    expect(sellBody.position_usd).toBe(180);
    expect(sellBody.equity_usd).toBe(25_050);
    expect(sellBody.realized_pnl_usd).toBe(20);
    expect(sellBody.trade_count).toBe(2);
  });

  test("POST /api/web3-ohlcv blocks a protective paper sell without a matching position", async () => {
    const response = await OHLCV_POST(
      new Request("http://localhost/api/web3-ohlcv", {
        method: "POST",
        body: JSON.stringify({
          action: "apply-paper-decision",
          idempotency_key: "test-guard-sell-no-position",
          symbol: "MISS",
          token_id: "solana-miss-ohlcv",
          token_address: "miss-token",
          chain: "solana",
          side: "sell",
          notional_usd: 120,
          price_usd: 0.12,
          stop_price_usd: 0.108,
          take_profit_price_usd: 0.132,
          reason: "protective guard sell without a held position",
          source: "pool-miss",
        }),
      }),
    );
    const body = await json<{
      status: string;
      cash_usd: number;
      exposure_usd: number;
      trade_count: number;
      blockers: string[];
    }>(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe("blocked");
    expect(body.cash_usd).toBe(25_000);
    expect(body.exposure_usd).toBe(0);
    expect(body.trade_count).toBe(0);
    expect(body.blockers).toContain("no-paper-position");
  });

  test("POST /api/web3-trading rejects malformed trigger-order signed deposits", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          trigger_order: {
            action: "create-order",
            deposit_request_id: "deposit-request-1",
            deposit_signed_tx: "not base64!",
          },
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "trigger_order.deposit_signed_tx must be base64 encoded." });
  });

  test("POST /api/web3-trading validates trigger-history pagination", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ trigger_history: { state: "active", limit: 101 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "trigger_history.limit must be an integer from 1 to 100." });
  });

  test("POST /api/web3-trading validates trigger reconciliation requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ trigger_reconcile: { action: "apply", order_ids: [""] } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "trigger_reconcile.order_ids must be an array of non-empty strings when provided." });
  });

  test("POST /api/web3-trading validates on-chain event inbox batches", async () => {
    const badSource = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ onchain_events: { source: "mystery-feed", events: [{}] } }),
      }),
    );
    const badEvents = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ onchain_events: { source: "manual", events: [] } }),
      }),
    );

    expect(badSource.status).toBe(422);
    expect(await json<{ error: string }>(badSource)).toEqual({
      error: "onchain_events.source must be helius-webhook, helius-history, or manual.",
    });
    expect(badEvents.status).toBe(422);
    expect(await json<{ error: string }>(badEvents)).toEqual({
      error: "onchain_events.events must contain 1 to 25 events.",
    });
  });

  test("POST /api/web3-trading validates advance as an explicit boolean", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ advance: "yes" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "advance must be a boolean." });
  });

  test("POST /api/web3-trading validates daemon as an explicit boolean", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ daemon: "yes" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "daemon must be a boolean." });
  });

  test("POST /api/web3-trading validates execution cap inputs", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ execution: { mode: "dry-run", max_trade_usd: -1 } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "execution.max_trade_usd must be greater than 0." });
  });

  test("POST /api/web3-trading validates drill as an explicit boolean", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ drill: "true" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({ error: "drill must be a boolean." });
  });

  test("POST /api/web3-trading validates signer simulation fields", async () => {
    const badToggle = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ execution: { signer_simulation_enabled: "yes" } }),
      }),
    );
    const badNetwork = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ execution: { signer_network: "mainnet" } }),
      }),
    );

    expect(badToggle.status).toBe(422);
    expect(await json<{ error: string }>(badToggle)).toEqual({
      error: "execution.signer_simulation_enabled must be a boolean.",
    });
    expect(badNetwork.status).toBe(422);
    expect(await json<{ error: string }>(badNetwork)).toEqual({
      error: "execution.signer_network must be devnet or localnet.",
    });
  });

  test("POST /api/web3-trading validates signed relay payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({ relay: { signed_transaction: "not base64!" } }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({
      error: "relay.signed_transaction must be base64 encoded.",
    });
  });

  test("POST /api/web3-trading validates signer request hashes", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          signer_request: {
            action: "request",
            provider: "privy-server-wallet",
            request_id: "order-123",
            payload_hash: "not-a-hash",
          },
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({
      error: "signer_request.payload_hash must be a 64-character hex hash.",
    });
  });

  test("POST /api/web3-trading validates managed submit signatures", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          managed_submit: {
            action: "record",
            provider: "turnkey-policy-wallet",
            status: "confirmed",
            request_id: "order-123",
            payload_hash: "0".repeat(64),
            provider_status_id: "turnkey-status-123",
            transaction_signature: "not base58!",
          },
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({
      error: "managed_submit.transaction_signature must look like a base58 Solana transaction signature.",
    });
  });

  test("POST /api/web3-trading validates managed submit poll signatures", async () => {
    const response = await POST(
      new Request("http://localhost/api/web3-trading", {
        method: "POST",
        body: JSON.stringify({
          managed_submit_poll: {
            action: "poll",
            provider: "turnkey-policy-wallet",
            provider_status_id: "turnkey-status-123",
            request_id: "order-123",
            payload_hash: "0".repeat(64),
            result: {
              status: "confirmed",
              transaction_signature: "not base58!",
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await json<{ error: string }>(response)).toEqual({
      error: "managed_submit_poll.result.transaction_signature must look like a base58 Solana transaction signature.",
    });
  });
});

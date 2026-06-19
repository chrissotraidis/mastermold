import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_ENV_FILE = ".env.local";
const MAX_SECRET_LENGTH = 4096;
const SENSITIVE_FIELD_PATTERN = /(private|secret|seed|mnemonic|recovery|phrase|keypair)/i;
const ALLOWED_SENSITIVE_FIELDS = new Set([
  "helius_api_key",
  "jupiter_api_key",
  "privy_app_secret",
  "turnkey_api_private_key",
]);

export type Web3LocalCredentialInstallStatus = "installed" | "unchanged" | "blocked" | "invalid";

export type Web3LocalCredentialInstallReceipt = {
  mode: "web3-local-credential-install";
  status: Web3LocalCredentialInstallStatus;
  installed_keys: string[];
  configured_keys: string[];
  missing_keys: string[];
  rejected_fields: string[];
  local_install_allowed: boolean;
  storage: "ignored-local-env";
  generated_at: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  secret_echo_permission: "blocked";
  next_action: string;
  summary: string;
};

type CredentialInput = {
  helius_api_key?: unknown;
  rpc_url?: unknown;
  ws_url?: unknown;
  jupiter_api_key?: unknown;
  autonomous_signer_provider?: unknown;
  privy_app_id?: unknown;
  privy_app_secret?: unknown;
  privy_solana_wallet_id?: unknown;
  turnkey_organization_id?: unknown;
  turnkey_api_public_key?: unknown;
  turnkey_api_private_key?: unknown;
  turnkey_solana_wallet_account?: unknown;
  session_key_public_key?: unknown;
  session_policy_hash?: unknown;
  emergency_stop_webhook_url?: unknown;
  emergency_stop_contact?: unknown;
  tax_ledger_export_path?: unknown;
  production_process_manager?: unknown;
  production_worker_owner?: unknown;
  production_alert_webhook_url?: unknown;
  production_restart_policy_url?: unknown;
};

type CredentialTarget = {
  field: keyof CredentialInput;
  env:
    | "HELIUS_API_KEY"
    | "SOLANA_RPC_URL"
    | "SOLANA_WS_URL"
    | "JUPITER_API_KEY"
    | "MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER"
    | "PRIVY_APP_ID"
    | "PRIVY_APP_SECRET"
    | "PRIVY_SOLANA_WALLET_ID"
    | "TURNKEY_ORGANIZATION_ID"
    | "TURNKEY_API_PUBLIC_KEY"
    | "TURNKEY_API_PRIVATE_KEY"
    | "TURNKEY_SOLANA_WALLET_ACCOUNT"
    | "MASTERMOLD_SESSION_KEY_PUBLIC_KEY"
    | "MASTERMOLD_SESSION_POLICY_HASH"
    | "MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL"
    | "MASTERMOLD_EMERGENCY_STOP_CONTACT"
    | "MASTERMOLD_TAX_LEDGER_EXPORT_PATH"
    | "MASTERMOLD_WEB3_PROCESS_MANAGER"
    | "MASTERMOLD_WEB3_WORKER_OWNER"
    | "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL"
    | "MASTERMOLD_WEB3_RESTART_POLICY_URL";
  kind: "key" | "http-url" | "ws-url" | "contact" | "path" | "signer-provider";
};

const CREDENTIAL_TARGETS: CredentialTarget[] = [
  { field: "helius_api_key", env: "HELIUS_API_KEY", kind: "key" },
  { field: "rpc_url", env: "SOLANA_RPC_URL", kind: "http-url" },
  { field: "ws_url", env: "SOLANA_WS_URL", kind: "ws-url" },
  { field: "jupiter_api_key", env: "JUPITER_API_KEY", kind: "key" },
  { field: "autonomous_signer_provider", env: "MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER", kind: "signer-provider" },
  { field: "privy_app_id", env: "PRIVY_APP_ID", kind: "key" },
  { field: "privy_app_secret", env: "PRIVY_APP_SECRET", kind: "key" },
  { field: "privy_solana_wallet_id", env: "PRIVY_SOLANA_WALLET_ID", kind: "key" },
  { field: "turnkey_organization_id", env: "TURNKEY_ORGANIZATION_ID", kind: "key" },
  { field: "turnkey_api_public_key", env: "TURNKEY_API_PUBLIC_KEY", kind: "key" },
  { field: "turnkey_api_private_key", env: "TURNKEY_API_PRIVATE_KEY", kind: "key" },
  { field: "turnkey_solana_wallet_account", env: "TURNKEY_SOLANA_WALLET_ACCOUNT", kind: "key" },
  { field: "session_key_public_key", env: "MASTERMOLD_SESSION_KEY_PUBLIC_KEY", kind: "key" },
  { field: "session_policy_hash", env: "MASTERMOLD_SESSION_POLICY_HASH", kind: "key" },
  { field: "emergency_stop_webhook_url", env: "MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL", kind: "http-url" },
  { field: "emergency_stop_contact", env: "MASTERMOLD_EMERGENCY_STOP_CONTACT", kind: "contact" },
  { field: "tax_ledger_export_path", env: "MASTERMOLD_TAX_LEDGER_EXPORT_PATH", kind: "path" },
  { field: "production_process_manager", env: "MASTERMOLD_WEB3_PROCESS_MANAGER", kind: "contact" },
  { field: "production_worker_owner", env: "MASTERMOLD_WEB3_WORKER_OWNER", kind: "contact" },
  { field: "production_alert_webhook_url", env: "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL", kind: "http-url" },
  { field: "production_restart_policy_url", env: "MASTERMOLD_WEB3_RESTART_POLICY_URL", kind: "http-url" },
];

export function buildWeb3LocalCredentialInstallHealth(request?: Request): Web3LocalCredentialInstallReceipt {
  const allowed = isLocalCredentialInstallAllowed(request);
  const configured = configuredLocalCredentialKeys();
  const missing = CREDENTIAL_TARGETS
    .map((target) => target.env)
    .filter((env) => !configured.includes(env));
  return {
    mode: "web3-local-credential-install",
    status: allowed ? "unchanged" : "blocked",
    installed_keys: [],
    configured_keys: configured,
    missing_keys: missing,
    rejected_fields: [],
    local_install_allowed: allowed,
    storage: "ignored-local-env",
    generated_at: new Date().toISOString(),
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
    next_action: allowed
      ? nextInstallAction(missing, [])
      : "Open the local app on localhost or set MASTERMOLD_ALLOW_LOCAL_CREDENTIAL_INSTALL=true for an explicitly trusted local environment.",
    summary: allowed
      ? `${configured.length}/${CREDENTIAL_TARGETS.length} local Web3 credential and ops targets are configured.`
      : "Local credential install is blocked outside trusted localhost scope.",
  };
}

export function installWeb3LocalCredentials(input: unknown, request?: Request): Web3LocalCredentialInstallReceipt {
  const allowed = isLocalCredentialInstallAllowed(request);
  if (!allowed) {
    return {
      ...buildWeb3LocalCredentialInstallHealth(request),
      status: "blocked",
      next_action: "Credential install is available only for trusted localhost development or explicit operator opt-in.",
      summary: "Refused to write local Web3 credentials outside trusted local scope.",
    };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalidReceipt(["body"], "Request body must be a credential install object.");
  }

  const rejectedFields = findRejectedCredentialFields(input);
  if (rejectedFields.length > 0) {
    return invalidReceipt(rejectedFields, "Rejected private-key, seed-phrase, or unsupported sensitive credential fields.");
  }

  const updates = new Map<CredentialTarget["env"], string>();
  const invalidFields: string[] = [];
  const row = input as CredentialInput;
  for (const target of CREDENTIAL_TARGETS) {
    const value = normalizeCredentialValue(row[target.field]);
    if (!value) continue;
    if (!isValidCredentialValue(value, target.kind)) {
      invalidFields.push(String(target.field));
      continue;
    }
    updates.set(target.env, value);
  }

  if (invalidFields.length > 0) {
    return invalidReceipt(invalidFields, "One or more credential values are malformed.");
  }
  if (updates.size === 0) {
    const health = buildWeb3LocalCredentialInstallHealth(request);
    return {
      ...health,
      status: "unchanged",
      next_action: nextInstallAction(health.missing_keys, []),
      summary: "No non-empty credential fields were provided; local env was not changed.",
    };
  }

  writeIgnoredLocalEnv(updates);
  for (const [key, value] of updates) {
    process.env[key] = value;
  }
  const configured = configuredLocalCredentialKeys();
  const missing = CREDENTIAL_TARGETS
    .map((target) => target.env)
    .filter((env) => !configured.includes(env));
  const installed = Array.from(updates.keys());
  return {
    mode: "web3-local-credential-install",
    status: "installed",
    installed_keys: installed,
    configured_keys: configured,
    missing_keys: missing,
    rejected_fields: [],
    local_install_allowed: true,
    storage: "ignored-local-env",
    generated_at: new Date().toISOString(),
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
    next_action: nextInstallAction(missing, installed),
    summary: `${installed.length} local Web3 credential target${installed.length === 1 ? "" : "s"} installed into ignored local env; values were not returned.`,
  };
}

function invalidReceipt(rejectedFields: string[], summary: string): Web3LocalCredentialInstallReceipt {
  const configured = configuredLocalCredentialKeys();
  const missing = CREDENTIAL_TARGETS
    .map((target) => target.env)
    .filter((env) => !configured.includes(env));
  return {
    mode: "web3-local-credential-install",
    status: "invalid",
    installed_keys: [],
    configured_keys: configured,
    missing_keys: missing,
    rejected_fields: rejectedFields,
    local_install_allowed: true,
    storage: "ignored-local-env",
    generated_at: new Date().toISOString(),
    live_execution_permission: "blocked",
    wallet_mutation_permission: "blocked",
    secret_echo_permission: "blocked",
    next_action: "Submit only allowlisted provider, signer-provider, emergency-stop, production-worker, or accounting targets; never submit wallet private keys or seed phrases.",
    summary,
  };
}

function isLocalCredentialInstallAllowed(request?: Request) {
  if (process.env.MASTERMOLD_ALLOW_LOCAL_CREDENTIAL_INSTALL === "true") return true;
  const host = request?.headers.get("host") ?? "";
  const forwardedHost = request?.headers.get("x-forwarded-host") ?? "";
  return [host, forwardedHost].some((value) =>
    value.startsWith("localhost") ||
    value.startsWith("127.0.0.1") ||
    value.startsWith("[::1]") ||
    value.startsWith("::1"),
  );
}

function configuredLocalCredentialKeys() {
  return CREDENTIAL_TARGETS
    .map((target) => target.env)
    .filter((env) => typeof process.env[env] === "string" && process.env[env]?.trim());
}

function normalizeCredentialValue(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isValidCredentialValue(value: string, kind: CredentialTarget["kind"]) {
  if (value.length === 0 || value.length > MAX_SECRET_LENGTH) return false;
  if (/[\r\n\0]/.test(value)) return false;
  if (kind === "http-url") return /^https?:\/\/[^\s]+$/i.test(value);
  if (kind === "ws-url") return /^wss?:\/\/[^\s]+$/i.test(value);
  if (kind === "contact") return /^[^<>{}\[\]\r\n\0]{3,}$/.test(value);
  if (kind === "path") return /^[~/A-Za-z0-9._:\-\/ ]{3,}$/.test(value);
  if (kind === "signer-provider") return /^(external-wallet|privy|turnkey|session-key)$/i.test(value);
  return /^[A-Za-z0-9._:\-/+=@]{8,}$/.test(value);
}

function findRejectedCredentialFields(input: object) {
  return Object.keys(input)
    .filter((field) => SENSITIVE_FIELD_PATTERN.test(field) && !ALLOWED_SENSITIVE_FIELDS.has(field))
    .slice(0, 8);
}

function writeIgnoredLocalEnv(updates: Map<CredentialTarget["env"], string>) {
  const filePath = localEnvFilePath();
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = existing.length > 0 ? existing.split(/\n/) : [];
  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) return line;
    const key = match[1] as CredentialTarget["env"];
    if (!updates.has(key)) return line;
    seen.add(key);
    return `${key}=${updates.get(key)}`;
  });
  for (const [key, value] of updates) {
    if (!seen.has(key)) nextLines.push(`${key}=${value}`);
  }
  const output = `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
  writeFileSync(filePath, output, { encoding: "utf8", mode: 0o600 });
}

function nextInstallAction(missing: string[], installed: string[]) {
  if (missing.includes("JUPITER_API_KEY")) return "Add JUPITER_API_KEY, then run Jupiter rehearsal and strict order verification.";
  if (missing.includes("HELIUS_API_KEY") && missing.includes("SOLANA_RPC_URL")) return "Add HELIUS_API_KEY or SOLANA_RPC_URL, then test provider health.";
  const signerProvider = (process.env.MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER ?? "").trim().toLowerCase();
  if (!signerProvider && missing.includes("MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER")) {
    return "Keep external-wallet as the first supervised path, or choose privy, turnkey, or session-key before installing provider signer credentials.";
  }
  if (signerProvider === "privy" && ["PRIVY_APP_ID", "PRIVY_APP_SECRET", "PRIVY_SOLANA_WALLET_ID"].some((key) => missing.includes(key))) {
    return "Add the Privy app id, app secret, and Solana wallet id, then rebuild the signer credential packet.";
  }
  if (signerProvider === "turnkey" && ["TURNKEY_ORGANIZATION_ID", "TURNKEY_API_PUBLIC_KEY", "TURNKEY_API_PRIVATE_KEY", "TURNKEY_SOLANA_WALLET_ACCOUNT"].some((key) => missing.includes(key))) {
    return "Add the Turnkey organization, API key pair, and Solana wallet account, then rebuild the signer credential packet.";
  }
  if (signerProvider === "session-key" && ["MASTERMOLD_SESSION_KEY_PUBLIC_KEY", "MASTERMOLD_SESSION_POLICY_HASH"].some((key) => missing.includes(key))) {
    return "Add session-key public scope and policy hash only; never install a session private key.";
  }
  if (missing.includes("MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL") && missing.includes("MASTERMOLD_EMERGENCY_STOP_CONTACT")) {
    return "Add an emergency-stop contact or webhook, then run the local stop drill and live ops packet.";
  }
  if (missing.includes("MASTERMOLD_TAX_LEDGER_EXPORT_PATH")) return "Add an accounting export target, then rebuild the live ops packet.";
  if ([
    "MASTERMOLD_WEB3_PROCESS_MANAGER",
    "MASTERMOLD_WEB3_WORKER_OWNER",
    "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL",
    "MASTERMOLD_WEB3_RESTART_POLICY_URL",
  ].some((key) => missing.includes(key))) {
    return "Add production worker process, owner, alert, and restart-policy targets, then rebuild the live ops packet.";
  }
  if (installed.length > 0) return "Run Test credentials, Rehearse Jupiter, and npm run verify:web3 after the local server reads the updated environment.";
  return "Scope a dedicated public wallet and prove ownership; live execution remains blocked.";
}

function localEnvFilePath() {
  const override = process.env.WEB3_LOCAL_CREDENTIAL_INSTALL_ENV_PATH;
  return override && override.trim().length > 0 ? override : join(process.cwd(), LOCAL_ENV_FILE);
}

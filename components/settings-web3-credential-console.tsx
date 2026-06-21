"use client";

import { useState } from "react";
import { Activity, RefreshCw, Save, ShieldCheck, Terminal, Wallet, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Web3CredentialsSetupReadiness, Web3SignerSetupMode } from "@/src/db/web3-credentials";
import type { Web3DexDiscoveryReceipt } from "@/src/db/web3-dex-discovery";
import type { Web3CredentialDoctorHealth } from "@/src/db/web3-credential-doctor";
import type { Web3FirstCanaryDrillReceipt } from "@/src/db/web3-first-canary-drill";
import type { Web3JupiterRehearsalReceipt } from "@/src/db/web3-jupiter-rehearsal";
import type { Web3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import type { Web3LiveTradeCanaryActionReceipt } from "@/src/db/web3-live-trade-canary";
import type {
  Web3LiveUnsignedOrderHandoffReceipt,
  Web3LiveUnsignedOrderPreflightReceipt,
} from "@/src/db/web3-live-unsigned-order-handoff";
import type { Web3LiveUsabilityBlockersReceipt } from "@/src/db/web3-live-usability-blockers";
import type { Web3LocalCredentialInstallReceipt } from "@/src/db/web3-local-credential-install";
import type { Web3TradingState } from "@/src/db/web3-trading";
import type { Web3WalletOwnershipChallengeReceipt, Web3WalletOwnershipReceipt } from "@/src/db/web3-wallet-ownership";

type SettingsWeb3CredentialConsoleProps = {
  walletPublicKeyPreview: string | null;
  defaultWalletPublicKey: string;
  nextOperatorInputLabel: string | null;
  nextOperatorInputAction: string | null;
  nextOperatorInputStorage: string | null;
  nextOperatorInputVerifier: string | null;
  maxTradeUsd: number;
  dailySpendCapUsd: number;
  maxSlippageBps: number;
  jupiterConfigured: boolean;
  initialLiveUsability: Web3LiveUsabilityBlockersReceipt;
  initialFirstCanaryDrill: Web3FirstCanaryDrillReceipt;
  scenario: string;
  source: string;
  account: string;
  cycles: number;
};

type Draft = {
  helius_api_key: string;
  rpc_url: string;
  ws_url: string;
  jupiter_api_key: string;
  enable_live_web3_execution: string;
  live_operator_approval: string;
  allow_live_unsigned_canary_handoff: string;
  autonomous_signer_provider: "external-wallet" | "privy" | "turnkey" | "session-key";
  privy_app_id: string;
  privy_app_secret: string;
  privy_solana_wallet_id: string;
  turnkey_organization_id: string;
  turnkey_api_public_key: string;
  turnkey_api_private_key: string;
  turnkey_solana_wallet_account: string;
  session_key_public_key: string;
  session_policy_hash: string;
  emergency_stop_webhook_url: string;
  emergency_stop_contact: string;
  tax_ledger_export_path: string;
  production_process_manager: string;
  production_worker_owner: string;
  production_alert_webhook_url: string;
  production_restart_policy_url: string;
  wallet_public_key: string;
  signer_mode: Web3SignerSetupMode;
  max_trade_usd: string;
  daily_spend_cap_usd: string;
  max_slippage_bps: string;
};

type BrowserWalletReceipt = {
  status: "connected" | "detected" | "missing" | "rejected" | "unsupported";
  provider: string;
  wallet_public_key_preview: string | null;
  checked_at: string;
  connect_permission: "operator-prompt-only" | "not-available";
  signing_permission: "blocked";
  wallet_mutation_permission: "blocked";
  private_key_storage: "blocked";
  next_action: string;
};

type BrowserSolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  isConnected?: boolean;
  publicKey?: { toString: () => string };
  connect?: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString: () => string } } | void>;
  signMessage?: (message: Uint8Array, display?: "utf8" | "hex") => Promise<Uint8Array | { signature: Uint8Array }>;
  signTransaction?: (transaction: unknown) => Promise<unknown>;
};

type Web3CredentialDoctorRefreshReceipt = {
  mode: "web3-credential-doctor-refresh";
  status: "preview" | "refreshed" | "blocked";
  refreshed: boolean;
  refresh_supervisor_requested: boolean;
  doctor: Web3CredentialDoctorHealth;
  summary: string;
  next_action: string;
  live_execution_permission: "blocked";
  wallet_mutation_permission: "blocked";
  transaction_submission_permission: "blocked";
  private_key_storage: "blocked";
  seed_phrase_storage: "blocked";
  secret_echo_permission: "blocked";
};

export function SettingsWeb3CredentialConsole({
  walletPublicKeyPreview,
  defaultWalletPublicKey,
  nextOperatorInputLabel,
  nextOperatorInputAction,
  nextOperatorInputStorage,
  nextOperatorInputVerifier,
  maxTradeUsd,
  dailySpendCapUsd,
  maxSlippageBps,
  jupiterConfigured,
  initialLiveUsability,
  initialFirstCanaryDrill,
  scenario,
  source,
  account,
  cycles,
}: SettingsWeb3CredentialConsoleProps) {
  const [draft, setDraft] = useState<Draft>({
    helius_api_key: "",
    rpc_url: "",
    ws_url: "",
    jupiter_api_key: "",
    enable_live_web3_execution: "",
    live_operator_approval: "",
    allow_live_unsigned_canary_handoff: "",
    autonomous_signer_provider: "external-wallet",
    privy_app_id: "",
    privy_app_secret: "",
    privy_solana_wallet_id: "",
    turnkey_organization_id: "",
    turnkey_api_public_key: "",
    turnkey_api_private_key: "",
    turnkey_solana_wallet_account: "",
    session_key_public_key: "",
    session_policy_hash: "",
    emergency_stop_webhook_url: "",
    emergency_stop_contact: "",
    tax_ledger_export_path: "",
    production_process_manager: "",
    production_worker_owner: "",
    production_alert_webhook_url: "",
    production_restart_policy_url: "",
    wallet_public_key: defaultWalletPublicKey,
    signer_mode: "external-wallet",
    max_trade_usd: String(maxTradeUsd),
    daily_spend_cap_usd: String(dailySpendCapUsd),
    max_slippage_bps: String(maxSlippageBps),
  });
  const [busy, setBusy] = useState<"blockers" | "canary-drill" | "canary-preflight" | "credentials" | "dex" | "doctor" | "install" | "jupiter" | "live-canary" | "ownership" | "preflight" | "scope" | "wallet" | null>(null);
  const [message, setMessage] = useState("Session-only fields are empty by default. Leave keys blank to use server environment values.");
  const [browserWallet, setBrowserWallet] = useState<BrowserWalletReceipt | null>(null);
  const [credentialResult, setCredentialResult] = useState<(Web3CredentialsSetupReadiness & { checked_at?: string; network_tested?: boolean }) | null>(null);
  const [dexReceipt, setDexReceipt] = useState<Web3DexDiscoveryReceipt | null>(null);
  const [jupiterReceipt, setJupiterReceipt] = useState<Web3JupiterRehearsalReceipt | null>(null);
  const [doctorRefreshReceipt, setDoctorRefreshReceipt] = useState<Web3CredentialDoctorRefreshReceipt | null>(null);
  const [localInstallReceipt, setLocalInstallReceipt] = useState<Web3LocalCredentialInstallReceipt | null>(null);
  const [preflightReceipt, setPreflightReceipt] = useState<Web3LiveCapitalPreflightReceipt | null>(null);
  const [unsignedCanaryPreflightReceipt, setUnsignedCanaryPreflightReceipt] = useState<Web3LiveUnsignedOrderPreflightReceipt | null>(null);
  const [unsignedCanaryReceipt, setUnsignedCanaryReceipt] = useState<Web3LiveUnsignedOrderHandoffReceipt | null>(null);
  const [liveCanaryActionReceipt, setLiveCanaryActionReceipt] = useState<Web3LiveTradeCanaryActionReceipt | null>(null);
  const [liveUsabilityReceipt, setLiveUsabilityReceipt] = useState<Web3LiveUsabilityBlockersReceipt>(initialLiveUsability);
  const [firstCanaryDrillReceipt, setFirstCanaryDrillReceipt] = useState<Web3FirstCanaryDrillReceipt>(initialFirstCanaryDrill);
  const [ownershipReceipt, setOwnershipReceipt] = useState<Web3WalletOwnershipReceipt | null>(null);
  const [savedScope, setSavedScope] = useState<{ walletPreview: string | null; updatedAt: string } | null>(null);
  const [liveCanaryConsentArmed, setLiveCanaryConsentArmed] = useState(false);

  function updateDraft(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setMessage(isSessionSensitiveDraftField(field)
      ? "Sensitive value is held only in this page session and is not saved to browser storage."
      : field === "wallet_public_key"
        ? "Session value updated. Use a public wallet address only."
        : "Session value updated.");
  }

  async function testCredentials() {
    setBusy("credentials");
    setMessage("Testing provider, wallet, route, and policy evidence from Settings...");
    try {
      const response = await fetch("/api/web3-credentials/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: draft.rpc_url ? "custom-rpc" : "helius",
          ...draft,
          max_trade_usd: Number(draft.max_trade_usd),
          daily_spend_cap_usd: Number(draft.daily_spend_cap_usd),
          max_slippage_bps: Number(draft.max_slippage_bps),
          require_manual_confirmation: true,
          test_mode: "network",
        }),
      });
      const payload = (await response.json().catch(() => null)) as (Web3CredentialsSetupReadiness & { checked_at?: string; network_tested?: boolean }) | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Credential test failed.");
      }
      setCredentialResult(payload);
      setMessage(payload.summary);
      void refreshCredentialAndCanaryState({ announce: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Credential test failed.");
    } finally {
      setBusy(null);
    }
  }

  async function installLocalCredentials() {
    if (![
      draft.helius_api_key,
      draft.rpc_url,
      draft.ws_url,
      draft.jupiter_api_key,
      draft.enable_live_web3_execution,
      draft.live_operator_approval,
      draft.allow_live_unsigned_canary_handoff,
      draft.autonomous_signer_provider,
      draft.privy_app_id,
      draft.privy_app_secret,
      draft.privy_solana_wallet_id,
      draft.turnkey_organization_id,
      draft.turnkey_api_public_key,
      draft.turnkey_api_private_key,
      draft.turnkey_solana_wallet_account,
      draft.session_key_public_key,
      draft.session_policy_hash,
      draft.emergency_stop_webhook_url,
      draft.emergency_stop_contact,
      draft.tax_ledger_export_path,
      draft.production_process_manager,
      draft.production_worker_owner,
      draft.production_alert_webhook_url,
      draft.production_restart_policy_url,
    ].some((value) => value.trim().length > 0)) {
      setMessage("Enter a provider, first-canary flag, emergency-stop, production-worker, or accounting value before installing local env targets.");
      return;
    }
    setBusy("install");
    setMessage("Installing known Web3 credential and ops targets into ignored local env without echoing values...");
    try {
      const response = await fetch("/api/web3-local-credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          helius_api_key: draft.helius_api_key,
          rpc_url: draft.rpc_url,
          ws_url: draft.ws_url,
          jupiter_api_key: draft.jupiter_api_key,
          enable_live_web3_execution: draft.enable_live_web3_execution,
          live_operator_approval: draft.live_operator_approval,
          allow_live_unsigned_canary_handoff: draft.allow_live_unsigned_canary_handoff,
          autonomous_signer_provider: draft.autonomous_signer_provider,
          privy_app_id: draft.privy_app_id,
          privy_app_secret: draft.privy_app_secret,
          privy_solana_wallet_id: draft.privy_solana_wallet_id,
          turnkey_organization_id: draft.turnkey_organization_id,
          turnkey_api_public_key: draft.turnkey_api_public_key,
          turnkey_api_private_key: draft.turnkey_api_private_key,
          turnkey_solana_wallet_account: draft.turnkey_solana_wallet_account,
          session_key_public_key: draft.session_key_public_key,
          session_policy_hash: draft.session_policy_hash,
          emergency_stop_webhook_url: draft.emergency_stop_webhook_url,
          emergency_stop_contact: draft.emergency_stop_contact,
          tax_ledger_export_path: draft.tax_ledger_export_path,
          production_process_manager: draft.production_process_manager,
          production_worker_owner: draft.production_worker_owner,
          production_alert_webhook_url: draft.production_alert_webhook_url,
          production_restart_policy_url: draft.production_restart_policy_url,
        }),
      });
      const payload = (await response.json().catch(() => null)) as Web3LocalCredentialInstallReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Local credential install failed.");
      }
      setLocalInstallReceipt(payload);
      setDraft((current) => ({
        ...current,
        helius_api_key: "",
        rpc_url: "",
        ws_url: "",
        jupiter_api_key: "",
        enable_live_web3_execution: "",
        live_operator_approval: "",
        allow_live_unsigned_canary_handoff: "",
        privy_app_id: "",
        privy_app_secret: "",
        privy_solana_wallet_id: "",
        turnkey_organization_id: "",
        turnkey_api_public_key: "",
        turnkey_api_private_key: "",
        turnkey_solana_wallet_account: "",
        session_key_public_key: "",
        session_policy_hash: "",
        emergency_stop_webhook_url: "",
        emergency_stop_contact: "",
        tax_ledger_export_path: "",
        production_process_manager: "",
        production_worker_owner: "",
        production_alert_webhook_url: "",
        production_restart_policy_url: "",
      }));
      setMessage(payload.summary);
      void refreshCredentialAndCanaryState({ announce: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Local credential install failed.");
    } finally {
      setBusy(null);
    }
  }

  async function rehearseJupiter() {
    setBusy("jupiter");
    setMessage("Rehearsing Jupiter order readiness without saving keys or returning transaction bytes...");
    try {
      const params = new URLSearchParams({
        scenario,
        source,
        account,
        cycles: String(cycles),
      });
      const response = await fetch(`/api/web3-jupiter-rehearsal?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jupiter_api_key: draft.jupiter_api_key,
          wallet_public_key: draft.wallet_public_key,
          max_slippage_bps: Number(draft.max_slippage_bps),
        }),
      });
      const payload = (await response.json().catch(() => null)) as Web3JupiterRehearsalReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Jupiter rehearsal failed.");
      }
      setJupiterReceipt(payload);
      setMessage(payload.narrative);
      void refreshCredentialAndCanaryState({ announce: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Jupiter rehearsal failed.");
    } finally {
      setBusy(null);
    }
  }

  async function testDexDiscovery() {
    setBusy("dex");
    setMessage("Testing read-only DEX Screener scanner evidence without wallet authority...");
    try {
      const params = new URLSearchParams({
        scenario,
        source: "live-dex",
        account,
        cycles: String(cycles),
      });
      const response = await fetch(`/api/web3-dex-discovery?${params.toString()}`);
      const payload = (await response.json().catch(() => null)) as Web3DexDiscoveryReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "DEX scanner test failed.");
      }
      setDexReceipt(payload);
      setMessage(payload.summary);
      void refreshCredentialAndCanaryState({ announce: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "DEX scanner test failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runLivePreflight() {
    setBusy("preflight");
    setMessage("Building live-capital preflight receipt from wallet, provider, DEX, Jupiter, risk, signer, settlement, and profit gates...");
    try {
      const params = new URLSearchParams({
        scenario,
        source: "live-dex",
        account,
        cycles: String(cycles),
      });
      const response = await fetch(`/api/web3-live-capital-preflight?${params.toString()}`);
      const payload = (await response.json().catch(() => null)) as Web3LiveCapitalPreflightReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Live-capital preflight failed.");
      }
      setPreflightReceipt(payload);
      setMessage(payload.summary);
      void refreshCredentialAndCanaryState({ announce: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Live-capital preflight failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runUnsignedCanaryPreflight() {
    setBusy("canary-preflight");
    setMessage("Checking the saved tiny canary wallet, caps, Jupiter env, and live flags before any wallet or transaction prompt...");
    try {
      const publicKey = draft.wallet_public_key.trim();
      const params = new URLSearchParams({
        scenario,
        source: "live-dex",
        account: "persistent",
        cycles: String(cycles),
        operator_ack: "true",
        canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
        amount_lamports: "100000",
        max_slippage_bps: String(Math.max(1, Math.min(100, Math.trunc(Number(draft.max_slippage_bps) || 50)))),
      });
      if (publicKey && isLikelySolanaPublicKey(publicKey)) {
        params.set("wallet_public_key", publicKey);
      }
      const response = await fetch(`/api/web3-live-unsigned-order-handoff?${params.toString()}`);
      const payload = (await response.json().catch(() => null)) as Web3LiveUnsignedOrderPreflightReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Canary preflight failed.");
      }
      setUnsignedCanaryPreflightReceipt(payload);
      setMessage(payload.next_action);
      void refreshCredentialAndCanaryState({ announce: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Canary preflight failed.");
    } finally {
      setBusy(null);
    }
  }

  async function signAndRelayLiveCanary() {
    if (!liveCanaryConsentArmed) {
      setMessage("Arm the final tiny-canary acknowledgement before opening a transaction signing prompt.");
      return;
    }
    setBusy("live-canary");
    setMessage("Building a tiny gated canary order for browser-wallet transaction signing...");
    try {
      const provider = getBrowserSolanaProvider();
      if (!provider || typeof provider.signTransaction !== "function") {
        throw new Error("No browser wallet with transaction signing is available.");
      }
      let publicKey = provider.publicKey?.toString() ?? null;
      if ((!publicKey || !isLikelySolanaPublicKey(publicKey)) && typeof provider.connect === "function") {
        const result = await provider.connect();
        publicKey = result?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;
      }
      if (!publicKey || !isLikelySolanaPublicKey(publicKey)) {
        throw new Error("Connect a valid public Solana wallet before requesting the live canary signature.");
      }
      setDraft((current) => ({
        ...current,
        wallet_public_key: publicKey,
        signer_mode: "external-wallet",
      }));
      const params = new URLSearchParams({
        scenario,
        source: "live-dex",
        account: "persistent",
        cycles: String(cycles),
      });
      const unsignedResponse = await fetch(`/api/web3-live-unsigned-order-handoff?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operator_ack: true,
          canary_ack: "I_UNDERSTAND_THIS_UNSIGNED_ORDER_CAN_MOVE_REAL_FUNDS_IF_SIGNED",
          return_unsigned_transaction_ack: true,
          wallet_public_key: publicKey,
          amount_lamports: 100_000,
          max_slippage_bps: Math.max(1, Math.min(100, Math.trunc(Number(draft.max_slippage_bps) || 50))),
        }),
      });
      const unsignedPayload = (await unsignedResponse.json().catch(() => null)) as Web3LiveUnsignedOrderHandoffReceipt | { error: string } | null;
      if (!unsignedResponse.ok || !unsignedPayload || "error" in unsignedPayload) {
        throw new Error(unsignedPayload && "error" in unsignedPayload ? unsignedPayload.error : "Live unsigned order handoff failed.");
      }
      setUnsignedCanaryReceipt(unsignedPayload);
      if (unsignedPayload.status !== "order-ready" || !unsignedPayload.unsigned_transaction || !unsignedPayload.request_id) {
        throw new Error(unsignedPayload.next_action);
      }

      setMessage("Wallet prompt opening for the tiny canary transaction. Review it carefully before signing.");
      const { VersionedTransaction } = await import("@solana/web3.js");
      const transaction = VersionedTransaction.deserialize(base64ToBytes(unsignedPayload.unsigned_transaction));
      const signedTransaction = await provider.signTransaction(transaction);
      const serialized = serializeSignedWalletTransaction(signedTransaction);
      if (!serialized) {
        throw new Error("Wallet did not return a serializable signed transaction.");
      }
      const signedBase64 = bytesToBase64(serialized);
      const relayResponse = await fetch(`/api/web3-live-trade-canary?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operator_ack: true,
          canary_ack: "I_UNDERSTAND_THIS_CAN_MOVE_REAL_FUNDS",
          signed_transaction: signedBase64,
          request_id: unsignedPayload.request_id,
          route: "jupiter-swap-v2",
        }),
      });
      const relayPayload = (await relayResponse.json().catch(() => null)) as Web3LiveTradeCanaryActionReceipt | { error: string } | null;
      if (!relayResponse.ok || !relayPayload || "error" in relayPayload) {
        throw new Error(relayPayload && "error" in relayPayload ? relayPayload.error : "Live canary relay failed.");
      }
      setLiveCanaryActionReceipt(relayPayload);
      setMessage(relayPayload.next_action);
      setLiveCanaryConsentArmed(false);
      void refreshCredentialAndCanaryState({ announce: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Live canary signing flow failed.");
    } finally {
      setBusy(null);
    }
  }

  async function detectBrowserWallet({ requestConnect = false }: { requestConnect?: boolean } = {}) {
    setBusy("wallet");
    setMessage(requestConnect ? "Opening the external wallet public-key prompt..." : "Checking for a browser Solana wallet without prompting...");
    try {
      const provider = getBrowserSolanaProvider();
      if (!provider) {
        const receipt = buildBrowserWalletReceipt({
          status: "missing",
          provider: "none",
          publicKey: null,
          nextAction: "Install or unlock Phantom, Solflare, or Backpack, then connect only the public wallet address.",
        });
        setBrowserWallet(receipt);
        setMessage(receipt.next_action);
        return;
      }

      let publicKey = provider.publicKey?.toString() ?? null;
      if (requestConnect && typeof provider.connect === "function") {
        const result = await provider.connect();
        publicKey = result?.publicKey?.toString() ?? provider.publicKey?.toString() ?? publicKey;
      } else if (!requestConnect && !publicKey && provider.isConnected && typeof provider.connect === "function") {
        const result = await provider.connect({ onlyIfTrusted: true }).catch(() => null);
        publicKey = result?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;
      }

      const validPublicKey = publicKey && isLikelySolanaPublicKey(publicKey) ? publicKey : null;
      if (validPublicKey) {
        setDraft((current) => ({
          ...current,
          wallet_public_key: validPublicKey,
          signer_mode: "external-wallet",
        }));
      }
      const receipt = buildBrowserWalletReceipt({
        status: validPublicKey ? "connected" : "detected",
        provider: browserWalletProviderName(provider),
        publicKey: validPublicKey,
        nextAction: validPublicKey
          ? "Public wallet detected. Save public scope to use it in dry-run and preflight gates; no signing was requested."
          : "Wallet provider detected. Press Connect wallet when you are ready to share only the public address.",
      });
      setBrowserWallet(receipt);
      setMessage(receipt.next_action);
    } catch (error) {
      const receipt = buildBrowserWalletReceipt({
        status: "rejected",
        provider: browserWalletProviderName(getBrowserSolanaProvider()),
        publicKey: null,
        nextAction: error instanceof Error && error.message ? error.message : "Wallet connection was rejected or unavailable.",
      });
      setBrowserWallet(receipt);
      setMessage(receipt.next_action);
    } finally {
      setBusy(null);
    }
  }

  async function proveWalletOwnership() {
    setBusy("ownership");
    setMessage("Requesting a text-only wallet ownership signature. This is not a transaction and cannot move funds...");
    try {
      const provider = getBrowserSolanaProvider();
      if (!provider || typeof provider.signMessage !== "function") {
        throw new Error("No browser wallet with message signing is available.");
      }
      let publicKey = provider.publicKey?.toString() ?? null;
      if ((!publicKey || !isLikelySolanaPublicKey(publicKey)) && typeof provider.connect === "function") {
        const result = await provider.connect();
        publicKey = result?.publicKey?.toString() ?? provider.publicKey?.toString() ?? null;
      }
      if (!publicKey || !isLikelySolanaPublicKey(publicKey)) {
        throw new Error("Connect a valid public Solana wallet before proving ownership.");
      }
      const challenge = await requestWalletOwnershipChallenge(publicKey);
      const signed = await provider.signMessage(new TextEncoder().encode(challenge), "utf8");
      const signatureBytes = signed instanceof Uint8Array ? signed : signed.signature;
      if (!(signatureBytes instanceof Uint8Array)) {
        throw new Error("Wallet did not return a valid message signature.");
      }
      const response = await fetch("/api/web3-wallet-ownership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet_public_key: publicKey,
          message: challenge,
          signature_base64: bytesToBase64(signatureBytes),
          provider: browserWalletProviderName(provider),
        }),
      });
      const payload = (await response.json().catch(() => null)) as Web3WalletOwnershipReceipt | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Wallet ownership proof failed.");
      }
      setDraft((current) => ({
        ...current,
        wallet_public_key: publicKey,
        signer_mode: "external-wallet",
      }));
      setOwnershipReceipt(payload);
      setMessage(payload.summary);
      void refreshCredentialAndCanaryState({ announce: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet ownership proof failed.");
    } finally {
      setBusy(null);
    }
  }

  async function savePublicScope() {
    const wallet = draft.wallet_public_key.trim();
    if (!wallet || !isLikelySolanaPublicKey(wallet)) {
      setMessage("Enter a valid public Solana wallet address before saving public scope.");
      return;
    }
    const maxTrade = Math.max(1, Number(draft.max_trade_usd) || maxTradeUsd);
    const dailyCap = Math.max(maxTrade, Number(draft.daily_spend_cap_usd) || dailySpendCapUsd);
    const slippage = Math.max(1, Math.min(2_000, Math.trunc(Number(draft.max_slippage_bps) || maxSlippageBps)));
    setBusy("scope");
    setMessage("Saving public wallet scope and dry-run risk caps. API keys are not sent in this action...");
    try {
      const response = await fetch("/api/web3-trading", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenario,
          source,
          account,
          cycles,
          advance: false,
          execution: {
            mode: "dry-run",
            kill_switch: false,
            wallet_public_key: wallet,
            signer_simulation_enabled: true,
            signer_session_label: `settings-${draft.signer_mode}`,
            signer_network: "devnet",
            max_trade_usd: maxTrade,
            daily_spend_cap_usd: dailyCap,
            max_slippage_bps: slippage,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as Web3TradingState | { error: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Public scope could not be saved.");
      }
      setSavedScope({
        walletPreview: previewValue(payload.execution_readiness.config.wallet_public_key),
        updatedAt: payload.execution_readiness.config.updated_at,
      });
      try {
        const { liveUsability: updatedBlockers, firstCanaryDrill } = await refreshCredentialAndCanaryState({ announce: false });
        setLiveUsabilityReceipt(updatedBlockers);
        setFirstCanaryDrillReceipt(firstCanaryDrill);
        setMessage(`Public wallet scope and dry-run caps are saved. First canary next step: ${firstCanaryDrill.next_unblock_step?.label ?? updatedBlockers.next_unlock_step?.label ?? updatedBlockers.summary}.`);
      } catch (refreshError) {
        setMessage(refreshError instanceof Error
          ? `Public wallet scope and dry-run caps are saved, but the live-canary refresh failed: ${refreshError.message}`
          : "Public wallet scope and dry-run caps are saved, but the live-canary refresh failed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Public scope could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function fetchLiveUsabilityBlockers() {
    const params = new URLSearchParams({
      scenario,
      source: "live-dex",
      account,
      cycles: String(cycles),
      rows: "all",
    });
    const response = await fetch(`/api/web3-live-usability-blockers?${params.toString()}`);
    const payload = (await response.json().catch(() => null)) as Web3LiveUsabilityBlockersReceipt | { error: string } | null;
    if (!response.ok || !payload || "error" in payload) {
      throw new Error(payload && "error" in payload ? payload.error : "What-is-left refresh failed.");
    }
    return payload;
  }

  async function fetchFirstCanaryDrill() {
    const params = new URLSearchParams({
      scenario,
      source: "live-dex",
      account: "persistent",
      cycles: String(cycles),
    });
    const response = await fetch(`/api/web3-first-canary-drill?${params.toString()}`);
    const payload = (await response.json().catch(() => null)) as Web3FirstCanaryDrillReceipt | { error: string } | null;
    if (!response.ok || !payload || "error" in payload) {
      throw new Error(payload && "error" in payload ? payload.error : "First-canary drill refresh failed.");
    }
    return payload;
  }

  async function refreshCredentialAndCanaryState({ announce = true }: { announce?: boolean } = {}) {
    const [liveUsability, firstCanaryDrill] = await Promise.all([
      fetchLiveUsabilityBlockers(),
      fetchFirstCanaryDrill(),
    ]);
    setLiveUsabilityReceipt(liveUsability);
    setFirstCanaryDrillReceipt(firstCanaryDrill);
    if (announce) {
      setMessage(`First canary refreshed: ${firstCanaryDrill.next_unblock_step?.label ?? firstCanaryDrill.status.replaceAll("-", " ")}.`);
    }
    return { liveUsability, firstCanaryDrill };
  }

  async function refreshLiveUsabilityBlockers({ announce = true }: { announce?: boolean } = {}) {
    const previousBusy = busy;
    if (announce) {
      setBusy("canary-drill");
      setMessage("Refreshing the first-canary drill and consolidated Web3 what-is-left receipts...");
    }
    try {
      const { liveUsability, firstCanaryDrill } = await refreshCredentialAndCanaryState({ announce: false });
      if (announce) {
        setMessage(`First canary refreshed: ${firstCanaryDrill.next_unblock_step?.label ?? firstCanaryDrill.status.replaceAll("-", " ")}. What is left: ${liveUsability.summary}`);
      }
    } catch (error) {
      if (announce) {
        setMessage(error instanceof Error ? error.message : "First-canary refresh failed.");
      }
    } finally {
      if (announce && previousBusy === null) {
        setBusy(null);
      }
    }
  }

  async function refreshCredentialDoctor() {
    setBusy("doctor");
    setMessage("Refreshing the local sanitized Web3 credential doctor receipt...");
    try {
      const response = await fetch("/api/web3-credential-doctor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operator_ack: true,
          scenario,
          source: "live-dex",
          account,
          refresh_supervisor: false,
        }),
      });
      const payload = (await response.json().catch(() => null)) as Web3CredentialDoctorRefreshReceipt | { error: string; detail?: string } | null;
      if (!response.ok || !payload || "error" in payload) {
        throw new Error(payload && "error" in payload ? payload.error : "Credential doctor refresh failed.");
      }
      setDoctorRefreshReceipt(payload);
      const { liveUsability: updatedBlockers, firstCanaryDrill } = await refreshCredentialAndCanaryState({ announce: false });
      setMessage(`Credential doctor refreshed: ${payload.doctor.status.replaceAll("-", " ")}. First canary next step: ${firstCanaryDrill.next_unblock_step?.label ?? updatedBlockers.next_unlock_step?.label ?? updatedBlockers.summary}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Credential doctor refresh failed.");
    } finally {
      setBusy(null);
    }
  }

  const credentialChecks = credentialResult?.checks ?? [];
  const disabled = busy !== null;
  const trimmedWallet = draft.wallet_public_key.trim();
  const operatorWalletReady = isLikelySolanaPublicKey(trimmedWallet) && trimmedWallet !== SAMPLE_SYSTEM_WALLET;
  const walletGateStatus = !trimmedWallet
    ? "missing"
    : trimmedWallet === SAMPLE_SYSTEM_WALLET
      ? "sample-only"
      : operatorWalletReady
        ? "public-ready"
        : "invalid";
  const walletGateSummary = walletGateStatus === "public-ready"
    ? "Dedicated public wallet address is ready for scope save and strict operator-wallet verification."
    : walletGateStatus === "sample-only"
      ? "The sample all-ones wallet is demo-only and cannot satisfy real-money readiness."
      : walletGateStatus === "invalid"
        ? "This does not look like a valid public Solana address."
        : "Paste or detect a dedicated public Solana wallet address to clear the current operator gate.";
  const walletGateNextAction = walletGateStatus === "public-ready"
    ? "Press Save public scope, then run the strict wallet verifier and prove wallet ownership with a text-only browser-wallet signature."
    : walletGateStatus === "sample-only"
      ? "Replace the sample all-ones wallet with a dedicated public Solana address before continuing."
      : walletGateStatus === "invalid"
        ? "Use a public Solana address only. Do not paste private keys, seed phrases, keypair JSON, or signed payloads."
        : "Use Detect wallet, Connect wallet, or paste a public address into Wallet public address.";
  const localJupiterConfigured = localInstallReceipt?.configured_keys.includes("JUPITER_API_KEY") === true;
  const jupiterKeyReady = jupiterConfigured || localJupiterConfigured || draft.jupiter_api_key.trim().length > 0;
  const liveCanaryFlagCount = [
    "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
    "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
    "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
  ].filter((key) => localInstallReceipt?.configured_keys.includes(key) === true).length;
  const signerTargetCount = [
    "MASTERMOLD_AUTONOMOUS_SIGNER_PROVIDER",
    "PRIVY_APP_ID",
    "PRIVY_APP_SECRET",
    "PRIVY_SOLANA_WALLET_ID",
    "TURNKEY_ORGANIZATION_ID",
    "TURNKEY_API_PUBLIC_KEY",
    "TURNKEY_API_PRIVATE_KEY",
    "TURNKEY_SOLANA_WALLET_ACCOUNT",
    "MASTERMOLD_SESSION_KEY_PUBLIC_KEY",
    "MASTERMOLD_SESSION_POLICY_HASH",
  ].filter((key) => localInstallReceipt?.configured_keys.includes(key) === true).length;
  const productionOpsTargetCount = [
    "MASTERMOLD_WEB3_PROCESS_MANAGER",
    "MASTERMOLD_WEB3_WORKER_OWNER",
    "MASTERMOLD_WEB3_ALERT_WEBHOOK_URL",
    "MASTERMOLD_WEB3_RESTART_POLICY_URL",
  ].filter((key) => localInstallReceipt?.configured_keys.includes(key) === true).length;
  const dexLiveReady = dexReceipt?.status === "live-ready" || dexReceipt?.status === "live-watch";
  const commandWallet = operatorWalletReady ? trimmedWallet : "<public-solana-address>";
  const operatorWalletCommand = `npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${commandWallet} --require-operator-wallet`;
  const dexLiveCommand = "npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live";
  const combinedStrictCommand = `${operatorWalletCommand} --require-jupiter-order --require-dex-live`;
  const liveUsabilityParams = new URLSearchParams({
    scenario,
    source: "live-dex",
    account,
    cycles: String(cycles),
    rows: "all",
  });
  const liveUsabilityHref = `/api/web3-live-usability-blockers?${liveUsabilityParams.toString()}`;
  const visibleLiveUsabilityBlockers = liveUsabilityReceipt.missing_for_live_usability.slice(0, 4);
  const nextLiveUsabilityBlocker = liveUsabilityReceipt.next_blocker;
  const nextCredentialRequest = liveUsabilityReceipt.next_credential_request;
  const firstCanaryParams = new URLSearchParams({
    scenario,
    source: "live-dex",
    account: "persistent",
    cycles: String(cycles),
  });
  const firstCanaryHref = `/api/web3-first-canary-drill?${firstCanaryParams.toString()}`;
  const firstCanaryNextStep = firstCanaryDrillReceipt.next_unblock_step;
  const firstCanaryCurrentIndex = firstCanaryNextStep
    ? firstCanaryDrillReceipt.operator_unblock_plan.findIndex((step) => step.id === firstCanaryNextStep.id)
    : firstCanaryDrillReceipt.operator_unblock_plan.findIndex((step) => step.status === "next" || step.status === "watch");
  const firstCanaryVisibleStart = Math.max(0, firstCanaryCurrentIndex);
  const visibleFirstCanarySteps = [
    ...firstCanaryDrillReceipt.operator_unblock_plan.filter((step) => step.status === "next" || step.status === "watch"),
    ...firstCanaryDrillReceipt.operator_unblock_plan.filter((step) => step.status === "blocked"),
    ...firstCanaryDrillReceipt.operator_unblock_plan.filter((step) => step.status === "done"),
  ].slice(0, 3);
  const firstCanaryForecastSteps = firstCanaryDrillReceipt.operator_unblock_plan
    .slice(firstCanaryVisibleStart + 1)
    .filter((step) => step.status === "blocked")
    .slice(0, 4);
  const liveUsabilitySetupHref = nextLiveUsabilityBlocker?.href ?? (liveUsabilityReceipt.next_unlock_step?.id === "scope-wallet"
    ? "#settings-web3-wallet-public-key"
    : "#settings-web3-credentials-runway");
  const actionChecklist = buildConsoleActionChecklist({
    hasProviderInput: [
      draft.helius_api_key,
      draft.rpc_url,
      draft.ws_url,
      draft.jupiter_api_key,
      draft.enable_live_web3_execution,
      draft.live_operator_approval,
      draft.allow_live_unsigned_canary_handoff,
    ].some((value) => value.trim().length > 0),
    providerTested: Boolean(credentialResult),
    localInstallReceipt,
    walletReady: operatorWalletReady,
    browserWalletConnected: browserWallet?.status === "connected",
    ownershipProved: ownershipReceipt?.signature_verified === true,
    dexLiveReady,
    jupiterKeyReady,
    jupiterOrderReady: jupiterReceipt?.summary.jupiter_order_ready === true,
    preflightReady: Boolean(preflightReceipt),
  });
  const nextConsoleAction = actionChecklist.find((item) => item.status !== "ready") ?? actionChecklist[actionChecklist.length - 1];
  const safeCredentialProfile = buildSafeCredentialProfile({
    operatorWalletReady,
    ownershipProved: ownershipReceipt?.signature_verified === true,
    browserWalletConnected: browserWallet?.status === "connected",
    providerTested: Boolean(credentialResult),
    rpcHealthy: credentialResult?.rpc_healthy === true,
    hasReadProviderInput: [
      draft.helius_api_key,
      draft.rpc_url,
      draft.ws_url,
    ].some((value) => value.trim().length > 0),
    localInstallReceipt,
    jupiterConfigured: jupiterKeyReady,
    jupiterOrderReady: jupiterReceipt?.summary.jupiter_order_ready === true,
    signerTargetCount,
    signerMode: draft.signer_mode,
    productionOpsTargetCount,
    hasEmergencyTarget: draft.emergency_stop_webhook_url.trim().length > 0 || draft.emergency_stop_contact.trim().length > 0,
    hasAccountingTarget: draft.tax_ledger_export_path.trim().length > 0 || localInstallReceipt?.configured_keys.includes("MASTERMOLD_TAX_LEDGER_EXPORT_PATH") === true,
    maxTradeUsd: Number(draft.max_trade_usd) || maxTradeUsd,
    dailySpendCapUsd: Number(draft.daily_spend_cap_usd) || dailySpendCapUsd,
    maxSlippageBps: Number(draft.max_slippage_bps) || maxSlippageBps,
  });
  const safeCredentialProfileReadyCount = safeCredentialProfile.filter((item) => item.status === "ready").length;
  const firstCanaryFlagItems = buildFirstCanaryFlagItems({ draft, localInstallReceipt });
  const firstCanaryFlagReadyCount = firstCanaryFlagItems.filter((item) => item.status === "ready").length;
  const firstCanaryFlagSelectedCount = firstCanaryFlagItems.filter((item) => item.status === "ready" || item.status === "selected").length;

  return (
    <section className="rounded-md border border-violet/25 bg-violet/[0.035] p-3" aria-label="Settings Web3 credential action console">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Credential action console</p>
          <h3 className="mt-1 text-base font-semibold text-on-surface">Session-only provider tests</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            Test Helius/Solana, DEX scanner evidence, wallet scope, and Jupiter order readiness from Settings. API keys are never saved to browser storage; private keys and seed phrases are not accepted.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <BoundaryBadge label="session only" />
          <BoundaryBadge label="local env optional" />
          <BoundaryBadge label="secret echo blocked" />
          <BoundaryBadge label="live blocked" />
        </div>
      </div>

      <div className="mt-3 rounded-md border border-engine/25 bg-surface-dim/30 p-2" aria-label="Settings Web3 credential action checklist">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Action checklist</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              Next safe control: {nextConsoleAction.label}
            </p>
            <p className="mt-1 text-xs leading-5 text-outline">{nextConsoleAction.next_action}</p>
          </div>
          <Badge variant="outline" className="border-outline-variant/35 bg-void/25 text-outline">
            {actionChecklist.filter((item) => item.status === "ready").length}/{actionChecklist.length} ready
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {actionChecklist.map((item) => (
            <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{item.control}</p>
                </div>
                <ConsoleActionBadge status={item.status} />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.next_action}</p>
              <p className="mt-1 text-[10px] leading-4 text-outline">{item.boundary}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-outline">
          Checklist actions use the controls below. They can save public scope, install allowed local env targets, or build redacted receipts; they cannot sign, submit, mutate wallets, store seed phrases, or unlock live trading.
        </p>
      </div>

      <div className="mt-3 rounded-md border border-engine/25 bg-surface-dim/25 p-3" aria-label="Settings safe Web3 credential profile">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Safe credential profile</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {safeCredentialProfileReadyCount}/{safeCredentialProfile.length} non-secret lanes ready
            </p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              Operator-facing setup map for wallet scope, read rail, Jupiter rehearsal, signer policy, ops, accounting, and risk caps. It never displays raw keys, wallet secrets, transaction bytes, or signed payloads.
            </p>
          </div>
          <Badge variant="outline" className="border-engine/35 bg-engine/10 text-engine">
            profile only
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {safeCredentialProfile.map((item) => (
            <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{item.source}</p>
                </div>
                <ConsoleActionBadge status={item.status === "ready" ? "ready" : item.status === "active" ? "active" : "gated"} />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.detail}</p>
              <p className="mt-1 text-[10px] leading-4 text-outline">{item.boundary}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs leading-5 text-outline">
          The profile is status-only. It can guide the next credential action, but live execution, signing, submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.
        </p>
      </div>

      <div className="mt-3 rounded-md border border-caution/30 bg-caution/[0.035] p-3" aria-label="Settings first canary live flag arming">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">First canary live flags</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {firstCanaryFlagReadyCount === firstCanaryFlagItems.length
                ? "Exact canary flags are installed locally"
                : firstCanaryFlagSelectedCount === firstCanaryFlagItems.length
                  ? "Exact canary flags are selected"
                  : "Exact canary flags still need review"}
            </p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              These are the only live-env values accepted for the tiny unsigned canary handoff. Installing them prepares the review path, but it still cannot sign, submit, custody funds, or mutate wallets.
            </p>
          </div>
          <Badge variant="outline" className={firstCanaryFlagReadyCount === firstCanaryFlagItems.length ? "border-engine/35 bg-engine/10 text-engine" : "border-caution/35 bg-caution/10 text-caution"}>
            {firstCanaryFlagReadyCount}/{firstCanaryFlagItems.length} installed
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-3" aria-label="Settings first canary live flag checklist">
          {firstCanaryFlagItems.map((item) => (
            <div key={item.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{item.envKey}</p>
                </div>
                <ConsoleActionBadge status={item.status === "ready" ? "ready" : item.status === "selected" ? "active" : "gated"} />
              </div>
              <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[10px] leading-4 text-on-surface-variant">
                {item.requiredValue}
              </code>
              <p className="mt-2 text-[11px] leading-4 text-outline">{item.detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href="#settings-web3-live-flag-fields"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-xs font-semibold text-caution transition hover:bg-caution/15"
          >
            Review flag fields
          </a>
          <button
            type="button"
            onClick={installLocalCredentials}
            disabled={disabled || firstCanaryFlagSelectedCount < firstCanaryFlagItems.length}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-violet/45 bg-violet/10 px-3 py-2 text-xs font-semibold text-violet transition hover:bg-violet/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Terminal className={cn("size-3.5 shrink-0", busy === "install" && "animate-pulse")} aria-hidden="true" />
            Install selected flags
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-outline">
          The installer writes only allowlisted env target names to the receipt and clears sensitive page fields after success; wallet keys, seed phrases, transaction bytes, signed payloads, and unrestricted signer policy are rejected.
        </p>
      </div>

      {nextLiveUsabilityBlocker ? (
        <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.025] p-2" aria-label="Settings Web3 console next dependency blocker">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Next dependency blocker</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{nextLiveUsabilityBlocker.label}</p>
            </div>
            <Badge variant="outline" className="border-critical/35 bg-critical/10 text-critical">
              {nextLiveUsabilityBlocker.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{nextLiveUsabilityBlocker.next_action}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={liveUsabilitySetupHref}
              className="inline-flex min-h-9 items-center rounded-md border border-critical/30 bg-critical/10 px-2 text-xs font-semibold text-critical transition hover:bg-critical/15"
            >
              Open blocker control
            </a>
            <span className="min-w-0 truncate text-[11px] leading-4 text-outline">
              {nextLiveUsabilityBlocker.owner.replaceAll("-", " ")} · {nextLiveUsabilityBlocker.source.replaceAll("-", " ")} · {nextLiveUsabilityBlocker.blocks_live_capital ? "blocks live capital" : "review item"}
            </span>
          </div>
          {nextLiveUsabilityBlocker.safe_command ? (
            <code className="mt-2 block break-all rounded-md border border-outline-variant/20 bg-black/20 px-2 py-1 text-[11px] leading-5 text-on-surface-variant">
              {nextLiveUsabilityBlocker.safe_command}
            </code>
          ) : null}
        </div>
      ) : null}

      {nextCredentialRequest ? (
        <div className="mt-3 rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings Web3 console next credential request">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-engine">Next credential request</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{nextCredentialRequest.label}</p>
            </div>
            <Badge variant="outline" className={nextCredentialRequest.can_enter_in_app ? "border-engine/35 bg-engine/10 text-engine" : "border-caution/35 bg-caution/10 text-caution"}>
              {nextCredentialRequest.can_enter_in_app ? "safe in app" : "external"}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">{nextCredentialRequest.safe_value_description}</p>
          <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
            <div className="rounded-md border border-outline-variant/20 bg-void/25 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Storage rule</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">{nextCredentialRequest.storage.replaceAll("-", " ")}</p>
            </div>
            <div className="rounded-md border border-outline-variant/20 bg-void/25 p-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Verifier after value</p>
              <code className="mt-1 block break-all text-[11px] leading-5 text-on-surface-variant">
                {nextCredentialRequest.verifier_command ?? operatorWalletCommand}
              </code>
            </div>
          </div>
          <a
            href={nextCredentialRequest.fix_href}
            className="mt-2 inline-flex min-h-9 items-center rounded-md border border-engine/30 bg-engine/10 px-2 text-xs font-semibold text-engine transition hover:bg-engine/15"
          >
            Open request surface
          </a>
          <div className="mt-2 rounded-md border border-outline-variant/20 bg-void/20 p-2" aria-label="Settings Web3 console credential completion criteria">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Done when</p>
            <ul className="mt-1 grid gap-1 text-[10px] leading-4 text-outline">
              {nextCredentialRequest.completion_criteria.slice(0, 4).map((criterion) => (
                <li key={criterion}>{criterion}</li>
              ))}
            </ul>
          </div>
          <div className="mt-2 grid gap-1.5" aria-label="Settings Web3 console credential verification runway">
            {nextCredentialRequest.verification_runway.slice(0, 4).map((step, index) => (
              <div key={step.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border border-outline-variant/20 bg-void/20 p-2">
                <span className="flex size-5 items-center justify-center rounded-md border border-outline-variant/25 bg-black/20 text-[10px] font-semibold text-outline">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-on-surface">{step.label}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-outline">{step.next_action}</p>
                  {step.href ? (
                    <a href={step.href} className="mt-1 inline-flex min-h-8 items-center rounded-md px-1 text-[10px] font-semibold text-engine">
                      Open step
                    </a>
                  ) : null}
                  {step.command ? (
                    <code className="mt-1 block break-all text-[10px] leading-4 text-outline">{step.command}</code>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.04] p-2" aria-label="Settings Web3 next operator unlock">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Next operator unlock</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {nextOperatorInputLabel ?? nextConsoleAction.label}
            </p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              {nextOperatorInputAction ?? nextConsoleAction.next_action}
            </p>
          </div>
          <a
            href="#settings-web3-wallet-public-key"
            className="inline-flex min-h-9 items-center rounded-md border border-caution/35 bg-caution/10 px-2 text-xs font-semibold text-caution transition hover:bg-caution/15"
          >
            Go to wallet field
          </a>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
          <div className="rounded-md border border-outline-variant/20 bg-void/25 p-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Storage rule</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              {(nextOperatorInputStorage ?? "browser-public-scope").replaceAll("-", " ")}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-outline">Public wallet scope only; private keys and seed phrases stay blocked.</p>
          </div>
          <div className="rounded-md border border-outline-variant/20 bg-void/25 p-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Verifier after save</p>
            <code className="mt-1 block break-all text-[11px] leading-5 text-on-surface-variant">
              {nextOperatorInputVerifier ?? operatorWalletCommand}
            </code>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.035] p-3" aria-label="Settings dedicated Web3 wallet gate">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Dedicated wallet gate</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">{walletGateSummary}</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{walletGateNextAction}</p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "border-outline-variant/35 bg-void/25 text-outline",
              walletGateStatus === "public-ready" && "border-engine/35 bg-engine/10 text-engine",
              walletGateStatus === "sample-only" || walletGateStatus === "invalid"
                ? "border-critical/35 bg-critical/10 text-critical"
                : "",
              walletGateStatus === "missing" && "border-caution/35 bg-caution/10 text-caution",
            )}
          >
            {walletGateStatus.replace("-", " ")}
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.72fr)]">
          <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Public address</p>
            <p className="mt-1 break-all text-xs font-semibold text-on-surface">
              {trimmedWallet ? previewValue(trimmedWallet) ?? "entered" : "missing"}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-outline">Browser-public scope only.</p>
          </div>
          <div className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Strict wallet verifier</p>
            <code className="mt-1 block break-all text-[11px] leading-5 text-on-surface-variant">{operatorWalletCommand}</code>
          </div>
          <div className="rounded-md border border-critical/25 bg-critical/[0.025] p-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">Never paste</p>
            <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">Private keys, seed phrases, keypair JSON, transaction bytes, or signed payloads.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="#settings-web3-wallet-public-key"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-xs font-semibold text-caution transition hover:bg-caution/15"
          >
            Edit wallet field
          </a>
          <a
            href="/api/web3-dedicated-wallet-packet?source=live-dex&account=persistent"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline-variant/35 bg-void/20 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
          >
            Open wallet packet
          </a>
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <ConsoleInput
          label="Helius API key"
          type="password"
          value={draft.helius_api_key}
          placeholder="Leave blank to use server env"
          onChange={(value) => updateDraft("helius_api_key", value)}
        />
        <ConsoleInput
          label="Custom Solana RPC URL"
          value={draft.rpc_url}
          placeholder="Optional RPC override"
          onChange={(value) => updateDraft("rpc_url", value)}
        />
        <ConsoleInput
          label="Solana WebSocket URL"
          value={draft.ws_url}
          placeholder="Optional WebSocket override"
          onChange={(value) => updateDraft("ws_url", value)}
        />
        <ConsoleInput
          label="Jupiter API key"
          type="password"
          value={draft.jupiter_api_key}
          placeholder="Leave blank to use server env"
          onChange={(value) => updateDraft("jupiter_api_key", value)}
        />
        <label id="settings-web3-live-flag-fields" className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-outline">
          Enable live Web3 flag
          <select
            value={draft.enable_live_web3_execution}
            onChange={(event) => updateDraft("enable_live_web3_execution", event.target.value)}
            className="h-10 w-full rounded-md border border-outline-variant/45 bg-void/40 px-3 text-sm normal-case tracking-normal text-on-surface outline-none transition focus:border-engine/60"
          >
            <option value="">Not armed</option>
            <option value="true">true</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-outline">
          Live operator approval
          <select
            value={draft.live_operator_approval}
            onChange={(event) => updateDraft("live_operator_approval", event.target.value)}
            className="h-10 w-full rounded-md border border-outline-variant/45 bg-void/40 px-3 text-sm normal-case tracking-normal text-on-surface outline-none transition focus:border-engine/60"
          >
            <option value="">Not acknowledged</option>
            <option value="I_UNDERSTAND_REAL_FUNDS">I_UNDERSTAND_REAL_FUNDS</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-outline">
          Unsigned canary handoff
          <select
            value={draft.allow_live_unsigned_canary_handoff}
            onChange={(event) => updateDraft("allow_live_unsigned_canary_handoff", event.target.value)}
            className="h-10 w-full rounded-md border border-outline-variant/45 bg-void/40 px-3 text-sm normal-case tracking-normal text-on-surface outline-none transition focus:border-engine/60"
          >
            <option value="">Not allowed</option>
            <option value="true">true</option>
          </select>
        </label>
        <ConsoleInput
          label="Emergency stop webhook"
          type="password"
          value={draft.emergency_stop_webhook_url}
          placeholder="Optional HTTPS stop target"
          onChange={(value) => updateDraft("emergency_stop_webhook_url", value)}
        />
        <ConsoleInput
          label="Emergency stop contact"
          value={draft.emergency_stop_contact}
          placeholder="Ops email, phone, or channel"
          onChange={(value) => updateDraft("emergency_stop_contact", value)}
        />
        <ConsoleInput
          label="Accounting export path"
          value={draft.tax_ledger_export_path}
          placeholder="Local CSV/export path"
          onChange={(value) => updateDraft("tax_ledger_export_path", value)}
        />
        <ConsoleInput
          id="settings-web3-wallet-public-key"
          label="Wallet public address"
          value={draft.wallet_public_key}
          placeholder="Public Solana address only"
          onChange={(value) => updateDraft("wallet_public_key", value)}
        />
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-outline">
            Signer mode
            <select
              value={draft.signer_mode}
              onChange={(event) => updateDraft("signer_mode", event.target.value)}
              className="h-10 w-full rounded-md border border-outline-variant/45 bg-void/40 px-3 text-sm normal-case tracking-normal text-on-surface outline-none transition focus:border-engine/60"
            >
            <option value="external-wallet">Manual external wallet</option>
            <option value="privy-server-wallet">Privy policy wallet</option>
            <option value="turnkey-policy-wallet">Turnkey policy wallet</option>
            <option value="session-key-vault">Session-key vault</option>
          </select>
        </label>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <ConsoleInput label="Max trade USD" type="number" value={draft.max_trade_usd} placeholder="250" onChange={(value) => updateDraft("max_trade_usd", value)} />
        <ConsoleInput label="Daily spend cap" type="number" value={draft.daily_spend_cap_usd} placeholder="1000" onChange={(value) => updateDraft("daily_spend_cap_usd", value)} />
        <ConsoleInput label="Max slippage bps" type="number" value={draft.max_slippage_bps} placeholder="150" onChange={(value) => updateDraft("max_slippage_bps", value)} />
      </div>

      <div className="mt-3 rounded-md border border-violet/25 bg-void/20 p-2" aria-label="Signer provider local credential targets">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Signer provider targets</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              Optional local env targets for Privy, Turnkey, or session-key review
            </p>
          </div>
          <BoundaryBadge label="wallet keys rejected" />
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-outline">
            Autonomous signer provider
            <select
              value={draft.autonomous_signer_provider}
              onChange={(event) => updateDraft("autonomous_signer_provider", event.target.value)}
              className="h-10 w-full rounded-md border border-outline-variant/45 bg-void/40 px-3 text-sm normal-case tracking-normal text-on-surface outline-none transition focus:border-engine/60"
            >
              <option value="external-wallet">External wallet first</option>
              <option value="privy">Privy server wallet</option>
              <option value="turnkey">Turnkey policy wallet</option>
              <option value="session-key">Session-key vault</option>
            </select>
          </label>
          <ConsoleInput label="Privy app id" value={draft.privy_app_id} placeholder="Optional Privy target" onChange={(value) => updateDraft("privy_app_id", value)} />
          <ConsoleInput label="Privy app secret" type="password" value={draft.privy_app_secret} placeholder="Stored only in ignored local env" onChange={(value) => updateDraft("privy_app_secret", value)} />
          <ConsoleInput label="Privy Solana wallet id" value={draft.privy_solana_wallet_id} placeholder="Provider wallet id, not a key" onChange={(value) => updateDraft("privy_solana_wallet_id", value)} />
          <ConsoleInput label="Turnkey organization id" value={draft.turnkey_organization_id} placeholder="Optional Turnkey target" onChange={(value) => updateDraft("turnkey_organization_id", value)} />
          <ConsoleInput label="Turnkey API public key" value={draft.turnkey_api_public_key} placeholder="Provider API public key" onChange={(value) => updateDraft("turnkey_api_public_key", value)} />
          <ConsoleInput label="Turnkey API private key" type="password" value={draft.turnkey_api_private_key} placeholder="Provider API credential, never wallet key" onChange={(value) => updateDraft("turnkey_api_private_key", value)} />
          <ConsoleInput label="Turnkey Solana wallet account" value={draft.turnkey_solana_wallet_account} placeholder="Provider wallet account id" onChange={(value) => updateDraft("turnkey_solana_wallet_account", value)} />
          <ConsoleInput label="Session-key public key" value={draft.session_key_public_key} placeholder="Public session key only" onChange={(value) => updateDraft("session_key_public_key", value)} />
          <ConsoleInput label="Session policy hash" value={draft.session_policy_hash} placeholder="Reviewed policy hash only" onChange={(value) => updateDraft("session_policy_hash", value)} />
        </div>
        <p className="mt-2 text-[11px] leading-4 text-outline">
          This installer accepts signer-provider API credentials only for ignored localhost env. It still rejects wallet private keys, seed phrases, session private keys, raw transactions, and signed payloads.
        </p>
      </div>

      <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.035] p-2" aria-label="Production worker local ops targets">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Production worker targets</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              Redacted live-ops evidence for worker owner, alerts, and restart review
            </p>
          </div>
          <BoundaryBadge label="review only" />
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <ConsoleInput
            label="Process manager"
            value={draft.production_process_manager}
            placeholder="pm2, systemd, docker, hosted worker"
            onChange={(value) => updateDraft("production_process_manager", value)}
          />
          <ConsoleInput
            label="Worker owner"
            value={draft.production_worker_owner}
            placeholder="Ops owner, email, or escalation channel"
            onChange={(value) => updateDraft("production_worker_owner", value)}
          />
          <ConsoleInput
            label="Alert webhook"
            type="password"
            value={draft.production_alert_webhook_url}
            placeholder="HTTPS alert target"
            onChange={(value) => updateDraft("production_alert_webhook_url", value)}
          />
          <ConsoleInput
            label="Restart policy URL"
            value={draft.production_restart_policy_url}
            placeholder="HTTPS runbook or deployment policy"
            onChange={(value) => updateDraft("production_restart_policy_url", value)}
          />
        </div>
        <p className="mt-2 text-[11px] leading-4 text-outline">
          These targets are local review inputs only. Mastermind does not start workers, dispatch alert webhooks, approve live execution, sign, submit, or mutate wallets.
        </p>
      </div>

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-void/20 p-2" aria-label="Local Web3 credential installer">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Local credential installer</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              Install known provider, ops, and accounting values into ignored local env
            </p>
          </div>
          <button
            type="button"
            onClick={installLocalCredentials}
            disabled={disabled}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-violet/45 bg-violet/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-violet transition hover:bg-violet/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Terminal className={cn("size-3.5 shrink-0", busy === "install" && "animate-pulse")} aria-hidden="true" />
            {busy === "install" ? "Installing" : "Install local env"}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-outline">
          Local install accepts only Helius, Solana RPC/WebSocket, Jupiter, exact first-canary flags, signer-provider, emergency-stop, production-worker, and accounting fields, writes to ignored local env on trusted localhost, clears page-sensitive fields after success, and keeps wallet mutation blocked.
        </p>
        {localInstallReceipt ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-6" aria-label="Local Web3 credential install receipt">
            <ConsoleMetric label="Install" value={localInstallReceipt.status} tone={localInstallReceipt.status === "installed" ? "engine" : localInstallReceipt.status === "invalid" || localInstallReceipt.status === "blocked" ? "critical" : "neutral"} />
            <ConsoleMetric label="Configured" value={String(localInstallReceipt.configured_keys.length)} tone={localInstallReceipt.configured_keys.length >= 4 ? "engine" : "caution"} />
            <ConsoleMetric label="Canary flags" value={`${liveCanaryFlagCount}/3`} tone={liveCanaryFlagCount === 3 ? "engine" : liveCanaryFlagCount > 0 ? "caution" : "neutral"} />
            <ConsoleMetric label="Signer targets" value={`${signerTargetCount}/10`} tone={signerTargetCount > 0 ? "engine" : "neutral"} />
            <ConsoleMetric label="Worker targets" value={`${productionOpsTargetCount}/4`} tone={productionOpsTargetCount === 4 ? "engine" : productionOpsTargetCount > 0 ? "caution" : "neutral"} />
            <ConsoleMetric label="Missing" value={formatMissingTargets(localInstallReceipt.missing_keys)} tone={localInstallReceipt.missing_keys.length === 0 ? "engine" : "caution"} />
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-outline">
          Scoped wallet: {walletPublicKeyPreview ?? "missing"} · keys are request-only
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={savePublicScope}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-caution/45 bg-caution/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-caution transition hover:bg-caution/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Save className={cn("size-3.5 shrink-0", busy === "scope" && "animate-pulse")} aria-hidden="true" />
            {busy === "scope" ? "Saving" : "Save public scope"}
          </button>
          <button
            type="button"
            onClick={() => void detectBrowserWallet()}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-engine/45 bg-engine/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-engine transition hover:bg-engine/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Wallet className={cn("size-3.5 shrink-0", busy === "wallet" && "animate-pulse")} aria-hidden="true" />
            {busy === "wallet" ? "Checking" : "Detect wallet"}
          </button>
          <button
            type="button"
            onClick={() => void detectBrowserWallet({ requestConnect: true })}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-caution/45 bg-caution/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-caution transition hover:bg-caution/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Wallet className={cn("size-3.5 shrink-0", busy === "wallet" && "animate-pulse")} aria-hidden="true" />
            Connect wallet
          </button>
          <button
            type="button"
            onClick={() => void proveWalletOwnership()}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-violet/45 bg-violet/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-violet transition hover:bg-violet/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <ShieldCheck className={cn("size-3.5 shrink-0", busy === "ownership" && "animate-pulse")} aria-hidden="true" />
            {busy === "ownership" ? "Proving" : "Prove ownership"}
          </button>
          <button
            type="button"
            onClick={testCredentials}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-engine/45 bg-engine/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-engine transition hover:bg-engine/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Activity className={cn("size-3.5 shrink-0", busy === "credentials" && "animate-pulse")} aria-hidden="true" />
            {busy === "credentials" ? "Testing" : "Test credentials"}
          </button>
          <button
            type="button"
            onClick={testDexDiscovery}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-engine/45 bg-engine/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-engine transition hover:bg-engine/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Activity className={cn("size-3.5 shrink-0", busy === "dex" && "animate-pulse")} aria-hidden="true" />
            {busy === "dex" ? "Scanning" : "Test DEX scanner"}
          </button>
          <button
            type="button"
            onClick={rehearseJupiter}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-violet/45 bg-violet/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-violet transition hover:bg-violet/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Zap className={cn("size-3.5 shrink-0", busy === "jupiter" && "animate-pulse")} aria-hidden="true" />
            {busy === "jupiter" ? "Rehearsing" : "Rehearse Jupiter"}
          </button>
          <button
            type="button"
            onClick={runLivePreflight}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-critical/45 bg-critical/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-critical transition hover:bg-critical/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <ShieldCheck className={cn("size-3.5 shrink-0", busy === "preflight" && "animate-pulse")} aria-hidden="true" />
            {busy === "preflight" ? "Checking" : "Run live preflight"}
          </button>
          <button
            type="button"
            onClick={() => void runUnsignedCanaryPreflight()}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-caution/45 bg-caution/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-caution transition hover:bg-caution/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <ShieldCheck className={cn("size-3.5 shrink-0", busy === "canary-preflight" && "animate-pulse")} aria-hidden="true" />
            {busy === "canary-preflight" ? "Checking canary" : "Canary preflight"}
          </button>
          <label
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-critical/30 bg-critical/[0.035] px-3 py-2 text-xs font-semibold text-critical"
            aria-label="Settings final live canary acknowledgement"
          >
            <input
              type="checkbox"
              checked={liveCanaryConsentArmed}
              onChange={(event) => setLiveCanaryConsentArmed(event.currentTarget.checked)}
              disabled={disabled}
              className="size-4 shrink-0 accent-red-500"
            />
            <span className="leading-4">I understand this can move real funds</span>
          </label>
          <button
            type="button"
            onClick={() => void signAndRelayLiveCanary()}
            disabled={disabled || !liveCanaryConsentArmed}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-critical/45 bg-critical/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-critical transition hover:bg-critical/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Zap className={cn("size-3.5 shrink-0", busy === "live-canary" && "animate-pulse")} aria-hidden="true" />
            {busy === "live-canary" ? "Signing canary" : "Sign tiny canary"}
          </button>
        </div>
      </div>

      <p className="mt-2 rounded-md border border-outline-variant/30 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant" aria-live="polite">
        {message}
      </p>

      <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.035] p-3" aria-label="Settings Web3 what is left after latest action">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">What is left after latest action</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {liveUsabilityReceipt.next_unlock_step?.label ?? liveUsabilityReceipt.status.replaceAll("-", " ")}
            </p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              {liveUsabilityReceipt.next_unlock_step?.next_action ?? liveUsabilityReceipt.next_action}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={liveUsabilitySetupHref}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-caution/35 bg-caution/10 px-3 py-2 text-xs font-semibold text-caution transition hover:bg-caution/15"
            >
              Open current gate
            </a>
            <a
              href={liveUsabilityHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline-variant/35 bg-void/20 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
            >
              Open all blockers JSON
            </a>
            <button
              type="button"
              onClick={() => void refreshLiveUsabilityBlockers()}
              disabled={disabled}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-caution/40 bg-caution/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-caution transition hover:bg-caution/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
            >
              <RefreshCw className={cn("size-3.5 shrink-0", busy === "canary-drill" && "animate-spin")} aria-hidden="true" />
              {busy === "canary-drill" ? "Refreshing" : "Refresh blockers"}
            </button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <ConsoleMetric label="Inputs open" value={`${liveUsabilityReceipt.open_operator_input_count}`} tone={liveUsabilityReceipt.open_operator_input_count > 0 ? "caution" : "engine"} />
          <ConsoleMetric label="Real blockers" value={`${liveUsabilityReceipt.real_capital_blocker_count}`} tone={liveUsabilityReceipt.real_capital_blocker_count > 0 ? "critical" : "engine"} />
          <ConsoleMetric label="Rows listed" value={`${liveUsabilityReceipt.listed_live_usability_row_count}/${liveUsabilityReceipt.total_live_usability_row_count}`} tone={liveUsabilityReceipt.listed_live_usability_row_count < liveUsabilityReceipt.total_live_usability_row_count ? "caution" : "engine"} />
          <ConsoleMetric label="Live lanes" value={`${liveUsabilityReceipt.ready_live_lane_count}/${liveUsabilityReceipt.total_live_lane_count}`} tone={liveUsabilityReceipt.ready_live_lane_count === liveUsabilityReceipt.total_live_lane_count ? "engine" : "caution"} />
          <ConsoleMetric label="Safe actions" value={`${liveUsabilityReceipt.safe_action_count}`} tone={liveUsabilityReceipt.safe_action_count > 0 ? "engine" : "neutral"} />
          <ConsoleMetric label="Doctor" value={liveUsabilityReceipt.credential_doctor.receipt_fresh ? "fresh" : "stale"} tone={liveUsabilityReceipt.credential_doctor.blocked_count > 0 ? "critical" : liveUsabilityReceipt.credential_doctor.receipt_fresh ? "engine" : "caution"} />
        </div>
        <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.025] p-2" aria-label="Settings refreshed first canary drill status">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-critical">First canary drill refresh</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">
                {firstCanaryNextStep?.label ?? firstCanaryDrillReceipt.status.replaceAll("-", " ")}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
                {firstCanaryNextStep?.action ?? firstCanaryDrillReceipt.next_action}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={firstCanaryNextStep?.safe_surface ?? firstCanaryHref}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-critical/35 bg-critical/10 px-3 py-2 text-xs font-semibold text-critical transition hover:bg-critical/15"
              >
                Open canary gate
              </a>
              <a
                href={firstCanaryHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-outline-variant/35 bg-void/20 px-3 py-2 text-xs font-semibold text-on-surface-variant transition hover:border-engine/35 hover:text-engine"
              >
                Open drill JSON
              </a>
              <button
                type="button"
                onClick={() => void refreshLiveUsabilityBlockers()}
                disabled={disabled}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-critical/40 bg-critical/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-critical transition hover:bg-critical/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
              >
                <RefreshCw className={cn("size-3.5 shrink-0", busy === "canary-drill" && "animate-spin")} aria-hidden="true" />
                {busy === "canary-drill" ? "Refreshing" : "Refresh canary"}
              </button>
            </div>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-5">
            <ConsoleMetric label="Actual trade" value={firstCanaryDrillReceipt.actual_live_trade_tested ? "yes" : "no"} tone={firstCanaryDrillReceipt.actual_live_trade_tested ? "engine" : "critical"} />
            <ConsoleMetric label="Funds moved" value={firstCanaryDrillReceipt.real_funds_moved_by_this_app ? "yes" : "no"} tone={firstCanaryDrillReceipt.real_funds_moved_by_this_app ? "engine" : "critical"} />
            <ConsoleMetric label="Relay" value={firstCanaryDrillReceipt.signed_relay_status.replaceAll("-", " ")} tone={firstCanaryDrillReceipt.signed_relay_status === "confirmed" || firstCanaryDrillReceipt.signed_relay_status === "relayed" ? "engine" : "critical"} />
            <ConsoleMetric label="Proof" value={`${firstCanaryDrillReceipt.proof_pass_count}/${firstCanaryDrillReceipt.proof_required_count}`} tone={firstCanaryDrillReceipt.proof_pass_count === firstCanaryDrillReceipt.proof_required_count ? "engine" : "caution"} />
            <ConsoleMetric label="Hard fails" value={`${firstCanaryDrillReceipt.hard_fail_count}`} tone={firstCanaryDrillReceipt.hard_fail_count > 0 ? "critical" : "engine"} />
          </div>
          <div className="mt-2 grid gap-1.5" aria-label="Settings refreshed first canary ordered gates">
            {visibleFirstCanarySteps.map((step) => (
              <div key={step.id} className="grid gap-2 rounded-md border border-outline-variant/25 bg-void/20 p-2 sm:grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-on-surface">{step.label}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                    {step.status} · {step.phase.replaceAll("-", " ")}
                  </p>
                </div>
                <p className="min-w-0 text-[11px] leading-4 text-on-surface-variant">{step.completion_signal}</p>
              </div>
            ))}
          </div>
          {firstCanaryForecastSteps.length > 0 ? (
            <div className="mt-2 rounded-md border border-caution/25 bg-caution/[0.035] p-2" aria-label="Settings first canary after current gate forecast">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">After current gate</p>
                <span className="rounded-md border border-caution/30 bg-caution/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-caution">
                  forecast only
                </span>
              </div>
              <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                {firstCanaryForecastSteps.map((step) => (
                  <a
                    key={step.id}
                    href={step.safe_surface}
                    className="grid min-h-[4.25rem] gap-1 rounded-md border border-outline-variant/25 bg-void/20 p-2 transition hover:border-caution/35"
                  >
                    <span className="truncate text-[11px] font-semibold text-on-surface">{step.label}</span>
                    <span className="line-clamp-2 text-[11px] leading-4 text-on-surface-variant">{step.action}</span>
                  </a>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-outline">
                These forecast steps stay blocked until the active proof is recorded; Settings cannot turn this into live-trade permission.
              </p>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] leading-4 text-outline">
            This refresh is still read-only. Paper trades, DEX reads, and Jupiter rehearsals do not count as a live canary until the signed relay, confirmation, settlement, and portfolio mirror proof pass.
          </p>
        </div>
        <div className="mt-3 rounded-md border border-outline-variant/25 bg-void/20 p-2" aria-label="Settings in-app credential doctor refresh">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Credential doctor refresh</p>
              <p className="mt-1 text-xs font-semibold text-on-surface">
                {liveUsabilityReceipt.credential_doctor.status.replaceAll("-", " ")} · {liveUsabilityReceipt.credential_doctor.ready_count} ready · {liveUsabilityReceipt.credential_doctor.blocked_count} blocked
              </p>
              <p className="mt-1 text-[11px] leading-4 text-outline">
                {doctorRefreshReceipt?.summary ?? liveUsabilityReceipt.credential_doctor.next_action}
              </p>
            </div>
            <button
              type="button"
              onClick={refreshCredentialDoctor}
              disabled={disabled}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-engine/40 bg-engine/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-engine transition hover:bg-engine/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
            >
              <RefreshCw className={cn("size-3.5 shrink-0", busy === "doctor" && "animate-spin")} aria-hidden="true" />
              {busy === "doctor" ? "Refreshing" : "Refresh doctor"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-outline">
            This calls a localhost-only status refresh and rewrites the sanitized doctor receipt. It does not send API keys, run live trades, sign, submit, or mutate wallets.
          </p>
        </div>
        <div className="mt-3 grid gap-2" aria-label="Settings top refreshed Web3 blockers">
          {visibleLiveUsabilityBlockers.length > 0 ? visibleLiveUsabilityBlockers.map((item) => (
            <div key={item.id} className="rounded-md border border-outline-variant/25 bg-void/20 p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-on-surface">{item.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
                    {item.owner.replace("-", " ")} · {item.source.replace("-", " ")}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-outline-variant/35 bg-surface-dim/35 text-outline",
                    (item.status === "needed" || item.status === "watch") && "border-caution/35 bg-caution/10 text-caution",
                    (item.status === "blocked" || item.status === "fail") && "border-critical/35 bg-critical/10 text-critical",
                    item.status === "review" && "border-violet/35 bg-violet/10 text-violet",
                  )}
                >
                  {item.status}
                </Badge>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-on-surface-variant">{item.next_action}</p>
            </div>
          )) : (
            <p className="rounded-md border border-engine/25 bg-engine/[0.04] p-2 text-xs leading-5 text-on-surface-variant">
              No missing live-usability rows are listed in this receipt; external live review and in-app live authority locks still apply.
            </p>
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-outline">
          This receipt refreshes after wallet scope, provider checks, DEX tests, Jupiter rehearsal, wallet proof, and preflight. It names the next safe operator step only; live execution, signing, submission, wallet mutation, private-key storage, seed-phrase storage, and secret echo remain blocked.
        </p>
      </div>

      <div className="mt-3 rounded-md border border-engine/25 bg-surface-dim/25 p-3" aria-label="Strict Web3 verifier runway">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Strict verifier runway</p>
            <p className="mt-1 text-sm font-semibold text-on-surface">Operator wallet, Jupiter order, and live DEX gates</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <GateBadge label="operator wallet" ready={operatorWalletReady} />
            <GateBadge label="Jupiter order" ready={jupiterKeyReady} />
            <GateBadge label="live DEX" ready={dexLiveReady} />
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <VerifierCommand
            label="Wallet gate"
            command={operatorWalletCommand}
            ready={operatorWalletReady}
          />
          <VerifierCommand
            label="Live DEX gate"
            command={dexLiveCommand}
            ready={dexLiveReady}
          />
          <VerifierCommand
            label="Wallet + order + DEX gate"
            command={combinedStrictCommand}
            ready={operatorWalletReady && jupiterKeyReady && dexLiveReady}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-outline">
          These commands use only a public wallet, local environment keys, and read-only DEX discovery. They fail closed before live review if the sample wallet, live scanner evidence, Jupiter order proof, secret redaction, or live-boundary locks are not clean.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ConsoleMetric
          label="Credential score"
          value={credentialResult ? `${credentialResult.readiness_score}/100` : "untested"}
          tone={credentialResult?.status === "configured" ? "engine" : credentialResult ? "caution" : "neutral"}
        />
        <ConsoleMetric
          label="Local env"
          value={localInstallReceipt ? localInstallReceipt.status : "not installed"}
          tone={localInstallReceipt?.status === "installed" ? "engine" : localInstallReceipt?.status === "invalid" || localInstallReceipt?.status === "blocked" ? "critical" : "neutral"}
        />
        <ConsoleMetric
          label="Wallet sync"
          value={ownershipReceipt?.signature_verified ? "ownership proved" : browserWallet?.status === "connected" ? "browser connected" : credentialResult?.can_support_readonly_wallet_sync ? "ready" : "gated"}
          tone={ownershipReceipt?.signature_verified || browserWallet?.status === "connected" || credentialResult?.can_support_readonly_wallet_sync ? "engine" : "caution"}
        />
        <ConsoleMetric
          label="Jupiter order"
          value={jupiterReceipt?.summary.jupiter_order_ready ? "ready" : "gated"}
          tone={jupiterReceipt?.summary.jupiter_order_ready ? "engine" : "caution"}
        />
        <ConsoleMetric
          label="DEX scanner"
          value={dexReceipt ? dexReceipt.status.replace("-", " ") : "untested"}
          tone={dexReceipt?.status === "live-ready" || dexReceipt?.status === "live-watch" ? "engine" : dexReceipt ? "caution" : "neutral"}
        />
        <ConsoleMetric
          label="Execution"
          value={savedScope ? "dry-run saved" : "blocked"}
          tone={savedScope ? "engine" : "neutral"}
        />
        <ConsoleMetric
          label="Live preflight"
          value={preflightReceipt ? `${preflightReceipt.failed_gate_count} fail / ${preflightReceipt.watch_gate_count} watch` : "blocked"}
          tone={preflightReceipt?.status === "manual-live-review" ? "engine" : preflightReceipt ? "caution" : "neutral"}
        />
        <ConsoleMetric
          label="Live canary"
          value={liveCanaryActionReceipt ? liveCanaryActionReceipt.status.replaceAll("-", " ") : unsignedCanaryReceipt ? unsignedCanaryReceipt.status.replaceAll("-", " ") : unsignedCanaryPreflightReceipt ? unsignedCanaryPreflightReceipt.status : "not signed"}
          tone={liveCanaryActionReceipt?.actual_live_trade_tested ? "engine" : liveCanaryActionReceipt || unsignedCanaryReceipt || unsignedCanaryPreflightReceipt ? "caution" : "neutral"}
        />
      </div>

      {savedScope ? (
        <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.045] p-2" aria-label="Saved Web3 public scope receipt">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Saved public scope</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            Wallet {savedScope.walletPreview ?? "scoped"} is saved for dry-run rehearsal.
          </p>
          <p className="mt-1 text-xs leading-5 text-outline">
            Updated {formatConsoleTime(savedScope.updatedAt)}. Helius and Jupiter keys were not sent or saved by this action.
          </p>
        </div>
      ) : null}

      {browserWallet ? (
        <div className="mt-3 rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings browser wallet readiness receipt">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Browser wallet receipt</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{browserWallet.status.replace("-", " ")}</p>
            </div>
            <Badge variant="outline" className={cn(
              "border-outline-variant/35 bg-void/25 text-outline",
              browserWallet.status === "connected" && "border-engine/35 bg-engine/10 text-engine",
              browserWallet.status === "rejected" || browserWallet.status === "missing" ? "border-caution/35 bg-caution/10 text-caution" : "",
            )}>
              {browserWallet.provider}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ConsoleMetric label="Public key" value={browserWallet.wallet_public_key_preview ?? "not shared"} tone={browserWallet.wallet_public_key_preview ? "engine" : "caution"} />
            <ConsoleMetric label="Connect" value={browserWallet.connect_permission.replaceAll("-", " ")} tone={browserWallet.connect_permission === "operator-prompt-only" ? "caution" : "neutral"} />
            <ConsoleMetric label="Signing" value={browserWallet.signing_permission} tone="neutral" />
            <ConsoleMetric label="Wallet mutation" value={browserWallet.wallet_mutation_permission} tone="neutral" />
          </div>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">{browserWallet.next_action}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
            checked {formatConsoleTime(browserWallet.checked_at)} · private key storage {browserWallet.private_key_storage}
          </p>
        </div>
      ) : null}

      {ownershipReceipt ? (
        <div className="mt-3 rounded-md border border-violet/25 bg-violet/[0.04] p-2" aria-label="Settings wallet ownership receipt">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Wallet ownership receipt</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{ownershipReceipt.status}</p>
            </div>
            <Badge variant="outline" className={cn(
              "border-outline-variant/35 bg-void/25 text-outline",
              ownershipReceipt.signature_verified && "border-engine/35 bg-engine/10 text-engine",
            )}>
              {ownershipReceipt.signature_verified ? "verified" : "not verified"}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ConsoleMetric label="Wallet" value={ownershipReceipt.wallet_public_key_preview} tone={ownershipReceipt.signature_verified ? "engine" : "caution"} />
            <ConsoleMetric label="Message" value={ownershipReceipt.message_storage} tone="neutral" />
            <ConsoleMetric label="Tx signing" value={ownershipReceipt.transaction_signing_permission} tone="neutral" />
            <ConsoleMetric label="Submit" value={ownershipReceipt.transaction_submission_permission} tone="neutral" />
          </div>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">{ownershipReceipt.next_action}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
            receipt {ownershipReceipt.receipt_hash.slice(0, 10)} · challenge {ownershipReceipt.challenge_hash.slice(0, 10)} · signature {ownershipReceipt.signature_hash.slice(0, 10)}
          </p>
        </div>
      ) : null}

      {jupiterReceipt ? (
        <div className="mt-3 rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2" aria-label="Settings Jupiter rehearsal receipt">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Jupiter rehearsal receipt</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{jupiterReceipt.status.replaceAll("-", " ")}</p>
            </div>
            <Badge variant="outline" className="border-outline-variant/40 bg-void/25 text-outline">
              {jupiterReceipt.key_source.replace("-", " ")}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">{jupiterReceipt.next_action}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
            receipt {jupiterReceipt.receipt_hash.slice(0, 10)} · tx bytes {jupiterReceipt.unsigned_transaction_return}
          </p>
        </div>
      ) : null}

      {unsignedCanaryPreflightReceipt ? (
        <div className="mt-3 rounded-md border border-caution/25 bg-caution/[0.035] p-2" aria-label="Settings live unsigned canary preflight receipt">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-caution">Canary preflight receipt</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{unsignedCanaryPreflightReceipt.status.replaceAll("-", " ")}</p>
            </div>
            <Badge variant="outline" className={cn(
              "border-outline-variant/35 bg-void/25 text-outline",
              unsignedCanaryPreflightReceipt.can_request_one_shot_unsigned_order && "border-engine/35 bg-engine/10 text-engine",
              unsignedCanaryPreflightReceipt.status === "blocked" && "border-caution/35 bg-caution/10 text-caution",
              unsignedCanaryPreflightReceipt.status === "unsafe-rejected" && "border-critical/35 bg-critical/10 text-critical",
            )}>
              {unsignedCanaryPreflightReceipt.can_request_one_shot_unsigned_order ? "ready to request" : "no transaction"}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ConsoleMetric label="Wallet" value={unsignedCanaryPreflightReceipt.wallet_public_key_preview ?? "missing"} tone={unsignedCanaryPreflightReceipt.wallet_ready ? "engine" : "critical"} />
            <ConsoleMetric label="Jupiter" value={unsignedCanaryPreflightReceipt.jupiter_key_configured ? "ready" : "missing"} tone={unsignedCanaryPreflightReceipt.jupiter_key_configured ? "engine" : "caution"} />
            <ConsoleMetric label="Live flags" value={unsignedCanaryPreflightReceipt.live_flags_ready ? "ready" : "missing"} tone={unsignedCanaryPreflightReceipt.live_flags_ready ? "engine" : "critical"} />
            <ConsoleMetric label="Tx return" value={unsignedCanaryPreflightReceipt.unsigned_transaction_return.replaceAll("-", " ")} tone="neutral" />
          </div>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">{unsignedCanaryPreflightReceipt.next_action}</p>
          {unsignedCanaryPreflightReceipt.blockers.length > 0 ? (
            <p className="mt-1 rounded-md border border-caution/20 bg-caution/[0.035] p-2 text-xs leading-5 text-caution">
              Blocker: {unsignedCanaryPreflightReceipt.blockers[0]}
            </p>
          ) : null}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
            receipt {unsignedCanaryPreflightReceipt.receipt_hash.slice(0, 10)} · pair {unsignedCanaryPreflightReceipt.canary_pair} · amount {unsignedCanaryPreflightReceipt.amount_lamports} lamports · transaction bytes not returned
          </p>
        </div>
      ) : null}

      {unsignedCanaryReceipt ? (
        <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.035] p-2" aria-label="Settings live unsigned canary handoff receipt">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Tiny canary handoff</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{unsignedCanaryReceipt.status.replaceAll("-", " ")}</p>
            </div>
            <Badge variant="outline" className={cn(
              "border-outline-variant/35 bg-void/25 text-outline",
              unsignedCanaryReceipt.status === "order-ready" && "border-caution/35 bg-caution/10 text-caution",
              unsignedCanaryReceipt.status === "unsafe-rejected" && "border-critical/35 bg-critical/10 text-critical",
            )}>
              {unsignedCanaryReceipt.unsigned_transaction_return.replaceAll("-", " ")}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ConsoleMetric label="Wallet" value={unsignedCanaryReceipt.wallet_public_key_preview ?? "missing"} tone={unsignedCanaryReceipt.wallet_public_key_preview ? "caution" : "critical"} />
            <ConsoleMetric label="Request" value={unsignedCanaryReceipt.request_id ?? "none"} tone={unsignedCanaryReceipt.request_id ? "caution" : "neutral"} />
            <ConsoleMetric label="Bytes" value={String(unsignedCanaryReceipt.unsigned_payload_byte_count)} tone={unsignedCanaryReceipt.unsigned_payload_byte_count > 0 ? "caution" : "neutral"} />
            <ConsoleMetric label="Store body" value={unsignedCanaryReceipt.transaction_body_storage} tone="neutral" />
          </div>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">{unsignedCanaryReceipt.next_action}</p>
          {unsignedCanaryReceipt.blockers.length > 0 ? (
            <p className="mt-1 text-[11px] leading-4 text-outline">
              Blocker: {unsignedCanaryReceipt.blockers[0]}
            </p>
          ) : null}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
            receipt {unsignedCanaryReceipt.receipt_hash.slice(0, 10)} · pair {unsignedCanaryReceipt.canary_pair} · amount {unsignedCanaryReceipt.amount_lamports} lamports
          </p>
        </div>
      ) : null}

      {liveCanaryActionReceipt ? (
        <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.035] p-2" aria-label="Settings live canary signed relay receipt">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Signed canary relay</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{liveCanaryActionReceipt.status.replaceAll("-", " ")}</p>
            </div>
            <Badge variant="outline" className={cn(
              "border-outline-variant/35 bg-void/25 text-outline",
              liveCanaryActionReceipt.actual_live_trade_tested && "border-engine/35 bg-engine/10 text-engine",
              liveCanaryActionReceipt.status === "unsafe-rejected" && "border-critical/35 bg-critical/10 text-critical",
            )}>
              {liveCanaryActionReceipt.actual_live_trade_tested ? "live evidence" : "not confirmed"}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ConsoleMetric label="Request" value={liveCanaryActionReceipt.request_id ?? "none"} tone={liveCanaryActionReceipt.request_id ? "caution" : "neutral"} />
            <ConsoleMetric label="Route" value={liveCanaryActionReceipt.route ?? "none"} tone={liveCanaryActionReceipt.route ? "caution" : "neutral"} />
            <ConsoleMetric label="Signed bytes" value={String(liveCanaryActionReceipt.signed_payload_byte_count)} tone={liveCanaryActionReceipt.signed_payload_byte_count > 0 ? "caution" : "neutral"} />
            <ConsoleMetric label="Echoed" value={String(liveCanaryActionReceipt.signed_payload_echoed)} tone="neutral" />
          </div>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">{liveCanaryActionReceipt.next_action}</p>
          {liveCanaryActionReceipt.blockers.length > 0 ? (
            <p className="mt-1 text-[11px] leading-4 text-outline">
              Blocker: {liveCanaryActionReceipt.blockers[0]}
            </p>
          ) : null}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
            receipt {liveCanaryActionReceipt.receipt_hash.slice(0, 10)} · funds moved {String(liveCanaryActionReceipt.real_funds_moved_by_this_app)}
          </p>
        </div>
      ) : null}

      {dexReceipt ? (
        <div className="mt-3 rounded-md border border-engine/25 bg-engine/[0.035] p-2" aria-label="Settings DEX discovery receipt">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">DEX discovery receipt</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{dexReceipt.status.replace("-", " ")}</p>
            </div>
            <Badge variant="outline" className="border-engine/35 bg-engine/10 text-engine">
              {dexReceipt.provider}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ConsoleMetric label="Pairs mapped" value={String(dexReceipt.source_summary.pairs_mapped)} tone="engine" />
            <ConsoleMetric label="Candidates" value={String(dexReceipt.source_summary.tokens_considered)} tone="engine" />
            <ConsoleMetric label="Paid hype" value={String(dexReceipt.source_summary.paid_hype_count)} tone={dexReceipt.source_summary.paid_hype_count > 0 ? "caution" : "engine"} />
            <ConsoleMetric label="Failed sources" value={String(dexReceipt.source_summary.failed_source_count)} tone={dexReceipt.source_summary.failed_source_count > 0 ? "caution" : "engine"} />
          </div>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">{dexReceipt.next_action}</p>
          <p className="mt-1 text-xs leading-5 text-outline">
            Top symbols: {dexReceipt.source_summary.top_symbols.slice(0, 5).join(", ") || "none"} · live execution {dexReceipt.live_execution_permission} · wallet mutation {dexReceipt.wallet_mutation_permission}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
            receipt {dexReceipt.receipt_hash.slice(0, 10)} · scanner evidence only
          </p>
        </div>
      ) : null}

      {preflightReceipt ? (
        <div className="mt-3 rounded-md border border-critical/25 bg-critical/[0.035] p-2" aria-label="Settings live capital preflight receipt">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Live-capital preflight receipt</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{preflightReceipt.status.replaceAll("-", " ")}</p>
            </div>
            <Badge variant="outline" className="border-critical/35 bg-critical/10 text-critical">
              real capital {preflightReceipt.real_capital_blocked ? "blocked" : "review only"}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ConsoleMetric label="Launch score" value={`${preflightReceipt.launch_readiness_score}/100`} tone={preflightReceipt.live_review_permitted ? "engine" : "caution"} />
            <ConsoleMetric label="Passed gates" value={String(preflightReceipt.passed_gate_count)} tone="engine" />
            <ConsoleMetric label="Watch gates" value={String(preflightReceipt.watch_gate_count)} tone={preflightReceipt.watch_gate_count > 0 ? "caution" : "engine"} />
            <ConsoleMetric label="Failed gates" value={String(preflightReceipt.failed_gate_count)} tone={preflightReceipt.failed_gate_count > 0 ? "caution" : "engine"} />
          </div>
          <p className="mt-2 text-xs leading-5 text-on-surface-variant">{preflightReceipt.next_action}</p>
          <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-5">
            {preflightReceipt.gates.slice(0, 10).map((gate) => (
              <div key={gate.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{gate.label}</p>
                  <span className={cn("size-2 shrink-0 rounded-full", gate.status === "pass" ? "bg-engine" : gate.status === "watch" ? "bg-caution" : "bg-critical")} />
                </div>
                <p className={cn("mt-1 text-xs font-semibold", gate.status === "pass" ? "text-engine" : gate.status === "watch" ? "text-caution" : "text-critical")}>{gate.status}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-outline">{gate.next_action}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-outline">
            receipt {preflightReceipt.receipt_hash.slice(0, 10)} · live execution {preflightReceipt.live_execution_permission} · wallet mutation {preflightReceipt.wallet_mutation_permission}
          </p>
        </div>
      ) : null}

      {credentialChecks.length > 0 ? (
        <div className="mt-3 grid gap-1 sm:grid-cols-2 xl:grid-cols-4" aria-label="Settings Web3 credential readiness checks">
          {credentialChecks.map((check) => (
            <div key={check.id} className="min-w-0 rounded-md border border-outline-variant/20 bg-void/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{check.label}</p>
                <span className={cn("size-2 shrink-0 rounded-full", check.status === "pass" ? "bg-engine" : check.status === "watch" ? "bg-caution" : "bg-critical")} />
              </div>
              <p className={cn("mt-1 text-xs font-semibold", check.status === "pass" ? "text-engine" : check.status === "watch" ? "text-caution" : "text-critical")}>{check.status}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-outline">{check.detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="sr-only" aria-label="Settings Web3 credential console security boundary">
        Settings Web3 credential console keeps API keys session only; no browser storage for Helius, Jupiter, Privy, Turnkey, signer-provider, or production alert keys; browser wallet detection requests public address only; wallet ownership proof signs text only; private key storage blocked; seed phrase storage blocked; Jupiter rehearsal withholds unsigned transaction bodies; tiny live canary signing uses a gated one-shot unsigned handoff and browser wallet prompt only after live flags; DEX scanner receipt is read-only paper evidence; live-capital preflight receipt is review evidence only; wallet mutation blocked.
        Local credential installer can write known provider, signer-provider, emergency-stop, production-worker, and accounting values to ignored local env on trusted localhost only; install receipt configured keys {localInstallReceipt?.configured_keys.join(", ") ?? "none"}; installed keys {localInstallReceipt?.installed_keys.join(", ") ?? "none"}; missing keys {localInstallReceipt?.missing_keys.join(", ") ?? "unknown"}; secret echo permission {localInstallReceipt?.secret_echo_permission ?? "blocked"}.
      </p>
    </section>
  );
}

type ConsoleActionChecklistItem = {
  id: string;
  label: string;
  control: string;
  status: "ready" | "active" | "gated";
  next_action: string;
  boundary: string;
};

type SafeCredentialProfileItem = {
  id: string;
  label: string;
  status: "ready" | "active" | "gated";
  source: string;
  detail: string;
  boundary: string;
};

type FirstCanaryFlagItem = {
  id: string;
  label: string;
  envKey: string;
  requiredValue: string;
  status: "ready" | "selected" | "missing";
  detail: string;
};

function buildConsoleActionChecklist(input: {
  hasProviderInput: boolean;
  providerTested: boolean;
  localInstallReceipt: Web3LocalCredentialInstallReceipt | null;
  walletReady: boolean;
  browserWalletConnected: boolean;
  ownershipProved: boolean;
  dexLiveReady: boolean;
  jupiterKeyReady: boolean;
  jupiterOrderReady: boolean;
  preflightReady: boolean;
}): ConsoleActionChecklistItem[] {
  return [
    {
      id: "install-or-test-provider",
      label: "Provider evidence",
      control: input.localInstallReceipt?.status === "installed" ? "test credentials" : "install local env",
      status: input.providerTested || input.localInstallReceipt?.status === "installed" ? "ready" : input.hasProviderInput ? "active" : "gated",
      next_action: input.providerTested
        ? "Provider readiness has a session receipt. Re-test after changing Helius, Solana, Jupiter, signer, ops, or accounting fields."
        : input.hasProviderInput
          ? "Press Install local env for trusted localhost storage, or Test credentials for a session-only network check."
          : "Enter Helius/Solana or Jupiter values, or rely on already configured server env before testing provider readiness.",
      boundary: "Allowed provider values only; browser storage and secret echo stay blocked.",
    },
    {
      id: "scope-public-wallet",
      label: "Public wallet scope",
      control: input.walletReady ? "save public scope" : "detect/connect wallet",
      status: input.ownershipProved ? "ready" : input.walletReady || input.browserWalletConnected ? "active" : "gated",
      next_action: input.ownershipProved
        ? "Wallet ownership proof is recorded as hashes only. Save public scope again after changing risk caps."
        : input.walletReady
          ? "Press Save public scope, then Prove ownership with a text-only browser wallet signature."
          : "Paste a dedicated public Solana address, or detect/connect a browser wallet public address.",
      boundary: "Public address and text-message proof only; no private key, seed phrase, or transaction signing.",
    },
    {
      id: "refresh-market-proof",
      label: "Live DEX proof",
      control: "test DEX scanner",
      status: input.dexLiveReady ? "ready" : "active",
      next_action: input.dexLiveReady
        ? "Read-only DEX evidence is available. Re-run after provider or market-source changes."
        : "Press Test DEX scanner to refresh public discovery evidence before strict live-DEX verification.",
      boundary: "Public market data only; no wallet authority, order placement, or live execution.",
    },
    {
      id: "rehearse-order",
      label: "Jupiter order proof",
      control: "rehearse Jupiter",
      status: input.jupiterOrderReady ? "ready" : input.jupiterKeyReady && input.walletReady ? "active" : "gated",
      next_action: input.jupiterOrderReady
        ? "Jupiter order rehearsal has a redacted proof receipt. Run the strict verifier next."
        : input.jupiterKeyReady && input.walletReady
          ? "Press Rehearse Jupiter to prove quote/order readiness while withholding transaction bytes."
          : "Add a Jupiter key and a dedicated public wallet before order rehearsal can pass.",
      boundary: "Quote/order rehearsal only; execute, signing, submission, and transaction-byte return stay blocked.",
    },
    {
      id: "run-preflight",
      label: "Live preflight",
      control: "run live preflight",
      status: input.preflightReady ? "ready" : "gated",
      next_action: input.preflightReady
        ? "Live-capital preflight is recorded. Remaining blockers still require external review."
        : "Run live preflight after wallet, provider, DEX, Jupiter, risk, signer, settlement, and proof receipts are refreshed.",
      boundary: "Review receipt only; real capital, signing, submission, and wallet mutation remain blocked.",
    },
  ];
}

function buildSafeCredentialProfile(input: {
  operatorWalletReady: boolean;
  ownershipProved: boolean;
  browserWalletConnected: boolean;
  providerTested: boolean;
  rpcHealthy: boolean;
  hasReadProviderInput: boolean;
  localInstallReceipt: Web3LocalCredentialInstallReceipt | null;
  jupiterConfigured: boolean;
  jupiterOrderReady: boolean;
  signerTargetCount: number;
  signerMode: Web3SignerSetupMode;
  productionOpsTargetCount: number;
  hasEmergencyTarget: boolean;
  hasAccountingTarget: boolean;
  maxTradeUsd: number;
  dailySpendCapUsd: number;
  maxSlippageBps: number;
}): SafeCredentialProfileItem[] {
  const locallyConfigured = (key: string) => input.localInstallReceipt?.configured_keys.includes(key) === true;
  const readProviderReady = input.rpcHealthy || locallyConfigured("HELIUS_API_KEY") || locallyConfigured("SOLANA_RPC_URL");
  const readProviderActive = input.providerTested || input.hasReadProviderInput;
  const riskCapsReady = input.maxTradeUsd > 0 && input.dailySpendCapUsd >= input.maxTradeUsd && input.maxSlippageBps > 0 && input.maxSlippageBps <= 250;
  const signerPolicyReady = input.signerMode === "external-wallet"
    ? input.operatorWalletReady && input.ownershipProved
    : input.signerTargetCount >= 2;
  const opsReady = input.productionOpsTargetCount >= 2 || input.hasEmergencyTarget || locallyConfigured("MASTERMOLD_EMERGENCY_STOP_WEBHOOK_URL") || locallyConfigured("MASTERMOLD_EMERGENCY_STOP_CONTACT");

  return [
    {
      id: "public-wallet-scope",
      label: "Public wallet scope",
      status: input.ownershipProved ? "ready" : input.operatorWalletReady || input.browserWalletConnected ? "active" : "gated",
      source: input.ownershipProved ? "hash-only ownership receipt" : input.operatorWalletReady ? "browser public scope" : "operator input needed",
      detail: input.ownershipProved
        ? "Dedicated wallet control is represented by a text-message proof receipt."
        : input.operatorWalletReady
          ? "A valid public wallet address is present; proof and strict verification are next."
          : "A dedicated public Solana address is still needed before live review.",
      boundary: "Public address and text-message proof only; no private keys, seed phrases, or transaction signing.",
    },
    {
      id: "read-provider-rail",
      label: "Read provider rail",
      status: readProviderReady ? "ready" : readProviderActive ? "active" : "gated",
      source: readProviderReady ? "server env or validated session" : readProviderActive ? "session/local env pending test" : "provider input needed",
      detail: readProviderReady
        ? "RPC/provider evidence is available for read-only wallet and market checks."
        : readProviderActive
          ? "Provider values are present or tested, but the rail still needs a clean health receipt."
          : "Add Helius or Solana RPC targets before relying on live read evidence.",
      boundary: "Read-only RPC and DAS evidence only; no wallet authority or order submission.",
    },
    {
      id: "jupiter-order-rail",
      label: "Jupiter order rail",
      status: input.jupiterOrderReady ? "ready" : input.jupiterConfigured ? "active" : "gated",
      source: input.jupiterOrderReady ? "redacted order rehearsal" : input.jupiterConfigured ? "Jupiter target configured" : "Jupiter key needed",
      detail: input.jupiterOrderReady
        ? "Quote/order readiness has a redacted proof receipt with transaction bytes withheld."
        : input.jupiterConfigured
          ? "A Jupiter target is available; run the rehearsal after wallet scope is clean."
          : "Jupiter Swap V2 order proof still needs a key and public wallet scope.",
      boundary: "Unsigned order rehearsal only; execute, signing, submission, and transaction bytes stay blocked.",
    },
    {
      id: "signer-policy",
      label: "Signer policy",
      status: signerPolicyReady ? "ready" : input.signerMode === "external-wallet" || input.signerTargetCount > 0 ? "active" : "gated",
      source: input.signerMode.replaceAll("-", " "),
      detail: signerPolicyReady
        ? "Signer path has enough non-secret evidence for external review."
        : input.signerMode === "external-wallet"
          ? "Manual wallet signing is selected; wallet proof must clear before review."
          : "Provider credentials or policy identifiers are incomplete for the selected signer path.",
      boundary: "External signer or provider vault review only; wallet private keys and seed phrases are never accepted.",
    },
    {
      id: "ops-emergency-stop",
      label: "Ops and emergency stop",
      status: opsReady ? "ready" : input.productionOpsTargetCount > 0 || input.hasEmergencyTarget ? "active" : "gated",
      source: opsReady ? "local ops targets" : "ops target needed",
      detail: opsReady
        ? "Ops or emergency-stop targets are named for review without dispatch authority."
        : "Emergency-stop contact/webhook and production-worker review targets are still incomplete.",
      boundary: "Target names/status only; this app does not dispatch webhooks or start production workers.",
    },
    {
      id: "accounting-ledger",
      label: "Accounting ledger",
      status: input.hasAccountingTarget ? "ready" : "gated",
      source: input.hasAccountingTarget ? "local accounting target" : "settlement review needed",
      detail: input.hasAccountingTarget
        ? "Accounting/export target evidence is present for review."
        : "Settlement and tax-ledger targets are still needed before real capital review.",
      boundary: "Ledger/export target only; no settlement movement or wallet mutation.",
    },
    {
      id: "risk-caps",
      label: "Risk caps",
      status: riskCapsReady ? "ready" : "active",
      source: "dry-run policy",
      detail: riskCapsReady
        ? "Trade size, daily cap, and slippage are bounded for dry-run and review."
        : "Risk caps need a daily cap at least as large as max trade and slippage at or below 250 bps.",
      boundary: "Policy numbers only; they do not authorize live execution.",
    },
  ];
}

function buildFirstCanaryFlagItems(input: {
  draft: Draft;
  localInstallReceipt: Web3LocalCredentialInstallReceipt | null;
}): FirstCanaryFlagItem[] {
  return [
    firstCanaryFlagItem({
      id: "enable-live-web3-execution",
      label: "Live execution flag",
      envKey: "MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION",
      requiredValue: "true",
      draftValue: input.draft.enable_live_web3_execution,
      installed: input.localInstallReceipt?.configured_keys.includes("MASTERMOLD_ENABLE_LIVE_WEB3_EXECUTION") === true,
      detail: "Required before the guarded unsigned handoff can even ask for a tiny canary transaction.",
    }),
    firstCanaryFlagItem({
      id: "operator-real-funds-approval",
      label: "Operator approval",
      envKey: "MASTERMOLD_LIVE_OPERATOR_APPROVAL",
      requiredValue: "I_UNDERSTAND_REAL_FUNDS",
      draftValue: input.draft.live_operator_approval,
      installed: input.localInstallReceipt?.configured_keys.includes("MASTERMOLD_LIVE_OPERATOR_APPROVAL") === true,
      detail: "Records that this path can involve real funds while still requiring wallet proof, Jupiter, signing, and proof gates.",
    }),
    firstCanaryFlagItem({
      id: "unsigned-canary-handoff",
      label: "Unsigned handoff",
      envKey: "MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF",
      requiredValue: "true",
      draftValue: input.draft.allow_live_unsigned_canary_handoff,
      installed: input.localInstallReceipt?.configured_keys.includes("MASTERMOLD_ALLOW_LIVE_UNSIGNED_CANARY_HANDOFF") === true,
      detail: "Allows only the explicitly acknowledged, one-shot unsigned tiny canary handoff; it does not submit anything.",
    }),
  ];
}

function firstCanaryFlagItem(input: {
  id: string;
  label: string;
  envKey: string;
  requiredValue: string;
  draftValue: string;
  installed: boolean;
  detail: string;
}): FirstCanaryFlagItem {
  return {
    id: input.id,
    label: input.label,
    envKey: input.envKey,
    requiredValue: input.requiredValue,
    status: input.installed ? "ready" : input.draftValue === input.requiredValue ? "selected" : "missing",
    detail: input.detail,
  };
}

function ConsoleActionBadge({ status }: { status: ConsoleActionChecklistItem["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-outline-variant/35 bg-surface-dim/35 text-outline",
        status === "ready" && "border-engine/35 bg-engine/10 text-engine",
        status === "active" && "border-caution/35 bg-caution/10 text-caution",
        status === "gated" && "border-outline-variant/35 bg-void/25 text-outline",
      )}
    >
      {status}
    </Badge>
  );
}

function isSessionSensitiveDraftField(field: keyof Draft) {
  return [
    "helius_api_key",
    "jupiter_api_key",
    "privy_app_secret",
    "turnkey_api_private_key",
    "emergency_stop_webhook_url",
    "production_alert_webhook_url",
  ].includes(field);
}

function formatMissingTargets(keys: string[]) {
  if (keys.length === 0) return "none";
  const preview = keys.slice(0, 4).join(", ");
  return keys.length > 4 ? `${preview} +${keys.length - 4}` : preview;
}

function ConsoleInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "password" | "number";
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-outline">
      {label}
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-outline-variant/45 bg-void/40 px-3 text-sm normal-case tracking-normal text-on-surface outline-none transition placeholder:text-outline/65 focus:border-engine/60"
      />
    </label>
  );
}

function ConsoleMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "critical" | "engine" | "caution" | "neutral";
}) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className={cn(
        "mt-1 truncate text-sm font-semibold",
        tone === "engine" && "text-engine",
        tone === "caution" && "text-caution",
        tone === "critical" && "text-critical",
        tone === "neutral" && "text-on-surface",
      )}>
        {value}
      </p>
    </div>
  );
}

function BoundaryBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="border-outline-variant/40 bg-void/25 text-outline">
      <ShieldCheck aria-hidden="true" className="mr-1 size-3" />
      {label}
    </Badge>
  );
}

function GateBadge({ label, ready }: { label: string; ready: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-outline-variant/40 bg-void/25 text-outline",
        ready && "border-engine/35 bg-engine/10 text-engine",
      )}
    >
      {ready ? "ready" : "gated"} · {label}
    </Badge>
  );
}

function VerifierCommand({ label, command, ready }: { label: string; command: string; ready: boolean }) {
  return (
    <div className="rounded-md border border-outline-variant/25 bg-void/25 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
        <Badge
          variant="outline"
          className={cn(
            "border-outline-variant/35 bg-surface-dim/35 text-outline",
            ready && "border-engine/35 bg-engine/10 text-engine",
          )}
        >
          {ready ? "ready" : "missing input"}
        </Badge>
      </div>
      <div className="mt-2 flex items-start gap-2 rounded-md border border-outline-variant/20 bg-black/20 p-2">
        <Terminal aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-engine" />
        <code className="min-w-0 break-all font-mono text-[11px] leading-5 text-on-surface-variant">
          {command}
        </code>
      </div>
    </div>
  );
}

function isLikelySolanaPublicKey(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function getBrowserSolanaProvider(): BrowserSolanaProvider | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as typeof window & {
    solana?: BrowserSolanaProvider;
    phantom?: { solana?: BrowserSolanaProvider };
    solflare?: BrowserSolanaProvider;
    backpack?: BrowserSolanaProvider;
  };
  return maybeWindow.solana ?? maybeWindow.phantom?.solana ?? maybeWindow.solflare ?? maybeWindow.backpack ?? null;
}

function browserWalletProviderName(provider: BrowserSolanaProvider | null) {
  if (!provider) return "none";
  if (provider.isPhantom) return "Phantom";
  if (provider.isSolflare) return "Solflare";
  if (provider.isBackpack) return "Backpack";
  return "Solana wallet";
}

function buildBrowserWalletReceipt({
  status,
  provider,
  publicKey,
  nextAction,
}: {
  status: BrowserWalletReceipt["status"];
  provider: string;
  publicKey: string | null;
  nextAction: string;
}): BrowserWalletReceipt {
  return {
    status,
    provider,
    wallet_public_key_preview: previewValue(publicKey),
    checked_at: new Date().toISOString(),
    connect_permission: provider === "none" ? "not-available" : "operator-prompt-only",
    signing_permission: "blocked",
    wallet_mutation_permission: "blocked",
    private_key_storage: "blocked",
    next_action: nextAction,
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

async function requestWalletOwnershipChallenge(walletPublicKey: string) {
  const response = await fetch(`/api/web3-wallet-ownership?wallet_public_key=${encodeURIComponent(walletPublicKey)}`);
  const payload = await response.json().catch(() => null) as Web3WalletOwnershipChallengeReceipt | { error: string } | null;
  if (!response.ok || !payload || "error" in payload || payload.status !== "ready" || !payload.message) {
    throw new Error(payload && "error" in payload ? payload.error : "Wallet ownership challenge failed.");
  }
  return payload.message;
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function serializeSignedWalletTransaction(value: unknown): Uint8Array | null {
  if (!value || typeof value !== "object") return null;
  const maybeSerializable = value as { serialize?: () => Uint8Array };
  if (typeof maybeSerializable.serialize !== "function") return null;
  const serialized = maybeSerializable.serialize();
  return serialized instanceof Uint8Array ? serialized : null;
}

const SAMPLE_SYSTEM_WALLET = "11111111111111111111111111111111";

function previewValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatConsoleTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "just now";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

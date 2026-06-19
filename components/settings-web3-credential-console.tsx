"use client";

import { useState } from "react";
import { Activity, Save, ShieldCheck, Terminal, Wallet, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Web3CredentialsSetupReadiness, Web3SignerSetupMode } from "@/src/db/web3-credentials";
import type { Web3DexDiscoveryReceipt } from "@/src/db/web3-dex-discovery";
import type { Web3JupiterRehearsalReceipt } from "@/src/db/web3-jupiter-rehearsal";
import type { Web3LiveCapitalPreflightReceipt } from "@/src/db/web3-live-capital-preflight";
import type { Web3LocalCredentialInstallReceipt } from "@/src/db/web3-local-credential-install";
import type { Web3TradingState } from "@/src/db/web3-trading";
import type { Web3WalletOwnershipReceipt } from "@/src/db/web3-wallet-ownership";

type SettingsWeb3CredentialConsoleProps = {
  walletPublicKeyPreview: string | null;
  defaultWalletPublicKey: string;
  maxTradeUsd: number;
  dailySpendCapUsd: number;
  maxSlippageBps: number;
  jupiterConfigured: boolean;
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
};

export function SettingsWeb3CredentialConsole({
  walletPublicKeyPreview,
  defaultWalletPublicKey,
  maxTradeUsd,
  dailySpendCapUsd,
  maxSlippageBps,
  jupiterConfigured,
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
    wallet_public_key: defaultWalletPublicKey,
    signer_mode: "external-wallet",
    max_trade_usd: String(maxTradeUsd),
    daily_spend_cap_usd: String(dailySpendCapUsd),
    max_slippage_bps: String(maxSlippageBps),
  });
  const [busy, setBusy] = useState<"credentials" | "dex" | "install" | "jupiter" | "ownership" | "preflight" | "scope" | "wallet" | null>(null);
  const [message, setMessage] = useState("Session-only fields are empty by default. Leave keys blank to use server environment values.");
  const [browserWallet, setBrowserWallet] = useState<BrowserWalletReceipt | null>(null);
  const [credentialResult, setCredentialResult] = useState<(Web3CredentialsSetupReadiness & { checked_at?: string; network_tested?: boolean }) | null>(null);
  const [dexReceipt, setDexReceipt] = useState<Web3DexDiscoveryReceipt | null>(null);
  const [jupiterReceipt, setJupiterReceipt] = useState<Web3JupiterRehearsalReceipt | null>(null);
  const [localInstallReceipt, setLocalInstallReceipt] = useState<Web3LocalCredentialInstallReceipt | null>(null);
  const [preflightReceipt, setPreflightReceipt] = useState<Web3LiveCapitalPreflightReceipt | null>(null);
  const [ownershipReceipt, setOwnershipReceipt] = useState<Web3WalletOwnershipReceipt | null>(null);
  const [savedScope, setSavedScope] = useState<{ walletPreview: string | null; updatedAt: string } | null>(null);

  function updateDraft(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setMessage(field === "helius_api_key" || field === "jupiter_api_key"
      ? "Secret value is held only in this page session and is not saved."
      : "Session value updated. Use a public wallet address only.");
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Credential test failed.");
    } finally {
      setBusy(null);
    }
  }

  async function installLocalCredentials() {
    if (![draft.helius_api_key, draft.rpc_url, draft.ws_url, draft.jupiter_api_key].some((value) => value.trim().length > 0)) {
      setMessage("Enter a Helius, Solana RPC/WebSocket, or Jupiter value before installing local env credentials.");
      return;
    }
    setBusy("install");
    setMessage("Installing known Web3 credential targets into ignored local env without echoing values...");
    try {
      const response = await fetch("/api/web3-local-credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          helius_api_key: draft.helius_api_key,
          rpc_url: draft.rpc_url,
          ws_url: draft.ws_url,
          jupiter_api_key: draft.jupiter_api_key,
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
      }));
      setMessage(payload.summary);
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Live-capital preflight failed.");
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
      const challenge = buildWalletOwnershipChallenge(publicKey);
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
      setMessage("Public wallet scope and dry-run caps are saved for Web3 rehearsal. Live execution remains blocked by the launch checklist.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Public scope could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  const credentialChecks = credentialResult?.checks ?? [];
  const disabled = busy !== null;
  const trimmedWallet = draft.wallet_public_key.trim();
  const operatorWalletReady = isLikelySolanaPublicKey(trimmedWallet) && trimmedWallet !== SAMPLE_SYSTEM_WALLET;
  const localJupiterConfigured = localInstallReceipt?.configured_keys.includes("JUPITER_API_KEY") === true;
  const jupiterKeyReady = jupiterConfigured || localJupiterConfigured || draft.jupiter_api_key.trim().length > 0;
  const dexLiveReady = dexReceipt?.status === "live-ready" || dexReceipt?.status === "live-watch";
  const commandWallet = operatorWalletReady ? trimmedWallet : "<public-solana-address>";
  const operatorWalletCommand = `npm run verify:web3 -- --base-url=http://localhost:4010 --wallet=${commandWallet} --require-operator-wallet`;
  const dexLiveCommand = "npm run verify:web3 -- --base-url=http://localhost:4010 --require-dex-live";
  const combinedStrictCommand = `${operatorWalletCommand} --require-jupiter-order --require-dex-live`;

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
        <ConsoleInput
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

      <div className="mt-3 rounded-md border border-outline-variant/25 bg-void/20 p-2" aria-label="Local Web3 credential installer">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Local credential installer</p>
            <p className="mt-1 text-xs font-semibold text-on-surface">
              Install known provider values into ignored local env
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
          Local install accepts only Helius, Solana RPC/WebSocket, and Jupiter provider fields, writes to ignored local env on trusted localhost, clears the page secret fields after success, and keeps live execution blocked.
        </p>
        {localInstallReceipt ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-3" aria-label="Local Web3 credential install receipt">
            <ConsoleMetric label="Install" value={localInstallReceipt.status} tone={localInstallReceipt.status === "installed" ? "engine" : localInstallReceipt.status === "invalid" || localInstallReceipt.status === "blocked" ? "critical" : "neutral"} />
            <ConsoleMetric label="Configured" value={`${localInstallReceipt.configured_keys.length}/4`} tone={localInstallReceipt.configured_keys.length >= 2 ? "engine" : "caution"} />
            <ConsoleMetric label="Missing" value={localInstallReceipt.missing_keys.join(", ") || "none"} tone={localInstallReceipt.missing_keys.length === 0 ? "engine" : "caution"} />
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
        </div>
      </div>

      <p className="mt-2 rounded-md border border-outline-variant/30 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant" aria-live="polite">
        {message}
      </p>

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
        Settings Web3 credential console keeps API keys session only; no browser storage for Helius or Jupiter keys; browser wallet detection requests public address only; wallet ownership proof signs text only; private key storage blocked; seed phrase storage blocked; unsigned transaction return withheld; DEX scanner receipt is read-only paper evidence; live-capital preflight receipt is review evidence only; live execution blocked; wallet mutation blocked.
        Local credential installer can write known provider values to ignored local env on trusted localhost only; install receipt configured keys {localInstallReceipt?.configured_keys.join(", ") ?? "none"}; installed keys {localInstallReceipt?.installed_keys.join(", ") ?? "none"}; missing keys {localInstallReceipt?.missing_keys.join(", ") ?? "unknown"}; secret echo permission {localInstallReceipt?.secret_echo_permission ?? "blocked"}.
      </p>
    </section>
  );
}

function ConsoleInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
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

function buildWalletOwnershipChallenge(walletPublicKey: string) {
  return [
    "Mastermind Web3 wallet ownership challenge",
    `Wallet: ${walletPublicKey}`,
    "Purpose: prove public wallet control only",
    "No transaction signing or wallet mutation is authorized.",
    `Issued: ${new Date().toISOString()}`,
  ].join("\n");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
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

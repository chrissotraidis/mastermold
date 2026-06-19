"use client";

import { useState } from "react";
import { Activity, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Web3CredentialsSetupReadiness, Web3SignerSetupMode } from "@/src/db/web3-credentials";
import type { Web3JupiterRehearsalReceipt } from "@/src/db/web3-jupiter-rehearsal";

type SettingsWeb3CredentialConsoleProps = {
  walletPublicKeyPreview: string | null;
  defaultWalletPublicKey: string;
  maxTradeUsd: number;
  dailySpendCapUsd: number;
  maxSlippageBps: number;
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

export function SettingsWeb3CredentialConsole({
  walletPublicKeyPreview,
  defaultWalletPublicKey,
  maxTradeUsd,
  dailySpendCapUsd,
  maxSlippageBps,
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
  const [busy, setBusy] = useState<"credentials" | "jupiter" | null>(null);
  const [message, setMessage] = useState("Session-only fields are empty by default. Leave keys blank to use server environment values.");
  const [credentialResult, setCredentialResult] = useState<(Web3CredentialsSetupReadiness & { checked_at?: string; network_tested?: boolean }) | null>(null);
  const [jupiterReceipt, setJupiterReceipt] = useState<Web3JupiterRehearsalReceipt | null>(null);

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

  const credentialChecks = credentialResult?.checks ?? [];
  const disabled = busy !== null;

  return (
    <section className="rounded-md border border-violet/25 bg-violet/[0.035] p-3" aria-label="Settings Web3 credential action console">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">Credential action console</p>
          <h3 className="mt-1 text-base font-semibold text-on-surface">Session-only provider tests</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
            Test Helius/Solana, wallet scope, and Jupiter order readiness from Settings. API keys are never saved to browser storage; private keys and seed phrases are not accepted.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <BoundaryBadge label="session only" />
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-outline">
          Scoped wallet: {walletPublicKeyPreview ?? "missing"} · keys are request-only
        </p>
        <div className="flex flex-wrap gap-2">
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
            onClick={rehearseJupiter}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-violet/45 bg-violet/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-violet transition hover:bg-violet/15 disabled:cursor-not-allowed disabled:border-outline-variant/40 disabled:bg-void/20 disabled:text-outline"
          >
            <Zap className={cn("size-3.5 shrink-0", busy === "jupiter" && "animate-pulse")} aria-hidden="true" />
            {busy === "jupiter" ? "Rehearsing" : "Rehearse Jupiter"}
          </button>
        </div>
      </div>

      <p className="mt-2 rounded-md border border-outline-variant/30 bg-void/20 p-2 text-xs leading-5 text-on-surface-variant" aria-live="polite">
        {message}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ConsoleMetric
          label="Credential score"
          value={credentialResult ? `${credentialResult.readiness_score}/100` : "untested"}
          tone={credentialResult?.status === "configured" ? "engine" : credentialResult ? "caution" : "neutral"}
        />
        <ConsoleMetric
          label="Wallet sync"
          value={credentialResult?.can_support_readonly_wallet_sync ? "ready" : "gated"}
          tone={credentialResult?.can_support_readonly_wallet_sync ? "engine" : "caution"}
        />
        <ConsoleMetric
          label="Jupiter order"
          value={jupiterReceipt?.summary.jupiter_order_ready ? "ready" : "gated"}
          tone={jupiterReceipt?.summary.jupiter_order_ready ? "engine" : "caution"}
        />
        <ConsoleMetric
          label="Execution"
          value="blocked"
          tone="neutral"
        />
      </div>

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
        Settings Web3 credential console keeps API keys session only; no browser storage for Helius or Jupiter keys; private key storage blocked; seed phrase storage blocked; unsigned transaction return withheld; live execution blocked; wallet mutation blocked.
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
  tone: "engine" | "caution" | "neutral";
}) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant/25 bg-surface-dim/25 p-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-outline">{label}</p>
      <p className={cn(
        "mt-1 truncate text-sm font-semibold",
        tone === "engine" && "text-engine",
        tone === "caution" && "text-caution",
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

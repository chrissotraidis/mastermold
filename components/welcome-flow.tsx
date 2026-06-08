"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, HardDriveDownload, ShieldCheck, Sparkles } from "lucide-react";
import { SentinelFace } from "@/components/sentinel-face";
import { useProfile } from "@/components/profile-provider";
import {
  ASSET_FOCUSES,
  RISK_POSTURES,
  summarizeBackup,
  type AssetFocus,
  type RiskPosture,
} from "@/src/profile/profile";
import { cn } from "@/lib/utils";

const RISK_LABELS: Record<RiskPosture, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

const FOCUS_LABELS: Record<AssetFocus, string> = {
  equities: "Equities",
  crypto: "Crypto",
  both: "Both",
};

const PRINCIPLES = [
  { icon: ShieldCheck, text: "Advisory only. Master Mold never moves your money — it can't." },
  { icon: Eye, text: "Runs on sample data out of the box. No accounts or keys required to look around." },
  { icon: HardDriveDownload, text: "Your profile and keys live in this browser. Export them any time to back up or move machines." },
];

export function WelcomeFlow() {
  const router = useRouter();
  const { createProfile, dismissWelcome, importBackupFile, applyBackup } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [risk, setRisk] = useState<RiskPosture>("balanced");
  const [focus, setFocus] = useState<AssetFocus>("both");
  const [importError, setImportError] = useState("");
  const [importNote, setImportNote] = useState("");

  function handleCreate() {
    createProfile({ name, preferences: { risk_posture: risk, asset_focus: focus } });
    router.push("/");
  }

  function handleSkip() {
    dismissWelcome();
    router.push("/");
  }

  async function handleImportFile(file: File) {
    setImportError("");
    setImportNote("");
    const result = await importBackupFile(file);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    applyBackup(result.backup);
    setImportNote(`Restored ${result.backup.profile.name || "your profile"} · ${summarizeBackup(result.backup)}.`);
    router.push("/");
  }

  return (
    <main className="relative min-h-screen scanline-bg">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-8 px-6 py-16">
        <header className="flex flex-col items-center text-center">
          <div className="relative mb-4 size-28">
            <SentinelFace state="idle" />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-telemetry text-violet">
            Open-source financial copilot
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">
            Welcome to Master Mold
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-on-surface-variant">
            A personal, advisory-only copilot for your portfolio. Set up a profile to make it
            yours — or skip and explore the sample data first. Nothing here ever touches your funds.
          </p>
        </header>

        <ul className="grid gap-3">
          {PRINCIPLES.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex items-start gap-3 border border-outline-variant/40 bg-surface-dim/40 p-4 chamfer-sm"
            >
              <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-violet" />
              <span className="text-sm leading-6 text-on-surface-variant">{text}</span>
            </li>
          ))}
        </ul>

        <section className="border border-outline-variant/40 bg-surface-high/30 p-5 chamfer sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-5 text-violet" />
            <h2 className="font-display text-lg font-semibold text-on-surface">Make it yours</h2>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="welcome-name" className="text-sm font-semibold text-on-surface">
                What should I call you?
              </label>
              <input
                id="welcome-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                maxLength={120}
                className="w-full rounded-md border border-outline-variant/50 bg-surface-dim/70 px-3 py-2.5 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
              />
            </div>

            <SegmentedField<RiskPosture>
              label="Risk posture"
              value={risk}
              options={RISK_POSTURES}
              labels={RISK_LABELS}
              onChange={setRisk}
            />

            <SegmentedField<AssetFocus>
              label="What do you focus on?"
              value={focus}
              options={ASSET_FOCUSES}
              labels={FOCUS_LABELS}
              onChange={setFocus}
            />
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleCreate}
              className="flex items-center justify-center gap-2 bg-violet px-4 py-3 font-semibold text-void chamfer-sm transition hover:brightness-110"
            >
              Create my profile
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
              <button
                type="button"
                onClick={handleSkip}
                className="text-outline underline-offset-4 transition hover:text-on-surface hover:underline"
              >
                Skip — just explore the demo
              </button>
              <span aria-hidden="true" className="text-outline/40">·</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-violet underline-offset-4 transition hover:underline"
              >
                Restore from a backup
              </button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />

          {importError ? (
            <p className="mt-3 rounded-md border border-critical/40 bg-critical/10 p-3 text-sm text-critical">
              {importError}
            </p>
          ) : null}
          {importNote ? (
            <p className="mt-3 rounded-md border border-engine/40 bg-engine/10 p-3 text-sm text-engine">
              {importNote}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function SegmentedField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold text-on-surface">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              value === option
                ? "border-violet bg-violet text-void"
                : "border-outline-variant/50 bg-surface-dim/70 text-on-surface-variant hover:bg-surface-high/60",
            )}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

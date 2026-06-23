"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, HardDriveDownload, ShieldCheck, Sparkles } from "lucide-react";
import { SentinelFace } from "@/components/sentinel-face";
import { useProfile } from "@/components/profile-provider";
import {
  ALERT_SENSITIVITIES,
  ASSET_FOCUSES,
  RISK_POSTURES,
  summarizeBackup,
  type AlertSensitivity,
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
const ALERT_LABELS: Record<AlertSensitivity, string> = {
  urgent_only: "Urgent only",
  balanced: "Balanced",
  more_detail: "More detail",
};

const PRINCIPLES = [
  { icon: ShieldCheck, text: "Advisory only. Master Mold cannot move your money." },
  { icon: Eye, text: "Sample data works immediately. No account connection required." },
  { icon: HardDriveDownload, text: "Profile settings and saved test fields stay in this browser." },
];

export function WelcomeFlow() {
  const router = useRouter();
  const { createProfile, dismissWelcome, importBackupFile, applyBackup } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [risk, setRisk] = useState<RiskPosture>("balanced");
  const [focus, setFocus] = useState<AssetFocus>("both");
  const [alertSensitivity, setAlertSensitivity] = useState<AlertSensitivity>("balanced");
  const [importError, setImportError] = useState("");
  const [importNote, setImportNote] = useState("");

  function handleCreate() {
    createProfile({
      name,
      preferences: { risk_posture: risk, asset_focus: focus, alert_sensitivity: alertSensitivity },
    });
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
    setImportNote(`Restored ${result.backup.profile.name || "your profile"} - ${summarizeBackup(result.backup)}.`);
    router.push("/");
  }

  return (
    <main className="relative min-h-screen scanline-bg">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-5 pb-10 pt-7 sm:justify-center sm:gap-8 sm:px-6 sm:py-16">
        <header className="flex flex-col items-center text-center">
          <div className="relative mb-3 size-20 sm:mb-4 sm:size-28">
            <SentinelFace state="idle" />
          </div>
          <p className="font-mono text-[11px] uppercase tracking-telemetry text-violet">
            Personal financial copilot
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-on-surface sm:text-4xl">
            Welcome to Master Mold
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-on-surface-variant sm:text-base sm:leading-7">
            Start with sample data, then add a profile when you want the daily read to feel personal.
          </p>
        </header>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleSkip}
            className="flex min-h-12 items-center justify-center gap-2 bg-violet px-4 py-3 font-semibold text-void chamfer-sm transition hover:brightness-110"
          >
            Explore sample data
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => document.getElementById("welcome-name")?.focus()}
            className="flex min-h-12 items-center justify-center border border-outline-variant/50 bg-surface-dim/60 px-4 py-3 font-semibold text-on-surface chamfer-sm transition hover:border-violet/50 hover:text-violet"
          >
            Set up profile
          </button>
        </div>
        <Link
          href="/review"
          className="mx-auto inline-flex min-h-11 items-center justify-center rounded-md border border-outline-variant/45 px-3 text-sm font-semibold text-on-surface-variant transition hover:border-violet/50 hover:text-violet"
        >
          See what is real, sample, or not built yet
        </Link>

        <ul className="grid gap-2 sm:gap-3">
          {PRINCIPLES.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex items-start gap-3 border border-outline-variant/40 bg-surface-dim/40 p-3 chamfer-sm sm:p-4"
            >
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-violet sm:size-5" />
              <span className="text-sm leading-5 text-on-surface-variant sm:leading-6">{text}</span>
            </li>
          ))}
        </ul>

        <section className="border border-outline-variant/40 bg-surface-high/30 p-4 chamfer sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles aria-hidden="true" className="size-5 text-violet" />
              <h2 className="font-display text-lg font-semibold text-on-surface">Make it yours</h2>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-outline underline-offset-4 transition hover:text-on-surface hover:underline"
            >
              Skip
            </button>
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

            <SegmentedField<AlertSensitivity>
              label="Alert sensitivity"
              value={alertSensitivity}
              options={ALERT_SENSITIVITIES}
              labels={ALERT_LABELS}
              onChange={setAlertSensitivity}
            />
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleCreate}
              className="flex min-h-11 items-center justify-center gap-2 bg-violet px-4 py-3 font-semibold text-void chamfer-sm transition hover:brightness-110"
            >
              Create my profile
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex min-h-11 items-center rounded-md px-2 text-violet underline-offset-4 transition hover:underline"
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "min-h-11 rounded-md border px-3 py-2 text-center text-sm font-medium leading-5 transition-colors",
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

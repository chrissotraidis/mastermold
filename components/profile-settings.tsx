"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  RotateCcw,
  Upload,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const PROFILE_HELP = {
  risk: "Saved as local preference context. It does not change safety caps or trading behavior.",
  focus: "Tells Master Mold what to emphasize first after you add holdings.",
  alerts: "Sets how much detail you prefer; feedback buttons still decide what gets quieter over time.",
};

export function ProfileSettings() {
  const router = useRouter();
  const { ready, profile, updateProfile, exportProfile, importBackupFile, applyBackup, resetProfile } =
    useProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [risk, setRisk] = useState<RiskPosture>("balanced");
  const [focus, setFocus] = useState<AssetFocus>("both");
  const [alertSensitivity, setAlertSensitivity] = useState<AlertSensitivity>("balanced");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  // Mirror the loaded profile into the form once it's ready.
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setRisk(profile.preferences.risk_posture);
      setFocus(profile.preferences.asset_focus);
      setAlertSensitivity(profile.preferences.alert_sensitivity);
    }
  }, [profile]);

  if (!ready) {
    return (
      <p className="rounded-md border border-outline-variant/25 px-3 py-2.5 text-sm leading-6 text-outline">
        Profile settings live in this browser. Saved preferences appear here as soon as the local
        setup is available.
      </p>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-md border border-outline-variant/25 px-3 py-2.5">
        <p className="text-sm leading-6 text-on-surface-variant">
          You&apos;re exploring on sample data — no profile yet. Create one to save risk, focus,
          and alert preferences, or restore a profile you exported elsewhere.
        </p>
        <p className="mt-1 text-xs leading-5 text-outline">
          Restoring reads a Master Mold JSON backup from your disk: preferences plus saved connection-test fields.
          It does not fetch live account data.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => router.push("/welcome")} className="bg-violet text-xs text-void hover:brightness-110">
            <UserRound aria-hidden="true" />
            Set up a profile
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            className="border-outline-variant/50 bg-transparent text-xs text-on-surface hover:bg-surface-high/60"
          >
            <Upload aria-hidden="true" />
            Restore from backup
          </Button>
        </div>
        <HiddenImport fileRef={fileRef} onResult={handleImportResult} />
        <Feedback status={status} error={error} />
      </div>
    );
  }

  function handleSave() {
    if (!profile) return;
    setError("");
    updateProfile({
      ...profile,
      name: name.trim().slice(0, 120),
      preferences: { risk_posture: risk, asset_focus: focus, alert_sensitivity: alertSensitivity },
    });
    setStatus("Profile saved to this browser.");
  }

  function handleExport() {
    setError("");
    exportProfile();
    setStatus("Downloaded a backup of your profile and saved connection-test fields.");
  }

  function handleImportResult(result: Awaited<ReturnType<typeof importBackupFile>>) {
    setStatus("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyBackup(result.backup);
    setError("");
    setStatus(`Restored ${result.backup.profile.name || "profile"} · ${summarizeBackup(result.backup)}.`);
  }

  function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    resetProfile();
    router.push("/welcome");
  }

  return (
    <div>
      <div className="divide-y divide-outline-variant/15 rounded-md border border-outline-variant/25">
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
            <UserRound aria-hidden="true" className="size-4 shrink-0 text-violet" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
              {profile.name || "Unnamed operator"}
            </span>
            <span className="hidden shrink-0 text-xs text-outline sm:inline">
              {RISK_LABELS[profile.preferences.risk_posture]} · {FOCUS_LABELS[profile.preferences.asset_focus]} ·
              Alerts: {ALERT_LABELS[profile.preferences.alert_sensitivity]}
            </span>
            <span className="shrink-0 text-xs font-semibold text-violet">Edit</span>
            <span className="shrink-0 text-xs text-outline transition group-open:rotate-90">›</span>
          </summary>
          <div className="space-y-4 border-t border-outline-variant/15 px-3 py-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="profile-name"
                className="text-xs font-semibold uppercase tracking-telemetry text-outline"
              >
                Name
              </Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={120}
                className="border-outline-variant/50 bg-surface-dim/70 text-on-surface placeholder:text-outline"
              />
            </div>

            <Segmented
              label="Suggestion style"
              value={risk}
              options={RISK_POSTURES}
              labels={RISK_LABELS}
              onChange={setRisk}
              helper={PROFILE_HELP.risk}
            />
            <Segmented
              label="Primary focus"
              value={focus}
              options={ASSET_FOCUSES}
              labels={FOCUS_LABELS}
              onChange={setFocus}
              helper={PROFILE_HELP.focus}
            />
            <Segmented
              label="Detail level"
              value={alertSensitivity}
              options={ALERT_SENSITIVITIES}
              labels={ALERT_LABELS}
              onChange={setAlertSensitivity}
              helper={PROFILE_HELP.alerts}
            />

            <Button size="sm" onClick={handleSave} className="bg-violet text-xs text-void hover:brightness-110">
              Save profile
            </Button>
          </div>
        </details>

        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
              Backup &amp; restore
            </span>
            <span className="hidden shrink-0 text-xs text-outline sm:inline">
              Export, import, or reset this browser setup
            </span>
            <span className="shrink-0 text-xs text-outline transition group-open:rotate-90">›</span>
          </summary>
          <div className="border-t border-outline-variant/15 px-3 py-3">
            <p className="text-xs leading-5 text-outline">
              One file holds your preferences and saved connection-test fields; import it on another
              machine to restore the local setup.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="border-outline-variant/50 bg-transparent text-xs text-on-surface hover:bg-surface-high/60"
              >
                <Download aria-hidden="true" />
                Export profile
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="border-outline-variant/50 bg-transparent text-xs text-on-surface hover:bg-surface-high/60"
              >
                <Upload aria-hidden="true" />
                Import profile
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className={cn(
                  "border-outline-variant/50 bg-transparent text-xs hover:bg-surface-high/60",
                  confirmReset ? "border-critical/60 text-critical" : "text-on-surface",
                )}
              >
                <RotateCcw aria-hidden="true" />
                {confirmReset ? "Click again to reset browser setup" : "Reset browser setup"}
              </Button>
            </div>
          </div>
        </details>
      </div>
      <HiddenImport fileRef={fileRef} onResult={handleImportResult} />
      <Feedback status={status} error={error} />
    </div>
  );
}

function HiddenImport({
  fileRef,
  onResult,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  onResult: (result: { ok: false; error: string } | { ok: true; backup: import("@/src/profile/profile").Backup }) => void;
}) {
  const { importBackupFile } = useProfile();
  return (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      className="sr-only"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        onResult(await importBackupFile(file));
      }}
    />
  );
}

function Feedback({ status, error }: { status: string; error: string }) {
  if (!status && !error) return null;
  return (
    <div className="mt-3" aria-live="polite">
      {error ? (
        <p className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">{error}</p>
      ) : (
        <p className="rounded-md border border-engine/40 bg-engine/10 px-3 py-2 text-sm text-engine">{status}</p>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  helper,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (next: T) => void;
  helper?: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-telemetry text-outline">{label}</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "min-h-11 rounded-md border px-3 py-1.5 text-center text-xs font-medium leading-5 transition-colors sm:min-h-8",
              value === option
                ? "border-violet bg-violet text-void"
                : "border-outline-variant/50 bg-surface-dim/70 text-on-surface-variant hover:bg-surface-high/60",
            )}
          >
            {labels[option]}
          </button>
        ))}
      </div>
      {helper ? <p className="text-xs leading-5 text-outline">{helper}</p> : null}
    </div>
  );
}

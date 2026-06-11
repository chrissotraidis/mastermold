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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <SectionShell>
        <p className="text-sm leading-6 text-outline">
          Profile settings live in this browser. Saved preferences appear here as soon as the
          local setup is available.
        </p>
      </SectionShell>
    );
  }

  if (!profile) {
    return (
      <SectionShell>
        <p className="text-sm leading-6 text-on-surface-variant">
          You&apos;re exploring on sample data — no profile yet. Create one to personalize Master
          Mold, save risk/focus/alert preferences, and enable backups. You can also restore a
          profile you exported elsewhere.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => router.push("/welcome")} className="bg-violet text-void hover:brightness-110">
            <UserRound aria-hidden="true" />
            Set up a profile
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
          >
            <Upload aria-hidden="true" />
            Restore from backup
          </Button>
        </div>
        <HiddenImport fileRef={fileRef} onResult={handleImportResult} />
        <Feedback status={status} error={error} />
      </SectionShell>
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
    <SectionShell>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="profile-name" className="text-sm font-semibold text-on-surface">
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

        <Segmented label="Risk posture" value={risk} options={RISK_POSTURES} labels={RISK_LABELS} onChange={setRisk} />
        <Segmented label="Focus" value={focus} options={ASSET_FOCUSES} labels={FOCUS_LABELS} onChange={setFocus} />
        <Segmented
          label="Alert sensitivity"
          value={alertSensitivity}
          options={ALERT_SENSITIVITIES}
          labels={ALERT_LABELS}
          onChange={setAlertSensitivity}
          helper="Sets your local preference. Useful / Not useful ratings still teach Master Mold which alerts to show less or more often."
        />

        <Button onClick={handleSave} className="bg-violet text-void hover:brightness-110">
          Save profile
        </Button>
      </div>

      <div className="mt-6 border-t border-outline-variant/40 pt-4">
        <details className="rounded-md border border-outline-variant/40 bg-surface-dim/35 p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-on-surface">
            Backup &amp; restore
          </summary>
          <p className="mt-2 text-sm leading-6 text-outline">
            Export your preferences and saved test fields to a single file. Import it on another
            machine to restore the local setup.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleExport}
              className="border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
            >
              <Download aria-hidden="true" />
              Export profile
            </Button>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
            >
              <Upload aria-hidden="true" />
              Import profile
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              className={cn(
                "border-outline-variant/50 bg-transparent hover:bg-surface-high/60",
                confirmReset ? "border-critical/60 text-critical" : "text-on-surface",
              )}
            >
              <RotateCcw aria-hidden="true" />
              {confirmReset ? "Click again to reset browser setup" : "Reset browser setup"}
            </Button>
          </div>
        </details>
        <HiddenImport fileRef={fileRef} onResult={handleImportResult} />
      </div>

      <Feedback status={status} error={error} />
    </SectionShell>
  );
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-outline-variant/40 bg-surface-high/30">
      <CardHeader className="p-5">
        <div className="flex items-center gap-2">
          <UserRound aria-hidden="true" className="size-5 text-violet" />
          <CardTitle as="h2" className="text-xl text-on-surface">Profile</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0">{children}</CardContent>
    </Card>
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
    <div className="mt-4" aria-live="polite">
      {error ? (
        <p className="rounded-md border border-critical/40 bg-critical/10 p-3 text-sm text-critical">{error}</p>
      ) : (
        <p className="rounded-md border border-engine/40 bg-engine/10 p-3 text-sm text-engine">{status}</p>
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
              "min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
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

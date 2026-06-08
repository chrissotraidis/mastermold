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

export function ProfileSettings() {
  const router = useRouter();
  const { ready, profile, updateProfile, exportProfile, importBackupFile, applyBackup, resetProfile } =
    useProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [risk, setRisk] = useState<RiskPosture>("balanced");
  const [focus, setFocus] = useState<AssetFocus>("both");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  // Mirror the loaded profile into the form once it's ready.
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setRisk(profile.preferences.risk_posture);
      setFocus(profile.preferences.asset_focus);
    }
  }, [profile]);

  if (!ready) {
    return <SectionShell><p className="text-sm text-outline">Loading your profile…</p></SectionShell>;
  }

  if (!profile) {
    return (
      <SectionShell>
        <p className="text-sm leading-6 text-on-surface-variant">
          You&apos;re exploring on sample data — no profile yet. Create one to personalize Master
          Mold and enable backups, or restore a profile you exported elsewhere.
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
      preferences: { risk_posture: risk, asset_focus: focus },
    });
    setStatus("Profile saved to this browser.");
  }

  function handleExport() {
    setError("");
    exportProfile();
    setStatus("Downloaded a backup of your profile and connected accounts.");
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

        <Button onClick={handleSave} className="bg-violet text-void hover:brightness-110">
          Save profile
        </Button>
      </div>

      <div className="mt-6 border-t border-outline-variant/40 pt-5">
        <h3 className="text-sm font-semibold text-on-surface">Backup &amp; restore</h3>
        <p className="mt-1 text-sm leading-6 text-outline">
          Export everything — your preferences and connected accounts — to a single file. Import it
          on another machine to pick up exactly where you left off.
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
            {confirmReset ? "Click again to wipe everything" : "Start from scratch"}
          </Button>
        </div>
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
          <CardTitle className="text-xl text-on-surface">Profile</CardTitle>
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

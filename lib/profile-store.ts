"use client";

/**
 * Browser binding for the profile core. Everything that touches localStorage, the DOM, or
 * file download/upload lives here so `src/profile/profile.ts` stays pure and testable.
 *
 * Storage layout (all under the existing `financial-copilot.` namespace):
 *   financial-copilot.profile                       — the JSON profile
 *   financial-copilot.welcome-seen                  — "true" once onboarding is dismissed
 *   financial-copilot.integration-fields.{service}  — optional connection-test fields
 */

import {
  INTEGRATION_SERVICES,
  buildBackup,
  createDefaultProfile,
  normalizeProfile,
  parseBackup,
  serializeBackup,
  type Backup,
  type IntegrationBackup,
  type ParseResult,
  type Profile,
  type ProfilePreferences,
} from "@/src/profile/profile";

const PROFILE_KEY = "financial-copilot.profile";
const WELCOME_SEEN_KEY = "financial-copilot.welcome-seen";
const fieldsFor = (service: string) => `financial-copilot.integration-fields.${service}`;

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadProfile(): Profile | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function persistProfile(profile: Profile): Profile {
  const next: Profile = { ...profile, updated_at: new Date().toISOString() };
  if (isBrowser()) {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  }
  return next;
}

export function createProfile(fields: { name?: string; preferences?: Partial<ProfilePreferences> }): Profile {
  return persistProfile(createDefaultProfile(fields));
}

export function hasSeenWelcome(): boolean {
  return isBrowser() && window.localStorage.getItem(WELCOME_SEEN_KEY) === "true";
}

export function markWelcomeSeen(): void {
  if (isBrowser()) window.localStorage.setItem(WELCOME_SEEN_KEY, "true");
}

/** Read saved local fields for every known integration service. */
export function loadIntegrationsBackup(): IntegrationBackup[] {
  if (!isBrowser()) return [];
  return INTEGRATION_SERVICES.map((service) => ({
    service,
    connected: false,
    key: window.localStorage.getItem(fieldsFor(service)) ?? "",
  }));
}

export function applyIntegrationsBackup(integrations: IntegrationBackup[]): void {
  if (!isBrowser()) return;
  for (const item of integrations) {
    window.localStorage.setItem(fieldsFor(item.service), item.key);
  }
}

/** Snapshot the local setup (profile + saved test fields) into a backup envelope. */
export function snapshotBackup(profile: Profile): Backup {
  return buildBackup(profile, loadIntegrationsBackup());
}

/** Restore profile + saved test fields from a validated backup, and mark onboarding complete. */
export function applyBackup(backup: Backup): Profile {
  applyIntegrationsBackup(backup.integrations);
  markWelcomeSeen();
  return persistProfile(backup.profile);
}

/** Trigger a browser download of the current setup as a .json file. */
export function downloadBackup(profile: Profile): void {
  if (!isBrowser()) return;
  const backup = snapshotBackup(profile);
  const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `mastermold-profile-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Read + validate an uploaded backup file. */
export async function readBackupFile(file: File): Promise<ParseResult> {
  const text = await file.text();
  return parseBackup(text);
}

/** Wipe the profile and saved connection-test fields — a true "start from scratch". */
export function resetEverything(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(PROFILE_KEY);
  window.localStorage.removeItem(WELCOME_SEEN_KEY);
  for (const service of INTEGRATION_SERVICES) {
    window.localStorage.removeItem(fieldsFor(service));
  }
}

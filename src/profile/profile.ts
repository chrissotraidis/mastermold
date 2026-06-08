import { z } from "zod";

/**
 * Profile core — pure, DOM-free, and unit-testable.
 *
 * A profile holds *who the operator is* and *how they want Master Mold to behave*: a name,
 * a few soft preferences, and (for portability) the set of accounts they connect. None of
 * this is required to run the app — Master Mold boots on seeded demo data with no profile —
 * but having one makes the experience personal and, crucially, lets a person back the whole
 * thing up and restore it on another machine.
 *
 * Everything here is a plain function over plain data so it can be exercised without a
 * browser. The localStorage binding lives in `lib/profile-store.ts`.
 */

export const BACKUP_SCHEMA = "mastermold.profile" as const;
export const BACKUP_VERSION = 1 as const;

/** The accounts a profile can connect. Mirrors the integration services in src/db/integrations.ts. */
export const INTEGRATION_SERVICES = ["coinbase", "robinhood", "onchain_wallet", "llm"] as const;
export type IntegrationService = (typeof INTEGRATION_SERVICES)[number];

export const RISK_POSTURES = ["conservative", "balanced", "aggressive"] as const;
export type RiskPosture = (typeof RISK_POSTURES)[number];

export const ASSET_FOCUSES = ["equities", "crypto", "both"] as const;
export type AssetFocus = (typeof ASSET_FOCUSES)[number];

export const preferencesSchema = z.object({
  risk_posture: z.enum(RISK_POSTURES).catch("balanced"),
  asset_focus: z.enum(ASSET_FOCUSES).catch("both"),
});
export type ProfilePreferences = z.infer<typeof preferencesSchema>;

export const profileSchema = z.object({
  name: z.string().max(120).catch(""),
  preferences: preferencesSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

export const integrationBackupSchema = z.object({
  service: z.string(),
  connected: z.boolean().catch(false),
  key: z.string().catch(""),
});
export type IntegrationBackup = z.infer<typeof integrationBackupSchema>;

export const backupSchema = z.object({
  schema: z.literal(BACKUP_SCHEMA),
  version: z.number(),
  exported_at: z.string(),
  profile: profileSchema,
  integrations: z.array(integrationBackupSchema).catch([]),
});
export type Backup = z.infer<typeof backupSchema>;

export const DEFAULT_PREFERENCES: ProfilePreferences = {
  risk_posture: "balanced",
  asset_focus: "both",
};

/** Create a fresh profile. `now` is injectable so callers (and tests) stay deterministic. */
export function createDefaultProfile(
  fields: { name?: string; preferences?: Partial<ProfilePreferences> } = {},
  now: string = new Date().toISOString(),
): Profile {
  return {
    name: (fields.name ?? "").trim().slice(0, 120),
    preferences: { ...DEFAULT_PREFERENCES, ...fields.preferences },
    created_at: now,
    updated_at: now,
  };
}

/** Coerce arbitrary (possibly partial/legacy) data into a valid profile, or null if unusable. */
export function normalizeProfile(raw: unknown, now: string = new Date().toISOString()): Profile | null {
  if (raw === null || typeof raw !== "object") return null;
  const seeded = {
    name: "",
    preferences: DEFAULT_PREFERENCES,
    created_at: now,
    updated_at: now,
    ...(raw as Record<string, unknown>),
  };
  const parsed = profileSchema.safeParse(seeded);
  return parsed.success ? parsed.data : null;
}

/** Build a backup envelope from a profile and its connected accounts. */
export function buildBackup(
  profile: Profile,
  integrations: IntegrationBackup[],
  exportedAt: string = new Date().toISOString(),
): Backup {
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    profile,
    integrations,
  };
}

/** Serialize a backup to a pretty JSON string suitable for a downloaded file. */
export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

export type ParseResult =
  | { ok: true; backup: Backup }
  | { ok: false; error: string };

/**
 * Parse and validate an untrusted backup file. Tolerant of extra/missing soft fields, strict
 * about the envelope (schema marker + a usable profile) so a wrong file fails loudly.
 */
export function parseBackup(json: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }

  if (data === null || typeof data !== "object") {
    return { ok: false, error: "That file doesn't look like a Master Mold backup." };
  }

  if ((data as Record<string, unknown>).schema !== BACKUP_SCHEMA) {
    return { ok: false, error: "That file isn't a Master Mold profile backup." };
  }

  const parsed = backupSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "This backup is missing required profile fields." };
  }

  return { ok: true, backup: parsed.data };
}

/** Human summary of how many accounts a backup carries a key for — used in import confirmation copy. */
export function summarizeBackup(backup: Backup): string {
  const connected = backup.integrations.filter((i) => i.connected).length;
  const withKeys = backup.integrations.filter((i) => i.key.length > 0).length;
  const parts = [`${connected} connected account${connected === 1 ? "" : "s"}`];
  if (withKeys > 0) parts.push(`${withKeys} saved key${withKeys === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

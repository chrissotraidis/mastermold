/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  buildBackup,
  createDefaultProfile,
  normalizeProfile,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type IntegrationBackup,
} from "../src/profile/profile";

const NOW = "2026-06-07T12:00:00.000Z";

const sampleIntegrations: IntegrationBackup[] = [
  { service: "coinbase", connected: true, key: "cb-key" },
  { service: "robinhood", connected: false, key: "" },
  { service: "llm", connected: false, key: "sk-test" },
];

describe("profile core", () => {
  test("createDefaultProfile produces a valid, balanced profile with deterministic timestamps", () => {
    const profile = createDefaultProfile({ name: "  Ada  " }, NOW);
    expect(profile.name).toBe("Ada");
    expect(profile.preferences.risk_posture).toBe("balanced");
    expect(profile.preferences.asset_focus).toBe("both");
    expect(profile.created_at).toBe(NOW);
    expect(profile.updated_at).toBe(NOW);
  });

  test("createDefaultProfile honors provided preferences and caps name length", () => {
    const profile = createDefaultProfile(
      { name: "x".repeat(500), preferences: { risk_posture: "aggressive" } },
      NOW,
    );
    expect(profile.name.length).toBe(120);
    expect(profile.preferences.risk_posture).toBe("aggressive");
    expect(profile.preferences.asset_focus).toBe("both");
  });

  test("a backup round-trips through serialize and parse without loss", () => {
    const profile = createDefaultProfile({ name: "Ada", preferences: { asset_focus: "crypto" } }, NOW);
    const backup = buildBackup(profile, sampleIntegrations, NOW);
    const json = serializeBackup(backup);

    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.backup.schema).toBe(BACKUP_SCHEMA);
    expect(result.backup.version).toBe(BACKUP_VERSION);
    expect(result.backup.profile.name).toBe("Ada");
    expect(result.backup.profile.preferences.asset_focus).toBe("crypto");
    expect(result.backup.integrations).toHaveLength(3);
    expect(result.backup.integrations[0]).toEqual({ service: "coinbase", connected: true, key: "cb-key" });
  });

  test("parseBackup rejects non-JSON input", () => {
    const result = parseBackup("not json {");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("JSON");
  });

  test("parseBackup rejects a file without the Master Mold schema marker", () => {
    const result = parseBackup(JSON.stringify({ version: 1, profile: {} }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Master Mold");
  });

  test("parseBackup rejects a backup whose profile is unusable", () => {
    const result = parseBackup(
      JSON.stringify({ schema: BACKUP_SCHEMA, version: 1, exported_at: NOW, profile: 42 }),
    );
    expect(result.ok).toBe(false);
  });

  test("parseBackup tolerates unknown extra fields and missing soft fields (forward-compatible)", () => {
    const result = parseBackup(
      JSON.stringify({
        schema: BACKUP_SCHEMA,
        version: 99,
        exported_at: NOW,
        future_field: "ignored",
        profile: { name: "Grace", preferences: {}, created_at: NOW, updated_at: NOW },
        integrations: [{ service: "coinbase" }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // defaults fill in for missing preference and integration fields
    expect(result.backup.profile.preferences.risk_posture).toBe("balanced");
    expect(result.backup.integrations[0].connected).toBe(false);
    expect(result.backup.integrations[0].key).toBe("");
  });

  test("normalizeProfile repairs partial data and rejects non-objects", () => {
    const repaired = normalizeProfile({ name: "Lin" }, NOW);
    expect(repaired?.name).toBe("Lin");
    expect(repaired?.preferences.risk_posture).toBe("balanced");
    expect(normalizeProfile("nope", NOW)).toBeNull();
    expect(normalizeProfile(null, NOW)).toBeNull();
  });

  test("summarizeBackup counts connected accounts and saved keys", () => {
    const profile = createDefaultProfile({ name: "Ada" }, NOW);
    const backup = buildBackup(profile, sampleIntegrations, NOW);
    expect(summarizeBackup(backup)).toBe("1 connected account · 2 saved keys");
  });
});

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Backup, Profile, ProfilePreferences } from "@/src/profile/profile";
import {
  applyBackup as applyBackupToStore,
  createProfile as createProfileInStore,
  downloadBackup,
  hasSeenWelcome as readWelcomeSeen,
  loadProfile,
  markWelcomeSeen as markWelcomeSeenInStore,
  persistProfile,
  readBackupFile,
  resetEverything,
} from "@/lib/profile-store";
import type { ParseResult } from "@/src/profile/profile";

type ProfileContextValue = {
  /** False until localStorage has been read on the client — gate UI on this to avoid hydration flashes. */
  ready: boolean;
  profile: Profile | null;
  hasProfile: boolean;
  welcomeSeen: boolean;
  createProfile: (fields: { name?: string; preferences?: Partial<ProfilePreferences> }) => Profile;
  updateProfile: (next: Profile) => Profile;
  dismissWelcome: () => void;
  exportProfile: () => void;
  importBackupFile: (file: File) => Promise<ParseResult>;
  applyBackup: (backup: Backup) => Profile;
  resetProfile: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [welcomeSeen, setWelcomeSeen] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setWelcomeSeen(readWelcomeSeen());
    setReady(true);
  }, []);

  const createProfile = useCallback(
    (fields: { name?: string; preferences?: Partial<ProfilePreferences> }) => {
      const created = createProfileInStore(fields);
      markWelcomeSeenInStore();
      setProfile(created);
      setWelcomeSeen(true);
      return created;
    },
    [],
  );

  const updateProfile = useCallback((next: Profile) => {
    const saved = persistProfile(next);
    setProfile(saved);
    return saved;
  }, []);

  const dismissWelcome = useCallback(() => {
    markWelcomeSeenInStore();
    setWelcomeSeen(true);
  }, []);

  const exportProfile = useCallback(() => {
    if (profile) downloadBackup(profile);
  }, [profile]);

  const importBackupFile = useCallback((file: File) => readBackupFile(file), []);

  const applyBackup = useCallback((backup: Backup) => {
    const restored = applyBackupToStore(backup);
    setProfile(restored);
    setWelcomeSeen(true);
    return restored;
  }, []);

  const resetProfile = useCallback(() => {
    resetEverything();
    setProfile(null);
    setWelcomeSeen(false);
  }, []);

  const value = useMemo<ProfileContextValue>(
    () => ({
      ready,
      profile,
      hasProfile: profile !== null,
      welcomeSeen,
      createProfile,
      updateProfile,
      dismissWelcome,
      exportProfile,
      importBackupFile,
      applyBackup,
      resetProfile,
    }),
    [ready, profile, welcomeSeen, createProfile, updateProfile, dismissWelcome, exportProfile, importBackupFile, applyBackup, resetProfile],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return ctx;
}

export function useOptionalProfile(): ProfileContextValue {
  return useContext(ProfileContext) ?? {
    ready: false,
    profile: null,
    hasProfile: false,
    welcomeSeen: false,
    createProfile: () => {
      throw new Error("createProfile requires ProfileProvider");
    },
    updateProfile: () => {
      throw new Error("updateProfile requires ProfileProvider");
    },
    dismissWelcome: () => {},
    exportProfile: () => {},
    importBackupFile: async () => ({ ok: false, error: "ProfileProvider is not ready." }),
    applyBackup: () => {
      throw new Error("applyBackup requires ProfileProvider");
    },
    resetProfile: () => {},
  };
}

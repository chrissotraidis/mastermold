"use client";

import { useProfile } from "@/components/profile-provider";

/**
 * A small personalized eyebrow above the deck greeting. Renders nothing on the server and
 * until the profile has loaded client-side, so it never causes a hydration mismatch.
 */
export function ProfileGreeting() {
  const { ready, profile } = useProfile();
  const firstName = profile?.name.trim().split(/\s+/)[0];

  if (!ready || !firstName) return null;

  return (
    <p className="mb-1 font-mono text-[11px] uppercase tracking-telemetry text-violet">
      Welcome back, {firstName}
    </p>
  );
}

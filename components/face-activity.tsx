"use client";

import { createContext, useContext, useMemo, useState } from "react";

/**
 * Shared "is Master Mold speaking right now" flag. The chat sets it while a reply streams;
 * the persistent top-bar face reads it and flickers its vocal grille — so he visibly
 * responds anywhere in the app, not just on the chat page.
 */
type FaceActivity = {
  speaking: boolean;
  setSpeaking: (value: boolean) => void;
};

const FaceActivityContext = createContext<FaceActivity | null>(null);

export function FaceActivityProvider({ children }: { children: React.ReactNode }) {
  const [speaking, setSpeaking] = useState(false);
  const value = useMemo(() => ({ speaking, setSpeaking }), [speaking]);
  return <FaceActivityContext.Provider value={value}>{children}</FaceActivityContext.Provider>;
}

/** Safe to call outside the provider — returns an inert default so faces still render. */
export function useFaceActivity(): FaceActivity {
  return useContext(FaceActivityContext) ?? { speaking: false, setSpeaking: () => {} };
}

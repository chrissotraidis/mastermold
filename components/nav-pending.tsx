"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Instant click feedback for navigation. `useLinkStatus` flips to `pending` the
 * moment a Link is clicked — before the server responds — so a nav click reads
 * as responsive instead of frozen during the ~60-100ms round-trip. Must render
 * as a descendant of the <Link> it reports on.
 */

/** A tiny pending dot so nav clicks feel responsive without looking like a slider. */
export function NavPendingBar({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute right-1 top-1 size-1.5 rounded-full bg-violet", className)}
    />
  );
}

/** Dims and softly pulses the nav item while its destination loads. */
export function NavPendingState({ children }: { children: (pending: boolean) => React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <>{children(pending)}</>;
}

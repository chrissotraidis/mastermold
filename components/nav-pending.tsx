"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Instant click feedback for navigation. `useLinkStatus` flips to `pending` the
 * moment a Link is clicked — before the server responds — so a nav click reads
 * as responsive instead of frozen during the ~60-100ms round-trip. Must render
 * as a descendant of the <Link> it reports on.
 */

/** A thin progress sliver along the bottom edge of the active nav item. */
export function NavPendingBar({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-x-1 bottom-0 h-0.5 overflow-hidden rounded-full", className)}
    >
      <span className="block h-full w-full origin-left animate-nav-progress bg-violet" />
    </span>
  );
}

/** Dims and softly pulses the nav item while its destination loads. */
export function NavPendingState({ children }: { children: (pending: boolean) => React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <>{children(pending)}</>;
}

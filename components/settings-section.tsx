"use client";

import { useEffect, useRef, useState } from "react";
import {
  LOCAL_HASH_TARGET_EVENT,
  type LocalHashTargetEventDetail,
} from "@/lib/client-hash-scroll";
import { cn } from "@/lib/utils";

type SettingsSectionTone = "ok" | "watch" | "muted";

type SettingsSectionProps = {
  id: string;
  title: string;
  status?: string;
  statusTone?: SettingsSectionTone;
  // Inner anchor ids (legacy deep links, routed command hashes) that should
  // open this section when targeted.
  aliases?: string[];
  defaultOpen?: boolean;
  children: React.ReactNode;
};

const toneClasses: Record<SettingsSectionTone, string> = {
  ok: "text-engine",
  watch: "text-caution",
  muted: "text-outline",
};

export function SettingsSection({
  id,
  title,
  status,
  statusTone = "muted",
  aliases = [],
  defaultOpen = false,
  children,
}: SettingsSectionProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const aliasKey = aliases.join(",");

  useEffect(() => {
    const targets = new Set([id, ...aliasKey.split(",").filter(Boolean)]);

    function openTarget(target: string) {
      if (!targets.has(target)) return;

      setOpen(true);
      window.requestAnimationFrame(() => {
        detailsRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
      });
    }

    function openHashTarget() {
      openTarget(decodeURIComponent(window.location.hash.replace(/^#/, "")));
    }

    function openCommandHashTarget(event: Event) {
      const detail = (event as CustomEvent<LocalHashTargetEventDetail>).detail;
      if (!detail?.id) return;
      openTarget(detail.id);
    }

    openHashTarget();
    window.addEventListener("hashchange", openHashTarget);
    window.addEventListener(LOCAL_HASH_TARGET_EVENT, openCommandHashTarget);
    return () => {
      window.removeEventListener("hashchange", openHashTarget);
      window.removeEventListener(LOCAL_HASH_TARGET_EVENT, openCommandHashTarget);
    };
  }, [id, aliasKey]);

  // Children stay mounted while closed (native details hides them) so routed
  // command actions land on live forms and legacy anchor ids stay in the DOM.
  return (
    <details
      ref={detailsRef}
      id={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group scroll-mt-24"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <h2 id={`${id}-title`} className="shrink-0 text-sm font-semibold text-on-surface">
          {title}
        </h2>
        <span className={cn("min-w-0 flex-1 truncate text-right text-xs", toneClasses[statusTone])}>
          {status ?? ""}
        </span>
        <span aria-hidden="true" className="shrink-0 text-xs text-outline transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-outline-variant/15 px-3 pb-3 pt-2">{children}</div>
    </details>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  LOCAL_HASH_TARGET_EVENT,
  type LocalHashTargetEventDetail,
} from "@/lib/client-hash-scroll";

type SettingsSectionProps = {
  id: string;
  title: string;
  purpose: string;
  nextAction: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function SettingsSection({
  id,
  title,
  purpose,
  nextAction,
  defaultOpen = false,
  children,
}: SettingsSectionProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    function openTarget(target: string) {
      if (target !== id) return;

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
  }, [id]);

  return (
    <details
      ref={detailsRef}
      id={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group scroll-mt-24 rounded-md border border-outline-variant/40 bg-surface-high/20 p-4"
    >
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3 marker:hidden">
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-on-surface">
            {title}
          </h2>
        </div>
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-outline-variant/35 text-outline transition group-open:rotate-180 group-hover:border-violet/45 group-hover:text-violet"
          aria-hidden="true"
        >
          <ChevronDown className="size-4" />
        </span>
      </summary>
      {open ? (
        <p className="mt-3 max-w-3xl text-sm leading-5 text-on-surface-variant">{purpose}</p>
      ) : null}
      <p className="mt-3 rounded-md border border-violet/25 bg-violet/[0.045] px-3 py-2 text-xs leading-5 text-on-surface-variant">
        <span className="font-semibold text-on-surface">Next: </span>
        {nextAction}
      </p>
      {open ? <div className="pt-4">{children}</div> : null}
    </details>
  );
}

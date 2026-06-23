"use client";

export const LOCAL_HASH_TARGET_EVENT = "master-mold-local-hash-target";

export type LocalHashTargetEventDetail = {
  id: string;
  href: string;
};

export function scrollLocalHashIntoView(href: string) {
  if (typeof window === "undefined") return;

  const destination = new URL(href, window.location.href);
  if (!destination.hash || destination.pathname !== window.location.pathname) return;

  const id = decodeURIComponent(destination.hash.slice(1));
  const notify = () => {
    const event =
      typeof window.CustomEvent === "function"
        ? new CustomEvent<LocalHashTargetEventDetail>(LOCAL_HASH_TARGET_EVENT, {
            detail: { id, href },
          })
        : Object.assign(new Event(LOCAL_HASH_TARGET_EVENT), {
            detail: { id, href },
          });
    window.dispatchEvent(event);
  };
  const scroll = () => {
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  };

  notify();
  window.requestAnimationFrame(() => {
    notify();
    scroll();
  });
  window.setTimeout(() => {
    notify();
    scroll();
  }, 80);
}

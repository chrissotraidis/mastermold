"use client";

import { scrollLocalHashIntoView } from "@/lib/client-hash-scroll";
import {
  hrefWithMasterMoldCommandHandoff,
  rememberMasterMoldCommandHandoff,
} from "@/lib/master-mold-command-handoff";

export type MasterMoldCommandRoute = {
  label: string;
  href: string;
};

type MasterMoldCommandRouter = {
  push: (href: string) => void;
};

export function openMasterMoldCommandRoute(
  router: MasterMoldCommandRouter,
  route: MasterMoldCommandRoute,
) {
  rememberMasterMoldCommandHandoff(route);
  const handoffHref = hrefWithMasterMoldCommandHandoff(route);
  router.push(handoffHref);
  scrollLocalHashIntoView(handoffHref);
  ensureMasterMoldRouteNavigation(router, handoffHref);
  return handoffHref;
}

function ensureMasterMoldRouteNavigation(router: MasterMoldCommandRouter, href: string) {
  if (typeof window === "undefined") return;

  window.requestAnimationFrame(() => {
    if (isCurrentCommandHref(href)) return;
    router.push(href);
  });

  window.setTimeout(() => {
    if (isCurrentCommandHref(href)) return;
    window.location.assign(href);
  }, 450);
}

function isCurrentCommandHref(href: string) {
  if (typeof window === "undefined") return true;

  const target = new URL(href, window.location.href);
  return (
    target.pathname === window.location.pathname &&
    target.search === window.location.search &&
    (!target.hash || target.hash === window.location.hash)
  );
}

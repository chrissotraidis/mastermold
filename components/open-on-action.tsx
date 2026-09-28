"use client";

import { useEffect } from "react";

/**
 * Details elements marked data-open-on-action stay collapsed unless the page
 * was opened by a routed command (?action=...), which needs its form visible.
 */
export function OpenOnAction() {
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("action")) return;
    document.querySelectorAll<HTMLDetailsElement>("details[data-open-on-action]").forEach((el) => {
      el.open = true;
    });
  }, []);
  return null;
}

type PortfolioReadinessInput = {
  provenance: {
    label: "Demo data" | "Manual portfolio" | "Imported portfolio";
  };
  manual_holdings: unknown[];
  imported_holdings: unknown[];
  import_snapshot: {
    status: string;
    is_stale: boolean;
  };
};

type DataModeReadinessInput = {
  label: "Engine output" | "Demo data";
};

type BrainReadinessInput = {
  initialized: boolean;
  summary: {
    snapshot_freshness: string;
  };
  schedule: {
    enabled: boolean;
    status: string;
  };
};

export type TodayReadiness = {
  title: string;
  label: string;
  detail: string;
  action: string;
  href: string;
};

export function buildTodayReadiness({
  portfolio,
  dataMode,
  brain,
}: {
  portfolio: PortfolioReadinessInput;
  dataMode: DataModeReadinessInput;
  brain: BrainReadinessInput;
}): TodayReadiness {
  if (portfolio.provenance.label === "Demo data") {
    return {
      title: "Add portfolio context",
      label: "Sample read",
      detail: "Add a manual holding or import a holdings snapshot before treating Today as personal.",
      action: "Add holdings",
      href: "/portfolio",
    };
  }

  if (portfolio.provenance.label === "Imported portfolio" && portfolio.import_snapshot.is_stale) {
    return {
      title: "Refresh account snapshot",
      label: "Refresh imports",
      detail: `${portfolio.import_snapshot.status}. Import again before relying on this read.`,
      action: "Open Settings",
      href: "/settings/integrations",
    };
  }

  if (!brain.initialized) {
    return {
      title: "Save context for chat",
      label: "Chat has no saved context yet",
      detail: "Use Save context for chat here, or open Settings for Chat context controls.",
      action: "Open memory settings",
      href: "/settings/integrations",
    };
  }

  if (dataMode.label !== "Engine output") {
    return {
      title: "Market context is sample",
      label: "Sample market context",
      detail: "The portfolio can be personal, but Today and Alerts still use sample market examples until a saved read exists.",
      action: "See what is real",
      href: "/review",
    };
  }

  if (!brain.schedule.enabled) {
    return {
      title: "Keep chat context current",
      label: "Saved app context",
      detail: `${brain.summary.snapshot_freshness}. Save context for chat when you want Master Mold to remember the current view.`,
      action: "See limits",
      href: "/review",
    };
  }

  return {
    title: "Chat context check",
    label: "Chat context check armed",
    detail: `${brain.summary.snapshot_freshness}. The local check can refresh chat context when called; it does not refresh accounts or fetch fresh news.`,
    action: "Review context",
    href: "/settings/integrations",
  };
}

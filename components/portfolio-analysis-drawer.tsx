"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

type PortfolioAnalysisDrawerProps = {
  manualHoldings: ReactNode;
  policies: ReactNode;
  context: ReactNode;
  recommendations: ReactNode;
  charts: ReactNode;
  replay: ReactNode;
};

const openHashes = new Set(["#add-holdings", "#position-policies", "#portfolio-chart", "#portfolio-review-context"]);
type ReviewToolSection = "manual" | "policies" | "context" | "charts" | null;

export function PortfolioAnalysisDrawer({
  manualHoldings,
  policies,
  context,
  recommendations,
  charts,
  replay,
}: PortfolioAnalysisDrawerProps) {
  const [open, setOpen] = useState(false);
  const [openSection, setOpenSection] = useState<ReviewToolSection>(null);

  useEffect(() => {
    function syncOpenState() {
      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash;
      if (openHashes.has(hash) || params.get("action") === "add-holding") {
        setOpen(true);
      }
      if (hash === "#add-holdings" || params.get("action") === "add-holding") {
        setOpenSection("manual");
      } else if (hash === "#position-policies") {
        setOpenSection("policies");
      } else if (hash === "#portfolio-review-context") {
        setOpenSection("context");
      } else if (hash === "#portfolio-chart") {
        setOpenSection("charts");
      }
    }

    syncOpenState();
    window.addEventListener("hashchange", syncOpenState);
    return () => window.removeEventListener("hashchange", syncOpenState);
  }, []);

  return (
    <section className="mt-5 scroll-mt-28" aria-labelledby="portfolio-review-tools-title">
      <details
        id="portfolio-review-tools"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="rounded-lg border border-outline-variant/25 bg-surface-high/10 ring-1 ring-violet/5"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-on-surface marker:hidden sm:min-h-14 sm:px-5 sm:py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span id="portfolio-review-tools-title" className="block font-display text-lg font-semibold">
              Review tools
            </span>
            <span className="mt-0.5 block line-clamp-1 text-xs leading-5 text-outline sm:mt-1 sm:text-sm">
              Review prompts and optional setup.
            </span>
          </span>
          <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-violet/25 bg-violet/10 px-3 text-sm font-semibold text-violet">
            {open ? "Close" : "Open"}
            <ChevronDown aria-hidden="true" className={open ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} />
          </span>
        </summary>

        <div className="grid gap-2 border-t border-outline-variant/25 p-2 sm:gap-3 sm:p-4">
          {recommendations}
          <ReviewToolDisclosure
            title="Add or edit holdings"
            detail="Manual entries used by Portfolio, Today, and chat."
            open={openSection === "manual"}
            onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "manual" : null)}
          >
            {manualHoldings}
          </ReviewToolDisclosure>
          <ReviewToolDisclosure
            id="position-policies"
            title="Position policies"
            detail="Your standing hold, trim, and exit rules per symbol."
            open={openSection === "policies"}
            onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "policies" : null)}
          >
            {policies}
          </ReviewToolDisclosure>
          <ReviewToolDisclosure
            id="portfolio-review-context"
            title="Source context"
            detail="Accounts, concentration, and scan comparison context."
            open={openSection === "context"}
            onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "context" : null)}
          >
            <div className="space-y-4">
              {context}
            </div>
          </ReviewToolDisclosure>
          <ReviewToolDisclosure
            id="portfolio-chart"
            title="Charts and past views"
            detail="Allocation, net worth, and rewind checks."
            open={openSection === "charts"}
            onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "charts" : null)}
          >
            {charts}
            <div className="mt-4 border-t border-outline-variant/25 pt-4">
              {replay}
            </div>
          </ReviewToolDisclosure>
        </div>
      </details>
    </section>
  );
}

function ReviewToolDisclosure({
  children,
  detail,
  id,
  onOpenChange,
  open,
  title,
}: {
  children: ReactNode;
  detail: string;
  id?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      className="group scroll-mt-28 rounded-md border border-outline-variant/25 bg-surface-dim/20"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-1.5 text-on-surface transition hover:text-violet marker:hidden sm:min-h-14 sm:px-4 sm:py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="mt-0.5 block line-clamp-1 text-xs leading-5 text-outline">{detail}</span>
        </span>
        <ChevronDown aria-hidden="true" className={open ? "size-4 shrink-0 rotate-180 text-outline transition-transform" : "size-4 shrink-0 text-outline transition-transform"} />
      </summary>
      <div className="border-t border-outline-variant/25 p-3 sm:p-4">
        {children}
      </div>
    </details>
  );
}

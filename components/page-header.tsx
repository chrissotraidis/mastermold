import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommandConsole, type CommandSuggestion } from "@/components/command-console";
import { ProvenanceChip, type ProvenanceLabel } from "@/components/provenance-chip";
import type { ChatPageContext } from "@/src/db/chat";

/**
 * One terse, consistent page header. Title + optional one-line subtitle + provenance.
 * Replaces the verbose per-page headers (long paragraphs, API notes, raw field names).
 */
export function PageHeader({
  title,
  subtitle,
  provenance,
  right,
  command,
  back = true,
}: {
  title: string;
  subtitle?: string;
  provenance?: ProvenanceLabel;
  right?: React.ReactNode;
  command?: {
    pageContext: ChatPageContext;
    suggestions?: CommandSuggestion[];
    placeholder?: string;
    showSuggestions?: boolean;
    className?: string;
  };
  back?: boolean;
}) {
  return (
    <div className="mb-4">
      {back ? (
        <Link
          href="/"
          className="mb-1 hidden min-h-11 items-center gap-1.5 rounded-md pr-3 text-xs text-outline transition-colors hover:text-violet sm:inline-flex"
        >
          <ArrowLeft className="size-3.5" />
          Today
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-lg font-semibold tracking-tight text-on-surface">
              {title}
            </h1>
            {provenance ? <ProvenanceChip label={provenance} /> : null}
          </div>
          {subtitle ? (
            <p className="mt-0.5 max-w-2xl break-words text-xs leading-5 text-on-surface-variant">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {command ? (
        <CommandConsole
          className={["mt-3 max-w-2xl sm:mt-4", command.className].filter(Boolean).join(" ")}
          pageContext={command.pageContext}
          suggestions={command.suggestions}
          placeholder={command.placeholder}
          showSuggestions={command.showSuggestions}
        />
      ) : null}
    </div>
  );
}

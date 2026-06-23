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
  };
  back?: boolean;
}) {
  return (
    <div className="mb-6">
      {back ? (
        <Link
          href="/"
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md pr-3 text-sm text-outline transition-colors hover:text-violet"
        >
          <ArrowLeft className="size-4" />
          Today
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">
              {title}
            </h1>
            {provenance ? <ProvenanceChip label={provenance} /> : null}
          </div>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {command ? (
        <CommandConsole
          className="mt-4 max-w-2xl"
          pageContext={command.pageContext}
          suggestions={command.suggestions}
          placeholder={command.placeholder}
        />
      ) : null}
    </div>
  );
}

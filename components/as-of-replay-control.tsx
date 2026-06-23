"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { History, RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AsOfReplayControlProps = {
  activeAsOf: string | null;
  apiPath: "/api/briefing" | "/api/portfolio" | "/api/journal" | "/api/paper" | "/api/executor" | "/api/chat";
};

export function AsOfReplayControl({ activeAsOf, apiPath }: AsOfReplayControlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(() => toDateTimeLocal(activeAsOf));
  const activeLabel = useMemo(
    () => (activeAsOf ? formatTimestamp(activeAsOf) : null),
    [activeAsOf],
  );

  useEffect(() => {
    setValue(toDateTimeLocal(activeAsOf));
  }, [activeAsOf]);

  function submitReplay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextAsOf = fromDateTimeLocal(value);
    if (!nextAsOf) {
      return;
    }

    const params = new URLSearchParams(searchParams);
    params.set("as_of", nextAsOf);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function clearReplay() {
    const params = new URLSearchParams(searchParams);
    params.delete("as_of");
    setValue("");

    startTransition(() => {
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <details id="past-view" className="group scroll-mt-28 border border-outline-variant/30 bg-surface-dim/40 chamfer-sm" data-testid="as-of-replay-control">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-2.5 text-sm text-on-surface-variant transition-colors hover:text-violet">
        <History aria-hidden="true" className="size-4 text-violet" />
        <span className="font-semibold text-on-surface">Past view</span>
        {activeLabel ? (
          <span className="min-w-0 break-words font-mono text-xs text-violet">Viewing {activeLabel}</span>
        ) : (
          <span className="text-xs text-outline">Optional timeline check</span>
        )}
      </summary>
      <form className="grid gap-3 border-t border-outline-variant/30 p-4 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] sm:items-end" onSubmit={submitReplay}>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${apiPath.slice(5)}-as-of`} className="text-xs text-outline">
            Point in time
          </Label>
          <Input
            id={`${apiPath.slice(5)}-as-of`}
            type="datetime-local"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="min-w-0 border-outline-variant/50 bg-surface-dim/80 text-on-surface"
          />
        </div>
        <Button type="submit" disabled={!value || isPending} className="min-h-11 w-full bg-violet text-void hover:bg-violet sm:w-auto">
          Show past view
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!activeAsOf || isPending}
          onClick={clearReplay}
          className="min-h-11 w-full border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60 sm:w-auto"
        >
          <RotateCcw aria-hidden="true" />
          Return to now
        </Button>
      </form>
    </details>
  );
}

function toDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value) {
    return null;
  }

  const timestamp = `${value}:00Z`;
  return Number.isNaN(Date.parse(timestamp)) ? null : timestamp;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

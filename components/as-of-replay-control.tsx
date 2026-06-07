"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { History, RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AsOfReplayControlProps = {
  activeAsOf: string | null;
  apiPath: "/api/portfolio" | "/api/journal";
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
    <details className="group border border-outline-variant/30 bg-surface-dim/40 chamfer-sm" open={Boolean(activeAsOf)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-on-surface-variant transition-colors hover:text-violet">
        <History aria-hidden="true" className="size-4 text-violet" />
        <span>Rewind</span>
        {activeLabel ? (
          <span className="font-mono text-xs text-violet">· viewing {activeLabel}</span>
        ) : (
          <span className="text-xs text-outline">— see this page as of an earlier time</span>
        )}
      </summary>
      <form className="flex flex-wrap items-end gap-2 border-t border-outline-variant/30 p-4" onSubmit={submitReplay}>
        <div className="space-y-1">
          <Label htmlFor={`${apiPath.slice(5)}-as-of`} className="text-xs text-outline">
            Point in time
          </Label>
          <Input
            id={`${apiPath.slice(5)}-as-of`}
            type="datetime-local"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="border-outline-variant/50 bg-surface-dim/80 text-on-surface"
          />
        </div>
        <Button type="submit" disabled={!value || isPending} className="bg-violet text-void hover:bg-violet">
          Go
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!activeAsOf || isPending}
          onClick={clearReplay}
          className="border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
        >
          <RotateCcw aria-hidden="true" />
          Now
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

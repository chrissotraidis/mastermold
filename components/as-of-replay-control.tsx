"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
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
    <section
      aria-labelledby={`${apiPath.slice(5)}-as-of-title`}
      className="rounded-lg border border-violet/30 bg-violet/10 p-4 sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet">
            Historical data replay
          </p>
          <h2 id={`${apiPath.slice(5)}-as-of-title`} className="text-xl font-semibold text-on-surface">
            Select as-of timestamp
          </h2>
          <p className="text-sm leading-6 text-on-surface-variant">
            View historical data by time. The page and {apiPath} apply the same
            knowledge_time filter, then clear filter to restore the current seeded view.
          </p>
          {activeLabel ? (
            <p className="text-sm font-semibold text-on-surface">As of {activeLabel}</p>
          ) : null}
        </div>

        <form className="grid gap-3 sm:grid-cols-[minmax(14rem,18rem)_auto_auto]" onSubmit={submitReplay}>
          <div className="space-y-2">
            <Label htmlFor={`${apiPath.slice(5)}-as-of`} className="text-on-surface">
              Timestamp
            </Label>
            <Input
              id={`${apiPath.slice(5)}-as-of`}
              type="datetime-local"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="border-outline-variant/50 bg-surface-dim/80 text-on-surface"
            />
          </div>
          <Button
            type="submit"
            disabled={!value || isPending}
            className="self-end bg-violet text-void hover:bg-violet"
          >
            View snapshot
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!activeAsOf || isPending}
            onClick={clearReplay}
            className="self-end border-outline-variant/50 bg-transparent text-on-surface hover:bg-surface-high/60"
          >
            <RotateCcw aria-hidden="true" />
            Clear filter
          </Button>
        </form>
      </div>
    </section>
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

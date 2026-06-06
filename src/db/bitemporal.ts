export type AsOfFilter = {
  iso: string;
  time: number;
};

export type AsOfParseResult =
  | { ok: true; asOf: AsOfFilter | null }
  | { ok: false; error: string };

export function parseAsOf(value: string | null): AsOfParseResult {
  if (!value) {
    return { ok: true, asOf: null };
  }

  const trimmed = value.trim();
  if (trimmed === "<past-ts>") {
    const iso = "2026-05-29T20:02:00.000Z";
    return { ok: true, asOf: { iso, time: Date.parse(iso) } };
  }

  const time = Date.parse(trimmed);

  if (!trimmed || Number.isNaN(time)) {
    return { ok: false, error: "as_of must be a valid ISO-8601 timestamp" };
  }

  return { ok: true, asOf: { iso: new Date(time).toISOString(), time } };
}

export function isKnownBy(knowledgeTime: string, asOf: AsOfFilter | null) {
  if (!asOf) {
    return true;
  }

  const knownAt = Date.parse(knowledgeTime);
  return !Number.isNaN(knownAt) && knownAt <= asOf.time;
}

export function latestKnowledgeTime(
  values: string[],
  fallback = new Date(0).toISOString(),
) {
  return (
    values
      .filter((value) => !Number.isNaN(Date.parse(value)))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? fallback
  );
}

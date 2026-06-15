"use client";

/**
 * A tiny module-scoped GET cache shared across component mounts.
 *
 * The app shell (top bar, alert bell, scan status) is rendered per page, so it
 * re-mounts on every navigation — without this, each click re-fires the same
 * `/api/alerts` and `/api/scan` GETs, adding latency and shell flicker mid
 * transition. The cache de-dupes in-flight requests and serves a fresh-enough
 * result instantly on remount; a successful mutation invalidates the key so the
 * next read reflects it.
 */

type Entry = { ts: number; data: unknown; promise?: Promise<unknown> };

const store = new Map<string, Entry>();
const DEFAULT_TTL_MS = 15_000;

export async function cachedGetJson<T>(url: string, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const now = Date.now();
  const entry = store.get(url);

  if (entry && entry.data !== undefined && now - entry.ts < ttlMs) {
    return entry.data as T;
  }
  if (entry?.promise) {
    return entry.promise as Promise<T>;
  }

  const promise = fetch(url, { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      store.set(url, { ts: Date.now(), data });
      return data;
    })
    .catch((error) => {
      // Drop the failed in-flight entry so the next caller retries.
      store.delete(url);
      throw error;
    });

  store.set(url, { ts: now, data: entry?.data, promise });
  return promise as Promise<T>;
}

/** Synchronously read a cached value if one is still warm (for instant paint). */
export function peekCachedJson<T>(url: string, ttlMs = DEFAULT_TTL_MS): T | undefined {
  const entry = store.get(url);
  if (entry && entry.data !== undefined && Date.now() - entry.ts < ttlMs) {
    return entry.data as T;
  }
  return undefined;
}

/** Write a known-current value into the cache (e.g. after a local mutation). */
export function setCachedJson(url: string, data: unknown): void {
  store.set(url, { ts: Date.now(), data });
}

/** Invalidate a key after a mutation so the next read refetches. */
export function invalidateCachedJson(url: string): void {
  store.delete(url);
}

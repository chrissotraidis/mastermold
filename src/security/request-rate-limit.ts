import { isSafeMethod } from "./request-access";

type RateLimitInput = {
  method: string;
  pathname: string;
  identity: string;
  now?: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const buckets = new Map<string, Bucket>();

const LIMITS: Array<{ prefix: string; limit: number }> = [
  { prefix: "/api/notifications/test", limit: 5 },
  { prefix: "/api/scan", limit: 6 },
  { prefix: "/api/integrations/test", limit: 10 },
  { prefix: "/api/portfolio/import", limit: 10 },
  { prefix: "/api/brain/schedule", limit: 10 },
  { prefix: "/api/chat", limit: 30 },
  { prefix: "/api/autopilot", limit: 30 },
  { prefix: "/api/polymarket", limit: 30 },
];

export function rateLimitMutation(input: RateLimitInput): RateLimitDecision {
  if (isSafeMethod(input.method)) return unrestricted();

  const now = input.now ?? Date.now();
  const limit = limitForPath(input.pathname);
  const key = `${input.identity}:${input.pathname}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : current;

  bucket.count += 1;
  buckets.set(key, bucket);
  pruneExpiredBuckets(now);

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
  };
}

export function resetRateLimitsForTests() {
  buckets.clear();
}

function limitForPath(pathname: string): number {
  return LIMITS.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.limit ?? 120;
}

function unrestricted(): RateLimitDecision {
  return { allowed: true, limit: 0, remaining: 0, retryAfterSeconds: 0 };
}

function pruneExpiredBuckets(now: number) {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

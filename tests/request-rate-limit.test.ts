import { beforeEach, describe, expect, test } from "bun:test";
import {
  rateLimitMutation,
  resetRateLimitsForTests,
} from "../src/security/request-rate-limit";

describe("mutation rate limits", () => {
  beforeEach(() => resetRateLimitsForTests());

  test("safe requests are never counted", () => {
    for (let count = 0; count < 200; count += 1) {
      expect(rateLimitMutation({
        method: "GET",
        pathname: "/api/scan",
        identity: "loopback-operator",
        now: 1_000,
      }).allowed).toBe(true);
    }
  });

  test("expensive scans stop after six mutations per minute", () => {
    const attempts = Array.from({ length: 7 }, () => rateLimitMutation({
      method: "POST",
      pathname: "/api/scan",
      identity: "loopback-operator",
      now: 1_000,
    }));

    expect(attempts.slice(0, 6).every((attempt) => attempt.allowed)).toBe(true);
    expect(attempts[6]).toMatchObject({
      allowed: false,
      limit: 6,
      remaining: 0,
      retryAfterSeconds: 60,
    });
  });

  test("a new window resets the bucket", () => {
    for (let count = 0; count < 6; count += 1) {
      rateLimitMutation({
        method: "POST",
        pathname: "/api/scan",
        identity: "loopback-operator",
        now: 1_000,
      });
    }

    expect(rateLimitMutation({
      method: "POST",
      pathname: "/api/scan",
      identity: "loopback-operator",
      now: 61_000,
    }).allowed).toBe(true);
  });
});

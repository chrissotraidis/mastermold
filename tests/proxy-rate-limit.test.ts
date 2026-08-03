import { beforeEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { resetRateLimitsForTests } from "../src/security/request-rate-limit";

describe("proxy mutation rate limits", () => {
  beforeEach(() => {
    delete process.env.MASTERMOLD_BIND;
    resetRateLimitsForTests();
  });

  test("returns 429 with retry guidance after the scan budget is spent", async () => {
    const request = () => new NextRequest("http://127.0.0.1:4002/api/scan", {
      method: "POST",
      headers: { host: "127.0.0.1:4002" },
    });

    for (let count = 0; count < 6; count += 1) {
      expect(proxy(request()).status).toBe(200);
    }

    const rejected = proxy(request());
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBe("60");
    expect(rejected.headers.get("x-ratelimit-limit")).toBe("6");
    await expect(rejected.json()).resolves.toEqual({
      error: "Too many state-changing requests. Try again shortly.",
    });
  });
});

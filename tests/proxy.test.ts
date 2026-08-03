/// <reference types="bun" />

import { afterEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const previousBind = process.env.MASTERMOLD_BIND;

afterEach(() => {
  if (previousBind === undefined) delete process.env.MASTERMOLD_BIND;
  else process.env.MASTERMOLD_BIND = previousBind;
});

describe("application Proxy boundary", () => {
  test("loopback browser mutations reject a foreign Origin", async () => {
    delete process.env.MASTERMOLD_BIND;
    const response = proxy(new NextRequest("http://127.0.0.1:4002/api/brain/schedule", {
      method: "POST",
      headers: {
        host: "127.0.0.1:4002",
        origin: "https://evil.example",
      },
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "State changes require a matching same-origin request.",
    });
  });

  test("origin-less loopback automation remains available", () => {
    delete process.env.MASTERMOLD_BIND;
    const response = proxy(new NextRequest("http://127.0.0.1:4002/api/health", {
      method: "POST",
      headers: { host: "127.0.0.1:4002" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test("a remote Host receives an authentication challenge by default", async () => {
    const response = proxy(new NextRequest("http://127.0.0.1:4002/api/portfolio", {
      headers: { host: "mold.tailnet" },
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Master Mold");
    expect(await response.json()).toEqual({ error: "Authentication required." });
  });
});

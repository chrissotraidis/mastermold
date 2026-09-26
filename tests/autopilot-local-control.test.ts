/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { isAuthorizedLocalControlRequest } from "../app/api/autopilot/route";

const req = (url: string, headers: Record<string, string>) => new Request(url, { method: "POST", headers });

describe("autopilot local control origin check", () => {
  test("GIVEN the dev server reports localhost but the browser used 127.0.0.1 THEN a same-origin control is allowed", () => {
    expect(isAuthorizedLocalControlRequest(req("http://localhost:4002/api/autopilot", { host: "127.0.0.1:4002", origin: "http://127.0.0.1:4002" }))).toBe(true);
  });

  test("GIVEN a foreign origin, a mismatched port, a remote host, or no origin THEN it is refused", () => {
    expect(isAuthorizedLocalControlRequest(req("http://localhost:4002/api/autopilot", { host: "127.0.0.1:4002", origin: "http://evil.example" }))).toBe(false);
    expect(isAuthorizedLocalControlRequest(req("http://localhost:4002/api/autopilot", { host: "127.0.0.1:4002", origin: "http://127.0.0.1:5000" }))).toBe(false);
    expect(isAuthorizedLocalControlRequest(req("http://localhost:4002/api/autopilot", { host: "example.com:4002", origin: "http://example.com:4002" }))).toBe(false);
    expect(isAuthorizedLocalControlRequest(req("http://localhost:4002/api/autopilot", { host: "127.0.0.1:4002" }))).toBe(false);
  });
});

/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import {
  accessForRequest,
  isLoopbackHost,
  isSafeMethod,
  mutationHasSameOrigin,
} from "../src/security/request-access";

const operatorPassword = "operator-password-12345";
const viewerPassword = "viewer-password-123456";

function basic(username: string, password: string) {
  return "Basic " + Buffer.from(username + ":" + password).toString("base64");
}

describe("request access boundary", () => {
  test("loopback is an operator only while the process is loopback-bound", () => {
    expect(accessForRequest({ method: "GET", host: "127.0.0.1:4002", authorization: null }, {})).toEqual({
      role: "operator",
      local: true,
      reason: "loopback",
    });
    expect(
      accessForRequest(
        { method: "GET", host: "127.0.0.1:4002", authorization: null },
        { MASTERMOLD_BIND: "0.0.0.0" },
      ).role,
    ).toBe("denied");
  });

  test("remote operator and viewer roles require distinct long credentials", () => {
    const env = {
      MASTERMOLD_OPERATOR_PASSWORD: operatorPassword,
      MASTERMOLD_VIEWER_PASSWORD: viewerPassword,
    };
    expect(accessForRequest({ method: "GET", host: "mold.tailnet", authorization: basic("operator", operatorPassword) }, env).role).toBe("operator");
    expect(accessForRequest({ method: "GET", host: "mold.tailnet", authorization: basic("viewer", viewerPassword) }, env).role).toBe("viewer");
    expect(accessForRequest({ method: "GET", host: "mold.tailnet", authorization: basic("viewer", "wrong-password-123") }, env).role).toBe("denied");
    expect(accessForRequest({ method: "GET", host: "mold.tailnet", authorization: basic("operator", "short") }, { MASTERMOLD_OPERATOR_PASSWORD: "short" }).role).toBe("denied");
  });

  test("unsafe remote requests require the exact forwarded origin", () => {
    expect(mutationHasSameOrigin({
      method: "POST",
      host: "127.0.0.1:4002",
      forwardedHost: "mold.example",
      forwardedProto: "https",
      origin: "https://mold.example",
    })).toBe(true);
    expect(mutationHasSameOrigin({
      method: "POST",
      host: "127.0.0.1:4002",
      forwardedHost: "mold.example",
      forwardedProto: "https",
      origin: "https://evil.example",
    })).toBe(false);
    expect(mutationHasSameOrigin({
      method: "POST",
      host: "mold.example",
      forwardedHost: null,
      forwardedProto: "https",
      origin: null,
    })).toBe(false);
  });

  test("safe methods and loopback host parsing are explicit", () => {
    expect(isSafeMethod("HEAD")).toBe(true);
    expect(isSafeMethod("POST")).toBe(false);
    expect(isLoopbackHost("localhost:4002")).toBe(true);
    expect(isLoopbackHost("[::1]:4002")).toBe(true);
    expect(isLoopbackHost("127.0.0.1.attacker.test")).toBe(false);
  });
});

/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

type RouteFile = {
  path: string;
  body: string;
};

const appApiRoot = existsSync(join(process.cwd(), "src", "app", "api"))
  ? join(process.cwd(), "src", "app", "api")
  : join(process.cwd(), "app", "api");

const forbiddenHandlerPattern =
  /\b(create|place|submit|cancel|replace|execute|send|sign)\w*(Order|Trade|Transaction|Transfer)\b|\/orders?\b|\/trades?\b|\/withdrawals?\b|eth_send|wallet_send|sendTransaction|signTransaction/i;
const forbiddenRoutePathPattern = /(trade|order|execute|executor|transfer|withdraw)/i;
const brokerageWritePattern =
  /\b(createOrder|placeOrder|submitOrder|cancelOrder|replaceOrder|create_order|place_order|submit_order|cancel_order|replace_order|withdraw|withdrawal|transferFunds|createTransfer|executeTrade)\b/i;

const localOrchestrationRouteAllowlist = new Set([
  // Local seeded monitor endpoint only; it has no brokerage SDK imports and no account write authority.
  "app/api/executor/route.ts",
  // Web3 route is explicitly gated: paper by default, dry-run metadata only, and live relay/Trigger paths require env approval.
  "app/api/web3-trading/route.ts",
  // Web3 credential checks can rehearse read-only route/order metadata but cannot sign, submit, or mutate wallets.
  "app/api/web3-credentials/test/route.ts",
  // Web3 Jupiter packet route is a redacted setup receipt, not an execution endpoint.
  "app/api/web3-jupiter-order-packet/route.ts",
]);

function collectRouteFiles(directory: string): RouteFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectRouteFiles(path);
    }

    if (entry.isFile() && entry.name === "route.ts") {
      return [
        {
          path: relative(process.cwd(), path),
          body: readFileSync(path, "utf8"),
        },
      ];
    }

    return [];
  });
}

describe("read-only API enforcement", () => {
  test("GIVEN the codebase is scanned WHEN API route handlers are inspected THEN no order/trade/write endpoint exists", () => {
    const routeFiles = collectRouteFiles(appApiRoot);
    const violations = routeFiles.flatMap((route) => {
      const routeViolations: string[] = [];
      const isLocalOrchestrationRoute = localOrchestrationRouteAllowlist.has(route.path);

      if (!isLocalOrchestrationRoute && forbiddenRoutePathPattern.test(route.path)) {
        routeViolations.push(`${route.path} has execution-like route naming`);
      }

      if (!isLocalOrchestrationRoute && forbiddenHandlerPattern.test(route.body)) {
        routeViolations.push(`${route.path} contains execution-like handler text`);
      }

      if (!isLocalOrchestrationRoute && brokerageWritePattern.test(route.body)) {
        routeViolations.push(`${route.path} imports or invokes a brokerage write method`);
      }

      return routeViolations;
    });

    expect(violations).toHaveLength(0);
    const web3Route = routeFiles.find((route) => route.path === "app/api/web3-trading/route.ts");
    expect(web3Route?.body).toContain("parseTradingRequest");
    expect(web3Route?.body).toContain("parseSignedRelayRequest");
    expect(web3Route?.body).toContain("parseTriggerOrderRequest");
    console.log("No execution endpoints found");
  });
});

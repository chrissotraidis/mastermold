/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("product hierarchy truthfulness", () => {
  test("keeps the mobile primary loop focused on Today, Portfolio, Journal, and Settings", () => {
    const shell = source("components/app-shell.tsx");
    const mobile = shell.slice(shell.indexOf("const MOBILE"), shell.indexOf("function MobileNav"));

    expect(mobile).toContain('href: "/"');
    expect(mobile).toContain('href: "/portfolio"');
    expect(mobile).toContain('href: "/journal"');
    expect(mobile).toContain('href: "/settings"');
    expect(mobile).not.toContain('href: "/trading"');
    expect(mobile).not.toContain('href: "/polymarket"');
  });

  test("labels autonomous trading surfaces as separate research labs with Settings entry points", () => {
    const shell = source("components/app-shell.tsx");
    const settings = source("app/settings/page.tsx");
    const web3 = source("app/trading/page.tsx");
    const polymarket = source("app/polymarket/page.tsx");

    expect(shell).toContain('label: "Web3 lab"');
    expect(shell).toContain('label: "Polymarket lab"');
    expect(settings).toContain("not the core Today → Portfolio → Journal loop and not evidence of profit");
    expect(settings).toContain('href="/trading"');
    expect(settings).toContain('href="/polymarket"');
    expect(web3).toContain("Research lab · separate lane");
    expect(polymarket).toContain("Research lab · separate lane");
  });

  test("never presents sample portfolio dollars as the user's Today pulse", () => {
    const today = source("app/page.tsx");

    expect(today).toContain("const hasPersonalPortfolio");
    expect(today).toContain("{hasPersonalPortfolio ? (");
    expect(today).toContain("Sample portfolio");
    expect(today).toContain("before treating this brief as personal");
  });
});

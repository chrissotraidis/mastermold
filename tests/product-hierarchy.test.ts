/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("product hierarchy truthfulness", () => {
  test("phone tabs cover money first, labs as one Labs tab, and everything else under More", () => {
    const shell = source("components/app-shell.tsx");
    const mobile = shell.slice(shell.indexOf("const MOBILE"), shell.indexOf("const MORE_GROUPS"));
    const more = shell.slice(shell.indexOf("const MORE_GROUPS"), shell.indexOf("function MobileNav"));

    expect(mobile).toContain('href: "/"');
    expect(mobile).toContain('href: "/portfolio"');
    expect(mobile).toContain('href: "/transactions"');
    // The labs share one tab labeled as research, never as a money destination.
    expect(mobile).toContain('label: "Research labs"');
    for (const href of ["/budget", "/journal", "/trading", "/polymarket", "/chat", "/settings"]) expect(more).toContain(`href: "${href}"`);
    expect(more).toContain('label: "Research labs"');
  });

  test("labels autonomous trading surfaces as separate research labs with Settings entry points", () => {
    const shell = source("components/app-shell.tsx");
    const settings = source("app/settings/page.tsx");
    const web3 = source("app/trading/page.tsx");
    const polymarket = source("app/polymarket/page.tsx");

    expect(shell).toContain('label: "Web3 lab"');
    expect(shell).toContain('label: "Polymarket lab"');
    expect(settings).toContain("separate from your money and not evidence of profit");
    expect(settings).toContain('href="/trading"');
    expect(settings).toContain('href="/polymarket"');
    expect(web3).toContain("Research lab · separate lane");
    expect(polymarket).toContain("Research lab · separate lane");
  });

  test("never presents sample portfolio dollars as the user's Today pulse", () => {
    const today = source("app/page.tsx");

    expect(today).toContain("const hasPersonalPortfolio");
    expect(today).toContain("{hasPersonalPortfolio ? (");
    // Without personal holdings Today shows the get-started checklist, which
    // says plainly that pages show sample data until step 1 is done.
    expect(today).toContain("<GetStartedChecklist progress={onboarding} />");
    expect(source("components/get-started-checklist.tsx")).toContain("every page shows sample data");
  });
});

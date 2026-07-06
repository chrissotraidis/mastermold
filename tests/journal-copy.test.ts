/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import { plainJournalSignal, plainJournalText } from "@/lib/journal-copy";

describe("journal copy", () => {
  test("translates saved scan source labels into saved-read language", () => {
    expect(plainJournalSignal("saved market scan")).toBe("saved market read");
    expect(plainJournalText("The next scan no longer supports this saved scan.")).toBe(
      "The next saved read no longer supports this saved read.",
    );
  });
});

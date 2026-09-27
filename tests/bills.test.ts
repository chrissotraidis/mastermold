/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { isBill } from "../lib/bills";

describe("isBill", () => {
  test("GIVEN repeating charges THEN rent and streaming are bills, groceries and income are not", () => {
    expect(isBill({ typical_amount: -2100, category_id: "rent" })).toBe(true);
    expect(isBill({ typical_amount: -15.99, category_id: "streaming" })).toBe(true);
    expect(isBill({ typical_amount: -99, category_id: null })).toBe(true);
    expect(isBill({ typical_amount: -400, category_id: "groceries" })).toBe(false);
    expect(isBill({ typical_amount: 5000, category_id: "paychecks" })).toBe(false);
  });
});

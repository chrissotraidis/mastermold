/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { roundPrice } from "../src/db/price";

describe("roundPrice", () => {
  test("GIVEN a sub-cent token price WHEN saved THEN it is not rounded to zero", () => {
    expect(roundPrice(0.00000913)).toBe(0.00000913);
    expect(roundPrice(0.000000001234567)).toBe(0.00000000123457);
    expect(1_234_567_890 * roundPrice(0.00000913)).toBeCloseTo(11_271.6, 1);
  });

  test("GIVEN ordinary prices WHEN saved THEN cents and 8-decimal behavior are unchanged", () => {
    expect(roundPrice(312.555)).toBe(312.56);
    expect(roundPrice(0.123456789)).toBe(0.12345679);
    expect(roundPrice(0)).toBe(0);
  });
});

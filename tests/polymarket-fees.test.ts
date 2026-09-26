/// <reference types="bun" />

import { describe, expect, test } from "bun:test";
import { chargesTakerFee, feeRateBps, parseFeeSchedule, takerFeeUsd } from "../src/polymarket/fees";

// Shapes copied from a live Gamma read on 2026-09-26.
const sportsV3 = { feesEnabled: true, takerBaseFee: 1000, feeType: "sports_fees_v3", feeSchedule: { exponent: 1, rate: 0.05, takerOnly: true, rebateRate: 0.15 } };
const nflZero = { feesEnabled: true, takerBaseFee: 1000, feeType: "zero_fees", feeSchedule: { exponent: 1, rate: 0, takerOnly: true, rebateRate: 0 } };
const politicsFree = { feesEnabled: false, takerBaseFee: null, feeSchedule: null };

describe("Polymarket fee truth", () => {
  test("GIVEN takerBaseFee=1000 on a fee-free NFL market WHEN parsed THEN the schedule rate (0) wins", () => {
    const schedule = parseFeeSchedule(nflZero);
    expect(schedule.rate).toBe(0);
    expect(chargesTakerFee(schedule)).toBe(false);
    expect(takerFeeUsd(100, 0.5, schedule)).toBe(0);
  });

  test("GIVEN a sports schedule WHEN a taker buys THEN fee = shares × rate × p(1−p)", () => {
    const schedule = parseFeeSchedule(sportsV3);
    expect(feeRateBps(schedule)).toBe(500);
    expect(takerFeeUsd(100, 0.5, schedule)).toBeCloseTo(1.25, 4);
    expect(takerFeeUsd(100, 0.9, schedule)).toBeCloseTo(0.45, 4);
    expect(schedule.rebate_rate).toBe(0.15);
  });

  test("GIVEN fees disabled with no schedule THEN the market is fee-free; GIVEN fees on with no schedule THEN the rate is unknown", () => {
    expect(chargesTakerFee(parseFeeSchedule(politicsFree))).toBe(false);
    const unknown = parseFeeSchedule({ feesEnabled: true, takerBaseFee: 1000 });
    expect(unknown.rate).toBeNull();
    expect(unknown.known).toBe(false);
    expect(chargesTakerFee(unknown)).toBe(true);
    expect(takerFeeUsd(10, 0.5, unknown)).toBeNull();
  });

  test("GIVEN a schedule delivered as a JSON string THEN it still parses", () => {
    expect(parseFeeSchedule({ feesEnabled: true, feeSchedule: JSON.stringify(sportsV3.feeSchedule) }).rate).toBe(0.05);
  });
});

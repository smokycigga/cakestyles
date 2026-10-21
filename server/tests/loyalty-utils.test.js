import { describe, expect, it } from "vitest";

import {
  calculateEarnPoints,
  calculateRedemptionValue,
  calculateTier,
  normalizeLoyaltySettings,
  shouldAwardForStatusTransition,
  validateRedemption,
} from "../utils/loyalty.js";

describe("loyalty point earning", () => {
  it("awards one whole point per ₹100 by default", () => {
    expect(calculateEarnPoints(99)).toBe(0);
    expect(calculateEarnPoints(100)).toBe(1);
    expect(calculateEarnPoints(1250)).toBe(12);
  });

  it("uses a configured earn rate and never awards fractional points", () => {
    expect(calculateEarnPoints(499, 0.02)).toBe(9);
    expect(calculateEarnPoints(-100, 1)).toBe(0);
  });
});

describe("loyalty tiers", () => {
  const tiers = [
    { name: "starter", minPoints: 0 },
    { name: "vip", minPoints: 1000 },
    { name: "regular", minPoints: 100 },
  ];

  it("selects the highest reached threshold regardless of configuration order", () => {
    expect(calculateTier(0, tiers)).toBe("starter");
    expect(calculateTier(100, tiers)).toBe("regular");
    expect(calculateTier(999, tiers)).toBe("regular");
    expect(calculateTier(1000, tiers)).toBe("vip");
  });
});

describe("loyalty redemption", () => {
  it("converts points using the configured rupee value", () => {
    expect(calculateRedemptionValue(125, 0.5)).toBe(62.5);
  });

  it("validates feature state, whole points, minimum and balance", () => {
    expect(validateRedemption({ points: 100, balance: 200, minRedeem: 100 })).toBeNull();
    expect(validateRedemption({ points: 100, balance: 200, minRedeem: 100, enabled: false })).toMatch(/disabled/);
    expect(validateRedemption({ points: 1.5, balance: 200, minRedeem: 100 })).toMatch(/integer/);
    expect(validateRedemption({ points: 99, balance: 200, minRedeem: 100 })).toMatch(/minimum/);
    expect(validateRedemption({ points: 201, balance: 200, minRedeem: 100 })).toMatch(/Insufficient/);
  });

  it("provides safe defaults for incomplete settings", () => {
    expect(normalizeLoyaltySettings({})).toMatchObject({
      enabled: true,
      earnPerRupee: 0.01,
      redemptionValue: 1,
      minRedeem: 100,
    });
  });
});

describe("completed-order award idempotency", () => {
  const eligible = {
    previousStatus: "confirmed",
    nextStatus: "completed",
    loyaltyAwarded: false,
    enabled: true,
    customer: "customer-id",
    points: 10,
  };

  it("awards only on the first transition to completed", () => {
    expect(shouldAwardForStatusTransition(eligible)).toBe(true);
    expect(shouldAwardForStatusTransition({ ...eligible, loyaltyAwarded: true })).toBe(false);
    expect(shouldAwardForStatusTransition({ ...eligible, previousStatus: "completed" })).toBe(false);
    expect(shouldAwardForStatusTransition({ ...eligible, nextStatus: "ready" })).toBe(false);
  });

  it("does not award when disabled, unlinked, or rounded to zero", () => {
    expect(shouldAwardForStatusTransition({ ...eligible, enabled: false })).toBe(false);
    expect(shouldAwardForStatusTransition({ ...eligible, customer: null })).toBe(false);
    expect(shouldAwardForStatusTransition({ ...eligible, points: 0 })).toBe(false);
  });
});


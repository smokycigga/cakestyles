import { describe, expect, it } from "vitest";

import { matchesAudience, summarizeRecipientStatuses } from "../controllers/campaignController.js";

describe("campaign audience matching", () => {
  const customer = {
    _id: "507f1f77bcf86cd799439011",
    active: true,
    tags: ["vip", "weddings"],
    leadSource: "instagram",
    marketingConsent: true,
  };

  it("matches customers satisfying every configured filter", () => {
    expect(matchesAudience(customer, {
      tags: ["vip", "corporate"],
      leadSources: ["website", "instagram"],
      marketingConsentOnly: true,
      segment: "weddings",
      customerIds: [customer._id],
    })).toBe(true);
  });

  it("rejects inactive, non-consenting, or explicitly unselected customers", () => {
    expect(matchesAudience({ ...customer, active: false }, {})).toBe(false);
    expect(matchesAudience({ ...customer, marketingConsent: false }, { marketingConsentOnly: true })).toBe(false);
    expect(matchesAudience(customer, { customerIds: ["507f191e810c19729de860ea"] })).toBe(false);
  });

  it("supports an optional customer segment property as well as segment tags", () => {
    expect(matchesAudience({ ...customer, tags: [], segment: "repeat-buyers" }, { segment: "repeat-buyers" })).toBe(true);
    expect(matchesAudience(customer, { segment: "birthdays" })).toBe(false);
    expect(matchesAudience(customer, { segment: "all" })).toBe(true);
  });
});

describe("campaign recipient status summary", () => {
  it("counts every supported status and the total", () => {
    expect(summarizeRecipientStatuses([
      { status: "pending" },
      { status: "pending" },
      { status: "contacted" },
      { status: "converted" },
      { status: "skipped" },
    ])).toEqual({ total: 5, pending: 2, contacted: 1, converted: 1, skipped: 1 });
  });

  it("returns zero counts for an empty recipient list", () => {
    expect(summarizeRecipientStatuses()).toEqual({
      total: 0,
      pending: 0,
      contacted: 0,
      converted: 0,
      skipped: 0,
    });
  });
});


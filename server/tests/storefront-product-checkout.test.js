import { describe, expect, it } from "vitest";

import {
  escapeSearchRegex,
  publicFilter,
} from "../controllers/productController.js";
import {
  isMongoObjectId,
  isProductPublic,
  priceCatalogItem,
  validateCheckoutPaymentMethod,
  validateFulfilment,
} from "../controllers/orderController.js";

const product = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  name: "Chocolate Cake",
  status: "published",
  availability: "active",
  orderability: "online",
  basePrice: 700,
  variants: [],
  addOns: [],
  ...overrides,
});

const item = (overrides = {}) => ({
  productId: "507f1f77bcf86cd799439011",
  quantity: 1,
  ...overrides,
});

describe("public storefront products", () => {
  it("escapes every regular-expression metacharacter in search input", () => {
    const input = "cake.*+?^${}()|[]\\";
    const escaped = escapeSearchRegex(input);

    expect(escaped).toBe("cake\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
    expect(new RegExp(escaped).test(input)).toBe(true);
  });

  it("includes scheduled products only after publishAt", () => {
    const now = new Date("2026-08-17T12:00:00.000Z");

    expect(isProductPublic(product({ status: "scheduled", publishAt: new Date("2026-08-17T11:59:00.000Z") }), now)).toBe(true);
    expect(isProductPublic(product({ status: "scheduled", publishAt: new Date("2026-08-17T12:01:00.000Z") }), now)).toBe(false);
    expect(publicFilter(now)).toEqual({
      $or: [{ status: "published" }, { status: "scheduled", publishAt: { $lte: now } }],
    });
  });
});

describe("storefront checkout validation", () => {
  it("accepts only canonical Mongo ObjectId strings", () => {
    expect(isMongoObjectId("507f1f77bcf86cd799439011")).toBe(true);
    expect(isMongoObjectId("507f1f77bcf86cd79943901")).toBe(false);
    expect(isMongoObjectId("not-an-object-id-value!!")).toBe(false);
  });

  it("requires and validates variants", () => {
    const withVariants = product({ variants: [{ name: "1 kg", price: 1200 }] });

    expect(() => priceCatalogItem(item(), withVariants)).toThrow("Please choose a variant");
    expect(() => priceCatalogItem(item({ variantName: "2 kg" }), withVariants)).toThrow("not available");
    expect(priceCatalogItem(item({ variantName: "1 kg" }), withVariants).unitPrice).toBe(1200);
  });

  it("rejects unknown and duplicate add-ons", () => {
    const withAddOns = product({ addOns: [{ name: "Candles", price: 40 }] });

    expect(() => priceCatalogItem(item({ addOns: ["Sparklers"] }), withAddOns)).toThrow("not available");
    expect(() => priceCatalogItem(item({ addOns: ["Candles", "Candles"] }), withAddOns)).toThrow("Duplicate add-ons");
  });

  it("uses catalog prices instead of client-supplied prices", () => {
    const priced = priceCatalogItem(
      item({ quantity: 2, addOns: ["Candles"], unitPrice: 1, lineTotal: 1 }),
      product({ basePrice: 700, addOns: [{ name: "Candles", price: 40 }] })
    );

    expect(priced.unitPrice).toBe(700);
    expect(priced.addOns).toEqual([{ name: "Candles", price: 40 }]);
    expect(priced.lineTotal).toBe(1480);
  });

  it("requires delivery addresses and configured pickup slots", () => {
    const settings = {
      delivery: { enabled: true, pincodes: [] },
      pickup: { slots: ["10:00 - 13:00"], cutoffHours: 0 },
    };
    const now = new Date("2026-08-17T00:00:00.000Z");

    expect(() => validateFulfilment({ type: "delivery", date: "2099-01-01" }, settings, [], now)).toThrow("Delivery address is required");
    expect(() => validateFulfilment({ type: "pickup", date: "2099-01-01" }, settings, [], now)).toThrow("valid pickup slot");
    expect(() => validateFulfilment({ type: "pickup", date: "2099-01-01", slot: "12:00 - 14:00" }, settings, [], now)).toThrow("valid pickup slot");
    expect(() => validateFulfilment({ type: "pickup", date: "2099-01-01", slot: "10:00 - 13:00" }, settings, [], now)).not.toThrow();
  });

  it("enforces configured online and offline payment methods", () => {
    const settings = {
      paymentMethods: { online: { enabled: false }, offline: ["cash"] },
    };

    expect(() => validateCheckoutPaymentMethod("razorpay", settings)).toThrow("Online payment");
    expect(() => validateCheckoutPaymentMethod("upi", settings)).toThrow("not available");
    expect(() => validateCheckoutPaymentMethod("cash", settings)).not.toThrow();
  });
});


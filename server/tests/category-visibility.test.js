import { describe, it, expect } from "vitest";
import { publicFilter, publicCatalogFilter } from "../controllers/productController.js";

/**
 * Minimal stand-in for the slice of MongoDB query semantics these filters use
 * ($in, $or, $and, $lte, equality). Enough to assert the intent of the filter
 * without standing up a database.
 */
// Dates and ISO strings must compare as timestamps; a raw JS relational
// comparison between the two coerces the string to NaN.
const comparable = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return Date.parse(value);
  return value;
};

const cmp = (a, b) => {
  const left = comparable(a);
  const right = comparable(b);
  return typeof left === "number" && typeof right === "number" ? [left, right] : [String(a), String(b)];
};

const matches = (doc, filter) => {
  if (Array.isArray(filter.$and) && !filter.$and.every((sub) => matches(doc, sub))) return false;
  if (Array.isArray(filter.$or) && !filter.$or.some((sub) => matches(doc, sub))) return false;

  for (const [key, cond] of Object.entries(filter)) {
    if (key === "$and" || key === "$or") continue;
    const value = key.split(".").reduce((v, k) => (v == null ? v : v[k]), doc);

    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      for (const [op, operand] of Object.entries(cond)) {
        if (op === "$in" && !operand.map(String).includes(String(value))) return false;
        if (op === "$lte") {
          if (value == null) return false;
          const [left, right] = cmp(value, operand);
          if (!(left <= right)) return false;
        }
        if (op === "$gte") {
          if (value == null) return false;
          const [left, right] = cmp(value, operand);
          if (!(left >= right)) return false;
        }
      }
      continue;
    }
    if (String(value) !== String(cond)) return false;
  }
  return true;
};

const CAKES = "650000000000000000000001";
const BROWNIES = "650000000000000000000002";

const product = (overrides) => ({
  status: "published",
  category: CAKES,
  ...overrides,
});

describe("publicCatalogFilter", () => {
  it("restricts the storefront to products in active categories", () => {
    const filter = publicCatalogFilter([CAKES], new Date("2026-08-31T10:00:00Z"));
    expect(matches(product({ category: CAKES }), filter)).toBe(true);
    expect(matches(product({ category: BROWNIES }), filter)).toBe(false);
  });

  // The bug this guards: hiding a category only removed its chip, while its
  // products kept being served on /menu.
  it("hides everything when no category is active", () => {
    const filter = publicCatalogFilter([], new Date("2026-08-31T10:00:00Z"));
    expect(matches(product({ category: CAKES }), filter)).toBe(false);
  });

  it("still honours published and scheduled visibility", () => {
    const now = new Date("2026-08-31T10:00:00Z");
    const filter = publicCatalogFilter([CAKES], now);
    expect(matches(product(), filter)).toBe(true);
    expect(matches(product({ status: "scheduled", publishAt: "2026-08-30T10:00:00Z" }), filter)).toBe(true);
    expect(matches(product({ status: "scheduled", publishAt: "2026-09-30T10:00:00Z" }), filter)).toBe(false);
    expect(matches(product({ status: "draft" }), filter)).toBe(false);
  });

  it("is not affected by an unrelated category filter being layered on top", () => {
    const filter = { ...publicCatalogFilter([CAKES]), category: BROWNIES };
    expect(matches(product({ category: CAKES }), filter)).toBe(false);
    expect(matches(product({ category: BROWNIES }), filter)).toBe(true);
  });
});

describe("publicFilter", () => {
  it("admits published products and scheduled ones whose time has come", () => {
    const now = new Date("2026-08-31T10:00:00Z");
    expect(matches(product(), publicFilter(now))).toBe(true);
    expect(matches(product({ status: "scheduled", publishAt: "2026-08-01T00:00:00Z" }), publicFilter(now))).toBe(true);
    expect(matches(product({ status: "scheduled", publishAt: "2026-12-01T00:00:00Z" }), publicFilter(now))).toBe(false);
  });

  it("never admits drafts or archived products", () => {
    const now = new Date("2026-08-31T10:00:00Z");
    for (const status of ["draft", "archived"]) {
      expect(matches(product({ status }), publicFilter(now))).toBe(false);
    }
  });
});

// Two things a shopkeeper complained about in the same breath:
//
//   1. "i search Chocolate truffle and truffle cake should show… for cat if i
//      type Cat, it doesn't show" — search matched one literal substring, so
//      word order mattered and a prefix never matched.
//   2. "quantity is always integer, like someone needs 1.5 cake it should be
//      1.5 not 2 or 1" — every layer rejected fractions.
//
// The unit tests pin the matcher's rules; the integration tests prove the API
// and the schema actually apply them.
import { describe, expect, it } from "vitest";
import request from "supertest";

import {
  buildSearch,
  fuzzyWordMatch,
  hasWordStartingWith,
  searchTokens,
  searchWithFallback,
} from "../utils/search.js";
import { roundQuantity } from "../utils/quantity.js";
import {
  PICKUP_SLOT,
  daysFromToday,
  seedSettings,
  signIn,
  useMemoryDatabase,
} from "./helpers/integration.js";
import { makeCategory, makeCustomer, makeProduct } from "./helpers/factories.js";
import app from "../app.js";
import Order from "../models/Order.js";

useMemoryDatabase();

// A miniature of the real catalogue: the shop sells one truffle cake, and the
// only shelf is "Cakes".
const seedCatalogue = async () => {
  const cakes = await makeCategory({ name: "Cakes", slug: "cakes" });
  const brownies = await makeCategory({ name: "Brownies", slug: "brownies" });

  const truffle = await makeProduct({
    category: cakes,
    name: "Chocolate Truffle Cake",
    slug: "chocolate-truffle-cake",
  });
  const vanilla = await makeProduct({
    category: cakes,
    name: "Vanilla Buttercream Cake",
    slug: "vanilla-buttercream-cake",
  });
  const fudge = await makeProduct({
    category: brownies,
    name: "Walnut Brownie Slab",
    slug: "walnut-brownie-slab",
  });

  return { cakes, brownies, truffle, vanilla, fudge };
};

describe("search tokenising", () => {
  it("splits on punctuation and lowercases", () => {
    expect(searchTokens("Chocolate-Truffle,  cake!")).toEqual(["chocolate", "truffle", "cake"]);
  });

  it("ignores whitespace-only queries", () => {
    expect(searchTokens("   ")).toEqual([]);
    expect(buildSearch("  ", ["name"])).toBeNull();
  });

  it("caps the number of words it will honour", () => {
    expect(searchTokens("a b c d e f g h i j")).toHaveLength(6);
  });

  it("matches a word at its start, not in its middle", () => {
    expect(hasWordStartingWith("Chocolate Truffle Cake", "truf")).toBe(true);
    expect(hasWordStartingWith("Walnut Brownie Slab", "brown")).toBe(true);
    expect(hasWordStartingWith("Bobcat Brownie", "cat")).toBe(false);
  });

  it("treats a hyphen as a word boundary", () => {
    expect(hasWordStartingWith("Walnut-Brownie", "brown")).toBe(true);
  });

  it("tolerates one mistyped character at the start of a word", () => {
    // "cat" is not a prefix of "Cakes" — it is one substitution away from it,
    // which is exactly the case the shopkeeper reported.
    expect(fuzzyWordMatch("Cakes", "cat")).toBe(true);
    expect(fuzzyWordMatch("Chocolate Truffle Cake", "trufel")).toBe(true);
    expect(fuzzyWordMatch("Walnut Brownie Slab", "xyz")).toBe(false);
  });

  it("does not attempt a typo pass for very short tokens", () => {
    expect(fuzzyWordMatch("Cakes", "ca")).toBe(false);
  });

  it("requires every word under the strict clause and any word under the relaxed one", () => {
    const search = buildSearch("chocolate truffle", ["name"]);
    expect(search.strict.$and).toHaveLength(2);
    expect(search.relaxed.$or).toHaveLength(2);
  });
});

describe("search fallback", () => {
  it("stops at the strict pass when it finds something", async () => {
    const seen = [];
    const exec = async (filter) => {
      seen.push(filter);
      return [{ name: "Chocolate Truffle Cake" }];
    };

    await searchWithFallback((clause) => clause, "chocolate truffle", ["name"], exec);
    expect(seen).toHaveLength(1);
    expect(seen[0].$and).toHaveLength(2);
  });

  it("falls back to any-word matching when strict finds nothing", async () => {
    const seen = [];
    const exec = async (filter) => {
      seen.push(filter);
      return seen.length === 1 ? [] : [{ name: "Chocolate Truffle Cake" }];
    };

    const results = await searchWithFallback((clause) => clause, "chocolate truffle", ["name"], exec);
    expect(seen).toHaveLength(2);
    expect(seen[1].$or).toHaveLength(2);
    expect(results).toHaveLength(1);
  });

  it("runs a single unfiltered query when the query has no words", async () => {
    const seen = [];
    const exec = async (filter) => {
      seen.push(filter);
      return [];
    };

    await searchWithFallback((clause) => clause, "  ", ["name"], exec);
    expect(seen).toEqual([null]);
  });
});

describe("GET /api/products?search=", () => {
  it("finds a product when the words are typed in a different order", async () => {
    await seedCatalogue();

    const forward = await request(app).get("/api/products").query({ search: "chocolate truffle" });
    const reversed = await request(app).get("/api/products").query({ search: "truffle chocolate" });

    expect(forward.status).toBe(200);
    expect(forward.body.products.map((p) => p.name)).toEqual(["Chocolate Truffle Cake"]);
    expect(reversed.body.products.map((p) => p.name)).toEqual(["Chocolate Truffle Cake"]);
  });

  it("finds a product from a prefix of one of its words", async () => {
    await seedCatalogue();

    const res = await request(app).get("/api/products").query({ search: "truf" });
    expect(res.body.products.map((p) => p.name)).toEqual(["Chocolate Truffle Cake"]);
  });

  it("matches the category name, so \"cat\" reaches the Cakes shelf", async () => {
    await seedCatalogue();

    const res = await request(app).get("/api/products").query({ search: "cat" });
    const names = res.body.products.map((p) => p.name).sort();
    expect(names).toEqual(["Chocolate Truffle Cake", "Vanilla Buttercream Cake"]);
  });

  it("still shows something when one of the words matches nothing", async () => {
    await seedCatalogue();

    // No product has both "walnut" and "cake" in it, so the strict pass finds
    // nothing and the relaxed pass surfaces both halves.
    const res = await request(app).get("/api/products").query({ search: "walnut cake" });
    const names = res.body.products.map((p) => p.name).sort();
    expect(names).toEqual(["Chocolate Truffle Cake", "Vanilla Buttercream Cake", "Walnut Brownie Slab"]);
  });

  it("never leaks an unpublished product into a search", async () => {
    const { cakes } = await seedCatalogue();
    await makeProduct({ category: cakes, name: "Secret Truffle Cake", slug: "secret-truffle", status: "draft" });

    const res = await request(app).get("/api/products").query({ search: "truffle" });
    expect(res.body.products.map((p) => p.name)).toEqual(["Chocolate Truffle Cake"]);
  });

  it("escapes regex metacharacters instead of erroring", async () => {
    await seedCatalogue();

    // "cake.*" tokenises to ["cake"], so the metacharacters are separators
    // rather than a pattern — no 500, and the cakes still come back.
    const res = await request(app).get("/api/products").query({ search: "cake.*" });
    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p.name).sort()).toEqual([
      "Chocolate Truffle Cake",
      "Vanilla Buttercream Cake",
    ]);
  });
});

describe("GET /api/products/admin?search=", () => {
  it("matches by prefix and by category name", async () => {
    await seedCatalogue();
    const { auth } = await signIn("owner");

    const byPrefix = await request(app).get("/api/products/admin").set("Authorization", auth).query({ search: "butter" });
    expect(byPrefix.body.products.map((p) => p.name)).toEqual(["Vanilla Buttercream Cake"]);

    const byCategory = await request(app).get("/api/products/admin").set("Authorization", auth).query({ search: "brown" });
    expect(byCategory.body.products.map((p) => p.name)).toEqual(["Walnut Brownie Slab"]);
  });
});

describe("fractional quantities", () => {
  it("rounds to three decimals and keeps halves intact", () => {
    expect(roundQuantity(1.5)).toBe(1.5);
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
    expect(roundQuantity(1.23456)).toBe(1.235);
  });

  it("stores half a cake on an order", async () => {
    const order = await Order.create({
      orderNumber: "CS-FRACTION-1",
      customerSnapshot: { name: "Half Cake", phone: "9000000001", email: "" },
      source: "website",
      fulfilment: { type: "pickup", date: daysFromToday(5), slot: PICKUP_SLOT },
      items: [{ name: "Chocolate Truffle Cake", unitPrice: 1000, quantity: 1.5, lineTotal: 1500 }],
      subtotal: 1500,
      grandTotal: 1500,
      status: "confirmed",
    });

    expect(order.items[0].quantity).toBe(1.5);
  });

  it("rejects a zero quantity at the schema level", async () => {
    await expect(
      Order.create({
        orderNumber: "CS-FRACTION-2",
        customerSnapshot: { name: "Zero Cake", phone: "9000000002", email: "" },
        source: "website",
        fulfilment: { type: "pickup", date: daysFromToday(5), slot: PICKUP_SLOT },
        items: [{ name: "Chocolate Truffle Cake", unitPrice: 1000, quantity: 0, lineTotal: 0 }],
        subtotal: 0,
        grandTotal: 0,
      }),
    ).rejects.toThrow();
  });

  it("accepts 1.5 of a catalogue item through checkout and prices the line correctly", async () => {
    const { truffle } = await seedCatalogue();
    await seedSettings();

    const res = await request(app)
      .post("/api/orders")
      .send({
        items: [{ productId: String(truffle._id), quantity: 1.5 }],
        fulfilment: { type: "pickup", date: daysFromToday(5), slot: PICKUP_SLOT },
        customer: { name: "Half Cake", phone: "9000000003", email: "half@example.test" },
        paymentMethod: "cash",
      });

    expect(res.status).toBe(201);
    expect(res.body.order.items[0].quantity).toBe(1.5);
    // The product factory prices at 800, so one and a half is 1200 — not 800
    // (rounded down) and not 1600 (rounded up).
    expect(res.body.order.items[0].lineTotal).toBe(1200);
  });

  it("rejects a quantity of zero through checkout", async () => {
    const { truffle } = await seedCatalogue();
    await seedSettings();

    const res = await request(app)
      .post("/api/orders")
      .send({
        items: [{ productId: String(truffle._id), quantity: 0 }],
        fulfilment: { type: "pickup", date: daysFromToday(5), slot: PICKUP_SLOT },
        customer: { name: "Zero Cake", phone: "9000000004", email: "zero@example.test" },
        paymentMethod: "cash",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/quantity/i);
  });

  it("accepts a fractional line on an invoice", async () => {
    const customer = await makeCustomer();
    const { auth } = await signIn("owner");
    await seedSettings();

    const res = await request(app)
      .post("/api/invoices")
      .set("Authorization", auth)
      .send({
        customerId: String(customer._id),
        lines: [{ description: "Half a truffle cake", quantity: 0.5, unitPrice: 1000 }],
        confirmUnlinked: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.invoice.lines[0].quantity).toBe(0.5);
    expect(res.body.invoice.subtotal).toBe(500);
  });
});

import { describe, it, expect } from "vitest";
import {
  bestsellerTag,
  toBestsellerCard,
  groupByCategoryOrder,
  categoryChips,
} from "../../client/src/lib/catalog.js";

const product = (id, slug, name, category, extra = {}) => ({
  _id: id,
  slug,
  name,
  category,
  basePrice: 500,
  ...extra,
});

const cakes = { slug: "cakes", name: "Cakes" };
const brownies = { slug: "brownies", name: "Brownies" };
const pastries = { slug: "pastries", name: "Pastries" };

describe("bestsellerTag", () => {
  it("ranks real sales data by position", () => {
    expect(bestsellerTag({ salesRank: 1 }, "sales")).toBe("BESTSELLER");
    expect(bestsellerTag({ salesRank: 2 }, "sales")).toBe("TOP SELLER");
    expect(bestsellerTag({ salesRank: 3 }, "sales")).toBe("TOP SELLER");
    expect(bestsellerTag({ salesRank: 4 }, "sales")).toBe("POPULAR");
  });

  // The Featured fallback has no meaningful ranking, so inventing one would
  // misrepresent products that simply have no sales yet.
  it("tags the featured fallback uniformly rather than faking a rank", () => {
    expect(bestsellerTag({ salesRank: 1 }, "featured")).toBe("SIGNATURE");
    expect(bestsellerTag({}, "sales")).toBe("SIGNATURE");
  });
});

describe("toBestsellerCard", () => {
  it("maps a public product to the flat card shape", () => {
    const card = toBestsellerCard(
      product("p1", "truffle-cake", "Truffle Cake", cakes, { shortDescription: "Rich", salesRank: 2, unitsSold: 9 }),
      "/img/cake.jpg",
    );
    expect(card).toMatchObject({
      id: "p1",
      slug: "truffle-cake",
      name: "Truffle Cake",
      category: "Cakes",
      tag: "TOP SELLER",
      price: 500,
      image: "/img/cake.jpg",
      description: "Rich",
      salesRank: 2,
      unitsSold: 9,
    });
  });

  it("falls back safely when a product has no category or description", () => {
    const card = toBestsellerCard({ _id: "p2", slug: "x", name: "Mystery" }, null, "featured");
    expect(card.category).toBe("Patisserie");
    expect(card.tag).toBe("SIGNATURE");
    expect(card.description).toMatch(/Handcrafted/);
    expect(card.image).toBeNull();
    expect(card.variants).toEqual([]);
  });
});

describe("groupByCategoryOrder", () => {
  const products = [
    product("1", "a", "A", brownies),
    product("2", "b", "B", cakes),
    product("3", "c", "C", brownies),
  ];

  it("orders sections by the admin-defined category order, not by product order", () => {
    const sections = groupByCategoryOrder(products, [cakes, brownies, pastries]);
    expect(sections.map((s) => s.slug)).toEqual(["cakes", "brownies"]);
  });

  it("drops categories that have no products", () => {
    const sections = groupByCategoryOrder(products, [pastries, cakes, brownies]);
    expect(sections.map((s) => s.slug)).toEqual(["cakes", "brownies"]);
    expect(sections.find((s) => s.slug === "pastries")).toBeUndefined();
  });

  it("keeps products whose category is missing from the list instead of hiding them", () => {
    const sections = groupByCategoryOrder(
      [...products, product("4", "d", "D", { slug: "tarts", name: "Tarts" })],
      [cakes, brownies],
    );
    const tarts = sections.find((s) => s.slug === "tarts");
    expect(tarts).toBeDefined();
    expect(tarts.name).toBe("Tarts");
    expect(tarts.products).toHaveLength(1);
  });

  it("buckets uncategorised products together under 'More'", () => {
    const sections = groupByCategoryOrder([product("5", "e", "E", null)], [cakes]);
    // "cakes" is dropped here because nothing belongs to it.
    expect(sections.map((s) => s.slug)).toEqual(["other"]);
    expect(sections[0].name).toBe("More");
  });

  it("appends uncategorised products after the real sections", () => {
    const sections = groupByCategoryOrder(
      [product("1", "a", "A", cakes), product("5", "e", "E", null)],
      [cakes, brownies],
    );
    expect(sections.map((s) => s.slug)).toEqual(["cakes", "other"]);
  });

  it("returns nothing when there are no products at all", () => {
    expect(groupByCategoryOrder([], [cakes, brownies])).toEqual([]);
  });
});

describe("categoryChips", () => {
  it("only offers chips for categories that actually have a product", () => {
    const products = [product("1", "a", "A", cakes), product("2", "b", "B", cakes)];
    expect(categoryChips([cakes, brownies, pastries], products).map((c) => c.slug)).toEqual(["cakes"]);
  });

  it("preserves the admin order rather than sorting by count", () => {
    const products = [
      product("1", "a", "A", pastries),
      product("2", "b", "B", pastries),
      product("3", "c", "C", cakes),
    ];
    const result = categoryChips([cakes, pastries], products);
    expect(result.map((c) => c.slug)).toEqual(["cakes", "pastries"]);
  });

  it("offers no chips when the catalogue is empty", () => {
    expect(categoryChips([cakes, brownies], [])).toEqual([]);
  });
});

// The B2B catalogue is managed from one screen that sends nothing but the
// wholesale price. Two things must stay true for that to be safe:
//
//   1. Updating b2bPrice must not disturb retail prices, sizes or anything else
//      — the screen deliberately sends a partial body.
//   2. b2bPrice must never reach a customer, on the product or on a variant.
//      Wholesale rates are the shop's margin; leaking them is the one mistake
//      in this area that cannot be undone.
import { describe, expect, it } from "vitest";
import request from "supertest";

import { seedSettings, signIn, useMemoryDatabase } from "./helpers/integration.js";
import { makeCategory, makeProduct } from "./helpers/factories.js";
import app from "../app.js";

useMemoryDatabase();

const withSizes = async () => {
  const category = await makeCategory({ name: "Cakes", slug: "cakes" });
  return makeProduct({
    category,
    name: "Chocolate Truffle Cake",
    slug: "chocolate-truffle-cake",
    basePrice: 1000,
    variants: [
      { name: "0.5 kg", price: 600, b2bPrice: null },
      { name: "1 kg", price: 1000, b2bPrice: null },
    ],
  });
};

describe("PUT /api/products/:id — wholesale pricing", () => {
  it("updates only the wholesale price and leaves retail untouched", async () => {
    const product = await withSizes();
    const { auth } = await signIn("owner");

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set("Authorization", auth)
      .send({ b2bPrice: 800 });

    expect(res.status).toBe(200);
    expect(res.body.product.b2bPrice).toBe(800);
    expect(res.body.product.basePrice).toBe(1000);
    expect(res.body.product.variants.map((variant) => variant.price)).toEqual([600, 1000]);
    expect(res.body.product.variants.map((variant) => variant.b2bPrice)).toEqual([null, null]);
    expect(res.body.product.name).toBe("Chocolate Truffle Cake");
  });

  it("sets a wholesale rate per size", async () => {
    const product = await withSizes();
    const { auth } = await signIn("owner");

    const res = await request(app)
      .put(`/api/products/${product._id}`)
      .set("Authorization", auth)
      .send({
        b2bPrice: 800,
        variants: [
          { name: "0.5 kg", price: 600, b2bPrice: 480 },
          { name: "1 kg", price: 1000, b2bPrice: 800 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.product.variants.map((variant) => variant.b2bPrice)).toEqual([480, 800]);
    expect(res.body.product.variants.map((variant) => variant.price)).toEqual([600, 1000]);
  });

  it("clears a wholesale price back to null", async () => {
    const product = await withSizes();
    const { auth } = await signIn("owner");

    await request(app).put(`/api/products/${product._id}`).set("Authorization", auth).send({ b2bPrice: 800 });
    const res = await request(app).put(`/api/products/${product._id}`).set("Authorization", auth).send({ b2bPrice: null });

    expect(res.status).toBe(200);
    expect(res.body.product.b2bPrice).toBeNull();
  });

  it("rejects a negative wholesale price", async () => {
    const product = await withSizes();
    const { auth } = await signIn("owner");

    const res = await request(app).put(`/api/products/${product._id}`).set("Authorization", auth).send({ b2bPrice: -5 });
    expect(res.status).toBe(400);
  });

  it("refuses the update without catalog:write", async () => {
    const product = await withSizes();
    const { auth } = await signIn("staff");

    const res = await request(app).put(`/api/products/${product._id}`).set("Authorization", auth).send({ b2bPrice: 800 });
    expect(res.status).toBe(403);
  });
});

describe("wholesale prices never reach a customer", () => {
  const seedPriced = async () => {
    const category = await makeCategory({ name: "Cakes", slug: "cakes" });
    return makeProduct({
      category,
      name: "Chocolate Truffle Cake",
      slug: "chocolate-truffle-cake",
      basePrice: 1000,
      b2bPrice: 800,
      variants: [
        { name: "0.5 kg", price: 600, b2bPrice: 480 },
        { name: "1 kg", price: 1000, b2bPrice: 800 },
      ],
    });
  };

  it("strips the product-level rate from the public menu", async () => {
    await seedPriced();
    await seedSettings();

    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].b2bPrice).toBeUndefined();
  });

  it("strips the per-size rate from the public menu", async () => {
    await seedPriced();
    await seedSettings();

    const res = await request(app).get("/api/products");
    for (const variant of res.body.products[0].variants) {
      expect(variant.b2bPrice).toBeUndefined();
    }
  });

  it("strips both rates from the public product page", async () => {
    await seedPriced();
    await seedSettings();

    const res = await request(app).get("/api/products/slug/chocolate-truffle-cake");
    expect(res.status).toBe(200);
    expect(res.body.product.b2bPrice).toBeUndefined();
    for (const variant of res.body.product.variants) {
      expect(variant.b2bPrice).toBeUndefined();
    }
  });

  it("does keep them in the admin catalogue, which is where they are managed", async () => {
    await seedPriced();
    const { auth } = await signIn("owner");

    const res = await request(app).get("/api/products/admin").set("Authorization", auth);
    expect(res.body.products[0].b2bPrice).toBe(800);
    expect(res.body.products[0].variants.map((variant) => variant.b2bPrice)).toEqual([480, 800]);
  });
});

// POST/GET/PUT/DELETE /api/categories — the route the admin Menu screen and the
// "Add new category…" entry on the product form both drive.
//
// The bug this file exists for: a fresh store had no way to create its first
// category, so the product form's required Category select was empty and no
// product could ever be saved. Creation is covered here end to end, including
// the duplicate-name and in-use-deletion answers the UI turns into toasts.
//
// helpers/integration.js must be imported before ../app.js — see the safety
// note in that file.
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import { missingId, seedSettings, signIn, useMemoryDatabase } from "./helpers/integration.js";
import { makeCategory, makeProduct } from "./helpers/factories.js";
import app from "../app.js";
import Category from "../models/Category.js";

useMemoryDatabase();

const list = (query = "", auth) => {
  const req = request(app).get(`/api/categories${query}`);
  return auth ? req.set("Authorization", auth) : req;
};

const create = (body, auth) => {
  const req = request(app).post("/api/categories").send(body);
  return auth ? req.set("Authorization", auth) : req;
};

let owner;

beforeEach(async () => {
  await seedSettings();
  owner = await signIn("owner");
});

describe("POST /api/categories", () => {
  it("creates the first category of an empty store and returns it with an id", async () => {
    expect(await Category.countDocuments()).toBe(0);

    const res = await create({ name: "Signature Cakes" }, owner.auth);

    expect(res.status).toBe(201);
    expect(res.body.category._id).toBeTruthy();
    expect(res.body.category.name).toBe("Signature Cakes");
    // The slug is what /menu?category=<slug> links use, so it must be derived
    // from the name without the client having to send one.
    expect(res.body.category.slug).toBe("signature-cakes");
    expect(res.body.category.active).toBe(true);
    expect(await Category.countDocuments()).toBe(1);
  });

  it("keeps the description, order and image the form sends", async () => {
    const res = await create(
      { name: "Brownies", description: "Fudge-forward squares", order: 3, image: "/images/brownie.webp" },
      owner.auth
    );

    expect(res.status).toBe(201);
    expect(res.body.category.description).toBe("Fudge-forward squares");
    expect(res.body.category.order).toBe(3);
    expect(res.body.category.image).toBe("/images/brownie.webp");
  });

  it("answers 409 — not 500 — when the name is already taken", async () => {
    await create({ name: "Cupcakes" }, owner.auth);
    const res = await create({ name: "Cupcakes" }, owner.auth);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
    expect(await Category.countDocuments()).toBe(1);
  });

  it("rejects a blank name with a 400 the form can show", async () => {
    const res = await create({ name: "" }, owner.auth);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid name/i);
  });

  it("is limited to catalog:write and refuses anonymous callers", async () => {
    const manager = await signIn("manager");
    const staff = await signIn("staff");

    expect((await create({ name: "Tarts" }, manager.auth)).status).toBe(201);
    expect((await create({ name: "Tarts 2" }, staff.auth)).status).toBe(403);
    expect((await create({ name: "Tarts 3" })).status).toBe(401);
  });
});

describe("GET /api/categories", () => {
  it("serves only visible categories to the storefront", async () => {
    await makeCategory({ name: "Cakes", slug: "cakes" });
    await makeCategory({ name: "Retired", slug: "retired", active: false });

    const res = await list();

    expect(res.status).toBe(200);
    expect(res.body.categories.map((c) => c.slug)).toEqual(["cakes"]);
  });

  it("returns hidden categories to an admin asking for all=1", async () => {
    await makeCategory({ name: "Cakes", slug: "cakes" });
    await makeCategory({ name: "Retired", slug: "retired", active: false });

    const res = await list("?all=1", owner.auth);

    expect(res.body.categories.map((c) => c.slug).sort()).toEqual(["cakes", "retired"]);
  });

  it("ignores all=1 for a caller with no token or a forged one", async () => {
    await makeCategory({ name: "Cakes", slug: "cakes" });
    await makeCategory({ name: "Retired", slug: "retired", active: false });

    for (const auth of [undefined, "Bearer not-a-real-token"]) {
      const res = await list("?all=1", auth);
      expect(res.status).toBe(200);
      expect(res.body.categories.map((c) => c.slug)).toEqual(["cakes"]);
    }
  });

  it("sorts by the order the Menu screen sets, then by name", async () => {
    await makeCategory({ name: "Zebra", slug: "zebra", order: 0 });
    await makeCategory({ name: "Alpha", slug: "alpha", order: 1 });
    await makeCategory({ name: "Beta", slug: "beta", order: 1 });

    const res = await list();

    expect(res.body.categories.map((c) => c.slug)).toEqual(["zebra", "alpha", "beta"]);
  });
});

describe("PUT /api/categories/:id", () => {
  it("renames a category without changing the slug shared menu links use", async () => {
    const category = await makeCategory({ name: "Cakes", slug: "cakes" });

    const res = await request(app)
      .put(`/api/categories/${category._id}`)
      .set("Authorization", owner.auth)
      .send({ name: "Celebration Cakes" });

    expect(res.status).toBe(200);
    expect(res.body.category.name).toBe("Celebration Cakes");
    expect(res.body.category.slug).toBe("cakes");
  });

  it("toggles visibility and reorders, which is how the Menu screen hides and moves rows", async () => {
    const category = await makeCategory({ name: "Cakes", slug: "cakes" });

    await request(app)
      .put(`/api/categories/${category._id}`)
      .set("Authorization", owner.auth)
      .send({ active: false, order: 4 });

    const saved = await Category.findById(category._id);
    expect(saved.active).toBe(false);
    expect(saved.order).toBe(4);
  });

  it("404s for an id that does not exist", async () => {
    const res = await request(app)
      .put(`/api/categories/${missingId()}`)
      .set("Authorization", owner.auth)
      .send({ name: "Ghost" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/categories/:id", () => {
  it("deletes an empty category", async () => {
    const category = await makeCategory();

    const res = await request(app)
      .delete(`/api/categories/${category._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(await Category.findById(category._id)).toBeNull();
  });

  it("refuses to delete a category that still has products, naming the count", async () => {
    const category = await makeCategory({ name: "Cakes", slug: "cakes" });
    await makeProduct({ category });
    await makeProduct({ category });

    const res = await request(app)
      .delete(`/api/categories/${category._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/2 products/);
    expect(await Category.findById(category._id)).not.toBeNull();
  });

  it("is limited to catalog:write", async () => {
    const category = await makeCategory();
    const staff = await signIn("staff");

    const res = await request(app)
      .delete(`/api/categories/${category._id}`)
      .set("Authorization", staff.auth);

    expect(res.status).toBe(403);
    expect(await Category.findById(category._id)).not.toBeNull();
  });
});

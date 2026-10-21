// Manual customer creation — the endpoint behind the "New Customer" button on
// the customers page. Pins that a staff member can add a customer directly, that
// phone numbers are the unique key (a duplicate phone is rejected), and that the
// required fields are enforced.
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { signIn, useMemoryDatabase } from "./helpers/integration.js";
import app from "../app.js";

useMemoryDatabase();

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

let owner;

beforeEach(async () => {
  owner = await signIn("owner");
});

describe("POST /api/customers", () => {
  it("creates a customer from the manual form fields", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", owner.auth)
      .send({ name: "Aditi Roy", phone: "9812345678", email: "aditi@example.com", leadSource: "instagram", tags: ["vip", "wedding"] });

    expect(res.status).toBe(201);
    expect(res.body.customer.name).toBe("Aditi Roy");
    expect(res.body.customer.phone).toBe("9812345678");
    expect(res.body.customer.email).toBe("aditi@example.com");
    expect(res.body.customer.leadSource).toBe("instagram");
    expect(res.body.customer.tags).toEqual(["vip", "wedding"]);
  });

  it("rejects a duplicate phone number", async () => {
    const body = { name: "Aditi Roy", phone: "9812345678" };
    await request(app).post("/api/customers").set("Authorization", owner.auth).send(body);

    const dup = await request(app).post("/api/customers").set("Authorization", owner.auth).send(body);

    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain("already exists");
  });

  it("requires a name and a phone", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", owner.auth)
      .send({ name: "", phone: "123" });

    expect(res.status).toBe(400);
  });
});

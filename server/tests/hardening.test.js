// Regression cover for the three defects found in the production-readiness
// sweep. Each one was reachable from the UI, none of them failed a test.
//
// helpers/integration.js must be imported before ../app.js — see the safety
// note in that file.
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import { seedSettings, signIn, useMemoryDatabase, daysFromToday, PICKUP_SLOT } from "./helpers/integration.js";
import { makeProduct } from "./helpers/factories.js";
import app from "../app.js";
import Customer from "../models/Customer.js";
import Invoice from "../models/Invoice.js";
import { toCSV } from "../utils/csv.js";

useMemoryDatabase();

let owner;

beforeEach(async () => {
  await seedSettings();
  owner = await signIn("owner");
});

// ---------------------------------------------------------------------------
// Search boxes built a RegExp straight from what the user typed. "(" is a
// perfectly ordinary thing to type (a phone number, "Cake (1kg)") and it threw
// a SyntaxError, which the error handler turned into a 500. Every list screen
// with a search box was affected.
// ---------------------------------------------------------------------------
describe("search input is treated as text, not a pattern", () => {
  const nasty = ["(", ")", "[", "*", ".*", "cake (", "\\"];

  it("does not 500 on regex metacharacters in the invoice search", async () => {
    for (const term of nasty) {
      const res = await request(app)
        .get("/api/invoices")
        .query({ search: term })
        .set("Authorization", owner.auth);
      expect(res.status, `search=${JSON.stringify(term)}`).toBe(200);
    }
  });

  it("does not 500 on regex metacharacters in the customer search", async () => {
    for (const term of nasty) {
      const res = await request(app)
        .get("/api/customers")
        .query({ search: term })
        .set("Authorization", owner.auth);
      expect(res.status, `search=${JSON.stringify(term)}`).toBe(200);
    }
  });

  it("still finds a real invoice by a substring of its number", async () => {
    const customer = await Customer.create({ name: "Search Target", phone: "9800000001" });
    await Invoice.create({
      invoiceNumber: "INV-2026-0777",
      customer: customer._id,
      customerSnapshot: { name: customer.name, phone: customer.phone },
      lines: [{ description: "Cake", quantity: 1, unitPrice: 100, amount: 100 }],
      subtotal: 100,
      total: 100,
      balanceDue: 100,
    });

    const res = await request(app)
      .get("/api/invoices")
      .query({ search: "0777" })
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.invoices.map((i) => i.invoiceNumber)).toContain("INV-2026-0777");
  });

  it("treats a wildcard as a literal, not as 'match everything'", async () => {
    await Customer.create({ name: "Literal Star", phone: "9800000002" });

    const res = await request(app)
      .get("/api/customers")
      .query({ search: ".*" })
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Settings were written straight onto the document with no range checks, so a
// typo'd tax rate of -18 halved every order total and nothing complained.
// ---------------------------------------------------------------------------
describe("settings reject values that would corrupt money", () => {
  const put = (body) =>
    request(app).put("/api/settings").set("Authorization", owner.auth).send(body);

  it("refuses a negative tax rate", async () => {
    const res = await put({ tax: { enabled: true, rate: -18, label: "GST", inclusive: false } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Tax rate/i);
  });

  it("refuses a tax rate above 100", async () => {
    const res = await put({ tax: { enabled: true, rate: 180, label: "GST", inclusive: false } });
    expect(res.status).toBe(400);
  });

  it("refuses a non-numeric tax rate instead of storing NaN", async () => {
    const res = await put({ tax: { enabled: true, rate: "eighteen", label: "GST", inclusive: false } });
    expect(res.status).toBe(400);
  });

  it("still accepts a normal rate", async () => {
    const res = await put({ tax: { enabled: true, rate: 18, label: "GST", inclusive: false } });
    expect(res.status).toBe(200);
    expect(res.body.settings.tax.rate).toBe(18);
  });

  it("refuses a negative delivery fee", async () => {
    const res = await put({ delivery: { enabled: true, fee: -50, freeOver: 0, pincodes: [] } });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// CSV exports carried customer-supplied text. A cell starting with "=" is a
// formula to Excel, so a customer name could run in the owner's spreadsheet.
// ---------------------------------------------------------------------------
describe("CSV export neutralises formulas", () => {
  const columns = [
    { key: "name", label: "Name" },
    { key: "amount", label: "Amount" },
  ];

  it("prefixes a formula-leading name with an apostrophe", () => {
    const csv = toCSV([{ name: '=HYPERLINK("http://evil","click")', amount: 100 }], columns);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
  });

  it("covers every formula lead character", () => {
    for (const lead of ["=", "+", "-", "@"]) {
      const csv = toCSV([{ name: `${lead}cmd`, amount: 1 }], columns);
      expect(csv).toContain(`'${lead}cmd`);
    }
  });

  it("leaves real numbers alone so negatives stay numeric", () => {
    const csv = toCSV([{ name: "Refund", amount: -500 }], columns);
    expect(csv).toContain(",-500");
    expect(csv).not.toContain("'-500");
  });

  it("keeps ordinary text untouched", () => {
    const csv = toCSV([{ name: "Vikram Desai", amount: 1200 }], columns);
    expect(csv).toContain("Vikram Desai,1200");
  });
});

// ---------------------------------------------------------------------------
// "Delivery fee (₹)" and "Free over (₹)" were editable on the Settings screen
// and read by nothing: every delivery was billed per kilometre regardless. The
// fields now do what they say, and both default to 0 so an untouched store
// charges exactly what it charged before.
// ---------------------------------------------------------------------------
describe("delivery fee honours the settings screen", () => {
  const address = {
    line1: "12 Hill Road",
    city: "Mumbai",
    pincode: "400050",
    latitude: 19.12,
    longitude: 72.83,
  };

  const checkout = async (product) => {
    const res = await request(app).post("/api/orders").send({
      items: [{ productId: String(product._id), quantity: 2 }],
      customer: { name: "Delivery Test", phone: "9876500099" },
      fulfilment: { type: "delivery", date: daysFromToday(5), slot: PICKUP_SLOT, address },
      paymentMethod: "cash",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.order;
  };

  const withDelivery = (delivery) =>
    seedSettings({ delivery: { enabled: true, fee: 0, freeOver: 0, pincodes: [], ...delivery } });

  it("charges per kilometre when neither field is set", async () => {
    await withDelivery({});
    const order = await checkout(await makeProduct({ basePrice: 1000 }));
    expect(order.deliveryFee).toBeGreaterThan(0);
  });

  it("uses the flat fee when one is configured", async () => {
    await withDelivery({ fee: 100 });
    const order = await checkout(await makeProduct({ basePrice: 1000 }));
    expect(order.deliveryFee).toBe(100);
  });

  it("drops the fee once the basket reaches the free-over threshold", async () => {
    // Two cakes at ₹1000 make a ₹2000 basket.
    await withDelivery({ freeOver: 1500 });
    const order = await checkout(await makeProduct({ basePrice: 1000 }));
    expect(order.deliveryFee).toBe(0);
  });

  it("still charges below the threshold", async () => {
    await withDelivery({ freeOver: 5000 });
    const order = await checkout(await makeProduct({ basePrice: 1000 }));
    expect(order.deliveryFee).toBeGreaterThan(0);
  });

  it("refuses delivery entirely when it is switched off", async () => {
    await withDelivery({ enabled: false });
    const product = await makeProduct({ basePrice: 1000 });
    const res = await request(app).post("/api/orders").send({
      items: [{ productId: String(product._id), quantity: 2 }],
      customer: { name: "Delivery Off", phone: "9876500098" },
      fulfilment: { type: "delivery", date: daysFromToday(5), slot: PICKUP_SLOT, address },
      paymentMethod: "cash",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not available/i);
  });
});

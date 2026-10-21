// Uniform orders & invoices, plus delete guards and the LTV/outstanding
// reconciliation.
//
// Orders are the single source of truth for a customer's money. These tests pin:
//   - a manual order accepts a discount and that discount reaches its invoice;
//   - a discount larger than the subtotal is rejected;
//   - orders and invoices can be deleted, but only when no money is on them;
//   - customer "outstanding" is derived from orders, never from a standalone
//     invoice, so it can never exceed lifetime value.
//
// helpers/integration.js must be imported before ../app.js — see the safety
// note in that file.
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import {
  NO_TAX,
  PICKUP_SLOT,
  daysFromToday,
  seedSettings,
  signIn,
  useMemoryDatabase,
} from "./helpers/integration.js";
import {
  linkedInvoiceAndOrder,
  makeCustomer,
  makeInvoice,
  makeOrder,
  makeProduct,
  orderItem,
} from "./helpers/factories.js";
import app from "../app.js";
import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";

useMemoryDatabase();

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

let owner;

beforeEach(async () => {
  owner = await signIn("owner");
});

const manualBody = (customer, overrides = {}) => ({
  customerId: String(customer._id),
  source: "walk_in",
  items: [{ name: "Custom tiered cake", unitPrice: 2500, quantity: 1 }],
  fulfilment: { type: "pickup", date: daysFromToday(4), slot: PICKUP_SLOT },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Discount on a manual order reaches its invoice
// ---------------------------------------------------------------------------

describe("POST /api/orders/manual discount", () => {
  it("stores the discount and the discounted total", async () => {
    await seedSettings({ tax: NO_TAX });
    const customer = await makeCustomer();

    const res = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer, { discount: 500 }));

    expect(res.status).toBe(201);
    expect(res.body.order.discount).toBe(500);
    expect(res.body.order.grandTotal).toBe(2000);
  });

  it("carries the discount onto the invoice raised from it", async () => {
    await seedSettings({ tax: NO_TAX });
    const customer = await makeCustomer();

    const created = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer, { discount: 500 }));

    const inv = await request(app)
      .post(`/api/invoices/from-order/${created.body.order._id}`)
      .set("Authorization", owner.auth)
      .send();

    expect(inv.status).toBe(201);
    expect(inv.body.invoice.discount).toBe(500);
    expect(inv.body.invoice.total).toBe(2000);
  });

  it("rejects a discount larger than the subtotal", async () => {
    await seedSettings({ tax: NO_TAX });
    const customer = await makeCustomer();

    const res = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer, { discount: 3000 }));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Discount cannot exceed");
  });
});

describe("POST /api/orders/manual B2B items", () => {
  const b2bBody = (customer, product, overrides = {}) => ({
    customerId: String(customer._id),
    source: "bni",
    items: [{ productId: String(product._id), quantity: 2, useB2bPrice: true }],
    fulfilment: { type: "pickup", date: daysFromToday(4), slot: PICKUP_SLOT },
    ...overrides,
  });

  it("prices a catalogue item at its B2B rate when useB2bPrice is set", async () => {
    await seedSettings({ tax: NO_TAX });
    const customer = await makeCustomer();
    const product = await makeProduct({ basePrice: 500, b2bPrice: 300 });

    const res = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(b2bBody(customer, product));

    expect(res.status).toBe(201);
    expect(res.body.order.items[0].unitPrice).toBe(300);
    expect(res.body.order.items[0].isB2b).toBe(true);
    expect(res.body.order.grandTotal).toBe(600);
  });

  it("prefers a variant's B2B rate over the product-level one", async () => {
    await seedSettings({ tax: NO_TAX });
    const customer = await makeCustomer();
    const product = await makeProduct({
      basePrice: 500,
      b2bPrice: 300,
      variants: [{ name: "Box of 6", price: 500, b2bPrice: 250 }],
    });

    const res = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(b2bBody(customer, product, {
        items: [{ productId: String(product._id), variantName: "Box of 6", quantity: 1, useB2bPrice: true }],
      }));

    expect(res.status).toBe(201);
    expect(res.body.order.items[0].unitPrice).toBe(250);
  });

  it("refuses a B2B line when the product has no B2B price", async () => {
    await seedSettings({ tax: NO_TAX });
    const customer = await makeCustomer();
    const product = await makeProduct({ basePrice: 500 });

    const res = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(b2bBody(customer, product));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("B2B price");
  });
});

// ---------------------------------------------------------------------------
// Delete endpoints
// ---------------------------------------------------------------------------

describe("DELETE /api/orders/:id", () => {
  it("deletes a website order", async () => {
    const order = await makeOrder({ items: [orderItem()] });

    const res = await request(app)
      .delete(`/api/orders/${order._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(await Order.findById(order._id)).toBeNull();
  });

  it("deletes an order that has recorded payments", async () => {
    const order = await makeOrder({ items: [orderItem()], amountPaid: 500, source: "walk_in" });

    const res = await request(app)
      .delete(`/api/orders/${order._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(await Order.findById(order._id)).toBeNull();
  });

  it("deletes an order linked to a live invoice and removes that invoice", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder({ order: { source: "walk_in" } });

    const res = await request(app)
      .delete(`/api/orders/${order._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(await Order.findById(order._id)).toBeNull();
    expect(await Invoice.findById(invoice._id)).toBeNull();
  });

  it("deletes a clean manual order", async () => {
    await seedSettings({ tax: NO_TAX });
    const customer = await makeCustomer();

    const created = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer));

    const res = await request(app)
      .delete(`/api/orders/${created.body.order._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(await Order.findById(created.body.order._id)).toBeNull();
  });
});

describe("DELETE /api/invoices/:id", () => {
  it("deletes an invoice that has money on it", async () => {
    const { invoice } = await linkedInvoiceAndOrder({ invoice: { amountPaid: 1000 } });

    const res = await request(app)
      .delete(`/api/invoices/${invoice._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(await Invoice.findById(invoice._id)).toBeNull();
  });

  it("unlinks the order when an unpaid invoice is deleted, so it can be re-invoiced", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder();

    const res = await request(app)
      .delete(`/api/invoices/${invoice._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);

    const reloaded = await Order.findById(order._id).select("invoice");
    expect(reloaded.invoice).toBeUndefined();

    // The order can now raise a replacement invoice.
    const reopened = await request(app)
      .post(`/api/invoices/from-order/${order._id}`)
      .set("Authorization", owner.auth)
      .send();
    expect(reopened.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Outstanding is derived from orders, so it can never exceed lifetime value
// ---------------------------------------------------------------------------

describe("customer outstanding reconciles with lifetime value", () => {
  it("counts orders and standalone invoices together in the customer list and detail", async () => {
    await seedSettings({ tax: NO_TAX });
    const customer = await makeCustomer();

    // A single order worth ₹5,000 with ₹1,000 paid → 4000 from the order.
    await makeOrder({ customer, items: [orderItem({ unitPrice: 5000 })], amountPaid: 1000 });
    // A standalone invoice of ₹20,000 adds its full balance on top, so the
    // customer total no longer disagrees with the invoices on their file.
    await makeInvoice({ customer, lines: [{ description: "Big standalone", unitPrice: 20000, quantity: 1 }] });

    const detail = await request(app)
      .get(`/api/customers/${customer._id}`)
      .set("Authorization", owner.auth);
    expect(detail.body.metrics.lifetimeValue).toBe(25000);
    expect(detail.body.metrics.outstanding).toBe(24000);

    const list = await request(app)
      .get("/api/customers")
      .set("Authorization", owner.auth);
    const row = list.body.customers.find((c) => String(c._id) === String(customer._id));
    expect(row.lifetimeValue).toBe(25000);
    expect(row.outstanding).toBe(24000);
  });
});

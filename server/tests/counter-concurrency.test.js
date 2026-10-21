// Concurrency around the number series. A bakery's busiest minute is the one
// where two checkouts land together, and both of them need a number.
//
// Counter.next() is the only thing standing between that and two orders sharing
// a number. Its $inc-under-upsert is atomic, but the *first* use of a key is two
// inserts racing, and Mongo rejects the loser with a duplicate key — which used
// to escape and fail the checkout. These tests hammer a fresh key on purpose,
// because that is the case with the hole in it.
//
// helpers/integration.js must be imported before ../app.js — see the safety
// note in that file.
import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import request from "supertest";

import {
  PICKUP_SLOT,
  daysFromToday,
  seedSettings,
  signIn,
  useMemoryDatabase,
} from "./helpers/integration.js";
import { makeCustomer, makeOrder, makeProduct, orderItem } from "./helpers/factories.js";
import app from "../app.js";
import Counter from "../models/Counter.js";
import Customer from "../models/Customer.js";
import Invoice from "../models/Invoice.js";
import Order from "../models/Order.js";
import { nextInvoiceNumber, nextOrderNumber } from "../utils/numbers.js";

useMemoryDatabase();

const CONCURRENCY = 50;
const times = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
const unique = (values) => new Set(values).size;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("Counter.next under concurrency", () => {
  it("has the unique index that makes the race real", async () => {
    // If key were not unique, concurrent upserts would quietly insert several
    // counter documents and every test below would pass for the wrong reason.
    const indexes = await Counter.collection.indexes();
    const onKey = indexes.find((index) => index.key?.key === 1);
    expect(onKey?.unique).toBe(true);
  });

  it("hands out 50 unique sequential numbers on a key it has never seen", async () => {
    const results = await Promise.all(times(CONCURRENCY, () => Counter.next("order-fresh")));

    expect(results).toHaveLength(CONCURRENCY);
    expect(unique(results)).toBe(CONCURRENCY);
    // Not merely distinct: a contiguous run from 1, so nothing was skipped
    // either.
    expect([...results].sort((a, b) => a - b)).toEqual(times(CONCURRENCY, (i) => i + 1));
  });

  it("leaves exactly one counter document, holding the final sequence", async () => {
    await Promise.all(times(CONCURRENCY, () => Counter.next("order-fresh")));

    expect(await Counter.countDocuments({ key: "order-fresh" })).toBe(1);
    expect((await Counter.findOne({ key: "order-fresh" })).seq).toBe(CONCURRENCY);
  });

  it("does not let the first-insert duplicate key escape to the caller", async () => {
    // The retry is the fix being tested. A rejection here is a failed checkout.
    const settled = await Promise.allSettled(times(CONCURRENCY, () => Counter.next("order-fresh")));
    const rejected = settled.filter((entry) => entry.status === "rejected");

    expect(rejected.map((entry) => entry.reason?.message)).toEqual([]);
    expect(settled.every((entry) => Number.isInteger(entry.value))).toBe(true);
  });

  it("continues cleanly from a key that already exists", async () => {
    expect(await Counter.next("invoice-INV-2026")).toBe(1);

    const results = await Promise.all(times(CONCURRENCY, () => Counter.next("invoice-INV-2026")));

    expect(unique(results)).toBe(CONCURRENCY);
    expect([...results].sort((a, b) => a - b)).toEqual(times(CONCURRENCY, (i) => i + 2));
  });

  it("keeps separate keys on separate series when both are new", async () => {
    const interleaved = await Promise.all(
      times(CONCURRENCY, (i) => Counter.next(i % 2 === 0 ? "order-2026" : "invoice-INV-2026"))
    );

    const orders = interleaved.filter((_, i) => i % 2 === 0);
    const invoices = interleaved.filter((_, i) => i % 2 !== 0);
    expect([...orders].sort((a, b) => a - b)).toEqual(times(CONCURRENCY / 2, (i) => i + 1));
    expect([...invoices].sort((a, b) => a - b)).toEqual(times(CONCURRENCY / 2, (i) => i + 1));
  });

  it("formats unique order and invoice numbers from the same contention", async () => {
    const [orders, invoices] = await Promise.all([
      Promise.all(times(20, () => nextOrderNumber())),
      Promise.all(times(20, () => nextInvoiceNumber())),
    ]);

    expect(unique(orders)).toBe(20);
    expect(unique(invoices)).toBe(20);
    expect(orders.every((number) => /^CS-\d{4}-\d{4}$/.test(number))).toBe(true);
    expect(invoices.every((number) => /^INV-\d{4}-\d{4}$/.test(number))).toBe(true);
  });
});

describe("concurrent order creation", () => {
  beforeEach(async () => {
    await seedSettings();
  });

  it("gives every simultaneous storefront checkout its own order number", async () => {
    const product = await makeProduct({ basePrice: 900 });
    const checkout = (i) => request(app).post("/api/orders").send({
      items: [{ productId: String(product._id), quantity: 1 }],
      customer: { name: `Rush ${i}`, phone: `98765${String(i).padStart(5, "0")}` },
      fulfilment: { type: "pickup", date: daysFromToday(5), slot: PICKUP_SLOT },
      paymentMethod: "cash",
    });

    const responses = await Promise.all(times(20, checkout));

    expect(responses.map((res) => res.status)).toEqual(times(20, () => 201));
    const numbers = responses.map((res) => res.body.order.orderNumber);
    expect(unique(numbers)).toBe(20);
    // And the same count survived to the database, so no write was lost.
    expect(await Order.countDocuments()).toBe(20);
    expect(unique((await Order.find().select("orderNumber")).map((o) => o.orderNumber))).toBe(20);
  }, 60000);

  it("serves one customer opening several tabs at once without a server fault", async () => {
    // Two devices, one phone number. findOrCreateCustomer looks the customer up
    // and then inserts, so the loser of that race hit the unique index on phone
    // and the checkout died with a 500 rather than an order.
    const product = await makeProduct({ basePrice: 900 });
    const checkout = () => request(app).post("/api/orders").send({
      items: [{ productId: String(product._id), quantity: 1 }],
      customer: { name: "Double Tap", phone: "9876512345" },
      fulfilment: { type: "pickup", date: daysFromToday(5), slot: PICKUP_SLOT },
      paymentMethod: "cash",
    });

    const responses = await Promise.all(times(6, checkout));

    expect(responses.filter((res) => res.status >= 500)).toEqual([]);
    expect(responses.map((res) => res.status)).toEqual(times(6, () => 201));
    // One person, one account, whichever request created it.
    expect(await Customer.countDocuments({ phone: "9876512345" })).toBe(1);
    expect(unique(responses.map((res) => res.body.order.orderNumber))).toBe(6);
  }, 60000);

  it("gives every simultaneous manual order its own number too", async () => {
    const customer = await makeCustomer();
    const owner = await signIn("owner");
    const submit = (i) => request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send({
        customerId: String(customer._id),
        source: "walk_in",
        items: [{ name: `Counter cake ${i}`, unitPrice: 700, quantity: 1 }],
        fulfilment: { type: "pickup", date: daysFromToday(4), slot: PICKUP_SLOT },
      });

    const responses = await Promise.all(times(15, submit));

    expect(responses.map((res) => res.status)).toEqual(times(15, () => 201));
    expect(unique(responses.map((res) => res.body.order.orderNumber))).toBe(15);
  }, 60000);
});

describe("concurrent invoice creation", () => {
  beforeEach(async () => {
    await seedSettings();
  });

  it("gives every invoice raised at once its own number", async () => {
    const accounts = await signIn("accounts");
    const orders = [];
    for (let i = 0; i < 12; i += 1) {
      const customer = await makeCustomer();
      orders.push(await makeOrder({ customer, items: [orderItem({ unitPrice: 1000 })] }));
    }

    const responses = await Promise.all(
      orders.map((order) => request(app)
        .post(`/api/invoices/from-order/${order._id}`)
        .set("Authorization", accounts.auth))
    );

    expect(responses.map((res) => res.status)).toEqual(times(12, () => 201));
    expect(unique(responses.map((res) => res.body.invoice.invoiceNumber))).toBe(12);
    expect(await Invoice.countDocuments()).toBe(12);
  }, 60000);

  it("still refuses a duplicate invoice when the same order is submitted twice at once", async () => {
    const accounts = await signIn("accounts");
    const customer = await makeCustomer();
    const order = await makeOrder({ customer });

    const raise = () => request(app)
      .post(`/api/invoices/from-order/${order._id}`)
      .set("Authorization", accounts.auth);
    const [a, b] = await Promise.all([raise(), raise()]);

    // Both reads see no invoice, so both may create one — but an order can only
    // point at a single invoice, and a second billing document for one order is
    // a double charge waiting to be chased.
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await Invoice.countDocuments({ order: order._id })).toBe(1);
    expect(mongoose.isValidObjectId((await Order.findById(order._id)).invoice)).toBe(true);
  }, 60000);
});

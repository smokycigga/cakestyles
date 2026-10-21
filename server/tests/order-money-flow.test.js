// Money on an order and on its invoice: what each of the three order-creation
// paths stores, and what happens to the pair when a payment is recorded on
// either side or the order is cancelled.
//
// Every total is asserted against utils/pricing.js rather than a literal. The
// point is that the controllers use the pricing engine — a hardcoded expectation
// would pass just as happily against a second, divergent implementation.
//
// helpers/integration.js must be imported before ../app.js — see the safety
// note in that file.
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import {
  EXCLUSIVE_TAX,
  INCLUSIVE_TAX,
  PICKUP_SLOT,
  daysFromToday,
  missingId,
  seedSettings,
  signIn,
  useMemoryDatabase,
} from "./helpers/integration.js";
import {
  linkedInvoiceAndOrder,
  makeCustomer,
  makeEnquiry,
  makeInvoiceForOrder,
  makeOrder,
  makeProduct,
  orderItem,
} from "./helpers/factories.js";
import app from "../app.js";
import Invoice from "../models/Invoice.js";
import Order from "../models/Order.js";
import Enquiry from "../models/Enquiry.js";
import { computeTotals, invoiceTotalsFromOrder, round2 } from "../utils/pricing.js";

useMemoryDatabase();

// utils/notify.js logs every order and invoice event to the console. Keeping it
// quiet leaves a failure readable; nothing here asserts on it.
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

let owner;
let accounts;

beforeEach(async () => {
  owner = await signIn("owner");
  accounts = await signIn("accounts");
});

const expectTotals = (stored, expected) => {
  expect(stored.subtotal).toBe(expected.subtotal);
  expect(stored.discount).toBe(expected.discount);
  expect(stored.deliveryFee).toBe(expected.deliveryFee);
  expect(stored.taxRate).toBe(expected.taxRate);
  expect(stored.taxTotal).toBe(expected.taxTotal);
  expect(stored.grandTotal).toBe(expected.grandTotal);
};

// ---------------------------------------------------------------------------
// Path 1: the storefront
// ---------------------------------------------------------------------------

describe("POST /api/orders — storefront checkout totals", () => {
  const checkoutBody = (product, overrides = {}) => ({
    items: [{ productId: String(product._id), quantity: 2 }],
    customer: { name: "Ada Baker", phone: "9876500011", email: "ada@example.test" },
    fulfilment: { type: "pickup", date: daysFromToday(5), slot: PICKUP_SLOT },
    paymentMethod: "cash",
    ...overrides,
  });

  it("prices from the catalogue and stores exclusive tax on top of the subtotal", async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const product = await makeProduct({ basePrice: 1000 });

    const res = await request(app).post("/api/orders").send(checkoutBody(product));

    expect(res.status).toBe(201);
    const expected = computeTotals({
      items: [{ unitPrice: 1000, quantity: 2 }],
      taxRate: EXCLUSIVE_TAX.rate,
      taxInclusive: false,
    });
    expectTotals(res.body.order, expected);
    expect(expected.taxTotal).toBe(360);
    expect(expected.grandTotal).toBe(2360);
  });

  it("extracts inclusive tax from the price instead of adding it", async () => {
    await seedSettings({ tax: INCLUSIVE_TAX });
    const product = await makeProduct({ basePrice: 1000 });

    const res = await request(app).post("/api/orders").send(checkoutBody(product));

    const expected = computeTotals({
      items: [{ unitPrice: 1000, quantity: 2 }],
      taxRate: INCLUSIVE_TAX.rate,
      taxInclusive: true,
    });
    expectTotals(res.body.order, expected);
    // The customer pays the shelf price; the tax figure is informational.
    expect(res.body.order.grandTotal).toBe(2000);
    expect(res.body.order.taxTotal).toBeGreaterThan(0);
  });

  it("stores no tax at all when the store has tax switched off", async () => {
    await seedSettings();
    const product = await makeProduct({ basePrice: 1000 });

    const res = await request(app).post("/api/orders").send(checkoutBody(product));

    expectTotals(res.body.order, computeTotals({ items: [{ unitPrice: 1000, quantity: 2 }] }));
    expect(res.body.order.taxRate).toBe(0);
    expect(res.body.order.taxTotal).toBe(0);
  });

  it("charges add-ons through the line total, at the product's prices", async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const product = await makeProduct({ basePrice: 1000, addOns: [{ name: "Candles", price: 50 }] });

    const res = await request(app)
      .post("/api/orders")
      .send(checkoutBody(product, {
        items: [{ productId: String(product._id), quantity: 2, addOns: ["Candles"] }],
      }));

    expect(res.status).toBe(201);
    expect(res.body.order.items[0].lineTotal).toBe(2100);
    expectTotals(
      res.body.order,
      computeTotals({ items: [{ unitPrice: 1000, quantity: 2, addOns: [{ price: 50 }] }], taxRate: 18 })
    );
  });

  it("adds a delivery fee without taxing it", async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const product = await makeProduct({ basePrice: 1000 });

    const res = await request(app)
      .post("/api/orders")
      .send(checkoutBody(product, {
        fulfilment: {
          type: "delivery",
          date: daysFromToday(5),
          address: {
            line1: "12 Hill Road", city: "Mumbai", pincode: "400050",
            latitude: 19.12, longitude: 72.83,
          },
        },
      }));

    expect(res.status).toBe(201);
    const fee = res.body.order.deliveryFee;
    expect(fee).toBeGreaterThan(0);
    // The fee is fed back in rather than recomputed here: what is under test is
    // that tax is charged on the goods only, whatever the distance came to.
    expectTotals(
      res.body.order,
      computeTotals({ items: [{ unitPrice: 1000, quantity: 2 }], deliveryFee: fee, taxRate: 18 })
    );
  });

  it("opens with nothing paid and a pending payment", async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const product = await makeProduct({ basePrice: 1000 });

    const res = await request(app).post("/api/orders").send(checkoutBody(product));

    expect(res.body.order.amountPaid).toBe(0);
    expect(res.body.order.payment.status).toBe("pending");
    expect(res.body.order.status).toBe("confirmed");
  });
});

// ---------------------------------------------------------------------------
// Path 2: the admin manual order
// ---------------------------------------------------------------------------

describe("POST /api/orders/manual totals", () => {
  const manualBody = (customer, overrides = {}) => ({
    customerId: String(customer._id),
    source: "walk_in",
    items: [{ name: "Custom tiered cake", unitPrice: 2500, quantity: 1 }],
    fulfilment: { type: "pickup", date: daysFromToday(4), slot: PICKUP_SLOT },
    ...overrides,
  });

  it("charges a walk-in the same tax as the storefront", async () => {
    // Omitting it billed a walk-in a different price for an identical basket and
    // left the tax row off their invoice.
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const customer = await makeCustomer();

    const res = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer));

    expect(res.status).toBe(201);
    expectTotals(
      res.body.order,
      computeTotals({ items: [{ unitPrice: 2500, quantity: 1 }], taxRate: 18 })
    );
    expect(res.body.order.grandTotal).toBe(2950);
  });

  it("stores inclusive tax the same way the storefront does", async () => {
    await seedSettings({ tax: INCLUSIVE_TAX });
    const customer = await makeCustomer();

    const res = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer));

    expectTotals(
      res.body.order,
      computeTotals({ items: [{ unitPrice: 2500, quantity: 1 }], taxRate: 5, taxInclusive: true })
    );
    expect(res.body.order.grandTotal).toBe(2500);
  });

  it("records a deposit as a partial payment against the taxed total", async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const customer = await makeCustomer();

    const res = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer, { deposit: { amount: 1000, method: "upi" } }));

    expect(res.status).toBe(201);
    expect(res.body.order.amountPaid).toBe(1000);
    expect(res.body.order.payment.status).toBe("partial");
    expect(res.body.order.payment.payments).toHaveLength(1);
  });

  it("marks the order paid when the deposit covers the taxed total", async () => {
    // 2500 would have settled an untaxed order; against 2950 it must not.
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const customer = await makeCustomer();

    const short = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer, { deposit: { amount: 2500, method: "cash" } }));
    expect(short.body.order.payment.status).toBe("partial");

    const full = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer, { deposit: { amount: 2950, method: "cash" } }));
    expect(full.body.order.payment.status).toBe("paid");
  });

  it("refuses a deposit larger than the order total", async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const customer = await makeCustomer();

    const res = await request(app)
      .post("/api/orders/manual")
      .set("Authorization", owner.auth)
      .send(manualBody(customer, { deposit: { amount: 5000, method: "cash" } }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Deposit exceeds order total");
  });
});

// ---------------------------------------------------------------------------
// Path 3: converting an enquiry
// ---------------------------------------------------------------------------

describe("POST /api/enquiries/:id/convert totals", () => {
  const convertBody = (overrides = {}) => ({
    amount: 4000,
    fulfilment: { type: "pickup", date: daysFromToday(14), slot: PICKUP_SLOT },
    ...overrides,
  });

  it("applies the store's tax to the quoted amount", async () => {
    // Pinned regression: a converted enquiry used to be stored untaxed, so the
    // same custom cake cost a different amount depending on which screen created
    // it, and its invoice came out with no tax row at all.
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const enquiry = await makeEnquiry();

    const res = await request(app)
      .post(`/api/enquiries/${enquiry._id}/convert`)
      .set("Authorization", owner.auth)
      .send(convertBody());

    expect(res.status).toBe(201);
    expectTotals(res.body.order, computeTotals({ items: [{ unitPrice: 4000, quantity: 1 }], taxRate: 18 }));
    expect(res.body.order.grandTotal).toBe(4720);
    expect(res.body.order.subtotal).toBe(4000);
  });

  it("extracts inclusive tax from the quote rather than adding to it", async () => {
    await seedSettings({ tax: INCLUSIVE_TAX });
    const enquiry = await makeEnquiry();

    const res = await request(app)
      .post(`/api/enquiries/${enquiry._id}/convert`)
      .set("Authorization", owner.auth)
      .send(convertBody());

    expectTotals(
      res.body.order,
      computeTotals({ items: [{ unitPrice: 4000, quantity: 1 }], taxRate: 5, taxInclusive: true })
    );
    // The quote is what the customer was told they would pay.
    expect(res.body.order.grandTotal).toBe(4000);
  });

  it("measures the deposit against the taxed total, not the quote", async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const enquiry = await makeEnquiry();

    const res = await request(app)
      .post(`/api/enquiries/${enquiry._id}/convert`)
      .set("Authorization", owner.auth)
      .send(convertBody({ deposit: { amount: 4000, method: "upi" } }));

    expect(res.status).toBe(201);
    expect(res.body.order.amountPaid).toBe(4000);
    // 4000 settled the old untaxed order in full; against 4720 it is a deposit.
    expect(res.body.order.payment.status).toBe("partial");
  });

  it("refuses a deposit above the quoted amount", async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const enquiry = await makeEnquiry();

    const res = await request(app)
      .post(`/api/enquiries/${enquiry._id}/convert`)
      .set("Authorization", owner.auth)
      .send(convertBody({ deposit: { amount: 9000, method: "upi" } }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Deposit exceeds quoted amount");
  });

  it("stamps the enquiry with the order, the quote and a confirmed status", async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const enquiry = await makeEnquiry();

    const res = await request(app)
      .post(`/api/enquiries/${enquiry._id}/convert`)
      .set("Authorization", owner.auth)
      .send(convertBody());

    const stored = await Enquiry.findById(enquiry._id);
    expect(String(stored.convertedOrder)).toBe(String(res.body.order._id));
    expect(stored.quotedAmount).toBe(4000);
    expect(stored.status).toBe("confirmed");
    expect(String((await Order.findById(res.body.order._id)).enquiry)).toBe(String(enquiry._id));
  });

  it("refuses a second conversion and names the order, not its id", async () => {
    // Staff cannot look up a raw ObjectId, and the first version of this reply
    // gave them one.
    await seedSettings({ tax: EXCLUSIVE_TAX });
    const enquiry = await makeEnquiry();

    const first = await request(app)
      .post(`/api/enquiries/${enquiry._id}/convert`)
      .set("Authorization", owner.auth)
      .send(convertBody());
    const orderNumber = first.body.order.orderNumber;

    const second = await request(app)
      .post(`/api/enquiries/${enquiry._id}/convert`)
      .set("Authorization", owner.auth)
      .send(convertBody());

    expect(second.status).toBe(400);
    expect(second.body.message).toBe(`Already converted to order ${orderNumber}`);
    expect(second.body.message).not.toContain(String(first.body.order._id));
    // The id is still available for the client to navigate with.
    expect(second.body.orderId).toBe(String(first.body.order._id));
    expect(await Order.countDocuments()).toBe(1);
  });

  it("still refuses when the converted order has since been deleted", async () => {
    await seedSettings();
    const order = await makeOrder();
    const enquiry = await makeEnquiry({ convertedOrder: order._id });
    await Order.deleteOne({ _id: order._id });

    const res = await request(app)
      .post(`/api/enquiries/${enquiry._id}/convert`)
      .set("Authorization", owner.auth)
      .send(convertBody());

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("This enquiry has already been converted");
  });

  it("404s an enquiry that does not exist", async () => {
    await seedSettings();
    const res = await request(app)
      .post(`/api/enquiries/${missingId()}/convert`)
      .set("Authorization", owner.auth)
      .send(convertBody());
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Raising an invoice from an order
// ---------------------------------------------------------------------------

describe("POST /api/invoices/from-order/:orderId", () => {
  beforeEach(async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
  });

  it("restates the order's money rather than deriving it again", async () => {
    const customer = await makeCustomer();
    const order = await makeOrder({
      customer,
      items: [orderItem({ unitPrice: 1000, quantity: 2, addOns: [{ name: "Candles", price: 50 }] })],
      deliveryFee: 120,
      discount: 200,
      taxRate: 18,
    });

    const res = await request(app)
      .post(`/api/invoices/from-order/${order._id}`)
      .set("Authorization", accounts.auth);

    expect(res.status).toBe(201);
    const expected = invoiceTotalsFromOrder(order, EXCLUSIVE_TAX.label);
    expect(res.body.invoice.total).toBe(order.grandTotal);
    expect(res.body.invoice.subtotal).toBe(expected.subtotal);
    expect(res.body.invoice.discount).toBe(expected.discount);
    expect(res.body.invoice.tax.amount).toBe(order.taxTotal);
    expect(res.body.invoice.tax.label).toBe("GST");
    // The delivery fee travels as a line, so subtotal - discount + tax = total.
    expect(res.body.invoice.lines.map((l) => l.description)).toContain("Delivery");
  });

  it("keeps a tax-inclusive order's total intact and flags the tax row", async () => {
    await seedSettings({ tax: INCLUSIVE_TAX });
    const customer = await makeCustomer();
    const order = await makeOrder({
      customer,
      items: [orderItem({ unitPrice: 1000, quantity: 2 })],
      taxRate: 5,
      taxInclusive: true,
    });

    const res = await request(app)
      .post(`/api/invoices/from-order/${order._id}`)
      .set("Authorization", accounts.auth);

    // Adding the extracted tax on top again would bill 2100 for a 2000 cake.
    expect(res.body.invoice.total).toBe(2000);
    expect(res.body.invoice.tax.inclusive).toBe(true);
  });

  it("carries the order's payments across and settles the invoice accordingly", async () => {
    const customer = await makeCustomer();
    const order = await makeOrder({ customer, items: [orderItem({ unitPrice: 1000 })], amountPaid: 400 });

    const res = await request(app)
      .post(`/api/invoices/from-order/${order._id}`)
      .set("Authorization", accounts.auth);

    expect(res.body.invoice.amountPaid).toBe(400);
    expect(res.body.invoice.balanceDue).toBe(round2(order.grandTotal - 400));
    expect(res.body.invoice.status).toBe("partially_paid");
  });

  it("marks the invoice paid when the order was already settled in full", async () => {
    const customer = await makeCustomer();
    const order = await makeOrder({ customer, items: [orderItem({ unitPrice: 1000 })] });
    order.amountPaid = order.grandTotal;
    order.payment.payments.push({ amount: order.grandTotal, method: "cash" });
    order.payment.status = "paid";
    await order.save();

    const res = await request(app)
      .post(`/api/invoices/from-order/${order._id}`)
      .set("Authorization", accounts.auth);

    expect(res.body.invoice.status).toBe("paid");
    expect(res.body.invoice.balanceDue).toBe(0);
  });

  it("links both sides and refuses a second invoice for the same order", async () => {
    const customer = await makeCustomer();
    const order = await makeOrder({ customer });

    const first = await request(app)
      .post(`/api/invoices/from-order/${order._id}`)
      .set("Authorization", accounts.auth);
    expect(String((await Order.findById(order._id)).invoice)).toBe(String(first.body.invoice._id));

    const second = await request(app)
      .post(`/api/invoices/from-order/${order._id}`)
      .set("Authorization", accounts.auth);

    expect(second.status).toBe(400);
    expect(second.body.message).toBe("This order already has an invoice");
    expect(await Invoice.countDocuments()).toBe(1);
  });

  it("lets a replacement be raised once the first invoice is cancelled", async () => {
    // Cancelling used to leave order.invoice pointing at the dead document, and
    // this route refuses an order that already has one — so a cancelled invoice
    // locked its order out of being invoiced ever again.
    const { order, invoice } = await linkedInvoiceAndOrder();

    await request(app)
      .put(`/api/invoices/${invoice._id}/status`)
      .set("Authorization", accounts.auth)
      .send({ status: "cancelled" });

    const replacement = await request(app)
      .post(`/api/invoices/from-order/${order._id}`)
      .set("Authorization", accounts.auth);

    expect(replacement.status).toBe(201);
    expect(replacement.body.invoice.invoiceNumber).not.toBe(invoice.invoiceNumber);
  });

  it("404s an order that does not exist", async () => {
    const res = await request(app)
      .post(`/api/invoices/from-order/${missingId()}`)
      .set("Authorization", accounts.auth);
    expect(res.status).toBe(404);
  });

  it("400s a guest order with no customer account to bill", async () => {
    const guest = await makeOrder();
    const res = await request(app)
      .post(`/api/invoices/from-order/${guest._id}`)
      .set("Authorization", accounts.auth);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Order has no linked customer");
  });
});

// ---------------------------------------------------------------------------
// Payments, in both directions
// ---------------------------------------------------------------------------

describe("POST /api/orders/:id/payments", () => {
  beforeEach(async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
  });

  it("moves the order pending → partial → paid at the right thresholds", async () => {
    const order = await makeOrder({ items: [orderItem({ unitPrice: 1000 })] });
    expect(order.payment.status).toBe("pending");

    const pay = (amount) => request(app)
      .post(`/api/orders/${order._id}/payments`)
      .set("Authorization", owner.auth)
      .send({ amount, method: "upi" });

    const partial = await pay(400);
    expect(partial.status).toBe(200);
    expect(partial.body.order.payment.status).toBe("partial");
    expect(partial.body.order.amountPaid).toBe(400);

    const settled = await pay(round2(order.grandTotal - 400));
    expect(settled.body.order.payment.status).toBe("paid");
    expect(settled.body.order.amountPaid).toBe(order.grandTotal);
  });

  it("refuses a payment that would exceed the balance, naming what is left", async () => {
    const order = await makeOrder({ items: [orderItem({ unitPrice: 1000 })], amountPaid: 400 });
    const res = await request(app)
      .post(`/api/orders/${order._id}/payments`)
      .set("Authorization", owner.auth)
      .send({ amount: order.grandTotal, method: "cash" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`Payment exceeds balance due (₹${round2(order.grandTotal - 400)})`);
  });

  it("mirrors the payment onto the linked invoice", async () => {
    // Without this the invoice kept showing the old balance, and the customer
    // was chased for money they had already handed over.
    const { order, invoice } = await linkedInvoiceAndOrder();

    await request(app)
      .post(`/api/orders/${order._id}/payments`)
      .set("Authorization", owner.auth)
      .send({ amount: 500, method: "cash", note: "Deposit at counter" });

    const stored = await Invoice.findById(invoice._id);
    expect(stored.amountPaid).toBe(500);
    expect(stored.balanceDue).toBe(round2(stored.total - 500));
    expect(stored.status).toBe("partially_paid");
    expect(stored.payments).toHaveLength(1);
    expect(stored.payments[0].note).toBe("Deposit at counter");
  });

  it("marks the invoice paid once the order is settled in full", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder();

    await request(app)
      .post(`/api/orders/${order._id}/payments`)
      .set("Authorization", owner.auth)
      .send({ amount: order.grandTotal, method: "cash" });

    const stored = await Invoice.findById(invoice._id);
    expect(stored.status).toBe("paid");
    expect(stored.balanceDue).toBe(0);
  });

  it("leaves a cancelled invoice alone, keeping the money on the order", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder();
    await Invoice.updateOne({ _id: invoice._id }, { $set: { status: "cancelled" } });

    const res = await request(app)
      .post(`/api/orders/${order._id}/payments`)
      .set("Authorization", owner.auth)
      .send({ amount: 500, method: "cash" });

    expect(res.body.order.amountPaid).toBe(500);
    const stored = await Invoice.findById(invoice._id);
    expect(stored.status).toBe("cancelled");
    expect(stored.amountPaid).toBe(0);
  });

  it("confirms an order that was awaiting payment once it is fully paid", async () => {
    const order = await makeOrder({
      items: [orderItem({ unitPrice: 1000 })],
      status: "pending_payment",
      payment: { status: "pending", method: "razorpay", payments: [] },
    });

    const res = await request(app)
      .post(`/api/orders/${order._id}/payments`)
      .set("Authorization", owner.auth)
      .send({ amount: order.grandTotal, method: "razorpay" });

    expect(res.body.order.status).toBe("confirmed");
    expect(res.body.order.statusHistory.at(-1).note).toBe("Payment received");
  });

  it("is refused for a role without finance:write", async () => {
    const staff = await signIn("staff");
    const order = await makeOrder();
    const res = await request(app)
      .post(`/api/orders/${order._id}/payments`)
      .set("Authorization", staff.auth)
      .send({ amount: 100, method: "cash" });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/invoices/:id/payments", () => {
  beforeEach(async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
  });

  it("moves the invoice issued → partially_paid → paid", async () => {
    const { invoice } = await linkedInvoiceAndOrder();

    const pay = (amount) => request(app)
      .post(`/api/invoices/${invoice._id}/payments`)
      .set("Authorization", accounts.auth)
      .send({ amount, method: "bank_transfer" });

    const partial = await pay(300);
    expect(partial.status).toBe(200);
    expect(partial.body.invoice.status).toBe("partially_paid");

    const settled = await pay(round2(invoice.total - 300));
    expect(settled.body.invoice.status).toBe("paid");
    expect(settled.body.invoice.balanceDue).toBe(0);
  });

  it("mirrors the payment onto the linked order", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder();

    await request(app)
      .post(`/api/invoices/${invoice._id}/payments`)
      .set("Authorization", accounts.auth)
      .send({ amount: 500, method: "bank_transfer" });

    const stored = await Order.findById(order._id);
    expect(stored.amountPaid).toBe(500);
    expect(stored.payment.status).toBe("partial");
    expect(stored.payment.payments).toHaveLength(1);
    expect(stored.payment.payments[0].note).toBe(`Via invoice ${invoice.invoiceNumber}`);
  });

  it("confirms an order awaiting payment when the money arrives through the invoice", async () => {
    // Otherwise a fully paid order sits in the queue as "Pending Payment".
    const customer = await makeCustomer();
    const order = await makeOrder({
      customer,
      items: [orderItem({ unitPrice: 1000 })],
      status: "pending_payment",
      payment: { status: "pending", method: "razorpay", payments: [] },
    });
    const invoice = await makeInvoiceForOrder(order);

    await request(app)
      .post(`/api/invoices/${invoice._id}/payments`)
      .set("Authorization", accounts.auth)
      .send({ amount: invoice.total, method: "bank_transfer" });

    const stored = await Order.findById(order._id);
    expect(stored.status).toBe("confirmed");
    expect(stored.payment.status).toBe("paid");
  });

  it("does nothing to any order when the invoice is unlinked", async () => {
    const customer = await makeCustomer();
    const order = await makeOrder({ customer });
    const { invoice } = await linkedInvoiceAndOrder({ customer });
    await Invoice.updateOne({ _id: invoice._id }, { $set: { order: null } });

    await request(app)
      .post(`/api/invoices/${invoice._id}/payments`)
      .set("Authorization", accounts.auth)
      .send({ amount: 200, method: "cash" });

    expect((await Order.findById(order._id)).amountPaid).toBe(0);
  });

  it("refuses a payment beyond the balance and one on a cancelled invoice", async () => {
    const { invoice } = await linkedInvoiceAndOrder();

    const over = await request(app)
      .post(`/api/invoices/${invoice._id}/payments`)
      .set("Authorization", accounts.auth)
      .send({ amount: round2(invoice.total + 1), method: "cash" });
    expect(over.status).toBe(400);
    expect(over.body.message).toContain("Payment exceeds balance due");

    await Invoice.updateOne({ _id: invoice._id }, { $set: { status: "cancelled" } });
    const dead = await request(app)
      .post(`/api/invoices/${invoice._id}/payments`)
      .set("Authorization", accounts.auth)
      .send({ amount: 100, method: "cash" });
    expect(dead.status).toBe(400);
    expect(dead.body.message).toBe("Cannot record payment on a cancelled invoice");
  });
});

describe('PUT /api/invoices/:id/status — "Mark Paid"', () => {
  beforeEach(async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
  });

  it("settles the balance rather than only stamping the status", async () => {
    // A status-only flip produced documents watermarked PAID whose totals block
    // still showed money outstanding.
    const { invoice } = await linkedInvoiceAndOrder();

    const res = await request(app)
      .put(`/api/invoices/${invoice._id}/status`)
      .set("Authorization", accounts.auth)
      .send({ status: "paid" });

    expect(res.status).toBe(200);
    const stored = await Invoice.findById(invoice._id);
    expect(stored.status).toBe("paid");
    expect(stored.amountPaid).toBe(stored.total);
    expect(stored.balanceDue).toBe(0);
    expect(stored.payments.at(-1).ref).toBe("Marked paid");
  });

  it("mirrors the settlement onto the linked order", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder();

    await request(app)
      .put(`/api/invoices/${invoice._id}/status`)
      .set("Authorization", accounts.auth)
      .send({ status: "paid" });

    const stored = await Order.findById(order._id);
    expect(stored.amountPaid).toBe(invoice.total);
    expect(stored.payment.status).toBe("paid");
  });

  it("settles only what is left when a deposit is already recorded", async () => {
    const { invoice } = await linkedInvoiceAndOrder({ invoice: { amountPaid: 500 } });

    await request(app)
      .put(`/api/invoices/${invoice._id}/status`)
      .set("Authorization", accounts.auth)
      .send({ status: "paid" });

    const stored = await Invoice.findById(invoice._id);
    expect(stored.amountPaid).toBe(stored.total);
    expect(stored.payments.at(-1).amount).toBe(round2(invoice.total - 500));
  });

  it("releases the order when the invoice is cancelled", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder();

    await request(app)
      .put(`/api/invoices/${invoice._id}/status`)
      .set("Authorization", accounts.auth)
      .send({ status: "cancelled" });

    expect((await Order.findById(order._id)).invoice).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Cancelling an order
// ---------------------------------------------------------------------------

describe("PUT /api/orders/:id/status cancelling", () => {
  const cancel = (order, auth) => request(app)
    .put(`/api/orders/${order._id}/status`)
    .set("Authorization", auth)
    .send({ status: "cancelled" });

  beforeEach(async () => {
    await seedSettings({ tax: EXCLUSIVE_TAX });
  });

  it("cancels the linked invoice with it, and says so", async () => {
    // The outstanding report and the overdue flag both read open invoices, so a
    // cancelled order's invoice kept dunning for a cake nobody is baking.
    const { order, invoice } = await linkedInvoiceAndOrder();

    const res = await cancel(order, owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.invoiceNote).toBe(`Invoice ${invoice.invoiceNumber} cancelled with it.`);
    expect((await Invoice.findById(invoice._id)).status).toBe("cancelled");
  });

  it("leaves an invoice holding money open and asks for a refund decision", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder({ invoice: { amountPaid: 500 } });

    const res = await cancel(order, owner.auth);

    expect(res.body.invoiceNote).toBe(
      `Invoice ${invoice.invoiceNumber} has payments recorded and was left open — refund it manually.`
    );
    const stored = await Invoice.findById(invoice._id);
    expect(stored.status).not.toBe("cancelled");
    expect(stored.amountPaid).toBe(500);
  });

  it("says nothing about invoices when the order has none", async () => {
    const order = await makeOrder();
    const res = await cancel(order, owner.auth);
    expect(res.status).toBe(200);
    expect(res.body.invoiceNote).toBeUndefined();
    expect(res.body.order.status).toBe("cancelled");
  });

  it("leaves an already-cancelled invoice untouched", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder();
    await Invoice.updateOne({ _id: invoice._id }, { $set: { status: "cancelled" } });

    const res = await cancel(order, owner.auth);

    expect(res.body.invoiceNote).toBeUndefined();
    expect((await Invoice.findById(invoice._id)).status).toBe("cancelled");
  });
});

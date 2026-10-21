// PUT /api/invoices/:id/order — attaching an invoice to the order it bills
// after the fact. The route exists separately from PUT /:id precisely because
// that one locks as soon as money is recorded, so the invoices most in need of
// repair would otherwise be the ones that can never be repaired.
//
// helpers/integration.js must be imported before ../app.js: overwriting
// MONGO_URI at import time is what keeps dotenv from handing app.js the live
// production URI.
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  missingId,
  seedSettings,
  signIn,
  useMemoryDatabase,
} from "./helpers/integration.js";
import {
  linkedInvoiceAndOrder,
  makeCustomer,
  makeInvoice,
  makeOrder,
} from "./helpers/factories.js";
import app from "../app.js";
import AuditLog from "../models/AuditLog.js";
import Invoice from "../models/Invoice.js";
import Order from "../models/Order.js";

useMemoryDatabase();

const linkUrl = (invoiceId) => `/api/invoices/${invoiceId}/order`;

let owner;

beforeEach(async () => {
  await seedSettings();
  owner = await signIn("owner");
});

describe("PUT /api/invoices/:id/order authorization", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const invoice = await makeInvoice();
    const res = await request(app).put(linkUrl(invoice._id)).send({ orderId: null });
    expect(res.status).toBe(401);
  });

  it("rejects a role without finance:write with 403", async () => {
    // A manager can read the books (finance:read) but must not rewire them.
    const manager = await signIn("manager");
    const invoice = await makeInvoice();
    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", manager.auth)
      .send({ orderId: null });
    expect(res.status).toBe(403);
  });

  it("rejects a deactivated user's token with 401 even though the token itself is valid", async () => {
    const dismissed = await signIn("accounts", { active: false });
    const invoice = await makeInvoice();
    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", dismissed.auth)
      .send({ orderId: null });
    expect(res.status).toBe(401);
  });

  it("allows accounts, the other role holding finance:write", async () => {
    const accounts = await signIn("accounts");
    const { invoice, order } = await linkedInvoiceAndOrder();
    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", accounts.auth)
      .send({ orderId: String(order._id) });
    expect(res.status).toBe(200);
  });

  it("requires orderId in the body — unlinking has to be explicit", async () => {
    // Unlike PUT /:id, where orderId is optional and absence means "leave the
    // link alone", this route's whole payload is the link.
    const invoice = await makeInvoice();
    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/invoices/:id/order refusals", () => {
  it("404s an invoice that does not exist", async () => {
    const res = await request(app)
      .put(linkUrl(missingId()))
      .set("Authorization", owner.auth)
      .send({ orderId: null });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Invoice not found");
  });

  it("400s a cancelled invoice", async () => {
    const invoice = await makeInvoice({ status: "cancelled" });
    const order = await makeOrder();
    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(order._id) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cancelled invoice cannot be linked/i);
  });

  it("404s an order that does not exist, leaving the invoice untouched", async () => {
    const { invoice, order } = await linkedInvoiceAndOrder();
    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: missingId() });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Order not found");

    // A refused link must not have released the order already attached.
    const stored = await Invoice.findById(invoice._id);
    expect(String(stored.order)).toBe(String(order._id));
    expect(String((await Order.findById(order._id)).invoice)).toBe(String(invoice._id));
  });

  it("404s a malformed order id instead of failing with a server error", async () => {
    // Guards the regression this suite found: the id went straight to
    // Order.findById, and the resulting CastError surfaced as a 500 with
    // "Something went wrong" — an unhelpful answer to a nonexistent order.
    const invoice = await makeInvoice();
    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: "not-an-object-id" });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Order not found");
  });
});

describe("PUT /api/invoices/:id/order ownership rules", () => {
  it("409s when the target order is already billed by a different invoice, naming the order", async () => {
    // Double-billing one order is the worst outcome here, so it is refused
    // even though the customer matches.
    const customer = await makeCustomer();
    const { order: billedOrder } = await linkedInvoiceAndOrder({ customer });
    const unlinked = await makeInvoice({ customer });

    const res = await request(app)
      .put(linkUrl(unlinked._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(billedOrder._id) });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`${billedOrder.orderNumber} is already invoiced`);
    expect(await Invoice.findById(unlinked._id).then((i) => i.order)).toBeFalsy();
  });

  it("400s when the order belongs to a different customer", async () => {
    const invoice = await makeInvoice({ customer: await makeCustomer() });
    const stranger = await makeCustomer();
    const strangerOrder = await makeOrder({ customer: stranger });

    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(strangerOrder._id) });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`${strangerOrder.orderNumber} belongs to a different customer`);
  });

  it("adopts a guest order whose phone matches the invoice onto that account", async () => {
    // A storefront checkout without an account has no customer to compare, so
    // the phone it was placed with stands in. Rejecting these was the common
    // case: the order that most needs invoicing is the guest one.
    const customer = await makeCustomer();
    const invoice = await makeInvoice({ customer });
    const guestOrder = await makeOrder({
      customerSnapshot: { name: "Walk-in", phone: customer.phone, email: "" },
    });
    expect(guestOrder.customer).toBeFalsy();

    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(guestOrder._id) });

    expect(res.status).toBe(200);
    const stored = await Order.findById(guestOrder._id);
    expect(String(stored.customer)).toBe(String(customer._id));
    expect(String(stored.invoice)).toBe(String(invoice._id));
  });

  it("still refuses a guest order whose phone does not match", async () => {
    const invoice = await makeInvoice({ customer: await makeCustomer() });
    const guestOrder = await makeOrder({
      customerSnapshot: { name: "Someone else", phone: "9111100000", email: "" },
    });

    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(guestOrder._id) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/belongs to a different customer/);
  });
});

describe("PUT /api/invoices/:id/order linking", () => {
  it("writes both sides of the link", async () => {
    const customer = await makeCustomer();
    const invoice = await makeInvoice({ customer });
    const order = await makeOrder({ customer });

    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(order._id) });

    expect(res.status).toBe(200);
    expect(String(res.body.invoice.order)).toBe(String(order._id));
    expect(String((await Invoice.findById(invoice._id)).order)).toBe(String(order._id));
    expect(String((await Order.findById(order._id)).invoice)).toBe(String(invoice._id));
  });

  it("releases the previously linked order when the invoice is pointed at another", async () => {
    // A stale back-link locks the released order out of ever being invoiced:
    // fromOrder refuses any order that already has one.
    const { customer, order: firstOrder, invoice } = await linkedInvoiceAndOrder();
    const secondOrder = await makeOrder({ customer });

    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(secondOrder._id) });

    expect(res.status).toBe(200);
    expect((await Order.findById(firstOrder._id)).invoice).toBeFalsy();
    expect(String((await Order.findById(secondOrder._id)).invoice)).toBe(String(invoice._id));
  });

  it("unlinks on orderId null and releases the order", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder();

    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: null });

    expect(res.status).toBe(200);
    expect(res.body.invoice.order).toBeNull();
    expect(res.body.note).toBe("");
    expect((await Order.findById(order._id)).invoice).toBeFalsy();
  });

  it("is idempotent when re-linked to the order it already points at", async () => {
    const { order, invoice } = await linkedInvoiceAndOrder();

    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(order._id) });

    expect(res.status).toBe(200);
    // The release step must not fire on the order we just linked to.
    expect(String((await Order.findById(order._id)).invoice)).toBe(String(invoice._id));
    expect(String((await Invoice.findById(invoice._id)).order)).toBe(String(order._id));
  });

  it("writes an audit entry naming the invoice and recording the order change", async () => {
    const customer = await makeCustomer();
    const invoice = await makeInvoice({ customer });
    const order = await makeOrder({ customer });

    await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(order._id) });

    const entry = await AuditLog.findOne({ action: "invoice.linkOrder" });
    expect(entry).toBeTruthy();
    expect(String(entry.entityId)).toBe(String(invoice._id));
    expect(entry.actor.name).toBe(owner.user.name);
    expect(entry.meta).toContain(invoice.invoiceNumber);
    expect(entry.meta).toContain(order.orderNumber);
    expect(entry.changes.map((c) => c.field)).toContain("order");
  });

  it("records an unlink in the audit trail as well", async () => {
    const { invoice } = await linkedInvoiceAndOrder();

    await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: null });

    const entry = await AuditLog.findOne({ action: "invoice.linkOrder" });
    expect(entry.meta).toBe(`${invoice.invoiceNumber} → unlinked`);
  });
});

describe("PUT /api/invoices/:id/order on an invoice that has taken money", () => {
  it("links an invoice with payments recorded after editing it", async () => {
    // Invoices with recorded payments can now be edited; the link route remains
    // available for cases where only the order link needs repairing.
    const customer = await makeCustomer();
    const invoice = await makeInvoice({ customer, amountPaid: 500 });
    const order = await makeOrder({ customer });

    const edited = await request(app)
      .put(`/api/invoices/${invoice._id}`)
      .set("Authorization", owner.auth)
      .send({ lines: [{ description: "Cake", quantity: 1, unitPrice: 1200 }], orderId: String(order._id) });
    expect(edited.status).toBe(200);
    expect(String((await Invoice.findById(invoice._id)).order)).toBe(String(order._id));

    const linked = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(order._id) });
    expect(linked.status).toBe(200);
    expect(String((await Invoice.findById(invoice._id)).order)).toBe(String(order._id));
  });

  it("does not copy the invoice's payments onto the order it links to", async () => {
    // Staff routinely record the same deposit on both sides, so mirroring on
    // link would double-count it.
    const customer = await makeCustomer();
    const invoice = await makeInvoice({ customer, amountPaid: 500 });
    const order = await makeOrder({ customer });

    await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(order._id) });

    const stored = await Order.findById(order._id);
    expect(stored.amountPaid).toBe(0);
    expect(stored.payment.payments).toHaveLength(0);
    expect(stored.payment.status).toBe("pending");
    // The invoice keeps its own money untouched too.
    expect((await Invoice.findById(invoice._id)).amountPaid).toBe(500);
  });

  it("reports the difference when the two sides disagree about what has been paid", async () => {
    const customer = await makeCustomer();
    const invoice = await makeInvoice({ customer, amountPaid: 500 });
    const order = await makeOrder({ customer, amountPaid: 200 });

    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(order._id) });

    expect(res.status).toBe(200);
    expect(res.body.note).toContain(order.orderNumber);
    expect(res.body.note).toContain("₹200");
    expect(res.body.note).toContain("₹500");
    expect(res.body.note).toMatch(/record the difference/i);
  });

  it("reports a plain confirmation when both sides agree", async () => {
    const customer = await makeCustomer();
    const invoice = await makeInvoice({ customer, amountPaid: 500 });
    const order = await makeOrder({ customer, amountPaid: 500 });

    const res = await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: String(order._id) });

    expect(res.body.note).toBe(`Linked to ${order.orderNumber}.`);
  });
});

describe("GET /api/invoices/:id linkable orders", () => {
  it("offers the customer's un-billed orders when the invoice is unlinked", async () => {
    const customer = await makeCustomer();
    const invoice = await makeInvoice({ customer });
    const billable = await makeOrder({ customer });

    const res = await request(app)
      .get(`/api/invoices/${invoice._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.linkableOrders.map((o) => o.orderNumber)).toEqual([billable.orderNumber]);
  });

  it("offers nothing once the invoice is linked", async () => {
    const { invoice } = await linkedInvoiceAndOrder();
    const res = await request(app)
      .get(`/api/invoices/${invoice._id}`)
      .set("Authorization", owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.linkableOrders).toEqual([]);
  });

  it("leaves out orders that are already invoiced, cancelled or refunded, and other customers' orders", async () => {
    const customer = await makeCustomer();
    const invoice = await makeInvoice({ customer });
    const billable = await makeOrder({ customer });
    await linkedInvoiceAndOrder({ customer });
    await makeOrder({ customer, status: "cancelled" });
    await makeOrder({ customer, status: "refunded" });
    await makeOrder({ customer: await makeCustomer() });

    const res = await request(app)
      .get(`/api/invoices/${invoice._id}`)
      .set("Authorization", owner.auth);

    expect(res.body.linkableOrders.map((o) => o.orderNumber)).toEqual([billable.orderNumber]);
  });

  it("offers an order released by an earlier unlink", async () => {
    // $unset leaves the field missing rather than null, and the billable filter
    // has to keep matching it.
    const { order, invoice } = await linkedInvoiceAndOrder();
    await request(app)
      .put(linkUrl(invoice._id))
      .set("Authorization", owner.auth)
      .send({ orderId: null });

    const res = await request(app)
      .get(`/api/invoices/${invoice._id}`)
      .set("Authorization", owner.auth);

    expect(res.body.linkableOrders.map((o) => o.orderNumber)).toEqual([order.orderNumber]);
  });

  it("is readable by a manager, who holds finance:read but not finance:write", async () => {
    const manager = await signIn("manager");
    const invoice = await makeInvoice();
    const res = await request(app)
      .get(`/api/invoices/${invoice._id}`)
      .set("Authorization", manager.auth);
    expect(res.status).toBe(200);
  });

  it("401s without a token, and 403s a role with no finance permission at all", async () => {
    const invoice = await makeInvoice();
    const staff = await signIn("staff");
    expect((await request(app).get(`/api/invoices/${invoice._id}`)).status).toBe(401);
    expect(
      (await request(app).get(`/api/invoices/${invoice._id}`).set("Authorization", staff.auth)).status
    ).toBe(403);
  });
});

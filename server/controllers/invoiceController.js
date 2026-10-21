import { z } from "zod";
import mongoose from "mongoose";

import Invoice from "../models/Invoice.js";
import Order from "../models/Order.js";
import Customer from "../models/Customer.js";
import Setting from "../models/Setting.js";
import { INVOICE_STATUSES, PAYMENT_METHODS } from "../config/constants.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "../utils/audit.js";
import { nextInvoiceNumber } from "../utils/numbers.js";
import { computeInvoiceTotals, invoiceTotalsFromOrder, paymentStatusFor, round2, sumPayments } from "../utils/pricing.js";
import { invoiceStatusFor } from "../utils/paymentSync.js";
import { notifyInvoiceIssued } from "../utils/notify.js";
import { sendCSV } from "../utils/csv.js";

const lineSchema = z.object({
  product: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  isCustom: z.boolean().optional(),
});

const standaloneSchema = z.object({
  customerId: z.string().min(1),
  lines: z.array(lineSchema).min(1),
  discount: z.number().min(0).optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
  // Set once staff have seen the customer's un-invoiced orders and still want a
  // free-standing invoice. See the linkage check in createStandalone.
  confirmUnlinked: z.boolean().optional(),
});

// An order that has not been billed yet. A hand-typed invoice for a customer
// who has one of these is almost always meant to be that order's invoice.
const BILLABLE_ORDER_FILTER = { invoice: null, status: { $nin: ["cancelled", "refunded"] } };

const paymentSchema = z.object({
  amount: z.number().min(0.01),
  method: z.enum(PAYMENT_METHODS),
  ref: z.string().max(100).optional(),
  date: z.string().optional(),
});

const statusSchema = z.object({ status: z.enum(INVOICE_STATUSES) });

const linkOrderSchema = z.object({ orderId: z.string().min(1).nullable() });

/**
 * Settle an invoice in full with a synthetic "other" payment. "Mark Paid"
 * means the money changed hands outside this system, so the books still have
 * to balance: amountPaid reaches the total and balanceDue drops to zero.
 * Returns the settled amount (0 when nothing was outstanding).
 */
export const settleInFull = (invoice, user) => {
  if (!invoice || !(invoice.balanceDue > 0.001)) return 0;
  const settled = round2(invoice.balanceDue);
  invoice.payments.push({
    amount: settled,
    method: "other",
    ref: "Marked paid",
    date: new Date(),
    recordedBy: { userId: user?._id, name: user?.name },
  });
  invoice.amountPaid = round2(invoice.payments.reduce((s, p) => s + p.amount, 0));
  invoice.balanceDue = round2(invoice.total - invoice.amountPaid);
  return settled;
};

/**
 * A payment recorded on an invoice must also show up on the linked order, or
 * the customer-facing order history disagrees with the books. Shared by
 * recordPayment and the Mark Paid settlement.
 */
const mirrorPaymentToOrder = async (invoice, { amount, method, ref, note, date, user }) => {
  if (!invoice.order) return;
  const order = await Order.findById(invoice.order);
  if (!order) return;
  order.payment.payments.push({
    amount,
    method,
    ref: ref || "",
    note: note || `Via invoice ${invoice.invoiceNumber}`,
    // Order entries date the money with paidAt; the invoice calls it date.
    paidAt: date ? new Date(date) : new Date(),
    recordedBy: { userId: user?._id, name: user?.name },
  });
  order.amountPaid = sumPayments(order.payment.payments);
  order.payment.status = paymentStatusFor(order.grandTotal, order.amountPaid);

  // Money arriving through the invoice has to move the order along as well,
  // otherwise a fully paid order sits in the queue as "Pending Payment"
  // forever. Mirrors the promotion in orderController.recordPayment.
  if (order.status === "pending_payment" && order.payment.status === "paid") {
    order.status = "confirmed";
    order.statusHistory.push({
      status: "confirmed",
      by: { userId: user?._id, name: user?.name },
      note: `Payment received via invoice ${invoice.invoiceNumber}`,
    });
  }
  await order.save();
};

/**
 * Point an invoice at the order it bills, or at nothing. Returns an error
 * descriptor rather than throwing so each caller can answer with its own shape.
 *
 * Guarded three ways, because a bad link is worse than no link: the order must
 * exist, it must be the invoice customer's own, and it must not already be
 * billed by a different invoice — otherwise one order ends up double-billed or
 * an invoice starts reporting its money to a stranger's order.
 */
const relinkOrder = async (invoice, orderId) => {
  const previousOrder = invoice.order ? String(invoice.order) : null;

  if (orderId === null) {
    invoice.order = null;
  } else {
    // An id that is not an ObjectId names no order, so it gets the same answer
    // as one that is missing. Handing it to findById instead raised a CastError,
    // which the app's error handler could only report as a 500 "Something went
    // wrong" — an alarming reply to a simple case of a bad id.
    const target = mongoose.isValidObjectId(orderId) ? await Order.findById(orderId) : null;
    if (!target) return { error: { status: 404, message: "Order not found" } };
    if (target.invoice && String(target.invoice) !== String(invoice._id)) {
      return { error: { status: 409, message: `${target.orderNumber} is already invoiced` } };
    }
    if (String(target.customer || "") !== String(invoice.customer)) {
      // A checkout order placed without an account has no customer to compare,
      // so fall back to the phone the order was placed with. An exact match is
      // the same person, and the order is adopted onto the account as well —
      // half-linked records are what put this invoice out of step to begin with.
      const samePhone = !target.customer
        && target.customerSnapshot?.phone
        && target.customerSnapshot.phone === invoice.customerSnapshot?.phone;
      if (!samePhone) {
        return { error: { status: 400, message: `${target.orderNumber} belongs to a different customer` } };
      }
      target.customer = invoice.customer;
    }
    invoice.order = target._id;
    target.invoice = invoice._id;
    await target.save();
  }

  // Release whichever order we just stopped pointing at.
  if (previousOrder && previousOrder !== String(invoice.order || "")) {
    await Order.updateOne({ _id: previousOrder, invoice: invoice._id }, { $unset: { invoice: "" } });
  }
  return { error: null };
};

const updateLineSchema = z.object({
  product: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  isCustom: z.boolean().optional(),
});

const updateSchema = z.object({
  lines: z.array(updateLineSchema).min(1),
  discount: z.number().min(0).optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().max(1000).optional(),
  // Attach this invoice to an order after the fact, or null to detach. An
  // invoice raised through "New Invoice" has no link, and an unlinked invoice
  // never reports its payments back to the order it bills.
  orderId: z.string().nullable().optional(),
});

/**
 * Overdue is derived from the due date, not a one-way door: re-evaluate it
 * whenever an invoice is read or edited so a moved due date takes effect.
 */
export const applyOverdue = (invoice) => {
  const today = new Date().toISOString().slice(0, 10);
  const open = invoice.status === "issued" || invoice.status === "partially_paid";
  if (open && invoice.balanceDue > 0 && invoice.dueDate && invoice.dueDate < today) {
    invoice.status = "overdue";
    return true;
  }
  return false;
};

// Assembles the stored document around an already-computed set of totals, so
// order-derived and standalone invoices share one shape.
const assembleInvoice = ({ customer, order, totals, dueDate, notes, user, invoiceNumber }) => ({
  invoiceNumber,
  customer: customer._id,
  customerSnapshot: { name: customer.name, phone: customer.phone, email: customer.email || "" },
  order: order?._id || null,
  ...totals,
  amountPaid: 0,
  balanceDue: totals.total,
  dueDate: dueDate || "",
  status: "issued",
  notes: notes || "",
  createdBy: user ? { userId: user._id, name: user.name } : undefined,
});

const buildInvoice = async ({ customer, order, lines, discount, taxRate, dueDate, notes, user }) => {
  const settings = await Setting.getSettings();
  const rate = taxRate != null ? taxRate : settings.tax.enabled ? settings.tax.rate : 0;
  const totals = computeInvoiceTotals({ lines, taxRate: rate, taxLabel: settings.tax.label, discount });

  return assembleInvoice({
    customer,
    order,
    totals,
    dueDate,
    notes,
    user,
    invoiceNumber: await nextInvoiceNumber(settings.invoice.prefix),
  });
};

export const list = [protect, requirePerm("finance:read"), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const s = new RegExp(req.query.search, "i");
    filter.$or = [{ invoiceNumber: s }, { "customerSnapshot.name": s }, { "customerSnapshot.phone": s }];
  }
  if (req.query.outstanding === "1") {
    filter.status = { $in: ["issued", "partially_paid", "overdue"] };
    filter.balanceDue = { $gt: 0 };
  }

  const invoices = await Invoice.find(filter)
    .populate("order", "orderNumber")
    .sort({ createdAt: -1 })
    .limit(300);
  res.json({ invoices });
}];

export const getOne = [protect, requirePerm("finance:read"), async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate("customer", "name phone email addresses")
    .populate("order", "orderNumber status fulfilment");
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });

  // Lazy overdue evaluation on read. Covers part-paid invoices too, which
  // still owe money and can still go past their due date.
  if (applyOverdue(invoice)) await invoice.save();

  // An unlinked invoice is quietly broken — its payments never reach the order
  // it bills, and that order can still be invoiced a second time. Hand back the
  // orders it could be attached to so the link can be repaired from here.
  let linkableOrders = [];
  if (!invoice.order && invoice.customer) {
    linkableOrders = await Order.find({ customer: invoice.customer._id, ...BILLABLE_ORDER_FILTER })
      .select("orderNumber status grandTotal amountPaid fulfilment.date createdAt")
      .sort({ createdAt: -1 })
      .lean();
  }

  res.json({ invoice, linkableOrders });
}];

// Creates an invoice from an existing order's snapshots (PRD §13.1).
export const fromOrder = [protect, requirePerm("finance:write"), async (req, res) => {
  const order = await Order.findById(req.params.orderId).populate("customer");
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.invoice) {
    return res.status(400).json({ message: "This order already has an invoice" });
  }

  const customer = order.customer || await Customer.findOne({ phone: order.customerSnapshot.phone });
  if (!customer) return res.status(400).json({ message: "Order has no linked customer" });

  // Claim the order before the invoice exists. The check above and the write at
  // the end used to sit either side of the whole assembly, so two requests for
  // the same order both saw no invoice and both raised one: the order pointed at
  // whichever saved last, and the loser stayed in the ledger with the order's
  // number on it, chasing the customer for a second copy of the same cake. Only
  // one request can move invoice from unset to a value, so only one gets past.
  const invoiceId = new mongoose.Types.ObjectId();
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, invoice: { $in: [null, undefined] } },
    { $set: { invoice: invoiceId } },
    { new: true }
  );
  if (!claimed) return res.status(400).json({ message: "This order already has an invoice" });

  // The invoice restates the order's money — it must not re-derive it. Totals
  // come straight from the order so add-ons, the discount, the untaxed delivery
  // fee and tax-inclusive pricing all survive the hand-off.
  const settings = await Setting.getSettings();
  let invoice;
  try {
    const doc = assembleInvoice({
      customer,
      order,
      totals: invoiceTotalsFromOrder(order, settings.tax.label),
      dueDate: order.fulfilment.date,
      user: req.user,
      invoiceNumber: await nextInvoiceNumber(settings.invoice.prefix),
    });

    invoice = await Invoice.create({ ...doc, _id: invoiceId });

    // Payments already collected on the order carry over to the invoice.
    for (const p of order.payment.payments) {
      invoice.payments.push({ amount: p.amount, method: p.method, ref: p.ref, date: p.paidAt, recordedBy: p.recordedBy });
    }
    invoice.amountPaid = round2(invoice.payments.reduce((s, p) => s + p.amount, 0));
    invoice.balanceDue = round2(invoice.total - invoice.amountPaid);
    invoice.status = invoice.amountPaid <= 0 ? "issued"
      : invoice.amountPaid >= invoice.total - 0.001 ? "paid" : "partially_paid";
    await invoice.save();
  } catch (err) {
    // Release the claim, or a failure here would leave the order pointing at an
    // invoice that was never written and refusing to be billed ever again.
    await Order.updateOne({ _id: order._id, invoice: invoiceId }, { $unset: { invoice: "" } });
    throw err;
  }

  await writeAudit({ req, action: "invoice.fromOrder", entity: "Invoice", entityId: invoice._id, meta: `${invoice.invoiceNumber} from ${order.orderNumber}` });
  await notifyInvoiceIssued(invoice);

  res.status(201).json({ invoice });
}];

export const createStandalone = [protect, requirePerm("finance:write"), validate(standaloneSchema), async (req, res) => {
  const customer = await Customer.findById(req.body.customerId);
  if (!customer) return res.status(404).json({ message: "Customer not found" });

  // fromOrder ties the invoice to the order it bills; this route cannot, and an
  // unlinked invoice is quietly broken: payments on it never mirror back to the
  // order (mirrorPaymentToOrder bails without invoice.order), so the order sits
  // unpaid forever and can still be invoiced a second time. Not a hard block —
  // genuine ad-hoc invoices exist — but staff have to see the orders they could
  // bill directly first.
  if (!req.body.confirmUnlinked) {
    const unbilledOrders = await Order.find({ customer: customer._id, ...BILLABLE_ORDER_FILTER })
      .select("orderNumber status grandTotal amountPaid fulfilment.date createdAt")
      .sort({ createdAt: -1 })
      .lean();
    if (unbilledOrders.length > 0) {
      return res.status(409).json({
        message: `${customer.name} has ${unbilledOrders.length} order(s) that have not been invoiced yet. Invoicing the order itself keeps the two linked.`,
        code: "UNBILLED_ORDERS_EXIST",
        unbilledOrders,
      });
    }
  }

  const doc = await buildInvoice({
    customer,
    lines: req.body.lines,
    discount: req.body.discount || 0,
    taxRate: req.body.taxRate,
    dueDate: req.body.dueDate,
    notes: req.body.notes,
    user: req.user,
  });

  const invoice = await Invoice.create(doc);
  await writeAudit({ req, action: "invoice.create", entity: "Invoice", entityId: invoice._id, meta: invoice.invoiceNumber });
  res.status(201).json({ invoice });
}];

// Edit lines/discount/tax/due-date/notes. Cancelled invoices stay locked, but
// an invoice with recorded payments can now be edited; totals are recomputed and
// its status is derived from the remaining balance.
export const update = [protect, requirePerm("finance:write"), validate(updateSchema), async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  if (invoice.status === "cancelled") {
    return res.status(400).json({ message: "A cancelled invoice cannot be edited" });
  }

  const settings = await Setting.getSettings();
  const rate = req.body.taxRate != null
    ? req.body.taxRate
    : invoice.tax?.rate ?? (settings.tax.enabled ? settings.tax.rate : 0);
  const discount = req.body.discount ?? invoice.discount ?? 0;

  const subtotal = round2(req.body.lines.reduce((sum, line) => sum + round2(line.unitPrice * line.quantity), 0));
  if (discount > subtotal + 0.001) {
    return res.status(400).json({ message: `Discount cannot exceed the subtotal of ₹${subtotal}` });
  }

  const totals = computeInvoiceTotals({
    lines: req.body.lines,
    taxRate: rate,
    taxLabel: settings.tax.label,
    discount,
  });

  const before = invoice.toObject();

  // Repair or change the order link. Guarded inside relinkOrder so a link can
  // never make two invoices claim one order, or bill an order to someone else.
  if (req.body.orderId !== undefined) {
    const { error } = await relinkOrder(invoice, req.body.orderId);
    if (error) return res.status(error.status).json({ message: error.message });
  }

  invoice.lines = totals.lines;
  invoice.subtotal = totals.subtotal;
  invoice.discount = totals.discount;
  invoice.tax = totals.tax;
  invoice.total = totals.total;
  invoice.balanceDue = Math.max(0, round2(totals.total - invoice.amountPaid));
  if (req.body.dueDate !== undefined) invoice.dueDate = req.body.dueDate || "";
  if (req.body.notes !== undefined) invoice.notes = req.body.notes || "";

  invoice.status = invoiceStatusFor(invoice.total, invoice.amountPaid, invoice.status);
  await invoice.save();

  await writeAudit({
    req,
    action: "invoice.update",
    entity: "Invoice",
    entityId: invoice._id,
    before,
    after: invoice.toObject(),
    fields: ["lines", "subtotal", "discount", "tax", "total", "balanceDue", "dueDate", "notes", "status", "order"],
    meta: invoice.invoiceNumber,
  });

  res.json({ invoice });
}];

/**
 * Attach an invoice to the order it bills, after the fact.
 *
 * Deliberately its own route rather than part of update, which locks as soon as
 * money is recorded. That lock protects the figures on an issued document, and
 * the order link is not one of them — no money moves here. Folding it into
 * update would have left exactly the invoices that need repairing, the ones
 * that have already taken a payment, permanently unfixable.
 *
 * Payments are never copied across: staff routinely record the same deposit on
 * both sides, so mirroring on link would double-count it. Where the two
 * disagree, the difference is reported for a human to settle.
 */
export const linkOrder = [protect, requirePerm("finance:write"), validate(linkOrderSchema), async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  if (invoice.status === "cancelled") {
    return res.status(400).json({ message: "A cancelled invoice cannot be linked to an order" });
  }

  const before = invoice.toObject();
  const { error } = await relinkOrder(invoice, req.body.orderId);
  if (error) return res.status(error.status).json({ message: error.message });
  await invoice.save();

  let note = "";
  const linked = invoice.order ? await Order.findById(invoice.order).select("orderNumber amountPaid") : null;
  if (linked) {
    const orderPaid = round2(linked.amountPaid || 0);
    const invoicePaid = round2(invoice.amountPaid || 0);
    note = orderPaid === invoicePaid
      ? `Linked to ${linked.orderNumber}.`
      : `Linked to ${linked.orderNumber}. The order records ₹${orderPaid} paid and this invoice ₹${invoicePaid} — record the difference on whichever is behind.`;
  }

  await writeAudit({
    req,
    action: "invoice.linkOrder",
    entity: "Invoice",
    entityId: invoice._id,
    before,
    after: invoice.toObject(),
    fields: ["order"],
    meta: `${invoice.invoiceNumber} → ${req.body.orderId ? note : "unlinked"}`,
  });

  res.json({ invoice, note });
}];

export const recordPayment = [protect, requirePerm("finance:write"), validate(paymentSchema), async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  if (invoice.status === "cancelled") return res.status(400).json({ message: "Cannot record payment on a cancelled invoice" });

  const amount = round2(req.body.amount);
  if (invoice.amountPaid + amount > invoice.total + 0.001) {
    return res.status(400).json({ message: `Payment exceeds balance due (₹${round2(invoice.balanceDue)})` });
  }

  invoice.payments.push({
    amount,
    method: req.body.method,
    ref: req.body.ref || "",
    date: req.body.date ? new Date(req.body.date) : new Date(),
    recordedBy: { userId: req.user._id, name: req.user.name },
  });
  invoice.amountPaid = round2(invoice.payments.reduce((s, p) => s + p.amount, 0));
  invoice.balanceDue = round2(invoice.total - invoice.amountPaid);
  invoice.status = invoice.balanceDue <= 0.001 ? "paid" : "partially_paid";

  await invoice.save();

  await mirrorPaymentToOrder(invoice, {
    amount,
    method: req.body.method,
    ref: req.body.ref,
    date: req.body.date,
    user: req.user,
  });

  await writeAudit({ req, action: "invoice.payment", entity: "Invoice", entityId: invoice._id, meta: `${invoice.invoiceNumber}: ₹${amount} via ${req.body.method}` });
  res.json({ invoice });
}];

export const updateStatus = [protect, requirePerm("finance:write"), validate(statusSchema), async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });
  if (invoice.status === "cancelled" && req.body.status !== "cancelled") {
    return res.status(400).json({ message: "A cancelled invoice cannot change status" });
  }

  const before = invoice.toObject();

  // "Mark Paid" settles the money too. Flipping only the status produced
  // documents claiming PAID while the balance stayed outstanding — the totals
  // block on the PDF contradicted the watermark.
  const settled = req.body.status === "paid" ? settleInFull(invoice, req.user) : 0;
  invoice.status = req.body.status;
  await invoice.save();

  // Cancelling used to leave order.invoice pointing at the dead document, and
  // fromOrder refuses an order that already has one — so a cancelled invoice
  // permanently locked its order out of ever being invoiced again. Release the
  // back-link; the money stays on the order, so a replacement raised from it
  // still carries whatever was already paid.
  if (req.body.status === "cancelled" && invoice.order) {
    await Order.updateOne({ _id: invoice.order, invoice: invoice._id }, { $unset: { invoice: "" } });
  }

  if (settled > 0) {
    await mirrorPaymentToOrder(invoice, {
      amount: settled,
      method: "other",
      ref: "Marked paid",
      note: `Marked paid via invoice ${invoice.invoiceNumber}`,
      user: req.user,
    });
  }

  await writeAudit({
    req,
    action: "invoice.status",
    entity: "Invoice",
    entityId: invoice._id,
    before,
    after: invoice.toObject(),
    fields: ["status", "payments", "amountPaid", "balanceDue"],
    meta: invoice.invoiceNumber + (settled > 0 ? ` (settled ₹${settled})` : ""),
  });
  res.json({ invoice });
}];

// Hard-deletes any invoice. The linked order is released so it can be invoiced
// again, and the invoice document (including any recorded payments) is removed.
export const remove = [protect, requirePerm("finance:write"), async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });

  if (invoice.order) {
    await Order.updateOne({ _id: invoice.order, invoice: invoice._id }, { $unset: { invoice: "" } });
  }

  const before = invoice.toObject();
  await Invoice.deleteOne({ _id: invoice._id });
  await writeAudit({
    req, action: "invoice.delete", entity: "Invoice", entityId: invoice._id, before, meta: invoice.invoiceNumber,
  });
  res.json({ deleted: true, invoiceNumber: invoice.invoiceNumber });
}];

export const exportCsv = [protect, requirePerm("finance:read"), async (req, res) => {
  const invoices = await Invoice.find().populate("customer", "name phone").sort({ createdAt: -1 });
  sendCSV(res, "cakestyles-invoices.csv", invoices, [
    { label: "invoiceNumber", key: "invoiceNumber" },
    { label: "customer", get: (i) => i.customerSnapshot?.name || "" },
    { label: "date", get: (i) => i.createdAt.toISOString().slice(0, 10) },
    { label: "dueDate", key: "dueDate" },
    { label: "total", key: "total" },
    { label: "amountPaid", key: "amountPaid" },
    { label: "balanceDue", key: "balanceDue" },
    { label: "status", key: "status" },
    { label: "order", get: (i) => i.order ? String(i.order) : "" },
  ]);
}];


import { z } from "zod";

import Invoice from "../models/Invoice.js";
import Order from "../models/Order.js";
import Customer from "../models/Customer.js";
import Setting from "../models/Setting.js";
import { INVOICE_STATUSES, PAYMENT_METHODS } from "../config/constants.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "../utils/audit.js";
import { nextInvoiceNumber } from "../utils/numbers.js";
import { computeInvoiceTotals, round2 } from "../utils/pricing.js";
import { notifyInvoiceIssued } from "../utils/notify.js";
import { sendCSV } from "../utils/csv.js";

const lineSchema = z.object({
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
});

const paymentSchema = z.object({
  amount: z.number().min(0.01),
  method: z.enum(PAYMENT_METHODS),
  ref: z.string().max(100).optional(),
  date: z.string().optional(),
});

const statusSchema = z.object({ status: z.enum(INVOICE_STATUSES) });

const buildInvoice = async ({ customer, order, lines, discount, taxRate, dueDate, notes, user }) => {
  const settings = await Setting.getSettings();
  const rate = taxRate != null ? taxRate : settings.tax.enabled ? settings.tax.rate : 0;
  const totals = computeInvoiceTotals({ lines, taxRate: rate, taxLabel: settings.tax.label, discount });

  return {
    invoiceNumber: await nextInvoiceNumber(settings.invoice.prefix),
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
  };
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

  // Lazy overdue evaluation on read.
  const today = new Date().toISOString().slice(0, 10);
  if (invoice.status === "issued" && invoice.balanceDue > 0 && invoice.dueDate && invoice.dueDate < today) {
    invoice.status = "overdue";
    await invoice.save();
  }

  res.json({ invoice });
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

  const lines = order.items.map((it) => ({
    description: it.variantName ? `${it.name} (${it.variantName})` : it.name,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    amount: it.lineTotal,
    isCustom: it.isCustom,
    product: it.product || undefined,
  }));
  if (order.deliveryFee > 0) {
    lines.push({ description: "Delivery", quantity: 1, unitPrice: order.deliveryFee, isCustom: true });
  }

  const doc = await buildInvoice({
    customer,
    order,
    lines,
    discount: 0,
    taxRate: order.taxRate || 0,
    dueDate: order.fulfilment.date,
    user: req.user,
  });

  const invoice = await Invoice.create(doc);

  // Payments already collected on the order carry over to the invoice.
  for (const p of order.payment.payments) {
    invoice.payments.push({ amount: p.amount, method: p.method, ref: p.ref, date: p.paidAt, recordedBy: p.recordedBy });
  }
  invoice.amountPaid = round2(invoice.payments.reduce((s, p) => s + p.amount, 0));
  invoice.balanceDue = round2(invoice.total - invoice.amountPaid);
  invoice.status = invoice.amountPaid <= 0 ? "issued"
    : invoice.amountPaid >= invoice.total - 0.001 ? "paid" : "partially_paid";
  await invoice.save();

  order.invoice = invoice._id;
  await order.save();

  await writeAudit({ req, action: "invoice.fromOrder", entity: "Invoice", entityId: invoice._id, meta: `${invoice.invoiceNumber} from ${order.orderNumber}` });
  await notifyInvoiceIssued(invoice);

  res.status(201).json({ invoice });
}];

export const createStandalone = [protect, requirePerm("finance:write"), validate(standaloneSchema), async (req, res) => {
  const customer = await Customer.findById(req.body.customerId);
  if (!customer) return res.status(404).json({ message: "Customer not found" });

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

  // Mirror the payment onto the linked order so customer-facing status stays true.
  if (invoice.order) {
    const order = await Order.findById(invoice.order);
    if (order) {
      order.payment.payments.push({
        amount, method: req.body.method, ref: req.body.ref || "",
        note: `Via invoice ${invoice.invoiceNumber}`,
        recordedBy: { userId: req.user._id, name: req.user.name },
      });
      order.amountPaid = round2(order.payment.payments.reduce((s, p) => s + p.amount, 0));
      order.payment.status = order.amountPaid >= order.grandTotal - 0.001 ? "paid" : "partial";
      await order.save();
    }
  }

  await writeAudit({ req, action: "invoice.payment", entity: "Invoice", entityId: invoice._id, meta: `${invoice.invoiceNumber}: ₹${amount} via ${req.body.method}` });
  res.json({ invoice });
}];

export const updateStatus = [protect, requirePerm("finance:write"), validate(statusSchema), async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found" });

  const before = { status: invoice.status };
  invoice.status = req.body.status;
  await invoice.save();

  await writeAudit({ req, action: "invoice.status", entity: "Invoice", entityId: invoice._id, before, after: { status: invoice.status }, fields: ["status"], meta: invoice.invoiceNumber });
  res.json({ invoice });
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

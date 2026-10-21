import { z } from "zod";

import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";
import Enquiry from "../models/Enquiry.js";
import Activity from "../models/Activity.js";
import Task from "../models/Task.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { normalizePhone } from "../utils/misc.js";
import { sendCSV } from "../utils/csv.js";
import { round2 } from "../utils/pricing.js";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(8).optional(),
  email: z.string().email().optional().or(z.literal("")),
  importantDates: z.array(z.object({ label: z.string(), date: z.string() })).optional(),
  addresses: z.array(z.object({
    label: z.string().optional(), line1: z.string(), line2: z.string().optional(),
    city: z.string().optional(), pincode: z.string().optional(), notes: z.string().optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  leadSource: z.string().optional(),
  marketingConsent: z.boolean().optional(),
  active: z.boolean().optional(),
});

const noteSchema = z.object({ text: z.string().min(1).max(1000) });

export const list = [protect, requirePerm("customers:read"), async (req, res) => {
  const filter = { active: true };
  if (req.query.tag) filter.tags = req.query.tag;
  if (req.query.search) {
    const s = new RegExp(req.query.search, "i");
    filter.$or = [{ name: s }, { phone: s }, { email: s }];
  }

  const customers = await Customer.find(filter).sort({ updatedAt: -1 }).limit(500).lean();

  // Orders are the single source of truth for a customer's money. Lifetime value
  // is everything they have been billed across their orders, and outstanding is
  // what they still owe on those orders — so the two can never disagree (an
  // outstanding balance can never exceed lifetime value). Standalone invoices
  // raised outside an order no longer count as customer "outstanding": they were
  // the source of the "outstanding ₹X but only ₹Y lifetime" anomaly, since the
  // two figures used to come from two different documents.
  const ids = customers.map((c) => c._id);
  const orderAgg = await Order.aggregate([
    { $match: { customer: { $in: ids }, status: { $nin: ["cancelled", "refunded"] } } },
    {
      $group: {
        _id: "$customer",
        orderCount: { $sum: 1 },
        lifetimeValue: { $sum: "$grandTotal" },
        outstanding: {
          $sum: {
            $max: [0, { $subtract: ["$grandTotal", { $ifNull: ["$amountPaid", 0] }] }],
          },
        },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
  ]);
  // A standalone invoice (no linked order) bills money that no order records,
  // so it has to count toward a customer's lifetime value and outstanding too.
  // Linked invoices restate their order's totals, so they are deliberately not
  // added on top — otherwise one order would be counted twice.
  const invoiceAgg = await Invoice.aggregate([
    { $match: { customer: { $in: ids }, order: null, status: { $nin: ["draft", "cancelled"] } } },
    { $group: { _id: "$customer", invoiceLifetime: { $sum: "$total" }, invoiceOutstanding: { $sum: "$balanceDue" } } },
  ]);
  const metrics = new Map(orderAgg.map((row) => [String(row._id), row]));
  const invoiceMetrics = new Map(invoiceAgg.map((row) => [String(row._id), row]));
  const enriched = customers.map((c) => {
    const m = metrics.get(String(c._id)) || {};
    const inv = invoiceMetrics.get(String(c._id)) || {};
    return {
      ...c,
      orderCount: m.orderCount || 0,
      lifetimeValue: round2((m.lifetimeValue || 0) + (inv.invoiceLifetime || 0)),
      lastOrderAt: m.lastOrderAt || null,
      outstanding: round2((m.outstanding || 0) + (inv.invoiceOutstanding || 0)),
    };
  });

  res.json({ customers: enriched });
}];

export const getOne = [protect, requirePerm("customers:read"), async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: "Customer not found" });

  const [orders, invoices, enquiries, activities, tasks, loyaltyTransactions] = await Promise.all([
    Order.find({ customer: customer._id }).sort({ createdAt: -1 }).select("orderNumber status source grandTotal amountPaid payment.status fulfilment createdAt"),
    Invoice.find({ customer: customer._id }).sort({ createdAt: -1 }).select("invoiceNumber status total amountPaid balanceDue dueDate createdAt order"),
    Enquiry.find({ customer: customer._id }).sort({ createdAt: -1 }).select("status eventDate quotedAmount convertedOrder createdAt"),
    Activity.find({ customer: customer._id }).populate("actor", "name").sort({ occurredAt: -1 }),
    Task.find({ customer: customer._id }).populate("assignedTo", "name").sort({ dueAt: -1 }),
    LoyaltyTransaction.find({ customer: customer._id }).populate("order", "orderNumber").sort({ createdAt: -1 }),
  ]);

  // Chronological timeline of every interaction (PRD §12.3).
  const timeline = [
    ...orders.map((o) => ({ type: "order", at: o.createdAt, ref: o })),
    ...invoices.map((i) => ({ type: "invoice", at: i.createdAt, ref: i })),
    ...enquiries.map((e) => ({ type: "enquiry", at: e.createdAt, ref: e })),
    ...activities.map((activity) => ({ type: "activity", at: activity.occurredAt, ref: activity })),
    ...tasks.map((task) => ({ type: "task", at: task.createdAt, ref: task })),
    ...loyaltyTransactions.map((transaction) => ({ type: "loyalty", at: transaction.createdAt, ref: transaction })),
    ...customer.notes.map((n) => ({ type: "note", at: n.at, ref: n })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const validOrders = orders.filter((o) => !["cancelled", "refunded"].includes(o.status));
  // Standalone invoices (no linked order) add money no order records. Linked
  // invoices restate their order, so they are excluded to avoid double counting.
  const validInvoices = invoices.filter((inv) => !inv.order && !["draft", "cancelled"].includes(inv.status));
  const invoiceLifetime = round2(validInvoices.reduce((s, inv) => s + (inv.total || 0), 0));
  const invoiceOutstanding = round2(validInvoices.reduce((s, inv) => s + Math.max(0, inv.balanceDue || 0), 0));
  // Same source of truth as the list view: lifetime value and outstanding both
  // come from orders plus standalone invoices, so outstanding can never exceed
  // lifetime.
  const lifetimeValue = round2(validOrders.reduce((s, o) => s + (o.grandTotal || 0), 0) + invoiceLifetime);
  const outstanding = round2(
    validOrders.reduce((s, o) => s + Math.max(0, (o.grandTotal || 0) - (o.amountPaid || 0)), 0) + invoiceOutstanding
  );

  res.json({
    customer,
    metrics: {
      orderCount: validOrders.length,
      lifetimeValue,
      outstanding,
      lastOrderAt: validOrders[0]?.createdAt || null,
      pointsBalance: customer.pointsBalance || 0,
      totalEarned: customer.totalEarned || 0,
      totalRedeemed: customer.totalRedeemed || 0,
      tier: customer.tier || "bronze",
      openTasks: tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length,
    },
    timeline,
  });
}];

export const update = [protect, requirePerm("customers:write"), validate(updateSchema), async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: "Customer not found" });

  if (req.body.phone) req.body.phone = normalizePhone(req.body.phone);
  Object.assign(customer, req.body);
  await customer.save();
  res.json({ customer });
}];

export const addNote = [protect, requirePerm("customers:write"), validate(noteSchema), async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: "Customer not found" });

  customer.notes.push({ text: req.body.text, by: { userId: req.user._id, name: req.user.name } });
  await customer.save();
  res.json({ customer });
}];

export const create = [protect, requirePerm("customers:write"), validate(updateSchema.extend({ name: z.string().min(1), phone: z.string().min(8) })), async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const exists = await Customer.findOne({ phone });
  if (exists) return res.status(409).json({ message: "A customer with this phone number already exists" });

  const customer = await Customer.create({ ...req.body, phone });
  res.status(201).json({ customer });
}];

export const exportCsv = [protect, requirePerm("customers:read"), async (req, res) => {
  const customers = await Customer.find({ active: true }).lean();
  const ids = customers.map((c) => c._id);

  const orderAgg = await Order.aggregate([
    { $match: { customer: { $in: ids }, status: { $nin: ["cancelled", "refunded"] } } },
    { $group: { _id: "$customer", orderCount: { $sum: 1 }, lifetimeValue: { $sum: "$grandTotal" }, lastOrderAt: { $max: "$createdAt" } } },
  ]);
  const invoiceAgg = await Invoice.aggregate([
    { $match: { customer: { $in: ids }, order: null, status: { $nin: ["draft", "cancelled"] } } },
    { $group: { _id: "$customer", invoiceLifetime: { $sum: "$total" } } },
  ]);
  const metrics = new Map(orderAgg.map((r) => [String(r._id), r]));
  const invoiceMetrics = new Map(invoiceAgg.map((r) => [String(r._id), r]));

  sendCSV(res, "cakestyles-customers.csv", customers, [
    { label: "name", key: "name" },
    { label: "phone", key: "phone" },
    { label: "email", key: "email" },
    { label: "tags", get: (c) => c.tags.join("|") },
    { label: "leadSource", key: "leadSource" },
    { label: "marketingConsent", get: (c) => (c.marketingConsent ? "yes" : "no") },
    { label: "totalOrders", get: (c) => metrics.get(String(c._id))?.orderCount || 0 },
    { label: "lifetimeValue", get: (c) => round2((metrics.get(String(c._id))?.lifetimeValue || 0) + (invoiceMetrics.get(String(c._id))?.invoiceLifetime || 0)) },
    { label: "lastOrderDate", get: (c) => (metrics.get(String(c._id))?.lastOrderAt || "").toString().slice(0, 10) },
    { label: "loyaltyPoints", get: (c) => c.pointsBalance || 0 },
    { label: "loyaltyTier", get: (c) => c.tier || "bronze" },
    { label: "createdAt", get: (c) => c.createdAt.toISOString().slice(0, 10) },
  ]);
}];


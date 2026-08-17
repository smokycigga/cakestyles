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

  // Enrich with live metrics (order count, value, last order, outstanding).
  const ids = customers.map((c) => c._id);
  const [orderAgg, invoiceAgg] = await Promise.all([
    Order.aggregate([
      { $match: { customer: { $in: ids }, status: { $nin: ["cancelled", "refunded"] } } },
      { $group: { _id: "$customer", orderCount: { $sum: 1 }, lifetimeValue: { $sum: "$grandTotal" }, lastOrderAt: { $max: "$createdAt" } } },
    ]),
    Invoice.aggregate([
      { $match: { customer: { $in: ids }, status: { $nin: ["cancelled", "draft"] } } },
      { $group: { _id: "$customer", outstanding: { $sum: "$balanceDue" } } },
    ]),
  ]);

  const metrics = new Map();
  for (const row of orderAgg) metrics.set(String(row._id), row);
  for (const row of invoiceAgg) {
    const m = metrics.get(String(row._id)) || {};
    m.outstanding = row.outstanding;
    metrics.set(String(row._id), { ...m, ...row });
  }

  const enriched = customers.map((c) => {
    const m = metrics.get(String(c._id)) || {};
    return {
      ...c,
      orderCount: m.orderCount || 0,
      lifetimeValue: round2(m.lifetimeValue || 0),
      lastOrderAt: m.lastOrderAt || null,
      outstanding: round2(m.outstanding || 0),
    };
  });

  res.json({ customers: enriched });
}];

export const getOne = [protect, requirePerm("customers:read"), async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: "Customer not found" });

  const [orders, invoices, enquiries, activities, tasks, loyaltyTransactions] = await Promise.all([
    Order.find({ customer: customer._id }).sort({ createdAt: -1 }).select("orderNumber status source grandTotal amountPaid payment.status fulfilment createdAt"),
    Invoice.find({ customer: customer._id }).sort({ createdAt: -1 }).select("invoiceNumber status total amountPaid balanceDue dueDate createdAt"),
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
  const lifetimeValue = round2(validOrders.reduce((s, o) => s + o.grandTotal, 0));
  const outstanding = round2(
    invoices.filter((i) => !["cancelled", "draft", "paid"].includes(i.status)).reduce((s, i) => s + i.balanceDue, 0)
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
  const metrics = new Map(orderAgg.map((r) => [String(r._id), r]));

  sendCSV(res, "cakestyles-customers.csv", customers, [
    { label: "name", key: "name" },
    { label: "phone", key: "phone" },
    { label: "email", key: "email" },
    { label: "tags", get: (c) => c.tags.join("|") },
    { label: "leadSource", key: "leadSource" },
    { label: "marketingConsent", get: (c) => (c.marketingConsent ? "yes" : "no") },
    { label: "totalOrders", get: (c) => metrics.get(String(c._id))?.orderCount || 0 },
    { label: "lifetimeValue", get: (c) => metrics.get(String(c._id))?.lifetimeValue || 0 },
    { label: "lastOrderDate", get: (c) => (metrics.get(String(c._id))?.lastOrderAt || "").toString().slice(0, 10) },
    { label: "loyaltyPoints", get: (c) => c.pointsBalance || 0 },
    { label: "loyaltyTier", get: (c) => c.tier || "bronze" },
    { label: "createdAt", get: (c) => c.createdAt.toISOString().slice(0, 10) },
  ]);
}];

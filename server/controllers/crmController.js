import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";
import Task from "../models/Task.js";
import Activity from "../models/Activity.js";
import { protect, requirePerm } from "../middleware/auth.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXCLUDED_ORDER_STATUSES = new Set(["cancelled", "refunded", "partially_refunded"]);
const OUTSTANDING_INVOICE_STATUSES = new Set(["issued", "partially_paid", "overdue"]);

const idOf = (value) => String(value?._id ?? value ?? "");
const validDate = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const monthDay = (value) => {
  if (typeof value === "string") {
    const match = value.trim().match(/^(?:\d{4}-)?(\d{2})-(\d{2})(?:T.*)?$/);
    if (match) return { month: Number(match[1]), day: Number(match[2]) };
  }
  const date = validDate(value);
  return date ? { month: date.getUTCMonth() + 1, day: date.getUTCDate() } : null;
};

export const nextRecurringDate = (value, now = new Date()) => {
  const parts = monthDay(value);
  if (!parts) return null;

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let year = today.getUTCFullYear(); year <= today.getUTCFullYear() + 8; year += 1) {
    const occurrence = new Date(Date.UTC(year, parts.month - 1, parts.day));
    const isExactDate = occurrence.getUTCMonth() === parts.month - 1 && occurrence.getUTCDate() === parts.day;
    if (isExactDate && occurrence >= today) return occurrence;
  }
  return null;
};

export const detectImportantDates = (customers, days = 30, now = new Date()) => {
  const maxDays = Math.max(0, Number(days) || 0);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dates = [];

  for (const customer of customers) {
    for (const importantDate of customer.importantDates || []) {
      const occurrence = nextRecurringDate(importantDate.date, today);
      if (!occurrence) continue;
      const daysUntil = Math.round((occurrence.getTime() - today.getTime()) / DAY_MS);
      if (daysUntil > maxDays) continue;
      dates.push({
        customer: {
          _id: customer._id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        },
        label: importantDate.label || "Important date",
        date: importantDate.date,
        nextOccurrence: occurrence.toISOString().slice(0, 10),
        daysUntil,
      });
    }
  }

  return dates.sort((a, b) => a.daysUntil - b.daysUntil || a.customer.name.localeCompare(b.customer.name));
};

export const computeCustomerSegments = (customers, orders, invoices, options = {}) => {
  const now = validDate(options.now) || new Date();
  const newDays = options.newDays ?? 30;
  const atRiskDays = options.atRiskDays ?? 90;
  const dormantDays = options.dormantDays ?? 180;
  const vipSpend = options.vipSpend ?? 10000;
  const vipOrders = options.vipOrders ?? 5;
  const birthdayDays = options.birthdayDays ?? 30;
  const orderStats = new Map();
  const outstanding = new Map();

  for (const order of orders) {
    if (!order.customer || EXCLUDED_ORDER_STATUSES.has(order.status)) continue;
    const key = idOf(order.customer);
    const createdAt = validDate(order.createdAt);
    const stats = orderStats.get(key) || { orderCount: 0, totalSpend: 0, firstOrderAt: null, lastOrderAt: null };
    stats.orderCount += 1;
    stats.totalSpend += Number(order.grandTotal) || 0;
    if (createdAt && (!stats.firstOrderAt || createdAt < stats.firstOrderAt)) stats.firstOrderAt = createdAt;
    if (createdAt && (!stats.lastOrderAt || createdAt > stats.lastOrderAt)) stats.lastOrderAt = createdAt;
    orderStats.set(key, stats);
    // A customer's outstanding is what their orders still owe, so this segment
    // agrees with the customer list instead of only reading invoices.
    outstanding.set(key, (outstanding.get(key) || 0) + Math.max(0, Number(order.grandTotal || 0) - Number(order.amountPaid || 0)));
  }

  for (const invoice of invoices) {
    if (!invoice.customer || !OUTSTANDING_INVOICE_STATUSES.has(invoice.status)) continue;
    // A linked invoice restates its order's balance, already counted above;
    // adding it too would double-count a single debt.
    if (invoice.order) continue;
    const balance = Math.max(0, Number(invoice.balanceDue) || 0);
    const key = idOf(invoice.customer);
    outstanding.set(key, (outstanding.get(key) || 0) + balance);
  }

  const birthdayIds = new Set(
    detectImportantDates(customers, birthdayDays, now)
      .filter((entry) => /birth|birthday|dob/i.test(entry.label))
      .map((entry) => idOf(entry.customer._id))
  );
  const segments = {
    vip: [], repeat: [], new: [], at_risk: [], dormant: [], outstanding: [], birthday_upcoming: [],
  };

  for (const customer of customers) {
    const key = idOf(customer);
    const stats = orderStats.get(key) || { orderCount: 0, totalSpend: 0, firstOrderAt: null, lastOrderAt: null };
    const outstandingBalance = outstanding.get(key) || 0;
    const createdAt = validDate(customer.createdAt);
    const lastOrderDays = stats.lastOrderAt ? Math.floor((now.getTime() - stats.lastOrderAt.getTime()) / DAY_MS) : null;
    const customerAgeDays = createdAt ? Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS) : 0;
    const item = {
      _id: customer._id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      tags: customer.tags || [],
      orderCount: stats.orderCount,
      totalSpend: Math.round(stats.totalSpend * 100) / 100,
      firstOrderAt: stats.firstOrderAt,
      lastOrderAt: stats.lastOrderAt,
      outstandingBalance: Math.round(outstandingBalance * 100) / 100,
    };

    if (stats.totalSpend >= vipSpend || stats.orderCount >= vipOrders) segments.vip.push(item);
    if (stats.orderCount >= 2) segments.repeat.push(item);
    if (createdAt && customerAgeDays <= newDays) segments.new.push(item);
    if (lastOrderDays !== null && lastOrderDays >= atRiskDays && lastOrderDays < dormantDays) segments.at_risk.push(item);
    if ((lastOrderDays !== null && lastOrderDays >= dormantDays) || (stats.orderCount === 0 && customerAgeDays >= dormantDays)) segments.dormant.push(item);
    if (outstandingBalance > 0) segments.outstanding.push(item);
    if (birthdayIds.has(key)) segments.birthday_upcoming.push(item);
  }

  for (const items of Object.values(segments)) {
    items.sort((a, b) => b.totalSpend - a.totalSpend || a.name.localeCompare(b.name));
  }
  return segments;
};

const loadCrmData = () => Promise.all([
  Customer.find({ active: { $ne: false } }).lean(),
  Order.find({}).select("customer status grandTotal amountPaid createdAt").lean(),
  Invoice.find({}).select("customer status balanceDue order").lean(),
]);

export const overview = [protect, requirePerm("customers:read"), async (req, res) => {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const [data, taskCounts, activityCount] = await Promise.all([
    loadCrmData(),
    Promise.all([
      Task.countDocuments({ status: { $in: ["pending", "in_progress"] } }),
      Task.countDocuments({ status: { $in: ["pending", "in_progress"] }, dueAt: { $lt: start } }),
      Task.countDocuments({ status: "completed" }),
    ]),
    Activity.countDocuments({}),
  ]);
  const [customers, orders, invoices] = data;
  const segments = computeCustomerSegments(customers, orders, invoices, { now });
  const activeOrders = orders.filter((order) => !EXCLUDED_ORDER_STATUSES.has(order.status));
  const outstandingInvoices = invoices.filter((invoice) => OUTSTANDING_INVOICE_STATUSES.has(invoice.status) && Number(invoice.balanceDue) > 0);

  res.json({
    overview: {
      customers: customers.length,
      orders: activeOrders.length,
      invoicesOutstanding: outstandingInvoices.length,
      outstandingBalance: Math.round(outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.balanceDue || 0), 0) * 100) / 100,
      tasksOpen: taskCounts[0],
      tasksOverdue: taskCounts[1],
      tasksCompleted: taskCounts[2],
      activities: activityCount,
      segmentCounts: Object.fromEntries(Object.entries(segments).map(([name, items]) => [name, items.length])),
    },
  });
}];

export const customerSegments = [protect, requirePerm("customers:read"), async (req, res) => {
  const [customers, orders, invoices] = await loadCrmData();
  const segments = computeCustomerSegments(customers, orders, invoices);
  const requested = req.query.segment;
  if (requested && !Object.hasOwn(segments, requested)) {
    return res.status(400).json({ message: "Unknown customer segment" });
  }
  res.json(requested
    ? { segment: requested, customers: segments[requested], count: segments[requested].length }
    : { segments, counts: Object.fromEntries(Object.entries(segments).map(([name, items]) => [name, items.length])) });
}];

export const importantDates = [protect, requirePerm("customers:read"), async (req, res) => {
  const parsedDays = Number.parseInt(req.query.days, 10);
  const days = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 0), 366) : 30;
  const customers = await Customer.find({ active: { $ne: false }, "importantDates.0": { $exists: true } })
    .select("name phone email importantDates")
    .lean();
  const dates = detectImportantDates(customers, days);
  res.json({ days, dates, count: dates.length });
}];


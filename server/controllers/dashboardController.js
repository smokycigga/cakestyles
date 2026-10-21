import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";
import Expense from "../models/Expense.js";
import Customer from "../models/Customer.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { round2 } from "../utils/pricing.js";
import { resolveRange, istDateString, addDaysIst } from "../utils/dates.js";

const EXCLUDED = ["cancelled", "refunded", "partially_refunded"];

// One call returns every dashboard section for the selected period (PRD §15).
// A local shop's volume fits comfortably in memory, so we aggregate in JS
// with strict IST date boundaries instead of fighting aggregation timezones.
export const dashboard = [protect, requirePerm("analytics:read"), async (req, res) => {
  const { from, to } = resolveRange(req.query);

  const [orders, invoices, expenses, previousOrders, allOrders] = await Promise.all([
    Order.find({ createdAt: { $gte: from, $lte: to } }).populate("customer", "name"),
    Invoice.find({ createdAt: { $gte: from, $lte: to }, status: { $ne: "cancelled" } }),
    Expense.find({ date: { $gte: istDateString(from), $lte: istDateString(to) } }),
    Order.find({
      createdAt: { $gte: new Date(2 * from.getTime() - to.getTime()), $lt: from },
    }),
    Order.find({ status: { $nin: EXCLUDED } }).select("createdAt customer grandTotal source items"),
  ]);

  const active = orders.filter((o) => !EXCLUDED.includes(o.status));
  const refunds = orders
    .filter((o) => o.status === "refunded" || o.status === "partially_refunded")
    .reduce((s, o) => s + o.grandTotal, 0);

  const grossSales = round2(active.reduce((s, o) => s + o.grandTotal, 0));
  const prevSales = round2(previousOrders.filter((o) => !EXCLUDED.includes(o.status)).reduce((s, o) => s + o.grandTotal, 0));
  const expensesTotal = round2(expenses.reduce((s, e) => s + e.amount, 0));

  // New vs repeat: customers whose first-ever order falls in this range.
  const firstOrderByCustomer = new Map();
  for (const o of allOrders) {
    const key = String(o.customer);
    if (!firstOrderByCustomer.has(key) || o.createdAt < firstOrderByCustomer.get(key)) {
      firstOrderByCustomer.set(key, o.createdAt);
    }
  }
  let newCustomers = 0;
  let repeatCustomers = 0;
  const seen = new Set();
  for (const o of active) {
    const key = String(o.customer);
    if (seen.has(key)) continue;
    seen.add(key);
    const first = firstOrderByCustomer.get(key);
    if (first >= from && first <= to) newCustomers++;
    else repeatCustomers++;
  }

  // Outstanding across ALL unpaid invoices (not just period).
  const unpaidInvoices = await Invoice.find({ status: { $in: ["issued", "partially_paid", "overdue"] } }).select("invoiceNumber customer balanceDue dueDate");
  const outstanding = round2(unpaidInvoices.reduce((s, i) => s + i.balanceDue, 0));

  // Sales trend by IST day.
  const days = [];
  let cursor = istDateString(from);
  const endDay = istDateString(to);
  const revenueByDay = new Map();
  for (const o of active) {
    const day = istDateString(o.createdAt);
    revenueByDay.set(day, (revenueByDay.get(day) || 0) + o.grandTotal);
  }
  while (cursor <= endDay && days.length < 400) {
    days.push({ date: cursor, revenue: round2(revenueByDay.get(cursor) || 0) });
    cursor = addDaysIst(cursor, 1);
  }

  // Channel, product and customer breakdowns.
  const channels = {};
  for (const o of active) {
    channels[o.source] = channels[o.source] || { revenue: 0, orders: 0 };
    channels[o.source].revenue = round2(channels[o.source].revenue + o.grandTotal);
    channels[o.source].orders += 1;
  }

  const products = {};
  for (const o of active) {
    for (const it of o.items) {
      const key = it.name;
      products[key] = products[key] || { revenue: 0, units: 0, orders: 0, avgPrice: 0 };
      products[key].revenue = round2(products[key].revenue + it.lineTotal);
      products[key].units += it.quantity;
      products[key].orders += 1;
    }
  }
  const topProducts = Object.entries(products)
    .map(([name, v]) => ({ name, ...v, avgPrice: round2(v.revenue / v.units) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const customersBySpend = {};
  for (const o of active) {
    const name = o.customer?.name || o.customerSnapshot?.name || "Unknown";
    customersBySpend[name] = round2((customersBySpend[name] || 0) + o.grandTotal);
  }
  const topCustomers = Object.entries(customersBySpend)
    .map(([name, spend]) => ({ name, spend }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  const expensesByCategory = {};
  for (const e of expenses) {
    expensesByCategory[e.category] = round2((expensesByCategory[e.category] || 0) + e.amount);
  }

  const statusCounts = {};
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;

  const kpis = {
    grossSales,
    netSales: round2(grossSales - refunds),
    refunds: round2(refunds),
    orderCount: orders.length,
    activeOrderCount: active.length,
    aov: active.length ? round2(grossSales / active.length) : 0,
    newCustomers,
    repeatCustomers,
    outstanding,
    expenses: expensesTotal,
    grossProfit: round2(grossSales - expensesTotal),
    prevGrossSales: prevSales,
    growthPct: prevSales > 0 ? round2(((grossSales - prevSales) / prevSales) * 100) : null,
  };

  res.json({
    range: { from: istDateString(from), to: endDay },
    kpis,
    series: days,
    channels,
    topProducts,
    topCustomers,
    expensesByCategory,
    statusCounts,
    recentOrders: orders.slice(0, 8).map((o) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      customer: o.customer?.name || o.customerSnapshot?.name,
      total: o.grandTotal,
      status: o.status,
      source: o.source,
      createdAt: o.createdAt,
    })),
    outstandingInvoices: unpaidInvoices.slice(0, 8),
  });
}];


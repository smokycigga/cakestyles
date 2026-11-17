import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";
import Expense from "../models/Expense.js";
import Customer from "../models/Customer.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { round2 } from "../utils/pricing.js";
import { resolveRange, istDateString, addDaysIst, startOfIstDay, endOfIstDay } from "../utils/dates.js";

const EXCLUDED = ["cancelled", "refunded", "partially_refunded"];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-11" for an order timestamp, in IST — the shop's calendar month.
const monthKeyOf = (date) => istDateString(date).slice(0, 7);

const shiftMonth = (key, delta) => {
  const [year, month] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};

const daysInMonth = (key) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const monthLabel = (key) => {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
};

const pctChange = (current, previous) =>
  previous > 0 ? round2(((current - previous) / previous) * 100) : null;

// Month-by-month totals, plus a like-for-like comparison of this month against
// the same stretch of last month.
//
// The naive comparison — "this month vs last month" — is misleading for most of
// the month: on the 5th it compares five days against thirty. So the headline
// delta uses last month *up to the same day*, and the whole of last month is
// reported separately for context.
const buildMonthly = (allOrders, firstOrderByCustomer, monthsWanted, todayIst) => {
  const currentKey = todayIst.slice(0, 7);

  const keys = [];
  for (let i = monthsWanted - 1; i >= 0; i -= 1) keys.push(shiftMonth(currentKey, -i));

  const buckets = new Map(
    keys.map((key) => [key, { revenue: 0, orders: 0, units: 0, customers: new Set(), products: new Map() }])
  );

  for (const order of allOrders) {
    const bucket = buckets.get(monthKeyOf(order.createdAt));
    if (!bucket) continue; // outside the window we are reporting on
    bucket.revenue += order.grandTotal;
    bucket.orders += 1;
    if (order.customer) bucket.customers.add(String(order.customer));
    for (const item of order.items || []) {
      bucket.units += item.quantity;
      bucket.products.set(item.name, (bucket.products.get(item.name) || 0) + item.lineTotal);
    }
  }

  // New customers per month: first-ever order falls in that month.
  const firstMonthByCustomer = new Map();
  for (const [customer, firstAt] of firstOrderByCustomer) {
    firstMonthByCustomer.set(monthKeyOf(firstAt), (firstMonthByCustomer.get(monthKeyOf(firstAt)) || 0) + 1);
  }

  const monthly = keys.map((key) => {
    const bucket = buckets.get(key);
    const top = [...bucket.products.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      month: key,
      label: monthLabel(key),
      shortLabel: MONTH_NAMES[Number(key.split("-")[1]) - 1],
      revenue: round2(bucket.revenue),
      orders: bucket.orders,
      aov: bucket.orders ? round2(bucket.revenue / bucket.orders) : 0,
      units: bucket.units,
      customers: bucket.customers.size,
      newCustomers: firstMonthByCustomer.get(key) || 0,
      topProduct: top ? { name: top[0], revenue: round2(top[1]) } : null,
      // A month that has not finished yet will always look short next to a
      // complete one; the UI uses this to avoid a misleading "down" arrow.
      partial: key === currentKey,
    };
  });

  const previousKey = shiftMonth(currentKey, -1);
  const dayOfMonth = Number(todayIst.slice(8, 10));

  const sumBetween = (fromKey, fromDay, toKey, toDay) => {
    const from = startOfIstDay(`${fromKey}-${String(fromDay).padStart(2, "0")}`);
    const to = endOfIstDay(`${toKey}-${String(toDay).padStart(2, "0")}`);
    const rows = allOrders.filter((o) => o.createdAt >= from && o.createdAt <= to);
    const revenue = round2(rows.reduce((sum, o) => sum + o.grandTotal, 0));
    return {
      from: istDateString(from),
      to: istDateString(to),
      revenue,
      orders: rows.length,
      aov: rows.length ? round2(revenue / rows.length) : 0,
    };
  };

  const current = sumBetween(currentKey, 1, currentKey, dayOfMonth);
  // Same day-of-month last month — clamped, so 31 Mar compares against 28/29 Feb.
  const previousSamePeriod = sumBetween(
    previousKey,
    1,
    previousKey,
    Math.min(dayOfMonth, daysInMonth(previousKey))
  );
  const previousFull = sumBetween(previousKey, 1, previousKey, daysInMonth(previousKey));

  return {
    monthly,
    monthComparison: {
      current: { label: monthLabel(currentKey), ...current },
      previousSamePeriod: { label: monthLabel(previousKey), ...previousSamePeriod },
      previousFull: { label: monthLabel(previousKey), ...previousFull },
      delta: {
        revenuePct: pctChange(current.revenue, previousSamePeriod.revenue),
        ordersPct: pctChange(current.orders, previousSamePeriod.orders),
        aovPct: pctChange(current.aov, previousSamePeriod.aov),
        revenue: round2(current.revenue - previousSamePeriod.revenue),
        orders: current.orders - previousSamePeriod.orders,
      },
    },
  };
};

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

  // Absent or nonsense (0, negative, NaN) falls back to six months; anything
  // else is clamped to what the chart can usefully draw.
  const requestedMonths = Number(req.query.months);
  const monthsWanted = Number.isFinite(requestedMonths) && requestedMonths >= 1
    ? Math.min(Math.floor(requestedMonths), 24)
    : 6;
  const { monthly, monthComparison } = buildMonthly(
    allOrders,
    firstOrderByCustomer,
    monthsWanted,
    istDateString(new Date())
  );

  res.json({
    range: { from: istDateString(from), to: endDay },
    kpis,
    series: days,
    monthly,
    monthComparison,
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


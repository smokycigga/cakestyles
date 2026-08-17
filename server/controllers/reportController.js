import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";
import Expense from "../models/Expense.js";
import Customer from "../models/Customer.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { sendCSV } from "../utils/csv.js";
import { round2 } from "../utils/pricing.js";
import { resolveRange, istDateString } from "../utils/dates.js";

const EXCLUDED = ["cancelled", "refunded", "partially_refunded"];

const orderFilter = (req) => {
  const { from, to } = resolveRange(req.query);
  return { createdAt: { $gte: from, $lte: to } };
};

// PRD §16: report CSVs with date filters, permission-gated.

export const salesReport = [protect, requirePerm("analytics:read"), async (req, res) => {
  const { from, to } = resolveRange(req.query);
  const orders = await Order.find(orderFilter(req)).sort({ createdAt: 1 });

  const rows = orders.map((o) => ({
    date: o.createdAt.toISOString().slice(0, 10),
    orderNumber: o.orderNumber,
    customer: o.customerSnapshot.name,
    phone: o.customerSnapshot.phone,
    source: o.source,
    status: o.status,
    paymentStatus: o.payment.status,
    subtotal: o.subtotal,
    tax: o.taxTotal,
    delivery: o.deliveryFee,
    total: o.grandTotal,
  }));

  sendCSV(res, "cakestyles-sales.csv", rows, [
    { label: "date", key: "date" },
    { label: "orderNumber", key: "orderNumber" },
    { label: "customer", key: "customer" },
    { label: "phone", key: "phone" },
    { label: "source", key: "source" },
    { label: "status", key: "status" },
    { label: "paymentStatus", key: "paymentStatus" },
    { label: "subtotal", key: "subtotal" },
    { label: "tax", key: "tax" },
    { label: "delivery", key: "delivery" },
    { label: "total", key: "total" },
  ]);
}];

export const productsReport = [protect, requirePerm("analytics:read"), async (req, res) => {
  const orders = await Order.find(orderFilter(req)).select("items status");
  const active = orders.filter((o) => !EXCLUDED.includes(o.status));

  const byProduct = {};
  for (const o of active) {
    for (const it of o.items) {
      const key = it.name;
      byProduct[key] = byProduct[key] || { name: it.name, units: 0, orders: 0, revenue: 0 };
      byProduct[key].units += it.quantity;
      byProduct[key].orders += 1;
      byProduct[key].revenue = round2(byProduct[key].revenue + it.lineTotal);
    }
  }

  const rows = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue);
  sendCSV(res, "cakestyles-product-sales.csv", rows, [
    { label: "product", key: "name" },
    { label: "units", key: "units" },
    { label: "orders", key: "orders" },
    { label: "revenue", key: "revenue" },
    { label: "avgSellingPrice", get: (r) => (r.units ? round2(r.revenue / r.units) : 0) },
  ]);
}];

export const outstandingReport = [protect, requirePerm("finance:read"), async (req, res) => {
  const invoices = await Invoice.find({ status: { $in: ["issued", "partially_paid", "overdue"] } })
    .sort({ dueDate: 1 });
  sendCSV(res, "cakestyles-outstanding.csv", invoices, [
    { label: "invoiceNumber", key: "invoiceNumber" },
    { label: "customer", get: (i) => i.customerSnapshot.name },
    { label: "phone", get: (i) => i.customerSnapshot.phone },
    { label: "date", get: (i) => i.createdAt.toISOString().slice(0, 10) },
    { label: "dueDate", key: "dueDate" },
    { label: "total", key: "total" },
    { label: "amountPaid", key: "amountPaid" },
    { label: "balanceDue", key: "balanceDue" },
    { label: "status", key: "status" },
  ]);
}];

export const profitabilityReport = [protect, requirePerm("analytics:read"), async (req, res) => {
  const { from, to } = resolveRange(req.query);
  const [orders, expenses] = await Promise.all([
    Order.find(orderFilter(req)),
    Expense.find({ date: { $gte: istDateString(from), $lte: istDateString(to) } }),
  ]);

  const sales = round2(orders.filter((o) => !EXCLUDED.includes(o.status)).reduce((s, o) => s + o.grandTotal, 0));
  const expenseRows = expenses.map((e) => ({ month: e.date.slice(0, 7), category: e.category, description: e.description, amount: e.amount }));
  const expensesTotal = round2(expenses.reduce((s, e) => s + e.amount, 0));

  const rows = [
    { metric: "Sales", value: sales },
    { metric: "Expenses", value: expensesTotal },
    { metric: "Contribution", value: round2(sales - expensesTotal) },
    ...expenseRows.map((e) => ({ metric: `Expense: ${e.category}`, value: e.amount })),
  ];

  sendCSV(res, "cakestyles-profitability.csv", rows, [
    { label: "metric", key: "metric" },
    { label: "value", key: "value" },
  ]);
}];

// Customers report reuses the CRM export but with a date-bounded order filter.
export const customersReport = async (req, res) => {
  const customers = await Customer.find({ active: true }).lean();
  sendCSV(res, "cakestyles-customers.csv", customers, [
    { label: "name", key: "name" },
    { label: "phone", key: "phone" },
    { label: "email", key: "email" },
    { label: "tags", get: (c) => c.tags.join("|") },
    { label: "leadSource", key: "leadSource" },
  ]);
};

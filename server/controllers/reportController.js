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

// The Reports page offers an expense export alongside the others and points at
// /reports/expenses.csv, which did not exist — that card downloaded a 404. It
// lives here rather than reusing /expenses/export.csv so it honours the shared
// range selector (range=30d, this_month, …) like every other report.
export const expensesReport = [protect, requirePerm("expenses:read"), async (req, res) => {
  const { from, to } = resolveRange(req.query);
  const expenses = await Expense.find({ date: { $gte: istDateString(from), $lte: istDateString(to) } })
    .sort({ date: -1 });

  sendCSV(res, "cakestyles-expenses.csv", expenses, [
    { label: "date", key: "date" },
    { label: "category", key: "category" },
    { label: "description", key: "description" },
    { label: "amount", key: "amount" },
    { label: "vendor", key: "vendor" },
    { label: "paymentMethod", key: "paymentMethod" },
    { label: "recurring", get: (e) => (e.recurring?.isRecurring ? e.recurring.frequency || "yes" : "no") },
    { label: "notes", key: "notes" },
  ]);
}];

// One customer's own statement: every order and every standalone invoice they
// appear on. /customers.csv answers "the whole book", which is the wrong shape
// when the ask is "send me Meera's history" — so the Reports page pairs a
// customer picker with this route and the same range selector as its
// neighbours.
const OBJECT_ID = /^[a-f\d]{24}$/i;
const fileSafe = (name) =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "customer";

export const customerStatement = [protect, requirePerm("analytics:read"), async (req, res) => {
  const customerId = String(req.query.customerId || "");
  // Checked before the query so a malformed id answers 400 rather than
  // throwing a CastError that the error handler would report as a 500.
  if (!OBJECT_ID.test(customerId)) {
    return res.status(400).json({ message: "Choose a customer to export" });
  }

  const customer = await Customer.findById(customerId).lean();
  if (!customer) return res.status(404).json({ message: "Customer not found" });

  const { from, to } = resolveRange(req.query);
  const range = { $gte: from, $lte: to };
  const [orders, invoices] = await Promise.all([
    Order.find({ customer: customer._id, createdAt: range }).sort({ createdAt: 1 }),
    // An invoice raised from an order mirrors money those order rows already
    // carry; only standalone invoices would otherwise be missing entirely.
    Invoice.find({ customer: customer._id, order: null, createdAt: range }).sort({ createdAt: 1 }),
  ]);

  const lines = [
    ...orders.map((o) => ({
      at: o.createdAt,
      row: {
        customer: o.customerSnapshot.name,
        phone: o.customerSnapshot.phone,
        date: o.createdAt.toISOString().slice(0, 10),
        type: "Order",
        reference: o.orderNumber,
        status: o.status,
        items: o.items.map((i) => `${i.name}${i.variantName ? ` (${i.variantName})` : ""} × ${i.quantity}`).join("; "),
        quantity: o.items.reduce((s, i) => s + i.quantity, 0),
        subtotal: o.subtotal,
        discount: o.discount,
        tax: o.taxTotal,
        delivery: o.deliveryFee,
        total: o.grandTotal,
        amountPaid: o.amountPaid,
        balanceDue: round2(Math.max(0, o.grandTotal - o.amountPaid)),
        dueDate: "",
      },
    })),
    ...invoices.map((i) => ({
      at: i.createdAt,
      row: {
        customer: i.customerSnapshot.name,
        phone: i.customerSnapshot.phone,
        date: i.createdAt.toISOString().slice(0, 10),
        type: "Invoice",
        reference: i.invoiceNumber,
        status: i.status,
        items: i.lines.map((l) => `${l.description} × ${l.quantity}`).join("; "),
        quantity: i.lines.reduce((s, l) => s + l.quantity, 0),
        subtotal: i.subtotal,
        discount: i.discount,
        tax: i.tax?.amount || 0,
        delivery: 0,
        total: i.total,
        amountPaid: i.amountPaid,
        balanceDue: i.balanceDue,
        dueDate: i.dueDate,
      },
    })),
  ];

  // Orders and invoices interleaved in one chronological statement.
  const rows = lines.sort((a, b) => a.at - b.at).map((entry) => entry.row);

  sendCSV(res, `cakestyles-statement-${fileSafe(customer.name)}.csv`, rows, [
    { label: "customer", key: "customer" },
    { label: "phone", key: "phone" },
    { label: "date", key: "date" },
    { label: "type", key: "type" },
    { label: "reference", key: "reference" },
    { label: "status", key: "status" },
    { label: "items", key: "items" },
    { label: "quantity", key: "quantity" },
    { label: "subtotal", key: "subtotal" },
    { label: "discount", key: "discount" },
    { label: "tax", key: "tax" },
    { label: "delivery", key: "delivery" },
    { label: "total", key: "total" },
    { label: "amountPaid", key: "amountPaid" },
    { label: "balanceDue", key: "balanceDue" },
    { label: "dueDate", key: "dueDate" },
  ]);
}];

// Customers report reuses the CRM export but with a date-bounded order filter.
// Gated like every other report: unguarded, this route handed the store's whole
// customer list — names, phones, emails — to anyone who requested the URL.
export const customersReport = [protect, requirePerm("customers:read"), async (req, res) => {
  const customers = await Customer.find({ active: true }).lean();
  sendCSV(res, "cakestyles-customers.csv", customers, [
    { label: "name", key: "name" },
    { label: "phone", key: "phone" },
    { label: "email", key: "email" },
    { label: "tags", get: (c) => c.tags.join("|") },
    { label: "leadSource", key: "leadSource" },
  ]);
}];


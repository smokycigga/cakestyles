// Document builders for the integration tests. Every factory writes through
// the real model, so schema validation and required fields are exercised the
// same way the controllers exercise them.
import Category from "../../models/Category.js";
import Customer from "../../models/Customer.js";
import Enquiry from "../../models/Enquiry.js";
import Expense from "../../models/Expense.js";
import Invoice from "../../models/Invoice.js";
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";
import {
  computeInvoiceTotals,
  computeTotals,
  invoiceTotalsFromOrder,
  lineTotal,
  paymentStatusFor,
  round2,
} from "../../utils/pricing.js";
import { daysFromToday, PICKUP_SLOT, today } from "./integration.js";

// Factory documents get their own number series. Nothing here goes through
// utils/numbers.js on purpose: a factory that consumed the real Counter would
// make the concurrency tests' sequence assertions depend on setup order.
let seq = 0;
const nextSeq = () => (seq += 1);

export const resetFactorySequence = () => {
  seq = 0;
};

export const orderNumberFor = (n) => `CS-TEST-${String(n).padStart(4, "0")}`;
export const invoiceNumberFor = (n) => `INV-TEST-${String(n).padStart(4, "0")}`;

// Distinct per document: Customer.phone is uniquely indexed.
export const phoneFor = (n) => `90000${String(n).padStart(5, "0")}`;

export const makeCustomer = async (overrides = {}) => {
  const n = nextSeq();
  return Customer.create({
    name: `Customer ${n}`,
    phone: phoneFor(n),
    email: `customer${n}@example.test`,
    ...overrides,
  });
};

export const orderItem = (overrides = {}) => {
  const item = {
    name: "Vanilla Celebration Cake",
    variantName: "1 kg",
    unitPrice: 1200,
    quantity: 1,
    addOns: [],
    ...overrides,
  };
  return { ...item, lineTotal: item.lineTotal ?? lineTotal(item) };
};

// Totals come from computeTotals rather than literals, so a factory order is
// internally consistent for the same reason a real one is.
export const makeOrder = async ({
  customer = null,
  items = [orderItem()],
  deliveryFee = 0,
  discount = 0,
  taxRate = 0,
  taxInclusive = false,
  amountPaid = 0,
  payments,
  ...overrides
} = {}) => {
  const n = nextSeq();
  const totals = computeTotals({ items, deliveryFee, discount, taxRate, taxInclusive });
  const entries = payments
    ?? (amountPaid > 0 ? [{ amount: amountPaid, method: "upi", note: "Seeded" }] : []);

  return Order.create({
    orderNumber: orderNumberFor(n),
    ...(customer ? { customer: customer._id } : {}),
    customerSnapshot: {
      name: customer?.name || `Guest ${n}`,
      phone: customer?.phone || phoneFor(n),
      email: customer?.email || "",
    },
    source: "website",
    // Far enough ahead to clear the pickup cutoff whatever hour the suite runs.
    fulfilment: { type: "pickup", date: daysFromToday(5), slot: PICKUP_SLOT },
    items,
    ...totals,
    amountPaid,
    payment: {
      status: paymentStatusFor(totals.grandTotal, amountPaid),
      method: entries[0]?.method || null,
      payments: entries,
    },
    status: "confirmed",
    ...overrides,
  });
};

export const invoiceLine = (overrides = {}) => ({
  description: "Vanilla Celebration Cake (1 kg)",
  quantity: 1,
  unitPrice: 1200,
  ...overrides,
});

export const makeInvoice = async ({
  customer = null,
  lines = [invoiceLine()],
  taxRate = 0,
  taxLabel = "Tax",
  discount = 0,
  amountPaid = 0,
  payments,
  ...overrides
} = {}) => {
  const n = nextSeq();
  const totals = computeInvoiceTotals({ lines, taxRate, taxLabel, discount });
  const entries = payments
    ?? (amountPaid > 0 ? [{ amount: amountPaid, method: "upi", note: "Seeded" }] : []);

  return Invoice.create({
    invoiceNumber: invoiceNumberFor(n),
    ...(customer ? { customer: customer._id } : {}),
    customerSnapshot: {
      name: customer?.name || `Customer ${n}`,
      phone: customer?.phone || phoneFor(n),
      email: customer?.email || "",
    },
    ...totals,
    amountPaid,
    balanceDue: round2(totals.total - amountPaid),
    dueDate: daysFromToday(7),
    status: amountPaid > 0 ? "partially_paid" : "issued",
    payments: entries,
    ...overrides,
  });
};

// An invoice raised from an order and linked on both sides — the state that
// PUT /api/invoices/:id/order has to unpick when it re-links.
export const makeInvoiceForOrder = async (order, { amountPaid = 0, payments, ...overrides } = {}) => {
  const n = nextSeq();
  const totals = invoiceTotalsFromOrder(order);
  const entries = payments
    ?? (amountPaid > 0
      ? [{ amount: amountPaid, method: "upi", note: `Via order ${order.orderNumber}` }]
      : []);

  const invoice = await Invoice.create({
    invoiceNumber: invoiceNumberFor(n),
    ...(order.customer ? { customer: order.customer } : {}),
    customerSnapshot: {
      name: order.customerSnapshot.name,
      phone: order.customerSnapshot.phone,
      email: order.customerSnapshot.email || "",
    },
    order: order._id,
    ...totals,
    amountPaid,
    balanceDue: round2(totals.total - amountPaid),
    dueDate: daysFromToday(7),
    status: amountPaid > 0 ? "partially_paid" : "issued",
    payments: entries,
    ...overrides,
  });

  order.invoice = invoice._id;
  await order.save();
  return invoice;
};

export const linkedInvoiceAndOrder = async ({ customer, order = {}, invoice = {} } = {}) => {
  const account = customer || (await makeCustomer());
  const savedOrder = await makeOrder({ customer: account, ...order });
  const savedInvoice = await makeInvoiceForOrder(savedOrder, invoice);
  return { customer: account, order: savedOrder, invoice: savedInvoice };
};

// A confirmed enquiry ready to be quoted and converted. eventDate sits far
// enough ahead that the order's fulfilment date can too.
export const makeEnquiry = async ({ customer = null, ...overrides } = {}) => {
  const n = nextSeq();
  const account = customer || (await makeCustomer());
  return Enquiry.create({
    customer: account._id,
    customerSnapshot: { name: account.name, phone: account.phone, email: account.email || "" },
    source: "instagram",
    eventDate: daysFromToday(14),
    size: "2 kg",
    flavours: "Belgian chocolate",
    designNotes: `Three tiers, gold leaf (${n})`,
    status: "awaiting_confirmation",
    ...overrides,
  });
};

export const makeCategory = async (overrides = {}) => {
  const n = nextSeq();
  return Category.create({ name: `Category ${n}`, slug: `category-${n}`, ...overrides });
};

export const makeProduct = async ({ category, ...overrides } = {}) => {
  const n = nextSeq();
  const parent = category || (await makeCategory());
  return Product.create({
    name: `Product ${n}`,
    slug: `product-${n}`,
    category: parent._id,
    description: "A test bake.",
    basePrice: 800,
    status: "published",
    ...overrides,
  });
};

export const makeExpense = async (overrides = {}) => {
  const n = nextSeq();
  return Expense.create({
    date: today(),
    category: "ingredients",
    description: `Expense ${n}`,
    amount: 250,
    vendor: "Test Supplier",
    paymentMethod: "cash",
    ...overrides,
  });
};

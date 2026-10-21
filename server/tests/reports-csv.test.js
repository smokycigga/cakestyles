// GET /api/reports/*.csv — the six exports on the admin Reports page. Each is
// checked for its permission, its CSV envelope (content type, download
// filename, header row) and its handling of the shared range selector, since
// the cards all post the same range=30d / this_month / from+to parameters.
//
// helpers/integration.js must be imported before ../app.js — see the safety
// note in that file.
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  csvDataRows,
  csvHeader,
  daysFromToday,
  missingId,
  seedSettings,
  signIn,
  today,
  useMemoryDatabase,
} from "./helpers/integration.js";
import {
  linkedInvoiceAndOrder,
  makeCustomer,
  makeExpense,
  makeInvoice,
  makeOrder,
  orderItem,
} from "./helpers/factories.js";
import app from "../app.js";
import Invoice from "../models/Invoice.js";
import Order from "../models/Order.js";
import { round2 } from "../utils/pricing.js";

useMemoryDatabase();

// createdAt is set by mongoose timestamps, so an order that needs to sit
// outside the default 30-day window has to be moved after the fact. Through the
// driver rather than the model: mongoose treats createdAt as immutable and
// silently drops it from a normal update.
const backdate = (id, isoDate) =>
  Order.collection.updateOne({ _id: id }, { $set: { createdAt: isoDate } });

const get = (path, auth, query = "") =>
  request(app).get(`/api/reports/${path}${query}`).set("Authorization", auth);

let owner;

beforeEach(async () => {
  await seedSettings();
  owner = await signIn("owner");
});

// The Reports page links one card per entry here. A missing route served the
// card a 404 download, which is how /reports/expenses.csv came to be added.
const REPORTS = [
  { path: "sales.csv", filename: "cakestyles-sales.csv", role: "manager", denied: "staff",
    header: ["date", "orderNumber", "customer", "phone", "source", "status", "paymentStatus", "subtotal", "tax", "delivery", "total"] },
  { path: "products.csv", filename: "cakestyles-product-sales.csv", role: "manager", denied: "staff",
    header: ["product", "units", "orders", "revenue", "avgSellingPrice"] },
  { path: "outstanding.csv", filename: "cakestyles-outstanding.csv", role: "accounts", denied: "staff",
    header: ["invoiceNumber", "customer", "phone", "date", "dueDate", "total", "amountPaid", "balanceDue", "status"] },
  { path: "profitability.csv", filename: "cakestyles-profitability.csv", role: "accounts", denied: "staff",
    header: ["metric", "value"] },
  { path: "expenses.csv", filename: "cakestyles-expenses.csv", role: "accounts", denied: "staff",
    header: ["date", "category", "description", "amount", "vendor", "paymentMethod", "recurring", "notes"] },
  { path: "customers.csv", filename: "cakestyles-customers.csv", role: "staff", denied: null,
    header: ["name", "phone", "email", "tags", "leadSource"] },
];

describe("report CSV envelope", () => {
  it.each(REPORTS)("$path downloads as a named CSV with its header row", async ({ path, filename, role, header }) => {
    const permitted = await signIn(role);
    const res = await get(path, permitted.auth);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="${filename}"`);
    // A header row is present even with nothing to report, so the download
    // opens as a table rather than an empty file.
    expect(csvHeader(res.text)).toEqual(header);
  });

  it.each(REPORTS)("$path refuses an unauthenticated request", async ({ path }) => {
    const res = await request(app).get(`/api/reports/${path}`);
    expect(res.status).toBe(401);
  });

  it.each(REPORTS.filter((r) => r.denied))("$path refuses a role without its permission", async ({ path, denied }) => {
    const under = await signIn(denied);
    const res = await get(path, under.auth);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/reports/sales.csv", () => {
  it("reports one row per order in the range, with the stored totals", async () => {
    const order = await makeOrder({ items: [orderItem({ unitPrice: 1500, quantity: 2 })], taxRate: 18 });
    const res = await get("sales.csv", owner.auth);

    const rows = csvDataRows(res.text);
    expect(rows).toHaveLength(1);
    const cells = rows[0].split(",");
    expect(cells[1]).toBe(order.orderNumber);
    expect(cells[3]).toBe(order.customerSnapshot.phone);
    // Figures come off the order, not recomputed by the report.
    expect(Number(cells[7])).toBe(order.subtotal);
    expect(Number(cells[8])).toBe(order.taxTotal);
    expect(Number(cells[10])).toBe(order.grandTotal);
  });

  it("leaves out orders older than the default 30-day window", async () => {
    await makeOrder();
    const old = await makeOrder();
    await backdate(old._id, new Date(`${daysFromToday(-60)}T06:00:00.000Z`));

    expect(csvDataRows((await get("sales.csv", owner.auth)).text)).toHaveLength(1);
    expect(csvDataRows((await get("sales.csv", owner.auth, "?range=30d")).text)).toHaveLength(1);
    // An explicit range wide enough to reach it brings the second row back.
    const wide = `?from=${daysFromToday(-90)}&to=${today()}`;
    expect(csvDataRows((await get("sales.csv", owner.auth, wide)).text)).toHaveLength(2);
  });

  it("narrows to a single day for range=today and excludes yesterday's orders", async () => {
    await makeOrder();
    const yesterday = await makeOrder();
    await backdate(yesterday._id, new Date(`${daysFromToday(-1)}T06:00:00.000Z`));

    expect(csvDataRows((await get("sales.csv", owner.auth, "?range=today")).text)).toHaveLength(1);
    expect(csvDataRows((await get("sales.csv", owner.auth, "?range=7d")).text)).toHaveLength(2);
  });

  it("honours range=this_month", async () => {
    await makeOrder();
    const lastYear = await makeOrder();
    await backdate(lastYear._id, new Date(`${daysFromToday(-400)}T06:00:00.000Z`));

    expect(csvDataRows((await get("sales.csv", owner.auth, "?range=this_month")).text)).toHaveLength(1);
  });

  it("includes cancelled orders, because a sales log is a log of what happened", async () => {
    await makeOrder({ status: "cancelled" });
    const rows = csvDataRows((await get("sales.csv", owner.auth)).text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("cancelled");
  });
});

describe("GET /api/reports/products.csv", () => {
  it("aggregates units and revenue per product name, highest revenue first", async () => {
    await makeOrder({
      items: [
        orderItem({ name: "Truffle Cake", unitPrice: 1000, quantity: 2 }),
        orderItem({ name: "Cupcake Box", unitPrice: 300, quantity: 1 }),
      ],
    });
    await makeOrder({ items: [orderItem({ name: "Truffle Cake", unitPrice: 1000, quantity: 1 })] });

    const rows = csvDataRows((await get("products.csv", owner.auth)).text).map((r) => r.split(","));
    expect(rows.map((r) => r[0])).toEqual(["Truffle Cake", "Cupcake Box"]);
    expect(rows[0].slice(1)).toEqual(["3", "2", "3000", "1000"]);
    expect(rows[1].slice(1)).toEqual(["1", "1", "300", "300"]);
  });

  it("excludes cancelled and refunded orders, which are not sales", async () => {
    await makeOrder({ items: [orderItem({ name: "Truffle Cake" })], status: "cancelled" });
    await makeOrder({ items: [orderItem({ name: "Truffle Cake" })], status: "refunded" });
    await makeOrder({ items: [orderItem({ name: "Truffle Cake" })], status: "partially_refunded" });

    expect(csvDataRows((await get("products.csv", owner.auth)).text)).toEqual([]);
  });

  it("respects the range selector", async () => {
    const old = await makeOrder({ items: [orderItem({ name: "Truffle Cake" })] });
    await backdate(old._id, new Date(`${daysFromToday(-60)}T06:00:00.000Z`));

    expect(csvDataRows((await get("products.csv", owner.auth)).text)).toEqual([]);
    const wide = `?from=${daysFromToday(-90)}&to=${today()}`;
    expect(csvDataRows((await get("products.csv", owner.auth, wide)).text)).toHaveLength(1);
  });
});

describe("GET /api/reports/profitability.csv", () => {
  it("reports sales, expenses and the contribution between them", async () => {
    const first = await makeOrder({ items: [orderItem({ unitPrice: 2000, quantity: 1 })] });
    const second = await makeOrder({ items: [orderItem({ unitPrice: 500, quantity: 2 })] });
    await makeExpense({ amount: 400, category: "ingredients" });
    await makeExpense({ amount: 100, category: "packaging" });

    const rows = csvDataRows((await get("profitability.csv", owner.auth)).text).map((r) => r.split(","));
    const value = (metric) => Number(rows.find((r) => r[0] === metric)[1]);

    const sales = round2(first.grandTotal + second.grandTotal);
    expect(value("Sales")).toBe(sales);
    expect(value("Expenses")).toBe(500);
    expect(value("Contribution")).toBe(round2(sales - 500));
    // Each expense is also broken out by category beneath the summary.
    expect(rows.filter((r) => r[0].startsWith("Expense: "))).toHaveLength(2);
  });

  it("leaves cancelled and refunded orders out of the sales figure", async () => {
    const kept = await makeOrder({ items: [orderItem({ unitPrice: 1000 })] });
    await makeOrder({ items: [orderItem({ unitPrice: 9999 })], status: "cancelled" });

    const rows = csvDataRows((await get("profitability.csv", owner.auth)).text).map((r) => r.split(","));
    expect(Number(rows.find((r) => r[0] === "Sales")[1])).toBe(kept.grandTotal);
  });

  it("respects the range selector on both sides of the calculation", async () => {
    const old = await makeOrder({ items: [orderItem({ unitPrice: 1000 })] });
    await backdate(old._id, new Date(`${daysFromToday(-60)}T06:00:00.000Z`));
    await makeExpense({ amount: 700, date: daysFromToday(-60) });

    const rows = csvDataRows((await get("profitability.csv", owner.auth)).text).map((r) => r.split(","));
    expect(Number(rows.find((r) => r[0] === "Sales")[1])).toBe(0);
    expect(Number(rows.find((r) => r[0] === "Expenses")[1])).toBe(0);

    const wide = `?from=${daysFromToday(-90)}&to=${today()}`;
    const wider = csvDataRows((await get("profitability.csv", owner.auth, wide)).text).map((r) => r.split(","));
    expect(Number(wider.find((r) => r[0] === "Sales")[1])).toBe(1000);
    expect(Number(wider.find((r) => r[0] === "Expenses")[1])).toBe(700);
  });
});

describe("GET /api/reports/expenses.csv", () => {
  it("exports the expense ledger newest first, with recurrence spelled out", async () => {
    await makeExpense({ description: "Older bag of flour", date: daysFromToday(-3) });
    await makeExpense({
      description: "Monthly rent",
      category: "rent",
      amount: 15000,
      recurring: { isRecurring: true, frequency: "monthly" },
    });

    const rows = csvDataRows((await get("expenses.csv", owner.auth)).text).map((r) => r.split(","));
    expect(rows).toHaveLength(2);
    expect(rows[0][2]).toBe("Monthly rent");
    expect(rows[0][6]).toBe("monthly");
    // A one-off reads as "no" rather than an empty cell.
    expect(rows[1][6]).toBe("no");
  });

  it("filters on the shared range selector rather than exporting everything", async () => {
    // The card on the Reports page posts the same range as its neighbours; this
    // route exists instead of reusing /expenses/export.csv, which ignores it.
    await makeExpense({ description: "This month" });
    await makeExpense({ description: "Long ago", date: daysFromToday(-60) });

    expect(csvDataRows((await get("expenses.csv", owner.auth)).text)).toHaveLength(1);
    const wide = `?from=${daysFromToday(-90)}&to=${today()}`;
    expect(csvDataRows((await get("expenses.csv", owner.auth, wide)).text)).toHaveLength(2);
  });

  it("is gated on expenses:read, so a manager can read it but staff cannot", async () => {
    const manager = await signIn("manager");
    const staff = await signIn("staff");
    expect((await get("expenses.csv", manager.auth)).status).toBe(200);
    expect((await get("expenses.csv", staff.auth)).status).toBe(403);
  });
});

describe("GET /api/reports/outstanding.csv", () => {
  it("lists only invoices that still owe money, soonest due first", async () => {
    const customer = await makeCustomer();
    await makeInvoice({ customer, status: "paid", dueDate: daysFromToday(1) });
    await makeInvoice({ customer, status: "cancelled", dueDate: daysFromToday(2) });
    const overdue = await makeInvoice({ customer, status: "overdue", dueDate: daysFromToday(-5) });
    const partial = await makeInvoice({ customer, amountPaid: 200, dueDate: daysFromToday(3) });
    const issued = await makeInvoice({ customer, status: "issued", dueDate: daysFromToday(9) });

    const rows = csvDataRows((await get("outstanding.csv", owner.auth)).text).map((r) => r.split(","));
    expect(rows.map((r) => r[0])).toEqual([
      overdue.invoiceNumber,
      partial.invoiceNumber,
      issued.invoiceNumber,
    ]);
    expect(Number(rows[1][7])).toBe(round2(partial.total - 200));
  });

  it("ignores the range selector, because an old unpaid invoice is still owed", async () => {
    // Deliberate difference from the other reports: filtering this one by date
    // would hide exactly the debts worth chasing.
    await makeInvoice({ status: "issued" });
    const narrow = "?range=today";
    expect(csvDataRows((await get("outstanding.csv", owner.auth, narrow)).text)).toHaveLength(1);
  });
});

// Deliberately not folded into the REPORTS table above: this route needs a
// customerId, so its envelope is only meaningful with one supplied.
describe("GET /api/reports/customer-statement.csv", () => {
  const HEADER = [
    "customer", "phone", "date", "type", "reference", "status", "items", "quantity",
    "subtotal", "discount", "tax", "delivery", "total", "amountPaid", "balanceDue", "dueDate",
  ];

  const statement = (customer, query = "") =>
    get("customer-statement.csv", owner.auth, `?customerId=${customer._id}${query}`);

  it("downloads under the customer's name with the statement header", async () => {
    const customer = await makeCustomer({ name: "Meera Patel" });
    const res = await statement(customer);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="cakestyles-statement-meera-patel.csv"');
    expect(csvHeader(res.text)).toEqual(HEADER);
  });

  it("exports one row per order with the items, money and balance owed", async () => {
    const customer = await makeCustomer();
    const order = await makeOrder({
      customer,
      amountPaid: 500,
      items: [orderItem({ name: "Truffle Cake", variantName: "1 kg", unitPrice: 1000, quantity: 2 })],
    });

    const rows = csvDataRows((await statement(customer)).text).map((r) => r.split(","));
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe(customer.name);
    expect(rows[0][3]).toBe("Order");
    expect(rows[0][4]).toBe(order.orderNumber);
    expect(rows[0][6]).toBe("Truffle Cake (1 kg) × 2");
    expect(rows[0][7]).toBe("2");
    expect(Number(rows[0][12])).toBe(order.grandTotal);
    expect(Number(rows[0][13])).toBe(500);
    expect(Number(rows[0][14])).toBe(round2(order.grandTotal - 500));
  });

  it("holds only the chosen customer's orders", async () => {
    const meera = await makeCustomer({ name: "Meera" });
    await makeOrder({ customer: meera });
    await makeOrder({ customer: await makeCustomer({ name: "Someone Else" }) });

    const rows = csvDataRows((await statement(meera)).text).map((r) => r.split(","));
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("Meera");
  });

  it("adds standalone invoices but not the ones an order row already covers", async () => {
    const account = await makeCustomer();
    await linkedInvoiceAndOrder({ customer: account });
    const standalone = await makeInvoice({ customer: account, amountPaid: 200 });

    const rows = csvDataRows((await statement(account)).text).map((r) => r.split(","));
    expect(rows).toHaveLength(2);
    const invoiceRow = rows.find((r) => r[3] === "Invoice");
    expect(invoiceRow[4]).toBe(standalone.invoiceNumber);
    expect(Number(invoiceRow[14])).toBe(round2(standalone.total - 200));
    expect(invoiceRow[15]).toBe(standalone.dueDate);
    // Order-linked invoice is skipped; its money rides on the order row.
    expect(rows.filter((r) => r[3] === "Invoice")).toHaveLength(1);
  });

  it("puts orders and invoices on one chronological timeline", async () => {
    const customer = await makeCustomer();
    const order = await makeOrder({ customer });
    const invoice = await makeInvoice({ customer });
    await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: new Date(`${daysFromToday(-2)}T06:00:00.000Z`) } });
    await Invoice.collection.updateOne({ _id: invoice._id }, { $set: { createdAt: new Date(`${daysFromToday(-1)}T06:00:00.000Z`) } });

    const rows = csvDataRows((await statement(customer)).text).map((r) => r.split(","));
    expect(rows.map((r) => r[3])).toEqual(["Order", "Invoice"]);
  });

  it("honours the shared range selector, and range=all covers the full history", async () => {
    const customer = await makeCustomer();
    const old = await makeOrder({ customer });
    await backdate(old._id, new Date(`${daysFromToday(-90)}T06:00:00.000Z`));

    expect(csvDataRows((await statement(customer)).text)).toEqual([]);
    const wide = `&from=${daysFromToday(-120)}&to=${today()}`;
    expect(csvDataRows((await statement(customer, wide)).text)).toHaveLength(1);
    expect(csvDataRows((await statement(customer, "&range=all")).text)).toHaveLength(1);
  });

  it("asks for a customer instead of guessing when none is given", async () => {
    // Must be a 4xx: an id length that mongoose cannot cast used to be the
    // difference between a helpful message and a 500 from the error handler.
    expect((await get("customer-statement.csv", owner.auth)).status).toBe(400);
    expect((await get("customer-statement.csv", owner.auth, "?customerId=nonsense")).status).toBe(400);
    expect((await get("customer-statement.csv", owner.auth, `?customerId=${missingId()}`)).status).toBe(404);
  });

  it("is gated on analytics:read and refuses an anonymous caller", async () => {
    const customer = await makeCustomer();
    const manager = await signIn("manager");
    const staff = await signIn("staff");

    expect((await get("customer-statement.csv", manager.auth, `?customerId=${customer._id}`)).status).toBe(200);
    expect((await get("customer-statement.csv", staff.auth, `?customerId=${customer._id}`)).status).toBe(403);
    expect((await request(app).get(`/api/reports/customer-statement.csv?customerId=${customer._id}`)).status).toBe(401);
  });
});

describe("GET /api/reports/customers.csv", () => {
  it("exports active customers with their tags joined by a pipe", async () => {
    await makeCustomer({ name: "Ada", tags: ["vip", "wholesale"], leadSource: "instagram" });
    await makeCustomer({ name: "Retired Rita", active: false });

    const rows = csvDataRows((await get("customers.csv", owner.auth)).text).map((r) => r.split(","));
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("Ada");
    expect(rows[0][3]).toBe("vip|wholesale");
    expect(rows[0][4]).toBe("instagram");
  });

  it("quotes a value containing a comma so the columns stay aligned", async () => {
    await makeCustomer({ name: "Patel, Meera" });
    const line = csvDataRows((await get("customers.csv", owner.auth)).text)[0];
    expect(line.startsWith('"Patel, Meera",')).toBe(true);
  });
});

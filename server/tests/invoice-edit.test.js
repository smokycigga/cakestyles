import { describe, it, expect } from "vitest";
import { computeInvoiceTotals } from "../utils/pricing.js";
import { applyOverdue, settleInFull } from "../controllers/invoiceController.js";
import { computeTotals, validLines } from "../../client/src/lib/invoiceTotals.js";

const lines = (...rows) => rows.map(([description, quantity, unitPrice]) => ({ description, quantity, unitPrice }));

describe("invoice edit recompute", () => {
  it("recomputes subtotal, tax and total from the submitted lines", () => {
    const totals = computeInvoiceTotals({
      lines: lines(["Cake", 2, 500], ["Box", 1, 50]),
      taxRate: 5,
      taxLabel: "GST",
      discount: 100,
    });

    expect(totals.subtotal).toBe(1050);
    expect(totals.discount).toBe(100);
    expect(totals.tax).toEqual({ rate: 5, label: "GST", amount: 47.5 });
    expect(totals.total).toBe(997.5);
    expect(totals.lines.map((l) => l.amount)).toEqual([1000, 50]);
  });

  it("taxes the discounted amount, not the raw subtotal", () => {
    // Wrong base would give 50 here instead of 45.
    const totals = computeInvoiceTotals({
      lines: lines(["Cake", 1, 1000]),
      taxRate: 5,
      discount: 100,
    });
    expect(totals.tax.amount).toBe(45);
    expect(totals.total).toBe(945);
  });

  it("clamps a discount larger than the subtotal instead of going negative", () => {
    const totals = computeInvoiceTotals({
      lines: lines(["Cake", 1, 200]),
      taxRate: 0,
      discount: 500,
    });
    expect(totals.discount).toBe(200);
    expect(totals.total).toBe(0);
  });

  it("rounds each line and the total to paise", () => {
    const totals = computeInvoiceTotals({
      lines: lines(["A", 3, 33.33], ["B", 1, 0.1]),
      taxRate: 0,
      discount: 0,
    });
    expect(totals.lines[0].amount).toBe(99.99);
    expect(totals.subtotal).toBe(100.09);
  });

  it("handles a zero-rate invoice with no tax object amount", () => {
    const totals = computeInvoiceTotals({ lines: lines(["A", 1, 100]), taxRate: 0, discount: 0 });
    expect(totals.tax.amount).toBe(0);
    expect(totals.total).toBe(100);
  });
});

describe("client preview matches the server", () => {
  const cases = [
    { lines: lines(["Cake", 2, 499.5]), taxRate: 5, discount: 50 },
    { lines: lines(["A", 1, 100], ["B", 7, 12.34]), taxRate: 18, discount: 0 },
    { lines: lines(["A", 1, 100]), taxRate: 0, discount: 999 },
  ];

  for (const [i, input] of cases.entries()) {
    it(`agrees with the server on case ${i + 1}`, () => {
      const server = computeInvoiceTotals(input);
      const client = computeTotals(input);
      expect(client.subtotal).toBe(server.subtotal);
      expect(client.discount).toBe(server.discount);
      expect(client.tax).toBe(server.tax.amount);
      expect(client.total).toBe(server.total);
    });
  }

  it("tolerates blank editor rows while typing", () => {
    expect(() => computeTotals({ lines: [{ description: "", quantity: "", unitPrice: "" }], taxRate: "" }).total).not.toThrow();
    expect(computeTotals({ lines: null, taxRate: null, discount: null }).total).toBe(0);
  });
});

describe("validLines", () => {
  it("keeps only rows with a description and a numeric price", () => {
    const result = validLines([
      { description: "Cake", quantity: 2, unitPrice: "500" },
      { description: "", quantity: 1, unitPrice: "10" },
      { description: "No price", quantity: 1, unitPrice: "" },
      { description: "Junk", quantity: 1, unitPrice: "abc" },
    ]);
    expect(result).toEqual([{ description: "Cake", quantity: 2, unitPrice: 500, isCustom: false }]);
  });

  it("carries the custom flag and the catalogue link through an edit", () => {
    const [custom, catalogue] = validLines([
      { description: "Sketch fee", quantity: 1, unitPrice: 250, isCustom: true },
      { description: "Truffle", quantity: 1, unitPrice: 800, product: "64f000000000000000000001" },
    ]);
    expect(custom.isCustom).toBe(true);
    expect(custom.product).toBeUndefined();
    expect(catalogue).toMatchObject({ product: "64f000000000000000000001", isCustom: false });
  });

  it("never lets a quantity drop below one", () => {
    expect(validLines([{ description: "A", quantity: 0, unitPrice: 10 }])[0].quantity).toBe(1);
  });
});

describe("applyOverdue", () => {
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const invoice = (overrides) => ({
    status: "issued",
    balanceDue: 100,
    dueDate: day(-1),
    ...overrides,
  });

  it("marks an issued invoice overdue once the due date passes", () => {
    const inv = invoice();
    expect(applyOverdue(inv)).toBe(true);
    expect(inv.status).toBe("overdue");
  });

  it("marks a partially paid invoice overdue too, since it still owes money", () => {
    const inv = invoice({ status: "partially_paid", balanceDue: 40 });
    expect(applyOverdue(inv)).toBe(true);
    expect(inv.status).toBe("overdue");
  });

  it("leaves an invoice alone before its due date", () => {
    const inv = invoice({ dueDate: day(1) });
    expect(applyOverdue(inv)).toBe(false);
    expect(inv.status).toBe("issued");
  });

  it("is not a one-way door: moving the due date forward clears the flag", () => {
    const inv = invoice({ status: "overdue", dueDate: day(3) });
    // Already overdue stays overdue until the date is fixed by an edit.
    expect(applyOverdue(inv)).toBe(false);
    expect(inv.status).toBe("overdue");
  });

  it("ignores settled and cancelled invoices", () => {
    expect(applyOverdue(invoice({ status: "paid" }))).toBe(false);
    expect(applyOverdue(invoice({ status: "cancelled" }))).toBe(false);
  });

  it("ignores a fully settled balance and a missing due date", () => {
    expect(applyOverdue(invoice({ balanceDue: 0 }))).toBe(false);
    expect(applyOverdue(invoice({ dueDate: "" }))).toBe(false);
  });
});

describe("settleInFull (Mark Paid)", () => {
  const invoice = (overrides) => ({
    total: 800,
    amountPaid: 0,
    balanceDue: 800,
    payments: [],
    ...overrides,
  });
  const user = { _id: "u1", name: "Cakestyles Owner" };

  it("settles the outstanding balance so status and money agree", () => {
    const inv = invoice();
    const settled = settleInFull(inv, user);
    expect(settled).toBe(800);
    expect(inv.amountPaid).toBe(800);
    expect(inv.balanceDue).toBe(0);
    expect(inv.payments).toHaveLength(1);
    expect(inv.payments[0]).toMatchObject({ amount: 800, method: "other", ref: "Marked paid" });
    expect(inv.payments[0].recordedBy).toEqual({ userId: "u1", name: "Cakestyles Owner" });
  });

  it("adds to payments already recorded instead of double-counting", () => {
    const inv = invoice({ amountPaid: 300, balanceDue: 500, payments: [{ amount: 300, method: "upi" }] });
    expect(settleInFull(inv, user)).toBe(500);
    expect(inv.payments).toHaveLength(2);
    expect(inv.amountPaid).toBe(800);
    expect(inv.balanceDue).toBe(0);
  });

  it("does nothing when the invoice is already settled", () => {
    const inv = invoice({ amountPaid: 800, balanceDue: 0, payments: [{ amount: 800, method: "cash" }] });
    expect(settleInFull(inv, user)).toBe(0);
    expect(inv.payments).toHaveLength(1);
  });

  it("survives a missing or malformed invoice object", () => {
    expect(settleInFull(null, user)).toBe(0);
    expect(settleInFull({}, user)).toBe(0);
    expect(settleInFull({ total: 0, payments: [] }, user)).toBe(0);
  });
});

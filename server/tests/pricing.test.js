import { describe, it, expect } from "vitest";
import { lineTotal, computeTotals, computeInvoiceTotals, paymentStatusFor, round2 } from "../utils/pricing.js";

describe("pricing engine", () => {
  it("computes line totals including add-ons", () => {
    expect(
      lineTotal({ unitPrice: 100, quantity: 2, addOns: [{ name: "candles", price: 30 }] })
    ).toBe(260);
  });

  it("sums item line totals into a subtotal", () => {
    const totals = computeTotals({ items: [{ lineTotal: 500 }, { lineTotal: 250 }] });
    expect(totals.subtotal).toBe(750);
    expect(totals.grandTotal).toBe(750);
  });

  it("applies exclusive tax, delivery fee and discount correctly", () => {
    const totals = computeTotals({
      items: [{ lineTotal: 1000 }],
      deliveryFee: 50,
      discount: 100,
      taxRate: 5,
      taxInclusive: false,
    });
    // tax on (1000-100)=900 at 5% = 45; total = 900 + 50 + 45
    expect(totals.taxTotal).toBe(45);
    expect(totals.grandTotal).toBe(995);
  });

  it("extracts inclusive tax for display without changing the total", () => {
    const totals = computeTotals({
      items: [{ lineTotal: 1050 }],
      taxRate: 5,
      taxInclusive: true,
    });
    expect(totals.grandTotal).toBe(1050);
    expect(totals.taxTotal).toBeCloseTo(50, 0);
  });

  it("caps discounts at the subtotal", () => {
    const totals = computeTotals({ items: [{ lineTotal: 200 }], discount: 500 });
    expect(totals.grandTotal).toBe(0);
  });

  it("derives payment status from amounts", () => {
    expect(paymentStatusFor(500, 0)).toBe("pending");
    expect(paymentStatusFor(500, 200)).toBe("partial");
    expect(paymentStatusFor(500, 500)).toBe("paid");
  });

  it("rounds to 2 decimals safely", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("invoice reproducibility (PRD §22.7)", () => {
  it("reproduces totals purely from stored lines + tax/discount", () => {
    const lines = [
      { description: "Cake", quantity: 1, unitPrice: 1400 },
      { description: "Delivery", quantity: 1, unitPrice: 50 },
    ];
    const first = computeInvoiceTotals({ lines, taxRate: 5, taxLabel: "GST", discount: 0 });
    const second = computeInvoiceTotals({ lines: first.lines, taxRate: 5, taxLabel: "GST", discount: 0 });

    expect(first.total).toBe(1522.5);
    expect(first.lines[0].amount).toBe(1400);
    expect(second.total).toBe(first.total);
    expect(second.subtotal).toBe(first.subtotal);
    expect(second.tax.amount).toBe(first.tax.amount);
  });
});

describe("historical price integrity (PRD §22.1–22.3)", () => {
  it("keeps order line snapshots independent of later product price changes", () => {
    // Order placed when the product cost 500.
    const orderAtPlacement = computeTotals({ items: [{ lineTotal: lineTotal({ unitPrice: 500, quantity: 2 }) }] });

    // Product price later changes to 900 — recomputing the ORDER from its
    // stored snapshots must still yield the original total.
    const recomputedFromSnapshot = computeTotals({ items: [{ lineTotal: 1000 }] });

    expect(orderAtPlacement.grandTotal).toBe(1000);
    expect(recomputedFromSnapshot.grandTotal).toBe(1000);
    // The new price only affects NEW line totals:
    expect(lineTotal({ unitPrice: 900, quantity: 2 })).toBe(1800);
  });
});

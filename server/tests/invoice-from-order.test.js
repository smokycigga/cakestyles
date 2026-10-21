import { describe, it, expect } from "vitest";
import { computeTotals, lineTotal, invoiceTotalsFromOrder } from "../utils/pricing.js";

// Builds an order exactly the way the checkout controller does, so the fixture's
// stored totals are self-consistent and the invoice can be reconciled against
// them instead of against hand-written numbers.
const order = ({ items, deliveryFee = 0, discount = 0, taxRate = 0, taxInclusive = false }) => {
  const priced = items.map((item) => ({ addOns: [], ...item, lineTotal: lineTotal({ addOns: [], ...item }) }));
  return { items: priced, ...computeTotals({ items: priced, deliveryFee, discount, taxRate, taxInclusive }) };
};

const cake = { name: "Truffle Cake", variantName: "1 kg", unitPrice: 500, quantity: 2 };

describe("invoiceTotalsFromOrder", () => {
  it("bills exactly what the order bills, fee and discount and tax included", () => {
    const o = order({ items: [cake], deliveryFee: 90, discount: 100, taxRate: 5 });
    const inv = invoiceTotalsFromOrder(o, "GST");

    expect(o.grandTotal).toBe(1035);
    expect(inv.total).toBe(o.grandTotal);
    // The printed column has to add up on its own, or the document is unreadable.
    expect(inv.subtotal - inv.discount + inv.tax.amount).toBeCloseTo(inv.total, 2);
  });

  it("carries the order's discount instead of dropping it", () => {
    const o = order({ items: [cake], discount: 250 });
    expect(invoiceTotalsFromOrder(o).discount).toBe(250);
    expect(invoiceTotalsFromOrder(o).total).toBe(o.grandTotal);
  });

  it("does not tax the delivery fee the order never taxed", () => {
    const o = order({ items: [cake], deliveryFee: 90, taxRate: 5 });
    const inv = invoiceTotalsFromOrder(o);
    // Taxing the fee would bill 4.50 more than the order.
    expect(inv.tax.amount).toBe(50);
    expect(inv.total).toBe(1140);
    expect(inv.total).toBe(o.grandTotal);
  });

  it("keeps add-on money in the line amount", () => {
    const o = order({
      items: [{ ...cake, addOns: [{ name: "Candles", price: 50 }, { name: "Message card", price: 30 }] }],
    });
    const [line] = invoiceTotalsFromOrder(o).lines;

    expect(line.unitPrice).toBe(580);
    expect(line.amount).toBe(o.items[0].lineTotal);
    expect(line.description).toBe("Truffle Cake (1 kg, Candles, Message card)");
    expect(invoiceTotalsFromOrder(o).total).toBe(o.grandTotal);
  });

  it("flags a tax-inclusive order instead of taxing it twice", () => {
    const o = order({ items: [cake], deliveryFee: 90, taxRate: 5, taxInclusive: true });
    const inv = invoiceTotalsFromOrder(o);

    expect(inv.tax.inclusive).toBe(true);
    expect(inv.total).toBe(o.grandTotal);
    // Adding the extracted tax on top would have billed 1141.90 for a 1090 order.
    expect(inv.total).toBe(1090);
  });

  it("does not mistake an untaxed order for an inclusive one", () => {
    const inv = invoiceTotalsFromOrder(order({ items: [cake], deliveryFee: 90 }));
    expect(inv.tax).toMatchObject({ rate: 0, amount: 0, inclusive: false });
    expect(inv.total).toBe(1090);
  });

  it("adds a delivery line only when the order was delivered", () => {
    const pickup = invoiceTotalsFromOrder(order({ items: [cake] }));
    expect(pickup.lines).toHaveLength(1);

    const delivered = invoiceTotalsFromOrder(order({ items: [cake], deliveryFee: 90 }));
    expect(delivered.lines).toHaveLength(2);
    expect(delivered.lines[1]).toMatchObject({ description: "Delivery", quantity: 1, unitPrice: 90, isCustom: true });
  });

  it("labels the tax row from the store settings", () => {
    const o = order({ items: [cake], taxRate: 18 });
    expect(invoiceTotalsFromOrder(o, "GST").tax).toMatchObject({ rate: 18, label: "GST" });
    expect(invoiceTotalsFromOrder(o).tax.label).toBe("Tax");
  });

  it("marks a custom item and keeps the catalogue reference", () => {
    const o = order({
      items: [
        { name: "Hamper", unitPrice: 400, quantity: 1, isCustom: true },
        { name: "Brownie", unitPrice: 120, quantity: 1, product: "64f000000000000000000001" },
      ],
    });
    const [custom, catalogue] = invoiceTotalsFromOrder(o).lines;

    expect(custom).toMatchObject({ description: "Hamper", isCustom: true });
    expect(custom.product).toBeUndefined();
    expect(catalogue).toMatchObject({ product: "64f000000000000000000001", isCustom: false });
  });

  it("survives an order with no items or missing money fields", () => {
    expect(invoiceTotalsFromOrder({}).total).toBe(0);
    expect(invoiceTotalsFromOrder({ items: [] }).lines).toEqual([]);
  });

  it("clamps a discount that exceeds the lines", () => {
    const inv = invoiceTotalsFromOrder({ items: [{ name: "A", unitPrice: 100, quantity: 1 }], discount: 500, grandTotal: 0 });
    expect(inv.discount).toBe(100);
  });
});

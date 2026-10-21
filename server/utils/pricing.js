// Pure pricing engine — the single source of truth for money math.
// Order lines snapshot prices at order time; totals are always recomputed
// from these functions so historical documents stay reproducible (PRD §22).

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const lineTotal = ({ unitPrice, quantity, addOns = [] }) => {
  const addOnSum = addOns.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  return round2((Number(unitPrice) + addOnSum) * Number(quantity));
};

// items: [{unitPrice, quantity, addOns: [{price}]}] (lineTotal may be precomputed)
export const computeTotals = ({ items, deliveryFee = 0, discount = 0, taxRate = 0, taxInclusive = false }) => {
  const subtotal = round2(
    items.reduce(
      (sum, it) => sum + (it.lineTotal != null ? it.lineTotal : lineTotal(it)),
      0
    )
  );

  const discountAmount = Math.min(round2(Number(discount) || 0), subtotal);
  const fee = round2(Number(deliveryFee) || 0);
  const rate = Number(taxRate) || 0;

  let taxTotal = 0;
  let grandTotal;

  if (rate > 0 && taxInclusive) {
    // Tax already inside the item prices: extract for display.
    grandTotal = round2(subtotal - discountAmount + fee);
    taxTotal = round2(grandTotal - grandTotal / (1 + rate / 100));
  } else {
    taxTotal = round2(((subtotal - discountAmount) * rate) / 100);
    grandTotal = round2(subtotal - discountAmount + fee + taxTotal);
  }

  return { subtotal, discount: discountAmount, deliveryFee: fee, taxRate: rate, taxTotal, grandTotal };
};

export const sumPayments = (payments = []) =>
  round2(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));

// Invoice totals must be reproducible purely from stored lines + tax/discount (PRD §22.7).
export const computeInvoiceTotals = ({ lines, taxRate = 0, taxLabel = "Tax", discount = 0 }) => {
  const computed = lines.map((l) => ({
    ...l,
    amount: round2(Number(l.unitPrice) * Number(l.quantity)),
  }));
  const subtotal = round2(computed.reduce((s, l) => s + l.amount, 0));
  const discountAmount = Math.min(round2(Number(discount) || 0), subtotal);
  const taxTotal = round2(((subtotal - discountAmount) * (Number(taxRate) || 0)) / 100);
  const total = round2(subtotal - discountAmount + taxTotal);
  return { lines: computed, subtotal, discount: discountAmount, tax: { rate: taxRate, label: taxLabel, amount: taxTotal }, total };
};

/**
 * Invoice lines for an order. Add-ons are folded into the unit price so that
 * `amount = unitPrice x quantity` still reproduces the order's line total —
 * recomputing from the bare unitPrice silently dropped every add-on charge.
 */
export const invoiceLinesFromOrder = (order) => {
  const lines = (order.items || []).map((item) => {
    const addOns = item.addOns || [];
    const addOnSum = addOns.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
    const qualifiers = [item.variantName, ...addOns.map((a) => a.name)].filter(Boolean);
    return {
      ...(item.product ? { product: item.product } : {}),
      description: qualifiers.length ? `${item.name} (${qualifiers.join(", ")})` : item.name,
      quantity: item.quantity,
      unitPrice: round2(Number(item.unitPrice) + addOnSum),
      isCustom: Boolean(item.isCustom),
    };
  });

  if (order.deliveryFee > 0) {
    lines.push({
      description: "Delivery",
      quantity: 1,
      unitPrice: round2(order.deliveryFee),
      isCustom: true,
    });
  }
  return lines;
};

/**
 * An invoice raised from an order is the same money, re-presented — so its
 * total is pinned to the order's grandTotal rather than derived again. Deriving
 * it drifted from the order in four ways: add-ons vanished from the line
 * amounts, the delivery fee picked up tax the order never charged, the order's
 * discount was dropped, and tax-inclusive stores were taxed a second time.
 */
export const invoiceTotalsFromOrder = (order, taxLabel = "Tax") => {
  const lines = invoiceLinesFromOrder(order).map((line) => ({
    ...line,
    amount: round2(line.unitPrice * line.quantity),
  }));

  const subtotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const discount = Math.min(round2(Number(order.discount) || 0), subtotal);
  const taxAmount = round2(Number(order.taxTotal) || 0);
  const total = round2(Number(order.grandTotal) || 0);

  // Tax-inclusive stores keep the tax inside the line prices, so the tax row is
  // informational and must not be added on top a second time. Detected from the
  // order's own arithmetic, which also covers orders stored before this flag.
  const inclusive = taxAmount > 0 && Math.abs(round2(subtotal - discount + taxAmount) - total) > 0.005;

  return {
    lines,
    subtotal,
    discount,
    tax: { rate: Number(order.taxRate) || 0, label: taxLabel, amount: taxAmount, inclusive },
    total,
  };
};

export const paymentStatusFor = (amountDue, amountPaid) => {
  if (amountPaid <= 0) return "pending";
  if (amountPaid >= amountDue - 0.001) return "paid";
  return "partial";
};


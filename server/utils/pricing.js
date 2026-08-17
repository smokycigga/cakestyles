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

export const paymentStatusFor = (amountDue, amountPaid) => {
  if (amountPaid <= 0) return "pending";
  if (amountPaid >= amountDue - 0.001) return "paid";
  return "partial";
};

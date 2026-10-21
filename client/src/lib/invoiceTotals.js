// Client-side mirror of server/utils/pricing.js computeInvoiceTotals.
// The server remains authoritative — this exists so the invoice editor can
// show a live preview while you type, and so the arithmetic is unit testable
// without booting React.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const computeTotals = ({ lines, taxRate = 0, discount = 0 }) => {
  const safeLines = Array.isArray(lines) ? lines : [];
  const computed = safeLines.map((line) => ({
    ...line,
    amount: round2(round2(Number(line.unitPrice) || 0) * (Number(line.quantity) || 0)),
  }));
  const subtotal = round2(computed.reduce((sum, line) => sum + line.amount, 0));
  // Clamped, so a discount typed larger than the subtotal previews as the
  // subtotal rather than producing a negative total the server would reject.
  const discountAmount = Math.min(round2(Number(discount) || 0), subtotal);
  const taxTotal = round2(((subtotal - discountAmount) * (Number(taxRate) || 0)) / 100);
  return {
    lines: computed,
    subtotal,
    discount: discountAmount,
    tax: taxTotal,
    total: round2(subtotal - discountAmount + taxTotal),
  };
};

/**
 * Client-side mirror of server/utils/pricing.js computeTotals — the *order*
 * engine, which unlike the invoice one carries a delivery fee and can hold the
 * tax inside the prices. Takes the subtotal the caller already has on screen.
 *
 * Exists so a screen that quotes a figure quotes the figure the order will
 * actually be stored with. Kept here, and checked against the server in
 * server/tests/pricing.test.js, rather than copied into each page.
 */
export const orderTotalsPreview = ({
  subtotal: rawSubtotal,
  deliveryFee = 0,
  discount = 0,
  taxRate = 0,
  taxInclusive = false,
}) => {
  const subtotal = round2(Number(rawSubtotal) || 0);
  const discountAmount = Math.min(round2(Number(discount) || 0), subtotal);
  const fee = round2(Number(deliveryFee) || 0);
  const rate = Number(taxRate) || 0;

  let taxTotal;
  let grandTotal;
  if (rate > 0 && taxInclusive) {
    grandTotal = round2(subtotal - discountAmount + fee);
    taxTotal = round2(grandTotal - grandTotal / (1 + rate / 100));
  } else {
    taxTotal = round2(((subtotal - discountAmount) * rate) / 100);
    grandTotal = round2(subtotal - discountAmount + fee + taxTotal);
  }

  return { subtotal, discount: discountAmount, deliveryFee: fee, taxRate: rate, taxTotal, grandTotal };
};

/** Lines the server will accept: a description and a numeric price. */
export const validLines = (lines) =>
  (Array.isArray(lines) ? lines : [])
    .filter((line) => line.description && String(line.description).trim() !== "")
    .filter((line) => line.unitPrice !== "" && line.unitPrice != null && !Number.isNaN(Number(line.unitPrice)))
    .map((line) => ({
      // The catalogue link and the custom flag have to survive an edit —
      // stripping them here made the "custom" badge and the product reference
      // disappear from every invoice the moment it was saved.
      ...(line.product ? { product: String(line.product._id || line.product) } : {}),
      description: line.description.trim(),
      quantity: Math.max(1, Number(line.quantity) || 1),
      unitPrice: round2(Number(line.unitPrice) || 0),
      isCustom: Boolean(line.isCustom),
    }));

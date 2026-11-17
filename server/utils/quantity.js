import { z } from "zod";

// A line quantity is not always a whole number. Customers ask for half a cake,
// 1.5 kg of a slab, or a third of a tray of brownies, and the order used to be
// rejected with "Invalid items.0.quantity: Expected integer, received float".
//
// Three decimals is finer than any bakery scale and keeps binary-float noise
// (0.1 + 0.2) out of the stored value and out of the money totals.
export const MAX_QUANTITY = 1000;

export const roundQuantity = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

/** Positive, finite, at most three decimals. Zero is not a line item. */
export const quantitySchema = z
  .number()
  .min(0.001, "Quantity must be more than zero")
  .max(MAX_QUANTITY, `Quantity cannot exceed ${MAX_QUANTITY}`)
  .transform(roundQuantity);

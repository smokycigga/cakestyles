import Counter from "../models/Counter.js";

const IST_YEAR = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date());

// Sequential business document numbers, e.g. CS-2026-0001 / INV-2026-0001.
export const nextOrderNumber = async () => {
  const year = IST_YEAR();
  const seq = await Counter.next(`order-${year}`);
  return `CS-${year}-${String(seq).padStart(4, "0")}`;
};

export const nextInvoiceNumber = async (prefix = "INV") => {
  const year = IST_YEAR();
  const seq = await Counter.next(`invoice-${prefix}-${year}`);
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
};

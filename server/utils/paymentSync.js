import Invoice from "../models/Invoice.js";
import { round2 } from "./pricing.js";

/**
 * An invoice's status derived from its money, never set independently of it.
 * A draft stays a draft until money arrives; a cancelled invoice is terminal
 * and no payment may revive it.
 */
export const invoiceStatusFor = (total, amountPaid, currentStatus = "issued") => {
  if (currentStatus === "cancelled") return "cancelled";
  // round2 yields NaN for a missing figure, and every comparison against NaN is
  // false — which fell through to "partially_paid" and made a malformed invoice
  // look part-settled. Treat unusable money as zero.
  const num = (n) => (Number.isFinite(round2(n)) ? round2(n) : 0);
  const paid = num(amountPaid);
  const due = num(total);
  if (paid <= 0.001) return currentStatus === "draft" ? "draft" : currentStatus === "overdue" ? "overdue" : "issued";
  if (paid >= due - 0.001) return "paid";
  return "partially_paid";
};

/**
 * A payment taken against an order has to appear on that order's invoice too.
 * invoiceController.mirrorPaymentToOrder covers the opposite direction; without
 * this one, money collected on the order left the invoice still showing a
 * balance due, so the customer was handed a PDF demanding what they had paid.
 *
 * Safe to call for any order: it is a no-op when nothing is linked.
 */
export const syncPaymentToInvoice = async (order, { amount, method, ref, note, date, user }) => {
  if (!order?.invoice) return null;
  const invoice = await Invoice.findById(order.invoice);
  if (!invoice) return null;
  // A cancelled invoice is a closed document — the money stays on the order.
  if (invoice.status === "cancelled") return null;

  invoice.payments.push({
    amount: round2(amount),
    method,
    ref: ref || "",
    note: note || `Via order ${order.orderNumber}`,
    // Orders date money with paidAt, invoices with date.
    date: date ? new Date(date) : new Date(),
    recordedBy: { userId: user?._id, name: user?.name },
  });
  invoice.amountPaid = round2(invoice.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  invoice.balanceDue = round2(invoice.total - invoice.amountPaid);
  invoice.status = invoiceStatusFor(invoice.total, invoice.amountPaid, invoice.status);
  await invoice.save();
  return invoice;
};

/**
 * A cancelled order must stop its invoice chasing the customer: the outstanding
 * report and the overdue flag both read open invoices, so a cancelled order's
 * invoice kept dunning for a cake nobody is baking.
 *
 * Only cancels an invoice that has taken no money. Once real money is on it,
 * cancelling silently would strand a refund decision no code should make —
 * that pair is returned instead so the caller can surface it.
 */
export const cancelInvoiceForCancelledOrder = async (order) => {
  if (!order?.invoice) return { cancelled: null, needsAttention: null };
  const invoice = await Invoice.findById(order.invoice);
  if (!invoice || invoice.status === "cancelled") return { cancelled: null, needsAttention: null };

  if (invoice.amountPaid > 0.001) return { cancelled: null, needsAttention: invoice.invoiceNumber };

  invoice.status = "cancelled";
  await invoice.save();
  return { cancelled: invoice.invoiceNumber, needsAttention: null };
};

import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import Razorpay from "razorpay";

import Order from "../models/Order.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "../utils/audit.js";
import { sumPayments, paymentStatusFor } from "../utils/pricing.js";
import { syncPaymentToInvoice } from "../utils/paymentSync.js";

const objectIdSchema = z.string().refine(
  (value) => /^[a-f\d]{24}$/i.test(value) && mongoose.isValidObjectId(value),
  "Must be a valid Mongo ObjectId"
);

const createSchema = z.object({
  orderId: objectIdSchema,
  checkoutToken: z.string().min(32),
});
const verifySchema = z.object({
  orderId: objectIdSchema,
  checkoutToken: z.string().min(32),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const hashCheckoutToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const timingSafeHexEqual = (left, right) => {
  if (!/^[a-f\d]+$/i.test(left || "") || !/^[a-f\d]+$/i.test(right || "")) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const isValidRazorpaySignature = ({ orderId, paymentId, signature, secret }) => {
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return timingSafeHexEqual(expected, signature);
};

export const getRazorpayConfig = (env = process.env) => {
  const keyId = String(env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || "").trim();
  const placeholder = /placeholder|change[_-]?me|your[_-]?(key|secret)/i;

  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) return null;
  if (keySecret.length < 16 || placeholder.test(keySecret)) return null;
  return { keyId, keySecret };
};

const razorpayClient = (config) => new Razorpay({
  key_id: config.keyId,
  key_secret: config.keySecret,
});

const tokenMatchesOrder = (order, checkoutToken) => {
  const suppliedDigest = hashCheckoutToken(checkoutToken);
  return timingSafeHexEqual(order.checkoutToken || "", suppliedDigest);
};

const validateGuestPaymentOrder = (order, checkoutToken) => {
  if (!tokenMatchesOrder(order, checkoutToken)) {
    return { status: 403, message: "Invalid checkout token" };
  }
  if (order.source !== "website" || order.payment?.method !== "razorpay") {
    return { status: 400, message: "Order is not eligible for online checkout" };
  }
  if (!["pending_payment", "confirmed"].includes(order.status)) {
    return { status: 400, message: "Order is not in a payable state" };
  }
  return null;
};

const razorpayOrderResponse = (order, keyId) => ({
  rpOrderId: order.payment.razorpayOrderId,
  amount: Math.round(order.grandTotal * 100),
  keyId,
  orderNumber: order.orderNumber,
  customer: order.customerSnapshot,
});

export const createRazorpayOrder = [validate(createSchema), async (req, res) => {
  const config = getRazorpayConfig();
  if (!config) {
    return res.status(503).json({ message: "Online payments are not configured yet" });
  }

  const order = await Order.findById(req.body.orderId).select("+checkoutToken");
  if (!order) return res.status(404).json({ message: "Order not found" });

  const invalidOrder = validateGuestPaymentOrder(order, req.body.checkoutToken);
  if (invalidOrder) return res.status(invalidOrder.status).json({ message: invalidOrder.message });

  // Reuse an already-created Razorpay order so retries never charge against a
  // second provider order.
  if (order.payment.razorpayOrderId) {
    return res.json(razorpayOrderResponse(order, config.keyId));
  }
  if (order.payment.status === "paid" || order.status !== "pending_payment") {
    return res.status(400).json({ message: "Order is already paid" });
  }

  const rpOrder = await razorpayClient(config).orders.create({
    amount: Math.round(order.grandTotal * 100),
    currency: "INR",
    receipt: order.orderNumber,
  });

  order.payment.razorpayOrderId = rpOrder.id;
  await order.save();

  res.json({
    ...razorpayOrderResponse(order, config.keyId),
    amount: rpOrder.amount,
  });
}];

export const verifyPayment = [validate(verifySchema), async (req, res) => {
  const config = getRazorpayConfig();
  if (!config) {
    return res.status(503).json({ message: "Online payments are not configured yet" });
  }

  const { orderId, checkoutToken, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const order = await Order.findById(orderId).select("+checkoutToken");
  if (!order) return res.status(404).json({ message: "Order not found" });

  const invalidOrder = validateGuestPaymentOrder(order, checkoutToken);
  if (invalidOrder) return res.status(invalidOrder.status).json({ message: invalidOrder.message });

  // A provider/browser retry after a successful verification is a successful
  // no-op, but a different payment ID cannot overwrite the recorded payment.
  if (order.payment.razorpayPaymentId) {
    if (order.payment.razorpayPaymentId === razorpay_payment_id && order.payment.status === "paid") {
      return res.json({ ok: true, orderNumber: order.orderNumber, status: order.status });
    }
    return res.status(409).json({ message: "A different payment is already recorded for this order" });
  }

  if (order.payment.razorpayOrderId !== razorpay_order_id) {
    return res.status(400).json({ message: "Payment does not belong to this order" });
  }

  const signatureIsValid = isValidRazorpaySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
    secret: config.keySecret,
  });
  if (!signatureIsValid) {
    return res.status(400).json({ message: "Payment signature verification failed" });
  }

  order.payment.razorpayPaymentId = razorpay_payment_id;
  if (!order.payment.payments.some((payment) => payment.ref === razorpay_payment_id)) {
    order.payment.payments.push({
      amount: order.grandTotal,
      method: "razorpay",
      ref: razorpay_payment_id,
      note: "Online payment via Razorpay",
      recordedBy: { name: "razorpay" },
    });
  }
  order.amountPaid = sumPayments(order.payment.payments);
  order.payment.status = paymentStatusFor(order.grandTotal, order.amountPaid);

  if (order.status === "pending_payment") {
    order.status = "confirmed";
    order.statusHistory.push({ status: "confirmed", note: "Payment verified" });
  }

  await order.save();

  // No-op unless the order was invoiced before it was paid online, in which
  // case the invoice must not keep showing the balance as outstanding.
  await syncPaymentToInvoice(order, {
    amount: order.grandTotal,
    method: "razorpay",
    ref: razorpay_payment_id,
    note: "Online payment via Razorpay",
  });

  await writeAudit({
    actorName: "razorpay",
    action: "order.payment.verified",
    entity: "Order",
    entityId: order._id,
    meta: `${order.orderNumber}: ₹${order.grandTotal} (ref ${razorpay_payment_id})`,
  });

  res.json({ ok: true, orderNumber: order.orderNumber, status: order.status });
}];


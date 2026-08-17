import crypto from "crypto";
import { z } from "zod";
import Razorpay from "razorpay";

import Order from "../models/Order.js";
import Setting from "../models/Setting.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "../utils/audit.js";
import { sumPayments, paymentStatusFor } from "../utils/pricing.js";

const createSchema = z.object({ orderId: z.string().min(1) });
const verifySchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const razorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.startsWith("rzp_test_placeholder")) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

export const createRazorpayOrder = [protect, requirePerm("orders:write"), validate(createSchema), async (req, res) => {
  const client = razorpayClient();
  if (!client) {
    return res.status(503).json({ message: "Online payments are not configured yet" });
  }

  const order = await Order.findById(req.body.orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.payment.status === "paid") {
    return res.status(400).json({ message: "Order is already paid" });
  }

  const rpOrder = await client.orders.create({
    amount: Math.round(order.grandTotal * 100),
    currency: "INR",
    receipt: order.orderNumber,
  });

  order.payment.razorpayOrderId = rpOrder.id;
  await order.save();

  res.json({
    rpOrderId: rpOrder.id,
    amount: rpOrder.amount,
    keyId: process.env.RAZORPAY_KEY_ID,
    orderNumber: order.orderNumber,
    customer: order.customerSnapshot,
  });
}];

export const verifyPayment = [validate(verifySchema), async (req, res) => {
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.payment.razorpayOrderId !== razorpay_order_id) {
    return res.status(400).json({ message: "Payment does not belong to this order" });
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected !== razorpay_signature) {
    order.payment.status = "failed";
    await order.save();
    return res.status(400).json({ message: "Payment signature verification failed" });
  }

  order.payment.razorpayPaymentId = razorpay_payment_id;
  order.payment.payments.push({
    amount: order.grandTotal,
    method: "razorpay",
    ref: razorpay_payment_id,
    note: "Online payment via Razorpay",
    recordedBy: { name: "razorpay" },
  });
  order.amountPaid = sumPayments(order.payment.payments);
  order.payment.status = paymentStatusFor(order.grandTotal, order.amountPaid);

  if (order.status === "pending_payment") {
    order.status = "confirmed";
    order.statusHistory.push({ status: "confirmed", note: "Payment verified" });
  }

  await order.save();

  await writeAudit({
    actorName: "razorpay",
    action: "order.payment.verified",
    entity: "Order",
    entityId: order._id,
    meta: `${order.orderNumber}: ₹${order.grandTotal} (ref ${razorpay_payment_id})`,
  });

  res.json({ ok: true, orderNumber: order.orderNumber, status: order.status });
}];

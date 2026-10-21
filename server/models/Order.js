import mongoose from "mongoose";
import {
  ORDER_SOURCES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
} from "../config/constants.js";

const actorSchema = {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
};

const paymentEntrySchema = {
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: PAYMENT_METHODS, required: true },
  ref: { type: String, default: "" },
  note: { type: String, default: "" },
  paidAt: { type: Date, default: Date.now },
  recordedBy: actorSchema,
};

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customerSnapshot: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: "" },
    },
    source: { type: String, enum: ORDER_SOURCES, required: true },
    fulfilment: {
      type: { type: String, enum: ["pickup", "delivery"], required: true },
      date: { type: String, required: true },
      slot: { type: String, default: "" },
      address: {
        line1: String,
        line2: String,
        city: String,
        pincode: String,
        notes: String,
        latitude: Number,
        longitude: Number,
        distanceKm: Number,
      },
    },
    // Line items snapshot name/price at order time (PRD §22.1).
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: { type: String, required: true },
        variantName: { type: String, default: "" },
        unitPrice: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        addOns: [{ name: String, price: Number }],
        lineTotal: { type: Number, required: true, min: 0 },
        isCustom: { type: Boolean, default: false },
        isB2b: { type: Boolean, default: false },
        notes: { type: String, default: "" },
      },
    ],
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    specialInstructions: { type: String, default: "" },
    // Stores a SHA-256 digest; the raw guest checkout token is returned only once.
    checkoutToken: { type: String, default: "", select: false },
    payment: {
      status: { type: String, enum: PAYMENT_STATUS, default: "pending" },
      method: { type: String, enum: PAYMENT_METHODS, default: null },
      razorpayOrderId: { type: String, default: "" },
      razorpayPaymentId: { type: String, default: "" },
      payments: [paymentEntrySchema],
    },
    status: { type: String, enum: ORDER_STATUSES, default: "pending_payment" },
    statusHistory: [
      {
        status: String,
        at: { type: Date, default: Date.now },
        by: actorSchema,
        note: { type: String, default: "" },
      },
    ],
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: "Enquiry" },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    createdBy: actorSchema,
    loyaltyAwarded: { type: Boolean, default: false },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ source: 1 });

export default mongoose.model("Order", orderSchema);

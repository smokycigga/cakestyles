import mongoose from "mongoose";
import { INVOICE_STATUSES, PAYMENT_METHODS } from "../config/constants.js";

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customerSnapshot: {
      name: { type: String, required: true },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
    },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    // Lines snapshot description/price; totals are reproducible from these (PRD §22.7).
    lines: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        description: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        amount: { type: Number, required: true },
        isCustom: { type: Boolean, default: false },
      },
    ],
    subtotal: { type: Number, required: true },
    tax: {
      rate: { type: Number, default: 0 },
      label: { type: String, default: "Tax" },
      amount: { type: Number, default: 0 },
      // True when the tax is already inside the line prices, so the tax row is
      // shown for information and is not added on top of the subtotal.
      inclusive: { type: Boolean, default: false },
    },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, required: true },
    dueDate: { type: String, default: "" },
    status: { type: String, enum: INVOICE_STATUSES, default: "draft" },
    payments: [
      {
        amount: { type: Number, required: true },
        method: { type: String, enum: PAYMENT_METHODS },
        ref: { type: String, default: "" },
        // Provenance for mirrored money, e.g. "Via order CS-2026-0002". Kept
        // separate from ref, which holds the staff-entered UPI/cheque number.
        note: { type: String, default: "" },
        date: { type: Date, default: Date.now },
        recordedBy: { userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, name: String },
      },
    ],
    notes: { type: String, default: "" },
    createdBy: { userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, name: String },
  },
  { timestamps: true }
);

invoiceSchema.index({ createdAt: -1 });
invoiceSchema.index({ status: 1 });

export default mongoose.model("Invoice", invoiceSchema);


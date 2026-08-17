import mongoose from "mongoose";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../config/constants.js";

const expenseSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    vendor: { type: String, default: "" },
    paymentMethod: { type: String, enum: [...PAYMENT_METHODS, ""], default: "" },
    attachment: { type: String, default: "" },
    recurring: {
      isRecurring: { type: Boolean, default: false },
      frequency: { type: String, enum: ["weekly", "monthly", "yearly", ""], default: "" },
    },
    notes: { type: String, default: "" },
    createdBy: { userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, name: String },
  },
  { timestamps: true }
);

expenseSchema.index({ date: -1 });

export default mongoose.model("Expense", expenseSchema);

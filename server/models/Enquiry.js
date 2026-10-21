import mongoose from "mongoose";
import { ENQUIRY_STATUSES, ORDER_SOURCES } from "../config/constants.js";

const enquirySchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customerSnapshot: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: "" },
    },
    source: { type: String, enum: ORDER_SOURCES, default: "website" },
    eventDate: { type: String, required: true },
    guestCount: { type: Number, default: null },
    size: { type: String, default: "" },
    flavours: { type: String, default: "" },
    designNotes: { type: String, default: "" },
    budgetRange: { type: String, default: "" },
    referenceImages: [String],
    fulfilmentPref: {
      type: { type: String, enum: ["pickup", "delivery", ""], default: "" },
      address: String,
    },
    status: { type: String, enum: ENQUIRY_STATUSES, default: "new" },
    quotedAmount: { type: Number, default: null },
    notes: [
      {
        text: String,
        by: { userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, name: String },
        at: { type: Date, default: Date.now },
      },
    ],
    convertedOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    createdBy: { userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, name: String },
  },
  { timestamps: true }
);

export default mongoose.model("Enquiry", enquirySchema);


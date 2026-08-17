import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true, default: "" },
    importantDates: [{ label: String, date: String }],
    addresses: [
      {
        label: String,
        line1: String,
        line2: String,
        city: String,
        pincode: String,
        notes: String,
      },
    ],
    tags: [String],
    leadSource: { type: String, default: "" },
    marketingConsent: { type: Boolean, default: false },
    notes: [
      {
        text: String,
        by: { userId: mongoose.Schema.Types.ObjectId, name: String },
        at: { type: Date, default: Date.now },
      },
    ],
    active: { type: Boolean, default: true },
    pointsBalance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0, min: 0 },
    totalRedeemed: { type: Number, default: 0, min: 0 },
    tier: { type: String, default: "bronze", trim: true, lowercase: true },
  },
  { timestamps: true }
);

// One profile per phone number.
customerSchema.index({ phone: 1 }, { unique: true });

export default mongoose.model("Customer", customerSchema);

import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "store", unique: true },
    store: {
      name: { type: String, default: "Cakestyles" },
      tagline: { type: String, default: "Handcrafted cakes & bakes, made for your celebrations" },
      description: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      whatsapp: { type: String, default: "" },
      instagram: { type: String, default: "" },
      address: { line1: String, city: String, pincode: String },
      hours: [{ days: String, open: String, close: String }],
    },
    currency: { type: String, default: "INR" },
    timezone: { type: String, default: "Asia/Kolkata" },
    tax: {
      enabled: { type: Boolean, default: false },
      rate: { type: Number, default: 0 },
      label: { type: String, default: "Tax" },
      inclusive: { type: Boolean, default: false },
    },
    delivery: {
      enabled: { type: Boolean, default: true },
      fee: { type: Number, default: 0 },
      freeOver: { type: Number, default: 0 },
      pincodes: [String],
      notes: { type: String, default: "" },
    },
    pickup: {
      slots: { type: [String], default: ["10:00 - 13:00", "17:00 - 20:00"] },
      cutoffHours: { type: Number, default: 12 },
    },
    paymentMethods: {
      online: {
        enabled: { type: Boolean, default: false },
        provider: { type: String, default: "razorpay" },
      },
      offline: { type: [String], default: ["upi", "cash"] },
    },
    invoice: {
      prefix: { type: String, default: "INV" },
    },
  },
  { timestamps: true }
);

settingSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: "store" });
  if (!settings) {
    settings = await this.create({ key: "store" });
  }
  return settings;
};

export default mongoose.model("Setting", settingSchema);

import mongoose from "mongoose";

export const CAMPAIGN_CHANNELS = ["manual", "export"];
export const CAMPAIGN_STATUSES = ["draft", "ready", "in_progress", "completed", "archived"];
export const RECIPIENT_STATUSES = ["pending", "contacted", "converted", "skipped"];

const recipientSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    email: { type: String, lowercase: true, trim: true, default: "" },
    status: { type: String, enum: RECIPIENT_STATUSES, default: "pending" },
    notes: { type: String, default: "" },
    contactedAt: { type: Date, default: null },
  },
  { _id: true }
);

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    content: { type: String, default: "" },
    channel: { type: String, enum: CAMPAIGN_CHANNELS, default: "manual" },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: "draft" },
    audience: {
      tags: { type: [String], default: [] },
      leadSources: { type: [String], default: [] },
      marketingConsentOnly: { type: Boolean, default: false },
      segment: { type: String, default: "" },
      customerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Customer" }],
    },
    recipients: { type: [recipientSchema], default: [] },
    createdBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      name: { type: String, required: true },
    },
  },
  { timestamps: true }
);

campaignSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model("Campaign", campaignSchema);

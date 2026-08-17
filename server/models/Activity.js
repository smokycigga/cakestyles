import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    type: {
      type: String,
      enum: ["call", "meeting", "visit", "note", "status", "campaign", "reward"],
      required: true,
    },
    summary: { type: String, required: true, trim: true },
    details: { type: String, default: "", trim: true },
    outcome: { type: String, default: "", trim: true },
    occurredAt: { type: Date, default: Date.now },
    nextFollowUpAt: { type: Date, default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

activitySchema.index({ customer: 1, occurredAt: -1 });
activitySchema.index({ nextFollowUpAt: 1 });

export default mongoose.model("Activity", activitySchema);

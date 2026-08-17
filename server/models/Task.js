import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: ["follow_up", "call", "meeting", "order", "customer", "general"],
      default: "general",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "cancelled"],
      default: "pending",
    },
    dueAt: { type: Date, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: "Enquiry", default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ status: 1, dueAt: 1 });
taskSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
taskSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model("Task", taskSchema);

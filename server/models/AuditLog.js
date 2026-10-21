import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: { type: String, default: "system" },
    },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.Mixed },
    changes: [{ field: String, old: mongoose.Schema.Types.Mixed, new: mongoose.Schema.Types.Mixed }],
    meta: { type: String, default: "" },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

export default mongoose.model("AuditLog", auditLogSchema);


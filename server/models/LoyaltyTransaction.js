import mongoose from "mongoose";

const actorSchema = {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: { type: String, default: "" },
};

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    type: { type: String, enum: ["earn", "redeem", "adjust"], required: true },
    points: {
      type: Number,
      required: true,
      validate: {
        validator: (value) => Number.isInteger(value) && value !== 0,
        message: "Points must be a non-zero integer",
      },
    },
    balanceAfter: { type: Number, required: true, min: 0 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    note: { type: String, trim: true, default: "" },
    actor: actorSchema,
  },
  { timestamps: true }
);

loyaltyTransactionSchema.index({ customer: 1, createdAt: -1 });
loyaltyTransactionSchema.index(
  { order: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { order: { $type: "objectId" }, type: "earn" },
  }
);

export default mongoose.model("LoyaltyTransaction", loyaltyTransactionSchema);

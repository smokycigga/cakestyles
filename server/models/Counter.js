import mongoose from "mongoose";

// Atomic sequences for order and invoice numbers (PRD §13.1: configurable
// prefix + numbering sequence that never collides).
const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function (key) {
  const counter = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return counter.seq;
};

export default mongoose.model("Counter", counterSchema);

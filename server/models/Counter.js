import mongoose from "mongoose";

// Atomic sequences for order and invoice numbers (PRD §13.1: configurable
// prefix + numbering sequence that never collides).
const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function (key) {
  // $inc under upsert is atomic, so concurrent orders cannot share a number.
  // The one race left is the very first use of a key — two upserts inserting at
  // once, where Mongo rejects the loser with a duplicate key. That is once per
  // key per year, and it would have failed a checkout, so retry into the now
  // existing document.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const counter = await this.findOneAndUpdate(
        { key },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" }
      );
      return counter.seq;
    } catch (err) {
      if (err?.code !== 11000 || attempt === 2) throw err;
    }
  }
};

export default mongoose.model("Counter", counterSchema);


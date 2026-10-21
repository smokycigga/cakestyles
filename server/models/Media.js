import mongoose from "mongoose";

// Images live in the database (base64) so the platform runs anywhere —
// including serverless hosts with ephemeral filesystems.
const mediaSchema = new mongoose.Schema(
  {
    mimeType: { type: String, required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
    alt: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Media", mediaSchema);


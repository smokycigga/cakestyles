import mongoose from "mongoose";

// Images live in the database (base64) so the platform runs anywhere —
// including serverless hosts with ephemeral filesystems.
//
// When Cloudinary is configured the bytes go there instead and only the
// `publicId` is kept here. That is the fast path: Cloudinary serves from its
// own CDN, resizes on the fly, and negotiates WebP/AVIF per browser, so this
// API is never in the hot path for a product photo. The `data` buffer is then
// absent, which is why it is no longer required.
const mediaSchema = new mongoose.Schema(
  {
    mimeType: { type: String, required: true },
    data: {
      type: Buffer,
      required() {
        return !this.publicId;
      },
    },
    size: { type: Number, required: true },
    alt: { type: String, default: "" },

    // Set for Cloudinary-backed images. Absent means "stored in Mongo".
    provider: { type: String, enum: ["mongo", "cloudinary"], default: "mongo" },
    publicId: { type: String, index: true },
    width: { type: Number },
    height: { type: Number },
    format: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Media", mediaSchema);

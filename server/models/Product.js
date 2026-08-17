import mongoose from "mongoose";
import {
  PRODUCT_AVAILABILITY,
  PRODUCT_ORDERABILITY,
  PRODUCT_STATUS,
} from "../config/constants.js";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    sku: { type: String, trim: true, default: "" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    shortDescription: { type: String, default: "" },
    description: { type: String, required: true },
    images: [String],
    basePrice: { type: Number, required: true, min: 0 },
    variants: [{ name: String, price: Number }],
    addOns: [{ name: String, price: Number }],
    availability: { type: String, enum: PRODUCT_AVAILABILITY, default: "active" },
    orderability: { type: String, enum: PRODUCT_ORDERABILITY, default: "online" },
    featured: { type: Boolean, default: false },
    tags: [String],
    prepTimeHours: { type: Number, default: 24 },
    taxRate: { type: Number, default: null },
    costPrice: { type: Number, default: null },
    internalNotes: { type: String, default: "" },
    status: { type: String, enum: PRODUCT_STATUS, default: "draft" },
    publishAt: { type: Date, default: null },
    seo: { title: String, description: String },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", shortDescription: "text", tags: "text" });

export default mongoose.model("Product", productSchema);

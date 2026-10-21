// Read-only inspection of category visibility and product counts.
import "dotenv/config";
import mongoose from "mongoose";

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("No MONGO_URI found");
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

const Category = mongoose.model("Category", new mongoose.Schema({}, { strict: false, collection: "categories" }));
const Product = mongoose.model("Product", new mongoose.Schema({}, { strict: false, collection: "products" }));

const cats = await Category.find().sort({ order: 1, name: 1 }).lean();
for (const c of cats) {
  const n = await Product.countDocuments({ category: c._id });
  const state = c.active ? "ACTIVE  " : "INACTIVE";
  console.log(state + " order=" + String(c.order).padStart(2) + " products=" + String(n).padStart(2) + "  " + c.slug + "  (" + c.name + ")");
}

const total = await Product.countDocuments();
const published = await Product.countDocuments({ status: "published" });
console.log("products total=" + total + " published=" + published);

await mongoose.disconnect();

// Move every image currently stored as a buffer in MongoDB over to Cloudinary,
// then rewrite the references that point at /api/media/:id so the browser goes
// straight to the CDN instead of bouncing through a redirect.
//
//   node scripts/migrate-media-to-cloudinary.mjs            # dry run, reports only
//   node scripts/migrate-media-to-cloudinary.mjs --write    # actually migrate
//   node scripts/migrate-media-to-cloudinary.mjs --write --keep-buffers
//                                                           # leave `data` in place
//
// Safe to re-run: anything already carrying a publicId is skipped.
import "dotenv/config";
import mongoose from "mongoose";
import Media from "../server/models/Media.js";
import Product from "../server/models/Product.js";
import Expense from "../server/models/Expense.js";
import { isConfigured, uploadImage, deliveryUrl } from "../server/utils/cloudinary.js";

const WRITE = process.argv.includes("--write");
const KEEP_BUFFERS = process.argv.includes("--keep-buffers");

const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(0)} KB`);

const run = async () => {
  if (!isConfigured()) {
    console.error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
    );
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }

  console.log(WRITE ? "Mode: WRITE\n" : "Mode: DRY RUN (pass --write to apply)\n");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const pending = await Media.find({ publicId: { $exists: false }, data: { $exists: true } }).sort({ createdAt: 1 });
  const already = await Media.countDocuments({ publicId: { $exists: true } });

  console.log(`Media documents: ${await Media.countDocuments()} total, ${already} already on Cloudinary, ${pending.length} to migrate\n`);

  if (!pending.length) {
    console.log("Nothing to do.");
  }

  const idToUrl = new Map();
  let moved = 0;
  let bytesFreed = 0;
  const failures = [];

  for (const [index, doc] of pending.entries()) {
    const label = `[${index + 1}/${pending.length}] ${doc._id}`;
    try {
      const uploaded = await uploadImage(doc.data, doc.mimeType, { publicId: `media-${doc._id}` });
      const url = deliveryUrl(uploaded.publicId);
      idToUrl.set(String(doc._id), url);

      console.log(`${label}  ${formatBytes(doc.size)} -> ${uploaded.publicId} (${uploaded.format}, ${uploaded.width}x${uploaded.height})`);

      if (WRITE) {
        const update = {
          $set: {
            provider: "cloudinary",
            publicId: uploaded.publicId,
            width: uploaded.width,
            height: uploaded.height,
            format: uploaded.format,
            size: uploaded.bytes ?? doc.size,
          },
        };
        if (!KEEP_BUFFERS) update.$unset = { data: 1 };
        await Media.updateOne({ _id: doc._id }, update);
      }

      moved += 1;
      if (!KEEP_BUFFERS) bytesFreed += doc.size;
    } catch (err) {
      failures.push({ id: String(doc._id), error: err.message });
      console.error(`${label}  FAILED: ${err.message}`);
    }
  }

  // Rewrite /api/media/:id references. Products are the hot path — every one of
  // these used to be a function invocation plus a database read on first paint.
  let productsChanged = 0;
  let expensesChanged = 0;

  const rewrite = (value) => {
    if (typeof value !== "string") return value;
    const match = value.match(/\/api\/media\/([a-f0-9]{24})/i);
    if (!match) return value;
    return idToUrl.get(match[1]) || value;
  };

  const products = await Product.find({ images: /\/api\/media\// });
  for (const product of products) {
    const next = product.images.map(rewrite);
    const changed = next.some((url, i) => url !== product.images[i]);
    if (!changed) continue;
    productsChanged += 1;
    if (WRITE) {
      product.images = next;
      await product.save();
    }
  }

  const expenses = await Expense.find({ attachment: /\/api\/media\// });
  for (const expense of expenses) {
    const next = rewrite(expense.attachment);
    if (next === expense.attachment) continue;
    expensesChanged += 1;
    if (WRITE) {
      expense.attachment = next;
      await expense.save();
    }
  }

  console.log("\n--- Summary ---");
  console.log(`${WRITE ? "Migrated" : "Would migrate"}: ${moved} image(s)`);
  console.log(`${WRITE ? "Removed from Mongo" : "Would remove from Mongo"}: ${formatBytes(bytesFreed)}`);
  console.log(`${WRITE ? "Rewritten" : "Would rewrite"}: ${productsChanged} product image list(s), ${expensesChanged} expense attachment(s)`);
  if (failures.length) {
    console.log(`Failed: ${failures.length}`);
    failures.forEach((f) => console.log(`  ${f.id}: ${f.error}`));
  }
  if (!WRITE && moved) console.log("\nRe-run with --write to apply.");

  await mongoose.disconnect();
  process.exit(failures.length ? 1 : 0);
};

run().catch(async (err) => {
  console.error("Migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

import Media from "../models/Media.js";
import Product from "../models/Product.js";
import Expense from "../models/Expense.js";
import { isConfigured, uploadImage, deliveryUrl } from "../utils/cloudinary.js";

// One-off maintenance endpoints.
//
// These exist so a data migration can run inside the deployment, where the
// production database credentials already live, instead of having to copy a
// connection string around. They are owner-only, require an explicit confirm
// token in the body, and are safe to call repeatedly.

const CONFIRM = "migrate-media";

// Rewrite any `/api/media/:id` reference to the Cloudinary URL, for media rows
// that have already been migrated. Cheap: it only looks at documents that still
// contain the old path.
const rewriteReferences = async () => {
  const migrated = await Media.find({ publicId: { $exists: true } }).select("_id publicId").lean();
  if (!migrated.length) return { products: 0, expenses: 0 };

  const byId = new Map(migrated.map((m) => [String(m._id), deliveryUrl(m.publicId)]));
  const resolve = (value) => {
    if (typeof value !== "string") return value;
    const match = value.match(/\/api\/media\/([a-f0-9]{24})/i);
    return match ? byId.get(match[1]) || value : value;
  };

  let products = 0;
  for (const product of await Product.find({ images: /\/api\/media\// })) {
    const next = product.images.map(resolve);
    if (next.some((url, i) => url !== product.images[i])) {
      product.images = next;
      await product.save();
      products += 1;
    }
  }

  let expenses = 0;
  for (const expense of await Expense.find({ attachment: /\/api\/media\// })) {
    const next = resolve(expense.attachment);
    if (next !== expense.attachment) {
      expense.attachment = next;
      await expense.save();
      expenses += 1;
    }
  }

  return { products, expenses };
};

export const migrateMedia = async (req, res) => {
  if (req.body?.confirm !== CONFIRM) {
    return res.status(400).json({ message: `Send {"confirm":"${CONFIRM}"} to run this migration` });
  }
  if (!isConfigured()) {
    return res.status(503).json({ message: "Cloudinary is not configured on this deployment" });
  }

  // Vercel caps a function at 15s here, so take a small slice per call and let
  // the caller repeat until `remaining` reaches zero.
  const limit = Math.min(Math.max(Number(req.body?.limit) || 4, 1), 10);

  const pending = await Media.find({ publicId: { $exists: false }, data: { $exists: true } })
    .sort({ createdAt: 1 })
    .limit(limit);

  const migrated = [];
  const failed = [];

  for (const doc of pending) {
    try {
      const uploaded = await uploadImage(doc.data, doc.mimeType, { publicId: `media-${doc._id}` });
      await Media.updateOne(
        { _id: doc._id },
        {
          $set: {
            provider: "cloudinary",
            publicId: uploaded.publicId,
            width: uploaded.width,
            height: uploaded.height,
            format: uploaded.format,
            size: uploaded.bytes ?? doc.size,
          },
          $unset: { data: 1 },
        }
      );
      migrated.push({ id: String(doc._id), publicId: uploaded.publicId, bytes: uploaded.bytes });
    } catch (err) {
      failed.push({ id: String(doc._id), error: err.message });
    }
  }

  const refs = await rewriteReferences();
  const remaining = await Media.countDocuments({ publicId: { $exists: false }, data: { $exists: true } });

  res.json({
    migrated: migrated.length,
    failed,
    remaining,
    referencesRewritten: refs,
    done: remaining === 0,
  });
};

export const mediaMigrationStatus = async (_req, res) => {
  res.json({
    cloudinaryConfigured: isConfigured(),
    total: await Media.countDocuments(),
    onCloudinary: await Media.countDocuments({ publicId: { $exists: true } }),
    stillInDatabase: await Media.countDocuments({ publicId: { $exists: false }, data: { $exists: true } }),
    productsStillReferencingApiMedia: await Product.countDocuments({ images: /\/api\/media\// }),
  });
};

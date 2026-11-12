import { z } from "zod";
import Media from "../models/Media.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { isConfigured, uploadImage, deliveryUrl } from "../utils/cloudinary.js";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB after client-side compression
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

const uploadSchema = z.object({
  dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/, "Must be a base64 PNG/JPEG/WebP image"),
  alt: z.string().max(200).optional(),
});

export const upload = [protect, requirePerm("catalog:write"), validate(uploadSchema), async (req, res) => {
  const [meta, base64] = req.body.dataUrl.split(",");
  const mimeType = meta.slice(5, meta.indexOf(";"));
  const data = Buffer.from(base64, "base64");

  if (!ALLOWED.includes(mimeType)) {
    return res.status(400).json({ message: "Only PNG, JPEG and WebP images are allowed" });
  }
  if (data.length > MAX_BYTES) {
    return res.status(413).json({ message: "Image too large after compression (max 2MB)" });
  }

  // Preferred path: hand the bytes to Cloudinary and keep only the reference.
  // If it is not configured — or the upload fails for any reason — fall through
  // to storing the buffer, so a photo upload can never be blocked by a
  // third-party outage.
  if (isConfigured()) {
    try {
      const uploaded = await uploadImage(data, mimeType);

      const media = await Media.create({
        mimeType,
        provider: "cloudinary",
        publicId: uploaded.publicId,
        width: uploaded.width,
        height: uploaded.height,
        format: uploaded.format,
        size: uploaded.bytes ?? data.length,
        alt: req.body.alt || "",
      });

      // Hand back the delivery URL directly. The admin form stores whatever
      // string it gets, so product images now point straight at the CDN and
      // never touch this API again.
      return res.status(201).json({
        id: media._id,
        url: deliveryUrl(uploaded.publicId),
        provider: "cloudinary",
      });
    } catch (err) {
      console.error("Cloudinary upload failed, falling back to database storage:", err.message);
    }
  }

  const media = await Media.create({ mimeType, data, size: data.length, alt: req.body.alt || "" });

  res.status(201).json({ id: media._id, url: `/api/media/${media._id}` });
}];

export const serve = async (req, res) => {
  const media = await Media.findById(req.params.id);
  if (!media) return res.status(404).json({ message: "Image not found" });

  // Legacy rows that have since been migrated to Cloudinary still get requested
  // through their old /api/media/:id URL (that is what older product documents
  // store), so point the browser at the CDN instead of streaming bytes.
  const remote = media.publicId ? deliveryUrl(media.publicId) : null;
  if (remote) {
    // 301 is safe here: the target is immutable for a given media id.
    return res.redirect(301, remote);
  }

  if (!media.data) return res.status(404).json({ message: "Image not found" });

  res.setHeader("Content-Type", media.mimeType);
  // `max-age` alone only caches in the visitor's browser, so the first view of
  // the menu still paid for a function invocation and a database read per
  // product photo. `s-maxage` lets Vercel hold the bytes at the edge instead.
  // The id is content-addressed — an upload always creates a new document — so
  // a year is safe.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable, s-maxage=31536000");
  res.setHeader("CDN-Cache-Control", "public, s-maxage=31536000");
  res.setHeader("Vercel-CDN-Cache-Control", "public, s-maxage=31536000");
  res.send(media.data);
};

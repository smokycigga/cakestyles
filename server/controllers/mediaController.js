import { z } from "zod";
import Media from "../models/Media.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

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

  const media = await Media.create({ mimeType, data, size: data.length, alt: req.body.alt || "" });

  res.status(201).json({ id: media._id, url: `/api/media/${media._id}` });
}];

export const serve = async (req, res) => {
  const media = await Media.findById(req.params.id);
  if (!media) return res.status(404).json({ message: "Image not found" });

  res.setHeader("Content-Type", media.mimeType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(media.data);
};


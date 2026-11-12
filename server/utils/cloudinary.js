import crypto from "crypto";

// Cloudinary delivery for the product photography.
//
// Uploads used to be stored as raw buffers inside MongoDB and served back
// through this API, which meant every photo cost a database read plus a
// function invocation and arrived at whatever size it was uploaded at. Moving
// the bytes to Cloudinary puts them on a CDN and lets the browser ask for the
// exact width and format it needs.
//
// The whole module is optional: with no credentials configured `isConfigured()`
// returns false and the controller falls back to the original database storage,
// so a missing environment variable can never break image uploads.

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || "";
const KEY = process.env.CLOUDINARY_API_KEY || "";
const SECRET = process.env.CLOUDINARY_API_SECRET || "";

const UPLOAD_FOLDER = process.env.CLOUDINARY_FOLDER || "cakestyles/products";

export const isConfigured = () => Boolean(CLOUD && KEY && SECRET);

// Cloudinary signs the alphabetically sorted parameters, api_key and file
// excluded, with the API secret appended.
const sign = (params) =>
  crypto
    .createHash("sha1")
    .update(
      Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join("&") + SECRET
    )
    .digest("hex");

/**
 * Push an image buffer to Cloudinary and return what we need to store.
 * Throws with Cloudinary's own message so the admin sees a real reason.
 */
export const uploadImage = async (buffer, mimeType, { folder = UPLOAD_FOLDER, publicId } = {}) => {
  if (!isConfigured()) throw new Error("Cloudinary is not configured");

  const timestamp = Math.round(Date.now() / 1000);
  const signed = { folder, timestamp };
  if (publicId) signed.public_id = publicId;

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), "upload");
  form.append("api_key", KEY);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  if (publicId) form.append("public_id", publicId);
  form.append("signature", sign(signed));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Cloudinary upload failed (${response.status})`);
  }

  return {
    publicId: payload.public_id,
    url: payload.secure_url,
    width: payload.width,
    height: payload.height,
    bytes: payload.bytes,
    format: payload.format,
  };
};

/**
 * A delivery URL for a stored public id, sized for where it will be shown.
 * `c_limit` keeps the aspect ratio and never upscales past the original.
 */
export const deliveryUrl = (publicId, { width } = {}) => {
  if (!publicId) return null;
  if (!CLOUD) return null;

  const transforms = ["f_auto", "q_auto", "c_limit"];
  if (width) transforms.push(`w_${Math.round(width)}`);

  return `https://res.cloudinary.com/${CLOUD}/image/upload/${transforms.join(",")}/${publicId}`;
};

export const cloudName = () => CLOUD;

export default { isConfigured, uploadImage, deliveryUrl, cloudName };

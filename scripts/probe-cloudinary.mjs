// One-off credential probe: distinguishes "no such cloud" from "bad key" from "bad signature".
// Usage: node scripts/probe-cloudinary.mjs [cloudName...]
import crypto from "node:crypto";

// Credentials come from the environment only — never hardcode them here.
const KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;
if (!KEY || !SECRET) {
  console.error("Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET before running this probe.");
  process.exit(1);
}

const sign = (params, secret) =>
  crypto
    .createHash("sha1")
    .update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&") + secret)
    .digest("hex");

const probe = async (cloud) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp };
  const signature = sign(params, SECRET);

  const form = new FormData();
  form.set("api_key", KEY);
  form.set("timestamp", String(timestamp));
  form.set("signature", signature);
  form.set("file", new Blob(["not-an-image"], { type: "text/plain" }), "probe.txt");

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
      method: "POST",
      body: form,
    });
    const body = await res.text();
    return `${res.status} ${body.slice(0, 200)}`;
  } catch (err) {
    return `ERR ${err.message}`;
  }
};

const candidates = process.argv.slice(2);
for (const cloud of candidates) {
  const result = await probe(cloud);
  const verdict = result.includes("Invalid cloud_name")
    ? "NO SUCH CLOUD"
    : result.includes("Invalid Signature") || result.includes("signature")
      ? "CLOUD EXISTS but signature mismatch"
      : result.includes("Unknown API key") || result.includes("api_key")
        ? "CLOUD EXISTS but wrong key"
        : result.includes("Invalid image file") || result.includes("Unsupported")
          ? "*** CREDENTIALS VALID ***"
          : "other";
  console.log(`${cloud.padEnd(24)} ${verdict}\n    ${result}\n`);
}

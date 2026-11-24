import Setting from "../models/Setting.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { writeAudit } from "../utils/audit.js";
import { alertRecipients, channelStatus, sendTestAlert } from "../utils/notify.js";

// Public subset — powers checkout rules, store info and the menu header.
export const publicSettings = async (req, res) => {
  const s = await Setting.getSettings();
  res.json({
    store: s.store,
    currency: s.currency,
    timezone: s.timezone,
    tax: s.tax,
    delivery: s.delivery,
    pickup: s.pickup,
    paymentMethods: s.paymentMethods,
  });
};

const EDITABLE_FIELDS = ["store", "tax", "delivery", "pickup", "paymentMethods", "invoice", "loyalty", "alerts"];

export const getSettings = [protect, requirePerm("settings:read"), async (req, res) => {
  const s = await Setting.getSettings();
  res.json({ settings: s });
}];

// What the Settings screen needs to explain itself: which channels are live,
// who would receive an order email, and what is still missing for the rest.
export const alertSettings = [protect, requirePerm("settings:read"), async (req, res) => {
  res.json({
    channels: channelStatus(),
    recipients: await alertRecipients(),
  });
}];

// Sends a real alert through every configured channel. Owner-only because it
// can put a message on someone's phone.
export const testAlert = [protect, requirePerm("settings:write"), async (req, res) => {
  const results = await sendTestAlert();
  const delivered = results.filter((result) => result.ok);
  res.json({
    results,
    delivered: delivered.map((result) => result.channel),
    ok: delivered.length > 0,
  });
}];

// Settings are written straight onto the document, and the schema has no range
// validators on the numbers — so a typo was accepted silently. Entering -18 for
// the tax rate made every order total come out below its subtotal (a ₹400 order
// billed ₹200), and nothing anywhere complained. These are the fields that move
// money; anything outside the range is rejected with a message the person who
// typed it can act on.
const NUMBER_RULES = [
  ["tax.rate", 0, 100, "Tax rate must be between 0 and 100%"],
  ["delivery.fee", 0, 100000, "Delivery fee cannot be negative"],
  ["delivery.freeOver", 0, 1000000, "Free-delivery threshold cannot be negative"],
  ["pickup.cutoffHours", 0, 720, "Pickup notice must be between 0 and 720 hours"],
  ["loyalty.earnPerRupee", 0, 1000, "Points per rupee must be between 0 and 1000"],
  ["loyalty.redemptionValue", 0, 100000, "Point value cannot be negative"],
  ["loyalty.minRedeem", 0, 10000000, "Minimum redemption cannot be negative"],
];

const at = (body, path) =>
  path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), body);

const validateSettings = (body) => {
  for (const [path, min, max, message] of NUMBER_RULES) {
    const value = at(body, path);
    if (value == null) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${message} — enter a number`;
    }
    if (value < min || value > max) return message;
  }
  return null;
};

export const updateSettings = [protect, requirePerm("settings:write"), async (req, res) => {
  const problem = validateSettings(req.body);
  if (problem) return res.status(400).json({ message: problem });

  const s = await Setting.getSettings();
  const before = s.toObject();

  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] != null) {
      s[field] = req.body[field];
    }
  }
  await s.save();

  await writeAudit({
    req,
    action: "settings.update",
    entity: "Setting",
    entityId: s._id,
    before,
    after: s.toObject(),
    fields: EDITABLE_FIELDS,
  });

  res.json({ settings: s });
}];


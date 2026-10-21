import Setting from "../models/Setting.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { writeAudit } from "../utils/audit.js";

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

const EDITABLE_FIELDS = ["store", "tax", "delivery", "pickup", "paymentMethods", "invoice", "loyalty"];

export const getSettings = [protect, requirePerm("settings:read"), async (req, res) => {
  const s = await Setting.getSettings();
  res.json({ settings: s });
}];

export const updateSettings = [protect, requirePerm("settings:write"), async (req, res) => {
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


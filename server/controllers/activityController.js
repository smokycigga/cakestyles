import { z } from "zod";

import Activity from "../models/Activity.js";
import Customer from "../models/Customer.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "must be a valid id");
const createSchema = z.object({
  customer: objectId,
  type: z.enum(["call", "meeting", "visit", "note", "status", "campaign", "reward"]),
  summary: z.string().trim().min(1).max(500),
  details: z.string().trim().max(5000).optional(),
  outcome: z.string().trim().max(1000).optional(),
  occurredAt: z.coerce.date().optional(),
  nextFollowUpAt: z.coerce.date().nullable().optional(),
});

export const listByCustomer = [protect, requirePerm("customers:read"), async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
  const activities = await Activity.find({ customer: req.params.customerId })
    .populate("actor", "name email role")
    .sort({ occurredAt: -1, createdAt: -1 })
    .limit(limit);
  res.json({ activities });
}];

export const create = [protect, requirePerm("customers:write"), validate(createSchema), async (req, res) => {
  const customerExists = await Customer.exists({ _id: req.body.customer });
  if (!customerExists) return res.status(404).json({ message: "Customer not found" });

  const activity = await Activity.create({ ...req.body, actor: req.user._id });
  await activity.populate([
    { path: "customer", select: "name phone email tags" },
    { path: "actor", select: "name email role" },
  ]);
  res.status(201).json({ activity });
}];


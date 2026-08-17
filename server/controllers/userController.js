import bcrypt from "bcryptjs";
import { z } from "zod";

import User from "../models/User.js";
import { ROLES } from "../config/constants.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "../utils/audit.js";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const listUsers = [protect, requirePerm("users:manage"), async (req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  res.json({ users: users.map((u) => u.toSafeJSON()) });
}];

export const createUser = [protect, requirePerm("users:manage"), validate(createSchema), async (req, res) => {
  const { name, email, password, role } = req.body;

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) {
    return res.status(409).json({ message: "A user with this email already exists" });
  }

  const user = await User.create({
    name,
    email,
    role,
    passwordHash: await bcrypt.hash(password, 10),
  });

  await writeAudit({ req, action: "user.create", entity: "User", entityId: user._id });

  res.status(201).json({ user: user.toSafeJSON() });
}];

export const updateUser = [protect, requirePerm("users:manage"), validate(updateSchema), async (req, res) => {
  const user = await User.findById(req.params.id).select("+passwordHash");
  if (!user) return res.status(404).json({ message: "User not found" });

  const before = user.toSafeJSON();

  // Guardrails: the owner account cannot be demoted or deactivated by itself.
  if (user.role === "owner" && req.body.role && req.body.role !== "owner") {
    return res.status(400).json({ message: "The owner role cannot be changed" });
  }
  if (user._id.equals(req.user._id) && req.body.active === false) {
    return res.status(400).json({ message: "You cannot deactivate your own account" });
  }

  if (req.body.name) user.name = req.body.name;
  if (req.body.role) user.role = req.body.role;
  if (req.body.active != null) user.active = req.body.active;
  if (req.body.password) user.passwordHash = await bcrypt.hash(req.body.password, 10);

  await user.save();

  await writeAudit({
    req,
    action: "user.update",
    entity: "User",
    entityId: user._id,
    before,
    after: user.toSafeJSON(),
    fields: ["name", "role", "active"],
  });

  res.json({ user: user.toSafeJSON() });
}];

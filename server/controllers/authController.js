import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import User from "../models/User.js";
import { validate } from "../middleware/validate.js";
import { protect } from "../middleware/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

// Best-effort brute-force guard (per instance; serverless instances vary).
const failedAttempts = new Map();
const tooManyAttempts = (email) => {
  const entry = failedAttempts.get(email);
  return entry && entry.count >= 8 && Date.now() - entry.at < 10 * 60 * 1000;
};
const recordFailure = (email) => {
  const entry = failedAttempts.get(email);
  if (entry && Date.now() - entry.at < 10 * 60 * 1000) {
    entry.count += 1;
  } else {
    failedAttempts.set(email, { count: 1, at: Date.now() });
  }
};

export const login = [validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  if (tooManyAttempts(email)) {
    return res.status(429).json({ message: "Too many attempts. Try again in 10 minutes." });
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || !user.active) {
    recordFailure(email);
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    recordFailure(email);
    return res.status(401).json({ message: "Invalid email or password" });
  }

  failedAttempts.delete(email);

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({ token, user: user.toSafeJSON() });
}];

export const me = [protect, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
}];

export const changePassword = [protect, validate(changePasswordSchema), async (req, res) => {
  const user = await User.findById(req.user._id).select("+passwordHash");
  const ok = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  await user.save();
  res.json({ message: "Password updated" });
}];

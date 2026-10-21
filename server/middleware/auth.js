import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { PERMISSIONS } from "./permissions.js";

// Verifies the JWT and loads the user (server-enforced, PRD §20).
export const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.active) {
      return res.status(401).json({ message: "Account not found or deactivated" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
};

// For routes that are public but widen what they return for a signed-in user
// (GET /categories?all=1). A missing or bad token is not an error here — the
// caller is simply treated as anonymous. Verifying the token rather than
// trusting the presence of the header matters: the previous check was
// `Boolean(req.headers.authorization)`, so "Bearer nonsense" was enough to
// read the shop's hidden categories.
export const optionalProtect = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user && user.active) req.user = user;
  } catch {
    // Deliberately silent: the request proceeds as anonymous.
  }
  next();
};

// Checks the user's role against the permission matrix.
export const requirePerm = (perm) => (req, res, next) => {
  const allowed = PERMISSIONS[perm];
  if (!allowed) {
    return res.status(500).json({ message: `Unknown permission: ${perm}` });
  }
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ message: "You do not have permission to do this" });
  }
  next();
};


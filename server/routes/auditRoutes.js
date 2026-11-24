import express from "express";
import AuditLog from "../models/AuditLog.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { escapeSearchRegex } from "../utils/search.js";

const router = express.Router();

router.get("/", protect, requirePerm("audit:read"), async (req, res) => {
  const filter = {};
  if (req.query.entity) filter.entity = req.query.entity;
  if (req.query.search) {
    filter.$or = [
      { action: new RegExp(escapeSearchRegex(req.query.search), "i") },
      { "actor.name": new RegExp(escapeSearchRegex(req.query.search), "i") },
    ];
  }

  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(300);
  res.json({ logs });
});

export default router;


import express from "express";
import { protect, requirePerm } from "../middleware/auth.js";
import { migrateMedia, mediaMigrationStatus } from "../controllers/maintenanceController.js";

const router = express.Router();

// Owner-only. `catalog:write` is the permission that owns product imagery.
router.get("/media-migration", protect, requirePerm("catalog:write"), mediaMigrationStatus);
router.post("/media-migration", protect, requirePerm("catalog:write"), migrateMedia);

export default router;

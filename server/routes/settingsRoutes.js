import express from "express";
import { publicSettings, getSettings, updateSettings } from "../controllers/settingsController.js";
import { publicCache } from "../middleware/publicCache.js";

const router = express.Router();

// Store info and checkout rules: read on every page load, changes maybe once a
// month. A longer edge TTL is safe here.
router.get("/public", publicCache(300), publicSettings);
router.get("/", getSettings);
router.put("/", updateSettings);

export default router;


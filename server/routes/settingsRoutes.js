import express from "express";
import { publicSettings, getSettings, updateSettings } from "../controllers/settingsController.js";

const router = express.Router();

router.get("/public", publicSettings);
router.get("/", getSettings);
router.put("/", updateSettings);

export default router;

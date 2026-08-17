import express from "express";
import { upload, serve } from "../controllers/mediaController.js";

const router = express.Router();

router.post("/", upload);
router.get("/:id", serve);

export default router;

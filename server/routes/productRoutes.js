import express from "express";
import {
  listPublic,
  getPublic,
  listAdmin,
  getAdmin,
  create,
  update,
  archive,
  duplicate,
  bulkUpdate,
  exportCsv,
  importCsv,
} from "../controllers/productController.js";
import { publicCache } from "../middleware/publicCache.js";

const router = express.Router();

// Public menu endpoints. These are the two hottest reads on the site, so they
// are held at the edge for half a minute — long enough to absorb traffic, short
// enough that a catalogue edit still shows up almost immediately.
router.get("/", publicCache(30), listPublic);
router.get("/slug/:slug", publicCache(30), getPublic);

// Admin CMS endpoints
router.get("/admin", listAdmin);
router.get("/admin/:id", getAdmin);
router.post("/", create);
router.put("/:id", update);
router.post("/:id/archive", archive);
router.post("/:id/duplicate", duplicate);
router.post("/bulk", bulkUpdate);
router.get("/export.csv", exportCsv);
router.post("/import", importCsv);

export default router;


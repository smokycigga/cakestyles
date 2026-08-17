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

const router = express.Router();

// Public menu endpoints
router.get("/", listPublic);
router.get("/slug/:slug", getPublic);

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

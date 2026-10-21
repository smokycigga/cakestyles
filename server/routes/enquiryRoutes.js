import express from "express";
import {
  createPublic,
  createAdmin,
  list,
  getOne,
  updateStatus,
  addNote,
  convertToOrder,
} from "../controllers/enquiryController.js";

const router = express.Router();

router.post("/", createPublic);

router.get("/", list);
router.post("/admin", createAdmin);
router.get("/:id", getOne);
router.put("/:id/status", updateStatus);
router.post("/:id/notes", addNote);
router.post("/:id/convert", convertToOrder);

export default router;


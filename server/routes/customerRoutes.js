import express from "express";
import { list, getOne, update, addNote, create, exportCsv } from "../controllers/customerController.js";

const router = express.Router();

router.get("/", list);
router.get("/export.csv", exportCsv);
router.post("/", create);
router.get("/:id", getOne);
router.put("/:id", update);
router.post("/:id/notes", addNote);

export default router;

import express from "express";
import { list, create, update, remove, summary, exportCsv } from "../controllers/expenseController.js";

const router = express.Router();

router.get("/", list);
router.get("/summary", summary);
router.get("/export.csv", exportCsv);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;

import express from "express";
import { list, create, update, complete } from "../controllers/taskController.js";

const router = express.Router();

router.get("/", list);
router.get("/queue/:queue", list);
router.post("/", create);
router.put("/:id", update);
router.post("/:id/complete", complete);

export default router;

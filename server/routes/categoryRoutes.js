import express from "express";
import { list, create, update, remove } from "../controllers/categoryController.js";

const router = express.Router();

router.get("/", list);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;


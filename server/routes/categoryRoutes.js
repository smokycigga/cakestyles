import express from "express";
import { list, create, update, remove } from "../controllers/categoryController.js";
import { publicCache } from "../middleware/publicCache.js";

const router = express.Router();

// The chip row on the menu. Cached at the edge for anonymous visitors; an
// admin token bypasses the cache so ?all=1 keeps returning hidden categories.
router.get("/", publicCache(120), list);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;


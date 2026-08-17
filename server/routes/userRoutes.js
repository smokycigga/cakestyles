import express from "express";
import { listAssignableUsers, listUsers, createUser, updateUser } from "../controllers/userController.js";

const router = express.Router();

router.get("/", listUsers);
router.get("/assignable", listAssignableUsers);
router.post("/", createUser);
router.put("/:id", updateUser);

export default router;

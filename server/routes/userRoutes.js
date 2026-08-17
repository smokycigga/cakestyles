import express from "express";
import { listUsers, createUser, updateUser } from "../controllers/userController.js";

const router = express.Router();

router.get("/", listUsers);
router.post("/", createUser);
router.put("/:id", updateUser);

export default router;

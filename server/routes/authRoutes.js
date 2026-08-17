import express from "express";
import { login, me, changePassword } from "../controllers/authController.js";

const router = express.Router();

router.post("/login", login);
router.get("/me", me);
router.put("/password", changePassword);

export default router;
